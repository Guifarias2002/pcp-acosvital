'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import AuthGuard from '@/components/AuthGuard';
import api, { postIdempotente } from '@/lib/api';
import { podeVerAcompHrm } from '@/lib/auth';
import {
  ETAPAS_HRM, SITUACOES_HRM, COORDENADORES_HRM, NOME_CAMPO_HRM, exwDe, folgaDe, atrasoDe, fmtDataHrm, nsDe,
  type ItemHrm, type HistHrm,
} from '@/lib/hrmAcomp';
import { C, CSS, Modal, erroDe } from '../../cald-plano/comum';
import { SubirPlanilha, ApagarPlanilha, CSS_HRM } from './planilha';

// Acompanhamento HRM — a planilha "SPR SJP TAUBATE" do Alan no sistema.
// Grade no formato da planilha (1 linha por item), edição direto na célula,
// histórico de expedite/ocorrência, etapas (planilha ou à mão) e o botão
// "Subir planilha" (o Alan continua com a planilha dele e sobe quando quiser).
// Ver src/lib/hrmAcomp.ts.

export default function AcompanhamentoHrmPage() {
  return <AuthGuard><Conteudo /></AuthGuard>;
}

type Filtros = { q: string; dest: string; coord: string; sit: string; atr: boolean; entregues: boolean };

