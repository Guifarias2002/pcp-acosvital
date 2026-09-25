'use client';
import { useMemo, useState } from 'react';
import api, { postIdempotente } from '@/lib/api';
import { pendenciasItem, MOTIVO_TXT, hojeISO, fmtData, somarDias, type ItemCald, type Pendencia, type MotivoPend } from '@/lib/caldPlano';
import { C, Modal, Chip, nomeArea, fmtQtd, erroDe } from './comum';

// Caixa de pendências do PCP Caldeiraria: tudo que tem PRAZO VENCIDO vira uma
// "mensagem". Pra cada uma o coordenador escolhe como resolver: nova data,
// cobrar alguém (com data de retorno), abrir o pedido ou finalizar. Cobrado com
// retorno no futuro vai pra "Cobrados — aguardando" até o retorno vencer.
// Imprimir = lista em papel com coluna em branco pra anotar a ação.

type Aba = 'pendentes' | 'aguardando';

export default function CaixaPendencias({ itens, podePlanejar, onFechar, onAbrirItem, onAtualizado }: {
  itens: ItemCald[];
  podePlanejar: boolean;
  onFechar: () => void;
  onAbrirItem: (it: ItemCald) => void;
  onAtualizado: (it: ItemCald) => void;
}) {
  const hoje = hojeISO();
  const [aba, setAba] = useState<Aba>('pendentes');
  const [acao, setAcao] = useState<{ id: number; tipo: 'data' | 'cobrar' } | null>(null);
  const [datas, setDatas] = useState<Partial<Record<MotivoPend, string>>>({});
  const [cob, setCob] = useState({ quem: '', mensagem: '', retorno: somarDias(hoje, 2) });
  const [salvando, setSalvando] = useState(false);
  const [msg, setMsg] = useState<{ id: number; ok: boolean; txt: string } | null>(null);

  const todas = useMemo(() => itens.map(i => pendenciasItem(i, hoje)).filter(Boolean) as Pendencia[], [itens, hoje]);
  const pendentes = todas.filter(p => !p.aguardandoCobranca).sort((a, b) => b.maiorAtraso - a.maiorAtraso);
  const aguardando = todas.filter(p => p.aguardandoCobranca).sort((a, b) => (a.item.cobranca?.retorno || '').localeCompare(b.item.cobranca?.retorno || ''));
  const lista = aba === 'pendentes' ? pendentes : aguardando;

  function abrirAcao(p: Pendencia, tipo: 'data' | 'cobrar') {
    setMsg(null);
    if (acao?.id === p.item.id && acao.tipo === tipo) { setAcao(null); return; }
    setAcao({ id: p.item.id, tipo });
    if (tipo === 'data') setDatas(Object.fromEntries(p.motivos.map(m => [m.motivo, ''])));
    else setCob({ quem: p.item.cobranca?.quem || '', mensagem: '', retorno: somarDias(hoje, 2) });
  }

  async function salvarDatas(p: Pendencia) {
    const it = p.item;
    const body: Record<string, unknown> = {};
    if (datas.prazo_entrega) body.prazo_entrega = datas.prazo_entrega;
    if (datas.prev_finalizacao) body.prev_finalizacao = datas.prev_finalizacao;
    if (datas.area || datas.terceiro) {
      body.etapas = it.etapas.filter(e => e.area === it.area_atual).map(e => ({
        ...e,
        previsao: datas.area || e.previsao,
        retorno_previsto: datas.terceiro || e.retorno_previsto,
      }));
    }
    if (!Object.keys(body).length) { setMsg({ id: it.id, ok: false, txt: 'Escolha pelo menos uma nova data.' }); return; }
    setSalvando(true);
    try {
      const r = await api.patch(`/api/cald-plano/${it.id}`, body);
      onAtualizado(r.data.item); setAcao(null);
      setMsg({ id: it.id, ok: true, txt: 'Nova data salva.' });
    } catch (e) { setMsg({ id: it.id, ok: false, txt: erroDe(e, 'Não foi possível salvar.') }); }
    finally { setSalvando(false); }
  }

  async function salvarCobranca(p: Pendencia) {
    if (!cob.quem.trim() && !cob.mensagem.trim()) { setMsg({ id: p.item.id, ok: false, txt: 'Diga quem foi cobrado ou o que foi cobrado.' }); return; }
    setSalvando(true);
    try {
      const r = await postIdempotente<{ item: ItemCald }>(`/api/cald-plano/${p.item.id}`, { acao: 'cobrar', quem: cob.quem, mensagem: cob.mensagem, retorno: cob.retorno || null });
      onAtualizado(r.item); setAcao(null);
      setMsg({ id: p.item.id, ok: true, txt: cob.retorno ? `Cobrado — aguardando até ${fmtData(cob.retorno)}.` : 'Cobrança registrada.' });
    } catch (e) { setMsg({ id: p.item.id, ok: false, txt: erroDe(e, 'Não foi possível registrar.') }); }
    finally { setSalvando(false); }
  }

  async function finalizar(p: Pendencia) {
    if (!confirm(`Finalizar "${p.item.material}" do pedido ${p.item.pedido} hoje?`)) return;
    setSalvando(true);
    try {
      const r = await postIdempotente<{ item: ItemCald }>(`/api/cald-plano/${p.item.id}`, { acao: 'finalizar' });
      onAtualizado(r.item);
    } catch (e) { setMsg({ id: p.item.id, ok: false, txt: erroDe(e, 'Não foi possível finalizar.') }); }
    finally { setSalvando(false); }
  }

  function imprimir() {
    const esc = (s: string) => s.replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]!));
    const linhas = lista.map(p => `
      <tr>
        <td><b>${esc(p.item.pedido)}</b></td>
        <td>${esc(p.item.material)}<br><small>${esc(fmtQtd(p.item.quantidade, p.item.unidade))}${p.item.cliente ? ' · ' + esc(p.item.cliente) : ''}</small></td>
        <td>${esc(p.item.status === 'andamento' ? nomeArea(p.item.area_atual) : 'A planejar')}</td>
        <td>${p.motivos.map(m => `${esc(MOTIVO_TXT[m.motivo])}: <b>${fmtData(m.data)}</b> (${m.dias}d)`).join('<br>')}</td>
        <td>${p.item.cobranca ? `${esc(p.item.cobranca.quem || '')} ${p.item.cobranca.retorno ? '· até ' + fmtData(p.item.cobranca.retorno) : ''}` : '—'}</td>
        <td class="anot"></td>
      </tr>`).join('');
    const w = window.open('', '_blank');
    if (!w) return;
    w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Pendências Caldeiraria ${fmtData(hoje)}</title>
      <style>body{font-family:Arial,sans-serif;margin:18px;color:#1e293b}h2{margin:0 0 4px;color:#1a3a5c}p{margin:0 0 12px;color:#64748b;font-size:12px}
      table{width:100%;border-collapse:collapse;font-size:12px}th,td{border:1px solid #cbd5e1;padding:6px;vertical-align:top;text-align:left}
      th{background:#f1f5f9;font-size:11px;text-transform:uppercase}td.anot{width:22%;height:38px}small{color:#64748b}</style></head>
      <body onload="window.print()"><h2>🏗 Caldeiraria — ${aba === 'pendentes' ? 'Pendências (prazo vencido)' : 'Cobrados — aguardando retorno'}</h2>
      <p>${lista.length} item(ns) · impresso em ${fmtData(hoje)}</p>
      <table><thead><tr><th>Pedido</th><th>Material</th><th>Onde está</th><th>O que venceu</th><th>Última cobrança</th><th>Ação / responsável / nova data</th></tr></thead>
      <tbody>${linhas || '<tr><td colspan="6">Nada pendente.</td></tr>'}</tbody></table></body></html>`);
    w.document.close();
  }

  return (
    <Modal
      largura={980}
      onFechar={onFechar}
      titulo={<><i className="bi bi-inbox-fill" style={{ marginRight: 8, color: C.vermelho }} />Caixa de pendências — prazos vencidos</>}
      rodape={<>
        <button className="cp-btn" onClick={imprimir} disabled={!lista.length}><i className="bi bi-printer" />Imprimir lista</button>
        <button className="cp-btn pri" onClick={onFechar}>Fechar</button>
      </>}
    >
      <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
        <button className={`cp-tab ${aba === 'pendentes' ? 'on' : ''}`} onClick={() => setAba('pendentes')}>
          <i className="bi bi-exclamation-octagon" />Pendentes <Chip cor="#fff" bg={pendentes.length ? C.vermelho : '#cbd5e1'}>{pendentes.length}</Chip>
        </button>
        <button className={`cp-tab ${aba === 'aguardando' ? 'on' : ''}`} onClick={() => setAba('aguardando')}>
          <i className="bi bi-hourglass-split" />Cobrados — aguardando <Chip cor="#fff" bg={aguardando.length ? C.laranja : '#cbd5e1'}>{aguardando.length}</Chip>
        </button>
      </div>
      {!podePlanejar && <p style={{ fontSize: 12.5, color: C.cinza, margin: '0 0 10px' }}>Somente leitura — quem resolve é o PCP da Caldeiraria.</p>}

      {!lista.length && (
        <div style={{ textAlign: 'center', padding: 30, color: C.fraco }}>
          <i className="bi bi-check2-circle" style={{ fontSize: 30, color: C.verde }} />
          <p style={{ margin: '8px 0 0' }}>{aba === 'pendentes' ? 'Nenhum prazo vencido. 👍' : 'Nenhuma cobrança aguardando retorno.'}</p>
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {lista.map(p => {
          const it = p.item;
          const aberta = acao?.id === it.id;
          return (
            <div key={it.id} style={{ border: `1.5px solid ${p.maiorAtraso > 7 ? '#fecaca' : C.borda}`, borderLeft: `5px solid ${aba === 'pendentes' ? C.vermelho : C.laranja}`, borderRadius: 10, padding: '10px 12px', background: '#fff' }}>
              <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', flexWrap: 'wrap' }}>
                <div style={{ flex: '1 1 300px', minWidth: 0 }}>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                    <b style={{ color: C.azul, fontSize: 14 }}>Pedido {it.pedido}</b>
                    <span style={{ fontSize: 13, fontWeight: 600, color: C.texto }}>{it.material}</span>
                    <span style={{ fontSize: 12, color: C.cinza }}>{fmtQtd(it.quantidade, it.unidade)}{it.cliente ? ` · ${it.cliente}` : ''}</span>
                  </div>
                  <div style={{ fontSize: 12, color: C.cinza, margin: '2px 0 6px' }}>
                    Está em: <b>{it.status === 'andamento' ? nomeArea(it.area_atual) : 'A planejar'}</b>
                  </div>
                  <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                    {p.motivos.map(m => (
                      <Chip key={m.motivo} cor="#fff" bg={C.vermelho}><i className="bi bi-alarm" />{MOTIVO_TXT[m.motivo]}: {fmtData(m.data)} · {m.dias}d</Chip>
                    ))}
                  </div>
                  {it.cobranca && (
                    <div style={{ fontSize: 12, color: '#92400e', marginTop: 6 }}>
                      <i className="bi bi-megaphone" /> Última cobrança {new Date(it.cobranca.criado_em).toLocaleDateString('pt-BR')}{it.cobranca.quem ? ` — ${it.cobranca.quem}` : ''}{it.cobranca.mensagem ? `: "${it.cobranca.mensagem}"` : ''}{it.cobranca.retorno ? ` · retorno até ${fmtData(it.cobranca.retorno)}` : ''}
                    </div>
                  )}
                </div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                  <button className="cp-btn sm" onClick={() => onAbrirItem(it)}><i className="bi bi-box-arrow-up-right" />Abrir pedido</button>
                  {podePlanejar && <>
                    <button className={`cp-btn sm ${aberta && acao?.tipo === 'data' ? 'pri' : ''}`} onClick={() => abrirAcao(p, 'data')}><i className="bi bi-calendar-event" />Nova data</button>
                    <button className={`cp-btn sm ${aberta && acao?.tipo === 'cobrar' ? 'pri' : ''}`} onClick={() => abrirAcao(p, 'cobrar')}><i className="bi bi-megaphone" />Cobrar</button>
                    <button className="cp-btn sm ok" disabled={salvando} onClick={() => finalizar(p)}><i className="bi bi-check2-all" />Já terminou</button>
                  </>}
                </div>
              </div>

              {aberta && acao?.tipo === 'data' && (
                <div style={{ marginTop: 10, padding: 10, background: '#f8fafc', borderRadius: 8, display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
                  {p.motivos.map(m => (
                    <label key={m.motivo} style={{ display: 'flex', flexDirection: 'column', gap: 3, fontSize: 11, fontWeight: 700, color: C.cinza }}>
                      NOVA {m.motivo === 'prazo_entrega' ? 'DATA DE ENTREGA' : m.motivo === 'prev_finalizacao' ? 'PREVISÃO DE FINALIZAÇÃO' : m.motivo === 'area' ? `SAÍDA DE ${nomeArea(it.area_atual).toUpperCase()}` : 'DATA DE RETORNO DO TERCEIRO'}
                      <input type="date" className="cp-in" style={{ width: 170 }} min={hoje} value={datas[m.motivo] || ''} onChange={e => setDatas(d => ({ ...d, [m.motivo]: e.target.value }))} />
                    </label>
                  ))}
                  <button className="cp-btn pri" disabled={salvando} onClick={() => salvarDatas(p)}><i className="bi bi-check2" />Salvar nova data</button>
                </div>
              )}
              {aberta && acao?.tipo === 'cobrar' && (
                <div style={{ marginTop: 10, padding: 10, background: '#fffbeb', borderRadius: 8, display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
                  <label style={{ display: 'flex', flexDirection: 'column', gap: 3, fontSize: 11, fontWeight: 700, color: C.cinza, flex: '1 1 160px' }}>
                    QUEM FOI COBRADO
                    <input className="cp-in" placeholder="Ex.: Solda — Diego / Fornecedor SCA / Compras" value={cob.quem} onChange={e => setCob(c => ({ ...c, quem: e.target.value }))} />
                  </label>
                  <label style={{ display: 'flex', flexDirection: 'column', gap: 3, fontSize: 11, fontWeight: 700, color: C.cinza, flex: '2 1 240px' }}>
                    O QUE FOI COBRADO / COMBINADO
                    <input className="cp-in" placeholder="Ex.: prometeu terminar amanhã" value={cob.mensagem} onChange={e => setCob(c => ({ ...c, mensagem: e.target.value }))} />
                  </label>
                  <label style={{ display: 'flex', flexDirection: 'column', gap: 3, fontSize: 11, fontWeight: 700, color: C.cinza }}>
                    RETORNO ATÉ
                    <input type="date" className="cp-in" style={{ width: 160 }} min={hoje} value={cob.retorno} onChange={e => setCob(c => ({ ...c, retorno: e.target.value }))} />
                  </label>
                  <button className="cp-btn pri" disabled={salvando} onClick={() => salvarCobranca(p)}><i className="bi bi-megaphone" />Registrar cobrança</button>
                </div>
              )}
              {msg?.id === it.id && <div style={{ marginTop: 6, fontSize: 12.5, fontWeight: 700, color: msg.ok ? C.verde : C.vermelho }}>{msg.txt}</div>}
            </div>
          );
        })}
      </div>
    </Modal>
  );
}
