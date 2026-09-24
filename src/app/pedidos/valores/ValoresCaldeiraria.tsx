'use client';
// "Valores por Mês" → CALDEIRARIA. Fonte: Planejamento da Caldeiraria
// (/cald-plano, campo `valor` opcional de cada item). Mês = mês em que o item
// CHEGOU na Caldeiraria (1ª entrada numa área); sem chegada ainda → mês do
// lançamento. Separado do Flange de propósito (não mistura os totais).
import { useEffect, useMemo, useState } from 'react';
import { getToken } from '@/lib/auth';
import { dataChegada, AREA_POR_CODIGO, passaEmpresa, nomeEmpresa, valorUnitario, type ItemCald } from '@/lib/caldPlano';
import { FiltroEmpresa } from '@/app/cald-plano/comum';

const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const labelMes = (mes: string) => { const [a, m] = mes.split('-'); const n = MESES[+m - 1] || m; return `${n[0].toUpperCase()}${n.slice(1)} de ${a}`; };
const brl = (v: number) => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const num = (v: number) => Number(v || 0).toLocaleString('pt-BR', { maximumFractionDigits: 2 });
const fmtD = (iso: string | null) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : '—');
const CARD = { background: '#fff', border: '1px solid #e5e7eb', borderRadius: 10, boxShadow: '0 1px 2px rgba(0,0,0,.04)' } as const;

interface Linha { it: ItemCald; mes: string; data: string }
interface Bloco { mes: string; linhas: Linha[]; valor: number; pedidos: number; semValor: number; porCliente: { cliente: string; itens: number; valor: number }[] }

function qtdTxt(linhas: Linha[]): string {
  const m = new Map<string, number>();
  for (const { it } of linhas) if (it.quantidade !== null) m.set(it.unidade || 'pç', (m.get(it.unidade || 'pç') || 0) + it.quantidade);
  return m.size ? Array.from(m.entries()).map(([u, q]) => `${num(q)} ${u}`).join(' · ') : '—';
}

