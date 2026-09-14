import { NextResponse } from 'next/server';
import sql from '@/lib/db';
import { autenticar, logAcesso } from '@/lib/middleware';
import { podeDefinirPrevisao } from '@/lib/auth';
import { checkMutationRateLimit, getClientIp } from '@/lib/rateLimit';

export const dynamic = 'force-dynamic';

// Define/limpa a PREVISÃO DE CONCLUSÃO do PEDIDO inteiro. Serve quando o PCP/
// líder prefere dar uma data única para o pedido em vez de peça por peça. Cada
// peça sem previsão própria herda esta. Enviar vazio/null limpa. Base do atraso.
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const user = await autenticar(req);
  if (user instanceof NextResponse) return user;
  if (!podeDefinirPrevisao(user))
    return NextResponse.json({ erro: 'Sem permissao para definir previsao' }, { status: 403 });
  if (!checkMutationRateLimit(getClientIp(req)))
    return NextResponse.json({ erro: 'Muitas requisicoes' }, { status: 429 });

  const pedidoId = Number(params.id);
  if (!Number.isInteger(pedidoId) || pedidoId <= 0)
    return NextResponse.json({ erro: 'ID invalido' }, { status: 400 });

  const body = await req.json().catch(() => ({}));
  const bruto = typeof body.previsao === 'string' ? body.previsao.trim() : '';
  if (bruto && !/^\d{4}-\d{2}-\d{2}$/.test(bruto))
    return NextResponse.json({ erro: 'Data de previsao invalida (use AAAA-MM-DD)' }, { status: 400 });
  const previsao = bruto || null;
  // Se true, aplica a mesma data a TODAS as peças do pedido (sobrescreve as
  // previsões individuais). Se false/ausente, só define no pedido (peças sem
  // previsão própria herdam).
  const aplicarNasPecas = body.aplicar_nas_pecas === true;

  const [pedido] = await sql`SELECT id, numero_pedido_venda FROM producao_pedido WHERE id = ${pedidoId}`;
  if (!pedido) return NextResponse.json({ erro: 'Pedido nao encontrado' }, { status: 404 });

  logAcesso(user, req, 'definir_previsao_pedido');

  try {
    await sql`
      UPDATE producao_pedido
      SET previsao_conclusao = ${previsao}::date, atualizado_em = NOW()
      WHERE id = ${pedidoId}
    `;
    if (aplicarNasPecas) {
      await sql`
        UPDATE producao_itempedido
        SET previsao_conclusao = ${previsao}::date, atualizado_em = NOW()
        WHERE pedido_id = ${pedidoId} AND inativo IS NOT TRUE
      `;
    }
  } catch (e) {
    console.error('[POST /api/pedidos/:id/previsao]', e);
    return NextResponse.json({ erro: 'Erro ao salvar previsao', detalhe: String(e) }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    previsao_conclusao: previsao,
    aplicado_nas_pecas: aplicarNasPecas,
    mensagem: previsao
      ? `Previsão de conclusão do pedido ${pedido.numero_pedido_venda} definida para ${previsao.split('-').reverse().join('/')}${aplicarNasPecas ? ' (aplicada em todas as peças)' : ''}.`
      : `Previsão de conclusão do pedido ${pedido.numero_pedido_venda} removida.`,
  });
}
