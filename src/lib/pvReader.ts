// Leitor do PDF de PEDIDO DE VENDA do Omie ("Pedido de Venda Nº 25034"), pra
// preencher o "Lançar pedido" da Caldeiraria. Roda no NAVEGADOR: quem extrai o
// texto é o PDF.js (/public/pdfjs); aqui fica só a interpretação, pura, sobre as
// linhas já montadas (x/y de cada pedaço de texto) — dá pra testar em Node.
//
// Layout do Omie (modelo de 28/09/2026, PV 25034):
//   cabeçalho à direita = emitente (nome, CNPJ, endereço/cidade)
//   "Informações do Cliente" → próxima linha = razão social do cliente
//   "Itens do Pedido de Venda" → cabeçalho "Quantidade Código Descrição [...]"
//     linha de item: "4,00 PÇ" (x≈50) · código · descrição (x≈136) [· valores]
//     linhas seguintes só na coluna da descrição = detalhe do item
//   "Outras Informações" → Previsão de Faturamento, Vendedor, Nº do Pedido do
//     Cliente, Nº do Contrato… e depois texto livre (observações).
// Esse modelo NÃO traz valor; se vier coluna de valor unitário/total na linha
// do item, pega (1º número em R$ = unitário, último = total).

export interface PedacoPdf { x: number; y: number; s: string }
export interface PaginaPdf { pedacos: PedacoPdf[] }

export interface ItemPv { codigo: string; material: string; quantidade: number | null; unidade: string; valor_unitario: number | null; valor: number | null }
export interface LeituraPv {
  pedido: string | null;
  empresa: string | null;          // 'acosvital' | 'uberaba' | 'hrm'
  cliente: string | null;
  vendedor: string | null;
  prev_faturamento: string | null; // ISO
  pedido_cliente: string | null;
  obs: string | null;
  urgente: boolean;
  itens: ItemPv[];
  avisos: string[];
}

interface Linha { y: number; pag: number; cel: PedacoPdf[]; txt: string }

// Junta pedaços na mesma altura (tolerância de 2pt) → linhas de cima pra baixo.
function montarLinhas(paginas: PaginaPdf[]): Linha[] {
  const out: Linha[] = [];
  paginas.forEach((pg, pag) => {
    const porY: { y: number; cel: PedacoPdf[] }[] = [];
    for (const p of pg.pedacos) {
      if (!p.s || !p.s.trim()) continue;
      const g = porY.find(l => Math.abs(l.y - p.y) <= 2);
      if (g) g.cel.push(p); else porY.push({ y: p.y, cel: [p] });
    }
    porY.sort((a, b) => b.y - a.y).forEach(l => {
      const cel = l.cel.sort((a, b) => a.x - b.x);
      out.push({ y: l.y, pag, cel, txt: cel.map(c => c.s.trim()).join(' ').replace(/\s+/g, ' ').trim() });
    });
  });
  return out;
}