export default function ValoresCaldeiraria({ de, ate }: { de: string; ate: string }) {
  const [itens, setItens] = useState<ItemCald[] | null>(null);
  const [erro, setErro] = useState('');
  const [abertos, setAbertos] = useState<Set<string>>(new Set());
  const [fEmp, setFEmp] = useState('');

  useEffect(() => {
    fetch('/api/cald-plano', { headers: { Authorization: `Bearer ${getToken() || ''}` } })
      .then(async r => { const j = await r.json(); if (!r.ok) throw new Error(j.erro || 'Erro'); setItens(j.itens || []); })
      .catch(e => setErro((e as Error).message || 'Não foi possível carregar a Caldeiraria.'));
  }, []);

  const blocos = useMemo<Bloco[]>(() => {
    if (!itens) return [];
    const mapa = new Map<string, Linha[]>();
    for (const it of itens) {
      if (it.status === 'cancelado' || !passaEmpresa(it, fEmp)) continue;
      const data = dataChegada(it) || String(it.criado_em).slice(0, 10);
      const mes = data.slice(0, 7);
      if ((de && mes < de) || (ate && mes > ate)) continue;
      if (!mapa.has(mes)) mapa.set(mes, []);
      mapa.get(mes)!.push({ it, mes, data });
    }
    return Array.from(mapa.entries()).sort((a, b) => b[0].localeCompare(a[0])).map(([mes, linhas]) => {
      const cli = new Map<string, { cliente: string; itens: number; valor: number }>();
      for (const { it } of linhas) {
        const c = it.cliente || '(sem cliente)';
        const e = cli.get(c) || { cliente: c, itens: 0, valor: 0 };
        e.itens++; e.valor += it.valor || 0; cli.set(c, e);
      }
      linhas.sort((a, b) => b.data.localeCompare(a.data) || a.it.pedido.localeCompare(b.it.pedido));
      return {
        mes, linhas,
        valor: linhas.reduce((s, l) => s + (l.it.valor || 0), 0),
        pedidos: new Set(linhas.map(l => l.it.pedido)).size,
        semValor: linhas.filter(l => l.it.valor === null).length,
        porCliente: Array.from(cli.values()).sort((a, b) => b.valor - a.valor || b.itens - a.itens),
      };
    });
  }, [itens, de, ate, fEmp]);

  useEffect(() => { if (blocos.length && !abertos.size) setAbertos(new Set([blocos[0].mes])); }, [blocos]); // eslint-disable-line react-hooks/exhaustive-deps

  function baixarCsv() {
    const cell = (v: string | number) => { const s = String(v ?? ''); return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
    const nBR = (v: number | null) => (v === null ? '' : String(Number.isInteger(v) ? v : v.toFixed(2)).replace('.', ','));
    const linhas = [['Mês', 'Chegou', 'Empresa', 'Pedido', 'Cliente', 'Vendedor', 'Material', 'Qtd', 'Un.', 'Situação', 'Vlr unitário', 'Vlr total'].map(cell).join(';')];
    let tot = 0;
    for (const b of blocos) for (const { it, data } of b.linhas) {
      tot += it.valor || 0;
      linhas.push([b.mes, fmtD(data), nomeEmpresa(it.empresa), it.pedido, it.cliente || '', it.vendedor || '', it.material, nBR(it.quantidade), it.unidade || '',
        it.status === 'andamento' ? (AREA_POR_CODIGO[it.area_atual || '']?.nome || '') : it.status, nBR(valorUnitario(it)), nBR(it.valor)].map(v => cell(v as string)).join(';'));
    }
    linhas.push('', ['TOTAL GERAL', '', '', '', '', '', '', '', '', '', '', nBR(tot)].map(cell).join(';'));
    const blob = new Blob(['﻿' + linhas.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `valores-por-mes_caldeiraria_${fEmp || 'todas'}.csv`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
  }

  if (erro) return <div className="card" style={{ padding: 16, background: '#fef2f2', border: '1px solid #fca5a5', color: '#b91c1c', fontSize: 13 }}>⚠ {erro}</div>;
  if (!itens) return <div className="card" style={{ padding: 40, textAlign: 'center', color: '#999' }}>Carregando…</div>;

  const totValor = blocos.reduce((s, b) => s + b.valor, 0);
  const totItens = blocos.reduce((s, b) => s + b.linhas.length, 0);
  const totPedidos = new Set(blocos.flatMap(b => b.linhas.map(l => l.it.pedido))).size;
  const totSemValor = blocos.reduce((s, b) => s + b.semValor, 0);

  return (
    <>
      <div className="no-print" style={{ marginBottom: 12 }}><FiltroEmpresa valor={fEmp} onChange={setFEmp} /></div>
      <div style={{ ...CARD, padding: '16px 20px', marginBottom: 16, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16, background: '#fff7ed', borderColor: '#fed7aa' }}>
        <div style={{ fontSize: 12, color: '#c2410c', fontWeight: 700, textTransform: 'uppercase', letterSpacing: .3 }}>
          🏗 Caldeiraria{fEmp ? ` · ${fEmp === 'sem' ? 'Sem empresa' : nomeEmpresa(fEmp)}` : ''} — total do período
          <div style={{ fontSize: 12, color: '#64748b', marginTop: 2, textTransform: 'none', fontWeight: 500 }}>{blocos.length} mês(es) · mês = chegada na Caldeiraria</div>
        </div>
        <div style={{ display: 'flex', gap: 28, flexWrap: 'wrap', alignItems: 'center' }}>
          <div style={{ textAlign: 'right' }}><div style={{ fontSize: 11, color: '#64748b', fontWeight: 600 }}>Pedidos</div><div style={{ fontSize: 22, fontWeight: 800, color: '#1a3a5c' }}>{totPedidos}</div></div>
          <div style={{ textAlign: 'right' }}><div style={{ fontSize: 11, color: '#64748b', fontWeight: 600 }}>Itens</div><div style={{ fontSize: 22, fontWeight: 800, color: '#1a3a5c' }}>{totItens}</div></div>
          <div style={{ textAlign: 'right' }}><div style={{ fontSize: 11, color: '#64748b', fontWeight: 600 }}>Valor</div><div style={{ fontSize: 22, fontWeight: 800, color: '#065f46' }}>{brl(totValor)}</div></div>
          <button className="no-print" onClick={baixarCsv} disabled={!totItens}
            style={{ border: '1px solid #198754', color: '#198754', background: '#fff', borderRadius: 5, padding: '6px 14px', fontSize: 13, cursor: 'pointer', fontWeight: 600 }}>
            <i className="bi bi-file-earmark-excel" style={{ marginRight: 4 }} />Excel
          </button>
        </div>
      </div>

      {totSemValor > 0 && (
        <div style={{ ...CARD, padding: '10px 16px', marginBottom: 14, background: '#fffbeb', borderColor: '#fde68a', color: '#92400e', fontSize: 13 }}>
          <i className="bi bi-info-circle" style={{ marginRight: 6 }} /><b>{totSemValor} item(ns) ainda sem valor</b> — entram na contagem mas não no total. O valor é preenchido no Planejamento da Caldeiraria (ao lançar ou no detalhe do item).
        </div>
      )}
      {!blocos.length && <div className="card" style={{ padding: 40, textAlign: 'center', color: '#999' }}>Nenhum item da Caldeiraria no período.</div>}

      {blocos.map(b => {
        const aberto = abertos.has(b.mes);
        return (
          <div key={b.mes} style={{ ...CARD, marginBottom: 12, overflow: 'hidden' }}>
            <button onClick={() => setAbertos(p => { const n = new Set(p); if (n.has(b.mes)) n.delete(b.mes); else n.add(b.mes); return n; })}
              style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '13px 18px', background: aberto ? '#f8fafc' : '#fff', border: 'none', borderBottom: aberto ? '1px solid #eef2f7' : 'none', cursor: 'pointer', textAlign: 'left' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <i className={`bi ${aberto ? 'bi-chevron-down' : 'bi-chevron-right'}`} style={{ color: '#94a3b8', fontSize: 13 }} />
                <span style={{ fontWeight: 700, color: '#1a3a5c', fontSize: 15 }}>{labelMes(b.mes)}</span>
                <span style={{ fontSize: 12, color: '#64748b', background: '#eef2f7', borderRadius: 20, padding: '2px 10px', fontWeight: 600 }}>{b.pedidos} pedido{b.pedidos !== 1 ? 's' : ''} · {b.linhas.length} ite{b.linhas.length !== 1 ? 'ns' : 'm'}</span>
                <span style={{ fontSize: 12, color: '#c2410c', background: '#ffedd5', borderRadius: 20, padding: '2px 10px', fontWeight: 600 }}>{qtdTxt(b.linhas)}</span>
              </div>
              <span style={{ fontWeight: 800, color: b.valor > 0 ? '#065f46' : '#cbd5e1', fontSize: 16, whiteSpace: 'nowrap' }}>{brl(b.valor)}</span>
            </button>
            {aberto && (
              <div style={{ padding: '4px 0 10px', overflowX: 'auto' }}>
                <div style={{ padding: '12px 18px 6px', fontSize: 12, fontWeight: 700, color: '#475569', textTransform: 'uppercase', letterSpacing: .3 }}><i className="bi bi-people" style={{ marginRight: 6 }} />Por cliente</div>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead><tr style={{ background: '#f8fafc', color: '#475569' }}>{['Cliente', 'Itens', 'Valor'].map((h, i) => <th key={h} style={{ padding: '8px 18px', textAlign: i ? 'right' : 'left', fontWeight: 600, fontSize: 12 }}>{h}</th>)}</tr></thead>
                  <tbody>{b.porCliente.map(c => (
                    <tr key={c.cliente} style={{ borderBottom: '1px solid #f1f5f9' }}>
                      <td style={{ padding: '8px 18px', color: '#1a3a5c', fontWeight: 600 }}>{c.cliente}</td>
                      <td style={{ padding: '8px 18px', textAlign: 'right', color: '#475569' }}>{c.itens}</td>
                      <td style={{ padding: '8px 18px', textAlign: 'right', fontWeight: 700, color: c.valor > 0 ? '#065f46' : '#cbd5e1', whiteSpace: 'nowrap' }}>{brl(c.valor)}</td>
                    </tr>
                  ))}</tbody>
                </table>
                <div style={{ padding: '16px 18px 6px', fontSize: 12, fontWeight: 700, color: '#475569', textTransform: 'uppercase', letterSpacing: .3 }}><i className="bi bi-list-ul" style={{ marginRight: 6 }} />Detalhe dos itens</div>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead><tr style={{ background: '#f8fafc', color: '#475569' }}>{['Chegou', 'Pedido', 'Cliente', 'Vendedor', 'Material', 'Qtd', 'Situação', 'Vlr unit.', 'Vlr total'].map((h, i) => <th key={h} style={{ padding: '8px 14px', textAlign: i >= 5 && i !== 6 ? 'right' : 'left', fontWeight: 600, fontSize: 12, whiteSpace: 'nowrap' }}>{h}</th>)}</tr></thead>
                  <tbody>{b.linhas.map(({ it, data }) => (
                    <tr key={it.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                      <td style={{ padding: '8px 14px', color: '#666', fontSize: 12, whiteSpace: 'nowrap' }}>{fmtD(data)}</td>
                      <td style={{ padding: '8px 14px', color: '#1a3a5c', fontWeight: 700 }}>{it.pedido}</td>
                      <td style={{ padding: '8px 14px', color: '#444' }}>{it.cliente || '—'}</td>
                      <td style={{ padding: '8px 14px', color: '#666' }}>{it.vendedor || '—'}</td>
                      <td style={{ padding: '8px 14px', color: '#444' }}>{it.material}</td>
                      <td style={{ padding: '8px 14px', textAlign: 'right', whiteSpace: 'nowrap', color: '#c2410c', fontWeight: 600 }}>{it.quantidade !== null ? `${num(it.quantidade)} ${it.unidade || ''}` : '—'}</td>
                      <td style={{ padding: '8px 14px', color: '#666', fontSize: 12 }}>{it.status === 'andamento' ? AREA_POR_CODIGO[it.area_atual || '']?.nome : it.status === 'finalizado' ? `Finalizado ${fmtD(it.finalizado_em)}` : it.status === 'aguardando' ? 'Chegando' : 'A planejar'}</td>
                      <td style={{ padding: '8px 14px', textAlign: 'right', color: '#475569', whiteSpace: 'nowrap' }}>{valorUnitario(it) !== null ? brl(valorUnitario(it)!) : '—'}</td>
                      <td style={{ padding: '8px 14px', textAlign: 'right', fontWeight: 700, color: it.valor ? '#065f46' : '#cbd5e1', whiteSpace: 'nowrap' }}>{it.valor !== null ? brl(it.valor) : 'sem valor'}</td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
            )}
          </div>
        );
      })}
    </>
  );
}
