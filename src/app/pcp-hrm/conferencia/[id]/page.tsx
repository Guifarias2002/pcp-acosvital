'use client';
import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import AuthGuard from '@/components/AuthGuard';
import { getPedido, lerOpDoPedido, editarPedido, itemAcao } from '@/lib/api';
import { getUser } from '@/lib/auth';
import { FABRICAS, NOMES } from '@/lib/types';

// ── PCP HRM — Conferência ────────────────────────────────────────────────────
// O PCP (staff) pega uma OP que caiu na Emissão (pedido "casca" sem itens),
// confere os materiais/roteiro lidos da OP, MONTA o roteiro do item escolhendo
// os setores reais da Caldeiraria (a leitura da OP entra como sugestão), confirma
// a fábrica (Leve/Pesada é etiqueta por ora) e LANÇA pra produção — cria o item
// e dá "liberar" (igual ao Flange). Ver [[project_pcp_hrm_caldeiraria]].

interface OPMat { codigo: string; descricao: string; quantidade: string; unidade: string; }
interface OPOp { seq: string; setor: string; setorNome: string; etapa: string; }
interface OPIdent { clienteNome: string; quantidade: string; unidade: string; entrega: string; situacao: string; }
interface OPItem { cabecalho: { pn: string; po: string; ns: string }; produto: { codigo: string; descricao: string }; identificacao?: OPIdent; materiais: OPMat[]; roteiro: OPOp[]; qualidade?: number; confianca: number; }

// Setores disponíveis pro roteiro da Caldeiraria (fonte única em types.FABRICAS),
// + etapas finais compartilhadas. 'emissao' é o passo 0 fixo (não entra aqui).
const CALD = FABRICAS.find(f => f.cod === 'caldeiraria');
const MENU_SETORES = Array.from(new Set([
  ...((CALD?.setores || []).filter(s => s !== 'emissao')),
  'acabamento', 'embalagem', 'logistica',
]));

// Sugestão setor da OP (nome Totvs) → código do sistema. Só PRÉ-seleciona; o PCP
// confirma/ajusta. Nome que não casa fica sem sugestão (mostra como referência).
const SUGESTOES: [RegExp, string][] = [
  [/CHAPA/, 'corte_chapas'], [/PERFI/, 'corte_perfis'], [/RECORTE/, 'recortes'],
  [/TRACAG|TRAÇAG/, 'tracagem'], [/CHANFR/, 'chanfros'],
  [/SOLDA|MONTAGEM/, 'montagem_solda'], [/CONJUNTO/, 'conjuntos'],
  [/USINAG|TORNO|FURA/, 'usinagem_final'], [/JATEA|JATO/, 'jateamento'],
  [/PINTURA/, 'pintura_cald'], [/ACABAMENTO|TIPAR/, 'acabamento_geral'],
  [/INSPE|QUALID|\bCQ\b/, 'qualidade'], [/CALDEIRAR|RECEBIMENTO/, 'caldeiraria'],
  [/EMBALAG/, 'embalagem'], [/EXPEDIC|LOGIST|DESPACHO/, 'logistica'],
  [/CORTE|SERRA|PLASMA|LASER|MACARICO|MAÇARICO/, 'corte_chapas'],
];
function sugerirSetor(nome: string): string | null {
  const u = (nome || '').toUpperCase();
  for (const [re, cod] of SUGESTOES) if (re.test(u)) return cod;
  return null;
}

export default function ConferenciaPage() {
  return <AuthGuard hrmOnly><Conteudo /></AuthGuard>;
}

