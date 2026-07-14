import { NextResponse } from 'next/server';
import sql from '@/lib/db';
import { autenticar, logAcesso } from '@/lib/middleware';
import { formatPedido } from '@/lib/queries';
import { SETOR_CHOICES } from '@/lib/types';
import { checkMutationRateLimit, getClientIp } from '@/lib/rateLimit';

export const dynamic = 'force-dynamic';

const PER_PAGE = 50;

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return Promise.race([p, new Promise<T>((_, rej) => setTimeout(() => rej(new Error('timeout')), ms))]);
}

export async function GET(req: Request) {
  const user = await autenticar(req);
  if (user instanceof NextResponse) return user;

  const { searchParams } = new URL(req.url);
  const cliente    = searchParams.get('cliente') || '';
  const vendedor   = searchParams.get('vendedor') || '';
  const status     = searchParams.get('status') || '';
  const prioridade = searchParams.get('prioridade') || '';
  const setor      = searchParams.get('setor') || '';
  const entregue   = searchParams.get('entregue') === '1';
  const prazoDe    = searchParams.get('prazo_de') || null;
  const prazoAte   = searchParams.get('prazo_ate') || null;
  const page       = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
  const offset     = (page - 1) * PER_PAGE;

  try {
  // 1. Busca apenas os IDs da página corrente — query leve, usa índices
  const baseRows = await sql`
    SELECT p.id, p.criado_por_id, p.numero_pedido_venda, p.numero_op, p.cliente,
           p.vendedor, p.prazo_entrega::text, p.prioridade, p.status, p.setor_atual,
           p.roteiro_base, p.observacoes, p.data_emissao::text, p.criado_em, p.atualizado_em,
           p.valor_total::text,
           p.pedido_venda_url IS NOT NULL AS tem_pedido_venda,
           p.ordem_producao_url IS NOT NULL AS tem_ordem_producao,
           u.nome AS criado_por_nome
    FROM producao_pedido p
    LEFT JOIN usuarios_usuario u ON u.id = p.criado_por_id
    WHERE 1=1
      AND (${cliente} = '' OR p.cliente ILIKE ${'%' + cliente + '%'})
      AND (${vendedor} = '' OR p.vendedor ILIKE ${'%' + vendedor + '%'})
      AND (${status}  = '' OR p.status = ${status})
      AND (${prioridade} = '' OR p.prioridade = ${prioridade})
      AND (${setor} = '' OR p.setor_atual = ${setor})
      AND (${entregue} = TRUE OR p.status != 'entregue')
      AND (${prazoDe}::date IS NULL OR p.prazo_entrega >= ${prazoDe}::date)
      AND (${prazoAte}::date IS NULL OR p.prazo_entrega <= ${prazoAte}::date)
    ORDER BY
      CASE p.prioridade WHEN 'urgente' THEN 1 WHEN 'alta' THEN 2 WHEN 'normal' THEN 3 ELSE 4 END,
      p.prazo_entrega ASC NULLS LAST,
      p.id DESC
    LIMIT ${PER_PAGE} OFFSET ${offset}
  `;

  if (baseRows.length === 0) {
    return NextResponse.json({ pedidos: [], page, per_page: PER_PAGE, total: 0, pages: 0 });
  }

  const ids = baseRows.map(r => r.id as number);

  // 2. Agrega itens e parciais apenas para os pedidos da página — 2 queries flat
  const [itemRows, parcialRows, [{ total }]] = await withTimeout(Promise.all([
    sql`
      SELECT pedido_id,
             SUM(quantidade * COALESCE(valor_unitario, 0))::text AS valor_calculado,
             json_agg(json_build_object('id', id, 'status', status)) AS itens
      FROM producao_itempedido
      WHERE pedido_id = ANY(${ids})
      GROUP BY pedido_id
    `,
    sql`
      SELECT ii.pedido_id, json_agg(DISTINCT pa.setor_atual) AS setores_parciais
      FROM producao_itemparcial pa
      JOIN producao_itempedido ii ON ii.id = pa.item_pedido_id
      WHERE ii.pedido_id = ANY(${ids})
        AND pa.status NOT IN ('cancelada', 'concluida')
      GROUP BY ii.pedido_id
    `,
    sql`
      SELECT COUNT(*)::int AS total
      FROM producao_pedido p
      WHERE 1=1
        AND (${cliente} = '' OR p.cliente ILIKE ${'%' + cliente + '%'})
        AND (${vendedor} = '' OR p.vendedor ILIKE ${'%' + vendedor + '%'})
        AND (${status}  = '' OR p.status = ${status})
        AND (${prioridade} = '' OR p.prioridade = ${prioridade})
        AND (${setor} = '' OR p.setor_atual = ${setor})
        AND (${entregue} = TRUE OR p.status != 'entregue')
        AND (${prazoDe}::date IS NULL OR p.prazo_entrega >= ${prazoDe}::date)
        AND (${prazoAte}::date IS NULL OR p.prazo_entrega <= ${prazoAte}::date)
    `,
  ]), 27000); // 27s — Vercel mata em 30s (temporario, ver vercel.json)

  // 3. Monta lookup por pedido_id e formata
  const itemMap    = new Map(itemRows.map(r => [r.pedido_id as number, r]));
  const parcialMap = new Map(parcialRows.map(r => [r.pedido_id as number, r]));

  const pedidos = baseRows.map(r => {
    const im = itemMap.get(r.id as number);
    const pm = parcialMap.get(r.id as number);
    return formatPedido(
      { ...r, valor_calculado: im?.valor_calculado ?? '0', setores_parciais: pm?.setores_parciais ?? [] },
      im?.itens ?? [],
    );
  });

  const pages = Math.ceil((total as number) / PER_PAGE);
  return NextResponse.json({ pedidos, page, per_page: PER_PAGE, total, pages });
  } catch (e) {
    console.error('[pedidos GET]', e);
    return NextResponse.json({ erro: 'Erro ao listar pedidos' }, { status: 500 });
  }
}

