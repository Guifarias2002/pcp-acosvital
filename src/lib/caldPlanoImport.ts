// Reimportação da planilha do PCP da Caldeiraria: casa cada linha com o item
// que já existe e calcula SÓ o que mudou. Usado por /api/cald-plano/importar.
// Regras (ver o cabeçalho da rota): casamento por pedido + material (desempate
// pela quantidade; 1 linha + 1 item soltos no mesmo pedido = material
// renomeado); campo vazio na planilha nunca apaga; finalizado não reabre.
import { CODIGOS_AREA, AREA_POR_CODIGO, ordenarAreas, isoValida, fmtData, UNIDADES_CALD, type ItemCald } from './caldPlano';

export interface Linha {
  linha: number; pedido: string; material: string; vendedor: string | null; cliente: string | null;
  quantidade: number | null; unidade: string; valor: number | null; areas: string[];
  etapas: { area: string; entrada: string | null; fornecedor: string | null }[];
  prev_faturamento: string | null; faturado_em: string | null; prev_finalizacao: string | null;
  finalizado_em: string | null; parcial: boolean; obs: string | null;
}
export interface ResultadoLinha {
  linha: number; pedido: string; material: string;
  tipo: 'novo' | 'atualizar' | 'igual' | 'cancelado' | 'invalida';
  item_id?: number; mudancas?: string[];
}

