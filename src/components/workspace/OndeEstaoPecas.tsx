'use client';
import { useState } from 'react';
import { NOMES, STATUS_LABELS, ItemParcial, PARCIAL_STATUS_LABELS } from '@/lib/types';

const COR_STATUS_PARCIAL: Record<string, { bg: string; text: string }> = {
  em_aberto:        { bg: '#dbeafe', text: '#1d4ed8' },
  em_andamento:     { bg: '#fed7aa', text: '#9a3412' },
  pausado:          { bg: '#fef9c3', text: '#92400e' },
  finalizado_setor: { bg: '#ccfbf1', text: '#0f766e' },
  concluida:        { bg: '#dcfce7', text: '#166534' },
  cancelada:        { bg: '#f3f4f6', text: '#9ca3af' },
};

interface Props {
  roteiro: string[];
  idxAtual: number;
  qtdAtivaPorSetor: Record<string, number>;
  qtdConcluidaPorSetor: Record<string, number>;
  setorAtual: string;
  status: string;
  corStatus: string;
  unidade: string;
  qtdTotal: string;
  qtdEntregue: string;
  entregue: boolean;
  parciais?: ItemParcial[];
}

export default function OndeEstaoPecas({
  roteiro, idxAtual, qtdAtivaPorSetor, qtdConcluidaPorSetor,
  setorAtual, status, corStatus, unidade, qtdTotal, qtdEntregue, entregue,
  parciais = [],
}: Props) {
  const [expandido, setExpandido] = useState<string | null>(null);

  // Agrupa parciais por setor
  const parciaisPorSetor: Record<string, ItemParcial[]> = {};
  for (const p of parciais) {
    if (p.status === 'cancelada') continue;
    if (!parciaisPorSetor[p.setor_atual]) parciaisPorSetor[p.setor_atual] = [];
    parciaisPorSetor[p.setor_atual].push(p);
  }

  function toggleSetor(setor: string) {
    setExpandido(prev => prev === setor ? null : setor);
  }

  return (
    <div className="bg-white rounded-xl border shadow-sm p-4">
      <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Onde estão as peças</p>
      <div className="space-y-1">
        {roteiro.map((setor, i) => {
          const qtdAtiva     = qtdAtivaPorSetor[setor] || 0;
          const qtdConcluida = qtdConcluidaPorSetor[setor] || 0;
          const temQtd       = qtdAtiva > 0 || qtdConcluida > 0;
          const done         = entregue || (i < idxAtual && !temQtd);
          const current      = qtdAtiva > 0;
          const concluiuAqui = qtdConcluida > 0 && qtdAtiva === 0;
          const isPrincipal  = !entregue && setor === setorAtual;
          const clicavel     = temQtd;
          const aberto       = expandido === setor;
          const parciaisDoSetor = parciaisPorSetor[setor] || [];

          return (
            <div key={setor}>
              {/* Linha do setor */}
              <div
                onClick={() => clicavel && toggleSetor(setor)}
                className={`flex items-center justify-between px-3 py-2 rounded text-sm border transition-all ${
                  current      ? 'bg-orange-50 border-orange-200' :
                  concluiuAqui ? 'bg-green-50 border-green-200'  :
                                 'border-transparent'
                } ${clicavel ? 'cursor-pointer hover:shadow-sm' : ''}`}
              >
                <div className="flex items-center gap-2 flex-wrap">
                  <div className={`w-3 h-3 rounded-full flex-shrink-0 ${
                    current ? 'bg-orange-500' : (done || concluiuAqui) ? 'bg-green-500' : 'bg-gray-200'
                  }`} />
                  <span className={`text-sm font-medium ${
                    current ? 'text-orange-700' : (done || concluiuAqui) ? 'text-green-700' : 'text-gray-400'
                  }`}>
                    {NOMES[setor] || setor}
                  </span>
                  {isPrincipal && (
                    <span className={`text-xs px-1.5 py-0.5 rounded ${
                      corStatus === 'info' ? 'bg-blue-500 text-white' : 'bg-orange-400 text-white'
                    }`}>
                      {STATUS_LABELS[status] || status}
                    </span>
                  )}
                  {current && !isPrincipal && (
                    <span className="text-xs px-1.5 py-0.5 rounded bg-blue-100 text-blue-700">Parcial</span>
                  )}
                </div>

                <div className="flex items-center gap-2 flex-shrink-0 ml-2">
                  {qtdAtiva > 0 && (
                    <span className="text-sm font-bold text-orange-700">{qtdAtiva} {unidade}</span>
                  )}
                  {qtdConcluida > 0 && qtdAtiva === 0 && (
                    <span className="text-sm font-bold text-green-700">✓ {qtdConcluida} {unidade}</span>
                  )}
                  {qtdConcluida > 0 && qtdAtiva > 0 && (
                    <span className="text-xs text-green-600">(+{qtdConcluida} concl.)</span>
                  )}
                  {!temQtd && done && (
                    <span className="text-xs text-green-600">Concluído</span>
                  )}
                  {!temQtd && !done && i > idxAtual && (
                    <span className="text-xs text-gray-400">Falta chegar</span>
                  )}
                  {clicavel && (
                    <i className={`bi bi-eye${aberto ? '-slash' : ''} text-blue-400 text-sm`} />
                  )}
                </div>
              </div>

              {/* Painel expandido inline */}
              {aberto && (
                <div style={{
                  margin: '2px 0 6px 20px',
                  border: '1px solid #e0f2fe',
                  borderRadius: 8,
                  background: '#f0f9ff',
                  padding: '12px 14px',
                }}>
                  <div style={{ fontWeight: 700, fontSize: 13, color: '#1a3a5c', marginBottom: 8 }}>
                    <i className="bi bi-geo-alt-fill" style={{ marginRight: 6, color: '#0d6efd' }} />
                    {NOMES[setor] || setor}
                  </div>

                  {parciaisDoSetor.length > 0 ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {parciaisDoSetor.map(p => {
                        const cor = COR_STATUS_PARCIAL[p.status] || { bg: '#f3f4f6', text: '#555' };
                        return (
                          <div key={p.id} style={{
                            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                            background: '#fff', borderRadius: 6, padding: '8px 12px',
                            border: '1px solid #bae6fd', gap: 8,
                          }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              {p.parcial_origem_id && (
                                <span style={{ color: '#94a3b8', fontSize: 11 }}>└ envio parcial</span>
                              )}
                              <span style={{ fontWeight: 700, fontSize: 15, color: '#0d6efd' }}>
                                {p.quantidade} <span style={{ fontSize: 12, fontWeight: 500, color: '#64748b' }}>{unidade}</span>
                              </span>
                            </div>
                            <span style={{
                              fontSize: 11, padding: '2px 8px', borderRadius: 10, fontWeight: 600,
                              background: cor.bg, color: cor.text,
                            }}>
                              {PARCIAL_STATUS_LABELS[p.status] || p.status}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    // Sem parciais rastreadas (item sem sistema de parciais — status direto)
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      background: '#fff', borderRadius: 6, padding: '8px 12px', border: '1px solid #bae6fd' }}>
                      <span style={{ fontWeight: 700, fontSize: 15, color: '#0d6efd' }}>
                        {qtdAtiva || qtdConcluida} <span style={{ fontSize: 12, fontWeight: 500, color: '#64748b' }}>{unidade}</span>
                      </span>
                      <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 10, fontWeight: 600,
                        background: qtdAtiva > 0 ? '#fed7aa' : '#dcfce7', color: qtdAtiva > 0 ? '#9a3412' : '#166534' }}>
                        {qtdAtiva > 0 ? (STATUS_LABELS[status] || status) : '✓ Concluído'}
                      </span>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {Number(qtdEntregue) > 0 && (
        <div className="flex items-center justify-between px-3 py-2 rounded bg-green-50 border border-green-100 mt-1">
          <div className="flex items-center gap-2">
            <i className="bi bi-check-circle-fill text-green-600" />
            <span className="text-sm font-semibold text-green-700">Entregue ao cliente</span>
          </div>
          <span className="text-sm font-bold text-green-700">{qtdEntregue} {unidade}</span>
        </div>
      )}

      <div className="border-t mt-3 pt-3 flex items-center justify-between text-sm">
        <span className="font-semibold text-gray-600">Total</span>
        <span className="font-bold">{qtdTotal} {unidade}</span>
      </div>
    </div>
  );
}
