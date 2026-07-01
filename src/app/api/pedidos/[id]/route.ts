
import { getPedidoComItens } from '@/lib/queries';
const PRIORIDADES_VALIDAS = ['baixa', 'normal', 'alta', 'urgente'];
export const dynamic = 'force-dynamic';
import { getPedidoComItens } from '@/lib/queries';
const UNIDADES_VALIDAS = ['un', 'kg', 'm', 'pc', 'jg', 'cx', 'lt'];
export const dynamic = 'force-dynamic';

import { getPedidoComItens } from '@/lib/queries';
export async function GET(req: Request, { params }: { params: { id: string } }) {
export const dynamic = 'force-dynamic';
import { getPedidoComItens } from '@/lib/queries';
  const user = await autenticar(req);
export const dynamic = 'force-dynamic';
import { getPedidoComItens } from '@/lib/queries';
  if (user instanceof NextResponse) return user;
export const dynamic = 'force-dynamic';
import { getPedidoComItens } from '@/lib/queries';
  const pedidoId = Number(params.id);
export const dynamic = 'force-dynamic';
import { getPedidoComItens } from '@/lib/queries';
  if (!Number.isInteger(pedidoId) || pedidoId <= 0)
export const dynamic = 'force-dynamic';
import { getPedidoComItens } from '@/lib/queries';
    return NextResponse.json({ erro: 'ID invalido' }, { status: 400 });
export const dynamic = 'force-dynamic';
import { getPedidoComItens } from '@/lib/queries';
  const pedido = await getPedidoComItens(pedidoId);
export const dynamic = 'force-dynamic';
import { getPedidoComItens } from '@/lib/queries';
  if (!pedido) return NextResponse.json({ erro: 'Nao encontrado' }, { status: 404 });
export const dynamic = 'force-dynamic';

import { getPedidoComItens } from '@/lib/queries';
  // Operadores só podem ver pedidos do próprio setor (sem setor = sem acesso)
export const dynamic = 'force-dynamic';
import { getPedidoComItens } from '@/lib/queries';
  if (!user.is_staff && pedido.setor_atual !== user.setor)
export const dynamic = 'force-dynamic';
import { getPedidoComItens } from '@/lib/queries';
    return NextResponse.json({ erro: 'Acesso negado' }, { status: 403 });
export const dynamic = 'force-dynamic';

import { getPedidoComItens } from '@/lib/queries';
  // Líderes e operadores não veem valores financeiros
export const dynamic = 'force-dynamic';
import { getPedidoComItens } from '@/lib/queries';
  const verFinanceiro = user.is_staff && user.perfil !== 'lider';
export const dynamic = 'force-dynamic';
import { getPedidoComItens } from '@/lib/queries';
  if (!verFinanceiro) {
export const dynamic = 'force-dynamic';
import { getPedidoComItens } from '@/lib/queries';
    const itens = (pedido.itens as Record<string, unknown>[]).map(i => ({ ...i, valor_unitario: null }));
export const dynamic = 'force-dynamic';
import { getPedidoComItens } from '@/lib/queries';
    return NextResponse.json({ ...pedido, valor_calculado: null, itens });
export const dynamic = 'force-dynamic';
import { getPedidoComItens } from '@/lib/queries';
  }
export const dynamic = 'force-dynamic';
import { getPedidoComItens } from '@/lib/queries';
  return NextResponse.json(pedido);
export const dynamic = 'force-dynamic';
import { getPedidoComItens } from '@/lib/queries';
}
export const dynamic = 'force-dynamic';

import { getPedidoComItens } from '@/lib/queries';
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
export const dynamic = 'force-dynamic';
import { getPedidoComItens } from '@/lib/queries';
  const user = await autenticar(req);
export const dynamic = 'force-dynamic';
import { getPedidoComItens } from '@/lib/queries';
  if (user instanceof NextResponse) return user;
export const dynamic = 'force-dynamic';
import { getPedidoComItens } from '@/lib/queries';
  if (!user.is_staff) return NextResponse.json({ erro: 'Sem permissao' }, { status: 403 });
export const dynamic = 'force-dynamic';
import { getPedidoComItens } from '@/lib/queries';
  logAcesso(user, req, 'editar_pedido');
export const dynamic = 'force-dynamic';

import { getPedidoComItens } from '@/lib/queries';
  const pedidoId = Number(params.id);
export const dynamic = 'force-dynamic';
import { getPedidoComItens } from '@/lib/queries';
  if (!Number.isInteger(pedidoId) || pedidoId <= 0)
