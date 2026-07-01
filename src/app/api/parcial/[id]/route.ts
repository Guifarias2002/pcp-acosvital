/**
 * GET /api/parcial/[id]
 * Retorna os detalhes de uma parcial específica, incluindo apontamentos.
 *
 * GET /api/parcial?item_id=[id]
 * (use query param item_id para listar todas as parciais de um item)
 */
import { NextResponse } from 'next/server';
import sql from '@/lib/db';
import { autenticar } from '@/lib/middleware';
import { nomeSector } from '@/lib/queries';

export const dynamic = 'force-dynamic';
export async function GET(req: Request, { params }: { params: { id: string } }) {
  const user = await autenticar(req);
  if (user instanceof NextResponse) return user;

  const parcialId = Number(params.id);
  if (!Number.isInteger(parcialId) || parcialId <= 0)
    return NextResponse.json({ erro: 'ID inválido' }, { status: 400 });

  const [parcial] = await sql`
    SELECT
      pa.*,
      pa.quantidade::text AS quantidade_str,
      i.codigo AS item_codigo, i.unidade, i.descricao AS item_descricao,
      i.quantidade::text AS item_quantidade_total,
      i.status AS item_status, i.setor_atual AS item_setor_atual,
      p.id AS pedido_id, p.numero_pedido_venda, p.numero_op, p.prazo_entrega::text AS prazo_entrega, p.cliente, p.prioridade
    FROM producao_itemparcial pa
    JOIN producao_itempedido i ON i.id = pa.item_pedido_id
    JOIN producao_pedido p ON p.id = i.pedido_id
    WHERE pa.id = ${parcialId}
  `;
  if (!parcial) return NextResponse.json({ erro: 'Parcial não encontrada' }, { status: 404 });

  if (!user.is_staff && parcial.setor_atual !== user.setor)
    return NextResponse.json({ erro: 'Acesso negado' }, { status: 403 });

  const apontamentos = await sql`
    SELECT a.*, u.nome AS usuario_nome,
           a.quantidade_apontada::text,
           a.quantidade_aprovada::text,
           a.quantidade_reprovada::text,
           a.quantidade_finalizada::text
    FROM producao_apontamento a
    LEFT JOIN usuarios_usuario u ON u.id = a.usuario_id
    WHERE a.parcial_id = ${parcialId}
    ORDER BY a.criado_em DESC
  `.catch(() => [] as Record<string, unknown>[]);

  return NextResponse.json({
    id: parcial.id,
    item_pedido_id: parcial.item_pedido_id,
    pedido_id: parcial.pedido_id,
    parcial_origem_id: parcial.parcial_origem_id ?? null,
    quantidade: parcial.quantidade_str,
    unidade: parcial.unidade,
    setor_atual: parcial.setor_atual,
    setor_atual_nome: nomeSector(parcial.setor_atual as string),
    status: parcial.status,
    observacao: parcial.observacao ?? null,
    item_codigo: parcial.item_codigo,
    item_descricao: parcial.item_descricao,
    item_quantidade_total: parcial.item_quantidade_total,
    numero_pedido_venda: parcial.numero_pedido_venda,
    numero_op: parcial.numero_op ?? null,
    prazo_entrega: parcial.prazo_entrega ?? null,
    cliente: parcial.cliente,
    criado_em: parcial.criado_em,
    atualizado_em: parcial.atualizado_em,
    apontamentos: apontamentos.map((a: Record<string, unknown>) => ({
      id: a.id,
      setor: a.setor,
      setor_nome: nomeSector(a.setor as string),
      quantidade_apontada: a.quantidade_apontada,
      quantidade_aprovada: a.quantidade_aprovada,
      quantidade_reprovada: a.quantidade_reprovada,
      quantidade_finalizada: a.quantidade_finalizada,
      status: a.status,
      usuario_nome: a.usuario_nome ?? 'Sistema',
      observacao: a.observacao ?? null,
      criado_em: a.criado_em,
    })),
  });
}