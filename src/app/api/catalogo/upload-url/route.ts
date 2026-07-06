import { NextResponse } from 'next/server';
import { autenticar } from '@/lib/middleware';

export const dynamic = 'force-dynamic';

const SUPABASE_URL = (process.env.NEXT_PUBLIC_SUPABASE_URL || '').replace(/^﻿/, '');
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const BUCKET = 'catalogo';

// POST /api/catalogo/upload-url — gera URL assinada para upload direto ao Storage.
// Necessário porque funções serverless da Vercel rejeitam corpos de requisição
// acima de 4.5MB antes mesmo do código rodar — arquivos maiores precisam ir
// direto do navegador para o Supabase Storage, sem passar pelo nosso servidor.
export async function POST(req: Request) {
  try {
    const user = await autenticar(req);
    if (user instanceof NextResponse) return user;
    if (!user.is_staff && user.perfil !== 'lider')
      return NextResponse.json({ erro: 'Sem permissao' }, { status: 403 });

    if (!SERVICE_KEY || !SUPABASE_URL)
      return NextResponse.json({ erro: 'Configuração do servidor incompleta' }, { status: 500 });

    const body = await req.json().catch(() => ({}));
    const nomeArquivo = String(body.nomeArquivo || 'arquivo.bin');
    const ext = nomeArquivo.split('.').pop() || 'bin';
    const storagePath = `material_${Date.now()}.${ext}`;

    const signRes = await fetch(`${SUPABASE_URL}/storage/v1/object/upload/sign/${BUCKET}/${storagePath}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${SERVICE_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });

    if (!signRes.ok) {
      const txt = await signRes.text();
      return NextResponse.json({ erro: `Falha ao gerar URL de upload: ${signRes.status} - ${txt}` }, { status: 500 });
    }

    const data = await signRes.json() as { url: string };
    const uploadUrl = `${SUPABASE_URL}/storage/v1${data.url}`;

    return NextResponse.json({ uploadUrl, storagePath });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ erro: `Erro interno: ${msg}` }, { status: 500 });
  }
}
