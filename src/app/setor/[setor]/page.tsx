'use client';
import { useEffect, useState, useCallback } from 'react';
import AuthGuard from '@/components/AuthGuard';
import { getSetorPainel, itemAcao, loteAcao, parcialAcao } from '@/lib/api';
import { SetorPainelData, ItemPedido, LoteItem, ItemParcial, STATUS_LABELS, PRIORIDADE_COR, NOMES, SETOR_CHOICES } from '@/lib/types';
import { fmtQtd } from '@/lib/format';
import Link from 'next/link';
import ReceberModal from '@/components/ReceberModal';
import NotificacoesLive from '@/components/NotificacoesLive';
import ConfirmModal from '@/components/ConfirmModal';
import EntregarModal from '@/components/EntregarModal';
import DespacharModal from '@/components/DespacharModal';
import DivergenciaResolucaoModal from '@/components/DivergenciaResolucaoModal';

const BADGE_STATUS: Record<string, { bg: string; color: string }> = {
  aguardando:       { bg: '#e2e3e5', color: '#333' },
  recebido:         { bg: '#cff4fc', color: '#055160' },
  em_andamento:     { bg: '#fff3cd', color: '#664d03' },
  em_producao:      { bg: '#cff4fc', color: '#055160' },
  pausado:          { bg: '#f8d7da', color: '#842029' },
  finalizado_setor: { bg: '#d1e7dd', color: '#0a3622' },
  em_transito:      { bg: '#fff3cd', color: '#856404' },
  bloqueado:        { bg: '#dc3545', color: '#fff' },
  entregue:         { bg: '#198754', color: '#fff' },
};

