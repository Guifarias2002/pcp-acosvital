// Planejamento da Caldeiraria (controle do analista/coordenador — "o Reginaldo
// da Caldeiraria"). Módulo SEPARADO do fluxo de pedidos/itens/parciais: os
// pedidos vêm do Omie e são LANÇADOS aqui pelo PCP / quem sabe do pedido; o
// planejador distribui por área, define a ordem, as previsões e anda com cada
// item registrando a DATA DE ENTRADA em cada área (substitui a planilha manual).
// Tabelas: producao_cald_plano_item / _etapa / _hist (migration M49).

export interface AreaCald { codigo: string; nome: string; icon: string; cor: string }

// Ordem padrão das áreas (a mesma da planilha do coordenador).
export const AREAS_CALD: AreaCald[] = [
  { codigo: 'compras',          nome: 'Compras',          icon: 'bi-cart3',            cor: '#0891b2' },
  { codigo: 'desenho',          nome: 'Desenho',          icon: 'bi-rulers',           cor: '#6366f1' },
  { codigo: 'corte',            nome: 'Corte',            icon: 'bi-scissors',         cor: '#ea580c' },
  { codigo: 'montagem',         nome: 'Montagem',         icon: 'bi-bricks',           cor: '#2563eb' },
  { codigo: 'solda',            nome: 'Solda',            icon: 'bi-fire',             cor: '#dc2626' },
  { codigo: 'acabamento',       nome: 'Acabamento',       icon: 'bi-stars',            cor: '#9333ea' },
  { codigo: 'inspecao',         nome: 'Inspeção',         icon: 'bi-search',           cor: '#0d9488' },
  { codigo: 'retrabalho',       nome: 'Retrabalho',       icon: 'bi-arrow-repeat',     cor: '#b45309' },
  { codigo: 'industrializacao', nome: 'Industrialização', icon: 'bi-truck',            cor: '#475569' },
  { codigo: 'pintura',          nome: 'Pintura',          icon: 'bi-palette',          cor: '#db2777' },
];
export const CODIGOS_AREA = AREAS_CALD.map(a => a.codigo);
export const AREA_POR_CODIGO: Record<string, AreaCald> = Object.fromEntries(AREAS_CALD.map(a => [a.codigo, a]));
// Industrialização = serviço de TERCEIRO (fornecedor + retorno previsto).
export const AREA_TERCEIRO = 'industrializacao';

export const UNIDADES_CALD = ['pç', 'kg', 'm', 'conj', 'm²'];
export const PRIORIDADES_CALD = ['urgente', 'alta', 'normal', 'baixa'] as const;

// Ordena uma lista de áreas pela ordem padrão (descarta código desconhecido).
export function ordenarAreas(areas: string[]): string[] {
  const s = new Set(areas);
  return CODIGOS_AREA.filter(c => s.has(c));
}

// ── Tipos trafegados entre API e tela ──────────────────────────────────────
export interface EtapaCald {
  area: string;
  entrada: string | null;          // YYYY-MM-DD — dia em que ENTROU na área
  previsao: string | null;         // YYYY-MM-DD — previsão de SAÍDA da área
  fornecedor: string | null;       // só industrialização
  retorno_previsto: string | null; // só industrialização
}
export type StatusCald = 'novo' | 'aguardando' | 'andamento' | 'finalizado' | 'cancelado';
export interface ItemCald {
  id: number;
  pedido: string;
  vendedor: string | null;
  cliente: string | null;
  material: string;
  quantidade: number | null;
  unidade: string | null;
  valor: number | null;            // R$ (opcional — pro relatório da diretoria/contabilidade)
  areas: string[];
  area_atual: string | null;
  status: StatusCald;
  prioridade: string;
  ordem: number;
  prazo_entrega: string | null;
  prev_faturamento: string | null;
  faturado_em: string | null;
  prev_finalizacao: string | null;
  finalizado_em: string | null;
  parcial: boolean;
  obs: string | null;
  criado_por_nome: string | null;
  criado_em: string;
  atualizado_em: string;
  etapas: EtapaCald[];
  // Última cobrança da caixa de pendências (null = nunca cobrado).
  cobranca?: { quem: string | null; mensagem: string | null; retorno: string | null; criado_por_nome: string | null; criado_em: string } | null;
}

