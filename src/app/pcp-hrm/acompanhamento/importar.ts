// Leitura da planilha do Alan no NAVEGADOR (não sobe o .xlsx pro servidor — a
// Vercel limita a requisição a 4,5 MB). Casa as colunas pelo NOME do cabeçalho
// (hrmAcomp.campoDaColuna); a linha inteira vai junto em `raw` pra nada se perder.
// xlsx carregado só na hora de ler (import dinâmico) — não pesa a abertura da tela.
import { campoDaColuna, chaveBase, etapaMarcada, normCab, txtHrm } from '@/lib/hrmAcomp';
import { normalizarCodigoCroqui, TIPOS_CROQUI, MAX_CROQUI } from '@/lib/croqui';

export interface LinhaPlanilha { chave: string; ordem: number; campos: Record<string, unknown>; etapas: string[]; raw: Record<string, unknown> }
export interface ExtraPlanilha { tipo: 'reprogramacao' | 'reuniao'; po: string; item: string; texto: string; material?: string | null; descricao?: string | null }
export interface CroquiPlanilha { codigo: string; codigo_norm: string; mime: string; bytes: Uint8Array; hash: string }
export interface LeituraPlanilha { linhas: LinhaPlanilha[]; extras: ExtraPlanilha[]; aba: string; avisos: string[]; croquis: CroquiPlanilha[] }

// Data do Excel → 'AAAA-MM-DD'. +12h: o SheetJS às vezes devolve meia-noite
// local ou UTC — somar meio dia deixa sempre no dia certo.
function iso(v: unknown): string | null {
  if (v instanceof Date && !isNaN(v.getTime())) return new Date(v.getTime() + 12 * 3600e3).toISOString().slice(0, 10);
  if (typeof v === 'string') {
    const m = v.trim().match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  }
  return null;
}
// Nomes um embaixo do outro na célula ("Gilson↵Douglas") → "Gilson / Douglas".
const UMA_LINHA = new Set(['caldeireiros', 'tinta', 'coordenador', 'destino', 'vendedor']);
const DATAS = new Set(['necessidade', 'conf_delv', 'prev_faturamento', 'prev_final', 'finalizado_em']);
const fmt = (s: string | null) => (s ? `${s.slice(8, 10)}/${s.slice(5, 7)}/${s.slice(0, 4)}` : '—');
function paraRaw(v: unknown): unknown {
  if (v instanceof Date) return iso(v);
  return v;
}

