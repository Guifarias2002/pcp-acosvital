// ── Leitor de OP do Protheus/Totvs (PCP HRM) ────────────────────────────────
// Extrai MATERIAIS (código/descrição/qtd/unidade) e ROTEIRO (seq/setor/etapa/
// TC/TF) de uma OP em PDF. O Totvs gera o PDF com uma fonte de encoding próprio
// que EMBARALHA o texto — e re-embaralha a cada documento. Por isso a tabela de
// decodificação é AUTO-DERIVADA por documento, a partir de rótulos fixos que
// aparecem "soletrados" (COMPONENTES, ROTEIRO DE OPERAÇÕES) e do cabeçalho da
// tabela de materiais (CÓDIGO/DESCRIÇÃO/QUANTIDADE...). Ver histórico em
// [[project_pcp_hrm_caldeiraria]]. Algumas OPs vêm com fonte normal (legível) —
// nesse caso a tabela sai ~identidade e a leitura é perfeita. As embaralhadas
// saem ~75% (descrições legíveis, algumas letras/dígitos trocados) e a tela
// sinaliza "confira" via o campo `confianca`.
//
// Roda 100% em Node (pdfjs-dist legacy) — sem Python, deploya na Vercel.

export interface OPMaterial { codigo: string; descricao: string; quantidade: string; unidade: string; }
export interface OPOperacao { seq: string; setor: string; descricao: string; tc: string; tf: string; }
export interface OPCabecalho { pn: string; po: string; ns: string; }
export interface OPProduto { codigo: string; descricao: string; }
export interface OPLeitura {
  cabecalho: OPCabecalho;   // quadro vermelho (anotação): PN / PO / NS
  produto: OPProduto;       // Produto: <cod> Descricao: <desc>
  materiais: OPMaterial[];  // COMPONENTES
  roteiro: OPOperacao[];
  confianca: number;
  paginas: number;
}

interface Item { s: string; x: number; }
interface Line { items: Item[]; raw: string; }

const isCtrl = (s: string) => { for (let i = 0; i < s.length; i++) if (s.charCodeAt(i) < 32) return true; return false; };

function addMap(map: Record<string, string>, cipher: string, plain: string) {
  const cc = cipher.replace(/[\s-]/g, '');
  if (cc.length !== plain.length) return;
  for (let i = 0; i < plain.length; i++) {
    const c = cc[i], p = plain[i];
    if (c === ' ' || c === '-' || isCtrl(c)) continue;
    if (!(c in map)) map[c] = p;
  }
}
const spacedTitle = (ln: Line) => ln.items.map(i => i.s).filter(s => s.replace(/[\s-]/g, '').length === 1).map(s => s.replace(/[\s-]/g, '')).join('');

async function extractPages(buf: Buffer): Promise<{ pages: Line[][]; freeText: string[] }> {
  // pdfjs-dist legacy (CommonJS) — import dinâmico pra não bundlar no client
  const pdfjsMod: any = await import('pdfjs-dist/legacy/build/pdf.js');
  const pdfjs = pdfjsMod.getDocument ? pdfjsMod : (pdfjsMod.default || pdfjsMod);
  // Serverless (Vercel): sem isso o pdfjs tenta um "fake worker" via require
  // relativo './pdf.worker.js' que não resolve no bundle. Apontamos o workerSrc
  // pro caminho ABSOLUTO do worker no node_modules (pacote é externo, então o
  // arquivo está no disco em runtime).
  try {
    const mod = await import('module');
    const req = mod.createRequire(process.cwd() + '/package.json');
    pdfjs.GlobalWorkerOptions.workerSrc = req.resolve('pdfjs-dist/legacy/build/pdf.worker.js');
  } catch {
    try {
      const pathMod = await import('path');
      pdfjs.GlobalWorkerOptions.workerSrc = pathMod.join(process.cwd(), 'node_modules/pdfjs-dist/legacy/build/pdf.worker.js');
    } catch { /* deixa o default */ }
  }
  const doc = await pdfjs.getDocument({ data: new Uint8Array(buf), useSystemFonts: true, isEvalSupported: false }).promise;
  const pages: Line[][] = [];
  const freeText: string[] = [];
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
    pages.push(lines);
    // Quadro vermelho (PN/PO/NS) = anotação FreeText — texto legível, fora do
    // content stream. Coleta de todas as páginas (dedup depois).
    try {
      const anns = await page.getAnnotations();
      for (const a of anns as any[]) {
        // o texto costuma vir em contentsObj.str / richText.str (contents às
        // vezes vem vazio, depende das opções do getDocument).
        const txt: string = (a.contentsObj && a.contentsObj.str) || a.contents || (a.richText && a.richText.str) || '';
        if (a.subtype === 'FreeText' && typeof txt === 'string' && /\bPN\b|\bNS\b/.test(txt)) freeText.push(txt);
      }
    } catch { /* sem anotações */ }
  }
  return { pages, freeText };
}

