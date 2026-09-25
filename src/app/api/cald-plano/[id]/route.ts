import { NextResponse } from 'next/server';
import sql from '@/lib/db';
import { autenticar } from '@/lib/middleware';
import { podeLancarCaldeiraria, podePlanejarCaldeiraria } from '@/lib/auth';
import { comIdempotencia, chaveIdempotencia } from '@/lib/idempotencia';
import {
  AREA_POR_CODIGO, CODIGOS_AREA, ordenarAreas, isoValida, hojeISO, fmtData,
  UNIDADES_CALD, PRIORIDADES_CALD, CODIGOS_EMPRESA, nomeEmpresa, lerValorBR, type EtapaCald,
  SUBSETORES_VERIFICAR_ALAN, nomeSubsetor, subsetorValido,
} from '@/lib/caldPlano';
import { carregarItensCald, registrarHistCald } from '@/lib/caldPlanoServer';

export const dynamic = 'force-dynamic';

// Um item do Planejamento da Caldeiraria.
// GET   → item + histórico.
// PATCH → edita. Dados do pedido (nº, vendedor, cliente, material, qtd, valor,
//         prazos, obs) = quem lança OU planeja. Roteiro/etapas/prioridade/
//         previsão de finalização = só o planejador (o lançador mexe no roteiro
//         só enquanto o item é "novo", antes de planejado).
// POST  → ação do planejador: mover | aguardando | finalizar | reabrir |
//         faturar | cancelar (cancelar também pode quem lançou).

type Ctx = { params: { id: string } };

function idDe(ctx: Ctx): number | null {
  const n = Number(ctx.params.id);
  return Number.isInteger(n) && n > 0 ? n : null;
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
const nomeArea = (c: string | null) => (c ? AREA_POR_CODIGO[c]?.nome ?? c : '—');

// Grava o sub-setor (setor HRM dentro da área geral) e, se for um setor "mais a
// fundo" (SUBSETORES_VERIFICAR_ALAN) ou vier observação, abre um RECADO pro
// Alan. Tudo em SAVEPOINT: se a M56 ainda não rodou, o encaminhamento da área
// continua valendo e só o sub-setor/recado fica de fora. Devolve o texto pro
// histórico ('' = nada gravado).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function aplicarSubsetor(tx: any, id: number, area: string, subRaw: unknown, obsRaw: unknown, quem: string): Promise<string> {
  const sub = subsetorValido(area, String(subRaw || '')) ? String(subRaw) : null;
  const obs = txt(obsRaw, 1000);
  const partes: string[] = [];
  try {
    await tx.savepoint(async (sp: typeof tx) => {
      await sp`UPDATE producao_cald_plano_item SET sub_setor = ${sub} WHERE id = ${id}`;
    });
    if (sub) partes.push(`setor ${nomeSubsetor(sub)}`);
  } catch (e) { console.error('[cald-plano] sub_setor (M56?)', e); }
  if ((sub && SUBSETORES_VERIFICAR_ALAN.has(sub)) || obs) {
    try {
      await tx.savepoint(async (sp: typeof tx) => {
        await sp`
          INSERT INTO producao_cald_plano_recado (item_id, area, sub_setor, mensagem, criado_por_nome)
          VALUES (${id}, ${area}, ${sub}, ${obs}, ${quem})
        `;
      });
      partes.push(`recado pro Alan${obs ? `: ${obs}` : ''}`);
    } catch (e) { console.error('[cald-plano] recado (M56?)', e); }
  }
  return partes.join(' · ');
}

export async function GET(req: Request, ctx: Ctx) {
  const user = await autenticar(req);
  if (user instanceof NextResponse) return user;
  if (!podeLancarCaldeiraria(user)) return NextResponse.json({ erro: 'Sem permissao' }, { status: 403 });
  const id = idDe(ctx);
  if (!id) return NextResponse.json({ erro: 'Item inválido' }, { status: 400 });
  try {
    const [item] = await carregarItensCald(sql, [id]);
    if (!item) return NextResponse.json({ erro: 'Item não encontrado' }, { status: 404 });
    const hist = await sql`
      SELECT id, acao, detalhe, usuario_nome, criado_em
      FROM producao_cald_plano_hist WHERE item_id = ${id}
      ORDER BY criado_em DESC, id DESC LIMIT 200
    `;
    return NextResponse.json({ item, historico: hist });
  } catch (e) {
    console.error('[cald-plano/:id GET]', e);
    return NextResponse.json({ erro: 'Erro ao carregar o item' }, { status: 500 });
  }
}

