
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
  const busca = searchParams.get('busca') || '';
export const dynamic = 'force-dynamic';

import { autenticar } from '@/lib/middleware';
  const rows = busca
export const dynamic = 'force-dynamic';
import { autenticar } from '@/lib/middleware';
    ? await sql`
export const dynamic = 'force-dynamic';
import { autenticar } from '@/lib/middleware';
        SELECT * FROM producao_pedido_excluido
export const dynamic = 'force-dynamic';
import { autenticar } from '@/lib/middleware';
        WHERE numero_pedido_venda ILIKE ${'%' + busca + '%'}
export const dynamic = 'force-dynamic';
import { autenticar } from '@/lib/middleware';
           OR cliente ILIKE ${'%' + busca + '%'}
export const dynamic = 'force-dynamic';
import { autenticar } from '@/lib/middleware';
           OR excluido_por_nome ILIKE ${'%' + busca + '%'}
export const dynamic = 'force-dynamic';
import { autenticar } from '@/lib/middleware';
        ORDER BY excluido_em DESC LIMIT 200
export const dynamic = 'force-dynamic';
import { autenticar } from '@/lib/middleware';
      `
export const dynamic = 'force-dynamic';
import { autenticar } from '@/lib/middleware';
    : await sql`
export const dynamic = 'force-dynamic';
import { autenticar } from '@/lib/middleware';
        SELECT * FROM producao_pedido_excluido
export const dynamic = 'force-dynamic';
import { autenticar } from '@/lib/middleware';
        ORDER BY excluido_em DESC LIMIT 200
export const dynamic = 'force-dynamic';
import { autenticar } from '@/lib/middleware';
      `;
export const dynamic = 'force-dynamic';

import { autenticar } from '@/lib/middleware';
  return NextResponse.json(rows);
export const dynamic = 'force-dynamic';
import { autenticar } from '@/lib/middleware';
}
export const dynamic = 'force-dynamic';
