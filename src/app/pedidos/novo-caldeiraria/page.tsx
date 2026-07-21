'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import AuthGuard from '@/components/AuthGuard';

import { criarPedido } from '@/lib/api';

interface ItemForm { codigo: string; descricao: string; quantidade: string; unidade: string; valor_unitario: string; }

const UNIDADES = ['un', 'kg', 'm', 'pc', 'jg', 'cx', 'lt'];

function fmtBRL(n: number) {
  return n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function parseVal(s: string): number {
  const str = String(s ?? '').trim();
  if (!str) return 0;
  const hasComma = str.includes(',');
  const hasDot   = str.includes('.');
  let norm: string;
  if (hasComma && hasDot) {
    norm = str.lastIndexOf(',') > str.lastIndexOf('.')
      ? str.replace(/\./g, '').replace(',', '.')
      : str.replace(/,/g, '');
  } else if (hasComma) {
    norm = str.replace(',', '.');
  } else {
    norm = str;
  }
  const n = parseFloat(norm);
  return isNaN(n) ? 0 : n;
}

// Ordem avulsa que nasce direto na Caldeiraria — não segue o processo de
// Flanges (Usinagem, Cortes, Furação...), por isso é uma tela própria e mais
// enxuta, sem importação de Excel nem escolha de roteiro entre setores: o
// roteiro é sempre fixo Emissão → Caldeiraria.
export default function NovoPedidoCaldeirariaPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState('');

  const [pv, setPv] = useState('');
  const [op, setOp] = useState('');
  const [cliente, setCliente] = useState('');
  const [vendedor, setVendedor] = useState('');
  const [prazo, setPrazo] = useState('');
  const [prioridade, setPrioridade] = useState('normal');
  const [obs, setObs] = useState('');
  const [itens, setItens] = useState<ItemForm[]>([{ codigo: '', descricao: '', quantidade: '1', unidade: 'un', valor_unitario: '' }]);

  function addItem() {
    setItens(prev => [...prev, { codigo: '', descricao: '', quantidade: '1', unidade: 'un', valor_unitario: '' }]);
  }
  function remItem(i: number) {
    setItens(prev => prev.filter((_, idx) => idx !== i));
  }
  function setItemField(i: number, field: keyof ItemForm, val: string) {
    setItens(prev => prev.map((it, idx) => idx === i ? { ...it, [field]: val } : it));
  }

  const totalGeral = itens.reduce((acc, it) => {
    const qty = parseFloat(it.quantidade) || 0;
    const val = parseVal(it.valor_unitario);
    return acc + qty * val;
  }, 0);

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    if (!op.trim()) { setErro('O Número da Ordem de Produção (OP) é obrigatório.'); return; }
    setErro('');
    setLoading(true);
    try {
      await Promise.race([
        fetch('/api/health').catch(() => {}),
        new Promise(resolve => setTimeout(resolve, 3000)),
      ]);

      const controller = new AbortController();
      const tmo = setTimeout(() => controller.abort(), 15000);
      let id: number;
      try {
        const res = await criarPedido({
          numero_pedido_venda: pv, numero_op: op, cliente, vendedor,
          prazo_entrega: prazo, prioridade, roteiro_base: ['emissao', 'caldeiraria'],
          observacoes: obs,
          itens: itens.filter(i => i.codigo).map(i => ({
            ...i,
            quantidade: Number(i.quantidade),
            valor_unitario: i.valor_unitario ? parseVal(i.valor_unitario) : null,
          })),
        });
        id = res.id;
      } finally {
        clearTimeout(tmo);
      }
      router.push(`/pedidos/${id}`);
    } catch (e: unknown) {
      const isAbort = (e as Error)?.name === 'AbortError' || (e as Error)?.message?.includes('aborted');
      if (isAbort) {
        setErro('A requisição demorou demais. Verifique sua conexão e tente novamente.');
      } else {
        const msg = (e as {response?:{data?:{erro?:string}}}).response?.data?.erro;
        setErro(msg || 'Erro ao salvar pedido. Tente novamente.');
      }
    } finally {
      setLoading(false);
    }
  }

  const inputCls = 'mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-400 bg-white';
  const labelCls = 'text-xs font-semibold text-gray-500 uppercase tracking-wide';

  return (
    <AuthGuard adminOnly>
      <style>{`
        .npc-ident-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 12px;
        }
        .npc-item-grid {
          display: grid;
          grid-template-columns: 1fr 2fr 90px 90px 110px;
          gap: 8px;
        }
        @media (max-width: 768px) {
          .npc-ident-grid { grid-template-columns: 1fr; }
          .npc-item-grid { grid-template-columns: 1fr 1fr; }
          .npc-item-grid .npc-col-descricao,
          .npc-item-grid .npc-col-val { grid-column: 1 / -1; }
        }
      `}</style>

      <form onSubmit={salvar}>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:20, flexWrap:'wrap', gap:10 }}>
          <div style={{ display:'flex', alignItems:'center', gap:12, flexWrap:'wrap' }}>
            <a href="/setor/caldeiraria" style={{ color:'#888', fontSize:13, textDecoration:'none' }}>← Caldeiraria</a>
            <h1 style={{ margin:0, fontSize:18, fontWeight:800, color:'#1a3a5c' }}>
              <i className="bi bi-hammer" style={{ marginRight:8 }} />
              Nova Ordem — Caldeiraria
            </h1>
          </div>
          <div style={{ display:'flex', gap:8 }}>
            <a href="/setor/caldeiraria" style={{ padding:'9px 18px', borderRadius:8, border:'1px solid #dee2e6', fontSize:13, color:'#555', textDecoration:'none', fontWeight:600, display:'inline-flex', alignItems:'center' }}>
              Cancelar
            </a>
            <button type="submit" disabled={loading}
              style={{ padding:'9px 24px', borderRadius:8, background:'#1a3a5c', color:'#fff', fontSize:13, fontWeight:700, border:'none', cursor:'pointer', opacity:loading?0.6:1 }}>
              <i className="bi bi-check-lg" style={{ marginRight:6 }} />
              {loading ? 'Salvando...' : 'Salvar Pedido'}
            </button>
          </div>
        </div>

        {erro && (
          <div style={{ background:'#fef2f2', border:'1px solid #fca5a5', color:'#dc2626', borderRadius:8, padding:'10px 14px', fontSize:13, marginBottom:16 }}>
            <i className="bi bi-exclamation-circle" style={{ marginRight:6 }} />{erro}
          </div>
        )}

        <div style={{ display:'flex', flexDirection:'column', gap:16, maxWidth: 760 }}>

          {/* Identificação */}
          <div className="card" style={{ padding:20 }}>
            <div style={{ fontSize:11, fontWeight:700, color:'#1a3a5c', textTransform:'uppercase', letterSpacing:1, marginBottom:14, borderBottom:'2px solid #1a3a5c', paddingBottom:6 }}>
              <i className="bi bi-card-heading" style={{ marginRight:6 }} />Identificação
            </div>
            <div className="npc-ident-grid">
              <div>
                <label className={labelCls}>Nº PV *</label>
                <input value={pv} onChange={e => setPv(e.target.value)} required placeholder="PV-001" className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Nº OP *</label>
                <input value={op} onChange={e => setOp(e.target.value)} placeholder="OP-001" required
                  style={{ borderColor: op.trim() ? undefined : '#fca5a5' }}
                  className={inputCls} />
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
              <div style={{ gridColumn:'1 / -1' }}>
                <label className={labelCls}>Observações</label>
                <textarea value={obs} onChange={e => setObs(e.target.value)} rows={2} className={inputCls} style={{ resize:'vertical' }} />
              </div>
            </div>
          </div>

          {/* Itens */}
          <div className="card" style={{ padding:20 }}>
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:14, borderBottom:'2px solid #1a3a5c', paddingBottom:6, flexWrap:'wrap', gap:8 }}>
              <span style={{ fontSize:11, fontWeight:700, color:'#1a3a5c', textTransform:'uppercase', letterSpacing:1 }}>
                <i className="bi bi-list-ul" style={{ marginRight:6 }} />Itens do Pedido
              </span>
              <button type="button" onClick={addItem}
                style={{ background:'#198754', color:'#fff', border:'none', borderRadius:6, padding:'6px 14px', fontSize:12, fontWeight:700, cursor:'pointer' }}>
                <i className="bi bi-plus-lg" style={{ marginRight:4 }} />Adicionar Item
              </button>
            </div>
            <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
              {itens.map((item, i) => {
                const subTotal = (parseFloat(item.quantidade) || 0) * parseVal(item.valor_unitario);
                return (
                  <div key={i} style={{ border:'1px solid #e9ecef', borderRadius:8, padding:12, background:'#f8faff' }}>
                    <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:8 }}>
                      <span style={{ fontSize:11, fontWeight:700, color:'#1a3a5c' }}>
                        <i className="bi bi-box" style={{ marginRight:5 }} />Item {i + 1}
                      </span>
                      <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                        {subTotal > 0 && (
                          <span style={{ fontSize:12, fontWeight:700, color:'#198754' }}>
                            R$ {fmtBRL(subTotal)}
                          </span>
                        )}
                        {itens.length > 1 && (
                          <button type="button" onClick={() => remItem(i)}
                            style={{ background:'#fee2e2', color:'#dc2626', border:'none', borderRadius:5, padding:'3px 8px', fontSize:11, fontWeight:600, cursor:'pointer' }}>
                            <i className="bi bi-trash" style={{ marginRight:3 }} />Remover
                          </button>
                        )}
                      </div>
                    </div>
                    <div className="npc-item-grid">
                      <div>
                        <label className={labelCls}>Código *</label>
                        <input value={item.codigo} onChange={e => setItemField(i, 'codigo', e.target.value)}
                          placeholder="Ex: TUBO-4POL" className={inputCls} />
                      </div>
                      <div className="npc-col-descricao">
                        <label className={labelCls}>Descrição</label>
                        <input value={item.descricao} onChange={e => setItemField(i, 'descricao', e.target.value)}
                          placeholder="Ex: Tubo 4 polegadas" className={inputCls} />
                      </div>
                      <div>
                        <label className={labelCls}>Qtd</label>
                        <input type="number" min="1" value={item.quantidade} onChange={e => setItemField(i, 'quantidade', e.target.value)}
                          className={inputCls} />
                      </div>
                      <div>
                        <label className={labelCls}>Un.</label>
                        <select value={item.unidade} onChange={e => setItemField(i, 'unidade', e.target.value)} className={inputCls}>
                          {UNIDADES.map(u => <option key={u} value={u}>{u}</option>)}
                        </select>
                      </div>
                      <div className="npc-col-val">
                        <label className={labelCls}>Valor Unit. (R$)</label>
                        <input value={item.valor_unitario} onChange={e => setItemField(i, 'valor_unitario', e.target.value)}
                          placeholder="0,00" className={inputCls} />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {totalGeral > 0 && (
              <div style={{ marginTop:14, display:'flex', justifyContent:'flex-end', borderTop:'1px solid #e9ecef', paddingTop:12 }}>
                <div style={{ background:'#f0f4ff', borderRadius:8, padding:'10px 18px', textAlign:'right' }}>
                  <div style={{ fontSize:11, color:'#888', fontWeight:600, textTransform:'uppercase', letterSpacing:.5 }}>Valor Total do Pedido</div>
                  <div style={{ fontSize:22, fontWeight:800, color:'#1a3a5c', marginTop:2 }}>
                    R$ {fmtBRL(totalGeral)}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </form>
    </AuthGuard>
  );
}
