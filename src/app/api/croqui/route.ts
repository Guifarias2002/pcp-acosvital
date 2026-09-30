import { NextResponse } from 'next/server';
import sql from '@/lib/db';
import { autenticar } from '@/lib/middleware';
import { podeEditarAcompHrm } from '@/lib/auth';
import { b2Upload, b2Delete, B2_CONFIGURADO } from '@/lib/b2';
import { normalizarCodigoCroqui, TIPOS_CROQUI, MAX_CROQUI } from '@/lib/croqui';
import { runMigrations } from '@/lib/migrations';

export const dynamic = 'force-dynamic';

// Croquis (miniatura do desenho por código de material). Ver src/lib/croqui.ts.
// GET  → lista { codigo_norm, hash, atualizado_em } — o "Subir planilha" usa
//        pra só enviar o que é novo/mudou.
// POST (multipart: codigo, arquivo, hash?, origem?) → grava/substitui o croqui.
//        Quem sobe a planilha (Alan/staff).

export async function GET(req: Request) {
  const user = await autenticar(req);
  if (user instanceof NextResponse) return user;
  await runMigrations();
  const rows = await sql`SELECT codigo_norm, codigo, hash, atualizado_em FROM producao_croqui ORDER BY codigo_norm`;
  return NextResponse.json({ croquis: rows });
}

export async function POST(req: Request) {
  const user = await autenticar(req);
  if (user instanceof NextResponse) return user;
  if (!podeEditarAcompHrm(user)) return NextResponse.json({ erro: 'Sem permissao' }, { status: 403 });
  if (!B2_CONFIGURADO) return NextResponse.json({ erro: 'Armazenamento de arquivos não configurado' }, { status: 503 });

  let form: FormData;
  try { form = await req.formData(); } catch { return NextResponse.json({ erro: 'Envio inválido' }, { status: 400 }); }
  const codigo = String(form.get('codigo') || '').trim().slice(0, 120);
  const norm = normalizarCodigoCroqui(codigo);
  const arq = form.get('arquivo');
  const hash = String(form.get('hash') || '').replace(/[^a-f0-9]/gi, '').slice(0, 64) || null;
  const origem = form.get('origem') === 'planilha' ? 'planilha' : 'tela';
  if (!norm) return NextResponse.json({ erro: 'Informe o código do material' }, { status: 400 });
  if (!(arq instanceof Blob)) return NextResponse.json({ erro: 'Escolha a imagem' }, { status: 400 });
  if (!TIPOS_CROQUI.includes(arq.type)) return NextResponse.json({ erro: 'Use imagem PNG, JPG, WEBP ou GIF' }, { status: 400 });
  if (arq.size > MAX_CROQUI) return NextResponse.json({ erro: 'Imagem grande demais (máx. 5 MB)' }, { status: 400 });

  await runMigrations();
  try {
    const bytes = await arq.arrayBuffer();
    const ext = arq.type.split('/')[1].replace('jpeg', 'jpg');
    const seguro = norm.replace(/[^A-Z0-9._-]+/g, '_');
    const caminho = `croquis/${seguro}-${Date.now()}.${ext}`;
    await b2Upload(caminho, arq.type, bytes);
    const [antigo] = await sql`SELECT storage_path FROM producao_croqui WHERE codigo_norm = ${norm}`;
    await sql`
      INSERT INTO producao_croqui (codigo_norm, codigo, storage_path, mime, tamanho, hash, origem, criado_por_nome, atualizado_em)
      VALUES (${norm}, ${codigo}, ${caminho}, ${arq.type}, ${arq.size}, ${hash}, ${origem}, ${user.nome || user.username}, NOW())
      ON CONFLICT (codigo_norm) DO UPDATE SET codigo = EXCLUDED.codigo, storage_path = EXCLUDED.storage_path, mime = EXCLUDED.mime,
        tamanho = EXCLUDED.tamanho, hash = EXCLUDED.hash, origem = EXCLUDED.origem, criado_por_nome = EXCLUDED.criado_por_nome, atualizado_em = NOW()
    `;
    if (antigo?.storage_path && antigo.storage_path !== caminho) b2Delete(antigo.storage_path as string); // best-effort
    return NextResponse.json({ ok: true, codigo_norm: norm });
  } catch (e) {
    console.error('[croqui POST]', e);
    return NextResponse.json({ erro: 'Não consegui salvar o croqui' }, { status: 500 });
  }
}
