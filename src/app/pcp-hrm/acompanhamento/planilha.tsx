'use client';
// Peças da planilha de acompanhamento usadas em DUAS telas: Acompanhamento HRM
// (/pcp-hrm/acompanhamento) e Anexar OP (/pcp-hrm). Subir planilha (prévia →
// confirma) e Apagar planilha (tira tudo o que veio da planilha, pra recomeçar).
import { useEffect, useState } from 'react';
import api from '@/lib/api';
import { C, CSS, Modal, erroDe } from '../../cald-plano/comum';
import { lerPlanilhaHrm, type LeituraPlanilha } from './importar';

// ── Subir planilha: lê no navegador → prévia (nada gravado) → confirma.
interface Previa {
  novos: { chave: string; rotulo: string }[]; alterados: { chave: string; rotulo: string; mudancas: { nome: string; antes: string | null; depois: string | null }[] }[];
  total_alterados: number; iguais: number; total: number; extras_novos: number; extras_sem_linha: string[];
}
export function SubirPlanilha({ onFechar, onGravado }: { onFechar: () => void; onGravado: (t: string) => void }) {
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

export const CSS_HRM = `
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

// ── Apagar planilha: tira TODAS as linhas que vieram da planilha (e o histórico
// delas) pra recomeçar do zero. Não mexe em OP/pedido de produção. Pede pra
// digitar APAGAR (evita clique errado).
export function ApagarPlanilha({ total, onApagado }: { total: number; onApagado: (t: string) => void }) {
  const [aberto, setAberto] = useState(false);
  const [txt, setTxt] = useState('');
  const [apagando, setApagando] = useState(false);
  const [erro, setErro] = useState('');
  async function apagar() {
    setApagando(true); setErro('');
    try {
      const r = await api.delete('/api/hrm-acomp', { data: { confirmar: 'APAGAR' } });
      setAberto(false); setTxt('');
      onApagado(`Planilha apagada do sistema (${r.data.apagados} linhas). Pode subir de novo quando quiser.`);
    } catch (e) { setErro(erroDe(e, 'Não consegui apagar. Tente de novo.')); }
    finally { setApagando(false); }
  }
  return (
    <>
      <button className="cp-btn" style={{ color: C.vermelho, borderColor: '#fca5a5' }} onClick={() => { setAberto(true); setTxt(''); setErro(''); }}>
        <i className="bi bi-trash" />Apagar planilha
      </button>
      {aberto && (
        <Modal largura={520} titulo="Apagar a planilha do sistema" onFechar={() => setAberto(false)}
          rodape={<>
            <button className="cp-btn" onClick={() => setAberto(false)}>Cancelar</button>
            <button className="cp-btn" style={{ background: C.vermelho, borderColor: C.vermelho, color: '#fff' }} disabled={txt.trim().toUpperCase() !== 'APAGAR' || apagando} onClick={apagar}>
              {apagando ? 'Apagando…' : `Apagar ${total} linhas`}
            </button>
          </>}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, fontSize: 13.5 }}>
            <p style={{ margin: 0 }}>Isso tira do sistema <b>as {total} linhas</b> do acompanhamento que vieram da planilha, junto com o histórico delas (expedites, ocorrências e o que foi editado na tela).</p>
            <p style={{ margin: 0, color: C.cinza }}>Não mexe em nenhuma OP nem pedido de produção. A sua planilha no computador continua igual — depois é só subir de novo.</p>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: C.cinza }}>Para confirmar, digite APAGAR</span>
              <input className="cp-in" value={txt} onChange={e => setTxt(e.target.value)} autoFocus />
            </label>
            {erro && <div className="hr-erro">{erro}</div>}
          </div>
        </Modal>
      )}
    </>
  );
}

// ── Quadro da planilha na tela Anexar OP (porta de entrada do Alan): quantas
// linhas estão no sistema + Subir / Abrir acompanhamento / Apagar.
export function PainelPlanilhaHrm() {
  const [total, setTotal] = useState<number | null>(null);
  const [subir, setSubir] = useState(false);
  const [msg, setMsg] = useState('');
  const carregar = async () => {
    try { const r = await api.get('/api/hrm-acomp'); setTotal((r.data.itens || []).length); } catch { setTotal(null); }
  };
  useEffect(() => { carregar(); }, []);
  const aviso = async (t: string) => { await carregar(); setMsg(t); };
  return (
    <div style={{ background: '#fff', border: `1px solid ${C.borda}`, borderRadius: 10, padding: '16px 20px', flex: '1 1 480px', minWidth: 0 }}>
      <style>{CSS + CSS_HRM}</style>
      <div style={{ fontSize: 13, fontWeight: 700, color: C.azul, textTransform: 'uppercase', letterSpacing: .5, marginBottom: 4 }}>
        <i className="bi bi-file-earmark-spreadsheet" style={{ marginRight: 6 }} />Planilha de acompanhamento (SPR SJP / Taubaté)
      </div>
      <div style={{ fontSize: 13.5, color: C.cinza, marginBottom: 12 }}>
        {total == null ? 'Carregando…' : total ? `${total} linhas da planilha estão no sistema.` : 'Nenhuma planilha no sistema ainda.'} Suba a planilha sempre que quiser atualizar — antes de gravar você confere o que muda.
      </div>
      {msg && <div style={{ fontSize: 12.5, color: C.azul, background: '#eff6ff', borderRadius: 6, padding: '6px 10px', marginBottom: 8 }}>{msg}</div>}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', fontSize: 14 }}>
        <button className="cp-btn pri" style={{ padding: '10px 16px', fontSize: 14 }} onClick={() => { setSubir(true); setMsg(''); }}><i className="bi bi-cloud-arrow-up" />Subir planilha</button>
        <a className="cp-btn" href="/pcp-hrm/acompanhamento" style={{ textDecoration: 'none', padding: '10px 16px', fontSize: 14 }}><i className="bi bi-table" />Abrir acompanhamento</a>
        {!!total && <ApagarPlanilha total={total} onApagado={aviso} />}
      </div>
      {subir && <SubirPlanilha onFechar={() => setSubir(false)} onGravado={async (t) => { setSubir(false); await aviso(t); }} />}
    </div>
  );
}
