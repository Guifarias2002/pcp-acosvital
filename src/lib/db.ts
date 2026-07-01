import postgres from 'postgres';

// Singleton — reutiliza a conexão em todos os requests (hot-reload safe)
declare global {
  // eslint-disable-next-line no-var
  var _sql: postgres.Sql | undefined;
}

const sql = global._sql ?? postgres({
  host: process.env.DB_HOST!,
  port: 6543,                  // transaction mode pooler — suporta centenas de conexões simultâneas
  database: process.env.DB_NAME!,
  username: process.env.DB_USER!,
  password: process.env.DB_PASSWORD!,
  ssl: 'require',
  max: 3,
  idle_timeout: 20,
  connect_timeout: 10,
  prepare: false,              // obrigatório no transaction mode
});

if (process.env.NODE_ENV !== 'production') global._sql = sql;

export default sql;
