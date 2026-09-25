// Regra única (Anexar OP + Conferência) pra saber se um material lido da OP é
// o PRÓPRIO PRODUTO (o projeto) e não um componente. Vale pra qualquer OP
// (Totvs ou Omie) e qualquer material. Sem dependências — roda no navegador.

interface CodDesc { codigo?: string | null; descricao?: string | null }

// Código comparável: maiúsculas, só letras/números, sem zeros à esquerda.
// "010.288-974" → "10288974".
function normCodigo(s?: string | null): string {
  return String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '').replace(/^0+(?=.)/, '');
}

// Descrição comparável: sem acento, maiúsculas, pontuação vira espaço, espaços únicos.
function normDescricao(s?: string | null): string {
  return String(s || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim();
}

/** true quando `m` é o próprio produto da ordem (e não um componente):
 *  - código igual ao do produto (ignorando caixa, pontuação e zeros à esquerda); ou
 *  - descrição igual à do produto; ou
 *  - descrição do material começa com o código do produto ("10288974 7IN VXT…").
 *  Códigos/descrições muito curtos não contam (evita casar por acaso). */
export function ehProdutoDaOp(produto: CodDesc | null | undefined, m: CodDesc): boolean {
  if (!produto) return false;
  const pCod = normCodigo(produto.codigo);
  const mCod = normCodigo(m.codigo);
  if (pCod.length >= 3 && mCod === pCod) return true;

  const pDesc = normDescricao(produto.descricao);
  const mDesc = normDescricao(m.descricao);
  if (pDesc.length >= 5 && mDesc === pDesc) return true;

  if (pCod.length >= 3 && mDesc) {
    const primeiro = mDesc.split(' ')[0];
    if (normCodigo(primeiro) === pCod) return true;
  }
  return false;
}

// Qtd. de estruturas/projetos informada na Anexar OP — só INFORMATIVA (não é a
// quantidade do produto). Gravada como linha "<rótulo>: N" nas observações do
// pedido; a Conferência lê de volta com qtdEstruturasDasObservacoes.
export const ROTULO_QTD_ESTRUTURAS = 'Qtd. de estruturas/projetos';
export function qtdEstruturasDasObservacoes(observacoes?: string | null): number | null {
  const linha = String(observacoes || '').split('\n').find(l => l.trim().startsWith(`${ROTULO_QTD_ESTRUTURAS}:`));
  const n = linha ? parseInt(linha.split(':')[1], 10) : NaN;
  return n > 0 ? n : null;
}
