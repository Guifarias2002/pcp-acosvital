import { NextResponse } from 'next/server';
import sql from '@/lib/db';
import { autenticar } from '@/lib/middleware';
import { checkMutationRateLimit, getClientIp } from '@/lib/rateLimit';
import { b2Upload, b2Download, b2Delete, B2_CONFIGURADO } from '@/lib/b2';

export const dynamic = 'force-dynamic';

// Anexos NOVOS vão pro Backblaze B2 (fora do egress do Supabase). No banco
// ficam com prefixo "b2:"; os antigos (sem prefixo) seguem lidos do Supabase.
const SUPABASE_URL = (process.env.NEXT_PUBLIC_SUPABASE_URL || '').replace(/^﻿/, '');
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const BUCKET = 'desenhos';
const MAX_SIZE = 20 * 1024 * 1024;
const TIPOS_ACEITOS = [
  'application/pdf', 'image/png', 'image/jpeg', 'image/jpg', 'image/webp',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
];

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

  // Arquivo novo (Backblaze) — marcado com prefixo "b2:"
  if (storagePath.startsWith('b2:')) {
    const r = await b2Download(storagePath.slice(3));
    if (!r.ok) return new Response('Não foi possível abrir o arquivo.', { status: 502 });
    const extB2 = r.contentType.split('/')[1] || 'bin';
    return new Response(r.body, {
      headers: {
        'Content-Type': r.contentType,
        'Content-Disposition': `inline; filename="desenho_${itemId}_${idx}.${extB2}"`,
        'Cache-Control': 'private, max-age=604800',
      },
    });
  }

  const fileRes = await fetch(`${SUPABASE_URL}/storage/v1/object/${BUCKET}/${storagePath}`, {
    headers: { Authorization: `Bearer ${SERVICE_KEY}` },
  });
  if (!fileRes.ok) {
    if (fileRes.status === 402)
      return new Response('Armazenamento indisponível no momento (limite de tráfego do plano).', { status: 402 });
    return new Response('Erro ao buscar arquivo', { status: 500 });
  }

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

    if (!B2_CONFIGURADO)
      return NextResponse.json({ erro: 'Armazenamento de anexos não configurado. Avise o TI.' }, { status: 500 });

    const formData = await req.formData();
    const arquivo = formData.get('arquivo') as File | null;
    if (!arquivo) return NextResponse.json({ erro: 'Nenhum arquivo enviado' }, { status: 400 });
    if (!TIPOS_ACEITOS.includes(arquivo.type))
      return NextResponse.json({ erro: 'Formato inválido. Use PDF, PNG, JPG, Excel ou Word.' }, { status: 400 });
    if (arquivo.size > MAX_SIZE)
      return NextResponse.json({ erro: 'Arquivo muito grande (máx 20 MB)' }, { status: 400 });

    const ext = arquivo.type.split('/')[1] || 'bin';
    const ts = Date.now();
    const rnd = Math.random().toString(36).slice(2, 8);
    const fileName = `item_${itemId}_desenho_${ts}_${rnd}.${ext}`;
    const bytes = await arquivo.arrayBuffer();

    try {
      await b2Upload(fileName, arquivo.type, bytes);
    } catch (e) {
      const motivo = e instanceof Error ? e.message : String(e);
      return NextResponse.json({ erro: `Falha ao enviar o arquivo pro armazenamento: ${motivo}` }, { status: 502 });
    }

    const storagePath = `b2:${fileName}`;
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

  if (path.startsWith('b2:')) await b2Delete(path.slice(3)); else await deleteStorage(path);
  await sql`
    UPDATE producao_itempedido
    SET desenhos = array_remove(COALESCE(desenhos, '{}'), ${path})
    WHERE id = ${itemId}
  `;

  return NextResponse.json({ ok: true });
}
