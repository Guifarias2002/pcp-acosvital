-- ============================================================
-- VISÃO GERAL: PEDIDOS → ITENS → PARCIAIS
-- Cole no SQL Editor do Supabase para consultar o estado
-- completo de todos os pedidos e suas parciais rastreadas.
-- ============================================================

SELECT
  -- Pedido
  p.numero_pedido_venda                                   AS pedido,
  p.cliente,
  p.status                                                AS status_pedido,
  p.prioridade,
  p.prazo_entrega::text                                   AS prazo,

  -- Item
  i.id                                                    AS item_id,
  i.codigo                                                AS item_codigo,
  i.descricao                                             AS item_descricao,
  i.quantidade::float                                     AS qtd_total,
  i.unidade,
  i.setor_atual                                           AS item_setor_atual,
  i.status                                                AS item_status,
  i.quantidade_pendente::float                            AS qtd_pendente,

  -- Parcial
  pa.id                                                   AS parcial_id,
  pa.parcial_origem_id                                    AS parcial_pai_id,
  pa.setor_atual                                          AS parcial_setor,
  pa.status                                               AS parcial_status,
  pa.quantidade::float                                    AS parcial_qtd,
  pa.criado_em                                            AS parcial_criada_em,
  pa.atualizado_em                                        AS parcial_atualizada_em

FROM producao_pedido p
JOIN producao_itempedido i    ON i.pedido_id = p.id
LEFT JOIN producao_itemparcial pa ON pa.item_pedido_id = i.id

WHERE p.status != 'cancelado'

ORDER BY
  p.numero_pedido_venda,
  i.codigo,
  pa.criado_em NULLS LAST;


-- ============================================================
-- RESUMO POR ITEM: onde estão as peças de cada item
-- ============================================================

SELECT
  p.numero_pedido_venda                                   AS pedido,
  p.cliente,
  i.id                                                    AS item_id,
  i.codigo                                                AS codigo,
  i.descricao,
  i.quantidade::float                                     AS qtd_total,
  i.unidade,
  i.setor_atual                                           AS setor_item,
  i.status                                                AS status_item,

  -- Quantidades por situação das parciais
  COALESCE(SUM(pa.quantidade) FILTER (WHERE pa.status = 'em_aberto'),        0)::float AS qtd_aguardando,
  COALESCE(SUM(pa.quantidade) FILTER (WHERE pa.status = 'em_andamento'),     0)::float AS qtd_em_producao,
  COALESCE(SUM(pa.quantidade) FILTER (WHERE pa.status = 'pausado'),          0)::float AS qtd_pausada,
  COALESCE(SUM(pa.quantidade) FILTER (WHERE pa.status = 'finalizado_setor'), 0)::float AS qtd_finalizada_setor,
  COALESCE(SUM(pa.quantidade) FILTER (WHERE pa.status = 'concluida'),        0)::float AS qtd_concluida,
  COALESCE(SUM(pa.quantidade) FILTER (WHERE pa.status = 'cancelada'),        0)::float AS qtd_cancelada,

  -- Total rastreado via parciais
  COALESCE(SUM(pa.quantidade) FILTER (WHERE pa.status != 'cancelada'),       0)::float AS total_rastreado,

  -- Setores onde há parciais ativas
  STRING_AGG(DISTINCT pa.setor_atual, ', ')
    FILTER (WHERE pa.status NOT IN ('cancelada', 'concluida'))                AS setores_ativos

FROM producao_pedido p
JOIN producao_itempedido i     ON i.pedido_id = p.id
LEFT JOIN producao_itemparcial pa ON pa.item_pedido_id = i.id

WHERE p.status != 'cancelado'

GROUP BY p.numero_pedido_venda, p.cliente, i.id, i.codigo, i.descricao,
         i.quantidade, i.unidade, i.setor_atual, i.status

ORDER BY p.numero_pedido_venda, i.codigo;


-- ============================================================
-- RASTREIO DETALHADO: árvore de parciais (pai → filhos)
-- Útil para ver splits e divisões de lotes
-- ============================================================

WITH RECURSIVE arvore AS (
  -- Raízes (parciais sem pai)
  SELECT
    pa.id, pa.item_pedido_id, pa.parcial_origem_id,
    pa.setor_atual, pa.status, pa.quantidade::float,
    0 AS nivel,
    pa.id::text AS caminho

  FROM producao_itemparcial pa
  WHERE pa.parcial_origem_id IS NULL

  UNION ALL

  -- Filhos
  SELECT
    pa.id, pa.item_pedido_id, pa.parcial_origem_id,
    pa.setor_atual, pa.status, pa.quantidade::float,
    a.nivel + 1,
    a.caminho || ' → ' || pa.id::text

  FROM producao_itemparcial pa
  JOIN arvore a ON a.id = pa.parcial_origem_id
)
SELECT
  p.numero_pedido_venda                                   AS pedido,
  i.codigo                                                AS item,
  i.descricao,
  REPEAT('  ', a.nivel) || '#' || a.id::text             AS parcial,
  a.parcial_origem_id                                     AS pai,
  a.setor_atual                                           AS setor,
  a.status,
  a.quantidade                                            AS qtd,
  a.caminho                                               AS arvore_ids,
  a.nivel

FROM arvore a
JOIN producao_itempedido i  ON i.id = a.item_pedido_id
JOIN producao_pedido p      ON p.id = i.pedido_id

WHERE p.status != 'cancelado'

ORDER BY p.numero_pedido_venda, i.codigo, a.caminho;
