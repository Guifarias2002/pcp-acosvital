'use client';
import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import AuthGuard from '@/components/AuthGuard';
import {
  getRomaneios, getRomaneio, criarRomaneio, salvarRomaneio, excluirRomaneio, getRomaneioDisponiveis,
} from '@/lib/api';
import { getUser, podeVerRomaneios } from '@/lib/auth';

interface RomaneioLista {
  id: number; numero: number; codigo: string; origem: string; destino: string;
  data_carregamento: string | null; placa: string | null; motorista: string | null;
  status: string; criado_por_nome: string | null; criado_em: string;
  itens: number; conferidos: number; pecas: number;
}
interface ItemRom {
  id?: number; pedido: string; descricao: string; categoria: string; finalidade: string;
  unidade: string; quantidade: string; conferido: boolean; item_pedido_id: number | null;
}
interface Disponivel {
  item_pedido_id: number; pedido: string; codigo: string; descricao: string;
  unidade: string | null; quantidade: number; setor_atual: string;
}

const CARD = { background: '#fff', border: '1px solid #e5e7eb', borderRadius: 10, boxShadow: '0 1px 2px rgba(0,0,0,.04)' } as const;
const LABEL = { display: 'block', fontSize: 11.5, fontWeight: 700, color: '#334155', marginBottom: 4 } as const;
const INPUT = { width: '100%', border: '1px solid #cbd5e1', borderRadius: 6, padding: '8px 10px', fontSize: 13.5, color: '#1a3a5c', background: '#fff', boxSizing: 'border-box' as const };
const CIN = { border: '1px solid #cbd5e1', borderRadius: 5, padding: '5px 7px', fontSize: 12.5, width: '100%', boxSizing: 'border-box' as const };

function hoje() { return new Date().toISOString().slice(0, 10); }
function fmtData(s: string | null) {
  if (!s) return '—';
  const d = new Date(s.length <= 10 ? s + 'T12:00:00' : s);
  return isNaN(d.getTime()) ? '—' : d.toLocaleDateString('pt-BR');
}
function itemVazio(): ItemRom {
  return { pedido: '', descricao: '', categoria: 'Produção', finalidade: 'Produto Acabado', unidade: 'PC', quantidade: '', conferido: false, item_pedido_id: null };
}

