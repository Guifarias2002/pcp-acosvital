import { NextResponse } from 'next/server';
import sql from '@/lib/db';
import { autenticar, logAcesso } from '@/lib/middleware';
import { podeAcessarSetor } from '@/lib/auth';
import { nomeSector } from '@/lib/queries';
import { SETOR_CHOICES } from '@/lib/types';
import { checkMutationRateLimit, getClientIp } from '@/lib/rateLimit';

export const dynamic = 'force-dynamic';
const SETORES_VALIDOS = SETOR_CHOICES.map(([cod]) => cod);

const TRANSICOES: Record<string, string[]> = {
  liberar: ['emitido'],
  receber: ['aguardando'],
  iniciar: ['recebido'],
  pausar: ['em_andamento'],
  retomar: ['pausado', 'finalizado_setor'],
  finalizar: ['em_andamento', 'pausado', 'finalizado_setor'],
  enviar_tudo: ['finalizado_setor', 'aguardando', 'recebido', 'em_andamento', 'pausado'],
  enviar_parcial: ['emitido', 'finalizado_setor', 'aguardando', 'recebido', 'em_andamento', 'pausado'],
  despachar: ['recebido', 'finalizado_setor', 'em_andamento'],
  devolver: ['aguardando', 'recebido', 'em_andamento', 'pausado', 'finalizado_setor', 'em_transito'],
  entregar: ['finalizado_setor', 'aguardando', 'recebido', 'em_andamento', 'em_transito'],
  aprovar: ['em_andamento', 'finalizado_setor'],
  reprovar: ['aguardando', 'recebido', 'em_andamento', 'finalizado_setor'],
  retrabalho: ['reprovado'],
  resolver: ['reprovado'],
  cancelar_item: ['reprovado'],
};

const NOVO_STATUS: Record<string, string> = {
  liberar: 'aguardando', receber: 'recebido', iniciar: 'em_andamento', pausar: 'pausado',
  retomar: 'em_andamento', finalizar: 'finalizado_setor',
  enviar_tudo: 'aguardando', enviar_parcial: 'aguardando',
  despachar: 'em_transito',
  devolver: 'aguardando', entregar: 'entregue',
  aprovar: 'finalizado_setor', reprovar: 'reprovado',
  retrabalho: 'aguardando', resolver: 'finalizado_setor', cancelar_item: 'bloqueado',
};

// Repetida na condição WHERE de cada UPDATE de status dentro da transação — evita
// que duas requisições concorrentes (duplo clique, dois usuários) apliquem ações
// diferentes em cima do mesmo status antigo, sobrescrevendo uma a outra em silêncio.
const ERRO_CONCORRENCIA = 'CONCORRENCIA_QTD_INDISPONIVEL: Item foi alterado por outra ação enquanto você aguardava. Recarregue a tela e tente novamente.';

// ── helpers ──────────────────────────────────────────────────────────────────

async function registrarMovItem(
  itemId: number, pedidoId: number, userId: number,
  setorOrigem: string, setorDestino: string,
  statusAnt: string, statusNovo: string, obs: string
) {
  await sql`
    INSERT INTO producao_movimentacaoitem
      (item_id, pedido_id, usuario_id, setor_origem, setor_destino,
       status_anterior, status_novo, observacao, criado_em)
    VALUES (${itemId}, ${pedidoId}, ${userId}, ${setorOrigem}, ${setorDestino},
            ${statusAnt}, ${statusNovo}, ${obs}, NOW())
  `;
}

/**
 * Encontra a parcial ativa do item num dado setor.
 * Se não existir (item anterior ao sistema de parciais), retorna null.
 */
async function getParcialAtiva(
  tx: Awaited<ReturnType<typeof sql.begin>> | typeof sql,
  itemId: number,
  setor: string,
) {
  // Inclui 'pausado' e 'finalizado_setor': uma parcial pausada/finalizada ainda é
  // ativa (só não está em andamento). Sem isso, o caller (ex: recebimento parcial)
  // concluía "não existe parcial" e criava uma linha nova do zero, duplicando a
  // quantidade em vez de reduzir a parcial que já existia (bug real, ver pedido 25790).
  const rows = await (tx as typeof sql)`
    SELECT id, quantidade::float AS quantidade
    FROM producao_itemparcial
    WHERE item_pedido_id = ${itemId}
      AND setor_atual = ${setor}
      AND status IN ('em_aberto', 'recebido', 'em_andamento', 'pausado', 'finalizado_setor')
    ORDER BY criado_em ASC
    LIMIT 1
  `;
  return rows[0] ?? null;
}

/**
 * Move TODAS as parciais ativas de um item, de um setor para outro.
 * Chamado em ações que movem o item inteiro (liberar, enviar_tudo, devolver).
 */
async function moverParcialInteira(
  tx: typeof sql,
  itemId: number,
  pedidoId: number,
  setorOrigem: string,
  setorDestino: string,
  quantidade: number,
  userId: number,
  obs: string,
) {
  // Busca TODAS as parciais ativas no setor de origem (principal e filhas de split),
  // independente do status — inclui concluídas (operador pode ter pressionado
  // "Finalizar" antes de "Enviar tudo"). Mover so a "principal" deixava parciais
  // filhas (de um split anterior) paradas no setor de origem, perdendo quantidade
  // do fluxo mesmo o sistema reportando que moveu tudo.
  const parciais = await tx`
    SELECT id FROM producao_itemparcial
    WHERE item_pedido_id = ${itemId}
      AND setor_atual    = ${setorOrigem}
      AND status NOT IN ('cancelada')
  `;
  if (parciais.length > 0) {
    const ids = parciais.map((p: Record<string, unknown>) => p.id) as number[];
    await tx`
      UPDATE producao_itemparcial
      SET setor_atual = ${setorDestino}, status = 'em_aberto', atualizado_em = NOW()
      WHERE id = ANY(${ids as unknown as string[]})
    `;
  } else {
    // Item criado antes do sistema de parciais — cria parcial no destino
    await tx`
      INSERT INTO producao_itemparcial
        (item_pedido_id, pedido_id, quantidade, setor_atual, status, observacao, criado_por_id, criado_em, atualizado_em)
      VALUES
        (${itemId}, ${pedidoId}, ${quantidade}, ${setorDestino}, 'em_aberto', ${obs}, ${userId}, NOW(), NOW())
    `;
  }
}