const s = (v: unknown, max: number) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null);
const normMat = (m: string) => m.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  .replace(/[º°]/g, 'o').replace(/[^a-z0-9"x.,/ ]/g, ' ').replace(/\s+/g, ' ').trim();
const nomeArea = (c: string | null) => (c ? AREA_POR_CODIGO[c]?.nome ?? c : '—');

export function limpar(l: Record<string, unknown>, i: number): Linha | null {
  const pedido = s(l.pedido, 40), material = s(l.material, 200);
  if (!pedido || !material) return null;
  const areas = ordenarAreas(Array.isArray(l.areas) ? (l.areas as unknown[]).map(String) : []);
  const etapas = (Array.isArray(l.etapas) ? l.etapas as Record<string, unknown>[] : [])
    .map(e => ({ area: String(e.area || ''), entrada: isoValida(e.entrada), fornecedor: s(e.fornecedor, 120) }))
    .filter(e => CODIGOS_AREA.includes(e.area) && areas.includes(e.area));
  return {
    linha: Number(l.linha) || i + 1, pedido, material,
    vendedor: s(l.vendedor, 80), cliente: s(l.cliente, 120),
    quantidade: typeof l.quantidade === 'number' && Number.isFinite(l.quantidade) ? l.quantidade : null,
    unidade: UNIDADES_CALD.includes(String(l.unidade)) ? String(l.unidade) : 'pç',
    valor: typeof l.valor === 'number' && Number.isFinite(l.valor) && l.valor >= 0 ? l.valor : null,
    areas, etapas,
    prev_faturamento: isoValida(l.prev_faturamento), faturado_em: isoValida(l.faturado_em),
    prev_finalizacao: isoValida(l.prev_finalizacao), finalizado_em: isoValida(l.finalizado_em),
    parcial: !!l.parcial, obs: s(l.obs, 1000),
  };
}

// Casa cada linha com no máximo 1 item existente (e vice-versa).
export function casar(linhas: Linha[], existentes: ItemCald[]): Map<number, ItemCald> {
  const par = new Map<number, ItemCald>();       // índice da linha → item
  const usados = new Set<number>();
  const doPedido = (p: string) => existentes.filter(e => e.pedido.toLowerCase() === p.toLowerCase() && !usados.has(e.id));
  // 1) mesmo material; entre vários, o de mesma quantidade primeiro.
  linhas.forEach((l, i) => {
    const cands = doPedido(l.pedido).filter(e => normMat(e.material) === normMat(l.material));
    if (!cands.length) return;
    const e = cands.find(c => c.quantidade === l.quantidade) || cands[0];
    par.set(i, e); usados.add(e.id);
  });
  // 2) sobrou exatamente 1 linha e 1 item (não cancelado) no mesmo pedido → material renomeado.
  const pedidos = Array.from(new Set(linhas.map(l => l.pedido.toLowerCase())));
  for (const p of pedidos) {
    const soltas = linhas.map((l, i) => ({ l, i })).filter(x => x.l.pedido.toLowerCase() === p && !par.has(x.i));
    const livres = doPedido(p).filter(e => e.status !== 'cancelado');
    if (soltas.length === 1 && livres.length === 1) { par.set(soltas[0].i, livres[0]); usados.add(livres[0].id); }
  }
  return par;
}

// O que muda num item existente. Só campos que a planilha TEM e que diferem.
export function diferencas(l: Linha, it: ItemCald) {
  const set: Record<string, unknown> = {};
  const mud: string[] = [];
  const cmp = (campo: keyof ItemCald & string, novo: unknown, rot: string, fmt = (v: unknown) => String(v ?? '—')) => {
    if (novo === null || novo === undefined) return;
    if (novo !== (it[campo] as unknown)) { set[campo] = novo; mud.push(`${rot}: ${fmt(it[campo])} → ${fmt(novo)}`); }
  };
  const fd = (v: unknown) => (v ? fmtData(String(v)) : '—');
  cmp('material', l.material, 'Material');
  cmp('vendedor', l.vendedor, 'Vendedor');
  cmp('cliente', l.cliente, 'Cliente');
  cmp('quantidade', l.quantidade, 'Qtd');
  if (l.quantidade !== null) cmp('unidade', l.unidade, 'Unidade');
  cmp('valor', l.valor, 'Valor', v => (v === null || v === undefined ? '—' : Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })));
  cmp('prev_faturamento', l.prev_faturamento, 'Prev. faturamento', fd);
  cmp('faturado_em', l.faturado_em, 'Faturado', fd);
  cmp('prev_finalizacao', l.prev_finalizacao, 'Prev. finalização', fd);
  cmp('finalizado_em', l.finalizado_em, 'Finalizado', fd);
  if (l.parcial && !it.parcial) { set.parcial = true; mud.push('Marcado PARCIAL'); }
  if (l.obs && !it.obs) { set.obs = l.obs; mud.push(`Obs: ${l.obs}`); }

  // Roteiro: acrescenta área nova (nunca tira).
  const areas = ordenarAreas([...it.areas, ...l.areas]);
  if (areas.join(',') !== it.areas.join(',')) {
    set.areas = areas;
    mud.push(`Roteiro: + ${l.areas.filter(a => !it.areas.includes(a)).map(nomeArea).join(', ')}`);
  }
  // Datas de entrada / fornecedor por área.
  const etapas: { area: string; entrada: string | null; fornecedor: string | null }[] = [];
  const merged = new Map(it.etapas.map(e => [e.area, { entrada: e.entrada, fornecedor: e.fornecedor }]));
  for (const e of l.etapas) {
    const ant = it.etapas.find(x => x.area === e.area);
    const entrada = e.entrada ?? ant?.entrada ?? null;
    const fornecedor = e.fornecedor ?? ant?.fornecedor ?? null;
    if (entrada !== (ant?.entrada ?? null) || fornecedor !== (ant?.fornecedor ?? null)) {
      etapas.push({ area: e.area, entrada, fornecedor });
      merged.set(e.area, { entrada, fornecedor });
      const p: string[] = [];
      if (entrada !== (ant?.entrada ?? null)) p.push(`entrada ${fd(ant?.entrada)} → ${fd(entrada)}`);
      if (fornecedor !== (ant?.fornecedor ?? null)) p.push(`fornecedor ${ant?.fornecedor ?? '—'} → ${fornecedor}`);
      mud.push(`${nomeArea(e.area)}: ${p.join(', ')}`);
    }
  }

  // Situação. Finalizado (pela planilha ou já no sistema) continua finalizado —
  // planilha antiga sem data de FINALIZADO nunca reabre. Senão, a área atual é a
  // de entrada mais recente (juntando o que já está no sistema com a planilha).
  if (it.status !== 'cancelado') {
    let atual: string | null = null, maior = '';
    for (const a of areas) { const e = merged.get(a); if (e?.entrada && e.entrada >= maior) { maior = e.entrada; atual = a; } }
    const finalizado = !!l.finalizado_em || it.status === 'finalizado';
    if (atual && atual !== it.area_atual) {
      set.area_atual = atual;
      if (!finalizado) mud.push(`Área atual: ${nomeArea(it.area_atual)} → ${nomeArea(atual)}`);
    }
    const novoStatus = finalizado ? 'finalizado' : atual ? 'andamento' : it.status;
    if (novoStatus !== it.status) {
      set.status = novoStatus;
      mud.push(`Situação → ${novoStatus === 'finalizado' ? 'Finalizado' : 'Em produção'}`);
    }
  }
  return { set, etapas, mud };
}

