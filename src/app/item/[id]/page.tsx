'use client';
import { useEffect, useState } from 'react';
import AuthGuard from '@/components/AuthGuard';
import { getItem, itemAcao, parcialAcao, getCachedSync } from '@/lib/api';
import { ItemPedido, SETOR_CHOICES, STATUS_LABELS, PRIORIDADE_COR, NOMES } from '@/lib/types';
import { getUser } from '@/lib/auth';
import { fmtData, fmtQtd } from '@/lib/format';
import Link from 'next/link';
import ReceberModal from '@/components/ReceberModal';
import DespacharModal from '@/components/DespacharModal';
import EntregarModal from '@/components/EntregarModal';
import AnexarComprovanteModal from '@/components/AnexarComprovanteModal';
import ConfirmModal from '@/components/ConfirmModal';
import ProgressoRoteiro, { RoteiroCirculo } from '@/components/workspace/ProgressoRoteiro';
import LinhaDoTempo from '@/components/workspace/LinhaDoTempo';
import OndeEstaoPecas from '@/components/workspace/OndeEstaoPecas';
import RastreabilidadeParciais from '@/components/workspace/RastreabilidadeParciais';

function corStatusClass(cor: string): string {
  if (cor === 'info')    return 'bg-blue-500 text-white';
  if (cor === 'success') return 'bg-green-500 text-white';
  if (cor === 'warning') return 'bg-yellow-100 text-yellow-800';
  if (cor === 'danger')  return 'bg-red-100 text-red-700';
  return 'bg-gray-100 text-gray-700';
}

