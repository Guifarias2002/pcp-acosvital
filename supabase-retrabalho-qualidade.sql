-- ============================================================
-- RETRABALHO & QUALIDADE — SQL de reforço
-- Execute no SQL Editor do Supabase após o deploy
-- Todas as queries são idempotentes (seguras para rodar novamente)
-- ============================================================


-- ── 1. ESTRUTURA ──────────────────────────────────────────────
-- Colunas adicionadas pela Migration M04 (já roda automático no
-- primeiro request após o deploy, mas pode forçar aqui também)

ALTER TABLE producao_itemparcial
  ADD COLUMN IF NOT EXISTS retrabalho        BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS motivo_retrabalho TEXT,
  ADD COLUMN IF NOT EXISTS devolvido_de      TEXT;

-- Índice para acelerar filtro de retrabalhos no setor
CREATE INDEX IF NOT EXISTS idx_parcial_retrabalho
  ON producao_itemparcial (retrabalho)
  WHERE retrabalho = TRUE;


-- ── 2. BACKFILL — parciais devolvidas antes do deploy ─────────
-- Detecta parciais que provavelmente foram devolvidas (têm
-- histórico de movimentação com setor_origem diferente do setor_atual
-- e status em_aberto, vindas de uma ação de devolução).
-- Marca retrabalho=TRUE e tenta recuperar o motivo do log.

UPDATE producao_itemparcial pa
SET
  retrabalho = TRUE,
  devolvido_de = mov.setor_origem,
  motivo_retrabalho = COALESCE(
    mov.observacao,
    'Devolvido para retrabalho (registro anterior ao sistema de rastreio)'
  )
FROM (
  -- Pega a movimentação mais recente de devolução para cada parcial
  SELECT DISTINCT ON (m.item_id)
    i.id AS item_pedido_id,
    pa2.id AS parcial_id,
    m.setor_origem,
    m.observacao
  FROM producao_movimentacaoitem m
  JOIN producao_itempedido i ON i.id = m.item_id
  JOIN producao_itemparcial pa2 ON pa2.item_pedido_id = i.id
  WHERE m.setor_destino != m.setor_origem   -- houve mudança de setor
    AND pa2.status = 'em_aberto'            -- está aguardando no destino
    AND pa2.retrabalho = FALSE              -- ainda não marcada
    AND m.observacao ILIKE '%devolvid%'     -- log indica devolução
  ORDER BY m.item_id, m.criado_em DESC
) mov
WHERE pa.id = mov.parcial_id
  AND pa.retrabalho = FALSE;


-- ── 3. CONSULTAS DE VERIFICAÇÃO ───────────────────────────────

-- 3a. Ver todas as parciais em retrabalho
SELECT
  p.numero_pedido_venda  AS pedido,
  i.codigo               AS item,
  i.descricao,
  pa.id                  AS parcial_id,
  pa.quantidade::float   AS qtd,
  i.unidade,
  pa.setor_atual         AS setor_atual,
  pa.devolvido_de        AS devolvido_de,
  pa.status,
  pa.motivo_retrabalho   AS motivo,
  pa.atualizado_em
FROM producao_itemparcial pa
JOIN producao_itempedido i ON i.id = pa.item_pedido_id
JOIN producao_pedido p ON p.id = pa.pedido_id
WHERE pa.retrabalho = TRUE
  AND pa.status NOT IN ('cancelada', 'concluida')
ORDER BY pa.atualizado_em DESC;


-- 3b. Rastreabilidade completa por item — onde estão TODAS as peças
SELECT
  p.numero_pedido_venda  AS pedido,
  i.codigo               AS item,
  i.descricao,
  i.quantidade::float    AS qtd_total,
  i.unidade,
  pa.id                  AS parcial_id,
  pa.setor_atual,
  pa.status,
  pa.quantidade::float   AS qtd,
  pa.retrabalho,
  pa.devolvido_de
FROM producao_itemparcial pa
JOIN producao_itempedido i ON i.id = pa.item_pedido_id
JOIN producao_pedido p ON p.id = pa.pedido_id
WHERE pa.status NOT IN ('cancelada', 'concluida')
ORDER BY p.numero_pedido_venda, i.codigo, pa.setor_atual;


-- 3c. Itens com peças em múltiplos setores simultaneamente
SELECT
  p.numero_pedido_venda  AS pedido,
  i.codigo               AS item,
  i.descricao,
  COUNT(DISTINCT pa.setor_atual)             AS num_setores,
  STRING_AGG(
    pa.setor_atual || ' (' || pa.quantidade::text || ' ' || i.unidade || ')',
    ' | ' ORDER BY pa.setor_atual
  )                                          AS distribuicao,
  SUM(pa.quantidade)::float                  AS total_em_producao,
  i.quantidade::float                        AS qtd_total
FROM producao_itemparcial pa
JOIN producao_itempedido i ON i.id = pa.item_pedido_id
JOIN producao_pedido p ON p.id = pa.pedido_id
WHERE pa.status NOT IN ('cancelada', 'concluida')
GROUP BY p.numero_pedido_venda, i.codigo, i.descricao, i.quantidade
HAVING COUNT(DISTINCT pa.setor_atual) > 1
ORDER BY p.numero_pedido_venda, i.codigo;


-- 3d. Divergências registradas na qualidade (parciais pausadas com motivo)
SELECT
  p.numero_pedido_venda  AS pedido,
  i.codigo               AS item,
  pa.id                  AS parcial_id,
  pa.quantidade::float   AS qtd,
  i.unidade,
  pa.setor_atual,
  pa.status,
  mov.observacao         AS motivo_divergencia,
  mov.criado_em          AS data_divergencia
FROM producao_itemparcial pa
JOIN producao_itempedido i ON i.id = pa.item_pedido_id
JOIN producao_pedido p ON p.id = pa.pedido_id
JOIN producao_movimentacaoitem mov ON mov.item_id = i.id
WHERE pa.status = 'pausado'
  AND mov.status_novo = 'pausado'
  AND mov.observacao IS NOT NULL
ORDER BY mov.criado_em DESC;
