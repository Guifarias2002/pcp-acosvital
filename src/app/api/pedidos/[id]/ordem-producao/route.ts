import { NextResponse } from 'next/server';
import sql from '@/lib/db';
import { autenticar } from '@/lib/middleware';
import { b2Upload, b2Download, b2Delete, B2_CONFIGURADO } from '@/lib/b2';

export const dynamic = 'force-dynamic';

const SUPABASE_URL = (process.env.NEXT_PUBLIC_SUPABASE_URL || '').replace(/^﻿/, '');
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const BUCKET = 'desenhos';
const MAX_SIZE = 20 * 1024 * 1024;
const TIPOS_ACEITOS = ['application/pdf', 'image/png', 'image/jpeg', 'image/jpg', 'image/webp'];

async function deleteStorage(path: string) {
  await fetch(`${SUPABASE_URL}/storage/v1/object/${BUCKET}/${path}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${SERVICE_KEY}` },
  });
}

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

    const rows = await sql`SELECT ordem_producao_url FROM producao_pedido WHERE id = ${pedidoId}`;
    const storagePath: string | null = rows[0]?.ordem_producao_url ?? null;

    if (!storagePath) return new Response('Sem ordem de produção anexada', { status: 404 });

    // Arquivo novo (Backblaze) — marcado com prefixo "b2:"
    if (storagePath.startsWith('b2:')) {
      const r = await b2Download(storagePath.slice(3));
      if (!r.ok) {
        console.error('[ordem-producao] B2 download falhou', r.status);
        return NextResponse.json({ erro: 'Não foi possível abrir o arquivo.' }, { status: 502 });
      }
      const extB2 = r.contentType.split('/')[1] || 'bin';
      return new Response(r.body, {
        headers: {
          'Content-Type': r.contentType,
          'Content-Disposition': `inline; filename="ordem_producao_${pedidoId}.${extB2}"`,
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
      if (fileRes.status === 402) {
        return NextResponse.json(
          { erro: 'Armazenamento de arquivos indisponível no momento (limite de tráfego do plano). Tente novamente mais tarde.' },
          { status: 402 },
        );
      }
      console.error('[ordem-producao] Supabase respondeu', fileRes.status, await fileRes.text().catch(() => ''));
      return NextResponse.json({ erro: 'Não foi possível abrir o arquivo.' }, { status: 502 });
    }

    const contentType = fileRes.headers.get('content-type') || 'application/octet-stream';
    const ext = contentType.split('/')[1] || 'bin';

    return new Response(await fileRes.arrayBuffer(), {
      headers: {
        'Content-Type': contentType,
        'Content-Disposition': `inline; filename="ordem_producao_${pedidoId}.${ext}"`,
        // 7 dias — o navegador reaproveita e não rebaixa a cada clique
        'Cache-Control': 'private, max-age=604800',
      },
    });
  } catch (e) {
    console.error('[ordem-producao] erro ao baixar:', e);
    return new Response('Erro ao buscar arquivo', { status: 500 });
  }
}

export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const user = await autenticar(req);
    if (user instanceof NextResponse) return user;
    if (!user.is_staff) return NextResponse.json({ erro: 'Sem permissao' }, { status: 403 });

    const pedidoId = Number(params.id);
    if (!Number.isInteger(pedidoId) || pedidoId <= 0)
      return NextResponse.json({ erro: 'ID inválido' }, { status: 400 });

    if (!B2_CONFIGURADO)
      return NextResponse.json({ erro: 'Armazenamento de anexos não configurado. Avise o TI.' }, { status: 500 });

    const formData = await req.formData();
    const arquivo = formData.get('arquivo') as File | null;

    if (!arquivo) return NextResponse.json({ erro: 'Nenhum arquivo enviado' }, { status: 400 });
    if (!TIPOS_ACEITOS.includes(arquivo.type))
      return NextResponse.json({ erro: 'Formato inválido. Use PDF, PNG ou JPG.' }, { status: 400 });
    if (arquivo.size > MAX_SIZE)
      return NextResponse.json({ erro: 'Arquivo muito grande (máx 20 MB)' }, { status: 400 });

    // Anexo novo vai pro Backblaze (não conta no egress do Supabase).
    const ext = arquivo.type.split('/')[1] || 'bin';
    const fileName = `pedido_${pedidoId}_op.${ext}`;
    const bytes = await arquivo.arrayBuffer();

    try {
      await b2Upload(fileName, arquivo.type, bytes);
    } catch (e) {
      console.error('[ordem-producao] upload B2 falhou:', e);
      return NextResponse.json({ erro: 'Falha ao enviar o arquivo pro armazenamento. Tente novamente.' }, { status: 502 });
    }

    // Prefixo "b2:" marca que o arquivo está no Backblaze (os antigos ficam sem prefixo).
    await sql`UPDATE producao_pedido SET ordem_producao_url = ${'b2:' + fileName} WHERE id = ${pedidoId}`;

    return NextResponse.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ erro: `Erro interno: ${msg}` }, { status: 500 });
  }
}

export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  try {
    const user = await autenticar(req);
    if (user instanceof NextResponse) return user;
    if (!user.is_staff) return NextResponse.json({ erro: 'Sem permissao' }, { status: 403 });

    const pedidoId = Number(params.id);
    if (!Number.isInteger(pedidoId) || pedidoId <= 0)
      return NextResponse.json({ erro: 'ID inválido' }, { status: 400 });

    const rows = await sql`SELECT ordem_producao_url FROM producao_pedido WHERE id = ${pedidoId}`;
    const storagePath: string | null = rows[0]?.ordem_producao_url ?? null;

    if (storagePath) {
      if (storagePath.startsWith('b2:')) await b2Delete(storagePath.slice(3));
      else await deleteStorage(storagePath);
    }

    await sql`UPDATE producao_pedido SET ordem_producao_url = NULL WHERE id = ${pedidoId}`;

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('[ordem-producao] erro ao remover:', e);
    return NextResponse.json({ erro: 'Erro ao remover ordem de produção' }, { status: 500 });
  }
}
