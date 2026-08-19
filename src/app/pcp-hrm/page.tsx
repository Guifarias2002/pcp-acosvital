'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import AuthGuard from '@/components/AuthGuard';
import { criarPedido } from '@/lib/api';
import { getToken } from '@/lib/auth';

// ── PCP HRM ─────────────────────────────────────────────────────────────────
// Porta de entrada da Caldeiraria (modelo novo, empresa que roda o PCP no
// Protheus/Totvs). Aqui a pessoa (perfil restrito: só Identificação + Anexo)
// registra a origem do pedido (Totvs/Omie), o número, o prazo e ANEXA a OP em
// PDF. A ordem nasce e cai na Emissão de Ordens; a conferência e o lançamento
// pra produção (ler materiais + roteiro da OP, editar, confirmar Leve/Pesada)
// ficam com o PCP (você + Gabriel), igual ao Flange.
//
// Esta é a v1 da TELA (campos + anexo). O leitor automático da OP e a
// separação real Leve/Pesada em fábricas vêm nos próximos passos.

type Origem = 'totvs' | 'omie';
type FabricaEscolha = 'leve' | 'pesada' | 'depois';

const inputCls = 'mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-400 bg-white';
const labelCls = 'text-xs font-semibold text-gray-500 uppercase tracking-wide';

