'use client';
// Escolha da ÁREA da OP HRM: Caldeiraria Leve / Pesada / Outro setor (+ qual).
// Só informação (não muda roteiro). Usado no Anexar OP e na Conferência.
import { useEffect, useState } from 'react';
import { AREAS_HRM, nomeAreaHrm } from '@/lib/hrmAcomp';
import { getToken } from '@/lib/auth';
import { SETOR_CHOICES } from '@/lib/types';

export default function EscolhaAreaHrm({ area, outro, onChange, desabilitado }: {
  area: string; outro: string; onChange: (area: string, outro: string) => void; desabilitado?: boolean;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {AREAS_HRM.map(a => {
          const on = area === a.codigo;
          return (
            <button key={a.codigo} type="button" disabled={desabilitado} onClick={() => onChange(on ? '' : a.codigo, a.codigo === 'outro' ? outro : '')}
              aria-pressed={on}
              style={{
                flex: '1 1 120px', padding: '9px 10px', borderRadius: 9, cursor: desabilitado ? 'default' : 'pointer', fontSize: 13, fontWeight: 700,
                border: `2px solid ${on ? a.cor : '#e2e8f0'}`, background: on ? a.cor : '#fff', color: on ? '#fff' : '#334155',
              }}>
              {a.nome}
            </button>
          );
        })}
      </div>
      {area === 'outro' && (
        <>
          <input list="setores-hrm" value={outro} disabled={desabilitado} onChange={e => onChange('outro', e.target.value)}
            placeholder="Qual setor? (escolha na lista ou escreva)"
            style={{ border: '1px solid #e2e8f0', borderRadius: 8, padding: '8px 10px', fontSize: 13 }} />
          <datalist id="setores-hrm">{SETOR_CHOICES.map(([c, n]) => <option key={c} value={n} />)}</datalist>
        </>
      )}
    </div>
  );
}

// Versão que SALVA sozinha (Conferência): grava ao escolher; "outro" grava ao
// sair do campo. Mostra "Salvo" / erro.
export function AreaHrmSalvavel({ pedidoId, areaInicial, outroInicial, somenteLeitura }: {
  pedidoId: number; areaInicial: string | null | undefined; outroInicial: string | null | undefined; somenteLeitura?: boolean;
}) {
  const [area, setArea] = useState(areaInicial || '');
  const [outro, setOutro] = useState(outroInicial || '');
  const [msg, setMsg] = useState('');
  useEffect(() => { setArea(areaInicial || ''); setOutro(outroInicial || ''); }, [areaInicial, outroInicial]);
  async function gravar(a: string, o: string) {
    setMsg('Salvando…');
    try {
      const r = await fetch(`/api/pcp-hrm/pedidos/${pedidoId}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken() || ''}` },
        body: JSON.stringify({ area: a, area_outro: o }),
      });
      const d = await r.json().catch(() => ({}));
      setMsg(r.ok ? 'Salvo' : (d.erro || 'Não salvou'));
    } catch { setMsg('Erro de conexão — não salvou'); }
  }
  if (somenteLeitura) return <div style={{ fontSize: 14, fontWeight: 600, color: '#0f172a' }}>{nomeAreaHrm(area, outro) || '—'}</div>;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div onBlur={() => { if (area === 'outro') gravar('outro', outro); }}>
        <EscolhaAreaHrm area={area} outro={outro} onChange={(a, o) => {
          const trocouArea = a !== area;
          setArea(a); setOutro(o);
          if (trocouArea && a !== 'outro') gravar(a, '');
        }} />
      </div>
      {msg && <span style={{ fontSize: 11.5, color: msg === 'Salvo' ? '#16a34a' : msg === 'Salvando…' ? '#64748b' : '#dc2626' }}>{msg}</span>}
    </div>
  );
}
