import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { jwtVerify } from 'jose';

const secret = new TextEncoder().encode(process.env.JWT_SECRET || 'acosvital-pcp-secret-2026');

// Rotas que só admin/PCP pode acessar
const ROTAS_ADMIN = [
  '/pedidos',
  '/kanban',
  '/por-lider',
  '/emitidos',
  '/entregues',
  '/divergencias',
  '/relatorios',
  '/exportar',
  '/excluidos',
  '/usuarios',
  '/setup',
];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Rotas públicas — deixa passar
  if (pathname.startsWith('/login') || pathname.startsWith('/api/auth') || pathname.startsWith('/tv') || pathname.startsWith('/api/tv')) {
    return NextResponse.next();
  }

  // Rotas de API — autenticação já feita no handler, não interceptar aqui
  if (pathname.startsWith('/api/')) {
    return NextResponse.next();
  }

  // Ler token do cookie ou header (Next.js middleware não acessa localStorage)
  // O token é passado via cookie "access_token" para o middleware poder ler
  const tokenCookie = req.cookies.get('access_token')?.value;
  if (!tokenCookie) {
    // Sem cookie — redireciona para login (operadores sem cookie não acessam nada)
    return NextResponse.redirect(new URL('/login', req.url));
  }

  let payload: { is_staff?: boolean; setor?: string } = {};
  try {
    const { payload: p } = await jwtVerify(tokenCookie, secret);
    payload = p as { is_staff?: boolean; setor?: string };
  } catch {
    return NextResponse.redirect(new URL('/login', req.url));
  }

  const isAdmin = payload.is_staff === true;
  const meuSetor = payload.setor || '';

  // Redirecionar operadores da raiz para o painel do próprio setor
  if (!isAdmin && meuSetor && pathname === '/') {
    return NextResponse.redirect(new URL(`/setor/${meuSetor}`, req.url));
  }

  // Bloquear não-admins em rotas restritas
  const rotaBloqueada = ROTAS_ADMIN.some(r => pathname === r || pathname.startsWith(r + '/'));
  if (!isAdmin && rotaBloqueada) {
    const destino = meuSetor ? `/setor/${meuSetor}` : '/login';
    return NextResponse.redirect(new URL(destino, req.url));
  }

  // Bloquear não-admins de ver setores de outros (se tiver setor definido)
  if (!isAdmin && meuSetor && pathname.startsWith('/setor/')) {
    let setorDaRota = pathname.split('/')[2];
    try { setorDaRota = decodeURIComponent(setorDaRota); } catch { /* já decodificado */ }
    if (setorDaRota && setorDaRota !== meuSetor) {
      return NextResponse.redirect(new URL(`/setor/${meuSetor}`, req.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|favicon-16.png|favicon-32.png|apple-touch-icon.png|icon-192.png|icon-512.png|manifest.json).*)'],
};
