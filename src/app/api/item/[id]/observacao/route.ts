import { NextResponse } from 'next/server';
import sql from '@/lib/db';
import { autenticar } from '@/lib/middleware';

export const dynamic = 'force-dynamic';

// POST /api/item/[id]/observacao — adiciona uma observação ao histórico do item
export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const user = await autenticar(req);
    if (user instanceof NextResponse) return user;

    const itemId = Number(params.id);
    if (!Number.isInteger(itemId) || itemId <= 0)
      return NextResponse.json({ erro: 'ID inválido' }, { status: 400 });

    const body = await req.json().catch(() => ({}));
    const texto = typeof body.texto === 'string' ? body.texto.trim().slice(0, 2000) : '';
    if (!texto) return NextResponse.json({ erro: 'Texto da observação é obrigatório' }, { status: 400 });

    const [item] = await sql`
      SELECT i.setor_atual, i.pedido_id
      FROM producao_itempedido i
      WHERE i.id = ${itemId}
    `;
    if (!item) return NextResponse.json({ erro: 'Item não encontrado' }, { status: 404 });

    if (!user.is_staff && user.setor !== item.setor_atual)
      return NextResponse.json({ erro: 'Sem permissao' }, { status: 403 });

    const [obs] = await sql`
      INSERT INTO producao_item_observacao (item_id, pedido_id, setor, usuario_id, texto)
      VALUES (${itemId}, ${item.pedido_id}, ${item.setor_atual}, ${user.id}, ${texto})
      RETURNING id, setor, texto, criado_em
    `;

    return NextResponse.json({ ok: true, observacao: { ...obs, usuario_nome: user.nome } });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[item/observacao]', e);
    return NextResponse.json({ erro: `Erro ao salvar observação: ${msg}` }, { status: 500 });
  }
}
