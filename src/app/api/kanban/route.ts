
import { formatItem, nomeSector } from '@/lib/queries';
export async function GET(req: Request) {
export const dynamic = 'force-dynamic';
import { formatItem, nomeSector } from '@/lib/queries';
  const user = await autenticar(req);
export const dynamic = 'force-dynamic';
import { formatItem, nomeSector } from '@/lib/queries';
  if (user instanceof NextResponse) return user;
export const dynamic = 'force-dynamic';

import { formatItem, nomeSector } from '@/lib/queries';
  // Operadores veem apenas o próprio setor
export const dynamic = 'force-dynamic';
import { formatItem, nomeSector } from '@/lib/queries';
  const filtroSetor = !user.is_staff && user.setor ? user.setor : null;
export const dynamic = 'force-dynamic';

import { formatItem, nomeSector } from '@/lib/queries';
  const [itens, lotes] = await Promise.all([
export const dynamic = 'force-dynamic';
import { formatItem, nomeSector } from '@/lib/queries';
    filtroSetor
export const dynamic = 'force-dynamic';
import { formatItem, nomeSector } from '@/lib/queries';
      ? sql`
export const dynamic = 'force-dynamic';
import { formatItem, nomeSector } from '@/lib/queries';
          SELECT i.*, p.numero_pedido_venda AS pedido_numero, p.cliente AS pedido_cliente,
export const dynamic = 'force-dynamic';
import { formatItem, nomeSector } from '@/lib/queries';
                 p.prazo_entrega::text AS pedido_prazo, p.prioridade AS pedido_prioridade, p.roteiro_base
export const dynamic = 'force-dynamic';
import { formatItem, nomeSector } from '@/lib/queries';
          FROM producao_itempedido i
export const dynamic = 'force-dynamic';
import { formatItem, nomeSector } from '@/lib/queries';
          JOIN producao_pedido p ON p.id = i.pedido_id
export const dynamic = 'force-dynamic';
import { formatItem, nomeSector } from '@/lib/queries';
          WHERE i.status NOT IN ('entregue', 'emitido') AND i.setor_atual = ${filtroSetor}
export const dynamic = 'force-dynamic';
import { formatItem, nomeSector } from '@/lib/queries';
          ORDER BY p.prioridade DESC, p.prazo_entrega ASC
export const dynamic = 'force-dynamic';
import { formatItem, nomeSector } from '@/lib/queries';
        `
export const dynamic = 'force-dynamic';
import { formatItem, nomeSector } from '@/lib/queries';
      : sql`
export const dynamic = 'force-dynamic';
import { formatItem, nomeSector } from '@/lib/queries';
          SELECT i.*, p.numero_pedido_venda AS pedido_numero, p.cliente AS pedido_cliente,
export const dynamic = 'force-dynamic';
import { formatItem, nomeSector } from '@/lib/queries';
                 p.prazo_entrega::text AS pedido_prazo, p.prioridade AS pedido_prioridade, p.roteiro_base
export const dynamic = 'force-dynamic';
import { formatItem, nomeSector } from '@/lib/queries';
          FROM producao_itempedido i
export const dynamic = 'force-dynamic';
import { formatItem, nomeSector } from '@/lib/queries';
          JOIN producao_pedido p ON p.id = i.pedido_id
export const dynamic = 'force-dynamic';
import { formatItem, nomeSector } from '@/lib/queries';
          WHERE i.status NOT IN ('entregue', 'emitido')
export const dynamic = 'force-dynamic';
import { formatItem, nomeSector } from '@/lib/queries';
          ORDER BY p.prioridade DESC, p.prazo_entrega ASC
export const dynamic = 'force-dynamic';
import { formatItem, nomeSector } from '@/lib/queries';
        `,
export const dynamic = 'force-dynamic';
import { formatItem, nomeSector } from '@/lib/queries';
    filtroSetor
export const dynamic = 'force-dynamic';
import { formatItem, nomeSector } from '@/lib/queries';
      ? sql`
export const dynamic = 'force-dynamic';
import { formatItem, nomeSector } from '@/lib/queries';
          SELECT l.id, l.quantidade::text AS quantidade, l.status,
export const dynamic = 'force-dynamic';
import { formatItem, nomeSector } from '@/lib/queries';
                 l.setor_origem, l.setor_destino,
export const dynamic = 'force-dynamic';
import { formatItem, nomeSector } from '@/lib/queries';
                 i.codigo AS item_codigo, i.unidade, i.id AS item_pedido_id,
export const dynamic = 'force-dynamic';
import { formatItem, nomeSector } from '@/lib/queries';
                 p.numero_pedido_venda, p.cliente, p.prioridade,
export const dynamic = 'force-dynamic';
import { formatItem, nomeSector } from '@/lib/queries';
                 p.prazo_entrega::text AS pedido_prazo
export const dynamic = 'force-dynamic';
import { formatItem, nomeSector } from '@/lib/queries';
          FROM producao_loteitem l
export const dynamic = 'force-dynamic';
import { formatItem, nomeSector } from '@/lib/queries';
          JOIN producao_itempedido i ON i.id = l.item_pedido_id
export const dynamic = 'force-dynamic';
import { formatItem, nomeSector } from '@/lib/queries';
          JOIN producao_pedido p ON p.id = i.pedido_id
export const dynamic = 'force-dynamic';
import { formatItem, nomeSector } from '@/lib/queries';
          WHERE l.status = 'em_producao' AND l.setor_destino = ${filtroSetor}
export const dynamic = 'force-dynamic';
import { formatItem, nomeSector } from '@/lib/queries';
          ORDER BY p.prazo_entrega ASC
export const dynamic = 'force-dynamic';
import { formatItem, nomeSector } from '@/lib/queries';
        `
export const dynamic = 'force-dynamic';
import { formatItem, nomeSector } from '@/lib/queries';
      : sql`
export const dynamic = 'force-dynamic';
import { formatItem, nomeSector } from '@/lib/queries';
          SELECT l.id, l.quantidade::text AS quantidade, l.status,
export const dynamic = 'force-dynamic';
import { formatItem, nomeSector } from '@/lib/queries';
                 l.setor_origem, l.setor_destino,
export const dynamic = 'force-dynamic';
import { formatItem, nomeSector } from '@/lib/queries';
                 i.codigo AS item_codigo, i.unidade, i.id AS item_pedido_id,
export const dynamic = 'force-dynamic';
import { formatItem, nomeSector } from '@/lib/queries';
                 p.numero_pedido_venda, p.cliente, p.prioridade,
export const dynamic = 'force-dynamic';
import { formatItem, nomeSector } from '@/lib/queries';
                 p.prazo_entrega::text AS pedido_prazo
export const dynamic = 'force-dynamic';
import { formatItem, nomeSector } from '@/lib/queries';
          FROM producao_loteitem l
export const dynamic = 'force-dynamic';
import { formatItem, nomeSector } from '@/lib/queries';
          JOIN producao_itempedido i ON i.id = l.item_pedido_id
export const dynamic = 'force-dynamic';
import { formatItem, nomeSector } from '@/lib/queries';
          JOIN producao_pedido p ON p.id = i.pedido_id
export const dynamic = 'force-dynamic';
import { formatItem, nomeSector } from '@/lib/queries';
          WHERE l.status = 'em_producao'
export const dynamic = 'force-dynamic';
import { formatItem, nomeSector } from '@/lib/queries';
          ORDER BY p.prazo_entrega ASC
export const dynamic = 'force-dynamic';
import { formatItem, nomeSector } from '@/lib/queries';
        `,
export const dynamic = 'force-dynamic';
import { formatItem, nomeSector } from '@/lib/queries';
  ]);
export const dynamic = 'force-dynamic';

import { formatItem, nomeSector } from '@/lib/queries';
  const verFinanceiro = user.is_staff && user.perfil !== 'lider';
export const dynamic = 'force-dynamic';
import { formatItem, nomeSector } from '@/lib/queries';
  const setoresFiltrados = filtroSetor
export const dynamic = 'force-dynamic';
import { formatItem, nomeSector } from '@/lib/queries';
    ? SETOR_CHOICES.filter(([cod]) => cod === filtroSetor)
export const dynamic = 'force-dynamic';
import { formatItem, nomeSector } from '@/lib/queries';
    : SETOR_CHOICES;
export const dynamic = 'force-dynamic';
import { formatItem, nomeSector } from '@/lib/queries';
  const setores = setoresFiltrados.map(([cod, nome]) => ({
export const dynamic = 'force-dynamic';
import { formatItem, nomeSector } from '@/lib/queries';
    cod,
export const dynamic = 'force-dynamic';
import { formatItem, nomeSector } from '@/lib/queries';
    nome,
export const dynamic = 'force-dynamic';
import { formatItem, nomeSector } from '@/lib/queries';
    itens: itens.filter(i => i.setor_atual === cod).map(i => {
export const dynamic = 'force-dynamic';
import { formatItem, nomeSector } from '@/lib/queries';
      const item = formatItem(i);
export const dynamic = 'force-dynamic';
import { formatItem, nomeSector } from '@/lib/queries';
      return verFinanceiro ? item : { ...item, valor_unitario: null };
export const dynamic = 'force-dynamic';
import { formatItem, nomeSector } from '@/lib/queries';
    }),
export const dynamic = 'force-dynamic';
import { formatItem, nomeSector } from '@/lib/queries';
    chegando: lotes
export const dynamic = 'force-dynamic';
import { formatItem, nomeSector } from '@/lib/queries';
      .filter(l => l.setor_destino === cod)
export const dynamic = 'force-dynamic';
import { formatItem, nomeSector } from '@/lib/queries';
      .map(l => ({
export const dynamic = 'force-dynamic';
import { formatItem, nomeSector } from '@/lib/queries';
        id: l.id,
export const dynamic = 'force-dynamic';
import { formatItem, nomeSector } from '@/lib/queries';
        quantidade: l.quantidade,
export const dynamic = 'force-dynamic';
import { formatItem, nomeSector } from '@/lib/queries';
        unidade: l.unidade,
export const dynamic = 'force-dynamic';
import { formatItem, nomeSector } from '@/lib/queries';
        item_codigo: l.item_codigo,
export const dynamic = 'force-dynamic';
import { formatItem, nomeSector } from '@/lib/queries';
        item_pedido_id: l.item_pedido_id,
export const dynamic = 'force-dynamic';
import { formatItem, nomeSector } from '@/lib/queries';
        numero_pedido_venda: l.numero_pedido_venda,
export const dynamic = 'force-dynamic';
import { formatItem, nomeSector } from '@/lib/queries';
        cliente: l.cliente,
export const dynamic = 'force-dynamic';
import { formatItem, nomeSector } from '@/lib/queries';
        prioridade: l.prioridade,
export const dynamic = 'force-dynamic';
import { formatItem, nomeSector } from '@/lib/queries';
        pedido_prazo: l.pedido_prazo,
export const dynamic = 'force-dynamic';
import { formatItem, nomeSector } from '@/lib/queries';
        setor_origem: l.setor_origem,
export const dynamic = 'force-dynamic';
import { formatItem, nomeSector } from '@/lib/queries';
        setor_origem_nome: nomeSector(l.setor_origem),
export const dynamic = 'force-dynamic';
import { formatItem, nomeSector } from '@/lib/queries';
      })),
export const dynamic = 'force-dynamic';
import { formatItem, nomeSector } from '@/lib/queries';
  }));
export const dynamic = 'force-dynamic';

import { formatItem, nomeSector } from '@/lib/queries';
  return NextResponse.json({ setores });
export const dynamic = 'force-dynamic';
import { formatItem, nomeSector } from '@/lib/queries';
}
export const dynamic = 'force-dynamic';
