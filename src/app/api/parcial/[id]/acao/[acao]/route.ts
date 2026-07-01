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

import { runMigrations } from '@/lib/migrations';
const SETORES_VALIDOS = SETOR_CHOICES.map(([cod]) => cod);
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
const ACOES_VALIDAS = ['mover', 'iniciar', 'finalizar', 'pausar', 'retomar', 'concluir', 'cancelar', 'apontar', 'devolver', 'receber'] as const;
export const dynamic = 'force-dynamic';
type Acao = typeof ACOES_VALIDAS[number];

import { runMigrations } from '@/lib/migrations';
export async function POST(
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
  req: Request,
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
  { params }: { params: { id: string; acao: string } }
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
) {
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
  try {
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
  await runMigrations();
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
  const user = await autenticar(req);
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
  if (user instanceof NextResponse) return user;
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
  logAcesso(user, req, `parcial_${params.acao}`);
export const dynamic = 'force-dynamic';

import { runMigrations } from '@/lib/migrations';
  if (!checkMutationRateLimit(getClientIp(req)))
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
    return NextResponse.json({ erro: 'Muitas requisicoes' }, { status: 429 });
export const dynamic = 'force-dynamic';

import { runMigrations } from '@/lib/migrations';
  const parcialId = Number(params.id);
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
  if (!Number.isInteger(parcialId) || parcialId <= 0)
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
    return NextResponse.json({ erro: 'ID inválido' }, { status: 400 });
export const dynamic = 'force-dynamic';

import { runMigrations } from '@/lib/migrations';
  const acao = params.acao as Acao;
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
  if (!ACOES_VALIDAS.includes(acao))
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
    return NextResponse.json({ erro: `Ação inválida. Use: ${ACOES_VALIDAS.join(', ')}` }, { status: 400 });
export const dynamic = 'force-dynamic';

import { runMigrations } from '@/lib/migrations';
  const body = await req.json().catch(() => ({}));
export const dynamic = 'force-dynamic';

import { runMigrations } from '@/lib/migrations';
  // Busca a parcial com dados do item e pedido
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
  const [parcial] = await sql`
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
    SELECT
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
      pa.*,
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
      pa.quantidade::float AS qtd,
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
      i.id AS item_id, i.codigo AS item_codigo, i.unidade,
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
      i.quantidade::float AS item_qtd_total,
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
      i.pedido_id, i.status AS item_status, i.setor_atual AS item_setor_atual,
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
      p.numero_pedido_venda
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
    FROM producao_itemparcial pa
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
    JOIN producao_itempedido i ON i.id = pa.item_pedido_id
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
    JOIN producao_pedido p ON p.id = i.pedido_id
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
    WHERE pa.id = ${parcialId}
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
  `;
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
  if (!parcial) return NextResponse.json({ erro: 'Parcial não encontrada' }, { status: 404 });
export const dynamic = 'force-dynamic';

import { runMigrations } from '@/lib/migrations';
  // Operadores só podem agir em parciais do próprio setor
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
  if (!user.is_staff && parcial.setor_atual !== user.setor)
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
    return NextResponse.json({ erro: 'Acesso negado: parcial não é do seu setor' }, { status: 403 });
export const dynamic = 'force-dynamic';

import { runMigrations } from '@/lib/migrations';
  // Parciais concluídas ou canceladas só aceitam 'apontar' e 'retomar' (admin)
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
  if (['concluida', 'cancelada'].includes(parcial.status) && !['apontar', 'retomar'].includes(acao))
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
    return NextResponse.json({ erro: `Parcial já está "${parcial.status}" e não pode ser alterada` }, { status: 400 });
export const dynamic = 'force-dynamic';

import { runMigrations } from '@/lib/migrations';
  // Parciais pausadas só aceitam retomar, devolver ou apontar
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
  if (parcial.status === 'pausado' && !['retomar', 'devolver', 'apontar'].includes(acao))
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
    return NextResponse.json({ erro: 'Parcial está pausada. Use "retomar" para continuar.' }, { status: 400 });
export const dynamic = 'force-dynamic';

import { runMigrations } from '@/lib/migrations';
  // Parciais em finalizado_setor só aceitam mover, retomar, concluir, cancelar, devolver, apontar
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
  if (parcial.status === 'finalizado_setor' && !['mover', 'retomar', 'concluir', 'cancelar', 'devolver', 'apontar'].includes(acao))
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
    return NextResponse.json({ erro: 'Etapa finalizada. Use "mover" para enviar para o próximo setor ou "retomar" para voltar à produção.' }, { status: 400 });
export const dynamic = 'force-dynamic';

import { runMigrations } from '@/lib/migrations';
  const obs = body.observacao || '';
export const dynamic = 'force-dynamic';

import { runMigrations } from '@/lib/migrations';
  // ── mover ─────────────────────────────────────────────────────────────────
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
  if (acao === 'mover') {
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
    const setor_destino = body.setor_destino as string;
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
    if (!setor_destino || !SETORES_VALIDOS.includes(setor_destino))
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
      return NextResponse.json({ erro: 'setor_destino inválido ou não informado' }, { status: 400 });
export const dynamic = 'force-dynamic';

import { runMigrations } from '@/lib/migrations';
    const qtdMover = body.quantidade ? Number(body.quantidade) : parcial.qtd;
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
    if (!qtdMover || qtdMover <= 0)
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
      return NextResponse.json({ erro: 'Quantidade inválida: deve ser maior que zero' }, { status: 400 });
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
    if (qtdMover > parcial.qtd)
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
      return NextResponse.json({
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
        erro: `Quantidade informada (${qtdMover} ${parcial.unidade}) é maior do que o disponível nesta parcial (${parcial.qtd} ${parcial.unidade})`
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
      }, { status: 400 });
export const dynamic = 'force-dynamic';

import { runMigrations } from '@/lib/migrations';
    // Validação de integridade: qtdMover não pode exceder a quantidade total do item
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
    const [{ soma_ativas }] = await sql`
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
      SELECT COALESCE(SUM(quantidade)::float, 0) AS soma_ativas
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
      FROM producao_itemparcial
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
      WHERE item_pedido_id = ${parcial.item_id}
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
        AND status NOT IN ('cancelada')
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
        AND id != ${parcialId}
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
    `;
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
    if ((soma_ativas + qtdMover) > (parcial.item_qtd_total + 0.001)) {
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
      return NextResponse.json({
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
        erro: `Operação bloqueada: a soma das parciais (${soma_ativas + qtdMover}) ultrapassaria a quantidade total do item (${parcial.item_qtd_total})`
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
      }, { status: 400 });
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
    }
export const dynamic = 'force-dynamic';

import { runMigrations } from '@/lib/migrations';
    await sql.begin(async (tx) => {
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
      if (qtdMover < parcial.qtd) {
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
        // Divisão: reduz a parcial origem e cria parcial filha no destino
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
        await tx`
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
          UPDATE producao_itemparcial
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
          SET quantidade = ${parcial.qtd - qtdMover}, atualizado_em = NOW()
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
          WHERE id = ${parcialId}
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
        `;
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
      } else {
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
        // Move toda a parcial para o destino
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
        await tx`
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
          UPDATE producao_itemparcial
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
          SET setor_atual = ${setor_destino}, status = 'em_aberto', atualizado_em = NOW()
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
          WHERE id = ${parcialId}
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
        `;
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
      }
export const dynamic = 'force-dynamic';

import { runMigrations } from '@/lib/migrations';
      // Cria parcial filha apenas se for divisão
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
      if (qtdMover < parcial.qtd) {
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
        await tx`
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
          INSERT INTO producao_itemparcial
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
            (item_pedido_id, pedido_id, parcial_origem_id, quantidade, setor_atual, status,
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
             observacao, criado_por_id, criado_em, atualizado_em)
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
          VALUES
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
            (${parcial.item_id}, ${parcial.pedido_id}, ${parcialId}, ${qtdMover}, ${setor_destino},
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
             'em_aberto', ${obs || null}, ${user.id}, NOW(), NOW())
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
        `;
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
      }
export const dynamic = 'force-dynamic';


import { runMigrations } from '@/lib/migrations';
      // Registra movimentação
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
      await tx`
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
        INSERT INTO producao_movimentacaoitem
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
          (item_id, pedido_id, usuario_id, setor_origem, setor_destino,
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
           status_anterior, status_novo, observacao, criado_em)
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
        VALUES
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
          (${parcial.item_id}, ${parcial.pedido_id}, ${user.id},
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
           ${parcial.setor_atual}, ${setor_destino},
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
           ${parcial.item_status}, 'aguardando',
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
           ${`Parcial #${parcialId}: ${qtdMover} ${parcial.unidade} → ${nomeSector(setor_destino)}` +
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
             (qtdMover < parcial.qtd
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
               ? `. Saldo em ${nomeSector(parcial.setor_atual)}: ${parcial.qtd - qtdMover} ${parcial.unidade}.`
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
               : '.')},
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
           NOW())
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
      `;
export const dynamic = 'force-dynamic';

import { runMigrations } from '@/lib/migrations';
      // Atualiza quantidade_pendente do item somente se ele ainda está no setor de origem
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
      // (assim não quebra o saldo do item quando parciais já foram divididas antes)
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
      if (parcial.item_setor_atual === parcial.setor_atual) {
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
        const [{ pendente }] = await tx`
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
          SELECT quantidade_pendente::float AS pendente FROM producao_itempedido WHERE id = ${parcial.item_id}
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
        `;
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
        const novoP = Math.max(0, pendente - qtdMover);
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
        await tx`
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
          UPDATE producao_itempedido
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
          SET quantidade_pendente = ${novoP}, atualizado_em = NOW()
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
          WHERE id = ${parcial.item_id}
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
        `;
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
      }
export const dynamic = 'force-dynamic';

import { runMigrations } from '@/lib/migrations';
      // Se o item ficou sem parciais ativas no seu setor atual, avança para o setor destino
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
      const [{ restantes }] = await tx`
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
        SELECT COUNT(*)::int AS restantes
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
        FROM producao_itemparcial
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
        WHERE item_pedido_id = ${parcial.item_id}
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
          AND setor_atual = ${parcial.item_setor_atual}
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
          AND status NOT IN ('cancelada', 'concluida')
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
          AND id != ${parcialId}
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
      `;
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
      if (Number(restantes) === 0) {
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
        // Recalcula quantidade_pendente = total de parciais ativas no destino (inclui a que acabou de chegar)
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
        const [{ total_destino }] = await tx`
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
          SELECT COALESCE(SUM(quantidade)::float, 0) AS total_destino
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
          FROM producao_itemparcial
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
          WHERE item_pedido_id = ${parcial.item_id}
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
            AND setor_atual = ${setor_destino}
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
            AND status NOT IN ('cancelada', 'concluida')
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
        `;
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
        await tx`
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
          UPDATE producao_itempedido
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
          SET setor_atual = ${setor_destino}, status = 'aguardando',
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
              quantidade_pendente = ${total_destino}, atualizado_em = NOW()
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
          WHERE id = ${parcial.item_id}
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
        `;
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
      }
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
    });
export const dynamic = 'force-dynamic';

import { runMigrations } from '@/lib/migrations';
    return NextResponse.json({
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
      ok: true,
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
      mensagem: `${qtdMover} ${parcial.unidade} movidos de ${nomeSector(parcial.setor_atual)} → ${nomeSector(setor_destino)}`,
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
    });
export const dynamic = 'force-dynamic';

import { runMigrations } from '@/lib/migrations';
  // ── receber ── reconhece o recebimento sem iniciar (em_aberto → em_aberto) ─
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
  } else if (acao === 'receber') {
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
    if (parcial.status !== 'em_aberto')
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
      return NextResponse.json({ erro: 'Parcial não está em aberto para recebimento' }, { status: 400 });
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
    await sql`
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
      UPDATE producao_itemparcial
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
      SET atualizado_em = NOW(),
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
          observacao = CASE WHEN ${obs} != '' THEN ${obs} ELSE observacao END
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
      WHERE id = ${parcialId}
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
    `;
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
    await sql`
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
      INSERT INTO producao_movimentacaoitem
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
        (item_id, pedido_id, usuario_id, setor_origem, setor_destino,
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
         status_anterior, status_novo, observacao, criado_em)
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
      VALUES (${parcial.item_id}, ${parcial.pedido_id}, ${user.id},
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
              ${parcial.setor_atual}, ${parcial.setor_atual},
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
              ${parcial.item_status}, ${parcial.item_status},
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
              ${obs || `Parcial #${parcialId} recebida em ${nomeSector(parcial.setor_atual)} — aguardando início`}, NOW())
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
    `;
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
    return NextResponse.json({ ok: true, mensagem: 'Parcial recebida — aguardando início da produção' });
export const dynamic = 'force-dynamic';

import { runMigrations } from '@/lib/migrations';
  // ── iniciar ───────────────────────────────────────────────────────────────
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
  } else if (acao === 'iniciar') {
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
    await sql`
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
      UPDATE producao_itemparcial
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
      SET status = 'em_andamento', iniciado_em = COALESCE(iniciado_em, NOW()), atualizado_em = NOW()
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
      WHERE id = ${parcialId}
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
    `;
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
    await sql`
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
      INSERT INTO producao_movimentacaoitem
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
        (item_id, pedido_id, usuario_id, setor_origem, setor_destino,
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
         status_anterior, status_novo, observacao, criado_em)
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
      VALUES (${parcial.item_id}, ${parcial.pedido_id}, ${user.id},
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
              ${parcial.setor_atual}, ${parcial.setor_atual},
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
              ${parcial.item_status}, 'em_andamento',
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
              ${obs || `Parcial #${parcialId} iniciada em ${nomeSector(parcial.setor_atual)}`}, NOW())
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
    `;
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
    return NextResponse.json({ ok: true, status: 'em_andamento' });
export const dynamic = 'force-dynamic';

import { runMigrations } from '@/lib/migrations';
  // ── concluir ──────────────────────────────────────────────────────────────
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
  } else if (acao === 'concluir') {
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
    await sql.begin(async (tx) => {
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
      // Marca parcial como concluída
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
      await tx`
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
        UPDATE producao_itemparcial
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
        SET status = 'concluida',
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
            iniciado_em = COALESCE(iniciado_em, NOW()),
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
            concluido_em = COALESCE(concluido_em, NOW()),
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
            atualizado_em = NOW()
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
        WHERE id = ${parcialId}
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
      `;
export const dynamic = 'force-dynamic';

import { runMigrations } from '@/lib/migrations';
      if (parcial.setor_atual === 'logistica') {
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
        // Busca o saldo atual de entregues (com lock para evitar race condition)
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
        const [itemAtual] = await tx`
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
          SELECT quantidade::float          AS total,
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
                 COALESCE(quantidade_entregue::float, 0) AS entregue
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
          FROM producao_itempedido WHERE id = ${parcial.item_id} FOR UPDATE
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
        `;
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
        const novaEntregue = Number(itemAtual.entregue) + parcial.qtd;
export const dynamic = 'force-dynamic';

import { runMigrations } from '@/lib/migrations';
        // Atualiza entregue e status do item em uma única query
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
        await tx`
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
          UPDATE producao_itempedido
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
          SET quantidade_entregue = ${novaEntregue},
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
              status = CASE
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
                WHEN ${novaEntregue} >= quantidade THEN 'entregue'
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
                ELSE status
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
              END,
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
              atualizado_em = NOW()
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
          WHERE id = ${parcial.item_id}
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
        `;
export const dynamic = 'force-dynamic';

import { runMigrations } from '@/lib/migrations';
        // Se todo o item foi entregue, verifica se o pedido inteiro também foi
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
        if (novaEntregue >= Number(itemAtual.total) - 0.001) {
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
          const [{ pendentes }] = await tx`
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
            SELECT COUNT(*) AS pendentes FROM producao_itempedido
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
            WHERE pedido_id = ${parcial.pedido_id} AND status != 'entregue'
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
          `;
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
          if (Number(pendentes) === 0) {
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
            await tx`
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
              UPDATE producao_pedido
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
              SET status = 'entregue', atualizado_em = NOW()
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
              WHERE id = ${parcial.pedido_id}
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
            `;
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
          }
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
        }
export const dynamic = 'force-dynamic';

import { runMigrations } from '@/lib/migrations';
        // Log de entrega ao cliente
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
        await tx`
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
          INSERT INTO producao_movimentacaoitem
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
            (item_id, pedido_id, usuario_id, setor_origem, setor_destino,
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
             status_anterior, status_novo, observacao, criado_em)
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
          VALUES (${parcial.item_id}, ${parcial.pedido_id}, ${user.id},
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
                  'logistica', 'logistica',
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
                  ${parcial.item_status},
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
                  CASE WHEN ${novaEntregue} >= ${Number(itemAtual.total)} THEN 'entregue' ELSE ${parcial.item_status} END,
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
                  ${obs || `Entregue ao cliente: ${parcial.qtd} ${parcial.unidade} (Pedido ${parcial.numero_pedido_venda})`}, NOW())
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
        `;
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
      } else {
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
        // Outros setores: log padrão de finalização
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
        await tx`
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
          INSERT INTO producao_movimentacaoitem
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
            (item_id, pedido_id, usuario_id, setor_origem, setor_destino,
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
             status_anterior, status_novo, observacao, criado_em)
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
          VALUES (${parcial.item_id}, ${parcial.pedido_id}, ${user.id},
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
                  ${parcial.setor_atual}, ${parcial.setor_atual},
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
                  ${parcial.item_status}, 'finalizado_setor',
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
                  ${obs || `Parcial #${parcialId} concluída em ${nomeSector(parcial.setor_atual)}`}, NOW())
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
        `;
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
      }
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
    });
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
    return NextResponse.json({ ok: true, status: 'concluida' });
export const dynamic = 'force-dynamic';

import { runMigrations } from '@/lib/migrations';
  // ── cancelar ──────────────────────────────────────────────────────────────
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
  } else if (acao === 'cancelar') {
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
    if (!user.is_staff)
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
      return NextResponse.json({ erro: 'Apenas administradores podem cancelar parciais' }, { status: 403 });
export const dynamic = 'force-dynamic';

import { runMigrations } from '@/lib/migrations';
    await sql.begin(async (tx) => {
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
      await tx`
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
        UPDATE producao_itemparcial
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
        SET status = 'cancelada', atualizado_em = NOW()
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
        WHERE id = ${parcialId}
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
      `;
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
      await tx`
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
        INSERT INTO producao_movimentacaoitem
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
          (item_id, pedido_id, usuario_id, setor_origem, setor_destino,
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
           status_anterior, status_novo, observacao, criado_em)
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
        VALUES (${parcial.item_id}, ${parcial.pedido_id}, ${user.id},
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
                ${parcial.setor_atual}, ${parcial.setor_atual},
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
                ${parcial.item_status}, 'bloqueado',
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
                ${obs || `Parcial #${parcialId} cancelada`}, NOW())
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
      `;
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
    });
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
    return NextResponse.json({ ok: true, status: 'cancelada' });
export const dynamic = 'force-dynamic';

import { runMigrations } from '@/lib/migrations';
  // ── apontar ───────────────────────────────────────────────────────────────
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
  } else if (acao === 'apontar') {
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
    const qtdApontada   = Number(body.quantidade_apontada   ?? 0);
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
    const qtdAprovada   = Number(body.quantidade_aprovada   ?? 0);
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
    const qtdReprovada  = Number(body.quantidade_reprovada  ?? 0);
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
    const qtdFinalizada = Number(body.quantidade_finalizada ?? 0);
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
    const statusAp      = (body.status as string) ?? 'aberto';
export const dynamic = 'force-dynamic';

import { runMigrations } from '@/lib/migrations';
    const statusValidos = ['aberto', 'em_andamento', 'finalizado', 'aprovado', 'reprovado'];
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
    if (!statusValidos.includes(statusAp))
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
      return NextResponse.json({ erro: `status de apontamento inválido. Use: ${statusValidos.join(', ')}` }, { status: 400 });
export const dynamic = 'force-dynamic';

import { runMigrations } from '@/lib/migrations';
    // Valida que aprovada + reprovada não excedem apontada
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
    if ((qtdAprovada + qtdReprovada) > qtdApontada + 0.001)
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
      return NextResponse.json({ erro: 'Quantidade aprovada + reprovada não pode exceder quantidade apontada' }, { status: 400 });
export const dynamic = 'force-dynamic';

import { runMigrations } from '@/lib/migrations';
    const [{ id: apontamentoId }] = await sql`
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
      INSERT INTO producao_apontamento
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
        (parcial_id, item_pedido_id, pedido_id, setor,
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
         quantidade_apontada, quantidade_aprovada, quantidade_reprovada, quantidade_finalizada,
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
         status, usuario_id, observacao, criado_em, atualizado_em)
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
      VALUES
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
        (${parcialId}, ${parcial.item_id}, ${parcial.pedido_id}, ${parcial.setor_atual},
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
         ${qtdApontada}, ${qtdAprovada}, ${qtdReprovada}, ${qtdFinalizada},
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
         ${statusAp}, ${user.id}, ${obs || null}, NOW(), NOW())
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
      RETURNING id
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
    `;
export const dynamic = 'force-dynamic';

import { runMigrations } from '@/lib/migrations';
    return NextResponse.json({
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
      ok: true,
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
      apontamento_id: apontamentoId,
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
      mensagem: `Apontamento registrado: ${qtdApontada} ${parcial.unidade} apontadas em ${nomeSector(parcial.setor_atual)}`,
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
    });
export const dynamic = 'force-dynamic';

import { runMigrations } from '@/lib/migrations';
  // ── pausar ────────────────────────────────────────────────────────────────
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
  } else if (acao === 'pausar') {
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
    if (parcial.status !== 'em_andamento')
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
      return NextResponse.json({ erro: 'Parcial não está em andamento' }, { status: 400 });
export const dynamic = 'force-dynamic';

import { runMigrations } from '@/lib/migrations';
    await sql`
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
      UPDATE producao_itemparcial
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
      SET status = 'pausado', atualizado_em = NOW()
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
      WHERE id = ${parcialId}
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
    `;
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
    await sql`
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
      INSERT INTO producao_movimentacaoitem
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
        (item_id, pedido_id, usuario_id, setor_origem, setor_destino,
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
         status_anterior, status_novo, observacao, criado_em)
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
      VALUES (${parcial.item_id}, ${parcial.pedido_id}, ${user.id},
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
              ${parcial.setor_atual}, ${parcial.setor_atual},
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
              'em_andamento', 'pausado',
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
              ${obs || `Parcial #${parcialId} pausada em ${nomeSector(parcial.setor_atual)}`}, NOW())
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
    `;
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
    return NextResponse.json({ ok: true, status: 'pausado' });
export const dynamic = 'force-dynamic';

import { runMigrations } from '@/lib/migrations';
  // ── finalizar ─────────────────────────────────────────────────────────────
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
  // Finaliza a etapa da parcial no setor atual (espelho do "finalizar" do item).
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
  // Após finalizar, o operador pode enviar para outro setor (mover).
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
  } else if (acao === 'finalizar') {
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
    if (parcial.status !== 'em_andamento')
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
      return NextResponse.json({ erro: 'Parcial não está em andamento' }, { status: 400 });
export const dynamic = 'force-dynamic';

import { runMigrations } from '@/lib/migrations';
    await sql.begin(async (tx) => {
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
      await tx`
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
        UPDATE producao_itemparcial
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
        SET status = 'finalizado_setor', atualizado_em = NOW()
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
        WHERE id = ${parcialId}
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
      `;
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
      await tx`
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
        INSERT INTO producao_movimentacaoitem
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
          (item_id, pedido_id, usuario_id, setor_origem, setor_destino,
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
           status_anterior, status_novo, observacao, criado_em)
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
        VALUES (${parcial.item_id}, ${parcial.pedido_id}, ${user.id},
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
                ${parcial.setor_atual}, ${parcial.setor_atual},
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
                'em_andamento', 'finalizado_setor',
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
                ${obs || `Parcial #${parcialId}: etapa de ${nomeSector(parcial.setor_atual)} finalizada`}, NOW())
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
      `;
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
    });
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
    return NextResponse.json({ ok: true, status: 'finalizado_setor' });
export const dynamic = 'force-dynamic';

import { runMigrations } from '@/lib/migrations';
  // ── devolver ──────────────────────────────────────────────────────────────
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
  } else if (acao === 'devolver') {
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
    const setor_destino = body.setor_destino as string;
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
    if (!setor_destino || !SETORES_VALIDOS.includes(setor_destino))
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
      return NextResponse.json({ erro: 'setor_destino inválido ou não informado' }, { status: 400 });
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
    if (setor_destino === parcial.setor_atual)
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
      return NextResponse.json({ erro: 'Setor de devolução deve ser diferente do setor atual' }, { status: 400 });
export const dynamic = 'force-dynamic';

import { runMigrations } from '@/lib/migrations';
    await sql.begin(async (tx) => {
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
      await tx`
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
        UPDATE producao_itemparcial
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
        SET setor_atual = ${setor_destino}, status = 'em_aberto',
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
            concluido_em = NULL, atualizado_em = NOW(),
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
            retrabalho = TRUE,
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
            motivo_retrabalho = ${obs || null},
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
            devolvido_de = ${parcial.setor_atual}
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
        WHERE id = ${parcialId}
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
      `;
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
      await tx`
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
        INSERT INTO producao_loteitem
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
          (item_pedido_id, setor_origem, setor_destino, quantidade, status, observacao,
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
           criado_por_id, criado_em, atualizado_em)
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
        VALUES
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
          (${parcial.item_id}, ${parcial.setor_atual}, ${setor_destino}, ${parcial.qtd},
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
           'em_producao', ${obs || null}, ${user.id}, NOW(), NOW())
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
      `;
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
      await tx`
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
        INSERT INTO producao_movimentacaoitem
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
          (item_id, pedido_id, usuario_id, setor_origem, setor_destino,
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
           status_anterior, status_novo, observacao, criado_em)
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
        VALUES (${parcial.item_id}, ${parcial.pedido_id}, ${user.id},
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
                ${parcial.setor_atual}, ${setor_destino},
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
                ${parcial.item_status}, 'aguardando',
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
                ${obs || `Parcial #${parcialId} devolvida de ${nomeSector(parcial.setor_atual)} → ${nomeSector(setor_destino)}`}, NOW())
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
      `;
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
    });
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
    return NextResponse.json({ ok: true, status: 'em_aberto', mensagem: `Devolvida para ${nomeSector(setor_destino)}` });
export const dynamic = 'force-dynamic';

import { runMigrations } from '@/lib/migrations';
  // ── retomar ───────────────────────────────────────────────────────────────
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
  } else if (acao === 'retomar') {
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
    // Operadores podem retomar do estado pausado; admin pode retomar de qualquer estado inativo
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
    const podeRetomar = ['pausado', 'finalizado_setor'].includes(parcial.status)
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
      || (user.is_staff && ['concluida', 'cancelada'].includes(parcial.status));
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
    if (!podeRetomar)
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
      return NextResponse.json({ erro: 'Apenas parciais pausadas (ou concluídas para admins) podem ser retomadas' }, { status: 403 });
export const dynamic = 'force-dynamic';

import { runMigrations } from '@/lib/migrations';
    await sql.begin(async (tx) => {
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
      await tx`
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
        UPDATE producao_itemparcial
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
        SET status = 'em_andamento',
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
            concluido_em = NULL,
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
            iniciado_em = COALESCE(iniciado_em, NOW()),
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
            atualizado_em = NOW()
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
        WHERE id = ${parcialId}
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
      `;
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
      if (user.is_staff) {
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
        // Se o item estava finalizado_setor no mesmo setor, reverte também
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
        await tx`
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
          UPDATE producao_itempedido
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
          SET status = 'em_andamento', atualizado_em = NOW()
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
          WHERE id = ${parcial.item_id}
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
            AND setor_atual = ${parcial.setor_atual}
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
            AND status = 'finalizado_setor'
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
        `;
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
      }
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
      await tx`
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
        INSERT INTO producao_movimentacaoitem
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
          (item_id, pedido_id, usuario_id, setor_origem, setor_destino,
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
           status_anterior, status_novo, observacao, criado_em)
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
        VALUES (${parcial.item_id}, ${parcial.pedido_id}, ${user.id},
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
                ${parcial.setor_atual}, ${parcial.setor_atual},
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
                ${parcial.status}, 'em_andamento',
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
                ${obs || `Parcial #${parcialId} retomada em ${nomeSector(parcial.setor_atual)}`}, NOW())
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
      `;
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
    });
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
    return NextResponse.json({ ok: true, status: 'em_andamento' });
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
  }
export const dynamic = 'force-dynamic';

import { runMigrations } from '@/lib/migrations';
  return NextResponse.json({ erro: 'Ação não processada' }, { status: 500 });
export const dynamic = 'force-dynamic';

import { runMigrations } from '@/lib/migrations';
  } catch (err: unknown) {
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
    const msg = err instanceof Error ? err.message : 'Erro interno no servidor';
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
    console.error('[parcial/acao]', params.acao, err);
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
    return NextResponse.json({ erro: msg }, { status: 500 });
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
  }
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
}
export const dynamic = 'force-dynamic';
