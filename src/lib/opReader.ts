// ── Leitor de OP do Protheus/Totvs (PCP HRM) ────────────────────────────────
// Extrai, de uma OP em PDF, uma ou mais ORDENS (cada uma com quadro vermelho
// PN/PO/NS próprio), e por ordem: Produto/Descrição, COMPONENTES e ROTEIRO
// (por onde passa). O Totvs gera o PDF com fonte de encoding próprio que
// EMBARALHA o texto e re-embaralha por documento — a tabela de decodificação é
// AUTO-DERIVADA por ordem (títulos soletrados + cabeçalho da tabela + dígitos
// pela coluna SEQ). Algumas OPs vêm legíveis (leitura perfeita), outras
// embaralhadas (~75%, `confianca<0.5` sinaliza conferir). Ver
// [[project_pcp_hrm_caldeiraria]]. Roda em Node (pdfjs-dist legacy) — deploya na
// Vercel. O quadro vermelho é uma ANOTAÇÃO FreeText (texto em contentsObj.str).

export interface OPMaterial { codigo: string; descricao: string; quantidade: string; unidade: string; }
export interface OPOperacao { seq: string; setor: string; setorNome: string; etapa: string; tc: string; tf: string; }
export interface OPCabecalho { pn: string; po: string; ns: string; }
export interface OPProduto { codigo: string; descricao: string; }
export interface OPItem {
  cabecalho: OPCabecalho;   // quadro vermelho: PN / PO / NS
  produto: OPProduto;       // Produto: <cod> Descricao: <desc>
  materiais: OPMaterial[];  // COMPONENTES
  roteiro: OPOperacao[];    // por onde passa
  confianca: number;
  paginas: number;
}
export interface OPLeitura { ops: OPItem[]; totalPaginas: number; }

interface Item { s: string; x: number; }
interface Line { items: Item[]; raw: string; }
interface Pagina { lines: Line[]; redbox: string | null; }

const isCtrl = (s: string) => { for (let i = 0; i < s.length; i++) if (s.charCodeAt(i) < 32) return true; return false; };

function addMap(map: Record<string, string>, cipher: string, plain: string) {
  const cc = cipher.replace(/[\s-]/g, '');
  if (cc.length !== plain.length) return;
  for (let i = 0; i < plain.length; i++) { const c = cc[i], p = plain[i]; if (c === ' ' || c === '-' || isCtrl(c)) continue; if (!(c in map)) map[c] = p; }
}
const spacedTitle = (ln: Line) => ln.items.map(i => i.s).filter(s => s.replace(/[\s-]/g, '').length === 1).map(s => s.replace(/[\s-]/g, '')).join('');

async function extractDoc(buf: Buffer): Promise<Pagina[]> {
  const pdfjsMod: any = await import('pdfjs-dist/legacy/build/pdf.js');
  const pdfjs = pdfjsMod.getDocument ? pdfjsMod : (pdfjsMod.default || pdfjsMod);
  // Serverless (Vercel): aponta o workerSrc pro caminho absoluto (senão o fake
  // worker tenta um require relativo './pdf.worker.js' que não resolve).
  try {
    const mod = await import('module');
    const req = mod.createRequire(process.cwd() + '/package.json');
    pdfjs.GlobalWorkerOptions.workerSrc = req.resolve('pdfjs-dist/legacy/build/pdf.worker.js');
  } catch {
    try { const pathMod = await import('path'); pdfjs.GlobalWorkerOptions.workerSrc = pathMod.join(process.cwd(), 'node_modules/pdfjs-dist/legacy/build/pdf.worker.js'); } catch { /* default */ }
  }
  const doc = await pdfjs.getDocument({ data: new Uint8Array(buf), useSystemFonts: true, isEvalSupported: false }).promise;
  const paginas: Pagina[] = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const tc = await page.getTextContent();
    const byY: Record<number, Item[]> = {};
    for (const it of tc.items as any[]) {
      if (typeof it.str !== 'string') continue;
      const y = Math.round(it.transform[5]);
      (byY[y] = byY[y] || []).push({ s: it.str, x: it.transform[4] });
    }
    const lines = Object.keys(byY).map(Number).sort((a, b) => b - a).map(y => {
      const items = byY[y].sort((a, b) => a.x - b.x);
      return { items, raw: items.map(i => i.s).join('') };
    });
    // Quadro vermelho (PN/PO/NS): anotação FreeText — texto em contentsObj.str.
    let redbox: string | null = null;
    try {
      const anns = await page.getAnnotations();
      for (const a of anns as any[]) {
        const txt: string = (a.contentsObj && a.contentsObj.str) || a.contents || (a.richText && a.richText.str) || '';
        if (a.subtype === 'FreeText' && typeof txt === 'string' && /\bPN\b|\bNS\b/.test(txt)) { redbox = txt; break; }
      }
    } catch { /* sem anotações */ }
    paginas.push({ lines, redbox });
  }
  return paginas;
}

