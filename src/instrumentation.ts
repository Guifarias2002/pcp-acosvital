// Roda uma vez quando cada instância do servidor sobe (cold start / novo deploy).
// Antes, as migrations só rodavam via cron do keepalive (1x por dia) - isso deixou
// uma coluna nova sem existir em produção por horas depois do deploy e quebrou as
// telas de setor. Agora aplica na hora, sem depender do cron.
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { runMigrations } = await import('./lib/migrations');
    await runMigrations().catch((e) => console.error('[instrumentation] runMigrations falhou:', e));
  }
}
