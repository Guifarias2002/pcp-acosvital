import { NextResponse } from 'next/server';
import sql from '@/lib/db';
import { autenticar } from '@/lib/middleware';
import { podePlanejarCaldeiraria, podeVerAnaliseCaldeiraria, podeVerValoresMes } from '@/lib/auth';
import { comIdempotencia, chaveIdempotencia } from '@/lib/idempotencia';
import { ordenarAreas, isoValida, UNIDADES_CALD, PRIORIDADES_CALD, CODIGOS_EMPRESA, lerValorBR } from '@/lib/caldPlano';
import { carregarItensCald, registrarHistCald } from '@/lib/caldPlanoServer';
import { runMigrations } from '@/lib/migrations';

export const dynamic = 'force-dynamic';

// Planejamento da Caldeiraria.
// GET  → todos os itens (ativos + finalizados do último ano) com as etapas.
//        Leitura também pra quem vê a Análise da Caldeiraria (inclui Alan/Val)
//        e o "Valores por Mês" (aba Caldeiraria).
// POST → LANÇA um pedido (1..N itens). Só quem planeja (o PCP de visualização só olha).
//        O item nasce "novo" (caixa "Aguardando planejamento" do coordenador).

export async function GET(req: Request) {
  const user = await autenticar(req);
  if (user instanceof NextResponse) return user;
  if (!podeVerAnaliseCaldeiraria(user) && !podeVerValoresMes(user)) return NextResponse.json({ erro: 'Sem permissao' }, { status: 403 });
  try {
    let itens;
    try {
      itens = await carregarItensCald();
    } catch (e) {
      // Tabela ainda não criada (instância subiu antes da M49) → migra e tenta 1x.
      if ((e as { code?: string })?.code !== '42P01') throw e;
      await runMigrations();
      itens = await carregarItensCald();
    }
    return NextResponse.json({ itens, pode_planejar: podePlanejarCaldeiraria(user) });
  } catch (e) {
    console.error('[cald-plano GET]', e);
    return NextResponse.json({ erro: 'Erro ao carregar o planejamento' }, { status: 500 });
  }
}

function txt(v: unknown, max = 300): string | null {
  const s = typeof v === 'string' ? v.trim() : typeof v === 'number' ? String(v) : '';
  return s ? s.slice(0, max) : null;
}
function num(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = typeof v === 'number' ? v : Number(String(v).replace(',', '.'));
  return Number.isFinite(n) && n >= 0 ? n : null;
}

export async function POST(req: Request) {
  const user = await autenticar(req);
  if (user instanceof NextResponse) return user;
  if (!podePlanejarCaldeiraria(user)) return NextResponse.json({ erro: 'Somente visualização — lançar é do PCP da Caldeiraria' }, { status: 403 });

  return comIdempotencia(chaveIdempotencia(req), { usuarioId: user.id, metodo: 'POST', caminho: '/api/cald-plano' }, async () => {
    let body: Record<string, unknown>;
    try { body = await req.json(); } catch { return NextResponse.json({ erro: 'JSON inválido' }, { status: 400 }); }

    const pedido = txt(body.pedido, 40);
    if (!pedido) return NextResponse.json({ erro: 'Informe o nº do pedido' }, { status: 400 });
    const vendedor = txt(body.vendedor, 80);
    const cliente = txt(body.cliente, 120);
    const prazo = isoValida(body.prazo_entrega);
    const prevFat = isoValida(body.prev_faturamento);
    const prevFin = isoValida(body.prev_finalizacao);
    const prioridade = PRIORIDADES_CALD.includes(body.prioridade as typeof PRIORIDADES_CALD[number]) ? String(body.prioridade) : 'normal';
    const obsPedido = txt(body.obs, 1000);
    const empresa = CODIGOS_EMPRESA.includes(String(body.empresa)) ? String(body.empresa) : null;
    if (!empresa) return NextResponse.json({ erro: 'Escolha a empresa do pedido (Aços Vital, Aços Uberaba ou Aços HRM)' }, { status: 400 });
    const itensIn = Array.isArray(body.itens) ? body.itens as Record<string, unknown>[] : [];
    const itens = itensIn
      .map(it => ({
        material: txt(it.material, 200),
        quantidade: num(it.quantidade),
        unidade: UNIDADES_CALD.includes(String(it.unidade)) ? String(it.unidade) : 'pç',
        valor: lerValorBR(it.valor),
        valor_unitario: lerValorBR(it.valor_unitario),
        areas: ordenarAreas(Array.isArray(it.areas) ? (it.areas as unknown[]).map(String) : []),
        obs: txt(it.obs, 1000),
      }))
      .filter(it => it.material);
    if (!itens.length) return NextResponse.json({ erro: 'Informe pelo menos um item (material)' }, { status: 400 });
    if (itens.length > 60) return NextResponse.json({ erro: 'Máximo de 60 itens por lançamento' }, { status: 400 });

    try {
      const ids = await sql.begin(async (tx) => {
        const criados: number[] = [];
        for (const it of itens) {
          const obs = [it.obs, obsPedido].filter(Boolean).join(' · ') || null;
          const [row] = await tx`
            INSERT INTO producao_cald_plano_item
              (pedido, vendedor, cliente, material, quantidade, unidade, valor, valor_unitario, empresa, areas, status, prioridade,
               prazo_entrega, prev_faturamento, prev_finalizacao, obs, criado_por_id, criado_por_nome)
            VALUES
              (${pedido}, ${vendedor}, ${cliente}, ${it.material}, ${it.quantidade}, ${it.unidade}, ${it.valor}, ${it.valor_unitario}, ${empresa},
               ${it.areas}::text[], 'novo', ${prioridade},
               ${prazo}, ${prevFat}, ${prevFin}, ${obs}, ${user.id}, ${user.nome || user.username})
            RETURNING id
          `;
          criados.push(row.id as number);
          await registrarHistCald(tx, row.id as number, 'lancado', `Lançado por ${user.nome || user.username}`, user.nome || user.username);
        }
        return criados;
      });
      return NextResponse.json({ ok: true, ids });
    } catch (e) {
      console.error('[cald-plano POST]', e);
      return NextResponse.json({ erro: 'Erro ao lançar o pedido' }, { status: 500 });
    }
  });
}
