'use client';
import { fmtHora } from '@/lib/format';

export interface MovLine {
  id: number;
  observacao?: string | null;
  status_anterior_display?: string;
  status_novo_display?: string;
  criado_em: string;
  usuario_nome: string;
  setor_origem?: string | null;
  setor_destino?: string | null;
  setor_origem_nome?: string;
  setor_destino_nome?: string;
}

const CORES = [
  'bg-orange-500', 'bg-blue-500', 'bg-gray-600', 'bg-green-500',
  'bg-purple-500', 'bg-red-400', 'bg-teal-500', 'bg-yellow-500',
];

interface Props {
  movimentacoes: MovLine[];
}

export default function LinhaDoTempo({ movimentacoes }: Props) {
  return (
    <div className="bg-white rounded-xl border shadow-sm p-4 h-full">
      <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Linha do Tempo</p>
      <div className="space-y-3 max-h-[600px] overflow-y-auto pr-1">
        {movimentacoes.length === 0 && (
          <p className="text-gray-400 text-xs text-center py-4">Sem movimentações.</p>
        )}
        {movimentacoes.map((m, idx) => (
          <div key={m.id} className="flex gap-3">
            <div className={`w-6 h-6 rounded-full flex items-center justify-center text-white font-bold text-xs flex-shrink-0 mt-0.5 ${CORES[idx % CORES.length]}`}>
              {idx + 1}
            </div>
            <div className="text-xs flex-1">
              <p className="font-medium text-gray-700">
                {m.observacao || `${m.status_anterior_display} → ${m.status_novo_display}`}
              </p>
              <p className="text-gray-400 mt-0.5">{fmtHora(m.criado_em)} · {m.usuario_nome}</p>
              {m.setor_destino && m.setor_destino !== m.setor_origem && (
                <p className="text-blue-600 text-xs">{m.setor_origem_nome} → {m.setor_destino_nome}</p>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
