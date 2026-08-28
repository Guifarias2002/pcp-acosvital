// ── Leitor de OP do Protheus/Totvs (PCP HRM) ────────────────────────────────
// Extrai, de uma OP em PDF, uma ou mais ORDENS (cada uma com quadro vermelho
// PN/PO/NS próprio), e por ordem: Produto/Descrição, COMPONENTES e ROTEIRO
// (por onde passa).
//
// O Totvs gera o PDF com uma FONTE de encoding próprio que EMBARALHA o texto e
// re-embaralha a cada documento — não existe tabela fixa de substituição. A
// tabela de decodificação é AUTO-DERIVADA a partir das próprias âncoras do
// documento (títulos soletrados "C O M P O N E N T E S" / "R O T E I R O", o
// cabeçalho da tabela e os dígitos da coluna SEQ).
//
// ⚠️ IMPORTANTE (corrigido 24/08): algumas OPs usam UMA FONTE EMBUTIDA DIFERENTE
// POR PÁGINA (ex.: OP-013466 tem g_d0_f1…g_d0_f13, uma cifra por página). Um
// mapa único global misturava as cifras de páginas diferentes e corrompia tudo
// (confiança caía a 0 → "não consegui ler"). Agora a cifra é derivada e aplicada
// POR FONTE (`fontName` de cada trecho), então cada página decodifica com a sua
// própria cifra. OPs que usam a mesma fonte no documento inteiro (ex.: OP-013169)
// seguem idênticas ao comportamento anterior. Ver [[project_pcp_hrm_caldeiraria]].
//
// Roda em Node (pdfjs-dist legacy) — deploya na Vercel. O quadro vermelho é uma
// ANOTAÇÃO FreeText (texto legível em contentsObj.str, NÃO embaralhado).

export interface OPMaterial {
  codigo: string; descricao: string; quantidade: string; unidade: string;
  // Colunas extras da tabela de COMPONENTES do Totvs (preservadas mesmo sem uso
  // atual no fluxo). `null`/'' quando a coluna não existe naquela OP.
  al?: string | null;              // coluna AL (alternativo)
  rastreabilidade?: string | null; // coluna RASTREAB
  // Campos best-effort extraídos da própria descrição (matéria-prima, dimensão,
  // norma…). Só preenchidos quando reconhecidos com segurança — senão `null`
  // (regra: NÃO inventar). A descrição original fica sempre intacta em `descricao`.
  materiaPrima?: string | null;
  dimensao?: string | null;
  espessura?: string | null;
  norma?: string | null;
  raw?: string;                    // linha decodificada verbatim (auditoria)
}
export interface OPOperacao {
  seq: string; setor: string; setorNome: string; etapa: string; tc: string; tf: string;
  raw?: string;                    // linha decodificada verbatim (auditoria)
}
export interface OPCabecalho { pn: string; po: string; ns: string; }
export interface OPProduto { codigo: string; descricao: string; }
// Campos de identificação do cabeçalho da OP (rótulos Cliente/Nome/Quantidade/
// Emissao/Entrega/Situacao). Extraídos best-effort: em OP legível saem certos;
// em OP muito embaralhada, os que não casaram o rótulo ficam ''. NÃO inventa.
export interface OPIdentificacao {
  clienteNome: string; clienteCodigo: string;
  quantidade: string; unidade: string;
  emissao: string; entrega: string;      // ISO (yyyy-mm-dd) quando reconhecível, senão ''
  situacao: string;
}
export interface OPValidacao {
  temProduto: boolean;
  temComponentes: boolean;
  temRoteiro: boolean;
  componentesSemCodigo: number;    // materiais sem código numérico coerente
  avisos: string[];                // o que NÃO foi identificado/classificado (instrução 7)
}
export interface OPItem {
  cabecalho: OPCabecalho;   // quadro vermelho: PN / PO / NS
  produto: OPProduto;       // Produto: <cod> Descricao: <desc>
  identificacao: OPIdentificacao; // Cliente/Quantidade/Emissao/Entrega/Situacao
  materiais: OPMaterial[];  // COMPONENTES
  roteiro: OPOperacao[];    // por onde passa
  confianca: number;        // legibilidade nativa do PDF (0=embaralhado, 1=legível)
  qualidade: number;        // plausibilidade PÓS-decodificação (0..1) — gate da UI
  validacao: OPValidacao;
  paginas: number;
}
export interface OPLeitura { ops: OPItem[]; totalPaginas: number; avisos: string[] }

interface Item { s: string; x: number; f: string; p: number }   // f = fontName (pdfjs), p = índice da página (0-based)
interface Line { items: Item[]; raw: string; dec?: string }
interface Pagina { lines: Line[]; redbox: string | null; nro: string | null }

// Mapa de decodificação por FONTE: fontName -> (glifo-cifra -> caractere-claro).
type FontMaps = Record<string, Record<string, string>>;

// ── Decode por FORMA do glifo (fontes Type3) ─────────────────────────────────
// Algumas OPs (ex.: 013466) usam fontes Type3 com UMA CIFRA POR PÁGINA e sem
// ToUnicode: cada caractere é um DESENHO (CharProc). O código→desenho é
// re-embaralhado por página, mas o DESENHO da letra é ESTÁVEL no documento
// inteiro — só muda o código que aponta pra ele. Então indexamos pela FORMA
// (hash do CharProc): aprendemos "forma → letra" das âncoras de TODAS as páginas
// (títulos soletrados, cabeçalhos, dígitos da coluna SEQ) e o mapa vale pro
// documento todo. `pageShapes[p]` = lista de tabelas (charcode -> hash da forma)
// das fontes Type3 da página p. OPs sem Type3 (ex.: 013169) têm pageShapes vazio
// e essa camada NÃO liga — decode segue idêntico ao anterior. Ver
// [[project_pcp_hrm_caldeiraria]].
type ShapeTables = Record<number, string>[][];       // [pagina][fonteType3] -> (charcode -> hash)
type ShapeMap = Record<string, string>;              // hash da forma -> caractere claro

function shapeOfChar(tables: ShapeTables, ch: string, p: number): string | null {
  const tbls = tables[p];
  if (!tbls || !tbls.length) return null;
  const code = ch.charCodeAt(0);
  for (const t of tbls) { const h = t[code]; if (h != null) return h; }
  return null;
}