function Conteudo() {
  const router = useRouter();
  const [ok, setOk] = useState(false);
  const [itens, setItens] = useState<ItemHrm[]>([]);
  const [podeEditar, setPodeEditar] = useState(false);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState('');
  const [aviso, setAviso] = useState('');
  const [f, setF] = useState<Filtros>({ q: '', dest: '', coord: '', sit: '', atr: false, entregues: false });
  const [aberto, setAberto] = useState<number | null>(null);
  const [subir, setSubir] = useState(false);
  const [manual, setManual] = useState(false);

  useEffect(() => { if (!podeVerAcompHrm()) { router.replace('/'); return; } setOk(true); }, [router]);

  const carregar = useCallback(async () => {
    try {
      const r = await api.get('/api/hrm-acomp');
      setItens(r.data.itens || []); setPodeEditar(!!r.data.pode_editar); setErro('');
    } catch (e) { setErro(erroDe(e, 'Não foi possível carregar o acompanhamento.')); }
    finally { setCarregando(false); }
  }, []);
  useEffect(() => { if (ok) carregar(); }, [ok, carregar]);

  const mostrar = (t: string) => { setAviso(t); setTimeout(() => setAviso(''), 3500); };
  const trocar = (it: ItemHrm) => setItens(v => v.map(x => (x.id === it.id ? { ...x, ...it } : x)));

  async function salvarCampo(it: ItemHrm, campo: string, valor: string) {
    const antes = (it as unknown as Record<string, unknown>)[campo];
    if (String(antes ?? '') === valor) return;
    trocar({ ...it, [campo]: valor || null } as ItemHrm);
    try {
      const r = await postIdempotente<{ item: ItemHrm }>(`/api/hrm-acomp/${it.id}`, { acao: 'campo', campo, valor });
      trocar(r.item);
    } catch (e) { trocar(it); mostrar(erroDe(e, 'Não salvou — tente de novo.')); }
  }
  async function marcarEtapa(it: ItemHrm, codigo: string) {
    const okAtual = !!it.etapas?.[codigo]?.ok;
    try {
      const r = await postIdempotente<{ item: ItemHrm }>(`/api/hrm-acomp/${it.id}`, { acao: 'etapa', codigo, ok: !okAtual });
      trocar(r.item);
    } catch (e) { mostrar(erroDe(e, 'Não salvou a etapa.')); }
  }

  const destinos = useMemo(() => Array.from(new Set(itens.map(i => i.destino).filter(Boolean) as string[])).sort(), [itens]);
  const visiveis = useMemo(() => {
    const q = f.q.trim().toLowerCase();
    return itens.filter(i =>
      (f.entregues || i.situacao !== 'Entregue') &&
      (!q || [i.op_hrm, i.ns, i.po_item, i.pedido_omie, i.material, i.descricao, i.situacao_detalhe].join(' ').toLowerCase().includes(q)) &&
      (!f.dest || i.destino === f.dest) && (!f.coord || i.coordenador === f.coord) &&
      (!f.sit || (f.sit === '—' ? !i.situacao : i.situacao === f.sit)) &&
      (!f.atr || (folgaDe(i) ?? 1) < 0));
  }, [itens, f]);
  const kpi = useMemo(() => {
    const ativos = itens.filter(i => i.situacao !== 'Entregue');
    return {
      ativos: ativos.length,
      atrasados: ativos.filter(i => (folgaDe(i) ?? 1) < 0).length,
      coleta: ativos.filter(i => i.situacao === 'Ag. coleta / expedição').length,
      mp: ativos.filter(i => i.mp_obs && i.mp_obs.trim().toLowerCase() !== 'ok').length,
      semSit: ativos.filter(i => !i.situacao).length,
    };
  }, [itens]);

  if (!ok) return null;
  const itemAberto = aberto != null ? itens.find(i => i.id === aberto) || null : null;

  return (
    <div style={{ padding: '18px 16px 60px', color: C.texto }}>
      <style>{CSS + CSS_HRM}</style>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 12 }}>
        <div style={{ flex: '1 1 300px', minWidth: 0 }}>
          <h1 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: C.azul }}><i className="bi bi-table" /> Acompanhamento HRM</h1>
          <div style={{ fontSize: 12.5, color: C.cinza }}>A planilha SPR SJP / Taubaté no sistema — uma linha por item. {podeEditar ? 'Clique na célula para editar.' : 'Somente visualização.'}</div>
        </div>
        <button className="cp-btn" onClick={() => setManual(true)}><i className="bi bi-question-circle" />Como usar</button>
        {podeEditar && itens.length > 0 && <ApagarPlanilha total={itens.length} onApagado={async (t) => { await carregar(); mostrar(t); }} />}
        {podeEditar && <button className="cp-btn pri" onClick={() => setSubir(true)}><i className="bi bi-cloud-arrow-up" />Subir planilha</button>}
      </div>

      <div className="hr-kpis">
        <span><b>{kpi.ativos}</b> itens em aberto</span>
        <span style={{ color: C.vermelho }}><b>{kpi.atrasados}</b> atrasados</span>
        <span><b>{kpi.coleta}</b> aguardando coleta</span>
        <span style={{ color: C.laranja }}><b>{kpi.mp}</b> com MP pendente</span>
        {kpi.semSit > 0 && <span><b>{kpi.semSit}</b> sem situação</span>}
      </div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', margin: '10px 0' }}>
        <input className="cp-in" style={{ flex: '1 1 240px', maxWidth: 340 }} placeholder="Buscar OP, NS, PO, material, descrição…" value={f.q} onChange={e => setF({ ...f, q: e.target.value })} />
        <select className="cp-in" value={f.dest} onChange={e => setF({ ...f, dest: e.target.value })}><option value="">Todos os destinos</option>{destinos.map(d => <option key={d}>{d}</option>)}</select>
        <select className="cp-in" value={f.coord} onChange={e => setF({ ...f, coord: e.target.value })}><option value="">Todos os coordenadores</option>{COORDENADORES_HRM.map(d => <option key={d}>{d}</option>)}</select>
        <select className="cp-in" value={f.sit} onChange={e => setF({ ...f, sit: e.target.value })}><option value="">Todas as situações</option>{SITUACOES_HRM.map(d => <option key={d}>{d}</option>)}<option value="—">(sem situação)</option></select>
        <label style={{ display: 'flex', gap: 5, alignItems: 'center', fontSize: 13 }}><input type="checkbox" checked={f.atr} onChange={e => setF({ ...f, atr: e.target.checked })} />Só atrasados</label>
        <label style={{ display: 'flex', gap: 5, alignItems: 'center', fontSize: 13 }}><input type="checkbox" checked={f.entregues} onChange={e => setF({ ...f, entregues: e.target.checked })} />Mostrar entregues</label>
        <span style={{ fontSize: 12, color: C.cinza }}>{visiveis.length} na tela</span>
      </div>

      {erro && <div className="hr-erro">{erro}</div>}
      {carregando ? <div style={{ padding: 30, color: C.cinza }}>Carregando…</div> : !itens.length ? (
        <div className="hr-vazio">
          <i className="bi bi-file-earmark-spreadsheet" style={{ fontSize: 34, color: C.azul }} />
          <b>Nenhum item ainda.</b>
          <span>{podeEditar ? 'Clique em "Subir planilha" e escolha a planilha SPR SJP TAUBATE para trazer todos os itens. Antes de gravar você confere o que vai entrar.' : 'O PCP HRM ainda não subiu a planilha.'}</span>
        </div>
      ) : (
        <div className="hr-grid">
          <table>
            <thead>
              <tr className="hr-grp"><th className="hr-fix">Item</th><th colSpan={4}>Identificação</th><th colSpan={2}>Equipe</th><th colSpan={6}>Datas e prazos</th><th colSpan={3}>Situação</th><th colSpan={2}>MP e pintura</th><th>Etapas</th></tr>
              <tr>
                <th className="hr-fix">OP HRM / NS</th><th>PO + item</th><th>Material / descrição</th><th>Destino</th><th>Vendedor</th>
                <th>Coordenador</th><th>Caldeireiros</th>
                <th>Necessidade</th><th>Conf Delv</th><th>EXW</th><th>Prev. fatur.</th><th>Folga</th><th>Atraso</th>
                <th>Situação</th><th>Detalhe (Priorizar)</th><th>Último expedite</th>
                <th>MP</th><th>Tinta</th><th>Compra → Entrega</th>
              </tr>
            </thead>
            <tbody>
              {visiveis.map(it => <Linha key={it.id} it={it} edita={podeEditar} onCampo={salvarCampo} onEtapa={marcarEtapa} onAbrir={() => setAberto(it.id)} />)}
              {!visiveis.length && <tr><td colSpan={19} style={{ padding: 18, color: C.cinza }}>Nenhum item com esses filtros.</td></tr>}
            </tbody>
          </table>
        </div>
      )}

      {aviso && <div className="hr-toast">{aviso}</div>}
      {itemAberto && <Detalhe it={itemAberto} edita={podeEditar} onFechar={() => setAberto(null)} onCampo={salvarCampo} onEtapa={marcarEtapa} onItem={trocar} />}
      {manual && <Manual onFechar={() => setManual(false)} />}
      {subir && <SubirPlanilha onFechar={() => setSubir(false)} onGravado={async (t) => { setSubir(false); await carregar(); mostrar(t); }} />}
    </div>
  );
}

