import { NextResponse } from 'next/server';
import sql from '@/lib/db';
import { autenticar } from '@/lib/middleware';

export const dynamic = 'force-dynamic';

const MAX_SIZE = 20 * 1024 * 1024; // 20 MB
const TIPOS_ACEITOS = ['application/pdf', 'image/png', 'image/jpeg', 'image/jpg', 'image/webp'];

// Garante coluna na primeira chamada
let colunaCriada = false;
async function garantirColuna() {
  if (colunaCriada) return;
  await sql.unsafe(`ALTER TABLE producao_pedido ADD COLUMN IF NOT EXISTS desenho_url TEXT`).catch(() => {});
  colunaCriada = true;
}

export async function GET(req: Request, { params }: { params: { id: string } }) {
  // Qualquer usuario autenticado pode ver o desenho
  const user = await autenticar(req);
  if (user instanceof NextResponse) return user;

  const pedidoId = Number(params.id);
  await garantirColuna();

  const rows = await sql`SELECT desenho_url FROM producao_pedido WHERE id = ${pedidoId}`;
  const dataUri: string | null = rows[0]?.desenho_url ?? null;

  if (!dataUri) return new Response('Sem desenho', { status: 404 });

  // Extrai tipo e bytes do data URI: "data:<mime>;base64,<data>"
  const match = dataUri.match(/^data:([^;]+);base64,(.+)$/s);
  if (!match) return new Response('Formato inválido', { status: 500 });

  const [, mime, b64] = match;
  const buffer = Buffer.from(b64, 'base64');

  return new Response(buffer, {
    headers: {
      'Content-Type': mime,
      'Content-Disposition': `inline; filename="desenho_${pedidoId}.${mime.split('/')[1]}"`,
      'Cache-Control': 'private, max-age=3600',
    },
  });
}

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const user = await autenticar(req);
  if (user instanceof NextResponse) return user;
  if (!user.is_staff) return NextResponse.json({ erro: 'Sem permissao' }, { status: 403 });

  const pedidoId = Number(params.id);
  if (!Number.isInteger(pedidoId) || pedidoId <= 0)
    return NextResponse.json({ erro: 'ID inválido' }, { status: 400 });

  const formData = await req.formData();
  const arquivo = formData.get('arquivo') as File | null;

  if (!arquivo) return NextResponse.json({ erro: 'Nenhum arquivo enviado' }, { status: 400 });
  if (!TIPOS_ACEITOS.includes(arquivo.type))
    return NextResponse.json({ erro: 'Formato inválido. Use PDF, PNG ou JPG.' }, { status: 400 });
  if (arquivo.size > MAX_SIZE)
    return NextResponse.json({ erro: 'Arquivo muito grande (máx 20 MB)' }, { status: 400 });

  await garantirColuna();

  const bytes = await arquivo.arrayBuffer();
  const base64 = Buffer.from(bytes).toString('base64');
  const dataUri = `data:${arquivo.type};base64,${base64}`;

  await sql`UPDATE producao_pedido SET desenho_url = ${dataUri} WHERE id = ${pedidoId}`;

  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  const user = await autenticar(req);
  if (user instanceof NextResponse) return user;
  if (!user.is_staff) return NextResponse.json({ erro: 'Sem permissao' }, { status: 403 });

  const pedidoId = Number(params.id);
  await garantirColuna();
  await sql`UPDATE producao_pedido SET desenho_url = NULL WHERE id = ${pedidoId}`;

  return NextResponse.json({ ok: true });
}
