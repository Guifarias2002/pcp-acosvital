'use client';
import { useCallback, useEffect, useState } from 'react';
import AuthGuard from '@/components/AuthGuard';
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
  maquina_planejada: string | null;
  previsao: string | null;
}
interface PedidoPlan {
  pedido_id: number;
  numero_pedido_venda: string;
  cliente: string;
  prioridade: string;
  prazo: string | null;
  previsao: string | null;
  pecas: Peca[];
}
interface MaquinaAtiva {
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

function diasPrevisao(iso: string | null): { txt: string; cor: string } | null {
  if (!iso) return null;
  const dias = Math.ceil((new Date(iso + 'T12:00:00').getTime() - Date.now()) / 86400000);
  return {
    cor: dias < 0 ? C.vermelho : dias <= 3 ? C.laranja : C.verde,
    txt: dias < 0 ? `Atrasado ${Math.abs(dias)}d` : dias === 0 ? 'Conclui hoje' : `Conclusão em ${dias}d`,
  };
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
  const [dados, setDados] = useState<Dados | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState('');
  const [dragPedido, setDragPedido] = useState<number | null>(null);
  const [salvandoMaq, setSalvandoMaq] = useState<number | null>(null);
  // Pedidos com o card ABERTO (mostrando as peças). Começam fechados: clicar
  // no cabeçalho abre e mostra "quais são".
  const [abertos, setAbertos] = useState<Set<number>>(new Set());
  // Pedidos que já têm um aviso PENDENTE na caixa da Usinagem (pra mostrar
  // "Avisado ✓" no botão em vez de deixar avisar de novo à toa).
  const [avisados, setAvisados] = useState<Set<number>>(new Set());
  const [avisando, setAvisando] = useState<number | null>(null);
  // Modal de "Avisar produção" — permite escrever uma observação junto ao aviso.
  const [avisarModal, setAvisarModal] = useState<{ pedidoId: number; numero: string } | null>(null);
  const [avisarObs, setAvisarObs] = useState('');
  // Aba ativa: a Fila ou o Painel de Máquinas (abre ao clicar lá em cima).
  const [aba, setAba] = useState<'fila' | 'maquinas'>('fila');
  const podeVerCli = podeVerCliente();

  const carregar = useCallback(async (silencioso = false) => {
    if (!silencioso) setCarregando(true);
    try {
      const [rP, rA] = await Promise.all([
        fetch('/api/planejamento', { headers: { Authorization: `Bearer ${getToken() || ''}` } }),
        fetch('/api/avisos?setor=usinagem', { headers: { Authorization: `Bearer ${getToken() || ''}` } }),
      ]);
      if (!rP.ok) { setErro('Não foi possível carregar o planejamento.'); return; }
      const d = await rP.json();
      setDados(d);
      setErro('');
      if (rA.ok) {
        const da = await rA.json();
        setAvisados(new Set((da.avisos || []).map((a: { pedido_id: number }) => a.pedido_id)));
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
    finally { setAvisando(null); setAvisarModal(null); setAvisarObs(''); }
  }

  useEffect(() => { carregar(); }, [carregar]);
  // Atualiza o painel ao vivo a cada 30s (só quando a aba está visível).
  useEffect(() => {
    const id = setInterval(() => { if (document.visibilityState === 'visible') carregar(true); }, 30000);
    return () => clearInterval(id);
  }, [carregar]);

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
      await fetch('/api/planejamento', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken() || ''}` },
        body: JSON.stringify({ item_pedido_id: itemId, maquina }),
      });
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

  // Card de um pedido na fila. `idx` é a posição DENTRO do grupo (numeração).
  const renderPedido = (ped: PedidoPlan, idx: number) => {
    const prio = (ped.prioridade || '').toLowerCase();
    const prev = diasPrevisao(ped.previsao);
    const arrastando = dragPedido === ped.pedido_id;
    const aberto = abertos.has(ped.pedido_id);
    const jaAvisado = avisados.has(ped.pedido_id);
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
          {prio && (
            <span style={{ fontSize: 10.5, fontWeight: 800, textTransform: 'uppercase', letterSpacing: .4, background: PRIO_COR[prio] || C.cinza, borderRadius: 10, padding: '2px 8px' }}>
              {prio}
            </span>
          )}
          {prev && (
            <span style={{ fontSize: 11.5, fontWeight: 700, background: prev.cor, borderRadius: 10, padding: '2px 9px' }}>
              {prev.txt}
            </span>
          )}
          {/* Ações à direita: avisar produção + abrir o pedido */}
          <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
            <button
              onClick={e => { e.stopPropagation(); setAvisarObs(''); setAvisarModal({ pedidoId: ped.pedido_id, numero: ped.numero_pedido_venda }); }}
              disabled={avisando === ped.pedido_id}
              title="Avisar a Usinagem que este pedido deve ser produzido (com observação opcional)"
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, fontWeight: 700,
                border: 'none', borderRadius: 8, padding: '5px 11px', cursor: 'pointer',
                background: jaAvisado ? 'rgba(255,255,255,.18)' : '#f59e0b',
                color: '#fff', whiteSpace: 'nowrap', opacity: avisando === ped.pedido_id ? .6 : 1,
              }}
            >
              <i className={`bi ${jaAvisado ? 'bi-check2-circle' : 'bi-megaphone-fill'}`} />
              {jaAvisado ? 'Avisado' : (avisando === ped.pedido_id ? 'Avisando…' : 'Avisar produção')}
            </button>
            <a
              href={`/pedidos/${ped.pedido_id}`}
              target="_blank"
              rel="noopener noreferrer"
              onClick={e => e.stopPropagation()}
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
            return (
              <div key={pc.item_id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 8px', borderRadius: 8, background: '#f8fafc', flexWrap: 'wrap' }}>
                <span title={naUsinagem ? 'Peça já está na Usinagem' : `Vindo do setor: ${pc.setor_atual_nome}`} style={{ fontSize: 9.5, fontWeight: 800, textTransform: 'uppercase', letterSpacing: .3, color: naUsinagem ? C.verde : C.laranja, background: naUsinagem ? '#dcfce7' : '#fef3c7', borderRadius: 6, padding: '2px 7px', whiteSpace: 'nowrap' }}>
                  {naUsinagem ? 'Na usinagem' : `Chegando de ${pc.setor_atual_nome}`}
                </span>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: C.azul }}>{pc.codigo}</div>
                  <div style={{ fontSize: 11.5, color: '#64748b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{pc.descricao}</div>
                </div>
                <span style={{ fontSize: 12, fontWeight: 700, color: '#475569', whiteSpace: 'nowrap' }}>
                  {Number(pc.quantidade).toLocaleString('pt-BR')} {pc.unidade}
                </span>
                <select
                  className={`pl-sel${pc.maquina_planejada ? ' on' : ''}`}
                  value={pc.maquina_planejada || ''}
                  disabled={salvandoMaq === pc.item_id}
                  onChange={e => definirMaquina(pc.item_id, e.target.value)}
                  title="Máquina planejada para esta peça"
                >
                  <option value="">— sem máquina —</option>
                  {grupos.map(g => (
                    <optgroup key={g.categoria} label={g.categoria}>
                      {g.maquinas.map(m => <option key={m} value={m}>{m}</option>)}
                    </optgroup>
                  ))}
                </select>
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

  const renderMaquina = (mq: PainelMaquina) => {
    const ocupada = mq.pecas.length > 0;
    return (
      <div key={mq.maquina} style={{ border: `2px solid ${ocupada ? C.azul2 : '#e2e8f0'}`, borderRadius: 12, overflow: 'hidden', background: '#fff' }}>
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
            Clique no pedido pra ver as peças · arraste a alça <i className="bi bi-grip-vertical" /> pra reordenar · <i className="bi bi-megaphone-fill" style={{ color: C.laranja }} /> <b>Avisar produção</b> manda o pedido pra caixa da Usinagem · {totalPecas} peça(s)
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
              <div style={{ fontSize: 11, fontWeight: 800, color: C.verde, textTransform: 'uppercase', letterSpacing: .5, margin: '4px 0 8px' }}>
                <i className="bi bi-gear-fill" style={{ marginRight: 5 }} />Na Usinagem ({pedidosNa.length})
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 22 }}>
                {pedidosNa.length ? pedidosNa.map((ped, idx) => renderPedido(ped, idx)) : grupoVazio('Nenhum pedido na Usinagem agora.')}
              </div>
              {/* Grupo 2 — pedidos que vao CHEGAR na Usinagem */}
              <div style={{ fontSize: 11, fontWeight: 800, color: C.laranja, textTransform: 'uppercase', letterSpacing: .5, margin: '4px 0 8px' }}>
                <i className="bi bi-truck" style={{ marginRight: 5 }} />Vão chegar na Usinagem ({pedidosCheg.length})
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {pedidosCheg.length ? pedidosCheg.map((ped, idx) => renderPedido(ped, idx)) : grupoVazio('Nada a caminho da Usinagem agora.')}
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
            O que está produzindo agora em cada máquina da Usinagem · atualiza sozinho a cada 30s
          </div>

          {/* Resumo geral — total do que está em produção agora */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 16 }}>
            {[
              { rot: 'Pedidos em produção', val: pedidosProduzindo, cor: C.azul2, icon: 'bi-folder-fill' },
              { rot: 'Peças em produção', val: pecasProduzindo, cor: C.verde, icon: 'bi-diagram-3-fill' },
              { rot: 'Quantidade total', val: totalUnidades.toLocaleString('pt-BR'), cor: C.roxo, icon: 'bi-box-seam' },
              { rot: 'Máquinas em uso', val: `${maquinasEmUso} / ${totalMaquinas}`, cor: C.laranja, icon: 'bi-gear-fill' },
              { rot: 'Máquinas livres', val: totalMaquinas - maquinasEmUso, cor: C.cinza, icon: 'bi-gear' },
            ].map(t => (
              <div key={t.rot} style={{ flex: '1 1 150px', minWidth: 140, border: '1px solid #e2e8f0', borderLeft: `4px solid ${t.cor}`, borderRadius: 10, background: '#fff', padding: '10px 14px' }}>
                <div style={{ fontSize: 10.5, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: .4, marginBottom: 3 }}>
                  <i className={`bi ${t.icon}`} style={{ marginRight: 5, color: t.cor }} />{t.rot}
                </div>
                <div style={{ fontSize: 22, fontWeight: 800, color: C.azul, lineHeight: 1.1 }}>{t.val}</div>
              </div>
            ))}
          </div>

          {/* Agrupado por CATEGORIA (Tornos Manuais / CNC / Verticais) */}
          {grupos.map(g => {
            const maquinas = g.maquinas.map(nome => painelMap.get(nome) ?? { maquina: nome, pecas: [] });
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
          {painelOutras.length > 0 && (
            <div style={{ marginBottom: 18 }}>
              <div style={{ fontSize: 11.5, fontWeight: 800, color: C.azul, margin: '0 0 8px' }}>
                <i className="bi bi-diagram-2-fill" style={{ color: C.roxo, marginRight: 6 }} />Outras
              </div>
              {gridMaquinas(painelOutras)}
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

      {/* Modal — avisar produção com observação opcional */}
      {avisarModal && (
        <div
          onClick={() => { setAvisarModal(null); setAvisarObs(''); }}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16 }}
        >
          <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: 14, padding: 24, width: 440, maxWidth: '94vw', boxShadow: '0 8px 32px rgba(0,0,0,.18)' }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#888', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 }}>
              <i className="bi bi-megaphone-fill" style={{ marginRight: 5, color: C.laranja }} />Avisar Usinagem
            </div>
            <div style={{ fontSize: 18, fontWeight: 800, color: C.azul, marginBottom: 14 }}>
              Produzir pedido {avisarModal.numero}
            </div>
            <label style={{ fontSize: 12, fontWeight: 600, color: '#555', display: 'block', marginBottom: 6 }}>
              Observação <span style={{ fontWeight: 400, color: '#94a3b8' }}>(opcional)</span>
            </label>
            <textarea
              value={avisarObs}
              onChange={e => setAvisarObs(e.target.value.slice(0, 500))}
              autoFocus
              rows={3}
              placeholder="Ex.: prioridade do cliente, cuidado com a medida, começar pela peça X…"
              style={{ width: '100%', border: '1px solid #dee2e6', borderRadius: 8, padding: '9px 10px', fontSize: 13.5, boxSizing: 'border-box', resize: 'vertical', marginBottom: 8 }}
            />
            {/* Mensagens prontas — clicar adiciona à observação */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
              {MENSAGENS_PRONTAS.map(m => {
                const jaTem = avisarObs.includes(m);
                return (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setAvisarObs(prev => {
                      if (prev.includes(m)) return prev; // não repete
                      const base = prev.trim();
                      return (base ? `${base}; ${m}` : m).slice(0, 500);
                    })}
                    style={{
                      fontSize: 11.5, fontWeight: 600, borderRadius: 999, padding: '4px 10px', cursor: 'pointer',
                      border: `1px solid ${jaTem ? C.laranja : '#e2e8f0'}`,
                      background: jaTem ? '#fff7ed' : '#fff',
                      color: jaTem ? '#c2410c' : '#475569',
                    }}
                  >
                    {jaTem ? <i className="bi bi-check2" style={{ marginRight: 4 }} /> : <i className="bi bi-plus" style={{ marginRight: 2 }} />}{m}
                  </button>
                );
              })}
            </div>
            <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 16 }}>
              Clique numa sugestão pra adicionar · o aviso aparece na caixa de mensagens da Usinagem, no topo da tela deles.
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                onClick={() => { setAvisarModal(null); setAvisarObs(''); }}
                style={{ flex: 1, background: '#f3f4f6', color: '#555', border: 'none', borderRadius: 8, padding: '11px 0', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
              >
                Cancelar
              </button>
              <button
                onClick={() => avisarProducao(avisarModal.pedidoId, avisarObs)}
                disabled={avisando === avisarModal.pedidoId}
                style={{ flex: 2, background: C.laranja, color: '#fff', border: 'none', borderRadius: 8, padding: '11px 0', fontSize: 13, fontWeight: 700, cursor: 'pointer', opacity: avisando === avisarModal.pedidoId ? .6 : 1 }}
              >
                <i className="bi bi-send-fill" style={{ marginRight: 6 }} />
                {avisando === avisarModal.pedidoId ? 'Enviando…' : 'Enviar aviso'}
              </button>
            </div>
          </div>
        </div>
      )}
    </AuthGuard>
  );
}
