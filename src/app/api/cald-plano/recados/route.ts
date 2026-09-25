import { NextResponse } from 'next/server';
import sql from '@/lib/db';
import { autenticar } from '@/lib/middleware';
import { podeConferirHrm, podePlanejarCaldeiraria, type JWTPayload } from '@/lib/auth';
import { AREA_POR_CODIGO, SUBSETORES_CALD, nomeSubsetor } from '@/lib/caldPlano';
import { registrarHistCald } from '@/lib/caldPlanoServer';

export const dynamic = 'force-dynamic';

// Recados do PCP Caldeiraria (Val) — gerados ao encaminhar um item pra um setor
// "mais a fundo" (SUBSETORES_VERIFICAR_ALAN) ou com observação. Chegam pro ALAN
// (Conferência HRM, vê todos) e pra QUALQUER PESSOA DA ÁREA (25/09): a tela do
// setor mostra os recados daquele setor — ou, recado só com a área geral, os de
// qualquer setor da área.
// GET  ?setor=cod → recados daquele setor; sem setor → todos (Alan/planejador/staff).
// POST { id, resposta? } → marca verificado (Alan/staff ou quem é do setor).
// Tabela da M56; sem ela, GET devolve vazio.

const setoresDe = (u: JWTPayload) => (u.setores?.length ? u.setores : (u.setor ? [u.setor] : []));
const ehStaff = (u: JWTPayload) => !!u.is_staff || u.perfil === 'administrador';
// O recado vale pro setor? (sub-setor igual, ou só a área e o setor é dela)
const recadoDoSetor = (area: string | null, sub: string | null, setor: string) =>
  sub ? sub === setor : (SUBSETORES_CALD[area || ''] || []).includes(setor);

export async function GET(req: Request) {
  const user = await autenticar(req);
  if (user instanceof NextResponse) return user;
  const setor = new URL(req.url).searchParams.get('setor') || '';
  const geral = podeConferirHrm(user) || podePlanejarCaldeiraria(user) || ehStaff(user);
  if (!setor && !geral) return NextResponse.json({ erro: 'Sem permissao' }, { status: 403 });
  if (setor && !geral && !setoresDe(user).includes(setor)) return NextResponse.json({ erro: 'Sem permissao' }, { status: 403 });
  try {
    const rows = await sql`
      SELECT r.id, r.item_id, r.area, r.sub_setor, r.mensagem, r.criado_por_nome, r.criado_em,
             r.verificado_em, r.verificado_por_nome, r.resposta,
             i.pedido, i.material, i.cliente, i.quantidade::float AS quantidade, i.unidade, i.status
      FROM producao_cald_plano_recado r
      JOIN producao_cald_plano_item i ON i.id = r.item_id
      WHERE r.verificado_em IS NULL OR r.verificado_em > NOW() - INTERVAL '15 days'
      ORDER BY (r.verificado_em IS NULL) DESC, r.criado_em DESC
      LIMIT 300
    `;
    const recados = rows
      .filter(r => !setor || recadoDoSetor(r.area as string | null, r.sub_setor as string | null, setor))
      .map(r => ({
        ...r,
        area_nome: AREA_POR_CODIGO[String(r.area || '')]?.nome || r.area,
        sub_setor_nome: nomeSubsetor(r.sub_setor as string | null),
      }));
    return NextResponse.json({ recados });
  } catch (e) {
    console.error('[cald-plano/recados GET]', e);
    return NextResponse.json({ recados: [] });
  }
}

export async function POST(req: Request) {
  const user = await autenticar(req);
  if (user instanceof NextResponse) return user;
  let b: Record<string, unknown>;
  try { b = await req.json(); } catch { return NextResponse.json({ erro: 'JSON inválido' }, { status: 400 }); }
  const id = Number(b.id);
  if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ erro: 'Recado inválido' }, { status: 400 });
  const resposta = typeof b.resposta === 'string' && b.resposta.trim() ? b.resposta.trim().slice(0, 1000) : null;
  const quem = user.nome || user.username;
  try {
    const r = await sql.begin(async (tx) => {
      const [rec] = await tx`SELECT item_id, area, sub_setor FROM producao_cald_plano_recado WHERE id = ${id} AND verificado_em IS NULL FOR UPDATE`;
      if (!rec) return 404;
      const podeTodos = podeConferirHrm(user) || ehStaff(user);
      const doSetor = setoresDe(user).some(s => recadoDoSetor(rec.area as string | null, rec.sub_setor as string | null, s));
      if (!podeTodos && !doSetor) return 403;
      await tx`
        UPDATE producao_cald_plano_recado
        SET verificado_em = NOW(), verificado_por_nome = ${quem}, resposta = ${resposta}
        WHERE id = ${id}
      `;
      await registrarHistCald(tx, rec.item_id as number, 'verificado',
        `Verificado por ${quem}${rec.sub_setor ? ` (${nomeSubsetor(rec.sub_setor as string)})` : ''}${resposta ? `: ${resposta}` : ''}`, quem);
      return 200;
    });
    if (r === 404) return NextResponse.json({ erro: 'Recado não encontrado ou já verificado' }, { status: 404 });
    if (r === 403) return NextResponse.json({ erro: 'Só quem é do setor (ou o Alan) marca como verificado' }, { status: 403 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('[cald-plano/recados POST]', e);
    return NextResponse.json({ erro: 'Erro ao marcar como verificado' }, { status: 500 });
  }
}
