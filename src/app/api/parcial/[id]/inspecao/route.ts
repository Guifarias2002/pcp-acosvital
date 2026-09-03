import { NextResponse } from 'next/server';
import sql from '@/lib/db';
import { autenticar } from '@/lib/middleware';
import { checkMutationRateLimit, getClientIp } from '@/lib/rateLimit';
import { TIPOS_INSPECAO_COD, nomeInspecao } from '@/lib/types';

export const dynamic = 'force-dynamic';

// POST /api/parcial/[id]/inspecao — o APONTADOR solicita uma inspeção (Hold
// Point) num ponto do roteiro. Cria uma inspeção 'pendente' (M34) e registra no
// Histórico do Pedido. A partir daí a peça fica aguardando a Qualidade atuar.
// Ver fluxo em [[project_datas_op_cliente]] (itens 7-9 do checklist do PCP).
export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const user = await autenticar(req);
    if (user instanceof NextResponse) return user;
    if (!checkMutationRateLimit(getClientIp(req)))
      return NextResponse.json({ erro: 'Muitas requisicoes' }, { status: 429 });

    const parcialId = Number(params.id);
    if (!Number.isInteger(parcialId) || parcialId <= 0)
      return NextResponse.json({ erro: 'ID inválido' }, { status: 400 });

    const body = await req.json().catch(() => ({}));
    const tipo = typeof body.tipo === 'string' ? body.tipo : '';
    if (!TIPOS_INSPECAO_COD.includes(tipo))
      return NextResponse.json({ erro: 'Tipo de inspeção inválido' }, { status: 400 });
    const observacao = typeof body.observacao === 'string' ? body.observacao.trim().slice(0, 500) : '';

    const [parcial] = await sql`
      SELECT pa.id, pa.item_pedido_id, pa.pedido_id, pa.setor_atual, i.status AS item_status, i.fabrica
      FROM producao_itemparcial pa
      JOIN producao_itempedido i ON i.id = pa.item_pedido_id
      WHERE pa.id = ${parcialId}
    `;
    if (!parcial) return NextResponse.json({ erro: 'Parcial não encontrada' }, { status: 404 });
    // Inspeções/Hold Points são um processo da CALDEIRARIA (Fit-Up, solda etc.),
    // diferenciado do fluxo de Flange — não se aplica a peça de Flange.
    if (parcial.fabrica !== 'caldeiraria')
      return NextResponse.json({ erro: 'Inspeções são exclusivas da Caldeiraria' }, { status: 400 });

    // Já existe inspeção PENDENTE desse mesmo tipo nessa parcial? Não duplica —
    // devolve a existente (idempotente contra duplo-clique).
    const [jaPendente] = await sql`
      SELECT id FROM producao_inspecao
      WHERE parcial_id = ${parcialId} AND tipo = ${tipo} AND status = 'pendente'
      LIMIT 1
    `;
    if (jaPendente)
      return NextResponse.json({ ok: true, inspecao_id: jaPendente.id, ja_existia: true });

    const [insp] = await sql`
      INSERT INTO producao_inspecao
        (item_id, parcial_id, pedido_id, tipo, setor, status, observacao_solicitacao, solicitado_por_id, solicitado_em)
      VALUES
        (${parcial.item_pedido_id}, ${parcialId}, ${parcial.pedido_id}, ${tipo}, ${parcial.setor_atual}, 'pendente', ${observacao || null}, ${user.id}, NOW())
      RETURNING id, solicitado_em
    `;

    await sql`
      INSERT INTO producao_movimentacaoitem
        (item_id, pedido_id, usuario_id, setor_origem, setor_destino, status_anterior, status_novo, observacao, criado_em)
      VALUES
        (${parcial.item_pedido_id}, ${parcial.pedido_id}, ${user.id},
         ${parcial.setor_atual}, ${parcial.setor_atual},
         ${parcial.item_status}, ${parcial.item_status},
         ${`Inspeção solicitada: ${nomeInspecao(tipo)}${observacao ? ` — ${observacao}` : ''}`}, NOW())
    `.catch(() => {});

    return NextResponse.json({ ok: true, inspecao_id: insp.id, solicitado_em: insp.solicitado_em });
  } catch (e) {
    console.error('[parcial/inspecao POST]', e);
    return NextResponse.json({ erro: 'Erro ao solicitar inspeção' }, { status: 500 });
  }
}