// Agrupa páginas em SEÇÕES: cada página que traz um quadro vermelho INICIA uma
// nova seção (é a "nova marcação em vermelho"). Páginas seguintes sem quadro
// pertencem à seção corrente. Um mesmo PDF pode ter várias seções (cada uma com
// seu Produto/COMPONENTES/ROTEIRO), mesmo que o PN/NS do quadro se repita.
function agruparOrdens(paginas: Pagina[]): { redbox: string | null; lines: Line[] }[] {
  const grupos: { redbox: string | null; lines: Line[] }[] = [];
  let cur: { redbox: string | null; lines: Line[] } | null = null;
  for (const pg of paginas) {
    if (pg.redbox) { cur = { redbox: pg.redbox, lines: [] }; grupos.push(cur); }
    if (!cur) { cur = { redbox: null, lines: [] }; grupos.push(cur); }
    cur.lines.push(...pg.lines);
  }
  return grupos;
}

function parseCabecalho(redbox: string | null): OPCabecalho {
  const cab: OPCabecalho = { pn: '', po: '', ns: '' };
  if (!redbox) return cab;
  for (const l of redbox.split(/\r\n?|\n/).map(s => s.trim()).filter(Boolean)) {
    let m;
    if (!cab.pn && (m = l.match(/^PN\s+(.+)/i))) cab.pn = m[1].trim();
    else if (!cab.po && (m = l.match(/^PO\s+(.+)/i))) cab.po = m[1].trim();
    else if (!cab.ns && (m = l.match(/^NS\s+(.+)/i))) cab.ns = m[1].trim();
  }
  return cab;
}

function deriveMap(lines: Line[]): Record<string, string> {
  const map: Record<string, string> = {};
  let compIdx = -1;
  for (let i = 0; i < lines.length; i++) { const t = spacedTitle(lines[i]); if (t.length === 11) { addMap(map, t, 'COMPONENTES'); compIdx = i; break; } }
  for (const ln of lines) { const t = spacedTitle(ln); if (t.length === 18) { addMap(map, t, 'ROTEIRODEOPERACOES'); break; } }
  const dec = (s: string) => s.split('').map(c => (c in map ? map[c] : c)).join('');

  const HDR = ['CODIGO', 'DESCRICAO', 'QUANTIDADE', 'UM', 'AL', 'RASTREAB', 'SEQ'];
  for (let i = compIdx + 1; compIdx >= 0 && i < Math.min(compIdx + 5, lines.length); i++) {
    const ln = lines[i];
    const seps: Record<string, number> = {};
    for (const it of ln.items) { const s = it.s.trim(); if (s.length === 1 && s !== '-' && !isCtrl(s) && !(s in map)) seps[s] = (seps[s] || 0) + 1; }
    const best = Object.entries(seps).sort((a, b) => b[1] - a[1])[0];
    if (best && best[1] >= 4) { const sep = best[0]; map[sep] = '|'; ln.raw.split(sep).map(s => s.replace(/[-\s]/g, '')).forEach((c, idx) => { if (HDR[idx]) addMap(map, c, HDR[idx]); }); break; }
  }
  for (const ln of lines) { const d = dec(ln.raw).toUpperCase().replace(/-/g, ' '); if (/SET.R/.test(d) && /ETAP/.test(d)) { const toks = ln.raw.trim().split(/\s+/).filter(Boolean); ['SEQ', 'SETOR', 'MAQ', 'OPER', 'ETAPA'].forEach((k, i) => { if (toks[i]) addMap(map, toks[i], k); }); break; } }

  const keys = Object.keys(map);
  const ident = keys.length ? keys.filter(k => map[k] === k).length / keys.length : 0;
  if (ident < 0.5) {
    const rotStart = lines.findIndex(ln => dec(ln.raw).replace(/[-\s]/g, '').toUpperCase().includes('ROTEIRODEOPERA'));
    const leads: string[] = [];
    for (let i = Math.max(rotStart, 0) + 1; i < lines.length; i++) { const m = lines[i].raw.match(/^\s*([^\s|]{3})\s+([^\s|]{5,6})\s+\S/); if (m && !isCtrl(m[1])) leads.push(m[1]); }
    const dig: Record<string, string> = {};
    leads.forEach((lead, n) => { const v = String((n % 999) + 1).padStart(3, '0'); for (let i = 0; i < 3; i++) { const g = lead[i]; if (g && !(g in map) && !(g in dig)) dig[g] = v[i]; } });
    Object.assign(map, dig);
  }
  return map;
}

