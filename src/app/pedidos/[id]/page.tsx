'use client';
import { useEffect, useState, useRef } from 'react';
import AuthGuard from '@/components/AuthGuard';
import { getPedido, itemAcao } from '@/lib/api';
import { Pedido, ItemPedido, COR_STATUS, STATUS_LABELS, PRIORIDADE_COR, SETOR_CHOICES, getEtapa, getPedidoEtapa, ETAPA_LABELS, ETAPA_COR } from '@/lib/types';
import { getUser } from '@/lib/auth';
import Link from 'next/link';
import ConfirmModal from '@/components/ConfirmModal';
import ReceberModal from '@/components/ReceberModal';
import LiberarSetorModal from '@/components/LiberarSetorModal';

const NOMES = Object.fromEntries(SETOR_CHOICES);

// Cronômetro — mostra tempo decorrido desde uma data
function Cronometro({ desde }: { desde: string }) {
  const [seg, setSeg] = useState(0);
  const ref = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    const inicio = new Date(desde).getTime();
    function tick() { setSeg(Math.floor((Date.now() - inicio) / 1000)); }
    tick();
    ref.current = setInterval(tick, 1000);
    return () => { if (ref.current) clearInterval(ref.current); };
  }, [desde]);

  const h = Math.floor(seg / 3600);
  const m = Math.floor((seg % 3600) / 60);
  const s = seg % 60;
  const txt = h > 0
    ? `${h}h ${String(m).padStart(2, '0')}m`
    : `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;

  return (
    <span style={{ fontFamily: 'monospace', fontSize: 13, fontWeight: 700, color: '#1d4ed8', background: '#dbeafe', borderRadius: 5, padding: '2px 8px' }}>
      <i className="bi bi-stopwatch" style={{ marginRight: 4 }} />{txt}
    </span>
  );
}

export default function PedidoDetalhePage({ params }: { params: { id: string } }) {
  const { id } = params;
  const [pedido, setPedido] = useState<Pedido | null>(null);
  const [loading, setLoading] = useState(true);
  const [liberando, setLiberando] = useState<number | null>(null);
  const [recebendo, setRecebendo] = useState<number | null>(null);
  const [fazendo, setFazendo] = useState<{ itemId: number; acao: string } | null>(null);
  const [envParcial, setEnvParcial] = useState<{ itemId: number; qtd: string } | null>(null);
  const [confirm, setConfirm] = useState<{ titulo: string; mensagem: string; acao: () => void; perigo?: boolean } | null>(null);
  const [liberarModal, setLiberarModal] = useState<{ itemId: number; roteiro: string[]; setorAtual: string; proximoSetor: string | null; parcial?: boolean; qtdMax?: number; unidade?: string } | null>(null);
  const user = getUser();
  const isAdmin = user?.is_staff;
  const verFinanceiro = user?.is_staff && user?.perfil !== 'lider';

  async function liberarItemConfirmado(itemId: number, setorDestino?: string, quantidade?: number) {
    setLiberando(itemId);
    setLiberarModal(null);
    const acao = quantidade ? 'enviar_parcial' : 'liberar';
    const body: Record<string, unknown> = {};
    if (setorDestino) body.setor_destino = setorDestino;
    if (quantidade) body.quantidade = quantidade;
    try { await itemAcao(itemId, acao, body); carregar(); }
    catch (e: unknown) {
      const ax = e as { response?: { status?: number; data?: { erro?: string } }; message?: string };
      const msg = ax?.response?.data?.erro || ax?.message || 'Erro ao liberar (sem detalhes)';
      const status = ax?.response?.status ? ` [${ax.response.status}]` : '';
      alert(`Erro ao liberar${status}: ${msg}`);
    }
    finally { setLiberando(null); }
  }

  function liberarItem(item: ItemPedido, parcial = false) {
    if (liberando) return;
    const roteiro = item.roteiro_efetivo?.length > 0 ? item.roteiro_efetivo : (pedido?.roteiro_base || []);
    setLiberarModal({
      itemId: item.id, roteiro, setorAtual: item.setor_atual, proximoSetor: item.proximo_setor,
      parcial, qtdMax: parcial ? Number(item.quantidade_pendente) : undefined, unidade: item.unidade,
    });
  }

  async function liberarTodosConfirmado() {
    if (!pedido) return;
    setConfirm(null);
    const emitidos = pedido!.itens.filter(i => i.status === 'emitido');
    for (const item of emitidos) {
      try { await itemAcao(item.id, 'liberar'); } catch {}
    }
    carregar();
  }

  async function acaoSimples(itemId: number, acao: string, body?: Record<string, unknown>) {
    setFazendo({ itemId, acao });
    try { await itemAcao(itemId, acao, body); carregar(); }
    catch (e: unknown) { alert((e as { response?: { data?: { erro?: string } } }).response?.data?.erro || 'Erro'); }
    finally { setFazendo(null); }
  }

  async function receberItem(itemId: number, decisao: 'iniciar' | 'preparar' | 'divergente', qtdParcial?: number, obs?: string) {
    setRecebendo(itemId);
    try {
      if (decisao === 'divergente') {
        await itemAcao(itemId, 'reprovar', { observacao: obs || 'Divergência reportada' });
      } else {
        await itemAcao(itemId, 'receber', qtdParcial ? { quantidade: qtdParcial } : {});
        if (decisao === 'iniciar') {
          await itemAcao(itemId, 'iniciar', {});
        }
      }
      carregar();
    } catch (e: unknown) {
      alert((e as { response?: { data?: { erro?: string } } }).response?.data?.erro || 'Erro ao receber item');
    } finally {
      setRecebendo(null);
    }
  }

  function carregar() {
    setLoading(true);
    getPedido(Number(id)).then(setPedido).finally(() => setLoading(false));
  }

  useEffect(() => { carregar(); }, [id]);

  if (loading || !pedido) return (
    <AuthGuard><div className="p-8 text-gray-400">Carregando...</div></AuthGuard>
  );

  const concluidos = pedido.itens.filter(i => i.status === 'entregue').length;
  const total = pedido.itens.length;
  const pct = total > 0 ? Math.round((concluidos / total) * 100) : 0;

  // Roteiro com checkmarks
  const roteiroIdx = pedido.roteiro_base.length > 0 ? pedido.roteiro_base : SETOR_CHOICES.map(([c]) => c);
  const setorAtualIdx = roteiroIdx.indexOf(pedido.setor_atual);

  return (
    <AuthGuard>
        {confirm && (
          <ConfirmModal
            titulo={confirm.titulo}
            mensagem={confirm.mensagem}
            perigo={confirm.perigo}
            onConfirm={() => confirm.acao()}
            onCancel={() => setConfirm(null)}
          />
        )}

        {/* Modal de seleção de setor para Liberar */}
        {liberarModal && <LiberarSetorModal
          roteiro={liberarModal.roteiro}
          setorAtual={liberarModal.setorAtual}
          proximoSetor={liberarModal.proximoSetor}
          parcial={liberarModal.parcial}
          qtdMax={liberarModal.qtdMax}
          unidade={liberarModal.unidade}
          onConfirm={(setor, qtd) => liberarItemConfirmado(liberarModal.itemId, setor, qtd)}
          onCancel={() => setLiberarModal(null)}
        />}

        {/* Modal de recebimento */}
        {recebendo !== null && (() => {
          const item = pedido.itens.find(i => i.id === recebendo);
          if (!item) return null;
          return (
            <ReceberModal
              itemId={item.id}
              quantidade={item.quantidade_pendente}
              unidade={item.unidade}
              setor={NOMES[item.setor_atual] || item.setor_atual}
              loading={false}
              onCancel={() => setRecebendo(null)}
              onConfirm={(decisao, qtd, obs) => {
                setRecebendo(null);
                receberItem(item.id, decisao, qtd, obs);
              }}
            />
          );
        })()}
        {/* Header */}
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-3">
            <Link href="/pedidos" className="text-gray-500 hover:text-gray-700 text-sm">← Pedidos</Link>
            <h1 className="text-xl font-bold text-gray-800">{pedido.numero_pedido_venda}</h1>
            {pedido.numero_op && <span className="text-gray-500 text-sm">· {pedido.numero_op}</span>}
            {(() => {
              const et = getPedidoEtapa(pedido);
              const ec = ETAPA_COR[et];
              return (
                <span style={{ fontSize: 11, padding: '3px 10px', borderRadius: 5, fontWeight: 700, background: ec.bg, color: ec.text, whiteSpace: 'nowrap' }}>
                  <i className={`bi ${ec.icon}`} style={{ marginRight: 4 }} />
                  {ETAPA_LABELS[et]}
                </span>
              );
            })()}
            <span className={`text-xs px-2 py-1 rounded font-semibold ${PRIORIDADE_COR[pedido.prioridade]}`}>
              {pedido.prioridade?.charAt(0).toUpperCase()+pedido.prioridade?.slice(1)}
            </span>
          </div>
          <div className="flex gap-2">
            <Link href={`/pedidos/${id}/editar`} className="btn btn-outline btn-sm">
              <i className="bi bi-pencil" /> Editar
            </Link>
            <Link href={`/pedidos/${id}/historico`} className="btn btn-outline btn-sm">
              <i className="bi bi-clock-history" /> Histórico
            </Link>
            <Link href={`/pedidos/${id}/relatorio`} className="btn btn-outline btn-sm" target="_blank">
              <i className="bi bi-file-earmark-text" /> Relatório
            </Link>
          </div>
        </div>

        <p className="text-sm text-gray-500 mb-4">
          {pedido.cliente}{pedido.vendedor ? ` · ${pedido.vendedor}` : ''} · Prazo: {pedido.prazo_entrega}
          {pedido.atrasado && <span className="ml-2 text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded font-bold">ATRASADO</span>}
        </p>

        {/* Roteiro base */}
        <div className="bg-white rounded-xl border shadow-sm p-4 mb-4">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Roteiro Base do Pedido</p>
          <div className="flex items-center gap-1 flex-wrap">
            {roteiroIdx.map((setor, i) => {
              const done = i < setorAtualIdx;
              const current = setor === pedido.setor_atual;
              return (
                <span key={setor}
                  className={`text-xs px-2 py-1 rounded flex items-center gap-1 font-medium border ${current ? 'bg-orange-500 text-white border-orange-500' : done ? 'bg-gray-800 text-white border-gray-800' : 'bg-white text-gray-400 border-gray-200'}`}>
                  {done && '✓ '}{NOMES[setor] || setor}
                </span>
              );
            })}
          </div>
        </div>

        {/* Progresso */}
        <div className="bg-white rounded-xl border shadow-sm p-4 mb-4">
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm font-semibold text-gray-700 flex items-center gap-2">
              <span>≡</span> Progresso da Produção
            </p>
            <span className="text-xs text-gray-400">{concluidos} de {total} item{total !== 1 ? 's' : ''} pronto · <span className="font-bold text-blue-600">{pct}%</span></span>
          </div>
          <div className="w-full bg-gray-100 rounded-full h-2">
            <div className="bg-blue-600 h-2 rounded-full transition-all" style={{ width: `${pct}%` }} />
          </div>
          {pct < 100 && (
            <p className="text-xs text-gray-400 mt-2">{total - concluidos} item{(total - concluidos) !== 1 ? 's' : ''} ainda em produção</p>
          )}
        </div>

        {/* Conteúdo principal */}
        <div className="grid grid-cols-3 gap-4">
          {/* Itens do Pedido (2/3) */}
          <div className="col-span-2">
            <div className="bg-white rounded-xl border shadow-sm">
              <div className="px-4 py-3 border-b flex items-center justify-between">
                <div>
                  <h2 className="font-bold text-gray-700 text-sm">Itens do Pedido</h2>
                  <p className="text-xs text-gray-400 mt-0.5">Gerencie e acompanhe cada item desta ordem</p>
                </div>
                {(() => {
                  const itensAguardando = pedido.itens.filter(i =>
                    i.status === 'aguardando' && (isAdmin || user?.setor === i.setor_atual)
                  );
                  const itensEmitidos = pedido.itens.filter(i => i.status === 'emitido');
                  return (
                    <div className="flex gap-2 items-center flex-wrap">
                      {/* Liberar todos — admin, múltiplos emitidos */}
                      {isAdmin && itensEmitidos.length > 1 && (
                        <div className="flex flex-col items-end gap-1">
                          <button className="btn btn-success btn-sm"
                            onClick={() => setConfirm({ titulo: 'Liberar todos para produção', mensagem: `Liberar os ${itensEmitidos.length} itens emitidos para o próximo setor de cada um?`, acao: liberarTodosConfirmado })}>
                            <i className="bi bi-send-fill" /> Liberar Todos ({itensEmitidos.length})
                          </button>
                          <span className="btn-hint">Libera todos os itens emitidos de uma vez</span>
                        </div>
                      )}
                      {/* Receber todos — múltiplos aguardando no setor */}
                      {itensAguardando.length > 1 && (
                        <div className="flex flex-col items-end gap-1">
                          <button className="btn btn-sm"
                            style={{ background: '#92400e', color: '#fff', border: 'none' }}
                            onClick={() => setConfirm({
                              titulo: 'Receber todos os itens',
                              mensagem: `Receber os ${itensAguardando.length} itens aguardando no setor e iniciar produção de todos?`,
                              acao: async () => {
                                setConfirm(null);
                                for (const item of itensAguardando) {
                                  try {
                                    await receberItem(item.id, 'iniciar');
                                  } catch {}
                                }
                                carregar();
                              }
                            })}>
                            <i className="bi bi-arrow-down-circle-fill" /> Receber Todos ({itensAguardando.length})
                          </button>
                          <span className="btn-hint">Recebe e inicia todos os itens aguardando</span>
                        </div>
                      )}
                      <div className="flex flex-col items-end gap-1">
                        <Link href={`/pedidos/${id}/editar`} className="btn btn-outline btn-sm">
                          <i className="bi bi-plus" /> Editar Itens
                        </Link>
                        <span className="btn-hint">Adicionar ou alterar itens</span>
                      </div>
                    </div>
                  );
                })()}
              </div>
              <div className="divide-y">
                {pedido.itens.map((item, idx) => (
                  <div key={item.id} className="p-4">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-sm text-gray-400 font-medium">{idx + 1}</span>
                          <span className={`text-xs px-2 py-0.5 rounded font-semibold ${item.cor_status === 'info' ? 'bg-blue-500 text-white' : item.cor_status === 'primary' ? 'bg-blue-600 text-white' : item.cor_status === 'success' ? 'bg-green-500 text-white' : 'bg-yellow-100 text-yellow-800'}`}>
                            {item.status_display}
                          </span>
                        </div>
                        <p className="font-semibold text-gray-800">{item.descricao}</p>
                        <div className="flex items-center gap-3 text-xs text-gray-500 mt-1">
                          <span>🔢 {item.quantidade} {item.unidade} total</span>
                          <span>👤 {item.pedido_cliente}</span>
                        </div>

                        {/* Rastreabilidade — onde estão as peças */}
                        {(() => {
                          const parciais = (item as Record<string, unknown>).parciais_por_setor as { setor: string; setor_nome: string; quantidade: string; unidade: string; status: string; retrabalho: boolean; motivo_retrabalho: string | null }[] | undefined;
                          const entregues = Number(item.quantidade_entregue || 0);
                          const hasParciais = parciais && parciais.length > 0;
                          const STATUS_COR: Record<string, { bg: string; txt: string; label: string }> = {
                            em_aberto:        { bg: '#e2e8f0', txt: '#374151', label: 'Aguardando' },
                            em_andamento:     { bg: '#fef9c3', txt: '#854d0e', label: 'Em Andamento' },
                            pausado:          { bg: '#fee2e2', txt: '#991b1b', label: 'Pausado' },
                            finalizado_setor: { bg: '#dcfce7', txt: '#14532d', label: 'Finalizado' },
                          };
                          return (
                            <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 4 }}>
                              {/* Linha de progresso visual */}
                              <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
                                {item.roteiro_efetivo.map((setor: string, i: number) => {
                                  const idxAtual = item.roteiro_efetivo.indexOf(item.setor_atual);
                                  const done = i < idxAtual;
                                  const current = setor === item.setor_atual;
                                  const temParcial = hasParciais && parciais!.some(p => p.setor === setor);
                                  return (
                                    <span key={setor} style={{
                                      fontSize: 11, padding: '2px 7px', borderRadius: 4, fontWeight: current || temParcial ? 700 : 400,
                                      background: temParcial && !current ? '#dbeafe' : current ? '#1d4ed8' : done ? '#f1f5f9' : 'transparent',
                                      color: temParcial && !current ? '#1d4ed8' : current ? '#fff' : done ? '#94a3b8' : '#cbd5e1',
                                      border: temParcial && !current ? '1px solid #93c5fd' : current ? 'none' : 'none',
                                    }}>
                                      {done && !temParcial && <span style={{ marginRight: 3 }}>✓</span>}
                                      {(current || temParcial) && <span style={{ marginRight: 3 }}>●</span>}
                                      {NOMES[setor] || setor}
                                    </span>
                                  );
                                })}
                              </div>

                              {/* Distribuição detalhada por setor */}
                              {hasParciais && (
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 2 }}>
                                  {parciais!.map((p, pi) => {
                                    const cor = STATUS_COR[p.status] || { bg: '#f1f5f9', txt: '#374151', label: p.status };
                                    return (
                                      <div key={pi} style={{ background: cor.bg, border: `1px solid ${p.retrabalho ? '#fbbf24' : '#e2e8f0'}`, borderRadius: 6, padding: '4px 10px', display: 'flex', alignItems: 'center', gap: 6 }}>
                                        <span style={{ fontSize: 12, fontWeight: 700, color: cor.txt }}>
                                          {p.retrabalho && '⚠ '}{Number(p.quantidade)} {p.unidade}
                                        </span>
                                        <span style={{ fontSize: 11, color: cor.txt }}>em <strong>{p.setor_nome}</strong></span>
                                        <span style={{ fontSize: 10, background: 'rgba(0,0,0,0.08)', borderRadius: 3, padding: '1px 5px', color: cor.txt }}>{cor.label}</span>
                                        {p.retrabalho && p.motivo_retrabalho && (
                                          <span style={{ fontSize: 10, color: '#92400e', fontStyle: 'italic' }}>"{p.motivo_retrabalho}"</span>
                                        )}
                                      </div>
                                    );
                                  })}
                                  {entregues > 0 && (
                                    <div style={{ background: '#f0fdf4', border: '1px solid #86efac', borderRadius: 6, padding: '4px 10px', display: 'flex', alignItems: 'center', gap: 6 }}>
                                      <span style={{ fontSize: 12, fontWeight: 700, color: '#15803d' }}>✓ {entregues} {item.unidade}</span>
                                      <span style={{ fontSize: 11, color: '#15803d' }}>entregues ao cliente</span>
                                    </div>
                                  )}
                                </div>
                              )}

                              {/* Sem parciais — item no setor principal */}
                              {!hasParciais && item.status !== 'entregue' && item.status !== 'emitido' && (
                                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                  <span style={{ fontSize: 12, fontWeight: 700, color: '#1d4ed8' }}>{item.quantidade_pendente} {item.unidade}</span>
                                  <span style={{ fontSize: 11, color: '#555' }}>em <strong>{item.nome_setor_atual}</strong></span>
                                  {entregues > 0 && <span style={{ fontSize: 11, color: '#15803d' }}>· ✓ {entregues} entregues</span>}
                                </div>
                              )}
                            </div>
                          );
                        })()}
                      </div>
                      <div className="flex flex-col gap-2 ml-3 items-end">
                        <Link href={`/item/${item.id}`} className="btn btn-outline btn-sm">
                          <i className="bi bi-eye" /> Ver
                        </Link>

                        {/* Liberar (admin, emitido) */}
                        {isAdmin && item.status === 'emitido' && (
                          <>
                            <span style={{ fontSize: 11, color: '#1a3a5c', background: '#f0f7ff', border: '1px solid #b6d4fe', borderRadius: 5, padding: '3px 10px', fontWeight: 500 }}>
                              <i className="bi bi-arrow-right" /> {item.proximo_setor ? (NOMES[item.proximo_setor] || item.proximo_setor) : '—'}
                            </span>
                            <div className="flex gap-1">
                              <button className="btn btn-success btn-sm"
                                onClick={() => liberarItem(item)} disabled={liberando === item.id}>
                                <i className="bi bi-send" /> {liberando === item.id ? 'Liberando...' : 'Liberar'}
                              </button>
                              {Number(item.quantidade_pendente) > 1 && (
                                <button className="btn btn-sm" style={{ background: '#0d6efd', color: '#fff', border: 'none' }}
                                  onClick={() => liberarItem(item, true)} disabled={liberando === item.id}>
                                  <i className="bi bi-scissors" /> Parcial
                                </button>
                              )}
                            </div>
                          </>
                        )}

                        {/* Receber (aguardando) */}
                        {item.status === 'aguardando' && (isAdmin || user?.setor === item.setor_atual) && (
                          <button className="btn btn-sm"
                            style={{ background: '#92400e', color: '#fff', border: 'none' }}
                            onClick={() => setRecebendo(item.id)}>
                            <i className="bi bi-arrow-down-circle" /> Receber
                          </button>
                        )}

                        {/* Iniciar (recebido) */}
                        {item.status === 'recebido' && (isAdmin || user?.setor === item.setor_atual) && (
                          <button className="btn btn-sm"
                            style={{ background: '#16a34a', color: '#fff', border: 'none' }}
                            disabled={fazendo?.itemId === item.id}
                            onClick={() => acaoSimples(item.id, 'iniciar')}>
                            <i className="bi bi-play-fill" /> {fazendo?.itemId === item.id ? 'Aguarde...' : 'Iniciar'}
                          </button>
                        )}

                        {/* Em andamento: cronômetro + pausar + finalizar */}
                        {item.status === 'em_andamento' && (
                          <>
                            {(() => {
                              const mov = item.movimentacoes?.find(m => m.status_novo === 'em_andamento');
                              return mov ? <Cronometro desde={mov.criado_em} /> : null;
                            })()}
                            {(isAdmin || user?.setor === item.setor_atual) && (
                              <div className="flex gap-1">
                                <button className="btn btn-sm"
                                  style={{ background: '#fd7e14', color: '#fff', border: 'none' }}
                                  disabled={fazendo?.itemId === item.id}
                                  onClick={() => acaoSimples(item.id, 'pausar')}>
                                  <i className="bi bi-pause-fill" /> Pausar
                                </button>
                                <button className="btn btn-sm"
                                  style={{ background: '#1a3a5c', color: '#fff', border: 'none' }}
                                  disabled={fazendo?.itemId === item.id}
                                  onClick={() => acaoSimples(item.id, 'finalizar')}>
                                  <i className="bi bi-check-lg" /> Finalizar
                                </button>
                              </div>
                            )}
                          </>
                        )}

                        {/* Pausado: retomar + finalizar */}
                        {item.status === 'pausado' && (isAdmin || user?.setor === item.setor_atual) && (
                          <div className="flex gap-1">
                            <button className="btn btn-sm"
                              style={{ background: '#16a34a', color: '#fff', border: 'none' }}
                              disabled={fazendo?.itemId === item.id}
                              onClick={() => acaoSimples(item.id, 'retomar')}>
                              <i className="bi bi-play-fill" /> Retomar
                            </button>
                            <button className="btn btn-sm"
                              style={{ background: '#1a3a5c', color: '#fff', border: 'none' }}
                              disabled={fazendo?.itemId === item.id}
                              onClick={() => acaoSimples(item.id, 'finalizar')}>
                              <i className="bi bi-check-lg" /> Finalizar
                            </button>
                          </div>
                        )}

                        {/* Finalizado: enviar tudo / parcial */}
                        {item.status === 'finalizado_setor' && (isAdmin || user?.setor === item.setor_atual) && item.setor_atual !== 'logistica' && item.proximo_setor && (
                          <div className="flex gap-1">
                            <button className="btn btn-sm"
                              style={{ background: '#1a3a5c', color: '#fff', border: 'none' }}
                              disabled={fazendo?.itemId === item.id}
                              onClick={() => setConfirm({ titulo: 'Enviar para próximo setor', mensagem: `Enviar todas as ${item.quantidade_pendente} ${item.unidade} para ${item.proximo_setor ? (NOMES[item.proximo_setor] || item.proximo_setor) : 'próximo setor'}?`, acao: () => acaoSimples(item.id, 'enviar_tudo', { setor_destino: item.proximo_setor }) })}>
                              <i className="bi bi-send-fill" /> Enviar
                            </button>
                            <button className="btn btn-sm"
                              style={{ background: '#0d6efd', color: '#fff', border: 'none' }}
                              onClick={() => setEnvParcial({ itemId: item.id, qtd: '' })}>
                              <i className="bi bi-scissors" /> Parcial
                            </button>
                          </div>
                        )}

                        {/* Entrega: apenas via página da Logística */}
                      </div>
                    </div>
                    {/* Enviar parcial inline */}
                    {envParcial?.itemId === item.id && (
                      <div style={{ marginTop: 10, background: '#f0f7ff', border: '1px solid #b6d4fe', borderRadius: 8, padding: '12px 14px', display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                        <span style={{ fontSize: 12, color: '#1a3a5c', fontWeight: 600 }}>Qtd a enviar:</span>
                        <input type="number" value={envParcial.qtd}
                          onChange={e => setEnvParcial({ itemId: item.id, qtd: e.target.value })}
                          placeholder={`1–${item.quantidade_pendente}`} min={1}
                          style={{ border: '1px solid #b6d4fe', borderRadius: 6, padding: '5px 8px', fontSize: 14, fontWeight: 700, width: 80 }} />
                        <span style={{ fontSize: 12, color: '#555' }}>{item.unidade} de {item.quantidade_pendente}</span>
                        <button onClick={() => { acaoSimples(item.id, 'enviar_parcial', { quantidade: Number(envParcial.qtd) }); setEnvParcial(null); }}
                          disabled={!envParcial.qtd || Number(envParcial.qtd) <= 0 || Number(envParcial.qtd) >= Number(item.quantidade_pendente)}
                          style={{ background: '#0d6efd', color: '#fff', border: 'none', borderRadius: 6, padding: '5px 14px', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
                          Confirmar
                        </button>
                        <button onClick={() => setEnvParcial(null)}
                          style={{ background: 'none', border: '1px solid #dee2e6', borderRadius: 6, padding: '5px 10px', fontSize: 12, color: '#888', cursor: 'pointer' }}>
                          ✕
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Sidebar direita (1/3) */}
          <div className="space-y-4">
            {/* Card do pedido */}
            <div className={`rounded-xl border-2 p-4 ${pedido.atrasado ? 'border-red-300 bg-red-50' : 'border-yellow-300 bg-yellow-50'}`}>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide text-center mb-2">Pedido</p>
              <p className="font-bold text-gray-800 text-center break-all" style={{ fontSize: 'clamp(13px, 3vw, 28px)', lineHeight: 1.2 }}>{pedido.numero_pedido_venda}</p>
              <div className="text-center mt-2">
                {(() => {
                  const et = getPedidoEtapa(pedido);
                  const ec = ETAPA_COR[et];
                  return (
                    <span style={{ fontSize: 11, padding: '3px 10px', borderRadius: 5, fontWeight: 700, background: ec.bg, color: ec.text }}>
                      <i className={`bi ${ec.icon}`} style={{ marginRight: 4 }} />
                      {ETAPA_LABELS[et]}
                    </span>
                  );
                })()}
              </div>
              <div className="mt-3 space-y-1 text-xs text-gray-600">
                <div className="flex items-center gap-1">
                  <span>📅</span>
                  <span>Prazo: <strong>{pedido.prazo_entrega}</strong>{pedido.atrasado && <span className="text-red-600 font-bold ml-1">({Math.abs(pedido.dias_prazo)} dias atrasado)</span>}</span>
                </div>
                <div className="flex items-center gap-1">
                  <span>📦</span>
                  <span>{total} item{total !== 1 ? 's' : ''} · {concluidos} concluído{concluidos !== 1 ? 's' : ''}</span>
                </div>
                {verFinanceiro && pedido.valor_calculado && (
                  <div className="flex items-center gap-1">
                    <span>💰</span>
                    <span>R$ {Number(pedido.valor_calculado).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Histórico */}
            <div className="bg-white rounded-xl border shadow-sm">
              <div className="px-4 py-3 border-b flex items-center justify-between">
                <h2 className="font-bold text-gray-700 text-sm">Histórico do Pedido</h2>
                <button className="text-xs text-blue-600 hover:underline">Ver tudo</button>
              </div>
              <div className="p-3 space-y-3 max-h-64 overflow-y-auto">
                {pedido.itens.flatMap(i => i.movimentacoes || []).slice(0, 10).map((m, idx) => (
                  <div key={idx} className="flex gap-2 text-xs">
                    <div className="w-5 h-5 rounded-full bg-blue-600 text-white flex items-center justify-center font-bold flex-shrink-0 text-xs mt-0.5">
                      {idx + 1}
                    </div>
                    <div>
                      <p className="font-medium text-gray-700">{m.status_novo_display}</p>
                      <p className="text-gray-400">{new Date(m.criado_em).toLocaleString('pt-BR')} · {m.usuario_nome}</p>
                      {m.observacao && <p className="text-gray-500 italic">{m.observacao}</p>}
                    </div>
                  </div>
                ))}
                {pedido.itens.every(i => !i.movimentacoes?.length) && (
                  <p className="text-gray-400 text-xs text-center py-2">Nenhum histórico disponível.</p>
                )}
              </div>
            </div>
          </div>
        </div>
    </AuthGuard>
  );
}
