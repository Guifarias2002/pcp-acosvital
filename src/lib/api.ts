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
  api.post(`/api/item/${id}/acao/${acao}`, body || {}).then(r => r.data);

export const adicionarObservacaoItem = (id: number, texto: string) =>
  api.post(`/api/item/${id}/observacao`, { texto }).then(r => r.data);

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
  api.post(`/api/lote/${loteId}/${acao}`).then(r => r.data);

// ── Parciais ──────────────────────────────────────────────────────────────────
export const getParcial = (id: number) =>
  api.get(`/api/parcial/${id}`).then(r => r.data);

export const parcialAcao = (id: number, acao: string, body?: Record<string, unknown>) =>
  api.post(`/api/parcial/${id}/acao/${acao}`, body || {}).then(r => r.data);

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
    const r = await api.post(`/api/parcial/lote/${acao}`, { ids: pedaco, ...(body || {}) }).then(res => res.data as ResultadoLote);
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
