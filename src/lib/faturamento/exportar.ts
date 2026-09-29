/**
 * Excel + PDF do relatório mensal de faturamento — MESMAS informações nos dois.
 * Excel no layout do modelo CONTROLE GERAL (aba "Faturamento por Produto": título,
 * cabeçalho, linha de SOMA, dados) + "Resumo" com os quadros do PDF + abas de
 * conferência. PDF igual ao da apresentação à diretoria (scripts/faturamento/pdf_modelo.py).
 * Roda no navegador (xlsx e pdf-lib já são dependências).
 */
import * as XLSX from 'xlsx';
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage, type RGB } from 'pdf-lib';
import { brl, pct, titulo, nomeMes, type Relatorio, type Linha, type Soma } from './relatorio';

const FMT = '#,##0.00';
const FMT_RS = '"R$" #,##0.00';
const FMT_PCT = '0.0%';

function aba(rows: Linha[]) {
  const cab = ['Descrição do Produto (completa)', 'Total da Nota Fiscal', 'Pedido', 'Nota Fiscal', 'Familia', 'Local de produção', 'Empresa de fabricação', 'Como foi classificado'];
  const ws = XLSX.utils.aoa_to_sheet([cab, ...rows.map((l) => [l.desc, l.v, l.ped, l.nf, l.fam, l.loc, l.emp, l.como]),
    ['TOTAL', rows.reduce((s, l) => s + l.v, 0)]]);
  for (let r = 1; r <= rows.length + 1; r++) { const c = ws[XLSX.utils.encode_cell({ r, c: 1 })]; if (c) c.z = FMT; }
  ws['!cols'] = [80, 18, 26, 12, 18, 28, 20, 44].map((wch) => ({ wch }));
  ws['!autofilter'] = { ref: `A1:H${rows.length + 1}` };
  return ws;
}

export function gerarExcel(rel: Relatorio): Blob {
  const wb = XLSX.utils.book_new();
  const { resumo: R } = rel;
  const nome = nomeMes(rel.mes);

  // ── Resumo (mesmos quadros do PDF) ─────────────────────────────────────────
  const res: (string | number | null)[][] = [[`Faturamento — ${nome}`], [],
    ['FATURAMENTO TOTAL', R.total], ['FABRICADO (produção própria)', R.fabricado, R.total ? R.fabricado / R.total : 0],
    ['REVENDA', R.revenda, R.total ? R.revenda / R.total : 0]];
  const quadro = (cab: (string | number)[], linhas: (string | number | null)[][]) => { res.push([], cab, ...linhas); };
  quadro(['Empresa de Fabricação', 'Valor (NF)', '% do Total'], [...R.empresa.map(([k, v]) => [titulo(k), v, v / R.total]), ['TOTAL GERAL', R.total, 1]]);
  quadro(['Local de Produção', 'Valor (NF)', '% do Fabricado'], [...R.local.map(([k, v]) => [titulo(k), v, v / R.fabricado]),
    ['TOTAL FABRICADO', R.fabricado, 1], ['Revenda (não fabricado)', R.revenda, null], ['TOTAL GERAL FATURADO', R.total, null]]);
  quadro(['Família', 'Valor (NF)', '% do Total'], [...R.familia.map(([k, v]) => [titulo(k), v, v / R.total]), ['TOTAL', R.total, 1]]);
  res.push([], ['Detalhe — Família dentro de cada Fábrica']);
  for (const [loc, v, fams] of R.familiaPorLocal) quadro([titulo(loc), v, '% da fábrica'], fams.map(([k, x]) => [titulo(k), x, v ? x / v : 0]));
  res.push([], ['“Fabricado” = todos os Locais de Produção exceto Revenda. Valores por Total da Nota Fiscal.']);
  const wsR = XLSX.utils.aoa_to_sheet(res);
  res.forEach((_, r) => {
    const b = wsR[XLSX.utils.encode_cell({ r, c: 1 })]; if (b && typeof b.v === 'number') b.z = FMT_RS;
    const c = wsR[XLSX.utils.encode_cell({ r, c: 2 })]; if (c && typeof c.v === 'number') c.z = FMT_PCT;
  });
  wsR['!cols'] = [{ wch: 44 }, { wch: 20 }, { wch: 14 }];
  XLSX.utils.book_append_sheet(wb, wsR, 'Resumo');

  // ── Faturamento por Produto (layout do modelo CONTROLE GERAL) ──────────────
  const n = rel.linhas.length;
  const wsP = XLSX.utils.aoa_to_sheet([
    [`Faturamento por Produto — ${nome}`],
    ['Descrição do Produto (completa)', 'Total da Nota Fiscal', 'Pedido', 'Nota Fiscal', 'Familia ', 'Local de produção ', 'Empresa de fabricação', 'Como foi classificado'],
    [null, null],
    ...rel.linhas.map((l) => [l.desc, l.v, l.ped, l.nf, l.fam, l.loc, l.emp, l.como]),
  ]);
  wsP['B3'] = { t: 'n', f: `SUM(B4:B${n + 3})`, v: R.total, z: FMT_RS };
  for (let r = 3; r < n + 3; r++) { const c = wsP[XLSX.utils.encode_cell({ r, c: 1 })]; if (c) c.z = FMT; }
  wsP['!cols'] = [80, 18, 26, 12, 18, 28, 20, 44].map((wch) => ({ wch }));
  wsP['!autofilter'] = { ref: `A2:H${n + 3}` };
  XLSX.utils.book_append_sheet(wb, wsP, 'Faturamento por Produto');

  XLSX.utils.book_append_sheet(wb, aba(rel.caldeiraria), 'Caldeiraria (sistema)');
  XLSX.utils.book_append_sheet(wb, aba(rel.duplicados), 'Duplicados (retirados)');
  const wsF = XLSX.utils.aoa_to_sheet([['Tipo de documento', 'Descrição do Produto (completa)', 'Total da Nota Fiscal', 'Pedido', 'Nota Fiscal'],
    ...rel.fora.map((f) => [f.tipo, f.desc, f.v, f.ped, f.nf])]);
  for (let r = 1; r <= rel.fora.length; r++) { const c = wsF[XLSX.utils.encode_cell({ r, c: 2 })]; if (c) c.z = FMT; }
  wsF['!cols'] = [28, 80, 18, 30, 12].map((wch) => ({ wch }));
  XLSX.utils.book_append_sheet(wb, wsF, 'Fora do critério');

  const buf = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  return new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}

