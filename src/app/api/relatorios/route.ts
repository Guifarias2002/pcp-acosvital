
import { nomeSector } from '@/lib/queries';
export async function GET(req: Request) {
export const dynamic = 'force-dynamic';
import { nomeSector } from '@/lib/queries';
  const user = await autenticar(req);
export const dynamic = 'force-dynamic';
import { nomeSector } from '@/lib/queries';
  if (user instanceof NextResponse) return user;
export const dynamic = 'force-dynamic';
import { nomeSector } from '@/lib/queries';
  if (!user.is_staff) return NextResponse.json({ erro: 'Sem permissao' }, { status: 403 });
export const dynamic = 'force-dynamic';

import { nomeSector } from '@/lib/queries';
  const [porSetor, porProduto, topClientes] = await Promise.all([
export const dynamic = 'force-dynamic';
import { nomeSector } from '@/lib/queries';
    sql`
export const dynamic = 'force-dynamic';
import { nomeSector } from '@/lib/queries';
      SELECT m.setor_destino AS setor, COUNT(*) AS total,
export const dynamic = 'force-dynamic';
import { nomeSector } from '@/lib/queries';
             COALESCE(EXTRACT(EPOCH FROM AVG(
export const dynamic = 'force-dynamic';
import { nomeSector } from '@/lib/queries';
               CASE WHEN m2.criado_em IS NOT NULL THEN m2.criado_em - m.criado_em END
export const dynamic = 'force-dynamic';
import { nomeSector } from '@/lib/queries';
             ))/3600, 0)::numeric(10,1) AS tempo_medio_h
export const dynamic = 'force-dynamic';
import { nomeSector } from '@/lib/queries';
      FROM producao_movimentacaoitem m
export const dynamic = 'force-dynamic';
import { nomeSector } from '@/lib/queries';
      LEFT JOIN producao_movimentacaoitem m2 ON m2.item_id = m.item_id
export const dynamic = 'force-dynamic';
import { nomeSector } from '@/lib/queries';
        AND m2.setor_origem = m.setor_destino AND m2.criado_em > m.criado_em
export const dynamic = 'force-dynamic';
import { nomeSector } from '@/lib/queries';
      WHERE m.setor_destino != ''
export const dynamic = 'force-dynamic';
import { nomeSector } from '@/lib/queries';
      GROUP BY m.setor_destino ORDER BY total DESC LIMIT 20
export const dynamic = 'force-dynamic';
import { nomeSector } from '@/lib/queries';
    `,
export const dynamic = 'force-dynamic';
import { nomeSector } from '@/lib/queries';
    sql`
export const dynamic = 'force-dynamic';
import { nomeSector } from '@/lib/queries';
      SELECT i.codigo, COUNT(*) AS total,
export const dynamic = 'force-dynamic';
import { nomeSector } from '@/lib/queries';
             COALESCE(SUM(i.valor_unitario * i.quantidade), 0)::text AS valor_total
export const dynamic = 'force-dynamic';
import { nomeSector } from '@/lib/queries';
      FROM producao_itempedido i GROUP BY i.codigo ORDER BY total DESC LIMIT 15
export const dynamic = 'force-dynamic';
import { nomeSector } from '@/lib/queries';
    `,
export const dynamic = 'force-dynamic';
import { nomeSector } from '@/lib/queries';
    sql`
export const dynamic = 'force-dynamic';
import { nomeSector } from '@/lib/queries';
      SELECT p.cliente, COUNT(DISTINCT p.id) AS total,
export const dynamic = 'force-dynamic';
import { nomeSector } from '@/lib/queries';
             COALESCE(SUM(p.valor_total), 0)::text AS valor
export const dynamic = 'force-dynamic';
import { nomeSector } from '@/lib/queries';
      FROM producao_pedido p GROUP BY p.cliente ORDER BY total DESC LIMIT 10
export const dynamic = 'force-dynamic';
import { nomeSector } from '@/lib/queries';
    `,
export const dynamic = 'force-dynamic';
import { nomeSector } from '@/lib/queries';
  ]);
export const dynamic = 'force-dynamic';

import { nomeSector } from '@/lib/queries';
  return NextResponse.json({
export const dynamic = 'force-dynamic';
import { nomeSector } from '@/lib/queries';
    por_setor: porSetor.map(s => ({ setor: s.setor, nome: nomeSector(s.setor), total: Number(s.total), tempo_medio_h: Number(s.tempo_medio_h) })),
export const dynamic = 'force-dynamic';
import { nomeSector } from '@/lib/queries';
    por_produto: porProduto.map(p => ({ codigo: p.codigo, total: Number(p.total), valor_total: p.valor_total })),
export const dynamic = 'force-dynamic';
import { nomeSector } from '@/lib/queries';
    top_clientes: topClientes.map(c => ({ cliente: c.cliente, total: Number(c.total), valor: c.valor })),
export const dynamic = 'force-dynamic';
import { nomeSector } from '@/lib/queries';
  });
export const dynamic = 'force-dynamic';
import { nomeSector } from '@/lib/queries';
}
export const dynamic = 'force-dynamic';
