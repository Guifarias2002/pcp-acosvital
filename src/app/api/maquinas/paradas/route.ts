import { NextResponse } from 'next/server';
import sql from '@/lib/db';
import { autenticar } from '@/lib/middleware';
import { podePlanejar } from '@/lib/auth';
import { MAQUINAS_POR_SETOR } from '@/lib/maquinas';
import { listarMaquinasParadas } from '@/lib/maquinasParadas';

export const dynamic = 'force-dynamic';

// Máquinas PARADAS (quebradas / manutenção) — M59.
// GET  → paradas ativas (qualquer usuário logado: o operador precisa ver no
//        modal de iniciar) + histórico recente (30 últimas liberadas).
// POST → só o Planejamento (podePlanejar: admin ou acesso_planejamento):
//        { acao: 'parar', maquina, motivo, previsao_retorno? }
//        { acao: 'liberar', id, obs? }   ("voltou a funcionar")
//        { acao: 'editar', id, maquina, motivo, previsao_retorno? }  (apontamento errado)
//        { acao: 'excluir', id }                                     (apontamento errado)

const TODAS = new Set(Object.values(MAQUINAS_POR_SETOR).flatMap(gs => gs.flatMap(g => g.maquinas)));
const txt = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const iso = (v: unknown) => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null);

export async function GET(req: Request) {
  const user = await autenticar(req);
  if (user instanceof NextResponse) return user;
  const ativas = await listarMaquinasParadas();
  let historico: readonly unknown[] = [];
  try {
    historico = await sql`
      SELECT id, maquina, motivo, desde, criado_por_nome, liberada_em, liberada_por_nome, obs_liberacao
      FROM producao_maquina_parada WHERE liberada_em IS NOT NULL
      ORDER BY liberada_em DESC LIMIT 30
    `;
  } catch { /* sem tabela ainda */ }
  return NextResponse.json({ ativas, historico });
}

export async function POST(req: Request) {
  const user = await autenticar(req);
  if (user instanceof NextResponse) return user;
  if (!podePlanejar(user)) return NextResponse.json({ erro: 'Só o Planejamento pode registrar máquina parada' }, { status: 403 });
  let b: Record<string, unknown>;
  try { b = await req.json(); } catch { return NextResponse.json({ erro: 'JSON inválido' }, { status: 400 }); }
  const quem = user.nome || user.username;

  try {
    if (b.acao === 'parar') {
      const maquina = txt(b.maquina, 60);
      const motivo = txt(b.motivo, 500);
      if (!TODAS.has(maquina)) return NextResponse.json({ erro: 'Máquina inválida' }, { status: 400 });
      if (!motivo) return NextResponse.json({ erro: 'Informe o motivo da parada' }, { status: 400 });
      const [ja] = await sql`SELECT id FROM producao_maquina_parada WHERE maquina = ${maquina} AND liberada_em IS NULL`;
      if (ja) return NextResponse.json({ erro: `${maquina} já está registrada como parada` }, { status: 409 });
      await sql`
        INSERT INTO producao_maquina_parada (maquina, motivo, previsao_retorno, criado_por_nome)
        VALUES (${maquina}, ${motivo}, ${iso(b.previsao_retorno)}, ${quem})
      `;
    } else if (b.acao === 'editar') {
      // Corrigir um apontamento errado: máquina, motivo e previsão.
      const id = Number(b.id);
      const maquina = txt(b.maquina, 60);
      const motivo = txt(b.motivo, 500);
      if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ erro: 'Registro inválido' }, { status: 400 });
      if (!TODAS.has(maquina)) return NextResponse.json({ erro: 'Máquina inválida' }, { status: 400 });
      if (!motivo) return NextResponse.json({ erro: 'Informe o motivo da parada' }, { status: 400 });
      const [ja] = await sql`SELECT id FROM producao_maquina_parada WHERE maquina = ${maquina} AND liberada_em IS NULL AND id <> ${id}`;
      if (ja) return NextResponse.json({ erro: `${maquina} já está registrada como parada` }, { status: 409 });
      const r = await sql`
        UPDATE producao_maquina_parada SET maquina = ${maquina}, motivo = ${motivo}, previsao_retorno = ${iso(b.previsao_retorno)}
        WHERE id = ${id} AND liberada_em IS NULL RETURNING id
      `;
      if (!r.length) return NextResponse.json({ erro: 'Essa parada já foi encerrada' }, { status: 409 });
    } else if (b.acao === 'excluir') {
      // Apontamento errado: apaga o registro (a máquina volta ao normal na hora).
      const id = Number(b.id);
      if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ erro: 'Registro inválido' }, { status: 400 });
      await sql`DELETE FROM producao_maquina_parada WHERE id = ${id}`;
    } else if (b.acao === 'liberar') {
      const id = Number(b.id);
      if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ erro: 'Registro inválido' }, { status: 400 });
      const r = await sql`
        UPDATE producao_maquina_parada
        SET liberada_em = NOW(), liberada_por_nome = ${quem}, obs_liberacao = ${txt(b.obs, 500) || null}
        WHERE id = ${id} AND liberada_em IS NULL RETURNING id
      `;
      if (!r.length) return NextResponse.json({ erro: 'Essa parada já foi encerrada' }, { status: 409 });
    } else {
      return NextResponse.json({ erro: 'Ação inválida' }, { status: 400 });
    }
    return NextResponse.json({ ok: true, ativas: await listarMaquinasParadas() });
  } catch (e) {
    console.error('[maquinas/paradas POST]', e);
    return NextResponse.json({ erro: 'Erro ao salvar' }, { status: 500 });
  }
}