export async function lerPlanilhaHrm(arquivo: File): Promise<LeituraPlanilha> {
  const XLSX = await import('xlsx');
  const u8 = new Uint8Array(await arquivo.arrayBuffer());
  const wb = XLSX.read(u8, { cellDates: true, type: 'array' });
  const avisos: string[] = [];

  // Aba principal: a que tem a coluna "OP HRM" no cabeçalho.
  let abaPrincipal = '';
  let tabela: unknown[][] = [];
  let linhaCab = -1;
  for (const nome of wb.SheetNames) {
    const t = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[nome], { header: 1, raw: true, defval: null });
    const idx = t.slice(0, 10).findIndex(r => (r || []).some(c => normCab(c) === 'op hrm'));
    if (idx >= 0) { abaPrincipal = nome; tabela = t; linhaCab = idx; break; }
  }
  if (!abaPrincipal) throw new Error('Não achei a aba com a coluna "OP HRM". Confira se é a planilha de acompanhamento.');

  const cab = (tabela[linhaCab] || []).map(c => String(c ?? '').replace(/\s+/g, ' ').trim());
  const campoCol = cab.map(c => campoDaColuna(c));
  const linhas: LinhaPlanilha[] = [];
  const contagem = new Map<string, number>();

  for (let i = linhaCab + 1; i < tabela.length; i++) {
    const r = tabela[i] || [];
    if (!r.some(v => v !== null && String(v).trim() !== '')) continue;
    const campos: Record<string, unknown> = {};
    const etapas: string[] = [];
    const raw: Record<string, unknown> = {};
    r.forEach((v, j) => {
      if (v === null || String(v).trim() === '') return;
      const nomeCol = `${XLSX.utils.encode_col(j)} · ${cab[j] || 'sem título'}`;
      raw[nomeCol] = paraRaw(v);
      const campo = campoCol[j];
      if (!campo) return;
      if (campo.startsWith('etapa:')) { if (etapaMarcada(v)) etapas.push(campo.slice(6)); return; }
      if (DATAS.has(campo)) { const d = iso(v); if (d) campos[campo] = d; return; }
      if (campo === 'obs2') { campos.obs = [campos.obs, txtHrm(v)].filter(Boolean).join(' · '); return; }
      if (campo === 'obs' && campos.obs) { campos.obs = [txtHrm(v), campos.obs].filter(Boolean).join(' · '); return; }
      if (UMA_LINHA.has(campo)) { campos[campo] = txtHrm(String(v).split(/\r?\n/).map(s => s.trim()).filter(Boolean).join(' / ')); return; }
      campos[campo] = v instanceof Date ? iso(v) : txtHrm(v);
    });
    // Linha sem nada que identifique (ex.: só uma fórmula solta) → ignora.
    if (!campos.op_hrm && !campos.pedido_omie && !campos.material && !campos.po_item) continue;
    // Linha repetida idêntica na planilha (mesma OP+item) → "#2", "#3"… na ordem
    // em que aparece, pra nenhuma se perder e o próximo upload casar igual.
    const base = chaveBase(txtHrm(campos.op_hrm), txtHrm(campos.item), txtHrm(campos.pedido_omie), txtHrm(campos.material), txtHrm(campos.po_item));
    const n = (contagem.get(base) || 0) + 1;
    contagem.set(base, n);
    linhas.push({ chave: n > 1 ? `${base}#${n}` : base, ordem: i + 1, campos, etapas, raw });
  }
  const repetidas = Array.from(contagem.values()).filter(n => n > 1).length;
  if (repetidas) avisos.push(`${repetidas} OP/item aparece(m) mais de uma vez na planilha — cada repetição virou uma linha própria (#2, #3…).`);

  // Abas extras: reprogramação do cliente e comentários de reunião. Acha pelo
  // conteúdo (PO de 10 dígitos + item), não pelo nome da aba.
  const extras: ExtraPlanilha[] = [];
  for (const nome of wb.SheetNames) {
    if (nome === abaPrincipal) continue;
    const t = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[nome], { header: 1, raw: true, defval: null });
    const cabTxt = (t[0] || []).map(c => String(c ?? '')).join(' ');
    const reuniao = /coment/i.test(cabTxt);
    const dataReuniao = cabTxt.match(/em (\d{2}\/\d{2})/)?.[1];
    for (const r of t) {
      const cel = (r || []) as unknown[];
      const iPo = cel.findIndex(c => /^45\d{8}$/.test(String(c ?? '').trim()));
      if (iPo < 0 || cel[iPo + 1] == null) continue;
      const po = String(cel[iPo]).trim();
      const item = String(cel[iPo + 1]).trim();
      if (reuniao) {
        const coment = [...cel].reverse().find(c => typeof c === 'string' && c.trim().length > 3) as string | undefined;
        if (coment) extras.push({ tipo: 'reuniao', po, item, material: txtHrm(cel[0]), descricao: txtHrm(cel[1]), texto: `Reunião${dataReuniao ? ' ' + dataReuniao : ''}: ${coment.replace(/ /g, ' ').trim()}` });
      } else if (iPo === 0) {
        const material = txtHrm(cel[2]);
        const d1 = iso(cel[4]), d2 = iso(cel[5]);
        const resch = typeof cel[7] === 'string' ? cel[7] : '';
        const status = [...cel.slice(8)].reverse().find(c => typeof c === 'string') as string | undefined;
        const partes = [resch || 'Programação do cliente', material, `data ${fmt(d1)} → ${fmt(d2)}`, status].filter(Boolean);
        extras.push({ tipo: 'reprogramacao', po, item, material, descricao: txtHrm(cel[3]), texto: partes.join(' · ') });
      }
    }
  }

  let croquis: CroquiPlanilha[] = [];
  try {
    const rangeIni = XLSX.utils.decode_range(wb.Sheets[abaPrincipal]['!ref'] || 'A1').s.r;
    croquis = await lerCroquis(XLSX, u8, abaPrincipal, rangeIni, linhas);
  } catch (e) {
    console.warn('[planilha] croquis não lidos', e);
    avisos.push('Não consegui ler os desenhos (croquis) da planilha — os dados entram normalmente.');
  }

  return { linhas, extras, aba: abaPrincipal, avisos, croquis };
}

