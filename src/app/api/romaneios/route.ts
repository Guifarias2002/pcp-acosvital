/**
 * /api/romaneios — Romaneios de Carga (aba Logística).
 *
 *   GET  → lista os romaneios (cabeçalho + contagem de itens/conferidos).
 *   POST → cria um romaneio (cabeçalho + itens), gerando código ROM-##### novo.
 *
 * Acesso restrito por permissão (podeVerRomaneios): admin OU setor logística.
 */
import { NextResponse } from 'next/server';
import sql from '@/lib/db';
import { autenticar } from '@/lib/middleware';
import { podeVerRomaneios } from '@/lib/auth';

export const dynamic = 'force-dynamic';

// Normaliza uma linha de item vinda do cliente. Descrição é obrigatória.
type ItemIn = Record<string, unknown>;
function normalizaItens(itens: unknown): {
  ordem: number; pedido: string | null; descricao: string; categoria: string;
  finalidade: string; unidade: string | null; quantidade: number | null;
  conferido: boolean; item_pedido_id: number | null;
}[] {
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

export async function GET(req: Request) {
  try {
    const user = await autenticar(req);
    if (user instanceof NextResponse) return user;
    if (!podeVerRomaneios(user))
      return NextResponse.json({ erro: 'Sem permissão para ver os romaneios' }, { status: 403 });

    const romaneios = await sql`
      SELECT r.id, r.numero, r.codigo, r.origem, r.destino, r.data_carregamento,
             r.placa, r.motorista, r.status, r.criado_por_nome, r.criado_em, r.fechado_em,
             COUNT(ri.id)::int AS itens,
             COUNT(ri.id) FILTER (WHERE ri.conferido)::int AS conferidos,
             COALESCE(SUM(ri.quantidade), 0)::float AS pecas
      FROM producao_romaneio r
      LEFT JOIN producao_romaneio_item ri ON ri.romaneio_id = r.id
      GROUP BY r.id
      ORDER BY r.numero DESC
    `.catch(() => [] as Record<string, unknown>[]);

    return NextResponse.json({ romaneios, total: romaneios.length });
  } catch (e) {
    console.error('[romaneios][GET]', e);
    return NextResponse.json({ erro: 'Erro interno' }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const user = await autenticar(req);
    if (user instanceof NextResponse) return user;
    if (!podeVerRomaneios(user))
      return NextResponse.json({ erro: 'Sem permissão para criar romaneios' }, { status: 403 });

    const body = await req.json().catch(() => ({}));
    const itens = normalizaItens(body.itens);

    const cab = {
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

    const romaneio = await sql.begin(async (tx) => {
      // Numeração sequencial (índice único protege contra corrida).
      const [{ prox }] = await tx`SELECT COALESCE(MAX(numero), 0) + 1 AS prox FROM producao_romaneio`;
      const numero = Number(prox);
      const codigo = `ROM-${String(numero).padStart(5, '0')}`;
      const [r] = await tx`
        INSERT INTO producao_romaneio ${tx({
          numero, codigo, ...cab, status: 'aberto',
          criado_por: user.username, criado_por_nome: user.nome || user.username,
        })}
        RETURNING *`;
      for (const it of itens) {
        await tx`INSERT INTO producao_romaneio_item ${tx({ romaneio_id: r.id, ...it })}`;
      }
      return r;
    });

    return NextResponse.json({ ok: true, romaneio });
  } catch (e) {
    console.error('[romaneios][POST]', e);
    return NextResponse.json({ erro: 'Erro ao criar o romaneio' }, { status: 500 });
  }
}
