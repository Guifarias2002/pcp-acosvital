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
import { podeAcessarSetor } from '@/lib/auth';
import { nomeSector } from '@/lib/queries';
import { checkMutationRateLimit, getClientIp } from '@/lib/rateLimit';

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

  if (!user.is_staff && !podeAcessarSetor(user, parcial.setor_atual))
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
    pesos_pallets: Array.isArray(parcial.pesos_pallets) ? (parcial.pesos_pallets as unknown[]).map(v => Number(v)) : [],
    nomes_pallets: Array.isArray(parcial.nomes_pallets) ? (parcial.nomes_pallets as unknown[]).map(v => String(v)) : [],
    fotos: Array.isArray(parcial.fotos) ? (parcial.fotos as string[]) : [],
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

/**
 * PATCH /api/parcial/[id]
 * Atualiza o peso da embalagem da parcial — lista de pesos (kg), um por pallet.
 * Usado pelo setor de Embalagem. Body: { pesos_pallets: number[] }
 */
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const user = await autenticar(req);
  if (user instanceof NextResponse) return user;
  if (!checkMutationRateLimit(getClientIp(req)))
    return NextResponse.json({ erro: 'Muitas requisicoes' }, { status: 429 });

  const parcialId = Number(params.id);
  if (!Number.isInteger(parcialId) || parcialId <= 0)
    return NextResponse.json({ erro: 'ID inválido' }, { status: 400 });

  const body = await req.json().catch(() => ({}));
  if (!Array.isArray(body.pesos_pallets))
    return NextResponse.json({ erro: 'pesos_pallets deve ser uma lista' }, { status: 400 });

  // Pareia peso + nome por índice, mantém apenas pesos válidos (kg >= 0) e
  // preserva o alinhamento nome↔peso. O nome/número do pallet é opcional.
  const nomesRaw: unknown[] = Array.isArray(body.nomes_pallets) ? (body.nomes_pallets as unknown[]) : [];
  const pares = (body.pesos_pallets as unknown[])
    .map((v, i) => ({ peso: Number(v), nome: String(nomesRaw[i] ?? '').trim().slice(0, 60) }))
    .filter(x => Number.isFinite(x.peso) && x.peso >= 0);
  const pesos: number[] = pares.map(x => x.peso);
  const nomes: string[] = pares.map(x => x.nome);

  const [parcial] = await sql`SELECT id, setor_atual FROM producao_itemparcial WHERE id = ${parcialId}`;
  if (!parcial) return NextResponse.json({ erro: 'Parcial não encontrada' }, { status: 404 });

  // Operador só edita parciais de um setor da sua lista (admin edita qualquer uma).
  if (!user.is_staff && !podeAcessarSetor(user, parcial.setor_atual))
    return NextResponse.json({ erro: 'Acesso negado' }, { status: 403 });

  await sql`UPDATE producao_itemparcial SET pesos_pallets = ${pesos}, nomes_pallets = ${nomes}, atualizado_em = NOW() WHERE id = ${parcialId}`;

  return NextResponse.json({ ok: true, pesos_pallets: pesos, nomes_pallets: nomes });
}