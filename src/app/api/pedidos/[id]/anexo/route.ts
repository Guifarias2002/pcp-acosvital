import { NextResponse } from 'next/server';
import sql from '@/lib/db';
import { autenticar } from '@/lib/middleware';
import { podeAcessarSetor } from '@/lib/auth';
import { checkMutationRateLimit, getClientIp } from '@/lib/rateLimit';

const MAX_SIZE = 10 * 1024 * 1024; // 10 MB
const EXTENSOES_VALIDAS = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'pdf'];

export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
  const user = await autenticar(req);
  if (user instanceof NextResponse) return user;
  if (!user.is_staff && !podeAcessarSetor(user, 'logistica'))
    return NextResponse.json({ erro: 'Sem permissao' }, { status: 403 });
  if (!checkMutationRateLimit(getClientIp(req)))
    return NextResponse.json({ erro: 'Muitas requisicoes' }, { status: 429 });

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

  const ext = arquivo.name.split('.').pop()?.toLowerCase() || '';
  if (!EXTENSOES_VALIDAS.includes(ext)) {
    return NextResponse.json({ erro: 'Tipo de arquivo não permitido. Use JPG, PNG, PDF ou GIF.' }, { status: 400 });
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
  } catch (e) {
    return NextResponse.json({ erro: e instanceof Error ? e.message : 'Erro interno' }, { status: 500 });
  }
}

export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  try {
    const user = await autenticar(req);
    if (user instanceof NextResponse) return user;
    if (!user.is_staff && !podeAcessarSetor(user, 'logistica'))
      return NextResponse.json({ erro: 'Sem permissao' }, { status: 403 });

    const pedidoId = Number(params.id);
    const body = await req.json().catch(() => ({}));
    const { tipo } = body;
    if (tipo === 'nota') {
      await sql`UPDATE producao_pedido SET nota_url = NULL WHERE id = ${pedidoId}`;
    } else if (tipo === 'canhoto') {
      await sql`UPDATE producao_pedido SET canhoto_url = NULL WHERE id = ${pedidoId}`;
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ erro: e instanceof Error ? e.message : 'Erro interno' }, { status: 500 });
  }
}
