import { NextResponse } from 'next/server';
import sql from '@/lib/db';
import { autenticar } from '@/lib/middleware';
import { podeVerAnalise } from '@/lib/auth';
import { withTimeout } from '@/lib/queryTimeout';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// ── Diagnóstico executivo de PCP ─────────────────────────────────────────────
// Resumo calculado AO VIVO sobre o histórico inteiro (desde o 1º apontamento):
// produção média diária, tendência mês a mês, %WIP, gargalos por dwell time,
// ciclo MEDIANO por máquina (robusto ao cronômetro que não foi pausado) e
// alertas de qualidade de dado. Só quem pode ver a Análise PCP.
export async function GET(req: Request) {
  const user = await autenticar(req);
  if (user instanceof NextResponse) return user;
  if (!podeVerAnalise(user)) return NextResponse.json({ erro: 'Sem permissao' }, { status: 403 });

  try {
    const [rng, prodMes, diasMes, ritmoMes, wip, maquinas, gargalos, qualidade, capacidades, metaCfg, topProduto, maiorPedido, pedidoStats] = await withTimeout(Promise.all([
      // Intervalo + dias produzidos (datas distintas com apontamento)
      sql`SELECT MIN(iniciado_em)::date de, MAX(iniciado_em)::date ate,
                 count(DISTINCT iniciado_em::date)::int dias_produzidos
          FROM producao_itemparcial WHERE iniciado_em IS NOT NULL`,
      // Unidades ENTREGUES por mês (produção concluída real): 1 registro por item
      // na sua última movimentação de entrega; soma quantidade_entregue.
      sql`WITH ent AS (
            SELECT DISTINCT ON (m.item_id) m.item_id, m.criado_em::date d
            FROM producao_movimentacaoitem m WHERE m.status_novo='entregue'
            ORDER BY m.item_id, m.criado_em DESC)
          SELECT to_char(ent.d,'YYYY-MM') mes, count(*)::int itens,
                 SUM(i.quantidade_entregue)::float un
          FROM ent JOIN producao_itempedido i ON i.id=ent.item_id
          GROUP BY 1 ORDER BY 1`,
      // Dias produzidos por mês (denominador da média diária)
      sql`SELECT to_char(iniciado_em,'YYYY-MM') mes, count(DISTINCT iniciado_em::date)::int dias
          FROM producao_itemparcial WHERE iniciado_em IS NOT NULL GROUP BY 1 ORDER BY 1`,
      // Ritmo de chão: apontamentos iniciados por mês
      sql`SELECT to_char(iniciado_em,'YYYY-MM') mes, count(*)::int apontamentos
          FROM producao_itemparcial WHERE iniciado_em IS NOT NULL GROUP BY 1 ORDER BY 1`,
      // WIP: unidades em processo (item ainda não entregue) × entregues × total.
      // Status do ITEM (não da parcial): tudo que não é 'entregue' está em processo.
      sql`SELECT
            COALESCE(SUM(quantidade) FILTER (WHERE status <> 'entregue'),0)::float un_wip,
            COALESCE(SUM(quantidade) FILTER (WHERE status = 'entregue'),0)::float un_entregue,
            COALESCE(SUM(quantidade),0)::float un_total
          FROM producao_itempedido WHERE inativo=false`,
      // Máquinas: ciclo MEDIANO (h) — mediana ignora o timer estourado. Ordena
      // por nº de ciclos (mais usada primeiro).
      sql`SELECT maquina, count(*)::int ciclos,
            count(DISTINCT COALESCE(concluido_em::date, iniciado_em::date))::int dias_uso,
            MIN(COALESCE(iniciado_em, concluido_em))::date AS desde,
            ROUND((percentile_cont(0.5) WITHIN GROUP (ORDER BY maquina_segundos_acumulados)/3600.0)::numeric,2)::float ciclo_mediano_h,
            ROUND((SUM(maquina_segundos_acumulados)/3600.0)::numeric,1)::float horas_registradas
          FROM producao_itemparcial
          WHERE maquina IS NOT NULL AND maquina<>'' AND maquina_segundos_acumulados>0
          GROUP BY maquina ORDER BY ciclos DESC`,
      // Gargalos: dias parado por setor (entre chegar e sair). Média manda (a
      // cauda de peças que empacam é o gargalo); mediana junto pra contexto.
      sql`WITH mov AS (
            SELECT setor_destino setor, criado_em entrou,
                   LEAD(criado_em) OVER (PARTITION BY item_id ORDER BY criado_em) saiu
            FROM producao_movimentacaoitem WHERE setor_destino IS NOT NULL)
          SELECT setor, count(*)::int passagens,
            ROUND((AVG(EXTRACT(EPOCH FROM (saiu-entrou))/86400.0))::numeric,2)::float dias_medio,
            ROUND((percentile_cont(0.5) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM (saiu-entrou))/86400.0))::numeric,2)::float dias_mediana
          FROM mov WHERE saiu IS NOT NULL
          GROUP BY setor HAVING count(*)>=5 ORDER BY dias_medio DESC`,
      // Qualidade: % de registros de máquina com o cronômetro > tempo real (timer
      // não pausado). Sinaliza que as HORAS de máquina estão superestimadas.
      sql`SELECT
            count(*) FILTER (WHERE maquina IS NOT NULL AND maquina<>'' AND maquina_segundos_acumulados>0)::int com_tempo,
            count(*) FILTER (WHERE maquina_segundos_acumulados > EXTRACT(EPOCH FROM (concluido_em-iniciado_em))+120
                             AND concluido_em IS NOT NULL AND iniciado_em IS NOT NULL)::int timer_estourado
          FROM producao_itemparcial`,
      // Capacidade cadastrada por máquina (jornada) + meta de demanda mensal.
      // `.catch([])` — se a migration ainda não criou as tabelas, o diagnóstico
      // segue funcionando (só sem utilização/demanda) em vez de dar 500.
      sql`SELECT maquina, horas_dia::float horas_dia, dias_semana::int dias_semana FROM producao_maquina_capacidade`.catch(() => []),
      sql`SELECT valor FROM producao_config WHERE chave='meta_mensal_un'`.catch(() => []),
      // Produto que mais produziu (por PEÇAS entregues no histórico) — mesma
      // base "concluída de verdade" da produção por mês (última movimentação
      // de entrega do item × quantidade_entregue).
      sql`WITH ent AS (
            SELECT DISTINCT ON (m.item_id) m.item_id
            FROM producao_movimentacaoitem m WHERE m.status_novo='entregue'
            ORDER BY m.item_id, m.criado_em DESC)
          SELECT i.codigo, MAX(i.descricao) descricao,
                 SUM(i.quantidade_entregue)::float pecas, count(*)::int itens
          FROM ent JOIN producao_itempedido i ON i.id=ent.item_id
          WHERE i.codigo IS NOT NULL AND i.codigo<>''
          GROUP BY i.codigo ORDER BY pecas DESC NULLS LAST LIMIT 1`,
      // Maior pedido (por PEÇAS) entre os pedidos ativos.
      sql`SELECT p.numero_pedido_venda numero, p.cliente,
                 SUM(i.quantidade)::float pecas, count(*)::int itens
          FROM producao_itempedido i JOIN producao_pedido p ON p.id=i.pedido_id
          WHERE i.inativo=false
          GROUP BY p.id, p.numero_pedido_venda, p.cliente
          ORDER BY pecas DESC NULLS LAST LIMIT 1`,
      // Tamanho médio de um pedido (peças/pedido) — base pra estimar "quantos
      // pedidos a mais ainda cabem" a partir da folga de produção.
      sql`SELECT count(DISTINCT i.pedido_id)::int pedidos, SUM(i.quantidade)::float pecas
          FROM producao_itempedido i WHERE i.inativo=false`,
    ]), 55000);

    // Junta entregas + dias por mês → média diária por mês.
    const diasPorMes = new Map((diasMes as unknown as { mes: string; dias: number }[]).map(r => [r.mes, r.dias]));
    const producao = (prodMes as unknown as { mes: string; itens: number; un: number }[]).map(r => {
      const dias = diasPorMes.get(r.mes) || 0;
      return { mes: r.mes, un: r.un, itens: r.itens, dias, media_dia: dias > 0 ? r.un / dias : null };
    });
    // Crescimento da média diária entre os 2 últimos meses com >=10 dias
    // produzidos (ignora o mês corrente parcial, que enganaria a tendência).
    const completos = producao.filter(m => m.dias >= 10 && m.media_dia != null);
    let crescimento_dia_pct: number | null = null;
    if (completos.length >= 2) {
      const a = completos[completos.length - 2].media_dia as number;
      const b = completos[completos.length - 1].media_dia as number;
      if (a > 0) crescimento_dia_pct = ((b / a) - 1) * 100;
    }

    const ritmo = (ritmoMes as unknown as { mes: string; apontamentos: number }[]).map(r => ({
      mes: r.mes, apontamentos: r.apontamentos, dia: (diasPorMes.get(r.mes) || 0) > 0 ? r.apontamentos / (diasPorMes.get(r.mes) as number) : null,
    }));

    const w = (wip as unknown as { un_wip: number; un_entregue: number; un_total: number }[])[0];
    const pct_wip = w && w.un_total > 0 ? (w.un_wip / w.un_total) * 100 : null;

    const q = (qualidade as unknown as { com_tempo: number; timer_estourado: number }[])[0];
    const pct_timer_estourado = q && q.com_tempo > 0 ? (q.timer_estourado / q.com_tempo) * 100 : null;

    const maqRaw = maquinas as unknown as { maquina: string; ciclos: number; dias_uso: number; desde: string | Date | null; ciclo_mediano_h: number; horas_registradas: number }[];
    const capMap = new Map((capacidades as unknown as { maquina: string; horas_dia: number; dias_semana: number }[])
      .map(c => [c.maquina, c]));
    // Análise das máquinas começa DE QUANDO A MÁQUINA COMEÇOU A RODAR (1º
    // apontamento com tempo), não do início do sistema. Utilização = horas
    // registradas ÷ (horas/dia × DIAS ÚTEIS desde que a máquina começou até
    // hoje) — inclui os dias parados no período, que é a utilização real que o
    // PCP quer. Só quando a jornada foi cadastrada.
    const hojeIso = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
    const toIso = (v: string | Date | null): string | null =>
      !v ? null : (typeof v === 'string' ? v.slice(0, 10) : new Date(v).toISOString().slice(0, 10));
    const diasInclusivos = (de: string, ate: string) =>
      Math.max(1, Math.round((new Date(ate + 'T12:00:00').getTime() - new Date(de + 'T12:00:00').getTime()) / 86400000) + 1);
    const HORAS_JORNADA_MES = 220; // jornada mensal padrão (sem horas extras)
    const maqList = maqRaw.map(m => {
      const cap = capMap.get(m.maquina);
      const desdeIso = toIso(m.desde);
      const diasCorridos = desdeIso ? diasInclusivos(desdeIso, hojeIso) : null;
      const dias_uteis_periodo = (cap && diasCorridos != null) ? Math.max(1, Math.round(diasCorridos * (cap.dias_semana / 7))) : null;
      // Horas de jornada disponíveis no período: se a máquina tem jornada
      // cadastrada em Parâmetros, usa horas/dia × dias úteis; senão, a jornada
      // padrão de 220 h/mês (SEM horas extras), rateada pelos dias corridos desde
      // que a máquina começou a rodar. Horas trabalhadas acima da jornada aparecem
      // como utilização > 100% (indica hora extra), em vez de inflar o disponível.
      const horasJornadaPeriodo = (cap && cap.horas_dia > 0 && dias_uteis_periodo)
        ? cap.horas_dia * dias_uteis_periodo
        : (diasCorridos != null ? HORAS_JORNADA_MES * (diasCorridos / 30.436875) : null);
      const utilizacao_pct = (horasJornadaPeriodo && horasJornadaPeriodo > 0)
        ? (m.horas_registradas / horasJornadaPeriodo) * 100
        : null;
      return { ...m, desde: desdeIso, cadastrada: !!cap, capacidade_dia_h: cap ? cap.horas_dia : null, dias_uteis_periodo, utilizacao_pct };
    });
    // Quando as máquinas começaram a rodar (mais antiga) — janela da análise de máquina.
    const maq_desde = maqList.map(m => m.desde).filter(Boolean).sort()[0] || null;

    // ── Demanda × produção (unidades) ────────────────────────────────────────
    // Meta mensal (un) ÷ dias úteis do mês → necessidade diária. Compara com a
    // produção real diária (mês completo mais recente) → saldo e risco.
    const metaRaw = (metaCfg as unknown as { valor: string }[])[0]?.valor;
    const meta_mensal_un = metaRaw != null && metaRaw !== '' && Number.isFinite(Number(metaRaw)) ? Number(metaRaw) : null;
    // Dias úteis/mês: média de dias_semana das máquinas cadastradas × 4,345; cai
    // em 22 (padrão 5×~4,345≈22) quando não há jornada cadastrada.
    const capArr = Array.from(capMap.values());
    const diasSemanaMedio = capArr.length ? capArr.reduce((s, c) => s + c.dias_semana, 0) / capArr.length : 5;
    const dias_uteis_mes = Math.max(1, Math.round(diasSemanaMedio * 4.345));
    const completosProd = producao.filter(m => m.dias >= 10 && m.media_dia != null);
    const producao_dia_atual = completosProd.length ? (completosProd[completosProd.length - 1].media_dia as number) : null;
    const necessidade_dia = meta_mensal_un != null ? meta_mensal_un / dias_uteis_mes : null;
    const saldo_dia = (producao_dia_atual != null && necessidade_dia != null) ? producao_dia_atual - necessidade_dia : null;
    const risco_atraso = saldo_dia != null ? saldo_dia < 0 : null;

    // ── Ritmo de saída em peças: dia → semana → mês ──────────────────────────
    // Decompõe o ÚLTIMO MÊS COMPLETO de forma CONSISTENTE com a tabela "Produção
    // entregue por mês" e o KPI de produção média: mês = TOTAL REAL entregue no
    // mês (não uma projeção por dias úteis teóricos — senão dá diferente da
    // tabela logo abaixo, ex.: 1.074 × 1.172). Dia = média por dia produzido;
    // semana = mês ÷ nº de semanas do mês.
    const SEMANAS_NO_MES = 30.4 / 7; // ≈ 4,345
    const mesRef = completosProd.length ? completosProd[completosProd.length - 1] : null;
    const ritmoSaida = mesRef && mesRef.media_dia != null ? {
      dia: mesRef.media_dia,
      semana: mesRef.un / SEMANAS_NO_MES,
      mes: mesRef.un,
      dias_uteis_semana: mesRef.dias / SEMANAS_NO_MES, // dias produzidos por semana
      dias_uteis_mes: mesRef.dias,                     // dias efetivamente produzidos no mês
      mes_ref: mesRef.mes,
    } : null;

    // ── Recordes: quem mais produziu e o maior pedido (por peças) ────────────
    const topProd = (topProduto as unknown as { codigo: string; descricao: string; pecas: number; itens: number }[])[0] || null;
    const maiorPed = (maiorPedido as unknown as { numero: string; cliente: string; pecas: number; itens: number }[])[0] || null;

    // ── Folga: quantas peças/pedidos a mais ainda cabem ──────────────────────
    // Base = ritmo real. Folga/dia = produção diária − necessidade da meta
    // (saldo_dia). Só faz sentido quando há meta e a produção supera a meta
    // (saldo positivo). Converte a folga mensal em "quantos pedidos a mais"
    // pelo tamanho médio de um pedido.
    const ps = (pedidoStats as unknown as { pedidos: number; pecas: number }[])[0];
    const pecas_por_pedido = ps && ps.pedidos > 0 ? ps.pecas / ps.pedidos : null;
    const folga_dia = saldo_dia != null && saldo_dia > 0 ? saldo_dia : null;
    const folga_mes_pecas = folga_dia != null ? folga_dia * dias_uteis_mes : null;
    const folga_mes_pedidos = (folga_mes_pecas != null && pecas_por_pedido && pecas_por_pedido > 0)
      ? folga_mes_pecas / pecas_por_pedido : null;

    return NextResponse.json({
      periodo: (rng as unknown as { de: string; ate: string; dias_produzidos: number }[])[0],
      producao,
      crescimento_dia_pct,
      ritmo,
      wip: { ...w, pct_wip },
      maquina_lider: maqList[0] || null,
      maquinas: maqList,
      maq_desde,
      gargalos,
      qualidade: { com_tempo: q?.com_tempo ?? 0, timer_estourado: q?.timer_estourado ?? 0, pct_timer_estourado },
      // Bloco demanda × capacidade (só preenche o que a meta/jornada permitem).
      demanda: {
        meta_mensal_un, dias_uteis_mes, necessidade_dia, producao_dia_atual, saldo_dia, risco_atraso,
        tem_capacidade: capArr.length > 0,
      },
      // Ritmo de saída em peças (dia/semana/mês) — projeção do ritmo observado.
      ritmo_saida: ritmoSaida,
      // Recordes por peças.
      recordes: { top_produto: topProd, maior_pedido: maiorPed },
      // Folga: quanto ainda cabe além da meta (só quando há meta e sobra ritmo).
      folga: {
        pecas_por_pedido,
        folga_dia_pecas: folga_dia,
        folga_mes_pecas,
        folga_mes_pedidos,
      },
    });
  } catch (e) {
    console.error('[analise/diagnostico GET]', e);
    return NextResponse.json({ erro: 'Erro ao gerar o diagnóstico' }, { status: 500 });
  }
}
