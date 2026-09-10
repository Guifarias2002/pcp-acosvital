import { SignJWT, jwtVerify } from 'jose';

const secret = new TextEncoder().encode(process.env.JWT_SECRET ?? '');

export interface JWTPayload {
  id: number;
  username: string;
  nome: string;
  is_staff: boolean;
  perfil?: string;
  setor?: string;
  // Lista completa de setores que o operador pode acessar. `setor` continua
  // sendo o setor principal (redirect da raiz / link). Se vazio, o sistema usa [setor].
  setores?: string[];
  // Acesso somente-leitura: vê tudo normalmente, mas não pode alterar nada.
  // O bloqueio efetivo é feito no back (`autenticar` barra métodos de escrita);
  // no front serve só para esconder botões de ação.
  somente_leitura?: boolean;
  // Vendedor com visão de TODOS os pedidos, não só os próprios (conta
  // compartilhada de visualização). Ver `vendedorRestrito` abaixo.
  ve_todos_pedidos?: boolean;
  // Permissão pontual pra desfazer recebimento sem precisar ser administrador
  // completo (que também libera financeiro, gestão de usuários, etc). Ver
  // `podeDesfazerRecebimento` abaixo.
  pode_desfazer_recebimento?: boolean;
  // Permissão pontual pra VER a Análise PCP (indicadores) sem virar
  // administrador. Só leitura — gerar fechamento semanal continua só admin.
  // Ver `podeVerAnalise` abaixo.
  pode_ver_analise?: boolean;
  // Acesso ao workspace PCP HRM (hoje só a tela "Anexar OP") sem ser staff.
  // Ver `podeAcessarHrm` abaixo.
  acesso_hrm?: boolean;
  // Permissão pontual pra DEFINIR a previsão de conclusão das peças/pedidos
  // (Gilmar + equipe PCP). Ver `podeDefinirPrevisao` abaixo.
  pode_definir_previsao?: boolean;
  // Permissão pontual pra VER/USAR a aba "Pedidos Não Localizados" (marcar no
  // setor, ver a aba e reencaminhar) sem virar administrador completo. Admin
  // sempre pode. Ver `podeVerNaoLocalizados` abaixo.
  pode_ver_nao_localizados?: boolean;
}

// Um vendedor "restrito" só pode ver/filtrar os próprios pedidos (por nome).
// `ve_todos_pedidos` libera essa trava pra contas de visualização compartilhada
// que usam perfil vendedor (não-staff, somente-leitura, presas à aba /pedidos)
// mas precisam enxergar a lista completa, não só os pedidos com o próprio nome.
export function vendedorRestrito(u: { perfil?: string; ve_todos_pedidos?: boolean } | null | undefined): boolean {
  return !!u && u.perfil === 'vendedor' && u.ve_todos_pedidos !== true;
}

// Lista efetiva de setores que o usuário pode acessar. Usa `setores` (múltiplos)
// quando preenchido; senão cai no setor único (comportamento antigo / tokens legado).
export function setoresDoUsuario(u: { setor?: string; setores?: string[] } | null | undefined): string[] {
  if (!u) return [];
  return (Array.isArray(u.setores) && u.setores.length > 0)
    ? u.setores
    : (u.setor ? [u.setor] : []);
}

