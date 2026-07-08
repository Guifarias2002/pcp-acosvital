import { NextResponse } from 'next/server';
import sql from '@/lib/db';
import { autenticar } from '@/lib/middleware';
import { SETOR_CHOICES } from '@/lib/types';
import { nomeSector, statusDisplay, formatItem } from '@/lib/queries';

export const dynamic = 'force-dynamic';

// Cache em memoria por instancia serverless (temporario, enquanto o banco atual
// esta sob incidente de capacidade). Evita reconsultar o banco a cada poucos
// segundos e serve o ultimo resultado bom se a consulta nova falhar/estourar o
// tempo, em vez de quebrar a tela.
let cache: { data: unknown; ts: number } | null = null;
const CACHE_FRESH_MS = 5000;
// Acima disso, o fallback de erro para de servir o cache antigo como se fosse
// bom — evita mostrar dado de horas atrás sem aviso se o banco cair por muito
// tempo (o cache "fresco" de 5s é só para reduzir carga no caminho feliz).
const CACHE_MAX_STALE_MS = 5 * 60 * 1000;

// Timeout server-side: garante resposta antes do Vercel matar a função (10s limit).
// Cancela as queries ainda pendentes quando o timeout vence a corrida — sem isso, elas
// continuam rodando no banco e prendem conexões do pool (visto travando o dashboard
// sob carga, já que a conexão é reaproveitada entre requisições).
function withTimeout<T>(promise: Promise<T>, ms: number, cancelables: { cancel: () => void }[] = []): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      for (const q of cancelables) { try { q.cancel(); } catch { /* já finalizada */ } }
      reject(new Error('timeout'));
    }, ms);
    promise.then(
      (v) => { clearTimeout(timer); resolve(v); },
      (e) => { clearTimeout(timer); reject(e); },
    );
  });
}

