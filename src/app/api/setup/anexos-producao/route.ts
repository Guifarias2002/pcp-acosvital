import { NextResponse } from 'next/server';
import sql from '@/lib/db';
import { autenticar } from '@/lib/middleware';

export async function POST(req: Request) {
  const user = await autenticar(req);
  if (user instanceof NextResponse) return user;
  if (!user.is_staff) return NextResponse.json({ erro: 'Sem permissao' }, { status: 403 });

  try {
    await sql.unsafe(`
      ALTER TABLE producao_pedido ADD COLUMN IF NOT EXISTS pedido_venda_url TEXT;
      ALTER TABLE producao_pedido ADD COLUMN IF NOT EXISTS ordem_producao_url TEXT;
    `);

    return NextResponse.json({ ok: true, mensagem: 'Colunas pedido_venda_url e ordem_producao_url adicionadas em producao_pedido.' });
  } catch (e) {
    console.error('[setup/anexos-producao]', e);
    return NextResponse.json({ erro: String(e) }, { status: 500 });
  }
}
