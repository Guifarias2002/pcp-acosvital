import { NextResponse } from 'next/server';
import sql from '@/lib/db';
import { autenticar } from '@/lib/middleware';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const user = await autenticar(req);
  if (user instanceof NextResponse) return user;
  if (!user.is_staff) return NextResponse.json({ erro: 'Sem permissao' }, { status: 403 });

  const pedidos = await sql`
    WITH sp AS (
      SELECT ii.pedido_id, json_agg(DISTINCT pa.setor_atual) AS setores_parciais
      FROM producao_itemparcial pa
      JOIN producao_itempedido ii ON ii.id = pa.item_pedido_id
      WHERE pa.status NOT IN ('cancelada', 'concluida')
      GROUP BY ii.pedido_id
    ),
    iv AS (
      SELECT pedido_id, SUM(quantidade * COALESCE(valor_unitario, 0)) AS valor_total
      FROM producao_itempedido
      GROUP BY pedido_id
    )
    SELECT p.id, p.numero_pedido_venda, p.numero_op, p.cliente, p.vendedor,
           p.prazo_entrega::text, p.prioridade, p.status, p.setor_atual,
           COALESCE(iv.valor_total, 0)::text AS valor_calculado,
           p.prazo_entrega < NOW()::date     AS atrasado,
           COALESCE(sp.setores_parciais, '[]'::json) AS setores_parciais,
           COALESCE(
             json_agg(
               json_build_object(
                 'id',                i.id,
                 'codigo',            i.codigo,
                 'descricao',         i.descricao,
                 'quantidade_pendente', i.quantidade_pendente::text,
                 'unidade',           i.unidade,
                 'status',            i.status,
                 'setor_atual',       i.setor_atual
               ) ORDER BY i.codigo
             ) FILTER (WHERE i.id IS NOT NULL),
             '[]'
           ) AS itens
    FROM producao_pedido p
    LEFT JOIN producao_itempedido i ON i.pedido_id = p.id
    LEFT JOIN iv ON iv.pedido_id = p.id
    LEFT JOIN sp ON sp.pedido_id = p.id
    GROUP BY p.id, iv.valor_total, sp.setores_parciais
    ORDER BY (p.status = 'entregue') ASC, p.prazo_entrega ASC, p.criado_em DESC
    LIMIT 100
  `;

  return NextResponse.json({ pedidos });
}