// Extrai, por página, as tabelas charcode->hash-da-forma das fontes Type3.
// Usa pdf-lib (já dependência do projeto) + md5 do CharProc. Retorna tabelas
// vazias por página quando a OP não usa Type3 — nesse caso a camada por forma
// fica inerte.
async function extractType3Tables(buf: Buffer): Promise<ShapeTables> {
  try {
    const { PDFDocument, PDFName, PDFDict, PDFRawStream, PDFArray, PDFNumber, decodePDFRawStream } = await import('pdf-lib');
    const { createHash } = await import('crypto');
    const hash = (b: Uint8Array) => createHash('md5').update(b).digest('hex').slice(0, 12);
    const pdf = await PDFDocument.load(buf, { updateMetadata: false });
    const ctx: any = (pdf as any).context;
    const lookup = (r: any) => ctx.lookup(r);

    const type3Table = (fontDict: any): Record<number, string> | null => {
      if (fontDict.get(PDFName.of('Subtype'))?.toString() !== '/Type3') return null;
      const enc = lookup(fontDict.get(PDFName.of('Encoding')));
      const charProcs = lookup(fontDict.get(PDFName.of('CharProcs')));
      const nameToHash: Record<string, string> = {};
      if (charProcs instanceof PDFDict)
        for (const [k, vRef] of charProcs.entries()) {
          const st = lookup(vRef);
          if (st instanceof PDFRawStream) nameToHash[k.toString().replace(/^\//, '')] = hash(new Uint8Array(decodePDFRawStream(st).decode()));
        }
      const codeToHash: Record<number, string> = {};
      if (enc instanceof PDFDict) {
        const diff = lookup(enc.get(PDFName.of('Differences')));
        if (diff instanceof PDFArray) {
          let cur = 0;
          for (let i = 0; i < diff.size(); i++) {
            const el = diff.get(i);
            if (el instanceof PDFNumber) cur = el.asNumber();
            else { const nm = el.toString().replace(/^\//, ''); if (nameToHash[nm]) codeToHash[cur] = nameToHash[nm]; cur++; }
          }
        }
      }
      return Object.keys(codeToHash).length ? codeToHash : null;
    };

    const tables: ShapeTables = [];
    for (const page of pdf.getPages()) {
      const perPage: Record<number, string>[] = [];
      const res: any = page.node.Resources();
      if (res) {
        const fontDict = lookup(res.get(PDFName.of('Font')));
        if (fontDict instanceof PDFDict)
          for (const [, fRef] of fontDict.entries()) {
            const fd = lookup(fRef);
            if (fd instanceof PDFDict) { const t = type3Table(fd); if (t) perPage.push(t); }
          }
      }
      tables.push(perPage);
    }
    return tables;
  } catch {
    return [];   // qualquer erro na extração de fontes → camada por forma desligada
  }
}

const isCtrl = (s: string) => { for (let i = 0; i < s.length; i++) if (s.charCodeAt(i) < 32) return true; return false; };

function addMap(map: Record<string, string>, cipher: string, plain: string) {
  const cc = cipher.replace(/[\s-]/g, '');
  if (cc.length !== plain.length) return;
  for (let i = 0; i < plain.length; i++) { const c = cc[i], p = plain[i]; if (c === ' ' || c === '-' || isCtrl(c)) continue; if (!(c in map)) map[c] = p; }
}
// Título soletrado ("C O M P O N E N T E S"). O separador entre as letras pode
// ser espaço/hífen (sumem no filtro) OU um GLIFO VISÍVEL da fonte (ex.: '/' na
// OP-013466: `O/M/b/2/M/P/3/P/N/3/I`, com '//' nos espaços entre palavras — e o
// mesmo glifo separa os campos nos dados, ou seja, é o "espaço" daquela fonte).
// Quando o char mais frequente é um símbolo (não-alfanumérico) ou ocupa ≳40% das
// posições, ele é o separador: removido do título e devolvido em `sep` pra ser
// mapeado como espaço na cifra da fonte.
function spacedTitleInfo(ln: Line): { title: string; sep: string } {
  const singles = ln.items.map(i => i.s).filter(s => typeof s === 'string' && s.replace(/[\s-]/g, '').length === 1).map(s => s.replace(/[\s-]/g, ''));
  if (singles.length === 0) return { title: '', sep: '' };
  const freq: Record<string, number> = {};
  for (const c of singles) freq[c] = (freq[c] || 0) + 1;
  const [sep, n] = Object.entries(freq).sort((a, b) => b[1] - a[1])[0];
  const ehSeparador = (/[^A-Za-z0-9]/.test(sep) || n / singles.length >= 0.4) && n >= 2;
  return ehSeparador ? { title: singles.filter(c => c !== sep).join(''), sep } : { title: singles.join(''), sep: '' };
}
const spacedTitle = (ln: Line) => spacedTitleInfo(ln).title;

// Fonte dominante de uma linha = a fonte da maior parte dos caracteres com
// conteúdo. Usada pra agrupar as linhas por fonte na derivação da cifra.
function lineFont(ln: Line): string {
  const cont: Record<string, number> = {};
  for (const it of ln.items) { if (typeof it.s !== 'string') continue; const n = it.s.replace(/\s/g, '').length; if (n) cont[it.f] = (cont[it.f] || 0) + n; }
  let best = '', bestN = -1;
  for (const [f, n] of Object.entries(cont)) if (n > bestN) { best = f; bestN = n; }
  return best;
}

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
      (byY[y] = byY[y] || []).push({ s: it.str, x: it.transform[4], f: it.fontName || '', p: p - 1 });
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
    // NRO da ordem — carimbado em TODA página no cabeçalho fixo do template
    // ("...ORDEM DE PRODUCAO NRO : 01316901003..."), texto legível (não
    // embaralhado, é boilerplate). É o identificador confiável de ordem — ver
    // agruparOrdens.
    let nro: string | null = null;
    for (const ln of lines) { const m = ln.raw.match(/NRO\s*:?\s*(\d{4,})/i); if (m) { nro = m[1]; break; } }
    paginas.push({ lines, redbox, nro });
  }
  return paginas;
}

// Chave de identidade do quadro vermelho (PN|PO|NS, normalizado) — comparar o
// texto CRU da anotação falhava: a mesma ordem re-carimbada numa página de
// continuação pode sair com espaçamento/quebra de linha levemente diferente
// (rendering da anotação varia por página), então `pg.redbox !== cur.redbox`
// ainda enxergava "ordem nova" onde era a mesma. Comparar PN/PO/NS já
// parseados e normalizados é resistente a isso.
function chaveCabecalho(redbox: string | null): string {
  if (!redbox) return '';
  const c = parseCabecalho(redbox);
  const chave = `${c.pn}|${c.po}|${c.ns}`.replace(/\s+/g, ' ').trim();
  return chave === '||' ? '' : chave;
}

// Agrupa páginas em SEÇÕES = ORDENS reais.
//
// Identificador confiável: o NRO da ordem (cabeçalho fixo de cada página,
// texto legível). Testado com PDF real (5 ordens, `OP 013169-01-001.pdf`) e
// descobrimos que o quadro vermelho (PN/PO/NS) NÃO serve pra separar ordens:
// ele identifica o PEDIDO/ORDEM PAI e se repete IDÊNTICO em várias ordens
// diferentes do mesmo documento — cada uma delas é uma sub-ordem de
// fabricação de um COMPONENTE diferente da mesma peça pai (o "Produto" logo
// após "***** ORDEM DE PRODUCAO - PAI ******" muda a cada ordem, embora o
// PN/PO/NS não mude). Uma tentativa anterior agrupava por PN/PO/NS igual e
// colava ordens DIFERENTES numa só, misturando componentes/roteiro de peças
// distintas — o NRO não tem esse problema, é único por ordem.
//
// Fallback pro quadro vermelho só entra se nenhuma página do documento tiver
// NRO legível (outro template de OP): aí sim assume que quadro vermelho
// DIFERENTE = ordem nova, e quadro igual/ausente = continuação da mesma.
function agruparOrdens(paginas: Pagina[]): { redbox: string | null; lines: Line[] }[] {
  return paginas.some(pg => pg.nro) ? agruparPorNro(paginas) : agruparPorQuadroVermelho(paginas);
}

function agruparPorNro(paginas: Pagina[]): { redbox: string | null; lines: Line[] }[] {
  const grupos: ({ redbox: string | null; lines: Line[] } & { nro: string | null })[] = [];
  let cur: (typeof grupos)[number] | null = null;
  for (const pg of paginas) {
    if (pg.nro && (!cur || pg.nro !== cur.nro)) { cur = { redbox: pg.redbox, lines: [], nro: pg.nro }; grupos.push(cur); }
    if (!cur) { cur = { redbox: pg.redbox, lines: [], nro: pg.nro }; grupos.push(cur); }
    if (!cur.redbox && pg.redbox) cur.redbox = pg.redbox;
    cur.lines.push(...pg.lines);
  }
  return grupos;
}

function agruparPorQuadroVermelho(paginas: Pagina[]): { redbox: string | null; lines: Line[] }[] {
  const grupos: { redbox: string | null; lines: Line[] }[] = [];
  let cur: { redbox: string | null; lines: Line[] } | null = null;
  let curChave = '';
  for (const pg of paginas) {
    const chave = chaveCabecalho(pg.redbox);
    const continuacao = !!(pg.redbox && cur && chave && chave === curChave);
    if (pg.redbox && !continuacao) { cur = { redbox: pg.redbox, lines: [] }; curChave = chave; grupos.push(cur); }
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

// ── Derivação da cifra POR FONTE ─────────────────────────────────────────────
// Deriva o mapa de UMA fonte a partir das linhas em que ela é dominante. É a
// lógica de âncoras original (títulos soletrados + cabeçalho da tabela + dígitos
// da coluna SEQ), agora escopada a uma fonte só. Retorna glifo->caractere.
function deriveMapaFonte(lines: Line[]): Record<string, string> {
  const map: Record<string, string> = {};
  // O separador dos títulos soletrados é o glifo de ESPAÇO da fonte — mapeia pra
  // ' ' (vale nos títulos e nos dados, onde o mesmo glifo separa os campos).
  const mapSep = (sep: string) => { if (sep && !(sep in map)) map[sep] = ' '; };
  let compIdx = -1;
  for (let i = 0; i < lines.length; i++) { const { title, sep } = spacedTitleInfo(lines[i]); if (title.length === 11) { addMap(map, title, 'COMPONENTES'); mapSep(sep); compIdx = i; break; } }
  for (const ln of lines) { const { title, sep } = spacedTitleInfo(ln); if (title.length === 18) { addMap(map, title, 'ROTEIRODEOPERACOES'); mapSep(sep); break; } }
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

// Deriva UM mapa por fonte: agrupa as linhas do documento pela fonte dominante
// e roda deriveMapaFonte em cada grupo. Cada página embaralhada (que usa a sua
// própria fonte) ganha assim a sua própria cifra.
function deriveFontMaps(paginas: Pagina[]): FontMaps {
  const porFonte: Record<string, Line[]> = {};
  for (const pg of paginas) for (const ln of pg.lines) { const f = lineFont(ln); if (!f) continue; (porFonte[f] = porFonte[f] || []).push(ln); }
  const maps: FontMaps = {};
  for (const [f, lns] of Object.entries(porFonte)) maps[f] = deriveMapaFonte(lns);
  return maps;
}

// Propaga a cifra pras fontes SEM âncora (páginas de continuação do roteiro que
// usam uma fonte própria e não têm título COMPONENTES/ROTEIRO). Estratégia: uma
// fonte JÁ mapeada me dá o cabeçalho do roteiro decodificado ("SEQ SETOR MAQUINA
// OPERACAO ETAPA…") com a posição X de cada caractere. O cabeçalho fica na MESMA
// posição X em toda página (template fixo do Totvs), então nas fontes fracas eu
// acho a linha de mesma assinatura X e alinho glifo→letra pelo texto conhecido.
// Nunca sobrescreve mapeamento já existente e só age em fonte comprovadamente
// sem âncora — não afeta OPs de fonte única (013169).
function propagarCabecalhoRoteiro(paginas: Pagina[], maps: FontMaps) {
  const decWith = (m: Record<string, string> | undefined) => (it: Item) => (m ? it.s.split('').map(c => (c in m ? m[c] : c)).join('') : it.s);

  // Referência: numa fonte já mapeada, a linha que decodifica pra cabeçalho do
  // roteiro (tem SETOR e ETAPA). Guarda cada caractere decodificado com seu X.
  let ref: { plain: string; x: number }[] | null = null;
  for (const [f, m] of Object.entries(maps)) {
    const dec = decWith(m);
    for (const pg of paginas) for (const ln of pg.lines) {
      if (lineFont(ln) !== f) continue;
      const d = ln.items.map(dec).join('').toUpperCase();
      if (/SET.?OR/.test(d) && /ETAP/.test(d) && /SEQ/.test(d)) {
        const chars: { plain: string; x: number }[] = [];
        for (const it of ln.items) { const p = dec(it); for (const ch of p) chars.push({ plain: ch, x: it.x }); }
        ref = chars; break;
      }
    }
    if (ref) break;
  }
  if (!ref) return;
  const refLetras = ref.filter(c => /[A-Z]/i.test(c.plain));
  const refXmin = Math.min(...ref.map(c => c.x)), refXmax = Math.max(...ref.map(c => c.x));

  // Fonte fraca = nenhuma linha dela tem título nem decodifica pra cabeçalho.
  for (const [f, m] of Object.entries(maps)) {
    const dec = decWith(m);
    const linhasF: Line[] = [];
    for (const pg of paginas) for (const ln of pg.lines) if (lineFont(ln) === f) linhasF.push(ln);
    const jaTem = linhasF.some(ln => { const d = ln.items.map(dec).join('').toUpperCase(); return (/SET.?OR/.test(d) && /ETAP/.test(d)) || /COMPONENTES/.test(d.replace(/\s/g, '')); });
    if (jaTem) continue;

    // Acha a linha-cabeçalho de F: mesma faixa X, contagem de itens parecida.
    let melhor: Line | null = null, melhorScore = Infinity;
    for (const ln of linhasF) {
      const xs = ln.items.map(i => i.x);
      const xmin = Math.min(...xs), xmax = Math.max(...xs);
      if (xmax < refXmin || xmin > refXmax) continue;
      const cobre = Math.min(xmax, refXmax) - Math.max(xmin, refXmin);
      const score = Math.abs(ln.items.length - ref.length) + Math.max(0, (refXmax - refXmin) - cobre) / 20;
      if (cobre > (refXmax - refXmin) * 0.7 && score < melhorScore) { melhorScore = score; melhor = ln; }
    }
    if (!melhor) continue;

    // Alinha os caracteres de F (por X) às letras da referência (por X) e mapeia
    // glifo→letra. Só letras; nunca sobrescreve. Exige X próximo (mesmo campo).
    const alvo: { g: string; x: number }[] = [];
    for (const it of melhor.items) for (const ch of it.s) alvo.push({ g: ch, x: it.x });
    const alvoLetras = alvo.filter(c => c.g.replace(/[\s-]/g, '').length === 1 && /[^\s-]/.test(c.g));
    if (Math.abs(alvoLetras.length - refLetras.length) > 3) continue;
    const n = Math.min(alvoLetras.length, refLetras.length);
    const novo: Record<string, string> = {};
    for (let i = 0; i < n; i++) {
      const g = alvoLetras[i].g, p = refLetras[i].plain;
      if (!/[A-Z]/i.test(p)) continue;
      if (g === ' ' || g === '-' || isCtrl(g)) continue;
      if (!(g in m) && !(g in novo)) novo[g] = p;
    }
    Object.assign(m, novo);
  }
}

// Decodifica UM trecho. Prioridade: (1) mapa por FORMA do glifo (Type3), que é
// global e cobre o documento inteiro; (2) mapa por FONTE (cifra por âncora);
// (3) identidade. Quando não há Type3 (shapeMap/tables vazios) a camada por
// forma nunca dispara e o resultado é idêntico ao anterior.
function makeDecItem(maps: FontMaps, shapeMap: ShapeMap = {}, tables: ShapeTables = []) {
  const usaForma = tables.length > 0 && Object.keys(shapeMap).length > 0;
  return (it: Item): string => {
    const m = maps[it.f];
    if (!usaForma && !m) return it.s;
    return it.s.split('').map(c => {
      // Prioridade: mapa por FONTE (âncora da própria página — nunca corrompe o
      // que já funciona). A camada por FORMA só PREENCHE LACUNAS: caracteres que
      // a fonte desta página não aprendeu, usando o conhecimento global das
      // outras páginas. Assim o decode nunca piora, só ganha cobertura.
      if (m && c in m) return m[c];
      if (usaForma) { const h = shapeOfChar(tables, c, it.p); if (h && shapeMap[h] != null) return shapeMap[h]; }
      return c;
    }).join('');
  };
}

// Constrói o mapa GLOBAL forma→caractere AGRUPANDO os mapas por-fonte na
// dimensão da FORMA. Cada mapa por-fonte (deriveMapaFonte) já achou as âncoras
// da SUA página (títulos, cabeçalho, dígitos SEQ); aqui só reindexamos cada
// entrada glifo-cifra→letra pela FORMA daquele glifo, e juntamos as 13 páginas
// por voto majoritário. Efeito: uma letra que a página 3 aprendeu vale pra
// página 7 (mesma forma), mesmo que a página 7 não tenha âncora pra ela.
//
// Por que o voto é confiável: a MESMA forma decodifica pra MESMA letra em toda
// página onde foi aprendida (sinais concordam e se acumulam), enquanto entradas
// não-aprendidas (identidade glifo→ele-mesmo) espalham caracteres diferentes por
// página (o charcode muda a cada página) e nunca formam maioria. Só contamos
// entradas EXPLÍCITAS do mapa por-fonte (não a identidade), então o ruído nem
// entra. Nunca inventa: forma sem nenhuma âncora em nenhuma página fica de fora.
function buildShapeMap(paginas: Pagina[], maps: FontMaps, tables: ShapeTables): ShapeMap {
  if (!tables.some(t => t.length)) return {};
  const votos: Record<string, Record<string, number>> = {};
  for (const pg of paginas) for (const ln of pg.lines) for (const it of ln.items) {
    const m = maps[it.f];
    if (!m) continue;
    for (const c of it.s) {
      if (!(c in m)) continue;                 // só entradas aprendidas por âncora
      const sh = shapeOfChar(tables, c, it.p);
      if (!sh) continue;
      const ch = m[c];
      if (ch == null || ch === '' || ch.charCodeAt(0) < 32) continue;
      (votos[sh] = votos[sh] || {})[ch] = (votos[sh][ch] || 0) + 1;
    }
  }
  const final: ShapeMap = {};
  for (const [sh, v] of Object.entries(votos)) final[sh] = Object.entries(v).sort((a, b) => b[1] - a[1])[0][0];
  return final;
}

function parseProduto(lines: Line[]): OPProduto {
  const norm = (s: string) => s.replace(/[-\s]/g, '').toUpperCase();
  // Ordem com sub-item ("***** ORDEM DE PRODUCAO - PAI ******"): vem o
  // Produto PAI (a peça maior) e, depois de uma linha de traços, o Produto
  // FILHO — que é o que ESSA ordem de verdade fabrica/roteia (o PN/PO/NS do
  // quadro vermelho não muda entre pai e filho, só o Produto). Pegamos o
  // ÚLTIMO "Produto:" encontrado antes de COMPONENTES: quando só tem um
  // (ordem sem sub-item, marcador "V I A P E Ç A"), é ele mesmo; quando tem
  // dois, é o filho.
  const fimBusca = (() => { const i = lines.findIndex(ln => norm(ln.dec || '').includes('COMPONENTES')); return i >= 0 ? i : lines.length; })();
  const candidatos: OPProduto[] = [];
  for (let i = 0; i < fimBusca; i++) {
    // PRESERVA hífens: em OP legível a descrição do "Produto:" traz um part
    // number cujos hífens são conteúdo real (ex.: "2184323-81-01 ASSY, ...").
    // Trocá-los por espaço descaracterizava o PN ("2184323 81 01"). Aqui só
    // colapsamos espaços. Se a linha estivesse embaralhada a ponto de os hífens
    // serem lixo da cifra, "Produto"/"Descricao" também não sairiam legíveis, o
    // regex não casaria e cairia no fallback abaixo (que segue limpando `-`).
    const d = (lines[i].dec || '').replace(/\s+/g, ' ').trim();
    const m = d.match(/Produto:?\s*(\S+)\s+Descric[a-z]*:?\s*(.+)/i);
    if (m) candidatos.push({ codigo: m[1].replace(/-+$/, ''), descricao: m[2].trim() });
  }
  if (candidatos.length > 0) return candidatos[candidatos.length - 1];

  // Fallback pra OP embaralhada sem "Produto:" legível.
  const viaIdx = lines.findIndex(ln => norm(ln.dec || '').includes('VIAPECA'));
  const cand = viaIdx >= 0 ? lines.slice(viaIdx + 1, viaIdx + 3) : lines.slice(4, 8);
  let melhor = '';
  for (const ln of cand) { const d = (ln.dec || '').replace(/-/g, ' ').replace(/\s+/g, ' ').trim(); if ((d.match(/[A-Za-z]/g) || []).length > (melhor.match(/[A-Za-z]/g) || []).length) melhor = d; }
  const toks = melhor.split(' ');
  return { codigo: '', descricao: toks.length > 6 ? toks.slice(4).join(' ') : melhor };
}

// Data BR (dd/mm/aaaa) -> ISO (aaaa-mm-dd). Sem match -> ''.
function dataIso(br: string): string {
  const m = br.match(/(\d{2})\/(\d{2})\/(\d{4})/);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : '';
}

// Cabeçalho de identificação do Totvs (fixo, mesma página do "Produto:"):
//   "Emissao: dd/mm/aaaa Previsao Ini: dd/mm/aaaa Entrega: dd/mm/aaaa"
//   "Quantidade: n,nn Unidade: UM Real Ini .: __/__/__"
//   "Cliente: codigo Loja: nn Nome: NOME DO CLIENTE"
//   "Centro Custo: ... Situacao: Normal"
// Cada rótulo é buscado isolado (não a linha toda) porque o Totvs quebra vários
// campos na mesma linha física. "Emissao:" exige "Previsao" logo depois pra não
// casar com a OUTRA "Emissão:" do rodapé fixo ("Hora: hh:mm:ss Emissão: data",
// data de impressão do documento — não é a emissão da ordem).
//
// Ordem com sub-item (ver parseProduto): o bloco de identificação aparece
// DUAS vezes — uma pro Produto PAI, outra pro FILHO (o que essa ordem de
// verdade fabrica) — e só o bloco do FILHO tem Quantidade/Situacao corretos
// pra ELE (o do pai é outro valor). Cliente/Nome só saem uma vez no documento
// inteiro (mesmo cliente pro pedido todo) e no bloco do filho o Totvs não
// repete ("Cliente: Loja: Nome:" vazio) — por isso Cliente busca em toda a
// área de identificação (podendo pegar do pai), e os demais campos buscam só
// a partir do ÚLTIMO "Produto:" (bloco do filho). NÃO inventa: rótulo que não
// casou, ou só apareceu vazio no escopo, fica ''.
function parseIdentificacao(lines: Line[]): OPIdentificacao {
  const ident: OPIdentificacao = { clienteNome: '', clienteCodigo: '', quantidade: '', unidade: '', emissao: '', entrega: '', situacao: '' };
  const norm = (s: string) => s.replace(/[-\s]/g, '').toUpperCase();
  const fimBusca = (() => { const i = lines.findIndex(ln => norm(ln.dec || '').includes('COMPONENTES')); return i >= 0 ? i : lines.length; })();

  for (let i = 0; i < fimBusca; i++) {
    const m = (lines[i].dec || '').match(/Cliente:?\s*(\S+).*?Nome:?\s*(.+)/i);
    if (m && !/:$/.test(m[1])) { ident.clienteCodigo = m[1]; ident.clienteNome = m[2].trim(); break; }
  }

  let produtoIdx = -1;
  for (let i = 0; i < fimBusca; i++) if (/Produto:?\s*\S+\s+Descric/i.test(lines[i].dec || '')) produtoIdx = i;
  for (let i = Math.max(produtoIdx, 0); i < fimBusca; i++) {
    const d = lines[i].dec || '';
    let m;
    if (!ident.emissao && (m = d.match(/Emissao:?\s*(\d{2}\/\d{2}\/\d{4})\s*Previsao/i))) ident.emissao = dataIso(m[1]);
    if (!ident.entrega && (m = d.match(/Entrega:?\s*(\d{2}\/\d{2}\/\d{4})/i))) ident.entrega = dataIso(m[1]);
    if (!ident.quantidade && (m = d.match(/Quantidade:?\s*([\d.,]+)\s*Unidade:?\s*(\S+)/i))) { ident.quantidade = m[1]; ident.unidade = m[2]; }
    if (!ident.situacao && (m = d.match(/Situacao:?\s*(\S.*)$/i))) ident.situacao = m[1].trim();
  }
  return ident;
}

// Best-effort: extrai matéria-prima / dimensão / norma da descrição, SÓ quando
// reconhecidos com segurança. Nunca inventa: sem match confiável → null. A
// descrição original nunca é alterada.
const MP_KEYWORDS = /\b(CHAPA|BARRA|BR\b|CANT(?:ONEIRA)?|TUBO|PERFIL|VERGALH[AÃ]O|VERG\b|BOBINA|PINO|PARAFUSO|PORCA|ARRUELA|SCREW|BOLT|NUT|WASHER|FLANGE|CHAP)\b/i;
const NORMA_RE = /\b(A\s?36|ASTM\s?A?\d+[A-Z]?|SAE\s?\d+|GR\.?\s?B?\d+[A-Z]?|API\s?\w+|MS\s?\d[\d\s]*|ANSI|DIN\s?\d+|NBR\s?\d+)\b/i;
const DIM_RE = /Ø?\s*\d+(?:[.,/]\d+)?\s*["¨']?\s*[xX]\s*\d+(?:[.,/]\d+)?(?:\s*[xX]\s*\d+(?:[.,/]\d+)?)?/;
const ESP_RE = /#\s*\d+(?:[.,/]\d+)?\s*["¨']?/;
function extrairCamposDescricao(desc: string): Pick<OPMaterial, 'materiaPrima' | 'dimensao' | 'espessura' | 'norma'> {
  const mp = desc.match(MP_KEYWORDS);
  const norma = desc.match(NORMA_RE);
  const dim = desc.match(DIM_RE);
  const esp = desc.match(ESP_RE);
  return {
    materiaPrima: mp ? mp[0].toUpperCase().replace(/\bBR\b/, 'BARRA REDONDA') : null,
    dimensao: dim ? dim[0].replace(/\s+/g, ' ').trim() : null,
    espessura: esp ? esp[0].replace(/\s+/g, '').trim() : null,
    norma: norma ? norma[0].toUpperCase().replace(/\s+/g, ' ').trim() : null,
  };
}

function parseBlocos(lines: Line[], decItem: (it: Item) => string): { materiais: OPMaterial[]; roteiro: OPOperacao[] } {
  const clean = (s: string) => s.replace(/\|/g, ' ').replace(/-/g, ' ').replace(/\s+/g, ' ').trim();
  const norm = (s: string) => (s || '').replace(/[-\s]/g, '').toUpperCase();
  const skip = (d: string) => !d || isCtrl(d)
    || /^(FOLHA|HORA|SIGA|GRUPODEEMPRESA|ORDEMDEPRODUCAO|NRO|DTREF|VIAPECA)/i.test(d.replace(/[-\s.]/g, ''))
    || /^(INICIO|TERMINO)REAL/i.test(d.replace(/[-\s]/g, '')) || /PROIBIDA|IMPRESSO/i.test(d)
    // Stub de apontamento/histórico ("Inspecao CQ de Producao ... Descricao: ...
    // Item: ... Loja: ... Situacao: ...") que aparece intercalado no meio do
    // roteiro em OPs de várias páginas — nunca é um passo de roteiro de
    // verdade. Visto em teste real virando uma linha gigante e falsa na lista
    // de "por onde passa". 3+ ":" também pega as continuações desse stub
    // (rótulo:valor repetido), que não têm outro jeito fácil de reconhecer.
    || /INSPE[CÇ][AÃ]O\s*CQ\s*DE\s*PRODU[CÇ][AÃ]O/i.test(d)
    || (d.match(/:/g) || []).length >= 3;

  const compIdx = lines.findIndex(ln => norm(ln.dec || '').includes('COMPONENTES'));
  const rotIdx = lines.findIndex(ln => norm(ln.dec || '').includes('ROTEIRODEOPERA'));

  // MATERIAIS (COMPONENTES)
  const materiais: OPMaterial[] = [];
  const end = rotIdx > compIdx ? rotIdx : lines.length;
  for (let i = compIdx + 1; i < end && compIdx >= 0; i++) {
    const d = lines[i].dec || '';
    const n = d.replace(/[-\s]/g, '').toUpperCase();
    if (n.includes('CODIGO') && n.includes('DESCRICAO')) continue;
    const cols = d.split('|').map(c => c.replace(/^[-\s]+|[-\s]+$/g, '').replace(/-/g, ' ').trim());
    if (cols.length >= 4 && /\d/.test(cols[0]) && cols[0].length >= 4) {
      const descricao = cols[1] || '';
      const extra = extrairCamposDescricao(descricao);
      materiais.push({
        codigo: cols[0].replace(/\s/g, ''), descricao,
        quantidade: (cols[2] || '').replace(/\s/g, ''), unidade: (cols[3] || '').replace(/\s/g, ''),
        al: cols[4] ? cols[4].replace(/\s/g, '') : null,
        rastreabilidade: cols[5] ? cols[5].replace(/\s/g, '') : null,
        ...extra,
        raw: clean(d),
      });
    } else if (materiais.length && clean(d) && !/^\d/.test(n) && !skip(d)) {
      // Continuação da descrição do material anterior (quebra de linha). Guardas
      // pra NÃO engolir o roteiro/rodapé inteiro quando o título "ROTEIRO DE
      // OPERAÇÕES" não foi achado (rotIdx=-1, ex.: OP muito embaralhada) — sem
      // isso a descrição do último material virava um parágrafo gigante com o
      // roteiro todo dentro. Só concatena trecho curto e limita o tamanho total.
      const last = materiais[materiais.length - 1];
      const add = clean(d);
      if (add.length <= 60 && last.descricao.length < 120) {
        last.descricao += ' ' + add;
        Object.assign(last, extrairCamposDescricao(last.descricao));
      }
    }
  }

  // ROTEIRO — colunas por POSIÇÃO X (do cabeçalho SEQ/SETOR/MAQ/ETAPA/TP/TF).
  const colX: Record<string, number> = {};
  for (const ln of lines) {
    const d = (ln.dec || '').toUpperCase();
    if (/SET.R/.test(d) && /ETAP/.test(d)) {
      for (const it of ln.items) {
        const t = decItem(it).toUpperCase().replace(/[^A-Z]/g, '');
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
      const t = decItem(it); const x = it.x;
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
    o.raw = clean(ln.dec || '');
    return o;
  }

  const roteiro: OPOperacao[] = [];
  for (let i = rotIdx + 1; i < lines.length && rotIdx >= 0; i++) {
    const ln = lines[i];
    const d = clean(ln.dec || '');
    if (skip(d)) continue;
    if (/SETOR/i.test(d) && /ETAPA/i.test(d)) continue;
    if (temCol) {
      const o = bucket(ln);
      if (/^\d{3}$/.test(o.seq)) roteiro.push(o);
      else if (roteiro.length) { const last = roteiro[roteiro.length - 1]; if (o.setorNome) last.setorNome += ' ' + o.setorNome; if (o.etapa) last.etapa += ' ' + o.etapa; }
    } else {
      const m = d.match(/^(\d{3})\s+(\d{4,6})\s+(.+?)\s*(\d{1,4})\s+(\d{1,4})\s*$/) || d.match(/^(\d{3})\s+(\d{4,6})\s+(.+)$/);
      if (m) roteiro.push({ seq: m[1], setor: m[2], setorNome: '', etapa: m[3].trim(), tc: m[4] || '', tf: m[5] || '', raw: d });
      else if (roteiro.length && !/^\d{3}\s/.test(d)) roteiro[roteiro.length - 1].etapa += ' ' + d;
    }
  }
  return { materiais, roteiro };
}

// ── Qualidade e validação (pós-decodificação) ────────────────────────────────
// Vocabulário de setores/operações típicos do roteiro do Totvs (independente do
// código interno do sistema) — usado só pra MEDIR plausibilidade, nunca pra
// completar/inventar dado.
const VOCAB_ROTEIRO = ['CORTE', 'SERRA', 'CNC', 'PLASMA', 'LASER', 'MACARICO', 'INSPECAO', 'INSPE', 'CQ', 'QUALIDADE', 'TORNO', 'FURAD', 'FURACAO', 'USINAGEM', 'ACABAMENTO', 'CALD', 'CALDEIRARIA', 'SOLDA', 'MONTAGEM', 'JATEAMENTO', 'JATO', 'PINTURA', 'EXPEDICAO', 'EMBALAGEM', 'DOBRA', 'PRENSA', 'CALANDRA', 'CHANFR', 'TRACAGEM', 'ESTUFA', 'GALVAN', 'ZINCAGEM', 'ROSCA', 'PATIO', 'OBSERVACOES'];
const codigoNumerico = (c: string) => /^\d{4,}$/.test((c || '').replace(/\s/g, ''));

function avaliar(op: Omit<OPItem, 'qualidade' | 'validacao'>): { qualidade: number; validacao: OPValidacao } {
  const avisos: string[] = [];
  const temProduto = !!(op.produto.codigo || op.produto.descricao);
  const temComponentes = op.materiais.length > 0;
  const temRoteiro = op.roteiro.length > 0;

  const comCodigo = op.materiais.filter(m => codigoNumerico(m.codigo)).length;
  const componentesSemCodigo = op.materiais.length - comCodigo;
  const fracCodigo = op.materiais.length ? comCodigo / op.materiais.length : 0;

  const setores = op.roteiro.map(o => (o.setorNome || o.setor || '').toUpperCase());
  const setoresOk = setores.filter(s => VOCAB_ROTEIRO.some(v => s.includes(v))).length;
  const fracSetor = setores.length ? setoresOk / setores.length : 0;

  // Descrição plausível = tem letras de verdade (não é só glifo/símbolo).
  const descOk = op.materiais.filter(m => (m.descricao.match(/[A-Za-z]/g) || []).length >= 3).length;
  const fracDesc = op.materiais.length ? descOk / op.materiais.length : 0;

  // Qualidade = média ponderada dos sinais disponíveis. Só conta o que existe:
  // uma OP legítima pode não ter componentes (ex.: ordem de sub-item) — nesse
  // caso o peso vai pro roteiro/produto e não pune injustamente.
  const sinais: [number, number][] = []; // [valor, peso]
  sinais.push([temProduto ? 1 : 0, 1]);
  if (op.materiais.length) { sinais.push([fracCodigo, 2]); sinais.push([fracDesc, 1]); }
  if (op.roteiro.length) sinais.push([fracSetor, 2]);
  const somaPeso = sinais.reduce((a, [, w]) => a + w, 0);
  const qualidade = somaPeso ? sinais.reduce((a, [v, w]) => a + v * w, 0) / somaPeso : 0;

  // Avisos (instrução 7): registrar CLARAMENTE o que não foi identificado.
  if (!temProduto) avisos.push('Produto não identificado.');
  if (!temComponentes) avisos.push('Nenhum componente (material) identificado.');
  if (!temRoteiro) avisos.push('Roteiro (operações) não identificado.');
  if (temComponentes && componentesSemCodigo > 0) avisos.push(`${componentesSemCodigo} de ${op.materiais.length} componentes sem código numérico coerente.`);
  if (temComponentes && fracDesc < 0.6) avisos.push('Descrições dos componentes parecem embaralhadas/ilegíveis.');
  if (temRoteiro && fracSetor < 0.5) avisos.push('Setores do roteiro não batem com operações conhecidas (possível decodificação incompleta).');

  return { qualidade, validacao: { temProduto, temComponentes, temRoteiro, componentesSemCodigo, avisos } };
}

// ── Fallback por OCR (só materiais) ──────────────────────────────────────────
// Algumas OPs (ex.: OP-013466, fonte Type3 embaralhada na página inteira) não
// dão pra decifrar com confiança — a cifra muda por página e as âncoras
// automáticas não bastam pra recuperar tudo (tentado, ver [[project_pcp_hrm_caldeiraria]]).
// Só que a página, quando RENDERIZADA como imagem, sai perfeitamente legível
// (o glifo desenha certo, só o código por trás do texto embaralha) — então dá
// pra ignorar a cifra inteiramente e ler a imagem com OCR.
//
// Custo: OCR demora ~3s por página. Ler o documento inteiro assim (uma OP real
// tem 13-18 páginas) estoura o tempo de uma função da Vercel. Por isso o OCR
// roda SÓ na(s) página(s) da tabela de COMPONENTES de cada ordem cujos
// materiais saíram ruins pela decodificação normal — a prioridade combinada
// com o usuário foi materiais/quantidades, não o roteiro inteiro. Limite de 2
// páginas por ordem e 6 no total pro documento, pra nunca estourar o tempo
// mesmo numa OP com várias ordens ruins.
const OCR_MAX_PAGINAS_MATERIAIS_POR_ORDEM = 2;
const OCR_MAX_PAGINAS_ROTEIRO_POR_ORDEM = 4;
const OCR_MAX_PAGINAS_TOTAL = 5;

// Página (0-based) onde está o título soletrado "COMPONENTES"/"ROTEIRO DE
// OPERAÇÕES" DESTA ordem — mesma checagem por FORMA (spacedTitleInfo) que as
// âncoras de decodificação usam (`tituloLen` 11 ou 18), então funciona numa
// página 100% embaralhada (não depende de `ln.dec` estar certo). `null` se a
// ordem não tem essa seção (ex.: ordem só de sub-item, sem COMPONENTES).
function paginaDoTitulo(lines: Line[], tituloLen: number): number | null {
  for (const ln of lines) {
    if (spacedTitleInfo(ln).title.length === tituloLen) return ln.items[0]?.p ?? null;
  }
  return null;
}
function paginaComponentes(lines: Line[]): number | null { return paginaDoTitulo(lines, 11); }
function paginaRoteiro(lines: Line[]): number | null { return paginaDoTitulo(lines, 18); }
// Última página (0-based) que pertence a este grupo de linhas — não vale a
// pena OCR além dela mesmo se o orçamento permitir (não tem mais nada da
// ordem ali).
function ultimaPagina(lines: Line[]): number {
  let max = 0;
  for (const ln of lines) { const p = ln.items[0]?.p; if (p != null && p > max) max = p; }
  return max;
}

// Documento pdfjs carregado UMA VEZ e reaproveitado pra renderizar várias
// páginas (pdfjs + @napi-rs/canvas — sem depender de Ghostscript/poppler, que
// não existem no runtime da Vercel). Recarregar o PDF inteiro por página (era
// o código original) desperdiçava tempo à toa — numa OP de várias páginas
// ruins isso sozinho quase estourou os 30s da função.
interface RenderCtx { doc: { getPage(n: number): Promise<any> }; createCanvas: (w: number, h: number) => any; NapiCanvasFactory: new () => any }
async function carregarDocParaRender(buf: Buffer): Promise<RenderCtx> {
  const { createCanvas } = await import('@napi-rs/canvas');
  const pdfjsMod: any = await import('pdfjs-dist/legacy/build/pdf.js');
  const pdfjs = pdfjsMod.getDocument ? pdfjsMod : (pdfjsMod.default || pdfjsMod);
  class NapiCanvasFactory {
    create(width: number, height: number) { const canvas = createCanvas(width, height); return { canvas, context: canvas.getContext('2d') }; }
    reset(cc: any, width: number, height: number) { cc.canvas.width = width; cc.canvas.height = height; }
    destroy(cc: any) { cc.canvas.width = 0; cc.canvas.height = 0; cc.canvas = null; cc.context = null; }
  }
  const doc = await pdfjs.getDocument({ data: new Uint8Array(buf), useSystemFonts: true, isEvalSupported: false, canvasFactory: new NapiCanvasFactory() }).promise;
  return { doc, createCanvas, NapiCanvasFactory };
}
async function renderPaginaPng(ctx: RenderCtx, pageIndex0: number): Promise<Buffer> {
  const page = await ctx.doc.getPage(pageIndex0 + 1);
  const viewport = page.getViewport({ scale: 2.5 });
  const canvas = ctx.createCanvas(viewport.width, viewport.height);
  const c2d = canvas.getContext('2d');
  await page.render({ canvasContext: c2d, viewport, canvasFactory: new ctx.NapiCanvasFactory() }).promise;
  return canvas.toBuffer('image/png');
}

// Parseia a tabela de COMPONENTES a partir do texto OCR (não da cifra). O "|"
// que separa as colunas é impresso de verdade no PDF (não artefato da
// decodificação) — só que o OCR não lê essa barra fina com confiança: vira
// "1", "I", "l", "[", "]" ou "/" dependendo da linha. Por isso a âncora
// confiável não é o separador (varia demais), e sim o formato da QUANTIDADE
// ("N,NN" — vírgula decimal não aparece em medida/rosca, que usa ponto:
// "2.25\""), com a UNIDADE (2 letras) logo depois. Descrição que quebra em
// duas linhas (ex.: "NAMEPLATE" na linha seguinte) é colada na anterior, igual
// o caminho normal (`parseBlocos`) já faz.
function parseMateriaisOcr(texto: string): OPMaterial[] {
  const materiais: OPMaterial[] = [];
  const linhaMaterial = /^(\d{4,6})\s+(.+?)\s+(\d{1,4},\d{2})\s*[|/[\]Il]*\s*([A-Z]{2})\b(.*)$/;
  for (const linhaRaw of texto.split(/\r\n?|\n/)) {
    const linha = linhaRaw.trim();
    if (!linha) continue;
    if (/ROTEIRO\s*DE\s*OPERA/i.test(linha) || /^SEQ\.?\s+SETOR/i.test(linha)) break;
    const m = linha.match(linhaMaterial);
    if (m) {
      const [, codigo, descricaoRaw, quantidade, unidade, resto] = m;
      const descricao = descricaoRaw.replace(/^[|/[\]Il](?=\d)/, '').replace(/[|/[\]]+$/, '').trim();
      materiais.push({
        codigo, descricao, quantidade, unidade,
        al: null, rastreabilidade: resto.replace(/[|/[\]!]/g, ' ').trim() || null,
        ...extrairCamposDescricao(descricao),
        raw: linha,
      });
    } else if (materiais.length && linha.length <= 60) {
      const last = materiais[materiais.length - 1];
      if (last.descricao.length < 120) {
        last.descricao += ' ' + linha;
        Object.assign(last, extrairCamposDescricao(last.descricao));
      }
    }
  }
  return materiais;
}

// Roda o fallback de OCR pra UMA ordem: acha a página de COMPONENTES, renderiza
// e lê. Reaproveita o `worker` do Tesseract entre ordens (não recria a cada
// chamada — inicializar custa ~0,5s). Retorna `null` sem alterar nada quando
// não achar a página, ou quando o OCR não render nenhum material com código
// numérico coerente (não troca uma leitura ruim por outra pior).
async function tentarOcrMateriais(renderCtx: RenderCtx, lines: Line[], worker: { recognize: (b: Buffer) => Promise<{ data: { text: string } }> }, orcamento: { restante: number }): Promise<OPMaterial[] | null> {
  const pagInicial = paginaComponentes(lines);
  if (pagInicial == null) return null;
  const materiaisTodos: OPMaterial[] = [];
  for (let i = 0; i < OCR_MAX_PAGINAS_MATERIAIS_POR_ORDEM && orcamento.restante > 0; i++) {
    let png: Buffer;
    try { png = await renderPaginaPng(renderCtx, pagInicial + i); } catch { break; }
    orcamento.restante--;
    let texto = '';
    try { const r = await worker.recognize(png); texto = r.data.text; } catch { break; }
    materiaisTodos.push(...parseMateriaisOcr(texto));
    // Página seguinte só ajuda se a tabela realmente continuar nela — sem
    // achar nenhuma linha de material aqui, não vale gastar mais orçamento.
    if (!/\|/.test(texto)) break;
  }
  return materiaisTodos.length ? materiaisTodos : null;
}

// Rótulos de MAQ./OPER. (nome do setor) vistos em OPs reais do HRM/Caldeiraria
// — mais específico que VOCAB_ROTEIRO (que é fragmento pra PONTUAR qualidade,
// não pra DELIMITAR onde a etapa começa). Ordem do mais longo pro mais curto:
// tenta o rótulo composto mais específico antes de aceitar um genérico (ex.:
// "CALD PESADA" antes de qualquer coisa que só bata em "CALD").
const MAQOPER_LABELS = [
  'INSPECAO CQ', 'CALD PESADA', 'CALD MEDIA', 'CALD LEVE', 'CORTE SERRA',
  'CORTE PLASMA', 'CORTE CNC', 'OBSERVACOES', 'ACABAMENTO', 'FURADEIRA',
  'JATEAMENTO', 'EXPEDICAO', 'MONTAGEM', 'EMBALAGEM', 'USINAGEM', 'QUALIDADE',
  'GALVANIZACAO', 'CALANDRA', 'TRACAGEM', 'CHANFRO', 'ESTUFA', 'PINTURA',
  'PRENSA', 'PATIO', 'ROSCA', 'DOBRA', 'TORNO', 'SOLDA',
];

// Compara os primeiros `alvo.length` caracteres de `texto` (maiúsculo) contra
// `alvo`, tolerando erro de OCR (ex.: "INSPECAO CO" vs "INSPECAO CQ" — 1
// letra errada não invalida o rótulo).
function bateAproximado(texto: string, alvo: string): boolean {
  if (texto.length < alvo.length) return false;
  let dif = 0;
  for (let i = 0; i < alvo.length; i++) if (texto[i] !== alvo[i]) dif++;
  return dif <= Math.max(1, Math.floor(alvo.length * 0.2));
}

// Separa MAQ./OPER. (nome do setor) da ETAPA (descrição) dentro do trecho que
// sobra depois de SEQ+SETOR numa linha de roteiro OCR — não tem "|" separando
// essas colunas no PDF real (só espaço), então a única âncora confiável é
// reconhecer o RÓTULO em si contra a lista conhecida. `null` quando nenhum
// rótulo bate — melhor não separar do que separar errado.
function acharMaqOper(resto: string): { setorNome: string; etapa: string } | null {
  const upper = resto.toUpperCase();
  for (const label of MAQOPER_LABELS) {
    if (bateAproximado(upper, label)) return { setorNome: label, etapa: resto.slice(label.length).trim() };
  }
  return null;
}

// Parseia o Roteiro de Operações a partir do texto OCR. Formato real:
// "SEQ SETOR MAQ./OPER. ETAPA... TP TF" numa linha só (ETAPA às vezes quebra
// pra linha seguinte antes de "INICIO REAL:"), com o cabeçalho da tabela
// repetido várias vezes na mesma página (a cada novo grupo de passos) — só
// pula essas linhas de "moldura", não usa como fronteira de parada (roteiro
// legítimo tem VÁRIOS desses ao longo do documento). TC/TF: OCR às vezes lê
// "0" como a letra solta "o" — normaliza pro dígito.
function parseRoteiroOcr(texto: string): OPOperacao[] {
  const roteiro: OPOperacao[] = [];
  const linhaOperacao = /^(\d{3})\D{0,4}(\d{4,6})\s+(.+)$/;
  for (const linhaRaw of texto.split(/\r\n?|\n/)) {
    const linha = linhaRaw.trim();
    if (!linha) continue;
    if (/^SEQ\.?\s*SETOR/i.test(linha) || /^INICIO\s+REAL/i.test(linha)) continue;
    const m = linha.match(linhaOperacao);
    if (m) {
      const [, seq, setor, restoOriginal] = m;
      let corpo = restoOriginal;
      let tc = '', tf = '';
      const mNum = restoOriginal.match(/^(.*?)\s+(\d{1,4}|[oO])\s+(\d{1,4}|[oO])\s*$/);
      if (mNum) { corpo = mNum[1].trim(); tc = mNum[2].replace(/[oO]/, '0'); tf = mNum[3].replace(/[oO]/, '0'); }
      const achado = acharMaqOper(corpo);
      roteiro.push({
        seq, setor,
        setorNome: achado?.setorNome || '',
        etapa: (achado?.etapa ?? corpo).trim(),
        tc, tf, raw: linha,
      });
    } else if (roteiro.length && linha.length <= 60 && !/^\d{3}\D{0,4}\d{4,6}/.test(linha)) {
      // Continuação da etapa (quebra de linha), ex.: "ESTRUTURA" sozinha.
      roteiro[roteiro.length - 1].etapa += ' ' + linha;
    }
  }
  return roteiro;
}

// Igual a `tentarOcrMateriais`, mas pro Roteiro — começa na página do título
// "ROTEIRO DE OPERAÇÕES" e segue até o fim das páginas desta ordem (ou até o
// orçamento/limite por ordem acabar, o que vier primeiro). Documentos muito
// longos podem não caber no orçamento total — melhor um roteiro PARCIAL
// correto do que nenhum, e nunca estourar o tempo da função.
async function tentarOcrRoteiro(renderCtx: RenderCtx, lines: Line[], worker: { recognize: (b: Buffer) => Promise<{ data: { text: string } }> }, orcamento: { restante: number }): Promise<OPOperacao[] | null> {
  const pagInicial = paginaRoteiro(lines);
  if (pagInicial == null) return null;
  const pagFinal = Math.min(pagInicial + OCR_MAX_PAGINAS_ROTEIRO_POR_ORDEM - 1, ultimaPagina(lines));
  const roteiroTodo: OPOperacao[] = [];
  for (let p = pagInicial; p <= pagFinal && orcamento.restante > 0; p++) {
    let png: Buffer;
    try { png = await renderPaginaPng(renderCtx, p); } catch { break; }
    orcamento.restante--;
    let texto = '';
    try { const r = await worker.recognize(png); texto = r.data.text; } catch { break; }
    roteiroTodo.push(...parseRoteiroOcr(texto));
  }
  return roteiroTodo.length ? roteiroTodo : null;
}

export async function lerOP(buf: Buffer): Promise<OPLeitura> {
  const paginas = await extractDoc(buf);

  // Cifra POR FONTE (fontName). Cada página embaralhada usa a sua própria fonte;
  // derivar/aplicar por fonte evita a corrupção que um mapa global causava ao
  // misturar cifras de páginas diferentes.
  const maps = deriveFontMaps(paginas);
  // Fontes sem âncora (páginas de continuação do roteiro) herdam a cifra via o
  // cabeçalho do roteiro, alinhado por posição X a uma fonte já mapeada.
  propagarCabecalhoRoteiro(paginas, maps);

  // Camada por FORMA do glifo (fontes Type3, cifra por página). Reindexa os mapas
  // por-fonte pela forma do glifo e junta as páginas — assim uma letra aprendida
  // numa página vale pro documento inteiro. Inerte (vazia) quando não há Type3
  // (ex.: 013169), caso em que o decode é idêntico ao anterior.
  const tables = await extractType3Tables(buf);
  const shapeMap = buildShapeMap(paginas, maps, tables);

  // Decode: forma (Type3, global) tem prioridade; cai pra cifra por fonte; senão
  // identidade.
  const decItem = makeDecItem(maps, shapeMap, tables);

  // Decodifica cada linha uma vez, trecho a trecho, com o mapa da fonte de cada
  // trecho — todo o parsing downstream trabalha em cima de `line.dec`.
  for (const pg of paginas) for (const ln of pg.lines) ln.dec = ln.items.map(decItem).join('');

  // Confiança = legibilidade nativa do PDF (quantos glifos das âncoras já eram o
  // próprio caractere). Mantida por compatibilidade/telemetria; o gate da UI usa
  // `qualidade` (plausibilidade pós-decodificação).
  const todasEntradas = Object.values(maps).flatMap(m => Object.keys(m).map(k => m[k] === k));
  const confianca = todasEntradas.length ? todasEntradas.filter(Boolean).length / todasEntradas.length : 0;

  const grupos = agruparOrdens(paginas);
  const avisosGerais: string[] = [];
  // Worker de OCR: criado só na primeira ordem que precisar (a maioria das OPs
  // decodifica bem e nunca chega a usar isso) e reaproveitado entre ordens do
  // mesmo documento. `orcamento` limita o total de páginas renderizadas+OCR
  // nesta chamada, pra nunca estourar o tempo da função mesmo numa OP com
  // várias ordens ruins.
  let worker: Awaited<ReturnType<typeof import('tesseract.js').createWorker>> | null = null;
  let renderCtx: RenderCtx | null = null;
  const orcamentoOcr = { restante: OCR_MAX_PAGINAS_TOTAL };
  const ops: OPItem[] = [];
  for (const g of grupos) {
    const cabecalho = parseCabecalho(g.redbox);
    const produto = parseProduto(g.lines);
    const identificacao = parseIdentificacao(g.lines);
    const { materiais, roteiro } = parseBlocos(g.lines, decItem);
    const base = { cabecalho, produto, identificacao, materiais, roteiro, confianca, paginas: 0 };
    let { qualidade, validacao } = avaliar(base);
    // Gate: qualidade geral < 0.7 (igual ao "confira" que a tela já usa) —
    // mais confiável que checar só o código, porque uma OP embaralhada pode
    // ter código com CARA de número (dígitos, só que ERRADOS) e passar reto
    // num check que olhasse só isso; a nota combinada (código+descrição+
    // roteiro) pega esse caso. `materiais.length===0` entra sempre também,
    // porque avaliar() não pune falta de componente (pode ser legítimo, ex.
    // ordem de sub-item) — sem isso, uma ordem que TEM componentes mas não
    // achou (compIdx=-1 por decode ruim) passaria despercebida.
    const precisaMateriais = qualidade < 0.7 || materiais.length === 0;
    // Roteiro ruim = poucos setores batendo com o vocabulário conhecido (não
    // "roteiro.length===0" — uma ordem sem roteiro pode ser legítima, tipo um
    // sub-item; aqui o sinal é "tem roteiro mas ele não faz sentido").
    const setoresRoteiro = roteiro.map(o => (o.setorNome || o.setor || '').toUpperCase());
    const fracSetorOk = setoresRoteiro.length ? setoresRoteiro.filter(s => VOCAB_ROTEIRO.some(v => s.includes(v))).length / setoresRoteiro.length : 1;
    const precisaRoteiro = roteiro.length > 0 && fracSetorOk < 0.5;
    if ((precisaMateriais || precisaRoteiro) && orcamentoOcr.restante > 0) {
      const avisosOcr: string[] = [];
      try {
        if (!worker) {
          const { createWorker, OEM } = await import('tesseract.js');
          const path = await import('path');
          // Idioma local (não baixa da CDN a cada OP lida — ver next.config.js
          // pro tracing desses arquivos no deploy da Vercel). Pasta
          // "4.0.0_best_int" é a que casa com o modo LSTM_ONLY (padrão).
          const langPath = path.join(process.cwd(), 'node_modules', '@tesseract.js-data', 'por', '4.0.0_best_int');
          worker = await createWorker('por', OEM.LSTM_ONLY, { langPath, cachePath: '/tmp' });
        }
        if (!renderCtx) renderCtx = await carregarDocParaRender(buf);
        if (precisaMateriais) {
          const ocrMat = await tentarOcrMateriais(renderCtx, g.lines, worker, orcamentoOcr);
          if (ocrMat) {
            base.materiais = ocrMat;
            avisosOcr.push('Materiais lidos por OCR (imagem da página) — a decodificação normal não veio confiável nesta ordem.');
          }
        }
        if (precisaRoteiro && orcamentoOcr.restante > 0) {
          const ocrRot = await tentarOcrRoteiro(renderCtx, g.lines, worker, orcamentoOcr);
          if (ocrRot) {
            base.roteiro = ocrRot;
            avisosOcr.push('Roteiro lido por OCR (imagem da página) — a decodificação normal não veio confiável nesta ordem.');
          }
        }
      } catch { /* OCR indisponível ou falhou — mantém a leitura por cifra */ }
      if (avisosOcr.length) {
        const reavaliado = avaliar(base);
        qualidade = reavaliado.qualidade;
        validacao = { ...reavaliado.validacao, avisos: [...avisosOcr, ...reavaliado.validacao.avisos] };
      }
    }
    ops.push({ ...base, qualidade, validacao });
  }
  if (worker) await worker.terminate();
  const opsFiltrados = ops.filter(op => op.materiais.length || op.roteiro.length || op.cabecalho.pn);

  if (opsFiltrados.length === 0) avisosGerais.push('Nenhuma ordem identificada no PDF (confira se é uma OP do Totvs).');
  for (const op of opsFiltrados) for (const a of op.validacao.avisos) avisosGerais.push(`${op.cabecalho.ns || op.produto.codigo || 'ordem'}: ${a}`);

  return { ops: opsFiltrados, totalPaginas: paginas.length, avisos: avisosGerais };
}
