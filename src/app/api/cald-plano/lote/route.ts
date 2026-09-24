import { NextResponse } from 'next/server';
import sql from '@/lib/db';
import { autenticar } from '@/lib/middleware';
import { podePlanejarCaldeiraria } from '@/lib/auth';
import { CODIGOS_EMPRESA, PRIORIDADES_CALD, nomeEmpresa } from '@/lib/caldPlano';
import { carregarItensCald, registrarHistCald } from '@/lib/caldPlanoServer';

export const dynamic = 'force-dynamic';

// Alteração EM MASSA no PCP Caldeiraria (itens selecionados na Lista).
// body: { ids: number[], empresa?: 'acosvital'|'uberaba'|'hrm', prioridade?: ... }
// Só quem planeja. Grava 1 linha de histórico por item alterado.
export async function POST(req: Request) {
  const user = await autenticar(req);
  if (user instanceof NextResponse) return user;
  if (!podePlanejarCaldeiraria(user)) return NextResponse.json({ erro: 'Somente visualização' }, { status: 403 });
  let b: Record<string, unknown>;
  try { b = await req.json(); } catch { return NextResponse.json({ erro: 'JSON inválido' }, { status: 400 }); }
  const ids = Array.isArray(b.ids) ? Array.from(new Set((b.ids as unknown[]).map(Number).filter(n => Number.isInteger(n) && n > 0))).slice(0, 2000) : [];
  if (!ids.length) return NextResponse.json({ erro: 'Nenhum item selecionado' }, { status: 400 });
  const empresa = CODIGOS_EMPRESA.includes(String(b.empresa)) ? String(b.empresa) : null;
  const prioridade = PRIORIDADES_CALD.includes(b.prioridade as typeof PRIORIDADES_CALD[number]) ? String(b.prioridade) : null;
  if (!empresa && !prioridade) return NextResponse.json({ erro: 'Nada para alterar' }, { status: 400 });
  const quem = user.nome || user.username;

  try {
    const alterados = await sql.begin(async (tx) => {
      const atuais = await carregarItensCald(tx, ids);
      const feitos: number[] = [];
      for (const it of atuais) {
        const set: Record<string, unknown> = {};
        const mud: string[] = [];
        if (empresa && it.empresa !== empresa) { set.empresa = empresa; mud.push(`Empresa: ${nomeEmpresa(empresa)}`); }
        if (prioridade && it.prioridade !== prioridade) { set.prioridade = prioridade; mud.push(`Prioridade: ${prioridade}`); }
        if (!mud.length) continue;
        await tx`UPDATE producao_cald_plano_item SET ${tx(set)}, atualizado_em = NOW() WHERE id = ${it.id}`;
        await registrarHistCald(tx, it.id, 'editado', `${mud.join(' · ')} (alteração em massa)`, quem);
        feitos.push(it.id);
      }
      return feitos;
    });
    const itens = alterados.length ? await carregarItensCald(sql, alterados) : [];
    return NextResponse.json({ ok: true, alterados: alterados.length, itens });
  } catch (e) {
    console.error('[cald-plano/lote POST]', e);
    return NextResponse.json({ erro: 'Erro ao alterar os itens' }, { status: 500 });
  }
}
