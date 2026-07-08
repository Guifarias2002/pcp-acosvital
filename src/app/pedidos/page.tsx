'use client';
import { Suspense, useEffect, useState, useRef, useCallback } from 'react';
import { useRealtime } from '@/hooks/useRealtime';
import { useSearchParams } from 'next/navigation';
import AuthGuard from '@/components/AuthGuard';
import { getPedidos } from '@/lib/api';
import { getToken } from '@/lib/auth';
import { Pedido, STATUS_LABELS, getPedidoEtapa, ETAPA_LABELS, NOMES, SETOR_CHOICES } from '@/lib/types';
import { getUser } from '@/lib/auth';
import Link from 'next/link';
import RastreioModal from '@/components/RastreioModal';

function fmtData(s: string) {
  if (!s) return '—';
  const d = new Date(s);
  if (isNaN(d.getTime())) return s;
  return d.toLocaleDateString('pt-BR');
}

const PRIORIDADE_BADGE: Record<string, string> = {
  baixa: 'badge-baixa', normal: 'badge-normal', alta: 'badge-alta', urgente: 'badge-urgente',
};

interface ModalExcluir { id: number; numero: string; motivo: string; loading: boolean; erro?: string; }
interface ModalExcluirLote { ids: number[]; motivo: string; loading: boolean; }
interface AvisoProducao { id: number; numero: string; motivo: string; count: number; loading: boolean; }

