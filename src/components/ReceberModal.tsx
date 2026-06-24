'use client';
import { useState } from 'react';

type Decisao = 'iniciar' | 'preparar' | 'divergente';

interface Props {
  itemId?: number;
  itemCodigo?: string;
  itemDescricao?: string;
  setorOrigem?: string;
  quantidade: string;
  unidade: string;
  setor?: string;
  ocultarIniciar?: boolean;
  onConfirm: (decisao: Decisao, qtdParcial?: number, obs?: string) => void;
  onCancel: () => void;
  loading?: boolean;
}

export default function ReceberModal({ quantidade, unidade, setor = 'Setor', itemCodigo, itemDescricao, setorOrigem, ocultarIniciar, onConfirm, onCancel, loading }: Props) {
  const [step, setStep] = useState<'quantidade' | 'decisao' | 'divergente'>('quantidade');
  const [modo, setModo] = useState<'tudo' | 'parcial'>('tudo');
  const [qtdParcial, setQtdParcial] = useState('');
  const [obsDiv, setObsDiv] = useState('');
  const total = Number(quantidade);

  const qtdEscolhida = modo === 'tudo' ? total : Number(qtdParcial);

  function confirmarQuantidade() {
    if (modo === 'parcial') {
      const q = Number(qtdParcial);
      if (!q || q <= 0 || q >= total) return;
    }
    setStep('decisao');
  }

  const btnBase: React.CSSProperties = {
    border: 'none', borderRadius: 8, padding: '12px 16px',
    fontSize: 13, fontWeight: 700, cursor: 'pointer',
    display: 'flex', alignItems: 'flex-start', gap: 10,
    textAlign: 'left', width: '100%', transition: 'opacity .15s',
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
    }}>
      <div style={{ background: '#fff', borderRadius: 14, padding: 28, width: 420, maxWidth: '94vw', boxShadow: '0 8px 32px rgba(0,0,0,.18)' }}>

        {/* Header */}
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#888', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 }}>
            Recebimento de Material
          </div>
          <div style={{ fontSize: 18, fontWeight: 800, color: '#1a3a5c' }}>
            {setor}
          </div>
          {/* Item */}
          {itemCodigo && (
            <div style={{ marginTop: 10, background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, padding: '10px 14px' }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#1a3a5c' }}>
                <i className="bi bi-box-seam" style={{ marginRight: 6 }} />{itemCodigo}
                {itemDescricao && <span style={{ fontWeight: 400, color: '#64748b', marginLeft: 6 }}>{itemDescricao}</span>}
              </div>
              {setorOrigem && (
                <div style={{ fontSize: 11, color: '#64748b', marginTop: 5 }}>
                  <i className="bi bi-arrow-right-circle" style={{ marginRight: 5, color: '#0d6efd' }} />
                  Vindo de: <strong style={{ color: '#1a3a5c' }}>{setorOrigem}</strong>
                </div>
              )}
              <div style={{ fontSize: 12, color: '#555', marginTop: 6 }}>
                <strong style={{ color: '#1a3a5c' }}>{quantidade} {unidade}</strong> disponíveis para recebimento
              </div>
            </div>
          )}
          {!itemCodigo && (
            <div style={{ fontSize: 13, color: '#666', marginTop: 4 }}>
              <strong style={{ color: '#1a3a5c' }}>{quantidade} {unidade}</strong> disponíveis para recebimento
            </div>
          )}
        </div>

        {/* STEP 1 — Quantidade */}
        {step === 'quantidade' && (
          <>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#555', marginBottom: 10 }}>
              Vai receber tudo ou parcial?
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
              <button
                onClick={() => setModo('tudo')}
                style={{ ...btnBase, background: modo === 'tudo' ? '#eef2ff' : '#f8f9fa', border: `2px solid ${modo === 'tudo' ? '#1a3a5c' : '#e5e7eb'}`, color: modo === 'tudo' ? '#1a3a5c' : '#555' }}>
                <i className="bi bi-check-circle-fill" style={{ fontSize: 18, marginTop: 1, color: modo === 'tudo' ? '#1a3a5c' : '#ccc' }} />
                <div>
                  <div>Receber tudo</div>
                  <div style={{ fontSize: 11, fontWeight: 400, opacity: .7 }}>{quantidade} {unidade} completos</div>
                </div>
              </button>
              <button
                onClick={() => setModo('parcial')}
                style={{ ...btnBase, background: modo === 'parcial' ? '#eef2ff' : '#f8f9fa', border: `2px solid ${modo === 'parcial' ? '#1a3a5c' : '#e5e7eb'}`, color: modo === 'parcial' ? '#1a3a5c' : '#555' }}>
                <i className="bi bi-scissors" style={{ fontSize: 18, marginTop: 1, color: modo === 'parcial' ? '#1a3a5c' : '#ccc' }} />
                <div>
                  <div>Receber parcial</div>
                  <div style={{ fontSize: 11, fontWeight: 400, opacity: .7 }}>Parte chegou, resto vem depois</div>
                </div>
              </button>
            </div>

            {modo === 'parcial' && (
              <div style={{ marginBottom: 16 }}>
                <label style={{ fontSize: 12, fontWeight: 600, color: '#555', display: 'block', marginBottom: 6 }}>
                  Quantas peças estão chegando agora?
                </label>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <input
                    type="number" value={qtdParcial}
                    onChange={e => setQtdParcial(e.target.value)}
                    min={1} max={total - 1} autoFocus
                    placeholder={`1 a ${total - 1}`}
                    style={{ flex: 1, border: '1px solid #dee2e6', borderRadius: 6, padding: '8px 10px', fontSize: 16, fontWeight: 700 }}
                  />
                  <span style={{ fontSize: 13, color: '#666' }}>{unidade}</span>
                </div>
                {qtdParcial && Number(qtdParcial) > 0 && Number(qtdParcial) < total && (
                  <div style={{ marginTop: 8, background: '#fff3cd', borderRadius: 6, padding: '6px 10px', fontSize: 12, color: '#856404' }}>
                    <i className="bi bi-info-circle" style={{ marginRight: 5 }} />
                    {Number(total) - Number(qtdParcial)} {unidade} ainda vão chegar depois
                  </div>
                )}
              </div>
            )}

            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={onCancel} disabled={loading}
                style={{ flex: 1, background: '#f3f4f6', color: '#555', border: 'none', borderRadius: 8, padding: '11px 0', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                Cancelar
              </button>
              <button
                onClick={confirmarQuantidade}
                disabled={loading || (modo === 'parcial' && (!qtdParcial || Number(qtdParcial) <= 0 || Number(qtdParcial) >= total))}
                style={{ flex: 2, background: '#1a3a5c', color: '#fff', border: 'none', borderRadius: 8, padding: '11px 0', fontSize: 13, fontWeight: 700, cursor: 'pointer', opacity: loading ? .6 : 1 }}>
                Continuar →
              </button>
            </div>
          </>
        )}

        {/* STEP 2 — Decisão */}
        {step === 'decisao' && (
          <>
            <div style={{ background: '#f0f4ff', borderRadius: 8, padding: '10px 14px', marginBottom: 16, fontSize: 13, color: '#1a3a5c', fontWeight: 600 }}>
              <i className="bi bi-check2-circle" style={{ marginRight: 6 }} />
              Recebendo {modo === 'tudo' ? `${quantidade} ${unidade} (tudo)` : `${qtdParcial} ${unidade} (parcial)`}
            </div>

            <div style={{ fontSize: 12, fontWeight: 700, color: '#555', marginBottom: 10 }}>
              O material chegou em boas condições. O que deseja fazer?
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
              {!ocultarIniciar && (
                <button onClick={() => onConfirm('iniciar', modo === 'parcial' ? Number(qtdParcial) : undefined)} disabled={loading}
                  style={{ ...btnBase, background: '#dcfce7', border: '2px solid #16a34a', color: '#166534' }}>
                  <i className="bi bi-play-circle-fill" style={{ fontSize: 22, marginTop: 1 }} />
                  <div>
                    <div>Iniciar produção agora</div>
                    <div style={{ fontSize: 11, fontWeight: 400, opacity: .75 }}>Cronômetro começa imediatamente</div>
                  </div>
                </button>
              )}

              <button onClick={() => onConfirm('preparar', modo === 'parcial' ? Number(qtdParcial) : undefined)} disabled={loading}
                style={{ ...btnBase, background: ocultarIniciar ? '#dcfce7' : '#fef9c3', border: ocultarIniciar ? '2px solid #16a34a' : '2px solid #ca8a04', color: ocultarIniciar ? '#166534' : '#92400e' }}>
                <i className={`bi ${ocultarIniciar ? 'bi-box-seam-fill' : 'bi-hourglass-split'}`} style={{ fontSize: 22, marginTop: 1 }} />
                <div>
                  <div>{ocultarIniciar ? 'Confirmar recebimento' : 'Ainda estou me preparando'}</div>
                  <div style={{ fontSize: 11, fontWeight: 400, opacity: .75 }}>{ocultarIniciar ? 'Material chegou OK, aguardando despacho' : 'Material recebido, vou iniciar depois'}</div>
                </div>
              </button>

              <button onClick={() => setStep('divergente')} disabled={loading}
                style={{ ...btnBase, background: '#fee2e2', border: '2px solid #dc2626', color: '#991b1b' }}>
                <i className="bi bi-exclamation-triangle-fill" style={{ fontSize: 22, marginTop: 1 }} />
                <div>
                  <div>Pedido veio divergente</div>
                  <div style={{ fontSize: 11, fontWeight: 400, opacity: .75 }}>Quantidade ou qualidade com problema</div>
                </div>
              </button>
            </div>

            <button onClick={() => setStep('quantidade')}
              style={{ width: '100%', background: 'none', border: '1px solid #dee2e6', borderRadius: 8, padding: '8px 0', fontSize: 12, color: '#888', cursor: 'pointer' }}>
              ← Voltar
            </button>
          </>
        )}

        {/* STEP 3 — Divergência */}
        {step === 'divergente' && (
          <>
            <div style={{ background: '#fee2e2', borderRadius: 8, padding: '10px 14px', marginBottom: 16, fontSize: 13, color: '#991b1b', fontWeight: 600 }}>
              <i className="bi bi-exclamation-triangle-fill" style={{ marginRight: 6 }} />
              Registrando divergência
            </div>

            <div style={{ fontSize: 12, fontWeight: 700, color: '#555', marginBottom: 8 }}>
              Descreva o problema encontrado:
            </div>
            <textarea
              value={obsDiv} onChange={e => setObsDiv(e.target.value)}
              rows={3} autoFocus
              placeholder="Ex: Quantidade incorreta, peça com defeito, medidas fora do especificado..."
              style={{ width: '100%', border: '1px solid #fca5a5', borderRadius: 8, padding: '10px 12px', fontSize: 13, resize: 'vertical', boxSizing: 'border-box', marginBottom: 12 }}
            />

            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => setStep('decisao')}
                style={{ flex: 1, background: '#f3f4f6', color: '#555', border: 'none', borderRadius: 8, padding: '11px 0', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                ← Voltar
              </button>
              <button
                onClick={() => onConfirm('divergente', undefined, obsDiv || 'Divergência reportada')}
                disabled={loading}
                style={{ flex: 2, background: '#dc2626', color: '#fff', border: 'none', borderRadius: 8, padding: '11px 0', fontSize: 13, fontWeight: 700, cursor: 'pointer', opacity: loading ? .6 : 1 }}>
                <i className="bi bi-exclamation-triangle-fill" style={{ marginRight: 6 }} />
                {loading ? 'Registrando...' : 'Confirmar Divergência'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
