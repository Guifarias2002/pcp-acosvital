
import { autenticar, logAcesso } from '@/lib/middleware';
export async function POST(req: Request, { params }: { params: { id: string } }) {
export const dynamic = 'force-dynamic';
import { autenticar, logAcesso } from '@/lib/middleware';
  const user = await autenticar(req);
export const dynamic = 'force-dynamic';
import { autenticar, logAcesso } from '@/lib/middleware';
  if (user instanceof NextResponse) return user;
export const dynamic = 'force-dynamic';

import { autenticar, logAcesso } from '@/lib/middleware';
  const itemId = Number(params.id);
export const dynamic = 'force-dynamic';
import { autenticar, logAcesso } from '@/lib/middleware';
  if (!Number.isInteger(itemId) || itemId <= 0)
export const dynamic = 'force-dynamic';
import { autenticar, logAcesso } from '@/lib/middleware';
    return NextResponse.json({ erro: 'ID invalido' }, { status: 400 });
export const dynamic = 'force-dynamic';

import { autenticar, logAcesso } from '@/lib/middleware';
  const [item] = await sql`
export const dynamic = 'force-dynamic';
import { autenticar, logAcesso } from '@/lib/middleware';
    SELECT i.*, p.roteiro_base FROM producao_itempedido i
export const dynamic = 'force-dynamic';
import { autenticar, logAcesso } from '@/lib/middleware';
    JOIN producao_pedido p ON p.id = i.pedido_id
export const dynamic = 'force-dynamic';
import { autenticar, logAcesso } from '@/lib/middleware';
    WHERE i.id = ${itemId}
export const dynamic = 'force-dynamic';
import { autenticar, logAcesso } from '@/lib/middleware';
  `;
export const dynamic = 'force-dynamic';
import { autenticar, logAcesso } from '@/lib/middleware';
  if (!item) return NextResponse.json({ erro: 'Item nao encontrado' }, { status: 404 });
export const dynamic = 'force-dynamic';

import { autenticar, logAcesso } from '@/lib/middleware';
  logAcesso(user, req, 'entregar');
export const dynamic = 'force-dynamic';
import { autenticar, logAcesso } from '@/lib/middleware';
  if (!user.is_staff && item.setor_atual !== user.setor)
export const dynamic = 'force-dynamic';
import { autenticar, logAcesso } from '@/lib/middleware';
    return NextResponse.json({ erro: 'Acesso negado' }, { status: 403 });
export const dynamic = 'force-dynamic';

import { autenticar, logAcesso } from '@/lib/middleware';
  const VALIDOS = ['finalizado_setor', 'aguardando', 'recebido', 'em_andamento', 'em_transito'];
export const dynamic = 'force-dynamic';
import { autenticar, logAcesso } from '@/lib/middleware';
  if (!VALIDOS.includes(item.status))
export const dynamic = 'force-dynamic';
import { autenticar, logAcesso } from '@/lib/middleware';
    return NextResponse.json({ erro: 'Item nao pode ser entregue neste status' }, { status: 400 });
export const dynamic = 'force-dynamic';

import { autenticar, logAcesso } from '@/lib/middleware';
  let formData: FormData;
export const dynamic = 'force-dynamic';
import { autenticar, logAcesso } from '@/lib/middleware';
  try { formData = await req.formData(); }
export const dynamic = 'force-dynamic';
import { autenticar, logAcesso } from '@/lib/middleware';
  catch { return NextResponse.json({ erro: 'Corpo da requisicao invalido' }, { status: 400 }); }
export const dynamic = 'force-dynamic';

import { autenticar, logAcesso } from '@/lib/middleware';
  const numeroNf = (formData.get('numero_nf') as string || '').trim();
export const dynamic = 'force-dynamic';
import { autenticar, logAcesso } from '@/lib/middleware';
  if (!numeroNf) return NextResponse.json({ erro: 'Numero da NF e obrigatorio' }, { status: 400 });
export const dynamic = 'force-dynamic';

import { autenticar, logAcesso } from '@/lib/middleware';
  const arquivo = formData.get('comprovante') as File | null;
export const dynamic = 'force-dynamic';
import { autenticar, logAcesso } from '@/lib/middleware';
  const observacao = (formData.get('observacao') as string || '').trim();
export const dynamic = 'force-dynamic';
import { autenticar, logAcesso } from '@/lib/middleware';
  const tipo = (formData.get('tipo') as string || null);
export const dynamic = 'force-dynamic';

import { autenticar, logAcesso } from '@/lib/middleware';
  const MAX_UPLOAD_BYTES = 10 * 1024 * 1024; // 10 MB
export const dynamic = 'force-dynamic';
import { autenticar, logAcesso } from '@/lib/middleware';
  const EXTENSOES_VALIDAS = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'pdf'];
