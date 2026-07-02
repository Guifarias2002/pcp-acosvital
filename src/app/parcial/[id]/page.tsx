'use client';
import { useEffect, useState, useCallback, useRef } from 'react';
import { useRealtime } from '@/hooks/useRealtime';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import AuthGuard from '@/components/AuthGuard';
import { getParcial, getItem, parcialAcao } from '@/lib/api';
import { getUser } from '@/lib/auth';
import { SETOR_CHOICES, STATUS_LABELS, NOMES, PARCIAL_STATUS_LABELS, PARCIAL_STATUS_COR, ItemPedido } from '@/lib/types';
import { fmtData, fmtHora, fmtDuracao, fmtQtd } from '@/lib/format';
import ProgressoRoteiro, { RoteiroCirculo } from '@/components/workspace/ProgressoRoteiro';
import LinhaDoTempo from '@/components/workspace/LinhaDoTempo';
import OndeEstaoPecas from '@/components/workspace/OndeEstaoPecas';
import RastreabilidadeParciais from '@/components/workspace/RastreabilidadeParciais';
import ConfirmModal from '@/components/ConfirmModal';

// Shape returned by GET /api/parcial/[id]
interface ParcialDetalhe {
  id: number;
  item_pedido_id: number;
  pedido_id: number;
  parcial_origem_id: number | null;
  quantidade: string;
  unidade: string;
  setor_atual: string;
  setor_atual_nome: string;
  status: 'em_aberto' | 'em_andamento' | 'pausado' | 'finalizado_setor' | 'concluida' | 'cancelada';
  observacao: string | null;
  item_codigo: string;
  item_descricao: string;
  item_quantidade_total: string;
  numero_pedido_venda: string;
  numero_op: string | null;
  cliente: string;
  prioridade: string;
  prazo_entrega: string | null;
  item_status: string;
  iniciado_em: string | null;
  concluido_em: string | null;
  criado_em: string;
  atualizado_em: string;
  apontamentos: {
    id: number;
    setor_nome: string;
    quantidade_apontada: string;
    quantidade_aprovada: string;
    quantidade_reprovada: string;
    status: string;
    usuario_nome: string;
    observacao: string | null;
    criado_em: string;
  }[];
}

function erroMsg(e: unknown) {
  const ax = e as { response?: { data?: { erro?: string }; status?: number } };
  return ax?.response?.data?.erro || `Erro ${ax?.response?.status || ''}`.trim() || String(e);
}

function StatusBadgeParcial({ status }: { status: string }) {
  return (
    <span className={`text-xs px-2.5 py-1 rounded-full font-bold ${PARCIAL_STATUS_COR[status] || 'bg-gray-100 text-gray-700'}`}>
      {PARCIAL_STATUS_LABELS[status] || status}
    </span>
  );
}

