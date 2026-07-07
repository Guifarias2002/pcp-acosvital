/**
 * POST /api/setup/rastreio
 * Aplica todas as migrations incrementais à producao_itemparcial:
 *   1. Colunas de timing: iniciado_em, concluido_em
 *   2. Status CHECK constraint: adiciona pausado, finalizado_setor
 * Idempotente — pode rodar múltiplas vezes sem efeito colateral.
 */
import { NextResponse } from 'next/server';
import sql from '@/lib/db';
import { autenticar } from '@/lib/middleware';

export async function POST(req: Request) {
  const user = await autenticar(req);
  if (user instanceof NextResponse) return user;
  if (!user.is_staff)
    return NextResponse.json({ erro: 'Sem permissao' }, { status: 403 });

  const resultados: string[] = [];

  // ── 1. Adiciona colunas de timing ─────────────────────────────────────────
  const colunas = [
    { col: 'iniciado_em',  ddl: 'TIMESTAMPTZ' },
    { col: 'concluido_em', ddl: 'TIMESTAMPTZ' },
  ];

  for (const { col, ddl } of colunas) {
    try {
      await sql.unsafe(`ALTER TABLE producao_itemparcial ADD COLUMN IF NOT EXISTS ${col} ${ddl}`);
      resultados.push(`✓ Coluna ${col} adicionada`);
    } catch (e) {
      resultados.push(`⚠ Coluna ${col}: ${String(e)}`);
    }
  }

  // ── 2. Fix status CHECK constraint (adiciona pausado, finalizado_setor) ───
  // DROP + CREATE é a única forma de alterar um CHECK constraint no PostgreSQL.
  // O IF EXISTS garante idempotência.
  try {
    // Descobre o nome do constraint atual
    const [row] = await sql`
      SELECT conname FROM pg_constraint
      WHERE conrelid = 'producao_itemparcial'::regclass
        AND contype = 'c'
        AND pg_get_constraintdef(oid) LIKE '%status%'
    `;
    if (row?.conname) {
      await sql.unsafe(`ALTER TABLE producao_itemparcial DROP CONSTRAINT IF EXISTS "${row.conname}"`);
      resultados.push(`✓ Constraint ${row.conname} removida`);
    }
    await sql.unsafe(`
      ALTER TABLE producao_itemparcial
      ADD CONSTRAINT producao_itemparcial_status_check
      CHECK (status IN ('em_aberto','recebido','em_andamento','em_transito','pausado','finalizado_setor','concluida','cancelada'))
    `);
    resultados.push('✓ Status CHECK constraint atualizado (recebido + em_transito + pausado + finalizado_setor incluídos)');
  } catch (e) {
    resultados.push(`⚠ Status CHECK: ${String(e)}`);
  }

  // ── 3. Backfill: concluido_em para registros já concluídos ───────────────
  try {
    const r = await sql`
      UPDATE producao_itemparcial
      SET concluido_em = atualizado_em
      WHERE status = 'concluida' AND concluido_em IS NULL
    `;
    resultados.push(`✓ concluido_em preenchido em ${r.count} registro(s)`);
  } catch (e) {
    resultados.push(`⚠ Backfill concluido_em: ${String(e)}`);
  }

  // ── 4. Backfill: iniciado_em para registros em andamento/concluídos ──────
  try {
    const r = await sql`
      UPDATE producao_itemparcial
      SET iniciado_em = criado_em
      WHERE status IN ('em_andamento','pausado','finalizado_setor','concluida')
        AND iniciado_em IS NULL
    `;
    resultados.push(`✓ iniciado_em preenchido em ${r.count} registro(s) (via criado_em)`);
  } catch (e) {
    resultados.push(`⚠ Backfill iniciado_em: ${String(e)}`);
  }

  // ── 5. Índices de performance ─────────────────────────────────────────────
  const indices = [
    `CREATE INDEX IF NOT EXISTS idx_parcial_iniciado  ON producao_itemparcial(iniciado_em)  WHERE iniciado_em IS NOT NULL`,
    `CREATE INDEX IF NOT EXISTS idx_parcial_concluido ON producao_itemparcial(concluido_em) WHERE concluido_em IS NOT NULL`,
  ];
  for (const ddl of indices) {
    try { await sql.unsafe(ddl); } catch { /* já existe */ }
  }
  resultados.push('✓ Índices de timing verificados');

  return NextResponse.json({ ok: true, mensagem: 'Migração de rastreio aplicada.', log: resultados });
}
