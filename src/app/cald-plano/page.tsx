'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import AuthGuard from '@/components/AuthGuard';
import api, { postIdempotente } from '@/lib/api';
import { podeLancarCaldeiraria, podePlanejarCaldeiraria, podeVerValores } from '@/lib/auth';
import {
  AREAS_CALD, EMPRESAS_CALD, valorUnitario, PRIORIDADES_CALD, situacaoItem, pendenciasItem, passaEmpresa, nomeEmpresa, hojeISO, fmtData, inicioSemana, somarDias, DIAS_PARADO,
  SUBSETORES_CALD, nomeSubsetor, subsetorValido, type ItemCald,
} from '@/lib/caldPlano';
import { C, CSS, Chip, PRIO, STATUS_TXT, nomeArea, fmtQtd, fmtBRL, somaPorUnidade, somaValor, EmpresaTag, FiltroEmpresa } from './comum';
import LancarModal from './LancarModal';
import EncaminharModal, { type Encaminhamento } from './EncaminharModal';
import ItemDetalhe from './ItemDetalhe';
import ImportarModal from './ImportarModal';
import CaixaPendencias from './CaixaPendencias';

// Planejamento da Caldeiraria — tela do coordenador ("o Reginaldo da
// Caldeiraria"). PCP / quem sabe do pedido LANÇA; o coordenador vê a carga de
// cada área, define a ordem, as previsões e anda com os itens. O relatório
// semanal (diretoria/contabilidade) fica na Análise PCP → Caldeiraria.

type Filtro = 'todos' | 'novos' | 'atrasados' | 'vence' | 'parados' | 'terceiro' | 'faturar';
const PRIO_PESO: Record<string, number> = { urgente: 0, alta: 1, normal: 2, baixa: 3 };

