'use client';

import { useEffect, useRef, useState } from 'react';

// Visualizador de documento (OP / PV / Desenho) EM TELA CHEIA, dentro do próprio
// sistema, com botão grande "← Voltar" no topo (ESC também fecha). O operador
// nunca sai do sistema nem precisa abrir outra guia.
//
// ⚠️ Por que não usar só <iframe>: o Chrome de aparelho de TOQUE (tablet/celular
// Android) NÃO renderiza PDF dentro de um <iframe> — aparece só um ícone de
// "documento quebrado" ou uma tela em branco. Por isso, em tela de toque, o PDF é
// desenhado AQUI DENTRO com o PDF.js (auto-hospedado em /public/pdfjs), página por
// página num <canvas> — funciona em qualquer aparelho, sem abrir aba nenhuma.
// No desktop o <iframe> nativo funciona bem (com zoom/impressão do próprio
// navegador), então lá ele é mantido.

// Carrega o PDF.js auto-hospedado uma única vez por sessão (evita rebaixar o
// script a cada abertura). Fica em /public/pdfjs (mesma versão fixada no
// package-lock: 3.11.174), servido pelo próprio domínio — respeita o CSP
// (script-src 'self').
let pdfjsPromise: Promise<any> | null = null;
function carregarPdfjs(): Promise<any> {
  if (typeof window === 'undefined') return Promise.reject(new Error('sem window'));
  const jaCarregado = (window as any).pdfjsLib;
  if (jaCarregado) return Promise.resolve(jaCarregado);
  if (pdfjsPromise) return pdfjsPromise;
  pdfjsPromise = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = '/pdfjs/pdf.min.js';
    s.async = true;
    s.onload = () => {
      const lib = (window as any).pdfjsLib;
      if (lib) {
        lib.GlobalWorkerOptions.workerSrc = '/pdfjs/pdf.worker.min.js';
        resolve(lib);
      } else {
        reject(new Error('Leitor de PDF não inicializou.'));
      }
    };
    s.onerror = () => { pdfjsPromise = null; reject(new Error('Falha ao carregar o leitor de PDF.')); };
    document.head.appendChild(s);
  });
  return pdfjsPromise;
}

// Descobre se é aparelho de toque (tablet/celular). Nesses, o <iframe> não
// renderiza PDF, então usamos o canvas do PDF.js.
function ehToque(): boolean {
  if (typeof window === 'undefined') return false;
  const mm = window.matchMedia;
  return (
    (!!mm && (mm('(pointer: coarse)').matches || mm('(hover: none)').matches)) ||
    (navigator.maxTouchPoints ?? 0) > 0 ||
    'ontouchstart' in window
  );
}

