import { NextResponse } from 'next/server';
import sql from '@/lib/db';
import { autenticar } from '@/lib/middleware';

export const dynamic = 'force-dynamic';

const SUPABASE_URL = (process.env.NEXT_PUBLIC_SUPABASE_URL || '').replace(/^﻿/, '');
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const BUCKET = 'catalogo';

// GET /api/catalogo/[id] — baixa/visualiza o arquivo (qualquer usuário autenticado)
export async function GET(req: Request, { params }: { params: { id: string } }) {
  try {
    const url = new URL(req.url);
    const queryToken = url.searchParams.get('token');
    const reqComToken = queryToken
      ? new Request(req.url, { headers: { ...Object.fromEntries(req.headers), Authorization: `Bearer ${queryToken}` } })
      : req;
    const user = await autenticar(reqComToken);
    if (user instanceof NextResponse) return user;

    const id = Number(params.id);
    if (!Number.isInteger(id) || id <= 0) return new Response('ID inválido', { status: 400 });

    const [row] = await sql`SELECT storage_path, nome_arquivo FROM producao_catalogo_material WHERE id = ${id}`;
    if (!row) return new Response('Material não encontrado', { status: 404 });

    const fileRes = await fetch(`${SUPABASE_URL}/storage/v1/object/${BUCKET}/${row.storage_path}`, {
      headers: { Authorization: `Bearer ${SERVICE_KEY}` },
    });
    if (!fileRes.ok) return new Response('Erro ao buscar arquivo', { status: 500 });

    const contentType = fileRes.headers.get('content-type') || 'application/octet-stream';
    const nome = (row.nome_arquivo || row.storage_path).replace(/[\r\n"]/g, '_');

    return new Response(await fileRes.arrayBuffer(), {
      headers: {
        'Content-Type': contentType,
        'Content-Disposition': `inline; filename="${nome}"`,
        'Cache-Control': 'private, max-age=3600',
      },
    });
  } catch (e) {
    console.error('[catalogo/id] erro ao baixar:', e);
    return new Response('Erro ao buscar arquivo', { status: 500 });
  }
}

// DELETE /api/catalogo/[id] — remove material (autor ou administrador)
export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  try {
    const user = await autenticar(req);
    if (user instanceof NextResponse) return user;

    const id = Number(params.id);
    if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ erro: 'ID inválido' }, { status: 400 });

    const [row] = await sql`SELECT storage_path, criado_por_id FROM producao_catalogo_material WHERE id = ${id}`;
    if (!row) return NextResponse.json({ erro: 'Material não encontrado' }, { status: 404 });

    if (!user.is_staff && row.criado_por_id !== user.id)
      return NextResponse.json({ erro: 'Sem permissao' }, { status: 403 });

    await fetch(`${SUPABASE_URL}/storage/v1/object/${BUCKET}/${row.storage_path}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${SERVICE_KEY}` },
    });
    await sql`DELETE FROM producao_catalogo_material WHERE id = ${id}`;

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('[catalogo/id] erro ao excluir:', e);
    return NextResponse.json({ erro: 'Erro ao excluir material' }, { status: 500 });
  }
}
