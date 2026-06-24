'use client';
import { useEffect, useState } from 'react';
import AuthGuard from '@/components/AuthGuard';
import { PRIORIDADE_COR, COR_STATUS, STATUS_LABELS } from '@/lib/types';
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
  pedido_id: number;
  pedido_numero: string;
  pedido_cliente: string;
  pedido_prioridade: string;
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

  const total = setores.reduce((s, x) => s + x.itens.length, 0);
  const totalChegando = setores.reduce((s, x) => s + x.chegando.length, 0);
  const setoresAtivos = setores.filter(s => s.itens.length > 0 || s.chegando.length > 0);

  return (
    <AuthGuard>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-xl font-bold text-gray-800">Kanban de Produção</h1>
          <p className="text-xs text-gray-400 mt-0.5">
            {total} item{total !== 1 ? 's' : ''} em produção
            {totalChegando > 0 && <span className="ml-2 text-blue-500">· {totalChegando} lote{totalChegando !== 1 ? 's' : ''} a caminho</span>}
            {ultimaAtt && <span className="ml-3 text-green-600">· ✓ atualizado às {ultimaAtt}</span>}
          </p>
        </div>
        <Link href="/pedidos/novo" className="btn btn-primary btn-sm">
          <i className="bi bi-plus-lg" /> Nova Ordem
        </Link>
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

                {/* Itens no setor */}
                {s.itens.length === 0 && s.chegando.length === 0 && (
                  <p className="text-gray-300 text-xs text-center py-4">Vazio</p>
                )}
                {s.itens.map(item => (
                  <Link key={item.id} href={`/pedidos/${item.pedido_id}`}
                    className="bg-white rounded-lg p-3 shadow-sm border block hover:border-blue-300 hover:shadow-md transition-all">
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="font-bold text-sm text-gray-800">{item.pedido_numero}</span>
                      <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${PRIORIDADE_COR[item.pedido_prioridade]}`}>
                        {item.pedido_prioridade?.charAt(0).toUpperCase() + item.pedido_prioridade?.slice(1)}
                      </span>
                    </div>
                    <div className="text-xs text-gray-500 mb-1.5 truncate">{item.pedido_cliente}</div>
                    <div className="border-t pt-1.5 flex items-center justify-between">
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
            </div>
          ))}
        </div>
      </div>
    </AuthGuard>
  );
}
