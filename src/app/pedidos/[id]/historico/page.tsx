'use client';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import AuthGuard from '@/components/AuthGuard';
import { getToken } from '@/lib/auth';

const NOMES: Record<string, string> = {
  emissao: 'Emissão', usinagem: 'Usinagem', 'maçarico': 'Maçarico',
  plasma: 'Plasma', estoque: 'Estoque', furacao: 'Furação',
  qualidade: 'Qualidade', acabamento: 'Acabamento',
  logistica: 'Logística', recebimento: 'Recebimento', compras: 'Compras',
  beneficiadores: 'Beneficiadores', embalagem: 'Embalagem',
};
const STATUS_LABEL: Record<string, string> = {
  emitido: 'Emitido', aguardando: 'Aguardando', recebido: 'Recebido',
  em_andamento: 'Em Andamento', pausado: 'Pausado',
  finalizado_setor: 'Finalizado no Setor', em_transito: 'Em Trânsito',
  entregue: 'Entregue', bloqueado: 'Bloqueado', reprovado: 'Reprovado',
};
const STATUS_COLOR: Record<string, { bg: string; color: string }> = {
  emitido:          { bg: '#dbeafe', color: '#1d4ed8' },
  aguardando:       { bg: '#fef9c3', color: '#854d0e' },
  recebido:         { bg: '#e0f2fe', color: '#0369a1' },
  em_andamento:     { bg: '#dcfce7', color: '#166534' },
  pausado:          { bg: '#fce7f3', color: '#9d174d' },
  finalizado_setor: { bg: '#d1fae5', color: '#065f46' },
  em_transito:      { bg: '#ede9fe', color: '#5b21b6' },
  entregue:         { bg: '#bbf7d0', color: '#14532d' },
  bloqueado:        { bg: '#fee2e2', color: '#991b1b' },
  reprovado:        { bg: '#fecaca', color: '#7f1d1d' },
};

