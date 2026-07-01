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
    finalizado_setor: 'Finalizado no Setor', em_transito: 'Em TrÃ¢nsito', bloqueado: 'Bloqueado',
    reprovado: 'Reprovado', aprovado: 'Aprovado', entregue: 'Entregue',
  };
  return m[s] || s;
}

export async function GET(req: Request) {
  const user = await autenticar(req);
  if (user instanceof NextResponse) return user;
  if (!user.is_staff) return NextResponse.json({ erro: 'Sem permissao' }, { status: 403 });

  // Todas as queries em paralelo
  const [
    countsRows,
    porSetorRows,
    valorSetorRows,
    lotesChegandoRows,
    pedidosAtrasados,
    ultMovs,
    divCountsRows,
  ] = await Promise.all([
    // Contadores com CTE para evitar subquery correlacionada por pedido
    sql`
      WITH item_valores AS (
        SELECT pedido_id,
               SUM(quantidade * COALESCE(valor_unitario, 0)) AS valor_total
        FROM producao_itempedido
        GROUP BY pedido_id
      ),
      item_status AS (
        SELECT pedido_id,
               bool_or(status NOT IN ('entregue','aguardando','recebido')) AS tem_ativo
        FROM producao_itempedido
        GROUP BY pedido_id
      )
      SELECT
        COUNT(*) FILTER (WHERE p.status != 'entregue')                                          AS total,
        COUNT(*) FILTER (WHERE p.status = 'emitido')                                            AS a_produzir,
        COUNT(*) FILTER (WHERE p.status = 'em_producao' AND p.setor_atual != 'logistica'
          AND COALESCE(ist.tem_ativo, false))                                                    AS produzindo,
        COUNT(*) FILTER (WHERE p.status = 'em_producao' AND p.setor_atual != 'logistica'
          AND NOT COALESCE(ist.tem_ativo, false))                                                AS ag_recebimento,
        COUNT(*) FILTER (WHERE p.status = 'em_producao' AND p.setor_atual = 'logistica')        AS mat_concluido,
        COUNT(*) FILTER (WHERE p.status = 'entregue')                                           AS entregues,
        COUNT(*) FILTER (WHERE p.prazo_entrega < NOW()::date AND p.status != 'entregue')        AS atrasados,
        COUNT(*) FILTER (WHERE p.prioridade = 'urgente' AND p.status != 'entregue')             AS urgentes,
        COUNT(*) FILTER (WHERE p.status = 'bloqueado')                                          AS bloqueados,
        COALESCE(SUM(iv.valor_total) FILTER (WHERE p.status = 'emitido'),      0)::text         AS valor_a_produzir,
        COALESCE(SUM(iv.valor_total) FILTER (WHERE p.status = 'em_producao'),  0)::text         AS valor_em_producao,
        COALESCE(SUM(iv.valor_total) FILTER (WHERE p.status = 'entregue'),     0)::text         AS valor_concluido
      FROM producao_pedido p
      LEFT JOIN item_valores iv  ON iv.pedido_id  = p.id
      LEFT JOIN item_status  ist ON ist.pedido_id = p.id
    `,

    // Itens por setor: contagem simples sem json_agg
    sql`
      WITH itens_diretos AS (
        SELECT i.setor_atual AS setor, i.id
        FROM producao_itempedido i
        WHERE i.status != 'entregue'
      ),
      itens_via_parcial AS (
        SELECT DISTINCT pa.setor_atual AS setor, i.id
        FROM producao_itemparcial pa
        JOIN producao_itempedido i ON i.id = pa.item_pedido_id
        WHERE pa.status NOT IN ('cancelada', 'concluida')
          AND pa.setor_atual != i.setor_atual
      ),
      todos AS (
        SELECT * FROM itens_diretos
        UNION
        SELECT * FROM itens_via_parcial
      )
      SELECT setor AS setor_atual, COUNT(*) AS qtd
      FROM todos
      GROUP BY setor
    `,

    // Valor por setor
    sql`
      SELECT setor_atual,
             COALESCE(SUM(valor_unitario * quantidade_pendente), 0)::text AS valor
      FROM producao_itempedido
      WHERE status != 'entregue'
      GROUP BY setor_atual
    `,

    // Lotes chegando por setor
    sql`
      SELECT setor_destino, COUNT(*) AS qtd_chegando
      FROM producao_loteitem
      WHERE status = 'em_producao'
      GROUP BY setor_destino
    `,

    // Pedidos atrasados
    sql`
      SELECT id, numero_pedido_venda, cliente, prazo_entrega::text, prioridade, status
      FROM producao_pedido
      WHERE prazo_entrega < NOW()::date AND status != 'entregue'
      ORDER BY prazo_entrega ASC
      LIMIT 10
    `,

    // Ãšltimas movimentaÃ§Ãµes
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

    // DivergÃªncias (tabela pode nÃ£o existir)
    sql`
      SELECT
        COUNT(*) FILTER (WHERE status IN ('aberta','em_analise'))                          AS abertas,
        COUNT(*) FILTER (WHERE status IN ('aberta','em_analise') AND prioridade = 'urgente') AS urgentes
      FROM producao_divergencia
    `.catch(() => [{ abertas: 0, urgentes: 0 }]),
  ]);

  const counts = countsRows[0];
  const divCounts = divCountsRows[0] ?? { abertas: 0, urgentes: 0 };

  // Montar mapa por setor
  const valorMap: Record<string, string> = {};
  for (const v of valorSetorRows) valorMap[v.setor_atual] = v.valor;

  const chegandoMap: Record<string, number> = {};
  for (const l of lotesChegandoRows) chegandoMap[l.setor_destino] = Number(l.qtd_chegando);

  const setorQtdMap: Record<string, number> = {};
  for (const row of porSetorRows) setorQtdMap[row.setor_atual] = Number(row.qtd);

  const verFinanceiro = user.is_staff;

  const porSetor = SETOR_CHOICES
    .map(([cod, nome]) => ({
      cod, nome,
      qtd: setorQtdMap[cod] ?? 0,
      qtd_chegando: chegandoMap[cod] || 0,
      valor: verFinanceiro ? (valorMap[cod] || '0') : null,
    }))
    .filter(s => s.qtd > 0 || s.qtd_chegando > 0);

  return NextResponse.json({
    total:           Number(counts.total),
    a_produzir:      Number(counts.a_produzir),
    ag_recebimento:  Number(counts.ag_recebimento),
    produzindo:      Number(counts.produzindo),
    mat_concluido:   Number(counts.mat_concluido),
    entregues:       Number(counts.entregues),
    atrasados:       Number(counts.atrasados),
    urgentes:        Number(counts.urgentes),
    bloqueados:      Number(counts.bloqueados),
    valor_a_produzir:  verFinanceiro ? counts.valor_a_produzir  : null,
    valor_em_producao: verFinanceiro ? counts.valor_em_producao : null,
    valor_concluido:   verFinanceiro ? counts.valor_concluido   : null,
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

