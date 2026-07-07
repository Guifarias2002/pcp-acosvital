import { NextResponse } from 'next/server';
import sql from '@/lib/db';
import { autenticar } from '@/lib/middleware';
import { checkMutationRateLimit, getClientIp } from '@/lib/rateLimit';

export const dynamic = 'force-dynamic';
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const user = await autenticar(req);
  if (user instanceof NextResponse) return user;
  if (!checkMutationRateLimit(getClientIp(req)))
    return NextResponse.json({ erro: 'Muitas requisicoes' }, { status: 429 });

  const id = Number(params.id);
  if (!Number.isInteger(id) || id <= 0)
    return NextResponse.json({ erro: 'ID invalido' }, { status: 400 });

  const [div] = await sql`SELECT * FROM producao_divergencia WHERE id = ${id}`;
  if (!div) return NextResponse.json({ erro: 'Divergencia nao encontrada' }, { status: 404 });

  // Só admin/PCP ou o setor responsável pela divergência pode alterá-la
  if (!user.is_staff && div.setor_responsavel !== user.setor)
    return NextResponse.json({ erro: 'Acesso negado' }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const { status, observacao_resolucao, prioridade, setor_responsavel } = body;

  const STATUS_VALIDOS = ['aberta', 'em_analise', 'resolvida', 'cancelada'];
  if (status && !STATUS_VALIDOS.includes(status))
    return NextResponse.json({ erro: 'status invalido' }, { status: 400 });

  const isResolvendo = status === 'resolvida' || status === 'cancelada';

  try {
    await sql`
      UPDATE producao_divergencia SET
        status               = COALESCE(${status || null}, status),
        observacao_resolucao = COALESCE(${observacao_resolucao || null}, observacao_resolucao),
        prioridade           = COALESCE(${prioridade || null}, prioridade),
        setor_responsavel    = COALESCE(${setor_responsavel || null}, setor_responsavel),
        resolvido_em         = ${isResolvendo ? sql`NOW()` : sql`resolvido_em`},
        resolvido_por_id     = ${isResolvendo ? sql`${user.id}` : sql`resolvido_por_id`},
        atualizado_em        = NOW()
      WHERE id = ${id}
    `;
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('[divergencias PATCH]', e);
    return NextResponse.json({ erro: 'Erro ao atualizar divergência' }, { status: 500 });
  }
}

export async function GET(req: Request, { params }: { params: { id: string } }) {
  const user = await autenticar(req);
  if (user instanceof NextResponse) return user;

  const id = Number(params.id);
  if (!Number.isInteger(id) || id <= 0)
    return NextResponse.json({ erro: 'ID inválido' }, { status: 400 });

  try {
    const [div] = await sql`
      SELECT
        d.*,
        p.numero_pedido_venda, p.cliente,
        i.codigo AS item_codigo, i.descricao AS item_descricao,
        u.nome AS usuario_nome,
        r.nome AS resolvido_por_nome
      FROM producao_divergencia d
      JOIN producao_pedido p ON p.id = d.pedido_id
      LEFT JOIN producao_itempedido i ON i.id = d.item_id
      LEFT JOIN usuarios_usuario u ON u.id = d.usuario_id
      LEFT JOIN usuarios_usuario r ON r.id = d.resolvido_por_id
      WHERE d.id = ${id}
    `;
    if (!div) return NextResponse.json({ erro: 'Não encontrada' }, { status: 404 });
    return NextResponse.json(div);
  } catch (e) {
    console.error('[divergencias GET]', e);
    return NextResponse.json({ erro: 'Erro ao buscar divergência' }, { status: 500 });
  }
}