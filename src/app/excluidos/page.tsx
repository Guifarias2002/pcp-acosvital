'use client';
import { useEffect, useState } from 'react';
import AuthGuard from '@/components/AuthGuard';
import { getToken, getUser, podeEditar } from '@/lib/auth';

interface PedidoExcluido {
  id: number;
  pedido_id: number;
  numero_pedido_venda: string;
  numero_op: string;
  cliente: string;
  prioridade: string;
  status_pedido: string;
  valor_total: string;
  excluido_por_nome: string;
  excluido_em: string;
}

interface ModalReativar {
  id: number;
  numero: string;
  modo: 'original' | 'zero' | null;
  loading: boolean;
}

function fmtDt(s: string) {
  if (!s) return '—';
  const d = new Date(s);
  if (isNaN(d.getTime())) return s;
  return d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

const PRIORIDADE_BADGE: Record<string, string> = {
  baixa: 'badge-baixa', normal: 'badge-normal', alta: 'badge-alta', urgente: 'badge-urgente',
};

export default function ExcluidosPage() {
  const [registros, setRegistros] = useState<PedidoExcluido[]>([]);
  const [loading, setLoading] = useState(true);
  const [busca, setBusca] = useState('');
  const [erro, setErro] = useState('');
  const [modal, setModal] = useState<ModalReativar | null>(null);
  const [sucesso, setSucesso] = useState('');

  const user = getUser();
  const isSuperAdmin = (user?.perfil === 'administrador' || (user?.is_staff && user?.perfil !== 'pcp' && user?.perfil !== 'lider')) && podeEditar(user);

  async function carregar(b = '') {
    setLoading(true);
    setErro('');
    try {
      const token = getToken();
      const res = await fetch(`/api/excluidos${b ? `?busca=${encodeURIComponent(b)}` : ''}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.status === 403) { setErro('Acesso restrito a administradores.'); return; }
      if (!res.ok) throw new Error('Erro ao carregar');
      setRegistros(await res.json());
    } catch {
      setErro('Não foi possível carregar o registro de excluídos.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { carregar(); }, []);

  async function confirmarReativar() {
    if (!modal || !modal.modo) return;
    setModal(m => m ? { ...m, loading: true } : null);
    try {
      const token = getToken();
      const res = await fetch(`/api/excluidos/${modal.id}/reativar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ modo: modal.modo }),
      });
      const data = await res.json();
      if (!res.ok) { setErro(data.erro || 'Erro ao reativar'); return; }
      setModal(null);
      setSucesso(`${data.mensagem} (Pedido #${data.pedido_id})`);
      carregar(busca);
      setTimeout(() => setSucesso(''), 8000);
    } catch {
      setErro('Erro ao reativar pedido.');
    } finally {
      setModal(m => m ? { ...m, loading: false } : null);
    }
  }

  return (
    <AuthGuard>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
        <h4 style={{ margin: 0, fontWeight: 700, color: '#1a3a5c' }}>
          <i className="bi bi-trash3" style={{ marginRight: 8 }}></i>Pedidos Excluídos
        </h4>
        <span style={{ fontSize: 12, color: '#888' }}>Log automático — ambos os sistemas (Django e Next.js)</span>
      </div>

      {/* Busca */}
      <div className="card" style={{ padding: '12px 16px', marginBottom: 16, display: 'flex', gap: 8, alignItems: 'center' }}>
        <input
          value={busca}
          onChange={e => setBusca(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && carregar(busca)}
          placeholder="Buscar por pedido, cliente ou usuário..."
          style={{ border: '1px solid #dee2e6', borderRadius: 5, padding: '5px 10px', fontSize: 13, flex: 1 }}
        />
        <button onClick={() => carregar(busca)} style={{
          background: '#1a3a5c', color: '#fff', border: 'none',
          borderRadius: 5, padding: '5px 16px', fontSize: 13, cursor: 'pointer', fontWeight: 600,
        }}>
          <i className="bi bi-search" style={{ marginRight: 4 }}></i>Filtrar
        </button>
        <button onClick={() => { setBusca(''); carregar(''); }} style={{
          border: '1px solid #dee2e6', background: 'none', borderRadius: 5,
          padding: '5px 12px', fontSize: 13, cursor: 'pointer', color: '#666',
        }}>Limpar</button>
      </div>

      {sucesso && (
        <div style={{ background: '#d1e7dd', color: '#0a5c36', padding: '12px 16px', borderRadius: 8, marginBottom: 16, fontSize: 13, fontWeight: 600 }}>
          <i className="bi bi-check-circle" style={{ marginRight: 8 }}></i>{sucesso}
        </div>
      )}

      {erro && (
        <div style={{ background: '#f8d7da', color: '#842029', padding: '12px 16px', borderRadius: 8, marginBottom: 16, fontSize: 13 }}>
          <i className="bi bi-exclamation-triangle" style={{ marginRight: 8 }}></i>{erro}
        </div>
      )}

      <div className="card" style={{ overflow: 'hidden' }}>
        <div className="table-responsive">
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: '#212529', color: '#fff' }}>
                {['Pedido','OP','Cliente','Prioridade','Status','Excluído por','Data/Hora','Ações'].map(h => (
                  <th key={h} style={{ padding: '9px 12px', textAlign: 'left', fontWeight: 600, fontSize: 12 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr><td colSpan={8} style={{ textAlign: 'center', padding: 40, color: '#999' }}>Carregando...</td></tr>
              )}
              {!loading && registros.length === 0 && !erro && (
                <tr><td colSpan={8} style={{ textAlign: 'center', padding: 40, color: '#999' }}>
                  <i className="bi bi-inbox" style={{ fontSize: 24, display: 'block', marginBottom: 8 }}></i>
                  Nenhum pedido foi excluído ainda.
                </td></tr>
              )}
              {registros.map((r, i) => (
                <tr key={r.id} style={{ borderBottom: '1px solid #f0f0f0', background: i % 2 === 0 ? '#fff' : '#fafafa' }}>
                  <td style={{ padding: '8px 12px', fontWeight: 700, color: '#1a3a5c' }}>{r.numero_pedido_venda || '—'}</td>
                  <td style={{ padding: '8px 12px', color: '#666' }}>{r.numero_op || '—'}</td>
                  <td style={{ padding: '8px 12px', color: '#444' }}>{r.cliente || '—'}</td>
                  <td style={{ padding: '8px 12px' }}>
                    {r.prioridade ? (
                      <span className={PRIORIDADE_BADGE[r.prioridade] || 'badge-normal'}
                        style={{ fontSize: 11, padding: '2px 8px', borderRadius: 4 }}>
                        {r.prioridade.charAt(0).toUpperCase() + r.prioridade.slice(1)}
                      </span>
                    ) : '—'}
                  </td>
                  <td style={{ padding: '8px 12px' }}>
                    <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 4, background: '#e2e3e5', color: '#333' }}>
                      {r.status_pedido || '—'}
                    </span>
                  </td>
                  <td style={{ padding: '8px 12px' }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      <i className="bi bi-person-circle" style={{ color: '#888' }}></i>
                      <strong>{r.excluido_por_nome || 'Sistema'}</strong>
                    </span>
                  </td>
                  <td style={{ padding: '8px 12px', color: '#dc3545', fontWeight: 600, fontSize: 12 }}>
                    <i className="bi bi-clock-history" style={{ marginRight: 4 }}></i>
                    {fmtDt(r.excluido_em)}
                  </td>
                  <td style={{ padding: '8px 12px' }}>
                    {isSuperAdmin && (
                      <button
                        onClick={() => setModal({ id: r.id, numero: r.numero_pedido_venda, modo: null, loading: false })}
                        title="Reativar pedido"
                        style={{
                          border: '1px solid #198754', color: '#198754', background: 'none',
                          borderRadius: 5, padding: '3px 10px', fontSize: 12, cursor: 'pointer', fontWeight: 600,
                        }}
                      >
                        <i className="bi bi-arrow-counterclockwise" style={{ marginRight: 4 }}></i>Reativar
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!loading && registros.length > 0 && (
          <div style={{ padding: '8px 16px', fontSize: 12, color: '#888', borderTop: '1px solid #f0f0f0' }}>
            {registros.length} registro{registros.length !== 1 ? 's' : ''} encontrado{registros.length !== 1 ? 's' : ''}
            {registros.length === 200 && ' (mostrando os 200 mais recentes)'}
          </div>
        )}
      </div>

      {/* Modal reativar */}
      {modal && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)', zIndex: 1000,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <div className="card" style={{ padding: 28, maxWidth: 480, width: '90%' }}>
            <h5 style={{ margin: '0 0 4px', color: '#198754', fontWeight: 700 }}>
              <i className="bi bi-arrow-counterclockwise" style={{ marginRight: 8 }}></i>
              Reativar Pedido
            </h5>
            <p style={{ margin: '10px 0 16px', fontSize: 14, color: '#333' }}>
              Como deseja reativar o pedido <strong>{modal.numero}</strong>?
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 20 }}>
              {/* Opção: Como estava */}
              <button
                onClick={() => setModal(m => m ? { ...m, modo: 'original' } : null)}
                style={{
                  display: 'flex', alignItems: 'flex-start', gap: 12, padding: '14px 16px',
                  border: `2px solid ${modal.modo === 'original' ? '#198754' : '#dee2e6'}`,
                  borderRadius: 10, background: modal.modo === 'original' ? '#f0fdf4' : '#fff',
                  cursor: 'pointer', textAlign: 'left', transition: 'all .15s',
                }}
              >
                <i className="bi bi-arrow-return-left" style={{ fontSize: 20, color: '#198754', marginTop: 2 }}></i>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 14, color: '#1a3a5c' }}>Restaurar como estava</div>
                  <div style={{ fontSize: 12, color: '#666', marginTop: 3 }}>
                    Volta ao mesmo status e setor em que estava quando foi excluído.
                    Os itens precisarão ser adicionados manualmente.
                  </div>
                </div>
                {modal.modo === 'original' && (
                  <i className="bi bi-check-circle-fill" style={{ color: '#198754', fontSize: 18, marginLeft: 'auto' }}></i>
                )}
              </button>

              {/* Opção: Do zero */}
              <button
                onClick={() => setModal(m => m ? { ...m, modo: 'zero' } : null)}
                style={{
                  display: 'flex', alignItems: 'flex-start', gap: 12, padding: '14px 16px',
                  border: `2px solid ${modal.modo === 'zero' ? '#0d6efd' : '#dee2e6'}`,
                  borderRadius: 10, background: modal.modo === 'zero' ? '#eff6ff' : '#fff',
                  cursor: 'pointer', textAlign: 'left', transition: 'all .15s',
                }}
              >
                <i className="bi bi-play-circle" style={{ fontSize: 20, color: '#0d6efd', marginTop: 2 }}></i>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 14, color: '#1a3a5c' }}>Começar do zero</div>
                  <div style={{ fontSize: 12, color: '#666', marginTop: 3 }}>
                    Cria o pedido novamente no início, em Emissão de Ordens.
                    Os itens precisarão ser adicionados manualmente.
                  </div>
                </div>
                {modal.modo === 'zero' && (
                  <i className="bi bi-check-circle-fill" style={{ color: '#0d6efd', fontSize: 18, marginLeft: 'auto' }}></i>
                )}
              </button>
            </div>

            {modal.modo && (
              <div style={{ background: '#fff8e1', border: '1px solid #ffe082', borderRadius: 8, padding: '10px 14px', fontSize: 12, color: '#7a5a00', marginBottom: 16 }}>
                <i className="bi bi-info-circle" style={{ marginRight: 6 }}></i>
                Os <strong>itens do pedido não são restaurados automaticamente</strong> — você precisará adicioná-los manualmente após a reativação.
              </div>
            )}

            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button onClick={() => setModal(null)} disabled={modal.loading}
                style={{ border: '1px solid #dee2e6', background: 'none', borderRadius: 5, padding: '7px 20px', fontSize: 13, cursor: 'pointer' }}>
                Cancelar
              </button>
              <button
                onClick={confirmarReativar}
                disabled={!modal.modo || modal.loading}
                style={{
                  background: modal.modo === 'original' ? '#198754' : modal.modo === 'zero' ? '#0d6efd' : '#aaa',
                  color: '#fff', border: 'none', borderRadius: 5, padding: '7px 22px',
                  fontSize: 13, fontWeight: 700, cursor: modal.modo ? 'pointer' : 'not-allowed',
                  opacity: (!modal.modo || modal.loading) ? 0.6 : 1,
                }}
              >
                {modal.loading ? 'Reativando...' : 'Confirmar Reativação'}
              </button>
            </div>
          </div>
        </div>
      )}
    </AuthGuard>
  );
}
