'use client';
import { useEffect, useState, useCallback } from 'react';
import { useRealtime } from '@/hooks/useRealtime';
import { getToken } from '@/lib/auth';
import { posSetorRoteiro } from '@/lib/types';
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

interface VelocidadeSetor {
  setor: string;
  setor_nome: string;
  tempo_medio_min: number;
  tempo_total_min: number;
  amostras: number;
}
interface VelocidadeUsuario {
  id: number;
  nome: string;
  tempo_medio_min: number;
  tempo_total_min: number;
  amostras: number;
}
interface VelocidadePeriodo {
  setores: VelocidadeSetor[];
  usuarios: VelocidadeUsuario[];
}
const VEL_VAZIO: VelocidadePeriodo = { setores: [], usuarios: [] };

const CORES = ['#0d6efd', '#198754', '#fd7e14', '#6f42c1', '#dc3545', '#20c997', '#b45309', '#0dcaf0'];
const PRIO_COR: Record<string, string> = { baixa: '#94a3b8', normal: '#0d6efd', alta: '#d97706', urgente: '#dc3545' };
const DWELL_VIEW_MS = 25_000;

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

// Tempo em minutos -> texto curto pra TV: "45min", "3h 20min", "1,5 dias".
function formatarTempo(min: number) {
  if (!min || min <= 0) return '—';
  if (min < 60) return `${min}min`;
  const horas = min / 60;
  if (horas < 24) {
    const h = Math.floor(horas);
    const m = Math.round(min - h * 60);
    return m > 0 ? `${h}h ${m}min` : `${h}h`;
  }
  return `${(horas / 24).toFixed(1).replace('.', ',')} dias`;
}

// Cor da barra pela velocidade relativa: quanto menor o tempo, mais verde;
// quanto maior (mais devagar), mais vermelho.
function corVelocidade(min: number, maxMin: number) {
  if (maxMin <= 0) return '#16a34a';
  const r = min / maxMin;
  if (r <= 0.34) return '#16a34a'; // rápido
  if (r <= 0.67) return '#d97706'; // médio
  return '#dc3545';                 // devagar
}

