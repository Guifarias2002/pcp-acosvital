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

const CORES = ['#0d6efd', '#198754', '#fd7e14', '#6f42c1', '#dc3545', '#20c997', '#ffc107', '#0dcaf0'];
const DWELL_SETOR_MS = 14_000;

function Barra({ label, qtd, pct, cor }: { label: string; qtd: number; pct: number; cor: string }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 4 }}>
        <span style={{ fontSize: 14, fontWeight: 700, color: '#e2e8f0' }}>{label}</span>
        <span style={{ fontSize: 12, color: '#94a3b8' }}>
          <strong style={{ fontSize: 15, color: '#fff' }}>{pct}%</strong> · {qtd} mov.
        </span>
      </div>
      <div style={{ background: 'rgba(255,255,255,0.08)', borderRadius: 6, height: 10, overflow: 'hidden' }}>
        <div style={{ width: `${Math.max(pct, 2)}%`, height: '100%', background: cor, borderRadius: 6, transition: 'width .6s ease' }} />
      </div>
    </div>
  );
}

export default function TVMovimentacoesPage() {
  const [lideres, setLideres] = useState<LiderStat[]>([]);
  const [setoresStat, setSetoresStat] = useState<SetorStat[]>([]);
  const [totalMov, setTotalMov] = useState(0);
  const [agora, setAgora] = useState('');
  const [setoresKanban, setSetoresKanban] = useState<SetorKanban[]>([]);
  const [setorIdx, setSetorIdx] = useState(0);
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

  // Setores com pelo menos 1 pedido — gira entre eles, um de cada vez.
  const setoresAtivos = setoresKanban.filter(s => s.itens.length > 0);
  useEffect(() => {
    if (setoresAtivos.length === 0) return;
    const id = setTimeout(() => setSetorIdx(i => (i + 1) % setoresAtivos.length), DWELL_SETOR_MS);
    return () => clearTimeout(id);
  }, [setorIdx, setoresAtivos.length]);
  // Garante indice valido se a lista de setores ativos encolher entre uma atualizacao e outra.
  const setorAtual = setoresAtivos.length > 0 ? setoresAtivos[setorIdx % setoresAtivos.length] : null;

  // Agrupa as parciais do setor atual por pedido, pra mostrar 1 linha por pedido.
  const pedidosDoSetor = (() => {
    if (!setorAtual) return [];
    const mapa = new Map<string, { numero: string; cliente: string; itens: number; qtdTotal: number; unidade: string }>();
    for (const it of setorAtual.itens) {
      const key = it.pedido_numero || String(it.pedido_id);
      if (!mapa.has(key)) mapa.set(key, { numero: it.pedido_numero, cliente: it.pedido_cliente, itens: 0, qtdTotal: 0, unidade: it.unidade });
      const g = mapa.get(key)!;
      g.itens += 1;
      g.qtdTotal += Number(it.quantidade_pendente) || 0;
    }
    return Array.from(mapa.values());
  })();

  return (
    <div style={{
      minHeight: '100vh', height: '100vh', boxSizing: 'border-box', overflow: 'hidden',
      background: 'linear-gradient(160deg, #0b1220 0%, #101b2d 60%, #0b1220 100%)',
      padding: '24px 32px', display: 'flex', flexDirection: 'column', fontFamily: 'Arial, sans-serif',
    }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18, flexShrink: 0 }}>
        <div>
          <h1 style={{ margin: 0, fontWeight: 800, color: '#fff', fontSize: 24, display: 'flex', alignItems: 'center', gap: 10 }}>
            <i className="bi bi-activity" style={{ color: '#0d6efd' }} />
            Movimentação em Tempo Real
          </h1>
          <div style={{ color: '#64748b', fontSize: 13, marginTop: 2 }}>PCP ACOSVITAL — atividade de produção ao vivo</div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 30, fontWeight: 800, color: '#fff', fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>{agora}</div>
          <div style={{ fontSize: 12, color: '#64748b', marginTop: 4 }}>{totalMov} movimentações no total</div>
        </div>
      </div>

      {semSessao && (
        <div style={{
          background: 'rgba(220,38,38,0.12)', border: '1px solid rgba(220,38,38,0.4)', borderRadius: 12,
          padding: '14px 20px', marginBottom: 18, display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0,
        }}>
          <i className="bi bi-exclamation-triangle-fill" style={{ color: '#f87171', fontSize: 20 }} />
          <div style={{ color: '#fecaca', fontSize: 14 }}>
            <strong>Sessão não encontrada nesta aba.</strong> Faça login no sistema neste navegador (uma vez só) pra essa tela
            voltar a atualizar sozinha — <a href="/login" style={{ color: '#fff', textDecoration: 'underline' }}>abrir login</a>.
          </div>
        </div>
      )}

      {/* % por líder / % por setor — faixa compacta no topo */}
      <div style={{ flex: '0 0 34%', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, minHeight: 0, marginBottom: 20 }}>
        <div style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 14, padding: '18px 22px', overflowY: 'auto' }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 14, display: 'flex', alignItems: 'center', gap: 8 }}>
            <i className="bi bi-people-fill" /> % Movimentação por Líder
          </div>
          {lideres.length === 0 ? (
            <div style={{ color: '#475569', fontSize: 13, textAlign: 'center', padding: '20px 0' }}>Sem movimentações registradas</div>
          ) : (
            lideres.map((l, i) => (
              <Barra key={l.usuario_id} label={l.usuario_nome} qtd={l.qtd} pct={l.pct} cor={CORES[i % CORES.length]} />
            ))
          )}
        </div>

        <div style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 14, padding: '18px 22px', overflowY: 'auto' }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 14, display: 'flex', alignItems: 'center', gap: 8 }}>
            <i className="bi bi-diagram-3-fill" /> % Movimentação por Setor
          </div>
          {setoresStat.length === 0 ? (
            <div style={{ color: '#475569', fontSize: 13, textAlign: 'center', padding: '20px 0' }}>Sem movimentações registradas</div>
          ) : (
            setoresStat.map((s, i) => (
              <Barra key={s.setor} label={s.setor_nome} qtd={s.qtd} pct={s.pct} cor={CORES[i % CORES.length]} />
            ))
          )}
        </div>
      </div>

      {/* Setor atual, girando — cada pedido que está lá agora */}
      <div style={{
        flex: 1, minHeight: 0, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)',
        borderRadius: 16, padding: '20px 26px', display: 'flex', flexDirection: 'column',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14, flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <i className="bi bi-geo-alt-fill" style={{ color: '#0d6efd', fontSize: 20 }} />
            <span style={{ fontSize: 22, fontWeight: 800, color: '#fff' }}>{setorAtual ? setorAtual.nome : 'Setores'}</span>
            {setorAtual && (
              <span style={{ background: '#0d6efd', color: '#fff', fontSize: 12, fontWeight: 700, padding: '2px 10px', borderRadius: 20 }}>
                {pedidosDoSetor.length} pedido{pedidosDoSetor.length !== 1 ? 's' : ''}
              </span>
            )}
          </div>
          {/* Indicador de qual setor da rotacao esta ativo */}
          {setoresAtivos.length > 1 && (
            <div style={{ display: 'flex', gap: 5 }}>
              {setoresAtivos.map((s, i) => (
                <span key={s.cod} style={{
                  width: 7, height: 7, borderRadius: '50%',
                  background: i === (setorIdx % setoresAtivos.length) ? '#0d6efd' : 'rgba(255,255,255,0.15)',
                }} />
              ))}
            </div>
          )}
        </div>

        <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
          {!setorAtual ? (
            <div style={{ color: '#475569', fontSize: 14, textAlign: 'center', padding: '40px 0' }}>Nenhum pedido em produção agora</div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 12 }}>
              {pedidosDoSetor.map(p => (
                <div key={p.numero} style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 10, padding: '12px 16px' }}>
                  <div style={{ fontSize: 16, fontWeight: 800, color: '#fff' }}>{p.numero}</div>
                  <div style={{ fontSize: 12, color: '#94a3b8', marginBottom: 6, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.cliente}</div>
                  <div style={{ fontSize: 12, color: '#cbd5e1' }}>
                    {p.itens} item{p.itens !== 1 ? 's' : ''} · {p.qtdTotal} {p.unidade}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Notificações de movimentação em tela cheia (mesma lógica das telas de setor) */}
      <NotificacoesLive modo="tela" />
    </div>
  );
}
