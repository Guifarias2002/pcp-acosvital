'use client';
/**
 * /pedidos/valores — Relatório "Valores por Mês" (PRIVADO do Guilherme).
 *
 * Lista TODOS os pedidos (desde o início), o VALOR de cada um, agrupados pelo mês
 * de emissão. Total geral no topo + total por mês, cada mês recolhível com a
 * tabela dos pedidos que o compõem. Filtro opcional de período e botão imprimir.
 * Acesso só por login (podeVerValoresMes) — o gate real está aqui (redirect) e na
 * API (/api/pedidos/valores-mes → 403). Ver [[project_paradas_pedidos]].
 */
import { useEffect, useState, useCallback, useMemo, type CSSProperties } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import AuthGuard from '@/components/AuthGuard';
import { getValoresMes } from '@/lib/api';
import { getUser, podeVerValoresMes } from '@/lib/auth';
import { STATUS_LABELS } from '@/lib/types';

interface ItemProduto {
  codigo: string;
  descricao: string;
  unidade: string;
  quantidade: number;
  valor_unitario: number;
  valor: number;
}
interface PedidoValor {
  id: number;
  numero_pedido_venda: string;
  numero_op: string;
  cliente: string;
  vendedor: string;
  status: string;
  data_emissao: string;
  valor: number;
  pecas: number;
  itens?: ItemProduto[];
}
interface ClienteAgg { cliente: string; count: number; pecas: number; valor: number }
interface MesBloco { mes: string; total: number; count: number; pecas: number; por_cliente: ClienteAgg[]; pedidos: PedidoValor[] }
interface Resposta { meses: MesBloco[]; total_geral: number; pecas_geral: number; count_geral: number }

function brl(v: number): string {
  return Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}
function num(v: number): string {
  // Peças podem vir fracionadas (kg/m); mostra sem casas quando inteiro.
  const n = Number(v || 0);
  return n.toLocaleString('pt-BR', { maximumFractionDigits: Number.isInteger(n) ? 0 : 2 });
}
function fmtData(s: string): string {
  if (!s) return '—';
  const d = new Date(String(s).slice(0, 10) + 'T12:00:00');
  return isNaN(d.getTime()) ? s : d.toLocaleDateString('pt-BR');
}
const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
function labelMes(mes: string): string {
  // mes = 'YYYY-MM'
  const [ano, m] = mes.split('-');
  const i = parseInt(m, 10) - 1;
  const nome = MESES[i] || m;
  return `${nome.charAt(0).toUpperCase()}${nome.slice(1)} de ${ano}`;
}

const CARD = { background: '#fff', border: '1px solid #e5e7eb', borderRadius: 10, boxShadow: '0 1px 2px rgba(0,0,0,.04)' } as const;

// Estilo dos botões-opção do modal de exportação (selecionado × não).
function optBtn(active: boolean): CSSProperties {
  return {
    flex: 1, textAlign: 'left', cursor: 'pointer', borderRadius: 8, padding: '10px 12px',
    border: `2px solid ${active ? '#198754' : '#e5e7eb'}`,
    background: active ? '#f0fdf4' : '#fff',
    color: active ? '#065f46' : '#475569',
    transition: 'all .12s',
  };
}

