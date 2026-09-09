/**
 * GET /api/nao-localizados
 *
 * Lista (só ADMIN) os pedidos marcados como "não localizados" fisicamente —
 * setor virtual `nao_localizado`. Para cada pedido traz: os materiais parados
 * ali, DE ONDE veio (o setor de onde foi enviado, tirado do log de
 * movimentação), quando/quem marcou, e o roteiro (pra sugerir o reencaminho).
 *
 * O reencaminhamento em si reusa o "mover" normal (POST /api/parcial/lote/mover
 * com setor_destino = setor real escolhido).
 */
import { NextResponse } from 'next/server';
import sql from '@/lib/db';
import { autenticar } from '@/lib/middleware';
import { podeVerNaoLocalizados } from '@/lib/auth';
import { nomeSector } from '@/lib/queries';
import { injetarQuarentena, SETOR_NAO_LOCALIZADO } from '@/lib/types';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  try {
    const user = await autenticar(req);
    if (user instanceof NextResponse) return user;
    if (!podeVerNaoLocalizados(user))
      return NextResponse.json({ erro: 'Sem permissão para ver os pedidos não localizados' }, { status: 403 });

    // Parciais atualmente no setor virtual, com item + pedido.
    const parciais = await sql`
      SELECT
        pa.id, pa.quantidade::text AS quantidade, pa.status, pa.observacao,
        pa.atualizado_em,
        i.id AS item_pedido_id, i.codigo AS item_codigo, i.descricao AS item_descricao,
        i.unidade, i.quantidade::text AS quantidade_total_item,
        i.roteiro_proprio,
        p.id AS pedido_id, p.numero_pedido_venda, p.numero_op, p.cliente, p.prioridade,
        p.roteiro_base, p.prazo_entrega::text AS pedido_prazo,
        (p.ordem_producao_url IS NOT NULL) AS tem_op,
        (p.pedido_venda_url IS NOT NULL) AS tem_pv,
        (p.desenho_url IS NOT NULL OR COALESCE(array_length(p.desenhos,1),0) > 0) AS tem_desenho
      FROM producao_itemparcial pa
      JOIN producao_itempedido i ON i.id = pa.item_pedido_id
      JOIN producao_pedido p ON p.id = pa.pedido_id
      WHERE pa.setor_atual = ${SETOR_NAO_LOCALIZADO}
        AND pa.status NOT IN ('cancelada', 'concluida')
        AND i.inativo = false
      ORDER BY p.numero_pedido_venda, i.codigo, pa.id
    `.catch(() => [] as Record<string, unknown>[]);

    // "De onde veio" e quando/quem: a última movimentação que jogou CADA item pro
    // setor virtual (setor_destino = nao_localizado). Um lookup por item.
    const itemIds = Array.from(new Set((parciais as Record<string, unknown>[]).map(p => Number(p.item_pedido_id))));
    const origemPorItem = new Map<number, { veio_de: string; criado_em: string; usuario: string }>();
    if (itemIds.length > 0) {
      const movs = await sql`
        SELECT DISTINCT ON (m.item_id)
          m.item_id, m.setor_origem, m.criado_em, u.nome AS usuario_nome
        FROM producao_movimentacaoitem m
        LEFT JOIN usuarios_usuario u ON u.id = m.usuario_id
        WHERE m.item_id = ANY(${itemIds})
          AND m.setor_destino = ${SETOR_NAO_LOCALIZADO}
        ORDER BY m.item_id, m.criado_em DESC
      `.catch(() => [] as Record<string, unknown>[]);
      for (const m of movs as Record<string, unknown>[]) {
        origemPorItem.set(Number(m.item_id), {
          veio_de: (m.setor_origem as string) || '',
          criado_em: m.criado_em as string,
          usuario: (m.usuario_nome as string) || 'Sistema',
        });
      }
    }

    // Agrupa por pedido.
    type Material = {
      parcial_id: number; item_pedido_id: number; codigo: string; descricao: string;
      quantidade: string; unidade: string; veio_de: string; veio_de_nome: string;
    };
    const pedidos = new Map<number, {
      pedido_id: number; numero_pedido_venda: string; numero_op: string | null;
      cliente: string; prioridade: string; pedido_prazo: string | null;
      veio_de: string; veio_de_nome: string; marcado_em: string | null; marcado_por: string | null;
      tem_op: boolean; tem_pv: boolean; tem_desenho: boolean;
      roteiro: string[]; parcial_ids: number[]; materiais: Material[];
    }>();

    for (const p of parciais as Record<string, unknown>[]) {
      const pedidoId = Number(p.pedido_id);
      const itemId = Number(p.item_pedido_id);
      const origem = origemPorItem.get(itemId);
      const veioDe = origem?.veio_de || '';

      if (!pedidos.has(pedidoId)) {
        // Roteiro do pedido (com quarentena) pra alimentar o seletor de destino.
        const roteiroBase: string[] = (p.roteiro_proprio as string[] | null)?.length
          ? (p.roteiro_proprio as string[])
          : ((p.roteiro_base as string[]) || []);
        pedidos.set(pedidoId, {
          pedido_id: pedidoId,
          numero_pedido_venda: (p.numero_pedido_venda as string) || String(pedidoId),
          numero_op: (p.numero_op as string) ?? null,
          cliente: (p.cliente as string) || '',
          prioridade: (p.prioridade as string) || 'normal',
          pedido_prazo: (p.pedido_prazo as string) ?? null,
          veio_de: veioDe,
          veio_de_nome: veioDe ? nomeSector(veioDe) : '—',
          marcado_em: origem?.criado_em ?? null,
          marcado_por: origem?.usuario ?? null,
          tem_op: Boolean(p.tem_op),
          tem_pv: Boolean(p.tem_pv),
          tem_desenho: Boolean(p.tem_desenho),
          roteiro: injetarQuarentena(roteiroBase),
          parcial_ids: [],
          materiais: [],
        });
      }
      const grupo = pedidos.get(pedidoId)!;
      grupo.parcial_ids.push(Number(p.id));
      grupo.materiais.push({
        parcial_id: Number(p.id),
        item_pedido_id: itemId,
        codigo: (p.item_codigo as string) || '',
        descricao: (p.item_descricao as string) || '',
        quantidade: (p.quantidade as string) || '0',
        unidade: (p.unidade as string) || '',
        veio_de: veioDe,
        veio_de_nome: veioDe ? nomeSector(veioDe) : '—',
      });
    }

    return NextResponse.json({ pedidos: Array.from(pedidos.values()) });
  } catch (e) {
    console.error('[nao-localizados]', e);
    return NextResponse.json({ erro: 'Erro interno' }, { status: 500 });
  }
}
