
import { autenticar } from '@/lib/middleware';
export async function GET(req: Request, { params }: { params: { id: string } }) {
export const dynamic = 'force-dynamic';
import { autenticar } from '@/lib/middleware';
  const user = await autenticar(req);
export const dynamic = 'force-dynamic';
import { autenticar } from '@/lib/middleware';
  if (user instanceof NextResponse) return user;
export const dynamic = 'force-dynamic';

import { autenticar } from '@/lib/middleware';
  const pedidoId = Number(params.id);
export const dynamic = 'force-dynamic';
import { autenticar } from '@/lib/middleware';
  if (!Number.isInteger(pedidoId) || pedidoId <= 0)
export const dynamic = 'force-dynamic';
import { autenticar } from '@/lib/middleware';
    return NextResponse.json({ erro: 'ID invalido' }, { status: 400 });
export const dynamic = 'force-dynamic';

import { autenticar } from '@/lib/middleware';
  const [pedido] = await sql`SELECT id FROM producao_pedido WHERE id = ${pedidoId}`;
export const dynamic = 'force-dynamic';
import { autenticar } from '@/lib/middleware';
  if (!pedido) return NextResponse.json({ erro: 'Pedido nao encontrado' }, { status: 404 });
export const dynamic = 'force-dynamic';

import { autenticar } from '@/lib/middleware';
  const movimentacoes = await sql`
export const dynamic = 'force-dynamic';
import { autenticar } from '@/lib/middleware';
    SELECT
export const dynamic = 'force-dynamic';
import { autenticar } from '@/lib/middleware';
      m.id, m.item_id,
export const dynamic = 'force-dynamic';
import { autenticar } from '@/lib/middleware';
      m.setor_origem, m.setor_destino,
export const dynamic = 'force-dynamic';
import { autenticar } from '@/lib/middleware';
      m.status_anterior, m.status_novo,
export const dynamic = 'force-dynamic';
import { autenticar } from '@/lib/middleware';
      m.observacao,
export const dynamic = 'force-dynamic';
import { autenticar } from '@/lib/middleware';
      m.criado_em::text,
export const dynamic = 'force-dynamic';
import { autenticar } from '@/lib/middleware';
      u.nome AS usuario_nome,
export const dynamic = 'force-dynamic';
import { autenticar } from '@/lib/middleware';
      i.codigo AS item_codigo
export const dynamic = 'force-dynamic';
import { autenticar } from '@/lib/middleware';
    FROM producao_movimentacaoitem m
export const dynamic = 'force-dynamic';
import { autenticar } from '@/lib/middleware';
    LEFT JOIN usuarios_usuario u ON u.id = m.usuario_id
export const dynamic = 'force-dynamic';
import { autenticar } from '@/lib/middleware';
    LEFT JOIN producao_itempedido i ON i.id = m.item_id
export const dynamic = 'force-dynamic';
import { autenticar } from '@/lib/middleware';
    WHERE m.pedido_id = ${pedidoId}
export const dynamic = 'force-dynamic';
import { autenticar } from '@/lib/middleware';
    ORDER BY m.criado_em DESC
export const dynamic = 'force-dynamic';
import { autenticar } from '@/lib/middleware';
  `;
export const dynamic = 'force-dynamic';

import { autenticar } from '@/lib/middleware';
  return NextResponse.json({ movimentacoes });
export const dynamic = 'force-dynamic';
import { autenticar } from '@/lib/middleware';
}
export const dynamic = 'force-dynamic';
