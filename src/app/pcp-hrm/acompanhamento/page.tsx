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
import { lerPlanilhaHrm, type LeituraPlanilha } from './importar';

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

// ── Subir planilha: lê no navegador → prévia (nada gravado) → confirma.
interface Previa {
  novos: { chave: string; rotulo: string }[]; alterados: { chave: string; rotulo: string; mudancas: { nome: string; antes: string | null; depois: string | null }[] }[];
  total_alterados: number; iguais: number; total: number; extras_novos: number; extras_sem_linha: string[];
}
function SubirPlanilha({ onFechar, onGravado }: { onFechar: () => void; onGravado: (t: string) => void }) {
  const [lendo, setLendo] = useState(false);
  const [leitura, setLeitura] = useState<LeituraPlanilha | null>(null);
  const [previa, setPrevia] = useState<Previa | null>(null);
  const [erro, setErro] = useState('');
  const [gravando, setGravando] = useState(false);
  const [nomeArq, setNomeArq] = useState('');

  async function escolher(arq: File) {
    setErro(''); setPrevia(null); setLeitura(null); setLendo(true); setNomeArq(arq.name);
    try {
      const l = await lerPlanilhaHrm(arq);
      setLeitura(l);
      const r = await api.post('/api/hrm-acomp/importar', { modo: 'previa', linhas: l.linhas, extras: l.extras });
      setPrevia(r.data);
    } catch (e) { setErro(e instanceof Error && !(e as { response?: unknown }).response ? e.message : erroDe(e, 'Não consegui ler a planilha.')); }
    finally { setLendo(false); }
  }
  async function gravar() {
    if (!leitura) return;
    setGravando(true); setErro('');
    try {
      const r = await api.post('/api/hrm-acomp/importar', { modo: 'gravar', linhas: leitura.linhas, extras: leitura.extras });
      const d = r.data as Previa;
      onGravado(`Planilha gravada: ${d.novos.length} novos, ${d.total_alterados} atualizados, ${d.iguais} sem mudança.`);
    } catch (e) { setErro(erroDe(e, 'Não gravou — nada foi alterado. Tente de novo.')); setGravando(false); }
  }
  const nada = previa && !previa.novos.length && !previa.total_alterados && !previa.extras_novos;
  return (
    <Modal largura={860} onFechar={onFechar} titulo="Subir planilha de acompanhamento"
      rodape={<>
        <button className="cp-btn" onClick={onFechar}>Cancelar</button>
        {previa && !nada && <button className="cp-btn ok" disabled={gravando} onClick={gravar}>{gravando ? 'Gravando…' : 'Confirmar e gravar'}</button>}
      </>}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, fontSize: 13.5 }}>
        <p style={{ margin: 0, color: C.cinza }}>
          Escolha a planilha SPR SJP TAUBATE (.xlsx). O sistema lê e mostra antes o que vai mudar — nada é gravado sem você confirmar.
          Célula vazia não apaga nada, linha que saiu da planilha não é apagada, e a linha original inteira fica guardada no item.
        </p>
        <label className="cp-btn" style={{ alignSelf: 'flex-start' }}>
          <i className="bi bi-file-earmark-excel" />{nomeArq ? 'Escolher outra planilha' : 'Escolher planilha'}
          <input type="file" accept=".xlsx,.xlsm,.xls" hidden onChange={e => { const a = e.target.files?.[0]; if (a) escolher(a); e.target.value = ''; }} />
        </label>
        {nomeArq && <div className="hr-sub">{nomeArq}{leitura ? ` · aba "${leitura.aba}" · ${leitura.linhas.length} linhas lidas` : ''}</div>}
        {lendo && <div>Lendo a planilha…</div>}
        {erro && <div className="hr-erro">{erro}</div>}
        {leitura?.avisos.map(a => <div key={a} className="hr-aviso">{a}</div>)}
        {previa && (
          <>
            <div className="hr-kpis">
              <span style={{ color: C.verde }}><b>{previa.novos.length}</b> novos</span>
              <span style={{ color: C.azul2 }}><b>{previa.total_alterados}</b> com mudança</span>
              <span><b>{previa.iguais}</b> sem mudança</span>
              <span style={{ color: C.roxo }}><b>{previa.extras_novos}</b> registros de reprogramação/reunião</span>
            </div>
            {nada && <div className="hr-aviso">A planilha está igual ao sistema — não há nada para gravar.</div>}
            {previa.alterados.length > 0 && (
              <div className="hr-box" style={{ maxHeight: 300, overflowY: 'auto' }}>
                <div className="hr-tit">O que vai mudar</div>
                {previa.alterados.map(a => (
                  <div key={a.chave} style={{ padding: '4px 0', borderBottom: `1px dashed ${C.borda}` }}>
                    <b>{a.rotulo}</b>
                    {a.mudancas.map((m, i) => <div key={i} className="hr-sub" style={{ color: C.texto }}>{m.nome}: <s style={{ color: C.fraco }}>{m.antes ?? '—'}</s> → <b>{(m.depois ?? '—').slice(0, 140)}</b></div>)}
                  </div>
                ))}
                {previa.total_alterados > previa.alterados.length && <div className="hr-sub">… e mais {previa.total_alterados - previa.alterados.length}</div>}
              </div>
            )}
            {previa.novos.length > 0 && (
              <details className="hr-box"><summary style={{ cursor: 'pointer', fontWeight: 700 }}>{previa.novos.length} linhas novas</summary>
                <div style={{ maxHeight: 220, overflowY: 'auto', marginTop: 6 }}>{previa.novos.map(n => <div key={n.chave} className="hr-sub" style={{ color: C.texto }}>{n.rotulo || n.chave}</div>)}</div>
              </details>
            )}
            {previa.extras_sem_linha.length > 0 && (
              <details className="hr-box"><summary style={{ cursor: 'pointer', fontWeight: 700, color: C.laranja }}>{previa.extras_sem_linha.length} registros de reprogramação/reunião sem linha correspondente (não entram)</summary>
                <div style={{ maxHeight: 180, overflowY: 'auto', marginTop: 6 }}>{previa.extras_sem_linha.map((n, i) => <div key={i} className="hr-sub">{n}</div>)}</div>
              </details>
            )}
          </>
        )}
      </div>
    </Modal>
  );
}

