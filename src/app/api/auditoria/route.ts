
import { autenticar } from '@/lib/middleware';
// GET /api/auditoria — log de acesso estruturado (somente admins)
export const dynamic = 'force-dynamic';
import { autenticar } from '@/lib/middleware';
export async function GET(req: Request) {
export const dynamic = 'force-dynamic';
import { autenticar } from '@/lib/middleware';
  const user = await autenticar(req);
export const dynamic = 'force-dynamic';
import { autenticar } from '@/lib/middleware';
  if (user instanceof NextResponse) return user;
export const dynamic = 'force-dynamic';
import { autenticar } from '@/lib/middleware';
  if (!user.is_staff) return NextResponse.json({ erro: 'Sem permissao' }, { status: 403 });
export const dynamic = 'force-dynamic';

import { autenticar } from '@/lib/middleware';
  const { searchParams } = new URL(req.url);
export const dynamic = 'force-dynamic';
import { autenticar } from '@/lib/middleware';
  const pagina = Math.max(1, Number(searchParams.get('pagina') || '1'));
export const dynamic = 'force-dynamic';
import { autenticar } from '@/lib/middleware';
  const limite = Math.min(200, Math.max(10, Number(searchParams.get('limite') || '50')));
export const dynamic = 'force-dynamic';
import { autenticar } from '@/lib/middleware';
  const offset = (pagina - 1) * limite;
export const dynamic = 'force-dynamic';
import { autenticar } from '@/lib/middleware';
  const usuarioId = searchParams.get('usuario_id');
export const dynamic = 'force-dynamic';
import { autenticar } from '@/lib/middleware';
  const rota = searchParams.get('rota') || '';
export const dynamic = 'force-dynamic';
import { autenticar } from '@/lib/middleware';
  const de = searchParams.get('de') || '';
export const dynamic = 'force-dynamic';
import { autenticar } from '@/lib/middleware';
  const ate = searchParams.get('ate') || '';
export const dynamic = 'force-dynamic';

import { autenticar } from '@/lib/middleware';
  try {
export const dynamic = 'force-dynamic';
import { autenticar } from '@/lib/middleware';
    const registros = await sql`
export const dynamic = 'force-dynamic';
import { autenticar } from '@/lib/middleware';
      SELECT
export const dynamic = 'force-dynamic';
import { autenticar } from '@/lib/middleware';
        a.id,
export const dynamic = 'force-dynamic';
import { autenticar } from '@/lib/middleware';
        a.usuario_id,
export const dynamic = 'force-dynamic';
import { autenticar } from '@/lib/middleware';
        a.username,
export const dynamic = 'force-dynamic';
import { autenticar } from '@/lib/middleware';
        a.metodo,
export const dynamic = 'force-dynamic';
import { autenticar } from '@/lib/middleware';
        a.rota,
export const dynamic = 'force-dynamic';
import { autenticar } from '@/lib/middleware';
        a.acao,
export const dynamic = 'force-dynamic';
import { autenticar } from '@/lib/middleware';
        a.ip,
export const dynamic = 'force-dynamic';
import { autenticar } from '@/lib/middleware';
        a.criado_em::text AS criado_em
export const dynamic = 'force-dynamic';
import { autenticar } from '@/lib/middleware';
      FROM auditoria_acesso a
export const dynamic = 'force-dynamic';
import { autenticar } from '@/lib/middleware';
      WHERE
export const dynamic = 'force-dynamic';
import { autenticar } from '@/lib/middleware';
        (${usuarioId}::int IS NULL OR a.usuario_id = ${usuarioId ? Number(usuarioId) : null}::int)
export const dynamic = 'force-dynamic';
import { autenticar } from '@/lib/middleware';
        AND (${rota} = '' OR a.rota ILIKE ${'%' + rota + '%'})
export const dynamic = 'force-dynamic';
import { autenticar } from '@/lib/middleware';
        AND (${de} = '' OR a.criado_em >= ${de}::timestamptz)
export const dynamic = 'force-dynamic';
import { autenticar } from '@/lib/middleware';
        AND (${ate} = '' OR a.criado_em <= ${ate}::timestamptz)
export const dynamic = 'force-dynamic';
import { autenticar } from '@/lib/middleware';
      ORDER BY a.criado_em DESC
export const dynamic = 'force-dynamic';
import { autenticar } from '@/lib/middleware';
      LIMIT ${limite} OFFSET ${offset}
export const dynamic = 'force-dynamic';
import { autenticar } from '@/lib/middleware';
    `;
export const dynamic = 'force-dynamic';

import { autenticar } from '@/lib/middleware';
    const [{ total }] = await sql`
export const dynamic = 'force-dynamic';
import { autenticar } from '@/lib/middleware';
      SELECT COUNT(*) AS total FROM auditoria_acesso a
export const dynamic = 'force-dynamic';
import { autenticar } from '@/lib/middleware';
      WHERE
export const dynamic = 'force-dynamic';
import { autenticar } from '@/lib/middleware';
        (${usuarioId}::int IS NULL OR a.usuario_id = ${usuarioId ? Number(usuarioId) : null}::int)
export const dynamic = 'force-dynamic';
import { autenticar } from '@/lib/middleware';
        AND (${rota} = '' OR a.rota ILIKE ${'%' + rota + '%'})
export const dynamic = 'force-dynamic';
import { autenticar } from '@/lib/middleware';
        AND (${de} = '' OR a.criado_em >= ${de}::timestamptz)
export const dynamic = 'force-dynamic';
import { autenticar } from '@/lib/middleware';
        AND (${ate} = '' OR a.criado_em <= ${ate}::timestamptz)
export const dynamic = 'force-dynamic';
import { autenticar } from '@/lib/middleware';
    `;
export const dynamic = 'force-dynamic';

import { autenticar } from '@/lib/middleware';
    return NextResponse.json({
export const dynamic = 'force-dynamic';
import { autenticar } from '@/lib/middleware';
      registros,
export const dynamic = 'force-dynamic';
import { autenticar } from '@/lib/middleware';
      total: Number(total),
export const dynamic = 'force-dynamic';
import { autenticar } from '@/lib/middleware';
      pagina,
export const dynamic = 'force-dynamic';
import { autenticar } from '@/lib/middleware';
      limite,
export const dynamic = 'force-dynamic';
import { autenticar } from '@/lib/middleware';
      paginas: Math.ceil(Number(total) / limite),
export const dynamic = 'force-dynamic';
import { autenticar } from '@/lib/middleware';
    });
export const dynamic = 'force-dynamic';
import { autenticar } from '@/lib/middleware';
  } catch {
export const dynamic = 'force-dynamic';
import { autenticar } from '@/lib/middleware';
    // Tabela ainda não criada — retorna vazio sem erro
export const dynamic = 'force-dynamic';
import { autenticar } from '@/lib/middleware';
    return NextResponse.json({ registros: [], total: 0, pagina, limite, paginas: 0 });
export const dynamic = 'force-dynamic';
import { autenticar } from '@/lib/middleware';
  }
export const dynamic = 'force-dynamic';
import { autenticar } from '@/lib/middleware';
}
export const dynamic = 'force-dynamic';
