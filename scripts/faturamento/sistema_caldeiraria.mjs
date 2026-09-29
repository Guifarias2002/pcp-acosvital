// Exporta (só leitura) os itens do PCP Caldeiraria (producao_cald_plano_item),
// p/ cruzar com o export Omie do faturamento. Mês do item = chegada na Caldeiraria
// (1ª entrada numa etapa), igual à tela Valores por Mês; sem chegada → criado_em.
// Uso: node --env-file=.env.local scripts/faturamento/sistema_caldeiraria.mjs <saida.json>
import postgres from 'postgres';
import fs from 'node:fs';
const sql = postgres({ host: process.env.DB_HOST, port: 6543, database: process.env.DB_NAME, username: process.env.DB_USER,
  password: process.env.DB_PASSWORD, ssl: 'require', prepare: false, max: 1, connect_timeout: 15 });
const itens = await sql`
  SELECT id, pedido, cliente, vendedor, material, quantidade::float8 AS quantidade, unidade, valor::float8 AS valor,
         valor_unitario::float8 AS valor_unitario, empresa, sub_setor, area_atual, status, parcial,
         prazo_entrega::text AS prazo_entrega, prev_faturamento::text AS prev_faturamento, faturado_em::text AS faturado_em,
         finalizado_em::text AS finalizado_em, criado_em::text AS criado_em,
         (SELECT MIN(e.entrada)::text FROM producao_cald_plano_etapa e WHERE e.item_id = i.id) AS chegada
  FROM producao_cald_plano_item i ORDER BY id`;
fs.writeFileSync(process.argv[2], JSON.stringify(itens));
console.log(itens.length);
await sql.end();
