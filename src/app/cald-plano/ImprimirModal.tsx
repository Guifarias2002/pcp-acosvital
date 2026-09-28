'use client';
// Impressão do PCP Caldeiraria: TODOS os pedidos, UM pedido específico ou os
// materiais POR ÁREA. Monta um HTML simples numa janela nova e chama print()
// (mesmo padrão da Caixa de Pendências).
import { useMemo, useState } from 'react';
import { AREAS_CALD, EMPRESAS_CALD, passaEmpresa, nomeEmpresa, hojeISO, fmtData, diasEntre, nomeSubsetor, type ItemCald } from '@/lib/caldPlano';
import { C, Modal, Campo, nomeArea, fmtQtd, fmtBRL } from './comum';

type Modo = 'todos' | 'pedido' | 'area';

const esc = (s: string | null | undefined) => (s || '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
const ondeEsta = (i: ItemCald) =>
  i.status === 'andamento' ? nomeArea(i.area_atual) : i.status === 'finalizado' ? `Finalizado ${fmtData(i.finalizado_em)}` : 'Início — A planejar';
const entradaAtual = (i: ItemCald) => (i.status === 'andamento' ? i.etapas.find(e => e.area === i.area_atual)?.entrada ?? null : null);
const soma = (l: ItemCald[]) => l.reduce((s, i) => s + (i.valor ?? 0), 0);

export default function ImprimirModal({ itens, verValores, onFechar }: { itens: ItemCald[]; verValores: boolean; onFechar: () => void }) {
  const [modo, setModo] = useState<Modo>('todos');
  const [pedido, setPedido] = useState('');
  const [area, setArea] = useState('');           // '' = todas as áreas
  const [emp, setEmp] = useState('');
  const [comFinalizados, setComFinalizados] = useState(false);
  const hoje = hojeISO();

  const base = useMemo(() => itens.filter(i =>
    i.status !== 'cancelado' && (comFinalizados || i.status !== 'finalizado') && passaEmpresa(i, emp),
  ), [itens, comFinalizados, emp]);
  const pedidos = useMemo(() => Array.from(new Set(base.map(i => i.pedido))).sort((a, b) => a.localeCompare(b, 'pt-BR', { numeric: true })), [base]);

  const selecionados = modo === 'pedido' ? base.filter(i => i.pedido === pedido)
    : modo === 'area' && area ? base.filter(i => chaveArea(i) === area) : base;

  function chaveArea(i: ItemCald) {
    return i.status === 'andamento' ? i.area_atual || '' : i.status === 'finalizado' ? '__fin' : '__inicio';
  }

  function tabelaPedido(ped: string, l: ItemCald[]) {
    const p = l[0];
    const linhas = l.map(i => `
      <tr><td>${esc(i.material)}</td><td class="n">${esc(fmtQtd(i.quantidade, i.unidade))}</td><td>${esc(ondeEsta(i))}${i.sub_setor ? ` › ${esc(nomeSubsetor(i.sub_setor))}` : ''}</td>
      <td>${fmtData(entradaAtual(i)) || '—'}</td><td>${esc(i.areas.map(nomeArea).join(' → ')) || '—'}</td>
      ${verValores ? `<td class="n">${i.valor !== null ? fmtBRL(i.valor) : '—'}</td>` : ''}</tr>`).join('');
    return `
      <div class="bloco">
        <h3>Pedido ${esc(ped)} <span>${esc(nomeEmpresa(p.empresa))}${p.cliente ? ' · ' + esc(p.cliente) : ''}${p.vendedor ? ' · vend. ' + esc(p.vendedor) : ''}</span></h3>
        <div class="sub">${p.prazo_entrega ? `Prazo de entrega: <b>${fmtData(p.prazo_entrega)}</b> · ` : ''}${p.prev_faturamento ? `Prev. faturamento: <b>${fmtData(p.prev_faturamento)}</b> · ` : ''}<b>${l.length}</b> ${l.length === 1 ? 'material' : 'materiais'}${verValores ? ` · total <b>${fmtBRL(soma(l))}</b>` : ''}</div>
        <table><thead><tr><th>Material</th><th>Qtd</th><th>Onde está</th><th>Entrou</th><th>Roteiro</th>${verValores ? '<th>Valor</th>' : ''}</tr></thead>
        <tbody>${linhas}</tbody></table>
      </div>`;
  }

  function tabelaArea(nome: string, l: ItemCald[]) {
    const linhas = l.map(i => {
      const ent = entradaAtual(i);
      return `<tr><td><b>${esc(i.pedido)}</b></td><td>${esc(i.material)}</td><td class="n">${esc(fmtQtd(i.quantidade, i.unidade))}</td>
        <td>${esc(i.cliente)}</td><td>${esc(nomeEmpresa(i.empresa))}</td><td>${ent ? `${fmtData(ent)} (${diasEntre(ent, hoje)}d)` : i.status === 'finalizado' ? fmtData(i.finalizado_em) : '—'}</td>
        ${verValores ? `<td class="n">${i.valor !== null ? fmtBRL(i.valor) : '—'}</td>` : ''}<td class="anot"></td></tr>`;
    }).join('');
    return `
      <div class="bloco">
        <h3>${esc(nome)} <span>${l.length} ${l.length === 1 ? 'material' : 'materiais'}${verValores ? ' · ' + fmtBRL(soma(l)) : ''}</span></h3>
        <table><thead><tr><th>Pedido</th><th>Material</th><th>Qtd</th><th>Cliente</th><th>Empresa</th><th>Entrou</th>${verValores ? '<th>Valor</th>' : ''}<th>Obs.</th></tr></thead>
        <tbody>${linhas}</tbody></table>
      </div>`;
  }

  function imprimir() {
    let corpo = '';
    let titulo = '';
    if (modo === 'area') {
      titulo = area ? `Materiais — ${area === '__inicio' ? 'Início — A planejar' : area === '__fin' ? 'Finalizados' : nomeArea(area)}` : 'Materiais por área';
      const grupos: [string, string][] = [['__inicio', 'Início — A planejar'], ...AREAS_CALD.map(a => [a.codigo, a.nome] as [string, string]), ['__fin', 'Finalizados']];
      corpo = grupos
        .filter(([c]) => !area || c === area)
        .map(([c, nome]) => {
          const l = selecionados.filter(i => chaveArea(i) === c).sort((a, b) => (a.ordem || 9999) - (b.ordem || 9999) || a.pedido.localeCompare(b.pedido, 'pt-BR', { numeric: true }));
          return l.length ? tabelaArea(nome, l) : '';
        }).join('');
    } else {
      titulo = modo === 'pedido' ? `Pedido ${pedido}` : 'Todos os pedidos';
      const porPedido = new Map<string, ItemCald[]>();
      for (const i of selecionados) porPedido.set(i.pedido, [...(porPedido.get(i.pedido) || []), i]);
      corpo = Array.from(porPedido.entries())
        .sort(([a], [b]) => a.localeCompare(b, 'pt-BR', { numeric: true }))
        .map(([p, l]) => tabelaPedido(p, l.sort((a, b) => a.id - b.id))).join('');
    }
    const nPed = new Set(selecionados.map(i => i.pedido)).size;
    const w = window.open('', '_blank');
    if (!w) return;
    w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Caldeiraria — ${esc(titulo)} ${fmtData(hoje)}</title>
      <style>body{font-family:Arial,sans-serif;margin:18px;color:#1e293b}h2{margin:0 0 4px;color:#1a3a5c}p{margin:0 0 14px;color:#64748b;font-size:12px}
      .bloco{margin-bottom:18px;page-break-inside:avoid}h3{margin:0 0 3px;font-size:14px;color:#1a3a5c}h3 span{font-weight:400;color:#64748b;font-size:12px;margin-left:6px}
      .sub{font-size:11.5px;color:#475569;margin-bottom:5px}table{width:100%;border-collapse:collapse;font-size:11.5px}
      th,td{border:1px solid #cbd5e1;padding:5px 6px;vertical-align:top;text-align:left}th{background:#f1f5f9;font-size:10.5px;text-transform:uppercase}
      td.n{text-align:right;white-space:nowrap}td.anot{width:16%}</style></head>
      <body onload="window.print()"><h2>🏗 PCP Caldeiraria — ${esc(titulo)}</h2>
      <p>${nPed} pedido(s) · ${selecionados.length} material(is)${verValores ? ' · total ' + fmtBRL(soma(selecionados)) : ''}${emp ? ' · ' + esc(emp === 'sem' ? 'Sem empresa' : nomeEmpresa(emp)) : ''}${comFinalizados ? ' · inclui finalizados' : ''} · impresso em ${fmtData(hoje)}</p>
      ${corpo || '<p>Nenhum material.</p>'}</body></html>`);
    w.document.close();
  }

  const bot = (m: Modo, icon: string, rot: string) => (
    <button key={m} className={`cp-tab ${modo === m ? 'on' : ''}`} onClick={() => setModo(m)}><i className={`bi ${icon}`} />{rot}</button>
  );

  return (
    <Modal largura={620} onFechar={onFechar}
      titulo={<><i className="bi bi-printer" style={{ marginRight: 8 }} />Imprimir — Caldeiraria</>}
      rodape={<>
        <span style={{ fontSize: 12.5, color: C.cinza, marginRight: 'auto', alignSelf: 'center' }}>
          {new Set(selecionados.map(i => i.pedido)).size} pedido(s) · {selecionados.length} material(is)
        </span>
        <button className="cp-btn" onClick={onFechar}>Cancelar</button>
        <button className="cp-btn pri" onClick={imprimir} disabled={!selecionados.length}><i className="bi bi-printer" />Imprimir</button>
      </>}>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
        {bot('todos', 'bi-list-ul', 'Todos os pedidos')}
        {bot('pedido', 'bi-file-earmark-text', 'Um pedido')}
        {bot('area', 'bi-diagram-3', 'Materiais por área')}
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 12 }}>
        {modo === 'pedido' && (
          <Campo rot="Pedido">
            <select className="cp-in" value={pedido} onChange={e => setPedido(e.target.value)}>
              <option value="">Escolha o pedido…</option>
              {pedidos.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
          </Campo>
        )}
        {modo === 'area' && (
          <Campo rot="Área">
            <select className="cp-in" value={area} onChange={e => setArea(e.target.value)}>
              <option value="">Todas as áreas (uma seção por área)</option>
              <option value="__inicio">Início — A planejar</option>
              {AREAS_CALD.map(a => <option key={a.codigo} value={a.codigo}>{a.nome}</option>)}
              {comFinalizados && <option value="__fin">Finalizados</option>}
            </select>
          </Campo>
        )}
        <Campo rot="Empresa" largura={190}>
          <select className="cp-in" value={emp} onChange={e => setEmp(e.target.value)}>
            <option value="">Todas as empresas</option>
            {EMPRESAS_CALD.map(e => <option key={e.codigo} value={e.codigo}>{e.nome}</option>)}
            <option value="sem">Sem empresa</option>
          </select>
        </Campo>
      </div>
      <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: C.texto }}>
        <input type="checkbox" checked={comFinalizados} onChange={e => setComFinalizados(e.target.checked)} />
        Incluir materiais já finalizados
      </label>
    </Modal>
  );
}
