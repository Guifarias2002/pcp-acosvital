import { NextResponse } from 'next/server';
import sql from '@/lib/db';
import { autenticar } from '@/lib/middleware';
import { isAdministrador } from '@/lib/auth';
import { withTimeout } from '@/lib/queryTimeout';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// Lista os pedidos/produtos por trás de um número dos gráficos da Análise.
// tipo=wip     → itens parados no setor `chave` (agora)
// tipo=atraso  → itens atrasados que estão no setor `chave` (agora)
// tipo=mix     → itens do tipo de flange `chave` criados no período
export async function GET(req: Request) {
  try {
    const user = await autenticar(req);
    if (user instanceof NextResponse) return user;
    if (!isAdministrador(user)) return NextResponse.json({ erro: 'Sem permissao' }, { status: 403 });

    const url = new URL(req.url);
    const tipo = url.searchParams.get('tipo') || '';
    const chave = url.searchParams.get('chave') || '';
    const deP = url.searchParams.get('de');
    const ateP = url.searchParams.get('ate');
    if (deP && !DATE_RE.test(deP)) return NextResponse.json({ erro: 'de inválido' }, { status: 400 });
    if (ateP && !DATE_RE.test(ateP)) return NextResponse.json({ erro: 'ate inválido' }, { status: 400 });
    const hoje = new Date();
    const de = (deP ? new Date(deP + 'T00:00:00') : new Date(hoje.getFullYear(), hoje.getMonth(), 1)).toISOString();
    const ate = (ateP ? new Date(ateP + 'T23:59:59') : hoje).toISOString();

    const FLANGE = sql`COALESCE(i.fabrica,'flange') = 'flange' AND i.inativo IS NOT TRUE`;
    let q;

    if (tipo === 'wip') {
      q = sql`
        WITH ev AS (
          SELECT m.item_id, m.criado_em, COALESCE(m.setor_destino,'(nulo)') AS setor,
                 ROW_NUMBER() OVER (PARTITION BY m.item_id ORDER BY m.criado_em DESC, m.id DESC) rn
          FROM producao_movimentacaoitem m
          JOIN producao_itempedido i ON i.id = m.item_id AND ${FLANGE} AND i.status <> 'entregue')
        SELECT p.numero_pedido_venda AS pv, p.cliente, i.codigo, i.descricao, i.quantidade, i.unidade,
               ROUND((EXTRACT(EPOCH FROM (NOW() - ev.criado_em))/86400.0)::numeric, 0) AS dias
        FROM ev JOIN producao_itempedido i ON i.id = ev.item_id
        JOIN producao_pedido p ON p.id = i.pedido_id
        WHERE ev.rn = 1 AND ev.setor = ${chave}
        ORDER BY ev.criado_em ASC`;
    } else if (tipo === 'atraso') {
      q = sql`
        SELECT p.numero_pedido_venda AS pv, p.cliente, i.codigo, i.descricao, i.quantidade, i.unidade,
               p.prazo_entrega::text AS prazo
        FROM producao_pedido p JOIN producao_itempedido i ON i.pedido_id = p.id
        WHERE p.prazo_entrega < NOW()::date AND p.status <> 'entregue'
          AND ${FLANGE} AND i.status <> 'entregue' AND i.setor_atual = ${chave}
        ORDER BY p.prazo_entrega ASC`;
    } else if (tipo === 'mix') {
      q = sql`
        SELECT p.numero_pedido_venda AS pv, p.cliente, i.codigo, i.descricao, i.quantidade, i.unidade
        FROM producao_itempedido i JOIN producao_pedido p ON p.id = i.pedido_id
        WHERE ${FLANGE} AND i.criado_em BETWEEN ${de} AND ${ate} AND (CASE
          WHEN i.descricao ILIKE '%CEGO%' THEN 'Cego'
          WHEN i.descricao ILIKE '%SOBREPOSTO%' THEN 'Sobreposto'
          WHEN i.descricao ILIKE '%SOLTO%' OR i.descricao ILIKE '%PEAD%' THEN 'Solto p/ PEAD'
          WHEN i.descricao ILIKE '%PESTANA%' THEN 'Pestana'
          WHEN i.descricao ILIKE '%ANEL%' THEN 'Anel'
          WHEN i.descricao ILIKE '%DISCO%' THEN 'Disco'
          WHEN i.descricao ILIKE '%LISO%' THEN 'Liso'
          WHEN i.descricao ILIKE '%FLANGE%' THEN 'Outro flange'
          ELSE 'Não classificado' END) = ${chave}
        ORDER BY i.quantidade DESC`;
    } else {
      return NextResponse.json({ erro: 'tipo inválido' }, { status: 400 });
    }

    const rows = await withTimeout(q.catch(() => []), 20000, [q]);
    return NextResponse.json({ tipo, chave, itens: rows });
  } catch (e) {
    console.error('[analise/detalhe]', e);
    return NextResponse.json({ erro: 'Erro ao carregar detalhe' }, { status: 500 });
  }
}
