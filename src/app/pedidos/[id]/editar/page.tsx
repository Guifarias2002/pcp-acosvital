'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import AuthGuard from '@/components/AuthGuard';
import { getPedido, editarPedido, inativarItem } from '@/lib/api';
import { SETOR_CHOICES, FABRICAS, NOMES } from '@/lib/types';
import { getUser } from '@/lib/auth';

interface ItemForm {
  id?: number;
  codigo: string;
  descricao: string;
  quantidade: string;
  unidade: string;
  valor_unitario: string;
  roteiro_proprio: string[];
  fabrica: string;
  status?: string;
  quantidade_entregue?: number;
  inativo?: boolean;
  _remover?: boolean;
}

interface Grupo { roteiro: string[]; itens: ItemForm[]; }

// Aba de revisão final — não é uma fábrica, só agrega os itens já salvos de
// todas as fábricas e concentra o botão de envio.
const TAB_TODOS = '__todos__';

// O pedido volta com o prazo formatado em pt-BR (dd/mm/aaaa) — bom pra exibir,
// mas o <input type="date"> só entende ISO (aaaa-mm-dd). Sem converter, o campo
// carrega vazio e, ao salvar, mandava dd/mm/aaaa de volta e quebrava o gravar.
// Aceita os dois formatos (e ISO já pronto); qualquer outra coisa vira ''.
function paraISODate(v?: string | null): string {
  if (!v) return '';
  const s = String(v).trim();
  const br = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (br) return `${br[3]}-${br[2]}-${br[1]}`;
  const iso = s.match(/^(\d{4}-\d{2}-\d{2})/);
  if (iso) return iso[1];
  return '';
}

// Item já entrou em produção? (não está mais só "emitido" ou já teve entrega)
function emProducao(it: ItemForm): boolean {
  return !!it.id && (it.status !== 'emitido' || Number(it.quantidade_entregue || 0) > 0);
}

const UNIDADES = ['un', 'kg', 'm', 'pc', 'jg', 'cx', 'lt'];

function novoItem(fabrica: string): ItemForm {
  return { codigo: '', descricao: '', quantidade: '1', unidade: 'un', valor_unitario: '', roteiro_proprio: [], fabrica };
}

// Agrupa os itens pela fábrica gravada em cada um (coluna explícita `fabrica`
// — não é mais inferida pelo roteiro, porque um item recém-criado pode ainda
// não ter nenhum setor da fábrica selecionado no roteiro (só 'emissao'), e
// 'emissao' não pertence a nenhuma fábrica especificamente.
function montarGrupos(itensCarregados: ItemForm[], roteiroBase: string[]): Record<string, Grupo> {
  const grupos: Record<string, Grupo> = Object.fromEntries(FABRICAS.map(f => [f.cod, { roteiro: ['emissao'], itens: [] as ItemForm[] }]));
  for (const it of itensCarregados) {
    const fab = FABRICAS.some(f => f.cod === it.fabrica) ? it.fabrica : FABRICAS[0].cod;
    const rot = it.roteiro_proprio.length > 0 ? it.roteiro_proprio : roteiroBase;
    grupos[fab].itens.push(it);
    if (rot.length > 0) grupos[fab].roteiro = rot;
  }
  return grupos;
}

