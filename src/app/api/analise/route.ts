import { NextResponse } from 'next/server';
import sql from '@/lib/db';
import { autenticar } from '@/lib/middleware';
import { isAdministrador } from '@/lib/auth';
import { withTimeout } from '@/lib/queryTimeout';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// Executa as queries em LOTES pequenos (não todas de uma vez). O banco é
// compartilhado/enxuto e disparar 13 queries simultâneas afoga o pool de
// conexões e trava a função (visto em prod: timeout de 55s). Lotes de 4 mantêm
// a carga baixa — cada query é rápida, o custo de serializar é pequeno.
async function runChunked<T>(queries: { catch: (f: () => unknown) => Promise<T>; cancel: () => void }[], size: number, perChunkMs: number): Promise<T[]> {
  const out: T[] = [];
  for (let i = 0; i < queries.length; i += size) {
    const chunk = queries.slice(i, i + size);
    const r = await withTimeout(Promise.all(chunk.map(q => q.catch(() => [] as unknown as T))), perChunkMs, chunk);
    out.push(...r);
  }
  return out;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
// Setores válidos aceitos no filtro (evita injeção via lista de setores).
const SETORES_OK = new Set([
  'emissao', 'usinagem', 'maçarico', 'plasma', 'laser', 'serra', 'estoque',
  'furacao', 'qualidade', 'acabamento', 'logistica', 'recebimento', 'compras',
  'beneficiadores', 'embalagem', 'quarentena', 'desenho',
]);

// Análise de PCP (fábrica de Flanges). Só administrador.
// Params: de, ate (YYYY-MM-DD), setores (csv). "flange" = COALESCE(fabrica,'flange').
export async function GET(req: Request) {
  try {
    const user = await autenticar(req);
    if (user instanceof NextResponse) return user;
    if (!isAdministrador(user)) return NextResponse.json({ erro: 'Sem permissao' }, { status: 403 });

    const url = new URL(req.url);
    const deP = url.searchParams.get('de');
    const ateP = url.searchParams.get('ate');
    if (deP && !DATE_RE.test(deP)) return NextResponse.json({ erro: 'Parâmetro "de" inválido' }, { status: 400 });
    if (ateP && !DATE_RE.test(ateP)) return NextResponse.json({ erro: 'Parâmetro "ate" inválido' }, { status: 400 });

    // Período padrão: últimas 4 semanas
    const hoje = new Date();
    const quatroSem = new Date(hoje); quatroSem.setDate(hoje.getDate() - 28);
    const de = (deP ? new Date(deP + 'T00:00:00') : quatroSem).toISOString();
    const ate = (ateP ? new Date(ateP + 'T23:59:59') : hoje).toISOString();

    const setores = (url.searchParams.get('setores') || '')
      .split(',').map(s => s.trim()).filter(s => s && SETORES_OK.has(s));
    // Fragmentos de filtro por setor (só quando há seleção)
    const fDest = setores.length ? sql`AND m.setor_destino IN ${sql(setores)}` : sql``;
    const fOrig = setores.length ? sql`AND COALESCE(m.setor_origem, m.setor_destino) IN ${sql(setores)}` : sql``;
    const fAtual = setores.length ? sql`AND i.setor_atual IN ${sql(setores)}` : sql``;

    const FLANGE = sql`COALESCE(i.fabrica,'flange') = 'flange' AND i.inativo IS NOT TRUE`;

    // ── 1. Etapas atuais (nível pedido) — mesma regra do Dashboard ────────────
    const qEtapas = sql`
      SELECT
        COUNT(*) FILTER (WHERE status = 'entregue')                                                  AS entregue,
        COUNT(*) FILTER (WHERE status != 'entregue' AND setor_atual = 'emissao')                     AS a_produzir,
        COUNT(*) FILTER (WHERE status != 'entregue' AND setor_atual IS DISTINCT FROM 'emissao')      AS produzindo,
        COUNT(*) FILTER (WHERE prazo_entrega < NOW()::date AND status != 'entregue')                 AS atrasados,
        COUNT(*)                                                                                     AS total
      FROM producao_pedido`;

    // ── 2. Volume no período (itens criados) ─────────────────────────────────
    const qVolume = sql`
      SELECT COUNT(DISTINCT i.pedido_id) AS pedidos, COUNT(*) AS itens,
             COALESCE(SUM(i.quantidade), 0) AS pecas
      FROM producao_itempedido i
      WHERE ${FLANGE} AND i.criado_em BETWEEN ${de} AND ${ate}`;

    // ── 3. Por setor: peças e itens finalizados (etapa concluída) no período ───
    // pecas = soma da quantidade dos itens, contando cada item UMA vez por setor
    // (rn=1) — senão retrabalho no mesmo setor contaria a peça 2x.
    const qThroughput = sql`
      SELECT setor,
             COUNT(*) AS finalizacoes,
             COUNT(DISTINCT item_id) AS itens,
             COALESCE(SUM(CASE WHEN rn = 1 THEN quantidade ELSE 0 END), 0) AS pecas
      FROM (
        SELECT COALESCE(m.setor_origem, m.setor_destino) AS setor, m.item_id, i.quantidade,
               ROW_NUMBER() OVER (PARTITION BY COALESCE(m.setor_origem, m.setor_destino), m.item_id ORDER BY m.criado_em) AS rn
        FROM producao_movimentacaoitem m
        JOIN producao_itempedido i ON i.id = m.item_id AND ${FLANGE}
        WHERE m.status_novo = 'finalizado_setor' AND m.criado_em BETWEEN ${de} AND ${ate} ${fOrig}
      ) t
      GROUP BY setor ORDER BY pecas DESC`;

    // ── 4. Semanal — criados, finalizações, entregues ─────────────────────────
    const qSemCriados = sql`
      SELECT date_trunc('week', i.criado_em)::date AS semana,
             COUNT(*) AS itens, COALESCE(SUM(i.quantidade),0) AS pecas, COUNT(DISTINCT i.pedido_id) AS pedidos
      FROM producao_itempedido i
      WHERE ${FLANGE} AND i.criado_em BETWEEN ${de} AND ${ate}
      GROUP BY 1 ORDER BY 1`;
    // "Finalizados" = itens que CHEGARAM na Logística (produção concluída,
    // pronta pra expedir). Conta a 1ª chegada de cada item na logística.
    const qSemFinal = sql`
      WITH cheg AS (
        SELECT m.item_id, MIN(m.criado_em) AS t
        FROM producao_movimentacaoitem m
        JOIN producao_itempedido i ON i.id = m.item_id AND ${FLANGE}
        WHERE m.setor_destino = 'logistica' GROUP BY 1)
      SELECT date_trunc('week', c.t)::date AS semana, COUNT(*) AS finalizacoes,
             COALESCE(SUM(i.quantidade), 0) AS pecas
      FROM cheg c JOIN producao_itempedido i ON i.id = c.item_id
      WHERE c.t BETWEEN ${de} AND ${ate} GROUP BY 1 ORDER BY 1`;
    const qSemEntregas = sql`
      WITH ent AS (
        SELECT m.item_id, MIN(m.criado_em) t
        FROM producao_movimentacaoitem m
        JOIN producao_itempedido i ON i.id = m.item_id AND ${FLANGE}
        WHERE m.status_novo = 'entregue' GROUP BY 1)
      SELECT date_trunc('week', e.t)::date AS semana, COUNT(*) AS concluidos,
             COALESCE(SUM(i.quantidade),0) AS pecas
      FROM ent e JOIN producao_itempedido i ON i.id = e.item_id
      WHERE e.t BETWEEN ${de} AND ${ate}
      GROUP BY 1 ORDER BY 1`;

    // ── 5. Tempo por etapa (dwell entre setores, no período) ──────────────────
    const qTempoEtapa = sql`
      WITH ev AS (
        SELECT m.item_id, m.criado_em, COALESCE(m.setor_destino,'(nulo)') AS setor, m.status_novo,
               LEAD(m.criado_em) OVER (PARTITION BY m.item_id ORDER BY m.criado_em, m.id) AS next_t
        FROM producao_movimentacaoitem m
        JOIN producao_itempedido i ON i.id = m.item_id AND ${FLANGE}
      ), iv AS (
        SELECT setor, status_novo, (EXTRACT(EPOCH FROM (next_t - criado_em))/3600.0)::numeric AS horas
        FROM ev WHERE next_t IS NOT NULL AND criado_em BETWEEN ${de} AND ${ate}
          ${setores.length ? sql`AND setor IN ${sql(setores)}` : sql``}
      )
      SELECT setor, COUNT(*) AS n,
             ROUND(AVG(horas),1) AS media_h,
             ROUND((percentile_cont(0.5) WITHIN GROUP (ORDER BY horas))::numeric,1) AS mediana_h,
             ROUND(AVG(horas) FILTER (WHERE status_novo IN ('aguardando','recebido','criado')),1) AS espera_h,
             ROUND(AVG(horas) FILTER (WHERE status_novo = 'em_andamento'),1) AS proc_h,
             ROUND(AVG(horas) FILTER (WHERE status_novo = 'pausado'),1) AS parada_h
      FROM iv GROUP BY setor ORDER BY SUM(horas) DESC`;

    // ── 6. Lead time (itens entregues no período) ─────────────────────────────
    const qLead = sql`
      WITH fst AS (
        SELECT m.item_id, MIN(m.criado_em) t0 FROM producao_movimentacaoitem m
        JOIN producao_itempedido i ON i.id = m.item_id AND ${FLANGE} GROUP BY 1),
      ent AS (SELECT m.item_id, MIN(m.criado_em) t1 FROM producao_movimentacaoitem m
        WHERE m.status_novo='entregue' GROUP BY 1)
      SELECT COUNT(*) n,
             ROUND(AVG((EXTRACT(EPOCH FROM (e.t1-f.t0))/86400.0)::numeric),1) media_dias,
             ROUND((percentile_cont(0.5) WITHIN GROUP (ORDER BY (EXTRACT(EPOCH FROM (e.t1-f.t0))/86400.0)))::numeric,1) mediana_dias,
             ROUND(MIN((EXTRACT(EPOCH FROM (e.t1-f.t0))/86400.0)::numeric),1) min_dias,
             ROUND(MAX((EXTRACT(EPOCH FROM (e.t1-f.t0))/86400.0)::numeric),1) max_dias
      FROM ent e JOIN fst f ON f.item_id = e.item_id
      WHERE e.t1 BETWEEN ${de} AND ${ate}`;

    // ── 7. WIP atual + idade (itens parados agora, por setor) ─────────────────
    const qWip = sql`
      WITH ev AS (
        SELECT m.item_id, m.criado_em, COALESCE(m.setor_destino,'(nulo)') AS setor,
               ROW_NUMBER() OVER (PARTITION BY m.item_id ORDER BY m.criado_em DESC, m.id DESC) rn
        FROM producao_movimentacaoitem m
        JOIN producao_itempedido i ON i.id = m.item_id AND ${FLANGE} AND i.status <> 'entregue')
      SELECT setor, COUNT(*) AS itens,
             ROUND(AVG((EXTRACT(EPOCH FROM (NOW() - criado_em))/86400.0)::numeric),1) AS idade_media,
             ROUND(MAX((EXTRACT(EPOCH FROM (NOW() - criado_em))/86400.0)::numeric),1) AS idade_max
      FROM ev WHERE rn = 1 ${setores.length ? sql`AND setor IN ${sql(setores)}` : sql``}
      GROUP BY setor ORDER BY itens DESC`;

    // ── 8. Ordens paradas há mais tempo (em produção) ─────────────────────────
    const qTopParadas = sql`
      WITH ev AS (
        SELECT m.item_id, m.criado_em, COALESCE(m.setor_destino,'(nulo)') AS setor,
               ROW_NUMBER() OVER (PARTITION BY m.item_id ORDER BY m.criado_em DESC, m.id DESC) rn
        FROM producao_movimentacaoitem m
        JOIN producao_itempedido i ON i.id = m.item_id AND ${FLANGE} AND i.status <> 'entregue')
      SELECT p.numero_pedido_venda AS pv, i.codigo, LEFT(i.descricao,44) AS descricao, ev.setor,
             ROUND((EXTRACT(EPOCH FROM (NOW() - ev.criado_em))/86400.0)::numeric,1) AS dias
      FROM ev JOIN producao_itempedido i ON i.id = ev.item_id
      JOIN producao_pedido p ON p.id = i.pedido_id
      WHERE ev.rn = 1 ${setores.length ? sql`AND ev.setor IN ${sql(setores)}` : sql``}
      ORDER BY ev.criado_em ASC LIMIT 12`;

    // ── 9. Mix por tipo e norma (itens criados no período) ────────────────────
    const qMixTipo = sql`
      SELECT tipo, COUNT(*) itens, COALESCE(SUM(quantidade),0) pecas FROM (
        SELECT quantidade, CASE
          WHEN descricao ILIKE '%CEGO%' THEN 'Cego'
          WHEN descricao ILIKE '%SOBREPOSTO%' THEN 'Sobreposto'
          WHEN descricao ILIKE '%SOLTO%' OR descricao ILIKE '%PEAD%' THEN 'Solto p/ PEAD'
          WHEN descricao ILIKE '%PESTANA%' THEN 'Pestana'
          WHEN descricao ILIKE '%ANEL%' THEN 'Anel'
          WHEN descricao ILIKE '%DISCO%' THEN 'Disco'
          WHEN descricao ILIKE '%LISO%' THEN 'Liso'
          WHEN descricao ILIKE '%FLANGE%' THEN 'Outro flange'
          ELSE 'Não classificado' END tipo
        FROM producao_itempedido i
        WHERE ${FLANGE} AND i.criado_em BETWEEN ${de} AND ${ate}
      ) t GROUP BY 1 ORDER BY 3 DESC`;

    // ── 10. Produtividade por líder (movimentações no período) ────────────────
    const qLideres = sql`
      SELECT u.nome, u.setor, u.perfil,
             COUNT(*) FILTER (WHERE m.status_novo='finalizado_setor') AS finalizacoes,
             COUNT(*) FILTER (WHERE m.status_novo='em_andamento') AS inicios,
             COUNT(*) AS total_mov
      FROM producao_movimentacaoitem m
      JOIN producao_itempedido i ON i.id = m.item_id AND ${FLANGE}
      LEFT JOIN usuarios_usuario u ON u.id = m.usuario_id
      WHERE m.criado_em BETWEEN ${de} AND ${ate} ${fDest}
      GROUP BY 1,2,3 ORDER BY total_mov DESC LIMIT 15`;

    // ── 10.1 Apontamento por máquina/operador (Usinagem/Furação) ──────────────
    const qMaquinas = sql`
      SELECT ip.maquina, ip.operador, ip.setor_atual AS setor,
             COUNT(*) AS inicios,
             COALESCE(SUM(ip.quantidade), 0) AS pecas
      FROM producao_itemparcial ip
      JOIN producao_itempedido i ON i.id = ip.item_pedido_id AND ${FLANGE}
      WHERE ip.maquina IS NOT NULL AND ip.iniciado_em BETWEEN ${de} AND ${ate}
      GROUP BY 1,2,3 ORDER BY inicios DESC LIMIT 15`;

    // ── 11. Atrasos por setor (atuais) ────────────────────────────────────────
    const qAtrasoSetor = sql`
      SELECT i.setor_atual AS setor, COUNT(DISTINCT p.id) AS pedidos, COUNT(*) AS itens
      FROM producao_pedido p JOIN producao_itempedido i ON i.pedido_id = p.id
      WHERE p.prazo_entrega < NOW()::date AND p.status <> 'entregue'
        AND ${FLANGE} AND i.status <> 'entregue' ${fAtual}
      GROUP BY 1 ORDER BY 2 DESC`;

    // ── 12. Produtos cadastrados (TODO o histórico) — nº de pedidos e peças ────
    const qProdutos = sql`
      SELECT i.codigo, MAX(i.descricao) AS descricao,
             COUNT(DISTINCT i.pedido_id) AS pedidos,
             COALESCE(SUM(i.quantidade), 0) AS pecas, COUNT(*) AS itens
      FROM producao_itempedido i WHERE ${FLANGE}
      GROUP BY i.codigo ORDER BY pecas DESC LIMIT 100`;

    const queries = [qEtapas, qVolume, qThroughput, qSemCriados, qSemFinal, qSemEntregas,
      qTempoEtapa, qLead, qWip, qTopParadas, qMixTipo, qLideres, qMaquinas, qAtrasoSetor, qProdutos];
    const [etapas, volume, throughput, semCriados, semFinal, semEntregas,
      tempoEtapa, lead, wip, topParadas, mixTipo, lideres, maquinas, atrasoSetor, produtos] =
      await runChunked(queries as never[], 4, 20000) as Record<string, unknown>[][];

    const num = (v: unknown) => Number(v || 0);
    return NextResponse.json({
      periodo: { de: de.slice(0, 10), ate: ate.slice(0, 10), setores },
      etapas: etapas[0] || {},
      volume: volume[0] || {},
      throughput: throughput.map((r: Record<string, unknown>) => ({ setor: r.setor, finalizacoes: num(r.finalizacoes), itens: num(r.itens), pecas: num(r.pecas) })),
      semanal: { criados: semCriados, final: semFinal, entregas: semEntregas },
      tempo_etapa: tempoEtapa,
      lead: lead[0] || {},
      wip,
      top_paradas: topParadas,
      mix_tipo: mixTipo,
      lideres,
      maquinas,
      atraso_setor: atrasoSetor,
      produtos,
    });
  } catch (e) {
    console.error('[analise]', e);
    return NextResponse.json({ erro: 'Erro ao gerar análise' }, { status: 500 });
  }
}
