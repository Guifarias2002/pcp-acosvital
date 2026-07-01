
import { runMigrations } from '@/lib/migrations';
const SETORES_VALIDOS = SETOR_CHOICES.map(([cod]) => cod);
export const dynamic = 'force-dynamic';

import { runMigrations } from '@/lib/migrations';
const TRANSICOES: Record<string, string[]> = {
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
  liberar: ['emitido'],
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
  receber: ['aguardando'],
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
  iniciar: ['recebido'],
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
  pausar: ['em_andamento'],
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
  retomar: ['pausado', 'finalizado_setor'],
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
  finalizar: ['em_andamento', 'pausado', 'finalizado_setor'],
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
  enviar_tudo: ['finalizado_setor', 'aguardando', 'recebido', 'em_andamento', 'pausado'],
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
  enviar_parcial: ['emitido', 'finalizado_setor', 'aguardando', 'recebido', 'em_andamento', 'pausado'],
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
  despachar: ['recebido'],
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
  devolver: ['aguardando', 'recebido', 'em_andamento', 'pausado', 'finalizado_setor', 'em_transito'],
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
  entregar: ['finalizado_setor', 'aguardando', 'recebido', 'em_andamento', 'em_transito'],
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
  aprovar: ['em_andamento', 'finalizado_setor'],
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
  reprovar: ['aguardando', 'recebido', 'em_andamento', 'finalizado_setor'],
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
  retrabalho: ['reprovado'],
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
  resolver: ['reprovado'],
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
  cancelar_item: ['reprovado'],
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
};
export const dynamic = 'force-dynamic';

import { runMigrations } from '@/lib/migrations';
const NOVO_STATUS: Record<string, string> = {
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
  liberar: 'aguardando', receber: 'recebido', iniciar: 'em_andamento', pausar: 'pausado',
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
  retomar: 'em_andamento', finalizar: 'finalizado_setor',
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
  enviar_tudo: 'aguardando', enviar_parcial: 'aguardando',
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
  despachar: 'em_transito',
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
  devolver: 'aguardando', entregar: 'entregue',
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
  aprovar: 'finalizado_setor', reprovar: 'reprovado',
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
  retrabalho: 'aguardando', resolver: 'finalizado_setor', cancelar_item: 'bloqueado',
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
};
export const dynamic = 'force-dynamic';

import { runMigrations } from '@/lib/migrations';
// ── helpers ──────────────────────────────────────────────────────────────────
export const dynamic = 'force-dynamic';

