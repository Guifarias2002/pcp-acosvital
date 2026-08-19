/**
 * POST /api/pedidos/[id]/voltar-logistica
 *
 * Desfaz a entrega de um pedido e o devolve pra Logística — inverso do
 * "entregar pedido completo" (../entregar). Usado quando o pedido foi
 * marcado como entregue por engano ou precisa ser reprocessado na Logística.
 *
 * O que faz (numa transação):
 *  - itens `entregue` do pedido → voltam pra status 'recebido' na Logística
 *    (setor_atual='logistica'), zera quantidade_entregue;
 *  - reabre as parciais que estavam na Logística e foram concluídas pela
 *    entrega ('concluida' → 'recebido', concluido_em=NULL) — voltam pra fila;
 *  - registra a movimentação (quem/quando devolveu);
 *  - reabre o pedido (status 'entregue' → 'em_producao').
 *
 * Permissão: staff (admin/PCP) ou quem acessa a Logística — mesmo critério do
 * "entregar".
 */
import { NextResponse } from 'next/server';
import sql from '@/lib/db';
import { autenticar, logAcesso } from '@/lib/middleware';
import { podeAcessarSetor } from '@/lib/auth';
import { checkMutationRateLimit, getClientIp } from '@/lib/rateLimit';

export const dynamic = 'force-dynamic';

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const user = await autenticar(req);
  if (user instanceof NextResponse) return user;

  if (!user.is_staff && !podeAcessarSetor(user, 'logistica'))
    return NextResponse.json({ erro: 'Sem permissão para devolver à Logística' }, { status: 403 });

  if (!checkMutationRateLimit(getClientIp(req)))
    return NextResponse.json({ erro: 'Muitas requisicoes' }, { status: 429 });

  const pedidoId = Number(params.id);
  if (!Number.isInteger(pedidoId) || pedidoId <= 0)
    return NextResponse.json({ erro: 'ID inválido' }, { status: 400 });

  logAcesso(user, req, 'voltar_logistica');

  const observacao = await req.json().then((b) => (b?.observacao || '').toString().trim()).catch(() => '');

  const itens = await sql`
    SELECT id, status, setor_atual
    FROM producao_itempedido
    WHERE pedido_id = ${pedidoId} AND status = 'entregue' AND inativo = false
    ORDER BY id
  `;
  if (itens.length === 0)
    return NextResponse.json({ erro: 'Nenhum item entregue neste pedido para devolver.' }, { status: 400 });

  const idsVoltaram: number[] = [];

  await sql.begin(async (tx) => {
    for (const item of itens) {
      await (tx as unknown as typeof sql)`SELECT pg_advisory_xact_lock(778899, ${item.id})`;

      const [locked] = await tx`SELECT status FROM producao_itempedido WHERE id = ${item.id} FOR UPDATE`;
      if (!locked || locked.status !== 'entregue') continue; // já mexido por outra via

      await tx`
        UPDATE producao_itempedido
        SET status = 'recebido', setor_atual = 'logistica',
            quantidade_entregue = 0, atualizado_em = NOW()
        WHERE id = ${item.id}
      `;

      // Reabre as parciais da Logística que a entrega concluiu (voltam pra fila).
      await tx`
        UPDATE producao_itemparcial
        SET status = 'recebido', concluido_em = NULL, atualizado_em = NOW()
        WHERE item_pedido_id = ${item.id}
          AND setor_atual = 'logistica'
          AND status = 'concluida'
      `;

      await tx`
        INSERT INTO producao_movimentacaoitem
          (item_id, pedido_id, usuario_id, setor_origem, setor_destino,
           status_anterior, status_novo, observacao, criado_em)
        VALUES
          (${item.id}, ${pedidoId}, ${user.id}, '', 'logistica',
           'entregue', 'recebido',
           ${`Devolvido pra Logística${observacao ? ' | ' + observacao : ''}`},
           NOW())
      `;

      idsVoltaram.push(Number(item.id));
    }

    // Reabre o pedido.
    await tx`UPDATE producao_pedido SET status = 'em_producao', atualizado_em = NOW() WHERE id = ${pedidoId}`;
  });

  return NextResponse.json({
    ok: true,
    itens_devolvidos: idsVoltaram.length,
    mensagem: `${idsVoltaram.length} ${idsVoltaram.length === 1 ? 'item devolvido' : 'itens devolvidos'} para a Logística.`,
  });
}
