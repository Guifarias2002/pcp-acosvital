'use client';
import { useEffect, useState, useCallback } from 'react';
import AuthGuard from '@/components/AuthGuard';
import { getToken, isAdministrador } from '@/lib/auth';

const NOMES: Record<string, string> = {
  emissao: 'Emissão', usinagem: 'Usinagem', 'maçarico': 'Corte Maçarico', plasma: 'Corte Plasma',
  laser: 'Corte Laser', serra: 'Corte Serra', estoque: 'Estoque', furacao: 'Furação',
  qualidade: 'Qualidade', acabamento: 'Acabamento', logistica: 'Logística', recebimento: 'Recebimento',
  compras: 'Compras', beneficiadores: 'Beneficiadores', embalagem: 'Embalagem', quarentena: 'Quarentena', desenho: 'Desenho',
};
const SETORES_FILTRO = ['maçarico', 'plasma', 'laser', 'serra', 'usinagem', 'furacao', 'acabamento', 'qualidade', 'estoque', 'embalagem', 'logistica', 'quarentena'];

const nm = (c: string) => NOMES[c] || c || '—';
const fmt = (x: number | string | null | undefined, d = 0) =>
  x == null || x === '' ? '—' : Number(x).toLocaleString('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d });

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

interface Dados {
  periodo: { de: string; ate: string; setores: string[] };
  etapas: { entregue?: string; a_produzir?: string; produzindo?: string; atrasados?: string; total?: string };
  volume: { pedidos?: string; itens?: string; pecas?: string };
  throughput: { setor: string; finalizacoes: number; itens: number }[];
  semanal: { criados: Rec[]; final: Rec[]; entregas: Rec[] };
  tempo_etapa: Rec[];
  lead: { n?: string; media_dias?: string; mediana_dias?: string; min_dias?: string; max_dias?: string };
  wip: Rec[];
  top_paradas: Rec[];
  mix_tipo: Rec[];
  lideres: Rec[];
  atraso_setor: Rec[];
}
type Rec = Record<string, string>;

const C = { azul: '#1a3a5c', azul2: '#1d4ed8', verde: '#16a34a', laranja: '#d97706', vermelho: '#dc2626', roxo: '#7c3aed', cinza: '#64748b' };

export default function AnalisePage() {
  const hoje = new Date();
  const [de, setDe] = useState(iso(new Date(hoje.getFullYear(), hoje.getMonth(), 1)));
  const [ate, setAte] = useState(iso(hoje));
  const [setores, setSetores] = useState<string[]>([]);
  const [dados, setDados] = useState<Dados | null>(null);
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState('');
  const [fechamentos, setFechamentos] = useState<Rec[]>([]);
  const [genLoad, setGenLoad] = useState(false);
  const admin = isAdministrador();

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

  // Fechamento semanal: backfill automático das semanas fechadas (POST) + lista
  const gerarFechamentos = useCallback(async () => {
    setGenLoad(true);
    try {
      const res = await fetch('/api/analise/fechamento', { method: 'POST', headers: { Authorization: `Bearer ${getToken() || ''}` } });
      const j = await res.json();
      if (res.ok) setFechamentos(j.fechamentos || []);
    } catch { /* silencioso — histórico é secundário */ } finally { setGenLoad(false); }
  }, []);

  useEffect(() => { if (admin) { carregar(de, ate, setores); gerarFechamentos(); } /* eslint-disable-next-line */ }, [admin]);

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
  function toggleSetor(s: string) {
    const novo = setores.includes(s) ? setores.filter(x => x !== s) : [...setores, s];
    setSetores(novo);
  }

  if (!admin) return (
    <AuthGuard><div style={{ padding: 40, textAlign: 'center', color: C.cinza }}>
      <i className="bi bi-lock-fill" style={{ fontSize: 32, color: C.vermelho }} />
      <p style={{ marginTop: 12, fontWeight: 700 }}>Acesso restrito a administradores.</p>
    </div></AuthGuard>
  );

  const et = dados?.etapas || {};
  const vol = dados?.volume || {};
  const lead = dados?.lead || {};
  const semanas = mergeSemanas(dados);
  const picoFinal = Math.max(1, ...semanas.map(s => s.final));

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
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, marginBottom: 18 }}>
          <div>
            <h4 style={{ margin: 0, fontWeight: 800, color: C.azul, fontSize: 22 }}>
              <i className="bi bi-graph-up-arrow" style={{ marginRight: 8 }} />Análise de PCP — Flanges
            </h4>
            <small style={{ color: '#94a3b8' }}>
              Indicadores de produção para decisão de fábrica e diretoria. {dados && `Período ${dados.periodo.de} a ${dados.periodo.ate}.`}
            </small>
          </div>
          <button className="abtn no-print" onClick={() => window.print()}><i className="bi bi-printer" style={{ marginRight: 6 }} />Imprimir / PDF</button>
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
          <div>
            <label style={{ fontSize: 11, fontWeight: 700, color: '#64748b', display: 'block', marginBottom: 6 }}>
              Setores {setores.length ? `(${setores.length} selecionados)` : '(todos)'}
            </label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {SETORES_FILTRO.map(s => (
                <span key={s} className={`achip${setores.includes(s) ? ' on' : ''}`} onClick={() => toggleSetor(s)}>{nm(s)}</span>
              ))}
              {setores.length > 0 && <span className="achip" onClick={() => setSetores([])} style={{ color: C.vermelho }}>× limpar</span>}
            </div>
          </div>
        </div>

        {loading && <div style={{ textAlign: 'center', padding: 40, color: C.cinza }}><i className="bi bi-hourglass-split" style={{ fontSize: 24 }} /><p>Calculando indicadores…</p></div>}
        {erro && <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 10, padding: 14, color: C.vermelho }}><i className="bi bi-x-circle-fill" style={{ marginRight: 8 }} />{erro}</div>}

        {dados && !loading && (<>
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
            <Kpi v={fmt(vol.itens)} l="itens que entraram no período" cor={C.azul} />
          </div>

          {/* Produção semanal */}
          <SectionTitle icon="bi-bar-chart-line" t="Produção por semana" s="Finalizações de setor = ritmo de produção" />
          <div className="card" style={{ padding: 18, marginBottom: 24 }}>
            {semanas.length === 0 ? <Vazio /> : (
              <div style={{ display: 'flex', alignItems: 'flex-end', gap: 10, height: 180, paddingTop: 10 }}>
                {semanas.map(s => (
                  <div key={s.semana} style={{ flex: 1, textAlign: 'center' }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: C.azul }}>{s.final}</div>
                    <div style={{ background: s.final === picoFinal ? C.azul2 : '#93b4d6', borderRadius: '4px 4px 0 0', height: `${(s.final / picoFinal) * 130}px`, minHeight: 2 }} />
                    <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 4 }}>{labelSemana(s.semana)}</div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Throughput + tempo por etapa */}
          <SectionTitle icon="bi-speedometer" t="Desempenho por setor" s="Quanto cada setor produziu e quanto tempo a peça leva ali" />
          <div className="card" style={{ padding: 0, marginBottom: 24, overflowX: 'auto' }}>
            <table style={tbl}>
              <thead><tr>
                {['Setor', 'Finaliz. de etapa', 'Itens', 'Tempo médio (h)', 'Espera p/ iniciar (h)', 'Em pausa (h)'].map(h =>
                  <th key={h} style={th}>{h}</th>)}
              </tr></thead>
              <tbody>
                {ordenarSetores(dados).map(r => (
                  <tr key={r.setor}>
                    <td style={{ ...td, fontWeight: 700 }}>{nm(r.setor)}</td>
                    <td style={tdR}>{fmt(r.finalizacoes)}</td>
                    <td style={tdR}>{fmt(r.itens)}</td>
                    <td style={tdR}>{fmt(r.media_h, 0)}</td>
                    <td style={tdR}>{fmt(r.espera_h, 0)}</td>
                    <td style={{ ...tdR, color: Number(r.parada_h) > 10 ? C.laranja : undefined, fontWeight: Number(r.parada_h) > 10 ? 700 : 400 }}>{fmt(r.parada_h, 0)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Gargalos: WIP + ordens paradas */}
          <SectionTitle icon="bi-exclamation-diamond" t="Gargalos e filas" s="Itens parados agora e ordens presas há mais tempo" />
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(320px,1fr))', gap: 16, marginBottom: 24 }}>
            <div className="card" style={{ padding: 16 }}>
              <p style={cardTitle}>Itens parados por setor</p>
              {barras(dados.wip.map(w => ({ label: nm(w.setor), value: Number(w.itens), hi: ['plasma', 'quarentena', 'usinagem'].includes(w.setor) })))}
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
                barras(dados.atraso_setor.slice(0, 8).map(a => ({ label: nm(a.setor), value: Number(a.pedidos), hi: false })), C.vermelho)}
            </div>
            <div className="card" style={{ padding: 16 }}>
              <p style={cardTitle}>Mix — peças por tipo de flange</p>
              {dados.mix_tipo.length === 0 ? <Vazio /> :
                barras(dados.mix_tipo.slice(0, 8).map(m => ({ label: m.tipo, value: Number(m.pecas), hi: false })), C.azul)}
            </div>
          </div>

          {/* Lead time + produtividade */}
          <SectionTitle icon="bi-people" t="Lead time e apontamento por líder" s="Tempo até entrega e atividade de registro por setor" />
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(280px,1fr))', gap: 16, marginBottom: 24 }}>
            <div className="card" style={{ padding: 18 }}>
              <p style={cardTitle}>Lead time dos itens entregues no período</p>
              {lead.n && Number(lead.n) > 0 ? (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 10 }}>
                  <MiniKpi v={`${fmt(lead.mediana_dias, 0)} d`} l="mediana" />
                  <MiniKpi v={`${fmt(lead.media_dias, 0)} d`} l="média" />
                  <MiniKpi v={`${fmt(lead.min_dias, 0)} d`} l="mais rápido" />
                  <MiniKpi v={`${fmt(lead.max_dias, 0)} d`} l="mais lento" />
                </div>
              ) : <Vazio />}
              <p style={{ fontSize: 11, color: '#94a3b8', marginTop: 10, marginBottom: 0 }}>Base: {fmt(lead.n)} itens entregues no período (da 1ª etapa à entrega).</p>
            </div>
            <div className="card" style={{ padding: 0, overflowX: 'auto' }}>
              <p style={{ ...cardTitle, padding: '18px 16px 0' }}>Apontamento por líder</p>
              <table style={tbl}><thead><tr>{['Líder', 'Setor', 'Finaliz.', 'Inícios', 'Total'].map(h => <th key={h} style={th}>{h}</th>)}</tr></thead>
                <tbody>{dados.lideres.slice(0, 10).map((l, i) => (
                  <tr key={i}><td style={{ ...td, fontWeight: 700 }}>{l.nome || '—'}</td><td style={td}>{nm(l.setor)}</td>
                    <td style={tdR}>{fmt(l.finalizacoes)}</td><td style={tdR}>{fmt(l.inicios)}</td><td style={tdR}>{fmt(l.total_mov)}</td></tr>
                ))}</tbody></table>
            </div>
          </div>

          <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 10, padding: '12px 16px', fontSize: 12, color: '#64748b', marginBottom: 40 }}>
            <b>Notas:</b> "Situação dos materiais" é a foto de agora (não muda com o período). Tempos são corridos (incluem noite/fim de semana). "Apontamento por líder" reflete quem registra a produção, não a produção individual. Capacidade teórica/OEE precisa de tempo-padrão de engenharia — ainda não coletado.
          </div>
        </>)}

        {/* Fechamento semanal — histórico automático */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginTop: 8 }}>
          <SectionTitle icon="bi-calendar-week" t="Fechamento semanal (histórico)" s="Cada semana fechada é gravada automaticamente ao abrir esta tela" />
          <button className="abtn no-print" disabled={genLoad} onClick={gerarFechamentos}>
            <i className={`bi ${genLoad ? 'bi-hourglass-split' : 'bi-arrow-repeat'}`} style={{ marginRight: 6 }} />{genLoad ? 'Gerando…' : 'Gerar agora'}
          </button>
        </div>
        <div className="card" style={{ padding: 0, overflowX: 'auto', marginBottom: 40 }}>
          {fechamentos.length === 0 ? <Vazio /> : (
            <table style={tbl}>
              <thead><tr>{['Semana', 'Pedidos', 'Itens criados', 'Peças', 'Finaliz. de etapa', 'Itens entregues', 'Lead mediano'].map(h => <th key={h} style={th}>{h}</th>)}</tr></thead>
              <tbody>
                {fechamentos.map((f, i) => (
                  <tr key={i}>
                    <td style={{ ...td, fontWeight: 700 }}>{labelSemana(String(f.semana).slice(0, 10))}</td>
                    <td style={tdR}>{fmt(f.pedidos)}</td>
                    <td style={tdR}>{fmt(f.itens_criados)}</td>
                    <td style={tdR}>{fmt(f.pecas_criadas)}</td>
                    <td style={tdR}>{fmt(f.finalizacoes)}</td>
                    <td style={tdR}>{fmt(f.itens_entregues)}</td>
                    <td style={tdR}>{f.lead_mediana ? `${fmt(f.lead_mediana, 0)} d` : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </AuthGuard>
  );
}

// ── helpers de merge/ordenação ────────────────────────────────────────────────
function mergeSemanas(d: Dados | null) {
  if (!d) return [] as { semana: string; criados: number; final: number; concl: number }[];
  const map: Record<string, { semana: string; criados: number; final: number; concl: number }> = {};
  const get = (s: string) => (map[s] = map[s] || { semana: s, criados: 0, final: 0, concl: 0 });
  d.semanal.criados.forEach(r => { get(r.semana.slice(0, 10)).criados = Number(r.itens); });
  d.semanal.final.forEach(r => { get(r.semana.slice(0, 10)).final = Number(r.finalizacoes); });
  d.semanal.entregas.forEach(r => { get(r.semana.slice(0, 10)).concl = Number(r.concluidos); });
  return Object.values(map).sort((a, b) => a.semana.localeCompare(b.semana));
}
function ordenarSetores(d: Dados) {
  // junta throughput + tempo_etapa + wip por setor
  const map: Record<string, Rec & { setor: string }> = {};
  const g = (s: string) => (map[s] = map[s] || { setor: s });
  d.throughput.forEach(t => Object.assign(g(t.setor), { finalizacoes: String(t.finalizacoes), itens: String(t.itens) }));
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
function barras(data: { label: string; value: number; hi: boolean }[], cor = '#1d4ed8') {
  const mx = Math.max(1, ...data.map(d => d.value));
  return <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
    {data.map((d, i) => (
      <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{ width: 110, fontSize: 12, color: '#475569', textAlign: 'right', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{d.label}</div>
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
