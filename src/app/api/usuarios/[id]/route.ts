import { NextResponse } from 'next/server';
import sql from '@/lib/db';
import { autenticar, logAcesso } from '@/lib/middleware';
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
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const user = await autenticar(req);
  if (user instanceof NextResponse) return user;
  if (!user.is_staff) return NextResponse.json({ erro: 'Sem permissao' }, { status: 403 });
  if (!checkMutationRateLimit(getClientIp(req)))
    return NextResponse.json({ erro: 'Muitas requisicoes' }, { status: 429 });

  const targetId = Number(params.id);
  if (!Number.isInteger(targetId) || targetId <= 0)
    return NextResponse.json({ erro: 'ID invalido' }, { status: 400 });

  const body = await req.json().catch(() => ({}));
  const campos: Record<string, unknown> = {};

  if (typeof body.nome === 'string' && body.nome.trim()) campos.nome = body.nome.trim().slice(0, 150);
  if (typeof body.setor === 'string') campos.setor = body.setor || null;
  // Lista de setores (múltiplos). Quando enviada, o setor principal passa a ser
  // o primeiro da lista, mantendo `setor` e `setores` coerentes.
  if (Array.isArray(body.setores)) {
    const lista = (body.setores as unknown[]).filter((s): s is string => typeof s === 'string' && !!s);
    campos.setores = lista;
    campos.setor = lista[0] || null;
  }
  if (typeof body.perfil === 'string') campos.perfil = body.perfil || null;
  if (typeof body.is_active === 'boolean') campos.is_active = body.is_active;
  if (typeof body.is_staff === 'boolean') campos.is_staff = body.is_staff;
  if (typeof body.somente_leitura === 'boolean') campos.somente_leitura = body.somente_leitura;
  if (typeof body.senha === 'string' && body.senha) {
    if (body.senha.length < 8)
      return NextResponse.json({ erro: 'Senha deve ter pelo menos 8 caracteres' }, { status: 400 });
    campos.senha = body.senha;
  }

  logAcesso(user, req, 'editar_usuario');
  if (Object.keys(campos).length === 0)
    return NextResponse.json({ erro: 'Nenhum campo para atualizar' }, { status: 400 });

  await sql.begin(async (tx) => {
    if (campos.nome !== undefined) {
      await tx`UPDATE usuarios_usuario SET nome = ${campos.nome as string} WHERE id = ${targetId}`;
    }
    if (campos.setor !== undefined) {
      await tx`UPDATE usuarios_usuario SET setor = ${campos.setor as string | null} WHERE id = ${targetId}`;
    }
    if (campos.setores !== undefined) {
      await tx`UPDATE usuarios_usuario SET setores = ${campos.setores as string[]} WHERE id = ${targetId}`;
    }
    if (campos.perfil !== undefined) {
      await tx`UPDATE usuarios_usuario SET perfil = ${campos.perfil as string | null} WHERE id = ${targetId}`;
    }
    if (campos.is_active !== undefined) {
      await tx`UPDATE usuarios_usuario SET is_active = ${campos.is_active as boolean} WHERE id = ${targetId}`;
    }
    if (campos.is_staff !== undefined) {
      await tx`UPDATE usuarios_usuario SET is_staff = ${campos.is_staff as boolean} WHERE id = ${targetId}`;
    }
    if (campos.somente_leitura !== undefined) {
      await tx`UPDATE usuarios_usuario SET somente_leitura = ${campos.somente_leitura as boolean} WHERE id = ${targetId}`;
    }
    if (campos.senha !== undefined) {
      const hashed = await hashPassword(campos.senha as string);
      await tx`UPDATE usuarios_usuario SET password = ${hashed} WHERE id = ${targetId}`;
    }
  });

  return NextResponse.json({ ok: true });
}

// LGPD Art. 18 — Direito ao esquecimento
// Remove ou anonimiza dados pessoais do usuário. Apenas admins podem executar.
export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  const user = await autenticar(req);
  if (user instanceof NextResponse) return user;
  if (!user.is_staff) return NextResponse.json({ erro: 'Sem permissao' }, { status: 403 });
  if (!checkMutationRateLimit(getClientIp(req)))
    return NextResponse.json({ erro: 'Muitas requisicoes' }, { status: 429 });

  const targetId = Number(params.id);
  if (!Number.isInteger(targetId) || targetId <= 0)
    return NextResponse.json({ erro: 'ID invalido' }, { status: 400 });

  // Não permite que o admin exclua a si mesmo
  if (targetId === user.id)
    return NextResponse.json({ erro: 'Voce nao pode excluir sua propria conta' }, { status: 400 });

  const [target] = await sql`SELECT id, username, is_staff FROM usuarios_usuario WHERE id = ${targetId}`;
  if (!target) return NextResponse.json({ erro: 'Usuario nao encontrado' }, { status: 404 });

  // Anonimiza em vez de deletar para preservar integridade do histórico de movimentações
  const anonUsername = `anonimizado_${targetId}`;
  await sql.begin(async (tx) => {
    await tx`
      UPDATE usuarios_usuario SET
        username    = ${anonUsername},
        nome        = 'Usuário Removido',
        password    = '',
        is_active   = false
      WHERE id = ${targetId}
    `;
    // Registra a anonimização no log de auditoria
    await tx`
      INSERT INTO auditoria_login (username, ip, sucesso)
      VALUES (${'[LGPD] anonimizacao de ' + target.username}, ${'admin:' + user.username}, true)
    `;
  });

  return NextResponse.json({ ok: true, mensagem: 'Dados pessoais anonimizados conforme LGPD Art. 18' });
}