import { NextResponse } from 'next/server';
import sql from '@/lib/db';
import { runMigrations } from '@/lib/migrations';

export const dynamic = 'force-dynamic';

// Chamado pelo Vercel Cron a cada 10 min — mantém funções aquecidas e migrations aplicadas
export async function GET(req: Request) {
  const auth = req.headers.get('authorization');
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ erro: 'Não autorizado' }, { status: 401 });
  }

  try {
    await runMigrations();
    const [row] = await sql`SELECT COUNT(*) AS total FROM producao_pedido WHERE status != 'entregue'`;
    return NextResponse.json({ ok: true, ts: new Date().toISOString(), pedidos_ativos: Number(row.total) });
  } catch (e) {
    console.error('[keepalive] erro:', e);
    return NextResponse.json({ ok: false, erro: e instanceof Error ? e.message : 'erro' }, { status: 503 });
  }
}