export default function ItemDetalhePage({ params }: { params: { id: string } }) {
  const { id } = params;
  const [item, setItem] = useState<ItemPedido | null>(() => getCachedSync<ItemPedido>(`item:${id}`));
  const [loading, setLoading] = useState(false);
  const [atuando, setAtuando] = useState(false);
  const [qtdParcial, setQtdParcial] = useState('');
  const [showParcial, setShowParcial] = useState(false);
  const [showReceber, setShowReceber] = useState(false);
  const [showDespachar, setShowDespachar] = useState(false);
  const [showEntregar, setShowEntregar] = useState(false);
  const [showAnexar, setShowAnexar] = useState(false);
  const [setorDev, setSetorDev] = useState('');
  const [showDevolver, setShowDevolver] = useState(false);
  const [obs, setObs] = useState('');
  const [setorDestinoEnvio, setSetorDestinoEnvio] = useState('');
  const [confirmModal, setConfirmModal] = useState<{ titulo: string; mensagem: string; acao: () => void } | null>(null);
  const [erroAcao, setErroAcao] = useState('');

  function carregar() {
    getItem(Number(id)).then(d => { setItem(d); setLoading(false); }).catch(() => setLoading(false));
  }

  useEffect(() => {
    if (!item) setLoading(true);
    carregar();
  }, [id]);

  async function acao(a: string, body?: Record<string, unknown>) {
    setAtuando(true);
    setErroAcao('');
    try { await itemAcao(Number(id), a, body); carregar(); }
    catch (e: unknown) {
      const ax = e as { response?: { data?: { erro?: string } } };
      setErroAcao(ax?.response?.data?.erro || 'Erro ao executar ação. Tente novamente.');
    }
    finally { setAtuando(false); }
  }

  function reativarParcial(parcialId: number) {
    setConfirmModal({
      titulo: 'Reativar Parcial',
      mensagem: `Deseja reabrir a parcial #${parcialId} como Em Andamento?`,
      acao: async () => {
        setAtuando(true);
        try { await parcialAcao(parcialId, 'retomar'); carregar(); }
        catch (e: unknown) {
          alert((e as { response?: { data?: { erro?: string } } }).response?.data?.erro || 'Erro');
        }
        finally { setAtuando(false); }
      },
    });
  }

  const isAdmin = getUser()?.is_staff;

  if (loading || !item) return (
    <AuthGuard><div className="p-8 text-gray-400">Carregando...</div></AuthGuard>
  );

  const roteiro = item.roteiro_efetivo || [];
  const entregue = item.status === 'entregue';
  const idxAtual = entregue ? roteiro.length : roteiro.indexOf(item.setor_atual);

  // Quantities per sector via parciais (fallback to lotes)
  const qtdAtivaPorSetor: Record<string, number> = {};
  const qtdConcluidaPorSetor: Record<string, number> = {};
  const parciais = item.parciais || [];
  const parciaisNaoCanceladas = parciais.filter(p => p.status !== 'cancelada');

  if (parciaisNaoCanceladas.length > 0) {
    parciaisNaoCanceladas.forEach(p => {
      const qtd = Number(p.quantidade);
      if (p.status === 'concluida' && !p.parcial_origem_id) {
        // Parcial principal concluída: histórico de passagem pelo setor
        qtdConcluidaPorSetor[p.setor_atual] = (qtdConcluidaPorSetor[p.setor_atual] || 0) + qtd;
      } else {
        // Ativa ou split concluído: peças ainda fisicamente presentes no setor
        qtdAtivaPorSetor[p.setor_atual] = (qtdAtivaPorSetor[p.setor_atual] || 0) + qtd;
      }
    });
  } else if (!entregue) {
    qtdAtivaPorSetor[item.setor_atual] = Number(item.quantidade_pendente);
    (item.lotes || []).filter(l => l.status !== 'concluido').forEach(l => {
      qtdAtivaPorSetor[l.setor_destino] = (qtdAtivaPorSetor[l.setor_destino] || 0) + Number(l.quantidade);
    });
  }

  // Quantidade real no setor atual: soma de TODAS as parciais ativas (inclui splits)
  // Ex: 25 un parcial + 75 un principal = 100 un em Inspeção de Qualidade
  const qtdNoSetorAtual = qtdAtivaPorSetor[item.setor_atual] ?? Number(item.quantidade_pendente);

  const circulos: RoteiroCirculo[] = roteiro.map((setor, i) => ({
    setor,
    done: entregue || i < idxAtual,
    current: !entregue && setor === item.setor_atual,
  }));

  return (
    <AuthGuard>
      <div className="px-6 py-4">
        {confirmModal && (
          <ConfirmModal
            titulo={confirmModal.titulo}
            mensagem={confirmModal.mensagem}
            confirmLabel="Confirmar"
            onConfirm={() => { confirmModal.acao(); setConfirmModal(null); }}
            onCancel={() => setConfirmModal(null)}
          />
        )}
        {/* ── Header ──────────────────────────────────────────────────────── */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-3 flex-wrap">
            {isAdmin
              ? <Link href={`/pedidos/${item.pedido_id}`} className="border border-gray-300 text-gray-600 text-xs px-3 py-1.5 rounded hover:bg-gray-50">← Pedido {item.pedido_numero}</Link>
              : <span className="border border-gray-200 text-gray-500 text-xs px-3 py-1.5 rounded">Pedido {item.pedido_numero}</span>
            }
            <span className="text-gray-500 font-semibold">{item.codigo}</span>
            <span className={`text-xs px-2 py-1 rounded font-bold ${corStatusClass(item.cor_status)}`}>
              {STATUS_LABELS[item.status]}
            </span>
          </div>
          {isAdmin && (
            <button onClick={() => setShowDevolver(v => !v)}
              title="Mover o item para qualquer setor, fora da ordem normal do roteiro."
              className="border border-yellow-400 text-yellow-700 text-xs px-3 py-1.5 rounded hover:bg-yellow-50">
              ✏ Alterar caminho
            </button>
          )}
        </div>

        <p className="text-sm text-gray-500 mb-4">
          {item.descricao} · <strong>{fmtQtd(qtdNoSetorAtual)} {item.unidade}</strong> neste setor
          {isAdmin && ` · ${item.pedido_cliente}`}
        </p>

        {/* ── Roteiro ─────────────────────────────────────────────────────── */}
        <ProgressoRoteiro
          circulos={circulos}
          isAdmin={!!isAdmin}
          setorAtualNome={entregue ? 'Entregue' : (NOMES[item.setor_atual] || item.setor_atual)}
          statusLabel={STATUS_LABELS[item.status]}
          corStatus={item.cor_status}
        />

        {/* ── 3 colunas ───────────────────────────────────────────────────── */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">

          {/* COLUNA ESQUERDA */}
          <div className="space-y-4">
            {/* Localização atual */}
            <div className="bg-white rounded-xl border shadow-sm p-4 text-center">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Localização Atual</p>
              <p className="text-2xl font-bold text-[#1a3a5c]">
                {entregue ? 'Entregue' : (NOMES[item.setor_atual] || item.setor_atual || '—')}
              </p>
              <div className="mt-2">
                <span className={`text-xs px-3 py-1 rounded-full font-bold ${
                  item.cor_status === 'warning' ? 'bg-yellow-400 text-white' : corStatusClass(item.cor_status)
                }`}>
                  {STATUS_LABELS[item.status]}
                </span>
              </div>
              <p className="text-xs text-gray-400 mt-2">👤 {item.pedido_cliente}</p>
            </div>

            {/* Dados do item */}
            <div className="bg-white rounded-xl border shadow-sm p-4">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Dados do Item</p>
              <div className="space-y-2 text-sm">
                <div><span className="text-gray-400 text-xs">Código</span><p className="font-semibold">{item.codigo}</p></div>
                <div><span className="text-gray-400 text-xs">Descrição</span><p className="font-semibold">{item.descricao}</p></div>
                <div>
                  <span className="text-gray-400 text-xs">Quantidade neste setor</span>
                  <p className="font-bold text-2xl text-blue-700">{fmtQtd(qtdNoSetorAtual)} <span className="text-base font-medium text-blue-400">{item.unidade}</span></p>
                  {qtdNoSetorAtual !== Number(item.quantidade_pendente) && (
                    <p className="text-xs text-gray-400 mt-0.5">
                      inclui {fmtQtd(qtdNoSetorAtual - Number(item.quantidade_pendente))} {item.unidade} de envio parcial anterior
                    </p>
                  )}
                  {item.quantidade && (
                    <p className="text-xs text-gray-400">de {fmtQtd(item.quantidade)} {item.unidade} totais no pedido</p>
                  )}
                </div>
                {isAdmin && (
                  <>
                    <div>
                      <span className="text-gray-400 text-xs">Pedido</span>
                      <p>
                        <Link href={`/pedidos/${item.pedido_id}`} className="font-semibold text-blue-700 hover:underline">{item.pedido_numero}</Link>
                        <span className="text-gray-500 ml-1">· {item.pedido_cliente}</span>
                      </p>
                    </div>
                    <div><span className="text-gray-400 text-xs">Prazo</span><p className="font-semibold">{fmtData(item.pedido_prazo)}</p></div>
                    <div>
                      <span className="text-gray-400 text-xs">Prioridade</span>
                      <span className={`text-xs px-2 py-0.5 rounded font-medium ${PRIORIDADE_COR[item.pedido_prioridade]}`}>
                        {item.pedido_prioridade?.charAt(0).toUpperCase() + item.pedido_prioridade?.slice(1)}
                      </span>
                    </div>
                    {item.valor_unitario && (
                      <div>
                        <span className="text-gray-400 text-xs">Valor unit.</span>
                        <p className="font-semibold text-green-700">
                          R$ {Number(item.valor_unitario).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                        </p>
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>

            {/* Onde estão as peças — admin only */}
            {isAdmin && (
              <OndeEstaoPecas
                roteiro={roteiro}
                idxAtual={idxAtual}
                qtdAtivaPorSetor={qtdAtivaPorSetor}
                qtdConcluidaPorSetor={qtdConcluidaPorSetor}
                setorAtual={item.setor_atual}
                status={item.status}
                corStatus={item.cor_status}
                unidade={item.unidade}
                qtdTotal={item.quantidade}
                qtdEntregue={item.quantidade_entregue}
                entregue={entregue}
              />
            )}
          </div>

          {/* COLUNA CENTRAL — AÇÕES */}
          <div className="space-y-3">
            {entregue && (
              <div className="bg-green-50 border border-green-200 rounded-xl p-5 text-center">
                <i className="bi bi-check-circle-fill text-green-600 text-4xl" />
                <p className="font-bold text-green-700 mt-2 mb-1 text-base">Item Entregue</p>
                <p className="text-xs text-gray-500 mb-3">Este item foi entregue ao cliente pela logística.</p>
                <button onClick={() => setShowAnexar(true)}
                  className="bg-white text-green-700 border border-green-300 rounded px-4 py-1.5 text-xs font-semibold hover:bg-green-50">
                  <i className="bi bi-paperclip mr-1" />Anexar comprovante
                </button>
              </div>
            )}

            {showAnexar && (
              <AnexarComprovanteModal
                itemId={item.id}
                pedidoNumero={item.pedido_numero}
                onClose={() => setShowAnexar(false)}
                onSuccess={() => { setShowAnexar(false); carregar(); }}
              />
            )}

            <div className="bg-white rounded-xl border shadow-sm p-4">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Ações</p>
              {erroAcao && (
                <div className="mb-3 px-3 py-2.5 rounded-lg bg-red-50 border border-red-200 flex items-start gap-2">
                  <span className="text-red-500 text-sm font-bold flex-shrink-0">⚠</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-red-700 text-xs font-semibold">Erro ao executar ação</p>
                    <p className="text-red-600 text-xs mt-0.5">{erroAcao}</p>
                  </div>
                  <button onClick={() => setErroAcao('')} className="text-red-400 hover:text-red-600 text-xs flex-shrink-0">✕</button>
                </div>
              )}
              <div className="space-y-2">

                {!entregue && item.status === 'emitido' && (
                  <button onClick={() => acao('liberar')} disabled={atuando}
                    className="w-full bg-green-600 text-white px-4 py-2.5 rounded text-sm font-semibold text-left hover:bg-green-700 disabled:opacity-60">
                    ▶ Liberar para produção
                  </button>
                )}

                {!entregue && item.status === 'aguardando' && !showReceber && (
                  <button onClick={() => setShowReceber(true)} disabled={atuando}
                    className="w-full bg-blue-600 text-white px-4 py-2.5 rounded text-sm font-semibold text-left hover:bg-blue-700 disabled:opacity-60">
                    <i className="bi bi-box-arrow-in-down mr-2" />Receber no setor
                  </button>
                )}

                {!entregue && item.status === 'aguardando' && showReceber && (
                  <ReceberModal
                    quantidade={item.quantidade_pendente}
                    unidade={item.unidade}
                    setor={item.nome_setor_atual}
                    ocultarIniciar={item.setor_atual === 'logistica'}
                    loading={atuando}
                    onCancel={() => setShowReceber(false)}
                    onConfirm={async (decisao, qtd, obsR) => {
                      setShowReceber(false);
                      if (decisao === 'divergente') {
                        await acao('reprovar', { observacao: obsR || 'Divergência reportada' });
                      } else {
                        await acao('receber', qtd ? { quantidade: qtd } : undefined);
                        if (decisao === 'iniciar') await acao('iniciar', {});
                      }
                    }}
                  />
                )}

                {!entregue && item.status === 'recebido' && item.setor_atual !== 'logistica' && (
                  <button onClick={() => acao('iniciar')} disabled={atuando}
                    className="w-full bg-green-600 text-white px-4 py-2.5 rounded text-sm font-semibold text-left hover:bg-green-700 disabled:opacity-60">
                    ▶ Iniciar produção
                  </button>
                )}

                {!entregue && item.status === 'recebido' && item.setor_atual === 'logistica' && (
                  <button onClick={() => setShowDespachar(true)} disabled={atuando}
                    className="w-full text-white px-4 py-2.5 rounded text-sm font-semibold text-left disabled:opacity-60"
                    style={{ background: '#fd7e14' }}>
                    <i className="bi bi-truck mr-2" />Despachar
                  </button>
                )}

                {!entregue && item.status === 'em_andamento' && (
                  <>
                    <button onClick={() => setConfirmModal({
                      titulo: 'Finalizar Etapa',
                      mensagem: `Confirma que a etapa de ${item.nome_setor_atual || item.setor_atual} foi concluída para este item?`,
                      acao: () => acao('finalizar'),
                    })} disabled={atuando}
                      className="w-full bg-green-600 text-white px-4 py-2.5 rounded text-sm font-semibold text-left hover:bg-green-700 disabled:opacity-60">
                      {atuando ? '⏳ Processando...' : '✓ Finalizar etapa'}
                    </button>
                    <button onClick={() => acao('pausar')} disabled={atuando}
                      className="w-full bg-yellow-500 text-white px-4 py-2.5 rounded text-sm font-semibold text-left hover:bg-yellow-600 disabled:opacity-60">
                      ⏸ Pausar
                    </button>
                    {item.setor_atual !== 'logistica' && (
                      <>
                        <div>
                          <label className="block text-xs text-gray-500 mb-1">Enviar parcial para:</label>
                          <select value={setorDestinoEnvio || item.proximo_setor || ''} onChange={e => setSetorDestinoEnvio(e.target.value)}
                            className="w-full border rounded px-2 py-1.5 text-sm mb-2">
                            {SETOR_CHOICES.filter(([cod]) => cod !== item.setor_atual).map(([cod, nome]) => (
                              <option key={cod} value={cod}>
                                {nome}{cod === item.proximo_setor ? ' (próximo no roteiro)' : ''}
                              </option>
                            ))}
                          </select>
                        </div>
                        <button onClick={() => setShowParcial(v => !v)}
                          className="w-full bg-blue-500 text-white px-4 py-2.5 rounded text-sm font-semibold text-left hover:bg-blue-600 disabled:opacity-60">
                          ▶ Enviar parcial
                        </button>
                      </>
                    )}
                  </>
                )}

                {!entregue && item.status === 'pausado' && (
                  <button onClick={() => acao('retomar')} disabled={atuando}
                    className="w-full bg-green-600 text-white px-4 py-2.5 rounded text-sm font-semibold text-left hover:bg-green-700 disabled:opacity-60">
                    ▶ Retomar
                  </button>
                )}

                {!entregue && item.status === 'finalizado_setor' && item.setor_atual !== 'logistica' && (
                  <>
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">Enviar para:</label>
                      <select value={setorDestinoEnvio || item.proximo_setor || ''} onChange={e => setSetorDestinoEnvio(e.target.value)}
                        className="w-full border rounded px-2 py-1.5 text-sm mb-2">
                        {SETOR_CHOICES.filter(([cod]) => cod !== item.setor_atual).map(([cod, nome]) => (
                          <option key={cod} value={cod}>
                            {nome}{cod === item.proximo_setor ? ' (próximo no roteiro)' : ''}
                          </option>
                        ))}
                      </select>
                    </div>
                    <button onClick={() => acao('enviar_tudo', { setor_destino: setorDestinoEnvio || item.proximo_setor })} disabled={atuando}
                      className="w-full bg-[#1a3a5c] text-white px-4 py-2.5 rounded text-sm font-semibold text-left hover:opacity-90 disabled:opacity-60">
                      ▶ Enviar tudo
                    </button>
                    <button onClick={() => setShowParcial(v => !v)}
                      className="w-full bg-blue-500 text-white px-4 py-2.5 rounded text-sm font-semibold text-left hover:bg-blue-600">
                      ▶ Enviar parcial
                    </button>
                    <button onClick={() => acao('retomar')} disabled={atuando}
                      className="w-full bg-yellow-500 text-white px-4 py-2.5 rounded text-sm font-semibold text-left hover:bg-yellow-600 disabled:opacity-60">
                      ↩ Retomar etapa
                    </button>
                  </>
                )}

                {!entregue && item.setor_atual === 'logistica' && ['finalizado_setor', 'em_transito'].includes(item.status) && (
                  <button onClick={() => setShowEntregar(true)} disabled={atuando}
                    className="w-full bg-emerald-600 text-white px-4 py-2.5 rounded text-sm font-semibold text-left hover:bg-emerald-700 disabled:opacity-60">
                    ✓ Confirmar entrega
                  </button>
                )}

                {/* Devolver — admin only */}
                {!entregue && isAdmin && ['aguardando','recebido','em_andamento','pausado','finalizado_setor'].includes(item.status) && (
                  <button onClick={() => setShowDevolver(v => !v)}
                    className="w-full bg-gray-100 text-gray-700 border border-gray-200 px-4 py-2.5 rounded text-sm font-semibold text-left hover:bg-gray-200">
                    <i className="bi bi-arrow-return-left mr-2" />Devolver para setor
                  </button>
                )}
              </div>

              {/* Painel enviar parcial */}
              {showParcial && (
                <div className="mt-3 space-y-2 border-t pt-3">
                  <p className="text-xs font-semibold text-gray-600">Quantidade a enviar:</p>
                  <input type="number" value={qtdParcial} onChange={e => setQtdParcial(e.target.value)}
                    placeholder={`Max: ${fmtQtd(qtdNoSetorAtual)}`}
                    className="border rounded px-3 py-2 text-sm w-full" />
                  <button onClick={() => { acao('enviar_parcial', { quantidade: Number(qtdParcial), setor_destino: setorDestinoEnvio || item.proximo_setor }); setShowParcial(false); }}
                    className="bg-blue-600 text-white px-4 py-2 rounded text-sm font-semibold w-full">
                    Confirmar envio parcial
                  </button>
                </div>
              )}

              {/* Painel devolver — admin */}
              {showDevolver && (
                <div className="mt-3 space-y-2 border-t pt-3">
                  <p className="text-xs font-semibold text-gray-600">Selecionar setor de destino:</p>
                  <select value={setorDev} onChange={e => setSetorDev(e.target.value)}
                    className="border rounded px-3 py-2 text-sm w-full">
                    <option value="">Selecione o setor...</option>
                    {SETOR_CHOICES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                  </select>
                  <input value={obs} onChange={e => setObs(e.target.value)} placeholder="Motivo..."
                    className="border rounded px-3 py-2 text-sm w-full" />
                  <button onClick={() => { if (setorDev) { acao('devolver', { setor_destino: setorDev, observacao: obs }); setShowDevolver(false); } }}
                    className="bg-red-600 text-white px-4 py-2 rounded text-sm font-semibold w-full">
                    Confirmar devolução
                  </button>
                </div>
              )}
            </div>

            {showDespachar && (
              <DespacharModal
                itemId={item.id} itemCodigo={item.codigo} pedidoNumero={item.pedido_numero}
                onClose={() => setShowDespachar(false)}
                onSuccess={() => { setShowDespachar(false); carregar(); }}
              />
            )}
            {showEntregar && (
              <EntregarModal
                itemId={item.id} pedidoNumero={item.pedido_numero} descricao={item.descricao}
                quantidade={item.quantidade_pendente} unidade={item.unidade}
                onCancel={() => setShowEntregar(false)}
                onConfirm={() => { setShowEntregar(false); carregar(); }}
              />
            )}
          </div>

          {/* COLUNA DIREITA — LINHA DO TEMPO */}
          <LinhaDoTempo movimentacoes={item.movimentacoes || []} />
        </div>

        {/* ── Rastreabilidade ──────────────────────────────────────────────── */}
        <RastreabilidadeParciais
          parciais={parciais}
          rastreio={item.rastreio}
          unidade={item.unidade}
          isAdmin={!!isAdmin}
          onReativar={reativarParcial}
          loading={atuando}
        />
      </div>
    </AuthGuard>
  );
}
