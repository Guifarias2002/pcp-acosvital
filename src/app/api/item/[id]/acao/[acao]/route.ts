import { NextResponse } from 'next/server';
import sql from '@/lib/db';
import { autenticar, logAcesso } from '@/lib/middleware';
import { nomeSector } from '@/lib/queries';
import { SETOR_CHOICES } from '@/lib/types';
import { checkMutationRateLimit, getClientIp } from '@/lib/rateLimit';

const SETORES_VALIDOS = SETOR_CHOICES.map(([cod]) => cod);

const TRANSICOES: Record<string, string[]> = {
  liberar: ['emitido'],
  receber: ['aguardando'],
  iniciar: ['recebido'],
  pausar: ['em_andamento'],
  retomar: ['pausado'],
  finalizar: ['em_andamento', 'pausado', 'finalizado_setor'],
  enviar_tudo: ['finalizado_setor', 'aguardando', 'recebido', 'em_andamento', 'pausado'],
  enviar_parcial: ['finalizado_setor', 'aguardando', 'recebido', 'em_andamento', 'pausado'],
  despachar: ['recebido'],
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
  const rows = await (tx as typeof sql)`
    SELECT id, quantidade::float AS quantidade
    FROM producao_itemparcial
    WHERE item_pedido_id = ${itemId}
      AND setor_atual = ${setor}
      AND status IN ('em_aberto', 'em_andamento')
    ORDER BY criado_em ASC
    LIMIT 1
  `;
  return rows[0] ?? null;
}

