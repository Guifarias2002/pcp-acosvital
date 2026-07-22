'use client';
import { useEffect, useState, useRef, useCallback } from 'react';
import { useRealtime } from '@/hooks/useRealtime';
import AuthGuard from '@/components/AuthGuard';
import { PRIORIDADE_COR, COR_STATUS, STATUS_LABELS, posSetorRoteiro, FABRICAS } from '@/lib/types';
import Link from 'next/link';
import { api } from '@/lib/api';

interface LoteChegando {
  id: number;
  quantidade: string;
  unidade: string;
  item_codigo: string;
  item_pedido_id: number;
  numero_pedido_venda: string;
  cliente: string;
  prioridade: string;
  pedido_prazo: string;
  setor_origem_nome: string;
}

interface ItemKanban {
  id: number;
  item_pedido_id: number;
  pedido_id: number;
  pedido_numero: string;
  pedido_cliente: string;
  pedido_prioridade: string;
  pedido_prazo_iso: string | null;
  codigo: string;
  quantidade_pendente: string;
  unidade: string;
  status: string;
  cor_status: string;
  status_display: string;
  valor_unitario: string | null;
}

interface SetorKanban {
  cod: string;
  nome: string;
  itens: ItemKanban[];
  chegando: LoteChegando[];
}

export default function KanbanPage() {
  const [setores, setSetores] = useState<SetorKanban[]>([]);
  const [loading, setLoading] = useState(true);
  const [ultimaAtt, setUltimaAtt] = useState('');
  const [expandidos, setExpandidos] = useState<Set<string>>(new Set());
  const [fPrazoDe, setFPrazoDe] = useState('');
  const [fPrazoAte, setFPrazoAte] = useState('');
  const [fabricaAtiva, setFabricaAtiva] = useState<string>(FABRICAS[0].cod);

  function toggleGrupo(key: string) {
    setExpandidos(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }

  function carregar() {
    api.get('/api/kanban')
      .then(r => { setSetores(r.data.setores); setUltimaAtt(new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    carregar();
    const t = setInterval(carregar, 30_000);
    return () => clearInterval(t);
  }, []);

  const carregarRef = useRef<() => void>(() => {});
  carregarRef.current = carregar;

  const carregarCallback = useCallback(() => carregarRef.current(), []);
  useRealtime(
    ['producao_itemparcial', 'producao_itempedido', 'producao_movimentacaoitem'],
    carregarCallback,
  );

  const dentroDoPrazo = (prazo: string | null) => {
    if (!prazo) return !fPrazoDe && !fPrazoAte;
    if (fPrazoDe && prazo < fPrazoDe) return false;
    if (fPrazoAte && prazo > fPrazoAte) return false;
    return true;
  };
  const setoresFiltrados = (fPrazoDe || fPrazoAte)
    ? setores.map(s => ({
        ...s,
        itens: s.itens.filter(i => dentroDoPrazo(i.pedido_prazo_iso)),
        chegando: s.chegando.filter(l => dentroDoPrazo(l.pedido_prazo)),
      }))
    : setores;

  // Kanban da fábrica ativa — Flanges e Caldeiraria não aparecem mais juntos
  // numa linha só (ficou ilegível depois que a Caldeiraria ganhou várias
  // etapas novas). Escolhe a fábrica em cima, igual a Nova Ordem já faz.
  // 'emissao' entra à parte pelas duas (1º passo de qualquer OP, não faz
  // parte de FABRICAS.setores porque não é um passo togglable de roteiro).
  const fabDef = FABRICAS.find(f => f.cod === fabricaAtiva) ?? FABRICAS[0];
  const codsFabrica = ['emissao', ...fabDef.setores];
  const setoresDaFabrica = setoresFiltrados.filter(s => codsFabrica.includes(s.cod));

  const todasParciais = setoresDaFabrica.flatMap(x => x.itens);
  const totalParciais = todasParciais.length;
  const totalPedidos = new Set(todasParciais.map(i => i.pedido_id)).size;
  const totalItens = new Set(todasParciais.map(i => i.item_pedido_id)).size;
  const totalChegando = setoresDaFabrica.reduce((s, x) => s + x.chegando.length, 0);
  // 'emissao' não está em ORDEM_SETORES (não é um passo de roteiro togglable),
  // então posSetorRoteiro sozinho não garante ele primeiro — força aqui.
  const posComEmissao = (cod: string) => cod === 'emissao' ? -1 : posSetorRoteiro(cod);
  const setoresAtivos = setoresDaFabrica
    .filter(s => s.itens.length > 0 || s.chegando.length > 0)
    .sort((a, b) => posComEmissao(a.cod) - posComEmissao(b.cod));

  return (
    <AuthGuard>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-xl font-bold text-gray-800">Kanban de Produção</h1>
          <p className="text-xs text-gray-400 mt-0.5">
            {totalPedidos} pedido{totalPedidos !== 1 ? 's' : ''} · {totalItens} ite{totalItens !== 1 ? 'ns' : 'm'} · {totalParciais} parcial{totalParciais !== 1 ? 'is' : ''} em produção
            {totalChegando > 0 && <span className="ml-2 text-blue-500">· {totalChegando} lote{totalChegando !== 1 ? 's' : ''} a caminho</span>}
            {ultimaAtt && <span className="ml-3 text-green-600">· ✓ atualizado às {ultimaAtt}</span>}
          </p>
        </div>
        <Link href="/pedidos/novo" className="btn btn-primary btn-sm">
          <i className="bi bi-plus-lg" /> Nova Ordem
        </Link>
      </div>

      {/* Seletor de fábrica — troca quais setores aparecem no kanban abaixo */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap', alignItems: 'center' }}>
        {FABRICAS.map(f => {
          const ativo = f.cod === fabricaAtiva;
          const qtd = setoresFiltrados
            .filter(s => f.setores.includes(s.cod))
            .reduce((acc, s) => acc + s.itens.length, 0);
          return (
            <button key={f.cod} type="button" onClick={() => setFabricaAtiva(f.cod)}
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
      </div>

      {/* Filtro de prazo */}
      <div className="card" style={{ padding: '10px 14px', marginBottom: 14, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <span style={{ fontSize: 12, color: '#888' }}>Prazo:</span>
        <input type="date" value={fPrazoDe} onChange={e => setFPrazoDe(e.target.value)}
          title="Prazo de entrega — de"
          style={{ border: '1px solid #dee2e6', borderRadius: 5, padding: '6px 8px', fontSize: 13 }} />
        <span style={{ fontSize: 12, color: '#888' }}>até</span>
        <input type="date" value={fPrazoAte} onChange={e => setFPrazoAte(e.target.value)}
          title="Prazo de entrega — até"
          style={{ border: '1px solid #dee2e6', borderRadius: 5, padding: '6px 8px', fontSize: 13 }} />
        {(fPrazoDe || fPrazoAte) && (
          <button onClick={() => { setFPrazoDe(''); setFPrazoAte(''); }}
            style={{ border: '1px solid #dee2e6', background: 'none', borderRadius: 5, padding: '6px 12px', fontSize: 13, cursor: 'pointer', color: '#666' }}>
            Limpar
          </button>
        )}
      </div>

      {loading && <p className="text-gray-400 text-sm">Carregando...</p>}

      {!loading && setoresAtivos.length === 0 && (
        <div className="text-center py-20 text-gray-300">
          <i className="bi bi-kanban text-5xl" />
          <p className="mt-3 text-sm">Nenhum item em produção</p>
        </div>
      )}

      <div className="overflow-x-auto pb-4">
        <div className="flex gap-3 min-w-max">
          {setoresAtivos.map(s => (
            <div key={s.cod} className="w-56 flex-shrink-0 flex flex-col" style={{ minHeight: 400 }}>

              {/* Cabeçalho da coluna */}
              <div className="rounded-t-lg px-3 py-2.5 flex items-center justify-between" style={{ background: '#162032' }}>
                <span className="text-white font-semibold text-xs truncate">{s.nome}</span>
                <div className="flex items-center gap-1 flex-shrink-0">
                  {s.chegando.length > 0 && (
                    <span title={`${s.chegando.length} lote(s) a caminho`}
                      className="text-xs font-bold px-1.5 py-0.5 rounded-full"
                      style={{ background: '#1d4ed8', color: '#bfdbfe', fontSize: 10 }}>
                      ↓{s.chegando.length}
                    </span>
                  )}
                  <span className="bg-blue-600 text-white text-xs font-bold w-5 h-5 rounded-full flex items-center justify-center">
                    {s.itens.length}
                  </span>
                </div>
              </div>

              {/* Corpo */}
              <div className="flex-1 rounded-b-lg border border-t-0 p-2 space-y-2" style={{ background: '#f8f9fa' }}>

                {/* Lotes a caminho */}
                {s.chegando.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold text-blue-500 mb-1.5 flex items-center gap-1">
                      <i className="bi bi-arrow-down-circle" /> A caminho ({s.chegando.length})
                    </p>
                    {s.chegando.map(l => (
                      <Link key={l.id} href={`/pedidos/${l.item_pedido_id}`}
                        className="block rounded-lg p-2.5 mb-1.5 border border-blue-200 hover:border-blue-400 transition-all"
                        style={{ background: '#eff6ff' }}>
                        <div className="flex items-center justify-between mb-1">
                          <span className="font-bold text-xs text-blue-800">{l.numero_pedido_venda}</span>
                          <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${PRIORIDADE_COR[l.prioridade]}`}>
                            {l.prioridade?.charAt(0).toUpperCase() + l.prioridade?.slice(1)}
                          </span>
                        </div>
                        <p className="text-xs text-blue-600 truncate">{l.cliente}</p>
                        <div className="flex items-center justify-between mt-1.5 text-xs text-blue-500">
                          <span>{l.quantidade} {l.unidade} · {l.item_codigo}</span>
                        </div>
                        <p className="text-xs text-blue-400 mt-0.5">
                          <i className="bi bi-arrow-right" /> {l.setor_origem_nome}
                        </p>
                      </Link>
                    ))}
                    {s.itens.length > 0 && <hr className="border-blue-100 my-2" />}
                  </div>
                )}

                {/* Itens no setor — agrupados por pedido */}
                {s.itens.length === 0 && s.chegando.length === 0 && (
                  <p className="text-gray-300 text-xs text-center py-4">Vazio</p>
                )}
                {(() => {
                  const pedidoMap = new Map<string, ItemKanban[]>();
                  for (const item of s.itens) {
                    const pkey = String(item.pedido_numero || item.pedido_id);
                    if (!pedidoMap.has(pkey)) pedidoMap.set(pkey, []);
                    pedidoMap.get(pkey)!.push(item);
                  }
                  return Array.from(pedidoMap.values()).map(grupo => {
                    const p0 = grupo[0];
                    const key = `${s.cod}-${p0.pedido_numero || p0.pedido_id}`;
                    const aberto = expandidos.has(key);
                    return (
                      <div key={key} className="rounded-lg border shadow-sm overflow-hidden" style={{ background: '#fff' }}>
                        {/* Cabeçalho do grupo — clicável */}
                        <div
                          onClick={() => toggleGrupo(key)}
                          className="flex items-center justify-between px-3 py-2 cursor-pointer select-none hover:bg-gray-50"
                          style={{ borderBottom: aberto ? '1px solid #e5e7eb' : 'none' }}
                        >
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5">
                              <span className="font-bold text-sm text-gray-800">{p0.pedido_numero}</span>
                              <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${PRIORIDADE_COR[p0.pedido_prioridade]}`}>
                                {p0.pedido_prioridade?.charAt(0).toUpperCase() + p0.pedido_prioridade?.slice(1)}
                              </span>
                            </div>
                            <p className="text-xs text-gray-400 truncate mt-0.5">{p0.pedido_cliente}</p>
                          </div>
                          <div className="flex items-center gap-1.5 flex-shrink-0 ml-1">
                            <span className="bg-blue-100 text-blue-700 text-xs font-bold w-5 h-5 rounded-full flex items-center justify-center">
                              {grupo.length}
                            </span>
                            <i className={`bi ${aberto ? 'bi-chevron-down' : 'bi-chevron-right'} text-gray-400`} style={{ fontSize: 11 }} />
                          </div>
                        </div>
                        {/* Itens do grupo */}
                        {aberto && (
                          <div className="p-2 space-y-1.5">
                            {grupo.map(item => (
                              <Link key={item.id} href={`/pedidos/${item.pedido_id}`}
                                className="block rounded-md p-2 border border-gray-100 hover:border-blue-200 hover:bg-blue-50 transition-all">
                                <div className="flex items-center justify-between">
                                  <div className="text-xs text-gray-600">
                                    <span className="font-medium">{item.quantidade_pendente}</span>
                                    <span className="text-gray-400 ml-1">{item.codigo}</span>
                                  </div>
                                  <span className={`text-xs px-1.5 py-0.5 rounded ${COR_STATUS[item.cor_status]}`}>
                                    {STATUS_LABELS[item.status]}
                                  </span>
                                </div>
                              </Link>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  });
                })()}
              </div>
            </div>
          ))}
        </div>
      </div>
    </AuthGuard>
  );
}

