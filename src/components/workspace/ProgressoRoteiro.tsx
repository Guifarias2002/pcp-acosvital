'use client';
import Link from 'next/link';
import { NOMES } from '@/lib/types';

export interface RoteiroCirculo {
  setor: string;
  done: boolean;
  current: boolean;
}

interface Props {
  circulos: RoteiroCirculo[];
  isAdmin?: boolean;
  setorAtualNome?: string;
  statusLabel?: string;
  corStatus?: string;
}

export default function ProgressoRoteiro({ circulos, isAdmin, setorAtualNome, statusLabel, corStatus }: Props) {
  if (isAdmin) {
    return (
      <div className="bg-white rounded-xl border shadow-sm p-4 mb-4">
        <div className="overflow-x-auto -mx-1 px-1">
          <div className="flex items-center gap-0" style={{ minWidth: 'max-content' }}>
            {circulos.map((r, i) => (
              <div key={r.setor} className="flex items-center">
                <div className="flex flex-col items-center">
                  <Link href={`/setor/${r.setor}`} className="no-underline">
                    <div className={`w-9 h-9 rounded-full flex items-center justify-center font-bold text-sm border-2 transition-colors ${
                      r.current  ? 'bg-orange-500 border-orange-500 text-white' :
                      r.done     ? 'bg-gray-800 border-gray-800 text-white' :
                                   'bg-white border-gray-300 text-gray-400'
                    }`}>
                      {r.done ? '✓' : i + 1}
                    </div>
                  </Link>
                  <span className="text-xs mt-1 text-center leading-tight text-gray-500" style={{ width: 52 }}>
                    {NOMES[r.setor] || r.setor}
                  </span>
                </div>
                {i < circulos.length - 1 && (
                  <div className={`h-0.5 w-8 mb-4 ${r.done ? 'bg-gray-800' : 'bg-gray-200'}`} />
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // Operador: só mostra localização atual
  return (
    <div className="bg-white border border-gray-200 rounded-xl px-4 py-3 mb-4 flex items-center gap-3">
      <i className="bi bi-geo-alt-fill text-[#1a3a5c] text-base" />
      <span className="font-bold text-[#1a3a5c] text-sm">{setorAtualNome || '—'}</span>
      <span className={`text-xs px-2.5 py-1 rounded-full font-bold ${
        corStatus === 'info'    ? 'bg-blue-500 text-white' :
        corStatus === 'success' ? 'bg-green-500 text-white' :
        corStatus === 'warning' ? 'bg-yellow-100 text-yellow-800' :
        corStatus === 'danger'  ? 'bg-red-100 text-red-700' :
                                  'bg-gray-100 text-gray-700'
      }`}>{statusLabel || '—'}</span>
    </div>
  );
}
