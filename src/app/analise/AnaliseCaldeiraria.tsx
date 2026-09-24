'use client';
// Análise PCP → CALDEIRARIA. Relatório semanal pra diretoria/contabilidade,
// alimentado pelo Planejamento da Caldeiraria (/cald-plano): o que CHEGOU, o
// que está EM PRODUÇÃO, o que foi FINALIZADO/FATURADO na semana e o que está
// PREVISTO pras próximas semanas. Semana = segunda a domingo.
import { useEffect, useMemo, useState } from 'react';
import { getToken, podeVerValores, podeLancarCaldeiraria } from '@/lib/auth';
import {
  AREAS_CALD, AREA_POR_CODIGO, hojeISO, fmtData, inicioSemana, somarDias, dataChegada,
  situacaoItem, type ItemCald,
} from '@/lib/caldPlano';

const C = { azul: '#1a3a5c', azul2: '#1d4ed8', verde: '#16a34a', laranja: '#d97706', vermelho: '#dc2626', roxo: '#7c3aed', cinza: '#64748b', teal: '#0d9488' };
const nomeArea = (c: string | null) => (c ? AREA_POR_CODIGO[c]?.nome ?? c : '—');
const fmtN = (n: number, d = 0) => n.toLocaleString('pt-BR', { maximumFractionDigits: d });
const fmtBRL = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
const lblSemana = (ini: string) => `${fmtData(ini).slice(0, 5)} a ${fmtData(somarDias(ini, 6))}`;

type Grupo = 'chegaram' | 'producao' | 'finalizados' | 'faturados' | 'previstos' | 'atrasados';

function somaUn(itens: ItemCald[]): string {
  const m = new Map<string, number>();
  for (const it of itens) if (it.quantidade !== null) m.set(it.unidade || 'pç', (m.get(it.unidade || 'pç') || 0) + it.quantidade);
  return m.size ? Array.from(m.entries()).map(([u, q]) => `${fmtN(q, 2)} ${u}`).join(' · ') : '—';
}
function somaValor(itens: ItemCald[]): number | null {
  let t = 0, tem = false;
  for (const it of itens) if (it.valor !== null) { t += it.valor; tem = true; }
  return tem ? t : null;
}

// Classifica os itens numa semana [ini, fim]. `refAtraso` = até quando conta
// atraso (hoje, se a semana ainda não acabou).
function daSemana(itens: ItemCald[], ini: string, hoje: string) {
  const fim = somarDias(ini, 6);
  const refAtraso = fim < hoje ? fim : hoje;
  const validos = itens.filter(i => i.status !== 'cancelado');
  const chegou = (i: ItemCald) => dataChegada(i);
  return {
    ini, fim,
    chegaram: validos.filter(i => { const c = chegou(i); return !!c && c >= ini && c <= fim; }),
    // Em produção no FIM da semana (ou agora, se é a semana atual): já tinha
    // chegado e ainda não tinha finalizado.
    producao: validos.filter(i => {
      const c = chegou(i);
      if (!c || c > refAtraso) return false;
      return !(i.finalizado_em && i.finalizado_em <= refAtraso) && (i.status === 'andamento' || (i.status === 'finalizado' && !!i.finalizado_em));
    }),
    finalizados: validos.filter(i => i.status === 'finalizado' && !!i.finalizado_em && i.finalizado_em >= ini && i.finalizado_em <= fim),
    faturados: validos.filter(i => !!i.faturado_em && i.faturado_em >= ini && i.faturado_em <= fim),
    previstos: validos.filter(i => !!i.prev_finalizacao && i.prev_finalizacao >= ini && i.prev_finalizacao <= fim),
    // Atrasado na data de referência: previsão vencida e não finalizado até ali.
    atrasados: validos.filter(i => !!i.prev_finalizacao && i.prev_finalizacao < refAtraso
      && !(i.finalizado_em && i.finalizado_em <= refAtraso)),
  };
}

