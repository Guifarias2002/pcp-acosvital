import { NextResponse } from 'next/server';
import sql from '@/lib/db';
import { autenticar } from '@/lib/middleware';
import { podeAcessarHrm } from '@/lib/auth';
import { b2Download } from '@/lib/b2';
import { lerOP } from '@/lib/opReader';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

const SUPABASE_URL = (process.env.NEXT_PUBLIC_SUPABASE_URL || '').replace(/^﻿/, '');
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const BUCKET = 'desenhos';

// Re-lê a OP JÁ anexada a um pedido (Conferência do PCP HRM) — baixa o PDF do
// Backblaze/Supabase pelo ordem_producao_url e roda o mesmo lerOP do upload.
// Não faz novo upload; a leitura não é persistida (é sugestão de conferência).
export async function GET(req: Request, { params }: { params: { id: string } }) {
  try {
    const user = await autenticar(req);
    if (user instanceof NextResponse) return user;
    if (!podeAcessarHrm(user)) return NextResponse.json({ erro: 'Acesso negado' }, { status: 403 });

    const pedidoId = Number(params.id);
    if (!Number.isInteger(pedidoId) || pedidoId <= 0)
      return NextResponse.json({ erro: 'ID inválido' }, { status: 400 });

    const rows = await sql`SELECT ordem_producao_url FROM producao_pedido WHERE id = ${pedidoId}`;
    const storagePath: string | null = rows[0]?.ordem_producao_url ?? null;
    if (!storagePath) return NextResponse.json({ erro: 'Este pedido não tem OP anexada.' }, { status: 404 });

    // Baixa os bytes (Backblaze "b2:" ou Supabase Storage legado).
    let buf: Buffer;
    let contentType = 'application/pdf';
    if (storagePath.startsWith('b2:')) {
      const r = await b2Download(storagePath.slice(3));
      if (!r.ok) return NextResponse.json({ erro: 'Não foi possível abrir o arquivo da OP.' }, { status: 502 });
      contentType = r.contentType;
      buf = Buffer.from(await new Response(r.body).arrayBuffer());
    } else {
      const fileRes = await fetch(`${SUPABASE_URL}/storage/v1/object/${BUCKET}/${storagePath}`, {
        headers: { Authorization: `Bearer ${SERVICE_KEY}` },
      });
      if (!fileRes.ok) {
        if (fileRes.status === 402)
          return NextResponse.json({ erro: 'Armazenamento indisponível no momento (limite de tráfego do plano).' }, { status: 402 });
        return NextResponse.json({ erro: 'Não foi possível abrir o arquivo da OP.' }, { status: 502 });
      }
      contentType = fileRes.headers.get('content-type') || 'application/pdf';
      buf = Buffer.from(await fileRes.arrayBuffer());
    }

    if (!/pdf/i.test(contentType))
      return NextResponse.json({ erro: 'A leitura automática só funciona com PDF do Totvs.' }, { status: 400 });

    const leitura = await lerOP(buf);
    if (leitura.avisos.length) {
      console.warn(`[pcp-hrm/pedidos/${pedidoId}/ler-op] ${leitura.ops.length} ordem(ns), ${leitura.totalPaginas} pág. Avisos:`);
      for (const a of leitura.avisos) console.warn(`  · ${a}`);
    }
    return NextResponse.json({ ok: true, ...leitura });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[pcp-hrm/pedidos/ler-op] falha:', e);
    return NextResponse.json({ erro: `Não consegui ler a OP: ${msg}` }, { status: 500 });
  }
}
