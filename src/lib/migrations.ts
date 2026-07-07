/**
 * Migrations incrementais — roda automaticamente no startup do servidor.
 * Cada bloco é idempotente e falha silenciosamente para não derrubar o app.
 */
import sql from './db';

let ran = false;

export async function runMigrations() {
  if (ran) return;
  ran = true;

  // M01: colunas de timing em producao_itemparcial
  await sql.unsafe(`ALTER TABLE producao_itemparcial ADD COLUMN IF NOT EXISTS iniciado_em  TIMESTAMPTZ`).catch(() => {});
  await sql.unsafe(`ALTER TABLE producao_itemparcial ADD COLUMN IF NOT EXISTS concluido_em TIMESTAMPTZ`).catch(() => {});

  // M02: status CHECK — drop qualquer constraint existente e recria com valores completos
  try {
    const rows = await sql`
      SELECT conname FROM pg_constraint
      WHERE conrelid = 'producao_itemparcial'::regclass
        AND contype = 'c'
        AND pg_get_constraintdef(oid) LIKE '%status%'
    `;
    for (const row of rows) {
      await sql.unsafe(`ALTER TABLE producao_itemparcial DROP CONSTRAINT IF EXISTS "${row.conname}"`).catch(() => {});
    }
    await sql.unsafe(`
      ALTER TABLE producao_itemparcial
      ADD CONSTRAINT producao_itemparcial_status_check
      CHECK (status IN ('em_aberto','recebido','em_andamento','em_transito','pausado','finalizado_setor','concluida','cancelada'))
    `).catch((e) => {
      // Se isto falhar, a tabela fica sem CHECK de status ate o proximo restart
      // rodar a migration de novo - deixa visivel no log em vez de falhar em silencio.
      console.error('[migrations] falha ao recriar producao_itemparcial_status_check:', e);
    });
  } catch (e) {
    console.error('[migrations] M02 (status CHECK) falhou:', e);
  }

  // M04: flag de retrabalho em parciais devolvidas
  await sql.unsafe(`ALTER TABLE producao_itemparcial ADD COLUMN IF NOT EXISTS retrabalho BOOLEAN NOT NULL DEFAULT FALSE`).catch(() => {});
  await sql.unsafe(`ALTER TABLE producao_itemparcial ADD COLUMN IF NOT EXISTS motivo_retrabalho TEXT`).catch(() => {});
  await sql.unsafe(`ALTER TABLE producao_itemparcial ADD COLUMN IF NOT EXISTS devolvido_de TEXT`).catch(() => {});

  // M03: backfill timing
  await sql`
    UPDATE producao_itemparcial SET concluido_em = atualizado_em
    WHERE status = 'concluida' AND concluido_em IS NULL
  `.catch(() => {});
  await sql`
    UPDATE producao_itemparcial SET iniciado_em = criado_em
    WHERE status IN ('em_andamento','pausado','finalizado_setor','concluida') AND iniciado_em IS NULL
  `.catch(() => {});

  // M05: anexos de entrega no pedido
  await sql.unsafe(`ALTER TABLE producao_pedido ADD COLUMN IF NOT EXISTS nota_url TEXT`).catch(() => {});
  await sql.unsafe(`ALTER TABLE producao_pedido ADD COLUMN IF NOT EXISTS canhoto_url TEXT`).catch(() => {});
  await sql.unsafe(`ALTER TABLE producao_pedido ADD COLUMN IF NOT EXISTS anexo_pendente BOOLEAN NOT NULL DEFAULT FALSE`).catch(() => {});

  // M06: múltiplos desenhos por item
  await sql.unsafe(`ALTER TABLE producao_itempedido ADD COLUMN IF NOT EXISTS desenhos TEXT[] NOT NULL DEFAULT '{}'`).catch(() => {});

  // M07: índices críticos de performance — elimina seq scans nas queries mais pesadas
  await sql.unsafe(`CREATE INDEX IF NOT EXISTS idx_itempedido_pedido_id        ON producao_itempedido (pedido_id)`).catch(() => {});
  await sql.unsafe(`CREATE INDEX IF NOT EXISTS idx_itempedido_setor_status      ON producao_itempedido (setor_atual, status)`).catch(() => {});
  await sql.unsafe(`CREATE INDEX IF NOT EXISTS idx_itemparcial_item_id          ON producao_itemparcial (item_pedido_id)`).catch(() => {});
  await sql.unsafe(`CREATE INDEX IF NOT EXISTS idx_itemparcial_setor_status     ON producao_itemparcial (setor_atual, status)`).catch(() => {});
  await sql.unsafe(`CREATE INDEX IF NOT EXISTS idx_itemparcial_item_setor_status ON producao_itemparcial (item_pedido_id, setor_atual, status)`).catch(() => {});
  await sql.unsafe(`CREATE INDEX IF NOT EXISTS idx_movimentacao_item_id         ON producao_movimentacaoitem (item_id)`).catch(() => {});
  await sql.unsafe(`CREATE INDEX IF NOT EXISTS idx_movimentacao_criado_em       ON producao_movimentacaoitem (criado_em DESC)`).catch(() => {});
  await sql.unsafe(`CREATE INDEX IF NOT EXISTS idx_pedido_status                ON producao_pedido (status)`).catch(() => {});
  await sql.unsafe(`CREATE INDEX IF NOT EXISTS idx_pedido_prazo_status          ON producao_pedido (prazo_entrega, status)`).catch(() => {});

  // M08: múltiplos desenhos por pedido (mesmo padrão do M06 para itens) -
  // migra o desenho_url único existente (se houver) para o array antes de
  // o front-end passar a depender só de "desenhos".
  await sql.unsafe(`ALTER TABLE producao_pedido ADD COLUMN IF NOT EXISTS desenhos TEXT[] NOT NULL DEFAULT '{}'`).catch(() => {});
  await sql`
    UPDATE producao_pedido SET desenhos = ARRAY[desenho_url]
    WHERE desenho_url IS NOT NULL AND desenhos = '{}'
  `.catch(() => {});
}
