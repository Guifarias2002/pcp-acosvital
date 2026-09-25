'use client';
// "Valores por Mês" → FLANGES + CALDEIRARIA. Soma por mês:
//  · Flanges = pedidos do sistema, só itens de Flange (mesma fonte da aba Flanges,
//    mês = emissão do pedido);
//  · Caldeiraria = Planejamento do coordenador (/cald-plano, mesma fonte da aba
//    Caldeiraria › Planejamento, mês = chegada na Caldeiraria).
// NÃO usa "Pedidos do sistema (OPs HRM)" da Caldeiraria: o mesmo pedido pode estar
// no Planejamento também e contaria em dobro.
import { useEffect, useMemo, useState } from 'react';
import { getToken } from '@/lib/auth';
import { getValoresMes } from '@/lib/api';
import { dataChegada, valorUnitario, type ItemCald } from '@/lib/caldPlano';
import DetalheValores, { type Det, type Fab } from './DetalheValores';

const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const labelMes = (mes: string) => { const [a, m] = mes.split('-'); const n = MESES[+m - 1] || m; return `${n[0].toUpperCase()}${n.slice(1)} de ${a}`; };
const brl = (v: number) => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const CARD = { background: '#fff', border: '1px solid #e5e7eb', borderRadius: 10, boxShadow: '0 1px 2px rgba(0,0,0,.04)' } as const;

interface ItemFlange { codigo: string; descricao: string; unidade: string; quantidade: number; valor_unitario: number; valor: number }
interface PedFlange { numero_pedido_venda: string; cliente: string; vendedor: string; valor: number; itens?: ItemFlange[] }
interface MesFlange { mes: string; total: number; count: number; pedidos?: PedFlange[] }
// Seleção do detalhe: mês (null = período todo) × fábrica (null = as duas).
interface Sel { mes: string | null; fab: Fab | null }
interface Linha { mes: string; flange: number; nFlange: number; cald: number; nCald: number; total: number }

