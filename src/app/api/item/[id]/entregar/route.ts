import { NextResponse } from 'next/server';
import sql from '@/lib/db';
import { autenticar, logAcesso } from '@/lib/middleware';
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
  if (!user.is_staff && item.setor_atual !== user.setor)
    return NextResponse.json({ erro: 'Acesso negado' }, { status: 403 });

  const VALIDOS = ['finalizado_setor', 'aguardando', 'recebido', 'em_andamento', 'em_transito'];
  if (!VALIDOS.includes(item.status))
    return NextResponse.json({ erro: 'Item nao pode ser entregue neste status' }, { status: 400 });

  let formData: FormData;
  try { formData = await req.formData(); }
  catch { return NextResponse.json({ erro: 'Corpo da requisicao invalido' }, { status: 400 }); }

  const numeroNf = (formData.get('numero_nf') as string || '').trim();
  if (!numeroNf) return NextResponse.json({ erro: 'Numero da NF e obrigatorio' }, { status: 400 });

  const arquivo = formData.get('comprovante') as File | null;
  const observacao = (formData.get('observacao') as string || '').trim();
  const tipo = (formData.get('tipo') as string || null);

  const MAX_UPLOAD_BYTES = 10 * 1024 * 1024; // 10 MB
  const EXTENSOES_VALIDAS = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'pdf'];
  if (arquivo && arquivo.size > 0) {
    if (arquivo.size > MAX_UPLOAD_BYTES)
      return NextResponse.json({ erro: 'Arquivo muito grande. Máximo 10 MB.' }, { status: 400 });
    const ext = arquivo.name.split('.').pop()?.toLowerCase() || '';
    if (!EXTENSOES_VALIDAS.includes(ext))
      return NextResponse.json({ erro: 'Tipo de arquivo não permitido. Use JPG, PNG, PDF ou GIF.' }, { status: 400 });
  }

  let comprovanteUrl: string | null = null;

  const supabaseUrl = (process.env.NEXT_PUBLIC_SUPABASE_URL || '').replace(/^﻿/, '');
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

  if (arquivo && arquivo.size > 0 && serviceKey && supabaseUrl) {
    try {
      const ext = arquivo.name.split('.').pop() || 'jpg';
      const path = `entregas/${item.pedido_id}/${itemId}_${Date.now()}.${ext}`;
      const buffer = await arquivo.arrayBuffer();
      const uploadRes = await fetch(`${supabaseUrl}/storage/v1/object/comprovantes/${path}`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
          'Content-Type': arquivo.type || 'application/octet-stream',
          'x-upsert': 'true',
        },
        body: buffer,
      });
      if (uploadRes.ok) {
        comprovanteUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/comprovantes/${path}`;
      }
    } catch { /* upload failed, continue without file */ }
  }

  await sql.begin(async (tx) => {
    const [locked] = await tx`SELECT id, quantidade_entregue, quantidade_pendente FROM producao_itempedido WHERE id = ${itemId} FOR UPDATE`;
    const qtdEntregue = Number(locked.quantidade_entregue || 0) + Number(locked.quantidade_pendente);

    await tx`
      INSERT INTO producao_movimentacaoitem
        (item_id, pedido_id, usuario_id, setor_origem, setor_destino, status_anterior, status_novo, observacao, criado_em)
      VALUES (${itemId}, ${item.pedido_id}, ${user.id}, ${item.setor_atual}, '', ${item.status}, 'entregue',
              ${`NF: ${numeroNf}${observacao ? ' | ' + observacao : ''}`}, NOW())
    `;

    await tx`UPDATE producao_itempedido SET status='entregue', quantidade_entregue=${qtdEntregue}, atualizado_em=NOW() WHERE id=${itemId}`;

    // Marca todas as parciais ativas do item como concluidas - sem isso, uma parcial
    // em_transito ficava orfa (travada nesse status para sempre apos a entrega).
    await tx`
      UPDATE producao_itemparcial
      SET status = 'concluida', concluido_em = COALESCE(concluido_em, NOW()), atualizado_em = NOW()
      WHERE item_pedido_id = ${itemId}
        AND status IN ('em_aberto', 'recebido', 'em_andamento', 'em_transito', 'pausado', 'finalizado_setor')
    `;

    await tx`
      INSERT INTO producao_entrega (pedido_id, item_id, usuario_id, numero_nf, comprovante_url, comprovante_tipo, observacao, criado_em)
      VALUES (${item.pedido_id}, ${itemId}, ${user.id}, ${numeroNf}, ${comprovanteUrl}, ${tipo}, ${observacao || null}, NOW())
    `;

    const [{ pendentes }] = await tx`
      SELECT COUNT(*) AS pendentes FROM producao_itempedido
      WHERE pedido_id = ${item.pedido_id} AND status != 'entregue'
    `;
    if (Number(pendentes) === 0) {
      await tx`UPDATE producao_pedido SET status='entregue', atualizado_em=NOW() WHERE id=${item.pedido_id}`;
    }
  });

  return NextResponse.json({ ok: true, comprovante_url: comprovanteUrl });
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
  if (!user.is_staff && entrega.setor_atual !== user.setor)
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
      }
    } catch { /* upload failed */ }
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