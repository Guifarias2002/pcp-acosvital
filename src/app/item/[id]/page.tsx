'use client';
import { useEffect, useState } from 'react';
import AuthGuard from '@/components/AuthGuard';
import { getItem, itemAcao } from '@/lib/api';
import { ItemPedido, SETOR_CHOICES, STATUS_LABELS, PRIORIDADE_COR } from '@/lib/types';
import { getUser } from '@/lib/auth';
import Link from 'next/link';
import ReceberModal from '@/components/ReceberModal';
import DespacharModal from '@/components/DespacharModal';
import EntregarModal from '@/components/EntregarModal';
import AnexarComprovanteModal from '@/components/AnexarComprovanteModal';

const NOMES = Object.fromEntries(SETOR_CHOICES);

function fmtData(s: string) {
  if (!s) return '—';
  const d = new Date(s);
  if (isNaN(d.getTime())) return s;
  return d.toLocaleDateString('pt-BR');
}

function fmtHora(s: string) {
  if (!s) return '';
  const d = new Date(s);
  if (isNaN(d.getTime())) return s;
  return d.toLocaleString('pt-BR');
}

export default function ItemDetalhePage({ params }: { params: { id: string } }) {
  const { id } = params;
  const [item, setItem] = useState<ItemPedido | null>(null);
  const [loading, setLoading] = useState(true);
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

  function carregar() {
    setLoading(true);
    getItem(Number(id)).then(setItem).finally(() => setLoading(false));
  }

  useEffect(() => { carregar(); }, [id]);

  async function acao(a: string, body?: Record<string, unknown>) {
    setAtuando(true);
    try { await itemAcao(Number(id), a, body); carregar(); }
    catch (e: unknown) { alert((e as { response?: { data?: { erro?: string } } }).response?.data?.erro || 'Erro'); setAtuando(false); }
  }

  const isAdmin = getUser()?.is_staff;

  if (loading || !item) return (
    <AuthGuard><div className="p-8 text-gray-400">Carregando...</div></AuthGuard>
  );

  const roteiro = item.roteiro_efetivo || [];
  const entregue = item.status === 'entregue';
  const idxAtual = entregue ? roteiro.length : roteiro.indexOf(item.setor_atual);

  // Quantidade real por setor: a quantidade principal fica em setor_atual,
  // mas envios/recebimentos parciais criam lotes que ficam em outros setores
  // simultaneamente até serem concluídos — precisa somar os dois para refletir
  // onde as peças realmente estão.
  const lotesAtivos = (item.lotes || []).filter(l => l.status !== 'concluido');
  const qtdPorSetor: Record<string, number> = {};
  if (!entregue) {
    qtdPorSetor[item.setor_atual] = (qtdPorSetor[item.setor_atual] || 0) + Number(item.quantidade_pendente);
  }
  lotesAtivos.forEach(l => {
    qtdPorSetor[l.setor_destino] = (qtdPorSetor[l.setor_destino] || 0) + Number(l.quantidade);
  });

  // Círculos do roteiro — quando entregue, todos marcados como done
  const roteiroCirculos = roteiro.map((setor, i) => {
    const done = entregue || i < idxAtual;
    const current = !entregue && setor === item.setor_atual;
    return { setor, done, current, idx: i };
  });

  return (
    <AuthGuard>
      <div className="px-6 py-4">
        {/* Header */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-3">
            {isAdmin
              ? <Link href={`/pedidos/${item.pedido_id}`} className="border border-gray-300 text-gray-600 text-xs px-3 py-1.5 rounded hover:bg-gray-50">← Pedido {item.pedido_numero}</Link>
              : <span className="border border-gray-200 text-gray-500 text-xs px-3 py-1.5 rounded">Pedido {item.pedido_numero}</span>
            }
            <span className="text-gray-500 font-semibold">{item.codigo}</span>
            <span className={`text-xs px-2 py-1 rounded font-bold ${item.cor_status === 'info' ? 'bg-blue-500 text-white' : item.cor_status === 'primary' ? 'bg-blue-600 text-white' : item.cor_status === 'success' ? 'bg-green-500 text-white' : item.cor_status === 'warning' ? 'bg-yellow-100 text-yellow-800' : 'bg-gray-100 text-gray-700'}`}>
              {STATUS_LABELS[item.status]}
            </span>
          </div>
          {isAdmin && (
            <div className="flex gap-2">
              <button onClick={() => setShowDevolver(v => !v)}
                title="Mover o item para qualquer setor, fora da ordem normal do roteiro. Uso exclusivo de administradores."
                className="border border-yellow-400 text-yellow-700 text-xs px-3 py-1.5 rounded hover:bg-yellow-50">
                ✏ Alterar caminho
              </button>
            </div>
          )}
        </div>

        <p className="text-sm text-gray-500 mb-4">
          {item.descricao} · {item.quantidade_pendente} {item.unidade}
          {isAdmin && ` · ${item.pedido_cliente}`}
        </p>

        {/* Roteiro visual com círculos — só admin vê os próximos passos */}
        {isAdmin ? (
          <div className="bg-white rounded-xl border shadow-sm p-4 mb-4">
            <div className="flex items-center gap-0">
              {roteiroCirculos.map((r, i) => (
                <div key={r.setor} className="flex items-center">
                  <div className="flex flex-col items-center">
                    <div className={`w-9 h-9 rounded-full flex items-center justify-center font-bold text-sm border-2 ${r.current ? 'bg-orange-500 border-orange-500 text-white' : r.done ? 'bg-gray-800 border-gray-800 text-white' : 'bg-white border-gray-300 text-gray-400'}`}>
                      {r.done ? '✓' : i + 1}
                    </div>
                    <span className="text-xs mt-1 text-center max-w-14 leading-tight text-gray-500">{NOMES[r.setor] || r.setor}</span>
                  </div>
                  {i < roteiroCirculos.length - 1 && (
                    <div className={`h-0.5 w-8 mb-4 ${r.done ? 'bg-gray-800' : 'bg-gray-200'}`} />
                  )}
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div style={{ background: '#fff', border: '1px solid #e9ecef', borderRadius: 10, padding: '12px 18px', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 12 }}>
            <i className="bi bi-geo-alt-fill" style={{ color: '#1a3a5c', fontSize: 16 }}></i>
            <span style={{ fontWeight: 700, color: '#1a3a5c', fontSize: 15 }}>
              {entregue ? 'Entregue' : (NOMES[item.setor_atual] || item.setor_atual)}
            </span>
            <span style={{ fontSize: 11, padding: '2px 10px', borderRadius: 20, background: '#cfe2ff', color: '#0a58ca', fontWeight: 700 }}>
              {STATUS_LABELS[item.status]}
            </span>
          </div>
        )}

        {/* 3 colunas — colapsa para 1 col em mobile, 2 em tablet */}
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
                <span className={`text-xs px-3 py-1 rounded-full font-bold ${item.cor_status === 'info' ? 'bg-blue-500 text-white' : item.cor_status === 'primary' ? 'bg-blue-600 text-white' : item.cor_status === 'success' ? 'bg-green-500 text-white' : item.cor_status === 'warning' ? 'bg-yellow-400 text-white' : 'bg-gray-200 text-gray-700'}`}>
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
                <div><span className="text-gray-400 text-xs">Quantidade</span><p className="font-semibold">{item.quantidade_pendente} {item.unidade}</p></div>
                {isAdmin && (
                  <>
                    <div><span className="text-gray-400 text-xs">Pedido</span>
                      <p><Link href={`/pedidos/${item.pedido_id}`} className="font-semibold text-blue-700 hover:underline">{item.pedido_numero}</Link>
                        <span className="text-gray-500 ml-1">· {item.pedido_cliente}</span>
                      </p>
                    </div>
                    <div><span className="text-gray-400 text-xs">Prazo</span>
                      <p className="font-semibold">{fmtData(item.pedido_prazo)}</p>
                    </div>
                    <div><span className="text-gray-400 text-xs">Prioridade</span>
                      <span className={`text-xs px-2 py-0.5 rounded font-medium ${PRIORIDADE_COR[item.pedido_prioridade]}`}>
                        {item.pedido_prioridade?.charAt(0).toUpperCase()+item.pedido_prioridade?.slice(1)}
                      </span>
                    </div>
                    {isAdmin && item.valor_unitario && (
                      <div><span className="text-gray-400 text-xs">Valor unit.</span>
                        <p className="font-semibold text-green-700">R$ {Number(item.valor_unitario).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>

            {/* Onde estão as peças — só admin vê */}
            {isAdmin && (
              <div className="bg-white rounded-xl border shadow-sm p-4">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Onde estão as peças</p>
                <div className="space-y-1">
                  {roteiro.map((setor, i) => {
                    const qtdAqui = qtdPorSetor[setor] || 0;
                    const done = (entregue || i < idxAtual) && qtdAqui === 0;
                    const current = !entregue && qtdAqui > 0;
                    const isPrincipal = !entregue && setor === item.setor_atual;
                    return (
                      <div key={setor}
                        className={`flex items-center justify-between px-3 py-2 rounded text-sm ${current ? 'bg-orange-50 border border-orange-200' : ''}`}>
                        <div className="flex items-center gap-2">
                          <div className={`w-3 h-3 rounded-full ${current ? 'bg-orange-500' : done ? 'bg-green-500' : 'bg-gray-200'}`} />
                          <Link href={`/setor/${setor}`} className={`text-sm font-medium ${current ? 'text-orange-700' : done ? 'text-green-700' : 'text-gray-400'}`}>
                            {NOMES[setor] || setor}
                          </Link>
                          {isPrincipal && (
                            <span className={`text-xs px-1.5 py-0.5 rounded ${item.cor_status === 'info' ? 'bg-blue-500 text-white' : 'bg-orange-400 text-white'}`}>
                              {STATUS_LABELS[item.status]}
                            </span>
                          )}
                          {current && !isPrincipal && (
                            <span className="text-xs px-1.5 py-0.5 rounded bg-blue-100 text-blue-700">Lote parcial</span>
                          )}
                        </div>
                        {qtdAqui > 0 && <span className="text-sm font-bold text-gray-700">{qtdAqui} {item.unidade}</span>}
                        {qtdAqui === 0 && !done && <span className="text-xs text-gray-400">Falta chegar</span>}
                        {qtdAqui === 0 && done && <span className="text-xs text-green-600">Concluído</span>}
                      </div>
                    );
                  })}
                </div>
                {Number(item.quantidade_entregue) > 0 && (
                  <div className="flex items-center justify-between px-3 py-2 rounded bg-green-50 border border-green-100 mt-1">
                    <div className="flex items-center gap-2">
                      <i className="bi bi-check-circle-fill text-green-600"></i>
                      <span className="text-sm font-semibold text-green-700">Entregue ao cliente</span>
                    </div>
                    <span className="text-sm font-bold text-green-700">{item.quantidade_entregue} {item.unidade}</span>
                  </div>
                )}
                <div className="border-t mt-3 pt-3 flex items-center justify-between text-sm">
                  <span className="font-semibold text-gray-600">Total</span>
                  <span className="font-bold">{item.quantidade} {item.unidade}</span>
                </div>
              </div>
            )}
          </div>

          {/* COLUNA CENTRAL — AÇÕES */}
          <div className="space-y-3">
            {entregue && (
              <div style={{ background: '#d1e7dd', border: '1px solid #a3cfbb', borderRadius: 10, padding: '20px 16px', textAlign: 'center' }}>
                <i className="bi bi-check-circle-fill" style={{ fontSize: 32, color: '#198754' }}></i>
                <p style={{ fontWeight: 700, color: '#198754', marginTop: 8, marginBottom: 4, fontSize: 16 }}>Item Entregue</p>
                <p style={{ fontSize: 12, color: '#555', marginBottom: 12 }}>Este item foi entregue ao cliente pela logística.</p>
                <button onClick={() => setShowAnexar(true)}
                  className="btn btn-sm"
                  style={{ background: '#fff', color: '#198754', border: '1px solid #a3cfbb', borderRadius: 6, padding: '6px 14px', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                  <i className="bi bi-paperclip" style={{ marginRight: 6 }}></i>Anexar comprovante
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
              <div className="space-y-2">
                {!entregue && item.status === 'emitido' && (
                  <button onClick={() => acao('liberar')} disabled={atuando}
                    className="w-full bg-green-600 text-white px-4 py-2.5 rounded text-sm font-semibold text-left hover:bg-green-700">
                    ▶ Liberar para produção
                  </button>
                )}
                {!entregue && item.status === 'aguardando' && !showReceber && (
                  <button onClick={() => setShowReceber(true)} disabled={atuando}
                    className="w-full bg-blue-600 text-white px-4 py-2.5 rounded text-sm font-semibold text-left hover:bg-blue-700">
                    <i className="bi bi-box-arrow-in-down" style={{ marginRight: 8 }}></i>
                    Receber no setor
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
                    onConfirm={async (decisao, qtd, obs) => {
                      setShowReceber(false);
                      if (decisao === 'divergente') {
                        await acao('reprovar', { observacao: obs || 'Divergência reportada' });
                      } else {
                        await acao('receber', qtd ? { quantidade: qtd } : undefined);
                        if (decisao === 'iniciar') await acao('iniciar', {});
                      }
                    }}
                  />
                )}
                {!entregue && item.status === 'recebido' && item.setor_atual !== 'logistica' && (
                  <button onClick={() => acao('iniciar')} disabled={atuando}
                    className="w-full bg-green-600 text-white px-4 py-2.5 rounded text-sm font-semibold text-left hover:bg-green-700">
                    ▶ Iniciar produção
                  </button>
                )}
                {!entregue && item.status === 'recebido' && item.setor_atual === 'logistica' && (
                  <button onClick={() => setShowDespachar(true)} disabled={atuando}
                    className="w-full text-white px-4 py-2.5 rounded text-sm font-semibold text-left"
                    style={{ background: '#fd7e14' }}>
                    <i className="bi bi-truck" style={{ marginRight: 6 }}></i>Despachar
                  </button>
                )}
                {!entregue && (item.status === 'em_andamento' || item.status === 'recebido') && (
                  <>
                    {item.status === 'em_andamento' && (
                      <>
                        <button onClick={() => acao('finalizar')} disabled={atuando}
                          className="w-full bg-green-600 text-white px-4 py-2.5 rounded text-sm font-semibold text-left hover:bg-green-700">
                          ▶ Finalizar etapa
                        </button>
                        <button onClick={() => acao('pausar')} disabled={atuando}
                          className="w-full bg-yellow-500 text-white px-4 py-2.5 rounded text-sm font-semibold text-left hover:bg-yellow-600">
                          ⏸ Pausar
                        </button>
                      </>
                    )}
                  </>
                )}
                {!entregue && item.status === 'pausado' && (
                  <button onClick={() => acao('retomar')} disabled={atuando}
                    className="w-full bg-green-600 text-white px-4 py-2.5 rounded text-sm font-semibold text-left hover:bg-green-700">
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
                      className="w-full bg-[#1a3a5c] text-white px-4 py-2.5 rounded text-sm font-semibold text-left hover:opacity-90">
                      ▶ Enviar tudo
                    </button>
                    <button onClick={() => setShowParcial(v => !v)}
                      className="w-full bg-blue-500 text-white px-4 py-2.5 rounded text-sm font-semibold text-left hover:bg-blue-600">
                      ▶ Enviar parcial
                    </button>
                  </>
                )}
                {!entregue && item.setor_atual === 'logistica' && ['finalizado_setor', 'em_transito'].includes(item.status) && (
                  <button onClick={() => setShowEntregar(true)} disabled={atuando}
                    className="w-full bg-emerald-600 text-white px-4 py-2.5 rounded text-sm font-semibold text-left hover:bg-emerald-700">
                    ✓ Confirmar entrega
                  </button>
                )}

                {showDespachar && (
                  <DespacharModal
                    itemId={item.id}
                    itemCodigo={item.codigo}
                    pedidoNumero={item.pedido_numero}
                    onClose={() => setShowDespachar(false)}
                    onSuccess={() => { setShowDespachar(false); carregar(); }}
                  />
                )}
                {showEntregar && (
                  <EntregarModal
                    itemId={item.id}
                    pedidoNumero={item.pedido_numero}
                    descricao={item.descricao}
                    quantidade={item.quantidade_pendente}
                    unidade={item.unidade}
                    onCancel={() => setShowEntregar(false)}
                    onConfirm={() => { setShowEntregar(false); carregar(); }}
                  />
                )}

                {/* Bloquear / Divergência / Devolver — ocultos quando entregue */}
                {!entregue && (
                  <>
                    <button onClick={() => acao('bloquear')} disabled={atuando}
                      className="w-full bg-red-100 text-red-700 border border-red-200 px-4 py-2.5 rounded text-sm font-semibold text-left hover:bg-red-200">
                      <i className="bi bi-lock" style={{ marginRight: 6 }}></i>Bloquear item
                    </button>

                    <button className="w-full bg-yellow-50 text-yellow-700 border border-yellow-200 px-4 py-2.5 rounded text-sm font-semibold text-left hover:bg-yellow-100">
                      <i className="bi bi-exclamation-triangle" style={{ marginRight: 6 }}></i>Registrar Divergência
                    </button>

                    {['aguardando','recebido','em_andamento','pausado','finalizado_setor'].includes(item.status) && (
                      <button onClick={() => setShowDevolver(v => !v)}
                        className="w-full bg-gray-100 text-gray-700 border border-gray-200 px-4 py-2.5 rounded text-sm font-semibold text-left hover:bg-gray-200">
                        <i className="bi bi-arrow-return-left" style={{ marginRight: 6 }}></i>Devolver para setor
                      </button>
                    )}
                  </>
                )}
              </div>

              {showParcial && (
                <div className="mt-3 space-y-2 border-t pt-3">
                  <p className="text-xs font-semibold text-gray-600">Quantidade a enviar:</p>
                  <input type="number" value={qtdParcial} onChange={e => setQtdParcial(e.target.value)}
                    placeholder={`Max: ${item.quantidade_pendente}`}
                    className="border rounded px-3 py-2 text-sm w-full" />
                  <button onClick={() => { acao('enviar_parcial', { quantidade: Number(qtdParcial), setor_destino: setorDestinoEnvio || item.proximo_setor }); setShowParcial(false); }}
                    className="bg-blue-600 text-white px-4 py-2 rounded text-sm font-semibold w-full">
                    Confirmar envio parcial
                  </button>
                </div>
              )}

              {showDevolver && (
                <div className="mt-3 space-y-2 border-t pt-3">
                  <p className="text-xs font-semibold text-gray-600">Selecionar setor de destino (fora da ordem normal do roteiro):</p>
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
          </div>

          {/* COLUNA DIREITA — LINHA DO TEMPO */}
          <div className="bg-white rounded-xl border shadow-sm p-4">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Linha do Tempo</p>
            <div className="space-y-3 max-h-[600px] overflow-y-auto">
              {(item.movimentacoes || []).map((m, idx) => (
                <div key={m.id} className="flex gap-3">
                  <div className={`w-6 h-6 rounded-full flex items-center justify-center text-white font-bold text-xs flex-shrink-0 mt-0.5 ${idx % 4 === 0 ? 'bg-orange-500' : idx % 4 === 1 ? 'bg-blue-500' : idx % 4 === 2 ? 'bg-gray-600' : 'bg-green-500'}`}>
                    {idx + 1}
                  </div>
                  <div className="text-xs flex-1">
                    {m.observacao && (
                      <p className="font-medium text-gray-700">— {m.observacao}</p>
                    )}
                    {!m.observacao && (
                      <p className="font-medium text-gray-700">
                        {m.status_anterior_display} → {m.status_novo_display}
                      </p>
                    )}
                    <p className="text-gray-400 mt-0.5">
                      {fmtHora(m.criado_em)} · {m.usuario_nome}
                    </p>
                    {m.setor_destino && m.setor_destino !== m.setor_origem && (
                      <p className="text-blue-600 text-xs">{m.setor_origem_nome} → {m.setor_destino_nome}</p>
                    )}
                  </div>
                </div>
              ))}
              {(!item.movimentacoes || item.movimentacoes.length === 0) && (
                <p className="text-gray-400 text-xs text-center py-4">Sem movimentações.</p>
              )}
            </div>
          </div>
        </div>
      </div>
    </AuthGuard>
  );
}
