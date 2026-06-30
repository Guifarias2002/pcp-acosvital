import sql from './db';
import { NOMES } from './types';

// ── Helpers ──────────────────────────────────────────────────────────────────

export function nomeSector(cod: string) { return NOMES[cod] || cod; }

function corStatus(status: string): string {
  const m: Record<string, string> = {
    aguardando: 'secondary', recebido: 'info', em_andamento: 'warning',
    pausado: 'warning', finalizado_setor: 'success', entregue: 'success',
    bloqueado: 'danger', reprovado: 'danger', aprovado: 'success', emitido: 'secondary',
  };
  return m[status] || 'secondary';
}

function statusDisplay(s: string): string {
  const m: Record<string, string> = {
    emitido: 'Emitido', aguardando: 'Aguardando', recebido: 'Recebido',
    em_andamento: 'Em Andamento', pausado: 'Pausado', finalizado_setor: 'Finalizado no Setor',
    bloqueado: 'Bloqueado', reprovado: 'Reprovado', aprovado: 'Aprovado', entregue: 'Entregue',
  };
  return m[s] || s;
}

function fmtData(s: string): string {
  if (!s) return '';
  const d = new Date(s);
  if (isNaN(d.getTime())) return s;
  return d.toLocaleDateString('pt-BR');
}

function diasPrazo(prazo: string): number {
  const diff = new Date(prazo).getTime() - Date.now();
  return Math.ceil(diff / 86400000);
}

function corPrazo(prazo: string, status: string): string {
  if (status === 'entregue') return 'success';
  const d = diasPrazo(prazo);
  if (d < 0) return 'danger';
  if (d <= 3) return 'warning';
  return 'success';
}

// ── Itens ─────────────────────────────────────────────────────────────────────

export async function queryItens(pedidoId: number) {
  const rows = await sql`
    SELECT
      i.id, i.pedido_id, i.codigo, i.descricao,
      i.quantidade::text, i.unidade,
      i.roteiro_proprio, i.setor_atual, i.status,
      i.quantidade_pendente::text,
      i.quantidade_entregue::text,
      i.valor_unitario::text,
      p.numero_pedido_venda AS pedido_numero,
      p.cliente AS pedido_cliente,
      p.prazo_entrega::text AS pedido_prazo,
      p.prioridade AS pedido_prioridade,
      p.roteiro_base
    FROM producao_itempedido i
    JOIN producao_pedido p ON p.id = i.pedido_id
    WHERE i.pedido_id = ${pedidoId}
    ORDER BY p.numero_pedido_venda, i.codigo
  `;

  return rows.map(formatItem);
}

function rotEfetivo(row: Record<string, unknown>): string[] {
  const prop = row.roteiro_proprio as string[] | null;
  if (prop && prop.length > 0) return prop;
  return (row.roteiro_base as string[]) || [];
}

function proximoSetor(roteiro: string[], setor_atual: string): string | null {
  const idx = roteiro.indexOf(setor_atual);
  if (idx === -1 || idx === roteiro.length - 1) return null;
  return roteiro[idx + 1];
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function formatItem(row: any) {
  const roteiro = rotEfetivo(row);
  const prox = proximoSetor(roteiro, row.setor_atual);
  return {
    id: row.id,
    pedido_id: row.pedido_id,
    pedido_numero: row.pedido_numero,
    pedido_cliente: row.pedido_cliente,
    pedido_prazo: fmtData(row.pedido_prazo),
    pedido_prioridade: row.pedido_prioridade,
    codigo: row.codigo,
    descricao: row.descricao,
    quantidade: row.quantidade,
    unidade: row.unidade,
    roteiro_proprio: row.roteiro_proprio || [],
    roteiro_efetivo: roteiro,
    setor_atual: row.setor_atual,
    nome_setor_atual: nomeSector(row.setor_atual),
    status: row.status,
    cor_status: corStatus(row.status),
    status_display: statusDisplay(row.status),
    quantidade_pendente: row.quantidade_pendente,
    quantidade_entregue: row.quantidade_entregue || '0',
    valor_unitario: row.valor_unitario,
    proximo_setor: prox,
    proximo_setor_nome: prox ? nomeSector(prox) : '',
  };
}

// ── Pedidos ──────────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function formatPedido(row: any, itens: unknown[] = []) {
  return {
    id: row.id,
    numero_pedido_venda: row.numero_pedido_venda,
    numero_op: row.numero_op || '',
    cliente: row.cliente,
    vendedor: row.vendedor || '',
    prazo_entrega: fmtData(row.prazo_entrega),
    prioridade: row.prioridade,
    status: row.status,
    cor_status: corStatus(row.status),
    setor_atual: row.setor_atual || '',
    nome_setor_atual: nomeSector(row.setor_atual || ''),
    roteiro_base: row.roteiro_base || [],
    observacoes: row.observacoes || '',
    atrasado: diasPrazo(row.prazo_entrega) < 0 && row.status !== 'entregue',
    dias_prazo: diasPrazo(row.prazo_entrega),
    cor_prazo: corPrazo(row.prazo_entrega, row.status),
    criado_por_nome: row.criado_por_nome || '',
    data_emissao: row.data_emissao,
    criado_em: row.criado_em,
    valor_calculado: row.valor_calculado,
    setores_parciais: (row.setores_parciais || []) as string[],
    nota_url: row.nota_url || null,
    canhoto_url: row.canhoto_url || null,
    anexo_pendente: row.anexo_pendente || false,
    itens,
  };
}

