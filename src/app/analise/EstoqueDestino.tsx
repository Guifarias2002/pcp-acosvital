'use client';
/**
 * Análise de saídas do ESTOQUE (Flanges), embutida na Análise PCP.
 *
 * Mostra, por mês, duas rotas a partir do estoque:
 *   • Inspeção (flange JÁ pronto) — foi direto pra Qualidade.
 *   • Corte (fabricação) — precisou cortar (maçarico/plasma/laser/serra).
 * Traz pedidos (clicáveis) e o total de flanges (peças) de cada rota.
 * Dados: /api/analise/estoque-destino. Ver [[project_analise_pcp]].
 */
import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { getEstoqueDestino } from '@/lib/api';

interface PedidoRota { id: number; numero_pedido_venda: string; cliente: string; vendedor: string; pecas: number; valor: number }
interface Rota { pedidos: number; pecas: number; valor: number; lista: PedidoRota[] }
interface MesBloco { mes: string; inspecao: Rota; corte: Rota }

const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
function labelMes(mes: string): string {
  const [ano, m] = mes.split('-');
  const nome = MESES[parseInt(m, 10) - 1] || m;
  return `${nome.charAt(0).toUpperCase()}${nome.slice(1)} de ${ano}`;
}
const num = (v: number) => {
  const n = Number(v || 0);
  return n.toLocaleString('pt-BR', { maximumFractionDigits: Number.isInteger(n) ? 0 : 2 });
};
const brl = (v: number) => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

const CARD = { background: '#fff', border: '1px solid #e5e7eb', borderRadius: 10, boxShadow: '0 1px 2px rgba(0,0,0,.04)' } as const;

