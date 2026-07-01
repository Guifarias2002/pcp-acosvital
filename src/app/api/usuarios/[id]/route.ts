
import { autenticar, logAcesso } from '@/lib/middleware';
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
export const dynamic = 'force-dynamic';
import { autenticar, logAcesso } from '@/lib/middleware';
  const user = await autenticar(req);
export const dynamic = 'force-dynamic';
import { autenticar, logAcesso } from '@/lib/middleware';
  if (user instanceof NextResponse) return user;
export const dynamic = 'force-dynamic';
import { autenticar, logAcesso } from '@/lib/middleware';
  if (!user.is_staff) return NextResponse.json({ erro: 'Sem permissao' }, { status: 403 });
export const dynamic = 'force-dynamic';

import { autenticar, logAcesso } from '@/lib/middleware';
  const targetId = Number(params.id);
export const dynamic = 'force-dynamic';
import { autenticar, logAcesso } from '@/lib/middleware';
  if (!Number.isInteger(targetId) || targetId <= 0)
export const dynamic = 'force-dynamic';
import { autenticar, logAcesso } from '@/lib/middleware';
    return NextResponse.json({ erro: 'ID invalido' }, { status: 400 });
export const dynamic = 'force-dynamic';

import { autenticar, logAcesso } from '@/lib/middleware';
  const body = await req.json().catch(() => ({}));
export const dynamic = 'force-dynamic';
import { autenticar, logAcesso } from '@/lib/middleware';
  const campos: Record<string, unknown> = {};
export const dynamic = 'force-dynamic';

import { autenticar, logAcesso } from '@/lib/middleware';
  if (typeof body.nome === 'string' && body.nome.trim()) campos.nome = body.nome.trim().slice(0, 150);
export const dynamic = 'force-dynamic';
import { autenticar, logAcesso } from '@/lib/middleware';
  if (typeof body.setor === 'string') campos.setor = body.setor || null;
export const dynamic = 'force-dynamic';
import { autenticar, logAcesso } from '@/lib/middleware';
  if (typeof body.perfil === 'string') campos.perfil = body.perfil || null;
export const dynamic = 'force-dynamic';
import { autenticar, logAcesso } from '@/lib/middleware';
  if (typeof body.is_active === 'boolean') campos.is_active = body.is_active;
export const dynamic = 'force-dynamic';
import { autenticar, logAcesso } from '@/lib/middleware';
  if (typeof body.is_staff === 'boolean') campos.is_staff = body.is_staff;
export const dynamic = 'force-dynamic';

import { autenticar, logAcesso } from '@/lib/middleware';
  logAcesso(user, req, 'editar_usuario');
export const dynamic = 'force-dynamic';
import { autenticar, logAcesso } from '@/lib/middleware';
  if (Object.keys(campos).length === 0)
export const dynamic = 'force-dynamic';
import { autenticar, logAcesso } from '@/lib/middleware';
    return NextResponse.json({ erro: 'Nenhum campo para atualizar' }, { status: 400 });
export const dynamic = 'force-dynamic';

import { autenticar, logAcesso } from '@/lib/middleware';
  if (campos.nome !== undefined) {
export const dynamic = 'force-dynamic';
import { autenticar, logAcesso } from '@/lib/middleware';
    await sql`UPDATE usuarios_usuario SET nome = ${campos.nome as string} WHERE id = ${targetId}`;
export const dynamic = 'force-dynamic';
import { autenticar, logAcesso } from '@/lib/middleware';
  }
export const dynamic = 'force-dynamic';
import { autenticar, logAcesso } from '@/lib/middleware';
  if (campos.setor !== undefined) {
export const dynamic = 'force-dynamic';
import { autenticar, logAcesso } from '@/lib/middleware';
    await sql`UPDATE usuarios_usuario SET setor = ${campos.setor as string | null} WHERE id = ${targetId}`;
export const dynamic = 'force-dynamic';
import { autenticar, logAcesso } from '@/lib/middleware';
  }
export const dynamic = 'force-dynamic';
import { autenticar, logAcesso } from '@/lib/middleware';
  if (campos.perfil !== undefined) {
export const dynamic = 'force-dynamic';
import { autenticar, logAcesso } from '@/lib/middleware';
    await sql`UPDATE usuarios_usuario SET perfil = ${campos.perfil as string | null} WHERE id = ${targetId}`;
export const dynamic = 'force-dynamic';
import { autenticar, logAcesso } from '@/lib/middleware';
  }
export const dynamic = 'force-dynamic';
import { autenticar, logAcesso } from '@/lib/middleware';
  if (campos.is_active !== undefined) {
export const dynamic = 'force-dynamic';
import { autenticar, logAcesso } from '@/lib/middleware';
    await sql`UPDATE usuarios_usuario SET is_active = ${campos.is_active as boolean} WHERE id = ${targetId}`;
export const dynamic = 'force-dynamic';
import { autenticar, logAcesso } from '@/lib/middleware';
  }
export const dynamic = 'force-dynamic';
import { autenticar, logAcesso } from '@/lib/middleware';
  if (campos.is_staff !== undefined) {
export const dynamic = 'force-dynamic';
import { autenticar, logAcesso } from '@/lib/middleware';
    await sql`UPDATE usuarios_usuario SET is_staff = ${campos.is_staff as boolean} WHERE id = ${targetId}`;
export const dynamic = 'force-dynamic';
import { autenticar, logAcesso } from '@/lib/middleware';
  }
export const dynamic = 'force-dynamic';

