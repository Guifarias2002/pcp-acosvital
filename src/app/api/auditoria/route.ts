import { NextResponse } from 'next/server';
import sql from '@/lib/db';
import { autenticar } from '@/lib/middleware';

export const dynamic = 'force-dynamic';
// GET /api/auditoria — log de acesso estruturado (somente admins)
export async function GET(req: Request) {
  const user = await autenticar(req);
  if (user instanceof NextResponse) return user;
  if (!user.is_staff) return NextResponse.json({ erro: 'Sem permissao' }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const pagina = Math.max(1, Number(searchParams.get('pagina') || '1'));
  const limite = Math.min(200, Math.max(10, Number(searchParams.get('limite') || '50')));
  const offset = (pagina - 1) * limite;
  const usuarioId = searchParams.get('usuario_id');
  const rota = searchParams.get('rota') || '';
  const de = searchParams.get('de') || '';
  const ate = searchParams.get('ate') || '';

  try {
    const registros = await sql`
      SELECT
        a.id,
        a.usuario_id,
        a.username,
        a.metodo,
        a.rota,
        a.acao,
        a.ip,
        a.criado_em::text AS criado_em
      FROM auditoria_acesso a
      WHERE
        (${usuarioId}::int IS NULL OR a.usuario_id = ${usuarioId ? Number(usuarioId) : null}::int)
        AND (${rota} = '' OR a.rota ILIKE ${'%' + rota + '%'})
        AND (${de} = '' OR a.criado_em >= ${de}::timestamptz)
        AND (${ate} = '' OR a.criado_em <= ${ate}::timestamptz)
      ORDER BY a.criado_em DESC
      LIMIT ${limite} OFFSET ${offset}
    `;

    const [{ total }] = await sql`
      SELECT COUNT(*) AS total FROM auditoria_acesso a
      WHERE
        (${usuarioId}::int IS NULL OR a.usuario_id = ${usuarioId ? Number(usuarioId) : null}::int)
        AND (${rota} = '' OR a.rota ILIKE ${'%' + rota + '%'})
        AND (${de} = '' OR a.criado_em >= ${de}::timestamptz)
        AND (${ate} = '' OR a.criado_em <= ${ate}::timestamptz)
    `;

    return NextResponse.json({
      registros,
      total: Number(total),
      pagina,
      limite,
      paginas: Math.ceil(Number(total) / limite),
    });
  } catch {
    // Tabela ainda não criada — retorna vazio sem erro
    return NextResponse.json({ registros: [], total: 0, pagina, limite, paginas: 0 });
  }
}