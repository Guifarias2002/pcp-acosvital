'use client';
import { Suspense, useEffect, useState } from 'react';
import { useRouter, useParams, useSearchParams } from 'next/navigation';
import AuthGuard from '@/components/AuthGuard';
import { getPedido, lerOpDoPedido, editarPedido, itemAcao, iniciarConferenciaHrm } from '@/lib/api';
import { getUser, getToken } from '@/lib/auth';
import { FABRICAS, NOMES } from '@/lib/types';
import VisualizadorDoc, { DocEmbed } from '@/components/VisualizadorDoc';

// ── PCP HRM — Conferência ────────────────────────────────────────────────────
// O PCP (staff) pega uma OP que caiu na Emissão (pedido "casca" sem itens),
// confere os materiais/roteiro lidos da OP, MONTA o roteiro do item escolhendo
// os setores reais da Caldeiraria (a leitura da OP entra como sugestão), confirma
// a fábrica (Leve/Pesada é etiqueta por ora) e LANÇA pra produção — cria o item
// e dá "liberar" (igual ao Flange). Ver [[project_pcp_hrm_caldeiraria]].

interface OPMat { codigo: string; descricao: string; quantidade: string; unidade: string; }
interface OPOp { seq: string; setor: string; setorNome: string; etapa: string; }
interface OPIdent { clienteNome: string; quantidade: string; unidade: string; entrega: string; situacao: string; }
interface OPItem { cabecalho: { pn: string; po: string; ns: string }; produto: { codigo: string; descricao: string }; identificacao?: OPIdent; materiais: OPMat[]; roteiro: OPOp[]; qualidade?: number; confianca: number; origem?: 'totvs' | 'omie'; numero?: string; }

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

// Reverso de NOMES (nome amigável → código do setor), normalizado. Usado pra
// recuperar o roteiro que o operador montou na Anexar OP, gravado nas
// observações como texto "A → B → C" (ver pcp-hrm/page.tsx, bloco "Por onde…").
// Unidades que a Caldeiraria manda pra produção: peça, quilo ou metro. Código
// (pc/kg/m) casa com UNIDADES_VALIDAS da API; label/ícone são só de exibição.
const UNIDADES: [string, string, string][] = [
  ['pc', 'Peça', 'bi-box'],
  ['kg', 'Quilo', 'bi-speedometer2'],
  ['m',  'Metro', 'bi-rulers'],
];
const UNIDADE_LABEL: Record<string, string> = Object.fromEntries(UNIDADES.map(([c, l]) => [c, l]));
// Casa a unidade lida da OP (PÇ, PC, PCS, KG, MT…) com os códigos dos botões.
function normalizarUnidade(u: string): string {
  const s = (u || '').trim().toLowerCase();
  if (/^(pc|pç|pcs|pça|peca|peça|un|und)/.test(s)) return 'pc';
  if (/^kg|quilo|kilo/.test(s)) return 'kg';
  if (/^m(t|tr|etro)?$/.test(s) || /metro/.test(s)) return 'm';
  return s;
}

const norm = (s: string) => (s || '').trim().toLowerCase();
const NOME_PARA_COD: Record<string, string> = Object.fromEntries(
  Object.entries(NOMES).map(([cod, nome]) => [norm(nome), cod]),
);

// Lê o roteiro que o operador montou, a partir do bloco "Por onde a peça
// passa"/"Por onde cada peça passa" das observações. Cada linha "• alvo: A → B
// → C" vira códigos de setor. Junta a UNIÃO dos setores de todas as linhas, na
// ordem em que aparecem (no modo "mesmo caminho" é uma linha só = exato; no
// modo "cada um o seu" mescla os caminhos, e o PCP ajusta). Ignora "(definir na
// Conferência)" e mantém só setores válidos do menu. 'emissao' nunca entra.
function roteiroDasObservacoes(observacoes: string, menu: string[]): string[] {
  const linhas = String(observacoes || '').split('\n');
  const out: string[] = [];
  for (const raw of linhas) {
    const linha = raw.trim();
    if (!linha.startsWith('•')) continue;
    // A rota é o trecho após o ÚLTIMO ": " (o alvo pode conter ":", a rota não).
    const i = linha.lastIndexOf(': ');
    if (i < 0) continue;
    const rota = linha.slice(i + 2).trim();
    if (!rota || /definir na confer/i.test(rota)) continue;
    for (const parte of rota.split('→')) {
      const cod = NOME_PARA_COD[norm(parte)];
      if (cod && cod !== 'emissao' && menu.includes(cod) && !out.includes(cod)) out.push(cod);
    }
  }
  return out;
}

export default function ConferenciaPage() {
  return <AuthGuard hrmOnly><Suspense fallback={null}><Conteudo /></Suspense></AuthGuard>;
}

