'use client';
import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import AuthGuard from '@/components/AuthGuard';
import { useRealtime } from '@/hooks/useRealtime';
import { getToken, podePlanejar, podeVerCliente } from '@/lib/auth';

const C = { azul: '#1a3a5c', azul2: '#1d4ed8', verde: '#16a34a', laranja: '#d97706', vermelho: '#dc2626', roxo: '#7c3aed', cinza: '#64748b' };

interface Peca {
  item_id: number;
  codigo: string;
  descricao: string;
  quantidade: number;
  unidade: string;
  setor_atual: string;
  setor_atual_nome: string;
  status: string;
  situacao: 'na_usinagem' | 'chegando';
  status_prod: 'produzindo' | 'recebido' | 'nao_recebido' | 'pausado' | 'finalizado' | null;
  maquina_em_producao: string | null;
  maquina_planejada: string | null;
  previsao: string | null;
}

// Rótulo/cor da situação de produção na usinagem.
const STATUS_PROD: Record<string, { txt: string; bg: string; cor: string; icon: string }> = {
  produzindo:   { txt: 'Produzindo',    bg: '#dcfce7', cor: '#166534', icon: 'bi-gear-fill' },
  recebido:     { txt: 'Na fila',       bg: '#dbeafe', cor: '#1d4ed8', icon: 'bi-inbox-fill' },
  nao_recebido: { txt: 'Não recebido',  bg: '#fef3c7', cor: '#92400e', icon: 'bi-hourglass-split' },
  pausado:      { txt: 'Pausado',       bg: '#fde68a', cor: '#854d0e', icon: 'bi-pause-circle-fill' },
  finalizado:   { txt: 'Finalizado',    bg: '#e2e8f0', cor: '#334155', icon: 'bi-check2-all' },
};
interface PedidoPlan {
  pedido_id: number;
  numero_pedido_venda: string;
  cliente: string;
  prioridade: string;
  prazo: string | null;
  previsao: string | null;
  tem_op: boolean;
  pecas: Peca[];
}
interface MaquinaAtiva {
  pedido_id: number; tem_op?: boolean;
  item_codigo: string; item_descricao: string; quantidade: number; unidade: string;
  numero_pedido_venda: string; cliente: string; prioridade: string;
  operador: string | null; desde: string | null;
}
interface PainelMaquina { maquina: string; pecas: MaquinaAtiva[] }
interface GrupoMaq { categoria: string; maquinas: string[] }
interface Dados {
  pedidos: PedidoPlan[];
  ordem: number[];
  painel: PainelMaquina[];
  sem_maquina: MaquinaAtiva[];
  maquinas: GrupoMaq[];
}

const PRIO_COR: Record<string, string> = {
  urgente: C.vermelho, alta: C.laranja, normal: C.azul2, baixa: C.cinza,
};

function tempoDesde(iso: string | null): string {
  if (!iso) return '';
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 0) return '';
  const min = Math.floor(ms / 60000);
  if (min < 60) return `${min}min`;
  const h = Math.floor(min / 60);
  return `${h}h ${String(min % 60).padStart(2, '0')}min`;
}

