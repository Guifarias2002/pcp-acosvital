'use client';
import { useEffect, useState, useRef, useCallback } from 'react';
import { useRealtime } from '@/hooks/useRealtime';
import AuthGuard from '@/components/AuthGuard';
import { api } from '@/lib/api';
import Link from 'next/link';
import { PRIORIDADE_COR } from '@/lib/types';

interface LiderData {
  id: number;
  nome: string;
  setor: string;
  setor_nome: string;
  total_itens: number;
  itens: {
    id: number;
    pedido_numero: string;
    pedido_cliente: string;
    pedido_prioridade: string;
    pedido_prazo: string;
    codigo: string;
    descricao: string;
    quantidade_pendente: string;
    unidade: string;
    status_display: string;
    cor_status: string;
  }[];
}

function iniciais(nome: string) {
  return nome.split(' ').filter(Boolean).slice(0, 2).map(n => n[0].toUpperCase()).join('');
}

export default function PorLiderPage() {
  const [lideres, setLideres] = useState<LiderData[]>([]);
  const [loading, setLoading] = useState(true);

  function buscar() {
    api.get('/api/por-lider').then(r => setLideres(r.data)).finally(() => setLoading(false));
  }

  useEffect(() => {
    buscar();
  }, []);

  const buscarRef = useRef<() => void>(() => {});
  buscarRef.current = buscar;

  useEffect(() => {
    const t = setInterval(() => buscarRef.current(), 5_000);
    return () => clearInterval(t);
  }, []);

  const buscarCallback = useCallback(() => buscarRef.current(), []);
  useRealtime(
    ['producao_itemparcial', 'producao_itempedido', 'producao_movimentacaoitem'],
    buscarCallback,
  );

  const totalItens = lideres.reduce((a, l) => a + l.total_itens, 0);

  return (
    <AuthGuard>
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-800">Painel por Líder</h1>
            <p className="text-sm text-gray-400 mt-0.5">Itens ativos em cada setor agrupados pelo líder responsável</p>
          </div>
          <button className="bg-blue-600 text-white px-4 py-2 rounded-lg font-semibold text-sm hover:bg-blue-700">
            🖨 Imprimir / Salvar PDF
          </button>
        </div>

        {/* Resumo */}
        {!loading && (
          <div className="flex items-center gap-4 mb-6 text-sm">
            <div>
              <span className="text-2xl font-bold text-gray-800">{lideres.length}</span>
              <span className="text-gray-500 ml-1">Líderes ativos</span>
            </div>
            <div>
              <span className="text-2xl font-bold text-gray-800">{totalItens}</span>
              <span className="text-gray-500 ml-1">Total de itens</span>
            </div>
          </div>
        )}

        {loading && <p className="text-gray-400 text-center py-20">Carregando...</p>}

        <div className="grid grid-cols-3 gap-4">
          {lideres.map(lider => (
            <div key={lider.id} className="bg-white rounded-xl border shadow-sm overflow-hidden">
              {/* Header do card */}
              <div className="bg-[#162032] px-4 py-3 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-full bg-blue-600 flex items-center justify-center text-white font-bold text-sm">
                    {iniciais(lider.nome)}
                  </div>
                  <div>
                    <div className="text-white font-bold text-sm">{lider.nome.toUpperCase()}</div>
                    <div className="text-blue-300 text-xs flex items-center gap-1">
                      <span>≡</span> {lider.setor_nome}
                    </div>
                  </div>
                </div>
                <span className="bg-blue-600 text-white text-xs font-bold px-2 py-1 rounded">
                  {lider.total_itens} {lider.total_itens === 1 ? 'item' : 'itens'}
                </span>
              </div>

              {/* Itens */}
              <div className="p-3 min-h-24">
                {lider.itens.length === 0 ? (
                  <div className="text-center py-6">
                    <div className="text-3xl text-gray-200 mb-1">📥</div>
                    <p className="text-gray-400 text-xs">Nenhum item no momento</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {lider.itens.map(item => (
                      <Link key={item.id} href={`/item/${item.id}`}
                        className="flex items-center justify-between p-2 rounded border border-gray-100 hover:border-blue-200 hover:bg-blue-50 transition-colors">
                        <div className="text-xs">
                          <span className="font-bold text-blue-700">{item.pedido_numero}</span>
                          <span className="text-gray-500 ml-1">{item.pedido_cliente}</span>
                          <br />
                          <span className="text-gray-600">{item.codigo} — {item.descricao}</span>
                        </div>
                        <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${PRIORIDADE_COR[item.pedido_prioridade]}`}>
                          {item.pedido_prioridade?.charAt(0).toUpperCase()+item.pedido_prioridade?.slice(1)}
                        </span>
                      </Link>
                    ))}
                  </div>
                )}
              </div>

              {/* Footer */}
              <div className="px-3 pb-3">
                <Link href={`/setor/${lider.setor}`}
                  className="w-full text-center block text-xs border border-gray-300 rounded px-3 py-1.5 text-gray-600 hover:bg-gray-50">
                  Ver painel do setor
                </Link>
              </div>
            </div>
          ))}
        </div>
    </AuthGuard>
  );
}
