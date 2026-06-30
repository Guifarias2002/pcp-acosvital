-- ============================================================
-- Anexos de Entrega — Nota Fiscal e Canhoto
-- Roda de forma idempotente (ADD COLUMN IF NOT EXISTS)
-- ============================================================

-- 1. Colunas na tabela de pedidos
ALTER TABLE producao_pedido
  ADD COLUMN IF NOT EXISTS nota_url      TEXT,
  ADD COLUMN IF NOT EXISTS canhoto_url   TEXT,
  ADD COLUMN IF NOT EXISTS anexo_pendente BOOLEAN NOT NULL DEFAULT FALSE;

-- 2. Índice para buscar pedidos com documentos pendentes
CREATE INDEX IF NOT EXISTS idx_pedido_anexo_pendente
  ON producao_pedido (anexo_pendente)
  WHERE anexo_pendente = TRUE;

-- ============================================================
-- Verificação
-- ============================================================

-- Pedidos entregues sem nenhum documento anexado
SELECT
  p.id,
  p.numero_pedido_venda,
  p.cliente,
  p.prazo_entrega,
  p.status,
  p.anexo_pendente,
  CASE WHEN p.nota_url    IS NOT NULL THEN 'Sim' ELSE 'Não' END AS tem_nota,
  CASE WHEN p.canhoto_url IS NOT NULL THEN 'Sim' ELSE 'Não' END AS tem_canhoto
FROM producao_pedido p
WHERE p.status = 'entregue'
ORDER BY p.prazo_entrega DESC;

-- Pedidos marcados como "anexar depois" (pendentes)
SELECT
  p.id,
  p.numero_pedido_venda,
  p.cliente,
  p.status
FROM producao_pedido p
WHERE p.anexo_pendente = TRUE
ORDER BY p.prazo_entrega ASC;
