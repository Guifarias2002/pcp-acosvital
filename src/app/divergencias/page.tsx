'use client';
import { useEffect, useState } from 'react';
import AuthGuard from '@/components/AuthGuard';
import Link from 'next/link';
import { getToken } from '@/lib/auth';

interface Divergencia {
  id: number;
  pedido_id: number;
  item_id: number | null;
  tipo: string;
  descricao: string;
  setor_responsavel: string | null;
  status: string;
  prioridade: string;
  observacao_resolucao: string | null;
  criado_em: string;
  resolvido_em: string | null;
  numero_pedido_venda: string;
  cliente: string;
  item_codigo: string | null;
  item_descricao: string | null;
  usuario_nome: string | null;
  resolvido_por_nome: string | null;
}

interface Totais {
  abertas: number; em_analise: number; resolvidas: number; canceladas: number; total: number;
}

const TIPO_INFO: Record<string, { icon: string; color: string; label: string }> = {
  qualidade:    { icon: 'bi-shield-exclamation', color: '#dc2626', label: 'Qualidade' },
  quantidade:   { icon: 'bi-123',               color: '#d97706', label: 'Quantidade' },
  dano:         { icon: 'bi-box-seam',           color: '#7c3aed', label: 'Dano / Avaria' },
  documentacao: { icon: 'bi-file-earmark-x',     color: '#0891b2', label: 'Documentação' },
  prazo:        { icon: 'bi-calendar-x',         color: '#059669', label: 'Prazo' },
  outro:        { icon: 'bi-three-dots',         color: '#6b7280', label: 'Outro' },
};

const STATUS_INFO: Record<string, { label: string; bg: string; color: string }> = {
  aberta:     { label: 'Aberta',      bg: '#fef2f2', color: '#dc2626' },
  em_analise: { label: 'Em Análise',  bg: '#fffbeb', color: '#d97706' },
  resolvida:  { label: 'Resolvida',   bg: '#f0fdf4', color: '#16a34a' },
  cancelada:  { label: 'Cancelada',   bg: '#f3f4f6', color: '#6b7280' },
};

const PRIO_COLOR: Record<string, string> = {
  baixa: '#6b7280', normal: '#2563eb', alta: '#d97706', urgente: '#dc2626',
};

