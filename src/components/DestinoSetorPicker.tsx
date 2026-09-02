'use client';
import { useMemo, useState } from 'react';
import { FABRICAS, NOMES } from '@/lib/types';

// Menu de DESTINO agrupado por área (fábrica). O operador escolhe primeiro a
// área (Flanges / Caldeiraria) e depois o setor de destino dentro dela.
//  - "Flanges"     = setores do Flange (Usinagem, Cortes, Furação, Logística…)
//  - "Caldeiraria" = os setores da HRM (processo cald_*: Corte Oxi, Solda,
//    Pinturas, Book, NF…).
// Pode mandar pra QUALQUER setor da área (redirecionar) — o backend já aceita
// qualquer setor válido, não trava no roteiro. Os setores que estão no roteiro
// do item vêm primeiro e marcados; o "próximo no roteiro" já vem selecionado.
export default function DestinoSetorPicker({
  setorAtual,
  roteiro = [],
  proximoSetor = null,
  value,
  onChange,
}: {
  setorAtual: string;
  roteiro?: string[];
  proximoSetor?: string | null;
  value: string;
  onChange: (cod: string) => void;
}) {
  const nomeDe = (c: string) => NOMES[c] || c;
  const areaDe = (c: string) => FABRICAS.find(f => f.setores.includes(c))?.cod;

  // Aba inicial: a área do próximo (ou do valor já escolhido, ou do setor atual).
  const [aba, setAba] = useState<string>(
    () => areaDe(proximoSetor || value || setorAtual) || FABRICAS[0].cod,
  );

  const fab = FABRICAS.find(f => f.cod === aba) || FABRICAS[0];
  const roteiroSet = useMemo(() => new Set(roteiro), [roteiro]);

  // Setores da aba (menos o atual): os do roteiro primeiro, na ordem do roteiro;
  // depois o restante da área, na ordem da fábrica. Sem duplicar.
  const setoresAba = useMemo(() => {
    const base = fab.setores.filter(s => s !== setorAtual);
    const noRoteiro = roteiro.filter(s => base.includes(s) && s !== setorAtual);
    const resto = base.filter(s => !roteiroSet.has(s));
    return Array.from(new Set([...noRoteiro, ...resto]));
  }, [fab, setorAtual, roteiro, roteiroSet]);

  return (
    <div>
      {/* Abas por área */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 10, flexWrap: 'wrap' }}>
        {FABRICAS.map(f => {
          const ativa = f.cod === aba;
          return (
            <button key={f.cod} type="button" onClick={() => setAba(f.cod)}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 14px',
                borderRadius: 20, fontSize: 12.5, fontWeight: 700, cursor: 'pointer',
                border: ativa ? '2px solid #1a3a5c' : '1px solid #dee2e6',
                background: ativa ? '#1a3a5c' : '#fff',
                color: ativa ? '#fff' : '#334155',
              }}>
              <i className={`bi ${f.icon}`} />{f.nome}
            </button>
          );
        })}
      </div>

      {/* Setores da área (clique pra escolher o destino) */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 260, overflowY: 'auto' }}>
        {setoresAba.map(s => {
          const sel = s === value;
          const ehProximo = s === proximoSetor;
          const noRoteiro = roteiroSet.has(s);
          return (
            <button key={s} type="button" onClick={() => onChange(s)}
              style={{
                display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', borderRadius: 8,
                cursor: 'pointer', textAlign: 'left', width: '100%',
                border: sel ? '2px solid #0d6efd' : '1px solid #e5e7eb',
                background: sel ? '#eff6ff' : '#fafafa',
              }}>
              <span style={{
                width: 16, height: 16, borderRadius: 8, flexShrink: 0,
                border: sel ? '5px solid #0d6efd' : '2px solid #cbd5e1',
                background: '#fff',
              }} />
              <span style={{ flex: 1, fontSize: 13, fontWeight: 600, color: '#1a3a5c' }}>{nomeDe(s)}</span>
              {ehProximo && (
                <span style={{ fontSize: 10, background: '#dbeafe', color: '#1d4ed8', padding: '1px 7px', borderRadius: 10, fontWeight: 700 }}>
                  próximo
                </span>
              )}
              {!ehProximo && noRoteiro && (
                <span style={{ fontSize: 10, background: '#f1f5f9', color: '#64748b', padding: '1px 7px', borderRadius: 10, fontWeight: 700 }}>
                  roteiro
                </span>
              )}
            </button>
          );
        })}
        {setoresAba.length === 0 && (
          <span style={{ fontSize: 12, color: '#9ca3af', padding: '4px 2px' }}>Nenhum setor nesta área.</span>
        )}
      </div>
    </div>
  );
}
