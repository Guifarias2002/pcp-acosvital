// Permite que admins disparem o backup manualmente pela UI
import { NextResponse } from 'next/server';
import { autenticar } from '@/lib/middleware';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const user = await autenticar(req);
  if (user instanceof NextResponse) return user;
  if (!user.is_staff) return NextResponse.json({ erro: 'Acesso negado' }, { status: 403 });

  // Chama o próprio endpoint de cron internamente com o secret
  const base = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
  const secret = process.env.CRON_SECRET || '';

  const r = await fetch(`${base}/api/cron/backup`, {
    headers: { Authorization: `Bearer ${secret}` },
  });

  const d = await r.json();
  return NextResponse.json(d, { status: r.ok ? 200 : 500 });
}