// Área atual = a de ENTRADA mais recente (empate → a mais adiante no roteiro).
function areaPelaUltimaEntrada(areas: string[], etapas: { area: string; entrada: string | null }[]): string | null {
  let atual: string | null = null, maior = '';
  for (const a of areas) {
    const e = etapas.find(x => x.area === a);
    if (e?.entrada && e.entrada >= maior) { maior = e.entrada; atual = a; }
  }
  return atual;
}

export async function PATCH(req: Request, ctx: Ctx) {
  const user = await autenticar(req);
  if (user instanceof NextResponse) return user;
  // Alterar é só de quem planeja (PCP de visualização só olha — decisão 24/09).
  if (!podePlanejarCaldeiraria(user)) return NextResponse.json({ erro: 'Somente visualização' }, { status: 403 });
  const planeja = podePlanejarCaldeiraria(user);
  const id = idDe(ctx);
  if (!id) return NextResponse.json({ erro: 'Item inválido' }, { status: 400 });
  let b: Record<string, unknown>;
  try { b = await req.json(); } catch { return NextResponse.json({ erro: 'JSON inválido' }, { status: 400 }); }
  const quem = user.nome || user.username;

  try {
    const res = await sql.begin(async (tx) => {
      const [atual] = await carregarItensCald(tx, [id]);
      if (!atual) return { status: 404, erro: 'Item não encontrado' };
      const mud: string[] = [];
      const set: Record<string, unknown> = {};
      const campoTxt = (k: string, max: number, rot: string) => {
        if (!(k in b)) return;
        const v = txt(b[k], max);
        if (k === 'pedido' || k === 'material') { if (!v) return; }
        if (v !== (atual as unknown as Record<string, unknown>)[k]) { set[k] = v; mud.push(`${rot}: ${v ?? '—'}`); }
      };
      const campoData = (k: string, rot: string, soPlaneja = false) => {
        if (!(k in b) || (soPlaneja && !planeja)) return;
        const v = b[k] === null || b[k] === '' ? null : isoValida(b[k]);
        if (b[k] && !v) return;
        if (v !== (atual as unknown as Record<string, unknown>)[k]) { set[k] = v; mud.push(`${rot}: ${v ? fmtData(v) : '—'}`); }
      };
      campoTxt('pedido', 40, 'Pedido');
      campoTxt('vendedor', 80, 'Vendedor');
      campoTxt('cliente', 120, 'Cliente');
      campoTxt('material', 200, 'Material');
      campoTxt('obs', 1000, 'Obs');
      if ('quantidade' in b) { const v = num(b.quantidade); if (v !== atual.quantidade) { set.quantidade = v; mud.push(`Qtd: ${v ?? '—'}`); } }
      if ('unidade' in b && UNIDADES_CALD.includes(String(b.unidade)) && b.unidade !== atual.unidade) { set.unidade = String(b.unidade); mud.push(`Unidade: ${b.unidade}`); }
      if ('valor_unitario' in b) {
        const v = lerValorBR(b.valor_unitario);
        if (v !== atual.valor_unitario) { set.valor_unitario = v; mud.push(`Valor unitário: ${v === null ? '—' : v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}`); }
      }
      if ('valor' in b) { const v = lerValorBR(b.valor); if (v !== atual.valor) { set.valor = v; mud.push(`Valor total: ${v === null ? '—' : v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}`); } }
      if ('empresa' in b && CODIGOS_EMPRESA.includes(String(b.empresa)) && b.empresa !== atual.empresa) {
        set.empresa = String(b.empresa); mud.push(`Empresa: ${nomeEmpresa(String(b.empresa))}`);
      }
      if ('parcial' in b && !!b.parcial !== atual.parcial) { set.parcial = !!b.parcial; mud.push(b.parcial ? 'Marcado PARCIAL' : 'Desmarcado parcial'); }
      campoData('prazo_entrega', 'Prazo de entrega');
      campoData('prev_faturamento', 'Prev. faturamento');
      campoData('faturado_em', 'Faturado em');
      campoData('prev_finalizacao', 'Prev. finalização', true);
      campoData('finalizado_em', 'Finalizado em', true);
      if ('prioridade' in b && planeja && PRIORIDADES_CALD.includes(b.prioridade as typeof PRIORIDADES_CALD[number]) && b.prioridade !== atual.prioridade) {
        set.prioridade = b.prioridade; mud.push(`Prioridade: ${b.prioridade}`);
      }

      let areas = atual.areas;
      if ('areas' in b && Array.isArray(b.areas) && (planeja || atual.status === 'novo')) {
        const nov = ordenarAreas((b.areas as unknown[]).map(String));
        if (nov.join(',') !== atual.areas.join(',')) {
          areas = nov; set.areas = nov;
          mud.push(`Roteiro: ${nov.map(nomeArea).join(' → ') || '—'}`);
        }
      }

      // Etapas (datas de entrada / previsões / terceiro) — só o planejador.
      let etapasMudaram = false;
      let maiorEntradaNova = '';  // maior data de entrada gravada/alterada agora
      if ('etapas' in b && Array.isArray(b.etapas) && planeja) {
        for (const raw of b.etapas as Record<string, unknown>[]) {
          const area = String(raw.area || '');
          if (!CODIGOS_AREA.includes(area)) continue;
          const ant = atual.etapas.find(e => e.area === area);
          const nova: EtapaCald = {
            area,
            entrada: raw.entrada ? isoValida(raw.entrada) : null,
            previsao: raw.previsao ? isoValida(raw.previsao) : null,
            fornecedor: txt(raw.fornecedor, 120),
            retorno_previsto: raw.retorno_previsto ? isoValida(raw.retorno_previsto) : null,
          };
          const igual = ant && ant.entrada === nova.entrada && ant.previsao === nova.previsao
            && (ant.fornecedor || null) === nova.fornecedor && ant.retorno_previsto === nova.retorno_previsto;
          if (igual || (!ant && !nova.entrada && !nova.previsao && !nova.fornecedor && !nova.retorno_previsto)) continue;
          etapasMudaram = true;
          if (nova.entrada && nova.entrada !== (ant?.entrada ?? null) && nova.entrada > maiorEntradaNova) maiorEntradaNova = nova.entrada;
          await tx`
            INSERT INTO producao_cald_plano_etapa (item_id, area, entrada, previsao, fornecedor, retorno_previsto)
            VALUES (${id}, ${area}, ${nova.entrada}, ${nova.previsao}, ${nova.fornecedor}, ${nova.retorno_previsto})
            ON CONFLICT (item_id, area) DO UPDATE SET
              entrada = EXCLUDED.entrada, previsao = EXCLUDED.previsao,
              fornecedor = EXCLUDED.fornecedor, retorno_previsto = EXCLUDED.retorno_previsto
          `;
          const partes: string[] = [];
          if ((ant?.entrada ?? null) !== nova.entrada) partes.push(`entrada ${nova.entrada ? fmtData(nova.entrada) : '—'}`);
          if ((ant?.previsao ?? null) !== nova.previsao) partes.push(`previsão ${nova.previsao ? fmtData(nova.previsao) : '—'}`);
          if ((ant?.fornecedor ?? null) !== nova.fornecedor) partes.push(`fornecedor ${nova.fornecedor ?? '—'}`);
          if ((ant?.retorno_previsto ?? null) !== nova.retorno_previsto) partes.push(`retorno ${nova.retorno_previsto ? fmtData(nova.retorno_previsto) : '—'}`);
          mud.push(`${nomeArea(area)}: ${partes.join(', ')}`);
        }
      }

      // Editou datas de entrada/roteiro de um item em produção → recalcula a
      // área atual pela entrada mais recente (mesma regra da importação).
      // Item FINALIZADO que ganhou entrada de área nova (no dia da finalização ou
      // depois) → volta pra produção. Antes ficava "finalizado" e sumia do painel
      // (pedido 27427, 25/09: Finalizar clicado por engano e depois a entrada na
      // Solda editada no detalhe).
      if (atual.status === 'finalizado' && maiorEntradaNova && (!atual.finalizado_em || maiorEntradaNova >= atual.finalizado_em)) {
        const ets = await tx`SELECT area, entrada::text AS entrada FROM producao_cald_plano_etapa WHERE item_id = ${id}`;
        const nova = areaPelaUltimaEntrada(areas, ets as unknown as { area: string; entrada: string | null }[]);
        set.area_atual = nova;
        set.status = nova ? 'andamento' : 'aguardando';
        set.finalizado_em = null;
        mud.push(`Reaberto (nova entrada em ${nomeArea(nova)} depois de finalizado)`);
      } else if ((etapasMudaram || set.areas) && (atual.status === 'andamento' || atual.status === 'aguardando')) {
        const ets = await tx`SELECT area, entrada::text AS entrada FROM producao_cald_plano_etapa WHERE item_id = ${id}`;
        const nova = areaPelaUltimaEntrada(areas, ets as unknown as { area: string; entrada: string | null }[]);
        if (nova !== atual.area_atual) {
          set.area_atual = nova;
          set.status = nova ? 'andamento' : 'aguardando';
        }
      }

      if (!mud.length && !Object.keys(set).length) return { status: 200, ok: true };
      if (Object.keys(set).length) {
        await tx`UPDATE producao_cald_plano_item SET ${tx(set)}, atualizado_em = NOW() WHERE id = ${id}`;
      }
      await registrarHistCald(tx, id, 'editado', mud.join(' · ') || null, quem);
      return { status: 200, ok: true };
    });
    if (res.status !== 200) return NextResponse.json({ erro: res.erro }, { status: res.status });
    const [item] = await carregarItensCald(sql, [id]);
    return NextResponse.json({ ok: true, item });
  } catch (e) {
    console.error('[cald-plano/:id PATCH]', e);
    return NextResponse.json({ erro: 'Erro ao salvar' }, { status: 500 });
  }
}

