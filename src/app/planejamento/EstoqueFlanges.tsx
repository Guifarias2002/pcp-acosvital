'use client';
// Aba "Estoque" do Planejamento — Estoque de FLANGES em dois locais (Arujá =
// produção, Mogi). Cadastro único de flanges; saldo por local; lançamentos
// (entrada / saída / transferência); baixa quando o pedido sai do setor Estoque
// (pergunta: fabricação aqui × estoque armazenado); entrada automática de
// "Pedido de Estoque" quando passa do acabamento; inventário por local.
// API: /api/estoque (ver src/lib/estoque.ts).
import { useCallback, useEffect, useMemo, useState } from 'react';
import { getToken } from '@/lib/auth';
import { parcialAcao } from '@/lib/api';
import DestinoSetorPicker from '@/components/DestinoSetorPicker';
import { NOMES } from '@/lib/types';
import {
  LOCAIS_ESTOQUE, TIPOS_MOV, nomeLocal,
  type ItemEstoque, type MovEstoque, type PecaNoEstoque, type PendenciaVinculo, type PedidoEstoque, type InventarioResumo,
} from '@/lib/estoque';

const C = { azul: '#1a3a5c', azul2: '#1d4ed8', verde: '#16a34a', laranja: '#d97706', vermelho: '#dc2626', roxo: '#7c3aed', cinza: '#64748b', teal: '#0d9488' };
const fmt = (n: number | null | undefined) => (n == null ? '—' : Number(n).toLocaleString('pt-BR', { maximumFractionDigits: 2 }));
const fmtDataHora = (iso: string | null) => {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' });
};
const nomeSetor = (c: string | null) => (c ? NOMES[c] || c : '—');
function erroMsg(e: unknown) {
  const ax = e as { response?: { data?: { erro?: string }; status?: number } };
  return ax?.response?.data?.erro || (ax?.response?.status ? `Erro ${ax.response.status}` : 'Falha de conexão.');
}

interface Dados {
  itens: ItemEstoque[];
  movs: MovEstoque[];
  no_setor: PecaNoEstoque[];
  pendencias: PendenciaVinculo[];
  pedidos_estoque: PedidoEstoque[];
  inventarios: InventarioResumo[];
}
type Sub = 'saldo' | 'pedidos' | 'lancamentos' | 'inventario' | 'cadastro' | 'pedidos_estoque';

