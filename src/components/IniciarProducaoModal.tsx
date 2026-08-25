'use client';
import { useState } from 'react';
import { MAQUINAS_POR_SETOR } from '@/lib/maquinas';

interface Props {
  setor: string;
  onCancel: () => void;
  onConfirm: (maquina: string, operador: string, quantidade?: number) => void;
  loading?: boolean;
  // Modo "retomar" (opcional): pré-preenche a máquina/operador atuais e mostra
  // o campo de quantidade a dar continuidade. Sem esses props, funciona igual
  // ao "Iniciar produção" original.
  titulo?: string;
  pergunta?: string;
  textoBotao?: string;
  maquinaInicial?: string | null;
  operadorInicial?: string | null;
  mostrarQuantidade?: boolean;
  quantidadeMax?: number;
  unidade?: string;
}

export default function IniciarProducaoModal({
  setor, onCancel, onConfirm, loading,
  titulo = 'Iniciar Produção', pergunta = 'Qual máquina e quem vai operar?',
  textoBotao, maquinaInicial, operadorInicial, mostrarQuantidade, quantidadeMax, unidade = 'un',
}: Props) {
  const [maquina, setMaquina] = useState(maquinaInicial || '');
  const [operador, setOperador] = useState(operadorInicial || '');
  const [qtd, setQtd] = useState(mostrarQuantidade && quantidadeMax != null ? String(quantidadeMax) : '');
  const grupos = MAQUINAS_POR_SETOR[setor] || [];
  const qtdNum = Number(qtd);
  const qtdOk = !mostrarQuantidade || (qtd !== '' && qtdNum > 0 && qtdNum <= (quantidadeMax ?? Infinity));
  const podeConfirmar = maquina.trim() !== '' && operador.trim() !== '' && qtdOk;

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
    }}>
      <div style={{ background: '#fff', borderRadius: 14, padding: 28, width: 420, maxWidth: '94vw', boxShadow: '0 8px 32px rgba(0,0,0,.18)' }}>
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#888', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 }}>
            {titulo}
          </div>
          <div style={{ fontSize: 18, fontWeight: 800, color: '#1a3a5c' }}>
            {pergunta}
          </div>
        </div>

        <label style={{ fontSize: 12, fontWeight: 600, color: '#555', display: 'block', marginBottom: 6 }}>
          Máquina
        </label>
        <select
          value={maquina}
          onChange={e => setMaquina(e.target.value)}
          autoFocus
          style={{ width: '100%', border: '1px solid #dee2e6', borderRadius: 6, padding: '9px 10px', fontSize: 14, fontWeight: 600, marginBottom: 16, boxSizing: 'border-box' }}
        >
          <option value="">Selecione a máquina...</option>
          {grupos.map(g => (
            <optgroup key={g.categoria} label={g.categoria}>
              {g.maquinas.map(m => <option key={m} value={m}>{m}</option>)}
            </optgroup>
          ))}
        </select>

        <label style={{ fontSize: 12, fontWeight: 600, color: '#555', display: 'block', marginBottom: 6 }}>
          Operador
        </label>
        <input
          type="text"
          value={operador}
          onChange={e => setOperador(e.target.value)}
          placeholder="Nome de quem vai operar a máquina"
          style={{ width: '100%', border: '1px solid #dee2e6', borderRadius: 6, padding: '9px 10px', fontSize: 14, marginBottom: 20, boxSizing: 'border-box' }}
        />

        {mostrarQuantidade && (
          <>
            <label style={{ fontSize: 12, fontWeight: 600, color: '#555', display: 'block', marginBottom: 6 }}>
              Quantidade a dar continuidade {quantidadeMax != null && <span style={{ color: '#888', fontWeight: 400 }}>(máx: {quantidadeMax} {unidade})</span>}
            </label>
            <input
              type="number"
              value={qtd}
              onChange={e => {
                const v = e.target.value;
                if (v === '' || quantidadeMax == null || Number(v) <= quantidadeMax) setQtd(v);
                else setQtd(String(quantidadeMax));
              }}
              min={1}
              max={quantidadeMax}
              style={{ width: '100%', border: '1px solid #dee2e6', borderRadius: 6, padding: '9px 10px', fontSize: 14, marginBottom: 8, boxSizing: 'border-box' }}
            />
            {quantidadeMax != null && qtdNum > 0 && qtdNum < quantidadeMax && (
              <p style={{ fontSize: 12, color: '#92400e', background: '#fef3c7', border: '1px solid #fde68a', borderRadius: 6, padding: '6px 10px', margin: '0 0 16px' }}>
                O restante ({quantidadeMax - qtdNum} {unidade}) continua pausado neste setor.
              </p>
            )}
          </>
        )}

        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={onCancel} disabled={loading}
            style={{ flex: 1, background: '#f3f4f6', color: '#555', border: 'none', borderRadius: 8, padding: '11px 0', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
            Cancelar
          </button>
          <button
            onClick={() => onConfirm(maquina.trim(), operador.trim(), mostrarQuantidade ? qtdNum : undefined)}
            disabled={loading || !podeConfirmar}
            style={{ flex: 2, background: '#16a34a', color: '#fff', border: 'none', borderRadius: 8, padding: '11px 0', fontSize: 13, fontWeight: 700, cursor: 'pointer', opacity: (loading || !podeConfirmar) ? .6 : 1 }}>
            <i className="bi bi-play-circle-fill" style={{ marginRight: 6 }} />
            {loading ? 'Processando...' : (textoBotao || 'Iniciar produção')}
          </button>
        </div>
      </div>
    </div>
  );
}
