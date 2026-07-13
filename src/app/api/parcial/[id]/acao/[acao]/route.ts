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
import { isAdministrador } from '@/lib/auth';
import { nomeSector } from '@/lib/queries';
import { SETOR_CHOICES } from '@/lib/types';
import { checkMutationRateLimit, getClientIp } from '@/lib/rateLimit';

export const dynamic = 'force-dynamic';
const SETORES_VALIDOS = SETOR_CHOICES.map(([cod]) => cod);
const ACOES_VALIDAS = ['mover', 'iniciar', 'finalizar', 'pausar', 'retomar', 'concluir', 'cancelar', 'apontar', 'devolver', 'receber', 'desfazer_recebimento'] as const;
type Acao = typeof ACOES_VALIDAS[number];

export async function POST(
  req: Request,
  { params }: { params: { id: string; acao: string } }
) {
  try {
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

  // Parciais canceladas só aceitam 'apontar' e 'retomar' (admin)
  if (parcial.status === 'cancelada' && !['apontar', 'retomar'].includes(acao))
    return NextResponse.json({ erro: `Parcial já está "${parcial.status}" e não pode ser alterada` }, { status: 400 });

  // Parciais concluídas também podem ser encaminhadas pra outro setor ('mover'),
  // além de 'apontar' e 'retomar' — pedido explícito: "concluída" não deve ser
  // um beco sem saída, o operador tem que poder mandar pra frente se precisar.
  if (parcial.status === 'concluida' && !['apontar', 'retomar', 'mover'].includes(acao))
    return NextResponse.json({ erro: `Parcial já está "${parcial.status}" e não pode ser alterada` }, { status: 400 });

  // Parciais pausadas só aceitam retomar, devolver, mover, concluir ou apontar
  if (parcial.status === 'pausado' && !['retomar', 'devolver', 'mover', 'concluir', 'apontar'].includes(acao))
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
        erro: `Quantidade informada (${qtdMover} ${parcial.unidade}) é maior do que o disponível nesta parcial (${parcial.qtd} ${parcial.unidade})`
      }, { status: 400 });

    // Validação de integridade (fast-fail, fora da tx): qtdMover não pode exceder
    // a quantidade total do item. Reconfirmada sob lock dentro da transação abaixo,
    // pois esta leitura pode estar desatualizada por uma requisição concorrente.
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
      // Trava por item — evita duas requisições concorrentes (duplo clique, dois
      // usuários) movendo/dividindo parciais do mesmo item ao mesmo tempo e
      // ultrapassando a quantidade total (mesma proteção usada em enviar_parcial,
      // ver item/[id]/acao/[acao]/route.ts).
      await (tx as unknown as typeof sql)`SELECT pg_advisory_xact_lock(778899, ${parcial.item_id})`;

      // Revalida a própria parcial sob o lock — a leitura inicial (fora da tx) pode
      // estar desatualizada se outra requisição concorrente já alterou esta parcial
      // enquanto esta esperava o lock.
      const [parcialAtual] = await (tx as unknown as typeof sql)`
        SELECT quantidade::float AS quantidade, status
        FROM producao_itemparcial WHERE id = ${parcialId} FOR UPDATE
      `;
      if (!parcialAtual || parcialAtual.status !== parcial.status)
        throw new Error('CONCORRENCIA_QTD_INDISPONIVEL: Esta parcial foi alterada por outra operação enquanto você aguardava. Recarregue a tela e tente novamente.');

      const qtdAtual = parcialAtual.quantidade as number;
      if (qtdMover > qtdAtual)
        throw new Error(`CONCORRENCIA_QTD_INDISPONIVEL: Quantidade não está mais disponível (outra operação concorrente alterou o saldo). Disponível agora: ${qtdAtual} ${parcial.unidade}. Tente novamente.`);

      // Revalida a soma das demais parciais ativas sob o lock — mesma checagem de
      // integridade feita fora da tx, agora com dados frescos e travados.
      const outrasAtivas = await (tx as unknown as typeof sql)`
        SELECT quantidade::float AS quantidade
        FROM producao_itemparcial
        WHERE item_pedido_id = ${parcial.item_id}
          AND status NOT IN ('cancelada')
          AND id != ${parcialId}
        FOR UPDATE
      `;
      const somaAtivasLock = outrasAtivas.reduce((s: number, p: Record<string, unknown>) => s + Number(p.quantidade), 0);
      if ((somaAtivasLock + qtdMover) > (parcial.item_qtd_total + 0.001))
        throw new Error(`CONCORRENCIA_QTD_INDISPONIVEL: Operação bloqueada: a soma das parciais (${somaAtivasLock + qtdMover}) ultrapassaria a quantidade total do item (${parcial.item_qtd_total})`);

      if (qtdMover < qtdAtual) {
        // Divisão: reduz a parcial origem e cria parcial filha no destino
        await tx`
          UPDATE producao_itemparcial
          SET quantidade = ${qtdAtual - qtdMover}, atualizado_em = NOW()
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
      if (qtdMover < qtdAtual) {
        await tx`
          INSERT INTO producao_itemparcial
            (item_pedido_id, pedido_id, parcial_origem_id, quantidade, setor_atual, status,
             observacao, criado_por_id, criado_em, atualizado_em)
          VALUES
            (${parcial.item_id}, ${parcial.pedido_id}, ${parcialId}, ${qtdMover}, ${setor_destino},
             'em_aberto', ${obs || null}, ${user.id}, NOW(), NOW())
        `;
      }


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
             (qtdMover < qtdAtual
               ? `. Saldo em ${nomeSector(parcial.setor_atual)}: ${qtdAtual - qtdMover} ${parcial.unidade}.`
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

      // Se o item ficou sem parciais ativas no seu setor atual, avança para o setor destino
      const [{ restantes }] = await tx`
        SELECT COUNT(*)::int AS restantes
        FROM producao_itemparcial
        WHERE item_pedido_id = ${parcial.item_id}
          AND setor_atual = ${parcial.item_setor_atual}
          AND status NOT IN ('cancelada', 'concluida')
          AND id != ${parcialId}
      `;
      if (Number(restantes) === 0) {
        // Recalcula quantidade_pendente = total de parciais ativas no destino (inclui a que acabou de chegar)
        const [{ total_destino }] = await tx`
          SELECT COALESCE(SUM(quantidade)::float, 0) AS total_destino
          FROM producao_itemparcial
          WHERE item_pedido_id = ${parcial.item_id}
            AND setor_atual = ${setor_destino}
            AND status NOT IN ('cancelada', 'concluida')
        `;
        await tx`
          UPDATE producao_itempedido
          SET setor_atual = ${setor_destino}, status = 'aguardando',
              quantidade_pendente = ${total_destino}, atualizado_em = NOW()
          WHERE id = ${parcial.item_id}
        `;
      }
    });

    return NextResponse.json({
      ok: true,
      mensagem: `${qtdMover} ${parcial.unidade} movidos de ${nomeSector(parcial.setor_atual)} → ${nomeSector(setor_destino)}`,
    });

  // ── receber ── reconhece o recebimento SEM iniciar a produção (em_aberto → recebido) ─
  //    O cronometro so comeca quando o usuario clicar em "iniciar" separadamente.
  } else if (acao === 'receber') {
    if (parcial.status !== 'em_aberto')
      return NextResponse.json({ erro: 'Parcial não está em aberto para recebimento' }, { status: 400 });
    await sql.begin(async (tx) => {
      await tx`
        UPDATE producao_itemparcial
        SET status = 'recebido',
            atualizado_em = NOW(),
            observacao = CASE WHEN ${obs} != '' THEN ${obs} ELSE observacao END
        WHERE id = ${parcialId}
      `;
      await tx`
        UPDATE producao_itempedido
        SET status = 'recebido', atualizado_em = NOW()
        WHERE id = ${parcial.item_id} AND status IN ('aguardando', 'emitido')
      `;
      await tx`
        INSERT INTO producao_movimentacaoitem
          (item_id, pedido_id, usuario_id, setor_origem, setor_destino,
           status_anterior, status_novo, observacao, criado_em)
        VALUES (${parcial.item_id}, ${parcial.pedido_id}, ${user.id},
                ${parcial.setor_atual}, ${parcial.setor_atual},
                ${parcial.item_status}, 'recebido',
                ${obs || `Parcial #${parcialId} recebida em ${nomeSector(parcial.setor_atual)} — aguardando início`}, NOW())
      `;
    });
    return NextResponse.json({ ok: true, status: 'recebido', mensagem: 'Parcial recebida — clique em Iniciar quando estiver pronto' });

  // ── iniciar ───────────────────────────────────────────────────────────────
  } else if (acao === 'iniciar') {
    await sql.begin(async (tx) => {
      await tx`
        UPDATE producao_itemparcial
        SET status = 'em_andamento', iniciado_em = COALESCE(iniciado_em, NOW()), atualizado_em = NOW()
        WHERE id = ${parcialId}
      `;
      await tx`
        INSERT INTO producao_movimentacaoitem
          (item_id, pedido_id, usuario_id, setor_origem, setor_destino,
           status_anterior, status_novo, observacao, criado_em)
        VALUES (${parcial.item_id}, ${parcial.pedido_id}, ${user.id},
                ${parcial.setor_atual}, ${parcial.setor_atual},
                ${parcial.item_status}, 'em_andamento',
                ${obs || `Parcial #${parcialId} iniciada em ${nomeSector(parcial.setor_atual)}`}, NOW())
      `;
    });
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
        // Busca o saldo atual de entregues/pendentes (com lock para evitar race condition)
        const [itemAtual] = await tx`
          SELECT quantidade::float          AS total,
                 COALESCE(quantidade_entregue::float, 0) AS entregue,
                 COALESCE(quantidade_pendente::float, 0) AS pendente
          FROM producao_itempedido WHERE id = ${parcial.item_id} FOR UPDATE
        `;
        const novaEntregue = Number(itemAtual.entregue) + parcial.qtd;
        const novoPendente = Math.max(0, Number(itemAtual.pendente) - parcial.qtd);

        // Decrementa quantidade_pendente junto - se ficasse parada aqui, uma entrega
        // total posterior via /api/item/[id]/entregar somaria entregue + pendente
        // usando um saldo desatualizado, contando esta parcial em dobro.
        await tx`
          UPDATE producao_itempedido
          SET quantidade_entregue = ${novaEntregue},
              quantidade_pendente = ${novoPendente},
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
  // Aceita tambem em_aberto/recebido: e o caminho usado para reportar uma
  // divergencia no recebimento, antes da producao ter comecado de fato.
  } else if (acao === 'pausar') {
    if (!['em_andamento', 'em_aberto', 'recebido'].includes(parcial.status))
      return NextResponse.json({ erro: 'Parcial não pode ser pausada neste status' }, { status: 400 });

    await sql.begin(async (tx) => {
      await tx`
        UPDATE producao_itemparcial
        SET status = 'pausado', atualizado_em = NOW()
        WHERE id = ${parcialId}
      `;
      await tx`
        INSERT INTO producao_movimentacaoitem
          (item_id, pedido_id, usuario_id, setor_origem, setor_destino,
           status_anterior, status_novo, observacao, criado_em)
        VALUES (${parcial.item_id}, ${parcial.pedido_id}, ${user.id},
                ${parcial.setor_atual}, ${parcial.setor_atual},
                ${parcial.status}, 'pausado',
                ${obs || `Parcial #${parcialId} pausada em ${nomeSector(parcial.setor_atual)}`}, NOW())
      `;
    });
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

    // tipo 'correcao' = devolução por engano / recebimento errado (NÃO é retrabalho).
    // Qualquer outro valor (ou ausência) mantém o comportamento de retrabalho,
    // preservando o fluxo de divergência da Inspeção de Qualidade. O sinal de
    // "correção" no destino é retrabalho=FALSE + devolvido_de preenchido.
    const ehCorrecao = body.tipo === 'correcao';

    await sql.begin(async (tx) => {
      await tx`
        UPDATE producao_itemparcial
        SET setor_atual = ${setor_destino}, status = 'em_aberto',
            concluido_em = NULL, atualizado_em = NOW(),
            retrabalho = ${!ehCorrecao},
            motivo_retrabalho = ${obs || null},
            devolvido_de = ${parcial.setor_atual}
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

      // Se o item ficou sem parciais ativas no setor de origem, atualiza setor_atual do item
      const [{ restantes }] = await tx`
        SELECT COUNT(*)::int AS restantes
        FROM producao_itemparcial
        WHERE item_pedido_id = ${parcial.item_id}
          AND setor_atual = ${parcial.setor_atual}
          AND status NOT IN ('cancelada', 'concluida')
          AND id != ${parcialId}
      `;
      if (Number(restantes) === 0) {
        const [{ total_destino }] = await tx`
          SELECT COALESCE(SUM(quantidade)::float, 0) AS total_destino
          FROM producao_itemparcial
          WHERE item_pedido_id = ${parcial.item_id}
            AND setor_atual = ${setor_destino}
            AND status NOT IN ('cancelada', 'concluida')
        `;
        await tx`
          UPDATE producao_itempedido
          SET setor_atual = ${setor_destino}, status = 'aguardando',
              quantidade_pendente = ${total_destino}, atualizado_em = NOW()
          WHERE id = ${parcial.item_id}
        `;
      }
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

  // ── desfazer_recebimento ────────────────────────────────────────────────────
  // Reverte uma parcial recebida de volta para "em_aberto" (o botão "Receber
  // Tudo" volta a aparecer). Ação restrita a administradores.
  } else if (acao === 'desfazer_recebimento') {
    if (!isAdministrador(user))
      return NextResponse.json({ erro: 'Apenas administradores podem desfazer o recebimento' }, { status: 403 });
    if (parcial.status !== 'recebido')
      return NextResponse.json({ erro: 'Só é possível desfazer o recebimento de parciais no status "recebido"' }, { status: 400 });

    await sql.begin(async (tx) => {
      // Repete "AND status = 'recebido'" na própria condição do UPDATE — a checagem
      // acima foi feita fora da transação e pode estar desatualizada se outra ação
      // (ex: "iniciar") mudou o status desta parcial entre a leitura e a escrita.
      const r = await tx`
        UPDATE producao_itemparcial
        SET status = 'em_aberto', atualizado_em = NOW()
        WHERE id = ${parcialId} AND status = 'recebido'
      `;
      if (r.count === 0)
        throw new Error('CONCORRENCIA_QTD_INDISPONIVEL: Esta parcial não está mais "recebido" (outra ação a alterou enquanto você aguardava). Recarregue a tela e tente novamente.');
      // Se o item não tem mais nenhuma parcial recebida neste setor, volta para 'aguardando'
      const [{ recebidas }] = await tx`
        SELECT COUNT(*)::int AS recebidas
        FROM producao_itemparcial
        WHERE item_pedido_id = ${parcial.item_id}
          AND setor_atual = ${parcial.setor_atual}
          AND status = 'recebido'
          AND id != ${parcialId}
      `;
      if (Number(recebidas) === 0) {
        await tx`
          UPDATE producao_itempedido
          SET status = 'aguardando', atualizado_em = NOW()
          WHERE id = ${parcial.item_id} AND status = 'recebido'
        `;
      }
      await tx`
        INSERT INTO producao_movimentacaoitem
          (item_id, pedido_id, usuario_id, setor_origem, setor_destino,
           status_anterior, status_novo, observacao, criado_em)
        VALUES (${parcial.item_id}, ${parcial.pedido_id}, ${user.id},
                ${parcial.setor_atual}, ${parcial.setor_atual},
                'recebido', 'aguardando',
                ${obs || `Recebimento desfeito (parcial #${parcialId}) em ${nomeSector(parcial.setor_atual)}`}, NOW())
      `;
    });
    return NextResponse.json({ ok: true, status: 'em_aberto', mensagem: 'Recebimento desfeito' });
  }

  return NextResponse.json({ erro: 'Ação não processada' }, { status: 500 });

  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Erro interno no servidor';
    if (msg.startsWith('CONCORRENCIA_QTD_INDISPONIVEL: '))
      return NextResponse.json({ erro: msg.slice('CONCORRENCIA_QTD_INDISPONIVEL: '.length) }, { status: 409 });
    console.error('[parcial/acao]', params.acao, err);
    return NextResponse.json({ erro: msg }, { status: 500 });
  }
}