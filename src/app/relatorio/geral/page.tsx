'use client';
import { useEffect, useState, useRef } from 'react';
import { getToken } from '@/lib/auth';

const NOMES: Record<string, string> = {
  emissao: 'Emissão de Ordens', usinagem: 'Usinagem', 'maçarico': 'Maçarico',
  plasma: 'Plasma', laser: 'Laser', estoque: 'Estoque', furacao: 'Furação',
  qualidade: 'Inspeção de Qualidade', acabamento: 'Acabamento',
  logistica: 'Logística', recebimento: 'Recebimento', compras: 'Compras',
  beneficiadores: 'Beneficiadores', caldeiraria: 'Caldeiraria', embalagem: 'Embalagem',
};

const STATUS_LABEL: Record<string, string> = {
  emitido: 'Emitido', aguardando: 'Aguardando', recebido: 'Recebido',
  em_andamento: 'Em Andamento', finalizado_setor: 'Finalizado',
  em_transito: 'Em Trânsito', entregue: 'Entregue',
  bloqueado: 'Bloqueado', reprovado: 'Reprovado',
};

const STATUS_COR: Record<string, string> = {
  entregue: '#16a34a', emitido: '#6b7280', aguardando: '#d97706',
  em_andamento: '#2563eb', reprovado: '#dc2626', bloqueado: '#9333ea',
};

