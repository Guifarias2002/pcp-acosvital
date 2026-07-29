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
  max: isProd ? 8 : 2,     // pooler (6543) aguenta centenas; 8 evita fila interna quando uma rota
                           // dispara varias queries em paralelo (dashboard manda 5 de uma vez)
  idle_timeout: 10,         // libera conexões ociosas mais rápido
  connect_timeout: 5,       // 5s — falha rápido para o Vercel poder retornar erro antes de timeout
  max_lifetime: 60 * 10,    // recicla conexões a cada 10 min — evita conexões mortas
  prepare: false,           // obrigatório no transaction mode pooler
  connection: {
    // Sem isso, uma função serverless que morre/timeout no meio de uma query
    // (comum na Vercel) deixa a conexão presa esperando o cliente ler o
    // resultado (estado ClientRead) — o Postgres nunca soube que ninguém mais
    // vai ler, e sem timeout de sessão fica assim por minutos, segurando lock
    // e travando tudo que vem atrás (visto 2x em produção: fila de ALTER
    // TABLE/SELECT presa atrás de 1-2 conexões zumbis). statement_timeout mata
    // a query (mesmo already-executada, esperando envio) depois de 30s.
    statement_timeout: 30000,
    // lock_timeout separado: se uma query não conseguir o lock que precisa em
    // 10s, falha rápido em vez de ficar na fila — evita o efeito cascata onde
    // dezenas de queries esperam atrás de uma só travada.
    lock_timeout: 10000,
  },
});

global._sql = sql;

export default sql;
