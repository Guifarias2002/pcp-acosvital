// Ícones das fábricas (usam currentColor — seguem a cor do botão/aba).
// Flange = disco com furo central, face elevada e 8 furos de parafuso.
// Caldeiraria = máscara de solda com visor.

export function IconeFlange({ size = 22 }: { size?: number }) {
  const furos = Array.from({ length: 8 }, (_, i) => {
    const a = (i * Math.PI) / 4 + Math.PI / 8;
    return { x: 12 + 8 * Math.cos(a), y: 12 + 8 * Math.sin(a) };
  });
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true" style={{ flexShrink: 0 }}>
      <circle cx="12" cy="12" r="11" stroke="currentColor" strokeWidth="1.6" />
      <circle cx="12" cy="12" r="5.6" stroke="currentColor" strokeWidth="1.2" opacity=".7" />
      <circle cx="12" cy="12" r="3.3" fill="currentColor" opacity=".9" />
      {furos.map((f, i) => <circle key={i} cx={f.x} cy={f.y} r="1.25" fill="currentColor" />)}
    </svg>
  );
}

export function IconeMascaraSolda({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true" style={{ flexShrink: 0 }}>
      {/* casco */}
      <path d="M12 1.8c-5 0-8.6 3.6-8.6 8.8v4.3c0 4.1 3.7 7.3 8.6 7.3s8.6-3.2 8.6-7.3v-4.3C20.6 5.4 17 1.8 12 1.8z"
        stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
      {/* visor */}
      <rect x="6.6" y="8.2" width="10.8" height="5.2" rx="1.3" fill="currentColor" />
      {/* reflexo do visor */}
      <path d="M8.2 9.6h3.2" stroke="#fff" strokeWidth="1" strokeLinecap="round" opacity=".55" />
      {/* respiro / queixo */}
      <path d="M9.5 17.3h5M10.2 19.2h3.6" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
      {/* pino da articulação */}
      <circle cx="3.4" cy="11.5" r="1" fill="currentColor" />
      <circle cx="20.6" cy="11.5" r="1" fill="currentColor" />
    </svg>
  );
}
