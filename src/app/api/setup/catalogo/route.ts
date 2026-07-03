import { NextResponse } from 'next/server';
import sql from '@/lib/db';
import { autenticar } from '@/lib/middleware';

export async function POST(req: Request) {
  const user = await autenticar(req);
  if (user instanceof NextResponse) return user;
  if (!user.is_staff) return NextResponse.json({ erro: 'Sem permissao' }, { status: 403 });

  try {
    await sql.unsafe(`
      CREATE TABLE IF NOT EXISTS producao_catalogo_material (
        id             SERIAL PRIMARY KEY,
        nome           VARCHAR(200) NOT NULL,
        descricao      TEXT,
        categoria      VARCHAR(100),
        storage_path   TEXT NOT NULL,
        nome_arquivo   VARCHAR(255),
        tamanho        INTEGER,
        mime_type      VARCHAR(100),
        criado_por_id  INTEGER REFERENCES usuarios_usuario(id) ON DELETE SET NULL,
        criado_em      TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    await sql.unsafe(`
      CREATE INDEX IF NOT EXISTS idx_catalogo_nome      ON producao_catalogo_material(nome);
      CREATE INDEX IF NOT EXISTS idx_catalogo_categoria ON producao_catalogo_material(categoria);
    `);

    return NextResponse.json({ ok: true, mensagem: 'Tabela producao_catalogo_material criada.' });
  } catch (e) {
    console.error('[setup/catalogo]', e);
    return NextResponse.json({ erro: String(e) }, { status: 500 });
  }
}
