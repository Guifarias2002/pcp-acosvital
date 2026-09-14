import { NextResponse } from 'next/server';
import sql from '@/lib/db';
import { autenticar } from '@/lib/middleware';
import { podePlanejar, podeAcessarSetor, isAdministrador } from '@/lib/auth';

export const dynamic = 'force-dynamic';

// Marca um aviso como VISTO (some da caixa de entrada). Quem pode: admin,
// planejador, ou quem tem o setor do aviso (o operador que leu). É uma ação de
// leitura de mensagem, não altera produção.
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const user = await autenticar(req);
  if (user instanceof NextResponse) return user;

  const id = Number(params.id);
  if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ erro: 'ID inválido' }, { status: 400 });

  try {
    const [aviso] = await sql`SELECT id, setor FROM producao_aviso WHERE id = ${id}`;
    if (!aviso) return NextResponse.json({ erro: 'Aviso não encontrado' }, { status: 404 });

    const setor = aviso.setor as string;
    const pode = isAdministrador(user) || podePlanejar(user) || podeAcessarSetor(user, setor);
    if (!pode) return NextResponse.json({ erro: 'Sem permissao' }, { status: 403 });

    await sql`
      UPDATE producao_aviso
      SET visto = true, visto_por_nome = ${user.nome || user.username}, visto_em = NOW()
      WHERE id = ${id} AND visto = false
    `;
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('[avisos/visto POST]', e);
    return NextResponse.json({ erro: 'Erro ao marcar o aviso' }, { status: 500 });
  }
}
