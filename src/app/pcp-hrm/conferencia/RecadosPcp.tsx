'use client';
// Caixa "Recados do PCP" na Conferência do Alan: itens que o Val (PCP
// Caldeiraria) encaminhou pra um setor "mais a fundo" (inspeção, teste,
// laboratório, Book) ou com observação. O Alan confere e marca "Verificado"
// (com resposta opcional) — o selo "verificar com Alan" sai do card do Val.
import { useCallback, useEffect, useState } from 'react';
import { getToken, getUser, podeConferirHrm } from '@/lib/auth';

interface Recado {
  id: number; item_id: number; area_nome: string; sub_setor_nome: string; mensagem: string | null;
  criado_por_nome: string | null; criado_em: string; verificado_em: string | null; verificado_por_nome: string | null; resposta: string | null;
  pedido: string; material: string; cliente: string | null; quantidade: number | null; unidade: string | null;
}
const fmtDH = (s: string) => new Date(s).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

export default function RecadosPcp() {
  const [recados, setRecados] = useState<Recado[] | null>(null);
  const [resposta, setResposta] = useState<Record<number, string>>({});
  const [salvando, setSalvando] = useState<number | null>(null);
  const [verAntigos, setVerAntigos] = useState(false);
  const [erro, setErro] = useState('');
  const pode = podeConferirHrm(getUser());

  const carregar = useCallback(() => {
    fetch('/api/cald-plano/recados', { headers: { Authorization: `Bearer ${getToken() || ''}` } })
      .then(r => r.json()).then(j => setRecados(j.recados || [])).catch(() => setRecados([]));
  }, []);
  useEffect(() => { carregar(); }, [carregar]);

  async function verificar(id: number) {
    setSalvando(id); setErro('');
    try {
      const r = await fetch('/api/cald-plano/recados', {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken() || ''}` },
        body: JSON.stringify({ id, resposta: resposta[id] || '' }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) setErro(j.erro || 'Não consegui marcar como verificado.');
      carregar();
    } finally { setSalvando(null); }
  }

  if (!recados || !recados.length) return null;
  const pend = recados.filter(r => !r.verificado_em);
  const feitos = recados.filter(r => r.verificado_em);

  return (
    <div style={{ background: '#fffbeb', border: '1.5px solid #fcd34d', borderRadius: 12, padding: 14, marginBottom: 18 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: pend.length ? 10 : 0, flexWrap: 'wrap' }}>
        <b style={{ color: '#92400e', fontSize: 14 }}><i className="bi bi-chat-left-text-fill" style={{ marginRight: 6 }} />Recados do PCP Caldeiraria</b>
        <span style={{ fontSize: 12, fontWeight: 800, color: '#fff', background: pend.length ? '#d97706' : '#cbd5e1', borderRadius: 10, padding: '1px 9px' }}>{pend.length}</span>
        <span style={{ fontSize: 12, color: '#92400e' }}>{pend.length ? 'pra conferir e verificar' : 'nenhum pendente'}</span>
        <div style={{ flex: 1 }} />
        {feitos.length > 0 && <button onClick={() => setVerAntigos(v => !v)} style={{ border: 'none', background: 'none', color: '#92400e', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>{verAntigos ? 'Ocultar' : 'Ver'} verificados ({feitos.length})</button>}
      </div>
      {erro && <div style={{ color: '#dc2626', fontSize: 12.5, marginBottom: 8 }}>{erro}</div>}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 8 }}>
        {[...pend, ...(verAntigos ? feitos : [])].map(r => (
          <div key={r.id} style={{ background: '#fff', border: `1px solid ${r.verificado_em ? '#e2e8f0' : '#fde68a'}`, borderRadius: 10, padding: '10px 12px', opacity: r.verificado_em ? .7 : 1 }}>
            <div style={{ display: 'flex', gap: 6, alignItems: 'baseline', flexWrap: 'wrap' }}>
              <b style={{ color: '#1a3a5c' }}>{r.pedido}</b>
              <span style={{ fontSize: 12.5, color: '#334155' }}>{r.material}</span>
            </div>
            <div style={{ fontSize: 12, marginTop: 2 }}>
              <b style={{ color: '#0f766e' }}>{r.area_nome}</b>{r.sub_setor_nome ? <span style={{ color: '#334155' }}> › {r.sub_setor_nome}</span> : null}
              {r.cliente ? <span style={{ color: '#94a3b8' }}> · {r.cliente}</span> : null}
            </div>
            {r.mensagem && <div style={{ fontSize: 12.5, color: '#334155', background: '#f8fafc', borderRadius: 6, padding: '6px 8px', marginTop: 6 }}>“{r.mensagem}”</div>}
            <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 4 }}>{r.criado_por_nome || 'PCP'} · {fmtDH(r.criado_em)}</div>
            {r.verificado_em ? (
              <div style={{ fontSize: 12, color: '#166534', marginTop: 6 }}><i className="bi bi-check2-circle" /> Verificado por {r.verificado_por_nome} · {fmtDH(r.verificado_em)}{r.resposta ? ` — ${r.resposta}` : ''}</div>
            ) : pode && (
              <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                <input value={resposta[r.id] || ''} onChange={e => setResposta(v => ({ ...v, [r.id]: e.target.value }))} placeholder="Resposta pro PCP (opcional)"
                  style={{ flex: 1, minWidth: 0, border: '1px solid #dee2e6', borderRadius: 6, padding: '5px 8px', fontSize: 12.5 }} />
                <button disabled={salvando === r.id} onClick={() => verificar(r.id)}
                  style={{ background: '#16a34a', color: '#fff', border: 'none', borderRadius: 6, padding: '5px 12px', fontSize: 12.5, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }}>
                  <i className="bi bi-check2" /> Verificado
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
