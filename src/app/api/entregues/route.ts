
import { autenticar } from '@/lib/middleware';
export async function GET(req: Request) {
export const dynamic = 'force-dynamic';
import { autenticar } from '@/lib/middleware';
  const user = await autenticar(req);
export const dynamic = 'force-dynamic';
import { autenticar } from '@/lib/middleware';
  if (user instanceof NextResponse) return user;
export const dynamic = 'force-dynamic';
import { autenticar } from '@/lib/middleware';
  if (!user.is_staff) return NextResponse.json({ erro: 'Sem permissao' }, { status: 403 });
export const dynamic = 'force-dynamic';

import { autenticar } from '@/lib/middleware';
  const { searchParams } = new URL(req.url);
export const dynamic = 'force-dynamic';
import { autenticar } from '@/lib/middleware';
  const cliente = searchParams.get('cliente') || '';
export const dynamic = 'force-dynamic';

import { autenticar } from '@/lib/middleware';
  const pedidos = await sql`
export const dynamic = 'force-dynamic';
import { autenticar } from '@/lib/middleware';
    SELECT
export const dynamic = 'force-dynamic';
import { autenticar } from '@/lib/middleware';
      p.id, p.numero_pedido_venda, p.numero_op, p.cliente, p.vendedor,
export const dynamic = 'force-dynamic';
import { autenticar } from '@/lib/middleware';
      p.prazo_entrega::text, p.prioridade, p.status, p.setor_atual,
export const dynamic = 'force-dynamic';
import { autenticar } from '@/lib/middleware';
      COALESCE((SELECT SUM(i2.quantidade * COALESCE(i2.valor_unitario, 0)) FROM producao_itempedido i2 WHERE i2.pedido_id = p.id), 0)::text AS valor_calculado,
export const dynamic = 'force-dynamic';
import { autenticar } from '@/lib/middleware';
      p.criado_em, p.atualizado_em,
export const dynamic = 'force-dynamic';
import { autenticar } from '@/lib/middleware';
      p.nota_url, p.canhoto_url, p.anexo_pendente,
export const dynamic = 'force-dynamic';
import { autenticar } from '@/lib/middleware';
      COALESCE(
export const dynamic = 'force-dynamic';
import { autenticar } from '@/lib/middleware';
        json_agg(
export const dynamic = 'force-dynamic';
import { autenticar } from '@/lib/middleware';
          json_build_object(
export const dynamic = 'force-dynamic';
import { autenticar } from '@/lib/middleware';
            'id', i.id,
export const dynamic = 'force-dynamic';
import { autenticar } from '@/lib/middleware';
            'codigo', i.codigo,
export const dynamic = 'force-dynamic';
import { autenticar } from '@/lib/middleware';
            'descricao', i.descricao,
export const dynamic = 'force-dynamic';
import { autenticar } from '@/lib/middleware';
            'quantidade_pendente', i.quantidade_pendente::text,
export const dynamic = 'force-dynamic';
import { autenticar } from '@/lib/middleware';
            'quantidade_entregue', i.quantidade_entregue::text,
export const dynamic = 'force-dynamic';
import { autenticar } from '@/lib/middleware';
            'unidade', i.unidade,
export const dynamic = 'force-dynamic';
import { autenticar } from '@/lib/middleware';
            'status', i.status,
export const dynamic = 'force-dynamic';
import { autenticar } from '@/lib/middleware';
            'setor_atual', i.setor_atual
export const dynamic = 'force-dynamic';
import { autenticar } from '@/lib/middleware';
          ) ORDER BY i.codigo
export const dynamic = 'force-dynamic';
import { autenticar } from '@/lib/middleware';
        ) FILTER (WHERE i.id IS NOT NULL),
export const dynamic = 'force-dynamic';
import { autenticar } from '@/lib/middleware';
        '[]'
export const dynamic = 'force-dynamic';
import { autenticar } from '@/lib/middleware';
      ) AS itens,
export const dynamic = 'force-dynamic';
import { autenticar } from '@/lib/middleware';
      COALESCE(
export const dynamic = 'force-dynamic';
import { autenticar } from '@/lib/middleware';
        (SELECT json_agg(
export const dynamic = 'force-dynamic';
import { autenticar } from '@/lib/middleware';
          json_build_object(
export const dynamic = 'force-dynamic';
import { autenticar } from '@/lib/middleware';
            'id', e.id,
export const dynamic = 'force-dynamic';
import { autenticar } from '@/lib/middleware';
            'item_id', e.item_id,
export const dynamic = 'force-dynamic';
import { autenticar } from '@/lib/middleware';
            'numero_nf', e.numero_nf,
export const dynamic = 'force-dynamic';
import { autenticar } from '@/lib/middleware';
            'comprovante_url', e.comprovante_url,
export const dynamic = 'force-dynamic';
import { autenticar } from '@/lib/middleware';
            'comprovante_tipo', e.comprovante_tipo,
export const dynamic = 'force-dynamic';
import { autenticar } from '@/lib/middleware';
            'observacao', e.observacao,
export const dynamic = 'force-dynamic';
import { autenticar } from '@/lib/middleware';
            'criado_em', e.criado_em,
export const dynamic = 'force-dynamic';
import { autenticar } from '@/lib/middleware';
            'usuario_nome', u.nome
export const dynamic = 'force-dynamic';
import { autenticar } from '@/lib/middleware';
          ) ORDER BY e.criado_em DESC
export const dynamic = 'force-dynamic';
import { autenticar } from '@/lib/middleware';
        )
export const dynamic = 'force-dynamic';
import { autenticar } from '@/lib/middleware';
        FROM producao_entrega e
export const dynamic = 'force-dynamic';
import { autenticar } from '@/lib/middleware';
        LEFT JOIN usuarios_usuario u ON u.id = e.usuario_id
export const dynamic = 'force-dynamic';
import { autenticar } from '@/lib/middleware';
        WHERE e.pedido_id = p.id),
export const dynamic = 'force-dynamic';
import { autenticar } from '@/lib/middleware';
        '[]'
export const dynamic = 'force-dynamic';
import { autenticar } from '@/lib/middleware';
      ) AS comprovantes
export const dynamic = 'force-dynamic';
import { autenticar } from '@/lib/middleware';
    FROM producao_pedido p
export const dynamic = 'force-dynamic';
import { autenticar } from '@/lib/middleware';
    LEFT JOIN producao_itempedido i ON i.pedido_id = p.id
export const dynamic = 'force-dynamic';
import { autenticar } from '@/lib/middleware';
    WHERE (p.status = 'entregue' OR EXISTS (
export const dynamic = 'force-dynamic';
import { autenticar } from '@/lib/middleware';
      SELECT 1 FROM producao_itempedido ix WHERE ix.pedido_id = p.id AND ix.status = 'entregue'
export const dynamic = 'force-dynamic';
import { autenticar } from '@/lib/middleware';
    ))
export const dynamic = 'force-dynamic';
import { autenticar } from '@/lib/middleware';
      ${cliente ? sql`AND LOWER(p.cliente) LIKE ${'%' + cliente.toLowerCase() + '%'}` : sql``}
export const dynamic = 'force-dynamic';
import { autenticar } from '@/lib/middleware';
    GROUP BY p.id
export const dynamic = 'force-dynamic';
import { autenticar } from '@/lib/middleware';
    ORDER BY p.atualizado_em DESC
export const dynamic = 'force-dynamic';
import { autenticar } from '@/lib/middleware';
    LIMIT 100
export const dynamic = 'force-dynamic';
import { autenticar } from '@/lib/middleware';
  `;
export const dynamic = 'force-dynamic';

import { autenticar } from '@/lib/middleware';
  const [totais] = await sql`
export const dynamic = 'force-dynamic';
import { autenticar } from '@/lib/middleware';
    SELECT
export const dynamic = 'force-dynamic';
import { autenticar } from '@/lib/middleware';
      COUNT(DISTINCT p.id) AS total_pedidos,
export const dynamic = 'force-dynamic';
import { autenticar } from '@/lib/middleware';
      COUNT(i.id) AS total_itens,
export const dynamic = 'force-dynamic';
import { autenticar } from '@/lib/middleware';
      COALESCE(SUM((SELECT SUM(i2.quantidade * COALESCE(i2.valor_unitario, 0)) FROM producao_itempedido i2 WHERE i2.pedido_id = p.id)), 0)::text AS total_valor
export const dynamic = 'force-dynamic';
import { autenticar } from '@/lib/middleware';
    FROM producao_pedido p
export const dynamic = 'force-dynamic';
import { autenticar } from '@/lib/middleware';
    LEFT JOIN producao_itempedido i ON i.pedido_id = p.id
export const dynamic = 'force-dynamic';
import { autenticar } from '@/lib/middleware';
    WHERE (p.status = 'entregue' OR EXISTS (
export const dynamic = 'force-dynamic';
import { autenticar } from '@/lib/middleware';
      SELECT 1 FROM producao_itempedido ix WHERE ix.pedido_id = p.id AND ix.status = 'entregue'
export const dynamic = 'force-dynamic';
import { autenticar } from '@/lib/middleware';
    ))
export const dynamic = 'force-dynamic';
import { autenticar } from '@/lib/middleware';
      ${cliente ? sql`AND LOWER(p.cliente) LIKE ${'%' + cliente.toLowerCase() + '%'}` : sql``}
export const dynamic = 'force-dynamic';
import { autenticar } from '@/lib/middleware';
  `;
export const dynamic = 'force-dynamic';

import { autenticar } from '@/lib/middleware';
  const comCanhoto = pedidos.filter((p: any) => p.canhoto_url).length;
export const dynamic = 'force-dynamic';
import { autenticar } from '@/lib/middleware';
  const semCanhoto = Number(totais.total_pedidos) - comCanhoto;
export const dynamic = 'force-dynamic';

import { autenticar } from '@/lib/middleware';
  return NextResponse.json({
export const dynamic = 'force-dynamic';
import { autenticar } from '@/lib/middleware';
    pedidos,
export const dynamic = 'force-dynamic';
import { autenticar } from '@/lib/middleware';
    total_pedidos: Number(totais.total_pedidos),
export const dynamic = 'force-dynamic';
import { autenticar } from '@/lib/middleware';
    total_itens: Number(totais.total_itens),
export const dynamic = 'force-dynamic';
import { autenticar } from '@/lib/middleware';
    total_valor: totais.total_valor,
export const dynamic = 'force-dynamic';
import { autenticar } from '@/lib/middleware';
    canhotos_assinados: comCanhoto,
export const dynamic = 'force-dynamic';
import { autenticar } from '@/lib/middleware';
    canhotos_pendentes: semCanhoto,
export const dynamic = 'force-dynamic';
import { autenticar } from '@/lib/middleware';
  });
export const dynamic = 'force-dynamic';
import { autenticar } from '@/lib/middleware';
}
export const dynamic = 'force-dynamic';
