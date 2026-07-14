'use client';
import { useEffect, useState, useRef, useCallback } from 'react';
import { useRealtime } from '@/hooks/useRealtime';
import AuthGuard from '@/components/AuthGuard';
import { getEntregues } from '@/lib/api';
import { getToken, podeEditar } from '@/lib/auth';
import { Pedido, PRIORIDADE_COR } from '@/lib/types';
import Link from 'next/link';
import AnexarComprovanteModal from '@/components/AnexarComprovanteModal';
import ReportarDivergenciaModal from '@/components/ReportarDivergenciaModal';

interface Comprovante {
  id: number;
  item_id: number;
  numero_nf: string;
  comprovante_url: string | null;
  comprovante_tipo: string | null;
  observacao: string | null;
  criado_em: string;
  usuario_nome: string | null;
}

interface PedidoEntregue extends Pedido {
  comprovantes: Comprovante[];
  nota_url?: string | null;
  canhoto_url?: string | null;
  anexo_pendente?: boolean;
}

function fmtHora(s: string) {
  if (!s) return '';
  const d = new Date(s);
  return d.toLocaleDateString('pt-BR') + ' ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

function isImagem(url: string) {
  return /\.(jpg|jpeg|png|gif|webp)$/i.test(url);
}

export default function EntreguesPage() {
  const [data, setData] = useState<{ pedidos: PedidoEntregue[]; total_pedidos: number; total_itens: number; total_valor: string; canhotos_assinados: number; canhotos_pendentes: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [fCliente, setFCliente] = useState('');
  const [expandido, setExpandido] = useState<number | null>(null);
  const [anexar, setAnexar] = useState<{ itemId: number; pedidoNumero: string } | null>(null);
  const [modalCanhotos, setModalCanhotos] = useState(false);
  const [divergencia, setDivergencia] = useState<{ pedidoId: number; pedidoNumero: string; itens: PedidoEntregue['itens'] } | null>(null);
  const [mensagem, setMensagem] = useState('');
  const [modalExcluir, setModalExcluir] = useState<{ id: number; numero: string; motivo: string; loading: boolean; erro?: string; requerConfirmacao?: boolean } | null>(null);

  async function confirmarExcluir(forcar = false) {
    if (!modalExcluir) return;
    setModalExcluir(m => m ? { ...m, loading: true, erro: undefined } : null);
    try {
      const res = await fetch(`/api/pedidos/${modalExcluir.id}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken() || ''}` },
        body: JSON.stringify({ motivo: modalExcluir.motivo, ...(forcar ? { confirmar_excluir_em_producao: true } : {}) }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        const numero = modalExcluir.numero;
        setModalExcluir(null);
        setMensagem(`Pedido ${numero} excluído. Recuperável em "Pedidos Excluídos".`);
        setTimeout(() => setMensagem(''), 6000);
        buscar();
      } else if (res.status === 409 && data.requer_confirmacao) {
        // Entrega parcial com item ainda em produção — pede confirmação extra.
        setModalExcluir(m => m ? { ...m, loading: false, requerConfirmacao: true, erro: data.erro || 'Este pedido tem itens em produção.' } : null);
      } else {
        setModalExcluir(m => m ? { ...m, loading: false, erro: (data.detalhe || data.erro) || 'Erro ao excluir' } : null);
      }
    } catch {
      setModalExcluir(m => m ? { ...m, loading: false, erro: 'Erro de conexão. Tente novamente.' } : null);
    }
  }

  function buscar() {
    setLoading(true);
    getEntregues({ cliente: fCliente }).then(setData).catch(() => {}).finally(() => setLoading(false));
  }

  useEffect(() => { buscar(); }, []);

  const buscarRef = useRef<() => void>(() => {});
  buscarRef.current = buscar;

  useEffect(() => {
    const t = setInterval(() => buscarRef.current(), 20 * 60 * 1000);
    return () => clearInterval(t);
  }, []);

  const buscarCallback = useCallback(() => buscarRef.current(), []);
  useRealtime(
    ['producao_itemparcial', 'producao_itempedido', 'producao_movimentacaoitem'],
    buscarCallback,
  );

  return (
    <AuthGuard>
      {/* Modal Canhotos */}
      {modalCanhotos && data && (
        <div onClick={() => setModalCanhotos(false)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div onClick={e => e.stopPropagation()}
            style={{ background: '#fff', borderRadius: 14, width: '100%', maxWidth: 780, maxHeight: '85vh', display: 'flex', flexDirection: 'column', boxShadow: '0 8px 40px rgba(0,0,0,0.18)' }}>
            {/* Header */}
            <div style={{ padding: '18px 24px', borderBottom: '1px solid #f0f0f0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#1a3a5c' }}>✍ Canhotos Assinados</h3>
                <p style={{ margin: 0, fontSize: 12, color: '#888' }}>{data.canhotos_assinados} com canhoto · {data.canhotos_pendentes} pendente{data.canhotos_pendentes !== 1 ? 's' : ''}</p>
              </div>
              <button onClick={() => setModalCanhotos(false)}
                style={{ background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', color: '#999' }}>×</button>
            </div>
            {/* Body */}
            <div style={{ overflowY: 'auto', flex: 1 }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ background: '#f8faff', position: 'sticky', top: 0 }}>
                    {['Pedido', 'Cliente', 'Vendedor', 'Material', 'Valor', 'Canhoto'].map(h => (
                      <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: 0.5, borderBottom: '1px solid #e5e7eb' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.pedidos.map(p => {
                    const materiais = p.itens?.map(i => i.codigo).filter(Boolean).join(', ') || '—';
                    return (
                      <tr key={p.id} style={{ borderBottom: '1px solid #f5f5f5' }}>
                        <td style={{ padding: '10px 14px' }}>
                          <Link href={`/pedidos/${p.id}`} onClick={() => setModalCanhotos(false)}
                            style={{ fontWeight: 700, color: '#1a3a5c', textDecoration: 'none', fontSize: 13 }}>
                            {p.numero_pedido_venda}
                          </Link>
                          {p.numero_op && <span style={{ fontSize: 10, color: '#aaa', marginLeft: 6 }}>OP {p.numero_op}</span>}
                        </td>
                        <td style={{ padding: '10px 14px', color: '#444' }}>{p.cliente}</td>
                        <td style={{ padding: '10px 14px', color: '#666' }}>{p.vendedor || '—'}</td>
                        <td style={{ padding: '10px 14px', color: '#555', maxWidth: 180 }}>
                          <span style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{materiais}</span>
                        </td>
                        <td style={{ padding: '10px 14px', fontWeight: 600, color: '#16a34a', whiteSpace: 'nowrap' }}>
                          {p.valor_calculado ? `R$ ${Number(p.valor_calculado).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : '—'}
                        </td>
                        <td style={{ padding: '10px 14px' }}>
                          {p.canhoto_url
                            ? <a href={p.canhoto_url} download="canhoto"
                                style={{ fontSize: 12, color: '#2563eb', fontWeight: 600, textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 4, background: '#eff6ff', padding: '3px 10px', borderRadius: 6, border: '1px solid #bfdbfe' }}>
                                ⬇ Baixar
                              </a>
                            : <span style={{ fontSize: 11, color: p.anexo_pendente ? '#d97706' : '#dc2626', fontWeight: 600 }}>
                                {p.anexo_pendente ? '⏳ Pendente' : '✗ Não anexado'}
                              </span>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {divergencia && (
        <ReportarDivergenciaModal
          pedidoId={divergencia.pedidoId}
          pedidoNumero={divergencia.pedidoNumero}
          itens={divergencia.itens?.map(i => ({ id: i.id, codigo: i.codigo, descricao: i.descricao }))}
          onClose={() => setDivergencia(null)}
          onSuccess={() => { setDivergencia(null); setMensagem('Divergência registrada com sucesso!'); setTimeout(() => setMensagem(''), 6000); }}
        />
      )}
      {anexar && (
        <AnexarComprovanteModal
          itemId={anexar.itemId}
          pedidoNumero={anexar.pedidoNumero}
          onClose={() => setAnexar(null)}
          onSuccess={() => { setAnexar(null); buscar(); }}
        />
      )}

      {/* Modal excluir pedido */}
      {modalExcluir && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div style={{ background: '#fff', borderRadius: 12, padding: 28, width: '100%', maxWidth: 440, boxShadow: '0 8px 40px rgba(0,0,0,0.18)' }}>
            <h5 style={{ margin: '0 0 12px', fontWeight: 700, color: '#b91c1c' }}>
              <i className="bi bi-exclamation-triangle" style={{ marginRight: 8 }}></i>Excluir Pedido
            </h5>
            <p style={{ fontSize: 14, color: '#374151', margin: '0 0 8px' }}>
              Tem certeza que deseja excluir o pedido <strong>{modalExcluir.numero}</strong>? Ele poderá ser recuperado em "Pedidos Excluídos".
            </p>
            <label style={{ fontSize: 12, fontWeight: 600, color: '#444', display: 'block', marginBottom: 4 }}>Motivo (opcional)</label>
            <textarea
              value={modalExcluir.motivo}
              onChange={e => setModalExcluir(m => m ? { ...m, motivo: e.target.value } : null)}
              rows={2} placeholder="Ex.: pedido duplicado, cadastrado por engano..."
              style={{ width: '100%', border: '1px solid #d1d5db', borderRadius: 6, padding: '8px 10px', fontSize: 13, resize: 'vertical', boxSizing: 'border-box', marginBottom: 12 }}
            />
            {modalExcluir.erro && (
              <div style={{ marginBottom: 12, padding: '8px 12px', borderRadius: 6, fontSize: 12.5, background: '#fef2f2', color: '#991b1b', border: '1px solid #fecaca' }}>
                ⚠ {modalExcluir.erro}
              </div>
            )}
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button onClick={() => setModalExcluir(null)} disabled={modalExcluir.loading}
                style={{ background: '#f0f0f0', color: '#333', border: 'none', borderRadius: 6, padding: '8px 18px', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                Cancelar
              </button>
              <button onClick={() => confirmarExcluir(modalExcluir.requerConfirmacao)} disabled={modalExcluir.loading}
                style={{ background: modalExcluir.loading ? '#f5a3a3' : '#dc3545', color: '#fff', border: 'none', borderRadius: 6, padding: '8px 18px', fontSize: 13, fontWeight: 700, cursor: modalExcluir.loading ? 'not-allowed' : 'pointer' }}>
                {modalExcluir.loading ? 'Excluindo...' : modalExcluir.requerConfirmacao ? 'Excluir mesmo assim' : 'Excluir'}
              </button>
            </div>
          </div>
        </div>
      )}

      {mensagem && (
        <div style={{ marginBottom: 12, padding: '10px 16px', borderRadius: 8, background: '#d1fae5', color: '#065f46', border: '1px solid #a7f3d0', fontSize: 13, fontWeight: 500 }}>
          ✅ {mensagem}
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <h4 style={{ margin: 0, fontWeight: 700, color: '#1a3a5c', fontSize: 20 }}>
            <i className="bi bi-check-circle-fill" style={{ marginRight: 8, color: '#198754' }}></i>
            Entregues
          </h4>
          <small style={{ color: '#888' }}>Ordens de produção concluídas e entregues</small>
        </div>
      </div>

      {data && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12, marginBottom: 18 }}>
          {[
            { label: 'Pedidos Entregues', val: data.total_pedidos, icon: 'bi-box-seam', color: '#198754' },
            { label: 'Itens Entregues', val: data.total_itens, icon: 'bi-list-check', color: '#0d6efd' },
            { label: 'Valor Total', val: `R$ ${Number(data.total_valor).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`, icon: 'bi-currency-dollar', color: '#fd7e14' },
          ].map(c => (
            <div key={c.label} className="card" style={{ padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 14 }}>
              <i className={`bi ${c.icon}`} style={{ fontSize: 28, color: c.color }}></i>
              <div>
                <div style={{ fontSize: 22, fontWeight: 800, color: c.color }}>{c.val}</div>
                <div style={{ fontSize: 11, color: '#888' }}>{c.label}</div>
              </div>
            </div>
          ))}
          {/* Card Canhotos Assinados */}
          <div className="card" onClick={() => setModalCanhotos(true)}
            style={{ padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 14, cursor: 'pointer', transition: 'box-shadow .15s' }}
            onMouseEnter={e => (e.currentTarget.style.boxShadow = '0 4px 16px rgba(0,0,0,0.10)')}
            onMouseLeave={e => (e.currentTarget.style.boxShadow = '')}>
            <i className="bi bi-pen" style={{ fontSize: 28, color: data.canhotos_assinados === data.total_pedidos ? '#198754' : '#f59e0b' }}></i>
            <div>
              <div style={{ fontSize: 22, fontWeight: 800, color: data.canhotos_assinados === data.total_pedidos ? '#198754' : '#f59e0b' }}>
                {data.canhotos_assinados}/{data.total_pedidos}
              </div>
              <div style={{ fontSize: 11, color: '#888' }}>Canhotos Assinados</div>
              {data.canhotos_pendentes > 0 && (
                <div style={{ fontSize: 10, color: '#dc2626', fontWeight: 600, marginTop: 2 }}>
                  {data.canhotos_pendentes} pendente{data.canhotos_pendentes > 1 ? 's' : ''}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Filtro */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
        <input value={fCliente} onChange={e => setFCliente(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && buscar()}
          placeholder="Buscar cliente..."
          style={{ border: '1px solid #dee2e6', borderRadius: 6, padding: '6px 12px', fontSize: 13, flex: 1, maxWidth: 320 }} />
        <button onClick={buscar} className="btn btn-primary btn-sm">
          <i className="bi bi-search" style={{ marginRight: 4 }}></i>Filtrar
        </button>
      </div>

      {loading && <p style={{ color: '#999', textAlign: 'center', padding: 40 }}>Carregando...</p>}

      <div className="card" style={{ overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ background: '#212529', color: '#fff' }}>
              <th style={{ padding: '9px 12px', width: 32 }}></th>
              <th style={{ padding: '9px 12px', textAlign: 'left' }}>Pedido</th>
              <th style={{ padding: '9px 12px', textAlign: 'left' }}>Cliente</th>
              <th style={{ padding: '9px 12px', textAlign: 'left' }}>Prazo</th>
              <th style={{ padding: '9px 12px', textAlign: 'left' }}>Prioridade</th>
              <th style={{ padding: '9px 12px', textAlign: 'left' }}>Valor</th>
              <th style={{ padding: '9px 12px', textAlign: 'left' }}>Comprovantes</th>
              <th style={{ padding: '9px 12px', textAlign: 'left' }}>Nota Fiscal</th>
              <th style={{ padding: '9px 12px', textAlign: 'left' }}>Canhoto</th>
              <th style={{ padding: '9px 12px', textAlign: 'left' }}>Divergência</th>
              <th style={{ padding: '9px 12px', textAlign: 'left' }}>Ações</th>
            </tr>
          </thead>
          <tbody>
            {!loading && (!data || data.pedidos.length === 0) && (
              <tr><td colSpan={11} style={{ textAlign: 'center', padding: 40, color: '#999' }}>Nenhum pedido entregue encontrado.</td></tr>
            )}
            {data?.pedidos.map(p => {
              const aberto = expandido === p.id;
              const temComprovante = p.comprovantes?.some(c => c.comprovante_url);
              const semComprovante = p.comprovantes?.filter(c => !c.comprovante_url) || [];
              return (
                <>
                  <tr key={p.id} style={{ borderBottom: '1px solid #f0f0f0', background: aberto ? '#f8fffe' : undefined }}>
                    <td style={{ padding: '8px 12px' }}>
                      <button onClick={() => setExpandido(aberto ? null : p.id)}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#999', fontSize: 14 }}>
                        <i className={`bi bi-chevron-${aberto ? 'down' : 'right'}`}></i>
                      </button>
                    </td>
                    <td style={{ padding: '8px 12px' }}>
                      <Link href={`/pedidos/${p.id}`} style={{ color: '#1a3a5c', fontWeight: 700, textDecoration: 'none' }}>
                        {p.numero_pedido_venda}
                      </Link>
                      {p.status !== 'entregue' && (
                        <span style={{ marginLeft: 6, fontSize: 10, background: '#fef9c3', color: '#854d0e', padding: '1px 6px', borderRadius: 8, fontWeight: 700 }}>
                          Parcial
                        </span>
                      )}
                    </td>
                    <td style={{ padding: '8px 12px', color: '#444' }}>{p.cliente}</td>
                    <td style={{ padding: '8px 12px', color: '#666', fontSize: 12 }}>{p.prazo_entrega}</td>
                    <td style={{ padding: '8px 12px' }}>
                      <span className={`badge-${p.prioridade || 'normal'}`} style={{ fontSize: 11, padding: '2px 8px', borderRadius: 4 }}>
                        {p.prioridade?.charAt(0).toUpperCase() + p.prioridade?.slice(1)}
                      </span>
                    </td>
                    <td style={{ padding: '8px 12px', color: '#444' }}>
                      {p.valor_calculado ? `R$ ${Number(p.valor_calculado).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : '—'}
                    </td>
                    <td style={{ padding: '8px 12px' }}>
                      {temComprovante
                        ? <span style={{ fontSize: 11, color: '#198754', fontWeight: 600 }}><i className="bi bi-paperclip" style={{ marginRight: 4 }}></i>{p.comprovantes.filter(c => c.comprovante_url).length} anexo(s)</span>
                        : <span style={{ fontSize: 11, color: '#aaa' }}>Sem comprovante</span>}
                    </td>
                    <td style={{ padding: '8px 12px' }}>
                      {p.nota_url
                        ? <a href={p.nota_url} download="nota_fiscal" style={{ fontSize: 11, color: '#16a34a', fontWeight: 700, textDecoration: 'none' }}>✅ Sim</a>
                        : <span style={{ fontSize: 11, color: '#dc2626', fontWeight: 600 }}>✗ Não</span>}
                    </td>
                    <td style={{ padding: '8px 12px' }}>
                      {p.canhoto_url
                        ? <a href={p.canhoto_url} download="canhoto" style={{ fontSize: 11, color: '#16a34a', fontWeight: 700, textDecoration: 'none' }}>✅ Sim</a>
                        : p.anexo_pendente
                          ? <span style={{ fontSize: 11, color: '#d97706', fontWeight: 600 }}>⏳ Pendente</span>
                          : <span style={{ fontSize: 11, color: '#dc2626', fontWeight: 600 }}>✗ Não</span>}
                    </td>
                    <td style={{ padding: '8px 12px' }}>
                      <button
                        onClick={() => setDivergencia({ pedidoId: p.id, pedidoNumero: p.numero_pedido_venda, itens: p.itens })}
                        style={{ fontSize: 11, background: '#fef2f2', border: '1px solid #fecaca', color: '#dc2626', borderRadius: 6, padding: '3px 10px', cursor: 'pointer', fontWeight: 700 }}>
                        <i className="bi bi-exclamation-triangle-fill" style={{ marginRight: 4 }}></i>Reportar
                      </button>
                    </td>
                    <td style={{ padding: '8px 12px' }}>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <Link href={`/pedidos/${p.id}`}
                          style={{ border: '1px solid #0d6efd', color: '#0d6efd', borderRadius: 4, padding: '2px 10px', textDecoration: 'none', fontSize: 12 }}>
                          <i className="bi bi-eye"></i>
                        </Link>
                        {podeEditar() && (
                        <button title="Excluir pedido"
                          onClick={() => setModalExcluir({ id: p.id, numero: p.numero_pedido_venda, motivo: '', loading: false })}
                          style={{ border: '1px solid #dc3545', color: '#dc3545', background: 'none', borderRadius: 4, padding: '2px 10px', cursor: 'pointer', fontSize: 12 }}>
                          <i className="bi bi-trash"></i>
                        </button>
                        )}
                      </div>
                    </td>
                  </tr>

                  {/* Painel expandido */}
                  {aberto && (
                    <tr key={`${p.id}-detail`}>
                      <td colSpan={11} style={{ padding: 0, background: '#f8fffe', borderBottom: '2px solid #d1fae5' }}>
                        <div style={{ padding: '16px 24px' }}>
                          <div style={{ fontSize: 11, fontWeight: 700, color: '#166534', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 12 }}>
                            <i className="bi bi-truck" style={{ marginRight: 6 }}></i>Registros de Entrega
                          </div>

                          {(!p.comprovantes || p.comprovantes.length === 0) && (
                            <p style={{ color: '#aaa', fontSize: 13 }}>Nenhum registro de entrega encontrado.</p>
                          )}

                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14 }}>
                            {p.comprovantes?.map(c => (
                              <div key={c.id} style={{ background: '#fff', border: '1px solid #d1fae5', borderRadius: 10, padding: 14, minWidth: 240, maxWidth: 320, flex: '1 1 240px' }}>
                                <div style={{ fontSize: 12, fontWeight: 700, color: '#166534', marginBottom: 8 }}>
                                  <i className="bi bi-file-earmark-check-fill" style={{ marginRight: 6 }}></i>NF {c.numero_nf}
                                </div>
                                <div style={{ fontSize: 11, color: '#666', marginBottom: 6 }}>
                                  <i className="bi bi-clock" style={{ marginRight: 4 }}></i>{fmtHora(c.criado_em)}
                                  {c.usuario_nome && <span style={{ marginLeft: 8, color: '#888' }}>· {c.usuario_nome}</span>}
                                </div>
                                {c.observacao && (
                                  <div style={{ fontSize: 11, color: '#555', marginBottom: 8, fontStyle: 'italic' }}>"{c.observacao}"</div>
                                )}

                                {/* Comprovante */}
                                {c.comprovante_url ? (
                                  isImagem(c.comprovante_url) ? (
                                    <a href={c.comprovante_url} target="_blank" rel="noreferrer">
                                      <img src={c.comprovante_url} alt="Canhoto"
                                        style={{ width: '100%', maxHeight: 160, objectFit: 'contain', borderRadius: 6, border: '1px solid #e5e7eb', cursor: 'pointer' }} />
                                    </a>
                                  ) : (
                                    <a href={c.comprovante_url} target="_blank" rel="noreferrer"
                                      style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 6, padding: '8px 12px', textDecoration: 'none', color: '#1d4ed8', fontSize: 12, fontWeight: 600 }}>
                                      <i className="bi bi-file-earmark-pdf-fill" style={{ fontSize: 20, color: '#dc2626' }}></i>
                                      Ver documento
                                    </a>
                                  )
                                ) : (
                                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                    <span style={{ fontSize: 11, color: '#aaa' }}>Sem comprovante</span>
                                    <button
                                      onClick={() => setAnexar({ itemId: c.item_id, pedidoNumero: p.numero_pedido_venda })}
                                      style={{ fontSize: 11, color: '#0d6efd', background: 'none', border: '1px solid #bfdbfe', borderRadius: 4, padding: '3px 10px', cursor: 'pointer', fontWeight: 600 }}>
                                      <i className="bi bi-paperclip" style={{ marginRight: 4 }}></i>Anexar
                                    </button>
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>

                          {semComprovante.length > 0 && (
                            <div style={{ marginTop: 10, fontSize: 11, color: '#f59e0b', fontWeight: 600 }}>
                              <i className="bi bi-exclamation-triangle" style={{ marginRight: 4 }}></i>
                              {semComprovante.length} entrega(s) sem comprovante anexado
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                  )}
                </>
              );
            })}
          </tbody>
        </table>
      </div>
    </AuthGuard>
  );
}

