import sql from './db';
import { NOMES } from './types';

// ── Helpers ──────────────────────────────────────────────────────────────────

export function nomeSector(cod: string) { return NOMES[cod] || cod; }

export function corStatus(status: string): string {
  const m: Record<string, string> = {
    aguardando: 'secondary', recebido: 'info', em_andamento: 'warning',
    pausado: 'warning', finalizado_setor: 'success', entregue: 'success',
    bloqueado: 'danger', reprovado: 'danger', aprovado: 'success', emitido: 'secondary',
    // Vocabulário de parcial (producao_itemparcial), além do de item acima.
    em_aberto: 'secondary', concluida: 'success', cancelada: 'danger', em_transito: 'info',
  };
  return m[status] || 'secondary';
}

export function statusDisplay(s: string): string {
  const m: Record<string, string> = {
    emitido: 'Emitido', aguardando: 'Aguardando', recebido: 'Recebido',
    em_andamento: 'Em Andamento', pausado: 'Pausado', finalizado_setor: 'Finalizado no Setor',
    em_aberto: 'Em Aberto', concluida: 'Concluída', cancelada: 'Cancelada',
    em_transito: 'Em Trânsito', bloqueado: 'Bloqueado', reprovado: 'Reprovado',
    aprovado: 'Aprovado', entregue: 'Entregue',
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
      COALESCE(i.desenhos, '{}') AS desenhos,
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
    // atrasado precisa comparar a data crua (ISO) - pedido_prazo abaixo ja vira
    // string formatada (DD/MM/AAAA) so para exibicao, comparar ela com "hoje" em
    // ISO dava sempre errado (comparacao de texto, nao de data real).
    atrasado: row.pedido_prazo ? diasPrazo(row.pedido_prazo) < 0 : false,
    pedido_prazo: fmtData(row.pedido_prazo),
    pedido_prazo_iso: row.pedido_prazo || null,
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
    desenhos: (row.desenhos as string[]) || [],
    numero_op: row.numero_op || '',
    tem_desenho: !!row.desenho_url || ((row.desenhos as string[])?.length > 0),
    tem_pedido_venda: row.tem_pedido_venda ?? !!row.pedido_venda_url,
    tem_ordem_producao: row.tem_ordem_producao ?? !!row.ordem_producao_url,
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
    desenhos: (row.desenhos as string[]) || [],
    tem_desenho: !!row.desenho_url || ((row.desenhos as string[])?.length > 0),
    // Algumas rotas (lista de pedidos) já mandam o booleano pronto (tem_pedido_venda)
    // para não precisar trazer a coluna inteira; outras (pedido individual) mandam
    // a url crua (pedido_venda_url) via "SELECT p.*" - aceita os dois formatos.
    tem_pedido_venda: row.tem_pedido_venda ?? !!row.pedido_venda_url,
    tem_ordem_producao: row.tem_ordem_producao ?? !!row.ordem_producao_url,
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

  // Observações por item — histórico acumulado por setor (tabela pode não existir ainda)
  let observacoes: Record<number, { id: number; setor: string; setor_nome: string; usuario_nome: string; texto: string; criado_em: string }[]> = {};
  if (itemIds.length > 0) {
    const obsRows = await sql`
      SELECT o.*, u.nome AS usuario_nome
      FROM producao_item_observacao o
      LEFT JOIN usuarios_usuario u ON u.id = o.usuario_id
      WHERE o.item_id = ANY(${itemIds})
      ORDER BY o.criado_em ASC
    `.catch(() => [] as Record<string, unknown>[]);
    for (const o of obsRows) {
      const iid = Number(o.item_id);
      if (!observacoes[iid]) observacoes[iid] = [];
      observacoes[iid].push({
        id: o.id as number,
        setor: o.setor as string,
        setor_nome: nomeSector(o.setor as string),
        usuario_nome: (o.usuario_nome as string) || 'Sistema',
        texto: o.texto as string,
        criado_em: o.criado_em as string,
      });
    }
  }

  // Distribuição de parciais por setor para cada item — inclui 'concluida' (peça
  // finalizada num setor mas ainda fisicamente lá, aguardando ir pro próximo) para
  // a rastreabilidade não "perder" a localização de itens já finalizados no setor.
  // Só exclui 'cancelada' (peça sucateada/reprovada, não deve aparecer como ativa).
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
        AND pa.status != 'cancelada'
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

  // Fotos das peças (tiradas no Acabamento/Embalagem) — agregadas por item.
  // Cada foto é referenciada por (parcial_id, idx) para montar a URL no front:
  // /api/parcial/{parcial_id}/foto?idx={idx}
  const fotosPorItem: Record<number, { parcial_id: number; idx: number }[]> = {};
  if (itemIds.length > 0) {
    const fotoRows = await sql`
      SELECT id, item_pedido_id, fotos
      FROM producao_itemparcial
      WHERE item_pedido_id = ANY(${itemIds})
        AND status != 'cancelada'
        AND COALESCE(array_length(fotos, 1), 0) > 0
      ORDER BY item_pedido_id, id
    `.catch(() => [] as Record<string, unknown>[]);
    for (const r of fotoRows) {
      const iid = Number(r.item_pedido_id);
      const fotos = (r.fotos as string[]) || [];
      if (!fotosPorItem[iid]) fotosPorItem[iid] = [];
      fotos.forEach((_, idx) => fotosPorItem[iid].push({ parcial_id: Number(r.id), idx }));
    }
  }

  const itensComDetalhe = itens.map(i => ({
    ...i,
    lotes: lotes[i.id] || [],
    movimentacoes: movs[i.id] || [],
    parciais_por_setor: parciaisPorSetor[i.id] || [],
    observacoes: observacoes[i.id] || [],
    fotos: fotosPorItem[i.id] || [],
  }));

  return formatPedido(pedRow, itensComDetalhe);
}
