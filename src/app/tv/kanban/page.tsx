'use client';
import { useEffect, useState, useRef, useCallback } from 'react';
import { useRealtime } from '@/hooks/useRealtime';
import { getToken } from '@/lib/auth';
import { getPedidoEtapa, ETAPA_LABELS, ETAPA_COR, Etapa } from '@/lib/types';

interface ItemPedidoTV {
  id: number;
  codigo: string;
  status: string;
  setor_atual?: string;
}

interface PedidoTV {
  id: number;
  numero_pedido_venda: string;
  cliente: string;
  prazo_entrega: string | null;
  prioridade: string;
  status: string;
  setor_atual: string;
  atrasado?: boolean;
  setores_parciais?: string[];
  itens: ItemPedidoTV[];
}

const ETAPAS: Etapa[] = ['a_produzir', 'ag_recebimento', 'produzindo', 'mat_concluido', 'entregue'];
const DWELL_MS = 30_000;

export default function TVKanbanPage() {
  const [pedidos, setPedidos] = useState<PedidoTV[]>([]);
  const [etapaIdx, setEtapaIdx] = useState(0);
  const [agora, setAgora] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef<number | null>(null);

  const carregar = useCallback(() => {
    const token = getToken() || '';
    const headers = { Authorization: `Bearer ${token}` };
    Promise.all([
      fetch('/api/dashboard/pedidos', { headers }).then(r => r.ok ? r.json() : { pedidos: [] }).catch(() => ({ pedidos: [] })),
      fetch('/api/entregues', { headers }).then(r => r.ok ? r.json() : { pedidos: [] }).catch(() => ({ pedidos: [] })),
    ]).then(([abertos, entregues]) => {
      const mapa = new Map<number, PedidoTV>();
      for (const p of (abertos.pedidos || [])) mapa.set(p.id, p);
      for (const p of (entregues.pedidos || [])) if (!mapa.has(p.id)) mapa.set(p.id, p);
      setPedidos(Array.from(mapa.values()));
    });
  }, []);

  useEffect(() => {
    carregar();
    const t = setInterval(carregar, 60_000);
    const clock = setInterval(() => {
      setAgora(new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
    }, 1000);
    return () => { clearInterval(t); clearInterval(clock); };
  }, [carregar]);

  useRealtime(['producao_itemparcial', 'producao_itempedido', 'producao_movimentacaoitem'], carregar);

  // Agrupa os pedidos carregados nas 5 etapas do ciclo de vida
  const grupos: Record<Etapa, PedidoTV[]> = { a_produzir: [], ag_recebimento: [], produzindo: [], mat_concluido: [], entregue: [] };
  for (const p of pedidos) {
    try { grupos[getPedidoEtapa(p)].push(p); } catch { /* pedido com dados incompletos - ignora */ }
  }

  const etapaAtual = ETAPAS[etapaIdx];
  const listaAtual = grupos[etapaAtual];
  const cor = ETAPA_COR[etapaAtual];

  // Roda para a proxima etapa a cada DWELL_MS, voltando ao inicio depois da ultima
  useEffect(() => {
    const id = setTimeout(() => setEtapaIdx(i => (i + 1) % ETAPAS.length), DWELL_MS);
    return () => clearTimeout(id);
  }, [etapaIdx]);

  // Rolagem automatica e suave dentro da etapa, se os pedidos nao couberem
  // todos de uma vez - da tempo de ver tudo antes de trocar de etapa.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = 0;
    const inicio = performance.now();
    const duracao = DWELL_MS - 3000; // 3s de folga no fim antes de trocar de etapa

    function passo(t: number) {
      const atual = scrollRef.current;
      if (!atual) return;
      const max = atual.scrollHeight - atual.clientHeight;
      if (max <= 0) return; // conteudo cabe inteiro, nao precisa rolar
      const progresso = Math.min(1, (t - inicio) / duracao);
      atual.scrollTop = max * progresso;
      if (progresso < 1) rafRef.current = requestAnimationFrame(passo);
    }
    rafRef.current = requestAnimationFrame(passo);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [etapaIdx, listaAtual.length]);

  return (
    <div className="tv-kanban-page" style={{ minHeight: '100vh', height: '100vh', background: '#0f172a', color: '#f1f5f9', fontFamily: 'system-ui, sans-serif', padding: '20px 28px', display: 'flex', flexDirection: 'column', boxSizing: 'border-box', overflow: 'hidden' }}>

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexShrink: 0, flexWrap: 'wrap', gap: 8 }}>
        <div>
          <h1 className="tv-header-titulo" style={{ margin: 0, fontSize: 26, fontWeight: 800, letterSpacing: 1 }}>PCP ACOSVITAL</h1>
          <p style={{ margin: 0, fontSize: 12, color: '#94a3b8' }}>Painel de Produção — Quadro por Etapa</p>
        </div>
        <div className="tv-header-relogio" style={{ fontSize: 30, fontWeight: 700, color: '#38bdf8', fontVariantNumeric: 'tabular-nums' }}>{agora}</div>
      </div>

      {/* Indicador das 5 etapas */}
      <div className="tv-etapas-row" style={{ display: 'flex', gap: 10, marginBottom: 18, flexShrink: 0 }}>
        {ETAPAS.map((e, i) => {
          const ativo = i === etapaIdx;
          const c = ETAPA_COR[e];
          return (
            <div key={e} style={{
              flex: 1, borderRadius: 10, padding: '14px 18px',
              background: ativo ? c.text : '#1e293b',
              border: ativo ? `2px solid ${c.text}` : '2px solid transparent',
              opacity: ativo ? 1 : 0.55,
              transition: 'all .3s',
            }}>
              <div style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, color: ativo ? '#fff' : '#94a3b8' }}>
                {ETAPA_LABELS[e]}
              </div>
              <div style={{ fontSize: 28, fontWeight: 800, color: '#fff', marginTop: 4 }}>{grupos[e].length}</div>
            </div>
          );
        })}
      </div>

      {/* Pedidos da etapa atual */}
      <div ref={scrollRef} style={{ flex: 1, overflowY: 'auto', position: 'relative' }}>
        {listaAtual.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '80px 0', color: '#475569', fontSize: 20 }}>
            Nenhum pedido em &quot;{ETAPA_LABELS[etapaAtual]}&quot;
          </div>
        ) : (
          <div className="tv-kanban-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14 }}>
            {listaAtual.map(p => (
              <div key={p.id} style={{
                background: '#1e293b', borderRadius: 12, padding: '16px 18px',
                borderLeft: `4px solid ${p.atrasado ? '#ef4444' : cor.text}`,
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
                  <span style={{ fontSize: 18, fontWeight: 800, color: '#f1f5f9' }}>{p.numero_pedido_venda}</span>
                  <span style={{
                    fontSize: 10, fontWeight: 700, textTransform: 'uppercase', padding: '2px 8px', borderRadius: 6,
                    background: p.prioridade === 'urgente' ? '#7f1d1d' : p.prioridade === 'alta' ? '#7c2d12' : '#334155',
                    color: p.prioridade === 'urgente' ? '#fca5a5' : p.prioridade === 'alta' ? '#fdba74' : '#cbd5e1',
                  }}>{p.prioridade}</span>
                </div>
                <div style={{ fontSize: 14, color: '#94a3b8', marginBottom: 8 }}>{p.cliente}</div>
                <div style={{ fontSize: 12, color: '#64748b', marginBottom: 4 }}>
                  {p.itens?.length ?? 0} ite{(p.itens?.length ?? 0) === 1 ? 'm' : 'ns'}
                </div>
                {p.prazo_entrega && (
                  <div style={{ fontSize: 12, color: p.atrasado ? '#f87171' : '#64748b' }}>
                    <i className="bi bi-calendar3" style={{ marginRight: 4 }} />
                    Prazo: {p.prazo_entrega}
                    {p.atrasado && <strong style={{ marginLeft: 6 }}>ATRASADO</strong>}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
