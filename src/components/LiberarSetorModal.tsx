'use client';
import { useState } from 'react';
import { SETOR_CHOICES } from '@/lib/types';

const NOMES = Object.fromEntries(SETOR_CHOICES);

export default function LiberarSetorModal({
  roteiro, setorAtual, proximoSetor, onConfirm, onCancel,
  parcial, qtdMax, unidade,
}: {
  roteiro: string[];
  setorAtual: string;
  proximoSetor: string | null;
  onConfirm: (setor: string, quantidade?: number) => void;
  onCancel: () => void;
  parcial?: boolean;       // modo parcial: exibe campo de quantidade
  qtdMax?: number;         // quantidade máxima permitida
  unidade?: string;
}) {
  const idxAtual = roteiro.indexOf(setorAtual);
  const setoresDisponiveis = roteiro.filter((_, i) => i > idxAtual);
  const [selecionado, setSelecionado] = useState<string>(proximoSetor || setoresDisponiveis[0] || '');
  const [qtd, setQtd] = useState('');

  const qtdNum = Number(qtd);
  const qtdValida = !parcial || (qtdNum > 0 && (!qtdMax || qtdNum < qtdMax));
  const podeSalvar = !!selecionado && qtdValida;

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ background: '#fff', borderRadius: 12, padding: 28, minWidth: 380, maxWidth: 480, boxShadow: '0 8px 32px rgba(0,0,0,0.18)' }}>
        <h3 style={{ margin: '0 0 6px', fontSize: 16, color: '#1a3a5c', fontWeight: 700 }}>
          <i className={`bi bi-${parcial ? 'scissors' : 'send'}`} style={{ marginRight: 8 }} />
          {parcial ? 'Liberar Parcial' : 'Liberar para produção'}
        </h3>
        <p style={{ margin: '0 0 18px', fontSize: 13, color: '#666' }}>
          {parcial
            ? 'Informe a quantidade a enviar e o setor de destino. O restante permanece em Emissão.'
            : 'Selecione o setor de destino. O padrão é o próximo no roteiro.'}
        </p>

        {/* Campo de quantidade (modo parcial) */}
        {parcial && (
          <div style={{ marginBottom: 18 }}>
            <label style={{ fontSize: 12, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 6 }}>
              Quantidade a liberar {unidade ? `(${unidade})` : ''}
              {qtdMax && <span style={{ fontWeight: 400, color: '#9ca3af', marginLeft: 4 }}>— máx. {qtdMax - 1}</span>}
            </label>
            <input
              type="number" min={1} max={qtdMax ? qtdMax - 1 : undefined}
              value={qtd} onChange={e => setQtd(e.target.value)}
              placeholder="Ex: 3"
              style={{ width: '100%', border: '1px solid #d1d5db', borderRadius: 7, padding: '8px 12px', fontSize: 14, outline: 'none' }}
              autoFocus
            />
            {qtd && !qtdValida && (
              <span style={{ fontSize: 11, color: '#dc2626', marginTop: 4, display: 'block' }}>
                {qtdNum <= 0 ? 'Quantidade deve ser maior que zero.' : `Máximo permitido: ${qtdMax! - 1} (use Liberar para enviar tudo).`}
              </span>
            )}
          </div>
        )}

        {/* Seleção de setor */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 22 }}>
          {setoresDisponiveis.length === 0 && (
            <span style={{ color: '#dc2626', fontSize: 13 }}>Nenhum setor disponível após o atual no roteiro.</span>
          )}
          {setoresDisponiveis.map((setor) => {
            const ehProximo = setor === (proximoSetor || setoresDisponiveis[0]);
            const selecionadoAtual = setor === selecionado;
            return (
              <label key={setor} style={{
                display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderRadius: 8, cursor: 'pointer',
                border: selecionadoAtual ? '2px solid #0d6efd' : '1px solid #e5e7eb',
                background: selecionadoAtual ? '#eff6ff' : '#fafafa',
              }}>
                <input type="radio" name="setor_destino" value={setor}
                  checked={selecionadoAtual} onChange={() => setSelecionado(setor)}
                  style={{ accentColor: '#0d6efd' }} />
                <span style={{ fontSize: 13, fontWeight: 600, color: '#1a3a5c' }}>{NOMES[setor] || setor}</span>
                {ehProximo && (
                  <span style={{ marginLeft: 'auto', fontSize: 10, background: '#dbeafe', color: '#1d4ed8', padding: '1px 7px', borderRadius: 10, fontWeight: 700 }}>
                    padrão
                  </span>
                )}
              </label>
            );
          })}
        </div>

        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button onClick={onCancel} style={{ padding: '8px 18px', borderRadius: 7, border: '1px solid #d1d5db', background: '#fff', cursor: 'pointer', fontSize: 13 }}>
            Cancelar
          </button>
          <button
            onClick={() => podeSalvar && onConfirm(selecionado, parcial ? qtdNum : undefined)}
            disabled={!podeSalvar}
            style={{ padding: '8px 20px', borderRadius: 7, border: 'none', background: podeSalvar ? (parcial ? '#0d6efd' : '#16a34a') : '#9ca3af', color: '#fff', cursor: podeSalvar ? 'pointer' : 'not-allowed', fontWeight: 700, fontSize: 13 }}>
            <i className={`bi bi-${parcial ? 'scissors' : 'send'}`} style={{ marginRight: 6 }} />
            {parcial ? 'Enviar Parcial' : 'Liberar'}
          </button>
        </div>
      </div>
    </div>
  );
}
