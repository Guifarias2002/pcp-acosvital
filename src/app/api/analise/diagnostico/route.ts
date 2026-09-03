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
    const [rng, prodMes, diasMes, ritmoMes, wip, maquinas, gargalos, qualidade] = await withTimeout(Promise.all([
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

    const maqList = maquinas as unknown as { maquina: string; ciclos: number; ciclo_mediano_h: number; horas_registradas: number }[];

    return NextResponse.json({
      periodo: (rng as unknown as { de: string; ate: string; dias_produzidos: number }[])[0],
      producao,
      crescimento_dia_pct,
      ritmo,
      wip: { ...w, pct_wip },
      maquina_lider: maqList[0] || null,
      maquinas: maqList,
      gargalos,
      qualidade: { com_tempo: q?.com_tempo ?? 0, timer_estourado: q?.timer_estourado ?? 0, pct_timer_estourado },
    });
  } catch (e) {
    console.error('[analise/diagnostico GET]', e);
    return NextResponse.json({ erro: 'Erro ao gerar o diagnóstico' }, { status: 500 });
  }
}
