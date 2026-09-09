'use client';
import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import AuthGuard from '@/components/AuthGuard';
import DestinoSetorPicker from '@/components/DestinoSetorPicker';
import ObservacaoPedidoModal from '@/components/ObservacaoPedidoModal';
import { getNaoLocalizados, parcialAcaoLote } from '@/lib/api';
import { getUser, podeVerNaoLocalizados, podeEditar } from '@/lib/auth';
import { NOMES, SETOR_NAO_LOCALIZADO } from '@/lib/types';

interface Material {
  parcial_id: number;
  item_pedido_id: number;
  codigo: string;
  descricao: string;
  quantidade: string;
  unidade: string;
  veio_de: string;
  veio_de_nome: string;
}
interface PedidoNL {
  pedido_id: number;
  numero_pedido_venda: string;
  numero_op: string | null;
  cliente: string;
  prioridade: string;
  pedido_prazo: string | null;
  veio_de: string;
  veio_de_nome: string;
  marcado_em: string | null;
  marcado_por: string | null;
  roteiro: string[];
  parcial_ids: number[];
  materiais: Material[];
}

function fmtHora(s: string | null) {
  if (!s) return '';
  const d = new Date(s);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleDateString('pt-BR') + ' ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

const PRIO_COLOR: Record<string, string> = {
  baixa: '#6b7280', normal: '#2563eb', alta: '#d97706', urgente: '#dc2626',
};

export default function NaoLocalizadosPage() {
  const [pedidos, setPedidos] = useState<PedidoNL[]>([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [expandido, setExpandido] = useState<number | null>(null);
  // Pedido em reencaminhamento: guarda o pedido e o setor de destino escolhido.
  const [reenc, setReenc] = useState<PedidoNL | null>(null);
  const [destino, setDestino] = useState<string>('');
  const [enviando, setEnviando] = useState(false);
  // Observação do pedido (abre o ObservacaoPedidoModal).
  const [obsPedido, setObsPedido] = useState<{ pedidoId: number; numero: string } | null>(null);
  const router = useRouter();

  // Gate por permissão: admin OU quem tem a flag pode_ver_nao_localizados
  // (ex.: Ezequiel). Sem a flag, volta pra home.
  useEffect(() => {
    if (!podeVerNaoLocalizados(getUser())) router.replace('/');
  }, [router]);

  const carregar = useCallback(() => {
    getNaoLocalizados()
      .then(d => { setPedidos(d.pedidos || []); setErro(null); })
      .catch(() => setErro('Não foi possível carregar os pedidos não localizados.'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    carregar();
    const t = setInterval(carregar, 20000);
    return () => clearInterval(t);
  }, [carregar]);

  function abrirReencaminhar(p: PedidoNL) {
    setReenc(p);
    setDestino(p.veio_de || ''); // sugere de onde veio
  }

  async function confirmarReencaminhar() {
    if (!reenc || !destino) return;
    setEnviando(true);
    try {
      const r = await parcialAcaoLote(reenc.parcial_ids, 'mover', { setor_destino: destino });
      if (!r.ok && r.falhas > 0) {
        setErro(`Alguns materiais não puderam ser reencaminhados (${r.falhas} de ${r.total}).`);
      }
      setReenc(null);
      setDestino('');
      carregar();
    } catch {
      setErro('Erro ao reencaminhar. Tente novamente.');
    } finally {
      setEnviando(false);
    }
  }

  const totalMateriais = pedidos.reduce((s, p) => s + p.materiais.length, 0);

  return (
    <AuthGuard>
      {erro && (
        <div style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#dc2626', borderRadius: 8, padding: '12px 16px', fontSize: 13, marginBottom: 16 }}>
          <i className="bi bi-exclamation-triangle" style={{ marginRight: 6 }} />
          {erro}
          <button onClick={() => setErro(null)} style={{ float: 'right', background: 'none', border: 'none', cursor: 'pointer', color: '#dc2626', fontWeight: 700 }}>×</button>
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8, flexWrap: 'wrap', gap: 10 }}>
        <div>
          <h4 style={{ margin: 0, fontWeight: 700, color: '#1a3a5c', fontSize: 20 }}>
            <i className="bi bi-geo-alt-fill" style={{ marginRight: 8, color: '#b45309' }} />
            Pedidos Não Localizados
          </h4>
          <small style={{ color: '#888' }}>
            Pedidos que estão no sistema mas não foram achados fisicamente no setor — só administradores veem aqui.
          </small>
        </div>
        <button onClick={carregar}
          style={{ background: 'none', border: '1px solid #dee2e6', borderRadius: 5, padding: '5px 14px', fontSize: 13, color: '#0d6efd', cursor: 'pointer' }}>
          <i className="bi bi-arrow-clockwise" style={{ marginRight: 4 }}></i>Atualizar
        </button>
      </div>

      <div style={{ fontSize: 12, color: '#64748b', marginBottom: 18 }}>
        {loading ? 'Carregando…' : `${pedidos.length} pedido(s) · ${totalMateriais} material(is)`}
      </div>

      {!loading && pedidos.length === 0 && (
        <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', color: '#166534', borderRadius: 10, padding: '22px 20px', textAlign: 'center', fontSize: 14, fontWeight: 600 }}>
          <i className="bi bi-check-circle-fill" style={{ marginRight: 8, fontSize: 18 }} />
          Nenhum pedido não localizado — tudo em ordem.
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {pedidos.map(p => {
          const aberto = expandido === p.pedido_id;
          const prio = (p.prioridade || 'normal').toLowerCase();
          return (
            <div key={p.pedido_id} style={{ background: '#fff', border: '1px solid #e5e7eb', borderLeft: '4px solid #b45309', borderRadius: 10, boxShadow: '0 1px 2px rgba(0,0,0,.04)', overflow: 'hidden' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px', flexWrap: 'wrap' }}>
                <button onClick={() => setExpandido(aberto ? null : p.pedido_id)}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', fontSize: 16, padding: 0 }}
                  title={aberto ? 'Recolher' : 'Ver materiais'}>
                  <i className={`bi ${aberto ? 'bi-chevron-down' : 'bi-chevron-right'}`} />
                </button>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <span style={{ fontWeight: 700, color: '#1a3a5c', fontSize: 16 }}>
                      Pedido de Venda {p.numero_pedido_venda}
                    </span>
                    {prio === 'urgente' && (
                      <span style={{ fontSize: 10, fontWeight: 800, color: '#fff', background: PRIO_COLOR.urgente, padding: '2px 8px', borderRadius: 10, textTransform: 'uppercase' }}>Urgente</span>
                    )}
                    <span style={{ fontSize: 12, color: '#64748b' }}>{p.materiais.length} material(is)</span>
                  </div>
                  <div style={{ fontSize: 12.5, color: '#475569', marginTop: 3, display: 'flex', gap: 14, flexWrap: 'wrap' }}>
                    {p.cliente && <span><i className="bi bi-person" style={{ marginRight: 4 }} />{p.cliente}</span>}
                    <span>
                      <i className="bi bi-box-arrow-right" style={{ marginRight: 4, color: '#b45309' }} />
                      Veio de: <b style={{ color: '#b45309' }}>{p.veio_de_nome}</b>
                    </span>
                    {p.marcado_em && (
                      <span style={{ color: '#94a3b8' }}>
                        <i className="bi bi-clock" style={{ marginRight: 4 }} />
                        {fmtHora(p.marcado_em)}{p.marcado_por ? ` · ${p.marcado_por}` : ''}
                      </span>
                    )}
                  </div>
                </div>
                <button onClick={() => setObsPedido({ pedidoId: p.pedido_id, numero: p.numero_pedido_venda })}
                  title="Observação do pedido"
                  style={{ background: '#fff', color: '#334155', border: '1px solid #cbd5e1', borderRadius: 6, padding: '8px 12px', fontSize: 13, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }}>
                  <i className="bi bi-chat-left-text" style={{ marginRight: 6 }} />Observação
                </button>
                <button onClick={() => abrirReencaminhar(p)}
                  style={{ background: '#1d4ed8', color: '#fff', border: 'none', borderRadius: 6, padding: '8px 16px', fontSize: 13, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }}>
                  <i className="bi bi-send" style={{ marginRight: 6 }} />Reencaminhar
                </button>
              </div>

              {aberto && (
                <div style={{ borderTop: '1px solid #eef2f7', background: '#fafbfc', padding: '10px 16px' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                    <thead>
                      <tr style={{ color: '#64748b', textAlign: 'left', fontSize: 11.5, textTransform: 'uppercase', letterSpacing: .3 }}>
                        <th style={{ padding: '6px 8px' }}>Código</th>
                        <th style={{ padding: '6px 8px' }}>Descrição</th>
                        <th style={{ padding: '6px 8px', textAlign: 'right' }}>Qtd</th>
                        <th style={{ padding: '6px 8px' }}>Veio de</th>
                      </tr>
                    </thead>
                    <tbody>
                      {p.materiais.map(m => (
                        <tr key={m.parcial_id} style={{ borderTop: '1px solid #eef2f7' }}>
                          <td style={{ padding: '7px 8px', fontWeight: 600, color: '#1a3a5c', whiteSpace: 'nowrap' }}>{m.codigo}</td>
                          <td style={{ padding: '7px 8px', color: '#334155' }}>{m.descricao}</td>
                          <td style={{ padding: '7px 8px', textAlign: 'right', whiteSpace: 'nowrap' }}>{m.quantidade} {m.unidade}</td>
                          <td style={{ padding: '7px 8px', color: '#b45309' }}>{m.veio_de_nome}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Modal de reencaminhamento */}
      {reenc && (
        <div onClick={() => !enviando && setReenc(null)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)', zIndex: 10000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div onClick={e => e.stopPropagation()}
            style={{ background: '#fff', borderRadius: 12, padding: 22, width: '100%', maxWidth: 460, boxShadow: '0 10px 40px rgba(0,0,0,.3)', maxHeight: '90vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
              <h5 style={{ margin: 0, fontWeight: 700, color: '#1a3a5c' }}>
                <i className="bi bi-send" style={{ marginRight: 8 }} />Reencaminhar pedido {reenc.numero_pedido_venda}
              </h5>
              <button onClick={() => !enviando && setReenc(null)} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: '#888' }}>✕</button>
            </div>
            <p style={{ fontSize: 12.5, color: '#64748b', margin: '0 0 14px' }}>
              Achou o material? Escolha pra qual área/setor ele volta. Serão movidos os {reenc.parcial_ids.length} material(is) deste pedido.
            </p>
            <DestinoSetorPicker
              setorAtual={SETOR_NAO_LOCALIZADO}
              roteiro={reenc.roteiro}
              proximoSetor={reenc.veio_de || null}
              value={destino}
              onChange={setDestino}
            />
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 18 }}>
              <button onClick={() => setReenc(null)} disabled={enviando}
                style={{ background: '#f0f0f0', color: '#333', border: 'none', borderRadius: 6, padding: '9px 18px', fontSize: 13, fontWeight: 600, cursor: enviando ? 'not-allowed' : 'pointer' }}>Cancelar</button>
              <button onClick={confirmarReencaminhar} disabled={enviando || !destino}
                style={{ background: (enviando || !destino) ? '#9ca3af' : '#1d4ed8', color: '#fff', border: 'none', borderRadius: 6, padding: '9px 20px', fontSize: 13, fontWeight: 700, cursor: (enviando || !destino) ? 'not-allowed' : 'pointer' }}>
                <i className="bi bi-send" style={{ marginRight: 6 }} />
                {enviando ? 'Enviando…' : `Enviar para ${destino ? (NOMES[destino] || destino) : '…'}`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Observação do pedido (mesmo modal da tela do setor) */}
      {obsPedido && (
        <ObservacaoPedidoModal
          pedidoId={obsPedido.pedidoId}
          numero={obsPedido.numero}
          editavel={podeEditar()}
          onClose={() => setObsPedido(null)}
        />
      )}
    </AuthGuard>
  );
}
