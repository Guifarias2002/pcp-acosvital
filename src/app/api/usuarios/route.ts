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
  // Conta somente-leitura (ex.: "VISUALIZAÇÃO COMPARTILHADA", perfil pcp) nunca
  // acessa gestão de usuários — nem para LER a lista. O menu já esconde a tela,
  // mas contas pcp são is_staff=true, então o check acima sozinho deixaria a
  // lista acessível via API direta. Escrita já é barrada no middleware; aqui
  // fechamos a leitura.
  if (user.somente_leitura === true) return NextResponse.json({ erro: 'Sem permissao' }, { status: 403 });

  const users = await sql`
    SELECT id, username, nome, is_staff, is_active, perfil, setor, setores, somente_leitura, pode_desfazer_recebimento, acesso_hrm
    FROM usuarios_usuario
    ORDER BY is_active DESC, nome
  `;

  return NextResponse.json(users.map(u => {
    // Lista efetiva de setores (fallback pro setor único de quem ainda não tem lista).
    const setores: string[] = (Array.isArray(u.setores) && u.setores.length > 0)
      ? u.setores
      : (u.setor ? [u.setor] : []);
    return {
      id: u.id,
      username: u.username,
      nome: u.nome || u.username,
      is_staff: u.is_staff,
      is_active: u.is_active,
      perfil: u.perfil || (u.is_staff ? 'administrador' : 'operador'),
      setor: u.setor || null,
      setor_nome: u.setor ? (NOMES[u.setor] || u.setor) : null,
      setores,
      setores_nomes: setores.map(s => NOMES[s] || s),
      somente_leitura: u.somente_leitura === true,
      pode_desfazer_recebimento: u.pode_desfazer_recebimento === true,
      acesso_hrm: u.acesso_hrm === true,
    };
  }));
}

export async function POST(req: Request) {
  const user = await autenticar(req);
  if (user instanceof NextResponse) return user;
  if (!user.is_staff) return NextResponse.json({ erro: 'Sem permissao' }, { status: 403 });
  if (!checkMutationRateLimit(getClientIp(req)))
    return NextResponse.json({ erro: 'Muitas requisicoes' }, { status: 429 });

  const { username, nome, senha, perfil, setor, setores, somente_leitura, pode_desfazer_recebimento, acesso_hrm } = await req.json();

  if (!username || !nome || !senha || !perfil)
    return NextResponse.json({ erro: 'Preencha todos os campos obrigatórios.' }, { status: 400 });
  if (senha.length < 8)
    return NextResponse.json({ erro: 'Senha deve ter pelo menos 8 caracteres.' }, { status: 400 });

  const existe = await sql`SELECT id FROM usuarios_usuario WHERE username = ${username}`;
  if (existe.length > 0)
    return NextResponse.json({ erro: 'Nome de usuário já existe.' }, { status: 409 });

  const hashed = await hashPassword(senha);
  const is_staff = perfil === 'administrador' || perfil === 'pcp';

  // Aceita `setores` (lista) ou `setor` (único, compatibilidade). O setor
  // principal (redirect da raiz / link) é o primeiro da lista.
  const listaSetores: string[] = Array.isArray(setores)
    ? setores.filter((s: unknown): s is string => typeof s === 'string' && !!s)
    : (setor ? [setor] : []);
  // A coluna escalar `setor` tem FK pra producao_setor (setores "oficiais" do
  // banco). Setores criados só no código (ex.: sinete) existem no SETOR_CHOICES
  // mas ainda não em producao_setor, então usar um deles como PRINCIPAL quebra a
  // FK (23503). O acesso do usuário vem do array `setores` (sem FK), então como
  // principal escolhemos o 1º setor da lista que JÁ EXISTE no banco; o array
  // segue com todos (inclusive sinete). Se nenhum for oficial, deixa null —
  // acesso continua pelo array. A lista de oficiais vem dos setores já usados
  // por outros usuários (garantidamente válidos na FK), sem depender do schema
  // de producao_setor.
  let setorPrincipal: string | null = listaSetores[0] || null;
  if (listaSetores.length > 0) {
    try {
      const usados = await sql`SELECT DISTINCT setor FROM usuarios_usuario WHERE setor IS NOT NULL`;
      const oficiais = new Set(usados.map(r => r.setor as string));
      setorPrincipal = listaSetores.find(s => oficiais.has(s)) ?? null;
    } catch { /* mantém o primeiro da lista */ }
  }
  // Vendedor é sempre somente leitura, independente do que vier no corpo da requisição.
  const soLeitura = perfil === 'vendedor' ? true : somente_leitura === true;
  // Só faz sentido pra líder — administrador já pode, e outros perfis não
  // acessam ação de setor pra usar isso de qualquer forma.
  const podeDesfazer = perfil === 'lider' && pode_desfazer_recebimento === true;
  const acessoHrm = acesso_hrm === true;

  // A tabela usuarios_usuario veio do Django e as migrations só ACRESCENTAM
  // colunas — dependendo do banco ela ainda tem colunas NOT NULL herdadas
  // (first_name/last_name/email/is_superuser) que um INSERT com lista fixa não
  // preenchia, quebrando a criação (mesmo tipo do bug do is_superuser). Aqui
  // descobrimos quais colunas realmente existem e preenchemos só as presentes.
  const registro: Record<string, unknown> = {
    username, nome, password: hashed, perfil,
    setor: setorPrincipal, setores: listaSetores,
    is_staff, is_active: true,
    somente_leitura: soLeitura,
    pode_desfazer_recebimento: podeDesfazer,
    acesso_hrm: acessoHrm,
    date_joined: new Date(),
  };
  try {
    const cols = await sql`
      SELECT column_name FROM information_schema.columns WHERE table_name = 'usuarios_usuario'
    `;
    const existentes = new Set(cols.map(c => c.column_name as string));
    // Defaults seguros pras NOT NULLs herdadas do Django, só se a coluna existir.
    if (existentes.has('is_superuser')) registro.is_superuser = false;
    if (existentes.has('first_name')) registro.first_name = '';
    if (existentes.has('last_name')) registro.last_name = '';
    if (existentes.has('email')) registro.email = '';
    // Mantém só chaves que existem de fato (evita 42703 "coluna não existe").
    for (const k of Object.keys(registro)) if (!existentes.has(k)) delete registro[k];

    await sql`INSERT INTO usuarios_usuario ${sql(registro)}`;
  } catch (e: unknown) {
    console.error('[POST /api/usuarios]', e);
    const pgErr = e as { code?: string; message?: string; constraint_name?: string; column?: string };
    // 23514 = check_violation — provavelmente uma trava antiga no banco limitando
    // os valores aceitos em `perfil` (só existia administrador/pcp/lider/operador).
    if (pgErr?.code === '23514') {
      return NextResponse.json({
        erro: `O banco de dados ainda não aceita o perfil "${perfil}" (trava/constraint antiga na coluna perfil: ${pgErr.constraint_name || 'desconhecida'}). Peça pro time de TI atualizar a constraint.`,
      }, { status: 500 });
    }
    // Mostra o motivo real (coluna/código) direto na mensagem, pra não ficar genérico.
    const detalhe = pgErr?.message || 'desconhecido';
    const extra = [pgErr?.code ? `código ${pgErr.code}` : '', pgErr?.column ? `coluna ${pgErr.column}` : ''].filter(Boolean).join(', ');
    return NextResponse.json({ erro: `Erro ao criar usuário no banco: ${detalhe}${extra ? ` (${extra})` : ''}`, detalhe }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}