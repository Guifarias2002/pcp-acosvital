/**
 * POST /api/pedidos/[id]/entregar
 *
 * Entrega o PEDIDO COMPLETO de uma vez a partir da Logística: marca como
 * entregues todos os itens do pedido que já estão na Logística (e não têm
 * saldo ativo em outro setor), conclui as parciais e fecha o pedido se não
 * sobrar nada pendente.
 *
 * Sem NF (decisão de produto): a entrega é comprovada pelo(s) canhoto(s)
 * anexados ao pedido — por isso NÃO grava em producao_entrega (que exige NF
 * por constraint de hardening). O rastro de quem/quando fica na
 * producao_movimentacaoitem, igual à entrega por item.
 *
 * Body: multipart/form-data
 *   canhotos: File[]   (0+ arquivos — imagem/pdf, até 10 MB cada)
 *   observacao: string (opcional)
 *
 * Idempotente (header Idempotency-Key): um reenvio devolve o resultado
 * anterior em vez de re-entregar / re-anexar.
 */
import { NextResponse } from 'next/server';
import sql from '@/lib/db';
import { autenticar, logAcesso } from '@/lib/middleware';
import { podeAcessarSetor } from '@/lib/auth';
import { checkMutationRateLimit, getClientIp } from '@/lib/rateLimit';
import { comIdempotencia, chaveIdempotencia } from '@/lib/idempotencia';

export const dynamic = 'force-dynamic';

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024; // 10 MB por arquivo
const EXTENSOES_VALIDAS = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'pdf'];

export async function POST(req: Request, ctx: { params: { id: string } }) {
  return comIdempotencia(
    chaveIdempotencia(req),
    { metodo: 'POST', caminho: `pedidos/${ctx.params.id}/entregar` },
    () => handlePOST(req, ctx),
  );
}

