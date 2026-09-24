'use client';
// Peças comuns da tela Planejamento da Caldeiraria (/cald-plano).
import type { ReactNode } from 'react';
import { AREA_POR_CODIGO, type ItemCald } from '@/lib/caldPlano';

export const C = {
  azul: '#1a3a5c', azul2: '#1d4ed8', verde: '#16a34a', laranja: '#d97706', vermelho: '#dc2626',
  roxo: '#7c3aed', cinza: '#64748b', borda: '#e2e8f0', fundo: '#f8fafc', texto: '#334155', fraco: '#94a3b8',
};

export const PRIO: Record<string, { txt: string; cor: string }> = {
  urgente: { txt: 'Urgente', cor: C.vermelho },
  alta:    { txt: 'Alta',    cor: C.laranja },
  normal:  { txt: 'Normal',  cor: C.azul2 },
  baixa:   { txt: 'Baixa',   cor: C.cinza },
};

export const STATUS_TXT: Record<string, { txt: string; cor: string; bg: string }> = {
  novo:       { txt: 'Novo — planejar', cor: '#92400e', bg: '#fef3c7' },
  aguardando: { txt: 'Chegando',        cor: '#1d4ed8', bg: '#dbeafe' },
  andamento:  { txt: 'Em produção',     cor: '#166534', bg: '#dcfce7' },
  finalizado: { txt: 'Finalizado',      cor: '#334155', bg: '#e2e8f0' },
  cancelado:  { txt: 'Cancelado',       cor: '#991b1b', bg: '#fee2e2' },
};

export const nomeArea = (c: string | null | undefined) => (c ? AREA_POR_CODIGO[c]?.nome ?? c : '—');

export function fmtQtd(q: number | null | undefined, un?: string | null): string {
  if (q === null || q === undefined) return '—';
  return `${q.toLocaleString('pt-BR', { maximumFractionDigits: 2 })} ${un || 'pç'}`;
}
export function fmtBRL(v: number | null | undefined): string {
  if (v === null || v === undefined) return '—';
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}
// Soma de quantidades por unidade: "12 pç · 7.629 kg".
export function somaPorUnidade(itens: ItemCald[]): string {
  const m = new Map<string, number>();
  for (const it of itens) if (it.quantidade !== null) m.set(it.unidade || 'pç', (m.get(it.unidade || 'pç') || 0) + it.quantidade);
  if (!m.size) return '—';
  return Array.from(m.entries()).map(([u, q]) => fmtQtd(q, u)).join(' · ');
}
export function somaValor(itens: ItemCald[]): number | null {
  let t = 0, tem = false;
  for (const it of itens) if (it.valor !== null) { t += it.valor; tem = true; }
  return tem ? t : null;
}

export function Chip({ children, cor, bg, title }: { children: ReactNode; cor: string; bg: string; title?: string }) {
  return (
    <span title={title} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 10.5, fontWeight: 800, color: cor, background: bg, borderRadius: 7, padding: '2px 7px', whiteSpace: 'nowrap', lineHeight: 1.4 }}>
      {children}
    </span>
  );
}

export function AreaTag({ area, ativa, feita }: { area: string; ativa?: boolean; feita?: boolean }) {
  const a = AREA_POR_CODIGO[area];
  const cor = a?.cor || C.cinza;
  return (
    <span title={a?.nome} style={{
      display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 700, borderRadius: 7, padding: '2px 8px',
      border: `1.5px solid ${ativa ? cor : feita ? cor + '55' : C.borda}`,
      background: ativa ? cor : feita ? cor + '14' : '#fff',
      color: ativa ? '#fff' : feita ? cor : C.fraco, whiteSpace: 'nowrap',
    }}>
      <i className={`bi ${a?.icon || 'bi-dot'}`} />{a?.nome || area}
    </span>
  );
}

export function Modal({ titulo, onFechar, children, largura = 720, rodape }: {
  titulo: ReactNode; onFechar: () => void; children: ReactNode; largura?: number; rodape?: ReactNode;
}) {
  return (
    <div className="cp-overlay" onMouseDown={e => { if (e.target === e.currentTarget) onFechar(); }}>
      <div className="cp-modal" style={{ maxWidth: largura }} role="dialog" aria-modal="true">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 18px', borderBottom: `1px solid ${C.borda}` }}>
          <div style={{ flex: 1, minWidth: 0, fontWeight: 800, color: C.azul, fontSize: 16 }}>{titulo}</div>
          <button className="cp-x" onClick={onFechar} aria-label="Fechar"><i className="bi bi-x-lg" /></button>
        </div>
        <div style={{ padding: 18, overflowY: 'auto', flex: 1 }}>{children}</div>
        {rodape && <div style={{ padding: '12px 18px', borderTop: `1px solid ${C.borda}`, display: 'flex', gap: 8, justifyContent: 'flex-end', flexWrap: 'wrap' }}>{rodape}</div>}
      </div>
    </div>
  );
}

