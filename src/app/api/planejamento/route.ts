import { NextResponse } from 'next/server';
import sql from '@/lib/db';
import { autenticar } from '@/lib/middleware';
import { podePlanejar } from '@/lib/auth';
import { ORDEM_SETORES, NOMES } from '@/lib/types';
import { MAQUINAS_POR_SETOR } from '@/lib/maquinas';

export const dynamic = 'force-dynamic';

// Planejamento da Usinagem (ex.: Reginaldo). GET monta o painel único:
//  • fila: peças CHEGANDO na usinagem (num setor anterior do roteiro) + as que
//    JÁ ESTÃO na usinagem, agrupadas por pedido, com a máquina planejada;
//  • ordem: a fila manual dos pedidos (reaproveita producao_setor_ordem/usinagem);
//  • painel: o que está PRODUZINDO agora, por máquina (ao vivo);
//  • maquinas: a lista de máquinas da usinagem (pro seletor).
// POST grava a máquina planejada de uma peça (item). A ORDEM é gravada pelo
// endpoint que já existe: POST /api/setor/usinagem/ordem (só planejador/admin).

// Posição fixa da usinagem no roteiro-padrão — usada pra separar "chegando"
// (antes) de "na usinagem". Setor fora da lista (ex.: emissão) não tem posição.
const POS_USINAGEM = ORDEM_SETORES.indexOf('usinagem');

// Situação REAL na usinagem, derivada das parciais (prioridade: produzindo >
// na fila > não recebido > pausado > finalizado). null = sem parcial ativa lá.
function statusProducao(statusSet: string[]): 'produzindo' | 'recebido' | 'nao_recebido' | 'pausado' | 'finalizado' | null {
  const s = new Set(statusSet || []);
  if (s.has('em_andamento')) return 'produzindo';
  if (s.has('recebido')) return 'recebido';
  if (s.has('em_aberto')) return 'nao_recebido';
  if (s.has('pausado')) return 'pausado';
  if (s.has('finalizado_setor')) return 'finalizado';
  return null;
}

// Classifica a peça em relação à usinagem. null = já passou ou não se aplica.
function situacao(setorAtual: string, status: string): 'na_usinagem' | 'chegando' | null {
  if (setorAtual === 'usinagem') return 'na_usinagem';
  // Recém-emitida (ainda não entrou em produção) conta como "chegando".
  if (status === 'emitido') return 'chegando';
  const pos = ORDEM_SETORES.indexOf(setorAtual);
  if (pos !== -1 && POS_USINAGEM !== -1 && pos < POS_USINAGEM) return 'chegando';
  return null;
}

