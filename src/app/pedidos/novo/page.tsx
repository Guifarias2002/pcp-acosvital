'use client';
import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import AuthGuard from '@/components/AuthGuard';

import { criarPedido } from '@/lib/api';
import { SETOR_CHOICES } from '@/lib/types';

const SS_KEY = 'nova_ordem_rascunho';

interface ItemForm { codigo: string; descricao: string; quantidade: string; unidade: string; valor_unitario: string; roteiro_proprio: string[]; }

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
    // ambos presentes: o que vier por último é o decimal
    norm = str.lastIndexOf(',') > str.lastIndexOf('.')
      ? str.replace(/\./g, '').replace(',', '.')   // 6.569,61  → 6569.61
      : str.replace(/,/g, '');                     // 6,569.61  → 6569.61
  } else if (hasComma) {
    norm = str.replace(',', '.');                  // 6569,61   → 6569.61
  } else {
    norm = str;                                    // 6569.61   → 6569.61
  }
  const n = parseFloat(norm);
  return isNaN(n) ? 0 : n;
}

export default function NovoPedidoPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState('');
  const [importando, setImportando] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function importarExcel(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!fileInputRef.current) return;
    fileInputRef.current.value = '';
    if (!file) return;
    setImportando(true);
    setErro('');
    try {
      const { read, utils } = await import('xlsx');
      const buffer = await file.arrayBuffer();
      const wb = read(buffer, { type: 'array' });
      const ws = wb.Sheets[wb.SheetNames[0]];
      // Lê a partir da linha 4 (índice 3), colunas A,B,C,F
      const rows: unknown[][] = utils.sheet_to_json(ws, { header: 1, defval: '' });
      // Linha 3 (índice 2) é o cabeçalho — dados começam no índice 3
      const dataRows = rows.slice(3).filter((r: unknown[]) => r[0]);
      if (dataRows.length === 0) {
        setErro('Nenhum item encontrado na planilha. Verifique se os dados começam na linha 4.');
        return;
      }
      const novosItens: ItemForm[] = dataRows.map((r: unknown[]) => ({
        codigo:        String(r[0] ?? '').trim(),
        descricao:     String(r[1] ?? '').trim(),
        quantidade:    String(Number(r[2]) || 1),
        unidade:       'pc',
        valor_unitario: r[5] != null && r[5] !== '' ? String(r[5]) : '',
        roteiro_proprio: [],
      }));
      setItens(novosItens);
    } catch {
      setErro('Erro ao ler o arquivo. Certifique-se de que é um .xlsx válido.');
    } finally {
      setImportando(false);
    }
  }

  // Restaura rascunho do sessionStorage (persiste F5)
  const rascunho = typeof window !== 'undefined'
    ? (() => { try { return JSON.parse(sessionStorage.getItem(SS_KEY) || 'null'); } catch { return null; } })()
    : null;

  const [pv, setPv] = useState<string>(rascunho?.pv ?? '');
  const [op, setOp] = useState<string>(rascunho?.op ?? '');
  const [cliente, setCliente] = useState<string>(rascunho?.cliente ?? '');
  const [vendedor, setVendedor] = useState<string>(rascunho?.vendedor ?? '');
  const [prazo, setPrazo] = useState<string>(rascunho?.prazo ?? '');
  const [prioridade, setPrioridade] = useState<string>(rascunho?.prioridade ?? 'normal');
  const [obs, setObs] = useState<string>(rascunho?.obs ?? '');
  const [roteiro, setRoteiro] = useState<string[]>(rascunho?.roteiro ?? ['emissao']);
  const [itens, setItens] = useState<ItemForm[]>(rascunho?.itens ?? [{ codigo: '', descricao: '', quantidade: '1', unidade: 'un', valor_unitario: '', roteiro_proprio: [] }]);

  // Salva rascunho no sessionStorage sempre que o formulário mudar
  useEffect(() => {
    try {
      sessionStorage.setItem(SS_KEY, JSON.stringify({ pv, op, cliente, vendedor, prazo, prioridade, obs, roteiro, itens }));
    } catch { /* quota exceeded */ }
  }, [pv, op, cliente, vendedor, prazo, prioridade, obs, roteiro, itens]);

  function toggleSetor(cod: string) {
    if (cod === 'emissao') return;
    setRoteiro(prev => prev.includes(cod) ? prev.filter(s => s !== cod) : [...prev, cod]);
  }

  function addItem() {
    setItens(prev => [...prev, { codigo: '', descricao: '', quantidade: '1', unidade: 'un', valor_unitario: '', roteiro_proprio: [] }]);
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
      const controller = new AbortController();
      const tmo = setTimeout(() => controller.abort(), 15000); // 15s timeout
      let id: number;
      try {
        const res = await criarPedido({
          numero_pedido_venda: pv, numero_op: op, cliente, vendedor,
          prazo_entrega: prazo, prioridade, roteiro_base: roteiro,
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
      sessionStorage.removeItem(SS_KEY);
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
        .np-ident-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 12px;
        }
        .np-item-grid {
          display: grid;
          grid-template-columns: 1fr 2fr 90px 90px 110px;
          gap: 8px;
        }
        @media (max-width: 1024px) {
          .np-item-grid {
            grid-template-columns: 1fr 1fr 80px 80px 100px;
          }
        }
        @media (max-width: 768px) {
          .np-ident-grid {
            grid-template-columns: 1fr;
          }
          .np-item-grid {
            grid-template-columns: 1fr 1fr;
          }
          .np-item-grid .np-col-descricao {
            grid-column: 1 / -1;
          }
          .np-item-grid .np-col-qty { }
          .np-item-grid .np-col-un { }
          .np-item-grid .np-col-val {
            grid-column: 1 / -1;
          }
          .np-topo-actions {
            width: 100%;
            justify-content: stretch;
          }
          .np-topo-actions a,
          .np-topo-actions button {
            flex: 1;
            text-align: center;
            justify-content: center;
          }
        }
        @media (max-width: 480px) {
          .np-item-grid {
            grid-template-columns: 1fr;
          }
          .np-item-grid .np-col-descricao,
          .np-item-grid .np-col-val {
            grid-column: 1;
          }
        }
      `}</style>

      <form onSubmit={salvar}>
        {/* Barra de topo */}
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:20, flexWrap:'wrap', gap:10 }}>
          <div style={{ display:'flex', alignItems:'center', gap:12, flexWrap:'wrap' }}>
            <a href="/pedidos" style={{ color:'#888', fontSize:13, textDecoration:'none' }}>← Pedidos</a>
            <h1 style={{ margin:0, fontSize:18, fontWeight:800, color:'#1a3a5c' }}>
              <i className="bi bi-file-earmark-plus" style={{ marginRight:8 }} />
              Nova Ordem de Produção
            </h1>
          </div>
          <div className="np-topo-actions" style={{ display:'flex', gap:8 }}>
            <a href="/pedidos" style={{ padding:'9px 18px', borderRadius:8, border:'1px solid #dee2e6', fontSize:13, color:'#555', textDecoration:'none', fontWeight:600, display:'inline-flex', alignItems:'center' }}>
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

        {/* Layout: 2 colunas no desktop, 1 no mobile */}
        <div className="novo-pedido-grid">

          {/* COLUNA ESQUERDA */}
          <div style={{ display:'flex', flexDirection:'column', gap:16 }}>

            {/* Identificação */}
            <div className="card" style={{ padding:20 }}>
              <div style={{ fontSize:11, fontWeight:700, color:'#1a3a5c', textTransform:'uppercase', letterSpacing:1, marginBottom:14, borderBottom:'2px solid #1a3a5c', paddingBottom:6 }}>
                <i className="bi bi-card-heading" style={{ marginRight:6 }} />Identificação
              </div>
              <div className="np-ident-grid">
                <div>
                  <label className={labelCls}>Nº PV *</label>
                  <input value={pv} onChange={e => setPv(e.target.value)} required placeholder="PV-001" className={inputCls} />
                </div>
                <div>
                  <label className={labelCls} style={{ display:'flex', alignItems:'center', gap:4 }}>
                    Nº OP <span style={{ color:'#dc2626' }}>*</span>
                    <span title="Número da Ordem de Produção — identifica e agrupa todas as peças deste pedido ao longo de todos os setores."
                      style={{ display:'inline-flex', alignItems:'center', justifyContent:'center', width:14, height:14, borderRadius:'50%', background:'#e0e7ff', color:'#3730a3', fontSize:9, fontWeight:800, cursor:'help', marginLeft:2 }}>?</span>
                  </label>
                  <input value={op} onChange={e => setOp(e.target.value)} placeholder="OP-001" required
                    style={{ borderColor: op.trim() ? undefined : '#fca5a5' }}
                    className={inputCls} />
                  {!op.trim() && (
                    <p style={{ fontSize:10, color:'#dc2626', margin:'3px 0 0', lineHeight:1.3 }}>Obrigatório</p>
                  )}
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
                <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".xlsx,.xls"
                    style={{ display:'none' }}
                    onChange={importarExcel}
                  />
                  <button type="button" onClick={() => fileInputRef.current?.click()} disabled={importando}
                    style={{ background:'#0d6efd', color:'#fff', border:'none', borderRadius:6, padding:'6px 14px', fontSize:12, fontWeight:700, cursor:'pointer', opacity: importando ? 0.6 : 1 }}>
                    <i className="bi bi-file-earmark-excel" style={{ marginRight:4 }} />
                    {importando ? 'Importando...' : 'Importar Excel'}
                  </button>
                  <button type="button" onClick={addItem}
                    style={{ background:'#198754', color:'#fff', border:'none', borderRadius:6, padding:'6px 14px', fontSize:12, fontWeight:700, cursor:'pointer' }}>
                    <i className="bi bi-plus-lg" style={{ marginRight:4 }} />Adicionar Item
                  </button>
                </div>
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
                      <div className="np-item-grid">
                        <div>
                          <label className={labelCls}>Código *</label>
                          <input value={item.codigo} onChange={e => setItemField(i, 'codigo', e.target.value)}
                            placeholder="COD-001" className={inputCls} />
                        </div>
                        <div className="np-col-descricao">
                          <label className={labelCls}>Descrição</label>
                          <input value={item.descricao} onChange={e => setItemField(i, 'descricao', e.target.value)}
                            placeholder="Descrição do item" className={inputCls} />
                        </div>
                        <div className="np-col-qty">
                          <label className={labelCls}>Qtd</label>
                          <input type="number" min="1" value={item.quantidade} onChange={e => setItemField(i, 'quantidade', e.target.value)}
                            className={inputCls} />
                        </div>
                        <div className="np-col-un">
                          <label className={labelCls}>Un.</label>
                          <select value={item.unidade} onChange={e => setItemField(i, 'unidade', e.target.value)} className={inputCls}>
                            {UNIDADES.map(u => <option key={u} value={u}>{u}</option>)}
                          </select>
                        </div>
                        <div className="np-col-val">
                          <label className={labelCls}>Valor Unit. (R$)</label>
                          <input value={item.valor_unitario} onChange={e => setItemField(i, 'valor_unitario', e.target.value)}
                            placeholder="0,00" className={inputCls} />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Total geral */}
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

          {/* COLUNA DIREITA — Roteiro */}
          <div>
            <div className="card" style={{ padding:20, position:'sticky', top:66 }}>
              <div style={{ fontSize:11, fontWeight:700, color:'#1a3a5c', textTransform:'uppercase', letterSpacing:1, marginBottom:14, borderBottom:'2px solid #1a3a5c', paddingBottom:6 }}>
                <i className="bi bi-arrow-right-circle" style={{ marginRight:6 }} />Roteiro de Produção
              </div>
              <p style={{ fontSize:12, color:'#888', margin:'0 0 12px' }}>
                Clique nos setores na ordem em que o pedido deve passar:
              </p>
              {(() => {
                const selecionados = roteiro
                  .filter(c => SETOR_CHOICES.some(([cod]) => cod === c))
                  .map(c => SETOR_CHOICES.find(([cod]) => cod === c)!);
                const naoSelecionados = SETOR_CHOICES.filter(([c]) => !roteiro.includes(c));
                const lista = [...selecionados, ...naoSelecionados];
                return (
                  <div style={{ display:'flex', flexDirection:'column', gap:6, paddingLeft:14, maxHeight:'calc(100vh - 350px)', overflowY:'auto' }}>
                    {lista.map(([cod, nome]) => {
                      const selecionado = roteiro.includes(cod);
                      const fixo = cod === 'emissao';
                      const pos = roteiro.indexOf(cod);
                      return (
                        <div key={cod} style={{ position:'relative' }}>
                          {selecionado && (
                            <span style={{
                              position:'absolute', left:-14, top:'50%', transform:'translateY(-50%)',
                              width:24, height:24, borderRadius:'50%',
                              background: fixo ? '#fff' : '#1a3a5c',
                              color: fixo ? '#1a3a5c' : '#fff',
                              border:'2px solid #1a3a5c',
                              display:'flex', alignItems:'center', justifyContent:'center',
                              fontSize:11, fontWeight:800, zIndex:1,
                            }}>
                              {pos + 1}
                            </span>
                          )}
                          <button type="button" onClick={() => toggleSetor(cod)}
                            disabled={fixo}
                            style={{
                              width:'100%', display:'flex', alignItems:'center', gap:10,
                              padding:'9px 12px', borderRadius:8, border:'1px solid',
                              borderColor: selecionado ? '#1a3a5c' : '#e5e7eb',
                              background: fixo ? '#1a3a5c' : selecionado ? '#eef2ff' : '#fff',
                              color: fixo ? '#fff' : selecionado ? '#1a3a5c' : '#666',
                              cursor: fixo ? 'default' : 'pointer',
                              fontWeight: selecionado ? 700 : 400,
                              fontSize:13, textAlign:'left', transition:'all .15s',
                            }}>
                            {!selecionado && (
                              <span style={{ width:16, height:16, borderRadius:'50%', border:'1px dashed #ccc', flexShrink:0 }} />
                            )}
                            <span style={{ flex:1 }}>{nome}</span>
                            {fixo && <i className="bi bi-lock-fill" style={{ fontSize:11, opacity:.6 }} />}
                            {selecionado && !fixo && <i className="bi bi-check2" style={{ color:'#1a3a5c', fontSize:14 }} />}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                );
              })()}
              {roteiro.length > 1 && (
                <div style={{ marginTop:16, padding:'10px 12px', background:'#f0f4ff', borderRadius:8, fontSize:12, color:'#1a3a5c' }}>
                  <strong>Fluxo:</strong>
                  <div style={{ display:'flex', flexWrap:'wrap', alignItems:'center', gap:'4px 0', marginTop:6 }}>
                    {roteiro.map((s, i) => {
                      const nome = SETOR_CHOICES.find(([c]) => c === s)?.[1];
                      return (
                        <span key={s} style={{ display:'flex', alignItems:'center' }}>
                          <span style={{ background:'#1a3a5c', color:'#fff', borderRadius:4, padding:'2px 7px', fontSize:11, whiteSpace:'nowrap' }}>{nome}</span>
                          {i < roteiro.length - 1 && <span style={{ margin:'0 4px', color:'#aaa', flexShrink:0 }}>→</span>}
                        </span>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </form>
    </AuthGuard>
  );
}
