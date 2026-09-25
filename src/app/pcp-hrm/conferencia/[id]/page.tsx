'use client';
import { Suspense, useEffect, useState } from 'react';
import { useRouter, useParams, useSearchParams } from 'next/navigation';
import AuthGuard from '@/components/AuthGuard';
import { getPedido, lerOpDoPedido, editarPedido, itemAcao, iniciarConferenciaHrm } from '@/lib/api';
import { getUser, getToken, podeConferirHrm } from '@/lib/auth';
import { FABRICAS, NOMES } from '@/lib/types';
import { ehProdutoDaOp, qtdEstruturasDasObservacoes } from '@/lib/opProduto';
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

// A OP do Omie traz a Quantidade sempre com 6 casas decimais (ex.: "853,000000",
// "1.459,000000") — sobra pro sistema de origem, não pra quem confere aqui. Só
// formatação de EXIBIÇÃO na tabela de Materiais: quando as casas decimais são
// só zero, mostra o inteiro (mantendo o ponto de milhar que já vem no texto);
// quando tem decimal de verdade, mantém só os dígitos que sobram.
function formatarQtd(raw: string): string {
  const s = (raw || '').trim();
  if (!s) return s;
  const [inteiro, decimal] = s.split(',');
  if (decimal == null || /^0+$/.test(decimal)) return inteiro;
  return `${inteiro},${decimal.replace(/0+$/, '')}`;
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

// Lê os COMPONENTES salvos na Anexar OP — bloco "[[COMPONENTES]]<json>" nas
// observações. É o que faz os materiais aparecerem na Conferência SEM depender
// de reler a OP do B2 (que pode estar fora). Roteiro começa vazio (o PCP monta).
function componentesDasObservacoes(observacoes: string): CompRot[] {
  const linha = String(observacoes || '').split('\n').find(l => l.trim().startsWith('[[COMPONENTES]]'));
  if (!linha) return [];
  try {
    const arr = JSON.parse(linha.trim().slice('[[COMPONENTES]]'.length)) as { codigo?: string; descricao?: string; quantidade?: string; unidade?: string }[];
    return (Array.isArray(arr) ? arr : []).map(m => ({
      codigo: (m.codigo || '').trim(),
      descricao: (m.descricao || '').trim(),
      quantidade: (m.quantidade || '1').replace(',', '.').replace(/\.?0+$/, '') || '1',
      unidade: normalizarUnidade(m.unidade || 'pc'),
      roteiro: [] as string[],
    }));
  } catch { return []; }
}

// Lê o PRODUTO salvo na Anexar OP — bloco "[[PRODUTO]]<json>" nas observações
// (código/descrição/quantidade/unidade/PO/entrega lidos da OP). Base pros campos
// do produto quando a OP não reabre do B2.
function produtoDasObservacoes(observacoes: string): { codigo?: string; descricao?: string; quantidade?: string; unidade?: string; po?: string; entrega?: string } | null {
  const linha = String(observacoes || '').split('\n').find(l => l.trim().startsWith('[[PRODUTO]]'));
  if (!linha) return null;
  try {
    const o = JSON.parse(linha.trim().slice('[[PRODUTO]]'.length));
    return o && typeof o === 'object' ? o : null;
  } catch { return null; }
}


// ── Filtro de setores (digitar / colar lista / copiar roteiro) ─────────────
// Sem acento/maiúscula/pontuação, pra "inspecao" achar "Inspeção".
const normSetor = (t: string) => t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
// Um pedaço de texto → código do setor: nome igual; senão o nome que CONTÉM o
// texto (ou vice-versa) — o mais curto ganha, pra "Solda" não virar "Inspeção Fit-Up Solda".
function setorDoTexto(txt: string): string | null {
  const t = normSetor(txt.replace(/^\s*\d+[.)-]?\s*/, '')); // tira "3. " do começo
  if (!t) return null;
  const cands = MENU_SETORES.map(c => ({ c, n: normSetor(NOMES[c] || c) }));
  const igual = cands.find(x => x.n === t);
  if (igual) return igual.c;
  const parciais = cands.filter(x => x.n.includes(t) || t.includes(x.n)).sort((a, b) => a.n.length - b.n.length);
  return parciais[0]?.c ?? null;
}

