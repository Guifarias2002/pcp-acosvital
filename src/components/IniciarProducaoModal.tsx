'use client';
import { useState } from 'react';
import { MAQUINAS_POR_SETOR } from '@/lib/maquinas';

interface Props {
  setor: string;
  onCancel: () => void;
  onConfirm: (maquina: string, operador: string) => void;
  loading?: boolean;
}

export default function IniciarProducaoModal({ setor, onCancel, onConfirm, loading }: Props) {
  const [maquina, setMaquina] = useState('');
  const [operador, setOperador] = useState('');
  const grupos = MAQUINAS_POR_SETOR[setor] || [];
  const podeConfirmar = maquina.trim() !== '' && operador.trim() !== '';

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
    }}>
      <div style={{ background: '#fff', borderRadius: 14, padding: 28, width: 420, maxWidth: '94vw', boxShadow: '0 8px 32px rgba(0,0,0,.18)' }}>
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#888', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 }}>
            Iniciar Produção
          </div>
          <div style={{ fontSize: 18, fontWeight: 800, color: '#1a3a5c' }}>
            Qual máquina e quem vai operar?
          </div>
        </div>

        <label style={{ fontSize: 12, fontWeight: 600, color: '#555', display: 'block', marginBottom: 6 }}>
          Máquina
        </label>
        <select
          value={maquina}
          onChange={e => setMaquina(e.target.value)}
          autoFocus
          style={{ width: '100%', border: '1px solid #dee2e6', borderRadius: 6, padding: '9px 10px', fontSize: 14, fontWeight: 600, marginBottom: 16, boxSizing: 'border-box' }}
        >
          <option value="">Selecione a máquina...</option>
          {grupos.map(g => (
            <optgroup key={g.categoria} label={g.categoria}>
              {g.maquinas.map(m => <option key={m} value={m}>{m}</option>)}
            </optgroup>
          ))}
        </select>

        <label style={{ fontSize: 12, fontWeight: 600, color: '#555', display: 'block', marginBottom: 6 }}>
          Operador
        </label>
        <input
          type="text"
          value={operador}
          onChange={e => setOperador(e.target.value)}
          placeholder="Nome de quem vai operar a máquina"
          style={{ width: '100%', border: '1px solid #dee2e6', borderRadius: 6, padding: '9px 10px', fontSize: 14, marginBottom: 20, boxSizing: 'border-box' }}
        />

        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={onCancel} disabled={loading}
            style={{ flex: 1, background: '#f3f4f6', color: '#555', border: 'none', borderRadius: 8, padding: '11px 0', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
            Cancelar
          </button>
          <button
            onClick={() => onConfirm(maquina.trim(), operador.trim())}
            disabled={loading || !podeConfirmar}
            style={{ flex: 2, background: '#16a34a', color: '#fff', border: 'none', borderRadius: 8, padding: '11px 0', fontSize: 13, fontWeight: 700, cursor: 'pointer', opacity: (loading || !podeConfirmar) ? .6 : 1 }}>
            <i className="bi bi-play-circle-fill" style={{ marginRight: 6 }} />
            {loading ? 'Iniciando...' : 'Iniciar produção'}
          </button>
        </div>
      </div>
    </div>
  );
}
