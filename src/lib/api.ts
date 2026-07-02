import axios from 'axios';
import { getToken, clearToken } from './auth';

const api = axios.create({ baseURL: '', withCredentials: true });

api.interceptors.request.use((config) => {
  // Cookie HttpOnly é enviado automaticamente via withCredentials
  // O header Authorization é mantido como fallback de compatibilidade
  const token = getToken();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (r) => r,
  async (error) => {
    if (error.response?.status === 401 && typeof window !== 'undefined') {
      clearToken();
      window.location.href = '/login';
      return Promise.reject(error);
    }
    // Retry automático em erros 5xx ou timeout de rede (1 tentativa extra)
    const cfg = error.config;
    if (!cfg || cfg._retried) return Promise.reject(error);
    const status = error.response?.status;
    const isNetworkErr = !error.response;
    if (isNetworkErr || (status && status >= 500)) {
      cfg._retried = true;
      await new Promise(r => setTimeout(r, 1200));
      return api(cfg);
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

// ── Itens ─────────────────────────────────────────────────────────────────────
export const getItem = (id: number) =>
  api.get(`/api/item/${id}`).then(r => r.data);

export const itemAcao = (id: number, acao: string, body?: Record<string, unknown>) =>
  api.post(`/api/item/${id}/acao/${acao}`, body || {}).then(r => r.data);

// ── Dashboard ─────────────────────────────────────────────────────────────────
export const getDashboard = () =>
  api.get('/api/dashboard').then(r => r.data);

// ── Setores ───────────────────────────────────────────────────────────────────
export const getSetorPainel = (setor: string) =>
  api.get(`/api/setor/${setor}`).then(r => r.data);

export const getSetores = () =>
  api.get('/api/setores').then(r => r.data);

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

// ── Cache helpers (no-op sem implementação de cache) ─────────────────────────
export const invalidateCache = (..._keys: string[]) => { /* sem cache no lado cliente */ };