export default function ValoresJuntos({ de, ate }: { de: string; ate: string }) {
  const [flange, setFlange] = useState<MesFlange[] | null>(null);
  const [itens, setItens] = useState<ItemCald[] | null>(null);
  const [erro, setErro] = useState('');
  const [sel, setSel] = useState<Sel | null>(null);
  // Itens de Flanges só são buscados no 1º clique (com_itens é mais pesado);
  // uma vez por período.
  const [flangeDet, setFlangeDet] = useState<MesFlange[] | null>(null);
  const [carregandoDet, setCarregandoDet] = useState(false);

  useEffect(() => {
    setFlange(null); setFlangeDet(null); setSel(null);
    getValoresMes({ de: de || undefined, ate: ate || undefined, fabrica: 'flange' })
      .then((d: { meses: MesFlange[] }) => setFlange(d.meses || []))
      .catch(() => setErro('Não foi possível carregar os valores de Flanges.'));
  }, [de, ate]);

  useEffect(() => {
    fetch('/api/cald-plano', { headers: { Authorization: `Bearer ${getToken() || ''}` } })
      .then(async r => { const j = await r.json(); if (!r.ok) throw new Error(j.erro || 'Erro'); setItens(j.itens || []); })
      .catch(e => setErro((e as Error).message || 'Não foi possível carregar a Caldeiraria.'));
  }, []);

  const linhas = useMemo<Linha[]>(() => {
    if (!flange || !itens) return [];
    const m = new Map<string, Linha>();
    const get = (mes: string) => { let l = m.get(mes); if (!l) { l = { mes, flange: 0, nFlange: 0, cald: 0, nCald: 0, total: 0 }; m.set(mes, l); } return l; };
    for (const f of flange) { const l = get(f.mes); l.flange += Number(f.total) || 0; l.nFlange += Number(f.count) || 0; }
    const pedCald = new Map<string, Set<string>>();
    for (const it of itens) {
      if (it.status === 'cancelado') continue;
      const mes = (dataChegada(it) || String(it.criado_em).slice(0, 10)).slice(0, 7);
      if ((de && mes < de) || (ate && mes > ate)) continue;
      get(mes).cald += it.valor || 0;
      if (!pedCald.has(mes)) pedCald.set(mes, new Set());
      pedCald.get(mes)!.add(it.pedido);
    }
    for (const [mes, s] of Array.from(pedCald.entries())) get(mes).nCald = s.size;
    return Array.from(m.values()).map(l => ({ ...l, total: l.flange + l.cald })).sort((a, b) => b.mes.localeCompare(a.mes));
  }, [flange, itens, de, ate]);

  useEffect(() => {
    if (!sel || flangeDet || carregandoDet) return;
    setCarregandoDet(true);
    getValoresMes({ de: de || undefined, ate: ate || undefined, fabrica: 'flange', com_itens: '1' })
      .then((d: { meses: MesFlange[] }) => setFlangeDet(d.meses || []))
      .catch(() => setErro('Não foi possível carregar o detalhe de Flanges.'))
      .finally(() => setCarregandoDet(false));
  }, [sel, flangeDet, carregandoDet, de, ate]);

  // Todas as linhas (item a item) das duas fábricas, no formato do detalhe.
  const dets = useMemo<Det[] | null>(() => {
    if (!flangeDet || !itens) return null;
    const out: Det[] = [];
    for (const b of flangeDet) for (const p of b.pedidos || []) {
      const base = { fab: 'flange' as const, mes: b.mes, pedido: p.numero_pedido_venda, cliente: p.cliente || '', vendedor: p.vendedor || '' };
      if (!p.itens?.length) out.push({ ...base, codigo: '', material: '(sem produto)', qtd: null, un: '', vUnit: null, valor: Number(p.valor) || 0 });
      else for (const it of p.itens) out.push({ ...base, codigo: it.codigo || '', material: it.descricao || '', qtd: Number(it.quantidade), un: it.unidade || '', vUnit: Number(it.valor_unitario), valor: Number(it.valor) || 0 });
    }
    for (const it of itens) {
      if (it.status === 'cancelado') continue;
      const mes = (dataChegada(it) || String(it.criado_em).slice(0, 10)).slice(0, 7);
      if ((de && mes < de) || (ate && mes > ate)) continue;
      out.push({ fab: 'cald', mes, pedido: it.pedido, cliente: it.cliente || '', vendedor: it.vendedor || '', codigo: '', material: it.material, qtd: it.quantidade, un: it.unidade || '', vUnit: valorUnitario(it), valor: it.valor });
    }
    return out;
  }, [flangeDet, itens, de, ate]);

  const detSel = useMemo(() => (sel && dets ? dets.filter(d => (!sel.mes || d.mes === sel.mes) && (!sel.fab || d.fab === sel.fab)) : null), [sel, dets]);
  const tituloSel = sel ? `${sel.fab === 'flange' ? 'Flanges' : sel.fab === 'cald' ? 'Caldeiraria' : 'Flanges + Caldeiraria'} · ${sel.mes ? labelMes(sel.mes) : 'período todo'}` : '';
  const ehSel = (mes: string | null, fab: Fab | null) => !!sel && sel.mes === mes && sel.fab === fab;
  const alternar = (mes: string | null, fab: Fab | null) => setSel(ehSel(mes, fab) ? null : { mes, fab });

  function baixarCsv() {
    const nBR = (v: number) => (Number.isInteger(v) ? String(v) : v.toFixed(2)).replace('.', ',');
    const out = ['Mês;Pedidos Flanges;Valor Flanges;Pedidos Caldeiraria;Valor Caldeiraria;Valor Total'];
    for (const l of linhas) out.push([l.mes, l.nFlange, nBR(l.flange), l.nCald, nBR(l.cald), nBR(l.total)].join(';'));
    out.push('', ['TOTAL GERAL', tot.nFlange, nBR(tot.flange), '', nBR(tot.cald), nBR(tot.total)].join(';'));
    const blob = new Blob(['﻿' + out.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
    a.download = `valores-por-mes_flanges-e-caldeiraria${de || ate ? `_${de || 'inicio'}_a_${ate || 'fim'}` : ''}.csv`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
  }

  if (erro) return <div className="card" style={{ padding: 16, background: '#fef2f2', border: '1px solid #fca5a5', color: '#b91c1c', fontSize: 13 }}>⚠ {erro}</div>;
  if (!flange || !itens) return <div className="card" style={{ padding: 40, textAlign: 'center', color: '#999' }}>Carregando…</div>;

  const tot = linhas.reduce((s, l) => ({ flange: s.flange + l.flange, cald: s.cald + l.cald, total: s.total + l.total, nFlange: s.nFlange + l.nFlange }), { flange: 0, cald: 0, total: 0, nFlange: 0 });
  const pct = (v: number) => (tot.total > 0 ? ` · ${Math.round((v / tot.total) * 100)}%` : '');
  const th = { padding: '9px 16px', fontWeight: 600, fontSize: 12, textAlign: 'right' as const, whiteSpace: 'nowrap' as const };
  const td = { padding: '9px 16px', textAlign: 'right' as const, whiteSpace: 'nowrap' as const };

  return (
    <>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12, marginBottom: 16 }}>
        <div onClick={() => alternar(null, 'flange')} title="Clique pra ver o detalhe" style={{ ...CARD, padding: '14px 18px', background: '#f0f7ff', borderColor: '#bfdbfe', cursor: 'pointer', outline: ehSel(null, 'flange') ? '3px solid #1a3a5c' : undefined }}>
          <div style={{ fontSize: 11.5, color: '#1d4ed8', fontWeight: 800, textTransform: 'uppercase', letterSpacing: .3 }}>Flanges</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: '#1a3a5c' }}>{brl(tot.flange)}</div>
          <div style={{ fontSize: 12, color: '#64748b' }}>{tot.nFlange} pedido(s){pct(tot.flange)}</div>
        </div>
        <div onClick={() => alternar(null, 'cald')} title="Clique pra ver o detalhe" style={{ ...CARD, padding: '14px 18px', background: '#fff7ed', borderColor: '#fed7aa', cursor: 'pointer', outline: ehSel(null, 'cald') ? '3px solid #1a3a5c' : undefined }}>
          <div style={{ fontSize: 11.5, color: '#c2410c', fontWeight: 800, textTransform: 'uppercase', letterSpacing: .3 }}>Caldeiraria</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: '#1a3a5c' }}>{brl(tot.cald)}</div>
          <div style={{ fontSize: 12, color: '#64748b' }}>Planejamento do coordenador{pct(tot.cald)}</div>
        </div>
        <div onClick={() => alternar(null, null)} title="Clique pra ver o detalhe" style={{ ...CARD, padding: '14px 18px', background: '#ecfdf5', borderColor: '#a7f3d0', cursor: 'pointer', outline: ehSel(null, null) ? '3px solid #1a3a5c' : undefined }}>
          <div style={{ fontSize: 11.5, color: '#065f46', fontWeight: 800, textTransform: 'uppercase', letterSpacing: .3 }}>Total (Flanges + Caldeiraria)</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#065f46' }}>{brl(tot.total)}</div>
          <div style={{ fontSize: 12, color: '#64748b' }}>{linhas.length} mês(es)</div>
        </div>
      </div>

      {!linhas.length ? <div className="card" style={{ padding: 40, textAlign: 'center', color: '#999' }}>Nenhum valor no período.</div> : (
        <div style={{ ...CARD, overflowX: 'auto', marginBottom: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', borderBottom: '1px solid #eef2f7' }}>
            <b style={{ color: '#1a3a5c', fontSize: 14 }}><i className="bi bi-calendar3" style={{ marginRight: 6 }} />Por mês</b>
            <button className="no-print" onClick={baixarCsv}
              style={{ border: '1px solid #198754', color: '#198754', background: '#fff', borderRadius: 5, padding: '5px 12px', fontSize: 12.5, cursor: 'pointer', fontWeight: 600 }}>
              <i className="bi bi-file-earmark-excel" style={{ marginRight: 4 }} />Excel
            </button>
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: '#f8fafc', color: '#475569' }}>
                <th style={{ ...th, textAlign: 'left' }}>Mês</th>
                <th style={{ ...th, color: '#1d4ed8' }}>Flanges</th>
                <th style={{ ...th, color: '#c2410c' }}>Caldeiraria</th>
                <th style={{ ...th, color: '#065f46' }}>Total</th>
                <th style={th}>vs. mês anterior</th>
              </tr>
            </thead>
            <tbody>
              {linhas.map((l, i) => {
                const ant = linhas[i + 1];
                const varPct = ant && ant.total > 0 ? ((l.total - ant.total) / ant.total) * 100 : null;
                return (
                  <tr key={l.mes} onClick={() => alternar(l.mes, null)} title="Clique pra ver o detalhe do mês"
                    style={{ borderBottom: '1px solid #f1f5f9', cursor: 'pointer', background: ehSel(l.mes, null) ? '#e0e7ff' : undefined }}>
                    <td style={{ ...td, textAlign: 'left', fontWeight: 700, color: '#1a3a5c' }}><i className={`bi ${ehSel(l.mes, null) ? 'bi-chevron-down' : 'bi-chevron-right'}`} style={{ color: '#94a3b8', marginRight: 6 }} />{labelMes(l.mes)}</td>
                    <td style={td}>{brl(l.flange)}<div style={{ fontSize: 11, color: '#94a3b8' }}>{l.nFlange} ped.</div></td>
                    <td style={td}>{brl(l.cald)}<div style={{ fontSize: 11, color: '#94a3b8' }}>{l.nCald} ped.</div></td>
                    <td style={{ ...td, fontWeight: 800, color: '#065f46' }}>{brl(l.total)}</td>
                    <td style={{ ...td, fontWeight: 700, color: varPct === null ? '#cbd5e1' : varPct >= 0 ? '#16a34a' : '#dc2626' }}>
                      {varPct === null ? '—' : `${varPct >= 0 ? '▲' : '▼'} ${Math.abs(varPct).toFixed(1).replace('.', ',')}%`}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr onClick={() => alternar(null, null)} title="Clique pra ver o detalhe do período" style={{ background: ehSel(null, null) ? '#d1fae5' : '#ecfdf5', fontWeight: 800, cursor: 'pointer' }}>
                <td style={{ ...td, textAlign: 'left', color: '#065f46' }}><i className={`bi ${ehSel(null, null) ? 'bi-chevron-down' : 'bi-chevron-right'}`} style={{ marginRight: 6 }} />TOTAL GERAL</td>
                <td style={td}>{brl(tot.flange)}</td>
                <td style={td}>{brl(tot.cald)}</td>
                <td style={{ ...td, color: '#065f46' }}>{brl(tot.total)}</td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
      )}
      {sel && <DetalheValores key={tituloSel} titulo={tituloSel} linhas={detSel} carregando={carregandoDet} onFechar={() => setSel(null)} />}
      <div style={{ fontSize: 11.5, color: '#94a3b8' }}>
        <i className="bi bi-info-circle" /> Clique num mês, no TOTAL GERAL ou num card pra ver pedidos, itens, materiais e vendedores. Flanges: mês de emissão do pedido. Caldeiraria: valores do Planejamento do coordenador, pelo mês em que o item chegou na Caldeiraria (itens cancelados e sem valor não somam).
      </div>
    </>
  );
}
