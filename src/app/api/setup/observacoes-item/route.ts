import { NextResponse } from 'next/server';
import sql from '@/lib/db';
import { autenticar } from '@/lib/middleware';

export async function POST(req: Request) {
  const user = await autenticar(req);
  if (user instanceof NextResponse) return user;
  if (!user.is_staff) return NextResponse.json({ erro: 'Sem permissao' }, { status: 403 });

  try {
    await sql.unsafe(`
      CREATE TABLE IF NOT EXISTS producao_item_observacao (
        id            SERIAL PRIMARY KEY,
        item_id       INTEGER NOT NULL REFERENCES producao_itempedido(id) ON DELETE CASCADE,
        pedido_id     INTEGER NOT NULL REFERENCES producao_pedido(id) ON DELETE CASCADE,
        setor         VARCHAR(50) NOT NULL,
        usuario_id    INTEGER REFERENCES usuarios_usuario(id) ON DELETE SET NULL,
        texto         TEXT NOT NULL CHECK (TRIM(texto) <> ''),
        criado_em     TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    await sql.unsafe(`
      CREATE INDEX IF NOT EXISTS idx_item_obs_item_id   ON producao_item_observacao(item_id);
      CREATE INDEX IF NOT EXISTS idx_item_obs_criado_em ON producao_item_observacao(criado_em DESC);
    `);

    return NextResponse.json({ ok: true, mensagem: 'Tabela producao_item_observacao criada.' });
  } catch (e) {
    console.error('[setup/observacoes-item]', e);
    return NextResponse.json({ erro: String(e) }, { status: 500 });
  }
}
