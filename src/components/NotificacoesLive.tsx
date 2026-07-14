'use client';
import { useEffect, useRef, useState } from 'react';
import { getToken } from '@/lib/auth';
import { NOMES } from '@/lib/types';

interface Notificacao {
  id: number;
  criado_em: string;
  setor_origem: string;
  setor_destino: string;
  status_anterior: string;
  status_novo: string;
  item_codigo: string;
  pedido_numero: string;
  numero_op?: string | null;
  cliente?: string | null;
  vendedor?: string | null;
  usuario_nome: string;
  qtd?: number;
}

const STATUS_LABEL: Record<string, string> = {
  aguardando: 'Aguardando', recebido: 'Recebido', em_andamento: 'Em Andamento',
  pausado: 'Pausado', finalizado_setor: 'Finalizado', entregue: 'Entregue',
};

const STATUS_ICON: Record<string, string> = {
  recebido: '📥', em_andamento: '⚙️', pausado: '⏸️',
  finalizado_setor: '✅', entregue: '🚚', aguardando: '⏳',
};

const nomeSetor = (cod?: string) => (cod ? (NOMES[cod] || cod) : '');

// Rótulo amigável da AÇÃO a partir do status resultante + transição de setor.
function acaoLabel(m: Notificacao): { texto: string; icone: string } {
  const dest = nomeSetor(m.setor_destino);
  const orig = nomeSetor(m.setor_origem);
  const mudouSetor = m.setor_destino && m.setor_origem && m.setor_destino !== m.setor_origem;
  let r: { texto: string; icone: string };
  switch (m.status_novo) {
    case 'criado':       r = { icone: '🆕', texto: 'Pedido criado' }; break;
    case 'aguardando':
    case 'emitido':
      r = { icone: '📤', texto: mudouSetor ? `Enviado para ${dest || orig}` : `Liberado${dest ? ' — ' + dest : ''}` }; break;
    case 'recebido':      r = { icone: '📥', texto: `Recebido em ${dest || orig}` }; break;
    case 'em_andamento':  r = { icone: '⚙️', texto: `Em produção em ${dest || orig}` }; break;
    case 'pausado':       r = { icone: '⏸️', texto: `Pausado em ${dest || orig}` }; break;
    case 'finalizado_setor': r = { icone: '✅', texto: `Finalizado em ${dest || orig}` }; break;
    case 'em_transito':   r = { icone: '🚚', texto: `Despachado (em trânsito)` }; break;
    case 'entregue':      r = { icone: '🎉', texto: `Entregue ao cliente` }; break;
    case 'reprovado':     r = { icone: '⚠️', texto: `Reprovado na Qualidade` }; break;
    case 'bloqueado':     r = { icone: '🛑', texto: `Cancelado / bloqueado` }; break;
    default:              r = { icone: '🔄', texto: STATUS_LABEL[m.status_novo] || m.status_novo };
  }
  if (m.qtd && m.qtd > 1) r = { ...r, texto: `${r.texto} — ${m.qtd} itens` };
  return r;
}

