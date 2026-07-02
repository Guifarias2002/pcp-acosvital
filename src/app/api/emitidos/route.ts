import { NextResponse } from 'next/server';
import sql from '@/lib/db';
import { autenticar } from '@/lib/middleware';
import { formatPedido, formatItem } from '@/lib/queries';

export const dynamic = 'force-dynamic';
export async function GET(req: Request) {
  try {
    const user = await autenticar(req);
    if (user instanceof NextResponse) return user;
    if (!user.is_staff) return NextResponse.json({ erro: 'Sem permissao' }, { status: 403 });
    const { searchParams } = new URL(req.url);
    const cliente = searchParams.get('cliente') || '';
    const prioridade = searchParams.get('prioridade') || '';
    const setor = searchParams.get('setor') || '';

    const rows = await sql`
      SELECT p.*, u.nome AS criado_por_nome,
             COALESCE((SELECT SUM(i2.quantidade * COALESCE(i2.valor_unitario,0)) FROM producao_itempedido i2 WHERE i2.pedido_id = p.id), 0)::text AS valor_calculado
      FROM producao_pedido p
      LEFT JOIN usuarios_usuario u ON u.id = p.criado_por_id
      WHERE p.status != 'entregue'
        AND (${cliente} = '' OR p.cliente ILIKE ${'%' + cliente + '%'})
        AND (${prioridade} = '' OR p.prioridade = ${prioridade})
      ORDER BY p.criado_em DESC
    `;

    const ids = rows.map(r => r.id as number);
    let itensPorPedido: Record<number, ReturnType<typeof formatItem>[]> = {};

    if (ids.length > 0) {
      const itenRows = await sql`
        SELECT
          i.id, i.pedido_id, i.codigo, i.descricao,
          i.quantidade::text, i.unidade,
          i.roteiro_proprio, i.setor_atual, i.status,
          i.quantidade_pendente::text,
          i.quantidade_entregue::text,
          i.valor_unitario::text,
          p.numero_pedido_venda AS pedido_numero,
          p.cliente AS pedido_cliente,
          p.prazo_entrega::text AS pedido_prazo,
          p.prioridade AS pedido_prioridade,
          p.roteiro_base
        FROM producao_itempedido i
        JOIN producao_pedido p ON p.id = i.pedido_id
        WHERE i.pedido_id = ANY(${ids})
        ORDER BY p.numero_pedido_venda, i.codigo
      `;
      for (const row of itenRows) {
        const pid = Number(row.pedido_id);
        if (!itensPorPedido[pid]) itensPorPedido[pid] = [];
        itensPorPedido[pid].push(formatItem(row));
      }
    }

    const pedidos = rows.map(r => {
      const itens = itensPorPedido[Number(r.id)] || [];
      if (setor && !itens.some(i => i.setor_atual === setor)) return null;
      return formatPedido(r, itens);
    });

    const result = pedidos.filter(Boolean);
    const total_valor = result.reduce((s, p) => s + Number(p!.valor_calculado || 0), 0);

    return NextResponse.json({
      pedidos: result,
      total_pedidos: result.length,
      total_itens: result.reduce((s, p) => s + p!.itens.length, 0),
      total_valor: total_valor.toFixed(2),
    });
  } catch (e) {
    console.error('[emitidos]', e);
    return NextResponse.json({ erro: 'Erro interno' }, { status: 500 });
  }
}