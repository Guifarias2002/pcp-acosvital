import { NextResponse } from 'next/server';
import sql from '@/lib/db';
import { signToken } from '@/lib/auth';
import { pbkdf2, timingSafeEqual } from 'crypto';
import { promisify } from 'util';

const pbkdf2Async = promisify(pbkdf2);

// Rate limiting em memória: máx 30 tentativas por IP a cada 15 min
const loginAttempts = new Map<string, { count: number; resetAt: number }>();

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = loginAttempts.get(ip);
  if (!entry || entry.resetAt < now) {
    loginAttempts.set(ip, { count: 1, resetAt: now + 15 * 60 * 1000 });
    return true;
  }
  if (entry.count >= 30) return false;
  entry.count++;
  return true;
}

function clearRateLimit(ip: string) {
  loginAttempts.delete(ip);
}

async function verifyDjangoPassword(password: string, encoded: string): Promise<boolean> {
  const parts = encoded.split('$');
  if (parts.length !== 4 || parts[0] !== 'pbkdf2_sha256') return false;
  const iterations = parseInt(parts[1]);
  const salt = parts[2];
  const storedHash = Buffer.from(parts[3], 'base64');
  const derived = await pbkdf2Async(password, salt, iterations, storedHash.length, 'sha256');
  return timingSafeEqual(derived, storedHash);
}

async function registrarAuditoria(username: string, ip: string, sucesso: boolean) {
  try {
    await sql`INSERT INTO auditoria_login (username, ip, sucesso) VALUES (${username}, ${ip}, ${sucesso})`;
  } catch {}
}

export async function POST(req: Request) {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0].trim()
    || req.headers.get('x-real-ip')
    || 'desconhecido';

  if (!checkRateLimit(ip)) {
    return NextResponse.json(
      { erro: 'Muitas tentativas. Aguarde 15 minutos.' },
      { status: 429, headers: { 'Retry-After': '900' } }
    );
  }

  try {
    const body = await req.json().catch(() => ({}));
    const { username, password } = body;
    if (!username || !password)
      return NextResponse.json({ erro: 'Usuario e senha obrigatorios' }, { status: 400 });

    const [user] = await sql`
      SELECT id, username, password, nome, is_staff, is_active, perfil, setor
      FROM usuarios_usuario
      WHERE username = ${String(username).slice(0, 150)}
    `;

    if (!user || !user.is_active) {
      await registrarAuditoria(username, ip, false);
      return NextResponse.json({ erro: 'Usuario ou senha invalidos' }, { status: 401 });
    }

    const valid = await verifyDjangoPassword(String(password), user.password);
    if (!valid) {
      await registrarAuditoria(username, ip, false);
      return NextResponse.json({ erro: 'Usuario ou senha invalidos' }, { status: 401 });
    }

    clearRateLimit(ip);
    await registrarAuditoria(username, ip, true);

    const isAdmin = user.is_staff || user.perfil === 'administrador' || user.perfil === 'pcp';
    const token = await signToken({
      id: user.id,
      username: user.username,
      nome: user.nome || user.username,
      is_staff: isAdmin,
      perfil: user.perfil || (user.is_staff ? 'administrador' : 'operador'),
      setor: user.setor || '',
    });

    const isProd = process.env.NODE_ENV === 'production';

    const userInfo = {
      id: user.id,
      username: user.username,
      nome: user.nome || user.username,
      is_staff: isAdmin,
      perfil: user.perfil || (user.is_staff ? 'administrador' : 'operador'),
      setor: user.setor || '',
    };

    // Retorna o token (para localStorage) e os dados do usuário (para exibição)
    // Cookie HttpOnly também é setado como camada extra de segurança
    const response = NextResponse.json({ access: token, user: userInfo });
    response.cookies.set('access_token', token, {
      httpOnly: true,
      secure: isProd,
      sameSite: 'strict',
      maxAge: 8 * 60 * 60,
      path: '/',
    });
    return response;
  } catch (e: unknown) {
    console.error('[auth/token] erro:', String(e));
    return NextResponse.json({ erro: 'Erro interno' }, { status: 500 });
  }
}
