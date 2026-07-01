import { NextResponse } from 'next/server';
import sql from '@/lib/db';
import { autenticar } from '@/lib/middleware';
import { SETOR_CHOICES } from '@/lib/types';
import { nomeSector } from '@/lib/queries';

export const dynamic = 'force-dynamic';

function statusDisplay(s: string): string {
  const m: Record<string, string> = {
    emitido: 'Emitido', aguardando: 'Aguardando', recebido: 'Recebido',
    em_andamento: 'Em Andamento', pausado: 'Pausado',
    finalizado_setor: 'Finalizado no Setor', em_transito: 'Em Trânsito', bloqueado: 'Bloqueado',
    reprovado: 'Reprovado', aprovado: 'Aprovado', entregue: 'Entregue',
  };
  return m[s] || s;
}

export async function GET(req: Request) {
  const user = await autenticar(req);
  if (user instanceof NextResponse) return user;
  if (!user.is_staff) return NextResponse.json({ erro: 'Sem permissao' }, { status: 403 });

  // Queries simples, sem JOINs pesados — cada uma é rápida isoladamente
  const [
    countsRows,
    porSetorRows,
    pedidosAtrasados,
    ultMovs,
    divCountsRows,
  ] = await Promise.all([
    // Contadores simples — só producao_pedido, sem JOIN
    sql`
      SELECT
        COUNT(*) FILTER (WHERE status != 'entregue')                                   AS total,
        COUNT(*) FILTER (WHERE status = 'emitido')                                     AS a_produzir,
        COUNT(*) FILTER (WHERE status = 'em_producao' AND setor_atual != 'logistica')  AS produzindo,
        COUNT(*) FILTER (WHERE status = 'em_producao' AND setor_atual = 'logistica')   AS mat_concluido,
        COUNT(*) FILTER (WHERE status = 'entregue')                                    AS entregues,
        COUNT(*) FILTER (WHERE prazo_entrega < NOW()::date AND status != 'entregue')   AS atrasados,
        COUNT(*) FILTER (WHERE prioridade = 'urgente' AND status != 'entregue')        AS urgentes,
        COUNT(*) FILTER (WHERE status = 'bloqueado')                                   AS bloqueados
      FROM producao_pedido
    `,

    // Itens por setor — query direta sem UNION
    sql`
      SELECT setor_atual, COUNT(*) AS qtd
      FROM producao_itempedido
      WHERE status NOT IN ('entregue', 'cancelado')
      GROUP BY setor_atual
    `,

    // Pedidos atrasados — simples
    sql`
      SELECT id, numero_pedido_venda, cliente, prazo_entrega::text, prioridade, status
      FROM producao_pedido
      WHERE prazo_entrega < NOW()::date AND status != 'entregue'
      ORDER BY prazo_entrega ASC
      LIMIT 10
    `,

    // Últimas movimentações
    sql`
      SELECT m.id, m.setor_origem, m.setor_destino, m.status_anterior, m.status_novo,
             m.observacao, m.criado_em,
             i.codigo AS item_codigo, p.numero_pedido_venda,
             u.nome   AS usuario_nome
      FROM producao_movimentacaoitem m
      JOIN producao_itempedido i ON i.id = m.item_id
      LEFT JOIN producao_pedido p ON p.id = i.pedido_id
      LEFT JOIN usuarios_usuario u ON u.id = m.usuario_id
      ORDER BY m.criado_em DESC
      LIMIT 15
    `,

    // Divergências
    sql`
      SELECT
        COUNT(*) FILTER (WHERE status IN ('aberta','em_analise'))                            AS abertas,
        COUNT(*) FILTER (WHERE status IN ('aberta','em_analise') AND prioridade = 'urgente') AS urgentes
      FROM producao_divergencia
    `.catch(() => [{ abertas: 0, urgentes: 0 }]),
  ]);

  const counts = countsRows[0];
  const divCounts = divCountsRows[0] ?? { abertas: 0, urgentes: 0 };

  const setorQtdMap: Record<string, number> = {};
  for (const row of porSetorRows) setorQtdMap[row.setor_atual] = Number(row.qtd);

  const porSetor = SETOR_CHOICES
    .map(([cod, nome]) => ({
      cod, nome,
      qtd: setorQtdMap[cod] ?? 0,
      qtd_chegando: 0,
      valor: null,
      itens: [],
    }))
    .filter(s => s.qtd > 0);

  return NextResponse.json({
    total:           Number(counts.total),
    a_produzir:      Number(counts.a_produzir),
    ag_recebimento:  0,
    produzindo:      Number(counts.produzindo),
    mat_concluido:   Number(counts.mat_concluido),
    entregues:       Number(counts.entregues),
    atrasados:       Number(counts.atrasados),
    urgentes:        Number(counts.urgentes),
    bloqueados:      Number(counts.bloqueados),
    valor_a_produzir:  null,
    valor_em_producao: null,
    valor_concluido:   null,
    por_setor: porSetor,
    pedidos_atrasados: pedidosAtrasados,
    ultimas_movimentacoes: ultMovs.map(m => ({
      id: m.id,
      item_codigo: m.item_codigo,
      numero_pedido_venda: m.numero_pedido_venda,
      setor_origem: m.setor_origem,       setor_origem_nome: nomeSector(m.setor_origem),
      setor_destino: m.setor_destino,     setor_destino_nome: nomeSector(m.setor_destino),
      status_anterior: m.status_anterior, status_anterior_display: statusDisplay(m.status_anterior),
      status_novo: m.status_novo,         status_novo_display: statusDisplay(m.status_novo),
      observacao: m.observacao || '',
      usuario_nome: m.usuario_nome || 'Sistema',
      criado_em: m.criado_em,
    })),
    divergencias_abertas:  Number(divCounts.abertas),
    divergencias_urgentes: Number(divCounts.urgentes),
  });
}