export const dynamic = 'force-dynamic';
import { getPedidoComItens } from '@/lib/queries';
    return NextResponse.json({ erro: 'ID invalido' }, { status: 400 });
export const dynamic = 'force-dynamic';

import { getPedidoComItens } from '@/lib/queries';
  const body = await req.json().catch(() => ({}));
export const dynamic = 'force-dynamic';

import { getPedidoComItens } from '@/lib/queries';
  const [pedido] = await sql`SELECT id FROM producao_pedido WHERE id = ${pedidoId}`;
export const dynamic = 'force-dynamic';
import { getPedidoComItens } from '@/lib/queries';
  if (!pedido) return NextResponse.json({ erro: 'Pedido nao encontrado' }, { status: 404 });
export const dynamic = 'force-dynamic';

import { getPedidoComItens } from '@/lib/queries';
  try { await sql.begin(async (tx) => {
export const dynamic = 'force-dynamic';
import { getPedidoComItens } from '@/lib/queries';
    // Atualiza campos do pedido
export const dynamic = 'force-dynamic';
import { getPedidoComItens } from '@/lib/queries';
    if (body.numero_pedido_venda !== undefined ||
export const dynamic = 'force-dynamic';
import { getPedidoComItens } from '@/lib/queries';
        body.numero_op !== undefined ||
export const dynamic = 'force-dynamic';
import { getPedidoComItens } from '@/lib/queries';
        body.cliente !== undefined ||
export const dynamic = 'force-dynamic';
import { getPedidoComItens } from '@/lib/queries';
        body.vendedor !== undefined ||
export const dynamic = 'force-dynamic';
import { getPedidoComItens } from '@/lib/queries';
        body.prazo_entrega !== undefined ||
export const dynamic = 'force-dynamic';
import { getPedidoComItens } from '@/lib/queries';
        body.prioridade !== undefined ||
export const dynamic = 'force-dynamic';
import { getPedidoComItens } from '@/lib/queries';
        body.roteiro_base !== undefined ||
export const dynamic = 'force-dynamic';
import { getPedidoComItens } from '@/lib/queries';
        body.observacoes !== undefined) {
export const dynamic = 'force-dynamic';

import { getPedidoComItens } from '@/lib/queries';
      const pv = typeof body.numero_pedido_venda === 'string' ? body.numero_pedido_venda.trim().slice(0, 100) : null;
export const dynamic = 'force-dynamic';
import { getPedidoComItens } from '@/lib/queries';
      const op = typeof body.numero_op === 'string' ? body.numero_op.trim().slice(0, 100) : null;
export const dynamic = 'force-dynamic';
import { getPedidoComItens } from '@/lib/queries';
      const cli = typeof body.cliente === 'string' ? body.cliente.trim().slice(0, 200) : null;
export const dynamic = 'force-dynamic';
import { getPedidoComItens } from '@/lib/queries';
      const vend = typeof body.vendedor === 'string' ? body.vendedor.trim().slice(0, 150) : null;
export const dynamic = 'force-dynamic';
import { getPedidoComItens } from '@/lib/queries';
      const prazo = typeof body.prazo_entrega === 'string' ? body.prazo_entrega : null;
export const dynamic = 'force-dynamic';
import { getPedidoComItens } from '@/lib/queries';
      const prio = PRIORIDADES_VALIDAS.includes(body.prioridade) ? body.prioridade : null;
export const dynamic = 'force-dynamic';
import { getPedidoComItens } from '@/lib/queries';
      const rot = Array.isArray(body.roteiro_base) ? body.roteiro_base : null;
export const dynamic = 'force-dynamic';
import { getPedidoComItens } from '@/lib/queries';
      const obs = typeof body.observacoes === 'string' ? body.observacoes.trim() : null;
export const dynamic = 'force-dynamic';

import { getPedidoComItens } from '@/lib/queries';
      await tx`
export const dynamic = 'force-dynamic';
import { getPedidoComItens } from '@/lib/queries';
        UPDATE producao_pedido SET
export const dynamic = 'force-dynamic';
import { getPedidoComItens } from '@/lib/queries';
          numero_pedido_venda = COALESCE(${pv}, numero_pedido_venda),
export const dynamic = 'force-dynamic';
import { getPedidoComItens } from '@/lib/queries';
          numero_op           = COALESCE(${op}, numero_op),
export const dynamic = 'force-dynamic';
import { getPedidoComItens } from '@/lib/queries';
          cliente             = COALESCE(${cli}, cliente),
export const dynamic = 'force-dynamic';
import { getPedidoComItens } from '@/lib/queries';
          vendedor            = COALESCE(${vend}, vendedor),
export const dynamic = 'force-dynamic';
import { getPedidoComItens } from '@/lib/queries';
          prazo_entrega       = COALESCE(${prazo}::date, prazo_entrega),
export const dynamic = 'force-dynamic';
import { getPedidoComItens } from '@/lib/queries';
          prioridade          = COALESCE(${prio}, prioridade),
export const dynamic = 'force-dynamic';
import { getPedidoComItens } from '@/lib/queries';
          roteiro_base        = COALESCE(${rot}::text[], roteiro_base),
export const dynamic = 'force-dynamic';
import { getPedidoComItens } from '@/lib/queries';
          observacoes         = COALESCE(${obs}, observacoes),
export const dynamic = 'force-dynamic';
import { getPedidoComItens } from '@/lib/queries';
          atualizado_em       = NOW()
export const dynamic = 'force-dynamic';
import { getPedidoComItens } from '@/lib/queries';
        WHERE id = ${pedidoId}
export const dynamic = 'force-dynamic';
import { getPedidoComItens } from '@/lib/queries';
      `;
export const dynamic = 'force-dynamic';
import { getPedidoComItens } from '@/lib/queries';
    }
export const dynamic = 'force-dynamic';

import { getPedidoComItens } from '@/lib/queries';
    // Processa itens
export const dynamic = 'force-dynamic';
import { getPedidoComItens } from '@/lib/queries';
    if (Array.isArray(body.itens)) {
export const dynamic = 'force-dynamic';
import { getPedidoComItens } from '@/lib/queries';
      for (const item of body.itens) {
export const dynamic = 'force-dynamic';
import { getPedidoComItens } from '@/lib/queries';
        // Remover item existente — só permitido se ainda não entrou em produção
export const dynamic = 'force-dynamic';
import { getPedidoComItens } from '@/lib/queries';
        if (item._remover && item.id) {
export const dynamic = 'force-dynamic';
import { getPedidoComItens } from '@/lib/queries';
          const [atual] = await tx`
export const dynamic = 'force-dynamic';
import { getPedidoComItens } from '@/lib/queries';
            SELECT status, quantidade_entregue FROM producao_itempedido
export const dynamic = 'force-dynamic';
import { getPedidoComItens } from '@/lib/queries';
            WHERE id = ${Number(item.id)} AND pedido_id = ${pedidoId}
export const dynamic = 'force-dynamic';
import { getPedidoComItens } from '@/lib/queries';
          `;
export const dynamic = 'force-dynamic';
import { getPedidoComItens } from '@/lib/queries';
          if (!atual) continue;
export const dynamic = 'force-dynamic';
import { getPedidoComItens } from '@/lib/queries';
          if (atual.status !== 'emitido' || Number(atual.quantidade_entregue) > 0) {
export const dynamic = 'force-dynamic';
import { getPedidoComItens } from '@/lib/queries';
            throw Object.assign(new Error(`Item ${item.id} já entrou em produção (status: ${atual.status}) e não pode ser removido.`), { status: 409 });
export const dynamic = 'force-dynamic';
import { getPedidoComItens } from '@/lib/queries';
          }
export const dynamic = 'force-dynamic';
import { getPedidoComItens } from '@/lib/queries';
          await tx`DELETE FROM producao_itempedido WHERE id = ${Number(item.id)} AND pedido_id = ${pedidoId}`;
export const dynamic = 'force-dynamic';
import { getPedidoComItens } from '@/lib/queries';
          continue;
export const dynamic = 'force-dynamic';
import { getPedidoComItens } from '@/lib/queries';
        }
export const dynamic = 'force-dynamic';

import { getPedidoComItens } from '@/lib/queries';
        const cod = typeof item.codigo === 'string' ? item.codigo.trim().slice(0, 100) : '';
export const dynamic = 'force-dynamic';
import { getPedidoComItens } from '@/lib/queries';
        if (!cod) continue;
export const dynamic = 'force-dynamic';

import { getPedidoComItens } from '@/lib/queries';
        const qtd = Math.max(1, Number(item.quantidade) || 1);
export const dynamic = 'force-dynamic';
import { getPedidoComItens } from '@/lib/queries';
        const unid = UNIDADES_VALIDAS.includes(item.unidade) ? item.unidade : 'un';
export const dynamic = 'force-dynamic';
import { getPedidoComItens } from '@/lib/queries';
        const val = item.valor_unitario != null && item.valor_unitario !== '' ? Number(item.valor_unitario) : null;
export const dynamic = 'force-dynamic';
import { getPedidoComItens } from '@/lib/queries';
        const desc = typeof item.descricao === 'string' ? item.descricao.trim().slice(0, 500) : '';
export const dynamic = 'force-dynamic';

import { getPedidoComItens } from '@/lib/queries';
        if (item.id) {
export const dynamic = 'force-dynamic';
import { getPedidoComItens } from '@/lib/queries';
          // Atualiza item existente — ajusta quantidade_pendente pelo mesmo delta
export const dynamic = 'force-dynamic';
import { getPedidoComItens } from '@/lib/queries';
          // para não desincronizar do total quando a quantidade é editada
export const dynamic = 'force-dynamic';
import { getPedidoComItens } from '@/lib/queries';
          const [atualQtd] = await tx`
export const dynamic = 'force-dynamic';
import { getPedidoComItens } from '@/lib/queries';
            SELECT quantidade, quantidade_pendente FROM producao_itempedido
export const dynamic = 'force-dynamic';
import { getPedidoComItens } from '@/lib/queries';
            WHERE id = ${Number(item.id)} AND pedido_id = ${pedidoId}
export const dynamic = 'force-dynamic';
import { getPedidoComItens } from '@/lib/queries';
          `;
export const dynamic = 'force-dynamic';
import { getPedidoComItens } from '@/lib/queries';
          const delta = atualQtd ? qtd - Number(atualQtd.quantidade) : 0;
export const dynamic = 'force-dynamic';
import { getPedidoComItens } from '@/lib/queries';
          const pendenteAjustada = atualQtd
export const dynamic = 'force-dynamic';
import { getPedidoComItens } from '@/lib/queries';
            ? Math.min(qtd, Math.max(0, Number(atualQtd.quantidade_pendente) + delta))
export const dynamic = 'force-dynamic';
import { getPedidoComItens } from '@/lib/queries';
            : qtd;
export const dynamic = 'force-dynamic';
import { getPedidoComItens } from '@/lib/queries';
          await tx`
export const dynamic = 'force-dynamic';
import { getPedidoComItens } from '@/lib/queries';
            UPDATE producao_itempedido SET
export const dynamic = 'force-dynamic';
import { getPedidoComItens } from '@/lib/queries';
              codigo             = ${cod},
export const dynamic = 'force-dynamic';
import { getPedidoComItens } from '@/lib/queries';
              descricao          = ${desc},
export const dynamic = 'force-dynamic';
import { getPedidoComItens } from '@/lib/queries';
              quantidade         = ${qtd},
export const dynamic = 'force-dynamic';
import { getPedidoComItens } from '@/lib/queries';
              quantidade_pendente = ${pendenteAjustada},
export const dynamic = 'force-dynamic';
import { getPedidoComItens } from '@/lib/queries';
              unidade            = ${unid},
export const dynamic = 'force-dynamic';
import { getPedidoComItens } from '@/lib/queries';
              valor_unitario     = ${val},
export const dynamic = 'force-dynamic';
import { getPedidoComItens } from '@/lib/queries';
              atualizado_em      = NOW()
export const dynamic = 'force-dynamic';
import { getPedidoComItens } from '@/lib/queries';
            WHERE id = ${Number(item.id)} AND pedido_id = ${pedidoId}
export const dynamic = 'force-dynamic';
import { getPedidoComItens } from '@/lib/queries';
          `;
export const dynamic = 'force-dynamic';
import { getPedidoComItens } from '@/lib/queries';
        } else {
export const dynamic = 'force-dynamic';
import { getPedidoComItens } from '@/lib/queries';
          // Insere novo item
export const dynamic = 'force-dynamic';
import { getPedidoComItens } from '@/lib/queries';
          const [existente] = await tx`SELECT setor_atual FROM producao_pedido WHERE id = ${pedidoId}`;
export const dynamic = 'force-dynamic';
import { getPedidoComItens } from '@/lib/queries';
          const setorAtual = existente?.setor_atual || 'emissao';
export const dynamic = 'force-dynamic';
import { getPedidoComItens } from '@/lib/queries';
          await tx`
export const dynamic = 'force-dynamic';
import { getPedidoComItens } from '@/lib/queries';
            INSERT INTO producao_itempedido
export const dynamic = 'force-dynamic';
import { getPedidoComItens } from '@/lib/queries';
              (pedido_id, codigo, descricao, quantidade, unidade, valor_unitario,
export const dynamic = 'force-dynamic';
import { getPedidoComItens } from '@/lib/queries';
               status, setor_atual, quantidade_pendente, quantidade_entregue, criado_em, atualizado_em)
export const dynamic = 'force-dynamic';
import { getPedidoComItens } from '@/lib/queries';
            VALUES
export const dynamic = 'force-dynamic';
import { getPedidoComItens } from '@/lib/queries';
              (${pedidoId}, ${cod}, ${desc}, ${qtd}, ${unid}, ${val},
export const dynamic = 'force-dynamic';
import { getPedidoComItens } from '@/lib/queries';
               'emitido', ${setorAtual}, ${qtd}, 0, NOW(), NOW())
export const dynamic = 'force-dynamic';
import { getPedidoComItens } from '@/lib/queries';
          `;
export const dynamic = 'force-dynamic';
import { getPedidoComItens } from '@/lib/queries';
        }
export const dynamic = 'force-dynamic';
import { getPedidoComItens } from '@/lib/queries';
      }
export const dynamic = 'force-dynamic';
import { getPedidoComItens } from '@/lib/queries';
    }
export const dynamic = 'force-dynamic';
import { getPedidoComItens } from '@/lib/queries';
  }); } catch (e: unknown) {
export const dynamic = 'force-dynamic';
import { getPedidoComItens } from '@/lib/queries';
    const err = e as { status?: number; message?: string };
export const dynamic = 'force-dynamic';
import { getPedidoComItens } from '@/lib/queries';
    const status = err?.status === 409 ? 409 : 500;
export const dynamic = 'force-dynamic';
import { getPedidoComItens } from '@/lib/queries';
    return NextResponse.json({ erro: err?.message || 'Erro ao atualizar pedido' }, { status });
export const dynamic = 'force-dynamic';
import { getPedidoComItens } from '@/lib/queries';
  }