function fmtHora(s: string) {
  if (!s) return '';
  const d = new Date(s);
  return d.toLocaleDateString('pt-BR') + ' ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

export default function DivergenciasPage() {
  const [divs, setDivs] = useState<Divergencia[]>([]);
  const [totais, setTotais] = useState<Totais | null>(null);
  const [loading, setLoading] = useState(true);
  const [fStatus, setFStatus] = useState('');
  const [fTipo, setFTipo] = useState('');
  const [expandido, setExpandido] = useState<number | null>(null);
  const [resolvendo, setResolvendo] = useState<number | null>(null);
  const [obsResolucao, setObsResolucao] = useState('');
  const [atualizando, setAtualizando] = useState(false);

  function buscar() {
    setLoading(true);
    const p = new URLSearchParams();
    if (fStatus) p.set('status', fStatus);
    if (fTipo) p.set('tipo', fTipo);
    fetch(`/api/divergencias?${p}`, { headers: { Authorization: `Bearer ${getToken() || ''}` } })
      .then(r => r.json())
      .then(d => { setDivs(d.divergencias || []); setTotais(d.totais || null); })
      .finally(() => setLoading(false));
  }

  useEffect(() => { buscar(); }, []);

  async function atualizarStatus(id: number, status: string, obs?: string) {
    setAtualizando(true);
    await fetch(`/api/divergencias/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken() || ''}` },
      body: JSON.stringify({ status, observacao_resolucao: obs || undefined }),
    });
    setResolvendo(null);
    setObsResolucao('');
    setAtualizando(false);
    buscar();
  }

  return (
    <AuthGuard>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <h4 style={{ margin: 0, fontWeight: 700, color: '#1a3a5c', fontSize: 20 }}>
            <i className="bi bi-exclamation-triangle-fill" style={{ marginRight: 8, color: '#dc2626' }} />
            Divergências
          </h4>
          <small style={{ color: '#888' }}>Problemas reportados em pedidos entregues</small>
        </div>
      </div>

      {/* Cards de totais */}
      {totais && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12, marginBottom: 18 }}>
          {[
            { label: 'Abertas',     val: totais.abertas,     color: '#dc2626', icon: 'bi-exclamation-circle-fill', filtro: 'aberta' },
            { label: 'Em Análise',  val: totais.em_analise,  color: '#d97706', icon: 'bi-hourglass-split',         filtro: 'em_analise' },
            { label: 'Resolvidas',  val: totais.resolvidas,  color: '#16a34a', icon: 'bi-check-circle-fill',       filtro: 'resolvida' },
            { label: 'Canceladas',  val: totais.canceladas,  color: '#6b7280', icon: 'bi-x-circle-fill',           filtro: 'cancelada' },
          ].map(c => (
            <button key={c.label} onClick={() => { setFStatus(fStatus === c.filtro ? '' : c.filtro); setTimeout(buscar, 0); }}
              className="card"
              style={{ padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer',
                border: fStatus === c.filtro ? `2px solid ${c.color}` : '2px solid transparent',
                background: fStatus === c.filtro ? c.color + '10' : '#fff' }}>
              <i className={`bi ${c.icon}`} style={{ fontSize: 26, color: c.color }} />
              <div>
                <div style={{ fontSize: 22, fontWeight: 800, color: c.color }}>{c.val}</div>
                <div style={{ fontSize: 11, color: '#888' }}>{c.label}</div>
              </div>
            </button>
          ))}
        </div>
      )}

      {/* Filtros */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
        <select value={fStatus} onChange={e => setFStatus(e.target.value)}
          style={{ border: '1px solid #dee2e6', borderRadius: 6, padding: '6px 12px', fontSize: 13 }}>
          <option value="">Todos os status</option>
          <option value="aberta">Abertas</option>
          <option value="em_analise">Em Análise</option>
          <option value="resolvida">Resolvidas</option>
          <option value="cancelada">Canceladas</option>
        </select>
        <select value={fTipo} onChange={e => setFTipo(e.target.value)}
          style={{ border: '1px solid #dee2e6', borderRadius: 6, padding: '6px 12px', fontSize: 13 }}>
          <option value="">Todos os tipos</option>
          {Object.entries(TIPO_INFO).map(([k, v]) => (
            <option key={k} value={k}>{v.label}</option>
          ))}
        </select>
        <button onClick={buscar} className="btn btn-primary btn-sm">
          <i className="bi bi-search" style={{ marginRight: 4 }} />Filtrar
        </button>
        {(fStatus || fTipo) && (
          <button onClick={() => { setFStatus(''); setFTipo(''); setTimeout(buscar, 100); }}
            style={{ background: 'none', border: '1px solid #dee2e6', borderRadius: 6, padding: '6px 12px', fontSize: 13, cursor: 'pointer', color: '#888' }}>
            × Limpar
          </button>
        )}
      </div>

      {loading && <p style={{ textAlign: 'center', color: '#aaa', padding: 40 }}>Carregando...</p>}

      {/* Lista */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {!loading && divs.length === 0 && (
          <div className="card" style={{ padding: 40, textAlign: 'center', color: '#aaa' }}>
            <i className="bi bi-check-circle" style={{ fontSize: 40, display: 'block', marginBottom: 10, color: '#16a34a' }} />
            Nenhuma divergência encontrada.
          </div>
        )}

        {divs.map(d => {
          const ti = TIPO_INFO[d.tipo] || TIPO_INFO.outro;
          const si = STATUS_INFO[d.status] || STATUS_INFO.aberta;
          const aberto = expandido === d.id;

          return (
            <div key={d.id} className="card" style={{ overflow: 'hidden', border: `1px solid ${d.status === 'aberta' ? '#fecaca' : '#e5e7eb'}` }}>
              {/* Cabeçalho da divergência */}
              <div style={{ padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 14, cursor: 'pointer' }}
                onClick={() => setExpandido(aberto ? null : d.id)}>
                {/* Ícone tipo */}
                <div style={{ width: 40, height: 40, borderRadius: 10, background: ti.color + '15', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <i className={`bi ${ti.icon}`} style={{ fontSize: 20, color: ti.color }} />
                </div>

                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2, flexWrap: 'wrap' }}>
                    <span style={{ fontWeight: 700, color: '#1a3a5c', fontSize: 14 }}>{ti.label}</span>
                    <span style={{ fontSize: 11, background: si.bg, color: si.color, padding: '2px 8px', borderRadius: 20, fontWeight: 700 }}>{si.label}</span>
                    <span style={{ fontSize: 11, background: PRIO_COLOR[d.prioridade] + '15', color: PRIO_COLOR[d.prioridade], padding: '2px 8px', borderRadius: 20, fontWeight: 700 }}>
                      {d.prioridade.charAt(0).toUpperCase() + d.prioridade.slice(1)}
                    </span>
                  </div>
                  <div style={{ fontSize: 13, color: '#555', marginBottom: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {d.descricao}
                  </div>
                  <div style={{ fontSize: 11, color: '#999', display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                    <span>
                      <i className="bi bi-bag-check" style={{ marginRight: 4 }} />
                      <Link href={`/pedidos/${d.pedido_id}`} onClick={e => e.stopPropagation()}
                        style={{ color: '#2563eb', fontWeight: 700 }}>{d.numero_pedido_venda}</Link>
                      {' · '}{d.cliente}
                    </span>
                    {d.item_codigo && <span><i className="bi bi-gear" style={{ marginRight: 4 }} />{d.item_codigo}</span>}
                    <span><i className="bi bi-clock" style={{ marginRight: 4 }} />{fmtHora(d.criado_em)}</span>
                    {d.usuario_nome && <span><i className="bi bi-person" style={{ marginRight: 4 }} />{d.usuario_nome}</span>}
                  </div>
                </div>

                {/* Ações rápidas */}
                <div style={{ display: 'flex', gap: 6, flexShrink: 0 }} onClick={e => e.stopPropagation()}>
                  {d.status === 'aberta' && (
                    <button onClick={() => atualizarStatus(d.id, 'em_analise')}
                      style={{ fontSize: 11, background: '#fffbeb', border: '1px solid #fde68a', color: '#d97706', borderRadius: 6, padding: '4px 10px', cursor: 'pointer', fontWeight: 700 }}>
                      <i className="bi bi-hourglass-split" style={{ marginRight: 4 }} />Em Análise
                    </button>
                  )}
                  {(d.status === 'aberta' || d.status === 'em_analise') && (
                    <button onClick={() => { setResolvendo(d.id); setExpandido(d.id); }}
                      style={{ fontSize: 11, background: '#f0fdf4', border: '1px solid #bbf7d0', color: '#16a34a', borderRadius: 6, padding: '4px 10px', cursor: 'pointer', fontWeight: 700 }}>
                      <i className="bi bi-check-lg" style={{ marginRight: 4 }} />Resolver
                    </button>
                  )}
                  {d.status === 'aberta' && (
                    <button onClick={() => atualizarStatus(d.id, 'cancelada')}
                      style={{ fontSize: 11, background: '#f3f4f6', border: '1px solid #e5e7eb', color: '#6b7280', borderRadius: 6, padding: '4px 10px', cursor: 'pointer', fontWeight: 700 }}>
                      <i className="bi bi-x" style={{ marginRight: 2 }} />Cancelar
                    </button>
                  )}
                </div>

                <i className={`bi bi-chevron-${aberto ? 'up' : 'down'}`} style={{ color: '#aaa', flexShrink: 0 }} />
              </div>

              {/* Painel expandido */}
              {aberto && (
                <div style={{ borderTop: '1px solid #f0f0f0', padding: '14px 18px', background: '#fafafa' }}>
                  <div style={{ fontSize: 13, color: '#444', marginBottom: 10, lineHeight: 1.6 }}>
                    <strong>Descrição completa:</strong><br />{d.descricao}
                  </div>

                  {d.observacao_resolucao && (
                    <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8, padding: '10px 14px', marginBottom: 10, fontSize: 13, color: '#166534' }}>
                      <strong><i className="bi bi-check-circle-fill" style={{ marginRight: 6 }} />Resolução:</strong> {d.observacao_resolucao}
                      {d.resolvido_por_nome && <span style={{ color: '#888', marginLeft: 8 }}>· {d.resolvido_por_nome} em {fmtHora(d.resolvido_em!)}</span>}
                    </div>
                  )}

                  {/* Form de resolução */}
                  {resolvendo === d.id && (
                    <div style={{ background: '#fff', border: '1px solid #bbf7d0', borderRadius: 10, padding: 14, marginTop: 8 }}>
                      <div style={{ fontSize: 12, fontWeight: 700, color: '#166534', marginBottom: 8 }}>
                        <i className="bi bi-check-circle" style={{ marginRight: 6 }} />Como foi resolvida?
                      </div>
                      <textarea
                        value={obsResolucao} onChange={e => setObsResolucao(e.target.value)} rows={3}
                        placeholder="Descreva como a divergência foi resolvida..."
                        style={{ width: '100%', border: '1px solid #d1fae5', borderRadius: 8, padding: '8px 12px', fontSize: 13, resize: 'none', boxSizing: 'border-box', marginBottom: 10 }}
                      />
                      <div style={{ display: 'flex', gap: 8 }}>
                        <button onClick={() => { setResolvendo(null); setObsResolucao(''); }}
                          style={{ flex: 1, background: '#f3f4f6', border: 'none', borderRadius: 8, padding: '8px 0', fontSize: 13, cursor: 'pointer', color: '#555' }}>
                          Cancelar
                        </button>
                        <button onClick={() => atualizarStatus(d.id, 'resolvida', obsResolucao)} disabled={atualizando}
                          style={{ flex: 2, background: '#16a34a', border: 'none', borderRadius: 8, padding: '8px 0', fontSize: 13, fontWeight: 700, cursor: 'pointer', color: '#fff' }}>
                          <i className="bi bi-check-lg" style={{ marginRight: 6 }} />
                          {atualizando ? 'Salvando...' : 'Confirmar Resolução'}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </AuthGuard>
  );
}