export default function CaldPlanoPage() {
  const router = useRouter();
  const [itens, setItens] = useState<ItemCald[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState('');
  const [aviso, setAviso] = useState('');
  const [aba, setAba] = useState<'painel' | 'lista'>('painel');
  const [filtro, setFiltro] = useState<Filtro>('todos');
  const [busca, setBusca] = useState('');
  const [fVend, setFVend] = useState('');
  const [fCli, setFCli] = useState('');
  const [fEmp, setFEmp] = useState('');
  const [statusLista, setStatusLista] = useState<'ativos' | 'finalizado' | 'cancelado' | 'todos'>('ativos');
  const [lancar, setLancar] = useState(false);
  const [importar, setImportar] = useState(false);
  const [caixa, setCaixa] = useState(false);
  // Seleção em massa na Lista (definir empresa / prioridade de vários de uma vez).
  const [sel, setSel] = useState<Set<number>>(new Set());
  const [aplicandoLote, setAplicandoLote] = useState(false);
  const [aberto, setAberto] = useState<ItemCald | null>(null);
  // Encaminhar (área geral + sub-setor opcional) — abre ao arrastar/avançar pra
  // área com sub-setores, ou no botão "Setor" do card (troca dentro da área).
  const [enc, setEnc] = useState<{ it: ItemCald; area: string; modo: 'mover' | 'subsetor' } | null>(null);
  const [arrastando, setArrastando] = useState<number | null>(null);
  const [alvoCol, setAlvoCol] = useState<string | null>(null);
  const [ok, setOk] = useState(false);
  // Arrastar o painel pro lado (clicar no fundo e puxar) — pra ver as colunas fora da tela.
  const quadroRef = useRef<HTMLDivElement>(null);
  const pan = useRef<{ x: number; left: number } | null>(null);
  const [panAtivo, setPanAtivo] = useState(false);
  function panInicio(e: React.MouseEvent) {
    const alvo = e.target as HTMLElement;
    if (e.button !== 0 || alvo.closest('.cp-card, button, a, input, select')) return; // card/botão: não é pan
    if (!quadroRef.current) return;
    pan.current = { x: e.clientX, left: quadroRef.current.scrollLeft };
    setPanAtivo(true);
    e.preventDefault();
  }
  useEffect(() => {
    if (!panAtivo) return;
    const mover = (e: MouseEvent) => { if (pan.current && quadroRef.current) quadroRef.current.scrollLeft = pan.current.left - (e.clientX - pan.current.x); };
    const soltar = () => { pan.current = null; setPanAtivo(false); };
    window.addEventListener('mousemove', mover);
    window.addEventListener('mouseup', soltar);
    return () => { window.removeEventListener('mousemove', mover); window.removeEventListener('mouseup', soltar); };
  }, [panAtivo]);
  const rolar = (dx: number) => quadroRef.current?.scrollBy({ left: dx, behavior: 'smooth' });
  const planeja = ok && podePlanejarCaldeiraria();
  const verValores = ok && podeVerValores();

  useEffect(() => {
    if (!podeLancarCaldeiraria()) { router.replace('/'); return; }
    setOk(true);
  }, [router]);

  const carregar = useCallback(async (silencioso = false) => {
    if (!silencioso) setCarregando(true);
    try {
      const r = await api.get('/api/cald-plano');
      setItens(r.data.itens || []);
      setErro('');
    } catch {
      setErro('Não foi possível carregar o planejamento.');
    } finally { setCarregando(false); }
  }, []);
  useEffect(() => { if (ok) carregar(); }, [ok, carregar]);

  const mostrarAviso = (t: string) => { setAviso(t); setTimeout(() => setAviso(''), 4000); };
  const atualizarItem = (it: ItemCald) => setItens(v => v.map(x => (x.id === it.id ? it : x)));

  const hoje = hojeISO();
  const fimSemana = somarDias(inicioSemana(hoje), 6);
  const ativos = useMemo(() => itens.filter(i => i.status !== 'finalizado' && i.status !== 'cancelado'), [itens]);
  const sit = useMemo(() => new Map(itens.map(i => [i.id, situacaoItem(i, hoje)])), [itens, hoje]);

  // Caixa de pendências: prazo vencido e sem cobrança aguardando retorno.
  const nPend = useMemo(() => itens.filter(i => { const p = pendenciasItem(i, hoje); return p && !p.aguardandoCobranca; }).length, [itens, hoje]);

  const vendedores = useMemo(() => Array.from(new Set(itens.map(i => i.vendedor).filter(Boolean) as string[])).sort(), [itens]);
  const clientes = useMemo(() => Array.from(new Set(itens.map(i => i.cliente).filter(Boolean) as string[])).sort(), [itens]);

  const passaFiltro = useCallback((i: ItemCald) => {
    const s = sit.get(i.id)!;
    if (filtro === 'novos' && i.status !== 'novo') return false;
    if (filtro === 'atrasados' && !(s.atrasado || s.areaAtrasada)) return false;
    if (filtro === 'vence' && !s.venceLogo) return false;
    if (filtro === 'parados' && !s.parado) return false;
    if (filtro === 'terceiro' && !(i.area_atual === 'industrializacao' && i.status === 'andamento')) return false;
    if (filtro === 'faturar' && !(i.prev_faturamento && !i.faturado_em && i.prev_faturamento <= fimSemana)) return false;
    if (!passaEmpresa(i, fEmp)) return false;
    if (fVend && i.vendedor !== fVend) return false;
    if (fCli && i.cliente !== fCli) return false;
    if (busca) {
      const q = busca.toLowerCase();
      if (![i.pedido, i.material, i.cliente, i.vendedor, i.obs].some(x => (x || '').toLowerCase().includes(q))) return false;
    }
    return true;
  }, [sit, filtro, fVend, fCli, fEmp, busca, fimSemana]);

  const cont = useMemo(() => {
    const c = { novos: 0, atrasados: 0, vence: 0, parados: 0, terceiro: 0, terceiroVencido: 0, faturar: 0 };
    for (const i of ativos) {
      const s = sit.get(i.id)!;
      if (i.status === 'novo') c.novos++;
      if (s.atrasado || s.areaAtrasada) c.atrasados++;
      if (s.venceLogo) c.vence++;
      if (s.parado) c.parados++;
      if (i.area_atual === 'industrializacao' && i.status === 'andamento') c.terceiro++;
      if (s.terceiroVencido) c.terceiroVencido++;
    }
    for (const i of itens) if (i.status !== 'cancelado' && i.prev_faturamento && !i.faturado_em && i.prev_faturamento <= fimSemana) c.faturar++;
    return c;
  }, [ativos, itens, sit, fimSemana]);

  const ordenar = (a: ItemCald, b: ItemCald) =>
    (a.ordem || 9999) - (b.ordem || 9999) || (PRIO_PESO[a.prioridade] ?? 2) - (PRIO_PESO[b.prioridade] ?? 2) || a.id - b.id;

  const colunas = useMemo(() => {
    const vis = ativos.filter(passaFiltro);
    const cols: { codigo: string; nome: string; icon: string; cor: string; itens: ItemCald[] }[] = [
      // Entrada do Val: itens ainda fora de qualquer área — lançados (status
      // 'novo') ou 'aguardando' (a coluna "Chegando" saiu em 25/09, mas o servidor
      // ainda põe o item nesse status ao tirar etapas/reabrir; mostra aqui pra não
      // sumir). Daqui ele arrasta pra qualquer área. Não recebe drop.
      { codigo: 'novo', nome: 'Início — A planejar', icon: 'bi-inbox-fill', cor: '#d97706', itens: vis.filter(i => i.status === 'novo' || i.status === 'aguardando').sort((a, b) => a.id - b.id) },
      ...AREAS_CALD.map(a => ({ ...a, itens: vis.filter(i => i.status === 'andamento' && i.area_atual === a.codigo).sort(ordenar) })),
    ];
    return cols;
  }, [ativos, passaFiltro]);

  async function mover(it: ItemCald, area: string, extra?: { sub_setor: string | null; obs: string }) {
    try {
      const r = await postIdempotente<{ item: ItemCald }>(`/api/cald-plano/${it.id}`, area === 'aguardando' ? { acao: 'aguardando' } : { acao: 'mover', area, ...extra });
      atualizarItem(r.item);
      mostrarAviso(`Pedido ${it.pedido} · ${it.material} → ${area === 'aguardando' ? 'Chegando' : nomeArea(area)}${extra?.sub_setor ? ` › ${nomeSubsetor(extra.sub_setor)}` : ''} (entrada ${fmtData(hoje)})`);
    } catch { mostrarAviso('Não foi possível mover o item.'); }
  }
  // Área com sub-setores → pergunta o setor (e observação pro Alan); sem → move direto.
  function encaminhar(it: ItemCald, area: string) {
    if ((SUBSETORES_CALD[area] || []).length) setEnc({ it, area, modo: 'mover' });
    else mover(it, area);
  }
  async function confirmarEnc(e: Encaminhamento) {
    if (!enc) return;
    const { it, modo } = enc;
    setEnc(null);
    // "Mover" pra um setor da MESMA área em que o item já está = só troca o setor.
    const mesmaArea = it.status === 'andamento' && e.area === it.area_atual;
    if (modo === 'mover' && !mesmaArea) return mover(it, e.area, { sub_setor: e.sub_setor, obs: e.obs });
    try {
      const r = await postIdempotente<{ item: ItemCald }>(`/api/cald-plano/${it.id}`, { acao: 'subsetor', sub_setor: e.sub_setor, obs: e.obs });
      atualizarItem(r.item);
      mostrarAviso(`Pedido ${it.pedido}: ${nomeArea(it.area_atual)}${e.sub_setor ? ` › ${nomeSubsetor(e.sub_setor)}` : ''}`);
    } catch { mostrarAviso('Não foi possível trocar o setor.'); }
  }
  async function salvarOrdem(col: string, ids: number[]) {
    setItens(v => v.map(x => { const k = ids.indexOf(x.id); return k >= 0 ? { ...x, ordem: k + 1 } : x; }));
    try { await api.post('/api/cald-plano/ordem', { area: col, ids }); } catch { mostrarAviso('Não foi possível salvar a ordem.'); carregar(true); }
  }
  function soltar(colCodigo: string, sobreId: number | null) {
    const id = arrastando;
    setArrastando(null); setAlvoCol(null);
    if (!id) return;
    const it = itens.find(i => i.id === id);
    if (!it) return;
    if (colCodigo === 'novo') return;
    const colAtual = it.status === 'novo' || it.status === 'aguardando' ? 'novo' : it.area_atual;
    if (colAtual !== colCodigo) { encaminhar(it, colCodigo); return; }
    if (sobreId === null || sobreId === id) return;
    const lista = colunas.find(c => c.codigo === colCodigo)?.itens || [];
    const ids = lista.map(i => i.id).filter(x => x !== id);
    ids.splice(ids.indexOf(sobreId), 0, id);
    salvarOrdem(colCodigo, ids);
  }

  async function aplicarLote(body: { empresa?: string; prioridade?: string }, rotulo: string) {
    const ids = Array.from(sel);
    if (!ids.length) return;
    if (!confirm(`${rotulo} em ${ids.length} item(ns) selecionado(s)?`)) return;
    setAplicandoLote(true);
    try {
      const r = await api.post('/api/cald-plano/lote', { ids, ...body });
      const novos = new Map<number, ItemCald>((r.data.itens || []).map((i: ItemCald) => [i.id, i]));
      setItens(v => v.map(x => novos.get(x.id) || x));
      mostrarAviso(`${rotulo}: ${r.data.alterados} item(ns) alterado(s).`);
      setSel(new Set());
    } catch { mostrarAviso('Não foi possível aplicar a alteração.'); }
    finally { setAplicandoLote(false); }
  }

  async function exportarExcel() {
    const XLSX = await import('xlsx');
    const lista = listaFiltrada;
    const linhas = lista.map(i => {
      const et = (a: string) => i.etapas.find(e => e.area === a);
      const row: Record<string, unknown> = {
        Empresa: nomeEmpresa(i.empresa), Vendedor: i.vendedor || '', Pedido: i.pedido, Material: i.material, Quant: i.quantidade ?? '', Un: i.unidade || '',
        Cliente: i.cliente || '', Situação: i.status === 'andamento' ? nomeArea(i.area_atual) : STATUS_TXT[i.status]?.txt,
      };
      for (const a of AREAS_CALD) {
        const e = et(a.codigo);
        row[a.nome] = !i.areas.includes(a.codigo) ? 'N/A' : e?.entrada ? fmtData(e.entrada) : '';
        if (a.codigo === 'industrializacao' && e?.fornecedor) row[a.nome] = `${e.fornecedor} ${row[a.nome]}`.trim();
      }
      row['Prev. Fatur.'] = fmtData(i.prev_faturamento); row['Faturado'] = fmtData(i.faturado_em);
      row['Prev. Final.'] = fmtData(i.prev_finalizacao); row['Finalizado'] = fmtData(i.finalizado_em);
      if (verValores) { row['Vlr unitário R$'] = valorUnitario(i) ?? ''; row['Vlr total R$'] = i.valor ?? ''; }
      row['Parcial'] = i.parcial ? 'Sim' : ''; row['Obs'] = i.obs || '';
      return row;
    });
    if (verValores && linhas.length) {
      const tot: Record<string, unknown> = {};
      for (const k of Object.keys(linhas[0])) tot[k] = '';
      tot.Empresa = 'TOTAL'; tot['Vlr total R$'] = lista.reduce((s, i) => s + (i.valor || 0), 0);
      linhas.push(tot);
    }
    const ws = XLSX.utils.json_to_sheet(linhas);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Caldeiraria');
    XLSX.writeFile(wb, `planejamento_caldeiraria_${hoje}.xlsx`);
  }

  const listaFiltrada = useMemo(() => itens
    .filter(i => statusLista === 'todos' ? true : statusLista === 'ativos' ? (i.status !== 'finalizado' && i.status !== 'cancelado') : i.status === statusLista)
    .filter(passaFiltro)
    .sort((a, b) => (a.pedido || '').localeCompare(b.pedido || '', 'pt-BR', { numeric: true }) || a.id - b.id),
  [itens, statusLista, passaFiltro]);

  // Totais da lista na tela (respeita todos os filtros). Item sem valor entra na
  // contagem mas não soma. Quebra por empresa só quando "Todas as empresas".
  const totais = useMemo(() => {
    const porEmp = new Map<string, { itens: number; valor: number }>();
    let valor = 0, semValor = 0;
    for (const i of listaFiltrada) {
      if (i.valor === null) semValor++; else valor += i.valor;
      const k = i.empresa || 'sem';
      const e = porEmp.get(k) || { itens: 0, valor: 0 };
      e.itens++; e.valor += i.valor || 0; porEmp.set(k, e);
    }
    const empresas = [...EMPRESAS_CALD.map(e => ({ k: e.codigo as string, nome: e.curto as string, cor: e.cor as string })), { k: 'sem', nome: 'Sem empresa', cor: C.cinza }]
      .filter(e => porEmp.has(e.k)).map(e => ({ ...e, ...porEmp.get(e.k)! }));
    return { valor, semValor, itens: listaFiltrada.length, pedidos: new Set(listaFiltrada.map(i => i.pedido)).size, empresas };
  }, [listaFiltrada]);

  const tiles: { k: Filtro; rot: string; v: number; cor: string; icon: string; dica: string }[] = [
    { k: 'novos', rot: 'Novos p/ planejar', v: cont.novos, cor: '#b45309', icon: 'bi-inbox', dica: 'Lançados pelo PCP, ainda sem planejamento' },
    { k: 'atrasados', rot: 'Atrasados', v: cont.atrasados, cor: C.vermelho, icon: 'bi-exclamation-triangle', dica: 'Prev. finalização ou previsão de saída da área vencida' },
    { k: 'vence', rot: 'Vencem em 3 dias', v: cont.vence, cor: C.laranja, icon: 'bi-alarm', dica: 'Prev. finalização nos próximos 3 dias' },
    { k: 'parados', rot: `Parados +${DIAS_PARADO}d`, v: cont.parados, cor: C.roxo, icon: 'bi-pause-circle', dica: `Mais de ${DIAS_PARADO} dias na mesma área` },
    { k: 'terceiro', rot: 'Em terceiro', v: cont.terceiro, cor: '#475569', icon: 'bi-truck', dica: cont.terceiroVencido ? `${cont.terceiroVencido} com retorno vencido` : 'Na industrialização (fora)' },
    { k: 'faturar', rot: 'Faturar até domingo', v: cont.faturar, cor: C.verde, icon: 'bi-receipt', dica: 'Prev. faturamento até o fim desta semana, sem faturar' },
  ];

  if (!ok) return null;
  return (
    <AuthGuard>
      <style>{CSS}</style>
      <datalist id="cp-vendedores">{vendedores.map(v => <option key={v} value={v} />)}</datalist>
      <datalist id="cp-clientes">{clientes.map(v => <option key={v} value={v} />)}</datalist>
      <div style={{ width: '100%' }}>
        {/* Cabeçalho */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 14, flexWrap: 'wrap' }}>
          <div>
            <h4 style={{ margin: 0, fontWeight: 800, color: C.azul, fontSize: 22 }}>
              <i className="bi bi-kanban" style={{ marginRight: 8 }} />PCP Caldeiraria
            </h4>
            <small style={{ color: C.fraco }}>
              {planeja
                ? <>O PCP lança os pedidos; aqui você distribui por área, define a <b>ordem</b>, as <b>previsões</b> e registra a <b>entrada</b> de cada item em cada área.</>
                : <>Acompanhe onde está cada pedido da Caldeiraria, área por área. <b>Somente visualização</b> — quem lança e movimenta é o PCP da Caldeiraria.</>}
            </small>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button className="cp-btn" onClick={() => setCaixa(true)}
              style={nPend ? { background: C.vermelho, borderColor: C.vermelho, color: '#fff' } : undefined}
              title="Tudo o que tem prazo vencido — resolver com nova data ou cobrando alguém">
              <i className="bi bi-inbox-fill" />Pendências{nPend ? ` (${nPend})` : ''}
            </button>
            <a href="/analise?fabrica=caldeiraria" className="cp-btn" style={{ textDecoration: 'none' }}><i className="bi bi-graph-up-arrow" />Relatório semanal</a>
            {planeja && <button className="cp-btn" onClick={() => setImportar(true)}><i className="bi bi-file-earmark-arrow-up" />Importar planilha</button>}
            <button className="cp-btn" onClick={() => carregar()} disabled={carregando}><i className="bi bi-arrow-clockwise" />{carregando ? 'Atualizando…' : 'Atualizar'}</button>
            {planeja
              ? <button className="cp-btn pri" onClick={() => setLancar(true)}><i className="bi bi-plus-lg" />Lançar pedido</button>
              : <span className="cp-btn" style={{ cursor: 'default', color: C.cinza }}><i className="bi bi-eye" />Somente visualização</span>}
          </div>
        </div>

        {aviso && <div style={{ position: 'fixed', bottom: 20, left: '50%', transform: 'translateX(-50%)', background: C.azul, color: '#fff', padding: '10px 18px', borderRadius: 10, fontSize: 13, fontWeight: 700, zIndex: 1100, boxShadow: '0 8px 24px rgba(0,0,0,.25)', maxWidth: '92vw' }}>{aviso}</div>}
        {erro && <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 10, padding: 12, color: C.vermelho, marginBottom: 12 }}>{erro}</div>}

        {/* Alertas (clica pra filtrar) */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 8, marginBottom: 14 }}>
          {tiles.map(t => (
            <button key={t.k} className={`cp-tile ${filtro === t.k ? 'on' : ''}`} title={t.dica} onClick={() => setFiltro(filtro === t.k ? 'todos' : t.k)}
              style={{ borderLeft: `4px solid ${t.cor}` }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, fontWeight: 800, color: C.cinza, textTransform: 'uppercase', letterSpacing: .3 }}>
                <i className={`bi ${t.icon}`} style={{ color: t.cor }} />{t.rot}
              </div>
              <div style={{ fontSize: 24, fontWeight: 800, color: t.v ? t.cor : '#cbd5e1', lineHeight: 1.15 }}>{t.v}</div>
            </button>
          ))}
        </div>

        {/* Abas + filtros */}
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 12 }}>
          <button className={`cp-tab ${aba === 'painel' ? 'on' : ''}`} onClick={() => setAba('painel')}><i className="bi bi-columns-gap" />Painel por área</button>
          <button className={`cp-tab ${aba === 'lista' ? 'on' : ''}`} onClick={() => setAba('lista')}><i className="bi bi-table" />Lista (planilha)</button>
          <div style={{ flex: 1 }} />
          <input className="cp-in" style={{ width: 220 }} placeholder="Buscar pedido, material, cliente…" value={busca} onChange={e => setBusca(e.target.value)} />
          <select className="cp-in" style={{ width: 150 }} value={fVend} onChange={e => setFVend(e.target.value)}>
            <option value="">Todos vendedores</option>{vendedores.map(v => <option key={v}>{v}</option>)}
          </select>
          <select className="cp-in" style={{ width: 150 }} value={fCli} onChange={e => setFCli(e.target.value)}>
            <option value="">Todos clientes</option>{clientes.map(v => <option key={v}>{v}</option>)}
          </select>
          {filtro !== 'todos' && <button className="cp-btn sm" onClick={() => setFiltro('todos')}><i className="bi bi-x" />Limpar filtro</button>}
        </div>

        <div style={{ marginBottom: 12 }}><FiltroEmpresa valor={fEmp} onChange={setFEmp} /></div>

        {carregando && !itens.length ? (
          <div style={{ textAlign: 'center', padding: 40, color: C.cinza }}>Carregando…</div>
        ) : aba === 'painel' ? (
          <>
            {/* Colunas por área — arraste o fundo pro lado, ou use as setas */}
            <div className="no-print" style={{ display: 'flex', justifyContent: 'flex-end', gap: 6, marginBottom: 6 }}>
              <button className="cp-btn sm" onClick={() => rolar(-520)} title="Ver colunas à esquerda"><i className="bi bi-chevron-left" /></button>
              <button className="cp-btn sm" onClick={() => rolar(520)} title="Ver colunas à direita"><i className="bi bi-chevron-right" /></button>
            </div>
            <div ref={quadroRef} onMouseDown={panInicio}
              style={{ display: 'flex', gap: 10, overflowX: 'auto', paddingBottom: 10, alignItems: 'flex-start', cursor: panAtivo ? 'grabbing' : 'grab', userSelect: panAtivo ? 'none' : undefined }}>
              {colunas.map(col => (
                <div key={col.codigo} className={`cp-col ${alvoCol === col.codigo ? 'alvo' : ''}`}
                  onDragOver={e => { if (planeja && arrastando && col.codigo !== 'novo') { e.preventDefault(); setAlvoCol(col.codigo); } }}
                  onDragLeave={() => setAlvoCol(a => (a === col.codigo ? null : a))}
                  onDrop={e => { e.preventDefault(); soltar(col.codigo, null); }}>
                  <div style={{ padding: '10px 12px', borderBottom: `3px solid ${col.cor}`, background: '#fff', borderRadius: '12px 12px 0 0' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <i className={`bi ${col.icon}`} style={{ color: col.cor }} />
                      <b style={{ fontSize: 13.5, color: C.texto }}>{col.nome}</b>
                      <span style={{ marginLeft: 'auto', fontSize: 12, fontWeight: 800, color: '#fff', background: col.itens.length ? col.cor : '#cbd5e1', borderRadius: 10, padding: '1px 9px' }}>{col.itens.length}</span>
                    </div>
                    <div style={{ fontSize: 11, color: C.cinza, marginTop: 3 }}>{col.itens.length ? somaPorUnidade(col.itens) : 'vazia'}</div>
                    {verValores && somaValor(col.itens) !== null && <div style={{ fontSize: 11, color: '#065f46', fontWeight: 700 }}>{fmtBRL(somaValor(col.itens))}</div>}
                    {col.codigo === 'novo' && planeja && (
                      <button className="cp-btn sm pri" style={{ marginTop: 8, width: '100%', justifyContent: 'center' }} onMouseDown={e => e.stopPropagation()}
                        onClick={() => setLancar(true)} title="Lançar pedido novo — cai aqui no Início pra você planejar e mandar pras áreas">
                        <i className="bi bi-plus-lg" />Lançar pedido
                      </button>
                    )}
                  </div>
                  <div style={{ padding: 8, display: 'flex', flexDirection: 'column', gap: 7, overflowY: 'auto', minHeight: 60 }}>
                    {col.itens.map((it, idx) => {
                      const s = sit.get(it.id)!;
                      const et = it.etapas.find(e => e.area === it.area_atual);
                      const prio = PRIO[it.prioridade] || PRIO.normal;
                      return (
                        <div key={it.id} className={`cp-card ${arrastando === it.id ? 'drag' : ''}`}
                          draggable={planeja}
                          onDragStart={() => setArrastando(it.id)}
                          onDragEnd={() => { setArrastando(null); setAlvoCol(null); }}
                          onDragOver={e => { if (planeja && arrastando && col.codigo !== 'novo') e.preventDefault(); }}
                          onDrop={e => { e.preventDefault(); e.stopPropagation(); soltar(col.codigo, it.id); }}
                          onClick={() => setAberto(it)}
                          style={{ borderLeft: `4px solid ${s.atrasado || s.areaAtrasada ? C.vermelho : prio.cor}` }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <span style={{ fontSize: 10.5, fontWeight: 800, color: C.fraco }}>#{idx + 1}</span>
                            <b style={{ color: C.azul, fontSize: 13 }}>{it.pedido}</b>
                            <EmpresaTag empresa={it.empresa} />
                            {it.prioridade !== 'normal' && <Chip cor="#fff" bg={prio.cor}>{prio.txt}</Chip>}
                            {it.parcial && <Chip cor="#7c3aed" bg="#ede9fe">Parcial</Chip>}
                          </div>
                          <div style={{ fontSize: 12.5, fontWeight: 600, color: C.texto, margin: '2px 0', lineHeight: 1.3 }}>{it.material}</div>
                          <div style={{ fontSize: 11.5, color: C.cinza }}>{fmtQtd(it.quantidade, it.unidade)}{it.cliente ? ` · ${it.cliente}` : ''}</div>
                          {verValores && it.valor !== null && <div style={{ fontSize: 11.5, color: '#065f46', fontWeight: 700 }}>{fmtBRL(it.valor)}</div>}
                          {col.codigo !== 'novo' && subsetorValido(col.codigo, it.sub_setor) && (
                            <div style={{ fontSize: 11.5, marginTop: 3 }}><b style={{ color: col.cor }}>{col.nome}</b> <span style={{ color: C.texto }}>› {nomeSubsetor(it.sub_setor)}</span></div>
                          )}
                          {it.recado && (
                            <div style={{ marginTop: 4 }} title={`Recado pro Alan${it.recado.mensagem ? `: ${it.recado.mensagem}` : ''} (${it.recado.criado_por_nome || ''})`}>
                              <Chip cor="#92400e" bg="#fef3c7"><i className="bi bi-person-check" />verificar com Alan</Chip>
                            </div>
                          )}
                          {col.codigo === 'novo' && (
                            <div style={{ fontSize: 11, color: C.fraco, marginTop: 2 }}>
                              {it.areas.map(nomeArea).join(' → ') || 'sem roteiro'}{it.criado_por_nome ? ` · lançado por ${it.criado_por_nome}` : ''}
                            </div>
                          )}
                          {it.area_atual === 'industrializacao' && et?.fornecedor && (
                            <div style={{ fontSize: 11.5, color: '#475569', marginTop: 2 }}><i className="bi bi-truck" /> {et.fornecedor}{et.retorno_previsto ? ` · volta ${fmtData(et.retorno_previsto)}` : ''}</div>
                          )}
                          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 6 }}>
                            {s.diasNaArea !== null && <Chip cor={s.parado ? '#fff' : C.cinza} bg={s.parado ? C.roxo : '#f1f5f9'} title={`Entrou em ${fmtData(et?.entrada)}`}><i className="bi bi-clock" />{s.diasNaArea}d aqui</Chip>}
                            {et?.previsao && <Chip cor={s.areaAtrasada ? '#fff' : '#1d4ed8'} bg={s.areaAtrasada ? C.vermelho : '#dbeafe'} title="Previsão de saída desta área">sai {fmtData(et.previsao)}</Chip>}
                            {it.prev_finalizacao && <Chip cor={s.atrasado ? '#fff' : s.venceLogo ? '#92400e' : '#166534'} bg={s.atrasado ? C.vermelho : s.venceLogo ? '#fef3c7' : '#dcfce7'} title="Previsão de finalização">fim {fmtData(it.prev_finalizacao)}</Chip>}
                            {s.terceiroVencido && <Chip cor="#fff" bg={C.vermelho}>retorno vencido</Chip>}
                          </div>
                          {planeja && (
                            <div style={{ marginTop: 7 }} onClick={e => e.stopPropagation()}>
                              {/* Card só com "Mover" (pedido do usuário 25/09): área/setor na
                                  lista, sem arrastar. Ordem na fila = arrastar; finalizar e
                                  demais ações ficam no detalhe (clique no card). */}
                              <button className="cp-btn sm pri" style={{ width: '100%', justifyContent: 'center' }}
                                title="Mover pra outra área ou setor — escolhe na lista"
                                onClick={() => setEnc({ it, area: s.proxima || (col.codigo !== 'novo' ? col.codigo : AREAS_CALD[0].codigo), modo: 'mover' })}>
                                <i className="bi bi-arrow-left-right" />Mover{s.proxima ? ` (próx.: ${nomeArea(s.proxima)})` : ''}
                              </button>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
            {planeja && <div style={{ fontSize: 11.5, color: C.fraco, marginTop: 4 }}><i className="bi bi-info-circle" /> Arraste um <b>card</b> pra outra coluna pra registrar a entrada hoje, ou dentro da coluna pra mudar a ordem (pra outra data, abra o card). Arraste o <b>fundo</b> do painel pro lado pra ver as outras áreas.</div>}
          </>
        ) : (
          <>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 8, flexWrap: 'wrap' }}>
              {(['ativos', 'finalizado', 'cancelado', 'todos'] as const).map(s => (
                <button key={s} className={`cp-btn sm ${statusLista === s ? 'pri' : ''}`} onClick={() => setStatusLista(s)}>
                  {s === 'ativos' ? 'Em aberto' : s === 'finalizado' ? 'Finalizados' : s === 'cancelado' ? 'Cancelados' : 'Todos'}
                </button>
              ))}
              <span style={{ fontSize: 12, color: C.cinza, marginLeft: 6 }}>{listaFiltrada.length} item(ns)</span>
              {planeja && sel.size > 0 && (
                <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap', background: '#eff6ff', border: `1.5px solid ${C.azul2}`, borderRadius: 10, padding: '5px 10px', marginLeft: 8 }}>
                  <b style={{ fontSize: 12.5, color: C.azul }}>{sel.size} selecionado(s)</b>
                  <span style={{ fontSize: 12, color: C.cinza }}>· Empresa:</span>
                  {EMPRESAS_CALD.map(e => (
                    <button key={e.codigo} className="cp-btn sm" disabled={aplicandoLote} style={{ borderColor: e.cor, color: e.cor }}
                      onClick={() => aplicarLote({ empresa: e.codigo }, `Definir empresa ${e.nome}`)}>{e.nome}</button>
                  ))}
                  <span style={{ fontSize: 12, color: C.cinza }}>· Prioridade:</span>
                  <select className="cp-in" style={{ width: 'auto', padding: '4px 8px', fontSize: 12 }} value="" disabled={aplicandoLote}
                    onChange={e => e.target.value && aplicarLote({ prioridade: e.target.value }, `Prioridade ${PRIO[e.target.value]?.txt}`)}>
                    <option value="">escolher…</option>
                    {PRIORIDADES_CALD.map(p => <option key={p} value={p}>{PRIO[p].txt}</option>)}
                  </select>
                  <button className="cp-btn sm" onClick={() => setSel(new Set())}><i className="bi bi-x" />Limpar seleção</button>
                </div>
              )}
              <div style={{ flex: 1 }} />
              {verValores && totais.itens > 0 && (
                <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', background: '#ecfdf5', border: '1.5px solid #a7f3d0', borderRadius: 10, padding: '5px 12px' }}
                  title="Soma do Vlr total dos itens da lista abaixo (conforme os filtros)">
                  <span style={{ fontSize: 11, fontWeight: 800, color: '#065f46', textTransform: 'uppercase', letterSpacing: .3 }}><i className="bi bi-cash-coin" /> Valor total</span>
                  <b style={{ fontSize: 15, color: '#065f46' }}>{fmtBRL(totais.valor)}</b>
                  <span style={{ fontSize: 11.5, color: C.cinza }}>{totais.pedidos} pedido(s) · {totais.itens} item(ns)</span>
                  {totais.semValor > 0 && <span style={{ fontSize: 11.5, color: '#92400e' }} title="Itens sem valor não entram no total">· {totais.semValor} sem valor</span>}
                  {!fEmp && totais.empresas.length > 1 && totais.empresas.map(e => (
                    <span key={e.k} style={{ fontSize: 11.5, color: C.texto, borderLeft: `1px solid #a7f3d0`, paddingLeft: 8 }}>
                      <b style={{ color: e.cor }}>{e.nome}</b> {fmtBRL(e.valor)}
                    </span>
                  ))}
                </div>
              )}
              <button className="cp-btn sm" onClick={exportarExcel}><i className="bi bi-file-earmark-excel" />Exportar Excel</button>
            </div>
            <div style={{ overflowX: 'auto', border: `1px solid ${C.borda}`, borderRadius: 10, background: '#fff', maxHeight: 'calc(100vh - 330px)' }}>
              <table className="cp-tbl">
                <thead>
                  <tr>
                    {planeja && (
                      <th style={{ width: 28 }}>
                        <input type="checkbox" title="Selecionar todos os itens da lista"
                          checked={listaFiltrada.length > 0 && listaFiltrada.every(i => sel.has(i.id))}
                          onChange={e => setSel(e.target.checked ? new Set(listaFiltrada.map(i => i.id)) : new Set())} />
                      </th>
                    )}
                    <th>Pedido</th><th>Empresa</th><th>Vendedor</th><th>Material</th><th>Qtd</th><th>Cliente</th><th>Situação</th>
                    {AREAS_CALD.map(a => <th key={a.codigo} style={{ color: a.cor }}>{a.nome}</th>)}
                    <th>Prev. fat.</th><th>Prev. final.</th><th>Finalizado</th>{verValores && <><th>Vlr unit.</th><th>Vlr total</th></>}<th>Obs</th>
                  </tr>
                </thead>
                <tbody>
                  {listaFiltrada.map(it => {
                    const s = sit.get(it.id)!;
                    const st = STATUS_TXT[it.status];
                    return (
                      <tr key={it.id} className="cl" onClick={() => setAberto(it)} style={sel.has(it.id) ? { background: '#eff6ff' } : undefined}>
                        {planeja && (
                          <td onClick={e => e.stopPropagation()}>
                            <input type="checkbox" checked={sel.has(it.id)}
                              onChange={() => setSel(v => { const n = new Set(v); if (n.has(it.id)) n.delete(it.id); else n.add(it.id); return n; })} />
                          </td>
                        )}
                        <td style={{ fontWeight: 800, color: C.azul, whiteSpace: 'nowrap' }}>{it.pedido}</td>
                        <td><EmpresaTag empresa={it.empresa} /></td>
                        <td>{it.vendedor || '—'}</td>
                        <td style={{ minWidth: 180 }}>{it.material}{it.parcial && <> <Chip cor="#7c3aed" bg="#ede9fe">Parcial</Chip></>}</td>
                        <td style={{ whiteSpace: 'nowrap' }}>{fmtQtd(it.quantidade, it.unidade)}</td>
                        <td>{it.cliente || '—'}</td>
                        <td><Chip cor={st.cor} bg={st.bg}>{it.status === 'andamento' ? nomeArea(it.area_atual) : st.txt}</Chip>
                          {it.status === 'andamento' && subsetorValido(it.area_atual || '', it.sub_setor) && <div style={{ fontSize: 11, color: C.cinza, whiteSpace: 'nowrap' }}>› {nomeSubsetor(it.sub_setor)}</div>}
                          {it.recado && <div><Chip cor="#92400e" bg="#fef3c7">verificar c/ Alan</Chip></div>}
                          {(s.atrasado || s.areaAtrasada) && <div><Chip cor="#fff" bg={C.vermelho}>atrasado</Chip></div>}</td>
                        {AREAS_CALD.map(a => {
                          const e = it.etapas.find(x => x.area === a.codigo);
                          const naRota = it.areas.includes(a.codigo);
                          const atual = it.status === 'andamento' && it.area_atual === a.codigo;
                          return (
                            <td key={a.codigo} style={{ whiteSpace: 'nowrap', textAlign: 'center', background: atual ? a.cor + '22' : undefined, fontWeight: atual ? 800 : 500, color: !naRota ? '#cbd5e1' : C.texto }}>
                              {!naRota ? 'N/A' : e?.entrada ? fmtData(e.entrada) : '·'}
                              {a.codigo === 'industrializacao' && e?.fornecedor && <div style={{ fontSize: 10.5, color: C.cinza }}>{e.fornecedor}</div>}
                            </td>
                          );
                        })}
                        <td style={{ whiteSpace: 'nowrap' }}>{it.faturado_em ? <span style={{ color: C.verde, fontWeight: 700 }}>fat. {fmtData(it.faturado_em)}</span> : fmtData(it.prev_faturamento) || '—'}</td>
                        <td style={{ whiteSpace: 'nowrap', color: s.atrasado ? C.vermelho : undefined, fontWeight: s.atrasado ? 800 : 500 }}>{fmtData(it.prev_finalizacao) || '—'}</td>
                        <td style={{ whiteSpace: 'nowrap' }}>{fmtData(it.finalizado_em) || '—'}</td>
                        {verValores && <><td style={{ whiteSpace: 'nowrap', textAlign: 'right' }}>{fmtBRL(valorUnitario(it))}</td><td style={{ whiteSpace: 'nowrap', textAlign: 'right', fontWeight: 700 }}>{fmtBRL(it.valor)}</td></>}
                        <td style={{ minWidth: 160, fontSize: 11.5, color: C.cinza }}>{it.obs || ''}</td>
                      </tr>
                    );
                  })}
                  {!listaFiltrada.length && <tr><td colSpan={24} style={{ textAlign: 'center', color: C.fraco, padding: 24 }}>Nenhum item.</td></tr>}
                </tbody>
                {verValores && listaFiltrada.length > 0 && (
                  <tfoot>
                    <tr style={{ background: '#ecfdf5', position: 'sticky', bottom: 0 }}>
                      <td colSpan={(planeja ? 1 : 0) + 7 + AREAS_CALD.length + 3} style={{ fontWeight: 800, color: '#065f46', textAlign: 'right', whiteSpace: 'nowrap' }}>
                        TOTAL · {totais.itens} item(ns){totais.semValor > 0 ? ` (${totais.semValor} sem valor)` : ''}
                      </td>
                      <td />
                      <td style={{ whiteSpace: 'nowrap', textAlign: 'right', fontWeight: 800, color: '#065f46' }}>{fmtBRL(totais.valor)}</td>
                      <td />
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </>
        )}
      </div>

      {enc && <EncaminharModal item={enc.it} area={enc.area} modo={enc.modo} onConfirmar={confirmarEnc} onFechar={() => setEnc(null)} />}
      {lancar && (
        <LancarModal vendedores={vendedores} clientes={clientes} verValores={verValores}
          onFechar={() => setLancar(false)}
          onLancado={n => { setLancar(false); mostrarAviso(`${n} item(ns) lançado(s) — aguardando planejamento.`); carregar(true); }} />
      )}
      {importar && (
        <ImportarModal onFechar={() => setImportar(false)} onImportado={m => { setImportar(false); mostrarAviso(m); carregar(true); }} />
      )}
      {caixa && (
        <CaixaPendencias itens={itens} podePlanejar={planeja}
          onFechar={() => setCaixa(false)} onAbrirItem={it => setAberto(it)} onAtualizado={atualizarItem} />
      )}
      {aberto && (
        <ItemDetalhe key={aberto.id} item={aberto}
          irmaos={itens.filter(x => x.pedido === aberto.pedido && x.id !== aberto.id && x.status !== 'cancelado')} podePlanejar={planeja} verValores={verValores}
          onFechar={() => setAberto(null)} onAtualizado={atualizarItem} />
      )}
    </AuthGuard>
  );
}

