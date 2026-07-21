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

const TARGET_ITER = 260_000;

async function verifyDjangoPassword(password: string, encoded: string): Promise<{ valid: boolean; needsRehash: boolean }> {
  const parts = encoded.split('$');
  if (parts.length !== 4 || parts[0] !== 'pbkdf2_sha256') return { valid: false, needsRehash: false };
  const iterations = parseInt(parts[1]);
  const salt = parts[2];
  const storedHash = Buffer.from(parts[3], 'base64');
  const derived = await pbkdf2Async(password, salt, iterations, storedHash.length, 'sha256');
  const valid = timingSafeEqual(derived, storedHash);
  return { valid, needsRehash: valid && iterations > TARGET_ITER };
}

async function rehash(userId: number, password: string) {
  try {
    const { randomBytes } = await import('crypto');
    const salt = randomBytes(8).toString('hex');
    const h = await pbkdf2Async(password, salt, TARGET_ITER, 32, 'sha256');
    const enc = `pbkdf2_sha256$${TARGET_ITER}$${salt}$${h.toString('base64')}`;
    await sql`UPDATE usuarios_usuario SET password = ${enc} WHERE id = ${userId}`;
  } catch {}
}

async function registrarAuditoria(username: string, ip: string, sucesso: boolean) {
  try {
    await sql`INSERT INTO auditoria_login (username, ip, sucesso) VALUES (${username}, ${ip}, ${sucesso})`;
  } catch {}
}

export async function POST(req: Request) {
  if (!process.env.JWT_SECRET)
    return NextResponse.json({ erro: 'Configuracao invalida' }, { status: 500 });

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
      SELECT id, username, password, nome, is_staff, is_active, perfil, setor, setores, somente_leitura, ve_todos_pedidos
      FROM usuarios_usuario
      WHERE username = ${String(username).slice(0, 150)}
    `;

    if (!user || !user.is_active) {
      await registrarAuditoria(username, ip, false);
      return NextResponse.json({ erro: 'Usuario ou senha invalidos' }, { status: 401 });
    }

    const { valid, needsRehash } = await verifyDjangoPassword(String(password), user.password);
    if (!valid) {
      await registrarAuditoria(username, ip, false);
      return NextResponse.json({ erro: 'Usuario ou senha invalidos' }, { status: 401 });
    }
    if (needsRehash) await rehash(user.id, String(password));

    clearRateLimit(ip);
    await registrarAuditoria(username, ip, true);

    const isAdmin = user.is_staff || user.perfil === 'administrador' || user.perfil === 'pcp';
    // Lista efetiva de setores: usa `setores` se preenchido; senão cai no setor
    // único (comportamento antigo). Garante que o setor principal esteja incluso.
    const setoresLista: string[] = (Array.isArray(user.setores) && user.setores.length > 0)
      ? (user.setores as string[])
      : (user.setor ? [user.setor] : []);
    const setorPrincipal = user.setor || setoresLista[0] || '';
    // Vendedor é SEMPRE somente-leitura (já forçado na criação/edição de
    // usuário). Forçamos também aqui, no login, pra fechar o caso de linha
    // legada/editada direto no banco com somente_leitura=false — assim contas
    // de visualização (perfil vendedor + ve_todos_pedidos) nunca gravam nada.
    const somenteLeitura = user.perfil === 'vendedor' ? true : user.somente_leitura === true;
    const veTodosPedidos = user.ve_todos_pedidos === true;
    const token = await signToken({
      id: user.id,
      username: user.username,
      nome: user.nome || user.username,
      is_staff: isAdmin,
      perfil: user.perfil || (user.is_staff ? 'administrador' : 'operador'),
      setor: setorPrincipal,
      setores: setoresLista,
      somente_leitura: somenteLeitura,
      ve_todos_pedidos: veTodosPedidos,
    });

    const isProd = process.env.NODE_ENV === 'production';

    const userInfo = {
      id: user.id,
      username: user.username,
      nome: user.nome || user.username,
      is_staff: isAdmin,
      perfil: user.perfil || (user.is_staff ? 'administrador' : 'operador'),
      setor: setorPrincipal,
      setores: setoresLista,
      somente_leitura: somenteLeitura,
      ve_todos_pedidos: veTodosPedidos,
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
