'use client';
import { useRef, useState } from 'react';
import { postIdempotente } from '@/lib/api';
import { AREAS_CALD, UNIDADES_CALD, PRIORIDADES_CALD } from '@/lib/caldPlano';
import { C, Modal, Campo, PRIO, erroDe, SeletorEmpresa, CampoValor, calcTotal, calcUnit, qtdNum, fmtBRL } from './comum';

// Roteiro sugerido pra um item novo (o planejador ajusta depois).
const ROTEIRO_PADRAO = ['corte', 'montagem', 'solda', 'acabamento', 'inspecao'];

interface ItemForm { material: string; quantidade: string; unidade: string; valor: number | null; unit: number | null; areas: string[] }
const itemVazio = (areas: string[]): ItemForm => ({ material: '', quantidade: '', unidade: 'pç', valor: null, unit: null, areas: [...areas] });

// Importar Excel: mesmo modelo da planilha do Flange (/pedidos/novo) —
// cabeçalho na linha 3, dados a partir da linha 4: A=código, B=descrição,
// C=quantidade, D=unidade (opcional), F=valor unitário.
const MAX_ITENS_IMPORTACAO = 500;
const UN_EXCEL: Record<string, string> = { PC: 'pç', 'PÇ': 'pç', PCS: 'pç', UN: 'pç', UND: 'pç', KG: 'kg', M: 'm', MT: 'm', CJ: 'conj', CONJ: 'conj', M2: 'm²', 'M²': 'm²' };
function numExcel(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  let s = String(v ?? '').replace(/R\$|\s/g, '');
  if (!s) return null;
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');   // 1.234,56 → 1234.56
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

export default function LancarModal({ onFechar, onLancado, vendedores, clientes, verValores }: {
  onFechar: () => void;
  onLancado: (qtd: number) => void;
  vendedores: string[];
  clientes: string[];
  verValores: boolean;
}) {
  const [pedido, setPedido] = useState('');
  const [empresa, setEmpresa] = useState<string | null>(null);
  const [vendedor, setVendedor] = useState('');
  const [cliente, setCliente] = useState('');
  const [prioridade, setPrioridade] = useState('normal');
  const [prazo, setPrazo] = useState('');
  const [prevFat, setPrevFat] = useState('');
  const [obs, setObs] = useState('');
  const [itens, setItens] = useState<ItemForm[]>([itemVazio(ROTEIRO_PADRAO)]);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importando, setImportando] = useState(false);

  async function importarExcel(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (fileInputRef.current) fileInputRef.current.value = '';
    if (!file) return;
    setImportando(true);
    setErro('');
    try {
      const { read, utils } = await import('xlsx');
      const wb = read(await file.arrayBuffer(), { type: 'array' });
      const rows: unknown[][] = utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: '' });
      const dataRows = rows.slice(3).filter(r => String(r[0] ?? '').trim() || String(r[1] ?? '').trim());
      if (!dataRows.length) { setErro('Nenhum item na planilha. Os dados devem começar na linha 4.'); return; }
      if (dataRows.length > MAX_ITENS_IMPORTACAO) {
        setErro(`A planilha tem ${dataRows.length} linhas — não parece o modelo esperado (código, descrição, qtd, ..., valor unit., a partir da linha 4).`);
        return;
      }
      const areasBase = itens[itens.length - 1]?.areas || ROTEIRO_PADRAO;
      const novos: ItemForm[] = dataRows.map(r => {
        const codigo = String(r[0] ?? '').trim();
        const descricao = String(r[1] ?? '').trim();
        const q = qtdNum(numExcel(r[2]));
        const unit = numExcel(r[5]);
        return {
          material: descricao || codigo,
          quantidade: q ? String(q) : '',
          unidade: UN_EXCEL[String(r[3] ?? '').trim().toUpperCase()] || 'pç',
          unit,
          valor: calcTotal(unit, q),
          areas: [...areasBase],
        };
      });
      // Mantém os itens já digitados; descarta só as linhas em branco.
      setItens(v => [...v.filter(i => i.material.trim()), ...novos]);
    } catch {
      setErro('Erro ao ler o arquivo. Confirme que é um .xlsx válido.');
    } finally {
      setImportando(false);
    }
  }

  const preenchidos = itens.filter(i => i.material.trim());
  const nItens = preenchidos.length;
  const totalPedido = preenchidos.reduce((s, i) => s + (i.valor ?? 0), 0);

  const alterar = (i: number, p: Partial<ItemForm>) => setItens(v => v.map((it, k) => (k === i ? { ...it, ...p } : it)));
  const toggleArea = (i: number, a: string) =>
    alterar(i, { areas: itens[i].areas.includes(a) ? itens[i].areas.filter(x => x !== a) : [...itens[i].areas, a] });

  async function salvar() {
    setErro('');
    if (!pedido.trim()) { setErro('Informe o nº do pedido (Omie).'); return; }
    if (!empresa) { setErro('Escolha a empresa: Aços Vital, Aços Uberaba ou Aços HRM.'); return; }
    const validos = itens.filter(i => i.material.trim());
    if (!validos.length) { setErro('Informe pelo menos um item com o material.'); return; }
    setSalvando(true);
    try {
      const r = await postIdempotente<{ ids: number[] }>('/api/cald-plano', {
        pedido: pedido.trim(), empresa, vendedor, cliente, prioridade,
        prazo_entrega: prazo || null, prev_faturamento: prevFat || null, obs,
        itens: validos.map(i => ({
          material: i.material, quantidade: i.quantidade || null, unidade: i.unidade,
          valor: i.valor, valor_unitario: i.unit, areas: i.areas,
        })),
      });
      onLancado(r.ids?.length || validos.length);
    } catch (e) {
      setErro(erroDe(e, 'Não foi possível lançar o pedido.'));
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Modal
      titulo={<><i className="bi bi-plus-circle" style={{ marginRight: 8 }} />Lançar pedido na Caldeiraria</>}
      onFechar={onFechar}
      largura={860}
      rodape={<>
        {erro && <span style={{ color: C.vermelho, fontSize: 13, fontWeight: 600, marginRight: 'auto', alignSelf: 'center' }}>{erro}</span>}
        <button className="cp-btn" onClick={onFechar} disabled={salvando}>Cancelar</button>
        <button className="cp-btn pri" onClick={salvar} disabled={salvando}>
          <i className="bi bi-send" />{salvando ? 'Lançando…' : `Lançar ${itens.filter(i => i.material.trim()).length || ''} item(ns)`}
        </button>
      </>}
    >
      <datalist id="cp-vendedores">{vendedores.map(v => <option key={v} value={v} />)}</datalist>
      <datalist id="cp-clientes">{clientes.map(v => <option key={v} value={v} />)}</datalist>

      <p style={{ margin: '0 0 12px', fontSize: 12.5, color: C.cinza }}>
        O pedido cai na coluna <b>&quot;Início — A planejar&quot;</b> do painel, onde o coordenador da Caldeiraria define a ordem, as previsões e manda pras áreas.
      </p>

      <div style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: C.cinza, textTransform: 'uppercase', letterSpacing: .3, marginBottom: 5 }}>Empresa do pedido *</div>
        <SeletorEmpresa valor={empresa} onChange={setEmpresa} />
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 12 }}>
        <Campo rot="Nº do pedido (Omie) *" largura={150}><input className="cp-in" value={pedido} onChange={e => setPedido(e.target.value)} autoFocus /></Campo>
        <Campo rot="Vendedor"><input className="cp-in" list="cp-vendedores" value={vendedor} onChange={e => setVendedor(e.target.value)} /></Campo>
        <Campo rot="Cliente"><input className="cp-in" list="cp-clientes" value={cliente} onChange={e => setCliente(e.target.value)} /></Campo>
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 12 }}>
        <Campo rot="Prioridade" largura={140}>
          <select className="cp-in" value={prioridade} onChange={e => setPrioridade(e.target.value)}>
            {PRIORIDADES_CALD.map(p => <option key={p} value={p}>{PRIO[p].txt}</option>)}
          </select>
        </Campo>
        <Campo rot="Prazo de entrega" largura={160}><input type="date" className="cp-in" value={prazo} onChange={e => setPrazo(e.target.value)} /></Campo>
        <Campo rot="Prev. faturamento" largura={160}><input type="date" className="cp-in" value={prevFat} onChange={e => setPrevFat(e.target.value)} /></Campo>
        <Campo rot="Observação"><input className="cp-in" value={obs} onChange={e => setObs(e.target.value)} placeholder="Opcional" /></Campo>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', margin: '16px 0 8px' }}>
        <div style={{ fontSize: 11, fontWeight: 800, color: C.cinza, textTransform: 'uppercase', letterSpacing: .3 }}>
          Itens
          {nItens > 0 && (
            <span style={{ marginLeft: 8, textTransform: 'none', letterSpacing: 0, fontSize: 12.5, color: C.texto }}>
              · <b>{nItens}</b> {nItens === 1 ? 'item' : 'itens'}
              {verValores && totalPedido > 0 && <> · total <b style={{ color: C.verde }}>{fmtBRL(totalPedido)}</b></>}
            </span>
          )}
        </div>
        <input ref={fileInputRef} type="file" accept=".xlsx,.xls" onChange={importarExcel} style={{ display: 'none' }} />
        <button type="button" onClick={() => fileInputRef.current?.click()} disabled={importando}
          title="Planilha no modelo do Flange: dados a partir da linha 4 — A código, B descrição, C qtd, F valor unitário"
          style={{ background: '#0d6efd', color: '#fff', border: 'none', borderRadius: 6, padding: '6px 14px', fontSize: 12, fontWeight: 700, cursor: 'pointer', opacity: importando ? 0.6 : 1 }}>
          <i className="bi bi-file-earmark-excel" style={{ marginRight: 4 }} />{importando ? 'Importando...' : 'Importar Excel'}
        </button>
      </div>
      {itens.map((it, i) => (
        <div key={i} style={{ border: `1px solid ${C.borda}`, borderRadius: 10, padding: 10, marginBottom: 10, background: C.fundo }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'flex-end' }}>
            <Campo rot={`Material ${itens.length > 1 ? i + 1 : ''}`}>
              <input className="cp-in" value={it.material} onChange={e => alterar(i, { material: e.target.value })} placeholder='Ex.: Curva 90° RC 24" std' />
            </Campo>
            <Campo rot="Qtd" largura={90}><input className="cp-in" inputMode="decimal" value={it.quantidade} onChange={e => {
              const q = qtdNum(e.target.value);
              alterar(i, it.unit !== null ? { quantidade: e.target.value, valor: calcTotal(it.unit, q) ?? it.valor } : { quantidade: e.target.value, unit: calcUnit(it.valor, q) });
            }} /></Campo>
            <Campo rot="Un." largura={80}>
              <select className="cp-in" value={it.unidade} onChange={e => alterar(i, { unidade: e.target.value })}>
                {UNIDADES_CALD.map(u => <option key={u} value={u}>{u}</option>)}
              </select>
            </Campo>
            {verValores && (
              <>
                <Campo rot="Vlr unitário" largura={140}><CampoValor valor={it.unit} onChange={v => alterar(i, { unit: v, valor: calcTotal(v, qtdNum(it.quantidade)) ?? it.valor })} /></Campo>
                <Campo rot="Vlr total" largura={150}><CampoValor valor={it.valor} onChange={v => alterar(i, { valor: v, unit: calcUnit(v, qtdNum(it.quantidade)) ?? it.unit })} /></Campo>
              </>
            )}
            <div style={{ display: 'flex', gap: 4 }}>
              <button className="cp-btn sm" title="Duplicar este item" onClick={() => setItens(v => [...v.slice(0, i + 1), { ...it, material: '' }, ...v.slice(i + 1)])}><i className="bi bi-copy" /></button>
              {itens.length > 1 && <button className="cp-btn sm perigo" title="Remover item" onClick={() => setItens(v => v.filter((_, k) => k !== i))}><i className="bi bi-trash" /></button>}
            </div>
          </div>
          <div style={{ marginTop: 8, display: 'flex', flexWrap: 'wrap', gap: 5, alignItems: 'center' }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: C.cinza, marginRight: 4 }}>Passa por:</span>
            {AREAS_CALD.map(a => {
              const on = it.areas.includes(a.codigo);
              return (
                <button key={a.codigo} type="button" onClick={() => toggleArea(i, a.codigo)} style={{
                  display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11.5, fontWeight: 700, borderRadius: 7, padding: '3px 9px', cursor: 'pointer',
                  border: `1.5px solid ${on ? a.cor : C.borda}`, background: on ? a.cor : '#fff', color: on ? '#fff' : C.fraco,
                }}>
                  <i className={`bi ${a.icon}`} />{a.nome}
                </button>
              );
            })}
          </div>
        </div>
      ))}
      <button className="cp-btn" onClick={() => setItens(v => [...v, itemVazio(v[v.length - 1]?.areas || ROTEIRO_PADRAO)])}>
        <i className="bi bi-plus-lg" />Adicionar item
      </button>
    </Modal>
  );
}