// ── handler principal ─────────────────────────────────────────────────────────

export async function POST(
  req: Request,
  { params }: { params: { id: string; acao: string } }
) {
  try {
  const user = await autenticar(req);
  if (user instanceof NextResponse) return user;
  logAcesso(user, req, params.acao);

  if (!checkMutationRateLimit(getClientIp(req)))
    return NextResponse.json({ erro: 'Muitas requisicoes' }, { status: 429 });

  const { id, acao } = params;

  const itemId = Number(id);
  if (!Number.isInteger(itemId) || itemId <= 0)
    return NextResponse.json({ erro: 'ID invalido' }, { status: 400 });

  // ── sync: corrige setor_atual do item com base nas parciais ativas ──────────
  if (acao === 'sync') {
    if (!user.is_staff) return NextResponse.json({ erro: 'Acesso negado' }, { status: 403 });
    const parciais = await sql`
      SELECT setor_atual, COUNT(*)::int AS qtd
      FROM producao_itemparcial
      WHERE item_pedido_id = ${itemId}
        AND status NOT IN ('cancelada', 'concluida')
      GROUP BY setor_atual
    `;
    if (parciais.length === 1) {
      const setor = parciais[0].setor_atual as string;
      const [{ total }] = await sql`
        SELECT COALESCE(SUM(quantidade)::float, 0) AS total
        FROM producao_itemparcial
        WHERE item_pedido_id = ${itemId}
          AND setor_atual = ${setor}
          AND status NOT IN ('cancelada', 'concluida')
      `;
      await sql`
        UPDATE producao_itempedido
        SET setor_atual = ${setor}, status = 'aguardando',
            quantidade_pendente = ${total}, atualizado_em = NOW()
        WHERE id = ${itemId}
      `;
      return NextResponse.json({ ok: true, setor_atual: setor, quantidade_pendente: total, mensagem: `Item sincronizado para ${nomeSector(setor)} (${total} un)` });
    }
    return NextResponse.json({ ok: false, mensagem: 'Parciais em múltiplos setores — sincronização não aplicada', parciais });
  }

  const ACOES_VALIDAS = Object.keys(TRANSICOES);
  if (!ACOES_VALIDAS.includes(acao))
    return NextResponse.json({ erro: 'Acao invalida' }, { status: 400 });

  const body = await req.json().catch(() => ({}));

  const [item] = await sql`
    SELECT i.*, p.roteiro_base
    FROM producao_itempedido i JOIN producao_pedido p ON p.id = i.pedido_id
    WHERE i.id = ${itemId}
  `;
  if (!item) return NextResponse.json({ erro: 'Item nao encontrado' }, { status: 404 });

  if (!user.is_staff && !podeAcessarSetor(user, item.setor_atual))
    return NextResponse.json({ erro: 'Acesso negado' }, { status: 403 });

  const statusesPermitidos = TRANSICOES[acao] || [];
  if (!statusesPermitidos.includes(item.status))
    return NextResponse.json({ erro: `Acao "${acao}" nao permitida no status "${item.status}"` }, { status: 400 });

  const roteiro = (item.roteiro_proprio && item.roteiro_proprio.length > 0)
    ? item.roteiro_proprio as string[]
    : item.roteiro_base as string[];
  const idx = roteiro.indexOf(item.setor_atual);
  const proximoSetorRoteiro = (idx >= 0 && idx < roteiro.length - 1) ? roteiro[idx + 1] : null;
  // O operador pode escolher manualmente qualquer setor de destino válido,
  // mesmo fora do roteiro padrão — mesma regra já usada em devolver/retrabalho
  // (neste arquivo) e no "mover" de parcial (api/parcial/[id]/acao/[acao]).
  // Antes essa escolha era descartada silenciosamente quando o setor não
  // estava no roteiro, e a peça caía sempre no próximo setor do roteiro.
  const setorDestinoEscolhido = (body.setor_destino && SETORES_VALIDOS.includes(body.setor_destino))
    ? body.setor_destino : null;
  const proximoSetor = setorDestinoEscolhido || proximoSetorRoteiro;

  const novoStatus = NOVO_STATUS[acao];
  const obs = body.observacao || '';

  // ── liberar ──────────────────────────────────────────────────────────────
  if (acao === 'liberar') {
    if (!proximoSetor)
      return NextResponse.json({ erro: 'Nao ha proximo setor no roteiro' }, { status: 400 });

    await sql.begin(async (tx) => {
      await tx`
        INSERT INTO producao_movimentacaoitem
          (item_id, pedido_id, usuario_id, setor_origem, setor_destino,
           status_anterior, status_novo, observacao, criado_em)
        VALUES (${item.id}, ${item.pedido_id}, ${user.id}, ${item.setor_atual}, ${proximoSetor},
                ${item.status}, 'aguardando', ${obs || 'Liberado para produção'}, NOW())
      `;
      const rLiberar = await tx`
        UPDATE producao_itempedido
        SET status = 'aguardando', setor_atual = ${proximoSetor}, atualizado_em = NOW()
        WHERE id = ${item.id} AND status = ${item.status}
      `;
      if (rLiberar.count === 0) throw new Error(ERRO_CONCORRENCIA);
      await tx`
        UPDATE producao_pedido
        SET status = 'em_producao', setor_atual = ${proximoSetor}, atualizado_em = NOW()
        WHERE id = ${item.pedido_id}
      `;
      // Cria/move parcial principal para o próximo setor
      await moverParcialInteira(
        tx as unknown as typeof sql,
        item.id, item.pedido_id,
        item.setor_atual, proximoSetor,
        Number(item.quantidade_pendente), user.id,
        obs || 'Liberado para produção'
      );
    });

  // ── enviar_tudo ───────────────────────────────────────────────────────────
  } else if (acao === 'enviar_tudo') {
    if (!proximoSetor)
      return NextResponse.json({ erro: 'Nao ha proximo setor no roteiro' }, { status: 400 });

    await sql.begin(async (tx) => {
      await tx`
        INSERT INTO producao_movimentacaoitem
          (item_id, pedido_id, usuario_id, setor_origem, setor_destino,
           status_anterior, status_novo, observacao, criado_em)
        VALUES (${item.id}, ${item.pedido_id}, ${user.id}, ${item.setor_atual}, ${proximoSetor},
                ${item.status}, 'aguardando', ${obs}, NOW())
      `;
      const rEnviarTudo = await tx`
        UPDATE producao_itempedido
        SET status = 'aguardando', setor_atual = ${proximoSetor}, atualizado_em = NOW()
        WHERE id = ${item.id} AND status = ${item.status}
      `;
      if (rEnviarTudo.count === 0) throw new Error(ERRO_CONCORRENCIA);
      await tx`
        UPDATE producao_pedido SET setor_atual = ${proximoSetor}, atualizado_em = NOW()
        WHERE id = ${item.pedido_id}
      `;
      await moverParcialInteira(
        tx as unknown as typeof sql,
        item.id, item.pedido_id,
        item.setor_atual, proximoSetor,
        Number(item.quantidade_pendente), user.id, obs
      );
    });

  // ── enviar_parcial ────────────────────────────────────────────────────────
  } else if (acao === 'enviar_parcial') {
    const qtd = Number(body.quantidade || 0);
    const qtdPendente = Number(item.quantidade_pendente);

    if (!qtd || qtd <= 0)
      return NextResponse.json({ erro: 'Quantidade invalida: deve ser maior que zero' }, { status: 400 });
    if (!proximoSetor)
      return NextResponse.json({ erro: 'Nao ha proximo setor no roteiro' }, { status: 400 });

    // ── Caso especial: item ainda emitido (emissao) — liberar parcial sem mudar status do item
    if (item.status === 'emitido') {
      if (qtd >= qtdPendente)
        return NextResponse.json({ erro: `Para liberar tudo use o botão Liberar. Quantidade maxima para parcial: ${qtdPendente - 1}` }, { status: 400 });

      await sql.begin(async (tx) => {
        // Trava por item — evita duas requisições simultâneas (duplo clique, dois usuários)
        // criarem duas parciais principais duplicadas no primeiro split deste item.
        await (tx as unknown as typeof sql)`SELECT pg_advisory_xact_lock(778899, ${item.id})`;

        // Garante que exista uma parcial principal em emissao (para o restante)
        const [parcialEmissao] = await (tx as unknown as typeof sql)`
          SELECT id FROM producao_itemparcial
          WHERE item_pedido_id = ${item.id} AND setor_atual = ${item.setor_atual}
            AND parcial_origem_id IS NULL AND status NOT IN ('cancelada')
          LIMIT 1
        `;
        let parcialOrigemId: number;
        if (parcialEmissao) {
          parcialOrigemId = parcialEmissao.id as number;
          // Reduz a qty da parcial principal pelo que foi enviado
          await (tx as unknown as typeof sql)`
            UPDATE producao_itemparcial
            SET quantidade = quantidade - ${qtd}, atualizado_em = NOW()
            WHERE id = ${parcialOrigemId}
          `;
        } else {
          // Primeira parcialização — cria parcial principal com o restante
          const [nova] = await (tx as unknown as typeof sql)`
            INSERT INTO producao_itemparcial
              (item_pedido_id, pedido_id, quantidade, setor_atual, status, observacao, criado_por_id, criado_em, atualizado_em)
            VALUES (${item.id}, ${item.pedido_id}, ${qtdPendente - qtd}, ${item.setor_atual},
                    'em_aberto', 'Saldo remanescente na emissão', ${user.id}, NOW(), NOW())
            RETURNING id
          `;
          parcialOrigemId = nova.id as number;
        }
        // Cria parcial filha no setor destino
        await (tx as unknown as typeof sql)`
          INSERT INTO producao_itemparcial
            (item_pedido_id, pedido_id, parcial_origem_id, quantidade, setor_atual, status, observacao, criado_por_id, criado_em, atualizado_em)
          VALUES (${item.id}, ${item.pedido_id}, ${parcialOrigemId}, ${qtd}, ${proximoSetor},
                  'em_aberto', ${obs || `Liberado parcialmente: ${qtd} ${item.unidade}`}, ${user.id}, NOW(), NOW())
        `;
        // Registra movimentação
        await (tx as unknown as typeof sql)`
          INSERT INTO producao_movimentacaoitem
            (item_id, pedido_id, usuario_id, setor_origem, setor_destino, status_anterior, status_novo, observacao, criado_em)
          VALUES (${item.id}, ${item.pedido_id}, ${user.id}, ${item.setor_atual}, ${proximoSetor},
                  'emitido', 'emitido', ${obs || `Parcial: ${qtd} ${item.unidade} → ${proximoSetor}`}, NOW())
        `;
        // Pedido passa a em_producao mas item permanece emitido em emissao
        await (tx as unknown as typeof sql)`
          UPDATE producao_pedido SET status = 'em_producao', atualizado_em = NOW() WHERE id = ${item.pedido_id}
        `;
      });
      return NextResponse.json({ ok: true, status: 'emitido' });
    }

    // Calcula total disponível no setor somando TODAS as parciais ativas.
    // Cenário típico: item foi split e há múltiplas parciais no mesmo setor
    // (ex: 25 un de envio anterior + 75 un da remessa principal = 100 un disponíveis).
    const parciaisNoSetor = await sql`
      SELECT id, quantidade::float AS quantidade, parcial_origem_id
      FROM producao_itemparcial
      WHERE item_pedido_id = ${item.id}
        AND setor_atual = ${item.setor_atual}
        AND status IN ('em_aberto', 'recebido', 'em_andamento')
      ORDER BY
        CASE WHEN parcial_origem_id IS NULL THEN 0 ELSE 1 END ASC,
        quantidade DESC
    `;
    const qtdTotalNoSetor = parciaisNoSetor.length > 0
      ? parciaisNoSetor.reduce((s: number, p: Record<string, unknown>) => s + Number(p.quantidade), 0)
      : qtdPendente;

    if (qtd > qtdTotalNoSetor)
      return NextResponse.json({
        erro: `Quantidade invalida: solicitado ${qtd}, disponivel ${qtdTotalNoSetor} ${item.unidade} neste setor`
      }, { status: 400 });

    // Se a quantidade pedida cobre todo o setor, converte em enviar_tudo
    if (qtd >= qtdTotalNoSetor) {
      await sql.begin(async (tx) => {
        // Trava por item — mesma proteção contra corrida do bloco de emissão acima.
        await tx`SELECT pg_advisory_xact_lock(778899, ${item.id})`;
        await tx`
          INSERT INTO producao_movimentacaoitem
            (item_id, pedido_id, usuario_id, setor_origem, setor_destino,
             status_anterior, status_novo, observacao, criado_em)
          VALUES (${item.id}, ${item.pedido_id}, ${user.id}, ${item.setor_atual}, ${proximoSetor},
                  ${item.status}, 'aguardando', ${obs}, NOW())
        `;
        const rEnviarParcialConv = await tx`UPDATE producao_itempedido SET status='aguardando', setor_atual=${proximoSetor}, atualizado_em=NOW() WHERE id=${item.id} AND status=${item.status}`;
        if (rEnviarParcialConv.count === 0) throw new Error(ERRO_CONCORRENCIA);
        await tx`UPDATE producao_pedido SET setor_atual=${proximoSetor}, atualizado_em=NOW() WHERE id=${item.pedido_id}`;
        await moverParcialInteira(
          tx as unknown as typeof sql,
          item.id, item.pedido_id,
          item.setor_atual, proximoSetor,
          qtdPendente, user.id, obs
        );
      });
      return NextResponse.json({ ok: true, status: 'aguardando' });
    }

    // Envio parcial real: consome das parciais ativas no setor (maior primeiro)
    // até atingir a quantidade pedida. Assim 30 un de (25+75) funciona normalmente.
    await sql.begin(async (tx) => {
      // Trava por item — mesma proteção contra corrida do bloco de emissão acima.
      await (tx as unknown as typeof sql)`SELECT pg_advisory_xact_lock(778899, ${item.id})`;

      // Busca e trava todas as parciais ativas no setor (maior primeiro)
      let parciaisAtivas = await (tx as unknown as typeof sql)`
        SELECT id, quantidade::float AS quantidade
        FROM producao_itemparcial
        WHERE item_pedido_id = ${item.id}
          AND setor_atual = ${item.setor_atual}
          AND status IN ('em_aberto', 'recebido', 'em_andamento')
        ORDER BY quantidade DESC
        FOR UPDATE
      `;

      // Fallback: o operador finalizou a etapa antes de enviar parcial → usa concluídas
      if (parciaisAtivas.length === 0) {
        const concluidas = await (tx as unknown as typeof sql)`
          SELECT id, quantidade::float AS quantidade
          FROM producao_itemparcial
          WHERE item_pedido_id = ${item.id}
            AND setor_atual = ${item.setor_atual}
            AND status = 'concluida'
          ORDER BY quantidade DESC
          FOR UPDATE
        `;
        if (concluidas.length > 0) {
          // Reativa as concluídas para permitir o split
          const ids = concluidas.map((p: Record<string, unknown>) => p.id) as number[];
          await (tx as unknown as typeof sql)`
            UPDATE producao_itemparcial SET status = 'em_andamento', atualizado_em = NOW()
            WHERE id = ANY(${ids as unknown as string[]})
          `;
          parciaisAtivas = concluidas;
        } else {
          // Verdadeiro fallback: item anterior ao sistema sem nenhuma parcial
          const qtdRestante = qtdPendente - qtd;
          if (qtdRestante > 0) {
            await tx`
              INSERT INTO producao_itemparcial
                (item_pedido_id, pedido_id, quantidade, setor_atual, status, observacao, criado_por_id, criado_em, atualizado_em)
              VALUES
                (${item.id}, ${item.pedido_id}, ${qtdRestante}, ${item.setor_atual},
                 'em_andamento', 'Saldo remanescente — migração', ${user.id}, NOW(), NOW())
            `;
          }
        }
      }

      // Revalida contra o total realmente disponível sob o lock — a checagem anterior
      // (linha ~358) leu fora da transação e pode estar desatualizada se outra requisição
      // consumiu quantidade deste item enquanto esta esperava o advisory lock.
      // Só se aplica quando há parciais reais para somar — no fallback de item legado sem
      // nenhuma parcial (bloco acima), a validação já foi feita em cima de quantidade_pendente.
      if (parciaisAtivas.length > 0) {
        const totalDisponivelSobLock = parciaisAtivas.reduce(
          (s: number, p: Record<string, unknown>) => s + Number(p.quantidade), 0
        );
        if (qtd > totalDisponivelSobLock)
          throw new Error(`CONCORRENCIA_QTD_INDISPONIVEL: Quantidade nao esta mais disponivel (outra operacao concorrente alterou o saldo). Disponivel agora: ${totalDisponivelSobLock} ${item.unidade}. Tente novamente.`);
      }

      // Consome das parciais em ordem (maior primeiro) até cobrir qtd
      let restante = qtd;
      let parcialOrigemId: number | null = null;

      for (const p of parciaisAtivas) {
        if (restante <= 0) break;
        const disponivel = Number(p.quantidade);
        const consumir = Math.min(disponivel, restante);
        const sobra = disponivel - consumir;

        if (!parcialOrigemId) parcialOrigemId = Number(p.id);

        if (sobra > 0) {
          await tx`
            UPDATE producao_itemparcial
            SET quantidade = ${sobra}, status = 'em_andamento', atualizado_em = NOW()
            WHERE id = ${p.id}
          `;
        } else {
          await tx`
            UPDATE producao_itemparcial
            SET status = 'cancelada', atualizado_em = NOW()
            WHERE id = ${p.id}
          `;
        }
        restante -= consumir;
      }

      // Cria nova parcial filha no setor de destino
      await tx`
        INSERT INTO producao_itemparcial
          (item_pedido_id, pedido_id, parcial_origem_id, quantidade, setor_atual, status,
           observacao, criado_por_id, criado_em, atualizado_em)
        VALUES
          (${item.id}, ${item.pedido_id}, ${parcialOrigemId}, ${qtd}, ${proximoSetor},
           'em_aberto', ${obs || null}, ${user.id}, NOW(), NOW())
      `;


      const novaQtdPendente = Math.max(0, qtdPendente - qtd);
      const obsMovItem = `Parcial: ${qtd} ${item.unidade} → ${nomeSector(proximoSetor)}. Saldo em ${nomeSector(item.setor_atual)}: ${novaQtdPendente} ${item.unidade}`;

      await tx`
        INSERT INTO producao_movimentacaoitem
          (item_id, pedido_id, usuario_id, setor_origem, setor_destino,
           status_anterior, status_novo, observacao, criado_em)
        VALUES
          (${item.id}, ${item.pedido_id}, ${user.id}, ${item.setor_atual}, ${proximoSetor},
           ${item.status}, 'em_andamento', ${obsMovItem}, NOW())
      `;

      const rEnviarParcial = await tx`
        UPDATE producao_itempedido
        SET quantidade_pendente = ${novaQtdPendente}, status = 'em_andamento', atualizado_em = NOW()
        WHERE id = ${item.id} AND status = ${item.status}
      `;
      if (rEnviarParcial.count === 0) throw new Error(ERRO_CONCORRENCIA);
    });
    return NextResponse.json({ ok: true, status: 'em_andamento' });

  // ── devolver ──────────────────────────────────────────────────────────────
  } else if (acao === 'devolver') {
    const destinoRaw = body.setor_destino || roteiro[Math.max(0, idx - 1)] || item.setor_atual;
    const destino = SETORES_VALIDOS.includes(destinoRaw) ? destinoRaw : item.setor_atual;

    await sql.begin(async (tx) => {
      await tx`
        INSERT INTO producao_movimentacaoitem
          (item_id, pedido_id, usuario_id, setor_origem, setor_destino,
           status_anterior, status_novo, observacao, criado_em)
        VALUES (${item.id}, ${item.pedido_id}, ${user.id}, ${item.setor_atual}, ${destino},
                ${item.status}, 'aguardando', ${obs || 'Devolucao'}, NOW())
      `;
      const rDevolver = await tx`UPDATE producao_itempedido SET status='aguardando', setor_atual=${destino}, atualizado_em=NOW() WHERE id=${item.id} AND status=${item.status}`;
      if (rDevolver.count === 0) throw new Error(ERRO_CONCORRENCIA);
      // Move TODAS as parciais ativas do item para o setor de devolucao, onde quer que
      // estejam (principal e filhas de splits anteriores em outros setores). Antes,
      // as filhas eram CANCELADAS em vez de devolvidas - perdia a quantidade que
      // estava fisicamente em outro setor no meio de um envio parcial.
      // Marca como "correção" (devolvido_de + motivo, retrabalho=FALSE): a peça
      // voltou por engano/recebimento errado, não é retrabalho da Qualidade. O
      // destino mostra o banner de devolução com o motivo informado.
      const movidas = await tx`
        UPDATE producao_itemparcial
        SET setor_atual = ${destino}, status = 'em_aberto', atualizado_em = NOW(),
            retrabalho = FALSE,
            motivo_retrabalho = ${obs || null},
            devolvido_de = ${item.setor_atual}
        WHERE item_pedido_id = ${item.id}
          AND status NOT IN ('cancelada', 'concluida')
        RETURNING id
      `;
      if (movidas.length === 0) {
        // Item criado antes do sistema de parciais — cria parcial no destino
        await tx`
          INSERT INTO producao_itemparcial
            (item_pedido_id, pedido_id, quantidade, setor_atual, status, observacao,
             retrabalho, motivo_retrabalho, devolvido_de, criado_por_id, criado_em, atualizado_em)
          VALUES
            (${item.id}, ${item.pedido_id}, ${Number(item.quantidade_pendente)}, ${destino}, 'em_aberto', ${obs || 'Devolução'},
             FALSE, ${obs || null}, ${item.setor_atual}, ${user.id}, NOW(), NOW())
        `;
      }
    });

  // ── entregar ──────────────────────────────────────────────────────────────
  } else if (acao === 'entregar') {
    let jaEntregue = false;
    await sql.begin(async (tx) => {
      // Re-read with FOR UPDATE inside tx to prevent concurrent double-delivery
      const [locked] = await tx`
        SELECT id, status, quantidade_entregue, quantidade_pendente
        FROM producao_itempedido WHERE id = ${item.id} FOR UPDATE
      `;
      if (locked.status === 'entregue') { jaEntregue = true; return; }
      const qtdEntregue = Number(locked.quantidade_entregue || 0) + Number(locked.quantidade_pendente);
      await tx`
        INSERT INTO producao_movimentacaoitem
          (item_id, pedido_id, usuario_id, setor_origem, setor_destino,
           status_anterior, status_novo, observacao, criado_em)
        VALUES (${item.id}, ${item.pedido_id}, ${user.id}, ${item.setor_atual}, NULL,
                ${item.status}, 'entregue', ${obs || null}, NOW())
      `;
      await tx`
        UPDATE producao_itempedido
        SET status='entregue', quantidade_entregue=${qtdEntregue}, atualizado_em=NOW()
        WHERE id=${item.id}
      `;
      // Marca todas as parciais ativas do item como concluídas
      await tx`
        UPDATE producao_itemparcial
        SET status = 'concluida', atualizado_em = NOW()
        WHERE item_pedido_id = ${item.id}
          AND status IN ('em_aberto', 'recebido', 'em_andamento', 'em_transito', 'pausado', 'finalizado_setor')
      `;
      const [{ pendentes }] = await tx`
        SELECT COUNT(*) AS pendentes FROM producao_itempedido
        WHERE pedido_id = ${item.pedido_id} AND status != 'entregue'
      `;
      if (Number(pendentes) === 0) {
        await tx`UPDATE producao_pedido SET status='entregue', atualizado_em=NOW() WHERE id=${item.pedido_id}`;
      }
    });
    if (jaEntregue) return NextResponse.json({ ok: true, mensagem: 'Item já estava entregue' });

  // ── receber ───────────────────────────────────────────────────────────────
  } else if (acao === 'receber') {
    const qtdReceber = body.quantidade ? Number(body.quantidade) : null;
    const qtdTotal = Number(item.quantidade_pendente);
    if (qtdReceber && qtdReceber > 0 && qtdReceber < qtdTotal) {
      const qtdRestante = qtdTotal - qtdReceber;
      const idxAtual = roteiro.indexOf(item.setor_atual);
      const setorAnterior = idxAtual > 0 ? roteiro[idxAtual - 1] : item.setor_atual;
      await sql.begin(async (tx) => {
        // Trava por item — se a internet cair e o operador clicar de novo (ou o
        // navegador reenviar a requisição), a segunda chamada espera a primeira
        // terminar em vez de rodar em paralelo e criar uma segunda parcial de resto.
        await (tx as unknown as typeof sql)`SELECT pg_advisory_xact_lock(778899, ${item.id})`;

        // 1. Ajusta a parcial existente no setor atual: reduz para qtdReceber e marca como recebido.
        //    Nao inicia a producao automaticamente - precisa de um "iniciar" separado.
        //    Sem isso, a soma das parciais ativas ultrapassaria a quantidade total do item.
        const parcialAtual = await getParcialAtiva(tx as unknown as typeof sql, item.id, item.setor_atual);
        if (parcialAtual) {
          await tx`
            UPDATE producao_itemparcial
            SET quantidade = ${qtdReceber}, status = 'recebido', atualizado_em = NOW()
            WHERE id = ${parcialAtual.id}
          `;
        } else {
          // Item sem parcial (pré-sistema): cria parcial para a quantidade recebida
          await tx`
            INSERT INTO producao_itemparcial
              (item_pedido_id, pedido_id, quantidade, setor_atual, status, observacao,
               criado_por_id, criado_em, atualizado_em)
            VALUES
              (${item.id}, ${item.pedido_id}, ${qtdReceber}, ${item.setor_atual},
               'recebido', ${`Recebido parcialmente: ${qtdReceber} de ${qtdTotal} ${item.unidade}`},
               ${user.id}, NOW(), NOW())
          `;
        }

        // 2. Cria parcial para o restante que ficou no setor anterior
        await tx`
          INSERT INTO producao_itemparcial
            (item_pedido_id, pedido_id, quantidade, setor_atual, status, observacao,
             criado_por_id, criado_em, atualizado_em)
          VALUES
            (${item.id}, ${item.pedido_id}, ${qtdRestante}, ${setorAnterior},
             'em_aberto', ${`Restante não recebido: ${qtdRestante} ${item.unidade}`},
             ${user.id}, NOW(), NOW())
        `;

        // 3. Lote de compatibilidade para o restante em trânsito
        await tx`
          INSERT INTO producao_loteitem
            (item_pedido_id, setor_origem, setor_destino, quantidade, status, observacao,
             criado_por_id, criado_em, atualizado_em)
          VALUES
            (${item.id}, ${setorAnterior}, ${item.setor_atual}, ${qtdRestante}, 'em_producao',
             ${`Restante parcial: ${qtdRestante} de ${qtdTotal} ${item.unidade}`},
             ${user.id}, NOW(), NOW())
        `;

        const obsReceber = `Recebido ${qtdReceber} de ${qtdTotal} ${item.unidade}. Restam ${qtdRestante} ${item.unidade} em ${nomeSector(setorAnterior)}.`;
        await tx`
          INSERT INTO producao_movimentacaoitem
            (item_id, pedido_id, usuario_id, setor_origem, setor_destino,
             status_anterior, status_novo, observacao, criado_em)
          VALUES (${item.id}, ${item.pedido_id}, ${user.id}, ${item.setor_atual}, ${item.setor_atual},
                  ${item.status}, 'recebido', ${obsReceber}, NOW())
        `;
        const rReceberParcial = await tx`
          UPDATE producao_itempedido
          SET status = 'recebido', quantidade_pendente = ${qtdReceber}, atualizado_em = NOW()
          WHERE id = ${item.id} AND status = ${item.status}
        `;
        if (rReceberParcial.count === 0) throw new Error(ERRO_CONCORRENCIA);
      });
    } else {
      await sql.begin(async (tx) => {
        await tx`
          INSERT INTO producao_movimentacaoitem
            (item_id, pedido_id, usuario_id, setor_origem, setor_destino,
             status_anterior, status_novo, observacao, criado_em)
          VALUES (${item.id}, ${item.pedido_id}, ${user.id}, ${item.setor_atual}, ${item.setor_atual},
                  ${item.status}, 'recebido', ${obs || 'Recebido no setor'}, NOW())
        `;
        const rReceberTudo = await tx`UPDATE producao_itempedido SET status='recebido', atualizado_em=NOW() WHERE id=${item.id} AND status=${item.status}`;
        if (rReceberTudo.count === 0) throw new Error(ERRO_CONCORRENCIA);
        await tx`UPDATE producao_pedido SET setor_atual=${item.setor_atual}, atualizado_em=NOW() WHERE id=${item.pedido_id}`;
        // Marca parcial do setor como recebida (nao inicia producao automaticamente)
        await tx`
          UPDATE producao_itemparcial
          SET status = 'recebido', atualizado_em = NOW()
          WHERE item_pedido_id = ${item.id}
            AND setor_atual = ${item.setor_atual}
            AND status = 'em_aberto'
        `;
      });
    }

  // ── reprovar ──────────────────────────────────────────────────────────────
  } else if (acao === 'reprovar') {
    await sql.begin(async (tx) => {
      await tx`
        INSERT INTO producao_movimentacaoitem
          (item_id, pedido_id, usuario_id, setor_origem, setor_destino,
           status_anterior, status_novo, observacao, criado_em)
        VALUES (${item.id}, ${item.pedido_id}, ${user.id}, ${item.setor_atual}, ${item.setor_atual},
                ${item.status}, 'reprovado', ${obs || 'Reprovado na inspeção'}, NOW())
      `;
      const rReprovar = await tx`UPDATE producao_itempedido SET status='reprovado', atualizado_em=NOW() WHERE id=${item.id} AND status=${item.status}`;
      if (rReprovar.count === 0) throw new Error(ERRO_CONCORRENCIA);
      await tx`
        INSERT INTO producao_divergencia
          (pedido_id, item_id, usuario_id, tipo, descricao, setor_responsavel, status, prioridade, criado_em, atualizado_em)
        VALUES (
          ${item.pedido_id}, ${item.id}, ${user.id}, 'qualidade',
          ${obs || 'Item reprovado na inspeção de qualidade'},
          ${item.setor_atual}, 'aberta', 'alta', NOW(), NOW()
        )
        ON CONFLICT DO NOTHING
      `;
    });

  // ── retrabalho ────────────────────────────────────────────────────────────
  } else if (acao === 'retrabalho') {
    const destino = body.setor_destino;
    if (!destino || !SETORES_VALIDOS.includes(destino))
      return NextResponse.json({ erro: 'Setor de destino inválido' }, { status: 400 });
    const obsRet = obs || `Encaminhado para retrabalho em ${nomeSector(destino)}`;
    await sql.begin(async (tx) => {
      await tx`
        INSERT INTO producao_movimentacaoitem
          (item_id, pedido_id, usuario_id, setor_origem, setor_destino,
           status_anterior, status_novo, observacao, criado_em)
        VALUES (${item.id}, ${item.pedido_id}, ${user.id}, ${item.setor_atual}, ${destino},
                ${item.status}, 'aguardando', ${obsRet}, NOW())
      `;
      const rRetrabalho = await tx`UPDATE producao_itempedido SET status='aguardando', setor_atual=${destino}, atualizado_em=NOW() WHERE id=${item.id} AND status=${item.status}`;
      if (rRetrabalho.count === 0) throw new Error(ERRO_CONCORRENCIA);
      await moverParcialInteira(
        tx as unknown as typeof sql,
        item.id, item.pedido_id,
        item.setor_atual, destino,
        Number(item.quantidade_pendente), user.id, obsRet
      );
    });
    await sql`
      UPDATE producao_divergencia SET status='em_analise',
        observacao_resolucao=${`Encaminhado para retrabalho: ${destino}`}, atualizado_em=NOW()
      WHERE item_id=${item.id} AND status='aberta'
    `;

  // ── resolver ──────────────────────────────────────────────────────────────
  } else if (acao === 'resolver') {
    const obsRes = obs || 'Resolvido internamente pela qualidade';
    await sql.begin(async (tx) => {
      await tx`
        INSERT INTO producao_movimentacaoitem
          (item_id, pedido_id, usuario_id, setor_origem, setor_destino,
           status_anterior, status_novo, observacao, criado_em)
        VALUES (${item.id}, ${item.pedido_id}, ${user.id}, ${item.setor_atual}, ${item.setor_atual},
                ${item.status}, 'finalizado_setor', ${obsRes}, NOW())
      `;
      const rResolver = await tx`UPDATE producao_itempedido SET status='finalizado_setor', atualizado_em=NOW() WHERE id=${item.id} AND status=${item.status}`;
      if (rResolver.count === 0) throw new Error(ERRO_CONCORRENCIA);
      await tx`
        UPDATE producao_divergencia SET status='resolvida', resolvido_em=NOW(),
          resolvido_por_id=${user.id}, observacao_resolucao=${obsRes}, atualizado_em=NOW()
        WHERE item_id=${item.id} AND status IN ('aberta','em_analise')
      `;
    });

  // ── cancelar_item ─────────────────────────────────────────────────────────
  } else if (acao === 'cancelar_item') {
    const obsCan = obs || 'Item cancelado pela qualidade';
    await sql.begin(async (tx) => {
      await tx`
        INSERT INTO producao_movimentacaoitem
          (item_id, pedido_id, usuario_id, setor_origem, setor_destino,
           status_anterior, status_novo, observacao, criado_em)
        VALUES (${item.id}, ${item.pedido_id}, ${user.id}, ${item.setor_atual}, ${item.setor_atual},
                ${item.status}, 'bloqueado', ${obsCan}, NOW())
      `;
      const rCancelarItem = await tx`UPDATE producao_itempedido SET status='bloqueado', atualizado_em=NOW() WHERE id=${item.id} AND status=${item.status}`;
      if (rCancelarItem.count === 0) throw new Error(ERRO_CONCORRENCIA);
      // Cancela todas as parciais ativas do item
      await tx`
        UPDATE producao_itemparcial
        SET status = 'cancelada', atualizado_em = NOW()
        WHERE item_pedido_id = ${item.id} AND status IN ('em_aberto', 'recebido', 'em_andamento')
      `;
    });
    await sql`
      UPDATE producao_divergencia SET status='cancelada', resolvido_em=NOW(),
        resolvido_por_id=${user.id}, observacao_resolucao=${obsCan}, atualizado_em=NOW()
      WHERE item_id=${item.id} AND status IN ('aberta','em_analise')
    `;

  // ── iniciar ───────────────────────────────────────────────────────────────
  } else if (acao === 'iniciar') {
    await sql.begin(async (tx) => {
      await tx`
        INSERT INTO producao_movimentacaoitem
          (item_id, pedido_id, usuario_id, setor_origem, setor_destino,
           status_anterior, status_novo, observacao, criado_em)
        VALUES (${item.id}, ${item.pedido_id}, ${user.id}, ${item.setor_atual}, ${item.setor_atual},
                ${item.status}, 'em_andamento', ${obs}, NOW())
      `;
      const rIniciar = await tx`UPDATE producao_itempedido SET status='em_andamento', atualizado_em=NOW() WHERE id=${item.id} AND status=${item.status}`;
      if (rIniciar.count === 0) throw new Error(ERRO_CONCORRENCIA);
      // Atualiza status da parcial e registra horário de início
      await tx`
        UPDATE producao_itemparcial
        SET status = 'em_andamento',
            iniciado_em = COALESCE(iniciado_em, NOW()),
            atualizado_em = NOW()
        WHERE item_pedido_id = ${item.id}
          AND setor_atual = ${item.setor_atual}
          AND status IN ('em_aberto', 'recebido')
      `;
      // Finaliza lotes em_trabalho para este item neste setor (chegaram via envio parcial)
      await tx`
        UPDATE producao_loteitem
        SET status = 'concluido', atualizado_em = NOW()
        WHERE item_pedido_id = ${item.id}
          AND setor_destino = ${item.setor_atual}
          AND status = 'em_trabalho'
      `;
    });

  // ── finalizar ─────────────────────────────────────────────────────────────
  } else if (acao === 'finalizar') {
    await sql.begin(async (tx) => {
      await tx`
        INSERT INTO producao_movimentacaoitem
          (item_id, pedido_id, usuario_id, setor_origem, setor_destino,
           status_anterior, status_novo, observacao, criado_em)
        VALUES (${item.id}, ${item.pedido_id}, ${user.id}, ${item.setor_atual}, ${item.setor_atual},
                ${item.status}, 'finalizado_setor', ${obs}, NOW())
      `;
      const rFinalizar = await tx`UPDATE producao_itempedido SET status='finalizado_setor', atualizado_em=NOW() WHERE id=${item.id} AND status=${item.status}`;
      if (rFinalizar.count === 0) throw new Error(ERRO_CONCORRENCIA);
      // Marca parcial do setor como concluida e registra horário de conclusão
      await tx`
        UPDATE producao_itemparcial
        SET status = 'concluida',
            iniciado_em = COALESCE(iniciado_em, NOW()),
            concluido_em = COALESCE(concluido_em, NOW()),
            atualizado_em = NOW()
        WHERE item_pedido_id = ${item.id}
          AND setor_atual = ${item.setor_atual}
          AND status IN ('em_aberto', 'recebido', 'em_andamento')
      `;
    });

  // ── retomar ───────────────────────────────────────────────────────────────
  // Quando vem de 'finalizado_setor', precisa reativar a parcial concluída
  } else if (acao === 'retomar') {
    await sql.begin(async (tx) => {
      await tx`
        INSERT INTO producao_movimentacaoitem
          (item_id, pedido_id, usuario_id, setor_origem, setor_destino,
           status_anterior, status_novo, observacao, criado_em)
        VALUES (${item.id}, ${item.pedido_id}, ${user.id}, ${item.setor_atual}, ${item.setor_atual},
                ${item.status}, 'em_andamento', ${obs || 'Etapa reaberta'}, NOW())
      `;
      const rRetomar = await tx`UPDATE producao_itempedido SET status='em_andamento', atualizado_em=NOW() WHERE id=${item.id} AND status=${item.status}`;
      if (rRetomar.count === 0) throw new Error(ERRO_CONCORRENCIA);
      // Reativa parcial concluída neste setor (caso tenha sido finalizada antes do envio parcial)
      await tx`
        UPDATE producao_itemparcial
        SET status = 'em_andamento', atualizado_em = NOW()
        WHERE item_pedido_id = ${item.id}
          AND setor_atual = ${item.setor_atual}
          AND status = 'concluida'
          AND parcial_origem_id IS NULL
      `;
    });

  // ── despachar ─────────────────────────────────────────────────────────────
  // Alem de mudar o status do item, marca a(s) parcial(is) do item na logistica
  // como em_transito - sem isso, o card da parcial ficava sem saber que o
  // despacho aconteceu e continuava mostrando os botoes de producao.
  } else if (acao === 'despachar') {
    await sql.begin(async (tx) => {
      await tx`
        INSERT INTO producao_movimentacaoitem
          (item_id, pedido_id, usuario_id, setor_origem, setor_destino,
           status_anterior, status_novo, observacao, criado_em)
        VALUES (${item.id}, ${item.pedido_id}, ${user.id}, ${item.setor_atual}, ${item.setor_atual},
                ${item.status}, 'em_transito', ${obs || ''}, NOW())
      `;
      const rDespachar = await tx`UPDATE producao_itempedido SET status='em_transito', atualizado_em=NOW() WHERE id=${item.id} AND status=${item.status}`;
      if (rDespachar.count === 0) throw new Error(ERRO_CONCORRENCIA);
      await tx`
        UPDATE producao_itemparcial
        SET status = 'em_transito', atualizado_em = NOW()
        WHERE item_pedido_id = ${item.id}
          AND setor_atual = 'logistica'
          AND status IN ('finalizado_setor', 'em_andamento', 'concluida')
      `;
    });

  // ── demais ações (pausar, aprovar) ────────────────────────────────────────
  } else {
    await sql.begin(async (tx) => {
      await tx`
        INSERT INTO producao_movimentacaoitem
          (item_id, pedido_id, usuario_id, setor_origem, setor_destino,
           status_anterior, status_novo, observacao, criado_em)
        VALUES (${item.id}, ${item.pedido_id}, ${user.id}, ${item.setor_atual}, ${item.setor_atual},
                ${item.status}, ${novoStatus}, ${obs || ''}, NOW())
      `;
      const rGenerico = await tx`UPDATE producao_itempedido SET status=${novoStatus}, atualizado_em=NOW() WHERE id=${item.id} AND status=${item.status}`;
      if (rGenerico.count === 0) throw new Error(ERRO_CONCORRENCIA);
    });
  }

  return NextResponse.json({ ok: true, status: novoStatus });

  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Erro interno no servidor';
    if (msg.startsWith('CONCORRENCIA_QTD_INDISPONIVEL: '))
      return NextResponse.json({ erro: msg.slice('CONCORRENCIA_QTD_INDISPONIVEL: '.length) }, { status: 400 });
    console.error('[item/acao]', params.acao, err);
    return NextResponse.json({ erro: msg }, { status: 500 });
  }
}