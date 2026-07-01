
import { formatPedido, queryItens } from '@/lib/queries';
export async function GET(req: Request) {
export const dynamic = 'force-dynamic';
import { formatPedido, queryItens } from '@/lib/queries';
  const user = await autenticar(req);
export const dynamic = 'force-dynamic';
import { formatPedido, queryItens } from '@/lib/queries';
  if (user instanceof NextResponse) return user;
export const dynamic = 'force-dynamic';
import { formatPedido, queryItens } from '@/lib/queries';
  if (!user.is_staff) return NextResponse.json({ erro: 'Sem permissao' }, { status: 403 });
export const dynamic = 'force-dynamic';
import { formatPedido, queryItens } from '@/lib/queries';
  const { searchParams } = new URL(req.url);
export const dynamic = 'force-dynamic';
import { formatPedido, queryItens } from '@/lib/queries';
  const cliente = searchParams.get('cliente') || '';
export const dynamic = 'force-dynamic';
import { formatPedido, queryItens } from '@/lib/queries';
  const prioridade = searchParams.get('prioridade') || '';
export const dynamic = 'force-dynamic';
import { formatPedido, queryItens } from '@/lib/queries';
  const setor = searchParams.get('setor') || '';
export const dynamic = 'force-dynamic';

import { formatPedido, queryItens } from '@/lib/queries';
  const rows = await sql`
export const dynamic = 'force-dynamic';
import { formatPedido, queryItens } from '@/lib/queries';
    SELECT p.*, u.nome AS criado_por_nome,
export const dynamic = 'force-dynamic';
import { formatPedido, queryItens } from '@/lib/queries';
           COALESCE((SELECT SUM(i2.quantidade * COALESCE(i2.valor_unitario,0)) FROM producao_itempedido i2 WHERE i2.pedido_id = p.id), 0)::text AS valor_calculado
export const dynamic = 'force-dynamic';
import { formatPedido, queryItens } from '@/lib/queries';
    FROM producao_pedido p
export const dynamic = 'force-dynamic';
import { formatPedido, queryItens } from '@/lib/queries';
    LEFT JOIN usuarios_usuario u ON u.id = p.criado_por_id
export const dynamic = 'force-dynamic';
import { formatPedido, queryItens } from '@/lib/queries';
    WHERE p.status != 'entregue'
export const dynamic = 'force-dynamic';
import { formatPedido, queryItens } from '@/lib/queries';
      AND (${cliente} = '' OR p.cliente ILIKE ${'%' + cliente + '%'})
export const dynamic = 'force-dynamic';
import { formatPedido, queryItens } from '@/lib/queries';
      AND (${prioridade} = '' OR p.prioridade = ${prioridade})
export const dynamic = 'force-dynamic';
import { formatPedido, queryItens } from '@/lib/queries';
    ORDER BY p.criado_em DESC
export const dynamic = 'force-dynamic';
import { formatPedido, queryItens } from '@/lib/queries';
  `;
export const dynamic = 'force-dynamic';

import { formatPedido, queryItens } from '@/lib/queries';
  const pedidos = await Promise.all(rows.map(async (r) => {
export const dynamic = 'force-dynamic';
import { formatPedido, queryItens } from '@/lib/queries';
    const itens = await queryItens(r.id);
export const dynamic = 'force-dynamic';
import { formatPedido, queryItens } from '@/lib/queries';
    if (setor && !itens.some(i => i.setor_atual === setor)) return null;
export const dynamic = 'force-dynamic';
import { formatPedido, queryItens } from '@/lib/queries';
    return formatPedido(r, itens);
export const dynamic = 'force-dynamic';
import { formatPedido, queryItens } from '@/lib/queries';
  }));
export const dynamic = 'force-dynamic';

import { formatPedido, queryItens } from '@/lib/queries';
  const result = pedidos.filter(Boolean);
export const dynamic = 'force-dynamic';
import { formatPedido, queryItens } from '@/lib/queries';
  const total_valor = result.reduce((s, p) => s + Number(p!.valor_calculado || 0), 0);
export const dynamic = 'force-dynamic';

import { formatPedido, queryItens } from '@/lib/queries';
  return NextResponse.json({
export const dynamic = 'force-dynamic';
import { formatPedido, queryItens } from '@/lib/queries';
    pedidos: result,
export const dynamic = 'force-dynamic';
import { formatPedido, queryItens } from '@/lib/queries';
    total_pedidos: result.length,
export const dynamic = 'force-dynamic';
import { formatPedido, queryItens } from '@/lib/queries';
    total_itens: result.reduce((s, p) => s + p!.itens.length, 0),
export const dynamic = 'force-dynamic';
import { formatPedido, queryItens } from '@/lib/queries';
    total_valor: total_valor.toFixed(2),
export const dynamic = 'force-dynamic';
import { formatPedido, queryItens } from '@/lib/queries';
  });
export const dynamic = 'force-dynamic';
import { formatPedido, queryItens } from '@/lib/queries';
}
export const dynamic = 'force-dynamic';