export default function AnaliseCaldeiraria() {
  const hoje = hojeISO();
  const [itens, setItens] = useState<ItemCald[] | null>(null);
  const [erro, setErro] = useState('');
  const [semana, setSemana] = useState(inicioSemana(hoje));
  const [grupo, setGrupo] = useState<Grupo | null>(null);
  // Seção "Pedidos da Caldeiraria": 1 linha por pedido (abre os itens).
  const [fPed, setFPed] = useState<'aberto' | 'finalizado' | 'todos'>('aberto');
  const [buscaPed, setBuscaPed] = useState('');
  const [pedAberto, setPedAberto] = useState<Set<string>>(new Set());
  const verValores = podeVerValores();

  useEffect(() => {
    fetch('/api/cald-plano', { headers: { Authorization: `Bearer ${getToken() || ''}` } })
      .then(async r => { const j = await r.json(); if (!r.ok) throw new Error(j.erro || 'Erro'); setItens(j.itens || []); })
      .catch(e => setErro((e as Error).message || 'Não foi possível carregar a Caldeiraria.'));
  }, []);

  const S = useMemo(() => (itens ? daSemana(itens, semana, hoje) : null), [itens, semana, hoje]);
  const Sant = useMemo(() => (itens ? daSemana(itens, somarDias(semana, -7), hoje) : null), [itens, semana, hoje]);

  // Evolução: 8 semanas terminando na selecionada.
  const evolucao = useMemo(() => {
    if (!itens) return [];
    return Array.from({ length: 8 }, (_, k) => {
      const ini = somarDias(semana, -7 * (7 - k));
      const s = daSemana(itens, ini, hoje);
      return { ini, chegaram: s.chegaram.length, finalizados: s.finalizados.length };
    });
  }, [itens, semana, hoje]);

  // Carga atual por área (foto de agora).
  const ativos = useMemo(() => (itens || []).filter(i => i.status === 'andamento' || i.status === 'aguardando' || i.status === 'novo'), [itens]);
  const carga = useMemo(() => [
    { codigo: 'novo', nome: 'Aguardando planejamento', cor: '#b45309', itens: ativos.filter(i => i.status === 'novo') },
    { codigo: 'aguardando', nome: 'Chegando', cor: C.azul2, itens: ativos.filter(i => i.status === 'aguardando') },
    ...AREAS_CALD.map(a => ({ codigo: a.codigo, nome: a.nome, cor: a.cor, itens: ativos.filter(i => i.status === 'andamento' && i.area_atual === a.codigo) })),
  ], [ativos]);

  // Previsão: próximas 4 semanas a partir da semana atual (de hoje).
  const previsao = useMemo(() => {
    if (!itens) return [];
    const base = inicioSemana(hoje);
    return Array.from({ length: 5 }, (_, k) => {
      const ini = somarDias(base, 7 * k);
      const fim = somarDias(ini, 6);
      const abertos = itens.filter(i => i.status !== 'cancelado' && i.status !== 'finalizado');
      return {
        ini,
        finalizar: abertos.filter(i => !!i.prev_finalizacao && i.prev_finalizacao >= ini && i.prev_finalizacao <= fim),
        faturar: itens.filter(i => i.status !== 'cancelado' && !i.faturado_em && !!i.prev_faturamento && i.prev_faturamento >= ini && i.prev_faturamento <= fim),
      };
    });
  }, [itens, hoje]);
  const semPrevisao = ativos.filter(i => !i.prev_finalizacao);

  // Pedidos = itens agrupados pelo nº do pedido. "Em aberto" = tem item não
  // finalizado; "finalizado" = todos os itens finalizados.
  const pedidos = useMemo(() => {
    const m = new Map<string, ItemCald[]>();
    for (const i of itens || []) {
      if (i.status === 'cancelado') continue;
      const k = i.pedido;
      if (!m.has(k)) m.set(k, []);
      m.get(k)!.push(i);
    }
    return Array.from(m.entries()).map(([pedido, its]) => {
      const abertos = its.filter(i => i.status !== 'finalizado');
      const chegadas = its.map(dataChegada).filter(Boolean) as string[];
      const prevs = abertos.map(i => i.prev_finalizacao).filter(Boolean) as string[];
      const fins = its.map(i => i.finalizado_em).filter(Boolean) as string[];
      const onde = Array.from(new Set(abertos.map(i => i.status === 'andamento' ? nomeArea(i.area_atual) : i.status === 'aguardando' ? 'Chegando' : 'A planejar')));
      return {
        pedido, itens: its, aberto: abertos.length > 0,
        cliente: its.find(i => i.cliente)?.cliente || '—',
        vendedor: its.find(i => i.vendedor)?.vendedor || '—',
        chegou: chegadas.sort()[0] || null,
        prev: prevs.sort()[0] || null,
        finalizado: abertos.length ? null : (fins.sort().pop() || null),
        onde, atrasado: abertos.some(i => situacaoItem(i, hoje).atrasado),
        valor: somaValor(its),
      };
    }).sort((a, b) => Number(b.aberto) - Number(a.aberto) || (b.chegou || '').localeCompare(a.chegou || '') || a.pedido.localeCompare(b.pedido, 'pt-BR', { numeric: true }));
  }, [itens, hoje]);
  const pedidosVis = pedidos.filter(p => (fPed === 'todos' || (fPed === 'aberto' ? p.aberto : !p.aberto))
    && (!buscaPed || [p.pedido, p.cliente, p.vendedor, ...p.itens.map(i => i.material)].some(x => (x || '').toLowerCase().includes(buscaPed.toLowerCase()))));

  if (erro) return <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 10, padding: 14, color: C.vermelho }}><i className="bi bi-x-circle-fill" style={{ marginRight: 8 }} />{erro}</div>;
  if (!itens || !S || !Sant) return <div style={{ textAlign: 'center', padding: 40, color: C.cinza }}><i className="bi bi-hourglass-split" style={{ fontSize: 24 }} /><p>Carregando Caldeiraria…</p></div>;

  const semanaAtual = semana === inicioSemana(hoje);
  const kpis: { k: Grupo; rot: string; sub: string; cor: string; icon: string }[] = [
    { k: 'chegaram', rot: 'Chegaram', sub: 'entraram na Caldeiraria', cor: C.azul2, icon: 'bi-box-arrow-in-down' },
    { k: 'producao', rot: semanaAtual ? 'Em produção agora' : 'Em produção no fim da semana', sub: 'já chegaram e não finalizaram', cor: C.laranja, icon: 'bi-gear-wide-connected' },
    { k: 'finalizados', rot: 'Finalizados', sub: 'produção concluída', cor: C.verde, icon: 'bi-check2-all' },
    { k: 'faturados', rot: 'Faturados', sub: 'com data de faturamento', cor: C.teal, icon: 'bi-receipt' },
    { k: 'previstos', rot: 'Previstos p/ finalizar', sub: 'prev. finalização na semana', cor: C.roxo, icon: 'bi-calendar-check' },
    { k: 'atrasados', rot: 'Atrasados', sub: 'prev. finalização vencida', cor: C.vermelho, icon: 'bi-exclamation-triangle' },
  ];
  const cumpridos = S.previstos.filter(i => i.finalizado_em && i.finalizado_em <= S.fim).length;
  const pctCumpr = S.previstos.length ? Math.round((cumpridos / S.previstos.length) * 100) : null;
  const picoEvo = Math.max(1, ...evolucao.map(e => Math.max(e.chegaram, e.finalizados)));
  const picoCarga = Math.max(1, ...carga.map(c => c.itens.length));
  const temValor = verValores && itens.some(i => i.valor !== null);

  async function exportar() {
    if (!S) return;
    const XLSX = await import('xlsx');
    const linha = (i: ItemCald) => {
      const r: Record<string, unknown> = {
        Pedido: i.pedido, Vendedor: i.vendedor || '', Cliente: i.cliente || '', Material: i.material,
        Quant: i.quantidade ?? '', Un: i.unidade || '',
        Situação: i.status === 'andamento' ? nomeArea(i.area_atual) : i.status,
        Chegou: fmtData(dataChegada(i)), 'Prev. finalização': fmtData(i.prev_finalizacao),
        Finalizado: fmtData(i.finalizado_em), 'Prev. faturamento': fmtData(i.prev_faturamento), Faturado: fmtData(i.faturado_em),
      };
      if (verValores) r['Valor R$'] = i.valor ?? '';
      return r;
    };
    const wb = XLSX.utils.book_new();
    const resumo = kpis.map(k => ({
      Indicador: k.rot, Itens: S[k.k].length, 'Semana anterior': Sant![k.k].length, Quantidade: somaUn(S[k.k]),
      ...(verValores ? { 'Valor R$': somaValor(S[k.k]) ?? '' } : {}),
    }));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet([{ Indicador: `Caldeiraria — semana ${lblSemana(S.ini)}` }, ...resumo]), 'Resumo');
    for (const k of kpis) XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(S[k.k].map(linha)), k.rot.slice(0, 30));
    const prev = previsao.flatMap(p => p.finalizar.map(i => ({ Semana: lblSemana(p.ini), ...linha(i) })));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(prev), 'Previsão próximas semanas');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(pedidos.map(p => ({
      Pedido: p.pedido, Cliente: p.cliente, Vendedor: p.vendedor, Itens: p.itens.length, Quantidade: somaUn(p.itens),
      'Onde está': p.aberto ? p.onde.join(', ') : 'Finalizado', Chegou: fmtData(p.chegou), 'Prev. finalização': fmtData(p.prev),
      Finalizado: fmtData(p.finalizado), Atrasado: p.atrasado ? 'Sim' : '', ...(verValores ? { 'Valor R$': p.valor ?? '' } : {}),
    }))), 'Pedidos');
    XLSX.writeFile(wb, `caldeiraria_semana_${S.ini}.xlsx`);
  }

  const card: React.CSSProperties = { background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: 16, marginBottom: 18 };
  const th: React.CSSProperties = { background: '#f8fafc', color: '#64748b', padding: '8px 10px', textAlign: 'left', fontWeight: 700, fontSize: 10.5, textTransform: 'uppercase', letterSpacing: .4, borderBottom: '1px solid #e2e8f0', whiteSpace: 'nowrap' };
  const td: React.CSSProperties = { padding: '7px 10px', borderBottom: '1px solid #f1f5f9', color: '#334155', fontSize: 12.5 };
  const Titulo = ({ icon, t, s }: { icon: string; t: string; s?: string }) => (
    <div style={{ margin: '0 0 12px' }}>
      <h5 style={{ margin: 0, fontWeight: 800, color: C.azul, fontSize: 16 }}><i className={`bi ${icon}`} style={{ marginRight: 8 }} />{t}</h5>
      {s && <small style={{ color: '#94a3b8' }}>{s}</small>}
    </div>
  );
  const Tabela = ({ lista }: { lista: ItemCald[] }) => (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead><tr>{['Pedido', 'Material', 'Qtd', 'Cliente', 'Vendedor', 'Situação', 'Chegou', 'Prev. final.', 'Finalizado', 'Faturado', ...(verValores ? ['Valor'] : [])].map(h => <th key={h} style={th}>{h}</th>)}</tr></thead>
        <tbody>
          {lista.map(i => {
            const s = situacaoItem(i, hoje);
            return (
              <tr key={i.id}>
                <td style={{ ...td, fontWeight: 800, color: C.azul }}>{i.pedido}</td>
                <td style={td}>{i.material}</td>
                <td style={{ ...td, whiteSpace: 'nowrap' }}>{i.quantidade !== null ? `${fmtN(i.quantidade, 2)} ${i.unidade || ''}` : '—'}</td>
                <td style={td}>{i.cliente || '—'}</td>
                <td style={td}>{i.vendedor || '—'}</td>
                <td style={td}>{i.status === 'andamento' ? nomeArea(i.area_atual) : i.status === 'finalizado' ? 'Finalizado' : i.status === 'aguardando' ? 'Chegando' : 'A planejar'}</td>
                <td style={{ ...td, whiteSpace: 'nowrap' }}>{fmtData(dataChegada(i)) || '—'}</td>
                <td style={{ ...td, whiteSpace: 'nowrap', color: s.atrasado ? C.vermelho : undefined, fontWeight: s.atrasado ? 800 : 400 }}>{fmtData(i.prev_finalizacao) || '—'}</td>
                <td style={{ ...td, whiteSpace: 'nowrap' }}>{fmtData(i.finalizado_em) || '—'}</td>
                <td style={{ ...td, whiteSpace: 'nowrap' }}>{fmtData(i.faturado_em) || '—'}</td>
                {verValores && <td style={{ ...td, whiteSpace: 'nowrap', textAlign: 'right' }}>{i.valor !== null ? fmtBRL(i.valor) : '—'}</td>}
              </tr>
            );
          })}
          {!lista.length && <tr><td colSpan={11} style={{ ...td, textAlign: 'center', color: '#cbd5e1' }}>Nenhum item.</td></tr>}
        </tbody>
      </table>
    </div>
  );

  return (
    <div>
      {/* Seletor de semana */}
      <div className="no-print" style={{ ...card, display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 1, marginRight: 4 }}>Semana</span>
        <button className="abtn" onClick={() => setSemana(somarDias(semana, -7))} title="Semana anterior"><i className="bi bi-chevron-left" /></button>
        <b style={{ color: C.azul, fontSize: 14, minWidth: 150, textAlign: 'center' }}>{lblSemana(semana)}</b>
        <button className="abtn" onClick={() => setSemana(somarDias(semana, 7))} title="Próxima semana"><i className="bi bi-chevron-right" /></button>
        <button className={`achip ${semanaAtual ? 'on' : ''}`} onClick={() => setSemana(inicioSemana(hoje))}>Esta semana</button>
        <button className={`achip ${semana === somarDias(inicioSemana(hoje), -7) ? 'on' : ''}`} onClick={() => setSemana(somarDias(inicioSemana(hoje), -7))}>Semana passada</button>
        <input type="date" value={semana} onChange={e => e.target.value && setSemana(inicioSemana(e.target.value))} style={{ border: '2px solid #e2e8f0', borderRadius: 8, padding: '6px 10px', fontSize: 13, fontWeight: 600, color: C.azul }} title="Escolher qualquer dia da semana" />
        <div style={{ flex: 1 }} />
        {podeLancarCaldeiraria() && <a href="/cald-plano" className="abtn" style={{ textDecoration: 'none', color: C.azul }}><i className="bi bi-kanban" style={{ marginRight: 6 }} />PCP Caldeiraria</a>}
        <button className="abtn" onClick={exportar}><i className="bi bi-file-earmark-excel" style={{ marginRight: 6 }} />Exportar Excel</button>
      </div>

      <div className="cp-print-bloco" style={{ fontSize: 13, color: C.cinza, margin: '0 0 10px' }}>
        🏗 <b style={{ color: C.azul }}>Caldeiraria</b> · semana de <b>{lblSemana(S.ini)}</b>{semanaAtual ? ' (em andamento)' : ''} · comparado com a semana anterior ({lblSemana(Sant.ini)})
      </div>

      {/* KPIs da semana */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10, marginBottom: 18 }}>
        {kpis.map(k => {
          const v = S[k.k].length, ant = Sant[k.k].length, dif = v - ant;
          const val = temValor ? somaValor(S[k.k]) : null;
          return (
            <button key={k.k} onClick={() => setGrupo(grupo === k.k ? null : k.k)} title="Clique para ver os itens"
              style={{ background: '#fff', border: `1.5px solid ${grupo === k.k ? k.cor : '#e2e8f0'}`, borderTop: `4px solid ${k.cor}`, borderRadius: 12, padding: '12px 14px', textAlign: 'left', cursor: 'pointer' }}>
              <div style={{ fontSize: 11, fontWeight: 800, color: C.cinza, textTransform: 'uppercase', letterSpacing: .3 }}><i className={`bi ${k.icon}`} style={{ color: k.cor, marginRight: 5 }} />{k.rot}</div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginTop: 4 }}>
                <span style={{ fontSize: 30, fontWeight: 800, color: k.cor, lineHeight: 1 }}>{v}</span>
                <span style={{ fontSize: 12, fontWeight: 700, color: dif === 0 ? '#94a3b8' : (k.k === 'atrasados' ? (dif > 0 ? C.vermelho : C.verde) : (dif > 0 ? C.verde : C.laranja)) }}>
                  {dif === 0 ? '=' : dif > 0 ? `▲ ${dif}` : `▼ ${-dif}`} <span style={{ fontWeight: 500, color: '#94a3b8' }}>vs {ant}</span>
                </span>
              </div>
              <div style={{ fontSize: 11.5, color: '#94a3b8', marginTop: 4 }}>{somaUn(S[k.k])}</div>
              {val !== null && <div style={{ fontSize: 12, color: C.azul, fontWeight: 700, marginTop: 2 }}>{fmtBRL(val)}</div>}
              {k.k === 'previstos' && pctCumpr !== null && <div style={{ fontSize: 11.5, color: pctCumpr >= 80 ? C.verde : C.laranja, fontWeight: 700, marginTop: 2 }}>{cumpridos} de {S.previstos.length} cumpridos ({pctCumpr}%)</div>}
            </button>
          );
        })}
      </div>

      {grupo && (
        <div style={card} className="cp-print-bloco">
          <div style={{ display: 'flex', alignItems: 'center', marginBottom: 10 }}>
            <Titulo icon="bi-list-ul" t={`${kpis.find(k => k.k === grupo)?.rot} — ${lblSemana(S.ini)}`} s={`${S[grupo].length} item(ns) · ${somaUn(S[grupo])}`} />
            <button className="abtn no-print" style={{ marginLeft: 'auto' }} onClick={() => setGrupo(null)}><i className="bi bi-x" /></button>
          </div>
          <Tabela lista={S[grupo]} />
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: 18 }}>
        {/* Evolução */}
        <div style={{ ...card, marginBottom: 0 }} className="cp-print-bloco">
          <Titulo icon="bi-bar-chart-line" t="Chegaram × finalizados — 8 semanas" s="Itens por semana (segunda a domingo)" />
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, height: 150 }}>
            {evolucao.map(e => (
              <div key={e.ini} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, cursor: 'pointer' }} onClick={() => setSemana(e.ini)} title={`Semana ${lblSemana(e.ini)}`}>
                <div style={{ display: 'flex', alignItems: 'flex-end', gap: 2, height: 120 }}>
                  <div style={{ width: 11, height: `${(e.chegaram / picoEvo) * 100}%`, minHeight: e.chegaram ? 3 : 0, background: C.azul2, borderRadius: '3px 3px 0 0' }} />
                  <div style={{ width: 11, height: `${(e.finalizados / picoEvo) * 100}%`, minHeight: e.finalizados ? 3 : 0, background: C.verde, borderRadius: '3px 3px 0 0' }} />
                </div>
                <div style={{ fontSize: 10, color: e.ini === semana ? C.azul : '#94a3b8', fontWeight: e.ini === semana ? 800 : 500 }}>{fmtData(e.ini).slice(0, 5)}</div>
                <div style={{ fontSize: 10, color: '#64748b' }}>{e.chegaram}/{e.finalizados}</div>
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 14, fontSize: 11.5, color: C.cinza, marginTop: 8 }}>
            <span><span style={{ display: 'inline-block', width: 10, height: 10, background: C.azul2, borderRadius: 2, marginRight: 5 }} />Chegaram</span>
            <span><span style={{ display: 'inline-block', width: 10, height: 10, background: C.verde, borderRadius: 2, marginRight: 5 }} />Finalizados</span>
          </div>
        </div>

        {/* Carga por área agora */}
        <div style={{ ...card, marginBottom: 0 }} className="cp-print-bloco">
          <Titulo icon="bi-diagram-3" t="Onde está cada item agora" s={`${ativos.length} item(ns) em aberto na Caldeiraria (foto de agora)`} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {carga.filter(c => c.itens.length || AREAS_CALD.some(a => a.codigo === c.codigo)).map(c => (
              <div key={c.codigo} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ width: 140, fontSize: 12, color: '#475569', textAlign: 'right', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.nome}</div>
                <div style={{ flex: 1, background: '#f1f5f9', borderRadius: 4, height: 16 }}>
                  <div style={{ width: `${(c.itens.length / picoCarga) * 100}%`, background: c.cor, height: 16, borderRadius: 4, minWidth: c.itens.length ? 3 : 0 }} />
                </div>
                <div style={{ width: 30, fontSize: 12, fontWeight: 800, color: '#334155', textAlign: 'right' }}>{c.itens.length}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Previsão */}
      <div style={{ ...card, marginTop: 18 }} className="cp-print-bloco">
        <Titulo icon="bi-calendar-range" t="Previsto para as próximas semanas" s="Pela previsão de finalização e de faturamento definidas no Planejamento" />
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr>
              <th style={th}>Semana</th><th style={th}>A finalizar</th><th style={th}>Quantidade</th>
              <th style={th}>A faturar</th>{temValor && <th style={{ ...th, textAlign: 'right' }}>Valor a faturar</th>}
            </tr></thead>
            <tbody>
              {previsao.map((p, k) => (
                <tr key={p.ini}>
                  <td style={{ ...td, fontWeight: 700 }}>{lblSemana(p.ini)}{k === 0 ? ' (esta)' : ''}</td>
                  <td style={{ ...td, fontWeight: 800, color: C.roxo }}>{p.finalizar.length}</td>
                  <td style={td}>{somaUn(p.finalizar)}</td>
                  <td style={{ ...td, fontWeight: 800, color: C.teal }}>{p.faturar.length}</td>
                  {temValor && <td style={{ ...td, textAlign: 'right' }}>{somaValor(p.faturar) !== null ? fmtBRL(somaValor(p.faturar)!) : '—'}</td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {semPrevisao.length > 0 && (
          <div style={{ marginTop: 10, fontSize: 12.5, color: '#92400e', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 8, padding: '8px 12px' }}>
            <i className="bi bi-exclamation-triangle" /> <b>{semPrevisao.length} item(ns) em aberto sem previsão de finalização</b> — não entram na previsão acima. Defina no Planejamento da Caldeiraria.
          </div>
        )}
      </div>

      {/* Pedidos da Caldeiraria */}
      <div style={{ ...card, marginTop: 18 }} className="cp-print-bloco">
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, flexWrap: 'wrap' }}>
          <Titulo icon="bi-card-list" t="Pedidos da Caldeiraria" s={`${pedidosVis.length} pedido(s) · ${pedidosVis.reduce((a, p) => a + p.itens.length, 0)} item(ns)${temValor && somaValor(pedidosVis.flatMap(p => p.itens)) !== null ? ` · ${fmtBRL(somaValor(pedidosVis.flatMap(p => p.itens))!)}` : ''} — clique no pedido para ver os itens`} />
          <div className="no-print" style={{ marginLeft: 'auto', display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
            {(['aberto', 'finalizado', 'todos'] as const).map(f => (
              <button key={f} className={`achip ${fPed === f ? 'on' : ''}`} onClick={() => setFPed(f)}>{f === 'aberto' ? 'Em aberto' : f === 'finalizado' ? 'Finalizados' : 'Todos'}</button>
            ))}
            <input value={buscaPed} onChange={e => setBuscaPed(e.target.value)} placeholder="Buscar pedido, cliente, material…"
              style={{ border: '2px solid #e2e8f0', borderRadius: 8, padding: '6px 10px', fontSize: 13, width: 220 }} />
          </div>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr>{['Pedido', 'Cliente', 'Vendedor', 'Itens', 'Quantidade', 'Onde está', 'Chegou', 'Prev. final.', 'Finalizado', ...(verValores ? ['Valor'] : [])].map(h => <th key={h} style={th}>{h}</th>)}</tr></thead>
            <tbody>
              {pedidosVis.map(p => {
                const ab = pedAberto.has(p.pedido);
                return [
                  <tr key={p.pedido} style={{ cursor: 'pointer', background: ab ? '#f8fafc' : undefined }}
                    onClick={() => setPedAberto(v => { const n = new Set(v); if (n.has(p.pedido)) n.delete(p.pedido); else n.add(p.pedido); return n; })}>
                    <td style={{ ...td, fontWeight: 800, color: C.azul, whiteSpace: 'nowrap' }}><i className={`bi ${ab ? 'bi-chevron-down' : 'bi-chevron-right'}`} style={{ color: '#94a3b8', marginRight: 6 }} />{p.pedido}</td>
                    <td style={td}>{p.cliente}</td>
                    <td style={td}>{p.vendedor}</td>
                    <td style={td}>{p.itens.length}</td>
                    <td style={{ ...td, whiteSpace: 'nowrap' }}>{somaUn(p.itens)}</td>
                    <td style={td}>{p.aberto ? p.onde.join(', ') : <span style={{ color: C.verde, fontWeight: 700 }}>Finalizado</span>}
                      {p.atrasado && <span style={{ marginLeft: 6, fontSize: 10.5, fontWeight: 800, color: '#fff', background: C.vermelho, borderRadius: 6, padding: '1px 6px' }}>atrasado</span>}</td>
                    <td style={{ ...td, whiteSpace: 'nowrap' }}>{fmtData(p.chegou) || '—'}</td>
                    <td style={{ ...td, whiteSpace: 'nowrap' }}>{fmtData(p.prev) || '—'}</td>
                    <td style={{ ...td, whiteSpace: 'nowrap' }}>{fmtData(p.finalizado) || '—'}</td>
                    {verValores && <td style={{ ...td, whiteSpace: 'nowrap', textAlign: 'right', fontWeight: 700 }}>{p.valor !== null ? fmtBRL(p.valor) : '—'}</td>}
                  </tr>,
                  ab && (
                    <tr key={p.pedido + '-itens'}>
                      <td colSpan={verValores ? 10 : 9} style={{ padding: '4px 10px 12px 28px', background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                        <Tabela lista={p.itens} />
                      </td>
                    </tr>
                  ),
                ];
              })}
              {!pedidosVis.length && <tr><td colSpan={10} style={{ ...td, textAlign: 'center', color: '#cbd5e1' }}>Nenhum pedido.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      <div style={{ fontSize: 11.5, color: '#94a3b8', marginTop: 4 }}>
        <b>Como ler:</b> <b>Chegou</b> = primeira data de entrada numa área da Caldeiraria. <b>Em produção</b> = já chegou e ainda não finalizou (no fim da semana escolhida, ou agora se é a semana atual). <b>Finalizado / Faturado</b> = data registrada pelo coordenador. <b>Atrasado</b> = previsão de finalização vencida sem finalizar. Fonte: Planejamento da Caldeiraria (lançado pelo PCP, atualizado pelo coordenador).
      </div>
    </div>
  );
}
