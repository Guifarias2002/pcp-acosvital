'use client';
import { useEffect } from 'react';

interface Props {
  titulo: string;
  mensagem: string;
  confirmLabel?: string;
  cancelLabel?: string;
  perigo?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function ConfirmModal({
  titulo, mensagem, confirmLabel = 'Confirmar', cancelLabel = 'Cancelar',
  perigo = false, onConfirm, onCancel,
}: Props) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
      if (e.key === 'Enter') onConfirm();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onConfirm, onCancel]);

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9999,
      background: 'rgba(0,0,0,0.45)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      backdropFilter: 'blur(2px)',
    }} onClick={onCancel}>
      <div style={{
        background: '#fff', borderRadius: 12, padding: '28px 32px',
        minWidth: 340, maxWidth: 440, boxShadow: '0 20px 60px rgba(0,0,0,0.25)',
        border: '1px solid #e5e7eb',
      }} onClick={e => e.stopPropagation()}>

        {/* Ícone */}
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 16 }}>
          <div style={{
            width: 52, height: 52, borderRadius: '50%',
            background: perigo ? '#fde8e8' : '#dce8f5',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 22,
          }}>
            {perigo ? '⚠️' : '❓'}
          </div>
        </div>

        {/* Título */}
        <h3 style={{
          margin: '0 0 8px', textAlign: 'center',
          fontSize: 17, fontWeight: 700, color: '#1a3a5c',
        }}>{titulo}</h3>

        {/* Mensagem */}
        <p style={{
          margin: '0 0 24px', textAlign: 'center',
          fontSize: 14, color: '#555', lineHeight: 1.5,
        }}>{mensagem}</p>

        {/* Botões */}
        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={onCancel} style={{
            flex: 1, padding: '10px 0', borderRadius: 8, fontSize: 14, fontWeight: 600,
            border: '1px solid #d1d5db', background: '#fff', color: '#555',
            cursor: 'pointer', transition: 'background .15s',
          }}
          onMouseEnter={e => (e.currentTarget.style.background = '#f3f4f6')}
          onMouseLeave={e => (e.currentTarget.style.background = '#fff')}>
            {cancelLabel}
          </button>
          <button onClick={onConfirm} style={{
            flex: 1, padding: '10px 0', borderRadius: 8, fontSize: 14, fontWeight: 700,
            border: 'none', cursor: 'pointer', transition: 'opacity .15s',
            background: perigo ? '#dc3545' : '#1a3a5c',
            color: '#fff',
          }}
          onMouseEnter={e => (e.currentTarget.style.opacity = '0.85')}
          onMouseLeave={e => (e.currentTarget.style.opacity = '1')}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
