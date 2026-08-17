import { NextResponse } from 'next/server';
import sql from '@/lib/db';
import { autenticar } from '@/lib/middleware';
import { isAdministrador } from '@/lib/auth';
import { withTimeout } from '@/lib/queryTimeout';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// Segunda-feira da semana de uma data (UTC)
function segunda(d: Date) { const x = new Date(d); const dia = (x.getUTCDay() + 6) % 7; x.setUTCDate(x.getUTCDate() - dia); x.setUTCHours(0, 0, 0, 0); return x; }

async function listar() {
  const rows = await sql`
    SELECT semana_inicio::text AS semana, dados, gerado_em
    FROM producao_fechamento_semanal WHERE fabrica = 'flange'
    ORDER BY semana_inicio DESC`;
  return rows.map((r: Record<string, unknown>) => ({ semana: r.semana, gerado_em: r.gerado_em, ...(r.dados as object) }));
}

export async function GET(req: Request) {
  try {
    const user = await autenticar(req);
    if (user instanceof NextResponse) return user;
    if (!isAdministrador(user)) return NextResponse.json({ erro: 'Sem permissao' }, { status: 403 });
    return NextResponse.json({ fechamentos: await listar() });
  } catch (e) {
    console.error('[fechamento GET]', e);
    return NextResponse.json({ erro: 'Erro ao listar fechamentos' }, { status: 500 });
  }
}

// Gera (backfill) os fechamentos das semanas JÁ FECHADAS que ainda não existem.
export async function POST(req: Request) {
  try {
    const user = await autenticar(req);
    if (user instanceof NextResponse) return user;
    if (!isAdministrador(user)) return NextResponse.json({ erro: 'Sem permissao' }, { status: 403 });

    // Auto-cria a tabela se não existir (idempotente, self-healing)
    await sql.unsafe(`
      CREATE TABLE IF NOT EXISTS producao_fechamento_semanal (
        id SERIAL PRIMARY KEY,
        semana_inicio DATE NOT NULL,
        fabrica VARCHAR(20) NOT NULL DEFAULT 'flange',
        dados JSONB NOT NULL,
        gerado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        gerado_por_id INTEGER REFERENCES usuarios_usuario(id) ON DELETE SET NULL,
        UNIQUE (semana_inicio, fabrica)
      );`);

    const FLANGE = sql`COALESCE(i.fabrica,'flange') = 'flange' AND i.inativo IS NOT TRUE`;
    const qCriados = sql`
      SELECT date_trunc('week', i.criado_em)::date AS semana,
             COUNT(*) AS itens, COALESCE(SUM(i.quantidade),0) AS pecas, COUNT(DISTINCT i.pedido_id) AS pedidos
      FROM producao_itempedido i WHERE ${FLANGE} GROUP BY 1`;
    const qFinal = sql`
      SELECT date_trunc('week', m.criado_em)::date AS semana, COUNT(*) AS finalizacoes
      FROM producao_movimentacaoitem m JOIN producao_itempedido i ON i.id = m.item_id AND ${FLANGE}
      WHERE m.status_novo = 'finalizado_setor' GROUP BY 1`;
    const qEntregas = sql`
      WITH fst AS (SELECT m.item_id, MIN(m.criado_em) t0 FROM producao_movimentacaoitem m
        JOIN producao_itempedido i ON i.id=m.item_id AND ${FLANGE} GROUP BY 1),
      ent AS (SELECT m.item_id, MIN(m.criado_em) t1 FROM producao_movimentacaoitem m WHERE m.status_novo='entregue' GROUP BY 1)
      SELECT date_trunc('week', e.t1)::date AS semana, COUNT(*) AS entregues,
             COALESCE(SUM(i.quantidade),0) AS pecas_entregues,
             ROUND((percentile_cont(0.5) WITHIN GROUP (ORDER BY (EXTRACT(EPOCH FROM (e.t1-f.t0))/86400.0)))::numeric,1) AS lead_mediana
      FROM ent e JOIN fst f ON f.item_id=e.item_id JOIN producao_itempedido i ON i.id=e.item_id
      GROUP BY 1`;

    // Sequencial (uma de cada vez) — não afoga o pool de conexões do banco enxuto
    const criados = await withTimeout(qCriados.catch(() => []), 20000, [qCriados]);
    const finais = await withTimeout(qFinal.catch(() => []), 20000, [qFinal]);
    const entregas = await withTimeout(qEntregas.catch(() => []), 20000, [qEntregas]);

    const map: Record<string, Record<string, number>> = {};
    const g = (s: string) => (map[s] = map[s] || { itens_criados: 0, pecas_criadas: 0, pedidos: 0, finalizacoes: 0, itens_entregues: 0, pecas_entregues: 0, lead_mediana: 0 });
    criados.forEach((r: Record<string, string>) => { const w = g(r.semana); w.itens_criados = Number(r.itens); w.pecas_criadas = Number(r.pecas); w.pedidos = Number(r.pedidos); });
    finais.forEach((r: Record<string, string>) => { g(r.semana).finalizacoes = Number(r.finalizacoes); });
    entregas.forEach((r: Record<string, string>) => { const w = g(r.semana); w.itens_entregues = Number(r.entregues); w.pecas_entregues = Number(r.pecas_entregues); w.lead_mediana = Number(r.lead_mediana || 0); });

    // Só semanas FECHADAS (anteriores à segunda-feira desta semana)
    const cutoff = segunda(new Date());
    const existentes: { semana: string }[] = await sql`SELECT semana_inicio::text AS semana FROM producao_fechamento_semanal WHERE fabrica='flange'`;
    const jaTem = new Set(existentes.map(r => r.semana));

    let geradas = 0;
    for (const semana of Object.keys(map)) {
      if (new Date(semana + 'T00:00:00Z') >= cutoff) continue; // semana ainda aberta
      if (jaTem.has(semana)) continue;
      await sql`
        INSERT INTO producao_fechamento_semanal (semana_inicio, fabrica, dados, gerado_por_id)
        VALUES (${semana}, 'flange', ${sql.json(map[semana])}, ${user.id})
        ON CONFLICT (semana_inicio, fabrica) DO NOTHING`;
      geradas++;
    }

    return NextResponse.json({ geradas, fechamentos: await listar() });
  } catch (e) {
    console.error('[fechamento POST]', e);
    return NextResponse.json({ erro: 'Erro ao gerar fechamentos' }, { status: 500 });
  }
}
