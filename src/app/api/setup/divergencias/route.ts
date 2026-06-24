import { NextResponse } from 'next/server';
import sql from '@/lib/db';
import { autenticar } from '@/lib/middleware';

export async function POST(req: Request) {
  const user = await autenticar(req);
  if (user instanceof NextResponse) return user;
  if (!user.is_staff) return NextResponse.json({ erro: 'Sem permissao' }, { status: 403 });

  try {
    await sql.unsafe(`
      CREATE TABLE IF NOT EXISTS producao_divergencia (
        id                    SERIAL PRIMARY KEY,
        pedido_id             INTEGER NOT NULL REFERENCES producao_pedido(id) ON DELETE CASCADE,
        item_id               INTEGER REFERENCES producao_itempedido(id) ON DELETE SET NULL,
        usuario_id            INTEGER REFERENCES usuarios_usuario(id) ON DELETE SET NULL,
        tipo                  VARCHAR(50) NOT NULL
                                CHECK (tipo IN ('qualidade','quantidade','prazo','dano','documentacao','outro')),
        descricao             TEXT NOT NULL CHECK (TRIM(descricao) <> ''),
        setor_responsavel     VARCHAR(50),
        status                VARCHAR(50) NOT NULL DEFAULT 'aberta'
                                CHECK (status IN ('aberta','em_analise','resolvida','cancelada')),
        prioridade            VARCHAR(50) NOT NULL DEFAULT 'normal'
                                CHECK (prioridade IN ('baixa','normal','alta','urgente')),
        resolvido_em          TIMESTAMPTZ,
        resolvido_por_id      INTEGER REFERENCES usuarios_usuario(id) ON DELETE SET NULL,
        observacao_resolucao  TEXT,
        criado_em             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        atualizado_em         TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    await sql.unsafe(`
      CREATE INDEX IF NOT EXISTS idx_div_pedido_id   ON producao_divergencia(pedido_id);
      CREATE INDEX IF NOT EXISTS idx_div_item_id     ON producao_divergencia(item_id);
      CREATE INDEX IF NOT EXISTS idx_div_status      ON producao_divergencia(status);
      CREATE INDEX IF NOT EXISTS idx_div_criado_em   ON producao_divergencia(criado_em DESC);
    `);

    // Trigger atualizado_em — só cria se a função existir (requer hardening)
    try {
      await sql.unsafe(`
        DROP TRIGGER IF EXISTS trg_div_atualizado_em ON producao_divergencia;
        CREATE TRIGGER trg_div_atualizado_em
          BEFORE UPDATE ON producao_divergencia
          FOR EACH ROW EXECUTE FUNCTION fn_set_atualizado_em();
      `);
    } catch { /* fn_set_atualizado_em ainda não existe, sem problema */ }

    return NextResponse.json({ ok: true, mensagem: 'Tabela producao_divergencia criada.' });
  } catch (e) {
    console.error('[setup/divergencias]', e);
    return NextResponse.json({ erro: String(e) }, { status: 500 });
  }
}
