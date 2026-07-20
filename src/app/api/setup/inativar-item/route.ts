import { NextResponse } from 'next/server';
import sql from '@/lib/db';
import { autenticar } from '@/lib/middleware';

// Adiciona as colunas de inativação em producao_itempedido. Um item inativado
// some de todas as telas do operador, mas continua visível (cinza) para o admin
// e pode ser reativado. Não apaga nada — é um flag reversível.
export async function POST(req: Request) {
  const user = await autenticar(req);
  if (user instanceof NextResponse) return user;
  if (!user.is_staff) return NextResponse.json({ erro: 'Sem permissao' }, { status: 403 });

  try {
    await sql.unsafe(`
      ALTER TABLE producao_itempedido
        ADD COLUMN IF NOT EXISTS inativo            BOOLEAN NOT NULL DEFAULT FALSE,
        ADD COLUMN IF NOT EXISTS inativado_em       TIMESTAMPTZ,
        ADD COLUMN IF NOT EXISTS inativado_por      VARCHAR(200),
        ADD COLUMN IF NOT EXISTS motivo_inativacao  TEXT;
    `);

    // Índice parcial — só indexa os inativos (poucos), acelera os filtros
    // "WHERE inativo = false" sem inchar o índice com a maioria ativa.
    await sql.unsafe(`CREATE INDEX IF NOT EXISTS idx_item_inativo ON producao_itempedido(inativo) WHERE inativo;`);

    return NextResponse.json({ ok: true, mensagem: 'Colunas de inativação adicionadas em producao_itempedido.' });
  } catch (e) {
    console.error('[setup/inativar-item]', e);
    return NextResponse.json({ erro: String(e) }, { status: 500 });
  }
}
