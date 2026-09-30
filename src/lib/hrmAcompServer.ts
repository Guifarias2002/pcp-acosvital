// Acesso ao banco do Acompanhamento HRM (server-only). Ver hrmAcomp.ts.
import postgres from 'postgres';
import sql from './db';
import type { ItemHrm, HistHrm } from './hrmAcomp';
import { runMigrations } from './migrations';
import { SQL_CODIGO_CROQUI } from './croqui';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Sql = postgres.Sql<any> | postgres.TransactionSql<any>;

// Datas DATE saem como texto 'AAAA-MM-DD' (sem passar por Date → sem -1 dia de fuso).
// pedido_id: liga (best-effort) à OP já lançada no sistema pelo nº da OP HRM.
export async function carregarItensHrm(db: Sql = sql, ids?: number[]): Promise<ItemHrm[]> {
  try {
    return await consultarItensHrm(db, ids);
  } catch (e) {
    // Tabela/coluna ainda não criada nesta instância (subiu antes da M63/M64) → migra e tenta 1x.
    if (!['42P01', '42703'].includes(String((e as { code?: string })?.code))) throw e;
    await runMigrations();
    return consultarItensHrm(db, ids);
  }
}

async function consultarItensHrm(db: Sql, ids?: number[]): Promise<ItemHrm[]> {
  const filtroIds = ids && ids.length ? ids : null;
  // numero_op é digitado livre no "Anexar OP" ("13449", "OP 13449"…) → casa pelo
  // 1º grupo de 4–7 dígitos; se houver mais de um pedido, fica o mais recente.
  const rows = await db`
    WITH ops AS (
      SELECT DISTINCT ON (d) d, id, area_hrm, area_hrm_outro FROM (
        SELECT substring(p.numero_op from '[0-9]{4,7}') AS d, p.id, p.area_hrm, p.area_hrm_outro
          FROM producao_pedido p WHERE p.numero_op IS NOT NULL
      ) x WHERE d IS NOT NULL ORDER BY d, id DESC
    )
    SELECT a.id, a.chave, a.op_hrm, a.item, a.po_item, a.pedido_omie, a.ns, a.material, a.descricao, a.quantidade,
           a.destino, a.vendedor, a.coordenador, a.caldeireiros, a.mp_obs,
           a.necessidade::text AS necessidade, a.conf_delv::text AS conf_delv, a.prev_faturamento::text AS prev_faturamento,
           a.prev_final::text AS prev_final, a.finalizado_em::text AS finalizado_em,
           a.situacao, a.situacao_detalhe, a.expedite, a.ocorrencia, a.obs,
           a.prioridade, a.prioridade_skid, a.seq_cliente, a.seq_oss, a.tinta, a.tinta_qtd, a.tinta_estoque,
           a.etapas, a.planilha_raw, a.ordem_planilha, a.atualizado_em, a.atualizado_por_nome,
           COALESCE(a.pedido_id, ops.id) AS pedido_id, ops.area_hrm, ops.area_hrm_outro,
           c.codigo_norm AS croqui_codigo, extract(epoch from c.atualizado_em)::bigint::text AS croqui_versao
      FROM producao_hrm_acomp a
      LEFT JOIN ops ON ops.d = a.op_hrm
      LEFT JOIN producao_croqui c ON c.codigo_norm = ${db.unsafe(SQL_CODIGO_CROQUI('a.material'))}
     WHERE (${filtroIds}::int[] IS NULL OR a.id = ANY(${filtroIds}::int[]))
     ORDER BY a.ordem_planilha NULLS LAST, a.id
  `;
  return rows as unknown as ItemHrm[];
}

export async function carregarHistHrm(db: Sql, acompId: number, limite = 200): Promise<HistHrm[]> {
  const rows = await db`
    SELECT id, tipo, campo, antes, depois, texto, origem, usuario_nome, criado_em
      FROM producao_hrm_acomp_hist WHERE acomp_id = ${acompId}
     ORDER BY criado_em DESC, id DESC LIMIT ${limite}
  `;
  return rows as unknown as HistHrm[];
}

export async function registrarHistHrm(
  db: Sql, acompId: number,
  h: { tipo: string; campo?: string | null; antes?: string | null; depois?: string | null; texto?: string | null; origem: 'planilha' | 'tela'; usuario: string },
) {
  await db`
    INSERT INTO producao_hrm_acomp_hist (acomp_id, tipo, campo, antes, depois, texto, origem, usuario_nome)
    VALUES (${acompId}, ${h.tipo}, ${h.campo ?? null}, ${h.antes ?? null}, ${h.depois ?? null}, ${h.texto ?? null}, ${h.origem}, ${h.usuario})
  `;
}
