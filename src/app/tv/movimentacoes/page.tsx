'use client';
import { useEffect, useState, useCallback } from 'react';
import { useRealtime } from '@/hooks/useRealtime';
import { getToken } from '@/lib/auth';
import NotificacoesLive from '@/components/NotificacoesLive';

interface LinhaStat {
  qtd: number;
  pct: number;
}
interface LiderStat extends LinhaStat {
  usuario_id: number;
  usuario_nome: string;
}
interface SetorStat extends LinhaStat {
  setor: string;
  setor_nome: string;
}

interface ItemKanban {
  id: number;
  pedido_id: number;
  pedido_numero: string;
  pedido_cliente: string;
  pedido_prioridade: string;
  codigo: string;
  quantidade_pendente: string;
  unidade: string;
}
interface SetorKanban {
  cod: string;
  nome: string;
  itens: ItemKanban[];
}

const CORES = ['#0d6efd', '#198754', '#fd7e14', '#6f42c1', '#dc3545', '#20c997', '#b45309', '#0dcaf0'];
const PRIO_COR: Record<string, string> = { baixa: '#94a3b8', normal: '#0d6efd', alta: '#d97706', urgente: '#dc3545' };

function Barra({ label, qtd, pct, cor }: { label: string; qtd: number; pct: number; cor: string }) {
  return (
    <div style={{ marginBottom: 8 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 2 }}>
        <span style={{ fontSize: 12.5, fontWeight: 700, color: '#1a3a5c', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{label}</span>
        <span style={{ fontSize: 11, color: '#64748b', whiteSpace: 'nowrap', marginLeft: 6 }}>
          <strong style={{ fontSize: 12.5, color: '#1a3a5c' }}>{pct}%</strong> · {qtd}
        </span>
      </div>
      <div style={{ background: '#eef2f7', borderRadius: 5, height: 7, overflow: 'hidden' }}>
        <div style={{ width: `${Math.max(pct, 2)}%`, height: '100%', background: cor, borderRadius: 5, transition: 'width .6s ease' }} />
      </div>
    </div>
  );
}

// Agrupa as parciais de um setor por pedido, pra mostrar 1 card por pedido (nao por parcial).
function agruparPorPedido(itens: ItemKanban[]) {
  const mapa = new Map<string, { numero: string; cliente: string; prioridade: string; itens: number; qtdTotal: number; unidade: string }>();
  for (const it of itens) {
    const key = it.pedido_numero || String(it.pedido_id);
    if (!mapa.has(key)) mapa.set(key, { numero: it.pedido_numero, cliente: it.pedido_cliente, prioridade: it.pedido_prioridade, itens: 0, qtdTotal: 0, unidade: it.unidade });
    const g = mapa.get(key)!;
    g.itens += 1;
    g.qtdTotal += Number(it.quantidade_pendente) || 0;
  }
  return Array.from(mapa.values());
}

export default function TVMovimentacoesPage() {
  const [lideres, setLideres] = useState<LiderStat[]>([]);
  const [setoresStat, setSetoresStat] = useState<SetorStat[]>([]);
  const [totalMov, setTotalMov] = useState(0);
  const [agora, setAgora] = useState('');
  const [setoresKanban, setSetoresKanban] = useState<SetorKanban[]>([]);
  const [semSessao, setSemSessao] = useState(false);

  const carregar = useCallback(() => {
    const token = getToken() || '';
    if (!token) { setSemSessao(true); return; }
    const headers = { Authorization: `Bearer ${token}` };
    fetch('/api/dashboard/movimentacao-hoje', { headers })
      .then(r => {
        if (r.status === 401) { setSemSessao(true); return null; }
        return r.ok ? r.json() : null;
      })
      .then(data => {
        if (!data) return;
        setSemSessao(false);
        setLideres(data.lideres || []);
        setSetoresStat(data.setores || []);
        setTotalMov(data.total_movimentacoes || 0);
      })
      .catch(() => {});
    fetch('/api/kanban', { headers })
      .then(r => {
        if (r.status === 401) { setSemSessao(true); return null; }
        return r.ok ? r.json() : null;
      })
      .then(data => { if (data) { setSemSessao(false); setSetoresKanban(data.setores || []); } })
      .catch(() => {});
  }, []);

  useEffect(() => {
    carregar();
    const t = setInterval(carregar, 30_000);
    const clock = setInterval(() => {
      setAgora(new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
    }, 1000);
    return () => { clearInterval(t); clearInterval(clock); };
  }, [carregar]);

  useRealtime(['producao_movimentacaoitem', 'producao_itemparcial'], carregar);

  const setoresAtivos = setoresKanban.filter(s => s.itens.length > 0);
  // Colunas em 2 blocos quando tem muita gente/setor, pra caber tudo sem rolar.
  const meioLideres = Math.ceil(lideres.length / 2);
  const meioSetores = Math.ceil(setoresStat.length / 2);

  return (
    <div style={{
      minHeight: '100vh', height: '100vh', boxSizing: 'border-box', overflow: 'hidden',
      background: '#f0f2f5', padding: '16px 24px', display: 'flex', flexDirection: 'column',
      fontFamily: 'Arial, sans-serif', gap: 12,
    }}>
      {/* Header — mesmo padrao das outras telas do sistema */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
        <div>
          <h1 style={{ margin: 0, fontWeight: 700, color: '#1a3a5c', fontSize: 21, display: 'flex', alignItems: 'center', gap: 8 }}>
            <i className="bi bi-activity" style={{ color: '#0d6efd' }} />
            Movimentação em Tempo Real
          </h1>
          <div style={{ color: '#888', fontSize: 12 }}>PCP ACOSVITAL — atividade de produção ao vivo</div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 26, fontWeight: 700, color: '#1a3a5c', fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>{agora}</div>
          <div style={{ fontSize: 11, color: '#888', marginTop: 2 }}>{totalMov} movimentações no total</div>
        </div>
      </div>

      {semSessao && (
        <div style={{
          background: '#fdecea', border: '1px solid #f5c6cb', borderRadius: 10,
          padding: '10px 16px', display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0,
        }}>
          <i className="bi bi-exclamation-triangle-fill" style={{ color: '#dc3545', fontSize: 16 }} />
          <div style={{ color: '#7a1f27', fontSize: 12.5 }}>
            <strong>Sessão não encontrada nesta aba.</strong> Faça login neste navegador (uma vez só) —{' '}
            <a href="/login" style={{ color: '#0d6efd', fontWeight: 700 }}>abrir login</a>.
          </div>
        </div>
      )}

      {/* % por líder / % por setor — altura fixa e enxuta, em ate 2 colunas internas */}
      <div style={{ flex: '0 0 20%', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, minHeight: 0 }}>
        <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 10, padding: '10px 16px', boxShadow: '0 1px 3px rgba(0,0,0,.04)', display: 'flex', flexDirection: 'column' }}>
          <div style={{ fontSize: 10.5, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 6, display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
            <i className="bi bi-people-fill" style={{ color: '#0d6efd' }} /> % Movimentação por Líder
          </div>
          {lideres.length === 0 ? (
            <div style={{ color: '#aaa', fontSize: 12, textAlign: 'center', margin: 'auto' }}>Sem movimentações registradas</div>
          ) : (
            <div style={{ flex: 1, display: 'grid', gridTemplateColumns: lideres.length > 6 ? '1fr 1fr' : '1fr', gap: '0 16px', alignContent: 'center' }}>
              <div>{lideres.slice(0, lideres.length > 6 ? meioLideres : undefined).map((l, i) => (
                <Barra key={l.usuario_id} label={l.usuario_nome} qtd={l.qtd} pct={l.pct} cor={CORES[i % CORES.length]} />
              ))}</div>
              {lideres.length > 6 && (
                <div>{lideres.slice(meioLideres).map((l, i) => (
                  <Barra key={l.usuario_id} label={l.usuario_nome} qtd={l.qtd} pct={l.pct} cor={CORES[(i + meioLideres) % CORES.length]} />
                ))}</div>
              )}
            </div>
          )}
        </div>

        <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 10, padding: '10px 16px', boxShadow: '0 1px 3px rgba(0,0,0,.04)', display: 'flex', flexDirection: 'column' }}>
          <div style={{ fontSize: 10.5, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 6, display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
            <i className="bi bi-diagram-3-fill" style={{ color: '#0d6efd' }} /> % Movimentação por Setor
          </div>
          {setoresStat.length === 0 ? (
            <div style={{ color: '#aaa', fontSize: 12, textAlign: 'center', margin: 'auto' }}>Sem movimentações registradas</div>
          ) : (
            <div style={{ flex: 1, display: 'grid', gridTemplateColumns: setoresStat.length > 6 ? '1fr 1fr' : '1fr', gap: '0 16px', alignContent: 'center' }}>
              <div>{setoresStat.slice(0, setoresStat.length > 6 ? meioSetores : undefined).map((s, i) => (
                <Barra key={s.setor} label={s.setor_nome} qtd={s.qtd} pct={s.pct} cor={CORES[i % CORES.length]} />
              ))}</div>
              {setoresStat.length > 6 && (
                <div>{setoresStat.slice(meioSetores).map((s, i) => (
                  <Barra key={s.setor} label={s.setor_nome} qtd={s.qtd} pct={s.pct} cor={CORES[(i + meioSetores) % CORES.length]} />
                ))}</div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Kanban — todos os setores, em grade que se ajusta (quebra linha, nao arrasta) */}
      <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
        <div style={{ fontSize: 10.5, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 6, display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
          <i className="bi bi-kanban-fill" style={{ color: '#0d6efd' }} /> Kanban de Produção — setores e pedidos
        </div>
        <div style={{
          flex: 1, minHeight: 0, display: 'grid',
          gridTemplateColumns: `repeat(${Math.max(setoresAtivos.length, 1)}, 1fr)`,
          gap: 10, overflow: 'hidden',
        }}>
          {setoresAtivos.length === 0 ? (
            <div style={{ color: '#aaa', fontSize: 13, textAlign: 'center', padding: 30, gridColumn: '1 / -1' }}>Nenhum pedido em produção agora</div>
          ) : (
            setoresAtivos.map(s => {
              const pedidos = agruparPorPedido(s.itens);
              return (
                <div key={s.cod} style={{ display: 'flex', flexDirection: 'column', minWidth: 0, height: '100%' }}>
                  <div style={{
                    background: '#1a3a5c', color: '#fff', borderRadius: '8px 8px 0 0',
                    padding: '5px 9px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0, gap: 4,
                  }}>
                    <span style={{ fontWeight: 700, fontSize: 11.5, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.nome}</span>
                    <span style={{ background: '#0d6efd', color: '#fff', fontSize: 10, fontWeight: 700, minWidth: 16, height: 16, borderRadius: 8, padding: '0 4px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      {pedidos.length}
                    </span>
                  </div>
                  <div style={{ flex: 1, background: '#fff', border: '1px solid #e5e7eb', borderTop: 'none', borderRadius: '0 0 8px 8px', padding: 4, overflowY: 'auto', minHeight: 0 }}>
                    {pedidos.map(p => (
                      <div key={p.numero} style={{
                        display: 'flex', alignItems: 'center', gap: 5, padding: '3px 5px', marginBottom: 2,
                        borderLeft: `3px solid ${PRIO_COR[p.prioridade] || '#94a3b8'}`, background: '#f8fafc', borderRadius: 4,
                      }}>
                        <span style={{ fontWeight: 700, fontSize: 11, color: '#1a3a5c', flexShrink: 0 }}>{p.numero}</span>
                        <span style={{ fontSize: 10, color: '#94a3b8', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', flex: 1 }}>{p.cliente}</span>
                        <span style={{ fontSize: 10, color: '#555', flexShrink: 0, whiteSpace: 'nowrap' }}>{p.qtdTotal}{p.unidade}</span>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Notificações de movimentação em tela cheia (fila - cada movimentacao aparece uma vez) */}
      <NotificacoesLive modo="tv" />
    </div>
  );
}
