import { NextResponse } from 'next/server';
import sql from '@/lib/db';
import { autenticar } from '@/lib/middleware';

// Migração pontual: adiciona a coluna "quantidade" em producao_entrega, usada
// pela entrega parcial (item dividido em parciais — só a parte que chegou na
// Logística é entregue, o resto continua em produção).
export async function POST(req: Request) {
  const user = await autenticar(req);
  if (user instanceof NextResponse) return user;
  if (!user.is_staff) return NextResponse.json({ erro: 'Sem permissao' }, { status: 403 });

  try {
    await sql.unsafe(`
      ALTER TABLE producao_entrega ADD COLUMN IF NOT EXISTS quantidade NUMERIC;
    `);
    return NextResponse.json({ ok: true, mensagem: 'Coluna producao_entrega.quantidade garantida.' });
  } catch (e) {
    console.error('[setup/entrega-parcial]', e);
    return NextResponse.json({ erro: String(e) }, { status: 500 });
  }
}
