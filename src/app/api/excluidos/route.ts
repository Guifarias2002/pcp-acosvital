import { NextResponse } from 'next/server';
import sql from '@/lib/db';
import { autenticar } from '@/lib/middleware';

export const dynamic = 'force-dynamic';
export async function GET(req: Request) {
  const user = await autenticar(req);
  if (user instanceof NextResponse) return user;
  if (!user.is_staff) return NextResponse.json({ erro: 'Sem permissao' }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const busca = searchParams.get('busca') || '';

  const rows = busca
    ? await sql`
        SELECT * FROM producao_pedido_excluido
        WHERE numero_pedido_venda ILIKE ${'%' + busca + '%'}
           OR cliente ILIKE ${'%' + busca + '%'}
           OR excluido_por_nome ILIKE ${'%' + busca + '%'}
        ORDER BY excluido_em DESC LIMIT 200
      `
    : await sql`
        SELECT * FROM producao_pedido_excluido
        ORDER BY excluido_em DESC LIMIT 200
      `;

  return NextResponse.json(rows);
}