import axios from 'axios';
import { getToken, clearToken } from './auth';

const api = axios.create({ baseURL: '', withCredentials: true, timeout: 35000 }); // 35s — acima do maxDuration de 30s da Vercel (temporario, ver vercel.json)

api.interceptors.request.use((config) => {
  // Cookie HttpOnly é enviado automaticamente via withCredentials
  // O header Authorization é mantido como fallback de compatibilidade
  const token = getToken();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (r) => r,
  (error) => {
    if (error.response?.status === 401 && typeof window !== 'undefined') {
      clearToken();
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

export { api };
export default api;

// ── Proteção contra duplicação por internet instável ────────────────────────
// Duas camadas no cliente, complementadas pela idempotência do servidor
// (src/lib/idempotencia.ts):
//   1) Requisições idênticas CONCORRENTES (toque duplo no mobile antes do botão
//      desabilitar) compartilham a MESMA promise → sai uma requisição só.
//   2) Um reenvio manual da MESMA ação dentro de uma janela curta reusa a mesma
//      Idempotency-Key → o servidor devolve o resultado anterior em vez de
//      executar de novo (cobre "servidor processou, mas a resposta se perdeu").
const JANELA_CHAVE_MS = 20_000;
const emVoo = new Map<string, Promise<unknown>>();
const chavePorAssinatura = new Map<string, { chave: string; ts: number }>();

function stableStringify(v: unknown): string {
  if (v === null || typeof v !== 'object') return JSON.stringify(v);
  if (Array.isArray(v)) return `[${v.map(stableStringify).join(',')}]`;
  const obj = v as Record<string, unknown>;
  return `{${Object.keys(obj).sort().map(k => `${JSON.stringify(k)}:${stableStringify(obj[k])}`).join(',')}}`;
}

function novaChave(): string {
  const c = (globalThis as { crypto?: Crypto }).crypto;
  if (c?.randomUUID) return c.randomUUID();
  return `k-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

function chaveParaAssinatura(sig: string): string {
  const agora = Date.now();
  const prev = chavePorAssinatura.get(sig);
  if (prev && agora - prev.ts < JANELA_CHAVE_MS) { prev.ts = agora; return prev.chave; }
  const chave = novaChave();
  chavePorAssinatura.set(sig, { chave, ts: agora });
  // Poda preguiçosa das assinaturas expiradas para o mapa não crescer sem fim.
  if (chavePorAssinatura.size > 200) {
    chavePorAssinatura.forEach((val, k) => { if (agora - val.ts >= JANELA_CHAVE_MS) chavePorAssinatura.delete(k); });
  }
  return chave;
}

// POST de mutação protegido. Use SEMPRE que a ação altera estado no servidor.
export async function postIdempotente<T = unknown>(url: string, body?: Record<string, unknown>): Promise<T> {
  const sig = `${url}|${stableStringify(body ?? {})}`;
  const existente = emVoo.get(sig);
  if (existente) return existente as Promise<T>;   // toque duplo → mesma promise

  const chave = chaveParaAssinatura(sig);
  const p = api.post(url, body || {}, { headers: { 'Idempotency-Key': chave } })
    .then(r => r.data as T)
    .finally(() => { emVoo.delete(sig); });
  emVoo.set(sig, p);
  return p;
}

// ── Pedidos ───────────────────────────────────────────────────────────────────
export const getPedidos = (params?: Record<string, string>) =>
  api.get('/api/pedidos', { params }).then(r => {
    // suporta resposta paginada { pedidos, page, total, pages } e legacy array
    const d = r.data;
    return Array.isArray(d) ? { pedidos: d, page: 1, total: d.length, pages: 1 } : d;
  });

export const getPedido = (id: number) =>
  api.get(`/api/pedidos/${id}`).then(r => r.data);

export const criarPedido = (data: unknown) =>
  api.post('/api/pedidos', data).then(r => r.data);

export const editarPedido = (id: number, data: unknown) =>
  api.patch(`/api/pedidos/${id}`, data).then(r => r.data);

export const getUltimoRoteiro = () =>
  api.get('/api/pedidos/ultimo-roteiro').then(r => r.data);

// ── Itens ─────────────────────────────────────────────────────────────────────
export const getItem = (id: number) =>
  api.get(`/api/item/${id}`).then(r => r.data);

export const itemAcao = (id: number, acao: string, body?: Record<string, unknown>) =>
  postIdempotente(`/api/item/${id}/acao/${acao}`, body || {});

export const adicionarObservacaoItem = (id: number, texto: string) =>
  api.post(`/api/item/${id}/observacao`, { texto }).then(r => r.data);

// Inativa/reativa um item (admin only). Item inativo some das telas do operador
// e aparece cinza para o admin. `motivo` é opcional.
export const inativarItem = (id: number, inativo: boolean, motivo?: string) =>
  api.post(`/api/item/${id}/inativar`, { inativo, motivo }).then(r => r.data);

// Entrega o PEDIDO COMPLETO a partir da Logística (sem NF; comprovada por
// canhoto). `idempotencyKey` deve ser estável por tentativa do mesmo modal —
// gere uma vez ao abrir e reuse no reenvio para o servidor deduplicar.
export const entregarPedido = (
  pedidoId: number,
  canhotos: File[],
  observacao: string,
  idempotencyKey: string,
) => {
  const fd = new FormData();
  for (const f of canhotos) fd.append('canhotos', f);
  fd.append('observacao', observacao || '');
  return api.post(`/api/pedidos/${pedidoId}/entregar`, fd, {
    headers: { 'Idempotency-Key': idempotencyKey },
  }).then(r => r.data);
};

// ── Dashboard ─────────────────────────────────────────────────────────────────
export const getDashboard = () =>
  api.get('/api/dashboard').then(r => r.data);

// ── Setores ───────────────────────────────────────────────────────────────────
export const getSetorPainel = (setor: string) =>
  api.get(`/api/setor/${setor}`).then(r => r.data);

// ── Emitidos / Entregues ──────────────────────────────────────────────────────
export const getEmitidos = (params?: Record<string, string>) =>
  api.get('/api/emitidos', { params }).then(r => r.data);

export const getEntregues = (params?: Record<string, string>) =>
  api.get('/api/entregues', { params }).then(r => r.data);

// ── Lotes ─────────────────────────────────────────────────────────────────────
export const loteAcao = (loteId: number, acao: 'receber' | 'finalizar') =>
  postIdempotente(`/api/lote/${loteId}/${acao}`);

// ── Parciais ──────────────────────────────────────────────────────────────────
export const getParcial = (id: number) =>
  api.get(`/api/parcial/${id}`).then(r => r.data);

export const parcialAcao = (id: number, acao: string, body?: Record<string, unknown>) =>
  postIdempotente(`/api/parcial/${id}/acao/${acao}`, body || {});

// Salva o peso da embalagem (lista de pesos por pallet, em kg) de uma parcial,
// junto do nome/número de identificação de cada pallet (alinhado por índice).
export const setPesosPallets = (id: number, pesos_pallets: number[], nomes_pallets: string[] = []) =>
  api.patch(`/api/parcial/${id}`, { pesos_pallets, nomes_pallets }).then(r => r.data);

// Salva o resumo consolidado da Embalagem por pedido (opcional).
export const setEmbalagemResumo = (
  pedidoId: number,
  resumo: { identificacao?: string; qtd_pallets?: number | null; peso_total?: number | null; total_unidades?: number | null },
) => api.patch(`/api/pedidos/${pedidoId}/embalagem`, resumo).then(r => r.data);

// Mesma acao aplicada a varias parciais numa unica requisicao (evita 1 round-trip por item).
// A rota aceita no maximo 50 ids por chamada - grupos maiores sao divididos em pedacos
// e enviados em sequencia, com os resultados combinados como se fosse uma chamada so.
type ResultadoLote = {
  ok: boolean; total: number; sucesso: number; falhas: number;
  resultados: Array<{ id: number; ok: boolean; erro?: string }>;
};
const MAX_IDS_POR_CHAMADA = 50;
export const parcialAcaoLote = async (ids: number[], acao: string, body?: Record<string, unknown>): Promise<ResultadoLote> => {
  const pedacos: number[][] = [];
  for (let i = 0; i < ids.length; i += MAX_IDS_POR_CHAMADA) pedacos.push(ids.slice(i, i + MAX_IDS_POR_CHAMADA));

  const combinado: ResultadoLote = { ok: true, total: 0, sucesso: 0, falhas: 0, resultados: [] };
  for (const pedaco of pedacos) {
    const r = await postIdempotente<ResultadoLote>(`/api/parcial/lote/${acao}`, { ids: pedaco, ...(body || {}) });
    combinado.total += r.total;
    combinado.sucesso += r.sucesso;
    combinado.falhas += r.falhas;
    combinado.resultados.push(...r.resultados);
  }
  combinado.ok = combinado.falhas === 0;
  return combinado;
};

// ── Cache helpers (no-op sem implementação de cache) ─────────────────────────
export const invalidateCache = (..._keys: string[]) => { /* sem cache no lado cliente */ };
