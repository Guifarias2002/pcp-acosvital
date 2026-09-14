'use client';
import { useCallback, useEffect, useState } from 'react';
import { getToken, podeEditar, podeVerCliente } from '@/lib/auth';

interface Aviso {
  id: number;
  pedido_id: number | null;
  numero_pedido_venda: string | null;
  cliente: string | null;
  prioridade: string | null;
  mensagem: string | null;
  criado_por_nome: string | null;
  criado_em: string;
  tem_op?: boolean;
}

function tempoDesde(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 60000) return 'agora';
  const min = Math.floor(ms / 60000);
  if (min < 60) return `há ${min}min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `há ${h}h`;
  return `há ${Math.floor(h / 24)}d`;
}

// Caixa de entrada de avisos de produção — o Planejamento aperta "Avisar
// Produção" num pedido e o aviso aparece AQUI, no topo da tela do setor, pro
// operador não se perder. "Marcar como visto" tira o card da caixa.
export default function AvisosSetor({ setor }: { setor: string }) {
  const [avisos, setAvisos] = useState<Aviso[]>([]);
  const [marcando, setMarcando] = useState<number | null>(null);
  const podeMarcar = podeEditar();
  const verCli = podeVerCliente();

  const carregar = useCallback(async () => {
    try {
      const r = await fetch(`/api/avisos?setor=${encodeURIComponent(setor)}`, { headers: { Authorization: `Bearer ${getToken() || ''}` } });
      if (!r.ok) return;
      const d = await r.json();
      setAvisos(Array.isArray(d.avisos) ? d.avisos : []);
    } catch { /* silencioso — próximo ciclo tenta de novo */ }
  }, [setor]);

  useEffect(() => { carregar(); }, [carregar]);
  useEffect(() => {
    const t = setInterval(() => { if (document.visibilityState === 'visible') carregar(); }, 20000);
    return () => clearInterval(t);
  }, [carregar]);

  async function marcarVisto(id: number) {
    setMarcando(id);
    setAvisos(prev => prev.filter(a => a.id !== id)); // otimista
    try {
      await fetch(`/api/avisos/${id}/visto`, { method: 'POST', headers: { Authorization: `Bearer ${getToken() || ''}` } });
    } catch { carregar(); }
    finally { setMarcando(null); }
  }

  if (avisos.length === 0) return null;

  return (
    <div style={{ border: '2px solid #f59e0b', background: '#fffbeb', borderRadius: 12, padding: '12px 14px', marginBottom: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <i className="bi bi-megaphone-fill" style={{ color: '#b45309', fontSize: 18 }} />
        <span style={{ fontWeight: 800, color: '#92400e', fontSize: 14 }}>
          Avisos do Planejamento
        </span>
        <span style={{ fontSize: 11, fontWeight: 700, color: '#fff', background: '#f59e0b', borderRadius: 10, padding: '1px 8px' }}>
          {avisos.length}
        </span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {avisos.map(a => {
          const urgente = (a.prioridade || '').toLowerCase() === 'urgente';
          return (
            <div key={a.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, background: '#fff', border: `1px solid ${urgente ? '#fca5a5' : '#fde68a'}`, borderRadius: 8, padding: '9px 12px' }}>
              <i className="bi bi-arrow-right-circle-fill" style={{ color: urgente ? '#dc2626' : '#d97706', fontSize: 16, marginTop: 2 }} />
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: '#1a3a5c' }}>
                  Produzir pedido <b>{a.numero_pedido_venda || `#${a.pedido_id}`}</b>
                  {verCli && a.cliente && <span style={{ fontWeight: 400, color: '#64748b' }}> · {a.cliente}</span>}
                  {urgente && <span style={{ marginLeft: 6, fontSize: 10, fontWeight: 800, color: '#fff', background: '#dc2626', borderRadius: 8, padding: '1px 7px', textTransform: 'uppercase' }}>Urgente</span>}
                </div>
                {a.mensagem && <div style={{ fontSize: 12.5, color: '#374151', marginTop: 2 }}>{a.mensagem}</div>}
                <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 3 }}>
                  {a.criado_por_nome || 'Planejamento'} · {tempoDesde(a.criado_em)}
                </div>
              </div>
              {a.tem_op && a.pedido_id && (
                <a
                  href={`/api/pedidos/${a.pedido_id}/ordem-producao?token=${encodeURIComponent(getToken() || '')}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  title="Abrir a Ordem de Produção (OP)"
                  style={{ flexShrink: 0, display: 'inline-flex', alignItems: 'center', gap: 4, border: '1px solid #93c5fd', background: '#eff6ff', color: '#1d4ed8', borderRadius: 7, padding: '6px 10px', fontSize: 12, fontWeight: 700, textDecoration: 'none', whiteSpace: 'nowrap' }}
                >
                  <i className="bi bi-file-earmark-text" />OP
                </a>
              )}
              {podeMarcar && (
                <button
                  onClick={() => marcarVisto(a.id)}
                  disabled={marcando === a.id}
                  title="Marcar como visto (some da caixa)"
                  style={{ flexShrink: 0, border: '1px solid #d1d5db', background: '#fff', color: '#374151', borderRadius: 7, padding: '6px 10px', fontSize: 12, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }}
                >
                  <i className="bi bi-check2" style={{ marginRight: 4 }} />Visto
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
