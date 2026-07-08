'use client';
import { useEffect, useState } from 'react';
import { getToken } from '@/lib/auth';
import { PARCIAL_STATUS_LABELS } from '@/lib/types';

interface ParcelSetor { setor: string; setor_nome: string; quantidade: string; unidade: string; status: string; retrabalho: boolean; motivo_retrabalho: string | null; }
interface ItemRastreio { id: number; codigo: string; descricao: string; quantidade: string; unidade: string; status: string; parciais_por_setor: ParcelSetor[]; quantidade_entregue?: string; }

// Mostra onde estão as peças de um pedido (rastreabilidade por setor) — usado tanto
// na lista de Pedidos quanto em qualquer tela de Setor, sempre buscando os dados
// na hora (mesma fonte, /api/pedidos/:id) para garantir que a informação é a mesma
// em qualquer lugar do sistema.
export default function RastreioModal({ pedidoId, numero, onClose }: { pedidoId: number; numero: string; onClose: () => void }) {
  const [loading, setLoading] = useState(true);
  const [itens, setItens] = useState<ItemRastreio[]>([]);

  useEffect(() => {
    let cancelado = false;
    setLoading(true);
    const token = getToken();
    fetch(`/api/pedidos/${pedidoId}`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then(data => {
        if (cancelado) return;
        const its = (data.itens || []).map((i: Record<string, unknown>) => ({
          id: i.id,
          codigo: i.codigo,
          descricao: i.descricao,
          quantidade: i.quantidade,
          unidade: i.unidade,
          status: i.status,
          quantidade_entregue: i.quantidade_entregue,
          parciais_por_setor: (i as Record<string, unknown>).parciais_por_setor || [],
        }));
        setItens(its as ItemRastreio[]);
      })
      .catch(() => {})
      .finally(() => { if (!cancelado) setLoading(false); });
    return () => { cancelado = true; };
  }, [pedidoId]);

  const STATUS_LABEL = PARCIAL_STATUS_LABELS;
  const STATUS_BG: Record<string, string> = { em_aberto: '#f1f5f9', recebido: '#fef3c7', em_andamento: '#fef9c3', finalizado_setor: '#dcfce7', pausado: '#fee2e2' };
  const STATUS_TXT: Record<string, string> = { em_aberto: '#475569', recebido: '#92400e', em_andamento: '#854d0e', finalizado_setor: '#14532d', pausado: '#991b1b' };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.55)', zIndex: 1100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{ background: '#fff', borderRadius: 12, width: '100%', maxWidth: 680, maxHeight: '85vh', display: 'flex', flexDirection: 'column', boxShadow: '0 8px 32px rgba(0,0,0,.2)' }}>

        {/* Cabeçalho modal */}
        <div style={{ padding: '18px 24px', borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontSize: 18, fontWeight: 800, color: '#1a3a5c' }}>📦 {numero}</div>
            <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>Rastreabilidade — onde estão as peças</div>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            {/* Botão (não <a>) navegando via router: toque confiável no tablet, sem o
                atraso de 300ms e sem depender do comportamento de link do PWA. */}
            <button type="button"
              onClick={() => { window.location.href = `/pedidos/${pedidoId}`; }}
              style={{ fontSize: 13, color: '#0d6efd', background: 'none', border: '1px solid #0d6efd', borderRadius: 8, padding: '8px 14px', minHeight: 44, fontWeight: 600, cursor: 'pointer', touchAction: 'manipulation', WebkitTapHighlightColor: 'transparent' }}>
              Ver pedido completo →
            </button>
            <button type="button" onClick={onClose} aria-label="Fechar"
              style={{ background: 'none', border: 'none', fontSize: 22, color: '#94a3b8', cursor: 'pointer', lineHeight: 1, minWidth: 44, minHeight: 44, display: 'flex', alignItems: 'center', justifyContent: 'center', touchAction: 'manipulation', WebkitTapHighlightColor: 'transparent' }}>✕</button>
          </div>
        </div>

        {/* Corpo */}
        <div style={{ overflow: 'auto', padding: '16px 24px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          {loading && (
            <div style={{ textAlign: 'center', padding: 40, color: '#94a3b8' }}>Carregando...</div>
          )}
          {!loading && itens.map(item => {
            const entregues = Number(item.quantidade_entregue || 0);
            const temParciais = item.parciais_por_setor && item.parciais_por_setor.length > 0;

            return (
              <div key={item.id} style={{ border: '1px solid #e2e8f0', borderRadius: 10, overflow: 'hidden' }}>
                {/* Cabeçalho do item */}
                <div style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0', padding: '10px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div>
                    <span style={{ fontWeight: 700, fontSize: 14, color: '#1a3a5c' }}>{item.codigo}</span>
                    <span style={{ fontSize: 12, color: '#64748b', marginLeft: 8 }}>{String(item.descricao)}</span>
                  </div>
                  <span style={{ fontSize: 12, color: '#64748b' }}>{Number(item.quantidade)} {String(item.unidade)} total</span>
                </div>

                {/* Parciais por setor */}
                <div style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {temParciais ? item.parciais_por_setor.map((p, i) => (
                    <div key={i} style={{
                      display: 'flex', alignItems: 'center', gap: 10,
                      background: p.retrabalho ? '#fffbeb' : STATUS_BG[p.status] || '#f8fafc',
                      border: `1px solid ${p.retrabalho ? '#fcd34d' : '#e2e8f0'}`,
                      borderRadius: 8, padding: '10px 14px',
                    }}>
                      {/* Quantidade */}
                      <div style={{ minWidth: 70 }}>
                        <span style={{ fontSize: 18, fontWeight: 800, color: '#1d4ed8' }}>{Number(p.quantidade)}</span>
                        <span style={{ fontSize: 12, color: '#64748b', marginLeft: 4 }}>{p.unidade}</span>
                      </div>
                      {/* Seta */}
                      <span style={{ color: '#94a3b8', fontSize: 16 }}>→</span>
                      {/* Setor + status */}
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 13, fontWeight: 700, color: '#1e293b' }}>{p.setor_nome}</div>
                        <div style={{ fontSize: 11, color: STATUS_TXT[p.status] || '#64748b', display: 'flex', alignItems: 'center', gap: 6, marginTop: 2 }}>
                          <span style={{ background: STATUS_BG[p.status] || '#f1f5f9', border: `1px solid ${STATUS_TXT[p.status] || '#e2e8f0'}22`, borderRadius: 3, padding: '0 5px', fontWeight: 600 }}>
                            {STATUS_LABEL[p.status] || p.status}
                          </span>
                          {p.retrabalho && <span style={{ color: '#b45309', fontWeight: 700 }}>⚠ Retrabalho</span>}
                          {p.retrabalho && p.motivo_retrabalho && <span style={{ color: '#78350f', fontStyle: 'italic' }}>"{p.motivo_retrabalho}"</span>}
                        </div>
                      </div>
                    </div>
                  )) : (
                    <div style={{ fontSize: 13, color: '#94a3b8', textAlign: 'center', padding: '8px 0' }}>
                      Sem lotes ativos — item no fluxo principal
                    </div>
                  )}
                  {entregues > 0 && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: '#f0fdf4', border: '1px solid #86efac', borderRadius: 8, padding: '10px 14px' }}>
                      <div style={{ minWidth: 70 }}>
                        <span style={{ fontSize: 18, fontWeight: 800, color: '#15803d' }}>{entregues}</span>
                        <span style={{ fontSize: 12, color: '#64748b', marginLeft: 4 }}>{String(item.unidade)}</span>
                      </div>
                      <span style={{ color: '#94a3b8', fontSize: 16 }}>→</span>
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 700, color: '#15803d' }}>✓ Entregues ao cliente</div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
