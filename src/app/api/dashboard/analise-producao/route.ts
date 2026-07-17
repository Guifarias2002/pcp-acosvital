import { NextResponse } from 'next/server';
import sql from '@/lib/db';
import { autenticar } from '@/lib/middleware';
import { nomeSector } from '@/lib/queries';

export const dynamic = 'force-dynamic';

// Analise de producao: pedidos atrasados (prazo estourado) e parciais paradas
// ha mais tempo sem movimentacao (nenhuma acao recente) - usado na TV de
// movimentacao pra apontar onde a producao esta travando.
export async function GET(req: Request) {
  const user = await autenticar(req);
  if (user instanceof NextResponse) return user;

  const atrasados = await sql`
    SELECT id, numero_pedido_venda, cliente, prazo_entrega::text, prioridade,
           (CURRENT_DATE - prazo_entrega)::int AS dias_atraso
    FROM producao_pedido
    WHERE prazo_entrega < CURRENT_DATE AND status != 'entregue'
    ORDER BY prazo_entrega ASC
    LIMIT 8
  `;

  const parados = await sql`
    SELECT pa.id, pa.setor_atual, i.codigo,
           p.numero_pedido_venda, p.cliente,
           EXTRACT(DAY FROM (NOW() - pa.atualizado_em))::int AS dias_parado
    FROM producao_itemparcial pa
    JOIN producao_itempedido i ON i.id = pa.item_pedido_id
    JOIN producao_pedido p ON p.id = pa.pedido_id
    WHERE pa.status IN ('em_aberto', 'recebido', 'em_andamento', 'finalizado_setor', 'pausado', 'concluida')
    ORDER BY pa.atualizado_em ASC
    LIMIT 8
  `;

  return NextResponse.json({
    atrasados: atrasados.map(r => ({
      id: r.id,
      numero_pedido_venda: r.numero_pedido_venda,
      cliente: r.cliente,
      prioridade: r.prioridade,
      dias_atraso: Number(r.dias_atraso),
    })),
    parados: parados.map(r => ({
      id: r.id,
      setor: r.setor_atual,
      setor_nome: nomeSector(r.setor_atual),
      codigo: r.codigo,
      numero_pedido_venda: r.numero_pedido_venda,
      cliente: r.cliente,
      dias_parado: Number(r.dias_parado),
    })),
  });
}
