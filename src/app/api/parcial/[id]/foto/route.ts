import { NextResponse } from 'next/server';
import sql from '@/lib/db';
import { autenticar } from '@/lib/middleware';
import { podeAcessarSetor } from '@/lib/auth';
import { checkMutationRateLimit, getClientIp } from '@/lib/rateLimit';

export const dynamic = 'force-dynamic';

const SUPABASE_URL = (process.env.NEXT_PUBLIC_SUPABASE_URL || '').replace(/^﻿/, '');
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const BUCKET = 'desenhos'; // reaproveita o bucket existente; fotos ficam sob o prefixo fotos/
const MAX_SIZE = 25 * 1024 * 1024; // fotos de celular podem ser grandes
const TIPOS_ACEITOS = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/heic', 'image/heif'];
// Setores onde é permitido ADICIONAR fotos (a visualização é liberada em qualquer setor).
const SETORES_UPLOAD = ['embalagem'];

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

// GET /api/parcial/[id]/foto?idx=N — serve a foto no índice N (qualquer usuário autenticado vê)
export async function GET(req: Request, { params }: { params: { id: string } }) {
  const url = new URL(req.url);
  const queryToken = url.searchParams.get('token');
  const reqComToken = queryToken
    ? new Request(req.url, { headers: { ...Object.fromEntries(req.headers), Authorization: `Bearer ${queryToken}` } })
    : req;
  const user = await autenticar(reqComToken);
  if (user instanceof NextResponse) return user;

  const parcialId = Number(params.id);
  const idx = Number(url.searchParams.get('idx') ?? '0');

  const [row] = await sql`SELECT fotos FROM producao_itemparcial WHERE id = ${parcialId}`;
  if (!row) return new Response('Parcial não encontrada', { status: 404 });

  const fotos: string[] = row.fotos || [];
  const storagePath = fotos[idx];
  if (!storagePath) return new Response('Foto não encontrada', { status: 404 });

  const fileRes = await fetch(`${SUPABASE_URL}/storage/v1/object/${BUCKET}/${storagePath}`, {
    headers: { Authorization: `Bearer ${SERVICE_KEY}` },
  });
  if (!fileRes.ok) return new Response('Erro ao buscar arquivo', { status: 500 });

  const contentType = fileRes.headers.get('content-type') || 'application/octet-stream';
  const nome = storagePath.split('/').pop() || `foto_${parcialId}_${idx}`;

  return new Response(await fileRes.arrayBuffer(), {
    headers: {
      'Content-Type': contentType,
      'Content-Disposition': `inline; filename="${nome}"`,
      'Cache-Control': 'private, max-age=3600',
    },
  });
}

// POST /api/parcial/[id]/foto — upload de foto (Acabamento/Embalagem)
export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const user = await autenticar(req);
    if (user instanceof NextResponse) return user; // já barra somente-leitura (POST)
    if (!checkMutationRateLimit(getClientIp(req)))
      return NextResponse.json({ erro: 'Muitas requisicoes' }, { status: 429 });

    const parcialId = Number(params.id);
    if (!Number.isInteger(parcialId) || parcialId <= 0)
      return NextResponse.json({ erro: 'ID inválido' }, { status: 400 });
    if (!SERVICE_KEY)
      return NextResponse.json({ erro: 'Configuração incompleta (SERVICE_KEY)' }, { status: 500 });

    const [parcial] = await sql`SELECT setor_atual FROM producao_itemparcial WHERE id = ${parcialId}`;
    if (!parcial) return NextResponse.json({ erro: 'Parcial não encontrada' }, { status: 404 });

    // Permissão: admin ou operador do setor atual da parcial
    if (!user.is_staff && !podeAcessarSetor(user, parcial.setor_atual as string))
      return NextResponse.json({ erro: 'Sem permissao neste setor' }, { status: 403 });
    // Fotos só podem ser adicionadas na Embalagem
    if (!SETORES_UPLOAD.includes(parcial.setor_atual as string))
      return NextResponse.json({ erro: 'Fotos só podem ser adicionadas na Embalagem' }, { status: 400 });

    const formData = await req.formData();
    const arquivo = formData.get('arquivo') as File | null;
    if (!arquivo) return NextResponse.json({ erro: 'Nenhum arquivo enviado' }, { status: 400 });
    if (!TIPOS_ACEITOS.includes(arquivo.type))
      return NextResponse.json({ erro: 'Formato inválido. Envie uma imagem (JPG, PNG ou WEBP).' }, { status: 400 });
    if (arquivo.size > MAX_SIZE)
      return NextResponse.json({ erro: 'Imagem muito grande (máx 25 MB)' }, { status: 400 });

    const ext = (arquivo.type.split('/')[1] || 'jpg').replace('jpeg', 'jpg');
    const ts = Date.now();
    const rnd = Math.random().toString(36).slice(2, 8);
    const storagePath = `fotos/parcial_${parcialId}_${ts}_${rnd}.${ext}`;
    const bytes = await arquivo.arrayBuffer();

    await uploadStorage(storagePath, bytes, arquivo.type);

    await sql`
      UPDATE producao_itemparcial
      SET fotos = array_append(COALESCE(fotos, '{}'), ${storagePath}), atualizado_em = NOW()
      WHERE id = ${parcialId}
    `;

    return NextResponse.json({ ok: true, path: storagePath });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ erro: `Erro interno: ${msg}` }, { status: 500 });
  }
}

// DELETE /api/parcial/[id]/foto  body: { path: string }
export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  const user = await autenticar(req);
  if (user instanceof NextResponse) return user; // já barra somente-leitura (DELETE)

  const parcialId = Number(params.id);
  const { path } = await req.json().catch(() => ({ path: null }));
  if (!path) return NextResponse.json({ erro: 'path obrigatório' }, { status: 400 });

  const [parcial] = await sql`SELECT setor_atual, fotos FROM producao_itemparcial WHERE id = ${parcialId}`;
  if (!parcial) return NextResponse.json({ erro: 'Parcial não encontrada' }, { status: 404 });
  if (!user.is_staff && !podeAcessarSetor(user, parcial.setor_atual as string))
    return NextResponse.json({ erro: 'Sem permissao neste setor' }, { status: 403 });

  const fotos: string[] = parcial.fotos || [];
  if (!fotos.includes(path))
    return NextResponse.json({ erro: 'Arquivo não pertence a esta parcial' }, { status: 400 });

  await deleteStorage(path);
  await sql`
    UPDATE producao_itemparcial
    SET fotos = array_remove(COALESCE(fotos, '{}'), ${path}), atualizado_em = NOW()
    WHERE id = ${parcialId}
  `;

  return NextResponse.json({ ok: true });
}
