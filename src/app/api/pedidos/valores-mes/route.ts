/**
 * /api/pedidos/valores-mes — Relatório "Valores por Mês" (PRIVADO do Guilherme).
 *
 * Traz TODOS os pedidos (desde o início), com o VALOR de cada um, agrupados pelo
 * MÊS de emissão (data_emissao). Serve pro acompanhamento financeiro consolidado
 * — quanto foi lançado por mês, e a lista dos pedidos que compõem cada mês.
 * Acesso restrito por login (podeVerValoresMes) — mesmo gate no back (aqui) e no
 * front (página + botão na aba "Todos os Pedidos").
 *
 *   GET → { meses: [...], total_geral, count_geral, pecas_geral }
 *
 * Cada mês traz o total (valor), a contagem de pedidos, o total de PEÇAS (soma das
 * quantidades dos itens), a quebra POR CLIENTE (pedidos + peças + valor de cada um)
 * e a lista detalhada dos pedidos. Valor do pedido = valor_total gravado (soma dos
 * itens, mantido na criação/edição); quando nulo (pedidos antigos/casca), cai no
 * cálculo ao vivo da soma dos itens. Peças = SUM(quantidade) dos itens ativos.
 * Filtros opcionais de período por mês: ?de=YYYY-MM & ?ate=YYYY-MM.
 */
import { NextResponse } from 'next/server';
import sql from '@/lib/db';
import { autenticar } from '@/lib/middleware';
import { podeVerValoresMes } from '@/lib/auth';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

const MES_RE = /^\d{4}-\d{2}$/;

