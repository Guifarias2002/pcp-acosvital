import { NextResponse } from 'next/server';
import sql from '@/lib/db';
import { autenticar } from '@/lib/middleware';

export const dynamic = 'force-dynamic';

const MESES_PT = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

// Quantidade de pedidos criados por mes (ultimos 6 meses, incluindo o atual) —
// usado no comparativo mensal da TV de movimentacao.
export async function GET(req: Request) {
  const user = await autenticar(req);
  if (user instanceof NextResponse) return user;

  const rows = await sql`
    SELECT to_char(date_trunc('month', criado_em), 'YYYY-MM') AS mes, COUNT(*)::int AS qtd
    FROM producao_pedido
    WHERE criado_em >= date_trunc('month', CURRENT_DATE) - INTERVAL '5 months'
    GROUP BY 1
    ORDER BY 1
  `;
  const porMes = new Map(rows.map(r => [r.mes as string, Number(r.qtd)]));

  const meses: { mes: string; label: string; qtd: number }[] = [];
  const hoje = new Date();
  for (let i = 5; i >= 0; i--) {
    const d = new Date(hoje.getFullYear(), hoje.getMonth() - i, 1);
    const chave = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    meses.push({
      mes: chave,
      label: `${MESES_PT[d.getMonth()]}/${String(d.getFullYear()).slice(2)}`,
      qtd: porMes.get(chave) || 0,
    });
  }

  const atual = meses[meses.length - 1].qtd;
  const anterior = meses[meses.length - 2]?.qtd ?? 0;
  const variacaoPct = anterior > 0 ? Math.round(((atual - anterior) / anterior) * 1000) / 10 : null;

  return NextResponse.json({ meses, variacao_pct: variacaoPct });
}
