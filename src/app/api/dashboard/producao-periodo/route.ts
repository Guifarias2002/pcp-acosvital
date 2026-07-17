import { NextResponse } from 'next/server';
import sql from '@/lib/db';
import { autenticar } from '@/lib/middleware';
import { withTimeout } from '@/lib/queryTimeout';
import { getFresh, setCache, getStale } from '@/lib/apiCache';

export const dynamic = 'force-dynamic';

const TZ = 'America/Sao_Paulo';
const CACHE_KEY = 'producao-periodo';
const FRESH_MS = 30_000;
const MAX_STALE_MS = 10 * 60_000;

// Pedidos encaminhados para a produção por período (hoje, semana, mês) — usado
// nas telas de "totais" da TV. "Encaminhado" = quando o pedido entrou na
// produção, ou seja, a PRIMEIRA movimentação dos seus itens. Períodos no fuso
// da fábrica (America/Sao_Paulo). Devolve as contagens (pro comparativo) e as
// listas de hoje e da semana (pros painéis do dia e da semana).
export async function GET(req: Request) {
  try {
    const user = await autenticar(req);
    if (user instanceof NextResponse) return user;

    const cached = getFresh(CACHE_KEY, FRESH_MS);
    if (cached) return NextResponse.json(cached);

    const q = sql`
      WITH prim AS (
        SELECT pedido_id, MIN(criado_em) AS enc
        FROM producao_movimentacaoitem
        GROUP BY pedido_id
      )
      SELECT p.id,
             p.numero_pedido_venda AS numero,
             p.cliente,
             p.prioridade,
             prim.enc,
             (prim.enc AT TIME ZONE ${TZ})::date = (NOW() AT TIME ZONE ${TZ})::date AS is_hoje,
             (prim.enc AT TIME ZONE ${TZ})::date >= date_trunc('week', (NOW() AT TIME ZONE ${TZ}))::date AS is_semana,
             date_trunc('month', (prim.enc AT TIME ZONE ${TZ})) = date_trunc('month', (NOW() AT TIME ZONE ${TZ})) AS is_mes,
             to_char(prim.enc AT TIME ZONE ${TZ}, 'HH24:MI') AS hora,
             to_char(prim.enc AT TIME ZONE ${TZ}, 'DD/MM') AS dia
      FROM prim
      JOIN producao_pedido p ON p.id = prim.pedido_id
      ORDER BY prim.enc DESC
    `;

    const [rows] = await withTimeout(Promise.all([q]), 27000, [q]);

    const mapa = (r: Record<string, unknown>) => ({
      id: r.id,
      numero: r.numero,
      cliente: r.cliente,
      prioridade: r.prioridade,
      hora: r.hora,
      dia: r.dia,
    });

    const hoje = rows.filter(r => r.is_hoje).map(mapa);
    const semana = rows.filter(r => r.is_semana).map(mapa);

    const result = {
      contagem: {
        hoje: rows.filter(r => r.is_hoje).length,
        semana: rows.filter(r => r.is_semana).length,
        mes: rows.filter(r => r.is_mes).length,
      },
      hoje,
      semana,
    };
    setCache(CACHE_KEY, result);
    return NextResponse.json(result);
  } catch (e) {
    console.error('[producao-periodo]', e);
    const stale = getStale(CACHE_KEY, MAX_STALE_MS);
    if (stale) return NextResponse.json(stale);
    return NextResponse.json({ erro: 'Erro ao carregar produção por período' }, { status: 500 });
  }
}