async function handlePOST(req: Request, { params }: { params: { id: string } }) {
  const user = await autenticar(req);
  if (user instanceof NextResponse) return user;

  if (!user.is_staff && !podeAcessarSetor(user, 'logistica'))
    return NextResponse.json({ erro: 'Sem permissão para entregar (Logística)' }, { status: 403 });

  if (!checkMutationRateLimit(getClientIp(req)))
    return NextResponse.json({ erro: 'Muitas requisicoes' }, { status: 429 });

  const pedidoId = Number(params.id);
  if (!Number.isInteger(pedidoId) || pedidoId <= 0)
    return NextResponse.json({ erro: 'ID inválido' }, { status: 400 });

  logAcesso(user, req, 'entregar_pedido');

  let formData: FormData;
  try { formData = await req.formData(); }
  catch { return NextResponse.json({ erro: 'Corpo da requisição inválido' }, { status: 400 }); }

  const observacao = (formData.get('observacao') as string || '').trim();
  const arquivos = formData.getAll('canhotos').filter((f): f is File => f instanceof File && f.size > 0);

  // Valida os arquivos antes de qualquer escrita
  for (const arq of arquivos) {
    if (arq.size > MAX_UPLOAD_BYTES)
      return NextResponse.json({ erro: `Arquivo "${arq.name}" muito grande (máx 10 MB)` }, { status: 400 });
    const ext = arq.name.split('.').pop()?.toLowerCase() || '';
    if (!EXTENSOES_VALIDAS.includes(ext))
      return NextResponse.json({ erro: `Tipo de arquivo não permitido em "${arq.name}". Use JPG, PNG, PDF ou GIF.` }, { status: 400 });
  }

  // Itens elegíveis: do pedido, ainda não entregues, presentes na Logística e
  // SEM saldo ativo em outro setor (mesmo critério da fila da Logística).
  const elegiveis = await sql`
    SELECT i.id, i.codigo, i.descricao, i.unidade,
           i.quantidade::float AS quantidade,
           i.quantidade_pendente::float AS pendente,
           i.status, i.setor_atual
    FROM producao_itempedido i
    WHERE i.pedido_id = ${pedidoId}
      AND i.status <> 'entregue'
      AND i.inativo = false
      AND NOT EXISTS (
        SELECT 1 FROM producao_itemparcial pa
        WHERE pa.item_pedido_id = i.id
          AND pa.setor_atual <> 'logistica'
          AND pa.status NOT IN ('cancelada', 'concluida')
      )
      AND (
        i.setor_atual = 'logistica'
        OR EXISTS (
          SELECT 1 FROM producao_itemparcial pa2
          WHERE pa2.item_pedido_id = i.id
            AND pa2.setor_atual = 'logistica'
            AND pa2.status NOT IN ('cancelada', 'concluida')
        )
      )
    ORDER BY i.codigo
  `;

  if (elegiveis.length === 0)
    return NextResponse.json({ erro: 'Nenhum item deste pedido está na Logística pronto para entrega.' }, { status: 400 });

  // Upload dos canhotos para o Storage (bucket comprovantes) — fora da tx.
  const supabaseUrl = (process.env.NEXT_PUBLIC_SUPABASE_URL || '').replace(/^﻿/, '');
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  const canhotoUrls: string[] = [];
  for (let i = 0; i < arquivos.length; i++) {
    const arq = arquivos[i];
    if (serviceKey && supabaseUrl) {
      try {
        const ext = arq.name.split('.').pop() || 'jpg';
        const path = `entregas/${pedidoId}/canhoto_${Date.now()}_${i}.${ext}`;
        const buffer = await arq.arrayBuffer();
        const up = await fetch(`${supabaseUrl}/storage/v1/object/comprovantes/${path}`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${serviceKey}`,
            'Content-Type': arq.type || 'application/octet-stream',
            'x-upsert': 'true',
          },
          body: buffer,
        });
        if (up.ok) canhotoUrls.push(`${supabaseUrl}/storage/v1/object/public/comprovantes/${path}`);
        else console.error('[entregar_pedido] upload canhoto falhou:', up.status, await up.text().catch(() => ''));
      } catch (e) { console.error('[entregar_pedido] erro no upload do canhoto:', e); }
    } else {
      // Sem Supabase configurado — guarda o nome como referência (mesmo fallback do item).
      canhotoUrls.push(arq.name);
    }
  }

  const idsEntregues: number[] = [];
  let pedidoFechado = false;

  await sql.begin(async (tx) => {
    for (const item of elegiveis) {
      // Trava por item (mesmo namespace de mover/enviar/apontar) — serializa
      // contra uma entrega por item concorrente do mesmo item.
      await (tx as unknown as typeof sql)`SELECT pg_advisory_xact_lock(778899, ${item.id})`;

      const [locked] = await tx`
        SELECT status, quantidade_entregue::float AS entregue, quantidade_pendente::float AS pendente
        FROM producao_itempedido WHERE id = ${item.id} FOR UPDATE
      `;
      if (!locked || locked.status === 'entregue') continue; // já entregue por outra via

      const qtdEntregue = Number(locked.entregue || 0) + Number(locked.pendente || 0);

      await tx`
        UPDATE producao_itempedido
        SET status = 'entregue', quantidade_entregue = ${qtdEntregue}, atualizado_em = NOW()
        WHERE id = ${item.id}
      `;

      // Conclui as parciais ativas do item (evita parcial órfã travada).
      await tx`
        UPDATE producao_itemparcial
        SET status = 'concluida', concluido_em = COALESCE(concluido_em, NOW()), atualizado_em = NOW()
        WHERE item_pedido_id = ${item.id}
          AND status IN ('em_aberto', 'recebido', 'em_andamento', 'em_transito', 'pausado', 'finalizado_setor')
      `;

      await tx`
        INSERT INTO producao_movimentacaoitem
          (item_id, pedido_id, usuario_id, setor_origem, setor_destino,
           status_anterior, status_novo, observacao, criado_em)
        VALUES
          (${item.id}, ${pedidoId}, ${user.id}, ${item.setor_atual || 'logistica'}, '',
           ${item.status}, 'entregue',
           ${`Entrega do pedido completo${observacao ? ' | ' + observacao : ''}${canhotoUrls.length ? ` | ${canhotoUrls.length} canhoto(s)` : ''}`},
           NOW())
      `;

      idsEntregues.push(Number(item.id));
    }

    // Anexa os canhotos ao pedido (lista + primeiro em canhoto_url p/ compat).
    if (canhotoUrls.length > 0) {
      await tx`
        UPDATE producao_pedido
        SET canhotos = array_cat(COALESCE(canhotos, '{}'), ${canhotoUrls}),
            canhoto_url = COALESCE(canhoto_url, ${canhotoUrls[0]}),
            anexo_pendente = FALSE,
            atualizado_em = NOW()
        WHERE id = ${pedidoId}
      `;
    }

    // Fecha o pedido se não sobrou nenhum item pendente.
    const [{ pendentes }] = await tx`
      SELECT COUNT(*)::int AS pendentes FROM producao_itempedido
      WHERE pedido_id = ${pedidoId} AND status <> 'entregue' AND inativo = false
    `;
    if (Number(pendentes) === 0) {
      await tx`UPDATE producao_pedido SET status = 'entregue', atualizado_em = NOW() WHERE id = ${pedidoId}`;
      pedidoFechado = true;
    }
  });

  return NextResponse.json({
    ok: true,
    entregues: idsEntregues.length,
    itens_entregues: idsEntregues,
    canhotos_anexados: canhotoUrls.length,
    pedido_fechado: pedidoFechado,
    mensagem: `${idsEntregues.length} ${idsEntregues.length === 1 ? 'item entregue' : 'itens entregues'}${pedidoFechado ? ' — pedido fechado' : ''}.`,
  });
}