// Campo acima dos setores disponíveis. Digitar filtra (Enter adiciona o 1º);
// colar uma LISTA (linhas, vírgulas, ";" ou "→") adiciona todos na ordem.
function FiltroSetores({ roteiro, onChange, onFiltro }: { roteiro: string[]; onChange: (r: string[]) => void; onFiltro: (f: string) => void }) {
  const [txt, setTxt] = useState('');
  const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null);
  const muda = (v: string) => { setTxt(v); onFiltro(v); };
  function colou(e: React.ClipboardEvent<HTMLInputElement>) {
    const colado = e.clipboardData.getData('text');
    const partes = colado.split(/\r?\n|;|,|→|->|\t/).map(x => x.trim()).filter(Boolean);
    if (partes.length < 2) return; // 1 palavra só = filtro normal
    e.preventDefault();
    const novos: string[] = []; const naoAchou: string[] = [];
    for (const pt of partes) {
      const c = setorDoTexto(pt);
      if (!c) { if (normSetor(pt) !== 'emissao') naoAchou.push(pt); continue; }
      // Cada setor entra 1x no roteiro (o editor não repete setor).
      if (roteiro.includes(c) || novos.includes(c)) continue;
      novos.push(c);
    }
    if (novos.length) onChange([...roteiro, ...novos]);
    setMsg({ ok: !naoAchou.length, t: `${novos.length} setor(es) adicionado(s)${naoAchou.length ? ` · não reconhecido(s): ${naoAchou.join(', ')}` : ''}` });
    muda('');
  }
  async function copiar() {
    const t = ['Emissão', ...roteiro.map(c => NOMES[c] || c)].join('\n');
    try { await navigator.clipboard.writeText(t); setMsg({ ok: true, t: 'Roteiro copiado — cole no campo de outro componente.' }); }
    catch { setMsg({ ok: false, t: 'Não consegui copiar (permissão do navegador).' }); }
  }
  return (
    <div style={{ marginBottom: 8 }}>
      <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
        <div style={{ position: 'relative', flex: '1 1 260px', maxWidth: 420 }}>
          <i className="bi bi-search" style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8', fontSize: 13 }} />
          <input value={txt} onChange={e => muda(e.target.value)} onPaste={colou}
            onKeyDown={e => {
              if (e.key === 'Enter') {
                e.preventDefault();
                const alvo = MENU_SETORES.filter(c => !roteiro.includes(c)).find(c => normSetor(NOMES[c] || c).includes(normSetor(txt)));
                if (txt.trim() && alvo) { onChange([...roteiro, alvo]); muda(''); }
              }
              if (e.key === 'Escape') muda('');
            }}
            placeholder="Filtrar setor… ou cole uma lista de setores"
            style={{ width: '100%', border: '1.5px solid #dee2e6', borderRadius: 20, padding: '6px 30px 6px 30px', fontSize: 12.5 }} />
          {txt && <button type="button" onClick={() => muda('')} title="Limpar" style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', border: 'none', background: 'none', color: '#94a3b8', cursor: 'pointer' }}><i className="bi bi-x-circle-fill" /></button>}
        </div>
        {roteiro.length > 0 && (
          <button type="button" onClick={copiar} title="Copia a sequência pra colar em outro componente"
            style={{ border: '1px solid #c7d7ee', background: '#eef4fb', borderRadius: 20, padding: '5px 12px', fontSize: 12, fontWeight: 700, color: '#1a3a5c', cursor: 'pointer' }}>
            <i className="bi bi-clipboard" style={{ marginRight: 5 }} />Copiar roteiro
          </button>
        )}
      </div>
      {msg && <div style={{ fontSize: 11.5, marginTop: 4, fontWeight: 600, color: msg.ok ? '#166534' : '#b45309' }}>{msg.t}</div>}
      <div style={{ fontSize: 10.5, color: '#94a3b8', marginTop: 3 }}>Digite pra filtrar (Enter adiciona o 1º) · cole uma lista (uma por linha, vírgula ou →) pra adicionar todos na ordem</div>
    </div>
  );
}
// Filtra a lista de disponíveis pelo texto digitado.
const filtrarSetores = (lista: string[], f: string) => {
  const t = normSetor(f);
  return t ? lista.filter(c => normSetor(NOMES[c] || c).includes(t)) : lista;
};


// Nome amigável do desenho: o original fica depois de "__" no nome do arquivo.
function nomeDesenho(path: string, i: number): string {
  const f = (path.replace(/^b2:/, '').split('/').pop() || '');
  const orig = f.includes('__') ? f.slice(f.indexOf('__') + 2) : '';
  return orig || `Desenho ${i + 1}`;
}

