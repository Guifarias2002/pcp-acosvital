'use client';
import { useState, useRef } from 'react';
import { getToken } from '@/lib/auth';

interface Props {
  itemId: number;
  pedidoNumero: string;
  descricao: string;
  quantidade: string;
  unidade: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function EntregarModal({ itemId, pedidoNumero, descricao, quantidade, unidade, onConfirm, onCancel }: Props) {
  const [step, setStep] = useState<'nf' | 'comprovante' | 'confirm'>('nf');
  const [numeroNf, setNumeroNf] = useState('');
  const [observacao, setObservacao] = useState('');
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [tipo, setTipo] = useState<'foto' | 'canhoto' | null>(null);
  const [loading, setLoading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);

  function handleFile(f: File | null, t: 'foto' | 'canhoto') {
    if (!f) return;
    setArquivo(f);
    setTipo(t);
    if (f.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onload = e => setPreview(e.target?.result as string);
      reader.readAsDataURL(f);
    } else {
      setPreview(null);
    }
    setStep('confirm');
  }

  async function confirmar() {
    setLoading(true);
    try {
      const fd = new FormData();
      fd.append('numero_nf', numeroNf.trim());
      fd.append('observacao', observacao);
      if (arquivo) { fd.append('comprovante', arquivo); fd.append('tipo', tipo || 'foto'); }
      const res = await fetch(`/api/item/${itemId}/entregar`, {
        method: 'POST',
        body: fd,
        headers: { Authorization: `Bearer ${getToken() || ''}` },
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.erro || 'Erro'); }
      onConfirm();
    } catch (e: unknown) {
      alert((e as Error).message || 'Erro ao confirmar entrega');
    } finally {
      setLoading(false);
    }
  }

  const overlay: React.CSSProperties = {
    position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)',
    display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
  };
  const box: React.CSSProperties = {
    background: '#fff', borderRadius: 16, padding: 28, width: 460,
    maxWidth: '95vw', boxShadow: '0 8px 40px rgba(0,0,0,.2)',
  };
  const btnBase: React.CSSProperties = {
    width: '100%', border: 'none', borderRadius: 10, padding: '14px 16px',
    fontSize: 13, fontWeight: 700, cursor: 'pointer', textAlign: 'left',
    display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8,
  };