const SETORES_VALIDOS = SETOR_CHOICES.map(([cod]) => cod);
const PRIORIDADES_VALIDAS = ['baixa','normal','alta','urgente'];

export async function POST(req: Request) {
  const user = await autenticar(req);
  if (user instanceof NextResponse) return user;
  logAcesso(user, req, 'criar_pedido');
  if (!user.is_staff) return NextResponse.json({ erro: 'Sem permissao' }, { status: 403 });

  if (!checkMutationRateLimit(getClientIp(req)))
    return NextResponse.json({ erro: 'Muitas requisições. Aguarde um momento.' }, { status: 429 });

  try {
    const body = await req.json().catch(() => ({}));
    const { numero_pedido_venda, numero_op, cliente, vendedor, prazo_entrega,
            prioridade, roteiro_base, observacoes, itens } = body;

    if (!numero_pedido_venda?.toString().trim())
      return NextResponse.json({ erro: 'Numero do pedido obrigatorio' }, { status: 400 });
    if (!numero_op?.toString().trim())
      return NextResponse.json({ erro: 'Numero da Ordem de Producao (OP) obrigatorio' }, { status: 400 });
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
    for (const item of itens) {
      if (!item?.codigo?.toString().trim())
        return NextResponse.json({ erro: 'Codigo do item obrigatorio' }, { status: 400 });
      const qtd = Number(item.quantidade);
      if (!Number.isFinite(qtd) || qtd <= 0)
        return NextResponse.json({ erro: `Quantidade invalida para o item "${item.codigo}"` }, { status: 400 });
    }

    const pedidoId = await sql.begin(async (tx) => {
      const [pedido] = await tx`
        INSERT INTO producao_pedido
          (numero_pedido_venda, numero_op, cliente, vendedor, prazo_entrega,
           prioridade, roteiro_base, observacoes, status, setor_atual,
           data_emissao, criado_por_id, criado_em, atualizado_em)
        VALUES (
          ${numero_pedido_venda}, ${numero_op.toString().trim()}, ${cliente}, ${vendedor || ''},
          ${prazo_entrega}, ${prioridade}, ${roteiro_base},
          ${observacoes || ''}, 'emitido', ${roteiro_base[0] || ''},
          (NOW() AT TIME ZONE 'America/Sao_Paulo')::date, ${user.id}, NOW(), NOW()
        )
        RETURNING id
      `;

      let primeiroItemId: number | null = null;
      for (const item of itens) {
        const rotProprio = item.roteiro_proprio?.length > 0 ? item.roteiro_proprio : [];
        const primeiroSetor = rotProprio.length > 0 ? rotProprio[0] : roteiro_base[0];
        const [itemInserido] = await tx`
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
          RETURNING id
        `;
        if (primeiroItemId === null) primeiroItemId = itemInserido.id;
      }

      // Evento pra alerta de tela cheia (ADM/PCP) — um único aviso por pedido criado.
      await tx`
        INSERT INTO producao_movimentacaoitem
          (item_id, pedido_id, usuario_id, setor_destino, status_novo, observacao, criado_em)
        VALUES (${primeiroItemId}, ${pedido.id}, ${user.id}, ${roteiro_base[0]}, 'criado', 'Pedido criado', NOW())
      `;

      await tx`
        UPDATE producao_pedido
        SET valor_total = (
          SELECT COALESCE(SUM(quantidade * COALESCE(valor_unitario, 0)), 0)
          FROM producao_itempedido WHERE pedido_id = ${pedido.id}
        )
        WHERE id = ${pedido.id}
      `;

      return pedido.id;
    });

    return NextResponse.json({ id: pedidoId }, { status: 201 });
  } catch (e: unknown) {
    // 23505 = unique_violation no Postgres — nº do pedido de venda já existe
    const pgErr = e as { code?: string; constraint_name?: string };
    if (pgErr?.code === '23505' && pgErr?.constraint_name === 'uq_pedido_numero_venda')
      return NextResponse.json({ erro: 'Já existe um pedido com esse número de pedido de venda.' }, { status: 409 });
    console.error('[POST /api/pedidos]', e);
    return NextResponse.json({ erro: 'Erro ao criar pedido' }, { status: 500 });
  }
}
