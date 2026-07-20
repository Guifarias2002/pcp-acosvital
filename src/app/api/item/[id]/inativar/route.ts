import { NextResponse } from 'next/server';
import sql from '@/lib/db';
import { autenticar, logAcesso } from '@/lib/middleware';
import { checkMutationRateLimit, getClientIp } from '@/lib/rateLimit';

export const dynamic = 'force-dynamic';

// Inativa / reativa um item (somente administrador). Item inativo é escondido de
// todas as telas do operador (filtro nas queries) e mostrado em cinza para o admin.
// Reversível — não apaga dados. Motivo é opcional.
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const user = await autenticar(req);
  if (user instanceof NextResponse) return user;
  if (!user.is_staff) return NextResponse.json({ erro: 'Sem permissao' }, { status: 403 });
  if (!checkMutationRateLimit(getClientIp(req)))
    return NextResponse.json({ erro: 'Muitas requisicoes' }, { status: 429 });

  const itemId = Number(params.id);
  if (!Number.isInteger(itemId) || itemId <= 0)
    return NextResponse.json({ erro: 'ID invalido' }, { status: 400 });

  const body = await req.json().catch(() => ({}));
  const inativo = body.inativo === true;
  const motivo = typeof body.motivo === 'string' ? body.motivo.trim().slice(0, 1000) : '';

  const [item] = await sql`SELECT id, codigo, pedido_id FROM producao_itempedido WHERE id = ${itemId}`;
  if (!item) return NextResponse.json({ erro: 'Item nao encontrado' }, { status: 404 });

  logAcesso(user, req, inativo ? 'inativar_item' : 'ativar_item');

  try {
    if (inativo) {
      await sql`
        UPDATE producao_itempedido SET
          inativo           = TRUE,
          inativado_em      = NOW(),
          inativado_por     = ${user.nome || user.username},
          motivo_inativacao = ${motivo || null},
          atualizado_em     = NOW()
        WHERE id = ${itemId}
      `;
    } else {
      await sql`
        UPDATE producao_itempedido SET
          inativo           = FALSE,
          inativado_em      = NULL,
          inativado_por     = NULL,
          motivo_inativacao = NULL,
          atualizado_em     = NOW()
        WHERE id = ${itemId}
      `;
    }
  } catch (e) {
    console.error('[POST /api/item/:id/inativar]', e);
    return NextResponse.json({ erro: 'Erro ao atualizar item', detalhe: String(e) }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    inativo,
    mensagem: inativo
      ? `Item ${item.codigo} inativado — não aparece mais para o operador.`
      : `Item ${item.codigo} reativado.`,
  });
}