function fmtData(s: string | null) {
  if (!s) return '—';
  return new Date(s + 'T12:00:00').toLocaleDateString('pt-BR');
}
function fmtMin(min: number) {
  if (!min || min <= 0) return '—';
  if (min < 60) return `${min}min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m > 0 ? `${h}h ${m}min` : `${h}h`;
}
function fmtR$(v: string | number | null) {
  const n = Number(v);
  if (!v || isNaN(n)) return '—';
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}
function hoje() {
  return new Date().toISOString().split('T')[0];
}
function primeiroDiaMes() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
}

interface Dados {
  periodo: { de: string; ate: string };
  resumo: { total_pedidos: number; pedidos_entregues: number; valor_total: string };
  pedidos: { id: number; numero: string; cliente: string; status: string; prioridade: string; criado_em: string; prazo_entrega: string; valor_total: string; qtd_itens: number; qtd_entregue: number; qtd_total: number }[];
  por_setor: { setor: string; total_movs: number; total_itens: number; total_usuarios: number }[];
  tempos_por_setor: { setor: string; tempo_medio_min: number; tempo_total_min: number; amostras: number }[];
  colaboradores: { id: number; nome: string; total_acoes: number; itens_movimentados: number; setores_atendidos: number; primeira_acao: string; ultima_acao: string }[];
  divergencias: { tipo: string; status: string; total: number }[];
}

const s = {
  page: { fontFamily: 'Arial, sans-serif', color: '#1a1a1a', background: '#fff', minHeight: '100vh' } as React.CSSProperties,
  container: { maxWidth: 1100, margin: '0 auto', padding: '32px 24px' } as React.CSSProperties,
  h1: { fontSize: 24, fontWeight: 800, color: '#1a3a5c', margin: 0 } as React.CSSProperties,
  h2: { fontSize: 15, fontWeight: 700, color: '#1a3a5c', borderBottom: '2px solid #1a3a5c', paddingBottom: 6, marginTop: 32, marginBottom: 16 } as React.CSSProperties,
  card: { background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 10, padding: '16px 20px' } as React.CSSProperties,
  table: { width: '100%', borderCollapse: 'collapse' as const, fontSize: 13 },
  th: { background: '#1a3a5c', color: '#fff', padding: '8px 10px', textAlign: 'left' as const, fontWeight: 600, fontSize: 12 },
  td: { padding: '7px 10px', borderBottom: '1px solid #f1f5f9' },
  tdAlt: { padding: '7px 10px', borderBottom: '1px solid #f1f5f9', background: '#f8fafc' },
};

export default function RelatorioGeralPage() {
  const [de, setDe] = useState(primeiroDiaMes());
  const [ate, setAte] = useState(hoje());
  const [dados, setDados] = useState<Dados | null>(null);
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState('');

  function carregar() {
    setLoading(true);
    setErro('');
    fetch(`/api/relatorios/geral?de=${de}&ate=${ate}`, {
      headers: { Authorization: `Bearer ${getToken() || ''}` },
    })
      .then(r => r.json())
      .then(d => {
        if (d.erro) setErro(d.erro);
        else {
          setDados(d);
          document.title = `Relatorio_Geral_${de}_${ate}`;
        }
      })
      .catch(e => setErro(String(e)))
      .finally(() => setLoading(false));
  }

  useEffect(() => { carregar(); }, []);

  const totalTempoGeral = (dados?.tempos_por_setor || []).reduce((a, t) => a + t.tempo_total_min, 0);
  const totalDivergencias = (dados?.divergencias || []).reduce((a, d) => a + d.total, 0);

  return (
    <div style={s.page}>
      <div style={s.container}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, marginBottom: 24 }}>
          <div>
            <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 4 }}>AcosVital — PCP</div>
            <h1 style={s.h1}>Relatório Geral de Produção</h1>
            {dados && (
              <div style={{ fontSize: 12, color: '#64748b', marginTop: 4 }}>
                Período: {fmtData(dados.periodo.de)} até {fmtData(dados.periodo.ate)}
              </div>
            )}
          </div>

          {/* Filtros */}
          <div className="no-print" style={{ display: 'flex', gap: 8, alignItems: 'flex-end', flexWrap: 'wrap' }}>
            <div>
              <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 3 }}>De</div>
              <input type="date" value={de} onChange={e => setDe(e.target.value)}
                style={{ border: '1px solid #d1d5db', borderRadius: 6, padding: '6px 10px', fontSize: 13 }} />
            </div>
            <div>
              <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 3 }}>Até</div>
              <input type="date" value={ate} onChange={e => setAte(e.target.value)}
                style={{ border: '1px solid #d1d5db', borderRadius: 6, padding: '6px 10px', fontSize: 13 }} />
            </div>
            <button onClick={carregar} disabled={loading}
              style={{ background: '#1a3a5c', color: '#fff', border: 'none', borderRadius: 6, padding: '8px 16px', fontSize: 13, fontWeight: 600, cursor: 'pointer', height: 34 }}>
              {loading ? 'Carregando...' : 'Atualizar'}
            </button>
            <button onClick={() => window.print()}
              style={{ background: '#f0f4ff', color: '#1a3a5c', border: '1px solid #c7d2fe', borderRadius: 6, padding: '8px 14px', fontSize: 13, fontWeight: 600, cursor: 'pointer', height: 34 }}>
              🖨 Imprimir
            </button>
          </div>
        </div>

        {erro && <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: 16, color: '#dc2626', marginBottom: 20 }}>{erro}</div>}
        {loading && <div style={{ textAlign: 'center', padding: 60, color: '#aaa' }}>Carregando...</div>}

        {dados && (
          <>
            {/* Cards de resumo */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12, marginBottom: 8 }}>
              {[
                { label: 'Total de Pedidos', valor: dados.resumo.total_pedidos, cor: '#1a3a5c' },
                { label: 'Pedidos Entregues', valor: dados.resumo.pedidos_entregues, cor: '#16a34a' },
                { label: 'Em Aberto', valor: dados.resumo.total_pedidos - dados.resumo.pedidos_entregues, cor: '#d97706' },
                { label: 'Valor Total', valor: fmtR$(dados.resumo.valor_total), cor: '#1a3a5c' },
                { label: 'Tempo Total Op.', valor: fmtMin(totalTempoGeral), cor: '#6366f1' },
                { label: 'Divergências', valor: totalDivergencias, cor: totalDivergencias > 0 ? '#dc2626' : '#16a34a' },
              ].map(c => (
                <div key={c.label} style={{ ...s.card, borderTop: `3px solid ${c.cor}` }}>
                  <div style={{ fontSize: 10, color: '#6b7280', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 }}>{c.label}</div>
                  <div style={{ fontSize: 22, fontWeight: 800, color: c.cor }}>{c.valor}</div>
                </div>
              ))}
            </div>

            {/* Tempo por Setor */}
            {dados.tempos_por_setor.length > 0 && (
              <>
                <h2 style={s.h2}>⏱ Tempo por Área</h2>
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 16 }}>
                  {dados.tempos_por_setor.map(t => (
                    <div key={t.setor} style={{ background: '#f0f4ff', border: '1px solid #c7d2fe', borderRadius: 8, padding: '10px 14px', minWidth: 120, textAlign: 'center' }}>
                      <div style={{ fontSize: 10, color: '#6366f1', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>
                        {NOMES[t.setor] || t.setor}
                      </div>
                      <div style={{ fontSize: 18, fontWeight: 800, color: '#1a3a5c' }}>{fmtMin(t.tempo_total_min)}</div>
                      <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 2 }}>
                        média: {fmtMin(t.tempo_medio_min)} · {t.amostras} oper.
                      </div>
                    </div>
                  ))}
                </div>
                <table style={s.table}>
                  <thead>
                    <tr>
                      <th style={s.th}>Área</th>
                      <th style={{ ...s.th, textAlign: 'center' }}>Tempo Total</th>
                      <th style={{ ...s.th, textAlign: 'center' }}>Tempo Médio / Item</th>
                      <th style={{ ...s.th, textAlign: 'center' }}>Operações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dados.tempos_por_setor.map((t, i) => (
                      <tr key={t.setor}>
                        <td style={i % 2 ? s.tdAlt : s.td}><strong>{NOMES[t.setor] || t.setor}</strong></td>
                        <td style={{ ...(i % 2 ? s.tdAlt : s.td), textAlign: 'center', fontWeight: 700 }}>
                          {fmtMin(t.tempo_total_min)}
                          {t.tempo_total_min >= 60 && <span style={{ color: '#94a3b8', fontSize: 10, marginLeft: 4 }}>({t.tempo_total_min}min)</span>}
                        </td>
                        <td style={{ ...(i % 2 ? s.tdAlt : s.td), textAlign: 'center' }}>{fmtMin(t.tempo_medio_min)}</td>
                        <td style={{ ...(i % 2 ? s.tdAlt : s.td), textAlign: 'center' }}>{t.amostras}</td>
                      </tr>
                    ))}
                    <tr style={{ background: '#1a3a5c', color: '#fff' }}>
                      <td style={{ padding: '8px 10px', fontWeight: 700 }}>TOTAL GERAL</td>
                      <td style={{ padding: '8px 10px', textAlign: 'center', fontWeight: 800 }}>{fmtMin(totalTempoGeral)}</td>
                      <td style={{ padding: '8px 10px', textAlign: 'center' }}>—</td>
                      <td style={{ padding: '8px 10px', textAlign: 'center' }}>
                        {dados.tempos_por_setor.reduce((a, t) => a + t.amostras, 0)}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </>
            )}

            {/* Movimentação por Setor */}
            {dados.por_setor.length > 0 && (
              <>
                <h2 style={s.h2}>🏭 Movimentação por Área</h2>
                <table style={s.table}>
                  <thead>
                    <tr>
                      <th style={s.th}>Área</th>
                      <th style={{ ...s.th, textAlign: 'center' }}>Itens Recebidos</th>
                      <th style={{ ...s.th, textAlign: 'center' }}>Total de Ações</th>
                      <th style={{ ...s.th, textAlign: 'center' }}>Colaboradores</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dados.por_setor.map((m, i) => (
                      <tr key={m.setor}>
                        <td style={i % 2 ? s.tdAlt : s.td}><strong>{NOMES[m.setor] || m.setor}</strong></td>
                        <td style={{ ...(i % 2 ? s.tdAlt : s.td), textAlign: 'center' }}>{m.total_itens}</td>
                        <td style={{ ...(i % 2 ? s.tdAlt : s.td), textAlign: 'center' }}>{m.total_movs}</td>
                        <td style={{ ...(i % 2 ? s.tdAlt : s.td), textAlign: 'center' }}>{m.total_usuarios}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </>
            )}

            {/* Colaboradores */}
            {dados.colaboradores.length > 0 && (
              <>
                <h2 style={s.h2}>👷 Colaboradores</h2>
                <table style={s.table}>
                  <thead>
                    <tr>
                      <th style={s.th}>Nome</th>
                      <th style={{ ...s.th, textAlign: 'center' }}>Ações</th>
                      <th style={{ ...s.th, textAlign: 'center' }}>Itens Movimentados</th>
                      <th style={{ ...s.th, textAlign: 'center' }}>Áreas Atendidas</th>
                      <th style={{ ...s.th, textAlign: 'center' }}>Última Ação</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dados.colaboradores.map((c, i) => (
                      <tr key={c.id}>
                        <td style={i % 2 ? s.tdAlt : s.td}><strong>{c.nome}</strong></td>
                        <td style={{ ...(i % 2 ? s.tdAlt : s.td), textAlign: 'center', fontWeight: 700 }}>{c.total_acoes}</td>
                        <td style={{ ...(i % 2 ? s.tdAlt : s.td), textAlign: 'center' }}>{c.itens_movimentados}</td>
                        <td style={{ ...(i % 2 ? s.tdAlt : s.td), textAlign: 'center' }}>{c.setores_atendidos}</td>
                        <td style={{ ...(i % 2 ? s.tdAlt : s.td), textAlign: 'center' }}>
                          {c.ultima_acao ? new Date(c.ultima_acao).toLocaleDateString('pt-BR') : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </>
            )}

            {/* Divergências */}
            {dados.divergencias.length > 0 && (
              <>
                <h2 style={s.h2}>⚠️ Divergências por Tipo/Status</h2>
                <table style={s.table}>
                  <thead>
                    <tr>
                      <th style={s.th}>Tipo</th>
                      <th style={s.th}>Status</th>
                      <th style={{ ...s.th, textAlign: 'center' }}>Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dados.divergencias.map((d, i) => (
                      <tr key={`${d.tipo}-${d.status}`}>
                        <td style={i % 2 ? s.tdAlt : s.td}>{d.tipo}</td>
                        <td style={i % 2 ? s.tdAlt : s.td}>{d.status}</td>
                        <td style={{ ...(i % 2 ? s.tdAlt : s.td), textAlign: 'center', fontWeight: 700 }}>{d.total}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </>
            )}

            {/* Lista de Pedidos */}
            <h2 style={s.h2}>📋 Pedidos no Período</h2>
            <table style={s.table}>
              <thead>
                <tr>
                  <th style={s.th}>Pedido</th>
                  <th style={s.th}>Cliente</th>
                  <th style={{ ...s.th, textAlign: 'center' }}>Itens</th>
                  <th style={{ ...s.th, textAlign: 'center' }}>Entregue</th>
                  <th style={{ ...s.th, textAlign: 'center' }}>Prazo</th>
                  <th style={{ ...s.th, textAlign: 'right' }}>Valor</th>
                  <th style={{ ...s.th, textAlign: 'center' }}>Status</th>
                </tr>
              </thead>
              <tbody>
                {dados.pedidos.map((p, i) => (
                  <tr key={p.id}>
                    <td style={i % 2 ? s.tdAlt : s.td}><strong>{p.numero}</strong></td>
                    <td style={i % 2 ? s.tdAlt : s.td}>{p.cliente}</td>
                    <td style={{ ...(i % 2 ? s.tdAlt : s.td), textAlign: 'center' }}>{p.qtd_itens}</td>
                    <td style={{ ...(i % 2 ? s.tdAlt : s.td), textAlign: 'center' }}>
                      {p.qtd_entregue}/{p.qtd_total}
                    </td>
                    <td style={{ ...(i % 2 ? s.tdAlt : s.td), textAlign: 'center' }}>{fmtData(p.prazo_entrega)}</td>
                    <td style={{ ...(i % 2 ? s.tdAlt : s.td), textAlign: 'right' }}>{fmtR$(p.valor_total)}</td>
                    <td style={{ ...(i % 2 ? s.tdAlt : s.td), textAlign: 'center' }}>
                      <span style={{ background: STATUS_COR[p.status] + '22', color: STATUS_COR[p.status] || '#6b7280', padding: '2px 8px', borderRadius: 12, fontSize: 11, fontWeight: 700 }}>
                        {STATUS_LABEL[p.status] || p.status}
                      </span>
                    </td>
                  </tr>
                ))}
                {dados.pedidos.length === 0 && (
                  <tr><td colSpan={7} style={{ ...s.td, textAlign: 'center', color: '#94a3b8', padding: 20 }}>Nenhum pedido no período</td></tr>
                )}
              </tbody>
            </table>

            {/* Rodapé */}
            <div style={{ marginTop: 40, paddingTop: 16, borderTop: '1px solid #e2e8f0', fontSize: 11, color: '#94a3b8', display: 'flex', justifyContent: 'space-between' }}>
              <span>AcosVital — Sistema PCP</span>
              <span>Gerado em {new Date().toLocaleString('pt-BR')}</span>
            </div>
          </>
        )}
      </div>

      <style>{`
        @media print {
          .no-print { display: none !important; }
          body { margin: 0; }
          @page { margin: 15mm; size: A4 landscape; }
        }
      `}</style>
    </div>
  );
}
