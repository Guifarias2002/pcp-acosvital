/**
 * POST /api/parcial/[id]/acao/[acao]
 *
 * Ações sobre uma parcial individual de um item em produção.
 *
 * Ações disponíveis:
 *   mover     — Move (ou divide) a parcial para outro setor
 *   iniciar   — Marca a parcial como em_andamento no setor atual
 *   concluir  — Marca a parcial como concluida no setor atual
 *   cancelar  — Cancela a parcial (ex: sucata, reprovação parcial)
 *   apontar   — Registra um apontamento de produção para esta parcial
 */
import { NextResponse } from 'next/server';
import sql from '@/lib/db';
import { autenticar, logAcesso } from '@/lib/middleware';
import { nomeSector } from '@/lib/queries';
import { SETOR_CHOICES } from '@/lib/types';
import { checkMutationRateLimit, getClientIp } from '@/lib/rateLimit';
import { runMigrations } from '@/lib/migrations';

const SETORES_VALIDOS = SETOR_CHOICES.map(([cod]) => cod);
const ACOES_VALIDAS = ['mover', 'iniciar', 'finalizar', 'pausar', 'retomar', 'concluir', 'cancelar', 'apontar', 'devolver'] as const;
type Acao = typeof ACOES_VALIDAS[number];

export async function POST(
  req: Request,
  { params }: { params: { id: string; acao: string } }
) {
  try {
  await runMigrations();
  const user = await autenticar(req);
  if (user instanceof NextResponse) return user;
  logAcesso(user, req, `parcial_${params.acao}`);

  if (!checkMutationRateLimit(getClientIp(req)))
    return NextResponse.json({ erro: 'Muitas requisicoes' }, { status: 429 });

  const parcialId = Number(params.id);
  if (!Number.isInteger(parcialId) || parcialId <= 0)
    return NextResponse.json({ erro: 'ID inválido' }, { status: 400 });

  const acao = params.acao as Acao;
  if (!ACOES_VALIDAS.includes(acao))
    return NextResponse.json({ erro: `Ação inválida. Use: ${ACOES_VALIDAS.join(', ')}` }, { status: 400 });

  const body = await req.json().catch(() => ({}));

  // Busca a parcial com dados do item e pedido
  const [parcial] = await sql`
    SELECT
      pa.*,
      pa.quantidade::float AS qtd,
      i.id AS item_id, i.codigo AS item_codigo, i.unidade,
      i.quantidade::float AS item_qtd_total,
      i.pedido_id, i.status AS item_status, i.setor_atual AS item_setor_atual,
      p.numero_pedido_venda
    FROM producao_itemparcial pa
    JOIN producao_itempedido i ON i.id = pa.item_pedido_id
    JOIN producao_pedido p ON p.id = i.pedido_id
    WHERE pa.id = ${parcialId}
  `;
  if (!parcial) return NextResponse.json({ erro: 'Parcial não encontrada' }, { status: 404 });

  // Operadores só podem agir em parciais do próprio setor
  if (!user.is_staff && parcial.setor_atual !== user.setor)
    return NextResponse.json({ erro: 'Acesso negado: parcial não é do seu setor' }, { status: 403 });

  // Parciais concluídas ou canceladas só aceitam 'apontar' e 'retomar' (admin)
  if (['concluida', 'cancelada'].includes(parcial.status) && !['apontar', 'retomar'].includes(acao))
    return NextResponse.json({ erro: `Parcial já está "${parcial.status}" e não pode ser alterada` }, { status: 400 });

  // Parciais pausadas só aceitam retomar, devolver ou apontar
  if (parcial.status === 'pausado' && !['retomar', 'devolver', 'apontar'].includes(acao))
    return NextResponse.json({ erro: 'Parcial está pausada. Use "retomar" para continuar.' }, { status: 400 });

  // Parciais em finalizado_setor só aceitam mover, retomar, concluir, cancelar, devolver, apontar
  if (parcial.status === 'finalizado_setor' && !['mover', 'retomar', 'concluir', 'cancelar', 'devolver', 'apontar'].includes(acao))
    return NextResponse.json({ erro: 'Etapa finalizada. Use "mover" para enviar para o próximo setor ou "retomar" para voltar à produção.' }, { status: 400 });

  const obs = body.observacao || '';

  // ── mover ─────────────────────────────────────────────────────────────────
  if (acao === 'mover') {
    const setor_destino = body.setor_destino as string;
    if (!setor_destino || !SETORES_VALIDOS.includes(setor_destino))
      return NextResponse.json({ erro: 'setor_destino inválido ou não informado' }, { status: 400 });

    const qtdMover = body.quantidade ? Number(body.quantidade) : parcial.qtd;
    if (!qtdMover || qtdMover <= 0)
      return NextResponse.json({ erro: 'Quantidade inválida: deve ser maior que zero' }, { status: 400 });
    if (qtdMover > parcial.qtd)
      return NextResponse.json({
        erro: `Quantidade (${qtdMover}) maior que o disponível na parcial (${parcial.qtd} ${parcial.unidade})`
      }, { status: 400 });

    // Validação de integridade: qtdMover não pode exceder a quantidade total do item
    const [{ soma_ativas }] = await sql`
      SELECT COALESCE(SUM(quantidade)::float, 0) AS soma_ativas
      FROM producao_itemparcial
      WHERE item_pedido_id = ${parcial.item_id}
        AND status NOT IN ('cancelada')
        AND id != ${parcialId}
    `;
    if ((soma_ativas + qtdMover) > (parcial.item_qtd_total + 0.001)) {
      return NextResponse.json({
        erro: `Operação bloqueada: a soma das parciais (${soma_ativas + qtdMover}) ultrapassaria a quantidade total do item (${parcial.item_qtd_total})`
      }, { status: 400 });
    }

    await sql.begin(async (tx) => {
      if (qtdMover < parcial.qtd) {
        // Divisão: reduz a parcial origem e cria parcial filha no destino
        await tx`
          UPDATE producao_itemparcial
          SET quantidade = ${parcial.qtd - qtdMover}, atualizado_em = NOW()
          WHERE id = ${parcialId}
        `;
      } else {
        // Move toda a parcial para o destino
        await tx`
          UPDATE producao_itemparcial
          SET setor_atual = ${setor_destino}, status = 'em_aberto', atualizado_em = NOW()
          WHERE id = ${parcialId}
        `;
      }

      // Cria parcial filha apenas se for divisão
      if (qtdMover < parcial.qtd) {
        await tx`
          INSERT INTO producao_itemparcial
            (item_pedido_id, pedido_id, parcial_origem_id, quantidade, setor_atual, status,
             observacao, criado_por_id, criado_em, atualizado_em)
          VALUES
            (${parcial.item_id}, ${parcial.pedido_id}, ${parcialId}, ${qtdMover}, ${setor_destino},
             'em_aberto', ${obs || null}, ${user.id}, NOW(), NOW())
        `;
      }

      // Cria lote de trânsito para compatibilidade com fluxo de "receber lote" no setor destino
      await tx`
        INSERT INTO producao_loteitem
          (item_pedido_id, setor_origem, setor_destino, quantidade, status, observacao,
           criado_por_id, criado_em, atualizado_em)
        VALUES
          (${parcial.item_id}, ${parcial.setor_atual}, ${setor_destino}, ${qtdMover},
           'em_producao', ${obs || null}, ${user.id}, NOW(), NOW())
      `;

      // Registra movimentação
      await tx`
        INSERT INTO producao_movimentacaoitem
          (item_id, pedido_id, usuario_id, setor_origem, setor_destino,
           status_anterior, status_novo, observacao, criado_em)
        VALUES
          (${parcial.item_id}, ${parcial.pedido_id}, ${user.id},
           ${parcial.setor_atual}, ${setor_destino},
           ${parcial.item_status}, 'aguardando',
           ${`Parcial #${parcialId}: ${qtdMover} ${parcial.unidade} → ${nomeSector(setor_destino)}` +
             (qtdMover < parcial.qtd
               ? `. Saldo em ${nomeSector(parcial.setor_atual)}: ${parcial.qtd - qtdMover} ${parcial.unidade}.`
               : '.')},
           NOW())
      `;

      // Atualiza quantidade_pendente do item somente se ele ainda está no setor de origem
      // (assim não quebra o saldo do item quando parciais já foram divididas antes)
      if (parcial.item_setor_atual === parcial.setor_atual) {
        const [{ pendente }] = await tx`
          SELECT quantidade_pendente::float AS pendente FROM producao_itempedido WHERE id = ${parcial.item_id}
        `;
        const novoP = Math.max(0, pendente - qtdMover);
        await tx`
          UPDATE producao_itempedido
          SET quantidade_pendente = ${novoP}, atualizado_em = NOW()
          WHERE id = ${parcial.item_id}
        `;
      }
    });

    return NextResponse.json({
      ok: true,
      mensagem: `${qtdMover} ${parcial.unidade} movidos de ${nomeSector(parcial.setor_atual)} → ${nomeSector(setor_destino)}`,
    });

  // ── iniciar ───────────────────────────────────────────────────────────────
  } else if (acao === 'iniciar') {
    await sql`
      UPDATE producao_itemparcial
      SET status = 'em_andamento', iniciado_em = COALESCE(iniciado_em, NOW()), atualizado_em = NOW()
      WHERE id = ${parcialId}
    `;
    await sql`
      INSERT INTO producao_movimentacaoitem
        (item_id, pedido_id, usuario_id, setor_origem, setor_destino,
         status_anterior, status_novo, observacao, criado_em)
      VALUES (${parcial.item_id}, ${parcial.pedido_id}, ${user.id},
              ${parcial.setor_atual}, ${parcial.setor_atual},
              ${parcial.item_status}, 'em_andamento',
              ${obs || `Parcial #${parcialId} iniciada em ${nomeSector(parcial.setor_atual)}`}, NOW())
    `;
    return NextResponse.json({ ok: true, status: 'em_andamento' });

  // ── concluir ──────────────────────────────────────────────────────────────
  } else if (acao === 'concluir') {
    await sql.begin(async (tx) => {
      // Marca parcial como concluída
      await tx`
        UPDATE producao_itemparcial
        SET status = 'concluida',
            iniciado_em = COALESCE(iniciado_em, NOW()),
            concluido_em = COALESCE(concluido_em, NOW()),
            atualizado_em = NOW()
        WHERE id = ${parcialId}
      `;

      if (parcial.setor_atual === 'logistica') {
        // Busca o saldo atual de entregues (com lock para evitar race condition)
        const [itemAtual] = await tx`
          SELECT quantidade::float          AS total,
                 COALESCE(quantidade_entregue::float, 0) AS entregue
          FROM producao_itempedido WHERE id = ${parcial.item_id} FOR UPDATE
        `;
        const novaEntregue = Number(itemAtual.entregue) + parcial.qtd;

        // Atualiza entregue e status do item em uma única query
        await tx`
          UPDATE producao_itempedido
          SET quantidade_entregue = ${novaEntregue},
              status = CASE
                WHEN ${novaEntregue} >= quantidade THEN 'entregue'
                ELSE status
              END,
              atualizado_em = NOW()
          WHERE id = ${parcial.item_id}
        `;

        // Se todo o item foi entregue, verifica se o pedido inteiro também foi
        if (novaEntregue >= Number(itemAtual.total) - 0.001) {
          const [{ pendentes }] = await tx`
            SELECT COUNT(*) AS pendentes FROM producao_itempedido
            WHERE pedido_id = ${parcial.pedido_id} AND status != 'entregue'
          `;
          if (Number(pendentes) === 0) {
            await tx`
              UPDATE producao_pedido
              SET status = 'entregue', atualizado_em = NOW()
              WHERE id = ${parcial.pedido_id}
            `;
          }
        }

        // Log de entrega ao cliente
        await tx`
          INSERT INTO producao_movimentacaoitem
            (item_id, pedido_id, usuario_id, setor_origem, setor_destino,
             status_anterior, status_novo, observacao, criado_em)
          VALUES (${parcial.item_id}, ${parcial.pedido_id}, ${user.id},
                  'logistica', 'logistica',
                  ${parcial.item_status},
                  CASE WHEN ${novaEntregue} >= ${Number(itemAtual.total)} THEN 'entregue' ELSE ${parcial.item_status} END,
                  ${obs || `Entregue ao cliente: ${parcial.qtd} ${parcial.unidade} (Pedido ${parcial.numero_pedido_venda})`}, NOW())
        `;
      } else {
        // Outros setores: log padrão de finalização
        await tx`
          INSERT INTO producao_movimentacaoitem
            (item_id, pedido_id, usuario_id, setor_origem, setor_destino,
             status_anterior, status_novo, observacao, criado_em)
          VALUES (${parcial.item_id}, ${parcial.pedido_id}, ${user.id},
                  ${parcial.setor_atual}, ${parcial.setor_atual},
                  ${parcial.item_status}, 'finalizado_setor',
                  ${obs || `Parcial #${parcialId} concluída em ${nomeSector(parcial.setor_atual)}`}, NOW())
        `;
      }
    });
    return NextResponse.json({ ok: true, status: 'concluida' });

  // ── cancelar ──────────────────────────────────────────────────────────────
  } else if (acao === 'cancelar') {
    if (!user.is_staff)
      return NextResponse.json({ erro: 'Apenas administradores podem cancelar parciais' }, { status: 403 });

    await sql.begin(async (tx) => {
      await tx`
        UPDATE producao_itemparcial
        SET status = 'cancelada', atualizado_em = NOW()
        WHERE id = ${parcialId}
      `;
      await tx`
        INSERT INTO producao_movimentacaoitem
          (item_id, pedido_id, usuario_id, setor_origem, setor_destino,
           status_anterior, status_novo, observacao, criado_em)
        VALUES (${parcial.item_id}, ${parcial.pedido_id}, ${user.id},
                ${parcial.setor_atual}, ${parcial.setor_atual},
                ${parcial.item_status}, 'bloqueado',
                ${obs || `Parcial #${parcialId} cancelada`}, NOW())
      `;
    });
    return NextResponse.json({ ok: true, status: 'cancelada' });

  // ── apontar ───────────────────────────────────────────────────────────────
  } else if (acao === 'apontar') {
    const qtdApontada   = Number(body.quantidade_apontada   ?? 0);
    const qtdAprovada   = Number(body.quantidade_aprovada   ?? 0);
    const qtdReprovada  = Number(body.quantidade_reprovada  ?? 0);
    const qtdFinalizada = Number(body.quantidade_finalizada ?? 0);
    const statusAp      = (body.status as string) ?? 'aberto';

    const statusValidos = ['aberto', 'em_andamento', 'finalizado', 'aprovado', 'reprovado'];
    if (!statusValidos.includes(statusAp))
      return NextResponse.json({ erro: `status de apontamento inválido. Use: ${statusValidos.join(', ')}` }, { status: 400 });

    // Valida que aprovada + reprovada não excedem apontada
    if ((qtdAprovada + qtdReprovada) > qtdApontada + 0.001)
      return NextResponse.json({ erro: 'Quantidade aprovada + reprovada não pode exceder quantidade apontada' }, { status: 400 });

    const [{ id: apontamentoId }] = await sql`
      INSERT INTO producao_apontamento
        (parcial_id, item_pedido_id, pedido_id, setor,
         quantidade_apontada, quantidade_aprovada, quantidade_reprovada, quantidade_finalizada,
         status, usuario_id, observacao, criado_em, atualizado_em)
      VALUES
        (${parcialId}, ${parcial.item_id}, ${parcial.pedido_id}, ${parcial.setor_atual},
         ${qtdApontada}, ${qtdAprovada}, ${qtdReprovada}, ${qtdFinalizada},
         ${statusAp}, ${user.id}, ${obs || null}, NOW(), NOW())
      RETURNING id
    `;

    return NextResponse.json({
      ok: true,
      apontamento_id: apontamentoId,
      mensagem: `Apontamento registrado: ${qtdApontada} ${parcial.unidade} apontadas em ${nomeSector(parcial.setor_atual)}`,
    });

  // ── pausar ────────────────────────────────────────────────────────────────
  } else if (acao === 'pausar') {
    if (parcial.status !== 'em_andamento')
      return NextResponse.json({ erro: 'Parcial não está em andamento' }, { status: 400 });

    await sql`
      UPDATE producao_itemparcial
      SET status = 'pausado', atualizado_em = NOW()
      WHERE id = ${parcialId}
    `;
    await sql`
      INSERT INTO producao_movimentacaoitem
        (item_id, pedido_id, usuario_id, setor_origem, setor_destino,
         status_anterior, status_novo, observacao, criado_em)
      VALUES (${parcial.item_id}, ${parcial.pedido_id}, ${user.id},
              ${parcial.setor_atual}, ${parcial.setor_atual},
              'em_andamento', 'pausado',
              ${obs || `Parcial #${parcialId} pausada em ${nomeSector(parcial.setor_atual)}`}, NOW())
    `;
    return NextResponse.json({ ok: true, status: 'pausado' });

  // ── finalizar ─────────────────────────────────────────────────────────────
  // Finaliza a etapa da parcial no setor atual (espelho do "finalizar" do item).
  // Após finalizar, o operador pode enviar para outro setor (mover).
  } else if (acao === 'finalizar') {
    if (parcial.status !== 'em_andamento')
      return NextResponse.json({ erro: 'Parcial não está em andamento' }, { status: 400 });

    await sql.begin(async (tx) => {
      await tx`
        UPDATE producao_itemparcial
        SET status = 'finalizado_setor', atualizado_em = NOW()
        WHERE id = ${parcialId}
      `;
      await tx`
        INSERT INTO producao_movimentacaoitem
          (item_id, pedido_id, usuario_id, setor_origem, setor_destino,
           status_anterior, status_novo, observacao, criado_em)
        VALUES (${parcial.item_id}, ${parcial.pedido_id}, ${user.id},
                ${parcial.setor_atual}, ${parcial.setor_atual},
                'em_andamento', 'finalizado_setor',
                ${obs || `Parcial #${parcialId}: etapa de ${nomeSector(parcial.setor_atual)} finalizada`}, NOW())
      `;
    });
    return NextResponse.json({ ok: true, status: 'finalizado_setor' });

  // ── devolver ──────────────────────────────────────────────────────────────
  } else if (acao === 'devolver') {
    const setor_destino = body.setor_destino as string;
    if (!setor_destino || !SETORES_VALIDOS.includes(setor_destino))
      return NextResponse.json({ erro: 'setor_destino inválido ou não informado' }, { status: 400 });
    if (setor_destino === parcial.setor_atual)
      return NextResponse.json({ erro: 'Setor de devolução deve ser diferente do setor atual' }, { status: 400 });

    await sql.begin(async (tx) => {
      await tx`
        UPDATE producao_itemparcial
        SET setor_atual = ${setor_destino}, status = 'em_aberto',
            concluido_em = NULL, atualizado_em = NOW()
        WHERE id = ${parcialId}
      `;
      await tx`
        INSERT INTO producao_loteitem
          (item_pedido_id, setor_origem, setor_destino, quantidade, status, observacao,
           criado_por_id, criado_em, atualizado_em)
        VALUES
          (${parcial.item_id}, ${parcial.setor_atual}, ${setor_destino}, ${parcial.qtd},
           'em_producao', ${obs || null}, ${user.id}, NOW(), NOW())
      `;
      await tx`
        INSERT INTO producao_movimentacaoitem
          (item_id, pedido_id, usuario_id, setor_origem, setor_destino,
           status_anterior, status_novo, observacao, criado_em)
        VALUES (${parcial.item_id}, ${parcial.pedido_id}, ${user.id},
                ${parcial.setor_atual}, ${setor_destino},
                ${parcial.item_status}, 'aguardando',
                ${obs || `Parcial #${parcialId} devolvida de ${nomeSector(parcial.setor_atual)} → ${nomeSector(setor_destino)}`}, NOW())
      `;
    });
    return NextResponse.json({ ok: true, status: 'em_aberto', mensagem: `Devolvida para ${nomeSector(setor_destino)}` });

  // ── retomar ───────────────────────────────────────────────────────────────
  } else if (acao === 'retomar') {
    // Operadores podem retomar do estado pausado; admin pode retomar de qualquer estado inativo
    const podeRetomar = ['pausado', 'finalizado_setor'].includes(parcial.status)
      || (user.is_staff && ['concluida', 'cancelada'].includes(parcial.status));
    if (!podeRetomar)
      return NextResponse.json({ erro: 'Apenas parciais pausadas (ou concluídas para admins) podem ser retomadas' }, { status: 403 });

    await sql.begin(async (tx) => {
      await tx`
        UPDATE producao_itemparcial
        SET status = 'em_andamento',
            concluido_em = NULL,
            iniciado_em = COALESCE(iniciado_em, NOW()),
            atualizado_em = NOW()
        WHERE id = ${parcialId}
      `;
      if (user.is_staff) {
        // Se o item estava finalizado_setor no mesmo setor, reverte também
        await tx`
          UPDATE producao_itempedido
          SET status = 'em_andamento', atualizado_em = NOW()
          WHERE id = ${parcial.item_id}
            AND setor_atual = ${parcial.setor_atual}
            AND status = 'finalizado_setor'
        `;
      }
      await tx`
        INSERT INTO producao_movimentacaoitem
          (item_id, pedido_id, usuario_id, setor_origem, setor_destino,
           status_anterior, status_novo, observacao, criado_em)
        VALUES (${parcial.item_id}, ${parcial.pedido_id}, ${user.id},
                ${parcial.setor_atual}, ${parcial.setor_atual},
                ${parcial.status}, 'em_andamento',
                ${obs || `Parcial #${parcialId} retomada em ${nomeSector(parcial.setor_atual)}`}, NOW())
      `;
    });
    return NextResponse.json({ ok: true, status: 'em_andamento' });
  }

  return NextResponse.json({ erro: 'Ação não processada' }, { status: 500 });

  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Erro interno no servidor';
    console.error('[parcial/acao]', params.acao, err);
    return NextResponse.json({ erro: msg }, { status: 500 });
  }
}
