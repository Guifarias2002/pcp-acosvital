import { NextResponse } from 'next/server';
import sql from '@/lib/db';
import { autenticar } from '@/lib/middleware';
import { podePlanejar } from '@/lib/auth';

export const dynamic = 'force-dynamic';

// Desfazer o encaminhamento de um pedido (caso de engano). Só planejador/admin —
// o operador NÃO tira (é ordem do Reginaldo).
export async function DELETE(req: Request, { params }: { params: { pedido: string } }) {
  const user = await autenticar(req);
  if (user instanceof NextResponse) return user;
  if (!podePlanejar(user)) return NextResponse.json({ erro: 'Sem permissao' }, { status: 403 });

  const pedidoId = Number(params.pedido);
  if (!Number.isInteger(pedidoId) || pedidoId <= 0)
    return NextResponse.json({ erro: 'Pedido inválido' }, { status: 400 });

  try {
    await sql`DELETE FROM producao_encaminhamento WHERE pedido_id = ${pedidoId}`;
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('[encaminhamentos DELETE]', e);
    return NextResponse.json({ erro: 'Erro ao desfazer' }, { status: 500 });
  }
}
