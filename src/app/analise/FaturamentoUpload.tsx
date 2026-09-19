'use client';
/**
 * Faturamento — upload da planilha (Análise PCP).
 *
 * O usuário anexa o Excel "CONTROLE GERAL DE FATURAMENTO" e o sistema lê na hora
 * (client-side, lib `xlsx` já do projeto), agregando por Empresa de Fabricação,
 * Local de Produção e Família, com total geral / fabricado / revenda — as mesmas
 * informações do PDF de apresentação. Botão imprimir gera o PDF numa aba limpa.
 * Detecta as colunas pelo CABEÇALHO (robusto a mudança de posição). Nada é
 * enviado a servidor; a leitura é toda no navegador. Ver [[project_analise_pcp]].
 */
import { useState } from 'react';

interface Linha { nome: string; valor: number }
interface Resultado {
  total: number; fabricado: number; revenda: number; nItens: number;
  empresa: Linha[]; local: Linha[]; familia: Linha[];
  localFabricado: Linha[];
}

const norm = (s: unknown) => String(s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
const titulo = (s: string) => s.trim().replace(/\s+/g, ' ').toLowerCase().replace(/(^|\s)\S/g, c => c.toUpperCase());
const brl = (v: number) => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const pct = (fr: number) => (fr * 100).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + '%';

const CARD = { background: '#fff', border: '1px solid #e5e7eb', borderRadius: 10, boxShadow: '0 1px 2px rgba(0,0,0,.04)' } as const;

export default function FaturamentoUpload() {
  const [res, setRes] = useState<Resultado | null>(null);
  const [nomeArq, setNomeArq] = useState('');
  const [erro, setErro] = useState('');
  const [carregando, setCarregando] = useState(false);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setCarregando(true); setErro(''); setRes(null);
    try {
      const { read, utils } = await import('xlsx');
      const wb = read(await file.arrayBuffer(), { type: 'array' });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows: unknown[][] = utils.sheet_to_json(ws, { header: 1, defval: '' });

      // Acha a linha de cabeçalho (a que tem "local"/"empresa"/"total da nota").
      let hIdx = -1;
      for (let i = 0; i < Math.min(rows.length, 8); i++) {
        const cells = (rows[i] || []).map(norm);
        if (cells.some(c => c.includes('local') || c.includes('empresa') || c.includes('total da nota'))) { hIdx = i; break; }
      }
      if (hIdx < 0) { setErro('Não encontrei o cabeçalho (Local de Produção / Empresa / Total da Nota Fiscal). Confira se é a planilha certa.'); return; }
      const header = (rows[hIdx] || []).map(norm);
      const findCol = (...frags: string[]) => header.findIndex(h => frags.every(f => h.includes(f)));
      const cDesc = findCol('descri');
      let cValor = findCol('total da nota');
      if (cValor < 0) cValor = findCol('total', 'nota');
      const cFam = findCol('famil');
      const cLocal = findCol('local');
      const cEmp = findCol('empresa');
      if (cValor < 0) { setErro('Não encontrei a coluna "Total da Nota Fiscal".'); return; }

      const emp = new Map<string, number>(), loc = new Map<string, number>(), fam = new Map<string, number>();
      let total = 0, n = 0;
      const add = (m: Map<string, number>, k: string, v: number) => m.set(k, (m.get(k) || 0) + v);
      for (let i = hIdx + 1; i < rows.length; i++) {
        const r = rows[i] || [];
        // Pula linhas sem descrição (ex.: linha de totais) — mesma regra do import.
        if (cDesc >= 0 && !String(r[cDesc] ?? '').trim()) continue;
        if (cDesc < 0 && !String(r[0] ?? '').trim()) continue;
        const v = Number(r[cValor]);
        if (!Number.isFinite(v)) continue;
        const e = (cEmp >= 0 ? String(r[cEmp] ?? '').trim() : '') || '(sem empresa)';
        const l = (cLocal >= 0 ? String(r[cLocal] ?? '').trim() : '') || '(sem local)';
        const f = (cFam >= 0 ? String(r[cFam] ?? '').trim() : '') || '(sem família)';
        add(emp, e, v); add(loc, l, v); add(fam, f, v);
        total += v; n++;
      }
      if (n === 0) { setErro('Nenhum item lido. Confira a planilha.'); return; }

      const ord = (m: Map<string, number>): Linha[] => Array.from(m.entries()).map(([nome, valor]) => ({ nome, valor })).sort((a, b) => b.valor - a.valor);
      const localArr = ord(loc);
      const revenda = localArr.filter(x => norm(x.nome) === 'revenda').reduce((s, x) => s + x.valor, 0);
      const localFab = localArr.filter(x => norm(x.nome) !== 'revenda');
      const fabricado = localFab.reduce((s, x) => s + x.valor, 0);
      setRes({ total, fabricado, revenda, nItens: n, empresa: ord(emp), local: localArr, familia: ord(fam), localFabricado: localFab });
      setNomeArq(file.name);
    } catch {
      setErro('Erro ao ler o arquivo. Confirme que é um .xlsx válido.');
    } finally {
      setCarregando(false);
    }
  }

  function imprimir() {
    if (!res) return;
    const linhaTab = (arr: Linha[], denom: number) => arr.map(x =>
      `<tr><td>${titulo(x.nome)}</td><td class=r>${brl(x.valor)}</td><td class=r>${pct(x.valor / denom)}</td></tr>`).join('');
    const w = window.open('', '_blank');
    if (!w) return;
    w.document.write(`<!doctype html><html lang=pt-BR><head><meta charset=utf-8><title>Faturamento — Apresentação</title>
    <style>
      body{font-family:Arial,Helvetica,sans-serif;color:#1a3a5c;margin:24px;}
      h1{font-size:20px;margin:0 0 2px} .sub{color:#64748b;font-size:12px;margin-bottom:12px}
      .kpis{display:flex;gap:12px;margin:12px 0 18px}
      .kpi{flex:1;border:1px solid #e2e8f0;border-radius:8px;padding:10px 12px}
      .kpi .t{font-size:10px;color:#64748b} .kpi .v{font-size:17px;font-weight:800} .kpi .s{font-size:10px;color:#64748b}
      h2{font-size:14px;margin:16px 0 6px;color:#1a3a5c}
      table{width:100%;border-collapse:collapse;font-size:12px;margin-bottom:8px}
      th{background:#1a3a5c;color:#fff;text-align:left;padding:6px 8px}
      td{padding:5px 8px;border-bottom:1px solid #eef2f7} td.r,th.r{text-align:right}
      tr:nth-child(even) td{background:#f8fafc}
      .note{font-size:10px;color:#64748b;margin-top:10px}
      @media print{@page{margin:14mm}}
    </style></head><body onload="window.print()">
      <h1>Faturamento — Apresentação à Diretoria</h1>
      <div class=sub>Por Empresa de Fabricação e Local de Produção · valores por Total da Nota Fiscal</div>
      <div class=kpis>
        <div class=kpi style="background:#eef4fb"><div class=t>FATURAMENTO TOTAL</div><div class=v>${brl(res.total)}</div><div class=s>base: Total da Nota Fiscal</div></div>
        <div class=kpi style="background:#e9f7f0"><div class=t>FABRICADO (produção própria)</div><div class=v style="color:#0f7b4f">${brl(res.fabricado)}</div><div class=s>${pct(res.fabricado / res.total)} do total</div></div>
        <div class=kpi style="background:#fdf0e8"><div class=t>REVENDA</div><div class=v style="color:#c2410c">${brl(res.revenda)}</div><div class=s>${pct(res.revenda / res.total)} do total</div></div>
      </div>
      <h2>Por Empresa de Fabricação</h2>
      <table><thead><tr><th>Empresa</th><th class=r>Valor (NF)</th><th class=r>% do Total</th></tr></thead><tbody>${linhaTab(res.empresa, res.total)}</tbody></table>
      <h2>Por Local de Produção (fábricas)</h2>
      <table><thead><tr><th>Local de Produção</th><th class=r>Valor (NF)</th><th class=r>% do Fabricado</th></tr></thead><tbody>
        ${linhaTab(res.localFabricado, res.fabricado)}
        <tr style="font-weight:800;background:#e9f7f0"><td>TOTAL FABRICADO</td><td class=r>${brl(res.fabricado)}</td><td class=r>100,0%</td></tr>
        <tr style="color:#c2410c;background:#fdf0e8"><td>Revenda (não fabricado)</td><td class=r>${brl(res.revenda)}</td><td class=r>—</td></tr>
        <tr style="font-weight:800;background:#1a3a5c;color:#fff"><td>TOTAL GERAL FATURADO</td><td class=r>${brl(res.total)}</td><td class=r>—</td></tr>
      </tbody></table>
      <h2>Por Família (classificação do produto)</h2>
      <table><thead><tr><th>Família</th><th class=r>Valor (NF)</th><th class=r>% do Total</th></tr></thead><tbody>${linhaTab(res.familia, res.total)}</tbody></table>
      <div class=note>"Fabricado" = todos os Locais de Produção exceto Revenda. Valores por Total da Nota Fiscal.</div>
    </body></html>`);
    w.document.close();
  }

  function Secao({ titulo: t, arr, denom, cabecalho }: { titulo: string; arr: Linha[]; denom: number; cabecalho: string }) {
    return (
      <div style={{ marginTop: 14 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: '#475569', textTransform: 'uppercase', letterSpacing: .3, marginBottom: 6 }}>{t}</div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: '#f8fafc', color: '#475569' }}>
                <th style={{ padding: '7px 12px', textAlign: 'left', fontSize: 12, fontWeight: 600 }}>{cabecalho}</th>
                <th style={{ padding: '7px 12px', textAlign: 'right', fontSize: 12, fontWeight: 600 }}>Valor (NF)</th>
                <th style={{ padding: '7px 12px', textAlign: 'right', fontSize: 12, fontWeight: 600 }}>%</th>
              </tr>
            </thead>
            <tbody>
              {arr.map(x => (
                <tr key={x.nome} style={{ borderBottom: '1px solid #f1f5f9' }}>
                  <td style={{ padding: '6px 12px', color: '#1a3a5c', fontWeight: 600 }}>{titulo(x.nome)}</td>
                  <td style={{ padding: '6px 12px', textAlign: 'right', fontWeight: 700, color: '#065f46', whiteSpace: 'nowrap' }}>{brl(x.valor)}</td>
                  <td style={{ padding: '6px 12px', textAlign: 'right', color: '#64748b' }}>{pct(x.valor / denom)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  return (
    <div style={{ ...CARD, padding: 18, marginBottom: 18 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
        <div style={{ fontWeight: 800, color: '#1a3a5c', fontSize: 15 }}>
          <i className="bi bi-file-earmark-spreadsheet" style={{ marginRight: 8 }} />Faturamento — importar planilha
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <label style={{ background: '#1a3a5c', color: '#fff', borderRadius: 6, padding: '8px 14px', fontSize: 13, cursor: 'pointer', fontWeight: 600 }}>
            <i className="bi bi-upload" style={{ marginRight: 6 }} />{res ? 'Trocar arquivo' : 'Anexar Excel'}
            <input type="file" accept=".xlsx,.xls" onChange={onFile} style={{ display: 'none' }} />
          </label>
          {res && (
            <button onClick={imprimir} style={{ border: '1px solid #198754', color: '#198754', background: 'none', borderRadius: 6, padding: '8px 14px', fontSize: 13, cursor: 'pointer', fontWeight: 600 }}>
              <i className="bi bi-printer" style={{ marginRight: 6 }} />Imprimir / PDF
            </button>
          )}
        </div>
      </div>
      <div style={{ fontSize: 12.5, color: '#64748b', marginTop: 4 }}>
        Anexe o Excel de faturamento (Total da Nota Fiscal). O sistema agrupa por Empresa de Fabricação, Local de Produção e Família — só leitura, nada é salvo no servidor.
      </div>

      {carregando && <div style={{ padding: 20, textAlign: 'center', color: '#999' }}>Lendo a planilha…</div>}
      {erro && <div style={{ marginTop: 12, padding: 12, background: '#fef2f2', border: '1px solid #fca5a5', color: '#b91c1c', fontSize: 13, borderRadius: 8 }}>⚠ {erro}</div>}
      {nomeArq && !erro && <div style={{ marginTop: 10, fontSize: 12, color: '#0f7b4f' }}><i className="bi bi-check-circle" style={{ marginRight: 5 }} />{nomeArq} · {res?.nItens} itens lidos</div>}

      {res && (
        <>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 14 }}>
            {[
              { t: 'FATURAMENTO TOTAL', v: brl(res.total), s: 'base: Total da Nota Fiscal', bg: '#eef4fb', cor: '#1a3a5c' },
              { t: 'FABRICADO (produção própria)', v: brl(res.fabricado), s: pct(res.fabricado / res.total) + ' do total', bg: '#e9f7f0', cor: '#0f7b4f' },
              { t: 'REVENDA', v: brl(res.revenda), s: pct(res.revenda / res.total) + ' do total', bg: '#fdf0e8', cor: '#c2410c' },
            ].map(k => (
              <div key={k.t} style={{ flex: '1 1 200px', background: k.bg, border: '1px solid #e2e8f0', borderRadius: 8, padding: '12px 14px' }}>
                <div style={{ fontSize: 11, color: '#64748b', fontWeight: 600 }}>{k.t}</div>
                <div style={{ fontSize: 20, fontWeight: 800, color: k.cor }}>{k.v}</div>
                <div style={{ fontSize: 11, color: '#64748b' }}>{k.s}</div>
              </div>
            ))}
          </div>

          <Secao titulo="Por Empresa de Fabricação" arr={res.empresa} denom={res.total} cabecalho="Empresa" />
          <Secao titulo="Por Local de Produção (fábricas)" arr={res.localFabricado} denom={res.fabricado} cabecalho="Local de Produção" />
          <Secao titulo="Por Família (classificação)" arr={res.familia} denom={res.total} cabecalho="Família" />
        </>
      )}
    </div>
  );
}
