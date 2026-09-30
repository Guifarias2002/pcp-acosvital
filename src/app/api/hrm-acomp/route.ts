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

// DELETE { confirmar: 'APAGAR' } → "Apagar planilha": tira TODAS as linhas do
// acompanhamento (e o histórico delas, por CASCADE) pra recomeçar a importação.
// Quem sobe a planilha pode apagar. Não mexe em OP/pedido de produção.
export async function DELETE(req: Request) {
  const user = await autenticar(req);
  if (user instanceof NextResponse) return user;
  if (!podeEditarAcompHrm(user)) return NextResponse.json({ erro: 'Sem permissao' }, { status: 403 });
  let body: { confirmar?: string } = {};
  try { body = await req.json(); } catch { /* sem corpo */ }
  if (body.confirmar !== 'APAGAR') return NextResponse.json({ erro: 'Confirmação ausente' }, { status: 400 });
  try {
    const r = await sql`DELETE FROM producao_hrm_acomp RETURNING id`;
    console.log(`[hrm-acomp] planilha apagada (${r.length} linhas) por ${user.nome || user.username}`);
    return NextResponse.json({ ok: true, apagados: r.length });
  } catch (e) {
    console.error('[hrm-acomp DELETE]', e);
    return NextResponse.json({ erro: 'Erro ao apagar a planilha' }, { status: 500 });
  }
}
