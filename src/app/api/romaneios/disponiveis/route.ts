/**
 * GET /api/romaneios/disponiveis?pv=NNN
 *
 * Itens do sistema pra montar um romaneio (modo "puxar do sistema"):
 *   - sem `pv`  → itens PRONTOS pra expedir (setor_atual em quarentena / embalagem
 *                 / logística), que é o "produto acabado" saindo da fabricação.
 *   - com `pv`  → todos os itens ativos daquele Pedido de Venda (qualquer setor),
 *                 pra quando o usuário sabe o PV e quer montar a carga por pedido.
 *
 * Devolve o formato já pronto pra virar linha de romaneio (pedido/descrição/un/qtd).
 */
import { NextResponse } from 'next/server';
import sql from '@/lib/db';
import { autenticar } from '@/lib/middleware';
import { podeVerRomaneios } from '@/lib/auth';

export const dynamic = 'force-dynamic';

const SETORES_PRONTO = ['quarentena', 'embalagem', 'logistica'];

export async function GET(req: Request) {
  try {
    const user = await autenticar(req);
    if (user instanceof NextResponse) return user;
    if (!podeVerRomaneios(user))
      return NextResponse.json({ erro: 'Sem permissão' }, { status: 403 });

    const pv = (new URL(req.url).searchParams.get('pv') || '').trim();

    const itens = pv
      ? await sql`
          SELECT i.id AS item_pedido_id, p.numero_pedido_venda AS pedido,
                 i.codigo, i.descricao, i.unidade,
                 i.quantidade::float AS quantidade, i.setor_atual
          FROM producao_itempedido i
          JOIN producao_pedido p ON p.id = i.pedido_id
          WHERE i.inativo = false AND p.numero_pedido_venda ILIKE ${'%' + pv + '%'}
          ORDER BY p.numero_pedido_venda, i.codigo
          LIMIT 300`
      : await sql`
          SELECT i.id AS item_pedido_id, p.numero_pedido_venda AS pedido,
                 i.codigo, i.descricao, i.unidade,
                 i.quantidade::float AS quantidade, i.setor_atual
          FROM producao_itempedido i
          JOIN producao_pedido p ON p.id = i.pedido_id
          WHERE i.inativo = false AND i.status <> 'entregue'
            AND i.setor_atual = ANY(${SETORES_PRONTO})
          ORDER BY p.numero_pedido_venda, i.codigo
          LIMIT 300`;

    return NextResponse.json({ itens });
  } catch (e) {
    console.error('[romaneios/disponiveis][GET]', e);
    return NextResponse.json({ erro: 'Erro ao buscar itens', itens: [] }, { status: 500 });
  }
}
