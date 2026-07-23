import { NextResponse } from 'next/server';
import sql from '@/lib/db';
import { autenticar, logAcesso } from '@/lib/middleware';
import { getPedidoComItens } from '@/lib/queries';
import { checkMutationRateLimit, getClientIp } from '@/lib/rateLimit';
import { vendedorRestrito } from '@/lib/auth';
import { SETOR_CHOICES, FABRICAS } from '@/lib/types';

export const dynamic = 'force-dynamic';
const PRIORIDADES_VALIDAS = ['baixa', 'normal', 'alta', 'urgente'];
const UNIDADES_VALIDAS = ['un', 'kg', 'm', 'pc', 'jg', 'cx', 'lt'];
const SETORES_VALIDOS = SETOR_CHOICES.map(([cod]) => cod);
const FABRICAS_VALIDAS = FABRICAS.map(f => f.cod);

export async function GET(req: Request, { params }: { params: { id: string } }) {
  const user = await autenticar(req);
  if (user instanceof NextResponse) return user;
  const pedidoId = Number(params.id);
  if (!Number.isInteger(pedidoId) || pedidoId <= 0)
    return NextResponse.json({ erro: 'ID invalido' }, { status: 400 });
  // Admin (is_staff) vê itens inativados (em cinza); operador não os recebe.
  const pedido = await getPedidoComItens(pedidoId, user.is_staff);
  if (!pedido) return NextResponse.json({ erro: 'Nao encontrado' }, { status: 404 });

  // Qualquer usuário autenticado pode ler (somente leitura) qualquer pedido —
  // a aba "Todos os Pedidos" mostra a lista completa pra todos os setores.
  // A edição (PATCH abaixo) continua restrita a is_staff, então essa leitura
  // não abre brecha de escrita fora do próprio setor.
  //
  // Exceção: vendedor só pode ver os próprios pedidos. Sem essa checagem, ele
  // poderia abrir o pedido de outro vendedor só trocando o ID na URL, já que a
  // lista (GET /api/pedidos) filtra mas o detalhe por ID não filtrava nada.
  if (vendedorRestrito(user)) {
    const meuNome = (user.nome || '').trim().toLowerCase();
    const nomeVendedor = ((pedido as { vendedor?: string }).vendedor || '').trim().toLowerCase();
    if (!meuNome || nomeVendedor !== meuNome) {
      return NextResponse.json({ erro: 'Nao encontrado' }, { status: 404 });
    }
  }

  // Líderes e operadores não veem valores financeiros
  const verFinanceiro = user.is_staff && user.perfil !== 'lider';
  if (!verFinanceiro) {
    const itens = (pedido.itens as Record<string, unknown>[]).map(i => ({ ...i, valor_unitario: null }));
    return NextResponse.json({ ...pedido, valor_calculado: null, itens });
  }
  return NextResponse.json(pedido);
}

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const user = await autenticar(req);
  if (user instanceof NextResponse) return user;
  if (!user.is_staff) return NextResponse.json({ erro: 'Sem permissao' }, { status: 403 });
  if (!checkMutationRateLimit(getClientIp(req)))
    return NextResponse.json({ erro: 'Muitas requisicoes' }, { status: 429 });
  logAcesso(user, req, 'editar_pedido');

  const pedidoId = Number(params.id);
  if (!Number.isInteger(pedidoId) || pedidoId <= 0)
    return NextResponse.json({ erro: 'ID invalido' }, { status: 400 });

  const body = await req.json().catch(() => ({}));

  const [pedido] = await sql`SELECT id FROM producao_pedido WHERE id = ${pedidoId}`;
  if (!pedido) return NextResponse.json({ erro: 'Pedido nao encontrado' }, { status: 404 });

  try { await sql.begin(async (tx) => {
    // Atualiza campos do pedido
    if (body.numero_pedido_venda !== undefined ||
        body.numero_op !== undefined ||
        body.cliente !== undefined ||
        body.vendedor !== undefined ||
        body.prazo_entrega !== undefined ||
        body.prioridade !== undefined ||
        body.roteiro_base !== undefined ||
        body.observacoes !== undefined) {

      const pv = typeof body.numero_pedido_venda === 'string' ? body.numero_pedido_venda.trim().slice(0, 100) : null;
      const op = typeof body.numero_op === 'string' ? body.numero_op.trim().slice(0, 100) : null;
      const cli = typeof body.cliente === 'string' ? body.cliente.trim().slice(0, 200) : null;
      const vend = typeof body.vendedor === 'string' ? body.vendedor.trim().slice(0, 150) : null;
      const prazo = typeof body.prazo_entrega === 'string' ? body.prazo_entrega : null;
      const prio = PRIORIDADES_VALIDAS.includes(body.prioridade) ? body.prioridade : null;
      const rot = Array.isArray(body.roteiro_base) ? body.roteiro_base : null;
      const obs = typeof body.observacoes === 'string' ? body.observacoes.trim() : null;

      await tx`
        UPDATE producao_pedido SET
          numero_pedido_venda = COALESCE(${pv}, numero_pedido_venda),
          numero_op           = COALESCE(${op}, numero_op),
          cliente             = COALESCE(${cli}, cliente),
          vendedor            = COALESCE(${vend}, vendedor),
          prazo_entrega       = COALESCE(${prazo}::date, prazo_entrega),
          prioridade          = COALESCE(${prio}, prioridade),
          roteiro_base        = COALESCE(${rot}::text[], roteiro_base),
          observacoes         = COALESCE(${obs}, observacoes),
          atualizado_em       = NOW()
        WHERE id = ${pedidoId}
      `;
    }

    // Processa itens
    if (Array.isArray(body.itens)) {
      for (const item of body.itens) {
        // Remover item existente — só permitido se ainda não entrou em produção
        if (item._remover && item.id) {
          const [atual] = await tx`
            SELECT status, quantidade_entregue FROM producao_itempedido
            WHERE id = ${Number(item.id)} AND pedido_id = ${pedidoId}
          `;
          if (!atual) continue;
          // Pode remover enquanto o item ainda NÃO iniciou produção de fato nem
          // teve entrega. Os status pré-produção (emitido/aguardando/recebido)
          // são seguros: o ON DELETE CASCADE remove parciais e movimentações
          // junto. A partir de "em produção" ou com algo entregue, use "Inativar".
          const STATUS_REMOVIVEIS = ['emitido', 'aguardando', 'recebido'];
          if (!STATUS_REMOVIVEIS.includes(String(atual.status)) || Number(atual.quantidade_entregue) > 0) {
            throw Object.assign(new Error(`Item ${item.id} já entrou em produção (status: ${atual.status}) e não pode ser removido. Use "Inativar".`), { status: 409 });
          }
          await tx`DELETE FROM producao_itempedido WHERE id = ${Number(item.id)} AND pedido_id = ${pedidoId}`;
          continue;
        }

        const cod = typeof item.codigo === 'string' ? item.codigo.trim().slice(0, 100) : '';
        if (!cod) continue;

        const qtd = Math.max(1, Number(item.quantidade) || 1);
        const unid = UNIDADES_VALIDAS.includes(item.unidade) ? item.unidade : 'un';
        const val = item.valor_unitario != null && item.valor_unitario !== '' ? Number(item.valor_unitario) : null;
        const desc = typeof item.descricao === 'string' ? item.descricao.trim().slice(0, 500) : '';

        if (item.id) {
          // Atualiza item existente — ajusta quantidade_pendente pelo mesmo delta
          // para não desincronizar do total quando a quantidade é editada
          // FOR UPDATE trava a linha até o fim da transação — evita que dois PATCHs
          // concorrentes no mesmo item leiam a mesma quantidade_pendente "antiga" e
          // calculem deltas incompatíveis (lost update).
          const [atualQtd] = await tx`
            SELECT quantidade, quantidade_pendente, status, quantidade_entregue, setor_atual
            FROM producao_itempedido
            WHERE id = ${Number(item.id)} AND pedido_id = ${pedidoId}
            FOR UPDATE
          `;
          const delta = atualQtd ? qtd - Number(atualQtd.quantidade) : 0;
          const pendenteAjustada = atualQtd
            ? Math.min(qtd, Math.max(0, Number(atualQtd.quantidade_pendente) + delta))
            : qtd;

          // Troca de fábrica/roteiro de um item já existente (ex: uma OP que
          // era só Flanges ganha itens de Caldeiraria e o roteiro_proprio dos
          // itens de Flanges precisa ser fixado). Só mexe nisso enquanto o item
          // ainda não saiu de Emissão nem teve entrega — depois disso o
          // roteiro_proprio/fabrica ficam travados para não desalinhar um item
          // em movimentação do setor em que ele já está.
          const podeMudarRoteiro = !!atualQtd && atualQtd.status === 'emitido'
            && Number(atualQtd.quantidade_entregue) === 0 && atualQtd.setor_atual === 'emissao';
          const rotProprio = Array.isArray(item.roteiro_proprio)
            ? item.roteiro_proprio.filter((s: unknown) => typeof s === 'string' && SETORES_VALIDOS.includes(s))
            : null;
          const fabrica = FABRICAS_VALIDAS.includes(item.fabrica) ? item.fabrica : null;

          if (podeMudarRoteiro && rotProprio !== null) {
            await tx`
              UPDATE producao_itempedido SET
                codigo             = ${cod},
                descricao          = ${desc},
                quantidade         = ${qtd},
                quantidade_pendente = ${pendenteAjustada},
                unidade            = ${unid},
                valor_unitario     = ${val},
                roteiro_proprio    = ${rotProprio},
                fabrica            = COALESCE(${fabrica}, fabrica),
                atualizado_em      = NOW()
              WHERE id = ${Number(item.id)} AND pedido_id = ${pedidoId}
            `;
          } else {
            await tx`
              UPDATE producao_itempedido SET
                codigo             = ${cod},
                descricao          = ${desc},
                quantidade         = ${qtd},
                quantidade_pendente = ${pendenteAjustada},
                unidade            = ${unid},
                valor_unitario     = ${val},
                atualizado_em      = NOW()
              WHERE id = ${Number(item.id)} AND pedido_id = ${pedidoId}
            `;
          }
        } else {
          // Insere novo item. Se vier com roteiro_proprio (ex: item avulso
          // adicionado a um pedido de Flanges, tipo um Tubo pra Caldeiraria),
          // usa o primeiro setor desse roteiro em vez do setor_atual do pedido
          // — permite um item seguir um caminho independente do resto do pedido.
          const rotProprio = Array.isArray(item.roteiro_proprio)
            ? item.roteiro_proprio.filter((s: unknown) => typeof s === 'string' && SETORES_VALIDOS.includes(s))
            : [];
          const fabrica = FABRICAS_VALIDAS.includes(item.fabrica) ? item.fabrica : FABRICAS_VALIDAS[0];
          let setorAtual: string;
          if (rotProprio.length > 0) {
            setorAtual = rotProprio[0];
          } else {
            const [existente] = await tx`SELECT setor_atual FROM producao_pedido WHERE id = ${pedidoId}`;
            setorAtual = existente?.setor_atual || 'emissao';
          }
          await tx`
            INSERT INTO producao_itempedido
              (pedido_id, codigo, descricao, quantidade, unidade, valor_unitario,
               roteiro_proprio, fabrica, status, setor_atual, quantidade_pendente, quantidade_entregue, criado_em, atualizado_em)
            VALUES
              (${pedidoId}, ${cod}, ${desc}, ${qtd}, ${unid}, ${val},
               ${rotProprio}, ${fabrica}, 'emitido', ${setorAtual}, ${qtd}, 0, NOW(), NOW())
          `;
        }
      }
    }
  }); } catch (e: unknown) {
    const err = e as { status?: number; message?: string; code?: string };
    // 22001 = string_data_right_truncation — algum campo passou do limite de caracteres da coluna
    if (err?.code === '22001')
      return NextResponse.json({ erro: 'Um dos campos passou do limite de caracteres (Nº PV e Nº OP: até 50 caracteres).' }, { status: 400 });
    const status = err?.status === 409 ? 409 : 500;
    return NextResponse.json({ erro: err?.message || 'Erro ao atualizar pedido' }, { status });
  }

  const pedidoAtualizado = await getPedidoComItens(pedidoId, true);
  return NextResponse.json(pedidoAtualizado);
}

