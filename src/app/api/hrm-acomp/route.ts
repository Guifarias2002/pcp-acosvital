import { NextResponse } from 'next/server';
import { autenticar } from '@/lib/middleware';
import { podeEditarAcompHrm, podeVerAcompHrm } from '@/lib/auth';
import { carregarItensHrm } from '@/lib/hrmAcompServer';
import { runMigrations } from '@/lib/migrations';
import sql from '@/lib/db';

export const dynamic = 'force-dynamic';

// Acompanhamento HRM — GET → todas as linhas (a planilha do Alan no sistema).
export async function GET(req: Request) {
  const user = await autenticar(req);
  if (user instanceof NextResponse) return user;
  if (!podeVerAcompHrm(user)) return NextResponse.json({ erro: 'Sem permissao' }, { status: 403 });
  try {
    let itens;
    try {
      itens = await carregarItensHrm(sql);
    } catch (e) {
      // Tabela ainda não criada (instância subiu antes da M63) → migra e tenta 1x.
      if ((e as { code?: string })?.code !== '42P01') throw e;
      await runMigrations();
      itens = await carregarItensHrm(sql);
    }
    return NextResponse.json({ itens, pode_editar: podeEditarAcompHrm(user) });
  } catch (e) {
    console.error('[hrm-acomp GET]', e);
    return NextResponse.json({ erro: 'Erro ao carregar o acompanhamento' }, { status: 500 });
  }
}
