import { NextResponse } from 'next/server';
import sql from '@/lib/db';
import { autenticar } from '@/lib/middleware';

const MAX_SIZE = 10 * 1024 * 1024; // 10 MB

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const user = await autenticar(req);
  if (user instanceof NextResponse) return user;
  if (!user.is_staff) return NextResponse.json({ erro: 'Sem permissao' }, { status: 403 });

  const pedidoId = Number(params.id);
  const formData = await req.formData();
  const tipo = formData.get('tipo') as string;
  const arquivo = formData.get('arquivo') as File | null;

  if (tipo === 'pendente') {
    await sql`UPDATE producao_pedido SET anexo_pendente = TRUE WHERE id = ${pedidoId}`;
    return NextResponse.json({ ok: true });
  }

  if (!arquivo || !['nota', 'canhoto'].includes(tipo)) {
    return NextResponse.json({ erro: 'Tipo ou arquivo inválido' }, { status: 400 });
  }

  if (arquivo.size > MAX_SIZE) {
    return NextResponse.json({ erro: 'Arquivo muito grande (máx 10 MB)' }, { status: 400 });
  }

  const bytes = await arquivo.arrayBuffer();
  const base64 = Buffer.from(bytes).toString('base64');
  const dataUri = `data:${arquivo.type};base64,${base64}`;

  try {
    if (tipo === 'nota') {
      await sql`UPDATE producao_pedido SET nota_url = ${dataUri}, anexo_pendente = FALSE WHERE id = ${pedidoId}`;
    } else {
      await sql`UPDATE producao_pedido SET canhoto_url = ${dataUri}, anexo_pendente = FALSE WHERE id = ${pedidoId}`;
    }
  } catch (dbErr: unknown) {
    console.error('[anexo db error]', dbErr);
    const msg = dbErr instanceof Error ? dbErr.message : String(dbErr);
    return NextResponse.json({ erro: `Erro no banco: ${msg}` }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  const user = await autenticar(req);
  if (user instanceof NextResponse) return user;
  if (!user.is_staff) return NextResponse.json({ erro: 'Sem permissao' }, { status: 403 });

  const pedidoId = Number(params.id);
  const { tipo } = await req.json();
  if (tipo === 'nota') {
    await sql`UPDATE producao_pedido SET nota_url = NULL WHERE id = ${pedidoId}`;
  } else {
    await sql`UPDATE producao_pedido SET canhoto_url = NULL WHERE id = ${pedidoId}`;
  }
  return NextResponse.json({ ok: true });
}
