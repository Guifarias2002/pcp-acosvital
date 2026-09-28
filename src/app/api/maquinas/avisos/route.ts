import { NextResponse } from 'next/server';
import sql from '@/lib/db';
import { autenticar } from '@/lib/middleware';
import { podePlanejar } from '@/lib/auth';
import { MAQUINAS_POR_SETOR } from '@/lib/maquinas';

export const dynamic = 'force-dynamic';

// AVISO DE MÁQUINA do operador → Planejamento (M60).
// GET  → { pendentes, recentes }. Planejamento vê todos; o operador vê os que
//        ele mesmo mandou (pra acompanhar se já foi visto/resolvido).
//        ?contar=1 → só { pendentes: n } (alerta global, leve).
// POST → { maquina, tipo, mensagem }                       (qualquer usuário logado)
//        { acao: 'resolver', id, resposta? }                (só Planejamento)
//        { acao: 'editar', id, maquina, tipo, mensagem }    (autor, enquanto pendente; ou Planejamento)
//        { acao: 'excluir', id }                            (autor, enquanto pendente; ou Planejamento)

const TIPOS_AVISO_MAQUINA = ['quebrou', 'voltou', 'outro'] as const;
const TODAS = new Set(Object.values(MAQUINAS_POR_SETOR).flatMap(gs => gs.flatMap(g => g.maquinas)));
const setorDa = (m: string) => Object.entries(MAQUINAS_POR_SETOR).find(([, gs]) => gs.some(g => g.maquinas.includes(m)))?.[0] ?? null;
const txt = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

export async function GET(req: Request) {
  const user = await autenticar(req);
  if (user instanceof NextResponse) return user;
  const planeja = podePlanejar(user);
  const quem = user.nome || user.username;
  const url = new URL(req.url);
  try {
    if (url.searchParams.get('contar')) {
      if (!planeja) return NextResponse.json({ pendentes: 0 });
      const [{ n }] = await sql`SELECT COUNT(*)::int AS n FROM producao_maquina_aviso WHERE resolvido_em IS NULL`;
      return NextResponse.json({ pendentes: n });
    }
    const pendentes = await sql`
      SELECT id, maquina, tipo, mensagem, setor, criado_por_nome, criado_em
      FROM producao_maquina_aviso
      WHERE resolvido_em IS NULL AND (${planeja} OR criado_por_nome = ${quem})
      ORDER BY criado_em DESC LIMIT 100
    `;
    const recentes = await sql`
      SELECT id, maquina, tipo, mensagem, setor, criado_por_nome, criado_em, resolvido_em, resolvido_por_nome, resposta
      FROM producao_maquina_aviso
      WHERE resolvido_em IS NOT NULL AND resolvido_em > NOW() - INTERVAL '7 days' AND (${planeja} OR criado_por_nome = ${quem})
      ORDER BY resolvido_em DESC LIMIT 30
    `;
    return NextResponse.json({ pendentes, recentes });
  } catch {
    return NextResponse.json({ pendentes: url.searchParams.get('contar') ? 0 : [], recentes: [] });
  }
}

export async function POST(req: Request) {
  const user = await autenticar(req);
  if (user instanceof NextResponse) return user;
  let b: Record<string, unknown>;
  try { b = await req.json(); } catch { return NextResponse.json({ erro: 'JSON inválido' }, { status: 400 }); }
  const quem = user.nome || user.username;
  try {
    if (b.acao === 'resolver') {
      if (!podePlanejar(user)) return NextResponse.json({ erro: 'Só o Planejamento resolve avisos de máquina' }, { status: 403 });
      const id = Number(b.id);
      if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ erro: 'Aviso inválido' }, { status: 400 });
      await sql`
        UPDATE producao_maquina_aviso
        SET resolvido_em = NOW(), resolvido_por_nome = ${quem}, resposta = ${txt(b.resposta, 500) || null}
        WHERE id = ${id} AND resolvido_em IS NULL
      `;
      return NextResponse.json({ ok: true });
    }
    // Editar/excluir: o PRÓPRIO autor (enquanto não resolvido) ou o Planejamento.
    if (b.acao === 'excluir' || b.acao === 'editar') {
      const id = Number(b.id);
      if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ erro: 'Aviso inválido' }, { status: 400 });
      const [av] = await sql`SELECT id, criado_por_nome, resolvido_em FROM producao_maquina_aviso WHERE id = ${id}`;
      if (!av) return NextResponse.json({ erro: 'Aviso não encontrado' }, { status: 404 });
      const planeja = podePlanejar(user);
      if (!planeja && (av.criado_por_nome !== quem || av.resolvido_em))
        return NextResponse.json({ erro: 'Só dá pra mudar o seu aviso enquanto o Planejamento não resolveu' }, { status: 403 });
      if (b.acao === 'excluir') {
        await sql`DELETE FROM producao_maquina_aviso WHERE id = ${id}`;
        return NextResponse.json({ ok: true });
      }
    }
    const maquina = txt(b.maquina, 60);
    const tipo = String(b.tipo || '');
    const mensagem = txt(b.mensagem, 500);
    if (!TODAS.has(maquina)) return NextResponse.json({ erro: 'Escolha a máquina' }, { status: 400 });
    if (!(TIPOS_AVISO_MAQUINA as readonly string[]).includes(tipo)) return NextResponse.json({ erro: 'Tipo de aviso inválido' }, { status: 400 });
    if (tipo !== 'voltou' && !mensagem) return NextResponse.json({ erro: 'Conte o que aconteceu com a máquina' }, { status: 400 });
    if (b.acao === 'editar') {
      await sql`
        UPDATE producao_maquina_aviso SET maquina = ${maquina}, tipo = ${tipo}, mensagem = ${mensagem || null}, setor = ${setorDa(maquina)}
        WHERE id = ${Number(b.id)}
      `;
      return NextResponse.json({ ok: true });
    }
    await sql`
      INSERT INTO producao_maquina_aviso (maquina, tipo, mensagem, setor, criado_por_nome)
      VALUES (${maquina}, ${tipo}, ${mensagem || null}, ${setorDa(maquina)}, ${quem})
    `;
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('[maquinas/avisos POST]', e);
    return NextResponse.json({ erro: 'Erro ao enviar o aviso' }, { status: 500 });
  }
}
