import { NextResponse } from 'next/server';
import sql from '@/lib/db';
import { autenticar } from '@/lib/middleware';

export const dynamic = 'force-dynamic';

// GET /api/pedidos/ultimo-roteiro — devolve o roteiro_base do último pedido criado,
// usado pelo botão "Copiar do último pedido" na tela de Nova Ordem.
export async function GET(req: Request) {
  const user = await autenticar(req);
  if (user instanceof NextResponse) return user;
  if (!user.is_staff) return NextResponse.json({ erro: 'Sem permissao' }, { status: 403 });

  const [row] = await sql`
    SELECT numero_pedido_venda, roteiro_base
    FROM producao_pedido
    ORDER BY id DESC
    LIMIT 1
  `;

  if (!row) return NextResponse.json({ erro: 'Nenhum pedido encontrado ainda' }, { status: 404 });

  return NextResponse.json({
    numero_pedido_venda: row.numero_pedido_venda,
    roteiro_base: row.roteiro_base || [],
  });
}
