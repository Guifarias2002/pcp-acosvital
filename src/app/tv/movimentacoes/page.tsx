'use client';
import { useEffect, useState, useCallback } from 'react';
import { useRealtime } from '@/hooks/useRealtime';
import { getToken } from '@/lib/auth';
import NotificacoesLive from '@/components/NotificacoesLive';

interface LinhaStat {
  qtd: number;
  pct: number;
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
interface MesPedidos {
  mes: string;
  label: string;
  qtd: number;
}
interface PedidoAtrasado {
  id: number;
  numero_pedido_venda: string;
  cliente: string;
  prioridade: string;
  dias_atraso: number;
}
interface ItemParado {
  id: number;
  setor: string;
  setor_nome: string;
  codigo: string;
  numero_pedido_venda: string;
  cliente: string;
  dias_parado: number;
}

const CORES = ['#0d6efd', '#198754', '#fd7e14', '#6f42c1', '#dc3545', '#20c997', '#b45309', '#0dcaf0'];
const PRIO_COR: Record<string, string> = { baixa: '#94a3b8', normal: '#0d6efd', alta: '#d97706', urgente: '#dc3545' };
const DWELL_VIEW_MS = 25_000;

// Ordem fixa dos setores no Kanban da TV — segue o roteiro real de produção,
// não a ordem que a API devolve (SETOR_CHOICES). Setor fora desta lista vai pro
// fim, sem sumir.
const ORDEM_SETORES_TV = ['estoque', 'maçarico', 'plasma', 'laser', 'usinagem', 'furacao', 'qualidade', 'acabamento', 'embalagem', 'logistica'];
const posSetorTV = (cod: string) => {
  const i = ORDEM_SETORES_TV.indexOf(cod);
  return i === -1 ? ORDEM_SETORES_TV.length : i;
};

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
  const [setoresStat, setSetoresStat] = useState<SetorStat[]>([]);
  const [totalMov, setTotalMov] = useState(0);
  const [agora, setAgora] = useState('');
  const [setoresKanban, setSetoresKanban] = useState<SetorKanban[]>([]);
  const [semSessao, setSemSessao] = useState(false);
  const [meses, setMeses] = useState<MesPedidos[]>([]);
  const [variacaoPct, setVariacaoPct] = useState<number | null>(null);
  const [atrasados, setAtrasados] = useState<PedidoAtrasado[]>([]);
  const [parados, setParados] = useState<ItemParado[]>([]);
  const [view, setView] = useState<'kanban' | 'comparativo' | 'analise'>('kanban');

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
    fetch('/api/dashboard/pedidos-por-mes', { headers })
      .then(r => (r.ok ? r.json() : null))
      .then(data => { if (data) { setMeses(data.meses || []); setVariacaoPct(data.variacao_pct ?? null); } })
      .catch(() => {});
    fetch('/api/dashboard/analise-producao', { headers })
      .then(r => (r.ok ? r.json() : null))
      .then(data => { if (data) { setAtrasados(data.atrasados || []); setParados(data.parados || []); } })
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

  useRealtime(['producao_movimentacaoitem', 'producao_itemparcial', 'producao_itempedido', 'producao_pedido'], carregar);

  // Alterna entre Kanban, Comparativo mensal e Analise, com transicao suave (fade).
  useEffect(() => {
    const ordem: Array<'kanban' | 'comparativo' | 'analise'> = ['kanban', 'comparativo', 'analise'];
    const id = setInterval(() => setView(v => ordem[(ordem.indexOf(v) + 1) % ordem.length]), DWELL_VIEW_MS);
    return () => clearInterval(id);
  }, []);

  const setoresAtivos = setoresKanban
    .filter(s => s.itens.length > 0)
    .sort((a, b) => posSetorTV(a.cod) - posSetorTV(b.cod));
  // Barras de % movimentacao tambem na ordem do roteiro, igual ao Kanban.
  const setoresStatOrdenados = [...setoresStat].sort((a, b) => posSetorTV(a.setor) - posSetorTV(b.setor));
  // Colunas em 2 blocos quando tem muito setor, pra caber tudo sem rolar.
  const meioSetores = Math.ceil(setoresStatOrdenados.length / 2);
  // Corta os meses anteriores ao primeiro que teve pedido - sem meses vazios
  // no comeco do grafico so porque o sistema comecou a ser usado depois.
  const primeiroComDado = meses.findIndex(m => m.qtd > 0);
  const mesesVisiveis = primeiroComDado === -1 ? meses.slice(-1) : meses.slice(primeiroComDado);
  const maxMes = Math.max(1, ...mesesVisiveis.map(m => m.qtd));
  // Setor gargalo: o que tem mais peca parada agora (proxy de fila/WIP).
  const setorGargalo = setoresAtivos.length > 0
    ? setoresAtivos.reduce((maior, s) => (s.itens.length > maior.itens.length ? s : maior), setoresAtivos[0])
    : null;
  const totalWipGargalo = setoresAtivos.reduce((s, x) => s + x.itens.length, 0);

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