  return (
    <div style={overlay}>
      <div style={box}>
        {/* Header */}
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#888', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 }}>
            Confirmação de Entrega
          </div>
          <div style={{ fontSize: 18, fontWeight: 800, color: '#166534' }}>
            <i className="bi bi-check-circle-fill" style={{ marginRight: 8 }} />
            {pedidoNumero}
          </div>
          <div style={{ fontSize: 13, color: '#666', marginTop: 2 }}>
            {descricao} · <strong>{quantidade} {unidade}</strong>
          </div>
        </div>

        {/* Indicador de passos */}
        <div style={{ display: 'flex', gap: 6, marginBottom: 20 }}>
          {['Nota Fiscal', 'Comprovante', 'Confirmar'].map((s, i) => {
            const idx = step === 'nf' ? 0 : step === 'comprovante' ? 1 : 2;
            return (
              <div key={s} style={{ flex: 1, textAlign: 'center' }}>
                <div style={{ height: 4, borderRadius: 2, background: i <= idx ? '#16a34a' : '#e5e7eb', marginBottom: 4 }} />
                <span style={{ fontSize: 10, color: i <= idx ? '#16a34a' : '#aaa', fontWeight: 600 }}>{s}</span>
              </div>
            );
          })}
        </div>

        {/* STEP 1 — NF */}
        {step === 'nf' && (
          <>
            <div style={{ marginBottom: 16 }}>
              <label style={{ fontSize: 12, fontWeight: 700, color: '#555', display: 'block', marginBottom: 6 }}>
                Número da Nota Fiscal <span style={{ color: '#dc2626' }}>*</span>
              </label>
              <input
                type="text" value={numeroNf} onChange={e => setNumeroNf(e.target.value)}
                placeholder="Ex: 001234" autoFocus
                style={{ width: '100%', border: '2px solid #d1fae5', borderRadius: 8, padding: '10px 12px', fontSize: 16, fontWeight: 700, boxSizing: 'border-box', outline: 'none' }}
              />
            </div>
            <div style={{ marginBottom: 20 }}>
              <label style={{ fontSize: 12, fontWeight: 700, color: '#555', display: 'block', marginBottom: 6 }}>
                Observação <span style={{ color: '#aaa', fontWeight: 400 }}>(opcional)</span>
              </label>
              <textarea
                value={observacao} onChange={e => setObservacao(e.target.value)} rows={2}
                placeholder="Ex: Entregue ao responsável João Silva..."
                style={{ width: '100%', border: '1px solid #e5e7eb', borderRadius: 8, padding: '10px 12px', fontSize: 13, resize: 'none', boxSizing: 'border-box' }}
              />
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={onCancel}
                style={{ flex: 1, background: '#f3f4f6', color: '#555', border: 'none', borderRadius: 8, padding: '11px 0', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                Cancelar
              </button>
              <button onClick={() => setStep('comprovante')} disabled={!numeroNf.trim()}
                style={{ flex: 2, background: '#16a34a', color: '#fff', border: 'none', borderRadius: 8, padding: '11px 0', fontSize: 13, fontWeight: 700, cursor: 'pointer', opacity: !numeroNf.trim() ? .5 : 1 }}>
                Continuar →
              </button>
            </div>
          </>
        )}

        {/* STEP 2 — Comprovante */}
        {step === 'comprovante' && (
          <>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#333', marginBottom: 12 }}>
              Deseja anexar um comprovante?
            </div>

            {/* Câmera */}
            <button onClick={() => cameraRef.current?.click()} style={{ ...btnBase, background: '#f0fdf4', border: '2px solid #16a34a', color: '#166534' }}>
              <i className="bi bi-camera-fill" style={{ fontSize: 24, flexShrink: 0 }} />
              <div>
                <div>Tirar foto agora</div>
                <div style={{ fontSize: 11, fontWeight: 400, opacity: .7 }}>Canhoto, romaneio ou comprovante de recebimento</div>
              </div>
            </button>
            <input ref={cameraRef} type="file" accept="image/*" capture="environment" style={{ display: 'none' }}
              onChange={e => handleFile(e.target.files?.[0] || null, 'foto')} />

            {/* Upload */}
            <button onClick={() => fileRef.current?.click()} style={{ ...btnBase, background: '#eff6ff', border: '2px solid #2563eb', color: '#1d4ed8' }}>
              <i className="bi bi-file-earmark-arrow-up-fill" style={{ fontSize: 24, flexShrink: 0 }} />
              <div>
                <div>Enviar arquivo</div>
                <div style={{ fontSize: 11, fontWeight: 400, opacity: .7 }}>PDF, JPG ou PNG do canhoto escaneado</div>
              </div>
            </button>
            <input ref={fileRef} type="file" accept="image/*,.pdf" style={{ display: 'none' }}
              onChange={e => handleFile(e.target.files?.[0] || null, 'canhoto')} />

            {/* Pular */}
            <button onClick={() => setStep('confirm')} style={{ ...btnBase, background: '#f9fafb', border: '2px solid #e5e7eb', color: '#6b7280', marginBottom: 16 }}>
              <i className="bi bi-clock" style={{ fontSize: 24, flexShrink: 0 }} />
              <div>
                <div>Anexar comprovante depois</div>
                <div style={{ fontSize: 11, fontWeight: 400, opacity: .7 }}>Confirma agora, anexa foto ou arquivo depois</div>
              </div>
            </button>

            <button onClick={() => setStep('nf')}
              style={{ width: '100%', background: 'none', border: '1px solid #e5e7eb', borderRadius: 8, padding: '8px 0', fontSize: 12, color: '#888', cursor: 'pointer' }}>
              ← Voltar
            </button>
          </>
        )}

        {/* STEP 3 — Confirmar */}
        {step === 'confirm' && (
          <>
            <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 10, padding: '14px 16px', marginBottom: 16 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#166534', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>Resumo da Entrega</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13 }}>
                <div><span style={{ color: '#888', minWidth: 100, display: 'inline-block' }}>Nota Fiscal:</span> <strong style={{ color: '#166534' }}>NF {numeroNf}</strong></div>
                <div><span style={{ color: '#888', minWidth: 100, display: 'inline-block' }}>Quantidade:</span> <strong>{quantidade} {unidade}</strong></div>
                {observacao && <div><span style={{ color: '#888', minWidth: 100, display: 'inline-block' }}>Observação:</span> {observacao}</div>}
                <div><span style={{ color: '#888', minWidth: 100, display: 'inline-block' }}>Comprovante:</span>
                  {arquivo ? (
                    <span style={{ color: '#2563eb', fontWeight: 600 }}><i className="bi bi-paperclip" style={{ marginRight: 4 }} />{arquivo.name}</span>
                  ) : (
                    <span style={{ color: '#aaa' }}>Não anexado</span>
                  )}
                </div>
              </div>
            </div>

            {/* Preview da imagem */}
            {preview && (
              <div style={{ marginBottom: 16, textAlign: 'center' }}>
                <img src={preview} alt="Comprovante" style={{ maxWidth: '100%', maxHeight: 180, borderRadius: 8, border: '1px solid #e5e7eb', objectFit: 'contain' }} />
              </div>
            )}

            <div style={{ background: '#fef9c3', border: '1px solid #fde047', borderRadius: 8, padding: '10px 12px', marginBottom: 16, fontSize: 12, color: '#92400e' }}>
              <i className="bi bi-exclamation-triangle-fill" style={{ marginRight: 6 }} />
              Esta ação confirmará a entrega ao cliente e <strong>não poderá ser desfeita</strong>.
            </div>

            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => { setArquivo(null); setPreview(null); setTipo(null); setStep('comprovante'); }} disabled={loading}
                style={{ flex: 1, background: '#f3f4f6', color: '#555', border: 'none', borderRadius: 8, padding: '11px 0', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                ← Voltar
              </button>
              <button onClick={confirmar} disabled={loading}
                style={{ flex: 2, background: '#16a34a', color: '#fff', border: 'none', borderRadius: 8, padding: '11px 0', fontSize: 14, fontWeight: 700, cursor: 'pointer', opacity: loading ? .7 : 1 }}>
                <i className="bi bi-check-circle-fill" style={{ marginRight: 6 }} />
                {loading ? 'Confirmando...' : 'Confirmar Entrega'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