function Linha({ it, edita, onCampo, onEtapa, onAbrir }: {
  it: ItemHrm; edita: boolean; onCampo: (it: ItemHrm, campo: string, v: string) => void; onEtapa: (it: ItemHrm, c: string) => void; onAbrir: () => void;
}) {
  const fol = folgaDe(it), atr = atrasoDe(it), exw = exwDe(it);
  const ns = it.ns || nsDe(it.op_hrm, it.item);
  const feitas = ETAPAS_HRM.filter(e => it.etapas?.[e.codigo]?.ok).length;
  return (
    <tr>
      <td className="hr-fix">
        <button className="hr-link" onClick={onAbrir} title="Abrir o item (histórico, todos os campos, dados da planilha)">
          <b>{it.op_hrm || it.pedido_omie || '—'}</b>{it.item ? <span> · {it.item}</span> : null}
        </button>
        <div className="hr-sub">{ns || ''}</div>
        {it.pedido_id ? <a className="hr-sub" href={`/pedidos/${it.pedido_id}`} style={{ color: C.azul2 }}>ver pedido no sistema</a> : null}
      </td>
      <td><Entrada it={it} campo="po_item" edita={edita} onCampo={onCampo} largura={150} mono /></td>
      <td style={{ minWidth: 220, maxWidth: 300 }}><div className="hr-mono">{it.material || '—'}</div><div className="hr-desc">{it.descricao || ''}</div></td>
      <td><Entrada it={it} campo="destino" edita={edita} onCampo={onCampo} largura={110} /></td>
      <td><Entrada it={it} campo="vendedor" edita={edita} onCampo={onCampo} largura={90} /></td>
      <td><Escolha it={it} campo="coordenador" edita={edita} onCampo={onCampo} opcoes={COORDENADORES_HRM} largura={100} /></td>
      <td><Entrada it={it} campo="caldeireiros" edita={edita} onCampo={onCampo} largura={150} /></td>
      <td><Entrada it={it} campo="necessidade" edita={edita} onCampo={onCampo} tipo="date" /></td>
      <td><Entrada it={it} campo="conf_delv" edita={edita} onCampo={onCampo} tipo="date" /></td>
      <td className="hr-mono">{fmtDataHrm(exw)}</td>
      <td><Entrada it={it} campo="prev_faturamento" edita={edita} onCampo={onCampo} tipo="date" /></td>
      <td>{fol == null ? <span className="hr-sub">—</span> : <span className={`hr-pill ${fol < 0 ? 'bad' : fol <= 5 ? 'warn' : 'ok'}`}>{fol < 0 ? `${fol} d atrasado` : `+${fol} d`}</span>}</td>
      <td className="hr-mono" title="Prev. faturamento − Conf Delv">{atr == null ? '—' : atr}</td>
      <td><Escolha it={it} campo="situacao" edita={edita} onCampo={onCampo} opcoes={SITUACOES_HRM} largura={170} /></td>
      <td><Entrada it={it} campo="situacao_detalhe" edita={edita} onCampo={onCampo} largura={200} area /></td>
      <td style={{ minWidth: 220, maxWidth: 280 }}>
        <div className="hr-desc" title={it.expedite || ''}>{it.expedite ? (it.expedite.length > 120 ? it.expedite.slice(0, 120) + '…' : it.expedite) : <span className="hr-sub">—</span>}</div>
        <button className="hr-link" style={{ fontSize: 11.5 }} onClick={onAbrir}>{edita ? '+ registrar / histórico' : 'histórico'}</button>
      </td>
      <td style={{ maxWidth: 200 }}><MpPill t={it.mp_obs} /></td>
      <td><Entrada it={it} campo="tinta" edita={edita} onCampo={onCampo} largura={170} /><div className="hr-sub">Estoque: {it.tinta_estoque || '—'}</div></td>
      <td>
        <div className="hr-dots">
          {ETAPAS_HRM.map(e => {
            const et = it.etapas?.[e.codigo];
            return <button key={e.codigo} type="button" disabled={!edita} onClick={() => onEtapa(it, e.codigo)}
              className={`hr-dot ${et?.ok ? (et.origem === 'manual' ? 'mao' : 'on') : ''}`}
              title={`${e.nome}${et?.ok ? (et.origem === 'manual' ? ` · marcada à mão${et.por ? ' por ' + et.por : ''}` : ' · ok na planilha') : ''}`}
              aria-label={e.nome}>{et?.ok && et.origem === 'manual' ? '✋' : ''}</button>;
          })}
        </div>
        <div className="hr-sub">{feitas}/15</div>
      </td>
    </tr>
  );
}

