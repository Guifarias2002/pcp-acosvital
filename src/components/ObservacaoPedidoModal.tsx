'use client';
import { useEffect, useRef, useState } from 'react';
import { getToken } from '@/lib/auth';

// Observação única do pedido (campo simples, sobrescreve — não é histórico como
// a observação por item). Busca/salva direto em /api/pedidos/:id, mesma fonte
// usada pela tela de detalhe do pedido, pra ficar sempre sincronizado.
export default function ObservacaoPedidoModal({ pedidoId, numero, editavel, onClose }: { pedidoId: number; numero: string; editavel: boolean; onClose: () => void }) {
  const [loading, setLoading] = useState(true);
  const [texto, setTexto] = useState('');
  const [editando, setEditando] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const abertoEm = useRef(Date.now());

  useEffect(() => {
    let cancelado = false;
    setLoading(true);
    const token = getToken();
    fetch(`/api/pedidos/${pedidoId}`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then(data => { if (!cancelado) setTexto(data.observacoes || ''); })
      .catch(() => {})
      .finally(() => { if (!cancelado) setLoading(false); });
    return () => { cancelado = true; };
  }, [pedidoId]);

  async function salvar() {
    setSalvando(true);
    setErro(null);
    try {
      const token = getToken();
      const res = await fetch(`/api/pedidos/${pedidoId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ observacoes: texto }),
      });
      const data = await res.json();
      if (res.ok) setEditando(false);
      else setErro(data.erro || 'Erro ao salvar');
    } catch { setErro('Erro ao salvar'); }
    finally { setSalvando(false); }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.55)', zIndex: 1100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
      onClick={e => { if (e.target === e.currentTarget && Date.now() - abertoEm.current > 350) onClose(); }}>
      <div style={{ background: '#fff', borderRadius: 12, width: '100%', maxWidth: 480, maxHeight: '85vh', display: 'flex', flexDirection: 'column', boxShadow: '0 8px 32px rgba(0,0,0,.2)' }}>

        <div style={{ padding: '18px 24px', borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontSize: 18, fontWeight: 800, color: '#1a3a5c' }}>💬 {numero}</div>
            <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>Observação do pedido</div>
          </div>
          <button type="button" onClick={onClose} aria-label="Fechar"
            style={{ background: 'none', border: 'none', fontSize: 22, color: '#94a3b8', cursor: 'pointer', lineHeight: 1, minWidth: 44, minHeight: 44, display: 'flex', alignItems: 'center', justifyContent: 'center', touchAction: 'manipulation', WebkitTapHighlightColor: 'transparent' }}>✕</button>
        </div>

        <div style={{ overflow: 'auto', padding: '16px 24px' }}>
          {loading ? (
            <div style={{ textAlign: 'center', padding: 40, color: '#94a3b8' }}>Carregando...</div>
          ) : editando ? (
            <div>
              <textarea value={texto} onChange={e => setTexto(e.target.value)}
                placeholder="Observação do pedido..." rows={5} autoFocus
                style={{ width: '100%', border: '1px solid #93c5fd', borderRadius: 8, padding: '10px 12px', fontSize: 14, resize: 'none', boxSizing: 'border-box' }} />
              <div style={{ display: 'flex', gap: 8, marginTop: 10, justifyContent: 'flex-end' }}>
                <button type="button" onClick={() => setEditando(false)}
                  style={{ background: '#fff', color: '#64748b', border: '1px solid #e2e8f0', borderRadius: 8, padding: '10px 16px', fontSize: 13, fontWeight: 600, cursor: 'pointer', minHeight: 44 }}>
                  Cancelar
                </button>
                <button type="button" onClick={salvar} disabled={salvando}
                  style={{ background: '#1d4ed8', color: '#fff', border: 'none', borderRadius: 8, padding: '10px 16px', fontSize: 13, fontWeight: 700, cursor: 'pointer', minHeight: 44, opacity: salvando ? 0.6 : 1 }}>
                  {salvando ? '⏳' : 'Salvar'}
                </button>
              </div>
              {erro && <p style={{ fontSize: 12, color: '#dc2626', marginTop: 8 }}>{erro}</p>}
            </div>
          ) : (
            <div>
              <p style={{ fontSize: 14, color: texto ? '#374151' : '#94a3b8', margin: 0, fontStyle: texto ? 'normal' : 'italic', whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>
                {texto || 'Nenhuma observação registrada.'}
              </p>
              {editavel && (
                <button type="button" onClick={() => setEditando(true)}
                  style={{ marginTop: 14, background: '#eff6ff', color: '#1d4ed8', border: '1px solid #93c5fd', borderRadius: 8, padding: '10px 16px', fontSize: 13, fontWeight: 700, cursor: 'pointer', minHeight: 44 }}>
                  {texto ? 'Editar' : '+ Adicionar observação'}
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
