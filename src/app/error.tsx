'use client';
import { useEffect } from 'react';

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { console.error(error); }, [error]);

  return (
    <div style={{ minHeight: '60vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16, padding: 32 }}>
      <i className="bi bi-exclamation-triangle" style={{ fontSize: 40, color: '#f59e0b' }} />
      <h2 style={{ fontSize: 18, fontWeight: 700, color: '#1a3a5c', margin: 0 }}>Algo deu errado</h2>
      <p style={{ fontSize: 13, color: '#64748b', margin: 0 }}>Ocorreu um erro inesperado. Tente novamente.</p>
      <button onClick={reset}
        style={{ background: '#1a3a5c', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 20px', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
        Tentar novamente
      </button>
    </div>
  );
}
