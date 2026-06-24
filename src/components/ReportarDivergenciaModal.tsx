'use client';
import { useState } from 'react';
import { getToken } from '@/lib/auth';

interface Props {
  pedidoId: number;
  pedidoNumero: string;
  itens?: { id: number; codigo: string; descricao: string }[];
  onClose: () => void;
  onSuccess: () => void;
}

const TIPOS = [
  { value: 'qualidade',      label: 'Qualidade',      icon: 'bi-shield-exclamation', color: '#dc2626' },
  { value: 'quantidade',     label: 'Quantidade',     icon: 'bi-123',               color: '#d97706' },
  { value: 'dano',           label: 'Dano / Avaria',  icon: 'bi-box-seam',          color: '#7c3aed' },
  { value: 'documentacao',   label: 'Documentação',   icon: 'bi-file-earmark-x',    color: '#0891b2' },
  { value: 'prazo',          label: 'Prazo',          icon: 'bi-calendar-x',        color: '#059669' },
  { value: 'outro',          label: 'Outro',          icon: 'bi-three-dots',        color: '#6b7280' },
];

const PRIORIDADES = [
  { value: 'baixa',    label: 'Baixa',    color: '#6b7280' },
  { value: 'normal',   label: 'Normal',   color: '#2563eb' },
  { value: 'alta',     label: 'Alta',     color: '#d97706' },
  { value: 'urgente',  label: 'Urgente',  color: '#dc2626' },
];

export default function ReportarDivergenciaModal({ pedidoId, pedidoNumero, itens, onClose, onSuccess }: Props) {
  const [tipo, setTipo] = useState('');
  const [descricao, setDescricao] = useState('');
  const [itemId, setItemId] = useState('');
  const [prioridade, setPrioridade] = useState('normal');
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState('');

  async function enviar() {
    if (!tipo) return setErro('Selecione o tipo da divergência.');
    if (!descricao.trim()) return setErro('Descreva a divergência.');
    setErro('');
    setLoading(true);
    try {
      const res = await fetch('/api/divergencias', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken() || ''}` },
        body: JSON.stringify({
          pedido_id: pedidoId,
          item_id: itemId ? Number(itemId) : null,
          tipo,
          descricao: descricao.trim(),
          prioridade,
        }),
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.erro || 'Erro'); }
      onSuccess();
    } catch (e: unknown) {
      setErro((e as Error).message || 'Erro ao reportar divergência');
    } finally {
      setLoading(false);
    }
  }

  const overlay: React.CSSProperties = {
    position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)',
    display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
  };

  return (
    <div style={overlay}>
      <div style={{ background: '#fff', borderRadius: 16, padding: 28, width: 520, maxWidth: '95vw', boxShadow: '0 8px 40px rgba(0,0,0,.2)' }}>
        {/* Header */}
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#888', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 }}>
            Reportar Divergência
          </div>
          <div style={{ fontSize: 18, fontWeight: 800, color: '#dc2626' }}>
            <i className="bi bi-exclamation-triangle-fill" style={{ marginRight: 8 }} />
            {pedidoNumero}
          </div>
        </div>

        {/* Tipo */}
        <div style={{ marginBottom: 16 }}>
          <label style={{ fontSize: 12, fontWeight: 700, color: '#555', display: 'block', marginBottom: 8 }}>
            Tipo da Divergência <span style={{ color: '#dc2626' }}>*</span>
          </label>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
            {TIPOS.map(t => (
              <button key={t.value} onClick={() => setTipo(t.value)}
                style={{
                  border: `2px solid ${tipo === t.value ? t.color : '#e5e7eb'}`,
                  background: tipo === t.value ? t.color + '15' : '#fff',
                  borderRadius: 8, padding: '10px 6px', cursor: 'pointer',
                  display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
                }}>
                <i className={`bi ${t.icon}`} style={{ fontSize: 20, color: t.color }} />
                <span style={{ fontSize: 11, fontWeight: 700, color: tipo === t.value ? t.color : '#555' }}>{t.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Item (opcional) */}
        {itens && itens.length > 0 && (
          <div style={{ marginBottom: 16 }}>
            <label style={{ fontSize: 12, fontWeight: 700, color: '#555', display: 'block', marginBottom: 6 }}>
              Item relacionado <span style={{ color: '#aaa', fontWeight: 400 }}>(opcional)</span>
            </label>
            <select value={itemId} onChange={e => setItemId(e.target.value)}
              style={{ width: '100%', border: '1px solid #e5e7eb', borderRadius: 8, padding: '8px 12px', fontSize: 13 }}>
              <option value="">— Divergência geral do pedido —</option>
              {itens.map(i => (
                <option key={i.id} value={i.id}>{i.codigo} — {i.descricao}</option>
              ))}
            </select>
          </div>
        )}

        {/* Prioridade */}
        <div style={{ marginBottom: 16 }}>
          <label style={{ fontSize: 12, fontWeight: 700, color: '#555', display: 'block', marginBottom: 8 }}>
            Prioridade
          </label>
          <div style={{ display: 'flex', gap: 8 }}>
            {PRIORIDADES.map(p => (
              <button key={p.value} onClick={() => setPrioridade(p.value)}
                style={{
                  flex: 1, border: `2px solid ${prioridade === p.value ? p.color : '#e5e7eb'}`,
                  background: prioridade === p.value ? p.color + '15' : '#fff',
                  borderRadius: 8, padding: '7px 0', cursor: 'pointer',
                  fontSize: 12, fontWeight: 700, color: prioridade === p.value ? p.color : '#888',
                }}>
                {p.label}
              </button>
            ))}
          </div>
        </div>

        {/* Descrição */}
        <div style={{ marginBottom: 20 }}>
          <label style={{ fontSize: 12, fontWeight: 700, color: '#555', display: 'block', marginBottom: 6 }}>
            Descreva a divergência <span style={{ color: '#dc2626' }}>*</span>
          </label>
          <textarea
            value={descricao} onChange={e => setDescricao(e.target.value)} rows={3}
            placeholder="Ex: Produto chegou com amassado na lateral, quantidade recebida foi 8 em vez de 10..."
            style={{ width: '100%', border: '1px solid #e5e7eb', borderRadius: 8, padding: '10px 12px', fontSize: 13, resize: 'none', boxSizing: 'border-box' }}
          />
        </div>

        {erro && (
          <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: '10px 12px', marginBottom: 14, fontSize: 13, color: '#dc2626' }}>
            <i className="bi bi-exclamation-circle" style={{ marginRight: 6 }} />{erro}
          </div>
        )}

        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={onClose} disabled={loading}
            style={{ flex: 1, background: '#f3f4f6', color: '#555', border: 'none', borderRadius: 8, padding: '11px 0', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
            Cancelar
          </button>
          <button onClick={enviar} disabled={loading || !tipo || !descricao.trim()}
            style={{ flex: 2, background: '#dc2626', color: '#fff', border: 'none', borderRadius: 8, padding: '11px 0', fontSize: 13, fontWeight: 700, cursor: 'pointer', opacity: loading || !tipo || !descricao.trim() ? .5 : 1 }}>
            <i className="bi bi-exclamation-triangle-fill" style={{ marginRight: 6 }} />
            {loading ? 'Enviando...' : 'Registrar Divergência'}
          </button>
        </div>
      </div>
    </div>
  );
}
