'use client';
import { useState } from 'react';
import { NOMES } from '@/lib/types';

type Acao = 'retrabalho' | 'resolver' | 'cancelar_item';

interface Props {
  itemCodigo: string;
  itemDescricao: string;
  acao: Acao;
  onConfirm: (obs: string, setorDestino?: string) => void;
  onCancel: () => void;
  loading?: boolean;
}

const SETORES = [
  'emissao','compras','recebimento','estoque','plasma','laser',
  'macarico','usinagem','beneficiadores','inspecao','acabamento','embalagem','logistica',
];

const CONFIG: Record<Acao, { titulo: string; cor: string; bg: string; icon: string; label: string; placeholder: string }> = {
  retrabalho: {
    titulo: 'Encaminhar para Retrabalho',
    cor: '#92400e', bg: '#fffbeb', icon: 'bi-tools',
    label: 'Descreva o problema e o que deve ser refeito:',
    placeholder: 'Ex: Rebarbas excessivas, dimensional fora de tolerância, solda incompleta...',
  },
  resolver: {
    titulo: 'Resolver Internamente',
    cor: '#166534', bg: '#f0fdf4', icon: 'bi-check-circle',
    label: 'Descreva como o problema foi resolvido:',
    placeholder: 'Ex: Rebarbas removidas na própria inspeção, medidas corrigidas com acabamento manual...',
  },
  cancelar_item: {
    titulo: 'Cancelar Item',
    cor: '#991b1b', bg: '#fef2f2', icon: 'bi-x-circle',
    label: 'Justifique o motivo do cancelamento:',
    placeholder: 'Ex: Peça com trinca estrutural irreparável, material fora de especificação sem possibilidade de retrabalho...',
  },
};

export default function DivergenciaResolucaoModal({ itemCodigo, itemDescricao, acao, onConfirm, onCancel, loading }: Props) {
  const [obs, setObs] = useState('');
  const [setor, setSetor] = useState('');
  const cfg = CONFIG[acao];

  const podeContinuar = obs.trim().length >= 5 && (acao !== 'retrabalho' || setor !== '');

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
    }}>
      <div style={{ background: '#fff', borderRadius: 14, padding: 28, width: 460, maxWidth: '94vw', boxShadow: '0 8px 32px rgba(0,0,0,.2)' }}>

        {/* Header */}
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#888', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 }}>
            Resolução de Divergência
          </div>
          <div style={{ fontSize: 18, fontWeight: 800, color: cfg.cor, display: 'flex', alignItems: 'center', gap: 8 }}>
            <i className={`bi ${cfg.icon}`} />
            {cfg.titulo}
          </div>
          {/* Item */}
          <div style={{ marginTop: 12, background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, padding: '10px 14px' }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#1a3a5c' }}>
              <i className="bi bi-box-seam" style={{ marginRight: 6 }} />{itemCodigo}
              <span style={{ fontWeight: 400, color: '#64748b', marginLeft: 6 }}>{itemDescricao}</span>
            </div>
          </div>
        </div>

        {/* Setor destino (só retrabalho) */}
        {acao === 'retrabalho' && (
          <div style={{ marginBottom: 16 }}>
            <label style={{ fontSize: 12, fontWeight: 700, color: '#555', display: 'block', marginBottom: 6 }}>
              Encaminhar para qual setor?
            </label>
            <select value={setor} onChange={e => setSetor(e.target.value)}
              style={{ width: '100%', border: '2px solid #e2e8f0', borderRadius: 8, padding: '9px 12px', fontSize: 14, color: '#1a3a5c', fontWeight: 600 }}>
              <option value="">Selecione o setor...</option>
              {SETORES.map(s => (
                <option key={s} value={s}>{NOMES[s] || s}</option>
              ))}
            </select>
          </div>
        )}

        {/* Observação */}
        <div style={{ marginBottom: 20 }}>
          <label style={{ fontSize: 12, fontWeight: 700, color: '#555', display: 'block', marginBottom: 6 }}>
            {cfg.label}
          </label>
          <textarea
            value={obs}
            onChange={e => setObs(e.target.value)}
            rows={4}
            autoFocus
            placeholder={cfg.placeholder}
            style={{
              width: '100%', border: '2px solid #e2e8f0', borderRadius: 8,
              padding: '10px 12px', fontSize: 13, resize: 'vertical',
              boxSizing: 'border-box', lineHeight: 1.5,
              borderColor: obs.trim().length > 0 && obs.trim().length < 5 ? '#fca5a5' : '#e2e8f0',
            }}
          />
          {obs.trim().length > 0 && obs.trim().length < 5 && (
            <div style={{ fontSize: 11, color: '#dc2626', marginTop: 4 }}>Mínimo 5 caracteres</div>
          )}
        </div>

        {/* Aviso cancelamento */}
        {acao === 'cancelar_item' && (
          <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: '10px 14px', marginBottom: 16, fontSize: 12, color: '#991b1b' }}>
            <i className="bi bi-exclamation-triangle-fill" style={{ marginRight: 6 }} />
            <strong>Atenção:</strong> Esta ação é irreversível. O item será cancelado e não voltará à produção.
          </div>
        )}

        {/* Botões */}
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={onCancel} disabled={loading}
            style={{ flex: 1, background: '#f3f4f6', color: '#555', border: 'none', borderRadius: 8, padding: '12px 0', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
            Cancelar
          </button>
          <button
            onClick={() => podeContinuar && onConfirm(obs.trim(), setor || undefined)}
            disabled={loading || !podeContinuar}
            style={{
              flex: 2, background: podeContinuar ? cfg.cor : '#94a3b8',
              color: '#fff', border: 'none', borderRadius: 8, padding: '12px 0',
              fontSize: 13, fontWeight: 700, cursor: podeContinuar ? 'pointer' : 'not-allowed',
            }}>
            <i className={`bi ${cfg.icon}`} style={{ marginRight: 6 }} />
            {loading ? 'Aguarde...' : cfg.titulo}
          </button>
        </div>
      </div>
    </div>
  );
}
