import { NextResponse } from 'next/server';
import sql from '@/lib/db';
import { autenticar } from '@/lib/middleware';
import { podeRegistrarRequisicao } from '@/lib/requisicaoHrm';

export const dynamic = 'force-dynamic';

// Requisições HRM de um ou vários pedidos.
// GET  ?pedidos=1,2,3 → { requisicoes: [...] } (qualquer usuário logado lê).
// POST { pedido_id, numero, data?, itens: number[], obs? } → cria (Alan/staff/setor).
// Tabela da M57; sem ela, GET devolve vazio.

export async function GET(req: Request) {
  const user = await autenticar(req);
  if (user instanceof NextResponse) return user;
  const ids = (new URL(req.url).searchParams.get('pedidos') || '')
    .split(',').map(Number).filter(n => Number.isInteger(n) && n > 0).slice(0, 300);
  if (!ids.length) return NextResponse.json({ requisicoes: [] });
  try {
    const rows = await sql`
      SELECT id, pedido_id, numero, data::text AS data, itens, situacao, pedido_compra,
             previsao_chegada::text AS previsao_chegada, chegou_em::text AS chegou_em, motivo, obs,
             criado_por_nome, criado_em, atualizado_por_nome, atualizado_em
      FROM producao_cald_requisicao
      WHERE pedido_id = ANY(${ids}::int[])
      ORDER BY pedido_id, criado_em
    `;
    return NextResponse.json({ requisicoes: rows });
  } catch (e) {
    console.error('[cald-requisicao GET]', e);
    return NextResponse.json({ requisicoes: [] });
  }
}

export async function POST(req: Request) {
  const user = await autenticar(req);
  if (user instanceof NextResponse) return user;
  if (!podeRegistrarRequisicao(user)) return NextResponse.json({ erro: 'Sem permissão pra registrar requisição' }, { status: 403 });
  let b: Record<string, unknown>;
  try { b = await req.json(); } catch { return NextResponse.json({ erro: 'JSON inválido' }, { status: 400 }); }
  const pedidoId = Number(b.pedido_id);
  const numero = String(b.numero || '').trim().slice(0, 60);
  const data = /^\d{4}-\d{2}-\d{2}$/.test(String(b.data || '')) ? String(b.data) : new Date().toISOString().slice(0, 10);
  const itens = Array.isArray(b.itens) ? (b.itens as unknown[]).map(Number).filter(n => Number.isInteger(n) && n > 0) : [];
  const obs = typeof b.obs === 'string' && b.obs.trim() ? b.obs.trim().slice(0, 1000) : null;
  if (!Number.isInteger(pedidoId) || pedidoId <= 0) return NextResponse.json({ erro: 'Pedido inválido' }, { status: 400 });
  if (!numero) return NextResponse.json({ erro: 'Informe o nº da requisição (Omie)' }, { status: 400 });
  if (!itens.length) return NextResponse.json({ erro: 'Selecione ao menos um item' }, { status: 400 });
  const quem = user.nome || user.username;
  try {
    // Só itens deste pedido.
    const validos = await sql`SELECT id FROM producao_itempedido WHERE pedido_id = ${pedidoId} AND id = ANY(${itens}::int[])`;
    const ok = validos.map(r => r.id as number);
    if (!ok.length) return NextResponse.json({ erro: 'Itens não pertencem ao pedido' }, { status: 400 });
    const [r] = await sql`
      INSERT INTO producao_cald_requisicao (pedido_id, numero, data, itens, obs, criado_por_nome, atualizado_por_nome)
      VALUES (${pedidoId}, ${numero}, ${data}, ${ok}::int[], ${obs}, ${quem}, ${quem})
      RETURNING id
    `;
    return NextResponse.json({ ok: true, id: r.id });
  } catch (e) {
    console.error('[cald-requisicao POST]', e);
    return NextResponse.json({ erro: 'Erro ao registrar a requisição' }, { status: 500 });
  }
}