export function Campo({ rot, children, largura }: { rot: string; children: ReactNode; largura?: number | string }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0, flex: largura ? `0 1 ${typeof largura === 'number' ? largura + 'px' : largura}` : '1 1 160px' }}>
      <span style={{ fontSize: 11, fontWeight: 700, color: C.cinza, textTransform: 'uppercase', letterSpacing: .3 }}>{rot}</span>
      {children}
    </label>
  );
}

export function erroDe(e: unknown, padrao: string): string {
  const r = (e as { response?: { data?: { erro?: string } } })?.response;
  return r?.data?.erro || padrao;
}

// CSS da tela (prefixo cp-). Inclui a impressão do relatório semanal.
export const CSS = `
  .cp-btn{display:inline-flex;align-items:center;gap:6px;border:1.5px solid ${C.borda};background:#fff;border-radius:8px;padding:7px 12px;font-size:12.5px;font-weight:700;color:${C.texto};cursor:pointer;white-space:nowrap}
  .cp-btn:hover{border-color:${C.azul}}
  .cp-btn:disabled{opacity:.55;cursor:default}
  .cp-btn.pri{background:${C.azul};border-color:${C.azul};color:#fff}
  .cp-btn.ok{background:${C.verde};border-color:${C.verde};color:#fff}
  .cp-btn.perigo{color:${C.vermelho};border-color:#fecaca}
  .cp-btn.sm{padding:4px 8px;font-size:11.5px;border-radius:7px}
  .cp-in{border:1.5px solid ${C.borda};border-radius:7px;padding:7px 9px;font-size:13px;color:${C.texto};background:#fff;width:100%;min-width:0;font-family:inherit}
  .cp-in:focus{outline:none;border-color:${C.azul2}}
  .cp-tab{display:inline-flex;align-items:center;gap:6px;font-size:13px;font-weight:700;border:1.5px solid ${C.borda};border-radius:10px;padding:8px 14px;cursor:pointer;background:#fff;color:#475569}
  .cp-tab.on{background:${C.azul};border-color:${C.azul};color:#fff}
  .cp-overlay{position:fixed;inset:0;background:rgba(15,23,42,.45);z-index:1050;display:flex;align-items:flex-start;justify-content:center;padding:32px 16px;overflow-y:auto}
  .cp-modal{background:#fff;border-radius:14px;width:100%;max-height:calc(100vh - 64px);display:flex;flex-direction:column;box-shadow:0 20px 50px rgba(0,0,0,.25)}
  .cp-x{border:none;background:none;font-size:16px;color:${C.cinza};cursor:pointer;padding:4px 6px;border-radius:6px}
  .cp-x:hover{background:#f1f5f9}
  .cp-card{background:#fff;border:1px solid ${C.borda};border-radius:10px;padding:9px 10px;cursor:pointer;position:relative}
  .cp-card:hover{border-color:${C.azul2};box-shadow:0 2px 8px rgba(29,78,216,.12)}
  .cp-card.drag{opacity:.4}
  .cp-col{background:${C.fundo};border:1px solid ${C.borda};border-radius:12px;display:flex;flex-direction:column;min-width:250px;width:250px;flex-shrink:0;max-height:calc(100vh - 290px)}
  .cp-col.alvo{border-color:${C.azul2};background:#eff6ff}
  .cp-tile{background:#fff;border:1.5px solid ${C.borda};border-radius:12px;padding:10px 14px;cursor:pointer;text-align:left;min-width:0}
  .cp-tile.on{border-color:${C.azul};box-shadow:0 0 0 2px ${C.azul}33}
  .cp-tbl{width:100%;border-collapse:collapse;font-size:12.5px}
  .cp-tbl th{position:sticky;top:0;background:#f1f5f9;color:#475569;font-size:10.5px;text-transform:uppercase;letter-spacing:.3px;font-weight:800;text-align:left;padding:7px 8px;border-bottom:1px solid ${C.borda};white-space:nowrap;z-index:1}
  .cp-tbl td{padding:6px 8px;border-bottom:1px solid #f1f5f9;color:${C.texto};vertical-align:top}
  .cp-tbl tr.cl:hover td{background:#f8fafc;cursor:pointer}
  @media (max-width: 640px){
    .cp-overlay{padding:0}
    .cp-modal{border-radius:0;max-height:100vh;min-height:100vh}
    .cp-col{min-width:82vw;width:82vw}
  }
  @media print{
    #sidebar,.topbar,.no-print{display:none!important}
    #main{margin-left:0!important}
    .content{padding:0!important}
    .cp-print-bloco{break-inside:avoid}
    body{background:#fff!important}
  }
`;