// Célula editável: grava ao sair do campo (ou Enter).
function valorDe(it: ItemHrm, campo: string): string {
  const v = (it as unknown as Record<string, unknown>)[campo];
  return v == null ? '' : String(v);
}
function Entrada({ it, campo, edita, onCampo, tipo = 'text', largura = 118, mono, area }: {
  it: ItemHrm; campo: string; edita: boolean; onCampo: (it: ItemHrm, c: string, v: string) => void; tipo?: 'text' | 'date'; largura?: number; mono?: boolean; area?: boolean;
}) {
  const atual = valorDe(it, campo);
  const [v, setV] = useState(atual);
  useEffect(() => setV(atual), [atual]);
  if (!edita) return <span className={mono ? 'hr-mono' : ''}>{tipo === 'date' ? fmtDataHrm(atual || null) : atual || '—'}</span>;
  const salvar = () => { if (v !== atual) onCampo(it, campo, v); };
  const props = {
    className: `hr-cel${mono ? ' hr-mono' : ''}`, style: { width: largura }, value: v, 'aria-label': NOME_CAMPO_HRM[campo] || campo,
    onBlur: salvar,
  };
  if (area) return <textarea {...props} rows={2} onChange={e => setV(e.target.value)} />;
  return <input {...props} type={tipo} onChange={e => setV(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }} />;
}
function Escolha({ it, campo, edita, onCampo, opcoes, largura }: {
  it: ItemHrm; campo: string; edita: boolean; onCampo: (it: ItemHrm, c: string, v: string) => void; opcoes: readonly string[]; largura: number;
}) {
  const atual = valorDe(it, campo);
  if (!edita) return <span>{atual || '—'}</span>;
  const lista = atual && !opcoes.includes(atual) ? [atual, ...opcoes] : opcoes;
  return (
    <select className="hr-cel" style={{ width: largura }} value={atual} aria-label={NOME_CAMPO_HRM[campo] || campo} onChange={e => onCampo(it, campo, e.target.value)}>
      <option value="" />{lista.map(o => <option key={o}>{o}</option>)}
    </select>
  );
}
function MpPill({ t }: { t: string | null }) {
  if (!t) return <span className="hr-sub">—</span>;
  const l = t.toLowerCase();
  const c = l.trim() === 'ok' ? 'ok' : (l.includes('bloq') || l.includes('não chegou') || l.includes('nao chegou') || l.includes('urgente')) ? 'bad' : 'warn';
  return <span className={`hr-pill ${c}`} title={t} style={{ whiteSpace: 'normal' }}>{t.length > 60 ? t.slice(0, 60) + '…' : t}</span>;
}

