/**
 * POST /api/prazo-setor  { nivel: 'item'|'pedido', id, prazo }
 *
 * Define (ou limpa, com prazo vazio) o PRAZO DE FINALIZAÇÃO do SETOR ATUAL de um
 * item ou pedido. O setor é sempre o `setor_atual` do alvo — o prazo vale só
 * enquanto ele estiver ali (honrado quando prazo_setor_ref = setor_atual). Ao
 * avançar de setor o prazo deixa de valer automaticamente; um novo é definido no
 * setor seguinte. Guarda histórico por setor em producao_prazo_setor.
 *
 * Só Ezequiel + admin (podeDefinirPrazoSetor). Ver [[project_prazo_por_setor]].
 */
import { NextResponse } from 'next/server';
import sql from '@/lib/db';
import { autenticar } from '@/lib/middleware';
import { podeDefinirPrazoSetor } from '@/lib/auth';

export const dynamic = 'force-dynamic';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export async function POST(req: Request) {
  try {
    const user = await autenticar(req);
    if (user instanceof NextResponse) return user;
    if (!podeDefinirPrazoSetor(user))
      return NextResponse.json({ erro: 'Sem permissão para definir prazo por setor' }, { status: 403 });

    const body = await req.json().catch(() => ({}));
    const nivel = body.nivel === 'pedido' ? 'pedido' : 'item';
    const id = Number(body.id);
    const prazo = String(body.prazo ?? '').trim();
    if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ erro: 'ID inválido' }, { status: 400 });
    if (prazo && !DATE_RE.test(prazo)) return NextResponse.json({ erro: 'Data inválida (use AAAA-MM-DD)' }, { status: 400 });

    const tabela = nivel === 'pedido' ? 'producao_pedido' : 'producao_itempedido';
    const [alvo] = await sql.unsafe(`SELECT setor_atual FROM ${tabela} WHERE id = $1`, [id]);
    if (!alvo) return NextResponse.json({ erro: `${nivel} não encontrado` }, { status: 404 });
    const setor = (alvo.setor_atual as string) || '';
    if (!setor) return NextResponse.json({ erro: 'Sem setor atual definido' }, { status: 400 });

    await sql.begin(async (tx) => {
      // Encerra o prazo vigente anterior desse alvo (vira histórico).
      if (nivel === 'pedido') {
        await tx`UPDATE producao_prazo_setor SET vigente = false, encerrado_em = NOW()
                 WHERE pedido_id = ${id} AND nivel = 'pedido' AND vigente`;
      } else {
        await tx`UPDATE producao_prazo_setor SET vigente = false, encerrado_em = NOW()
                 WHERE item_id = ${id} AND nivel = 'item' AND vigente`;
      }

      if (prazo) {
        await tx`
          INSERT INTO producao_prazo_setor ${tx({
            nivel,
            item_id: nivel === 'item' ? id : null,
            pedido_id: nivel === 'pedido' ? id : null,
            setor, prazo, vigente: true,
            definido_por: user.username, definido_por_nome: user.nome || user.username,
          })}`;
        await tx.unsafe(
          `UPDATE ${tabela} SET prazo_setor = $1, prazo_setor_ref = $2 WHERE id = $3`,
          [prazo, setor, id]
        );
      } else {
        // Limpar: zera o denormalizado (o histórico encerrado fica preservado).
        await tx.unsafe(`UPDATE ${tabela} SET prazo_setor = NULL, prazo_setor_ref = NULL WHERE id = $1`, [id]);
      }
    });

    return NextResponse.json({ ok: true, setor, prazo: prazo || null });
  } catch (e) {
    console.error('[prazo-setor][POST]', e);
    return NextResponse.json({ erro: 'Erro ao definir o prazo do setor' }, { status: 500 });
  }
}

// GET /api/prazo-setor?nivel=item&id=123 → histórico de prazos por setor do alvo.
export async function GET(req: Request) {
  try {
    const user = await autenticar(req);
    if (user instanceof NextResponse) return user;

    const url = new URL(req.url);
    const nivel = url.searchParams.get('nivel') === 'pedido' ? 'pedido' : 'item';
    const id = Number(url.searchParams.get('id'));
    if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ erro: 'ID inválido' }, { status: 400 });

    const historico = nivel === 'pedido'
      ? await sql`SELECT id, setor, prazo, vigente, definido_por_nome, criado_em, encerrado_em
                  FROM producao_prazo_setor WHERE pedido_id = ${id} AND nivel = 'pedido'
                  ORDER BY criado_em DESC`
      : await sql`SELECT id, setor, prazo, vigente, definido_por_nome, criado_em, encerrado_em
                  FROM producao_prazo_setor WHERE item_id = ${id} AND nivel = 'item'
                  ORDER BY criado_em DESC`;

    return NextResponse.json({ historico });
  } catch (e) {
    console.error('[prazo-setor][GET]', e);
    return NextResponse.json({ erro: 'Erro ao buscar histórico', historico: [] }, { status: 500 });
  }
}
