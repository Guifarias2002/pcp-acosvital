import { NextResponse } from 'next/server';
import { autenticar } from '@/lib/middleware';
import { lerOP } from '@/lib/opReader';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 30;

const MAX_SIZE = 20 * 1024 * 1024;

// Lê uma OP do Totvs em PDF e devolve materiais + roteiro (por onde passa).
// Usado pela tela PCP HRM assim que a pessoa anexa o arquivo — antes de salvar.
export async function POST(req: Request) {
  try {
    const user = await autenticar(req);
    if (user instanceof NextResponse) return user;

    const form = await req.formData();
    const arquivo = form.get('arquivo') as File | null;
    if (!arquivo) return NextResponse.json({ erro: 'Nenhum arquivo enviado' }, { status: 400 });
    if (arquivo.type && arquivo.type !== 'application/pdf') {
      return NextResponse.json({ erro: 'A leitura automática só funciona com PDF do Totvs.' }, { status: 400 });
    }
    if (arquivo.size > MAX_SIZE) return NextResponse.json({ erro: 'Arquivo muito grande (máx 20 MB)' }, { status: 400 });

    const buf = Buffer.from(await arquivo.arrayBuffer());
    const leitura = await lerOP(buf);
    return NextResponse.json({ ok: true, ...leitura });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[pcp-hrm/ler-op] falha ao ler OP:', e);
    return NextResponse.json({ erro: `Não consegui ler a OP: ${msg}` }, { status: 500 });
  }
}
