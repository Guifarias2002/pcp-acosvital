import sql from './db';
import { NOMES, injetarQuarentena } from './types';

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

// Normaliza uma data (Date do driver OU string) para ISO 'AAAA-MM-DD' ou null.
// Colunas DATE às vezes chegam como Date (SELECT i.*), às vezes como texto
// (SELECT ...::text); esta função aceita os dois e sempre devolve 'AAAA-MM-DD'.
function isoDate(v: unknown): string | null {
  if (!v) return null;
  if (v instanceof Date) return isNaN(v.getTime()) ? null : v.toISOString().slice(0, 10);
  const s = String(v).trim();
  return s ? s.slice(0, 10) : null;
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

export async function queryItens(pedidoId: number, incluirInativos = false) {
  const rows = await sql`
    SELECT
      i.id, i.pedido_id, i.codigo, i.descricao,
      i.quantidade::text, i.unidade,
      i.roteiro_proprio, i.fabrica, i.setor_atual, i.status, i.item_pai_id, i.tipo_produto,
      i.quantidade_pendente::text,
      i.quantidade_entregue::text,
      i.valor_unitario::text,
      i.inativo, i.inativado_em::text AS inativado_em, i.inativado_por, i.motivo_inativacao,
      i.previsao_conclusao::text AS previsao_conclusao,
      COALESCE(i.desenhos, '{}') AS desenhos,
      p.numero_pedido_venda AS pedido_numero,
      p.cliente AS pedido_cliente,
      p.prazo_entrega::text AS pedido_prazo,
      p.previsao_conclusao::text AS pedido_previsao,
      p.prioridade AS pedido_prioridade,
      p.roteiro_base
    FROM producao_itempedido i
    JOIN producao_pedido p ON p.id = i.pedido_id
    WHERE i.pedido_id = ${pedidoId}
      AND (${incluirInativos} OR i.inativo = false)
    ORDER BY p.numero_pedido_venda, i.codigo
  `;

  return rows.map(formatItem);
}

function rotEfetivo(row: Record<string, unknown>): string[] {
  const prop = row.roteiro_proprio as string[] | null;
  const base = (prop && prop.length > 0) ? prop : ((row.roteiro_base as string[]) || []);
  // Toda peça passa pela Quarentena antes da Logística (verificação de despacho).
  return injetarQuarentena(base);
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
    // ATRASO agora é pela PREVISÃO DE CONCLUSÃO (própria da peça ou herdada do
    // pedido), NÃO pelo prazo_entrega (que é a previsão de faturamento do Omie).
    // Sem previsão definida = NÃO atrasado (neutro) — evita marcar tudo como
    // atrasado por causa da data de faturamento.
    atrasado: (() => {
      const prev = isoDate(row.previsao_conclusao) || isoDate(row.pedido_previsao);
      return !!prev && diasPrazo(prev) < 0 && row.status !== 'entregue';
    })(),
    pedido_prazo: fmtData(row.pedido_prazo),
    pedido_prazo_iso: row.pedido_prazo || null,
    pedido_prioridade: row.pedido_prioridade,
    codigo: row.codigo,
    descricao: row.descricao,
    quantidade: row.quantidade,
    unidade: row.unidade,
    roteiro_proprio: row.roteiro_proprio || [],
    fabrica: row.fabrica || 'flange',
    item_pai_id: row.item_pai_id || null,
    tipo_produto: row.tipo_produto || null,
    // Previsão de conclusão: a da PEÇA quando existe; senão herda a do PEDIDO.
    // `previsao_efetiva` é a que vale para atraso/conclusão. ISO cru (AAAA-MM-DD)
    // para a UI editar; `_fmt` já formatado para exibir.
    previsao_conclusao: isoDate(row.previsao_conclusao),
    pedido_previsao: isoDate(row.pedido_previsao),
    previsao_efetiva: isoDate(row.previsao_conclusao) || isoDate(row.pedido_previsao),
    previsao_efetiva_fmt: fmtData(isoDate(row.previsao_conclusao) || isoDate(row.pedido_previsao) || ''),
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
    inativo: !!row.inativo,
    inativado_em: row.inativado_em || null,
    inativado_por: row.inativado_por || null,
    motivo_inativacao: row.motivo_inativacao || null,
  };
}

