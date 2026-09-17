'use client';
import { useState } from 'react';
import AuthGuard from '@/components/AuthGuard';
import { criarPedido } from '@/lib/api';
import { getToken } from '@/lib/auth';
import { FABRICAS, NOMES, PROCESSO_CALDEIRARIA } from '@/lib/types';

// Setores selecionáveis da Caldeiraria (fábrica única) — é a lista real do
// processo. O operador monta com eles o "por onde a peça vai passar" na
// abertura. Inspeção CQ ('qualidade') pode entrar mais de uma vez.
const SETORES_CALD = FABRICAS.find(f => f.cod === 'caldeiraria')?.setores || [];

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

  // Por onde a peça vai passar — roteiro da Caldeiraria escolhido pelo OPERADOR
  // na abertura (lista ordenada de códigos de setor). Persiste no pedido como
  // roteiro_base = ['emissao', ...roteiroSel]. Inspeção CQ pode repetir; vazio
  // cai no mínimo ['emissao','caldeiraria']. Some se trocar o arquivo.
  const [roteiroSel, setRoteiroSel] = useState<string[]>([]);
  const addEtapa = (cod: string) => setRoteiroSel(r => [...r, cod]);
  const removerEtapa = (i: number) => setRoteiroSel(r => r.filter((_, idx) => idx !== i));
  const moverEtapa = (i: number, dir: -1 | 1) => setRoteiroSel(r => {
    const j = i + dir; if (j < 0 || j >= r.length) return r;
    const n = r.slice(); [n[i], n[j]] = [n[j], n[i]]; return n;
  });
  const carregarRoteiroPadrao = () => setRoteiroSel(PROCESSO_CALDEIRARIA.slice());

  // Por onde CADA componente passa. O operador seleciona 1+ componentes lidos da
  // OP e monta o caminho DAQUELA seleção (um "grupo"); componentes diferentes
  // podem ter caminhos diferentes. `selComps` = componentes marcados pro grupo
  // que está sendo montado agora; `roteiroSel` (acima) = o caminho desse grupo.
  // Persiste no pedido via observações (bloco legível) — o roteiro_base do pedido
  // casca segue mínimo emissao→caldeiraria (ver o submit e a rota /api/pedidos,
  // que detecta o pedido HRM por esse roteiro). O PCP confirma na Conferência.
  // Modo do caminho: 'mesmo' = um caminho só pra TODOS os componentes; 'cada' =
  // cada componente (ou grupo) com o seu (seleção na tabela). Se os componentes
  // se reencontram depois na produção, isso é assunto de APONTAMENTO, não daqui.
  const [modo, setModo] = useState<'mesmo' | 'cada'>('mesmo');
  const [grupos, setGrupos] = useState<{ comps: string[]; roteiro: string[] }[]>([]);
  const [selComps, setSelComps] = useState<string[]>([]);
  const materiaisLidos = leitura?.ops?.flatMap(o => o.materiais) ?? [];
  const compsAtribuidos = new Set(grupos.flatMap(g => g.comps));
  const compsPendentes = materiaisLidos.filter(m => !compsAtribuidos.has(m.codigo));
  const nomeComp = (cod: string) => {
    const m = materiaisLidos.find(x => x.codigo === cod);
    return m ? `${m.descricao || m.codigo} (${cod})` : cod;
  };
  const toggleComp = (cod: string) => {
    if (selComps.includes(cod)) { setSelComps(s => s.filter(x => x !== cod)); return; }
    // Reatribuição: se o componente já está num grupo, tira de lá (e descarta o
    // grupo se ficar vazio) antes de entrar na nova seleção.
    if (compsAtribuidos.has(cod))
      setGrupos(gs => gs.map(g => ({ ...g, comps: g.comps.filter(c => c !== cod) })).filter(g => g.comps.length));
    setSelComps(s => [...s, cod]);
  };
  const salvarGrupo = () => {
    if (!selComps.length || !roteiroSel.length) return;
    setGrupos(g => [...g, { comps: [...selComps], roteiro: [...roteiroSel] }]);
    setSelComps([]); setRoteiroSel([]);
  };
  const removerGrupo = (i: number) => setGrupos(g => g.filter((_, idx) => idx !== i));
  const editarGrupo = (i: number) => {
    const g = grupos[i]; if (!g) return;
    setSelComps(g.comps); setRoteiroSel(g.roteiro);
    setGrupos(gs => gs.filter((_, idx) => idx !== i));
  };

  async function selecionarArquivo(f: File | null, origemForcada?: Origem) {
    setArquivo(f);
    setLeitura(null); setErroLeitura(''); setComponentesAbertos(new Set()); setNomeEnvio('');
    setGrupos([]); setSelComps([]); setRoteiroSel([]); setModo('mesmo');
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

        // Monta os "grupos finais" conforme o modo:
        //  - 'mesmo': UM caminho pra todos os componentes lidos.
        //  - 'cada' : os grupos definidos + um grupo ainda não "Salvo" (seleção +
        //             caminho montados mas sem clicar em Salvar), pra não perder.
        const todosCods = materiaisLidos.map(m => m.codigo).filter(Boolean);
        const gruposFinais = modo === 'mesmo'
          ? (roteiroSel.length && todosCods.length ? [{ comps: todosCods, roteiro: [...roteiroSel] }] : [])
          : (selComps.length && roteiroSel.length
              ? [...grupos, { comps: [...selComps], roteiro: [...roteiroSel] }]
              : grupos);
        const atribFinais = new Set(gruposFinais.flatMap(g => g.comps));
        const pendFinais = materiaisLidos.filter(m => !atribFinais.has(m.codigo));
        const linhasCaminho = gruposFinais.map(g => {
          const rota = g.roteiro.map(c => NOMES[c] || c).join(' → ');
          const alvo = modo === 'mesmo'
            ? `Todos os componentes (${g.comps.join(', ')})`
            : g.comps.map(nomeComp).join(' + ');
          return `• ${alvo}: ${rota}`;
        });
        const linhasPend = pendFinais.map(m => `• ${m.descricao || m.codigo} (${m.codigo}): (definir na Conferência)`);
        const blocoCaminho = (linhasCaminho.length || linhasPend.length)
          ? [modo === 'mesmo' ? 'Por onde a peça passa (mesmo caminho pra todos):' : 'Por onde cada peça passa:',
             ...linhasCaminho, ...linhasPend].join('\n')
          : '';

        const linhasObs = [
          `Origem: ${origemLabel[origem]}`,
          obs.trim(),
          blocoCaminho,
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
      setArquivo(null); setDesenhos([]); setRoteiroSel([]); setGrupos([]); setSelComps([]); setModo('mesmo');
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
                                <i className={modo === 'cada' ? 'bi bi-hand-index-thumb' : 'bi bi-signpost-2'} style={{ marginRight:5 }} />
                                {modo === 'cada'
                                  ? <>Toque num componente (ou vários) pra selecionar — depois defina o caminho em <b>“Por onde a peça vai passar”</b>.</>
                                  : <>Todos seguem o <b>mesmo caminho</b> (definido em “Por onde a peça vai passar”). Pra caminhos diferentes, mude pra <b>“Cada um o seu”</b>.</>}
                              </div>
                              <table style={{ width:'100%', borderCollapse:'collapse', marginTop:6, fontSize:12.5, minWidth:520 }}>
                                <thead>
                                  <tr style={{ textAlign:'left', color:'#6c757d', borderBottom:'1px solid #e9ecef' }}>
                                    <th style={{ padding:'5px 8px', width:34 }}></th>
                                    <th style={{ padding:'5px 8px' }}>Código</th><th style={{ padding:'5px 8px' }}>Descrição</th>
                                    <th style={{ padding:'5px 8px' }}>Qtd</th><th style={{ padding:'5px 8px' }}>Un</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {op.materiais.map((m, i) => {
                                    // Código só quando numericamente coerente; senão "—" (a
                                    // decodificação não recuperou este código). Só dá pra
                                    // SELECIONAR quando o código é coerente (é a chave do grupo).
                                    const codOk = codigoCoerente(m.codigo);
                                    // Seleção por linha só no modo 'cada' (no 'mesmo', todos
                                    // seguem o mesmo caminho — não há o que selecionar).
                                    const selectable = codOk && modo === 'cada';
                                    const sel = selectable && selComps.includes(m.codigo);
                                    const jaTem = selectable && compsAtribuidos.has(m.codigo);
                                    return (
                                      <tr key={i} onClick={selectable ? () => toggleComp(m.codigo) : undefined}
                                        style={{
                                          borderBottom:'1px solid #f1f3f5',
                                          cursor: selectable ? 'pointer' : 'default',
                                          background: sel ? '#e8f0fb' : jaTem ? '#eefaf2' : 'transparent',
                                        }}>
                                        <td style={{ padding:'5px 8px', textAlign:'center' }}>
                                          {selectable && <i className={sel ? 'bi bi-check-square-fill' : jaTem ? 'bi bi-check-circle-fill' : 'bi bi-square'}
                                            style={{ fontSize:14, color: sel ? '#1a3a5c' : jaTem ? '#2f7d5b' : '#b8c4d4' }} />}
                                        </td>
                                        {codOk
                                          ? <td style={{ padding:'5px 8px', fontWeight:700, color:'#1a3a5c', whiteSpace:'nowrap' }}>{m.codigo}</td>
                                          : <td style={{ padding:'5px 8px', color:'#b91c1c', whiteSpace:'nowrap' }} title="Código não pôde ser lido com segurança — confira no PDF">—</td>}
                                        <td style={{ padding:'5px 8px' }}>
                                          {m.descricao}
                                          {jaTem && <span style={{ marginLeft:8, fontSize:10.5, fontWeight:700, color:'#2f7d5b', background:'#e8f2ec', border:'1px solid #bbe0cb', borderRadius:6, padding:'1px 6px', whiteSpace:'nowrap' }}>✓ com caminho</span>}
                                        </td>
                                        <td style={{ padding:'5px 8px', whiteSpace:'nowrap' }}>{m.quantidade}</td>
                                        <td style={{ padding:'5px 8px' }}>{m.unidade}</td>
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

          {/* Por onde CADA peça vai passar — aparece após anexar a OP. O operador
              SELECIONA um ou mais componentes lidos e monta o caminho daquela
              seleção (um "grupo"); componentes diferentes podem ter caminhos
              diferentes. O caminho vai no pedido via observações (bloco "Por onde
              cada peça passa"); o PCP confirma na Conferência. */}
          {arquivo && (
          <div className="card" style={{ padding:20 }}>
            <div style={{ marginBottom:14, borderBottom:'2px solid #1a3a5c', paddingBottom:6 }}>
              <span style={{ fontSize:11, fontWeight:700, color:'#1a3a5c', textTransform:'uppercase', letterSpacing:1 }}>
                <i className="bi bi-signpost-split" style={{ marginRight:6 }} />Por onde a peça vai passar
              </span>
            </div>

            {materiaisLidos.length === 0 ? (
              <div style={{ fontSize:13, color:'#7a8aa0', background:'#f8faff', border:'1px dashed #cfe0f2', borderRadius:10, padding:'14px 16px' }}>
                <i className="bi bi-info-circle" style={{ marginRight:6 }} />
                {lendo ? 'Lendo a OP…' : 'Assim que a leitura trouxer os componentes, selecione cada um (ou vários) e defina o caminho deles aqui.'}
              </div>
            ) : (
              <>
                {/* Escolha do modo. Se as peças se reencontram depois na produção
                    pra se juntar, isso é APONTAMENTO — não se define aqui. */}
                <div style={{ display:'flex', gap:8, marginBottom:14 }}>
                  {([['mesmo', 'bi-signpost-2', 'Mesmo caminho pra todos'], ['cada', 'bi-diagram-3', 'Cada um o seu']] as const).map(([val, ic, txt]) => (
                    <button key={val} type="button"
                      onClick={() => { if (val !== modo) { setModo(val); setRoteiroSel([]); setSelComps([]); setGrupos([]); } }}
                      style={{
                        flex:1, display:'inline-flex', alignItems:'center', justifyContent:'center', gap:7,
                        borderRadius:10, padding:'9px 12px', fontSize:12.5, fontWeight:700, cursor:'pointer',
                        background: modo === val ? '#1a3a5c' : '#fff',
                        color: modo === val ? '#fff' : '#1a3a5c',
                        border: modo === val ? '1px solid #1a3a5c' : '1px solid #cfe0f2',
                      }}>
                      <i className={`bi ${ic}`} />{txt}
                    </button>
                  ))}
                </div>

                {/* MODO "mesmo": um caminho único aplicado a TODOS os componentes. */}
                {modo === 'mesmo' && (
                  <div style={{ background:'#f8faff', border:'1px solid #e3ecf7', borderRadius:12, padding:'14px 16px' }}>
                    <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:8, flexWrap:'wrap', marginBottom:10 }}>
                      <span style={{ fontSize:12.5, fontWeight:700, color:'#1a3a5c' }}>
                        Caminho de <span style={{ color:'#1f5f8b' }}>todos os {materiaisLidos.length} componente(s)</span>
                      </span>
                      <div style={{ display:'flex', gap:8 }}>
                        <button type="button" onClick={carregarRoteiroPadrao}
                          style={{ background:'#eef4fb', border:'1px solid #cfe0f2', color:'#1a3a5c', borderRadius:8, padding:'5px 10px', fontSize:11.5, fontWeight:700, cursor:'pointer' }}>
                          <i className="bi bi-list-check" style={{ marginRight:5 }} />Roteiro padrão
                        </button>
                        {roteiroSel.length > 0 && (
                          <button type="button" onClick={() => setRoteiroSel([])}
                            style={{ background:'#fff', border:'1px solid #e5e7eb', color:'#94a3b8', borderRadius:8, padding:'5px 10px', fontSize:11.5, fontWeight:700, cursor:'pointer' }}>Limpar</button>
                        )}
                      </div>
                    </div>
                    {roteiroSel.length === 0 ? (
                      <div style={{ fontSize:12.5, color:'#7a8aa0', marginBottom:4 }}>Clique nos setores abaixo na ordem do processo, ou use o roteiro padrão.</div>
                    ) : (
                      <ol style={{ listStyle:'none', margin:'0 0 10px', padding:0, display:'flex', flexDirection:'column', gap:6 }}>
                        {roteiroSel.map((cod, i) => (
                          <li key={i} style={{ display:'flex', alignItems:'center', gap:8, background:'#fff', border:'1px solid #cfe0f2', borderRadius:10, padding:'8px 8px 8px 12px' }}>
                            <span style={{ flexShrink:0, minWidth:22, height:22, borderRadius:11, background:'#1a3a5c', color:'#fff', fontWeight:800, fontSize:12, display:'inline-flex', alignItems:'center', justifyContent:'center' }}>{i + 1}</span>
                            <span style={{ flex:1, minWidth:0, fontSize:13.5, fontWeight:700, color:'#1a3a5c' }}>{NOMES[cod] || cod}</span>
                            <button type="button" onClick={() => moverEtapa(i, -1)} disabled={i === 0} title="Subir" style={{ background:'none', border:'none', cursor:i===0?'default':'pointer', color:i===0?'#d1d5db':'#1a3a5c', fontSize:14, padding:'0 3px' }}><i className="bi bi-arrow-up" /></button>
                            <button type="button" onClick={() => moverEtapa(i, 1)} disabled={i === roteiroSel.length - 1} title="Descer" style={{ background:'none', border:'none', cursor:i===roteiroSel.length-1?'default':'pointer', color:i===roteiroSel.length-1?'#d1d5db':'#1a3a5c', fontSize:14, padding:'0 3px' }}><i className="bi bi-arrow-down" /></button>
                            <button type="button" onClick={() => removerEtapa(i)} title="Remover" style={{ background:'none', border:'none', cursor:'pointer', color:'#94a3b8', fontSize:14, padding:'0 3px' }}><i className="bi bi-x-lg" /></button>
                          </li>
                        ))}
                      </ol>
                    )}
                    <span className={labelCls}>Adicionar etapa (clique pra incluir no fim — a Inspeção CQ pode repetir)</span>
                    <div style={{ display:'flex', flexWrap:'wrap', gap:6, marginTop:6 }}>
                      {SETORES_CALD.map(cod => (
                        <button key={cod} type="button" onClick={() => addEtapa(cod)}
                          style={{ display:'inline-flex', alignItems:'center', gap:5, background:'#fff', border:'1px dashed #cfe0f2', color:'#1a3a5c', borderRadius:20, padding:'5px 12px', fontSize:12.5, fontWeight:700, cursor:'pointer' }}>
                          <i className="bi bi-plus-lg" style={{ fontSize:11 }} />{NOMES[cod] || cod}
                        </button>
                      ))}
                    </div>
                    {roteiroSel.length > 0 && (
                      <div style={{ marginTop:12, fontSize:12, color:'#2f7d5b', background:'#e8f2ec', border:'1px solid #bbe0cb', borderRadius:8, padding:'8px 12px' }}>
                        <i className="bi bi-check2-circle" style={{ marginRight:6 }} />
                        Pronto — os {materiaisLidos.length} componentes vão por esse caminho. É só <b>Enviar para a Conferência</b>.
                      </div>
                    )}
                  </div>
                )}

                {/* MODO "cada": seleção por componente na tabela + grupos. */}
                {modo === 'cada' && (
                <>
                {/* Passo 1 — a seleção é feita na tabela de Componentes (acima); aqui
                    é só o resumo do que está selecionado agora (clicar remove). */}
                <span className={labelCls}>1. Componentes selecionados</span>
                {selComps.length === 0 ? (
                  <div style={{ fontSize:12.5, color:'#7a8aa0', background:'#f8faff', border:'1px dashed #cfe0f2', borderRadius:10, padding:'10px 14px', margin:'6px 0 14px' }}>
                    <i className="bi bi-arrow-up" style={{ marginRight:6 }} />
                    Toque num componente (ou vários) na tabela <b>Componentes</b> acima pra começar.
                  </div>
                ) : (
                  <div style={{ display:'flex', flexWrap:'wrap', gap:8, marginTop:6, marginBottom:14 }}>
                    {selComps.map(cod => {
                      const m = materiaisLidos.find(x => x.codigo === cod);
                      return (
                        <button key={cod} type="button" onClick={() => toggleComp(cod)} title="Clique pra tirar da seleção"
                          style={{ display:'inline-flex', alignItems:'center', gap:6, borderRadius:10, padding:'7px 12px', fontSize:12.5, fontWeight:700, cursor:'pointer', maxWidth:'100%', background:'#1a3a5c', color:'#fff', border:'1px solid #1a3a5c' }}>
                          <span style={{ whiteSpace:'nowrap' }}>{cod}</span>
                          {m && <span style={{ fontWeight:500, opacity:.85, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', maxWidth:170 }}>{m.descricao}</span>}
                          <i className="bi bi-x-lg" style={{ fontSize:11 }} />
                        </button>
                      );
                    })}
                  </div>
                )}

                {/* Passo 2 — montar o caminho da seleção */}
                {selComps.length > 0 && (
                  <div style={{ marginTop:4, background:'#f8faff', border:'1px solid #e3ecf7', borderRadius:12, padding:'14px 16px' }}>
                    <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:8, flexWrap:'wrap', marginBottom:10 }}>
                      <span style={{ fontSize:12.5, fontWeight:700, color:'#1a3a5c' }}>
                        2. Caminho para <span style={{ color:'#1f5f8b' }}>{selComps.length} selecionado(s)</span>
                      </span>
                      <div style={{ display:'flex', gap:8 }}>
                        <button type="button" onClick={carregarRoteiroPadrao}
                          style={{ background:'#eef4fb', border:'1px solid #cfe0f2', color:'#1a3a5c', borderRadius:8, padding:'5px 10px', fontSize:11.5, fontWeight:700, cursor:'pointer' }}>
                          <i className="bi bi-list-check" style={{ marginRight:5 }} />Roteiro padrão
                        </button>
                        {roteiroSel.length > 0 && (
                          <button type="button" onClick={() => setRoteiroSel([])}
                            style={{ background:'#fff', border:'1px solid #e5e7eb', color:'#94a3b8', borderRadius:8, padding:'5px 10px', fontSize:11.5, fontWeight:700, cursor:'pointer' }}>
                            Limpar
                          </button>
                        )}
                      </div>
                    </div>

                    {roteiroSel.length === 0 ? (
                      <div style={{ fontSize:12.5, color:'#7a8aa0', marginBottom:4 }}>
                        Clique nos setores abaixo na ordem do processo, ou use o roteiro padrão.
                      </div>
                    ) : (
                      <ol style={{ listStyle:'none', margin:'0 0 10px', padding:0, display:'flex', flexDirection:'column', gap:6 }}>
                        {roteiroSel.map((cod, i) => (
                          <li key={i} style={{ display:'flex', alignItems:'center', gap:8, background:'#fff', border:'1px solid #cfe0f2', borderRadius:10, padding:'8px 8px 8px 12px' }}>
                            <span style={{ flexShrink:0, minWidth:22, height:22, borderRadius:11, background:'#1a3a5c', color:'#fff', fontWeight:800, fontSize:12, display:'inline-flex', alignItems:'center', justifyContent:'center' }}>{i + 1}</span>
                            <span style={{ flex:1, minWidth:0, fontSize:13.5, fontWeight:700, color:'#1a3a5c' }}>{NOMES[cod] || cod}</span>
                            <button type="button" onClick={() => moverEtapa(i, -1)} disabled={i === 0} title="Subir" style={{ background:'none', border:'none', cursor:i===0?'default':'pointer', color:i===0?'#d1d5db':'#1a3a5c', fontSize:14, padding:'0 3px' }}><i className="bi bi-arrow-up" /></button>
                            <button type="button" onClick={() => moverEtapa(i, 1)} disabled={i === roteiroSel.length - 1} title="Descer" style={{ background:'none', border:'none', cursor:i===roteiroSel.length-1?'default':'pointer', color:i===roteiroSel.length-1?'#d1d5db':'#1a3a5c', fontSize:14, padding:'0 3px' }}><i className="bi bi-arrow-down" /></button>
                            <button type="button" onClick={() => removerEtapa(i)} title="Remover" style={{ background:'none', border:'none', cursor:'pointer', color:'#94a3b8', fontSize:14, padding:'0 3px' }}><i className="bi bi-x-lg" /></button>
                          </li>
                        ))}
                      </ol>
                    )}

                    <span className={labelCls}>Adicionar etapa (clique pra incluir no fim — a Inspeção CQ pode repetir)</span>
                    <div style={{ display:'flex', flexWrap:'wrap', gap:6, marginTop:6, marginBottom:12 }}>
                      {SETORES_CALD.map(cod => (
                        <button key={cod} type="button" onClick={() => addEtapa(cod)}
                          style={{ display:'inline-flex', alignItems:'center', gap:5, background:'#fff', border:'1px dashed #cfe0f2', color:'#1a3a5c', borderRadius:20, padding:'5px 12px', fontSize:12.5, fontWeight:700, cursor:'pointer' }}>
                          <i className="bi bi-plus-lg" style={{ fontSize:11 }} />{NOMES[cod] || cod}
                        </button>
                      ))}
                    </div>

                    <button type="button" onClick={salvarGrupo} disabled={!roteiroSel.length}
                      style={{ width:'100%', background: roteiroSel.length ? '#1a3a5c' : '#c9d4e2', border:'none', color:'#fff', borderRadius:8, padding:'9px 12px', fontSize:13, fontWeight:700, cursor: roteiroSel.length ? 'pointer' : 'default' }}>
                      <i className="bi bi-check2-circle" style={{ marginRight:6 }} />Salvar caminho pra seleção
                    </button>
                  </div>
                )}

                {/* Caminhos já definidos (grupos) */}
                {grupos.length > 0 && (
                  <div style={{ marginTop:16 }}>
                    <span className={labelCls}>Caminhos definidos</span>
                    <div style={{ display:'flex', flexDirection:'column', gap:8, marginTop:6 }}>
                      {grupos.map((g, gi) => (
                        <div key={gi} style={{ border:'1px solid #cfe0f2', borderRadius:10, padding:'10px 12px', background:'#fff' }}>
                          <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', gap:8 }}>
                            <div style={{ display:'flex', flexWrap:'wrap', gap:5 }}>
                              {g.comps.map(c => (
                                <span key={c} style={{ fontSize:11.5, fontWeight:700, color:'#1a3a5c', background:'#eef4fb', border:'1px solid #cfe0f2', borderRadius:6, padding:'2px 7px' }}>{c}</span>
                              ))}
                            </div>
                            <div style={{ display:'flex', gap:4, flexShrink:0 }}>
                              <button type="button" onClick={() => editarGrupo(gi)} title="Editar" style={{ background:'none', border:'none', cursor:'pointer', color:'#1f5f8b', fontSize:13, padding:'0 4px' }}><i className="bi bi-pencil" /></button>
                              <button type="button" onClick={() => removerGrupo(gi)} title="Remover" style={{ background:'none', border:'none', cursor:'pointer', color:'#94a3b8', fontSize:13, padding:'0 4px' }}><i className="bi bi-x-lg" /></button>
                            </div>
                          </div>
                          <div style={{ marginTop:8, display:'flex', flexWrap:'wrap', alignItems:'center', gap:6, fontSize:12.5, fontWeight:700, color:'#1a3a5c' }}>
                            {g.roteiro.map((c, ri) => (
                              <span key={ri} style={{ display:'inline-flex', alignItems:'center', gap:6 }}>
                                <span style={{ background:'#eaf1f7', color:'#1f5f8b', border:'1px solid #cfe0f2', borderRadius:8, padding:'3px 9px' }}>{NOMES[c] || c}</span>
                                {ri < g.roteiro.length - 1 && <i className="bi bi-arrow-right" style={{ color:'#7a8aa0', fontSize:11 }} />}
                              </span>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Componentes ainda sem caminho */}
                {compsPendentes.length > 0 && grupos.length > 0 && (
                  <div style={{ marginTop:12, fontSize:12.5, color:'#92400e', background:'#fffbeb', border:'1px solid #fcd34d', borderRadius:8, padding:'8px 12px' }}>
                    <i className="bi bi-exclamation-triangle" style={{ marginRight:6 }} />
                    Sem caminho ainda: <b>{compsPendentes.map(m => m.codigo).join(', ')}</b>. Selecione e defina — ou deixe pro PCP na Conferência.
                  </div>
                )}
                </>
                )}
              </>
            )}
          </div>
          )}

          </div>{/* /coluna direita */}
        </div>
      </form>
    </AuthGuard>
  );
}
