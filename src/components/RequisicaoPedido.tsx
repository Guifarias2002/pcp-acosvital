'use client';
// Faixa "Requisição HRM" embaixo do cabeçalho do pedido, nas telas dos setores
// Requisição HRM ('cald_compras') e Recebimento ('caldeiraria'). O Alan registra
// a requisição feita no Omie (nº, data, itens) e acompanha a compra: criada →
// comprado (PC + previsão) | não será comprado → material chegou. Só AVISA
// quando falta requisição — não trava o envio (decisão 25/09).
import { useCallback, useEffect, useState } from 'react';
import { getToken, getUser } from '@/lib/auth';
import { SITUACOES_REQ, SITUACAO_REQ, podeRegistrarRequisicao, type RequisicaoHrm, type SituacaoReq } from '@/lib/requisicaoHrm';

export interface ItemReq { id: number; codigo: string; descricao: string; quantidade?: number; unidade?: string }

const hoje = () => new Date().toISOString().slice(0, 10);
const fmt = (iso: string | null) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}` : '');
const hdr = () => ({ 'Content-Type': 'application/json', Authorization: `Bearer ${getToken() || ''}` });
const inp: React.CSSProperties = { border: '1px solid #cbd5e1', borderRadius: 6, padding: '5px 8px', fontSize: 12.5, minWidth: 0 };
const btn = (bg: string, cor = '#fff'): React.CSSProperties => ({ background: bg, color: cor, border: 'none', borderRadius: 6, padding: '5px 12px', fontSize: 12, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' });

export default function RequisicaoPedido({ pedidoId, setor, itens }: { pedidoId: number; setor: string; itens: ItemReq[] }) {
  const [reqs, setReqs] = useState<RequisicaoHrm[] | null>(null);
  const [novo, setNovo] = useState(false);
  const [editando, setEditando] = useState<number | null>(null);
  const [erro, setErro] = useState('');
  const [salvando, setSalvando] = useState(false);
  const pode = podeRegistrarRequisicao(getUser());
  const ehRequisicao = setor === 'cald_compras';

  const carregar = useCallback(() => {
    fetch(`/api/cald-requisicao?pedidos=${pedidoId}`, { headers: hdr() })
      .then(r => r.json()).then(j => setReqs(j.requisicoes || [])).catch(() => setReqs([]));
  }, [pedidoId]);
  useEffect(() => { carregar(); }, [carregar]);

  // Form de nova requisição
  const cobertos = new Set((reqs || []).flatMap(r => r.itens));
  const semReq = itens.filter(i => !cobertos.has(i.id));
  const [fNum, setFNum] = useState('');
  const [fData, setFData] = useState(hoje());
  const [fObs, setFObs] = useState('');
  const [fItens, setFItens] = useState<Set<number>>(new Set());
  function abrirNovo() {
    setFNum(''); setFData(hoje()); setFObs('');
    setFItens(new Set((semReq.length ? semReq : itens).map(i => i.id)));
    setErro(''); setNovo(true);
  }
  async function registrar() {
    setSalvando(true); setErro('');
    try {
      const r = await fetch('/api/cald-requisicao', { method: 'POST', headers: hdr(), body: JSON.stringify({ pedido_id: pedidoId, numero: fNum, data: fData, itens: Array.from(fItens), obs: fObs }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { setErro(j.erro || 'Não consegui registrar.'); return; }
      setNovo(false); carregar();
    } finally { setSalvando(false); }
  }

  // Edição da situação
  const [eSit, setESit] = useState<SituacaoReq>('criada');
  const [ePc, setEPc] = useState('');
  const [ePrev, setEPrev] = useState('');
  const [eMot, setEMot] = useState('');
  function abrirEdicao(r: RequisicaoHrm) {
    setESit(r.situacao); setEPc(r.pedido_compra || ''); setEPrev(r.previsao_chegada || ''); setEMot(r.motivo || '');
    setErro(''); setEditando(r.id);
  }
  async function salvarEdicao(id: number) {
    setSalvando(true); setErro('');
    try {
      const r = await fetch(`/api/cald-requisicao/${id}`, { method: 'PATCH', headers: hdr(), body: JSON.stringify({ situacao: eSit, pedido_compra: ePc, previsao_chegada: ePrev, motivo: eMot }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { setErro(j.erro || 'Não consegui salvar.'); return; }
      setEditando(null); carregar();
    } finally { setSalvando(false); }
  }
  async function apagar(id: number) {
    if (!confirm('Apagar esta requisição registrada por engano?')) return;
    await fetch(`/api/cald-requisicao/${id}`, { method: 'DELETE', headers: hdr() });
    setEditando(null); carregar();
  }

  if (!reqs) return null;
  const nomeItem = (id: number) => { const i = itens.find(x => x.id === id); return i ? (i.codigo || i.descricao) : `#${id}`; };

  return (
    <div onClick={e => e.stopPropagation()} style={{ background: reqs.length ? '#f8fafc' : '#fffbeb', borderBottom: '1px solid #e2e8f0', padding: '8px 16px', fontSize: 12.5 }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
        <b style={{ color: '#1a3a5c' }}><i className="bi bi-clipboard2-check" style={{ marginRight: 5 }} />Requisição HRM</b>
        {!reqs.length && (
          <span style={{ color: '#92400e', fontWeight: 700 }}>
            <i className="bi bi-exclamation-triangle-fill" style={{ marginRight: 4 }} />
            Sem requisição registrada{ehRequisicao ? ' — crie no Omie e registre aqui antes de mandar pro Recebimento' : ''}
          </span>
        )}
        {reqs.map(r => {
          const s = SITUACAO_REQ[r.situacao] || SITUACAO_REQ.criada;
          const atrasada = r.situacao === 'comprado' && !!r.previsao_chegada && r.previsao_chegada < hoje();
          return (
            <span key={r.id} title={`Itens: ${r.itens.map(nomeItem).join(', ')}${r.obs ? `\nObs: ${r.obs}` : ''}\nRegistrada por ${r.criado_por_nome || '—'}${r.atualizado_por_nome ? ` · atualizada por ${r.atualizado_por_nome}` : ''}`}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: '#fff', border: `1px solid ${atrasada ? '#fca5a5' : '#e2e8f0'}`, borderRadius: 8, padding: '3px 8px' }}>
              <b>Req. {r.numero}</b>
              <span style={{ color: '#64748b' }}>{fmt(r.data)} · {r.itens.length} ite{r.itens.length > 1 ? 'ns' : 'm'}</span>
              <span style={{ color: s.cor, background: s.bg, borderRadius: 6, padding: '1px 7px', fontWeight: 700, fontSize: 11.5 }}><i className={`bi ${s.icon}`} /> {s.nome}</span>
              {r.pedido_compra && <span style={{ color: '#475569' }}>PC {r.pedido_compra}</span>}
              {r.situacao === 'comprado' && r.previsao_chegada && <span style={{ color: atrasada ? '#dc2626' : '#1d4ed8', fontWeight: 700 }}>{atrasada ? 'atrasado · ' : ''}chega {fmt(r.previsao_chegada)}</span>}
              {r.situacao === 'chegou' && r.chegou_em && <span style={{ color: '#166534' }}>em {fmt(r.chegou_em)}</span>}
              {r.situacao === 'nao_comprar' && r.motivo && <span style={{ color: '#475569' }}>— {r.motivo}</span>}
              {pode && <button onClick={() => (editando === r.id ? setEditando(null) : abrirEdicao(r))} style={{ ...btn('#eef2f7', '#1a3a5c'), padding: '2px 8px' }}><i className="bi bi-pencil" /> Atualizar</button>}
            </span>
          );
        })}
        {reqs.length > 0 && semReq.length > 0 && <span style={{ color: '#92400e' }}>· {semReq.length} item(ns) sem requisição</span>}
        <div style={{ flex: 1 }} />
        {pode && !novo && <button onClick={abrirNovo} style={btn('#1a3a5c')}><i className="bi bi-plus-lg" /> {reqs.length ? 'Nova requisição' : 'Registrar requisição'}</button>}
      </div>

      {erro && <div style={{ color: '#dc2626', marginTop: 6 }}>{erro}</div>}

      {novo && (
        <div style={{ marginTop: 8, background: '#fff', border: '1px solid #cfe0f2', borderRadius: 8, padding: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 3 }}><span style={{ fontSize: 11, fontWeight: 700, color: '#64748b' }}>Nº da requisição (Omie)</span>
              <input value={fNum} onChange={e => setFNum(e.target.value)} style={{ ...inp, width: 160 }} autoFocus /></label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 3 }}><span style={{ fontSize: 11, fontWeight: 700, color: '#64748b' }}>Data</span>
              <input type="date" value={fData} onChange={e => setFData(e.target.value)} style={inp} /></label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 3, flex: 1, minWidth: 200 }}><span style={{ fontSize: 11, fontWeight: 700, color: '#64748b' }}>Observação (opcional)</span>
              <input value={fObs} onChange={e => setFObs(e.target.value)} style={inp} /></label>
          </div>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', marginBottom: 4 }}>Itens desta requisição ({fItens.size} de {itens.length})</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2, maxHeight: 180, overflowY: 'auto' }}>
              {itens.map(i => (
                <label key={i.id} style={{ display: 'flex', gap: 6, alignItems: 'center', cursor: 'pointer' }}>
                  <input type="checkbox" checked={fItens.has(i.id)} onChange={() => setFItens(v => { const n = new Set(v); if (n.has(i.id)) n.delete(i.id); else n.add(i.id); return n; })} />
                  <b style={{ color: '#1a3a5c' }}>{i.codigo}</b> <span>{i.descricao}</span>
                  {i.quantidade != null && <span style={{ color: '#64748b' }}>· {i.quantidade} {i.unidade || ''}</span>}
                  {cobertos.has(i.id) && <span style={{ fontSize: 11, color: '#64748b', background: '#eef2f7', borderRadius: 6, padding: '0 6px' }}>já tem requisição</span>}
                </label>
              ))}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
            <button onClick={() => setNovo(false)} style={btn('#fff', '#475569')}>Cancelar</button>
            <button disabled={salvando || !fNum.trim() || !fItens.size} onClick={registrar} style={{ ...btn('#16a34a'), opacity: (salvando || !fNum.trim() || !fItens.size) ? .5 : 1 }}>
              <i className="bi bi-check2" /> Registrar
            </button>
          </div>
        </div>
      )}

      {editando !== null && (
        <div style={{ marginTop: 8, background: '#fff', border: '1px solid #cfe0f2', borderRadius: 8, padding: 10, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 3 }}><span style={{ fontSize: 11, fontWeight: 700, color: '#64748b' }}>Situação da compra</span>
            <select value={eSit} onChange={e => setESit(e.target.value as SituacaoReq)} style={inp}>
              {SITUACOES_REQ.map(s => <option key={s.cod} value={s.cod}>{s.nome}</option>)}
            </select></label>
          {(eSit === 'comprado' || eSit === 'chegou') && <>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 3 }}><span style={{ fontSize: 11, fontWeight: 700, color: '#64748b' }}>Nº pedido de compra (opcional)</span>
              <input value={ePc} onChange={e => setEPc(e.target.value)} style={{ ...inp, width: 150 }} /></label>
            {eSit === 'comprado' && <label style={{ display: 'flex', flexDirection: 'column', gap: 3 }}><span style={{ fontSize: 11, fontWeight: 700, color: '#64748b' }}>Previsão de chegada</span>
              <input type="date" value={ePrev} onChange={e => setEPrev(e.target.value)} style={inp} /></label>}
          </>}
          {eSit === 'nao_comprar' && <label style={{ display: 'flex', flexDirection: 'column', gap: 3, flex: 1, minWidth: 200 }}><span style={{ fontSize: 11, fontWeight: 700, color: '#64748b' }}>Motivo (ex.: usar do estoque)</span>
            <input value={eMot} onChange={e => setEMot(e.target.value)} style={inp} /></label>}
          <div style={{ flex: 1 }} />
          <button onClick={() => apagar(editando)} style={btn('#fff', '#dc2626')}><i className="bi bi-trash" /> Apagar</button>
          <button onClick={() => setEditando(null)} style={btn('#fff', '#475569')}>Cancelar</button>
          <button disabled={salvando} onClick={() => salvarEdicao(editando)} style={btn('#16a34a')}><i className="bi bi-check2" /> Salvar</button>
        </div>
      )}
    </div>
  );
}
