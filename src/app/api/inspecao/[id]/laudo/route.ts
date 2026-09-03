import { NextResponse } from 'next/server';
import sql from '@/lib/db';
import { autenticar } from '@/lib/middleware';
import { checkMutationRateLimit, getClientIp } from '@/lib/rateLimit';
import { RESULTADOS_INSPECAO, nomeInspecao, ResultadoInspecao } from '@/lib/types';

export const dynamic = 'force-dynamic';

// POST /api/inspecao/[id]/laudo — o INSPETOR (Qualidade) lança o laudo de uma
// inspeção pendente. resultado: 'aprovado' | 'reprovado' | 'retrabalho'.
//   • aprovado  → inspeção resolvida; a peça fica liberada pra seguir (o
//                 apontador a move normalmente, ex.: pra Solda).
//   • reprovado / retrabalho → inspeção resolvida E a parcial volta pra
//                 retrabalho no mesmo setor (status em_aberto, retrabalho=TRUE,
//                 motivo = laudo) — o "volta pra Caldeiraria" do e-mail do PCP.
// Sempre grava no Histórico do Pedido. Ver [[project_datas_op_cliente]].
export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const user = await autenticar(req);
    if (user instanceof NextResponse) return user;
    if (!checkMutationRateLimit(getClientIp(req)))
      return NextResponse.json({ erro: 'Muitas requisicoes' }, { status: 429 });

    const inspId = Number(params.id);
    if (!Number.isInteger(inspId) || inspId <= 0)
      return NextResponse.json({ erro: 'ID inválido' }, { status: 400 });

    const body = await req.json().catch(() => ({}));
    const resultado = body.resultado as ResultadoInspecao;
    if (!RESULTADOS_INSPECAO.includes(resultado))
      return NextResponse.json({ erro: 'Resultado inválido (use aprovado, reprovado ou retrabalho)' }, { status: 400 });
    const laudo = typeof body.laudo === 'string' ? body.laudo.trim().slice(0, 1000) : '';

    const [insp] = await sql`
      SELECT insp.id, insp.status, insp.tipo, insp.item_id, insp.parcial_id, insp.pedido_id, insp.setor,
             i.status AS item_status
      FROM producao_inspecao insp
      JOIN producao_itempedido i ON i.id = insp.item_id
      WHERE insp.id = ${inspId}
    `;
    if (!insp) return NextResponse.json({ erro: 'Inspeção não encontrada' }, { status: 404 });
    if (insp.status !== 'pendente')
      return NextResponse.json({ erro: 'Esta inspeção já foi laudada', status: insp.status }, { status: 409 });

    const reprova = resultado === 'reprovado' || resultado === 'retrabalho';

    await sql.begin(async (tx) => {
      await tx`
        UPDATE producao_inspecao
        SET status = ${resultado}, laudo = ${laudo || null}, inspetor_id = ${user.id}, resolvido_em = NOW()
        WHERE id = ${inspId}
      `;
      // Reprovado/retrabalho: manda a parcial pra retrabalho (volta pra
      // Caldeiraria). Fica no próprio setor (onde o caldeireiro refaz), com os
      // marcadores de retrabalho — mesmo padrão do 'devolver'.
      if (reprova && insp.parcial_id) {
        await tx`
          UPDATE producao_itemparcial
          SET status = 'em_aberto', concluido_em = NULL, retrabalho = TRUE,
              motivo_retrabalho = ${laudo || `Inspeção ${nomeInspecao(insp.tipo)} reprovada`},
              atualizado_em = NOW()
          WHERE id = ${insp.parcial_id}
        `;
      }
      const rotulo = resultado === 'aprovado' ? 'APROVADA' : resultado === 'reprovado' ? 'REPROVADA' : 'RETRABALHO';
      await tx`
        INSERT INTO producao_movimentacaoitem
          (item_id, pedido_id, usuario_id, setor_origem, setor_destino, status_anterior, status_novo, observacao, criado_em)
        VALUES
          (${insp.item_id}, ${insp.pedido_id}, ${user.id},
           ${insp.setor}, ${insp.setor},
           ${insp.item_status}, ${insp.item_status},
           ${`Inspeção ${nomeInspecao(insp.tipo)}: ${rotulo}${laudo ? ` — ${laudo}` : ''}`}, NOW())
      `.catch(() => {});
    });

    return NextResponse.json({ ok: true, resultado, retrabalho: reprova });
  } catch (e) {
    console.error('[inspecao/laudo POST]', e);
    return NextResponse.json({ erro: 'Erro ao registrar o laudo' }, { status: 500 });
  }
}
