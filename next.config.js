/** @type {import('next').NextConfig} */
const securityHeaders = [
  { key: 'X-DNS-Prefetch-Control', value: 'on' },
  { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
  {
    key: 'Content-Security-Policy',
    value: [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline'" + (process.env.NODE_ENV !== 'production' ? " 'unsafe-eval'" : ''),
      "style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net",
      "font-src 'self' https://cdn.jsdelivr.net",
      "img-src 'self' data: blob: https:",
      "connect-src 'self' https://*.supabase.co wss://*.supabase.co",
      "frame-ancestors 'none'",
    ].join('; '),
  },
  // HSTS: força HTTPS por 2 anos
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
];

const nextConfig = {
  experimental: {
    instrumentationHook: true,
    // pdfjs-dist (leitor de OP do PCP HRM) roda só no servidor; deixá-lo externo
    // evita que o webpack tente empacotá-lo (dynamic requires / canvas opcional)
    // e quebre o build. @napi-rs/canvas e tesseract.js (fallback de OCR pra
    // materiais de OP muito embaralhada, ver opReader.ts) também são nativos/
    // com requires dinâmicos — mesmo motivo.
    serverComponentsExternalPackages: ['pdfjs-dist', '@napi-rs/canvas', 'tesseract.js', 'tesseract.js-core'],
    // garante que os arquivos que esses pacotes acham em runtime (não via
    // import estático, então o tracing automático da Vercel não os pegaria
    // sozinho) sejam deployados junto da rota: o worker do pdfjs, o motor WASM
    // do Tesseract e o "idioma" (traineddata) que o OCR carrega do disco em
    // vez de baixar de CDN toda vez (custaria uma rede externa por OP lida).
    outputFileTracingIncludes: {
      '/api/pcp-hrm/ler-op': [
        './node_modules/pdfjs-dist/legacy/build/pdf.worker.js',
        './node_modules/tesseract.js-core/**',
        './node_modules/tesseract.js/src/worker-script/**',
        './node_modules/@tesseract.js-data/por/**',
      ],
      // mesma leitura de OP, chamada de novo na Conferência (re-lê a OP já
      // anexada ao pedido) — precisa dos mesmos arquivos.
      '/api/pcp-hrm/pedidos/[id]/ler-op': [
        './node_modules/pdfjs-dist/legacy/build/pdf.worker.js',
        './node_modules/tesseract.js-core/**',
        './node_modules/tesseract.js/src/worker-script/**',
        './node_modules/@tesseract.js-data/por/**',
      ],
    },
  },
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: securityHeaders,
      },
    ];
  },
};

module.exports = nextConfig;