// ── Datas ──────────────────────────────────────────────────────────────────
export function hojeISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
export function diasEntre(deISO: string, ateISO: string): number {
  const a = Date.UTC(+deISO.slice(0, 4), +deISO.slice(5, 7) - 1, +deISO.slice(8, 10));
  const b = Date.UTC(+ateISO.slice(0, 4), +ateISO.slice(5, 7) - 1, +ateISO.slice(8, 10));
  return Math.round((b - a) / 86400000);
}
export function fmtData(iso: string | null | undefined): string {
  if (!iso) return '';
  return `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(2, 4)}`;
}
export function isoValida(v: unknown): string | null {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return null;
  const d = new Date(v + 'T00:00:00Z');
  return isNaN(d.getTime()) ? null : v;
}

// ── Situação derivada (o que a planilha não fazia sozinha) ────────────────
export interface SituacaoCald {
  diasNaArea: number | null;
  atrasado: boolean;          // prev. finalização vencida (sem finalizar)
  venceLogo: boolean;         // prev. finalização em até 3 dias
  areaAtrasada: boolean;      // previsão de saída da área atual vencida
  terceiroVencido: boolean;   // industrialização com retorno previsto vencido
  parado: boolean;            // mais de DIAS_PARADO dias na mesma área
  proxima: string | null;     // próxima área do roteiro previsto
}
export const DIAS_PARADO = 7;

export function situacaoItem(it: ItemCald, hoje = hojeISO()): SituacaoCald {
  const ativo = it.status !== 'finalizado' && it.status !== 'cancelado';
  const et = it.area_atual ? it.etapas.find(e => e.area === it.area_atual) : undefined;
  const diasNaArea = ativo && et?.entrada ? diasEntre(et.entrada, hoje) : null;
  const dPrev = it.prev_finalizacao ? diasEntre(hoje, it.prev_finalizacao) : null;
  const idx = it.area_atual ? it.areas.indexOf(it.area_atual) : -1;
  const proxima = it.status === 'novo' || it.status === 'aguardando'
    ? (it.areas[0] ?? null)
    : (idx >= 0 && idx < it.areas.length - 1 ? it.areas[idx + 1] : null);
  return {
    diasNaArea,
    atrasado: ativo && dPrev !== null && dPrev < 0,
    venceLogo: ativo && dPrev !== null && dPrev >= 0 && dPrev <= 3,
    areaAtrasada: ativo && !!et?.previsao && et.previsao < hoje,
    terceiroVencido: ativo && it.area_atual === AREA_TERCEIRO && !!et?.retorno_previsto && et.retorno_previsto < hoje,
    parado: diasNaArea !== null && diasNaArea > DIAS_PARADO,
    proxima,
  };
}

// ── Importação da planilha atual (Planilha caldeiraria.xlsx) ───────────────
// Colunas: VENDEDOR · PEDIDO · MATERIAL · QUANT. · CLIENTE · <10 áreas> ·
// PREV FATUR. · PREV FINAL. · FINALIZADO · OBS. As células das áreas guardam a
// DATA EM QUE O ITEM ENTROU; às vezes vêm como texto ("31//08/26", "SCA 26/08",
// "14/09/2026\nPARCIAL", "N/A"). Aqui tudo isso vira dado estruturado; o que
// não der pra interpretar vai pra OBS e aparece como aviso na pré-visualização.
export interface LinhaImport {
  linha: number;
  pedido: string;
  vendedor: string | null;
  cliente: string | null;
  material: string;
  quantidade: number | null;
  unidade: string;
  valor: number | null;            // coluna VALOR (opcional na planilha)
  areas: string[];
  etapas: EtapaCald[];
  area_atual: string | null;
  status: StatusCald;
  prev_faturamento: string | null;
  faturado_em: string | null;
  prev_finalizacao: string | null;
  finalizado_em: string | null;
  parcial: boolean;
  obs: string | null;
  avisos: string[];
}

const COLUNA_AREA: Record<string, string> = {
  compras: 'compras', desenho: 'desenho', corte: 'corte', montagem: 'montagem', solda: 'solda',
  acabamento: 'acabamento', inspecao: 'inspecao', retrab: 'retrabalho', retrabalho: 'retrabalho',
  indust: 'industrializacao', industrializacao: 'industrializacao', pintura: 'pintura',
};

