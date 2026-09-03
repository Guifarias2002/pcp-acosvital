'use client';
import { useCallback, useEffect, useState } from 'react';
import AuthGuard from '@/components/AuthGuard';
import { getInspecoes, laudoInspecao } from '@/lib/api';
import { nomeInspecao } from '@/lib/types';
import { NOMES } from '@/lib/types';

// Fila de INSPEÇÕES da Caldeiraria (Hold Points) — a Qualidade vê os pendentes
// e lança o laudo (aprovado / reprovado / retrabalho). Diferenciado do fluxo de
// Flange (só peça de fabrica='caldeiraria' entra aqui). Backend em
// /api/inspecoes e /api/inspecao/[id]/laudo. Ver [[project_datas_op_cliente]].

interface Inspecao {
  id: number; tipo: string; setor: string | null; status: string;
  observacao_solicitacao: string | null; solicitado_em: string; resolvido_em: string | null; laudo: string | null;
  item_id: number; parcial_id: number | null; pedido_id: number;
  codigo: string | null; descricao: string | null;
  quantidade: number | null; parcial_setor: string | null;
  solicitante: string | null; inspetor: string | null;
}
const C = { azul: '#0e7490', verde: '#16a34a', vermelho: '#dc2626', laranja: '#d97706', cinza: '#64748b' };
const nmSetor = (c: string | null) => (c ? NOMES[c] || c : '—');
const fmtData = (s: string | null) => {
  if (!s) return '—';
  const d = new Date(s);
  return isNaN(d.getTime()) ? '—' : d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
};
// Há quanto tempo espera (só pendentes) — dá noção de urgência pra Qualidade.
function esperaDesde(s: string) {
  const ms = Date.now() - new Date(s).getTime();
  if (isNaN(ms) || ms < 0) return '';
  const h = Math.floor(ms / 3600000), m = Math.floor((ms % 3600000) / 60000);
  if (h >= 24) return `há ${Math.floor(h / 24)}d`;
  if (h >= 1) return `há ${h}h`;
  return `há ${m}min`;
}

