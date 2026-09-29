/**
 * Monta o relatório mensal de faturamento a partir do export Omie + Caldeiraria do
 * sistema — porte de scripts/faturamento/setembro_sem_flanges.py, agora COM Flanges:
 *   • só "Pedido de Venda" entra (Remessa/Devolução/etc → "Fora do critério");
 *   • cada linha classificada (Família / Local / Empresa) — ver classificar.ts;
 *   • Caldeiraria (Planejamento) = itens do PCP Caldeiraria do mês (chegada na
 *     Caldeiraria, sem cancelados); pedido com valor no sistema que também está na
 *     planilha → fica o do sistema (linhas da planilha vão p/ "Duplicados").
 * Puro (sem DOM/DB) — usado pelo upload de Faturamento da Análise PCP.
 */
import { classificar, tipoDoc, numPedido } from './classificar';

export interface LinhaOmie { desc: string; total_nf: number; pedido: string; nf: string }
export interface ItemCald {
  pedido: string; cliente: string | null; material: string; valor: number | null; empresa: string | null;
  status: string; finalizado_em: string | null;
}
export interface Linha { desc: string; v: number; ped: string; nf: string; fam: string; loc: string; emp: string; como: string }
export interface Fora { tipo: string; desc: string; v: number; ped: string; nf: string }
export type Soma = [nome: string, valor: number][];
export interface Resumo {
  total: number; fabricado: number; revenda: number;
  empresa: Soma; local: Soma; familia: Soma; familiaPorLocal: [local: string, valor: number, familias: Soma][];
}
export interface Relatorio {
  mes: string; linhas: Linha[]; caldeiraria: Linha[]; duplicados: Linha[]; fora: Fora[]; resumo: Resumo;
  nfDe: number | null; nfAte: number | null; semRegra: number;
  /** true = veio de planilha já classificada (Família/Local/Empresa preenchidos) */
  jaClassificada?: boolean;
}

const EMP: Record<string, string> = { acosvital: 'AÇOS VITAL', hrm: 'HRM' };