// ── Croquis: imagens ancoradas nas células da aba principal. O .xlsx é um ZIP;
// segue workbook → aba → drawing → media e liga cada imagem à LINHA onde está
// ancorada → código do material daquela linha (1 croqui por código).
type XlsxMod = typeof import('xlsx');
async function lerCroquis(XLSX: XlsxMod, u8: Uint8Array, aba: string, rangeIni: number, linhas: LinhaPlanilha[]): Promise<CroquiPlanilha[]> {
  const z = XLSX.CFB.read(u8, { type: 'array' });
  const dec = new TextDecoder();
  const arq = (caminho: string): Uint8Array | null => {
    const alvo = '/' + caminho.replace(/^\/+/, '');
    const i = z.FullPaths.findIndex((p: string) => p.endsWith(alvo));
    const c = i >= 0 ? z.FileIndex[i]?.content : null;
    return c ? (c instanceof Uint8Array ? c : Uint8Array.from(c as ArrayLike<number>)) : null;
  };
  const txt = (caminho: string) => { const b = arq(caminho); return b ? dec.decode(b) : ''; };
  const rels = (caminho: string) => {
    const m = new Map<string, string>();
    for (const r of Array.from(txt(caminho).matchAll(/<Relationship\s[^>]*>/g))) {
      const id = r[0].match(/Id="([^"]+)"/)?.[1]; const t = r[0].match(/Target="([^"]+)"/)?.[1];
      if (id && t) m.set(id, t);
    }
    return m;
  };
  const resolver = (base: string, alvo: string) => {
    if (alvo.startsWith('/')) return alvo.slice(1);
    const partes = base.split('/').slice(0, -1);
    for (const p of alvo.split('/')) { if (p === '..') partes.pop(); else if (p !== '.') partes.push(p); }
    return partes.join('/');
  };
  // <sheet name="Sheet1" sheetId="1" r:id="rId1"/> — acha a tag da aba pelo nome
  // (XML escapa &, <, >, " no nome).
  const nomeXml = aba.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const tagAba = Array.from(txt('xl/workbook.xml').matchAll(/<sheet\s[^>]*>/g)).map(m => m[0])
    .find(t => t.includes(`name="${nomeXml}"`));
  const rid = tagAba?.match(/r:id="([^"]+)"/)?.[1];
  if (!rid) return [];
  const planilhaXml = resolver('xl/workbook.xml', rels('xl/_rels/workbook.xml.rels').get(rid) || '');
  const relsAba = rels(planilhaXml.replace(/([^/]+)$/, '_rels/$1.rels'));
  const idDrawing = txt(planilhaXml).match(/<drawing\s[^>]*r:id="([^"]+)"/)?.[1];
  if (!idDrawing || !relsAba.get(idDrawing)) return [];
  const drawingXml = resolver(planilhaXml, relsAba.get(idDrawing)!);
  const relsDraw = rels(drawingXml.replace(/([^/]+)$/, '_rels/$1.rels'));
  const porOrdem = new Map(linhas.map(l => [l.ordem, l]));
  // 1º passo: quantas vezes cada imagem aparece nas linhas de cada material.
  // Quando uma linha tem 2 imagens (uma "vazou" da vizinha), vale a que mais se
  // repete nas linhas daquele material.
  const votos = new Map<string, { codigo: string; porMidia: Map<string, number> }>();
  const anchor = /<(?:\w+:)?(?:twoCellAnchor|oneCellAnchor)[\s>][\s\S]*?<\/(?:\w+:)?(?:twoCellAnchor|oneCellAnchor)>/g;
  for (const a of Array.from(txt(drawingXml).matchAll(anchor))) {
    const linhaExcel = Number(a[0].match(/<(?:\w+:)?from>[\s\S]*?<(?:\w+:)?row>(\d+)</)?.[1]);
    const emb = a[0].match(/r:embed="([^"]+)"/)?.[1];
    if (!Number.isFinite(linhaExcel) || !emb || !relsDraw.get(emb)) continue;
    const material = txtHrm(porOrdem.get(linhaExcel - rangeIni + 1)?.campos.material);
    const norm = normalizarCodigoCroqui(material);
    if (!material || !norm) continue;
    const midia = resolver(drawingXml, relsDraw.get(emb)!);
    const v = votos.get(norm) || { codigo: material, porMidia: new Map<string, number>() };
    v.porMidia.set(midia, (v.porMidia.get(midia) || 0) + 1);
    votos.set(norm, v);
  }
  const out = new Map<string, CroquiPlanilha>();
  const hashes = new Map<string, string>();
  for (const [norm, v] of Array.from(votos.entries())) {
    const midia = Array.from(v.porMidia.entries()).sort((x, y) => y[1] - x[1])[0][0];
    const ext = (midia.split('.').pop() || '').toLowerCase();
    const mime = ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : `image/${ext}`;
    if (!TIPOS_CROQUI.includes(mime)) continue;
    const bytes = arq(midia);
    if (!bytes || bytes.length > MAX_CROQUI) continue;
    let hash = hashes.get(midia);
    if (!hash) {
      const d = await crypto.subtle.digest('SHA-1', bytes as BufferSource);
      hash = Array.from(new Uint8Array(d)).map(b => b.toString(16).padStart(2, '0')).join('');
      hashes.set(midia, hash);
    }
    out.set(norm, { codigo: v.codigo, codigo_norm: norm, mime, bytes, hash });
  }
  return Array.from(out.values());
}