const CSS_HRM = `
  .hr-kpis{display:flex;flex-wrap:wrap;gap:16px;font-size:13px;color:${C.cinza}}
  .hr-kpis b{font-size:16px;margin-right:3px;font-variant-numeric:tabular-nums}
  .hr-grid{overflow:auto;max-height:calc(100vh - 230px);border:1px solid ${C.borda};border-radius:10px;background:#fff}
  .hr-grid table{border-collapse:separate;border-spacing:0;font-size:12.5px;min-width:2300px}
  .hr-grid th,.hr-grid td{border-bottom:1px solid ${C.borda};border-right:1px solid ${C.borda};padding:5px 7px;vertical-align:top;text-align:left}
  .hr-grid thead th{position:sticky;top:0;z-index:2;background:#eef2f7;font-size:10.5px;text-transform:uppercase;letter-spacing:.3px;color:${C.cinza};white-space:nowrap}
  .hr-grid thead tr.hr-grp th{top:0;background:#e2e8f0;color:${C.azul};font-size:12px;text-transform:none;text-align:center}
  .hr-grid thead tr:nth-child(2) th{top:27px}
  .hr-grid .hr-fix{position:sticky;left:0;background:#fff;z-index:1;min-width:150px}
  .hr-grid thead .hr-fix{z-index:3;background:#eef2f7}
  .hr-grid tbody tr:hover td{background:#f8fafc}
  .hr-cel{font:inherit;font-size:12.5px;border:1px solid transparent;background:transparent;color:${C.texto};padding:2px 4px;border-radius:4px;max-width:100%}
  .hr-cel:hover{border-color:${C.borda}} .hr-cel:focus{border-color:${C.azul};background:#fff;outline:none}
  textarea.hr-cel{resize:vertical;min-height:34px}
  .hr-mono{font-family:Consolas,monospace;font-size:11.5px}
  .hr-desc{font-size:12px;line-height:1.35}
  .hr-sub{font-size:11px;color:${C.fraco};display:block}
  .hr-link{background:none;border:0;padding:0;color:${C.azul};cursor:pointer;font:inherit;text-align:left}
  .hr-link:hover{text-decoration:underline}
  .hr-pill{display:inline-block;font-size:11px;font-weight:700;padding:1px 7px;border-radius:9px;white-space:nowrap}
  .hr-pill.ok{background:#dcfce7;color:#166534} .hr-pill.warn{background:#fef3c7;color:#92400e} .hr-pill.bad{background:#fee2e2;color:#991b1b}
  .hr-dots{display:grid;grid-template-columns:repeat(15,15px);gap:2px}
  .hr-dot{width:15px;height:15px;border-radius:3px;border:1px solid ${C.borda};background:#f8fafc;padding:0;font-size:8px;line-height:13px;cursor:pointer}
  .hr-dot:disabled{cursor:default}
  .hr-dot.on{background:${C.verde};border-color:${C.verde}} .hr-dot.mao{background:#fef3c7;border-color:${C.laranja}}
  .hr-box{border:1px solid ${C.borda};border-radius:10px;padding:10px 12px;display:flex;flex-direction:column;gap:8px;background:#fff}
  .hr-tit{font-weight:800;color:${C.azul};font-size:13px}
  .hr-rot{font-size:10.5px;font-weight:700;color:${C.cinza};text-transform:uppercase;letter-spacing:.3px}
  .hr-raw{border-collapse:collapse;font-size:11.5px;width:100%} .hr-raw th{text-align:left;color:${C.cinza};font-weight:600;padding:2px 6px 2px 0;vertical-align:top;white-space:nowrap} .hr-raw td{padding:2px 0;word-break:break-word}
  .hr-vazio{display:flex;flex-direction:column;align-items:center;gap:8px;text-align:center;padding:50px 20px;border:2px dashed ${C.borda};border-radius:12px;color:${C.cinza};max-width:560px;margin:20px auto}
  .hr-erro{background:#fee2e2;color:#991b1b;padding:8px 12px;border-radius:8px;font-size:13px}
  .hr-aviso{background:#fef3c7;color:#92400e;padding:8px 12px;border-radius:8px;font-size:13px}
  .hr-toast{position:fixed;bottom:20px;left:50%;transform:translateX(-50%);background:${C.azul};color:#fff;padding:10px 18px;border-radius:10px;font-size:13.5px;z-index:1000;box-shadow:0 6px 20px rgba(0,0,0,.2)}
`;
