'use client';
import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import AuthGuard from '@/components/AuthGuard';
import { getParadas, criarParada, excluirParada, marcarRetornoParada } from '@/lib/api';
import { getUser, podeRegistrarParadas } from '@/lib/auth';

interface Parada {
  id: number;
  pedido: string;
  motivo: string;
  setor: string | null;
  pedido_prioritario: string | null;
  pecas_paradas: number | null;
  pecas_iniciadas: number | null;
  retornado_em: string | null;
  ocorrido_em: string;
  criado_por: string | null;
  criado_por_nome: string | null;
  criado_em: string;
}
interface ResumoLinha { periodo: string; paradas: number; pecas_paradas: number; pecas_iniciadas: number }
interface Resumo { por_dia: ResumoLinha[]; por_semana: ResumoLinha[]; por_mes: ResumoLinha[] }

// Valor inicial pro <input datetime-local> = agora, no fuso local.
function agoraLocal(): string {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
}

function fmtDataHora(s: string | null) {
  if (!s) return '';
  const d = new Date(s);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleDateString('pt-BR') + ' ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}
const nInt = (v: number | null) => (v == null ? '—' : Number(v).toLocaleString('pt-BR'));

// Rótulo do período conforme a granularidade (periodo vem como 'YYYY-MM-DD').
const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
function labelPeriodo(iso: string, tipo: 'dia' | 'semana' | 'mes'): string {
  const d = new Date(iso + 'T12:00:00');
  if (isNaN(d.getTime())) return iso;
  const dd = (x: Date) => `${String(x.getDate()).padStart(2, '0')}/${String(x.getMonth() + 1).padStart(2, '0')}`;
  if (tipo === 'dia') return `${dd(d)}/${d.getFullYear()}`;
  if (tipo === 'mes') return `${MESES[d.getMonth()]}/${d.getFullYear()}`;
  const fim = new Date(d); fim.setDate(d.getDate() + 6);
  return `${dd(d)}–${dd(fim)}`;
}

const CARD = { background: '#fff', border: '1px solid #e5e7eb', borderRadius: 10, boxShadow: '0 1px 2px rgba(0,0,0,.04)' } as const;
const LABEL = { display: 'block', fontSize: 12, fontWeight: 700, color: '#334155', marginBottom: 5 } as const;
const INPUT = { width: '100%', border: '1px solid #cbd5e1', borderRadius: 6, padding: '9px 11px', fontSize: 14, color: '#1a3a5c', background: '#fff', boxSizing: 'border-box' as const };

export default function ParadasPage() {
  const [paradas, setParadas] = useState<Parada[]>([]);
  const [resumo, setResumo] = useState<Resumo>({ por_dia: [], por_semana: [], por_mes: [] });
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [aba, setAba] = useState<'dia' | 'semana' | 'mes'>('dia');

  // Formulário
  const [pedido, setPedido] = useState('');
  const [pecasParadas, setPecasParadas] = useState('');
  const [motivo, setMotivo] = useState('');
  const [setor, setSetor] = useState('');
  const [prioritario, setPrioritario] = useState('');
  const [pecasIniciadas, setPecasIniciadas] = useState('');
  const [ocorrido, setOcorrido] = useState(agoraLocal());
  const [salvando, setSalvando] = useState(false);

  const router = useRouter();

  // Gate por login: controle privado (só guilherme.santos). Sem permissão, home.
  useEffect(() => {
    if (!podeRegistrarParadas(getUser())) router.replace('/');
  }, [router]);

  const carregar = useCallback(() => {
    getParadas()
      .then(d => {
        setParadas(d.paradas || []);
        setResumo(d.resumo || { por_dia: [], por_semana: [], por_mes: [] });
        setErro(null);
      })
      .catch(() => setErro('Não foi possível carregar as paradas registradas.'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { carregar(); }, [carregar]);

  async function registrar(e: React.FormEvent) {
    e.preventDefault();
    if (!pedido.trim() || !motivo.trim()) {
      setErro('Preencha ao menos o pedido e o motivo da parada.');
      return;
    }
    setSalvando(true);
    setErro(null);
    try {
      await criarParada({
        pedido: pedido.trim(),
        motivo: motivo.trim(),
        setor: setor.trim() || undefined,
        pedido_prioritario: prioritario.trim() || undefined,
        pecas_paradas: pecasParadas === '' ? null : Number(pecasParadas),
        pecas_iniciadas: pecasIniciadas === '' ? null : Number(pecasIniciadas),
        ocorrido_em: ocorrido || undefined,
      });
      // Limpa o formulário (mantém a data em "agora" pro próximo registro).
      setPedido(''); setMotivo(''); setSetor(''); setPrioritario('');
      setPecasParadas(''); setPecasIniciadas('');
      setOcorrido(agoraLocal());
      carregar();
    } catch {
      setErro('Erro ao registrar a parada. Tente novamente.');
    } finally {
      setSalvando(false);
    }
  }

  async function excluir(p: Parada) {
    if (!window.confirm(`Excluir a parada do pedido ${p.pedido}?`)) return;
    try {
      await excluirParada(p.id);
      carregar();
    } catch {
      setErro('Erro ao excluir. Tente novamente.');
    }
  }

  // Marca que o pedido VOLTOU a andar (ou desfaz). Não apaga a parada.
  async function alternarRetorno(p: Parada) {
    const marcar = !p.retornado_em;
    try {
      await marcarRetornoParada(p.id, marcar);
      carregar();
    } catch {
      setErro('Erro ao atualizar o retorno. Tente novamente.');
    }
  }

  const total = paradas.length;
  const aindaParadas = paradas.filter(p => !p.retornado_em).length;
  const totalPecasParadas = paradas.reduce((s, p) => s + (p.pecas_paradas || 0), 0);
  const totalPecasIniciadas = paradas.reduce((s, p) => s + (p.pecas_iniciadas || 0), 0);

  const linhasResumo = aba === 'dia' ? resumo.por_dia : aba === 'semana' ? resumo.por_semana : resumo.por_mes;

  return (
    <AuthGuard>
      {/* Estilos de impressão: esconde menu/form e imprime só a tabela (pra reunião). */}
      <style>{`
        @media print {
          #sidebar, #sidebar-overlay, .topbar, .no-print { display: none !important; }
          #conteudo, main, body { margin: 0 !important; padding: 0 !important; }
          .print-only { display: block !important; }
        }
        .print-only { display: none; }
        .abtn{border:1.5px solid #e2e8f0;background:#fff;border-radius:8px;padding:6px 14px;font-size:12.5px;font-weight:700;color:#475569;cursor:pointer}
        .abtn.on{background:#dc2626;color:#fff;border-color:#dc2626}
      `}</style>

      {erro && (
        <div className="no-print" style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#dc2626', borderRadius: 8, padding: '12px 16px', fontSize: 13, marginBottom: 16 }}>
          <i className="bi bi-exclamation-triangle" style={{ marginRight: 6 }} />
          {erro}
          <button onClick={() => setErro(null)} style={{ float: 'right', background: 'none', border: 'none', cursor: 'pointer', color: '#dc2626', fontWeight: 700 }}>×</button>
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8, flexWrap: 'wrap', gap: 10 }}>
        <div>
          <h4 style={{ margin: 0, fontWeight: 700, color: '#1a3a5c', fontSize: 20 }}>
            <i className="bi bi-pause-circle-fill" style={{ marginRight: 8, color: '#dc2626' }} />
            Registro de Paradas de Pedidos
          </h4>
          <small style={{ color: '#888' }}>
            Anote aqui os pedidos que foram parados pra atender outro — controle privado do seu acesso, pra levar pra reunião.
          </small>
        </div>
        <button onClick={() => window.print()} className="no-print"
          style={{ background: '#1a3a5c', color: '#fff', border: 'none', borderRadius: 6, padding: '9px 16px', fontSize: 13, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }}>
          <i className="bi bi-printer" style={{ marginRight: 6 }} />Imprimir / Relatório
        </button>
      </div>

      {/* Contadores */}
      <div style={{ display: 'flex', gap: 12, margin: '14px 0 18px', flexWrap: 'wrap' }}>
        <div style={{ ...CARD, borderLeft: '4px solid #dc2626', padding: '14px 22px', minWidth: 180 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: .4 }}>Total de paradas</div>
          <div style={{ fontSize: 34, fontWeight: 800, color: '#dc2626', lineHeight: 1.1, marginTop: 2 }}>{loading ? '—' : total}</div>
        </div>
        <div style={{ ...CARD, borderLeft: '4px solid #ea580c', padding: '14px 22px', minWidth: 180 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: .4 }}>Ainda paradas</div>
          <div style={{ fontSize: 34, fontWeight: 800, color: aindaParadas > 0 ? '#ea580c' : '#16a34a', lineHeight: 1.1, marginTop: 2 }}>{loading ? '—' : aindaParadas}</div>
        </div>
        <div style={{ ...CARD, borderLeft: '4px solid #b45309', padding: '14px 22px', minWidth: 180 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: .4 }}>Peças que pararam</div>
          <div style={{ fontSize: 34, fontWeight: 800, color: '#b45309', lineHeight: 1.1, marginTop: 2 }}>{loading ? '—' : nInt(totalPecasParadas)}</div>
        </div>
        <div style={{ ...CARD, borderLeft: '4px solid #1d4ed8', padding: '14px 22px', minWidth: 180 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: .4 }}>Peças iniciadas na frente</div>
          <div style={{ fontSize: 34, fontWeight: 800, color: '#1d4ed8', lineHeight: 1.1, marginTop: 2 }}>{loading ? '—' : nInt(totalPecasIniciadas)}</div>
        </div>
      </div>

      {/* Formulário de nova parada */}
      <form onSubmit={registrar} className="no-print" style={{ ...CARD, padding: 18, marginBottom: 22 }}>
        <div style={{ fontWeight: 700, color: '#1a3a5c', fontSize: 15, marginBottom: 14 }}>
          <i className="bi bi-plus-circle" style={{ marginRight: 7 }} />Registrar uma parada
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 14 }}>
          <div>
            <label style={LABEL}>Pedido que parou *</label>
            <input value={pedido} onChange={e => setPedido(e.target.value)} placeholder="Ex.: PV 12345 / OP 6789" style={INPUT} />
          </div>
          <div>
            <label style={LABEL}>Peças que pararam</label>
            <input type="number" min={0} value={pecasParadas} onChange={e => setPecasParadas(e.target.value)} placeholder="Ex.: 40" style={INPUT} />
          </div>
          <div>
            <label style={LABEL}>Pedido que entrou na frente</label>
            <input value={prioritario} onChange={e => setPrioritario(e.target.value)} placeholder="Ex.: PV 99999 (o que furou a fila)" style={INPUT} />
          </div>
          <div>
            <label style={LABEL}>Peças iniciadas no pedido novo</label>
            <input type="number" min={0} value={pecasIniciadas} onChange={e => setPecasIniciadas(e.target.value)} placeholder="Ex.: 15" style={INPUT} />
          </div>
          <div>
            <label style={LABEL}>Setor / área afetada</label>
            <input value={setor} onChange={e => setSetor(e.target.value)} placeholder="Ex.: Caldeiraria, Corte, Flange…" style={INPUT} />
          </div>
          <div>
            <label style={LABEL}>Data e hora da parada</label>
            <input type="datetime-local" value={ocorrido} onChange={e => setOcorrido(e.target.value)} style={INPUT} />
          </div>
        </div>
        <div style={{ marginTop: 14 }}>
          <label style={LABEL}>Motivo da parada *</label>
          <textarea value={motivo} onChange={e => setMotivo(e.target.value)} rows={3}
            placeholder="Descreva por que o pedido foi parado e o impacto na produção/programação."
            style={{ ...INPUT, resize: 'vertical' }} />
        </div>
        <div style={{ marginTop: 16, textAlign: 'right' }}>
          <button type="submit" disabled={salvando}
            style={{ background: salvando ? '#9ca3af' : '#dc2626', color: '#fff', border: 'none', borderRadius: 6, padding: '10px 22px', fontSize: 14, fontWeight: 700, cursor: salvando ? 'not-allowed' : 'pointer' }}>
            <i className="bi bi-save" style={{ marginRight: 7 }} />
            {salvando ? 'Salvando…' : 'Registrar parada'}
          </button>
        </div>
      </form>

      {/* ── Comparativo por dia / semana / mês ─────────────────────────────── */}
      <div style={{ ...CARD, padding: 16, marginBottom: 22 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10, marginBottom: 12 }}>
          <div style={{ fontWeight: 700, color: '#1a3a5c', fontSize: 15 }}>
            <i className="bi bi-bar-chart-line" style={{ marginRight: 7 }} />Comparativo de paradas
          </div>
          <div className="no-print" style={{ display: 'flex', gap: 8 }}>
            <button className={`abtn ${aba === 'dia' ? 'on' : ''}`} onClick={() => setAba('dia')}>Por dia</button>
            <button className={`abtn ${aba === 'semana' ? 'on' : ''}`} onClick={() => setAba('semana')}>Por semana</button>
            <button className={`abtn ${aba === 'mes' ? 'on' : ''}`} onClick={() => setAba('mes')}>Por mês</button>
          </div>
        </div>

        {linhasResumo.length === 0 ? (
          <div style={{ color: '#64748b', fontSize: 13, padding: '8px 0' }}>
            {loading ? 'Carregando…' : 'Sem dados ainda — registre paradas para ver o comparativo.'}
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13.5 }}>
              <thead>
                <tr style={{ color: '#64748b', textAlign: 'left', fontSize: 11.5, textTransform: 'uppercase', letterSpacing: .3, background: '#f8fafc' }}>
                  <th style={{ padding: '9px 12px' }}>{aba === 'dia' ? 'Dia' : aba === 'semana' ? 'Semana' : 'Mês'}</th>
                  <th style={{ padding: '9px 12px', textAlign: 'right' }}>Paradas</th>
                  <th style={{ padding: '9px 12px', textAlign: 'right' }}>Peças paradas</th>
                  <th style={{ padding: '9px 12px', textAlign: 'right' }}>Peças na frente</th>
                </tr>
              </thead>
              <tbody>
                {linhasResumo.map(r => (
                  <tr key={r.periodo} style={{ borderTop: '1px solid #eef2f7' }}>
                    <td style={{ padding: '9px 12px', fontWeight: 700, color: '#1a3a5c', whiteSpace: 'nowrap' }}>{labelPeriodo(r.periodo, aba)}</td>
                    <td style={{ padding: '9px 12px', textAlign: 'right', fontWeight: 800, color: '#dc2626' }}>{r.paradas}</td>
                    <td style={{ padding: '9px 12px', textAlign: 'right', color: '#b45309' }}>{nInt(r.pecas_paradas)}</td>
                    <td style={{ padding: '9px 12px', textAlign: 'right', color: '#1d4ed8' }}>{nInt(r.pecas_iniciadas)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Cabeçalho só na impressão */}
      <div className="print-only" style={{ marginBottom: 12 }}>
        <h3 style={{ margin: 0, color: '#1a3a5c' }}>Relatório de Paradas de Pedidos</h3>
        <div style={{ fontSize: 12, color: '#555' }}>
          Total: {total} parada(s) · {nInt(totalPecasParadas)} peça(s) parada(s) · Gerado em {fmtDataHora(new Date().toISOString())}
        </div>
      </div>

      {/* Lista detalhada */}
      <div style={{ fontWeight: 700, color: '#1a3a5c', fontSize: 15, margin: '4px 0 10px' }}>
        <i className="bi bi-list-ul" style={{ marginRight: 7 }} />Paradas registradas
      </div>
      {loading ? (
        <div style={{ color: '#64748b', fontSize: 13 }}>Carregando…</div>
      ) : paradas.length === 0 ? (
        <div style={{ ...CARD, padding: '22px 20px', textAlign: 'center', fontSize: 14, color: '#64748b' }}>
          Nenhuma parada registrada ainda. Use o formulário acima para começar.
        </div>
      ) : (
        <div style={{ ...CARD, overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13.5 }}>
            <thead>
              <tr style={{ color: '#64748b', textAlign: 'left', fontSize: 11.5, textTransform: 'uppercase', letterSpacing: .3, background: '#f8fafc' }}>
                <th style={{ padding: '10px 12px' }}>#</th>
                <th style={{ padding: '10px 12px' }}>Data/hora</th>
                <th style={{ padding: '10px 12px' }}>Pedido parado</th>
                <th style={{ padding: '10px 12px', textAlign: 'right' }}>Pç. paradas</th>
                <th style={{ padding: '10px 12px' }}>Entrou na frente</th>
                <th style={{ padding: '10px 12px', textAlign: 'right' }}>Pç. iniciadas</th>
                <th style={{ padding: '10px 12px' }}>Setor / área</th>
                <th style={{ padding: '10px 12px' }}>Motivo</th>
                <th style={{ padding: '10px 12px' }}>Situação</th>
                <th style={{ padding: '10px 12px' }} className="no-print"></th>
              </tr>
            </thead>
            <tbody>
              {paradas.map((p, i) => (
                <tr key={p.id} style={{ borderTop: '1px solid #eef2f7' }}>
                  <td style={{ padding: '10px 12px', color: '#94a3b8', fontWeight: 700 }}>{paradas.length - i}</td>
                  <td style={{ padding: '10px 12px', whiteSpace: 'nowrap', color: '#475569' }}>{fmtDataHora(p.ocorrido_em)}</td>
                  <td style={{ padding: '10px 12px', fontWeight: 700, color: '#1a3a5c', whiteSpace: 'nowrap' }}>{p.pedido}</td>
                  <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 700, color: '#b45309' }}>{nInt(p.pecas_paradas)}</td>
                  <td style={{ padding: '10px 12px', color: '#b45309', whiteSpace: 'nowrap' }}>{p.pedido_prioritario || '—'}</td>
                  <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 700, color: '#1d4ed8' }}>{nInt(p.pecas_iniciadas)}</td>
                  <td style={{ padding: '10px 12px', color: '#334155', whiteSpace: 'nowrap' }}>{p.setor || '—'}</td>
                  <td style={{ padding: '10px 12px', color: '#334155', minWidth: 220 }}>{p.motivo}</td>
                  <td style={{ padding: '10px 12px', whiteSpace: 'nowrap' }}>
                    {p.retornado_em ? (
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 700, color: '#16a34a', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 999, padding: '3px 10px' }}>
                        <i className="bi bi-check-circle-fill" /> Retornou {fmtDataHora(p.retornado_em)}
                      </span>
                    ) : (
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 700, color: '#ea580c', background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: 999, padding: '3px 10px' }}>
                        <i className="bi bi-pause-circle-fill" /> Parado
                      </span>
                    )}
                  </td>
                  <td style={{ padding: '10px 12px', textAlign: 'right', whiteSpace: 'nowrap' }} className="no-print">
                    {p.retornado_em ? (
                      <button onClick={() => alternarRetorno(p)} title="Desfazer o retorno (voltar a marcar como parado)"
                        style={{ background: '#fff', color: '#64748b', border: '1px solid #cbd5e1', borderRadius: 6, padding: '5px 10px', fontSize: 12, fontWeight: 600, cursor: 'pointer', marginRight: 6 }}>
                        <i className="bi bi-arrow-counterclockwise" style={{ marginRight: 4 }} />Desfazer
                      </button>
                    ) : (
                      <button onClick={() => alternarRetorno(p)} title="Marcar que o pedido voltou a andar"
                        style={{ background: '#16a34a', color: '#fff', border: 'none', borderRadius: 6, padding: '5px 12px', fontSize: 12.5, fontWeight: 700, cursor: 'pointer', marginRight: 6 }}>
                        <i className="bi bi-arrow-return-left" style={{ marginRight: 5 }} />Retornou
                      </button>
                    )}
                    <button onClick={() => excluir(p)} title="Excluir esta parada"
                      style={{ background: 'none', border: 'none', color: '#dc2626', cursor: 'pointer', fontSize: 15 }}>
                      <i className="bi bi-trash3" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </AuthGuard>
  );
}