function ItemCard({ item, onRefresh, ocultarCabecalhoPedido }: { item: ItemPedido; onRefresh: () => void; ocultarCabecalhoPedido?: boolean }) {
  const [loading, setLoading] = useState(false);
  const [showReceber, setShowReceber] = useState(false);
  const [showParcial, setShowParcial] = useState(false);
  const [qtdParcial, setQtdParcial] = useState('');
  const [showDevolver, setShowDevolver] = useState(false);
  const [setorDev, setSetorDev] = useState('');
  const [confirm, setConfirm] = useState<{ titulo: string; mensagem: string; acao: () => void; perigo?: boolean } | null>(null);
  const [showEntregar, setShowEntregar] = useState(false);
  const [showDespachar, setShowDespachar] = useState(false);
  const [showDivModal, setShowDivModal] = useState<'retrabalho' | 'resolver' | 'cancelar_item' | null>(null);
  const [setorDestinoEnvio, setSetorDestinoEnvio] = useState('');

  function erroMsg(e: unknown) {
    const ax = e as { response?: { data?: { erro?: string }; status?: number } };
    return ax?.response?.data?.erro || `Erro ${ax?.response?.status || ''}`.trim() || String(e);
  }

  async function acao(a: string, body?: Record<string, unknown>) {
    if (loading) return;
    setLoading(true);
    try { await itemAcao(item.id, a, body); onRefresh(); }
    catch (e: unknown) { alert(erroMsg(e)); }
    finally { setLoading(false); }
  }

  async function receberFluxo(decisao: 'iniciar' | 'preparar' | 'divergente', qtd?: number, obs?: string) {
    setLoading(true);
    try {
      if (decisao === 'divergente') {
        await itemAcao(item.id, 'reprovar', { observacao: obs || 'Divergência reportada' });
      } else {
        await itemAcao(item.id, 'receber', qtd ? { quantidade: qtd } : {});
        if (decisao === 'iniciar') {
          await itemAcao(item.id, 'iniciar', {});
        }
      }
      onRefresh();
    } catch (e: unknown) { alert(erroMsg(e)); }
    finally { setLoading(false); }
  }

  const badge = BADGE_STATUS[item.status] || { bg: '#e2e3e5', color: '#333' };

  return (
    <div style={{ opacity: loading ? .6 : 1 }}>
      {confirm && (
        <ConfirmModal
          titulo={confirm.titulo}
          mensagem={confirm.mensagem}
          perigo={confirm.perigo}
          confirmLabel="Confirmar"
          onConfirm={() => { confirm.acao(); setConfirm(null); }}
          onCancel={() => setConfirm(null)}
        />
      )}
      {/* Cabeçalho */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 8 }}>
        <div>
          {!ocultarCabecalhoPedido && (
            <div style={{ fontSize: 15, fontWeight: 700, color: '#1a3a5c' }}>{item.pedido_numero}</div>
          )}
          <div style={{ fontSize: 13, color: '#555' }}>
            <strong>{item.codigo}</strong>
            <span style={{ color: '#999', marginLeft: 6 }}>{item.descricao}</span>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 4, fontWeight: 600, background: badge.bg, color: badge.color }}>
            {STATUS_LABELS[item.status]}
          </span>
          <Link href={`/item/${item.id}`} title="Ver detalhe"
            style={{ color: '#0d6efd', fontSize: 14, textDecoration: 'none' }}>
            <i className="bi bi-eye"></i>
          </Link>
        </div>
      </div>

      {/* Quantidade e prioridade */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <span style={{ fontSize: 16, fontWeight: 700, color: '#0d6efd' }}>
          {item.quantidade_pendente} {item.unidade}
        </span>
        <span className={`badge-${item.pedido_prioridade || 'normal'}`}>
          {item.pedido_prioridade?.charAt(0).toUpperCase() + item.pedido_prioridade?.slice(1)}
        </span>
        {item.pedido_prazo && (
          <span style={{ fontSize: 11, color: '#888' }}>{item.pedido_prazo}</span>
        )}
      </div>

      {/* Aviso Logística: peças parciais ainda em outros setores */}
      {item.setor_atual === 'logistica' && Number(item.quantidade_pendente) < Number(item.quantidade) && Number(item.quantidade_entregue) === 0 && (
        <div style={{
          background: '#fff3cd', border: '1px solid #ffc107', borderRadius: 6,
          padding: '8px 12px', marginBottom: 10, fontSize: 12, color: '#856404',
        }}>
          <i className="bi bi-exclamation-triangle-fill" style={{ marginRight: 6 }}></i>
          <strong>Atenção:</strong> Este item tem <strong>{Number(item.quantidade) - Number(item.quantidade_pendente)} {item.unidade}</strong> ainda em outros setores.
          {' '}Confirme a entrega apenas das peças que chegaram aqui ({item.quantidade_pendente} {item.unidade}).
        </div>
      )}
      {/* Aviso Logística: lote remanescente que chega após entrega parcial já realizada */}
      {item.setor_atual === 'logistica' && Number(item.quantidade_entregue) > 0 && item.status !== 'entregue' && (
        <div style={{
          background: '#cff4fc', border: '1px solid #0dcaf0', borderRadius: 6,
          padding: '8px 12px', marginBottom: 10, fontSize: 12, color: '#055160',
        }}>
          <i className="bi bi-info-circle-fill" style={{ marginRight: 6 }}></i>
          <strong>Entrega parcial anterior:</strong> {Number(item.quantidade_entregue)} {item.unidade} deste item (pedido <strong>{item.pedido_numero}</strong>) já foram entregues anteriormente.
          {' '}Estas {item.quantidade_pendente} {item.unidade} são o restante.
        </div>
      )}

      {/* Ações */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>

        {/* RECEBER — abre modal total/parcial */}
        {item.status === 'aguardando' && !showReceber && (
          <button onClick={() => !loading && setShowReceber(true)} disabled={loading}
            style={{ background: '#0d6efd', color: '#fff', border: 'none', borderRadius: 5, padding: '6px 14px', fontSize: 12, fontWeight: 700, cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.6 : 1 }}>
            <i className="bi bi-box-arrow-in-down" style={{ marginRight: 5 }}></i>Receber
          </button>
        )}

        {item.status === 'recebido' && item.setor_atual === 'logistica' && (
          <button onClick={() => !loading && setShowDespachar(true)} disabled={loading}
            style={{ background: '#fd7e14', color: '#fff', border: 'none', borderRadius: 5, padding: '6px 14px', fontSize: 12, fontWeight: 700, cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.6 : 1 }}>
            <i className="bi bi-truck" style={{ marginRight: 5 }}></i>Despachar
          </button>
        )}

        {item.status === 'recebido' && item.setor_atual !== 'logistica' && (
          <button onClick={() => acao('iniciar')} disabled={loading}
            style={{ background: '#198754', color: '#fff', border: 'none', borderRadius: 5, padding: '6px 14px', fontSize: 12, fontWeight: 700, cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.6 : 1 }}>
            {loading ? <i className="bi bi-hourglass-split" style={{ marginRight: 5 }}></i> : <i className="bi bi-play-fill" style={{ marginRight: 5 }}></i>}
            {loading ? 'Aguarde...' : 'Iniciar produção'}
          </button>
        )}

        {item.status === 'em_andamento' && (
          <>
            <button onClick={() => !loading && setConfirm({ titulo: 'Finalizar etapa', mensagem: `Confirma que a etapa de ${item.nome_setor_atual} foi concluída para este item?`, acao: () => acao('finalizar') })} disabled={loading}
              style={{ background: '#198754', color: '#fff', border: 'none', borderRadius: 5, padding: '6px 14px', fontSize: 12, fontWeight: 700, cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.6 : 1 }}>
              {loading ? <i className="bi bi-hourglass-split" style={{ marginRight: 5 }}></i> : <i className="bi bi-check-lg" style={{ marginRight: 5 }}></i>}
              {loading ? 'Aguarde...' : 'Finalizar etapa'}
            </button>
            <button onClick={() => acao('pausar')} disabled={loading}
              style={{ background: '#fd7e14', color: '#fff', border: 'none', borderRadius: 5, padding: '6px 14px', fontSize: 12, fontWeight: 700, cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.6 : 1 }}>
              <i className="bi bi-pause-fill" style={{ marginRight: 5 }}></i>Pausar
            </button>
          </>
        )}

        {item.status === 'pausado' && (
          <button onClick={() => acao('retomar')} disabled={loading}
            style={{ background: '#198754', color: '#fff', border: 'none', borderRadius: 5, padding: '6px 14px', fontSize: 12, fontWeight: 700, cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.6 : 1 }}>
            {loading ? <i className="bi bi-hourglass-split" style={{ marginRight: 5 }}></i> : <i className="bi bi-play-fill" style={{ marginRight: 5 }}></i>}
            {loading ? 'Aguarde...' : 'Retomar'}
          </button>
        )}

        {item.status === 'finalizado_setor' && (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: 12, color: '#666', whiteSpace: 'nowrap' }}>Enviar para:</span>
              <select value={setorDestinoEnvio || item.proximo_setor || ''} onChange={e => setSetorDestinoEnvio(e.target.value)}
                style={{ border: '1px solid #dee2e6', borderRadius: 5, padding: '5px 8px', fontSize: 12 }}>
                {SETOR_CHOICES.filter(([cod]) => cod !== item.setor_atual).map(([cod, nome]) => (
                  <option key={cod} value={cod}>
                    {nome}{cod === item.proximo_setor ? ' (próximo no roteiro)' : ''}
                  </option>
                ))}
              </select>
            </div>
            <button onClick={() => !loading && setConfirm({ titulo: 'Enviar para o setor selecionado', mensagem: `Confirma o envio de TODOS os itens para ${NOMES[setorDestinoEnvio || item.proximo_setor || ''] || 'o setor selecionado'}?`, acao: () => acao('enviar_tudo', { setor_destino: setorDestinoEnvio || item.proximo_setor }) })} disabled={loading}
              style={{ background: '#1a3a5c', color: '#fff', border: 'none', borderRadius: 5, padding: '6px 14px', fontSize: 12, fontWeight: 700, cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.6 : 1 }}>
              {loading ? <i className="bi bi-hourglass-split" style={{ marginRight: 5 }}></i> : <i className="bi bi-send-fill" style={{ marginRight: 5 }}></i>}
              {loading ? 'Aguarde...' : 'Enviar tudo'}
            </button>
            <button onClick={() => !loading && setShowParcial(v => !v)} disabled={loading}
              style={{ background: '#0d6efd', color: '#fff', border: 'none', borderRadius: 5, padding: '6px 14px', fontSize: 12, fontWeight: 700, cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.6 : 1 }}>
              <i className="bi bi-scissors" style={{ marginRight: 5 }}></i>Enviar parcial
            </button>
          </>
        )}

        {item.setor_atual === 'logistica' && item.status === 'em_transito' && (
          <button onClick={() => !loading && setShowEntregar(true)} disabled={loading}
            style={{ background: '#198754', color: '#fff', border: 'none', borderRadius: 5, padding: '6px 14px', fontSize: 12, fontWeight: 700, cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.6 : 1 }}>
            <i className="bi bi-check-circle-fill" style={{ marginRight: 5 }}></i>
            Confirmar entrega
          </button>
        )}
        {showDespachar && (
          <DespacharModal
            itemId={item.id}
            itemCodigo={item.codigo}
            pedidoNumero={item.pedido_numero}
            onClose={() => setShowDespachar(false)}
            onSuccess={() => { setShowDespachar(false); onRefresh(); }}
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
            onConfirm={() => { setShowEntregar(false); onRefresh(); }}
          />
        )}

        {/* Devolver */}
        {['aguardando','recebido','em_andamento','pausado','finalizado_setor','em_transito'].includes(item.status) && (
          <button onClick={() => !loading && setShowDevolver(v => !v)} disabled={loading}
            style={{ background: 'none', border: '1px solid #dc3545', color: '#dc3545', borderRadius: 5, padding: '5px 12px', fontSize: 12, fontWeight: 600, cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.6 : 1 }}>
            <i className="bi bi-arrow-return-left" style={{ marginRight: 5 }}></i>Devolver
          </button>
        )}

        {/* Ações para item REPROVADO */}
        {item.status === 'reprovado' && (
          <>
            <button onClick={() => !loading && setShowDivModal('retrabalho')} disabled={loading}
              style={{ background: '#fff3cd', border: '1px solid #ffc107', color: '#856404', borderRadius: 5, padding: '5px 12px', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
              <i className="bi bi-tools" style={{ marginRight: 5 }}></i>Encaminhar retrabalho
            </button>
            <button onClick={() => !loading && setShowDivModal('resolver')} disabled={loading}
              style={{ background: '#dcfce7', border: '1px solid #16a34a', color: '#166534', borderRadius: 5, padding: '5px 12px', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
              <i className="bi bi-check-circle" style={{ marginRight: 5 }}></i>Resolver internamente
            </button>
            <button onClick={() => !loading && setShowDivModal('cancelar_item')} disabled={loading}
              style={{ background: '#fee2e2', border: '1px solid #dc2626', color: '#991b1b', borderRadius: 5, padding: '5px 12px', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
              <i className="bi bi-x-circle" style={{ marginRight: 5 }}></i>Cancelar item
            </button>
          </>
        )}
      </div>

      {/* Modal receber */}
      {item.status === 'aguardando' && showReceber && (
        <ReceberModal
          quantidade={item.quantidade_pendente}
          unidade={item.unidade}
          setor={item.nome_setor_atual}
          itemCodigo={item.codigo}
          itemDescricao={item.descricao}
          setorOrigem={(() => {
            const rot = item.roteiro_efetivo || [];
            const idx = rot.indexOf(item.setor_atual);
            const ant = idx > 0 ? rot[idx - 1] : null;
            return ant ? (NOMES[ant] || ant) : undefined;
          })()}
          ocultarIniciar={item.setor_atual === 'logistica'}
          loading={loading}
          onCancel={() => setShowReceber(false)}
          onConfirm={(decisao, qtd, obs) => {
            setShowReceber(false);
            receberFluxo(decisao, qtd, obs);
          }}
        />
      )}

      {/* Enviar parcial */}
      {showParcial && (
        <div style={{ marginTop: 10, display: 'flex', gap: 8, alignItems: 'center', background: '#f8f9fa', borderRadius: 6, padding: '10px 12px' }}>
          <span style={{ fontSize: 12, color: '#555', whiteSpace: 'nowrap' }}>Qtd a enviar:</span>
          <input type="number" value={qtdParcial} onChange={e => setQtdParcial(e.target.value)}
            placeholder={`Max: ${item.quantidade_pendente}`}
            style={{ border: '1px solid #dee2e6', borderRadius: 5, padding: '5px 8px', fontSize: 13, width: 80 }} />
          <span style={{ fontSize: 12, color: '#666' }}>{item.unidade}</span>
          <button onClick={() => { acao('enviar_parcial', { quantidade: Number(qtdParcial), setor_destino: setorDestinoEnvio || item.proximo_setor }); setShowParcial(false); }}
            style={{ background: '#0d6efd', color: '#fff', border: 'none', borderRadius: 5, padding: '5px 14px', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
            Confirmar
          </button>
          <button onClick={() => setShowParcial(false)}
            style={{ background: 'none', border: '1px solid #dee2e6', borderRadius: 5, padding: '5px 10px', fontSize: 12, color: '#888', cursor: 'pointer' }}>
            ✕
          </button>
        </div>
      )}

      {/* Modal de resolução de divergência */}
      {showDivModal && (
        <DivergenciaResolucaoModal
          itemCodigo={item.codigo}
          itemDescricao={item.descricao}
          acao={showDivModal}
          loading={loading}
          onCancel={() => setShowDivModal(null)}
          onConfirm={(obs, setorDestino) => {
            setShowDivModal(null);
            acao(showDivModal, { observacao: obs, setor_destino: setorDestino });
          }}
        />
      )}

      {/* Devolver / Retrabalho para setor */}
      {showDevolver && (
        <div style={{ marginTop: 10, background: item.status === 'reprovado' ? '#fffbeb' : '#fff8f8', border: `1px solid ${item.status === 'reprovado' ? '#fde68a' : '#f5c2c7'}`, borderRadius: 6, padding: '12px' }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: item.status === 'reprovado' ? '#92400e' : '#842029', marginBottom: 8 }}>
            {item.status === 'reprovado' ? 'Encaminhar para retrabalho em qual setor?' : 'Devolver para qual setor?'}
          </div>
          <select value={setorDev} onChange={e => setSetorDev(e.target.value)}
            style={{ width: '100%', border: '1px solid #dee2e6', borderRadius: 5, padding: '6px 8px', fontSize: 13, marginBottom: 8 }}>
            <option value="">Selecione o setor...</option>
            {SETOR_CHOICES.map(([cod, nome]) => (
              <option key={cod} value={cod}>{nome}</option>
            ))}
          </select>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => {
              if (!setorDev) return;
              const acaoNome = item.status === 'reprovado' ? 'retrabalho' : 'devolver';
              acao(acaoNome, { setor_destino: setorDev });
              setShowDevolver(false);
            }}
              style={{ flex: 1, background: item.status === 'reprovado' ? '#d97706' : '#dc3545', color: '#fff', border: 'none', borderRadius: 5, padding: '7px 0', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
              {item.status === 'reprovado' ? 'Encaminhar para retrabalho' : 'Confirmar devolução'}
            </button>
            <button onClick={() => setShowDevolver(false)}
              style={{ background: 'none', border: '1px solid #dee2e6', borderRadius: 5, padding: '7px 14px', fontSize: 13, color: '#666', cursor: 'pointer' }}>
              Cancelar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function LoteCard({ lote, tipo, onRefresh }: { lote: LoteItem & Record<string, unknown>; tipo: 'chegando' | 'trabalho'; onRefresh: () => void }) {
  const [loading, setLoading] = useState(false);
  const [showReceber, setShowReceber] = useState(false);
  const [showConfirmFinalizar, setShowConfirmFinalizar] = useState(false);
  const [erro, setErro] = useState('');

  async function receber() {
    setLoading(true);
    setErro('');
    try {
      await loteAcao(lote.id, 'receber');
      onRefresh();
    } catch (e: unknown) {
      const ax = e as { response?: { data?: { erro?: string } } };
      setErro(ax?.response?.data?.erro || 'Erro ao receber lote');
    }
    finally { setLoading(false); }
  }

  async function finalizar() {
    setLoading(true);
    setShowConfirmFinalizar(false);
    setErro('');
    try {
      await loteAcao(lote.id, 'finalizar');
      onRefresh();
    } catch (e: unknown) {
      const ax = e as { response?: { data?: { erro?: string } } };
      setErro(ax?.response?.data?.erro || 'Erro ao finalizar lote');
    }
    finally { setLoading(false); }
  }

  return (
    <div className="card" style={{ padding: 14, background: '#f0f7ff', border: '1px solid #b6d4fe', opacity: loading ? .6 : 1 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
        <div>
          <strong style={{ color: '#1a3a5c', fontSize: 13 }}>{lote.item_codigo as string}</strong>
          <span style={{ color: '#888', fontSize: 12, marginLeft: 6 }}>{lote.numero_pedido_venda as string}</span>
        </div>
        <Link href={`/item/${(lote as Record<string, unknown>).item_pedido_id as number}`}
          style={{ color: '#0d6efd', fontSize: 14, textDecoration: 'none' }}>
          <i className="bi bi-eye"></i>
        </Link>
      </div>
      <div style={{ fontSize: 18, fontWeight: 700, color: '#0d6efd', marginBottom: 4 }}>{lote.quantidade} {lote.unidade as string || 'un'}</div>
      <div style={{ fontSize: 11, color: '#666', marginBottom: 10 }}>
        <i className="bi bi-arrow-right" style={{ marginRight: 4 }}></i>De: {lote.setor_origem_nome}
      </div>

      {tipo === 'chegando' && !showReceber && (
        <button onClick={() => setShowReceber(true)} disabled={loading}
          style={{ width: '100%', background: '#0d6efd', color: '#fff', border: 'none', borderRadius: 5, padding: '8px 0', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
          <i className="bi bi-box-arrow-in-down" style={{ marginRight: 6 }}></i>Receber lote
        </button>
      )}

      {tipo === 'trabalho' && !showConfirmFinalizar && (
        <button onClick={() => setShowConfirmFinalizar(true)} disabled={loading}
          style={{ width: '100%', background: '#166534', color: '#fff', border: 'none', borderRadius: 5, padding: '8px 0', fontSize: 13, fontWeight: 700, cursor: 'pointer', marginTop: 4 }}>
          <i className="bi bi-check2-circle" style={{ marginRight: 6 }}></i>Liberar item para o setor
        </button>
      )}

      {tipo === 'trabalho' && showConfirmFinalizar && (
        <div style={{ marginTop: 8, background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8, padding: 12 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: '#166534', marginBottom: 10 }}>
            <i className="bi bi-check2-circle" style={{ marginRight: 6 }} />
            Confirma que o lote foi processado?
          </div>
          <div style={{ fontSize: 12, color: '#374151', marginBottom: 12 }}>
            O item <strong>{lote.item_codigo as string}</strong> ({lote.quantidade} {(lote.unidade as string) || 'un'}) será liberado para continuar o fluxo neste setor.
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => setShowConfirmFinalizar(false)} disabled={loading}
              style={{ flex: 1, background: '#f3f4f6', color: '#555', border: 'none', borderRadius: 6, padding: '8px 0', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
              Cancelar
            </button>
            <button onClick={finalizar} disabled={loading}
              style={{ flex: 2, background: '#166534', color: '#fff', border: 'none', borderRadius: 6, padding: '8px 0', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
              {loading ? 'Aguarde...' : '✓ Confirmar liberação'}
            </button>
          </div>
        </div>
      )}

      {tipo === 'chegando' && showReceber && (
        <ReceberModal
          quantidade={lote.quantidade as string}
          unidade={(lote.unidade as string) || 'un'}
          loading={loading}
          onCancel={() => setShowReceber(false)}
          onConfirm={async (decisao, _qtd, _obs) => {
            setShowReceber(false);
            await receber();
          }}
        />
      )}

      {erro && (
        <div style={{ marginTop: 8, background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: 6, padding: '8px 10px', display: 'flex', alignItems: 'flex-start', gap: 6 }}>
          <span style={{ color: '#dc2626', fontWeight: 700, flexShrink: 0 }}>⚠</span>
          <div style={{ flex: 1 }}>
            <p style={{ color: '#b91c1c', fontSize: 12, fontWeight: 600, margin: 0 }}>Erro</p>
            <p style={{ color: '#dc2626', fontSize: 11, margin: '2px 0 0' }}>{erro}</p>
          </div>
          <button onClick={() => setErro('')} style={{ background: 'none', border: 'none', color: '#f87171', cursor: 'pointer', fontSize: 12 }}>✕</button>
        </div>
      )}
    </div>
  );
}

const BADGE_PARCIAL: Record<string, { bg: string; color: string }> = {
  em_aberto:        { bg: '#dbeafe', color: '#1d4ed8' },
  em_andamento:     { bg: '#fff3cd', color: '#664d03' },
  pausado:          { bg: '#fef9c3', color: '#854d0e' },
  finalizado_setor: { bg: '#d1e7dd', color: '#0a3622' },
  concluida:        { bg: '#d1e7dd', color: '#0a3622' },
  cancelada:        { bg: '#f8d7da', color: '#842029' },
};

const LABEL_PARCIAL: Record<string, string> = {
  em_aberto:        'Aguardando',
  em_andamento:     'Em Andamento',
  pausado:          'Pausado',
  finalizado_setor: 'Finalizado no Setor',
  concluida:        'Concluída',
  cancelada:        'Cancelada',
};

function ParcialCard({ parcial, onRefresh }: { parcial: ItemParcial; onRefresh: () => void }) {
  const [loading, setLoading] = useState(false);
  const [showEnviar, setShowEnviar] = useState(false);
  const [showDevolver, setShowDevolver] = useState(false);
  const [showNaoEntregue, setShowNaoEntregue] = useState(false);
  const [qtdEnvio, setQtdEnvio] = useState('');
  const [setorDestino, setSetorDestino] = useState('');
  const [setorDev, setSetorDev] = useState('');
  const [confirm, setConfirm] = useState<{ titulo: string; mensagem: string; acao: () => void; perigo?: boolean } | null>(null);
  const isLogistica = parcial.setor_atual === 'logistica';

  function erroMsg(e: unknown) {
    const ax = e as { response?: { data?: { erro?: string }; status?: number } };
    return ax?.response?.data?.erro || `Erro ${ax?.response?.status || ''}`.trim() || String(e);
  }

  async function acao(a: string, body?: Record<string, unknown>) {
    if (loading) return;
    setLoading(true);
    try { await parcialAcao(parcial.id, a, body); onRefresh(); }
    catch (e: unknown) { alert(erroMsg(e)); }
    finally { setLoading(false); }
  }

  const isAberto    = parcial.status === 'em_aberto';
  const isAndamento = parcial.status === 'em_andamento';
  const isPausado   = parcial.status === 'pausado';
  const isFinalizado = parcial.status === 'finalizado_setor';
  const badge = BADGE_PARCIAL[parcial.status] || { bg: '#e2e3e5', color: '#333' };

  const btnStyle = (bg: string, outline = false): React.CSSProperties => ({
    background: outline ? 'none' : bg,
    color: outline ? bg : '#fff',
    border: outline ? `1px solid ${bg}` : 'none',
    borderRadius: 5, padding: '6px 14px', fontSize: 12, fontWeight: 700,
    cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.6 : 1,
  });

  return (
    <div style={{ opacity: loading ? .6 : 1 }}>
      {confirm && (
        <ConfirmModal
          titulo={confirm.titulo}
          mensagem={confirm.mensagem}
          confirmLabel="Confirmar"
          perigo={confirm.perigo}
          onConfirm={() => { confirm.acao(); setConfirm(null); }}
          onCancel={() => setConfirm(null)}
        />
      )}

      {/* Cabeçalho */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 8 }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 700, color: '#1a3a5c' }}>{parcial.numero_pedido_venda}</div>
          <div style={{ fontSize: 13, color: '#555' }}>
            <strong>{parcial.item_codigo}</strong>
            {parcial.item_descricao && <span style={{ color: '#999', marginLeft: 6 }}>{parcial.item_descricao}</span>}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 4, fontWeight: 600, background: badge.bg, color: badge.color }}>
            {LABEL_PARCIAL[parcial.status] || parcial.status}
          </span>
          <Link href={`/parcial/${parcial.id}`} title="Ver detalhe" style={{ color: '#0d6efd', fontSize: 14, textDecoration: 'none' }}>
            <i className="bi bi-eye" />
          </Link>
        </div>
      </div>

      {/* Quantidade e prioridade */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <span style={{ fontSize: 16, fontWeight: 700, color: '#0d6efd' }}>
          {fmtQtd(parcial.quantidade)} {parcial.unidade}
        </span>
        {parcial.quantidade_total_item && (
          <span style={{ fontSize: 11, color: '#888' }}>de {fmtQtd(parcial.quantidade_total_item)} totais</span>
        )}
        {parcial.prioridade && (
          <span className={`badge-${parcial.prioridade}`}>
            {parcial.prioridade.charAt(0).toUpperCase() + parcial.prioridade.slice(1)}
          </span>
        )}
      </div>

      {/* Prazo */}
      {parcial.pedido_prazo && (
        <div style={{ fontSize: 11, color: '#888', marginBottom: 8 }}>
          <i className="bi bi-calendar3" style={{ marginRight: 4 }} />
          Prazo: {parcial.pedido_prazo}
        </div>
      )}

      {/* Ações */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>

        {/* ── Logística: fluxo de entrega ─────────────────────────────────── */}
        {isLogistica && isAberto && (
          <button onClick={() => acao('iniciar')} disabled={loading} style={btnStyle('#0d6efd')}>
            <i className="bi bi-truck" style={{ marginRight: 5 }} />Iniciar entrega
          </button>
        )}

        {isLogistica && isAndamento && (
          <>
            <button onClick={() => setConfirm({
              titulo: 'Confirmar Entrega',
              mensagem: `Confirma que as ${fmtQtd(parcial.quantidade)} ${parcial.unidade} do pedido ${parcial.numero_pedido_venda} foram entregues ao cliente?`,
              acao: () => acao('concluir'),
            })} disabled={loading} style={btnStyle('#198754')}>
              <i className="bi bi-check-circle-fill" style={{ marginRight: 5 }} />Pedido entregue
            </button>
            <button onClick={() => { setShowNaoEntregue(v => !v); setShowDevolver(false); }} disabled={loading}
              style={btnStyle('#dc3545', !showNaoEntregue)}>
              <i className="bi bi-x-circle" style={{ marginRight: 5 }} />Não entregue
            </button>
          </>
        )}

        {isLogistica && isPausado && (
          <button onClick={() => acao('retomar')} disabled={loading} style={btnStyle('#0d6efd')}>
            <i className="bi bi-truck" style={{ marginRight: 5 }} />Tentar entrega novamente
          </button>
        )}

        {/* ── Setores normais: fluxo de produção ─────────────────────────── */}
        {!isLogistica && isAberto && (
          <button onClick={() => acao('iniciar')} disabled={loading} style={btnStyle('#198754')}>
            <i className="bi bi-box-arrow-in-down" style={{ marginRight: 5 }} />Receber
          </button>
        )}

        {!isLogistica && isAndamento && (
          <>
            <button onClick={() => setConfirm({
              titulo: 'Finalizar etapa',
              mensagem: `Confirma que a etapa de ${NOMES[parcial.setor_atual] || parcial.setor_atual} foi concluída?`,
              acao: () => acao('finalizar'),
            })} disabled={loading} style={btnStyle('#198754')}>
              <i className="bi bi-check-lg" style={{ marginRight: 5 }} />Finalizar etapa
            </button>
            <button onClick={() => setShowEnviar(v => !v)} disabled={loading} style={btnStyle('#0d6efd')}>
              <i className="bi bi-scissors" style={{ marginRight: 5 }} />Enviar parcial
            </button>
            <button onClick={() => acao('pausar')} disabled={loading} style={btnStyle('#fd7e14')}>
              <i className="bi bi-pause-fill" style={{ marginRight: 5 }} />Pausar
            </button>
          </>
        )}

        {!isLogistica && isPausado && (
          <button onClick={() => acao('retomar')} disabled={loading} style={btnStyle('#198754')}>
            <i className="bi bi-play-fill" style={{ marginRight: 5 }} />Retomar
          </button>
        )}

        {!isLogistica && isFinalizado && (
          <>
            <button onClick={() => setShowEnviar(v => !v)} disabled={loading} style={btnStyle('#1a3a5c')}>
              <i className="bi bi-send-fill" style={{ marginRight: 5 }} />Enviar ao próximo setor
            </button>
            <button onClick={() => acao('retomar')} disabled={loading} style={btnStyle('#fd7e14')}>
              <i className="bi bi-arrow-counterclockwise" style={{ marginRight: 5 }} />Retomar etapa
            </button>
            <button onClick={() => setConfirm({
              titulo: 'Encerrar Parcial',
              mensagem: 'As peças já foram processadas e não precisam ir a outro setor. Deseja encerrar esta parcial como concluída?',
              acao: () => acao('concluir'),
            })} disabled={loading} style={btnStyle('#198754', true)}>
              ✓ Encerrar
            </button>
          </>
        )}

        {/* Devolver — disponível em todos os setores */}
        {(isAberto || isAndamento || isPausado || isFinalizado) && !isLogistica && (
          <button onClick={() => { setShowDevolver(v => !v); setShowNaoEntregue(false); }} disabled={loading} style={btnStyle('#dc3545', true)}>
            <i className="bi bi-arrow-return-left" style={{ marginRight: 5 }} />Devolver
          </button>
        )}
      </div>

      {/* Painel "Não entregue" — exclusivo da Logística */}
      {showNaoEntregue && (
        <div style={{ marginTop: 10, background: '#fff8f8', border: '1px solid #f5c2c7', borderRadius: 8, padding: 14 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#842029', marginBottom: 4 }}>
            <i className="bi bi-x-circle-fill" style={{ marginRight: 6 }} />Entrega não realizada
          </div>
          <p style={{ fontSize: 12, color: '#666', margin: '0 0 12px', lineHeight: 1.5 }}>
            O que deseja fazer com as peças?
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <button onClick={() => {
              setConfirm({
                titulo: 'Reagendar entrega',
                mensagem: 'A parcial será pausada e ficará aguardando nova tentativa de entrega.',
                acao: () => { acao('pausar'); setShowNaoEntregue(false); },
              });
            }} disabled={loading}
              style={{ background: '#fff3cd', border: '1px solid #ffc107', borderRadius: 6, padding: '8px 12px', fontSize: 12, fontWeight: 600, color: '#664d03', cursor: 'pointer', textAlign: 'left' }}>
              <i className="bi bi-clock-history" style={{ marginRight: 6 }} />Reagendar — tentar entregar depois
            </button>
            <button onClick={() => { setShowNaoEntregue(false); setShowDevolver(true); }} disabled={loading}
              style={{ background: '#fff8f8', border: '1px solid #f5c2c7', borderRadius: 6, padding: '8px 12px', fontSize: 12, fontWeight: 600, color: '#842029', cursor: 'pointer', textAlign: 'left' }}>
              <i className="bi bi-arrow-return-left" style={{ marginRight: 6 }} />Devolver — retornar as peças a um setor
            </button>
            <button onClick={() => setShowNaoEntregue(false)}
              style={{ background: 'none', border: '1px solid #dee2e6', borderRadius: 6, padding: '6px 12px', fontSize: 12, color: '#666', cursor: 'pointer' }}>
              Cancelar
            </button>
          </div>
        </div>
      )}

      {/* Painel enviar para setor */}
      {showEnviar && (
        <div style={{ marginTop: 10, background: '#f8f9fa', borderRadius: 6, padding: '10px 12px', display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'flex-end' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: 1, minWidth: 140 }}>
            <label style={{ fontSize: 11, color: '#555' }}>Setor destino:</label>
            <select value={setorDestino} onChange={e => setSetorDestino(e.target.value)}
              style={{ border: '1px solid #dee2e6', borderRadius: 5, padding: '5px 8px', fontSize: 12 }}>
              <option value="">Selecione...</option>
              {SETOR_CHOICES.filter(([cod]) => cod !== parcial.setor_atual).map(([cod, nome]) => (
                <option key={cod} value={cod}>{nome}</option>
              ))}
            </select>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <label style={{ fontSize: 11, color: '#555' }}>Quantidade:</label>
            <input type="number" value={qtdEnvio} onChange={e => setQtdEnvio(e.target.value)}
              placeholder={`Máx: ${fmtQtd(parcial.quantidade)}`}
              style={{ border: '1px solid #dee2e6', borderRadius: 5, padding: '5px 8px', fontSize: 13, width: 90 }} />
          </div>
          <button onClick={() => {
            if (!setorDestino) { alert('Selecione o setor destino'); return; }
            const qtd = Number(qtdEnvio) || Number(parcial.quantidade);
            acao('mover', { setor_destino: setorDestino, quantidade: qtd });
            setShowEnviar(false);
          }} disabled={loading} style={{ background: '#0d6efd', color: '#fff', border: 'none', borderRadius: 5, padding: '6px 14px', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
            Confirmar envio
          </button>
          <button onClick={() => setShowEnviar(false)}
            style={{ background: 'none', border: '1px solid #dee2e6', borderRadius: 5, padding: '6px 10px', fontSize: 12, color: '#888', cursor: 'pointer' }}>
            ✕
          </button>
        </div>
      )}

      {/* Painel devolver */}
      {showDevolver && (
        <div style={{ marginTop: 10, background: '#fff8f8', border: '1px solid #f5c2c7', borderRadius: 6, padding: 12 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: '#842029', marginBottom: 8 }}>Devolver para qual setor?</div>
          <select value={setorDev} onChange={e => setSetorDev(e.target.value)}
            style={{ width: '100%', border: '1px solid #dee2e6', borderRadius: 5, padding: '6px 8px', fontSize: 13, marginBottom: 8 }}>
            <option value="">Selecione o setor...</option>
            {SETOR_CHOICES.filter(([cod]) => cod !== parcial.setor_atual).map(([cod, nome]) => (
              <option key={cod} value={cod}>{nome}</option>
            ))}
          </select>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => { if (!setorDev) return; acao('devolver', { setor_destino: setorDev }); setShowDevolver(false); }}
              style={{ flex: 1, background: '#dc3545', color: '#fff', border: 'none', borderRadius: 5, padding: '7px 0', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
              Confirmar devolução
            </button>
            <button onClick={() => setShowDevolver(false)}
              style={{ background: 'none', border: '1px solid #dee2e6', borderRadius: 5, padding: '7px 14px', fontSize: 13, color: '#666', cursor: 'pointer' }}>
              Cancelar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function PedidoGrupos({ grupos, onRefresh }: { grupos: [string, ItemPedido[]][]; onRefresh: () => void }) {
  const [abertos, setAbertos] = useState<Set<string>>(new Set());

  function toggle(chave: string) {
    setAbertos(prev => {
      const next = new Set(prev);
      if (next.has(chave)) next.delete(chave);
      else next.add(chave);
      return next;
    });
  }

  const hoje = new Date().toISOString().slice(0, 10);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {grupos.map(([numeroPedido, itens]) => {
        const rep = itens[0];
        const atrasado = rep.pedido_prazo && rep.pedido_prazo < hoje;
        const aberto = abertos.has(numeroPedido);

        // Status resumido dos itens
        const statusCounts: Record<string, number> = {};
        for (const i of itens) statusCounts[i.status] = (statusCounts[i.status] || 0) + 1;
        const statusChips = Object.entries(statusCounts).map(([st, qt]) => {
          const badge = BADGE_STATUS[st] || { bg: '#e2e3e5', color: '#333' };
          return (
            <span key={st} style={{ fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 10, background: badge.bg, color: badge.color }}>
              {qt}× {STATUS_LABELS[st] || st}
            </span>
          );
        });

        return (
          <div key={numeroPedido} style={{
            border: atrasado ? '1.5px solid #fca5a5' : '1px solid #e2e8f0',
            borderRadius: 10, overflow: 'hidden',
            background: '#fff',
            boxShadow: '0 1px 4px rgba(0,0,0,.06)',
          }}>
            {/* Cabeçalho clicável */}
            <button
              onClick={() => toggle(numeroPedido)}
              style={{
                width: '100%', textAlign: 'left', background: atrasado ? '#fef2f2' : '#f8fafc',
                border: 'none', borderBottom: aberto ? '1px solid #e2e8f0' : 'none',
                padding: '12px 16px', cursor: 'pointer', display: 'flex',
                alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <span style={{ fontWeight: 700, fontSize: 15, color: '#1a3a5c' }}>{numeroPedido}</span>
                <span className={`badge-${rep.pedido_prioridade || 'normal'}`}>
                  {rep.pedido_prioridade?.charAt(0).toUpperCase()}{rep.pedido_prioridade?.slice(1)}
                </span>
                {atrasado && (
                  <span style={{ fontSize: 11, fontWeight: 700, color: '#dc2626', background: '#fee2e2', padding: '2px 8px', borderRadius: 4 }}>
                    <i className="bi bi-clock-fill" style={{ marginRight: 4 }}></i>ATRASADO
                  </span>
                )}
                <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>{statusChips}</div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 11, color: '#888' }}>
                {rep.pedido_prazo && (
                  <span><i className="bi bi-calendar3" style={{ marginRight: 4 }}></i>{rep.pedido_prazo}</span>
                )}
                <span style={{ fontWeight: 600 }}>{itens.length} {itens.length === 1 ? 'item' : 'itens'}</span>
                <i className={`bi bi-chevron-${aberto ? 'up' : 'down'}`} style={{ fontSize: 13, color: '#64748b' }}></i>
              </div>
            </button>

            {/* Itens expandidos */}
            {aberto && (
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                {itens.map((item, idx) => (
                  <div key={item.id} style={{
                    borderTop: idx > 0 ? '1px solid #f1f5f9' : undefined,
                    padding: '14px 16px',
                  }}>
                    <ItemCard item={item} onRefresh={onRefresh} ocultarCabecalhoPedido />
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

type FiltroLogistica = 'todos' | 'aguardando' | 'recebido' | 'em_transito';

const FILTROS_LOGISTICA: { key: FiltroLogistica; label: string; icon: string; cor: string }[] = [
  { key: 'todos',       label: 'Todos',        icon: 'bi-list-ul',          cor: '#6b7280' },
  { key: 'aguardando',  label: 'Aguardando',   icon: 'bi-hourglass-split',  cor: '#0d6efd' },
  { key: 'recebido',    label: 'Recebido',     icon: 'bi-box-seam-fill',    cor: '#16a34a' },
  { key: 'em_transito', label: 'Em Trânsito',  icon: 'bi-truck',            cor: '#fd7e14' },
];

export default function SetorPainelPage({ params }: { params: { setor: string } }) {
  // Navegação client-side (Link) pode entregar o segmento dinâmico ainda
  // percent-encoded quando contém acentos (ex: "maçarico" -> "ma%C3%A7arico").
  // decodeURIComponent é seguro mesmo se já vier decodificado.
  let setor = params.setor;
  try { setor = decodeURIComponent(setor); } catch { /* já decodificado */ }
  const nomeSetor = NOMES[setor] || setor;
  const [data, setData] = useState<SetorPainelData | null>(null);
  const [loading, setLoading] = useState(false);
  const [filtroLog, setFiltroLog] = useState<FiltroLogistica>('todos');

  const carregar = useCallback(() => {
    getSetorPainel(setor).then(d => { setData(d); setLoading(false); }).catch(() => setLoading(false));
  }, [setor]);

  useEffect(() => {
    setLoading(true);
    carregar();
  }, [setor]);

  return (
    <AuthGuard>
      <NotificacoesLive filtroSetor={setor} />
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: setor === 'logistica' ? 12 : 18, flexWrap: 'wrap', gap: 10 }}>
        <h4 style={{ margin: 0, fontWeight: 700, color: '#1a3a5c', fontSize: 20 }}>
          <i className={`bi ${setor === 'logistica' ? 'bi-truck' : 'bi-tools'}`} style={{ marginRight: 8 }}></i>
          {nomeSetor}
        </h4>
        <button onClick={carregar}
          style={{ background: 'none', border: '1px solid #dee2e6', borderRadius: 5, padding: '5px 14px', fontSize: 13, color: '#0d6efd', cursor: 'pointer' }}>
          <i className="bi bi-arrow-clockwise" style={{ marginRight: 4 }}></i>Atualizar
        </button>
      </div>

      {/* Filtros da Logística */}
      {setor === 'logistica' && data && (
        <div style={{ display: 'flex', gap: 6, marginBottom: 18, flexWrap: 'wrap' }}>
          {FILTROS_LOGISTICA.map(f => {
            const count = f.key === 'todos'
              ? data.itens.length
              : data.itens.filter(i => i.status === f.key).length;
            const ativo = filtroLog === f.key;
            return (
              <button key={f.key} onClick={() => setFiltroLog(f.key)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  padding: '6px 14px', borderRadius: 20, fontSize: 12, fontWeight: 600, cursor: 'pointer',
                  border: ativo ? `2px solid ${f.cor}` : '2px solid #e5e7eb',
                  background: ativo ? f.cor : '#fff',
                  color: ativo ? '#fff' : '#6b7280',
                  transition: 'all .15s',
                }}>
                <i className={`bi ${f.icon}`} />
                {f.label}
                <span style={{
                  background: ativo ? 'rgba(255,255,255,.3)' : '#e5e7eb',
                  color: ativo ? '#fff' : '#374151',
                  borderRadius: 10, padding: '1px 7px', fontSize: 11, fontWeight: 700,
                }}>{count}</span>
              </button>
            );
          })}
        </div>
      )}

      {loading && <p style={{ color: '#999', textAlign: 'center', padding: 40 }}>Carregando...</p>}

      {data && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>

          {/* Lotes chegando — exclui itens que já chegam como parcial individual */}
          {(() => {
            const itemIdsComParcial = new Set((data.parciais || []).map(p => p.item_pedido_id));
            const lotesVisiveis = data.lotes_chegando.filter(
              l => !itemIdsComParcial.has((l as unknown as Record<string, unknown>).item_pedido_id as number)
            );
            if (lotesVisiveis.length === 0) return null;
            return (
            <section>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#0d6efd', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10 }}>
                <i className="bi bi-arrow-down-circle" style={{ marginRight: 6 }}></i>
                Lotes Chegando ({lotesVisiveis.length})
              </div>
              <div className="grid-3">
                {lotesVisiveis.map(l => (
                  <LoteCard key={l.id} lote={l as LoteItem & Record<string, unknown>} tipo="chegando" onRefresh={carregar} />
                ))}
              </div>
            </section>
            );
          })()}


          {/* Parciais chegando neste setor */}
          {(() => {
            const itemIdsNoSetor = new Set(data.itens.map(i => i.id));
            const parciaisExternas = (data.parciais || []).filter(p =>
              !itemIdsNoSetor.has(p.item_pedido_id)
            );
            if (parciaisExternas.length === 0) return null;

            return (
              <section>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#0369a1', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10 }}>
                  <i className="bi bi-diagram-3-fill" style={{ marginRight: 6 }} />
                  Itens Parciais ({parciaisExternas.length})
                  <span style={{ marginLeft: 8, fontWeight: 400, textTransform: 'none', fontSize: 10, color: '#64748b' }}>
                    peças enviadas parcialmente para este setor
                  </span>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {parciaisExternas.map(p => (
                    <div key={p.id} style={{
                      border: p.status === 'em_andamento' ? '1.5px solid #86efac' : '1px solid #bfdbfe',
                      borderRadius: 10, background: '#fff',
                      boxShadow: '0 1px 4px rgba(0,0,0,.06)',
                      padding: '14px 16px',
                    }}>
                      <ParcialCard parcial={p} onRefresh={carregar} />
                    </div>
                  ))}
                </div>
              </section>
            );
          })()}

          {/* Todos os itens — agrupados por pedido */}
          {(() => {
            const itensFiltrados = setor === 'logistica' && filtroLog !== 'todos'
              ? data.itens.filter(i => i.status === filtroLog)
              : data.itens;

            // Agrupar por pedido
            const pedidoMap = new Map<string, ItemPedido[]>();
            for (const item of itensFiltrados) {
              const chave = item.pedido_numero || String(item.id);
              if (!pedidoMap.has(chave)) pedidoMap.set(chave, []);
              pedidoMap.get(chave)!.push(item);
            }
            const grupos = Array.from(pedidoMap.entries());

            return (
              <section>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#555', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10 }}>
                  <i className="bi bi-list-ul" style={{ marginRight: 6 }}></i>
                  Itens no Setor ({itensFiltrados.length}{itensFiltrados.length !== data.itens.length ? ` de ${data.itens.length}` : ''})
                </div>
                {grupos.length === 0 && (
                  <p style={{ color: '#999', fontSize: 13, textAlign: 'center', padding: 24 }}>
                    {filtroLog !== 'todos' ? `Nenhum item com status "${FILTROS_LOGISTICA.find(f => f.key === filtroLog)?.label}".` : 'Nenhum item neste setor.'}
                  </p>
                )}
                <PedidoGrupos grupos={grupos} onRefresh={carregar} />
              </section>
            );
          })()}
        </div>
      )}
    </AuthGuard>
  );
}
