import { NextResponse } from 'next/server';
import sql from '@/lib/db';
import { autenticar } from '@/lib/middleware';

export async function GET(req: Request, { params }: { params: { id: string } }) {
  const user = await autenticar(req);
  if (user instanceof NextResponse) return user;
  if (!user.is_staff) return NextResponse.json({ erro: 'Sem permissao' }, { status: 403 });

  const pedidoId = Number(params.id);
  if (!Number.isInteger(pedidoId) || pedidoId <= 0)
    return NextResponse.json({ erro: 'ID invalido' }, { status: 400 });

  // ── Pedido completo ──────────────────────────────────────────────────────
  const [pedido] = await sql`
    SELECT p.*,
      p.prazo_entrega::text,
      p.data_emissao::text,
      p.valor_total::text,
      u.nome  AS criado_por_nome,
      u.setor AS criado_por_setor,
      COALESCE(
        (SELECT SUM(i2.quantidade * COALESCE(i2.valor_unitario,0))
         FROM producao_itempedido i2 WHERE i2.pedido_id = p.id), 0
      )::text AS valor_calculado
    FROM producao_pedido p
    LEFT JOIN usuarios_usuario u ON u.id = p.criado_por_id
    WHERE p.id = ${pedidoId}
  `;
  if (!pedido) return NextResponse.json({ erro: 'Pedido nao encontrado' }, { status: 404 });

  // ── Itens ────────────────────────────────────────────────────────────────
  const itens = await sql`
    SELECT
      i.id, i.codigo, i.descricao, i.quantidade::text, i.unidade,
      i.valor_unitario::text,
      (i.quantidade * COALESCE(i.valor_unitario,0))::text AS valor_total_item,
      i.status, i.setor_atual, i.quantidade_pendente::text, i.quantidade_entregue::text,
      i.roteiro_proprio, i.criado_em::text
    FROM producao_itempedido i
    WHERE i.pedido_id = ${pedidoId}
    ORDER BY i.codigo
  `;

  // ── Movimentações completas ──────────────────────────────────────────────
  const movimentacoes = await sql`
    SELECT
      m.id, m.item_id, m.setor_origem, m.setor_destino,
      m.status_anterior, m.status_novo, m.observacao,
      m.criado_em::text,
      u.nome AS usuario_nome,
      i.codigo AS item_codigo
    FROM producao_movimentacaoitem m
    LEFT JOIN usuarios_usuario u ON u.id = m.usuario_id
    LEFT JOIN producao_itempedido i ON i.id = m.item_id
    WHERE m.pedido_id = ${pedidoId}
    ORDER BY m.criado_em
  `;

  // ── Tempo em cada setor por item ─────────────────────────────────────────
  // Calcula o tempo que cada item ficou em cada setor usando as movimentações
  const temposPorSetor: Record<string, Record<string, number>> = {};
  // itemId -> setor -> minutos totais

  const movsPorItem = itens.map(item => ({
    item,
    movs: movimentacoes.filter(m => m.item_id === item.id),
  }));

  for (const { item, movs } of movsPorItem) {
    temposPorSetor[item.id] = {};
    let entradaSetor: Date | null = null;
    let setorAtual = '';

    for (const mov of movs) {
      const ts = new Date(mov.criado_em);
      // Entrada no setor: quando recebeu (status recebido) ou quando começou (em_andamento)
      if (mov.status_novo === 'recebido' || mov.status_novo === 'em_andamento') {
        entradaSetor = ts;
        setorAtual = mov.setor_destino || mov.setor_origem;
      }
      // Saída do setor: quando finalizou ou enviou para próximo
      if ((mov.status_novo === 'finalizado_setor' || mov.status_novo === 'aguardando' || mov.status_novo === 'em_transito' || mov.status_novo === 'entregue') && entradaSetor && setorAtual) {
        const minutos = Math.round((ts.getTime() - entradaSetor.getTime()) / 60000);
        if (minutos > 0) {
          temposPorSetor[item.id][setorAtual] = (temposPorSetor[item.id][setorAtual] || 0) + minutos;
        }
        entradaSetor = null;
        setorAtual = '';
      }
    }
  }

  // ── Entregas e comprovantes ──────────────────────────────────────────────
  const entregas = await sql`
    SELECT
      e.id, e.item_id, e.numero_nf, e.comprovante_url, e.comprovante_tipo,
      e.observacao, e.criado_em::text,
      u.nome AS usuario_nome,
      i.codigo AS item_codigo
    FROM producao_entrega e
    LEFT JOIN usuarios_usuario u ON u.id = e.usuario_id
    LEFT JOIN producao_itempedido i ON i.id = e.item_id
    WHERE e.pedido_id = ${pedidoId}
    ORDER BY e.criado_em
  `;

  // ── Lotes (envios parciais) ──────────────────────────────────────────────
  const lotes = await sql`
    SELECT
      l.id, l.item_pedido_id, l.setor_origem, l.setor_destino,
      l.quantidade::text, l.status, l.observacao,
      l.criado_em::text, l.recebido_em::text,
      c.nome AS criado_por_nome,
      r.nome AS recebido_por_nome,
      i.codigo AS item_codigo
    FROM producao_loteitem l
    LEFT JOIN usuarios_usuario c ON c.id = l.criado_por_id
    LEFT JOIN usuarios_usuario r ON r.id = l.recebido_por_id
    LEFT JOIN producao_itempedido i ON i.id = l.item_pedido_id
    WHERE l.item_pedido_id IN (SELECT id FROM producao_itempedido WHERE pedido_id = ${pedidoId})
    ORDER BY l.criado_em
  `;

  // ── Divergências ─────────────────────────────────────────────────────────
  let divergencias: object[] = [];
  try {
    divergencias = (await sql`
      SELECT d.*, u.nome AS usuario_nome, r.nome AS resolvido_por_nome,
             i.codigo AS item_codigo
      FROM producao_divergencia d
      LEFT JOIN usuarios_usuario u ON u.id = d.usuario_id
      LEFT JOIN usuarios_usuario r ON r.id = d.resolvido_por_id
      LEFT JOIN producao_itempedido i ON i.id = d.item_id
      WHERE d.pedido_id = ${pedidoId}
      ORDER BY d.criado_em
    `) as object[];
  } catch { /* tabela pode não existir */ }

  return NextResponse.json({
    pedido,
    itens,
    movimentacoes,
    tempos_por_setor: temposPorSetor,
    entregas,
    lotes,
    divergencias,
    gerado_em: new Date().toISOString(),
    gerado_por: user.nome || user.username,
  });
}
