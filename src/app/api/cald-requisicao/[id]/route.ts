import { NextResponse } from 'next/server';
import sql from '@/lib/db';
import { autenticar } from '@/lib/middleware';
import { podeRegistrarRequisicao, SITUACAO_REQ, type SituacaoReq } from '@/lib/requisicaoHrm';

export const dynamic = 'force-dynamic';

// PATCH  → atualiza a situação da compra (criada | comprado | nao_comprar | chegou)
//          + nº do pedido de compra / previsão de chegada / motivo / obs / nº.
// DELETE → apaga uma requisição registrada por engano.
type Ctx = { params: { id: string } };
const dataOk = (v: unknown) => (/^\d{4}-\d{2}-\d{2}$/.test(String(v || '')) ? String(v) : null);
const txt = (v: unknown, max: number) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null);

export async function PATCH(req: Request, ctx: Ctx) {
  const user = await autenticar(req);
  if (user instanceof NextResponse) return user;
  if (!podeRegistrarRequisicao(user)) return NextResponse.json({ erro: 'Sem permissão' }, { status: 403 });
  const id = Number(ctx.params.id);
  if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ erro: 'Requisição inválida' }, { status: 400 });
  let b: Record<string, unknown>;
  try { b = await req.json(); } catch { return NextResponse.json({ erro: 'JSON inválido' }, { status: 400 }); }
  const set: Record<string, unknown> = {};
  if ('situacao' in b) {
    const s = String(b.situacao) as SituacaoReq;
    if (!SITUACAO_REQ[s]) return NextResponse.json({ erro: 'Situação inválida' }, { status: 400 });
    set.situacao = s;
    set.chegou_em = s === 'chegou' ? (dataOk(b.chegou_em) || new Date().toISOString().slice(0, 10)) : null;
  }
  if ('numero' in b) { const n = txt(b.numero, 60); if (n) set.numero = n; }
  if ('pedido_compra' in b) set.pedido_compra = txt(b.pedido_compra, 60);
  if ('previsao_chegada' in b) set.previsao_chegada = dataOk(b.previsao_chegada);
  if ('motivo' in b) set.motivo = txt(b.motivo, 500);
  if ('obs' in b) set.obs = txt(b.obs, 1000);
  if (!Object.keys(set).length) return NextResponse.json({ ok: true });
  set.atualizado_por_nome = user.nome || user.username;
  try {
    const r = await sql`UPDATE producao_cald_requisicao SET ${sql(set)}, atualizado_em = NOW() WHERE id = ${id} RETURNING id`;
    if (!r.length) return NextResponse.json({ erro: 'Requisição não encontrada' }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('[cald-requisicao PATCH]', e);
    return NextResponse.json({ erro: 'Erro ao salvar' }, { status: 500 });
  }
}

export async function DELETE(req: Request, ctx: Ctx) {
  const user = await autenticar(req);
  if (user instanceof NextResponse) return user;
  if (!podeRegistrarRequisicao(user)) return NextResponse.json({ erro: 'Sem permissão' }, { status: 403 });
  const id = Number(ctx.params.id);
  if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ erro: 'Requisição inválida' }, { status: 400 });
  try {
    await sql`DELETE FROM producao_cald_requisicao WHERE id = ${id}`;
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('[cald-requisicao DELETE]', e);
    return NextResponse.json({ erro: 'Erro ao apagar' }, { status: 500 });
  }
}