export default function LogisticaPage() {
  const [view, setView] = useState<'lista' | 'editor'>('lista');
  const [romaneios, setRomaneios] = useState<RomaneioLista[]>([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const router = useRouter();

  // Editor
  const [id, setId] = useState<number | null>(null);
  const [codigo, setCodigo] = useState<string>('(novo)');
  const [status, setStatus] = useState<'aberto' | 'fechado'>('aberto');
  const [cab, setCab] = useState({
    origem: 'HRM', destino: 'Aços Vital', data_carregamento: hoje(), placa: '', motorista: '',
    setor_descarga: 'Produto acabado', finalidade: 'Produto Acabado',
    operador_separacao: '', conferente_carregamento: '', conferente_descarga: '', observacao: '',
  });
  const [itens, setItens] = useState<ItemRom[]>([]);
  const [salvando, setSalvando] = useState(false);

  // Picker "puxar do sistema"
  const [pickerAberto, setPickerAberto] = useState(false);
  const [pv, setPv] = useState('');
  const [disp, setDisp] = useState<Disponivel[]>([]);
  const [dispLoad, setDispLoad] = useState(false);
  const [sel, setSel] = useState<Record<number, boolean>>({});

  useEffect(() => {
    if (!podeVerRomaneios(getUser())) router.replace('/');
  }, [router]);

  const carregar = useCallback(() => {
    getRomaneios()
      .then(d => { setRomaneios(d.romaneios || []); setErro(null); })
      .catch(() => setErro('Não foi possível carregar os romaneios.'))
      .finally(() => setLoading(false));
  }, []);
  useEffect(() => { carregar(); }, [carregar]);

  function novo() {
    setId(null); setCodigo('(novo)'); setStatus('aberto');
    setCab({
      origem: 'HRM', destino: 'Aços Vital', data_carregamento: hoje(), placa: '', motorista: '',
      setor_descarga: 'Produto acabado', finalidade: 'Produto Acabado',
      operador_separacao: '', conferente_carregamento: '', conferente_descarga: '', observacao: '',
    });
    setItens([]); setErro(null); setView('editor');
  }

  async function abrir(r: RomaneioLista) {
    setErro(null);
    try {
      const d = await getRomaneio(r.id);
      const rm = d.romaneio;
      setId(rm.id); setCodigo(rm.codigo); setStatus(rm.status === 'fechado' ? 'fechado' : 'aberto');
      setCab({
        origem: rm.origem || 'HRM', destino: rm.destino || 'Aços Vital',
        data_carregamento: rm.data_carregamento ? String(rm.data_carregamento).slice(0, 10) : hoje(),
        placa: rm.placa || '', motorista: rm.motorista || '',
        setor_descarga: rm.setor_descarga || 'Produto acabado', finalidade: rm.finalidade || 'Produto Acabado',
        operador_separacao: rm.operador_separacao || '', conferente_carregamento: rm.conferente_carregamento || '',
        conferente_descarga: rm.conferente_descarga || '', observacao: rm.observacao || '',
      });
      setItens((d.itens || []).map((it: Record<string, unknown>) => ({
        id: it.id as number, pedido: (it.pedido as string) || '', descricao: (it.descricao as string) || '',
        categoria: (it.categoria as string) || 'Produção', finalidade: (it.finalidade as string) || 'Produto Acabado',
        unidade: (it.unidade as string) || '', quantidade: it.quantidade == null ? '' : String(it.quantidade),
        conferido: it.conferido === true, item_pedido_id: (it.item_pedido_id as number) ?? null,
      })));
      setView('editor');
    } catch { setErro('Erro ao abrir o romaneio.'); }
  }

  const setItem = (i: number, campo: keyof ItemRom, valor: string | boolean) =>
    setItens(arr => arr.map((it, idx) => idx === i ? { ...it, [campo]: valor } : it));
  const removerItem = (i: number) => setItens(arr => arr.filter((_, idx) => idx !== i));

  function payload(extra?: Record<string, unknown>) {
    return {
      ...cab,
      itens: itens.map(it => ({
        pedido: it.pedido, descricao: it.descricao, categoria: it.categoria, finalidade: it.finalidade,
        unidade: it.unidade, quantidade: it.quantidade === '' ? null : Number(it.quantidade),
        conferido: it.conferido, item_pedido_id: it.item_pedido_id,
      })),
      ...extra,
    };
  }

  async function salvar(extra?: Record<string, unknown>): Promise<number | null> {
    if (itens.some(it => !it.descricao.trim())) { setErro('Há item sem descrição. Preencha ou remova.'); return null; }
    setSalvando(true); setErro(null);
    try {
      if (id == null) {
        const d = (await criarRomaneio(payload(extra))) as { romaneio: { id: number; codigo: string; status: string } };
        setId(d.romaneio.id); setCodigo(d.romaneio.codigo);
        if (extra?.status) setStatus(extra.status as 'aberto' | 'fechado');
        carregar();
        return d.romaneio.id;
      } else {
        await salvarRomaneio(id, payload(extra));
        if (extra?.status) setStatus(extra.status as 'aberto' | 'fechado');
        carregar();
        return id;
      }
    } catch { setErro('Erro ao salvar o romaneio.'); return null; }
    finally { setSalvando(false); }
  }

  async function fechar() {
    if (!window.confirm('Fechar o romaneio? Ele fica registrado como emitido (você ainda pode reabrir).')) return;
    await salvar({ status: 'fechado' });
  }
  async function reabrir() { await salvar({ status: 'aberto' }); }

  async function imprimir() {
    // Garante que está salvo (pra ter código) antes de imprimir.
    if (id == null) { const novoId = await salvar(); if (novoId == null) return; }
    setTimeout(() => window.print(), 60);
  }

  async function excluir(r: RomaneioLista) {
    if (!window.confirm(`Excluir o romaneio ${r.codigo}?`)) return;
    try { await excluirRomaneio(r.id); carregar(); } catch { setErro('Erro ao excluir.'); }
  }

  // Picker
  async function abrirPicker() {
    setPickerAberto(true); setPv(''); setSel({}); buscarDisp('');
  }
  async function buscarDisp(termo: string) {
    setDispLoad(true);
    try { const d = await getRomaneioDisponiveis(termo || undefined); setDisp(d.itens || []); }
    catch { setDisp([]); } finally { setDispLoad(false); }
  }
  function adicionarSelecionados() {
    const novos = disp.filter(d => sel[d.item_pedido_id]).map<ItemRom>(d => ({
      pedido: d.pedido || '', descricao: d.descricao || '', categoria: 'Produção', finalidade: 'Produto Acabado',
      unidade: d.unidade || 'PC', quantidade: d.quantidade == null ? '' : String(d.quantidade),
      conferido: false, item_pedido_id: d.item_pedido_id,
    }));
    setItens(arr => [...arr, ...novos]);
    setPickerAberto(false);
  }

  const pedidosDoRomaneio = Array.from(new Set(itens.map(it => it.pedido).filter(Boolean))).join(', ');
  const totalPecas = itens.reduce((s, it) => s + (it.quantidade === '' ? 0 : Number(it.quantidade) || 0), 0);
  const conferidos = itens.filter(it => it.conferido).length;

  // ── LISTA ──────────────────────────────────────────────────────────────────
  if (view === 'lista') {
    return (
      <AuthGuard>
        {erro && <Erro msg={erro} onClose={() => setErro(null)} />}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14, flexWrap: 'wrap', gap: 10 }}>
          <div>
            <h4 style={{ margin: 0, fontWeight: 700, color: '#1a3a5c', fontSize: 20 }}>
              <i className="bi bi-truck" style={{ marginRight: 8, color: '#1d4ed8' }} />Logística — Romaneios de Carga
            </h4>
            <small style={{ color: '#888' }}>Monte, confira e imprima os romaneios de transferência de materiais.</small>
          </div>
          <button onClick={novo}
            style={{ background: '#1d4ed8', color: '#fff', border: 'none', borderRadius: 6, padding: '10px 18px', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>
            <i className="bi bi-plus-lg" style={{ marginRight: 6 }} />Novo romaneio
          </button>
        </div>

        {loading ? <div style={{ color: '#64748b', fontSize: 13 }}>Carregando…</div>
          : romaneios.length === 0 ? (
            <div style={{ ...CARD, padding: '22px 20px', textAlign: 'center', fontSize: 14, color: '#64748b' }}>
              Nenhum romaneio ainda. Clique em “Novo romaneio”.
            </div>
          ) : (
            <div style={{ ...CARD, overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13.5 }}>
                <thead>
                  <tr style={{ color: '#64748b', textAlign: 'left', fontSize: 11.5, textTransform: 'uppercase', letterSpacing: .3, background: '#f8fafc' }}>
                    <th style={{ padding: '10px 12px' }}>Código</th>
                    <th style={{ padding: '10px 12px' }}>Carregamento</th>
                    <th style={{ padding: '10px 12px' }}>Origem → Destino</th>
                    <th style={{ padding: '10px 12px' }}>Placa / Motorista</th>
                    <th style={{ padding: '10px 12px', textAlign: 'right' }}>Itens</th>
                    <th style={{ padding: '10px 12px' }}>Situação</th>
                    <th style={{ padding: '10px 12px' }}></th>
                  </tr>
                </thead>
                <tbody>
                  {romaneios.map(r => (
                    <tr key={r.id} style={{ borderTop: '1px solid #eef2f7', cursor: 'pointer' }} onClick={() => abrir(r)}>
                      <td style={{ padding: '10px 12px', fontWeight: 700, color: '#1a3a5c', whiteSpace: 'nowrap' }}>{r.codigo}</td>
                      <td style={{ padding: '10px 12px', whiteSpace: 'nowrap', color: '#475569' }}>{fmtData(r.data_carregamento)}</td>
                      <td style={{ padding: '10px 12px', color: '#334155', whiteSpace: 'nowrap' }}>{r.origem} → {r.destino}</td>
                      <td style={{ padding: '10px 12px', color: '#334155' }}>{r.placa || '—'}{r.motorista ? ` · ${r.motorista}` : ''}</td>
                      <td style={{ padding: '10px 12px', textAlign: 'right', color: '#475569' }}>{r.conferidos}/{r.itens}</td>
                      <td style={{ padding: '10px 12px' }}>
                        {r.status === 'fechado'
                          ? <span style={{ fontSize: 12, fontWeight: 700, color: '#16a34a', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 999, padding: '3px 10px' }}>Fechado</span>
                          : <span style={{ fontSize: 12, fontWeight: 700, color: '#b45309', background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: 999, padding: '3px 10px' }}>Aberto</span>}
                      </td>
                      <td style={{ padding: '10px 12px', textAlign: 'right' }} onClick={e => e.stopPropagation()}>
                        <button onClick={() => excluir(r)} title="Excluir" style={{ background: 'none', border: 'none', color: '#dc2626', cursor: 'pointer', fontSize: 15 }}>
                          <i className="bi bi-trash3" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
      </AuthGuard>
    );
  }

  // ── EDITOR ─────────────────────────────────────────────────────────────────
  const bloqueado = status === 'fechado';
  return (
    <AuthGuard>
      <style>{`
        @media print {
          #sidebar, #sidebar-overlay, .topbar, .no-print { display: none !important; }
          #conteudo, main, body { margin: 0 !important; padding: 0 !important; background: #fff !important; }
          .print-only { display: block !important; }
        }
        .print-only { display: none; }
      `}</style>

      {erro && <Erro msg={erro} onClose={() => setErro(null)} />}

      {/* Barra de ações (tela) */}
      <div className="no-print" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', marginBottom: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button onClick={() => setView('lista')} style={{ background: 'none', border: '1px solid #cbd5e1', borderRadius: 6, padding: '8px 12px', fontSize: 13, color: '#334155', cursor: 'pointer' }}>
            <i className="bi bi-arrow-left" style={{ marginRight: 6 }} />Voltar
          </button>
          <div>
            <div style={{ fontWeight: 800, color: '#1a3a5c', fontSize: 18 }}>{codigo}</div>
            <div style={{ fontSize: 12, color: bloqueado ? '#16a34a' : '#b45309', fontWeight: 700 }}>{bloqueado ? 'Fechado / emitido' : 'Aberto — em montagem'}</div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button onClick={() => salvar()} disabled={salvando} style={{ background: '#fff', color: '#1d4ed8', border: '1px solid #1d4ed8', borderRadius: 6, padding: '9px 16px', fontSize: 13.5, fontWeight: 700, cursor: 'pointer' }}>
            <i className="bi bi-save" style={{ marginRight: 6 }} />{salvando ? 'Salvando…' : 'Salvar'}
          </button>
          {!bloqueado
            ? <button onClick={fechar} disabled={salvando} style={{ background: '#16a34a', color: '#fff', border: 'none', borderRadius: 6, padding: '9px 16px', fontSize: 13.5, fontWeight: 700, cursor: 'pointer' }}>
                <i className="bi bi-check2-circle" style={{ marginRight: 6 }} />Fechar romaneio
              </button>
            : <button onClick={reabrir} disabled={salvando} style={{ background: '#fff', color: '#b45309', border: '1px solid #fed7aa', borderRadius: 6, padding: '9px 16px', fontSize: 13.5, fontWeight: 700, cursor: 'pointer' }}>
                <i className="bi bi-arrow-counterclockwise" style={{ marginRight: 6 }} />Reabrir
              </button>}
          <button onClick={imprimir} style={{ background: '#1a3a5c', color: '#fff', border: 'none', borderRadius: 6, padding: '9px 16px', fontSize: 13.5, fontWeight: 700, cursor: 'pointer' }}>
            <i className="bi bi-printer" style={{ marginRight: 6 }} />Imprimir
          </button>
        </div>
      </div>

      {/* Cabeçalho (formulário) */}
      <div className="no-print" style={{ ...CARD, padding: 16, marginBottom: 16 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 12 }}>
          <Campo label="Origem do material"><input style={INPUT} value={cab.origem} onChange={e => setCab({ ...cab, origem: e.target.value })} /></Campo>
          <Campo label="Destino do material"><input style={INPUT} value={cab.destino} onChange={e => setCab({ ...cab, destino: e.target.value })} /></Campo>
          <Campo label="Data de carregamento"><input type="date" style={INPUT} value={cab.data_carregamento} onChange={e => setCab({ ...cab, data_carregamento: e.target.value })} /></Campo>
          <Campo label="Placa do veículo"><input style={INPUT} value={cab.placa} onChange={e => setCab({ ...cab, placa: e.target.value })} placeholder="ABC1D23" /></Campo>
          <Campo label="Motorista"><input style={INPUT} value={cab.motorista} onChange={e => setCab({ ...cab, motorista: e.target.value })} /></Campo>
          <Campo label="Setor para descarga"><input style={INPUT} value={cab.setor_descarga} onChange={e => setCab({ ...cab, setor_descarga: e.target.value })} /></Campo>
          <Campo label="Finalidade do material"><input style={INPUT} value={cab.finalidade} onChange={e => setCab({ ...cab, finalidade: e.target.value })} /></Campo>
        </div>
      </div>

      {/* Itens */}
      <div className="no-print" style={{ ...CARD, padding: 16, marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
          <div style={{ fontWeight: 700, color: '#1a3a5c', fontSize: 15 }}>
            <i className="bi bi-box-seam" style={{ marginRight: 7 }} />Itens da carga
            <span style={{ fontWeight: 500, color: '#94a3b8', fontSize: 12.5, marginLeft: 8 }}>{itens.length} item(ns) · {totalPecas.toLocaleString('pt-BR')} peça(s) · {conferidos} conferido(s)</span>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={abrirPicker} style={{ background: '#eef2ff', color: '#1d4ed8', border: '1px solid #c7d2fe', borderRadius: 6, padding: '7px 12px', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
              <i className="bi bi-search" style={{ marginRight: 6 }} />Puxar do sistema
            </button>
            <button onClick={() => setItens(a => [...a, itemVazio()])} style={{ background: '#fff', color: '#334155', border: '1px solid #cbd5e1', borderRadius: 6, padding: '7px 12px', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
              <i className="bi bi-plus-lg" style={{ marginRight: 6 }} />Linha manual
            </button>
          </div>
        </div>

        {itens.length === 0 ? (
          <div style={{ color: '#64748b', fontSize: 13, padding: '8px 0' }}>Nenhum item. Use “Puxar do sistema” ou “Linha manual”.</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, minWidth: 760 }}>
              <thead>
                <tr style={{ color: '#64748b', textAlign: 'left', fontSize: 11, textTransform: 'uppercase', background: '#f8fafc' }}>
                  <th style={{ padding: '7px 8px', width: 44 }}>Conf.</th>
                  <th style={{ padding: '7px 8px', width: 110 }}>Pedido</th>
                  <th style={{ padding: '7px 8px' }}>Descrição do item</th>
                  <th style={{ padding: '7px 8px', width: 110 }}>Categoria</th>
                  <th style={{ padding: '7px 8px', width: 130 }}>Finalidade</th>
                  <th style={{ padding: '7px 8px', width: 64 }}>Un.</th>
                  <th style={{ padding: '7px 8px', width: 80 }}>Qtd</th>
                  <th style={{ padding: '7px 8px', width: 36 }}></th>
                </tr>
              </thead>
              <tbody>
                {itens.map((it, i) => (
                  <tr key={i} style={{ borderTop: '1px solid #eef2f7', background: it.conferido ? '#f0fdf4' : undefined }}>
                    <td style={{ padding: '6px 8px', textAlign: 'center' }}>
                      <input type="checkbox" checked={it.conferido} onChange={e => setItem(i, 'conferido', e.target.checked)} style={{ width: 17, height: 17, cursor: 'pointer' }} />
                    </td>
                    <td style={{ padding: '6px 8px' }}><input style={CIN} value={it.pedido} onChange={e => setItem(i, 'pedido', e.target.value)} /></td>
                    <td style={{ padding: '6px 8px' }}><input style={CIN} value={it.descricao} onChange={e => setItem(i, 'descricao', e.target.value)} /></td>
                    <td style={{ padding: '6px 8px' }}><input style={CIN} value={it.categoria} onChange={e => setItem(i, 'categoria', e.target.value)} /></td>
                    <td style={{ padding: '6px 8px' }}><input style={CIN} value={it.finalidade} onChange={e => setItem(i, 'finalidade', e.target.value)} /></td>
                    <td style={{ padding: '6px 8px' }}><input style={CIN} value={it.unidade} onChange={e => setItem(i, 'unidade', e.target.value)} /></td>
                    <td style={{ padding: '6px 8px' }}><input type="number" min={0} style={{ ...CIN, textAlign: 'right' }} value={it.quantidade} onChange={e => setItem(i, 'quantidade', e.target.value)} /></td>
                    <td style={{ padding: '6px 8px', textAlign: 'center' }}>
                      <button onClick={() => removerItem(i)} title="Remover" style={{ background: 'none', border: 'none', color: '#dc2626', cursor: 'pointer', fontSize: 14 }}><i className="bi bi-x-lg" /></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Assinaturas / recebimento (edição) */}
      <div className="no-print" style={{ ...CARD, padding: 16, marginBottom: 16 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
          <Campo label="Operador de separação"><input style={INPUT} value={cab.operador_separacao} onChange={e => setCab({ ...cab, operador_separacao: e.target.value })} /></Campo>
          <Campo label="Conferente de carregamento"><input style={INPUT} value={cab.conferente_carregamento} onChange={e => setCab({ ...cab, conferente_carregamento: e.target.value })} /></Campo>
          <Campo label="Conferente de descarga"><input style={INPUT} value={cab.conferente_descarga} onChange={e => setCab({ ...cab, conferente_descarga: e.target.value })} /></Campo>
        </div>
        <div style={{ marginTop: 12 }}>
          <Campo label="Observação (em caso de inconformidade)"><textarea rows={2} style={{ ...INPUT, resize: 'vertical' }} value={cab.observacao} onChange={e => setCab({ ...cab, observacao: e.target.value })} /></Campo>
        </div>
      </div>

      {/* ── LAYOUT DE IMPRESSÃO (igual ao PDF) ─────────────────────────────── */}
      <RomaneioImpresso codigo={codigo} cab={cab} itens={itens} pedidos={pedidosDoRomaneio} />

      {/* Modal: puxar do sistema */}
      {pickerAberto && (
        <div className="no-print" onClick={() => setPickerAberto(false)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)', zIndex: 10000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: 12, padding: 18, width: '100%', maxWidth: 720, maxHeight: '86vh', display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <h5 style={{ margin: 0, fontWeight: 700, color: '#1a3a5c' }}><i className="bi bi-search" style={{ marginRight: 8 }} />Puxar itens do sistema</h5>
              <button onClick={() => setPickerAberto(false)} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: '#888' }}>✕</button>
            </div>
            <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
              <input style={{ ...INPUT, flex: 1 }} placeholder="Buscar por Pedido de Venda (deixe vazio p/ ver os prontos)" value={pv}
                onChange={e => setPv(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') buscarDisp(pv); }} />
              <button onClick={() => buscarDisp(pv)} style={{ background: '#1d4ed8', color: '#fff', border: 'none', borderRadius: 6, padding: '0 16px', fontSize: 13.5, fontWeight: 700, cursor: 'pointer' }}>Buscar</button>
            </div>
            <div style={{ fontSize: 11.5, color: '#94a3b8', marginBottom: 8 }}>
              {pv ? 'Itens do PV informado.' : 'Prontos pra expedir (quarentena / embalagem / logística).'}
            </div>
            <div style={{ overflowY: 'auto', flex: 1, border: '1px solid #eef2f7', borderRadius: 8 }}>
              {dispLoad ? <div style={{ padding: 16, color: '#64748b', fontSize: 13 }}>Carregando…</div>
                : disp.length === 0 ? <div style={{ padding: 16, color: '#64748b', fontSize: 13 }}>Nada encontrado.</div>
                  : (
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
                      <thead><tr style={{ color: '#64748b', textAlign: 'left', fontSize: 11, textTransform: 'uppercase', background: '#f8fafc', position: 'sticky', top: 0 }}>
                        <th style={{ padding: '6px 8px', width: 34 }}></th>
                        <th style={{ padding: '6px 8px' }}>PV</th>
                        <th style={{ padding: '6px 8px' }}>Descrição</th>
                        <th style={{ padding: '6px 8px' }}>Setor</th>
                        <th style={{ padding: '6px 8px', textAlign: 'right' }}>Qtd</th>
                      </tr></thead>
                      <tbody>
                        {disp.map(d => (
                          <tr key={d.item_pedido_id} style={{ borderTop: '1px solid #eef2f7', cursor: 'pointer' }}
                            onClick={() => setSel(s => ({ ...s, [d.item_pedido_id]: !s[d.item_pedido_id] }))}>
                            <td style={{ padding: '6px 8px', textAlign: 'center' }}><input type="checkbox" readOnly checked={!!sel[d.item_pedido_id]} style={{ width: 16, height: 16 }} /></td>
                            <td style={{ padding: '6px 8px', fontWeight: 700, color: '#1a3a5c', whiteSpace: 'nowrap' }}>{d.pedido}</td>
                            <td style={{ padding: '6px 8px', color: '#334155' }}>{d.descricao}</td>
                            <td style={{ padding: '6px 8px', color: '#64748b' }}>{d.setor_atual}</td>
                            <td style={{ padding: '6px 8px', textAlign: 'right' }}>{d.quantidade} {d.unidade || ''}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 12 }}>
              <button onClick={() => setPickerAberto(false)} style={{ background: '#f0f0f0', color: '#333', border: 'none', borderRadius: 6, padding: '9px 16px', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Cancelar</button>
              <button onClick={adicionarSelecionados} disabled={Object.values(sel).every(v => !v)}
                style={{ background: Object.values(sel).some(v => v) ? '#1d4ed8' : '#9ca3af', color: '#fff', border: 'none', borderRadius: 6, padding: '9px 18px', fontSize: 13.5, fontWeight: 700, cursor: 'pointer' }}>
                Adicionar selecionados
              </button>
            </div>
          </div>
        </div>
      )}
    </AuthGuard>
  );
}

// ── Componentes auxiliares ─────────────────────────────────────────────────────
function Campo({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><label style={LABEL}>{label}</label>{children}</div>;
}
function Erro({ msg, onClose }: { msg: string; onClose: () => void }) {
  return (
    <div className="no-print" style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#dc2626', borderRadius: 8, padding: '12px 16px', fontSize: 13, marginBottom: 16 }}>
      <i className="bi bi-exclamation-triangle" style={{ marginRight: 6 }} />{msg}
      <button onClick={onClose} style={{ float: 'right', background: 'none', border: 'none', cursor: 'pointer', color: '#dc2626', fontWeight: 700 }}>×</button>
    </div>
  );
}

// Layout de impressão que reproduz o romaneio de carga (só aparece no print).
function RomaneioImpresso({ codigo, cab, itens, pedidos }: {
  codigo: string;
  cab: { origem: string; destino: string; data_carregamento: string; placa: string; motorista: string; setor_descarga: string; finalidade: string; operador_separacao: string; conferente_carregamento: string; conferente_descarga: string; observacao: string };
  itens: ItemRom[];
  pedidos: string;
}) {
  const cell: React.CSSProperties = { border: '1px solid #999', padding: '5px 8px', fontSize: 11, verticalAlign: 'top' };
  const lbl: React.CSSProperties = { ...cell, fontWeight: 700, background: '#f3f4f6', whiteSpace: 'nowrap' };
  const th: React.CSSProperties = { border: '1px solid #7a1f1f', padding: '5px 8px', fontSize: 10.5, background: '#8b2020', color: '#fff', textAlign: 'left' };
  const td: React.CSSProperties = { border: '1px solid #bbb', padding: '5px 8px', fontSize: 10.5 };
  return (
    <div className="print-only" style={{ color: '#111', fontFamily: 'Arial, sans-serif' }}>
      {/* Título */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '3px solid #8b2020', paddingBottom: 8, marginBottom: 12 }}>
        <div style={{ fontWeight: 800, color: '#8b2020', fontSize: 13 }}>HRM<br /><span style={{ fontWeight: 400, color: '#555', fontSize: 9 }}>Caldeiraria e Aço em Geral</span></div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontWeight: 800, color: '#8b2020', fontSize: 20, letterSpacing: .5 }}>ROMANEIO DE CARGA</div>
          <div style={{ color: '#555', fontSize: 10 }}>Transferência de materiais</div>
          <div style={{ fontWeight: 800, fontSize: 13, marginTop: 2 }}>{codigo}</div>
        </div>
      </div>

      {/* Cabeçalho */}
      <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 12 }}>
        <tbody>
          <tr>
            <td style={lbl}>Origem do material</td><td style={cell}>{cab.origem}</td>
            <td style={lbl}>Destino do material</td><td style={cell}>{cab.destino}</td>
          </tr>
          <tr>
            <td style={lbl}>Data de carregamento</td><td style={cell}>{fmtData(cab.data_carregamento)}</td>
            <td style={lbl}>Pedido(s) de venda</td><td style={cell}>{pedidos || '—'}</td>
          </tr>
          <tr>
            <td style={lbl}>Placa do veículo</td><td style={cell}>{cab.placa || '—'}</td>
            <td style={lbl}>Motorista</td><td style={cell}>{cab.motorista || '—'}</td>
          </tr>
          <tr>
            <td style={lbl}>Setor para descarga</td><td style={cell}>{cab.setor_descarga || '—'}</td>
            <td style={lbl}>Finalidade do material</td><td style={cell}>{cab.finalidade || '—'}</td>
          </tr>
        </tbody>
      </table>

      {/* Itens */}
      <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 14 }}>
        <thead>
          <tr>
            <th style={th}>Pedido</th><th style={th}>Descrição do item</th><th style={th}>Categoria</th>
            <th style={th}>Finalidade</th><th style={th}>Un.</th><th style={{ ...th, textAlign: 'right' }}>Quantidade</th>
          </tr>
        </thead>
        <tbody>
          {itens.map((it, i) => (
            <tr key={i}>
              <td style={td}>{it.pedido || '—'}</td>
              <td style={td}>{it.descricao}</td>
              <td style={td}>{it.categoria}</td>
              <td style={td}>{it.finalidade}</td>
              <td style={td}>{it.unidade}</td>
              <td style={{ ...td, textAlign: 'right' }}>{it.quantidade}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Recebimento */}
      <div style={{ fontWeight: 700, fontSize: 11, marginBottom: 4 }}>RECEBIMENTO</div>
      <div style={{ display: 'flex', gap: 30, fontSize: 11, marginBottom: 6 }}>
        <span>☐ Material recebido corretamente</span><span>☐ Material inconforme</span>
      </div>
      <div style={{ fontSize: 10, color: '#555', marginBottom: 2 }}>OBSERVAÇÃO EM CASO DE INCONFORMIDADE</div>
      <div style={{ border: '1px solid #bbb', minHeight: 40, fontSize: 11, padding: 6, marginBottom: 26 }}>{cab.observacao || ''}</div>

      {/* Assinaturas */}
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 24, textAlign: 'center', fontSize: 10.5 }}>
        {[['OPERADOR DE SEPARAÇÃO', cab.operador_separacao], ['CONFERENTE CARREGAMENTO', cab.conferente_carregamento], ['CONFERENTE DESCARGA', cab.conferente_descarga]].map(([t, v], i) => (
          <div key={i} style={{ flex: 1 }}>
            <div style={{ borderTop: '1px solid #333', margin: '0 8px', paddingTop: 4, fontWeight: 700 }}>{t}</div>
            <div style={{ color: '#555' }}>{v || ''}</div>
          </div>
        ))}
      </div>

      <div style={{ marginTop: 24, borderTop: '1px solid #ddd', paddingTop: 6, fontSize: 8.5, color: '#888', textAlign: 'center' }}>
        HRM Caldeiraria e Aço em Geral — ISO 9001:2015 · {codigo} · Emitido em {new Date().toLocaleString('pt-BR')}
      </div>
    </div>
  );
}
