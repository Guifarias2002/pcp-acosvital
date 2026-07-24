import { NextResponse } from 'next/server';
import sql from '@/lib/db';
import { autenticar } from '@/lib/middleware';
import { formatItem, nomeSector } from '@/lib/queries';
import { SETOR_CHOICES, injetarQuarentena } from '@/lib/types';

export const dynamic = 'force-dynamic';
// Timeout estendido (várias consultas em paralelo). Migrado do vercel.json
// (glob "functions" quebrava o build) para a config nativa de rota do Next.
export const maxDuration = 30;

const SETORES_VALIDOS = SETOR_CHOICES.map(([cod]) => cod);

export async function GET(req: Request, { params }: { params: { setor: string } }) {
  try {
  const user = await autenticar(req);
  if (user instanceof NextResponse) return user;

  let setor = params.setor;
  try { setor = decodeURIComponent(setor); } catch { /* já decodificado */ }
  if (!SETORES_VALIDOS.includes(setor))
    return NextResponse.json({ erro: 'Setor invalido' }, { status: 400 });

  // Operador só acessa setores da sua lista (múltiplos setores). Fallback pro
  // setor único quando o token não traz a lista (tokens legado). Vale também
  // para staff/pcp com `setores` preenchido (ex.: PCP que só pode movimentar
  // num setor específico, mas mantém a visão ampla do resto do sistema) — hoje
  // nenhuma conta staff tem `setores` preenchido, então isso não muda nada pra
  // quem já tinha acesso irrestrito.
  const meusSetores = (Array.isArray(user.setores) && user.setores.length > 0)
    ? user.setores
    : (user.setor ? [user.setor] : []);
  if (meusSetores.length > 0 && !meusSetores.includes(setor))
    return NextResponse.json({ erro: 'Acesso negado' }, { status: 403 });

  const verFinanceiro = user.is_staff && user.perfil !== 'lider';

  // Logística manda peças pra Caldeiraria (solda) e elas somem da fila dela
  // enquanto estão lá — mas a Logística não pode perder o rastro: busca também
  // (somente leitura) o que está parado na Caldeiraria, pra mostrar numa seção
  // separada sem misturar com as ações normais da própria fila.
  const buscarEmCaldeiraria = setor === 'logistica';

  // Rodar as queries em paralelo
  const [itens, lotes_chegando, lotes_trabalho, parciais, outras_parciais, resumo, itensCaldeiraria, parciaisCaldeiraria] = await Promise.all([
    // Itens cujo setor_atual é este setor (visão tradicional).
    // Exclui itens que tenham parciais ativas em outro setor — esses já se moveram
    // (divergência/devolver) mas o setor_atual do item ficou desatualizado.
    sql`
      SELECT i.*, p.numero_pedido_venda AS pedido_numero, p.cliente AS pedido_cliente,
             p.prazo_entrega::text AS pedido_prazo, p.prioridade AS pedido_prioridade, p.roteiro_base,
             p.numero_op,
             (p.desenho_url IS NOT NULL OR COALESCE(array_length(p.desenhos,1),0) > 0) AS tem_desenho, p.desenho_url AS desenho_url,
             (p.pedido_venda_url IS NOT NULL) AS tem_pedido_venda,
             (p.ordem_producao_url IS NOT NULL) AS tem_ordem_producao
      FROM producao_itempedido i JOIN producao_pedido p ON p.id = i.pedido_id
      WHERE i.setor_atual = ${setor} AND i.status != 'entregue' AND i.inativo = false
        AND NOT EXISTS (
          SELECT 1 FROM producao_itemparcial pa
          WHERE pa.item_pedido_id = i.id
            AND pa.setor_atual != ${setor}
            AND pa.status NOT IN ('cancelada', 'concluida')
        )
      ORDER BY p.numero_pedido_venda, i.codigo
    `,

    // Lotes chegando (em trânsito para este setor)
    sql`
      SELECT l.*, l.quantidade::text AS quantidade_str,
             i.codigo AS item_codigo, i.unidade, i.id AS item_pedido_id,
             p.numero_pedido_venda, p.cliente
      FROM producao_loteitem l
      JOIN producao_itempedido i ON i.id = l.item_pedido_id
      JOIN producao_pedido p ON p.id = i.pedido_id
      WHERE l.setor_destino = ${setor} AND l.status = 'em_producao' AND i.inativo = false
      ORDER BY l.criado_em ASC
    `,

    // Lotes em trabalho neste setor
    sql`
      SELECT l.*, l.quantidade::text AS quantidade_str,
             i.codigo AS item_codigo, i.unidade, i.id AS item_pedido_id,
             p.numero_pedido_venda, p.cliente
      FROM producao_loteitem l
      JOIN producao_itempedido i ON i.id = l.item_pedido_id
      JOIN producao_pedido p ON p.id = i.pedido_id
      WHERE l.setor_destino = ${setor} AND l.status = 'em_trabalho' AND i.inativo = false
      ORDER BY l.criado_em ASC
    `,

    // Parciais atualmente neste setor (nova visão de rastreio)
    sql`
      SELECT
        pa.id, pa.quantidade::text AS quantidade, pa.status, pa.observacao,
        pa.parcial_origem_id, pa.criado_em, pa.atualizado_em,
        pa.retrabalho, pa.motivo_retrabalho, pa.devolvido_de,
        -- contexto da parcial-pai: detecta retorno de retrabalho
        origem.retrabalho AS origem_retrabalho,
        origem.motivo_retrabalho AS origem_motivo_retrabalho,
        origem.devolvido_de AS origem_devolvido_de,
        i.id AS item_pedido_id, i.codigo AS item_codigo, i.unidade, i.descricao AS item_descricao,
        i.quantidade::text AS quantidade_total_item, i.roteiro_proprio,
        p.id AS pedido_id, p.numero_pedido_venda, p.numero_op, p.cliente, p.prioridade, p.roteiro_base, p.prazo_entrega::text AS pedido_prazo,
        p.embalagem_identificacao, p.embalagem_qtd_pallets, p.embalagem_peso_total, p.embalagem_total_unidades,
        (p.desenho_url IS NOT NULL OR COALESCE(array_length(p.desenhos,1),0) > 0) AS pedido_tem_desenho,
        (COALESCE(array_length(i.desenhos,1),0) > 0) AS item_tem_desenho,
        (p.pedido_venda_url IS NOT NULL) AS tem_pedido_venda,
        (p.ordem_producao_url IS NOT NULL) AS tem_ordem_producao,
        pa.pesos_pallets,
        pa.nomes_pallets,
        pa.fotos
      FROM producao_itemparcial pa
      JOIN producao_itempedido i ON i.id = pa.item_pedido_id
      JOIN producao_pedido p ON p.id = pa.pedido_id
      LEFT JOIN producao_itemparcial origem ON origem.id = pa.parcial_origem_id
      WHERE pa.setor_atual = ${setor}
        AND pa.status IN ('em_aberto', 'recebido', 'em_andamento', 'finalizado_setor', 'pausado', 'concluida')
        AND i.status != 'entregue'
        AND i.inativo = false
      ORDER BY p.numero_pedido_venda, i.codigo, pa.criado_em
    `.catch(() => [] as Record<string, unknown>[]),

    // Outras parciais ativas do mesmo item em outros setores (rastreabilidade)
    sql`
      SELECT
        pa.item_pedido_id,
        pa.setor_atual,
        pa.status,
        pa.retrabalho,
        SUM(pa.quantidade)::text AS quantidade,
        i.unidade
      FROM producao_itemparcial pa
      JOIN producao_itempedido i ON i.id = pa.item_pedido_id
      WHERE pa.status NOT IN ('cancelada', 'concluida')
        AND i.inativo = false
        AND pa.setor_atual != ${setor}
        AND pa.item_pedido_id IN (
          SELECT DISTINCT item_pedido_id FROM producao_itemparcial
          WHERE setor_atual = ${setor}
            AND status NOT IN ('cancelada', 'concluida')
        )
      GROUP BY pa.item_pedido_id, pa.setor_atual, pa.status, pa.retrabalho, i.unidade
      ORDER BY pa.item_pedido_id, pa.setor_atual
    `.catch(() => [] as Record<string, unknown>[]),

    // Resumo de quantidades por item neste setor (para exibição agrupada)
    sql`
      SELECT
        i.id AS item_pedido_id, p.id AS pedido_id,
        i.codigo AS item_codigo, i.descricao AS item_descricao, i.unidade,
        i.quantidade::text AS quantidade_total,
        p.numero_pedido_venda, p.cliente,
        SUM(pa.quantidade) FILTER (WHERE pa.setor_atual = ${setor} AND pa.status IN ('em_aberto','recebido','em_andamento'))::text AS quantidade_no_setor,
        SUM(pa.quantidade) FILTER (WHERE pa.setor_atual != ${setor} AND pa.status IN ('em_aberto','recebido','em_andamento'))::text AS quantidade_em_outros,
        SUM(pa.quantidade) FILTER (WHERE pa.status = 'concluida')::text AS quantidade_concluida,
        SUM(pa.quantidade)::text AS total_rastreado
      FROM producao_itemparcial pa
      JOIN producao_itempedido i ON i.id = pa.item_pedido_id
      JOIN producao_pedido p ON p.id = pa.pedido_id
      WHERE pa.status != 'cancelada'
        AND i.inativo = false
        AND EXISTS (
          SELECT 1 FROM producao_itemparcial px
          WHERE px.item_pedido_id = pa.item_pedido_id
            AND px.setor_atual = ${setor}
            AND px.status IN ('em_aberto','recebido','em_andamento')
        )
      GROUP BY i.id, p.id, i.codigo, i.descricao, i.unidade, i.quantidade,
               p.numero_pedido_venda, p.cliente
      ORDER BY p.numero_pedido_venda, i.codigo
    `.catch(() => [] as Record<string, unknown>[]),

    // Itens atualmente na Caldeiraria (rastreio somente-leitura pra Logística)
    !buscarEmCaldeiraria ? Promise.resolve([] as Record<string, unknown>[]) : sql`
      SELECT i.*, p.numero_pedido_venda AS pedido_numero, p.cliente AS pedido_cliente,
             p.prazo_entrega::text AS pedido_prazo, p.prioridade AS pedido_prioridade, p.roteiro_base,
             p.numero_op,
             (p.desenho_url IS NOT NULL OR COALESCE(array_length(p.desenhos,1),0) > 0) AS tem_desenho, p.desenho_url AS desenho_url,
             (p.pedido_venda_url IS NOT NULL) AS tem_pedido_venda,
             (p.ordem_producao_url IS NOT NULL) AS tem_ordem_producao
      FROM producao_itempedido i JOIN producao_pedido p ON p.id = i.pedido_id
      WHERE i.setor_atual = 'caldeiraria' AND i.status != 'entregue' AND i.inativo = false
        AND NOT EXISTS (
          SELECT 1 FROM producao_itemparcial pa
          WHERE pa.item_pedido_id = i.id
            AND pa.setor_atual != 'caldeiraria'
            AND pa.status NOT IN ('cancelada', 'concluida')
        )
      ORDER BY p.numero_pedido_venda, i.codigo
    `.catch(() => [] as Record<string, unknown>[]),

    // Parciais atualmente na Caldeiraria (rastreio somente-leitura pra Logística)
    !buscarEmCaldeiraria ? Promise.resolve([] as Record<string, unknown>[]) : sql`
      SELECT
        pa.id, pa.quantidade::text AS quantidade, pa.status, pa.observacao,
        pa.parcial_origem_id, pa.criado_em, pa.atualizado_em,
        pa.retrabalho, pa.motivo_retrabalho, pa.devolvido_de,
        i.id AS item_pedido_id, i.codigo AS item_codigo, i.unidade, i.descricao AS item_descricao,
        i.quantidade::text AS quantidade_total_item, i.roteiro_proprio,
        p.id AS pedido_id, p.numero_pedido_venda, p.numero_op, p.cliente, p.prioridade, p.roteiro_base, p.prazo_entrega::text AS pedido_prazo,
        p.embalagem_identificacao, p.embalagem_qtd_pallets, p.embalagem_peso_total, p.embalagem_total_unidades,
        (p.pedido_venda_url IS NOT NULL) AS tem_pedido_venda,
        (p.ordem_producao_url IS NOT NULL) AS tem_ordem_producao
      FROM producao_itemparcial pa
      JOIN producao_itempedido i ON i.id = pa.item_pedido_id
      JOIN producao_pedido p ON p.id = pa.pedido_id
      WHERE pa.setor_atual = 'caldeiraria'
        AND pa.status IN ('em_aberto', 'recebido', 'em_andamento', 'finalizado_setor', 'pausado')
        AND i.status != 'entregue'
        AND i.inativo = false
      ORDER BY p.numero_pedido_venda, i.codigo, pa.criado_em
    `.catch(() => [] as Record<string, unknown>[]),
  ]);

  // Observações por item — histórico acumulado (tabela pode não existir ainda)
  const itemIdsParciais = Array.from(new Set((parciais as Record<string, unknown>[]).map(p => Number(p.item_pedido_id))));
  const observacoesPorItem = new Map<number, { id: number; setor: string; setor_nome: string; usuario_nome: string; texto: string; criado_em: string }[]>();
  if (itemIdsParciais.length > 0) {
    const obsRows = await sql`
      SELECT o.*, u.nome AS usuario_nome
      FROM producao_item_observacao o
      LEFT JOIN usuarios_usuario u ON u.id = o.usuario_id
      WHERE o.item_id = ANY(${itemIdsParciais})
      ORDER BY o.criado_em ASC
    `.catch(() => [] as Record<string, unknown>[]);
    for (const o of obsRows) {
      const iid = Number(o.item_id);
      if (!observacoesPorItem.has(iid)) observacoesPorItem.set(iid, []);
      observacoesPorItem.get(iid)!.push({
        id: o.id as number,
        setor: o.setor as string,
        setor_nome: nomeSector(o.setor as string),
        usuario_nome: (o.usuario_nome as string) || 'Sistema',
        texto: o.texto as string,
        criado_em: o.criado_em as string,
      });
    }
  }

  const fmtLote = (l: Record<string, unknown>) => ({
    id: l.id,
    quantidade: l.quantidade_str,
    unidade: l.unidade,
    status: l.status,
    setor_origem: l.setor_origem,
    setor_origem_nome: nomeSector(l.setor_origem as string),
    setor_destino: l.setor_destino,
    setor_destino_nome: nomeSector(l.setor_destino as string),
    item_codigo: l.item_codigo,
    item_pedido_id: l.item_pedido_id,
    numero_pedido_venda: l.numero_pedido_venda,
    cliente: l.cliente,
    criado_em: l.criado_em,
    recebido_em: l.recebido_em,
  });

  // Agrupa outras_parciais por item_pedido_id para lookup rápido
  const outrasPorItem = new Map<number, { setor: string; setor_nome: string; quantidade: string; unidade: string; status: string; retrabalho: boolean }[]>();
  for (const op of outras_parciais as Record<string, unknown>[]) {
    const itemId = Number(op.item_pedido_id);
    if (!outrasPorItem.has(itemId)) outrasPorItem.set(itemId, []);
    outrasPorItem.get(itemId)!.push({
      setor: op.setor_atual as string,
      setor_nome: nomeSector(op.setor_atual as string),
      quantidade: op.quantidade as string,
      unidade: op.unidade as string,
      status: op.status as string,
      retrabalho: Boolean(op.retrabalho),
    });
  }

  const fmtParcial = (p: Record<string, unknown>, setorEfetivo: string = setor) => {
    const roteiroBase: string[] = (p.roteiro_proprio as string[] | null)?.length
      ? (p.roteiro_proprio as string[])
      : ((p.roteiro_base as string[]) || []);
    // Toda peça passa pela Quarentena antes da Logística.
    const roteiro = injetarQuarentena(roteiroBase);
    const idx = roteiro.indexOf(setorEfetivo);
    const proximo_setor = (idx !== -1 && idx < roteiro.length - 1) ? roteiro[idx + 1] : null;
    return {
      id: p.id,
      item_pedido_id: p.item_pedido_id,
      pedido_id: p.pedido_id,
      parcial_origem_id: p.parcial_origem_id ?? null,
      quantidade: p.quantidade,
      unidade: p.unidade,
      setor_atual: setorEfetivo,
      setor_atual_nome: nomeSector(setorEfetivo),
      status: p.status,
      observacao: p.observacao ?? null,
      item_codigo: p.item_codigo,
      item_descricao: p.item_descricao,
      quantidade_total_item: p.quantidade_total_item,
      numero_pedido_venda: p.numero_pedido_venda,
      numero_op: p.numero_op ?? null,
      tem_desenho: Boolean(p.pedido_tem_desenho) || Boolean(p.item_tem_desenho),
      desenho_via_item: !p.pedido_tem_desenho && Boolean(p.item_tem_desenho),
      tem_pedido_venda: Boolean(p.tem_pedido_venda),
      tem_ordem_producao: Boolean(p.tem_ordem_producao),
      pesos_pallets: Array.isArray(p.pesos_pallets) ? (p.pesos_pallets as unknown[]).map(v => Number(v)) : [],
      nomes_pallets: Array.isArray(p.nomes_pallets) ? (p.nomes_pallets as unknown[]).map(v => String(v)) : [],
      embalagem_resumo: {
        identificacao: (p.embalagem_identificacao as string) ?? '',
        qtd_pallets: p.embalagem_qtd_pallets != null ? Number(p.embalagem_qtd_pallets) : null,
        peso_total: p.embalagem_peso_total != null ? Number(p.embalagem_peso_total) : null,
        total_unidades: p.embalagem_total_unidades != null ? Number(p.embalagem_total_unidades) : null,
      },
      peso_total_embalagem: Array.isArray(p.pesos_pallets)
        ? (p.pesos_pallets as unknown[]).reduce((s: number, v) => s + Number(v), 0)
        : 0,
      fotos: Array.isArray(p.fotos) ? (p.fotos as string[]) : [],
      pedido_prazo: p.pedido_prazo ?? null,
      cliente: p.cliente,
      prioridade: p.prioridade,
      proximo_setor,
      criado_em: p.criado_em,
      atualizado_em: p.atualizado_em,
      retrabalho: p.retrabalho ?? false,
      motivo_retrabalho: p.motivo_retrabalho ?? null,
      devolvido_de: p.devolvido_de ?? null,
      outras_parciais: outrasPorItem.get(Number(p.item_pedido_id)) ?? [],
      observacoes: observacoesPorItem.get(Number(p.item_pedido_id)) ?? [],
    };
  };

  const fmtResumo = (r: Record<string, unknown>) => ({
    item_pedido_id: r.item_pedido_id,
    pedido_id: r.pedido_id,
    item_codigo: r.item_codigo,
    item_descricao: r.item_descricao,
    numero_pedido_venda: r.numero_pedido_venda,
    cliente: r.cliente,
    quantidade_total: r.quantidade_total,
    unidade: r.unidade,
    quantidade_no_setor: r.quantidade_no_setor ?? '0',
    quantidade_em_outros_setores: r.quantidade_em_outros ?? '0',
    quantidade_concluida: r.quantidade_concluida ?? '0',
    total_rastreado: r.total_rastreado ?? '0',
  });

  return NextResponse.json({
    setor,
    nome: nomeSector(setor),
    // Visão tradicional (compatibilidade)
    itens: itens.map(i => {
      const fmt = formatItem(i);
      return verFinanceiro ? fmt : { ...fmt, valor_unitario: null };
    }),
    lotes_chegando: lotes_chegando.map(fmtLote),
    lotes_trabalho: lotes_trabalho.map(fmtLote),
    // Nova visão por parciais
    parciais: (parciais as Record<string, unknown>[]).map(p => fmtParcial(p)),
    resumo_por_item: (resumo as Record<string, unknown>[]).map(fmtResumo),
    // Rastreio somente-leitura do que está na Caldeiraria (só quando setor=logistica)
    em_caldeiraria: buscarEmCaldeiraria ? {
      itens: (itensCaldeiraria as Record<string, unknown>[]).map(i => {
        const fmt = formatItem(i);
        return verFinanceiro ? fmt : { ...fmt, valor_unitario: null };
      }),
      parciais: (parciaisCaldeiraria as Record<string, unknown>[]).map(p => fmtParcial(p, 'caldeiraria')),
    } : undefined,
  });
  } catch (e) {
    console.error('[setor]', e);
    return NextResponse.json({ erro: 'Erro interno' }, { status: 500 });
  }
}
