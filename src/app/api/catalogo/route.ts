import { NextResponse } from 'next/server';
import sql from '@/lib/db';
import { autenticar } from '@/lib/middleware';

export const dynamic = 'force-dynamic';

const SUPABASE_URL = (process.env.NEXT_PUBLIC_SUPABASE_URL || '').replace(/^﻿/, '');
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const BUCKET = 'catalogo';
const MAX_SIZE = 20 * 1024 * 1024;

// GET /api/catalogo?q=busca — lista materiais (qualquer usuário autenticado)
export async function GET(req: Request) {
  try {
    const user = await autenticar(req);
    if (user instanceof NextResponse) return user;

    const url = new URL(req.url);
    const q = url.searchParams.get('q')?.trim() || '';

    const rows = q
      ? await sql`
          SELECT m.*, u.nome AS criado_por_nome
          FROM producao_catalogo_material m
          LEFT JOIN usuarios_usuario u ON u.id = m.criado_por_id
          WHERE m.nome ILIKE ${'%' + q + '%'} OR m.categoria ILIKE ${'%' + q + '%'}
          ORDER BY m.criado_em DESC
        `
      : await sql`
          SELECT m.*, u.nome AS criado_por_nome
          FROM producao_catalogo_material m
          LEFT JOIN usuarios_usuario u ON u.id = m.criado_por_id
          ORDER BY m.criado_em DESC
        `;

    return NextResponse.json(rows.map(r => ({
      id: r.id,
      nome: r.nome,
      descricao: r.descricao || '',
      categoria: r.categoria || '',
      nome_arquivo: r.nome_arquivo || '',
      tamanho: r.tamanho,
      mime_type: r.mime_type,
      criado_por_nome: r.criado_por_nome || 'Sistema',
      criado_por_id: r.criado_por_id,
      criado_em: r.criado_em,
    })));
  } catch (e) {
    console.error('[catalogo] erro ao listar:', e);
    return NextResponse.json({ erro: 'Erro ao carregar catálogo' }, { status: 500 });
  }
}

// POST /api/catalogo — upload de novo material (líder ou administrador)
export async function POST(req: Request) {
  try {
    const user = await autenticar(req);
    if (user instanceof NextResponse) return user;
    if (!user.is_staff && user.perfil !== 'lider')
      return NextResponse.json({ erro: 'Sem permissao' }, { status: 403 });

    if (!SERVICE_KEY)
      return NextResponse.json({ erro: 'Configuração do servidor incompleta (SERVICE_KEY)' }, { status: 500 });

    const formData = await req.formData();
    const arquivo = formData.get('arquivo') as File | null;
    const nome = (formData.get('nome') as string | null)?.trim().slice(0, 200) || arquivo?.name || '';
    const descricao = (formData.get('descricao') as string | null)?.trim().slice(0, 1000) || null;
    const categoria = (formData.get('categoria') as string | null)?.trim().slice(0, 100) || null;

    if (!arquivo) return NextResponse.json({ erro: 'Nenhum arquivo enviado' }, { status: 400 });
    if (!nome) return NextResponse.json({ erro: 'Nome do material é obrigatório' }, { status: 400 });
    if (arquivo.size > MAX_SIZE)
      return NextResponse.json({ erro: 'Arquivo muito grande (máx 20 MB)' }, { status: 400 });

    const ext = arquivo.name.split('.').pop() || 'bin';
    const ts = Date.now();
    const storagePath = `material_${ts}.${ext}`;
    const bytes = await arquivo.arrayBuffer();

    const upRes = await fetch(`${SUPABASE_URL}/storage/v1/object/${BUCKET}/${storagePath}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${SERVICE_KEY}`,
        'Content-Type': arquivo.type || 'application/octet-stream',
        'x-upsert': 'true',
      },
      body: bytes,
    });

    if (!upRes.ok) {
      const txt = await upRes.text();
      return NextResponse.json({ erro: `Storage: ${upRes.status} - ${txt}` }, { status: 500 });
    }

    const [row] = await sql`
      INSERT INTO producao_catalogo_material
        (nome, descricao, categoria, storage_path, nome_arquivo, tamanho, mime_type, criado_por_id)
      VALUES
        (${nome}, ${descricao}, ${categoria}, ${storagePath}, ${arquivo.name}, ${arquivo.size}, ${arquivo.type || null}, ${user.id})
      RETURNING id
    `;

    return NextResponse.json({ ok: true, id: row.id });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ erro: `Erro interno: ${msg}` }, { status: 500 });
  }
}
