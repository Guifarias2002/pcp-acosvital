'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import AuthGuard from '@/components/AuthGuard';
import { getPedido, editarPedido, api } from '@/lib/api';
import { SETOR_CHOICES } from '@/lib/types';
import { getUser } from '@/lib/auth';

interface ItemForm {
  id?: number;
  codigo: string;
  descricao: string;
  quantidade: string;
  unidade: string;
  valor_unitario: string;
  roteiro_proprio: string[];
  _remover?: boolean;
}

const UNIDADES = ['un', 'kg', 'm', 'pc', 'jg', 'cx', 'lt'];

export default function EditarPedidoPage({ params }: { params: { id: string } }) {
  const { id } = params;
  const router = useRouter();
  const user = getUser();
  const isAdmin = user?.is_staff;

  const [loading, setLoading] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');

  const [pv, setPv] = useState('');
  const [op, setOp] = useState('');
  const [cliente, setCliente] = useState('');
  const [vendedor, setVendedor] = useState('');
  const [prazo, setPrazo] = useState('');
  const [prioridade, setPrioridade] = useState('normal');
  const [obs, setObs] = useState('');
  const [roteiro, setRoteiro] = useState<string[]>(['emissao']);
  const [itens, setItens] = useState<ItemForm[]>([]);

  useEffect(() => {
    getPedido(Number(id)).then((pedido) => {
      setPv(pedido.numero_pedido_venda || '');
      setOp(pedido.numero_op || '');
      setCliente(pedido.cliente || '');
      setVendedor(pedido.vendedor || '');
      setPrazo(pedido.prazo_entrega?.slice(0, 10) || '');
      setPrioridade(pedido.prioridade || 'normal');
      setObs(pedido.observacoes || '');
      setRoteiro(pedido.roteiro_base || ['emissao']);
      setItens((pedido.itens || []).map((i: Record<string, unknown>) => ({
        id: i.id as number,
        codigo: String(i.codigo || ''),
        descricao: String(i.descricao || ''),
        quantidade: String(i.quantidade || '1'),
        unidade: String(i.unidade || 'un'),
        valor_unitario: i.valor_unitario ? String(i.valor_unitario) : '',
        roteiro_proprio: (i.roteiro_proprio as string[]) || [],
      })));
      setLoading(false);
    }).catch(() => {
      setErro('Erro ao carregar pedido.');
      setLoading(false);
    });
  }, [id]);

  function toggleSetor(cod: string) {
    if (cod === 'emissao') return;
    setRoteiro(prev => prev.includes(cod) ? prev.filter(s => s !== cod) : [...prev, cod]);
  }

  function addItem() {
    setItens(prev => [...prev, { codigo: '', descricao: '', quantidade: '1', unidade: 'un', valor_unitario: '', roteiro_proprio: [] }]);
  }

  function remItem(i: number) {
    setItens(prev => prev.map((it, idx) => idx === i ? { ...it, _remover: true } : it));
  }

  function setItemField(i: number, field: keyof ItemForm, val: string) {
    setItens(prev => prev.map((it, idx) => idx === i ? { ...it, [field]: val } : it));
  }

  function bloquearEnter(e: React.KeyboardEvent<HTMLFormElement>) {
    const target = e.target as HTMLElement;
    if (e.key === 'Enter' && target.tagName !== 'TEXTAREA') {
      e.preventDefault();
      setErro('Informações incompletas. Revise os campos e clique em "Salvar Alterações" para confirmar.');
    }
  }

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    setErro('');
    setSalvando(true);
    try {
      await editarPedido(Number(id), {
        numero_pedido_venda: pv,
        numero_op: op,
        cliente,
        vendedor,
        prazo_entrega: prazo,
        prioridade,
        roteiro_base: roteiro,
        observacoes: obs,
        itens: itens.map(i => ({
          id: i.id,
          codigo: i.codigo,
          descricao: i.descricao,
          quantidade: Number(i.quantidade),
          unidade: i.unidade,
          valor_unitario: i.valor_unitario ? Number(String(i.valor_unitario).replace(',', '.')) : null,
          roteiro_proprio: i.roteiro_proprio,
          _remover: i._remover,
        })),
      });
      router.push(`/pedidos/${id}`);
    } catch (e: unknown) {
      setErro((e as { response?: { data?: { erro?: string } } }).response?.data?.erro || 'Erro ao salvar');
    } finally {
      setSalvando(false);
    }
  }

  const inputCls = 'mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-400 bg-white';
  const labelCls = 'text-xs font-semibold text-gray-500 uppercase tracking-wide';

  if (loading) return (
    <AuthGuard>
      <div style={{ padding: 40, textAlign: 'center', color: '#888' }}>Carregando...</div>
    </AuthGuard>
  );

  const itensVisiveis = itens.filter(i => !i._remover);

  return (
    <AuthGuard adminOnly>
      <form onSubmit={salvar} onKeyDown={bloquearEnter}>
        {/* Barra de topo */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <a href={`/pedidos/${id}`} style={{ color: '#888', fontSize: 13, textDecoration: 'none' }}>← Voltar</a>
            <h1 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: '#1a3a5c' }}>
              <i className="bi bi-pencil-square" style={{ marginRight: 8 }} />
              Editar Pedido
            </h1>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <a href={`/pedidos/${id}`} style={{ padding: '8px 18px', borderRadius: 8, border: '1px solid #dee2e6', fontSize: 13, color: '#555', textDecoration: 'none', fontWeight: 600 }}>
              Cancelar
            </a>
            <button type="submit" disabled={salvando}
              style={{ padding: '8px 24px', borderRadius: 8, background: '#1a3a5c', color: '#fff', fontSize: 13, fontWeight: 700, border: 'none', cursor: 'pointer', opacity: salvando ? 0.6 : 1 }}>
              <i className="bi bi-check-lg" style={{ marginRight: 6 }} />
              {salvando ? 'Salvando...' : 'Salvar Alterações'}
            </button>
          </div>
        </div>

        {erro && (
          <div style={{ background: '#fef2f2', border: '1px solid #fca5a5', color: '#dc2626', borderRadius: 8, padding: '10px 14px', fontSize: 13, marginBottom: 16 }}>
            <i className="bi bi-exclamation-circle" style={{ marginRight: 6 }} />{erro}
          </div>
        )}

        <div className="novo-pedido-grid">
          {/* COLUNA ESQUERDA */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

            {/* Identificação */}
            <div className="card" style={{ padding: 20 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#1a3a5c', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 14, borderBottom: '2px solid #1a3a5c', paddingBottom: 6 }}>
                <i className="bi bi-card-heading" style={{ marginRight: 6 }} />Identificação
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label className={labelCls}>Nº PV *</label>
                  <input value={pv} onChange={e => setPv(e.target.value)} required placeholder="PV-001" className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>Nº OP</label>
                  <input value={op} onChange={e => setOp(e.target.value)} placeholder="OP-001" className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>Cliente *</label>
                  <input value={cliente} onChange={e => setCliente(e.target.value)} required className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>Vendedor</label>
                  <input value={vendedor} onChange={e => setVendedor(e.target.value)} className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>Prazo de Entrega *</label>
                  <input type="date" value={prazo} onChange={e => setPrazo(e.target.value)} required className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>Prioridade</label>
                  <select value={prioridade} onChange={e => setPrioridade(e.target.value)} className={inputCls}>
                    <option value="baixa">Baixa</option>
                    <option value="normal">Normal</option>
                    <option value="alta">Alta</option>
                    <option value="urgente">Urgente</option>
                  </select>
                </div>
                <div style={{ gridColumn: '1 / -1' }}>
                  <label className={labelCls}>Observações</label>
                  <textarea value={obs} onChange={e => setObs(e.target.value)} rows={2} className={inputCls} style={{ resize: 'vertical' }} />
                </div>
              </div>
            </div>

            {/* Itens */}
            <div className="card" style={{ padding: 20 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14, borderBottom: '2px solid #1a3a5c', paddingBottom: 6 }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: '#1a3a5c', textTransform: 'uppercase', letterSpacing: 1 }}>
                  <i className="bi bi-list-ul" style={{ marginRight: 6 }} />Itens do Pedido
                </span>
                <button type="button" onClick={addItem}
                  style={{ background: '#198754', color: '#fff', border: 'none', borderRadius: 6, padding: '5px 12px', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
                  <i className="bi bi-plus-lg" style={{ marginRight: 4 }} />Adicionar Item
                </button>
              </div>

              {itensVisiveis.length === 0 && (
                <p style={{ color: '#aaa', fontSize: 13, textAlign: 'center', padding: '20px 0' }}>Nenhum item. Adicione pelo menos um.</p>
              )}

              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {itens.map((item, i) => item._remover ? null : (
                  <div key={i} style={{ border: '1px solid #e9ecef', borderRadius: 8, padding: 12, background: item.id ? '#f8faff' : '#f0fff4' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                      <span style={{ fontSize: 11, fontWeight: 700, color: '#1a3a5c' }}>
                        <i className="bi bi-box" style={{ marginRight: 5 }} />
                        {item.id ? `Item existente` : 'Novo item'}
                        {item.id && <span style={{ color: '#888', fontWeight: 400, marginLeft: 6 }}>ID #{item.id}</span>}
                      </span>
                      <button type="button" onClick={() => remItem(i)}
                        style={{ background: '#fee2e2', color: '#dc2626', border: 'none', borderRadius: 5, padding: '3px 8px', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>
                        <i className="bi bi-trash" style={{ marginRight: 3 }} />Remover
                      </button>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr 1fr 1fr 1fr', gap: 8 }}>
                      <div>
                        <label className={labelCls}>Código *</label>
                        <input value={item.codigo} onChange={e => setItemField(i, 'codigo', e.target.value)}
                          placeholder="COD-001" className={inputCls} />
                      </div>
                      <div>
                        <label className={labelCls}>Descrição</label>
                        <input value={item.descricao} onChange={e => setItemField(i, 'descricao', e.target.value)}
                          placeholder="Descrição do item" className={inputCls} />
                      </div>
                      <div>
                        <label className={labelCls}>Quantidade</label>
                        <input type="number" min="1" value={item.quantidade} onChange={e => setItemField(i, 'quantidade', e.target.value)}
                          className={inputCls} />
                      </div>
                      <div>
                        <label className={labelCls}>Unidade</label>
                        <select value={item.unidade} onChange={e => setItemField(i, 'unidade', e.target.value)} className={inputCls}>
                          {UNIDADES.map(u => <option key={u} value={u}>{u}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className={labelCls}>Valor Unit. (R$)</label>
                        <input value={item.valor_unitario} onChange={e => setItemField(i, 'valor_unitario', e.target.value)}
                          placeholder="0,00" className={inputCls} />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* COLUNA DIREITA — Roteiro */}
          <div>
            <div className="card" style={{ padding: 20, position: 'sticky', top: 16, maxHeight: 'calc(100vh - 80px)', overflowY: 'auto' }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#1a3a5c', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 14, borderBottom: '2px solid #1a3a5c', paddingBottom: 6 }}>
                <i className="bi bi-arrow-right-circle" style={{ marginRight: 6 }} />Roteiro de Produção *
              </div>
              <p style={{ fontSize: 12, color: '#888', margin: '0 0 12px' }}>
                Clique nos setores na ordem em que o pedido deve passar:
              </p>
              {(() => {
                const selecionados = roteiro
                  .filter(c => SETOR_CHOICES.some(([cod]) => cod === c))
                  .map(c => SETOR_CHOICES.find(([cod]) => cod === c)!);
                const naoSelecionados = SETOR_CHOICES.filter(([c]) => !roteiro.includes(c));
                const lista = [...selecionados, ...naoSelecionados];
                return (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, paddingLeft: 14 }}>
                  {lista.map(([cod, nome]) => {
                    const selecionado = roteiro.includes(cod);
                    const fixo = cod === 'emissao';
                    const pos = roteiro.indexOf(cod);
                    return (
                      <div key={cod} style={{ position: 'relative' }}>
                        {selecionado && (
                          <span style={{
                            position: 'absolute', left: -14, top: '50%', transform: 'translateY(-50%)',
                            width: 24, height: 24, borderRadius: '50%',
                            background: fixo ? '#fff' : '#1a3a5c',
                            color: fixo ? '#1a3a5c' : '#fff',
                            border: '2px solid #1a3a5c',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontSize: 11, fontWeight: 800, zIndex: 1,
                          }}>
                            {pos + 1}
                          </span>
                        )}
                        <button type="button" onClick={() => toggleSetor(cod)}
                          disabled={fixo}
                          style={{
                            width: '100%', display: 'flex', alignItems: 'center', gap: 10,
                            padding: '9px 12px', borderRadius: 8, border: '1px solid',
                            borderColor: selecionado ? '#1a3a5c' : '#e5e7eb',
                            background: fixo ? '#1a3a5c' : selecionado ? '#eef2ff' : '#fff',
                            color: fixo ? '#fff' : selecionado ? '#1a3a5c' : '#666',
                            cursor: fixo ? 'default' : 'pointer',
                            fontWeight: selecionado ? 700 : 400,
                            fontSize: 13, textAlign: 'left', transition: 'all .15s',
                          }}>
                          {!selecionado && (
                            <span style={{ width: 16, height: 16, borderRadius: '50%', border: '1px dashed #ccc', flexShrink: 0 }} />
                          )}
                          <span style={{ flex: 1 }}>{nome}</span>
                          {fixo && <i className="bi bi-lock-fill" style={{ fontSize: 11, opacity: .6 }} />}
                          {selecionado && !fixo && <i className="bi bi-check2" style={{ color: '#1a3a5c', fontSize: 14 }} />}
                        </button>
                      </div>
                    );
                  })}
                </div>
                );
              })()}

              {roteiro.length > 1 && (
                <div style={{ marginTop: 16, padding: '10px 12px', background: '#f0f4ff', borderRadius: 8, fontSize: 12, color: '#1a3a5c' }}>
                  <strong>Fluxo:</strong><br />
                  <span style={{ lineHeight: 2 }}>
                    {roteiro.map((s, i) => {
                      const nome = SETOR_CHOICES.find(([c]) => c === s)?.[1];
                      return (
                        <span key={s}>
                          <span style={{ background: '#1a3a5c', color: '#fff', borderRadius: 4, padding: '1px 7px', fontSize: 11 }}>{nome}</span>
                          {i < roteiro.length - 1 && <span style={{ margin: '0 4px', color: '#aaa' }}>→</span>}
                        </span>
                      );
                    })}
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>
      </form>
    </AuthGuard>
  );
}
