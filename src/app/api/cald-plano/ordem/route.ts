import { NextResponse } from 'next/server';
import sql from '@/lib/db';
import { autenticar } from '@/lib/middleware';
import { podePlanejarCaldeiraria } from '@/lib/auth';
import { CODIGOS_AREA } from '@/lib/caldPlano';

export const dynamic = 'force-dynamic';

// Ordem da fila de UMA área do Planejamento da Caldeiraria (o coordenador
// arrasta / usa ▲▼). body: { area, ids: [itemId na ordem desejada] }.
export async function POST(req: Request) {
  const user = await autenticar(req);
  if (user instanceof NextResponse) return user;
  if (!podePlanejarCaldeiraria(user)) return NextResponse.json({ erro: 'Sem permissao' }, { status: 403 });
  let b: Record<string, unknown>;
  try { b = await req.json(); } catch { return NextResponse.json({ erro: 'JSON inválido' }, { status: 400 }); }
  const area = String(b.area || '');
  // 'aguardando' = coluna "Chegando" (itens planejados que ainda não entraram).
  if (!CODIGOS_AREA.includes(area) && area !== 'aguardando') return NextResponse.json({ erro: 'Área inválida' }, { status: 400 });
  const ids = Array.isArray(b.ids) ? (b.ids as unknown[]).map(Number).filter(n => Number.isInteger(n) && n > 0).slice(0, 500) : [];
  if (!ids.length) return NextResponse.json({ ok: true });
  try {
    await sql.begin(async (tx) => {
      for (let i = 0; i < ids.length; i++) {
        await tx`UPDATE producao_cald_plano_item SET ordem = ${i + 1} WHERE id = ${ids[i]}`;
      }
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('[cald-plano/ordem POST]', e);
    return NextResponse.json({ erro: 'Erro ao salvar a ordem' }, { status: 500 });
  }
}
