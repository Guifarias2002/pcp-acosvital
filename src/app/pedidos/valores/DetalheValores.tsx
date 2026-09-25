'use client';
// Detalhe do "Flanges + Caldeiraria" (ValoresJuntos): abre ao clicar num mês, no
// TOTAL GERAL ou num card. Junta as linhas das duas fábricas num formato só
// (Det) e mostra resumo + abas Pedidos / Itens / Materiais / Vendedores.
import { useMemo, useState } from 'react';

export type Fab = 'flange' | 'cald';
export interface Det {
  fab: Fab; mes: string; pedido: string; cliente: string; vendedor: string;
  codigo: string; material: string; qtd: number | null; un: string; vUnit: number | null; valor: number | null;
}
type Aba = 'pedidos' | 'itens' | 'materiais' | 'vendedores';

const brl = (v: number | null) => (v === null ? '—' : Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }));
const num = (v: number) => Number(v || 0).toLocaleString('pt-BR', { maximumFractionDigits: 2 });
const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
const COR: Record<Fab, { txt: string; cor: string; bg: string }> = {
  flange: { txt: 'Flange', cor: '#1d4ed8', bg: '#dbeafe' },
  cald: { txt: 'Cald.', cor: '#c2410c', bg: '#ffedd5' },
};
const Tag = ({ f }: { f: Fab }) => (
  <span style={{ fontSize: 10.5, fontWeight: 800, color: COR[f].cor, background: COR[f].bg, borderRadius: 6, padding: '1px 7px', whiteSpace: 'nowrap' }}>{COR[f].txt}</span>
);
// Soma de quantidades por unidade: "12 pç · 7.629 kg".
function qtdTxt(linhas: Det[]): string {
  const m = new Map<string, number>();
  for (const l of linhas) if (l.qtd !== null) m.set(l.un || 'pç', (m.get(l.un || 'pç') || 0) + l.qtd);
  return m.size ? Array.from(m.entries()).map(([u, q]) => `${num(q)} ${u}`).join(' · ') : '—';
}

