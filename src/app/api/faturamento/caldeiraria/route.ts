/**
 * /api/faturamento/caldeiraria?mes=YYYY-MM — itens do PCP Caldeiraria do mês, p/ o
 * relatório mensal de faturamento (Análise PCP → Faturamento) somar à planilha Omie.
 * Mês do item = chegada na Caldeiraria (1ª entrada numa etapa), igual à tela
 * Valores por Mês; sem chegada → criado_em. Cancelados ficam de fora.
 * Gate: quem vê a Análise PCP (ou Valores por Mês). Ver [[project_faturamento_mensal]].
 */
import { NextResponse } from 'next/server';
import sql from '@/lib/db';
import { autenticar } from '@/lib/middleware';
import { podeVerAnalise, podeVerValoresMes } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  try {
    const user = await autenticar(req);
    if (user instanceof NextResponse) return user;
    if (!podeVerAnalise(user) && !podeVerValoresMes(user)) return NextResponse.json({ erro: 'Sem permissão' }, { status: 403 });
    const mes = new URL(req.url).searchParams.get('mes') || '';
    if (!/^\d{4}-\d{2}$/.test(mes)) return NextResponse.json({ erro: 'Mês inválido (use AAAA-MM)' }, { status: 400 });

    const itens = await sql`
      SELECT * FROM (
        SELECT i.pedido, i.cliente, i.material, i.valor::float8 AS valor, i.empresa, i.status,
               i.finalizado_em::text AS finalizado_em,
               LEFT(COALESCE((SELECT MIN(e.entrada)::text FROM producao_cald_plano_etapa e WHERE e.item_id = i.id), i.criado_em::text), 7) AS mes
        FROM producao_cald_plano_item i
        WHERE i.status <> 'cancelado'
      ) x WHERE x.mes = ${mes}
      ORDER BY x.pedido`;
    return NextResponse.json({ itens });
  } catch (e) {
    console.error('faturamento/caldeiraria', e);
    return NextResponse.json({ erro: 'Erro ao buscar a Caldeiraria do mês' }, { status: 500 });
  }
}