export default function EditarPedidoPage({ params }: { params: { id: string } }) {
  const { id } = params;
  const router = useRouter();
  const user = getUser();
  const isAdmin = user?.is_staff;

  const [loading, setLoading] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [salvandoFabrica, setSalvandoFabrica] = useState<string>('');
  const [erro, setErro] = useState('');
  const [msgSalvo, setMsgSalvo] = useState('');

  const [pv, setPv] = useState('');
  const [op, setOp] = useState('');
  const [cliente, setCliente] = useState('');
  const [vendedor, setVendedor] = useState('');
  const [prazo, setPrazo] = useState('');
  const [prioridade, setPrioridade] = useState('normal');
  const [obs, setObs] = useState('');

  // Aba ativa: uma fábrica (troca o painel de Roteiro e a lista de Itens) ou
  // a aba de revisão "Todos os Produtos".
  const [fabricaAtiva, setFabricaAtiva] = useState<string>(FABRICAS[0].cod);
  const [grupos, setGrupos] = useState<Record<string, Grupo>>(
    Object.fromEntries(FABRICAS.map(f => [f.cod, { roteiro: ['emissao'], itens: [] }]))
  );

  const naAbaTodos = fabricaAtiva === TAB_TODOS;
  const grupoAtivo = grupos[fabricaAtiva] ?? { roteiro: ['emissao'], itens: [] };
  const fabDef = FABRICAS.find(f => f.cod === fabricaAtiva) ?? FABRICAS[0];

  function setGrupo(fabCod: string, patch: Partial<Grupo>) {
    setGrupos(prev => ({ ...prev, [fabCod]: { ...prev[fabCod], ...patch } }));
  }

  // Modal de inativação (item em movimentação) — chama o endpoint imediatamente,
  // fora do batch de "Salvar". Motivo opcional.
  const [inativarModal, setInativarModal] = useState<{ fabCod: string; index: number; item: ItemForm } | null>(null);
  const [motivoInativar, setMotivoInativar] = useState('');
  const [inativando, setInativando] = useState(false);
  const [erroInativar, setErroInativar] = useState('');

  function aplicarPedido(pedido: Record<string, unknown>) {
    const roteiroBase = (pedido.roteiro_base as string[]) || ['emissao'];
    const itensCarregados: ItemForm[] = ((pedido.itens as Record<string, unknown>[]) || []).map((i) => ({
      id: i.id as number,
      codigo: String(i.codigo || ''),
      descricao: String(i.descricao || ''),
      quantidade: String(i.quantidade || '1'),
      unidade: String(i.unidade || 'un'),
      valor_unitario: i.valor_unitario ? String(i.valor_unitario) : '',
      roteiro_proprio: (i.roteiro_proprio as string[]) || [],
      fabrica: String(i.fabrica || FABRICAS[0].cod),
      status: i.status as string | undefined,
      quantidade_entregue: Number(i.quantidade_entregue || 0),
      inativo: Boolean(i.inativo),
    }));
    setGrupos(montarGrupos(itensCarregados, roteiroBase));
  }

  useEffect(() => {
    getPedido(Number(id)).then((pedido) => {
      setPv(pedido.numero_pedido_venda || '');
      setOp(pedido.numero_op || '');
      setCliente(pedido.cliente || '');
      setVendedor(pedido.vendedor || '');
      setPrazo(paraISODate(pedido.prazo_entrega));
      setPrioridade(pedido.prioridade || 'normal');
      setObs(pedido.observacoes || '');
      aplicarPedido(pedido);
      setLoading(false);
    }).catch(() => {
      setErro('Erro ao carregar pedido.');
      setLoading(false);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  function toggleSetor(cod: string) {
    if (cod === 'emissao') return;
    const rot = grupoAtivo.roteiro;
    setGrupo(fabricaAtiva, { roteiro: rot.includes(cod) ? rot.filter(s => s !== cod) : [...rot, cod] });
  }

  function addItem() { setGrupo(fabricaAtiva, { itens: [...grupoAtivo.itens, novoItem(fabricaAtiva)] }); }

  function remItem(i: number) {
    const it = grupoAtivo.itens[i];
    // Item em movimentação: não pode ser removido, mas pode ser inativado.
    if (emProducao(it)) {
      setMotivoInativar('');
      setErroInativar('');
      setInativarModal({ fabCod: fabricaAtiva, index: i, item: it });
      return;
    }
    // Item ainda não produzido (ou novo, não salvo): marcação simples no batch.
    setGrupo(fabricaAtiva, { itens: grupoAtivo.itens.map((item, idx) => idx === i ? { ...item, _remover: true } : item) });
  }

  // Alterna inativo/ativo de um item (imediato, fora do batch). Ao inativar abre
  // o modal para o motivo opcional; ao ativar age direto.
  async function toggleInativo(fabCod: string, i: number, inativo: boolean) {
    const it = grupos[fabCod].itens[i];
    if (!it.id) return;
    if (inativo && !inativarModal) { setMotivoInativar(''); setErroInativar(''); setInativarModal({ fabCod, index: i, item: it }); return; }
    setInativando(true);
    setErroInativar('');
    try {
      await inativarItem(it.id, inativo, inativo ? motivoInativar.trim() || undefined : undefined);
      setGrupo(fabCod, { itens: grupos[fabCod].itens.map((item, j) => j === i ? { ...item, inativo } : item) });
      setInativarModal(null);
    } catch (e: unknown) {
      setErroInativar((e as { response?: { data?: { erro?: string } } }).response?.data?.erro || 'Erro ao atualizar item');
    } finally {
      setInativando(false);
    }
  }

  function setItemField(i: number, field: keyof ItemForm, val: string) {
    setGrupo(fabricaAtiva, { itens: grupoAtivo.itens.map((it, idx) => idx === i ? { ...it, [field]: val } : it) });
  }

  function bloquearEnter(e: React.KeyboardEvent<HTMLFormElement>) {
    const target = e.target as HTMLElement;
    if (e.key === 'Enter' && target.tagName !== 'TEXTAREA') {
      e.preventDefault();
      setErro('Informações incompletas. Revise os campos e clique em "Enviar para Emissão" para confirmar.');
    }
  }

  const itensValidos = (g: Grupo) => g.itens.filter(i => !i._remover && i.codigo.trim());

  // Monta o payload de itens (todas as fábricas) + o roteiro_base do pedido,
  // seguindo a mesma regra da Nova Ordem: fábrica única → roteiro_base é o
  // roteiro dela; 2+ fábricas com item → o roteiro_base fica só com 'emissao'
  // e cada item carrega seu próprio roteiro_proprio. `fabrica` vai sempre
  // explícita, em todo item, fábrica única ou mista.
  function montarPayload() {
    const comItens = FABRICAS.filter(f => itensValidos(grupos[f.cod]).length > 0);
    const misto = comItens.length > 1;
    const roteiro_base = misto ? ['emissao'] : (comItens[0] ? grupos[comItens[0].cod].roteiro : ['emissao']);
    const itensPayload: Record<string, unknown>[] = [];
    for (const f of FABRICAS) {
      const g = grupos[f.cod];
      for (const it of g.itens) {
        if (it._remover) {
          if (it.id) itensPayload.push({ id: it.id, _remover: true });
          continue;
        }
        if (!it.codigo.trim()) continue;
        itensPayload.push({
          id: it.id,
          codigo: it.codigo,
          descricao: it.descricao,
          quantidade: Number(it.quantidade),
          unidade: it.unidade,
          valor_unitario: it.valor_unitario ? Number(String(it.valor_unitario).replace(',', '.')) : null,
          roteiro_proprio: misto ? g.roteiro : [],
          fabrica: f.cod,
        });
      }
    }
    return { itensPayload, roteiro_base, temItens: comItens.length > 0 };
  }

  // Botão "Salvar {Fábrica}": grava só os itens/roteiro (todas as fábricas,
  // pela razão acima) — NÃO manda PV/Cliente/Prazo/Observações, então nada
  // mais do pedido é tocado. Fica na tela.
  async function salvarItens(fabCod: string) {
    const { itensPayload, roteiro_base, temItens } = montarPayload();
    if (!temItens) { setErro('Adicione ao menos um item (com código) em alguma fábrica.'); return; }
    setErro('');
    setMsgSalvo('');
    setSalvandoFabrica(fabCod);
    try {
      const pedidoAtualizado = await editarPedido(Number(id), { roteiro_base, itens: itensPayload });
      aplicarPedido(pedidoAtualizado);
      setMsgSalvo(`Itens de ${FABRICAS.find(f => f.cod === fabCod)?.nome} salvos.`);
    } catch (e: unknown) {
      setErro((e as { response?: { data?: { erro?: string } } }).response?.data?.erro || 'Erro ao salvar itens');
    } finally {
      setSalvandoFabrica('');
    }
  }

  // Botão "Enviar para Emissão" (na aba Todos os Produtos): salva tudo
  // (identificação + itens de todas as fábricas) e volta para a tela do
  // pedido — o passo final.
  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    const { itensPayload, roteiro_base, temItens } = montarPayload();
    if (!temItens) { setErro('Adicione ao menos um item (com código) em alguma fábrica.'); return; }
    setErro('');
    setSalvando(true);
    try {
      await editarPedido(Number(id), {
        numero_pedido_venda: pv,
        numero_op: op,
        cliente,
        vendedor,
        prazo_entrega: prazo,
        prioridade,
        roteiro_base,
        observacoes: obs,
        itens: itensPayload,
      });
      router.push(`/pedidos/${id}`);
    } catch (e: unknown) {
      setErro((e as { response?: { data?: { erro?: string } } }).response?.data?.erro || 'Erro ao salvar');
    } finally {
      setSalvando(false);
    }
  }

  // Botão "Salvar" (topo): grava TUDO (identificação + itens de todas as
  // fábricas) e FICA na tela com um aviso — pra dar pra salvar alterações do
  // cabeçalho (PV/Cliente/Prazo/Obs) sem precisar ir na aba "Todos os Produtos"
  // e sem ser expulso pra tela do pedido. É o "Enviar para Emissão" sem o push.
  async function salvarTudo() {
    const { itensPayload, roteiro_base, temItens } = montarPayload();
    if (!temItens) { setErro('Adicione ao menos um item (com código) em alguma fábrica.'); return; }
    setErro('');
    setMsgSalvo('');
    setSalvando(true);
    try {
      const pedidoAtualizado = await editarPedido(Number(id), {
        numero_pedido_venda: pv,
        numero_op: op,
        cliente,
        vendedor,
        prazo_entrega: prazo,
        prioridade,
        roteiro_base,
        observacoes: obs,
        itens: itensPayload,
      });
      aplicarPedido(pedidoAtualizado);
      setMsgSalvo('Alterações salvas.');
    } catch (e: unknown) {
      setErro((e as { response?: { data?: { erro?: string } } }).response?.data?.erro || 'Erro ao salvar');
    } finally {
      setSalvando(false);
    }
  }

  const inputCls = 'mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-400 bg-white';
  const labelCls = 'text-xs font-semibold text-gray-500 uppercase tracking-wide';

  if (loading) return (
    <AuthGuard>
      <div style={{ padding: 40, textAlign: 'center', color: '#888' }}>Carregando...</div>
    </AuthGuard>
  );

  const itensVisiveis = grupoAtivo.itens.filter(i => !i._remover);
  const totalItensPedido = FABRICAS.reduce((acc, f) => acc + itensValidos(grupos[f.cod]).length, 0);

  // Lista de setores do roteiro da fábrica ativa: Emissão (fixo) + setores dela.
  const setoresRoteiro: [string, string][] = !naAbaTodos ? [
    ['emissao', NOMES['emissao'] || 'Emissao de Ordens'],
    ...fabDef.setores.map(cod => SETOR_CHOICES.find(([c]) => c === cod)!).filter(Boolean) as [string, string][],
  ] : [];

  return (
    <AuthGuard adminOnly>
      <form onSubmit={salvar} onKeyDown={bloquearEnter}>
        {/* Barra de topo */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <a href={`/pedidos/${id}`} style={{ color: '#888', fontSize: 13, textDecoration: 'none' }}>← Voltar</a>
            <h1 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: '#1a3a5c' }}>
              <i className="bi bi-pencil-square" style={{ marginRight: 8 }} />
              Editar Pedido
            </h1>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <a href={`/pedidos/${id}`} style={{ padding: '8px 18px', borderRadius: 8, border: '1px solid #dee2e6', fontSize: 13, color: '#555', textDecoration: 'none', fontWeight: 600, display: 'inline-flex', alignItems: 'center' }}>
              Cancelar
            </a>
            <button type="button" onClick={salvarTudo} disabled={salvando}
              style={{ padding: '8px 20px', borderRadius: 8, background: '#166534', color: '#fff', fontSize: 13, fontWeight: 700, border: 'none', cursor: salvando ? 'not-allowed' : 'pointer', opacity: salvando ? 0.6 : 1 }}>
              <i className="bi bi-save" style={{ marginRight: 6 }} />
              {salvando ? 'Salvando...' : 'Salvar'}
            </button>
          </div>
        </div>

        {erro && (
          <div style={{ background: '#fef2f2', border: '1px solid #fca5a5', color: '#dc2626', borderRadius: 8, padding: '10px 14px', fontSize: 13, marginBottom: 16 }}>
            <i className="bi bi-exclamation-circle" style={{ marginRight: 6 }} />{erro}
          </div>
        )}
        {msgSalvo && (
          <div style={{ background: '#f0fdf4', border: '1px solid #86efac', color: '#166534', borderRadius: 8, padding: '10px 14px', fontSize: 13, marginBottom: 16 }}>
            <i className="bi bi-check-circle" style={{ marginRight: 6 }} />{msgSalvo}
          </div>
        )}

        {/* Seletor de fábrica — troca o Roteiro e os Itens exibidos abaixo. A
            aba "Todos os Produtos" agrega tudo e concentra o envio final. */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 1, marginRight: 4 }}>Fábrica:</span>
          {FABRICAS.map(f => {
            const ativo = f.cod === fabricaAtiva;
            const qtd = itensValidos(grupos[f.cod]).length;
            return (
              <button key={f.cod} type="button" onClick={() => { setFabricaAtiva(f.cod); setMsgSalvo(''); }}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8, padding: '8px 16px', borderRadius: 10,
                  border: `2px solid ${ativo ? '#1a3a5c' : '#e5e7eb'}`,
                  background: ativo ? '#1a3a5c' : '#fff', color: ativo ? '#fff' : '#555',
                  fontSize: 13, fontWeight: 700, cursor: 'pointer', transition: 'all .15s',
                }}>
                <i className={`bi ${f.icon}`} />
                {f.nome}
                {qtd > 0 && (
                  <span style={{
                    background: ativo ? 'rgba(255,255,255,.25)' : '#eef2ff', color: ativo ? '#fff' : '#1a3a5c',
                    borderRadius: 10, padding: '1px 8px', fontSize: 12, fontWeight: 800,
                  }}>{qtd}</span>
                )}
              </button>
            );
          })}
          <span style={{ width: 1, height: 22, background: '#e5e7eb', margin: '0 4px' }} />
          <button type="button" onClick={() => { setFabricaAtiva(TAB_TODOS); setMsgSalvo(''); }}
            style={{
              display: 'flex', alignItems: 'center', gap: 8, padding: '8px 16px', borderRadius: 10,
              border: `2px solid ${naAbaTodos ? '#166534' : '#e5e7eb'}`,
              background: naAbaTodos ? '#166534' : '#fff', color: naAbaTodos ? '#fff' : '#555',
              fontSize: 13, fontWeight: 700, cursor: 'pointer', transition: 'all .15s',
            }}>
            <i className="bi bi-list-check" />
            Todos os Produtos
            {totalItensPedido > 0 && (
              <span style={{
                background: naAbaTodos ? 'rgba(255,255,255,.25)' : '#eef2ff', color: naAbaTodos ? '#fff' : '#1a3a5c',
                borderRadius: 10, padding: '1px 8px', fontSize: 12, fontWeight: 800,
              }}>{totalItensPedido}</span>
            )}
          </button>
        </div>

        <div className="novo-pedido-grid">
          {/* COLUNA ESQUERDA */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

            {/* Identificação — comum a todas as abas */}
            <div className="card" style={{ padding: 20 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#1a3a5c', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 14, borderBottom: '2px solid #1a3a5c', paddingBottom: 6 }}>
                <i className="bi bi-card-heading" style={{ marginRight: 6 }} />Identificação
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label className={labelCls}>Nº PV *</label>
                  <input value={pv} onChange={e => setPv(e.target.value)} required maxLength={50} placeholder="PV-001" className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>Nº OP</label>
                  <input value={op} onChange={e => setOp(e.target.value)} placeholder="OP-001" maxLength={50} className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>Cliente *</label>
                  <input value={cliente} onChange={e => setCliente(e.target.value)} required className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>Vendedor</label>
                  <input value={vendedor} onChange={e => setVendedor(e.target.value)} className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>Prazo de Entrega *</label>
                  <input type="date" value={prazo} onChange={e => setPrazo(e.target.value)} required className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>Prioridade</label>
                  <select value={prioridade} onChange={e => setPrioridade(e.target.value)} className={inputCls}>
                    <option value="baixa">Baixa</option>
                    <option value="normal">Normal</option>
                    <option value="alta">Alta</option>
                    <option value="urgente">Urgente</option>
                  </select>
                </div>
                <div style={{ gridColumn: '1 / -1' }}>
                  <label className={labelCls}>Observações</label>
                  <textarea value={obs} onChange={e => setObs(e.target.value)} rows={2} className={inputCls} style={{ resize: 'vertical' }} />
                </div>
              </div>
            </div>

            {naAbaTodos ? (
              /* Aba "Todos os Produtos" — revisão agregada + envio final */
              <div className="card" style={{ padding: 20 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#1a3a5c', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 14, borderBottom: '2px solid #1a3a5c', paddingBottom: 6 }}>
                  <i className="bi bi-list-check" style={{ marginRight: 6 }} />Todos os Produtos do Pedido
                </div>

                {totalItensPedido === 0 && (
                  <p style={{ color: '#aaa', fontSize: 13, textAlign: 'center', padding: '20px 0' }}>
                    Nenhum item ainda. Volte para uma aba de fábrica e adicione/salve os itens primeiro.
                  </p>
                )}

                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {FABRICAS.map(f => itensValidos(grupos[f.cod]).map((item) => (
                    <div key={`${f.cod}-${item.id ?? item.codigo}`} style={{ border: '1px solid #e9ecef', borderRadius: 8, padding: '10px 12px', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', background: item.inativo ? '#f1f3f5' : '#f8faff', opacity: item.inativo ? 0.7 : 1 }}>
                      <span style={{ background: '#eef2ff', color: '#1a3a5c', borderRadius: 6, padding: '3px 9px', fontSize: 11, fontWeight: 800, display: 'flex', alignItems: 'center', gap: 5 }}>
                        <i className={`bi ${f.icon}`} />{f.nome}
                      </span>
                      <strong style={{ fontSize: 13, color: '#1a3a5c' }}>{item.codigo}</strong>
                      <span style={{ fontSize: 13, color: '#555', flex: 1, minWidth: 120 }}>{item.descricao}</span>
                      <span style={{ fontSize: 12, color: '#888' }}>{item.quantidade} {item.unidade}</span>
                      {item.inativo ? (
                        <span style={{ background: '#dee2e6', color: '#495057', borderRadius: 4, padding: '1px 7px', fontSize: 10, fontWeight: 700 }}>Inativado</span>
                      ) : item.id ? (
                        <span style={{ background: '#d1e7dd', color: '#0a5c36', borderRadius: 4, padding: '1px 7px', fontSize: 10, fontWeight: 700 }}>Salvo</span>
                      ) : (
                        <span style={{ background: '#fff3cd', color: '#7a5a00', borderRadius: 4, padding: '1px 7px', fontSize: 10, fontWeight: 700 }}>Não salvo ainda</span>
                      )}
                    </div>
                  )))}
                </div>

                <div style={{ marginTop: 20, paddingTop: 16, borderTop: '1px solid #e9ecef', display: 'flex', justifyContent: 'flex-end' }}>
                  <button type="submit" disabled={salvando}
                    style={{ padding: '10px 26px', borderRadius: 8, background: '#166534', color: '#fff', fontSize: 14, fontWeight: 700, border: 'none', cursor: 'pointer', opacity: salvando ? 0.6 : 1 }}>
                    <i className="bi bi-send-check" style={{ marginRight: 6 }} />
                    {salvando ? 'Enviando...' : 'Enviar para Emissão'}
                  </button>
                </div>
              </div>
            ) : (
              /* Itens da fábrica ativa */
              <div className="card" style={{ padding: 20 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14, borderBottom: '2px solid #1a3a5c', paddingBottom: 6, flexWrap: 'wrap', gap: 8 }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: '#1a3a5c', textTransform: 'uppercase', letterSpacing: 1 }}>
                    <i className={`bi ${fabDef.icon}`} style={{ marginRight: 6 }} />Itens do Pedido — {fabDef.nome}
                  </span>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <button type="button" onClick={addItem}
                      style={{ background: '#198754', color: '#fff', border: 'none', borderRadius: 6, padding: '5px 12px', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
                      <i className="bi bi-plus-lg" style={{ marginRight: 4 }} />Adicionar Item
                    </button>
                    <button type="button" onClick={() => salvarItens(fabricaAtiva)} disabled={salvandoFabrica === fabricaAtiva}
                      style={{ background: '#0d6efd', color: '#fff', border: 'none', borderRadius: 6, padding: '5px 12px', fontSize: 12, fontWeight: 700, cursor: 'pointer', opacity: salvandoFabrica === fabricaAtiva ? 0.6 : 1 }}>
                      <i className="bi bi-save" style={{ marginRight: 4 }} />
                      {salvandoFabrica === fabricaAtiva ? 'Salvando...' : `Salvar ${fabDef.nome}`}
                    </button>
                  </div>
                </div>

                {itensVisiveis.length === 0 && (
                  <p style={{ color: '#aaa', fontSize: 13, textAlign: 'center', padding: '20px 0' }}>Nenhum item nesta fábrica ainda. Adicione pelo menos um.</p>
                )}

                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {grupoAtivo.itens.map((item, i) => item._remover ? null : (
                    <div key={i} style={{ border: '1px solid #e9ecef', borderRadius: 8, padding: 12, background: item.inativo ? '#f1f3f5' : item.id ? '#f8faff' : '#f0fff4', opacity: item.inativo ? 0.7 : 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                        <span style={{ fontSize: 11, fontWeight: 700, color: item.inativo ? '#868e96' : '#1a3a5c' }}>
                          <i className="bi bi-box" style={{ marginRight: 5 }} />
                          {item.id ? `Item existente` : 'Novo item'}
                          {item.id && <span style={{ color: '#888', fontWeight: 400, marginLeft: 6 }}>ID #{item.id}</span>}
                          {item.inativo && (
                            <span style={{ marginLeft: 8, background: '#dee2e6', color: '#495057', borderRadius: 4, padding: '1px 7px', fontSize: 10, fontWeight: 700 }}>
                              <i className="bi bi-eye-slash" style={{ marginRight: 3 }} />Inativado
                            </span>
                          )}
                          {!item.inativo && emProducao(item) && (
                            <span style={{ marginLeft: 8, background: '#fff3cd', color: '#7a5a00', borderRadius: 4, padding: '1px 7px', fontSize: 10, fontWeight: 700 }}>
                              <i className="bi bi-arrow-repeat" style={{ marginRight: 3 }} />Em movimentação
                            </span>
                          )}
                        </span>
                        {item.inativo ? (
                          <button type="button" onClick={() => toggleInativo(fabricaAtiva, i, false)} disabled={inativando}
                            title="Reativar item (volta a aparecer para o operador)"
                            style={{ background: '#d1e7dd', color: '#0a5c36', border: 'none', borderRadius: 5, padding: '3px 8px', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>
                            <i className="bi bi-arrow-counterclockwise" style={{ marginRight: 3 }} />Ativar
                          </button>
                        ) : emProducao(item) ? (
                          <button type="button" onClick={() => remItem(i)}
                            title="Inativar item em movimentação (some para o operador)"
                            style={{ background: '#fff3cd', color: '#7a5a00', border: 'none', borderRadius: 5, padding: '3px 8px', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>
                            <i className="bi bi-eye-slash" style={{ marginRight: 3 }} />Inativar
                          </button>
                        ) : (
                          <button type="button" onClick={() => remItem(i)}
                            title="Remover item"
                            style={{ background: '#fee2e2', color: '#dc2626', border: 'none', borderRadius: 5, padding: '3px 8px', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>
                            <i className="bi bi-trash" style={{ marginRight: 3 }} />Remover
                          </button>
                        )}
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr 1fr 1fr 1fr', gap: 8 }}>
                        <div>
                          <label className={labelCls}>Código *</label>
                          <input value={item.codigo} onChange={e => setItemField(i, 'codigo', e.target.value)}
                            placeholder="COD-001" className={inputCls} />
                        </div>
                        <div>
                          <label className={labelCls}>Descrição</label>
                          <input value={item.descricao} onChange={e => setItemField(i, 'descricao', e.target.value)}
                            placeholder="Descrição do item" className={inputCls} />
                        </div>
                        <div>
                          <label className={labelCls}>Quantidade</label>
                          <input type="number" min="1" value={item.quantidade} onChange={e => setItemField(i, 'quantidade', e.target.value)}
                            className={inputCls} />
                        </div>
                        <div>
                          <label className={labelCls}>Unidade</label>
                          <select value={item.unidade} onChange={e => setItemField(i, 'unidade', e.target.value)} className={inputCls}>
                            {UNIDADES.map(u => <option key={u} value={u}>{u}</option>)}
                          </select>
                        </div>
                        <div>
                          <label className={labelCls}>Valor Unit. (R$)</label>
                          <input value={item.valor_unitario} onChange={e => setItemField(i, 'valor_unitario', e.target.value)}
                            placeholder="0,00" className={inputCls} />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* COLUNA DIREITA — Roteiro da fábrica ativa (some na aba Todos os Produtos) */}
          {!naAbaTodos && (
            <div>
              <div className="card" style={{ padding: 20, position: 'sticky', top: 66 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#1a3a5c', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 14, borderBottom: '2px solid #1a3a5c', paddingBottom: 6 }}>
                  <i className="bi bi-arrow-right-circle" style={{ marginRight: 6 }} />Roteiro — {fabDef.nome}
                </div>
                <p style={{ fontSize: 12, color: '#888', margin: '0 0 12px' }}>
                  Clique nos setores na ordem em que os itens de {fabDef.nome} devem passar:
                </p>
                {fabDef.setores.length === 0 ? (
                  <div style={{ fontSize: 12, color: '#92400e', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 8, padding: '8px 12px' }}>
                    Os setores desta fábrica ainda serão cadastrados.
                  </div>
                ) : (() => {
                  const selecionados = grupoAtivo.roteiro
                    .filter(c => setoresRoteiro.some(([cod]) => cod === c))
                    .map(c => setoresRoteiro.find(([cod]) => cod === c)!);
                  const naoSelecionados = setoresRoteiro.filter(([c]) => !grupoAtivo.roteiro.includes(c));
                  const lista = [...selecionados, ...naoSelecionados];
                  return (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, paddingLeft: 14, maxHeight: 'calc(100vh - 350px)', overflowY: 'auto' }}>
                      {lista.map(([cod, nome]) => {
                        const selecionado = grupoAtivo.roteiro.includes(cod);
                        const fixo = cod === 'emissao';
                        const pos = grupoAtivo.roteiro.indexOf(cod);
                        return (
                          <div key={cod} style={{ position: 'relative' }}>
                            {selecionado && (
                              <span style={{
                                position: 'absolute', left: -14, top: '50%', transform: 'translateY(-50%)',
                                width: 24, height: 24, borderRadius: '50%',
                                background: fixo ? '#fff' : '#1a3a5c',
                                color: fixo ? '#1a3a5c' : '#fff',
                                border: '2px solid #1a3a5c',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                fontSize: 11, fontWeight: 800, zIndex: 1,
                              }}>
                                {pos + 1}
                              </span>
                            )}
                            <button type="button" onClick={() => toggleSetor(cod)}
                              disabled={fixo}
                              style={{
                                width: '100%', display: 'flex', alignItems: 'center', gap: 10,
                                padding: '9px 12px', borderRadius: 8, border: '1px solid',
                                borderColor: selecionado ? '#1a3a5c' : '#e5e7eb',
                                background: fixo ? '#1a3a5c' : selecionado ? '#eef2ff' : '#fff',
                                color: fixo ? '#fff' : selecionado ? '#1a3a5c' : '#666',
                                cursor: fixo ? 'default' : 'pointer',
                                fontWeight: selecionado ? 700 : 400,
                                fontSize: 13, textAlign: 'left', transition: 'all .15s',
                              }}>
                              {!selecionado && (
                                <span style={{ width: 16, height: 16, borderRadius: '50%', border: '1px dashed #ccc', flexShrink: 0 }} />
                              )}
                              <span style={{ flex: 1 }}>{nome}</span>
                              {fixo && <i className="bi bi-lock-fill" style={{ fontSize: 11, opacity: .6 }} />}
                              {selecionado && !fixo && <i className="bi bi-check2" style={{ color: '#1a3a5c', fontSize: 14 }} />}
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  );
                })()}

                {grupoAtivo.roteiro.length > 1 && (
                  <div style={{ marginTop: 16, padding: '10px 12px', background: '#f0f4ff', borderRadius: 8, fontSize: 12, color: '#1a3a5c' }}>
                    <strong>Fluxo:</strong>
                    <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '4px 0', marginTop: 6 }}>
                      {grupoAtivo.roteiro.map((s, i) => {
                        const nome = NOMES[s] || s;
                        return (
                          <span key={s} style={{ display: 'flex', alignItems: 'center' }}>
                            <span style={{ background: '#1a3a5c', color: '#fff', borderRadius: 4, padding: '2px 7px', fontSize: 11, whiteSpace: 'nowrap' }}>{nome}</span>
                            {i < grupoAtivo.roteiro.length - 1 && <span style={{ margin: '0 4px', color: '#aaa', flexShrink: 0 }}>→</span>}
                          </span>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </form>

      {/* Modal inativar item em movimentação — imediato, fora do batch */}
      {inativarModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div className="card" style={{ padding: 24, maxWidth: 460, width: '92%' }}>
            <h5 style={{ margin: '0 0 6px', color: '#b45309', fontWeight: 700 }}>
              <i className="bi bi-eye-slash" style={{ marginRight: 8 }} />Inativar item
            </h5>
            <p style={{ fontSize: 14, color: '#333', margin: '6px 0' }}>
              O item <strong>{inativarModal.item.codigo}</strong> vai <strong>sumir das telas do operador</strong>.
              Ele continua visível (cinza) para administradores e pode ser reativado a qualquer momento.
            </p>
            <label className={labelCls}>Motivo (opcional)</label>
            <textarea value={motivoInativar} onChange={e => setMotivoInativar(e.target.value)} rows={3}
              placeholder="Ex.: item cancelado pelo cliente, duplicado, etc."
              className={inputCls} style={{ resize: 'vertical' }} />
            {erroInativar && <p style={{ color: '#dc2626', fontSize: 12, marginTop: 8 }}>{erroInativar}</p>}
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
              <button type="button" onClick={() => setInativarModal(null)} disabled={inativando}
                style={{ border: '1px solid #dee2e6', background: 'none', borderRadius: 6, padding: '8px 18px', fontSize: 13, cursor: 'pointer', color: '#555', fontWeight: 600 }}>
                Cancelar
              </button>
              <button type="button" onClick={() => toggleInativo(inativarModal.fabCod, inativarModal.index, true)} disabled={inativando}
                style={{ background: '#b45309', color: '#fff', border: 'none', borderRadius: 6, padding: '8px 22px', fontSize: 13, fontWeight: 700, cursor: 'pointer', opacity: inativando ? 0.5 : 1 }}>
                {inativando ? 'Inativando...' : 'Confirmar inativação'}
              </button>
            </div>
          </div>
        </div>
      )}
    </AuthGuard>
  );
}