export const dynamic = 'force-dynamic';

import { getPedidoComItens } from '@/lib/queries';
  const pedidoAtualizado = await getPedidoComItens(pedidoId);
export const dynamic = 'force-dynamic';
import { getPedidoComItens } from '@/lib/queries';
  return NextResponse.json(pedidoAtualizado);
export const dynamic = 'force-dynamic';
import { getPedidoComItens } from '@/lib/queries';
}
export const dynamic = 'force-dynamic';

import { getPedidoComItens } from '@/lib/queries';
export async function DELETE(req: Request, { params }: { params: { id: string } }) {
export const dynamic = 'force-dynamic';
import { getPedidoComItens } from '@/lib/queries';
  const user = await autenticar(req);
export const dynamic = 'force-dynamic';
import { getPedidoComItens } from '@/lib/queries';
  if (user instanceof NextResponse) return user;
export const dynamic = 'force-dynamic';
import { getPedidoComItens } from '@/lib/queries';
  if (!user.is_staff) return NextResponse.json({ erro: 'Sem permissao' }, { status: 403 });
export const dynamic = 'force-dynamic';

import { getPedidoComItens } from '@/lib/queries';
  const id = Number(params.id);
export const dynamic = 'force-dynamic';
import { getPedidoComItens } from '@/lib/queries';
  if (!Number.isInteger(id) || id <= 0)
export const dynamic = 'force-dynamic';
import { getPedidoComItens } from '@/lib/queries';
    return NextResponse.json({ erro: 'ID invalido' }, { status: 400 });
export const dynamic = 'force-dynamic';
import { getPedidoComItens } from '@/lib/queries';
  const body = await req.json().catch(() => ({}));
export const dynamic = 'force-dynamic';
import { getPedidoComItens } from '@/lib/queries';
  const motivo: string = body.motivo || '';
export const dynamic = 'force-dynamic';

import { getPedidoComItens } from '@/lib/queries';
  // Verifica se existe
export const dynamic = 'force-dynamic';
import { getPedidoComItens } from '@/lib/queries';
  const [pedido] = await sql`SELECT id, numero_pedido_venda FROM producao_pedido WHERE id = ${id}`;
export const dynamic = 'force-dynamic';
import { getPedidoComItens } from '@/lib/queries';
  if (!pedido) return NextResponse.json({ erro: 'Pedido nao encontrado' }, { status: 404 });
export const dynamic = 'force-dynamic';

import { getPedidoComItens } from '@/lib/queries';
  // Bloqueia exclusão se algum item já está em produção (a menos que confirm=true)
export const dynamic = 'force-dynamic';
import { getPedidoComItens } from '@/lib/queries';
  if (!body.confirmar_excluir_em_producao) {
export const dynamic = 'force-dynamic';
import { getPedidoComItens } from '@/lib/queries';
    const [{ em_producao }] = await sql`
export const dynamic = 'force-dynamic';
import { getPedidoComItens } from '@/lib/queries';
      SELECT COUNT(*) AS em_producao FROM producao_itempedido
export const dynamic = 'force-dynamic';
import { getPedidoComItens } from '@/lib/queries';
      WHERE pedido_id = ${id} AND status NOT IN ('emitido', 'entregue')
export const dynamic = 'force-dynamic';
import { getPedidoComItens } from '@/lib/queries';
    `;
export const dynamic = 'force-dynamic';
import { getPedidoComItens } from '@/lib/queries';
    if (Number(em_producao) > 0) {
export const dynamic = 'force-dynamic';
import { getPedidoComItens } from '@/lib/queries';
      return NextResponse.json({
export const dynamic = 'force-dynamic';
import { getPedidoComItens } from '@/lib/queries';
        erro: `Este pedido possui ${em_producao} item(ns) em produção ativa. Para confirmar a exclusão, envie { "confirmar_excluir_em_producao": true } junto com a requisição.`,
export const dynamic = 'force-dynamic';
import { getPedidoComItens } from '@/lib/queries';
        em_producao: Number(em_producao),
export const dynamic = 'force-dynamic';
import { getPedidoComItens } from '@/lib/queries';
        requer_confirmacao: true,
export const dynamic = 'force-dynamic';
import { getPedidoComItens } from '@/lib/queries';
      }, { status: 409 });
export const dynamic = 'force-dynamic';
import { getPedidoComItens } from '@/lib/queries';
    }
export const dynamic = 'force-dynamic';
import { getPedidoComItens } from '@/lib/queries';
  }
export const dynamic = 'force-dynamic';

import { getPedidoComItens } from '@/lib/queries';
  // Usa transação com SET LOCAL para o trigger saber quem excluiu
export const dynamic = 'force-dynamic';
import { getPedidoComItens } from '@/lib/queries';
  try {
export const dynamic = 'force-dynamic';
import { getPedidoComItens } from '@/lib/queries';
    await sql.begin(async (tx) => {
export const dynamic = 'force-dynamic';
import { getPedidoComItens } from '@/lib/queries';
      // Trigger fn_log_pedido_excluido registra automaticamente em producao_pedido_excluido
export const dynamic = 'force-dynamic';
import { getPedidoComItens } from '@/lib/queries';
      await tx`SELECT set_config('app.usuario_excluindo', ${user.nome || user.username}, true)`;
export const dynamic = 'force-dynamic';
import { getPedidoComItens } from '@/lib/queries';
      // CASCADE ON DELETE cuida de itens, lotes e movimentações
export const dynamic = 'force-dynamic';
import { getPedidoComItens } from '@/lib/queries';
      await tx`DELETE FROM producao_pedido WHERE id = ${id}`;
export const dynamic = 'force-dynamic';
import { getPedidoComItens } from '@/lib/queries';
    });
export const dynamic = 'force-dynamic';
import { getPedidoComItens } from '@/lib/queries';
  } catch (e) {
export const dynamic = 'force-dynamic';
import { getPedidoComItens } from '@/lib/queries';
    console.error('[DELETE /api/pedidos/:id]', e);
export const dynamic = 'force-dynamic';
import { getPedidoComItens } from '@/lib/queries';
    return NextResponse.json({ erro: 'Erro ao excluir pedido', detalhe: String(e) }, { status: 500 });
export const dynamic = 'force-dynamic';
import { getPedidoComItens } from '@/lib/queries';
  }
export const dynamic = 'force-dynamic';

import { getPedidoComItens } from '@/lib/queries';
  return NextResponse.json({ ok: true, mensagem: `Pedido ${pedido.numero_pedido_venda} excluído e registrado no log.` });
export const dynamic = 'force-dynamic';
import { getPedidoComItens } from '@/lib/queries';
}
export const dynamic = 'force-dynamic';
