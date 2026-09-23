import { NextResponse } from 'next/server';
import sql from '@/lib/db';
import { autenticar } from '@/lib/middleware';

export const dynamic = 'force-dynamic';

// GET /api/pedidos/ultimo-roteiro?fabrica=<cod> — devolve o roteiro do último
// pedido, usado pelo botão "Copiar do último pedido" na tela de Nova Ordem.
//
// Com `fabrica`, busca o último ITEM daquela fábrica e devolve o roteiro dele:
// roteiro_proprio (OP mista) ou, se vazio, o roteiro_base do pedido. Assim a
// aba Flanges nunca copia o roteiro de um pedido de Caldeiraria (e vice-versa) —
// antes pegava o último pedido de QUALQUER fábrica e vazava setores
// compartilhados. Sem `fabrica`, mantém o comportamento antigo (último pedido).
export async function GET(req: Request) {
  const user = await autenticar(req);
  if (user instanceof NextResponse) return user;
  if (!user.is_staff) return NextResponse.json({ erro: 'Sem permissao' }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const fabrica = (searchParams.get('fabrica') || '').trim();

  if (fabrica) {
    const [row] = await sql`
      SELECT p.numero_pedido_venda,
             COALESCE(NULLIF(i.roteiro_proprio, '{}'), p.roteiro_base) AS roteiro_base
      FROM producao_itempedido i
      JOIN producao_pedido p ON p.id = i.pedido_id
      WHERE i.fabrica = ${fabrica} AND i.inativo = false
      ORDER BY i.id DESC
      LIMIT 1
    `;
    if (!row) return NextResponse.json({ erro: 'Nenhum pedido dessa fábrica ainda' }, { status: 404 });
    return NextResponse.json({
      numero_pedido_venda: row.numero_pedido_venda,
      roteiro_base: row.roteiro_base || [],
    });
  }

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
