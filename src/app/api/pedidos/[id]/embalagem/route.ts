import { NextResponse } from 'next/server';
import sql from '@/lib/db';
import { autenticar } from '@/lib/middleware';
import { podeAcessarSetor } from '@/lib/auth';
import { checkMutationRateLimit, getClientIp } from '@/lib/rateLimit';

export const dynamic = 'force-dynamic';

/**
 * PATCH /api/pedidos/[id]/embalagem
 * Salva o resumo consolidado da Embalagem de um pedido (opcional; complementa o
 * peso lançado por parcial). Body: { identificacao?, qtd_pallets?, peso_total?,
 * total_unidades? }. Campos vazios são gravados como NULL.
 */
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const user = await autenticar(req);
  if (user instanceof NextResponse) return user;
  if (!checkMutationRateLimit(getClientIp(req)))
    return NextResponse.json({ erro: 'Muitas requisicoes' }, { status: 429 });

  const pedidoId = Number(params.id);
  if (!Number.isInteger(pedidoId) || pedidoId <= 0)
    return NextResponse.json({ erro: 'ID inválido' }, { status: 400 });

  // Só quem edita a Embalagem (ou admin) pode gravar o resumo.
  if (!user.is_staff && !podeAcessarSetor(user, 'embalagem'))
    return NextResponse.json({ erro: 'Acesso negado' }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const ident = String(body.identificacao ?? '').trim().slice(0, 100) || null;
  const num = (v: unknown): number | null => {
    const n = Number(v);
    return Number.isFinite(n) && n >= 0 ? n : null;
  };
  const qtdPallets = num(body.qtd_pallets);
  const pesoTotal = num(body.peso_total);
  const totalUnidades = num(body.total_unidades);

  const [pedido] = await sql`SELECT id FROM producao_pedido WHERE id = ${pedidoId}`;
  if (!pedido) return NextResponse.json({ erro: 'Pedido não encontrado' }, { status: 404 });

  await sql`
    UPDATE producao_pedido
    SET embalagem_identificacao  = ${ident},
        embalagem_qtd_pallets    = ${qtdPallets != null ? Math.round(qtdPallets) : null},
        embalagem_peso_total     = ${pesoTotal},
        embalagem_total_unidades = ${totalUnidades != null ? Math.round(totalUnidades) : null}
    WHERE id = ${pedidoId}
  `;

  return NextResponse.json({
    ok: true,
    identificacao: ident, qtd_pallets: qtdPallets, peso_total: pesoTotal, total_unidades: totalUnidades,
  });
}
