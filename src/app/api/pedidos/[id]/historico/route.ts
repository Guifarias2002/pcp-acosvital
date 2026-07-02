import { NextResponse } from 'next/server';
import sql from '@/lib/db';
import { autenticar } from '@/lib/middleware';

export const dynamic = 'force-dynamic';
export async function GET(req: Request, { params }: { params: { id: string } }) {
  try {
    const user = await autenticar(req);
    if (user instanceof NextResponse) return user;

    const pedidoId = Number(params.id);
    if (!Number.isInteger(pedidoId) || pedidoId <= 0)
      return NextResponse.json({ erro: 'ID invalido' }, { status: 400 });

    const [pedido] = await sql`SELECT id FROM producao_pedido WHERE id = ${pedidoId}`;
    if (!pedido) return NextResponse.json({ erro: 'Pedido nao encontrado' }, { status: 404 });

    const movimentacoes = await sql`
      SELECT
        m.id, m.item_id,
        m.setor_origem, m.setor_destino,
        m.status_anterior, m.status_novo,
        m.observacao,
        m.criado_em::text,
        u.nome AS usuario_nome,
        i.codigo AS item_codigo
      FROM producao_movimentacaoitem m
      LEFT JOIN usuarios_usuario u ON u.id = m.usuario_id
      LEFT JOIN producao_itempedido i ON i.id = m.item_id
      WHERE m.pedido_id = ${pedidoId}
      ORDER BY m.criado_em DESC
    `;

    return NextResponse.json({ movimentacoes });
  } catch (e) {
    console.error('[pedidos/historico]', e);
    return NextResponse.json({ erro: 'Erro interno' }, { status: 500 });
  }
}