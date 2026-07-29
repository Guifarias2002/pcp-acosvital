'use client';
import { useState } from 'react';
import { getToken } from '@/lib/auth';
import { getChecklistEtapa, NOMES } from '@/lib/types';

type EstadoChecklist = 'confere' | 'nao_confere' | 'na';

// Checklist de processo de UMA etapa da Caldeiraria (Chanfradeira, Calandra,
// Montagem, Solda, Acabamento, Pintura, Liberado, Qualidade), parametrizado
// pelo tipo de produto do item. Cada submissão vira uma linha nova em
// producao_checklist_processo (nunca sobrescreve) — ver plano/memória do
// projeto. Bloqueia "Finalizar etapa"/"Enviar ao próximo setor" até confirmar.
export default function ChecklistProcessoModal({ parcialId, setor, tipoProduto, itemCodigo, onConfirmado, onCancel }: {
  parcialId: number;
  setor: string;
  tipoProduto: string | null;
  itemCodigo: string;
  onConfirmado: () => void;
  onCancel: () => void;
}) {
  const definicao = getChecklistEtapa(setor, tipoProduto);
  const [checklist, setChecklist] = useState<Record<string, EstadoChecklist>>({});
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState('');

  const CORES: Record<EstadoChecklist, string> = { confere: '#16a34a', nao_confere: '#dc2626', na: '#6b7280' };
  const LABELS: Record<EstadoChecklist, string> = { confere: '✓ Confere', nao_confere: '✕ Não confere', na: '— Não se aplica' };

  async function confirmar() {
    setErro('');
    setEnviando(true);
    try {
      const token = getToken();
      const respostas = definicao.map(d => ({ id: d.id, label: d.label, resposta: checklist[d.id] || 'na' }));
      const res = await fetch(`/api/parcial/${parcialId}/checklist-processo`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ setor, tipo_produto: tipoProduto, respostas }),
      });
      const data = await res.json();
      if (data.ok) onConfirmado();
      else setErro(data.erro || 'Erro ao salvar checklist');
    } catch {
      setErro('Erro ao salvar checklist');
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16 }}>
      <div style={{ background: '#fff', borderRadius: 14, padding: 28, width: 460, maxWidth: '94vw', maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 8px 32px rgba(0,0,0,.18)' }}>
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#888', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 }}>
            Checklist de Processo — {NOMES[setor] || setor}
          </div>
          <div style={{ fontSize: 16, fontWeight: 800, color: '#1a3a5c' }}>{itemCodigo}</div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 16 }}>
          {definicao.map(c => {
            const estado = checklist[c.id];
            const opcoes: { valor: EstadoChecklist; label: string; cor: string }[] = [
              { valor: 'confere', label: 'Confere', cor: '#16a34a' },
              { valor: 'nao_confere', label: 'Não confere', cor: '#dc2626' },
              { valor: 'na', label: 'Não se aplica', cor: '#6b7280' },
            ];
            return (
              <div key={c.id} style={{ border: '1px solid #e5e7eb', borderRadius: 8, padding: '10px 12px' }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#1a3a5c', marginBottom: 8 }}>{c.label}</div>
                <div style={{ display: 'flex', gap: 6 }}>
                  {opcoes.map(op => (
                    <button key={op.valor}
                      onClick={() => setChecklist(prev => ({ ...prev, [c.id]: op.valor }))}
                      style={{
                        flex: 1, fontSize: 11, fontWeight: 700, padding: '6px 4px', borderRadius: 6, cursor: 'pointer',
                        border: `1.5px solid ${estado === op.valor ? op.cor : '#e5e7eb'}`,
                        background: estado === op.valor ? op.cor : '#fff',
                        color: estado === op.valor ? '#fff' : '#555',
                      }}>
                      {op.label}
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>

        {/* Relatório ao vivo */}
        {Object.keys(checklist).length > 0 && (
          <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, padding: '10px 12px', marginBottom: 16 }}>
            <p style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.5, margin: '0 0 8px' }}>
              Relatório de conferência
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {definicao.filter(c => checklist[c.id]).map(c => (
                <div key={c.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                  <span style={{ color: '#374151' }}>{c.label}</span>
                  <span style={{ fontWeight: 700, color: CORES[checklist[c.id]] }}>{LABELS[checklist[c.id]]}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {erro && (
          <div style={{ background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: 8, padding: '10px 14px', fontSize: 13, color: '#dc2626', marginBottom: 14 }}>
            <i className="bi bi-exclamation-triangle" style={{ marginRight: 6 }} />{erro}
          </div>
        )}

        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={onCancel} disabled={enviando}
            style={{ flex: 1, background: '#f3f4f6', color: '#555', border: 'none', borderRadius: 8, padding: '11px 0', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
            Cancelar
          </button>
          <button
            onClick={confirmar}
            disabled={enviando || definicao.some(c => !checklist[c.id])}
            style={{ flex: 2, background: '#1a3a5c', color: '#fff', border: 'none', borderRadius: 8, padding: '11px 0', fontSize: 13, fontWeight: 700, cursor: 'pointer', opacity: enviando ? .6 : 1 }}>
            {enviando ? 'Salvando...' : 'Confirmar e continuar →'}
          </button>
        </div>
      </div>
    </div>
  );
}