// Painel do DESENHO (lado esquerdo da Conferência): mostra o desenho aberto,
// abas se houver mais de um, e anexar (botão ou arrastar o arquivo). Arquivo
// grande vai direto pro armazenamento (ver uploadDesenho).
function DesenhoPainel({ desenhos, pedidoId, token, editavel, enviando, progresso, msg, onEnviar, onRemover }: {
  desenhos: string[]; pedidoId: number | string; token: string; editavel: boolean;
  enviando: boolean; progresso: number | null; msg: string;
  onEnviar: (f: File) => void; onRemover: (path: string) => void;
}) {
  const [sel, setSel] = useState(0);
  const [arrastando, setArrastando] = useState(false);
  useEffect(() => { if (sel >= desenhos.length) setSel(Math.max(0, desenhos.length - 1)); }, [desenhos.length, sel]);
  const atual = desenhos[sel];
  const url = atual ? `/api/pedidos/${pedidoId}/desenho?idx=${sel}&token=${encodeURIComponent(token)}` : '';
  return (
    <div
      onDragOver={e => { if (editavel) { e.preventDefault(); setArrastando(true); } }}
      onDragLeave={() => setArrastando(false)}
      onDrop={e => { e.preventDefault(); setArrastando(false); const f = e.dataTransfer.files?.[0]; if (f && editavel) onEnviar(f); }}
      style={{ background: '#fff', border: `2px ${arrastando ? 'dashed #f59e0b' : 'solid #e2e8f0'}`, borderRadius: 12, padding: 12, display: 'flex', flexDirection: 'column', gap: 8, height: '100%', minHeight: 420 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 11, fontWeight: 800, color: '#1a3a5c', textTransform: 'uppercase', letterSpacing: 1 }}><i className="bi bi-rulers" style={{ marginRight: 6 }} />Desenho{desenhos.length > 1 ? `s — ${desenhos.length}` : ''}</span>
        <div style={{ flex: 1 }} />
        {atual && <a href={url} target="_blank" rel="noopener noreferrer" title="Abrir em outra aba" style={{ fontSize: 12, color: '#475569' }}><i className="bi bi-box-arrow-up-right" /></a>}
        {editavel && (
          <label style={{ background: '#f59e0b', color: '#fff', borderRadius: 6, padding: '5px 12px', fontSize: 12, fontWeight: 700, cursor: enviando ? 'wait' : 'pointer' }}>
            {enviando ? (progresso !== null ? `⏳ ${progresso}%` : '⏳ Enviando…') : '+ Anexar desenho'}
            <input type="file" accept=".pdf,.png,.jpg,.jpeg,.webp" style={{ display: 'none' }} disabled={enviando}
              onChange={e => { const f = e.target.files?.[0]; if (f) onEnviar(f); e.target.value = ''; }} />
          </label>
        )}
      </div>
      {desenhos.length > 1 && (
        <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
          {desenhos.map((d, i) => (
            <button key={d} type="button" onClick={() => setSel(i)} title={nomeDesenho(d, i)} style={{
              border: `1.5px solid ${i === sel ? '#1a3a5c' : '#e2e8f0'}`, background: i === sel ? '#1a3a5c' : '#fff', color: i === sel ? '#fff' : '#475569',
              borderRadius: 16, padding: '3px 10px', fontSize: 11.5, fontWeight: 700, cursor: 'pointer', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>{nomeDesenho(d, i)}</button>
          ))}
        </div>
      )}
      {enviando && progresso !== null && (
        <div style={{ height: 6, background: '#f1f5f9', borderRadius: 3 }}><div style={{ width: `${progresso}%`, height: 6, background: '#f59e0b', borderRadius: 3, transition: 'width .2s' }} /></div>
      )}
      {msg && <div style={{ fontSize: 12, fontWeight: 600, color: msg.includes('sucesso') ? '#16a34a' : '#dc2626' }}>{msg}</div>}
      {atual ? (
        <>
          <div style={{ flex: 1, minHeight: 360, position: 'relative' }}>
            <div style={{ position: 'absolute', inset: 0 }}><DocEmbed key={url} url={url} titulo={nomeDesenho(atual, sel)} height="100%" /></div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: '#64748b' }}>
            <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{nomeDesenho(atual, sel)}</span>
            {editavel && <button type="button" onClick={() => { if (confirm('Remover este desenho?')) onRemover(atual); }} style={{ background: 'none', border: 'none', color: '#dc2626', cursor: 'pointer', fontSize: 12 }}><i className="bi bi-trash" /> Remover</button>}
          </div>
        </>
      ) : (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8, color: '#94a3b8', border: '2px dashed #e2e8f0', borderRadius: 10, padding: 20, textAlign: 'center' }}>
          <i className="bi bi-rulers" style={{ fontSize: 34 }} />
          <div style={{ fontSize: 13 }}>Nenhum desenho anexado.</div>
          {editavel && <div style={{ fontSize: 12 }}>Clique em <b>+ Anexar desenho</b> ou <b>arraste o arquivo</b> aqui — qualquer tamanho.</div>}
        </div>
      )}
    </div>
  );
}

// Um componente da OP com o próprio roteiro (sub-item = filho do produto).
interface CompRot { codigo: string; descricao: string; quantidade: string; unidade: string; roteiro: string[]; }

