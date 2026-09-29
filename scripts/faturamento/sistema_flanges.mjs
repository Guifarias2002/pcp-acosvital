// Exporta (só leitura) os pedidos de FLANGE do sistema de um mês de emissão, com o
// mesmo valor da tela Valores por Mês (?fabrica=flange): pedido 100% flange =
// valor_total (ou soma dos itens); misto = soma só dos itens de flange; sem item e
// não nasceu na Caldeiraria = flange.
// Uso: node --env-file=.env.local scripts/faturamento/sistema_flanges.mjs <AAAA-MM> <saida.json>
import postgres from 'postgres';
import fs from 'node:fs';
const sql = postgres({ host: process.env.DB_HOST, port: 6543, database: process.env.DB_NAME, username: process.env.DB_USER,
  password: process.env.DB_PASSWORD, ssl: 'require', prepare: false, max: 1, connect_timeout: 15 });
const [mes, saida] = process.argv.slice(2);
const rows = await sql`
  SELECT p.id, p.numero_pedido_venda AS pedido, p.numero_op, p.cliente, p.status, p.data_emissao::text AS data_emissao,
         p.valor_total::float8 AS valor_total, COALESCE(agg.valor_flange, 0)::float8 AS valor_flange,
         COALESCE(agg.n_flange, 0)::int AS n_flange, COALESCE(agg.n_cald, 0)::int AS n_cald,
         COALESCE(agg.pecas_flange, 0)::float8 AS pecas,
         COALESCE('caldeiraria' = ANY(p.roteiro_base), false) AS nasceu_cald
  FROM producao_pedido p
  LEFT JOIN (
    SELECT pedido_id,
           SUM(quantidade * COALESCE(valor_unitario, 0)) FILTER (WHERE COALESCE(fabrica, 'flange') <> 'caldeiraria') AS valor_flange,
           SUM(quantidade) FILTER (WHERE COALESCE(fabrica, 'flange') <> 'caldeiraria') AS pecas_flange,
           COUNT(*) FILTER (WHERE COALESCE(fabrica, 'flange') <> 'caldeiraria') AS n_flange,
           COUNT(*) FILTER (WHERE fabrica = 'caldeiraria') AS n_cald
    FROM producao_itempedido WHERE inativo = false GROUP BY pedido_id
  ) agg ON agg.pedido_id = p.id
  WHERE to_char(p.data_emissao, 'YYYY-MM') = ${mes}
  ORDER BY p.data_emissao, p.id`;
const out = rows
  .filter(r => r.n_flange > 0 || (r.n_cald === 0 && !r.nasceu_cald))
  .map(r => ({ ...r, valor: (r.n_flange > 0 && r.n_cald > 0 ? r.valor_flange : (r.valor_total ?? r.valor_flange)) || 0 }));
fs.writeFileSync(saida, JSON.stringify(out));
console.log(out.length, out.reduce((s, r) => s + r.valor, 0).toFixed(2));
await sql.end();
