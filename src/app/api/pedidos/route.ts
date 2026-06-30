import { NextResponse } from 'next/server';
import sql from '@/lib/db';
import { autenticar, logAcesso } from '@/lib/middleware';
import { formatPedido } from '@/lib/queries';
import { SETOR_CHOICES } from '@/lib/types';

export async function GET(req: Request) {
  const user = await autenticar(req);
  if (user instanceof NextResponse) return user;

  const { searchParams } = new URL(req.url);
  const cliente = searchParams.get('cliente') || '';
  const status = searchParams.get('status') || '';
  const prioridade = searchParams.get('prioridade') || '';
  const entregue = searchParams.get('entregue') === '1';

  let rows = await sql`
    SELECT p.*, u.nome AS criado_por_nome,
           COALESCE((SELECT SUM(i2.quantidade * COALESCE(i2.valor_unitario,0)) FROM producao_itempedido i2 WHERE i2.pedido_id = p.id), 0)::text AS valor_calculado,
           COALESCE((SELECT json_agg(json_build_object('id', i3.id, 'status', i3.status)) FROM producao_itempedido i3 WHERE i3.pedido_id = p.id), '[]'::json) AS itens,
           COALESCE((
             SELECT json_agg(DISTINCT pa.setor_atual)
             FROM producao_itemparcial pa
             JOIN producao_itempedido ii ON ii.id = pa.item_pedido_id
             WHERE ii.pedido_id = p.id
               AND pa.status NOT IN ('cancelada', 'concluida')
           ), '[]'::json) AS setores_parciais
    FROM producao_pedido p
    LEFT JOIN usuarios_usuario u ON u.id = p.criado_por_id
    WHERE 1=1
      AND (${cliente} = '' OR p.cliente ILIKE ${'%' + cliente + '%'})
      AND (${status} = '' OR p.status = ${status} OR (
        ${status} = 'entregue' AND EXISTS (
          SELECT 1 FROM producao_itempedido ix WHERE ix.pedido_id = p.id AND ix.status = 'entregue'
        )
      ))
      AND (${prioridade} = '' OR p.prioridade = ${prioridade})
      AND (${entregue} = TRUE OR (p.status != 'entregue' AND NOT EXISTS (
        SELECT 1 FROM producao_itempedido ix WHERE ix.pedido_id = p.id AND ix.status = 'entregue'
      )))
    ORDER BY
      CASE p.prioridade WHEN 'urgente' THEN 1 WHEN 'alta' THEN 2 WHEN 'normal' THEN 3 ELSE 4 END,
      p.prazo_entrega ASC
  `;

  const pedidos = rows.map(r => formatPedido(r, r.itens || []));
  return NextResponse.json(pedidos);
}

const SETORES_VALIDOS = SETOR_CHOICES.map(([cod]) => cod);
const PRIORIDADES_VALIDAS = ['baixa','normal','alta','urgente'];

export async function POST(req: Request) {
  const user = await autenticar(req);
  if (user instanceof NextResponse) return user;
  logAcesso(user, req, 'criar_pedido');
  if (!user.is_staff) return NextResponse.json({ erro: 'Sem permissao' }, { status: 403 });

  try {
    const body = await req.json().catch(() => ({}));
    const { numero_pedido_venda, numero_op, cliente, vendedor, prazo_entrega,
            prioridade, roteiro_base, observacoes, itens } = body;

    // Validação de campos obrigatórios
    if (!numero_pedido_venda?.toString().trim())
      return NextResponse.json({ erro: 'Numero do pedido obrigatorio' }, { status: 400 });
    if (!cliente?.toString().trim())
      return NextResponse.json({ erro: 'Cliente obrigatorio' }, { status: 400 });
    if (!prazo_entrega || !/^\d{4}-\d{2}-\d{2}$/.test(prazo_entrega))
      return NextResponse.json({ erro: 'Prazo de entrega invalido (YYYY-MM-DD)' }, { status: 400 });
    if (!PRIORIDADES_VALIDAS.includes(prioridade))
      return NextResponse.json({ erro: 'Prioridade invalida' }, { status: 400 });
    if (!Array.isArray(roteiro_base) || roteiro_base.length === 0)
      return NextResponse.json({ erro: 'Roteiro base obrigatorio' }, { status: 400 });
    if (roteiro_base.some((s: unknown) => typeof s !== 'string' || !SETORES_VALIDOS.includes(s)))
      return NextResponse.json({ erro: 'Setor invalido no roteiro' }, { status: 400 });
    if (!Array.isArray(itens) || itens.length === 0)
      return NextResponse.json({ erro: 'Pelo menos um item obrigatorio' }, { status: 400 });

    const [pedido] = await sql`
      INSERT INTO producao_pedido
        (numero_pedido_venda, numero_op, cliente, vendedor, prazo_entrega,
         prioridade, roteiro_base, observacoes, status, setor_atual,
         data_emissao, criado_por_id, criado_em, atualizado_em)
      VALUES (
        ${numero_pedido_venda}, ${numero_op || ''}, ${cliente}, ${vendedor || ''},
        ${prazo_entrega}, ${prioridade}, ${roteiro_base},
        ${observacoes || ''}, 'emitido', ${roteiro_base[0] || ''},
        NOW()::date, ${user.id}, NOW(), NOW()
      )
      RETURNING *
    `;

    if (itens && itens.length > 0) {
      for (const item of itens) {
        const rotProprio = item.roteiro_proprio && item.roteiro_proprio.length > 0
          ? item.roteiro_proprio
          : [];
        const primeiroSetor = (item.roteiro_proprio && item.roteiro_proprio.length > 0)
          ? item.roteiro_proprio[0]
          : roteiro_base[0];
        await sql`
          INSERT INTO producao_itempedido
            (pedido_id, codigo, descricao, quantidade, unidade, valor_unitario,
             roteiro_proprio, setor_atual, status, quantidade_pendente, criado_em)
          VALUES (
            ${pedido.id}, ${item.codigo}, ${item.descricao || ''},
            ${item.quantidade}, ${item.unidade || 'un'},
            ${item.valor_unitario || null},
            ${rotProprio as string[]},
            ${primeiroSetor}, 'emitido',
            ${item.quantidade}, NOW()
          )
        `;
      }
    }

    // Recalcula valor_total do pedido com base nos itens
    await sql`
      UPDATE producao_pedido
      SET valor_total = (
        SELECT COALESCE(SUM(quantidade * COALESCE(valor_unitario, 0)), 0)
        FROM producao_itempedido WHERE pedido_id = ${pedido.id}
      )
      WHERE id = ${pedido.id}
    `;

    return NextResponse.json({ id: pedido.id }, { status: 201 });
  } catch (e: unknown) {
    console.error('[POST /api/pedidos]', e);
    return NextResponse.json({ erro: 'Erro ao criar pedido' }, { status: 500 });
  }
}
