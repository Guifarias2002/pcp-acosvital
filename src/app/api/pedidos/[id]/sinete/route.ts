import { NextResponse } from 'next/server';
import sql from '@/lib/db';
import { autenticar, logAcesso } from '@/lib/middleware';
import { podeAcessarSetor } from '@/lib/auth';
import { nomeSector } from '@/lib/queries';
import { comIdempotencia, chaveIdempotencia } from '@/lib/idempotencia';

export const dynamic = 'force-dynamic';

const DESTINOS_VALIDOS = ['qualidade', 'acabamento'];

// POST /api/pedidos/[id]/sinete
// Registra o sinete em TODOS os itens do pedido que estão no setor Sinete (mesmo
// texto para o lote) e devolve todos de uma vez pra Qualidade (ou Acabamento).
// Antes o sinete era gravado só no item da parcial em que o operador escrevia —
// num pedido com vários itens, aparecia em um só. Agora vale pra todos.
export async function POST(req: Request, ctx: { params: { id: string } }) {
  return comIdempotencia(
    chaveIdempotencia(req),
    { metodo: 'POST', caminho: `pedidos/${ctx.params.id}/sinete` },
    () => handle(req, ctx),
  );
}

async function handle(req: Request, { params }: { params: { id: string } }) {
  try {
    const user = await autenticar(req);
    if (user instanceof NextResponse) return user;
    logAcesso(user, req, 'sinete_pedido');

    if (!user.is_staff && !podeAcessarSetor(user, 'sinete'))
      return NextResponse.json({ erro: 'Acesso negado: sinete não é do seu setor' }, { status: 403 });

    const pedidoId = Number(params.id);
    if (!Number.isInteger(pedidoId) || pedidoId <= 0)
      return NextResponse.json({ erro: 'ID inválido' }, { status: 400 });

    const body = await req.json().catch(() => ({}));
    const semSinete = body.semSinete === true;
    const texto = typeof body.texto === 'string' ? body.texto.trim() : '';
    const destino = DESTINOS_VALIDOS.includes(body.destino) ? body.destino : 'qualidade';
    if (!semSinete && !texto)
      return NextResponse.json({ erro: 'Escreva o sinete (ou marque "sem sinete").' }, { status: 400 });

    const marcado = semSinete ? '🔖 SINETE: sem sinete' : `🔖 SINETE: ${texto}`;

    let itens = 0;
    await sql.begin(async (tx) => {
      // Todas as parciais do pedido que estão FISICAMENTE no Sinete.
      const parciais = await tx`
        SELECT pa.id, pa.item_pedido_id
        FROM producao_itemparcial pa
        JOIN producao_itempedido i ON i.id = pa.item_pedido_id
        WHERE i.pedido_id = ${pedidoId}
          AND pa.setor_atual = 'sinete'
          AND pa.status NOT IN ('cancelada', 'concluida')
      `;
      if (parciais.length === 0) throw new Error('NADA_NO_SINETE: Nenhum item deste pedido está no Sinete.');

      const parcialIds = parciais.map((p: Record<string, unknown>) => p.id) as number[];
      const itemIds = Array.from(new Set(parciais.map((p: Record<string, unknown>) => Number(p.item_pedido_id))));
      itens = itemIds.length;

      // Move todas as parciais do Sinete pro destino (avanço normal: limpa
      // marcadores de devolução, igual ao "mover" usado antes).
      await tx`
        UPDATE producao_itemparcial
        SET setor_atual = ${destino}, status = 'em_aberto', concluido_em = NULL,
            devolvido_de = NULL, motivo_retrabalho = NULL, retrabalho = FALSE,
            atualizado_em = NOW()
        WHERE id = ANY(${parcialIds as unknown as string[]})
      `;

      for (const iid of itemIds) {
        // Sinete como observação do item (aparece na Qualidade e no card).
        await tx`
          INSERT INTO producao_item_observacao (item_id, pedido_id, setor, usuario_id, texto)
          VALUES (${iid}, ${pedidoId}, 'sinete', ${user.id}, ${marcado})
        `;
        await tx`
          INSERT INTO producao_movimentacaoitem
            (item_id, pedido_id, usuario_id, setor_origem, setor_destino,
             status_anterior, status_novo, observacao, criado_em)
          VALUES (${iid}, ${pedidoId}, ${user.id}, 'sinete', ${destino},
                  'aguardando', 'aguardando', ${marcado}, NOW())
        `;
        // Se o item não tem mais parcial no Sinete (movemos todas), avança o item.
        await tx`
          UPDATE producao_itempedido
          SET setor_atual = ${destino}, status = 'aguardando', atualizado_em = NOW()
          WHERE id = ${iid} AND setor_atual = 'sinete'
        `;
      }

      await tx`
        UPDATE producao_pedido SET setor_atual = ${destino}, atualizado_em = NOW()
        WHERE id = ${pedidoId} AND setor_atual = 'sinete'
      `;
    });

    return NextResponse.json({ ok: true, itens, mensagem: `Sinete registrado em ${itens} ${itens === 1 ? 'item' : 'itens'} → ${nomeSector(destino)}` });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Erro interno';
    if (msg.startsWith('NADA_NO_SINETE: '))
      return NextResponse.json({ erro: msg.slice('NADA_NO_SINETE: '.length) }, { status: 400 });
    console.error('[pedidos/sinete]', err);
    return NextResponse.json({ erro: msg }, { status: 500 });
  }
}
