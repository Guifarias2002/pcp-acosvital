'use client';
/**
 * Faturamento — upload da planilha (Análise PCP).
 *
 * A planilha anexada é sempre a BASE do relatório. Dois formatos:
 *   • BRUTA (export Omie "Faturamento por Produto": Descrição | Total NF | Pedido | NF)
 *     → o sistema classifica cada linha em Família / Local de produção / Empresa de
 *     fabricação com os critérios do CONTROLE GERAL (lib/faturamento/classificar),
 *     só "Pedido de Venda" entra, e soma a Caldeiraria do sistema do mês (sem contar
 *     pedido duas vezes);
 *   • JÁ CLASSIFICADA (ex.: CONTROLE GERAL, com Família/Local/Empresa preenchidos)
 *     → usa a classificação da própria planilha.
 * Gera Excel (layout do CONTROLE GERAL + Resumo) e PDF da diretoria com as mesmas
 * informações, COM Flanges. Leitura/geração no navegador; só a Caldeiraria vem da
 * API. Ver [[project_faturamento_mensal]] / [[project_analise_pcp]].
 */
import { useState } from 'react';
import { getFaturamentoCaldeiraria } from '@/lib/api';
import { lerOmie, lerClassificada, montarRelatorio, nomeMes, brl, pct, titulo, MESES, type Relatorio, type Soma, type ItemCald } from '@/lib/faturamento/relatorio';

const CARD = { background: '#fff', border: '1px solid #e5e7eb', borderRadius: 10, boxShadow: '0 1px 2px rgba(0,0,0,.04)' } as const;

