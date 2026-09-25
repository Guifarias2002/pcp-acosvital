import { NextResponse } from 'next/server';
import sql from '@/lib/db';
import { autenticar } from '@/lib/middleware';
import { podeConferirHrm, podePlanejarCaldeiraria } from '@/lib/auth';
import { AREA_POR_CODIGO, nomeSubsetor } from '@/lib/caldPlano';
import { registrarHistCald } from '@/lib/caldPlanoServer';

export const dynamic = 'force-dynamic';

// Recados do PCP Caldeiraria (Val) pro Alan — gerados ao encaminhar um item pra
// um sub-setor "mais a fundo" (SUBSETORES_VERIFICAR_ALAN) ou com observação.
// GET  → pendentes + últimos verificados (quem confere HRM ou planeja).
// POST → { id, resposta? } marca como verificado (quem confere HRM).
// Tabela da M56; sem ela, GET devolve vazio.

export async function GET(req: Request) {
  const user = await autenticar(req);
  if (user instanceof NextResponse) return user;
  if (!podeConferirHrm(user) && !podePlanejarCaldeiraria(user)) return NextResponse.json({ erro: 'Sem permissao' }, { status: 403 });
  try {
    const rows = await sql`
      SELECT r.id, r.item_id, r.area, r.sub_setor, r.mensagem, r.criado_por_nome, r.criado_em,
             r.verificado_em, r.verificado_por_nome, r.resposta,
             i.pedido, i.material, i.cliente, i.quantidade::float AS quantidade, i.unidade, i.status
      FROM producao_cald_plano_recado r
      JOIN producao_cald_plano_item i ON i.id = r.item_id
      WHERE r.verificado_em IS NULL OR r.verificado_em > NOW() - INTERVAL '15 days'
      ORDER BY (r.verificado_em IS NULL) DESC, r.criado_em DESC
      LIMIT 200
    `;
    const recados = rows.map(r => ({
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
  if (!podeConferirHrm(user)) return NextResponse.json({ erro: 'Só quem confere a Caldeiraria HRM marca como verificado' }, { status: 403 });
  let b: Record<string, unknown>;
  try { b = await req.json(); } catch { return NextResponse.json({ erro: 'JSON inválido' }, { status: 400 }); }
  const id = Number(b.id);
  if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ erro: 'Recado inválido' }, { status: 400 });
  const resposta = typeof b.resposta === 'string' && b.resposta.trim() ? b.resposta.trim().slice(0, 1000) : null;
  const quem = user.nome || user.username;
  try {
    const r = await sql.begin(async (tx) => {
      const [rec] = await tx`
        UPDATE producao_cald_plano_recado
        SET verificado_em = NOW(), verificado_por_nome = ${quem}, resposta = ${resposta}
        WHERE id = ${id} AND verificado_em IS NULL
        RETURNING item_id, sub_setor
      `;
      if (!rec) return false;
      await registrarHistCald(tx, rec.item_id as number, 'verificado',
        `Verificado por ${quem}${rec.sub_setor ? ` (${nomeSubsetor(rec.sub_setor as string)})` : ''}${resposta ? `: ${resposta}` : ''}`, quem);
      return true;
    });
    if (!r) return NextResponse.json({ erro: 'Recado não encontrado ou já verificado' }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('[cald-plano/recados POST]', e);
    return NextResponse.json({ erro: 'Erro ao marcar como verificado' }, { status: 500 });
  }
}