/** Lê as linhas do export Omie (matriz do SheetJS). Acha o cabeçalho pelos nomes. */
export function lerOmie(matriz: unknown[][]): LinhaOmie[] {
  const norm = (x: unknown) => String(x ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
  const hi = matriz.findIndex((r) => r.some((c) => norm(c).startsWith('descricao do produto')));
  if (hi < 0) throw new Error('Não achei a coluna "Descrição do Produto" — confira se é o export "Faturamento por Produto" do Omie.');
  const cab = matriz[hi].map(norm);
  const col = (nome: string) => cab.findIndex((c) => c.startsWith(nome));
  const cD = col('descricao do produto'), cT = col('total da nota fiscal'), cP = col('pedido'), cN = col('nota fiscal');
  if ([cT, cP, cN].some((c) => c < 0)) throw new Error('Faltam colunas no Excel: preciso de "Total da Nota Fiscal", "Pedido" e "Nota Fiscal".');
  return matriz.slice(hi + 1)
    .filter((r) => r[cD] != null && String(r[cD]).trim() !== '')
    .map((r) => ({ desc: String(r[cD]), total_nf: Number(r[cT]) || 0, pedido: String(r[cP] ?? ''), nf: String(r[cN] ?? '').trim() }));
}

function somar(rows: Linha[], chave: (l: Linha) => string): Soma {
  const m = new Map<string, number>();
  for (const l of rows) m.set(chave(l), (m.get(chave(l)) || 0) + l.v);
  return Array.from(m.entries()).sort((a, b) => b[1] - a[1]);
}

export function resumir(rows: Linha[]): Resumo {
  const total = rows.reduce((s, l) => s + l.v, 0);
  const local = somar(rows, (l) => l.loc);
  const revenda = local.find(([k]) => k === 'REVENDA')?.[1] || 0;
  const locFab = local.filter(([k]) => k !== 'REVENDA');
  return {
    total, revenda, fabricado: total - revenda,
    empresa: somar(rows, (l) => l.emp), local: locFab, familia: somar(rows, (l) => l.fam),
    familiaPorLocal: locFab.map(([k, v]) => [k, v, somar(rows.filter((l) => l.loc === k), (l) => l.fam)]),
  };
}

/**
 * Planilha JÁ classificada (ex.: CONTROLE GERAL de agosto, com Familia / Local de
 * produção / Empresa de fabricação preenchidos à mão) → relatório direto dela, sem
 * reclassificar e sem somar a Caldeiraria do sistema. null = planilha bruta.
 */
export function lerClassificada(matriz: unknown[][], mes: string): Relatorio | null {
  const norm = (x: unknown) => String(x ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
  const hi = matriz.findIndex((r) => r.some((c) => norm(c).startsWith('descricao do produto')));
  if (hi < 0) return null;
  const cab = matriz[hi].map(norm);
  const col = (nome: string) => cab.findIndex((c) => c.startsWith(nome));
  const cD = col('descricao do produto'), cT = col('total da nota fiscal'), cP = col('pedido'), cN = col('nota fiscal');
  const cF = col('famil'), cL = col('local'), cE = col('empresa');
  if (cL < 0 || cE < 0 || cT < 0) return null;
  const txt = (x: unknown) => String(x ?? '').trim();
  const linhas: Linha[] = matriz.slice(hi + 1)
    .filter((r) => txt(r[cD]) !== '')
    .map((r) => ({ desc: txt(r[cD]), v: Number(r[cT]) || 0, ped: txt(r[cP]), nf: txt(r[cN]),
      fam: txt(r[cF]) || '(SEM FAMÍLIA)', loc: txt(r[cL]) || '(SEM LOCAL)', emp: txt(r[cE]) || '(SEM EMPRESA)', como: 'da planilha base (já classificada)' }))
    .sort((a, b) => a.desc.localeCompare(b.desc));
  if (!linhas.some((l) => txt(l.loc) !== '(SEM LOCAL)')) return null;
  const nfs = linhas.map((l) => l.nf).filter((n) => /^\d+$/.test(n)).map(Number).sort((a, b) => a - b);
  return { mes, linhas, caldeiraria: [], duplicados: [], fora: [], resumo: resumir(linhas),
    nfDe: nfs[0] ?? null, nfAte: nfs[nfs.length - 1] ?? null, semRegra: 0, jaClassificada: true };
}

export function montarRelatorio(omie: LinhaOmie[], cald: ItemCald[], mes: string): Relatorio {
  const pv = omie.filter((r) => tipoDoc(r.pedido) === 'Pedido de Venda');
  const fora: Fora[] = omie.filter((r) => tipoDoc(r.pedido) !== 'Pedido de Venda')
    .map((r) => ({ tipo: tipoDoc(r.pedido) || '(sem pedido)', desc: r.desc, v: r.total_nf, ped: r.pedido, nf: r.nf }))
    .sort((a, b) => a.tipo.localeCompare(b.tipo) || a.desc.localeCompare(b.desc));
  const todas: Linha[] = pv.map((r) => {
    const { classe: [f, l, e], como } = classificar(r.desc);
    return { desc: r.desc, v: r.total_nf, ped: r.pedido, nf: r.nf, fam: f || '(SEM FAMÍLIA)', loc: l, emp: e, como };
  });
  const caldeiraria: Linha[] = cald.map((c) => ({
    desc: `PV ${c.pedido} - ${c.cliente || ''} - ${c.material}`, v: Number(c.valor) || 0, ped: `Pedido de Venda nº ${c.pedido}`, nf: '',
    fam: 'CALDEIRARIA', loc: 'CALDEIRARIA (PLANEJAMENTO)', emp: EMP[c.empresa || ''] || 'AÇOS VITAL',
    como: `sistema — ${c.status}` + (c.finalizado_em ? `, finalizado ${c.finalizado_em.slice(0, 10)}` : ''),
  }));
  const comValor = new Set(cald.filter((c) => (Number(c.valor) || 0) > 0).map((c) => numPedido(c.pedido)));
  const duplicados = todas.filter((l) => comValor.has(numPedido(l.ped)));
  const linhas = todas.filter((l) => !comValor.has(numPedido(l.ped))).concat(caldeiraria)
    .sort((a, b) => a.desc.localeCompare(b.desc));
  const nfs = todas.map((l) => l.nf).filter((n) => /^\d+$/.test(n)).map(Number).sort((a, b) => a - b);
  return {
    mes, linhas, caldeiraria, duplicados, fora, resumo: resumir(linhas),
    nfDe: nfs[0] ?? null, nfAte: nfs[nfs.length - 1] ?? null,
    semRegra: linhas.filter((l) => l.como.includes('CONFERIR') || l.como.includes('conferir')).length,
  };
}

export const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
export const nomeMes = (mes: string) => `${MESES[Number(mes.slice(5, 7)) - 1]} ${mes.slice(0, 4)}`;
export const brl = (v: number) => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }).replace(/ /g, ' ');
export const pct = (v: number) => `${(v * 100).toFixed(1).replace('.', ',')}%`;
/** "FABRICA FLANGES" → "Fabrica Flanges" (igual ao .title() do Python) */
export const titulo = (s: string) => s.toLowerCase().replace(/(^|[^a-zà-ÿ])([a-zà-ÿ])/g, (_, a, b) => a + b.toUpperCase());