export const dynamic = 'force-dynamic';
import { autenticar, logAcesso } from '@/lib/middleware';
  if (arquivo && arquivo.size > 0) {
export const dynamic = 'force-dynamic';
import { autenticar, logAcesso } from '@/lib/middleware';
    if (arquivo.size > MAX_UPLOAD_BYTES)
export const dynamic = 'force-dynamic';
import { autenticar, logAcesso } from '@/lib/middleware';
      return NextResponse.json({ erro: 'Arquivo muito grande. Máximo 10 MB.' }, { status: 400 });
export const dynamic = 'force-dynamic';
import { autenticar, logAcesso } from '@/lib/middleware';
    const ext = arquivo.name.split('.').pop()?.toLowerCase() || '';
export const dynamic = 'force-dynamic';
import { autenticar, logAcesso } from '@/lib/middleware';
    if (!EXTENSOES_VALIDAS.includes(ext))
export const dynamic = 'force-dynamic';
import { autenticar, logAcesso } from '@/lib/middleware';
      return NextResponse.json({ erro: 'Tipo de arquivo não permitido. Use JPG, PNG, PDF ou GIF.' }, { status: 400 });
export const dynamic = 'force-dynamic';
import { autenticar, logAcesso } from '@/lib/middleware';
  }
export const dynamic = 'force-dynamic';

import { autenticar, logAcesso } from '@/lib/middleware';
  let comprovanteUrl: string | null = null;
export const dynamic = 'force-dynamic';

import { autenticar, logAcesso } from '@/lib/middleware';
  if (arquivo && arquivo.size > 0 && process.env.SUPABASE_SERVICE_KEY && process.env.SUPABASE_URL) {
export const dynamic = 'force-dynamic';
import { autenticar, logAcesso } from '@/lib/middleware';
    try {
export const dynamic = 'force-dynamic';
import { autenticar, logAcesso } from '@/lib/middleware';
      const ext = arquivo.name.split('.').pop() || 'jpg';
export const dynamic = 'force-dynamic';
import { autenticar, logAcesso } from '@/lib/middleware';
      const path = `entregas/${item.pedido_id}/${itemId}_${Date.now()}.${ext}`;
export const dynamic = 'force-dynamic';
import { autenticar, logAcesso } from '@/lib/middleware';
      const buffer = await arquivo.arrayBuffer();
export const dynamic = 'force-dynamic';
import { autenticar, logAcesso } from '@/lib/middleware';
      const uploadRes = await fetch(`${process.env.SUPABASE_URL}/storage/v1/object/comprovantes/${path}`, {
export const dynamic = 'force-dynamic';
import { autenticar, logAcesso } from '@/lib/middleware';
        method: 'POST',
export const dynamic = 'force-dynamic';
import { autenticar, logAcesso } from '@/lib/middleware';
        headers: {
export const dynamic = 'force-dynamic';
import { autenticar, logAcesso } from '@/lib/middleware';
          'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_KEY}`,
export const dynamic = 'force-dynamic';
import { autenticar, logAcesso } from '@/lib/middleware';
          'Content-Type': arquivo.type || 'application/octet-stream',
export const dynamic = 'force-dynamic';
import { autenticar, logAcesso } from '@/lib/middleware';
          'x-upsert': 'true',
export const dynamic = 'force-dynamic';
import { autenticar, logAcesso } from '@/lib/middleware';
        },
export const dynamic = 'force-dynamic';
import { autenticar, logAcesso } from '@/lib/middleware';
        body: buffer,
export const dynamic = 'force-dynamic';
import { autenticar, logAcesso } from '@/lib/middleware';
      });
export const dynamic = 'force-dynamic';
import { autenticar, logAcesso } from '@/lib/middleware';
      if (uploadRes.ok) {
export const dynamic = 'force-dynamic';
import { autenticar, logAcesso } from '@/lib/middleware';
        comprovanteUrl = `${process.env.SUPABASE_URL}/storage/v1/object/public/comprovantes/${path}`;
export const dynamic = 'force-dynamic';
import { autenticar, logAcesso } from '@/lib/middleware';
      }
export const dynamic = 'force-dynamic';
import { autenticar, logAcesso } from '@/lib/middleware';
    } catch { /* upload failed, continue without file */ }
export const dynamic = 'force-dynamic';
import { autenticar, logAcesso } from '@/lib/middleware';
  }
