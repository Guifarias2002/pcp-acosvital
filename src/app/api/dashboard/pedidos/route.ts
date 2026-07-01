import { NextResponse } from 'next/server';
import sql from '@/lib/db';
import { autenticar } from '@/lib/middleware';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const user = await autenticar(req);
  if (user instanceof NextResponse) return user;
  if (!user.is_staff) return NextResponse.json({ erro: 'Sem permissao' }, { status: 403 });

  // Duas queries simples em paralelo em vez de CTE com json_agg
  const [pedidos, itens] = await Promise.all([
    sql`
      SELECT p.id, p.numero_pedido_venda, p.numero_op, p.cliente, p.vendedor,
             p.prazo_entrega::text, p.prioridade, p.status, p.setor_atual,
             p.prazo_entrega < NOW()::date AS atrasado
      FROM producao_pedido p
      WHERE p.status != 'entregue'
      ORDER BY p.prazo_entrega ASC, p.criado_em DESC
      LIMIT 100
    `,
    sql`
      SELECT i.pedido_id, i.id, i.codigo, i.descricao,
             i.quantidade_pendente::text AS quantidade_pendente,
             i.unidade, i.status, i.setor_atual
      FROM producao_itempedido i
      WHERE i.pedido_id IN (
        SELECT id FROM producao_pedido WHERE status != 'entregue' LIMIT 100
      )
    `,
  ]);

  type ItemRow = (typeof itens)[0];
  // Agrupa itens por pedido no JS (evita json_agg no DB)
  const itensPorPedido: Record<number, ItemRow[]> = {};
  for (const item of itens) {
    const pid = Number(item.pedido_id);
    if (!itensPorPedido[pid]) itensPorPedido[pid] = [];
    itensPorPedido[pid].push(item);
  }

  const resultado = pedidos.map(p => ({
    ...p,
    valor_calculado: '0',
    setores_parciais: [],
    itens: itensPorPedido[Number(p.id)] ?? [],
  }));

  return NextResponse.json({ pedidos: resultado });
}
