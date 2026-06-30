'use client';
import Link from 'next/link';
import { ItemParcial, RastreioItem, PARCIAL_STATUS_COR, PARCIAL_STATUS_LABELS } from '@/lib/types';
import { fmtHora, fmtDuracao, fmtQtd } from '@/lib/format';

interface Props {
  parciais: ItemParcial[];
  rastreio?: RastreioItem;
  unidade: string;
  isAdmin: boolean;
  onReativar?: (parcialId: number) => void;
  loading?: boolean;
}

function corParcial(status: string) {
  switch (status) {
    case 'concluida':        return 'border-green-200 bg-green-50';
    case 'cancelada':        return 'border-gray-200 bg-gray-50 opacity-50';
    case 'em_andamento':     return 'border-orange-200 bg-orange-50';
    case 'pausado':          return 'border-yellow-200 bg-yellow-50';
    case 'finalizado_setor': return 'border-teal-200 bg-teal-50';
    default:                 return 'border-blue-100 bg-blue-50';
  }
}

export default function RastreabilidadeParciais({ parciais, rastreio, unidade, isAdmin, onReativar, loading }: Props) {
  if (parciais.length === 0) return null;

  const sorted = [...parciais].sort(
    (a, b) => new Date(a.criado_em).getTime() - new Date(b.criado_em).getTime()
  );

  const ativas = parciais.filter(p => !['cancelada', 'concluida'].includes(p.status));
  const concluidas = parciais.filter(p => p.status === 'concluida');
  const canceladas = parciais.filter(p => p.status === 'cancelada');

  return (
    <div className="bg-white rounded-xl border shadow-sm p-4 mt-4">
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
          Rastreabilidade — Jornada das Peças
        </p>
        <div className="flex gap-3 text-xs text-gray-400">
          {ativas.length > 0 && (
            <span className="text-orange-600 font-semibold">{ativas.length} ativa{ativas.length !== 1 ? 's' : ''}</span>
          )}
          {concluidas.length > 0 && (
            <span className="text-green-600 font-semibold">{concluidas.length} concluída{concluidas.length !== 1 ? 's' : ''}</span>
          )}
          {canceladas.length > 0 && (
            <span className="text-gray-400">{canceladas.length} cancelada{canceladas.length !== 1 ? 's' : ''}</span>
          )}
        </div>
      </div>

      <div className="space-y-2">
        {sorted.map(p => (
          <div
            key={p.id}
            style={p.parcial_origem_id ? { marginLeft: 28 } : {}}
            className={`flex items-start gap-3 px-3 py-2.5 rounded border text-sm ${corParcial(p.status)}`}
          >
            {p.parcial_origem_id && (
              <span className="text-gray-300 text-base leading-none mt-0.5 flex-shrink-0">└</span>
            )}
            <div className="flex-1 min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-bold text-[#1a3a5c] text-base">
                  {fmtQtd(p.quantidade)} <span className="text-sm font-medium text-blue-400">{unidade}</span>
                </span>
                <span className="text-gray-400 text-xs">em</span>
                <Link href={`/parcial/${p.id}`} className="font-semibold text-blue-700 hover:underline text-xs">
                  {p.setor_atual_nome} →
                </Link>
                <span className={`text-xs px-2 py-0.5 rounded font-medium ${PARCIAL_STATUS_COR[p.status] || 'bg-gray-100 text-gray-600'}`}>
                  {PARCIAL_STATUS_LABELS[p.status] || p.status}
                </span>
                <span className="text-xs text-gray-400 italic">
                  {p.parcial_origem_id ? 'envio parcial' : 'lote principal'}
                </span>
              </div>

              <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-gray-400 mt-1">
                {p.iniciado_em && (
                  <span>⏱ Iniciado: {fmtHora(p.iniciado_em)}</span>
                )}
                {p.concluido_em && (
                  <span>✓ Concluído: {fmtHora(p.concluido_em)}</span>
                )}
                {p.iniciado_em && p.concluido_em && (
                  <span className="text-green-700 font-medium">
                    Duração: {fmtDuracao(p.iniciado_em, p.concluido_em)}
                  </span>
                )}
                {p.iniciado_em && !p.concluido_em && ['em_andamento', 'pausado', 'finalizado_setor'].includes(p.status) && (
                  <span className={`font-medium ${p.status === 'pausado' ? 'text-yellow-600' : 'text-orange-600'}`}>
                    {p.status === 'pausado' ? '⏸ Pausado · ' : ''}
                    Em andamento há {fmtDuracao(p.iniciado_em, new Date().toISOString())}
                  </span>
                )}
                {!p.iniciado_em && p.status === 'em_aberto' && (
                  <span className="text-gray-400">Aguardando início</span>
                )}
                {p.status === 'finalizado_setor' && (
                  <span className="text-teal-700 font-medium">✓ Etapa finalizada — aguardando envio</span>
                )}
              </div>

              {isAdmin && p.status === 'concluida' && onReativar && (
                <button
                  onClick={() => onReativar(p.id)}
                  disabled={loading}
                  className="mt-1.5 text-xs px-2.5 py-1 rounded bg-yellow-100 text-yellow-800 border border-yellow-300 hover:bg-yellow-200 font-medium disabled:opacity-60"
                >
                  ↩ Reativar parcial
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      {rastreio && (
        <div className="border-t mt-4 pt-3 grid grid-cols-2 md:grid-cols-4 gap-3 text-center">
          <div>
            <p className="font-bold text-sm text-orange-600">{fmtQtd(rastreio.quantidade_em_andamento) || '0'} <span className="text-xs font-normal">{unidade}</span></p>
            <p className="text-xs text-gray-400">Em produção</p>
          </div>
          <div>
            <p className="font-bold text-sm text-green-700">{fmtQtd(rastreio.quantidade_concluida) || '0'} <span className="text-xs font-normal">{unidade}</span></p>
            <p className="text-xs text-gray-400">Concluída</p>
          </div>
          <div>
            <p className="font-bold text-sm text-gray-500">{fmtQtd(rastreio.quantidade_em_aberto) || '0'} <span className="text-xs font-normal">{unidade}</span></p>
            <p className="text-xs text-gray-400">Aguardando</p>
          </div>
          <div>
            <p className={`font-bold text-sm ${rastreio.integro ? 'text-green-700' : 'text-red-600'}`}>
              {rastreio.integro ? '✓ Íntegro' : '⚠ Divergência'}
            </p>
            <p className="text-xs text-gray-400">
              {fmtQtd(rastreio.total_rastreado) || '0'} / {fmtQtd(rastreio.quantidade_total)} {unidade}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