function Conteudo() {
  const router = useRouter();
  const params = useParams();
  const searchParams = useSearchParams();
  const pedidoId = Number(params.id);
  const staff = !!getUser()?.is_staff;
  // Prévia (?preview=1): só-leitura. Abre pela lista ao clicar no card, pra
  // CONSULTAR (OP, descrição, componentes, desenhos) sem iniciar a conferência.
  const preview = searchParams.get('preview') === '1';

  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState('');
  const [pedido, setPedido] = useState<Record<string, unknown> | null>(null);
  const [ops, setOps] = useState<OPItem[]>([]);
  const [avisoLeitura, setAvisoLeitura] = useState('');
  // Visualizador inline (OP/desenho) em tela cheia — funciona no tablet.
  const [visualizando, setVisualizando] = useState<{ url: string; titulo: string } | null>(null);
  const [iniciandoConf, setIniciandoConf] = useState(false);
  const [uploadingDesenho, setUploadingDesenho] = useState(false);
  const [desenhoMsg, setDesenhoMsg] = useState('');

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
  // Confirmação do lançamento: 1º clique mostra PRA QUAL(is) setor(es) a peça
  // vai; 2º clique confirma e lança. `destinos` = setores escolhidos (subconjunto
  // do roteiro); `qtdDestino` = quanto vai pra cada quando é mais de um (divide a
  // quantidade, soma tem que fechar o total). 1 setor = peça inteira.
  const [confirmandoLancar, setConfirmandoLancar] = useState(false);
  const [destinos, setDestinos] = useState<string[]>([]);
  const [qtdDestino, setQtdDestino] = useState<Record<string, string>>({});
  const [token, setToken] = useState('');

  useEffect(() => { try { setToken(localStorage.getItem('access_token') || ''); } catch { /* ignore */ } }, []);

  useEffect(() => {
    let vivo = true;
    (async () => {
      try {
        const ped = await getPedido(pedidoId);
        if (!vivo) return;
        setPedido(ped);

        // ── BASE: o que JÁ está salvo no pedido ────────────────────────────────
        // A Conferência passa a nascer com os dados colocados no pedido (código,
        // descrição, quantidade, unidade, rastreio do cliente, entrega e roteiro).
        // A leitura da OP (logo abaixo) SOBRESCREVE campo a campo quando consegue
        // ler o PDF; quando a OP não abre, a tela não vem mais em branco — mostra
        // o que foi lançado no pedido.
        const itensPed = (ped.itens as Record<string, unknown>[]) || [];
        const it0 = itensPed.find(i => !i.inativo) || itensPed[0];
        if (it0) {
          if (it0.codigo) setCodigo(String(it0.codigo));
          if (it0.descricao) setDescricao(String(it0.descricao));
          if (it0.quantidade) setQuantidade(String(it0.quantidade).replace(',', '.'));
          if (it0.unidade) setUnidade(normalizarUnidade(String(it0.unidade)));
        }
        if (ped.numero_pedido_cliente) setPedCliente(String(ped.numero_pedido_cliente));
        if (ped.entrega_contratual) setEntregaContratual(String(ped.entrega_contratual));
        {
          // Roteiro base: roteiro próprio do item (se tiver mais que emissão),
          // senão o "por onde passa" das observações, senão o roteiro_base.
          const doItem = (it0 && Array.isArray(it0.roteiro_proprio)) ? (it0.roteiro_proprio as string[]) : [];
          const doPedido = Array.isArray(ped.roteiro_base) ? (ped.roteiro_base as string[]) : [];
          const daObs = roteiroDasObservacoes(String(ped.observacoes || ''), MENU_SETORES);
          const fonte = doItem.length > 1 ? doItem : (daObs.length ? daObs : doPedido);
          const baseRot: string[] = [];
          for (const s of fonte) if (s !== 'emissao' && MENU_SETORES.includes(s) && !baseRot.includes(s)) baseRot.push(s);
          if (baseRot.length) setRoteiroSel(baseRot);
        }

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
            if (op0.identificacao?.unidade) setUnidade(normalizarUnidade(op0.identificacao.unidade));
            if (op0.cabecalho?.po) setPedCliente(op0.cabecalho.po);
            if (op0.identificacao?.entrega) setEntregaContratual(op0.identificacao.entrega);
            // Pré-seleciona o roteiro a partir dos setores lidos (na ordem da OP)
            const sug: string[] = [];
            for (const o of op0.roteiro) {
              const c = sugerirSetor(o.setorNome || o.setor);
              if (c && MENU_SETORES.includes(c) && !sug.includes(c)) sug.push(c);
            }
            // OP sem roteiro (ex.: Omie não traz roteiro): usa o "por onde passa"
            // que o operador montou na abertura — gravado nas observações do
            // pedido (o roteiro_base do casca HRM é sempre o mínimo
            // emissao→caldeiraria, então não serve pra isso).
            if (!sug.length) {
              const daObs = roteiroDasObservacoes(String(ped.observacoes || ''), MENU_SETORES);
              for (const s of daObs) if (!sug.includes(s)) sug.push(s);
            }
            // Último recurso: roteiro_base do pedido (o mínimo, quando nem a OP
            // nem as observações trouxeram nada).
            if (!sug.length && Array.isArray(ped.roteiro_base)) {
              for (const s of ped.roteiro_base as string[]) {
                if (s !== 'emissao' && MENU_SETORES.includes(s) && !sug.includes(s)) sug.push(s);
              }
            }
            setRoteiroSel(sug);
          }
        } catch (e) {
          const ax = e as { response?: { data?: { erro?: string } } };
          setAvisoLeitura((ax?.response?.data?.erro ? ax.response.data.erro + ' ' : '') + 'Os campos abaixo vieram do que foi lançado no pedido — confira antes de lançar.');
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

  // Prévia → iniciar de fato: marca "em conferência" e abre o modo de trabalho.
  async function iniciarDaPrevia() {
    if (iniciandoConf) return;
    setIniciandoConf(true);
    try { await iniciarConferenciaHrm(pedidoId); router.push(`/pcp-hrm/conferencia/${pedidoId}`); }
    catch { setErro('Não consegui iniciar a conferência.'); setIniciandoConf(false); }
  }

  async function recarregarPedido() {
    try { const ped = await getPedido(pedidoId); setPedido(ped); } catch { /* mantém o atual */ }
  }
  async function uploadDesenho(arquivo: File) {
    setUploadingDesenho(true); setDesenhoMsg('');
    try {
      const fd = new FormData(); fd.append('arquivo', arquivo);
      const res = await fetch(`/api/pedidos/${pedidoId}/desenho`, { method: 'POST', headers: { Authorization: `Bearer ${getToken() || ''}` }, body: fd });
      const data = await res.json();
      if (data.ok) { setDesenhoMsg('Desenho anexado com sucesso!'); recarregarPedido(); }
      else setDesenhoMsg(data.erro || `Erro ${res.status}`);
    } catch { setDesenhoMsg('Erro ao enviar o desenho.'); }
    finally { setUploadingDesenho(false); }
  }
  async function removerDesenho(path: string) {
    try {
      await fetch(`/api/pedidos/${pedidoId}/desenho`, { method: 'DELETE', headers: { Authorization: `Bearer ${getToken() || ''}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ path }) });
      setDesenhoMsg(''); recarregarPedido();
    } catch { setDesenhoMsg('Erro ao remover o desenho.'); }
  }

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

  // Valida e, se ok, revela a confirmação (mostrando o setor de destino). Não
  // lança ainda — o lançamento é o clique em "Confirmar" (lancar()).
  function pedirConfirmacaoLancar() {
    setErro('');
    if (!staff) { setErro('Só o PCP/administrador pode lançar pra produção.'); return; }
    if (!descricao.trim()) { setErro('Informe a descrição do produto.'); return; }
    if (roteiroSel.length === 0) { setErro('Monte o roteiro: selecione ao menos um setor.'); return; }
    const qtd = Number(quantidade);
    if (!qtd || qtd <= 0) { setErro('Quantidade inválida.'); return; }
    // Começa mandando pro 1º setor do roteiro (o operador pode marcar mais).
    setDestinos([roteiroSel[0]]);
    setQtdDestino({});
    setConfirmandoLancar(true);
  }

  // Marca/desmarca um setor de destino, mantendo a ordem do roteiro. Nunca deixa
  // ficar sem nenhum (o último não sai).
  function toggleDestino(cod: string) {
    setDestinos(prev => {
      if (prev.includes(cod)) return prev.length === 1 ? prev : prev.filter(s => s !== cod);
      return roteiroSel.filter(s => prev.includes(s) || s === cod);
    });
  }

  // Divisão da quantidade entre os destinos (só quando é mais de um).
  const multiDestino = destinos.length > 1;
  const qtdTotal = Number(quantidade) || 0;
  const unidadePeca = normalizarUnidade(unidade) === 'pc';
  const somaDestinos = destinos.reduce((s, cod) => s + (Number(qtdDestino[cod]) || 0), 0);
  // Peça inteira (pc) com qtd 1 não dá pra dividir em vários setores.
  const bloqueiaMulti = multiDestino && unidadePeca && qtdTotal <= 1;
  const somaConfere = !multiDestino || (somaDestinos === qtdTotal && destinos.every(cod => (Number(qtdDestino[cod]) || 0) > 0));

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

      // Cria o item com roteiro próprio ['emissao', ...setores escolhidos] e
      // GRAVA o mesmo roteiro no roteiro_base do pedido — antes ele ficava no
      // mínimo emissao→caldeiraria (do casca HRM) e o painel "Onde está cada OP"
      // desenhava a trilha por ele, mostrando só 2 etapas. Agora o pedido não é
      // mais casca (tem item), então atualizar o roteiro_base é seguro e deixa a
      // trilha do painel/detalhe igual ao roteiro que o PCP montou aqui.
      await editarPedido(pedidoId, {
        observacoes: obsLimpa,
        numero_pedido_cliente: pedCliente,
        entrega_contratual: entregaContratual,
        roteiro_base: ['emissao', ...roteiroSel],
        itens: [{
          codigo: codigo.trim() || 'S/COD',
          descricao: descricao.trim(),
          quantidade: qtd,
          unidade: (unidade.trim() || 'pc').toLowerCase(),
          fabrica: 'caldeiraria',
          roteiro_proprio: ['emissao', ...roteiroSel],
        }],
      });

      // Lança pra produção: pega o item recém-criado e MANDA pro(s) setor(es)
      // escolhido(s) no quadro de confirmação.
      const ped = await getPedido(pedidoId);
      const emitidos = (ped.itens || []).filter((i: Record<string, unknown>) => i.status === 'emitido');
      const it = emitidos[0];
      if (!it) { setErro('Item criado mas não encontrei pra lançar — abra o pedido e libere por lá.'); setLancando(false); return; }
      const itId = it.id as number;
      const dests = destinos.length ? destinos : [roteiroSel[0]];

      if (dests.length <= 1) {
        // Um setor: manda a peça inteira pra lá (o "liberar" aceita destino
        // arbitrário do roteiro; por padrão é o 1º setor).
        await itemAcao(itId, 'liberar', { setor_destino: dests[0] });
      } else {
        // Vários setores: divide a quantidade. Os N-1 primeiros vão por
        // "enviar_parcial" (cada um leva sua fatia); o último recebe o que
        // sobrou na emissão via "liberar". Soma das fatias = total, sem sobra.
        for (let k = 0; k < dests.length - 1; k++) {
          const cod = dests[k];
          const q = Number(qtdDestino[cod]) || 0;
          await itemAcao(itId, 'enviar_parcial', {
            quantidade: q, setor_destino: cod,
            observacao: `Distribuído no lançamento: ${q} ${unidade} → ${NOMES[cod] || cod}`,
          });
        }
        await itemAcao(itId, 'liberar', { setor_destino: dests[dests.length - 1] });
      }
      router.push('/pcp-hrm/painel');
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
  const lblRo: React.CSSProperties = { fontSize: 11, fontWeight: 700, color: '#64748b', display: 'block' };
  const roVal: React.CSSProperties = { fontSize: 14, color: '#0f172a', fontWeight: 600, padding: '6px 2px' };
  const passoChip: React.CSSProperties = { background: '#eef4fb', border: '1px solid #c7d7ee', color: '#1a3a5c', borderRadius: 20, padding: '5px 12px', fontSize: 12.5, fontWeight: 600 };
  const Chip = (label: string, value: string) => (
    <div key={label} style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, padding: '6px 12px', fontSize: 13, color: '#0f172a' }}>
      <span style={{ fontSize: 10.5, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: .5, marginRight: 6 }}>{label}</span>
      <b>{value}</b>
    </div>
  );

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto' }}>
      <style>{`@media print { .no-print { display:none !important; } }`}</style>
      {visualizando && <VisualizadorDoc url={visualizando.url} titulo={visualizando.titulo} onClose={() => setVisualizando(null)} />}

      {/* Cabeçalho */}
      <div className="no-print" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18, flexWrap: 'wrap', gap: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <a href="/pcp-hrm/conferencia" style={{ color: '#888', fontSize: 13, textDecoration: 'none' }}>← Conferência</a>
          <h1 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: '#1a3a5c' }}>
            <i className={`bi ${preview ? 'bi-eye' : 'bi-clipboard-check'}`} style={{ marginRight: 8 }} />
            {preview ? 'Prévia' : 'Conferência'} — {String(pedido?.numero_pedido_venda || pedidoId)}
          </h1>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => window.print()} style={{ padding: '9px 16px', borderRadius: 8, border: '1px solid #dee2e6', fontSize: 13, color: '#555', background: '#fff', fontWeight: 600, cursor: 'pointer' }}>
            <i className="bi bi-printer" style={{ marginRight: 6 }} />Imprimir
          </button>
          {pedido != null && token && (
            <button onClick={() => setVisualizando({ url: `/api/pedidos/${pedidoId}/ordem-producao?token=${encodeURIComponent(token)}`, titulo: `OP — ${String(pedido?.numero_pedido_venda || pedidoId)}` })}
              style={{ padding: '9px 16px', borderRadius: 8, border: '1px solid #dee2e6', fontSize: 13, color: '#555', background: '#fff', fontWeight: 600, cursor: 'pointer' }}>
              <i className="bi bi-file-earmark-pdf" style={{ marginRight: 6 }} />Ver OP (PDF)
            </button>
          )}
        </div>
      </div>

      {carregando && <div style={{ padding: 40, textAlign: 'center', color: '#1a3a5c' }}><i className="bi bi-arrow-repeat" style={{ marginRight: 8 }} />Carregando e lendo a OP…</div>}

      {erro && <div className="no-print" style={{ background: '#fef2f2', border: '1px solid #fca5a5', color: '#dc2626', borderRadius: 8, padding: '10px 14px', fontSize: 13, marginBottom: 16 }}><i className="bi bi-exclamation-circle" style={{ marginRight: 6 }} />{erro}</div>}

      {!carregando && (
        <>
          {avisoLeitura && <div style={{ background: '#fffbeb', border: '1px solid #fcd34d', color: '#92400e', borderRadius: 8, padding: '10px 14px', fontSize: 13, marginBottom: 16 }}><i className="bi bi-exclamation-triangle" style={{ marginRight: 6 }} />{avisoLeitura}</div>}

          {preview ? (() => {
            const desenhos: string[] = (pedido?.desenhos as string[]) || [];
            const clienteNome = op0?.identificacao?.clienteNome || (pedido?.cliente ? String(pedido.cliente) : '');
            const situacao = op0?.identificacao?.situacao || '';
            const entregaFmt = entregaContratual ? entregaContratual.split('-').reverse().join('/')
              : (op0?.identificacao?.entrega ? op0.identificacao.entrega.split('-').reverse().join('/') : '');
            const temOp = !!(pedido as Record<string, unknown>)?.tem_ordem_producao;
            const opUrl = `/api/pedidos/${pedidoId}/ordem-producao?token=${encodeURIComponent(token)}`;
            const opTit = `OP — ${String(pedido?.numero_pedido_venda || pedidoId)}`;
            return (
              <>
                {/* Resumo no topo — dados-chave do pedido/OP */}
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 16 }}>
                  {Chip('Pedido', String(pedido?.numero_pedido_venda || pedidoId))}
                  {op0?.numero && Chip('Nº OP', op0.numero)}
                  {clienteNome && clienteNome !== 'A definir' && Chip('Cliente', clienteNome)}
                  {entregaFmt && Chip('Entrega', entregaFmt)}
                  {pedCliente && Chip('Pedido cliente', pedCliente)}
                  {situacao && Chip('Situação', situacao)}
                </div>

                {ops.length > 1 && <div style={{ marginBottom: 16, fontSize: 12, color: '#b45309', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 8, padding: '8px 12px' }}>Este PDF tem {ops.length} ordens — a conferência lança a 1ª ({op0?.produto?.descricao || op0?.cabecalho.ns}). As demais podem ser lançadas depois.</div>}

                {/* Duas colunas: OP inline (esquerda) + dados (direita) */}
                <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'flex-start' }}>
                  <div style={{ flex: '1.3 1 420px', minWidth: 300 }}>
                    <div style={card}>
                      <div style={secTitle}><i className="bi bi-file-earmark-pdf" style={{ marginRight: 6 }} />OP (Ordem de Produção)</div>
                      {temOp && token
                        ? <DocEmbed url={opUrl} titulo={opTit} height={640} />
                        : <div style={{ fontSize: 13, color: '#b45309', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 8, padding: '10px 12px' }}><i className="bi bi-exclamation-triangle" style={{ marginRight: 6 }} />Nenhuma OP anexada a este pedido.</div>}
                    </div>
                  </div>

                  <div style={{ flex: '1 1 320px', minWidth: 280, display: 'flex', flexDirection: 'column', gap: 16 }}>
                    {/* Produto */}
                    <div style={card}>
                      <div style={secTitle}><i className="bi bi-box-seam" style={{ marginRight: 6 }} />Produto a fabricar</div>
                      <div style={{ fontSize: 14, fontWeight: 700, color: '#0f172a' }}>{descricao || '—'}</div>
                      <div style={{ fontSize: 12.5, color: '#64748b', marginTop: 3 }}>{codigo && <>Cód. <span style={{ fontFamily: 'monospace' }}>{codigo}</span> · </>}{quantidade} {unidade}</div>
                    </div>

                    {/* Roteiro */}
                    <div style={card}>
                      <div style={secTitle}><i className="bi bi-signpost-split" style={{ marginRight: 6 }} />Roteiro — por onde passa</div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                        <span style={passoChip}>1. Emissão</span>
                        {roteiroSel.map((s, i) => <span key={s} style={passoChip}>{i + 2}. {NOMES[s] || s}</span>)}
                        {roteiroSel.length === 0 && <span style={{ fontSize: 12, color: '#b45309' }}>Roteiro ainda não definido — monte na conferência.</span>}
                      </div>
                    </div>

                    {/* Materiais */}
                    {op0 && op0.materiais.length > 0 && (
                      <div style={card}>
                        <div style={secTitle}><i className="bi bi-list-check" style={{ marginRight: 6 }} />Materiais (COMPONENTES) — {op0.materiais.length}</div>
                        <div style={{ overflowX: 'auto' }}>
                          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
                            <thead><tr style={{ textAlign: 'left', color: '#64748b', borderBottom: '1px solid #e2e8f0' }}>
                              <th style={{ padding: '6px 8px' }}>Código</th><th style={{ padding: '6px 8px' }}>Descrição</th><th style={{ padding: '6px 8px' }}>Qtde</th><th style={{ padding: '6px 8px' }}>Un</th>
                            </tr></thead>
                            <tbody>
                              {op0.materiais.map((m, i) => {
                                const codOk = op0.origem === 'omie' ? !!m.codigo.trim() : /^\d{4,}$/.test(m.codigo.replace(/\s/g, ''));
                                return (
                                  <tr key={i} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                    <td style={{ padding: '6px 8px', fontFamily: 'monospace', color: codOk ? '#0f172a' : '#b45309' }}>{codOk ? m.codigo : '—'}</td>
                                    <td style={{ padding: '6px 8px' }}>{m.descricao}</td>
                                    <td style={{ padding: '6px 8px' }}>{m.quantidade}</td>
                                    <td style={{ padding: '6px 8px' }}>{m.unidade}</td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}

                    {/* Desenhos — só aparece se tiver algum */}
                    {desenhos.length > 0 && (
                      <div style={card}>
                        <div style={secTitle}><i className="bi bi-rulers" style={{ marginRight: 6 }} />Desenho(s) do projeto — {desenhos.length}</div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                          {desenhos.map((path, di) => {
                            const nome = path.split('/').pop() || `Desenho ${di + 1}`;
                            return (
                              <div key={di} style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: 6, padding: '6px 10px' }}>
                                <i className="bi bi-file-earmark" style={{ color: '#6b7280', fontSize: 13 }} />
                                <button onClick={() => setVisualizando({ url: `/api/pedidos/${pedidoId}/desenho?idx=${di}&token=${encodeURIComponent(token)}`, titulo: nome })}
                                  style={{ flex: 1, textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer', color: '#2563eb', fontSize: 13, textDecoration: 'underline', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                  {nome}
                                </button>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Ação */}
                <div className="no-print" style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, margin: '20px 0 40px' }}>
                  <a href="/pcp-hrm/conferencia" style={{ padding: '11px 20px', borderRadius: 8, border: '1px solid #dee2e6', fontSize: 14, color: '#555', textDecoration: 'none', fontWeight: 600, display: 'inline-flex', alignItems: 'center' }}>Voltar</a>
                  <button onClick={iniciarDaPrevia} disabled={iniciandoConf}
                    style={{ padding: '11px 28px', borderRadius: 8, background: '#16a34a', color: '#fff', fontSize: 14, fontWeight: 800, border: 'none', cursor: iniciandoConf ? 'wait' : 'pointer', opacity: iniciandoConf ? .7 : 1 }}>
                    <i className="bi bi-play-fill" style={{ marginRight: 8 }} />
                    {iniciandoConf ? 'Iniciando…' : 'Iniciar conferência'}
                  </button>
                </div>
              </>
            );
          })() : (<>

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

          {/* Produto + quantidade (editável; só-leitura na prévia) */}
          <div style={card}>
            <div style={secTitle}><i className="bi bi-box-seam" style={{ marginRight: 6 }} />Produto a fabricar</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 12, marginBottom: 12 }}>
              <div><label style={lblRo}>Código</label>{preview ? <div style={roVal}>{codigo || '—'}</div> : <input value={codigo} onChange={e => setCodigo(e.target.value)} className={inputCls} />}</div>
              <div><label style={lblRo}>Descrição</label>{preview ? <div style={roVal}>{descricao || '—'}</div> : <input value={descricao} onChange={e => setDescricao(e.target.value)} className={inputCls} />}</div>
            </div>
            <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
              <div><label style={lblRo}>Quantidade</label>{preview ? <div style={roVal}>{quantidade}</div> : <input type="number" value={quantidade} onChange={e => setQuantidade(e.target.value)} style={{ width: 110 }} className={inputCls} />}</div>
              <div>
                <label style={lblRo}>Unidade — como vamos mandar</label>
                {preview ? (
                  <div style={roVal}>{UNIDADE_LABEL[unidade.toLowerCase()] || unidade}</div>
                ) : (
                  <div style={{ display: 'flex', gap: 6, marginTop: 4, flexWrap: 'wrap' }}>
                    {UNIDADES.map(([cod, label, icon]) => {
                      const ativo = unidade.toLowerCase() === cod;
                      return (
                        <button key={cod} type="button" onClick={() => setUnidade(cod)}
                          style={{ display: 'inline-flex', alignItems: 'center', gap: 6, borderRadius: 8, padding: '8px 14px', fontSize: 13, fontWeight: 700, cursor: 'pointer',
                            border: `1px solid ${ativo ? '#1a3a5c' : '#dee2e6'}`, background: ativo ? '#1a3a5c' : '#fff', color: ativo ? '#fff' : '#334155' }}>
                          <i className={`bi ${icon}`} />{label}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Rastreio pelo cliente + entrega contratual (editável, pré-lido da OP) */}
          <div style={card}>
            <div style={secTitle}><i className="bi bi-bookmark-check" style={{ marginRight: 6 }} />Rastreio do cliente</div>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
              <div style={{ flex: '1 1 240px' }}>
                <label style={lblRo}>Nº Pedido do Cliente</label>
                {preview ? <div style={roVal}>{pedCliente || '—'}</div> : <input value={pedCliente} onChange={e => setPedCliente(e.target.value)} placeholder="OC/PO do cliente" className={inputCls} />}
              </div>
              <div style={{ flex: '0 1 200px' }}>
                <label style={lblRo}>Entrega Contratual</label>
                {preview ? <div style={roVal}>{entregaContratual ? entregaContratual.split('-').reverse().join('/') : '—'}</div> : <input type="date" value={entregaContratual} onChange={e => setEntregaContratual(e.target.value)} className={inputCls} />}
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
                  {!preview && <>
                    <button onClick={() => moverSetor(i, -1)} disabled={i === 0} title="Subir" style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#64748b', opacity: i === 0 ? .3 : 1 }}><i className="bi bi-arrow-up" /></button>
                    <button onClick={() => moverSetor(i, 1)} disabled={i === roteiroSel.length - 1} title="Descer" style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#64748b', opacity: i === roteiroSel.length - 1 ? .3 : 1 }}><i className="bi bi-arrow-down" /></button>
                    <button onClick={() => toggleSetor(s)} title="Remover" style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#dc2626' }}><i className="bi bi-x-lg" /></button>
                  </>}
                </div>
              ))}
              {roteiroSel.length === 0 && <div style={{ fontSize: 12, color: '#b45309' }}>Nenhum setor escolhido ainda — clique nos setores abaixo.</div>}
            </div>
            {/* Disponíveis pra adicionar */}
            {!preview && <div className="no-print">
              <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', marginBottom: 6 }}>Adicionar setor (clique na ordem):</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {MENU_SETORES.filter(s => !roteiroSel.includes(s)).map(s => (
                  <button key={s} onClick={() => toggleSetor(s)} style={{ border: '1px solid #dee2e6', background: '#fff', borderRadius: 20, padding: '5px 12px', fontSize: 12, fontWeight: 600, color: '#334155', cursor: 'pointer' }}>
                    + {NOMES[s] || s}
                  </button>
                ))}
              </div>
            </div>}
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
                    {op0.materiais.map((m, i) => {
                      // Totvs: só mostra código numérico coerente (a cifra gera lixo);
                      // Omie: texto limpo, código alfanumérico confiável (OSSSJP..., FL...).
                      const codOk = op0.origem === 'omie' ? !!m.codigo.trim() : /^\d{4,}$/.test(m.codigo.replace(/\s/g, ''));
                      return (
                      <tr key={i} style={{ borderBottom: '1px solid #f1f5f9' }}>
                        <td style={{ padding: '6px 8px', fontFamily: 'monospace', color: codOk ? '#0f172a' : '#b45309' }}>{codOk ? m.codigo : '—'}</td>
                        <td style={{ padding: '6px 8px' }}>{m.descricao}</td>
                        <td style={{ padding: '6px 8px' }}>{m.quantidade}</td>
                        <td style={{ padding: '6px 8px' }}>{m.unidade}</td>
                      </tr>
                    );})}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Desenho(s) do projeto — ver (inline) e anexar (fora da prévia) */}
          {(() => {
            const desenhos: string[] = (pedido?.desenhos as string[]) || [];
            return (
              <div style={card}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, borderBottom: '2px solid #1a3a5c', paddingBottom: 6 }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: '#1a3a5c', textTransform: 'uppercase', letterSpacing: 1 }}><i className="bi bi-rulers" style={{ marginRight: 6 }} />Desenho(s) do projeto — {desenhos.length}</span>
                  {!preview && (
                    <label className="no-print" style={{ background: '#f59e0b', color: '#fff', borderRadius: 6, padding: '5px 12px', fontSize: 12, fontWeight: 700, cursor: uploadingDesenho ? 'wait' : 'pointer' }}>
                      {uploadingDesenho ? '⏳ Enviando…' : '+ Anexar'}
                      <input type="file" accept=".pdf,.png,.jpg,.jpeg,.webp" style={{ display: 'none' }} disabled={uploadingDesenho}
                        onChange={e => { const f = e.target.files?.[0]; if (f) uploadDesenho(f); e.target.value = ''; }} />
                    </label>
                  )}
                </div>
                {desenhos.length === 0 ? (
                  <div style={{ fontSize: 13, color: '#94a3b8' }}>Nenhum desenho anexado.</div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {desenhos.map((path, di) => {
                      const nome = path.split('/').pop() || `Desenho ${di + 1}`;
                      return (
                        <div key={di} style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: 6, padding: '6px 10px' }}>
                          <i className="bi bi-file-earmark" style={{ color: '#6b7280', fontSize: 13 }} />
                          <button onClick={() => setVisualizando({ url: `/api/pedidos/${pedidoId}/desenho?idx=${di}&token=${encodeURIComponent(token)}`, titulo: nome })}
                            style={{ flex: 1, textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer', color: '#2563eb', fontSize: 13, textDecoration: 'underline', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {nome}
                          </button>
                          {!preview && (
                            <button onClick={() => removerDesenho(path)} className="no-print" style={{ background: 'none', border: 'none', color: '#dc2626', cursor: 'pointer', fontSize: 13 }} title="Remover"><i className="bi bi-trash" /></button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
                {desenhoMsg && <div style={{ fontSize: 12, color: desenhoMsg.includes('sucesso') ? '#16a34a' : '#dc2626', marginTop: 8 }}>{desenhoMsg}</div>}
              </div>
            );
          })()}

          {/* Ação — na prévia: iniciar a conferência; no modo trabalho: lançar */}
          {preview ? (
            <div className="no-print" style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginBottom: 40 }}>
              <a href="/pcp-hrm/conferencia" style={{ padding: '11px 20px', borderRadius: 8, border: '1px solid #dee2e6', fontSize: 14, color: '#555', textDecoration: 'none', fontWeight: 600, display: 'inline-flex', alignItems: 'center' }}>Voltar</a>
              <button onClick={iniciarDaPrevia} disabled={iniciandoConf}
                style={{ padding: '11px 28px', borderRadius: 8, background: '#16a34a', color: '#fff', fontSize: 14, fontWeight: 800, border: 'none', cursor: iniciandoConf ? 'wait' : 'pointer', opacity: iniciandoConf ? .7 : 1 }}>
                <i className="bi bi-play-fill" style={{ marginRight: 8 }} />
                {iniciandoConf ? 'Iniciando…' : 'Iniciar conferência'}
              </button>
            </div>
          ) : (
            <>
              {/* Confirmação: ESCOLHE pra qual(is) setor(es) mandar. 1 setor = peça
                  inteira; vários = divide a quantidade (a soma tem que fechar o
                  total). Só depois de confirmar é que lança. */}
              {confirmandoLancar && roteiroSel.length > 0 && (
                <div className="no-print" style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 12, padding: '16px 18px', marginBottom: 16 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: '#166534', marginBottom: 10 }}>
                    <i className="bi bi-box-arrow-in-right" style={{ marginRight: 6 }} />
                    Mandar para qual setor? (marque um ou mais)
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
                    {roteiroSel.map(cod => {
                      const on = destinos.includes(cod);
                      return (
                        <button key={cod} type="button" onClick={() => toggleDestino(cod)}
                          style={{ display: 'inline-flex', alignItems: 'center', gap: 6, borderRadius: 8, padding: '8px 14px', fontSize: 13, fontWeight: 700, cursor: 'pointer',
                            border: `1px solid ${on ? '#15803d' : '#cbd5e1'}`, background: on ? '#15803d' : '#fff', color: on ? '#fff' : '#334155' }}>
                          <i className={`bi ${on ? 'bi-check-circle-fill' : 'bi-circle'}`} />{NOMES[cod] || cod}
                        </button>
                      );
                    })}
                  </div>

                  {!multiDestino && (
                    <div style={{ fontSize: 12.5, color: '#4b5563' }}>
                      Vai a peça inteira (<b>{qtdTotal} {UNIDADE_LABEL[normalizarUnidade(unidade)] || unidade}</b>) para <b>{NOMES[destinos[0]] || destinos[0]}</b>. Roteiro: {['Emissão', ...roteiroSel.map(s => NOMES[s] || s)].join(' → ')}.
                    </div>
                  )}

                  {multiDestino && bloqueiaMulti && (
                    <div style={{ fontSize: 12.5, color: '#92400e', background: '#fffbeb', border: '1px solid #fcd34d', borderRadius: 8, padding: '10px 12px' }}>
                      <i className="bi bi-exclamation-triangle" style={{ marginRight: 6 }} />
                      É <b>1 peça só</b> — não dá pra dividir em vários setores. Escolha <b>um</b> setor, ou mude a unidade pra <b>Quilo/Metro</b> (ou aumente a quantidade) pra dividir.
                    </div>
                  )}

                  {multiDestino && !bloqueiaMulti && (
                    <div>
                      <div style={{ fontSize: 12.5, color: '#166534', marginBottom: 8 }}>
                        Quanto vai pra cada setor? (a soma tem que fechar <b>{qtdTotal} {UNIDADE_LABEL[normalizarUnidade(unidade)] || unidade}</b>)
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 8 }}>
                        {destinos.map(cod => (
                          <div key={cod} style={{ display: 'flex', alignItems: 'center', gap: 10, background: '#fff', border: '1px solid #d1fae5', borderRadius: 8, padding: '6px 10px' }}>
                            <span style={{ flex: 1, fontSize: 13, fontWeight: 700, color: '#15803d' }}>{NOMES[cod] || cod}</span>
                            <input type="number" min={0} value={qtdDestino[cod] ?? ''} placeholder="0"
                              onChange={e => setQtdDestino(q => ({ ...q, [cod]: e.target.value }))}
                              style={{ width: 90 }} className={inputCls} />
                            <span style={{ fontSize: 12, color: '#64748b', minWidth: 34 }}>{UNIDADE_LABEL[normalizarUnidade(unidade)] || unidade}</span>
                          </div>
                        ))}
                      </div>
                      <div style={{ fontSize: 12.5, fontWeight: 700, color: somaConfere ? '#15803d' : '#dc2626' }}>
                        Soma: {somaDestinos} / {qtdTotal} {somaConfere ? '✓' : '— precisa fechar o total'}
                      </div>
                    </div>
                  )}
                </div>
              )}
              <div className="no-print" style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginBottom: 40 }}>
                {confirmandoLancar ? (
                  <>
                    <button onClick={() => setConfirmandoLancar(false)} disabled={lancando}
                      style={{ padding: '11px 20px', borderRadius: 8, border: '1px solid #dee2e6', fontSize: 14, color: '#555', background: '#fff', fontWeight: 600, cursor: lancando ? 'not-allowed' : 'pointer' }}>Voltar</button>
                    {(() => {
                      const podeConfirmar = !lancando && !bloqueiaMulti && somaConfere;
                      const rotulo = lancando ? 'Lançando…'
                        : multiDestino ? `Confirmar — lançar para ${destinos.length} setores`
                        : `Confirmar — lançar para ${NOMES[destinos[0]] || destinos[0]}`;
                      return (
                        <button onClick={lancar} disabled={!podeConfirmar}
                          style={{ padding: '11px 28px', borderRadius: 8, background: podeConfirmar ? '#16a34a' : '#9ca3af', color: '#fff', fontSize: 14, fontWeight: 800, border: 'none', cursor: podeConfirmar ? 'pointer' : 'not-allowed', opacity: lancando ? .7 : 1 }}>
                          <i className="bi bi-check-circle-fill" style={{ marginRight: 8 }} />{rotulo}
                        </button>
                      );
                    })()}
                  </>
                ) : (
                  <>
                    <a href="/pcp-hrm/conferencia" style={{ padding: '11px 20px', borderRadius: 8, border: '1px solid #dee2e6', fontSize: 14, color: '#555', textDecoration: 'none', fontWeight: 600, display: 'inline-flex', alignItems: 'center' }}>Cancelar</a>
                    <button onClick={pedirConfirmacaoLancar} disabled={lancando || !staff} title={staff ? '' : 'Só o PCP/administrador pode lançar'}
                      style={{ padding: '11px 28px', borderRadius: 8, background: staff ? '#16a34a' : '#9ca3af', color: '#fff', fontSize: 14, fontWeight: 800, border: 'none', cursor: lancando || !staff ? 'not-allowed' : 'pointer', opacity: lancando ? .7 : 1 }}>
                      <i className="bi bi-play-circle-fill" style={{ marginRight: 8 }} />
                      Lançar pra produção
                    </button>
                  </>
                )}
              </div>
              {!staff && <div className="no-print" style={{ textAlign: 'right', fontSize: 12, color: '#b45309', marginTop: -30, marginBottom: 30 }}>Você pode conferir, mas o lançamento é feito pelo PCP/administrador.</div>}
            </>
          )}
          </>)}
        </>
      )}
    </div>
  );
}