const numBR = (s: string): number | null => {
  const t = s.replace(/R\$|\s/g, '');
  if (!/^-?[\d.]+(,\d+)?$/.test(t)) return null;
  const n = Number(t.replace(/\./g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : null;
};
const dataISO = (s: string | undefined | null): string | null => {
  const m = (s || '').match(/(\d{2})\/(\d{2})\/(\d{4})/);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : null;
};
const UNID: Record<string, string> = { 'PÇ': 'pç', PC: 'pç', PCS: 'pç', UN: 'pç', UND: 'pç', KG: 'kg', M: 'm', MT: 'm', CJ: 'conj', CONJ: 'conj', M2: 'm²', 'M²': 'm²' };

// Linhas que se repetem em toda página (cabeçalho do emitente / rodapé).
const ehRodape = (t: string) => /^Gerado em \d{2}\/\d{2}\/\d{4}/i.test(t) || /^Página \d+ de \d+$/i.test(t);

export function interpretarPedidoVenda(paginas: PaginaPdf[]): LeituraPv {
  const linhas = montarLinhas(paginas);
  const avisos: string[] = [];
  const achar = (re: RegExp) => { for (const l of linhas) { const m = l.txt.match(re); if (m) return m; } return null; };

  const pedido = achar(/Pedido de Venda N[ºo°]\s*(\d+)/i)?.[1] ?? null;

  // Empresa emitente: cabeçalho da 1ª página ACIMA de "Informações do Cliente".
  const iCli = linhas.findIndex(l => /^Informações do Cliente/i.test(l.txt));
  const cab = linhas.slice(0, iCli > 0 ? iCli : 12).filter(l => l.pag === 0).map(l => l.txt).join(' ').toUpperCase();
  let empresa: string | null = null;
  if (/\bHRM\b/.test(cab)) empresa = 'hrm';
  else if (/UBERABA/.test(cab)) empresa = 'uberaba';
  else if (/23\.440\.235\/0001-08|MOGI DAS CRUZES|ACOS VITAL|AÇOS VITAL/.test(cab)) empresa = 'acosvital';
  if (!empresa) avisos.push('Não reconheci a empresa emitente — escolha manualmente.');

  const cliente = iCli >= 0 && linhas[iCli + 1] ? linhas[iCli + 1].txt : null;
  const vendedor = achar(/^Vendedor:\s*(.+)$/i)?.[1]?.trim() ?? null;
  const prev_faturamento = dataISO(achar(/Previsão de Faturamento:\s*(\S+)/i)?.[1]);
  const pedido_cliente = achar(/N[ºo°] do Pedido do Cliente:\s*(.+)$/i)?.[1]?.trim() ?? null;

  // ── Itens ──
  const itens: ItemPv[] = [];
  const iItens = linhas.findIndex(l => /^Itens do Pedido de Venda/i.test(l.txt));
  const iFimItens = linhas.findIndex((l, k) => k > iItens && /^Outras Informações/i.test(l.txt));
  if (iItens >= 0) {
    let xDesc = 0, pagUlt = -1;
    for (let k = iItens + 1; k < (iFimItens > 0 ? iFimItens : linhas.length); k++) {
      const l = linhas[k];
      if (ehRodape(l.txt)) continue;
      if (/^Quantidade\b.*Descri/i.test(l.txt)) {       // cabeçalho da tabela (repete por página)
        xDesc = l.cel.find(c => /Descri/i.test(c.s))?.x ?? xDesc;
        continue;
      }
      const m = l.txt.match(/^(\d[\d.]*,\d+)\s+([A-ZÇ²]{1,4})\s+(\S+)\s+(.+)$/i);
      if (m) {
        // Valores (se houver): números BR no FIM da linha, depois da descrição.
        const partes = m[4].split(' ');
        const nums: number[] = [];
        while (partes.length > 1) {
          // Só número com vírgula decimal (formato de dinheiro) — "RC 24" é descrição.
          const tok = partes[partes.length - 1];
          const v = /^[\d.]+,\d+$/.test(tok.replace(/^R\$/, '')) ? numBR(tok) : null;
          if (v === null) { if (partes[partes.length - 1] === 'R$') { partes.pop(); continue; } break; }
          nums.unshift(v); partes.pop();
        }
        const q = numBR(m[1]);
        itens.push({
          codigo: m[3],
          material: partes.join(' ').trim(),
          quantidade: q && q > 0 ? q : null,
          unidade: UNID[m[2].toUpperCase()] || 'pç',
          valor_unitario: nums.length ? nums[0] : null,
          valor: nums.length > 1 ? nums[nums.length - 1] : null,
        });
        pagUlt = l.pag;
        continue;
      }
      // Continuação da descrição (só na coluna da descrição) → detalhe do item.
      // Só na MESMA página do item: na página seguinte vem o cabeçalho do
      // emitente (CNPJ, endereço…), que não é detalhe.
      const ult = itens[itens.length - 1];
      if (ult && l.pag === pagUlt && l.cel[0] && l.cel[0].x >= (xDesc || 100) - 8) {
        ult.material = `${ult.material} — ${l.txt}`.slice(0, 200);
      }
    }
  }
  const semQtd = itens.filter(i => i.quantidade === null).length;
  if (semQtd) avisos.push(`${semQtd} item(ns) com quantidade 0 no PDF — vieram sem quantidade; confira ou remova antes de lançar.`);
  if (!itens.length) avisos.push('Não encontrei itens no PDF.');

  // ── Observações: texto livre depois dos campos de "Outras Informações" ──
  let obs: string | null = null;
  const iOutras = linhas.findIndex(l => /^Outras Informações/i.test(l.txt));
  if (iOutras >= 0) {
    const campo = /^(Pedido de Venda - incluído|Previsão de Faturamento|Vendedor|Projeto|N[ºo°] do Pedido do Cliente|N[ºo°] do Contrato)/i;
    const livres = linhas.slice(iOutras + 1).filter(l => !ehRodape(l.txt) && !campo.test(l.txt)
      && !cab.includes(l.txt.toUpperCase()) && !/^Pedido de Venda N/i.test(l.txt)).map(l => l.txt);
    const partes = [pedido_cliente ? `Pedido do cliente: ${pedido_cliente}` : '', ...livres].filter(Boolean);
    obs = partes.join(' · ').slice(0, 1000) || null;
  }
  const urgente = /URGEN|EMERG/i.test(obs || '');

  return { pedido, empresa, cliente, vendedor, prev_faturamento, pedido_cliente, obs, urgente, itens, avisos };
}

// Extrai as páginas com o PDF.js já carregado (window.pdfjsLib no navegador).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function extrairPaginasPdf(pdfjs: any, data: ArrayBuffer): Promise<PaginaPdf[]> {
  const doc = await pdfjs.getDocument({ data, isEvalSupported: false }).promise;
  const paginas: PaginaPdf[] = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const tc = await (await doc.getPage(p)).getTextContent();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    paginas.push({ pedacos: tc.items.map((it: any) => ({ x: it.transform[4], y: it.transform[5], s: it.str })) });
  }
  return paginas;
}
