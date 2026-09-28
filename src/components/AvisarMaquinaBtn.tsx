'use client';
// Botão do OPERADOR (Usinagem/Furação): "Avisar Planejamento" sobre uma máquina
// — quebrou/parou, voltou a funcionar (pede a liberação) ou outro problema. O
// Reginaldo recebe o alerta e resolve no /planejamento. Quem LIBERA a máquina é
// sempre o Planejamento. API: /api/maquinas/avisos (M60).
import { useEffect, useState } from 'react';
import { getToken } from '@/lib/auth';
import { MAQUINAS_POR_SETOR } from '@/lib/maquinas';

interface Aviso { id: number; maquina: string; tipo: string; mensagem: string | null; criado_em: string; resolvido_em?: string | null; resolvido_por_nome?: string | null; resposta?: string | null }
interface Parada { maquina: string; motivo: string }

const TIPOS = [
  { id: 'quebrou', rot: 'Quebrou / parou', icon: 'bi-exclamation-octagon-fill', cor: '#dc2626' },
  { id: 'voltou', rot: 'Voltou a funcionar — pedir liberação', icon: 'bi-check-circle-fill', cor: '#16a34a' },
  { id: 'outro', rot: 'Outro problema', icon: 'bi-chat-left-text-fill', cor: '#d97706' },
] as const;
const TIPO_TXT: Record<string, string> = { quebrou: 'Quebrou / parou', voltou: 'Voltou a funcionar', outro: 'Outro problema' };

const hdr = () => ({ 'Content-Type': 'application/json', Authorization: `Bearer ${getToken() || ''}` });
const fmt = (iso: string) => new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

