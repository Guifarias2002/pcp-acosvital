import { NextResponse } from 'next/server';
import sql from '@/lib/db';
import { autenticar } from '@/lib/middleware';
import { NOMES } from '@/lib/types';
import { checkMutationRateLimit, getClientIp } from '@/lib/rateLimit';
import { pbkdf2, randomBytes } from 'crypto';
import { promisify } from 'util';

const pbkdf2Async = promisify(pbkdf2);

async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(8).toString('hex');
  const h = await pbkdf2Async(password, salt, 260_000, 32, 'sha256');
  return `pbkdf2_sha256$260000$${salt}$${h.toString('base64')}`;
}

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

export async function POST(req: Request) {
  const user = await autenticar(req);
  if (user instanceof NextResponse) return user;
  if (!user.is_staff) return NextResponse.json({ erro: 'Sem permissao' }, { status: 403 });
  if (!checkMutationRateLimit(getClientIp(req)))
    return NextResponse.json({ erro: 'Muitas requisicoes' }, { status: 429 });

  const { username, nome, senha, perfil, setor } = await req.json();

  if (!username || !nome || !senha || !perfil)
    return NextResponse.json({ erro: 'Preencha todos os campos obrigatórios.' }, { status: 400 });
  if (senha.length < 8)
    return NextResponse.json({ erro: 'Senha deve ter pelo menos 8 caracteres.' }, { status: 400 });

  const existe = await sql`SELECT id FROM usuarios_usuario WHERE username = ${username}`;
  if (existe.length > 0)
    return NextResponse.json({ erro: 'Nome de usuário já existe.' }, { status: 409 });

  const hashed = await hashPassword(senha);
  const is_staff = perfil === 'administrador' || perfil === 'pcp';

  await sql`
    INSERT INTO usuarios_usuario (username, nome, password, perfil, setor, is_staff, is_active, date_joined)
    VALUES (${username}, ${nome}, ${hashed}, ${perfil}, ${setor || null}, ${is_staff}, true, NOW())
  `;

  return NextResponse.json({ ok: true });
}