import { NextResponse } from 'next/server';
import sql from '@/lib/db';
import { autenticar } from '@/lib/middleware';
import { podePlanejar, podeAcessarSetor, isAdministrador, type JWTPayload } from '@/lib/auth';

export const dynamic = 'force-dynamic';

// Encaminhamentos de produção — comando FIXO do Planejamento (Reginaldo) pra
// Usinagem. GET lista os encaminhados do setor (qualquer um do setor vê); POST
// cria ou EDITA (upsert) o encaminhamento de um pedido (só planejador/admin).
// Desfazer é o DELETE em /api/encaminhamentos/[pedido].

function podeLer(user: JWTPayload, setor: string): boolean {
  return isAdministrador(user) || podePlanejar(user) || podeAcessarSetor(user, setor);
}

export async function GET(req: Request) {
  const user = await autenticar(req);
  if (user instanceof NextResponse) return user;

  const url = new URL(req.url);
  const setor = (url.searchParams.get('setor') || 'usinagem').trim();
  if (!podeLer(user, setor)) return NextResponse.json({ encaminhados: [] });

  try {
    const rows = await sql`
      SELECT e.pedido_id, e.setor, e.observacao, e.encaminhado_por_nome, e.encaminhado_em::text AS encaminhado_em,
             p.numero_pedido_venda, p.cliente, p.prioridade,
             (p.ordem_producao_url IS NOT NULL) AS tem_op
      FROM producao_encaminhamento e
      JOIN producao_pedido p ON p.id = e.pedido_id
      WHERE e.setor = ${setor}
      ORDER BY e.encaminhado_em DESC
      LIMIT 200
    `;
    return NextResponse.json({ encaminhados: rows });
  } catch (e) {
    console.error('[encaminhamentos GET]', e);
    return NextResponse.json({ encaminhados: [] });
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
    const observacao = typeof body.observacao === 'string' ? body.observacao.trim().slice(0, 500) : '';

    const [pedido] = await sql`SELECT id FROM producao_pedido WHERE id = ${pedidoId}`;
    if (!pedido) return NextResponse.json({ erro: 'Pedido não encontrado' }, { status: 404 });

    await sql`
      INSERT INTO producao_encaminhamento (pedido_id, setor, observacao, encaminhado_por_id, encaminhado_por_nome, encaminhado_em, atualizado_em)
      VALUES (${pedidoId}, ${setor}, ${observacao || null}, ${user.id}, ${user.nome || user.username}, NOW(), NOW())
      ON CONFLICT (pedido_id) DO UPDATE SET
        setor = EXCLUDED.setor,
        observacao = EXCLUDED.observacao,
        atualizado_em = NOW()
    `;
    return NextResponse.json({ ok: true, pedido_id: pedidoId });
  } catch (e) {
    console.error('[encaminhamentos POST]', e);
    return NextResponse.json({ erro: 'Erro ao encaminhar' }, { status: 500 });
  }
}
