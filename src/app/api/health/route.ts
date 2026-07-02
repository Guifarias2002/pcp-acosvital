import { NextResponse } from 'next/server';
import sql from '@/lib/db';
import { runMigrations } from '@/lib/migrations';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    // Garante que as migrations rodaram (inclui coluna desenhos e outras)
    await runMigrations();

    // Verifica conexão com o banco
    await sql`SELECT 1`;

    return NextResponse.json({ ok: true, ts: new Date().toISOString() });
  } catch (e) {
    console.error('[health] erro:', e);
    return NextResponse.json({ ok: false, erro: e instanceof Error ? e.message : 'erro' }, { status: 503 });
  }
}
