/**
 * /api/analise/estoque-destino — Análise de saídas do ESTOQUE (Flanges).
 *
 * Para cada pedido/item que SAIU do estoque, classifica o destino em duas rotas:
 *   • INSPEÇÃO (setor_destino = 'qualidade'): o flange JÁ estava pronto (feito),
 *     foi direto pra inspeção de qualidade.
 *   • CORTE (setor_destino ∈ maçarico/plasma/laser/serra): precisou FABRICAR.
 *
 * Agrupa por MÊS (fuso de São Paulo) da movimentação. Traz, por rota e por mês:
 * a contagem de pedidos, o total de FLANGES (peças) e a lista dos pedidos.
 * Peças = soma das quantidades dos itens que tomaram cada rota, deduplicando por
 * (item, mês, rota) — a movimentação não guarda quantidade, então vem do item.
 *
 *   GET → { meses: [{ mes, inspecao:{...}, corte:{...} }], ... }  (mais recente 1º)
 *
 * Acesso: podeVerAnalise (admin OU flag pode_ver_analise) — mesmo gate da Análise
 * PCP. Filtro opcional de período por mês: ?de=YYYY-MM & ?ate=YYYY-MM.
 */
import { NextResponse } from 'next/server';
import sql from '@/lib/db';
import { autenticar } from '@/lib/middleware';
import { podeVerAnalise } from '@/lib/auth';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

const MES_RE = /^\d{4}-\d{2}$/;

interface PedidoRota {
  id: number;
  numero_pedido_venda: string;
  cliente: string;
  vendedor: string;
  pecas: number;
}
interface Rota { pedidos: number; pecas: number; lista: PedidoRota[] }
interface MesBloco { mes: string; inspecao: Rota; corte: Rota }

export async function GET(req: Request) {
  try {
    const user = await autenticar(req);
    if (user instanceof NextResponse) return user;
    if (!podeVerAnalise(user))
      return NextResponse.json({ erro: 'Sem permissão para ver a análise' }, { status: 403 });

    const { searchParams } = new URL(req.url);
    const de = searchParams.get('de');
    const ate = searchParams.get('ate');
    const deOk = de && MES_RE.test(de) ? de : null;
    const ateOk = ate && MES_RE.test(ate) ? ate : null;

    // Uma linha por (mês, rota, pedido) com a soma das peças dos itens que tomaram
    // aquela rota. `base` deduplica múltiplas movimentações do mesmo item.
    const rows = await sql`
      WITH base AS (
        SELECT
          m.item_id, m.pedido_id,
          to_char(m.criado_em AT TIME ZONE 'America/Sao_Paulo', 'YYYY-MM') AS mes,
          CASE WHEN m.setor_destino = 'qualidade' THEN 'inspecao' ELSE 'corte' END AS cat
        FROM producao_movimentacaoitem m
        WHERE m.setor_origem = 'estoque'
          AND m.setor_destino IN ('qualidade', 'maçarico', 'plasma', 'laser', 'serra')
        GROUP BY m.item_id, m.pedido_id, mes, cat
      )
      SELECT
        b.mes, b.cat, b.pedido_id,
        p.numero_pedido_venda, p.cliente, p.vendedor,
        COALESCE(SUM(i.quantidade), 0)::float8 AS pecas
      FROM base b
      JOIN producao_pedido p ON p.id = b.pedido_id
      LEFT JOIN producao_itempedido i ON i.id = b.item_id
      WHERE (${deOk}::text  IS NULL OR b.mes >= ${deOk})
        AND (${ateOk}::text IS NULL OR b.mes <= ${ateOk})
      GROUP BY b.mes, b.cat, b.pedido_id, p.numero_pedido_venda, p.cliente, p.vendedor
      ORDER BY b.mes DESC, b.cat, pecas DESC
    `;

    const mapa = new Map<string, MesBloco>();
    for (const r of rows) {
      const mes = r.mes as string;
      let bloco = mapa.get(mes);
      if (!bloco) {
        bloco = { mes, inspecao: { pedidos: 0, pecas: 0, lista: [] }, corte: { pedidos: 0, pecas: 0, lista: [] } };
        mapa.set(mes, bloco);
      }
      const rota: Rota = r.cat === 'inspecao' ? bloco.inspecao : bloco.corte;
      const pecas = Number(r.pecas) || 0;
      rota.pedidos += 1;
      rota.pecas += pecas;
      rota.lista.push({
        id: r.pedido_id as number,
        numero_pedido_venda: r.numero_pedido_venda as string,
        cliente: r.cliente as string,
        vendedor: r.vendedor as string,
        pecas,
      });
    }

    return NextResponse.json({ meses: Array.from(mapa.values()) });
  } catch (e) {
    console.error('[GET /api/analise/estoque-destino]', e);
    return NextResponse.json({ erro: 'Erro ao carregar a análise de estoque' }, { status: 500 });
  }
}
