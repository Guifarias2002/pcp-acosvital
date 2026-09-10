/**
 * /api/paradas — Registro de Paradas de Pedidos (controle PRIVADO do Guilherme).
 *
 * Anotação dos casos em que um pedido é PARADO pra atender outro que "furou a
 * fila", atrapalhando produção/programação. Serve pra levar o histórico + a
 * contagem pra reunião. Acesso restrito por login (podeRegistrarParadas) —
 * mesmo gate no back (aqui) e no front (página + Sidebar).
 *
 *   GET    → lista as paradas + total + comparativo (por dia/semana/mês).
 *   POST   → registra uma parada.
 *   DELETE → remove uma parada (?id=123), caso tenha anotado errado.
 *
 * Além de contar ocorrências, cada parada guarda quantas PEÇAS pararam (no
 * pedido interrompido) e quantas PEÇAS foram iniciadas no pedido que entrou na
 * frente — pra medir o tamanho do impacto. As agregações somam essas peças.
 * Datas agrupadas no fuso de São Paulo (ocorrido_em é timestamptz).
 */
import { NextResponse } from 'next/server';
import sql from '@/lib/db';
import { autenticar } from '@/lib/middleware';
import { podeRegistrarParadas } from '@/lib/auth';

export const dynamic = 'force-dynamic';

const TZ = 'America/Sao_Paulo';

// Inteiro >= 0 a partir do body (aceita vazio/null → null).
function intOuNull(v: unknown): number | null {
  if (v == null || v === '') return null;
  const n = Math.round(Number(v));
  return Number.isFinite(n) && n >= 0 ? n : null;
}

export async function GET(req: Request) {
  try {
    const user = await autenticar(req);
    if (user instanceof NextResponse) return user;
    if (!podeRegistrarParadas(user))
      return NextResponse.json({ erro: 'Sem permissão para ver as paradas de pedidos' }, { status: 403 });

    const [paradas, porDia, porSemana, porMes] = await Promise.all([
      sql`
        SELECT
          id, pedido, motivo, setor, pedido_prioritario,
          pecas_paradas, pecas_iniciadas, retornado_em,
          ocorrido_em, criado_por, criado_por_nome, criado_em
        FROM producao_parada_pedido
        ORDER BY ocorrido_em DESC, id DESC
      `.catch(() => [] as Record<string, unknown>[]),
      // Por DIA — últimos 30 dias com registro.
      sql`
        SELECT (ocorrido_em AT TIME ZONE ${TZ})::date AS periodo,
               COUNT(*)::int AS paradas,
               COALESCE(SUM(pecas_paradas), 0)::int AS pecas_paradas,
               COALESCE(SUM(pecas_iniciadas), 0)::int AS pecas_iniciadas
        FROM producao_parada_pedido
        GROUP BY 1 ORDER BY 1 DESC LIMIT 30
      `.catch(() => [] as Record<string, unknown>[]),
      // Por SEMANA (segunda a domingo) — últimas 12 semanas com registro.
      sql`
        SELECT date_trunc('week', ocorrido_em AT TIME ZONE ${TZ})::date AS periodo,
               COUNT(*)::int AS paradas,
               COALESCE(SUM(pecas_paradas), 0)::int AS pecas_paradas,
               COALESCE(SUM(pecas_iniciadas), 0)::int AS pecas_iniciadas
        FROM producao_parada_pedido
        GROUP BY 1 ORDER BY 1 DESC LIMIT 12
      `.catch(() => [] as Record<string, unknown>[]),
      // Por MÊS — últimos 12 meses com registro.
      sql`
        SELECT date_trunc('month', ocorrido_em AT TIME ZONE ${TZ})::date AS periodo,
               COUNT(*)::int AS paradas,
               COALESCE(SUM(pecas_paradas), 0)::int AS pecas_paradas,
               COALESCE(SUM(pecas_iniciadas), 0)::int AS pecas_iniciadas
        FROM producao_parada_pedido
        GROUP BY 1 ORDER BY 1 DESC LIMIT 12
      `.catch(() => [] as Record<string, unknown>[]),
    ]);

    return NextResponse.json({
      paradas,
      total: paradas.length,
      resumo: { por_dia: porDia, por_semana: porSemana, por_mes: porMes },
    });
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
      pecas_paradas: intOuNull(body.pecas_paradas),
      pecas_iniciadas: intOuNull(body.pecas_iniciadas),
      ocorrido_em: ocorridoEm,
      criado_por: user.username,
      criado_por_nome: user.nome || user.username,
    };

    const [row] = await sql`
      INSERT INTO producao_parada_pedido ${sql(registro)}
      RETURNING id, pedido, motivo, setor, pedido_prioritario, pecas_paradas, pecas_iniciadas,
                ocorrido_em, criado_por, criado_por_nome, criado_em
    `;
    return NextResponse.json({ ok: true, parada: row });
  } catch (e) {
    console.error('[paradas][POST]', e);
    return NextResponse.json({ erro: 'Erro ao registrar a parada' }, { status: 500 });
  }
}

// PATCH /api/paradas?id=123  { retornar: true | false }
// Marca (ou desfaz) o RETORNO do pedido. Não apaga nada — só grava/limpa a
// data/hora em que voltou a andar. Idempotente: marcar duas vezes mantém a 1ª
// data (só grava se ainda estava parado); desmarcar limpa.
export async function PATCH(req: Request) {
  try {
    const user = await autenticar(req);
    if (user instanceof NextResponse) return user;
    if (!podeRegistrarParadas(user))
      return NextResponse.json({ erro: 'Sem permissão para alterar paradas' }, { status: 403 });

    const id = Number(new URL(req.url).searchParams.get('id'));
    if (!Number.isInteger(id) || id <= 0)
      return NextResponse.json({ erro: 'ID inválido' }, { status: 400 });

    const body = await req.json().catch(() => ({}));
    const retornar = body.retornar !== false; // default = marcar retorno

    const [row] = retornar
      ? await sql`
          UPDATE producao_parada_pedido
          SET retornado_em = COALESCE(retornado_em, NOW())
          WHERE id = ${id}
          RETURNING id, retornado_em`
      : await sql`
          UPDATE producao_parada_pedido
          SET retornado_em = NULL
          WHERE id = ${id}
          RETURNING id, retornado_em`;

    if (!row) return NextResponse.json({ erro: 'Parada não encontrada' }, { status: 404 });
    return NextResponse.json({ ok: true, id: row.id, retornado_em: row.retornado_em });
  } catch (e) {
    console.error('[paradas][PATCH]', e);
    return NextResponse.json({ erro: 'Erro ao atualizar o retorno' }, { status: 500 });
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
