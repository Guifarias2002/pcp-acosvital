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
    SELECT id, username, nome, is_staff, is_active, perfil, setor, setores, somente_leitura
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
    };
  }));
}

export async function POST(req: Request) {
  const user = await autenticar(req);
  if (user instanceof NextResponse) return user;
  if (!user.is_staff) return NextResponse.json({ erro: 'Sem permissao' }, { status: 403 });
  if (!checkMutationRateLimit(getClientIp(req)))
    return NextResponse.json({ erro: 'Muitas requisicoes' }, { status: 429 });

  const { username, nome, senha, perfil, setor, setores, somente_leitura } = await req.json();

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
  const setorPrincipal = listaSetores[0] || null;
  // Vendedor é sempre somente leitura, independente do que vier no corpo da requisição.
  const soLeitura = perfil === 'vendedor' ? true : somente_leitura === true;

  try {
    await sql`
      INSERT INTO usuarios_usuario (username, nome, password, perfil, setor, setores, is_staff, is_active, somente_leitura, date_joined)
      VALUES (${username}, ${nome}, ${hashed}, ${perfil}, ${setorPrincipal}, ${listaSetores}, ${is_staff}, true, ${soLeitura}, NOW())
    `;
  } catch (e: unknown) {
    console.error('[POST /api/usuarios]', e);
    const pgErr = e as { code?: string; message?: string; constraint_name?: string };
    // 23514 = check_violation — provavelmente uma trava antiga no banco limitando
    // os valores aceitos em `perfil` (só existia administrador/pcp/lider/operador).
    if (pgErr?.code === '23514') {
      return NextResponse.json({
        erro: `O banco de dados ainda não aceita o perfil "${perfil}" (trava/constraint antiga na coluna perfil: ${pgErr.constraint_name || 'desconhecida'}). Peça pro time de TI atualizar a constraint.`,
      }, { status: 500 });
    }
    return NextResponse.json({ erro: 'Erro ao criar usuário no banco de dados.', detalhe: pgErr?.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}