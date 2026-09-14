'use client';
import { useCallback, useEffect, useState } from 'react';
import { getToken, podeVerCliente } from '@/lib/auth';

interface Encaminhado {
  pedido_id: number;
  numero_pedido_venda: string;
  cliente: string | null;
  prioridade: string | null;
  observacao: string | null;
  encaminhado_por_nome: string | null;
  encaminhado_em: string;
  tem_op?: boolean;
}

// Comandos FIXOS do Planejamento (Reginaldo) — "estes pedidos devem ser feitos".
// Ficam no topo da tela do setor, destacados, e NÃO somem: só o Reginaldo
// desfaz (na tela de Planejamento). O operador só lê. Ver /api/encaminhamentos.
export default function EncaminhadosSetor({ setor }: { setor: string }) {
  const [itens, setItens] = useState<Encaminhado[]>([]);
  const verCli = podeVerCliente();

  const carregar = useCallback(async () => {
    try {
      const r = await fetch(`/api/encaminhamentos?setor=${encodeURIComponent(setor)}`, { headers: { Authorization: `Bearer ${getToken() || ''}` } });
      if (!r.ok) return;
      const d = await r.json();
      setItens(Array.isArray(d.encaminhados) ? d.encaminhados : []);
    } catch { /* silencioso */ }
  }, [setor]);

  useEffect(() => { carregar(); }, [carregar]);
  useEffect(() => {
    const t = setInterval(() => { if (document.visibilityState === 'visible') carregar(); }, 20000);
    return () => clearInterval(t);
  }, [carregar]);

  if (itens.length === 0) return null;

  return (
    <div style={{ border: '2px solid #16a34a', background: '#f0fdf4', borderRadius: 12, padding: '12px 14px', marginBottom: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <i className="bi bi-pin-angle-fill" style={{ color: '#15803d', fontSize: 18 }} />
        <span style={{ fontWeight: 800, color: '#166534', fontSize: 14 }}>
          Encaminhados pelo Planejamento — devem ser feitos
        </span>
        <span style={{ fontSize: 11, fontWeight: 700, color: '#fff', background: '#16a34a', borderRadius: 10, padding: '1px 8px' }}>
          {itens.length}
        </span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {itens.map(e => {
          const urgente = (e.prioridade || '').toLowerCase() === 'urgente';
          return (
            <div key={e.pedido_id} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, background: '#fff', border: `1px solid ${urgente ? '#fca5a5' : '#bbf7d0'}`, borderRadius: 8, padding: '9px 12px' }}>
              <i className="bi bi-check2-circle" style={{ color: urgente ? '#dc2626' : '#16a34a', fontSize: 16, marginTop: 2 }} />
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: '#1a3a5c' }}>
                  Pedido <b>{e.numero_pedido_venda || `#${e.pedido_id}`}</b>
                  {verCli && e.cliente && <span style={{ fontWeight: 400, color: '#64748b' }}> · {e.cliente}</span>}
                  {urgente && <span style={{ marginLeft: 6, fontSize: 10, fontWeight: 800, color: '#fff', background: '#dc2626', borderRadius: 8, padding: '1px 7px', textTransform: 'uppercase' }}>Urgente</span>}
                </div>
                {e.observacao && <div style={{ fontSize: 12.5, color: '#374151', marginTop: 2 }}>{e.observacao}</div>}
                <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 3 }}>
                  {e.encaminhado_por_nome || 'Planejamento'}
                </div>
              </div>
              {e.tem_op && (
                <a
                  href={`/api/pedidos/${e.pedido_id}/ordem-producao?token=${encodeURIComponent(getToken() || '')}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  title="Abrir a Ordem de Produção (OP)"
                  style={{ flexShrink: 0, display: 'inline-flex', alignItems: 'center', gap: 4, border: '1px solid #93c5fd', background: '#eff6ff', color: '#1d4ed8', borderRadius: 7, padding: '6px 10px', fontSize: 12, fontWeight: 700, textDecoration: 'none', whiteSpace: 'nowrap' }}
                >
                  <i className="bi bi-file-earmark-text" />OP
                </a>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
