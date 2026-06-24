import { verifyToken, getTokenFromHeader, JWTPayload } from './auth';
import { NextResponse } from 'next/server';
import sql from './db';

function getTokenFromCookie(req: Request): string | null {
  const cookieHeader = req.headers.get('cookie') || '';
  const match = cookieHeader.match(/(?:^|;\s*)access_token=([^;]+)/);
  return match ? decodeURIComponent(match[1]) : null;
}

export async function autenticar(req: Request): Promise<JWTPayload | NextResponse> {
  if (!process.env.JWT_SECRET)
    return NextResponse.json({ erro: 'Configuracao invalida' }, { status: 500 });

  // Cookie HttpOnly tem prioridade; fallback para header Authorization (compatibilidade)
  const token = getTokenFromCookie(req) || getTokenFromHeader(req);
  if (!token) return NextResponse.json({ erro: 'Nao autenticado' }, { status: 401 });

  try {
    return await verifyToken(token);
  } catch {
    return NextResponse.json({ erro: 'Token invalido ou expirado' }, { status: 401 });
  }
}

// Registra acesso a uma rota de API na tabela auditoria_acesso (log estruturado LGPD/TI)
export async function logAcesso(
  user: JWTPayload,
  req: Request,
  acao?: string,
) {
  try {
    const url = new URL(req.url);
    const ip = req.headers.get('x-forwarded-for')?.split(',')[0].trim()
      || req.headers.get('x-real-ip')
      || null;
    await sql`
      INSERT INTO auditoria_acesso (usuario_id, username, metodo, rota, acao, ip, criado_em)
      VALUES (${user.id}, ${user.username}, ${req.method}, ${url.pathname}, ${acao ?? null}, ${ip}, NOW())
    `;
  } catch { /* log nunca deve quebrar a requisição */ }
}
