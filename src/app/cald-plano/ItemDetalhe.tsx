'use client';
import { useEffect, useState } from 'react';
import api, { postIdempotente } from '@/lib/api';
import {
  AREAS_CALD, AREA_POR_CODIGO, AREA_TERCEIRO, UNIDADES_CALD, PRIORIDADES_CALD,
  ordenarAreas, situacaoItem, hojeISO, fmtData, diasEntre, type ItemCald, type EtapaCald,
  SUBSETORES_CALD, SUBSETORES_VERIFICAR_ALAN, nomeSubsetor,
} from '@/lib/caldPlano';
import { C, Modal, Campo, Chip, PRIO, STATUS_TXT, nomeArea, fmtQtd, erroDe, SeletorEmpresa, CampoValor, calcTotal, calcUnit, qtdNum } from './comum';

interface Hist { id: number; acao: string; detalhe: string | null; usuario_nome: string | null; criado_em: string }

export default function ItemDetalhe({ item: inicial, irmaos = [], podePlanejar, verValores, onFechar, onAtualizado }: {
  item: ItemCald;
  irmaos?: ItemCald[];   // outros itens do MESMO pedido (pra aplicar a empresa em todos)
  podePlanejar: boolean;
  verValores: boolean;
  onFechar: () => void;
  onAtualizado: (it: ItemCald) => void;
}) {
  const [item, setItem] = useState(inicial);
  const [f, setF] = useState(() => formDe(inicial));
  const [hist, setHist] = useState<Hist[]>([]);
  const [salvando, setSalvando] = useState(false);
  const [msg, setMsg] = useState<{ tipo: 'ok' | 'erro'; txt: string } | null>(null);
  const [destino, setDestino] = useState('');
  const [subDest, setSubDest] = useState<string | null>(null);
  const [obsDest, setObsDest] = useState('');
  const [dataAcao, setDataAcao] = useState(hojeISO());
  const [empTodos, setEmpTodos] = useState(true);

  const sit = situacaoItem(item);
  const ativo = item.status !== 'finalizado' && item.status !== 'cancelado';
  const podeEditarRoteiro = podePlanejar || item.status === 'novo';

  useEffect(() => { setDestino(sit.proxima || ''); setSubDest(null); }, [item.id, item.area_atual, item.status]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    api.get(`/api/cald-plano/${item.id}`).then(r => setHist(r.data.historico || [])).catch(() => {});
  }, [item.id, item.atualizado_em]);

  function aplicar(novo: ItemCald) { setItem(novo); setF(formDe(novo)); onAtualizado(novo); }

  async function salvar() {
    setSalvando(true); setMsg(null);
    try {
      const body: Record<string, unknown> = {
        pedido: f.pedido, vendedor: f.vendedor, cliente: f.cliente, material: f.material,
        quantidade: f.quantidade === '' ? null : f.quantidade, unidade: f.unidade,
        prazo_entrega: f.prazo_entrega || null, prev_faturamento: f.prev_faturamento || null,
        faturado_em: f.faturado_em || null, parcial: f.parcial, obs: f.obs,
      };
      if (f.empresa) body.empresa = f.empresa;
      if (verValores) { body.valor = f.valor; body.valor_unitario = f.unit; }
      if (podeEditarRoteiro) body.areas = f.areas;
      if (podePlanejar) {
        body.prioridade = f.prioridade;
        body.prev_finalizacao = f.prev_finalizacao || null;
        if (item.status === 'finalizado') body.finalizado_em = f.finalizado_em || null;
        body.etapas = f.areas.map(a => f.etapas[a] || { area: a, entrada: null, previsao: null, fornecedor: null, retorno_previsto: null });
      }
      const r = await api.patch(`/api/cald-plano/${item.id}`, body);
      aplicar(r.data.item);
      // Empresa é do PEDIDO: aplica nos outros itens do mesmo pedido também.
      let extra = '';
      if (f.empresa && f.empresa !== item.empresa && empTodos && irmaos.length) {
        const outros = irmaos.filter(o => o.empresa !== f.empresa);
        for (const o of outros) {
          const ro = await api.patch(`/api/cald-plano/${o.id}`, { empresa: f.empresa });
          onAtualizado(ro.data.item);
        }
        if (outros.length) extra = ` (empresa aplicada em mais ${outros.length} item(ns) do pedido)`;
      }
      setMsg({ tipo: 'ok', txt: 'Salvo!' + extra });
    } catch (e) {
      setMsg({ tipo: 'erro', txt: erroDe(e, 'Não foi possível salvar.') });
    } finally { setSalvando(false); }
  }

  async function acao(nome: string, extra: Record<string, unknown> = {}) {
    setSalvando(true); setMsg(null);
    try {
      const r = await postIdempotente<{ item: ItemCald }>(`/api/cald-plano/${item.id}`, { acao: nome, ...extra });
      aplicar(r.item);
      setMsg({ tipo: 'ok', txt: 'Feito!' });
    } catch (e) {
      setMsg({ tipo: 'erro', txt: erroDe(e, 'Não foi possível executar.') });
    } finally { setSalvando(false); }
  }

  const setEtapa = (area: string, p: Partial<EtapaCald>) =>
    setF(v => ({ ...v, etapas: { ...v.etapas, [area]: { ...(v.etapas[area] || { area, entrada: null, previsao: null, fornecedor: null, retorno_previsto: null }), ...p } } }));
  const toggleArea = (a: string) => setF(v => ({ ...v, areas: v.areas.includes(a) ? v.areas.filter(x => x !== a) : ordenarAreas([...v.areas, a]) }));

  const st = STATUS_TXT[item.status] || STATUS_TXT.novo;

  return (
    <Modal
      largura={900}
      onFechar={onFechar}
      titulo={
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span>Pedido {item.pedido}</span>
          <span style={{ fontWeight: 600, color: C.texto, fontSize: 14 }}>· {item.material}</span>
          <Chip cor={st.cor} bg={st.bg}>{item.status === 'andamento' ? `Em ${nomeArea(item.area_atual)}` : st.txt}</Chip>
          {sit.atrasado && <Chip cor="#fff" bg={C.vermelho}><i className="bi bi-exclamation-triangle-fill" />Atrasado</Chip>}
        </div>
      }
      rodape={<>
        {msg && <span style={{ color: msg.tipo === 'ok' ? C.verde : C.vermelho, fontSize: 13, fontWeight: 700, marginRight: 'auto', alignSelf: 'center' }}>{msg.txt}</span>}
        <button className="cp-btn" onClick={onFechar}>Fechar</button>
        {podePlanejar
          ? <button className="cp-btn pri" onClick={salvar} disabled={salvando}><i className="bi bi-check2" />{salvando ? 'Salvando…' : 'Salvar alterações'}</button>
          : <span style={{ fontSize: 12.5, color: C.cinza, alignSelf: 'center' }}><i className="bi bi-eye" /> Somente visualização</span>}
      </>}
    >
      {/* Linha do tempo por área */}
      <div style={{ display: 'flex', gap: 0, overflowX: 'auto', paddingBottom: 6, marginBottom: 14 }}>
        {item.areas.length === 0 && <span style={{ fontSize: 13, color: C.fraco }}>Sem roteiro definido — marque abaixo por onde o item passa.</span>}
        {item.areas.map((a, i) => {
          const et = item.etapas.find(e => e.area === a);
          const atual = item.status === 'andamento' && item.area_atual === a;
          const idxAtual = item.area_atual ? item.areas.indexOf(item.area_atual) : -1;
          const feita = !!et?.entrada && (item.status === 'finalizado' || i < idxAtual);
          const cor = AREA_POR_CODIGO[a]?.cor || C.cinza;
          const prox = item.areas[i + 1] ? item.etapas.find(e => e.area === item.areas[i + 1])?.entrada : null;
          const dias = et?.entrada ? diasEntre(et.entrada, feita && prox ? prox : (item.finalizado_em && feita ? item.finalizado_em : hojeISO())) : null;
          return (
            <div key={a} style={{ display: 'flex', alignItems: 'center', flexShrink: 0 }}>
              <div style={{ textAlign: 'center', minWidth: 92, padding: '0 4px' }}>
                <div style={{
                  width: 34, height: 34, borderRadius: '50%', margin: '0 auto 4px', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: atual ? cor : feita ? cor + '22' : '#f1f5f9', color: atual ? '#fff' : feita ? cor : C.fraco,
                  border: `2px solid ${atual || feita ? cor : C.borda}`, fontSize: 15,
                  boxShadow: atual ? `0 0 0 4px ${cor}33` : undefined,
                }}>
                  <i className={`bi ${feita ? 'bi-check-lg' : AREA_POR_CODIGO[a]?.icon}`} />
                </div>
                <div style={{ fontSize: 11.5, fontWeight: 800, color: atual ? cor : C.texto }}>{nomeArea(a)}</div>
                <div style={{ fontSize: 10.5, color: C.cinza }}>{et?.entrada ? `entrou ${fmtData(et.entrada)}` : '—'}</div>
                {dias !== null && <div style={{ fontSize: 10.5, color: atual && sit.parado ? C.vermelho : C.fraco, fontWeight: 700 }}>{dias}d{atual ? ' até hoje' : ''}</div>}
              </div>
              {i < item.areas.length - 1 && <div style={{ width: 22, height: 2, background: feita ? cor : C.borda, marginBottom: 34 }} />}
            </div>
          );
        })}
      </div>

      {/* Ações do planejador */}
      {podePlanejar && item.status !== 'cancelado' && (
        <div style={{ border: `1.5px solid ${C.azul}33`, background: '#f8fbff', borderRadius: 10, padding: 10, marginBottom: 16, display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
          <span style={{ fontSize: 11, fontWeight: 800, color: C.azul, textTransform: 'uppercase', letterSpacing: .3 }}>Ações</span>
          {ativo && <>
            {/* MOVER PARA — áreas em LISTA (modelo do roteiro do Flange): clica na
                área (e, se quiser, no setor dela) e registra a entrada. Sem arrastar. */}
            <div style={{ flexBasis: '100%' }}>
              <div style={{ fontSize: 11, fontWeight: 800, color: C.cinza, textTransform: 'uppercase', letterSpacing: .3, marginBottom: 6 }}>Mover para — clique na área</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(170px, 1fr))', gap: 6 }}>
                {[...AREAS_CALD.filter(a => item.areas.includes(a.codigo)), ...AREAS_CALD.filter(a => !item.areas.includes(a.codigo))].map(a => {
                  const aqui = item.status === 'andamento' && item.area_atual === a.codigo;
                  const sel = destino === a.codigo;
                  const noRot = item.areas.includes(a.codigo);
                  const ehProx = sit.proxima === a.codigo;
                  const et = item.etapas.find(e => e.area === a.codigo);
                  return (
                    <button key={a.codigo} type="button" disabled={aqui || salvando} onClick={() => { setDestino(a.codigo); setSubDest(null); }}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', borderRadius: 8, textAlign: 'left', cursor: aqui ? 'default' : 'pointer',
                        border: sel ? `2px solid ${a.cor}` : `1px solid ${aqui ? a.cor : C.borda}`,
                        background: aqui ? a.cor + '22' : sel ? a.cor + '14' : noRot ? '#fff' : '#f8fafc', opacity: noRot || sel ? 1 : .8,
                      }}>
                      <i className={`bi ${a.icon}`} style={{ color: a.cor, fontSize: 15 }} />
                      <span style={{ flex: 1, minWidth: 0 }}>
                        <span style={{ display: 'block', fontSize: 12.5, fontWeight: 800, color: C.texto }}>{a.nome}</span>
                        <span style={{ display: 'block', fontSize: 10.5, color: aqui ? a.cor : ehProx ? '#1d4ed8' : C.fraco, fontWeight: aqui || ehProx ? 800 : 500 }}>
                          {aqui ? 'está aqui' : ehProx ? 'próxima do roteiro' : noRot ? (et?.entrada ? `entrou ${fmtData(et.entrada)}` : 'no roteiro') : 'fora do roteiro'}
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>
              {destino && (SUBSETORES_CALD[destino] || []).length > 0 && (
                <div style={{ marginTop: 8, display: 'flex', flexWrap: 'wrap', gap: 5, alignItems: 'center' }}>
                  <b style={{ fontSize: 12, color: AREA_POR_CODIGO[destino]?.cor }}>{nomeArea(destino)}</b>
                  <span style={{ fontSize: 11.5, color: C.cinza }}>› setor (opcional):</span>
                  {[null, ...(SUBSETORES_CALD[destino] || [])].map(s => {
                    const on = subDest === s;
                    return (
                      <button key={s || '_'} type="button" onClick={() => setSubDest(s)}
                        style={{ fontSize: 11.5, fontWeight: 700, borderRadius: 7, padding: '3px 8px', cursor: 'pointer', border: `1.5px solid ${on ? C.azul : C.borda}`, background: on ? C.azul : '#fff', color: on ? '#fff' : C.texto }}>
                        {s ? nomeSubsetor(s) : 'só a área'}{s && SUBSETORES_VERIFICAR_ALAN.has(s) ? ' · Alan confere' : ''}
                      </button>
                    );
                  })}
                </div>
              )}
              {subDest && SUBSETORES_VERIFICAR_ALAN.has(subDest) && (
                <div style={{ marginTop: 8, fontSize: 12.5, color: '#92400e', background: '#fffbeb', border: '1px solid #fcd34d', borderRadius: 8, padding: '7px 10px' }}>
                  <i className="bi bi-exclamation-triangle-fill" style={{ marginRight: 6 }} /><b>{nomeSubsetor(subDest)}</b> é conferida pelo <b>Alan</b> — verifique com ele. Vai um recado pra Conferência dele.
                </div>
              )}
              {destino && (
                <input className="cp-in" style={{ marginTop: 8 }} value={obsDest} onChange={e => setObsDest(e.target.value)} maxLength={1000}
                  placeholder="Observação pro Alan (opcional — se preencher, vira recado pra ele)" />
              )}
            </div>
            <input type="date" className="cp-in" style={{ width: 150 }} value={dataAcao} onChange={e => setDataAcao(e.target.value)} title="Data de entrada na área / da ação" />
            <button className="cp-btn pri" disabled={!destino || salvando} onClick={() => { acao('mover', { area: destino, data: dataAcao, sub_setor: subDest, obs: obsDest }); setObsDest(''); }}>
              <i className="bi bi-box-arrow-in-right" />Entrou em {destino ? `${nomeArea(destino)}${subDest ? ` › ${nomeSubsetor(subDest)}` : ''}` : '… (escolha a área)'}
            </button>
            <button className="cp-btn ok" disabled={salvando} onClick={() => { if (confirm(`Finalizar o item "${item.material}" do pedido ${item.pedido}?

Ele sai do painel e vai pra lista de Finalizados.`)) acao('finalizar', { data: dataAcao }); }}><i className="bi bi-check2-all" />Finalizar</button>
          </>}
          {item.status === 'finalizado' && <button className="cp-btn" disabled={salvando} onClick={() => acao('reabrir')}><i className="bi bi-arrow-counterclockwise" />Reabrir</button>}
          {item.status === 'finalizado' && (
            <div style={{ flexBasis: '100%', fontSize: 12.5, color: '#166534', background: '#dcfce7', border: '1px solid #bbf7d0', borderRadius: 8, padding: '7px 10px' }}>
              <i className="bi bi-check2-all" style={{ marginRight: 6 }} />Item <b>FINALIZADO</b> — não aparece no painel. Pra voltar pra produção, clique <b>Reabrir</b> (ou registre a entrada numa área nova).
            </div>
          )}
          {!item.faturado_em && <button className="cp-btn" disabled={salvando} onClick={() => acao('faturar', { data: dataAcao })}><i className="bi bi-receipt" />Faturado</button>}
          <button className="cp-btn perigo" style={{ marginLeft: 'auto' }} disabled={salvando} onClick={() => { const m = prompt('Motivo do cancelamento (opcional):'); if (m !== null) acao('cancelar', { motivo: m }); }}>
            <i className="bi bi-x-circle" />Cancelar item
          </button>
        </div>
      )}
      {item.status === 'cancelado' && podePlanejar && (
        <div style={{ marginBottom: 12 }}><button className="cp-btn" onClick={() => acao('restaurar')}><i className="bi bi-arrow-counterclockwise" />Restaurar item</button></div>
      )}

      {/* Dados */}
      <div style={{ marginBottom: 10 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: C.cinza, textTransform: 'uppercase', letterSpacing: .3, marginBottom: 5 }}>
          Empresa do pedido {!item.empresa && <span style={{ color: C.vermelho, textTransform: 'none' }}>— não informada</span>}
        </div>
        <SeletorEmpresa valor={f.empresa} onChange={v => setF({ ...f, empresa: v })} />
        {irmaos.length > 0 && f.empresa !== item.empresa && (
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, color: C.texto, marginTop: 6 }}>
            <input type="checkbox" checked={empTodos} onChange={e => setEmpTodos(e.target.checked)} />
            Aplicar também nos outros {irmaos.length} item(ns) do pedido {item.pedido}
          </label>
        )}
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 10 }}>
        <Campo rot="Pedido" largura={120}><input className="cp-in" value={f.pedido} onChange={e => setF({ ...f, pedido: e.target.value })} /></Campo>
        <Campo rot="Vendedor"><input className="cp-in" list="cp-vendedores" value={f.vendedor} onChange={e => setF({ ...f, vendedor: e.target.value })} /></Campo>
        <Campo rot="Cliente"><input className="cp-in" list="cp-clientes" value={f.cliente} onChange={e => setF({ ...f, cliente: e.target.value })} /></Campo>
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 10 }}>
        <Campo rot="Material"><input className="cp-in" value={f.material} onChange={e => setF({ ...f, material: e.target.value })} /></Campo>
        <Campo rot="Qtd" largura={90}><input className="cp-in" inputMode="decimal" value={f.quantidade} onChange={e => {
          const q = qtdNum(e.target.value);
          setF(f.unit !== null ? { ...f, quantidade: e.target.value, valor: calcTotal(f.unit, q) ?? f.valor } : { ...f, quantidade: e.target.value, unit: calcUnit(f.valor, q) });
        }} /></Campo>
        <Campo rot="Un." largura={80}>
          <select className="cp-in" value={f.unidade} onChange={e => setF({ ...f, unidade: e.target.value })}>{UNIDADES_CALD.map(u => <option key={u}>{u}</option>)}</select>
        </Campo>
        {verValores && <>
          <Campo rot="Vlr unitário" largura={140}><CampoValor valor={f.unit} onChange={v => setF({ ...f, unit: v, valor: calcTotal(v, qtdNum(f.quantidade)) ?? f.valor })} /></Campo>
          <Campo rot="Vlr total" largura={150}><CampoValor valor={f.valor} onChange={v => setF({ ...f, valor: v, unit: calcUnit(v, qtdNum(f.quantidade)) ?? f.unit })} /></Campo>
        </>}
        <Campo rot="Prioridade" largura={120}>
          <select className="cp-in" value={f.prioridade} disabled={!podePlanejar} onChange={e => setF({ ...f, prioridade: e.target.value })}>
            {PRIORIDADES_CALD.map(p => <option key={p} value={p}>{PRIO[p].txt}</option>)}
          </select>
        </Campo>
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 10 }}>
        <Campo rot="Prazo de entrega" largura={150}><input type="date" className="cp-in" value={f.prazo_entrega} onChange={e => setF({ ...f, prazo_entrega: e.target.value })} /></Campo>
        <Campo rot="Prev. finalização" largura={150}><input type="date" className="cp-in" disabled={!podePlanejar} value={f.prev_finalizacao} onChange={e => setF({ ...f, prev_finalizacao: e.target.value })} /></Campo>
        <Campo rot="Prev. faturamento" largura={150}><input type="date" className="cp-in" value={f.prev_faturamento} onChange={e => setF({ ...f, prev_faturamento: e.target.value })} /></Campo>
        <Campo rot="Faturado em" largura={150}><input type="date" className="cp-in" value={f.faturado_em} onChange={e => setF({ ...f, faturado_em: e.target.value })} /></Campo>
        {item.status === 'finalizado' && <Campo rot="Finalizado em" largura={150}><input type="date" className="cp-in" disabled={!podePlanejar} value={f.finalizado_em} onChange={e => setF({ ...f, finalizado_em: e.target.value })} /></Campo>}
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 700, color: C.texto, alignSelf: 'flex-end', paddingBottom: 8 }}>
          <input type="checkbox" checked={f.parcial} onChange={e => setF({ ...f, parcial: e.target.checked })} />Parcial
        </label>
      </div>
      <Campo rot="Observação"><textarea className="cp-in" rows={2} value={f.obs} onChange={e => setF({ ...f, obs: e.target.value })} /></Campo>

      {/* Roteiro + datas por área */}
      <div style={{ fontSize: 11, fontWeight: 800, color: C.cinza, textTransform: 'uppercase', letterSpacing: .3, margin: '16px 0 8px' }}>Roteiro e datas por área</div>
      {podeEditarRoteiro && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginBottom: 10 }}>
          {AREAS_CALD.map(a => {
            const on = f.areas.includes(a.codigo);
            return (
              <button key={a.codigo} type="button" onClick={() => toggleArea(a.codigo)} style={{
                display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11.5, fontWeight: 700, borderRadius: 7, padding: '3px 9px', cursor: 'pointer',
                border: `1.5px solid ${on ? a.cor : C.borda}`, background: on ? a.cor : '#fff', color: on ? '#fff' : C.fraco,
              }}><i className={`bi ${a.icon}`} />{a.nome}</button>
            );
          })}
        </div>
      )}
      {f.areas.length > 0 && (
        <div style={{ overflowX: 'auto' }}>
          <table className="cp-tbl">
            <thead><tr><th>Área</th><th>Entrou em</th><th>Previsão de saída</th><th>Terceiro (industrialização)</th></tr></thead>
            <tbody>
              {f.areas.map(a => {
                const et = f.etapas[a] || { area: a, entrada: null, previsao: null, fornecedor: null, retorno_previsto: null };
                const dis = !podePlanejar;
                return (
                  <tr key={a}>
                    <td style={{ fontWeight: 700, whiteSpace: 'nowrap' }}><i className={`bi ${AREA_POR_CODIGO[a]?.icon}`} style={{ color: AREA_POR_CODIGO[a]?.cor, marginRight: 6 }} />{nomeArea(a)}</td>
                    <td><input type="date" className="cp-in" style={{ width: 150 }} disabled={dis} value={et.entrada || ''} onChange={e => setEtapa(a, { entrada: e.target.value || null })} /></td>
                    <td><input type="date" className="cp-in" style={{ width: 150 }} disabled={dis} value={et.previsao || ''} onChange={e => setEtapa(a, { previsao: e.target.value || null })} /></td>
                    <td>
                      {a === AREA_TERCEIRO ? (
                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                          <input className="cp-in" style={{ width: 150 }} placeholder="Fornecedor" disabled={dis} value={et.fornecedor || ''} onChange={e => setEtapa(a, { fornecedor: e.target.value || null })} />
                          <input type="date" className="cp-in" style={{ width: 150 }} title="Retorno previsto" disabled={dis} value={et.retorno_previsto || ''} onChange={e => setEtapa(a, { retorno_previsto: e.target.value || null })} />
                        </div>
                      ) : <span style={{ color: C.fraco }}>—</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Histórico */}
      <div style={{ fontSize: 11, fontWeight: 800, color: C.cinza, textTransform: 'uppercase', letterSpacing: .3, margin: '18px 0 8px' }}>Histórico</div>
      {hist.length === 0 ? <div style={{ fontSize: 12.5, color: C.fraco }}>Sem registros.</div> : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {hist.map(h => (
            <div key={h.id} style={{ fontSize: 12.5, color: C.texto, display: 'flex', gap: 8 }}>
              <span style={{ color: C.fraco, whiteSpace: 'nowrap', minWidth: 110 }}>{new Date(h.criado_em).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })}</span>
              <span><b>{h.usuario_nome || '—'}</b> · {h.detalhe || h.acao}</span>
            </div>
          ))}
        </div>
      )}
      <div style={{ fontSize: 11, color: C.fraco, marginTop: 12 }}>Lançado por {item.criado_por_nome || '—'} · Qtd {fmtQtd(item.quantidade, item.unidade)}</div>
    </Modal>
  );
}

function formDe(it: ItemCald) {
  return {
    pedido: it.pedido, empresa: it.empresa as string | null, vendedor: it.vendedor || '', cliente: it.cliente || '', material: it.material,
    quantidade: it.quantidade === null ? '' : String(it.quantidade), unidade: it.unidade || 'pç',
    valor: it.valor as number | null, unit: (it.valor_unitario ?? calcUnit(it.valor, it.quantidade)) as number | null, prioridade: it.prioridade || 'normal',
    prazo_entrega: it.prazo_entrega || '', prev_faturamento: it.prev_faturamento || '', faturado_em: it.faturado_em || '',
    prev_finalizacao: it.prev_finalizacao || '', finalizado_em: it.finalizado_em || '',
    parcial: it.parcial, obs: it.obs || '', areas: [...it.areas],
    etapas: Object.fromEntries(it.etapas.map(e => [e.area, { ...e }])) as Record<string, EtapaCald>,
  };
}
