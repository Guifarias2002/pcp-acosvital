import { NextResponse } from 'next/server';
import sql from '@/lib/db';
import { autenticar } from '@/lib/middleware';

export const dynamic = 'force-dynamic';

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

// POST /api/catalogo — registra material cujo arquivo já foi enviado ao Storage
// via URL assinada (ver /api/catalogo/upload-url). Corpo é só metadados (JSON
// pequeno) — arquivos grandes não podem passar direto por esta rota porque a
// Vercel rejeita corpos de requisição acima de 4.5MB antes do código rodar.
export async function POST(req: Request) {
  try {
    const user = await autenticar(req);
    if (user instanceof NextResponse) return user;
    if (!user.is_staff && user.perfil !== 'lider')
      return NextResponse.json({ erro: 'Sem permissao' }, { status: 403 });

    const body = await req.json().catch(() => ({}));
    const nome = String(body.nome || '').trim().slice(0, 200);
    const descricao = String(body.descricao || '').trim().slice(0, 1000) || null;
    const categoria = String(body.categoria || '').trim().slice(0, 100) || null;
    const storagePath = String(body.storagePath || '');
    const nomeArquivo = String(body.nomeArquivo || '').slice(0, 255);
    const tamanho = Number(body.tamanho) || null;
    const mimeType = body.mimeType ? String(body.mimeType).slice(0, 100) : null;

    if (!storagePath) return NextResponse.json({ erro: 'Nenhum arquivo enviado' }, { status: 400 });
    if (!nome) return NextResponse.json({ erro: 'Nome do material é obrigatório' }, { status: 400 });
    if (tamanho !== null && tamanho > MAX_SIZE)
      return NextResponse.json({ erro: 'Arquivo muito grande (máx 20 MB)' }, { status: 400 });

    const [row] = await sql`
      INSERT INTO producao_catalogo_material
        (nome, descricao, categoria, storage_path, nome_arquivo, tamanho, mime_type, criado_por_id)
      VALUES
        (${nome}, ${descricao}, ${categoria}, ${storagePath}, ${nomeArquivo}, ${tamanho}, ${mimeType}, ${user.id})
      RETURNING id
    `;

    return NextResponse.json({ ok: true, id: row.id });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ erro: `Erro interno: ${msg}` }, { status: 500 });
  }
}
