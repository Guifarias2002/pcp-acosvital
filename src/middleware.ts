import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { jwtVerify } from 'jose';

const secret = new TextEncoder().encode(process.env.JWT_SECRET ?? '');

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

  // Sem JWT_SECRET configurado, um HS256 assinado com chave vazia validaria contra
  // esse mesmo "secret" vazio — trata como não autenticado em vez de confiar nele.
  if (!process.env.JWT_SECRET) {
    return NextResponse.redirect(new URL('/login', req.url));
  }

  let payload: { is_staff?: boolean; perfil?: string; setor?: string; setores?: string[] } = {};
  try {
    const { payload: p } = await jwtVerify(tokenCookie, secret);
    payload = p as { is_staff?: boolean; perfil?: string; setor?: string; setores?: string[] };
  } catch {
    return NextResponse.redirect(new URL('/login', req.url));
  }

  const isAdmin = payload.is_staff === true;
  const meuSetor = payload.setor || '';
  // Lista de setores que o operador pode acessar (múltiplos setores). Fallback
  // para o setor único quando a lista não vem no token (tokens antigos/legado).
  const meusSetores = (Array.isArray(payload.setores) && payload.setores.length > 0)
    ? payload.setores
    : (meuSetor ? [meuSetor] : []);

  const isVendedor = !isAdmin && payload.perfil === 'vendedor';

  // Redirecionar operadores da raiz para o painel do próprio setor
  if (!isAdmin && meuSetor && pathname === '/') {
    return NextResponse.redirect(new URL(`/setor/${meuSetor}`, req.url));
  }

  // Vendedor não tem setor e não deve ver o dashboard geral de produção — vai
  // direto pra "Todos os Pedidos", que já filtra pra mostrar só os dele.
  if (isVendedor && pathname === '/') {
    return NextResponse.redirect(new URL('/pedidos', req.url));
  }

  // Bloquear não-admins em rotas restritas — exceto as partes de /pedidos que
  // são somente leitura pra qualquer setor: a lista ("Todos os Pedidos"), o
  // detalhe de um pedido específico (/pedidos/123, ex: "Ver pedido completo" no
  // modal de rastreio) e seu histórico/relatório. A permissão de verdade é
  // decidida pela própria API (GET /api/pedidos/[id] e afins). Criar
  // (/pedidos/novo) e editar (/pedidos/123/editar) continuam bloqueados aqui,
  // só admin. Sem essa exceção, o middleware bloqueava até líderes/operadores
  // com acesso legítimo, mandando de volta pro próprio setor sem nenhum aviso —
  // parecia que o botão "não fazia nada".
  const isPedidosLeitura = pathname === '/pedidos' || /^\/pedidos\/\d+(\/historico|\/relatorio)?$/.test(pathname);
  // Responsável pela Logística também acessa a aba Entregas (mesma exceção
  // de "leitura liberada por setor" usada acima pra Todos os Pedidos).
  const podeVerEntregas = pathname === '/entregues' && meusSetores.includes('logistica');
  const rotaBloqueada = ROTAS_ADMIN.some(r => pathname === r || pathname.startsWith(r + '/')) && !isPedidosLeitura && !podeVerEntregas;
  if (!isAdmin && rotaBloqueada) {
    const destino = meuSetor ? `/setor/${meuSetor}` : (isVendedor ? '/pedidos' : '/login');
    return NextResponse.redirect(new URL(destino, req.url));
  }

  // Bloquear não-admins de ver setores que não estão na sua lista de acesso.
  // Um operador pode ter mais de um setor (ex.: acabamento + embalagem); só é
  // barrado se o setor da rota não estiver entre os seus.
  if (!isAdmin && pathname.startsWith('/setor/')) {
    if (meusSetores.length === 0) {
      // Sem nenhum setor (caso do vendedor) — não tem painel de setor pra ver.
      return NextResponse.redirect(new URL('/pedidos', req.url));
    }
    let setorDaRota = pathname.split('/')[2];
    try { setorDaRota = decodeURIComponent(setorDaRota); } catch { /* já decodificado */ }
    if (setorDaRota && !meusSetores.includes(setorDaRota)) {
      return NextResponse.redirect(new URL(`/setor/${meuSetor}`, req.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|favicon-16.png|favicon-32.png|apple-touch-icon.png|icon-192.png|icon-512.png|manifest.json).*)'],
};
