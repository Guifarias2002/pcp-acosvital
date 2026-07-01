/**
 * GET /api/parcial/[id]
 * Retorna os detalhes de uma parcial específica, incluindo apontamentos.
 *
 * GET /api/parcial?item_id=[id]
 * (use query param item_id para listar todas as parciais de um item)
 */

import { nomeSector } from '@/lib/queries';
export async function GET(req: Request, { params }: { params: { id: string } }) {
export const dynamic = 'force-dynamic';
import { nomeSector } from '@/lib/queries';
  const user = await autenticar(req);
export const dynamic = 'force-dynamic';
import { nomeSector } from '@/lib/queries';
  if (user instanceof NextResponse) return user;
export const dynamic = 'force-dynamic';

import { nomeSector } from '@/lib/queries';
  const parcialId = Number(params.id);
export const dynamic = 'force-dynamic';
import { nomeSector } from '@/lib/queries';
  if (!Number.isInteger(parcialId) || parcialId <= 0)
export const dynamic = 'force-dynamic';
import { nomeSector } from '@/lib/queries';
    return NextResponse.json({ erro: 'ID inválido' }, { status: 400 });
export const dynamic = 'force-dynamic';

import { nomeSector } from '@/lib/queries';
  const [parcial] = await sql`
export const dynamic = 'force-dynamic';
import { nomeSector } from '@/lib/queries';
    SELECT
export const dynamic = 'force-dynamic';
import { nomeSector } from '@/lib/queries';
      pa.*,
export const dynamic = 'force-dynamic';
import { nomeSector } from '@/lib/queries';
      pa.quantidade::text AS quantidade_str,
export const dynamic = 'force-dynamic';
import { nomeSector } from '@/lib/queries';
      i.codigo AS item_codigo, i.unidade, i.descricao AS item_descricao,
export const dynamic = 'force-dynamic';
import { nomeSector } from '@/lib/queries';
      i.quantidade::text AS item_quantidade_total,
export const dynamic = 'force-dynamic';
import { nomeSector } from '@/lib/queries';
      i.status AS item_status, i.setor_atual AS item_setor_atual,
export const dynamic = 'force-dynamic';
import { nomeSector } from '@/lib/queries';
      p.id AS pedido_id, p.numero_pedido_venda, p.numero_op, p.prazo_entrega::text AS prazo_entrega, p.cliente, p.prioridade
export const dynamic = 'force-dynamic';
import { nomeSector } from '@/lib/queries';
    FROM producao_itemparcial pa
export const dynamic = 'force-dynamic';
import { nomeSector } from '@/lib/queries';
    JOIN producao_itempedido i ON i.id = pa.item_pedido_id
export const dynamic = 'force-dynamic';
import { nomeSector } from '@/lib/queries';
    JOIN producao_pedido p ON p.id = i.pedido_id
export const dynamic = 'force-dynamic';
import { nomeSector } from '@/lib/queries';
    WHERE pa.id = ${parcialId}
export const dynamic = 'force-dynamic';
import { nomeSector } from '@/lib/queries';
  `;
export const dynamic = 'force-dynamic';
import { nomeSector } from '@/lib/queries';
  if (!parcial) return NextResponse.json({ erro: 'Parcial não encontrada' }, { status: 404 });
export const dynamic = 'force-dynamic';

import { nomeSector } from '@/lib/queries';
  if (!user.is_staff && parcial.setor_atual !== user.setor)
export const dynamic = 'force-dynamic';
import { nomeSector } from '@/lib/queries';
    return NextResponse.json({ erro: 'Acesso negado' }, { status: 403 });
export const dynamic = 'force-dynamic';

import { nomeSector } from '@/lib/queries';
  const apontamentos = await sql`
export const dynamic = 'force-dynamic';
import { nomeSector } from '@/lib/queries';
    SELECT a.*, u.nome AS usuario_nome,
export const dynamic = 'force-dynamic';
import { nomeSector } from '@/lib/queries';
           a.quantidade_apontada::text,
export const dynamic = 'force-dynamic';
import { nomeSector } from '@/lib/queries';
           a.quantidade_aprovada::text,
export const dynamic = 'force-dynamic';
import { nomeSector } from '@/lib/queries';
           a.quantidade_reprovada::text,
export const dynamic = 'force-dynamic';
import { nomeSector } from '@/lib/queries';
           a.quantidade_finalizada::text
export const dynamic = 'force-dynamic';
import { nomeSector } from '@/lib/queries';
    FROM producao_apontamento a
export const dynamic = 'force-dynamic';
import { nomeSector } from '@/lib/queries';
    LEFT JOIN usuarios_usuario u ON u.id = a.usuario_id
export const dynamic = 'force-dynamic';
import { nomeSector } from '@/lib/queries';
    WHERE a.parcial_id = ${parcialId}
export const dynamic = 'force-dynamic';
import { nomeSector } from '@/lib/queries';
    ORDER BY a.criado_em DESC
export const dynamic = 'force-dynamic';
import { nomeSector } from '@/lib/queries';
  `.catch(() => [] as Record<string, unknown>[]);
export const dynamic = 'force-dynamic';

import { nomeSector } from '@/lib/queries';
  return NextResponse.json({
export const dynamic = 'force-dynamic';
import { nomeSector } from '@/lib/queries';
    id: parcial.id,
export const dynamic = 'force-dynamic';
import { nomeSector } from '@/lib/queries';
    item_pedido_id: parcial.item_pedido_id,
export const dynamic = 'force-dynamic';
import { nomeSector } from '@/lib/queries';
    pedido_id: parcial.pedido_id,
export const dynamic = 'force-dynamic';
import { nomeSector } from '@/lib/queries';
    parcial_origem_id: parcial.parcial_origem_id ?? null,
export const dynamic = 'force-dynamic';
import { nomeSector } from '@/lib/queries';
    quantidade: parcial.quantidade_str,
export const dynamic = 'force-dynamic';
import { nomeSector } from '@/lib/queries';
    unidade: parcial.unidade,
export const dynamic = 'force-dynamic';
import { nomeSector } from '@/lib/queries';
    setor_atual: parcial.setor_atual,
export const dynamic = 'force-dynamic';
import { nomeSector } from '@/lib/queries';
    setor_atual_nome: nomeSector(parcial.setor_atual as string),
export const dynamic = 'force-dynamic';
import { nomeSector } from '@/lib/queries';
    status: parcial.status,
export const dynamic = 'force-dynamic';
import { nomeSector } from '@/lib/queries';
    observacao: parcial.observacao ?? null,
export const dynamic = 'force-dynamic';
import { nomeSector } from '@/lib/queries';
    item_codigo: parcial.item_codigo,
export const dynamic = 'force-dynamic';
import { nomeSector } from '@/lib/queries';
    item_descricao: parcial.item_descricao,
export const dynamic = 'force-dynamic';
import { nomeSector } from '@/lib/queries';
    item_quantidade_total: parcial.item_quantidade_total,
export const dynamic = 'force-dynamic';
import { nomeSector } from '@/lib/queries';
    numero_pedido_venda: parcial.numero_pedido_venda,
export const dynamic = 'force-dynamic';
import { nomeSector } from '@/lib/queries';
    numero_op: parcial.numero_op ?? null,
export const dynamic = 'force-dynamic';
import { nomeSector } from '@/lib/queries';
    prazo_entrega: parcial.prazo_entrega ?? null,
export const dynamic = 'force-dynamic';
import { nomeSector } from '@/lib/queries';
    cliente: parcial.cliente,
export const dynamic = 'force-dynamic';
import { nomeSector } from '@/lib/queries';
    criado_em: parcial.criado_em,
export const dynamic = 'force-dynamic';
import { nomeSector } from '@/lib/queries';
    atualizado_em: parcial.atualizado_em,
export const dynamic = 'force-dynamic';
import { nomeSector } from '@/lib/queries';
    apontamentos: apontamentos.map((a: Record<string, unknown>) => ({
export const dynamic = 'force-dynamic';
import { nomeSector } from '@/lib/queries';
      id: a.id,
export const dynamic = 'force-dynamic';
import { nomeSector } from '@/lib/queries';
      setor: a.setor,
export const dynamic = 'force-dynamic';
import { nomeSector } from '@/lib/queries';
      setor_nome: nomeSector(a.setor as string),
export const dynamic = 'force-dynamic';
import { nomeSector } from '@/lib/queries';
      quantidade_apontada: a.quantidade_apontada,
export const dynamic = 'force-dynamic';
import { nomeSector } from '@/lib/queries';
      quantidade_aprovada: a.quantidade_aprovada,
export const dynamic = 'force-dynamic';
import { nomeSector } from '@/lib/queries';
      quantidade_reprovada: a.quantidade_reprovada,
export const dynamic = 'force-dynamic';
import { nomeSector } from '@/lib/queries';
      quantidade_finalizada: a.quantidade_finalizada,
export const dynamic = 'force-dynamic';
import { nomeSector } from '@/lib/queries';
      status: a.status,
export const dynamic = 'force-dynamic';
import { nomeSector } from '@/lib/queries';
      usuario_nome: a.usuario_nome ?? 'Sistema',
export const dynamic = 'force-dynamic';
import { nomeSector } from '@/lib/queries';
      observacao: a.observacao ?? null,
export const dynamic = 'force-dynamic';
import { nomeSector } from '@/lib/queries';
      criado_em: a.criado_em,
export const dynamic = 'force-dynamic';
import { nomeSector } from '@/lib/queries';
    })),
export const dynamic = 'force-dynamic';
import { nomeSector } from '@/lib/queries';
  });
export const dynamic = 'force-dynamic';
import { nomeSector } from '@/lib/queries';
}
export const dynamic = 'force-dynamic';
