import { NextResponse } from 'next/server';
import sql from '@/lib/db';
import { autenticar } from '@/lib/middleware';
import { withTimeout } from '@/lib/queryTimeout';

export const dynamic = 'force-dynamic';
export async function GET(req: Request) {
  try {
  const user = await autenticar(req);
  if (user instanceof NextResponse) return user;
  if (!user.is_staff) return NextResponse.json({ erro: 'Sem permissao' }, { status: 403 });

  const url = new URL(req.url);
  const de = url.searchParams.get('de');   // YYYY-MM-DD
  const ate = url.searchParams.get('ate'); // YYYY-MM-DD

  const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
  if (de && !DATE_RE.test(de)) return NextResponse.json({ erro: 'Parâmetro "de" inválido (use YYYY-MM-DD)' }, { status: 400 });
  if (ate && !DATE_RE.test(ate)) return NextResponse.json({ erro: 'Parâmetro "ate" inválido (use YYYY-MM-DD)' }, { status: 400 });

  // Filtro de período — aplica nas movimentações e pedidos
  const deFiltro  = de  ? new Date(de + 'T00:00:00') : new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  const ateFiltro = ate ? new Date(ate + 'T23:59:59') : new Date();
  if (isNaN(deFiltro.getTime()) || isNaN(ateFiltro.getTime()))
    return NextResponse.json({ erro: 'Data inválida' }, { status: 400 });

  // Pedidos no período (criados ou entregues)
  const qPedidos = sql`
      SELECT p.id, p.numero_pedido_venda, p.cliente, p.status, p.prioridade,
             p.criado_em, p.prazo_entrega, p.valor_total,
             COUNT(DISTINCT i.id) AS qtd_itens,
             SUM(i.quantidade_entregue) AS qtd_entregue,
             SUM(i.quantidade) AS qtd_total
      FROM producao_pedido p
      LEFT JOIN producao_itempedido i ON i.pedido_id = p.id
      WHERE p.criado_em BETWEEN ${deFiltro.toISOString()} AND ${ateFiltro.toISOString()}
      GROUP BY p.id ORDER BY p.criado_em DESC
    `;

  // Movimentações por setor no período
  const qMovimentacoes = sql`
      SELECT m.setor_destino AS setor,
             COUNT(*) AS total_movs,
             COUNT(DISTINCT m.item_id) AS total_itens,
             COUNT(DISTINCT m.usuario_id) AS total_usuarios
      FROM producao_movimentacaoitem m
      WHERE m.criado_em BETWEEN ${deFiltro.toISOString()} AND ${ateFiltro.toISOString()}
        AND m.setor_destino != ''
      GROUP BY m.setor_destino ORDER BY total_movs DESC
    `;

  // Tempo médio por setor (em minutos)
  const qTemposPorSetor = sql`
      SELECT m.setor_destino AS setor,
             ROUND(AVG(
               EXTRACT(EPOCH FROM (m2.criado_em - m.criado_em)) / 60
             ))::int AS tempo_medio_min,
             ROUND(SUM(
               EXTRACT(EPOCH FROM (m2.criado_em - m.criado_em)) / 60
             ))::int AS tempo_total_min,
             COUNT(*) AS amostras
      FROM producao_movimentacaoitem m
      JOIN producao_movimentacaoitem m2
        ON m2.item_id = m.item_id
        AND m2.setor_origem = m.setor_destino
        AND m2.criado_em > m.criado_em
      WHERE m.criado_em BETWEEN ${deFiltro.toISOString()} AND ${ateFiltro.toISOString()}
        AND m.setor_destino != ''
      GROUP BY m.setor_destino ORDER BY tempo_total_min DESC
    `;

  // Colaboradores (movimentações por usuário)
  const qColaboradores = sql`
      SELECT u.id, u.first_name || ' ' || u.last_name AS nome,
             COUNT(m.id) AS total_acoes,
             COUNT(DISTINCT m.item_id) AS itens_movimentados,
             COUNT(DISTINCT m.setor_destino) AS setores_atendidos,
             MIN(m.criado_em) AS primeira_acao,
             MAX(m.criado_em) AS ultima_acao
      FROM auth_user u
      JOIN producao_movimentacaoitem m ON m.usuario_id = u.id
      WHERE m.criado_em BETWEEN ${deFiltro.toISOString()} AND ${ateFiltro.toISOString()}
      GROUP BY u.id, u.first_name, u.last_name
      ORDER BY total_acoes DESC
    `;

  // Divergências no período
  const qDivergencias = sql`
      SELECT tipo, status, COUNT(*) AS total
      FROM producao_divergencia
      WHERE criado_em BETWEEN ${deFiltro.toISOString()} AND ${ateFiltro.toISOString()}
      GROUP BY tipo, status
    `;

  const [
    pedidos,
    movimentacoes,
    temposPorSetor,
    colaboradores,
    divergencias,
  ] = await withTimeout(
    Promise.all([qPedidos, qMovimentacoes, qTemposPorSetor, qColaboradores, qDivergencias]),
    7500,
    [qPedidos, qMovimentacoes, qTemposPorSetor, qColaboradores, qDivergencias],
  );

  // Resumo de pedidos
  const totalPedidos = pedidos.length;
  const pedidosEntregues = pedidos.filter((p: Record<string, string>) => p.status === 'entregue').length;
  const valorTotal = pedidos.reduce((acc: number, p: Record<string, string>) => acc + Number(p.valor_total || 0), 0);

  return NextResponse.json({
    periodo: { de: deFiltro.toISOString().split('T')[0], ate: ateFiltro.toISOString().split('T')[0] },
    resumo: { total_pedidos: totalPedidos, pedidos_entregues: pedidosEntregues, valor_total: valorTotal.toString() },
    pedidos: pedidos.map((p: Record<string, string>) => ({
      id: p.id, numero: p.numero_pedido_venda, cliente: p.cliente,
      status: p.status, prioridade: p.prioridade,
      criado_em: p.criado_em, prazo_entrega: p.prazo_entrega,
      valor_total: p.valor_total,
      qtd_itens: Number(p.qtd_itens), qtd_entregue: Number(p.qtd_entregue || 0), qtd_total: Number(p.qtd_total || 0),
    })),
    por_setor: movimentacoes.map((m: Record<string, string>) => ({
      setor: m.setor, total_movs: Number(m.total_movs),
      total_itens: Number(m.total_itens), total_usuarios: Number(m.total_usuarios),
    })),
    tempos_por_setor: temposPorSetor.map((t: Record<string, string>) => ({
      setor: t.setor, tempo_medio_min: Number(t.tempo_medio_min || 0),
      tempo_total_min: Number(t.tempo_total_min || 0), amostras: Number(t.amostras),
    })),
    colaboradores: colaboradores.map((c: Record<string, string>) => ({
      id: c.id, nome: c.nome || 'Sem nome',
      total_acoes: Number(c.total_acoes), itens_movimentados: Number(c.itens_movimentados),
      setores_atendidos: Number(c.setores_atendidos),
      primeira_acao: c.primeira_acao, ultima_acao: c.ultima_acao,
    })),
    divergencias: divergencias.map((d: Record<string, string>) => ({
      tipo: d.tipo, status: d.status, total: Number(d.total),
    })),
  });
  } catch (e) {
    console.error('[relatorios/geral]', e);
    return NextResponse.json({ erro: 'Erro ao carregar relatorio geral' }, { status: 500 });
  }
}