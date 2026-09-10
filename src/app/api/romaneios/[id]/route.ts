/**
 * /api/romaneios/[id]
 *   GET    → o romaneio + seus itens.
 *   PATCH  → salva cabeçalho + itens (substitui a lista) + status/conferência.
 *   DELETE → remove o romaneio (e os itens, via ON DELETE CASCADE).
 *
 * "Fechar" o romaneio = status 'fechado' + fechado_em. Reabrir volta a 'aberto'.
 */
import { NextResponse } from 'next/server';
import sql from '@/lib/db';
import { autenticar } from '@/lib/middleware';
import { podeVerRomaneios } from '@/lib/auth';

export const dynamic = 'force-dynamic';

type ItemIn = Record<string, unknown>;
function normalizaItens(itens: unknown) {
  if (!Array.isArray(itens)) return [];
  const out = [];
  let ordem = 0;
  for (const raw of itens as ItemIn[]) {
    const descricao = String(raw.descricao ?? '').trim();
    if (!descricao) continue;
    const qtdN = raw.quantidade == null || raw.quantidade === '' ? null : Number(raw.quantidade);
    out.push({
      ordem: ordem++,
      pedido: String(raw.pedido ?? '').trim().slice(0, 80) || null,
      descricao,
      categoria: (String(raw.categoria ?? '').trim() || 'Produção').slice(0, 60),
      finalidade: (String(raw.finalidade ?? '').trim() || 'Produto Acabado').slice(0, 80),
      unidade: (String(raw.unidade ?? '').trim() || null)?.slice(0, 20) ?? null,
      quantidade: qtdN != null && Number.isFinite(qtdN) ? qtdN : null,
      conferido: raw.conferido === true,
      item_pedido_id: Number.isInteger(Number(raw.item_pedido_id)) && Number(raw.item_pedido_id) > 0 ? Number(raw.item_pedido_id) : null,
    });
  }
  return out;
}

function pegarId(req: Request): number {
  const partes = new URL(req.url).pathname.split('/').filter(Boolean);
  return Number(partes[partes.length - 1]);
}

export async function GET(req: Request) {
  try {
    const user = await autenticar(req);
    if (user instanceof NextResponse) return user;
    if (!podeVerRomaneios(user))
      return NextResponse.json({ erro: 'Sem permissão' }, { status: 403 });

    const id = pegarId(req);
    if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ erro: 'ID inválido' }, { status: 400 });

    const [romaneio] = await sql`SELECT * FROM producao_romaneio WHERE id = ${id}`;
    if (!romaneio) return NextResponse.json({ erro: 'Romaneio não encontrado' }, { status: 404 });

    const itens = await sql`
      SELECT id, ordem, pedido, descricao, categoria, finalidade, unidade,
             quantidade::float AS quantidade, conferido, item_pedido_id
      FROM producao_romaneio_item WHERE romaneio_id = ${id}
      ORDER BY ordem, id`;

    return NextResponse.json({ romaneio, itens });
  } catch (e) {
    console.error('[romaneios/id][GET]', e);
    return NextResponse.json({ erro: 'Erro interno' }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  try {
    const user = await autenticar(req);
    if (user instanceof NextResponse) return user;
    if (!podeVerRomaneios(user))
      return NextResponse.json({ erro: 'Sem permissão' }, { status: 403 });

    const id = pegarId(req);
    if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ erro: 'ID inválido' }, { status: 400 });

    const body = await req.json().catch(() => ({}));

    const cab: Record<string, unknown> = {
      origem: (String(body.origem ?? '').trim() || 'HRM').slice(0, 80),
      destino: (String(body.destino ?? '').trim() || 'Aços Vital').slice(0, 80),
      data_carregamento: body.data_carregamento ? String(body.data_carregamento).slice(0, 10) : null,
      placa: (String(body.placa ?? '').trim() || null)?.slice(0, 20) ?? null,
      motorista: (String(body.motorista ?? '').trim() || null)?.slice(0, 120) ?? null,
      setor_descarga: (String(body.setor_descarga ?? '').trim() || 'Produto acabado').slice(0, 80),
      finalidade: (String(body.finalidade ?? '').trim() || 'Produto Acabado').slice(0, 80),
      operador_separacao: (String(body.operador_separacao ?? '').trim() || null)?.slice(0, 120) ?? null,
      conferente_carregamento: (String(body.conferente_carregamento ?? '').trim() || null)?.slice(0, 120) ?? null,
      conferente_descarga: (String(body.conferente_descarga ?? '').trim() || null)?.slice(0, 120) ?? null,
      observacao: String(body.observacao ?? '').trim() || null,
    };
    // Status: 'fechado' grava fechado_em; 'aberto' limpa. Só muda se vier.
    if (body.status === 'fechado' || body.status === 'aberto') {
      cab.status = body.status;
      cab.fechado_em = body.status === 'fechado' ? new Date() : null;
    }

    const itens = normalizaItens(body.itens);
    const substituirItens = Array.isArray(body.itens);

    await sql.begin(async (tx) => {
      await tx`UPDATE producao_romaneio SET ${tx(cab)} WHERE id = ${id}`;
      if (substituirItens) {
        await tx`DELETE FROM producao_romaneio_item WHERE romaneio_id = ${id}`;
        for (const it of itens) {
          await tx`INSERT INTO producao_romaneio_item ${tx({ romaneio_id: id, ...it })}`;
        }
      }
    });

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('[romaneios/id][PATCH]', e);
    return NextResponse.json({ erro: 'Erro ao salvar o romaneio' }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    const user = await autenticar(req);
    if (user instanceof NextResponse) return user;
    if (!podeVerRomaneios(user))
      return NextResponse.json({ erro: 'Sem permissão' }, { status: 403 });

    const id = pegarId(req);
    if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ erro: 'ID inválido' }, { status: 400 });

    await sql`DELETE FROM producao_romaneio WHERE id = ${id}`;
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('[romaneios/id][DELETE]', e);
    return NextResponse.json({ erro: 'Erro ao excluir o romaneio' }, { status: 500 });
  }
}
