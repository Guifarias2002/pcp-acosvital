'use client';
import { useEffect, useState, useCallback, useRef } from 'react';
import AuthGuard from '@/components/AuthGuard';
import { getSetorPainel, itemAcao, loteAcao, parcialAcao } from '@/lib/api';
import { SetorPainelData, ItemPedido, LoteItem, ItemParcial, STATUS_LABELS, PRIORIDADE_COR, NOMES, SETOR_CHOICES } from '@/lib/types';
import { fmtQtd } from '@/lib/format';
import Link from 'next/link';
import ReceberModal from '@/components/ReceberModal';
import NotificacoesLive from '@/components/NotificacoesLive';
import { useRealtime } from '@/hooks/useRealtime';
import ConfirmModal from '@/components/ConfirmModal';
import EntregarModal from '@/components/EntregarModal';
import DespacharModal from '@/components/DespacharModal';
import DivergenciaResolucaoModal from '@/components/DivergenciaResolucaoModal';

function useToast() {
  const [toast, setToast] = useState<{ msg: string; tipo: 'erro' | 'ok' } | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  function mostrar(msg: string, tipo: 'erro' | 'ok' = 'erro') {
    if (timerRef.current) clearTimeout(timerRef.current);
    setToast({ msg, tipo });
    timerRef.current = setTimeout(() => setToast(null), 5000);
  }
  function fechar() { setToast(null); }
  return { toast, mostrar, fechar };
}

