import { NextResponse } from 'next/server';
import sql from '@/lib/db';
import { autenticar } from '@/lib/middleware';
import { podeAcessarHrm } from '@/lib/auth';

export const dynamic = 'force-dynamic';

// PATCH — marca que o PCP INICIOU a conferência desta OP (pedido "casca" do HRM).
// Só grava se ainda não foi iniciada (guarda IS NULL), pra manter quem começou
// primeiro — evita dois conferindo a mesma OP. Ver a lista em /pcp-hrm/conferencia.
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const user = await autenticar(req);
  if (user instanceof NextResponse) return user;
  if (!podeAcessarHrm(user)) return NextResponse.json({ erro: 'Acesso negado' }, { status: 403 });

  const id = Number(params.id);
  if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ erro: 'ID inválido' }, { status: 400 });

  const rows = await sql`
    UPDATE producao_pedido
       SET conferencia_iniciada_em = NOW(),
           conferencia_iniciada_por = ${user.nome || user.username || null}
     WHERE id = ${id}
       AND conferencia_iniciada_em IS NULL
    RETURNING conferencia_iniciada_em, conferencia_iniciada_por
  `;

  // Já estava iniciada (ou id não existe): devolve o estado atual, sem erro —
  // a tela só precisa saber quem/quando pra mostrar "em conferência".
  if (rows.length === 0) {
    const atual = await sql`
      SELECT conferencia_iniciada_em, conferencia_iniciada_por
      FROM producao_pedido WHERE id = ${id}
    `;
    if (atual.length === 0) return NextResponse.json({ erro: 'Pedido não encontrado' }, { status: 404 });
    return NextResponse.json({ ok: true, ja_iniciada: true, ...atual[0] });
  }

  return NextResponse.json({ ok: true, ...rows[0] });
}
