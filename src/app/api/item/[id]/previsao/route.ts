import { NextResponse } from 'next/server';
import sql from '@/lib/db';
import { autenticar, logAcesso } from '@/lib/middleware';
import { podeDefinirPrevisao } from '@/lib/auth';
import { checkMutationRateLimit, getClientIp } from '@/lib/rateLimit';

export const dynamic = 'force-dynamic';

// Define/limpa a PREVISÃO DE CONCLUSÃO de uma peça (item). É a data realista em
// que a peça fica pronta, definida pelo PCP/líder responsável (ex.: Gilmar) —
// separada do prazo_entrega (Previsão de faturamento Omie). É a base do atraso e
// da conclusão do pedido. Enviar previsao vazia/null LIMPA a previsão da peça
// (ela volta a herdar a do pedido, se houver).
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const user = await autenticar(req);
  if (user instanceof NextResponse) return user;
  if (!podeDefinirPrevisao(user))
    return NextResponse.json({ erro: 'Sem permissao para definir previsao' }, { status: 403 });
  if (!checkMutationRateLimit(getClientIp(req)))
    return NextResponse.json({ erro: 'Muitas requisicoes' }, { status: 429 });

  const itemId = Number(params.id);
  if (!Number.isInteger(itemId) || itemId <= 0)
    return NextResponse.json({ erro: 'ID invalido' }, { status: 400 });

  const body = await req.json().catch(() => ({}));
  const bruto = typeof body.previsao === 'string' ? body.previsao.trim() : '';
  // Aceita 'YYYY-MM-DD' ou vazio (limpar). Rejeita qualquer outro formato.
  if (bruto && !/^\d{4}-\d{2}-\d{2}$/.test(bruto))
    return NextResponse.json({ erro: 'Data de previsao invalida (use AAAA-MM-DD)' }, { status: 400 });
  const previsao = bruto || null;

  const [item] = await sql`SELECT id, codigo FROM producao_itempedido WHERE id = ${itemId}`;
  if (!item) return NextResponse.json({ erro: 'Item nao encontrado' }, { status: 404 });

  logAcesso(user, req, 'definir_previsao_item');

  try {
    await sql`
      UPDATE producao_itempedido
      SET previsao_conclusao = ${previsao}::date, atualizado_em = NOW()
      WHERE id = ${itemId}
    `;
  } catch (e) {
    console.error('[POST /api/item/:id/previsao]', e);
    return NextResponse.json({ erro: 'Erro ao salvar previsao', detalhe: String(e) }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    previsao_conclusao: previsao,
    mensagem: previsao
      ? `Previsão de conclusão da peça ${item.codigo} definida para ${previsao.split('-').reverse().join('/')}.`
      : `Previsão de conclusão da peça ${item.codigo} removida.`,
  });
}
