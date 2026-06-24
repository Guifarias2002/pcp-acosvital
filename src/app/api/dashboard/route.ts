import { NextResponse } from 'next/server';
import sql from '@/lib/db';
import { autenticar } from '@/lib/middleware';
import { SETOR_CHOICES, NOMES } from '@/lib/types';
import { formatItem, nomeSector } from '@/lib/queries';

function statusDisplay(s: string): string {
  const m: Record<string, string> = {
    emitido: 'Emitido', aguardando: 'Aguardando', recebido: 'Recebido',
    em_andamento: 'Em Andamento', pausado: 'Pausado',
    finalizado_setor: 'Finalizado no Setor', em_transito: 'Em Trânsito', bloqueado: 'Bloqueado',
    reprovado: 'Reprovado', aprovado: 'Aprovado', entregue: 'Entregue',
  };
  return m[s] || s;
}

export async function GET(req: Request) {
  const user = await autenticar(req);
  if (user instanceof NextResponse) return user;
  if (!user.is_staff) return NextResponse.json({ erro: 'Sem permissao' }, { status: 403 });

  // Divergências abertas (tabela pode não existir ainda)
  let divergencias_abertas = 0;
  let divergencias_urgentes = 0;
  try {
    const [divCounts] = await sql`
      SELECT
        COUNT(*) FILTER (WHERE status IN ('aberta','em_analise')) AS abertas,
        COUNT(*) FILTER (WHERE status IN ('aberta','em_analise') AND prioridade = 'urgente') AS urgentes
      FROM producao_divergencia
    `;
    divergencias_abertas = Number(divCounts?.abertas || 0);
    divergencias_urgentes = Number(divCounts?.urgentes || 0);
  } catch { /* tabela ainda não criada */ }

  const [counts] = await sql`
    SELECT
      COUNT(*) FILTER (WHERE status != 'entregue') AS total,
      COUNT(*) FILTER (WHERE status = 'emitido') AS a_produzir,
      COUNT(*) FILTER (WHERE status = 'em_producao' AND setor_atual != 'logistica'
        AND EXISTS (SELECT 1 FROM producao_itempedido i WHERE i.pedido_id = producao_pedido.id AND i.status NOT IN ('entregue','aguardando','recebido'))) AS produzindo,
      COUNT(*) FILTER (WHERE status = 'em_producao' AND setor_atual != 'logistica'
        AND NOT EXISTS (SELECT 1 FROM producao_itempedido i WHERE i.pedido_id = producao_pedido.id AND i.status NOT IN ('entregue','aguardando','recebido'))) AS ag_recebimento,
      COUNT(*) FILTER (WHERE status = 'em_producao' AND setor_atual = 'logistica') AS mat_concluido,
      COUNT(*) FILTER (WHERE status = 'entregue' OR EXISTS (
        SELECT 1 FROM producao_itempedido ix WHERE ix.pedido_id = producao_pedido.id AND ix.status = 'entregue'
      )) AS entregues,
      COUNT(*) FILTER (WHERE prazo_entrega < NOW()::date AND status != 'entregue') AS atrasados,
      COUNT(*) FILTER (WHERE prioridade = 'urgente' AND status != 'entregue') AS urgentes,
      COUNT(*) FILTER (WHERE status = 'bloqueado') AS bloqueados,
      COALESCE(SUM((SELECT SUM(i2.quantidade * COALESCE(i2.valor_unitario,0)) FROM producao_itempedido i2 WHERE i2.pedido_id = producao_pedido.id)) FILTER (WHERE status = 'emitido'), 0)::text AS valor_a_produzir,
      COALESCE(SUM((SELECT SUM(i2.quantidade * COALESCE(i2.valor_unitario,0)) FROM producao_itempedido i2 WHERE i2.pedido_id = producao_pedido.id)) FILTER (WHERE status = 'em_producao'), 0)::text AS valor_em_producao,
      COALESCE(SUM((SELECT SUM(i2.quantidade * COALESCE(i2.valor_unitario,0)) FROM producao_itempedido i2 WHERE i2.pedido_id = producao_pedido.id)) FILTER (WHERE status = 'entregue'), 0)::text AS valor_concluido
    FROM producao_pedido
  `;

  // itens por setor
  const itensTodos = await sql`
    SELECT i.*, p.numero_pedido_venda AS pedido_numero, p.cliente AS pedido_cliente,
           p.prazo_entrega::text AS pedido_prazo, p.prioridade AS pedido_prioridade, p.roteiro_base
    FROM producao_itempedido i
    JOIN producao_pedido p ON p.id = i.pedido_id
    WHERE i.status != 'entregue'
    ORDER BY i.setor_atual, p.numero_pedido_venda
  `;

  const [valorSetor, lotesChegando] = await Promise.all([
    sql`
      SELECT setor_atual, COALESCE(SUM(valor_unitario * quantidade_pendente), 0)::text AS valor
      FROM producao_itempedido WHERE status != 'entregue' GROUP BY setor_atual
    `,
    sql`
      SELECT setor_destino, COUNT(*) AS qtd_chegando
      FROM producao_loteitem WHERE status = 'em_producao'
      GROUP BY setor_destino
    `,
  ]);

  const valorMap: Record<string, string> = {};
  for (const v of valorSetor) valorMap[v.setor_atual] = v.valor;

  const chegandoMap: Record<string, number> = {};
  for (const l of lotesChegando) chegandoMap[l.setor_destino] = Number(l.qtd_chegando);

  const porSetor = SETOR_CHOICES.map(([cod, nome]) => {
    const itens = itensTodos.filter(i => i.setor_atual === cod).map(formatItem);
    return { cod, nome, qtd: itens.length, qtd_chegando: chegandoMap[cod] || 0, valor: valorMap[cod] || '0', itens };
  }).filter(s => s.qtd > 0 || s.qtd_chegando > 0);

  // pedidos atrasados
  const pedidosAtrasados = await sql`
    SELECT id, numero_pedido_venda, cliente, prazo_entrega::text, prioridade, status
    FROM producao_pedido
    WHERE prazo_entrega < NOW()::date AND status != 'entregue'
    ORDER BY prazo_entrega ASC LIMIT 10
  `;

  // ultimas movimentacoes
  const ultMovs = await sql`
    SELECT m.id, m.setor_origem, m.setor_destino, m.status_anterior, m.status_novo,
           m.observacao, m.criado_em,
           i.codigo AS item_codigo, p.numero_pedido_venda,
           u.nome AS usuario_nome
    FROM producao_movimentacaoitem m
    JOIN producao_itempedido i ON i.id = m.item_id
    LEFT JOIN producao_pedido p ON p.id = i.pedido_id
    LEFT JOIN usuarios_usuario u ON u.id = m.usuario_id
    ORDER BY m.criado_em DESC LIMIT 15
  `;

  // todos os pedidos ativos com seus itens para "Últimos Pedidos"
  const pedidosPendencia = await sql`
    SELECT p.id, p.numero_pedido_venda, p.numero_op, p.cliente, p.vendedor,
           p.prazo_entrega::text, p.prioridade, p.status, p.setor_atual,
           COALESCE((SELECT SUM(i2.quantidade * COALESCE(i2.valor_unitario,0)) FROM producao_itempedido i2 WHERE i2.pedido_id = p.id), 0)::text AS valor_calculado,
           p.prazo_entrega < NOW()::date AS atrasado,
           COALESCE(
             json_agg(
               json_build_object(
                 'id', i.id,
                 'codigo', i.codigo,
                 'descricao', i.descricao,
                 'quantidade_pendente', i.quantidade_pendente::text,
                 'unidade', i.unidade,
                 'status', i.status,
                 'setor_atual', i.setor_atual
               ) ORDER BY i.codigo
             ) FILTER (WHERE i.id IS NOT NULL),
             '[]'
           ) AS itens
    FROM producao_pedido p
    LEFT JOIN producao_itempedido i ON i.pedido_id = p.id
    GROUP BY p.id
    ORDER BY p.status = 'entregue' ASC, p.prazo_entrega ASC, p.criado_em DESC
    LIMIT 100
  `;

  const verFinanceiro = user.is_staff;

  return NextResponse.json({
    total: Number(counts.total),
    a_produzir: Number(counts.a_produzir),
    ag_recebimento: Number(counts.ag_recebimento),
    produzindo: Number(counts.produzindo),
    mat_concluido: Number(counts.mat_concluido),
    entregues: Number(counts.entregues),
    atrasados: Number(counts.atrasados),
    urgentes: Number(counts.urgentes),
    bloqueados: Number(counts.bloqueados),
    valor_a_produzir: verFinanceiro ? counts.valor_a_produzir : null,
    valor_em_producao: verFinanceiro ? counts.valor_em_producao : null,
    valor_concluido: verFinanceiro ? counts.valor_concluido : null,
    por_setor: porSetor.map(s => ({ ...s, valor: verFinanceiro ? s.valor : null })),
    pedidos_atrasados: pedidosAtrasados,
    ultimas_movimentacoes: ultMovs.map(m => ({
      id: m.id,
      item_codigo: m.item_codigo,
      numero_pedido_venda: m.numero_pedido_venda,
      setor_origem: m.setor_origem, setor_origem_nome: nomeSector(m.setor_origem),
      setor_destino: m.setor_destino, setor_destino_nome: nomeSector(m.setor_destino),
      status_anterior: m.status_anterior, status_anterior_display: statusDisplay(m.status_anterior),
      status_novo: m.status_novo, status_novo_display: statusDisplay(m.status_novo),
      observacao: m.observacao || '',
      usuario_nome: m.usuario_nome || 'Sistema',
      criado_em: m.criado_em,
    })),
    pendencias: pedidosPendencia,
    divergencias_abertas,
    divergencias_urgentes,
  });
}