// PN / PO / NS do quadro vermelho (anotação FreeText).
function parseCabecalho(freeText: string[]): OPCabecalho {
  const cab: OPCabecalho = { pn: '', po: '', ns: '' };
  const linhas = Array.from(new Set(freeText)).join('\n').split(/\r\n?|\n/).map(s => s.trim()).filter(Boolean);
  for (const l of linhas) {
    let m;
    if (!cab.pn && (m = l.match(/^PN\s+(.+)/i))) cab.pn = m[1].trim();
    else if (!cab.po && (m = l.match(/^PO\s+(.+)/i))) cab.po = m[1].trim();
    else if (!cab.ns && (m = l.match(/^NS\s+(.+)/i))) cab.ns = m[1].trim();
  }
  return cab;
}

// Produto: <cod> Descricao: <desc> — a linha logo após o marcador "VIA PECA".
function parseProduto(pages: Line[][], map: Record<string, string>): OPProduto {
  const dec = (s: string) => s.split('').map(c => (c in map ? map[c] : c)).join('');
  const norm = (s: string) => dec(s).replace(/[-\s]/g, '').toUpperCase();
  const flat = pages.flat();
  const viaIdx = flat.findIndex(ln => norm(ln.raw).includes('VIAPECA'));
  const cand = viaIdx >= 0 ? flat.slice(viaIdx + 1, viaIdx + 3) : flat.slice(4, 8);
  for (const ln of cand) {
    const d = dec(ln.raw).replace(/-/g, ' ').replace(/\s+/g, ' ').trim();
    // legível: "Produto: 045273 Descricao: <desc>"
    const m = d.match(/Produto:?\s*(\S+)\s+Descric[a-z]*:?\s*(.+)/i);
    if (m) return { codigo: m[1], descricao: m[2].trim() };
  }
  // fallback embaralhado: pega a linha candidata com mais letras (a descrição
  // sai legível mesmo com o rótulo/código embaralhado). Remove os tokens
  // iniciais garbled (Produto:/código/Descricao:/PN) mantendo o texto da desc.
  let melhor = '';
  for (const ln of cand) {
    const d = dec(ln.raw).replace(/-/g, ' ').replace(/\s+/g, ' ').trim();
    if ((d.match(/[A-Za-z]/g) || []).length > (melhor.match(/[A-Za-z]/g) || []).length) melhor = d;
  }
  const toks = melhor.split(' ');
  const descricao = toks.length > 6 ? toks.slice(4).join(' ') : melhor;
  return { codigo: '', descricao };
}

function deriveMap(pages: Line[][]): Record<string, string> {
  const map: Record<string, string> = {};
  const flat = pages.flat();

  let compIdx = -1;
  for (let i = 0; i < flat.length; i++) { const t = spacedTitle(flat[i]); if (t.length === 11) { addMap(map, t, 'COMPONENTES'); compIdx = i; break; } }
  for (const ln of flat) { const t = spacedTitle(ln); if (t.length === 18) { addMap(map, t, 'ROTEIRODEOPERACOES'); break; } }
  const dec = (s: string) => s.split('').map(c => (c in map ? map[c] : c)).join('');

  // cabeçalho da tabela de materiais (linha logo após COMPONENTES) — detecção
  // por posição: o separador de coluna "|" é o glifo de 1 char mais frequente.
  const HDR = ['CODIGO', 'DESCRICAO', 'QUANTIDADE', 'UM', 'AL', 'RASTREAB', 'SEQ'];
  for (let i = compIdx + 1; compIdx >= 0 && i < Math.min(compIdx + 5, flat.length); i++) {
    const ln = flat[i];
    const seps: Record<string, number> = {};
    for (const it of ln.items) { const s = it.s.trim(); if (s.length === 1 && s !== '-' && !isCtrl(s) && !(s in map)) seps[s] = (seps[s] || 0) + 1; }
    const best = Object.entries(seps).sort((a, b) => b[1] - a[1])[0];
    if (best && best[1] >= 4) {
      const sep = best[0]; map[sep] = '|';
      ln.raw.split(sep).map(s => s.replace(/[-\s]/g, '')).forEach((c, idx) => { if (HDR[idx]) addMap(map, c, HDR[idx]); });
      break;
    }
  }

  // cabeçalho do roteiro
  for (const ln of flat) {
    const d = dec(ln.raw).toUpperCase().replace(/-/g, ' ');
    if (/SET.R/.test(d) && /ETAP/.test(d)) { const toks = ln.raw.trim().split(/\s+/).filter(Boolean); ['SEQ', 'SETOR', 'MAQ', 'OPER', 'ETAPA'].forEach((k, i) => { if (toks[i]) addMap(map, toks[i], k); }); break; }
  }

  // dígitos (só se embaralhado): coluna SEQ das operações é sequencial 001,002…
  const keys = Object.keys(map);
  const ident = keys.length ? keys.filter(k => map[k] === k).length / keys.length : 0;
  if (ident < 0.5) {
    const rotStart = flat.findIndex(ln => dec(ln.raw).replace(/[-\s]/g, '').toUpperCase().includes('ROTEIRODEOPERA'));
    const leads: string[] = [];
    for (let i = Math.max(rotStart, 0) + 1; i < flat.length; i++) {
      const m = flat[i].raw.match(/^\s*([^\s|]{3})\s+([^\s|]{5,6})\s+\S/);
      if (m && !isCtrl(m[1])) leads.push(m[1]);
    }
    const dig: Record<string, string> = {};
    leads.forEach((lead, n) => { const v = String((n % 999) + 1).padStart(3, '0'); for (let i = 0; i < 3; i++) { const g = lead[i]; if (g && !(g in map) && !(g in dig)) dig[g] = v[i]; } });
    Object.assign(map, dig);
  }
  return map;
}

