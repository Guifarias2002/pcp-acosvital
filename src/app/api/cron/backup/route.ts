import { NextResponse } from 'next/server';
import sql from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  // Vercel envia este header para proteger rotas de cron
  const auth = req.headers.get('authorization');
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ erro: 'Não autorizado' }, { status: 401 });
  }

  const hoje = new Date().toISOString().slice(0, 10); // YYYY-MM-DD

  // Busca todos os pedidos com itens e parciais
  // Movimentações limitadas a 90 dias para evitar payload gigante
  const noventa = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
  const [pedidos, itens, parciais, movimentacoes] = await Promise.all([
    sql`SELECT * FROM producao_pedido ORDER BY id`,
    sql`SELECT * FROM producao_itempedido ORDER BY id`,
    sql`SELECT * FROM producao_itemparcial ORDER BY id`,
    sql`SELECT * FROM producao_movimentacaoitem WHERE criado_em >= ${noventa} ORDER BY id`,
  ]);

  const snapshot = {
    data: hoje,
    gerado_em: new Date().toISOString(),
    totais: {
      pedidos: pedidos.length,
      itens: itens.length,
      parciais: parciais.length,
      movimentacoes: movimentacoes.length,
    },
    pedidos,
    itens,
    parciais,
    movimentacoes,
  };

  const json = JSON.stringify(snapshot, null, 2);
  const bytes = Buffer.from(json, 'utf-8');

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/^﻿/, '');
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceKey) {
    return NextResponse.json({ erro: 'Supabase não configurado' }, { status: 500 });
  }

  const path = `backups/${hoje}.json`;
  const uploadUrl = `${supabaseUrl}/storage/v1/object/backups/${path}`;

  const res = await fetch(uploadUrl, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${serviceKey}`,
      'Content-Type': 'application/json',
      'x-upsert': 'true',
    },
    body: bytes,
  });

  if (!res.ok) {
    const err = await res.text();
    console.error('[cron/backup] Supabase upload error:', err);
    return NextResponse.json({ erro: 'Falha ao salvar backup', detalhe: err }, { status: 500 });
  }

  console.log(`[cron/backup] Backup ${hoje} salvo — ${pedidos.length} pedidos, ${itens.length} itens`);
  return NextResponse.json({ ok: true, data: hoje, totais: snapshot.totais });
}
