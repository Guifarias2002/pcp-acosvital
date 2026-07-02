import postgres from 'postgres';

// Singleton — reutiliza a conexão em todos os requests (hot-reload safe)
declare global {
  // eslint-disable-next-line no-var
  var _sql: postgres.Sql | undefined;
}

const isProd = process.env.NODE_ENV === 'production';

const sql = global._sql ?? postgres({
  host: process.env.DB_HOST!,
  port: 6543,          // transaction pooler — suporta centenas de conexões simultâneas
  database: process.env.DB_NAME!,
  username: process.env.DB_USER!,
  password: process.env.DB_PASSWORD!,
  ssl: 'require',
  max: isProd ? 3 : 2,     // conservador: Supabase free tem limite de conexões
  idle_timeout: 10,         // libera conexões ociosas mais rápido
  connect_timeout: 8,       // 8s (Vercel tem limite de 10s na rota)
  max_lifetime: 60 * 10,    // recicla conexões a cada 10 min — evita conexões mortas
  prepare: false,           // obrigatório no transaction mode pooler
});

if (process.env.NODE_ENV !== 'production') global._sql = sql;

export default sql;
