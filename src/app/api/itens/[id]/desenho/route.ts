import { NextResponse } from 'next/server';
import sql from '@/lib/db';
import { autenticar } from '@/lib/middleware';
import { checkMutationRateLimit, getClientIp } from '@/lib/rateLimit';

export const dynamic = 'force-dynamic';

const SUPABASE_URL = (process.env.NEXT_PUBLIC_SUPABASE_URL || '').replace(/^﻿/, '');
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const BUCKET = 'desenhos';
const MAX_SIZE = 20 * 1024 * 1024;
const TIPOS_ACEITOS = ['application/pdf', 'image/png', 'image/jpeg', 'image/jpg', 'image/webp'];

async function uploadStorage(path: string, body: ArrayBuffer, contentType: string) {
  const res = await fetch(`${SUPABASE_URL}/storage/v1/object/${BUCKET}/${path}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${SERVICE_KEY}`, 'Content-Type': contentType, 'x-upsert': 'true' },
    body,
  });
  if (!res.ok) throw new Error(`Storage upload failed: ${await res.text()}`);
}

async function deleteStorage(path: string) {
  await fetch(`${SUPABASE_URL}/storage/v1/object/${BUCKET}/${path}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${SERVICE_KEY}` },
  });
}

// GET /api/itens/[id]/desenho?idx=N — serve o arquivo no índice N
export async function GET(req: Request, { params }: { params: { id: string } }) {
  const url = new URL(req.url);
  const queryToken = url.searchParams.get('token');
  const reqComToken = queryToken
    ? new Request(req.url, { headers: { ...Object.fromEntries(req.headers), Authorization: `Bearer ${queryToken}` } })
    : req;
  const user = await autenticar(reqComToken);
  if (user instanceof NextResponse) return user;

  const itemId = Number(params.id);
  const idx = Number(url.searchParams.get('idx') ?? '0');

  const [row] = await sql`SELECT desenhos FROM producao_itempedido WHERE id = ${itemId}`;
  if (!row) return new Response('Item não encontrado', { status: 404 });

  const desenhos: string[] = row.desenhos || [];
  const storagePath = desenhos[idx];
  if (!storagePath) return new Response('Desenho não encontrado', { status: 404 });

  const fileRes = await fetch(`${SUPABASE_URL}/storage/v1/object/${BUCKET}/${storagePath}`, {
    headers: { Authorization: `Bearer ${SERVICE_KEY}` },
  });
  if (!fileRes.ok) return new Response('Erro ao buscar arquivo', { status: 500 });

  const contentType = fileRes.headers.get('content-type') || 'application/octet-stream';
  const nome = storagePath.split('/').pop() || `desenho_${itemId}_${idx}`;

  return new Response(await fileRes.arrayBuffer(), {
    headers: {
      'Content-Type': contentType,
      'Content-Disposition': `inline; filename="${nome}"`,
      'Cache-Control': 'private, max-age=3600',
    },
  });
}

// POST /api/itens/[id]/desenho — faz upload e adiciona ao array
export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const user = await autenticar(req);
    if (user instanceof NextResponse) return user;
    if (!user.is_staff) return NextResponse.json({ erro: 'Sem permissao' }, { status: 403 });
    if (!checkMutationRateLimit(getClientIp(req)))
      return NextResponse.json({ erro: 'Muitas requisicoes' }, { status: 429 });

    const itemId = Number(params.id);
    if (!Number.isInteger(itemId) || itemId <= 0)
      return NextResponse.json({ erro: 'ID inválido' }, { status: 400 });

    if (!SERVICE_KEY)
      return NextResponse.json({ erro: 'Configuração incompleta (SERVICE_KEY)' }, { status: 500 });

    const formData = await req.formData();
    const arquivo = formData.get('arquivo') as File | null;
    if (!arquivo) return NextResponse.json({ erro: 'Nenhum arquivo enviado' }, { status: 400 });
    if (!TIPOS_ACEITOS.includes(arquivo.type))
      return NextResponse.json({ erro: 'Formato inválido. Use PDF, PNG ou JPG.' }, { status: 400 });
    if (arquivo.size > MAX_SIZE)
      return NextResponse.json({ erro: 'Arquivo muito grande (máx 20 MB)' }, { status: 400 });

    const ext = arquivo.type.split('/')[1] || 'bin';
    const ts = Date.now();
    const storagePath = `itens/item_${itemId}_${ts}.${ext}`;
    const bytes = await arquivo.arrayBuffer();

    await uploadStorage(storagePath, bytes, arquivo.type);

    await sql`
      UPDATE producao_itempedido
      SET desenhos = array_append(COALESCE(desenhos, '{}'), ${storagePath})
      WHERE id = ${itemId}
    `;

    return NextResponse.json({ ok: true, path: storagePath });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ erro: `Erro interno: ${msg}` }, { status: 500 });
  }
}

// DELETE /api/itens/[id]/desenho  body: { path: string }
export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  const user = await autenticar(req);
  if (user instanceof NextResponse) return user;
  if (!user.is_staff) return NextResponse.json({ erro: 'Sem permissao' }, { status: 403 });

  const itemId = Number(params.id);
  const { path } = await req.json().catch(() => ({ path: null }));
  if (!path) return NextResponse.json({ erro: 'path obrigatório' }, { status: 400 });

  const [row] = await sql`SELECT desenhos FROM producao_itempedido WHERE id = ${itemId}`;
  if (!row) return NextResponse.json({ erro: 'Item não encontrado' }, { status: 404 });
  const desenhos: string[] = row.desenhos || [];
  if (!desenhos.includes(path))
    return NextResponse.json({ erro: 'Arquivo não pertence a este item' }, { status: 400 });

  await deleteStorage(path);
  await sql`
    UPDATE producao_itempedido
    SET desenhos = array_remove(COALESCE(desenhos, '{}'), ${path})
    WHERE id = ${itemId}
  `;

  return NextResponse.json({ ok: true });
}
