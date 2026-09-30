import { NextResponse } from 'next/server';
import sql from '@/lib/db';
import { autenticar } from '@/lib/middleware';
import { podeEditarAcompHrm } from '@/lib/auth';
import { b2Download, b2Delete } from '@/lib/b2';
import { normalizarCodigoCroqui } from '@/lib/croqui';

export const dynamic = 'force-dynamic';

type Ctx = { params: { codigo: string } };

// GET ?token=… → a imagem do croqui do código (qualquer usuário logado — é
// pra quem fabrica ver o produto). Cache no navegador (a URL leva ?v=<versão>).
// 404 também fica em cache por 1h pra item sem croqui não bater aqui toda hora.
export async function GET(req: Request, { params }: Ctx) {
  const url = new URL(req.url);
  const t = url.searchParams.get('token');
  const reqAuth = t ? new Request(req.url, { headers: { ...Object.fromEntries(req.headers), Authorization: `Bearer ${t}` } }) : req;
  const user = await autenticar(reqAuth);
  if (user instanceof NextResponse) return user;
  const norm = normalizarCodigoCroqui(decodeURIComponent(params.codigo));
  let row: Record<string, unknown> | undefined;
  try {
    [row] = await sql`SELECT storage_path, mime FROM producao_croqui WHERE codigo_norm = ${norm}`;
  } catch (e) {
    if ((e as { code?: string })?.code !== '42P01') throw e; // tabela ainda não existe → sem croqui
  }
  if (!row) return new NextResponse(null, { status: 404, headers: { 'Cache-Control': 'private, max-age=3600' } });
  const r = await b2Download(String(row.storage_path), { maxBytes: 8 * 1024 * 1024 });
  if (!r.ok) return NextResponse.json({ erro: 'Não consegui abrir o croqui' }, { status: r.status === 404 ? 404 : 502 });
  return new NextResponse(r.body, {
    headers: {
      'Content-Type': String(row.mime || r.contentType),
      'Cache-Control': url.searchParams.get('v') ? 'private, max-age=2592000, immutable' : 'private, max-age=86400',
    },
  });
}

// DELETE → remove o croqui do código (quem sobe a planilha).
export async function DELETE(req: Request, { params }: Ctx) {
  const user = await autenticar(req);
  if (user instanceof NextResponse) return user;
  if (!podeEditarAcompHrm(user)) return NextResponse.json({ erro: 'Sem permissao' }, { status: 403 });
  const norm = normalizarCodigoCroqui(decodeURIComponent(params.codigo));
  const r = await sql`DELETE FROM producao_croqui WHERE codigo_norm = ${norm} RETURNING storage_path`;
  if (!r.length) return NextResponse.json({ erro: 'Croqui não encontrado' }, { status: 404 });
  b2Delete(String(r[0].storage_path));
  return NextResponse.json({ ok: true });
}
