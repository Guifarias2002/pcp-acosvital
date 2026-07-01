import { NextResponse } from 'next/server';
import sql from '@/lib/db';
import { autenticar } from '@/lib/middleware';
import { NOMES } from '@/lib/types';

export const dynamic = 'force-dynamic';
export async function GET(req: Request) {
  const user = await autenticar(req);
  if (user instanceof NextResponse) return user;
  if (!user.is_staff) return NextResponse.json({ erro: 'Sem permissao' }, { status: 403 });

  const users = await sql`
    SELECT id, username, nome, is_staff, is_active, perfil, setor
    FROM usuarios_usuario
    ORDER BY is_active DESC, nome
  `;

  return NextResponse.json(users.map(u => ({
    id: u.id,
    username: u.username,
    nome: u.nome || u.username,
    is_staff: u.is_staff,
    is_active: u.is_active,
    perfil: u.perfil || (u.is_staff ? 'administrador' : 'operador'),
    setor: u.setor || null,
    setor_nome: u.setor ? (NOMES[u.setor] || u.setor) : null,
  })));
}