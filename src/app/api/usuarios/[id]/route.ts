import { NextResponse } from 'next/server';
import sql from '@/lib/db';
import { autenticar, logAcesso } from '@/lib/middleware';

export const dynamic = 'force-dynamic';
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const user = await autenticar(req);
  if (user instanceof NextResponse) return user;
  if (!user.is_staff) return NextResponse.json({ erro: 'Sem permissao' }, { status: 403 });

  const targetId = Number(params.id);
  if (!Number.isInteger(targetId) || targetId <= 0)
    return NextResponse.json({ erro: 'ID invalido' }, { status: 400 });

  const body = await req.json().catch(() => ({}));
  const campos: Record<string, unknown> = {};

  if (typeof body.nome === 'string' && body.nome.trim()) campos.nome = body.nome.trim().slice(0, 150);
  if (typeof body.setor === 'string') campos.setor = body.setor || null;
  if (typeof body.perfil === 'string') campos.perfil = body.perfil || null;
  if (typeof body.is_active === 'boolean') campos.is_active = body.is_active;
  if (typeof body.is_staff === 'boolean') campos.is_staff = body.is_staff;

  logAcesso(user, req, 'editar_usuario');
  if (Object.keys(campos).length === 0)
    return NextResponse.json({ erro: 'Nenhum campo para atualizar' }, { status: 400 });

  if (campos.nome !== undefined) {
    await sql`UPDATE usuarios_usuario SET nome = ${campos.nome as string} WHERE id = ${targetId}`;
  }
  if (campos.setor !== undefined) {
    await sql`UPDATE usuarios_usuario SET setor = ${campos.setor as string | null} WHERE id = ${targetId}`;
  }
  if (campos.perfil !== undefined) {
    await sql`UPDATE usuarios_usuario SET perfil = ${campos.perfil as string | null} WHERE id = ${targetId}`;
  }
  if (campos.is_active !== undefined) {
    await sql`UPDATE usuarios_usuario SET is_active = ${campos.is_active as boolean} WHERE id = ${targetId}`;
  }
  if (campos.is_staff !== undefined) {
    await sql`UPDATE usuarios_usuario SET is_staff = ${campos.is_staff as boolean} WHERE id = ${targetId}`;
  }

  return NextResponse.json({ ok: true });
}

// LGPD Art. 18 — Direito ao esquecimento
// Remove ou anonimiza dados pessoais do usuário. Apenas admins podem executar.
export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  const user = await autenticar(req);
  if (user instanceof NextResponse) return user;
  if (!user.is_staff) return NextResponse.json({ erro: 'Sem permissao' }, { status: 403 });

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