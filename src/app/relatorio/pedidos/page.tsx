'use client';
import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { getToken, getUser } from '@/lib/auth';
import { STATUS_LABELS } from '@/lib/types';

interface ItemRel { codigo: string; descricao: string; quantidade: string; unidade: string; }
interface PedidoRel {
  id: number; numero_pedido_venda: string; numero_op: string; cliente: string; vendedor: string;
  data_emissao: string | null; prazo_entrega: string | null; status: string; prioridade: string;
  itens: ItemRel[];
}

function fmtData(s: string | null) {
  if (!s) return '—';
  const d = new Date(s + 'T12:00:00');
  return isNaN(d.getTime()) ? s : d.toLocaleDateString('pt-BR');
}
const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
function fmtMes(ym: string) {
  const m = ym.match(/^(\d{4})-(\d{2})$/);
  if (!m) return ym;
  return `${MESES[Number(m[2]) - 1]}/${m[1]}`;
}

export default function RelatorioPedidosPage() {
  return (
    <Suspense fallback={null}>
      <RelatorioPedidosInner />
    </Suspense>
  );
}

function RelatorioPedidosInner() {
  const sp = useSearchParams();
  const de = sp.get('de') || '';
  const ate = sp.get('ate') || '';
  const todos = sp.get('todos') === '1';

  const [pedidos, setPedidos] = useState<PedidoRel[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState('');

  const isStaff = getUser()?.is_staff === true;

  useEffect(() => {
    if (!isStaff) { setLoading(false); return; }
    const qs = todos ? 'todos=1' : `de=${encodeURIComponent(de)}&ate=${encodeURIComponent(ate)}`;
    fetch(`/api/relatorios/pedidos-itens?${qs}`, { headers: { Authorization: `Bearer ${getToken() || ''}` } })
      .then(r => r.json())
      .then(d => {
        if (d.erro) setErro(d.erro);
        else {
          setPedidos(d.pedidos || []);
          document.title = todos ? 'Relatorio_Pedidos_Todos' : `Relatorio_Pedidos_${de}_${ate}`;
        }
      })
      .catch(e => setErro(String(e)))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const periodoLabel = todos
    ? 'Todos os períodos'
    : (de && ate && de !== ate ? `${fmtMes(de)} a ${fmtMes(ate)}` : fmtMes(de || ate));

  const totalItens = (pedidos || []).reduce((a, p) => a + p.itens.length, 0);

  if (!isStaff) {
    return <div style={{ padding: 40, textAlign: 'center', color: '#dc2626' }}>Acesso restrito — apenas administradores/PCP.</div>;
  }

  return (
    <div style={{ background: '#fff', color: '#1a1a1a', minHeight: '100vh', padding: '24px 28px', maxWidth: 900, margin: '0 auto' }}>
      {/* Barra de ações (some na impressão) */}
      <div className="no-print" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, marginBottom: 20, flexWrap: 'wrap' }}>
        <a href="/pedidos" style={{ color: '#1a3a5c', fontSize: 13, textDecoration: 'none', fontWeight: 600 }}>← Voltar aos Pedidos</a>
        <button onClick={() => window.print()}
          style={{ background: '#1a3a5c', color: '#fff', border: 'none', borderRadius: 6, padding: '8px 18px', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
          🖨 Imprimir / Salvar PDF
        </button>
      </div>

      {/* Cabeçalho do relatório */}
      <div style={{ borderBottom: '2px solid #1a3a5c', paddingBottom: 12, marginBottom: 18 }}>
        <div style={{ fontSize: 11, color: '#6b7280', letterSpacing: 1, textTransform: 'uppercase' }}>Aços Vital — PCP</div>
        <h1 style={{ margin: '4px 0 2px', fontSize: 22, color: '#1a3a5c' }}>Relatório de Pedidos e Materiais</h1>
        <div style={{ fontSize: 13, color: '#475569' }}>
          Emissão: <b>{periodoLabel}</b>
          {pedidos && <> · {pedidos.length} {pedidos.length === 1 ? 'pedido' : 'pedidos'} · {totalItens} {totalItens === 1 ? 'item' : 'itens'}</>}
        </div>
      </div>

      {erro && <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: 14, color: '#dc2626', marginBottom: 16 }}>{erro}</div>}
      {loading && <div style={{ textAlign: 'center', padding: 50, color: '#94a3b8' }}>Carregando…</div>}

      {pedidos && pedidos.length === 0 && !loading && (
        <div style={{ textAlign: 'center', padding: 40, color: '#94a3b8' }}>Nenhum pedido emitido neste período.</div>
      )}

      {pedidos && pedidos.map(p => (
        <div key={p.id} className="pedido-bloco" style={{ marginBottom: 22, border: '1px solid #d7dee9', borderRadius: 8, overflow: 'hidden' }}>
          {/* Cabeçalho do pedido */}
          <div style={{ background: '#f1f5fb', padding: '8px 12px', borderBottom: '1px solid #d7dee9' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 6 }}>
              <span style={{ fontWeight: 800, fontSize: 15, color: '#1a3a5c' }}>PV {p.numero_pedido_venda}</span>
              <span style={{ fontSize: 12, color: '#475569' }}>{STATUS_LABELS[p.status] || p.status}</span>
            </div>
            <div style={{ fontSize: 12, color: '#475569', marginTop: 3, display: 'flex', flexWrap: 'wrap', gap: '2px 16px' }}>
              <span><b>Cliente:</b> {p.cliente || '—'}</span>
              <span><b>OP:</b> {p.numero_op || '—'}</span>
              <span><b>Emissão:</b> {fmtData(p.data_emissao)}</span>
              <span><b>Prazo:</b> {fmtData(p.prazo_entrega)}</span>
              {p.vendedor && <span><b>Vendedor:</b> {p.vendedor}</span>}
            </div>
          </div>
          {/* Materiais */}
          {p.itens.length === 0 ? (
            <div style={{ padding: '8px 12px', fontSize: 12, color: '#94a3b8' }}>Sem itens ativos neste pedido.</div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
              <thead>
                <tr style={{ textAlign: 'left', color: '#64748b', borderBottom: '1px solid #e2e8f0' }}>
                  <th style={{ padding: '5px 12px', width: 40 }}>#</th>
                  <th style={{ padding: '5px 12px' }}>Código</th>
                  <th style={{ padding: '5px 12px' }}>Descrição</th>
                  <th style={{ padding: '5px 12px', textAlign: 'right', whiteSpace: 'nowrap' }}>Qtd</th>
                  <th style={{ padding: '5px 12px' }}>Un</th>
                </tr>
              </thead>
              <tbody>
                {p.itens.map((it, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <td style={{ padding: '5px 12px', color: '#94a3b8' }}>{i + 1}</td>
                    <td style={{ padding: '5px 12px', fontWeight: 700, color: '#1a3a5c', whiteSpace: 'nowrap' }}>{it.codigo}</td>
                    <td style={{ padding: '5px 12px' }}>{it.descricao || '—'}</td>
                    <td style={{ padding: '5px 12px', textAlign: 'right', whiteSpace: 'nowrap' }}>{it.quantidade}</td>
                    <td style={{ padding: '5px 12px' }}>{it.unidade}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      ))}

      {/* Rodapé */}
      {pedidos && (
        <div style={{ marginTop: 24, paddingTop: 12, borderTop: '1px solid #e2e8f0', fontSize: 11, color: '#94a3b8', display: 'flex', justifyContent: 'space-between' }}>
          <span>Aços Vital — Sistema PCP</span>
          <span>Gerado em {new Date().toLocaleString('pt-BR')}</span>
        </div>
      )}

      <style>{`
        @media print {
          .no-print { display: none !important; }
          body { margin: 0; }
          @page { margin: 12mm; size: A4 portrait; }
          .pedido-bloco { break-inside: avoid; page-break-inside: avoid; }
        }
      `}</style>
    </div>
  );
}
