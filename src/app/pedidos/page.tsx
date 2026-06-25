'use client';
import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import AuthGuard from '@/components/AuthGuard';
import { getPedidos } from '@/lib/api';
import { getToken } from '@/lib/auth';
import { Pedido, STATUS_LABELS, getPedidoEtapa, ETAPA_LABELS } from '@/lib/types';
import { getUser } from '@/lib/auth';
import Link from 'next/link';

function fmtData(s: string) {
  if (!s) return '—';
  const d = new Date(s);
  if (isNaN(d.getTime())) return s;
  return d.toLocaleDateString('pt-BR');
}

const PRIORIDADE_BADGE: Record<string, string> = {
  baixa: 'badge-baixa', normal: 'badge-normal', alta: 'badge-alta', urgente: 'badge-urgente',
};

interface ModalExcluir { id: number; numero: string; motivo: string; loading: boolean; }
interface ModalExcluirLote { ids: number[]; motivo: string; loading: boolean; }

export default function PedidosPage() {
  return (
    <Suspense fallback={null}>
      <PedidosPageInner />
    </Suspense>
  );
}

function PedidosPageInner() {
  const searchParams = useSearchParams();
  const etapaParam = searchParams.get('etapa');

  const [pedidos, setPedidos] = useState<Pedido[]>([]);
  const [loading, setLoading] = useState(true);
  const [fBusca, setFBusca] = useState('');
  const [fStatus, setFStatus] = useState('');
  const [fPrioridade, setFPrioridade] = useState('');
  const [fEtapa, setFEtapa] = useState(etapaParam || '');
  const [modalExcluir, setModalExcluir] = useState<ModalExcluir | null>(null);
  const [modalExcluirLote, setModalExcluirLote] = useState<ModalExcluirLote | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const _u = getUser();
  const isAdmin = _u?.is_staff;
  const isSuperAdmin = _u?.perfil === 'administrador' || (_u?.is_staff && _u?.perfil !== 'pcp' && _u?.perfil !== 'lider');

  function buscar() {
    setLoading(true);
    setSelectedIds(new Set());
    const params: Record<string, string> = { cliente: fBusca, status: fStatus, prioridade: fPrioridade, entregue: '1' };
    if (fEtapa === 'entregue') params.entregue = '1';
    getPedidos(params).then(setPedidos).catch(() => {}).finally(() => setLoading(false));
  }

  useEffect(() => { buscar(); }, []);

  const pedidosFiltrados = pedidos.filter(p => !fEtapa || getPedidoEtapa(p) === fEtapa);
  const todosSelected = pedidosFiltrados.length > 0 && pedidosFiltrados.every(p => selectedIds.has(p.id));

  function toggleAll() {
    if (todosSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(pedidosFiltrados.map(p => p.id)));
    }
  }

  function toggleOne(id: number) {
    setSelectedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  async function confirmarExcluir() {
    if (!modalExcluir) return;
    setModalExcluir(m => m ? { ...m, loading: true } : null);
    try {
      const token = getToken();
      const res = await fetch(`/api/pedidos/${modalExcluir.id}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ motivo: modalExcluir.motivo }),
      });
      const data = await res.json();
      if (!res.ok) { alert((data.detalhe || data.erro) || 'Erro ao excluir'); return; }
      setModalExcluir(null);
      buscar();
    } catch {
      alert('Erro ao excluir pedido.');
    } finally {
      setModalExcluir(m => m ? { ...m, loading: false } : null);
    }
  }

  async function confirmarExcluirLote() {
    if (!modalExcluirLote) return;
    setModalExcluirLote(m => m ? { ...m, loading: true } : null);
    const token = getToken();
    const erros: number[] = [];
    for (const id of modalExcluirLote.ids) {
      try {
        const res = await fetch(`/api/pedidos/${id}`, {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ motivo: modalExcluirLote.motivo }),
        });
        if (!res.ok) erros.push(id);
      } catch {
        erros.push(id);
      }
    }
    setModalExcluirLote(null);
    if (erros.length > 0) alert(`${erros.length} pedido(s) não puderam ser excluídos.`);
    buscar();
  }

  return (
    <AuthGuard>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
        <h4 style={{ margin: 0, fontWeight: 700, color: '#1a3a5c' }}>
          <i className="bi bi-list-ul" style={{ marginRight: 8 }}></i>Pedidos de Venda
        </h4>
        <div style={{ display: 'flex', gap: 8 }}>
          <button style={{
            border: '1px solid #198754', color: '#198754', background: 'none',
            borderRadius: 5, padding: '5px 14px', fontSize: 12, cursor: 'pointer',
          }}>
            <i className="bi bi-file-earmark-excel" style={{ marginRight: 4 }}></i>Excel
          </button>
          {isSuperAdmin && (
            <Link href="/pedidos/novo" style={{
              background: '#1a3a5c', color: '#fff', padding: '6px 16px',
              borderRadius: 5, textDecoration: 'none', fontSize: 13, fontWeight: 600,
            }}>
              <i className="bi bi-plus-lg" style={{ marginRight: 4 }}></i>Nova Ordem
            </Link>
          )}
        </div>
      </div>

      {/* Filtros */}
      <div className="card" style={{ padding: '12px 16px', marginBottom: 16, display: 'flex', gap: 8, alignItems: 'center' }}>
        <input value={fBusca} onChange={e => setFBusca(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && buscar()}
          placeholder="Buscar por pedido, cliente, OP..."
          style={{ border: '1px solid #dee2e6', borderRadius: 5, padding: '5px 10px', fontSize: 13, flex: 1 }} />
        <select value={fStatus} onChange={e => setFStatus(e.target.value)}
          style={{ border: '1px solid #dee2e6', borderRadius: 5, padding: '5px 8px', fontSize: 13 }}>
          <option value="">Todos os status</option>
          {Object.entries(STATUS_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
        <select value={fPrioridade} onChange={e => setFPrioridade(e.target.value)}
          style={{ border: '1px solid #dee2e6', borderRadius: 5, padding: '5px 8px', fontSize: 13 }}>
          <option value="">Todas prioridades</option>
          {['baixa','normal','alta','urgente'].map(p => (
            <option key={p} value={p}>{p.charAt(0).toUpperCase()+p.slice(1)}</option>
          ))}
        </select>
        <button onClick={buscar} style={{
          background: '#1a3a5c', color: '#fff', border: 'none',
          borderRadius: 5, padding: '5px 16px', fontSize: 13, cursor: 'pointer', fontWeight: 600,
        }}>
          <i className="bi bi-search" style={{ marginRight: 4 }}></i>Filtrar
        </button>
        <button onClick={() => { setFBusca(''); setFStatus(''); setFPrioridade(''); setFEtapa(''); }}
          style={{ border: '1px solid #dee2e6', background: 'none', borderRadius: 5, padding: '5px 12px', fontSize: 13, cursor: 'pointer', color: '#666' }}>
          Limpar
        </button>
      </div>

      {/* Banner etapa ativa */}
      {fEtapa && (
        <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 8, padding: '10px 16px', marginBottom: 12, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: 13, color: '#1d4ed8', fontWeight: 600 }}>
            <i className="bi bi-funnel-fill" style={{ marginRight: 8 }} />
            Filtrando: <strong>{ETAPA_LABELS[fEtapa as keyof typeof ETAPA_LABELS] || fEtapa}</strong>
          </span>
          <button onClick={() => setFEtapa('')}
            style={{ background: 'none', border: '1px solid #93c5fd', borderRadius: 5, padding: '3px 12px', fontSize: 12, color: '#1d4ed8', cursor: 'pointer' }}>
            ✕ Limpar
          </button>
        </div>
      )}

      {/* Barra de seleção em lote */}
      {selectedIds.size > 0 && (
        <div style={{
          background: '#1a3a5c', color: '#fff', borderRadius: 8, padding: '10px 16px',
          marginBottom: 12, display: 'flex', alignItems: 'center', gap: 16,
        }}>
          <span style={{ fontSize: 13, fontWeight: 600 }}>
            <i className="bi bi-check2-square" style={{ marginRight: 8 }}></i>
            {selectedIds.size} pedido{selectedIds.size > 1 ? 's' : ''} selecionado{selectedIds.size > 1 ? 's' : ''}
          </span>
          <div style={{ flex: 1 }} />
          {isAdmin && (
            <button
              onClick={() => setModalExcluirLote({ ids: Array.from(selectedIds), motivo: '', loading: false })}
              style={{ background: '#dc3545', color: '#fff', border: 'none', borderRadius: 5, padding: '5px 16px', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
              <i className="bi bi-trash" style={{ marginRight: 6 }}></i>Excluir selecionados
            </button>
          )}
          <button onClick={() => setSelectedIds(new Set())}
            style={{ background: 'none', border: '1px solid rgba(255,255,255,.4)', color: '#fff', borderRadius: 5, padding: '5px 12px', fontSize: 13, cursor: 'pointer' }}>
            Cancelar
          </button>
        </div>
      )}

      {/* Tabela */}
      <div className="card" style={{ overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ background: '#212529', color: '#fff' }}>
              <th style={{ padding: '9px 12px', width: 36 }}>
                <input
                  type="checkbox"
                  checked={todosSelected}
                  onChange={toggleAll}
                  style={{ cursor: 'pointer', width: 15, height: 15, accentColor: '#4dabf7' }}
                  title="Selecionar todos"
                />
              </th>
              {['Pedido','OP','Cliente','Setor Atual','Status','Prioridade','Prazo','Ações'].map(h => (
                <th key={h} style={{ padding: '9px 12px', textAlign: 'left', fontWeight: 600, fontSize: 12 }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td colSpan={9} style={{ textAlign: 'center', padding: 40, color: '#999' }}>Carregando...</td></tr>
            )}
            {!loading && pedidosFiltrados.length === 0 && (
              <tr><td colSpan={9} style={{ textAlign: 'center', padding: 40, color: '#999' }}>Nenhum pedido encontrado.</td></tr>
            )}
            {pedidosFiltrados.map(p => {
              const selected = selectedIds.has(p.id);
              return (
                <tr key={p.id} style={{
                  borderBottom: '1px solid #f0f0f0',
                  background: selected ? '#eff6ff' : p.atrasado ? '#fff8f8' : undefined,
                }}>
                  <td style={{ padding: '8px 12px' }}>
                    <input
                      type="checkbox"
                      checked={selected}
                      onChange={() => toggleOne(p.id)}
                      style={{ cursor: 'pointer', width: 15, height: 15, accentColor: '#1a3a5c' }}
                    />
                  </td>
                  <td style={{ padding: '8px 12px' }}>
                    <Link href={`/pedidos/${p.id}`} style={{ color: '#1a3a5c', fontWeight: 700, textDecoration: 'none' }}>{p.numero_pedido_venda}</Link>
                  </td>
                  <td style={{ padding: '8px 12px', color: '#666' }}>{p.numero_op}</td>
                  <td style={{ padding: '8px 12px', color: '#444' }}>{p.cliente}</td>
                  <td style={{ padding: '8px 12px' }}>
                    <span style={{ background: '#343a40', color: '#fff', fontSize: 11, padding: '2px 8px', borderRadius: 4 }}>
                      {p.nome_setor_atual}
                    </span>
                  </td>
                  <td style={{ padding: '8px 12px' }}>
                    <span style={{
                      fontSize: 11, padding: '2px 8px', borderRadius: 4, fontWeight: 600,
                      background: p.cor_status === 'success' ? '#d1e7dd' : p.cor_status === 'primary' ? '#cfe2ff' : p.cor_status === 'info' ? '#cff4fc' : '#e2e3e5',
                      color: '#333',
                    }}>
                      {STATUS_LABELS[p.status]}
                    </span>
                  </td>
                  <td style={{ padding: '8px 12px' }}>
                    <span className={PRIORIDADE_BADGE[p.prioridade] || 'badge-normal'}
                      style={{ fontSize: 11, padding: '2px 8px', borderRadius: 4 }}>
                      {p.prioridade?.charAt(0).toUpperCase()+p.prioridade?.slice(1)}
                    </span>
                  </td>
                  <td style={{ padding: '8px 12px', color: p.atrasado ? '#dc3545' : '#555', fontWeight: p.atrasado ? 700 : 400, fontSize: 12 }}>
                    {fmtData(p.prazo_entrega)}
                  </td>
                  <td style={{ padding: '8px 12px' }}>
                    <div style={{ display: 'flex', gap: 4 }}>
                      <Link href={`/pedidos/${p.id}`} title="Ver"
                        style={{ border: '1px solid #0d6efd', color: '#0d6efd', borderRadius: 4, padding: '2px 8px', textDecoration: 'none', fontSize: 13 }}>
                        <i className="bi bi-eye"></i>
                      </Link>
                      <Link href={`/pedidos/${p.id}/editar`} title="Editar"
                        style={{ border: '1px solid #6c757d', color: '#6c757d', borderRadius: 4, padding: '2px 8px', textDecoration: 'none', fontSize: 13 }}>
                        <i className="bi bi-pencil"></i>
                      </Link>
                      {isAdmin && (
                        <button title="Excluir" onClick={() => setModalExcluir({ id: p.id, numero: p.numero_pedido_venda, motivo: '', loading: false })}
                          style={{ border: '1px solid #dc3545', color: '#dc3545', borderRadius: 4, padding: '2px 8px', background: 'none', cursor: 'pointer', fontSize: 13 }}>
                          <i className="bi bi-trash"></i>
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Modal excluir individual */}
      {modalExcluir && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)', zIndex: 1000,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <div className="card" style={{ padding: 28, maxWidth: 440, width: '90%' }}>
            <h5 style={{ margin: '0 0 4px', color: '#dc3545', fontWeight: 700 }}>
              <i className="bi bi-exclamation-triangle" style={{ marginRight: 8 }}></i>Excluir Pedido
            </h5>
            <p style={{ margin: '12px 0 4px', fontSize: 14, color: '#333' }}>
              Tem certeza que deseja excluir o pedido <strong>{modalExcluir.numero}</strong>?
            </p>
            <p style={{ margin: '0 0 16px', fontSize: 12, color: '#666' }}>
              Esta ação não pode ser desfeita. O pedido será registrado no log de excluídos.
            </p>
            <label style={{ fontSize: 12, fontWeight: 600, color: '#444', display: 'block', marginBottom: 4 }}>
              Motivo (opcional):
            </label>
            <input
              value={modalExcluir.motivo}
              onChange={e => setModalExcluir(m => m ? { ...m, motivo: e.target.value } : null)}
              placeholder="Ex: Pedido duplicado, cancelado pelo cliente..."
              style={{ width: '100%', border: '1px solid #dee2e6', borderRadius: 5, padding: '6px 10px', fontSize: 13, marginBottom: 16, boxSizing: 'border-box' }}
            />
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button onClick={() => setModalExcluir(null)}
                style={{ border: '1px solid #dee2e6', background: 'none', borderRadius: 5, padding: '6px 18px', fontSize: 13, cursor: 'pointer' }}>
                Cancelar
              </button>
              <button onClick={confirmarExcluir} disabled={modalExcluir.loading}
                style={{ background: '#dc3545', color: '#fff', border: 'none', borderRadius: 5, padding: '6px 18px', fontSize: 13, fontWeight: 700, cursor: 'pointer', opacity: modalExcluir.loading ? 0.7 : 1 }}>
                {modalExcluir.loading ? 'Excluindo...' : 'Sim, excluir'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal excluir em lote */}
      {modalExcluirLote && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)', zIndex: 1000,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <div className="card" style={{ padding: 28, maxWidth: 440, width: '90%' }}>
            <h5 style={{ margin: '0 0 4px', color: '#dc3545', fontWeight: 700 }}>
              <i className="bi bi-exclamation-triangle" style={{ marginRight: 8 }}></i>Excluir {modalExcluirLote.ids.length} Pedidos
            </h5>
            <p style={{ margin: '12px 0 4px', fontSize: 14, color: '#333' }}>
              Tem certeza que deseja excluir <strong>{modalExcluirLote.ids.length} pedidos</strong> selecionados?
            </p>
            <p style={{ margin: '0 0 16px', fontSize: 12, color: '#666' }}>
              Esta ação não pode ser desfeita. Os pedidos serão registrados no log de excluídos.
            </p>
            <label style={{ fontSize: 12, fontWeight: 600, color: '#444', display: 'block', marginBottom: 4 }}>
              Motivo (opcional):
            </label>
            <input
              value={modalExcluirLote.motivo}
              onChange={e => setModalExcluirLote(m => m ? { ...m, motivo: e.target.value } : null)}
              placeholder="Ex: Pedidos de teste, cancelados pelo cliente..."
              style={{ width: '100%', border: '1px solid #dee2e6', borderRadius: 5, padding: '6px 10px', fontSize: 13, marginBottom: 16, boxSizing: 'border-box' }}
            />
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button onClick={() => setModalExcluirLote(null)}
                style={{ border: '1px solid #dee2e6', background: 'none', borderRadius: 5, padding: '6px 18px', fontSize: 13, cursor: 'pointer' }}>
                Cancelar
              </button>
              <button onClick={confirmarExcluirLote} disabled={modalExcluirLote.loading}
                style={{ background: '#dc3545', color: '#fff', border: 'none', borderRadius: 5, padding: '6px 18px', fontSize: 13, fontWeight: 700, cursor: 'pointer', opacity: modalExcluirLote.loading ? 0.7 : 1 }}>
                {modalExcluirLote.loading ? 'Excluindo...' : `Sim, excluir ${modalExcluirLote.ids.length}`}
              </button>
            </div>
          </div>
        </div>
      )}
    </AuthGuard>
  );
}