// Badge de variação % do valor de um mês em relação ao mês ANTERIOR (o próximo na
// lista, que vem ordenada do mais recente pro mais antigo). Verde=subiu, vermelho=
// caiu, cinza=igual/sem base de comparação.
function VariacaoBadge({ atual, anterior }: { atual: number; anterior?: number }) {
  if (anterior === undefined) {
    return <span style={{ fontSize: 11, color: '#94a3b8', fontWeight: 600, whiteSpace: 'nowrap' }} title="Sem mês anterior para comparar">—</span>;
  }
  if (!anterior) {
    // Mês anterior tinha valor zero: % não faz sentido, mostra só a direção.
    const subiu = atual > 0;
    return (
      <span style={{ fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap', color: subiu ? '#059669' : '#64748b' }}>
        {subiu ? '▲ novo' : '—'}
      </span>
    );
  }
  const pct = ((atual - anterior) / anterior) * 100;
  const subiu = pct > 0.05;
  const caiu = pct < -0.05;
  const cor = subiu ? '#059669' : caiu ? '#dc2626' : '#64748b';
  const bg = subiu ? '#d1fae5' : caiu ? '#fee2e2' : '#f1f5f9';
  const seta = subiu ? '▲' : caiu ? '▼' : '=';
  const sinal = pct > 0 ? '+' : '';
  return (
    <span title="Variação do valor em relação ao mês anterior"
      style={{ fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap', color: cor, background: bg, borderRadius: 20, padding: '2px 9px' }}>
      {seta} {sinal}{pct.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%
    </span>
  );
}

export default function ValoresMesPage() {
  const router = useRouter();
  const [dados, setDados] = useState<Resposta>({ meses: [], total_geral: 0, pecas_geral: 0, count_geral: 0 });
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [fDe, setFDe] = useState('');
  const [fAte, setFAte] = useState('');
  const [abertos, setAbertos] = useState<Set<string>>(new Set());
  const [abertosV, setAbertosV] = useState<Set<string>>(new Set()); // vendedores abertos
  const [aba, setAba] = useState<'mes' | 'vendedor'>('mes');
  // Modal de opções da exportação Excel: com/sem produto e com/sem cliente.
  const [showExport, setShowExport] = useState(false);
  const [expProduto, setExpProduto] = useState(true);
  const [expCliente, setExpCliente] = useState(true);
  const [expGerando, setExpGerando] = useState(false);

  // Gate por login: controle privado (só guilherme.santos). Sem permissão, home.
  useEffect(() => {
    if (!podeVerValoresMes(getUser())) router.replace('/');
  }, [router]);

  const carregar = useCallback((de?: string, ate?: string) => {
    setLoading(true);
    getValoresMes({ de: de || undefined, ate: ate || undefined })
      .then((d: Resposta) => {
        setDados(d);
        setErro(null);
        // Abre o mês mais recente por padrão pra já mostrar conteúdo.
        setAbertos(new Set(d.meses.length ? [d.meses[0].mes] : []));
      })
      .catch(() => setErro('Não foi possível carregar os valores.'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { carregar(); }, [carregar]);

  function toggle(mes: string) {
    setAbertos(prev => {
      const next = new Set(prev);
      next.has(mes) ? next.delete(mes) : next.add(mes);
      return next;
    });
  }
  const todosAbertos = dados.meses.length > 0 && dados.meses.every(m => abertos.has(m.mes));
  function toggleTodos() {
    setAbertos(todosAbertos ? new Set() : new Set(dados.meses.map(m => m.mes)));
  }

  // ── Análise por VENDEDOR (comercial) ────────────────────────────────────────
  // Agrega os pedidos já carregados por vendedor: total de pedidos, de flanges
  // (peças) e valor, com a quebra por mês de cada um. Ordena por valor (maior 1º).
  interface VendMes { mes: string; count: number; pecas: number; valor: number }
  interface VendAgg { vendedor: string; count: number; pecas: number; valor: number; porMes: VendMes[] }
  const vendedores = useMemo<VendAgg[]>(() => {
    const m = new Map<string, { vendedor: string; count: number; pecas: number; valor: number; porMes: Map<string, VendMes> }>();
    for (const bloco of dados.meses) {
      for (const p of bloco.pedidos) {
        const v = (p.vendedor || '').trim() || '(sem vendedor)';
        let e = m.get(v);
        if (!e) { e = { vendedor: v, count: 0, pecas: 0, valor: 0, porMes: new Map() }; m.set(v, e); }
        e.count += 1; e.pecas += p.pecas; e.valor += p.valor;
        let mm = e.porMes.get(bloco.mes);
        if (!mm) { mm = { mes: bloco.mes, count: 0, pecas: 0, valor: 0 }; e.porMes.set(bloco.mes, mm); }
        mm.count += 1; mm.pecas += p.pecas; mm.valor += p.valor;
      }
    }
    return Array.from(m.values())
      .map(e => ({ vendedor: e.vendedor, count: e.count, pecas: e.pecas, valor: e.valor, porMes: Array.from(e.porMes.values()) }))
      .sort((a, b) => b.valor - a.valor);
  }, [dados]);

  function toggleV(v: string) {
    setAbertosV(prev => {
      const next = new Set(prev);
      next.has(v) ? next.delete(v) : next.add(v);
      return next;
    });
  }

  // Baixa um CSV compatível com Excel pt-BR (separador ";", BOM UTF-8 pros acentos,
  // números com vírgula decimal, CRLF). `fonte` = os meses a exportar.
  function baixarCsv(fonte: MesBloco[], comProduto: boolean, comCliente: boolean) {
    const nBR = (v: number) => {
      const n = Number(v || 0);
      return (Number.isInteger(n) ? String(n) : n.toFixed(2)).replace('.', ',');
    };
    const cell = (v: string | number) => {
      const s = String(v ?? '');
      return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    // Colunas conforme as opções escolhidas.
    const cabecalho = ['Mês', 'Emissão', 'Pedido', 'OP'];
    if (comCliente) cabecalho.push('Cliente');
    cabecalho.push('Vendedor', 'Status');
    if (comProduto) cabecalho.push('Código', 'Descrição', 'Unid.', 'Qtd', 'Valor unit.', 'Valor item');
    else cabecalho.push('Peças', 'Valor');

    const linhas: string[] = [cabecalho.map(cell).join(';')];
    let totValor = 0, totQtd = 0, totLinhas = 0;

    for (const bloco of fonte) {
      for (const p of bloco.pedidos) {
        const base = [cell(bloco.mes), cell(fmtData(p.data_emissao)), cell(p.numero_pedido_venda), cell(p.numero_op)];
        if (comCliente) base.push(cell(p.cliente));
        base.push(cell(p.vendedor || ''), cell(STATUS_LABELS[p.status] || p.status));

        if (comProduto) {
          const itens = p.itens && p.itens.length > 0 ? p.itens : [];
          if (itens.length === 0) {
            // Pedido sem itens (casca): ainda sai uma linha, sem produto.
            linhas.push([...base, '', '(sem produto)', '', nBR(0), nBR(0), nBR(p.valor)].join(';'));
            totValor += p.valor; totLinhas += 1;
          } else {
            for (const it of itens) {
              linhas.push([...base, cell(it.codigo), cell(it.descricao), cell(it.unidade), nBR(it.quantidade), nBR(it.valor_unitario), nBR(it.valor)].join(';'));
              totValor += it.valor; totQtd += it.quantidade; totLinhas += 1;
            }
          }
        } else {
          linhas.push([...base, nBR(p.pecas), nBR(p.valor)].join(';'));
          totValor += p.valor; totQtd += p.pecas; totLinhas += 1;
        }
      }
    }

    // Linha de total geral no fim: "TOTAL GERAL" no início, total de Qtd/Peças na
    // sua coluna e o total de Valor na última coluna (posiciona pelo cabeçalho).
    linhas.push('');
    const totalRow: string[] = new Array(cabecalho.length).fill('');
    totalRow[0] = 'TOTAL GERAL';
    const qtdIdx = cabecalho.indexOf(comProduto ? 'Qtd' : 'Peças');
    if (qtdIdx >= 0) totalRow[qtdIdx] = nBR(totQtd);
    totalRow[cabecalho.length - 1] = nBR(totValor); // Valor / Valor item
    linhas.push(totalRow.map(cell).join(';'));

    const conteudo = '﻿' + linhas.join('\r\n'); // BOM + CRLF (Excel Windows)
    const blob = new Blob([conteudo], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const periodo = (fDe || fAte) ? `_${fDe || 'inicio'}_a_${fAte || 'fim'}` : '';
    const suf = `${comProduto ? '_com-produto' : ''}${comCliente ? '' : '_sem-cliente'}`;
    const a = document.createElement('a');
    a.href = url;
    a.download = `valores-por-mes${periodo}${suf}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    void totLinhas;
  }

  // Gera o Excel conforme as opções escolhidas no modal. Quando "com produto",
  // rebusca o período trazendo os itens (com_itens=1) e usa esse conjunto.
  async function gerarExcel() {
    setExpGerando(true);
    try {
      if (expProduto) {
        const d: Resposta = await getValoresMes({ de: fDe || undefined, ate: fAte || undefined, com_itens: '1' });
        baixarCsv(d.meses, true, expCliente);
      } else {
        baixarCsv(dados.meses, false, expCliente);
      }
      setShowExport(false);
    } catch {
      setErro('Não consegui gerar o Excel. Tente novamente.');
    } finally {
      setExpGerando(false);
    }
  }

  return (
    <AuthGuard>
      {/* Header */}
      <div className="no-print" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18, flexWrap: 'wrap', gap: 10 }}>
        <div>
          <h4 style={{ margin: 0, fontWeight: 700, color: '#1a3a5c' }}>
            <i className="bi bi-cash-coin" style={{ marginRight: 8 }} />Valores por Mês
          </h4>
          <div style={{ fontSize: 12.5, color: '#64748b', marginTop: 3 }}>
            Todos os pedidos e o valor de cada um, agrupados pelo mês de emissão. <b>Visão privada.</b>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Link href="/pedidos" style={{ border: '1px solid #dee2e6', color: '#666', background: 'none', borderRadius: 5, padding: '6px 14px', fontSize: 13, textDecoration: 'none' }}>
            <i className="bi bi-arrow-left" style={{ marginRight: 4 }} />Voltar
          </Link>
          <button onClick={() => setShowExport(true)} disabled={dados.meses.length === 0}
            style={{ border: '1px solid #198754', color: '#198754', background: 'none', borderRadius: 5, padding: '6px 14px', fontSize: 13, cursor: dados.meses.length === 0 ? 'not-allowed' : 'pointer', fontWeight: 600, opacity: dados.meses.length === 0 ? 0.5 : 1 }}>
            <i className="bi bi-file-earmark-excel" style={{ marginRight: 4 }} />Extrair Excel
          </button>
          <button onClick={() => window.print()} style={{ border: '1px solid #1a3a5c', color: '#1a3a5c', background: 'none', borderRadius: 5, padding: '6px 14px', fontSize: 13, cursor: 'pointer', fontWeight: 600 }}>
            <i className="bi bi-printer" style={{ marginRight: 4 }} />Imprimir
          </button>
        </div>
      </div>

      {/* Filtro de período */}
      <div className="card no-print" style={{ padding: '12px 16px', marginBottom: 16, display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 3 }}>Mês inicial</div>
          <input type="month" value={fDe} onChange={e => setFDe(e.target.value)}
            style={{ border: '1px solid #d1d5db', borderRadius: 6, padding: '7px 10px', fontSize: 13 }} />
        </div>
        <div>
          <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 3 }}>Mês final</div>
          <input type="month" value={fAte} onChange={e => setFAte(e.target.value)}
            style={{ border: '1px solid #d1d5db', borderRadius: 6, padding: '7px 10px', fontSize: 13 }} />
        </div>
        <button onClick={() => carregar(fDe, fAte)}
          style={{ background: '#1a3a5c', color: '#fff', border: 'none', borderRadius: 5, padding: '8px 16px', fontSize: 13, cursor: 'pointer', fontWeight: 600 }}>
          <i className="bi bi-funnel" style={{ marginRight: 4 }} />Filtrar
        </button>
        {(fDe || fAte) && (
          <button onClick={() => { setFDe(''); setFAte(''); carregar('', ''); }}
            style={{ border: '1px solid #dee2e6', background: 'none', borderRadius: 5, padding: '8px 12px', fontSize: 13, cursor: 'pointer', color: '#666' }}>
            Limpar
          </button>
        )}
        <div style={{ flex: 1 }} />
        {aba === 'mes' && dados.meses.length > 0 && (
          <button onClick={toggleTodos}
            style={{ border: '1px solid #dee2e6', background: 'none', borderRadius: 5, padding: '8px 12px', fontSize: 13, cursor: 'pointer', color: '#1a3a5c', fontWeight: 600 }}>
            {todosAbertos ? 'Recolher todos' : 'Expandir todos'}
          </button>
        )}
      </div>

      {/* Chave de visão: Por Mês × Por Vendedor (análise comercial) */}
      <div className="no-print" style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
        <button type="button" onClick={() => setAba('mes')}
          style={{
            display: 'flex', alignItems: 'center', gap: 8, padding: '8px 16px', borderRadius: 10,
            border: `2px solid ${aba === 'mes' ? '#1a3a5c' : '#e5e7eb'}`,
            background: aba === 'mes' ? '#1a3a5c' : '#fff', color: aba === 'mes' ? '#fff' : '#555',
            fontSize: 13, fontWeight: 700, cursor: 'pointer',
          }}>
          <i className="bi bi-calendar3" />Por Mês
        </button>
        <button type="button" onClick={() => setAba('vendedor')}
          style={{
            display: 'flex', alignItems: 'center', gap: 8, padding: '8px 16px', borderRadius: 10,
            border: `2px solid ${aba === 'vendedor' ? '#1a3a5c' : '#e5e7eb'}`,
            background: aba === 'vendedor' ? '#1a3a5c' : '#fff', color: aba === 'vendedor' ? '#fff' : '#555',
            fontSize: 13, fontWeight: 700, cursor: 'pointer',
          }}>
          <i className="bi bi-person-badge" />Por Vendedor
        </button>
      </div>

      {/* Total geral */}
      <div style={{ ...CARD, padding: '16px 20px', marginBottom: 16, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16, background: '#f0f7ff', borderColor: '#bfdbfe' }}>
        <div style={{ fontSize: 12, color: '#1d4ed8', fontWeight: 700, textTransform: 'uppercase', letterSpacing: .3 }}>
          Total geral do período
          <div style={{ fontSize: 12, color: '#64748b', marginTop: 2, textTransform: 'none', fontWeight: 500 }}>
            {dados.meses.length} mês(es)
          </div>
        </div>
        <div style={{ display: 'flex', gap: 28, flexWrap: 'wrap' }}>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 11, color: '#64748b', fontWeight: 600 }}>Pedidos</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: '#1a3a5c' }}>{num(dados.count_geral)}</div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 11, color: '#64748b', fontWeight: 600 }}>Peças</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: '#1a3a5c' }}>{num(dados.pecas_geral)}</div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 11, color: '#64748b', fontWeight: 600 }}>Valor</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: '#065f46' }}>{brl(dados.total_geral)}</div>
          </div>
        </div>
      </div>

      {erro && (
        <div className="card" style={{ padding: 16, marginBottom: 16, background: '#fef2f2', border: '1px solid #fca5a5', color: '#b91c1c', fontSize: 13 }}>
          ⚠ {erro}
        </div>
      )}
      {loading && (
        <div className="card" style={{ padding: 40, textAlign: 'center', color: '#999' }}>Carregando…</div>
      )}
      {!loading && !erro && dados.meses.length === 0 && (
        <div className="card" style={{ padding: 40, textAlign: 'center', color: '#999' }}>Nenhum pedido no período.</div>
      )}

      {/* Blocos por mês */}
      {!loading && aba === 'mes' && dados.meses.map((bloco, idx) => {
        const aberto = abertos.has(bloco.mes);
        // Mês anterior = o PRÓXIMO da lista (ordenada do mais recente ao mais antigo).
        const anterior = dados.meses[idx + 1];
        return (
          <div key={bloco.mes} style={{ ...CARD, marginBottom: 12, overflow: 'hidden' }}>
            <button onClick={() => toggle(bloco.mes)}
              style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '13px 18px', background: aberto ? '#f8fafc' : '#fff', border: 'none', borderBottom: aberto ? '1px solid #eef2f7' : 'none', cursor: 'pointer', textAlign: 'left' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0, flexWrap: 'wrap' }}>
                <i className={`bi ${aberto ? 'bi-chevron-down' : 'bi-chevron-right'}`} style={{ color: '#94a3b8', fontSize: 13 }} />
                <span style={{ fontWeight: 700, color: '#1a3a5c', fontSize: 15 }}>{labelMes(bloco.mes)}</span>
                <span style={{ fontSize: 12, color: '#64748b', background: '#eef2f7', borderRadius: 20, padding: '2px 10px', fontWeight: 600 }}>
                  {bloco.count} pedido{bloco.count !== 1 ? 's' : ''}
                </span>
                <span style={{ fontSize: 12, color: '#7c3aed', background: '#f3e8ff', borderRadius: 20, padding: '2px 10px', fontWeight: 600 }}>
                  {num(bloco.pecas)} peças
                </span>
              </div>
              <span style={{ display: 'flex', alignItems: 'center', gap: 10, whiteSpace: 'nowrap' }}>
                <VariacaoBadge atual={bloco.total} anterior={anterior?.total} />
                <span style={{ fontWeight: 800, color: '#065f46', fontSize: 16 }}>{brl(bloco.total)}</span>
              </span>
            </button>

            {aberto && (
              <div style={{ padding: '4px 0 10px' }}>
                {/* Quebra POR CLIENTE do mês */}
                <div style={{ padding: '12px 18px 6px', fontSize: 12, fontWeight: 700, color: '#475569', textTransform: 'uppercase', letterSpacing: .3 }}>
                  <i className="bi bi-people" style={{ marginRight: 6 }} />Por cliente
                </div>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                    <thead>
                      <tr style={{ background: '#f8fafc', color: '#475569' }}>
                        {['Cliente', 'Pedidos', 'Peças', 'Valor'].map((h, i) => (
                          <th key={h} style={{ padding: '8px 18px', textAlign: i === 0 ? 'left' : 'right', fontWeight: 600, fontSize: 12, whiteSpace: 'nowrap' }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {bloco.por_cliente.map(c => (
                        <tr key={c.cliente} style={{ borderBottom: '1px solid #f1f5f9' }}>
                          <td style={{ padding: '8px 18px', color: '#1a3a5c', fontWeight: 600 }}>{c.cliente}</td>
                          <td style={{ padding: '8px 18px', textAlign: 'right', color: '#475569' }}>{num(c.count)}</td>
                          <td style={{ padding: '8px 18px', textAlign: 'right', color: '#7c3aed', fontWeight: 600 }}>{num(c.pecas)}</td>
                          <td style={{ padding: '8px 18px', textAlign: 'right', fontWeight: 700, color: c.valor > 0 ? '#065f46' : '#cbd5e1', whiteSpace: 'nowrap' }}>{brl(c.valor)}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr style={{ background: '#f8fafc', borderTop: '2px solid #e2e8f0' }}>
                        <td style={{ padding: '8px 18px', fontWeight: 700, color: '#475569', fontSize: 12 }}>Total do mês</td>
                        <td style={{ padding: '8px 18px', textAlign: 'right', fontWeight: 700, color: '#475569' }}>{num(bloco.count)}</td>
                        <td style={{ padding: '8px 18px', textAlign: 'right', fontWeight: 700, color: '#7c3aed' }}>{num(bloco.pecas)}</td>
                        <td style={{ padding: '8px 18px', textAlign: 'right', fontWeight: 800, color: '#065f46', whiteSpace: 'nowrap' }}>{brl(bloco.total)}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>

                {/* Detalhe dos pedidos do mês */}
                <div style={{ padding: '16px 18px 6px', fontSize: 12, fontWeight: 700, color: '#475569', textTransform: 'uppercase', letterSpacing: .3 }}>
                  <i className="bi bi-list-ul" style={{ marginRight: 6 }} />Detalhe dos pedidos
                </div>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                    <thead>
                      <tr style={{ background: '#f8fafc', color: '#475569' }}>
                        {['Emissão', 'Pedido', 'OP', 'Cliente', 'Vendedor', 'Status', 'Peças', 'Valor'].map((h, i) => (
                          <th key={h} style={{ padding: '8px 14px', textAlign: (i === 6 || i === 7) ? 'right' : 'left', fontWeight: 600, fontSize: 12, whiteSpace: 'nowrap' }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {bloco.pedidos.map(p => (
                        <tr key={p.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                          <td style={{ padding: '8px 14px', color: '#666', fontSize: 12, whiteSpace: 'nowrap' }}>{fmtData(p.data_emissao)}</td>
                          <td style={{ padding: '8px 14px' }}>
                            <Link href={`/pedidos/${p.id}`} prefetch={false} style={{ color: '#1a3a5c', fontWeight: 700, textDecoration: 'underline' }}>
                              {p.numero_pedido_venda}
                            </Link>
                          </td>
                          <td style={{ padding: '8px 14px', color: '#666' }}>{p.numero_op}</td>
                          <td style={{ padding: '8px 14px', color: '#444' }}>{p.cliente}</td>
                          <td style={{ padding: '8px 14px', color: '#666' }}>{p.vendedor || '—'}</td>
                          <td style={{ padding: '8px 14px', color: '#666', fontSize: 12 }}>{STATUS_LABELS[p.status] || p.status}</td>
                          <td style={{ padding: '8px 14px', textAlign: 'right', color: '#7c3aed', fontWeight: 600 }}>{num(p.pecas)}</td>
                          <td style={{ padding: '8px 14px', textAlign: 'right', fontWeight: 700, color: p.valor > 0 ? '#065f46' : '#cbd5e1', whiteSpace: 'nowrap' }}>{brl(p.valor)}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr style={{ background: '#f8fafc', borderTop: '2px solid #e2e8f0' }}>
                        <td colSpan={6} style={{ padding: '8px 14px', textAlign: 'right', fontWeight: 700, color: '#475569', fontSize: 12 }}>Total do mês</td>
                        <td style={{ padding: '8px 14px', textAlign: 'right', fontWeight: 700, color: '#7c3aed', whiteSpace: 'nowrap' }}>{num(bloco.pecas)}</td>
                        <td style={{ padding: '8px 14px', textAlign: 'right', fontWeight: 800, color: '#065f46', whiteSpace: 'nowrap' }}>{brl(bloco.total)}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
            )}
          </div>
        );
      })}

      {/* Blocos por vendedor (análise comercial) */}
      {!loading && aba === 'vendedor' && vendedores.length === 0 && (
        <div className="card" style={{ padding: 40, textAlign: 'center', color: '#999' }}>Nenhum pedido no período.</div>
      )}
      {!loading && aba === 'vendedor' && vendedores.map(v => {
        const aberto = abertosV.has(v.vendedor);
        return (
          <div key={v.vendedor} style={{ ...CARD, marginBottom: 12, overflow: 'hidden' }}>
            <button onClick={() => toggleV(v.vendedor)}
              style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '13px 18px', background: aberto ? '#f8fafc' : '#fff', border: 'none', borderBottom: aberto ? '1px solid #eef2f7' : 'none', cursor: 'pointer', textAlign: 'left' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0, flexWrap: 'wrap' }}>
                <i className={`bi ${aberto ? 'bi-chevron-down' : 'bi-chevron-right'}`} style={{ color: '#94a3b8', fontSize: 13 }} />
                <i className="bi bi-person-badge" style={{ color: '#1a3a5c' }} />
                <span style={{ fontWeight: 700, color: '#1a3a5c', fontSize: 15 }}>{v.vendedor}</span>
                <span style={{ fontSize: 12, color: '#64748b', background: '#eef2f7', borderRadius: 20, padding: '2px 10px', fontWeight: 600 }}>
                  {v.count} pedido{v.count !== 1 ? 's' : ''}
                </span>
                <span style={{ fontSize: 12, color: '#7c3aed', background: '#f3e8ff', borderRadius: 20, padding: '2px 10px', fontWeight: 600 }}>
                  {num(v.pecas)} flanges
                </span>
              </div>
              <span style={{ fontWeight: 800, color: '#065f46', fontSize: 16, whiteSpace: 'nowrap' }}>{brl(v.valor)}</span>
            </button>

            {aberto && (
              <div style={{ padding: '4px 0 10px' }}>
                <div style={{ padding: '12px 18px 6px', fontSize: 12, fontWeight: 700, color: '#475569', textTransform: 'uppercase', letterSpacing: .3 }}>
                  <i className="bi bi-calendar3" style={{ marginRight: 6 }} />Por mês
                </div>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                    <thead>
                      <tr style={{ background: '#f8fafc', color: '#475569' }}>
                        {['Mês', 'Pedidos', 'Flanges', 'Valor'].map((h, i) => (
                          <th key={h} style={{ padding: '8px 18px', textAlign: i === 0 ? 'left' : 'right', fontWeight: 600, fontSize: 12, whiteSpace: 'nowrap' }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {v.porMes.map(mm => (
                        <tr key={mm.mes} style={{ borderBottom: '1px solid #f1f5f9' }}>
                          <td style={{ padding: '8px 18px', color: '#1a3a5c', fontWeight: 600 }}>{labelMes(mm.mes)}</td>
                          <td style={{ padding: '8px 18px', textAlign: 'right', color: '#475569' }}>{num(mm.count)}</td>
                          <td style={{ padding: '8px 18px', textAlign: 'right', color: '#7c3aed', fontWeight: 600 }}>{num(mm.pecas)}</td>
                          <td style={{ padding: '8px 18px', textAlign: 'right', fontWeight: 700, color: mm.valor > 0 ? '#065f46' : '#cbd5e1', whiteSpace: 'nowrap' }}>{brl(mm.valor)}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr style={{ background: '#f8fafc', borderTop: '2px solid #e2e8f0' }}>
                        <td style={{ padding: '8px 18px', fontWeight: 700, color: '#475569', fontSize: 12 }}>Total do vendedor</td>
                        <td style={{ padding: '8px 18px', textAlign: 'right', fontWeight: 700, color: '#475569' }}>{num(v.count)}</td>
                        <td style={{ padding: '8px 18px', textAlign: 'right', fontWeight: 700, color: '#7c3aed' }}>{num(v.pecas)}</td>
                        <td style={{ padding: '8px 18px', textAlign: 'right', fontWeight: 800, color: '#065f46', whiteSpace: 'nowrap' }}>{brl(v.valor)}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
            )}
          </div>
        );
      })}

      {/* Modal: opções da exportação Excel */}
      {showExport && (
        <div onClick={() => !expGerando && setShowExport(false)} className="no-print"
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16 }}>
          <div onClick={e => e.stopPropagation()}
            style={{ background: '#fff', borderRadius: 12, padding: 22, width: 440, maxWidth: '100%', boxShadow: '0 10px 40px rgba(0,0,0,.2)' }}>
            <h5 style={{ margin: '0 0 4px', color: '#1a3a5c', fontWeight: 800 }}>
              <i className="bi bi-file-earmark-excel" style={{ marginRight: 6 }} />Extrair para Excel
            </h5>
            <div style={{ fontSize: 12.5, color: '#64748b', marginBottom: 16 }}>
              O que você precisa nesse relatório?
            </div>

            {/* Com / sem produto */}
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#334155', marginBottom: 6 }}>Produtos</div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={() => setExpProduto(true)}
                  style={optBtn(expProduto)}>
                  <div style={{ fontWeight: 700 }}>Com produto</div>
                  <div style={{ fontSize: 11, opacity: .8 }}>1 linha por item (código, qtd, valor)</div>
                </button>
                <button onClick={() => setExpProduto(false)}
                  style={optBtn(!expProduto)}>
                  <div style={{ fontWeight: 700 }}>Sem produto</div>
                  <div style={{ fontSize: 11, opacity: .8 }}>1 linha por pedido (peças + valor)</div>
                </button>
              </div>
            </div>

            {/* Com / sem cliente */}
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#334155', marginBottom: 6 }}>Cliente</div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={() => setExpCliente(true)} style={optBtn(expCliente)}>
                  <div style={{ fontWeight: 700 }}>Com cliente</div>
                  <div style={{ fontSize: 11, opacity: .8 }}>inclui a coluna do cliente</div>
                </button>
                <button onClick={() => setExpCliente(false)} style={optBtn(!expCliente)}>
                  <div style={{ fontWeight: 700 }}>Sem cliente</div>
                  <div style={{ fontSize: 11, opacity: .8 }}>oculta o cliente</div>
                </button>
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button onClick={() => setShowExport(false)} disabled={expGerando}
                style={{ border: '1px solid #dee2e6', background: 'none', borderRadius: 6, padding: '8px 16px', fontSize: 13, cursor: 'pointer', color: '#666' }}>
                Cancelar
              </button>
              <button onClick={gerarExcel} disabled={expGerando}
                style={{ background: '#198754', color: '#fff', border: 'none', borderRadius: 6, padding: '8px 18px', fontSize: 13, fontWeight: 700, cursor: expGerando ? 'wait' : 'pointer', opacity: expGerando ? 0.7 : 1 }}>
                <i className="bi bi-download" style={{ marginRight: 5 }} />{expGerando ? 'Gerando…' : 'Gerar Excel'}
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        @media print {
          #sidebar, #sidebar-overlay, .topbar, .no-print { display: none !important; }
          #conteudo, main, body { margin: 0 !important; padding: 0 !important; }
          .card { box-shadow: none !important; }
        }
      `}</style>
    </AuthGuard>
  );
}
