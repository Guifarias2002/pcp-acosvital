'use client';
import { useState } from 'react';

export type IniciarEntregaResultado =
  | { tipo: 'externa'; observacao: string }
  | { tipo: 'interna'; servico: 'beneficiadores' | 'caldeiraria'; observacao: string };

interface Props {
  pedidoNumero: string;
  itemCodigo?: string;
  onClose: () => void;
  onConfirm: (resultado: IniciarEntregaResultado) => void;
  loading?: boolean;
}

const SERVICOS = [
  { cod: 'beneficiadores' as const, label: 'Beneficiadores', desc: 'Envia para a fila de Beneficiadores' },
  { cod: 'caldeiraria' as const, label: 'Caldeiraria', desc: 'Material será soldado e depois retorna' },
];

export default function IniciarEntregaModal({ pedidoNumero, itemCodigo, onClose, onConfirm, loading }: Props) {
  const [tipoEntrega, setTipoEntrega] = useState<'externa' | 'interna'>('externa');
  const [frete, setFrete] = useState<'CIF' | 'FOB' | ''>('');
  const [transportadora, setTransportadora] = useState('');
  const [motorista, setMotorista] = useState('');
  const [servico, setServico] = useState<'beneficiadores' | 'caldeiraria' | ''>('');
  const [obsInterna, setObsInterna] = useState('');
  const [erro, setErro] = useState('');

  function confirmar() {
    if (tipoEntrega === 'externa') {
      if (!frete) { setErro('Selecione o tipo de frete (CIF ou FOB).'); return; }
      const obs = [
        `Frete: ${frete}`,
        transportadora.trim() ? `Transportadora: ${transportadora.trim()}` : '',
        motorista.trim() ? `Motorista: ${motorista.trim()}` : '',
      ].filter(Boolean).join(' | ');
      onConfirm({ tipo: 'externa', observacao: obs });
    } else {
      if (!servico) { setErro('Selecione para qual serviço vai o material.'); return; }
      onConfirm({ tipo: 'interna', servico, observacao: obsInterna.trim() });
    }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ background: '#fff', borderRadius: 12, width: '100%', maxWidth: 440, padding: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <div>
            <h5 style={{ margin: 0, fontWeight: 700, color: '#1a3a5c' }}>
              <i className="bi bi-truck" style={{ marginRight: 8, color: '#0d6efd' }} />
              Iniciar Entrega
            </h5>
            <small style={{ color: '#6b7280' }}>{pedidoNumero}{itemCodigo ? ` — ${itemCodigo}` : ''}</small>
          </div>
          <button className="btn btn-ghost btn-sm" onClick={onClose} disabled={loading}>
            <i className="bi bi-x-lg" />
          </button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 4 }}>
              Tipo de Entrega <span style={{ color: '#dc3545' }}>*</span>
            </label>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                type="button"
                onClick={() => { setTipoEntrega('externa'); setErro(''); }}
                disabled={loading}
                style={{
                  flex: 1, padding: '10px 0', borderRadius: 8, fontWeight: 700, fontSize: 14, cursor: 'pointer',
                  border: tipoEntrega === 'externa' ? '2px solid #0d6efd' : '2px solid #d1d5db',
                  background: tipoEntrega === 'externa' ? '#0d6efd' : '#fff',
                  color: tipoEntrega === 'externa' ? '#fff' : '#374151',
                  transition: 'all .15s',
                }}>
                Externa
                <div style={{ fontSize: 10, fontWeight: 400, opacity: .8, marginTop: 2 }}>Vai para o cliente</div>
              </button>
              <button
                type="button"
                onClick={() => { setTipoEntrega('interna'); setErro(''); }}
                disabled={loading}
                style={{
                  flex: 1, padding: '10px 0', borderRadius: 8, fontWeight: 700, fontSize: 14, cursor: 'pointer',
                  border: tipoEntrega === 'interna' ? '2px solid #0d6efd' : '2px solid #d1d5db',
                  background: tipoEntrega === 'interna' ? '#0d6efd' : '#fff',
                  color: tipoEntrega === 'interna' ? '#fff' : '#374151',
                  transition: 'all .15s',
                }}>
                Interna
                <div style={{ fontSize: 10, fontWeight: 400, opacity: .8, marginTop: 2 }}>Vai para outro serviço</div>
              </button>
            </div>
          </div>

          {tipoEntrega === 'externa' ? (
            <>
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 4 }}>
                  Tipo de Frete <span style={{ color: '#dc3545' }}>*</span>
                </label>
                <div style={{ display: 'flex', gap: 8 }}>
                  {(['CIF', 'FOB'] as const).map(ft => (
                    <button
                      key={ft}
                      type="button"
                      onClick={() => setFrete(ft)}
                      disabled={loading}
                      style={{
                        flex: 1, padding: '10px 0', borderRadius: 8, fontWeight: 700, fontSize: 14, cursor: 'pointer',
                        border: frete === ft ? '2px solid #0d6efd' : '2px solid #d1d5db',
                        background: frete === ft ? '#0d6efd' : '#fff',
                        color: frete === ft ? '#fff' : '#374151',
                        transition: 'all .15s',
                      }}>
                      {ft}
                      <div style={{ fontSize: 10, fontWeight: 400, opacity: .8, marginTop: 2 }}>
                        {ft === 'CIF' ? 'Frete por conta do vendedor' : 'Frete por conta do comprador'}
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
            </>
          ) : (
            <>
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 4 }}>
                  Serviço <span style={{ color: '#dc3545' }}>*</span>
                </label>
                <div style={{ display: 'flex', gap: 8 }}>
                  {SERVICOS.map(s => (
                    <button
                      key={s.cod}
                      type="button"
                      onClick={() => setServico(s.cod)}
                      disabled={loading}
                      style={{
                        flex: 1, padding: '10px 8px', borderRadius: 8, fontWeight: 700, fontSize: 14, cursor: 'pointer',
                        border: servico === s.cod ? '2px solid #0d6efd' : '2px solid #d1d5db',
                        background: servico === s.cod ? '#0d6efd' : '#fff',
                        color: servico === s.cod ? '#fff' : '#374151',
                        transition: 'all .15s',
                      }}>
                      {s.label}
                      <div style={{ fontSize: 10, fontWeight: 400, opacity: .8, marginTop: 2 }}>{s.desc}</div>
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 4 }}>
                  Observação <span style={{ color: '#9ca3af' }}>(opcional)</span>
                </label>
                <input
                  className="form-control"
                  style={{ fontSize: 14, padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: 8 }}
                  placeholder="Ex: encaminhar com desenho X"
                  value={obsInterna}
                  onChange={e => setObsInterna(e.target.value)}
                  disabled={loading}
                />
              </div>
            </>
          )}

          {erro && (
            <div style={{ background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: 8, padding: '10px 14px', fontSize: 13, color: '#dc2626' }}>
              <i className="bi bi-exclamation-triangle" style={{ marginRight: 6 }} />{erro}
            </div>
          )}

          <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
            <button className="btn btn-outline" style={{ flex: 1 }} onClick={onClose} disabled={loading}>
              Cancelar
            </button>
            <button className="btn" style={{ flex: 2, background: '#0d6efd', color: '#fff', border: 'none' }} onClick={confirmar} disabled={loading}>
              {loading
                ? <><i className="bi bi-hourglass-split" /> Iniciando...</>
                : <><i className="bi bi-truck" /> Iniciar Entrega</>}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
