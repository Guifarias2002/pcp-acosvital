import { NextResponse } from 'next/server';
import sql from '@/lib/db';
import { autenticar } from '@/lib/middleware';

export const dynamic = 'force-dynamic';

const SUPABASE_URL = (process.env.NEXT_PUBLIC_SUPABASE_URL || '').replace(/^﻿/, '');
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const BUCKET = 'desenhos';

const MAX_SIZE = 20 * 1024 * 1024;
const TIPOS_ACEITOS = ['application/pdf', 'image/png', 'image/jpeg', 'image/jpg', 'image/webp'];

async function uploadStorage(path: string, body: ArrayBuffer, contentType: string) {
  const res = await fetch(`${SUPABASE_URL}/storage/v1/object/${BUCKET}/${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${SERVICE_KEY}`,
      'Content-Type': contentType,
      'x-upsert': 'true',
    },
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

async function downloadStorage(path: string): Promise<Response> {
  const res = await fetch(`${SUPABASE_URL}/storage/v1/object/${BUCKET}/${path}`, {
    headers: { Authorization: `Bearer ${SERVICE_KEY}` },
  });
  return res;
}

export async function GET(req: Request, { params }: { params: { id: string } }) {
  // Aceita token via query param para uso em <img> e <iframe>
  const url = new URL(req.url);
  const queryToken = url.searchParams.get('token');
  const reqComToken = queryToken
    ? new Request(req.url, { headers: { ...Object.fromEntries(req.headers), Authorization: `Bearer ${queryToken}` } })
    : req;
  const user = await autenticar(reqComToken);
  if (user instanceof NextResponse) return user;

  const pedidoId = Number(params.id);
  const rows = await sql`SELECT desenho_url FROM producao_pedido WHERE id = ${pedidoId}`;
  const storagePath: string | null = rows[0]?.desenho_url ?? null;

  if (!storagePath) return new Response('Sem desenho', { status: 404 });

  const fileRes = await downloadStorage(storagePath);
  if (!fileRes.ok) return new Response('Erro ao buscar desenho', { status: 500 });

  const contentType = fileRes.headers.get('content-type') || 'application/octet-stream';
  const ext = contentType.split('/')[1] || 'bin';

  return new Response(await fileRes.arrayBuffer(), {
    headers: {
      'Content-Type': contentType,
      'Content-Disposition': `inline; filename="desenho_${pedidoId}.${ext}"`,
      'Cache-Control': 'private, max-age=3600',
    },
  });
}

export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const user = await autenticar(req);
    if (user instanceof NextResponse) return user;
    if (!user.is_staff) return NextResponse.json({ erro: 'Sem permissao' }, { status: 403 });

    const pedidoId = Number(params.id);
    if (!Number.isInteger(pedidoId) || pedidoId <= 0)
      return NextResponse.json({ erro: 'ID inválido' }, { status: 400 });

    if (!SERVICE_KEY)
      return NextResponse.json({ erro: 'Configuração do servidor incompleta (SERVICE_KEY)' }, { status: 500 });

    const formData = await req.formData();
    const arquivo = formData.get('arquivo') as File | null;

    if (!arquivo) return NextResponse.json({ erro: 'Nenhum arquivo enviado' }, { status: 400 });
    if (!TIPOS_ACEITOS.includes(arquivo.type))
      return NextResponse.json({ erro: 'Formato inválido. Use PDF, PNG ou JPG.' }, { status: 400 });
    if (arquivo.size > MAX_SIZE)
      return NextResponse.json({ erro: 'Arquivo muito grande (máx 20 MB)' }, { status: 400 });

    const ext = arquivo.type.split('/')[1] || 'bin';
    const storagePath = `pedido_${pedidoId}.${ext}`;
    const bytes = await arquivo.arrayBuffer();

    const upRes = await fetch(`${SUPABASE_URL}/storage/v1/object/${BUCKET}/${storagePath}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${SERVICE_KEY}`,
        'Content-Type': arquivo.type,
        'x-upsert': 'true',
      },
      body: bytes,
    });

    if (!upRes.ok) {
      const txt = await upRes.text();
      return NextResponse.json({ erro: `Storage: ${upRes.status} - ${txt}` }, { status: 500 });
    }

    await sql`UPDATE producao_pedido SET desenho_url = ${storagePath} WHERE id = ${pedidoId}`;

    return NextResponse.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ erro: `Erro interno: ${msg}` }, { status: 500 });
  }
}

export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  const user = await autenticar(req);
  if (user instanceof NextResponse) return user;
  if (!user.is_staff) return NextResponse.json({ erro: 'Sem permissao' }, { status: 403 });

  const pedidoId = Number(params.id);

  const rows = await sql`SELECT desenho_url FROM producao_pedido WHERE id = ${pedidoId}`;
  const storagePath: string | null = rows[0]?.desenho_url ?? null;

  if (storagePath) await deleteStorage(storagePath);

  await sql`UPDATE producao_pedido SET desenho_url = NULL WHERE id = ${pedidoId}`;

  return NextResponse.json({ ok: true });
}
