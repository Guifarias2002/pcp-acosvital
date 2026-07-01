'use client';
import { useEffect, useState, useRef, useCallback } from 'react';
import { useRealtime } from '@/hooks/useRealtime';
import AuthGuard from '@/components/AuthGuard';
import { getEmitidos } from '@/lib/api';
import { Pedido, PRIORIDADE_COR, SETOR_CHOICES } from '@/lib/types';
import Link from 'next/link';

const NOMES = Object.fromEntries(SETOR_CHOICES);

export default function EmitidosPage() {
  const [data, setData] = useState<{ pedidos: Pedido[]; total_pedidos: number; total_itens: number; total_valor: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [fCliente, setFCliente] = useState('');
  const [fPrioridade, setFPrioridade] = useState('');
  const [fSetor, setFSetor] = useState('');

  function buscar() {
    setLoading(true);
    getEmitidos({ cliente: fCliente, prioridade: fPrioridade, setor: fSetor })
      .then(setData).finally(() => setLoading(false));
  }

  useEffect(() => { buscar(); }, []);

  const buscarRef = useRef<() => void>(() => {});
  buscarRef.current = buscar;

  useEffect(() => {
    const t = setInterval(() => buscarRef.current(), 60_000);
    return () => clearInterval(t);
  }, []);

  const buscarCallback = useCallback(() => buscarRef.current(), []);
  useRealtime(
    ['producao_itemparcial', 'producao_itempedido', 'producao_movimentacaoitem'],
    buscarCallback,
  );

  return (
    <AuthGuard>
        {/* Banner verde */}
        <div style={{ background: '#166534', borderRadius: 10, padding: '20px 22px', marginBottom: 18, color: '#fff' }}>
          <div className="flex items-center justify-between mb-4">
            <div>
              <h1 className="text-xl font-bold flex items-center gap-2">▶ OPs em Produção</h1>
              <p className="text-green-300 text-xs mt-0.5">Ordens emitidas que ainda não foram concluídas</p>
            </div>
            <Link href="/pedidos/novo"
              className="bg-green-500 hover:bg-green-400 text-white px-4 py-2 rounded-lg font-semibold text-sm flex items-center gap-1">
              ● Nova Ordem
            </Link>
          </div>
          {data && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="bg-green-700 rounded-lg px-4 py-3 text-center">
                <p className="text-3xl font-bold">{data.total_pedidos}</p>
                <p className="text-green-300 text-xs mt-1 uppercase tracking-wide">OPs Ativas</p>
              </div>
              <div className="bg-green-700 rounded-lg px-4 py-3 text-center">
                <p className="text-3xl font-bold">{data.total_itens}</p>
                <p className="text-green-300 text-xs mt-1 uppercase tracking-wide">Itens</p>
              </div>
              <div className="bg-green-700 rounded-lg px-4 py-3 text-center">
                <p className="text-2xl font-bold">R$ {Number(data.total_valor).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                <p className="text-green-300 text-xs mt-1 uppercase tracking-wide">Valor em Produção</p>
              </div>
            </div>
          )}
        </div>

        {/* Filtros */}
        <div className="flex items-center gap-3 mb-5 flex-wrap">
          <div>
            <label className="text-xs text-gray-500 font-semibold block mb-1 uppercase">Cliente</label>
            <input value={fCliente} onChange={e => setFCliente(e.target.value)}
              placeholder="Buscar cliente..."
              className="border rounded px-3 py-1.5 text-sm min-w-40 focus:outline-none focus:border-blue-400" />
          </div>
          <div>
            <label className="text-xs text-gray-500 font-semibold block mb-1 uppercase">Setor Atual</label>
            <select value={fSetor} onChange={e => setFSetor(e.target.value)}
              className="border rounded px-3 py-1.5 text-sm">
              <option value="">Todos os setores</option>
              {SETOR_CHOICES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-gray-500 font-semibold block mb-1 uppercase">Prioridade</label>
            <select value={fPrioridade} onChange={e => setFPrioridade(e.target.value)}
              className="border rounded px-3 py-1.5 text-sm">
              <option value="">Todas</option>
              {['baixa','normal','alta','urgente'].map(p => <option key={p} value={p}>{p.charAt(0).toUpperCase()+p.slice(1)}</option>)}
            </select>
          </div>
          <div className="mt-5">
            <button onClick={buscar}
              className="bg-gray-800 text-white px-4 py-1.5 rounded text-sm font-semibold flex items-center gap-1 hover:bg-gray-700">
              🔍 Filtrar
            </button>
          </div>
        </div>

        {loading && <p className="text-gray-400 text-center py-10">Carregando...</p>}
        <div className="space-y-4">
          {data?.pedidos.map(p => (
            <div key={p.id} className="bg-white rounded-xl border shadow-sm overflow-hidden border-l-4 border-l-gray-200">
              <div className="flex items-center justify-between px-5 py-3">
                <div className="flex items-center gap-3">
                  <span className="font-bold text-gray-800">{p.numero_pedido_venda}</span>
                  {p.numero_op && <span className="text-xs text-gray-400">{p.numero_op}</span>}
                  <span className={`text-xs px-2 py-0.5 rounded font-semibold ${PRIORIDADE_COR[p.prioridade]}`}>
                    {p.prioridade?.charAt(0).toUpperCase()+p.prioridade?.slice(1)}
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-gray-500">📅 {p.prazo_entrega}</span>
                  <span className="font-semibold text-gray-700">R$ {Number(p.valor_calculado || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                  <Link href={`/pedidos/${p.id}`}
                    className="text-xs border border-blue-300 text-blue-600 px-2 py-0.5 rounded hover:bg-blue-50">
                    Ver pedido
                  </Link>
                </div>
              </div>
              <div className="px-5 pb-1 text-xs text-gray-500 flex items-center gap-1">
                <span>👤</span><span>{p.cliente}</span>
              </div>
              <div className="divide-y border-t mt-2">
                {p.itens.map(item => (
                  <div key={item.id} className="px-5 py-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <span className={`text-xs px-2 py-0.5 rounded font-semibold ${item.cor_status === 'info' ? 'bg-blue-500 text-white' : item.cor_status === 'primary' ? 'bg-blue-600 text-white' : item.cor_status === 'success' ? 'bg-green-500 text-white' : 'bg-gray-200 text-gray-700'}`}>
                          {item.status_display}
                        </span>
                        <span className="text-xs font-semibold">🔢 {item.quantidade_pendente} {item.unidade}</span>
                        <span className="text-xs text-gray-500">📍 {item.nome_setor_atual}</span>
                      </div>
                      <Link href={`/item/${item.id}`}
                        className="text-xs border border-gray-300 text-gray-600 px-2 py-0.5 rounded hover:bg-gray-50 flex items-center gap-1">
                        👁 Detalhe
                      </Link>
                    </div>
                    {/* Roteiro */}
                    <div className="flex items-center gap-1 mt-2 flex-wrap">
                      {item.roteiro_efetivo.map((setor, i) => {
                        const idxAtual = item.roteiro_efetivo.indexOf(item.setor_atual);
                        const done = i < idxAtual;
                        const current = setor === item.setor_atual;
                        return (
                          <span key={setor} className={`text-xs px-2 py-0.5 rounded ${current ? 'bg-blue-700 text-white font-bold' : done ? 'bg-gray-200 text-gray-400 line-through' : 'bg-gray-100 text-gray-400'}`}>
                            {current && '● '}{NOMES[setor] || setor}
                          </span>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
          {!loading && data?.pedidos.length === 0 && (
            <p className="text-gray-400 text-center py-10">Nenhuma OP em produção.</p>
          )}
        </div>
    </AuthGuard>
  );
}
