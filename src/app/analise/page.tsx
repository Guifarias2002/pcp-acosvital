'use client';
import { useEffect, useState, useCallback } from 'react';
import AuthGuard from '@/components/AuthGuard';
import { getToken, isAdministrador, podeVerAnalise, getUser } from '@/lib/auth';
import { MAQUINAS_POR_SETOR, fotoMaquina } from '@/lib/maquinas';

const NOMES: Record<string, string> = {
  emissao: 'Emissão', usinagem: 'Usinagem', 'maçarico': 'Corte Maçarico', plasma: 'Corte Plasma',
  laser: 'Corte Laser', serra: 'Corte Serra', estoque: 'Estoque', furacao: 'Furação',
  qualidade: 'Qualidade', acabamento: 'Acabamento', logistica: 'Logística', recebimento: 'Recebimento',
  compras: 'Compras', beneficiadores: 'Beneficiadores', embalagem: 'Embalagem', quarentena: 'Quarentena', desenho: 'Desenho',
};

const nm = (c: string) => NOMES[c] || c || '—';
const fmt = (x: number | string | null | undefined, d = 0) =>
  x == null || x === '' ? '—' : Number(x).toLocaleString('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d });
// Tempo exato a partir de segundos corridos (sem arredondamento intermediário),
// mostrando horas, minutos E segundos. Durações curtas (< 1 min) não somem mais
// como "0h 00min" — ex.: 8s aparece como "8s", 4h50min23s como "4h 50min 23s".
function fmtHorasMin(segundos: number | string | null | undefined) {
  const s = Math.max(0, Math.round(Number(segundos || 0)));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const seg = s % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  if (h > 0) return `${h}h ${pad(m)}min ${pad(seg)}s`;
  if (m > 0) return `${m}min ${pad(seg)}s`;
  return `${seg}s`;
}

// ── datas (segunda-feira = início da semana, igual date_trunc('week')) ────────
function iso(d: Date) { return d.toISOString().slice(0, 10); }
function segundaDaSemana(base: Date) {
  const d = new Date(base); const dia = (d.getDay() + 6) % 7; d.setDate(d.getDate() - dia); d.setHours(0, 0, 0, 0); return d;
}
function labelSemana(dataIso: string) {
  const d = new Date(dataIso + 'T12:00:00'); const fim = new Date(d); fim.setDate(d.getDate() + 6);
  const f = (x: Date) => `${String(x.getDate()).padStart(2, '0')}/${String(x.getMonth() + 1).padStart(2, '0')}`;
  return `${f(d)}–${f(fim)}`;
}
// "01/08/2026 → 19/08/2026" a partir de dois ISO 'YYYY-MM-DD'.
function labelPeriodo(deIso: string, ateIso: string) {
  const br = (s: string) => s ? s.split('-').reverse().join('/') : '—';
  return `${br(deIso)} → ${br(ateIso)}`;
}

interface Dados {
  periodo: { de: string; ate: string; setores: string[] };
  etapas: { entregue?: string; a_produzir?: string; produzindo?: string; atrasados?: string; total?: string };
  volume: { pedidos?: string; itens?: string; pecas?: string };
  throughput: { setor: string; finalizacoes: number; itens: number; pecas: number }[];
  semanal: { criados: Rec[]; final: Rec[]; entregas: Rec[] };
  tempo_etapa: Rec[];
  lead: { n?: string; media_dias?: string; mediana_dias?: string; min_dias?: string; max_dias?: string };
  wip: Rec[];
  top_paradas: Rec[];
  mix_tipo: Rec[];
  lideres: Rec[];
  maquinas: Rec[];
  atraso_setor: Rec[];
  produtos: Rec[];
  catalogo_flanges?: { codigo: string; descricao: string; pedidos: number; pecas: number; itens: number; segundos_producao: number; seg_por_peca: number }[];
}
type Rec = Record<string, string>;

const C = { azul: '#1a3a5c', azul2: '#1d4ed8', verde: '#16a34a', laranja: '#d97706', vermelho: '#dc2626', roxo: '#7c3aed', cinza: '#64748b' };

// Diagnóstico executivo calculado ao vivo (endpoint /api/analise/diagnostico).
interface DiagMaq {
  maquina: string; ciclos: number; dias_uso?: number; desde?: string | null; ciclo_mediano_h: number; horas_registradas: number;
  cadastrada?: boolean; capacidade_dia_h?: number | null; dias_uteis_periodo?: number | null; utilizacao_pct?: number | null;
}
interface Diag {
  periodo: { de: string; ate: string; dias_produzidos: number };
  producao: { mes: string; un: number; itens: number; dias: number; media_dia: number | null }[];
  crescimento_dia_pct: number | null;
  ritmo: { mes: string; apontamentos: number; dia: number | null }[];
  wip: { un_wip: number; un_entregue: number; un_total: number; pct_wip: number | null };
  maquina_lider: DiagMaq | null;
  maquinas: DiagMaq[];
  maq_desde: string | null;
  gargalos: { setor: string; passagens: number; dias_medio: number; dias_mediana: number }[];
  qualidade: { com_tempo: number; timer_estourado: number; pct_timer_estourado: number | null };
  demanda: {
    meta_mensal_un: number | null; dias_uteis_mes: number; necessidade_dia: number | null;
    producao_dia_atual: number | null; saldo_dia: number | null; risco_atraso: boolean | null; tem_capacidade: boolean;
  };
  ritmo_saida: {
    dia: number; semana: number; mes: number;
    dias_uteis_semana: number; dias_uteis_mes: number; mes_ref: string | null;
  } | null;
  recordes: {
    top_produto: { codigo: string; descricao: string; pecas: number; itens: number } | null;
    maior_pedido: { numero: string; cliente: string; pecas: number; itens: number } | null;
  };
  folga: {
    pecas_por_pedido: number | null;
    folga_dia_pecas: number | null;
    folga_mes_pecas: number | null;
    folga_mes_pedidos: number | null;
  };
}
// Acompanhamento de fabricação (endpoint /api/analise/fabricacao) — Flanges.
interface Fab {
  funil: {
    fila: { itens: number; un: number };
    em_fabricacao: { itens: number; un: number };
    pronto: { itens: number; un: number };
    entregue: { itens: number; un: number };
  };
  total_un: number;
  fabricadas_un: number;
  fabricado_mes: { mes: string; itens: number; un: number }[];
  meta: {
    meta_mensal_un: number | null; mes_atual: string; fabricado_mes_atual_un: number;
    dias_uteis_mes: number; dias_uteis_decorridos: number;
    ritmo_necessario_dia: number | null; ritmo_real_dia: number | null;
    projetado_fim_mes: number | null; faltam_un: number | null; risco: boolean | null;
  };
}

// Parâmetros editáveis (capacidade por máquina + meta de demanda).
interface ParamMaq { maquina: string; horas_dia: number; dias_semana: number; cadastrada: boolean; usada: boolean }

export default function AnalisePage() {
  const hoje = new Date();
  const [de, setDe] = useState(iso(new Date(hoje.getFullYear(), hoje.getMonth(), 1)));
  const [ate, setAte] = useState(iso(hoje));
  const setores: string[] = []; // filtro de setores removido — Análise sempre considera todos
  const [dados, setDados] = useState<Dados | null>(null);
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState('');
  const [fechamentos, setFechamentos] = useState<Rec[]>([]);
  const [genLoad, setGenLoad] = useState(false);
  const [detalhe, setDetalhe] = useState<{ titulo: string; loading: boolean; itens: Rec[] } | null>(null);
  const [aba, setAba] = useState<'geral' | 'homem' | 'maquina' | 'catalogo'>('geral');
  const [maquinaSel, setMaquinaSel] = useState<string | null>(null);
  const [maqDet, setMaqDet] = useState<{ loading: boolean; rows: Rec[] } | null>(null);
  // Diagnóstico executivo (histórico inteiro, calculado ao vivo no back).
  const [diag, setDiag] = useState<Diag | null>(null);
  const carregarDiag = useCallback(() => {
    fetch('/api/analise/diagnostico', { headers: { Authorization: `Bearer ${getToken() || ''}` } })
      .then(r => (r.ok ? r.json() : null))
      .then(d => { if (d && !d.erro) setDiag(d as Diag); })
      .catch(() => {});
  }, []);
  useEffect(() => { carregarDiag(); }, [carregarDiag]);

  // Acompanhamento de fabricação (funil ao vivo + meta do mês) — Flanges.
  const [fab, setFab] = useState<Fab | null>(null);
  const carregarFab = useCallback(() => {
    fetch('/api/analise/fabricacao', { headers: { Authorization: `Bearer ${getToken() || ''}` } })
      .then(r => (r.ok ? r.json() : null))
      .then(d => { if (d && !d.erro) setFab(d as Fab); })
      .catch(() => {});
  }, []);
  useEffect(() => { carregarFab(); }, [carregarFab]);

  // Parâmetros editáveis: capacidade por máquina + meta de demanda.
  const meStaff = !!getUser()?.is_staff;
  const [params, setParams] = useState<{ maquinas: ParamMaq[]; meta: string } | null>(null);
  const [paramsAberto, setParamsAberto] = useState(false);
  const [savingParams, setSavingParams] = useState(false);
  const carregarParams = useCallback(() => {
    fetch('/api/analise/parametros', { headers: { Authorization: `Bearer ${getToken() || ''}` } })
      .then(r => (r.ok ? r.json() : null))
      .then(d => { if (d) setParams({ maquinas: (d.maquinas || []) as ParamMaq[], meta: d.meta_mensal_un != null ? String(d.meta_mensal_un) : '' }); })
      .catch(() => {});
  }, []);
  useEffect(() => { carregarParams(); }, [carregarParams]);
  const setParamMaq = (nome: string, campo: 'horas_dia' | 'dias_semana', valor: string) =>
    setParams(p => p ? { ...p, maquinas: p.maquinas.map(m => m.maquina === nome ? { ...m, [campo]: Number(valor) } : m) } : p);
  async function salvarParams() {
    if (!params) return;
    setSavingParams(true);
    try {
      const res = await fetch('/api/analise/parametros', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken() || ''}` },
        body: JSON.stringify({
          maquinas: params.maquinas.map(m => ({ maquina: m.maquina, horas_dia: Number(m.horas_dia), dias_semana: Number(m.dias_semana) })),
          meta_mensal_un: params.meta === '' ? '' : Number(params.meta),
        }),
      });
      if (res.ok) { carregarParams(); carregarDiag(); carregarFab(); }
    } catch { /* ignora */ } finally { setSavingParams(false); }
  }
  const admin = isAdministrador();
  const podeVer = podeVerAnalise(); // admin OU usuário com a flag pode_ver_analise

  async function abrirDetalhe(tipo: string, chave: string, titulo: string) {
    setDetalhe({ titulo, loading: true, itens: [] });
    try {
      const q = new URLSearchParams({ tipo, chave, de, ate });
      const res = await fetch(`/api/analise/detalhe?${q}`, { headers: { Authorization: `Bearer ${getToken() || ''}` } });
      const j = await res.json();
      setDetalhe({ titulo, loading: false, itens: res.ok ? (j.itens || []) : [] });
    } catch { setDetalhe({ titulo, loading: false, itens: [] }); }
  }

  const carregar = useCallback(async (d: string, a: string, s: string[]) => {
    setLoading(true); setErro('');
    try {
      const q = new URLSearchParams({ de: d, ate: a });
      if (s.length) q.set('setores', s.join(','));
      const res = await fetch(`/api/analise?${q}`, { headers: { Authorization: `Bearer ${getToken() || ''}` } });
      const j = await res.json();
      if (!res.ok) throw new Error(j.erro || 'Erro ao carregar');
      setDados(j);
    } catch (e) { setErro((e as Error).message); } finally { setLoading(false); }
  }, []);

  // Fechamento semanal: backfill automático das semanas fechadas (POST) + lista.
  // Só admin — quem tem acesso só de leitura não gera, apenas lista (GET).
  const gerarFechamentos = useCallback(async () => {
    setGenLoad(true);
    try {
      const res = await fetch('/api/analise/fechamento', { method: 'POST', headers: { Authorization: `Bearer ${getToken() || ''}` } });
      const j = await res.json();
      if (res.ok) setFechamentos(j.fechamentos || []);
    } catch { /* silencioso — histórico é secundário */ } finally { setGenLoad(false); }
  }, []);

  // Só lista os fechamentos já gravados (GET) — pra quem tem acesso de leitura.
  const listarFechamentos = useCallback(async () => {
    try {
      const res = await fetch('/api/analise/fechamento', { headers: { Authorization: `Bearer ${getToken() || ''}` } });
      const j = await res.json();
      if (res.ok) setFechamentos(j.fechamentos || []);
    } catch { /* silencioso */ }
  }, []);

  useEffect(() => { if (podeVer) { carregar(de, ate, setores); if (admin) gerarFechamentos(); else listarFechamentos(); } /* eslint-disable-next-line */ }, [podeVer, admin]);

  // Detalhe por pedido/peça da máquina selecionada (modal de resumo).
  useEffect(() => {
    if (!maquinaSel) { setMaqDet(null); return; }
    let cancel = false;
    setMaqDet({ loading: true, rows: [] });
    const q = new URLSearchParams({ tipo: 'maquina', chave: maquinaSel, de, ate });
    fetch(`/api/analise/detalhe?${q}`, { headers: { Authorization: `Bearer ${getToken() || ''}` } })
      .then(r => r.json())
      .then(d => { if (!cancel) setMaqDet({ loading: false, rows: (d.itens as Rec[]) || [] }); })
      .catch(() => { if (!cancel) setMaqDet({ loading: false, rows: [] }); });
    return () => { cancel = true; };
  }, [maquinaSel, de, ate]);

  function atalhoSemana(offset: number) {
    const seg = segundaDaSemana(hoje); seg.setDate(seg.getDate() - offset * 7);
    const dom = new Date(seg); dom.setDate(seg.getDate() + 6);
    const d = iso(seg), a = iso(dom > hoje ? hoje : dom);
    setDe(d); setAte(a); carregar(d, a, setores);
  }
  function atalhoUlt4() {
    const seg = segundaDaSemana(hoje); seg.setDate(seg.getDate() - 21);
    const d = iso(seg), a = iso(hoje); setDe(d); setAte(a); carregar(d, a, setores);
  }
  function atalhoMes() {
    const d = iso(new Date(hoje.getFullYear(), hoje.getMonth(), 1)), a = iso(hoje);
    setDe(d); setAte(a); carregar(d, a, setores);
  }

  if (!podeVer) return (
    <AuthGuard><div style={{ padding: 40, textAlign: 'center', color: C.cinza }}>
      <i className="bi bi-lock-fill" style={{ fontSize: 32, color: C.vermelho }} />
      <p style={{ marginTop: 12, fontWeight: 700 }}>Acesso restrito.</p>
    </div></AuthGuard>
  );

  const et = dados?.etapas || {};
  const vol = dados?.volume || {};
  const lead = dados?.lead || {};
  const semanas = mergeSemanas(dados);
  const picoFinal = Math.max(1, ...semanas.map(s => s.final));
  // Projeção (média observada por semana → mês). Não é modelo estatístico:
  // é o ritmo real médio do período selecionado, projetado adiante.
  const nSem = Math.max(1, semanas.length);
  const capSemana = (dados?.semanal.final || []).reduce((a, r) => a + Number(r.pecas || 0), 0) / nSem;
  const demSemana = (dados?.semanal.criados || []).reduce((a, r) => a + Number(r.pecas || 0), 0) / nSem;
  const capMes = capSemana * 4.3;
  const saldoSemana = demSemana - capSemana;

  return (
    <AuthGuard>
      <style>{`@media print{.no-print{display:none!important}.analise{padding:0!important}}
        .abtn{border:1.5px solid #e2e8f0;background:#fff;border-radius:8px;padding:7px 12px;font-size:12.5px;font-weight:700;color:#334155;cursor:pointer}
        .abtn:hover{border-color:${C.azul}}
        .achip{border:1.5px solid #e2e8f0;background:#fff;border-radius:999px;padding:5px 11px;font-size:12px;font-weight:600;color:#475569;cursor:pointer}
        .achip.on{background:${C.azul};color:#fff;border-color:${C.azul}}
      `}</style>
      <div className="analise" style={{ maxWidth: 1080, margin: '0 auto' }}>
        {/* Cabeçalho */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, marginBottom: 12, flexWrap: 'wrap' }}>
          <div>
            <h4 style={{ margin: 0, fontWeight: 800, color: C.azul, fontSize: 22 }}>
              <i className="bi bi-graph-up-arrow" style={{ marginRight: 8 }} />Análise de PCP — Flanges
            </h4>
            <small style={{ color: '#94a3b8' }}>
              Indicadores de produção para decisão de fábrica e diretoria. {dados && `Período ${dados.periodo.de} a ${dados.periodo.ate}.`}
            </small>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button className="abtn no-print" onClick={() => window.print()}><i className="bi bi-printer" style={{ marginRight: 6 }} />Imprimir / PDF</button>
          </div>
        </div>

        {/* ── Diagnóstico executivo (ao vivo, histórico inteiro) ─────────────── */}
        {diag && (() => {
          const mesLabel = (m: string) => `${m.slice(5)}/${m.slice(2, 4)}`;
          // Mês mais recente COMPLETO (>=10 dias) — evita o mês corrente parcial.
          const completos = diag.producao.filter(m => m.dias >= 10 && m.media_dia != null);
          const ult = completos[completos.length - 1] || diag.producao[diag.producao.length - 1] || null;
          const cres = diag.crescimento_dia_pct;
          const corCres = cres == null ? C.cinza : cres >= 0 ? C.verde : C.vermelho;
          // Gargalos internos de produção (tira fim-de-linha e emissão).
          const gargProd = diag.gargalos.filter(g => !['quarentena', 'logistica', 'emissao'].includes(g.setor)).slice(0, 5);
          const tile = (label: string, valor: string, cor: string, sub?: string) => (
            <div style={{ flex: '1 1 150px', minWidth: 140, background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 10, padding: '10px 12px' }}>
              <div style={{ fontSize: 10.5, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: .6 }}>{label}</div>
              <div style={{ fontSize: 20, fontWeight: 800, color: cor, lineHeight: 1.15, marginTop: 2 }}>{valor}</div>
              {sub && <div style={{ fontSize: 11, color: '#64748b', marginTop: 1 }}>{sub}</div>}
            </div>
          );
          const th = { textAlign: 'left' as const, padding: '4px 8px', fontSize: 10.5, color: '#94a3b8', textTransform: 'uppercase' as const, fontWeight: 700 };
          const td = { padding: '4px 8px', fontSize: 12.5, color: '#334155', borderTop: '1px solid #f1f5f9' };
          return (
            <div className="card" style={{ padding: 16, marginBottom: 18, border: `1.5px solid ${C.azul}` }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
                <div style={{ fontSize: 13, fontWeight: 800, color: C.azul }}>
                  <i className="bi bi-clipboard-data" style={{ marginRight: 6 }} />Diagnóstico executivo
                  <span style={{ fontWeight: 500, color: '#94a3b8', fontSize: 11.5, marginLeft: 8 }}>
                    histórico {diag.periodo?.de} → {diag.periodo?.ate} · {diag.periodo?.dias_produzidos} dias produzidos · dado real, ao vivo
                  </span>
                </div>
              </div>

              {/* KPIs */}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 14 }}>
                {tile('Produção média', ult?.media_dia != null ? `${fmt(ult.media_dia, 1)} un/dia` : '—', C.azul2, ult ? `mês ${mesLabel(ult.mes)} · ${fmt(ult.un)} un` : undefined)}
                {tile('Tendência (mês a mês)', cres == null ? '—' : `${cres >= 0 ? '+' : ''}${fmt(cres, 1)}%`, corCres, 'produção/dia')}
                {tile('Em processo (WIP)', diag.wip?.pct_wip != null ? `${fmt(diag.wip.pct_wip, 1)}%` : '—', C.laranja, `${fmt(diag.wip?.un_wip)} de ${fmt(diag.wip?.un_total)} un`)}
                {tile('Máquina líder', diag.maquina_lider?.maquina || '—', C.roxo, diag.maquina_lider ? `ciclo mediano ${fmt(diag.maquina_lider.ciclo_mediano_h, 2)} h · ${diag.maquina_lider.ciclos} ciclos` : undefined)}
                {/* Demanda × produção — só quando a meta está cadastrada. */}
                {diag.demanda?.necessidade_dia != null && (
                  tile('Necessidade', `${fmt(diag.demanda.necessidade_dia, 1)} un/dia`, C.azul,
                    `meta ${fmt(diag.demanda.meta_mensal_un)}/mês ÷ ${diag.demanda.dias_uteis_mes}d`)
                )}
                {diag.demanda?.saldo_dia != null && (
                  tile('Saldo/dia', `${diag.demanda.saldo_dia >= 0 ? '+' : ''}${fmt(diag.demanda.saldo_dia, 1)} un`,
                    diag.demanda.risco_atraso ? C.vermelho : C.verde,
                    diag.demanda.risco_atraso ? '⚠ risco de atraso' : '✓ produção cobre a meta')
                )}
              </div>

              {/* Peças saindo — ritmo real projetado em dia / semana / mês */}
              {diag.ritmo_saida && (() => {
                const r = diag.ritmo_saida;
                const stat = (v: string, l: string, hint?: string) => (
                  <div style={{ flex: '1 1 140px', minWidth: 130 }}>
                    <div style={{ fontSize: 24, fontWeight: 800, color: C.azul, lineHeight: 1.1 }}>{v}</div>
                    <div style={{ fontSize: 12, fontWeight: 700, color: '#0369a1' }}>{l}</div>
                    {hint && <div style={{ fontSize: 10.5, color: '#94a3b8', marginTop: 1 }}>{hint}</div>}
                  </div>
                );
                return (
                  <div style={{ background: '#f0f9ff', border: '1px solid #bae6fd', borderRadius: 10, padding: '12px 14px', marginBottom: 14 }}>
                    <div style={{ fontSize: 11, fontWeight: 800, color: C.azul, textTransform: 'uppercase', letterSpacing: .5, marginBottom: 10 }}>
                      <i className="bi bi-box-seam" style={{ marginRight: 6 }} />Peças saindo — ritmo real
                      <span style={{ fontWeight: 500, textTransform: 'none', color: '#94a3b8', marginLeft: 6 }}>
                        média do mês {r.mes_ref ? mesLabel(r.mes_ref) : 'mais recente'}, projetada
                      </span>
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14 }}>
                      {stat(fmt(r.dia, 0), 'peças / dia', 'média por dia produzido')}
                      {stat(fmt(r.semana, 0), 'peças / semana', `~${fmt(r.dias_uteis_semana, 1)} dias úteis`)}
                      {stat(fmt(r.mes, 0), 'peças / mês', `~${r.dias_uteis_mes} dias úteis`)}
                    </div>
                  </div>
                );
              })()}

              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16 }}>
                {/* Produção mês a mês */}
                <div style={{ flex: '1 1 300px', minWidth: 280 }}>
                  <div style={{ fontSize: 11, fontWeight: 800, color: C.cinza, marginBottom: 4 }}>Produção entregue por mês</div>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead><tr><th style={th}>Mês</th><th style={{ ...th, textAlign: 'right' }}>Un</th><th style={{ ...th, textAlign: 'right' }}>Dias</th><th style={{ ...th, textAlign: 'right' }}>Un/dia</th></tr></thead>
                    <tbody>
                      {diag.producao.map(m => (
                        <tr key={m.mes}>
                          <td style={td}>{mesLabel(m.mes)}</td>
                          <td style={{ ...td, textAlign: 'right', fontWeight: 700 }}>{fmt(m.un)}</td>
                          <td style={{ ...td, textAlign: 'right', color: '#94a3b8' }}>{m.dias}</td>
                          <td style={{ ...td, textAlign: 'right', fontWeight: 700, color: C.azul2 }}>{m.media_dia != null ? fmt(m.media_dia, 1) : '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Gargalos internos */}
                <div style={{ flex: '1 1 300px', minWidth: 280 }}>
                  <div style={{ fontSize: 11, fontWeight: 800, color: C.cinza, marginBottom: 4 }}>Gargalos internos <span style={{ fontWeight: 400, color: '#94a3b8' }}>(dias parado por setor)</span></div>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead><tr><th style={th}>Setor</th><th style={{ ...th, textAlign: 'right' }}>Dias méd.</th></tr></thead>
                    <tbody>
                      {gargProd.map(g => (
                        <tr key={g.setor}>
                          <td style={td}>{nm(g.setor)}</td>
                          <td style={{ ...td, textAlign: 'right', fontWeight: 700, color: g.dias_medio >= 1.3 ? C.vermelho : g.dias_medio >= 1 ? C.laranja : C.verde }}>{fmt(g.dias_medio, 2)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Recordes — quem mais produziu e o maior pedido (por peças) */}
              {(diag.recordes?.top_produto || diag.recordes?.maior_pedido) && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginTop: 14 }}>
                  {diag.recordes?.top_produto && (
                    <div style={{ flex: '1 1 260px', minWidth: 240, background: '#faf5ff', border: '1px solid #e9d5ff', borderRadius: 10, padding: '10px 14px' }}>
                      <div style={{ fontSize: 10.5, fontWeight: 700, color: '#7c3aed', textTransform: 'uppercase', letterSpacing: .5 }}>
                        <i className="bi bi-trophy" style={{ marginRight: 5 }} />Produto que mais produziu
                      </div>
                      <div style={{ fontSize: 15, fontWeight: 800, color: C.azul, marginTop: 3 }}>
                        {fmt(diag.recordes.top_produto.pecas, 0)} peças
                      </div>
                      <div style={{ fontSize: 12, color: '#64748b', marginTop: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        <b>{diag.recordes.top_produto.codigo}</b>{diag.recordes.top_produto.descricao ? ` · ${diag.recordes.top_produto.descricao}` : ''}
                      </div>
                    </div>
                  )}
                  {diag.recordes?.maior_pedido && (
                    <div style={{ flex: '1 1 260px', minWidth: 240, background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 10, padding: '10px 14px' }}>
                      <div style={{ fontSize: 10.5, fontWeight: 700, color: C.verde, textTransform: 'uppercase', letterSpacing: .5 }}>
                        <i className="bi bi-star" style={{ marginRight: 5 }} />Maior pedido
                      </div>
                      <div style={{ fontSize: 15, fontWeight: 800, color: C.azul, marginTop: 3 }}>
                        {fmt(diag.recordes.maior_pedido.pecas, 0)} peças
                      </div>
                      <div style={{ fontSize: 12, color: '#64748b', marginTop: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        <b>PV {diag.recordes.maior_pedido.numero}</b>{diag.recordes.maior_pedido.cliente ? ` · ${diag.recordes.maior_pedido.cliente}` : ''}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Folga — quantas peças/pedidos a mais ainda cabem além da meta */}
              {diag.folga?.folga_mes_pecas != null ? (
                <div style={{ marginTop: 12, fontSize: 12.5, color: '#166534', background: '#f0fdf4', border: '1px solid #86efac', borderRadius: 8, padding: '9px 12px', lineHeight: 1.5 }}>
                  <i className="bi bi-plus-circle" style={{ marginRight: 6 }} />
                  <b>Ainda cabe:</b> além da meta, no ritmo de hoje dá pra produzir cerca de <b>+{fmt(diag.folga.folga_mes_pecas, 0)} peças/mês</b>
                  {diag.folga.folga_mes_pedidos != null && diag.folga.pecas_por_pedido != null && (
                    <> — mais ou menos <b>{fmt(diag.folga.folga_mes_pedidos, 1)} pedido{diag.folga.folga_mes_pedidos >= 2 ? 's' : ''} a mais</b> <span style={{ color: '#94a3b8' }}>(pedido médio ~{fmt(diag.folga.pecas_por_pedido, 0)} peças)</span></>
                  )}.
                </div>
              ) : (diag.demanda?.meta_mensal_un != null && diag.demanda?.saldo_dia != null && diag.demanda.saldo_dia <= 0) ? (
                <div style={{ marginTop: 12, fontSize: 12.5, color: '#92400e', background: '#fffbeb', border: '1px solid #fcd34d', borderRadius: 8, padding: '9px 12px', lineHeight: 1.5 }}>
                  <i className="bi bi-exclamation-triangle" style={{ marginRight: 6 }} />
                  <b>Sem folga:</b> no ritmo de hoje a produção não sobra sobre a meta — não há capacidade livre pra novos pedidos sem acelerar.
                </div>
              ) : null}

              {/* Máquinas — ciclo mediano + utilização (quando a jornada foi cadastrada) */}
              <div style={{ marginTop: 14 }}>
                <div style={{ fontSize: 11, fontWeight: 800, color: C.cinza, marginBottom: 4 }}>
                  Máquinas <span style={{ fontWeight: 400, color: '#94a3b8' }}>
                    (ciclo mediano · utilização = horas ÷ jornada{diag.maq_desde ? ` desde ${diag.maq_desde.split('-').reverse().join('/')}` : ' desde o início da máquina'})
                  </span>
                </div>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 480 }}>
                    <thead><tr>
                      <th style={th}>Máquina</th>
                      <th style={{ ...th, textAlign: 'right' }}>Ciclos</th>
                      <th style={{ ...th, textAlign: 'right' }}>Ciclo mediano</th>
                      <th style={{ ...th, textAlign: 'right' }}>Horas reg.</th>
                      <th style={{ ...th, textAlign: 'right' }}>Utilização</th>
                    </tr></thead>
                    <tbody>
                      {diag.maquinas.slice(0, 10).map(m => {
                        const u = m.utilizacao_pct;
                        const cor = u == null ? '#cbd5e1' : u > 100 ? C.vermelho : u >= 70 ? C.verde : u >= 40 ? C.laranja : C.azul2;
                        return (
                          <tr key={m.maquina}>
                            <td style={td}>{m.maquina}</td>
                            <td style={{ ...td, textAlign: 'right', color: '#94a3b8' }}>{m.ciclos}</td>
                            <td style={{ ...td, textAlign: 'right', fontWeight: 700 }}>{fmt(m.ciclo_mediano_h, 2)} h</td>
                            <td style={{ ...td, textAlign: 'right', color: '#94a3b8' }}>{fmt(m.horas_registradas, 1)} h</td>
                            <td style={{ ...td, textAlign: 'right', fontWeight: 800, color: cor }}>
                              {u == null ? <span style={{ fontWeight: 600, color: '#94a3b8' }}>jornada?</span> : `${fmt(u, 0)}%`}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Alertas de qualidade de dado + o que falta */}
              <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 6 }}>
                {diag.qualidade?.pct_timer_estourado != null && diag.qualidade.pct_timer_estourado > 0 && (
                  <div style={{ fontSize: 11.5, color: '#92400e', background: '#fffbeb', border: '1px solid #fcd34d', borderRadius: 8, padding: '7px 10px' }}>
                    <i className="bi bi-exclamation-triangle" style={{ marginRight: 6 }} />
                    <b>{fmt(diag.qualidade.pct_timer_estourado, 0)}%</b> dos apontamentos de máquina têm o cronômetro maior que o tempo real (timer não pausado) — as <b>horas de máquina</b> estão superestimadas. Por isso uso o <b>ciclo mediano</b>, não a média.
                  </div>
                )}
                {(!diag.demanda?.tem_capacidade || diag.demanda?.meta_mensal_un == null) ? (
                  <div style={{ fontSize: 11.5, color: '#475569', background: '#f1f5f9', border: '1px solid #e2e8f0', borderRadius: 8, padding: '7px 10px' }}>
                    <i className="bi bi-info-circle" style={{ marginRight: 6 }} />
                    Falta cadastrar {!diag.demanda?.tem_capacidade && <b>capacidade (jornada por máquina)</b>}
                    {!diag.demanda?.tem_capacidade && diag.demanda?.meta_mensal_un == null && ' e '}
                    {diag.demanda?.meta_mensal_un == null && <b>demanda (meta mensal)</b>} — sem isso, utilização, ociosidade, saldo e risco de atraso ficam em branco.{' '}
                    <button onClick={() => setParamsAberto(true)} style={{ border: 'none', background: 'none', color: C.azul2, fontWeight: 700, cursor: 'pointer', textDecoration: 'underline', padding: 0 }}>Cadastrar agora ↓</button>
                  </div>
                ) : (
                  <div style={{ fontSize: 11.5, color: '#065f46', background: '#ecfdf5', border: '1px solid #a7f3d0', borderRadius: 8, padding: '7px 10px' }}>
                    <i className="bi bi-check-circle" style={{ marginRight: 6 }} />
                    Utilização e demanda calculadas a partir dos <b>Parâmetros</b> cadastrados. Ajuste em Parâmetros (abaixo) quando a jornada ou a meta mudar.
                  </div>
                )}
              </div>
            </div>
          );
        })()}

        {/* ── Acompanhamento de fabricação (funil ao vivo + meta do mês) ─────── */}
        {fab && (() => {
          const F = fab.funil;
          const total = fab.total_un || 1;
          const mesLabel = (m: string) => `${m.slice(5)}/${m.slice(2, 4)}`;
          // Segmentos do funil, na ordem do processo.
          const segs = [
            { k: 'fila', label: 'Na fila', cor: '#cbd5e1', v: F.fila },
            { k: 'em_fabricacao', label: 'Em fabricação', cor: '#3b82f6', v: F.em_fabricacao },
            { k: 'pronto', label: 'Fabricadas — prontas', cor: C.verde, v: F.pronto },
            { k: 'entregue', label: 'Entregues', cor: '#0f766e', v: F.entregue },
          ];
          const M = fab.meta;
          const meta = M.meta_mensal_un;
          const pctMeta = meta && meta > 0 ? Math.min(100, (M.fabricado_mes_atual_un / meta) * 100) : 0;
          const pctRitmo = Math.min(100, (M.dias_uteis_decorridos / M.dias_uteis_mes) * 100); // onde "deveríamos" estar hoje
          const tile = (label: string, valor: string, cor: string, sub?: string) => (
            <div style={{ flex: '1 1 150px', minWidth: 140, background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 10, padding: '10px 12px' }}>
              <div style={{ fontSize: 10.5, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: .6 }}>{label}</div>
              <div style={{ fontSize: 20, fontWeight: 800, color: cor, lineHeight: 1.15, marginTop: 2 }}>{valor}</div>
              {sub && <div style={{ fontSize: 11, color: '#64748b', marginTop: 1 }}>{sub}</div>}
            </div>
          );
          const th = { textAlign: 'left' as const, padding: '4px 8px', fontSize: 10.5, color: '#94a3b8', textTransform: 'uppercase' as const, fontWeight: 700 };
          const td = { padding: '4px 8px', fontSize: 12.5, color: '#334155', borderTop: '1px solid #f1f5f9' };
          return (
            <div className="card" style={{ padding: 16, marginBottom: 18, border: `1.5px solid ${C.verde}` }}>
              <div style={{ fontSize: 13, fontWeight: 800, color: C.verde, marginBottom: 4 }}>
                <i className="bi bi-diagram-3" style={{ marginRight: 6 }} />Acompanhamento de Fabricação — Flanges
                <span style={{ fontWeight: 500, color: '#94a3b8', fontSize: 11.5, marginLeft: 8 }}>
                  da emissão ao acabamento · ao vivo, anda com os pedidos
                </span>
              </div>

              {/* Funil — barra segmentada proporcional às unidades */}
              <div style={{ marginTop: 12, marginBottom: 6 }}>
                <div style={{ display: 'flex', width: '100%', height: 30, borderRadius: 8, overflow: 'hidden', border: '1px solid #e2e8f0' }}>
                  {segs.map(s => {
                    const w = (s.v.un / total) * 100;
                    if (w <= 0) return null;
                    return (
                      <div key={s.k} title={`${s.label}: ${fmt(s.v.un)} un`}
                        style={{ width: `${w}%`, background: s.cor, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 11, fontWeight: 800, minWidth: 0 }}>
                        {w >= 8 ? fmt(s.v.un) : ''}
                      </div>
                    );
                  })}
                </div>
                {/* Legenda / contagem */}
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14, marginTop: 8 }}>
                  {segs.map(s => (
                    <div key={s.k} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
                      <span style={{ width: 11, height: 11, borderRadius: 3, background: s.cor, display: 'inline-block' }} />
                      <span style={{ color: '#475569' }}>{s.label}</span>
                      <b style={{ color: '#0f172a' }}>{fmt(s.v.un)} peças</b>
                    </div>
                  ))}
                </div>
              </div>

              {/* Destaque: fabricadas paradas esperando despacho */}
              {F.pronto.un > 0 && (
                <div style={{ marginTop: 10, fontSize: 11.5, color: '#065f46', background: '#ecfdf5', border: '1px solid #a7f3d0', borderRadius: 8, padding: '7px 10px' }}>
                  <i className="bi bi-box-seam" style={{ marginRight: 6 }} />
                  <b>{fmt(F.pronto.un)} peças</b> já fabricadas aguardando verificação do PCP / despacho pela logística.
                </div>
              )}

              {/* Meta do mês */}
              <div style={{ marginTop: 14 }}>
                <div style={{ fontSize: 11, fontWeight: 800, color: C.cinza, marginBottom: 6 }}>
                  Meta do mês <span style={{ fontWeight: 400, color: '#94a3b8' }}>({mesLabel(M.mes_atual)} · fabricado = passou do acabamento)</span>
                </div>
                {meta && meta > 0 ? (
                  <>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
                      {tile('Fabricado no mês', `${fmt(M.fabricado_mes_atual_un)} un`, C.verde, `meta ${fmt(meta)} un`)}
                      {tile('Faltam', `${fmt(M.faltam_un)} un`, M.faltam_un && M.faltam_un > 0 ? C.laranja : C.verde, 'para bater a meta')}
                      {tile('Ritmo real', `${fmt(M.ritmo_real_dia, 1)} un/dia`, C.azul2, `necessário ${fmt(M.ritmo_necessario_dia, 1)} un/dia`)}
                      {tile('Projeção fim do mês', `${fmt(M.projetado_fim_mes)} un`, M.risco ? C.vermelho : C.verde, M.risco ? '⚠ risco de não bater' : '✓ no rumo da meta')}
                    </div>
                    {/* Barra de progresso da meta + marcador de ritmo esperado */}
                    <div style={{ position: 'relative', width: '100%', height: 22, background: '#f1f5f9', borderRadius: 8, overflow: 'hidden', border: '1px solid #e2e8f0' }}>
                      <div style={{ width: `${pctMeta}%`, height: '100%', background: M.risco ? C.laranja : C.verde, transition: 'width .3s' }} />
                      {/* marcador de onde "deveríamos estar" hoje */}
                      <div title={`ritmo esperado até hoje (${fmt(pctRitmo, 0)}%)`}
                        style={{ position: 'absolute', top: -2, bottom: -2, left: `${pctRitmo}%`, width: 2, background: C.azul, opacity: .7 }} />
                      <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 800, color: '#0f172a' }}>
                        {fmt(pctMeta, 0)}% da meta
                      </div>
                    </div>
                    <div style={{ fontSize: 10.5, color: '#94a3b8', marginTop: 4 }}>
                      A linha azul marca onde a produção deveria estar hoje ({fmt(pctRitmo, 0)}% do mês) — barra à esquerda dela = atrasado.
                    </div>
                  </>
                ) : (
                  <div style={{ fontSize: 11.5, color: '#475569', background: '#f1f5f9', border: '1px solid #e2e8f0', borderRadius: 8, padding: '7px 10px' }}>
                    <i className="bi bi-info-circle" style={{ marginRight: 6 }} />
                    Sem meta cadastrada — o funil acima já funciona sozinho. Defina a <b>meta mensal</b> em Parâmetros pra ver progresso, ritmo e projeção.{' '}
                    <button onClick={() => setParamsAberto(true)} style={{ border: 'none', background: 'none', color: C.azul2, fontWeight: 700, cursor: 'pointer', textDecoration: 'underline', padding: 0 }}>Cadastrar agora ↓</button>
                  </div>
                )}
              </div>

              {/* Fabricado por mês */}
              {fab.fabricado_mes.length > 0 && (
                <div style={{ marginTop: 14, maxWidth: 420 }}>
                  <div style={{ fontSize: 11, fontWeight: 800, color: C.cinza, marginBottom: 4 }}>Fabricado por mês <span style={{ fontWeight: 400, color: '#94a3b8' }}>(peças que passaram do acabamento)</span></div>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead><tr><th style={th}>Mês</th><th style={{ ...th, textAlign: 'right' }}>Peças</th></tr></thead>
                    <tbody>
                      {fab.fabricado_mes.slice(-8).map(m => (
                        <tr key={m.mes}>
                          <td style={td}>{mesLabel(m.mes)}</td>
                          <td style={{ ...td, textAlign: 'right', fontWeight: 700, color: C.verde }}>{fmt(m.un)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          );
        })()}

        {/* ── Parâmetros: capacidade por máquina + meta de demanda ──────────── */}
        {params && (() => {
          const th = { textAlign: 'left' as const, padding: '5px 8px', fontSize: 10.5, color: '#94a3b8', textTransform: 'uppercase' as const, fontWeight: 700 };
          const td = { padding: '5px 8px', fontSize: 13, color: '#334155', borderTop: '1px solid #f1f5f9' };
          const inp = { border: '1.5px solid #e2e8f0', borderRadius: 6, padding: '4px 6px', fontSize: 13, textAlign: 'center' as const };
          const sub = { fontSize: 10, fontWeight: 500 as const, color: '#94a3b8', textTransform: 'none' as const, marginTop: 2, letterSpacing: 0 };
          return (
            <div className="card no-print" style={{ padding: 0, marginBottom: 18, overflow: 'hidden' }}>
              <button onClick={() => setParamsAberto(v => !v)}
                style={{ width: '100%', textAlign: 'left', border: 'none', background: '#f8fafc', padding: '12px 16px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 13, fontWeight: 800, color: C.azul }}>
                  <i className="bi bi-sliders" style={{ marginRight: 6 }} />Parâmetros — capacidade por máquina e demanda
                  {!meStaff && <span style={{ fontWeight: 500, color: '#94a3b8', fontSize: 11, marginLeft: 8 }}>(só leitura)</span>}
                </span>
                <i className={`bi ${paramsAberto ? 'bi-chevron-up' : 'bi-chevron-down'}`} style={{ color: C.cinza }} />
              </button>
              {paramsAberto && (
                <div style={{ padding: 16 }}>
                  {/* Explicação em linguagem simples — pra qualquer pessoa entender o card. */}
                  <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 10, padding: '12px 14px', marginBottom: 14, fontSize: 12.5, color: '#1e3a8a', lineHeight: 1.5 }}>
                    <div style={{ fontWeight: 800, marginBottom: 4 }}><i className="bi bi-info-circle" style={{ marginRight: 6 }} />Pra que serve este quadro</div>
                    Você preenche só <b>duas coisas por máquina</b>: <b>quantas horas ela roda por dia</b> e <b>quantos dias por semana</b>.
                    Com isso o sistema calcula sozinho a <b>capacidade semanal</b> de cada uma e, junto com a <b>meta de peças do mês</b>, mostra a utilização, o saldo e o risco de atraso.
                    <div style={{ marginTop: 6, fontSize: 11.5, color: '#3b5bdb' }}>
                      <span style={{ background: '#dbeafe', borderRadius: 4, padding: '1px 6px', fontWeight: 700 }}>✎ você preenche</span>
                      <span style={{ margin: '0 6px' }}>•</span>
                      <span style={{ background: '#f1f5f9', borderRadius: 4, padding: '1px 6px', fontWeight: 700, color: '#64748b' }}>🔒 calculado automaticamente</span>
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 14 }}>
                    <label style={{ fontSize: 12.5, fontWeight: 700, color: C.cinza }}>
                      Meta do mês <span style={{ background: '#dbeafe', color: '#3b5bdb', borderRadius: 4, padding: '1px 6px', fontSize: 10.5, fontWeight: 700, marginLeft: 4 }}>✎ você preenche</span>
                    </label>
                    <input type="number" min={0} value={params.meta} disabled={!meStaff}
                      onChange={e => setParams(p => p ? { ...p, meta: e.target.value } : p)} placeholder="ex.: 1200"
                      style={{ ...inp, width: 140, textAlign: 'left' }} />
                    <span style={{ fontSize: 11.5, color: '#94a3b8' }}>quantas peças precisam sair por mês</span>
                  </div>
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 560 }}>
                      <thead><tr>
                        <th style={th}>Máquina<div style={sub}>equipamento</div></th>
                        <th style={{ ...th, textAlign: 'center' }}>Horas/dia<div style={{ ...sub, color: '#3b5bdb' }}>✎ você preenche</div></th>
                        <th style={{ ...th, textAlign: 'center' }}>Dias/semana<div style={{ ...sub, color: '#3b5bdb' }}>✎ você preenche</div></th>
                        <th style={{ ...th, textAlign: 'center' }}>Cap. semanal<div style={sub}>🔒 horas × dias</div></th>
                        <th style={{ ...th, textAlign: 'right' }} />
                      </tr></thead>
                      <tbody>
                        {params.maquinas.map(m => {
                          const capSem = Number(m.horas_dia) * Number(m.dias_semana);
                          return (
                          <tr key={m.maquina}>
                            <td style={td}>{m.maquina}{!m.usada && <span style={{ fontSize: 10, color: '#94a3b8', marginLeft: 6 }}>(sem apontamento)</span>}</td>
                            <td style={{ ...td, textAlign: 'center' }}>
                              <input type="number" min={0} max={24} step={0.5} value={m.horas_dia} disabled={!meStaff}
                                onChange={e => setParamMaq(m.maquina, 'horas_dia', e.target.value)} style={{ ...inp, width: 72 }} />
                            </td>
                            <td style={{ ...td, textAlign: 'center' }}>
                              <input type="number" min={0} max={7} value={m.dias_semana} disabled={!meStaff}
                                onChange={e => setParamMaq(m.maquina, 'dias_semana', e.target.value)} style={{ ...inp, width: 62 }} />
                            </td>
                            <td style={{ ...td, textAlign: 'center' }}>
                              <span style={{ color: '#cbd5e1', fontSize: 11.5 }}>{fmt(Number(m.horas_dia), 0)} × {fmt(Number(m.dias_semana), 0)} = </span>
                              <b style={{ color: C.azul }}>{fmt(capSem, 0)} h/sem</b>
                            </td>
                            <td style={{ ...td, textAlign: 'right' }}>{m.cadastrada ? <span style={{ fontSize: 10.5, color: C.verde }}>✓ cadastrada</span> : <span style={{ fontSize: 10.5, color: '#cbd5e1' }}>padrão 8h/5d</span>}</td>
                          </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                  <div style={{ fontSize: 11.5, color: '#94a3b8', marginTop: 8, lineHeight: 1.5 }}>
                    <b>Cap. semanal</b> = Horas/dia × Dias/semana — é quanto a máquina pode rodar por semana. Quem nunca foi ajustada usa o padrão de <b>8h/dia · 5 dias</b> (40 h/sem).
                  </div>
                  {meStaff && (
                    <div style={{ marginTop: 14, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                      <button onClick={salvarParams} disabled={savingParams}
                        style={{ background: C.azul, color: '#fff', border: 'none', borderRadius: 8, padding: '8px 18px', fontSize: 13, fontWeight: 700, cursor: 'pointer', opacity: savingParams ? 0.6 : 1 }}>
                        {savingParams ? 'Salvando…' : 'Salvar parâmetros'}
                      </button>
                      <span style={{ fontSize: 11.5, color: '#94a3b8' }}>ao salvar, o diagnóstico recalcula utilização, saldo e risco.</span>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })()}

        {/* Abas */}
        <div className="no-print" style={{ display: 'flex', gap: 8, marginBottom: 18, borderBottom: '1.5px solid #e2e8f0', paddingBottom: 2 }}>
          {([
            { id: 'geral' as const, icon: 'bi-speedometer2', label: 'Geral' },
            { id: 'homem' as const, icon: 'bi-people', label: 'Produção Homem' },
            { id: 'maquina' as const, icon: 'bi-gear-wide-connected', label: 'Produção Máquina' },
            { id: 'catalogo' as const, icon: 'bi-collection', label: 'Catálogo de Flanges' },
          ]).map(t => (
            <button key={t.id} onClick={() => setAba(t.id)}
              style={{
                border: 'none', background: 'none', cursor: 'pointer', padding: '8px 4px', marginBottom: -2,
                fontSize: 13.5, fontWeight: 700, color: aba === t.id ? C.azul : '#94a3b8',
                borderBottom: aba === t.id ? `2.5px solid ${C.azul}` : '2.5px solid transparent',
              }}>
              <i className={`bi ${t.icon}`} style={{ marginRight: 6 }} />{t.label}
            </button>
          ))}
        </div>

        {/* Filtros */}
        <div className="card no-print" style={{ padding: 16, marginBottom: 20 }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', marginBottom: 12 }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 1, marginRight: 4 }}>Atalhos</span>
            <button className="abtn" onClick={() => atalhoSemana(0)}>Esta semana</button>
            <button className="abtn" onClick={() => atalhoSemana(1)}>Semana passada</button>
            <button className="abtn" onClick={atalhoUlt4}>Últimas 4 semanas</button>
            <button className="abtn" onClick={atalhoMes}>Este mês</button>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'flex-end', marginBottom: 12 }}>
            <div>
              <label style={{ fontSize: 11, fontWeight: 700, color: '#64748b', display: 'block', marginBottom: 4 }}>De</label>
              <input type="date" value={de} onChange={e => setDe(e.target.value)} style={inp} />
            </div>
            <div>
              <label style={{ fontSize: 11, fontWeight: 700, color: '#64748b', display: 'block', marginBottom: 4 }}>Até</label>
              <input type="date" value={ate} onChange={e => setAte(e.target.value)} style={inp} />
            </div>
            <button className="abtn" style={{ background: C.azul, color: '#fff', borderColor: C.azul, padding: '9px 18px' }}
              onClick={() => carregar(de, ate, setores)}>
              <i className="bi bi-arrow-repeat" style={{ marginRight: 6 }} />Atualizar
            </button>
          </div>
        </div>

        {loading && <div style={{ textAlign: 'center', padding: 40, color: C.cinza }}><i className="bi bi-hourglass-split" style={{ fontSize: 24 }} /><p>Calculando indicadores…</p></div>}
        {erro && <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 10, padding: 14, color: C.vermelho }}><i className="bi bi-x-circle-fill" style={{ marginRight: 8 }} />{erro}</div>}

        {dados && !loading && (<>
          {aba === 'geral' && (<>
          {/* 3 Etapas */}
          <SectionTitle icon="bi-signpost-split" t="Situação dos materiais (agora)" s="Nível pedido — mesma contagem do painel" />
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12, marginBottom: 8 }}>
            <Etapa n="Etapa 1" nome="A Produzir" v={et.a_produzir} d="na Emissão, aguardando início" cor={C.cinza} />
            <Etapa n="Etapa 2" nome="Produzindo" v={et.produzindo} d="em trabalho nos setores" cor={C.azul2} />
            <Etapa n="Etapa 3" nome="Entregue" v={et.entregue} d="materiais entregues ao cliente" cor={C.verde} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: 10, marginBottom: 24 }}>
            <Kpi v={fmt(et.atrasados)} l="materiais atrasados" cor={C.vermelho} />
            <Kpi v={fmt(vol.pecas)} l="peças que entraram no período" cor={C.azul} />
          </div>

          {/* Produção semanal */}
          <SectionTitle icon="bi-bar-chart-line" t="Produção por semana" />
          <div className="card" style={{ padding: 18, marginBottom: 24 }}>
            {/* Legenda: o que é cada número */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 18px', marginBottom: 16, fontSize: 12, color: '#64748b' }}>
              <span><b style={{ color: C.azul2 }}>Número de cima</b> = peças finalizadas na semana <i>(chegaram na Logística — produção concluída)</i></span>
              <span><b style={{ color: '#94a3b8' }}>Número de baixo</b> = peças criadas na semana <i>(entrada de novos pedidos)</i></span>
            </div>
            {semanas.length === 0 ? <Vazio /> : (
              <div style={{ display: 'flex', alignItems: 'flex-end', gap: 10, height: 180, paddingTop: 10 }}>
                {semanas.map(s => (
                  <div key={s.semana} style={{ flex: 1, textAlign: 'center' }}>
                    <div style={{ fontSize: 13, fontWeight: 800, color: C.azul }}>{fmt(s.final)}</div>
                    <div style={{ background: s.final === picoFinal ? C.azul2 : '#93b4d6', borderRadius: '4px 4px 0 0', height: `${(s.final / picoFinal) * 120}px`, minHeight: 2 }} />
                    <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 4 }}>{labelSemana(s.semana)}</div>
                    <div style={{ fontSize: 12, fontWeight: 700, color: '#94a3b8' }}>{fmt(s.criados)}</div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Throughput + tempo por etapa */}
          <SectionTitle icon="bi-speedometer" t="Desempenho por setor" s="Peças finalizadas em cada setor, e quanto tempo a peça leva ali" />
          <div className="card" style={{ padding: 0, marginBottom: 24, overflowX: 'auto' }}>
            <table style={tbl}>
              <thead><tr>
                {['Setor', 'Peças finalizadas', 'Etapas concluídas', 'Tempo médio (h)', 'Espera p/ iniciar (h)', 'Em pausa (h)'].map(h =>
                  <th key={h} style={th}>{h}</th>)}
              </tr></thead>
              <tbody>
                {ordenarSetores(dados).map(r => (
                  <tr key={r.setor}>
                    <td style={{ ...td, fontWeight: 700 }}>{nm(r.setor)}</td>
                    <td style={{ ...tdR, fontWeight: 700, color: C.azul }}>{fmt(r.pecas)}</td>
                    <td style={tdR}>{fmt(r.finalizacoes)}</td>
                    <td style={tdR}>{fmt(r.media_h, 0)}</td>
                    <td style={tdR}>{fmt(r.espera_h, 0)}</td>
                    <td style={{ ...tdR, color: Number(r.parada_h) > 10 ? C.laranja : undefined, fontWeight: Number(r.parada_h) > 10 ? 700 : 400 }}>{fmt(r.parada_h, 0)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Gargalos: WIP + ordens paradas */}
          <SectionTitle icon="bi-exclamation-diamond" t="Gargalos e filas" s="Peças paradas agora e ordens presas há mais tempo" />
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(320px,1fr))', gap: 16, marginBottom: 24 }}>
            <div className="card" style={{ padding: 16 }}>
              <p style={cardTitle}>Peças paradas por setor</p>
              {barras(dados.wip.map(w => ({ label: nm(w.setor), value: Number(w.pecas), hi: ['plasma', 'quarentena', 'usinagem'].includes(w.setor), key: w.setor })), '#1d4ed8',
                d => abrirDetalhe('wip', d.key || '', `Peças paradas em ${d.label}`))}
            </div>
            <div className="card" style={{ padding: 0, overflowX: 'auto' }}>
              <p style={{ ...cardTitle, padding: '16px 16px 0' }}>Ordens paradas há mais tempo</p>
              <table style={tbl}><thead><tr>{['PV', 'Código', 'Setor', 'Dias'].map(h => <th key={h} style={th}>{h}</th>)}</tr></thead>
                <tbody>{dados.top_paradas.slice(0, 8).map((r, i) => (
                  <tr key={i}><td style={td}>{r.pv}</td><td style={td}>{r.codigo}</td><td style={td}>{nm(r.setor)}</td>
                    <td style={{ ...tdR, color: C.vermelho, fontWeight: 700 }}>{fmt(r.dias, 0)}</td></tr>
                ))}</tbody></table>
            </div>
          </div>

          {/* Atrasos + Mix */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(320px,1fr))', gap: 16, marginBottom: 24 }}>
            <div className="card" style={{ padding: 16 }}>
              <p style={cardTitle}>Materiais atrasados por setor onde estão</p>
              {dados.atraso_setor.length === 0 ? <Vazio /> :
                barras(dados.atraso_setor.slice(0, 8).map(a => ({ label: nm(a.setor), value: Number(a.pedidos), hi: false, key: a.setor })), C.vermelho,
                  d => abrirDetalhe('atraso', d.key || '', `Materiais atrasados em ${d.label}`))}
            </div>
            <div className="card" style={{ padding: 16 }}>
              <p style={cardTitle}>Mix — peças por tipo de flange</p>
              {dados.mix_tipo.length === 0 ? <Vazio /> :
                barras(dados.mix_tipo.slice(0, 8).map(m => ({ label: m.tipo, value: Number(m.pecas), hi: false, key: m.tipo })), C.azul,
                  d => abrirDetalhe('mix', d.key || '', `Produtos do tipo "${d.label}"`))}
            </div>
          </div>

          {/* Lead time */}
          <SectionTitle icon="bi-hourglass-split" t="Lead time de entrega" s="Tempo até entrega, do período selecionado" />
          <div className="card" style={{ padding: 18, marginBottom: 24, maxWidth: 480 }}>
            <p style={cardTitle}>Lead time das entregas no período</p>
            {lead.n && Number(lead.n) > 0 ? (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 10 }}>
                <MiniKpi v={`${fmt(lead.mediana_dias, 0)} d`} l="mediana" />
                <MiniKpi v={`${fmt(lead.media_dias, 0)} d`} l="média" />
                <MiniKpi v={`${fmt(lead.min_dias, 0)} d`} l="mais rápido" />
                <MiniKpi v={`${fmt(lead.max_dias, 0)} d`} l="mais lento" />
              </div>
            ) : <Vazio />}
            <p style={{ fontSize: 11, color: '#94a3b8', marginTop: 10, marginBottom: 0 }}>Base: {fmt(lead.n)} entregas no período (da 1ª etapa à entrega).</p>
          </div>
          </>)}

          {aba === 'homem' && (<>
          {/* Apontamento por líder */}
          <SectionTitle icon="bi-people" t="Apontamento por líder" s="Atividade de registro por setor, no período selecionado" />
          <div className="card" style={{ padding: 0, overflowX: 'auto', marginBottom: 24 }}>
            <table style={tbl}><thead><tr>{['Líder', 'Setor', 'Etapas', 'Inícios', 'Total'].map(h => <th key={h} style={th}>{h}</th>)}</tr></thead>
              <tbody>{dados.lideres.slice(0, 10).map((l, i) => (
                <tr key={i}><td style={{ ...td, fontWeight: 700 }}>{l.nome || '—'}</td><td style={{ ...td, color: '#334155' }}>{nm(l.setor)}</td>
                  <td style={{ ...tdR, color: '#334155', fontWeight: 400 }}>{fmt(l.finalizacoes)}</td>
                  <td style={{ ...tdR, color: '#334155', fontWeight: 400 }}>{fmt(l.inicios)}</td>
                  <td style={{ ...tdR, color: '#334155', fontWeight: 400 }}>{fmt(l.total_mov)}</td></tr>
              ))}</tbody></table>
          </div>
          </>)}

          {aba === 'maquina' && (<>
          {/* Catálogo de máquinas com foto */}
          <SectionTitle icon="bi-images" t="Máquinas" s="Usinagem/Furação — clique na máquina para ver o resumo de produção" />
          <div className="card" style={{ marginBottom: 24 }}>
            {[...(MAQUINAS_POR_SETOR.usinagem || []), ...(MAQUINAS_POR_SETOR.furacao || [])]
              .map((grupo) => ({ categoria: grupo.categoria, comFoto: grupo.maquinas.filter((n) => fotoMaquina(n)) }))
              .filter((grupo) => grupo.comFoto.length > 0)
              .map((grupo) => (
              <div key={grupo.categoria} style={{ marginBottom: 22 }}>
                <div style={cardTitle}>{grupo.categoria}</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, 168px)', gap: 14, justifyContent: 'start' }}>
                  {grupo.comFoto.map((nome) => {
                    const src = fotoMaquina(nome);
                    return (
                      <div key={nome} onClick={() => setMaquinaSel(nome)} title={`Ver resumo de produção · ${nome}`}
                        style={{ width: 168, border: '1px solid #e2e8f0', borderRadius: 10, overflow: 'hidden', background: '#fff', cursor: 'pointer' }}>
                        {src ? (
                          <img src={src} alt={nome} loading="lazy"
                            style={{ width: '100%', height: 116, objectFit: 'cover', display: 'block' }} />
                        ) : (
                          <div style={{ width: '100%', height: 116, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f1f5f9', color: '#cbd5e1' }}>
                            <i className="bi bi-camera" style={{ fontSize: 26 }} />
                          </div>
                        )}
                        <div style={{ padding: '8px 10px', fontSize: 12, fontWeight: 700, color: '#334155', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={nome}>{nome}</div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
          {/* Apontamento por máquina */}
          <SectionTitle icon="bi-gear-wide-connected" t="Apontamento por máquina" s="Usinagem/Furação — início e peças por máquina/operador, no período selecionado" />
          <div className="card" style={{ padding: 0, overflowX: 'auto', marginBottom: 24 }}>
            {(dados.maquinas || []).length === 0 ? <div style={{ padding: 16 }}><Vazio /></div> : (() => {
              const totalPecas = dados.maquinas.reduce((s, mq) => s + Number(mq.pecas || 0), 0);
              const totalSegundos = dados.maquinas.reduce((s, mq) => s + Number(mq.segundos || 0), 0);
              return (
                <table style={tbl}><thead><tr>{['Máquina', 'Operador', 'Setor', 'Inícios', 'Peças', 'Tempo total', 'Tempo médio/peça'].map(h => <th key={h} style={th}>{h}</th>)}</tr></thead>
                  <tbody>
                    {dados.maquinas.map((mq, i) => {
                      const src = fotoMaquina(mq.maquina);
                      return (
                      <tr key={i}><td style={{ ...td, fontWeight: 700 }}>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                          {src && <img src={src} alt={mq.maquina} loading="lazy" onClick={() => setMaquinaSel(mq.maquina)}
                            style={{ width: 40, height: 30, objectFit: 'cover', borderRadius: 5, cursor: 'pointer', flexShrink: 0 }} />}
                          {mq.maquina || '—'}
                        </span>
                      </td><td style={td}>{mq.operador || '—'}</td><td style={td}>{nm(mq.setor)}</td>
                        <td style={tdR}>{fmt(mq.inicios)}</td>
                        <td style={{ ...tdR, fontWeight: 700, color: C.azul }}>{fmt(mq.pecas)} {mq.unidade || 'un'}</td>
                        <td style={tdR}>{fmtHorasMin(mq.segundos)}</td>
                        <td style={tdR}>{Number(mq.pecas) > 0 ? fmtHorasMin(Number(mq.segundos) / Number(mq.pecas)) : '—'}</td></tr>
                    );})}
                    <tr>
                      <td style={{ ...td, fontWeight: 800, color: C.azul }} colSpan={4}>Total</td>
                      <td style={{ ...tdR, fontWeight: 800, color: C.azul }}>{fmt(totalPecas)}</td>
                      <td style={{ ...tdR, fontWeight: 800, color: C.azul }}>{fmtHorasMin(totalSegundos)}</td>
                      <td style={{ ...tdR, fontWeight: 800, color: C.azul }}>{totalPecas > 0 ? fmtHorasMin(totalSegundos / totalPecas) : '—'}</td>
                    </tr>
                  </tbody>
                </table>
              );
            })()}
          </div>
          </>)}

          {aba === 'catalogo' && (<>
          {/* Catálogo de Flanges — histórico por código + tempo de produção */}
          <SectionTitle icon="bi-collection" t="Catálogo de Flanges" s="Todo o histórico — cada flange, quanto já foi produzido e o tempo de produção medido (para priorização)" />
          <div className="card" style={{ padding: 0, marginBottom: 20, maxHeight: 560, overflow: 'auto' }}>
            {(dados.catalogo_flanges || []).length === 0 ? <Vazio /> : (
              <table style={tbl}>
                <thead><tr>{['Código', 'Produto', 'Pedidos', 'Peças', 'Tempo total (máq.)', 'Tempo médio/peça'].map(h => <th key={h} style={th}>{h}</th>)}</tr></thead>
                <tbody>
                  {dados.catalogo_flanges!.map((p, i) => (
                    <tr key={i}>
                      <td style={{ ...td, whiteSpace: 'nowrap' }}><code>{p.codigo}</code></td>
                      <td style={td}>{p.descricao}</td>
                      <td style={tdR}>{fmt(p.pedidos)}</td>
                      <td style={{ ...tdR, fontWeight: 700, color: C.azul }}>{fmt(p.pecas)}</td>
                      <td style={tdR}>{p.segundos_producao > 0 ? fmtHorasMin(p.segundos_producao) : '—'}</td>
                      <td style={{ ...tdR, fontWeight: 700, color: p.seg_por_peca > 0 ? C.roxo : '#94a3b8' }}>{p.seg_por_peca > 0 ? fmtHorasMin(p.seg_por_peca) : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
          <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 10, padding: '12px 16px', fontSize: 12, color: '#64748b', marginBottom: 40 }}>
            <b>Como usar:</b> o tempo vem das sessões de máquina (Usinagem/Furação) já registradas — flanges sem produção medida aparecem com &ldquo;—&rdquo;. Ordenado por peças produzidas. Ajuda a gerência a ver qual flange dá mais trabalho por peça e priorizar a programação (junto com a previsão do Gilmar).
          </div>
          </>)}

          {aba === 'geral' && (<>
          {/* Projeção de produção */}
          <SectionTitle icon="bi-graph-up" t="Projeção de produção" s="Ritmo real médio do período, projetado adiante — capacidade observada, não teórica" />
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(170px,1fr))', gap: 12, marginBottom: 12 }}>
            <Kpi v={`~${fmt(capSemana)}`} l="peças finalizadas / semana (média)" cor={C.verde} />
            <Kpi v={`~${fmt(capMes)}`} l="projeção de peças / mês (ritmo atual)" cor={C.verde} />
            <Kpi v={`~${fmt(demSemana)}`} l="peças que entram / semana (demanda)" cor={C.azul} />
            <Kpi v={`${saldoSemana > 0 ? '▲' : '▼'} ${fmt(Math.abs(saldoSemana))}`} l={saldoSemana > 0 ? 'entra mais do que sai (fila cresce)' : 'sai mais do que entra (fila cai)'} cor={saldoSemana > 0 ? C.vermelho : C.verde} />
          </div>
          <div style={{ background: '#eff6ff', border: '1px solid #dbeafe', borderLeft: `3px solid ${C.azul}`, borderRadius: 10, padding: '12px 16px', fontSize: 12.5, color: '#334155', marginBottom: 28 }}>
            No ritmo médio do período, a fábrica finaliza <b>~{fmt(capSemana)} peças/semana</b> (~{fmt(capMes)}/mês). {saldoSemana > 0
              ? <>Como entram <b>~{fmt(demSemana)} peças/semana</b>, está <b>entrando mais do que saindo</b> (~{fmt(saldoSemana)}/semana) — a fila tende a crescer se o ritmo não subir.</>
              : <>Como entram <b>~{fmt(demSemana)} peças/semana</b>, a saída está acompanhando a demanda.</>} É uma projeção do ritmo observado, não uma previsão estatística — muda conforme o período escolhido nos filtros.
          </div>

          {/* Produtos cadastrados */}
          <SectionTitle icon="bi-box-seam" t="Produtos cadastrados" s="Todo o histórico — por nº de pedidos e de peças (clique no cabeçalho não ordena; já vem por peças)" />
          <div className="card" style={{ padding: 0, marginBottom: 28, maxHeight: 440, overflow: 'auto' }}>
            {(dados.produtos || []).length === 0 ? <Vazio /> : (
              <table style={tbl}>
                <thead><tr>{['Código', 'Produto', 'Pedidos', 'Peças'].map(h => <th key={h} style={th}>{h}</th>)}</tr></thead>
                <tbody>
                  {dados.produtos.map((p, i) => (
                    <tr key={i}>
                      <td style={{ ...td, whiteSpace: 'nowrap' }}><code>{p.codigo}</code></td>
                      <td style={td}>{p.descricao}</td>
                      <td style={tdR}>{fmt(p.pedidos)}</td>
                      <td style={{ ...tdR, fontWeight: 700, color: C.azul }}>{fmt(p.pecas)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 10, padding: '12px 16px', fontSize: 12, color: '#64748b', marginBottom: 40 }}>
            <b>Notas:</b> "Situação dos materiais" é a foto de agora (não muda com o período). Tempos são corridos (incluem noite/fim de semana). "Apontamento por líder" (aba Produção Homem) reflete quem registra a produção, não a produção individual. Capacidade teórica/OEE precisa de tempo-padrão de engenharia — ainda não coletado.
          </div>
          </>)}
        </>)}

        {/* Fechamento semanal — histórico automático */}
        {aba === 'geral' && (<><div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginTop: 8 }}>
          <SectionTitle icon="bi-calendar-week" t="Fechamento semanal (histórico)" s="Cada semana fechada é gravada automaticamente ao abrir esta tela" />
          {admin && <button className="abtn no-print" disabled={genLoad} onClick={gerarFechamentos}>
            <i className={`bi ${genLoad ? 'bi-hourglass-split' : 'bi-arrow-repeat'}`} style={{ marginRight: 6 }} />{genLoad ? 'Gerando…' : 'Gerar agora'}
          </button>}
        </div>
        <div className="card" style={{ padding: 0, overflowX: 'auto', marginBottom: 40 }}>
          {fechamentos.length === 0 ? <Vazio /> : (
            <table style={tbl}>
              <thead><tr>{['Semana', 'Pedidos', 'Peças criadas', 'Finalizados (logística)', 'Lead mediano'].map(h => <th key={h} style={th}>{h}</th>)}</tr></thead>
              <tbody>
                {fechamentos.map((f, i) => (
                  <tr key={i}>
                    <td style={{ ...td, fontWeight: 700 }}>{labelSemana(String(f.semana).slice(0, 10))}</td>
                    <td style={tdR}>{fmt(f.pedidos)}</td>
                    <td style={tdR}>{fmt(f.pecas_criadas)}</td>
                    <td style={tdR}>{fmt(f.finalizacoes)}</td>
                    <td style={tdR}>{f.lead_mediana ? `${fmt(f.lead_mediana, 0)} d` : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        </>)}

        {/* Modal de detalhe — pedidos e produtos por trás de um número */}
        {detalhe && (
          <div onClick={() => setDetalhe(null)} className="no-print"
            style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,.55)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
            <div onClick={e => e.stopPropagation()} className="card" style={{ maxWidth: 820, width: '100%', maxHeight: '85vh', overflow: 'auto', padding: 0 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '15px 20px', borderBottom: '1px solid #e2e8f0', position: 'sticky', top: 0, background: '#fff', zIndex: 1 }}>
                <div>
                  <b style={{ fontSize: 16, color: '#1a3a5c' }}>{detalhe.titulo}</b>
                  {!detalhe.loading && <span style={{ marginLeft: 8, color: '#94a3b8', fontSize: 13 }}>{detalhe.itens.length} {detalhe.itens.length === 1 ? 'registro' : 'registros'}</span>}
                </div>
                <button onClick={() => setDetalhe(null)} className="abtn"><i className="bi bi-x-lg" /></button>
              </div>
              {detalhe.loading ? <div style={{ padding: 30, textAlign: 'center', color: C.cinza }}><i className="bi bi-hourglass-split" /> Carregando…</div>
                : detalhe.itens.length === 0 ? <Vazio />
                  : <table style={tbl}>
                    <thead><tr>{['PV', 'Cliente', 'Código', 'Produto', 'Qtd'].map(h => <th key={h} style={th}>{h}</th>)}</tr></thead>
                    <tbody>{detalhe.itens.map((it, i) => (
                      <tr key={i}>
                        <td style={td}><code>{it.pv}</code></td>
                        <td style={td}>{it.cliente || '—'}</td>
                        <td style={td}>{it.codigo}</td>
                        <td style={td}>{it.descricao}</td>
                        <td style={tdR}>{fmt(it.quantidade)} {it.unidade || ''}</td>
                      </tr>
                    ))}</tbody>
                  </table>}
            </div>
          </div>
        )}
        {maquinaSel && (() => {
          const src = fotoMaquina(maquinaSel);
          const rows = (dados?.maquinas || []).filter(m => (m.maquina || '').trim() === maquinaSel);
          const totPecas = rows.reduce((s, m) => s + Number(m.pecas || 0), 0);
          const totSeg = rows.reduce((s, m) => s + Number(m.segundos || 0), 0);
          const totIni = rows.reduce((s, m) => s + Number(m.inicios || 0), 0);
          const unidade = rows[0]?.unidade || 'un';
          const setor = rows[0]?.setor;
          const detRows = maqDet?.rows || [];
          const detLoading = maqDet?.loading ?? true;
          const totPedidos = new Set(detRows.map(r => r.pv)).size;
          const medPeca = totPecas > 0 ? totSeg / totPecas : null;
          const medPedido = totPedidos > 0 ? totSeg / totPedidos : null;
          return (
            <div onClick={() => setMaquinaSel(null)} className="no-print"
              style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,.55)', zIndex: 1100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
              <div onClick={e => e.stopPropagation()} className="card" style={{ maxWidth: 620, width: '100%', maxHeight: '88vh', overflow: 'auto', padding: 0 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '15px 20px', borderBottom: '1px solid #e2e8f0', position: 'sticky', top: 0, background: '#fff', zIndex: 1 }}>
                  <div>
                    <b style={{ fontSize: 17, color: '#1a3a5c' }}><i className="bi bi-gear-wide-connected" style={{ marginRight: 8 }} />{maquinaSel}</b>
                    <div style={{ color: '#94a3b8', fontSize: 12, marginTop: 2 }}>Resumo de produção · {labelPeriodo(de, ate)}{setor ? ` · ${nm(setor)}` : ''}</div>
                  </div>
                  <button onClick={() => setMaquinaSel(null)} className="abtn"><i className="bi bi-x-lg" /></button>
                </div>
                {src && <img src={src} alt={maquinaSel} style={{ width: '100%', height: 220, objectFit: 'cover', display: 'block' }} />}
                <div style={{ padding: 18 }}>
                  {rows.length === 0 ? (
                    <p style={{ color: '#94a3b8', fontSize: 13, textAlign: 'center', margin: '8px 0' }}>Sem apontamento de produção nesta máquina no período selecionado.</p>
                  ) : (<>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 16 }}>
                      <MiniKpi v={`${fmt(totPecas)} ${unidade}`} l="Peças produzidas" />
                      <MiniKpi v={fmtHorasMin(totSeg)} l="Tempo total (ativo)" />
                      <MiniKpi v={fmt(totIni)} l="Inícios" />
                      <MiniKpi v={medPeca == null ? '—' : fmtHorasMin(medPeca)} l="Tempo médio/peça" />
                      <MiniKpi v={detLoading ? '…' : fmt(totPedidos)} l="Pedidos" />
                      <MiniKpi v={detLoading ? '…' : (medPedido == null ? '—' : fmtHorasMin(medPedido))} l="Tempo médio/pedido" />
                    </div>
                    <div style={cardTitle}>Por operador</div>
                    <table style={tbl}><thead><tr>{['Operador', 'Inícios', 'Peças', 'Tempo', 'Médio/peça'].map(h => <th key={h} style={th}>{h}</th>)}</tr></thead>
                      <tbody>{rows.map((m, i) => (
                        <tr key={i}>
                          <td style={{ ...td, fontWeight: 700 }}>{m.operador || '—'}</td>
                          <td style={tdR}>{fmt(m.inicios)}</td>
                          <td style={{ ...tdR, fontWeight: 700, color: C.azul }}>{fmt(m.pecas)} {m.unidade || 'un'}</td>
                          <td style={tdR}>{fmtHorasMin(m.segundos)}</td>
                          <td style={tdR}>{Number(m.pecas) > 0 ? fmtHorasMin(Number(m.segundos) / Number(m.pecas)) : '—'}</td>
                        </tr>
                      ))}</tbody>
                    </table>
                    <div style={{ ...cardTitle, marginTop: 18 }}>Por pedido / peça</div>
                    {detLoading ? (
                      <div style={{ padding: 16, textAlign: 'center', color: C.cinza, fontSize: 13 }}><i className="bi bi-hourglass-split" /> Carregando…</div>
                    ) : detRows.length === 0 ? (
                      <p style={{ color: '#94a3b8', fontSize: 13, textAlign: 'center', margin: '8px 0' }}>Sem peças no período.</p>
                    ) : (
                      <table style={tbl}><thead><tr>{['PV', 'Código', 'Qtd', 'Operador', 'Tempo', 'Médio/peça'].map(h => <th key={h} style={th}>{h}</th>)}</tr></thead>
                        <tbody>{detRows.map((r, i) => {
                          const seg = Number(r.segundos || 0); const qt = Number(r.quantidade || 0);
                          return (
                            <tr key={i}>
                              <td style={td}><code>{r.pv}</code>{String(r.em_andamento) === 'true' && <span title="Sessão ainda aberta — tempo contando ao vivo" style={{ marginLeft: 6, color: C.laranja, fontSize: 11, fontWeight: 700 }}>● em andamento</span>}</td>
                              <td style={td}>{r.codigo}</td>
                              <td style={tdR}>{fmt(r.quantidade)} {r.unidade || 'un'}</td>
                              <td style={td}>{r.operador || '—'}</td>
                              <td style={tdR}>{fmtHorasMin(seg)}</td>
                              <td style={tdR}>{qt > 0 ? fmtHorasMin(seg / qt) : '—'}</td>
                            </tr>
                          );
                        })}</tbody>
                      </table>
                    )}
                  </>)}
                </div>
              </div>
            </div>
          );
        })()}
      </div>
    </AuthGuard>
  );
}

// ── helpers de merge/ordenação ────────────────────────────────────────────────
function mergeSemanas(d: Dados | null) {
  if (!d) return [] as { semana: string; criados: number; final: number; concl: number }[];
  const map: Record<string, { semana: string; criados: number; final: number; concl: number }> = {};
  const get = (s: string) => (map[s] = map[s] || { semana: s, criados: 0, final: 0, concl: 0 });
  d.semanal.criados.forEach(r => { get(r.semana.slice(0, 10)).criados = Number(r.pecas); });
  d.semanal.final.forEach(r => { get(r.semana.slice(0, 10)).final = Number(r.pecas); });
  d.semanal.entregas.forEach(r => { get(r.semana.slice(0, 10)).concl = Number(r.concluidos); });
  return Object.values(map).sort((a, b) => a.semana.localeCompare(b.semana));
}
function ordenarSetores(d: Dados) {
  // junta throughput + tempo_etapa + wip por setor
  const map: Record<string, Rec & { setor: string }> = {};
  const g = (s: string) => (map[s] = map[s] || { setor: s });
  d.throughput.forEach(t => Object.assign(g(t.setor), { finalizacoes: String(t.finalizacoes), itens: String(t.itens), pecas: String(t.pecas) }));
  d.tempo_etapa.forEach(t => Object.assign(g(t.setor), { media_h: t.media_h, espera_h: t.espera_h, parada_h: t.parada_h }));
  d.wip.forEach(w => Object.assign(g(w.setor), { fila: w.itens, idade_max: w.idade_max }));
  return Object.values(map).filter(r => r.setor && r.setor !== '(nulo)')
    .sort((a, b) => Number(b.finalizacoes || 0) - Number(a.finalizacoes || 0));
}

// ── componentes ───────────────────────────────────────────────────────────────
function SectionTitle({ icon, t, s }: { icon: string; t: string; s?: string }) {
  return <div style={{ margin: '4px 0 12px' }}>
    <h5 style={{ margin: 0, fontWeight: 800, color: '#1a3a5c', fontSize: 16 }}><i className={`bi ${icon}`} style={{ marginRight: 8 }} />{t}</h5>
    {s && <small style={{ color: '#94a3b8' }}>{s}</small>}
  </div>;
}
function Etapa({ n, nome, v, d, cor }: { n: string; nome: string; v?: string; d: string; cor: string }) {
  return <div className="card" style={{ padding: '16px 18px', borderLeft: `5px solid ${cor}` }}>
    <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1, color: '#94a3b8', textTransform: 'uppercase' }}>{n}</div>
    <div style={{ fontSize: 15, fontWeight: 800, color: '#334155', margin: '2px 0 6px' }}>{nome}</div>
    <div style={{ fontSize: 40, fontWeight: 800, color: cor, lineHeight: 1 }}>{fmt(v)}</div>
    <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 8 }}>{d}</div>
  </div>;
}
function Kpi({ v, l, cor }: { v: string; l: string; cor: string }) {
  return <div className="card" style={{ padding: '14px 16px', borderTop: `3px solid ${cor}` }}>
    <div style={{ fontSize: 24, fontWeight: 800, color: cor, lineHeight: 1 }}>{v}</div>
    <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 4 }}>{l}</div>
  </div>;
}
function MiniKpi({ v, l }: { v: string; l: string }) {
  return <div style={{ background: '#f8fafc', borderRadius: 8, padding: '10px 12px' }}>
    <div style={{ fontSize: 20, fontWeight: 800, color: '#1a3a5c', lineHeight: 1 }}>{v}</div>
    <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 3 }}>{l}</div>
  </div>;
}
function Vazio() { return <p style={{ color: '#cbd5e1', fontSize: 13, textAlign: 'center', padding: 16, margin: 0 }}>Sem dados no período/setor.</p>; }
function barras(data: { label: string; value: number; hi: boolean; key?: string }[], cor = '#1d4ed8', onBar?: (d: { label: string; key?: string }) => void) {
  const mx = Math.max(1, ...data.map(d => d.value));
  return <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
    {data.map((d, i) => (
      <div key={i} onClick={onBar ? () => onBar(d) : undefined}
        style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: onBar ? 'pointer' : 'default', borderRadius: 4 }}
        title={onBar ? 'Ver pedidos e produtos' : undefined}>
        <div style={{ width: 110, fontSize: 12, color: onBar ? '#1d4ed8' : '#475569', fontWeight: onBar ? 600 : 400, textAlign: 'right', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{d.label}</div>
        <div style={{ flex: 1, background: '#f1f5f9', borderRadius: 4, height: 18 }}>
          <div style={{ width: `${(d.value / mx) * 100}%`, background: d.hi ? '#dc2626' : cor, height: 18, borderRadius: 4, minWidth: 2 }} />
        </div>
        <div style={{ width: 54, fontSize: 12, fontWeight: 700, color: '#334155', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{fmt(d.value)}</div>
      </div>
    ))}
  </div>;
}

const inp: React.CSSProperties = { border: '2px solid #e2e8f0', borderRadius: 8, padding: '8px 12px', fontSize: 14, fontWeight: 600, color: '#1a3a5c' };
const tbl: React.CSSProperties = { width: '100%', borderCollapse: 'collapse', fontSize: 13 };
const th: React.CSSProperties = { background: '#f8fafc', color: '#64748b', padding: '10px 12px', textAlign: 'left', fontWeight: 700, fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5, borderBottom: '1px solid #e2e8f0', whiteSpace: 'nowrap' };
const td: React.CSSProperties = { padding: '9px 12px', borderBottom: '1px solid #f1f5f9', color: '#334155' };
const tdR: React.CSSProperties = { ...td, textAlign: 'right', fontVariantNumeric: 'tabular-nums' };
const cardTitle: React.CSSProperties = { fontSize: 12, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.5, margin: '0 0 12px' };
