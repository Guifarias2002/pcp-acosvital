'use client';
import { useState, useEffect, useRef } from 'react';
import { getPedidos, editarPedido } from '@/lib/api';
import { FABRICAS } from '@/lib/types';

interface PedidoResumo {
  id: number;
  numero_pedido_venda: string;
  numero_op: string;
  cliente: string;
}

interface Props {
  titulo: string;
  roteiroProprio: string[];
  onClose: () => void;
  onSucesso: () => void;
}

const UNIDADES = ['un', 'kg', 'm', 'pc', 'jg', 'cx', 'lt'];

export default function AdicionarItemPedidoModal({ titulo, roteiroProprio, onClose, onSucesso }: Props) {
  const [busca, setBusca] = useState('');
  const [resultados, setResultados] = useState<PedidoResumo[]>([]);
  const [buscando, setBuscando] = useState(false);
  const [pedido, setPedido] = useState<PedidoResumo | null>(null);

  const [codigo, setCodigo] = useState('');
  const [descricao, setDescricao] = useState('');
  const [quantidade, setQuantidade] = useState('1');
  const [unidade, setUnidade] = useState('un');
  const [valorUnitario, setValorUnitario] = useState('');

  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState('');
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (busca.trim().length < 2) { setResultados([]); return; }
    debounceRef.current = setTimeout(async () => {
      setBuscando(true);
      try {
        const r = await getPedidos({ cliente: busca.trim() });
        setResultados((r.pedidos || []).slice(0, 8));
      } catch { /* ignore erro de busca */ }
      finally { setBuscando(false); }
    }, 350);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [busca]);

  function erroMsg(e: unknown) {
    const ax = e as { response?: { data?: { erro?: string } } };
    return ax?.response?.data?.erro || 'Erro ao adicionar item';
  }

  async function confirmar() {
    if (!pedido) return;
    if (!codigo.trim()) { setErro('Informe o código do item.'); return; }
    setErro('');
    setLoading(true);
    try {
      const fabrica = FABRICAS.find(f => roteiroProprio.some(s => f.setores.includes(s)))?.cod ?? FABRICAS[0].cod;
      await editarPedido(pedido.id, {
        itens: [{
          codigo: codigo.trim(),
          descricao: descricao.trim(),
          quantidade: Number(quantidade) || 1,
          unidade,
          valor_unitario: valorUnitario ? Number(valorUnitario) : null,
          roteiro_proprio: roteiroProprio,
          fabrica,
        }],
      });
      onSucesso();
    } catch (e: unknown) {
      setErro(erroMsg(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ background: '#fff', borderRadius: 12, width: '100%', maxWidth: 460, padding: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <h5 style={{ margin: 0, fontWeight: 700, color: '#1a3a5c' }}>
            <i className="bi bi-plus-circle" style={{ marginRight: 8, color: '#0d6efd' }} />
            {titulo}
          </h5>
          <button className="btn btn-ghost btn-sm" onClick={onClose} disabled={loading}>
            <i className="bi bi-x-lg" />
          </button>
        </div>

        {!pedido ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <label style={{ fontSize: 12, fontWeight: 600, color: '#374151' }}>
              Buscar pedido (PV, OP ou cliente)
            </label>
            <input
              autoFocus
              className="form-control"
              style={{ fontSize: 14, padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: 8 }}
              placeholder="Ex: 25744 ou nome do cliente"
              value={busca}
              onChange={e => setBusca(e.target.value)}
            />
            {buscando && <span style={{ fontSize: 12, color: '#9ca3af' }}>Buscando...</span>}
            {!buscando && busca.trim().length >= 2 && resultados.length === 0 && (
              <span style={{ fontSize: 12, color: '#9ca3af' }}>Nenhum pedido encontrado.</span>
            )}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 240, overflowY: 'auto' }}>
              {resultados.map(p => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setPedido(p)}
                  style={{ textAlign: 'left', padding: '10px 12px', borderRadius: 8, border: '1px solid #e5e7eb', background: '#fafafa', cursor: 'pointer' }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: '#1a3a5c' }}>
                    PV {p.numero_pedido_venda} <span style={{ fontWeight: 400, color: '#888' }}>· OP {p.numero_op}</span>
                  </div>
                  <div style={{ fontSize: 12, color: '#555' }}>{p.cliente}</div>
                </button>
              ))}
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 4 }}>
              <button className="btn btn-outline" onClick={onClose}>Cancelar</button>
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 8, padding: '8px 12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#1a3a5c' }}>PV {pedido.numero_pedido_venda} · OP {pedido.numero_op}</div>
                <div style={{ fontSize: 12, color: '#555' }}>{pedido.cliente}</div>
              </div>
              <button type="button" onClick={() => setPedido(null)} disabled={loading}
                style={{ background: 'none', border: 'none', color: '#0d6efd', fontSize: 12, cursor: 'pointer' }}>
                Trocar
              </button>
            </div>

            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 4 }}>
                Código <span style={{ color: '#dc3545' }}>*</span>
              </label>
              <input className="form-control" style={{ fontSize: 14, padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: 8 }}
                value={codigo} onChange={e => setCodigo(e.target.value)} disabled={loading} placeholder="Ex: TUBO-4POL" />
            </div>

            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 4 }}>Descrição</label>
              <input className="form-control" style={{ fontSize: 14, padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: 8 }}
                value={descricao} onChange={e => setDescricao(e.target.value)} disabled={loading} placeholder="Ex: Tubo 4 polegadas" />
            </div>

            <div style={{ display: 'flex', gap: 10 }}>
              <div style={{ flex: 1 }}>
                <label style={{ fontSize: 12, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 4 }}>Quantidade</label>
                <input type="number" min={1} className="form-control" style={{ fontSize: 14, padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: 8 }}
                  value={quantidade} onChange={e => setQuantidade(e.target.value)} disabled={loading} />
              </div>
              <div style={{ flex: 1 }}>
                <label style={{ fontSize: 12, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 4 }}>Unidade</label>
                <select className="form-control" style={{ fontSize: 14, padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: 8 }}
                  value={unidade} onChange={e => setUnidade(e.target.value)} disabled={loading}>
                  {UNIDADES.map(u => <option key={u} value={u}>{u}</option>)}
                </select>
              </div>
            </div>

            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 4 }}>
                Valor Unitário <span style={{ color: '#9ca3af' }}>(opcional)</span>
              </label>
              <input className="form-control" style={{ fontSize: 14, padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: 8 }}
                value={valorUnitario} onChange={e => setValorUnitario(e.target.value)} disabled={loading} placeholder="Ex: 150,00" />
            </div>

            {erro && (
              <div style={{ background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: 8, padding: '10px 14px', fontSize: 13, color: '#dc2626' }}>
                <i className="bi bi-exclamation-triangle" style={{ marginRight: 6 }} />{erro}
              </div>
            )}

            <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
              <button className="btn btn-outline" style={{ flex: 1 }} onClick={onClose} disabled={loading}>Cancelar</button>
              <button className="btn" style={{ flex: 2, background: '#0d6efd', color: '#fff', border: 'none' }} onClick={confirmar} disabled={loading}>
                {loading ? <><i className="bi bi-hourglass-split" /> Adicionando...</> : <><i className="bi bi-plus-lg" /> Adicionar Item</>}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