// Um operador (não-staff) pode agir/ver um setor se ele estiver na sua lista.
export function podeAcessarSetor(u: { setor?: string; setores?: string[] } | null | undefined, setor: string): boolean {
  return setoresDoUsuario(u).includes(setor);
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

// "Super admin" = perfil administrador (ou staff legado sem perfil pcp/lider).
// Mesma regra usada nas telas para liberar ações restritas ao administrador.
// Aceita o usuário do JWT (back-end) ou lê do storage (client, sem argumento).
export function isAdministrador(u?: JWTPayload | null): boolean {
  const user = u ?? getUser();
  return !!user && (user.perfil === 'administrador' || (user.is_staff && user.perfil !== 'pcp' && user.perfil !== 'lider'));
}

// Administrador sempre pode; além disso, líderes específicos podem ganhar só
// essa permissão pontual (marcada no cadastro do usuário), sem precisar virar
// administrador completo.
export function podeDesfazerRecebimento(u?: JWTPayload | null): boolean {
  const user = u ?? getUser();
  return isAdministrador(user) || user?.pode_desfazer_recebimento === true;
}

// Pode VER a Análise PCP? Administrador sempre; além dele, usuários com a flag
// `pode_ver_analise` marcada no cadastro (PCP/logística/líderes específicos),
// sem precisar virar administrador completo. É só visualização.
export function podeVerAnalise(u?: JWTPayload | null): boolean {
  const user = u ?? getUser();
  return isAdministrador(user) || user?.pode_ver_analise === true;
}

// Líderes de produção que NÃO podem ver o nome do cliente (decisão do usuário,
// 21/08/2026). Lista EXPLÍCITA por login — de propósito: o perfil 'lider'
// sozinho abrangeria também a logística (que precisa do cliente pra entregar) e
// outros líderes fora do escopo pedido. Pra incluir/remover alguém, edite este
// conjunto. É ocultação só de EXIBIÇÃO (client-side); a API ainda envia o campo.
const LIDERES_SEM_CLIENTE = new Set<string>([
  'diego', 'joao.batalha', 'joao.pedro', 'luan', 'lucas',
  'nestor', 'rafael', 'reginaldo.negri', 'silson',
]);

// Pode ver o nome do cliente? Todos podem, exceto os líderes listados acima.
export function podeVerCliente(u?: JWTPayload | null): boolean {
  const user = u ?? getUser();
  return !(user && LIDERES_SEM_CLIENTE.has(user.username));
}

// Supervisores que podem REDIRECIONAR peças de CORTE pra QUALQUER área — os
// operadores comuns do corte só mandam pra Conferência/Carregamento (HRM) ou
// Caldeiraria (trava server-side; ver DESTINOS_PERMITIDOS_CORTE). Administrador
// sempre pode; além dele, esta lista EXPLÍCITA por login (mesmo padrão de
// LIDERES_SEM_CLIENTE). Pra liberar outra pessoa, adicione o username aqui.
const CORTE_REDIRECT_LIVRE = new Set<string>(['ezequiel']);
export function podeRedirecionarCorteLivre(u?: JWTPayload | null): boolean {
  const user = u ?? getUser();
  return isAdministrador(user) || (!!user && CORTE_REDIRECT_LIVRE.has(user.username));
}

// Pode DEFINIR a previsão de conclusão das peças/pedidos? Administrador e staff
// (PCP) sempre; o perfil `apontador` (percorre a fábrica registrando a previsão
// de fabricação pedido a pedido — é o papel dele); além deles, usuários com a
// flag `pode_definir_previsao` marcada no cadastro (ex.: Gilmar). Demais
// líderes/operadores só visualizam.
export function podeDefinirPrevisao(u?: JWTPayload | null): boolean {
  const user = u ?? getUser();
  return isAdministrador(user) || !!user?.is_staff || user?.perfil === 'apontador' || user?.pode_definir_previsao === true;
}

// Pode VER/USAR a aba "Pedidos Não Localizados"? Administrador sempre; além
// dele, usuários com a flag `pode_ver_nao_localizados` marcada no cadastro
// (ex.: Ezequiel). Libera marcar no setor, ver a aba e reencaminhar.
export function podeVerNaoLocalizados(u?: JWTPayload | null): boolean {
  const user = u ?? getUser();
  return isAdministrador(user) || user?.pode_ver_nao_localizados === true;
}

// Pode VER/USAR o "Registro de Paradas de Pedidos"? Controle PRIVADO — lista
// EXPLÍCITA por login (mesmo padrão de LIDERES_SEM_CLIENTE / CORTE_REDIRECT_LIVRE).
// A pedido do Guilherme, é uma anotação só do acesso dele (pedidos que pararam pra
// atender outro, com motivo/setor), pra levar pra reunião — por isso NÃO libera
// nem pra outros administradores. Pra dar acesso a mais alguém, adicione o
// username aqui. O gate real fica na API (podeRegistrarParadas → 403) + no
// useEffect da página. Ver [[project_analise_pcp]].
const PARADAS_LOGINS = new Set<string>(['guilherme.santos']);
export function podeRegistrarParadas(u?: JWTPayload | null): boolean {
  const user = u ?? getUser();
  return !!user && PARADAS_LOGINS.has(user.username);
}

// Pode DEFINIR o prazo de finalização POR SETOR (item/pedido)? Administrador
// sempre; além dele, lista EXPLÍCITA por login (hoje só Ezequiel), mesmo padrão
// de CORTE_REDIRECT_LIVRE. Ver [[project_prazo_por_setor]]. Todos VÊEM o prazo
// (é o que dita o atraso do setor); só estes EDITAM.
const PRAZO_SETOR_LOGINS = new Set<string>(['ezequiel']);
export function podeDefinirPrazoSetor(u?: JWTPayload | null): boolean {
  const user = u ?? getUser();
  return isAdministrador(user) || (!!user && PRAZO_SETOR_LOGINS.has(user.username));
}

// Pode VER/USAR a aba "Logística" (criar/conferir romaneios de carga)?
// Administrador sempre; além dele, quem tem o setor 'logistica' no cadastro.
// (Acesso definitivo a confirmar — fácil de trocar por lista de login ou flag,
// como em [[project_paradas_pedidos]] / podeRegistrarParadas.)
// TEMPORARIAMENTE DESATIVADA (10/09, a pedido do usuário — vão repassar detalhes
// e a gente religa). Todo o código dos romaneios (/logistica, /api/romaneios/*,
// migration M40) continua pronto; basta voltar o corpo pra
// `isAdministrador(user) || podeAcessarSetor(user, 'logistica')` pra reativar.
const ROMANEIOS_ATIVO = false;
export function podeVerRomaneios(u?: JWTPayload | null): boolean {
  if (!ROMANEIOS_ATIVO) return false;
  const user = u ?? getUser();
  return isAdministrador(user) || podeAcessarSetor(user, 'logistica');
}

// Pode acessar o PCP HRM (tela "Anexar OP")? Staff (admin/PCP) já entra pelo
// seletor de workspace; além deles, usuários comuns com a flag `acesso_hrm`.
export function podeAcessarHrm(u?: JWTPayload | null): boolean {
  const user = u ?? getUser();
  return !!user && (!!user.is_staff || user.acesso_hrm === true);
}

// Pode editar/agir no sistema? Falso apenas para usuários somente-leitura.
// Usado no client para esconder botões de ação. A garantia real está no back.
export function podeEditar(u?: JWTPayload | null): boolean {
  const user = u ?? getUser();
  return !(user && user.somente_leitura === true);
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