export const dynamic = 'force-dynamic';

import { autenticar, logAcesso } from '@/lib/middleware';
  await sql.begin(async (tx) => {
export const dynamic = 'force-dynamic';
import { autenticar, logAcesso } from '@/lib/middleware';
    const [locked] = await tx`SELECT id, quantidade_entregue, quantidade_pendente FROM producao_itempedido WHERE id = ${itemId} FOR UPDATE`;
export const dynamic = 'force-dynamic';
import { autenticar, logAcesso } from '@/lib/middleware';
    const qtdEntregue = Number(locked.quantidade_entregue || 0) + Number(locked.quantidade_pendente);
export const dynamic = 'force-dynamic';

import { autenticar, logAcesso } from '@/lib/middleware';
    await tx`
export const dynamic = 'force-dynamic';
import { autenticar, logAcesso } from '@/lib/middleware';
      INSERT INTO producao_movimentacaoitem
export const dynamic = 'force-dynamic';
import { autenticar, logAcesso } from '@/lib/middleware';
        (item_id, pedido_id, usuario_id, setor_origem, setor_destino, status_anterior, status_novo, observacao, criado_em)
export const dynamic = 'force-dynamic';
import { autenticar, logAcesso } from '@/lib/middleware';
      VALUES (${itemId}, ${item.pedido_id}, ${user.id}, ${item.setor_atual}, '', ${item.status}, 'entregue',
export const dynamic = 'force-dynamic';
import { autenticar, logAcesso } from '@/lib/middleware';
              ${`NF: ${numeroNf}${observacao ? ' | ' + observacao : ''}`}, NOW())
export const dynamic = 'force-dynamic';
import { autenticar, logAcesso } from '@/lib/middleware';
    `;
export const dynamic = 'force-dynamic';

import { autenticar, logAcesso } from '@/lib/middleware';
    await tx`UPDATE producao_itempedido SET status='entregue', quantidade_entregue=${qtdEntregue}, atualizado_em=NOW() WHERE id=${itemId}`;
export const dynamic = 'force-dynamic';

import { autenticar, logAcesso } from '@/lib/middleware';
    await tx`
export const dynamic = 'force-dynamic';
import { autenticar, logAcesso } from '@/lib/middleware';
      INSERT INTO producao_entrega (pedido_id, item_id, usuario_id, numero_nf, comprovante_url, comprovante_tipo, observacao, criado_em)
export const dynamic = 'force-dynamic';
import { autenticar, logAcesso } from '@/lib/middleware';
      VALUES (${item.pedido_id}, ${itemId}, ${user.id}, ${numeroNf}, ${comprovanteUrl}, ${tipo}, ${observacao || null}, NOW())
export const dynamic = 'force-dynamic';
import { autenticar, logAcesso } from '@/lib/middleware';
    `;
export const dynamic = 'force-dynamic';

import { autenticar, logAcesso } from '@/lib/middleware';
    const [{ pendentes }] = await tx`
export const dynamic = 'force-dynamic';
import { autenticar, logAcesso } from '@/lib/middleware';
      SELECT COUNT(*) AS pendentes FROM producao_itempedido
export const dynamic = 'force-dynamic';
import { autenticar, logAcesso } from '@/lib/middleware';
      WHERE pedido_id = ${item.pedido_id} AND status != 'entregue'
export const dynamic = 'force-dynamic';
import { autenticar, logAcesso } from '@/lib/middleware';
    `;
export const dynamic = 'force-dynamic';
import { autenticar, logAcesso } from '@/lib/middleware';
    if (Number(pendentes) === 0) {
export const dynamic = 'force-dynamic';
import { autenticar, logAcesso } from '@/lib/middleware';
      await tx`UPDATE producao_pedido SET status='entregue', atualizado_em=NOW() WHERE id=${item.pedido_id}`;
export const dynamic = 'force-dynamic';
import { autenticar, logAcesso } from '@/lib/middleware';
    }
export const dynamic = 'force-dynamic';
import { autenticar, logAcesso } from '@/lib/middleware';
  });
export const dynamic = 'force-dynamic';

import { autenticar, logAcesso } from '@/lib/middleware';
  return NextResponse.json({ ok: true, comprovante_url: comprovanteUrl });
export const dynamic = 'force-dynamic';
import { autenticar, logAcesso } from '@/lib/middleware';
}
export const dynamic = 'force-dynamic';

import { autenticar, logAcesso } from '@/lib/middleware';
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
export const dynamic = 'force-dynamic';
import { autenticar, logAcesso } from '@/lib/middleware';
  const user = await autenticar(req);
