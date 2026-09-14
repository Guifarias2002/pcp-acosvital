import { NextResponse } from 'next/server';
import sql from '@/lib/db';
import { autenticar } from '@/lib/middleware';
import { podePlanejar, podeAcessarSetor, isAdministrador, type JWTPayload } from '@/lib/auth';

export const dynamic = 'force-dynamic';

// Avisos de produção ("caixa de mensagens" do Planejamento pra Usinagem).
// GET  ?setor=usinagem  → lista os avisos PENDENTES (não vistos) do setor.
// POST { pedido_id, mensagem?, setor? } → cria um aviso (só planejador/admin).

// Quem pode LER a caixa de um setor: admin, planejador, ou quem tem o setor.
function podeLer(user: JWTPayload, setor: string): boolean {
  return isAdministrador(user) || podePlanejar(user) || podeAcessarSetor(user, setor);
}

export async function GET(req: Request) {
  const user = await autenticar(req);
  if (user instanceof NextResponse) return user;

  const url = new URL(req.url);
  const setor = (url.searchParams.get('setor') || 'usinagem').trim();
  if (!podeLer(user, setor)) return NextResponse.json({ avisos: [] });

  try {
    const rows = await sql`
      SELECT a.id, a.pedido_id, a.setor, a.mensagem, a.criado_por_nome, a.criado_em::text AS criado_em,
             p.numero_pedido_venda, p.cliente, p.prioridade
      FROM producao_aviso a
      LEFT JOIN producao_pedido p ON p.id = a.pedido_id
      WHERE a.setor = ${setor} AND a.visto = false
      ORDER BY a.criado_em DESC
      LIMIT 100
    `;
    return NextResponse.json({ avisos: rows });
  } catch (e) {
    console.error('[avisos GET]', e);
    return NextResponse.json({ avisos: [] });
  }
}

export async function POST(req: Request) {
  const user = await autenticar(req);
  if (user instanceof NextResponse) return user;
  if (!podePlanejar(user)) return NextResponse.json({ erro: 'Sem permissao' }, { status: 403 });

  try {
    const body = await req.json().catch(() => ({}));
    const pedidoId = Number(body.pedido_id);
    if (!Number.isInteger(pedidoId) || pedidoId <= 0)
      return NextResponse.json({ erro: 'Pedido inválido' }, { status: 400 });
    const setor = typeof body.setor === 'string' && body.setor.trim() ? body.setor.trim() : 'usinagem';
    const mensagem = typeof body.mensagem === 'string' ? body.mensagem.trim().slice(0, 500) : '';

    const [pedido] = await sql`SELECT id FROM producao_pedido WHERE id = ${pedidoId}`;
    if (!pedido) return NextResponse.json({ erro: 'Pedido não encontrado' }, { status: 404 });

    const [aviso] = await sql`
      INSERT INTO producao_aviso (pedido_id, setor, mensagem, criado_por_id, criado_por_nome, criado_em)
      VALUES (${pedidoId}, ${setor}, ${mensagem || null}, ${user.id}, ${user.nome || user.username}, NOW())
      RETURNING id, criado_em::text AS criado_em
    `;
    return NextResponse.json({ ok: true, id: aviso.id, criado_em: aviso.criado_em });
  } catch (e) {
    console.error('[avisos POST]', e);
    return NextResponse.json({ erro: 'Erro ao criar o aviso' }, { status: 500 });
  }
}
