import { NextResponse } from 'next/server';
import sql from '@/lib/db';
import { autenticar } from '@/lib/middleware';
import { withTimeout } from '@/lib/queryTimeout';
import { getFresh, setCache, getStale } from '@/lib/apiCache';

export const dynamic = 'force-dynamic';

const TZ = 'America/Sao_Paulo';
const CACHE_KEY = 'vendas';
const FRESH_MS = 60_000;
const MAX_STALE_MS = 30 * 60_000;

// Vendas por período (hoje / semana / mês) — usado nas telas de vendas da TV.
// "Vendido" = pedido criado no período (criado_em), no fuso da fábrica. Para cada
// período traz: nº de pedidos, valor total, os maiores pedidos por valor, e o
// ranking de vendedores (valor + nº de pedidos). Valor vem de producao_pedido.valor_total
// (confiável — bate com a soma qtd×valor_unitário). Só staff (valores sensíveis).
export async function GET(req: Request) {
  try {
    const user = await autenticar(req);
    if (user instanceof NextResponse) return user;
    if (!user.is_staff) return NextResponse.json({ erro: 'Sem permissao' }, { status: 403 });

    const cached = getFresh(CACHE_KEY, FRESH_MS);
    if (cached) return NextResponse.json(cached);

    // Um único SELECT cobrindo semana ∪ mês (a semana pode começar antes do mês);
    // hoje ⊂ semana. Depois separo os 3 períodos em JS.
    const q = sql`
      SELECT numero_pedido_venda AS numero,
             cliente,
             COALESCE(NULLIF(TRIM(vendedor), ''), '—') AS vendedor,
             COALESCE(valor_total, 0)::float AS valor,
             (criado_em AT TIME ZONE ${TZ})::date = (NOW() AT TIME ZONE ${TZ})::date AS is_hoje,
             (criado_em AT TIME ZONE ${TZ})::date >= date_trunc('week', (NOW() AT TIME ZONE ${TZ}))::date AS is_semana,
             date_trunc('month', (criado_em AT TIME ZONE ${TZ})) = date_trunc('month', (NOW() AT TIME ZONE ${TZ})) AS is_mes
      FROM producao_pedido
      WHERE (criado_em AT TIME ZONE ${TZ})::date
            >= LEAST(date_trunc('week', (NOW() AT TIME ZONE ${TZ}))::date,
                     date_trunc('month', (NOW() AT TIME ZONE ${TZ}))::date)
    `;
    // Flanges (itens) por período — pra ranquear os mais fabricados por quantidade.
    const qItens = sql`
      SELECT i.codigo,
             i.descricao,
             i.unidade,
             i.quantidade::float AS qtd,
             (p.criado_em AT TIME ZONE ${TZ})::date = (NOW() AT TIME ZONE ${TZ})::date AS is_hoje,
             (p.criado_em AT TIME ZONE ${TZ})::date >= date_trunc('week', (NOW() AT TIME ZONE ${TZ}))::date AS is_semana,
             date_trunc('month', (p.criado_em AT TIME ZONE ${TZ})) = date_trunc('month', (NOW() AT TIME ZONE ${TZ})) AS is_mes
      FROM producao_itempedido i
      JOIN producao_pedido p ON p.id = i.pedido_id
      WHERE (p.criado_em AT TIME ZONE ${TZ})::date
            >= LEAST(date_trunc('week', (NOW() AT TIME ZONE ${TZ}))::date,
                     date_trunc('month', (NOW() AT TIME ZONE ${TZ}))::date)
        AND COALESCE(i.codigo, '') != ''
    `;
    const [rows, itemRows] = await withTimeout(Promise.all([q, qItens]), 27000, [q, qItens]);

    type Row = { numero: string; cliente: string; vendedor: string; valor: number; is_hoje: boolean; is_semana: boolean; is_mes: boolean };
    type ItemRow = { codigo: string; descricao: string; unidade: string; qtd: number; is_hoje: boolean; is_semana: boolean; is_mes: boolean };

    const periodo = (flag: 'is_hoje' | 'is_semana' | 'is_mes') => {
      const ps = (rows as unknown as Row[]).filter(r => r[flag]);
      const top = [...ps]
        .sort((a, b) => b.valor - a.valor)
        .slice(0, 6)
        .map(p => ({ numero: p.numero, cliente: p.cliente, vendedor: p.vendedor, valor: p.valor }));
      const vendMap = new Map<string, { nome: string; pedidos: number; valor: number }>();
      for (const p of ps) {
        const v = vendMap.get(p.vendedor) ?? { nome: p.vendedor, pedidos: 0, valor: 0 };
        v.pedidos += 1;
        v.valor += p.valor;
        vendMap.set(p.vendedor, v);
      }
      const vendedores = Array.from(vendMap.values()).sort((a, b) => b.valor - a.valor);

      // Flanges mais fabricados: soma a quantidade por código no período.
      const its = (itemRows as unknown as ItemRow[]).filter(r => r[flag]);
      const flangeMap = new Map<string, { codigo: string; descricao: string; unidade: string; qtd: number }>();
      for (const it of its) {
        const f = flangeMap.get(it.codigo) ?? { codigo: it.codigo, descricao: it.descricao, unidade: it.unidade, qtd: 0 };
        f.qtd += it.qtd;
        flangeMap.set(it.codigo, f);
      }
      const flanges = Array.from(flangeMap.values()).sort((a, b) => b.qtd - a.qtd).slice(0, 10);

      return {
        pedidos: ps.length,
        valor_total: ps.reduce((s, p) => s + p.valor, 0),
        top,
        vendedores,
        flanges,
      };
    };

    const result = {
      hoje: periodo('is_hoje'),
      semana: periodo('is_semana'),
      mes: periodo('is_mes'),
    };
    setCache(CACHE_KEY, result);
    return NextResponse.json(result);
  } catch (e) {
    console.error('[vendas]', e);
    const stale = getStale(CACHE_KEY, MAX_STALE_MS);
    if (stale) return NextResponse.json(stale);
    return NextResponse.json({ erro: 'Erro ao carregar vendas' }, { status: 500 });
  }
}
