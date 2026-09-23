'use client';
import { useState } from 'react';
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

const inputCls = 'mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-400 bg-white';
const labelCls = 'text-xs font-semibold text-gray-500 uppercase tracking-wide';

// A OP do Omie traz a Quantidade sempre com 6 casas decimais (ex.: "853,000000",
// "1.459,000000") — sobra pro sistema de origem, não pra quem confere aqui. Só
// formatação de EXIBIÇÃO: quando as casas decimais são só zero, mostra o
// inteiro (mantendo o ponto de milhar que já vem no texto); quando tem
// decimal de verdade, mantém só os dígitos que sobram. Não mexe no dado cru
// (`m.quantidade` continua intacto pra quem mais usar).
function formatarQtd(raw: string): string {
  const s = (raw || '').trim();
  if (!s) return s;
  const [inteiro, decimal] = s.split(',');
  if (decimal == null || /^0+$/.test(decimal)) return inteiro;
  return `${inteiro},${decimal.replace(/0+$/, '')}`;
}

export default function PcpHrmPage() {
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState('');
  // Guarda o id do pedido já criado: se o anexo falhar depois de criar o
  // pedido, o reenvio reaproveita esse id em vez de criar outro (evita PV
  // duplicado) e a tela oferece um link pra abrir o pedido.
  const [criadoId, setCriadoId] = useState<number | null>(null);
  // OPs anexadas NESTA sessão — a tela não sai mais ao enviar; cada OP entra
  // numa lista numerada (1,2,3,4) e o formulário reseta pra próxima.
  const [anexadas, setAnexadas] = useState<{ id: number; numero: string; cliente: string; pn: string; produto: string }[]>([]);
  const [fileKey, setFileKey] = useState(0);

  const [origem] = useState<Origem>('omie'); // Caldeiraria = só Omie (origem fixa)
  const [numero, setNumero] = useState('');
  const [cliente, setCliente] = useState('');
  const [semPrazo, setSemPrazo] = useState(false);
  const [prazo, setPrazo] = useState('');
  const [obs, setObs] = useState('');
  const [arquivo, setArquivo] = useState<File | null>(null);
  // Desenho(s) do projeto — opcional, um ou vários (PDF/imagem). Vão pro mesmo
  // acervo de "desenhos" do pedido (Backblaze), separados da OP; o PCP/produção
  // veem na conferência e no detalhe do pedido.
  const [desenhos, setDesenhos] = useState<File[]>([]);

  // Leitura automática da OP (materiais + roteiro) assim que anexa o PDF. Um
  // mesmo PDF pode trazer mais de uma ordem (cada quadro vermelho abre uma).
  interface OPMat { codigo: string; descricao: string; quantidade: string; unidade: string; materiaPrima?: string | null; dimensao?: string | null; norma?: string | null; }
  interface OPOp { seq: string; setor: string; setorNome: string; etapa: string; tc: string; tf: string; }
  interface OPValid { temProduto: boolean; temComponentes: boolean; temRoteiro: boolean; componentesSemCodigo: number; avisos: string[] }
  interface OPIdent { clienteNome: string; clienteCodigo: string; quantidade: string; unidade: string; emissao: string; entrega: string; situacao: string; previsaoConclusao?: string; }
  interface OPItem {
    cabecalho: { pn: string; po: string; ns: string };
    produto: { codigo: string; descricao: string };
    identificacao?: OPIdent;
    materiais: OPMat[]; roteiro: OPOp[]; confianca: number; qualidade?: number; validacao?: OPValid; paginas: number;
    origem?: 'totvs' | 'omie'; numero?: string;
  }
  interface OPLeitura { ops: OPItem[]; totalPaginas: number; avisos?: string[] }
  const [lendo, setLendo] = useState(false);
  const [leitura, setLeitura] = useState<OPLeitura | null>(null);
  const [erroLeitura, setErroLeitura] = useState('');
  const [componentesAbertos, setComponentesAbertos] = useState<Set<number>>(new Set());
  // Componentes DESMARCADOS pela pessoa (chave "opIdx:matIdx") — por padrão
  // todos vêm marcados (foco em fazer aparecer o material, não some da lista;
  // só fica visualmente "riscado"). É só pra conferência visual nesta tela —
  // não muda o que é enviado (a Conferência do PCP já relê a OP inteira).
  const [materiaisExcluidos, setMateriaisExcluidos] = useState<Set<string>>(new Set());
  const materialKey = (opIdx: number, matIdx: number) => `${opIdx}:${matIdx}`;
  const materialSelecionado = (opIdx: number, matIdx: number) => !materiaisExcluidos.has(materialKey(opIdx, matIdx));
  function toggleMaterial(opIdx: number, matIdx: number) {
    setMateriaisExcluidos(prev => {
      const next = new Set(prev);
      const key = materialKey(opIdx, matIdx);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }
  function toggleTodosMateriais(opIdx: number, total: number, marcarTodos: boolean) {
    setMateriaisExcluidos(prev => {
      const next = new Set(prev);
      for (let i = 0; i < total; i++) {
        const key = materialKey(opIdx, i);
        if (marcarTodos) next.delete(key); else next.add(key);
      }
      return next;
    });
  }
  // Nome sugerido pra baixar a OP e mandar pras áreas — parte da descrição do
  // produto lida, mas o operador pode ajustar antes de baixar.
  const [nomeEnvio, setNomeEnvio] = useState('');

  // Tira do nome os caracteres que o Windows não aceita em arquivo (\ / : * ? " < > |)
  // e junta espaços repetidos. Vazio se não sobrar nada.
  const limparNomeArquivo = (s: string) =>
    (s || '').replace(/[\\/:*?"<>|\n\r\t]+/g, ' ').replace(/\s+/g, ' ').trim();

  // Baixa o MESMO PDF anexado, só renomeado, pro operador encaminhar às áreas.
  function baixarRenomeada() {
    if (!arquivo) return;
    const base = limparNomeArquivo(nomeEnvio) || arquivo.name.replace(/\.pdf$/i, '') || 'OP';
    const nome = (/\.pdf$/i.test(base) ? base : `${base}.pdf`).slice(0, 150);
    const url = URL.createObjectURL(arquivo);
    const a = document.createElement('a');
    a.href = url; a.download = nome;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  // O roteiro ("por onde a peça passa") NÃO é definido nesta tela — quem define é
  // o PCP na Conferência. Aqui o operador só anexa a OP (a leitura é só conferência).

  async function selecionarArquivo(f: File | null, origemForcada?: Origem) {
    setArquivo(f);
    setLeitura(null); setErroLeitura(''); setComponentesAbertos(new Set()); setNomeEnvio('');
    if (!f) return;
    if (f.type && f.type !== 'application/pdf') return; // leitura automática só p/ PDF
    // A origem escolhida na tela decide o leitor (Totvs=cifra; Omie=texto limpo).
    // Passa explícito quando vem do toggle (evita ler o state antes de atualizar).
    const origemLeitura = origemForcada ?? origem;
    setLendo(true);
    try {
      const token = getToken() || '';
      const fd = new FormData();
      fd.append('arquivo', f);
      fd.append('origem', origemLeitura);
      const res = await fetch('/api/pcp-hrm/ler-op', { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: fd });
      const data = await res.json();
      if (data.ok) {
        const ops: OPItem[] = data.ops || [];
        setLeitura({ ops, totalPaginas: data.totalPaginas ?? 0 });
        // Nome sugerido pra distribuir às áreas = descrição do produto lida
        // (a 1ª ordem que tiver descrição); se a leitura veio ruim, cai pro
        // NS/PN e, por fim, pro nome original do arquivo.
        const descProduto = ops.find(o => o.produto?.descricao)?.produto.descricao
          || ops[0]?.cabecalho?.ns || ops[0]?.cabecalho?.pn || '';
        setNomeEnvio(limparNomeArquivo(descProduto) || f.name.replace(/\.pdf$/i, ''));
        // Pré-preenche Cliente/Prazo com o que a OP leu — só quando a pessoa
        // ainda não digitou nada (nunca sobrescreve o que já foi preenchido
        // à mão). "Situacao"/"Quantidade" ficam só na Identificação pra
        // conferir, não têm campo próprio nesta tela.
        const ident = ops[0]?.identificacao;
        if (ident?.clienteNome) setCliente(c => c.trim() ? c : ident.clienteNome);
        if (ident?.entrega) setPrazo(p => (p || semPrazo) ? p : ident.entrega);
      }
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

  const origemLabel: Record<Origem, string> = { totvs: 'Totvs', omie: 'Omie' };

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    setErro('');
    setLoading(true);
    try {
      // Se o pedido já foi criado numa tentativa anterior (o anexo é que
      // falhou), reaproveita o mesmo id em vez de criar de novo — senão o PV
      // repetido cairia em duplicata (409) e travaria o reenvio do anexo.
      let id = criadoId;
      if (id == null) {
        // Número é opcional (pode vir depois). Sem número, gera um provisório
        // que o PCP troca pelo real na conferência.
        const num = numero.trim() || `PCP-HRM-${Date.now()}`;

        // O ROTEIRO ("por onde a peça passa") NÃO é definido aqui — quem define é
        // o PCP na Conferência. As observações levam só a origem (define o leitor
        // Totvs/Omie na releitura da OP) + o texto livre digitado.
        const linhasObs = [
          `Origem: ${origemLabel[origem]}`,
          obs.trim(),
        ].filter(Boolean).join('\n');

        const res = await criarPedido({
          numero_pedido_venda: num,
          numero_op: numero.trim() || num,
          cliente: cliente.trim() || 'A definir',
          vendedor: '',
          prazo_entrega: semPrazo ? '' : prazo,
          prioridade: 'normal',
          // Pedido casca do HRM: roteiro_base fica no mínimo emissao→caldeiraria
          // (a rota /api/pedidos detecta o pedido HRM por EXATAMENTE esse roteiro
          // pra liberar item vazio + prazo em branco). O caminho REAL de cada
          // componente vai no bloco "Por onde cada peça passa" das observações
          // acima; o PCP monta os itens com esses caminhos na Conferência.
          roteiro_base: ['emissao', 'caldeiraria'],
          observacoes: linhasObs,
          itens: [],
        });
        id = res.id as number;
        setCriadoId(id);
      }

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
          // NÃO navega: fica na tela pra pessoa VER o aviso. O pedido já existe,
          // então clicar em "Enviar para Emissão" de novo só repete o anexo
          // (sem duplicar o pedido), e há o link "Abrir o pedido" no aviso.
          setErro(`O pedido foi criado, mas o anexo da OP falhou: ${d.erro || up.status}. Clique em "Enviar para a Conferência" de novo pra tentar reenviar, ou abra o pedido e anexe por lá.`);
          return;
        }
      }

      // Anexa o(s) desenho(s) do projeto — vão pro acervo "desenhos" do pedido
      // (mesmo endpoint do Flange). Falha aqui não perde o pedido: avisa e segue.
      if (desenhos.length) {
        const token = getToken() || '';
        const falhas: string[] = [];
        for (const d of desenhos) {
          const fd = new FormData();
          fd.append('arquivo', d);
          const up = await fetch(`/api/pedidos/${id}/desenho`, {
            method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: fd,
          });
          if (!up.ok) { const r = await up.json().catch(() => ({})); falhas.push(`${d.name} (${r.erro || up.status})`); }
        }
        if (falhas.length) {
          setErro(`OP registrada, mas ${falhas.length} desenho(s) falharam: ${falhas.join('; ')}. Abra o pedido pra reanexar.`);
          return;
        }
      }

      // Sucesso: NÃO navega. Acumula a OP na lista numerada e reseta o
      // formulário pra próxima — o operador vê 1,2,3,4 aparecendo um abaixo do
      // outro conforme anexa.
      setAnexadas(prev => [...prev, {
        id,
        numero: numero.trim() || 'provisório',
        cliente: cliente.trim() || 'A definir',
        pn: leitura?.ops[0]?.cabecalho?.pn || '',
        produto: leitura?.ops[0]?.produto?.descricao || '',
      }]);
      // reset pra próxima OP
      setNumero(''); setCliente(''); setPrazo(''); setSemPrazo(false); setObs('');
      setArquivo(null); setDesenhos([]);
      setLeitura(null); setErroLeitura(''); setCriadoId(null); setComponentesAbertos(new Set());
      setFileKey(k => k + 1);
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
              {loading ? 'Enviando...' : 'Enviar para a Conferência'}
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
            <li>Informe o nº do pedido, se já tiver — pode deixar em branco e completar depois.</li>
            <li>Anexe o PDF da OP (Ordem de Produção do <b>Omie</b>) — o sistema lê os materiais sozinho, não precisa digitar nada.</li>
            <li>Confira a leitura clicando no produto — é só pra você olhar, não precisa corrigir nada, quem confere de verdade é o PCP.</li>
            <li>Clique em <b>&quot;Enviar para a Conferência&quot;</b> no canto superior direito. Pronto — a OP cai pra Conferência do PCP validar e liberar pra produção.</li>
          </ol>
        </div>

        {/* OPs enviadas nesta sessão — numeradas 1,2,3,4 uma abaixo da outra */}
        {anexadas.length > 0 && (
          <div style={{ background:'#f0fdf4', border:'1px solid #bbf7d0', borderRadius:10, padding:'14px 18px', marginBottom:16, maxWidth:760 }}>
            <div style={{ fontSize:12, fontWeight:700, color:'#166534', textTransform:'uppercase', letterSpacing:.5, marginBottom:10 }}>
              <i className="bi bi-check2-circle" style={{ marginRight:6 }} />Enviadas para a Conferência ({anexadas.length})
            </div>
            <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
              {anexadas.map((op, i) => (
                <a key={op.id} href={`/pedidos/${op.id}`}
                  style={{ display:'flex', alignItems:'center', gap:10, textDecoration:'none', color:'inherit', background:'#fff', border:'1px solid #d1fae5', borderRadius:8, padding:'8px 12px' }}>
                  <span style={{ flexShrink:0, minWidth:24, height:24, borderRadius:12, background:'#16a34a', color:'#fff', fontWeight:800, fontSize:13, display:'inline-flex', alignItems:'center', justifyContent:'center' }}>{i + 1}</span>
                  <div style={{ display:'flex', flexDirection:'column', minWidth:0 }}>
                    <span style={{ fontSize:13, fontWeight:700, color:'#166534' }}>
                      {op.numero}{op.pn ? ` · PN ${op.pn}` : ''}
                    </span>
                    <span style={{ fontSize:11, color:'#4b5563', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                      {[op.cliente, op.produto].filter(Boolean).join(' · ')}
                    </span>
                  </div>
                  <i className="bi bi-box-arrow-up-right" style={{ marginLeft:'auto', color:'#16a34a', fontSize:13 }} />
                </a>
              ))}
            </div>
          </div>
        )}

        {erro && (
          <div style={{ background:'#fef2f2', border:'1px solid #fca5a5', color:'#dc2626', borderRadius:8, padding:'10px 14px', fontSize:13, marginBottom:16, maxWidth:760 }}>
            <i className="bi bi-exclamation-circle" style={{ marginRight:6 }} />{erro}
            {criadoId != null && (
              <div style={{ marginTop:8 }}>
                <a href={`/pedidos/${criadoId}`} style={{ color:'#1a3a5c', fontWeight:700, textDecoration:'underline' }}>
                  Abrir o pedido criado →
                </a>
              </div>
            )}
          </div>
        )}

        {/* Duas colunas: entrada à esquerda, leitura/roteiro à direita — reduz a
            rolagem em tela larga. Em tela estreita (tablet) a direita quebra pra
            baixo (flexWrap). */}
        <div style={{ display:'flex', flexWrap:'wrap', alignItems:'flex-start', gap:16, maxWidth:1200 }}>

          {/* Coluna ESQUERDA — entrada (origem, prazo, anexo, observações) */}
          <div style={{ display:'flex', flexDirection:'column', gap:16, flex:'1 1 340px', minWidth:320, maxWidth:440 }}>

          {/* Origem */}
          <div className="card" style={{ padding:20 }}>
            <div style={{ fontSize:11, fontWeight:700, color:'#1a3a5c', textTransform:'uppercase', letterSpacing:1, marginBottom:14, borderBottom:'2px solid #1a3a5c', paddingBottom:6 }}>
              <i className="bi bi-diagram-3" style={{ marginRight:6 }} />Origem do Pedido
            </div>
            {/* A Caldeiraria trabalha só com OP do Omie — origem fixa (o leitor
                do Omie sempre roda). */}
            <div style={{ display:'flex', gap:10, marginBottom:14 }}>
              <div style={toggleBtn(true)}>
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

          {/* Prazo (previsão de faturamento) */}
          <div className="card" style={{ padding:20 }}>
            <div style={{ fontSize:11, fontWeight:700, color:'#1a3a5c', textTransform:'uppercase', letterSpacing:1, marginBottom:14, borderBottom:'2px solid #1a3a5c', paddingBottom:6 }}>
              <i className="bi bi-calendar-event" style={{ marginRight:6 }} />Prazo
            </div>
            <label className={labelCls}>Previsão de faturamento (Omie)</label>
            <div style={{ display:'flex', alignItems:'center', gap:14, marginTop:6, flexWrap:'wrap' }}>
              <input type="date" value={prazo} disabled={semPrazo}
                onChange={e => setPrazo(e.target.value)}
                style={{ opacity: semPrazo ? 0.5 : 1, width: 190, marginTop: 4 }}
                className="border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white" />
              <label style={{ display:'flex', alignItems:'center', gap:7, fontSize:13, color:'#495057', cursor:'pointer', fontWeight:600 }}>
                <input type="checkbox" checked={semPrazo} onChange={e => setSemPrazo(e.target.checked)} />
                Sem previsão até o momento
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
            <input key={fileKey} id="hrm-file" type="file" accept="application/pdf,image/png,image/jpeg" style={{ display:'none' }}
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

          {/* Anexo de DESENHO(S) — opcional, um ou vários. Separado da OP. */}
          <div className="card" style={{ padding:20 }}>
            <div style={{ fontSize:11, fontWeight:700, color:'#1a3a5c', textTransform:'uppercase', letterSpacing:1, marginBottom:14, borderBottom:'2px solid #1a3a5c', paddingBottom:6 }}>
              <i className="bi bi-rulers" style={{ marginRight:6 }} />Desenho(s) do projeto <span style={{ fontWeight:500, textTransform:'none', color:'#94a3b8' }}>— opcional</span>
            </div>
            <label htmlFor="hrm-desenhos" style={{
              display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:8,
              border:'2px dashed #b6c6da', borderRadius:12, padding:'22px 16px', cursor:'pointer',
              background: desenhos.length ? '#eefaf1' : '#f8faff', textAlign:'center',
            }}>
              <i className={`bi ${desenhos.length ? 'bi-file-earmark-check-fill' : 'bi-cloud-arrow-up'}`} style={{ fontSize:26, color: desenhos.length ? '#198754' : '#6c8bb0' }} />
              <div style={{ fontSize:13, fontWeight:700, color:'#1a3a5c' }}>
                {desenhos.length ? `${desenhos.length} desenho${desenhos.length > 1 ? 's' : ''} selecionado${desenhos.length > 1 ? 's' : ''}` : 'Clique para anexar desenho(s)'}
              </div>
              <div style={{ fontSize:12, color:'#7a8aa0' }}>pode anexar um ou vários — PDF, PNG, JPG — máx. 20 MB cada</div>
            </label>
            <input id="hrm-desenhos" type="file" multiple accept=".pdf,.png,.jpg,.jpeg,.webp" style={{ display:'none' }}
              onChange={e => { const fs = Array.from(e.target.files || []); if (fs.length) setDesenhos(prev => [...prev, ...fs]); e.target.value = ''; }} />
            {desenhos.length > 0 && (
              <div style={{ marginTop:10, display:'flex', flexDirection:'column', gap:6 }}>
                {desenhos.map((d, i) => (
                  <div key={i} style={{ display:'flex', alignItems:'center', gap:8, background:'#f9fafb', border:'1px solid #e5e7eb', borderRadius:6, padding:'5px 10px' }}>
                    <i className="bi bi-file-earmark" style={{ color:'#6b7280', fontSize:13 }} />
                    <span style={{ flex:1, fontSize:12, color:'#334155', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{d.name} <span style={{ color:'#94a3b8' }}>({(d.size/1024/1024).toFixed(2)} MB)</span></span>
                    <button type="button" onClick={() => setDesenhos(prev => prev.filter((_, idx) => idx !== i))}
                      style={{ background:'none', border:'none', color:'#dc2626', cursor:'pointer', fontSize:13 }} title="Remover">
                      <i className="bi bi-trash" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Observações */}
          <div className="card" style={{ padding:20 }}>
            <div style={{ fontSize:11, fontWeight:700, color:'#1a3a5c', textTransform:'uppercase', letterSpacing:1, marginBottom:14, borderBottom:'2px solid #1a3a5c', paddingBottom:6 }}>
              <i className="bi bi-chat-left-text" style={{ marginRight:6 }} />Observações
            </div>
            <textarea value={obs} onChange={e => setObs(e.target.value)} rows={2} className={inputCls} style={{ resize:'vertical' }}
              placeholder="Alguma observação pra Conferência? (opcional)" />
          </div>

          </div>{/* /coluna esquerda */}

          {/* Coluna DIREITA — leitura da OP + por onde a peça vai passar */}
          <div style={{ display:'flex', flexDirection:'column', gap:16, flex:'1 1 480px', minWidth:340 }}>

          {/* Placeholder ilustrado — enche a coluna enquanto não há leitura, com um
              desenho da Caldeiraria e a chamada pra anexar a OP. Some quando lê. */}
          {!leitura && (
            <div className="card" style={{ padding:'36px 24px', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', textAlign:'center', minHeight:440, gap:20 }}>
              <svg viewBox="0 0 360 240" width="100%" style={{ maxWidth:320 }} xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Ilustração da Caldeiraria">
                <defs>
                  <linearGradient id="hrm-vessel" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0" stopColor="#e8f1fb" />
                    <stop offset="1" stopColor="#bcd4ef" />
                  </linearGradient>
                </defs>
                {/* chão */}
                <line x1="24" y1="198" x2="336" y2="198" stroke="#dbe4f0" strokeWidth="3" strokeLinecap="round" />
                {/* vapor */}
                <g fill="#e0ecfa">
                  <circle cx="196" cy="46" r="10" /><circle cx="210" cy="35" r="8" /><circle cx="184" cy="35" r="7" />
                </g>
                {/* suportes (selas) */}
                <path d="M104 198 L118 158 L138 158 L128 198 Z" fill="#a9bdd6" />
                <path d="M250 198 L236 158 L216 158 L226 198 Z" fill="#a9bdd6" />
                {/* corpo do vaso */}
                <rect x="70" y="92" width="220" height="80" rx="40" fill="url(#hrm-vessel)" stroke="#1a3a5c" strokeWidth="2.5" />
                {/* costuras */}
                <ellipse cx="130" cy="132" rx="9" ry="40" fill="none" stroke="#8fb0d6" strokeWidth="2" />
                <ellipse cx="230" cy="132" rx="9" ry="40" fill="none" stroke="#8fb0d6" strokeWidth="2" />
                {/* tampo direito */}
                <ellipse cx="290" cy="132" rx="11" ry="40" fill="#cfe0f2" stroke="#1a3a5c" strokeWidth="2.5" />
                {/* bocal superior + flange */}
                <rect x="172" y="72" width="16" height="24" fill="#1f5f8b" />
                <rect x="166" y="66" width="28" height="9" rx="2" fill="#1a3a5c" />
                {/* tubo/flange à esquerda */}
                <rect x="30" y="124" width="46" height="16" rx="4" fill="#cfe0f2" stroke="#1a3a5c" strokeWidth="2" />
                {/* solda / faísca */}
                <g stroke="#f59e0b" strokeWidth="2.5" strokeLinecap="round">
                  <line x1="96" y1="176" x2="96" y2="163" /><line x1="96" y1="176" x2="85" y2="169" />
                  <line x1="96" y1="176" x2="107" y2="169" /><line x1="96" y1="176" x2="87" y2="185" />
                  <line x1="96" y1="176" x2="105" y2="185" />
                </g>
                <circle cx="96" cy="176" r="4" fill="#fbbf24" />
                <circle cx="112" cy="188" r="2" fill="#f59e0b" /><circle cx="80" cy="190" r="2" fill="#f59e0b" />
              </svg>
              <div>
                <div style={{ fontSize:16, fontWeight:800, color:'#1a3a5c' }}>
                  <i className="bi bi-hammer" style={{ marginRight:8 }} />Caldeiraria
                </div>
                <div style={{ fontSize:13, color:'#7a8aa0', marginTop:6, maxWidth:300, lineHeight:1.5 }}>
                  {lendo ? 'Lendo a OP…' : 'Anexe o PDF da OP ao lado — a leitura dos materiais aparece aqui pra você conferir.'}
                </div>
              </div>
            </div>
          )}

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

              {/* Quadro do total de páginas + renomear pra mandar às áreas */}
              <div style={{ display:'flex', alignItems:'stretch', gap:14, flexWrap:'wrap', marginBottom:16 }}>
                {/* Quadrado: total de páginas do PDF */}
                <div style={{ flex:'0 0 auto', minWidth:120, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:2, background:'#eff6ff', border:'2px solid #bfdbfe', borderRadius:12, padding:'14px 22px' }}>
                  <div style={{ fontSize:38, fontWeight:800, color:'#1d4ed8', lineHeight:1 }}>{leitura.totalPaginas}</div>
                  <div style={{ fontSize:11, fontWeight:700, color:'#1e3a8a', textTransform:'uppercase', letterSpacing:1 }}>
                    {leitura.totalPaginas === 1 ? 'página' : 'páginas'}
                  </div>
                  <div style={{ fontSize:10.5, color:'#64748b' }}>total do PDF</div>
                </div>

                {/* Renomear por descrição do produto e baixar pra encaminhar */}
                <div style={{ flex:'1 1 260px', minWidth:240, background:'#f8faff', border:'1px solid #dbe4f0', borderRadius:12, padding:'12px 14px' }}>
                  <label className={labelCls}>Nome do arquivo pra enviar às áreas</label>
                  <div style={{ display:'flex', alignItems:'center', gap:6, marginTop:4, flexWrap:'wrap' }}>
                    <div style={{ flex:'1 1 180px', display:'flex', alignItems:'center', border:'1px solid #cbd5e1', borderRadius:8, background:'#fff', overflow:'hidden' }}>
                      <input value={nomeEnvio} onChange={e => setNomeEnvio(e.target.value)}
                        placeholder="descrição do produto"
                        style={{ flex:1, minWidth:0, border:'none', outline:'none', padding:'8px 10px', fontSize:13, color:'#1a3a5c', fontWeight:600 }} />
                      <span style={{ padding:'8px 10px', fontSize:12, color:'#94a3b8', background:'#f1f5f9', borderLeft:'1px solid #e2e8f0' }}>.pdf</span>
                    </div>
                    <button type="button" onClick={baixarRenomeada} disabled={!arquivo}
                      style={{ background:'#1a3a5c', color:'#fff', border:'none', borderRadius:8, padding:'9px 14px', fontSize:13, fontWeight:700, cursor: arquivo ? 'pointer' : 'not-allowed', opacity: arquivo ? 1 : .5, whiteSpace:'nowrap' }}>
                      <i className="bi bi-download" style={{ marginRight:6 }} />Baixar renomeada
                    </button>
                  </div>
                  <div style={{ fontSize:11, color:'#7a8aa0', marginTop:6 }}>
                    Baixa o mesmo PDF com esse nome. O anexo enviado ao sistema continua o original.
                  </div>
                </div>
              </div>

              {leitura.ops.length === 0 && (
                <div style={{ fontSize:13, color:'#92400e' }}>Não consegui identificar os itens neste PDF. Confira se é uma Ordem de Produção do Omie.</div>
              )}

              <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
                {leitura.ops.map((op, idx) => {
                  const multi = leitura.ops.length > 1;
                  const aberto = componentesAbertos.has(idx);
                  // Gate pela QUALIDADE pós-decodificação (plausibilidade do que
                  // saiu), não pela legibilidade nativa (confianca). Só esconde os
                  // dados quando nem isso foi recuperado — aí mostra só a
                  // identificação (PN/PO/NS, da anotação, NÃO embaralhada). Entre
                  // 0.25 e 0.7 mostra os dados COM aviso de conferir (ex.: OP muito
                  // embaralhada onde as descrições saem mas os códigos não). Anexa
                  // do mesmo jeito; o PCP confere na Conferência.
                  const qual = op.qualidade ?? op.confianca;
                  // Código coerente: no Totvs é numérico 4+ dígitos (a cifra pode
                  // gerar lixo com cara de código, então o check é estrito). No Omie
                  // o texto é limpo e os códigos são alfanuméricos (ex.: OSSSJP...,
                  // FL150...) — aceita qualquer código não-vazio.
                  const codigoCoerente = (c: string) => op.origem === 'omie'
                    ? !!(c || '').trim()
                    : /^\d{4,}$/.test((c || '').replace(/\s/g, ''));
                  const codOk = op.materiais.filter(m => codigoCoerente(m.codigo)).length;
                  const fracCodOk = op.materiais.length ? codOk / op.materiais.length : 1;
                  // "Não auditável": PDF nativamente ilegível (cifra de substituição
                  // TOTAL, confianca~0) E a decodificação não recuperou os CÓDIGOS dos
                  // materiais. Mostrar isso como "leitura parcial" induziria o PCP a
                  // confiar num código inventado pela decodificação (ex.: OP-013466:
                  // confianca=0, qual=0.333, 12/12 componentes sem código coerente ->
                  // códigos saíam como "03S2??"). Melhor admitir que não leu.
                  // OPs de fonte quase-identidade (ex.: 013169, confianca≈0.86) nunca
                  // caem aqui — não quebra o que já funciona.
                  const naoAuditavel = op.confianca < 0.05 && op.materiais.length > 0 && fracCodOk < 0.5;
                  const leituraRuim = qual < 0.25 || naoAuditavel;
                  const conferir = qual < 0.7;
                  const avisos = (op.validacao?.avisos || []).filter(a => !a.includes('lidos por OCR'));
                  const avisosOcr = (op.validacao?.avisos || []).filter(a => a.includes('lidos por OCR'));
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
                        ) : conferir && (
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
                              {/* Cabeçalho Cliente/Quantidade/Emissão/Entrega/Situação — best-
                                  effort (ver opReader.parseIdentificacao); campo que não casou
                                  no PDF fica de fora aqui em vez de mostrar vazio. */}
                              {op.identificacao && (op.identificacao.clienteNome || op.identificacao.quantidade || op.identificacao.emissao || op.identificacao.entrega || op.identificacao.situacao) && (
                                <div style={{ display:'flex', flexWrap:'wrap', gap:'4px 16px', fontSize:12, fontWeight:600, color:'#991b1b', marginTop:8, paddingTop:8, borderTop:'1px dashed #f3b8b8' }}>
                                  {op.identificacao.clienteNome && <span><span style={{ opacity:.6 }}>Cliente</span> {op.identificacao.clienteNome}</span>}
                                  {op.identificacao.quantidade && <span><span style={{ opacity:.6 }}>Qtde</span> {op.identificacao.quantidade} {op.identificacao.unidade}</span>}
                                  {op.identificacao.emissao && <span><span style={{ opacity:.6 }}>Emissão</span> {op.identificacao.emissao.split('-').reverse().join('/')}</span>}
                                  {op.identificacao.entrega && <span><span style={{ opacity:.6 }}>Entrega</span> {op.identificacao.entrega.split('-').reverse().join('/')}</span>}
                                  {op.identificacao.situacao && <span><span style={{ opacity:.6 }}>Situação</span> {op.identificacao.situacao}</span>}
                                </div>
                              )}
                            </div>
                          )}

                          {/* Identificação do Omie (sem quadro vermelho PN/PO/NS):
                              Nº da OP, Qtde, Situação e Previsão de Conclusão lidos
                              direto do PDF limpo. A Previsão de Conclusão é a data da
                              própria OP (não é a previsão de faturamento) — por isso
                              NÃO pré-preenche o prazo, só mostra pra conferência. */}
                          {op.origem === 'omie' && (op.numero || op.identificacao?.quantidade || op.identificacao?.situacao || op.identificacao?.previsaoConclusao) && (
                            <div style={{ border:'1px solid #cfe0f2', borderRadius:10, padding:'12px 14px', marginBottom:14, background:'#f8faff' }}>
                              <div style={{ fontSize:10.5, fontWeight:700, color:'#1a3a5c', textTransform:'uppercase', letterSpacing:1, marginBottom:6 }}>
                                <i className="bi bi-bookmark-star" style={{ marginRight:5 }} />Identificação
                              </div>
                              <div style={{ display:'flex', flexWrap:'wrap', gap:'4px 16px', fontSize:12.5, fontWeight:600, color:'#1a3a5c' }}>
                                {op.numero && <span><span style={{ opacity:.6 }}>OP nº</span> {op.numero}</span>}
                                {op.identificacao?.quantidade && <span><span style={{ opacity:.6 }}>Qtde</span> {op.identificacao.quantidade} {op.identificacao.unidade}</span>}
                                {op.identificacao?.situacao && <span><span style={{ opacity:.6 }}>Situação</span> {op.identificacao.situacao}</span>}
                                {op.identificacao?.previsaoConclusao && <span><span style={{ opacity:.6 }}>Previsão de Conclusão</span> {op.identificacao.previsaoConclusao.split('-').reverse().join('/')}</span>}
                              </div>
                            </div>
                          )}

                          {leituraRuim && (
                            <div style={{ fontSize:13, color:'#92400e', background:'#fffbeb', border:'1px solid #fcd34d', borderRadius:8, padding:'10px 12px', marginBottom:14 }}>
                              <i className="bi bi-exclamation-triangle" style={{ marginRight:6 }} />
                              Não consegui ler os <b>materiais</b> e o <b>roteiro</b> automaticamente nesta OP (a fonte do PDF veio muito embaralhada). A identificação acima (PN/PO/NS) está correta. <b>Anexe a OP mesmo assim</b> — o PCP confere na Conferência. Se der, exporte a OP do Totvs em Excel/TXT pra leitura 100% confiável.
                            </div>
                          )}

                          {/* Nota de método (não é alerta de qualidade — a leitura por
                              OCR pode ter dado certo, então mostra sempre que foi
                              usada, mesmo quando a qualidade final ficou boa). */}
                          {!leituraRuim && avisosOcr.length > 0 && (
                            <div style={{ fontSize:12.5, color:'#1e40af', background:'#eff6ff', border:'1px solid #bfdbfe', borderRadius:8, padding:'8px 12px', marginBottom:14 }}>
                              <i className="bi bi-camera" style={{ marginRight:6 }} />
                              {avisosOcr.join(' ')}
                            </div>
                          )}

                          {/* Leitura PARCIAL: mostra os dados que saíram (produto,
                              descrições, roteiro) COM aviso claro do que ficou
                              incerto (ex.: códigos numéricos numa OP muito
                              embaralhada). Nada é inventado — o que não decodificou
                              vem sinalizado, pro PCP conferir no PDF. */}
                          {!leituraRuim && conferir && avisos.length > 0 && (
                            <div style={{ fontSize:12.5, color:'#92400e', background:'#fffbeb', border:'1px solid #fcd34d', borderRadius:8, padding:'10px 12px', marginBottom:14 }}>
                              <div style={{ fontWeight:700, marginBottom:4 }}>
                                <i className="bi bi-exclamation-triangle" style={{ marginRight:6 }} />
                                Leitura parcial — confira no PDF antes de usar
                              </div>
                              <ul style={{ margin:'4px 0 0', paddingLeft:18 }}>
                                {avisos.map((a, i) => <li key={i}>{a}</li>)}
                              </ul>
                            </div>
                          )}
                          {!leituraRuim && op.materiais.length > 0 && (
                            <div style={{ overflowX:'auto', marginTop:16 }}>
                              <span className={labelCls}>Componentes</span>
                              <div style={{ fontSize:12, color:'#1f5f8b', margin:'2px 0 4px' }}>
                                <i className="bi bi-info-circle" style={{ marginRight:5 }} />
                                Leitura só pra conferência — o roteiro (por onde a peça passa) é definido pelo PCP na Conferência.
                                {' '}Desmarque o que não for material de verdade (ex.: o próprio produto) — é só pra você conferir aqui.
                              </div>
                              <table style={{ width:'100%', borderCollapse:'collapse', marginTop:6, fontSize:12.5, minWidth:520 }}>
                                <thead>
                                  <tr style={{ textAlign:'left', color:'#6c757d', borderBottom:'1px solid #e9ecef' }}>
                                    <th style={{ padding:'5px 8px', width:26 }}>
                                      <input type="checkbox"
                                        checked={op.materiais.every((_, i) => materialSelecionado(idx, i))}
                                        onChange={e => toggleTodosMateriais(idx, op.materiais.length, e.target.checked)}
                                        title="Selecionar/desmarcar todos" style={{ cursor:'pointer' }} />
                                    </th>
                                    <th style={{ padding:'5px 8px' }}>Código</th><th style={{ padding:'5px 8px' }}>Descrição</th>
                                    <th style={{ padding:'5px 8px' }}>Qtd</th><th style={{ padding:'5px 8px' }}>Un</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {op.materiais.map((m, i) => {
                                    // Código só quando numericamente coerente; senão "—" (a
                                    // decodificação não recuperou este código).
                                    const codOk = codigoCoerente(m.codigo);
                                    const sel = materialSelecionado(idx, i);
                                    return (
                                      <tr key={i} style={{ borderBottom:'1px solid #f1f3f5', opacity: sel ? 1 : .45 }}>
                                        <td style={{ padding:'5px 8px' }}>
                                          <input type="checkbox" checked={sel} onChange={() => toggleMaterial(idx, i)} style={{ cursor:'pointer' }} />
                                        </td>
                                        {codOk
                                          ? <td style={{ padding:'5px 8px', fontWeight:700, color:'#1a3a5c', whiteSpace:'nowrap', textDecoration: sel ? 'none' : 'line-through' }}>{m.codigo}</td>
                                          : <td style={{ padding:'5px 8px', color:'#b91c1c', whiteSpace:'nowrap', textDecoration: sel ? 'none' : 'line-through' }} title="Código não pôde ser lido com segurança — confira no PDF">—</td>}
                                        <td style={{ padding:'5px 8px', textDecoration: sel ? 'none' : 'line-through' }}>{m.descricao}</td>
                                        <td style={{ padding:'5px 8px', whiteSpace:'nowrap', textDecoration: sel ? 'none' : 'line-through' }}>{formatarQtd(m.quantidade)}</td>
                                        <td style={{ padding:'5px 8px', textDecoration: sel ? 'none' : 'line-through' }}>{m.unidade}</td>
                                      </tr>
                                    );
                                  })}
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


          </div>{/* /coluna direita */}
        </div>
      </form>
    </AuthGuard>
  );
}