export async function GET(req: Request) {
  const user = await autenticar(req);
  if (user instanceof NextResponse) return user;
  if (!podePlanejar(user)) return NextResponse.json({ erro: 'Sem permissao' }, { status: 403 });

  try {
    // Peças cujo roteiro EFETIVO (próprio do item, ou o base do pedido) passa
    // pela usinagem e que ainda não a ultrapassaram. Ativas (não entregues,
    // não bloqueadas, não inativas).
    const itens = await sql`
      SELECT
        i.id AS item_id, i.codigo, i.descricao, i.quantidade::float AS quantidade,
        i.unidade, i.setor_atual, i.status, i.pedido_id,
        p.numero_pedido_venda, p.cliente, p.prioridade,
        p.prazo_entrega::text AS prazo,
        -- Prazo AUTOMÁTICO do Planejamento: data de lançamento (emissão, ou a
        -- criação como reserva) + 7 dias. É só do painel do Reginaldo — não mexe
        -- na previsão de conclusão do sistema (atraso do dashboard/setores).
        (COALESCE(p.data_emissao, p.criado_em::date) + 7)::text AS prazo_auto,
        i.previsao_conclusao::text AS item_previsao,
        p.previsao_conclusao::text AS pedido_previsao,
        (p.ordem_producao_url IS NOT NULL) AS tem_op,
        -- Situação REAL das parciais desta peça JÁ na usinagem (produzindo/na
        -- fila/não recebido) — pro Planejamento saber se iniciou/recebeu.
        ARRAY(
          SELECT DISTINCT pa.status FROM producao_itemparcial pa
          WHERE pa.item_pedido_id = i.id AND pa.setor_atual = 'usinagem'
            AND pa.status NOT IN ('cancelada', 'concluida', 'em_transito')
        ) AS status_usinagem,
        -- Máquina em que a peça JÁ está rodando (parcial em produção), se houver.
        (SELECT pa.maquina FROM producao_itemparcial pa
           WHERE pa.item_pedido_id = i.id AND pa.setor_atual = 'usinagem'
             AND pa.status = 'em_andamento' AND pa.maquina IS NOT NULL AND pa.maquina <> ''
           ORDER BY pa.iniciado_em DESC LIMIT 1) AS maquina_em_producao,
        pu.maquina AS maquina_planejada
      FROM producao_itempedido i
      JOIN producao_pedido p ON p.id = i.pedido_id
      LEFT JOIN producao_plano_usinagem pu ON pu.item_pedido_id = i.id
      WHERE i.status NOT IN ('entregue', 'bloqueado')
        AND COALESCE(i.inativo, false) = false
        AND 'usinagem' = ANY(
          CASE WHEN COALESCE(array_length(i.roteiro_proprio, 1), 0) > 0
               THEN i.roteiro_proprio ELSE p.roteiro_base END
        )
      ORDER BY p.numero_pedido_venda, i.codigo
    `;

    // Agrupa por pedido, mantendo só as peças "na usinagem" ou "chegando".
    const porPedido = new Map<number, {
      pedido_id: number; numero_pedido_venda: string; cliente: string;
      prioridade: string; prazo: string | null;
      previsao: string | null; tem_op: boolean; pecas: unknown[];
    }>();

    for (const it of itens) {
      const sit = situacao(it.setor_atual as string, it.status as string);
      if (!sit) continue;
      const sp = statusProducao(it.status_usinagem as string[]);
      // Peça FINALIZADA na usinagem some do Planejamento (produção concluída
      // no setor): só finalizado_setor entre as parciais, ou nenhuma parcial
      // ativa e o item já marcado como finalizado no setor.
      if (sit === 'na_usinagem' && (sp === 'finalizado' || (sp === null && it.status === 'finalizado_setor'))) continue;
      const pid = it.pedido_id as number;
      if (!porPedido.has(pid)) {
        porPedido.set(pid, {
          pedido_id: pid,
          numero_pedido_venda: it.numero_pedido_venda,
          cliente: it.cliente,
          prioridade: it.prioridade,
          prazo: it.prazo,
          // Prazo do Planejamento = lançamento + 7 dias corridos (automático).
          previsao: (it.prazo_auto as string) || null,
          tem_op: it.tem_op === true,
          pecas: [],
        });
      }
      const grupo = porPedido.get(pid)!;
      grupo.pecas.push({
        item_id: it.item_id,
        codigo: it.codigo,
        descricao: it.descricao,
        quantidade: it.quantidade,
        unidade: it.unidade,
        setor_atual: it.setor_atual,
        setor_atual_nome: NOMES[it.setor_atual as string] || it.setor_atual,
        status: it.status,
        situacao: sit,
        status_prod: sp,
        maquina_em_producao: (it.maquina_em_producao as string) || null,
        maquina_planejada: (it.maquina_planejada as string) || null,
        previsao: (it.item_previsao as string) || (it.pedido_previsao as string) || null,
      });
    }

    // Ordem manual salva da usinagem (mesma tabela do "furar a fila").
    const [ordemRow] = await sql`SELECT ordem FROM producao_setor_ordem WHERE setor = 'usinagem'`;
    const ordem = (ordemRow?.ordem as number[]) ?? [];

    // Ordena os pedidos: 1º a ordem MANUAL ("furar a fila"); depois, pedidos COM
    // data de CONCLUSÃO definida vêm primeiro, em SEQUÊNCIA por essa data; os SEM
    // data caem depois, por nº do pedido. (Mesma lógica da tela da Usinagem.)
    const pos = new Map(ordem.map((id, i) => [id, i]));
    const conclusaoMs = (v: string | null) => v ? new Date(v + 'T12:00:00').getTime() : Infinity;
    const pedidos = Array.from(porPedido.values()).sort((a, b) => {
      const pa = pos.has(a.pedido_id) ? pos.get(a.pedido_id)! : Infinity;
      const pb = pos.has(b.pedido_id) ? pos.get(b.pedido_id)! : Infinity;
      if (pa !== pb) return pa - pb;
      const ta = a.previsao ? 0 : 1, tb = b.previsao ? 0 : 1;
      if (ta !== tb) return ta - tb;                                  // definidos primeiro
      const ca = conclusaoMs(a.previsao), cb = conclusaoMs(b.previsao);
      if (ca !== cb) return ca - cb;                                  // sequência por data
      return String(a.numero_pedido_venda).localeCompare(String(b.numero_pedido_venda));
    });

    // Painel ao vivo: parciais produzindo AGORA na usinagem, por máquina.
    const ativas = await sql`
      SELECT
        pa.maquina, pa.operador, pa.quantidade::float AS quantidade, i.unidade,
        i.codigo AS item_codigo, i.descricao AS item_descricao,
        p.id AS pedido_id, p.numero_pedido_venda, p.cliente, p.prioridade,
        (p.ordem_producao_url IS NOT NULL) AS tem_op,
        COALESCE(pa.maquina_sessao_iniciada_em, pa.iniciado_em)::text AS desde
      FROM producao_itemparcial pa
      JOIN producao_itempedido i ON i.id = pa.item_pedido_id
      JOIN producao_pedido p ON p.id = i.pedido_id
      WHERE pa.setor_atual = 'usinagem' AND pa.status = 'em_andamento'
      ORDER BY pa.maquina, pa.iniciado_em
    `;

    // Monta o painel com TODAS as máquinas (mesmo as livres).
    const grupos = MAQUINAS_POR_SETOR.usinagem || [];
    const nomesMaquinas = grupos.flatMap(g => g.maquinas);
    const painelMap = new Map<string, unknown[]>();
    for (const m of nomesMaquinas) painelMap.set(m, []);
    const semMaquina: unknown[] = []; // produzindo mas sem máquina registrada
    for (const a of ativas) {
      const reg = {
        pedido_id: a.pedido_id, tem_op: a.tem_op === true,
        item_codigo: a.item_codigo, item_descricao: a.item_descricao,
        quantidade: a.quantidade, unidade: a.unidade,
        numero_pedido_venda: a.numero_pedido_venda, cliente: a.cliente,
        prioridade: a.prioridade, operador: a.operador, desde: a.desde,
      };
      const m = (a.maquina as string) || '';
      if (m && painelMap.has(m)) painelMap.get(m)!.push(reg);
      else if (m) { painelMap.set(m, [reg]); } // máquina fora da lista fixa
      else semMaquina.push(reg);
    }
    const painel = Array.from(painelMap.entries()).map(([maquina, pecas]) => ({ maquina, pecas }));

    return NextResponse.json({
      pedidos,
      ordem,
      painel,
      sem_maquina: semMaquina,
      maquinas: grupos,
    });
  } catch (e) {
    console.error('[planejamento GET]', e);
    return NextResponse.json({ erro: 'Erro ao carregar o planejamento' }, { status: 500 });
  }
}

