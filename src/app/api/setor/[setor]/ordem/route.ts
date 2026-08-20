import { NextResponse } from 'next/server';
import sql from '@/lib/db';
import { autenticar } from '@/lib/middleware';
import { podeAcessarSetor } from '@/lib/auth';

export const dynamic = 'force-dynamic';

// Ordem MANUAL de produção por setor ("furar a fila"). GET devolve o array de
// pedido_id salvo; POST regrava. Quem pode mexer: staff ou quem tem o setor.
function podeMexer(user: { is_staff?: boolean; setor?: string; setores?: string[]; somente_leitura?: boolean }, setor: string) {
  if (user.somente_leitura) return false;
  return !!user.is_staff || podeAcessarSetor(user, setor);
}

export async function GET(req: Request, { params }: { params: { setor: string } }) {
  const user = await autenticar(req);
  if (user instanceof NextResponse) return user;
  const setor = decodeURIComponent(params.setor || '');
  if (!setor) return NextResponse.json({ erro: 'Setor inválido' }, { status: 400 });
  try {
    const rows = await sql`SELECT ordem FROM producao_setor_ordem WHERE setor = ${setor}`;
    return NextResponse.json({ ordem: (rows[0]?.ordem as number[]) ?? [] });
  } catch (e) {
    console.error('[setor/ordem GET]', e);
    return NextResponse.json({ ordem: [] });
  }
}

export async function POST(req: Request, { params }: { params: { setor: string } }) {
  const user = await autenticar(req);
  if (user instanceof NextResponse) return user;
  const setor = decodeURIComponent(params.setor || '');
  if (!setor) return NextResponse.json({ erro: 'Setor inválido' }, { status: 400 });
  if (!podeMexer(user, setor)) return NextResponse.json({ erro: 'Sem permissao' }, { status: 403 });

  try {
    const body = await req.json().catch(() => ({}));
    const bruto = Array.isArray(body.ordem) ? body.ordem : [];
    // Sanitiza: só inteiros positivos, sem duplicados, teto de segurança.
    const vistos = new Set<number>();
    const ordem: number[] = [];
    for (const v of bruto) {
      const n = Number(v);
      if (Number.isInteger(n) && n > 0 && !vistos.has(n)) { vistos.add(n); ordem.push(n); }
      if (ordem.length >= 500) break;
    }
    await sql`
      INSERT INTO producao_setor_ordem (setor, ordem, atualizado_em, atualizado_por_id)
      VALUES (${setor}, ${ordem as unknown as number[]}, NOW(), ${user.id})
      ON CONFLICT (setor) DO UPDATE SET ordem = EXCLUDED.ordem, atualizado_em = NOW(), atualizado_por_id = ${user.id}
    `;
    return NextResponse.json({ ok: true, ordem });
  } catch (e) {
    console.error('[setor/ordem POST]', e);
    return NextResponse.json({ erro: 'Erro ao salvar a ordem' }, { status: 500 });
  }
}
