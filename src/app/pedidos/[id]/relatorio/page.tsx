'use client';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { getToken } from '@/lib/auth';

const NOMES: Record<string, string> = {
  emissao: 'Emissão de Ordens', usinagem: 'Usinagem', 'maçarico': 'Maçarico',
  plasma: 'Plasma', laser: 'Laser', estoque: 'Estoque', furacao: 'Furação',
  qualidade: 'Inspeção de Qualidade', acabamento: 'Acabamento',
  logistica: 'Logística', recebimento: 'Recebimento', compras: 'Compras',
  beneficiadores: 'Beneficiadores', embalagem: 'Embalagem',
};
const STATUS_LABEL: Record<string, string> = {
  emitido: 'Emitido', aguardando: 'Aguardando', recebido: 'Recebido',
  em_andamento: 'Em Andamento', pausado: 'Pausado',
  finalizado_setor: 'Finalizado no Setor', em_transito: 'Em Trânsito',
  entregue: 'Entregue', bloqueado: 'Bloqueado', reprovado: 'Reprovado',
};
const PRIO_COLOR: Record<string, string> = {
  baixa: '#6b7280', normal: '#2563eb', alta: '#d97706', urgente: '#dc2626',
};

function fmt(s: string | null) {
  if (!s) return '—';
  const d = new Date(s);
  if (isNaN(d.getTime())) return s;
  return d.toLocaleDateString('pt-BR') + ' ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}
function fmtHora(s: string | null) {
  if (!s) return '—';
  const d = new Date(s);
  if (isNaN(d.getTime())) return s;
  return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}
function fmtData(s: string | null) {
  if (!s) return '—';
  const d = new Date(s + 'T12:00:00');
  return d.toLocaleDateString('pt-BR');
}
function fmtMin(min: number) {
  if (min < 60) return `${min}min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m > 0 ? `${h}h ${m}min` : `${h}h`;
}
function fmtR$(v: string | null) {
  if (!v) return '—';
  const n = Number(v);
  if (isNaN(n)) return v;
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

interface Relatorio {
  pedido: Record<string, string>;
  itens: Record<string, string>[];
  movimentacoes: Record<string, string>[];
  tempos_por_setor: Record<string, Record<string, number>>;
  entregas: Record<string, string>[];
  lotes: Record<string, string>[];
  divergencias: Record<string, string>[];
  gerado_em: string;
  gerado_por: string;
}

export default function RelatorioPage() {
  const { id } = useParams<{ id: string }>();
  const [rel, setRel] = useState<Relatorio | null>(null);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState('');

  useEffect(() => {
    fetch(`/api/pedidos/${id}/relatorio`, { headers: { Authorization: `Bearer ${getToken() || ''}` } })
      .then(r => r.json())
      .then(d => {
        if (d.erro) setErro(d.erro);
        else {
          setRel(d);
          // Define o título da página (nome do PDF ao salvar)
          document.title = `Relatorio_${d.pedido?.numero_pedido_venda || id}`;
        }
      })
      .catch(e => setErro(String(e)))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) return <div style={{ padding: 60, textAlign: 'center', color: '#aaa', fontFamily: 'Arial' }}>Carregando relatório...</div>;
  if (erro) return <div style={{ padding: 40, color: '#dc2626', fontFamily: 'Arial' }}>{erro}</div>;
  if (!rel) return null;

  const { pedido, itens, movimentacoes, tempos_por_setor, entregas, lotes, divergencias } = rel;

  // Todos os setores que aparecem nos tempos
  const todosSetores = new Set<string>();
  Object.values(tempos_por_setor).forEach(st => Object.keys(st).forEach(s => todosSetores.add(s)));

  const valorTotal = Number(pedido.valor_calculado || pedido.valor_total || 0);
  // Só admin/PCP recebem valores da API; para os demais os campos vêm nulos.
  const temFinanceiro = pedido.valor_calculado != null || pedido.valor_total != null;

  const s: Record<string, React.CSSProperties> = {
    page:    { fontFamily: 'Arial, sans-serif', fontSize: 13, color: '#1a1a1a', maxWidth: 900, margin: '0 auto', padding: '24px 32px' },
    h1:      { fontSize: 22, fontWeight: 800, color: '#1a3a5c', margin: 0 },
    h2:      { fontSize: 14, fontWeight: 700, color: '#1a3a5c', borderBottom: '2px solid #1a3a5c', paddingBottom: 4, marginTop: 28, marginBottom: 12 },
    table:   { width: '100%', borderCollapse: 'collapse', fontSize: 12 },
    th:      { background: '#1a3a5c', color: '#fff', padding: '7px 10px', textAlign: 'left', fontWeight: 700 },
    td:      { padding: '6px 10px', borderBottom: '1px solid #f0f0f0' },
    tdAlt:   { padding: '6px 10px', borderBottom: '1px solid #f0f0f0', background: '#f8fafc' },
    label:   { color: '#64748b', fontSize: 11, display: 'block', marginBottom: 2 },
    value:   { fontWeight: 700, fontSize: 13 },
    badge:   { display: 'inline-block', padding: '2px 8px', borderRadius: 20, fontSize: 11, fontWeight: 700 },
    noprint: { display: 'flex', gap: 10, marginBottom: 24, justifyContent: 'flex-end' },
  };

  return (
    <div style={s.page} className="relatorio-root">
      {/* Botões — não imprimem */}
      <div style={s.noprint} className="no-print">
        <button onClick={() => window.print()}
          style={{ background: '#1a3a5c', color: '#fff', border: 'none', borderRadius: 8, padding: '9px 20px', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
          <i className="bi bi-printer-fill" style={{ marginRight: 8 }} />Imprimir / Salvar PDF
        </button>
        <button onClick={() => window.close()}
          style={{ background: '#f3f4f6', color: '#555', border: 'none', borderRadius: 8, padding: '9px 16px', fontSize: 13, cursor: 'pointer' }}>
          Fechar
        </button>
      </div>

      {/* Resumo Executivo */}
      {(() => {
        const entregues = itens.filter(i => i.status === 'entregue');
        const pendentes = itens.filter(i => i.status !== 'entregue' && i.status !== 'bloqueado' && i.status !== 'cancelado');
        const bloqueados = itens.filter(i => i.status === 'bloqueado');
        const PRIO_LABEL: Record<string, string> = { baixa: 'Baixa', normal: 'Normal', alta: 'Alta', urgente: 'Urgente' };
        const PRIO_BG: Record<string, string> = { baixa: '#f1f5f9', normal: '#dbeafe', alta: '#fef3c7', urgente: '#fee2e2' };
        const PRIO_COR: Record<string, string> = { baixa: '#64748b', normal: '#1d4ed8', alta: '#92400e', urgente: '#991b1b' };
        const STATUS_PT: Record<string, string> = {
          aguardando: 'Aguardando', recebido: 'Recebido', em_andamento: 'Em Andamento',
          finalizado_setor: 'Finalizado no Setor', em_transito: 'Em Trânsito',
          reprovado: 'Reprovado', bloqueado: 'Bloqueado', emitido: 'Emitido',
        };
        return (
          <div className="resumo-exec" style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 10, padding: '16px 20px', marginBottom: 20 }}>
            {/* Linha de prioridade */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14, paddingBottom: 12, borderBottom: '1px solid #e2e8f0' }}>
              <span style={{ fontSize: 11, color: '#64748b', fontWeight: 600 }}>PRIORIDADE:</span>
              <span style={{
                background: PRIO_BG[pedido.prioridade] || '#f1f5f9',
                color: PRIO_COR[pedido.prioridade] || '#64748b',
                fontWeight: 800, fontSize: 13, padding: '3px 12px', borderRadius: 20,
              }}>
                {PRIO_LABEL[pedido.prioridade] || pedido.prioridade}
              </span>
              <span style={{ marginLeft: 'auto', fontSize: 11, color: '#64748b' }}>
                Prazo: <strong style={{ color: pedido.atrasado ? '#dc2626' : '#1a3a5c' }}>{fmtData(pedido.prazo_entrega)}</strong>
                {pedido.atrasado && <span style={{ color: '#dc2626', marginLeft: 6, fontWeight: 700 }}>⚠ ATRASADO</span>}
              </span>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16 }}>

              {/* Entregue */}
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#16a34a', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span>✅ Entregue</span>
                  <span style={{ background: '#dcfce7', color: '#16a34a', borderRadius: 10, padding: '1px 7px', fontSize: 11 }}>{entregues.length}</span>
                </div>
                {entregues.length === 0
                  ? <div style={{ fontSize: 12, color: '#94a3b8', fontStyle: 'italic' }}>Nenhum item entregue</div>
                  : entregues.map(i => (
                    <div key={i.id} style={{ fontSize: 12, marginBottom: 4, display: 'flex', justifyContent: 'space-between' }}>
                      <span><strong>{i.codigo}</strong> <span style={{ color: '#64748b' }}>{i.descricao}</span></span>
                      <span style={{ color: '#16a34a', fontWeight: 700, whiteSpace: 'nowrap', marginLeft: 8 }}>
                        {Number(i.quantidade_entregue).toFixed(0)}/{Number(i.quantidade).toFixed(0)} {i.unidade}
                      </span>
                    </div>
                  ))
                }
              </div>

              {/* Pendente */}
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#d97706', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span>⏳ Em Produção</span>
                  <span style={{ background: '#fef3c7', color: '#92400e', borderRadius: 10, padding: '1px 7px', fontSize: 11 }}>{pendentes.length}</span>
                </div>
                {pendentes.length === 0
                  ? <div style={{ fontSize: 12, color: '#94a3b8', fontStyle: 'italic' }}>Nenhum em andamento</div>
                  : pendentes.map(i => (
                    <div key={i.id} style={{ fontSize: 12, marginBottom: 4 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span><strong>{i.codigo}</strong> <span style={{ color: '#64748b' }}>{i.descricao}</span></span>
                        <span style={{ color: '#d97706', fontWeight: 700, whiteSpace: 'nowrap', marginLeft: 8 }}>
                          {Number(i.quantidade_pendente || i.quantidade).toFixed(0)} {i.unidade}
                        </span>
                      </div>
                      <div style={{ fontSize: 10, color: '#94a3b8' }}>
                        {NOMES[i.setor_atual] || i.setor_atual} · {STATUS_PT[i.status] || i.status}
                      </div>
                    </div>
                  ))
                }
              </div>

              {/* Bloqueados / divergências */}
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#dc2626', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span>🚫 Bloqueado / Problema</span>
                  <span style={{ background: '#fee2e2', color: '#991b1b', borderRadius: 10, padding: '1px 7px', fontSize: 11 }}>{bloqueados.length}</span>
                </div>
                {bloqueados.length === 0
                  ? <div style={{ fontSize: 12, color: '#94a3b8', fontStyle: 'italic' }}>Nenhum item bloqueado</div>
                  : bloqueados.map(i => (
                    <div key={i.id} style={{ fontSize: 12, marginBottom: 4 }}>
                      <strong>{i.codigo}</strong> <span style={{ color: '#64748b' }}>{i.descricao}</span>
                      <div style={{ fontSize: 10, color: '#dc2626' }}>{NOMES[i.setor_atual] || i.setor_atual}</div>
                    </div>
                  ))
                }
              </div>

            </div>
          </div>
        );
      })()}

      {/* Cabeçalho */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20, borderBottom: '3px solid #1a3a5c', paddingBottom: 16 }}>
        <div>
          <div style={{ fontSize: 11, color: '#64748b', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 }}>
            Relatório de Ordem de Produção
          </div>
          <h1 style={s.h1}>{pedido.numero_pedido_venda}</h1>
          {pedido.numero_op && <div style={{ fontSize: 14, color: '#64748b', marginTop: 2 }}>OP: <strong>{pedido.numero_op}</strong></div>}
          <div style={{ marginTop: 8, display: 'flex', gap: 8 }}>
            <span style={{ ...s.badge, background: PRIO_COLOR[pedido.prioridade] + '20', color: PRIO_COLOR[pedido.prioridade] }}>
              {pedido.prioridade?.charAt(0).toUpperCase() + pedido.prioridade?.slice(1)}
            </span>
            {(() => {
              const algumEntregue = itens.some(i => i.status === 'entregue');
              const todosEntregues = pedido.status === 'entregue';
              const label = todosEntregues ? 'Entregue' : algumEntregue ? 'Entrega Parcial' : (STATUS_LABEL[pedido.status] || pedido.status);
              const cor = todosEntregues || algumEntregue ? '#16a34a' : '#0369a1';
              const bg = todosEntregues || algumEntregue ? '#dcfce7' : '#e0f2fe';
              return <span style={{ ...s.badge, background: bg, color: cor }}>{label}</span>;
            })()}
          </div>
        </div>
        <div style={{ textAlign: 'right', fontSize: 12, color: '#64748b' }}>
          <div>Gerado em: <strong>{fmt(rel.gerado_em)}</strong></div>
          <div>Por: <strong>{rel.gerado_por}</strong></div>
          {temFinanceiro && (
            <>
              <div style={{ marginTop: 8, fontSize: 20, fontWeight: 800, color: '#1a3a5c' }}>{fmtR$(pedido.valor_calculado || pedido.valor_total)}</div>
              <div style={{ fontSize: 10 }}>Valor Total</div>
            </>
          )}
        </div>
      </div>

      {/* Dados do Pedido */}
      <h2 style={s.h2}>📋 Dados do Pedido</h2>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 8 }}>
        {[
          { label: 'Cliente',       value: pedido.cliente },
          { label: 'Vendedor',      value: pedido.vendedor || '—' },
          { label: 'Aberto por',    value: pedido.criado_por_nome || '—' },
          { label: 'Data Emissão',  value: fmtData(pedido.data_emissao) },
          { label: 'Prazo Entrega', value: fmtData(pedido.prazo_entrega) },
          { label: 'Setor Atual',   value: NOMES[pedido.setor_atual] || pedido.setor_atual },
          { label: 'Roteiro Base',  value: (pedido.roteiro_base as unknown as string[] || []).map((s: string) => NOMES[s] || s).join(' → ') },
          { label: 'Observações',   value: pedido.observacoes || '—' },
        ].map(f => (
          <div key={f.label} className="card-dados" style={{ background: '#f8fafc', borderRadius: 8, padding: '10px 12px' }}>
            <span style={s.label}>{f.label}</span>
            <span style={s.value}>{f.value}</span>
          </div>
        ))}
      </div>

      {/* Produtos / Itens */}
      <h2 style={s.h2}>🔩 Produtos / Itens</h2>
      <table style={s.table}>
        <thead>
          <tr>
            {['Código', 'Descrição', 'Qtd', 'Un', ...(temFinanceiro ? ['Vlr Unit.', 'Vlr Total'] : []), 'Pendente', 'Entregue', 'Status'].map(h => (
              <th key={h} style={s.th}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {itens.map((item, i) => (
            <tr key={item.id}>
              <td style={i % 2 ? s.tdAlt : s.td}><strong>{item.codigo}</strong></td>
              <td style={i % 2 ? s.tdAlt : s.td}>{item.descricao}</td>
              <td style={i % 2 ? s.tdAlt : s.td}>{item.quantidade}</td>
              <td style={i % 2 ? s.tdAlt : s.td}>{item.unidade}</td>
              {temFinanceiro && (
                <>
                  <td style={i % 2 ? s.tdAlt : s.td}>{fmtR$(item.valor_unitario)}</td>
                  <td style={{ ...(i % 2 ? s.tdAlt : s.td), fontWeight: 700 }}>{fmtR$(item.valor_total_item)}</td>
                </>
              )}
              <td style={i % 2 ? s.tdAlt : s.td}>{item.quantidade_pendente}</td>
              <td style={i % 2 ? s.tdAlt : s.td}>{item.quantidade_entregue}</td>
              <td style={i % 2 ? s.tdAlt : s.td}>
                <span style={{ ...s.badge, background: item.status === 'entregue' ? '#dcfce7' : '#fef9c3', color: item.status === 'entregue' ? '#16a34a' : '#854d0e' }}>
                  {STATUS_LABEL[item.status] || item.status}
                </span>
              </td>
            </tr>
          ))}
          {temFinanceiro && (
            <tr style={{ background: '#1a3a5c', color: '#fff' }}>
              <td colSpan={5} style={{ padding: '8px 10px', fontWeight: 700 }}>TOTAL</td>
              <td style={{ padding: '8px 10px', fontWeight: 800, fontSize: 14 }}>{fmtR$(String(valorTotal))}</td>
              <td colSpan={3} style={{ padding: '8px 10px' }}></td>
            </tr>
          )}
        </tbody>
      </table>

      {/* Tempos por Setor */}
      {todosSetores.size > 0 && (() => {
        const setoresList = Array.from(todosSetores);
        // Total por setor (soma de todos os itens)
        const totalPorSetor: Record<string, number> = {};
        setoresList.forEach(s => { totalPorSetor[s] = 0; });
        let totalGeralMin = 0;

        const linhas = itens.map(item => {
          const tempos = tempos_por_setor[item.id] || {};
          const totalMin = Object.values(tempos).reduce((a, b) => a + b, 0);
          setoresList.forEach(s => { totalPorSetor[s] = (totalPorSetor[s] || 0) + (tempos[s] || 0); });
          totalGeralMin += totalMin;
          return { item, tempos, totalMin };
        });

        return (
          <>
            <h2 style={s.h2}>⏱ Tempo em Cada Área</h2>

            {/* Resumo do tempo total */}
            <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
              {setoresList.map(setor => (
                <div key={setor} className="card-tempo" style={{ background: '#f0f4ff', border: '1px solid #c7d2fe', borderRadius: 8, padding: '10px 14px', minWidth: 120, textAlign: 'center' }}>
                  <div style={{ fontSize: 10, color: '#6366f1', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>
                    {NOMES[setor] || setor}
                  </div>
                  <div style={{ fontSize: 18, fontWeight: 800, color: '#1a3a5c' }}>
                    {totalPorSetor[setor] > 0 ? fmtMin(totalPorSetor[setor]) : '—'}
                  </div>
                  {totalPorSetor[setor] >= 60 && (
                    <div style={{ fontSize: 10, color: '#64748b' }}>
                      {totalPorSetor[setor]} min
                    </div>
                  )}
                </div>
              ))}
              {/* Total geral */}
              <div style={{ background: '#1a3a5c', border: '1px solid #1a3a5c', borderRadius: 8, padding: '10px 14px', minWidth: 120, textAlign: 'center' }}>
                <div style={{ fontSize: 10, color: '#93c5fd', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>
                  TOTAL GERAL
                </div>
                <div style={{ fontSize: 18, fontWeight: 800, color: '#fff' }}>
                  {totalGeralMin > 0 ? fmtMin(totalGeralMin) : '—'}
                </div>
                {totalGeralMin >= 60 && (
                  <div style={{ fontSize: 10, color: '#93c5fd' }}>
                    {totalGeralMin} min
                  </div>
                )}
              </div>
            </div>

            {/* Tabela detalhada por item */}
            <table style={s.table}>
              <thead>
                <tr>
                  <th style={s.th}>Item</th>
                  {setoresList.map(setor => (
                    <th key={setor} style={{ ...s.th, textAlign: 'center' }}>{NOMES[setor] || setor}</th>
                  ))}
                  <th style={{ ...s.th, textAlign: 'center' }}>Total Item</th>
                </tr>
              </thead>
              <tbody>
                {linhas.map(({ item, tempos, totalMin }, i) => (
                  <tr key={item.id}>
                    <td style={i % 2 ? s.tdAlt : s.td}><strong>{item.codigo}</strong> <span style={{ color: '#94a3b8', fontSize: 11 }}>{item.descricao}</span></td>
                    {setoresList.map(setor => (
                      <td key={setor} style={{ ...(i % 2 ? s.tdAlt : s.td), textAlign: 'center' }}>
                        {tempos[setor] ? (
                          <span>
                            <strong>{fmtMin(tempos[setor])}</strong>
                            {tempos[setor] >= 60 && <span style={{ color: '#94a3b8', fontSize: 10, display: 'block' }}>{tempos[setor]} min</span>}
                          </span>
                        ) : <span style={{ color: '#cbd5e1', fontSize: 10, fontStyle: 'italic' }}>Não passou</span>}
                      </td>
                    ))}
                    <td style={{ ...(i % 2 ? s.tdAlt : s.td), textAlign: 'center', fontWeight: 700, color: '#1a3a5c' }}>
                      {totalMin > 0 ? (
                        <span>
                          {fmtMin(totalMin)}
                          {totalMin >= 60 && <span style={{ color: '#94a3b8', fontSize: 10, display: 'block', fontWeight: 400 }}>{totalMin} min</span>}
                        </span>
                      ) : '—'}
                    </td>
                  </tr>
                ))}
                {/* Linha de totais */}
                <tr style={{ background: '#1a3a5c', color: '#fff' }}>
                  <td style={{ padding: '8px 10px', fontWeight: 700 }}>TOTAL POR SETOR</td>
                  {setoresList.map(setor => (
                    <td key={setor} style={{ padding: '8px 10px', textAlign: 'center', fontWeight: 700 }}>
                      {totalPorSetor[setor] > 0 ? fmtMin(totalPorSetor[setor]) : '—'}
                    </td>
                  ))}
                  <td style={{ padding: '8px 10px', textAlign: 'center', fontWeight: 800, fontSize: 14 }}>
                    {totalGeralMin > 0 ? fmtMin(totalGeralMin) : '—'}
                  </td>
                </tr>
              </tbody>
            </table>
          </>
        );
      })()}

      {/* Entregas */}
      {entregas.length > 0 && (
        <>
          <h2 style={s.h2}>✅ Entregas ao Cliente</h2>
          <table style={s.table}>
            <thead>
              <tr>
                {['Item', 'Nota Fiscal', 'Observação', 'Entregue por', 'Data/Hora'].map(h => (
                  <th key={h} style={s.th}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {entregas.map((e, i) => (
                <tr key={e.id}>
                  <td style={i % 2 ? s.tdAlt : s.td}>{e.item_codigo}</td>
                  <td style={{ ...(i % 2 ? s.tdAlt : s.td), fontWeight: 700 }}>NF {e.numero_nf}</td>
                  <td style={i % 2 ? s.tdAlt : s.td}>{e.observacao || '—'}</td>
                  <td style={i % 2 ? s.tdAlt : s.td}>{e.usuario_nome || '—'}</td>
                  <td style={i % 2 ? s.tdAlt : s.td}>{fmt(e.criado_em)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      {/* Lotes / Envios parciais */}
      {lotes.length > 0 && (
        <>
          <h2 style={s.h2}>📦 Envios Entre Setores</h2>
          <table style={s.table}>
            <thead>
              <tr>
                {['Item', 'De', 'Para', 'Qtd', 'Enviado por', 'Enviado em', 'Recebido por', 'Recebido em'].map(h => (
                  <th key={h} style={s.th}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {lotes.map((l, i) => (
                <tr key={l.id}>
                  <td style={i % 2 ? s.tdAlt : s.td}>{l.item_codigo}</td>
                  <td style={i % 2 ? s.tdAlt : s.td}>{NOMES[l.setor_origem] || l.setor_origem}</td>
                  <td style={i % 2 ? s.tdAlt : s.td}>{NOMES[l.setor_destino] || l.setor_destino}</td>
                  <td style={i % 2 ? s.tdAlt : s.td}><strong>{l.quantidade}</strong></td>
                  <td style={i % 2 ? s.tdAlt : s.td}>{l.criado_por_nome || '—'}</td>
                  <td style={i % 2 ? s.tdAlt : s.td}>{fmt(l.criado_em)}</td>
                  <td style={i % 2 ? s.tdAlt : s.td}>{l.recebido_por_nome || '—'}</td>
                  <td style={i % 2 ? s.tdAlt : s.td}>{l.recebido_em ? fmt(l.recebido_em) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      {/* Divergências */}
      {divergencias.length > 0 && (
        <>
          <h2 style={s.h2}>⚠️ Divergências</h2>
          <table style={s.table}>
            <thead>
              <tr>
                {['Tipo', 'Prioridade', 'Status', 'Descrição', 'Reportado por', 'Data'].map(h => (
                  <th key={h} style={s.th}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {divergencias.map((d, i) => (
                <tr key={d.id}>
                  <td style={i % 2 ? s.tdAlt : s.td}>{d.tipo}</td>
                  <td style={{ ...(i % 2 ? s.tdAlt : s.td), color: PRIO_COLOR[d.prioridade], fontWeight: 700 }}>{d.prioridade}</td>
                  <td style={i % 2 ? s.tdAlt : s.td}>{d.status}</td>
                  <td style={i % 2 ? s.tdAlt : s.td}>{d.descricao}</td>
                  <td style={i % 2 ? s.tdAlt : s.td}>{d.usuario_nome || '—'}</td>
                  <td style={i % 2 ? s.tdAlt : s.td}>{fmt(d.criado_em)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      {/* Resumo de Áreas e Colaboradores — começa na pág 2 */}
      {movimentacoes.length > 0 && (() => {
        // Conta ações por setor (em ordem de aparição)
        const porSetor: Record<string, number> = {};
        // Colaboradores em ordem de primeira aparição
        const primeiraAcao: Record<string, number> = {}; // índice da primeira movimentação
        const porUsuario: Record<string, number> = {};
        movimentacoes.forEach((m, idx) => {
          const setor = m.setor_destino || m.setor_origem || '';
          if (setor) porSetor[setor] = (porSetor[setor] || 0) + 1;
          if (m.usuario_nome) {
            if (primeiraAcao[m.usuario_nome] === undefined) primeiraAcao[m.usuario_nome] = idx;
            porUsuario[m.usuario_nome] = (porUsuario[m.usuario_nome] || 0) + 1;
          }
        });
        // Setores em ordem de aparição (mantém a ordem do Map)
        const setoresOrdenados = Object.entries(porSetor);
        // Colaboradores em ordem cronológica de primeira ação
        const colaboradoresOrdenados = Object.entries(porUsuario)
          .sort((a, b) => (primeiraAcao[a[0]] ?? 999) - (primeiraAcao[b[0]] ?? 999));

        return (
          <div style={{ pageBreakBefore: 'always' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 8 }}>
              {/* Áreas envolvidas */}
              <div>
                <h2 style={s.h2}>🏭 Áreas Envolvidas</h2>
                <table style={s.table}>
                  <thead>
                    <tr>
                      <th style={s.th}>Área</th>
                      <th style={{ ...s.th, textAlign: 'center' }}>Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {setoresOrdenados.map(([setor, qtd], i) => (
                      <tr key={setor}>
                        <td style={i % 2 ? s.tdAlt : s.td}>{NOMES[setor] || setor}</td>
                        <td style={{ ...(i % 2 ? s.tdAlt : s.td), textAlign: 'center', fontWeight: 700 }}>{qtd}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {/* Colaboradores em ordem cronológica */}
              <div>
                <h2 style={s.h2}>👷 Colaboradores — por ordem de atuação</h2>
                <table style={s.table}>
                  <thead>
                    <tr>
                      <th style={s.th}>Nome</th>
                      <th style={{ ...s.th, textAlign: 'center' }}>Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {colaboradoresOrdenados.map(([nome, qtd], i) => (
                      <tr key={nome}>
                        <td style={i % 2 ? s.tdAlt : s.td}>
                          <span style={{ display: 'inline-block', width: 18, color: '#94a3b8', fontSize: 10 }}>{i + 1}.</span>
                          {nome}
                        </td>
                        <td style={{ ...(i % 2 ? s.tdAlt : s.td), textAlign: 'center', fontWeight: 700 }}>{qtd}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Linha do Tempo — agrupada por setor */}
      <div style={{ pageBreakBefore: 'always' }} />
      <h2 style={s.h2}>📅 Linha do Tempo por Área</h2>
      {(() => {
        // Agrupa movimentações por setor_destino em ordem de ocorrência
        const grupos: { setor: string; movs: typeof movimentacoes }[] = [];
        for (const m of movimentacoes) {
          const setor = m.setor_destino || m.setor_origem || '';
          const ultimo = grupos[grupos.length - 1];
          if (ultimo && ultimo.setor === setor) {
            ultimo.movs.push(m);
          } else {
            grupos.push({ setor, movs: [m] });
          }
        }

        const STATUS_COR: Record<string, string> = {
          aguardando: '#d97706', recebido: '#2563eb', em_andamento: '#7c3aed',
          finalizado_setor: '#16a34a', em_transito: '#0891b2', entregue: '#16a34a',
          reprovado: '#dc2626', bloqueado: '#9333ea', emitido: '#6b7280',
        };

        return grupos.map((g, gi) => (
          <div key={gi} style={{ marginBottom: 16, breakInside: 'avoid' as const }}>
            {/* Cabeçalho do setor */}
            <div className="timeline-bloco-header" style={{ background: '#1a3a5c', color: '#fff', borderRadius: '8px 8px 0 0', padding: '8px 14px', display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 13, fontWeight: 700 }}>{NOMES[g.setor] || g.setor || '—'}</span>
              <span style={{ fontSize: 11, color: '#93c5fd', marginLeft: 'auto' }}>
                {fmt(g.movs[0].criado_em)}
              </span>
            </div>

            {/* Eventos dentro do setor */}
            <div style={{ border: '1px solid #e2e8f0', borderTop: 'none', borderRadius: '0 0 8px 8px', overflow: 'hidden' }}>
              {g.movs.map((m, mi) => {
                const statusNovoCor = STATUS_COR[m.status_novo] || '#6b7280';
                const mesmoItem = mi > 0 && g.movs[mi - 1].item_codigo === m.item_codigo;
                const mostrarUsuario = mi === 0 || g.movs[mi - 1].usuario_nome !== m.usuario_nome;
                return (
                  <div key={m.id} className="timeline-linha" style={{
                    display: 'grid', gridTemplateColumns: '90px 80px 1fr auto',
                    padding: '7px 14px', gap: 8, alignItems: 'center',
                    background: mi % 2 ? '#f8fafc' : '#fff',
                    borderBottom: mi < g.movs.length - 1 ? '1px solid #f1f5f9' : 'none',
                    fontSize: 12,
                  }}>
                    {/* Hora */}
                    <span style={{ color: '#94a3b8', fontSize: 11 }}>
                      {fmtHora(m.criado_em)}
                    </span>

                    {/* Item — sempre visível, desbotado quando repetido em sequência */}
                    <span style={{ fontWeight: 700, color: mesmoItem ? '#cbd5e1' : '#1a3a5c', fontSize: mesmoItem ? 11 : 12 }}>
                      {m.item_codigo}
                    </span>

                    {/* Status novo + obs */}
                    <span>
                      <span style={{ background: statusNovoCor + '22', color: statusNovoCor, padding: '2px 8px', borderRadius: 10, fontWeight: 700, fontSize: 11, marginRight: 6 }}>
                        {STATUS_LABEL[m.status_novo] || m.status_novo}
                      </span>
                      {m.observacao && (
                        <span style={{ color: '#64748b', fontSize: 11 }}>{m.observacao}</span>
                      )}
                    </span>

                    {/* Usuário (só mostra quando muda) */}
                    <span style={{ color: mostrarUsuario ? '#475569' : '#cbd5e1', fontSize: 11, whiteSpace: 'nowrap', textAlign: 'right' }}>
                      {mostrarUsuario ? (m.usuario_nome || '—') : ''}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        ));
      })()}

      {/* Rodapé */}
      <div style={{ marginTop: 32, borderTop: '1px solid #e2e8f0', paddingTop: 12, fontSize: 11, color: '#94a3b8', display: 'flex', justifyContent: 'space-between' }}>
        <span>PCP AcosVital — Relatório gerado em {fmt(rel.gerado_em)} por {rel.gerado_por}</span>
        <span>{pedido.numero_pedido_venda} {pedido.numero_op ? `| OP: ${pedido.numero_op}` : ''}</span>
      </div>

      {/* CSS de impressão */}
      <style>{`
        @media print {
          .no-print { display: none !important; }
          @page { margin: 8mm 10mm; size: A4 portrait; }
          body { margin: 0 !important; }

          /* Escala o conteúdo inteiro para caber melhor */
          .relatorio-root {
            font-size: 10px !important;
            padding: 0 !important;
            max-width: 100% !important;
          }
          .relatorio-root h1 { font-size: 15px !important; }
          .relatorio-root h2 { font-size: 10px !important; margin-top: 8px !important; margin-bottom: 5px !important; padding-bottom: 3px !important; }
          .relatorio-root table { font-size: 9px !important; }
          .relatorio-root th, .relatorio-root td { padding: 3px 5px !important; }

          /* Blocos com padding grande ficam compactos */
          .resumo-exec  { padding: 8px 10px !important; margin-bottom: 8px !important; }
          .resumo-exec .resumo-prio { margin-bottom: 8px !important; padding-bottom: 8px !important; }
          .card-dados   { padding: 6px 8px !important; }
          .card-tempo   { padding: 6px 8px !important; min-width: 70px !important; }
          .timeline-bloco-header { padding: 4px 8px !important; }
          .timeline-linha        { padding: 3px 8px !important; }
        }
      `}</style>
    </div>
  );
}