// Grava (ou limpa) a máquina planejada de uma peça (item). maquina vazia/null
// remove o plano — volta a peça pro modo normal (operador escolhe a máquina).
export async function POST(req: Request) {
  const user = await autenticar(req);
  if (user instanceof NextResponse) return user;
  if (!podePlanejar(user)) return NextResponse.json({ erro: 'Sem permissao' }, { status: 403 });

  try {
    const body = await req.json().catch(() => ({}));
    const itemId = Number(body.item_pedido_id ?? body.item_id);
    if (!Number.isInteger(itemId) || itemId <= 0)
      return NextResponse.json({ erro: 'Item inválido' }, { status: 400 });
    const maquina = typeof body.maquina === 'string' ? body.maquina.trim().slice(0, 60) : '';

    // Valida que o item existe (evita lixo na tabela por FK, mas retorna erro claro).
    const [item] = await sql`SELECT id FROM producao_itempedido WHERE id = ${itemId}`;
    if (!item) return NextResponse.json({ erro: 'Item não encontrado' }, { status: 404 });

    if (!maquina) {
      // Limpa o plano da peça.
      await sql`DELETE FROM producao_plano_usinagem WHERE item_pedido_id = ${itemId}`;
      return NextResponse.json({ ok: true, item_pedido_id: itemId, maquina: null });
    }

    await sql`
      INSERT INTO producao_plano_usinagem (item_pedido_id, maquina, definido_por_id, atualizado_em)
      VALUES (${itemId}, ${maquina}, ${user.id}, NOW())
      ON CONFLICT (item_pedido_id)
      DO UPDATE SET maquina = EXCLUDED.maquina, definido_por_id = ${user.id}, atualizado_em = NOW()
    `;
    return NextResponse.json({ ok: true, item_pedido_id: itemId, maquina });
  } catch (e) {
    console.error('[planejamento POST]', e);
    return NextResponse.json({ erro: 'Erro ao salvar o plano' }, { status: 500 });
  }
}