export default function PcpHrmPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState('');

  const [origem, setOrigem] = useState<Origem>('totvs');
  const [numero, setNumero] = useState('');
  const [fabrica, setFabrica] = useState<FabricaEscolha>('depois');
  const [cliente, setCliente] = useState('');
  const [semPrazo, setSemPrazo] = useState(false);
  const [prazo, setPrazo] = useState('');
  const [obs, setObs] = useState('');
  const [arquivo, setArquivo] = useState<File | null>(null);

  // Leitura automática da OP (materiais + roteiro) assim que anexa o PDF. Um
  // mesmo PDF pode trazer mais de uma ordem (cada quadro vermelho abre uma).
  interface OPMat { codigo: string; descricao: string; quantidade: string; unidade: string; }
  interface OPOp { seq: string; setor: string; setorNome: string; etapa: string; tc: string; tf: string; }
  interface OPItem {
    cabecalho: { pn: string; po: string; ns: string };
    produto: { codigo: string; descricao: string };
    materiais: OPMat[]; roteiro: OPOp[]; confianca: number; paginas: number;
  }
  interface OPLeitura { ops: OPItem[]; totalPaginas: number; }
  const [lendo, setLendo] = useState(false);
  const [leitura, setLeitura] = useState<OPLeitura | null>(null);
  const [erroLeitura, setErroLeitura] = useState('');
  const [componentesAbertos, setComponentesAbertos] = useState<Set<number>>(new Set());

  // "Por onde passa" é editável (clicar numa etapa corrige o texto, dá pra
  // add/remover) — só pra CONFERIR a leitura na hora, não grava em lugar
  // nenhum ainda: essa tela só anexa a OP, os itens de produção de verdade só
  // nascem na Conferência (Fase 3, futura). Por isso o estado é só local,
  // por índice de ordem, e some se trocar o arquivo.
  const [rotasEditadas, setRotasEditadas] = useState<Record<number, string[]>>({});
  const [editandoPill, setEditandoPill] = useState<{ ordem: number; i: number } | null>(null);
  const [textoPill, setTextoPill] = useState('');

  function setoresDaOrdem(idx: number, op: OPItem): string[] {
    if (rotasEditadas[idx]) return rotasEditadas[idx];
    return Array.from(new Set(op.roteiro.map(o => o.setorNome || o.setor).filter(Boolean)));
  }
  function abrirEdicaoPill(idx: number, i: number, valorAtual: string) {
    setEditandoPill({ ordem: idx, i }); setTextoPill(valorAtual);
  }
  function salvarEdicaoPill(idx: number, op: OPItem) {
    if (!editandoPill || editandoPill.ordem !== idx) return;
    const atual = setoresDaOrdem(idx, op).slice();
    const texto = textoPill.trim();
    if (texto) atual[editandoPill.i] = texto; else atual.splice(editandoPill.i, 1);
    setRotasEditadas(prev => ({ ...prev, [idx]: atual }));
    setEditandoPill(null);
  }
  function removerPill(idx: number, op: OPItem, i: number) {
    const atual = setoresDaOrdem(idx, op).slice();
    atual.splice(i, 1);
    setRotasEditadas(prev => ({ ...prev, [idx]: atual }));
  }
  function adicionarPill(idx: number, op: OPItem) {
    const atual = setoresDaOrdem(idx, op).slice();
    atual.push('Nova etapa');
    setRotasEditadas(prev => ({ ...prev, [idx]: atual }));
    setEditandoPill({ ordem: idx, i: atual.length - 1 }); setTextoPill('Nova etapa');
  }

  async function selecionarArquivo(f: File | null) {
    setArquivo(f);
    setLeitura(null); setErroLeitura(''); setComponentesAbertos(new Set());
    setRotasEditadas({}); setEditandoPill(null);
    if (!f) return;
    if (f.type && f.type !== 'application/pdf') return; // leitura automática só p/ PDF
    setLendo(true);
    try {
      const token = getToken() || '';
      const fd = new FormData();
      fd.append('arquivo', f);
      const res = await fetch('/api/pcp-hrm/ler-op', { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: fd });
      const data = await res.json();
      if (data.ok) setLeitura({ ops: data.ops || [], totalPaginas: data.totalPaginas ?? 0 });
      else setErroLeitura(data.erro || 'Não consegui ler a OP.');
    } catch {
      setErroLeitura('Falha ao ler a OP. O arquivo foi anexado, mas não consegui extrair os itens.');
    } finally {
      setLendo(false);
    }
  }

  function toggleComponentes(i: number) {
    setComponentesAbertos(prev => { const n = new Set(prev); if (n.has(i)) n.delete(i); else n.add(i); return n; });
  }

  const fabricaLabel: Record<FabricaEscolha, string> = {
    leve: 'Caldeiraria Leve',
    pesada: 'Caldeiraria Pesada',
    depois: 'Definir na conferência',
  };
  const origemLabel: Record<Origem, string> = { totvs: 'Totvs', omie: 'Omie' };

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    setErro('');
    setLoading(true);
    try {
      // Número é opcional (pode vir depois). Sem número, gera um provisório
      // que o PCP troca pelo real na conferência.
      const num = numero.trim() || `PCP-HRM-${Date.now()}`;

      const linhasObs = [
        `Origem: ${origemLabel[origem]}`,
        `Fábrica: ${fabricaLabel[fabrica]}`,
        obs.trim(),
      ].filter(Boolean).join('\n');

      const res = await criarPedido({
        numero_pedido_venda: num,
        numero_op: numero.trim() || num,
        cliente: cliente.trim() || 'A definir',
        vendedor: '',
        prazo_entrega: semPrazo ? '' : prazo,
        prioridade: 'normal',
        roteiro_base: ['emissao', 'caldeiraria'],
        observacoes: linhasObs,
        itens: [],
      });
      const id: number = res.id;

      // Anexa a OP (mesmo mecanismo do Flange: Backblaze via ordem-producao).
      if (arquivo) {
        const token = getToken() || '';
        const fd = new FormData();
        fd.append('arquivo', arquivo);
        const up = await fetch(`/api/pedidos/${id}/ordem-producao`, {
          method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: fd,
        });
        if (!up.ok) {
          const d = await up.json().catch(() => ({}));
          setErro(`Ordem criada, mas o anexo falhou: ${d.erro || up.status}. Você pode anexar depois na tela do pedido.`);
        }
      }

      router.push(`/pedidos/${id}`);
    } catch (e: unknown) {
      const data = (e as { response?: { data?: { erro?: string } } }).response?.data;
      setErro(data?.erro || 'Erro ao registrar a OP. Tente novamente.');
    } finally {
      setLoading(false);
    }
  }

  const toggleBtn = (active: boolean): React.CSSProperties => ({
    flex: 1, padding: '12px 14px', borderRadius: 10, cursor: 'pointer', textAlign: 'center',
    fontSize: 13, fontWeight: 700, border: active ? '2px solid #1a3a5c' : '1px solid #dee2e6',
    background: active ? '#eef4fb' : '#fff', color: active ? '#1a3a5c' : '#6c757d',
    transition: 'all .12s',
  });

  return (
    <AuthGuard hrmOnly>
      <style>{`
        .hrm-grid { display:grid; grid-template-columns:1fr 1fr; gap:12px; }
        @media (max-width:768px){ .hrm-grid{ grid-template-columns:1fr; } }
      `}</style>

      <form onSubmit={salvar}>
        {/* Cabeçalho */}
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:20, flexWrap:'wrap', gap:10 }}>
          <div style={{ display:'flex', alignItems:'center', gap:12, flexWrap:'wrap' }}>
            <a href="/setor/caldeiraria" style={{ color:'#888', fontSize:13, textDecoration:'none' }}>← Caldeiraria</a>
            <h1 style={{ margin:0, fontSize:18, fontWeight:800, color:'#1a3a5c' }}>
              <i className="bi bi-file-earmark-arrow-up" style={{ marginRight:8 }} />
              PCP HRM — Anexar OP
            </h1>
          </div>
          <div style={{ display:'flex', gap:8 }}>
            <a href="/setor/caldeiraria" style={{ padding:'9px 18px', borderRadius:8, border:'1px solid #dee2e6', fontSize:13, color:'#555', textDecoration:'none', fontWeight:600, display:'inline-flex', alignItems:'center' }}>
              Cancelar
            </a>
            <button type="submit" disabled={loading}
              style={{ padding:'9px 24px', borderRadius:8, background:'#1a3a5c', color:'#fff', fontSize:13, fontWeight:700, border:'none', cursor:'pointer', opacity:loading?0.6:1 }}>
              <i className="bi bi-send" style={{ marginRight:6 }} />
              {loading ? 'Enviando...' : 'Enviar para Emissão'}
            </button>
          </div>
        </div>

        {/* Passo a passo — orienta quem usa essa tela pela primeira vez (perfil
            restrito: só Identificação + Anexo, sem editar roteiro/materiais). */}
        <div style={{ background:'#eff6ff', border:'1px solid #bfdbfe', borderRadius:10, padding:'14px 18px', marginBottom:16, maxWidth:760 }}>
          <div style={{ fontSize:12, fontWeight:700, color:'#1e40af', textTransform:'uppercase', letterSpacing:.5, marginBottom:8 }}>
            <i className="bi bi-info-circle" style={{ marginRight:6 }} />Como preencher
          </div>
          <ol style={{ margin:0, paddingLeft:18, display:'flex', flexDirection:'column', gap:5, fontSize:13, color:'#1e3a8a' }}>
            <li>Escolha a origem (<b>Totvs</b> ou <b>Omie</b>) e o nº do pedido, se já tiver — pode deixar em branco e completar depois.</li>
            <li>Anexe o PDF da OP (Ordem de Produção) — o sistema lê os materiais e o roteiro sozinho, não precisa digitar nada.</li>
            <li>Confira a leitura clicando no produto — é só pra você olhar, não precisa corrigir nada, quem confere de verdade é o PCP.</li>
            <li>Clique em <b>&quot;Enviar para Emissão&quot;</b> no canto superior direito. Pronto — a OP cai pro PCP conferir e liberar pra produção.</li>
          </ol>
        </div>

        {erro && (
          <div style={{ background:'#fef2f2', border:'1px solid #fca5a5', color:'#dc2626', borderRadius:8, padding:'10px 14px', fontSize:13, marginBottom:16, maxWidth:760 }}>
            <i className="bi bi-exclamation-circle" style={{ marginRight:6 }} />{erro}
          </div>
        )}

        <div style={{ display:'flex', flexDirection:'column', gap:16, maxWidth:760 }}>

          {/* Origem */}
          <div className="card" style={{ padding:20 }}>
            <div style={{ fontSize:11, fontWeight:700, color:'#1a3a5c', textTransform:'uppercase', letterSpacing:1, marginBottom:14, borderBottom:'2px solid #1a3a5c', paddingBottom:6 }}>
              <i className="bi bi-diagram-3" style={{ marginRight:6 }} />Origem do Pedido
            </div>
            <div style={{ display:'flex', gap:10, marginBottom:14 }}>
              <div style={toggleBtn(origem==='totvs')} onClick={() => setOrigem('totvs')}>
                <i className="bi bi-database" style={{ marginRight:6 }} />Totvs (Protheus)
              </div>
              <div style={toggleBtn(origem==='omie')} onClick={() => setOrigem('omie')}>
                <i className="bi bi-box" style={{ marginRight:6 }} />Omie
              </div>
            </div>
            <div className="hrm-grid">
              <div>
                <label className={labelCls}>Nº do pedido ({origemLabel[origem]})</label>
                <input value={numero} onChange={e => setNumero(e.target.value)} placeholder="pode preencher depois" className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Cliente</label>
                <input value={cliente} onChange={e => setCliente(e.target.value)} placeholder="opcional" className={inputCls} />
              </div>
            </div>
          </div>

          {/* Fábrica + Prazo */}
          <div className="card" style={{ padding:20 }}>
            <div style={{ fontSize:11, fontWeight:700, color:'#1a3a5c', textTransform:'uppercase', letterSpacing:1, marginBottom:14, borderBottom:'2px solid #1a3a5c', paddingBottom:6 }}>
              <i className="bi bi-sliders" style={{ marginRight:6 }} />Classificação
            </div>
            <label className={labelCls}>Fábrica</label>
            <div style={{ display:'flex', gap:10, marginTop:6, marginBottom:16 }}>
              <div style={toggleBtn(fabrica==='leve')} onClick={() => setFabrica('leve')}>Caldeiraria Leve</div>
              <div style={toggleBtn(fabrica==='pesada')} onClick={() => setFabrica('pesada')}>Caldeiraria Pesada</div>
              <div style={toggleBtn(fabrica==='depois')} onClick={() => setFabrica('depois')}>Definir depois</div>
            </div>
            <label className={labelCls}>Prazo de entrega</label>
            <div style={{ display:'flex', alignItems:'center', gap:14, marginTop:6, flexWrap:'wrap' }}>
              <input type="date" value={prazo} disabled={semPrazo}
                onChange={e => setPrazo(e.target.value)}
                style={{ opacity: semPrazo ? 0.5 : 1, width: 190, marginTop: 4 }}
                className="border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white" />
              <label style={{ display:'flex', alignItems:'center', gap:7, fontSize:13, color:'#495057', cursor:'pointer', fontWeight:600 }}>
                <input type="checkbox" checked={semPrazo} onChange={e => setSemPrazo(e.target.checked)} />
                Sem prazo até o momento
              </label>
            </div>
          </div>

          {/* Anexo da OP */}
          <div className="card" style={{ padding:20 }}>
            <div style={{ fontSize:11, fontWeight:700, color:'#1a3a5c', textTransform:'uppercase', letterSpacing:1, marginBottom:14, borderBottom:'2px solid #1a3a5c', paddingBottom:6 }}>
              <i className="bi bi-paperclip" style={{ marginRight:6 }} />Anexo da OP (PDF)
            </div>
            <label htmlFor="hrm-file" style={{
              display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:8,
              border:'2px dashed #b6c6da', borderRadius:12, padding:'28px 16px', cursor:'pointer',
              background: arquivo ? '#eefaf1' : '#f8faff', textAlign:'center',
            }}>
              <i className={`bi ${arquivo ? 'bi-file-earmark-check-fill' : 'bi-cloud-arrow-up'}`} style={{ fontSize:30, color: arquivo ? '#198754' : '#6c8bb0' }} />
              {arquivo ? (
                <div style={{ fontSize:13, fontWeight:700, color:'#166534' }}>
                  {arquivo.name} <span style={{ fontWeight:500, color:'#4b5563' }}>({(arquivo.size/1024/1024).toFixed(2)} MB)</span>
                </div>
              ) : (
                <>
                  <div style={{ fontSize:13, fontWeight:700, color:'#1a3a5c' }}>Clique para anexar a OP em PDF</div>
                  <div style={{ fontSize:12, color:'#7a8aa0' }}>pode anexar agora ou depois — máx. 20 MB</div>
                </>
              )}
            </label>
            <input id="hrm-file" type="file" accept="application/pdf,image/png,image/jpeg" style={{ display:'none' }}
              onChange={e => selecionarArquivo(e.target.files?.[0] || null)} />
            {arquivo && (
              <div style={{ marginTop:10, textAlign:'center' }}>
                <button type="button" onClick={() => selecionarArquivo(null)}
                  style={{ background:'#fee2e2', color:'#dc2626', border:'none', borderRadius:6, padding:'5px 12px', fontSize:12, fontWeight:600, cursor:'pointer' }}>
                  <i className="bi bi-trash" style={{ marginRight:4 }} />Remover anexo
                </button>
              </div>
            )}

            {lendo && (
              <div style={{ marginTop:14, textAlign:'center', fontSize:13, color:'#1a3a5c', fontWeight:600 }}>
                <i className="bi bi-arrow-repeat" style={{ marginRight:6 }} />Lendo a OP (materiais e roteiro)…
              </div>
            )}
            {erroLeitura && (
              <div style={{ marginTop:14, background:'#fffbeb', border:'1px solid #fcd34d', color:'#92400e', borderRadius:8, padding:'10px 14px', fontSize:13 }}>
                <i className="bi bi-exclamation-triangle" style={{ marginRight:6 }} />{erroLeitura}
              </div>
            )}
          </div>

          {/* Resultado da leitura — uma OP pode trazer mais de uma ordem */}
          {leitura && (
            <div className="card" style={{ padding:20 }}>
              <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:14, borderBottom:'2px solid #1a3a5c', paddingBottom:6, flexWrap:'wrap', gap:8 }}>
                <span style={{ fontSize:11, fontWeight:700, color:'#1a3a5c', textTransform:'uppercase', letterSpacing:1 }}>
                  <i className="bi bi-card-checklist" style={{ marginRight:6 }} />Leitura da OP
                  <span style={{ fontWeight:500, textTransform:'none', color:'#7a8aa0', marginLeft:8 }}>
                    {leitura.totalPaginas} pág. · {leitura.ops.length} {leitura.ops.length === 1 ? 'ordem' : 'ordens'}
                  </span>
                </span>
              </div>

              {leitura.ops.length === 0 && (
                <div style={{ fontSize:13, color:'#92400e' }}>Não consegui identificar nenhuma ordem neste PDF. Confira se é uma OP do Totvs.</div>
              )}

              <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
                {leitura.ops.map((op, idx) => {
                  const multi = leitura.ops.length > 1;
                  const setoresRoteiro = setoresDaOrdem(idx, op);
                  const aberto = componentesAbertos.has(idx);
                  // Confiança muito baixa = a fonte embaralhada do Totvs não foi
                  // decifrada; materiais/roteiro/produto saem como lixo. Nesse caso
                  // não mostramos os dados garbled — só a identificação (PN/PO/NS,
                  // que vem da anotação do quadro vermelho e NÃO é embaralhada) e
                  // um aviso. Anexa a OP do mesmo jeito; o PCP lança na Conferência.
                  const leituraRuim = op.confianca < 0.3;
                  return (
                    <div key={idx}>
                      {/* Linha resumo — só Produto/Descrição, igual uma linha de item do
                          Flange. Clicável: só abre identificação/componentes/roteiro
                          quando a pessoa quer conferir. Nada de roteiro pré-aberto — a
                          leitura automática é sugestão, quem direciona o processo é o PCP. */}
                      <button type="button" onClick={() => toggleComponentes(idx)}
                        style={{ width:'100%', textAlign:'left', background:'#f8faff', border:'1px solid #cfe0f2', borderRadius:10, padding:'12px 14px', cursor:'pointer', display:'flex', alignItems:'center', gap:10 }}>
                        <i className={`bi ${aberto ? 'bi-chevron-down' : 'bi-chevron-right'}`} style={{ color:'#1a3a5c', fontSize:14 }} />
                        <span style={{ flex:1, minWidth:0 }}>
                          {multi && <span style={{ fontSize:10.5, fontWeight:700, color:'#7a8aa0', textTransform:'uppercase', letterSpacing:.5 }}>Ordem {idx + 1} de {leitura.ops.length}</span>}
                          <span className={labelCls} style={{ display:'block' }}>{leituraRuim ? 'OP anexada' : `Produto${op.produto.codigo ? ` — ${op.produto.codigo}` : ''}`}</span>
                          <div style={{ fontSize:13.5, fontWeight:700, color:'#1a3a5c', marginTop:2 }}>{leituraRuim ? (op.cabecalho.ns || op.cabecalho.pn || 'Confira no PDF') : (op.produto.descricao || '—')}</div>
                        </span>
                        {leituraRuim ? (
                          <span style={{ fontSize:11, fontWeight:700, color:'#b91c1c', background:'#fef2f2', border:'1px solid #fecaca', borderRadius:6, padding:'3px 8px', whiteSpace:'nowrap' }}>
                            <i className="bi bi-exclamation-triangle" style={{ marginRight:4 }} />não consegui ler
                          </span>
                        ) : op.confianca < 0.5 && (
                          <span style={{ fontSize:11, fontWeight:700, color:'#92400e', background:'#fffbeb', border:'1px solid #fcd34d', borderRadius:6, padding:'3px 8px', whiteSpace:'nowrap' }}>
                            <i className="bi bi-eye" style={{ marginRight:4 }} />confira
                          </span>
                        )}
                        {!leituraRuim && (
                        <span style={{ fontSize:11.5, fontWeight:700, color:'#1a3a5c', background:'#eef4fb', border:'1px solid #cfe0f2', borderRadius:20, padding:'3px 10px', whiteSpace:'nowrap' }}>
                          {op.materiais.length} componentes
                        </span>
                        )}
                      </button>

                      {/* Expandido: identificação + Por onde passa + COMPONENTES + roteiro */}
                      {aberto && (
                        <div style={{ marginTop:10, paddingLeft:4 }}>
                          {/* Identificação (quadro vermelho da OP): PN / PO / NS */}
                          {(op.cabecalho.pn || op.cabecalho.po || op.cabecalho.ns) && (
                            <div style={{ border:'1.5px solid #dc2626', borderRadius:10, padding:'12px 14px', marginBottom:14, background:'#fef5f5' }}>
                              <div style={{ fontSize:10.5, fontWeight:700, color:'#dc2626', textTransform:'uppercase', letterSpacing:1, marginBottom:6 }}>
                                <i className="bi bi-bookmark-star" style={{ marginRight:5 }} />Identificação
                              </div>
                              <div style={{ display:'flex', flexDirection:'column', gap:3, fontSize:13.5, fontWeight:700, color:'#991b1b', fontFamily:'monospace' }}>
                                {op.cabecalho.pn && <div><span style={{ opacity:.6 }}>PN</span> {op.cabecalho.pn}</div>}
                                {op.cabecalho.po && <div><span style={{ opacity:.6 }}>PO</span> {op.cabecalho.po}</div>}
                                {op.cabecalho.ns && <div><span style={{ opacity:.6 }}>NS</span> {op.cabecalho.ns}</div>}
                              </div>
                            </div>
                          )}

                          {leituraRuim && (
                            <div style={{ fontSize:13, color:'#92400e', background:'#fffbeb', border:'1px solid #fcd34d', borderRadius:8, padding:'10px 12px', marginBottom:14 }}>
                              <i className="bi bi-exclamation-triangle" style={{ marginRight:6 }} />
                              Não consegui ler os <b>materiais</b> e o <b>roteiro</b> automaticamente nesta OP (a fonte do PDF veio muito embaralhada). A identificação acima (PN/PO/NS) está correta. <b>Anexe a OP mesmo assim</b> — o PCP confere na Conferência. Se der, exporte a OP do Totvs em Excel/TXT pra leitura 100% confiável.
                            </div>
                          )}
                          {/* Por onde passa (setores do roteiro) — leitura sugerida, editável aqui só
                              pra conferir na hora (não grava ainda; a Conferência real vem na Fase 3).
                              Clicar numa etapa corrige o texto; "x" remove; "+" adiciona. */}
                          {!leituraRuim && (<div style={{ marginBottom:16 }}>
                            <span className={labelCls}>Por onde passa (sugestão da leitura — clique pra corrigir)</span>
                            <div style={{ display:'flex', flexWrap:'wrap', gap:6, marginTop:6, alignItems:'center' }}>
                              {setoresRoteiro.map((s, i) => {
                                const editando = editandoPill?.ordem === idx && editandoPill?.i === i;
                                if (editando) return (
                                  <input key={i} autoFocus value={textoPill}
                                    onChange={e => setTextoPill(e.target.value)}
                                    onBlur={() => salvarEdicaoPill(idx, op)}
                                    onKeyDown={e => { if (e.key === 'Enter') salvarEdicaoPill(idx, op); if (e.key === 'Escape') setEditandoPill(null); }}
                                    style={{ border:'1.5px solid #1a3a5c', borderRadius:20, padding:'4px 12px', fontSize:12.5, fontWeight:700, color:'#1a3a5c', width:160 }} />
                                );
                                return (
                                  <span key={i} style={{ display:'inline-flex', alignItems:'center', gap:5, background:'#eef4fb', border:'1px solid #cfe0f2', color:'#1a3a5c', borderRadius:20, padding:'4px 6px 4px 12px', fontSize:12.5, fontWeight:700 }}>
                                    <button type="button" onClick={() => abrirEdicaoPill(idx, i, s)}
                                      style={{ background:'none', border:'none', cursor:'pointer', color:'#1a3a5c', fontWeight:700, fontSize:12.5, padding:0 }}>
                                      <span style={{ opacity:.6 }}>{i + 1}.</span> {s}
                                    </button>
                                    <button type="button" onClick={() => removerPill(idx, op, i)} title="Remover etapa"
                                      style={{ background:'none', border:'none', cursor:'pointer', color:'#94a3b8', padding:'0 2px', fontSize:13, lineHeight:1 }}>
                                      <i className="bi bi-x-lg" />
                                    </button>
                                  </span>
                                );
                              })}
                              <button type="button" onClick={() => adicionarPill(idx, op)}
                                style={{ display:'inline-flex', alignItems:'center', gap:4, background:'#fff', border:'1px dashed #cfe0f2', color:'#1a3a5c', borderRadius:20, padding:'4px 12px', fontSize:12.5, fontWeight:700, cursor:'pointer' }}>
                                <i className="bi bi-plus-lg" />Etapa
                              </button>
                            </div>
                          </div>)}

                          {!leituraRuim && op.materiais.length > 0 && (
                            <div style={{ overflowX:'auto', marginTop:16 }}>
                              <span className={labelCls}>Componentes</span>
                              <table style={{ width:'100%', borderCollapse:'collapse', marginTop:6, fontSize:12.5, minWidth:520 }}>
                                <thead>
                                  <tr style={{ textAlign:'left', color:'#6c757d', borderBottom:'1px solid #e9ecef' }}>
                                    <th style={{ padding:'5px 8px' }}>Código</th><th style={{ padding:'5px 8px' }}>Descrição</th>
                                    <th style={{ padding:'5px 8px' }}>Qtd</th><th style={{ padding:'5px 8px' }}>Un</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {op.materiais.map((m, i) => (
                                    <tr key={i} style={{ borderBottom:'1px solid #f1f3f5' }}>
                                      <td style={{ padding:'5px 8px', fontWeight:700, color:'#1a3a5c', whiteSpace:'nowrap' }}>{m.codigo}</td>
                                      <td style={{ padding:'5px 8px' }}>{m.descricao}</td>
                                      <td style={{ padding:'5px 8px', whiteSpace:'nowrap' }}>{m.quantidade}</td>
                                      <td style={{ padding:'5px 8px' }}>{m.unidade}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          )}

                          {op.roteiro.length > 0 && (
                            <div style={{ marginTop:16, overflowX:'auto' }}>
                              <span className={labelCls}>Roteiro de operações</span>
                              <table style={{ width:'100%', borderCollapse:'collapse', marginTop:6, fontSize:12.5, minWidth:520 }}>
                                <thead>
                                  <tr style={{ textAlign:'left', color:'#6c757d', borderBottom:'1px solid #e9ecef' }}>
                                    <th style={{ padding:'5px 8px' }}>Seq</th><th style={{ padding:'5px 8px' }}>Setor</th>
                                    <th style={{ padding:'5px 8px' }}>Etapa</th><th style={{ padding:'5px 8px' }}>TC</th><th style={{ padding:'5px 8px' }}>TF</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {op.roteiro.map((o, i) => (
                                    <tr key={i} style={{ borderBottom:'1px solid #f1f3f5' }}>
                                      <td style={{ padding:'5px 8px', fontWeight:700, color:'#1a3a5c' }}>{o.seq}</td>
                                      <td style={{ padding:'5px 8px' }}>{o.setorNome || o.setor}</td>
                                      <td style={{ padding:'5px 8px' }}>{o.etapa}</td>
                                      <td style={{ padding:'5px 8px', color:'#6c757d' }}>{o.tc}</td>
                                      <td style={{ padding:'5px 8px', color:'#6c757d' }}>{o.tf}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          )}
                        </div>
                      )}

                      {!op.roteiro.length && !op.materiais.length && (
                        <div style={{ fontSize:13, color:'#92400e', marginTop:12 }}>Não consegui identificar materiais nem roteiro nesta ordem.</div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Observações */}
          <div className="card" style={{ padding:20 }}>
            <div style={{ fontSize:11, fontWeight:700, color:'#1a3a5c', textTransform:'uppercase', letterSpacing:1, marginBottom:14, borderBottom:'2px solid #1a3a5c', paddingBottom:6 }}>
              <i className="bi bi-chat-left-text" style={{ marginRight:6 }} />Observações
            </div>
            <textarea value={obs} onChange={e => setObs(e.target.value)} rows={2} className={inputCls} style={{ resize:'vertical' }}
              placeholder="Alguma observação pra Emissão? (opcional)" />
          </div>

        </div>
      </form>
    </AuthGuard>
  );
}
