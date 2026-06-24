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
  api.get('/api/pedidos', { params }).then(r => r.data);

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
