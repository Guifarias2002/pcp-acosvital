'use client';
import { MOTIVOS_PAUSA, type MotivoPausa } from '@/lib/maquinas';

interface Props {
  /** Texto do subtítulo (ex.: nome da máquina ou do item que vai pausar). */
  contexto?: string;
  loading?: boolean;
  onCancel: () => void;
  onConfirm: (motivo: MotivoPausa) => void;
}

/**
 * Modal de "Motivo da pausa" — só usado na Usinagem/Furação. O operador escolhe
 * por que está pausando. Motivos de troca/quebra de máquina (pedeMaquina) fazem
 * o "Retomar" pedir a máquina de novo; os demais retomam direto na mesma
 * máquina. Ver MOTIVOS_PAUSA em src/lib/maquinas.ts.
 */
export default function PausarModal({ contexto, loading, onCancel, onConfirm }: Props) {
  const simples = MOTIVOS_PAUSA.filter(m => !m.pedeMaquina);
  const maquina = MOTIVOS_PAUSA.filter(m => m.pedeMaquina);

  const botaoMotivo = (m: MotivoPausa, cor: string, corFundo: string, corBorda: string) => (
    <button
      key={m.codigo}
      onClick={() => onConfirm(m)}
      disabled={loading}
      style={{
        display: 'flex', alignItems: 'center', gap: 10, width: '100%',
        background: corFundo, border: `1px solid ${corBorda}`, borderRadius: 8,
        padding: '12px 14px', fontSize: 14, fontWeight: 600, color: cor,
        cursor: loading ? 'not-allowed' : 'pointer', textAlign: 'left', opacity: loading ? 0.6 : 1,
      }}
    >
      <i className={`bi ${m.icone}`} style={{ fontSize: 18 }} />
      {m.label}
    </button>
  );

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
    }}>
      <div style={{ background: '#fff', borderRadius: 14, padding: 24, width: 440, maxWidth: '94vw', maxHeight: '92vh', overflowY: 'auto', boxShadow: '0 8px 32px rgba(0,0,0,.18)' }}>
        <div style={{ marginBottom: 18 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#888', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 }}>
            Pausar produção
          </div>
          <div style={{ fontSize: 18, fontWeight: 800, color: '#1a3a5c' }}>
            Qual o motivo da pausa?
          </div>
          {contexto && (
            <div style={{ fontSize: 13, color: '#666', marginTop: 4 }}>{contexto}</div>
          )}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
          {simples.map(m => botaoMotivo(m, '#334155', '#f1f5f9', '#e2e8f0'))}
        </div>

        <div style={{ fontSize: 11, fontWeight: 700, color: '#b45309', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>
          <i className="bi bi-exclamation-triangle-fill" style={{ marginRight: 5 }} />
          Pede máquina ao retomar
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 20 }}>
          {maquina.map(m => botaoMotivo(m, '#9a3412', '#fff7ed', '#fed7aa'))}
        </div>

        <button onClick={onCancel} disabled={loading}
          style={{ width: '100%', background: '#f3f4f6', color: '#555', border: 'none', borderRadius: 8, padding: '11px 0', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
          Cancelar
        </button>
      </div>
    </div>
  );
}