interface ModalRastreio { pedidoId: number; numero: string; }

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
  const [paginacao, setPaginacao] = useState({ page: 1, pages: 1, total: 0 });
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [fBusca, setFBusca] = useState('');
  const [fVendedor, setFVendedor] = useState('');
  const [fStatus, setFStatus] = useState('');
  const [fPrioridade, setFPrioridade] = useState('');
  const [fSetor, setFSetor] = useState('');
  const [fEtapa, setFEtapa] = useState(etapaParam || '');
  const [modalExcluir, setModalExcluir] = useState<ModalExcluir | null>(null);
  const [modalExcluirLote, setModalExcluirLote] = useState<ModalExcluirLote | null>(null);
  const [avisoProducao, setAvisoProducao] = useState<AvisoProducao | null>(null);
  const [modalRastreio, setModalRastreio] = useState<ModalRastreio | null>(null);

  function abrirRastreio(pedidoId: number, numero: string) {
    setModalRastreio({ pedidoId, numero });
  }
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const _u = getUser();
  const isAdmin = _u?.is_staff;
  const isSuperAdmin = _u?.perfil === 'administrador' || (_u?.is_staff && _u?.perfil !== 'pcp' && _u?.perfil !== 'lider');

  const buscarRef = useRef<(p?: number) => void>(() => {});

  function buscar(p = page) {
    setLoading(true);
    setSelectedIds(new Set());
    const params: Record<string, string> = { cliente: fBusca, vendedor: fVendedor, status: fStatus, prioridade: fPrioridade, setor: fSetor, entregue: '1', page: String(p) };
    if (fEtapa === 'entregue') params.entregue = '1';
    getPedidos(params).then(r => { setPedidos(r.pedidos); setPaginacao({ page: r.page, pages: r.pages, total: r.total }); }).catch(() => {}).finally(() => setLoading(false));
  }
  buscarRef.current = buscar;

  useEffect(() => { setPage(1); buscarRef.current(1); }, []);

  // Polling 10s — mantém lista sempre atualizada
  useEffect(() => {
    const t = setInterval(() => buscarRef.current(), 20 * 60 * 1000);
    return () => clearInterval(t);
  }, []);

  const buscarCallback = useCallback(() => buscarRef.current(), []);
  useRealtime(
    ['producao_itemparcial', 'producao_itempedido', 'producao_movimentacaoitem'],
    buscarCallback,
  );

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
    setModalExcluir(m => m ? { ...m, loading: true, erro: undefined } : null);
    try {
      const token = getToken();
      const res = await fetch(`/api/pedidos/${modalExcluir.id}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ motivo: modalExcluir.motivo }),
      });
      const data = await res.json();
      if (res.status === 409 && data.requer_confirmacao) {
        // Items em produção: fecha a modal simples e abre o aviso especializado
        const { id, numero, motivo } = modalExcluir;
        setModalExcluir(null);
        setAvisoProducao({ id, numero, motivo, count: data.em_producao, loading: false });
        return;
      }
      if (!res.ok) {
        setModalExcluir(m => m ? { ...m, loading: false, erro: (data.detalhe || data.erro) || 'Erro ao excluir' } : null);
        return;
      }
      setModalExcluir(null);
      buscar();
    } catch {
      setModalExcluir(m => m ? { ...m, loading: false, erro: 'Erro de conexão. Tente novamente.' } : null);
    }
  }

  async function excluirComConfirmacao() {
    if (!avisoProducao) return;
    setAvisoProducao(m => m ? { ...m, loading: true } : null);
    try {
      const token = getToken();
      const res = await fetch(`/api/pedidos/${avisoProducao.id}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ motivo: avisoProducao.motivo, confirmar_excluir_em_producao: true }),
      });
      if (!res.ok) {
        const data = await res.json();
        setAvisoProducao(m => m ? { ...m, loading: false } : null);
        // reutiliza o modal original para mostrar erros inesperados
        setModalExcluir({ id: avisoProducao.id, numero: avisoProducao.numero, motivo: avisoProducao.motivo, loading: false, erro: data.erro || 'Erro ao excluir' });
        setAvisoProducao(null);
        return;
      }
      setAvisoProducao(null);
      buscar();
    } catch {
      setAvisoProducao(m => m ? { ...m, loading: false } : null);
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
          body: JSON.stringify({ motivo: modalExcluirLote.motivo, confirmar_excluir_em_producao: true }),
        });
        if (!res.ok) erros.push(id);
      } catch {
        erros.push(id);
      }
    }
    setModalExcluirLote(null);
    buscar();
    if (erros.length > 0) {
      // Mostra como aviso inline na lista (não bloqueia o fluxo)
      console.warn(`${erros.length} pedido(s) não puderam ser excluídos.`);
    }
  }

  return (
    <AuthGuard>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18, flexWrap: 'wrap', gap: 10 }}>
        <h4 style={{ margin: 0, fontWeight: 700, color: '#1a3a5c' }}>
          <i className="bi bi-list-ul" style={{ marginRight: 8 }}></i>Pedidos de Venda
        </h4>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
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
      <div className="card" style={{ padding: '12px 16px', marginBottom: 16, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <input value={fBusca} onChange={e => setFBusca(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && buscar()}
          placeholder="Buscar por pedido, cliente, OP..."
          style={{ border: '1px solid #dee2e6', borderRadius: 5, padding: '6px 10px', fontSize: 13, flex: '1 1 160px', minWidth: 0 }} />
        <input value={fVendedor} onChange={e => setFVendedor(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && buscar()}
          placeholder="Vendedor..."
          style={{ border: '1px solid #dee2e6', borderRadius: 5, padding: '6px 10px', fontSize: 13, flex: '1 1 130px', minWidth: 0 }} />
        <select value={fStatus} onChange={e => setFStatus(e.target.value)}
          style={{ border: '1px solid #dee2e6', borderRadius: 5, padding: '6px 8px', fontSize: 13, flex: '1 1 140px' }}>
          <option value="">Todos os status</option>
          {Object.entries(STATUS_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
        <select value={fPrioridade} onChange={e => setFPrioridade(e.target.value)}
          style={{ border: '1px solid #dee2e6', borderRadius: 5, padding: '6px 8px', fontSize: 13, flex: '1 1 130px' }}>
          <option value="">Todas prioridades</option>
          {['baixa','normal','alta','urgente'].map(p => (
            <option key={p} value={p}>{p.charAt(0).toUpperCase()+p.slice(1)}</option>
          ))}
        </select>
        <select value={fSetor} onChange={e => setFSetor(e.target.value)}
          style={{ border: '1px solid #dee2e6', borderRadius: 5, padding: '6px 8px', fontSize: 13, flex: '1 1 150px' }}>
          <option value="">Todos os setores</option>
          {SETOR_CHOICES.map(([cod, nome]) => <option key={cod} value={cod}>{nome}</option>)}
        </select>
        <button onClick={() => buscar()} style={{
          background: '#1a3a5c', color: '#fff', border: 'none',
          borderRadius: 5, padding: '6px 16px', fontSize: 13, cursor: 'pointer', fontWeight: 600, whiteSpace: 'nowrap',
        }}>
          <i className="bi bi-search" style={{ marginRight: 4 }}></i>Filtrar
        </button>
        <button onClick={() => { setFBusca(''); setFVendedor(''); setFStatus(''); setFPrioridade(''); setFSetor(''); setFEtapa(''); }}
          style={{ border: '1px solid #dee2e6', background: 'none', borderRadius: 5, padding: '6px 12px', fontSize: 13, cursor: 'pointer', color: '#666', whiteSpace: 'nowrap' }}>
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
              {['Pedido','OP','Cliente','Vendedor','Setor Atual','Status','Prioridade','Prazo','Docs','Ações'].map(h => (
                <th key={h} style={{ padding: '9px 12px', textAlign: 'left', fontWeight: 600, fontSize: 12 }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td colSpan={11} style={{ textAlign: 'center', padding: 40, color: '#999' }}>Carregando...</td></tr>
            )}
            {!loading && pedidosFiltrados.length === 0 && (
              <tr><td colSpan={11} style={{ textAlign: 'center', padding: 40, color: '#999' }}>Nenhum pedido encontrado.</td></tr>
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
                    <button onClick={() => abrirRastreio(p.id, p.numero_pedido_venda)}
                      style={{ background: 'none', border: 'none', color: '#1a3a5c', fontWeight: 700, cursor: 'pointer', padding: 0, textDecoration: 'underline', fontSize: 'inherit' }}>
                      {p.numero_pedido_venda}
                    </button>
                  </td>
                  <td style={{ padding: '8px 12px', color: '#666' }}>{p.numero_op}</td>
                  <td style={{ padding: '8px 12px', color: '#444' }}>{p.cliente}</td>
                  <td style={{ padding: '8px 12px', color: '#666' }}>{p.vendedor}</td>
                  <td style={{ padding: '8px 12px' }}>
                    {(() => {
                      const setores: string[] = p.setores_parciais && p.setores_parciais.length > 0
                        ? p.setores_parciais
                        : [p.setor_atual];
                      if (setores.length === 1) {
                        return (
                          <span style={{ background: '#343a40', color: '#fff', fontSize: 11, padding: '2px 8px', borderRadius: 4 }}>
                            {NOMES[setores[0]] || p.nome_setor_atual}
                          </span>
                        );
                      }
                      return (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                          <span style={{ fontSize: 10, color: '#64748b', fontWeight: 600 }}>
                            {setores.length} setores
                          </span>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3 }}>
                            {setores.map((s: string) => (
                              <span key={s} style={{ background: '#343a40', color: '#fff', fontSize: 10, padding: '1px 6px', borderRadius: 4, whiteSpace: 'nowrap' }}>
                                {NOMES[s] || s}
                              </span>
                            ))}
                          </div>
                        </div>
                      );
                    })()}
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
                      <span title={(p as any).tem_ordem_producao ? 'Ordem de Produção anexada' : 'Ordem de Produção não anexada'}
                        style={{
                          display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 10, fontWeight: 700,
                          padding: '2px 6px', borderRadius: 4,
                          background: (p as any).tem_ordem_producao ? '#d1e7dd' : '#f1f3f5',
                          color: (p as any).tem_ordem_producao ? '#0f5132' : '#adb5bd',
                        }}>
                        <i className={`bi ${(p as any).tem_ordem_producao ? 'bi-file-earmark-check-fill' : 'bi-file-earmark'}`} />
                        OP
                      </span>
                      <span title={(p as any).tem_pedido_venda ? 'Pedido de Venda anexado' : 'Pedido de Venda não anexado'}
                        style={{
                          display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 10, fontWeight: 700,
                          padding: '2px 6px', borderRadius: 4,
                          background: (p as any).tem_pedido_venda ? '#d1e7dd' : '#f1f3f5',
                          color: (p as any).tem_pedido_venda ? '#0f5132' : '#adb5bd',
                        }}>
                        <i className={`bi ${(p as any).tem_pedido_venda ? 'bi-file-earmark-check-fill' : 'bi-file-earmark'}`} />
                        PV
                      </span>
                    </div>
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

      {/* Paginação */}
      {paginacao.pages > 1 && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 4px', marginTop: 8 }}>
          <span style={{ fontSize: 13, color: '#666' }}>
            Mostrando {pedidos.length} de <strong>{paginacao.total}</strong> pedidos — página {paginacao.page} de {paginacao.pages}
          </span>
          <div style={{ display: 'flex', gap: 6 }}>
            <button
              disabled={paginacao.page <= 1 || loading}
              onClick={() => { const p = paginacao.page - 1; setPage(p); buscarRef.current(p); }}
              style={{ border: '1px solid #dee2e6', borderRadius: 5, padding: '5px 14px', fontSize: 13, cursor: paginacao.page <= 1 ? 'not-allowed' : 'pointer', background: paginacao.page <= 1 ? '#f8f9fa' : '#fff', color: paginacao.page <= 1 ? '#aaa' : '#1a3a5c', fontWeight: 600 }}>
              ← Anterior
            </button>
            <button
              disabled={paginacao.page >= paginacao.pages || loading}
              onClick={() => { const p = paginacao.page + 1; setPage(p); buscarRef.current(p); }}
              style={{ border: '1px solid #dee2e6', borderRadius: 5, padding: '5px 14px', fontSize: 13, cursor: paginacao.page >= paginacao.pages ? 'not-allowed' : 'pointer', background: paginacao.page >= paginacao.pages ? '#f8f9fa' : '#1a3a5c', color: paginacao.page >= paginacao.pages ? '#aaa' : '#fff', fontWeight: 600 }}>
              Próxima →
            </button>
          </div>
        </div>
      )}

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
              style={{ width: '100%', border: '1px solid #dee2e6', borderRadius: 5, padding: '6px 10px', fontSize: 13, marginBottom: 12, boxSizing: 'border-box' }}
            />
            {modalExcluir.erro && (
              <div style={{ background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: 6, padding: '8px 12px', marginBottom: 12, fontSize: 12, color: '#b91c1c' }}>
                ⚠ {modalExcluir.erro}
              </div>
            )}
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

      {/* Modal aviso produção ativa */}
      {avisoProducao && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,.55)',
          backdropFilter: 'blur(3px)', zIndex: 1000,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <div className="card" style={{ padding: 28, maxWidth: 460, width: '90%' }}>
            {/* Ícone */}
            <div style={{
              width: 56, height: 56, borderRadius: '50%',
              background: '#fff7ed', border: '2px solid #fed7aa',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              margin: '0 auto 16px', fontSize: 26,
            }}>⚠️</div>

            <h5 style={{ margin: '0 0 6px', color: '#92400e', fontWeight: 700, textAlign: 'center', fontSize: 16 }}>
              Pedido com produção ativa
            </h5>
            <p style={{ fontSize: 14, color: '#444', margin: '0 0 12px', textAlign: 'center', lineHeight: 1.5 }}>
              O pedido <strong>{avisoProducao.numero}</strong> possui{' '}
              <strong>{avisoProducao.count} item{avisoProducao.count > 1 ? 's' : ''}</strong>{' '}
              em andamento na linha de produção.
            </p>

            <div style={{
              background: '#fff7ed', border: '1px solid #fed7aa',
              borderRadius: 8, padding: '10px 14px', marginBottom: 20,
              fontSize: 12, color: '#92400e', lineHeight: 1.6,
            }}>
              <strong>Atenção:</strong> Excluir este pedido irá interromper o fluxo produtivo e
              remover todos os registros de movimentação associados.
              Esta ação <strong>não pode ser desfeita</strong>.
            </div>

            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button onClick={() => setAvisoProducao(null)}
                style={{ border: '1px solid #dee2e6', background: 'none', borderRadius: 5, padding: '7px 20px', fontSize: 13, cursor: 'pointer', fontWeight: 500 }}>
                Cancelar
              </button>
              <button onClick={excluirComConfirmacao} disabled={avisoProducao.loading}
                style={{
                  background: '#dc3545', color: '#fff', border: 'none',
                  borderRadius: 5, padding: '7px 20px', fontSize: 13,
                  fontWeight: 700, cursor: 'pointer',
                  opacity: avisoProducao.loading ? 0.7 : 1,
                }}>
                {avisoProducao.loading ? 'Excluindo...' : '🗑 Excluir mesmo assim'}
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
      {/* Modal rastreabilidade */}
      {modalRastreio && (
        <RastreioModal pedidoId={modalRastreio.pedidoId} numero={modalRastreio.numero} onClose={() => setModalRastreio(null)} />
      )}
    </AuthGuard>
  );
}

