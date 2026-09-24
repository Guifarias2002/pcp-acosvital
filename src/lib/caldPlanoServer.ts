// Acesso ao banco do Planejamento da Caldeiraria (server-only). Ver caldPlano.ts.
import postgres from 'postgres';
import sql from './db';
import type { ItemCald } from './caldPlano';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Sql = postgres.Sql<any> | postgres.TransactionSql<any>;

// Carrega itens (com as etapas) — todos os ativos + finalizados/cancelados do
// último ano (base do relatório semanal). `ids` restringe a itens específicos.
export async function carregarItensCald(db: Sql = sql, ids?: number[]): Promise<ItemCald[]> {
  const filtroIds = ids && ids.length ? ids : null;
  const rows = await db`
    SELECT
      i.id, i.pedido, i.vendedor, i.cliente, i.material,
      i.quantidade::float AS quantidade, i.unidade, i.valor::float AS valor,
      i.areas, i.area_atual, i.status, i.prioridade, i.ordem,
      i.prazo_entrega::text AS prazo_entrega, i.prev_faturamento::text AS prev_faturamento,
      i.faturado_em::text AS faturado_em, i.prev_finalizacao::text AS prev_finalizacao,
      i.finalizado_em::text AS finalizado_em, i.parcial, i.obs, i.criado_por_nome,
      i.criado_em, i.atualizado_em,
      COALESCE((
        SELECT json_agg(json_build_object(
          'area', e.area, 'entrada', e.entrada::text, 'previsao', e.previsao::text,
          'fornecedor', e.fornecedor, 'retorno_previsto', e.retorno_previsto::text))
        FROM producao_cald_plano_etapa e WHERE e.item_id = i.id
      ), '[]'::json) AS etapas
    FROM producao_cald_plano_item i
    WHERE (${filtroIds}::int[] IS NULL OR i.id = ANY(${filtroIds}::int[]))
      AND (${filtroIds}::int[] IS NOT NULL
           OR i.status NOT IN ('finalizado', 'cancelado')
           OR i.atualizado_em > NOW() - INTERVAL '400 days')
    ORDER BY i.id
  `;
  return rows as unknown as ItemCald[];
}

export async function registrarHistCald(db: Sql, itemId: number, acao: string, detalhe: string | null, usuario: string | null) {
  await db`
    INSERT INTO producao_cald_plano_hist (item_id, acao, detalhe, usuario_nome)
    VALUES (${itemId}, ${acao}, ${detalhe}, ${usuario})
  `;
}
