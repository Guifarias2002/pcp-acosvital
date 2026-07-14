'use client';
import { useEffect, useState, useCallback, useRef } from 'react';
import AuthGuard from '@/components/AuthGuard';

// Ticker global compartilhado: um único setInterval de 1s para TODOS os
// cronômetros da tela, em vez de um timer por card. Reduz drasticamente o
// número de timers/agendamentos quando há muitas parciais em andamento.
const tickSubs = new Set<() => void>();
let tickTimer: ReturnType<typeof setInterval> | null = null;
function subscribeTick(cb: () => void) {
  tickSubs.add(cb);
  if (!tickTimer) tickTimer = setInterval(() => { tickSubs.forEach(f => f()); }, 1000);
  return () => {
    tickSubs.delete(cb);
    if (tickSubs.size === 0 && tickTimer) { clearInterval(tickTimer); tickTimer = null; }
  };
}

function Cronometro({ desde }: { desde: string }) {
  const [, forcar] = useState(0);
  useEffect(() => subscribeTick(() => forcar(n => (n + 1) % 1_000_000)), []);
  const seg = Math.max(0, Math.floor((Date.now() - new Date(desde).getTime()) / 1000));
  const h = Math.floor(seg / 3600);
  const m = Math.floor((seg % 3600) / 60);
  const s = seg % 60;
  const txt = h > 0 ? `${h}h ${String(m).padStart(2,'0')}m` : `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
  return (
    <span style={{ fontFamily: 'monospace', fontSize: 12, fontWeight: 700, color: '#1d4ed8', background: '#dbeafe', borderRadius: 5, padding: '2px 7px' }}>
      ⏱ {txt}
    </span>
  );
}
import { getSetorPainel, itemAcao, loteAcao, parcialAcao, parcialAcaoLote, adicionarObservacaoItem, setPesosPallets } from '@/lib/api';
import { isAdministrador, podeEditar, getToken } from '@/lib/auth';
import { SetorPainelData, ItemPedido, LoteItem, ItemParcial, STATUS_LABELS, PRIORIDADE_COR, NOMES, SETOR_CHOICES, PARCIAL_STATUS_LABELS } from '@/lib/types';
import { fmtQtd } from '@/lib/format';
import Link from 'next/link';
import ReceberModal from '@/components/ReceberModal';
import NotificacoesLive from '@/components/NotificacoesLive';
import { useRealtime } from '@/hooks/useRealtime';
import ConfirmModal from '@/components/ConfirmModal';
import EntregarModal from '@/components/EntregarModal';
import DespacharModal from '@/components/DespacharModal';
import IniciarEntregaModal from '@/components/IniciarEntregaModal';
import DivergenciaResolucaoModal from '@/components/DivergenciaResolucaoModal';
import RastreioModal from '@/components/RastreioModal';

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
  const [motivoDev, setMotivoDev] = useState('');
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
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
              <div style={{ fontSize: 15, fontWeight: 700, color: '#1a3a5c' }}>{item.pedido_numero}</div>
              {(item as any).numero_op && (
                <span style={{ fontSize: 12 }}>
                  <span style={{ fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase', fontSize: 9, letterSpacing: 0.5, marginRight: 4 }}>OP</span>
                  <span style={{ fontWeight: 800, color: '#1a3a5c' }}>{(item as any).numero_op}</span>
                </span>
              )}
            </div>
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

      {/* Progresso do roteiro — mesmo estilo visual da tela de Pedido Detalhe */}
      {item.roteiro_efetivo && item.roteiro_efetivo.length > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap', marginBottom: 10 }}>
          {item.roteiro_efetivo.map((setorRot: string, i: number) => {
            const idxAtual = item.roteiro_efetivo.indexOf(item.setor_atual);
            const done = i < idxAtual;
            const current = setorRot === item.setor_atual;
            return (
              <span key={setorRot} style={{
                fontSize: 11, padding: '2px 7px', borderRadius: 4, fontWeight: current ? 700 : 400,
                background: current ? '#1d4ed8' : done ? '#f1f5f9' : 'transparent',
                color: current ? '#fff' : done ? '#94a3b8' : '#cbd5e1',
              }}>
                {done && <span style={{ marginRight: 3 }}>✓</span>}
                {current && <span style={{ marginRight: 3 }}>●</span>}
                {NOMES[setorRot] || setorRot}
              </span>
            );
          })}
        </div>
      )}

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

      {/* Documentos do pedido (PV / OP / Desenho) */}
      <DocumentosPedidoLinks
        pedidoId={item.pedido_id}
        temPedidoVenda={(item as any).tem_pedido_venda}
        temOrdemProducao={(item as any).tem_ordem_producao}
        temDesenho={(item as any).tem_desenho}
      />

      {/* Ações — escondidas para usuários somente leitura */}
      {podeEditar() && (
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>

        {/* LIBERAR — item ainda emitido, envia para o proximo setor do roteiro */}
        {item.status === 'emitido' && (
          <button onClick={() => acao('liberar')} disabled={loading}
            style={{ background: '#198754', color: '#fff', border: 'none', borderRadius: 6, padding: '6px 14px', fontSize: 12, fontWeight: 600, cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.6 : 1 }}>
            {loading ? <i className="bi bi-hourglass-split" style={{ marginRight: 5 }}></i> : <i className="bi bi-play-fill" style={{ marginRight: 5 }}></i>}
            {loading ? 'Aguarde...' : 'Iniciar produção'}
          </button>
        )}

        {/* RECEBER — abre modal total/parcial */}
        {item.status === 'aguardando' && !showReceber && (
          <button onClick={() => !loading && setShowReceber(true)} disabled={loading}
            style={{ background: '#0d6efd', color: '#fff', border: 'none', borderRadius: 6, padding: '6px 14px', fontSize: 12, fontWeight: 600, cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.6 : 1 }}>
            <i className="bi bi-box-arrow-in-down" style={{ marginRight: 5 }}></i>Receber
          </button>
        )}

        {item.setor_atual === 'logistica' && ['recebido', 'finalizado_setor', 'em_andamento'].includes(item.status) && (
          <button onClick={() => !loading && setShowDespachar(true)} disabled={loading}
            style={{ background: '#fd7e14', color: '#fff', border: 'none', borderRadius: 6, padding: '6px 14px', fontSize: 12, fontWeight: 600, cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.6 : 1 }}>
            <i className="bi bi-truck" style={{ marginRight: 5 }}></i>Despachar
          </button>
        )}

        {item.status === 'recebido' && item.setor_atual !== 'logistica' && (
          <button onClick={() => acao('iniciar')} disabled={loading}
            style={{ background: '#198754', color: '#fff', border: 'none', borderRadius: 6, padding: '6px 14px', fontSize: 12, fontWeight: 600, cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.6 : 1 }}>
            {loading ? <i className="bi bi-hourglass-split" style={{ marginRight: 5 }}></i> : <i className="bi bi-play-fill" style={{ marginRight: 5 }}></i>}
            {loading ? 'Aguarde...' : 'Iniciar produção'}
          </button>
        )}

        {item.status === 'em_andamento' && item.setor_atual !== 'logistica' && (
          <>
            <button onClick={() => !loading && setConfirm({ titulo: 'Finalizar etapa', mensagem: `Confirma que a etapa de ${item.nome_setor_atual} foi concluída para este item?`, acao: () => acao('finalizar') })} disabled={loading}
              style={{ background: '#198754', color: '#fff', border: 'none', borderRadius: 6, padding: '6px 14px', fontSize: 12, fontWeight: 600, cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.6 : 1 }}>
              {loading ? <i className="bi bi-hourglass-split" style={{ marginRight: 5 }}></i> : <i className="bi bi-check-lg" style={{ marginRight: 5 }}></i>}
              {loading ? 'Aguarde...' : 'Finalizar etapa'}
            </button>
            <button onClick={() => acao('pausar')} disabled={loading}
              style={{ background: '#fd7e14', color: '#fff', border: 'none', borderRadius: 6, padding: '6px 14px', fontSize: 12, fontWeight: 600, cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.6 : 1 }}>
              <i className="bi bi-pause-fill" style={{ marginRight: 5 }}></i>Pausar
            </button>
          </>
        )}

        {item.status === 'pausado' && (
          <button onClick={() => acao('retomar')} disabled={loading}
            style={{ background: '#198754', color: '#fff', border: 'none', borderRadius: 6, padding: '6px 14px', fontSize: 12, fontWeight: 600, cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.6 : 1 }}>
            {loading ? <i className="bi bi-hourglass-split" style={{ marginRight: 5 }}></i> : <i className="bi bi-play-fill" style={{ marginRight: 5 }}></i>}
            {loading ? 'Aguarde...' : 'Retomar'}
          </button>
        )}

        {item.status === 'finalizado_setor' && item.setor_atual !== 'logistica' && (
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
              style={{ background: '#1a3a5c', color: '#fff', border: 'none', borderRadius: 6, padding: '6px 14px', fontSize: 12, fontWeight: 600, cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.6 : 1 }}>
              {loading ? <i className="bi bi-hourglass-split" style={{ marginRight: 5 }}></i> : <i className="bi bi-send-fill" style={{ marginRight: 5 }}></i>}
              {loading ? 'Aguarde...' : 'Enviar tudo'}
            </button>
            <button onClick={() => !loading && setShowParcial(v => !v)} disabled={loading}
              style={{ background: '#0d6efd', color: '#fff', border: 'none', borderRadius: 6, padding: '6px 14px', fontSize: 12, fontWeight: 600, cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.6 : 1 }}>
              <i className="bi bi-scissors" style={{ marginRight: 5 }}></i>Enviar parcial
            </button>
          </>
        )}

        {item.setor_atual === 'logistica' && ['recebido', 'finalizado_setor', 'em_andamento', 'em_transito'].includes(item.status) && (
          <button onClick={() => !loading && setShowEntregar(true)} disabled={loading}
            style={{ background: '#198754', color: '#fff', border: 'none', borderRadius: 6, padding: '6px 14px', fontSize: 12, fontWeight: 600, cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.6 : 1 }}>
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
      )}

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
          <label style={{ fontSize: 11, fontWeight: 600, color: item.status === 'reprovado' ? '#92400e' : '#842029', display: 'block', marginBottom: 4 }}>
            {item.status === 'reprovado' ? 'Motivo do retrabalho:' : 'Motivo do retorno:'} <span style={{ color: '#dc2626' }}>*</span>
          </label>
          <textarea value={motivoDev} onChange={e => setMotivoDev(e.target.value)}
            rows={2} placeholder={item.status === 'reprovado' ? 'Descreva o problema encontrado...' : 'Ex.: recebido por engano, setor errado, peça trocada...'}
            style={{ width: '100%', border: `1px solid ${item.status === 'reprovado' ? '#fde68a' : '#f5c2c7'}`, borderRadius: 5, padding: '6px 8px', fontSize: 13, marginBottom: 8, resize: 'vertical', boxSizing: 'border-box' }} />
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => {
              if (!setorDev) { mostrarErroItem('Selecione o setor destino'); return; }
              if (!motivoDev.trim()) { mostrarErroItem('Informe o motivo'); return; }
              const acaoNome = item.status === 'reprovado' ? 'retrabalho' : 'devolver';
              const extra = acaoNome === 'devolver' ? { tipo: 'correcao' } : {};
              acao(acaoNome, { setor_destino: setorDev, observacao: motivoDev.trim(), ...extra });
              setShowDevolver(false); setMotivoDev('');
            }} disabled={loading || !setorDev || !motivoDev.trim()}
              style={{ flex: 1, background: item.status === 'reprovado' ? '#d97706' : '#dc3545', color: '#fff', border: 'none', borderRadius: 5, padding: '7px 0', fontSize: 13, fontWeight: 700, cursor: (!setorDev || !motivoDev.trim()) ? 'not-allowed' : 'pointer', opacity: (!setorDev || !motivoDev.trim()) ? 0.5 : 1 }}>
              {item.status === 'reprovado' ? 'Encaminhar para retrabalho' : 'Confirmar devolução'}
            </button>
            <button onClick={() => { setShowDevolver(false); setMotivoDev(''); }}
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

  async function reportarDivergencia(obs: string) {
    setLoading(true);
    setErro('');
    try {
      const itemId = (lote as Record<string, unknown>).item_pedido_id as number;
      await itemAcao(itemId, 'reprovar', { observacao: obs || 'Divergência reportada no recebimento do lote' });
      onRefresh();
    } catch (e: unknown) {
      const ax = e as { response?: { data?: { erro?: string } } };
      setErro(ax?.response?.data?.erro || 'Erro ao reportar divergência');
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

      {podeEditar() && tipo === 'chegando' && !showReceber && (
        <button onClick={() => setShowReceber(true)} disabled={loading}
          style={{ width: '100%', background: '#0d6efd', color: '#fff', border: 'none', borderRadius: 5, padding: '8px 0', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
          <i className="bi bi-box-arrow-in-down" style={{ marginRight: 6 }}></i>Receber lote
        </button>
      )}

      {podeEditar() && tipo === 'trabalho' && !showConfirmFinalizar && (
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
          ocultarParcial
          onCancel={() => setShowReceber(false)}
          onConfirm={async (decisao, _qtd, obs) => {
            setShowReceber(false);
            if (decisao === 'divergente') await reportarDivergencia(obs || '');
            else await receber();
          }}
        />
      )}

    </div>
  );
}

const BADGE_PARCIAL: Record<string, { bg: string; color: string }> = {
  em_aberto:        { bg: '#dbeafe', color: '#1d4ed8' },
  recebido:         { bg: '#fef3c7', color: '#92400e' },
  em_andamento:     { bg: '#fff3cd', color: '#664d03' },
  em_transito:      { bg: '#cffafe', color: '#155e75' },
  pausado:          { bg: '#fef9c3', color: '#854d0e' },
  finalizado_setor: { bg: '#d1e7dd', color: '#0a3622' },
  concluida:        { bg: '#d1e7dd', color: '#0a3622' },
  cancelada:        { bg: '#f8d7da', color: '#842029' },
};

const LABEL_PARCIAL = PARCIAL_STATUS_LABELS;

function ParcialCard({ parcial, onRefresh, hideHeader, setor }: { parcial: ItemParcial; onRefresh: () => void; hideHeader?: boolean; setor?: string }) {
  const { toast: toastParcial, mostrar: mostrarErroParcial, fechar: fecharToastParcial } = useToast();
  const [loading, setLoading] = useState(false);
  const [showEnviar, setShowEnviar] = useState(false);
  const [showDevolver, setShowDevolver] = useState(false);
  const [showNaoEntregue, setShowNaoEntregue] = useState(false);
  const [showDivQualidade, setShowDivQualidade] = useState(false);
  const [showReceberModal, setShowReceberModal] = useState(false);
  const [qtdEnvio, setQtdEnvio] = useState('');
  const [setorDestino, setSetorDestino] = useState('');
  const [setorDev, setSetorDev] = useState('');
  const [setorRetrabalho, setSetorRetrabalho] = useState('');
  const [motivoDiv, setMotivoDiv] = useState('');
  const [motivoDevolucao, setMotivoDevolucao] = useState('');
  const [confirm, setConfirm] = useState<{ titulo: string; mensagem: string; acao: () => void; perigo?: boolean } | null>(null);
  const [showDespacharParcial, setShowDespacharParcial] = useState(false);
  const [showEntregarParcial, setShowEntregarParcial] = useState(false);
  const [showIniciarEntrega, setShowIniciarEntrega] = useState(false);
  const [obsAberto, setObsAberto] = useState(false);
  const [novaObsTexto, setNovaObsTexto] = useState('');
  const [enviandoObs, setEnviandoObs] = useState(false);
  const [erroObs, setErroObs] = useState<string | null>(null);
  const isLogistica = parcial.setor_atual === 'logistica';
  const isQualidade = parcial.setor_atual === 'qualidade';
  const isRecebido = parcial.status === 'recebido';
  const podeDesfazer = isAdministrador();

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

  async function enviarObservacao() {
    if (!novaObsTexto.trim()) return;
    setEnviandoObs(true);
    setErroObs(null);
    try {
      await adicionarObservacaoItem(parcial.item_pedido_id as number, novaObsTexto.trim());
      setNovaObsTexto('');
      onRefresh();
    } catch (e: unknown) { setErroObs(erroMsg(e)); }
    finally { setEnviandoObs(false); }
  }

  const isAberto    = parcial.status === 'em_aberto';
  const isAndamento = parcial.status === 'em_andamento';
  const isPausado   = parcial.status === 'pausado';
  const isFinalizado = parcial.status === 'finalizado_setor';
  const isEmTransito = parcial.status === 'em_transito';
  const isConcluida = parcial.status === 'concluida';
  const badge = BADGE_PARCIAL[parcial.status] || { bg: '#e2e3e5', color: '#333' };
  const foraDoRoteiro = !parcial.proximo_setor && !isLogistica;

  const btnStyle = (bg: string, outline = false): React.CSSProperties => ({
    background: outline ? 'none' : bg,
    color: outline ? bg : '#fff',
    border: outline ? `1px solid ${bg}` : 'none',
    borderRadius: 6, padding: '6px 14px', fontSize: 12, fontWeight: 600,
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
        {/* Linha 3: status + cronômetro + link */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6 }}>
          <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 4, fontWeight: 600, background: badge.bg, color: badge.color }}>
            {LABEL_PARCIAL[parcial.status] || parcial.status}
          </span>
          {(isAndamento || isEmTransito) && parcial.atualizado_em && (
            <Cronometro desde={parcial.atualizado_em} />
          )}
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

        {/* Banner retrabalho / retorno de retrabalho */}
        {parcial.retrabalho && (
          parcial.devolvido_de && setor && parcial.devolvido_de === setor ? (
            /* Peça voltou para este setor após retrabalho — inspecionar novamente */
            <div style={{ background: '#ecfdf5', border: '1px solid #6ee7b7', borderRadius: 6, padding: '6px 10px', marginBottom: 10, display: 'flex', alignItems: 'flex-start', gap: 8 }}>
              <span style={{ fontSize: 14 }}>🔄</span>
              <div>
                <div style={{ fontSize: 12, fontWeight: 700, color: '#065f46' }}>
                  Retornou de retrabalho — inspecionar novamente
                </div>
                {parcial.motivo_retrabalho && (
                  <div style={{ fontSize: 11, color: '#047857' }}>Problema original: {parcial.motivo_retrabalho}</div>
                )}
              </div>
            </div>
          ) : (
            /* Peça está aqui para retrabalho (recebida de outro setor) */
            <div style={{ background: '#fef3c7', border: '1px solid #fcd34d', borderRadius: 6, padding: '6px 10px', marginBottom: 10, display: 'flex', alignItems: 'flex-start', gap: 8 }}>
              <span style={{ fontSize: 14 }}>⚠</span>
              <div>
                <div style={{ fontSize: 12, fontWeight: 700, color: '#92400e' }}>
                  Retrabalho — devolvido da Inspeção de Qualidade
                </div>
                {parcial.motivo_retrabalho && <div style={{ fontSize: 11, color: '#78350f' }}>Motivo: {parcial.motivo_retrabalho}</div>}
              </div>
            </div>
          )
        )}

        {/* Banner retorno via parcial-pai (caso de divisão: nova parcial criada no destino) */}
        {!parcial.retrabalho && parcial.origem_retrabalho && (
          <div style={{ background: '#ecfdf5', border: '1px solid #6ee7b7', borderRadius: 6, padding: '6px 10px', marginBottom: 10, display: 'flex', alignItems: 'flex-start', gap: 8 }}>
            <span style={{ fontSize: 14 }}>🔄</span>
            <div>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#065f46' }}>
                Retornou de retrabalho — inspecionar novamente
              </div>
              {parcial.origem_motivo_retrabalho && (
                <div style={{ fontSize: 11, color: '#047857' }}>Problema original: {parcial.origem_motivo_retrabalho}</div>
              )}
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

        {/* Documentos do pedido (PV / OP / Desenho) */}
        <DocumentosPedidoLinks
          pedidoId={(parcial as any).pedido_id}
          temPedidoVenda={(parcial as any).tem_pedido_venda}
          temOrdemProducao={(parcial as any).tem_ordem_producao}
          temDesenho={(parcial as any).tem_desenho}
        />

        {/* Peso da embalagem: editável na Embalagem, somente leitura na Logística.
            Usuário somente-leitura vê o valor (Info) mesmo na Embalagem, sem editar. */}
        {parcial.setor_atual === 'embalagem' && (
          podeEditar()
            ? <PesosPalletsEditor parcialId={parcial.id as number} inicial={(parcial as any).pesos_pallets || []} />
            : <PesosPalletsInfo pesos={(parcial as any).pesos_pallets || []} />
        )}
        {parcial.setor_atual === 'logistica' && (
          <PesosPalletsInfo pesos={(parcial as any).pesos_pallets || []} />
        )}

        {/* Fotos da peça: adicionar no Acabamento/Embalagem; ver também na Logística */}
        {['acabamento', 'embalagem', 'logistica'].includes(parcial.setor_atual) && (
          <FotosParcial
            parcialId={parcial.id as number}
            inicial={(parcial as any).fotos || []}
            editavel={podeEditar() && ['acabamento', 'embalagem'].includes(parcial.setor_atual)}
          />
        )}

        {/* Outras parciais do mesmo item */}
        {parcial.outras_parciais && parcial.outras_parciais.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
            {parcial.outras_parciais.map((op, i) => {
              const stLabel = PARCIAL_STATUS_LABELS;
              const stColor: Record<string, string> = { em_aberto: '#64748b', recebido: '#92400e', em_andamento: '#854d0e', finalizado_setor: '#14532d', pausado: '#991b1b' };
              const stBg: Record<string, string> = { em_aberto: '#f1f5f9', recebido: '#fef3c7', em_andamento: '#fef9c3', finalizado_setor: '#dcfce7', pausado: '#fee2e2' };
              return (
                <span key={i} style={{ fontSize: 11, background: stBg[op.status] || '#f1f5f9', border: op.retrabalho ? '1px solid #fbbf24' : '1px solid #e2e8f0', borderRadius: 5, padding: '3px 8px', color: stColor[op.status] || '#374151', display: 'flex', alignItems: 'center', gap: 4 }}>
                  {op.retrabalho && '⚠ '}<strong>{fmtQtd(op.quantidade)} {op.unidade}</strong> em {op.setor_nome}
                  <span style={{ opacity: 0.7 }}>· {stLabel[op.status] || op.status}</span>
                </span>
              );
            })}
          </div>
        )}

      {/* Desenho técnico */}
      {(parcial as any).tem_desenho && (
        <a href={`/api/pedidos/${parcial.pedido_id}/desenho`} target="_blank" rel="noopener noreferrer"
          style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, fontWeight: 600, color: '#1d4ed8', textDecoration: 'none', background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 5, padding: '4px 10px', marginBottom: 8 }}>
          📐 Ver Desenho Técnico
        </a>
      )}

      {/* Ações — escondidas para usuários somente leitura */}
      {podeEditar() && (
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>

        {/* ── Iniciar ─────────────────────────────────────────────────────── */}
        {isLogistica && isAberto && (
          <button onClick={() => setShowIniciarEntrega(true)} disabled={loading} style={btnStyle('#0d6efd')}>
            <i className="bi bi-truck" style={{ marginRight: 5 }} />Iniciar entrega
          </button>
        )}
        {showIniciarEntrega && (
          <IniciarEntregaModal
            pedidoNumero={parcial.numero_pedido_venda ?? ''}
            itemCodigo={parcial.item_codigo ?? ''}
            loading={loading}
            onClose={() => setShowIniciarEntrega(false)}
            onConfirm={async (observacao) => {
              await acao('iniciar', { observacao });
              setShowIniciarEntrega(false);
            }}
          />
        )}
        {!isLogistica && isAberto && (
          <button onClick={() => setShowReceberModal(true)} disabled={loading} style={btnStyle('#d97706')}>
            <i className="bi bi-box-arrow-in-down" style={{ marginRight: 5 }} />Receber
          </button>
        )}
        {!isLogistica && isRecebido && (
          <>
            <button onClick={() => acao('iniciar')} disabled={loading} style={btnStyle('#198754')}>
              <i className="bi bi-play-fill" style={{ marginRight: 5 }} />Iniciar produção
            </button>
            <button onClick={() => { setShowEnviar(v => !v); if (!setorDestino) setSetorDestino(parcial.proximo_setor || ''); }} disabled={loading} style={btnStyle('#1a3a5c')}>
              <i className="bi bi-send-fill" style={{ marginRight: 5 }} />Enviar ao próximo setor
            </button>
            {podeDesfazer && (
              <button onClick={() => setConfirm({ titulo: 'Desfazer recebimento', mensagem: 'Voltar esta parcial para "em aberto" (não recebida)?', acao: () => acao('desfazer_recebimento') })} disabled={loading} style={btnStyle('#6b7280', true)}>
                <i className="bi bi-arrow-counterclockwise" style={{ marginRight: 5 }} />Desfazer recebimento
              </button>
            )}
          </>
        )}

        {/* ── Em andamento: logística confirma a entrega direto, sem etapa intermediária ── */}
        {isAndamento && (
          <>
            {isLogistica ? (
              <button onClick={() => setShowEntregarParcial(true)} disabled={loading} style={btnStyle('#198754')}>
                <i className="bi bi-check-circle-fill" style={{ marginRight: 5 }} />Confirmar entrega
              </button>
            ) : (
              <>
                <button onClick={() => setConfirm({
                  titulo: 'Finalizar etapa',
                  mensagem: 'Deseja finalizar o processo neste setor? A parcial ficará disponível para envio ao próximo setor.',
                  acao: () => acao('finalizar'),
                })} disabled={loading} style={btnStyle('#198754')}>
                  ✓ Finalizar etapa
                </button>
                <button onClick={() => { setShowEnviar(v => !v); if (!setorDestino) setSetorDestino(parcial.proximo_setor || ''); }} disabled={loading} style={btnStyle('#1a3a5c')}>
                  <i className="bi bi-send-fill" style={{ marginRight: 5 }} />Enviar ao próximo setor
                </button>
              </>
            )}
            <button onClick={() => acao('pausar')} disabled={loading} style={btnStyle('#fd7e14')}>
              <i className="bi bi-pause-fill" style={{ marginRight: 5 }} />Pausar
            </button>
            {isLogistica && (
              <button onClick={() => { setShowNaoEntregue(v => !v); setShowDevolver(false); }} disabled={loading}
                style={btnStyle('#dc3545', !showNaoEntregue)}>
                <i className="bi bi-x-circle" style={{ marginRight: 5 }} />Não entregue
              </button>
            )}
            {isQualidade && (
              <button onClick={() => { setShowDivQualidade(v => !v); setShowEnviar(false); }} disabled={loading} style={btnStyle('#f97316')}>
                ⚠ Divergência
              </button>
            )}
          </>
        )}

        {/* ── Pausado ──────────────────────────────────────────────────────── */}
        {isPausado && (
          <>
            <button onClick={() => acao('retomar')} disabled={loading} style={btnStyle('#198754')}>
              <i className="bi bi-play-fill" style={{ marginRight: 5 }} />Retomar
            </button>
            {!isLogistica && (
              <button onClick={() => { setShowEnviar(v => !v); if (!setorDestino) setSetorDestino(parcial.proximo_setor || ''); }} disabled={loading} style={btnStyle('#1a3a5c')}>
                <i className="bi bi-send-fill" style={{ marginRight: 5 }} />Enviar ao próximo setor
              </button>
            )}
            {isLogistica && (
              <button onClick={() => acao('retomar')} disabled={loading} style={btnStyle('#0d6efd')}>
                <i className="bi bi-truck" style={{ marginRight: 5 }} />Tentar entrega novamente
              </button>
            )}
          </>
        )}

        {/* ── Finalizado no setor ──────────────────────────────────────────── */}
        {isFinalizado && !isLogistica && (
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
          </>
        )}
        {isFinalizado && isLogistica && (
          <button onClick={() => acao('retomar')} disabled={loading} style={btnStyle('#fd7e14')}>
            <i className="bi bi-arrow-counterclockwise" style={{ marginRight: 5 }} />Retomar etapa
          </button>
        )}

        {/* ── Concluída: mesmo já encerrada, pode ser encaminhada pra outro setor ──
             (não vale pra Logística: entrega concluída é o fim, não há próximo setor) */}
        {isConcluida && !isLogistica && (
          <button onClick={() => { setShowEnviar(v => !v); if (!setorDestino) setSetorDestino(parcial.proximo_setor || ''); }} disabled={loading} style={btnStyle('#1a3a5c')}>
            <i className="bi bi-send-fill" style={{ marginRight: 5 }} />Encaminhar para setor
          </button>
        )}

        {/* DESPACHAR — logística only */}
        {isLogistica && isFinalizado && (
          <button onClick={() => setShowDespacharParcial(true)} disabled={loading} style={btnStyle('#fd7e14')}>
            🚚 Despachar
          </button>
        )}
        {showDespacharParcial && (
          <DespacharModal
            itemId={parcial.item_pedido_id as number}
            itemCodigo={parcial.item_codigo ?? ''}
            pedidoNumero={parcial.numero_pedido_venda ?? ''}
            onClose={() => setShowDespacharParcial(false)}
            onSuccess={() => { setShowDespacharParcial(false); onRefresh(); }}
          />
        )}

        {/* EM ROTA — logística, após despachar: só confirmar entrega, sem botões de produção */}
        {isLogistica && isEmTransito && (
          <button onClick={() => setShowEntregarParcial(true)} disabled={loading} style={btnStyle('#198754')}>
            <i className="bi bi-check-circle-fill" style={{ marginRight: 5 }} />Confirmar entrega
          </button>
        )}
        {showEntregarParcial && (
          <EntregarModal
            itemId={parcial.item_pedido_id as number}
            pedidoNumero={parcial.numero_pedido_venda ?? ''}
            descricao={parcial.item_descricao ?? ''}
            quantidade={parcial.quantidade}
            unidade={parcial.unidade ?? 'un'}
            onCancel={() => setShowEntregarParcial(false)}
            onConfirm={() => { setShowEntregarParcial(false); onRefresh(); }}
          />
        )}

        {/* Devolver — disponível em todos os setores (inclui recebido: peça
            chegou errada e precisa voltar a um setor anterior, ex.: Emissão) */}
        {(isAberto || isRecebido || isAndamento || isPausado || isFinalizado || isEmTransito) && (
          <button onClick={() => { setShowDevolver(v => !v); setShowNaoEntregue(false); }} disabled={loading} style={btnStyle('#dc3545', true)}>
            <i className="bi bi-arrow-return-left" style={{ marginRight: 5 }} />Devolver
          </button>
        )}

        {/* Observações por item — visível a todos, histórico acumulado entre setores */}
        {(() => {
          const qtdObs = (parcial.observacoes || []).length;
          return (
            <button
              onClick={() => { setObsAberto(v => !v); setErroObs(null); }}
              title="Observações"
              style={{ background: obsAberto ? '#1d4ed8' : qtdObs > 0 ? '#dbeafe' : 'none', color: obsAberto ? '#fff' : qtdObs > 0 ? '#1d4ed8' : '#64748b', border: `1px solid ${obsAberto ? '#1d4ed8' : qtdObs > 0 ? '#93c5fd' : '#dde3f0'}`, borderRadius: 6, padding: '6px 14px', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
            >
              <i className="bi bi-chat-left-text" style={{ marginRight: 5 }} />
              {qtdObs > 0 ? `${qtdObs} observaç${qtdObs > 1 ? 'ões' : 'ão'}` : 'Observação'}
            </button>
          );
        })()}
      </div>
      )}

      {/* Painel de observações por item — visível a todos */}
      {obsAberto && (() => {
        const observacoes = parcial.observacoes || [];
        return (
          <div style={{ marginTop: 10, background: '#eff6ff', border: '1px solid #93c5fd', borderRadius: 8, padding: '12px 14px' }}>
            <p style={{ fontSize: 12, fontWeight: 700, color: '#1d4ed8', margin: '0 0 8px' }}>
              <i className="bi bi-chat-left-text" style={{ marginRight: 5 }} />Observações do item
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 10 }}>
              {observacoes.length === 0 && (
                <p style={{ fontSize: 12, color: '#64748b', margin: 0, fontStyle: 'italic' }}>Nenhuma observação registrada ainda.</p>
              )}
              {observacoes.map(o => (
                <div key={o.id} style={{ background: '#fff', borderRadius: 6, border: '1px solid #dbeafe', padding: '6px 10px' }}>
                  <p style={{ fontSize: 12, color: '#374151', margin: 0 }}>{o.texto}</p>
                  <p style={{ fontSize: 11, color: '#94a3b8', margin: '3px 0 0' }}>
                    <strong style={{ color: '#64748b' }}>{o.usuario_nome}</strong> · {o.setor_nome} · {new Date(o.criado_em).toLocaleString('pt-BR')}
                  </p>
                </div>
              ))}
            </div>
            {podeEditar() && (
            <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
              <textarea value={novaObsTexto} onChange={e => setNovaObsTexto(e.target.value)}
                placeholder="Adicionar observação..." rows={2}
                style={{ flex: 1, border: '1px solid #93c5fd', borderRadius: 6, padding: '6px 10px', fontSize: 12, resize: 'none' }} />
              <button onClick={enviarObservacao} disabled={enviandoObs || !novaObsTexto.trim()}
                style={{ background: '#1d4ed8', color: '#fff', border: 'none', borderRadius: 6, padding: '6px 14px', fontSize: 12, fontWeight: 700, cursor: 'pointer', opacity: enviandoObs || !novaObsTexto.trim() ? 0.6 : 1 }}>
                {enviandoObs ? '⏳' : 'Enviar'}
              </button>
            </div>
            )}
            {erroObs && <p style={{ fontSize: 11, color: '#dc2626', marginTop: 6 }}>{erroObs}</p>}
          </div>
        );
      })()}

      {/* Modal receber parcial */}
      {!isLogistica && isAberto && showReceberModal && (
        <ReceberModal
          quantidade={parcial.quantidade}
          unidade={parcial.unidade || 'un'}
          setor={parcial.setor_atual_nome}
          itemCodigo={parcial.item_codigo}
          itemDescricao={parcial.item_descricao}
          loading={loading}
          ocultarParcial
          onCancel={() => setShowReceberModal(false)}
          onConfirm={async (decisao, _qtd, obs) => {
            setShowReceberModal(false);
            if (decisao === 'iniciar') { acao('iniciar'); }
            else if (decisao === 'preparar') {
              setLoading(true);
              try {
                await parcialAcao(parcial.id, 'receber');
                mostrarErroParcial('Recebimento confirmado — clique em Iniciar quando estiver pronto', 'ok');
                onRefresh();
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
            style={{ background: '#0d6efd', color: '#fff', border: 'none', borderRadius: 6, padding: '6px 14px', fontSize: 12, fontWeight: 600, cursor: (loading || (!setorDestino && !parcial.proximo_setor)) ? 'not-allowed' : 'pointer', opacity: (!setorDestino && !parcial.proximo_setor) ? 0.4 : 1 }}>
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
          <label style={{ fontSize: 11, fontWeight: 600, color: '#842029', display: 'block', marginBottom: 4 }}>
            Motivo do retorno: <span style={{ color: '#dc2626' }}>*</span>
          </label>
          <textarea value={motivoDevolucao} onChange={e => setMotivoDevolucao(e.target.value)}
            rows={2} placeholder="Ex.: recebido por engano, setor errado, peça trocada..."
            style={{ width: '100%', border: '1px solid #f5c2c7', borderRadius: 5, padding: '6px 8px', fontSize: 13, marginBottom: 8, resize: 'vertical', boxSizing: 'border-box' }} />
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => {
              if (!setorDev) { mostrarErroParcial('Selecione o setor destino'); return; }
              if (!motivoDevolucao.trim()) { mostrarErroParcial('Informe o motivo do retorno'); return; }
              acao('devolver', { setor_destino: setorDev, tipo: 'correcao', observacao: motivoDevolucao.trim() });
              setShowDevolver(false); setMotivoDevolucao('');
            }} disabled={loading || !setorDev || !motivoDevolucao.trim()}
              style={{ flex: 1, background: '#dc3545', color: '#fff', border: 'none', borderRadius: 5, padding: '7px 0', fontSize: 13, fontWeight: 700, cursor: (!setorDev || !motivoDevolucao.trim()) ? 'not-allowed' : 'pointer', opacity: (!setorDev || !motivoDevolucao.trim()) ? 0.5 : 1 }}>
              Confirmar devolução
            </button>
            <button onClick={() => { setShowDevolver(false); setMotivoDevolucao(''); }}
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

function ParcialGrupoCard({ parciais, onRefresh, setor }: { parciais: ItemParcial[]; onRefresh: () => void; setor?: string }) {
  const { toast: toastGrupo, mostrar: mostrarErroGrupo, fechar: fecharToastGrupo } = useToast();
  const [loading, setLoading] = useState(false);
  const [confirm, setConfirm] = useState<{ titulo: string; mensagem: string; acao: () => void } | null>(null);
  const [showEnviar, setShowEnviar] = useState(false);
  const [showEnviarParcial, setShowEnviarParcial] = useState(false);
  const [showDivQualidade, setShowDivQualidade] = useState(false);
  const [showReceberModal, setShowReceberModal] = useState(false);
  const [qtdParcial, setQtdParcial] = useState('');
  const [showDevolver, setShowDevolver] = useState(false);
  const [setorDestino, setSetorDestino] = useState('');
  const [setorDev, setSetorDev] = useState('');
  const [setorRetrabalhoGrupo, setSetorRetrabalhoGrupo] = useState('');
  const [motivoDivGrupo, setMotivoDivGrupo] = useState('');
  const [motivoDevGrupo, setMotivoDevGrupo] = useState('');
  const [expandido, setExpandido] = useState(false);
  const [showEntregarGrupo, setShowEntregarGrupo] = useState(false);
  const [showDespacharGrupo, setShowDespacharGrupo] = useState(false);
  const [showIniciarEntregaGrupo, setShowIniciarEntregaGrupo] = useState(false);

  if (parciais.length === 1) return <ParcialCard parcial={parciais[0]} onRefresh={onRefresh} setor={setor} />;

  const p0 = parciais[0];
  const totalQtd = parciais.reduce((sum, p) => sum + Number(p.quantidade), 0);
  const todosIgual = parciais.every(p => p.status === p0.status);

  async function acaoTodos(a: string, body?: Record<string, unknown>, msgSucesso?: string) {
    setLoading(true);
    try {
      const r = await parcialAcaoLote(parciais.map(p => p.id), a, body);
      if (r.falhas > 0) {
        const primeiraFalha = r.resultados.find(x => !x.ok);
        mostrarErroGrupo(`${r.falhas} de ${r.total} falharam: ${primeiraFalha?.erro || 'erro desconhecido'}`);
      } else if (msgSucesso) {
        mostrarErroGrupo(msgSucesso, 'ok');
      }
      onRefresh();
    } catch (e: unknown) {
      const ax = e as { response?: { data?: { erro?: string } } };
      mostrarErroGrupo(ax?.response?.data?.erro || String(e));
    } finally { setLoading(false); }
  }

  const btnStyle = (bg: string, outline = false): React.CSSProperties => ({
    background: outline ? 'none' : bg, color: outline ? bg : '#fff',
    border: outline ? `1px solid ${bg}` : 'none',
    borderRadius: 6, padding: '6px 14px', fontSize: 12, fontWeight: 600,
    cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.6 : 1,
  });

  const badge = BADGE_PARCIAL[p0.status] || { bg: '#e2e3e5', color: '#333' };
  const isLogistica = p0.setor_atual === 'logistica';
  const isQualidadeGrupo = p0.setor_atual === 'qualidade';
  const isRecebido = p0.status === 'recebido';
  const podeDesfazer = isAdministrador();
  const foraDoRoteiroGrupo = !p0.proximo_setor && !isLogistica;

  async function aprovarGrupoQualidade() {
    const destino = setorDestino || p0.proximo_setor || '';
    if (!destino) { mostrarErroGrupo('Selecione o setor destino'); return; }
    setLoading(true);
    try {
      const ids = parciais.map(p => p.id);
      await parcialAcaoLote(ids, 'finalizar');
      // Sem quantidade: cada parcial move sua propria quantidade total
      await parcialAcaoLote(ids, 'mover', { setor_destino: destino });
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
              <ParcialCard parcial={p} onRefresh={onRefresh} setor={setor} />
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
  const isEmTransito = p0.status === 'em_transito';
  const isConcluida = p0.status === 'concluida';

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

      {/* Banner retrabalho / retorno de retrabalho (grupo) */}
      {parciais.some(p => p.retrabalho) && (() => {
        const voltou = parciais.some(p => p.retrabalho && p.devolvido_de && setor && p.devolvido_de === setor);
        const motivo = parciais.find(p => p.motivo_retrabalho)?.motivo_retrabalho;
        if (voltou) {
          return (
            <div style={{ background: '#ecfdf5', border: '1px solid #6ee7b7', borderRadius: 6, padding: '6px 10px', marginBottom: 8, display: 'flex', flexDirection: 'column', gap: 2 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#065f46' }}>🔄 Retornou de retrabalho — inspecionar novamente</div>
              {motivo && <div style={{ fontSize: 11, color: '#047857' }}>Problema original: {motivo}</div>}
            </div>
          );
        }
        return (
          <div style={{ background: '#fff3cd', border: '1px solid #ffc107', borderRadius: 6, padding: '6px 10px', marginBottom: 8, display: 'flex', flexDirection: 'column', gap: 2 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#856404' }}>⚠ Retrabalho — devolvido da Inspeção de Qualidade</div>
            {motivo && <div style={{ fontSize: 11, color: '#664d03' }}>Motivo: {motivo}</div>}
          </div>
        );
      })()}

      {/* Banner retorno via parcial-pai (divisão) */}
      {!parciais.some(p => p.retrabalho) && parciais.some(p => p.origem_retrabalho) && (
        <div style={{ background: '#ecfdf5', border: '1px solid #6ee7b7', borderRadius: 6, padding: '6px 10px', marginBottom: 8, display: 'flex', flexDirection: 'column', gap: 2 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#065f46' }}>🔄 Retornou de retrabalho — inspecionar novamente</div>
          {parciais.find(p => p.origem_motivo_retrabalho)?.origem_motivo_retrabalho && (
            <div style={{ fontSize: 11, color: '#047857' }}>
              Problema original: {parciais.find(p => p.origem_motivo_retrabalho)?.origem_motivo_retrabalho}
            </div>
          )}
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
                <span style={{ color: '#818cf8', fontSize: 10 }}>({PARCIAL_STATUS_LABELS[op.status] || op.status})</span>
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

      {/* Ações combinadas — escondidas para usuários somente leitura */}
      {podeEditar() && (
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {isLogistica && isAberto && (
          <button onClick={() => setShowIniciarEntregaGrupo(true)} disabled={loading} style={btnStyle('#0d6efd')}>
            <i className="bi bi-truck" style={{ marginRight: 5 }} />Iniciar entrega
          </button>
        )}
        {showIniciarEntregaGrupo && (
          <IniciarEntregaModal
            pedidoNumero={p0.numero_pedido_venda ?? ''}
            itemCodigo={p0.item_codigo ?? ''}
            loading={loading}
            onClose={() => setShowIniciarEntregaGrupo(false)}
            onConfirm={async (observacao) => {
              await acaoTodos('iniciar', { observacao });
              setShowIniciarEntregaGrupo(false);
            }}
          />
        )}
        {!isLogistica && isAberto && (
          <button onClick={() => setShowReceberModal(true)} disabled={loading} style={btnStyle('#d97706')}>
            <i className="bi bi-box-arrow-in-down" style={{ marginRight: 5 }} />Receber
          </button>
        )}
        {!isLogistica && isRecebido && (
          <>
            <button onClick={() => acaoTodos('iniciar')} disabled={loading} style={btnStyle('#198754')}>
              <i className="bi bi-play-fill" style={{ marginRight: 5 }} />Iniciar produção
            </button>
            <button onClick={() => { setShowEnviar(v => !v); setShowEnviarParcial(false); setShowDevolver(false); if (!setorDestino) setSetorDestino(p0.proximo_setor || ''); }} disabled={loading} style={btnStyle('#1a3a5c')}>
              <i className="bi bi-send-fill" style={{ marginRight: 5 }} />Enviar ao próximo setor
            </button>
            {podeDesfazer && (
              <button onClick={() => setConfirm({ titulo: 'Desfazer recebimento', mensagem: `Voltar ${parciais.length > 1 ? `as ${parciais.length} parciais` : 'a parcial'} para "em aberto" (não recebida)?`, acao: () => acaoTodos('desfazer_recebimento') })} disabled={loading} style={btnStyle('#6b7280', true)}>
                <i className="bi bi-arrow-counterclockwise" style={{ marginRight: 5 }} />Desfazer recebimento
              </button>
            )}
          </>
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
            <button onClick={() => acaoTodos('pausar')} disabled={loading} style={btnStyle('#fd7e14')}>
              <i className="bi bi-pause-fill" style={{ marginRight: 5 }} />Pausar
            </button>
          </>
        )}

        {/* Logística — confirma a entrega direto, sem etapa intermediária (mesmo fluxo do ParcialCard) */}
        {isLogistica && isAndamento && (
          <button onClick={() => setShowEntregarGrupo(true)} disabled={loading} style={btnStyle('#198754')}>
            <i className="bi bi-check-circle-fill" style={{ marginRight: 5 }} />Confirmar entrega
          </button>
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
          </>
        )}
        {isLogistica && isPausado && (
          <button onClick={() => acaoTodos('retomar')} disabled={loading} style={btnStyle('#0d6efd')}>
            <i className="bi bi-truck" style={{ marginRight: 5 }} />Tentar entrega novamente
          </button>
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
          </>
        )}
        {/* ── Concluída: mesmo já encerrada, pode ser encaminhada pra outro setor ──
             (não vale pra Logística: entrega concluída é o fim, não há próximo setor) */}
        {isConcluida && !isLogistica && (
          <>
            <button onClick={() => { setShowEnviar(v => !v); setShowEnviarParcial(false); setShowDevolver(false); if (!setorDestino) setSetorDestino(p0.proximo_setor || ''); }} disabled={loading} style={btnStyle('#1a3a5c')}>
              <i className="bi bi-send-fill" style={{ marginRight: 5 }} />Encaminhar tudo
            </button>
            <button onClick={() => { setShowEnviarParcial(v => !v); setShowEnviar(false); setShowDevolver(false); if (!setorDestino) setSetorDestino(p0.proximo_setor || ''); }} disabled={loading} style={btnStyle('#0d6efd')}>
              <i className="bi bi-send" style={{ marginRight: 5 }} />Encaminhar parcial
            </button>
          </>
        )}

        {/* Logística — despacho legado (finalizado_setor -> em_transito), mesmo caminho do ParcialCard */}
        {isLogistica && isFinalizado && (
          <button onClick={() => setShowDespacharGrupo(true)} disabled={loading} style={btnStyle('#fd7e14')}>
            🚚 Despachar
          </button>
        )}
        {isLogistica && isEmTransito && (
          <button onClick={() => setShowEntregarGrupo(true)} disabled={loading} style={btnStyle('#198754')}>
            <i className="bi bi-check-circle-fill" style={{ marginRight: 5 }} />Confirmar entrega
          </button>
        )}
        {showEntregarGrupo && (
          <EntregarModal
            itemId={p0.item_pedido_id as number}
            pedidoNumero={p0.numero_pedido_venda ?? ''}
            descricao={p0.item_descricao ?? ''}
            quantidade={String(totalQtd)}
            unidade={p0.unidade ?? 'un'}
            onCancel={() => setShowEntregarGrupo(false)}
            onConfirm={() => { setShowEntregarGrupo(false); onRefresh(); }}
          />
        )}
        {showDespacharGrupo && (
          <DespacharModal
            itemId={p0.item_pedido_id as number}
            itemCodigo={p0.item_codigo ?? ''}
            pedidoNumero={p0.numero_pedido_venda ?? ''}
            onClose={() => setShowDespacharGrupo(false)}
            onSuccess={() => { setShowDespacharGrupo(false); onRefresh(); }}
          />
        )}

        {/* Devolver — em todos os setores e status ativos (inclui recebido: peça
            chegou errada e precisa voltar a um setor anterior, ex.: Emissão) */}
        {(isAberto || isRecebido || isAndamento || isPausado || isFinalizado || isEmTransito) && (
          <button onClick={() => { setShowDevolver(v => !v); setShowEnviar(false); }} disabled={loading} style={btnStyle('#dc3545', true)}>
            <i className="bi bi-arrow-return-left" style={{ marginRight: 5 }} />Devolver
          </button>
        )}
      </div>
      )}

      {/* Modal receber grupo */}
      {!isLogistica && isAberto && showReceberModal && (
        <ReceberModal
          quantidade={String(totalQtd)}
          unidade={p0.unidade || 'un'}
          setor={p0.setor_atual_nome}
          itemCodigo={p0.item_codigo}
          itemDescricao={p0.item_descricao}
          loading={loading}
          ocultarParcial
          onCancel={() => setShowReceberModal(false)}
          onConfirm={async (decisao, _qtd, obs) => {
            setShowReceberModal(false);
            if (decisao === 'iniciar') { acaoTodos('iniciar'); }
            else if (decisao === 'preparar') {
              setLoading(true);
              try {
                const r = await parcialAcaoLote(parciais.map(p => p.id), 'receber');
                if (r.falhas > 0) {
                  const primeiraFalha = r.resultados.find(x => !x.ok);
                  mostrarErroGrupo(`${r.falhas} de ${r.total} falharam: ${primeiraFalha?.erro || 'erro desconhecido'}`);
                } else {
                  mostrarErroGrupo('Recebimento confirmado — clique em Iniciar quando estiver pronto', 'ok');
                }
                onRefresh();
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
            // Sem quantidade explicita: cada parcial usa sua propria quantidade total
            // (o grupo pode ter parciais com quantidades diferentes, ex. apos uma divisao).
            acaoTodos('mover', { setor_destino: dest });
            setShowEnviar(false);
          }} disabled={loading || (!setorDestino && !p0.proximo_setor)}
            style={{ background: '#0d6efd', color: '#fff', border: 'none', borderRadius: 6, padding: '6px 14px', fontSize: 12, fontWeight: 600, cursor: (loading || (!setorDestino && !p0.proximo_setor)) ? 'not-allowed' : 'pointer', opacity: (!setorDestino && !p0.proximo_setor) ? 0.4 : 1 }}>
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
            style={{ background: '#0d6efd', color: '#fff', border: 'none', borderRadius: 6, padding: '6px 14px', fontSize: 12, fontWeight: 600, cursor: (loading || (!setorDestino && !p0.proximo_setor)) ? 'not-allowed' : 'pointer', opacity: (!setorDestino && !p0.proximo_setor) ? 0.4 : 1 }}>
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
                const ids = parciais.map(p => p.id);
                if (p0.status === 'finalizado_setor') {
                  await parcialAcaoLote(ids, 'retomar');
                }
                await parcialAcaoLote(ids, 'pausar', { observacao: motivoDivGrupo });
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
          <label style={{ fontSize: 11, fontWeight: 600, color: '#842029', display: 'block', marginBottom: 4 }}>
            Motivo do retorno: <span style={{ color: '#dc2626' }}>*</span>
          </label>
          <textarea value={motivoDevGrupo} onChange={e => setMotivoDevGrupo(e.target.value)}
            rows={2} placeholder="Ex.: recebido por engano, setor errado, peça trocada..."
            style={{ width: '100%', border: '1px solid #f5c2c7', borderRadius: 5, padding: '6px 8px', fontSize: 13, marginBottom: 8, resize: 'vertical', boxSizing: 'border-box' }} />
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => {
              if (!setorDev) { mostrarErroGrupo('Selecione o setor destino'); return; }
              if (!motivoDevGrupo.trim()) { mostrarErroGrupo('Informe o motivo do retorno'); return; }
              acaoTodos('devolver', { setor_destino: setorDev, tipo: 'correcao', observacao: motivoDevGrupo.trim() });
              setShowDevolver(false); setMotivoDevGrupo('');
            }} disabled={loading || !setorDev || !motivoDevGrupo.trim()}
              style={{ flex: 1, background: '#dc3545', color: '#fff', border: 'none', borderRadius: 5, padding: '7px 0', fontSize: 13, fontWeight: 700, cursor: (!setorDev || !motivoDevGrupo.trim()) ? 'not-allowed' : 'pointer', opacity: (!setorDev || !motivoDevGrupo.trim()) ? 0.5 : 1 }}>
              Confirmar devolução
            </button>
            <button onClick={() => { setShowDevolver(false); setMotivoDevGrupo(''); }}
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

function PedidoGrupos({ grupos, onRefresh, onVerPedido, setor }: { grupos: [string, ItemPedido[]][]; onRefresh: () => void; onVerPedido?: (pedidoId: number, numero: string) => void; setor?: string }) {
  const [abertos, setAbertos] = useState<Set<string>>(new Set());
  const [iniciando, setIniciando] = useState<Set<string>>(new Set());
  const modoEmissao = setor === 'emissao';

  function toggle(chave: string) {
    setAbertos(prev => {
      const next = new Set(prev);
      if (next.has(chave)) next.delete(chave);
      else next.add(chave);
      return next;
    });
  }

  async function iniciarProducao(numeroPedido: string, itens: ItemPedido[]) {
    const emitidos = itens.filter(i => i.status === 'emitido');
    if (emitidos.length === 0) return;
    setIniciando(prev => new Set(prev).add(numeroPedido));
    try {
      for (const item of emitidos) {
        try { await itemAcao(item.id, 'liberar'); } catch { /* segue para os proximos */ }
      }
      onRefresh();
    } finally {
      setIniciando(prev => { const s = new Set(prev); s.delete(numeroPedido); return s; });
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {grupos.map(([numeroPedido, itens]) => {
        const rep = itens[0];
        const atrasado = !!rep.atrasado;
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

        const emitidos = itens.filter(i => i.status === 'emitido');
        const carregandoInicio = iniciando.has(numeroPedido);

        return (
          <div key={numeroPedido} style={{
            border: modoEmissao ? '2px solid #dde3f0' : atrasado ? '1.5px solid #fca5a5' : '1px solid #e2e8f0',
            borderRadius: modoEmissao ? 12 : 10, overflow: 'hidden',
            background: '#fff',
            boxShadow: '0 1px 4px rgba(0,0,0,.06)',
          }}>
            {/* Cabeçalho clicável */}
            <div
              role="button"
              tabIndex={0}
              onClick={() => toggle(numeroPedido)}
              onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') toggle(numeroPedido); }}
              style={{
                width: '100%', textAlign: 'left',
                background: modoEmissao ? '#1a3a5c' : atrasado ? '#fef2f2' : '#f8fafc',
                border: 'none', borderBottom: aberto ? '1px solid #e2e8f0' : 'none',
                padding: modoEmissao ? '10px 16px' : '12px 16px', cursor: 'pointer', display: 'flex',
                alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                {modoEmissao && <i className="bi bi-folder2-open" style={{ fontSize: 15, color: '#fff' }} />}
                <span style={{ fontWeight: 700, fontSize: 15, color: modoEmissao ? '#fff' : '#1a3a5c' }}>
                  {modoEmissao ? `Pedido de Venda ${numeroPedido}` : numeroPedido}
                </span>
                <span className={`badge-${rep.pedido_prioridade || 'normal'}`}>
                  {rep.pedido_prioridade?.charAt(0).toUpperCase()}{rep.pedido_prioridade?.slice(1)}
                </span>
                {atrasado && (
                  <span style={{ fontSize: 11, fontWeight: 700, color: '#dc2626', background: '#fee2e2', padding: '2px 8px', borderRadius: 4 }}>
                    <i className="bi bi-clock-fill" style={{ marginRight: 4 }}></i>ATRASADO
                  </span>
                )}
                <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>{statusChips}</div>
                {onVerPedido && (
                  <button
                    title="Ver todos os itens deste pedido"
                    onClick={(e) => { e.stopPropagation(); onVerPedido(rep.pedido_id, numeroPedido); }}
                    style={{
                      background: modoEmissao ? 'rgba(255,255,255,.15)' : '#eef2ff',
                      border: modoEmissao ? 'none' : '1px solid #c7d2fe',
                      color: modoEmissao ? '#fff' : '#1a3a5c',
                      borderRadius: 5, padding: '2px 7px', fontSize: 12, cursor: 'pointer', display: 'flex', alignItems: 'center',
                    }}>
                    <i className="bi bi-eye-fill" />
                  </button>
                )}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 11, color: modoEmissao ? 'rgba(255,255,255,.7)' : '#888' }}>
                {rep.pedido_prazo && (
                  <span><i className="bi bi-calendar3" style={{ marginRight: 4 }}></i>{rep.pedido_prazo}</span>
                )}
                <span style={{ fontWeight: 600 }}>{itens.length} {itens.length === 1 ? 'item' : 'itens'}</span>
                {modoEmissao && emitidos.length > 0 && podeEditar() && (
                  <button
                    disabled={carregandoInicio}
                    onClick={(e) => { e.stopPropagation(); iniciarProducao(numeroPedido, itens); }}
                    style={{
                      background: carregandoInicio ? '#4a6fa5' : '#f59e0b', color: carregandoInicio ? '#fff' : '#1a1a1a',
                      border: 'none', borderRadius: 6, padding: '4px 12px', fontSize: 12, fontWeight: 700,
                      cursor: carregandoInicio ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', gap: 6,
                    }}>
                    {carregandoInicio
                      ? <><i className="bi bi-hourglass-split" /> Iniciando...</>
                      : <><i className="bi bi-play-fill" /> Iniciar Produção ({emitidos.length})</>}
                  </button>
                )}
                <i className={`bi bi-chevron-${aberto ? 'up' : 'down'}`} style={{ fontSize: 13, color: modoEmissao ? 'rgba(255,255,255,.8)' : '#64748b' }}></i>
              </div>
            </div>

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

function getDesenhoUrl(pedidoId: number) {
  const token = typeof window !== 'undefined' ? localStorage.getItem('access_token') || '' : '';
  return `/api/pedidos/${pedidoId}/desenho?token=${encodeURIComponent(token)}`;
}

function getPedidoVendaUrl(pedidoId: number) {
  const token = typeof window !== 'undefined' ? localStorage.getItem('access_token') || '' : '';
  return `/api/pedidos/${pedidoId}/pedido-venda?token=${encodeURIComponent(token)}`;
}

function getOrdemProducaoUrl(pedidoId: number) {
  const token = typeof window !== 'undefined' ? localStorage.getItem('access_token') || '' : '';
  return `/api/pedidos/${pedidoId}/ordem-producao?token=${encodeURIComponent(token)}`;
}

function fmtPeso(n: number) {
  return n.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 3 });
}

// Editor de peso da embalagem por pallet (setor Embalagem). Sempre editável;
// salva a lista de pesos (kg) via PATCH. O total é a soma dos pallets.
function PesosPalletsEditor({ parcialId, inicial }: { parcialId: number; inicial: number[] }) {
  const [pesos, setPesos] = useState<string[]>(() => (inicial.length ? inicial.map(n => String(n)) : ['']));
  const [salvando, setSalvando] = useState(false);
  const [msg, setMsg] = useState<{ tipo: 'ok' | 'erro'; texto: string } | null>(null);

  const total = pesos.reduce((s, p) => s + (parseFloat(p.replace(',', '.')) || 0), 0);

  async function salvar() {
    setSalvando(true); setMsg(null);
    try {
      const nums = pesos.map(p => parseFloat(p.replace(',', '.'))).filter(n => Number.isFinite(n) && n >= 0);
      await setPesosPallets(parcialId, nums);
      setMsg({ tipo: 'ok', texto: 'Peso salvo' });
      setTimeout(() => setMsg(null), 2500);
    } catch {
      setMsg({ tipo: 'erro', texto: 'Erro ao salvar' });
    } finally { setSalvando(false); }
  }

  return (
    <div style={{ background: '#f0f9ff', border: '1px solid #bae6fd', borderRadius: 8, padding: '10px 12px', marginBottom: 10 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: '#0369a1', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>
        📦 Peso da embalagem (kg)
      </div>
      {pesos.map((p, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
          <span style={{ fontSize: 12, color: '#475569', fontWeight: 600, minWidth: 58 }}>Palet {i + 1}</span>
          <input
            type="number" inputMode="decimal" min="0" step="0.001" value={p}
            onChange={e => setPesos(arr => arr.map((v, idx) => idx === i ? e.target.value : v))}
            placeholder="kg"
            style={{ border: '1px solid #cbd5e1', borderRadius: 5, padding: '5px 8px', fontSize: 13, width: 100 }}
          />
          <span style={{ fontSize: 12, color: '#64748b' }}>kg</span>
          <button type="button" onClick={() => setPesos(arr => arr.length > 1 ? arr.filter((_, idx) => idx !== i) : [''])}
            title="Remover pallet"
            style={{ background: 'none', border: 'none', color: '#dc2626', cursor: 'pointer', fontSize: 14, marginLeft: 'auto' }}>
            <i className="bi bi-trash" />
          </button>
        </div>
      ))}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 8, flexWrap: 'wrap' }}>
        <button type="button" onClick={() => setPesos(arr => [...arr, ''])}
          style={{ background: 'none', border: '1px dashed #7dd3fc', color: '#0369a1', borderRadius: 5, padding: '4px 10px', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
          <i className="bi bi-plus-lg" style={{ marginRight: 4 }} />Adicionar pallet
        </button>
        <span style={{ fontSize: 12, color: '#0f172a', fontWeight: 700 }}>Total: {fmtPeso(total)} kg</span>
        <button type="button" onClick={salvar} disabled={salvando}
          style={{ background: salvando ? '#93c5fd' : '#0284c7', color: '#fff', border: 'none', borderRadius: 5, padding: '5px 14px', fontSize: 12, fontWeight: 700, cursor: salvando ? 'not-allowed' : 'pointer', marginLeft: 'auto' }}>
          {salvando ? 'Salvando...' : 'Salvar peso'}
        </button>
        {msg && <span style={{ fontSize: 12, fontWeight: 600, color: msg.tipo === 'ok' ? '#16a34a' : '#dc2626' }}>{msg.texto}</span>}
      </div>
    </div>
  );
}

// Exibição somente leitura do peso da embalagem (setor Logística).
function PesosPalletsInfo({ pesos }: { pesos: number[] }) {
  if (!pesos || pesos.length === 0) return null;
  const total = pesos.reduce((s, p) => s + (Number(p) || 0), 0);
  return (
    <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, padding: '8px 12px', marginBottom: 10 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: '#475569', marginBottom: 4 }}>
        📦 Peso da embalagem — {pesos.length} pallet{pesos.length > 1 ? 's' : ''} · Total {fmtPeso(total)} kg
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {pesos.map((p, i) => (
          <span key={i} style={{ fontSize: 11, background: '#eef2ff', color: '#3730a3', borderRadius: 4, padding: '2px 8px', fontWeight: 600 }}>
            Palet {i + 1}: {fmtPeso(Number(p))} kg
          </span>
        ))}
      </div>
    </div>
  );
}

// Fotos da parcial — tiradas no Acabamento/Embalagem, viajam com a peça e
// aparecem também na Logística. `editavel` libera adicionar/excluir (só nos
// setores de upload e para quem não é somente-leitura); caso contrário, só vê.
function FotosParcial({ parcialId, inicial, editavel }: { parcialId: number; inicial: string[]; editavel: boolean }) {
  const [fotos, setFotos] = useState<string[]>(inicial || []);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState('');
  const [ampliada, setAmpliada] = useState<number | null>(null);
  const token = getToken() || '';
  const urlFoto = (idx: number) => `/api/parcial/${parcialId}/foto?idx=${idx}&token=${encodeURIComponent(token)}`;

  async function enviar(arquivo: File) {
    setEnviando(true); setErro('');
    try {
      const fd = new FormData();
      fd.append('arquivo', arquivo);
      const res = await fetch(`/api/parcial/${parcialId}/foto`, {
        method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: fd,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setErro(data.erro || 'Erro ao enviar foto'); return; }
      setFotos(prev => [...prev, data.path]);
    } catch { setErro('Erro de conexão ao enviar a foto'); }
    finally { setEnviando(false); }
  }

  async function remover(path: string) {
    setErro('');
    try {
      const res = await fetch(`/api/parcial/${parcialId}/foto`, {
        method: 'DELETE', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ path }),
      });
      if (!res.ok) { const d = await res.json().catch(() => ({})); setErro(d.erro || 'Erro ao remover'); return; }
      setFotos(prev => prev.filter(p => p !== path));
    } catch { setErro('Erro de conexão ao remover a foto'); }
  }

  if (!editavel && fotos.length === 0) return null;

  return (
    <div style={{ background: '#f5f3ff', border: '1px solid #ddd6fe', borderRadius: 8, padding: '10px 12px', marginBottom: 10 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: '#6d28d9', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>
        📷 Fotos da peça {fotos.length > 0 && `(${fotos.length})`}
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        {fotos.map((path, i) => (
          <div key={path} style={{ position: 'relative' }}>
            <img
              src={urlFoto(i)} alt={`Foto ${i + 1}`} onClick={() => setAmpliada(i)}
              style={{ width: 72, height: 72, objectFit: 'cover', borderRadius: 6, border: '1px solid #c4b5fd', cursor: 'pointer', background: '#fff' }}
            />
            {editavel && (
              <button type="button" onClick={() => remover(path)} title="Remover foto"
                style={{ position: 'absolute', top: -6, right: -6, background: '#dc2626', color: '#fff', border: '2px solid #fff', borderRadius: '50%', width: 20, height: 20, fontSize: 11, lineHeight: 1, cursor: 'pointer', padding: 0 }}>
                ✕
              </button>
            )}
          </div>
        ))}
        {editavel && (
          <>
            {/* Câmera: abre a câmera do celular/tablet direto (capture) */}
            <label style={{
              width: 72, height: 72, borderRadius: 6, border: '1.5px dashed #a78bfa', color: '#7c3aed',
              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
              cursor: enviando ? 'wait' : 'pointer', fontSize: 11, fontWeight: 600, textAlign: 'center', gap: 2,
            }}>
              <i className="bi bi-camera-fill" style={{ fontSize: 18 }} />
              {enviando ? 'Enviando...' : 'Câmera'}
              <input type="file" accept="image/*" capture="environment" style={{ display: 'none' }} disabled={enviando}
                onChange={e => { const f = e.target.files?.[0]; if (f) enviar(f); e.target.value = ''; }} />
            </label>
            {/* Galeria: escolher uma imagem já salva no aparelho */}
            <label style={{
              width: 72, height: 72, borderRadius: 6, border: '1.5px dashed #c4b5fd', color: '#7c3aed',
              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
              cursor: enviando ? 'wait' : 'pointer', fontSize: 11, fontWeight: 600, textAlign: 'center', gap: 2,
            }}>
              <i className="bi bi-images" style={{ fontSize: 18 }} />
              Galeria
              <input type="file" accept="image/*" style={{ display: 'none' }} disabled={enviando}
                onChange={e => { const f = e.target.files?.[0]; if (f) enviar(f); e.target.value = ''; }} />
            </label>
          </>
        )}
      </div>
      {erro && <p style={{ fontSize: 11, color: '#dc2626', marginTop: 6, marginBottom: 0 }}>{erro}</p>}

      {/* Visualização ampliada */}
      {ampliada !== null && fotos[ampliada] && (
        <div onClick={() => setAmpliada(null)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <img src={urlFoto(ampliada)} alt="Foto ampliada" style={{ maxWidth: '95%', maxHeight: '95%', objectFit: 'contain', borderRadius: 8 }} />
        </div>
      )}
    </div>
  );
}

// Linha de links dos documentos anexados ao pedido (PV / OP / Desenho).
// Mostrada nos cards do painel de setor para o operador abrir/baixar direto da área.
// Só renderiza os que existem; se nenhum existir, não aparece nada.
function DocumentosPedidoLinks({ pedidoId, temPedidoVenda, temOrdemProducao, temDesenho }: {
  pedidoId?: number; temPedidoVenda?: boolean; temOrdemProducao?: boolean; temDesenho?: boolean;
}) {
  if (!pedidoId || (!temPedidoVenda && !temOrdemProducao && !temDesenho)) return null;
  const linkStyle: React.CSSProperties = {
    display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, fontWeight: 600,
    color: '#1d4ed8', textDecoration: 'none', background: '#eff6ff', border: '1px solid #bfdbfe',
    borderRadius: 5, padding: '4px 10px',
  };
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
      {temPedidoVenda && (
        <a href={getPedidoVendaUrl(pedidoId)} target="_blank" rel="noopener noreferrer" style={linkStyle}>
          📄 Pedido de Venda
        </a>
      )}
      {temOrdemProducao && (
        <a href={getOrdemProducaoUrl(pedidoId)} target="_blank" rel="noopener noreferrer" style={linkStyle}>
          🗂 Ordem de Produção
        </a>
      )}
      {temDesenho && (
        <a href={getDesenhoUrl(pedidoId)} target="_blank" rel="noopener noreferrer" style={linkStyle}>
          📐 Desenho Técnico
        </a>
      )}
    </div>
  );
}

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
  const [pedidosColapsados, setPedidosColapsados] = useState<Set<number>>(new Set());
  const [recebendoTudo, setRecebendoTudo] = useState<Set<number>>(new Set());
  const [enviandoTudo, setEnviandoTudo] = useState<Set<number>>(new Set());
  const [desfazendoTudo, setDesfazendoTudo] = useState<Set<number>>(new Set());
  const podeDesfazer = isAdministrador();
  const [confirm, setConfirm] = useState<{ titulo: string; mensagem: string; acao: () => void } | null>(null);
  const [modalRastreio, setModalRastreio] = useState<{ pedidoId: number; numero: string } | null>(null);
  // Pedidos ja vistos nesta sessao da pagina - controla quais ja tiveram seu
  // estado de colapso inicializado, pra nao re-fechar um que o usuario abriu.
  const pedidosVistos = useRef<Set<number>>(new Set());

  // Guarda o "retrato" dos últimos dados carregados. O polling de segurança do
  // useRealtime dispara carregar() a cada 15s; sem essa comparação, a tela toda
  // (11 pedidos / dezenas de parciais) re-renderizava a cada 15s mesmo sem nada
  // ter mudado — no tablet isso engasgava e chegava a "comer" o toque nos botões.
  const ultimoDadosRef = useRef<string>('');

  const carregar = useCallback(() => {
    getSetorPainel(setor).then(d => {
      setLoading(false);
      const retrato = JSON.stringify(d);
      if (retrato === ultimoDadosRef.current) return; // nada mudou → não re-renderiza
      ultimoDadosRef.current = retrato;
      setData(d);
      setUltimaAtt(new Date());
    }).catch(() => setLoading(false));
  }, [setor]);

  // Todo pedido comeca fechado - so abre se o usuario clicar. Roda a cada
  // atualizacao de dados, mas so mexe em pedidos vistos pela primeira vez.
  useEffect(() => {
    const idsAtuais = new Set((data?.parciais || []).map(p => p.pedido_id));
    const novos = Array.from(idsAtuais).filter(id => !pedidosVistos.current.has(id));
    if (novos.length === 0) return;
    novos.forEach(id => pedidosVistos.current.add(id));
    setPedidosColapsados(prev => new Set(Array.from(prev).concat(novos)));
  }, [data]);

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
    const id = setInterval(() => carregarRef.current(), 20 * 60 * 1000);
    return () => clearInterval(id);
  }, []); // [] = inicia uma vez, usa sempre a ref mais recente

  return (
    <AuthGuard>
      {confirm && (
        <ConfirmModal titulo={confirm.titulo} mensagem={confirm.mensagem} confirmLabel="Confirmar"
          onConfirm={() => { confirm.acao(); setConfirm(null); }} onCancel={() => setConfirm(null)} />
      )}
      {modalRastreio && (
        <RastreioModal pedidoId={modalRastreio.pedidoId} numero={modalRastreio.numero} onClose={() => setModalRastreio(null)} />
      )}
      <NotificacoesLive filtroSetor={setor} />
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: setor === 'logistica' ? 12 : 18, flexWrap: 'wrap', gap: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Link href="/" style={{ fontSize: 12, color: '#6b7280', textDecoration: 'none', border: '1px solid #d1d5db', borderRadius: 5, padding: '4px 10px', background: '#f9fafb', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            ← Início
          </Link>
          <h4 style={{ margin: 0, fontWeight: 700, color: '#1a3a5c', fontSize: 20 }}>
            <i className={`bi ${setor === 'logistica' ? 'bi-truck' : 'bi-tools'}`} style={{ marginRight: 8 }}></i>
            {nomeSetor}
          </h4>
        </div>
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
                        {/* Cabeçalho do pedido — clicável para colapsar/expandir */}
                        <div
                          className="setor-pedido-header"
                          onClick={() => setPedidosColapsados(prev => {
                            const next = new Set(prev);
                            if (next.has(pedido_id)) next.delete(pedido_id); else next.add(pedido_id);
                            return next;
                          })}
                          style={{ background: '#1a3a5c', color: '#fff', padding: '10px 16px', display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', userSelect: 'none' }}
                        >
                          <i className="bi bi-folder2-open" style={{ fontSize: 15 }} />
                          <span style={{ fontWeight: 700, fontSize: 15 }}>Pedido de Venda {numero_pedido_venda}</span>
                          <span style={{ fontSize: 11, opacity: 0.65, marginLeft: 4 }}>
                            {parciais.length} {parciais.length > 1 ? 'parciais' : 'parcial'}
                            {itemGrupos.length > 1 ? ` · ${itemGrupos.length} produtos` : ''}
                          </span>
                          <button
                            title="Ver todos os itens deste pedido"
                            onClick={(e) => { e.stopPropagation(); setModalRastreio({ pedidoId: pedido_id, numero: numero_pedido_venda }); }}
                            style={{ background: 'rgba(255,255,255,.15)', border: 'none', color: '#fff', borderRadius: 5, padding: '3px 8px', fontSize: 12, cursor: 'pointer', display: 'flex', alignItems: 'center' }}>
                            <i className="bi bi-eye-fill" />
                          </button>
                          {(() => {
                            if (!podeEditar()) return null;
                            const recebiveis = parciais.filter(p => p.status === 'em_aberto' && p.setor_atual !== 'logistica');
                            if (recebiveis.length === 0) return null;
                            const carregando = recebendoTudo.has(pedido_id);
                            return (
                              <button
                                disabled={carregando}
                                onClick={async (e) => {
                                  e.stopPropagation();
                                  setRecebendoTudo(prev => new Set(prev).add(pedido_id));
                                  try {
                                    await parcialAcaoLote(recebiveis.map(p => p.id), 'receber');
                                    carregar();
                                  } catch { /* carregar mesmo assim */ carregar(); }
                                  finally { setRecebendoTudo(prev => { const s = new Set(prev); s.delete(pedido_id); return s; }); }
                                }}
                                style={{ marginLeft: 'auto', background: carregando ? '#4a6fa5' : '#f59e0b', color: carregando ? '#fff' : '#1a1a1a', border: 'none', borderRadius: 6, padding: '4px 12px', fontSize: 12, fontWeight: 700, cursor: carregando ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}
                              >
                                {carregando
                                  ? <><i className="bi bi-hourglass-split" /> Recebendo...</>
                                  : <><i className="bi bi-box-arrow-in-down-left" /> Receber Tudo ({recebiveis.length})</>}
                              </button>
                            );
                          })()}
                          {(() => {
                            if (!podeEditar()) return null;
                            const recebiveisCheck = parciais.some(p => p.status === 'em_aberto' && p.setor_atual !== 'logistica');
                            const enviaveis = parciais.filter(p =>
                              ['recebido', 'em_andamento', 'pausado', 'finalizado_setor'].includes(p.status)
                              && p.proximo_setor
                              && p.setor_atual !== 'logistica'
                            );
                            if (enviaveis.length === 0) return null;
                            const carregando = enviandoTudo.has(pedido_id);
                            const executarEnvioTudo = async () => {
                              setEnviandoTudo(prev => new Set(prev).add(pedido_id));
                              try {
                                for (const p of enviaveis) {
                                  await parcialAcao(p.id, 'mover', { setor_destino: p.proximo_setor, quantidade: Number(p.quantidade) });
                                }
                                carregar();
                              } catch { /* carregar mesmo assim */ carregar(); }
                              finally { setEnviandoTudo(prev => { const s = new Set(prev); s.delete(pedido_id); return s; }); }
                            };
                            return (
                              <button
                                disabled={carregando}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setConfirm({
                                    titulo: 'Enviar tudo',
                                    mensagem: `Confirma o envio de ${enviaveis.length} ${enviaveis.length > 1 ? 'parciais' : 'parcial'} deste pedido para o próximo setor?`,
                                    acao: executarEnvioTudo,
                                  });
                                }}
                                style={{ marginLeft: recebiveisCheck ? 0 : 'auto', background: carregando ? '#4a6fa5' : '#1a3a5c', color: '#fff', border: 'none', borderRadius: 6, padding: '4px 12px', fontSize: 12, fontWeight: 700, cursor: carregando ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}
                              >
                                {carregando
                                  ? <><i className="bi bi-hourglass-split" /> Enviando...</>
                                  : <><i className="bi bi-send-fill" /> Enviar Tudo ({enviaveis.length})</>}
                              </button>
                            );
                          })()}
                          {(() => {
                            // Desfazer recebimento (só administrador): volta as parciais
                            // recebidas para "em aberto", fazendo o "Receber Tudo" reaparecer.
                            const desfaziveis = parciais.filter(p => p.status === 'recebido' && p.setor_atual !== 'logistica');
                            if (!podeEditar() || !podeDesfazer || desfaziveis.length === 0) return null;
                            const temRecebiveis = parciais.some(p => p.status === 'em_aberto' && p.setor_atual !== 'logistica');
                            const temEnviaveis = parciais.some(p =>
                              ['recebido', 'em_andamento', 'pausado', 'finalizado_setor'].includes(p.status)
                              && p.proximo_setor && p.setor_atual !== 'logistica'
                            );
                            const carregando = desfazendoTudo.has(pedido_id);
                            const executarDesfazer = async () => {
                              setDesfazendoTudo(prev => new Set(prev).add(pedido_id));
                              try { await parcialAcaoLote(desfaziveis.map(p => p.id), 'desfazer_recebimento'); carregar(); }
                              catch { carregar(); }
                              finally { setDesfazendoTudo(prev => { const s = new Set(prev); s.delete(pedido_id); return s; }); }
                            };
                            return (
                              <button
                                disabled={carregando}
                                title="Desfazer o recebimento — volta as peças para 'em aberto' (Receber Tudo)"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setConfirm({
                                    titulo: 'Desfazer recebimento',
                                    mensagem: `Voltar ${desfaziveis.length} ${desfaziveis.length > 1 ? 'parciais recebidas' : 'parcial recebida'} deste pedido para "em aberto"? O "Receber Tudo" volta a aparecer.`,
                                    acao: executarDesfazer,
                                  });
                                }}
                                style={{ marginLeft: (temRecebiveis || temEnviaveis) ? 0 : 'auto', background: 'rgba(255,255,255,.12)', color: '#fff', border: '1px solid rgba(255,255,255,.4)', borderRadius: 6, padding: '4px 12px', fontSize: 12, fontWeight: 700, cursor: carregando ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}
                              >
                                {carregando
                                  ? <><i className="bi bi-hourglass-split" /> Desfazendo...</>
                                  : <><i className="bi bi-arrow-counterclockwise" /> Desfazer</>}
                              </button>
                            );
                          })()}
                          {(() => {
                            const temRecebiveis = parciais.some(p => p.status === 'em_aberto' && p.setor_atual !== 'logistica');
                            const temEnviaveis = parciais.some(p =>
                              ['recebido', 'em_andamento', 'pausado', 'finalizado_setor'].includes(p.status)
                              && p.proximo_setor
                              && p.setor_atual !== 'logistica'
                            );
                            return (
                              <i
                                className={pedidosColapsados.has(pedido_id) ? 'bi bi-chevron-right' : 'bi bi-chevron-down'}
                                style={{ marginLeft: (temRecebiveis || temEnviaveis) ? 0 : 'auto', fontSize: 13, opacity: 0.8 }}
                              />
                            );
                          })()}
                        </div>
                        {/* Produtos do pedido */}
                        {!pedidosColapsados.has(pedido_id) && <div style={{ display: 'flex', flexDirection: 'column' }}>
                          {itemGrupos.map((grupo, itemIdx) => {
                            const p0 = grupo[0];
                            return (
                              <div key={(p0.item_codigo || '') + itemIdx} style={{ borderTop: itemIdx > 0 ? '2px solid #e2e8f0' : 'none' }}>
                                {/* Todas as parciais do item agrupadas em um único card
                                    (o proprio card ja mostra descricao/codigo/OP/quantidade) */}
                                <div className="setor-parcial-area" style={{ padding: '12px 12px' }}>
                                  <ParcialGrupoCard parciais={grupo} onRefresh={carregar} setor={setor} />
                                </div>
                              </div>
                            );
                          })}
                        </div>}
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
                <PedidoGrupos grupos={grupos} onRefresh={carregar} onVerPedido={(pedidoId, numero) => setModalRastreio({ pedidoId, numero })} setor={setor} />
              </section>
            );
          })()}
        </div>
      )}
    </AuthGuard>
  );
}