// ── Pedidos ──────────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function formatPedido(row: any, itens: unknown[] = []) {
  // Previsão de conclusão do PEDIDO: a própria (definida pelo PCP) quando existe;
  // senão, a MAIOR previsão efetiva entre as peças (o pedido fica pronto quando a
  // última peça fica pronta). Datas ISO (AAAA-MM-DD) comparam bem como texto.
  const previsoesPecas = (itens as Array<{ previsao_efetiva?: string | null }>)
    .map(i => i?.previsao_efetiva).filter((d): d is string => !!d);
  const maxPecas = previsoesPecas.length > 0 ? previsoesPecas.reduce((a, b) => (a > b ? a : b)) : null;
  const previsaoEfetiva = isoDate(row.previsao_conclusao) || maxPecas || null;
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
    // Pedido "de Caldeiraria": ou nasceu direto lá (roteiro_base), ou tem algum
    // item avulso com roteiro próprio passando por lá (ex: um Tubo anexado a
    // um pedido de Flanges). Usado só pra exibir o tipo na lista de pedidos.
    envolve_caldeiraria: !!(row.roteiro_base || []).includes('caldeiraria') || !!row.tem_item_caldeiraria,
    observacoes: row.observacoes || '',
    // Previsão de conclusão (base do atraso "real"; prazo_entrega é só faturamento).
    previsao_conclusao: isoDate(row.previsao_conclusao),
    previsao_conclusao_efetiva: previsaoEfetiva,
    previsao_conclusao_fmt: fmtData(previsaoEfetiva || ''),
    // Rastreio pelo cliente + entrega contratual (só o detalhe do pedido e a
    // lista trazem essas colunas; nas rotas que não as selecionam ficam vazias).
    numero_pedido_cliente: row.numero_pedido_cliente || null,
    entrega_contratual: isoDate(row.entrega_contratual),
    entrega_contratual_fmt: fmtData(isoDate(row.entrega_contratual) || ''),
    // Início REAL da produção (1º apontamento). Vem do getPedidoComItens; sem
    // apontamento ainda = null. É o começo verdadeiro, não a emissão da OP.
    producao_iniciada_em: row.producao_iniciada_em || null,
    producao_iniciada_em_fmt: fmtData(row.producao_iniciada_em ? String(row.producao_iniciada_em) : ''),
    // ATRASO pela PREVISÃO DE CONCLUSÃO efetiva do pedido (não pelo faturamento
    // Omie). Sem previsão = não atrasado, dias_prazo 0, cor neutra.
    atrasado: !!previsaoEfetiva && diasPrazo(previsaoEfetiva) < 0 && row.status !== 'entregue',
    dias_prazo: previsaoEfetiva ? diasPrazo(previsaoEfetiva) : 0,
    cor_prazo: previsaoEfetiva ? corPrazo(previsaoEfetiva, row.status) : 'secondary',
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