export async function GET(req: Request) {
  try {
    const user = await autenticar(req);
    if (user instanceof NextResponse) return user;
    if (!podeVerValoresMes(user))
      return NextResponse.json({ erro: 'Sem permissão para ver os valores por mês' }, { status: 403 });

    const { searchParams } = new URL(req.url);
    const de = searchParams.get('de');   // 'YYYY-MM' (mês inicial, inclusive)
    const ate = searchParams.get('ate'); // 'YYYY-MM' (mês final, inclusive)
    const deOk = de && MES_RE.test(de) ? de : null;
    const ateOk = ate && MES_RE.test(ate) ? ate : null;
    // com_itens=1: anexa os PRODUTOS (itens) de cada pedido — usado só na
    // exportação "com produto" do Excel (na tela normal não é necessário).
    const comItens = searchParams.get('com_itens') === '1';

    // Uma linha por pedido, com o mês de emissão, valor e peças. A soma dos itens
    // (valor e quantidade) vem de um LEFT JOIN agregado; o valor cai na soma só
    // quando valor_total é NULL (COALESCE distingue "sem valor gravado" de "zero").
    const rows = await sql`
      SELECT
        p.id,
        p.numero_pedido_venda,
        p.numero_op,
        p.cliente,
        p.vendedor,
        p.status,
        p.data_emissao::text                          AS data_emissao,
        to_char(p.data_emissao, 'YYYY-MM')            AS mes,
        COALESCE(p.valor_total, agg.valor_itens, 0)::float8  AS valor,
        COALESCE(agg.pecas, 0)::float8                       AS pecas
      FROM producao_pedido p
      LEFT JOIN (
        SELECT pedido_id,
               SUM(quantidade * COALESCE(valor_unitario, 0)) AS valor_itens,
               SUM(quantidade)                               AS pecas
        FROM producao_itempedido
        WHERE inativo = false
        GROUP BY pedido_id
      ) agg ON agg.pedido_id = p.id
      WHERE p.data_emissao IS NOT NULL
        AND (${deOk}::text  IS NULL OR to_char(p.data_emissao, 'YYYY-MM') >= ${deOk})
        AND (${ateOk}::text IS NULL OR to_char(p.data_emissao, 'YYYY-MM') <= ${ateOk})
      ORDER BY p.data_emissao DESC, p.id DESC
    `;

    interface ClienteAgg { cliente: string; count: number; pecas: number; valor: number }
    interface ItemProduto {
      codigo: string;
      descricao: string;
      unidade: string;
      quantidade: number;
      valor_unitario: number;
      valor: number;
    }
    interface PedidoLinha {
      id: number;
      numero_pedido_venda: string;
      numero_op: string;
      cliente: string;
      vendedor: string;
      status: string;
      data_emissao: string;
      valor: number;
      pecas: number;
      itens?: ItemProduto[];
    }
    interface Bloco {
      mes: string;
      total: number;
      count: number;
      pecas: number;
      por_cliente: ClienteAgg[];
      pedidos: PedidoLinha[];
    }

    // Agrupa por mês (mais recente primeiro) e, dentro do mês, por cliente.
    const mapa = new Map<string, Bloco>();
    const clientesPorMes = new Map<string, Map<string, ClienteAgg>>();
    const pedidosById = new Map<number, PedidoLinha>();

    let total_geral = 0;
    let pecas_geral = 0;
    for (const r of rows) {
      const mes = r.mes as string;
      const valor = Number(r.valor) || 0;
      const pecas = Number(r.pecas) || 0;
      const cliente = (r.cliente as string) || '(sem cliente)';
      total_geral += valor;
      pecas_geral += pecas;

      let bloco = mapa.get(mes);
      if (!bloco) {
        bloco = { mes, total: 0, count: 0, pecas: 0, por_cliente: [], pedidos: [] };
        mapa.set(mes, bloco);
        clientesPorMes.set(mes, new Map());
      }
      bloco.total += valor;
      bloco.count += 1;
      bloco.pecas += pecas;
      const pl: PedidoLinha = {
        id: r.id as number,
        numero_pedido_venda: r.numero_pedido_venda as string,
        numero_op: r.numero_op as string,
        cliente,
        vendedor: r.vendedor as string,
        status: r.status as string,
        data_emissao: r.data_emissao as string,
        valor,
        pecas,
        ...(comItens ? { itens: [] } : {}),
      };
      bloco.pedidos.push(pl);
      pedidosById.set(pl.id, pl);

      const cmap = clientesPorMes.get(mes)!;
      let ca = cmap.get(cliente);
      if (!ca) { ca = { cliente, count: 0, pecas: 0, valor: 0 }; cmap.set(cliente, ca); }
      ca.count += 1;
      ca.pecas += pecas;
      ca.valor += valor;
    }

    // Anexa a quebra por cliente ordenada por valor (maior primeiro).
    mapa.forEach((bloco, mes) => {
      bloco.por_cliente = Array.from(clientesPorMes.get(mes)!.values())
        .sort((a, b) => b.valor - a.valor);
    });

    // Exportação "com produto": busca os itens de todos os pedidos do período e
    // anexa a cada pedido (uma linha por produto no Excel).
    if (comItens && pedidosById.size > 0) {
      const ids = Array.from(pedidosById.keys());
      const itemRows = await sql`
        SELECT pedido_id, codigo, descricao, unidade,
               quantidade::float8                                  AS quantidade,
               COALESCE(valor_unitario, 0)::float8                 AS valor_unitario,
               (quantidade * COALESCE(valor_unitario, 0))::float8  AS valor
        FROM producao_itempedido
        WHERE pedido_id = ANY(${ids}) AND inativo = false
        ORDER BY pedido_id, id
      `;
      for (const it of itemRows) {
        const pl = pedidosById.get(it.pedido_id as number);
        if (pl?.itens) {
          pl.itens.push({
            codigo: (it.codigo as string) || '',
            descricao: (it.descricao as string) || '',
            unidade: (it.unidade as string) || '',
            quantidade: Number(it.quantidade) || 0,
            valor_unitario: Number(it.valor_unitario) || 0,
            valor: Number(it.valor) || 0,
          });
        }
      }
    }

    return NextResponse.json({
      meses: Array.from(mapa.values()),
      total_geral,
      pecas_geral,
      count_geral: rows.length,
    });
  } catch (e) {
    console.error('[GET /api/pedidos/valores-mes]', e);
    return NextResponse.json({ erro: 'Erro ao carregar os valores por mês' }, { status: 500 });
  }
}
