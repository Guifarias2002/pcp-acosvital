// Exporta (só leitura) os pedidos do Sistema PCP emitidos em setembro/2026, com
// valor por fábrica (flange × caldeiraria), p/ cruzar com o export Omie.
// Uso: node --env-file=.env.local scripts/faturamento/sistema_setembro.mjs <saida.json>
import postgres from 'postgres';
import fs from 'node:fs';
const sql = postgres({ host: process.env.DB_HOST, port: 6543, database: process.env.DB_NAME, username: process.env.DB_USER,
  password: process.env.DB_PASSWORD, ssl: 'require', prepare: false, max: 1, connect_timeout: 15 });
const pedidos = await sql`
  SELECT p.id, p.numero_pedido_venda, p.numero_op, p.cliente, p.status, p.setor_atual, p.data_emissao::text AS data_emissao,
         p.valor_total::float8 AS valor_total, COALESCE('caldeiraria' = ANY(p.roteiro_base), false) AS nasceu_cald
  FROM producao_pedido p
  WHERE p.data_emissao >= '2026-08-01' ORDER BY p.data_emissao, p.id`;
const itens = await sql`
  SELECT i.pedido_id, i.codigo, i.descricao, i.quantidade::float8 AS quantidade, i.valor_unitario::float8 AS valor_unitario,
         COALESCE(i.fabrica,'flange') AS fabrica
  FROM producao_itempedido i JOIN producao_pedido p ON p.id = i.pedido_id
  WHERE i.inativo = false AND p.data_emissao >= '2026-08-01'`;
fs.writeFileSync(process.argv[2], JSON.stringify({ pedidos, itens }));
console.log(pedidos.length, itens.length);
await sql.end();