export default function NotificacoesLive({ filtroSetor, modo = 'toast' }: { filtroSetor?: string; modo?: 'toast' | 'tela' } = {}) {
  const [toasts, setToasts] = useState<(Notificacao & { key: number })[]>([]);
  const [fila, setFila] = useState<(Notificacao & { key: number })[]>([]);
  const desdeRef = useRef<string>('');
  const keyRef = useRef(0);

  useEffect(() => {
    if (!desdeRef.current) desdeRef.current = new Date().toISOString();
    const token = getToken();
    if (!token) return;

    async function verificar() {
      try {
        const res = await fetch(`/api/notificacoes?desde=${encodeURIComponent(desdeRef.current)}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) return;
        const { movimentacoes } = await res.json();
        if (!movimentacoes || movimentacoes.length === 0) return;

        desdeRef.current = movimentacoes[0].criado_em;

        const filtradas: Notificacao[] = filtroSetor
          ? movimentacoes.filter((m: Notificacao) => m.setor_destino === filtroSetor || m.setor_origem === filtroSetor)
          : movimentacoes;
        if (filtradas.length === 0) return;

        // Chegam em ordem decrescente; na fila queremos mostrar da mais antiga p/ mais nova.
        const emOrdem = [...filtradas].reverse();

        if (modo === 'tela') {
          // Agrupa movimentacoes do mesmo pedido/acao/setor (ex: liberar varios itens
          // de uma vez gera uma linha por item) numa unica notificacao com contador.
          const grupos: (Notificacao & { qtd: number })[] = [];
          const porChave = new Map<string, Notificacao & { qtd: number }>();
          for (const m of emOrdem) {
            const chave = `${m.pedido_numero}|${m.status_novo}|${m.setor_origem}|${m.setor_destino}`;
            const existente = porChave.get(chave);
            if (existente) { existente.qtd++; }
            else { const g = { ...m, qtd: 1 }; porChave.set(chave, g); grupos.push(g); }
          }
          const novos = grupos.map(m => ({ ...m, key: keyRef.current++ }));
          setFila(prev => [...prev, ...novos].slice(-20)); // limita fila pra não acumular sem fim
        } else {
          const novos = emOrdem.map(m => ({ ...m, key: keyRef.current++ }));
          const novosDesc = novos.reverse();
          setToasts(prev => [...novosDesc, ...prev].slice(0, 5));
          novosDesc.forEach(n => {
            setTimeout(() => setToasts(prev => prev.filter(t => t.key !== n.key)), 6000);
          });
        }
      } catch { /* silencioso */ }
    }

    const intervalo = setInterval(verificar, modo === 'tela' ? 10000 : 30000);
    return () => clearInterval(intervalo);
  }, [filtroSetor, modo]);

  // Fila do modo tela: mostra o primeiro por 5s, depois passa pro próximo.
  useEffect(() => {
    if (modo !== 'tela' || fila.length === 0) return;
    const t = setTimeout(() => setFila(prev => prev.slice(1)), 5000);
    return () => clearTimeout(t);
  }, [modo, fila[0]?.key]);

  // ── Modo TELA CHEIA (ADM/PCP) ────────────────────────────────────────────────
  if (modo === 'tela') {
    const atual = fila[0];
    if (!atual) return null;
    const acao = acaoLabel(atual);
    const mudouSetor = atual.setor_destino && atual.setor_origem && atual.setor_destino !== atual.setor_origem;
    return (
      <div
        onClick={() => setFila(prev => prev.slice(1))}
        style={{
          position: 'fixed', inset: 0, zIndex: 100000,
          background: 'rgba(10,20,35,0.72)', backdropFilter: 'blur(2px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
          animation: 'notifFade .25s ease',
        }}
      >
        <div style={{
          background: '#fff', borderRadius: 18, padding: '32px 40px', maxWidth: 720, width: '100%',
          boxShadow: '0 20px 70px rgba(0,0,0,0.5)', borderTop: '8px solid #0d6efd', textAlign: 'center',
          position: 'relative',
        }}>
          <button onClick={(e) => { e.stopPropagation(); setFila(prev => prev.slice(1)); }}
            style={{ position: 'absolute', top: 14, right: 18, background: 'none', border: 'none', fontSize: 24, color: '#94a3b8', cursor: 'pointer' }}>
            ✕
          </button>

          <div style={{ fontSize: 13, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 }}>
            Movimentação
          </div>

          <div style={{ fontSize: 56, lineHeight: 1, margin: '6px 0 14px' }}>{acao.icone}</div>

          <div style={{ fontSize: 30, fontWeight: 800, color: '#0f172a', marginBottom: 18 }}>
            {acao.texto}
          </div>

          {mudouSetor && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 14, marginBottom: 20, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 20, fontWeight: 700, color: '#475569', background: '#f1f5f9', borderRadius: 10, padding: '8px 18px' }}>
                {nomeSetor(atual.setor_origem)}
              </span>
              <span style={{ fontSize: 28, color: '#0d6efd' }}>➜</span>
              <span style={{ fontSize: 20, fontWeight: 800, color: '#fff', background: '#0d6efd', borderRadius: 10, padding: '8px 18px' }}>
                {nomeSetor(atual.setor_destino)}
              </span>
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'center', gap: 32, flexWrap: 'wrap', borderTop: '1px solid #e2e8f0', paddingTop: 18 }}>
            {atual.status_novo === 'criado' ? (
              <>
                <div>
                  <div style={{ fontSize: 12, color: '#94a3b8', fontWeight: 600 }}>PEDIDO</div>
                  <div style={{ fontSize: 24, fontWeight: 800, color: '#1a3a5c' }}>{atual.pedido_numero || '—'}</div>
                </div>
                <div>
                  <div style={{ fontSize: 12, color: '#94a3b8', fontWeight: 600 }}>CLIENTE</div>
                  <div style={{ fontSize: 24, fontWeight: 800, color: '#1a3a5c' }}>{atual.cliente || '—'}</div>
                </div>
                <div>
                  <div style={{ fontSize: 12, color: '#94a3b8', fontWeight: 600 }}>VENDEDOR</div>
                  <div style={{ fontSize: 24, fontWeight: 800, color: '#475569' }}>{atual.vendedor || '—'}</div>
                </div>
              </>
            ) : (
              <>
                <div>
                  <div style={{ fontSize: 12, color: '#94a3b8', fontWeight: 600 }}>PEDIDO</div>
                  <div style={{ fontSize: 24, fontWeight: 800, color: '#1a3a5c' }}>{atual.pedido_numero || '—'}</div>
                </div>
                <div>
                  <div style={{ fontSize: 12, color: '#94a3b8', fontWeight: 600 }}>OP</div>
                  <div style={{ fontSize: 24, fontWeight: 800, color: '#1a3a5c' }}>{atual.numero_op || '—'}</div>
                </div>
                <div>
                  <div style={{ fontSize: 12, color: '#94a3b8', fontWeight: 600 }}>ITEM</div>
                  <div style={{ fontSize: 24, fontWeight: 800, color: '#475569' }}>
                    {atual.qtd && atual.qtd > 1 ? `${atual.qtd} itens` : (atual.item_codigo || '—')}
                  </div>
                </div>
              </>
            )}
          </div>

          <div style={{ fontSize: 13, color: '#94a3b8', marginTop: 16 }}>
            por {atual.usuario_nome || 'Sistema'}
            {fila.length > 1 && <span style={{ marginLeft: 10, color: '#0d6efd', fontWeight: 700 }}>+{fila.length - 1} na fila</span>}
          </div>
        </div>
        <style>{`@keyframes notifFade { from { opacity:0 } to { opacity:1 } }`}</style>
      </div>
    );
  }

  // ── Modo TOAST (operadores no setor) ─────────────────────────────────────────
  if (toasts.length === 0) return null;
  return (
    <div style={{
      position: 'fixed', bottom: 24, right: 24, zIndex: 9999,
      display: 'flex', flexDirection: 'column-reverse', gap: 10, maxWidth: 340,
    }}>
      {toasts.map(t => (
        <div key={t.key} style={{
          position: 'relative', background: '#1a3a5c', color: '#fff', borderRadius: 10, padding: '12px 16px',
          boxShadow: '0 4px 20px rgba(0,0,0,0.25)', animation: 'slideIn .3s ease',
          borderLeft: `4px solid ${filtroSetor ? '#198754' : '#0d6efd'}`,
        }}>
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 4 }}>
            {STATUS_ICON[t.status_novo] || '🔄'} {filtroSetor ? 'Novo item no setor' : 'Movimentação'} — {t.pedido_numero}
          </div>
          <div style={{ fontSize: 12, color: '#b0c4de', marginBottom: 2 }}>
            <strong style={{ color: '#fff' }}>{t.item_codigo}</strong>{' → '}{STATUS_LABEL[t.status_novo] || t.status_novo}
          </div>
          {t.setor_destino && t.setor_destino !== t.setor_origem && !filtroSetor && (
            <div style={{ fontSize: 11, color: '#8ab4d8' }}>Setor: {nomeSetor(t.setor_destino)}</div>
          )}
          <div style={{ fontSize: 11, color: '#7a9bbf', marginTop: 4 }}>por {t.usuario_nome || 'Sistema'}</div>
          <button onClick={() => setToasts(p => p.filter(x => x.key !== t.key))}
            style={{ position: 'absolute', top: 8, right: 10, background: 'none', border: 'none', color: '#7a9bbf', cursor: 'pointer', fontSize: 14 }}>
            ✕
          </button>
        </div>
      ))}
      <style>{`@keyframes slideIn { from { opacity:0; transform:translateX(40px); } to { opacity:1; transform:translateX(0); } }`}</style>
    </div>
  );
}