export async function GET(req: Request) {
  try {
  const user = await autenticar(req);
  if (user instanceof NextResponse) return user;
  if (!user.is_staff) return NextResponse.json({ erro: 'Sem permissao' }, { status: 403 });

  if (cache && Date.now() - cache.ts < CACHE_FRESH_MS) {
    return NextResponse.json(cache.data);
  }

  const qCounts = sql`
    SELECT
      COUNT(*) FILTER (WHERE status != 'entregue')                                   AS total,
      COUNT(*) FILTER (WHERE status = 'emitido')                                     AS a_produzir,
      COUNT(*) FILTER (WHERE status = 'em_producao' AND setor_atual != 'logistica')  AS produzindo,
      COUNT(*) FILTER (WHERE status = 'em_producao' AND setor_atual = 'logistica')   AS mat_concluido,
      COUNT(*) FILTER (WHERE status = 'entregue')                                    AS entregues,
      COUNT(*) FILTER (WHERE prazo_entrega < NOW()::date AND status != 'entregue')   AS atrasados,
      COUNT(*) FILTER (WHERE prioridade = 'urgente' AND status != 'entregue')        AS urgentes,
      COUNT(*) FILTER (WHERE status = 'bloqueado')                                   AS bloqueados
    FROM producao_pedido
  `;

  const qPorSetor = sql`
    SELECT setor_atual, COUNT(*) AS qtd
    FROM producao_itempedido
    WHERE status NOT IN ('entregue', 'cancelado')
    GROUP BY setor_atual
  `;

  // Itens de cada setor para o card "Itens por Setor" do dashboard poder expandir
  // e mostrar pedido/item/etapa - antes so vinha a contagem (qPorSetor), sem os
  // itens em si, entao expandir o setor nunca mostrava nada.
  const qItensPorSetor = sql`
    SELECT i.*, p.numero_pedido_venda AS pedido_numero, p.cliente AS pedido_cliente,
           p.prazo_entrega::text AS pedido_prazo, p.prioridade AS pedido_prioridade, p.roteiro_base
    FROM producao_itempedido i
    JOIN producao_pedido p ON p.id = i.pedido_id
    WHERE i.status NOT IN ('entregue', 'cancelado')
    ORDER BY p.prioridade DESC, p.prazo_entrega ASC
  `;

  const qAtrasados = sql`
    SELECT id, numero_pedido_venda, cliente, prazo_entrega::text, prioridade, status
    FROM producao_pedido
    WHERE prazo_entrega < NOW()::date AND status != 'entregue'
    ORDER BY prazo_entrega ASC
    LIMIT 10
  `;

  const qUltMovs = sql`
    SELECT m.id, m.setor_origem, m.setor_destino, m.status_anterior, m.status_novo,
           m.observacao, m.criado_em,
           i.codigo AS item_codigo, p.numero_pedido_venda,
           u.nome   AS usuario_nome
    FROM producao_movimentacaoitem m
    JOIN producao_itempedido i ON i.id = m.item_id
    LEFT JOIN producao_pedido p ON p.id = i.pedido_id
    LEFT JOIN usuarios_usuario u ON u.id = m.usuario_id
    ORDER BY m.criado_em DESC
    LIMIT 15
  `;

  const qDivCounts = sql`
    SELECT
      COUNT(*) FILTER (WHERE status IN ('aberta','em_analise'))                            AS abertas,
      COUNT(*) FILTER (WHERE status IN ('aberta','em_analise') AND prioridade = 'urgente') AS urgentes
    FROM producao_divergencia
  `;

  const [
    countsRows,
    porSetorRows,
    itensPorSetorRows,
    pedidosAtrasados,
    ultMovs,
    divCountsRows,
  ] = await withTimeout(Promise.all([
    qCounts.catch(() => [{}]),
    qPorSetor.catch(() => []),
    qItensPorSetor.catch(() => []),
    qAtrasados.catch(() => []),
    qUltMovs.catch(() => []),
    qDivCounts.catch(() => [{ abertas: 0, urgentes: 0 }]),
  ]), 27000, [qCounts, qPorSetor, qItensPorSetor, qAtrasados, qUltMovs, qDivCounts]); // 27s — Vercel mata em 30s (temporario, ver vercel.json), deixa margem para serializar resposta

  const counts = (countsRows[0] ?? {}) as Record<string, unknown>;
  const divCounts = divCountsRows[0] ?? { abertas: 0, urgentes: 0 };

  const setorQtdMap: Record<string, number> = {};
  for (const row of porSetorRows) setorQtdMap[row.setor_atual] = Number(row.qtd);

  const porSetor = SETOR_CHOICES
    .map(([cod, nome]) => ({
      cod, nome,
      qtd: setorQtdMap[cod] ?? 0,
      qtd_chegando: 0,
      valor: null,
      itens: itensPorSetorRows.filter(i => i.setor_atual === cod).map(i => formatItem(i)),
    }))
    .filter(s => s.qtd > 0);

  const result = {
    total:           Number(counts.total),
    a_produzir:      Number(counts.a_produzir),
    ag_recebimento:  0,
    produzindo:      Number(counts.produzindo),
    mat_concluido:   Number(counts.mat_concluido),
    entregues:       Number(counts.entregues),
    atrasados:       Number(counts.atrasados),
    urgentes:        Number(counts.urgentes),
    bloqueados:      Number(counts.bloqueados),
    valor_a_produzir:  null,
    valor_em_producao: null,
    valor_concluido:   null,
    por_setor: porSetor,
    pedidos_atrasados: pedidosAtrasados,
    ultimas_movimentacoes: ultMovs.map(m => ({
      id: m.id,
      item_codigo: m.item_codigo,
      numero_pedido_venda: m.numero_pedido_venda,
      setor_origem: m.setor_origem,       setor_origem_nome: nomeSector(m.setor_origem),
      setor_destino: m.setor_destino,     setor_destino_nome: nomeSector(m.setor_destino),
      status_anterior: m.status_anterior, status_anterior_display: statusDisplay(m.status_anterior),
      status_novo: m.status_novo,         status_novo_display: statusDisplay(m.status_novo),
      observacao: m.observacao || '',
      usuario_nome: m.usuario_nome || 'Sistema',
      criado_em: m.criado_em,
    })),
    divergencias_abertas:  Number(divCounts.abertas),
    divergencias_urgentes: Number(divCounts.urgentes),
  };
  cache = { data: result, ts: Date.now() };
  return NextResponse.json(result);
  } catch (e) {
    console.error('[dashboard] erro:', e);
    if (cache && Date.now() - cache.ts < CACHE_MAX_STALE_MS) return NextResponse.json(cache.data);
    return NextResponse.json({ erro: 'Erro ao carregar dashboard' }, { status: 500 });
  }
}