// ── Detalhe: todos os campos + registrar expedite/ocorrência + histórico + linha original da planilha.
const TIPO_HIST: Record<string, string> = {
  expedite: 'Expedite', ocorrencia: 'Ocorrência', obs: 'Observação', alteracao: 'Alteração', etapa: 'Etapa',
  importacao: 'Importação', reprogramacao: 'Reprogramação do cliente', reuniao: 'Reunião com cliente',
};
function Detalhe({ it, edita, onFechar, onCampo, onEtapa, onItem }: {
  it: ItemHrm; edita: boolean; onFechar: () => void; onCampo: (it: ItemHrm, c: string, v: string) => void; onEtapa: (it: ItemHrm, c: string) => void; onItem: (it: ItemHrm) => void;
}) {
  const [hist, setHist] = useState<HistHrm[] | null>(null);
  const [tipo, setTipo] = useState<'expedite' | 'ocorrencia' | 'obs'>('expedite');
  const [texto, setTexto] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');
  const [verRaw, setVerRaw] = useState(false);
  useEffect(() => {
    api.get(`/api/hrm-acomp/${it.id}`).then(r => setHist(r.data.item.hist || [])).catch(() => setHist([]));
  }, [it.id, it.atualizado_em]);
  async function registrar() {
    if (!texto.trim()) return;
    setSalvando(true); setErro('');
    try {
      const r = await postIdempotente<{ item: ItemHrm }>(`/api/hrm-acomp/${it.id}`, { acao: 'registrar', tipo, texto: texto.trim() });
      onItem(r.item); setHist(r.item.hist || []); setTexto('');
    } catch (e) { setErro(erroDe(e, 'Não salvou.')); } finally { setSalvando(false); }
  }
  const campos: [string, 'text' | 'date'][] = [
    ['po_item', 'text'], ['destino', 'text'], ['vendedor', 'text'], ['caldeireiros', 'text'],
    ['necessidade', 'date'], ['conf_delv', 'date'], ['prev_faturamento', 'date'], ['prev_final', 'date'], ['finalizado_em', 'date'],
    ['prioridade', 'text'], ['prioridade_skid', 'text'], ['seq_cliente', 'text'], ['seq_oss', 'text'],
    ['tinta', 'text'], ['tinta_qtd', 'text'], ['tinta_estoque', 'text'], ['mp_obs', 'text'], ['obs', 'text'],
  ];
  return (
    <Modal largura={980} onFechar={onFechar} titulo={<>{it.op_hrm ? `OP ${it.op_hrm}` : `Pedido ${it.pedido_omie || '—'}`}{it.item ? ` · item ${it.item}` : ''} <span style={{ color: C.cinza, fontWeight: 600, fontSize: 13 }}>{it.material} — {it.descricao}</span></>}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 18 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, minWidth: 0 }}>
          <div className="hr-box">
            <div className="hr-tit">Situação</div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <Escolha it={it} campo="situacao" edita={edita} onCampo={onCampo} opcoes={SITUACOES_HRM} largura={220} />
              <Escolha it={it} campo="coordenador" edita={edita} onCampo={onCampo} opcoes={COORDENADORES_HRM} largura={120} />
            </div>
            <Entrada it={it} campo="situacao_detalhe" edita={edita} onCampo={onCampo} largura={420} area />
          </div>
          <div className="hr-box">
            <div className="hr-tit">Campos</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 8 }}>
              {campos.map(([c, t]) => (
                <label key={c} style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
                  <span className="hr-rot">{NOME_CAMPO_HRM[c]}</span>
                  <Entrada it={it} campo={c} edita={edita} onCampo={onCampo} tipo={t} largura={150} />
                </label>
              ))}
            </div>
          </div>
          <div className="hr-box">
            <div className="hr-tit">Etapas</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(170px, 1fr))', gap: 6 }}>
              {ETAPAS_HRM.map(e => {
                const et = it.etapas?.[e.codigo];
                return (
                  <label key={e.codigo} style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 13 }}>
                    <input type="checkbox" checked={!!et?.ok} disabled={!edita} onChange={() => onEtapa(it, e.codigo)} />
                    {e.nome}{et?.ok && <span className="hr-sub">{et.origem === 'manual' ? '✋ à mão' : 'planilha'}</span>}
                  </label>
                );
              })}
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, minWidth: 0 }}>
          {edita && (
            <div className="hr-box">
              <div className="hr-tit">Registrar</div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {(['expedite', 'ocorrencia', 'obs'] as const).map(t => (
                  <button key={t} className={`cp-btn ${tipo === t ? 'pri' : ''}`} style={{ padding: '4px 10px' }} onClick={() => setTipo(t)}>{TIPO_HIST[t]}</button>
                ))}
              </div>
              <textarea className="cp-in" rows={3} value={texto} onChange={e => setTexto(e.target.value)} placeholder={tipo === 'expedite' ? 'Ex.: Ag. coleta do cliente, book aprovado em 29/09' : tipo === 'ocorrencia' ? 'Ex.: demora do cliente na aprovação do book' : 'Observação'} />
              {erro && <div style={{ color: C.vermelho, fontSize: 12.5 }}>{erro}</div>}
              <div><button className="cp-btn pri" disabled={salvando || !texto.trim()} onClick={registrar}>{salvando ? 'Salvando…' : 'Registrar (entra com data e seu nome)'}</button></div>
            </div>
          )}
          <div className="hr-box">
            <div className="hr-tit">Histórico</div>
            {hist == null ? <span className="hr-sub">Carregando…</span> : !hist.length ? <span className="hr-sub">Sem registros.</span> : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 380, overflowY: 'auto' }}>
                {hist.map(h => (
                  <div key={h.id} style={{ borderLeft: `3px solid ${h.tipo === 'expedite' ? C.azul2 : h.tipo === 'ocorrencia' ? C.laranja : h.tipo === 'reuniao' || h.tipo === 'reprogramacao' ? C.roxo : C.borda}`, paddingLeft: 8 }}>
                    <div className="hr-sub">{new Date(h.criado_em).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })} · {TIPO_HIST[h.tipo] || h.tipo} · {h.usuario_nome || '—'}{h.origem === 'planilha' ? ' · via planilha' : ''}</div>
                    <div style={{ fontSize: 13, whiteSpace: 'pre-wrap' }}>{h.texto}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
          {it.planilha_raw && (
            <div className="hr-box">
              <button className="hr-link" onClick={() => setVerRaw(v => !v)}>{verRaw ? '▾' : '▸'} Linha original da planilha (todas as colunas)</button>
              {verRaw && (
                <table className="hr-raw"><tbody>
                  {Object.entries(it.planilha_raw).map(([k, v]) => <tr key={k}><th>{k}</th><td>{String(v)}</td></tr>)}
                </tbody></table>
              )}
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}

// ── Manual rápido (botão "Como usar"). Mesmo texto entregue ao usuário em 30/09.
const MANUAL: { t: string; passos: string[] }[] = [
  { t: '1. Trazer a planilha pro sistema (primeira vez e sempre que quiser atualizar)', passos: [
    'Salve a sua planilha SPR SJP TAUBATE normalmente no Excel.',
    'Aqui, clique em "Subir planilha" → "Escolher planilha" e escolha o arquivo.',
    'Confira a prévia: quantos itens são novos, o que vai mudar (valor antigo → novo) e o que está igual. Nada foi gravado ainda.',
    'Estando certo, clique em "Confirmar e gravar".',
    'Pode subir quantas vezes quiser. Célula vazia não apaga nada, linha que você tirou da planilha não é apagada, e a linha original fica guardada no item.',
  ] },
  { t: '2. Atualizar direto na tela (sem planilha)', passos: [
    'Clique na célula (PO, destino, coordenador, caldeireiros, datas, situação, detalhe, tinta), altere e saia do campo ou aperte Enter. Grava sozinho.',
    'Situação: escolha na lista. O texto livre (o antigo "Priorizar") vai em "Detalhe".',
  ] },
  { t: '3. Registrar expedite, ocorrência ou observação', passos: [
    'Clique no nº da OP (1ª coluna) ou em "+ registrar / histórico".',
    'Escolha Expedite, Ocorrência ou Observação, escreva e clique em "Registrar". Entra com a data e o seu nome, sem precisar digitar a data.',
    'Tudo fica no Histórico do item, inclusive o que veio da planilha ("via planilha").',
  ] },
  { t: '4. Marcar etapas', passos: [
    'Os 15 quadradinhos vão de Compra até Entrega ou Coleta. Verde = ok na planilha, ✋ = marcada à mão.',
    'Clique no quadradinho pra marcar ou desmarcar (ou use as caixinhas no detalhe do item).',
  ] },
  { t: '5. Encontrar o que precisa', passos: [
    'Busca: OP, NS, PO, material ou descrição.',
    'Filtros: destino, coordenador (Cleber/Hermes), situação, "Só atrasados" e "Mostrar entregues" (entregues ficam escondidos por padrão).',
    'Folga vermelha = atrasado (necessidade − 10 dias − prev. faturamento). EXW = Conf Delv − 12 dias.',
  ] },
  { t: '6. Ver tudo de um item', passos: [
    'Clique no nº da OP: todos os campos, etapas, histórico e a "Linha original da planilha" com todas as colunas.',
    '"ver pedido no sistema" abre a OP já lançada (quando existe).',
  ] },
  { t: '7. Apagar a planilha (recomeçar do zero)', passos: [
    'Clique em "Apagar planilha", digite APAGAR e confirme. Sai tudo que veio da planilha, com o histórico — não mexe em nenhuma OP de produção.',
    'Depois é só subir a planilha de novo.',
  ] },
  { t: '8. Pela tela Anexar OP', passos: [
    'O quadro "Planilha de acompanhamento" tem os mesmos botões: Subir planilha, Abrir acompanhamento e Apagar planilha.',
    'Em "Anexadas aguardando Conferência" dá pra excluir uma OP anexada errado, enquanto ela ainda não foi conferida.',
  ] },
  { t: 'Dúvida ou algo estranho', passos: ['Anote o nº da OP e o que aconteceu e avise o PCP/TI.'] },
];
function Manual({ onFechar }: { onFechar: () => void }) {
  return (
    <Modal largura={760} onFechar={onFechar} titulo="Como usar o Acompanhamento HRM" rodape={<button className="cp-btn pri" onClick={onFechar}>Entendi</button>}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14, fontSize: 13.5, lineHeight: 1.5 }}>
        {MANUAL.map(s => (
          <div key={s.t}>
            <div style={{ fontWeight: 800, color: C.azul, marginBottom: 4 }}>{s.t}</div>
            <ul style={{ margin: 0, paddingLeft: 20, display: 'flex', flexDirection: 'column', gap: 3 }}>{s.passos.map(p => <li key={p}>{p}</li>)}</ul>
          </div>
        ))}
      </div>
    </Modal>
  );
}