export default function DetalheValores({ titulo, linhas, carregando, onFechar }: { titulo: string; linhas: Det[] | null; carregando: boolean; onFechar: () => void }) {
  const [aba, setAba] = useState<Aba>('pedidos');
  const [busca, setBusca] = useState('');

  const filtradas = useMemo(() => {
    const b = norm(busca);
    const ls = linhas || [];
    return b ? ls.filter(l => norm(`${l.pedido} ${l.cliente} ${l.vendedor} ${l.codigo} ${l.material}`).includes(b)) : ls;
  }, [linhas, busca]);

  const resumo = useMemo(() => {
    const r = (f?: Fab) => {
      const ls = f ? filtradas.filter(l => l.fab === f) : filtradas;
      return { valor: ls.reduce((s, l) => s + (l.valor || 0), 0), pedidos: new Set(ls.map(l => `${l.fab}|${l.pedido}`)).size, itens: ls.length, qtd: qtdTxt(ls) };
    };
    return { flange: r('flange'), cald: r('cald'), total: r() };
  }, [filtradas]);

  const pedidos = useMemo(() => {
    const m = new Map<string, { fab: Fab; pedido: string; cliente: string; vendedor: string; itens: number; linhas: Det[]; valor: number }>();
    for (const l of filtradas) {
      const k = `${l.fab}|${l.pedido}`;
      const e = m.get(k) || { fab: l.fab, pedido: l.pedido, cliente: l.cliente, vendedor: l.vendedor, itens: 0, linhas: [], valor: 0 };
      e.itens++; e.linhas.push(l); e.valor += l.valor || 0; m.set(k, e);
    }
    return Array.from(m.values()).sort((a, b) => b.valor - a.valor);
  }, [filtradas]);

  const materiais = useMemo(() => {
    const m = new Map<string, { fab: Fab; codigo: string; material: string; linhas: Det[]; pedidos: Set<string>; valor: number }>();
    for (const l of filtradas) {
      const k = `${l.fab}|${norm(l.codigo)}|${norm(l.material)}`;
      const e = m.get(k) || { fab: l.fab, codigo: l.codigo, material: l.material, linhas: [], pedidos: new Set<string>(), valor: 0 };
      e.linhas.push(l); e.pedidos.add(l.pedido); e.valor += l.valor || 0; m.set(k, e);
    }
    return Array.from(m.values()).sort((a, b) => b.valor - a.valor);
  }, [filtradas]);

  const vendedores = useMemo(() => {
    const m = new Map<string, { vendedor: string; pedidos: Set<string>; flange: number; cald: number }>();
    for (const l of filtradas) {
      const v = l.vendedor.trim() || '(sem vendedor)';
      const k = norm(v);
      const e = m.get(k) || { vendedor: v, pedidos: new Set<string>(), flange: 0, cald: 0 };
      e.pedidos.add(`${l.fab}|${l.pedido}`);
      if (l.fab === 'flange') e.flange += l.valor || 0; else e.cald += l.valor || 0;
      m.set(k, e);
    }
    return Array.from(m.values()).sort((a, b) => (b.flange + b.cald) - (a.flange + a.cald));
  }, [filtradas]);

  function baixarCsv() {
    const cell = (v: string | number | null) => { const s = v === null ? '' : typeof v === 'number' ? (Number.isInteger(v) ? String(v) : v.toFixed(2)).replace('.', ',') : v; return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
    const fab = (f: Fab) => (f === 'flange' ? 'Flanges' : 'Caldeiraria');
    let rows: (string | number | null)[][] = [];
    if (aba === 'pedidos') rows = [['Fábrica', 'Pedido', 'Cliente', 'Vendedor', 'Itens', 'Valor'], ...pedidos.map(p => [fab(p.fab), p.pedido, p.cliente, p.vendedor, p.itens, p.valor])];
    if (aba === 'itens') rows = [['Fábrica', 'Mês', 'Pedido', 'Cliente', 'Vendedor', 'Código', 'Material', 'Qtd', 'Un.', 'Vlr unit.', 'Vlr total'], ...filtradas.map(l => [fab(l.fab), l.mes, l.pedido, l.cliente, l.vendedor, l.codigo, l.material, l.qtd, l.un, l.vUnit, l.valor])];
    if (aba === 'materiais') rows = [['Fábrica', 'Código', 'Material', 'Qtd', 'Pedidos', 'Valor'], ...materiais.map(x => [fab(x.fab), x.codigo, x.material, qtdTxt(x.linhas), x.pedidos.size, x.valor])];
    if (aba === 'vendedores') rows = [['Vendedor', 'Pedidos', 'Flanges', 'Caldeiraria', 'Total'], ...vendedores.map(v => [v.vendedor, v.pedidos.size, v.flange, v.cald, v.flange + v.cald])];
    rows.push([], ['TOTAL', '', '', '', '', resumo.total.valor]);
    const blob = new Blob(['﻿' + rows.map(r => r.map(cell).join(';')).join('\r\n')], { type: 'text/csv;charset=utf-8;' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
    a.download = `valores_${norm(titulo).replace(/[^a-z0-9]+/g, '-')}_${aba}.csv`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
  }

  const th = (dir: 'l' | 'r' = 'l') => ({ padding: '8px 14px', fontWeight: 600, fontSize: 12, textAlign: dir === 'r' ? 'right' as const : 'left' as const, whiteSpace: 'nowrap' as const, position: 'sticky' as const, top: 0, background: '#f8fafc' });
  const td = (dir: 'l' | 'r' = 'l') => ({ padding: '8px 14px', textAlign: dir === 'r' ? 'right' as const : 'left' as const, borderBottom: '1px solid #f1f5f9' });
  const vtd = { ...td('r'), fontWeight: 700, color: '#065f46', whiteSpace: 'nowrap' as const };
  const abas: { id: Aba; rot: string; icon: string; n: number }[] = [
    { id: 'pedidos', rot: 'Pedidos', icon: 'bi-receipt', n: pedidos.length },
    { id: 'itens', rot: 'Itens', icon: 'bi-list-ul', n: filtradas.length },
    { id: 'materiais', rot: 'Materiais', icon: 'bi-box-seam', n: materiais.length },
    { id: 'vendedores', rot: 'Vendedores', icon: 'bi-person-badge', n: vendedores.length },
  ];
  const Card = ({ rot, cor, bg, r }: { rot: string; cor: string; bg: string; r: typeof resumo.total }) => (
    <div style={{ flex: '1 1 200px', background: bg, borderRadius: 10, padding: '10px 14px' }}>
      <div style={{ fontSize: 11, fontWeight: 800, color: cor, textTransform: 'uppercase', letterSpacing: .3 }}>{rot}</div>
      <div style={{ fontSize: 19, fontWeight: 800, color: '#1a3a5c' }}>{brl(r.valor)}</div>
      <div style={{ fontSize: 11.5, color: '#64748b' }}>{r.pedidos} pedido(s) · {r.itens} item(ns) · {r.qtd}</div>
    </div>
  );
  const temF = resumo.flange.itens > 0, temC = resumo.cald.itens > 0;

  return (
    <div style={{ background: '#fff', border: '2px solid #1a3a5c', borderRadius: 12, marginBottom: 14, overflow: 'hidden' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', background: '#1a3a5c', color: '#fff', flexWrap: 'wrap' }}>
        <i className="bi bi-search" />
        <b style={{ fontSize: 14.5 }}>{titulo}</b>
        <div style={{ flex: 1 }} />
        <button className="no-print" onClick={onFechar} style={{ background: 'rgba(255,255,255,.15)', color: '#fff', border: 'none', borderRadius: 6, padding: '5px 12px', fontSize: 12.5, cursor: 'pointer', fontWeight: 600 }}>
          <i className="bi bi-x-lg" style={{ marginRight: 4 }} />Fechar
        </button>
      </div>

      {carregando || !linhas ? <div style={{ padding: 36, textAlign: 'center', color: '#999' }}>Carregando detalhe…</div> : (
        <>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', padding: '14px 16px 4px' }}>
            {temF && <Card rot="Flanges" cor="#1d4ed8" bg="#f0f7ff" r={resumo.flange} />}
            {temC && <Card rot="Caldeiraria" cor="#c2410c" bg="#fff7ed" r={resumo.cald} />}
            {temF && temC && <Card rot="Total" cor="#065f46" bg="#ecfdf5" r={resumo.total} />}
          </div>

          <div className="no-print" style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap', padding: '10px 16px' }}>
            {abas.map(a => (
              <button key={a.id} onClick={() => setAba(a.id)} style={{
                border: `1.5px solid ${aba === a.id ? '#1a3a5c' : '#e2e8f0'}`, background: aba === a.id ? '#1a3a5c' : '#fff', color: aba === a.id ? '#fff' : '#475569',
                borderRadius: 8, padding: '6px 12px', fontSize: 12.5, fontWeight: 700, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6,
              }}><i className={`bi ${a.icon}`} />{a.rot}<span style={{ opacity: .7, fontWeight: 600 }}>{a.n}</span></button>
            ))}
            <div style={{ flex: 1 }} />
            <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar pedido, cliente, vendedor, material…"
              style={{ border: '1px solid #d1d5db', borderRadius: 6, padding: '6px 10px', fontSize: 12.5, minWidth: 240 }} />
            <button onClick={baixarCsv} style={{ border: '1px solid #198754', color: '#198754', background: '#fff', borderRadius: 5, padding: '5px 12px', fontSize: 12.5, cursor: 'pointer', fontWeight: 600 }}>
              <i className="bi bi-file-earmark-excel" style={{ marginRight: 4 }} />Excel
            </button>
          </div>

          <div style={{ overflow: 'auto', maxHeight: 520, borderTop: '1px solid #eef2f7' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              {aba === 'pedidos' && <>
                <thead><tr style={{ color: '#475569' }}><th style={th()}>Fábrica</th><th style={th()}>Pedido</th><th style={th()}>Cliente</th><th style={th()}>Vendedor</th><th style={th('r')}>Itens</th><th style={th('r')}>Qtd</th><th style={th('r')}>Valor</th></tr></thead>
                <tbody>{pedidos.map(p => (
                  <tr key={`${p.fab}|${p.pedido}`}>
                    <td style={td()}><Tag f={p.fab} /></td><td style={{ ...td(), fontWeight: 700, color: '#1a3a5c' }}>{p.pedido}</td>
                    <td style={td()}>{p.cliente || '—'}</td><td style={td()}>{p.vendedor || '—'}</td>
                    <td style={td('r')}>{p.itens}</td><td style={{ ...td('r'), whiteSpace: 'nowrap', color: '#64748b' }}>{qtdTxt(p.linhas)}</td><td style={vtd}>{brl(p.valor)}</td>
                  </tr>
                ))}</tbody>
              </>}
              {aba === 'itens' && <>
                <thead><tr style={{ color: '#475569' }}><th style={th()}>Fábrica</th><th style={th()}>Pedido</th><th style={th()}>Cliente</th><th style={th()}>Vendedor</th><th style={th()}>Código</th><th style={th()}>Material</th><th style={th('r')}>Qtd</th><th style={th('r')}>Vlr unit.</th><th style={th('r')}>Vlr total</th></tr></thead>
                <tbody>{[...filtradas].sort((a, b) => (b.valor || 0) - (a.valor || 0)).map((l, i) => (
                  <tr key={i}>
                    <td style={td()}><Tag f={l.fab} /></td><td style={{ ...td(), fontWeight: 700, color: '#1a3a5c' }}>{l.pedido}</td>
                    <td style={td()}>{l.cliente || '—'}</td><td style={td()}>{l.vendedor || '—'}</td>
                    <td style={{ ...td(), color: '#64748b', fontSize: 12 }}>{l.codigo || '—'}</td><td style={td()}>{l.material}</td>
                    <td style={{ ...td('r'), whiteSpace: 'nowrap' }}>{l.qtd !== null ? `${num(l.qtd)} ${l.un}` : '—'}</td>
                    <td style={{ ...td('r'), whiteSpace: 'nowrap', color: '#475569' }}>{brl(l.vUnit)}</td>
                    <td style={{ ...vtd, color: l.valor ? '#065f46' : '#cbd5e1' }}>{l.valor !== null ? brl(l.valor) : 'sem valor'}</td>
                  </tr>
                ))}</tbody>
              </>}
              {aba === 'materiais' && <>
                <thead><tr style={{ color: '#475569' }}><th style={th()}>Fábrica</th><th style={th()}>Código</th><th style={th()}>Material</th><th style={th('r')}>Qtd</th><th style={th('r')}>Pedidos</th><th style={th('r')}>Valor</th></tr></thead>
                <tbody>{materiais.map((x, i) => (
                  <tr key={i}>
                    <td style={td()}><Tag f={x.fab} /></td><td style={{ ...td(), color: '#64748b', fontSize: 12 }}>{x.codigo || '—'}</td><td style={td()}>{x.material}</td>
                    <td style={{ ...td('r'), whiteSpace: 'nowrap' }}>{qtdTxt(x.linhas)}</td><td style={td('r')}>{x.pedidos.size}</td><td style={vtd}>{brl(x.valor)}</td>
                  </tr>
                ))}</tbody>
              </>}
              {aba === 'vendedores' && <>
                <thead><tr style={{ color: '#475569' }}><th style={th()}>Vendedor</th><th style={th('r')}>Pedidos</th><th style={{ ...th('r'), color: '#1d4ed8' }}>Flanges</th><th style={{ ...th('r'), color: '#c2410c' }}>Caldeiraria</th><th style={{ ...th('r'), color: '#065f46' }}>Total</th><th style={th('r')}>% do total</th></tr></thead>
                <tbody>{vendedores.map(v => (
                  <tr key={v.vendedor}>
                    <td style={{ ...td(), fontWeight: 700, color: '#1a3a5c' }}>{v.vendedor}</td><td style={td('r')}>{v.pedidos.size}</td>
                    <td style={{ ...td('r'), whiteSpace: 'nowrap' }}>{brl(v.flange)}</td><td style={{ ...td('r'), whiteSpace: 'nowrap' }}>{brl(v.cald)}</td>
                    <td style={vtd}>{brl(v.flange + v.cald)}</td>
                    <td style={{ ...td('r'), color: '#64748b' }}>{resumo.total.valor > 0 ? `${(((v.flange + v.cald) / resumo.total.valor) * 100).toFixed(1).replace('.', ',')}%` : '—'}</td>
                  </tr>
                ))}</tbody>
              </>}
            </table>
            {!filtradas.length && <div style={{ padding: 30, textAlign: 'center', color: '#999', fontSize: 13 }}>Nada encontrado.</div>}
          </div>
        </>
      )}
    </div>
  );
}