// Renderiza o documento (PDF em <canvas>, imagem em <img>) inteiramente dentro
// do sistema, sem <iframe> e sem abrir aba.
function DocInline({ url }: { url: string }) {
  const contRef = useRef<HTMLDivElement>(null);
  const [estado, setEstado] = useState<'carregando' | 'ok' | 'erro'>('carregando');
  const [msg, setMsg] = useState('');

  useEffect(() => {
    let cancelado = false;
    const objectUrls: string[] = [];
    (async () => {
      try {
        setEstado('carregando'); setMsg('');
        const resp = await fetch(url);
        if (!resp.ok) {
          // A API responde JSON com { erro } em vários casos (sem anexo, cota etc.).
          let detalhe = '';
          try { detalhe = (await resp.clone().json())?.erro || ''; } catch { /* não era JSON */ }
          throw new Error(detalhe || `Não foi possível carregar o arquivo (${resp.status}).`);
        }
        const ct = (resp.headers.get('content-type') || '').toLowerCase();
        const cont = contRef.current;
        if (!cont) return;
        cont.innerHTML = '';

        // Imagem (PNG/JPG/WEBP): mostra direto.
        if (ct.startsWith('image/')) {
          const blob = await resp.blob();
          if (cancelado) return;
          const ourl = URL.createObjectURL(blob); objectUrls.push(ourl);
          const img = document.createElement('img');
          img.src = ourl;
          img.alt = 'Documento';
          img.style.cssText = 'display:block;max-width:100%;height:auto;margin:0 auto;background:#fff;';
          cont.appendChild(img);
          if (!cancelado) setEstado('ok');
          return;
        }

        // PDF: desenha cada página num <canvas>.
        const buf = await resp.arrayBuffer();
        if (cancelado) return;
        const pdfjs = await carregarPdfjs();
        if (cancelado) return;
        const pdf = await pdfjs.getDocument({ data: buf, isEvalSupported: false }).promise;
        const largura = Math.min(cont.clientWidth || 800, 1400);
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        for (let n = 1; n <= pdf.numPages; n++) {
          if (cancelado) return;
          const page = await pdf.getPage(n);
          const vp1 = page.getViewport({ scale: 1 });
          const escala = largura / vp1.width;
          const vp = page.getViewport({ scale: escala * dpr });
          const canvas = document.createElement('canvas');
          canvas.width = Math.ceil(vp.width);
          canvas.height = Math.ceil(vp.height);
          canvas.style.cssText = `display:block;width:100%;max-width:${largura}px;height:auto;margin:0 auto 12px;background:#fff;box-shadow:0 1px 6px rgba(0,0,0,.25);`;
          cont.appendChild(canvas);
          const ctx = canvas.getContext('2d');
          if (!ctx) continue;
          await page.render({ canvasContext: ctx, viewport: vp }).promise;
        }
        if (!cancelado) setEstado('ok');
      } catch (e) {
        console.error('[VisualizadorDoc] falha ao renderizar', e);
        if (!cancelado) { setMsg(e instanceof Error ? e.message : 'Erro ao abrir o documento.'); setEstado('erro'); }
      }
    })();
    return () => { cancelado = true; objectUrls.forEach(u => { try { URL.revokeObjectURL(u); } catch { /* noop */ } }); };
  }, [url]);

  return (
    <div style={{ flex: 1, overflow: 'auto', background: '#525659', position: 'relative', WebkitOverflowScrolling: 'touch' }}>
      {estado === 'carregando' && (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 16, gap: 10 }}>
          <i className="bi bi-hourglass-split" style={{ fontSize: 22 }} /> Carregando documento…
        </div>
      )}
      {estado === 'erro' && (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: '#fff', gap: 14, padding: 24, textAlign: 'center' }}>
          <i className="bi bi-exclamation-triangle" style={{ fontSize: 48 }} />
          <div style={{ maxWidth: 420, lineHeight: 1.4 }}>{msg}</div>
          <a href={url} target="_blank" rel="noopener noreferrer" style={{ background: '#fff', color: '#1a3a5c', borderRadius: 8, padding: '10px 18px', fontWeight: 700, textDecoration: 'none' }}>
            Tentar abrir em nova aba
          </a>
        </div>
      )}
      <div ref={contRef} style={{ padding: 12 }} />
    </div>
  );
}

// Visualizador EMBUTIDO (inline) — mesmo motor do overlay, mas dentro de um card
// com altura fixa. Desktop usa <iframe> nativo; aparelho de toque desenha o PDF
// no canvas do PDF.js (o iframe não renderiza PDF no Android). Use pra mostrar a
// OP já aberta numa tela, sem exigir clique/abrir overlay.
export function DocEmbed({ url, titulo, height = 560 }: { url: string; titulo: string; height?: number | string }) {
  const [toque, setToque] = useState(false);
  useEffect(() => { setToque(ehToque()); }, []);
  return (
    <div style={{ height, borderRadius: 8, overflow: 'hidden', border: '1px solid #cbd5e1', display: 'flex', flexDirection: 'column', background: '#525659' }}>
      {toque
        ? <DocInline url={url} />
        : <iframe src={url} title={titulo} style={{ flex: 1, width: '100%', border: 'none', background: '#fff' }} />}
    </div>
  );
}

export default function VisualizadorDoc({ url, titulo, onClose }: { url: string; titulo: string; onClose: () => void }) {
  const [toque, setToque] = useState(false);
  useEffect(() => { setToque(ehToque()); }, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 10000, background: '#1a3a5c', display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', background: '#1a3a5c', color: '#fff', flexShrink: 0 }}>
        <button onClick={onClose} type="button"
          style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: '#fff', color: '#1a3a5c', border: 'none', borderRadius: 8, padding: '12px 22px', fontSize: 17, fontWeight: 800, cursor: 'pointer', boxShadow: '0 2px 6px rgba(0,0,0,.3)' }}>
          <i className="bi bi-arrow-left" /> Voltar
        </button>
        <span style={{ fontWeight: 700, fontSize: 15, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{titulo}</span>
        <a href={url} target="_blank" rel="noopener noreferrer"
          style={{ marginLeft: 'auto', color: '#cfe0ff', fontSize: 13, fontWeight: 600, textDecoration: 'none', whiteSpace: 'nowrap', display: 'inline-flex', alignItems: 'center', gap: 5 }}>
          Abrir em nova aba <i className="bi bi-box-arrow-up-right" />
        </a>
      </div>
      {/* Toque (tablet/celular): PDF desenhado aqui dentro. Desktop: <iframe> nativo. */}
      {toque
        ? <DocInline url={url} />
        : <iframe src={url} title={titulo} style={{ flex: 1, width: '100%', border: 'none', background: '#fff' }} />}
    </div>
  );
}