function mesAnteriorOuAtual() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function baixar(blob: Blob, nome: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = nome; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export default function FaturamentoUpload() {
  const [mes, setMes] = useState(mesAnteriorOuAtual());
  const [somarCald, setSomarCald] = useState(true);
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [rel, setRel] = useState<Relatorio | null>(null);
  const [erro, setErro] = useState('');
  const [aviso, setAviso] = useState('');
  const [carregando, setCarregando] = useState(false);
  const [ano, m] = mes.split('-');

  async function processar(file: File | null = arquivo) {
    if (!file) return;
    setCarregando(true); setErro(''); setAviso(''); setRel(null);
    try {
      const XLSX = await import('xlsx');
      const wb = XLSX.read(await file.arrayBuffer(), { type: 'array' });
      const matriz = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: true, defval: null });
      const base = lerClassificada(matriz, mes);
      if (base) { setRel(base); return; }
      const omie = lerOmie(matriz);
      if (!omie.length) throw new Error('O Excel não tem nenhuma linha de produto.');
      let itens: ItemCald[] = [];
      if (somarCald) {
        try { itens = (await getFaturamentoCaldeiraria(mes)).itens || []; }
        catch { setAviso('Não consegui buscar a Caldeiraria do sistema — relatório gerado só com a planilha.'); }
      }
      setRel(montarRelatorio(omie, itens, mes));
    } catch (e: unknown) {
      setErro((e as Error)?.message || 'Erro ao ler o arquivo. Confirme que é um .xlsx válido.');
    } finally {
      setCarregando(false);
    }
  }

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] || null;
    e.target.value = '';
    setArquivo(file);
    processar(file);
  }

  const nomeBase = rel ? `Faturamento - ${nomeMes(rel.mes)}` : '';
  async function excel() { if (rel) baixar((await import('@/lib/faturamento/exportar')).gerarExcel(rel), `${nomeBase}.xlsx`); }
  async function pdf() { if (rel) baixar(await (await import('@/lib/faturamento/exportar')).gerarPdf(rel), `${nomeBase}.pdf`); }

  function Secao({ titulo: t, arr, denom, cabecalho }: { titulo: string; arr: Soma; denom: number; cabecalho: string }) {
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
              {arr.map(([nome, valor]) => (
                <tr key={nome} style={{ borderBottom: '1px solid #f1f5f9' }}>
                  <td style={{ padding: '6px 12px', color: '#1a3a5c', fontWeight: 600 }}>{titulo(nome)}</td>
                  <td style={{ padding: '6px 12px', textAlign: 'right', fontWeight: 700, color: '#065f46', whiteSpace: 'nowrap' }}>{brl(valor)}</td>
                  <td style={{ padding: '6px 12px', textAlign: 'right', color: '#64748b' }}>{pct(denom ? valor / denom : 0)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  const botao = (cor: string) => ({ border: `1px solid ${cor}`, color: cor, background: 'none', borderRadius: 6, padding: '8px 14px', fontSize: 13, cursor: 'pointer', fontWeight: 600 });
  const vCald = rel ? rel.caldeiraria.reduce((s, l) => s + l.v, 0) : 0;

  return (
    <div style={{ ...CARD, padding: 18, marginBottom: 18 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
        <div style={{ fontWeight: 800, color: '#1a3a5c', fontSize: 15 }}>
          <i className="bi bi-file-earmark-spreadsheet" style={{ marginRight: 8 }} />Faturamento — importar planilha base
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <select value={m} onChange={(e) => { setMes(`${ano}-${e.target.value}`); setRel(null); }} style={{ padding: '7px 8px', borderRadius: 6, border: '1px solid #cbd5e1', fontSize: 13 }} title="Mês do relatório">
            {MESES.map((n, i) => <option key={n} value={String(i + 1).padStart(2, '0')}>{i + 1} - {n}</option>)}
          </select>
          <input type="number" value={ano} min={2024} max={2100} onChange={(e) => { setMes(`${e.target.value}-${m}`); setRel(null); }}
            style={{ width: 78, padding: '7px 8px', borderRadius: 6, border: '1px solid #cbd5e1', fontSize: 13 }} title="Ano" />
          <label style={{ fontSize: 12.5, color: '#334155', display: 'flex', alignItems: 'center', gap: 4 }} title="Soma os itens do PCP Caldeiraria do mês (planilha bruta)">
            <input type="checkbox" checked={somarCald} onChange={(e) => { setSomarCald(e.target.checked); setRel(null); }} />Somar Caldeiraria do sistema
          </label>
          <label style={{ background: '#1a3a5c', color: '#fff', borderRadius: 6, padding: '8px 14px', fontSize: 13, cursor: 'pointer', fontWeight: 600 }}>
            <i className="bi bi-upload" style={{ marginRight: 6 }} />{arquivo ? 'Trocar arquivo' : 'Anexar Excel'}
            <input type="file" accept=".xlsx,.xls" onChange={onFile} style={{ display: 'none' }} />
          </label>
          {arquivo && !rel && !carregando && (
            <button onClick={() => processar()} style={botao('#1a3a5c')}><i className="bi bi-arrow-repeat" style={{ marginRight: 6 }} />Gerar</button>
          )}
          {rel && (<>
            <button onClick={excel} style={botao('#198754')}><i className="bi bi-file-earmark-excel" style={{ marginRight: 6 }} />Baixar Excel</button>
            <button onClick={pdf} style={botao('#b91c1c')}><i className="bi bi-file-earmark-pdf" style={{ marginRight: 6 }} />Baixar PDF</button>
          </>)}
        </div>
      </div>
      <div style={{ fontSize: 12.5, color: '#64748b', marginTop: 4 }}>
        Anexe a planilha bruta do Omie (Faturamento por Produto) — o sistema já separa por Empresa de Fabricação, Local de Produção e Família, com Flanges,
        e soma a Caldeiraria do sistema. Se a planilha já vier classificada (como o CONTROLE GERAL), usa a classificação dela. Nada é salvo no servidor.
      </div>

      {carregando && <div style={{ padding: 20, textAlign: 'center', color: '#999' }}>Lendo e classificando a planilha…</div>}
      {erro && <div style={{ marginTop: 12, padding: 12, background: '#fef2f2', border: '1px solid #fca5a5', color: '#b91c1c', fontSize: 13, borderRadius: 8 }}>⚠ {erro}</div>}
      {aviso && <div style={{ marginTop: 12, padding: 12, background: '#fffbeb', border: '1px solid #fcd34d', color: '#92400e', fontSize: 13, borderRadius: 8 }}>⚠ {aviso}</div>}
      {rel && arquivo && (
        <div style={{ marginTop: 10, fontSize: 12, color: '#0f7b4f' }}>
          <i className="bi bi-check-circle" style={{ marginRight: 5 }} />{arquivo.name} · {nomeMes(rel.mes)} · {rel.linhas.length} linhas
          {rel.jaClassificada ? ' · planilha já classificada (usa a classificação dela)'
            : ` · classificado pelo sistema · ${rel.fora.length} fora do critério (Remessa, Devolução…)`}
          {!rel.jaClassificada && rel.caldeiraria.length > 0 && ` · Caldeiraria do sistema ${brl(vCald)} (${rel.duplicados.length} linhas duplicadas retiradas)`}
          {rel.semRegra > 0 && <b style={{ color: '#b45309' }}> · {rel.semRegra} linhas pra conferir (marcadas no Excel)</b>}
        </div>
      )}

      {rel && (
        <>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 14 }}>
            {[
              { t: 'FATURAMENTO TOTAL', v: brl(rel.resumo.total), s: 'base: Total da Nota Fiscal', bg: '#eef4fb', cor: '#1a3a5c' },
              { t: 'FABRICADO (produção própria)', v: brl(rel.resumo.fabricado), s: pct(rel.resumo.total ? rel.resumo.fabricado / rel.resumo.total : 0) + ' do total', bg: '#e9f7f0', cor: '#0f7b4f' },
              { t: 'REVENDA', v: brl(rel.resumo.revenda), s: pct(rel.resumo.total ? rel.resumo.revenda / rel.resumo.total : 0) + ' do total', bg: '#fdf0e8', cor: '#c2410c' },
            ].map(k => (
              <div key={k.t} style={{ flex: '1 1 200px', background: k.bg, border: '1px solid #e2e8f0', borderRadius: 8, padding: '12px 14px' }}>
                <div style={{ fontSize: 11, color: '#64748b', fontWeight: 600 }}>{k.t}</div>
                <div style={{ fontSize: 20, fontWeight: 800, color: k.cor }}>{k.v}</div>
                <div style={{ fontSize: 11, color: '#64748b' }}>{k.s}</div>
              </div>
            ))}
          </div>

          <Secao titulo="Por Empresa de Fabricação" arr={rel.resumo.empresa} denom={rel.resumo.total} cabecalho="Empresa" />
          <Secao titulo="Por Local de Produção (fábricas)" arr={rel.resumo.local} denom={rel.resumo.fabricado} cabecalho="Local de Produção" />
          <Secao titulo="Por Família (classificação)" arr={rel.resumo.familia} denom={rel.resumo.total} cabecalho="Família" />
        </>
      )}
    </div>
  );
}
