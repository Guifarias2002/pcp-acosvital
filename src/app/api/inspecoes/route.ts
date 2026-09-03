import { NextResponse } from 'next/server';
import sql from '@/lib/db';
import { autenticar } from '@/lib/middleware';

export const dynamic = 'force-dynamic';

// GET /api/inspecoes?status=pendente — fila de inspeções pra Qualidade atuar
// (item 9 do checklist do PCP: peça parada aguardando inspeção fica VISÍVEL).
// status: 'pendente' (padrão) | 'resolvidas' (histórico dos últimos laudos) | 'todas'.
export async function GET(req: Request) {
  const user = await autenticar(req);
  if (user instanceof NextResponse) return user;

  const url = new URL(req.url);
  const filtro = url.searchParams.get('status') || 'pendente';

  try {
    const where =
      filtro === 'pendente' ? sql`insp.status = 'pendente'`
      : filtro === 'resolvidas' ? sql`insp.status <> 'pendente'`
      : sql`TRUE`;
    // Pendentes primeiro e mais antigas no topo (quem espera há mais tempo);
    // resolvidas mais recentes no topo.
    const rows = await sql`
      SELECT
        insp.id, insp.tipo, insp.setor, insp.status,
        insp.observacao_solicitacao, insp.solicitado_em, insp.resolvido_em, insp.laudo,
        insp.item_id, insp.parcial_id, insp.pedido_id,
        i.codigo, i.descricao,
        pa.quantidade::float AS quantidade, pa.setor_atual AS parcial_setor,
        sol.nome AS solicitante, insp_user.nome AS inspetor
      FROM producao_inspecao insp
      JOIN producao_itempedido i ON i.id = insp.item_id
      LEFT JOIN producao_itemparcial pa ON pa.id = insp.parcial_id
      LEFT JOIN usuarios_usuario sol ON sol.id = insp.solicitado_por_id
      LEFT JOIN usuarios_usuario insp_user ON insp_user.id = insp.inspetor_id
      WHERE ${where} AND i.fabrica = 'caldeiraria'
      ORDER BY (insp.status = 'pendente') DESC,
               CASE WHEN insp.status = 'pendente' THEN insp.solicitado_em END ASC,
               insp.resolvido_em DESC NULLS LAST
      LIMIT 200
    `;
    const pendentes = (rows as unknown as { status: string }[]).filter(r => r.status === 'pendente').length;
    return NextResponse.json({ inspecoes: rows, pendentes });
  } catch (e) {
    console.error('[inspecoes GET]', e);
    return NextResponse.json({ inspecoes: [], pendentes: 0 });
  }
}