export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  const user = await autenticar(req);
  if (user instanceof NextResponse) return user;
  if (!user.is_staff) return NextResponse.json({ erro: 'Sem permissao' }, { status: 403 });
  if (!checkMutationRateLimit(getClientIp(req)))
    return NextResponse.json({ erro: 'Muitas requisicoes' }, { status: 429 });

  const id = Number(params.id);
  if (!Number.isInteger(id) || id <= 0)
    return NextResponse.json({ erro: 'ID invalido' }, { status: 400 });
  const body = await req.json().catch(() => ({}));
  const motivo: string = body.motivo || '';

  // Verifica se existe
  const [pedido] = await sql`SELECT id, numero_pedido_venda FROM producao_pedido WHERE id = ${id}`;
  if (!pedido) return NextResponse.json({ erro: 'Pedido nao encontrado' }, { status: 404 });

  // Bloqueia exclusão se algum item já está em produção (a menos que confirm=true)
  if (!body.confirmar_excluir_em_producao) {
    const [{ em_producao }] = await sql`
      SELECT COUNT(*) AS em_producao FROM producao_itempedido
      WHERE pedido_id = ${id} AND status NOT IN ('emitido', 'entregue')
    `;
    if (Number(em_producao) > 0) {
      return NextResponse.json({
        erro: `Este pedido possui ${em_producao} item(ns) em produção ativa. Para confirmar a exclusão, envie { "confirmar_excluir_em_producao": true } junto com a requisição.`,
        em_producao: Number(em_producao),
        requer_confirmacao: true,
      }, { status: 409 });
    }
  }

  // Usa transação com SET LOCAL para o trigger saber quem excluiu
  try {
    await sql.begin(async (tx) => {
      // Trigger fn_log_pedido_excluido registra automaticamente em producao_pedido_excluido
      await tx`SELECT set_config('app.usuario_excluindo', ${user.nome || user.username}, true)`;
      // CASCADE ON DELETE cuida de itens, lotes e movimentações
      await tx`DELETE FROM producao_pedido WHERE id = ${id}`;
    });
  } catch (e) {
    console.error('[DELETE /api/pedidos/:id]', e);
    return NextResponse.json({ erro: 'Erro ao excluir pedido', detalhe: String(e) }, { status: 500 });
  }

  return NextResponse.json({ ok: true, mensagem: `Pedido ${pedido.numero_pedido_venda} excluído e registrado no log.` });
}