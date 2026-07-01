'use client';
import { useEffect, useState, useCallback } from 'react';
import { useRealtime } from '@/hooks/useRealtime';
import { SETOR_CHOICES } from '@/lib/types';

interface DashboardTV {
  total: number;
  a_produzir: number;
  produzindo: number;
  atrasados: number;
  urgentes: number;
  por_setor: { cod: string; nome: string; qtd: number }[];
  ultimas_movimentacoes: {
    id: number;
    item_codigo: string;
    numero_pedido_venda: string;
    setor_destino_nome: string;
    status_anterior_display: string;
    status_novo_display: string;
    usuario_nome: string;
    criado_em: string;
  }[];
}

const NOMES_SETOR = Object.fromEntries(SETOR_CHOICES);

function horaFormatada(iso: string) {
  try {
    return new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  } catch { return ''; }
}

export default function TVPage() {
  const [data, setData] = useState<DashboardTV | null>(null);
  const [agora, setAgora] = useState('');

  const carregar = useCallback(() => {
    fetch('/api/tv')
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d) setData(d); })
      .catch(() => {});
  }, []);

  useEffect(() => {
    carregar();
    const t = setInterval(carregar, 10_000);
    const clock = setInterval(() => {
      setAgora(new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
    }, 1000);
    return () => { clearInterval(t); clearInterval(clock); };
  }, [carregar]);

  useRealtime(['producao_itemparcial', 'producao_itempedido', 'producao_movimentacaoitem'], carregar);

  const totalSetores = (data?.por_setor ?? []).filter(s => s.qtd > 0);

  return (
    <div style={{ minHeight: '100vh', background: '#0f172a', color: '#f1f5f9', fontFamily: 'system-ui, sans-serif', padding: '20px 24px' }}>

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 28, fontWeight: 800, color: '#f1f5f9', letterSpacing: 1 }}>
            PCP ACOSVITAL
          </h1>
          <p style={{ margin: 0, fontSize: 13, color: '#94a3b8' }}>Painel de Produção — Visão ao vivo</p>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 36, fontWeight: 700, color: '#38bdf8', fontVariantNumeric: 'tabular-nums' }}>{agora}</div>
          <div style={{ fontSize: 12, color: '#64748b' }}>atualiza a cada 10s</div>
        </div>
      </div>

      {/* Contadores gerais */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 24 }}>
        {[
          { label: 'Em Produção', valor: data?.produzindo ?? 0, cor: '#3b82f6', icon: '⚙️' },
          { label: 'A Produzir', valor: data?.a_produzir ?? 0, cor: '#8b5cf6', icon: '📋' },
          { label: 'Atrasados', valor: data?.atrasados ?? 0, cor: '#ef4444', icon: '⚠️' },
          { label: 'Urgentes', valor: data?.urgentes ?? 0, cor: '#f59e0b', icon: '⚡' },
        ].map(c => (
          <div key={c.label} style={{
            background: '#1e293b', borderRadius: 12, padding: '16px 20px',
            borderLeft: `4px solid ${c.cor}`,
          }}>
            <div style={{ fontSize: 13, color: '#94a3b8', marginBottom: 4 }}>{c.icon} {c.label}</div>
            <div style={{ fontSize: 40, fontWeight: 800, color: c.cor, lineHeight: 1 }}>{c.valor}</div>
          </div>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>

        {/* Itens por Setor */}
        <div style={{ background: '#1e293b', borderRadius: 12, padding: 20 }}>
          <h2 style={{ margin: '0 0 16px', fontSize: 16, fontWeight: 700, color: '#cbd5e1', textTransform: 'uppercase', letterSpacing: 1 }}>
            📍 Itens por Setor
          </h2>
          {totalSetores.length === 0 ? (
            <p style={{ color: '#475569', textAlign: 'center', padding: '20px 0' }}>Nenhum item em produção</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {totalSetores.map(s => (
                <div key={s.cod} style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  background: '#0f172a', borderRadius: 8, padding: '12px 16px',
                }}>
                  <span style={{ fontSize: 16, fontWeight: 600, color: '#e2e8f0' }}>
                    {NOMES_SETOR[s.cod] || s.nome}
                  </span>
                  <span style={{
                    background: '#3b82f6', color: '#fff', fontSize: 20, fontWeight: 800,
                    minWidth: 40, height: 40, borderRadius: 8,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>{s.qtd}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Últimas Movimentações */}
        <div style={{ background: '#1e293b', borderRadius: 12, padding: 20 }}>
          <h2 style={{ margin: '0 0 16px', fontSize: 16, fontWeight: 700, color: '#cbd5e1', textTransform: 'uppercase', letterSpacing: 1 }}>
            🔄 Últimas Movimentações
          </h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {(data?.ultimas_movimentacoes ?? []).slice(0, 10).map(m => (
              <div key={m.id} style={{
                background: '#0f172a', borderRadius: 8, padding: '10px 14px',
                borderLeft: '3px solid #22d3ee',
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2 }}>
                  <span style={{ fontWeight: 700, color: '#38bdf8', fontSize: 14 }}>
                    {m.numero_pedido_venda} · {m.item_codigo}
                  </span>
                  <span style={{ fontSize: 12, color: '#64748b' }}>{horaFormatada(m.criado_em)}</span>
                </div>
                <div style={{ fontSize: 13, color: '#94a3b8' }}>
                  <span style={{ color: '#fb923c' }}>{m.status_anterior_display}</span>
                  {' → '}
                  <span style={{ color: '#4ade80' }}>{m.status_novo_display}</span>
                  {m.setor_destino_nome && (
                    <span style={{ color: '#7dd3fc', marginLeft: 6 }}>• {m.setor_destino_nome}</span>
                  )}
                </div>
                <div style={{ fontSize: 11, color: '#475569', marginTop: 2 }}>👤 {m.usuario_nome}</div>
              </div>
            ))}
          </div>
        </div>

      </div>

      {!data && (
        <div style={{ textAlign: 'center', padding: '80px 0', color: '#475569', fontSize: 18 }}>
          Conectando ao sistema...
        </div>
      )}
    </div>
  );
}