async function post(body: Record<string, unknown>): Promise<{ ok: boolean; erro?: string; [k: string]: unknown }> {
  try {
    const r = await fetch('/api/estoque', {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken() || ''}` },
      body: JSON.stringify(body),
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) return { ok: false, erro: d.erro || `Erro ${r.status}` };
    return { ok: true, ...d };
  } catch { return { ok: false, erro: 'Falha de conexão.' }; }
}

const inp: React.CSSProperties = { border: '1.5px solid #e2e8f0', borderRadius: 8, padding: '7px 10px', fontSize: 13, width: '100%', background: '#fff' };
const lbl: React.CSSProperties = { fontSize: 11, fontWeight: 700, color: C.cinza, marginBottom: 3, display: 'block' };
const th: React.CSSProperties = { textAlign: 'left', padding: '6px 8px', fontSize: 10.5, color: '#94a3b8', textTransform: 'uppercase', fontWeight: 700, borderBottom: '1px solid #e2e8f0', whiteSpace: 'nowrap' };
const td: React.CSSProperties = { padding: '7px 8px', fontSize: 12.5, color: '#334155', borderTop: '1px solid #f1f5f9', verticalAlign: 'middle' };
const tdR: React.CSSProperties = { ...td, textAlign: 'right', fontWeight: 700 };

function Modal({ titulo, onFechar, children, largura = 520 }: { titulo: string; onFechar: () => void; children: React.ReactNode; largura?: number }) {
  return (
    <div onClick={onFechar} style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,.45)', zIndex: 1000, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '40px 16px', overflowY: 'auto' }}>
      <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: 14, width: '100%', maxWidth: largura, padding: 18, boxShadow: '0 20px 50px rgba(0,0,0,.25)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <div style={{ fontWeight: 800, color: C.azul, fontSize: 16 }}>{titulo}</div>
          <button onClick={onFechar} className="pl-btn" style={{ padding: '4px 10px' }}><i className="bi bi-x-lg" /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

function ItemSelect({ itens, value, onChange, local }: { itens: ItemEstoque[]; value: number | ''; onChange: (id: number | '') => void; local?: string }) {
  return (
    <select style={inp} value={value} onChange={e => onChange(e.target.value ? Number(e.target.value) : '')}>
      <option value="">— escolha o flange —</option>
      {itens.filter(i => i.ativo || i.id === value).map(i => (
        <option key={i.id} value={i.id}>
          {i.codigo} · {i.descricao}{local ? ` (saldo ${fmt(local === 'aruja' ? i.saldo_aruja : i.saldo_mogi)})` : ''}
        </option>
      ))}
    </select>
  );
}

export default function EstoqueFlanges() {
  const [dados, setDados] = useState<Dados | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState('');
  const [local, setLocal] = useState<string>('aruja');
  const [sub, setSub] = useState<Sub>('saldo');
  const [busca, setBusca] = useState('');
  const [aviso, setAviso] = useState('');

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      const r = await fetch('/api/estoque', { headers: { Authorization: `Bearer ${getToken() || ''}` } });
      const d = await r.json();
      if (!r.ok) { setErro(d.erro || 'Erro ao carregar o estoque.'); return; }
      setDados(d); setErro('');
    } catch { setErro('Falha de conexão.'); }
    finally { setCarregando(false); }
  }, []);
  useEffect(() => { carregar(); }, [carregar]);
  const avisar = (m: string) => { setAviso(m); setTimeout(() => setAviso(a => (a === m ? '' : a)), 4000); };

  const itens = dados?.itens || [];
  const itemPorId = useMemo(() => new Map(itens.map(i => [i.id, i])), [itens]);
  const saldoDe = (i: ItemEstoque, l: string) => (l === 'aruja' ? i.saldo_aruja : i.saldo_mogi);
  const q = busca.trim().toLowerCase();
  const casa = (...t: (string | null | undefined)[]) => !q || t.some(x => (x || '').toLowerCase().includes(q));

  // ── Modais ────────────────────────────────────────────────────────────────
  const [mLanc, setMLanc] = useState<{ tipo: 'entrada' | 'saida' | 'transferencia'; item_id: number | ''; local: string; local_destino: string; quantidade: string; obs: string } | null>(null);
  const [mItem, setMItem] = useState<{ id?: number; codigo: string; codigo_pedido: string; descricao: string; unidade: string; estoque_minimo: string; ativo: boolean } | null>(null);
  const [mAtender, setMAtender] = useState<{ peca: PecaNoEstoque; fab: string; origens: { item_id: number | ''; local: string; quantidade: string }[]; destino: string; obs: string } | null>(null);
  const [mVinc, setMVinc] = useState<{ pend: PendenciaVinculo; item_id: number | '' } | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [erroModal, setErroModal] = useState('');
  const abrir = <T,>(set: (v: T) => void, v: T) => { setErroModal(''); set(v); };

  async function salvarLanc() {
    if (!mLanc) return;
    setSalvando(true); setErroModal('');
    const r = await post({ acao: 'lancar', ...mLanc, quantidade: Number(mLanc.quantidade.replace(',', '.')) });
    setSalvando(false);
    if (!r.ok) { setErroModal(r.erro || 'Erro'); return; }
    setMLanc(null); avisar('Lançamento salvo.'); carregar();
  }
  async function salvarItem() {
    if (!mItem) return;
    setSalvando(true); setErroModal('');
    const r = await post({ acao: 'item_salvar', ...mItem, estoque_minimo: mItem.estoque_minimo.replace(',', '.') });
    setSalvando(false);
    if (!r.ok) { setErroModal(r.erro || 'Erro'); return; }
    setMItem(null); avisar('Flange salvo.'); carregar();
  }
  async function cancelarMov(m: MovEstoque) {
    const ehBaixa = !!m.atendimento_id;
    const msg = ehBaixa
      ? `Desfazer a baixa do pedido ${m.numero_pedido_venda || ''}?\n\nO saldo volta pro estoque. A peça NÃO volta pro setor Estoque — se precisar, devolva pelo setor.`
      : `Cancelar este lançamento (${TIPOS_MOV[m.tipo]?.nome || m.tipo} de ${fmt(Math.abs(m.quantidade))} ${m.codigo})?\n\nO saldo é recalculado. O registro fica no histórico como cancelado.`;
    if (!confirm(msg)) return;
    const r = await post(ehBaixa ? { acao: 'cancelar_atendimento', id: m.atendimento_id } : { acao: 'cancelar_mov', id: m.id });
    if (!r.ok) { alert(r.erro); return; }
    avisar('Cancelado.'); carregar();
  }
  async function confirmarAtender() {
    if (!mAtender) return;
    const { peca } = mAtender;
    const fab = Number(mAtender.fab.replace(',', '.')) || 0;
    const origens = mAtender.origens
      .map(o => ({ item_id: o.item_id, local: o.local, quantidade: Number(o.quantidade.replace(',', '.')) || 0 }))
      .filter(o => o.quantidade > 0);
    const total = fab + origens.reduce((s, o) => s + o.quantidade, 0);
    if (!(total > 0)) { setErroModal('Informe quanto veio da fabricação e/ou do estoque.'); return; }
    if (total > peca.quantidade + 1e-9) { setErroModal(`A soma (${fmt(total)}) passa do que está no Estoque (${fmt(peca.quantidade)}).`); return; }
    if (origens.some(o => !o.item_id)) { setErroModal('Escolha o flange do estoque.'); return; }
    if (!mAtender.destino) { setErroModal('Escolha o setor de destino.'); return; }
    setSalvando(true); setErroModal('');
    const r = await post({ acao: 'atender', parcial_id: peca.parcial_id, qtd_fabricacao: fab, origens, setor_destino: mAtender.destino, obs: mAtender.obs });
    if (!r.ok) { setSalvando(false); setErroModal(r.erro || 'Erro'); return; }
    try {
      const partes = [fab > 0 ? `${fmt(fab)} fabricação aqui` : '', origens.length ? `${fmt(total - fab)} do estoque` : ''].filter(Boolean).join(' + ');
      await parcialAcao(peca.parcial_id, 'mover', {
        setor_destino: mAtender.destino, quantidade: total,
        observacao: `Estoque: ${partes}${mAtender.obs ? ` · ${mAtender.obs}` : ''}`,
      });
    } catch (e) {
      // Movimentação falhou → desfaz a baixa pra não ficar saldo errado.
      await post({ acao: 'cancelar_atendimento', id: r.atendimento_id });
      setSalvando(false); setErroModal(`Não movimentou: ${erroMsg(e)} (a baixa foi desfeita).`); return;
    }
    setSalvando(false); setMAtender(null);
    avisar(`${fmt(total)} ${peca.unidade} enviados para ${nomeSetor(mAtender.destino)}.`);
    carregar();
  }
  async function salvarVinculo() {
    if (!mVinc?.item_id) { setErroModal('Escolha o flange.'); return; }
    setSalvando(true); setErroModal('');
    const r = await post({ acao: 'vincular', item_pedido_id: mVinc.pend.item_pedido_id, item_id: mVinc.item_id });
    setSalvando(false);
    if (!r.ok) { setErroModal(r.erro || 'Erro'); return; }
    setMVinc(null); avisar('Entrada de produção lançada.'); carregar();
  }

  // ── Pedido de Estoque ─────────────────────────────────────────────────────
  const [novoPedEst, setNovoPedEst] = useState({ numero: '', local: 'aruja' });
  async function marcarPedidoEstoque(numero: string, loc: string | null) {
    const r = await post({ acao: 'pedido_estoque', numero_pedido_venda: numero, local: loc });
    if (!r.ok) { alert(r.erro); return false; }
    avisar(loc ? `Pedido ${numero} marcado como Pedido de Estoque (${nomeLocal(loc)}).` : `Pedido ${numero} desmarcado.`);
    carregar(); return true;
  }

  // ── Inventário ────────────────────────────────────────────────────────────
  const [invAberto, setInvAberto] = useState<{ id: number; local: string; contagem: Record<number, string> } | null>(null);
  const [invBusca, setInvBusca] = useState('');
  async function abrirInventario(id: number, loc: string) {
    try {
      const r = await fetch(`/api/estoque?inventario=${id}`, { headers: { Authorization: `Bearer ${getToken() || ''}` } });
      const d = await r.json();
      if (!r.ok) { alert(d.erro); return; }
      const contagem: Record<number, string> = {};
      for (const l of d.linhas as { item_id: number; contado: number }[]) contagem[l.item_id] = String(l.contado);
      setInvAberto({ id, local: loc, contagem });
    } catch { alert('Falha de conexão.'); }
  }
  async function novoInventario() {
    const r = await post({ acao: 'inv_abrir', local });
    if (!r.ok) { alert(r.erro); return; }
    await carregar();
    abrirInventario(Number(r.id), local);
  }
  const linhasInv = () => Object.entries(invAberto?.contagem || {}).map(([item_id, v]) => ({ item_id: Number(item_id), contado: v.trim() === '' ? null : Number(v.replace(',', '.')) }));
  async function salvarInventario(fechar: boolean) {
    if (!invAberto) return;
    if (fechar && !confirm(`Fechar o inventário de ${nomeLocal(invAberto.local)}?\n\nO saldo de cada flange contado passa a ser o CONTADO (a diferença vira "Ajuste de inventário"). Flange não contado não muda.`)) return;
    setSalvando(true);
    const r = await post({ acao: fechar ? 'inv_fechar' : 'inv_salvar', id: invAberto.id, linhas: linhasInv() });
    setSalvando(false);
    if (!r.ok) { alert(r.erro); return; }
    avisar(fechar ? 'Inventário fechado e saldo ajustado.' : 'Contagem salva.');
    if (fechar) setInvAberto(null);
    carregar();
  }
  async function cancelarInventario(id: number) {
    if (!confirm('Cancelar este inventário aberto? A contagem digitada é perdida.')) return;
    const r = await post({ acao: 'inv_cancelar', id });
    if (!r.ok) { alert(r.erro); return; }
    if (invAberto?.id === id) setInvAberto(null);
    carregar();
  }

  // ── Render ────────────────────────────────────────────────────────────────
  const btnSub = (id: Sub, rot: string, icon: string, badge?: number) => {
    const on = sub === id;
    return (
      <button key={id} onClick={() => setSub(id)} style={{
        display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12.5, fontWeight: 700, cursor: 'pointer',
        border: `1.5px solid ${on ? C.teal : '#e2e8f0'}`, borderRadius: 9, padding: '6px 12px',
        background: on ? '#f0fdfa' : '#fff', color: on ? C.teal : '#475569',
      }}>
        <i className={`bi ${icon}`} />{rot}
        {!!badge && <span style={{ fontSize: 10.5, fontWeight: 800, background: C.laranja, color: '#fff', borderRadius: 10, padding: '0 7px' }}>{badge}</span>}
      </button>
    );
  };

  const totalLocal = itens.reduce((s, i) => s + saldoDe(i, local), 0);
  const abaixoMin = itens.filter(i => i.ativo && i.estoque_minimo != null && saldoDe(i, local) < i.estoque_minimo);
  const movsLocal = (dados?.movs || []).filter(m => m.local === local && casa(m.codigo, m.descricao, m.numero_pedido_venda, m.obs, m.criado_por_nome));
  const invs = (dados?.inventarios || []).filter(v => v.local === local);
  const pecasNoSetor = (dados?.no_setor || []).filter(p => casa(p.numero_pedido_venda, p.cliente, p.codigo, p.descricao));

  return (
    <section style={{ marginBottom: 30 }}>
      {/* Local: Estoque Arujá × Estoque Mogi */}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 12 }}>
        {LOCAIS_ESTOQUE.map(l => {
          const on = local === l.cod;
          const tot = itens.reduce((s, i) => s + saldoDe(i, l.cod), 0);
          return (
            <button key={l.cod} onClick={() => setLocal(l.cod)} style={{
              flex: '1 1 220px', textAlign: 'left', cursor: 'pointer', borderRadius: 12, padding: '12px 16px',
              border: `2px solid ${on ? C.azul : '#e2e8f0'}`, background: on ? C.azul : '#fff', color: on ? '#fff' : C.azul,
            }}>
              <div style={{ fontSize: 15, fontWeight: 800 }}><i className="bi bi-box-seam" style={{ marginRight: 8 }} />{l.nome}</div>
              <div style={{ fontSize: 12, opacity: .85, marginTop: 2 }}>{fmt(tot)} peças em estoque</div>
            </button>
          );
        })}
      </div>

      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', marginBottom: 12 }}>
        {btnSub('saldo', 'Saldo', 'bi-bar-chart-steps')}
        {btnSub('pedidos', 'Pedidos no Estoque', 'bi-cart-check', dados?.no_setor.length)}
        {btnSub('lancamentos', 'Lançamentos', 'bi-journal-text')}
        {btnSub('inventario', 'Inventário', 'bi-clipboard-check', invs.filter(v => v.status === 'aberto').length)}
        {btnSub('cadastro', 'Cadastro de flanges', 'bi-card-list')}
        {btnSub('pedidos_estoque', 'Pedidos de Estoque', 'bi-gear', dados?.pendencias.length)}
        <div style={{ flex: 1 }} />
        <input placeholder="Buscar código, descrição, pedido…" value={busca} onChange={e => setBusca(e.target.value)} style={{ ...inp, width: 240 }} />
        <button className="pl-btn" onClick={carregar} disabled={carregando}><i className="bi bi-arrow-clockwise" /> {carregando ? '…' : ''}</button>
      </div>

      {erro && <div style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c', borderRadius: 8, padding: '10px 14px', fontSize: 13, marginBottom: 12 }}>{erro}</div>}
      {aviso && <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', color: '#166534', borderRadius: 8, padding: '8px 14px', fontSize: 13, marginBottom: 12 }}><i className="bi bi-check-circle" /> {aviso}</div>}
      {!dados && carregando && <div style={{ color: C.cinza, padding: 20 }}>Carregando estoque…</div>}

      {dados && (
        <div className="card" style={{ padding: 14 }}>
          {/* ── SALDO ─────────────────────────────────────────────────────── */}
          {sub === 'saldo' && (
            <>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 10 }}>
                <div style={{ fontWeight: 800, color: C.azul }}>{nomeLocal(local)} · {fmt(totalLocal)} peças</div>
                {abaixoMin.length > 0 && <span style={{ fontSize: 12, fontWeight: 700, color: C.vermelho }}><i className="bi bi-exclamation-triangle" /> {abaixoMin.length} abaixo do mínimo</span>}
                <div style={{ flex: 1 }} />
                <button className="pl-btn" style={{ color: C.verde }} onClick={() => abrir(setMLanc, { tipo: 'entrada', item_id: '', local, local_destino: '', quantidade: '', obs: '' })}><i className="bi bi-plus-lg" /> Entrada</button>
                <button className="pl-btn" style={{ color: C.vermelho }} onClick={() => abrir(setMLanc, { tipo: 'saida', item_id: '', local, local_destino: '', quantidade: '', obs: '' })}><i className="bi bi-dash-lg" /> Saída</button>
                <button className="pl-btn" style={{ color: C.roxo }} onClick={() => abrir(setMLanc, { tipo: 'transferencia', item_id: '', local, local_destino: local === 'aruja' ? 'mogi' : 'aruja', quantidade: '', obs: '' })}><i className="bi bi-arrow-left-right" /> Transferir</button>
              </div>
              {itens.length === 0 ? (
                <div style={{ color: C.cinza, padding: 16, textAlign: 'center' }}>
                  Nenhum flange cadastrado ainda. <button className="pl-btn" onClick={() => setSub('cadastro')}>Cadastrar flanges</button>
                </div>
              ) : (
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 620 }}>
                    <thead><tr>
                      <th style={th}>Código</th><th style={th}>Descrição</th>
                      <th style={{ ...th, textAlign: 'right' }}>Saldo {local === 'aruja' ? 'Arujá' : 'Mogi'}</th>
                      <th style={{ ...th, textAlign: 'right' }}>Mínimo</th>
                      <th style={{ ...th, textAlign: 'right' }}>{local === 'aruja' ? 'Mogi' : 'Arujá'}</th>
                      <th style={th}></th>
                    </tr></thead>
                    <tbody>
                      {itens.filter(i => i.ativo && casa(i.codigo, i.codigo_pedido, i.descricao)).map(i => {
                        const s = saldoDe(i, local);
                        const baixo = i.estoque_minimo != null && s < i.estoque_minimo;
                        return (
                          <tr key={i.id} style={{ background: baixo ? '#fef2f2' : undefined }}>
                            <td style={{ ...td, fontWeight: 700 }}>{i.codigo}{i.codigo_pedido && i.codigo_pedido !== i.codigo && <div style={{ fontSize: 10.5, color: '#94a3b8', fontWeight: 500 }}>pedido: {i.codigo_pedido}</div>}</td>
                            <td style={td}>{i.descricao}</td>
                            <td style={{ ...tdR, fontSize: 14, color: s < 0 ? C.vermelho : baixo ? C.vermelho : C.azul }}>{fmt(s)} <span style={{ fontSize: 11, color: '#94a3b8', fontWeight: 500 }}>{i.unidade}</span></td>
                            <td style={{ ...tdR, color: '#94a3b8', fontWeight: 500 }}>{fmt(i.estoque_minimo)}</td>
                            <td style={{ ...tdR, color: '#94a3b8', fontWeight: 500 }}>{fmt(saldoDe(i, local === 'aruja' ? 'mogi' : 'aruja'))}</td>
                            <td style={{ ...td, whiteSpace: 'nowrap', textAlign: 'right' }}>
                              <button className="pl-btn" style={{ padding: '3px 8px', color: C.verde }} title="Entrada" onClick={() => abrir(setMLanc, { tipo: 'entrada', item_id: i.id, local, local_destino: '', quantidade: '', obs: '' })}><i className="bi bi-plus-lg" /></button>{' '}
                              <button className="pl-btn" style={{ padding: '3px 8px', color: C.vermelho }} title="Saída" onClick={() => abrir(setMLanc, { tipo: 'saida', item_id: i.id, local, local_destino: '', quantidade: '', obs: '' })}><i className="bi bi-dash-lg" /></button>{' '}
                              <button className="pl-btn" style={{ padding: '3px 8px', color: C.roxo }} title="Transferir" onClick={() => abrir(setMLanc, { tipo: 'transferencia', item_id: i.id, local, local_destino: local === 'aruja' ? 'mogi' : 'aruja', quantidade: '', obs: '' })}><i className="bi bi-arrow-left-right" /></button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}

          {/* ── PEDIDOS NO ESTOQUE (setor Estoque) ────────────────────────── */}
          {sub === 'pedidos' && (
            <>
              <div style={{ fontSize: 12.5, color: C.cinza, marginBottom: 10 }}>
                Peças de pedidos que estão no <b>setor Estoque</b>. Ao movimentar, diga de onde veio: <b>🔧 fabricação aqui</b> (não mexe no saldo) ou <b>📦 estoque armazenado</b> (baixa o saldo). O que não for movimentado fica aqui.
              </div>
              {pecasNoSetor.length === 0 ? <div style={{ color: C.cinza, padding: 16, textAlign: 'center' }}>Nenhuma peça no setor Estoque.</div> : (
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 700 }}>
                    <thead><tr><th style={th}>Pedido</th><th style={th}>Cliente</th><th style={th}>Código</th><th style={th}>Descrição</th><th style={{ ...th, textAlign: 'right' }}>Qtd</th><th style={th}>Tem no estoque</th><th style={th}></th></tr></thead>
                    <tbody>
                      {pecasNoSetor.map(p => {
                        const sug = p.sugestao_item_id ? itemPorId.get(p.sugestao_item_id) : undefined;
                        return (
                          <tr key={p.parcial_id}>
                            <td style={{ ...td, fontWeight: 700 }}>{p.numero_pedido_venda}{p.pedido_estoque && <div style={{ fontSize: 10.5, color: C.teal }}>Pedido de Estoque</div>}</td>
                            <td style={td}>{p.cliente}</td>
                            <td style={td}>{p.codigo}</td>
                            <td style={td}>{p.descricao}</td>
                            <td style={tdR}>{fmt(p.quantidade)} <span style={{ fontSize: 11, color: '#94a3b8', fontWeight: 500 }}>{p.unidade}</span></td>
                            <td style={{ ...td, fontSize: 12 }}>
                              {sug ? <>Arujá <b>{fmt(sug.saldo_aruja)}</b> · Mogi <b>{fmt(sug.saldo_mogi)}</b></> : <span style={{ color: '#94a3b8' }}>sem cadastro com esse código</span>}
                            </td>
                            <td style={{ ...td, textAlign: 'right' }}>
                              <button className="pl-btn" style={{ color: '#fff', background: C.teal, borderColor: C.teal }} onClick={() => {
                                const locSug = sug ? (sug.saldo_aruja >= p.quantidade || sug.saldo_aruja >= sug.saldo_mogi ? 'aruja' : 'mogi') : local;
                                abrir(setMAtender, {
                                  peca: p, fab: '', destino: p.proximo_setor || '', obs: '',
                                  origens: [{ item_id: sug?.id ?? '', local: locSug, quantidade: sug ? String(Math.min(p.quantidade, Math.max(0, saldoDe(sug, locSug)))) : '' }],
                                });
                              }}><i className="bi bi-box-arrow-right" /> Movimentar</button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}

          {/* ── LANÇAMENTOS (histórico do local) ──────────────────────────── */}
          {sub === 'lancamentos' && (
            <>
              <div style={{ fontWeight: 800, color: C.azul, marginBottom: 8 }}>Lançamentos — {nomeLocal(local)} <span style={{ fontWeight: 500, fontSize: 12, color: '#94a3b8' }}>(últimos 400 dos dois locais)</span></div>
              {movsLocal.length === 0 ? <div style={{ color: C.cinza, padding: 16, textAlign: 'center' }}>Nenhum lançamento.</div> : (
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 760 }}>
                    <thead><tr><th style={th}>Data</th><th style={th}>Tipo</th><th style={th}>Flange</th><th style={{ ...th, textAlign: 'right' }}>Qtd</th><th style={th}>Pedido</th><th style={th}>Obs.</th><th style={th}>Quem</th><th style={th}></th></tr></thead>
                    <tbody>
                      {movsLocal.map(m => {
                        const t = TIPOS_MOV[m.tipo] || { nome: m.tipo, cor: C.cinza, icon: 'bi-dot' };
                        const canc = !!m.cancelado_em;
                        return (
                          <tr key={m.id} style={{ opacity: canc ? .45 : 1, textDecoration: canc ? 'line-through' : undefined }}>
                            <td style={{ ...td, whiteSpace: 'nowrap' }}>{fmtDataHora(m.criado_em)}</td>
                            <td style={{ ...td, color: t.cor, fontWeight: 700, whiteSpace: 'nowrap' }}><i className={`bi ${t.icon}`} /> {t.nome}</td>
                            <td style={td}><b>{m.codigo}</b> <span style={{ color: '#94a3b8' }}>{m.descricao}</span></td>
                            <td style={{ ...tdR, color: m.quantidade < 0 ? C.vermelho : C.verde }}>{m.quantidade > 0 ? '+' : ''}{fmt(m.quantidade)}</td>
                            <td style={td}>{m.numero_pedido_venda || '—'}</td>
                            <td style={{ ...td, fontSize: 11.5, color: C.cinza, maxWidth: 220 }}>{m.obs}{canc && <div style={{ textDecoration: 'none' }}>cancelado por {m.cancelado_por_nome}</div>}</td>
                            <td style={{ ...td, fontSize: 11.5 }}>{m.criado_por_nome}</td>
                            <td style={{ ...td, textAlign: 'right' }}>
                              {!canc && m.tipo !== 'inventario' && (
                                <button className="pl-btn" style={{ padding: '3px 8px', color: C.vermelho, fontSize: 11.5 }} onClick={() => cancelarMov(m)}>
                                  {m.atendimento_id ? 'Desfazer baixa' : 'Cancelar'}
                                </button>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}

          {/* ── INVENTÁRIO ────────────────────────────────────────────────── */}
          {sub === 'inventario' && !invAberto && (
            <>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
                <div style={{ fontWeight: 800, color: C.azul }}>Inventários — {nomeLocal(local)}</div>
                <div style={{ flex: 1 }} />
                <button className="pl-btn" style={{ color: '#fff', background: C.azul2, borderColor: C.azul2 }} onClick={novoInventario} disabled={invs.some(v => v.status === 'aberto')}>
                  <i className="bi bi-plus-lg" /> Novo inventário
                </button>
              </div>
              <div style={{ fontSize: 12.5, color: C.cinza, marginBottom: 10 }}>
                Contagem física: digite quanto tem de cada flange. Ao <b>fechar</b>, o saldo passa a ser o contado e a diferença fica registrada como “Ajuste de inventário”.
              </div>
              {invs.length === 0 ? <div style={{ color: C.cinza, padding: 16, textAlign: 'center' }}>Nenhum inventário ainda.</div> : (
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead><tr><th style={th}>#</th><th style={th}>Aberto em</th><th style={th}>Status</th><th style={{ ...th, textAlign: 'right' }}>Contados</th><th style={{ ...th, textAlign: 'right' }}>Ajustes</th><th style={th}>Fechado</th><th style={th}></th></tr></thead>
                  <tbody>
                    {invs.map(v => (
                      <tr key={v.id}>
                        <td style={{ ...td, fontWeight: 700 }}>{v.id}</td>
                        <td style={td}>{fmtDataHora(v.criado_em)} · {v.criado_por_nome}</td>
                        <td style={{ ...td, fontWeight: 700, color: v.status === 'aberto' ? C.laranja : C.verde }}>{v.status === 'aberto' ? 'Em contagem' : 'Fechado'}</td>
                        <td style={tdR}>{v.linhas}</td>
                        <td style={tdR}>{v.ajustes}</td>
                        <td style={td}>{v.fechado_em ? `${fmtDataHora(v.fechado_em)} · ${v.fechado_por_nome}` : '—'}</td>
                        <td style={{ ...td, textAlign: 'right', whiteSpace: 'nowrap' }}>
                          <button className="pl-btn" style={{ padding: '3px 10px' }} onClick={() => abrirInventario(v.id, v.local)}>{v.status === 'aberto' ? 'Continuar contagem' : 'Ver'}</button>
                          {v.status === 'aberto' && <> <button className="pl-btn" style={{ padding: '3px 10px', color: C.vermelho }} onClick={() => cancelarInventario(v.id)}>Cancelar</button></>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </>
          )}
          {sub === 'inventario' && invAberto && (() => {
            const v = (dados.inventarios || []).find(x => x.id === invAberto.id);
            const fechado = v?.status === 'fechado';
            const qi = invBusca.trim().toLowerCase();
            const lista = itens.filter(i => (i.ativo || invAberto.contagem[i.id] !== undefined) && (!qi || `${i.codigo} ${i.codigo_pedido || ''} ${i.descricao}`.toLowerCase().includes(qi)));
            const contados = Object.values(invAberto.contagem).filter(x => x.trim() !== '').length;
            return (
              <>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
                  <button className="pl-btn" onClick={() => setInvAberto(null)}><i className="bi bi-arrow-left" /> Voltar</button>
                  <div style={{ fontWeight: 800, color: C.azul }}>Inventário #{invAberto.id} — {nomeLocal(invAberto.local)} {fechado && <span style={{ color: C.verde }}>(fechado)</span>}</div>
                  <span style={{ fontSize: 12, color: C.cinza }}>{contados} flange(s) contado(s)</span>
                  <div style={{ flex: 1 }} />
                  <input placeholder="Filtrar flange…" value={invBusca} onChange={e => setInvBusca(e.target.value)} style={{ ...inp, width: 200 }} />
                  {!fechado && <>
                    <button className="pl-btn" onClick={() => salvarInventario(false)} disabled={salvando}><i className="bi bi-save" /> Salvar contagem</button>
                    <button className="pl-btn" style={{ color: '#fff', background: C.verde, borderColor: C.verde }} onClick={() => salvarInventario(true)} disabled={salvando}><i className="bi bi-check2-all" /> Fechar e ajustar saldo</button>
                  </>}
                  <button className="pl-btn no-print" onClick={() => window.print()}><i className="bi bi-printer" /></button>
                </div>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 620 }}>
                    <thead><tr><th style={th}>Código</th><th style={th}>Descrição</th><th style={{ ...th, textAlign: 'right' }}>Saldo no sistema</th><th style={{ ...th, textAlign: 'right' }}>Contado</th><th style={{ ...th, textAlign: 'right' }}>Diferença</th></tr></thead>
                    <tbody>
                      {lista.map(i => {
                        const sis = saldoDe(i, invAberto.local);
                        const raw = invAberto.contagem[i.id] ?? '';
                        const c = raw.trim() === '' ? null : Number(raw.replace(',', '.'));
                        const dif = c == null || Number.isNaN(c) ? null : c - sis;
                        return (
                          <tr key={i.id}>
                            <td style={{ ...td, fontWeight: 700 }}>{i.codigo}</td>
                            <td style={td}>{i.descricao}</td>
                            <td style={{ ...tdR, color: '#94a3b8' }}>{fechado ? '—' : fmt(sis)}</td>
                            <td style={{ ...td, textAlign: 'right', width: 120 }}>
                              <input inputMode="decimal" disabled={fechado} value={raw} placeholder="—"
                                onChange={e => setInvAberto(a => a && { ...a, contagem: { ...a.contagem, [i.id]: e.target.value } })}
                                style={{ ...inp, textAlign: 'right', width: 100, fontWeight: 700 }} />
                            </td>
                            <td style={{ ...tdR, color: dif == null ? '#cbd5e1' : dif === 0 ? C.verde : dif > 0 ? C.azul2 : C.vermelho }}>
                              {dif == null || fechado ? '—' : `${dif > 0 ? '+' : ''}${fmt(dif)}`}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </>
            );
          })()}

          {/* ── CADASTRO DE FLANGES ───────────────────────────────────────── */}
          {sub === 'cadastro' && (
            <>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
                <div style={{ fontWeight: 800, color: C.azul }}>Cadastro de flanges <span style={{ fontWeight: 500, fontSize: 12, color: '#94a3b8' }}>(vale pros dois estoques)</span></div>
                <div style={{ flex: 1 }} />
                <button className="pl-btn" style={{ color: '#fff', background: C.azul2, borderColor: C.azul2 }} onClick={() => abrir(setMItem, { codigo: '', codigo_pedido: '', descricao: '', unidade: 'pç', estoque_minimo: '', ativo: true })}>
                  <i className="bi bi-plus-lg" /> Novo flange
                </button>
              </div>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 640 }}>
                  <thead><tr><th style={th}>Código</th><th style={th}>Código no pedido</th><th style={th}>Descrição</th><th style={th}>Un.</th><th style={{ ...th, textAlign: 'right' }}>Mínimo</th><th style={th}>Situação</th><th style={th}></th></tr></thead>
                  <tbody>
                    {itens.filter(i => casa(i.codigo, i.codigo_pedido, i.descricao)).map(i => (
                      <tr key={i.id} style={{ opacity: i.ativo ? 1 : .5 }}>
                        <td style={{ ...td, fontWeight: 700 }}>{i.codigo}</td>
                        <td style={td}>{i.codigo_pedido || <span style={{ color: '#cbd5e1' }}>—</span>}</td>
                        <td style={td}>{i.descricao}</td>
                        <td style={td}>{i.unidade}</td>
                        <td style={tdR}>{fmt(i.estoque_minimo)}</td>
                        <td style={{ ...td, color: i.ativo ? C.verde : C.cinza, fontWeight: 700 }}>{i.ativo ? 'Ativo' : 'Inativo'}</td>
                        <td style={{ ...td, textAlign: 'right' }}>
                          <button className="pl-btn" style={{ padding: '3px 10px' }} onClick={() => abrir(setMItem, {
                            id: i.id, codigo: i.codigo, codigo_pedido: i.codigo_pedido || '', descricao: i.descricao, unidade: i.unidade,
                            estoque_minimo: i.estoque_minimo == null ? '' : String(i.estoque_minimo), ativo: i.ativo,
                          })}><i className="bi bi-pencil" /> Editar</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {/* ── PEDIDOS DE ESTOQUE (entrada automática) ───────────────────── */}
          {sub === 'pedidos_estoque' && (
            <>
              <div style={{ fontSize: 12.5, color: C.cinza, marginBottom: 10 }}>
                <b>Pedido de Estoque</b> = pedido de flange lançado normalmente, mas pra repor estoque. Quando cada item <b>passa do acabamento</b>, entra <b>sozinho</b> no saldo do local escolhido (pelo código do flange).
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', flexWrap: 'wrap', marginBottom: 14 }}>
                <div style={{ width: 180 }}><label style={lbl}>Nº do pedido</label><input style={inp} value={novoPedEst.numero} onChange={e => setNovoPedEst(v => ({ ...v, numero: e.target.value }))} placeholder="ex.: 27250" /></div>
                <div style={{ width: 180 }}><label style={lbl}>Entra no</label>
                  <select style={inp} value={novoPedEst.local} onChange={e => setNovoPedEst(v => ({ ...v, local: e.target.value }))}>
                    {LOCAIS_ESTOQUE.map(l => <option key={l.cod} value={l.cod}>{l.nome}</option>)}
                  </select>
                </div>
                <button className="pl-btn" style={{ color: '#fff', background: C.teal, borderColor: C.teal }} onClick={async () => {
                  if (!novoPedEst.numero.trim()) return;
                  if (await marcarPedidoEstoque(novoPedEst.numero.trim(), novoPedEst.local)) setNovoPedEst(v => ({ ...v, numero: '' }));
                }}><i className="bi bi-plus-lg" /> Marcar como Pedido de Estoque</button>
              </div>

              {(dados.pendencias || []).length > 0 && (
                <div style={{ background: '#fff7ed', border: '1.5px solid #fdba74', borderRadius: 10, padding: 10, marginBottom: 14 }}>
                  <div style={{ fontWeight: 800, color: '#9a3412', fontSize: 12.5, marginBottom: 6 }}>
                    <i className="bi bi-link-45deg" /> Produzidos sem flange cadastrado com esse código ({dados.pendencias.length}) — vincule pra entrar no saldo
                  </div>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <tbody>
                      {dados.pendencias.map(p => (
                        <tr key={p.item_pedido_id}>
                          <td style={{ ...td, fontWeight: 700 }}>{p.numero_pedido_venda}</td>
                          <td style={td}>{p.codigo} · {p.descricao}</td>
                          <td style={tdR}>{fmt(p.quantidade)}</td>
                          <td style={td}>{nomeLocal(p.local)}</td>
                          <td style={{ ...td, textAlign: 'right' }}><button className="pl-btn" style={{ padding: '3px 10px' }} onClick={() => abrir(setMVinc, { pend: p, item_id: '' })}>Vincular</button></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {(dados.pedidos_estoque || []).length === 0 ? <div style={{ color: C.cinza, padding: 16, textAlign: 'center' }}>Nenhum Pedido de Estoque marcado.</div> : (
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead><tr><th style={th}>Pedido</th><th style={th}>Cliente</th><th style={th}>Entra no</th><th style={{ ...th, textAlign: 'right' }}>Peças</th><th style={{ ...th, textAlign: 'right' }}>Já entraram</th><th style={th}></th></tr></thead>
                  <tbody>
                    {dados.pedidos_estoque.map(p => (
                      <tr key={p.pedido_id}>
                        <td style={{ ...td, fontWeight: 700 }}>{p.numero_pedido_venda}</td>
                        <td style={td}>{p.cliente}</td>
                        <td style={td}>{nomeLocal(p.local)}</td>
                        <td style={tdR}>{fmt(p.pecas)}</td>
                        <td style={{ ...tdR, color: p.pecas_entradas >= p.pecas && p.pecas > 0 ? C.verde : C.laranja }}>{fmt(p.pecas_entradas)}</td>
                        <td style={{ ...td, textAlign: 'right' }}>
                          <button className="pl-btn" style={{ padding: '3px 10px', color: C.vermelho }} onClick={() => {
                            if (confirm(`Desmarcar o pedido ${p.numero_pedido_venda} como Pedido de Estoque?\n\nO que já entrou no saldo continua (cancele pelos Lançamentos se precisar).`)) marcarPedidoEstoque(p.numero_pedido_venda, null);
                          }}>Desmarcar</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </>
          )}
        </div>
      )}

      {/* ── Modal: lançamento manual ─────────────────────────────────────── */}
      {mLanc && (
        <Modal titulo={mLanc.tipo === 'entrada' ? 'Entrada no estoque' : mLanc.tipo === 'saida' ? 'Saída do estoque' : 'Transferência entre estoques'} onFechar={() => setMLanc(null)}>
          <div style={{ display: 'grid', gap: 10 }}>
            <div><label style={lbl}>Flange</label><ItemSelect itens={itens} value={mLanc.item_id} local={mLanc.local} onChange={id => setMLanc(v => v && { ...v, item_id: id })} /></div>
            <div style={{ display: 'flex', gap: 10 }}>
              <div style={{ flex: 1 }}><label style={lbl}>{mLanc.tipo === 'transferencia' ? 'De' : 'Local'}</label>
                <select style={inp} value={mLanc.local} onChange={e => setMLanc(v => v && { ...v, local: e.target.value, local_destino: v.tipo === 'transferencia' ? (e.target.value === 'aruja' ? 'mogi' : 'aruja') : v.local_destino })}>
                  {LOCAIS_ESTOQUE.map(l => <option key={l.cod} value={l.cod}>{l.nome}</option>)}
                </select>
              </div>
              {mLanc.tipo === 'transferencia' && (
                <div style={{ flex: 1 }}><label style={lbl}>Para</label>
                  <select style={inp} value={mLanc.local_destino} onChange={e => setMLanc(v => v && { ...v, local_destino: e.target.value })}>
                    {LOCAIS_ESTOQUE.filter(l => l.cod !== mLanc.local).map(l => <option key={l.cod} value={l.cod}>{l.nome}</option>)}
                  </select>
                </div>
              )}
              <div style={{ width: 130 }}><label style={lbl}>Quantidade</label><input style={{ ...inp, textAlign: 'right', fontWeight: 700 }} inputMode="decimal" value={mLanc.quantidade} onChange={e => setMLanc(v => v && { ...v, quantidade: e.target.value })} /></div>
            </div>
            {mLanc.item_id !== '' && itemPorId.get(mLanc.item_id) && (
              <div style={{ fontSize: 12, color: C.cinza }}>Saldo atual: Arujá <b>{fmt(itemPorId.get(mLanc.item_id)!.saldo_aruja)}</b> · Mogi <b>{fmt(itemPorId.get(mLanc.item_id)!.saldo_mogi)}</b></div>
            )}
            <div><label style={lbl}>Observação</label><input style={inp} value={mLanc.obs} onChange={e => setMLanc(v => v && { ...v, obs: e.target.value })} placeholder="ex.: NF, motivo, quem trouxe…" /></div>
            {erroModal && <div style={{ color: C.vermelho, fontSize: 13, fontWeight: 600 }}>{erroModal}</div>}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button className="pl-btn" onClick={() => setMLanc(null)}>Cancelar</button>
              <button className="pl-btn" style={{ color: '#fff', background: C.azul2, borderColor: C.azul2 }} onClick={salvarLanc} disabled={salvando}>{salvando ? 'Salvando…' : 'Salvar'}</button>
            </div>
          </div>
        </Modal>
      )}

      {/* ── Modal: cadastro de flange ────────────────────────────────────── */}
      {mItem && (
        <Modal titulo={mItem.id ? 'Editar flange' : 'Novo flange'} onFechar={() => setMItem(null)}>
          <div style={{ display: 'grid', gap: 10 }}>
            <div style={{ display: 'flex', gap: 10 }}>
              <div style={{ flex: 1 }}><label style={lbl}>Código do estoque *</label><input style={inp} value={mItem.codigo} onChange={e => setMItem(v => v && { ...v, codigo: e.target.value })} /></div>
              <div style={{ flex: 1 }}><label style={lbl}>Código no pedido (opcional)</label><input style={inp} value={mItem.codigo_pedido} onChange={e => setMItem(v => v && { ...v, codigo_pedido: e.target.value })} placeholder="ex.: 015LT020" /></div>
            </div>
            <div style={{ fontSize: 11.5, color: '#94a3b8', marginTop: -4 }}>Se o código no pedido bater com o item do pedido, o sistema já sugere este flange na baixa e na entrada de produção.</div>
            <div><label style={lbl}>Descrição *</label><input style={inp} value={mItem.descricao} onChange={e => setMItem(v => v && { ...v, descricao: e.target.value })} placeholder="ex.: FLANGE LISO SOLTO B16.5 150LBS AC 2&quot;" /></div>
            <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end' }}>
              <div style={{ width: 100 }}><label style={lbl}>Unidade</label><input style={inp} value={mItem.unidade} onChange={e => setMItem(v => v && { ...v, unidade: e.target.value })} /></div>
              <div style={{ width: 140 }}><label style={lbl}>Estoque mínimo</label><input style={{ ...inp, textAlign: 'right' }} inputMode="decimal" value={mItem.estoque_minimo} onChange={e => setMItem(v => v && { ...v, estoque_minimo: e.target.value })} /></div>
              {mItem.id && <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 600, paddingBottom: 8 }}><input type="checkbox" checked={mItem.ativo} onChange={e => setMItem(v => v && { ...v, ativo: e.target.checked })} /> Ativo</label>}
            </div>
            {erroModal && <div style={{ color: C.vermelho, fontSize: 13, fontWeight: 600 }}>{erroModal}</div>}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button className="pl-btn" onClick={() => setMItem(null)}>Cancelar</button>
              <button className="pl-btn" style={{ color: '#fff', background: C.azul2, borderColor: C.azul2 }} onClick={salvarItem} disabled={salvando}>{salvando ? 'Salvando…' : 'Salvar'}</button>
            </div>
          </div>
        </Modal>
      )}

      {/* ── Modal: movimentar peça do setor Estoque ──────────────────────── */}
      {mAtender && (() => {
        const p = mAtender.peca;
        const fab = Number(mAtender.fab.replace(',', '.')) || 0;
        const est = mAtender.origens.reduce((s, o) => s + (Number(o.quantidade.replace(',', '.')) || 0), 0);
        const total = fab + est;
        const resta = p.quantidade - total;
        const setO = (i: number, patch: Partial<{ item_id: number | ''; local: string; quantidade: string }>) =>
          setMAtender(v => v && { ...v, origens: v.origens.map((o, j) => (j === i ? { ...o, ...patch } : o)) });
        return (
          <Modal titulo={`Movimentar — pedido ${p.numero_pedido_venda}`} onFechar={() => setMAtender(null)} largura={640}>
            <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 10, padding: '8px 12px', marginBottom: 12, fontSize: 13 }}>
              <b>{p.codigo}</b> · {p.descricao}<br />
              <span style={{ color: C.cinza }}>No setor Estoque: <b>{fmt(p.quantidade)} {p.unidade}</b>{p.cliente ? ` · ${p.cliente}` : ''}</span>
            </div>

            <div style={{ fontWeight: 800, color: C.azul, fontSize: 13, marginBottom: 6 }}>De onde veio?</div>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 10, background: '#eff6ff', borderRadius: 10, padding: '8px 12px' }}>
              <div style={{ flex: 1, fontWeight: 700, color: C.azul2 }}>🔧 Fabricação aqui <span style={{ fontWeight: 500, color: C.cinza, fontSize: 12 }}>(não mexe no saldo)</span></div>
              <input style={{ ...inp, width: 110, textAlign: 'right', fontWeight: 700 }} inputMode="decimal" placeholder="0" value={mAtender.fab} onChange={e => setMAtender(v => v && { ...v, fab: e.target.value })} />
            </div>
            <div style={{ background: '#f0fdfa', borderRadius: 10, padding: '8px 12px', marginBottom: 10 }}>
              <div style={{ fontWeight: 700, color: C.teal, marginBottom: 6 }}>📦 Estoque armazenado <span style={{ fontWeight: 500, color: C.cinza, fontSize: 12 }}>(baixa o saldo)</span></div>
              {mAtender.origens.map((o, i) => {
                const it = o.item_id !== '' ? itemPorId.get(o.item_id) : undefined;
                return (
                  <div key={i} style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 6, flexWrap: 'wrap' }}>
                    <div style={{ flex: '1 1 220px' }}><ItemSelect itens={itens} value={o.item_id} local={o.local} onChange={id => setO(i, { item_id: id })} /></div>
                    <select style={{ ...inp, width: 150 }} value={o.local} onChange={e => setO(i, { local: e.target.value })}>
                      {LOCAIS_ESTOQUE.map(l => <option key={l.cod} value={l.cod}>{l.nome}{it ? ` (${fmt(saldoDe(it, l.cod))})` : ''}</option>)}
                    </select>
                    <input style={{ ...inp, width: 90, textAlign: 'right', fontWeight: 700 }} inputMode="decimal" placeholder="0" value={o.quantidade} onChange={e => setO(i, { quantidade: e.target.value })} />
                    {mAtender.origens.length > 1 && <button className="pl-btn" style={{ padding: '4px 8px', color: C.vermelho }} onClick={() => setMAtender(v => v && { ...v, origens: v.origens.filter((_, j) => j !== i) })}><i className="bi bi-trash" /></button>}
                  </div>
                );
              })}
              <button className="pl-btn" style={{ padding: '3px 10px', fontSize: 12 }} onClick={() => setMAtender(v => v && { ...v, origens: [...v.origens, { item_id: v.origens[0]?.item_id ?? '', local: v.origens[0]?.local === 'aruja' ? 'mogi' : 'aruja', quantidade: '' }] })}>
                <i className="bi bi-plus" /> Tirar também de outro local/flange
              </button>
            </div>

            <div style={{ display: 'flex', gap: 14, fontSize: 13, marginBottom: 12, flexWrap: 'wrap' }}>
              <span>Movimentar: <b style={{ color: total > p.quantidade ? C.vermelho : C.azul }}>{fmt(total)}</b></span>
              <span>Fica no setor Estoque: <b style={{ color: resta > 0 ? C.laranja : C.cinza }}>{fmt(Math.max(0, resta))}</b></span>
            </div>

            <div style={{ fontWeight: 800, color: C.azul, fontSize: 13, marginBottom: 6 }}>Enviar para</div>
            <DestinoSetorPicker setorAtual="estoque" roteiro={p.roteiro} proximoSetor={p.proximo_setor} value={mAtender.destino} onChange={d => setMAtender(v => v && { ...v, destino: d })} />
            <div style={{ marginTop: 10 }}><label style={lbl}>Observação</label><input style={inp} value={mAtender.obs} onChange={e => setMAtender(v => v && { ...v, obs: e.target.value })} /></div>

            {erroModal && <div style={{ color: C.vermelho, fontSize: 13, fontWeight: 600, marginTop: 10 }}>{erroModal}</div>}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 12 }}>
              <button className="pl-btn" onClick={() => setMAtender(null)}>Cancelar</button>
              <button className="pl-btn" style={{ color: '#fff', background: C.teal, borderColor: C.teal }} onClick={confirmarAtender} disabled={salvando}>
                {salvando ? 'Movimentando…' : `Movimentar ${fmt(total)} → ${nomeSetor(mAtender.destino)}`}
              </button>
            </div>
          </Modal>
        );
      })()}

      {/* ── Modal: vincular produção sem cadastro ────────────────────────── */}
      {mVinc && (
        <Modal titulo="Vincular produção ao flange" onFechar={() => setMVinc(null)}>
          <div style={{ fontSize: 13, marginBottom: 10 }}>
            Pedido <b>{mVinc.pend.numero_pedido_venda}</b> · {mVinc.pend.codigo} · {mVinc.pend.descricao}<br />
            Entra <b>{fmt(mVinc.pend.quantidade)}</b> no <b>{nomeLocal(mVinc.pend.local)}</b>.
          </div>
          <label style={lbl}>Qual flange do cadastro é esse?</label>
          <ItemSelect itens={itens} value={mVinc.item_id} onChange={id => setMVinc(v => v && { ...v, item_id: id })} />
          <div style={{ fontSize: 11.5, color: '#94a3b8', marginTop: 4 }}>Se o flange ainda não tem “código no pedido”, ele passa a ter {mVinc.pend.codigo} — da próxima vez entra sozinho.</div>
          {erroModal && <div style={{ color: C.vermelho, fontSize: 13, fontWeight: 600, marginTop: 8 }}>{erroModal}</div>}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 12 }}>
            <button className="pl-btn" onClick={() => setMVinc(null)}>Cancelar</button>
            <button className="pl-btn" style={{ color: '#fff', background: C.azul2, borderColor: C.azul2 }} onClick={salvarVinculo} disabled={salvando}>{salvando ? 'Salvando…' : 'Lançar entrada'}</button>
          </div>
        </Modal>
      )}
    </section>
  );
}
