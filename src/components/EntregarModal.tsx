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

interface EntregaLinha {
  chave: string;
  numeroNf: string;
  arquivo: File | null;
  preview: string | null;
}

function novaLinha(): EntregaLinha {
  const c = (globalThis as { crypto?: Crypto }).crypto;
  const chave = c?.randomUUID ? c.randomUUID() : `l-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  return { chave, numeroNf: '', arquivo: null, preview: null };
}

export default function EntregarModal({ itemId, pedidoNumero, descricao, quantidade, unidade, onConfirm, onCancel }: Props) {
  const [step, setStep] = useState<'nf' | 'confirm'>('nf');
  const [linhas, setLinhas] = useState<EntregaLinha[]>([novaLinha()]);
  const [observacao, setObservacao] = useState('');
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const fileRefs = useRef<Map<string, HTMLInputElement>>(new Map());

  function setLinha(chave: string, patch: Partial<EntregaLinha>) {
    setLinhas(prev => prev.map(l => l.chave === chave ? { ...l, ...patch } : l));
  }

  function handleArquivo(chave: string, f: File | null) {
    if (!f) return;
    setLinha(chave, { arquivo: f, preview: null });
    if (f.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onload = e => setLinha(chave, { preview: e.target?.result as string });
      reader.readAsDataURL(f);
    }
  }

  function adicionarLinha() {
    setLinhas(prev => [...prev, novaLinha()]);
  }

  function removerLinha(chave: string) {
    setLinhas(prev => prev.length > 1 ? prev.filter(l => l.chave !== chave) : prev);
  }

  const podeContinuar = linhas.every(l => l.numeroNf.trim());

  async function confirmar() {
    setLoading(true);
    try {
      const fd = new FormData();
      fd.append('entregas', JSON.stringify(linhas.map(l => ({ numero_nf: l.numeroNf.trim() }))));
      fd.append('observacao', observacao);
      linhas.forEach((l, i) => {
        if (l.arquivo) {
          fd.append(`comprovante_${i}`, l.arquivo);
          fd.append(`tipo_${i}`, 'canhoto');
        }
      });
      const res = await fetch(`/api/item/${itemId}/entregar`, {
        method: 'POST',
        body: fd,
        headers: { Authorization: `Bearer ${getToken() || ''}` },
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.erro || 'Erro'); }
      onConfirm();
    } catch (e: unknown) {
      setErro((e as Error).message || 'Erro ao confirmar entrega');
    } finally {
      setLoading(false);
    }
  }

  const overlay: React.CSSProperties = {
    position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)',
    display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16,
  };
  const box: React.CSSProperties = {
    background: '#fff', borderRadius: 16, padding: 28, width: 480,
    maxWidth: '95vw', maxHeight: '92vh', overflowY: 'auto', boxShadow: '0 8px 40px rgba(0,0,0,.2)',
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

        {erro && (
          <div style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#dc2626', borderRadius: 8, padding: '10px 14px', fontSize: 13, marginBottom: 16 }}>
            <i className="bi bi-exclamation-triangle" style={{ marginRight: 6 }} />
            {erro}
            <button onClick={() => setErro(null)} style={{ float: 'right', background: 'none', border: 'none', cursor: 'pointer', color: '#dc2626', fontWeight: 700 }}>×</button>
          </div>
        )}

        {/* Indicador de passos */}
        <div style={{ display: 'flex', gap: 6, marginBottom: 20 }}>
          {['Notas Fiscais', 'Confirmar'].map((s, i) => {
            const idx = step === 'nf' ? 0 : 1;
            return (
              <div key={s} style={{ flex: 1, textAlign: 'center' }}>
                <div style={{ height: 4, borderRadius: 2, background: i <= idx ? '#16a34a' : '#e5e7eb', marginBottom: 4 }} />
                <span style={{ fontSize: 10, color: i <= idx ? '#16a34a' : '#aaa', fontWeight: 600 }}>{s}</span>
              </div>
            );
          })}
        </div>

        {/* STEP 1 — NFs + canhotos */}
        {step === 'nf' && (
          <>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#333', marginBottom: 4 }}>
              Nota(s) fiscal(is) desta entrega
            </div>
            <div style={{ fontSize: 11, color: '#888', marginBottom: 12 }}>
              Se a entrega saiu com mais de uma NF, adicione uma linha pra cada uma — cada linha pode ter seu próprio canhoto.
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 12 }}>
              {linhas.map((l, i) => (
                <div key={l.chave} style={{ border: '1.5px solid #d1fae5', borderRadius: 10, padding: 10 }}>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: l.arquivo ? 8 : 0 }}>
                    <input
                      type="text" value={l.numeroNf} onChange={e => setLinha(l.chave, { numeroNf: e.target.value })}
                      placeholder={`Nº da NF${linhas.length > 1 ? ` (${i + 1})` : ''}`} autoFocus={i === 0}
                      style={{ flex: 1, border: '1px solid #d1fae5', borderRadius: 8, padding: '8px 10px', fontSize: 14, fontWeight: 700, outline: 'none' }}
                    />
                    <input
                      ref={el => { if (el) fileRefs.current.set(l.chave, el); }}
                      type="file" accept="image/*,.pdf" style={{ display: 'none' }}
                      onChange={e => { handleArquivo(l.chave, e.target.files?.[0] || null); e.target.value = ''; }}
                    />
                    <button onClick={() => fileRefs.current.get(l.chave)?.click()} title="Anexar canhoto"
                      style={{ background: l.arquivo ? '#eff6ff' : '#f9fafb', border: `1.5px solid ${l.arquivo ? '#2563eb' : '#e5e7eb'}`, color: l.arquivo ? '#1d4ed8' : '#6b7280', borderRadius: 8, padding: '8px 10px', cursor: 'pointer', fontSize: 16, lineHeight: 1 }}>
                      <i className="bi bi-paperclip" />
                    </button>
                    {linhas.length > 1 && (
                      <button onClick={() => removerLinha(l.chave)} title="Remover"
                        style={{ background: 'none', border: 'none', color: '#dc2626', cursor: 'pointer', fontSize: 16 }}>
                        <i className="bi bi-x-lg" />
                      </button>
                    )}
                  </div>
                  {l.arquivo && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      {l.preview
                        ? <img src={l.preview} alt="" style={{ width: 34, height: 34, objectFit: 'cover', borderRadius: 6 }} />
                        : <i className="bi bi-file-earmark-pdf-fill" style={{ fontSize: 22, color: '#dc2626' }} />}
                      <span style={{ fontSize: 11, color: '#374151', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{l.arquivo.name}</span>
                    </div>
                  )}
                </div>
              ))}
            </div>

            <button onClick={adicionarLinha}
              style={{ width: '100%', background: '#f0fdf4', border: '1.5px dashed #16a34a', color: '#166534', borderRadius: 8, padding: '8px 0', fontSize: 12, fontWeight: 700, cursor: 'pointer', marginBottom: 16 }}>
              <i className="bi bi-plus-lg" style={{ marginRight: 6 }} />Adicionar outra NF
            </button>

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
              <button onClick={() => setStep('confirm')} disabled={!podeContinuar}
                style={{ flex: 2, background: '#16a34a', color: '#fff', border: 'none', borderRadius: 8, padding: '11px 0', fontSize: 13, fontWeight: 700, cursor: 'pointer', opacity: !podeContinuar ? .5 : 1 }}>
                Continuar →
              </button>
            </div>
          </>
        )}

        {/* STEP 2 — Confirmar */}
        {step === 'confirm' && (
          <>
            <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 10, padding: '14px 16px', marginBottom: 16 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#166534', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>Resumo da Entrega</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13 }}>
                <div><span style={{ color: '#888', minWidth: 100, display: 'inline-block' }}>Quantidade:</span> <strong>{quantidade} {unidade}</strong></div>
                {observacao && <div><span style={{ color: '#888', minWidth: 100, display: 'inline-block' }}>Observação:</span> {observacao}</div>}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 2 }}>
                  <span style={{ color: '#888' }}>Notas fiscais:</span>
                  {linhas.map(l => (
                    <div key={l.chave} style={{ display: 'flex', alignItems: 'center', gap: 6, paddingLeft: 4 }}>
                      <strong style={{ color: '#166534' }}>NF {l.numeroNf}</strong>
                      {l.arquivo
                        ? <span style={{ color: '#2563eb', fontSize: 12 }}><i className="bi bi-paperclip" style={{ marginRight: 3 }} />{l.arquivo.name}</span>
                        : <span style={{ color: '#aaa', fontSize: 12 }}>sem canhoto</span>}
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div style={{ background: '#fef9c3', border: '1px solid #fde047', borderRadius: 8, padding: '10px 12px', marginBottom: 16, fontSize: 12, color: '#92400e' }}>
              <i className="bi bi-exclamation-triangle-fill" style={{ marginRight: 6 }} />
              Esta ação confirmará a entrega ao cliente e <strong>não poderá ser desfeita</strong>.
            </div>

            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => setStep('nf')} disabled={loading}
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
