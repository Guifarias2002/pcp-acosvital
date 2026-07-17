import { NextResponse } from 'next/server';
import sql from '@/lib/db';
import { autenticar } from '@/lib/middleware';
import { getFresh, setCache, getStale } from '@/lib/apiCache';

export const dynamic = 'force-dynamic';

const MESES_PT = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
const CACHE_KEY = 'pedidos-por-mes';
const FRESH_MS = 60_000;              // muda muito devagar (por mês) — 60s
const MAX_STALE_MS = 30 * 60_000;

// Quantidade de pedidos criados por mes (ultimos 6 meses, incluindo o atual) —
// usado no comparativo mensal da TV de movimentacao.
export async function GET(req: Request) {
  try {
  const user = await autenticar(req);
  if (user instanceof NextResponse) return user;

  const cached = getFresh(CACHE_KEY, FRESH_MS);
  if (cached) return NextResponse.json(cached);

  const rows = await sql`
    SELECT to_char(date_trunc('month', criado_em), 'YYYY-MM') AS mes, COUNT(*)::int AS qtd
    FROM producao_pedido
    WHERE criado_em >= date_trunc('month', CURRENT_DATE) - INTERVAL '5 months'
    GROUP BY 1
    ORDER BY 1
  `;
  const porMes = new Map(rows.map(r => [r.mes as string, Number(r.qtd)]));

  const meses: { mes: string; label: string; qtd: number }[] = [];
  const hoje = new Date();
  for (let i = 5; i >= 0; i--) {
    const d = new Date(hoje.getFullYear(), hoje.getMonth() - i, 1);
    const chave = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    meses.push({
      mes: chave,
      label: `${MESES_PT[d.getMonth()]}/${String(d.getFullYear()).slice(2)}`,
      qtd: porMes.get(chave) || 0,
    });
  }

  const atual = meses[meses.length - 1].qtd;
  const anterior = meses[meses.length - 2]?.qtd ?? 0;
  const variacaoPct = anterior > 0 ? Math.round(((atual - anterior) / anterior) * 1000) / 10 : null;

  const result = { meses, variacao_pct: variacaoPct };
  setCache(CACHE_KEY, result);
  return NextResponse.json(result);
  } catch (e) {
    console.error('[pedidos-por-mes]', e);
    const stale = getStale(CACHE_KEY, MAX_STALE_MS);
    if (stale) return NextResponse.json(stale);
    return NextResponse.json({ erro: 'Erro ao carregar pedidos por mês' }, { status: 500 });
  }
}
