import { NextResponse } from 'next/server';
import sql from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    // Verifica conexão com o banco
    await sql`SELECT 1`;

    return NextResponse.json({ ok: true, ts: new Date().toISOString() });
  } catch (e) {
    console.error('[health] erro:', e);
    return NextResponse.json({ ok: false, erro: e instanceof Error ? e.message : 'erro' }, { status: 503 });
  }
}
