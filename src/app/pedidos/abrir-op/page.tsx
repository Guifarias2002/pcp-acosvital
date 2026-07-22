'use client';
import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import AuthGuard from '@/components/AuthGuard';
import { criarPedido } from '@/lib/api';
import { FABRICAS, SETOR_CHOICES, NOMES } from '@/lib/types';

interface ItemForm { codigo: string; descricao: string; quantidade: string; unidade: string; valor_unitario: string; }
interface Grupo { roteiro: string[]; itens: ItemForm[]; }

const UNIDADES = ['un', 'kg', 'm', 'pc', 'jg', 'cx', 'lt'];

function novoItem(): ItemForm { return { codigo: '', descricao: '', quantidade: '1', unidade: 'un', valor_unitario: '' }; }

function fmtBRL(n: number) {
  return n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// Aceita "6.569,61", "6,569.61", "6569,61" ou "6569.61" — mesma regra da tela de Flange.
function parseVal(s: string): number {
  const str = String(s ?? '').trim();
  if (!str) return 0;
  const hasComma = str.includes(',');
  const hasDot = str.includes('.');
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

export default function AbrirOPPage() {
  return (
    <Suspense fallback={null}>
      <AbrirOPInner />
    </Suspense>
  );
}

// Abertura unificada de Ordem de Produção: uma OP pode ter itens de mais de uma
// fábrica (Flange e Caldeiraria) — cada item guarda o roteiro da sua fábrica.
// Salva como pedido 'emitido' (cai em Emissão de Ordens), exatamente como a tela
// de Flange já faz — reaproveita a mesma API /api/pedidos. Não altera nada do
// fluxo existente; os operadores recebem os itens normalmente.
function AbrirOPInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  // Permite abrir a tela já com uma fábrica selecionada (ex.: atalho da Caldeiraria).
  const fabInicial = FABRICAS.some(f => f.cod === searchParams.get('fabrica'))
    ? searchParams.get('fabrica')!
    : FABRICAS[0].cod;

  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState('');

  const [pv, setPv] = useState('');
  const [op, setOp] = useState('');
  const [cliente, setCliente] = useState('');
  const [vendedor, setVendedor] = useState('');
  const [prazo, setPrazo] = useState('');
  const [prioridade, setPrioridade] = useState('normal');
  const [obs, setObs] = useState('');

  const [fabricaAtiva, setFabricaAtiva] = useState(fabInicial);
  const [grupos, setGrupos] = useState<Record<string, Grupo>>(() =>
    Object.fromEntries(FABRICAS.map(f => [f.cod, { roteiro: [], itens: [novoItem()] }]))
  );

  const grupoAtivo = grupos[fabricaAtiva];
  const fabDef = FABRICAS.find(f => f.cod === fabricaAtiva)!;

  function setGrupo(fabCod: string, patch: Partial<Grupo>) {
    setGrupos(prev => ({ ...prev, [fabCod]: { ...prev[fabCod], ...patch } }));
  }
  function toggleSetor(cod: string) {
    const rot = grupoAtivo.roteiro;
    setGrupo(fabricaAtiva, { roteiro: rot.includes(cod) ? rot.filter(s => s !== cod) : [...rot, cod] });
  }
  function addItem() { setGrupo(fabricaAtiva, { itens: [...grupoAtivo.itens, novoItem()] }); }
  function remItem(i: number) { setGrupo(fabricaAtiva, { itens: grupoAtivo.itens.filter((_, idx) => idx !== i) }); }
  function setItemField(i: number, field: keyof ItemForm, val: string) {
    setGrupo(fabricaAtiva, { itens: grupoAtivo.itens.map((it, idx) => idx === i ? { ...it, [field]: val } : it) });
  }

  // Itens "de verdade" (com código) por fábrica — usados na contagem e no salvar.
  const itensValidos = (g: Grupo) => g.itens.filter(i => i.codigo.trim());

  const totalGeral = FABRICAS.reduce((acc, f) => acc + itensValidos(grupos[f.cod]).reduce((s, it) =>
    s + (parseFloat(it.quantidade) || 0) * parseVal(it.valor_unitario), 0), 0);

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    if (!op.trim()) { setErro('O Número da Ordem de Produção (OP) é obrigatório.'); return; }

    // Monta os itens de todas as fábricas num só pedido. Cada item carrega o
    // roteiro da sua fábrica, sempre começando por 'emissao' (pra cair em
    // Emissão de Ordens antes de liberar pra produção).
    const itens: Record<string, unknown>[] = [];
    for (const f of FABRICAS) {
      const g = grupos[f.cod];
      const validos = itensValidos(g);
      if (validos.length === 0) continue;
      if (g.roteiro.length === 0) {
        setErro(`Selecione o roteiro da fábrica ${f.nome} — ela tem itens mas nenhum setor no roteiro.`);
        setFabricaAtiva(f.cod);
        return;
      }
      const roteiroProprio = ['emissao', ...g.roteiro];
      for (const it of validos) {
        itens.push({
          codigo: it.codigo, descricao: it.descricao,
          quantidade: Number(it.quantidade), unidade: it.unidade,
          valor_unitario: it.valor_unitario ? parseVal(it.valor_unitario) : null,
          roteiro_proprio: roteiroProprio,
        });
      }
    }
    if (itens.length === 0) { setErro('Adicione ao menos um item (com código) em alguma fábrica.'); return; }

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
          prazo_entrega: prazo, prioridade,
          // O pedido em si só compartilha a Emissão; cada item segue seu roteiro próprio.
          roteiro_base: ['emissao'],
          observacoes: obs, itens,
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
        const msg = (e as { response?: { data?: { erro?: string } } }).response?.data?.erro;
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
        .aop-ident-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
        .aop-grid { display: grid; grid-template-columns: 1fr 340px; gap: 16px; align-items: start; }
        .aop-item-grid { display: grid; grid-template-columns: 1fr 2fr 90px 90px 110px; gap: 8px; }
        @media (max-width: 1024px) { .aop-grid { grid-template-columns: 1fr; } }
        @media (max-width: 768px) {
          .aop-ident-grid { grid-template-columns: 1fr; }
          .aop-item-grid { grid-template-columns: 1fr 1fr; }
          .aop-item-grid .aop-col-descricao, .aop-item-grid .aop-col-val { grid-column: 1 / -1; }
        }
      `}</style>

      <form onSubmit={salvar}>
        {/* Barra de topo */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <a href="/pedidos" style={{ color: '#888', fontSize: 13, textDecoration: 'none' }}>← Pedidos</a>
            <h1 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: '#1a3a5c' }}>
              <i className="bi bi-file-earmark-plus" style={{ marginRight: 8 }} />
              Abrir Ordem de Produção
            </h1>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <a href="/pedidos" style={{ padding: '9px 18px', borderRadius: 8, border: '1px solid #dee2e6', fontSize: 13, color: '#555', textDecoration: 'none', fontWeight: 600, display: 'inline-flex', alignItems: 'center' }}>
              Cancelar
            </a>
            <button type="submit" disabled={loading}
              style={{ padding: '9px 24px', borderRadius: 8, background: '#1a3a5c', color: '#fff', fontSize: 13, fontWeight: 700, border: 'none', cursor: 'pointer', opacity: loading ? 0.6 : 1 }}>
              <i className="bi bi-check-lg" style={{ marginRight: 6 }} />
              {loading ? 'Salvando...' : 'Salvar Pedido'}
            </button>
          </div>
        </div>

        {erro && (
          <div style={{ background: '#fef2f2', border: '1px solid #fca5a5', color: '#dc2626', borderRadius: 8, padding: '10px 14px', fontSize: 13, marginBottom: 16 }}>
            <i className="bi bi-exclamation-circle" style={{ marginRight: 6 }} />{erro}
          </div>
        )}

        {/* Identificação (compartilhada por toda a OP) */}
        <div className="card" style={{ padding: 20, marginBottom: 16 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#1a3a5c', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 14, borderBottom: '2px solid #1a3a5c', paddingBottom: 6 }}>
            <i className="bi bi-card-heading" style={{ marginRight: 6 }} />Identificação
          </div>
          <div className="aop-ident-grid">
            <div>
              <label className={labelCls}>Nº PV *</label>
              <input value={pv} onChange={e => setPv(e.target.value)} required placeholder="PV-001" className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Nº OP *</label>
              <input value={op} onChange={e => setOp(e.target.value)} placeholder="OP-001" required
                style={{ borderColor: op.trim() ? undefined : '#fca5a5' }} className={inputCls} />
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

        {/* Seletor de fábrica */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
          {FABRICAS.map(f => {
            const ativo = f.cod === fabricaAtiva;
            const qtd = itensValidos(grupos[f.cod]).length;
            return (
              <button key={f.cod} type="button" onClick={() => setFabricaAtiva(f.cod)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8, padding: '10px 18px', borderRadius: 10,
                  border: `2px solid ${ativo ? '#1a3a5c' : '#e5e7eb'}`,
                  background: ativo ? '#1a3a5c' : '#fff', color: ativo ? '#fff' : '#555',
                  fontSize: 14, fontWeight: 700, cursor: 'pointer', transition: 'all .15s',
                }}>
                <i className={`bi ${f.icon}`} />
                {f.nome}
                {qtd > 0 && (
                  <span style={{
                    background: ativo ? 'rgba(255,255,255,.25)' : '#eef2ff', color: ativo ? '#fff' : '#1a3a5c',
                    borderRadius: 10, padding: '1px 8px', fontSize: 12, fontWeight: 800,
                  }}>{qtd}</span>
                )}
              </button>
            );
          })}
        </div>

        {/* Corpo: itens (esq) + roteiro (dir) da fábrica ativa */}
        <div className="aop-grid">
          {/* Itens da fábrica ativa */}
          <div className="card" style={{ padding: 20 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14, borderBottom: '2px solid #1a3a5c', paddingBottom: 6, flexWrap: 'wrap', gap: 8 }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: '#1a3a5c', textTransform: 'uppercase', letterSpacing: 1 }}>
                <i className={`bi ${fabDef.icon}`} style={{ marginRight: 6 }} />Itens — {fabDef.nome}
              </span>
              <button type="button" onClick={addItem}
                style={{ background: '#198754', color: '#fff', border: 'none', borderRadius: 6, padding: '6px 14px', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
                <i className="bi bi-plus-lg" style={{ marginRight: 4 }} />Adicionar Item
              </button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {grupoAtivo.itens.map((item, i) => {
                const subTotal = (parseFloat(item.quantidade) || 0) * parseVal(item.valor_unitario);
                return (
                  <div key={i} style={{ border: '1px solid #e9ecef', borderRadius: 8, padding: 12, background: '#f8faff' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                      <span style={{ fontSize: 11, fontWeight: 700, color: '#1a3a5c' }}>
                        <i className="bi bi-box" style={{ marginRight: 5 }} />Item {i + 1}
                      </span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        {subTotal > 0 && (
                          <span style={{ fontSize: 12, fontWeight: 700, color: '#198754' }}>R$ {fmtBRL(subTotal)}</span>
                        )}
                        {grupoAtivo.itens.length > 1 && (
                          <button type="button" onClick={() => remItem(i)}
                            style={{ background: '#fee2e2', color: '#dc2626', border: 'none', borderRadius: 5, padding: '3px 8px', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>
                            <i className="bi bi-trash" style={{ marginRight: 3 }} />Remover
                          </button>
                        )}
                      </div>
                    </div>
                    <div className="aop-item-grid">
                      <div>
                        <label className={labelCls}>Código *</label>
                        <input value={item.codigo} onChange={e => setItemField(i, 'codigo', e.target.value)} placeholder="COD-001" className={inputCls} />
                      </div>
                      <div className="aop-col-descricao">
                        <label className={labelCls}>Descrição</label>
                        <input value={item.descricao} onChange={e => setItemField(i, 'descricao', e.target.value)} placeholder="Descrição do item" className={inputCls} />
                      </div>
                      <div>
                        <label className={labelCls}>Qtd</label>
                        <input type="number" min="1" value={item.quantidade} onChange={e => setItemField(i, 'quantidade', e.target.value)} className={inputCls} />
                      </div>
                      <div>
                        <label className={labelCls}>Un.</label>
                        <select value={item.unidade} onChange={e => setItemField(i, 'unidade', e.target.value)} className={inputCls}>
                          {UNIDADES.map(u => <option key={u} value={u}>{u}</option>)}
                        </select>
                      </div>
                      <div className="aop-col-val">
                        <label className={labelCls}>Valor Unit. (R$)</label>
                        <input value={item.valor_unitario} onChange={e => setItemField(i, 'valor_unitario', e.target.value)} placeholder="0,00" className={inputCls} />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {totalGeral > 0 && (
              <div style={{ marginTop: 14, display: 'flex', justifyContent: 'flex-end', borderTop: '1px solid #e9ecef', paddingTop: 12 }}>
                <div style={{ background: '#f0f4ff', borderRadius: 8, padding: '10px 18px', textAlign: 'right' }}>
                  <div style={{ fontSize: 11, color: '#888', fontWeight: 600, textTransform: 'uppercase', letterSpacing: .5 }}>Valor Total da OP (todas as fábricas)</div>
                  <div style={{ fontSize: 22, fontWeight: 800, color: '#1a3a5c', marginTop: 2 }}>R$ {fmtBRL(totalGeral)}</div>
                </div>
              </div>
            )}
          </div>

          {/* Roteiro da fábrica ativa */}
          <div className="card" style={{ padding: 20, position: 'sticky', top: 66 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#1a3a5c', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8, borderBottom: '2px solid #1a3a5c', paddingBottom: 6 }}>
              <i className="bi bi-arrow-right-circle" style={{ marginRight: 6 }} />Roteiro — {fabDef.nome}
            </div>
            <p style={{ fontSize: 12, color: '#888', margin: '0 0 12px' }}>
              A OP começa sempre em <strong>Emissão</strong>. Clique nos setores na ordem em que os itens de {fabDef.nome} devem passar:
            </p>

            {/* Emissão — passo fixo */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderRadius: 8, background: '#1a3a5c', color: '#fff', fontSize: 13, fontWeight: 700, marginBottom: 8 }}>
              <span style={{ width: 22, height: 22, borderRadius: '50%', background: '#fff', color: '#1a3a5c', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 800 }}>1</span>
              <span style={{ flex: 1 }}>Emissão de Ordens</span>
              <i className="bi bi-lock-fill" style={{ fontSize: 11, opacity: .6 }} />
            </div>

            {fabDef.setores.length === 0 ? (
              <div style={{ fontSize: 12, color: '#92400e', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 8, padding: '8px 12px' }}>
                Os setores desta fábrica ainda serão cadastrados.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, paddingLeft: 14 }}>
                {(() => {
                  const setoresFab = fabDef.setores
                    .map(cod => SETOR_CHOICES.find(([c]) => c === cod)!)
                    .filter(Boolean);
                  const selecionados = grupoAtivo.roteiro
                    .filter(c => setoresFab.some(([cod]) => cod === c))
                    .map(c => setoresFab.find(([cod]) => cod === c)!);
                  const naoSelecionados = setoresFab.filter(([c]) => !grupoAtivo.roteiro.includes(c));
                  return [...selecionados, ...naoSelecionados].map(([cod, nome]) => {
                    const selecionado = grupoAtivo.roteiro.includes(cod);
                    const pos = grupoAtivo.roteiro.indexOf(cod);
                    return (
                      <div key={cod} style={{ position: 'relative' }}>
                        {selecionado && (
                          <span style={{
                            position: 'absolute', left: -14, top: '50%', transform: 'translateY(-50%)',
                            width: 24, height: 24, borderRadius: '50%', background: '#1a3a5c', color: '#fff',
                            border: '2px solid #1a3a5c', display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontSize: 11, fontWeight: 800, zIndex: 1,
                          }}>{pos + 2}</span>
                        )}
                        <button type="button" onClick={() => toggleSetor(cod)}
                          style={{
                            width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px',
                            borderRadius: 8, border: '1px solid', borderColor: selecionado ? '#1a3a5c' : '#e5e7eb',
                            background: selecionado ? '#eef2ff' : '#fff', color: selecionado ? '#1a3a5c' : '#666',
                            cursor: 'pointer', fontWeight: selecionado ? 700 : 400, fontSize: 13, textAlign: 'left', transition: 'all .15s',
                          }}>
                          {!selecionado && <span style={{ width: 16, height: 16, borderRadius: '50%', border: '1px dashed #ccc', flexShrink: 0 }} />}
                          <span style={{ flex: 1 }}>{nome}</span>
                          {selecionado && <i className="bi bi-check2" style={{ color: '#1a3a5c', fontSize: 14 }} />}
                        </button>
                      </div>
                    );
                  });
                })()}
              </div>
            )}

            {grupoAtivo.roteiro.length > 0 && (
              <div style={{ marginTop: 16, padding: '10px 12px', background: '#f0f4ff', borderRadius: 8, fontSize: 12, color: '#1a3a5c' }}>
                <strong>Fluxo:</strong>
                <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '4px 0', marginTop: 6 }}>
                  {['emissao', ...grupoAtivo.roteiro].map((s, i, arr) => (
                    <span key={s} style={{ display: 'flex', alignItems: 'center' }}>
                      <span style={{ background: '#1a3a5c', color: '#fff', borderRadius: 4, padding: '2px 7px', fontSize: 11, whiteSpace: 'nowrap' }}>{NOMES[s] || s}</span>
                      {i < arr.length - 1 && <span style={{ margin: '0 4px', color: '#aaa', flexShrink: 0 }}>→</span>}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </form>
    </AuthGuard>
  );
}