export default function AvisarMaquinaBtn({ setor }: { setor: string }) {
  const grupos = MAQUINAS_POR_SETOR[setor] || [];
  const [aberto, setAberto] = useState(false);
  const [maquina, setMaquina] = useState('');
  const [tipo, setTipo] = useState<string>('quebrou');
  const [mensagem, setMensagem] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState('');
  const [ok, setOk] = useState('');
  const [paradas, setParadas] = useState<Record<string, Parada>>({});
  const [meus, setMeus] = useState<{ pendentes: Aviso[]; recentes: Aviso[] }>({ pendentes: [], recentes: [] });

  async function carregar() {
    try {
      const [rp, ra] = await Promise.all([
        fetch('/api/maquinas/paradas', { headers: hdr() }),
        fetch('/api/maquinas/avisos', { headers: hdr() }),
      ]);
      if (rp.ok) setParadas(Object.fromEntries(((await rp.json()).ativas || []).map((p: Parada) => [p.maquina, p])));
      if (ra.ok) { const d = await ra.json(); setMeus({ pendentes: d.pendentes || [], recentes: d.recentes || [] }); }
    } catch { /* segue */ }
  }
  useEffect(() => { if (aberto) carregar(); }, [aberto]);
  // Máquina parada escolhida → sugere "voltou a funcionar"; livre → "quebrou".
  useEffect(() => { if (maquina) setTipo(paradas[maquina] ? 'voltou' : 'quebrou'); }, [maquina, paradas]);

  async function enviar() {
    setErro(''); setOk('');
    if (!maquina) { setErro('Escolha a máquina.'); return; }
    if (tipo !== 'voltou' && !mensagem.trim()) { setErro('Conte o que aconteceu.'); return; }
    setEnviando(true);
    try {
      const r = await fetch('/api/maquinas/avisos', { method: 'POST', headers: hdr(), body: JSON.stringify({ maquina, tipo, mensagem }) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { setErro(d.erro || 'Não foi possível enviar.'); return; }
      setOk('Aviso enviado pro Planejamento!');
      setMensagem(''); setMaquina('');
      carregar();
    } catch { setErro('Falha de conexão.'); }
    finally { setEnviando(false); }
  }

  if (!grupos.length) return null;
  return (
    <>
      <button onClick={() => { setAberto(true); setOk(''); setErro(''); }}
        title="Avisar o Planejamento que uma máquina quebrou, voltou a funcionar ou tem outro problema"
        style={{ background: '#fff', border: '1px solid #fecaca', borderRadius: 5, padding: '5px 14px', fontSize: 13, color: '#dc2626', cursor: 'pointer', fontWeight: 600 }}>
        <i className="bi bi-tools" style={{ marginRight: 4 }} />Avisar Planejamento
      </button>
      {aberto && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 12 }} onClick={() => !enviando && setAberto(false)}>
          <div style={{ background: '#fff', borderRadius: 14, padding: 22, width: 480, maxWidth: '96vw', maxHeight: '92vh', overflowY: 'auto', boxShadow: '0 8px 32px rgba(0,0,0,.18)' }} onClick={e => e.stopPropagation()}>
            <div style={{ fontSize: 18, fontWeight: 800, color: '#1a3a5c', marginBottom: 4 }}><i className="bi bi-tools" style={{ marginRight: 8, color: '#dc2626' }} />Avisar o Planejamento</div>
            <div style={{ fontSize: 12.5, color: '#64748b', marginBottom: 14 }}>O Reginaldo recebe na hora. Quem registra a parada e <b>libera</b> a máquina é o Planejamento.</div>

            <label style={{ fontSize: 12, fontWeight: 700, color: '#555', display: 'block', marginBottom: 5 }}>Máquina</label>
            <select value={maquina} onChange={e => setMaquina(e.target.value)}
              style={{ width: '100%', border: '1px solid #cbd5e1', borderRadius: 8, padding: '10px', fontSize: 14, fontWeight: 600, marginBottom: 12 }}>
              <option value="">Escolha a máquina…</option>
              {grupos.map(g => (
                <optgroup key={g.categoria} label={g.categoria}>
                  {g.maquinas.map(m => <option key={m} value={m}>{paradas[m] ? `⛔ ${m} — PARADA (${paradas[m].motivo})` : m}</option>)}
                </optgroup>
              ))}
            </select>

            <label style={{ fontSize: 12, fontWeight: 700, color: '#555', display: 'block', marginBottom: 5 }}>O que aconteceu?</label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 12 }}>
              {TIPOS.map(t => (
                <button key={t.id} type="button" onClick={() => setTipo(t.id)}
                  style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px', borderRadius: 9, cursor: 'pointer', textAlign: 'left', fontSize: 14, fontWeight: 700,
                    border: `2px solid ${tipo === t.id ? t.cor : '#e2e8f0'}`, background: tipo === t.id ? t.cor + '14' : '#fff', color: tipo === t.id ? t.cor : '#334155' }}>
                  <i className={`bi ${t.icon}`} />{t.rot}
                </button>
              ))}
            </div>

            <label style={{ fontSize: 12, fontWeight: 700, color: '#555', display: 'block', marginBottom: 5 }}>
              Mensagem {tipo === 'voltou' ? '(opcional)' : '*'}
            </label>
            <textarea rows={3} value={mensagem} onChange={e => setMensagem(e.target.value)} maxLength={500}
              placeholder={tipo === 'voltou' ? 'Ex.: técnico consertou, testei e está ok' : 'Ex.: fuso travou / vazando óleo / não liga'}
              style={{ width: '100%', border: '1px solid #cbd5e1', borderRadius: 8, padding: '8px 10px', fontSize: 14, boxSizing: 'border-box', marginBottom: 10, resize: 'vertical' }} />

            {erro && <div style={{ color: '#dc2626', fontSize: 13, fontWeight: 600, marginBottom: 8 }}>{erro}</div>}
            {ok && <div style={{ color: '#16a34a', fontSize: 13, fontWeight: 700, marginBottom: 8 }}><i className="bi bi-check-circle-fill" /> {ok}</div>}
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => setAberto(false)} disabled={enviando} style={{ flex: 1, background: '#f3f4f6', border: 'none', borderRadius: 8, padding: '12px 0', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>Fechar</button>
              <button onClick={enviar} disabled={enviando} style={{ flex: 2, background: '#dc2626', color: '#fff', border: 'none', borderRadius: 8, padding: '12px 0', fontSize: 14, fontWeight: 700, cursor: 'pointer', opacity: enviando ? .6 : 1 }}>
                <i className="bi bi-send-fill" style={{ marginRight: 6 }} />{enviando ? 'Enviando…' : 'Enviar aviso'}
              </button>
            </div>

            {(meus.pendentes.length > 0 || meus.recentes.length > 0) && (
              <div style={{ marginTop: 16, borderTop: '1px solid #e2e8f0', paddingTop: 10 }}>
                <div style={{ fontSize: 11, fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: .4, marginBottom: 6 }}>Meus avisos</div>
                {meus.pendentes.map(a => (
                  <div key={a.id} style={{ fontSize: 12.5, padding: '5px 0', borderBottom: '1px dashed #e2e8f0' }}>
                    <b>{a.maquina}</b> · {TIPO_TXT[a.tipo] || a.tipo} · <span style={{ color: '#64748b' }}>{fmt(a.criado_em)}</span>
                    <span style={{ marginLeft: 6, fontSize: 11, fontWeight: 700, color: '#b45309', background: '#fef3c7', borderRadius: 8, padding: '1px 7px' }}>aguardando o Planejamento</span>
                  </div>
                ))}
                {meus.recentes.map(a => (
                  <div key={a.id} style={{ fontSize: 12.5, padding: '5px 0', borderBottom: '1px dashed #e2e8f0' }}>
                    <b>{a.maquina}</b> · {TIPO_TXT[a.tipo] || a.tipo}
                    <span style={{ marginLeft: 6, fontSize: 11, fontWeight: 700, color: '#166534', background: '#dcfce7', borderRadius: 8, padding: '1px 7px' }}>resolvido por {a.resolvido_por_nome}</span>
                    {a.resposta && <div style={{ color: '#334155', marginTop: 2 }}>↳ {a.resposta}</div>}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
