import { NextResponse } from 'next/server';
import sql from '@/lib/db';
import { autenticar, logAcesso } from '@/lib/middleware';
import { podeAcessarSetor } from '@/lib/auth';
import { checkMutationRateLimit, getClientIp } from '@/lib/rateLimit';

export const dynamic = 'force-dynamic';
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const user = await autenticar(req);
  if (user instanceof NextResponse) return user;

  if (!checkMutationRateLimit(getClientIp(req)))
    return NextResponse.json({ erro: 'Muitas requisicoes' }, { status: 429 });

  const itemId = Number(params.id);
  if (!Number.isInteger(itemId) || itemId <= 0)
    return NextResponse.json({ erro: 'ID invalido' }, { status: 400 });

  const [item] = await sql`
    SELECT i.*, p.roteiro_base FROM producao_itempedido i
    JOIN producao_pedido p ON p.id = i.pedido_id
    WHERE i.id = ${itemId}
  `;
  if (!item) return NextResponse.json({ erro: 'Item nao encontrado' }, { status: 404 });

  logAcesso(user, req, 'entregar');
  // A entrega sempre parte da Logística — checa acesso à Logística, não ao
  // setor_atual "oficial" do item, que fica desatualizado quando o item está
  // dividido em parciais (parte na Logística, parte ainda em produção).
  if (!user.is_staff && !podeAcessarSetor(user, 'logistica'))
    return NextResponse.json({ erro: 'Acesso negado' }, { status: 403 });

  const VALIDOS = ['finalizado_setor', 'aguardando', 'recebido', 'em_andamento', 'em_transito'];
  if (!VALIDOS.includes(item.status))
    return NextResponse.json({ erro: 'Item nao pode ser entregue neste status' }, { status: 400 });

  // Parciais deste item hoje na Logística — é só isso que esta ação entrega.
  // Se o item nunca foi dividido em parciais (peça única, fluxo legado), cai
  // no comportamento antigo: entrega o saldo pendente do item inteiro.
  const parciaisDoItem = await sql`
    SELECT id, quantidade::float AS quantidade, setor_atual, status
    FROM producao_itemparcial WHERE item_pedido_id = ${itemId}
  `;
  const parciaisLogistica = parciaisDoItem.filter(p =>
    p.setor_atual === 'logistica' &&
    ['em_aberto', 'recebido', 'em_andamento', 'em_transito', 'pausado', 'finalizado_setor'].includes(p.status as string));

  let qtdEntregarAgora: number;
  if (parciaisDoItem.length > 0) {
    if (parciaisLogistica.length === 0)
      return NextResponse.json({ erro: 'Nada deste item está na Logística pronto para entrega no momento.' }, { status: 400 });
    qtdEntregarAgora = parciaisLogistica.reduce((s, p) => s + Number(p.quantidade), 0);
  } else {
    if (item.setor_atual !== 'logistica')
      return NextResponse.json({ erro: 'Item não está na Logística.' }, { status: 400 });
    qtdEntregarAgora = Number(item.quantidade_pendente);
  }
  if (qtdEntregarAgora <= 0)
    return NextResponse.json({ erro: 'Nada a entregar.' }, { status: 400 });

  let formData: FormData;
  try { formData = await req.formData(); }
  catch { return NextResponse.json({ erro: 'Corpo da requisicao invalido' }, { status: 400 }); }

  // Formato novo: "entregas" = JSON [{numero_nf}, ...] + arquivos indexados
  // comprovante_0, comprovante_1, ... (um por NF, opcional). Mantém compat com
  // o formato antigo (numero_nf + comprovante únicos) caso algum cliente velho
  // ainda esteja em cache.
  const entregasRaw = formData.get('entregas') as string | null;
  let entregas: { numeroNf: string }[];
  if (entregasRaw) {
    try {
      const parsed = JSON.parse(entregasRaw);
      if (!Array.isArray(parsed) || parsed.length === 0) throw new Error('vazio');
      entregas = parsed.map((e: { numero_nf?: string }) => ({ numeroNf: (e.numero_nf || '').trim() }));
    } catch {
      return NextResponse.json({ erro: 'Lista de notas fiscais inválida' }, { status: 400 });
    }
  } else {
    const numeroNfLegado = (formData.get('numero_nf') as string || '').trim();
    entregas = [{ numeroNf: numeroNfLegado }];
  }
  if (entregas.some(e => !e.numeroNf))
    return NextResponse.json({ erro: 'Numero da NF e obrigatorio' }, { status: 400 });

  const observacao = (formData.get('observacao') as string || '').trim();

  const MAX_UPLOAD_BYTES = 10 * 1024 * 1024; // 10 MB
  const EXTENSOES_VALIDAS = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'pdf'];
  const arquivos: (File | null)[] = entregas.map((_, i) =>
    (formData.get(`comprovante_${i}`) as File | null) || (i === 0 ? (formData.get('comprovante') as File | null) : null));
  const tipos: (string | null)[] = entregas.map((_, i) =>
    (formData.get(`tipo_${i}`) as string | null) || (i === 0 ? (formData.get('tipo') as string | null) : null));

  for (const arq of arquivos) {
    if (!arq || arq.size === 0) continue;
    if (arq.size > MAX_UPLOAD_BYTES)
      return NextResponse.json({ erro: `Arquivo "${arq.name}" muito grande. Máximo 10 MB.` }, { status: 400 });
    const ext = arq.name.split('.').pop()?.toLowerCase() || '';
    if (!EXTENSOES_VALIDAS.includes(ext))
      return NextResponse.json({ erro: `Tipo de arquivo não permitido em "${arq.name}". Use JPG, PNG, PDF ou GIF.` }, { status: 400 });
  }

  const supabaseUrl = (process.env.NEXT_PUBLIC_SUPABASE_URL || '').replace(/^﻿/, '');
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

  const comprovanteUrls: (string | null)[] = [];
  for (let i = 0; i < arquivos.length; i++) {
    const arq = arquivos[i];
    if (!arq || arq.size === 0 || !serviceKey || !supabaseUrl) { comprovanteUrls.push(null); continue; }
    try {
      const ext = arq.name.split('.').pop() || 'jpg';
      const path = `entregas/${item.pedido_id}/${itemId}_${Date.now()}_${i}.${ext}`;
      const buffer = await arq.arrayBuffer();
      const uploadRes = await fetch(`${supabaseUrl}/storage/v1/object/comprovantes/${path}`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${serviceKey}`,
          'Content-Type': arq.type || 'application/octet-stream',
          'x-upsert': 'true',
        },
        body: buffer,
      });
      if (uploadRes.ok) {
        comprovanteUrls.push(`${supabaseUrl}/storage/v1/object/public/comprovantes/${path}`);
      } else {
        console.error('[entregar] upload comprovante falhou:', uploadRes.status, await uploadRes.text().catch(() => ''));
        comprovanteUrls.push(null);
      }
    } catch (e) { console.error('[entregar] erro no upload do comprovante:', e); comprovanteUrls.push(null); }
  }

  let itemFechado = false;
  await sql.begin(async (tx) => {
    const [locked] = await tx`
      SELECT quantidade::float AS total, COALESCE(quantidade_entregue::float,0) AS entregue,
             COALESCE(quantidade_pendente::float,0) AS pendente, status
      FROM producao_itempedido WHERE id = ${itemId} FOR UPDATE
    `;
    const novaEntregue = Number(locked.entregue) + qtdEntregarAgora;
    const novoPendente = Math.max(0, Number(locked.pendente) - qtdEntregarAgora);
    itemFechado = novaEntregue >= Number(locked.total) - 0.001;
    const novoStatus = itemFechado ? 'entregue' : locked.status;

    await tx`
      INSERT INTO producao_movimentacaoitem
        (item_id, pedido_id, usuario_id, setor_origem, setor_destino, status_anterior, status_novo, observacao, criado_em)
      VALUES (${itemId}, ${item.pedido_id}, ${user.id}, 'logistica', ${itemFechado ? '' : 'logistica'}, ${locked.status}, ${novoStatus},
              ${`NF${entregas.length > 1 ? 's' : ''}: ${entregas.map(e => e.numeroNf).join(', ')} | ${qtdEntregarAgora} ${item.unidade} entregues da Logística${itemFechado ? ' — item concluído' : ''}${observacao ? ' | ' + observacao : ''}`}, NOW())
    `;

    await tx`
      UPDATE producao_itempedido
      SET status = ${novoStatus}, quantidade_entregue = ${novaEntregue}, quantidade_pendente = ${novoPendente}, atualizado_em = NOW()
      WHERE id = ${itemId}
    `;

    // Marca só as parciais que estavam na Logística e foram de fato entregues
    // agora — as que ainda estão em outro setor (ex.: Usinagem) continuam ativas.
    if (parciaisLogistica.length > 0) {
      const idsEntregues = parciaisLogistica.map(p => p.id);
      await tx`
        UPDATE producao_itemparcial
        SET status = 'concluida', concluido_em = COALESCE(concluido_em, NOW()), atualizado_em = NOW()
        WHERE id = ANY(${idsEntregues})
      `;
    }

    for (let i = 0; i < entregas.length; i++) {
      await tx`
        INSERT INTO producao_entrega (pedido_id, item_id, usuario_id, numero_nf, comprovante_url, comprovante_tipo, observacao, quantidade, criado_em)
        VALUES (${item.pedido_id}, ${itemId}, ${user.id}, ${entregas[i].numeroNf}, ${comprovanteUrls[i]}, ${tipos[i]}, ${observacao || null}, ${qtdEntregarAgora}, NOW())
      `;
    }

    if (itemFechado) {
      const [{ pendentes }] = await tx`
        SELECT COUNT(*) AS pendentes FROM producao_itempedido
        WHERE pedido_id = ${item.pedido_id} AND status != 'entregue' AND inativo = false
      `;
      if (Number(pendentes) === 0) {
        await tx`UPDATE producao_pedido SET status='entregue', atualizado_em=NOW() WHERE id=${item.pedido_id}`;
      }
    }
  });

  return NextResponse.json({ ok: true, comprovante_urls: comprovanteUrls, entregue_agora: qtdEntregarAgora, item_fechado: itemFechado });
}

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const user = await autenticar(req);
  if (user instanceof NextResponse) return user;

  if (!checkMutationRateLimit(getClientIp(req)))
    return NextResponse.json({ erro: 'Muitas requisicoes' }, { status: 429 });

  const itemId = Number(params.id);
  if (!Number.isInteger(itemId) || itemId <= 0)
    return NextResponse.json({ erro: 'ID invalido' }, { status: 400 });

  const [entrega] = await sql`
    SELECT e.*, i.pedido_id, i.setor_atual FROM producao_entrega e
    JOIN producao_itempedido i ON i.id = e.item_id
    WHERE e.item_id = ${itemId}
    ORDER BY e.criado_em DESC LIMIT 1
  `;
  if (!entrega) return NextResponse.json({ erro: 'Entrega nao encontrada' }, { status: 404 });

  logAcesso(user, req, 'entregar_comprovante');
  if (!user.is_staff && !podeAcessarSetor(user, entrega.setor_atual))
    return NextResponse.json({ erro: 'Acesso negado' }, { status: 403 });

  let formData: FormData;
  try { formData = await req.formData(); }
  catch { return NextResponse.json({ erro: 'Corpo invalido' }, { status: 400 }); }

  const arquivo = formData.get('comprovante') as File | null;
  const tipo = (formData.get('tipo') as string || 'foto');

  if (!arquivo || arquivo.size === 0)
    return NextResponse.json({ erro: 'Arquivo e obrigatorio' }, { status: 400 });

  const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
  const EXTENSOES_VALIDAS = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'pdf'];
  if (arquivo.size > MAX_UPLOAD_BYTES)
    return NextResponse.json({ erro: 'Arquivo muito grande. Máximo 10 MB.' }, { status: 400 });
  const ext = arquivo.name.split('.').pop()?.toLowerCase() || '';
  if (!EXTENSOES_VALIDAS.includes(ext))
    return NextResponse.json({ erro: 'Tipo de arquivo não permitido. Use JPG, PNG, PDF ou GIF.' }, { status: 400 });

  let comprovanteUrl: string | null = null;

  const supabaseUrlPatch = (process.env.NEXT_PUBLIC_SUPABASE_URL || '').replace(/^﻿/, '');
  const serviceKeyPatch = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

  if (serviceKeyPatch && supabaseUrlPatch) {
    try {
      const ext = arquivo.name.split('.').pop() || 'jpg';
      const path = `entregas/${entrega.pedido_id}/${itemId}_${Date.now()}.${ext}`;
      const buffer = await arquivo.arrayBuffer();
      const uploadRes = await fetch(`${supabaseUrlPatch}/storage/v1/object/comprovantes/${path}`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${serviceKeyPatch}`,
          'Content-Type': arquivo.type || 'application/octet-stream',
          'x-upsert': 'true',
        },
        body: buffer,
      });
      if (uploadRes.ok) {
        comprovanteUrl = `${supabaseUrlPatch}/storage/v1/object/public/comprovantes/${path}`;
      } else {
        console.error('[entregar_comprovante] upload falhou:', uploadRes.status, await uploadRes.text().catch(() => ''));
      }
    } catch (e) { console.error('[entregar_comprovante] erro no upload:', e); }
  } else {
    // sem Supabase configurado — salva nome do arquivo como referência
    comprovanteUrl = arquivo.name;
  }

  if (!comprovanteUrl)
    return NextResponse.json({ erro: 'Falha no upload do arquivo' }, { status: 500 });

  await sql`
    UPDATE producao_entrega
    SET comprovante_url = ${comprovanteUrl}, comprovante_tipo = ${tipo}
    WHERE id = ${entrega.id}
  `;

  return NextResponse.json({ ok: true, comprovante_url: comprovanteUrl });
}