function fmt(s: string | null) {
  if (!s) return '—';
  const d = new Date(s);
  if (isNaN(d.getTime())) return s;
  return d.toLocaleDateString('pt-BR') + ' ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

interface Mov {
  id: number;
  item_id: number;
  item_codigo: string;
  setor_origem: string;
  setor_destino: string;
  status_anterior: string;
  status_novo: string;
  observacao: string;
  criado_em: string;
  usuario_nome: string;
}

export default function HistoricoPage() {
  const { id } = useParams<{ id: string }>();
  const [movs, setMovs] = useState<Mov[]>([]);
  const [numeroPedido, setNumeroPedido] = useState('');
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState('');
  const [filtroItem, setFiltroItem] = useState('');

  useEffect(() => {
    Promise.all([
      fetch(`/api/pedidos/${id}`, { headers: { Authorization: `Bearer ${getToken() || ''}` } }).then(r => r.json()),
      fetch(`/api/pedidos/${id}/historico`, { headers: { Authorization: `Bearer ${getToken() || ''}` } }).then(r => r.json()),
    ])
      .then(([pedData, movData]) => {
        if (pedData.numero_pedido_venda) setNumeroPedido(pedData.numero_pedido_venda);
        if (movData.erro) setErro(movData.erro);
        else setMovs(movData.movimentacoes || []);
      })
      .catch(e => setErro(String(e)))
      .finally(() => setLoading(false));
  }, [id]);

  const itens = Array.from(new Set(movs.map(m => m.item_codigo))).filter(Boolean);
  const movsExibidos = filtroItem ? movs.filter(m => m.item_codigo === filtroItem) : movs;

  return (
    <AuthGuard>
      {/* Cabeçalho */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div>
          <h4 style={{ margin: 0, fontWeight: 700, color: '#1a3a5c', fontSize: 20 }}>
            <i className="bi bi-clock-history" style={{ marginRight: 8 }} />
            Histórico de Movimentações
          </h4>
          {numeroPedido && (
            <div style={{ fontSize: 13, color: '#64748b', marginTop: 4 }}>
              Pedido <strong>{numeroPedido}</strong>
            </div>
          )}
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <Link href={`/pedidos/${id}`} className="btn btn-outline btn-sm">
            <i className="bi bi-arrow-left" /> Voltar ao Pedido
          </Link>
          <Link href={`/pedidos/${id}/relatorio`} className="btn btn-outline btn-sm" target="_blank">
            <i className="bi bi-file-earmark-text" /> Relatório Completo
          </Link>
        </div>
      </div>

      {loading && <div style={{ padding: 40, textAlign: 'center', color: '#aaa' }}>Carregando...</div>}
      {erro && <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 10, padding: 16, color: '#dc2626' }}>{erro}</div>}

      {!loading && !erro && (
        <>
          {/* Filtro por item */}
          {itens.length > 1 && (
            <div style={{ marginBottom: 16, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button
                onClick={() => setFiltroItem('')}
                style={{
                  padding: '5px 14px', borderRadius: 20, fontSize: 12, fontWeight: 700, cursor: 'pointer',
                  background: !filtroItem ? '#1a3a5c' : '#f1f5f9',
                  color: !filtroItem ? '#fff' : '#64748b',
                  border: 'none',
                }}>
                Todos ({movs.length})
              </button>
              {itens.map(cod => (
                <button key={cod}
                  onClick={() => setFiltroItem(cod)}
                  style={{
                    padding: '5px 14px', borderRadius: 20, fontSize: 12, fontWeight: 700, cursor: 'pointer',
                    background: filtroItem === cod ? '#1a3a5c' : '#f1f5f9',
                    color: filtroItem === cod ? '#fff' : '#64748b',
                    border: 'none',
                  }}>
                  {cod} ({movs.filter(m => m.item_codigo === cod).length})
                </button>
              ))}
            </div>
          )}

          {movsExibidos.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 48, color: '#aaa' }}>
              <i className="bi bi-inbox" style={{ fontSize: 32, display: 'block', marginBottom: 8 }} />
              Nenhuma movimentação registrada ainda.
            </div>
          ) : (
            <div style={{ position: 'relative' }}>
              {/* Linha vertical da timeline */}
              <div style={{ position: 'absolute', left: 19, top: 0, bottom: 0, width: 2, background: '#e2e8f0', zIndex: 0 }} />

              <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
                {movsExibidos.map((mov, i) => {
                  const sc = STATUS_COLOR[mov.status_novo] || { bg: '#f1f5f9', color: '#64748b' };
                  return (
                    <div key={mov.id} style={{ display: 'flex', gap: 16, paddingBottom: 20, position: 'relative', zIndex: 1 }}>
                      {/* Bolinha */}
                      <div style={{
                        width: 40, height: 40, borderRadius: '50%', flexShrink: 0,
                        background: sc.bg, border: `2px solid ${sc.color}`,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 15,
                      }}>
                        {mov.status_novo === 'entregue' ? '✅' :
                         mov.status_novo === 'em_andamento' ? '⚙️' :
                         mov.status_novo === 'em_transito' ? '🚚' :
                         mov.status_novo === 'finalizado_setor' ? '✓' :
                         mov.status_novo === 'bloqueado' ? '🔴' :
                         mov.status_novo === 'reprovado' ? '❌' :
                         mov.status_novo === 'recebido' ? '📥' :
                         mov.status_novo === 'pausado' ? '⏸' :
                         mov.status_novo === 'emitido' ? '📋' : '→'}
                      </div>

                      {/* Conteúdo */}
                      <div className="card" style={{ flex: 1, padding: '12px 16px', marginBottom: 0 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 8 }}>
                          <div>
                            {/* Status novo */}
                            <span style={{
                              display: 'inline-block', padding: '3px 10px', borderRadius: 20,
                              fontSize: 12, fontWeight: 700, background: sc.bg, color: sc.color, marginRight: 8,
                            }}>
                              {STATUS_LABEL[mov.status_novo] || mov.status_novo}
                            </span>
                            {/* Item */}
                            {mov.item_codigo && (
                              <span style={{ fontSize: 12, color: '#64748b', fontWeight: 700 }}>
                                <i className="bi bi-box" style={{ marginRight: 4 }} />{mov.item_codigo}
                              </span>
                            )}
                          </div>
                          <div style={{ fontSize: 11, color: '#94a3b8', textAlign: 'right' }}>
                            <div>{fmt(mov.criado_em)}</div>
                            {mov.usuario_nome && <div style={{ fontWeight: 600, color: '#64748b' }}>{mov.usuario_nome}</div>}
                          </div>
                        </div>

                        {/* Rota setor */}
                        {(mov.setor_origem || mov.setor_destino) && (
                          <div style={{ marginTop: 8, fontSize: 12, color: '#64748b', display: 'flex', alignItems: 'center', gap: 6 }}>
                            {mov.setor_origem && (
                              <span style={{ background: '#f1f5f9', padding: '2px 8px', borderRadius: 4 }}>
                                {NOMES[mov.setor_origem] || mov.setor_origem}
                              </span>
                            )}
                            {mov.setor_origem && mov.setor_destino && <i className="bi bi-arrow-right" />}
                            {mov.setor_destino && (
                              <span style={{ background: '#f1f5f9', padding: '2px 8px', borderRadius: 4 }}>
                                {NOMES[mov.setor_destino] || mov.setor_destino}
                              </span>
                            )}
                          </div>
                        )}

                        {/* Status anterior */}
                        {mov.status_anterior && mov.status_anterior !== mov.status_novo && (
                          <div style={{ marginTop: 6, fontSize: 11, color: '#94a3b8' }}>
                            Antes: <em>{STATUS_LABEL[mov.status_anterior] || mov.status_anterior}</em>
                          </div>
                        )}

                        {/* Observação */}
                        {mov.observacao && (
                          <div style={{ marginTop: 8, fontSize: 12, color: '#475569', background: '#f8fafc', borderRadius: 6, padding: '6px 10px', borderLeft: '3px solid #cbd5e1' }}>
                            <i className="bi bi-chat-text" style={{ marginRight: 6 }} />{mov.observacao}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </>
      )}
    </AuthGuard>
  );
}
