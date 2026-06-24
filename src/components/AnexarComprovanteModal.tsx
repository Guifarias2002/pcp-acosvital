'use client';
import { useState, useRef } from 'react';
import { getToken } from '@/lib/auth';

interface Props {
  itemId: number;
  pedidoNumero: string;
  onClose: () => void;
  onSuccess: () => void;
}

export default function AnexarComprovanteModal({ itemId, pedidoNumero, onClose, onSuccess }: Props) {
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);

  function handleFile(f: File | null, tipo: 'foto' | 'canhoto') {
    if (!f) return;
    setArquivo(f);
    setErro('');
    if (f.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onload = e => setPreview(e.target?.result as string);
      reader.readAsDataURL(f);
    } else {
      setPreview(null);
    }
    void tipo;
  }

  async function enviar() {
    if (!arquivo) { setErro('Selecione um arquivo.'); return; }
    setLoading(true);
    setErro('');
    try {
      const fd = new FormData();
      fd.append('comprovante', arquivo);
      fd.append('tipo', arquivo.type.startsWith('image/') ? 'foto' : 'canhoto');
      const res = await fetch(`/api/item/${itemId}/entregar`, {
        method: 'PATCH',
        body: fd,
        headers: { Authorization: `Bearer ${getToken() || ''}` },
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.erro || 'Erro'); }
      onSuccess();
    } catch (e: unknown) {
      setErro((e as Error).message || 'Erro ao enviar');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ background: '#fff', borderRadius: 12, width: '100%', maxWidth: 440, padding: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <div>
            <h5 style={{ margin: 0, fontWeight: 700, color: '#1a3a5c' }}>
              <i className="bi bi-paperclip" style={{ marginRight: 8 }} />
              Anexar Comprovante
            </h5>
            <small style={{ color: '#6b7280' }}>{pedidoNumero} — entrega já confirmada</small>
          </div>
          <button className="btn btn-ghost btn-sm" onClick={onClose} disabled={loading}>
            <i className="bi bi-x-lg" />
          </button>
        </div>

        {!arquivo ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <button onClick={() => cameraRef.current?.click()} disabled={loading}
              style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px', borderRadius: 10, border: '2px solid #16a34a', background: '#f0fdf4', color: '#166534', cursor: 'pointer', fontWeight: 700, fontSize: 13 }}>
              <i className="bi bi-camera-fill" style={{ fontSize: 22 }} />
              <div>
                <div>Tirar foto agora</div>
                <div style={{ fontSize: 11, fontWeight: 400, opacity: .7 }}>Canhoto ou comprovante de entrega</div>
              </div>
            </button>
            <input ref={cameraRef} type="file" accept="image/*" capture="environment" style={{ display: 'none' }}
              onChange={e => handleFile(e.target.files?.[0] || null, 'foto')} />

            <button onClick={() => fileRef.current?.click()} disabled={loading}
              style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px', borderRadius: 10, border: '2px solid #2563eb', background: '#eff6ff', color: '#1d4ed8', cursor: 'pointer', fontWeight: 700, fontSize: 13 }}>
              <i className="bi bi-file-earmark-arrow-up-fill" style={{ fontSize: 22 }} />
              <div>
                <div>Enviar arquivo</div>
                <div style={{ fontSize: 11, fontWeight: 400, opacity: .7 }}>PDF, JPG ou PNG do canhoto escaneado</div>
              </div>
            </button>
            <input ref={fileRef} type="file" accept="image/*,.pdf" style={{ display: 'none' }}
              onChange={e => handleFile(e.target.files?.[0] || null, 'canhoto')} />
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {preview ? (
              <img src={preview} alt="Preview" style={{ width: '100%', maxHeight: 200, objectFit: 'contain', borderRadius: 8, border: '1px solid #e5e7eb' }} />
            ) : (
              <div style={{ background: '#f3f4f6', borderRadius: 8, padding: '16px', textAlign: 'center', color: '#6b7280', fontSize: 13 }}>
                <i className="bi bi-file-earmark-pdf-fill" style={{ fontSize: 32, color: '#dc2626', display: 'block', marginBottom: 6 }} />
                {arquivo.name}
              </div>
            )}
            <button onClick={() => { setArquivo(null); setPreview(null); }}
              style={{ fontSize: 12, color: '#6b7280', background: 'none', border: '1px solid #e5e7eb', borderRadius: 6, padding: '6px 0', cursor: 'pointer' }}>
              ← Trocar arquivo
            </button>
          </div>
        )}

        {erro && (
          <div style={{ marginTop: 12, background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: 8, padding: '10px 14px', fontSize: 13, color: '#dc2626' }}>
            <i className="bi bi-exclamation-triangle" style={{ marginRight: 6 }} />{erro}
          </div>
        )}

        <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
          <button className="btn btn-outline" style={{ flex: 1 }} onClick={onClose} disabled={loading}>
            Cancelar
          </button>
          <button className="btn btn-success" style={{ flex: 2 }} onClick={enviar} disabled={loading || !arquivo}>
            {loading
              ? <><i className="bi bi-hourglass-split" /> Enviando...</>
              : <><i className="bi bi-cloud-upload-fill" /> Enviar Comprovante</>}
          </button>
        </div>
      </div>
    </div>
  );
}