// Uma coluna de rota (Inspeção ou Corte) dentro de um mês.
function ColunaRota({ titulo, sub, cor, bg, rota }: { titulo: string; sub: string; cor: string; bg: string; rota: Rota }) {
  return (
    <div style={{ flex: '1 1 320px', minWidth: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, padding: '10px 14px', background: bg, borderRadius: 8, marginBottom: 8 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontWeight: 800, color: cor, fontSize: 13 }}>{titulo}</div>
          <div style={{ fontSize: 11, color: '#64748b' }}>{sub}</div>
        </div>
        <div style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
          <div style={{ fontSize: 11, color: '#64748b', fontWeight: 600 }}>{num(rota.pedidos)} pedidos</div>
          <div style={{ fontSize: 16, fontWeight: 800, color: cor }}>{num(rota.pecas)} <span style={{ fontSize: 11, fontWeight: 600 }}>flanges</span></div>
          <div style={{ fontSize: 13, fontWeight: 800, color: '#065f46' }}>{brl(rota.valor)}</div>
        </div>
      </div>
      {rota.lista.length === 0 ? (
        <div style={{ padding: '10px 14px', color: '#cbd5e1', fontSize: 12.5 }}>Nenhum pedido.</div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
            <thead>
              <tr style={{ color: '#94a3b8', textAlign: 'left' }}>
                <th style={{ padding: '4px 8px', fontWeight: 600, fontSize: 11 }}>Pedido</th>
                <th style={{ padding: '4px 8px', fontWeight: 600, fontSize: 11 }}>Cliente</th>
                <th style={{ padding: '4px 8px', fontWeight: 600, fontSize: 11, textAlign: 'right' }}>Flanges</th>
                <th style={{ padding: '4px 8px', fontWeight: 600, fontSize: 11, textAlign: 'right' }}>Valor</th>
              </tr>
            </thead>
            <tbody>
              {rota.lista.map(p => (
                <tr key={p.id} style={{ borderTop: '1px solid #f1f5f9' }}>
                  <td style={{ padding: '5px 8px', whiteSpace: 'nowrap' }}>
                    <Link href={`/pedidos/${p.id}`} prefetch={false} style={{ color: '#1a3a5c', fontWeight: 700, textDecoration: 'underline' }}>
                      {p.numero_pedido_venda}
                    </Link>
                  </td>
                  <td style={{ padding: '5px 8px', color: '#444' }}>{p.cliente}</td>
                  <td style={{ padding: '5px 8px', textAlign: 'right', fontWeight: 700, color: cor }}>{num(p.pecas)}</td>
                  <td style={{ padding: '5px 8px', textAlign: 'right', fontWeight: 700, color: p.valor > 0 ? '#065f46' : '#cbd5e1', whiteSpace: 'nowrap' }}>{brl(p.valor)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr style={{ borderTop: '2px solid #e2e8f0' }}>
                <td style={{ padding: '5px 8px', fontWeight: 700, color: '#475569', fontSize: 11 }}>Total</td>
                <td />
                <td style={{ padding: '5px 8px', textAlign: 'right', fontWeight: 800, color: cor }}>{num(rota.pecas)}</td>
                <td style={{ padding: '5px 8px', textAlign: 'right', fontWeight: 800, color: '#065f46', whiteSpace: 'nowrap' }}>{brl(rota.valor)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}

export default function EstoqueDestino() {
  const [meses, setMeses] = useState<MesBloco[]>([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [fDe, setFDe] = useState('');
  const [fAte, setFAte] = useState('');
  const [abertos, setAbertos] = useState<Set<string>>(new Set());

  const carregar = useCallback((de?: string, ate?: string) => {
    setLoading(true);
    getEstoqueDestino({ de: de || undefined, ate: ate || undefined })
      .then((d: { meses: MesBloco[] }) => {
        setMeses(d.meses || []);
        setErro(null);
        setAbertos(new Set(d.meses?.length ? [d.meses[0].mes] : []));
      })
      .catch(() => setErro('Não foi possível carregar a análise de estoque.'))
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

  // Exporta pra Excel (CSV pt-BR: ";", BOM UTF-8, vírgula decimal, CRLF). Uma linha
  // por pedido em cada rota (Inspeção/Corte), com mês, flanges e valor.
  function exportarExcel() {
    if (meses.length === 0) return;
    const nBR = (v: number) => {
      const n = Number(v || 0);
      return (Number.isInteger(n) ? String(n) : n.toFixed(2)).replace('.', ',');
    };
    const cell = (v: string | number) => {
      const s = String(v ?? '');
      return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const linhas: string[] = [['Mês', 'Rota', 'Pedido', 'Cliente', 'Vendedor', 'Flanges', 'Valor'].join(';')];
    let totPecas = 0, totValor = 0;
    for (const b of meses) {
      const rotas: [string, Rota][] = [['Inspeção (flange pronto)', b.inspecao], ['Corte (fabricação)', b.corte]];
      for (const [rotulo, rota] of rotas) {
        for (const p of rota.lista) {
          linhas.push([cell(b.mes), cell(rotulo), cell(p.numero_pedido_venda), cell(p.cliente), cell(p.vendedor || ''), nBR(p.pecas), nBR(p.valor)].join(';'));
          totPecas += p.pecas; totValor += p.valor;
        }
      }
    }
    linhas.push('');
    linhas.push(['TOTAL GERAL', '', '', '', '', nBR(totPecas), nBR(totValor)].map(cell).join(';'));

    const conteudo = '﻿' + linhas.join('\r\n');
    const blob = new Blob([conteudo], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const periodo = (fDe || fAte) ? `_${fDe || 'inicio'}_a_${fAte || 'fim'}` : '';
    const a = document.createElement('a');
    a.href = url;
    a.download = `saidas-estoque${periodo}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  return (
    <div style={{ ...CARD, padding: 18, marginBottom: 18 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', marginBottom: 6 }}>
        <div style={{ fontWeight: 800, color: '#1a3a5c', fontSize: 15 }}>
          <i className="bi bi-box-seam" style={{ marginRight: 8 }} />Saídas do Estoque — Inspeção × Corte
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <input type="month" value={fDe} onChange={e => setFDe(e.target.value)}
            style={{ border: '1px solid #d1d5db', borderRadius: 6, padding: '6px 9px', fontSize: 12.5 }} />
          <span style={{ color: '#94a3b8', fontSize: 12 }}>até</span>
          <input type="month" value={fAte} onChange={e => setFAte(e.target.value)}
            style={{ border: '1px solid #d1d5db', borderRadius: 6, padding: '6px 9px', fontSize: 12.5 }} />
          <button onClick={() => carregar(fDe, fAte)}
            style={{ background: '#1a3a5c', color: '#fff', border: 'none', borderRadius: 6, padding: '7px 14px', fontSize: 12.5, cursor: 'pointer', fontWeight: 600 }}>
            Filtrar
          </button>
          {(fDe || fAte) && (
            <button onClick={() => { setFDe(''); setFAte(''); carregar('', ''); }}
              style={{ border: '1px solid #dee2e6', background: 'none', borderRadius: 6, padding: '7px 12px', fontSize: 12.5, cursor: 'pointer', color: '#666' }}>
              Limpar
            </button>
          )}
          <button onClick={exportarExcel} disabled={meses.length === 0}
            style={{ border: '1px solid #198754', color: '#198754', background: 'none', borderRadius: 6, padding: '7px 12px', fontSize: 12.5, cursor: meses.length === 0 ? 'not-allowed' : 'pointer', fontWeight: 600, opacity: meses.length === 0 ? 0.5 : 1 }}>
            <i className="bi bi-file-earmark-excel" style={{ marginRight: 4 }} />Extrair Excel
          </button>
        </div>
      </div>
      <div style={{ fontSize: 12.5, color: '#64748b', marginBottom: 12 }}>
        <b>Inspeção</b> = flange já estava pronto (foi direto pra Qualidade). <b>Corte</b> = precisou fabricar.
      </div>

      {erro && <div style={{ padding: 14, background: '#fef2f2', border: '1px solid #fca5a5', color: '#b91c1c', fontSize: 13, borderRadius: 8 }}>⚠ {erro}</div>}
      {loading && <div style={{ padding: 30, textAlign: 'center', color: '#999' }}>Carregando…</div>}
      {!loading && !erro && meses.length === 0 && <div style={{ padding: 30, textAlign: 'center', color: '#999' }}>Nenhuma saída de estoque no período.</div>}

      {!loading && meses.map(b => {
        const aberto = abertos.has(b.mes);
        return (
          <div key={b.mes} style={{ border: '1px solid #eef2f7', borderRadius: 10, marginBottom: 10, overflow: 'hidden' }}>
            <button onClick={() => toggle(b.mes)}
              style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '11px 16px', background: aberto ? '#f8fafc' : '#fff', border: 'none', cursor: 'pointer', textAlign: 'left' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <i className={`bi ${aberto ? 'bi-chevron-down' : 'bi-chevron-right'}`} style={{ color: '#94a3b8', fontSize: 13 }} />
                <span style={{ fontWeight: 700, color: '#1a3a5c', fontSize: 14 }}>{labelMes(b.mes)}</span>
                <span style={{ fontSize: 11.5, color: '#065f46', background: '#d1fae5', borderRadius: 20, padding: '2px 10px', fontWeight: 700 }}>
                  Inspeção: {num(b.inspecao.pecas)} flanges · {num(b.inspecao.pedidos)} ped. · {brl(b.inspecao.valor)}
                </span>
                <span style={{ fontSize: 11.5, color: '#9a3412', background: '#ffedd5', borderRadius: 20, padding: '2px 10px', fontWeight: 700 }}>
                  Corte: {num(b.corte.pecas)} flanges · {num(b.corte.pedidos)} ped. · {brl(b.corte.valor)}
                </span>
              </div>
            </button>
            {aberto && (
              <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', padding: '12px 16px', borderTop: '1px solid #eef2f7' }}>
                <ColunaRota titulo="Saiu do estoque → Inspeção" sub="flange já feito" cor="#065f46" bg="#ecfdf5" rota={b.inspecao} />
                <ColunaRota titulo="Saiu do estoque → Corte" sub="fabricação" cor="#9a3412" bg="#fff7ed" rota={b.corte} />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