export async function POST(req: Request, ctx: Ctx) {
  const user = await autenticar(req);
  if (user instanceof NextResponse) return user;
  if (!podeLancarCaldeiraria(user)) return NextResponse.json({ erro: 'Sem permissao' }, { status: 403 });
  const id = idDe(ctx);
  if (!id) return NextResponse.json({ erro: 'Item inválido' }, { status: 400 });

  return comIdempotencia(chaveIdempotencia(req), { usuarioId: user.id, metodo: 'POST', caminho: `cald-plano/${id}` }, async () => {
    let b: Record<string, unknown>;
    try { b = await req.json(); } catch { return NextResponse.json({ erro: 'JSON inválido' }, { status: 400 }); }
    const acao = String(b.acao || '');
    const planeja = podePlanejarCaldeiraria(user);
    if (!planeja) return NextResponse.json({ erro: 'Só o planejamento da Caldeiraria pode fazer isso' }, { status: 403 });
    const data = b.data ? isoValida(b.data) : hojeISO();
    if (!data) return NextResponse.json({ erro: 'Data inválida' }, { status: 400 });
    const quem = user.nome || user.username;

    try {
      const res = await sql.begin(async (tx) => {
        const [it] = await carregarItensCald(tx, [id]);
        if (!it) return { status: 404, erro: 'Item não encontrado' };

        if (acao === 'mover') {
          const area = String(b.area || '');
          if (!CODIGOS_AREA.includes(area)) return { status: 400, erro: 'Área inválida' };
          const areas = it.areas.includes(area) ? it.areas : ordenarAreas([...it.areas, area]);
          const [{ prox }] = await tx`
            SELECT COALESCE(MAX(ordem), 0) + 1 AS prox FROM producao_cald_plano_item
            WHERE area_atual = ${area} AND status = 'andamento'
          `;
          await tx`
            INSERT INTO producao_cald_plano_etapa (item_id, area, entrada) VALUES (${id}, ${area}, ${data})
            ON CONFLICT (item_id, area) DO UPDATE SET entrada = EXCLUDED.entrada
          `;
          await tx`
            UPDATE producao_cald_plano_item
            SET area_atual = ${area}, status = 'andamento', areas = ${areas}::text[], ordem = ${prox},
                finalizado_em = NULL, atualizado_em = NOW()
            WHERE id = ${id}
          `;
          const extra = await aplicarSubsetor(tx, id, area, b.sub_setor, b.obs, quem);
          await registrarHistCald(tx, id, 'mover', `${nomeArea(it.area_atual)} → ${nomeArea(area)} (entrada ${fmtData(data)})${extra ? ` · ${extra}` : ''}`, quem);
        } else if (acao === 'subsetor') {
          // Troca o sub-setor dentro da área ATUAL (sem nova entrada de área).
          if (it.status !== 'andamento' || !it.area_atual) return { status: 400, erro: 'O item não está em nenhuma área' };
          const extra = await aplicarSubsetor(tx, id, it.area_atual, b.sub_setor, b.obs, quem);
          await tx`UPDATE producao_cald_plano_item SET atualizado_em = NOW() WHERE id = ${id}`;
          await registrarHistCald(tx, id, 'subsetor', `${nomeArea(it.area_atual)}: ${extra || 'só a área geral'}`, quem);
        } else if (acao === 'aguardando') {
          await tx`UPDATE producao_cald_plano_item SET status = 'aguardando', area_atual = NULL, atualizado_em = NOW() WHERE id = ${id}`;
          await registrarHistCald(tx, id, 'aguardando', 'Planejado — aguardando chegar na Caldeiraria', quem);
        } else if (acao === 'finalizar') {
          await tx`UPDATE producao_cald_plano_item SET status = 'finalizado', finalizado_em = ${data}, atualizado_em = NOW() WHERE id = ${id}`;
          await registrarHistCald(tx, id, 'finalizar', `Finalizado em ${fmtData(data)}`, quem);
        } else if (acao === 'reabrir') {
          const st = it.area_atual ? 'andamento' : 'aguardando';
          await tx`UPDATE producao_cald_plano_item SET status = ${st}, finalizado_em = NULL, atualizado_em = NOW() WHERE id = ${id}`;
          await registrarHistCald(tx, id, 'reabrir', `Reaberto (${it.status} → ${st})`, quem);
        } else if (acao === 'faturar') {
          await tx`UPDATE producao_cald_plano_item SET faturado_em = ${data}, atualizado_em = NOW() WHERE id = ${id}`;
          await registrarHistCald(tx, id, 'faturar', `Faturado em ${fmtData(data)}`, quem);
        } else if (acao === 'cancelar') {
          // Quem lançou só cancela enquanto ninguém planejou (item "novo").
          if (!planeja && it.status !== 'novo') return { status: 403, erro: 'Item já planejado — peça ao planejamento pra cancelar' };
          await tx`UPDATE producao_cald_plano_item SET status = 'cancelado', atualizado_em = NOW() WHERE id = ${id}`;
          await registrarHistCald(tx, id, 'cancelar', txt(b.motivo, 300) ? `Cancelado: ${txt(b.motivo, 300)}` : 'Cancelado', quem);
        } else if (acao === 'cobrar') {
          // Caixa de pendências: registra quem foi cobrado, o quê e quando deve
          // responder. Sem nova data de retorno → fica pendente como antes.
          const quemCob = txt(b.quem, 120);
          const msg = txt(b.mensagem, 1000);
          if (!quemCob && !msg) return { status: 400, erro: 'Informe quem foi cobrado ou a mensagem' };
          const retorno = b.retorno ? isoValida(b.retorno) : null;
          await tx`
            INSERT INTO producao_cald_plano_cobranca (item_id, quem, mensagem, retorno, criado_por_nome)
            VALUES (${id}, ${quemCob}, ${msg}, ${retorno}, ${quem})
          `;
          await tx`UPDATE producao_cald_plano_item SET atualizado_em = NOW() WHERE id = ${id}`;
          await registrarHistCald(tx, id, 'cobrar', `Cobrado${quemCob ? ` ${quemCob}` : ''}${msg ? `: ${msg}` : ''}${retorno ? ` · retorno até ${fmtData(retorno)}` : ''}`, quem);
        } else if (acao === 'restaurar') {
          if (it.status !== 'cancelado') return { status: 400, erro: 'Item não está cancelado' };
          const st = it.finalizado_em ? 'finalizado' : it.area_atual ? 'andamento' : 'novo';
          await tx`UPDATE producao_cald_plano_item SET status = ${st}, atualizado_em = NOW() WHERE id = ${id}`;
          await registrarHistCald(tx, id, 'restaurar', 'Restaurado', quem);
        } else {
          return { status: 400, erro: 'Ação inválida' };
        }
        return { status: 200 };
      });
      if (res.status !== 200) return NextResponse.json({ erro: res.erro }, { status: res.status });
      const [item] = await carregarItensCald(sql, [id]);
      return NextResponse.json({ ok: true, item });
    } catch (e) {
      console.error('[cald-plano/:id POST]', e);
      return NextResponse.json({ erro: 'Erro ao executar a ação' }, { status: 500 });
    }
  });
}