export async function getPedidoComItens(id: number) {
  const [pedRow] = await sql`
    SELECT p.*, u.nome AS criado_por_nome,
           COALESCE((SELECT SUM(i2.quantidade * COALESCE(i2.valor_unitario,0)) FROM producao_itempedido i2 WHERE i2.pedido_id = p.id), 0)::text AS valor_calculado
    FROM producao_pedido p
    LEFT JOIN usuarios_usuario u ON u.id = p.criado_por_id
    WHERE p.id = ${id}
  `;
  if (!pedRow) return null;
  const itens = await queryItens(id);

  // lotes e movimentacoes por item
  const itemIds = itens.map(i => i.id);
  let lotes: Record<number, unknown[]> = {};
  let movs: Record<number, unknown[]> = {};

  if (itemIds.length > 0) {
    const loteRows = await sql`
      SELECT l.*, l.quantidade::text AS quantidade_str
      FROM producao_loteitem l
      WHERE l.item_pedido_id = ANY(${itemIds})
      ORDER BY l.criado_em DESC
    `;
    for (const l of loteRows) {
      if (!lotes[l.item_pedido_id]) lotes[l.item_pedido_id] = [];
      lotes[l.item_pedido_id].push({
        id: l.id, quantidade: l.quantidade_str, status: l.status,
        setor_origem: l.setor_origem, setor_origem_nome: nomeSector(l.setor_origem),
        setor_destino: l.setor_destino, setor_destino_nome: nomeSector(l.setor_destino),
        criado_em: l.criado_em, recebido_em: l.recebido_em,
      });
    }

    const movRows = await sql`
      SELECT m.*, u.nome AS usuario_nome
      FROM producao_movimentacaoitem m
      LEFT JOIN usuarios_usuario u ON u.id = m.usuario_id
      WHERE m.item_id = ANY(${itemIds})
      ORDER BY m.criado_em DESC
    `;
    for (const m of movRows) {
      if (!movs[m.item_id]) movs[m.item_id] = [];
      movs[m.item_id].push({
        id: m.id,
        setor_origem: m.setor_origem, setor_origem_nome: nomeSector(m.setor_origem),
        setor_destino: m.setor_destino, setor_destino_nome: nomeSector(m.setor_destino),
        status_anterior: m.status_anterior, status_anterior_display: statusDisplay(m.status_anterior),
        status_novo: m.status_novo, status_novo_display: statusDisplay(m.status_novo),
        observacao: m.observacao || '',
        usuario_nome: m.usuario_nome || 'Sistema',
        criado_em: m.criado_em,
      });
    }
  }

  // Distribuição de parciais ativas por setor para cada item
  let parciaisPorSetor: Record<number, { setor: string; setor_nome: string; quantidade: string; unidade: string; status: string; retrabalho: boolean; motivo_retrabalho: string | null }[]> = {};
  if (itemIds.length > 0) {
    const parcialRows = await sql`
      SELECT
        pa.item_pedido_id,
        pa.setor_atual,
        pa.status,
        pa.retrabalho,
        pa.motivo_retrabalho,
        SUM(pa.quantidade)::text AS quantidade,
        i2.unidade
      FROM producao_itemparcial pa
      JOIN producao_itempedido i2 ON i2.id = pa.item_pedido_id
      WHERE pa.item_pedido_id = ANY(${itemIds})
        AND pa.status NOT IN ('cancelada', 'concluida')
      GROUP BY pa.item_pedido_id, pa.setor_atual, pa.status, pa.retrabalho, pa.motivo_retrabalho, i2.unidade
      ORDER BY pa.item_pedido_id, pa.setor_atual
    `;
    for (const p of parcialRows) {
      const iid = Number(p.item_pedido_id);
      if (!parciaisPorSetor[iid]) parciaisPorSetor[iid] = [];
      parciaisPorSetor[iid].push({
        setor: p.setor_atual as string,
        setor_nome: nomeSector(p.setor_atual as string),
        quantidade: p.quantidade as string,
        unidade: p.unidade as string,
        status: p.status as string,
        retrabalho: Boolean(p.retrabalho),
        motivo_retrabalho: p.motivo_retrabalho as string | null,
      });
    }
  }

  const itensComDetalhe = itens.map(i => ({
    ...i,
    lotes: lotes[i.id] || [],
    movimentacoes: movs[i.id] || [],
    parciais_por_setor: parciaisPorSetor[i.id] || [],
  }));

  return formatPedido(pedRow, itensComDetalhe);
}