function diasPrevisao(iso: string | null): { txt: string; cor: string; rel: string } | null {
  if (!iso) return null;
  const dias = Math.ceil((new Date(iso + 'T12:00:00').getTime() - Date.now()) / 86400000);
  // Mostra a DATA da conclusão (DD/MM) + a folga, sempre em AZUL.
  const data = `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
  const rel = dias < 0 ? `${Math.abs(dias)}d atraso` : dias === 0 ? 'hoje' : `faltam ${dias}d`;
  return { cor: C.azul2, txt: `Prazo: ${data} · ${rel}`, rel };
}

// Mensagens prontas pro aviso de produção — clicar adiciona à observação.
const MENSAGENS_PRONTAS = [
  'Urgente — prioridade máxima',
  'Prioridade do cliente',
  'Começar por esta peça',
  'Atenção à medida / tolerância',
  'Conferir o desenho antes',
  'Material já disponível',
  'Cliente aguardando',
];

export default function PlanejamentoPage() {
  const router = useRouter();
  const [dados, setDados] = useState<Dados | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState('');
  const [dragPedido, setDragPedido] = useState<number | null>(null);
  const [salvandoMaq, setSalvandoMaq] = useState<number | null>(null);
  const [salvoMaq, setSalvoMaq] = useState<number | null>(null); // item que acabou de salvar (mostra ✓)
  // Pedidos com o card ABERTO (mostrando as peças). Começam fechados: clicar
  // no cabeçalho abre e mostra "quais são".
  const [abertos, setAbertos] = useState<Set<number>>(new Set());
  // Pedidos que já têm um aviso PENDENTE na caixa da Usinagem (pra mostrar
  // "Avisado ✓" no botão em vez de deixar avisar de novo à toa).
  const [avisados, setAvisados] = useState<Set<number>>(new Set());
  const [avisando, setAvisando] = useState<number | null>(null);
  // Encaminhados: comando do Reginaldo (pedido_id -> {observação, fixo}). Persistente.
  const [encaminhados, setEncaminhados] = useState<Map<number, { observacao: string; fixo: boolean }>>(new Map());
  const [processando, setProcessando] = useState<number | null>(null);
  // Modal de ação (avisar OU encaminhar) — observação + (encaminhar) fixar no topo.
  const [modalAcao, setModalAcao] = useState<{ tipo: 'avisar' | 'encaminhar'; pedidoId: number; numero: string } | null>(null);
  const [modalObs, setModalObs] = useState('');
  const [modalFixo, setModalFixo] = useState(true);
  // Aba ativa: a Fila ou o Painel de Máquinas (abre ao clicar lá em cima).
  const [aba, setAba] = useState<'fila' | 'maquinas'>('fila');
  // Tile do resumo aberto (mostra a lista por trás do número). null = nenhum.
  const [detalheResumo, setDetalheResumo] = useState<'pedidos' | 'pecas' | 'qtd' | 'uso' | 'livres' | null>(null);
  // Máquina clicada no painel — abre modal com os pedidos dela. null = nenhum.
  const [maquinaModal, setMaquinaModal] = useState<PainelMaquina | null>(null);
  // Busca do Painel de Máquinas — filtra por máquina, pedido, código ou operador.
  const [buscaPainel, setBuscaPainel] = useState('');
  // Busca da Fila — filtra por nº do pedido, cliente, código ou descrição.
  const [buscaFila, setBuscaFila] = useState('');
  const podeVerCli = podeVerCliente();

  const carregar = useCallback(async (silencioso = false) => {
    if (!silencioso) setCarregando(true);
    try {
      const [rP, rA, rE] = await Promise.all([
        fetch('/api/planejamento', { headers: { Authorization: `Bearer ${getToken() || ''}` } }),
        fetch('/api/avisos?setor=usinagem', { headers: { Authorization: `Bearer ${getToken() || ''}` } }),
        fetch('/api/encaminhamentos?setor=usinagem', { headers: { Authorization: `Bearer ${getToken() || ''}` } }),
      ]);
      if (!rP.ok) { setErro('Não foi possível carregar o planejamento.'); return; }
      const d = await rP.json();
      setDados(d);
      setErro('');
      if (rA.ok) {
        const da = await rA.json();
        setAvisados(new Set((da.avisos || []).map((a: { pedido_id: number }) => a.pedido_id)));
      }
      if (rE.ok) {
        const de = await rE.json();
        setEncaminhados(new Map((de.encaminhados || []).map((e: { pedido_id: number; observacao: string | null; fixo?: boolean }) => [e.pedido_id, { observacao: e.observacao || '', fixo: e.fixo !== false }])));
      }
    } catch {
      setErro('Falha de conexão ao carregar o planejamento.');
    } finally {
      setCarregando(false);
    }
  }, []);

  function toggleAberto(pedidoId: number) {
    setAbertos(prev => {
      const next = new Set(prev);
      if (next.has(pedidoId)) next.delete(pedidoId); else next.add(pedidoId);
      return next;
    });
  }

  // Avisa a produção (Usinagem) sobre um pedido — cria o aviso na caixa deles,
  // com uma observação opcional escrita no modal.
  async function avisarProducao(pedidoId: number, mensagem?: string) {
    setAvisando(pedidoId);
    try {
      const r = await fetch('/api/avisos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken() || ''}` },
        body: JSON.stringify({ pedido_id: pedidoId, setor: 'usinagem', ...(mensagem?.trim() ? { mensagem: mensagem.trim() } : {}) }),
      });
      if (r.ok) setAvisados(prev => new Set(prev).add(pedidoId));
    } catch { /* silencioso */ }
    finally { setAvisando(null); setModalAcao(null); setModalObs(''); }
  }

  // Encaminha (ou edita) — comando pra Usinagem. Persistente até desfazer.
  // `fixo` = fica destacado/fixo no topo da Usinagem.
  async function encaminhar(pedidoId: number, observacao?: string, fixo = true) {
    setProcessando(pedidoId);
    try {
      const r = await fetch('/api/encaminhamentos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken() || ''}` },
        body: JSON.stringify({ pedido_id: pedidoId, setor: 'usinagem', observacao: observacao || '', fixo }),
      });
      if (r.ok) setEncaminhados(prev => new Map(prev).set(pedidoId, { observacao: observacao || '', fixo }));
    } catch { /* silencioso */ }
    finally { setProcessando(null); setModalAcao(null); setModalObs(''); }
  }

  // Desfaz o encaminhamento (caso de engano) — só o Reginaldo.
  async function desfazerEncaminhamento(pedidoId: number) {
    setProcessando(pedidoId);
    setEncaminhados(prev => { const n = new Map(prev); n.delete(pedidoId); return n; }); // otimista
    try {
      await fetch(`/api/encaminhamentos/${pedidoId}`, { method: 'DELETE', headers: { Authorization: `Bearer ${getToken() || ''}` } });
    } catch { carregar(true); }
    finally { setProcessando(null); }
  }

  // Abre o modal de ação (avisar/encaminhar). Pré-preenche a observação quando
  // for EDITAR um encaminhamento existente.
  function abrirModal(tipo: 'avisar' | 'encaminhar', pedidoId: number, numero: string) {
    const enc = encaminhados.get(pedidoId);
    setModalObs(tipo === 'encaminhar' ? (enc?.observacao || '') : '');
    setModalFixo(tipo === 'encaminhar' ? (enc ? enc.fixo : true) : true);
    setModalAcao({ tipo, pedidoId, numero });
  }

  useEffect(() => { carregar(); }, [carregar]);
  // Tempo REAL: reflete na hora as ações do operador (receber/iniciar/finalizar/
  // trocar máquina) e o que outro admin mudar. WebSocket via Supabase + fallback
  // de 15s embutido no hook. Ver useRealtime.
  useRealtime(['producao_itemparcial', 'producao_itempedido'], () => carregar(true));

  // Salva a nova ordem dos pedidos (reaproveita o endpoint do "furar a fila").
  async function salvarOrdem(idsOrdenados: number[]) {
    // Otimista: reordena localmente já.
    setDados(d => {
      if (!d) return d;
      const pos = new Map(idsOrdenados.map((id, i) => [id, i]));
      const pedidos = [...d.pedidos].sort((a, b) => (pos.get(a.pedido_id) ?? 1e9) - (pos.get(b.pedido_id) ?? 1e9));
      return { ...d, pedidos, ordem: idsOrdenados };
    });
    try {
      await fetch('/api/setor/usinagem/ordem', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken() || ''}` },
        body: JSON.stringify({ ordem: idsOrdenados }),
      });
    } catch { /* mantém otimista; próximo refresh reconcilia */ }
  }

  function soltarSobre(alvoPedidoId: number) {
    if (dragPedido == null || !dados) { setDragPedido(null); return; }
    if (dragPedido === alvoPedidoId) { setDragPedido(null); return; }
    const ids = dados.pedidos.map(p => p.pedido_id).filter(id => id !== dragPedido);
    const alvo = ids.indexOf(alvoPedidoId);
    ids.splice(alvo < 0 ? ids.length : alvo, 0, dragPedido);
    salvarOrdem(ids);
    setDragPedido(null);
  }

  // Grava a máquina planejada de uma peça.
  async function definirMaquina(itemId: number, maquina: string) {
    setSalvandoMaq(itemId);
    // Otimista.
    setDados(d => {
      if (!d) return d;
      const pedidos = d.pedidos.map(p => ({
        ...p,
        pecas: p.pecas.map(pc => pc.item_id === itemId ? { ...pc, maquina_planejada: maquina || null } : pc),
      }));
      return { ...d, pedidos };
    });
    try {
      const r = await fetch('/api/planejamento', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken() || ''}` },
        body: JSON.stringify({ item_pedido_id: itemId, maquina }),
      });
      if (r.ok) {
        setSalvoMaq(itemId);
        setTimeout(() => setSalvoMaq(s => (s === itemId ? null : s)), 1800);
      }
    } catch { /* próximo refresh reconcilia */ }
    finally { setSalvandoMaq(null); }
  }

  if (!podePlanejar()) return (
    <AuthGuard><div style={{ padding: 40, textAlign: 'center', color: C.cinza }}>
      <i className="bi bi-lock-fill" style={{ fontSize: 32, color: C.vermelho }} />
      <p style={{ marginTop: 12, fontWeight: 700 }}>Acesso restrito.</p>
    </div></AuthGuard>
  );

  const grupos = dados?.maquinas || [];
  const totalPecas = (dados?.pedidos || []).reduce((s, p) => s + p.pecas.length, 0);
  // Separa a fila: pedidos que JÁ têm peça na Usinagem × os que vão CHEGAR.
  const pedidosNa = (dados?.pedidos || []).filter(p => p.pecas.some(pc => pc.situacao === 'na_usinagem'));
  const pedidosCheg = (dados?.pedidos || []).filter(p => !p.pecas.some(pc => pc.situacao === 'na_usinagem'));
  // Quantos dos "na usinagem" já estão sendo PRODUZIDOS (peça produzindo).
  const produzindoNa = pedidosNa.filter(p => p.pecas.some(pc => pc.status_prod === 'produzindo')).length;

  // Card de um pedido na fila. `idx` é a posição DENTRO do grupo (numeração).
  const renderPedido = (ped: PedidoPlan, idx: number) => {
    const prio = (ped.prioridade || '').toLowerCase();
    const prev = diasPrevisao(ped.previsao);
    const arrastando = dragPedido === ped.pedido_id;
    const aberto = abertos.has(ped.pedido_id);
    const jaAvisado = avisados.has(ped.pedido_id);
    const jaEncaminhado = encaminhados.has(ped.pedido_id);
    // Resumo de status das peças JÁ na usinagem (produzindo/na fila/não recebido).
    const contStatus: Record<string, number> = {};
    for (const pc of ped.pecas) {
      if (pc.situacao === 'na_usinagem' && pc.status_prod) contStatus[pc.status_prod] = (contStatus[pc.status_prod] || 0) + 1;
    }
    return (
      <div
        key={ped.pedido_id}
        onDragOver={dragPedido != null ? e => e.preventDefault() : undefined}
        onDrop={dragPedido != null ? e => { e.preventDefault(); soltarSobre(ped.pedido_id); } : undefined}
        style={{ border: `2px solid ${arrastando ? C.azul2 : '#e2e8f0'}`, borderRadius: 12, overflow: 'hidden', background: '#fff', opacity: arrastando ? 0.5 : 1, transition: 'opacity .12s' }}
      >
        {/* Cabeçalho do pedido — clicável pra abrir/fechar as peças */}
        <div
          onClick={() => toggleAberto(ped.pedido_id)}
          style={{ background: C.azul, color: '#fff', padding: '9px 14px', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', cursor: 'pointer', userSelect: 'none' }}
        >
          <span
            draggable
            onClick={e => e.stopPropagation()}
            onDragStart={e => { e.stopPropagation(); setDragPedido(ped.pedido_id); e.dataTransfer.effectAllowed = 'move'; }}
            onDragEnd={() => setDragPedido(null)}
            title="Arraste para reordenar a fila"
            style={{ cursor: 'grab', color: 'rgba(255,255,255,.6)', fontSize: 16, lineHeight: 1 }}
          >
            <i className="bi bi-grip-vertical" />
          </span>
          <span title="Ordem na fila" style={{ minWidth: 24, height: 24, padding: '0 6px', borderRadius: 12, background: '#fff', color: C.azul, fontWeight: 800, fontSize: 13, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
            {idx + 1}
          </span>
          <i className={`bi ${aberto ? 'bi-folder2-open' : 'bi-folder2'}`} />
          <b style={{ fontSize: 14 }}>{ped.numero_pedido_venda}</b>
          {podeVerCli && ped.cliente && (
            <span style={{ fontSize: 12.5, opacity: 0.9 }}>· {ped.cliente}</span>
          )}
          <span style={{ fontSize: 11, opacity: 0.75 }}>
            {ped.pecas.length} peça{ped.pecas.length !== 1 ? 's' : ''}
          </span>
          {/* Situação das peças na usinagem (produzindo / na fila / não recebido) */}
          {(['produzindo', 'recebido', 'nao_recebido', 'pausado', 'finalizado'] as const).map(k => contStatus[k] ? (
            <span key={k} title={STATUS_PROD[k].txt} style={{ fontSize: 10, fontWeight: 800, color: STATUS_PROD[k].cor, background: STATUS_PROD[k].bg, borderRadius: 8, padding: '1px 7px', whiteSpace: 'nowrap' }}>
              <i className={`bi ${STATUS_PROD[k].icon}`} style={{ marginRight: 3 }} />{contStatus[k]} {STATUS_PROD[k].txt.toLowerCase()}
            </span>
          ) : null)}
          {prio && (
            <span style={{ fontSize: 10.5, fontWeight: 800, textTransform: 'uppercase', letterSpacing: .4, background: PRIO_COR[prio] || C.cinza, borderRadius: 10, padding: '2px 8px' }}>
              {prio}
            </span>
          )}
          {/* Prazo AUTOMÁTICO = lançamento + 7 dias corridos (só leitura) */}
          {prev && (
            <span title="Prazo automático: lançamento + 7 dias" style={{ fontSize: 11.5, fontWeight: 700, color: '#fff', background: prev.cor, borderRadius: 10, padding: '2px 9px', whiteSpace: 'nowrap' }}>
              <i className="bi bi-calendar-event" style={{ marginRight: 4 }} />{prev.txt}
            </span>
          )}
          {/* Ações à direita: encaminhar (fixo) + avisar (mensagem) + abrir */}
          <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
            {jaEncaminhado ? (
              <>
                <span title={encaminhados.get(ped.pedido_id)?.fixo ? 'Encaminhado e FIXO no topo da Usinagem' : 'Encaminhado (sem fixar no topo)'} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, fontWeight: 800, borderRadius: 8, padding: '5px 10px', background: '#16a34a', color: '#fff', whiteSpace: 'nowrap' }}>
                  <i className={`bi ${encaminhados.get(ped.pedido_id)?.fixo ? 'bi-pin-angle-fill' : 'bi-check2-circle'}`} />Encaminhado{encaminhados.get(ped.pedido_id)?.fixo ? ' · fixo' : ''}
                </span>
                <button
                  onClick={e => { e.stopPropagation(); abrirModal('encaminhar', ped.pedido_id, ped.numero_pedido_venda); }}
                  disabled={processando === ped.pedido_id}
                  title="Editar a observação do encaminhamento"
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12, fontWeight: 700, border: '1px solid rgba(255,255,255,.4)', borderRadius: 8, padding: '5px 9px', cursor: 'pointer', background: 'transparent', color: '#fff', whiteSpace: 'nowrap' }}
                >
                  <i className="bi bi-pencil" />Editar
                </button>
                <button
                  onClick={e => { e.stopPropagation(); desfazerEncaminhamento(ped.pedido_id); }}
                  disabled={processando === ped.pedido_id}
                  title="Desfazer o encaminhamento (caso de engano)"
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12, fontWeight: 700, border: '1px solid rgba(255,255,255,.4)', borderRadius: 8, padding: '5px 9px', cursor: 'pointer', background: 'transparent', color: '#fecaca', whiteSpace: 'nowrap' }}
                >
                  <i className="bi bi-arrow-counterclockwise" />Desfazer
                </button>
              </>
            ) : (
              <button
                onClick={e => { e.stopPropagation(); abrirModal('encaminhar', ped.pedido_id, ped.numero_pedido_venda); }}
                disabled={processando === ped.pedido_id}
                title="Encaminhar este pedido pra Usinagem — fica FIXO até você desfazer"
                style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, fontWeight: 700, border: 'none', borderRadius: 8, padding: '5px 11px', cursor: 'pointer', background: '#16a34a', color: '#fff', whiteSpace: 'nowrap', opacity: processando === ped.pedido_id ? .6 : 1 }}
              >
                <i className="bi bi-send-check-fill" />{processando === ped.pedido_id ? 'Encaminhando…' : 'Encaminhar produção'}
              </button>
            )}
            <button
              onClick={e => { e.stopPropagation(); abrirModal('avisar', ped.pedido_id, ped.numero_pedido_venda); }}
              disabled={avisando === ped.pedido_id}
              title="Avisar a Usinagem (mensagem que some quando o operador vê)"
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, fontWeight: 700,
                border: 'none', borderRadius: 8, padding: '5px 11px', cursor: 'pointer',
                background: jaAvisado ? 'rgba(255,255,255,.18)' : '#f59e0b',
                color: '#fff', whiteSpace: 'nowrap', opacity: avisando === ped.pedido_id ? .6 : 1,
              }}
            >
              <i className={`bi ${jaAvisado ? 'bi-check2-circle' : 'bi-megaphone-fill'}`} />
              {jaAvisado ? 'Avisado' : (avisando === ped.pedido_id ? 'Avisando…' : 'Avisar')}
            </button>
            {ped.tem_op && (
              <a
                href={`/api/pedidos/${ped.pedido_id}/ordem-producao?token=${encodeURIComponent(getToken() || '')}`}
                target="_blank"
                rel="noopener noreferrer"
                onClick={e => e.stopPropagation()}
                title="Abrir a Ordem de Produção (OP)"
                style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12, fontWeight: 700, border: '1px solid rgba(255,255,255,.4)', borderRadius: 8, padding: '4px 9px', color: '#fff', textDecoration: 'none', whiteSpace: 'nowrap' }}
              >
                <i className="bi bi-file-earmark-text" />OP
              </a>
            )}
            <a
              href={`/pedidos/${ped.pedido_id}`}
              onClick={e => { e.preventDefault(); e.stopPropagation(); router.push(`/pedidos/${ped.pedido_id}`); }}
              title="Abrir o pedido completo"
              style={{ color: '#fff', opacity: 0.85, fontSize: 15, lineHeight: 1, textDecoration: 'none' }}
            >
              <i className="bi bi-box-arrow-up-right" />
            </a>
            <i className={`bi ${aberto ? 'bi-chevron-up' : 'bi-chevron-down'}`} style={{ fontSize: 12, opacity: 0.7 }} />
          </span>
        </div>

        {/* Peças do pedido — só quando o card está aberto */}
        {aberto && (
        <div style={{ padding: '6px 8px', display: 'flex', flexDirection: 'column', gap: 4 }}>
          {ped.pecas.map(pc => {
            const naUsinagem = pc.situacao === 'na_usinagem';
            const sp = naUsinagem && pc.status_prod ? STATUS_PROD[pc.status_prod] : null;
            return (
              <div key={pc.item_id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 8px', borderRadius: 8, background: '#f8fafc', flexWrap: 'wrap' }}>
                {sp ? (
                  <span title="Situação na Usinagem" style={{ fontSize: 9.5, fontWeight: 800, textTransform: 'uppercase', letterSpacing: .3, color: sp.cor, background: sp.bg, borderRadius: 6, padding: '2px 7px', whiteSpace: 'nowrap' }}>
                    <i className={`bi ${sp.icon}`} style={{ marginRight: 3 }} />{sp.txt}
                  </span>
                ) : (
                  <span title={naUsinagem ? 'Peça já está na Usinagem' : `Vindo do setor: ${pc.setor_atual_nome}`} style={{ fontSize: 9.5, fontWeight: 800, textTransform: 'uppercase', letterSpacing: .3, color: naUsinagem ? C.verde : C.laranja, background: naUsinagem ? '#dcfce7' : '#fef3c7', borderRadius: 6, padding: '2px 7px', whiteSpace: 'nowrap' }}>
                    {naUsinagem ? 'Na usinagem' : `Chegando de ${pc.setor_atual_nome}`}
                  </span>
                )}
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: C.azul }}>{pc.codigo}</div>
                  <div style={{ fontSize: 11.5, color: '#64748b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{pc.descricao}</div>
                </div>
                <span style={{ fontSize: 12, fontWeight: 700, color: '#475569', whiteSpace: 'nowrap' }}>
                  {Number(pc.quantidade).toLocaleString('pt-BR')} {pc.unidade}
                </span>
                {pc.maquina_em_producao ? (
                  // Já rodando: mostra a máquina REAL (não editável — o operador iniciou).
                  <span title="Já está rodando nesta máquina" style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, fontWeight: 700, color: '#166534', background: '#dcfce7', border: '1px solid #bbf7d0', borderRadius: 7, padding: '6px 10px', whiteSpace: 'nowrap', maxWidth: 220 }}>
                    <i className="bi bi-gear-fill" />{pc.maquina_em_producao}
                  </span>
                ) : (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                    <select
                      className={`pl-sel${pc.maquina_planejada ? ' on' : ''}`}
                      value={pc.maquina_planejada || ''}
                      disabled={salvandoMaq === pc.item_id}
                      onChange={e => definirMaquina(pc.item_id, e.target.value)}
                      title="Máquina planejada para esta peça — salva na hora"
                    >
                      <option value="">— sem máquina —</option>
                      {grupos.map(g => (
                        <optgroup key={g.categoria} label={g.categoria}>
                          {g.maquinas.map(m => <option key={m} value={m}>{m}</option>)}
                        </optgroup>
                      ))}
                    </select>
                    {salvandoMaq === pc.item_id
                      ? <i className="bi bi-arrow-repeat" style={{ color: '#94a3b8', fontSize: 14 }} title="Salvando…" />
                      : salvoMaq === pc.item_id
                        ? <i className="bi bi-check-circle-fill" style={{ color: C.verde, fontSize: 14 }} title="Salvo!" />
                        : null}
                  </span>
                )}
              </div>
            );
          })}
        </div>
        )}
      </div>
    );
  };

  const grupoVazio = (texto: string) => (
    <div style={{ padding: 20, textAlign: 'center', color: C.cinza, fontSize: 12.5, background: '#f8fafc', borderRadius: 10, border: '1px dashed #e2e8f0' }}>
      {texto}
    </div>
  );

  // ── Painel de máquinas: agrupado por CATEGORIA (Tornos Manuais/CNC/Verticais) ──
  const painelMap = new Map((dados?.painel || []).map(p => [p.maquina, p] as const));
  const nomesEmGrupos = new Set(grupos.flatMap(g => g.maquinas));
  const painelOutras = (dados?.painel || []).filter(p => !nomesEmGrupos.has(p.maquina));

  // Resumo geral do que está em produção AGORA na Usinagem.
  const pecasAtivas = [...(dados?.painel || []).flatMap(m => m.pecas), ...(dados?.sem_maquina || [])];
  const totalMaquinas = (dados?.painel || []).length;
  const maquinasEmUso = (dados?.painel || []).filter(m => m.pecas.length > 0).length;
  const pedidosProduzindo = new Set(pecasAtivas.map(p => p.numero_pedido_venda)).size;
  const pecasProduzindo = pecasAtivas.length;
  const totalUnidades = pecasAtivas.reduce((s, p) => s + (Number(p.quantidade) || 0), 0);
  // Lista peça a peça COM a máquina (pro detalhe dos tiles do resumo).
  const producaoFlat = [
    ...(dados?.painel || []).flatMap(m => m.pecas.map(p => ({ ...p, maquina: m.maquina }))),
    ...(dados?.sem_maquina || []).map(p => ({ ...p, maquina: '(sem máquina)' })),
  ];
  const maquinasUso = (dados?.painel || []).filter(m => m.pecas.length > 0);
  const maquinasLivres = (dados?.painel || []).filter(m => m.pecas.length === 0);

  // Busca do painel: casa por nome da máquina OU por alguma peça (código, nº do
  // pedido, operador). Sem acento, sem caixa. Termo vazio = passa tudo.
  const norm = (s: string) => (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const termoPainel = norm(buscaPainel.trim());
  const maquinaCasa = (m: PainelMaquina) => !termoPainel
    || norm(m.maquina).includes(termoPainel)
    || m.pecas.some(p => norm(p.item_codigo).includes(termoPainel) || norm(p.numero_pedido_venda).includes(termoPainel) || norm(p.operador || '').includes(termoPainel));

  // Filtro da fila: nº do pedido, cliente, código ou descrição da peça.
  const termoFila = norm(buscaFila.trim());
  const pedidoCasa = (p: PedidoPlan) => !termoFila
    || norm(p.numero_pedido_venda).includes(termoFila)
    || (podeVerCli && norm(p.cliente || '').includes(termoFila))
    || p.pecas.some(pc => norm(pc.codigo).includes(termoFila) || norm(pc.descricao).includes(termoFila));
  const pedidosNaVis = pedidosNa.filter(pedidoCasa);
  const pedidosChegVis = pedidosCheg.filter(pedidoCasa);

  const renderMaquina = (mq: PainelMaquina) => {
    const ocupada = mq.pecas.length > 0;
    return (
      <div
        key={mq.maquina}
        onClick={ocupada ? () => setMaquinaModal(mq) : undefined}
        title={ocupada ? 'Clique para ver os pedidos desta máquina' : undefined}
        style={{ border: `2px solid ${ocupada ? C.azul2 : '#e2e8f0'}`, borderRadius: 12, overflow: 'hidden', background: '#fff', cursor: ocupada ? 'pointer' : 'default' }}
      >
        <div style={{ background: ocupada ? C.azul2 : '#f1f5f9', color: ocupada ? '#fff' : '#64748b', padding: '8px 12px', fontSize: 13, fontWeight: 800, display: 'flex', alignItems: 'center', gap: 8 }}>
          <i className={`bi ${ocupada ? 'bi-gear-fill' : 'bi-gear'}`} />
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{mq.maquina}</span>
          {ocupada && <span style={{ marginLeft: 'auto', fontSize: 10.5, background: 'rgba(255,255,255,.25)', borderRadius: 10, padding: '1px 7px' }}>{mq.pecas.length}</span>}
        </div>
        <div style={{ padding: 8 }}>
          {!ocupada ? (
            <div style={{ fontSize: 12, color: '#94a3b8', textAlign: 'center', padding: '10px 0', fontWeight: 600 }}>Livre</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {mq.pecas.map((p, i) => (
                <div key={i} style={{ borderLeft: `3px solid ${C.verde}`, padding: '4px 8px', background: '#f8fafc', borderRadius: 6 }}>
                  <div style={{ fontSize: 12.5, fontWeight: 700, color: C.azul }}>{p.item_codigo}</div>
                  <div style={{ fontSize: 11, color: '#64748b' }}>
                    {p.numero_pedido_venda}{podeVerCli && p.cliente ? ` · ${p.cliente}` : ''}
                  </div>
                  <div style={{ fontSize: 11, color: '#475569', marginTop: 2, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <span><i className="bi bi-box-seam" style={{ marginRight: 3 }} />{Number(p.quantidade).toLocaleString('pt-BR')} {p.unidade}</span>
                    {p.operador && <span><i className="bi bi-person" style={{ marginRight: 3 }} />{p.operador}</span>}
                    {p.desde && <span><i className="bi bi-clock" style={{ marginRight: 3 }} />{tempoDesde(p.desde)}</span>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  };

  const gridMaquinas = (maquinas: PainelMaquina[]) => (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 12 }}>
      {maquinas.map(renderMaquina)}
    </div>
  );

  return (
    <AuthGuard>
      <style>{`
        .pl-sel{border:1.5px solid #e2e8f0;border-radius:7px;padding:6px 8px;font-size:12.5px;font-weight:600;color:#334155;background:#fff;cursor:pointer;max-width:220px}
        .pl-sel.on{border-color:${C.roxo};background:#faf5ff;color:${C.roxo}}
        .pl-btn{border:1.5px solid #e2e8f0;background:#fff;border-radius:8px;padding:7px 12px;font-size:12.5px;font-weight:700;color:#334155;cursor:pointer}
        .pl-btn:hover{border-color:${C.azul}}
      `}</style>
      <div style={{ width: '100%' }}>
        {/* Cabeçalho */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, marginBottom: 14, flexWrap: 'wrap' }}>
          <div>
            <h4 style={{ margin: 0, fontWeight: 800, color: C.azul, fontSize: 22 }}>
              <i className="bi bi-diagram-3" style={{ marginRight: 8 }} />Planejamento da Usinagem
            </h4>
            <small style={{ color: '#94a3b8' }}>
              Defina a <b>ordem</b> e a <b>máquina</b> de cada peça. O operador segue o plano — não pode trocar máquina nem furar a fila.
            </small>
          </div>
          <button className="pl-btn" onClick={() => carregar()} disabled={carregando}>
            <i className="bi bi-arrow-clockwise" style={{ marginRight: 5 }} />{carregando ? 'Atualizando…' : 'Atualizar'}
          </button>
        </div>

        {/* Abas — Fila × Painel de Máquinas (clica pra abrir) */}
        <div style={{ display: 'flex', gap: 6, marginBottom: 16, flexWrap: 'wrap' }}>
          {([
            { id: 'fila' as const, rot: 'Fila da Usinagem', icon: 'bi-list-ol' },
            { id: 'maquinas' as const, rot: 'Painel de Máquinas', icon: 'bi-cpu' },
          ]).map(t => {
            const ativa = aba === t.id;
            return (
              <button
                key={t.id}
                onClick={() => setAba(t.id)}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 700,
                  border: `1.5px solid ${ativa ? C.azul : '#e2e8f0'}`, borderRadius: 10, padding: '8px 16px', cursor: 'pointer',
                  background: ativa ? C.azul : '#fff', color: ativa ? '#fff' : '#475569',
                }}
              >
                <i className={`bi ${t.icon}`} />{t.rot}
                {t.id === 'maquinas' && maquinasEmUso > 0 && (
                  <span style={{ fontSize: 11, fontWeight: 800, background: ativa ? 'rgba(255,255,255,.22)' : '#eef2ff', color: ativa ? '#fff' : C.azul2, borderRadius: 10, padding: '1px 8px' }}>
                    {maquinasEmUso} em uso
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {erro && (
          <div style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c', borderRadius: 8, padding: '10px 14px', fontSize: 13, marginBottom: 14 }}>
            {erro}
          </div>
        )}

        {/* ── SEÇÃO 1 — FILA (aba) ───────────────────────────────────────── */}
        {aba === 'fila' && (
        <section style={{ marginBottom: 30 }}>
          <div style={{ fontSize: 12, fontWeight: 800, color: C.azul2, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 }}>
            <i className="bi bi-list-ol" style={{ marginRight: 6 }} />Fila da Usinagem
          </div>
          <div style={{ fontSize: 11.5, color: '#94a3b8', marginBottom: 12 }}>
            Clique no pedido pra ver as peças · arraste a alça <i className="bi bi-grip-vertical" /> pra reordenar · <i className="bi bi-send-check-fill" style={{ color: C.verde }} /> <b>Encaminhar</b> deixa o pedido FIXO na Usinagem · <i className="bi bi-megaphone-fill" style={{ color: C.laranja }} /> <b>Avisar</b> manda uma mensagem que some · {totalPecas} peça(s)
          </div>

          {/* Busca da fila — nº do pedido, cliente, código ou descrição */}
          <div style={{ position: 'relative', maxWidth: 420, marginBottom: 14 }}>
            <i className="bi bi-search" style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8', fontSize: 13 }} />
            <input
              type="text"
              value={buscaFila}
              onChange={e => setBuscaFila(e.target.value)}
              placeholder="Filtrar pedido (nº, cliente, código ou descrição)…"
              style={{ width: '100%', border: '1px solid #cbd5e1', borderRadius: 8, padding: '8px 30px 8px 30px', fontSize: 13, boxSizing: 'border-box' }}
            />
            {buscaFila && (
              <button onClick={() => setBuscaFila('')} title="Limpar filtro" style={{ position: 'absolute', right: 6, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', fontSize: 14, lineHeight: 1, padding: 2 }}>
                <i className="bi bi-x-lg" />
              </button>
            )}
          </div>

          {carregando && !dados ? (
            <div style={{ padding: 30, textAlign: 'center', color: C.cinza, fontSize: 13 }}>Carregando…</div>
          ) : (dados?.pedidos.length ?? 0) === 0 ? (
            <div style={{ padding: 30, textAlign: 'center', color: C.cinza, fontSize: 13, background: '#f8fafc', borderRadius: 10, border: '1px dashed #e2e8f0' }}>
              Nenhuma peça na Usinagem ou a caminho dela agora.
            </div>
          ) : (
            <>
              {/* Grupo 1 — pedidos que JA estao na Usinagem */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '4px 0 8px', flexWrap: 'wrap' }}>
                <span style={{ fontSize: 11, fontWeight: 800, color: C.verde, textTransform: 'uppercase', letterSpacing: .5 }}>
                  <i className="bi bi-gear-fill" style={{ marginRight: 5 }} />Na Usinagem ({termoFila ? `${pedidosNaVis.length} de ${pedidosNa.length}` : pedidosNa.length})
                </span>
                <span title="Pedidos sendo produzidos / total na usinagem" style={{ marginLeft: 'auto', fontSize: 11.5, fontWeight: 800, color: '#fff', background: C.verde, borderRadius: 10, padding: '2px 10px' }}>
                  <i className="bi bi-gear-fill" style={{ marginRight: 4 }} />{produzindoNa} / {pedidosNa.length} em produção
                </span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 22 }}>
                {pedidosNaVis.length ? pedidosNaVis.map((ped, idx) => renderPedido(ped, idx)) : grupoVazio(termoFila ? 'Nenhum pedido bate com a busca.' : 'Nenhum pedido na Usinagem agora.')}
              </div>
              {/* Grupo 2 — pedidos que vao CHEGAR na Usinagem */}
              <div style={{ fontSize: 11, fontWeight: 800, color: C.laranja, textTransform: 'uppercase', letterSpacing: .5, margin: '4px 0 8px' }}>
                <i className="bi bi-truck" style={{ marginRight: 5 }} />Vão chegar na Usinagem ({termoFila ? `${pedidosChegVis.length} de ${pedidosCheg.length}` : pedidosCheg.length})
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {pedidosChegVis.length ? pedidosChegVis.map((ped, idx) => renderPedido(ped, idx)) : grupoVazio(termoFila ? 'Nenhum pedido bate com a busca.' : 'Nada a caminho da Usinagem agora.')}
              </div>
            </>
          )}
        </section>
        )}

        {/* ── SEÇÃO 2 — PAINEL DE MÁQUINAS (aba) ─────────────────────────── */}
        {aba === 'maquinas' && (
        <section>
          <div style={{ fontSize: 12, fontWeight: 800, color: C.roxo, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 }}>
            <i className="bi bi-cpu" style={{ marginRight: 6 }} />Painel de Máquinas — ao vivo
          </div>
          <div style={{ fontSize: 11.5, color: '#94a3b8', marginBottom: 12 }}>
            O que está produzindo agora em cada máquina da Usinagem · atualiza em tempo real
          </div>

          {/* Resumo geral — clicável: abre "quais são" embaixo */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: detalheResumo ? 10 : 16 }}>
            {([
              { id: 'pedidos' as const, rot: 'Pedidos em produção', val: pedidosProduzindo, cor: C.azul2, icon: 'bi-folder-fill' },
              { id: 'pecas' as const, rot: 'Peças em produção', val: pecasProduzindo, cor: C.verde, icon: 'bi-diagram-3-fill' },
              { id: 'qtd' as const, rot: 'Quantidade total', val: totalUnidades.toLocaleString('pt-BR'), cor: C.roxo, icon: 'bi-box-seam' },
              { id: 'uso' as const, rot: 'Máquinas em uso', val: `${maquinasEmUso} / ${totalMaquinas}`, cor: C.laranja, icon: 'bi-gear-fill' },
              { id: 'livres' as const, rot: 'Máquinas livres', val: totalMaquinas - maquinasEmUso, cor: C.cinza, icon: 'bi-gear' },
            ]).map(t => {
              const ativo = detalheResumo === t.id;
              return (
                <button
                  key={t.id}
                  onClick={() => setDetalheResumo(ativo ? null : t.id)}
                  title="Clique para ver quais são"
                  style={{ flex: '1 1 150px', minWidth: 140, textAlign: 'left', cursor: 'pointer', border: `1px solid ${ativo ? t.cor : '#e2e8f0'}`, borderLeft: `4px solid ${t.cor}`, borderRadius: 10, background: ativo ? '#f8fafc' : '#fff', padding: '10px 14px' }}
                >
                  <div style={{ fontSize: 10.5, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: .4, marginBottom: 3, display: 'flex', alignItems: 'center' }}>
                    <i className={`bi ${t.icon}`} style={{ marginRight: 5, color: t.cor }} />{t.rot}
                    <i className={`bi ${ativo ? 'bi-chevron-up' : 'bi-chevron-down'}`} style={{ marginLeft: 'auto', fontSize: 10, opacity: .6 }} />
                  </div>
                  <div style={{ fontSize: 22, fontWeight: 800, color: C.azul, lineHeight: 1.1 }}>{t.val}</div>
                </button>
              );
            })}
          </div>

          {/* Detalhe do tile clicado — "quais são" */}
          {detalheResumo && (
            <div style={{ border: '1px solid #e2e8f0', borderRadius: 10, background: '#fff', padding: 12, marginBottom: 16 }}>
              {(detalheResumo === 'pedidos') && (() => {
                const porPed = new Map<string, typeof producaoFlat>();
                for (const p of producaoFlat) {
                  const k = p.numero_pedido_venda || '—';
                  if (!porPed.has(k)) porPed.set(k, []);
                  porPed.get(k)!.push(p);
                }
                return porPed.size === 0 ? <div style={{ fontSize: 12.5, color: C.cinza }}>Nada em produção agora.</div> : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {Array.from(porPed.entries()).map(([num, pcs]) => (
                      <div key={num} style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', fontSize: 12.5, borderBottom: '1px solid #f1f5f9', paddingBottom: 5 }}>
                        <b style={{ color: C.azul }}>{num}</b>
                        {podeVerCli && pcs[0]?.cliente && <span style={{ color: '#64748b' }}>· {pcs[0].cliente}</span>}
                        <span style={{ color: '#94a3b8' }}>· {pcs.length} peça(s)</span>
                        <span style={{ marginLeft: 'auto', color: '#475569' }}>{Array.from(new Set(pcs.map(x => x.maquina))).join(', ')}</span>
                      </div>
                    ))}
                  </div>
                );
              })()}
              {(detalheResumo === 'pecas' || detalheResumo === 'qtd') && (
                producaoFlat.length === 0 ? <div style={{ fontSize: 12.5, color: C.cinza }}>Nada em produção agora.</div> : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {producaoFlat.map((p, i) => (
                      <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', fontSize: 12.5, borderBottom: '1px solid #f1f5f9', paddingBottom: 5 }}>
                        <b style={{ color: C.azul }}>{p.item_codigo}</b>
                        <span style={{ color: '#64748b' }}>· {p.numero_pedido_venda}</span>
                        <span style={{ fontWeight: 700, color: '#475569' }}>· {Number(p.quantidade).toLocaleString('pt-BR')} {p.unidade}</span>
                        <span style={{ marginLeft: 'auto', color: '#475569' }}><i className="bi bi-gear-fill" style={{ marginRight: 4, color: C.laranja }} />{p.maquina}{p.operador ? ` · ${p.operador}` : ''}</span>
                      </div>
                    ))}
                  </div>
                )
              )}
              {(detalheResumo === 'uso') && (
                maquinasUso.length === 0 ? <div style={{ fontSize: 12.5, color: C.cinza }}>Nenhuma máquina em uso.</div> : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {maquinasUso.map(m => (
                      <div key={m.maquina} style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', fontSize: 12.5, borderBottom: '1px solid #f1f5f9', paddingBottom: 5 }}>
                        <b style={{ color: C.azul }}><i className="bi bi-gear-fill" style={{ marginRight: 4, color: C.laranja }} />{m.maquina}</b>
                        <span style={{ color: '#94a3b8' }}>· {m.pecas.length} peça(s)</span>
                        <span style={{ marginLeft: 'auto', color: '#475569' }}>{m.pecas.map(x => x.item_codigo).join(', ')}</span>
                      </div>
                    ))}
                  </div>
                )
              )}
              {(detalheResumo === 'livres') && (
                maquinasLivres.length === 0 ? <div style={{ fontSize: 12.5, color: C.cinza }}>Nenhuma máquina livre.</div> : (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {maquinasLivres.map(m => (
                      <span key={m.maquina} style={{ fontSize: 12.5, fontWeight: 600, color: '#475569', background: '#f1f5f9', border: '1px solid #e2e8f0', borderRadius: 8, padding: '4px 10px' }}>
                        <i className="bi bi-gear" style={{ marginRight: 4, color: '#94a3b8' }} />{m.maquina}
                      </span>
                    ))}
                  </div>
                )
              )}
            </div>
          )}

          {/* Busca — filtra o painel inteiro (máquina, pedido, código, operador) */}
          <div style={{ position: 'relative', maxWidth: 420, marginBottom: 14 }}>
            <i className="bi bi-search" style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8', fontSize: 13 }} />
            <input
              type="text"
              value={buscaPainel}
              onChange={e => setBuscaPainel(e.target.value)}
              placeholder="Buscar máquina, pedido, código ou operador…"
              style={{ width: '100%', border: '1px solid #cbd5e1', borderRadius: 8, padding: '8px 30px 8px 30px', fontSize: 13, boxSizing: 'border-box' }}
            />
            {buscaPainel && (
              <button onClick={() => setBuscaPainel('')} title="Limpar busca" style={{ position: 'absolute', right: 6, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', fontSize: 14, lineHeight: 1, padding: 2 }}>
                <i className="bi bi-x-lg" />
              </button>
            )}
          </div>

          {/* Agrupado por CATEGORIA (Tornos Manuais / CNC / Verticais) */}
          {grupos.map(g => {
            const maquinas = g.maquinas.map(nome => painelMap.get(nome) ?? { maquina: nome, pecas: [] }).filter(maquinaCasa);
            if (maquinas.length === 0) return null;
            const emUso = maquinas.filter(m => m.pecas.length > 0).length;
            return (
              <div key={g.categoria} style={{ marginBottom: 18 }}>
                <div style={{ fontSize: 11.5, fontWeight: 800, color: C.azul, margin: '0 0 8px', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <i className="bi bi-diagram-2-fill" style={{ color: C.roxo }} />{g.categoria}
                  <span style={{ fontSize: 10.5, fontWeight: 700, color: '#94a3b8' }}>· {emUso}/{maquinas.length} em uso</span>
                </div>
                {gridMaquinas(maquinas)}
              </div>
            );
          })}
          {painelOutras.filter(maquinaCasa).length > 0 && (
            <div style={{ marginBottom: 18 }}>
              <div style={{ fontSize: 11.5, fontWeight: 800, color: C.azul, margin: '0 0 8px' }}>
                <i className="bi bi-diagram-2-fill" style={{ color: C.roxo, marginRight: 6 }} />Outras
              </div>
              {gridMaquinas(painelOutras.filter(maquinaCasa))}
            </div>
          )}
          {termoPainel && grupos.every(g => g.maquinas.map(nome => painelMap.get(nome) ?? { maquina: nome, pecas: [] }).filter(maquinaCasa).length === 0) && painelOutras.filter(maquinaCasa).length === 0 && (
            <div style={{ padding: 20, textAlign: 'center', color: C.cinza, fontSize: 12.5, background: '#f8fafc', borderRadius: 10, border: '1px dashed #e2e8f0' }}>
              Nada encontrado para “{buscaPainel}”.
            </div>
          )}

          {/* Produzindo sem máquina registrada (fica de fora do grid fixo) */}
          {(dados?.sem_maquina?.length ?? 0) > 0 && (
            <div style={{ marginTop: 12, border: '2px dashed #fca5a5', borderRadius: 12, background: '#fff7f7', padding: 10 }}>
              <div style={{ fontSize: 12, fontWeight: 800, color: C.vermelho, marginBottom: 6 }}>
                <i className="bi bi-exclamation-triangle" style={{ marginRight: 5 }} />Produzindo sem máquina registrada ({dados!.sem_maquina.length})
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {dados!.sem_maquina.map((p, i) => (
                  <div key={i} style={{ fontSize: 12, color: '#7f1d1d' }}>
                    <b>{p.item_codigo}</b> · {p.numero_pedido_venda}{p.operador ? ` · ${p.operador}` : ''}
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>
        )}
      </div>

      {/* Modal — avisar OU encaminhar produção, com observação */}
      {modalAcao && (() => {
        const enc = modalAcao.tipo === 'encaminhar';
        const editando = enc && encaminhados.has(modalAcao.pedidoId);
        const cor = enc ? C.verde : C.laranja;
        const emAndamento = enc ? processando === modalAcao.pedidoId : avisando === modalAcao.pedidoId;
        const fechar = () => { setModalAcao(null); setModalObs(''); };
        return (
        <div onClick={fechar} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16 }}>
          <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: 14, padding: 24, width: 440, maxWidth: '94vw', boxShadow: '0 8px 32px rgba(0,0,0,.18)' }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#888', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 }}>
              <i className={`bi ${enc ? 'bi-send-check-fill' : 'bi-megaphone-fill'}`} style={{ marginRight: 5, color: cor }} />
              {enc ? (editando ? 'Editar encaminhamento' : 'Encaminhar pra Usinagem') : 'Avisar Usinagem'}
            </div>
            <div style={{ fontSize: 18, fontWeight: 800, color: C.azul, marginBottom: 14 }}>
              Produzir pedido {modalAcao.numero}
            </div>
            <label style={{ fontSize: 12, fontWeight: 600, color: '#555', display: 'block', marginBottom: 6 }}>
              Observação <span style={{ fontWeight: 400, color: '#94a3b8' }}>(opcional)</span>
            </label>
            <textarea
              value={modalObs}
              onChange={e => setModalObs(e.target.value.slice(0, 500))}
              autoFocus
              rows={3}
              placeholder="Ex.: prioridade do cliente, cuidado com a medida, começar pela peça X…"
              style={{ width: '100%', border: '1px solid #dee2e6', borderRadius: 8, padding: '9px 10px', fontSize: 13.5, boxSizing: 'border-box', resize: 'vertical', marginBottom: 8 }}
            />
            {/* Mensagens prontas — clicar adiciona à observação */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
              {MENSAGENS_PRONTAS.map(m => {
                const jaTem = modalObs.includes(m);
                return (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setModalObs(prev => {
                      if (prev.includes(m)) return prev;
                      const base = prev.trim();
                      return (base ? `${base}; ${m}` : m).slice(0, 500);
                    })}
                    style={{
                      fontSize: 11.5, fontWeight: 600, borderRadius: 999, padding: '4px 10px', cursor: 'pointer',
                      border: `1px solid ${jaTem ? cor : '#e2e8f0'}`,
                      background: jaTem ? (enc ? '#f0fdf4' : '#fff7ed') : '#fff',
                      color: jaTem ? (enc ? '#15803d' : '#c2410c') : '#475569',
                    }}
                  >
                    {jaTem ? <i className="bi bi-check2" style={{ marginRight: 4 }} /> : <i className="bi bi-plus" style={{ marginRight: 2 }} />}{m}
                  </button>
                );
              })}
            </div>
            {enc && (
              <label style={{ display: 'flex', alignItems: 'flex-start', gap: 8, cursor: 'pointer', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8, padding: '9px 11px', marginBottom: 10 }}>
                <input type="checkbox" checked={modalFixo} onChange={e => setModalFixo(e.target.checked)} style={{ marginTop: 2, cursor: 'pointer' }} />
                <span>
                  <span style={{ fontSize: 13, fontWeight: 700, color: '#166534' }}>
                    <i className="bi bi-pin-angle-fill" style={{ marginRight: 5 }} />Fixar no topo da Usinagem
                  </span>
                  <span style={{ display: 'block', fontSize: 11.5, color: '#15803d', marginTop: 2 }}>
                    {modalFixo
                      ? 'Vai ficar destacado e FIXO no topo da tela deles até você desfazer.'
                      : 'Só marca como encaminhado (não fixa no topo) — aparece numa lista à parte.'}
                  </span>
                </span>
              </label>
            )}
            <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 16 }}>
              {enc
                ? 'Deixa o pedido FIXO/destacado na tela da Usinagem até você desfazer. Não empurra o pedido no fluxo — quem recebe e movimenta continua sendo o operador.'
                : 'Aparece na caixa de mensagens da Usinagem; some quando o operador dá "Visto".'}
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={fechar} style={{ flex: 1, background: '#f3f4f6', color: '#555', border: 'none', borderRadius: 8, padding: '11px 0', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                Cancelar
              </button>
              <button
                onClick={() => (enc ? encaminhar(modalAcao.pedidoId, modalObs, modalFixo) : avisarProducao(modalAcao.pedidoId, modalObs))}
                disabled={emAndamento}
                style={{ flex: 2, background: cor, color: '#fff', border: 'none', borderRadius: 8, padding: '11px 0', fontSize: 13, fontWeight: 700, cursor: 'pointer', opacity: emAndamento ? .6 : 1 }}
              >
                <i className={`bi ${enc ? 'bi-send-check-fill' : 'bi-send-fill'}`} style={{ marginRight: 6 }} />
                {emAndamento ? 'Enviando…' : (enc ? (editando ? 'Salvar' : 'Encaminhar') : 'Enviar aviso')}
              </button>
            </div>
          </div>
        </div>
        );
      })()}

      {/* Modal — pedidos de uma máquina (clicou no card do painel) */}
      {maquinaModal && (
        <div onClick={() => setMaquinaModal(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16 }}>
          <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: 14, padding: 22, width: 560, maxWidth: '94vw', maxHeight: '85vh', overflowY: 'auto', boxShadow: '0 8px 32px rgba(0,0,0,.18)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              <i className="bi bi-gear-fill" style={{ color: C.azul2, fontSize: 18 }} />
              <div style={{ fontSize: 18, fontWeight: 800, color: C.azul }}>{maquinaModal.maquina}</div>
              <span style={{ fontSize: 11, fontWeight: 700, color: '#fff', background: C.azul2, borderRadius: 10, padding: '1px 8px' }}>{maquinaModal.pecas.length} pedido(s)</span>
              <button onClick={() => setMaquinaModal(null)} style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', fontSize: 18, lineHeight: 1 }}><i className="bi bi-x-lg" /></button>
            </div>
            <div style={{ fontSize: 11.5, color: '#94a3b8', marginBottom: 14 }}>Produzindo agora nesta máquina</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {maquinaModal.pecas.map((p, i) => (
                <div key={i} style={{ border: '1px solid #e2e8f0', borderLeft: `4px solid ${C.verde}`, borderRadius: 10, padding: '10px 12px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <b style={{ fontSize: 14, color: C.azul }}>{p.item_codigo}</b>
                    <span style={{ fontSize: 12.5, color: '#64748b' }}>· {p.numero_pedido_venda}{podeVerCli && p.cliente ? ` · ${p.cliente}` : ''}</span>
                    <span style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
                      {p.tem_op && (
                        <a href={`/api/pedidos/${p.pedido_id}/ordem-producao?token=${encodeURIComponent(getToken() || '')}`} target="_blank" rel="noopener noreferrer"
                          style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12, fontWeight: 700, border: '1px solid #93c5fd', background: '#eff6ff', color: '#1d4ed8', borderRadius: 7, padding: '4px 9px', textDecoration: 'none' }}>
                          <i className="bi bi-file-earmark-text" />OP
                        </a>
                      )}
                      <a href={`/pedidos/${p.pedido_id}`}
                        onClick={e => { e.preventDefault(); router.push(`/pedidos/${p.pedido_id}`); }}
                        style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12, fontWeight: 700, border: '1px solid #e2e8f0', background: '#fff', color: '#475569', borderRadius: 7, padding: '4px 9px', textDecoration: 'none' }}>
                        <i className="bi bi-box-arrow-up-right" />Abrir pedido
                      </a>
                    </span>
                  </div>
                  {p.item_descricao && <div style={{ fontSize: 11.5, color: '#64748b', marginTop: 3 }}>{p.item_descricao}</div>}
                  <div style={{ fontSize: 11.5, color: '#475569', marginTop: 4, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                    <span><i className="bi bi-box-seam" style={{ marginRight: 3 }} />{Number(p.quantidade).toLocaleString('pt-BR')} {p.unidade}</span>
                    {p.operador && <span><i className="bi bi-person" style={{ marginRight: 3 }} />{p.operador}</span>}
                    {p.desde && <span><i className="bi bi-clock" style={{ marginRight: 3 }} />{tempoDesde(p.desde)}</span>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </AuthGuard>
  );
}
