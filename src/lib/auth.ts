import { SignJWT, jwtVerify } from 'jose';

const jwtSecret = process.env.JWT_SECRET;
if (!jwtSecret) throw new Error('JWT_SECRET env var is not set');
const secret = new TextEncoder().encode(jwtSecret);

export interface JWTPayload {
  id: number;
  username: string;
  nome: string;
  is_staff: boolean;
  perfil?: string;
  setor?: string;
}

export async function signToken(payload: JWTPayload): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: 'HS256' })
    .setExpirationTime('8h')
    .sign(secret);
}

export async function verifyToken(token: string): Promise<JWTPayload> {
  const { payload } = await jwtVerify(token, secret);
  return payload as unknown as JWTPayload;
}

export function getTokenFromHeader(req: Request): string | null {
  const auth = req.headers.get('authorization');
  if (!auth || !auth.startsWith('Bearer ')) return null;
  return auth.slice(7);
}

// ── Client-side helpers ───────────────────────────────────────────────────────

export function saveToken(token: string) {
  if (typeof window !== 'undefined') {
    localStorage.setItem('access_token', token);
  }
}

export function getToken(): string | null {
  if (typeof window !== 'undefined') return localStorage.getItem('access_token');
  return null;
}

export function clearToken() {
  if (typeof window !== 'undefined') {
    localStorage.removeItem('access_token');
    localStorage.removeItem('pcp_user');
  }
}

export function getUser(): JWTPayload | null {
  // Tenta ler do pcp_user primeiro, depois decodifica o token
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem('pcp_user');
    if (raw) return JSON.parse(raw) as JWTPayload;
    // Fallback: decodifica o token JWT (sem verificar assinatura — só display)
    const token = getToken();
    if (!token) return null;
    return JSON.parse(atob(token.split('.')[1])) as JWTPayload;
  } catch {
    return null;
  }
}

export async function login(username: string, password: string): Promise<JWTPayload | null> {
  const res = await fetch('/api/auth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  if (!res.ok) {
    const d = await res.json().catch(() => ({}));
    throw new Error(d.erro || 'Credenciais inválidas');
  }
  const data = await res.json();
  if (data.access) saveToken(data.access);
  if (data.user) localStorage.setItem('pcp_user', JSON.stringify(data.user));
  return data.user ?? null;
}

export async function logout() {
  clearToken();
  try { await fetch('/api/auth/logout', { method: 'POST' }); } catch { /* ignore */ }
  window.location.href = '/login';
}
