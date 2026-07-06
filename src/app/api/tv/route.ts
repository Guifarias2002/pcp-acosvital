import { NextResponse } from 'next/server';
import sql from '@/lib/db';
import { SETOR_CHOICES } from '@/lib/types';
import { nomeSector } from '@/lib/queries';
import { autenticar } from '@/lib/middleware';
import { withTimeout } from '@/lib/queryTimeout';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  try {
  const user = await autenticar(req);
  if (user instanceof NextResponse) return user;
  const qCounts = sql`
      SELECT
        COUNT(*) FILTER (WHERE status != 'entregue')                                   AS total,
        COUNT(*) FILTER (WHERE status = 'emitido')                                     AS a_produzir,
        COUNT(*) FILTER (WHERE status = 'em_producao' AND setor_atual != 'logistica')  AS produzindo,
        COUNT(*) FILTER (WHERE prazo_entrega < NOW()::date AND status != 'entregue')   AS atrasados,
        COUNT(*) FILTER (WHERE prioridade = 'urgente' AND status != 'entregue')        AS urgentes
      FROM producao_pedido
    `;
  const qPorSetor = sql`
      SELECT setor_atual, COUNT(*) AS qtd
      FROM producao_itempedido
      WHERE status NOT IN ('entregue', 'cancelado')
      GROUP BY setor_atual
    `;
  const qUltMovs = sql`
      SELECT m.id, m.setor_destino, m.status_anterior, m.status_novo, m.criado_em,
             i.codigo AS item_codigo, p.numero_pedido_venda,
             u.nome   AS usuario_nome
      FROM producao_movimentacaoitem m
      JOIN producao_itempedido i ON i.id = m.item_id
      LEFT JOIN producao_pedido p ON p.id = i.pedido_id
      LEFT JOIN usuarios_usuario u ON u.id = m.usuario_id
      ORDER BY m.criado_em DESC
      LIMIT 15
    `;

  const [countsRows, porSetorRows, ultMovs] = await withTimeout(
    Promise.all([qCounts, qPorSetor, qUltMovs]),
    7500,
    [qCounts, qPorSetor, qUltMovs],
  );

  const counts = countsRows[0];
  const setorMap: Record<string, number> = {};
  for (const r of porSetorRows) setorMap[r.setor_atual] = Number(r.qtd);

  const statusDisplay: Record<string, string> = {
    emitido: 'Emitido', aguardando: 'Aguardando', recebido: 'Recebido',
    em_andamento: 'Em Andamento', pausado: 'Pausado',
    finalizado_setor: 'Finalizado no Setor', bloqueado: 'Bloqueado',
    entregue: 'Entregue',
  };

  return NextResponse.json({
    total:      Number(counts.total),
    a_produzir: Number(counts.a_produzir),
    produzindo: Number(counts.produzindo),
    atrasados:  Number(counts.atrasados),
    urgentes:   Number(counts.urgentes),
    por_setor: SETOR_CHOICES
      .map(([cod, nome]) => ({ cod, nome, qtd: setorMap[cod] ?? 0 }))
      .filter(s => s.qtd > 0),
    ultimas_movimentacoes: ultMovs.map(m => ({
      id: m.id,
      item_codigo: m.item_codigo,
      numero_pedido_venda: m.numero_pedido_venda,
      setor_destino_nome: nomeSector(m.setor_destino),
      status_anterior_display: statusDisplay[m.status_anterior] || m.status_anterior,
      status_novo_display: statusDisplay[m.status_novo] || m.status_novo,
      usuario_nome: m.usuario_nome || 'Sistema',
      criado_em: m.criado_em,
    })),
  });
  } catch (e) {
    console.error('[tv]', e);
    return NextResponse.json({ erro: 'Erro ao carregar painel' }, { status: 500 });
  }
}