function Conteudo() {
  const router = useRouter();
  const params = useParams();
  const pedidoId = Number(params.id);
  const staff = !!getUser()?.is_staff;

  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState('');
  const [pedido, setPedido] = useState<Record<string, unknown> | null>(null);
  const [ops, setOps] = useState<OPItem[]>([]);
  const [avisoLeitura, setAvisoLeitura] = useState('');

  // Campos editáveis do item a lançar (pré-preenchidos pela leitura da OP)
  const [codigo, setCodigo] = useState('');
  const [descricao, setDescricao] = useState('');
  const [quantidade, setQuantidade] = useState('1');
  const [unidade, setUnidade] = useState('PC');
  const [roteiroSel, setRoteiroSel] = useState<string[]>([]);
  // Rastreio pelo cliente + entrega contratual (pré-preenchidos da leitura da OP:
  // PO = pedido do cliente; entrega = data lida no cabeçalho, já em ISO).
  const [pedCliente, setPedCliente] = useState('');
  const [entregaContratual, setEntregaContratual] = useState('');
  const [lancando, setLancando] = useState(false);
  const [token, setToken] = useState('');

  useEffect(() => { try { setToken(localStorage.getItem('access_token') || ''); } catch { /* ignore */ } }, []);

  useEffect(() => {
    let vivo = true;
    (async () => {
      try {
        const ped = await getPedido(pedidoId);
        if (!vivo) return;
        setPedido(ped);
        // Re-lê a OP anexada
        try {
          const leit = await lerOpDoPedido(pedidoId);
          if (!vivo) return;
          const lidas: OPItem[] = leit.ops || [];
          setOps(lidas);
          if (leit.avisos?.length) setAvisoLeitura('A leitura da OP saiu parcial — confira os itens abaixo antes de lançar.');
          const op0 = lidas[0];
          if (op0) {
            if (op0.produto?.codigo) setCodigo(op0.produto.codigo);
            if (op0.produto?.descricao) setDescricao(op0.produto.descricao);
            if (op0.identificacao?.quantidade) setQuantidade(op0.identificacao.quantidade.replace(',', '.'));
            if (op0.identificacao?.unidade) setUnidade(op0.identificacao.unidade);
            if (op0.cabecalho?.po) setPedCliente(op0.cabecalho.po);
            if (op0.identificacao?.entrega) setEntregaContratual(op0.identificacao.entrega);
            // Pré-seleciona o roteiro a partir dos setores lidos (na ordem da OP)
            const sug: string[] = [];
            for (const o of op0.roteiro) {
              const c = sugerirSetor(o.setorNome || o.setor);
              if (c && MENU_SETORES.includes(c) && !sug.includes(c)) sug.push(c);
            }
            setRoteiroSel(sug);
          }
        } catch (e) {
          const ax = e as { response?: { data?: { erro?: string } } };
          setAvisoLeitura(ax?.response?.data?.erro || 'Não consegui reler a OP automaticamente — preencha os campos à mão.');
        }
      } catch (e) {
        const ax = e as { response?: { data?: { erro?: string } } };
        setErro(ax?.response?.data?.erro || 'Não consegui carregar o pedido.');
      } finally {
        if (vivo) setCarregando(false);
      }
    })();
    return () => { vivo = false; };
  }, [pedidoId]);

  function toggleSetor(cod: string) {
    setRoteiroSel(prev => prev.includes(cod) ? prev.filter(s => s !== cod) : [...prev, cod]);
  }
  function moverSetor(i: number, dir: -1 | 1) {
    setRoteiroSel(prev => {
      const j = i + dir;
      if (j < 0 || j >= prev.length) return prev;
      const n = prev.slice(); [n[i], n[j]] = [n[j], n[i]]; return n;
    });
  }

  async function lancar() {
    if (lancando) return;
    if (!staff) { setErro('Só o PCP/administrador pode lançar pra produção.'); return; }
    if (!descricao.trim()) { setErro('Informe a descrição do produto.'); return; }
    if (roteiroSel.length === 0) { setErro('Monte o roteiro: selecione ao menos um setor.'); return; }
    const qtd = Number(quantidade);
    if (!qtd || qtd <= 0) { setErro('Quantidade inválida.'); return; }
    setLancando(true); setErro('');
    try {
      // Fábrica única (Caldeiraria) — remove a etiqueta Leve/Pesada obsoleta das
      // observações se ela existir de pedidos antigos; nada de novo é gravado.
      const obsLimpa = String(pedido?.observacoes || '').split('\n').filter(l => !/^Fábrica:/i.test(l.trim())).join('\n');

      // Cria o item com roteiro próprio ['emissao', ...setores escolhidos].
      await editarPedido(pedidoId, {
        observacoes: obsLimpa,
        numero_pedido_cliente: pedCliente,
        entrega_contratual: entregaContratual,
        itens: [{
          codigo: codigo.trim() || 'S/COD',
          descricao: descricao.trim(),
          quantidade: qtd,
          unidade: (unidade.trim() || 'pc').toLowerCase(),
          fabrica: 'caldeiraria',
          roteiro_proprio: ['emissao', ...roteiroSel],
        }],
      });

      // Lança pra produção: libera o(s) item(ns) emitido(s) recém-criado(s).
      const ped = await getPedido(pedidoId);
      const emitidos = (ped.itens || []).filter((i: Record<string, unknown>) => i.status === 'emitido');
      for (const it of emitidos) {
        try { await itemAcao(it.id as number, 'liberar'); } catch { /* segue */ }
      }
      router.push('/setor/caldeiraria');
    } catch (e) {
      const ax = e as { response?: { data?: { erro?: string } } };
      setErro(ax?.response?.data?.erro || 'Falha ao lançar pra produção.');
      setLancando(false);
    }
  }

  const op0 = ops[0];
  const card: React.CSSProperties = { background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: 18, marginBottom: 16 };
  const secTitle: React.CSSProperties = { fontSize: 11, fontWeight: 700, color: '#1a3a5c', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 12, borderBottom: '2px solid #1a3a5c', paddingBottom: 6 };
  const inputCls = 'w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white';

  return (
    <div style={{ maxWidth: 900, margin: '0 auto' }}>
      <style>{`@media print { .no-print { display:none !important; } }`}</style>

      {/* Cabeçalho */}
      <div className="no-print" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18, flexWrap: 'wrap', gap: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <a href="/pcp-hrm/conferencia" style={{ color: '#888', fontSize: 13, textDecoration: 'none' }}>← Conferência</a>
          <h1 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: '#1a3a5c' }}>
            <i className="bi bi-clipboard-check" style={{ marginRight: 8 }} />
            Conferência — {String(pedido?.numero_pedido_venda || pedidoId)}
          </h1>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => window.print()} style={{ padding: '9px 16px', borderRadius: 8, border: '1px solid #dee2e6', fontSize: 13, color: '#555', background: '#fff', fontWeight: 600, cursor: 'pointer' }}>
            <i className="bi bi-printer" style={{ marginRight: 6 }} />Imprimir
          </button>
          {pedido != null && token && (
            <a href={`/api/pedidos/${pedidoId}/ordem-producao?token=${encodeURIComponent(token)}`} target="_blank" rel="noreferrer"
              style={{ padding: '9px 16px', borderRadius: 8, border: '1px solid #dee2e6', fontSize: 13, color: '#555', background: '#fff', fontWeight: 600, textDecoration: 'none' }}>
              <i className="bi bi-file-earmark-pdf" style={{ marginRight: 6 }} />Ver OP (PDF)
            </a>
          )}
        </div>
      </div>

      {carregando && <div style={{ padding: 40, textAlign: 'center', color: '#1a3a5c' }}><i className="bi bi-arrow-repeat" style={{ marginRight: 8 }} />Carregando e lendo a OP…</div>}

      {erro && <div className="no-print" style={{ background: '#fef2f2', border: '1px solid #fca5a5', color: '#dc2626', borderRadius: 8, padding: '10px 14px', fontSize: 13, marginBottom: 16 }}><i className="bi bi-exclamation-circle" style={{ marginRight: 6 }} />{erro}</div>}

      {!carregando && (
        <>
          {avisoLeitura && <div style={{ background: '#fffbeb', border: '1px solid #fcd34d', color: '#92400e', borderRadius: 8, padding: '10px 14px', fontSize: 13, marginBottom: 16 }}><i className="bi bi-exclamation-triangle" style={{ marginRight: 6 }} />{avisoLeitura}</div>}

          {/* Identificação da OP */}
          {op0 && (
            <div style={card}>
              <div style={secTitle}><i className="bi bi-bookmark-star" style={{ marginRight: 6 }} />Identificação (OP)</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 24px', fontSize: 13, color: '#334155' }}>
                {op0.cabecalho.pn && <span><b style={{ color: '#991b1b' }}>PN</b> {op0.cabecalho.pn}</span>}
                {op0.cabecalho.po && <span><b style={{ color: '#991b1b' }}>PO</b> {op0.cabecalho.po}</span>}
                {op0.cabecalho.ns && <span><b style={{ color: '#991b1b' }}>NS</b> {op0.cabecalho.ns}</span>}
                {op0.identificacao?.clienteNome && <span><b>Cliente</b> {op0.identificacao.clienteNome}</span>}
                {op0.identificacao?.entrega && <span><b>Entrega</b> {op0.identificacao.entrega.split('-').reverse().join('/')}</span>}
                {op0.identificacao?.situacao && <span><b>Situação</b> {op0.identificacao.situacao}</span>}
              </div>
              {ops.length > 1 && <div style={{ marginTop: 10, fontSize: 12, color: '#b45309', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 6, padding: '6px 10px' }}>Este PDF tem {ops.length} ordens — esta tela lança a 1ª ({op0.produto?.descricao || op0.cabecalho.ns}). As demais podem ser lançadas depois.</div>}
            </div>
          )}

          {/* Produto + quantidade (editável) */}
          <div style={card}>
            <div style={secTitle}><i className="bi bi-box-seam" style={{ marginRight: 6 }} />Produto a fabricar</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 12, marginBottom: 12 }}>
              <div><label style={{ fontSize: 11, fontWeight: 700, color: '#64748b' }}>Código</label><input value={codigo} onChange={e => setCodigo(e.target.value)} className={inputCls} /></div>
              <div><label style={{ fontSize: 11, fontWeight: 700, color: '#64748b' }}>Descrição</label><input value={descricao} onChange={e => setDescricao(e.target.value)} className={inputCls} /></div>
            </div>
            <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
              <div><label style={{ fontSize: 11, fontWeight: 700, color: '#64748b' }}>Quantidade</label><input type="number" value={quantidade} onChange={e => setQuantidade(e.target.value)} style={{ width: 110 }} className={inputCls} /></div>
              <div><label style={{ fontSize: 11, fontWeight: 700, color: '#64748b' }}>Unidade</label><input value={unidade} onChange={e => setUnidade(e.target.value)} style={{ width: 90 }} className={inputCls} /></div>
            </div>
          </div>

          {/* Rastreio pelo cliente + entrega contratual (editável, pré-lido da OP) */}
          <div style={card}>
            <div style={secTitle}><i className="bi bi-bookmark-check" style={{ marginRight: 6 }} />Rastreio do cliente</div>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
              <div style={{ flex: '1 1 240px' }}>
                <label style={{ fontSize: 11, fontWeight: 700, color: '#64748b' }}>Nº Pedido do Cliente</label>
                <input value={pedCliente} onChange={e => setPedCliente(e.target.value)} placeholder="OC/PO do cliente" className={inputCls} />
              </div>
              <div style={{ flex: '0 1 200px' }}>
                <label style={{ fontSize: 11, fontWeight: 700, color: '#64748b' }}>Entrega Contratual</label>
                <input type="date" value={entregaContratual} onChange={e => setEntregaContratual(e.target.value)} className={inputCls} />
              </div>
            </div>
          </div>

          {/* Roteiro (por onde passa) — PCP monta escolhendo setores reais */}
          <div style={card}>
            <div style={secTitle}><i className="bi bi-signpost-split" style={{ marginRight: 6 }} />Roteiro — por onde a peça passa</div>
            {op0 && op0.roteiro.length > 0 && (
              <div style={{ fontSize: 12, color: '#64748b', marginBottom: 10 }}>
                <b>Lido da OP:</b> {Array.from(new Set(op0.roteiro.map(o => o.setorNome || o.setor).filter(Boolean))).join(' → ') || '—'}
              </div>
            )}
            {/* Selecionados, na ordem */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 12 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b' }}>Passo 1: Emissão (fixo)</div>
              {roteiroSel.map((s, i) => (
                <div key={s} style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#eef4fb', border: '1px solid #c7d7ee', borderRadius: 8, padding: '6px 10px' }}>
                  <span style={{ minWidth: 22, height: 22, borderRadius: 11, background: '#1a3a5c', color: '#fff', fontSize: 12, fontWeight: 800, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>{i + 2}</span>
                  <span style={{ flex: 1, fontSize: 13, fontWeight: 600, color: '#1a3a5c' }}>{NOMES[s] || s}</span>
                  <button onClick={() => moverSetor(i, -1)} disabled={i === 0} title="Subir" style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#64748b', opacity: i === 0 ? .3 : 1 }}><i className="bi bi-arrow-up" /></button>
                  <button onClick={() => moverSetor(i, 1)} disabled={i === roteiroSel.length - 1} title="Descer" style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#64748b', opacity: i === roteiroSel.length - 1 ? .3 : 1 }}><i className="bi bi-arrow-down" /></button>
                  <button onClick={() => toggleSetor(s)} title="Remover" style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#dc2626' }}><i className="bi bi-x-lg" /></button>
                </div>
              ))}
              {roteiroSel.length === 0 && <div style={{ fontSize: 12, color: '#b45309' }}>Nenhum setor escolhido ainda — clique nos setores abaixo.</div>}
            </div>
            {/* Disponíveis pra adicionar */}
            <div className="no-print">
              <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', marginBottom: 6 }}>Adicionar setor (clique na ordem):</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {MENU_SETORES.filter(s => !roteiroSel.includes(s)).map(s => (
                  <button key={s} onClick={() => toggleSetor(s)} style={{ border: '1px solid #dee2e6', background: '#fff', borderRadius: 20, padding: '5px 12px', fontSize: 12, fontWeight: 600, color: '#334155', cursor: 'pointer' }}>
                    + {NOMES[s] || s}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Materiais (COMPONENTES) — ver/imprimir */}
          {op0 && op0.materiais.length > 0 && (
            <div style={card}>
              <div style={secTitle}><i className="bi bi-list-check" style={{ marginRight: 6 }} />Materiais (COMPONENTES) — {op0.materiais.length}</div>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
                  <thead><tr style={{ textAlign: 'left', color: '#64748b', borderBottom: '1px solid #e2e8f0' }}>
                    <th style={{ padding: '6px 8px' }}>Código</th><th style={{ padding: '6px 8px' }}>Descrição</th><th style={{ padding: '6px 8px' }}>Qtde</th><th style={{ padding: '6px 8px' }}>Un</th>
                  </tr></thead>
                  <tbody>
                    {op0.materiais.map((m, i) => (
                      <tr key={i} style={{ borderBottom: '1px solid #f1f5f9' }}>
                        <td style={{ padding: '6px 8px', fontFamily: 'monospace', color: /^\d{4,}$/.test(m.codigo.replace(/\s/g, '')) ? '#0f172a' : '#b45309' }}>{/^\d{4,}$/.test(m.codigo.replace(/\s/g, '')) ? m.codigo : '—'}</td>
                        <td style={{ padding: '6px 8px' }}>{m.descricao}</td>
                        <td style={{ padding: '6px 8px' }}>{m.quantidade}</td>
                        <td style={{ padding: '6px 8px' }}>{m.unidade}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Lançar */}
          <div className="no-print" style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginBottom: 40 }}>
            <a href="/pcp-hrm/conferencia" style={{ padding: '11px 20px', borderRadius: 8, border: '1px solid #dee2e6', fontSize: 14, color: '#555', textDecoration: 'none', fontWeight: 600, display: 'inline-flex', alignItems: 'center' }}>Cancelar</a>
            <button onClick={lancar} disabled={lancando || !staff} title={staff ? '' : 'Só o PCP/administrador pode lançar'}
              style={{ padding: '11px 28px', borderRadius: 8, background: staff ? '#16a34a' : '#9ca3af', color: '#fff', fontSize: 14, fontWeight: 800, border: 'none', cursor: lancando || !staff ? 'not-allowed' : 'pointer', opacity: lancando ? .7 : 1 }}>
              <i className="bi bi-play-circle-fill" style={{ marginRight: 8 }} />
              {lancando ? 'Lançando…' : 'Lançar pra produção'}
            </button>
          </div>
          {!staff && <div className="no-print" style={{ textAlign: 'right', fontSize: 12, color: '#b45309', marginTop: -30, marginBottom: 30 }}>Você pode conferir, mas o lançamento é feito pelo PCP/administrador.</div>}
        </>
      )}
    </div>
  );
}