/**
 * Move a parcial principal de um item de um setor para outro.
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
  const parcial = await getParcialAtiva(tx, itemId, setorOrigem);
  if (parcial) {
    await tx`
      UPDATE producao_itemparcial
      SET setor_atual = ${setorDestino}, status = 'em_aberto', atualizado_em = NOW()
      WHERE id = ${parcial.id}
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
  const user = await autenticar(req);
  if (user instanceof NextResponse) return user;
  logAcesso(user, req, params.acao);

  if (!checkMutationRateLimit(getClientIp(req)))
    return NextResponse.json({ erro: 'Muitas requisicoes' }, { status: 429 });

  const { id, acao } = params;

  const itemId = Number(id);
  if (!Number.isInteger(itemId) || itemId <= 0)
    return NextResponse.json({ erro: 'ID invalido' }, { status: 400 });

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

  if (!user.is_staff && item.setor_atual !== user.setor)
    return NextResponse.json({ erro: 'Acesso negado' }, { status: 403 });

  const statusesPermitidos = TRANSICOES[acao] || [];
  if (!statusesPermitidos.includes(item.status))
    return NextResponse.json({ erro: `Acao "${acao}" nao permitida no status "${item.status}"` }, { status: 400 });

  const roteiro = (item.roteiro_proprio && item.roteiro_proprio.length > 0)
    ? item.roteiro_proprio as string[]
    : item.roteiro_base as string[];
  const idx = roteiro.indexOf(item.setor_atual);
  const proximoSetorRoteiro = (idx >= 0 && idx < roteiro.length - 1) ? roteiro[idx + 1] : null;
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
      await tx`
        UPDATE producao_itempedido
        SET status = 'aguardando', setor_atual = ${proximoSetor}, atualizado_em = NOW()
        WHERE id = ${item.id}
      `;
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
      await tx`
        UPDATE producao_itempedido
        SET status = 'aguardando', setor_atual = ${proximoSetor}, atualizado_em = NOW()
        WHERE id = ${item.id}
      `;
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
    if (qtd > qtdPendente)
      return NextResponse.json({
        erro: `Quantidade invalida: solicitado ${qtd}, disponivel ${qtdPendente} ${item.unidade}`
      }, { status: 400 });
    if (!proximoSetor)
      return NextResponse.json({ erro: 'Nao ha proximo setor no roteiro' }, { status: 400 });

    // Se a quantidade pedida >= pendente, converte em enviar_tudo
    if (qtd >= qtdPendente) {
      await sql.begin(async (tx) => {
        await tx`
          INSERT INTO producao_movimentacaoitem
            (item_id, pedido_id, usuario_id, setor_origem, setor_destino,
             status_anterior, status_novo, observacao, criado_em)
          VALUES (${item.id}, ${item.pedido_id}, ${user.id}, ${item.setor_atual}, ${proximoSetor},
                  ${item.status}, 'aguardando', ${obs}, NOW())
        `;
        await tx`UPDATE producao_itempedido SET status='aguardando', setor_atual=${proximoSetor}, atualizado_em=NOW() WHERE id=${item.id}`;
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

    // Envio parcial real: divide a quantidade
    await sql.begin(async (tx) => {
      // 1. Valida integridade: soma das parciais ativas + em_andamento deve cobrir qtdPendente
      //    (garantia extra — o CHECK constraint no DB protege contra negativo)

      // 2. Busca parcial ativa no setor de origem
      const parcialOrigem = await getParcialAtiva(
        tx as unknown as typeof sql,
        item.id,
        item.setor_atual
      );

      let parcialOrigemId: number | null = null;

      if (parcialOrigem) {
        const qtdParcial = parcialOrigem.quantidade;

        if (qtd > qtdParcial) {
          throw new Error(
            `Quantidade solicitada (${qtd}) maior que a parcial disponivel no setor (${qtdParcial})`
          );
        }

        if (qtd < qtdParcial) {
          // Divide: reduz parcial origem
          await tx`
            UPDATE producao_itemparcial
            SET quantidade = ${qtdParcial - qtd}, atualizado_em = NOW()
            WHERE id = ${parcialOrigem.id}
          `;
        } else {
          // Toda a parcial vai para o destino — parcial origem fica com 0; cancela
          await tx`
            UPDATE producao_itemparcial
            SET status = 'cancelada', quantidade = ${qtd}, atualizado_em = NOW()
            WHERE id = ${parcialOrigem.id}
          `;
        }
        parcialOrigemId = parcialOrigem.id;
      } else {
        // Item sem parcial (anterior ao sistema): cria parcial restante na origem
        const qtdRestante = qtdPendente - qtd;
        if (qtdRestante > 0) {
          await tx`
            INSERT INTO producao_itemparcial
              (item_pedido_id, pedido_id, quantidade, setor_atual, status, observacao, criado_por_id, criado_em, atualizado_em)
            VALUES
              (${item.id}, ${item.pedido_id}, ${qtdRestante}, ${item.setor_atual},
               'em_aberto', 'Saldo remanescente — migração', ${user.id}, NOW(), NOW())
          `;
        }
      }

      // 3. Cria nova parcial filha no setor de destino
      await tx`
        INSERT INTO producao_itemparcial
          (item_pedido_id, pedido_id, parcial_origem_id, quantidade, setor_atual, status,
           observacao, criado_por_id, criado_em, atualizado_em)
        VALUES
          (${item.id}, ${item.pedido_id}, ${parcialOrigemId}, ${qtd}, ${proximoSetor},
           'em_aberto', ${obs || null}, ${user.id}, NOW(), NOW())
      `;

      // 4. Cria lote de trânsito (compatibilidade com fluxo de "receber lote" nos setores)
      await tx`
        INSERT INTO producao_loteitem
          (item_pedido_id, setor_origem, setor_destino, quantidade, status, observacao,
           criado_por_id, criado_em, atualizado_em)
        VALUES
          (${item.id}, ${item.setor_atual}, ${proximoSetor}, ${qtd}, 'em_producao',
           ${obs || null}, ${user.id}, NOW(), NOW())
      `;

      // 5. Registra movimentação
      await tx`
        INSERT INTO producao_movimentacaoitem
          (item_id, pedido_id, usuario_id, setor_origem, setor_destino,
           status_anterior, status_novo, observacao, criado_em)
        VALUES
          (${item.id}, ${item.pedido_id}, ${user.id}, ${item.setor_atual}, ${proximoSetor},
           ${item.status}, 'aguardando',
           ${`Parcial: ${qtd} ${item.unidade} → ${nomeSector(proximoSetor)}. Saldo em ${nomeSector(item.setor_atual)}: ${qtdPendente - qtd} ${item.unidade}`},
           NOW())
      `;

      // 6. Atualiza quantidade_pendente do item (saldo restante na origem)
      const novaQtdPendente = qtdPendente - qtd;
      await tx`
        UPDATE producao_itempedido
        SET quantidade_pendente = ${novaQtdPendente}, atualizado_em = NOW()
        WHERE id = ${item.id}
      `;
    });

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
      await tx`UPDATE producao_itempedido SET status='aguardando', setor_atual=${destino}, atualizado_em=NOW() WHERE id=${item.id}`;
      await moverParcialInteira(
        tx as unknown as typeof sql,
        item.id, item.pedido_id,
        item.setor_atual, destino,
        Number(item.quantidade_pendente), user.id, obs || 'Devolução'
      );
    });

  // ── entregar ──────────────────────────────────────────────────────────────
  } else if (acao === 'entregar') {
    await sql.begin(async (tx) => {
      const [locked] = await tx`
        SELECT id, quantidade_entregue, quantidade_pendente
        FROM producao_itempedido WHERE id = ${item.id} FOR UPDATE
      `;
      const qtdEntregue = Number(locked.quantidade_entregue || 0) + Number(locked.quantidade_pendente);
      await tx`
        INSERT INTO producao_movimentacaoitem
          (item_id, pedido_id, usuario_id, setor_origem, setor_destino,
           status_anterior, status_novo, observacao, criado_em)
        VALUES (${item.id}, ${item.pedido_id}, ${user.id}, ${item.setor_atual}, '',
                ${item.status}, 'entregue', ${obs || ''}, NOW())
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
        WHERE item_pedido_id = ${item.id} AND status IN ('em_aberto', 'em_andamento')
      `;
      const [{ pendentes }] = await tx`
        SELECT COUNT(*) AS pendentes FROM producao_itempedido
        WHERE pedido_id = ${item.pedido_id} AND status != 'entregue'
      `;
      if (Number(pendentes) === 0) {
        await tx`UPDATE producao_pedido SET status='entregue', atualizado_em=NOW() WHERE id=${item.pedido_id}`;
      }
    });

  // ── receber ───────────────────────────────────────────────────────────────
  } else if (acao === 'receber') {
    const qtdReceber = body.quantidade ? Number(body.quantidade) : null;
    const qtdTotal = Number(item.quantidade_pendente);
    if (qtdReceber && qtdReceber > 0 && qtdReceber < qtdTotal) {
      const qtdRestante = qtdTotal - qtdReceber;
      const idxAtual = roteiro.indexOf(item.setor_atual);
      const setorAnterior = idxAtual > 0 ? roteiro[idxAtual - 1] : item.setor_atual;
      await sql.begin(async (tx) => {
        // Cria lote para o restante
        await tx`
          INSERT INTO producao_loteitem
            (item_pedido_id, setor_origem, setor_destino, quantidade, status, observacao,
             criado_por_id, criado_em, atualizado_em)
          VALUES
            (${item.id}, ${setorAnterior}, ${item.setor_atual}, ${qtdRestante}, 'em_producao',
             ${`Restante parcial: ${qtdRestante} de ${qtdTotal} ${item.unidade}`},
             ${user.id}, NOW(), NOW())
        `;
        // Cria parcial para o restante que ficou no setor anterior
        await tx`
          INSERT INTO producao_itemparcial
            (item_pedido_id, pedido_id, quantidade, setor_atual, status, observacao,
             criado_por_id, criado_em, atualizado_em)
          VALUES
            (${item.id}, ${item.pedido_id}, ${qtdRestante}, ${setorAnterior},
             'em_aberto', ${`Restante não recebido: ${qtdRestante} ${item.unidade}`},
             ${user.id}, NOW(), NOW())
        `;
        const obsReceber = `Recebido ${qtdReceber} de ${qtdTotal} ${item.unidade}. Restam ${qtdRestante} ${item.unidade} no setor anterior.`;
        await tx`
          INSERT INTO producao_movimentacaoitem
            (item_id, pedido_id, usuario_id, setor_origem, setor_destino,
             status_anterior, status_novo, observacao, criado_em)
          VALUES (${item.id}, ${item.pedido_id}, ${user.id}, ${item.setor_atual}, ${item.setor_atual},
                  ${item.status}, 'recebido', ${obsReceber}, NOW())
        `;
        await tx`
          UPDATE producao_itempedido
          SET status='recebido', quantidade_pendente=${qtdReceber}, atualizado_em=NOW()
          WHERE id=${item.id}
        `;
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
        await tx`UPDATE producao_itempedido SET status='recebido', atualizado_em=NOW() WHERE id=${item.id}`;
        await tx`UPDATE producao_pedido SET setor_atual=${item.setor_atual}, atualizado_em=NOW() WHERE id=${item.pedido_id}`;
        // Marca parcial do setor como em_andamento
        await tx`
          UPDATE producao_itemparcial
          SET status = 'em_andamento', atualizado_em = NOW()
          WHERE item_pedido_id = ${item.id}
            AND setor_atual = ${item.setor_atual}
            AND status = 'em_aberto'
        `;
      });
    }

  // ── reprovar ──────────────────────────────────────────────────────────────
  } else if (acao === 'reprovar') {
    await registrarMovItem(item.id, item.pedido_id, user.id, item.setor_atual, item.setor_atual, item.status, 'reprovado', obs || 'Reprovado na inspeção');
    await sql`UPDATE producao_itempedido SET status='reprovado', atualizado_em=NOW() WHERE id=${item.id}`;
    try {
      await sql`
        INSERT INTO producao_divergencia
          (pedido_id, item_id, usuario_id, tipo, descricao, setor_responsavel, status, prioridade, criado_em, atualizado_em)
        VALUES (
          ${item.pedido_id}, ${item.id}, ${user.id}, 'qualidade',
          ${obs || 'Item reprovado na inspeção de qualidade'},
          ${item.setor_atual}, 'aberta', 'alta', NOW(), NOW()
        )
      `;
    } catch { /* tabela pode não existir ainda */ }

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
      await tx`UPDATE producao_itempedido SET status='aguardando', setor_atual=${destino}, atualizado_em=NOW() WHERE id=${item.id}`;
      await moverParcialInteira(
        tx as unknown as typeof sql,
        item.id, item.pedido_id,
        item.setor_atual, destino,
        Number(item.quantidade_pendente), user.id, obsRet
      );
    });
    try {
      await sql`
        UPDATE producao_divergencia SET status='em_analise',
          observacao_resolucao=${`Encaminhado para retrabalho: ${destino}`}, atualizado_em=NOW()
        WHERE item_id=${item.id} AND status='aberta'
      `;
    } catch { /* ok */ }

  // ── resolver ──────────────────────────────────────────────────────────────
  } else if (acao === 'resolver') {
    const obsRes = obs || 'Resolvido internamente pela qualidade';
    await registrarMovItem(item.id, item.pedido_id, user.id, item.setor_atual, item.setor_atual, item.status, 'finalizado_setor', obsRes);
    await sql`UPDATE producao_itempedido SET status='finalizado_setor', atualizado_em=NOW() WHERE id=${item.id}`;
    try {
      await sql`
        UPDATE producao_divergencia SET status='resolvida', resolvido_em=NOW(),
          resolvido_por_id=${user.id}, observacao_resolucao=${obsRes}, atualizado_em=NOW()
        WHERE item_id=${item.id} AND status IN ('aberta','em_analise')
      `;
    } catch { /* ok */ }

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
      await tx`UPDATE producao_itempedido SET status='bloqueado', atualizado_em=NOW() WHERE id=${item.id}`;
      // Cancela todas as parciais ativas do item
      await tx`
        UPDATE producao_itemparcial
        SET status = 'cancelada', atualizado_em = NOW()
        WHERE item_pedido_id = ${item.id} AND status IN ('em_aberto', 'em_andamento')
      `;
    });
    try {
      await sql`
        UPDATE producao_divergencia SET status='cancelada', resolvido_em=NOW(),
          resolvido_por_id=${user.id}, observacao_resolucao=${obsCan}, atualizado_em=NOW()
        WHERE item_id=${item.id} AND status IN ('aberta','em_analise')
      `;
    } catch { /* ok */ }

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
      await tx`UPDATE producao_itempedido SET status='em_andamento', atualizado_em=NOW() WHERE id=${item.id}`;
      // Atualiza status da parcial
      await tx`
        UPDATE producao_itemparcial
        SET status = 'em_andamento', atualizado_em = NOW()
        WHERE item_pedido_id = ${item.id}
          AND setor_atual = ${item.setor_atual}
          AND status IN ('em_aberto')
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
      await tx`UPDATE producao_itempedido SET status='finalizado_setor', atualizado_em=NOW() WHERE id=${item.id}`;
      // Marca parcial do setor como concluida (pronta para ser enviada)
      await tx`
        UPDATE producao_itemparcial
        SET status = 'concluida', atualizado_em = NOW()
        WHERE item_pedido_id = ${item.id}
          AND setor_atual = ${item.setor_atual}
          AND status IN ('em_aberto', 'em_andamento')
      `;
    });

  // ── demais ações (pausar, retomar, aprovar, despachar) ────────────────────
  } else {
    await registrarMovItem(item.id, item.pedido_id, user.id, item.setor_atual, item.setor_atual, item.status, novoStatus, obs);
    await sql`UPDATE producao_itempedido SET status=${novoStatus}, atualizado_em=NOW() WHERE id=${item.id}`;
  }

  return NextResponse.json({ ok: true, status: novoStatus });
}