// Barra horizontal do comparativo de velocidade: nome à esquerda, barra (média
// por peça) no meio, e à direita a média em destaque + o total somado embaixo.
function BarraH({ label, valorLabel, subLabel, pct, cor }: { label: string; valorLabel: string; subLabel?: string; pct: number; cor: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
      <span style={{ width: 150, flexShrink: 0, fontSize: 12.5, fontWeight: 700, color: '#1a3a5c', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{label}</span>
      <div style={{ flex: 1, background: '#eef2f7', borderRadius: 5, height: 16, overflow: 'hidden' }}>
        <div style={{ width: `${Math.max(pct, 3)}%`, height: '100%', background: cor, borderRadius: 5, transition: 'width .6s ease' }} />
      </div>
      <span style={{ width: 92, flexShrink: 0, textAlign: 'right', lineHeight: 1.15 }}>
        <span style={{ display: 'block', fontSize: 12.5, fontWeight: 800, color: '#1a3a5c' }}>{valorLabel}</span>
        {subLabel && <span style={{ display: 'block', fontSize: 9.5, fontWeight: 600, color: '#94a3b8' }}>{subLabel}</span>}
      </span>
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
  const [velHoje, setVelHoje] = useState<VelocidadePeriodo>(VEL_VAZIO);
  const [velMes, setVelMes] = useState<VelocidadePeriodo>(VEL_VAZIO);
  const [velOntem, setVelOntem] = useState<VelocidadePeriodo>(VEL_VAZIO);
  const [velPeriodo, setVelPeriodo] = useState<'hoje' | 'mes' | 'ontem'>('hoje');
  const [view, setView] = useState<'kanban' | 'comparativo' | 'analise' | 'velocidade'>('kanban');

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
    fetch('/api/dashboard/comparativo-velocidade', { headers })
      .then(r => (r.ok ? r.json() : null))
      .then(data => { if (data) { setVelHoje(data.hoje || VEL_VAZIO); setVelMes(data.mes || VEL_VAZIO); setVelOntem(data.ontem || VEL_VAZIO); } })
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

  // Alterna entre Kanban, Comparativo mensal, Analise e Velocidade, com fade suave.
  useEffect(() => {
    const ordem: Array<'kanban' | 'comparativo' | 'analise' | 'velocidade'> = ['kanban', 'comparativo', 'analise', 'velocidade'];
    const id = setInterval(() => setView(v => ordem[(ordem.indexOf(v) + 1) % ordem.length]), DWELL_VIEW_MS);
    return () => clearInterval(id);
  }, []);

  // Na tela de velocidade, alterna sozinho entre Hoje, Mês atual e Ontem.
  useEffect(() => {
    const ordem: Array<'hoje' | 'mes' | 'ontem'> = ['hoje', 'mes', 'ontem'];
    const id = setInterval(() => setVelPeriodo(p => ordem[(ordem.indexOf(p) + 1) % ordem.length]), 8000);
    return () => clearInterval(id);
  }, []);

  const setoresAtivos = setoresKanban
    .filter(s => s.itens.length > 0)
    .sort((a, b) => posSetorRoteiro(a.cod) - posSetorRoteiro(b.cod));
  // Barras de % movimentacao tambem na ordem do roteiro, igual ao Kanban.
  const setoresStatOrdenados = [...setoresStat].sort((a, b) => posSetorRoteiro(a.setor) - posSetorRoteiro(b.setor));
  // Colunas em 2 blocos quando tem muito setor, pra caber tudo sem rolar.
  const meioSetores = Math.ceil(setoresStatOrdenados.length / 2);
  // Corta os meses anteriores ao primeiro que teve pedido - sem meses vazios
  // no comeco do grafico so porque o sistema comecou a ser usado depois.
  const primeiroComDado = meses.findIndex(m => m.qtd > 0);
  const mesesVisiveis = primeiroComDado === -1 ? meses.slice(-1) : meses.slice(primeiroComDado);
  const maxMes = Math.max(1, ...mesesVisiveis.map(m => m.qtd));
  const totalPedidosPeriodo = mesesVisiveis.reduce((s, m) => s + m.qtd, 0);
  // Comparativo de velocidade: usa o período em foco (mês atual ou ontem).
  // As listas já vêm ordenadas da API do mais rápido (menor média) pro mais devagar.
  const velAtual = velPeriodo === 'hoje' ? velHoje : velPeriodo === 'mes' ? velMes : velOntem;
  const velSetores = velAtual.setores;
  const velUsuarios = velAtual.usuarios;
  const velPeriodoLabel = velPeriodo === 'hoje' ? 'Hoje' : velPeriodo === 'mes' ? 'Mês atual' : 'Ontem';
  const velPeriodoVazioLabel = velPeriodo === 'hoje' ? 'hoje' : velPeriodo === 'mes' ? 'neste mês' : 'ontem';
  const maxVelSetor = Math.max(1, ...velSetores.map(s => s.tempo_medio_min));
  const maxVelUsuario = Math.max(1, ...velUsuarios.map(u => u.tempo_medio_min));
  const setorMaisAgil = velSetores[0] || null;
  const setorMaisLento = velSetores.length > 1 ? velSetores[velSetores.length - 1] : null;
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

        {/* ── VIEW: Comparativo mensal de pedidos criados (barras horizontais) ── */}
        <div style={{
          position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', gap: 14,
          opacity: view === 'comparativo' ? 1 : 0, transition: 'opacity 1s ease',
          pointerEvents: view === 'comparativo' ? 'auto' : 'none',
          background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: '20px 30px', boxShadow: '0 1px 3px rgba(0,0,0,.04)',
        }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: '#1a3a5c', display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
            <i className="bi bi-bar-chart-line-fill" style={{ color: '#0d6efd' }} /> Comparativo de Pedidos Criados por Mês
          </div>

          {/* Cardzinhos de destaque: total do período + variação */}
          <div style={{ display: 'flex', gap: 12, flexShrink: 0 }}>
            <div style={{ flex: 1, background: '#f8fafc', border: '1px solid #e5e7eb', borderRadius: 10, padding: '10px 16px' }}>
              <div style={{ fontSize: 10.5, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.8 }}>Total no período</div>
              <div style={{ fontSize: 26, fontWeight: 800, color: '#1a3a5c', lineHeight: 1.1 }}>{totalPedidosPeriodo} <span style={{ fontSize: 13, fontWeight: 600, color: '#94a3b8' }}>pedidos</span></div>
            </div>
            <div style={{ flex: 1, background: '#f8fafc', border: '1px solid #e5e7eb', borderRadius: 10, padding: '10px 16px' }}>
              <div style={{ fontSize: 10.5, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.8 }}>Mês atual vs anterior</div>
              {variacaoPct !== null ? (
                <div style={{ fontSize: 26, fontWeight: 800, lineHeight: 1.1, color: variacaoPct >= 0 ? '#166534' : '#991b1b' }}>
                  <i className={`bi ${variacaoPct >= 0 ? 'bi-arrow-up' : 'bi-arrow-down'}`} style={{ fontSize: 20 }} /> {Math.abs(variacaoPct)}%
                </div>
              ) : (
                <div style={{ fontSize: 20, fontWeight: 700, color: '#94a3b8', lineHeight: 1.4 }}>—</div>
              )}
            </div>
          </div>

          {/* Barras horizontais: um mês por linha */}
          <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 10, overflowY: 'auto' }}>
            {mesesVisiveis.length === 0 ? (
              <div style={{ color: '#aaa', fontSize: 14, margin: 'auto' }}>Sem dados de pedidos ainda</div>
            ) : (
              mesesVisiveis.map((m, i) => {
                const isAtual = i === mesesVisiveis.length - 1;
                const larguraPct = Math.round((m.qtd / maxMes) * 100);
                return (
                  <div key={m.mes} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <span style={{ width: 90, flexShrink: 0, fontSize: 14, fontWeight: isAtual ? 800 : 600, color: isAtual ? '#0d6efd' : '#64748b' }}>
                      {m.label}{isAtual && <span style={{ fontSize: 9, color: '#0d6efd', fontWeight: 700, marginLeft: 4 }}>ATUAL</span>}
                    </span>
                    <div style={{ flex: 1, background: '#eef2f7', borderRadius: 6, height: 26, overflow: 'hidden' }}>
                      <div style={{
                        width: `${Math.max(larguraPct, 2)}%`, height: '100%',
                        background: isAtual ? '#0d6efd' : '#c7d2fe', borderRadius: 6, transition: 'width .8s ease',
                      }} />
                    </div>
                    <span style={{ width: 44, flexShrink: 0, fontSize: 20, fontWeight: 800, color: isAtual ? '#0d6efd' : '#1a3a5c', textAlign: 'right' }}>{m.qtd}</span>
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

        {/* ── VIEW: Comparativo de Velocidade (setores e usuários, rápido × devagar) ── */}
        <div style={{
          position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', gap: 12,
          opacity: view === 'velocidade' ? 1 : 0, transition: 'opacity 1s ease',
          pointerEvents: view === 'velocidade' ? 'auto' : 'none',
        }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: '#1a3a5c', display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
            <i className="bi bi-speedometer" style={{ color: '#0d6efd' }} /> Comparativo de Velocidade
            <span style={{ fontSize: 12, fontWeight: 800, color: '#fff', background: '#0d6efd', borderRadius: 20, padding: '2px 12px' }}>{velPeriodoLabel}</span>
            <span style={{ fontSize: 11, fontWeight: 600, color: '#94a3b8' }}>· barra = média por peça · alterna hoje ⇄ mês ⇄ ontem</span>
          </div>

          {/* Cardzinhos de destaque: setor mais ágil e mais devagar */}
          <div style={{ display: 'flex', gap: 12, flexShrink: 0 }}>
            <div style={{ flex: 1, background: '#ecfdf5', border: '1px solid #a7f3d0', borderRadius: 10, padding: '10px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
              <i className="bi bi-lightning-charge-fill" style={{ color: '#16a34a', fontSize: 20 }} />
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 10.5, fontWeight: 700, color: '#166534', textTransform: 'uppercase', letterSpacing: 0.8 }}>Setor mais ágil</div>
                <div style={{ fontSize: 16, fontWeight: 800, color: '#14532d' }}>
                  {setorMaisAgil ? <>{setorMaisAgil.setor_nome} <span style={{ fontSize: 12, fontWeight: 600 }}>· {formatarTempo(setorMaisAgil.tempo_medio_min)}</span></> : 'Sem dados'}
                </div>
              </div>
            </div>
            <div style={{ flex: 1, background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 10, padding: '10px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
              <i className="bi bi-hourglass-bottom" style={{ color: '#dc3545', fontSize: 20 }} />
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 10.5, fontWeight: 700, color: '#991b1b', textTransform: 'uppercase', letterSpacing: 0.8 }}>Setor mais devagar</div>
                <div style={{ fontSize: 16, fontWeight: 800, color: '#7f1d1d' }}>
                  {setorMaisLento ? <>{setorMaisLento.setor_nome} <span style={{ fontSize: 12, fontWeight: 600 }}>· {formatarTempo(setorMaisLento.tempo_medio_min)}</span></> : 'Sem dados'}
                </div>
              </div>
            </div>
          </div>

          {/* Dois rankings horizontais lado a lado */}
          <div style={{ flex: 1, minHeight: 0, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: '14px 18px', boxShadow: '0 1px 3px rgba(0,0,0,.04)', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                <i className="bi bi-diagram-3-fill" style={{ color: '#0d6efd' }} /> Setores — rápido → devagar
              </div>
              <div style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
                {velSetores.length === 0 ? (
                  <div style={{ color: '#aaa', fontSize: 13, textAlign: 'center', paddingTop: 20 }}>Sem movimentações {velPeriodoVazioLabel}</div>
                ) : (
                  velSetores.map(s => (
                    <BarraH key={s.setor} label={s.setor_nome} valorLabel={formatarTempo(s.tempo_medio_min)} subLabel={`total ${formatarTempo(s.tempo_total_min)}`} pct={(s.tempo_medio_min / maxVelSetor) * 100} cor={corVelocidade(s.tempo_medio_min, maxVelSetor)} />
                  ))
                )}
              </div>
            </div>
            <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: '14px 18px', boxShadow: '0 1px 3px rgba(0,0,0,.04)', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                <i className="bi bi-people-fill" style={{ color: '#0d6efd' }} /> Usuários — rápido → devagar
              </div>
              <div style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
                {velUsuarios.length === 0 ? (
                  <div style={{ color: '#aaa', fontSize: 13, textAlign: 'center', paddingTop: 20 }}>Sem movimentações {velPeriodoVazioLabel}</div>
                ) : (
                  velUsuarios.map(u => (
                    <BarraH key={u.id} label={u.nome} valorLabel={formatarTempo(u.tempo_medio_min)} subLabel={`total ${formatarTempo(u.tempo_total_min)}`} pct={(u.tempo_medio_min / maxVelUsuario) * 100} cor={corVelocidade(u.tempo_medio_min, maxVelUsuario)} />
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
