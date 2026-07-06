import { NextResponse } from 'next/server';
import sql from '@/lib/db';
import { autenticar } from '@/lib/middleware';
import { SETOR_CHOICES } from '@/lib/types';
import { formatItem, nomeSector } from '@/lib/queries';
import { withTimeout } from '@/lib/queryTimeout';

export const dynamic = 'force-dynamic';
export async function GET(req: Request) {
  try {
  const user = await autenticar(req);
  if (user instanceof NextResponse) return user;

  // Operadores veem apenas o próprio setor
  const filtroSetor = !user.is_staff && user.setor ? user.setor : null;

  const qItens =
    filtroSetor
      ? sql`
          SELECT i.*, p.numero_pedido_venda AS pedido_numero, p.cliente AS pedido_cliente,
                 p.prazo_entrega::text AS pedido_prazo, p.prioridade AS pedido_prioridade, p.roteiro_base
          FROM producao_itempedido i
          JOIN producao_pedido p ON p.id = i.pedido_id
          WHERE i.status NOT IN ('entregue', 'emitido') AND i.setor_atual = ${filtroSetor}
          ORDER BY p.prioridade DESC, p.prazo_entrega ASC
        `
      : sql`
          SELECT i.*, p.numero_pedido_venda AS pedido_numero, p.cliente AS pedido_cliente,
                 p.prazo_entrega::text AS pedido_prazo, p.prioridade AS pedido_prioridade, p.roteiro_base
          FROM producao_itempedido i
          JOIN producao_pedido p ON p.id = i.pedido_id
          WHERE i.status NOT IN ('entregue', 'emitido')
          ORDER BY p.prioridade DESC, p.prazo_entrega ASC
        `;

  const qLotes =
    filtroSetor
      ? sql`
          SELECT l.id, l.quantidade::text AS quantidade, l.status,
                 l.setor_origem, l.setor_destino,
                 i.codigo AS item_codigo, i.unidade, i.id AS item_pedido_id,
                 p.numero_pedido_venda, p.cliente, p.prioridade,
                 p.prazo_entrega::text AS pedido_prazo
          FROM producao_loteitem l
          JOIN producao_itempedido i ON i.id = l.item_pedido_id
          JOIN producao_pedido p ON p.id = i.pedido_id
          WHERE l.status = 'em_producao' AND l.setor_destino = ${filtroSetor}
          ORDER BY p.prazo_entrega ASC
        `
      : sql`
          SELECT l.id, l.quantidade::text AS quantidade, l.status,
                 l.setor_origem, l.setor_destino,
                 i.codigo AS item_codigo, i.unidade, i.id AS item_pedido_id,
                 p.numero_pedido_venda, p.cliente, p.prioridade,
                 p.prazo_entrega::text AS pedido_prazo
          FROM producao_loteitem l
          JOIN producao_itempedido i ON i.id = l.item_pedido_id
          JOIN producao_pedido p ON p.id = i.pedido_id
          WHERE l.status = 'em_producao'
          ORDER BY p.prazo_entrega ASC
        `;

  const [itens, lotes] = await withTimeout(
    Promise.all([qItens, qLotes]),
    27000, // 27s — Vercel mata em 30s (temporario, ver vercel.json)
    [qItens, qLotes],
  );

  const verFinanceiro = user.is_staff && user.perfil !== 'lider';
  const setoresFiltrados = filtroSetor
    ? SETOR_CHOICES.filter(([cod]) => cod === filtroSetor)
    : SETOR_CHOICES;
  const setores = setoresFiltrados.map(([cod, nome]) => ({
    cod,
    nome,
    itens: itens.filter(i => i.setor_atual === cod).map(i => {
      const item = formatItem(i);
      return verFinanceiro ? item : { ...item, valor_unitario: null };
    }),
    chegando: lotes
      .filter(l => l.setor_destino === cod)
      .map(l => ({
        id: l.id,
        quantidade: l.quantidade,
        unidade: l.unidade,
        item_codigo: l.item_codigo,
        item_pedido_id: l.item_pedido_id,
        numero_pedido_venda: l.numero_pedido_venda,
        cliente: l.cliente,
        prioridade: l.prioridade,
        pedido_prazo: l.pedido_prazo,
        setor_origem: l.setor_origem,
        setor_origem_nome: nomeSector(l.setor_origem),
      })),
  }));

  return NextResponse.json({ setores });
  } catch (e) {
    console.error('[kanban]', e);
    return NextResponse.json({ erro: 'Erro ao carregar kanban' }, { status: 500 });
  }
}