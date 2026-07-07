import { NextResponse } from 'next/server';
import { autenticar } from '@/lib/middleware';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  // Permite acesso via CRON_SECRET (script local de sincronizacao do backup
  // para pasta de rede), alem do login normal de staff.
  const auth = req.headers.get('authorization');
  const viaCronSecret = !!process.env.CRON_SECRET && auth === `Bearer ${process.env.CRON_SECRET}`;
  if (!viaCronSecret) {
    const user = await autenticar(req);
    if (user instanceof NextResponse) return user;
    if (!user.is_staff) return NextResponse.json({ erro: 'Acesso negado' }, { status: 403 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/^﻿/, '');
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceKey) {
    return NextResponse.json({ arquivos: [] });
  }

  const res = await fetch(`${supabaseUrl}/storage/v1/object/list/backups`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${serviceKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ prefix: 'backups/', limit: 100, sortBy: { column: 'name', order: 'desc' } }),
  });

  if (!res.ok) return NextResponse.json({ arquivos: [] });

  const data = await res.json();
  const arquivos = (Array.isArray(data) ? data : []).map((f: { name: string; metadata?: { size?: number }; created_at?: string }) => ({
    nome: f.name,
    data: f.name.replace('backups/', '').replace('.json', ''),
    tamanho: f.metadata?.size ?? 0,
    criado_em: f.created_at,
    url: `/api/cron/backup/download?arquivo=${encodeURIComponent(f.name)}`,
  }));

  return NextResponse.json({ arquivos });
}