// Seletor de roteiro compacto e reutilizável (produto e cada componente usam).
// Sempre começa em "Emissão" (fixo, passo 1). Clica pra adicionar; setinhas pra
// ordenar; ✕ pra remover.
function RoteiroPicker({ roteiro, onChange }: { roteiro: string[]; onChange: (r: string[]) => void }) {
  const [filtro, setFiltro] = useState('');
  const mov = (i: number, dir: -1 | 1) => {
    const j = i + dir; if (j < 0 || j >= roteiro.length) return;
    const n = roteiro.slice(); [n[i], n[j]] = [n[j], n[i]]; onChange(n);
  };
  return (
    <div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8, alignItems: 'center' }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: '#64748b' }}>1. Emissão</span>
        {roteiro.map((s, i) => (
          <span key={s} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: '#eef4fb', border: '1px solid #c7d7ee', borderRadius: 20, padding: '3px 6px 3px 10px', fontSize: 12, fontWeight: 600, color: '#1a3a5c' }}>
            {i + 2}. {NOMES[s] || s}
            <button type="button" onClick={() => mov(i, -1)} disabled={i === 0} title="Subir" style={{ border: 'none', background: 'none', cursor: i === 0 ? 'default' : 'pointer', color: '#64748b', opacity: i === 0 ? .3 : 1, padding: '0 2px' }}><i className="bi bi-arrow-up" /></button>
            <button type="button" onClick={() => mov(i, 1)} disabled={i === roteiro.length - 1} title="Descer" style={{ border: 'none', background: 'none', cursor: i === roteiro.length - 1 ? 'default' : 'pointer', color: '#64748b', opacity: i === roteiro.length - 1 ? .3 : 1, padding: '0 2px' }}><i className="bi bi-arrow-down" /></button>
            <button type="button" onClick={() => onChange(roteiro.filter(x => x !== s))} title="Remover" style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#dc2626', padding: '0 2px' }}><i className="bi bi-x-lg" /></button>
          </span>
        ))}
        {roteiro.length === 0 && <span style={{ fontSize: 12, color: '#b45309' }}>sem setor — clique abaixo</span>}
      </div>
      <FiltroSetores roteiro={roteiro} onChange={onChange} onFiltro={setFiltro} />
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {filtro && !filtrarSetores(MENU_SETORES.filter(s => !roteiro.includes(s)), filtro).length && <span style={{ fontSize: 12, color: '#94a3b8' }}>Nenhum setor com &quot;{filtro}&quot;.</span>}
        {filtrarSetores(MENU_SETORES.filter(s => !roteiro.includes(s)), filtro).map(s => (
          <button key={s} type="button" onClick={() => onChange([...roteiro, s])} style={{ border: '1px solid #dee2e6', background: '#fff', borderRadius: 20, padding: '4px 10px', fontSize: 11.5, fontWeight: 600, color: '#334155', cursor: 'pointer' }}>
            + {NOMES[s] || s}
          </button>
        ))}
      </div>
    </div>
  );
}

export default function ConferenciaPage() {
  return <AuthGuard hrmOnly><Suspense fallback={null}><Conteudo /></Suspense></AuthGuard>;
}

