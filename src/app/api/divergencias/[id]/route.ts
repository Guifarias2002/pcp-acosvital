
import { autenticar } from '@/lib/middleware';
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
export const dynamic = 'force-dynamic';
import { autenticar } from '@/lib/middleware';
  const user = await autenticar(req);
export const dynamic = 'force-dynamic';
import { autenticar } from '@/lib/middleware';
  if (user instanceof NextResponse) return user;
export const dynamic = 'force-dynamic';

import { autenticar } from '@/lib/middleware';
  const id = Number(params.id);
export const dynamic = 'force-dynamic';
import { autenticar } from '@/lib/middleware';
  if (!Number.isInteger(id) || id <= 0)
export const dynamic = 'force-dynamic';
import { autenticar } from '@/lib/middleware';
    return NextResponse.json({ erro: 'ID invalido' }, { status: 400 });
export const dynamic = 'force-dynamic';

import { autenticar } from '@/lib/middleware';
  const [div] = await sql`SELECT * FROM producao_divergencia WHERE id = ${id}`;
export const dynamic = 'force-dynamic';
import { autenticar } from '@/lib/middleware';
  if (!div) return NextResponse.json({ erro: 'Divergencia nao encontrada' }, { status: 404 });
export const dynamic = 'force-dynamic';

import { autenticar } from '@/lib/middleware';
  // Só admin/PCP ou o setor responsável pela divergência pode alterá-la
export const dynamic = 'force-dynamic';
import { autenticar } from '@/lib/middleware';
  if (!user.is_staff && div.setor_responsavel !== user.setor)
export const dynamic = 'force-dynamic';
import { autenticar } from '@/lib/middleware';
    return NextResponse.json({ erro: 'Acesso negado' }, { status: 403 });
export const dynamic = 'force-dynamic';

import { autenticar } from '@/lib/middleware';
  const body = await req.json().catch(() => ({}));
export const dynamic = 'force-dynamic';
import { autenticar } from '@/lib/middleware';
  const { status, observacao_resolucao, prioridade, setor_responsavel } = body;
export const dynamic = 'force-dynamic';

import { autenticar } from '@/lib/middleware';
  const STATUS_VALIDOS = ['aberta', 'em_analise', 'resolvida', 'cancelada'];
export const dynamic = 'force-dynamic';
import { autenticar } from '@/lib/middleware';
  if (status && !STATUS_VALIDOS.includes(status))
export const dynamic = 'force-dynamic';
import { autenticar } from '@/lib/middleware';
    return NextResponse.json({ erro: 'status invalido' }, { status: 400 });
export const dynamic = 'force-dynamic';

import { autenticar } from '@/lib/middleware';
  const isResolvendo = status === 'resolvida' || status === 'cancelada';
export const dynamic = 'force-dynamic';

import { autenticar } from '@/lib/middleware';
  await sql`
export const dynamic = 'force-dynamic';
import { autenticar } from '@/lib/middleware';
    UPDATE producao_divergencia SET
export const dynamic = 'force-dynamic';
import { autenticar } from '@/lib/middleware';
      status               = COALESCE(${status || null}, status),
export const dynamic = 'force-dynamic';
import { autenticar } from '@/lib/middleware';
      observacao_resolucao = COALESCE(${observacao_resolucao || null}, observacao_resolucao),
export const dynamic = 'force-dynamic';
import { autenticar } from '@/lib/middleware';
      prioridade           = COALESCE(${prioridade || null}, prioridade),
export const dynamic = 'force-dynamic';
import { autenticar } from '@/lib/middleware';
      setor_responsavel    = COALESCE(${setor_responsavel || null}, setor_responsavel),
export const dynamic = 'force-dynamic';
import { autenticar } from '@/lib/middleware';
      resolvido_em         = ${isResolvendo ? sql`NOW()` : sql`resolvido_em`},
export const dynamic = 'force-dynamic';
import { autenticar } from '@/lib/middleware';
      resolvido_por_id     = ${isResolvendo ? sql`${user.id}` : sql`resolvido_por_id`},
export const dynamic = 'force-dynamic';
import { autenticar } from '@/lib/middleware';
      atualizado_em        = NOW()
export const dynamic = 'force-dynamic';
import { autenticar } from '@/lib/middleware';
    WHERE id = ${id}
export const dynamic = 'force-dynamic';
import { autenticar } from '@/lib/middleware';
  `;
export const dynamic = 'force-dynamic';

import { autenticar } from '@/lib/middleware';
  return NextResponse.json({ ok: true });
export const dynamic = 'force-dynamic';
import { autenticar } from '@/lib/middleware';
}
export const dynamic = 'force-dynamic';

import { autenticar } from '@/lib/middleware';
export async function GET(req: Request, { params }: { params: { id: string } }) {
export const dynamic = 'force-dynamic';
import { autenticar } from '@/lib/middleware';
  const user = await autenticar(req);
export const dynamic = 'force-dynamic';
import { autenticar } from '@/lib/middleware';
  if (user instanceof NextResponse) return user;
export const dynamic = 'force-dynamic';

import { autenticar } from '@/lib/middleware';
  const id = Number(params.id);
export const dynamic = 'force-dynamic';
import { autenticar } from '@/lib/middleware';
  const [div] = await sql`
export const dynamic = 'force-dynamic';
import { autenticar } from '@/lib/middleware';
    SELECT
export const dynamic = 'force-dynamic';
import { autenticar } from '@/lib/middleware';
      d.*,
export const dynamic = 'force-dynamic';
import { autenticar } from '@/lib/middleware';
      p.numero_pedido_venda, p.cliente,
export const dynamic = 'force-dynamic';
import { autenticar } from '@/lib/middleware';
      i.codigo AS item_codigo, i.descricao AS item_descricao,
export const dynamic = 'force-dynamic';
import { autenticar } from '@/lib/middleware';
      u.nome AS usuario_nome,
export const dynamic = 'force-dynamic';
import { autenticar } from '@/lib/middleware';
      r.nome AS resolvido_por_nome
export const dynamic = 'force-dynamic';
import { autenticar } from '@/lib/middleware';
    FROM producao_divergencia d
export const dynamic = 'force-dynamic';
import { autenticar } from '@/lib/middleware';
    JOIN producao_pedido p ON p.id = d.pedido_id
export const dynamic = 'force-dynamic';
import { autenticar } from '@/lib/middleware';
    LEFT JOIN producao_itempedido i ON i.id = d.item_id
export const dynamic = 'force-dynamic';
import { autenticar } from '@/lib/middleware';
    LEFT JOIN usuarios_usuario u ON u.id = d.usuario_id
export const dynamic = 'force-dynamic';
import { autenticar } from '@/lib/middleware';
    LEFT JOIN usuarios_usuario r ON r.id = d.resolvido_por_id
export const dynamic = 'force-dynamic';
import { autenticar } from '@/lib/middleware';
    WHERE d.id = ${id}
export const dynamic = 'force-dynamic';
import { autenticar } from '@/lib/middleware';
  `;
export const dynamic = 'force-dynamic';
import { autenticar } from '@/lib/middleware';
  if (!div) return NextResponse.json({ erro: 'Nao encontrada' }, { status: 404 });
export const dynamic = 'force-dynamic';
import { autenticar } from '@/lib/middleware';
  return NextResponse.json(div);
export const dynamic = 'force-dynamic';
import { autenticar } from '@/lib/middleware';
}
export const dynamic = 'force-dynamic';
