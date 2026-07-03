import { NextResponse } from 'next/server';
import sql from '@/lib/db';
import { autenticar } from '@/lib/middleware';
import { formatItem, nomeSector, statusDisplay } from '@/lib/queries';

export const dynamic = 'force-dynamic';

function parcialStatusDisplay(s: string): string {
  const m: Record<string, string> = {
    em_aberto: 'Em Aberto', em_andamento: 'Em Andamento',
    concluida: 'Concluída', cancelada: 'Cancelada',
  };
  return m[s] || s;
}

export async function GET(req: Request, { params }: { params: { id: string } }) {
  const user = await autenticar(req);
  if (user instanceof NextResponse) return user;

  const itemId = Number(params.id);
  if (!Number.isInteger(itemId) || itemId <= 0)
    return NextResponse.json({ erro: 'ID invalido' }, { status: 400 });

  const [row] = await sql`
    SELECT i.*, p.numero_pedido_venda AS pedido_numero, p.cliente AS pedido_cliente,
           p.prazo_entrega::text AS pedido_prazo, p.prioridade AS pedido_prioridade,
           p.roteiro_base, p.desenho_url IS NOT NULL AS tem_desenho,
           p.pedido_venda_url IS NOT NULL AS tem_pedido_venda,
           p.ordem_producao_url IS NOT NULL AS tem_ordem_producao
    FROM producao_itempedido i
    JOIN producao_pedido p ON p.id = i.pedido_id
    WHERE i.id = ${itemId}
  `;
  if (!row) return NextResponse.json({ erro: 'Nao encontrado' }, { status: 404 });

  if (!user.is_staff && row.setor_atual !== user.setor) {
    // Permite acesso se o usuário tem parcial ativa deste item no seu setor
    // (caso de divergência: parcial movida para outro setor mas setor_atual do item desatualizado)
    const [{ tem_parcial }] = await sql`
      SELECT COUNT(*)::int > 0 AS tem_parcial
      FROM producao_itemparcial
      WHERE item_pedido_id = ${itemId}
        AND setor_atual = ${user.setor ?? ''}
        AND status NOT IN ('cancelada', 'concluida')
    `;
    if (!tem_parcial)
      return NextResponse.json({ erro: 'Acesso negado' }, { status: 403 });
  }

  const item = formatItem(row);

  const [loteRows, movRows, parcialRows, obsRows] = await Promise.all([
    sql`
      SELECT l.*, l.quantidade::text AS quantidade_str
      FROM producao_loteitem l WHERE l.item_pedido_id = ${row.id} ORDER BY l.criado_em ASC
    `,
    sql`
      SELECT m.*, u.nome AS usuario_nome
      FROM producao_movimentacaoitem m
      LEFT JOIN usuarios_usuario u ON u.id = m.usuario_id
      WHERE m.item_id = ${row.id} ORDER BY m.criado_em ASC
    `,
    // Parciais — podem não existir se tabela ainda não foi criada
    sql`
      SELECT p.*, p.quantidade::text AS quantidade_str, p.parcial_origem_id
      FROM producao_itemparcial p
      WHERE p.item_pedido_id = ${row.id}
        AND p.status != 'cancelada'
      ORDER BY p.criado_em ASC
    `.catch(() => [] as Record<string, unknown>[]),
    // Observações — podem não existir se tabela ainda não foi criada
    sql`
      SELECT o.*, u.nome AS usuario_nome
      FROM producao_item_observacao o
      LEFT JOIN usuarios_usuario u ON u.id = o.usuario_id
      WHERE o.item_id = ${row.id}
      ORDER BY o.criado_em ASC
    `.catch(() => [] as Record<string, unknown>[]),
  ]);

  const verFinanceiro = user.is_staff && user.perfil !== 'lider';
  const itemSanitizado = verFinanceiro ? item : { ...item, valor_unitario: null };
  const temDesenho = Boolean(row.tem_desenho);

  // ── Rastreio por setor ────────────────────────────────────────────────────
  const porSetor: Record<string, { setor: string; setor_nome: string; quantidade: number; status: string }> = {};
  let qtdEmAberto = 0;
  let qtdEmAndamento = 0;
  let qtdConcluida = 0;
  let totalRastreado = 0;

  for (const p of parcialRows) {
    const setor = p.setor_atual as string;
    const qtd = Number(p.quantidade_str);
    const st = p.status as string;

    totalRastreado += qtd;
    if (st === 'em_aberto') qtdEmAberto += qtd;
    if (st === 'em_andamento') qtdEmAndamento += qtd;
    if (st === 'concluida') qtdConcluida += qtd;

    if (!porSetor[setor]) {
      porSetor[setor] = { setor, setor_nome: nomeSector(setor), quantidade: 0, status: st };
    }
    porSetor[setor].quantidade += qtd;
    // status do setor = andamento se qualquer parcial lá estiver em andamento
    if (st === 'em_andamento') porSetor[setor].status = 'em_andamento';
  }

  const qtdTotal = Number(item.quantidade);
  const rastreio = {
    quantidade_total: item.quantidade,
    por_setor: Object.values(porSetor),
    quantidade_em_aberto: String(qtdEmAberto),
    quantidade_em_andamento: String(qtdEmAndamento),
    quantidade_concluida: String(qtdConcluida),
    quantidade_cancelada: '0',
    total_rastreado: String(totalRastreado),
    integro: Math.abs(qtdTotal - totalRastreado) < 0.001 || totalRastreado === 0,
  };

  return NextResponse.json({
    ...itemSanitizado,
    tem_desenho: temDesenho,
    tem_pedido_venda: Boolean(row.tem_pedido_venda),
    tem_ordem_producao: Boolean(row.tem_ordem_producao),
    lotes: loteRows.map(l => ({
      id: l.id, quantidade: l.quantidade_str, status: l.status,
      setor_origem: l.setor_origem, setor_origem_nome: nomeSector(l.setor_origem as string),
      setor_destino: l.setor_destino, setor_destino_nome: nomeSector(l.setor_destino as string),
      criado_em: l.criado_em, recebido_em: l.recebido_em,
    })),
    movimentacoes: movRows.map(m => ({
      id: m.id,
      setor_origem: m.setor_origem, setor_origem_nome: nomeSector(m.setor_origem as string),
      setor_destino: m.setor_destino, setor_destino_nome: nomeSector(m.setor_destino as string),
      status_anterior: m.status_anterior, status_anterior_display: statusDisplay(m.status_anterior as string),
      status_novo: m.status_novo, status_novo_display: statusDisplay(m.status_novo as string),
      observacao: m.observacao || '',
      usuario_nome: m.usuario_nome || 'Sistema',
      criado_em: m.criado_em,
    })),
    // ── NOVO: parciais e rastreio ──────────────────────────────────────────
    parciais: parcialRows.map(p => ({
      id: p.id,
      parcial_origem_id: p.parcial_origem_id,
      quantidade: p.quantidade_str,
      setor_atual: p.setor_atual,
      setor_atual_nome: nomeSector(p.setor_atual as string),
      status: p.status,
      status_display: parcialStatusDisplay(p.status as string),
      observacao: p.observacao || null,
      criado_em: p.criado_em,
      atualizado_em: p.atualizado_em,
    })),
    rastreio,
    observacoes: obsRows.map(o => ({
      id: o.id,
      setor: o.setor,
      setor_nome: nomeSector(o.setor as string),
      usuario_nome: o.usuario_nome || 'Sistema',
      texto: o.texto,
      criado_em: o.criado_em,
    })),
  });
}
