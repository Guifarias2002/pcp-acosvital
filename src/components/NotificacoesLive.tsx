'use client';
import { useEffect, useRef, useState } from 'react';
import { getToken } from '@/lib/auth';

interface Notificacao {
  id: number;
  criado_em: string;
  setor_origem: string;
  setor_destino: string;
  status_anterior: string;
  status_novo: string;
  item_codigo: string;
  pedido_numero: string;
  usuario_nome: string;
}

const STATUS_LABEL: Record<string, string> = {
  aguardando: 'Aguardando', recebido: 'Recebido', em_andamento: 'Em Andamento',
  pausado: 'Pausado', finalizado_setor: 'Finalizado', entregue: 'Entregue',
};

const STATUS_ICON: Record<string, string> = {
  recebido: '📥', em_andamento: '⚙️', pausado: '⏸️',
  finalizado_setor: '✅', entregue: '🚚', aguardando: '⏳',
};

export default function NotificacoesLive({ filtroSetor }: { filtroSetor?: string } = {}) {
  const [toasts, setToasts] = useState<(Notificacao & { key: number })[]>([]);
  const desdeRef = useRef<string>(new Date().toISOString());
  const keyRef = useRef(0);

  useEffect(() => {
    const token = getToken();
    if (!token) return;

    async function verificar() {
      try {
        const res = await fetch(`/api/notificacoes?desde=${encodeURIComponent(desdeRef.current)}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) return;
        const { movimentacoes } = await res.json();
        if (!movimentacoes || movimentacoes.length === 0) return;

        desdeRef.current = movimentacoes[0].criado_em;

        // Se filtroSetor definido, mostra só movimentações relevantes ao setor
        const filtradas = filtroSetor
          ? movimentacoes.filter((m: Notificacao) =>
              m.setor_destino === filtroSetor || m.setor_origem === filtroSetor
            )
          : movimentacoes;

        if (filtradas.length === 0) return;

        const novos = filtradas.map((m: Notificacao) => ({ ...m, key: keyRef.current++ }));
        setToasts(prev => [...novos, ...prev].slice(0, 5));

        novos.forEach((_: unknown, i: number) => {
          setTimeout(() => {
            setToasts(prev => prev.filter(t => t.key !== novos[i].key));
          }, 6000);
        });
      } catch {}
    }

    const intervalo = setInterval(verificar, 30000);
    return () => clearInterval(intervalo);
  }, [filtroSetor]);

  if (toasts.length === 0) return null;

  return (
    <div style={{
      position: 'fixed', bottom: 24, right: 24, zIndex: 9999,
      display: 'flex', flexDirection: 'column-reverse', gap: 10,
      maxWidth: 340,
    }}>
      {toasts.map(t => (
        <div key={t.key} style={{
          position: 'relative',
          background: '#1a3a5c', color: '#fff',
          borderRadius: 10, padding: '12px 16px',
          boxShadow: '0 4px 20px rgba(0,0,0,0.25)',
          animation: 'slideIn .3s ease',
          borderLeft: `4px solid ${filtroSetor ? '#198754' : '#0d6efd'}`,
        }}>
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 4 }}>
            {STATUS_ICON[t.status_novo] || '🔄'} {filtroSetor ? 'Novo item no setor' : 'Movimentação'} — {t.pedido_numero}
          </div>
          <div style={{ fontSize: 12, color: '#b0c4de', marginBottom: 2 }}>
            <strong style={{ color: '#fff' }}>{t.item_codigo}</strong>
            {' → '}{STATUS_LABEL[t.status_novo] || t.status_novo}
          </div>
          {t.setor_destino && t.setor_destino !== t.setor_origem && !filtroSetor && (
            <div style={{ fontSize: 11, color: '#8ab4d8' }}>
              Setor: {t.setor_destino}
            </div>
          )}
          <div style={{ fontSize: 11, color: '#7a9bbf', marginTop: 4 }}>
            por {t.usuario_nome || 'Sistema'}
          </div>
          <button onClick={() => setToasts(p => p.filter(x => x.key !== t.key))}
            style={{ position: 'absolute', top: 8, right: 10, background: 'none', border: 'none', color: '#7a9bbf', cursor: 'pointer', fontSize: 14 }}>
            ✕
          </button>
        </div>
      ))}
      <style>{`@keyframes slideIn { from { opacity:0; transform:translateX(40px); } to { opacity:1; transform:translateX(0); } }`}</style>
    </div>
  );
}
