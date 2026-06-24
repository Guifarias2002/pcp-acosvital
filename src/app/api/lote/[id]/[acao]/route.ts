import { NextResponse } from 'next/server';
import sql from '@/lib/db';
import { autenticar } from '@/lib/middleware';
import { checkMutationRateLimit, getClientIp } from '@/lib/rateLimit';

const ACOES_VALIDAS = ['receber', 'finalizar'];

export async function POST(req: Request, { params }: { params: { id: string; acao: string } }) {
  const user = await autenticar(req);
  if (user instanceof NextResponse) return user;

  const loteId = Number(params.id);
  if (!Number.isInteger(loteId) || loteId <= 0)
    return NextResponse.json({ erro: 'ID invalido' }, { status: 400 });

  if (!ACOES_VALIDAS.includes(params.acao))
    return NextResponse.json({ erro: 'Acao invalida' }, { status: 400 });

  if (!checkMutationRateLimit(getClientIp(req)))
    return NextResponse.json({ erro: 'Muitas requisicoes' }, { status: 429 });

  const [lote] = await sql`SELECT * FROM producao_loteitem WHERE id = ${loteId}`;
  if (!lote) return NextResponse.json({ erro: 'Lote nao encontrado' }, { status: 404 });

  // Operadores só podem receber lotes do próprio setor (sem setor = sem acesso)
  if (!user.is_staff && lote.setor_destino !== user.setor) {
    return NextResponse.json({ erro: 'Acesso negado' }, { status: 403 });
  }

  if (params.acao === 'receber') {
    await sql.begin(async (tx) => {
      await tx`
        UPDATE producao_loteitem
        SET status = 'em_trabalho', recebido_por_id = ${user.id}, recebido_em = NOW(), atualizado_em = NOW()
        WHERE id = ${loteId}
      `;
      // Atualiza o item para aparecer no setor destino e poder continuar o fluxo
      await tx`
        UPDATE producao_itempedido
        SET setor_atual = ${lote.setor_destino}, status = 'recebido', atualizado_em = NOW()
        WHERE id = ${lote.item_pedido_id}
      `;
      // Registra movimentação
      await tx`
        INSERT INTO producao_movimentacaoitem
          (item_id, setor_origem, setor_destino, status_anterior, status_novo, usuario_id, observacao, criado_em)
        VALUES
          (${lote.item_pedido_id}, ${lote.setor_origem}, ${lote.setor_destino},
           'em_transito', 'recebido', ${user.id}, 'Recebido via lote', NOW())
      `;
    });
  } else {
    await sql.begin(async (tx) => {
      // Lock para evitar race condition se dois lotes finalizam simultaneamente
      await tx`SELECT id FROM producao_loteitem WHERE item_pedido_id = ${lote.item_pedido_id} FOR UPDATE`;
      await tx`UPDATE producao_loteitem SET status = 'concluido', atualizado_em = NOW() WHERE id = ${loteId}`;
      const [{ pendentes }] = await tx`
        SELECT COUNT(*) AS pendentes FROM producao_loteitem
        WHERE item_pedido_id = ${lote.item_pedido_id} AND status != 'concluido'
      `;
      if (Number(pendentes) === 0) {
        await tx`UPDATE producao_itempedido SET status='aguardando', setor_atual=${lote.setor_destino}, atualizado_em=NOW() WHERE id=${lote.item_pedido_id}`;
        await tx`
          INSERT INTO producao_movimentacaoitem
            (item_id, setor_origem, setor_destino, status_anterior, status_novo, usuario_id, observacao, criado_em)
          VALUES (${lote.item_pedido_id}, ${lote.setor_origem}, ${lote.setor_destino},
                  'finalizado_setor', 'aguardando', ${user.id}, 'Lote concluído — encaminhado ao próximo setor', NOW())
        `;
      }
    });
  }

  return NextResponse.json({ ok: true });
}
