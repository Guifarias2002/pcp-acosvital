import { NextResponse } from 'next/server';
import { autenticar } from '@/lib/middleware';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);

  // Permite acesso via CRON_SECRET (script local de sincronizacao do backup
  // para pasta de rede), alem do login normal de staff.
  const authHeader = req.headers.get('authorization');
  const viaCronSecret = !!process.env.CRON_SECRET && authHeader === `Bearer ${process.env.CRON_SECRET}`;
  if (!viaCronSecret) {
    // Suporta token via query param (para window.open)
    const tokenParam = searchParams.get('token');
    const reqComToken = tokenParam
      ? new Request(req.url, { headers: { ...Object.fromEntries(req.headers), Authorization: `Bearer ${tokenParam}` } })
      : req;
    const user = await autenticar(reqComToken);
    if (user instanceof NextResponse) return user;
    if (!user.is_staff) return NextResponse.json({ erro: 'Acesso negado' }, { status: 403 });
  }
  const arquivo = searchParams.get('arquivo');
  if (!arquivo || !arquivo.endsWith('.json')) {
    return NextResponse.json({ erro: 'Arquivo inválido' }, { status: 400 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/^﻿/, '');
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  const res = await fetch(`${supabaseUrl}/storage/v1/object/backups/${arquivo}`, {
    headers: { Authorization: `Bearer ${serviceKey}` },
  });

  if (!res.ok) return NextResponse.json({ erro: 'Arquivo não encontrado' }, { status: 404 });

  const body = await res.arrayBuffer();
  const nome = arquivo.split('/').pop() ?? arquivo;

  return new Response(body, {
    headers: {
      'Content-Type': 'application/json',
      'Content-Disposition': `attachment; filename="${nome}"`,
    },
  });
}
