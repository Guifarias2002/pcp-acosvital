'use client';
import { useState } from 'react';
import { itemAcao } from '@/lib/api';

interface Props {
  itemId: number;
  itemCodigo: string;
  pedidoNumero: string;
  onClose: () => void;
  onSuccess: () => void;
}

export default function DespacharModal({ itemId, itemCodigo, pedidoNumero, onClose, onSuccess }: Props) {
  const [numeroNf, setNumeroNf] = useState('');
  const [frete, setFrete] = useState<'CIF' | 'FOB' | ''>('');
  const [transportadora, setTransportadora] = useState('');
  const [motorista, setMotorista] = useState('');
  const [obs, setObs] = useState('');
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState('');

  async function despachar() {
    if (!numeroNf.trim()) { setErro('Número da NF é obrigatório.'); return; }
    if (!frete) { setErro('Selecione o tipo de frete (CIF ou FOB).'); return; }
    setLoading(true);
    setErro('');
    try {
      const obsCompleta = [
        `NF: ${numeroNf.trim()}`,
        `Frete: ${frete}`,
        transportadora.trim() ? `Transportadora: ${transportadora.trim()}` : '',
        motorista.trim() ? `Motorista: ${motorista.trim()}` : '',
        obs.trim() ? obs.trim() : '',
      ].filter(Boolean).join(' | ');
      await itemAcao(itemId, 'despachar', { observacao: obsCompleta });
      onSuccess();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Erro ao despachar';
      setErro(msg);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ background: '#fff', borderRadius: 12, width: '100%', maxWidth: 480, padding: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <div>
            <h5 style={{ margin: 0, fontWeight: 700, color: '#1a3a5c' }}>
              <i className="bi bi-truck" style={{ marginRight: 8, color: '#fd7e14' }} />
              Despachar Material
            </h5>
            <small style={{ color: '#6b7280' }}>{pedidoNumero} — {itemCodigo}</small>
          </div>
          <button className="btn btn-ghost btn-sm" onClick={onClose} disabled={loading}>
            <i className="bi bi-x-lg" />
          </button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 4 }}>
              Número da Nota Fiscal <span style={{ color: '#dc3545' }}>*</span>
            </label>
            <input
              className="form-control"
              style={{ fontSize: 14, padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: 8 }}
              placeholder="Ex: 12345"
              value={numeroNf}
              onChange={e => setNumeroNf(e.target.value)}
              disabled={loading}
              autoFocus
            />
          </div>

          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 4 }}>
              Tipo de Frete <span style={{ color: '#dc3545' }}>*</span>
            </label>
            <div style={{ display: 'flex', gap: 8 }}>
              {(['CIF', 'FOB'] as const).map(tipo => (
                <button
                  key={tipo}
                  type="button"
                  onClick={() => setFrete(tipo)}
                  disabled={loading}
                  style={{
                    flex: 1, padding: '10px 0', borderRadius: 8, fontWeight: 700, fontSize: 14, cursor: 'pointer',
                    border: frete === tipo ? '2px solid #1a3a5c' : '2px solid #d1d5db',
                    background: frete === tipo ? '#1a3a5c' : '#fff',
                    color: frete === tipo ? '#fff' : '#374151',
                    transition: 'all .15s',
                  }}>
                  {tipo}
                  <div style={{ fontSize: 10, fontWeight: 400, opacity: .8, marginTop: 2 }}>
                    {tipo === 'CIF' ? 'Frete por conta do vendedor' : 'Frete por conta do comprador'}
                  </div>
                </button>
              ))}
            </div>
          </div>

          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 4 }}>
              Transportadora <span style={{ color: '#9ca3af' }}>(opcional)</span>
            </label>
            <input
              className="form-control"
              style={{ fontSize: 14, padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: 8 }}
              placeholder="Nome da transportadora"
              value={transportadora}
              onChange={e => setTransportadora(e.target.value)}
              disabled={loading}
            />
          </div>

          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 4 }}>
              Motorista <span style={{ color: '#9ca3af' }}>(opcional)</span>
            </label>
            <input
              className="form-control"
              style={{ fontSize: 14, padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: 8 }}
              placeholder="Nome do motorista"
              value={motorista}
              onChange={e => setMotorista(e.target.value)}
              disabled={loading}
            />
          </div>

          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 4 }}>
              Observação <span style={{ color: '#9ca3af' }}>(opcional)</span>
            </label>
            <textarea
              className="form-control"
              style={{ fontSize: 14, padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: 8, resize: 'vertical', minHeight: 60 }}
              placeholder="Observações sobre o despacho..."
              value={obs}
              onChange={e => setObs(e.target.value)}
              disabled={loading}
            />
          </div>

          {erro && (
            <div style={{ background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: 8, padding: '10px 14px', fontSize: 13, color: '#dc2626' }}>
              <i className="bi bi-exclamation-triangle" style={{ marginRight: 6 }} />{erro}
            </div>
          )}

          <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
            <button className="btn btn-outline" style={{ flex: 1 }} onClick={onClose} disabled={loading}>
              Cancelar
            </button>
            <button className="btn btn-warning" style={{ flex: 2 }} onClick={despachar} disabled={loading}>
              {loading
                ? <><i className="bi bi-hourglass-split" /> Despachando...</>
                : <><i className="bi bi-truck" /> Confirmar Despacho</>}
            </button>
          </div>

          <div style={{ background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: 8, padding: '10px 14px', fontSize: 12, color: '#92400e' }}>
            <i className="bi bi-info-circle" style={{ marginRight: 6 }} />
            Após despachar, o item ficará como <strong>Em Trânsito</strong>. A entrega deve ser confirmada após o cliente receber.
          </div>
        </div>
      </div>
    </div>
  );
}
