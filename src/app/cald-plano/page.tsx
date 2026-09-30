'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import AuthGuard from '@/components/AuthGuard';
import api, { postIdempotente } from '@/lib/api';
import { podeLancarCaldeiraria, podePlanejarCaldeiraria, podeVerValores } from '@/lib/auth';
import {
  AREAS_CALD, EMPRESAS_CALD, valorUnitario, PRIORIDADES_CALD, situacaoItem, pendenciasItem, passaEmpresa, nomeEmpresa, hojeISO, fmtData, inicioSemana, somarDias, DIAS_PARADO,
  SUBSETORES_CALD, SUBSETORES_VERIFICAR_ALAN, nomeSubsetor, subsetorValido, type ItemCald,
} from '@/lib/caldPlano';
import { C, CSS, Chip, PRIO, STATUS_TXT, nomeArea, fmtQtd, fmtBRL, somaPorUnidade, somaValor, EmpresaTag, FiltroEmpresa, erroDe } from './comum';
import LancarModal from './LancarModal';
import EncaminharModal, { type Encaminhamento, DESTINO_FINALIZADO } from './EncaminharModal';
import ItemDetalhe from './ItemDetalhe';
import ImportarModal from './ImportarModal';
import ImprimirModal from './ImprimirModal';
import CaixaPendencias from './CaixaPendencias';

// Planejamento da Caldeiraria — tela do coordenador ("o Reginaldo da
// Caldeiraria"). PCP / quem sabe do pedido LANÇA; o coordenador vê a carga de
// cada área, define a ordem, as previsões e anda com os itens. O relatório
// semanal (diretoria/contabilidade) fica na Análise PCP → Caldeiraria.

