'use client';
import { useEffect, useState, useRef, useCallback } from 'react';
import { useRealtime } from '@/hooks/useRealtime';
import { getToken } from '@/lib/auth';
import { getPedidoEtapa, Etapa } from '@/lib/types';

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
  nome_setor_atual?: string;
  atrasado?: boolean;
  setores_parciais?: string[];
  itens: ItemPedidoTV[];
}

// Mesmas etapas, cores, icones e legendas do card "Painel de Produção" do Dashboard (/)
const ETAPAS_META: { etapa: Etapa; bg: string; label: string; sub: string; icon: string }[] = [
  { etapa: 'a_produzir', bg: '#1a3a5c', label: 'A Produzir', sub: 'OPs emitidas aguardando início', icon: 'bi-hourglass-split' },
  { etapa: 'ag_recebimento', bg: '#92400e', label: 'Ag. Recebimento', sub: 'enviado, aguardando setor receber', icon: 'bi-arrow-down-circle' },
  { etapa: 'produzindo', bg: '#1d4ed8', label: 'Produzindo', sub: 'em trabalho nos setores', icon: 'bi-gear-fill' },
  { etapa: 'mat_concluido', bg: '#b45309', label: 'Mat. Concluído', sub: 'produção ok, na logística', icon: 'bi-truck' },
  { etapa: 'entregue', bg: '#166534', label: 'Entregue', sub: 'materiais entregues ao cliente', icon: 'bi-check-circle-fill' },
];
const ETAPAS: Etapa[] = ETAPAS_META.map(e => e.etapa);
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
  const metaAtual = ETAPAS_META[etapaIdx];
  const listaAtual = grupos[etapaAtual];

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
    <div className="tv-kanban-page-light" style={{ minHeight: '100vh', height: '100vh', background: '#f0f2f5', padding: '22px 28px', display: 'flex', flexDirection: 'column', boxSizing: 'border-box', overflow: 'hidden' }}>

      {/* Header — mesmo padrao do Dashboard */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18, flexShrink: 0, flexWrap: 'wrap', gap: 10 }}>
        <div>
          <h4 style={{ margin: 0, fontWeight: 700, color: '#1a3a5c', fontSize: 22 }}>
            <i className="bi bi-speedometer2" style={{ marginRight: 8 }}></i>
            Painel de Produção
          </h4>
          <small style={{ color: '#888' }}>Quadro por etapa — atualização automática</small>
        </div>
        <div style={{ fontSize: 28, fontWeight: 700, color: '#1a3a5c', fontVariantNumeric: 'tabular-nums' }}>{agora}</div>
      </div>

      {/* 5 Etapas — identico ao card do Dashboard, com a etapa atual em destaque */}
      <div className="etapas-grid" style={{ flexShrink: 0, marginBottom: 18 }}>
        {ETAPAS_META.map((c, i) => {
          const ativo = i === etapaIdx;
          return (
            <div key={c.etapa} style={{
              background: c.bg, color: '#fff', padding: '18px 20px', borderRadius: 10, height: '100%',
              transition: 'opacity .3s, transform .3s, box-shadow .3s',
              outline: ativo ? '3px solid #fff' : 'none',
              boxShadow: ativo ? `0 0 0 4px ${c.bg}, 0 0 0 6px #fff, 0 4px 20px rgba(0,0,0,.25)` : 'none',
              transform: ativo ? 'scale(1.03)' : 'scale(1)',
              opacity: ativo ? 1 : 0.7,
              position: 'relative',
            }} className="etapa-card">
              <div style={{ fontSize: 10, fontWeight: 700, opacity: .45, marginBottom: 4, letterSpacing: 1 }} className="etapa-label-num">
                ETAPA {i + 1}
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: .8, opacity: .8 }} className="etapa-label-titulo">{c.label}</div>
                  <div style={{ fontSize: 36, fontWeight: 800, lineHeight: 1, margin: '8px 0 4px' }} className="etapa-count">{grupos[c.etapa].length}</div>
                  <div style={{ fontSize: 10, opacity: .6, marginTop: 4 }} className="etapa-sub">{c.sub}</div>
                </div>
                <i className={`bi ${c.icon} etapa-icone`} style={{ fontSize: 28, opacity: .3 }}></i>
              </div>
            </div>
          );
        })}
      </div>

      {/* Pedidos da etapa atual — mesma tabela do Dashboard */}
      <div className="card" style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
        <div style={{ padding: '12px 16px', borderBottom: '1px solid #f0f0f0', display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
          <i className={`bi ${metaAtual.icon}`} style={{ color: metaAtual.bg }}></i>
          <strong style={{ fontSize: 14, color: '#333' }}>{metaAtual.label}</strong>
          <span style={{ background: metaAtual.bg, color: '#fff', fontSize: 11, fontWeight: 700, padding: '1px 8px', borderRadius: 10 }}>
            {listaAtual.length}
          </span>
        </div>
        <div ref={scrollRef} style={{ flex: 1, overflowY: 'auto' }} className="table-responsive">
          {listaAtual.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '60px 0', color: '#999', fontSize: 15 }}>
              Nenhum pedido em &quot;{metaAtual.label}&quot;
            </div>
          ) : (
            <table className="table-app">
              <thead>
                <tr>
                  {['Pedido','Cliente','Setor Atual','Prioridade','Prazo','Itens'].map(h => <th key={h}>{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {listaAtual.map(p => (
                  <tr key={p.id}>
                    <td style={{ color: '#1a3a5c', fontWeight: 700 }}>{p.numero_pedido_venda}</td>
                    <td style={{ color: '#555' }}>{p.cliente}</td>
                    <td style={{ color: '#888' }}>{p.nome_setor_atual || '—'}</td>
                    <td><span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 4, fontWeight: 600, background: p.prioridade === 'urgente' ? '#dc3545' : p.prioridade === 'alta' ? '#fd7e14' : '#0d6efd', color: '#fff' }}>
                      {p.prioridade?.charAt(0).toUpperCase() + p.prioridade?.slice(1)}
                    </span></td>
                    <td style={{ color: p.atrasado ? '#dc3545' : '#555', fontWeight: p.atrasado ? 700 : 400 }}>
                      {p.atrasado && <i className="bi bi-exclamation-circle-fill" style={{ marginRight: 4 }} />}
                      {p.prazo_entrega}
                    </td>
                    <td style={{ color: '#888', fontSize: 12 }}>{p.itens?.length ?? 0} item{(p.itens?.length ?? 0) !== 1 ? 's' : ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
