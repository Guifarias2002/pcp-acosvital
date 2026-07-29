import { NextResponse } from 'next/server';
import sql from '@/lib/db';
import { autenticar } from '@/lib/middleware';
import { checkMutationRateLimit, getClientIp } from '@/lib/rateLimit';
import { SETORES_CHECKLIST_PROCESSO, TIPOS_PRODUTO_CALDEIRARIA, getChecklistEtapa } from '@/lib/types';

export const dynamic = 'force-dynamic';

const SETORES_VALIDOS = SETORES_CHECKLIST_PROCESSO;
const TIPOS_VALIDOS = TIPOS_PRODUTO_CALDEIRARIA.map(t => t.cod);

// POST /api/parcial/[id]/checklist-processo — registra o checklist de processo
// de uma etapa da Caldeiraria (Chanfradeira/Calandra/Montagem/Solda/Acabamento/
// Pintura/Liberado/Qualidade). Sempre um INSERT novo em producao_checklist_processo
// (nunca UPDATE) — cada submissão fica preservada, mesmo que a peça passe pela
// mesma etapa mais de uma vez (retrabalho). Também grava um resumo no Histórico
// do Pedido (producao_movimentacaoitem), mesmo padrão já usado no resto do sistema.
export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const user = await autenticar(req);
    if (user instanceof NextResponse) return user;
    if (!checkMutationRateLimit(getClientIp(req)))
      return NextResponse.json({ erro: 'Muitas requisicoes' }, { status: 429 });

    const parcialId = Number(params.id);
    if (!Number.isInteger(parcialId) || parcialId <= 0)
      return NextResponse.json({ erro: 'ID inválido' }, { status: 400 });

    const body = await req.json().catch(() => ({}));
    const setor = typeof body.setor === 'string' ? body.setor : '';
    if (!SETORES_VALIDOS.includes(setor))
      return NextResponse.json({ erro: 'Setor inválido para checklist de processo' }, { status: 400 });
    const tipoProduto = TIPOS_VALIDOS.includes(body.tipo_produto) ? body.tipo_produto : null;
    const respostas = Array.isArray(body.respostas) ? body.respostas : [];
    if (respostas.length === 0)
      return NextResponse.json({ erro: 'Checklist vazio' }, { status: 400 });

    const [parcial] = await sql`
      SELECT pa.id, pa.item_pedido_id, pa.pedido_id, pa.setor_atual, i.status AS item_status, i.codigo
      FROM producao_itemparcial pa
      JOIN producao_itempedido i ON i.id = pa.item_pedido_id
      WHERE pa.id = ${parcialId}
    `;
    if (!parcial) return NextResponse.json({ erro: 'Parcial não encontrada' }, { status: 404 });

    // Valida os itens do checklist contra a definição real da etapa/tipo — não
    // aceita respostas de itens que não pertencem a essa combinação.
    const definicao = getChecklistEtapa(setor, tipoProduto);
    const idsValidos = new Set(definicao.map(d => d.id));
    const respostasValidas = respostas
      .filter((r: unknown) => r && typeof r === 'object' && idsValidos.has((r as { id?: string }).id || ''))
      .map((r: { id: string; label?: string; resposta: string; observacao?: string }) => ({
        id: r.id,
        label: definicao.find(d => d.id === r.id)?.label || r.label || r.id,
        resposta: ['confere', 'nao_confere', 'na'].includes(r.resposta) ? r.resposta : 'na',
        observacao: typeof r.observacao === 'string' ? r.observacao.trim().slice(0, 500) : '',
      }));
    if (respostasValidas.length === 0)
      return NextResponse.json({ erro: 'Nenhuma resposta válida para essa etapa/tipo de produto' }, { status: 400 });

    const [registro] = await sql`
      INSERT INTO producao_checklist_processo (item_id, parcial_id, pedido_id, setor, tipo_produto, respostas, usuario_id)
      VALUES (${parcial.item_pedido_id}, ${parcialId}, ${parcial.pedido_id}, ${setor}, ${tipoProduto}, ${JSON.stringify(respostasValidas)}, ${user.id})
      RETURNING id, criado_em
    `;

    const resumo = respostasValidas
      .map((r: { label: string; resposta: string }) => `${r.label}: ${r.resposta === 'confere' ? 'Confere' : r.resposta === 'nao_confere' ? 'Não confere' : 'Não se aplica'}`)
      .join(' · ');
    await sql`
      INSERT INTO producao_movimentacaoitem
        (item_id, pedido_id, usuario_id, setor_origem, setor_destino, status_anterior, status_novo, observacao, criado_em)
      VALUES
        (${parcial.item_pedido_id}, ${parcial.pedido_id}, ${user.id},
         ${parcial.setor_atual}, ${parcial.setor_atual},
         ${parcial.item_status}, ${parcial.item_status},
         ${`Checklist de processo (${setor}): ${resumo}`}, NOW())
    `.catch(() => {});

    return NextResponse.json({ ok: true, checklist: { id: registro.id, criado_em: registro.criado_em, respostas: respostasValidas } });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[parcial/checklist-processo]', e);
    return NextResponse.json({ erro: `Erro ao salvar checklist: ${msg}` }, { status: 500 });
  }
}