export const dynamic = 'force-dynamic';
import { autenticar, logAcesso } from '@/lib/middleware';
  if (user instanceof NextResponse) return user;
export const dynamic = 'force-dynamic';

import { autenticar, logAcesso } from '@/lib/middleware';
  const itemId = Number(params.id);
export const dynamic = 'force-dynamic';
import { autenticar, logAcesso } from '@/lib/middleware';
  if (!Number.isInteger(itemId) || itemId <= 0)
export const dynamic = 'force-dynamic';
import { autenticar, logAcesso } from '@/lib/middleware';
    return NextResponse.json({ erro: 'ID invalido' }, { status: 400 });
export const dynamic = 'force-dynamic';

import { autenticar, logAcesso } from '@/lib/middleware';
  const [entrega] = await sql`
export const dynamic = 'force-dynamic';
import { autenticar, logAcesso } from '@/lib/middleware';
    SELECT e.*, i.pedido_id FROM producao_entrega e
export const dynamic = 'force-dynamic';
import { autenticar, logAcesso } from '@/lib/middleware';
    JOIN producao_itempedido i ON i.id = e.item_id
export const dynamic = 'force-dynamic';
import { autenticar, logAcesso } from '@/lib/middleware';
    WHERE e.item_id = ${itemId}
export const dynamic = 'force-dynamic';
import { autenticar, logAcesso } from '@/lib/middleware';
    ORDER BY e.criado_em DESC LIMIT 1
export const dynamic = 'force-dynamic';
import { autenticar, logAcesso } from '@/lib/middleware';
  `;
export const dynamic = 'force-dynamic';
import { autenticar, logAcesso } from '@/lib/middleware';
  if (!entrega) return NextResponse.json({ erro: 'Entrega nao encontrada' }, { status: 404 });
export const dynamic = 'force-dynamic';

import { autenticar, logAcesso } from '@/lib/middleware';
  let formData: FormData;
export const dynamic = 'force-dynamic';
import { autenticar, logAcesso } from '@/lib/middleware';
  try { formData = await req.formData(); }
export const dynamic = 'force-dynamic';
import { autenticar, logAcesso } from '@/lib/middleware';
  catch { return NextResponse.json({ erro: 'Corpo invalido' }, { status: 400 }); }
export const dynamic = 'force-dynamic';

import { autenticar, logAcesso } from '@/lib/middleware';
  const arquivo = formData.get('comprovante') as File | null;
export const dynamic = 'force-dynamic';
import { autenticar, logAcesso } from '@/lib/middleware';
  const tipo = (formData.get('tipo') as string || 'foto');
export const dynamic = 'force-dynamic';

import { autenticar, logAcesso } from '@/lib/middleware';
  if (!arquivo || arquivo.size === 0)
export const dynamic = 'force-dynamic';
import { autenticar, logAcesso } from '@/lib/middleware';
    return NextResponse.json({ erro: 'Arquivo e obrigatorio' }, { status: 400 });
export const dynamic = 'force-dynamic';

import { autenticar, logAcesso } from '@/lib/middleware';
  const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
export const dynamic = 'force-dynamic';
import { autenticar, logAcesso } from '@/lib/middleware';
  const EXTENSOES_VALIDAS = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'pdf'];
export const dynamic = 'force-dynamic';
import { autenticar, logAcesso } from '@/lib/middleware';
  if (arquivo.size > MAX_UPLOAD_BYTES)
export const dynamic = 'force-dynamic';
import { autenticar, logAcesso } from '@/lib/middleware';
    return NextResponse.json({ erro: 'Arquivo muito grande. Máximo 10 MB.' }, { status: 400 });
export const dynamic = 'force-dynamic';
import { autenticar, logAcesso } from '@/lib/middleware';
  const ext = arquivo.name.split('.').pop()?.toLowerCase() || '';
export const dynamic = 'force-dynamic';
import { autenticar, logAcesso } from '@/lib/middleware';
  if (!EXTENSOES_VALIDAS.includes(ext))
export const dynamic = 'force-dynamic';
import { autenticar, logAcesso } from '@/lib/middleware';
    return NextResponse.json({ erro: 'Tipo de arquivo não permitido. Use JPG, PNG, PDF ou GIF.' }, { status: 400 });
export const dynamic = 'force-dynamic';

import { autenticar, logAcesso } from '@/lib/middleware';
  let comprovanteUrl: string | null = null;
export const dynamic = 'force-dynamic';