function parseProduto(lines: Line[], map: Record<string, string>): OPProduto {
  const dec = (s: string) => s.split('').map(c => (c in map ? map[c] : c)).join('');
  const norm = (s: string) => dec(s).replace(/[-\s]/g, '').toUpperCase();
  const viaIdx = lines.findIndex(ln => norm(ln.raw).includes('VIAPECA'));
  const cand = viaIdx >= 0 ? lines.slice(viaIdx + 1, viaIdx + 3) : lines.slice(4, 8);
  for (const ln of cand) {
    const d = dec(ln.raw).replace(/-/g, ' ').replace(/\s+/g, ' ').trim();
    const m = d.match(/Produto:?\s*(\S+)\s+Descric[a-z]*:?\s*(.+)/i);
    if (m) return { codigo: m[1], descricao: m[2].trim() };
  }
  let melhor = '';
  for (const ln of cand) { const d = dec(ln.raw).replace(/-/g, ' ').replace(/\s+/g, ' ').trim(); if ((d.match(/[A-Za-z]/g) || []).length > (melhor.match(/[A-Za-z]/g) || []).length) melhor = d; }
  const toks = melhor.split(' ');
  return { codigo: '', descricao: toks.length > 6 ? toks.slice(4).join(' ') : melhor };
}

function parseBlocos(lines: Line[], map: Record<string, string>): { materiais: OPMaterial[]; roteiro: OPOperacao[] } {
  const dec = (s: string) => s.split('').map(c => (c in map ? map[c] : c)).join('');
  const clean = (s: string) => s.replace(/\|/g, ' ').replace(/-/g, ' ').replace(/\s+/g, ' ').trim();
  const norm = (s: string) => dec(s).replace(/[-\s]/g, '').toUpperCase();
  const skip = (d: string) => !d || isCtrl(d)
    || /^(FOLHA|HORA|SIGA|GRUPODEEMPRESA|ORDEMDEPRODUCAO|NRO|DTREF|VIAPECA)/i.test(d.replace(/[-\s.]/g, ''))
    || /^(INICIO|TERMINO)REAL/i.test(d.replace(/[-\s]/g, '')) || /PROIBIDA|IMPRESSO/i.test(d);

  const compIdx = lines.findIndex(ln => norm(ln.raw).includes('COMPONENTES'));
  const rotIdx = lines.findIndex(ln => norm(ln.raw).includes('ROTEIRODEOPERA'));

  // MATERIAIS (COMPONENTES)
  const materiais: OPMaterial[] = [];
  const end = rotIdx > compIdx ? rotIdx : lines.length;
  for (let i = compIdx + 1; i < end && compIdx >= 0; i++) {
    const d = dec(lines[i].raw);
    const n = d.replace(/[-\s]/g, '').toUpperCase();
    if (n.includes('CODIGO') && n.includes('DESCRICAO')) continue;
    const cols = d.split('|').map(c => c.replace(/^[-\s]+|[-\s]+$/g, '').replace(/-/g, ' ').trim());
    if (cols.length >= 4 && /\d/.test(cols[0]) && cols[0].length >= 4) {
      materiais.push({ codigo: cols[0].replace(/\s/g, ''), descricao: cols[1] || '', quantidade: (cols[2] || '').replace(/\s/g, ''), unidade: (cols[3] || '').replace(/\s/g, '') });
    } else if (materiais.length && clean(d) && !/^\d/.test(n)) {
      materiais[materiais.length - 1].descricao += ' ' + clean(d);
    }
  }

  // ROTEIRO — colunas por POSIÇÃO X (do cabeçalho SEQ/SETOR/MAQ/ETAPA/TP/TF).
  const colX: Record<string, number> = {};
  for (const ln of lines) {
    const d = dec(ln.raw).toUpperCase();
    if (/SET.R/.test(d) && /ETAP/.test(d)) {
      for (const it of ln.items) {
        const t = dec(it.s).toUpperCase().replace(/[^A-Z]/g, '');
        if (!t) continue;
        if (colX.seq == null && t.startsWith('SEQ')) colX.seq = it.x;
        else if (colX.setor == null && t.startsWith('SET')) colX.setor = it.x;
        else if (colX.maq == null && (t.startsWith('MAQ') || t.startsWith('OPER'))) colX.maq = it.x;
        else if (colX.etapa == null && t.startsWith('ETAP')) colX.etapa = it.x;
        else if (colX.tp == null && (t === 'TP' || t === 'TC')) colX.tp = it.x;
        else if (colX.tf == null && t === 'TF') colX.tf = it.x;
      }
      break;
    }
  }
  const temCol = colX.setor != null && colX.maq != null && colX.etapa != null;

  // Fronteiras de coluna: PONTO MÉDIO entre cabeçalhos (robusto ao fato de o
  // dado poder ficar alguns pixels à esquerda do cabeçalho — visto com "00009"
  // caindo no bucket do SEQ). TP/TF usam a posição do cabeçalho direto porque o
  // VALOR fica à direita do rótulo.
  const bSetor = colX.seq != null ? (colX.seq + colX.setor) / 2 : colX.setor - 12;
  const bMaq = (colX.setor + colX.maq) / 2;
  const bEtapa = (colX.maq + colX.etapa) / 2;
  const bTp = colX.tp != null ? colX.tp : Infinity;
  const bTf = colX.tf != null ? colX.tf : Infinity;

  function bucket(ln: Line): OPOperacao {
    const o: OPOperacao = { seq: '', setor: '', setorNome: '', etapa: '', tc: '', tf: '' };
    for (const it of ln.items) {
      const t = dec(it.s); const x = it.x;
      if (x < bSetor) o.seq += t;
      else if (x < bMaq) o.setor += t;
      else if (x < bEtapa) o.setorNome += t;
      else if (x < bTp) o.etapa += t;
      else if (x < bTf) o.tc += t;
      else o.tf += t;
    }
    o.seq = o.seq.replace(/[-\s]/g, '');
    o.setor = o.setor.replace(/[-\s]/g, '');
    o.setorNome = clean(o.setorNome);
    o.etapa = clean(o.etapa);
    o.tc = o.tc.replace(/[^\d]/g, '');
    o.tf = o.tf.replace(/[^\d]/g, '');
    return o;
  }

  const roteiro: OPOperacao[] = [];
  for (let i = rotIdx + 1; i < lines.length && rotIdx >= 0; i++) {
    const ln = lines[i];
    const d = clean(dec(ln.raw));
    if (skip(d)) continue;
    if (/SETOR/i.test(d) && /ETAPA/i.test(d)) continue;
    if (temCol) {
      const o = bucket(ln);
      if (/^\d{3}$/.test(o.seq)) roteiro.push(o);
      else if (roteiro.length) { const last = roteiro[roteiro.length - 1]; if (o.setorNome) last.setorNome += ' ' + o.setorNome; if (o.etapa) last.etapa += ' ' + o.etapa; }
    } else {
      const m = d.match(/^(\d{3})\s+(\d{4,6})\s+(.+?)\s*(\d{1,4})\s+(\d{1,4})\s*$/) || d.match(/^(\d{3})\s+(\d{4,6})\s+(.+)$/);
      if (m) roteiro.push({ seq: m[1], setor: m[2], setorNome: '', etapa: m[3].trim(), tc: m[4] || '', tf: m[5] || '' });
      else if (roteiro.length && !/^\d{3}\s/.test(d)) roteiro[roteiro.length - 1].etapa += ' ' + d;
    }
  }
  return { materiais, roteiro };
}

export async function lerOP(buf: Buffer): Promise<OPLeitura> {
  const paginas = await extractDoc(buf);
  // O embaralhamento da fonte é o MESMO em todo o documento — deriva o mapa UMA
  // vez de todas as linhas (pega os títulos-âncora onde quer que estejam) e usa
  // em todas as seções. Sem isso, seções sem os títulos (ex.: continuação do
  // roteiro numa OP embaralhada) ficariam sem mapa.
  const todasLinhas = paginas.flatMap(p => p.lines);
  const map = deriveMap(todasLinhas);
  const keys = Object.keys(map);
  const confianca = keys.length ? keys.filter(k => map[k] === k).length / keys.length : 0;

  const grupos = agruparOrdens(paginas);
  const ops: OPItem[] = grupos.map(g => {
    const cabecalho = parseCabecalho(g.redbox);
    const produto = parseProduto(g.lines, map);
    const { materiais, roteiro } = parseBlocos(g.lines, map);
    return { cabecalho, produto, materiais, roteiro, confianca, paginas: 0 };
  }).filter(op => op.materiais.length || op.roteiro.length || op.cabecalho.pn);
  return { ops, totalPaginas: paginas.length };
}
