// Croqui (miniatura do desenho) do produto — 1 imagem por CÓDIGO DE MATERIAL,
// serve pra todos os itens/pedidos daquele código. Vem da coluna "Croqui" da
// planilha de acompanhamento do Alan (ou é anexado à mão). Arquivo no B2
// (fora do egress do Supabase); tabela producao_croqui (M65).
// Compartilhado cliente/servidor.

/** Código → chave do croqui. Tira espaços extras e a revisão no fim
 *  ("10398991 R00" → "10398991"): revisão nova substitui o croqui do código.
 *  A MESMA regra existe em SQL em SQL_CODIGO_CROQUI — mudar os dois juntos. */
export function normalizarCodigoCroqui(codigo: string | null | undefined): string {
  return String(codigo ?? '').trim().replace(/\s+/g, ' ').replace(/ R\d{1,2}$/i, '').toUpperCase();
}

/** Mesma normalização em SQL (recebe a expressão da coluna). */
export const SQL_CODIGO_CROQUI = (col: string) =>
  `upper(regexp_replace(regexp_replace(btrim(${col}), '\\s+', ' ', 'g'), ' [Rr][0-9]{1,2}$', ''))`;

export const TIPOS_CROQUI = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];
export const MAX_CROQUI = 5 * 1024 * 1024;

/** URL da imagem (o <img> não manda header → token na query, igual aos anexos). */
export function urlCroqui(codigo: string, token: string, versao?: string | null): string {
  const q = new URLSearchParams({ token });
  if (versao) q.set('v', versao);
  return `/api/croqui/${encodeURIComponent(normalizarCodigoCroqui(codigo))}?${q.toString()}`;
}
