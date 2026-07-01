import { NextResponse } from 'next/server';
import sql from '@/lib/db';
import { autenticar } from '@/lib/middleware';

export const dynamic = 'force-dynamic';
export async function GET(req: Request) {
  const user = await autenticar(req);
  if (user instanceof NextResponse) return user;
  if (!user.is_staff) return NextResponse.json({ erro: 'Sem permissao' }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const cliente = searchParams.get('cliente') || '';

  const pedidos = await sql`
    SELECT
      p.id, p.numero_pedido_venda, p.numero_op, p.cliente, p.vendedor,
      p.prazo_entrega::text, p.prioridade, p.status, p.setor_atual,
      COALESCE((SELECT SUM(i2.quantidade * COALESCE(i2.valor_unitario, 0)) FROM producao_itempedido i2 WHERE i2.pedido_id = p.id), 0)::text AS valor_calculado,
      p.criado_em, p.atualizado_em,
      p.nota_url, p.canhoto_url, p.anexo_pendente,
      COALESCE(
        json_agg(
          json_build_object(
            'id', i.id,
            'codigo', i.codigo,
            'descricao', i.descricao,
            'quantidade_pendente', i.quantidade_pendente::text,
            'quantidade_entregue', i.quantidade_entregue::text,
            'unidade', i.unidade,
            'status', i.status,
            'setor_atual', i.setor_atual
          ) ORDER BY i.codigo
        ) FILTER (WHERE i.id IS NOT NULL),
        '[]'
      ) AS itens,
      COALESCE(
        (SELECT json_agg(
          json_build_object(
            'id', e.id,
            'item_id', e.item_id,
            'numero_nf', e.numero_nf,
            'comprovante_url', e.comprovante_url,
            'comprovante_tipo', e.comprovante_tipo,
            'observacao', e.observacao,
            'criado_em', e.criado_em,
            'usuario_nome', u.nome
          ) ORDER BY e.criado_em DESC
        )
        FROM producao_entrega e
        LEFT JOIN usuarios_usuario u ON u.id = e.usuario_id
        WHERE e.pedido_id = p.id),
        '[]'
      ) AS comprovantes
    FROM producao_pedido p
    LEFT JOIN producao_itempedido i ON i.pedido_id = p.id
    WHERE (p.status = 'entregue' OR EXISTS (
      SELECT 1 FROM producao_itempedido ix WHERE ix.pedido_id = p.id AND ix.status = 'entregue'
    ))
      ${cliente ? sql`AND LOWER(p.cliente) LIKE ${'%' + cliente.toLowerCase() + '%'}` : sql``}
    GROUP BY p.id
    ORDER BY p.atualizado_em DESC
    LIMIT 100
  `;

  const [totais] = await sql`
    SELECT
      COUNT(DISTINCT p.id) AS total_pedidos,
      COUNT(i.id) AS total_itens,
      COALESCE(SUM((SELECT SUM(i2.quantidade * COALESCE(i2.valor_unitario, 0)) FROM producao_itempedido i2 WHERE i2.pedido_id = p.id)), 0)::text AS total_valor
    FROM producao_pedido p
    LEFT JOIN producao_itempedido i ON i.pedido_id = p.id
    WHERE (p.status = 'entregue' OR EXISTS (
      SELECT 1 FROM producao_itempedido ix WHERE ix.pedido_id = p.id AND ix.status = 'entregue'
    ))
      ${cliente ? sql`AND LOWER(p.cliente) LIKE ${'%' + cliente.toLowerCase() + '%'}` : sql``}
  `;

  const comCanhoto = pedidos.filter((p: any) => p.canhoto_url).length;
  const semCanhoto = Number(totais.total_pedidos) - comCanhoto;

  return NextResponse.json({
    pedidos,
    total_pedidos: Number(totais.total_pedidos),
    total_itens: Number(totais.total_itens),
    total_valor: totais.total_valor,
    canhotos_assinados: comCanhoto,
    canhotos_pendentes: semCanhoto,
  });
}