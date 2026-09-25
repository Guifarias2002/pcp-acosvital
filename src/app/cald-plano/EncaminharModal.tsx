'use client';
// Encaminhar um item do PCP Caldeiraria: mostra as ÁREAS GERAIS (negrito) com os
// SUB-SETORES de cada uma (setores reais da Caldeiraria HRM do Alan). O Val
// escolhe a área — e, se quiser, o sub-setor. Sub-setor "mais a fundo"
// (SUBSETORES_VERIFICAR_ALAN) mostra o aviso de verificar com o Alan e gera um
// recado pra ele; a observação também vira recado.
import { useState } from 'react';
import { AREAS_CALD, SUBSETORES_CALD, SUBSETORES_VERIFICAR_ALAN, nomeSubsetor, type ItemCald } from '@/lib/caldPlano';
import { C, Modal, nomeArea } from './comum';

export interface Encaminhamento { area: string; sub_setor: string | null; obs: string }

export default function EncaminharModal({ item, area: areaIni, modo, onConfirmar, onFechar }: {
  item: ItemCald; area: string; modo: 'mover' | 'subsetor';
  onConfirmar: (e: Encaminhamento) => void; onFechar: () => void;
}) {
  // No "mover", a área em que o item JÁ está não é destino (regravaria a entrada).
  const aqui = modo === 'mover' && item.status === 'andamento' ? item.area_atual : null;
  const [area, setArea] = useState(areaIni === aqui ? '' : areaIni);
  const [sub, setSub] = useState<string | null>(modo === 'subsetor' ? item.sub_setor ?? null : null);
  const [obs, setObs] = useState('');
  // Filtro da lista: a área aparece se o nome dela ou de algum setor bater; se
  // bater a própria área, mostra todos os setores dela.
  const [busca, setBusca] = useState('');
  const verificar = !!sub && SUBSETORES_VERIFICAR_ALAN.has(sub);
  // No modo "trocar setor" só vale a área atual; no "mover", todas as áreas.
  const areas = modo === 'subsetor' ? AREAS_CALD.filter(a => a.codigo === areaIni) : AREAS_CALD;
  const norm = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const q = norm(busca.trim());
  const areasFiltradas = areas.map(a => {
    const todos = SUBSETORES_CALD[a.codigo] || [];
    if (!q || norm(a.nome).includes(q)) return { a, subs: todos };
    return { a, subs: todos.filter(s => norm(nomeSubsetor(s)).includes(q)) };
  }).filter(x => !q || norm(x.a.nome).includes(q) || x.subs.length > 0);

  const escolher = (a: string, s: string | null) => { setArea(a); setSub(s); };
  const opcao = (a: string, s: string | null, rot: string, negrito: boolean, cor: string) => {
    const on = area === a && sub === s;
    // Área atual: o cabeçalho não é destino (regravaria a entrada), mas os
    // setores dela são — escolher um só troca o setor dentro da área.
    if (a === aqui && negrito) return (
      <div key={`${a}|${s}`} style={{ padding: '6px 10px', fontWeight: 800, color: cor, fontSize: 13.5 }}>{rot} <span style={{ fontSize: 11, fontWeight: 600, color: C.fraco }}>— está aqui{(SUBSETORES_CALD[a] || []).length ? ' (pode trocar o setor abaixo)' : ''}</span></div>
    );
    const alan = !!s && SUBSETORES_VERIFICAR_ALAN.has(s);
    return (
      <label key={`${a}|${s}`} style={{
        display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', borderRadius: 8,
        padding: negrito ? '6px 10px' : '4px 10px 4px 30px', background: on ? cor + '1a' : undefined,
        border: `1.5px solid ${on ? cor : 'transparent'}`,
      }}>
        <input type="radio" name="enc" checked={on} onChange={() => escolher(a, s)} />
        <span style={{ fontWeight: negrito ? 800 : 500, color: negrito ? cor : C.texto, fontSize: negrito ? 13.5 : 12.5 }}>{rot}</span>
        {alan && <span title="Etapa conferida pelo Alan" style={{ fontSize: 10.5, fontWeight: 800, color: '#92400e', background: '#fef3c7', borderRadius: 6, padding: '1px 6px' }}><i className="bi bi-person-check" /> Alan confere</span>}
      </label>
    );
  };

  return (
    <Modal largura={620} onFechar={onFechar}
      titulo={<>{modo === 'mover' ? 'Encaminhar' : 'Trocar setor'} — pedido {item.pedido}<div style={{ fontSize: 12, fontWeight: 500, color: C.cinza }}>{item.material}</div></>}
      rodape={<>
        <button className="cp-btn" onClick={onFechar}>Cancelar</button>
        <button className="cp-btn pri" disabled={!area} onClick={() => onConfirmar({ area, sub_setor: sub, obs: obs.trim() })}>
          <i className="bi bi-box-arrow-in-right" />{modo === 'mover' && area !== aqui ? (area ? `Entrou em ${sub ? nomeSubsetor(sub) : nomeArea(area)}` : 'Escolha a área') : 'Salvar setor'}
        </button>
      </>}>
      <div style={{ fontSize: 12, color: C.cinza, marginBottom: 10 }}>
        Escolha a <b>área geral</b> (em negrito) ou um <b>setor</b> dela. {modo === 'mover' && 'A entrada é registrada hoje.'}
      </div>
      <div style={{ position: 'relative', marginBottom: 8 }}>
        <i className="bi bi-search" style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: C.fraco, fontSize: 13 }} />
        <input className="cp-in" autoFocus value={busca} onChange={e => setBusca(e.target.value)}
          placeholder="Filtrar área ou setor… (ex.: solda, pintura, ultrassom)" style={{ paddingLeft: 30 }} />
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2, maxHeight: '48vh', overflowY: 'auto', border: `1px solid ${C.borda}`, borderRadius: 10, padding: 6 }}>
        {areasFiltradas.map(({ a, subs }) => (
          <div key={a.codigo} style={{ paddingBottom: 4, borderBottom: `1px solid #f1f5f9` }}>
            {opcao(a.codigo, null, a.nome, true, a.cor)}
            {subs.map(s => opcao(a.codigo, s, nomeSubsetor(s), false, a.cor))}
          </div>
        ))}
        {!areasFiltradas.length && <div style={{ padding: 16, textAlign: 'center', color: C.fraco, fontSize: 13 }}>Nenhuma área ou setor com “{busca}”.</div>}
      </div>

      {verificar && (
        <div style={{ marginTop: 12, background: '#fffbeb', border: '1.5px solid #fcd34d', color: '#92400e', borderRadius: 10, padding: '10px 12px', fontSize: 13 }}>
          <i className="bi bi-exclamation-triangle-fill" style={{ marginRight: 6 }} />
          <b>{nomeSubsetor(sub)}</b> é uma etapa conferida pelo <b>Alan</b> — confira e verifique com ele. Um recado vai pra Conferência dele e o card fica marcado até ele dar o ok.
        </div>
      )}
      <label style={{ display: 'block', marginTop: 12 }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: C.cinza, textTransform: 'uppercase', letterSpacing: .3 }}>Observação pra área {verificar ? '(vai pro Alan e pra quem é do setor)' : '(opcional — se preencher, vira recado pra quem é do setor)'}</span>
        <textarea className="cp-in" rows={2} value={obs} onChange={e => setObs(e.target.value)} maxLength={1000}
          placeholder="Ex.: conferir chanfro antes de soldar; cliente vem inspecionar dia 30…" style={{ marginTop: 4, resize: 'vertical' }} />
      </label>
    </Modal>
  );
}