export async function getPedidoComItens(id: number, incluirInativos = false) {
  const [pedRow] = await sql`
    SELECT p.*, u.nome AS criado_por_nome,
           COALESCE((SELECT SUM(i2.quantidade * COALESCE(i2.valor_unitario,0)) FROM producao_itempedido i2 WHERE i2.pedido_id = p.id AND (${incluirInativos} OR i2.inativo = false)), 0)::text AS valor_calculado,
           -- Início REAL da produção = 1º apontamento (menor iniciado_em) entre
           -- todas as parciais do pedido. NULL enquanto nada começou a produzir.
           (SELECT MIN(ip.iniciado_em) FROM producao_itemparcial ip WHERE ip.pedido_id = p.id) AS producao_iniciada_em
    FROM producao_pedido p
    LEFT JOIN usuarios_usuario u ON u.id = p.criado_por_id
    WHERE p.id = ${id}
  `;
  if (!pedRow) return null;
  const itens = await queryItens(id, incluirInativos);

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
  let parciaisPorSetor: Record<number, { setor: string; setor_nome: string; quantidade: string; unidade: string; status: string; retrabalho: boolean; motivo_retrabalho: string | null; maquina: string | null; operador: string | null }[]> = {};
  if (itemIds.length > 0) {
    const parcialRows = await sql`
      SELECT
        pa.item_pedido_id,
        pa.setor_atual,
        pa.status,
        pa.retrabalho,
        pa.motivo_retrabalho,
        pa.maquina,
        pa.operador,
        SUM(pa.quantidade)::text AS quantidade,
        i2.unidade
      FROM producao_itemparcial pa
      JOIN producao_itempedido i2 ON i2.id = pa.item_pedido_id
      WHERE pa.item_pedido_id = ANY(${itemIds})
        AND pa.status != 'cancelada'
      GROUP BY pa.item_pedido_id, pa.setor_atual, pa.status, pa.retrabalho, pa.motivo_retrabalho, pa.maquina, pa.operador, i2.unidade
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
        maquina: (p.maquina as string) || null,
        operador: (p.operador as string) || null,
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

  // Anexos por item (desenho/OP/outro) — montados na receita de itens compostos.
  const anexosPorItem: Record<number, { id: number; tipo: string; nome_arquivo: string; criado_em: string }[]> = {};
  if (itemIds.length > 0) {
    const anexoRows = await sql`
      SELECT id, item_pedido_id, tipo, nome_arquivo, criado_em
      FROM producao_item_anexo
      WHERE item_pedido_id = ANY(${itemIds})
      ORDER BY item_pedido_id, criado_em
    `.catch(() => [] as Record<string, unknown>[]);
    for (const a of anexoRows) {
      const iid = Number(a.item_pedido_id);
      if (!anexosPorItem[iid]) anexosPorItem[iid] = [];
      anexosPorItem[iid].push({ id: a.id as number, tipo: a.tipo as string, nome_arquivo: a.nome_arquivo as string, criado_em: a.criado_em as string });
    }
  }

  // Ficha de Fabricação: checklists de processo por etapa da Caldeiraria,
  // acumulados em ordem cronológica (tabela insert-only, nunca sobrescreve).
  const checklistsPorItem: Record<number, { id: number; setor: string; setor_nome: string; tipo_produto: string | null; respostas: { id: string; label: string; resposta: string; observacao: string }[]; usuario_nome: string; criado_em: string }[]> = {};
  if (itemIds.length > 0) {
    const checklistRows = await sql`
      SELECT c.*, u.nome AS usuario_nome
      FROM producao_checklist_processo c
      LEFT JOIN usuarios_usuario u ON u.id = c.usuario_id
      WHERE c.item_id = ANY(${itemIds})
      ORDER BY c.criado_em ASC
    `.catch(() => [] as Record<string, unknown>[]);
    for (const c of checklistRows) {
      const iid = Number(c.item_id);
      if (!checklistsPorItem[iid]) checklistsPorItem[iid] = [];
      checklistsPorItem[iid].push({
        id: c.id as number,
        setor: c.setor as string,
        setor_nome: nomeSector(c.setor as string),
        tipo_produto: (c.tipo_produto as string) || null,
        respostas: (c.respostas as { id: string; label: string; resposta: string; observacao: string }[]) || [],
        usuario_nome: (c.usuario_nome as string) || 'Sistema',
        criado_em: c.criado_em as string,
      });
    }
  }

  const itensComDetalhe = itens.map(i => ({
    ...i,
    lotes: lotes[i.id] || [],
    movimentacoes: movs[i.id] || [],
    parciais_por_setor: parciaisPorSetor[i.id] || [],
    observacoes: observacoes[i.id] || [],
    fotos: fotosPorItem[i.id] || [],
    anexos: anexosPorItem[i.id] || [],
    checklists_processo: checklistsPorItem[i.id] || [],
  }));

  return formatPedido(pedRow, itensComDetalhe);
}
