import { NextResponse } from 'next/server';
import sql from '@/lib/db';
import { autenticar } from '@/lib/middleware';

export const dynamic = 'force-dynamic';

// Máquina planejada de UMA peça (item). Leitura liberada pra qualquer usuário
// autenticado — o OPERADOR precisa ler pra ver a máquina travada no modal de
// "iniciar produção". Só leitura; quem DEFINE é o Planejamento (POST /api/planejamento).
export async function GET(req: Request) {
  const user = await autenticar(req);
  if (user instanceof NextResponse) return user;

  const url = new URL(req.url);
  const itemId = Number(url.searchParams.get('item'));
  if (!Number.isInteger(itemId) || itemId <= 0)
    return NextResponse.json({ erro: 'Item inválido' }, { status: 400 });

  try {
    const [row] = await sql`
      SELECT maquina FROM producao_plano_usinagem
      WHERE item_pedido_id = ${itemId} AND maquina IS NOT NULL AND maquina <> ''
    `;
    return NextResponse.json({ maquina: (row?.maquina as string) || null });
  } catch (e) {
    console.error('[planejamento/maquina GET]', e);
    return NextResponse.json({ maquina: null });
  }
}