export default function InspecoesPage() {
  const [filtro, setFiltro] = useState<'pendente' | 'resolvidas'>('pendente');
  const [lista, setLista] = useState<Inspecao[]>([]);
  const [pendentes, setPendentes] = useState(0);
  const [loading, setLoading] = useState(false);
  const [laudos, setLaudos] = useState<Record<number, string>>({});
  const [salvando, setSalvando] = useState<number | null>(null);
  const [erro, setErro] = useState('');

  const carregar = useCallback(() => {
    setLoading(true); setErro('');
    getInspecoes(filtro)
      .then((d: { inspecoes: Inspecao[]; pendentes: number }) => { setLista(d.inspecoes || []); setPendentes(d.pendentes || 0); })
      .catch(() => setErro('Não foi possível carregar as inspeções.'))
      .finally(() => setLoading(false));
  }, [filtro]);
  useEffect(() => { carregar(); }, [carregar]);

  async function lancar(id: number, resultado: 'aprovado' | 'reprovado' | 'retrabalho') {
    if (salvando != null) return;
    setSalvando(id); setErro('');
    try {
      await laudoInspecao(id, resultado, laudos[id] || '');
      setLaudos(l => { const n = { ...l }; delete n[id]; return n; });
      carregar();
    } catch (e: unknown) {
      const ax = e as { response?: { data?: { erro?: string } } };
      setErro(ax?.response?.data?.erro || 'Erro ao registrar o laudo.');
    } finally { setSalvando(null); }
  }

  const badge = (status: string) => {
    const map: Record<string, [string, string]> = {
      pendente: ['#fffbeb', C.laranja], aprovado: ['#ecfdf5', C.verde],
      reprovado: ['#fef2f2', C.vermelho], retrabalho: ['#fef2f2', C.vermelho],
    };
    const [bg, cor] = map[status] || ['#f1f5f9', C.cinza];
    const rotulo = status === 'pendente' ? 'Pendente' : status === 'aprovado' ? 'Aprovada' : status === 'reprovado' ? 'Reprovada' : 'Retrabalho';
    return <span style={{ background: bg, color: cor, fontSize: 11, fontWeight: 800, padding: '2px 8px', borderRadius: 20, textTransform: 'uppercase', letterSpacing: .4 }}>{rotulo}</span>;
  };

  return (
    <AuthGuard>
      <div style={{ maxWidth: 900, margin: '0 auto', padding: '18px 16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, marginBottom: 4 }}>
          <h1 style={{ fontSize: 20, fontWeight: 800, color: C.azul, margin: 0 }}>
            <i className="bi bi-clipboard2-check" style={{ marginRight: 8 }} />Inspeções — Caldeiraria
          </h1>
          <button onClick={carregar} disabled={loading}
            style={{ border: '1px solid #cbd5e1', background: '#fff', borderRadius: 8, padding: '6px 12px', fontSize: 13, cursor: 'pointer', color: C.cinza }}>
            <i className="bi bi-arrow-clockwise" style={{ marginRight: 6 }} />{loading ? 'Carregando…' : 'Atualizar'}
          </button>
        </div>
        <p style={{ color: C.cinza, fontSize: 12.5, margin: '0 0 14px' }}>
          Hold Points do processo (ex.: Fit-Up). O apontador solicita; a Qualidade lança o laudo. Reprovado/Retrabalho devolve a peça pra Caldeiraria.
        </p>

        {/* Filtro */}
        <div style={{ display: 'flex', gap: 6, marginBottom: 14 }}>
          {(['pendente', 'resolvidas'] as const).map(f => (
            <button key={f} onClick={() => setFiltro(f)}
              style={{
                border: 'none', borderRadius: 8, padding: '7px 14px', fontSize: 13, fontWeight: 700, cursor: 'pointer',
                background: filtro === f ? C.azul : '#e2e8f0', color: filtro === f ? '#fff' : '#475569',
              }}>
              {f === 'pendente' ? `Pendentes${pendentes ? ` (${pendentes})` : ''}` : 'Resolvidas'}
            </button>
          ))}
        </div>

        {erro && <div style={{ background: '#fef2f2', border: '1px solid #fecaca', color: C.vermelho, borderRadius: 8, padding: '8px 12px', fontSize: 13, marginBottom: 12 }}>{erro}</div>}

        {!loading && lista.length === 0 && (
          <div style={{ textAlign: 'center', color: C.cinza, padding: '40px 0' }}>
            <i className="bi bi-check2-circle" style={{ fontSize: 34, color: C.verde }} />
            <p style={{ marginTop: 10, fontWeight: 700 }}>{filtro === 'pendente' ? 'Nenhuma inspeção pendente.' : 'Nenhuma inspeção resolvida ainda.'}</p>
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {lista.map(insp => (
            <div key={insp.id} style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: 14, boxShadow: '0 1px 2px rgba(0,0,0,.03)' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 6 }}>
                <div style={{ fontSize: 15, fontWeight: 800, color: '#0f172a' }}>{nomeInspecao(insp.tipo)}</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  {insp.status === 'pendente' && <span style={{ fontSize: 11.5, color: C.laranja, fontWeight: 700 }}>{esperaDesde(insp.solicitado_em)}</span>}
                  {badge(insp.status)}
                </div>
              </div>
              <div style={{ fontSize: 13, color: '#334155', marginTop: 4 }}>
                <b>{insp.codigo || '—'}</b>{insp.descricao ? ` · ${insp.descricao}` : ''}
                {insp.quantidade != null && <span style={{ color: C.cinza }}> · {insp.quantidade} un</span>}
              </div>
              <div style={{ fontSize: 12, color: C.cinza, marginTop: 3 }}>
                Setor: <b style={{ color: '#475569' }}>{nmSetor(insp.parcial_setor || insp.setor)}</b>
                {' · '}Solicitado por {insp.solicitante || '—'} · {fmtData(insp.solicitado_em)}
              </div>
              {insp.observacao_solicitacao && (
                <div style={{ fontSize: 12.5, color: '#475569', marginTop: 6, background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 6, padding: '6px 9px' }}>
                  <i className="bi bi-chat-left-text" style={{ marginRight: 6, color: C.cinza }} />{insp.observacao_solicitacao}
                </div>
              )}

              {insp.status === 'pendente' ? (
                <div style={{ marginTop: 10, borderTop: '1px solid #f1f5f9', paddingTop: 10 }}>
                  <textarea
                    value={laudos[insp.id] || ''}
                    onChange={e => setLaudos(l => ({ ...l, [insp.id]: e.target.value }))}
                    placeholder="Laudo do inspetor (obrigatório se reprovar/retrabalho)"
                    rows={2}
                    style={{ width: '100%', fontSize: 12.5, padding: '7px 9px', border: '1px solid #cbd5e1', borderRadius: 6, resize: 'vertical', boxSizing: 'border-box' }}
                  />
                  <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
                    <button onClick={() => lancar(insp.id, 'aprovado')} disabled={salvando != null}
                      style={{ border: 'none', background: C.verde, color: '#fff', borderRadius: 8, padding: '8px 16px', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
                      <i className="bi bi-check-lg" style={{ marginRight: 5 }} />Aprovar
                    </button>
                    <button onClick={() => lancar(insp.id, 'retrabalho')} disabled={salvando != null || !(laudos[insp.id] || '').trim()}
                      title={!(laudos[insp.id] || '').trim() ? 'Escreva o laudo antes' : ''}
                      style={{ border: 'none', background: C.laranja, color: '#fff', borderRadius: 8, padding: '8px 16px', fontSize: 13, fontWeight: 700, cursor: 'pointer', opacity: (laudos[insp.id] || '').trim() ? 1 : .5 }}>
                      <i className="bi bi-arrow-repeat" style={{ marginRight: 5 }} />Retrabalho
                    </button>
                    <button onClick={() => lancar(insp.id, 'reprovado')} disabled={salvando != null || !(laudos[insp.id] || '').trim()}
                      title={!(laudos[insp.id] || '').trim() ? 'Escreva o laudo antes' : ''}
                      style={{ border: 'none', background: C.vermelho, color: '#fff', borderRadius: 8, padding: '8px 16px', fontSize: 13, fontWeight: 700, cursor: 'pointer', opacity: (laudos[insp.id] || '').trim() ? 1 : .5 }}>
                      <i className="bi bi-x-lg" style={{ marginRight: 5 }} />Reprovar
                    </button>
                  </div>
                </div>
              ) : (
                <div style={{ fontSize: 12, color: C.cinza, marginTop: 8, borderTop: '1px solid #f1f5f9', paddingTop: 8 }}>
                  Laudo por {insp.inspetor || '—'} · {fmtData(insp.resolvido_em)}
                  {insp.laudo && <div style={{ color: '#475569', marginTop: 3 }}>“{insp.laudo}”</div>}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </AuthGuard>
  );
}
