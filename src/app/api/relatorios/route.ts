import { NextResponse } from 'next/server';
import sql from '@/lib/db';
import { autenticar } from '@/lib/middleware';
import { nomeSector } from '@/lib/queries';
import { withTimeout } from '@/lib/queryTimeout';

export const dynamic = 'force-dynamic';
export async function GET(req: Request) {
  try {
  const user = await autenticar(req);
  if (user instanceof NextResponse) return user;
  if (!user.is_staff) return NextResponse.json({ erro: 'Sem permissao' }, { status: 403 });

  const qPorSetor = sql`
      SELECT m.setor_destino AS setor, COUNT(*) AS total,
             COALESCE(EXTRACT(EPOCH FROM AVG(
               CASE WHEN m2.criado_em IS NOT NULL THEN m2.criado_em - m.criado_em END
             ))/3600, 0)::numeric(10,1) AS tempo_medio_h
      FROM producao_movimentacaoitem m
      LEFT JOIN producao_movimentacaoitem m2 ON m2.item_id = m.item_id
        AND m2.setor_origem = m.setor_destino AND m2.criado_em > m.criado_em
      WHERE m.setor_destino != ''
      GROUP BY m.setor_destino ORDER BY total DESC LIMIT 20
    `;
  const qPorProduto = sql`
      SELECT i.codigo, COUNT(*) AS total,
             COALESCE(SUM(i.valor_unitario * i.quantidade), 0)::text AS valor_total
      FROM producao_itempedido i WHERE i.inativo = false GROUP BY i.codigo ORDER BY total DESC LIMIT 15
    `;
  const qTopClientes = sql`
      SELECT p.cliente, COUNT(DISTINCT p.id) AS total,
             COALESCE(SUM(p.valor_total), 0)::text AS valor
      FROM producao_pedido p GROUP BY p.cliente ORDER BY total DESC LIMIT 10
    `;

  const [porSetor, porProduto, topClientes] = await withTimeout(
    Promise.all([qPorSetor, qPorProduto, qTopClientes]),
    27000, // 27s — Vercel mata em 30s (temporario, ver vercel.json)
    [qPorSetor, qPorProduto, qTopClientes],
  );

  return NextResponse.json({
    por_setor: porSetor.map(s => ({ setor: s.setor, nome: nomeSector(s.setor), total: Number(s.total), tempo_medio_h: Number(s.tempo_medio_h) })),
    por_produto: porProduto.map(p => ({ codigo: p.codigo, total: Number(p.total), valor_total: p.valor_total })),
    top_clientes: topClientes.map(c => ({ cliente: c.cliente, total: Number(c.total), valor: c.valor })),
  });
  } catch (e) {
    console.error('[relatorios]', e);
    return NextResponse.json({ erro: 'Erro ao carregar relatorios' }, { status: 500 });
  }
}