'use client';
import { useState, useRef } from 'react';
import { entregarPedido } from '@/lib/api';

export interface ItemEntrega {
  item_pedido_id: number;
  item_codigo: string;
  item_descricao?: string;
  quantidade?: string | number;
  unidade?: string;
}

interface Props {
  pedidoId: number;
  pedidoNumero: string;
  itens: ItemEntrega[];      // itens que serão entregues (já filtrados: na Logística)
  onConfirm: () => void;     // sucesso → recarregar
  onCancel: () => void;
}

interface Anexo { file: File; preview: string | null }

function novaChave(): string {
  const c = (globalThis as { crypto?: Crypto }).crypto;
  if (c?.randomUUID) return c.randomUUID();
  return `entrega-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

export default function EntregarPedidoModal({ pedidoId, pedidoNumero, itens, onConfirm, onCancel }: Props) {
  const [step, setStep] = useState<'anexar' | 'confirm'>('anexar');
  const [anexos, setAnexos] = useState<Anexo[]>([]);
  const [observacao, setObservacao] = useState('');
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  // Chave de idempotência estável para ESTE modal — reusada em reenvios (queda
  // de internet) para o servidor não entregar/anexar em dobro.
  const chaveRef = useRef<string>(novaChave());
  const enviandoRef = useRef(false);

  function addFiles(list: FileList | null) {
    if (!list) return;
    const novos: Anexo[] = [];
    for (const f of Array.from(list)) {
      const anexo: Anexo = { file: f, preview: null };
      if (f.type.startsWith('image/')) {
        const reader = new FileReader();
        reader.onload = e => setAnexos(prev => prev.map(a => a.file === f ? { ...a, preview: e.target?.result as string } : a));
        reader.readAsDataURL(f);
      }
      novos.push(anexo);
    }
    setAnexos(prev => [...prev, ...novos]);
    setErro(null);
  }

  function removeAnexo(idx: number) {
    setAnexos(prev => prev.filter((_, i) => i !== idx));
  }

  async function confirmar() {
    if (enviandoRef.current) return;   // guarda síncrona contra toque duplo
    enviandoRef.current = true;
    setLoading(true);
    setErro(null);
    try {
      await entregarPedido(pedidoId, anexos.map(a => a.file), observacao, chaveRef.current);
      onConfirm();
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { erro?: string } }; message?: string })?.response?.data?.erro
        || (e as Error)?.message || 'Erro ao entregar o pedido';
      setErro(msg);
    } finally {
      setLoading(false);
      enviandoRef.current = false;
    }
  }

  const overlay: React.CSSProperties = {
    position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)',
    display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16,
  };
  const box: React.CSSProperties = {
    background: '#fff', borderRadius: 16, padding: 24, width: 480,
    maxWidth: '95vw', maxHeight: '92vh', overflowY: 'auto', boxShadow: '0 8px 40px rgba(0,0,0,.2)',
  };
  const btnAcao: React.CSSProperties = {
    width: '100%', border: 'none', borderRadius: 10, padding: '14px 16px',
    fontSize: 13, fontWeight: 700, cursor: 'pointer', textAlign: 'left',
    display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8,
  };

  return (
    <div style={overlay}>
      <div style={box}>
        {/* Header */}
        <div style={{ marginBottom: 18 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#888', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 }}>
            Entregar pedido completo
          </div>
          <div style={{ fontSize: 18, fontWeight: 800, color: '#166534' }}>
            <i className="bi bi-truck" style={{ marginRight: 8 }} />
            Pedido {pedidoNumero}
          </div>
          <div style={{ fontSize: 13, color: '#666', marginTop: 2 }}>
            {itens.length} {itens.length === 1 ? 'item na Logística' : 'itens na Logística'} serão entregues
          </div>
        </div>

        {erro && (
          <div style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#dc2626', borderRadius: 8, padding: '10px 14px', fontSize: 13, marginBottom: 16 }}>
            <i className="bi bi-exclamation-triangle" style={{ marginRight: 6 }} />{erro}
            <button onClick={() => setErro(null)} style={{ float: 'right', background: 'none', border: 'none', cursor: 'pointer', color: '#dc2626', fontWeight: 700 }}>×</button>
          </div>
        )}

        {/* Indicador de passos */}
        <div style={{ display: 'flex', gap: 6, marginBottom: 18 }}>
          {['Canhoto', 'Confirmar'].map((s, i) => {
            const idx = step === 'anexar' ? 0 : 1;
            return (
              <div key={s} style={{ flex: 1, textAlign: 'center' }}>
                <div style={{ height: 4, borderRadius: 2, background: i <= idx ? '#16a34a' : '#e5e7eb', marginBottom: 4 }} />
                <span style={{ fontSize: 10, color: i <= idx ? '#16a34a' : '#aaa', fontWeight: 600 }}>{s}</span>
              </div>
            );
          })}
        </div>

        {/* STEP 1 — anexar canhotos */}
        {step === 'anexar' && (
          <>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#333', marginBottom: 12 }}>
              Anexe o(s) canhoto(s) do pedido
            </div>

            <button onClick={() => cameraRef.current?.click()} style={{ ...btnAcao, background: '#f0fdf4', border: '2px solid #16a34a', color: '#166534' }}>
              <i className="bi bi-camera-fill" style={{ fontSize: 24, flexShrink: 0 }} />
              <div>
                <div>Tirar foto agora</div>
                <div style={{ fontSize: 11, fontWeight: 400, opacity: .7 }}>Canhoto, romaneio ou comprovante</div>
              </div>
            </button>
            <input ref={cameraRef} type="file" accept="image/*" capture="environment" style={{ display: 'none' }}
              onChange={e => { addFiles(e.target.files); e.target.value = ''; }} />

            <button onClick={() => fileRef.current?.click()} style={{ ...btnAcao, background: '#eff6ff', border: '2px solid #2563eb', color: '#1d4ed8' }}>
              <i className="bi bi-file-earmark-arrow-up-fill" style={{ fontSize: 24, flexShrink: 0 }} />
              <div>
                <div>Enviar arquivo(s)</div>
                <div style={{ fontSize: 11, fontWeight: 400, opacity: .7 }}>PDF, JPG ou PNG — pode selecionar vários</div>
              </div>
            </button>
            <input ref={fileRef} type="file" accept="image/*,.pdf" multiple style={{ display: 'none' }}
              onChange={e => { addFiles(e.target.files); e.target.value = ''; }} />

            {/* Lista de anexos */}
            {anexos.length > 0 && (
              <div style={{ margin: '12px 0', display: 'flex', flexDirection: 'column', gap: 8 }}>
                {anexos.map((a, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, border: '1px solid #e5e7eb', borderRadius: 8, padding: 8 }}>
                    {a.preview
                      ? <img src={a.preview} alt="" style={{ width: 42, height: 42, objectFit: 'cover', borderRadius: 6 }} />
                      : <i className="bi bi-file-earmark-pdf-fill" style={{ fontSize: 28, color: '#dc2626' }} />}
                    <span style={{ flex: 1, fontSize: 12, color: '#374151', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.file.name}</span>
                    <button onClick={() => removeAnexo(i)} style={{ background: 'none', border: 'none', color: '#dc2626', cursor: 'pointer', fontSize: 16 }} title="Remover">
                      <i className="bi bi-x-lg" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            <div style={{ marginTop: 4, marginBottom: 16 }}>
              <label style={{ fontSize: 12, fontWeight: 700, color: '#555', display: 'block', marginBottom: 6 }}>
                Observação <span style={{ color: '#aaa', fontWeight: 400 }}>(opcional)</span>
              </label>
              <textarea value={observacao} onChange={e => setObservacao(e.target.value)} rows={2}
                placeholder="Ex: Retirado por João / transportadora X..."
                style={{ width: '100%', border: '1px solid #e5e7eb', borderRadius: 8, padding: '10px 12px', fontSize: 13, resize: 'none', boxSizing: 'border-box' }} />
            </div>

            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={onCancel}
                style={{ flex: 1, background: '#f3f4f6', color: '#555', border: 'none', borderRadius: 8, padding: '11px 0', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                Cancelar
              </button>
              <button onClick={() => setStep('confirm')}
                style={{ flex: 2, background: '#16a34a', color: '#fff', border: 'none', borderRadius: 8, padding: '11px 0', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
                Continuar →
              </button>
            </div>
          </>
        )}

        {/* STEP 2 — confirmar */}
        {step === 'confirm' && (
          <>
            <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 10, padding: '14px 16px', marginBottom: 14 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#166534', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>
                Itens que serão entregues ({itens.length})
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13, maxHeight: 200, overflowY: 'auto' }}>
                {itens.map(it => (
                  <div key={it.item_pedido_id} style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                    <span style={{ color: '#166534', fontWeight: 600 }}>{it.item_codigo}</span>
                    <span style={{ color: '#555', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{it.item_descricao || ''}</span>
                    {it.quantidade != null && <span style={{ color: '#888', whiteSpace: 'nowrap' }}>{it.quantidade} {it.unidade || ''}</span>}
                  </div>
                ))}
              </div>
            </div>

            <div style={{ fontSize: 13, marginBottom: 14 }}>
              <span style={{ color: '#888' }}>Canhotos anexados: </span>
              {anexos.length > 0
                ? <strong style={{ color: '#2563eb' }}><i className="bi bi-paperclip" style={{ marginRight: 4 }} />{anexos.length}</strong>
                : <strong style={{ color: '#b45309' }}>Nenhum</strong>}
            </div>

            {anexos.length === 0 && (
              <div style={{ background: '#fef9c3', border: '1px solid #fde047', borderRadius: 8, padding: '10px 12px', marginBottom: 14, fontSize: 12, color: '#92400e' }}>
                <i className="bi bi-exclamation-triangle-fill" style={{ marginRight: 6 }} />
                Nenhum canhoto anexado. Você pode voltar e anexar, ou entregar mesmo assim.
              </div>
            )}

            <div style={{ background: '#fef9c3', border: '1px solid #fde047', borderRadius: 8, padding: '10px 12px', marginBottom: 16, fontSize: 12, color: '#92400e' }}>
              <i className="bi bi-exclamation-triangle-fill" style={{ marginRight: 6 }} />
              Esta ação confirmará a entrega ao cliente e <strong>não poderá ser desfeita</strong>.
            </div>

            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => setStep('anexar')} disabled={loading}
                style={{ flex: 1, background: '#f3f4f6', color: '#555', border: 'none', borderRadius: 8, padding: '11px 0', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                ← Voltar
              </button>
              <button onClick={confirmar} disabled={loading}
                style={{ flex: 2, background: '#16a34a', color: '#fff', border: 'none', borderRadius: 8, padding: '11px 0', fontSize: 14, fontWeight: 700, cursor: 'pointer', opacity: loading ? .7 : 1 }}>
                <i className="bi bi-check-circle-fill" style={{ marginRight: 6 }} />
                {loading ? 'Entregando...' : 'Confirmar Entrega'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
