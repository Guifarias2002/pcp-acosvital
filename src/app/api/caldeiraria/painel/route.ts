import { NextResponse } from 'next/server';
import sql from '@/lib/db';
import { autenticar } from '@/lib/middleware';
import { withTimeout } from '@/lib/queryTimeout';
import { SETORES_EXCLUSIVOS_CALDEIRARIA } from '@/lib/types';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

// Parciais "ativas" — MESMO conjunto do Kanban (inclui 'concluida': peça
// finalizada no setor mas ainda fisicamente lá, aguardando ir pro próximo).
// Assim o Painel é um espelho fiel de ONDE a peça realmente está.
const STATUS_PARCIAL_ATIVA = ['em_aberto', 'recebido', 'em_andamento', 'finalizado_setor', 'pausado', 'concluida'];

// Setores que marcam um pedido como "de Caldeiraria": o Recebimento
// ('caldeiraria') + todos os exclusivos da Caldeiraria (cald_*, legado etc. —
// que por definição não vazam pro Flange, ver types). Se o roteiro cruza
// qualquer um deles, é OP de Caldeiraria — robusto a o operador editar o
// roteiro na abertura (ex.: tirar o Recebimento mas manter as etapas do
// processo). Deduplicado pra virar um array literal do Postgres.
const SETORES_CALDEIRARIA = Array.from(new Set(['caldeiraria', ...SETORES_EXCLUSIVOS_CALDEIRARIA]));

// Datas DATE chegam como texto 'AAAA-MM-DD' (via ::text) ou como Date do driver.
// Normaliza pra ISO 'AAAA-MM-DD' sem passar por new Date() (evita o -1 dia de
// fuso). O front formata pt-BR só na exibição.
function iso(v: unknown): string | null {
  if (!v) return null;
  if (v instanceof Date) return isNaN(v.getTime()) ? null : v.toISOString().slice(0, 10);
  const s = String(v).trim();
  return s ? s.slice(0, 10) : null;
}

// ── Painel da Caldeiraria (PCP) ──────────────────────────────────────────────
// Uma linha por OP/pedido da Caldeiraria com a TRILHA do roteiro e onde a peça
// está agora — a visão "onde está cada pedido" que o Kanban (por coluna) não
// dá de relance. Pedido "de Caldeiraria" = nasceu com 'caldeiraria' no
// roteiro_base (inclui os "casca" do PCP HRM, ainda sem item) OU tem item ativo
// com fabrica='caldeiraria'. Mesmo critério do `envolve_caldeiraria` em queries.
export async function GET(req: Request) {
  const user = await autenticar(req);
  if (user instanceof NextResponse) return user;
  // Overview de PCP — só staff (admin/PCP). Operador usa a tela do próprio setor.
  if (!user.is_staff) return NextResponse.json({ erro: 'Sem permissao' }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const incluirEntregues = searchParams.get('entregues') === '1';

  try {
    const rows = await withTimeout(sql`
      SELECT p.id, p.numero_pedido_venda, p.numero_op, p.cliente, p.prioridade, p.status,
             p.setor_atual, p.roteiro_base,
             p.prazo_entrega::text        AS prazo_entrega,
             p.previsao_conclusao::text   AS previsao_conclusao,
             p.entrega_contratual::text   AS entrega_contratual,
             p.numero_pedido_cliente,
             p.criado_em,
             (SELECT MAX(i2.previsao_conclusao)::text
                FROM producao_itempedido i2
               WHERE i2.pedido_id = p.id AND i2.inativo = false) AS item_previsao_max,
             COALESCE((
               SELECT json_agg(DISTINCT pa.setor_atual)
                 FROM producao_itemparcial pa
                 JOIN producao_itempedido ii ON ii.id = pa.item_pedido_id
                WHERE ii.pedido_id = p.id AND ii.inativo = false
                  AND pa.status = ANY(${STATUS_PARCIAL_ATIVA})
             ), '[]'::json) AS setores_atuais
      FROM producao_pedido p
      WHERE (${incluirEntregues} OR p.status != 'entregue')
        AND (
          p.roteiro_base && ${SETORES_CALDEIRARIA}::text[]
          OR EXISTS (
            SELECT 1 FROM producao_itempedido pi
             WHERE pi.pedido_id = p.id AND pi.inativo = false AND pi.fabrica = 'caldeiraria'
          )
        )
      ORDER BY CASE p.prioridade WHEN 'urgente' THEN 1 WHEN 'alta' THEN 2 WHEN 'normal' THEN 3 ELSE 4 END,
               p.prazo_entrega ASC NULLS LAST,
               p.id DESC
    `, 27000);

    const pedidos = rows.map(r => {
      // Previsão de conclusão efetiva = a do pedido (definida pelo PCP) ou a
      // MAIOR entre as peças (pedido pronto quando a última peça fica pronta).
      const prevEfetiva = iso(r.previsao_conclusao) || iso(r.item_previsao_max) || null;
      const setoresAtuais = ((r.setores_atuais as string[]) || []).filter(Boolean);
      return {
        id: r.id as number,
        numero: r.numero_pedido_venda as string,
        numero_op: (r.numero_op as string) || '',
        cliente: r.cliente as string,
        prioridade: r.prioridade as string,
        status: r.status as string,
        roteiro: (r.roteiro_base as string[]) || [],
        setores_atuais: setoresAtuais,
        setor_atual: (r.setor_atual as string) || '',
        prazo_iso: iso(r.prazo_entrega),
        previsao_iso: prevEfetiva,
        entrega_contratual_iso: iso(r.entrega_contratual),
        numero_pedido_cliente: (r.numero_pedido_cliente as string) || null,
      };
    });

    return NextResponse.json({ pedidos, total: pedidos.length });
  } catch (e) {
    console.error('[caldeiraria/painel GET]', e);
    return NextResponse.json({ erro: 'Erro ao carregar o painel da Caldeiraria' }, { status: 500 });
  }
}