// ── PDF ──────────────────────────────────────────────────────────────────────
const hex = (h: string): RGB => rgb(parseInt(h.slice(1, 3), 16) / 255, parseInt(h.slice(3, 5), 16) / 255, parseInt(h.slice(5, 7), 16) / 255);
const AZ = hex('#1A3A5C'), VD = hex('#16794B'), LAR = hex('#C2410C'), CINZA = hex('#64748B'), ZEBRA = hex('#F1F5F9'), BRANCO = rgb(1, 1, 1);
const AZUIS = ['#1A3A5C', '#1D4ED8', '#2563EB', '#3B82F6', '#60A5FA', '#93C5FD', '#BFDBFE', '#DBEAFE'].map(hex);
const W = 595.28, H = 841.89, M = 51, LARG = W - 2 * M;

export async function gerarPdf(rel: Relatorio): Promise<Blob> {
  const doc = await PDFDocument.create();
  const f = await doc.embedFont(StandardFonts.Helvetica);
  const fb = await doc.embedFont(StandardFonts.HelveticaBold);
  const { resumo: R } = rel;
  let pg: PDFPage = doc.addPage([W, H]);
  let y = H - 43;
  const nova = () => { pg = doc.addPage([W, H]); y = H - 43; };
  const garante = (h: number) => { if (y - h < 45) nova(); };
  const txt = (s: string, x: number, yy: number, size: number, font: PDFFont = f, color: RGB = rgb(0, 0, 0)) => pg.drawText(s, { x, y: yy, size, font, color });
  const dir = (s: string, xr: number, yy: number, size: number, font: PDFFont = f, color: RGB = rgb(0, 0, 0)) => txt(s, xr - font.widthOfTextAtSize(s, size), yy, size, font, color);
  const quebra = (s: string, size: number, larg: number, font: PDFFont = f) => {
    const out: string[] = []; let cur = '';
    for (const w of s.split(' ')) { const t = cur ? cur + ' ' + w : w; if (font.widthOfTextAtSize(t, size) > larg && cur) { out.push(cur); cur = w; } else cur = t; }
    if (cur) out.push(cur); return out;
  };
  const paragrafo = (s: string, size: number, color: RGB, font: PDFFont = f) => {
    for (const l of quebra(s, size, LARG, font)) { garante(size + 3); txt(l, M, y, size, font, color); y -= size + 3; }
  };
  const h2 = (s: string) => { garante(60); y -= 14; txt(s, M, y, 14, fb, AZ); y -= 18; };

  type Dest = { i: number; cor: RGB; bg: RGB };
  const tabela = (linhas: string[][], larguras: number[], opt: { escuro?: boolean; dest?: Dest[] } = {}) => {
    const esc = opt.escuro !== false, alt = 19;
    const cab = () => {
      pg.drawRectangle({ x: M, y: y - alt + 5, width: larguras.reduce((a, b) => a + b, 0), height: alt, color: AZ });
      let x = M; linhas[0].forEach((c, j) => { if (j === 0) txt(c, x + 6, y - 8, 9.5, fb, BRANCO); else dir(c, x + larguras[j] - 6, y - 8, 9.5, fb, BRANCO); x += larguras[j]; });
      y -= alt;
    };
    garante(alt * 2); cab();
    linhas.slice(1).forEach((row, k) => {
      const i = k + 1, ultimo = i === linhas.length - 1;
      if (y - alt < 45) { nova(); cab(); }
      const d = opt.dest?.find((x) => x.i === i);
      const bg = ultimo && esc ? AZ : d ? d.bg : k % 2 ? ZEBRA : BRANCO;
      const cor = ultimo && esc ? BRANCO : d ? d.cor : rgb(0, 0, 0);
      const font = (ultimo && esc) || d ? fb : f;
      pg.drawRectangle({ x: M, y: y - alt + 5, width: larguras.reduce((a, b) => a + b, 0), height: alt, color: bg });
      let x = M; row.forEach((c, j) => { if (j === 0) txt(c, x + 6, y - 8, 9.5, font, cor); else dir(c, x + larguras[j] - 6, y - 8, 9.5, font, cor); x += larguras[j]; });
      y -= alt;
    });
    y -= 6;
  };
  const barras = (itens: Soma, cores: RGB[]) => {
    const lista = itens.filter(([, v]) => v > 0), alt = 16, rotulo = 150, mx = Math.max(...lista.map(([, v]) => v), 1);
    const larg = (LARG - rotulo) / 1.3;
    garante(lista.length * (alt + 4) + 10);
    lista.forEach(([k, v], i) => {
      const nome = titulo(k); const cortado = f.widthOfTextAtSize(nome, 8.5) > rotulo - 8 ? quebra(nome, 8.5, rotulo - 8)[0] + '…' : nome;
      dir(cortado, M + rotulo - 6, y - 11, 8.5, f, hex('#334155'));
      const w = (v / mx) * larg;
      pg.drawRectangle({ x: M + rotulo, y: y - alt, width: Math.max(w, 1), height: alt, color: cores[Math.min(i, cores.length - 1)] });
      txt(brl(v), M + rotulo + w + 4, y - 11, 8, fb, AZ);
      y -= alt + 4;
    });
    y -= 8;
  };

  const nome = nomeMes(rel.mes);
  txt('Faturamento — Apresentação à Diretoria', M, y, 22, fb, AZ); y -= 18;
  const fonte = rel.jaClassificada ? 'planilha base' : rel.caldeiraria.length ? 'planilha Omie + Caldeiraria do sistema' : 'planilha Omie';
  paragrafo(`${nome} · ${fonte} · Por Empresa de Fabricação e Local de Produção · valores por Total da Nota Fiscal`, 9.5, CINZA);
  y -= 8;
  const kw = LARG / 3;
  const kpis: [string, string, string, RGB, string][] = [
    ['FATURAMENTO TOTAL', brl(R.total), 'base: Total da Nota Fiscal', AZ, '#EEF4FB'],
    ['FABRICADO (produção própria)', brl(R.fabricado), `${pct(R.total ? R.fabricado / R.total : 0)} do total`, VD, '#EAF6EF'],
    ['REVENDA', brl(R.revenda), `${pct(R.total ? R.revenda / R.total : 0)} do total`, hex('#14532D'), '#FDF1E8'],
  ];
  kpis.forEach(([a, b, c, cor, bg], i) => {
    const x = M + i * kw;
    pg.drawRectangle({ x, y: y - 62, width: kw, height: 62, color: hex(bg), borderColor: hex('#E2E8F0'), borderWidth: 0.5 });
    txt(a, x + 8, y - 16, 8, f, CINZA);
    let s = 15; while (fb.widthOfTextAtSize(b, s) > kw - 14) s -= 0.5;
    txt(b, x + 8, y - 37, s, fb, cor);
    txt(c, x + 8, y - 53, 7, f, CINZA);
  });
  y -= 72;

  h2('Por Empresa de Fabricação');
  barras(R.empresa, [AZ, ...Array(8).fill(hex('#1D4ED8'))]);
  const col = [LARG * 0.53, LARG * 0.29, LARG * 0.18];
  tabela([['Empresa de Fabricação', 'Valor (NF)', '% do Total'], ...R.empresa.map(([k, v]) => [titulo(k), brl(v), pct(v / R.total)]), ['TOTAL GERAL', brl(R.total), '100,0%']], col);

  nova(); h2('Por Local de Produção (fábricas)');
  barras(R.local, AZUIS);
  const rows = [['Local de Produção', 'Valor (NF)', '% do Fabricado'], ...R.local.map(([k, v]) => [titulo(k), brl(v), pct(R.fabricado ? v / R.fabricado : 0)]),
    ['TOTAL FABRICADO', brl(R.fabricado), '100,0%'], ['Revenda (não fabricado)', brl(R.revenda), '—'], ['TOTAL GERAL FATURADO', brl(R.total), '—']];
  tabela(rows, col, { dest: [{ i: rows.length - 3, cor: VD, bg: hex('#EAF6EF') }, { i: rows.length - 2, cor: LAR, bg: hex('#FDF1E8') }] });

  nova(); h2('Por Família (classificação do produto)');
  tabela([['Família', 'Valor (NF)', '% do Total'], ...R.familia.map(([k, v]) => [titulo(k), brl(v), pct(v / R.total)]), ['TOTAL', brl(R.total), '100,0%']], col);

  nova(); h2('Detalhe — Família dentro de cada Fábrica');
  for (const [loc, v, fams] of R.familiaPorLocal) {
    garante(19 * 3 + 20);
    txt(titulo(loc), M, y - 10, 10, fb, AZ); dir(brl(v), M + LARG, y - 10, 10, fb, VD); y -= 18;
    tabela([['Família', 'Valor (NF)'], ...fams.map(([k, x]) => [titulo(k), brl(x)])], [LARG * 0.7, LARG * 0.3], { escuro: false });
  }
  y -= 6;
  const fmt = (n: number | null) => (n == null ? '—' : n.toLocaleString('pt-BR'));
  const vc = rel.caldeiraria.reduce((s, l) => s + l.v, 0), vd = rel.duplicados.reduce((s, l) => s + l.v, 0);
  const nota = rel.jaClassificada
    ? `Fonte: planilha base já classificada (Família / Local de produção / Empresa de fabricação da própria planilha, NFs ${fmt(rel.nfDe)} a ${fmt(rel.nfAte)}).`
    : `Fonte: export Omie de ${nome} (só Pedido de Venda, NFs ${fmt(rel.nfDe)} a ${fmt(rel.nfAte)}), classificado com os mesmos critérios do CONTROLE GERAL, com Flanges.`
      + (rel.caldeiraria.length ? ` Caldeiraria (Planejamento) = sistema PCP Caldeiraria (${brl(vc)}, mês de chegada na Caldeiraria); ${brl(vd)} da planilha de pedidos que já estão no sistema foram retirados para não contar duas vezes.` : '');
  paragrafo(`“Fabricado” = todos os Locais de Produção exceto Revenda. Valores por Total da Nota Fiscal. ${nota}`, 8.5, CINZA);

  const bytes = await doc.save();
  return new Blob([bytes as BlobPart], { type: 'application/pdf' });
}