function parseBlocos(pages: Line[][], map: Record<string, string>): { materiais: OPMaterial[]; roteiro: OPOperacao[] } {
  const dec = (s: string) => s.split('').map(c => (c in map ? map[c] : c)).join('');
  const clean = (s: string) => s.replace(/\|/g, ' ').replace(/-/g, ' ').replace(/\s+/g, ' ').trim();
  const all: Line[] = [];
  pages.forEach(pg => pg.forEach(ln => all.push(ln)));
  const norm = (s: string) => dec(s).replace(/[-\s]/g, '').toUpperCase();
  const skip = (d: string) => !d || isCtrl(d)
    || /^(FOLHA|HORA|SIGA|GRUPODEEMPRESA|ORDEMDEPRODUCAO|NRO|DTREF)/i.test(d.replace(/[-\s.]/g, ''))
    || /^(INICIO|TERMINO)REAL/i.test(d.replace(/[-\s]/g, '')) || /PROIBIDA|IMPRESSO/i.test(d);

  const compIdx = all.findIndex(ln => norm(ln.raw).includes('COMPONENTES'));
  const rotIdx = all.findIndex(ln => norm(ln.raw).includes('ROTEIRODEOPERA'));

  const materiais: OPMaterial[] = [];
  const end = rotIdx > compIdx ? rotIdx : all.length;
  for (let i = compIdx + 1; i < end && compIdx >= 0; i++) {
    const d = dec(all[i].raw);
    const n = d.replace(/[-\s]/g, '').toUpperCase();
    if (n.includes('CODIGO') && n.includes('DESCRICAO')) continue;
    const cols = d.split('|').map(c => c.replace(/^[-\s]+|[-\s]+$/g, '').replace(/-/g, ' ').trim());
    if (cols.length >= 4 && /\d/.test(cols[0]) && cols[0].length >= 4) {
      materiais.push({ codigo: cols[0].replace(/\s/g, ''), descricao: cols[1] || '', quantidade: (cols[2] || '').replace(/\s/g, ''), unidade: (cols[3] || '').replace(/\s/g, '') });
    } else if (materiais.length && clean(d) && !/^\d/.test(n)) {
      materiais[materiais.length - 1].descricao += ' ' + clean(d);
    }
  }

  const roteiro: OPOperacao[] = [];
  for (let i = rotIdx + 1; i < all.length && rotIdx >= 0; i++) {
    const d = clean(dec(all[i].raw));
    if (skip(d)) continue;
    if (/SETOR/i.test(d) && /ETAPA/i.test(d)) continue;
    const m = d.match(/^(\d{3})\s+(\d{4,6})\s+(.+?)\s*(\d{1,4})\s+(\d{1,4})\s*$/);
    if (m) { roteiro.push({ seq: m[1], setor: m[2], descricao: m[3].trim(), tc: m[4], tf: m[5] }); continue; }
    const m2 = d.match(/^(\d{3})\s+(\d{4,6})\s+(.+)$/);
    if (m2) { roteiro.push({ seq: m2[1], setor: m2[2], descricao: m2[3].trim(), tc: '', tf: '' }); continue; }
    if (roteiro.length && !/^\d{3}\s/.test(d)) roteiro[roteiro.length - 1].descricao += ' ' + d;
  }
  return { materiais, roteiro };
}

export async function lerOP(buf: Buffer): Promise<OPLeitura> {
  const { pages, freeText } = await extractPages(buf);
  const map = deriveMap(pages);
  const cabecalho = parseCabecalho(freeText);
  const produto = parseProduto(pages, map);
  const { materiais, roteiro } = parseBlocos(pages, map);
  const keys = Object.keys(map);
  const confianca = keys.length ? keys.filter(k => map[k] === k).length / keys.length : 0;
  return { cabecalho, produto, materiais, roteiro, confianca, paginas: pages.length };
}
