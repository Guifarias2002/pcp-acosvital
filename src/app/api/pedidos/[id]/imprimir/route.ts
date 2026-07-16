import { NextResponse } from 'next/server';
import sql from '@/lib/db';
import { autenticar } from '@/lib/middleware';
import { PDFDocument } from 'pdf-lib';

export const dynamic = 'force-dynamic';

const SUPABASE_URL = (process.env.NEXT_PUBLIC_SUPABASE_URL || '').replace(/^﻿/, '');
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const BUCKET = 'desenhos';

async function baixar(path: string): Promise<{ bytes: ArrayBuffer; tipo: string } | null> {
  const r = await fetch(`${SUPABASE_URL}/storage/v1/object/${BUCKET}/${path}`, {
    headers: { Authorization: `Bearer ${SERVICE_KEY}` },
  });
  if (!r.ok) return null;
  return { bytes: await r.arrayBuffer(), tipo: (r.headers.get('content-type') || '').toLowerCase() };
}

// GET /api/pedidos/[id]/imprimir?docs=desenho,op,pv&token=...
// Junta os documentos selecionados (Desenho / OP / PV) num ÚNICO PDF, para
// abrir em uma só aba e imprimir tudo de uma vez (sem bloqueio de pop-up).
export async function GET(req: Request, { params }: { params: { id: string } }) {
  try {
    const url = new URL(req.url);
    const queryToken = url.searchParams.get('token');
    const reqComToken = queryToken
      ? new Request(req.url, { headers: { ...Object.fromEntries(req.headers), Authorization: `Bearer ${queryToken}` } })
      : req;
    const user = await autenticar(reqComToken);
    if (user instanceof NextResponse) return user;

    const pedidoId = Number(params.id);
    if (!Number.isInteger(pedidoId) || pedidoId <= 0) return new Response('ID inválido', { status: 400 });
    if (!SERVICE_KEY) return new Response('Configuração incompleta (SERVICE_KEY)', { status: 500 });

    const docs = (url.searchParams.get('docs') || '').split(',').map(s => s.trim()).filter(Boolean);
    if (docs.length === 0) return new Response('Nenhum documento selecionado', { status: 400 });

    const [ped] = await sql`
      SELECT numero_pedido_venda, desenhos, desenho_url, ordem_producao_url, pedido_venda_url
      FROM producao_pedido WHERE id = ${pedidoId}
    `;
    if (!ped) return new Response('Pedido não encontrado', { status: 404 });

    // Resolve os storage paths, na ordem pedida
    const paths: string[] = [];
    for (const d of docs) {
      if (d === 'desenho') {
        const ds: string[] = Array.isArray(ped.desenhos) ? ped.desenhos : [];
        if (ds.length) paths.push(...ds);
        else if (ped.desenho_url) paths.push(ped.desenho_url as string);
      } else if (d === 'op' && ped.ordem_producao_url) {
        paths.push(ped.ordem_producao_url as string);
      } else if (d === 'pv' && ped.pedido_venda_url) {
        paths.push(ped.pedido_venda_url as string);
      }
    }
    if (paths.length === 0) return new Response('Documentos não anexados', { status: 404 });

    const merged = await PDFDocument.create();
    const A4W = 595.28, A4H = 841.89;

    for (const p of paths) {
      const arq = await baixar(p);
      if (!arq) continue;
      try {
        if (arq.tipo.includes('pdf')) {
          const src = await PDFDocument.load(arq.bytes, { ignoreEncryption: true });
          const pages = await merged.copyPages(src, src.getPageIndices());
          pages.forEach(pg => merged.addPage(pg));
        } else if (arq.tipo.includes('png') || arq.tipo.includes('jpeg') || arq.tipo.includes('jpg')) {
          const img = arq.tipo.includes('png') ? await merged.embedPng(arq.bytes) : await merged.embedJpg(arq.bytes);
          const page = merged.addPage([A4W, A4H]);
          const scale = Math.min(A4W / img.width, A4H / img.height) * 0.95;
          const w = img.width * scale, h = img.height * scale;
          page.drawImage(img, { x: (A4W - w) / 2, y: (A4H - h) / 2, width: w, height: h });
        }
        // webp / outros formatos não suportados pelo merge são ignorados
      } catch { /* arquivo corrompido/incompatível: pula */ }
    }

    if (merged.getPageCount() === 0)
      return new Response('Não foi possível montar o PDF (formato não suportado para junção)', { status: 422 });

    const pdfBytes = await merged.save();
    return new Response(Buffer.from(pdfBytes), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="impressao_${ped.numero_pedido_venda || pedidoId}.pdf"`,
        'Cache-Control': 'private, max-age=60',
      },
    });
  } catch (e) {
    console.error('[imprimir] erro:', e);
    return new Response('Erro ao gerar impressão', { status: 500 });
  }
}