      {/* Área que alterna entre Kanban e Comparativo mensal, com fade suave */}
      <div style={{ flex: 1, minHeight: 0, position: 'relative' }}>

        {/* ── VIEW: Kanban + % movimentação ─────────────────────────────────── */}
        <div style={{
          position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', gap: 12,
          opacity: view === 'kanban' ? 1 : 0, transition: 'opacity 1s ease',
          pointerEvents: view === 'kanban' ? 'auto' : 'none',
        }}>
          <div style={{ flex: '0 0 20%', minHeight: 0 }}>
            <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 10, padding: '10px 16px', boxShadow: '0 1px 3px rgba(0,0,0,.04)', display: 'flex', flexDirection: 'column', minHeight: 0, overflow: 'hidden', height: '100%' }}>
              <div style={{ fontSize: 10.5, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 6, display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                <i className="bi bi-diagram-3-fill" style={{ color: '#0d6efd' }} /> % Movimentação por Setor
              </div>
              {setoresStat.length === 0 ? (
                <div style={{ color: '#aaa', fontSize: 12, textAlign: 'center', margin: 'auto' }}>Sem movimentações registradas</div>
              ) : (
                <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', display: 'grid', gridTemplateColumns: setoresStatOrdenados.length > 5 ? '1fr 1fr 1fr' : '1fr 1fr', gap: '0 20px', alignContent: 'center' }}>
                  <div>{setoresStatOrdenados.slice(0, meioSetores).map((s, i) => (
                    <Barra key={s.setor} label={s.setor_nome} qtd={s.qtd} pct={s.pct} cor={CORES[i % CORES.length]} />
                  ))}</div>
                  <div>{setoresStatOrdenados.slice(meioSetores).map((s, i) => (
                    <Barra key={s.setor} label={s.setor_nome} qtd={s.qtd} pct={s.pct} cor={CORES[(i + meioSetores) % CORES.length]} />
                  ))}</div>
                </div>
              )}
            </div>
          </div>

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
        </div>

        {/* ── VIEW: Comparativo mensal de pedidos criados ───────────────────── */}
        <div style={{
          position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
          opacity: view === 'comparativo' ? 1 : 0, transition: 'opacity 1s ease',
          pointerEvents: view === 'comparativo' ? 'auto' : 'none',
          background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: '20px 30px', boxShadow: '0 1px 3px rgba(0,0,0,.04)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, flexShrink: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: '#1a3a5c', display: 'flex', alignItems: 'center', gap: 8 }}>
              <i className="bi bi-bar-chart-line-fill" style={{ color: '#0d6efd' }} /> Comparativo de Pedidos Criados por Mês
            </div>
            {variacaoPct !== null && (
              <span style={{
                fontSize: 13, fontWeight: 700, padding: '4px 12px', borderRadius: 20,
                background: variacaoPct >= 0 ? '#dcfce7' : '#fee2e2', color: variacaoPct >= 0 ? '#166534' : '#991b1b',
              }}>
                <i className={`bi ${variacaoPct >= 0 ? 'bi-arrow-up' : 'bi-arrow-down'}`} /> {Math.abs(variacaoPct)}% vs mês anterior
              </span>
            )}
          </div>
          <div style={{ flex: 1, display: 'flex', alignItems: 'flex-end', justifyContent: 'space-around', gap: 24, minHeight: 0, paddingBottom: 8 }}>
            {mesesVisiveis.length === 0 ? (
              <div style={{ color: '#aaa', fontSize: 14, margin: 'auto' }}>Sem dados de pedidos ainda</div>
            ) : (
              mesesVisiveis.map((m, i) => {
                const isAtual = i === mesesVisiveis.length - 1;
                const alturaPct = Math.round((m.qtd / maxMes) * 100);
                return (
                  <div key={m.mes} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', height: '100%', justifyContent: 'flex-end' }}>
                    <div style={{ fontSize: 24, fontWeight: 800, color: isAtual ? '#0d6efd' : '#1a3a5c', marginBottom: 8 }}>{m.qtd}</div>
                    <div style={{
                      width: '100%', maxWidth: 90, height: `${Math.max(alturaPct, 3)}%`, minHeight: 4,
                      background: isAtual ? '#0d6efd' : '#c7d2fe', borderRadius: '8px 8px 0 0', transition: 'height .8s ease',
                    }} />
                    <div style={{ fontSize: 13, fontWeight: isAtual ? 700 : 600, color: isAtual ? '#1a3a5c' : '#64748b', marginTop: 10 }}>
                      {m.label}{isAtual && <span style={{ display: 'block', fontSize: 10, color: '#0d6efd', fontWeight: 700 }}>ATUAL</span>}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* ── VIEW: Análise de Produção (gargalo, atrasados, parados) ───────── */}
        <div style={{
          position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', gap: 12,
          opacity: view === 'analise' ? 1 : 0, transition: 'opacity 1s ease',
          pointerEvents: view === 'analise' ? 'auto' : 'none',
        }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: '#1a3a5c', display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
            <i className="bi bi-clipboard-data-fill" style={{ color: '#0d6efd' }} /> Análise de Produção
          </div>

          {/* Setor gargalo */}
          <div style={{
            flexShrink: 0, background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: '14px 22px',
            boxShadow: '0 1px 3px rgba(0,0,0,.04)', display: 'flex', alignItems: 'center', gap: 18,
          }}>
            <div style={{ width: 46, height: 46, borderRadius: '50%', background: '#fef3c7', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <i className="bi bi-exclamation-triangle-fill" style={{ color: '#d97706', fontSize: 20 }} />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 10.5, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.8 }}>Setor Gargalo Agora</div>
              {setorGargalo ? (
                <div style={{ fontSize: 18, fontWeight: 800, color: '#1a3a5c' }}>
                  {setorGargalo.nome}
                  <span style={{ fontSize: 13, fontWeight: 600, color: '#d97706', marginLeft: 10 }}>
                    {setorGargalo.itens.length} peças paradas
                    {totalWipGargalo > 0 && ` · ${Math.round((setorGargalo.itens.length / totalWipGargalo) * 100)}% do total em produção`}
                  </span>
                </div>
              ) : (
                <div style={{ fontSize: 14, color: '#aaa' }}>Sem peças em produção agora</div>
              )}
            </div>
          </div>

          <div style={{ flex: 1, minHeight: 0, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            {/* Atrasados */}
            <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: '14px 18px', boxShadow: '0 1px 3px rgba(0,0,0,.04)', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                <i className="bi bi-calendar-x-fill" style={{ color: '#dc3545' }} /> Pedidos Atrasados
              </div>
              <div style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
                {atrasados.length === 0 ? (
                  <div style={{ color: '#aaa', fontSize: 13, textAlign: 'center', margin: 'auto', paddingTop: 20 }}>Nenhum pedido atrasado 🎉</div>
                ) : (
                  atrasados.map(a => (
                    <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px', marginBottom: 4, background: '#fef2f2', borderRadius: 6, borderLeft: '3px solid #dc3545' }}>
                      <span style={{ fontWeight: 700, fontSize: 12.5, color: '#1a3a5c', flexShrink: 0 }}>{a.numero_pedido_venda}</span>
                      <span style={{ fontSize: 11.5, color: '#94a3b8', flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{a.cliente}</span>
                      <span style={{ fontSize: 11, fontWeight: 700, color: '#dc3545', flexShrink: 0, whiteSpace: 'nowrap' }}>
                        {a.dias_atraso}d atraso
                      </span>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Parados ha mais tempo */}
            <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: '14px 18px', boxShadow: '0 1px 3px rgba(0,0,0,.04)', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                <i className="bi bi-hourglass-split" style={{ color: '#d97706' }} /> Parados Há Mais Tempo
              </div>
              <div style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
                {parados.length === 0 ? (
                  <div style={{ color: '#aaa', fontSize: 13, textAlign: 'center', margin: 'auto', paddingTop: 20 }}>Nada parado agora 🎉</div>
                ) : (
                  parados.map(p => (
                    <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px', marginBottom: 4, background: '#fffbeb', borderRadius: 6, borderLeft: '3px solid #d97706' }}>
                      <span style={{ fontWeight: 700, fontSize: 12.5, color: '#1a3a5c', flexShrink: 0 }}>{p.numero_pedido_venda}</span>
                      <span style={{ fontSize: 11.5, color: '#94a3b8', flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.setor_nome}</span>
                      <span style={{ fontSize: 11, fontWeight: 700, color: '#d97706', flexShrink: 0, whiteSpace: 'nowrap' }}>
                        {p.dias_parado}d parado
                      </span>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Notificações de movimentação em tela cheia (fila - cada movimentacao aparece uma vez) */}
      <NotificacoesLive modo="tv" />
    </div>
  );
}
