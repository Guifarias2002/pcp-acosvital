/**
 * /api/paradas — Registro de Paradas de Pedidos (controle PRIVADO do Guilherme).
 *
 * Anotação dos casos em que um pedido é PARADO pra atender outro que "furou a
 * fila", atrapalhando produção/programação. Serve pra levar o histórico + a
 * contagem pra reunião. Acesso restrito por login (podeRegistrarParadas) —
 * mesmo gate no back (aqui) e no front (página + Sidebar).
 *
 *   GET    → lista as paradas registradas (mais recentes primeiro) + total.
 *   POST   → registra uma parada.
 *   DELETE → remove uma parada (?id=123), caso tenha anotado errado.
 */
import { NextResponse } from 'next/server';
import sql from '@/lib/db';
import { autenticar } from '@/lib/middleware';
import { podeRegistrarParadas } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  try {
    const user = await autenticar(req);
    if (user instanceof NextResponse) return user;
    if (!podeRegistrarParadas(user))
      return NextResponse.json({ erro: 'Sem permissão para ver as paradas de pedidos' }, { status: 403 });

    const paradas = await sql`
      SELECT
        id, pedido, motivo, setor, pedido_prioritario,
        ocorrido_em, criado_por, criado_por_nome, criado_em
      FROM producao_parada_pedido
      ORDER BY ocorrido_em DESC, id DESC
    `.catch(() => [] as Record<string, unknown>[]);

    return NextResponse.json({ paradas, total: paradas.length });
  } catch (e) {
    console.error('[paradas][GET]', e);
    return NextResponse.json({ erro: 'Erro interno' }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const user = await autenticar(req);
    if (user instanceof NextResponse) return user;
    if (!podeRegistrarParadas(user))
      return NextResponse.json({ erro: 'Sem permissão para registrar paradas' }, { status: 403 });

    const body = await req.json().catch(() => ({}));
    const pedido = String(body.pedido ?? '').trim();
    const motivo = String(body.motivo ?? '').trim();
    const setor = String(body.setor ?? '').trim() || null;
    const pedidoPrioritario = String(body.pedido_prioritario ?? '').trim() || null;

    if (!pedido) return NextResponse.json({ erro: 'Informe o pedido que parou.' }, { status: 400 });
    if (!motivo) return NextResponse.json({ erro: 'Informe o motivo da parada.' }, { status: 400 });

    // Data/hora da parada: usa a informada (datetime-local) se válida, senão agora.
    let ocorridoEm: Date = new Date();
    if (body.ocorrido_em) {
      const d = new Date(String(body.ocorrido_em));
      if (!isNaN(d.getTime())) ocorridoEm = d;
    }

    const registro = {
      pedido: pedido.slice(0, 80),
      motivo,
      setor: setor ? setor.slice(0, 80) : null,
      pedido_prioritario: pedidoPrioritario ? pedidoPrioritario.slice(0, 80) : null,
      ocorrido_em: ocorridoEm,
      criado_por: user.username,
      criado_por_nome: user.nome || user.username,
    };

    const [row] = await sql`
      INSERT INTO producao_parada_pedido ${sql(registro)}
      RETURNING id, pedido, motivo, setor, pedido_prioritario, ocorrido_em, criado_por, criado_por_nome, criado_em
    `;
    return NextResponse.json({ ok: true, parada: row });
  } catch (e) {
    console.error('[paradas][POST]', e);
    return NextResponse.json({ erro: 'Erro ao registrar a parada' }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    const user = await autenticar(req);
    if (user instanceof NextResponse) return user;
    if (!podeRegistrarParadas(user))
      return NextResponse.json({ erro: 'Sem permissão para excluir paradas' }, { status: 403 });

    const id = Number(new URL(req.url).searchParams.get('id'));
    if (!Number.isInteger(id) || id <= 0)
      return NextResponse.json({ erro: 'ID inválido' }, { status: 400 });

    await sql`DELETE FROM producao_parada_pedido WHERE id = ${id}`;
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('[paradas][DELETE]', e);
    return NextResponse.json({ erro: 'Erro ao excluir a parada' }, { status: 500 });
  }
}
