'use client';
// Miniatura do croqui (desenho do produto) pelo CÓDIGO do material. Clique →
// abre grande. Ver src/lib/croqui.ts.
// Pra não disparar uma requisição por item (pedido de Flange tem dezenas de
// itens sem croqui), busca UMA vez a lista de códigos que têm croqui (tabela
// pequena) e só desenha quando o código está nela — sem croqui não renderiza
// nada (nem margem), então o layout da tela não muda.
import { useEffect, useState, type CSSProperties } from 'react';
import { api } from '@/lib/api';
import { getToken } from '@/lib/auth';
import { normalizarCodigoCroqui, urlCroqui } from '@/lib/croqui';

type Lista = Map<string, string>; // codigo_norm → versão (atualizado_em)
let listaCache: Promise<Lista> | null = null;
let listaEm = 0;
function carregarLista(): Promise<Lista> {
  if (!listaCache || Date.now() - listaEm > 5 * 60_000) {
    listaEm = Date.now();
    listaCache = api.get('/api/croqui')
      .then(r => new Map<string, string>((r.data.croquis || []).map((c: { codigo_norm: string; atualizado_em: string }) => [c.codigo_norm, String(new Date(c.atualizado_em).getTime())])))
      .catch(() => { listaCache = null; return new Map<string, string>(); });
  }
  return listaCache;
}
/** Avisa que a lista mudou (depois de anexar/remover croqui). */
export function invalidarListaCroquis() { listaCache = null; }

export default function CroquiMini({ codigo, versao, tamanho = 56, titulo, estilo }: {
  codigo: string | null | undefined; versao?: string | null; tamanho?: number; titulo?: string | null; estilo?: CSSProperties;
}) {
  const norm = normalizarCodigoCroqui(codigo);
  const [ver, setVer] = useState<string | null | undefined>(versao ?? undefined);
  const [falhou, setFalhou] = useState(false);
  const [aberto, setAberto] = useState(false);
  useEffect(() => {
    if (versao) { setVer(versao); return; }
    if (!norm) { setVer(null); return; }
    let vivo = true;
    carregarLista().then(m => { if (vivo) setVer(m.get(norm) ?? null); });
    return () => { vivo = false; };
  }, [norm, versao]);
  if (!norm || !ver || falhou) return null;
  const src = urlCroqui(norm, getToken() || '', ver);
  return (
    <>
      <button type="button" onClick={e => { e.preventDefault(); e.stopPropagation(); setAberto(true); }} title="Ver o desenho do produto"
        style={{ width: tamanho, height: tamanho, flexShrink: 0, padding: 2, border: '1px solid #e2e8f0', borderRadius: 6, background: '#fff', cursor: 'zoom-in', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', ...estilo }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} alt={`Croqui ${codigo}`} loading="lazy" onError={() => setFalhou(true)} style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
      </button>
      {aberto && (
        <div onClick={() => setAberto(false)} role="dialog" aria-modal="true"
          style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,.72)', zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: 12, padding: 16, maxWidth: 'min(900px, 96vw)', maxHeight: '94vh', display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontFamily: 'monospace', fontWeight: 700, color: '#1a3a5c' }}>{codigo}</div>
                {titulo && <div style={{ fontSize: 13, color: '#64748b' }}>{titulo}</div>}
              </div>
              <button type="button" onClick={() => setAberto(false)} aria-label="Fechar" style={{ border: 0, background: 'none', fontSize: 20, cursor: 'pointer', color: '#64748b' }}><i className="bi bi-x-lg" /></button>
            </div>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={src} alt={`Croqui ${codigo}`} style={{ maxWidth: '100%', maxHeight: '80vh', objectFit: 'contain', background: '#fff' }} />
          </div>
        </div>
      )}
    </>
  );
}
