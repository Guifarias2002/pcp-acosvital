import { NextResponse } from 'next/server';
import sql from '@/lib/db';
import { autenticar } from '@/lib/middleware';
import { SETOR_CHOICES } from '@/lib/types';
import { nomeSector, corStatus, statusDisplay } from '@/lib/queries';
import { withTimeout } from '@/lib/queryTimeout';

// Parciais ativas — mesmo conjunto de status usado nas telas de setor
// (/api/setor/[setor]), pra o Kanban ser um espelho fiel de onde a peça
// realmente está (um item pode ter parciais em vários setores ao mesmo tempo).
const STATUS_PARCIAL_ATIVA = ['em_aberto', 'recebido', 'em_andamento', 'finalizado_setor', 'pausado', 'concluida'];

export const dynamic = 'force-dynamic';

// Cache em memoria por instancia serverless (temporario, enquanto o banco atual
// esta sob incidente de capacidade). Chaveado por setor+permissao financeira,
// porque a resposta varia por usuario (operador so ve o proprio setor, valor
// financeiro mascarado pra lider) — nao pode ser um cache unico compartilhado.
const cache = new Map<string, { data: unknown; ts: number }>();
const CACHE_FRESH_MS = 5000;
// Acima disso, o fallback de erro para de servir o cache antigo como se fosse
// bom — evita mostrar dado de horas atrás sem aviso se o banco cair por muito
// tempo (o cache "fresco" de 5s é só para reduzir carga no caminho feliz).
const CACHE_MAX_STALE_MS = 5 * 60 * 1000;

export async function GET(req: Request) {
  let cacheKey: string | null = null;
  try {
  const user = await autenticar(req);
  if (user instanceof NextResponse) return user;

  // Operadores veem apenas o próprio setor
  const filtroSetor = !user.is_staff && user.setor ? user.setor : null;
  const verFinanceiro = user.is_staff && user.perfil !== 'lider';
  cacheKey = `${filtroSetor ?? 'all'}:${verFinanceiro ? '1' : '0'}`;

  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.ts < CACHE_FRESH_MS) {
    return NextResponse.json(cached.data);
  }

  const qItens =
    filtroSetor
      ? sql`
          SELECT pa.id, pa.quantidade::text AS quantidade_pendente, pa.status, pa.setor_atual,
                 i.codigo, i.unidade, i.id AS item_pedido_id,
                 p.id AS pedido_id, p.numero_pedido_venda AS pedido_numero, p.cliente AS pedido_cliente,
                 p.prazo_entrega::text AS pedido_prazo_iso, p.prioridade AS pedido_prioridade
          FROM producao_itemparcial pa
          JOIN producao_itempedido i ON i.id = pa.item_pedido_id
          JOIN producao_pedido p ON p.id = pa.pedido_id
          WHERE pa.status = ANY(${STATUS_PARCIAL_ATIVA}) AND pa.setor_atual = ${filtroSetor}
          ORDER BY p.prioridade DESC, p.prazo_entrega ASC
        `
      : sql`
          SELECT pa.id, pa.quantidade::text AS quantidade_pendente, pa.status, pa.setor_atual,
                 i.codigo, i.unidade, i.id AS item_pedido_id,
                 p.id AS pedido_id, p.numero_pedido_venda AS pedido_numero, p.cliente AS pedido_cliente,
                 p.prazo_entrega::text AS pedido_prazo_iso, p.prioridade AS pedido_prioridade
          FROM producao_itemparcial pa
          JOIN producao_itempedido i ON i.id = pa.item_pedido_id
          JOIN producao_pedido p ON p.id = pa.pedido_id
          WHERE pa.status = ANY(${STATUS_PARCIAL_ATIVA})
          ORDER BY p.prioridade DESC, p.prazo_entrega ASC
        `;

  const qLotes =
    filtroSetor
      ? sql`
          SELECT l.id, l.quantidade::text AS quantidade, l.status,
                 l.setor_origem, l.setor_destino,
                 i.codigo AS item_codigo, i.unidade, i.id AS item_pedido_id,
                 p.numero_pedido_venda, p.cliente, p.prioridade,
                 p.prazo_entrega::text AS pedido_prazo
          FROM producao_loteitem l
          JOIN producao_itempedido i ON i.id = l.item_pedido_id
          JOIN producao_pedido p ON p.id = i.pedido_id
          WHERE l.status = 'em_producao' AND l.setor_destino = ${filtroSetor}
          ORDER BY p.prazo_entrega ASC
        `
      : sql`
          SELECT l.id, l.quantidade::text AS quantidade, l.status,
                 l.setor_origem, l.setor_destino,
                 i.codigo AS item_codigo, i.unidade, i.id AS item_pedido_id,
                 p.numero_pedido_venda, p.cliente, p.prioridade,
                 p.prazo_entrega::text AS pedido_prazo
          FROM producao_loteitem l
          JOIN producao_itempedido i ON i.id = l.item_pedido_id
          JOIN producao_pedido p ON p.id = i.pedido_id
          WHERE l.status = 'em_producao'
          ORDER BY p.prazo_entrega ASC
        `;

  const [itens, lotes] = await withTimeout(
    Promise.all([qItens, qLotes]),
    27000, // 27s — Vercel mata em 30s (temporario, ver vercel.json)
    [qItens, qLotes],
  );

  const setoresFiltrados = filtroSetor
    ? SETOR_CHOICES.filter(([cod]) => cod === filtroSetor)
    : SETOR_CHOICES;
  const setores = setoresFiltrados.map(([cod, nome]) => ({
    cod,
    nome,
    // Cada card representa uma PARCIAL (não o item inteiro) — assim um item
    // dividido entre setores aparece em cada coluna onde de fato tem peça,
    // com a quantidade real daquele pedaço (espelha a tela de setor).
    itens: itens.filter(i => i.setor_atual === cod).map(i => ({
      id: i.id,
      item_pedido_id: i.item_pedido_id,
      pedido_id: i.pedido_id,
      pedido_numero: i.pedido_numero,
      pedido_cliente: i.pedido_cliente,
      pedido_prioridade: i.pedido_prioridade,
      pedido_prazo_iso: i.pedido_prazo_iso,
      codigo: i.codigo,
      quantidade_pendente: i.quantidade_pendente,
      unidade: i.unidade,
      status: i.status,
      cor_status: corStatus(i.status),
      status_display: statusDisplay(i.status),
      valor_unitario: null,
    })),
    chegando: lotes
      .filter(l => l.setor_destino === cod)
      .map(l => ({
        id: l.id,
        quantidade: l.quantidade,
        unidade: l.unidade,
        item_codigo: l.item_codigo,
        item_pedido_id: l.item_pedido_id,
        numero_pedido_venda: l.numero_pedido_venda,
        cliente: l.cliente,
        prioridade: l.prioridade,
        pedido_prazo: l.pedido_prazo,
        setor_origem: l.setor_origem,
        setor_origem_nome: nomeSector(l.setor_origem),
      })),
  }));

  const result = { setores };
  cache.set(cacheKey, { data: result, ts: Date.now() });
  return NextResponse.json(result);
  } catch (e) {
    console.error('[kanban]', e);
    const cached = cacheKey ? cache.get(cacheKey) : undefined;
    if (cached && Date.now() - cached.ts < CACHE_MAX_STALE_MS) return NextResponse.json(cached.data);
    return NextResponse.json({ erro: 'Erro ao carregar kanban' }, { status: 500 });
  }
}