import { runMigrations } from '@/lib/migrations';
async function registrarMovItem(
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
  itemId: number, pedidoId: number, userId: number,
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
  setorOrigem: string, setorDestino: string,
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
  statusAnt: string, statusNovo: string, obs: string
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
) {
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
    VALUES (${itemId}, ${pedidoId}, ${userId}, ${setorOrigem}, ${setorDestino},
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
            ${statusAnt}, ${statusNovo}, ${obs}, NOW())
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
  `;
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
}
export const dynamic = 'force-dynamic';

import { runMigrations } from '@/lib/migrations';
/**
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
 * Encontra a parcial ativa do item num dado setor.
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
 * Se não existir (item anterior ao sistema de parciais), retorna null.
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
 */
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
async function getParcialAtiva(
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
  tx: Awaited<ReturnType<typeof sql.begin>> | typeof sql,
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
  itemId: number,
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
  setor: string,
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
) {
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
  const rows = await (tx as typeof sql)`
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
    SELECT id, quantidade::float AS quantidade
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
    FROM producao_itemparcial
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
    WHERE item_pedido_id = ${itemId}
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
      AND setor_atual = ${setor}
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
      AND status IN ('em_aberto', 'em_andamento')
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
    ORDER BY criado_em ASC
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
    LIMIT 1
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
  `;
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
  return rows[0] ?? null;
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
}
export const dynamic = 'force-dynamic';

import { runMigrations } from '@/lib/migrations';
/**
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
 * Move a parcial principal de um item de um setor para outro.
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
 * Chamado em ações que movem o item inteiro (liberar, enviar_tudo, devolver).
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
 */
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
async function moverParcialInteira(
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
  tx: typeof sql,
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
  itemId: number,
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
  pedidoId: number,
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
  setorOrigem: string,
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
  setorDestino: string,
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
  quantidade: number,
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
  userId: number,
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
  obs: string,
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
) {
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
  // Busca a parcial PRINCIPAL (sem pai) independente do status — inclui concluídas.
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
  // O operador pode ter pressionado "Finalizar" antes de "Enviar tudo", o que deixa a
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
  // parcial como 'concluida'. Sem esse filtro mais amplo, a função criaria uma duplicata.
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
  const [parcial] = await tx`
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
    SELECT id FROM producao_itemparcial
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
    WHERE item_pedido_id = ${itemId}
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
      AND setor_atual    = ${setorOrigem}
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
      AND parcial_origem_id IS NULL
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
      AND status NOT IN ('cancelada')
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
    ORDER BY
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
      CASE status
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
        WHEN 'em_andamento'    THEN 0
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
        WHEN 'em_aberto'       THEN 1
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
        WHEN 'finalizado_setor'THEN 2
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
        WHEN 'concluida'       THEN 3
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
        ELSE 4
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
      END ASC
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
    LIMIT 1
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
  `;
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
  if (parcial) {
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
    await tx`
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
      UPDATE producao_itemparcial
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
      SET setor_atual = ${setorDestino}, status = 'em_aberto', atualizado_em = NOW()
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
      WHERE id = ${parcial.id}
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
    `;
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
  } else {
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
    // Item criado antes do sistema de parciais — cria parcial no destino
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
    await tx`
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
      INSERT INTO producao_itemparcial
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
        (item_pedido_id, pedido_id, quantidade, setor_atual, status, observacao, criado_por_id, criado_em, atualizado_em)
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
      VALUES
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
        (${itemId}, ${pedidoId}, ${quantidade}, ${setorDestino}, 'em_aberto', ${obs}, ${userId}, NOW(), NOW())
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
// ── handler principal ─────────────────────────────────────────────────────────
export const dynamic = 'force-dynamic';

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
  logAcesso(user, req, params.acao);
export const dynamic = 'force-dynamic';

import { runMigrations } from '@/lib/migrations';
  if (!checkMutationRateLimit(getClientIp(req)))
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
    return NextResponse.json({ erro: 'Muitas requisicoes' }, { status: 429 });
export const dynamic = 'force-dynamic';

import { runMigrations } from '@/lib/migrations';
  const { id, acao } = params;
export const dynamic = 'force-dynamic';

import { runMigrations } from '@/lib/migrations';
  const itemId = Number(id);
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
  if (!Number.isInteger(itemId) || itemId <= 0)
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
    return NextResponse.json({ erro: 'ID invalido' }, { status: 400 });
export const dynamic = 'force-dynamic';

import { runMigrations } from '@/lib/migrations';
  // ── sync: corrige setor_atual do item com base nas parciais ativas ──────────
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
  if (acao === 'sync') {
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
    if (!user.is_staff) return NextResponse.json({ erro: 'Acesso negado' }, { status: 403 });
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
    const parciais = await sql`
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
      SELECT setor_atual, COUNT(*)::int AS qtd
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
      FROM producao_itemparcial
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
      WHERE item_pedido_id = ${itemId}
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
        AND status NOT IN ('cancelada', 'concluida')
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
      GROUP BY setor_atual
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
    `;
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
    if (parciais.length === 1) {
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
      const setor = parciais[0].setor_atual as string;
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
      const [{ total }] = await sql`
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
        SELECT COALESCE(SUM(quantidade)::float, 0) AS total
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
        FROM producao_itemparcial
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
        WHERE item_pedido_id = ${itemId}
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
          AND setor_atual = ${setor}
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
          AND status NOT IN ('cancelada', 'concluida')
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
      `;
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
      await sql`
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
        UPDATE producao_itempedido
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
        SET setor_atual = ${setor}, status = 'aguardando',
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
            quantidade_pendente = ${total}, atualizado_em = NOW()
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
        WHERE id = ${itemId}
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
      `;
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
      return NextResponse.json({ ok: true, setor_atual: setor, quantidade_pendente: total, mensagem: `Item sincronizado para ${nomeSector(setor)} (${total} un)` });
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
    }
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
    return NextResponse.json({ ok: false, mensagem: 'Parciais em múltiplos setores — sincronização não aplicada', parciais });
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
  }
export const dynamic = 'force-dynamic';

import { runMigrations } from '@/lib/migrations';
  const ACOES_VALIDAS = Object.keys(TRANSICOES);
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
  if (!ACOES_VALIDAS.includes(acao))
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
    return NextResponse.json({ erro: 'Acao invalida' }, { status: 400 });
export const dynamic = 'force-dynamic';

import { runMigrations } from '@/lib/migrations';
  const body = await req.json().catch(() => ({}));
export const dynamic = 'force-dynamic';

import { runMigrations } from '@/lib/migrations';
  const [item] = await sql`
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
    SELECT i.*, p.roteiro_base
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
    FROM producao_itempedido i JOIN producao_pedido p ON p.id = i.pedido_id
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
    WHERE i.id = ${itemId}
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
  `;
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
  if (!item) return NextResponse.json({ erro: 'Item nao encontrado' }, { status: 404 });
export const dynamic = 'force-dynamic';

import { runMigrations } from '@/lib/migrations';
  if (!user.is_staff && item.setor_atual !== user.setor)
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
    return NextResponse.json({ erro: 'Acesso negado' }, { status: 403 });
export const dynamic = 'force-dynamic';

import { runMigrations } from '@/lib/migrations';
  const statusesPermitidos = TRANSICOES[acao] || [];
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
  if (!statusesPermitidos.includes(item.status))
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
    return NextResponse.json({ erro: `Acao "${acao}" nao permitida no status "${item.status}"` }, { status: 400 });
export const dynamic = 'force-dynamic';

import { runMigrations } from '@/lib/migrations';
  const roteiro = (item.roteiro_proprio && item.roteiro_proprio.length > 0)
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
    ? item.roteiro_proprio as string[]
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
    : item.roteiro_base as string[];
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
  const idx = roteiro.indexOf(item.setor_atual);
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
  const proximoSetorRoteiro = (idx >= 0 && idx < roteiro.length - 1) ? roteiro[idx + 1] : null;
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
  const setorDestinoEscolhido = (body.setor_destino && SETORES_VALIDOS.includes(body.setor_destino))
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
    ? body.setor_destino : null;
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
  const proximoSetor = setorDestinoEscolhido || proximoSetorRoteiro;
export const dynamic = 'force-dynamic';

import { runMigrations } from '@/lib/migrations';
  const novoStatus = NOVO_STATUS[acao];
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
  const obs = body.observacao || '';
export const dynamic = 'force-dynamic';

import { runMigrations } from '@/lib/migrations';
  // ── liberar ──────────────────────────────────────────────────────────────
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
  if (acao === 'liberar') {
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
    if (!proximoSetor)
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
      return NextResponse.json({ erro: 'Nao ha proximo setor no roteiro' }, { status: 400 });
export const dynamic = 'force-dynamic';

import { runMigrations } from '@/lib/migrations';
    await sql.begin(async (tx) => {
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
        VALUES (${item.id}, ${item.pedido_id}, ${user.id}, ${item.setor_atual}, ${proximoSetor},
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
                ${item.status}, 'aguardando', ${obs || 'Liberado para produção'}, NOW())
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
        SET status = 'aguardando', setor_atual = ${proximoSetor}, atualizado_em = NOW()
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
        WHERE id = ${item.id}
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
      `;
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
      await tx`
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
        UPDATE producao_pedido
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
        SET status = 'em_producao', setor_atual = ${proximoSetor}, atualizado_em = NOW()
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
        WHERE id = ${item.pedido_id}
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
      `;
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
      // Cria/move parcial principal para o próximo setor
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
      await moverParcialInteira(
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
        tx as unknown as typeof sql,
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
        item.id, item.pedido_id,
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
        item.setor_atual, proximoSetor,
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
        Number(item.quantidade_pendente), user.id,
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
        obs || 'Liberado para produção'
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
      );
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
    });
export const dynamic = 'force-dynamic';

import { runMigrations } from '@/lib/migrations';
  // ── enviar_tudo ───────────────────────────────────────────────────────────
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
  } else if (acao === 'enviar_tudo') {
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
    if (!proximoSetor)
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
      return NextResponse.json({ erro: 'Nao ha proximo setor no roteiro' }, { status: 400 });
export const dynamic = 'force-dynamic';

import { runMigrations } from '@/lib/migrations';
    await sql.begin(async (tx) => {
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
        VALUES (${item.id}, ${item.pedido_id}, ${user.id}, ${item.setor_atual}, ${proximoSetor},
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
                ${item.status}, 'aguardando', ${obs}, NOW())
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
        SET status = 'aguardando', setor_atual = ${proximoSetor}, atualizado_em = NOW()
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
        WHERE id = ${item.id}
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
      `;
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
      await tx`
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
        UPDATE producao_pedido SET setor_atual = ${proximoSetor}, atualizado_em = NOW()
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
        WHERE id = ${item.pedido_id}
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
      `;
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
      await moverParcialInteira(
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
        tx as unknown as typeof sql,
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
        item.id, item.pedido_id,
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
        item.setor_atual, proximoSetor,
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
        Number(item.quantidade_pendente), user.id, obs
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
      );
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
    });
export const dynamic = 'force-dynamic';

import { runMigrations } from '@/lib/migrations';
  // ── enviar_parcial ────────────────────────────────────────────────────────
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
  } else if (acao === 'enviar_parcial') {
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
    const qtd = Number(body.quantidade || 0);
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
    const qtdPendente = Number(item.quantidade_pendente);
export const dynamic = 'force-dynamic';

import { runMigrations } from '@/lib/migrations';
    if (!qtd || qtd <= 0)
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
      return NextResponse.json({ erro: 'Quantidade invalida: deve ser maior que zero' }, { status: 400 });
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
    if (!proximoSetor)
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
      return NextResponse.json({ erro: 'Nao ha proximo setor no roteiro' }, { status: 400 });
export const dynamic = 'force-dynamic';

import { runMigrations } from '@/lib/migrations';
    // ── Caso especial: item ainda emitido (emissao) — liberar parcial sem mudar status do item
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
    if (item.status === 'emitido') {
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
      if (qtd >= qtdPendente)
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
        return NextResponse.json({ erro: `Para liberar tudo use o botão Liberar. Quantidade maxima para parcial: ${qtdPendente - 1}` }, { status: 400 });
export const dynamic = 'force-dynamic';

import { runMigrations } from '@/lib/migrations';
      await sql.begin(async (tx) => {
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
        // Garante que exista uma parcial principal em emissao (para o restante)
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
        const [parcialEmissao] = await (tx as unknown as typeof sql)`
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
          SELECT id FROM producao_itemparcial
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
          WHERE item_pedido_id = ${item.id} AND setor_atual = ${item.setor_atual}
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
            AND parcial_origem_id IS NULL AND status NOT IN ('cancelada')
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
          LIMIT 1
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
        `;
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
        let parcialOrigemId: number;
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
        if (parcialEmissao) {
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
          parcialOrigemId = parcialEmissao.id as number;
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
          // Reduz a qty da parcial principal pelo que foi enviado
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
          await (tx as unknown as typeof sql)`
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
            UPDATE producao_itemparcial
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
            SET quantidade = quantidade - ${qtd}, atualizado_em = NOW()
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
            WHERE id = ${parcialOrigemId}
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
          `;
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
        } else {
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
          // Primeira parcialização — cria parcial principal com o restante
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
          const [nova] = await (tx as unknown as typeof sql)`
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
            INSERT INTO producao_itemparcial
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
              (item_pedido_id, pedido_id, quantidade, setor_atual, status, observacao, criado_por_id, criado_em, atualizado_em)
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
            VALUES (${item.id}, ${item.pedido_id}, ${qtdPendente - qtd}, ${item.setor_atual},
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
                    'em_aberto', 'Saldo remanescente na emissão', ${user.id}, NOW(), NOW())
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
            RETURNING id
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
          `;
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
          parcialOrigemId = nova.id as number;
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
        }
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
        // Cria parcial filha no setor destino
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
        await (tx as unknown as typeof sql)`
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
          INSERT INTO producao_itemparcial
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
            (item_pedido_id, pedido_id, parcial_origem_id, quantidade, setor_atual, status, observacao, criado_por_id, criado_em, atualizado_em)
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
          VALUES (${item.id}, ${item.pedido_id}, ${parcialOrigemId}, ${qtd}, ${proximoSetor},
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
                  'em_aberto', ${obs || `Liberado parcialmente: ${qtd} ${item.unidade}`}, ${user.id}, NOW(), NOW())
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
        `;
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
        // Registra movimentação
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
        await (tx as unknown as typeof sql)`
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
          INSERT INTO producao_movimentacaoitem
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
            (item_id, pedido_id, usuario_id, setor_origem, setor_destino, status_anterior, status_novo, observacao, criado_em)
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
          VALUES (${item.id}, ${item.pedido_id}, ${user.id}, ${item.setor_atual}, ${proximoSetor},
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
                  'emitido', 'emitido', ${obs || `Parcial: ${qtd} ${item.unidade} → ${proximoSetor}`}, NOW())
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
        `;
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
        // Pedido passa a em_producao mas item permanece emitido em emissao
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
        await (tx as unknown as typeof sql)`
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
          UPDATE producao_pedido SET status = 'em_producao', atualizado_em = NOW() WHERE id = ${item.pedido_id}
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
        `;
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
      });
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
      return NextResponse.json({ ok: true, status: 'emitido' });
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
    }
export const dynamic = 'force-dynamic';

import { runMigrations } from '@/lib/migrations';
    // Calcula total disponível no setor somando TODAS as parciais ativas.
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
    // Cenário típico: item foi split e há múltiplas parciais no mesmo setor
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
    // (ex: 25 un de envio anterior + 75 un da remessa principal = 100 un disponíveis).
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
    const parciaisNoSetor = await sql`
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
      SELECT id, quantidade::float AS quantidade, parcial_origem_id
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
      FROM producao_itemparcial
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
      WHERE item_pedido_id = ${item.id}
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
        AND setor_atual = ${item.setor_atual}
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
        AND status IN ('em_aberto', 'em_andamento')
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
      ORDER BY
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
        CASE WHEN parcial_origem_id IS NULL THEN 0 ELSE 1 END ASC,
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
        quantidade DESC
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
    `;
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
    const qtdTotalNoSetor = parciaisNoSetor.length > 0
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
      ? parciaisNoSetor.reduce((s: number, p: Record<string, unknown>) => s + Number(p.quantidade), 0)
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
      : qtdPendente;
export const dynamic = 'force-dynamic';

import { runMigrations } from '@/lib/migrations';
    if (qtd > qtdTotalNoSetor)
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
      return NextResponse.json({
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
        erro: `Quantidade invalida: solicitado ${qtd}, disponivel ${qtdTotalNoSetor} ${item.unidade} neste setor`
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
      }, { status: 400 });
export const dynamic = 'force-dynamic';

import { runMigrations } from '@/lib/migrations';
    // Se a quantidade pedida cobre todo o setor, converte em enviar_tudo
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
    if (qtd >= qtdTotalNoSetor) {
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
      await sql.begin(async (tx) => {
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
          VALUES (${item.id}, ${item.pedido_id}, ${user.id}, ${item.setor_atual}, ${proximoSetor},
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
                  ${item.status}, 'aguardando', ${obs}, NOW())
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
        `;
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
        await tx`UPDATE producao_itempedido SET status='aguardando', setor_atual=${proximoSetor}, atualizado_em=NOW() WHERE id=${item.id}`;
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
        await tx`UPDATE producao_pedido SET setor_atual=${proximoSetor}, atualizado_em=NOW() WHERE id=${item.pedido_id}`;
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
        await moverParcialInteira(
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
          tx as unknown as typeof sql,
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
          item.id, item.pedido_id,
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
          item.setor_atual, proximoSetor,
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
          qtdPendente, user.id, obs
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
        );
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
      });
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
      return NextResponse.json({ ok: true, status: 'aguardando' });
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
    }
export const dynamic = 'force-dynamic';

import { runMigrations } from '@/lib/migrations';
    // Envio parcial real: consome das parciais ativas no setor (maior primeiro)
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
    // até atingir a quantidade pedida. Assim 30 un de (25+75) funciona normalmente.
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
    await sql.begin(async (tx) => {
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
      // Busca e trava todas as parciais ativas no setor (maior primeiro)
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
      let parciaisAtivas = await (tx as unknown as typeof sql)`
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
        SELECT id, quantidade::float AS quantidade
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
        FROM producao_itemparcial
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
        WHERE item_pedido_id = ${item.id}
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
          AND setor_atual = ${item.setor_atual}
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
          AND status IN ('em_aberto', 'em_andamento')
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
        ORDER BY quantidade DESC
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
        FOR UPDATE
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
      `;
export const dynamic = 'force-dynamic';

import { runMigrations } from '@/lib/migrations';
      // Fallback: o operador finalizou a etapa antes de enviar parcial → usa concluídas
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
      if (parciaisAtivas.length === 0) {
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
        const concluidas = await (tx as unknown as typeof sql)`
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
          SELECT id, quantidade::float AS quantidade
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
          FROM producao_itemparcial
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
          WHERE item_pedido_id = ${item.id}
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
            AND setor_atual = ${item.setor_atual}
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
            AND status = 'concluida'
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
          ORDER BY quantidade DESC
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
          FOR UPDATE
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
        `;
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
        if (concluidas.length > 0) {
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
          // Reativa as concluídas para permitir o split
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
          const ids = concluidas.map((p: Record<string, unknown>) => p.id) as number[];
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
          await (tx as unknown as typeof sql)`
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
            UPDATE producao_itemparcial SET status = 'em_andamento', atualizado_em = NOW()
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
            WHERE id = ANY(${ids as unknown as string[]})
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
          `;
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
          parciaisAtivas = concluidas;
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
        } else {
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
          // Verdadeiro fallback: item anterior ao sistema sem nenhuma parcial
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
          const qtdRestante = qtdPendente - qtd;
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
          if (qtdRestante > 0) {
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
            await tx`
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
              INSERT INTO producao_itemparcial
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
                (item_pedido_id, pedido_id, quantidade, setor_atual, status, observacao, criado_por_id, criado_em, atualizado_em)
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
              VALUES
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
                (${item.id}, ${item.pedido_id}, ${qtdRestante}, ${item.setor_atual},
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
                 'em_andamento', 'Saldo remanescente — migração', ${user.id}, NOW(), NOW())
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
      }
export const dynamic = 'force-dynamic';

import { runMigrations } from '@/lib/migrations';
      // Consome das parciais em ordem (maior primeiro) até cobrir qtd
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
      let restante = qtd;
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
      let parcialOrigemId: number | null = null;
export const dynamic = 'force-dynamic';

import { runMigrations } from '@/lib/migrations';
      for (const p of parciaisAtivas) {
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
        if (restante <= 0) break;
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
        const disponivel = Number(p.quantidade);
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
        const consumir = Math.min(disponivel, restante);
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
        const sobra = disponivel - consumir;
export const dynamic = 'force-dynamic';

import { runMigrations } from '@/lib/migrations';
        if (!parcialOrigemId) parcialOrigemId = Number(p.id);
export const dynamic = 'force-dynamic';

import { runMigrations } from '@/lib/migrations';
        if (sobra > 0) {
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
          await tx`
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
            UPDATE producao_itemparcial
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
            SET quantidade = ${sobra}, status = 'em_andamento', atualizado_em = NOW()
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
            WHERE id = ${p.id}
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
          `;
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
        } else {
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
            WHERE id = ${p.id}
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
          `;
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
        }
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
        restante -= consumir;
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
      }
export const dynamic = 'force-dynamic';

import { runMigrations } from '@/lib/migrations';
      // Cria nova parcial filha no setor de destino
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
          (${item.id}, ${item.pedido_id}, ${parcialOrigemId}, ${qtd}, ${proximoSetor},
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
           'em_aberto', ${obs || null}, ${user.id}, NOW(), NOW())
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
      `;
export const dynamic = 'force-dynamic';


import { runMigrations } from '@/lib/migrations';
      const novaQtdPendente = Math.max(0, qtdPendente - qtd);
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
      const obsMovItem = `Parcial: ${qtd} ${item.unidade} → ${nomeSector(proximoSetor)}. Saldo em ${nomeSector(item.setor_atual)}: ${novaQtdPendente} ${item.unidade}`;
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
          (${item.id}, ${item.pedido_id}, ${user.id}, ${item.setor_atual}, ${proximoSetor},
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
           ${item.status}, 'em_andamento', ${obsMovItem}, NOW())
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
        SET quantidade_pendente = ${novaQtdPendente}, status = 'em_andamento', atualizado_em = NOW()
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
        WHERE id = ${item.id}
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
  // ── devolver ──────────────────────────────────────────────────────────────
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
  } else if (acao === 'devolver') {
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
    const destinoRaw = body.setor_destino || roteiro[Math.max(0, idx - 1)] || item.setor_atual;
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
    const destino = SETORES_VALIDOS.includes(destinoRaw) ? destinoRaw : item.setor_atual;
export const dynamic = 'force-dynamic';

import { runMigrations } from '@/lib/migrations';
    await sql.begin(async (tx) => {
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
        VALUES (${item.id}, ${item.pedido_id}, ${user.id}, ${item.setor_atual}, ${destino},
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
                ${item.status}, 'aguardando', ${obs || 'Devolucao'}, NOW())
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
      `;
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
      await tx`UPDATE producao_itempedido SET status='aguardando', setor_atual=${destino}, atualizado_em=NOW() WHERE id=${item.id}`;
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
      // Cancela todas as parciais filhas (enviadas parcialmente) que ainda estão ativas
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
      // para evitar que a soma ultrapasse a quantidade total do item ao reenviar
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
        WHERE item_pedido_id = ${item.id}
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
          AND parcial_origem_id IS NOT NULL
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
          AND status NOT IN ('cancelada', 'concluida')
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
      `;
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
      await moverParcialInteira(
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
        tx as unknown as typeof sql,
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
        item.id, item.pedido_id,
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
        item.setor_atual, destino,
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
        Number(item.quantidade_pendente), user.id, obs || 'Devolução'
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
      );
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
    });
export const dynamic = 'force-dynamic';

import { runMigrations } from '@/lib/migrations';
  // ── entregar ──────────────────────────────────────────────────────────────
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
  } else if (acao === 'entregar') {
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
    let jaEntregue = false;
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
    await sql.begin(async (tx) => {
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
      // Re-read with FOR UPDATE inside tx to prevent concurrent double-delivery
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
      const [locked] = await tx`
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
        SELECT id, status, quantidade_entregue, quantidade_pendente
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
        FROM producao_itempedido WHERE id = ${item.id} FOR UPDATE
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
      `;
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
      if (locked.status === 'entregue') { jaEntregue = true; return; }
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
      const qtdEntregue = Number(locked.quantidade_entregue || 0) + Number(locked.quantidade_pendente);
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
        VALUES (${item.id}, ${item.pedido_id}, ${user.id}, ${item.setor_atual}, NULL,
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
                ${item.status}, 'entregue', ${obs || null}, NOW())
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
        SET status='entregue', quantidade_entregue=${qtdEntregue}, atualizado_em=NOW()
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
        WHERE id=${item.id}
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
      `;
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
      // Marca todas as parciais ativas do item como concluídas
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
      await tx`
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
        UPDATE producao_itemparcial
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
        SET status = 'concluida', atualizado_em = NOW()
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
        WHERE item_pedido_id = ${item.id} AND status IN ('em_aberto', 'em_andamento')
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
      `;
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
      const [{ pendentes }] = await tx`
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
        SELECT COUNT(*) AS pendentes FROM producao_itempedido
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
        WHERE pedido_id = ${item.pedido_id} AND status != 'entregue'
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
      `;
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
      if (Number(pendentes) === 0) {
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
        await tx`UPDATE producao_pedido SET status='entregue', atualizado_em=NOW() WHERE id=${item.pedido_id}`;
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
      }
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
    });
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
    if (jaEntregue) return NextResponse.json({ ok: true, mensagem: 'Item já estava entregue' });
export const dynamic = 'force-dynamic';

import { runMigrations } from '@/lib/migrations';
  // ── receber ───────────────────────────────────────────────────────────────
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
  } else if (acao === 'receber') {
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
    const qtdReceber = body.quantidade ? Number(body.quantidade) : null;
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
    const qtdTotal = Number(item.quantidade_pendente);
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
    if (qtdReceber && qtdReceber > 0 && qtdReceber < qtdTotal) {
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
      const qtdRestante = qtdTotal - qtdReceber;
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
      const idxAtual = roteiro.indexOf(item.setor_atual);
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
      const setorAnterior = idxAtual > 0 ? roteiro[idxAtual - 1] : item.setor_atual;
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
      await sql.begin(async (tx) => {
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
        // 1. Ajusta a parcial existente no setor atual: reduz para qtdReceber e marca como em_andamento.
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
        //    Sem isso, a soma das parciais ativas ultrapassaria a quantidade total do item.
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
        const parcialAtual = await getParcialAtiva(tx as unknown as typeof sql, item.id, item.setor_atual);
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
        if (parcialAtual) {
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
          await tx`
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
            UPDATE producao_itemparcial
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
            SET quantidade = ${qtdReceber}, status = 'em_andamento', atualizado_em = NOW()
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
            WHERE id = ${parcialAtual.id}
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
          `;
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
        } else {
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
          // Item sem parcial (pré-sistema): cria parcial para a quantidade recebida
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
          await tx`
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
            INSERT INTO producao_itemparcial
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
              (item_pedido_id, pedido_id, quantidade, setor_atual, status, observacao,
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
               criado_por_id, criado_em, atualizado_em)
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
            VALUES
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
              (${item.id}, ${item.pedido_id}, ${qtdReceber}, ${item.setor_atual},
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
               'em_andamento', ${`Recebido parcialmente: ${qtdReceber} de ${qtdTotal} ${item.unidade}`},
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
               ${user.id}, NOW(), NOW())
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
          `;
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
        }
export const dynamic = 'force-dynamic';

import { runMigrations } from '@/lib/migrations';
        // 2. Cria parcial para o restante que ficou no setor anterior
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
        await tx`
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
          INSERT INTO producao_itemparcial
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
            (item_pedido_id, pedido_id, quantidade, setor_atual, status, observacao,
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
             criado_por_id, criado_em, atualizado_em)
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
          VALUES
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
            (${item.id}, ${item.pedido_id}, ${qtdRestante}, ${setorAnterior},
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
             'em_aberto', ${`Restante não recebido: ${qtdRestante} ${item.unidade}`},
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
             ${user.id}, NOW(), NOW())
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
        `;
export const dynamic = 'force-dynamic';

import { runMigrations } from '@/lib/migrations';
        // 3. Lote de compatibilidade para o restante em trânsito
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
            (${item.id}, ${setorAnterior}, ${item.setor_atual}, ${qtdRestante}, 'em_producao',
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
             ${`Restante parcial: ${qtdRestante} de ${qtdTotal} ${item.unidade}`},
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
             ${user.id}, NOW(), NOW())
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
        `;
export const dynamic = 'force-dynamic';

import { runMigrations } from '@/lib/migrations';
        const obsReceber = `Recebido ${qtdReceber} de ${qtdTotal} ${item.unidade}. Restam ${qtdRestante} ${item.unidade} em ${nomeSector(setorAnterior)}.`;
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
          VALUES (${item.id}, ${item.pedido_id}, ${user.id}, ${item.setor_atual}, ${item.setor_atual},
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
                  ${item.status}, 'recebido', ${obsReceber}, NOW())
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
          SET status = 'recebido', quantidade_pendente = ${qtdReceber}, atualizado_em = NOW()
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
          WHERE id = ${item.id}
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
        `;
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
      });
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
    } else {
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
      await sql.begin(async (tx) => {
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
          VALUES (${item.id}, ${item.pedido_id}, ${user.id}, ${item.setor_atual}, ${item.setor_atual},
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
                  ${item.status}, 'recebido', ${obs || 'Recebido no setor'}, NOW())
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
        `;
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
        await tx`UPDATE producao_itempedido SET status='recebido', atualizado_em=NOW() WHERE id=${item.id}`;
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
        await tx`UPDATE producao_pedido SET setor_atual=${item.setor_atual}, atualizado_em=NOW() WHERE id=${item.pedido_id}`;
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
        // Marca parcial do setor como em_andamento
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
        await tx`
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
          UPDATE producao_itemparcial
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
          SET status = 'em_andamento', atualizado_em = NOW()
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
          WHERE item_pedido_id = ${item.id}
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
            AND setor_atual = ${item.setor_atual}
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
            AND status = 'em_aberto'
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
        `;
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
      });
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
    }
export const dynamic = 'force-dynamic';

import { runMigrations } from '@/lib/migrations';
  // ── reprovar ──────────────────────────────────────────────────────────────
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
  } else if (acao === 'reprovar') {
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
    await registrarMovItem(item.id, item.pedido_id, user.id, item.setor_atual, item.setor_atual, item.status, 'reprovado', obs || 'Reprovado na inspeção');
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
    await sql`UPDATE producao_itempedido SET status='reprovado', atualizado_em=NOW() WHERE id=${item.id}`;
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
    try {
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
      await sql`
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
        INSERT INTO producao_divergencia
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
          (pedido_id, item_id, usuario_id, tipo, descricao, setor_responsavel, status, prioridade, criado_em, atualizado_em)
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
        VALUES (
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
          ${item.pedido_id}, ${item.id}, ${user.id}, 'qualidade',
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
          ${obs || 'Item reprovado na inspeção de qualidade'},
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
          ${item.setor_atual}, 'aberta', 'alta', NOW(), NOW()
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
        )
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
      `;
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
    } catch { /* tabela pode não existir ainda */ }
export const dynamic = 'force-dynamic';

import { runMigrations } from '@/lib/migrations';
  // ── retrabalho ────────────────────────────────────────────────────────────
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
  } else if (acao === 'retrabalho') {
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
    const destino = body.setor_destino;
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
    if (!destino || !SETORES_VALIDOS.includes(destino))
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
      return NextResponse.json({ erro: 'Setor de destino inválido' }, { status: 400 });
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
    const obsRet = obs || `Encaminhado para retrabalho em ${nomeSector(destino)}`;
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
    await sql.begin(async (tx) => {
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
        VALUES (${item.id}, ${item.pedido_id}, ${user.id}, ${item.setor_atual}, ${destino},
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
                ${item.status}, 'aguardando', ${obsRet}, NOW())
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
      `;
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
      await tx`UPDATE producao_itempedido SET status='aguardando', setor_atual=${destino}, atualizado_em=NOW() WHERE id=${item.id}`;
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
      await moverParcialInteira(
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
        tx as unknown as typeof sql,
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
        item.id, item.pedido_id,
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
        item.setor_atual, destino,
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
        Number(item.quantidade_pendente), user.id, obsRet
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
      );
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
    });
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
    try {
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
      await sql`
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
        UPDATE producao_divergencia SET status='em_analise',
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
          observacao_resolucao=${`Encaminhado para retrabalho: ${destino}`}, atualizado_em=NOW()
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
        WHERE item_id=${item.id} AND status='aberta'
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
      `;
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
    } catch { /* ok */ }
export const dynamic = 'force-dynamic';

import { runMigrations } from '@/lib/migrations';
  // ── resolver ──────────────────────────────────────────────────────────────
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
  } else if (acao === 'resolver') {
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
    const obsRes = obs || 'Resolvido internamente pela qualidade';
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
    await registrarMovItem(item.id, item.pedido_id, user.id, item.setor_atual, item.setor_atual, item.status, 'finalizado_setor', obsRes);
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
    await sql`UPDATE producao_itempedido SET status='finalizado_setor', atualizado_em=NOW() WHERE id=${item.id}`;
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
    try {
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
      await sql`
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
        UPDATE producao_divergencia SET status='resolvida', resolvido_em=NOW(),
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
          resolvido_por_id=${user.id}, observacao_resolucao=${obsRes}, atualizado_em=NOW()
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
        WHERE item_id=${item.id} AND status IN ('aberta','em_analise')
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
      `;
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
    } catch { /* ok */ }
export const dynamic = 'force-dynamic';

import { runMigrations } from '@/lib/migrations';
  // ── cancelar_item ─────────────────────────────────────────────────────────
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
  } else if (acao === 'cancelar_item') {
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
    const obsCan = obs || 'Item cancelado pela qualidade';
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
    await sql.begin(async (tx) => {
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
        VALUES (${item.id}, ${item.pedido_id}, ${user.id}, ${item.setor_atual}, ${item.setor_atual},
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
                ${item.status}, 'bloqueado', ${obsCan}, NOW())
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
      `;
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
      await tx`UPDATE producao_itempedido SET status='bloqueado', atualizado_em=NOW() WHERE id=${item.id}`;
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
      // Cancela todas as parciais ativas do item
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
        WHERE item_pedido_id = ${item.id} AND status IN ('em_aberto', 'em_andamento')
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
      `;
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
    });
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
    try {
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
      await sql`
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
        UPDATE producao_divergencia SET status='cancelada', resolvido_em=NOW(),
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
          resolvido_por_id=${user.id}, observacao_resolucao=${obsCan}, atualizado_em=NOW()
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
        WHERE item_id=${item.id} AND status IN ('aberta','em_analise')
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
      `;
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
    } catch { /* ok */ }
export const dynamic = 'force-dynamic';

import { runMigrations } from '@/lib/migrations';
  // ── iniciar ───────────────────────────────────────────────────────────────
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
  } else if (acao === 'iniciar') {
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
    await sql.begin(async (tx) => {
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
        VALUES (${item.id}, ${item.pedido_id}, ${user.id}, ${item.setor_atual}, ${item.setor_atual},
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
                ${item.status}, 'em_andamento', ${obs}, NOW())
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
      `;
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
      await tx`UPDATE producao_itempedido SET status='em_andamento', atualizado_em=NOW() WHERE id=${item.id}`;
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
      // Atualiza status da parcial e registra horário de início
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
            iniciado_em = COALESCE(iniciado_em, NOW()),
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
            atualizado_em = NOW()
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
        WHERE item_pedido_id = ${item.id}
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
          AND setor_atual = ${item.setor_atual}
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
          AND status IN ('em_aberto')
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
      `;
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
      // Finaliza lotes em_trabalho para este item neste setor (chegaram via envio parcial)
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
      await tx`
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
        UPDATE producao_loteitem
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
        SET status = 'concluido', atualizado_em = NOW()
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
        WHERE item_pedido_id = ${item.id}
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
          AND setor_destino = ${item.setor_atual}
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
          AND status = 'em_trabalho'
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
      `;
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
    });
export const dynamic = 'force-dynamic';

import { runMigrations } from '@/lib/migrations';
  // ── finalizar ─────────────────────────────────────────────────────────────
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
  } else if (acao === 'finalizar') {
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
    await sql.begin(async (tx) => {
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
        VALUES (${item.id}, ${item.pedido_id}, ${user.id}, ${item.setor_atual}, ${item.setor_atual},
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
                ${item.status}, 'finalizado_setor', ${obs}, NOW())
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
      `;
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
      await tx`UPDATE producao_itempedido SET status='finalizado_setor', atualizado_em=NOW() WHERE id=${item.id}`;
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
      // Marca parcial do setor como concluida e registra horário de conclusão
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
        WHERE item_pedido_id = ${item.id}
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
          AND setor_atual = ${item.setor_atual}
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
          AND status IN ('em_aberto', 'em_andamento')
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
      `;
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
    });
export const dynamic = 'force-dynamic';

import { runMigrations } from '@/lib/migrations';
  // ── retomar ───────────────────────────────────────────────────────────────
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
  // Quando vem de 'finalizado_setor', precisa reativar a parcial concluída
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
  } else if (acao === 'retomar') {
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
    await sql.begin(async (tx) => {
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
        VALUES (${item.id}, ${item.pedido_id}, ${user.id}, ${item.setor_atual}, ${item.setor_atual},
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
                ${item.status}, 'em_andamento', ${obs || 'Etapa reaberta'}, NOW())
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
      `;
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
      await tx`UPDATE producao_itempedido SET status='em_andamento', atualizado_em=NOW() WHERE id=${item.id}`;
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
      // Reativa parcial concluída neste setor (caso tenha sido finalizada antes do envio parcial)
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
      await tx`
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
        UPDATE producao_itemparcial
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
        SET status = 'em_andamento', atualizado_em = NOW()
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
        WHERE item_pedido_id = ${item.id}
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
          AND setor_atual = ${item.setor_atual}
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
          AND status = 'concluida'
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
          AND parcial_origem_id IS NULL
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
      `;
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
    });
export const dynamic = 'force-dynamic';

import { runMigrations } from '@/lib/migrations';
  // ── demais ações (pausar, aprovar, despachar) ─────────────────────────────
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
  } else {
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
    await registrarMovItem(item.id, item.pedido_id, user.id, item.setor_atual, item.setor_atual, item.status, novoStatus, obs);
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
    await sql`UPDATE producao_itempedido SET status=${novoStatus}, atualizado_em=NOW() WHERE id=${item.id}`;
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
  }
export const dynamic = 'force-dynamic';

import { runMigrations } from '@/lib/migrations';
  return NextResponse.json({ ok: true, status: novoStatus });
export const dynamic = 'force-dynamic';

import { runMigrations } from '@/lib/migrations';
  } catch (err: unknown) {
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
    const msg = err instanceof Error ? err.message : 'Erro interno no servidor';
export const dynamic = 'force-dynamic';
import { runMigrations } from '@/lib/migrations';
    console.error('[item/acao]', params.acao, err);
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
