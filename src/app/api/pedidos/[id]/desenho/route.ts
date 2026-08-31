import { NextResponse } from 'next/server';
import sql from '@/lib/db';
import { autenticar } from '@/lib/middleware';
import { checkMutationRateLimit, getClientIp } from '@/lib/rateLimit';
import { b2Upload, b2Download, b2Delete, B2_CONFIGURADO } from '@/lib/b2';

export const dynamic = 'force-dynamic';

// Anexos NOVOS vão pro Backblaze B2 (não contam no egress do Supabase, que
// estourou a cota e travou o Storage). No banco ficam com o prefixo "b2:";
// os antigos (sem prefixo) continuam sendo lidos do Supabase quando possível.
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

// GET /api/pedidos/[id]/desenho?idx=N — serve o arquivo no índice N (idx=0 por padrão,
// aceita também o caminho legado se "desenhos" ainda não tiver sido migrado)
export async function GET(req: Request, { params }: { params: { id: string } }) {
  const url = new URL(req.url);
  const queryToken = url.searchParams.get('token');
  const reqComToken = queryToken
    ? new Request(req.url, { headers: { ...Object.fromEntries(req.headers), Authorization: `Bearer ${queryToken}` } })
    : req;
  const user = await autenticar(reqComToken);
  if (user instanceof NextResponse) return user;

  const pedidoId = Number(params.id);
  const idx = Number(url.searchParams.get('idx') ?? '0');

  const [row] = await sql`SELECT desenhos, desenho_url FROM producao_pedido WHERE id = ${pedidoId}`;
  if (!row) return new Response('Pedido não encontrado', { status: 404 });

  const desenhos: string[] = (row.desenhos && row.desenhos.length > 0) ? row.desenhos : (row.desenho_url ? [row.desenho_url] : []);
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
        'Content-Disposition': `inline; filename="desenho_${pedidoId}_${idx}.${extB2}"`,
        'Cache-Control': 'private, max-age=604800',
      },
    });
  }

  // Arquivo antigo — continua no Supabase Storage
  const fileRes = await fetch(`${SUPABASE_URL}/storage/v1/object/${BUCKET}/${storagePath}`, {
    headers: { Authorization: `Bearer ${SERVICE_KEY}` },
  });
  if (!fileRes.ok) {
    // 402 = cota de tráfego do Supabase estourada — trava o Storage inteiro
    if (fileRes.status === 402)
      return new Response('Armazenamento indisponível no momento (limite de tráfego do plano).', { status: 402 });
    return new Response('Erro ao buscar arquivo', { status: 500 });
  }

  const contentType = fileRes.headers.get('content-type') || 'application/octet-stream';
  const nome = storagePath.split('/').pop() || `desenho_${pedidoId}_${idx}`;

  return new Response(await fileRes.arrayBuffer(), {
    headers: {
      'Content-Type': contentType,
      'Content-Disposition': `inline; filename="${nome}"`,
      'Cache-Control': 'private, max-age=3600',
    },
  });
}

// POST /api/pedidos/[id]/desenho — faz upload e adiciona ao array
export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const user = await autenticar(req);
    if (user instanceof NextResponse) return user;
    if (!user.is_staff) return NextResponse.json({ erro: 'Sem permissao' }, { status: 403 });
    if (!checkMutationRateLimit(getClientIp(req)))
      return NextResponse.json({ erro: 'Muitas requisicoes' }, { status: 429 });

    const pedidoId = Number(params.id);
    if (!Number.isInteger(pedidoId) || pedidoId <= 0)
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

    // Nome plano (sem barras) pro Backblaze, único por anexo.
    const ext = arquivo.type.split('/')[1] || 'bin';
    const ts = Date.now();
    const rnd = Math.random().toString(36).slice(2, 8);
    const fileName = `pedido_${pedidoId}_desenho_${ts}_${rnd}.${ext}`;
    const bytes = await arquivo.arrayBuffer();

    try {
      await b2Upload(fileName, arquivo.type, bytes);
    } catch (e) {
      const motivo = e instanceof Error ? e.message : String(e);
      return NextResponse.json({ erro: `Falha ao enviar o arquivo pro armazenamento: ${motivo}` }, { status: 502 });
    }

    const storagePath = `b2:${fileName}`;
    await sql`
      UPDATE producao_pedido
      SET desenhos = array_append(COALESCE(desenhos, '{}'), ${storagePath})
      WHERE id = ${pedidoId}
    `;

    return NextResponse.json({ ok: true, path: storagePath });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ erro: `Erro interno: ${msg}` }, { status: 500 });
  }
}

// DELETE /api/pedidos/[id]/desenho  body: { path: string }
export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  const user = await autenticar(req);
  if (user instanceof NextResponse) return user;
  if (!user.is_staff) return NextResponse.json({ erro: 'Sem permissao' }, { status: 403 });

  const pedidoId = Number(params.id);
  const { path } = await req.json().catch(() => ({ path: null }));

  const [row] = await sql`SELECT desenhos, desenho_url FROM producao_pedido WHERE id = ${pedidoId}`;
  if (!row) return NextResponse.json({ erro: 'Pedido não encontrado' }, { status: 404 });
  const desenhos: string[] = row.desenhos || [];

  // Chamadores antigos (tela /item/[id]) não enviam "path" - assumiam um único
  // desenho no pedido, então sem path apaga tudo que existir (compatibilidade).
  if (!path) {
    const todos = desenhos.length > 0 ? desenhos : (row.desenho_url ? [row.desenho_url] : []);
    for (const p of todos) {
      if (p.startsWith('b2:')) await b2Delete(p.slice(3)); else await deleteStorage(p);
    }
    await sql`UPDATE producao_pedido SET desenhos = '{}', desenho_url = NULL WHERE id = ${pedidoId}`;
    return NextResponse.json({ ok: true });
  }

  if (!desenhos.includes(path))
    return NextResponse.json({ erro: 'Arquivo não pertence a este pedido' }, { status: 400 });

  if (path.startsWith('b2:')) await b2Delete(path.slice(3)); else await deleteStorage(path);
  await sql`
    UPDATE producao_pedido
    SET desenhos = array_remove(COALESCE(desenhos, '{}'), ${path}), desenho_url = NULL
    WHERE id = ${pedidoId}
  `;

  return NextResponse.json({ ok: true });
}
