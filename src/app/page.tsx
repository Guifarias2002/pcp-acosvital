'use client';
import { useEffect, useState, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import AuthGuard from '@/components/AuthGuard';
import { getDashboard } from '@/lib/api';
import { useRealtime } from '@/hooks/useRealtime';
import { DashboardData, STATUS_LABELS, SETOR_CHOICES, getEtapa, getPedidoEtapa, ETAPA_LABELS, ETAPA_COR } from '@/lib/types';
import { getUser, getToken } from '@/lib/auth';
import Link from 'next/link';
import NotificacoesLive from '@/components/NotificacoesLive';

const NOMES_SETOR = Object.fromEntries(SETOR_CHOICES);

const STATUS_COR: Record<string, { bg: string; text: string }> = {
  aguardando:        { bg: '#e0f2fe', text: '#0369a1' },
  recebido:          { bg: '#ede9fe', text: '#6d28d9' },
  em_andamento:      { bg: '#dbeafe', text: '#1d4ed8' },
  pausado:           { bg: '#fef9c3', text: '#92400e' },
  finalizado_setor:  { bg: '#dcfce7', text: '#166534' },
  bloqueado:         { bg: '#fee2e2', text: '#991b1b' },
  reprovado:         { bg: '#ffe4e6', text: '#9f1239' },
  emitido:           { bg: '#f3f4f6', text: '#374151' },
};

function SetorRow({ s, isAdmin }: { s: DashboardData['por_setor'][0]; isAdmin: boolean | undefined }) {
  const [aberto, setAberto] = useState(false);

  // Agrupa itens por status
  const porStatus: Record<string, number> = {};
  for (const item of (s.itens ?? [])) {
    porStatus[item.status] = (porStatus[item.status] || 0) + 1;
  }

  return (
    <div style={{ borderBottom: '1px solid #f0f0f0' }}>
      {/* Linha do setor — clicável */}
      <button
        onClick={() => setAberto(v => !v)}
        style={{
          width: '100%', display: 'flex', alignItems: 'center',
          justifyContent: 'space-between', padding: '10px 16px',
          background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <i className={`bi bi-chevron-${aberto ? 'down' : 'right'}`} style={{ fontSize: 11, color: '#999', width: 12 }} />
          <strong style={{ color: '#1a3a5c', fontSize: 13 }}>{s.nome}</strong>
          {/* Mini badges de status */}
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
            {Object.entries(porStatus).map(([st, qtd]) => {
              const cor = STATUS_COR[st] || { bg: '#f3f4f6', text: '#555' };
              return (
                <span key={st} style={{
                  fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 10,
                  background: cor.bg, color: cor.text,
                }}>
                  {STATUS_LABELS[st] || st}: {qtd}
                </span>
              );
            })}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
          {isAdmin && s.valor != null && Number(s.valor) > 0 && (
            <span style={{ fontSize: 12, color: '#198754', fontWeight: 600 }}>
              {Number(s.valor).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
            </span>
          )}
          <span style={{
            background: '#0d6efd', color: '#fff', fontSize: 11, fontWeight: 700,
            width: 22, height: 22, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>{s.qtd}</span>
        </div>
      </button>

      {/* Itens expandidos */}
      {aberto && (
        <div style={{ paddingBottom: 6 }}>
          {(s.itens ?? []).map(item => {
            const roteiro = item.roteiro_efetivo || [];
            const idxAtual = roteiro.indexOf(item.setor_atual);
            return (
              <Link key={item.id} href={`/item/${item.id}`} style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '8px 16px 8px 40px', textDecoration: 'none',
                borderTop: '1px solid #f9f9f9', gap: 10,
              }}>
                {/* Info do item */}
                <div style={{ minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                    <strong style={{ color: '#1a3a5c', fontSize: 12 }}>{item.pedido_numero}</strong>
                    <span style={{ color: '#888', fontSize: 11 }}>{item.codigo}</span>
                    <span style={{ color: '#0d6efd', fontWeight: 700, fontSize: 11 }}>{item.quantidade_pendente} {item.unidade}</span>
                  </div>
                  {/* Etapas do roteiro */}
                  {roteiro.length > 0 && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
                      {roteiro.map((setor, i) => {
                        const feito = i < idxAtual;
                        const atual = i === idxAtual;
                        return (
                          <span key={setor} style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                            <span style={{
                              fontSize: 10, padding: '1px 6px', borderRadius: 10, fontWeight: atual ? 700 : 500,
                              background: atual ? '#1a3a5c' : feito ? '#d1fae5' : '#f3f4f6',
                              color: atual ? '#fff' : feito ? '#065f46' : '#9ca3af',
                              border: atual ? 'none' : feito ? '1px solid #a7f3d0' : '1px solid #e5e7eb',
                            }}>
                              {feito && '✓ '}{NOMES_SETOR[setor] || setor}
                            </span>
                            {i < roteiro.length - 1 && (
                              <span style={{ color: '#d1d5db', fontSize: 9 }}>›</span>
                            )}
                          </span>
                        );
                      })}
                    </div>
                  )}
                </div>
                {/* Status badge */}
                <span style={{
                  fontSize: 11, padding: '2px 8px', borderRadius: 4, fontWeight: 600,
                  flexShrink: 0, whiteSpace: 'nowrap',
                  background: (STATUS_COR[item.status] || { bg: '#f3f4f6' }).bg,
                  color: (STATUS_COR[item.status] || { text: '#555' }).text,
                }}>
                  {item.status_display}
                </span>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

function BRL({ v }: { v: string | number }) {
  return <>{Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</>;
}

const PRIORIDADE_BADGE: Record<string, string> = {
  baixa: 'badge-baixa', normal: 'badge-normal', alta: 'badge-alta', urgente: 'badge-urgente',
};

function PedidoRow({ p, isAdmin }: { p: DashboardData['pendencias'][0]; isAdmin: boolean | undefined }) {
  const [aberto, setAberto] = useState(false);
  const [setorModal, setSetorModal] = useState<string | null>(null);
  const [modalItens, setModalItens] = useState<{ codigo: string; descricao: string; quantidade: string; unidade: string; status: string }[]>([]);
  const [modalLoading, setModalLoading] = useState(false);
  const itens = p.itens || [];
  const cor = STATUS_COR[p.status] || { bg: '#f3f4f6', text: '#555' };

  async function abrirSetorModal(setor: string, e: React.MouseEvent) {
    e.stopPropagation();
    setSetorModal(setor);
    setModalLoading(true);
    try {
      const token = localStorage.getItem('token') || '';
      const res = await fetch(`/api/pedidos/${p.id}`, { headers: { Authorization: `Bearer ${token}` } });
      const data = await res.json();
      const filtrados = (data.itens || []).flatMap((item: any) => {
        const parciais = (item.parciais_por_setor || []).filter((ps: any) => setor === '__todos__' || ps.setor === setor);
        return parciais.map((ps: any) => ({
          setor: ps.setor,
          codigo: item.codigo,
          descricao: item.descricao,
          quantidade: ps.quantidade,
          unidade: ps.unidade,
          status: ps.status,
          retrabalho: ps.retrabalho,
        }));
      });
      setModalItens(filtrados);
    } finally {
      setModalLoading(false);
    }
  }

  return (
    <>
      <tr
        onClick={() => setAberto(v => !v)}
        style={{ borderBottom: '1px solid #f0f0f0', cursor: 'pointer', background: aberto ? '#f8faff' : 'white' }}
        className="hover:bg-gray-50"
      >
        <td style={{ padding: '10px 12px', width: 28 }}>
          <i className={`bi bi-chevron-${aberto ? 'down' : 'right'}`} style={{ fontSize: 11, color: '#aaa' }} />
        </td>
        <td style={{ padding: '10px 12px' }}>
          <span style={{ color: '#1a3a5c', fontWeight: 700, fontSize: 13 }}>{p.numero_pedido_venda}</span>
          {p.numero_op && <span style={{ color: '#aaa', fontSize: 11, marginLeft: 6 }}>{p.numero_op}</span>}
        </td>
        <td style={{ padding: '10px 12px', color: '#444', fontSize: 13 }}>{p.cliente}</td>
        <td style={{ padding: '10px 12px' }}>
          {(() => {
            const setores: string[] = (p as any).setores_parciais && (p as any).setores_parciais.length > 0
              ? (p as any).setores_parciais
              : p.setor_atual ? [p.setor_atual] : [];
            if (setores.length === 0) return <span style={{ color: '#ccc', fontSize: 11 }}>—</span>;
            if (setores.length === 1) return (
              <button onClick={e => abrirSetorModal(setores[0], e)}
                style={{ background: '#1a3a5c', color: '#fff', fontSize: 11, padding: '2px 8px', borderRadius: 4, border: 'none', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                {NOMES_SETOR[setores[0]] || setores[0]}
              </button>
            );
            return (
              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <button onClick={e => abrirSetorModal(setores[0], e)}
                  style={{ background: '#1a3a5c', color: '#fff', fontSize: 11, padding: '2px 8px', borderRadius: 4, border: 'none', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                  {NOMES_SETOR[setores[0]] || setores[0]}
                </button>
                <button onClick={e => abrirSetorModal('__todos__', e)}
                  style={{ background: '#e2e8f0', color: '#475569', fontSize: 12, padding: '2px 7px', borderRadius: 4, border: 'none', cursor: 'pointer', fontWeight: 700, letterSpacing: 1 }}
                  title={`+${setores.length - 1} setor${setores.length - 1 > 1 ? 'es' : ''}: ${setores.slice(1).map(s => NOMES_SETOR[s] || s).join(', ')}`}>
                  ···
                </button>
              </div>
            );
          })()}
        </td>
        <td style={{ padding: '10px 12px' }}>
          {(() => {
            const etapa = getPedidoEtapa(p);
            const ec = ETAPA_COR[etapa];
            const parcial = etapa === 'entregue' && p.status !== 'entregue';
            return (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 4, fontWeight: 700, background: ec.bg, color: ec.text, whiteSpace: 'nowrap' }}>
                  <i className={`bi ${ec.icon}`} style={{ marginRight: 4 }} />
                  {ETAPA_LABELS[etapa]}
                </span>
                {parcial && (
                  <span style={{ fontSize: 10, padding: '2px 7px', borderRadius: 4, fontWeight: 700, background: '#fef9c3', color: '#854d0e', border: '1px solid #fde68a' }}>
                    Parcial
                  </span>
                )}
              </span>
            );
          })()}
        </td>
        <td style={{ padding: '10px 12px' }}>
          <span className={PRIORIDADE_BADGE[p.prioridade] || 'badge-normal'}>
            {p.prioridade?.charAt(0).toUpperCase() + p.prioridade?.slice(1)}
          </span>
        </td>
        <td style={{ padding: '10px 12px', fontSize: 12, color: p.atrasado ? '#dc3545' : '#555', fontWeight: p.atrasado ? 700 : 400, whiteSpace: 'nowrap' }}>
          {p.atrasado && <i className="bi bi-exclamation-circle-fill" style={{ marginRight: 4 }} />}
          {p.prazo_entrega}
        </td>
        <td style={{ padding: '10px 12px' }}>
          <span style={{ fontSize: 11, color: '#888' }}>{itens.length} item{itens.length !== 1 ? 's' : ''}</span>
        </td>
      </tr>
      {aberto && itens.length > 0 && (
        <tr style={{ background: '#f8faff' }}>
          <td colSpan={8} style={{ padding: '0 12px 10px 40px' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, paddingTop: 6 }}>
              <p style={{ fontSize: 10, fontWeight: 700, color: '#999', textTransform: 'uppercase', letterSpacing: 1, margin: '0 0 4px' }}>
                Localização dos itens — clique no setor para ver os detalhes
              </p>
              {itens.map(item => {
                const corItem = STATUS_COR[item.status] || { bg: '#f3f4f6', text: '#555' };
                return (
                  <Link key={item.id} href={`/pedidos/${p.id}`}
                    style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '5px 10px', background: '#fff', borderRadius: 6, border: '1px solid #e5e7eb', textDecoration: 'none' }}
                    onClick={e => e.stopPropagation()}>
                    <strong style={{ color: '#1a3a5c', fontSize: 12, minWidth: 80 }}>{item.codigo}</strong>
                    <span style={{ color: '#666', fontSize: 12, flex: 1 }}>{item.descricao}</span>
                    <span style={{ color: '#0d6efd', fontWeight: 700, fontSize: 12 }}>{item.quantidade_pendente} {item.unidade}</span>
                    <span style={{ fontSize: 11, padding: '1px 8px', borderRadius: 4, background: '#1a3a5c', color: '#fff' }}>
                      {NOMES_SETOR[item.setor_atual] || item.setor_atual || '—'}
                    </span>
                    <span style={{ fontSize: 11, padding: '1px 8px', borderRadius: 4, background: corItem.bg, color: corItem.text, fontWeight: 600 }}>
                      {STATUS_LABELS[item.status] || item.status}
                    </span>
                    <i className="bi bi-arrow-right" style={{ color: '#ccc', fontSize: 11 }} />
                  </Link>
                );
              })}
            </div>
          </td>
        </tr>
      )}

      {/* Modal de setor */}
      {setorModal && (
        <tr>
          <td colSpan={8} style={{ padding: 0 }}>
            <div onClick={() => setSetorModal(null)}
              style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <div onClick={e => e.stopPropagation()}
                style={{ background: '#fff', borderRadius: 12, padding: 24, minWidth: 420, maxWidth: 560, width: '90%', boxShadow: '0 8px 32px rgba(0,0,0,0.18)' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                  <div>
                    <p style={{ fontSize: 10, color: '#999', fontWeight: 700, textTransform: 'uppercase', margin: 0 }}>{p.numero_pedido_venda} · {p.cliente}</p>
                    <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#1a3a5c' }}>
                      {setorModal === '__todos__' ? 'Todos os setores' : (NOMES_SETOR[setorModal] || setorModal)}
                    </h3>
                  </div>
                  <button onClick={() => setSetorModal(null)}
                    style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: '#999', lineHeight: 1 }}>×</button>
                </div>
                {modalLoading ? (
                  <p style={{ color: '#999', fontSize: 13, textAlign: 'center', padding: '20px 0' }}>Carregando...</p>
                ) : modalItens.length === 0 ? (
                  <p style={{ color: '#999', fontSize: 13, textAlign: 'center', padding: '20px 0' }}>Nenhum item neste setor.</p>
                ) : (() => {
                  const stBg: Record<string, string> = { em_aberto: '#f3f4f6', em_andamento: '#dbeafe', finalizado_setor: '#dcfce7', pausado: '#fef9c3' };
                  const stLabel: Record<string, string> = { em_aberto: 'Aguardando', em_andamento: 'Em Andamento', finalizado_setor: 'Finalizado', pausado: 'Pausado' };
                  if (setorModal === '__todos__') {
                    // Agrupa por setor
                    const grupos: Record<string, any[]> = {};
                    for (const item of modalItens as any[]) {
                      if (!grupos[item.setor]) grupos[item.setor] = [];
                      grupos[item.setor].push(item);
                    }
                    return (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                        {Object.entries(grupos).map(([setor, items]) => (
                          <div key={setor}>
                            <p style={{ fontSize: 11, fontWeight: 700, color: '#1a3a5c', textTransform: 'uppercase', letterSpacing: 0.5, margin: '0 0 6px', padding: '4px 8px', background: '#e8eef6', borderRadius: 4 }}>
                              {NOMES_SETOR[setor] || setor}
                            </p>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                              {items.map((item: any, i: number) => (
                                <div key={i} style={{ padding: '8px 12px', background: '#f8faff', borderRadius: 8, border: '1px solid #e5e7eb', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                                  <strong style={{ color: '#1a3a5c', fontSize: 12 }}>{item.codigo}</strong>
                                  <span style={{ color: '#555', fontSize: 12, flex: 1 }}>{item.descricao}</span>
                                  <span style={{ fontWeight: 700, color: '#0d6efd', fontSize: 12 }}>{item.quantidade} {item.unidade}</span>
                                  <span style={{ fontSize: 11, padding: '1px 7px', borderRadius: 4, background: stBg[item.status] || '#f3f4f6', fontWeight: 600 }}>{stLabel[item.status] || item.status}</span>
                                  {item.retrabalho && <span style={{ fontSize: 11, padding: '1px 7px', borderRadius: 4, background: '#fef3c7', color: '#92400e', fontWeight: 600 }}>⚠ Retrabalho</span>}
                                </div>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    );
                  }
                  return (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {(modalItens as any[]).map((item: any, i: number) => (
                        <div key={i} style={{ padding: '10px 14px', background: '#f8faff', borderRadius: 8, border: '1px solid #e5e7eb' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                            <strong style={{ color: '#1a3a5c', fontSize: 13 }}>{item.codigo}</strong>
                            <span style={{ color: '#555', fontSize: 12, flex: 1 }}>{item.descricao}</span>
                            <span style={{ fontWeight: 700, color: '#0d6efd', fontSize: 13 }}>{item.quantidade} {item.unidade}</span>
                            <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 4, background: stBg[item.status] || '#f3f4f6', fontWeight: 600 }}>{stLabel[item.status] || item.status}</span>
                            {item.retrabalho && <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 4, background: '#fef3c7', color: '#92400e', fontWeight: 600 }}>⚠ Retrabalho</span>}
                          </div>
                        </div>
                      ))}
                    </div>
                  );
                })()}
                <div style={{ marginTop: 16, textAlign: 'right' }}>
                  <Link href={`/pedidos/${p.id}`} onClick={() => setSetorModal(null)}
                    style={{ fontSize: 12, color: '#1a3a5c', fontWeight: 600, textDecoration: 'none' }}>
                    Ver pedido completo →
                  </Link>
                </div>
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState(false);
  const [pedidosData, setPedidosData] = useState<DashboardData['pendencias'] | null>(null);
  const [busca, setBusca] = useState('');
  const [buscaMov, setBuscaMov] = useState('');
  const [showMovDropdown, setShowMovDropdown] = useState(false);
  const [movFiltroItem, setMovFiltroItem] = useState<{ codigo: string; descricao: string; pv: string; op: string } | null>(null);
  const [fPrioridade, setFPrioridade] = useState('');
  const [filtroEtapa, setFiltroEtapa] = useState<string | null>(null);
  const pedidosRef = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const _user = getUser();
  const isAdmin = _user?.is_staff;
  const isSuperAdmin = _user?.perfil === 'administrador' || (_user?.is_staff && _user?.perfil !== 'pcp' && _user?.perfil !== 'lider');

  useEffect(() => {
    // Operadores e líderes vão direto para o painel do próprio setor
    if (!_user?.is_staff && _user?.setor) {
      router.replace(`/setor/${_user.setor}`);
      return;
    }
    getDashboard().then(d => { setData(d); setErro(false); }).catch(() => setErro(true)).finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!data) return;
    const token = getToken() || '';
    fetch('/api/dashboard/pedidos', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then(j => setPedidosData(j.pedidos ?? []))
      .catch(() => setPedidosData([]));
  }, [data]);

  const carregarDashboard = useCallback(() => { getDashboard().then(setData); }, []);
  useRealtime(
    ['producao_itemparcial', 'producao_itempedido', 'producao_movimentacaoitem'],
    carregarDashboard,
  );

  const ultimosPedidos = pedidosData ?? [];
  const pedidosFiltrados = ultimosPedidos.filter(p => {
    if (busca && !p.numero_pedido_venda?.toLowerCase().includes(busca.toLowerCase()) && !p.cliente?.toLowerCase().includes(busca.toLowerCase())) return false;
    if (fPrioridade && p.prioridade !== fPrioridade) return false;
    if (filtroEtapa && getPedidoEtapa(p) !== filtroEtapa) return false;
    return true;
  });

  return (
    <AuthGuard>
      {isAdmin && <NotificacoesLive />}
      {/* Cabeçalho */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 10 }}>
        <div>
          <h4 style={{ margin: 0, fontWeight: 700, color: '#1a3a5c', fontSize: 20 }}>
            <i className="bi bi-speedometer2" style={{ marginRight: 8 }}></i>
            Painel de Produção
          </h4>
          <small style={{ color: '#888' }}>Visão geral em tempo real</small>
        </div>
        {isSuperAdmin && (
          <Link href="/pedidos/novo" style={{
            background: '#1a3a5c', color: '#fff', padding: '7px 16px',
            borderRadius: 6, textDecoration: 'none', fontSize: 13, fontWeight: 600,
          }}>
            <i className="bi bi-plus-lg" style={{ marginRight: 6 }}></i>Nova Ordem
          </Link>
        )}
      </div>

      {loading && <p style={{ color: '#999', textAlign: 'center', padding: '60px 0' }}>Carregando dashboard...</p>}
      {!loading && erro && (
        <div style={{ textAlign: 'center', padding: '60px 0', color: '#666' }}>
          <p style={{ marginBottom: 12 }}>Não foi possível carregar o dashboard. Verifique a conexão e tente novamente.</p>
          <button onClick={() => { setLoading(true); setErro(false); getDashboard().then(d => { setData(d); setErro(false); }).catch(() => setErro(true)).finally(() => setLoading(false)); }}
            style={{ background: '#1a3a5c', color: '#fff', border: 'none', borderRadius: 6, padding: '8px 18px', cursor: 'pointer', fontWeight: 600 }}>
            Tentar novamente
          </button>
        </div>
      )}

      {data && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>

          {/* 5 Etapas do ciclo de vida */}
          <div className="etapas-grid">
            {[
              {
                etapa: 'a_produzir', bg: '#1a3a5c', label: 'A Produzir',
                count: data.a_produzir, val: data.valor_a_produzir,
                sub: 'OPs emitidas aguardando início', icon: 'bi-hourglass-split',
                href: '/pedidos?status=emitido',
              },
              {
                etapa: 'ag_recebimento', bg: '#92400e', label: 'Ag. Recebimento',
                count: data.ag_recebimento, val: null,
                sub: 'enviado, aguardando setor receber', icon: 'bi-arrow-down-circle',
                href: '/kanban',
              },
              {
                etapa: 'produzindo', bg: '#1d4ed8', label: 'Produzindo',
                count: data.produzindo, val: data.valor_em_producao,
                sub: 'em trabalho nos setores', icon: 'bi-gear-fill',
                href: '/kanban',
              },
              {
                etapa: 'mat_concluido', bg: '#b45309', label: 'Mat. Concluído',
                count: data.mat_concluido, val: null,
                sub: 'produção ok, na logística', icon: 'bi-truck',
                href: '/pedidos?setor=logistica',
              },
              {
                etapa: 'entregue', bg: '#166534', label: 'Entregue',
                count: data.entregues, val: data.valor_concluido,
                sub: 'materiais entregues ao cliente', icon: 'bi-check-circle-fill',
                href: '/pedidos?etapa=entregue',
              },
            ].map((c, i) => {
              const ativo = filtroEtapa === c.etapa;
              return (
                <button key={c.etapa}
                  onClick={() => {
                    if (ativo) {
                      router.push(`/pedidos?etapa=${c.etapa}`);
                    } else {
                      setFiltroEtapa(c.etapa);
                      setTimeout(() => pedidosRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
                    }
                  }}
                  style={{ textDecoration: 'none', background: 'none', border: 'none', padding: 0, cursor: 'pointer', textAlign: 'left', width: '100%' }}>
                  <div style={{
                    background: c.bg, color: '#fff', padding: '18px 20px', borderRadius: 10, height: '100%',
                    transition: 'opacity .15s, transform .15s, box-shadow .15s',
                    outline: ativo ? '3px solid #fff' : 'none',
                    boxShadow: ativo ? `0 0 0 4px ${c.bg}, 0 0 0 6px #fff, 0 4px 20px rgba(0,0,0,.25)` : 'none',
                    transform: ativo ? 'scale(1.03)' : 'scale(1)',
                    position: 'relative',
                  }}
                    className="etapa-card">
                  {ativo && (
                    <div style={{ position: 'absolute', top: 8, right: 10, fontSize: 10, fontWeight: 700, background: 'rgba(255,255,255,.25)', borderRadius: 4, padding: '1px 6px' }}>
                      clique para ver todos →
                    </div>
                  )}
                  <div style={{ fontSize: 10, fontWeight: 700, opacity: .45, marginBottom: 4, letterSpacing: 1 }} className="etapa-label-num">
                    ETAPA {i + 1}
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div>
                      <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: .8, opacity: .8 }} className="etapa-label-titulo">{c.label}</div>
                      <div style={{ fontSize: 36, fontWeight: 800, lineHeight: 1, margin: '8px 0 4px' }} className="etapa-count">{c.count}</div>
                      {isAdmin && c.val != null && (
                        <div style={{ fontSize: 12, fontWeight: 600, opacity: .85 }} className="etapa-valor"><BRL v={c.val} /></div>
                      )}
                      <div style={{ fontSize: 10, opacity: .6, marginTop: 4 }} className="etapa-sub">{c.sub}</div>
                    </div>
                    <i className={`bi ${c.icon} etapa-icone`} style={{ fontSize: 28, opacity: .3 }}></i>
                  </div>
                  {i < 3 && (
                    <div style={{ marginTop: 10, textAlign: 'right', opacity: .35, fontSize: 11 }}>
                      próxima etapa →
                    </div>
                  )}
                  </div>
                </button>
              );
            })}
          </div>

          {/* Contadores secundários */}
          <div className="counters-grid">
            {[
              { label: 'Total em aberto', val: data.total, color: '#0d6efd', icon: 'bi-list-check', href: null },
              { label: 'Atrasados', val: data.atrasados, color: '#dc3545', icon: 'bi-exclamation-circle-fill', href: null },
              { label: 'Urgentes', val: data.urgentes, color: '#fd7e14', icon: 'bi-lightning-fill', href: null },
              { label: 'Bloqueados', val: data.bloqueados, color: '#7c3aed', icon: 'bi-slash-circle-fill', href: null },
              { label: 'Divergências', val: (data as any).divergencias_abertas ?? 0, color: '#dc2626', icon: 'bi-exclamation-triangle-fill', href: '/divergencias' },
            ].map(c => (
              c.href ? (
                <a key={c.label} href={c.href}
                  className="card"
                  style={{ padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 12, textDecoration: 'none',
                    border: (data as any).divergencias_abertas > 0 ? '2px solid #fecaca' : '2px solid transparent',
                    background: (data as any).divergencias_abertas > 0 ? '#fef2f2' : '#fff' }}>
                  <i className={`bi ${c.icon}`} style={{ fontSize: 22, color: c.color }}></i>
                  <div>
                    <div style={{ fontSize: 22, fontWeight: 700, color: c.color, lineHeight: 1 }}>{c.val}</div>
                    <div style={{ fontSize: 11, color: '#888', marginTop: 2 }}>{c.label}</div>
                  </div>
                </a>
              ) : (
                <div key={c.label} className="card" style={{ padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
                  <i className={`bi ${c.icon}`} style={{ fontSize: 22, color: c.color }}></i>
                  <div>
                    <div style={{ fontSize: 22, fontWeight: 700, color: c.color, lineHeight: 1 }}>{c.val}</div>
                    <div style={{ fontSize: 11, color: '#888', marginTop: 2 }}>{c.label}</div>
                  </div>
                </div>
              )
            ))}
          </div>

          {/* Itens por setor + Pedidos atrasados — grid-2 vira 1 col no mobile */}
          <div className="grid-2">
            {/* Itens por setor */}
            <div className="card">
              <div style={{ padding: '12px 16px', borderBottom: '1px solid #f0f0f0' }}>
                <strong style={{ fontSize: 13, color: '#333' }}>
                  <i className="bi bi-list-ul" style={{ marginRight: 6 }}></i>Itens por Setor
                </strong>
              </div>
              <div>
                {data.por_setor.length === 0 && (
                  <p style={{ color: '#999', fontSize: 13, padding: 16, margin: 0 }}>Nenhum item em produção.</p>
                )}
                {data.por_setor.map(s => (
                  <SetorRow key={s.cod} s={s} isAdmin={isAdmin} />
                ))}
              </div>
            </div>

            {/* Pedidos atrasados */}
            <div className="card">
              <div style={{ padding: '12px 16px', borderBottom: '1px solid #f0f0f0' }}>
                <strong style={{ fontSize: 13, color: '#333' }}>
                  <i className="bi bi-exclamation-triangle" style={{ marginRight: 6, color: '#fd7e14' }}></i>
                  Pedidos Atrasados
                </strong>
              </div>
              <div className="table-responsive">
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                  <thead>
                    <tr style={{ background: '#f8f9fa', borderBottom: '1px solid #e9ecef' }}>
                      {['Pedido','Cliente','Setor','Prazo'].map(h => (
                        <th key={h} style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 600, color: '#555', fontSize: 11 }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {data.pedidos_atrasados.length === 0 ? (
                      <tr><td colSpan={4} style={{ padding: 24, textAlign: 'center', color: '#198754', fontWeight: 600 }}>Nenhum pedido atrasado!</td></tr>
                    ) : data.pedidos_atrasados.map(p => (
                      <tr key={p.id} style={{ borderBottom: '1px solid #f5f5f5' }}>
                        <td style={{ padding: '8px 12px' }}>
                          <Link href={`/pedidos/${p.id}`} style={{ color: '#1a3a5c', fontWeight: 700, textDecoration: 'none' }}>{p.numero_pedido_venda}</Link>
                        </td>
                        <td style={{ padding: '8px 12px', color: '#555' }}>{p.cliente}</td>
                        <td style={{ padding: '8px 12px', color: '#888' }}>{p.nome_setor_atual}</td>
                        <td style={{ padding: '8px 12px', color: '#dc3545', fontWeight: 600 }}>{p.prazo_entrega}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* Últimas Movimentações */}
          <div className="card">
            <div style={{ padding: '12px 16px', borderBottom: '1px solid #f0f0f0', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
              <strong style={{ fontSize: 13, color: '#333', whiteSpace: 'nowrap' }}>
                <i className="bi bi-activity" style={{ marginRight: 6, color: '#0d6efd' }}></i>
                Últimas Movimentações
                <span style={{ fontSize: 11, color: '#888', fontWeight: 400, marginLeft: 8 }}>feed em tempo real</span>
              </strong>
              <div style={{ position: 'relative', flex: 1, maxWidth: 300 }}>
                {movFiltroItem ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#f0f4ff', border: '1px solid #c7d7f8', borderRadius: 6, padding: '3px 10px' }}>
                    <span style={{ fontSize: 12, fontWeight: 700, color: '#1a3a5c' }}>{movFiltroItem.codigo}</span>
                    <span style={{ fontSize: 11, color: '#555', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{movFiltroItem.pv}{movFiltroItem.op ? ` · OP ${movFiltroItem.op}` : ''}</span>
                    <button onClick={() => { setMovFiltroItem(null); setBuscaMov(''); }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#999', fontSize: 14, lineHeight: 1 }}>×</button>
                  </div>
                ) : (
                  <input
                    value={buscaMov}
                    onChange={e => setBuscaMov(e.target.value)}
                    onFocus={() => setShowMovDropdown(true)}
                    onBlur={() => setTimeout(() => setShowMovDropdown(false), 150)}
                    placeholder="Buscar produto ou pedido..."
                    style={{ width: '100%', fontSize: 12, padding: '4px 10px', borderRadius: 6, border: '1px solid #e5e7eb', outline: 'none', color: '#333', boxSizing: 'border-box' }}
                  />
                )}
                {showMovDropdown && !movFiltroItem && (() => {
                  const q = buscaMov.toLowerCase();
                  const opcoes: { codigo: string; descricao: string; pv: string; op: string }[] = [];
                  const visto = new Set<string>();
                  for (const p of pedidosData || []) {
                    for (const item of p.itens || []) {
                      const key = `${item.codigo}__${p.numero_pedido_venda}`;
                      if (visto.has(key)) continue;
                      visto.add(key);
                      if (!q || item.codigo.toLowerCase().includes(q) || (item.descricao || '').toLowerCase().includes(q) || p.numero_pedido_venda.toLowerCase().includes(q) || (p.numero_op || '').toLowerCase().includes(q)) {
                        opcoes.push({ codigo: item.codigo, descricao: item.descricao || '', pv: p.numero_pedido_venda, op: p.numero_op || '' });
                      }
                    }
                  }
                  if (opcoes.length === 0) return null;
                  return (
                    <div style={{ position: 'absolute', top: '110%', left: 0, right: 0, background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8, boxShadow: '0 4px 16px rgba(0,0,0,0.12)', zIndex: 200, maxHeight: 220, overflowY: 'auto' }}>
                      {opcoes.map((op, i) => (
                        <button key={i} onMouseDown={() => { setMovFiltroItem(op); setBuscaMov(op.codigo); setShowMovDropdown(false); }}
                          style={{ display: 'block', width: '100%', textAlign: 'left', padding: '8px 12px', background: 'none', border: 'none', cursor: 'pointer', borderBottom: '1px solid #f5f5f5' }}
                          onMouseEnter={e => (e.currentTarget.style.background = '#f8faff')}
                          onMouseLeave={e => (e.currentTarget.style.background = 'none')}>
                          <div style={{ fontWeight: 700, fontSize: 12, color: '#1a3a5c' }}>{op.codigo}</div>
                          <div style={{ fontSize: 11, color: '#888' }}>PV {op.pv}{op.op ? ` · OP ${op.op}` : ''} {op.descricao ? `· ${op.descricao}` : ''}</div>
                        </button>
                      ))}
                    </div>
                  );
                })()}
              </div>
            </div>
            <div style={{ maxHeight: 280, overflowY: 'auto' }}>
              {data.ultimas_movimentacoes.length === 0 && (
                <p style={{ color: '#999', fontSize: 13, padding: 16, margin: 0, textAlign: 'center' }}>Nenhuma movimentação registrada.</p>
              )}
              {data.ultimas_movimentacoes.filter(m => {
                if (movFiltroItem) {
                  return m.item_codigo === movFiltroItem.codigo && m.numero_pedido_venda === movFiltroItem.pv;
                }
                if (!buscaMov.trim()) return true;
                const q = buscaMov.toLowerCase();
                return (m.numero_pedido_venda || '').toLowerCase().includes(q) || (m.item_codigo || '').toLowerCase().includes(q);
              }).map((m, i) => {
                const antCor = STATUS_COR[m.status_anterior] || { bg: '#f3f4f6', text: '#555' };
                const novCor = STATUS_COR[m.status_novo] || { bg: '#dcfce7', text: '#166534' };
                return (
                  <div key={m.id ?? i} style={{
                    display: 'flex', alignItems: 'flex-start', gap: 12, padding: '10px 16px',
                    borderBottom: '1px solid #f9f9f9',
                  }}>
                    {/* Ícone */}
                    <div style={{ width: 30, height: 30, borderRadius: '50%', background: '#f0f4ff', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 2 }}>
                      <i className="bi bi-arrow-right-circle-fill" style={{ color: '#0d6efd', fontSize: 14 }} />
                    </div>
                    {/* Conteúdo */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginBottom: 3 }}>
                        <strong style={{ fontSize: 12, color: '#1a3a5c' }}>{m.numero_pedido_venda}</strong>
                        <span style={{ fontSize: 11, color: '#888' }}>·</span>
                        <span style={{ fontSize: 11, color: '#555' }}>{m.item_codigo}</span>
                        {/* Transição de status */}
                        <span style={{ fontSize: 11, padding: '1px 7px', borderRadius: 10, background: antCor.bg, color: antCor.text, fontWeight: 600 }}>
                          {m.status_anterior_display}
                        </span>
                        <i className="bi bi-arrow-right" style={{ fontSize: 10, color: '#aaa' }} />
                        <span style={{ fontSize: 11, padding: '1px 7px', borderRadius: 10, background: novCor.bg, color: novCor.text, fontWeight: 700 }}>
                          {m.status_novo_display}
                        </span>
                        {/* Setor */}
                        {m.setor_destino && (
                          <span style={{ fontSize: 11, background: '#1a3a5c', color: '#fff', padding: '1px 7px', borderRadius: 10 }}>
                            {m.setor_destino_nome || m.setor_destino}
                          </span>
                        )}
                      </div>
                      <div style={{ display: 'flex', gap: 10, fontSize: 11, color: '#aaa' }}>
                        <span><i className="bi bi-person" style={{ marginRight: 3 }} />{m.usuario_nome}</span>
                        <span><i className="bi bi-clock" style={{ marginRight: 3 }} />{new Date(m.criado_em).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</span>
                        {m.observacao && <span style={{ color: '#999', fontStyle: 'italic', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 200 }}>{m.observacao}</span>}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Últimos pedidos */}
          <div className="card" ref={pedidosRef}>
            <div style={{ padding: '12px 16px', borderBottom: '1px solid #f0f0f0', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <strong style={{ fontSize: 13, color: '#333' }}>
                  <i className="bi bi-list-ul" style={{ marginRight: 6 }}></i>
                  {filtroEtapa ? ETAPA_LABELS[filtroEtapa as keyof typeof ETAPA_LABELS] : 'Últimos Pedidos'}
                </strong>
                <span style={{
                  background: '#0d6efd', color: '#fff', fontSize: 10, fontWeight: 700,
                  padding: '1px 7px', borderRadius: 10,
                }}>{pedidosFiltrados.length}</span>
                {filtroEtapa && (
                  <button onClick={() => setFiltroEtapa(null)}
                    style={{ fontSize: 11, color: '#6b7280', background: '#f3f4f6', border: '1px solid #e5e7eb', borderRadius: 4, padding: '2px 8px', cursor: 'pointer', fontWeight: 600 }}>
                    ✕ limpar filtro
                  </button>
                )}
              </div>
              <Link href="/pedidos" style={{ fontSize: 12, color: '#0d6efd', textDecoration: 'none' }}>Ver todos</Link>
            </div>
            {/* Filtros */}
            <div style={{ padding: '10px 16px', borderBottom: '1px solid #f0f0f0', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <input value={busca} onChange={e => setBusca(e.target.value)}
                placeholder="Pedido, cliente, OP..."
                style={{ border: '1px solid #dee2e6', borderRadius: 5, padding: '6px 10px', fontSize: 13, flex: 1, minWidth: 140 }} />
              <select value={fPrioridade} onChange={e => setFPrioridade(e.target.value)}
                style={{ border: '1px solid #dee2e6', borderRadius: 5, padding: '6px 8px', fontSize: 13 }}>
                <option value="">Prioridade</option>
                {['baixa','normal','alta','urgente'].map(p => <option key={p} value={p}>{p.charAt(0).toUpperCase()+p.slice(1)}</option>)}
              </select>
              <button onClick={() => { setBusca(''); setFPrioridade(''); setFiltroEtapa(null); }}
                style={{ background: '#6c757d', color: '#fff', border: 'none', borderRadius: 5, padding: '6px 14px', fontSize: 13, cursor: 'pointer' }}>
                Limpar
              </button>
            </div>
            {/* Tabela */}
            <div className="table-responsive">
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ background: '#212529', color: '#fff' }}>
                    {['','Pedido','Cliente','Setor Atual','Status','Prioridade','Prazo','Itens'].map(h => (
                      <th key={h} style={{ padding: '9px 12px', textAlign: 'left', fontWeight: 600, fontSize: 12, whiteSpace: 'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {pedidosFiltrados.length === 0 && (
                    <tr><td colSpan={8} style={{ padding: 24, textAlign: 'center', color: '#999' }}>Nenhum pedido encontrado.</td></tr>
                  )}
                  {pedidosFiltrados.map(p => (
                    <PedidoRow key={p.id} p={p} isAdmin={isAdmin} />
                  ))}
                </tbody>
              </table>
            </div>
          </div>

        </div>
      )}
    </AuthGuard>
  );
}