function Toast({ toast, fechar }: { toast: { msg: string; tipo: 'erro' | 'ok' } | null; fechar: () => void }) {
  if (!toast) return null;
  const isErro = toast.tipo === 'erro';
  return (
    <>
    <style>{`@keyframes slideInRight{from{transform:translateX(110%);opacity:0}to{transform:translateX(0);opacity:1}}`}</style>
    <div className="toast-fixed" style={{
      position: 'fixed', top: 20, right: 20, zIndex: 9999,
      background: isErro ? '#fee2e2' : '#dcfce7',
      border: `1.5px solid ${isErro ? '#fca5a5' : '#86efac'}`,
      borderRadius: 10, padding: '14px 18px',
      boxShadow: '0 4px 20px rgba(0,0,0,0.15)',
      display: 'flex', alignItems: 'flex-start', gap: 12, maxWidth: 380, minWidth: 280,
      animation: 'slideInRight 0.25s ease',
    }}>
      <span style={{ fontSize: 20, lineHeight: 1 }}>{isErro ? '⚠️' : '✅'}</span>
      <div style={{ flex: 1 }}>
        <div style={{ fontWeight: 700, fontSize: 13, color: isErro ? '#991b1b' : '#166534', marginBottom: 2 }}>
          {isErro ? 'Ação não permitida' : 'Sucesso'}
        </div>
        <div style={{ fontSize: 13, color: isErro ? '#7f1d1d' : '#14532d', lineHeight: 1.4 }}>{toast.msg}</div>
      </div>
      <button onClick={fechar} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 16, color: '#9ca3af', padding: 0, lineHeight: 1 }}>✕</button>
    </div>
    </>
  );
}

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
  const { toast: toastItem, mostrar: mostrarErroItem, fechar: fecharToastItem } = useToast();
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
    catch (e: unknown) { mostrarErroItem(erroMsg(e)); }
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
    } catch (e: unknown) { mostrarErroItem(erroMsg(e)); }
    finally { setLoading(false); }
  }

  const badge = BADGE_STATUS[item.status] || { bg: '#e2e3e5', color: '#333' };

  return (
    <>
    <Toast toast={toastItem} fechar={fecharToastItem} />
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
    </>
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

function ParcialCard({ parcial, onRefresh, hideHeader }: { parcial: ItemParcial; onRefresh: () => void; hideHeader?: boolean }) {
  const { toast: toastParcial, mostrar: mostrarErroParcial, fechar: fecharToastParcial } = useToast();
  const [loading, setLoading] = useState(false);
  const [showEnviar, setShowEnviar] = useState(false);
  const [showDevolver, setShowDevolver] = useState(false);
  const [showNaoEntregue, setShowNaoEntregue] = useState(false);
  const [showDivQualidade, setShowDivQualidade] = useState(false);
  const [showReceberModal, setShowReceberModal] = useState(false);
  const [recebidoSemIniciar, setRecebidoSemIniciar] = useState(false);
  const [qtdEnvio, setQtdEnvio] = useState('');
  const [setorDestino, setSetorDestino] = useState('');
  const [setorDev, setSetorDev] = useState('');
  const [setorRetrabalho, setSetorRetrabalho] = useState('');
  const [motivoDiv, setMotivoDiv] = useState('');
  const [confirm, setConfirm] = useState<{ titulo: string; mensagem: string; acao: () => void; perigo?: boolean } | null>(null);
  const isLogistica = parcial.setor_atual === 'logistica';
  const isQualidade = parcial.setor_atual === 'qualidade';

  async function aprovarQualidadeParcial() {
    if (loading) return;
    const destino = setorDestino || parcial.proximo_setor || '';
    if (!destino) { mostrarErroParcial('Selecione o setor destino'); return; }
    setLoading(true);
    try {
      await parcialAcao(parcial.id, 'finalizar');
      await parcialAcao(parcial.id, 'mover', { setor_destino: destino, quantidade: Number(parcial.quantidade) });
      onRefresh();
    } catch (e: unknown) { mostrarErroParcial(erroMsg(e)); }
    finally { setLoading(false); }
  }

  function erroMsg(e: unknown) {
    const ax = e as { response?: { data?: { erro?: string }; status?: number } };
    return ax?.response?.data?.erro || `Erro ${ax?.response?.status || ''}`.trim() || String(e);
  }

  async function acao(a: string, body?: Record<string, unknown>, msgSucesso?: string) {
    if (loading) return;
    setLoading(true);
    try {
      await parcialAcao(parcial.id, a, body);
      if (msgSucesso) mostrarErroParcial(msgSucesso, 'ok');
      onRefresh();
    }
    catch (e: unknown) { mostrarErroParcial(erroMsg(e)); }
    finally { setLoading(false); }
  }

  const isAberto    = parcial.status === 'em_aberto';
  const isAndamento = parcial.status === 'em_andamento';
  const isPausado   = parcial.status === 'pausado';
  const isFinalizado = parcial.status === 'finalizado_setor';
  const badge = BADGE_PARCIAL[parcial.status] || { bg: '#e2e3e5', color: '#333' };
  const foraDoRoteiro = !parcial.proximo_setor && !isLogistica;

  const btnStyle = (bg: string, outline = false): React.CSSProperties => ({
    background: outline ? 'none' : bg,
    color: outline ? bg : '#fff',
    border: outline ? `1px solid ${bg}` : 'none',
    borderRadius: 5, padding: '6px 14px', fontSize: 12, fontWeight: 700,
    cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.6 : 1,
  });

  return (
    <>
    <Toast toast={toastParcial} fechar={fecharToastParcial} />
    <div style={{ border: parcial.retrabalho ? '1.5px solid #fbbf24' : '1px solid #dde3f0', borderRadius: 10, overflow: 'hidden', background: '#fff', opacity: loading ? .6 : 1 }}>
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

      {/* Cabeçalho do pedido */}
      {!hideHeader && <div style={{ background: parcial.retrabalho ? '#fffbeb' : '#f8fafc', borderBottom: '1px solid #e2e8f0', padding: '10px 14px' }}>
        {/* Linha 1: produto em destaque */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 5 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 15, fontWeight: 800, color: '#1a3a5c', letterSpacing: -0.3 }}>{parcial.item_descricao || parcial.item_codigo}</span>
            {parcial.prioridade && (
              <span className={`badge-${parcial.prioridade}`} style={{ fontSize: 10 }}>
                {parcial.prioridade.charAt(0).toUpperCase() + parcial.prioridade.slice(1)}
              </span>
            )}
          </div>
          {parcial.pedido_prazo && (
            <span style={{ fontSize: 10, color: '#94a3b8' }}>
              <i className="bi bi-calendar3" style={{ marginRight: 3 }} />{parcial.pedido_prazo}
            </span>
          )}
        </div>
        {/* Linha 2: PV e OP com labels */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
          <span>
            <span style={{ fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase', fontSize: 9, letterSpacing: 0.5, marginRight: 4 }}>PV</span>
            <span style={{ fontWeight: 800, color: '#1a3a5c', fontSize: 15 }}>{parcial.numero_pedido_venda}</span>
          </span>
          {(parcial as any).numero_op && (
            <span>
              <span style={{ fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase', fontSize: 9, letterSpacing: 0.5, marginRight: 4 }}>OP</span>
              <span style={{ fontWeight: 800, color: '#1a3a5c', fontSize: 15 }}>{(parcial as any).numero_op}</span>
            </span>
          )}
          <span>
            <span style={{ fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase', fontSize: 9, letterSpacing: 0.5, marginRight: 4 }}>Cód</span>
            <span style={{ fontWeight: 800, color: '#475569', fontSize: 15 }}>{parcial.item_codigo}</span>
          </span>
        </div>
        {/* Linha 3: status + link */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6 }}>
          <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 4, fontWeight: 600, background: badge.bg, color: badge.color }}>
            {LABEL_PARCIAL[parcial.status] || parcial.status}
          </span>
          <Link href={`/parcial/${parcial.id}`} title="Ver detalhe" style={{ color: '#0d6efd', fontSize: 14, textDecoration: 'none' }}>
            <i className="bi bi-eye" />
          </Link>
        </div>
      </div>}

      {/* Quando hideHeader, mostrar linha compacta de identificação */}
      {hideHeader && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 14px', background: '#f8fafc', borderBottom: '1px solid #e9ecef' }}>
          <span style={{ fontSize: 12, color: '#64748b', fontWeight: 600 }}>Parcial <span style={{ color: '#1a3a5c', fontWeight: 800 }}>#{parcial.id}</span></span>
          <span style={{ fontWeight: 700, color: '#0d6efd', fontSize: 13 }}>{fmtQtd(parcial.quantidade)} {parcial.unidade}</span>
          <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 4, fontWeight: 600, background: badge.bg, color: badge.color }}>
            {LABEL_PARCIAL[parcial.status] || parcial.status}
          </span>
          {parcial.retrabalho && <span style={{ fontSize: 11, color: '#b45309', fontWeight: 700 }}>⚠ Retrabalho</span>}
          <Link href={`/parcial/${parcial.id}`} title="Ver detalhe" style={{ color: '#0d6efd', fontSize: 13, textDecoration: 'none', marginLeft: 'auto' }}>
            <i className="bi bi-eye" />
          </Link>
        </div>
      )}

      {/* Corpo */}
      <div style={{ padding: '12px 14px' }}>

        {/* Banner retrabalho */}
        {parcial.retrabalho && (
          <div style={{ background: '#fef3c7', border: '1px solid #fcd34d', borderRadius: 6, padding: '6px 10px', marginBottom: 10, display: 'flex', alignItems: 'flex-start', gap: 8 }}>
            <span style={{ fontSize: 14 }}>⚠</span>
            <div>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#92400e' }}>Retrabalho — devolvido da Inspeção de Qualidade</div>
              {parcial.motivo_retrabalho && <div style={{ fontSize: 11, color: '#78350f' }}>Motivo: {parcial.motivo_retrabalho}</div>}
            </div>
          </div>
        )}

        {/* Banner fora do roteiro */}
        {foraDoRoteiro && (isAndamento || isPausado || isFinalizado) && (
          <div style={{ background: '#fffbeb', border: '1.5px solid #f59e0b', borderRadius: 6, padding: '8px 12px', marginBottom: 10 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#92400e', marginBottom: 4 }}>
              ⚠ Parcial fora do roteiro desta ordem de produção
            </div>
            <div style={{ fontSize: 11, color: '#78350f', lineHeight: 1.5, marginBottom: parcial.outras_parciais?.length ? 6 : 0 }}>
              Selecione manualmente o setor destino para prosseguir.
            </div>
            {parcial.outras_parciais && parcial.outras_parciais.length > 0 && (
              <div style={{ fontSize: 11, color: '#78350f' }}>
                <strong>Outras peças deste item:</strong>{' '}
                {parcial.outras_parciais.map((op, i) => (
                  <span key={i} style={{ display: 'inline-block', margin: '2px 4px', background: '#fef3c7', border: '1px solid #fcd34d', borderRadius: 4, padding: '2px 6px', fontWeight: 600 }}>
                    {fmtQtd(op.quantidade)} {op.unidade} → {op.setor_nome}
                  </span>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Quantidade + rastreabilidade */}
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 6 }}>
          <span style={{ fontSize: 20, fontWeight: 800, color: '#1d4ed8' }}>{fmtQtd(parcial.quantidade)}</span>
          <span style={{ fontSize: 13, color: '#64748b' }}>{parcial.unidade}</span>
          {parcial.quantidade_total_item && (
            <span style={{ fontSize: 11, color: '#94a3b8' }}>de {fmtQtd(parcial.quantidade_total_item)} totais</span>
          )}
        </div>

        {/* Outras parciais do mesmo item */}
        {parcial.outras_parciais && parcial.outras_parciais.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
            {parcial.outras_parciais.map((op, i) => {
              const stLabel: Record<string, string> = { em_aberto: 'Aguardando', em_andamento: 'Em Andamento', finalizado_setor: 'Finalizado', pausado: 'Pausado' };
              const stColor: Record<string, string> = { em_aberto: '#64748b', em_andamento: '#854d0e', finalizado_setor: '#14532d', pausado: '#991b1b' };
              const stBg: Record<string, string> = { em_aberto: '#f1f5f9', em_andamento: '#fef9c3', finalizado_setor: '#dcfce7', pausado: '#fee2e2' };
              return (
                <span key={i} style={{ fontSize: 11, background: stBg[op.status] || '#f1f5f9', border: op.retrabalho ? '1px solid #fbbf24' : '1px solid #e2e8f0', borderRadius: 5, padding: '3px 8px', color: stColor[op.status] || '#374151', display: 'flex', alignItems: 'center', gap: 4 }}>
                  {op.retrabalho && '⚠ '}<strong>{fmtQtd(op.quantidade)} {op.unidade}</strong> em {op.setor_nome}
                  <span style={{ opacity: 0.7 }}>· {stLabel[op.status] || op.status}</span>
                </span>
              );
            })}
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
        {!isLogistica && isAberto && !recebidoSemIniciar && (
          <button onClick={() => setShowReceberModal(true)} disabled={loading} style={btnStyle('#d97706')}>
            <i className="bi bi-box-arrow-in-down" style={{ marginRight: 5 }} />Receber
          </button>
        )}
        {!isLogistica && isAberto && recebidoSemIniciar && (
          <button onClick={() => acao('iniciar')} disabled={loading} style={btnStyle('#198754')}>
            <i className="bi bi-play-fill" style={{ marginRight: 5 }} />Iniciar produção
          </button>
        )}

        {!isLogistica && isAndamento && isQualidade && (
          <>
            {!showDivQualidade && (
              <>
                <select value={setorDestino || parcial.proximo_setor || ''} onChange={e => setSetorDestino(e.target.value)}
                  style={{ border: '1px solid #dee2e6', borderRadius: 5, padding: '5px 8px', fontSize: 12 }}>
                  {!parcial.proximo_setor && !setorDestino && <option value="">Selecione o setor...</option>}
                  {SETOR_CHOICES.filter(([cod]) => cod !== parcial.setor_atual).map(([cod, nome]) => (
                    <option key={cod} value={cod}>{nome}{cod === parcial.proximo_setor ? ' ✓' : ''}</option>
                  ))}
                </select>
                <button onClick={aprovarQualidadeParcial} disabled={loading} style={btnStyle('#1a3a5c')}>
                  <i className="bi bi-send-fill" style={{ marginRight: 5 }} />Enviar tudo
                </button>
                <button onClick={() => setShowEnviar(v => !v)} disabled={loading} style={btnStyle('#0d6efd')}>
                  <i className="bi bi-send" style={{ marginRight: 5 }} />Enviar parcial
                </button>
              </>
            )}
            <button onClick={() => { setShowDivQualidade(v => !v); setShowEnviar(false); }} disabled={loading} style={btnStyle('#f97316')}>
              ⚠ Divergência
            </button>
          </>
        )}

        {!isLogistica && isAndamento && !isQualidade && (
          <>
            <button onClick={() => setConfirm({
              titulo: 'Finalizar etapa',
              mensagem: `Confirma que a etapa de ${NOMES[parcial.setor_atual] || parcial.setor_atual} foi concluída?`,
              acao: () => acao('finalizar'),
            })} disabled={loading} style={btnStyle('#198754')}>
              <i className="bi bi-check-lg" style={{ marginRight: 5 }} />Finalizar etapa
            </button>
            <button onClick={() => { setShowEnviar(v => !v); if (!setorDestino) setSetorDestino(parcial.proximo_setor || ''); }} disabled={loading} style={btnStyle('#1a3a5c')}>
              <i className="bi bi-send-fill" style={{ marginRight: 5 }} />Enviar ao próximo setor
            </button>
            <button onClick={() => setConfirm({
              titulo: 'Encerrar Parcial',
              mensagem: 'As peças já foram processadas e não precisam ir a outro setor. Deseja encerrar esta parcial como concluída?',
              acao: () => acao('concluir'),
            })} disabled={loading} style={btnStyle('#198754', true)}>
              ✓ Encerrar
            </button>
            <button onClick={() => acao('pausar')} disabled={loading} style={btnStyle('#fd7e14')}>
              <i className="bi bi-pause-fill" style={{ marginRight: 5 }} />Pausar
            </button>
          </>
        )}

        {!isLogistica && isPausado && (
          <>
            <button onClick={() => acao('retomar')} disabled={loading} style={btnStyle('#198754')}>
              <i className="bi bi-play-fill" style={{ marginRight: 5 }} />Retomar
            </button>
            <button onClick={() => { setShowEnviar(v => !v); if (!setorDestino) setSetorDestino(parcial.proximo_setor || ''); }} disabled={loading} style={btnStyle('#1a3a5c')}>
              <i className="bi bi-send-fill" style={{ marginRight: 5 }} />Enviar ao próximo setor
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

        {!isLogistica && isFinalizado && (
          <>
            {!showDivQualidade && (
              <button onClick={() => { setShowEnviar(v => !v); if (!setorDestino) setSetorDestino(parcial.proximo_setor || ''); }} disabled={loading} style={btnStyle('#1a3a5c')}>
                <i className="bi bi-send-fill" style={{ marginRight: 5 }} />Enviar ao próximo setor
              </button>
            )}
            {isQualidade && (
              <button onClick={() => { setShowDivQualidade(v => !v); setShowEnviar(false); }} disabled={loading} style={btnStyle('#f97316')}>
                ⚠ Divergência
              </button>
            )}
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

      {/* Modal receber parcial */}
      {!isLogistica && isAberto && showReceberModal && (
        <ReceberModal
          quantidade={parcial.quantidade}
          unidade={parcial.unidade || 'un'}
          setor={parcial.setor_atual_nome}
          itemCodigo={parcial.item_codigo}
          itemDescricao={parcial.item_descricao}
          loading={loading}
          onCancel={() => setShowReceberModal(false)}
          onConfirm={async (decisao, _qtd, obs) => {
            setShowReceberModal(false);
            if (decisao === 'iniciar') { acao('iniciar'); }
            else if (decisao === 'preparar') {
              setLoading(true);
              try {
                await parcialAcao(parcial.id, 'receber');
                setRecebidoSemIniciar(true);
                mostrarErroParcial('Recebimento confirmado — clique em Iniciar quando estiver pronto', 'ok');
              } catch (e: unknown) { mostrarErroParcial(erroMsg(e)); }
              finally { setLoading(false); }
            } else { acao('pausar', { observacao: obs || 'Divergência no recebimento' }); }
          }}
        />
      )}

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
        <div style={{ marginTop: 10, background: foraDoRoteiro ? '#fffbeb' : '#f8f9fa', border: foraDoRoteiro ? '1.5px solid #f59e0b' : 'none', borderRadius: 6, padding: '10px 12px', display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'flex-end' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: 1, minWidth: 140 }}>
            <label style={{ fontSize: 11, color: foraDoRoteiro ? '#92400e' : '#555', fontWeight: foraDoRoteiro ? 700 : 400 }}>
              {foraDoRoteiro ? '⚠ Selecione o setor destino:' : 'Setor destino:'}
            </label>
            <select value={setorDestino || parcial.proximo_setor || ''} onChange={e => setSetorDestino(e.target.value)}
              style={{ border: foraDoRoteiro ? '2px solid #f59e0b' : '1px solid #dee2e6', borderRadius: 5, padding: '5px 8px', fontSize: 12 }}>
              <option value="">Selecione o setor...</option>
              {SETOR_CHOICES.filter(([cod]) => cod !== parcial.setor_atual).map(([cod, nome]) => (
                <option key={cod} value={cod}>{nome}{cod === parcial.proximo_setor ? ' ✓' : ''}</option>
              ))}
            </select>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <label style={{ fontSize: 11, color: '#555' }}>Quantidade:</label>
            <input type="number" value={qtdEnvio}
              onChange={e => {
                const v = e.target.value;
                const max = Number(parcial.quantidade);
                if (v === '' || Number(v) <= max) setQtdEnvio(v);
                else setQtdEnvio(String(max));
              }}
              min={1} max={Number(parcial.quantidade)}
              placeholder={`Máx: ${fmtQtd(parcial.quantidade)}`}
              style={{ border: '1px solid #dee2e6', borderRadius: 5, padding: '5px 8px', fontSize: 13, width: 90 }} />
          </div>
          <button onClick={() => {
            const dest = setorDestino || parcial.proximo_setor || '';
            if (!dest) { mostrarErroParcial('Selecione o setor destino'); return; }
            const qtd = Number(qtdEnvio) || Number(parcial.quantidade);
            acao('mover', { setor_destino: dest, quantidade: qtd });
            setShowEnviar(false);
          }} disabled={loading || (!setorDestino && !parcial.proximo_setor)}
            style={{ background: '#0d6efd', color: '#fff', border: 'none', borderRadius: 5, padding: '6px 14px', fontSize: 12, fontWeight: 700, cursor: (loading || (!setorDestino && !parcial.proximo_setor)) ? 'not-allowed' : 'pointer', opacity: (!setorDestino && !parcial.proximo_setor) ? 0.4 : 1 }}>
            Confirmar envio
          </button>
          <button onClick={() => setShowEnviar(false)}
            style={{ background: 'none', border: '1px solid #dee2e6', borderRadius: 5, padding: '6px 10px', fontSize: 12, color: '#888', cursor: 'pointer' }}>
            ✕
          </button>
        </div>
      )}

      {/* Painel divergência qualidade */}
      {showDivQualidade && isQualidade && (
        <div style={{ marginTop: 10, background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: 8, padding: 14 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#c2410c', marginBottom: 8 }}>⚠ Pedido com divergência</div>
          <div style={{ marginBottom: 10 }}>
            <label style={{ fontSize: 11, fontWeight: 600, color: '#555', display: 'block', marginBottom: 4 }}>
              Motivo da divergência: <span style={{ color: '#dc2626' }}>*</span>
            </label>
            <textarea value={motivoDiv} onChange={e => setMotivoDiv(e.target.value)}
              placeholder="Descreva o problema encontrado..."
              rows={3}
              style={{ width: '100%', border: '1px solid #fed7aa', borderRadius: 6, padding: '6px 8px', fontSize: 12, resize: 'none', boxSizing: 'border-box' }} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
            <button onClick={async () => {
              if (!motivoDiv.trim()) { mostrarErroParcial('Informe o motivo da divergência.'); return; }
              setShowDivQualidade(false);
              setLoading(true);
              try {
                if (parcial.status === 'finalizado_setor') await parcialAcao(parcial.id, 'retomar');
                await parcialAcao(parcial.id, 'pausar', { observacao: motivoDiv });
                setMotivoDiv('');
                onRefresh();
              } catch (e: unknown) { mostrarErroParcial(erroMsg(e)); }
              finally { setLoading(false); }
            }} disabled={loading || !motivoDiv.trim()}
              style={{ background: '#fef9c3', border: '1px solid #fde047', borderRadius: 6, padding: '10px 8px', fontSize: 12, fontWeight: 600, color: '#854d0e', cursor: motivoDiv.trim() ? 'pointer' : 'not-allowed', textAlign: 'center', opacity: motivoDiv.trim() ? 1 : 0.5 }}>
              ⏸ Segurar<br/>para revisão
            </button>
            <button onClick={() => setShowDevolver(v => !v)} disabled={loading || !motivoDiv.trim()}
              style={{ background: '#ffedd5', border: '1px solid #fed7aa', borderRadius: 6, padding: '10px 8px', fontSize: 12, fontWeight: 600, color: '#c2410c', cursor: motivoDiv.trim() ? 'pointer' : 'not-allowed', textAlign: 'center', opacity: motivoDiv.trim() ? 1 : 0.5 }}>
              ↩ Devolver para<br/>retrabalho
            </button>
          </div>
          {showDevolver && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 8 }}>
              <select value={setorRetrabalho} onChange={e => setSetorRetrabalho(e.target.value)}
                style={{ width: '100%', border: '1px solid #dee2e6', borderRadius: 5, padding: '6px 8px', fontSize: 12 }}>
                <option value="">Selecione o setor...</option>
                {SETOR_CHOICES.filter(([cod]) => cod !== parcial.setor_atual).map(([cod, nome]) => (
                  <option key={cod} value={cod}>{nome}</option>
                ))}
              </select>
              <button onClick={() => {
                if (!setorRetrabalho) return;
                acao('devolver', { setor_destino: setorRetrabalho, observacao: motivoDiv });
                setMotivoDiv(''); setShowDivQualidade(false); setShowDevolver(false);
              }} disabled={loading || !setorRetrabalho}
                style={{ width: '100%', background: '#ea580c', color: '#fff', border: 'none', borderRadius: 6, padding: '8px 0', fontSize: 12, fontWeight: 700, cursor: setorRetrabalho ? 'pointer' : 'not-allowed', opacity: setorRetrabalho ? 1 : 0.5 }}>
                Confirmar devolução
              </button>
            </div>
          )}
          <button onClick={() => { setShowDivQualidade(false); setMotivoDiv(''); setShowDevolver(false); }}
            style={{ width: '100%', background: 'none', border: '1px solid #dee2e6', borderRadius: 6, padding: '6px 12px', fontSize: 12, color: '#666', cursor: 'pointer' }}>
            Cancelar
          </button>
        </div>
      )}

      {/* Painel devolver */}
      {showDevolver && !showDivQualidade && (
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
      </div>{/* fim corpo */}
    </div>
    </>
  );
}

function ParcialGrupoCard({ parciais, onRefresh }: { parciais: ItemParcial[]; onRefresh: () => void }) {
  const { toast: toastGrupo, mostrar: mostrarErroGrupo, fechar: fecharToastGrupo } = useToast();
  const [loading, setLoading] = useState(false);
  const [confirm, setConfirm] = useState<{ titulo: string; mensagem: string; acao: () => void } | null>(null);
  const [showEnviar, setShowEnviar] = useState(false);
  const [showEnviarParcial, setShowEnviarParcial] = useState(false);
  const [showDivQualidade, setShowDivQualidade] = useState(false);
  const [showReceberModal, setShowReceberModal] = useState(false);
  const [recebidoSemIniciar, setRecebidoSemIniciar] = useState(false);
  const [qtdParcial, setQtdParcial] = useState('');
  const [showDevolver, setShowDevolver] = useState(false);
  const [setorDestino, setSetorDestino] = useState('');
  const [setorDev, setSetorDev] = useState('');
  const [setorRetrabalhoGrupo, setSetorRetrabalhoGrupo] = useState('');
  const [motivoDivGrupo, setMotivoDivGrupo] = useState('');
  const [expandido, setExpandido] = useState(false);

  if (parciais.length === 1) return <ParcialCard parcial={parciais[0]} onRefresh={onRefresh} />;

  const p0 = parciais[0];
  const totalQtd = parciais.reduce((sum, p) => sum + Number(p.quantidade), 0);
  const todosIgual = parciais.every(p => p.status === p0.status);

  async function acaoTodos(a: string, body?: Record<string, unknown>, msgSucesso?: string) {
    setLoading(true);
    try {
      for (const p of parciais) await parcialAcao(p.id, a, body);
      if (msgSucesso) mostrarErroGrupo(msgSucesso, 'ok');
      onRefresh();
    } catch (e: unknown) {
      const ax = e as { response?: { data?: { erro?: string } } };
      mostrarErroGrupo(ax?.response?.data?.erro || String(e));
    } finally { setLoading(false); }
  }

  const btnStyle = (bg: string, outline = false): React.CSSProperties => ({
    background: outline ? 'none' : bg, color: outline ? bg : '#fff',
    border: outline ? `1px solid ${bg}` : 'none',
    borderRadius: 5, padding: '6px 14px', fontSize: 12, fontWeight: 700,
    cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.6 : 1,
  });

  const badge = BADGE_PARCIAL[p0.status] || { bg: '#e2e3e5', color: '#333' };
  const isLogistica = p0.setor_atual === 'logistica';
  const isQualidadeGrupo = p0.setor_atual === 'qualidade';
  const foraDoRoteiroGrupo = !p0.proximo_setor && !isLogistica;

  async function aprovarGrupoQualidade() {
    const destino = setorDestino || p0.proximo_setor || '';
    if (!destino) { mostrarErroGrupo('Selecione o setor destino'); return; }
    setLoading(true);
    try {
      for (const p of parciais) await parcialAcao(p.id, 'finalizar');
      for (const p of parciais) await parcialAcao(p.id, 'mover', { setor_destino: destino, quantidade: Number(p.quantidade) });
      onRefresh();
    } catch (e: unknown) {
      const ax = e as { response?: { data?: { erro?: string } } };
      mostrarErroGrupo(ax?.response?.data?.erro || String(e));
    } finally { setLoading(false); }
  }

  // Situações diferentes — mostra cabeçalho + cards individuais
  if (!todosIgual) {
    const statusSet = Array.from(new Set(parciais.map(p => p.status)));
    return (
      <div style={{ border: '2px solid #e0e7ef', borderRadius: 12, overflow: 'hidden' }}>
        <div style={{ background: '#f0f4f8', padding: '10px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <span style={{ fontSize: 13, fontWeight: 700, color: '#1a3a5c' }}>{p0.numero_pedido_venda}</span>
            <span style={{ fontSize: 12, color: '#555', marginLeft: 8 }}><strong>{p0.item_codigo}</strong>{p0.item_descricao ? ` · ${p0.item_descricao}` : ''}</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: '#0d6efd' }}>{fmtQtd(String(totalQtd))} {p0.unidade}</span>
            <span style={{ fontSize: 11, color: '#888' }}>total · {parciais.length} parciais</span>
            {statusSet.map(s => {
              const b = BADGE_PARCIAL[s] || { bg: '#e2e3e5', color: '#333' };
              return <span key={s} style={{ fontSize: 10, padding: '2px 6px', borderRadius: 4, fontWeight: 600, background: b.bg, color: b.color }}>{LABEL_PARCIAL[s] || s}</span>;
            })}
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
          {parciais.map((p, i) => (
            <div key={p.id} style={{ padding: '12px 14px', borderTop: i > 0 ? '1px solid #e5eaf0' : 'none', background: '#fff' }}>
              <div style={{ fontSize: 11, color: '#888', marginBottom: 6 }}>
                Parcial #{p.id} · {fmtQtd(p.quantidade)} {p.unidade}
                <span style={{ marginLeft: 8, padding: '1px 6px', borderRadius: 4, fontSize: 10, fontWeight: 600, background: (BADGE_PARCIAL[p.status] || { bg: '#eee' }).bg, color: (BADGE_PARCIAL[p.status] || { color: '#333' }).color }}>
                  {LABEL_PARCIAL[p.status] || p.status}
                </span>
              </div>
              <ParcialCard parcial={p} onRefresh={onRefresh} />
            </div>
          ))}
        </div>
      </div>
    );
  }

  // Mesma situação — card unificado com ações combinadas
  const isAberto    = p0.status === 'em_aberto';
  const isAndamento = p0.status === 'em_andamento';
  const isPausado   = p0.status === 'pausado';
  const isFinalizado = p0.status === 'finalizado_setor';

  return (
    <>
    <Toast toast={toastGrupo} fechar={fecharToastGrupo} />
    <div style={{ border: isAndamento ? '1.5px solid #86efac' : '1px solid #bfdbfe', borderRadius: 10, background: '#fff', padding: '14px 16px', opacity: loading ? 0.6 : 1 }}>
      {confirm && (
        <ConfirmModal titulo={confirm.titulo} mensagem={confirm.mensagem} confirmLabel="Confirmar"
          onConfirm={() => { confirm.acao(); setConfirm(null); }} onCancel={() => setConfirm(null)} />
      )}

      {/* Cabeçalho */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 8 }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 700, color: '#1a3a5c' }}>{p0.numero_pedido_venda}</div>
          <div style={{ fontSize: 13, color: '#555' }}>
            <strong>{p0.item_codigo}</strong>
            {p0.item_descricao && <span style={{ color: '#999', marginLeft: 6 }}>{p0.item_descricao}</span>}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 4, fontWeight: 600, background: badge.bg, color: badge.color }}>
            {LABEL_PARCIAL[p0.status] || p0.status}
          </span>
          <Link href={`/item/${p0.item_pedido_id}`} title="Ver item completo (30 un)"
            style={{ color: '#0d6efd', fontSize: 14, textDecoration: 'none' }}>
            <i className="bi bi-eye" />
          </Link>
        </div>
      </div>

      {/* Banner retrabalho (grupo) */}
      {parciais.some(p => p.retrabalho) && (
        <div style={{ background: '#fff3cd', border: '1px solid #ffc107', borderRadius: 6, padding: '6px 10px', marginBottom: 8, display: 'flex', flexDirection: 'column', gap: 2 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#856404' }}>
            ⚠ Retrabalho — devolvido da Inspeção de Qualidade
          </div>
          {parciais.find(p => p.motivo_retrabalho)?.motivo_retrabalho && (
            <div style={{ fontSize: 11, color: '#664d03' }}>
              Motivo: {parciais.find(p => p.motivo_retrabalho)?.motivo_retrabalho}
            </div>
          )}
          <div style={{ fontSize: 11, color: '#664d03' }}>
            Pedido: <strong>{p0.numero_pedido_venda}</strong> · Item: <strong>{p0.item_codigo}</strong>
          </div>
        </div>
      )}

      {/* Banner fora do roteiro (grupo) */}
      {foraDoRoteiroGrupo && (isAndamento || isPausado || isFinalizado) && (
        <div style={{ background: '#fffbeb', border: '1.5px solid #f59e0b', borderRadius: 6, padding: '8px 12px', marginBottom: 8 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#92400e', marginBottom: 4 }}>
            ⚠ Parciais fora do roteiro desta ordem de produção
          </div>
          <div style={{ fontSize: 11, color: '#78350f', lineHeight: 1.5, marginBottom: (p0.outras_parciais?.length ?? 0) > 0 ? 6 : 0 }}>
            Selecione manualmente o setor destino para prosseguir.
          </div>
          {(p0.outras_parciais ?? []).length > 0 && (
            <div style={{ fontSize: 11, color: '#78350f' }}>
              <strong>Outras peças deste item:</strong>{' '}
              {(p0.outras_parciais ?? []).map((op, i) => (
                <span key={i} style={{ display: 'inline-block', margin: '2px 4px', background: '#fef3c7', border: '1px solid #fcd34d', borderRadius: 4, padding: '2px 6px', fontWeight: 600 }}>
                  {fmtQtd(op.quantidade)} {op.unidade} → {op.setor_nome}
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Rastreabilidade — outras parciais do mesmo item (grupo) */}
      {(() => {
        const outras = p0.outras_parciais ?? [];
        if (!outras.length || foraDoRoteiroGrupo) return null;
        return (
          <div style={{ background: '#f0f4ff', border: '1px solid #c7d2fe', borderRadius: 6, padding: '6px 10px', marginBottom: 8 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#3730a3', marginBottom: 4 }}>📍 Outras peças deste item:</div>
            {outras.map((op, i) => (
              <div key={i} style={{ fontSize: 11, color: '#4338ca', display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                <span style={{ fontWeight: 600 }}>{fmtQtd(op.quantidade)} {op.unidade}</span>
                <span>→</span>
                <span>{op.setor_nome}</span>
                {op.retrabalho && <span style={{ color: '#b45309', fontWeight: 600 }}>⚠ Retrabalho</span>}
                <span style={{ color: '#818cf8', fontSize: 10 }}>({op.status === 'em_aberto' ? 'Aguardando' : op.status === 'em_andamento' ? 'Em Andamento' : op.status === 'finalizado_setor' ? 'Finalizado' : op.status === 'pausado' ? 'Pausado' : op.status})</span>
              </div>
            ))}
          </div>
        );
      })()}

      {/* Quantidade total + detalhe parciais */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
        <span style={{ fontSize: 18, fontWeight: 700, color: '#0d6efd' }}>{fmtQtd(String(totalQtd))} {p0.unidade}</span>
        {p0.quantidade_total_item && (
          <span style={{ fontSize: 11, color: '#888' }}>de {fmtQtd(p0.quantidade_total_item)} totais</span>
        )}
        {p0.prioridade && (
          <span className={`badge-${p0.prioridade}`}>{p0.prioridade.charAt(0).toUpperCase() + p0.prioridade.slice(1)}</span>
        )}
      </div>

      {/* Expandir parciais individuais */}
      <button onClick={() => setExpandido(v => !v)}
        style={{ background: 'none', border: 'none', fontSize: 11, color: '#0d6efd', cursor: 'pointer', padding: 0, marginBottom: 10 }}>
        <i className={`bi bi-chevron-${expandido ? 'up' : 'down'}`} style={{ marginRight: 4 }} />
        {parciais.length} parciais · {parciais.map(p => `#${p.id} (${fmtQtd(p.quantidade)} ${p.unidade})`).join(' + ')}
      </button>

      {expandido && (
        <div style={{ marginBottom: 10, background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 6, padding: '8px 12px', fontSize: 12, color: '#555' }}>
          {parciais.map(p => (
            <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0', borderBottom: '1px solid #e9ecef' }}>
              <span>Parcial #{p.id}</span>
              <span style={{ fontWeight: 600 }}>{fmtQtd(p.quantidade)} {p.unidade}</span>
              <Link href={`/parcial/${p.id}`} style={{ color: '#0d6efd', fontSize: 11 }}>Ver <i className="bi bi-eye" /></Link>
            </div>
          ))}
        </div>
      )}

      {/* Ações combinadas */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {!isLogistica && isAberto && !recebidoSemIniciar && (
          <button onClick={() => setShowReceberModal(true)} disabled={loading} style={btnStyle('#d97706')}>
            <i className="bi bi-box-arrow-in-down" style={{ marginRight: 5 }} />Receber
          </button>
        )}
        {!isLogistica && isAberto && recebidoSemIniciar && (
          <button onClick={() => acaoTodos('iniciar')} disabled={loading} style={btnStyle('#198754')}>
            <i className="bi bi-play-fill" style={{ marginRight: 5 }} />Iniciar produção
          </button>
        )}

        {!isLogistica && isAndamento && isQualidadeGrupo && (
          <>
            {!showDivQualidade && (
              <>
                <select value={setorDestino || p0.proximo_setor || ''} onChange={e => setSetorDestino(e.target.value)}
                  style={{ border: '1px solid #dee2e6', borderRadius: 5, padding: '5px 8px', fontSize: 12 }}>
                  {!p0.proximo_setor && !setorDestino && <option value="">Selecione o setor...</option>}
                  {SETOR_CHOICES.filter(([cod]) => cod !== p0.setor_atual).map(([cod, nome]) => (
                    <option key={cod} value={cod}>{nome}{cod === p0.proximo_setor ? ' ✓' : ''}</option>
                  ))}
                </select>
                <button onClick={aprovarGrupoQualidade} disabled={loading} style={btnStyle('#1a3a5c')}>
                  <i className="bi bi-send-fill" style={{ marginRight: 5 }} />Enviar tudo
                </button>
                <button onClick={() => { setShowEnviarParcial(v => !v); setShowEnviar(false); }} disabled={loading} style={btnStyle('#0d6efd')}>
                  <i className="bi bi-send" style={{ marginRight: 5 }} />Enviar parcial
                </button>
              </>
            )}
            <button onClick={() => { setShowDivQualidade(v => !v); setShowEnviar(false); setShowEnviarParcial(false); }} disabled={loading} style={btnStyle('#f97316')}>
              ⚠ Divergência
            </button>
          </>
        )}

        {!isLogistica && isAndamento && !isQualidadeGrupo && (
          <>
            <button onClick={() => setConfirm({
              titulo: 'Finalizar etapa',
              mensagem: `Confirma que a etapa de ${NOMES[p0.setor_atual] || p0.setor_atual} foi concluída para todas as ${fmtQtd(String(totalQtd))} ${p0.unidade}?`,
              acao: () => acaoTodos('finalizar'),
            })} disabled={loading} style={btnStyle('#198754')}>
              <i className="bi bi-check-lg" style={{ marginRight: 5 }} />Finalizar etapa
            </button>
            <button onClick={() => { setShowEnviar(v => !v); setShowEnviarParcial(false); setShowDevolver(false); if (!setorDestino) setSetorDestino(p0.proximo_setor || ''); }} disabled={loading} style={btnStyle('#1a3a5c')}>
              <i className="bi bi-send-fill" style={{ marginRight: 5 }} />Enviar ao próximo setor
            </button>
            <button onClick={() => { setShowEnviarParcial(v => !v); setShowEnviar(false); setShowDevolver(false); if (!setorDestino) setSetorDestino(p0.proximo_setor || ''); }} disabled={loading} style={btnStyle('#0d6efd')}>
              <i className="bi bi-send" style={{ marginRight: 5 }} />Enviar parcial
            </button>
            <button onClick={() => setConfirm({
              titulo: 'Encerrar Parciais',
              mensagem: `As ${fmtQtd(String(totalQtd))} ${p0.unidade} já foram processadas e não precisam ir a outro setor. Deseja encerrar todas as parciais?`,
              acao: () => acaoTodos('concluir'),
            })} disabled={loading} style={btnStyle('#198754', true)}>
              ✓ Encerrar
            </button>
            <button onClick={() => acaoTodos('pausar')} disabled={loading} style={btnStyle('#fd7e14')}>
              <i className="bi bi-pause-fill" style={{ marginRight: 5 }} />Pausar
            </button>
          </>
        )}

        {!isLogistica && isPausado && (
          <>
            <button onClick={() => acaoTodos('retomar')} disabled={loading} style={btnStyle('#198754')}>
              <i className="bi bi-play-fill" style={{ marginRight: 5 }} />Retomar
            </button>
            <button onClick={() => { setShowEnviar(v => !v); setShowEnviarParcial(false); setShowDevolver(false); if (!setorDestino) setSetorDestino(p0.proximo_setor || ''); }} disabled={loading} style={btnStyle('#1a3a5c')}>
              <i className="bi bi-send-fill" style={{ marginRight: 5 }} />Enviar ao próximo setor
            </button>
            <button onClick={() => { setShowEnviarParcial(v => !v); setShowEnviar(false); setShowDevolver(false); if (!setorDestino) setSetorDestino(p0.proximo_setor || ''); }} disabled={loading} style={btnStyle('#0d6efd')}>
              <i className="bi bi-send" style={{ marginRight: 5 }} />Enviar parcial
            </button>
            <button onClick={() => setConfirm({
              titulo: 'Encerrar Parciais',
              mensagem: `As ${fmtQtd(String(totalQtd))} ${p0.unidade} já foram processadas e não precisam ir a outro setor. Deseja encerrar todas as parciais?`,
              acao: () => acaoTodos('concluir'),
            })} disabled={loading} style={btnStyle('#198754', true)}>
              ✓ Encerrar
            </button>
          </>
        )}

        {!isLogistica && isFinalizado && (
          <>
            {!showDivQualidade && (
              <>
                <button onClick={() => { setShowEnviar(v => !v); setShowEnviarParcial(false); setShowDevolver(false); if (!setorDestino) setSetorDestino(p0.proximo_setor || ''); }} disabled={loading} style={btnStyle('#1a3a5c')}>
                  <i className="bi bi-send-fill" style={{ marginRight: 5 }} />Enviar ao próximo setor
                </button>
                <button onClick={() => { setShowEnviarParcial(v => !v); setShowEnviar(false); setShowDevolver(false); if (!setorDestino) setSetorDestino(p0.proximo_setor || ''); }} disabled={loading} style={btnStyle('#0d6efd')}>
                  <i className="bi bi-send" style={{ marginRight: 5 }} />Enviar parcial
                </button>
              </>
            )}
            {isQualidadeGrupo && (
              <button onClick={() => { setShowDivQualidade(v => !v); setShowEnviar(false); setShowEnviarParcial(false); }} disabled={loading} style={btnStyle('#f97316')}>
                ⚠ Divergência
              </button>
            )}
            <button onClick={() => acaoTodos('retomar')} disabled={loading} style={btnStyle('#fd7e14')}>
              <i className="bi bi-arrow-counterclockwise" style={{ marginRight: 5 }} />Retomar etapa
            </button>
            <button onClick={() => setConfirm({
              titulo: 'Encerrar Parciais',
              mensagem: `As ${fmtQtd(String(totalQtd))} ${p0.unidade} já foram processadas e não precisam ir a outro setor. Deseja encerrar todas as parciais?`,
              acao: () => acaoTodos('concluir'),
            })} disabled={loading} style={btnStyle('#198754', true)}>
              ✓ Encerrar
            </button>
          </>
        )}

        {(isAberto || isAndamento || isPausado || isFinalizado) && !isLogistica && (
          <button onClick={() => { setShowDevolver(v => !v); setShowEnviar(false); }} disabled={loading} style={btnStyle('#dc3545', true)}>
            <i className="bi bi-arrow-return-left" style={{ marginRight: 5 }} />Devolver
          </button>
        )}
      </div>

      {/* Modal receber grupo */}
      {!isLogistica && isAberto && showReceberModal && (
        <ReceberModal
          quantidade={String(totalQtd)}
          unidade={p0.unidade || 'un'}
          setor={p0.setor_atual_nome}
          itemCodigo={p0.item_codigo}
          itemDescricao={p0.item_descricao}
          loading={loading}
          onCancel={() => setShowReceberModal(false)}
          onConfirm={async (decisao, _qtd, obs) => {
            setShowReceberModal(false);
            if (decisao === 'iniciar') { acaoTodos('iniciar'); }
            else if (decisao === 'preparar') {
              setLoading(true);
              try {
                for (const p of parciais) await parcialAcao(p.id, 'receber');
                setRecebidoSemIniciar(true);
                mostrarErroGrupo('Recebimento confirmado — clique em Iniciar quando estiver pronto', 'ok');
              } catch (e: unknown) {
                const ax = e as { response?: { data?: { erro?: string } } };
                mostrarErroGrupo(ax?.response?.data?.erro || String(e));
              } finally { setLoading(false); }
            } else { acaoTodos('pausar', { observacao: obs || 'Divergência no recebimento' }); }
          }}
        />
      )}

      {/* Painel enviar */}
      {showEnviar && (
        <div style={{ marginTop: 10, background: foraDoRoteiroGrupo ? '#fffbeb' : '#f8f9fa', border: foraDoRoteiroGrupo ? '1.5px solid #f59e0b' : 'none', borderRadius: 6, padding: '10px 12px', display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'flex-end' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: 1, minWidth: 140 }}>
            <label style={{ fontSize: 11, color: foraDoRoteiroGrupo ? '#92400e' : '#555', fontWeight: foraDoRoteiroGrupo ? 700 : 400 }}>
              {foraDoRoteiroGrupo ? '⚠ Selecione o setor destino:' : 'Setor destino:'}
            </label>
            <select value={setorDestino || p0.proximo_setor || ''} onChange={e => setSetorDestino(e.target.value)}
              style={{ border: foraDoRoteiroGrupo ? '2px solid #f59e0b' : '1px solid #dee2e6', borderRadius: 5, padding: '5px 8px', fontSize: 12 }}>
              <option value="">Selecione o setor...</option>
              {SETOR_CHOICES.filter(([cod]) => cod !== p0.setor_atual).map(([cod, nome]) => (
                <option key={cod} value={cod}>{nome}{cod === p0.proximo_setor ? ' ✓' : ''}</option>
              ))}
            </select>
          </div>
          <button onClick={() => {
            const dest = setorDestino || p0.proximo_setor || '';
            if (!dest) { mostrarErroGrupo('Selecione o setor destino'); return; }
            acaoTodos('mover', { setor_destino: dest, quantidade: Number(p0.quantidade) });
            setShowEnviar(false);
          }} disabled={loading || (!setorDestino && !p0.proximo_setor)}
            style={{ background: '#0d6efd', color: '#fff', border: 'none', borderRadius: 5, padding: '6px 14px', fontSize: 12, fontWeight: 700, cursor: (loading || (!setorDestino && !p0.proximo_setor)) ? 'not-allowed' : 'pointer', opacity: (!setorDestino && !p0.proximo_setor) ? 0.4 : 1 }}>
            Confirmar envio
          </button>
          <button onClick={() => setShowEnviar(false)}
            style={{ background: 'none', border: '1px solid #dee2e6', borderRadius: 5, padding: '6px 10px', fontSize: 12, color: '#888', cursor: 'pointer' }}>✕</button>
        </div>
      )}

      {/* Painel enviar parcial (quantidade específica) */}
      {showEnviarParcial && (
        <div style={{ marginTop: 10, background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 6, padding: '10px 12px', display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'flex-end' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: 1, minWidth: 140 }}>
            <label style={{ fontSize: 11, color: foraDoRoteiroGrupo ? '#92400e' : '#555', fontWeight: foraDoRoteiroGrupo ? 700 : 400 }}>
              {foraDoRoteiroGrupo ? '⚠ Selecione o setor destino:' : 'Setor destino:'}
            </label>
            <select value={setorDestino || p0.proximo_setor || ''} onChange={e => setSetorDestino(e.target.value)}
              style={{ border: foraDoRoteiroGrupo ? '2px solid #f59e0b' : '1px solid #dee2e6', borderRadius: 5, padding: '5px 8px', fontSize: 12 }}>
              <option value="">Selecione o setor...</option>
              {SETOR_CHOICES.filter(([cod]) => cod !== p0.setor_atual).map(([cod, nome]) => (
                <option key={cod} value={cod}>{nome}{cod === p0.proximo_setor ? ' ✓' : ''}</option>
              ))}
            </select>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <label style={{ fontSize: 11, color: '#555' }}>Quantidade (máx: {fmtQtd(String(totalQtd))}):</label>
            <input type="number" value={qtdParcial}
              onChange={e => {
                const v = e.target.value;
                if (v === '' || Number(v) <= totalQtd) setQtdParcial(v);
                else setQtdParcial(String(totalQtd));
              }}
              placeholder={String(totalQtd)} min={1} max={totalQtd}
              style={{ border: '1px solid #dee2e6', borderRadius: 5, padding: '5px 8px', fontSize: 13, width: 90 }} />
          </div>
          <button onClick={async () => {
            const dest = setorDestino || p0.proximo_setor || '';
            if (!dest) { mostrarErroGrupo('Selecione o setor destino'); return; }
            const qtdTotal = Number(qtdParcial) || totalQtd;
            let restante = qtdTotal;
            for (const p of parciais) {
              if (restante <= 0) break;
              const qtd = Math.min(restante, Number(p.quantidade));
              await parcialAcao(p.id, 'mover', { setor_destino: dest, quantidade: qtd });
              restante -= qtd;
            }
            setShowEnviarParcial(false);
            setQtdParcial('');
            onRefresh();
          }} disabled={loading || (!setorDestino && !p0.proximo_setor)}
            style={{ background: '#0d6efd', color: '#fff', border: 'none', borderRadius: 5, padding: '6px 14px', fontSize: 12, fontWeight: 700, cursor: (loading || (!setorDestino && !p0.proximo_setor)) ? 'not-allowed' : 'pointer', opacity: (!setorDestino && !p0.proximo_setor) ? 0.4 : 1 }}>
            Confirmar envio
          </button>
          <button onClick={() => setShowEnviarParcial(false)}
            style={{ background: 'none', border: '1px solid #dee2e6', borderRadius: 5, padding: '6px 10px', fontSize: 12, color: '#888', cursor: 'pointer' }}>✕</button>
        </div>
      )}

      {/* Painel divergência qualidade — grupo */}
      {showDivQualidade && isQualidadeGrupo && (
        <div style={{ marginTop: 10, background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: 8, padding: 14 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#c2410c', marginBottom: 8 }}>⚠ Pedido com divergência</div>
          <div style={{ marginBottom: 10 }}>
            <label style={{ fontSize: 11, fontWeight: 600, color: '#555', display: 'block', marginBottom: 4 }}>
              Motivo da divergência: <span style={{ color: '#dc2626' }}>*</span>
            </label>
            <textarea value={motivoDivGrupo} onChange={e => setMotivoDivGrupo(e.target.value)}
              placeholder="Descreva o problema encontrado..."
              rows={3}
              style={{ width: '100%', border: '1px solid #fed7aa', borderRadius: 6, padding: '6px 8px', fontSize: 12, resize: 'none', boxSizing: 'border-box' }} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
            <button onClick={async () => {
              if (!motivoDivGrupo.trim()) { mostrarErroGrupo('Informe o motivo da divergência.'); return; }
              setLoading(true);
              try {
                if (p0.status === 'finalizado_setor') {
                  for (const p of parciais) await parcialAcao(p.id, 'retomar');
                }
                for (const p of parciais) await parcialAcao(p.id, 'pausar', { observacao: motivoDivGrupo });
                setMotivoDivGrupo('');
                setShowDivQualidade(false);
                onRefresh();
              } catch (e: unknown) {
                const ax = e as { response?: { data?: { erro?: string } } };
                mostrarErroGrupo(ax?.response?.data?.erro || String(e));
              } finally { setLoading(false); }
            }} disabled={loading || !motivoDivGrupo.trim()}
              style={{ background: '#fef9c3', border: '1px solid #fde047', borderRadius: 6, padding: '8px 6px', fontSize: 12, fontWeight: 600, color: '#854d0e', cursor: motivoDivGrupo.trim() ? 'pointer' : 'not-allowed', textAlign: 'center', lineHeight: 1.4, opacity: motivoDivGrupo.trim() ? 1 : 0.5 }}>
              ⏸ Segurar<br/>para revisão
            </button>
            <button onClick={() => setSetorRetrabalhoGrupo(v => v ? '' : '__open__')}
              disabled={loading || !motivoDivGrupo.trim()}
              style={{ background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: 6, padding: '8px 6px', fontSize: 12, fontWeight: 600, color: '#c2410c', cursor: motivoDivGrupo.trim() ? 'pointer' : 'not-allowed', textAlign: 'center', lineHeight: 1.4, opacity: motivoDivGrupo.trim() ? 1 : 0.5 }}>
              ↩ Devolver para<br/>retrabalho
            </button>
          </div>
          {(setorRetrabalhoGrupo !== '' && setorRetrabalhoGrupo !== undefined) && (
            <div style={{ marginBottom: 8 }}>
              <select value={setorRetrabalhoGrupo === '__open__' ? '' : setorRetrabalhoGrupo} onChange={e => setSetorRetrabalhoGrupo(e.target.value)}
                style={{ width: '100%', border: '1px solid #dee2e6', borderRadius: 5, padding: '6px 8px', fontSize: 12, marginBottom: 6 }}>
                <option value="">Selecione o setor...</option>
                {SETOR_CHOICES.filter(([cod]) => cod !== p0.setor_atual).map(([cod, nome]) => (
                  <option key={cod} value={cod}>{nome}</option>
                ))}
              </select>
              <button onClick={() => {
                if (!motivoDivGrupo.trim()) { mostrarErroGrupo('Informe o motivo da divergência.'); return; }
                const dest = setorRetrabalhoGrupo === '__open__' ? '' : setorRetrabalhoGrupo;
                if (!dest) return;
                acaoTodos('devolver', { setor_destino: dest, observacao: motivoDivGrupo });
                setMotivoDivGrupo('');
                setShowDivQualidade(false);
                setSetorRetrabalhoGrupo('');
              }} disabled={loading || !setorRetrabalhoGrupo || setorRetrabalhoGrupo === '__open__' || !motivoDivGrupo.trim()}
                style={{ width: '100%', background: '#ea580c', color: '#fff', border: 'none', borderRadius: 6, padding: '8px 0', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
                Confirmar devolução
              </button>
            </div>
          )}
          <button onClick={() => { setShowDivQualidade(false); setMotivoDivGrupo(''); setSetorRetrabalhoGrupo(''); }}
            style={{ background: 'none', border: '1px solid #dee2e6', borderRadius: 6, padding: '6px 12px', fontSize: 12, color: '#666', cursor: 'pointer', width: '100%' }}>
            Cancelar
          </button>
        </div>
      )}

      {/* Painel devolver */}
      {showDevolver && !showDivQualidade && (
        <div style={{ marginTop: 10, background: '#fff8f8', border: '1px solid #f5c2c7', borderRadius: 6, padding: 12 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: '#842029', marginBottom: 8 }}>Devolver para qual setor?</div>
          <select value={setorDev} onChange={e => setSetorDev(e.target.value)}
            style={{ width: '100%', border: '1px solid #dee2e6', borderRadius: 5, padding: '6px 8px', fontSize: 13, marginBottom: 8 }}>
            <option value="">Selecione o setor...</option>
            {SETOR_CHOICES.filter(([cod]) => cod !== p0.setor_atual).map(([cod, nome]) => (
              <option key={cod} value={cod}>{nome}</option>
            ))}
          </select>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => { if (!setorDev) return; acaoTodos('devolver', { setor_destino: setorDev }); setShowDevolver(false); }}
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
    </>
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
  const [ultimaAtt, setUltimaAtt] = useState<Date | null>(null);

  const carregar = useCallback(() => {
    getSetorPainel(setor).then(d => { setData(d); setLoading(false); setUltimaAtt(new Date()); }).catch(() => setLoading(false));
  }, [setor]);

  // Ref sempre aponta para a versão mais recente de carregar — evita closure stale no interval
  const carregarRef = useRef(carregar);
  carregarRef.current = carregar;

  useEffect(() => {
    setLoading(true);
    carregarRef.current();
  }, [setor]);

  // Atualização em tempo real via Supabase WebSocket (quando disponível)
  useRealtime(
    ['producao_itemparcial', 'producao_itempedido', 'producao_movimentacaoitem'],
    carregar,
    [`setor-${setor}`],
  );

  // Polling a cada 10 s — garante atualização mesmo sem WebSocket
  useEffect(() => {
    const id = setInterval(() => carregarRef.current(), 10_000);
    return () => clearInterval(id);
  }, []); // [] = inicia uma vez, usa sempre a ref mais recente

  return (
    <AuthGuard>
      <NotificacoesLive filtroSetor={setor} />
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: setor === 'logistica' ? 12 : 18, flexWrap: 'wrap', gap: 10 }}>
        <h4 style={{ margin: 0, fontWeight: 700, color: '#1a3a5c', fontSize: 20 }}>
          <i className={`bi ${setor === 'logistica' ? 'bi-truck' : 'bi-tools'}`} style={{ marginRight: 8 }}></i>
          {nomeSetor}
        </h4>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {ultimaAtt && (
            <span style={{ fontSize: 11, color: '#6b7280' }}>
              <i className="bi bi-circle-fill" style={{ fontSize: 7, color: '#16a34a', marginRight: 4, verticalAlign: 'middle' }}></i>
              Atualizado às {ultimaAtt.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
            </span>
          )}
          <button onClick={carregar}
            style={{ background: 'none', border: '1px solid #dee2e6', borderRadius: 5, padding: '5px 14px', fontSize: 13, color: '#0d6efd', cursor: 'pointer' }}>
            <i className="bi bi-arrow-clockwise" style={{ marginRight: 4 }}></i>Atualizar
          </button>
        </div>
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
        <div className="setor-conteudo" style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>



          {/* Parciais neste setor — agrupadas por pedido */}
          {(() => {
            const todasParciais = data.parciais || [];
            if (todasParciais.length === 0) return null;

            // Agrupar por pedido_id preservando ordem de chegada
            const pedidoMap = new Map<number, { pedido_id: number; numero_pedido_venda: string; parciais: ItemParcial[] }>();
            for (const p of todasParciais) {
              if (!pedidoMap.has(p.pedido_id)) {
                pedidoMap.set(p.pedido_id, { pedido_id: p.pedido_id, numero_pedido_venda: p.numero_pedido_venda || '', parciais: [] });
              }
              pedidoMap.get(p.pedido_id)!.parciais.push(p);
            }
            const pedidos = Array.from(pedidoMap.values());
            const totalPedidos = pedidos.length;
            const totalParciais = todasParciais.length;

            return (
              <section>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#0369a1', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10 }}>
                  <i className="bi bi-diagram-3-fill" style={{ marginRight: 6 }} />
                  Itens Parciais ({totalPedidos} {totalPedidos !== totalParciais ? `· ${totalParciais} parciais` : ''})
                  <span style={{ marginLeft: 8, fontWeight: 400, textTransform: 'none', fontSize: 10, color: '#64748b' }}>
                    peças enviadas parcialmente para este setor
                  </span>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                  {pedidos.map(({ pedido_id, numero_pedido_venda, parciais }) => {
                    // Agrupar parciais do pedido por item_pedido_id
                    const itemMap = new Map<number, ItemParcial[]>();
                    for (const p of parciais) {
                      if (!itemMap.has(p.item_pedido_id)) itemMap.set(p.item_pedido_id, []);
                      itemMap.get(p.item_pedido_id)!.push(p);
                    }
                    const grupos = Array.from(itemMap.values());

                    // Agrupar por item_codigo para evitar repetição do nome do produto
                    const itemCodigoMap = new Map<string, ItemParcial[]>();
                    for (const p of parciais) {
                      const key = p.item_codigo || String(p.item_pedido_id);
                      if (!itemCodigoMap.has(key)) itemCodigoMap.set(key, []);
                      itemCodigoMap.get(key)!.push(p);
                    }
                    const itemGrupos = Array.from(itemCodigoMap.values());

                    return (
                      <div key={pedido_id} className="setor-pedido-grupo" style={{ border: '2px solid #dde3f0', borderRadius: 12, overflow: 'hidden', background: '#fff' }}>
                        {/* Cabeçalho do pedido */}
                        <div className="setor-pedido-header" style={{ background: '#1a3a5c', color: '#fff', padding: '10px 16px', display: 'flex', alignItems: 'center', gap: 10 }}>
                          <i className="bi bi-folder2-open" style={{ fontSize: 15 }} />
                          <span style={{ fontWeight: 700, fontSize: 15 }}>Pedido de Venda {numero_pedido_venda}</span>
                          <span style={{ fontSize: 11, opacity: 0.65, marginLeft: 4 }}>
                            {parciais.length} parcial{parciais.length > 1 ? 'is' : ''}
                            {itemGrupos.length > 1 ? ` · ${itemGrupos.length} produtos` : ''}
                          </span>
                        </div>
                        {/* Produtos do pedido */}
                        <div style={{ display: 'flex', flexDirection: 'column' }}>
                          {itemGrupos.map((grupo, itemIdx) => {
                            const p0 = grupo[0];
                            const totalQtd = grupo.reduce((s, p) => s + Number(p.quantidade), 0);
                            return (
                              <div key={(p0.item_codigo || '') + itemIdx} style={{ borderTop: itemIdx > 0 ? '2px solid #e2e8f0' : 'none' }}>
                                {/* Header do produto — mostrado uma única vez */}
                                <div style={{ background: '#f0f4ff', padding: '10px 16px', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                                  <span style={{ fontSize: 15, fontWeight: 800, color: '#1a3a5c' }}>{p0.item_descricao || p0.item_codigo}</span>
                                  {p0.prioridade && p0.prioridade !== 'normal' && (
                                    <span style={{ background: '#dc2626', color: '#fff', fontSize: 10, fontWeight: 700, padding: '1px 7px', borderRadius: 4 }}>
                                      {p0.prioridade.toUpperCase()}
                                    </span>
                                  )}
                                  <span style={{ fontSize: 12, color: '#64748b' }}>
                                    <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: 0.5, textTransform: 'uppercase', color: '#94a3b8', marginRight: 3 }}>Cód</span>
                                    <span style={{ fontWeight: 800, color: '#475569' }}>{p0.item_codigo}</span>
                                  </span>
                                  {(p0 as any).numero_op && (
                                    <span style={{ fontSize: 12, color: '#64748b' }}>
                                      <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: 0.5, textTransform: 'uppercase', color: '#94a3b8', marginRight: 3 }}>OP</span>
                                      <span style={{ fontWeight: 800, color: '#1a3a5c' }}>{(p0 as any).numero_op}</span>
                                    </span>
                                  )}
                                  <span style={{ marginLeft: 'auto', fontSize: 12, color: '#0d6efd', fontWeight: 700 }}>
                                    {totalQtd} {p0.unidade} · {grupo.length} parcial{grupo.length > 1 ? 'is' : ''}
                                  </span>
                                </div>
                                {/* Todas as parciais do item agrupadas em um único card */}
                                <div className="setor-parcial-area" style={{ padding: '12px 12px' }}>
                                  <ParcialGrupoCard parciais={grupo} onRefresh={carregar} />
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>
            );
          })()}

          {/* Itens no setor sem parciais — exibe apenas os que não têm rastreio por parcial aqui */}
          {(() => {
            const itemIdsComParciais = new Set((data.parciais || []).map(p => p.item_pedido_id));
            const itensSemParciais = data.itens.filter(i => !itemIdsComParciais.has(i.id));

            const itensFiltrados = setor === 'logistica' && filtroLog !== 'todos'
              ? itensSemParciais.filter(i => i.status === filtroLog)
              : itensSemParciais;

            // Agrupar por pedido
            const pedidoMap = new Map<string, ItemPedido[]>();
            for (const item of itensFiltrados) {
              const chave = item.pedido_numero || String(item.id);
              if (!pedidoMap.has(chave)) pedidoMap.set(chave, []);
              pedidoMap.get(chave)!.push(item);
            }
            const grupos = Array.from(pedidoMap.entries());

            if (grupos.length === 0) return null;

            return (
              <section>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#555', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10 }}>
                  <i className="bi bi-list-ul" style={{ marginRight: 6 }}></i>
                  Itens no Setor ({itensFiltrados.length})
                </div>
                <PedidoGrupos grupos={grupos} onRefresh={carregar} />
              </section>
            );
          })()}
        </div>
      )}
    </AuthGuard>
  );
}
