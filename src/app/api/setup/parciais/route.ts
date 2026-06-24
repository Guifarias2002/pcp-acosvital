import { NextResponse } from 'next/server';
import sql from '@/lib/db';
import { autenticar } from '@/lib/middleware';

/**
 * POST /api/setup/parciais
 * Cria as tabelas producao_itemparcial e producao_apontamento,
 * depois migra os dados existentes (idempotente — pode rodar N vezes).
 */
export async function POST(req: Request) {
  const user = await autenticar(req);
  if (user instanceof NextResponse) return user;
  if (!user.is_staff)
    return NextResponse.json({ erro: 'Sem permissao' }, { status: 403 });

  const resultados: string[] = [];

  // ── 1. Tabela producao_itemparcial ────────────────────────────────────────
  try {
    await sql`
      CREATE TABLE IF NOT EXISTS producao_itemparcial (
        id                SERIAL PRIMARY KEY,
        item_pedido_id    INTEGER NOT NULL REFERENCES producao_itempedido(id) ON DELETE CASCADE,
        pedido_id         INTEGER NOT NULL REFERENCES producao_pedido(id) ON DELETE CASCADE,
        parcial_origem_id INTEGER REFERENCES producao_itemparcial(id) ON DELETE SET NULL,
        quantidade        NUMERIC(14,4) NOT NULL CHECK (quantidade > 0),
        setor_atual       VARCHAR(60) NOT NULL,
        status            VARCHAR(20) NOT NULL DEFAULT 'em_aberto'
                            CHECK (status IN ('em_aberto','em_andamento','concluida','cancelada')),
        observacao        TEXT,
        criado_por_id     INTEGER REFERENCES usuarios_usuario(id) ON DELETE SET NULL,
        criado_em         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        atualizado_em     TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `;
    resultados.push('✓ Tabela producao_itemparcial criada/verificada');
  } catch (e) {
    resultados.push(`✗ producao_itemparcial: ${String(e)}`);
  }

  // ── 2. Tabela producao_apontamento ────────────────────────────────────────
  try {
    await sql`
      CREATE TABLE IF NOT EXISTS producao_apontamento (
        id                    SERIAL PRIMARY KEY,
        parcial_id            INTEGER NOT NULL REFERENCES producao_itemparcial(id) ON DELETE CASCADE,
        item_pedido_id        INTEGER NOT NULL REFERENCES producao_itempedido(id) ON DELETE CASCADE,
        pedido_id             INTEGER NOT NULL REFERENCES producao_pedido(id) ON DELETE CASCADE,
        setor                 VARCHAR(60) NOT NULL,
        quantidade_apontada   NUMERIC(14,4) NOT NULL DEFAULT 0 CHECK (quantidade_apontada >= 0),
        quantidade_aprovada   NUMERIC(14,4) NOT NULL DEFAULT 0 CHECK (quantidade_aprovada >= 0),
        quantidade_reprovada  NUMERIC(14,4) NOT NULL DEFAULT 0 CHECK (quantidade_reprovada >= 0),
        quantidade_finalizada NUMERIC(14,4) NOT NULL DEFAULT 0 CHECK (quantidade_finalizada >= 0),
        status                VARCHAR(20) NOT NULL DEFAULT 'aberto'
                                CHECK (status IN ('aberto','em_andamento','finalizado','aprovado','reprovado')),
        usuario_id            INTEGER REFERENCES usuarios_usuario(id) ON DELETE SET NULL,
        observacao            TEXT,
        criado_em             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        atualizado_em         TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `;
    resultados.push('✓ Tabela producao_apontamento criada/verificada');
  } catch (e) {
    resultados.push(`✗ producao_apontamento: ${String(e)}`);
  }

  // ── 3. Índices ────────────────────────────────────────────────────────────
  const indices = [
    `CREATE INDEX IF NOT EXISTS idx_parcial_item       ON producao_itemparcial(item_pedido_id)`,
    `CREATE INDEX IF NOT EXISTS idx_parcial_pedido     ON producao_itemparcial(pedido_id)`,
    `CREATE INDEX IF NOT EXISTS idx_parcial_setor      ON producao_itemparcial(setor_atual)`,
    `CREATE INDEX IF NOT EXISTS idx_parcial_status     ON producao_itemparcial(status)`,
    `CREATE INDEX IF NOT EXISTS idx_parcial_setor_st   ON producao_itemparcial(setor_atual, status)`,
    `CREATE INDEX IF NOT EXISTS idx_apontamento_parcial ON producao_apontamento(parcial_id)`,
    `CREATE INDEX IF NOT EXISTS idx_apontamento_item    ON producao_apontamento(item_pedido_id)`,
  ];
  for (const ddl of indices) {
    try { await sql.unsafe(ddl); } catch { /* já existe */ }
  }
  resultados.push('✓ Índices verificados');

  // ── 4. Trigger atualizado_em ──────────────────────────────────────────────
  try {
    await sql`
      CREATE OR REPLACE FUNCTION fn_set_atualizado_em_parcial()
      RETURNS TRIGGER LANGUAGE plpgsql AS $$
      BEGIN NEW.atualizado_em := NOW(); RETURN NEW; END; $$
    `;
    await sql`
      DROP TRIGGER IF EXISTS trg_parcial_atualizado_em ON producao_itemparcial
    `;
    await sql`
      CREATE TRIGGER trg_parcial_atualizado_em
      BEFORE UPDATE ON producao_itemparcial
      FOR EACH ROW EXECUTE FUNCTION fn_set_atualizado_em_parcial()
    `;
    await sql`
      DROP TRIGGER IF EXISTS trg_apontamento_atualizado_em ON producao_apontamento
    `;
    await sql`
      CREATE TRIGGER trg_apontamento_atualizado_em
      BEFORE UPDATE ON producao_apontamento
      FOR EACH ROW EXECUTE FUNCTION fn_set_atualizado_em_parcial()
    `;
    resultados.push('✓ Triggers atualizado_em criados');
  } catch (e) {
    resultados.push(`⚠ Trigger atualizado_em: ${String(e)}`);
  }

  // ── 5. Migração de dados existentes ──────────────────────────────────────
  //
  // Para cada item sem nenhuma parcial cadastrada, reconstruímos o estado atual:
  //   • parciais em lotes ativos (em_producao / em_trabalho) → parcial no setor_destino
  //   • quantidade restante no setor_atual do item → parcial em setor_atual
  //
  let migrados = 0;
  let errosMig = 0;

  try {
    // Itens que ainda não têm nenhuma parcial
    const itens = await sql`
      SELECT i.id, i.pedido_id, i.setor_atual, i.status,
             i.quantidade::float        AS quantidade,
             i.quantidade_pendente::float AS quantidade_pendente,
             i.quantidade_entregue::float AS quantidade_entregue
      FROM producao_itempedido i
      WHERE NOT EXISTS (
        SELECT 1 FROM producao_itemparcial p WHERE p.item_pedido_id = i.id
      )
      AND i.status NOT IN ('entregue', 'bloqueado')
    `;

    for (const item of itens) {
      try {
        await sql.begin(async (tx) => {
          // Lotes ativos (em_producao ou em_trabalho) deste item
          const lotes = await tx`
            SELECT id, setor_destino, quantidade::float AS quantidade, status
            FROM producao_loteitem
            WHERE item_pedido_id = ${item.id}
              AND status IN ('em_producao','em_trabalho')
          `;

          // Quantidade já alocada em lotes ativos
          const qtdEmLotes = lotes.reduce(
            (s: number, l: Record<string, unknown>) => s + Number(l.quantidade),
            0
          );

          // Parcial principal: quantidade_pendente no setor_atual
          const qtdPrincipal = Number(item.quantidade_pendente) - qtdEmLotes;
          if (qtdPrincipal > 0) {
            const statusParcial = ['em_andamento', 'pausado'].includes(item.status)
              ? 'em_andamento' : 'em_aberto';
            await tx`
              INSERT INTO producao_itemparcial
                (item_pedido_id, pedido_id, quantidade, setor_atual, status, observacao, criado_em, atualizado_em)
              VALUES
                (${item.id}, ${item.pedido_id}, ${qtdPrincipal}, ${item.setor_atual},
                 ${statusParcial}, 'Migração automática — saldo no setor atual', NOW(), NOW())
            `;
          }

          // Parciais para lotes ativos
          for (const lote of lotes) {
            await tx`
              INSERT INTO producao_itemparcial
                (item_pedido_id, pedido_id, quantidade, setor_atual, status, observacao, criado_em, atualizado_em)
              VALUES
                (${item.id}, ${item.pedido_id}, ${lote.quantidade}, ${lote.setor_destino},
                 'em_aberto', ${`Migração — lote #${lote.id} (${lote.status})`}, NOW(), NOW())
            `;
          }
        });
        migrados++;
      } catch {
        errosMig++;
      }
    }

    resultados.push(`✓ Migração: ${migrados} item(ns) migrado(s), ${errosMig} erro(s)`);
  } catch (e) {
    resultados.push(`✗ Migração: ${String(e)}`);
  }

  // ── 6. Validação de integridade pós-migração ──────────────────────────────
  try {
    const [{ divergentes }] = await sql`
      SELECT COUNT(*) AS divergentes FROM (
        SELECT
          i.id,
          i.quantidade::float AS total,
          COALESCE(SUM(p.quantidade)::float, 0) AS rastreado
        FROM producao_itempedido i
        LEFT JOIN producao_itemparcial p
          ON p.item_pedido_id = i.id AND p.status != 'cancelada'
        WHERE i.status NOT IN ('entregue','bloqueado')
        GROUP BY i.id, i.quantidade
        HAVING ABS(i.quantidade::float - COALESCE(SUM(p.quantidade)::float, 0)) > 0.001
          AND COALESCE(SUM(p.quantidade)::float, 0) > 0
      ) sub
    `;
    resultados.push(
      Number(divergentes) === 0
        ? '✓ Integridade: todos os itens com parciais têm saldo correto'
        : `⚠ Integridade: ${divergentes} item(ns) com saldo divergente — verifique manualmente`
    );
  } catch {
    resultados.push('⚠ Validação de integridade ignorada (tabela ainda vazia ou erro de consulta)');
  }

  return NextResponse.json({ ok: true, resultados });
}
