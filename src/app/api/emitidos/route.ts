import { NextResponse } from 'next/server';
import sql from '@/lib/db';
import { autenticar } from '@/lib/middleware';
import { formatPedido, queryItens } from '@/lib/queries';

export const dynamic = 'force-dynamic';
export async function GET(req: Request) {
  const user = await autenticar(req);
  if (user instanceof NextResponse) return user;
  if (!user.is_staff) return NextResponse.json({ erro: 'Sem permissao' }, { status: 403 });
  const { searchParams } = new URL(req.url);
  const cliente = searchParams.get('cliente') || '';
  const prioridade = searchParams.get('prioridade') || '';
  const setor = searchParams.get('setor') || '';

  const rows = await sql`
    SELECT p.*, u.nome AS criado_por_nome,
           COALESCE((SELECT SUM(i2.quantidade * COALESCE(i2.valor_unitario,0)) FROM producao_itempedido i2 WHERE i2.pedido_id = p.id), 0)::text AS valor_calculado
    FROM producao_pedido p
    LEFT JOIN usuarios_usuario u ON u.id = p.criado_por_id
    WHERE p.status != 'entregue'
      AND (${cliente} = '' OR p.cliente ILIKE ${'%' + cliente + '%'})
      AND (${prioridade} = '' OR p.prioridade = ${prioridade})
    ORDER BY p.criado_em DESC
  `;

  const pedidos = await Promise.all(rows.map(async (r) => {
    const itens = await queryItens(r.id);
    if (setor && !itens.some(i => i.setor_atual === setor)) return null;
    return formatPedido(r, itens);
  }));

  const result = pedidos.filter(Boolean);
  const total_valor = result.reduce((s, p) => s + Number(p!.valor_calculado || 0), 0);

  return NextResponse.json({
    pedidos: result,
    total_pedidos: result.length,
    total_itens: result.reduce((s, p) => s + p!.itens.length, 0),
    total_valor: total_valor.toFixed(2),
  });
}