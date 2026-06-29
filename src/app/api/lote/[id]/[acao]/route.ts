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

  const [lote] = await sql`
    SELECT l.*, i.pedido_id, i.status AS item_status, i.setor_atual AS item_setor_atual
    FROM producao_loteitem l
    JOIN producao_itempedido i ON i.id = l.item_pedido_id
    WHERE l.id = ${loteId}
  `;
  if (!lote) return NextResponse.json({ erro: 'Lote nao encontrado' }, { status: 404 });

  if (!user.is_staff && lote.setor_destino !== user.setor)
    return NextResponse.json({ erro: 'Acesso negado' }, { status: 403 });

  try {
    if (params.acao === 'receber') {
      await sql.begin(async (tx) => {
        await tx`
          UPDATE producao_loteitem
          SET status = 'em_trabalho', recebido_por_id = ${user.id}, recebido_em = NOW(), atualizado_em = NOW()
          WHERE id = ${loteId}
        `;

        // Ativa a parcial correspondente (em_aberto → em_andamento) no setor de destino.
        // UPDATE...LIMIT não existe no PostgreSQL — usa subquery para garantir apenas 1 linha.
        await tx`
          UPDATE producao_itemparcial
          SET status = 'em_andamento', atualizado_em = NOW()
          WHERE id = (
            SELECT id FROM producao_itemparcial
            WHERE item_pedido_id = ${lote.item_pedido_id}
              AND setor_atual    = ${lote.setor_destino}
              AND status         = 'em_aberto'
              AND parcial_origem_id IS NOT NULL
            ORDER BY criado_em ASC
            LIMIT 1
          )
        `;

        await tx`
          INSERT INTO producao_movimentacaoitem
            (item_id, pedido_id, setor_origem, setor_destino, status_anterior, status_novo,
             usuario_id, observacao, criado_em)
          VALUES
            (${lote.item_pedido_id}, ${lote.pedido_id}, ${lote.setor_origem}, ${lote.setor_destino},
             ${lote.item_status}, 'em_andamento', ${user.id},
             ${`Lote recebido: ${lote.quantidade} un chegaram em ${lote.setor_destino}`}, NOW())
        `;
      });

    } else {
      // finalizar: conclui o lote de trânsito
      await sql`UPDATE producao_loteitem SET status = 'concluido', atualizado_em = NOW() WHERE id = ${loteId}`;
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Erro interno';
    console.error('[lote/acao]', params.acao, err);
    return NextResponse.json({ erro: msg }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
