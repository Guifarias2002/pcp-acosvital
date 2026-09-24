import { NextResponse } from 'next/server';
import sql from '@/lib/db';
import { autenticar } from '@/lib/middleware';
import { podePlanejarCaldeiraria } from '@/lib/auth';
import { comIdempotencia, chaveIdempotencia } from '@/lib/idempotencia';
import { CODIGOS_AREA, ordenarAreas, isoValida, UNIDADES_CALD } from '@/lib/caldPlano';
import { registrarHistCald } from '@/lib/caldPlanoServer';

export const dynamic = 'force-dynamic';

// Importa a planilha antiga do coordenador. A LEITURA do .xlsx é feita no
// navegador (interpretarPlanilha em caldPlano.ts) e mostrada numa
// pré-visualização; aqui chegam as linhas já interpretadas e confirmadas.
// Linha repetida (mesmo pedido + material, não cancelada) é IGNORADA — dá pra
// importar a mesma planilha de novo sem duplicar.
export async function POST(req: Request) {
  const user = await autenticar(req);
  if (user instanceof NextResponse) return user;
  if (!podePlanejarCaldeiraria(user)) return NextResponse.json({ erro: 'Sem permissao' }, { status: 403 });

  return comIdempotencia(chaveIdempotencia(req), { usuarioId: user.id, metodo: 'POST', caminho: '/api/cald-plano/importar' }, async () => {
    let b: Record<string, unknown>;
    try { b = await req.json(); } catch { return NextResponse.json({ erro: 'JSON inválido' }, { status: 400 }); }
    const linhas = Array.isArray(b.linhas) ? (b.linhas as Record<string, unknown>[]).slice(0, 2000) : [];
    if (!linhas.length) return NextResponse.json({ erro: 'Nada para importar' }, { status: 400 });
    const quem = user.nome || user.username;
    const s = (v: unknown, max: number) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null);

    try {
      const r = await sql.begin(async (tx) => {
        let inseridos = 0, ignorados = 0;
        for (const l of linhas) {
          const pedido = s(l.pedido, 40), material = s(l.material, 200);
          if (!pedido || !material) { ignorados++; continue; }
          const [dup] = await tx`
            SELECT 1 FROM producao_cald_plano_item
            WHERE lower(pedido) = lower(${pedido}) AND lower(material) = lower(${material}) AND status <> 'cancelado'
            LIMIT 1
          `;
          if (dup) { ignorados++; continue; }
          const areas = ordenarAreas(Array.isArray(l.areas) ? (l.areas as unknown[]).map(String) : []);
          const areaAtual = CODIGOS_AREA.includes(String(l.area_atual)) ? String(l.area_atual) : null;
          const fin = isoValida(l.finalizado_em);
          const status = fin ? 'finalizado' : areaAtual ? 'andamento' : 'novo';
          const qtd = typeof l.quantidade === 'number' && Number.isFinite(l.quantidade) ? l.quantidade : null;
          const [row] = await tx`
            INSERT INTO producao_cald_plano_item
              (pedido, vendedor, cliente, material, quantidade, unidade, areas, area_atual, status,
               prev_faturamento, faturado_em, prev_finalizacao, finalizado_em, parcial, obs,
               criado_por_id, criado_por_nome)
            VALUES
              (${pedido}, ${s(l.vendedor, 80)}, ${s(l.cliente, 120)}, ${material}, ${qtd},
               ${UNIDADES_CALD.includes(String(l.unidade)) ? String(l.unidade) : 'pç'},
               ${areas}::text[], ${areaAtual}, ${status},
               ${isoValida(l.prev_faturamento)}, ${isoValida(l.faturado_em)}, ${isoValida(l.prev_finalizacao)}, ${fin},
               ${!!l.parcial}, ${s(l.obs, 1000)}, ${user.id}, ${quem})
            RETURNING id
          `;
          const itemId = row.id as number;
          for (const e of Array.isArray(l.etapas) ? l.etapas as Record<string, unknown>[] : []) {
            const area = String(e.area || '');
            if (!areas.includes(area)) continue;
            await tx`
              INSERT INTO producao_cald_plano_etapa (item_id, area, entrada, fornecedor)
              VALUES (${itemId}, ${area}, ${isoValida(e.entrada)}, ${s(e.fornecedor, 120)})
              ON CONFLICT (item_id, area) DO NOTHING
            `;
          }
          await registrarHistCald(tx, itemId, 'importado', 'Importado da planilha antiga', quem);
          inseridos++;
        }
        return { inseridos, ignorados };
      });
      return NextResponse.json({ ok: true, ...r });
    } catch (e) {
      console.error('[cald-plano/importar POST]', e);
      return NextResponse.json({ erro: 'Erro ao importar' }, { status: 500 });
    }
  });
}