import { autenticar, logAcesso } from '@/lib/middleware';
  if (process.env.SUPABASE_SERVICE_KEY && process.env.SUPABASE_URL) {
export const dynamic = 'force-dynamic';
import { autenticar, logAcesso } from '@/lib/middleware';
    try {
export const dynamic = 'force-dynamic';
import { autenticar, logAcesso } from '@/lib/middleware';
      const ext = arquivo.name.split('.').pop() || 'jpg';
export const dynamic = 'force-dynamic';
import { autenticar, logAcesso } from '@/lib/middleware';
      const path = `entregas/${entrega.pedido_id}/${itemId}_${Date.now()}.${ext}`;
export const dynamic = 'force-dynamic';
import { autenticar, logAcesso } from '@/lib/middleware';
      const buffer = await arquivo.arrayBuffer();
export const dynamic = 'force-dynamic';
import { autenticar, logAcesso } from '@/lib/middleware';
      const uploadRes = await fetch(`${process.env.SUPABASE_URL}/storage/v1/object/comprovantes/${path}`, {
export const dynamic = 'force-dynamic';
import { autenticar, logAcesso } from '@/lib/middleware';
        method: 'POST',
export const dynamic = 'force-dynamic';
import { autenticar, logAcesso } from '@/lib/middleware';
        headers: {
export const dynamic = 'force-dynamic';
import { autenticar, logAcesso } from '@/lib/middleware';
          'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_KEY}`,
export const dynamic = 'force-dynamic';
import { autenticar, logAcesso } from '@/lib/middleware';
          'Content-Type': arquivo.type || 'application/octet-stream',
export const dynamic = 'force-dynamic';
import { autenticar, logAcesso } from '@/lib/middleware';
          'x-upsert': 'true',
export const dynamic = 'force-dynamic';
import { autenticar, logAcesso } from '@/lib/middleware';
        },
export const dynamic = 'force-dynamic';
import { autenticar, logAcesso } from '@/lib/middleware';
        body: buffer,
export const dynamic = 'force-dynamic';
import { autenticar, logAcesso } from '@/lib/middleware';
      });
export const dynamic = 'force-dynamic';
import { autenticar, logAcesso } from '@/lib/middleware';
      if (uploadRes.ok) {
export const dynamic = 'force-dynamic';
import { autenticar, logAcesso } from '@/lib/middleware';
        comprovanteUrl = `${process.env.SUPABASE_URL}/storage/v1/object/public/comprovantes/${path}`;
export const dynamic = 'force-dynamic';
import { autenticar, logAcesso } from '@/lib/middleware';
      }
export const dynamic = 'force-dynamic';
import { autenticar, logAcesso } from '@/lib/middleware';
    } catch { /* upload failed */ }
export const dynamic = 'force-dynamic';
import { autenticar, logAcesso } from '@/lib/middleware';
  } else {
export const dynamic = 'force-dynamic';
import { autenticar, logAcesso } from '@/lib/middleware';
    // sem Supabase configurado — salva nome do arquivo como referência
export const dynamic = 'force-dynamic';
import { autenticar, logAcesso } from '@/lib/middleware';
    comprovanteUrl = arquivo.name;
export const dynamic = 'force-dynamic';
import { autenticar, logAcesso } from '@/lib/middleware';
  }
export const dynamic = 'force-dynamic';

import { autenticar, logAcesso } from '@/lib/middleware';
  if (!comprovanteUrl)
export const dynamic = 'force-dynamic';
import { autenticar, logAcesso } from '@/lib/middleware';
    return NextResponse.json({ erro: 'Falha no upload do arquivo' }, { status: 500 });
export const dynamic = 'force-dynamic';

import { autenticar, logAcesso } from '@/lib/middleware';
  await sql`
export const dynamic = 'force-dynamic';
import { autenticar, logAcesso } from '@/lib/middleware';
    UPDATE producao_entrega
export const dynamic = 'force-dynamic';
import { autenticar, logAcesso } from '@/lib/middleware';
    SET comprovante_url = ${comprovanteUrl}, comprovante_tipo = ${tipo}
export const dynamic = 'force-dynamic';
import { autenticar, logAcesso } from '@/lib/middleware';
    WHERE id = ${entrega.id}
export const dynamic = 'force-dynamic';
import { autenticar, logAcesso } from '@/lib/middleware';
  `;
export const dynamic = 'force-dynamic';

import { autenticar, logAcesso } from '@/lib/middleware';
  return NextResponse.json({ ok: true, comprovante_url: comprovanteUrl });
export const dynamic = 'force-dynamic';
import { autenticar, logAcesso } from '@/lib/middleware';
}
export const dynamic = 'force-dynamic';
