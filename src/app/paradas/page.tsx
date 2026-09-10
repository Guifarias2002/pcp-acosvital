'use client';
import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import AuthGuard from '@/components/AuthGuard';
import { getParadas, criarParada, excluirParada } from '@/lib/api';
import { getUser, podeRegistrarParadas } from '@/lib/auth';

interface Parada {
  id: number;
  pedido: string;
  motivo: string;
  setor: string | null;
  pedido_prioritario: string | null;
  ocorrido_em: string;
  criado_por: string | null;
  criado_por_nome: string | null;
  criado_em: string;
}

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

const CARD = { background: '#fff', border: '1px solid #e5e7eb', borderRadius: 10, boxShadow: '0 1px 2px rgba(0,0,0,.04)' } as const;
const LABEL = { display: 'block', fontSize: 12, fontWeight: 700, color: '#334155', marginBottom: 5 } as const;
const INPUT = { width: '100%', border: '1px solid #cbd5e1', borderRadius: 6, padding: '9px 11px', fontSize: 14, color: '#1a3a5c', background: '#fff', boxSizing: 'border-box' as const };

export default function ParadasPage() {
  const [paradas, setParadas] = useState<Parada[]>([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  // Formulário
  const [pedido, setPedido] = useState('');
  const [motivo, setMotivo] = useState('');
  const [setor, setSetor] = useState('');
  const [prioritario, setPrioritario] = useState('');
  const [ocorrido, setOcorrido] = useState(agoraLocal());
  const [salvando, setSalvando] = useState(false);

  const router = useRouter();

  // Gate por login: controle privado (só guilherme.santos). Sem permissão, home.
  useEffect(() => {
    if (!podeRegistrarParadas(getUser())) router.replace('/');
  }, [router]);

  const carregar = useCallback(() => {
    getParadas()
      .then(d => { setParadas(d.paradas || []); setErro(null); })
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
        ocorrido_em: ocorrido || undefined,
      });
      // Limpa o formulário (mantém a data em "agora" pro próximo registro).
      setPedido(''); setMotivo(''); setSetor(''); setPrioritario('');
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

  const total = paradas.length;

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

      {/* Contador */}
      <div style={{ display: 'flex', gap: 12, margin: '14px 0 18px', flexWrap: 'wrap' }}>
        <div style={{ ...CARD, borderLeft: '4px solid #dc2626', padding: '14px 22px', minWidth: 190 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: .4 }}>Total de paradas registradas</div>
          <div style={{ fontSize: 34, fontWeight: 800, color: '#dc2626', lineHeight: 1.1, marginTop: 2 }}>
            {loading ? '—' : total}
          </div>
        </div>
      </div>

      {/* Formulário de nova parada */}
      <form onSubmit={registrar} className="no-print" style={{ ...CARD, padding: 18, marginBottom: 22 }}>
        <div style={{ fontWeight: 700, color: '#1a3a5c', fontSize: 15, marginBottom: 14 }}>
          <i className="bi bi-plus-circle" style={{ marginRight: 7 }} />Registrar uma parada
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14 }}>
          <div>
            <label style={LABEL}>Pedido que parou *</label>
            <input value={pedido} onChange={e => setPedido(e.target.value)} placeholder="Ex.: PV 12345 / OP 6789" style={INPUT} />
          </div>
          <div>
            <label style={LABEL}>Pedido que entrou na frente</label>
            <input value={prioritario} onChange={e => setPrioritario(e.target.value)} placeholder="Ex.: PV 99999 (o que furou a fila)" style={INPUT} />
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

      {/* Cabeçalho só na impressão */}
      <div className="print-only" style={{ marginBottom: 12 }}>
        <h3 style={{ margin: 0, color: '#1a3a5c' }}>Relatório de Paradas de Pedidos</h3>
        <div style={{ fontSize: 12, color: '#555' }}>
          Total: {total} parada(s) · Gerado em {fmtDataHora(new Date().toISOString())}
        </div>
      </div>

      {/* Lista */}
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
                <th style={{ padding: '10px 12px' }}>Entrou na frente</th>
                <th style={{ padding: '10px 12px' }}>Setor / área</th>
                <th style={{ padding: '10px 12px' }}>Motivo</th>
                <th style={{ padding: '10px 12px' }} className="no-print"></th>
              </tr>
            </thead>
            <tbody>
              {paradas.map((p, i) => (
                <tr key={p.id} style={{ borderTop: '1px solid #eef2f7' }}>
                  <td style={{ padding: '10px 12px', color: '#94a3b8', fontWeight: 700 }}>{paradas.length - i}</td>
                  <td style={{ padding: '10px 12px', whiteSpace: 'nowrap', color: '#475569' }}>{fmtDataHora(p.ocorrido_em)}</td>
                  <td style={{ padding: '10px 12px', fontWeight: 700, color: '#1a3a5c', whiteSpace: 'nowrap' }}>{p.pedido}</td>
                  <td style={{ padding: '10px 12px', color: '#b45309', whiteSpace: 'nowrap' }}>{p.pedido_prioritario || '—'}</td>
                  <td style={{ padding: '10px 12px', color: '#334155', whiteSpace: 'nowrap' }}>{p.setor || '—'}</td>
                  <td style={{ padding: '10px 12px', color: '#334155', minWidth: 240 }}>{p.motivo}</td>
                  <td style={{ padding: '10px 12px', textAlign: 'right' }} className="no-print">
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
