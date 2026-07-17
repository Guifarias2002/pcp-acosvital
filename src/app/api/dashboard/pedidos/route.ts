import { NextResponse } from 'next/server';
import sql from '@/lib/db';
import { autenticar } from '@/lib/middleware';
import { getFresh, setCache, getStale } from '@/lib/apiCache';

export const dynamic = 'force-dynamic';

const CACHE_KEY = 'dashboard-pedidos';
const FRESH_MS = 15_000;
const MAX_STALE_MS = 10 * 60_000;

export async function GET(req: Request) {
  try {
  const user = await autenticar(req);
  if (user instanceof NextResponse) return user;
  if (!user.is_staff) return NextResponse.json({ erro: 'Sem permissao' }, { status: 403 });

  const cached = getFresh(CACHE_KEY, FRESH_MS);
  if (cached) return NextResponse.json(cached);

  // Queries simples em paralelo em vez de CTE com json_agg
  const [pedidos, itens, parciais] = await Promise.all([
    sql`
      SELECT p.id, p.numero_pedido_venda, p.numero_op, p.cliente, p.vendedor,
             p.prazo_entrega::text, p.prioridade, p.status, p.setor_atual,
             p.prazo_entrega < NOW()::date AS atrasado
      FROM producao_pedido p
      WHERE p.status != 'entregue'
      ORDER BY p.prazo_entrega ASC, p.criado_em DESC
      LIMIT 100
    `,
    sql`
      SELECT i.pedido_id, i.id, i.codigo, i.descricao,
             i.quantidade_pendente::text AS quantidade_pendente,
             i.unidade, i.status, i.setor_atual
      FROM producao_itempedido i
      WHERE i.pedido_id IN (
        SELECT id FROM producao_pedido WHERE status != 'entregue' LIMIT 100
      )
    `,
    // Setores onde o pedido tem parcial ATIVA agora (pra mostrar "Setor Atual"
    // real quando as peças estão espalhadas). Só leitura, não afeta etapa.
    sql`
      SELECT DISTINCT pa.pedido_id, pa.setor_atual
      FROM producao_itemparcial pa
      WHERE pa.pedido_id IN (
        SELECT id FROM producao_pedido WHERE status != 'entregue' LIMIT 100
      )
        AND pa.status IN ('em_aberto','recebido','em_andamento','finalizado_setor','pausado','concluida')
        AND pa.setor_atual IS NOT NULL AND pa.setor_atual != ''
    `,
  ]);

  type ItemRow = (typeof itens)[0];
  // Agrupa itens por pedido no JS (evita json_agg no DB)
  const itensPorPedido: Record<number, ItemRow[]> = {};
  for (const item of itens) {
    const pid = Number(item.pedido_id);
    if (!itensPorPedido[pid]) itensPorPedido[pid] = [];
    itensPorPedido[pid].push(item);
  }

  // Setores atuais (distintos) por pedido, a partir das parciais ativas.
  const setoresAtuaisPorPedido: Record<number, string[]> = {};
  for (const pa of parciais) {
    const pid = Number(pa.pedido_id);
    (setoresAtuaisPorPedido[pid] ??= []).push(pa.setor_atual as string);
  }

  const resultado = pedidos.map(p => ({
    ...p,
    valor_calculado: '0',
    setores_parciais: [],
    setores_atuais: setoresAtuaisPorPedido[Number(p.id)] ?? [],
    itens: itensPorPedido[Number(p.id)] ?? [],
  }));

  const payload = { pedidos: resultado };
  setCache(CACHE_KEY, payload);
  return NextResponse.json(payload);
  } catch (e) {
    console.error('[dashboard/pedidos]', e);
    const stale = getStale(CACHE_KEY, MAX_STALE_MS);
    if (stale) return NextResponse.json(stale);
    return NextResponse.json({ erro: 'Erro ao carregar pedidos' }, { status: 500 });
  }
}