type Filtro = 'todos' | 'novos' | 'atrasados' | 'vence' | 'parados' | 'terceiro' | 'faturar';
const PRIO_PESO: Record<string, number> = { urgente: 0, alta: 1, normal: 2, baixa: 3 };
// Agrupa os materiais de uma coluna por pedido, na ordem em que aparecem.
function agruparPorPedido(l: ItemCald[]): { pedido: string; lista: ItemCald[] }[] {
  const m = new Map<string, ItemCald[]>();
  for (const i of l) m.set(i.pedido, [...(m.get(i.pedido) || []), i]);
  return Array.from(m, ([pedido, lista]) => ({ pedido, lista }));
}

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
  const [imprimir, setImprimir] = useState(false);
  const [caixa, setCaixa] = useState(false);
  // Seleção em massa na Lista (definir empresa / prioridade de vários de uma vez).
  const [sel, setSel] = useState<Set<number>>(new Set());
  const [aplicandoLote, setAplicandoLote] = useState(false);
  const [aberto, setAberto] = useState<ItemCald | null>(null);
  // Encaminhar (área geral + sub-setor opcional) — abre ao arrastar/avançar pra
  // área com sub-setores, ou no botão "Setor" do card (troca dentro da área).
  const [enc, setEnc] = useState<{ it: ItemCald; lista?: ItemCald[]; area: string; modo: 'mover' | 'subsetor' } | null>(null);
  // Materiais marcados dentro dos cards de pedido (mover só os selecionados).
  const [marcados, setMarcados] = useState<Set<number>>(new Set());
  // Cards de pedido ABERTOS (chave coluna|pedido) — vêm fechados com um resumo;
  // clica pra ver os materiais e movimentar.
  const [abertos, setAbertos] = useState<Set<string>>(new Set());
  const alternarCard = (k: string) => setAbertos(v => { const n = new Set(v); if (n.has(k)) n.delete(k); else n.add(k); return n; });
  const [arrastando, setArrastando] = useState<number[] | null>(null);
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

  // Aviso no rodapé. Depois de mover, leva o botão "Desfazer" (fica 10s) —
  // desfaz a última movimentação de cada material movido.
  const [avisoDesfazer, setAvisoDesfazer] = useState<ItemCald[] | null>(null);
  const avisoTimer = useRef<ReturnType<typeof setTimeout>>();
  const mostrarAviso = (t: string, desfazer: ItemCald[] | null = null) => {
    setAviso(t); setAvisoDesfazer(desfazer && desfazer.length ? desfazer : null);
    clearTimeout(avisoTimer.current);
    avisoTimer.current = setTimeout(() => { setAviso(''); setAvisoDesfazer(null); }, desfazer ? 10000 : 4000);
  };
  async function desfazerMov(lista: ItemCald[]) {
    setAviso(''); setAvisoDesfazer(null);
    let ok = 0;
    for (const it of lista) {
      try { await postIdempotente(`/api/cald-plano/${it.id}`, { acao: 'desfazer' }); ok++; } catch { /* segue */ }
    }
    await carregar(true);
    mostrarAviso(ok === lista.length ? `Desfeito — ${ok} material(is) voltaram.` : `Desfeito ${ok} de ${lista.length} — confira os demais no detalhe.`);
  }
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
      // Finalizados (últimos 30 dias) — destino final dos materiais. Recebe drop
      // (= Finalizar); dali o "Mover" devolve pra uma área, se foi engano.
      { codigo: DESTINO_FINALIZADO, nome: 'Finalizados', icon: 'bi-check2-all', cor: C.verde,
        itens: itens.filter(i => i.status === 'finalizado' && (i.finalizado_em || '') >= somarDias(hoje, -30) && passaFiltro(i))
          .sort((a, b) => (b.finalizado_em || '').localeCompare(a.finalizado_em || '') || b.id - a.id) },
    ];
    return cols;
  }, [ativos, itens, hoje, passaFiltro]);

  // Move/finaliza UM OU VÁRIOS materiais. `quantidade` (só com 1 material) =
  // PARCIAL: o servidor separa essa quantidade e só ela anda (igual ao Flange).
  async function moverVarios(lista: ItemCald[], area: string, extra?: { sub_setor: string | null; obs: string }, quantidade?: number | null) {
    const movidos: ItemCald[] = [];
    let separou = false;
    for (const it of lista) {
      try {
        const body = area === DESTINO_FINALIZADO ? { acao: 'finalizar' }
          : area === 'aguardando' ? { acao: 'aguardando' } : { acao: 'mover', area, ...extra };
        const r = await postIdempotente<{ item: ItemCald; separado?: number }>(`/api/cald-plano/${it.id}`,
          lista.length === 1 && quantidade ? { ...body, quantidade } : body);
        if (r.separado) separou = true; else atualizarItem(r.item);
        movidos.push(r.item);
      } catch { /* conta abaixo */ }
    }
    if (separou) await carregar(true);
    setMarcados(v => { const n = new Set(v); lista.forEach(i => n.delete(i.id)); return n; });
    const destino = area === DESTINO_FINALIZADO ? 'Finalizados' : area === 'aguardando' ? 'Chegando' : `${nomeArea(area)}${extra?.sub_setor ? ` › ${nomeSubsetor(extra.sub_setor)}` : ''}`;
    const p = lista[0];
    const oque = lista.length === 1
      ? `${p.material}${quantidade && p.quantidade && quantidade < p.quantidade ? ` (parcial ${fmtQtd(quantidade, p.unidade)} de ${fmtQtd(p.quantidade, p.unidade)})` : ''}`
      : `${movidos.length} materiais`;
    if (!movidos.length) { mostrarAviso('Não foi possível mover.'); return; }
    mostrarAviso(`Pedido ${p.pedido} · ${oque} → ${destino} (${fmtData(hoje)})${movidos.length < lista.length ? ` · ${lista.length - movidos.length} falharam` : ''}`, movidos);
  }
  const finalizar = (lista: ItemCald[]) => moverVarios(lista, DESTINO_FINALIZADO);
  // Área com sub-setores → pergunta o setor (e observação pro Alan); sem → move direto.
  function encaminhar(lista: ItemCald[], area: string) {
    if ((SUBSETORES_CALD[area] || []).length) setEnc({ it: lista[0], lista, area, modo: 'mover' });
    else moverVarios(lista, area);
  }
  async function confirmarEnc(e: Encaminhamento) {
    if (!enc) return;
    const { it, modo } = enc;
    const lista = enc.lista || [it];
    setEnc(null);
    if (e.area === DESTINO_FINALIZADO) return moverVarios(lista, DESTINO_FINALIZADO, undefined, e.quantidade);
    // "Mover" pra um setor da MESMA área em que o item já está = só troca o setor.
    const mesmaArea = lista.length === 1 && it.status === 'andamento' && e.area === it.area_atual;
    if (modo === 'mover' && !mesmaArea) return moverVarios(lista.filter(x => !(x.status === 'andamento' && x.area_atual === e.area)), e.area, { sub_setor: e.sub_setor, obs: e.obs }, e.quantidade);
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
  const colDe = (it: ItemCald) => it.status === 'novo' || it.status === 'aguardando' ? 'novo' : it.status === 'finalizado' ? DESTINO_FINALIZADO : it.area_atual;
  // Solta o CARD DO PEDIDO (todos os materiais dele naquela coluna) em outra
  // coluna = move tudo; na mesma coluna, sobre outro pedido = muda a ordem.
  function soltar(colCodigo: string, sobrePedido: string | null) {
    const ids = arrastando;
    setArrastando(null); setAlvoCol(null);
    if (!ids?.length) return;
    const lista = itens.filter(i => ids.includes(i.id));
    if (!lista.length || colCodigo === 'novo') return;
    const colAtual = colDe(lista[0]);
    if (colCodigo === DESTINO_FINALIZADO) {
      if (colAtual !== DESTINO_FINALIZADO) finalizar(lista);
      return;
    }
    if (colAtual !== colCodigo) { encaminhar(lista, colCodigo); return; }
    if (!sobrePedido || sobrePedido === lista[0].pedido) return;
    const naCol = colunas.find(c => c.codigo === colCodigo)?.itens || [];
    const resto = naCol.filter(i => !ids.includes(i.id));
    const k = resto.findIndex(i => i.pedido === sobrePedido);
    const nova = [...resto.slice(0, k < 0 ? resto.length : k), ...lista, ...resto.slice(k < 0 ? resto.length : k)];
    salvarOrdem(colCodigo, nova.map(i => i.id));
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
            <button className="cp-btn" onClick={() => setImprimir(true)} title="Imprimir todos os pedidos, um pedido ou os materiais por área"><i className="bi bi-printer" />Imprimir</button>
            {planeja && <button className="cp-btn" onClick={() => setImportar(true)}><i className="bi bi-file-earmark-arrow-up" />Importar planilha</button>}
            <button className="cp-btn" onClick={() => carregar()} disabled={carregando}><i className="bi bi-arrow-clockwise" />{carregando ? 'Atualizando…' : 'Atualizar'}</button>
            {planeja
              ? <button className="cp-btn pri" onClick={() => setLancar(true)}><i className="bi bi-plus-lg" />Lançar pedido</button>
              : <span className="cp-btn" style={{ cursor: 'default', color: C.cinza }}><i className="bi bi-eye" />Somente visualização</span>}
          </div>
        </div>

        {aviso && <div style={{ position: 'fixed', bottom: 20, left: '50%', transform: 'translateX(-50%)', background: C.azul, color: '#fff', padding: '10px 18px', borderRadius: 10, fontSize: 13, fontWeight: 700, zIndex: 1100, boxShadow: '0 8px 24px rgba(0,0,0,.25)', maxWidth: '92vw', display: 'flex', alignItems: 'center', gap: 12 }}>
          <span>{aviso}</span>
          {avisoDesfazer && planeja && (
            <button onClick={() => desfazerMov(avisoDesfazer)} style={{ background: '#fff', color: C.azul, border: 'none', borderRadius: 7, padding: '5px 12px', fontSize: 12.5, fontWeight: 800, cursor: 'pointer', whiteSpace: 'nowrap' }}>
              <i className="bi bi-arrow-return-left" style={{ marginRight: 4 }} />Desfazer
            </button>
          )}
        </div>}
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
          {/* Acompanhamento HRM (planilha do Alan) — o Val vê em modo leitura. */}
          <button className="cp-tab" onClick={() => router.push('/pcp-hrm/acompanhamento')}><i className="bi bi-clipboard-data" />Acompanhamento HRM</button>
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
              <button className="cp-btn sm ok" title="Ir pra coluna Finalizados (fim do painel)"
                onClick={() => quadroRef.current?.scrollTo({ left: quadroRef.current.scrollWidth, behavior: 'smooth' })}>
                <i className="bi bi-check2-all" />Finalizados ({colunas.find(c => c.codigo === DESTINO_FINALIZADO)?.itens.length || 0})
              </button>
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
                      <span style={{ marginLeft: 'auto', fontSize: 12, fontWeight: 800, color: '#fff', background: col.itens.length ? col.cor : '#cbd5e1', borderRadius: 10, padding: '1px 9px' }} title="Pedidos nesta coluna">{new Set(col.itens.map(i => i.pedido)).size}</span>
                    </div>
                    <div style={{ fontSize: 11, color: C.cinza, marginTop: 3 }}>{col.itens.length ? `${col.itens.length} ${col.itens.length === 1 ? 'material' : 'materiais'} · ${somaPorUnidade(col.itens)}` : 'vazia'}</div>
                    {verValores && somaValor(col.itens) !== null && <div style={{ fontSize: 11, color: '#065f46', fontWeight: 700 }}>{fmtBRL(somaValor(col.itens))}</div>}
                    {col.codigo === 'novo' && planeja && (
                      <button className="cp-btn sm pri" style={{ marginTop: 8, width: '100%', justifyContent: 'center' }} onMouseDown={e => e.stopPropagation()}
                        onClick={() => setLancar(true)} title="Lançar pedido novo — cai aqui no Início pra você planejar e mandar pras áreas">
                        <i className="bi bi-plus-lg" />Lançar pedido
                      </button>
                    )}
                  </div>
                  <div style={{ padding: 8, display: 'flex', flexDirection: 'column', gap: 7, overflowY: 'auto', minHeight: 60 }}>
                    {/* UM CARD POR PEDIDO (pedido do usuário 28/09): os materiais do pedido
                        que estão nesta coluna ficam dentro dele. Manda tudo de uma vez,
                        só os marcados, ou um material — inclusive PARCIAL (parte da qtd). */}
                    {agruparPorPedido(col.itens).map(({ pedido, lista }, idx) => {
                      const p = lista[0];
                      const fin = col.codigo === DESTINO_FINALIZADO;
                      const sits = lista.map(i => sit.get(i.id)!);
                      const atrasado = sits.some(s => s.atrasado || s.areaAtrasada);
                      const prioCod = lista.reduce((m, i) => ((PRIO_PESO[i.prioridade] ?? 2) < (PRIO_PESO[m] ?? 2) ? i.prioridade : m), 'normal');
                      const prio = PRIO[prioCod] || PRIO.normal;
                      const selNoCard = lista.filter(i => marcados.has(i.id));
                      const proxComum = sits.every(s => s.proxima && s.proxima === sits[0].proxima) ? sits[0].proxima : null;
                      const padrao = col.codigo !== 'novo' ? col.codigo : AREAS_CALD[0].codigo;
                      const abrirEnc = (l: ItemCald[]) => setEnc({
                        it: l[0], lista: l, modo: 'mover',
                        area: fin ? '' : l.length === 1 ? sit.get(l[0].id)!.proxima || padrao : proxComum || padrao,
                      });
                      const total = somaValor(lista);
                      const arrastandoEste = !!arrastando && lista.some(i => arrastando.includes(i.id));
                      const chave = `${col.codigo}|${pedido}`;
                      const expandido = abertos.has(chave);
                      const nomesUnicos = Array.from(new Set(lista.map(i => i.material)));
                      const nomesResumo = nomesUnicos.slice(0, 2).join(' · ');
                      const outros = nomesUnicos.length - 2;
                      const dias = sits.map(s => s.diasNaArea).filter((d): d is number => d !== null);
                      const maxDias = dias.length ? Math.max(...dias) : null;
                      const algumParado = sits.some(s => s.parado);
                      const nAtrasados = sits.filter(s => s.atrasado || s.areaAtrasada).length;
                      const nParciais = lista.filter(i => i.parcial).length;
                      const nRecados = lista.filter(i => i.recado).length;
                      return (
                        <div key={pedido} className={`cp-card ${arrastandoEste ? 'drag' : ''}`}
                          draggable={planeja}
                          onDragStart={() => setArrastando(lista.map(i => i.id))}
                          onDragEnd={() => { setArrastando(null); setAlvoCol(null); }}
                          onDragOver={e => { if (planeja && arrastando && col.codigo !== 'novo') e.preventDefault(); }}
                          onDrop={e => { e.preventDefault(); e.stopPropagation(); soltar(col.codigo, pedido); }}
                          onClick={() => alternarCard(chave)}
                          title={expandido ? 'Clique pra fechar' : 'Clique pra ver os materiais e movimentar'}
                          style={{ borderLeft: `4px solid ${atrasado ? C.vermelho : prio.cor}` }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                            <span style={{ fontSize: 10.5, fontWeight: 800, color: C.fraco }}>#{idx + 1}</span>
                            <b style={{ color: C.azul, fontSize: 13 }}>{pedido}</b>
                            <EmpresaTag empresa={p.empresa} />
                            {prioCod !== 'normal' && <Chip cor="#fff" bg={prio.cor}>{prio.txt}</Chip>}
                            <i className={`bi ${expandido ? 'bi-chevron-up' : 'bi-chevron-down'}`} style={{ marginLeft: 'auto', color: C.cinza }} />
                          </div>
                          <div style={{ fontSize: 11.5, color: C.cinza }}>
                            {p.cliente || '—'} · <b style={{ color: C.texto }}>{lista.length}</b> {lista.length === 1 ? 'material' : 'materiais'}
                            {verValores && total !== null && <> · <b style={{ color: '#065f46' }}>{fmtBRL(total)}</b></>}
                          </div>
                          {!expandido && (
                            // RESUMO do card fechado
                            <div style={{ marginTop: 4 }}>
                              <div style={{ fontSize: 12, color: C.texto, lineHeight: 1.3 }}>
                                {nomesResumo}{outros > 0 && <span style={{ color: C.cinza }}> +{outros} outro(s)</span>}
                              </div>
                              <div style={{ fontSize: 11.5, color: C.cinza, marginTop: 2 }}>{somaPorUnidade(lista)}</div>
                              <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 5 }}>
                                {fin
                                  ? <Chip cor="#166534" bg="#dcfce7"><i className="bi bi-check2-all" />finalizado {fmtData(lista.map(i => i.finalizado_em || '').sort().pop())}</Chip>
                                  : maxDias !== null && <Chip cor={algumParado ? '#fff' : C.cinza} bg={algumParado ? C.roxo : '#f1f5f9'}><i className="bi bi-clock" />{maxDias}d aqui</Chip>}
                                {nAtrasados > 0 && <Chip cor="#fff" bg={C.vermelho}><i className="bi bi-exclamation-triangle-fill" />{nAtrasados} atrasado(s)</Chip>}
                                {nParciais > 0 && <Chip cor="#7c3aed" bg="#ede9fe">{nParciais} parcial(is)</Chip>}
                                {nRecados > 0 && <Chip cor="#92400e" bg="#fef3c7"><i className="bi bi-person-check" />{nRecados} recado(s)</Chip>}
                                {!fin && proxComum && <Chip cor="#1d4ed8" bg="#dbeafe">próx.: {nomeArea(proxComum)}</Chip>}
                              </div>
                              <div style={{ fontSize: 11, color: C.azul2, fontWeight: 700, marginTop: 5 }}>
                                <i className="bi bi-hand-index" /> Clique pra ver {lista.length === 1 ? 'o material' : `os ${lista.length} materiais`} e movimentar
                              </div>
                            </div>
                          )}
                          {expandido && <div style={{ marginTop: 5, display: 'flex', flexDirection: 'column', gap: 4 }}>
                            {lista.map(it => {
                              const s = sit.get(it.id)!;
                              const et = it.etapas.find(e => e.area === it.area_atual);
                              const on = marcados.has(it.id);
                              return (
                                <div key={it.id} onClick={e => { e.stopPropagation(); setAberto(it); }} title="Abrir o material"
                                  style={{ display: 'flex', gap: 6, alignItems: 'flex-start', background: on ? '#eff6ff' : '#f8fafc', border: `1px solid ${on ? C.azul2 : '#e2e8f0'}`, borderRadius: 7, padding: '5px 6px', cursor: 'pointer' }}>
                                  {planeja && lista.length > 1 && (
                                    <input type="checkbox" checked={on} onClick={e => e.stopPropagation()} style={{ marginTop: 2 }}
                                      onChange={e => { const marcar = e.target.checked; setMarcados(v => { const n = new Set(v); if (marcar) n.add(it.id); else n.delete(it.id); return n; }); }} />
                                  )}
                                  <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{ fontSize: 12, fontWeight: 600, color: C.texto, lineHeight: 1.25 }}>{it.material}</div>
                                    <div style={{ fontSize: 11, color: C.cinza, display: 'flex', gap: 4, flexWrap: 'wrap', alignItems: 'center', marginTop: 2 }}>
                                      <span>{fmtQtd(it.quantidade, it.unidade)}</span>
                                      {verValores && it.valor !== null && <span style={{ color: '#065f46', fontWeight: 700 }}>· {fmtBRL(it.valor)}</span>}
                                      {it.parcial && <Chip cor="#7c3aed" bg="#ede9fe">Parcial</Chip>}
                                      {fin
                                        ? <Chip cor="#166534" bg="#dcfce7"><i className="bi bi-check2-all" />{fmtData(it.finalizado_em)}</Chip>
                                        : s.diasNaArea !== null && <Chip cor={s.parado ? '#fff' : C.cinza} bg={s.parado ? C.roxo : '#f1f5f9'} title={`Entrou em ${fmtData(et?.entrada)}`}><i className="bi bi-clock" />{s.diasNaArea}d</Chip>}
                                      {!fin && et?.previsao && <Chip cor={s.areaAtrasada ? '#fff' : '#1d4ed8'} bg={s.areaAtrasada ? C.vermelho : '#dbeafe'} title="Previsão de saída desta área">sai {fmtData(et.previsao)}</Chip>}
                                      {!fin && it.prev_finalizacao && <Chip cor={s.atrasado ? '#fff' : s.venceLogo ? '#92400e' : '#166534'} bg={s.atrasado ? C.vermelho : s.venceLogo ? '#fef3c7' : '#dcfce7'} title="Previsão de finalização">fim {fmtData(it.prev_finalizacao)}</Chip>}
                                      {s.terceiroVencido && <Chip cor="#fff" bg={C.vermelho}>retorno vencido</Chip>}
                                    </div>
                                    {col.codigo !== 'novo' && !fin && subsetorValido(col.codigo, it.sub_setor) && (
                                      <div style={{ fontSize: 11, marginTop: 2 }}><b style={{ color: col.cor }}>{col.nome}</b> › {nomeSubsetor(it.sub_setor)}</div>
                                    )}
                                    {it.recado && (
                                      <div style={{ marginTop: 3 }} title={`Recado pra área${it.recado.mensagem ? `: ${it.recado.mensagem}` : ''} (${it.recado.criado_por_nome || ''})`}>
                                        <Chip cor="#92400e" bg="#fef3c7"><i className="bi bi-person-check" />{it.recado.sub_setor && SUBSETORES_VERIFICAR_ALAN.has(it.recado.sub_setor) ? 'verificar com Alan' : 'recado p/ área'}</Chip>
                                      </div>
                                    )}
                                    {!fin && it.area_atual === 'industrializacao' && et?.fornecedor && (
                                      <div style={{ fontSize: 11, color: '#475569', marginTop: 2 }}><i className="bi bi-truck" /> {et.fornecedor}{et.retorno_previsto ? ` · volta ${fmtData(et.retorno_previsto)}` : ''}</div>
                                    )}
                                  </div>
                                  {planeja && (
                                    <button className="cp-btn sm" title="Mover só este material (dá pra mandar parte da quantidade)" style={{ padding: '2px 7px' }}
                                      onClick={e => { e.stopPropagation(); abrirEnc([it]); }}><i className="bi bi-arrow-right" /></button>
                                  )}
                                </div>
                              );
                            })}
                          </div>}
                          {expandido && col.codigo === 'novo' && (
                            <div style={{ fontSize: 11, color: C.fraco, marginTop: 4 }}>
                              {p.areas.map(nomeArea).join(' → ') || 'sem roteiro'}{p.criado_por_nome ? ` · lançado por ${p.criado_por_nome}` : ''}
                            </div>
                          )}
                          {planeja && expandido && (
                            <div style={{ marginTop: 7, display: 'flex', gap: 5 }} onClick={e => e.stopPropagation()}>
                              <button className="cp-btn sm pri" style={{ flex: 1, justifyContent: 'center' }}
                                title={lista.length === 1 ? 'Mover pra outra área ou setor (dá pra mandar parte da quantidade)' : 'Mover TODOS os materiais deste pedido que estão nesta coluna'}
                                onClick={() => abrirEnc(lista)}>
                                <i className="bi bi-arrow-left-right" />
                                {fin ? (lista.length === 1 ? 'Voltar pra produção' : `Voltar tudo (${lista.length})`)
                                  : lista.length === 1 ? `Mover${sits[0].proxima ? ` (próx.: ${nomeArea(sits[0].proxima)})` : ''}` : `Mover tudo (${lista.length})`}
                              </button>
                              {lista.length > 1 && (
                                <button className="cp-btn sm" disabled={!selNoCard.length} style={{ flex: 1, justifyContent: 'center' }}
                                  title="Mover só os materiais marcados" onClick={() => abrirEnc(selNoCard)}>
                                  <i className="bi bi-check2-square" />Marcados ({selNoCard.length})
                                </button>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
            {planeja && <div style={{ fontSize: 11.5, color: C.fraco, marginTop: 4 }}><i className="bi bi-info-circle" /> Cada <b>card é um pedido</b>: arraste pra outra coluna pra mandar todos os materiais dele (entrada hoje), ou use <b>Mover tudo</b> / <b>Marcados</b> / a setinha de um material — ali dá pra mandar só <b>parte da quantidade</b> (parcial). Arraste dentro da coluna pra mudar a ordem. Arraste o <b>fundo</b> do painel pro lado pra ver as outras áreas.</div>}
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
                          {it.recado && <div><Chip cor="#92400e" bg="#fef3c7">{it.recado.sub_setor && SUBSETORES_VERIFICAR_ALAN.has(it.recado.sub_setor) ? 'verificar c/ Alan' : 'recado p/ área'}</Chip></div>}
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

      {enc && <EncaminharModal item={enc.it} lista={enc.lista} area={enc.area} modo={enc.modo} onConfirmar={confirmarEnc} onFechar={() => setEnc(null)} />}
      {lancar && (
        <LancarModal vendedores={vendedores} clientes={clientes} verValores={verValores}
          onFechar={() => setLancar(false)}
          onLancado={n => { setLancar(false); mostrarAviso(`${n} item(ns) lançado(s) — aguardando planejamento.`); carregar(true); }} />
      )}
      {imprimir && <ImprimirModal itens={itens} verValores={verValores} onFechar={() => setImprimir(false)} />}
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
          onFechar={() => setAberto(null)}
          // Outro id = o detalhe separou ou juntou uma parcial → recarrega a lista toda.
          onAtualizado={it => { if (aberto && it.id !== aberto.id) carregar(true); else atualizarItem(it); }} />
      )}
    </AuthGuard>
  );
}

