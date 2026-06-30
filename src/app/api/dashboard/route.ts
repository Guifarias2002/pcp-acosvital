import { NextResponse } from 'next/server';
import sql from '@/lib/db';
import { autenticar } from '@/lib/middleware';
import { SETOR_CHOICES } from '@/lib/types';
import { nomeSector } from '@/lib/queries';

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

  // Todas as queries em paralelo
  const [
    countsRows,
    porSetorRows,
    valorSetorRows,
    lotesChegandoRows,
    pedidosAtrasados,
    ultMovs,
    pedidosPendencia,
    divCountsRows,
  ] = await Promise.all([
    // Contadores com CTE para evitar subquery correlacionada por pedido
    sql`
      WITH item_valores AS (
        SELECT pedido_id,
               SUM(quantidade * COALESCE(valor_unitario, 0)) AS valor_total
        FROM producao_itempedido
        GROUP BY pedido_id
      ),
      item_status AS (
        SELECT pedido_id,
               bool_or(status NOT IN ('entregue','aguardando','recebido')) AS tem_ativo
        FROM producao_itempedido
        GROUP BY pedido_id
      )
      SELECT
        COUNT(*) FILTER (WHERE p.status != 'entregue')                                          AS total,
        COUNT(*) FILTER (WHERE p.status = 'emitido')                                            AS a_produzir,
        COUNT(*) FILTER (WHERE p.status = 'em_producao' AND p.setor_atual != 'logistica'
          AND COALESCE(ist.tem_ativo, false))                                                    AS produzindo,
        COUNT(*) FILTER (WHERE p.status = 'em_producao' AND p.setor_atual != 'logistica'
          AND NOT COALESCE(ist.tem_ativo, false))                                                AS ag_recebimento,
        COUNT(*) FILTER (WHERE p.status = 'em_producao' AND p.setor_atual = 'logistica')        AS mat_concluido,
        COUNT(*) FILTER (WHERE p.status = 'entregue')                                           AS entregues,
        COUNT(*) FILTER (WHERE p.prazo_entrega < NOW()::date AND p.status != 'entregue')        AS atrasados,
        COUNT(*) FILTER (WHERE p.prioridade = 'urgente' AND p.status != 'entregue')             AS urgentes,
        COUNT(*) FILTER (WHERE p.status = 'bloqueado')                                          AS bloqueados,
        COALESCE(SUM(iv.valor_total) FILTER (WHERE p.status = 'emitido'),      0)::text         AS valor_a_produzir,
        COALESCE(SUM(iv.valor_total) FILTER (WHERE p.status = 'em_producao'),  0)::text         AS valor_em_producao,
        COALESCE(SUM(iv.valor_total) FILTER (WHERE p.status = 'entregue'),     0)::text         AS valor_concluido
      FROM producao_pedido p
      LEFT JOIN item_valores iv  ON iv.pedido_id  = p.id
      LEFT JOIN item_status  ist ON ist.pedido_id = p.id
    `,

    // Itens por setor: itens diretos + itens com parciais ativas em outros setores
    sql`
      WITH itens_diretos AS (
        SELECT i.setor_atual AS setor,
               i.id, i.codigo, i.descricao,
               i.quantidade_pendente::text, i.unidade, i.status,
               p.numero_pedido_venda, p.cliente,
               p.prazo_entrega::text AS pedido_prazo, p.prioridade
        FROM producao_itempedido i
        JOIN producao_pedido p ON p.id = i.pedido_id
        WHERE i.status != 'entregue'
      ),
      itens_via_parcial AS (
        SELECT DISTINCT pa.setor_atual AS setor,
               i.id, i.codigo, i.descricao,
               i.quantidade_pendente::text, i.unidade, i.status,
               p.numero_pedido_venda, p.cliente,
               p.prazo_entrega::text AS pedido_prazo, p.prioridade
        FROM producao_itemparcial pa
        JOIN producao_itempedido i ON i.id = pa.item_pedido_id
        JOIN producao_pedido p ON p.id = i.pedido_id
        WHERE pa.status NOT IN ('cancelada', 'concluida')
          AND pa.setor_atual != i.setor_atual
      ),
      todos AS (
        SELECT * FROM itens_diretos
        UNION
        SELECT * FROM itens_via_parcial
      )
      SELECT setor AS setor_atual,
             COUNT(*)  AS qtd,
             json_agg(json_build_object(
               'id',               id,
               'codigo',           codigo,
               'descricao',        descricao,
               'quantidade_pendente', quantidade_pendente,
               'unidade',          unidade,
               'status',           status,
               'setor_atual',      setor,
               'pedido_numero',    numero_pedido_venda,
               'pedido_cliente',   cliente,
               'pedido_prazo',     pedido_prazo,
               'pedido_prioridade',prioridade
             ) ORDER BY numero_pedido_venda) AS itens
      FROM todos
      GROUP BY setor
    `,

    // Valor por setor
    sql`
      SELECT setor_atual,
             COALESCE(SUM(valor_unitario * quantidade_pendente), 0)::text AS valor
      FROM producao_itempedido
      WHERE status != 'entregue'
      GROUP BY setor_atual
    `,

    // Lotes chegando por setor
    sql`
      SELECT setor_destino, COUNT(*) AS qtd_chegando
      FROM producao_loteitem
      WHERE status = 'em_producao'
      GROUP BY setor_destino
    `,

    // Pedidos atrasados
    sql`
      SELECT id, numero_pedido_venda, cliente, prazo_entrega::text, prioridade, status
      FROM producao_pedido
      WHERE prazo_entrega < NOW()::date AND status != 'entregue'
      ORDER BY prazo_entrega ASC
      LIMIT 10
    `,

    // Últimas movimentações
    sql`
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
    `,

    // Últimos pedidos com itens — valor via JOIN, não subquery correlacionada
    sql`
      SELECT p.id, p.numero_pedido_venda, p.numero_op, p.cliente, p.vendedor,
             p.prazo_entrega::text, p.prioridade, p.status, p.setor_atual,
             COALESCE(iv.valor_total, 0)::text AS valor_calculado,
             p.prazo_entrega < NOW()::date     AS atrasado,
             COALESCE((
               SELECT json_agg(DISTINCT pa.setor_atual)
               FROM producao_itemparcial pa
               JOIN producao_itempedido ii ON ii.id = pa.item_pedido_id
               WHERE ii.pedido_id = p.id
                 AND pa.status NOT IN ('cancelada', 'concluida')
             ), '[]'::json) AS setores_parciais,
             COALESCE(
               json_agg(
                 json_build_object(
                   'id',                i.id,
                   'codigo',            i.codigo,
                   'descricao',         i.descricao,
                   'quantidade_pendente', i.quantidade_pendente::text,
                   'unidade',           i.unidade,
                   'status',            i.status,
                   'setor_atual',       i.setor_atual
                 ) ORDER BY i.codigo
               ) FILTER (WHERE i.id IS NOT NULL),
               '[]'
             ) AS itens
      FROM producao_pedido p
      LEFT JOIN producao_itempedido i ON i.pedido_id = p.id
      LEFT JOIN (
        SELECT pedido_id, SUM(quantidade * COALESCE(valor_unitario, 0)) AS valor_total
        FROM producao_itempedido
        GROUP BY pedido_id
      ) iv ON iv.pedido_id = p.id
      GROUP BY p.id, iv.valor_total
      ORDER BY (p.status = 'entregue') ASC, p.prazo_entrega ASC, p.criado_em DESC
      LIMIT 100
    `,

    // Divergências (tabela pode não existir)
    sql`
      SELECT
        COUNT(*) FILTER (WHERE status IN ('aberta','em_analise'))                          AS abertas,
        COUNT(*) FILTER (WHERE status IN ('aberta','em_analise') AND prioridade = 'urgente') AS urgentes
      FROM producao_divergencia
    `.catch(() => [{ abertas: 0, urgentes: 0 }]),
  ]);

  const counts = countsRows[0];
  const divCounts = divCountsRows[0] ?? { abertas: 0, urgentes: 0 };

  // Montar mapa por setor
  const valorMap: Record<string, string> = {};
  for (const v of valorSetorRows) valorMap[v.setor_atual] = v.valor;

  const chegandoMap: Record<string, number> = {};
  for (const l of lotesChegandoRows) chegandoMap[l.setor_destino] = Number(l.qtd_chegando);

  const setorItemMap: Record<string, { qtd: number; itens: unknown[] }> = {};
  for (const row of porSetorRows) setorItemMap[row.setor_atual] = { qtd: Number(row.qtd), itens: row.itens };

  const verFinanceiro = user.is_staff;

  const porSetor = SETOR_CHOICES
    .map(([cod, nome]) => {
      const s = setorItemMap[cod] ?? { qtd: 0, itens: [] };
      return {
        cod, nome,
        qtd: s.qtd,
        qtd_chegando: chegandoMap[cod] || 0,
        valor: verFinanceiro ? (valorMap[cod] || '0') : null,
        itens: s.itens,
      };
    })
    .filter(s => s.qtd > 0 || s.qtd_chegando > 0);

  return NextResponse.json({
    total:           Number(counts.total),
    a_produzir:      Number(counts.a_produzir),
    ag_recebimento:  Number(counts.ag_recebimento),
    produzindo:      Number(counts.produzindo),
    mat_concluido:   Number(counts.mat_concluido),
    entregues:       Number(counts.entregues),
    atrasados:       Number(counts.atrasados),
    urgentes:        Number(counts.urgentes),
    bloqueados:      Number(counts.bloqueados),
    valor_a_produzir:  verFinanceiro ? counts.valor_a_produzir  : null,
    valor_em_producao: verFinanceiro ? counts.valor_em_producao : null,
    valor_concluido:   verFinanceiro ? counts.valor_concluido   : null,
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
    pendencias: pedidosPendencia,
    divergencias_abertas:  Number(divCounts.abertas),
    divergencias_urgentes: Number(divCounts.urgentes),
  });
}