function norm(s: unknown): string {
  return String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z0-9 ]/g, '').trim().toLowerCase();
}
function isoDeDate(d: Date): string {
  // Datas do xlsx chegam como meia-noite local; usar os campos locais.
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function tituloNome(s: string): string {
  const t = s.trim().replace(/\s+/g, ' ');
  if (!t) return t;
  // Só normaliza quando veio tudo maiúsculo ou tudo minúsculo (EBER → Eber).
  if (t !== t.toUpperCase() && t !== t.toLowerCase()) return t;
  return t.toLowerCase().replace(/(^|\s)\S/g, c => c.toUpperCase());
}

// Interpreta uma célula de data: Date, número serial do Excel ou texto com
// dd/mm[/aa[aa]] em qualquer lugar (tolerando "//"). Devolve também o texto que
// sobrou ao redor (ex.: "SCA", "PARCIAL", "Faturad").
export function lerCelulaData(v: unknown, anoPadrao: number): { data: string | null; resto: string; na: boolean } {
  if (v instanceof Date && !isNaN(v.getTime())) return { data: isoDeDate(v), resto: '', na: false };
  if (typeof v === 'number' && v > 20000 && v < 80000) {
    const d = new Date(Math.round((v - 25569) * 86400000));
    return { data: d.toISOString().slice(0, 10), resto: '', na: false };
  }
  const s = String(v ?? '').trim();
  if (!s) return { data: null, resto: '', na: false };
  if (/^n\s*\/?\s*a$/i.test(s)) return { data: null, resto: '', na: true };
  const m = s.match(/(\d{1,2})\s*\/+\s*(\d{1,2})(?:\s*\/+\s*(\d{2,4}))?/);
  if (!m) return { data: null, resto: s, na: false };
  const dia = +m[1], mes = +m[2];
  let ano = m[3] ? +m[3] : anoPadrao;
  if (ano < 100) ano += 2000;
  const resto = (s.slice(0, m.index) + ' ' + s.slice((m.index ?? 0) + m[0].length)).replace(/\s+/g, ' ').trim();
  if (dia < 1 || dia > 31 || mes < 1 || mes > 12) return { data: null, resto: s, na: false };
  return { data: `${ano}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`, resto, na: false };
}

function lerQuantidade(v: unknown): { quantidade: number | null; unidade: string; aviso?: string } {
  if (typeof v === 'number') return { quantidade: v, unidade: 'pç' };
  const s = String(v ?? '').trim();
  if (!s) return { quantidade: null, unidade: 'pç' };
  const m = s.match(/^([\d.,]+)\s*([a-zA-Z²]*)$/);
  if (!m) return { quantidade: null, unidade: 'pç', aviso: `Quantidade "${s}" não reconhecida` };
  const un = m[2].toLowerCase();
  const unidade = un.startsWith('kg') ? 'kg' : un === 'm' || un === 'mt' || un === 'mts' ? 'm' : un === 'm2' || un === 'm²' ? 'm²' : un.startsWith('conj') ? 'conj' : 'pç';
  // "7.629" com kg = milhar brasileiro (7629); "2,5" = decimal.
  let num = m[1];
  if (/^\d{1,3}(\.\d{3})+$/.test(num)) num = num.replace(/\./g, '');
  num = num.replace(',', '.');
  const q = Number(num);
  return isNaN(q) ? { quantidade: null, unidade, aviso: `Quantidade "${s}" não reconhecida` } : { quantidade: q, unidade };
}

// rows = sheet_to_json(ws, { header: 1, defval: '', cellDates: true })
export function interpretarPlanilha(rows: unknown[][], anoPadrao = new Date().getFullYear()): { linhas: LinhaImport[]; erro?: string } {
  let hIdx = -1;
  for (let i = 0; i < Math.min(rows.length, 10); i++) {
    const cells = (rows[i] || []).map(norm);
    if (cells.includes('pedido') && cells.some(c => c.startsWith('material'))) { hIdx = i; break; }
  }
  if (hIdx < 0) return { linhas: [], erro: 'Não encontrei o cabeçalho (VENDEDOR / PEDIDO / MATERIAL…). Confira se é a planilha da Caldeiraria.' };
  const header = (rows[hIdx] || []).map(norm);
  const col = (pred: (h: string) => boolean) => header.findIndex(pred);
  const cVend = col(h => h.startsWith('vendedor'));
  const cPed = col(h => h === 'pedido');
  const cMat = col(h => h.startsWith('material'));
  const cQtd = col(h => h.startsWith('quant'));
  const cCli = col(h => h.startsWith('cliente'));
  const cPrevFat = col(h => h.includes('prev') && h.includes('fat'));
  const cPrevFin = col(h => h.includes('prev') && h.includes('final'));
  const cFin = col(h => h === 'finalizado');
  const cObs = col(h => h.startsWith('obs'));
  const cValor = col(h => h.startsWith('valor'));
  const colsArea: { idx: number; area: string }[] = [];
  header.forEach((h, idx) => { const a = COLUNA_AREA[h.replace(/\s/g, '')]; if (a) colsArea.push({ idx, area: a }); });

  const linhas: LinhaImport[] = [];
  for (let r = hIdx + 1; r < rows.length; r++) {
    const row = rows[r] || [];
    const txt = (c: number) => (c >= 0 ? String(row[c] ?? '').trim() : '');
    const pedido = txt(cPed);
    const material = txt(cMat);
    if (!pedido && !material) continue;
    const avisos: string[] = [];
    const obsExtra: string[] = [];
    let parcial = false;

    const qtd = lerQuantidade(cQtd >= 0 ? row[cQtd] : '');
    if (qtd.aviso) { avisos.push(qtd.aviso); obsExtra.push(`Qtd original: ${txt(cQtd)}`); }

    const etapas: EtapaCald[] = [];
    const areasSet = new Set<string>();
    for (const { idx, area } of colsArea) {
      const v = row[idx];
      if (v === '' || v == null) continue;
      const { data, resto, na } = lerCelulaData(v, anoPadrao);
      if (na) continue; // N/A = não passa por essa área
      areasSet.add(area);
      let fornecedor: string | null = null;
      if (resto) {
        if (/parcial/i.test(resto)) { parcial = true; }
        const semParcial = resto.replace(/parcial/ig, '').trim();
        if (semParcial && area === AREA_TERCEIRO) fornecedor = semParcial;
        else if (semParcial && norm(semParcial) !== area && norm(semParcial) !== norm(AREA_POR_CODIGO[area]?.nome)) {
          obsExtra.push(`${AREA_POR_CODIGO[area].nome}: ${String(v).replace(/\s+/g, ' ').trim()}`);
          if (!data) avisos.push(`${AREA_POR_CODIGO[area].nome}: "${String(v).replace(/\s+/g, ' ').trim()}" sem data — foi pra OBS`);
        }
      }
      etapas.push({ area, entrada: data, previsao: null, fornecedor, retorno_previsto: null });
    }

    // Valor (R$) — número do Excel ou texto "R$ 12.345,67".
    let valor: number | null = null;
    if (cValor >= 0 && row[cValor] !== '' && row[cValor] != null) {
      const v = row[cValor];
      if (typeof v === 'number') valor = v;
      else {
        const t = String(v).replace(/[R$\s]/g, '');
        const n = Number(/,\d{1,2}$/.test(t) ? t.replace(/\./g, '').replace(',', '.') : t.replace(/,/g, ''));
        if (Number.isFinite(n)) valor = n; else avisos.push(`Valor "${String(v).trim()}" não reconhecido`);
      }
    }

    const pf = lerCelulaData(cPrevFat >= 0 ? row[cPrevFat] : '', anoPadrao);
    let prev_faturamento: string | null = null, faturado_em: string | null = null;
    if (pf.data && /fatur/i.test(pf.resto)) faturado_em = pf.data; else prev_faturamento = pf.data;
    if (pf.resto && !/fatur/i.test(pf.resto)) { avisos.push(`Prev. faturamento: "${txt(cPrevFat)}"`); obsExtra.push(`Prev. fat.: ${txt(cPrevFat)}`); }
    const pfin = lerCelulaData(cPrevFin >= 0 ? row[cPrevFin] : '', anoPadrao);
    const fin = lerCelulaData(cFin >= 0 ? row[cFin] : '', anoPadrao);
    if (txt(cFin) && !fin.data) { avisos.push(`Finalizado: "${txt(cFin)}" sem data`); obsExtra.push(`Finalizado: ${txt(cFin)}`); }

    const areas = ordenarAreas(Array.from(areasSet));
    // Área atual = a de ENTRADA mais recente (empate → a mais adiante no roteiro).
    let area_atual: string | null = null, maior = '';
    for (const a of areas) {
      const e = etapas.find(x => x.area === a);
      if (e?.entrada && e.entrada >= maior) { maior = e.entrada; area_atual = a; }
    }
    const status: StatusCald = fin.data ? 'finalizado' : area_atual ? 'andamento' : 'novo';
    const obsOrig = txt(cObs);
    const obs = [obsOrig, ...obsExtra].filter(Boolean).join(' · ') || null;
    if (!pedido) avisos.push('Sem número de pedido');

    linhas.push({
      linha: r + 1,
      pedido: pedido || '(sem nº)',
      vendedor: txt(cVend) ? tituloNome(txt(cVend)) : null,
      cliente: txt(cCli) ? tituloNome(txt(cCli)) : null,
      material: material || '(sem material)',
      quantidade: qtd.quantidade,
      unidade: qtd.unidade,
      valor,
      areas, etapas, area_atual, status,
      prev_faturamento, faturado_em,
      prev_finalizacao: pfin.data,
      finalizado_em: fin.data,
      parcial, obs, avisos,
    });
  }
  return { linhas };
}

// ── Caixa de pendências (prazo vencido) ────────────────────────────────────
// Cada motivo vira uma "mensagem" na caixa; o coordenador resolve com nova data,
// cobrando alguém, ou finalizando. Cobrado com retorno ainda no futuro = fica em
// "Cobrados — aguardando" (sai da lista de pendentes até o retorno vencer).
export type MotivoPend = 'prazo_entrega' | 'prev_finalizacao' | 'area' | 'terceiro';
export const MOTIVO_TXT: Record<MotivoPend, string> = {
  prazo_entrega: 'Prazo de entrega vencido',
  prev_finalizacao: 'Previsão de finalização vencida',
  area: 'Previsão de saída da área vencida',
  terceiro: 'Retorno do terceiro vencido',
};
export interface Pendencia { item: ItemCald; motivos: { motivo: MotivoPend; data: string; dias: number }[]; maiorAtraso: number; aguardandoCobranca: boolean }

export function pendenciasItem(it: ItemCald, hoje = hojeISO()): Pendencia | null {
  if (it.status === 'finalizado' || it.status === 'cancelado') return null;
  const m: Pendencia['motivos'] = [];
  const add = (motivo: MotivoPend, data: string | null | undefined) => { if (data && data < hoje) m.push({ motivo, data, dias: diasEntre(data, hoje) }); };
  add('prazo_entrega', it.prazo_entrega);
  add('prev_finalizacao', it.prev_finalizacao);
  const et = it.area_atual ? it.etapas.find(e => e.area === it.area_atual) : undefined;
  if (it.status === 'andamento') {
    add('area', et?.previsao);
    if (it.area_atual === AREA_TERCEIRO) add('terceiro', et?.retorno_previsto);
  }
  if (!m.length) return null;
  const aguardando = !!it.cobranca?.retorno && it.cobranca.retorno >= hoje;
  return { item: it, motivos: m, maiorAtraso: Math.max(...m.map(x => x.dias)), aguardandoCobranca: aguardando };
}

// ── Relatório semanal (diretoria / contabilidade) ──────────────────────────
// Semana = segunda a domingo.
export function somarDias(iso: string, n: number): string {
  const d = new Date(Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10) + n));
  return d.toISOString().slice(0, 10);
}
export function inicioSemana(iso: string): string {
  const d = new Date(Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10)));
  const dow = (d.getUTCDay() + 6) % 7; // 0 = segunda
  return somarDias(iso, -dow);
}
// Dia em que o item CHEGOU na Caldeiraria = a primeira data de entrada em área.
export function dataChegada(it: ItemCald): string | null {
  let min: string | null = null;
  for (const e of it.etapas) if (e.entrada && (!min || e.entrada < min)) min = e.entrada;
  return min;
}
// Estava EM PRODUÇÃO em algum momento da semana [ini, fim]: chegou até o fim da
// semana e não tinha finalizado antes do início dela.
export function emProducaoNaSemana(it: ItemCald, ini: string, fim: string): boolean {
  if (it.status === 'cancelado') return false;
  const ch = dataChegada(it);
  if (!ch || ch > fim) return false;
  if (it.status === 'finalizado' && it.finalizado_em && it.finalizado_em < ini) return false;
  return true;
}
