import { NextResponse } from 'next/server';
import sql from '@/lib/db';
import { autenticar } from '@/lib/middleware';
import { nomeSector } from '@/lib/queries';
import { withTimeout } from '@/lib/queryTimeout';
import { getFresh, setCache, getStale } from '@/lib/apiCache';

const CACHE_KEY = 'comparativo-velocidade';
const FRESH_MS = 30_000;              // agregado que muda devagar — 30s serve
const MAX_STALE_MS = 10 * 60_000;     // fallback de erro

export const dynamic = 'force-dynamic';

// Fuso da fábrica — "ontem" e "mês atual" têm que ser no horário local (Brasil),
// senão o corte do dia sai errado à noite (servidor roda em UTC).
const TZ = 'America/Sao_Paulo';

// Usuários que NÃO entram no ranking de velocidade (perfis que não representam
// produção real — pedido do usuário). Danilo Barranco = id 6.
const EXCLUIR_RANKING_USUARIOS = [6];

// Comparativo de velocidade da produção — usado na 4ª tela da TV de movimentação.
// Mede quem/qual é mais rápido a partir do tempo que a peça fica em cada setor.
//
// Precisão ("tem que ser real"): pareia cada entrada da peça num setor com a
// movimentação IMEDIATAMENTE seguinte dela (LEAD na linha do tempo do item), em
// vez de casar com todas as saídas seguintes. Assim uma peça que volta pro mesmo
// setor (retrabalho) não infla o tempo com pares fantasmas.
//   • Setores  → tempo entre a peça chegar no setor e a próxima ação nela.
//   • Usuários → mesmo tempo, atribuído a quem fez a próxima ação (encaminhou).
//
// Períodos: mês atual e dia anterior (ontem), ancorados em quando a ação que
// FECHOU o intervalo aconteceu (proximo_em). Cada um traz média por peça, total
// somado e nº de amostras.
export async function GET(req: Request) {
  try {
    const user = await autenticar(req);
    if (user instanceof NextResponse) return user;

    const cached = getFresh(CACHE_KEY, FRESH_MS);
    if (cached) return NextResponse.json(cached);

    const qSetores = sql`
      WITH mov AS (
        SELECT m.item_id,
               m.setor_destino AS setor,
               m.criado_em,
               LEAD(m.criado_em)  OVER (PARTITION BY m.item_id ORDER BY m.criado_em) AS proximo_em,
               LEAD(m.usuario_id) OVER (PARTITION BY m.item_id ORDER BY m.criado_em) AS proximo_usuario
        FROM producao_movimentacaoitem m
        WHERE m.setor_destino != ''
      ),
      dwell AS (
        SELECT setor,
               EXTRACT(EPOCH FROM (proximo_em - criado_em)) / 60.0 AS minutos,
               (proximo_em AT TIME ZONE ${TZ})::date AS dia_local,
               date_trunc('month', (proximo_em AT TIME ZONE ${TZ})) AS mes_local
        FROM mov
        WHERE proximo_em IS NOT NULL
      )
      SELECT setor,
        ROUND(AVG(minutos) FILTER (WHERE mes_local = date_trunc('month', (NOW() AT TIME ZONE ${TZ}))))::int AS mes_medio,
        ROUND(SUM(minutos) FILTER (WHERE mes_local = date_trunc('month', (NOW() AT TIME ZONE ${TZ}))))::int AS mes_total,
        COUNT(*)          FILTER (WHERE mes_local = date_trunc('month', (NOW() AT TIME ZONE ${TZ})))::int AS mes_amostras,
        ROUND(AVG(minutos) FILTER (WHERE dia_local = ((NOW() AT TIME ZONE ${TZ})::date - 1)))::int AS ontem_medio,
        ROUND(SUM(minutos) FILTER (WHERE dia_local = ((NOW() AT TIME ZONE ${TZ})::date - 1)))::int AS ontem_total,
        COUNT(*)          FILTER (WHERE dia_local = ((NOW() AT TIME ZONE ${TZ})::date - 1))::int AS ontem_amostras,
        ROUND(AVG(minutos) FILTER (WHERE dia_local = (NOW() AT TIME ZONE ${TZ})::date))::int AS hoje_medio,
        ROUND(SUM(minutos) FILTER (WHERE dia_local = (NOW() AT TIME ZONE ${TZ})::date))::int AS hoje_total,
        COUNT(*)          FILTER (WHERE dia_local = (NOW() AT TIME ZONE ${TZ})::date)::int AS hoje_amostras
      FROM dwell
      GROUP BY setor
    `;

    const qUsuarios = sql`
      WITH mov AS (
        SELECT m.item_id,
               m.criado_em,
               LEAD(m.criado_em)  OVER (PARTITION BY m.item_id ORDER BY m.criado_em) AS proximo_em,
               LEAD(m.usuario_id) OVER (PARTITION BY m.item_id ORDER BY m.criado_em) AS proximo_usuario
        FROM producao_movimentacaoitem m
        WHERE m.setor_destino != ''
      ),
      dwell AS (
        SELECT proximo_usuario AS usuario_id,
               EXTRACT(EPOCH FROM (proximo_em - criado_em)) / 60.0 AS minutos,
               (proximo_em AT TIME ZONE ${TZ})::date AS dia_local,
               date_trunc('month', (proximo_em AT TIME ZONE ${TZ})) AS mes_local
        FROM mov
        WHERE proximo_em IS NOT NULL AND proximo_usuario IS NOT NULL
      )
      SELECT d.usuario_id AS uid, u.nome AS nome,
        ROUND(AVG(minutos) FILTER (WHERE mes_local = date_trunc('month', (NOW() AT TIME ZONE ${TZ}))))::int AS mes_medio,
        ROUND(SUM(minutos) FILTER (WHERE mes_local = date_trunc('month', (NOW() AT TIME ZONE ${TZ}))))::int AS mes_total,
        COUNT(*)          FILTER (WHERE mes_local = date_trunc('month', (NOW() AT TIME ZONE ${TZ})))::int AS mes_amostras,
        ROUND(AVG(minutos) FILTER (WHERE dia_local = ((NOW() AT TIME ZONE ${TZ})::date - 1)))::int AS ontem_medio,
        ROUND(SUM(minutos) FILTER (WHERE dia_local = ((NOW() AT TIME ZONE ${TZ})::date - 1)))::int AS ontem_total,
        COUNT(*)          FILTER (WHERE dia_local = ((NOW() AT TIME ZONE ${TZ})::date - 1))::int AS ontem_amostras,
        ROUND(AVG(minutos) FILTER (WHERE dia_local = (NOW() AT TIME ZONE ${TZ})::date))::int AS hoje_medio,
        ROUND(SUM(minutos) FILTER (WHERE dia_local = (NOW() AT TIME ZONE ${TZ})::date))::int AS hoje_total,
        COUNT(*)          FILTER (WHERE dia_local = (NOW() AT TIME ZONE ${TZ})::date)::int AS hoje_amostras
      FROM dwell d
      JOIN usuarios_usuario u ON u.id = d.usuario_id
      WHERE d.usuario_id <> ALL(${EXCLUIR_RANKING_USUARIOS})
      GROUP BY d.usuario_id, u.nome
    `;

    const [setores, usuarios] = await withTimeout(
      Promise.all([qSetores, qUsuarios]),
      27000, // 27s — Vercel mata em 30s (temporário, ver vercel.json)
      [qSetores, qUsuarios],
    );

    // Monta os dois períodos a partir das linhas achatadas, filtra quem não teve
    // amostra no período e ordena do mais rápido (menor média) pro mais devagar.
    const setorPeriodo = (janela: 'mes' | 'ontem' | 'hoje') =>
      setores
        .map(r => ({
          setor: r.setor,
          setor_nome: nomeSector(r.setor),
          tempo_medio_min: Number(r[`${janela}_medio`] || 0),
          tempo_total_min: Number(r[`${janela}_total`] || 0),
          amostras: Number(r[`${janela}_amostras`] || 0),
        }))
        .filter(x => x.amostras > 0)
        .sort((a, b) => a.tempo_medio_min - b.tempo_medio_min);

    const usuarioPeriodo = (janela: 'mes' | 'ontem' | 'hoje') =>
      usuarios
        .map(r => ({
          id: r.uid,
          nome: r.nome || 'Sem nome',
          tempo_medio_min: Number(r[`${janela}_medio`] || 0),
          tempo_total_min: Number(r[`${janela}_total`] || 0),
          amostras: Number(r[`${janela}_amostras`] || 0),
        }))
        .filter(x => x.amostras > 0)
        .sort((a, b) => a.tempo_medio_min - b.tempo_medio_min);

    const result = {
      hoje: { setores: setorPeriodo('hoje'), usuarios: usuarioPeriodo('hoje') },
      mes: { setores: setorPeriodo('mes'), usuarios: usuarioPeriodo('mes') },
      ontem: { setores: setorPeriodo('ontem'), usuarios: usuarioPeriodo('ontem') },
    };
    setCache(CACHE_KEY, result);
    return NextResponse.json(result);
  } catch (e) {
    console.error('[comparativo-velocidade]', e);
    const stale = getStale(CACHE_KEY, MAX_STALE_MS);
    if (stale) return NextResponse.json(stale);
    return NextResponse.json({ erro: 'Erro ao carregar comparativo de velocidade' }, { status: 500 });
  }
}
