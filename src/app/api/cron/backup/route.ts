import { NextResponse } from 'next/server';
import sql from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  try {
  // Vercel envia este header para proteger rotas de cron
  const auth = req.headers.get('authorization');
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ erro: 'Não autorizado' }, { status: 401 });
  }

  const agora = new Date();
  // Rotula pelo horario de Brasilia (UTC-3) para o arquivo ficar legivel - roda
  // 2x por dia (00h e 17h BRT), entao precisa de um sufixo pra nao uma
  // sobrescrever a outra no mesmo dia. Data E hora vem do MESMO instante
  // ajustado pro fuso BRT (antes a data usava UTC e a hora usava BRT
  // separadamente, o que rotulava backups de "23h-01h BRT" com a data UTC do
  // dia seguinte e a hora do dia anterior - o nome ficava fora de ordem
  // alfabetica em relacao a backups mais novos, e o script de sync local
  // (que pega so o "mais recente" por nome) podia escolher um arquivo velho).
  const agoraBrt = new Date(agora.getTime() - 3 * 60 * 60 * 1000);
  const hoje = agoraBrt.toISOString().slice(0, 10); // YYYY-MM-DD, ja em BRT
  const horaBrt = agoraBrt.toISOString().slice(11, 16).replace(':', '');

  // Busca todos os pedidos com itens e parciais
  // Movimentações limitadas a 90 dias para evitar payload gigante
  const noventa = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
  const [pedidos, itens, parciais, movimentacoes] = await Promise.all([
    sql`SELECT * FROM producao_pedido ORDER BY id`,
    sql`SELECT * FROM producao_itempedido ORDER BY id`,
    sql`SELECT * FROM producao_itemparcial ORDER BY id`,
    sql`SELECT * FROM producao_movimentacaoitem WHERE criado_em >= ${noventa} ORDER BY id`,
  ]);

  const nomeArquivo = `${hoje}_${horaBrt}`;

  const snapshot = {
    data: hoje,
    hora_brt: horaBrt,
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

  const path = `backups/${nomeArquivo}.json`;
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

  console.log(`[cron/backup] Backup ${nomeArquivo} salvo — ${pedidos.length} pedidos, ${itens.length} itens`);
  return NextResponse.json({ ok: true, data: hoje, hora_brt: horaBrt, totais: snapshot.totais });
  } catch (e) {
    console.error('[cron/backup] erro:', e);
    return NextResponse.json({ erro: e instanceof Error ? e.message : 'Erro interno' }, { status: 500 });
  }
}
