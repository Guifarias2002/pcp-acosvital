
import { NOMES } from '@/lib/types';
export async function GET(req: Request) {
export const dynamic = 'force-dynamic';
import { NOMES } from '@/lib/types';
  const user = await autenticar(req);
export const dynamic = 'force-dynamic';
import { NOMES } from '@/lib/types';
  if (user instanceof NextResponse) return user;
export const dynamic = 'force-dynamic';
import { NOMES } from '@/lib/types';
  if (!user.is_staff) return NextResponse.json({ erro: 'Sem permissao' }, { status: 403 });
export const dynamic = 'force-dynamic';

import { NOMES } from '@/lib/types';
  const users = await sql`
export const dynamic = 'force-dynamic';
import { NOMES } from '@/lib/types';
    SELECT id, username, nome, is_staff, is_active, perfil, setor
export const dynamic = 'force-dynamic';
import { NOMES } from '@/lib/types';
    FROM usuarios_usuario
export const dynamic = 'force-dynamic';
import { NOMES } from '@/lib/types';
    ORDER BY is_active DESC, nome
export const dynamic = 'force-dynamic';
import { NOMES } from '@/lib/types';
  `;
export const dynamic = 'force-dynamic';

import { NOMES } from '@/lib/types';
  return NextResponse.json(users.map(u => ({
export const dynamic = 'force-dynamic';
import { NOMES } from '@/lib/types';
    id: u.id,
export const dynamic = 'force-dynamic';
import { NOMES } from '@/lib/types';
    username: u.username,
export const dynamic = 'force-dynamic';
import { NOMES } from '@/lib/types';
    nome: u.nome || u.username,
export const dynamic = 'force-dynamic';
import { NOMES } from '@/lib/types';
    is_staff: u.is_staff,
export const dynamic = 'force-dynamic';
import { NOMES } from '@/lib/types';
    is_active: u.is_active,
export const dynamic = 'force-dynamic';
import { NOMES } from '@/lib/types';
    perfil: u.perfil || (u.is_staff ? 'administrador' : 'operador'),
export const dynamic = 'force-dynamic';
import { NOMES } from '@/lib/types';
    setor: u.setor || null,
export const dynamic = 'force-dynamic';
import { NOMES } from '@/lib/types';
    setor_nome: u.setor ? (NOMES[u.setor] || u.setor) : null,
export const dynamic = 'force-dynamic';
import { NOMES } from '@/lib/types';
  })));
export const dynamic = 'force-dynamic';
import { NOMES } from '@/lib/types';
}
export const dynamic = 'force-dynamic';