function ParcialWorkspace({ parcialId }: { parcialId: number }) {
  const isAdmin = getUser()?.is_staff;

  const [parcial, setParcial] = useState<ParcialDetalhe | null>(null);
  const [item, setItem] = useState<ItemPedido | null>(null);
  const [erro, setErro] = useState('');
  const [loading, setLoading] = useState(true);
  const [atuando, setAtuando] = useState('');

  // Split form state
  const [showSplit, setShowSplit] = useState(false);
  const [setorDestino, setSetorDestino] = useState('');
  const [qtdEnvio, setQtdEnvio] = useState('');
  const [showDivQualidade, setShowDivQualidade] = useState(false);
  const [setorRetrabalho, setSetorRetrabalho] = useState('');
  const [motivoDiv, setMotivoDiv] = useState('');

  // Devolver form state
  const [showDevolver, setShowDevolver] = useState(false);
  const [setorDevolver, setSetorDevolver] = useState('');

  // Confirm modal state
  const [confirmModal, setConfirmModal] = useState<{ titulo: string; mensagem: string; acao: () => void; perigo?: boolean } | null>(null);

  const carregar = useCallback(async () => {
    setLoading(true);
    setErro('');
    try {
      const p: ParcialDetalhe = await getParcial(parcialId);
      setParcial(p);
      // Fetch item for roteiro, movimentações and full parcials list
      const it: ItemPedido = await getItem(p.item_pedido_id);
      setItem(it);
    } catch (e: unknown) {
      const ax = e as { response?: { status?: number; data?: { erro?: string } } };
      if (ax?.response?.status === 403) setErro('Acesso negado: esta parcial pertence a outro setor.');
      else if (ax?.response?.status === 404) setErro('Parcial não encontrada.');
      else setErro(ax?.response?.data?.erro || 'Falha ao carregar dados');
    } finally {
      setLoading(false);
    }
  }, [parcialId]);

  useEffect(() => { carregar(); }, [carregar]);

  const carregarRef = useRef<() => void>(() => {});
  carregarRef.current = carregar;

  useEffect(() => {
    const t = setInterval(() => carregarRef.current(), 20 * 60 * 1000);
    return () => clearInterval(t);
  }, []);

  const carregarCallback = useCallback(() => carregarRef.current(), []);
  useRealtime(
    ['producao_itemparcial', 'producao_itempedido', 'producao_movimentacaoitem'],
    carregarCallback,
  );

  async function executarAcao(a: string, body?: Record<string, unknown>) {
    if (atuando) return;
    setAtuando(a);
    try { await parcialAcao(parcialId, a, body); await carregar(); }
    catch (e: unknown) { alert(erroMsg(e)); }
    finally { setAtuando(''); }
  }

  async function aprovarParcialQualidade() {
    const rot = item?.roteiro_efetivo || [];
    const idx = rot.indexOf(parcial?.setor_atual || '');
    const proxSetor = setorDestino || (idx !== -1 && idx < rot.length - 1 ? rot[idx + 1] : null);
    if (!proxSetor) { alert('Selecione o setor destino'); return; }
    setAtuando('aprovar');
    try {
      await parcialAcao(parcialId, 'finalizar');
      await parcialAcao(parcialId, 'mover', { setor_destino: proxSetor, quantidade: Number(parcial!.quantidade) });
      await carregar();
    } catch (e: unknown) { alert(erroMsg(e)); }
    finally { setAtuando(''); }
  }

  async function enviarParaSetor() {
    if (!setorDestino) { alert('Selecione o setor destino'); return; }
    const qtd = Number(qtdEnvio);
    if (!qtd || qtd <= 0) { alert('Informe uma quantidade válida'); return; }
    if (parcial && qtd > Number(parcial.quantidade)) {
      alert(`Quantidade máxima disponível: ${fmtQtd(parcial.quantidade)} ${parcial.unidade}`);
      return;
    }
    setAtuando('mover');
    try {
      await parcialAcao(parcialId, 'mover', { setor_destino: setorDestino, quantidade: qtd });
      setShowSplit(false);
      setSetorDestino('');
      setQtdEnvio('');
      await carregar();
    } catch (e: unknown) {
      alert(erroMsg(e));
    } finally {
      setAtuando('');
    }
  }

  if (loading) {
    return (
      <div className="p-10 text-center text-gray-400">
        <div className="text-2xl mb-2 animate-spin inline-block">⟳</div>
        <p>Carregando parcial...</p>
      </div>
    );
  }

  if (erro || !parcial) {
    return (
      <div className="p-10 text-center">
        <div className="inline-block bg-red-50 border border-red-200 rounded-xl px-8 py-6 max-w-sm">
          <p className="text-red-600 font-semibold text-lg mb-1">⚠ Acesso Negado</p>
          <p className="text-red-500 text-sm">{erro || 'Parcial não encontrada'}</p>
          <Link href="/" className="block mt-4 text-blue-600 text-sm hover:underline">← Voltar ao dashboard</Link>
        </div>
      </div>
    );
  }

  const roteiro = item?.roteiro_efetivo || [];
  // "done" usa o índice do ITEM (setor_atual do item), não da parcial.
  // Só setores que o item inteiro já deixou para trás são marcados como concluídos.
  // A parcial pode estar num setor à frente do item (split), sem isso os setores
  // intermediários apareceriam incorretamente com check.
  const idxItemAtual = item ? roteiro.indexOf(item.setor_atual) : -1;

  const circulos: RoteiroCirculo[] = roteiro.map((setor, i) => ({
    setor,
    done: idxItemAtual > 0 ? i < idxItemAtual : false,
    current: setor === parcial.setor_atual,
  }));

  // Quantities per sector from all parcials of this item
  const qtdAtivaPorSetor: Record<string, number> = {};
  const qtdConcluidaPorSetor: Record<string, number> = {};
  (item?.parciais || []).filter(p => p.status !== 'cancelada').forEach(p => {
    if (p.status === 'concluida') {
      qtdConcluidaPorSetor[p.setor_atual] = (qtdConcluidaPorSetor[p.setor_atual] || 0) + Number(p.quantidade);
    } else {
      qtdAtivaPorSetor[p.setor_atual] = (qtdAtivaPorSetor[p.setor_atual] || 0) + Number(p.quantidade);
    }
  });

  const isAberto    = parcial.status === 'em_aberto';
  const isAndamento = parcial.status === 'em_andamento';
  const isPausado   = parcial.status === 'pausado';
  const isFinalizado = parcial.status === 'finalizado_setor';
  const isConcluida = parcial.status === 'concluida';
  const isCancelada = parcial.status === 'cancelada';
  const isLogistica = parcial.setor_atual === 'logistica';
  const isAtiva     = isAberto || isAndamento || isPausado || isFinalizado;
  const duracao     = fmtDuracao(parcial.iniciado_em, parcial.concluido_em);

  const setoresDisponiveis = SETOR_CHOICES.filter(([cod]) => cod !== parcial.setor_atual);

  return (
    <div className="px-6 py-4">
      {confirmModal && (
        <ConfirmModal
          titulo={confirmModal.titulo}
          mensagem={confirmModal.mensagem}
          perigo={confirmModal.perigo}
          confirmLabel="Confirmar"
          onConfirm={() => { confirmModal.acao(); setConfirmModal(null); }}
          onCancel={() => setConfirmModal(null)}
        />
      )}
      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div style={{ background: '#f8fafc', border: '1.5px solid #e2e8f0', borderRadius: 10, padding: '12px 16px', marginBottom: 16 }}>
        {/* Linha 1: descrição + prioridade + prazo */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 4 }}>
          <span style={{ fontWeight: 800, fontSize: 16, color: '#1a3a5c', flex: 1, minWidth: 0 }}>
            {parcial.item_descricao}
          </span>
          {parcial.prioridade === 'urgente' && (
            <span style={{ background: '#dc2626', color: '#fff', fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 4 }}>URGENTE</span>
          )}
          {parcial.prazo_entrega && (
            <span style={{ fontSize: 12, color: '#64748b', whiteSpace: 'nowrap' }}>📅 {fmtData(parcial.prazo_entrega)}</span>
          )}
        </div>

        {/* Linha 2: PV / OP / Cód */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap', marginBottom: 6 }}>
          <span style={{ fontSize: 13, color: '#475569' }}>
            PV <span style={{ fontWeight: 800, color: '#1a3a5c', fontSize: 15 }}>{parcial.numero_pedido_venda}</span>
          </span>
          {parcial.numero_op && (
            <span style={{ fontSize: 13, color: '#475569' }}>
              OP <span style={{ fontWeight: 800, color: '#1a3a5c', fontSize: 15 }}>{parcial.numero_op}</span>
            </span>
          )}
          <span style={{ fontSize: 13, color: '#475569' }}>
            Cód <span style={{ fontWeight: 800, color: '#475569', fontSize: 15 }}>{parcial.item_codigo}</span>
          </span>
          <span style={{ fontSize: 13, color: '#475569' }}>
            Parcial <span style={{ fontWeight: 800, color: '#475569', fontSize: 15 }}>#{parcial.id}</span>
          </span>
          <span style={{ fontSize: 13, color: '#475569' }}>
            <strong>{fmtQtd(parcial.quantidade)} {parcial.unidade}</strong> neste setor
          </span>
        </div>

        {/* Linha 3: status + link item + cancelar */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <StatusBadgeParcial status={parcial.status} />
          {parcial.parcial_origem_id && (
            <span className="text-xs text-orange-500 bg-orange-50 border border-orange-200 px-2 py-0.5 rounded">
              Split de #{parcial.parcial_origem_id}
            </span>
          )}
          <Link href={`/setor/${parcial.setor_atual}`} style={{ fontSize: 12, color: '#6b7280', textDecoration: 'none', border: '1px solid #d1d5db', borderRadius: 4, padding: '2px 8px', background: '#f9fafb' }}>
            ← Voltar ao setor
          </Link>
          {isAdmin && (
            <Link href={`/pedidos/${parcial.pedido_id}`} style={{ fontSize: 12, color: '#6b7280', textDecoration: 'none', border: '1px solid #d1d5db', borderRadius: 4, padding: '2px 8px' }}>
              ← Pedido {parcial.numero_pedido_venda}
            </Link>
          )}
          <Link href={`/item/${parcial.item_pedido_id}`} style={{ fontSize: 12, color: '#3b82f6', textDecoration: 'none' }}>
            👁 Ver item
          </Link>
          <div style={{ flex: 1 }} />
          {isAdmin && isAtiva && (
            <button onClick={() => setConfirmModal({
              titulo: 'Cancelar Parcial',
              mensagem: 'Esta ação só pode ser desfeita por um administrador. Deseja continuar?',
              perigo: true,
              acao: () => executarAcao('cancelar', { observacao: 'Cancelado manualmente pelo admin' }),
            })} disabled={!!atuando}
              className="border border-red-300 text-red-600 text-xs px-3 py-1.5 rounded hover:bg-red-50 disabled:opacity-60">
              ✕ Cancelar parcial
            </button>
          )}
        </div>
      </div>

      {/* ── Roteiro do item ─────────────────────────────────────────────────── */}
      {circulos.length > 0 && (
        <ProgressoRoteiro
          circulos={circulos}
          isAdmin={!!isAdmin}
          setorAtualNome={parcial.setor_atual_nome}
          statusLabel={PARCIAL_STATUS_LABELS[parcial.status]}
          corStatus={isAndamento ? 'warning' : isPausado ? 'warning' : isConcluida ? 'success' : 'secondary'}
        />
      )}

      {/* ── 3 colunas ───────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">

        {/* COLUNA ESQUERDA */}
        <div className="space-y-4">
          {/* Localização atual */}
          <div className="bg-white rounded-xl border shadow-sm p-4 text-center">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Localização Atual</p>
            <p className="text-2xl font-bold text-[#1a3a5c]">{parcial.setor_atual_nome}</p>
            <div className="mt-2">
              <StatusBadgeParcial status={parcial.status} />
            </div>
            <p className="text-xs text-gray-400 mt-2">👤 {parcial.cliente}</p>
            {duracao && isConcluida && (
              <p className="text-xs text-green-600 mt-1 font-medium">⏱ Duração: {duracao}</p>
            )}
            {parcial.iniciado_em && isAndamento && (
              <p className="text-xs text-orange-500 mt-1">
                Em andamento há {fmtDuracao(parcial.iniciado_em, new Date().toISOString())}
              </p>
            )}
            {isPausado && (
              <p className="text-xs text-orange-400 mt-1 font-medium">⏸ Produção pausada</p>
            )}
          </div>

          {/* Dados da parcial e do item */}
          <div className="bg-white rounded-xl border shadow-sm p-4">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Dados do Item</p>
            <div className="space-y-2 text-sm">
              <div><span className="text-gray-400 text-xs">Código</span><p className="font-semibold">{parcial.item_codigo}</p></div>
              <div><span className="text-gray-400 text-xs">Descrição</span><p className="font-semibold">{parcial.item_descricao}</p></div>
              <div>
                <span className="text-gray-400 text-xs">Quantidade neste setor</span>
                <p className="font-bold text-2xl text-blue-700">{fmtQtd(parcial.quantidade)} <span className="text-base font-medium text-blue-400">{parcial.unidade}</span></p>
                {parcial.item_quantidade_total && (
                  <p className="text-xs text-gray-400">de {fmtQtd(parcial.item_quantidade_total)} {parcial.unidade} totais no pedido</p>
                )}
              </div>
              {isAdmin && (
                <>
                  <div>
                    <span className="text-gray-400 text-xs">Pedido</span>
                    <p>
                      <Link href={`/pedidos/${parcial.pedido_id}`} className="font-semibold text-blue-700 hover:underline">{parcial.numero_pedido_venda}</Link>
                      <span className="text-gray-500 ml-1">· {parcial.cliente}</span>
                    </p>
                  </div>
                  {parcial.prazo_entrega && (
                    <div><span className="text-gray-400 text-xs">Prazo</span><p className="font-semibold">{fmtData(parcial.prazo_entrega)}</p></div>
                  )}
                  {parcial.prioridade && (
                    <div>
                      <span className="text-gray-400 text-xs">Prioridade</span>
                      <span className={`inline-block text-xs px-2 py-0.5 rounded font-medium ml-1 ${
                        parcial.prioridade === 'urgente' ? 'bg-red-100 text-red-700' :
                        parcial.prioridade === 'alta' ? 'bg-orange-100 text-orange-700' :
                        'bg-blue-100 text-blue-700'
                      }`}>
                        {parcial.prioridade.charAt(0).toUpperCase() + parcial.prioridade.slice(1)}
                      </span>
                    </div>
                  )}
                  <div>
                    <span className="text-gray-400 text-xs">Ver item completo</span>
                    <p><Link href={`/item/${parcial.item_pedido_id}`} className="text-blue-600 hover:underline text-xs">→ Abrir item #{parcial.item_pedido_id}</Link></p>
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Onde estão as peças — admin only */}
          {isAdmin && roteiro.length > 0 && (
            <OndeEstaoPecas
              roteiro={roteiro}
              idxAtual={idxItemAtual >= 0 ? idxItemAtual : 0}
              qtdAtivaPorSetor={qtdAtivaPorSetor}
              qtdConcluidaPorSetor={qtdConcluidaPorSetor}
              setorAtual={parcial.setor_atual}
              status={item?.status || ''}
              corStatus="info"
              unidade={parcial.unidade}
              qtdTotal={parcial.item_quantidade_total}
              qtdEntregue={item?.quantidade_entregue || '0'}
              entregue={item?.status === 'entregue'}
            />
          )}
        </div>

        {/* COLUNA CENTRAL — AÇÕES */}
        <div className="space-y-3">
          {/* Status finalizado_setor banner */}
          {isFinalizado && (
            <div className="rounded-xl border p-4 text-center bg-green-50 border-green-200">
              <p className="font-bold text-lg text-green-700">✓ Etapa Finalizada</p>
              <p className="text-xs text-green-600 mt-1">Pronto para enviar ao próximo setor</p>
            </div>
          )}

          {/* Status concluída/cancelada banner */}
          {(isConcluida || isCancelada) && (
            <div className={`rounded-xl border p-4 text-center ${isConcluida ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
              <p className={`font-bold text-lg ${isConcluida ? 'text-green-700' : 'text-red-700'}`}>
                {isConcluida ? '✓ Concluída' : '✕ Cancelada'}
              </p>
              {isConcluida && parcial.concluido_em && (
                <p className="text-xs text-green-600 mt-1">{fmtHora(parcial.concluido_em)}</p>
              )}
              {isConcluida && duracao && (
                <p className="text-xs text-green-600 mt-0.5">Duração: <strong>{duracao}</strong></p>
              )}
            </div>
          )}

          <div className="bg-white rounded-xl border shadow-sm p-4">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Ações</p>
            <div className="space-y-2">

              {/* INICIAR */}
              {isAberto && (
                <button onClick={() => executarAcao('iniciar')} disabled={!!atuando}
                  className="w-full bg-green-600 text-white px-4 py-2.5 rounded text-sm font-semibold text-left hover:bg-green-700 disabled:opacity-60">
                  {atuando === 'iniciar' ? '⏳ Recebendo...' : '▶ Receber'}
                </button>
              )}

              {/* EM ANDAMENTO — mesmos botões em todos os setores */}
              {isAndamento && (
                <>
                  <button onClick={() => setConfirmModal({
                    titulo: 'Finalizar etapa',
                    mensagem: 'Deseja finalizar o processo neste setor? A parcial ficará disponível para envio ao próximo setor.',
                    acao: () => executarAcao('finalizar'),
                  })} disabled={!!atuando}
                    className="w-full bg-green-600 text-white px-4 py-2.5 rounded text-sm font-semibold text-left hover:bg-green-700 disabled:opacity-60">
                    {atuando === 'finalizar' ? '⏳ Finalizando...' : '✓ Finalizar etapa'}
                  </button>
                  <button onClick={() => { setShowSplit(v => !v); setShowDevolver(false); }} disabled={!!atuando}
                    className="w-full bg-[#1a3a5c] text-white px-4 py-2.5 rounded text-sm font-semibold text-left hover:opacity-90 disabled:opacity-60">
                    ↗ Enviar ao próximo setor
                  </button>
                  <button onClick={() => setConfirmModal({
                    titulo: 'Encerrar parcial',
                    mensagem: 'A parcial não irá para nenhum outro setor. Deseja encerrá-la como concluída?',
                    acao: () => executarAcao('concluir'),
                  })} disabled={!!atuando}
                    className="w-full border border-green-500 text-green-700 px-4 py-2.5 rounded text-sm font-semibold text-left hover:bg-green-50 disabled:opacity-60">
                    {atuando === 'concluir' ? '⏳ Encerrando...' : '✓ Encerrar'}
                  </button>
                  <button onClick={() => executarAcao('pausar')} disabled={!!atuando}
                    className="w-full bg-orange-500 text-white px-4 py-2.5 rounded text-sm font-semibold text-left hover:bg-orange-600 disabled:opacity-60">
                    {atuando === 'pausar' ? '⏳ Pausando...' : '⏸ Pausar'}
                  </button>
                  {parcial.setor_atual === 'qualidade' && (
                    <button onClick={() => { setShowDivQualidade(v => !v); setShowSplit(false); }} disabled={!!atuando}
                      className="w-full bg-orange-500 text-white px-4 py-2.5 rounded text-sm font-semibold text-left hover:bg-orange-600 disabled:opacity-60">
                      ⚠ Divergência
                    </button>
                  )}
                </>
              )}

              {/* RETOMAR — quando pausado */}
              {isPausado && (
                <>
                  <button onClick={() => executarAcao('retomar')} disabled={!!atuando}
                    className="w-full bg-green-600 text-white px-4 py-2.5 rounded text-sm font-semibold text-left hover:bg-green-700 disabled:opacity-60">
                    {atuando === 'retomar' ? '⏳ Retomando...' : '▶ Retomar produção'}
                  </button>
                  <button onClick={() => { setShowSplit(v => !v); setShowDevolver(false); }} disabled={!!atuando}
                    className="w-full bg-[#1a3a5c] text-white px-4 py-2.5 rounded text-sm font-semibold text-left hover:opacity-90 disabled:opacity-60">
                    ↗ Enviar ao próximo setor
                  </button>
                  <button onClick={() => setConfirmModal({
                    titulo: 'Encerrar parcial',
                    mensagem: 'A parcial não irá para nenhum outro setor. Deseja encerrá-la como concluída?',
                    acao: () => executarAcao('concluir'),
                  })} disabled={!!atuando}
                    className="w-full border border-green-500 text-green-700 px-4 py-2.5 rounded text-sm font-semibold text-left hover:bg-green-50 disabled:opacity-60">
                    {atuando === 'concluir' ? '⏳ Encerrando...' : '✓ Encerrar'}
                  </button>
                </>
              )}

              {/* FINALIZADO NO SETOR */}
              {isFinalizado && (
                <>
                  {!showDivQualidade && (
                    <button onClick={() => { setShowSplit(v => !v); setShowDevolver(false); }} disabled={!!atuando}
                      className="w-full bg-[#1a3a5c] text-white px-4 py-2.5 rounded text-sm font-semibold text-left hover:opacity-90 disabled:opacity-60">
                      ↗ Enviar ao próximo setor
                    </button>
                  )}
                  {parcial.setor_atual === 'qualidade' && (
                    <button onClick={() => { setShowDivQualidade(v => !v); setShowSplit(false); setShowDevolver(false); }} disabled={!!atuando}
                      className="w-full bg-orange-500 text-white px-4 py-2.5 rounded text-sm font-semibold text-left hover:bg-orange-600 disabled:opacity-60">
                      ⚠ Divergência
                    </button>
                  )}
                  {isLogistica && (
                    <button onClick={() => setConfirmModal({
                      titulo: 'Despachar',
                      mensagem: 'Confirma o despacho desta parcial para o cliente?',
                      acao: () => executarAcao('concluir'),
                    })} disabled={!!atuando}
                      className="w-full text-white px-4 py-2.5 rounded text-sm font-semibold text-left disabled:opacity-60"
                      style={{ background: '#fd7e14' }}>
                      {atuando === 'concluir' ? '⏳ Despachando...' : '🚚 Despachar'}
                    </button>
                  )}
                  <button onClick={() => executarAcao('retomar')} disabled={!!atuando}
                    className="w-full bg-yellow-500 text-white px-4 py-2.5 rounded text-sm font-semibold text-left hover:bg-yellow-600 disabled:opacity-60">
                    {atuando === 'retomar' ? '⏳ Retomando...' : '↩ Retomar etapa'}
                  </button>
                  {!isLogistica && (
                    <button onClick={() => setConfirmModal({
                      titulo: 'Encerrar definitivamente',
                      mensagem: 'A parcial não irá para nenhum outro setor. Deseja encerrá-la como concluída?',
                      acao: () => executarAcao('concluir'),
                    })} disabled={!!atuando}
                      className="w-full border border-green-500 text-green-700 px-4 py-2.5 rounded text-sm font-semibold text-left hover:bg-green-50 disabled:opacity-60">
                      {atuando === 'concluir' ? '⏳ Encerrando...' : '✓ Encerrar definitivamente'}
                    </button>
                  )}
                </>
              )}

              {/* DEVOLVER — quando em andamento, pausado ou finalizado */}
              {(isAndamento || isPausado || isFinalizado) && (
                <button onClick={() => { setShowDevolver(v => !v); setShowSplit(false); }} disabled={!!atuando}
                  className="w-full border border-red-400 text-red-600 px-4 py-2.5 rounded text-sm font-semibold text-left hover:bg-red-50 disabled:opacity-60">
                  ↩ Devolver
                </button>
              )}

              {/* REATIVAR — admin, quando concluída */}
              {isConcluida && isAdmin && (
                <button onClick={() => setConfirmModal({
                  titulo: 'Reativar Parcial',
                  mensagem: 'A parcial será reaberta como Em Andamento. Deseja continuar?',
                  acao: () => executarAcao('retomar'),
                })} disabled={!!atuando}
                  className="w-full border border-orange-400 text-orange-700 bg-orange-50 px-4 py-2.5 rounded text-sm font-semibold text-left hover:bg-orange-100 disabled:opacity-60">
                  {atuando === 'retomar' ? '⏳ Reativando...' : '↩ Reativar parcial'}
                </button>
              )}

              {isCancelada && (
                <p className="text-sm text-gray-400 text-center py-2">Parcial cancelada. Nenhuma ação disponível.</p>
              )}
            </div>

            {/* Painel de quantidade para split */}
            {showSplit && (isAndamento || isFinalizado) && (
              <div className="mt-3 space-y-2 border-t pt-3">
                <p className="text-xs font-semibold text-gray-600">Enviar parcial para outro setor</p>
                <select value={setorDestino} onChange={e => setSetorDestino(e.target.value)}
                  className="w-full border rounded px-2 py-1.5 text-sm">
                  <option value="">Selecione o setor...</option>
                  {setoresDisponiveis.map(([cod, nome]) => (
                    <option key={cod} value={cod}>{nome}</option>
                  ))}
                </select>
                <input
                  type="number"
                  value={qtdEnvio}
                  onChange={e => setQtdEnvio(e.target.value)}
                  min={1}
                  max={Number(parcial.quantidade)}
                  placeholder={`Quantidade (máx: ${fmtQtd(parcial.quantidade)} ${parcial.unidade})`}
                  className="border rounded px-3 py-2 text-sm w-full"
                />
                {qtdEnvio && setorDestino && (
                  <p className="text-xs text-gray-500">
                    Enviar <strong>{qtdEnvio} {parcial.unidade}</strong> → {NOMES[setorDestino] || setorDestino}.
                    {Number(qtdEnvio) < Number(parcial.quantidade) && (
                      <> Restarão <strong>{fmtQtd(Number(parcial.quantidade) - Number(qtdEnvio))} {parcial.unidade}</strong> aqui.</>
                    )}
                  </p>
                )}
                <button
                  onClick={enviarParaSetor}
                  disabled={!!atuando || !setorDestino || !qtdEnvio}
                  className="bg-blue-600 text-white px-4 py-2 rounded text-sm font-semibold w-full disabled:opacity-50">
                  {atuando === 'mover' ? 'Enviando...' : 'Confirmar envio'}
                </button>
                <button onClick={() => setShowSplit(false)} className="w-full text-center text-xs text-gray-400 hover:text-gray-600 py-1">
                  Cancelar
                </button>
              </div>
            )}

            {/* Painel divergência — qualidade */}
            {showDivQualidade && parcial.setor_atual === 'qualidade' && (
              <div className="mt-3 space-y-2 border-t pt-3">
                <p className="text-xs font-semibold text-orange-700">⚠ Pedido com divergência</p>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">
                    Motivo da divergência: <span className="text-red-500">*</span>
                  </label>
                  <textarea value={motivoDiv} onChange={e => setMotivoDiv(e.target.value)}
                    placeholder="Descreva o problema encontrado..."
                    rows={3}
                    className="border rounded px-3 py-2 text-sm w-full resize-none focus:outline-none focus:ring-1 focus:ring-orange-400" />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <button onClick={async () => {
                    if (!motivoDiv.trim()) { alert('Informe o motivo da divergência.'); return; }
                    if (parcial.status === 'finalizado_setor') await executarAcao('retomar');
                    await executarAcao('pausar', { observacao: motivoDiv });
                    setMotivoDiv('');
                    setShowDivQualidade(false);
                  }} disabled={!!atuando || !motivoDiv.trim()}
                    className="bg-yellow-100 text-yellow-800 border border-yellow-300 px-3 py-2 rounded text-sm font-semibold text-center leading-tight hover:bg-yellow-200 disabled:opacity-50">
                    ⏸ Segurar<br/>para revisão
                  </button>
                  <button onClick={() => setSetorRetrabalho(v => v ? '' : '__open__')}
                    disabled={!!atuando || !motivoDiv.trim()}
                    className="bg-orange-50 text-orange-700 border border-orange-200 px-3 py-2 rounded text-sm font-semibold text-center leading-tight hover:bg-orange-100 disabled:opacity-50">
                    ↩ Devolver para<br/>retrabalho
                  </button>
                </div>
                {(setorRetrabalho !== '' && setorRetrabalho !== undefined) && (
                  <div className="space-y-2">
                    <select value={setorRetrabalho === '__open__' ? '' : setorRetrabalho} onChange={e => setSetorRetrabalho(e.target.value)}
                      className="border rounded px-3 py-2 text-sm w-full">
                      <option value="">Selecione o setor...</option>
                      {SETOR_CHOICES.filter(([cod]) => cod !== parcial.setor_atual).map(([cod, nome]) => (
                        <option key={cod} value={cod}>{nome}</option>
                      ))}
                    </select>
                    <button onClick={() => {
                      if (!motivoDiv.trim()) { alert('Informe o motivo da divergência.'); return; }
                      const dest = setorRetrabalho === '__open__' ? '' : setorRetrabalho;
                      if (!dest) return;
                      executarAcao('devolver', { setor_destino: dest, observacao: motivoDiv });
                      setMotivoDiv('');
                      setShowDivQualidade(false);
                      setSetorRetrabalho('');
                    }} disabled={!!atuando || !setorRetrabalho || setorRetrabalho === '__open__' || !motivoDiv.trim()}
                      className="bg-orange-600 text-white px-4 py-2 rounded text-sm font-semibold w-full disabled:opacity-50">
                      Confirmar devolução
                    </button>
                  </div>
                )}
                <button onClick={() => { setShowDivQualidade(false); setMotivoDiv(''); setSetorRetrabalho(''); }}
                  className="w-full text-center text-xs text-gray-400 hover:text-gray-600 py-1">
                  Cancelar
                </button>
              </div>
            )}

            {/* Painel de devolução */}
            {showDevolver && (isAndamento || isPausado || isFinalizado) && (
              <div className="mt-3 space-y-2 border-t pt-3">
                <p className="text-xs font-semibold text-gray-600">Devolver parcial para:</p>
                <select value={setorDevolver} onChange={e => setSetorDevolver(e.target.value)}
                  className="w-full border rounded px-2 py-1.5 text-sm">
                  <option value="">Selecione o setor...</option>
                  {setoresDisponiveis.map(([cod, nome]) => (
                    <option key={cod} value={cod}>{nome}</option>
                  ))}
                </select>
                <button
                  onClick={() => {
                    if (!setorDevolver) { alert('Selecione o setor de destino'); return; }
                    setConfirmModal({
                      titulo: 'Devolver Parcial',
                      mensagem: `Deseja devolver esta parcial para ${NOMES[setorDevolver] || setorDevolver}?`,
                      perigo: true,
                      acao: () => {
                        executarAcao('devolver', { setor_destino: setorDevolver });
                        setShowDevolver(false);
                        setSetorDevolver('');
                      },
                    });
                  }}
                  disabled={!!atuando || !setorDevolver}
                  className="bg-red-600 text-white px-4 py-2 rounded text-sm font-semibold w-full disabled:opacity-50">
                  {atuando === 'devolver' ? 'Devolvendo...' : 'Confirmar devolução'}
                </button>
                <button onClick={() => setShowDevolver(false)} className="w-full text-center text-xs text-gray-400 hover:text-gray-600 py-1">
                  Cancelar
                </button>
              </div>
            )}
          </div>

          {/* Apontamentos */}
          {parcial.apontamentos.length > 0 && (
            <div className="bg-white rounded-xl border shadow-sm p-4">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
                Apontamentos ({parcial.apontamentos.length})
              </p>
              <div className="space-y-2">
                {parcial.apontamentos.map(ap => (
                  <div key={ap.id} className="border border-gray-100 rounded-lg p-2.5 bg-gray-50 text-xs">
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-semibold text-gray-700">{ap.usuario_nome}</span>
                      <span className="text-gray-400">{fmtHora(ap.criado_em)}</span>
                    </div>
                    <div className="flex flex-wrap gap-2 text-gray-600">
                      <span>Apontado: <strong>{ap.quantidade_apontada}</strong></span>
                      <span className="text-green-700">Aprovado: <strong>{ap.quantidade_aprovada}</strong></span>
                      <span className="text-red-600">Reprovado: <strong>{ap.quantidade_reprovada}</strong></span>
                    </div>
                    {ap.observacao && <p className="mt-1 text-gray-400 italic">{ap.observacao}</p>}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* COLUNA DIREITA — LINHA DO TEMPO */}
        <LinhaDoTempo movimentacoes={item?.movimentacoes || []} />
      </div>

      {/* ── Rastreabilidade de todas as parciais do item ─────────────────────── */}
      <RastreabilidadeParciais
        parciais={item?.parciais || []}
        rastreio={item?.rastreio}
        unidade={parcial.unidade}
        isAdmin={!!isAdmin}
        onReativar={(pid) => {
          setConfirmModal({
            titulo: 'Reativar Parcial',
            mensagem: `Deseja reabrir a parcial #${pid} como Em Andamento?`,
            acao: async () => {
              setAtuando('retomar_' + pid);
              try { await parcialAcao(pid, 'retomar'); await carregar(); }
              catch (e) { alert(erroMsg(e)); }
              finally { setAtuando(''); }
            },
          });
        }}
        loading={!!atuando}
      />
    </div>
  );
}

export default function ParcialPage() {
  const params = useParams();
  const parcialId = Number(params.id);

  return (
    <AuthGuard>
      <ParcialWorkspace parcialId={parcialId} />
    </AuthGuard>
  );
}