function Conteudo() {
  const router = useRouter();
  const params = useParams();
  const searchParams = useSearchParams();
  const pedidoId = Number(params.id);
  // Pode lançar: PCP/admin OU flag acesso_conferencia_hrm (ex.: Alan).
  const staff = podeConferirHrm(getUser());
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
  const [desenhoProg, setDesenhoProg] = useState<number | null>(null);

  // Campos editáveis do item a lançar (pré-preenchidos pela leitura da OP)
  const [codigo, setCodigo] = useState('');
  const [descricao, setDescricao] = useState('');
  const [quantidade, setQuantidade] = useState('1');
  const [unidade, setUnidade] = useState('PC');
  const [roteiroSel, setRoteiroSel] = useState<string[]>([]);
  const [filtroProd, setFiltroProd] = useState(''); // filtro dos setores do produto
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
  // Roteiro por componente: cada componente (sub-item) pode ter seu próprio
  // roteiro; vazio = segue o roteiro do produto. Semeado da leitura da OP;
  // editável à mão (funciona mesmo se a OP não abrir). No lançamento:
  // produto = pai, componentes = filhos. `compAbertos` = linhas expandidas
  // (clicar no componente mostra os setores dele).
  const [componentes, setComponentes] = useState<CompRot[]>([]);
  const [compAbertos, setCompAbertos] = useState<Set<number>>(new Set());
  const toggleCompAberto = (i: number) => setCompAbertos(prev => { const n = new Set(prev); if (n.has(i)) n.delete(i); else n.add(i); return n; });
  const rotComp = (c: CompRot) => (c.roteiro.length ? c.roteiro : roteiroSel);

  const setComp = (i: number, patch: Partial<CompRot>) =>
    setComponentes(cs => cs.map((c, idx) => idx === i ? { ...c, ...patch } : c));
  const addComp = () => {
    // Já abre o componente novo, pra digitar código/descrição e escolher setores.
    setCompAbertos(prev => new Set(prev).add(componentes.length));
    setComponentes(cs => [...cs, { codigo: '', descricao: '', quantidade: '1', unidade: 'pc', roteiro: [] }]);
  };
  const remComp = (i: number) => {
    setComponentes(cs => cs.filter((_, idx) => idx !== i));
    // Reindexa as linhas abertas (as de baixo sobem uma posição).
    setCompAbertos(prev => new Set(Array.from(prev).filter(x => x !== i).map(x => x > i ? x - 1 : x)));
  };
  // "Repetir o 1º": copia o roteiro do primeiro componente pros demais.
  const repetirPrimeiroRoteiro = () => setComponentes(cs => cs.length ? cs.map((c, i) => i === 0 ? c : { ...c, roteiro: [...cs[0].roteiro] }) : cs);

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
        // Produto salvo na Anexar OP (bloco [[PRODUTO]]) — vem antes do item e
        // do pedido, que sobrescrevem se tiverem valor.
        const prodSalvo = produtoDasObservacoes(String(ped.observacoes || ''));
        if (prodSalvo) {
          if (prodSalvo.codigo) setCodigo(String(prodSalvo.codigo));
          if (prodSalvo.descricao) setDescricao(String(prodSalvo.descricao));
          if (prodSalvo.quantidade) setQuantidade(String(prodSalvo.quantidade).replace(',', '.'));
          if (prodSalvo.unidade) setUnidade(normalizarUnidade(String(prodSalvo.unidade)));
          if (prodSalvo.po) setPedCliente(String(prodSalvo.po));
          if (prodSalvo.entrega) setEntregaContratual(String(prodSalvo.entrega));
        }
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
        // Componentes salvos na Anexar OP (bloco [[COMPONENTES]]) — aparecem na
        // tela mesmo se a OP não reabrir (B2 fora). Exclui o que == produto.
        {
          const prodRef = {
            codigo: it0?.codigo ? String(it0.codigo) : (prodSalvo?.codigo || ''),
            descricao: it0?.descricao ? String(it0.descricao) : (prodSalvo?.descricao || ''),
          };
          const compsSalvos = componentesDasObservacoes(String(ped.observacoes || ''))
            .filter(c => !ehProdutoDaOp(prodRef, c));
          if (compsSalvos.length) setComponentes(compsSalvos);
        }
        // Tem algo salvo pra mostrar sem a OP? (produto/componentes da Anexar OP
        // ou código já no item). Se não tiver e a OP não reabrir, o aviso explica
        // que a OP é antiga/sem leitura e precisa ser anexada de novo.
        const temSalvo = Boolean(prodSalvo || it0?.codigo || componentesDasObservacoes(String(ped.observacoes || '')).length);

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
            // Semeia os COMPONENTES a partir dos materiais lidos, ignorando o que
            // tem o mesmo código do produto (é o próprio produto, não um filho).
            {
              const comps = (op0.materiais || [])
                .filter(m => (m.codigo || '').trim() && !ehProdutoDaOp(op0.produto, m))
                .map(m => ({
                  codigo: (m.codigo || '').trim(),
                  descricao: (m.descricao || '').trim(),
                  quantidade: (m.quantidade || '1').replace(',', '.').replace(/\.?0+$/, '') || '1',
                  unidade: normalizarUnidade(m.unidade || 'pc'),
                  roteiro: [] as string[],
                }));
              if (comps.length) setComponentes(comps);
            }
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
          setAvisoLeitura((ax?.response?.data?.erro ? ax.response.data.erro + ' ' : '') + (temSalvo
            ? 'Os campos abaixo vieram do que foi lançado no pedido — confira antes de lançar.'
            : 'Esta OP não tem produto nem materiais salvos (foi anexada antes da atualização ou a leitura falhou na Anexar OP). Anexe a OP de novo pela Anexar OP, ou preencha os campos à mão.'));
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
  // Até 4 MB: rota de sempre (passa pelo servidor). Acima: DIRETO pro
  // Backblaze (a Vercel limita requisição a 4,5 MB) — qualquer tamanho.
  async function uploadDesenho(arquivo: File) {
    setUploadingDesenho(true); setDesenhoMsg(''); setDesenhoProg(null);
    const auth = { Authorization: `Bearer ${getToken() || ''}` };
    try {
      if (arquivo.size <= 4 * 1024 * 1024) {
        const fd = new FormData();
        fd.append('arquivo', arquivo);
        const res = await fetch(`/api/pedidos/${pedidoId}/desenho`, { method: 'POST', headers: auth, body: fd });
        const data = await res.json().catch(() => ({}));
        if (data.ok) { setDesenhoMsg('Desenho anexado com sucesso!'); recarregarPedido(); }
        else setDesenhoMsg(data.erro || `Erro ${res.status}`);
        return;
      }
      const r1 = await fetch(`/api/pedidos/${pedidoId}/desenho/direto`, { method: 'POST', headers: { ...auth, 'Content-Type': 'application/json' }, body: JSON.stringify({ acao: 'iniciar', nome: arquivo.name, tipo: arquivo.type }) });
      const up = await r1.json().catch(() => ({}));
      if (!r1.ok) { setDesenhoMsg(up.erro || `Erro ${r1.status}`); return; }
      setDesenhoProg(0);
      const ok = await new Promise<boolean>((resolve) => {
        const xhr = new XMLHttpRequest();
        xhr.open('POST', up.uploadUrl);
        xhr.setRequestHeader('Authorization', up.authorizationToken);
        xhr.setRequestHeader('X-Bz-File-Name', encodeURIComponent(up.fileName));
        xhr.setRequestHeader('Content-Type', arquivo.type || 'b2/x-auto');
        xhr.setRequestHeader('X-Bz-Content-Sha1', 'do_not_verify');
        xhr.upload.onprogress = e => { if (e.lengthComputable) setDesenhoProg(Math.round((e.loaded / e.total) * 100)); };
        xhr.onload = () => resolve(xhr.status >= 200 && xhr.status < 300);
        xhr.onerror = () => resolve(false);
        xhr.send(arquivo);
      });
      if (!ok) {
        setDesenhoMsg('Não consegui enviar o arquivo grande pro armazenamento — falta liberar o CORS no Backblaze (avise o administrador).');
        return;
      }
      const r2 = await fetch(`/api/pedidos/${pedidoId}/desenho/direto`, { method: 'POST', headers: { ...auth, 'Content-Type': 'application/json' }, body: JSON.stringify({ acao: 'confirmar', fileName: up.fileName }) });
      const d2 = await r2.json().catch(() => ({}));
      if (d2.ok) { setDesenhoMsg('Desenho anexado com sucesso!'); recarregarPedido(); }
      else setDesenhoMsg(d2.erro || `Erro ${r2.status}`);
    } catch { setDesenhoMsg('Erro ao enviar o desenho.'); }
    finally { setUploadingDesenho(false); setDesenhoProg(null); }
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
      const obsLimpa = String(pedido?.observacoes || '').split('\n')
        .filter(l => !/^Fábrica:/i.test(l.trim()) && !l.trim().startsWith('[[COMPONENTES]]') && !l.trim().startsWith('[[PRODUTO]]'))
        .join('\n');

      // Cria o item com roteiro próprio ['emissao', ...setores escolhidos] e
      // GRAVA o mesmo roteiro no roteiro_base do pedido — antes ele ficava no
      // mínimo emissao→caldeiraria (do casca HRM) e o painel "Onde está cada OP"
      // desenhava a trilha por ele, mostrando só 2 etapas. Agora o pedido não é
      // mais casca (tem item), então atualizar o roteiro_base é seguro e deixa a
      // trilha do painel/detalhe igual ao roteiro que o PCP montou aqui.
      // ── Com COMPONENTES: produto = item PAI, cada componente = item FILHO ──
      // (item_pai_id, igual "Montar Receita"), cada filho com seu roteiro. Todos
      // são liberados pro 1º setor do próprio roteiro e aparecem separados em
      // "Onde está cada peça".
      if (componentes.length > 0) {
        if (componentes.some(c => rotComp(c).length === 0)) {
          setErro('Cada componente precisa de um roteiro — escolha os setores do produto ou do componente.');
          setLancando(false); return;
        }
        // 1. Cria o produto (pai).
        await editarPedido(pedidoId, {
          observacoes: obsLimpa,
          numero_pedido_cliente: pedCliente,
          entrega_contratual: entregaContratual,
          roteiro_base: ['emissao', ...roteiroSel],
          itens: [{
            codigo: codigo.trim() || 'S/COD', descricao: descricao.trim(),
            quantidade: qtd, unidade: (unidade.trim() || 'pc').toLowerCase(),
            fabrica: 'caldeiraria', roteiro_proprio: ['emissao', ...roteiroSel],
          }],
        });
        // Acha o pai recém-criado (emitido, sem pai).
        const pedPai = await getPedido(pedidoId);
        const pais = (pedPai.itens || []).filter((i: Record<string, unknown>) => i.status === 'emitido' && !i.item_pai_id);
        const pai = pais[pais.length - 1];
        if (!pai) { setErro('Produto criado, mas não encontrei pra vincular os componentes — abra o pedido.'); setLancando(false); return; }
        const paiId = pai.id as number;
        // 2. Cria os componentes (filhos), cada um com seu roteiro.
        await editarPedido(pedidoId, {
          itens: componentes.map(c => ({
            codigo: c.codigo.trim() || 'S/COD', descricao: c.descricao.trim(),
            quantidade: Number(c.quantidade) || 1, unidade: (c.unidade || 'pc').toLowerCase(),
            fabrica: 'caldeiraria', item_pai_id: paiId,
            roteiro_proprio: ['emissao', ...rotComp(c)],
          })),
        });
        // 3. Libera o pai + cada filho pro 1º setor do roteiro de cada um.
        const pedFinal = await getPedido(pedidoId);
        const emitidos = (pedFinal.itens || []).filter((i: Record<string, unknown>) => i.status === 'emitido');
        for (const it of emitidos) {
          const rp = Array.isArray(it.roteiro_proprio) ? (it.roteiro_proprio as string[]) : [];
          const destino = rp.find(s => s !== 'emissao') || roteiroSel[0];
          if (destino) { try { await itemAcao(it.id as number, 'liberar', { setor_destino: destino }); } catch { /* segue */ } }
        }
        router.push('/pcp-hrm/painel');
        return;
      }

      // ── Sem componentes: 1 item só (com o seletor de destino do quadro) ──
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
  // Qtd. de estruturas/projetos informada na Anexar OP (só informativa).
  const qtdEstruturas = qtdEstruturasDasObservacoes(String(pedido?.observacoes || ''));
  const Chip = (label: string, value: string) => (
    <div key={label} style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, padding: '6px 12px', fontSize: 13, color: '#0f172a' }}>
      <span style={{ fontSize: 10.5, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: .5, marginRight: 6 }}>{label}</span>
      <b>{value}</b>
    </div>
  );

  const desenhosPed: string[] = (pedido?.desenhos as string[]) || [];
  const mostraPainel = !carregando && !preview && pedido != null;
  return (
    <div className={mostraPainel ? 'conf-layout' : undefined} style={mostraPainel ? undefined : { maxWidth: 1100, margin: '0 auto' }}>
      <style>{`@media print { .no-print { display:none !important; } }
        .conf-layout{display:grid;grid-template-columns:minmax(0,1fr);gap:16px;max-width:1100px;margin:0 auto}
        .conf-desenho{height:520px}
        @media (min-width: 1500px){
          .conf-layout{grid-template-columns:minmax(420px,1fr) minmax(0,1100px);max-width:none}
          .conf-desenho{position:sticky;top:12px;align-self:start;height:calc(100vh - 90px)}
        }
        @media print { .conf-layout{display:block} }`}</style>
      {mostraPainel && (
        <aside className="conf-desenho no-print">
          <DesenhoPainel desenhos={desenhosPed} pedidoId={pedidoId} token={token} editavel={!preview}
            enviando={uploadingDesenho} progresso={desenhoProg} msg={desenhoMsg}
            onEnviar={uploadDesenho} onRemover={removerDesenho} />
        </aside>
      )}
      <div style={{ minWidth: 0 }}>
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
                  {qtdEstruturas && Chip('Estruturas / projetos', String(qtdEstruturas))}
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
                                    <td style={{ padding: '6px 8px' }}>{formatarQtd(m.quantidade)}</td>
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
                            const nome = nomeDesenho(path, di);
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

          {/* Produto + quantidade (editável; só-leitura na prévia) */}
          <div style={card}>
            <div style={secTitle}><i className="bi bi-box-seam" style={{ marginRight: 6 }} />Produto a fabricar</div>
            {qtdEstruturas && (
              <div style={{ marginBottom: 12, fontSize: 13, color: '#1e3a8a', background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 8, padding: '8px 12px' }}>
                <i className="bi bi-diagram-3" style={{ marginRight: 6 }} />Quantidade de estruturas / projetos (informada na Anexar OP): <b>{qtdEstruturas}</b>
              </div>
            )}
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

          {/* Componentes e roteiros — logo abaixo do Produto a fabricar. Cada componente é uma linha
              compacta; clicar abre os SETORES dele (e os campos pra editar).
              Sem setores escolhidos, o componente segue o roteiro do produto. */}
          <div style={card}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', marginBottom: 12, borderBottom: '2px solid #1a3a5c', paddingBottom: 6 }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: '#1a3a5c', textTransform: 'uppercase', letterSpacing: 1 }}>
                <i className="bi bi-diagram-3" style={{ marginRight: 6 }} />Componentes e roteiros {componentes.length > 0 ? `— ${componentes.length}` : ''}
              </span>
              {!preview && componentes.length > 1 && (
                <button type="button" onClick={repetirPrimeiroRoteiro} title="Copiar o roteiro do 1º componente pros demais"
                  style={{ borderRadius: 8, padding: '5px 12px', fontSize: 12, fontWeight: 700, cursor: 'pointer', border: '1px solid #c7d7ee', background: '#eef4fb', color: '#1a3a5c' }}>
                  <i className="bi bi-arrow-repeat" style={{ marginRight: 4 }} />Repetir o 1º
                </button>
              )}
            </div>

            {componentes.length > 0 && !preview && (
              <div style={{ fontSize: 12.5, color: '#1e40af', background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 8, padding: '8px 12px', marginBottom: 12 }}>
                <i className="bi bi-info-circle" style={{ marginRight: 6 }} />Clique no componente pra escolher os <b>setores</b> dele. Sem setores escolhidos, ele segue o <b>roteiro do produto</b>.
              </div>
            )}

            {componentes.length === 0 && (
              <div style={{ fontSize: 13, color: '#7a8aa0', marginBottom: 12 }}>
                Nenhum componente {op0 ? 'lido da OP' : '(a OP não abriu)'}. Você pode adicionar à mão abaixo.
              </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {componentes.map((c, i) => {
                const aberto = compAbertos.has(i);
                const proprio = c.roteiro.length > 0;
                const rot = rotComp(c);
                return (
                  <div key={i} style={{ border: `1px solid ${aberto ? '#1a3a5c' : '#e2e8f0'}`, borderRadius: 10, background: aberto ? '#fff' : '#fbfdff' }}>
                    <button type="button" onClick={() => toggleCompAberto(i)}
                      style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left' }}>
                      <span style={{ minWidth: 22, height: 22, borderRadius: 11, background: '#1a3a5c', color: '#fff', fontSize: 12, fontWeight: 800, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>{i + 1}</span>
                      <span style={{ flex: 1, minWidth: 0 }}>
                        <span style={{ display: 'block', fontSize: 13, color: '#1e293b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          <b>{c.codigo || '—'}</b> {c.descricao} <span style={{ color: '#64748b' }}>· {c.quantidade} {UNIDADE_LABEL[normalizarUnidade(c.unidade)] || c.unidade}</span>
                        </span>
                        <span style={{ display: 'block', fontSize: 11.5, marginTop: 2, color: proprio ? '#1a3a5c' : '#64748b' }}>
                          {['Emissão', ...rot.map(s => NOMES[s] || s)].join(' → ')}
                          {!proprio && <i> (roteiro do produto)</i>}
                        </span>
                      </span>
                      <i className={`bi ${aberto ? 'bi-chevron-up' : 'bi-chevron-down'}`} style={{ color: '#64748b' }} />
                    </button>
                    {aberto && (
                      <div style={{ padding: '0 12px 12px', borderTop: '1px dashed #e2e8f0' }}>
                        {!preview && (
                          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end', paddingTop: 10 }}>
                            <div style={{ flex: '1 1 120px' }}><label style={lblRo}>Código</label><input value={c.codigo} onChange={e => setComp(i, { codigo: e.target.value })} className={inputCls} /></div>
                            <div style={{ flex: '2 1 220px' }}><label style={lblRo}>Descrição</label><input value={c.descricao} onChange={e => setComp(i, { descricao: e.target.value })} className={inputCls} /></div>
                            <div style={{ flex: '0 0 80px' }}><label style={lblRo}>Qtd</label><input type="number" value={c.quantidade} onChange={e => setComp(i, { quantidade: e.target.value })} className={inputCls} /></div>
                            <div style={{ flex: '0 0 90px' }}>
                              <label style={lblRo}>Un</label>
                              <select value={normalizarUnidade(c.unidade)} onChange={e => setComp(i, { unidade: e.target.value })} className={inputCls}>
                                {UNIDADES.map(([cod, label]) => <option key={cod} value={cod}>{label}</option>)}
                              </select>
                            </div>
                            <button type="button" onClick={() => remComp(i)} title="Remover componente" style={{ border: '1px solid #fecaca', background: '#fff', color: '#dc2626', borderRadius: 8, padding: '8px 10px', cursor: 'pointer', fontWeight: 700 }}><i className="bi bi-trash" /></button>
                          </div>
                        )}
                        <div style={{ marginTop: 10 }}>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 6 }}>
                            <span style={{ fontSize: 11, fontWeight: 700, color: '#64748b' }}>Setores deste componente</span>
                            {!preview && proprio && (
                              <button type="button" onClick={() => setComp(i, { roteiro: [] })}
                                style={{ border: 'none', background: 'none', color: '#64748b', fontSize: 11.5, cursor: 'pointer', textDecoration: 'underline' }}>
                                Voltar pro roteiro do produto
                              </button>
                            )}
                          </div>
                          {preview
                            ? <div style={{ fontSize: 12.5, color: '#1a3a5c' }}>{['Emissão', ...rot.map(s => NOMES[s] || s)].join(' → ')}</div>
                            : <RoteiroPicker roteiro={c.roteiro} onChange={r => setComp(i, { roteiro: r })} />}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {!preview && (
              <button type="button" onClick={addComp} style={{ marginTop: 12, border: '1px dashed #c7d7ee', background: '#fff', color: '#1a3a5c', borderRadius: 8, padding: '8px 14px', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
                <i className="bi bi-plus-lg" style={{ marginRight: 6 }} />Adicionar componente
              </button>
            )}
          </div>

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
              <FiltroSetores roteiro={roteiroSel} onChange={setRoteiroSel} onFiltro={setFiltroProd} />
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {filtroProd && !filtrarSetores(MENU_SETORES.filter(s => !roteiroSel.includes(s)), filtroProd).length && <span style={{ fontSize: 12, color: '#94a3b8' }}>Nenhum setor com &quot;{filtroProd}&quot;.</span>}
                {filtrarSetores(MENU_SETORES.filter(s => !roteiroSel.includes(s)), filtroProd).map(s => (
                  <button key={s} onClick={() => toggleSetor(s)} style={{ border: '1px solid #dee2e6', background: '#fff', borderRadius: 20, padding: '5px 12px', fontSize: 12, fontWeight: 600, color: '#334155', cursor: 'pointer' }}>
                    + {NOMES[s] || s}
                  </button>
                ))}
              </div>
            </div>}
          </div>

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
              {/* Confirmação — modo COMPONENTES: lança o produto (pai) + cada
                  componente (filho) no 1º setor do roteiro de cada um. */}
              {confirmandoLancar && componentes.length > 0 && (
                <div className="no-print" style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 12, padding: '16px 18px', marginBottom: 16 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: '#166534', marginBottom: 8 }}>
                    <i className="bi bi-diagram-3" style={{ marginRight: 6 }} />
                    Vai lançar o produto + {componentes.length} componente{componentes.length > 1 ? 's' : ''}
                  </div>
                  <div style={{ fontSize: 12.5, color: '#4b5563', display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <div><b>{codigo || 'Produto'}</b> — {NOMES[roteiroSel[0]] || roteiroSel[0]} (roteiro do produto)</div>
                    {componentes.map((c, i) => {
                      const r = rotComp(c);
                      return <div key={i}>↳ <b>{c.codigo || `Comp ${i + 1}`}</b> ({c.quantidade} {c.unidade}) → {r.length ? (NOMES[r[0]] || r[0]) : <span style={{ color: '#b45309' }}>sem roteiro!</span>}</div>;
                    })}
                  </div>
                  <div style={{ fontSize: 11.5, color: '#64748b', marginTop: 8 }}>Cada um vira um item rastreado em &quot;Onde está cada peça&quot;.</div>
                </div>
              )}

              {/* Confirmação — modo 1 ITEM: ESCOLHE pra qual(is) setor(es) mandar.
                  1 setor = peça inteira; vários = divide a quantidade. */}
              {confirmandoLancar && componentes.length === 0 && roteiroSel.length > 0 && (
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
                      const temComp = componentes.length > 0;
                      const podeConfirmar = temComp ? !lancando : (!lancando && !bloqueiaMulti && somaConfere);
                      const rotulo = lancando ? 'Lançando…'
                        : temComp ? `Confirmar — lançar produto + ${componentes.length} componente${componentes.length > 1 ? 's' : ''}`
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
    </div>
  );
}
