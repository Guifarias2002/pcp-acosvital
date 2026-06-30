// Remove trailing zeros from numeric strings: "25.0000" → "25", "10.5000" → "10.5"
export function fmtQtd(q: string | number | null | undefined): string {
  if (q == null || q === '') return '—';
  const n = typeof q === 'string' ? parseFloat(q) : q;
  if (isNaN(n)) return String(q);
  return n.toLocaleString('pt-BR', { maximumFractionDigits: 4 });
}

export function fmtData(s: string | null | undefined): string {
  if (!s) return '—';
  const d = new Date(s);
  if (isNaN(d.getTime())) return s;
  return d.toLocaleDateString('pt-BR');
}

export function fmtHora(s: string | null | undefined): string {
  if (!s) return '—';
  const d = new Date(s);
  if (isNaN(d.getTime())) return s;
  return d.toLocaleString('pt-BR');
}

export function fmtDuracao(inicio: string | null | undefined, fim: string | null | undefined): string {
  if (!inicio || !fim) return '—';
  const ms = new Date(fim).getTime() - new Date(inicio).getTime();
  if (ms <= 0) return '—';
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  if (h > 0) return `${h}h${m > 0 ? ` ${m}min` : ''}`;
  if (m > 0) return `${m}min`;
  return '< 1min';
}