import { autenticar, logAcesso } from '@/lib/middleware';
  return NextResponse.json({ ok: true });
export const dynamic = 'force-dynamic';
import { autenticar, logAcesso } from '@/lib/middleware';
}
export const dynamic = 'force-dynamic';

import { autenticar, logAcesso } from '@/lib/middleware';
// LGPD Art. 18 — Direito ao esquecimento
export const dynamic = 'force-dynamic';
import { autenticar, logAcesso } from '@/lib/middleware';
// Remove ou anonimiza dados pessoais do usuário. Apenas admins podem executar.
export const dynamic = 'force-dynamic';
import { autenticar, logAcesso } from '@/lib/middleware';
export async function DELETE(req: Request, { params }: { params: { id: string } }) {
export const dynamic = 'force-dynamic';
import { autenticar, logAcesso } from '@/lib/middleware';
  const user = await autenticar(req);
export const dynamic = 'force-dynamic';
import { autenticar, logAcesso } from '@/lib/middleware';
  if (user instanceof NextResponse) return user;
export const dynamic = 'force-dynamic';
import { autenticar, logAcesso } from '@/lib/middleware';
  if (!user.is_staff) return NextResponse.json({ erro: 'Sem permissao' }, { status: 403 });
export const dynamic = 'force-dynamic';

import { autenticar, logAcesso } from '@/lib/middleware';
  const targetId = Number(params.id);
export const dynamic = 'force-dynamic';
import { autenticar, logAcesso } from '@/lib/middleware';
  if (!Number.isInteger(targetId) || targetId <= 0)
export const dynamic = 'force-dynamic';
import { autenticar, logAcesso } from '@/lib/middleware';
    return NextResponse.json({ erro: 'ID invalido' }, { status: 400 });
export const dynamic = 'force-dynamic';

import { autenticar, logAcesso } from '@/lib/middleware';
  // Não permite que o admin exclua a si mesmo
export const dynamic = 'force-dynamic';
import { autenticar, logAcesso } from '@/lib/middleware';
  if (targetId === user.id)
export const dynamic = 'force-dynamic';
import { autenticar, logAcesso } from '@/lib/middleware';
    return NextResponse.json({ erro: 'Voce nao pode excluir sua propria conta' }, { status: 400 });
export const dynamic = 'force-dynamic';

import { autenticar, logAcesso } from '@/lib/middleware';
  const [target] = await sql`SELECT id, username, is_staff FROM usuarios_usuario WHERE id = ${targetId}`;
export const dynamic = 'force-dynamic';
import { autenticar, logAcesso } from '@/lib/middleware';
  if (!target) return NextResponse.json({ erro: 'Usuario nao encontrado' }, { status: 404 });
export const dynamic = 'force-dynamic';

import { autenticar, logAcesso } from '@/lib/middleware';
  // Anonimiza em vez de deletar para preservar integridade do histórico de movimentações
export const dynamic = 'force-dynamic';
import { autenticar, logAcesso } from '@/lib/middleware';
  const anonUsername = `anonimizado_${targetId}`;
export const dynamic = 'force-dynamic';
import { autenticar, logAcesso } from '@/lib/middleware';
  await sql.begin(async (tx) => {
export const dynamic = 'force-dynamic';
import { autenticar, logAcesso } from '@/lib/middleware';
    await tx`
export const dynamic = 'force-dynamic';
import { autenticar, logAcesso } from '@/lib/middleware';
      UPDATE usuarios_usuario SET
export const dynamic = 'force-dynamic';
import { autenticar, logAcesso } from '@/lib/middleware';
        username    = ${anonUsername},
export const dynamic = 'force-dynamic';
import { autenticar, logAcesso } from '@/lib/middleware';
        nome        = 'Usuário Removido',
export const dynamic = 'force-dynamic';
import { autenticar, logAcesso } from '@/lib/middleware';
        password    = '',
export const dynamic = 'force-dynamic';
import { autenticar, logAcesso } from '@/lib/middleware';
        is_active   = false
export const dynamic = 'force-dynamic';
import { autenticar, logAcesso } from '@/lib/middleware';
      WHERE id = ${targetId}
export const dynamic = 'force-dynamic';
import { autenticar, logAcesso } from '@/lib/middleware';
    `;
export const dynamic = 'force-dynamic';
import { autenticar, logAcesso } from '@/lib/middleware';
    // Registra a anonimização no log de auditoria
export const dynamic = 'force-dynamic';
import { autenticar, logAcesso } from '@/lib/middleware';
    await tx`
export const dynamic = 'force-dynamic';
import { autenticar, logAcesso } from '@/lib/middleware';
      INSERT INTO auditoria_login (username, ip, sucesso)
export const dynamic = 'force-dynamic';
import { autenticar, logAcesso } from '@/lib/middleware';
      VALUES (${'[LGPD] anonimizacao de ' + target.username}, ${'admin:' + user.username}, true)
export const dynamic = 'force-dynamic';
import { autenticar, logAcesso } from '@/lib/middleware';
    `;
export const dynamic = 'force-dynamic';
import { autenticar, logAcesso } from '@/lib/middleware';
  });
export const dynamic = 'force-dynamic';

import { autenticar, logAcesso } from '@/lib/middleware';
  return NextResponse.json({ ok: true, mensagem: 'Dados pessoais anonimizados conforme LGPD Art. 18' });
export const dynamic = 'force-dynamic';
import { autenticar, logAcesso } from '@/lib/middleware';
}
export const dynamic = 'force-dynamic';
