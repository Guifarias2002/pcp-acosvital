import { NextResponse } from 'next/server';
import sql from '@/lib/db';
import { autenticar } from '@/lib/middleware';
import { podeVerAnalise } from '@/lib/auth';
import { withTimeout } from '@/lib/queryTimeout';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// ── Capacidade & compromisso (Flanges) ───────────────────────────────────────
// Responde, com dado real: quanto a fábrica ENTREGA (ritmo real do último mês
// completo), quanto JÁ está comprometido (fila/backlog = itens ainda não
// entregues) e, com isso, quanto ainda dá pra ACEITAR e entregar com certeza —
// sem furar fila por urgência. Quebrado por TIPO DE FLANGE e por MÁQUINA, como
// dois catálogos. Só quem pode ver a Análise PCP.
const HORAS_JORNADA_MES = 220; // jornada mensal padrão (sem horas extras)
const DIAS_MES = 30.436875;
const SEMANAS_MES = DIAS_MES / 7; // ≈ 4,345

// Mesma classificação de tipo do "Mix por tipo" do /api/analise.
const TIPO_CASE = sql`CASE
  WHEN descricao ILIKE '%CEGO%' THEN 'Cego'
  WHEN descricao ILIKE '%SOBREPOSTO%' THEN 'Sobreposto'
  WHEN descricao ILIKE '%SOLTO%' OR descricao ILIKE '%PEAD%' THEN 'Solto p/ PEAD'
  WHEN descricao ILIKE '%PESTANA%' THEN 'Pestana'
  WHEN descricao ILIKE '%ANEL%' THEN 'Anel'
  WHEN descricao ILIKE '%DISCO%' THEN 'Disco'
  WHEN descricao ILIKE '%LISO%' THEN 'Liso'
  WHEN descricao ILIKE '%FLANGE%' THEN 'Outro flange'
  ELSE 'Não classificado' END`;

export async function GET(req: Request) {
  const user = await autenticar(req);
  if (user instanceof NextResponse) return user;
  if (!podeVerAnalise(user)) return NextResponse.json({ erro: 'Sem permissao' }, { status: 403 });

  try {
    const FLANGE = sql`COALESCE(i.fabrica,'flange') = 'flange' AND i.inativo IS NOT TRUE`;
    const [delivMes, diasMes, delivTipoMes, backlogTipo, backlogTotal, maqHoras, pedStats] =
      await withTimeout(Promise.all([
        // Peças ENTREGUES por mês (produção concluída real) — última entrega do item.
        sql`WITH ent AS (
              SELECT DISTINCT ON (m.item_id) m.item_id, m.criado_em::date d
              FROM producao_movimentacaoitem m WHERE m.status_novo='entregue'
              ORDER BY m.item_id, m.criado_em DESC)
            SELECT to_char(ent.d,'YYYY-MM') mes, SUM(i.quantidade_entregue)::float pecas
            FROM ent JOIN producao_itempedido i ON i.id=ent.item_id
            WHERE ${FLANGE}
            GROUP BY 1 ORDER BY 1`,
        // Dias produzidos por mês (denominador da média diária).
        sql`SELECT to_char(ip.iniciado_em,'YYYY-MM') mes, count(DISTINCT ip.iniciado_em::date)::int dias
            FROM producao_itemparcial ip JOIN producao_itempedido i ON i.id=ip.item_pedido_id
            WHERE ${FLANGE} AND ip.iniciado_em IS NOT NULL GROUP BY 1`,
        // Peças entregues por TIPO e por mês → ritmo por tipo (pega o último mês em JS).
        sql`WITH ent AS (
              SELECT DISTINCT ON (m.item_id) m.item_id, m.criado_em::date d
              FROM producao_movimentacaoitem m WHERE m.status_novo='entregue'
              ORDER BY m.item_id, m.criado_em DESC)
            SELECT to_char(ent.d,'YYYY-MM') mes, ${TIPO_CASE} tipo, SUM(i.quantidade_entregue)::float pecas
            FROM ent JOIN producao_itempedido i ON i.id=ent.item_id
            WHERE ${FLANGE}
            GROUP BY 1,2`,
        // Fila (backlog) por TIPO — itens ainda NÃO entregues (comprometidos).
        sql`SELECT ${TIPO_CASE} tipo,
                   COALESCE(SUM(quantidade),0)::float pecas,
                   COUNT(DISTINCT pedido_id)::int pedidos
            FROM producao_itempedido i WHERE ${FLANGE} AND status <> 'entregue'
            GROUP BY 1 ORDER BY 2 DESC`,
        // Fila total.
        sql`SELECT COALESCE(SUM(quantidade),0)::float pecas, COUNT(DISTINCT pedido_id)::int pedidos
            FROM producao_itempedido i WHERE ${FLANGE} AND status <> 'entregue'`,
        // Horas de máquina acumuladas + desde quando roda (pra média mensal).
        sql`SELECT ip.maquina, ROUND((SUM(ip.maquina_segundos_acumulados)/3600.0)::numeric,1)::float horas,
                   MIN(COALESCE(ip.iniciado_em, ip.concluido_em))::date desde
            FROM producao_itemparcial ip JOIN producao_itempedido i ON i.id=ip.item_pedido_id
            WHERE ${FLANGE} AND ip.maquina IS NOT NULL AND ip.maquina<>'' AND ip.maquina_segundos_acumulados>0
            GROUP BY ip.maquina ORDER BY horas DESC`,
        // Tamanho médio de um pedido (peças/pedido) — pra estimar "quantos pedidos".
        sql`SELECT COUNT(DISTINCT pedido_id)::int pedidos, COALESCE(SUM(quantidade),0)::float pecas
            FROM producao_itempedido i WHERE ${FLANGE}`,
      ]), 55000);

    // Ritmo real = último mês COMPLETO (>=10 dias produzidos).
    const diasPorMes = new Map((diasMes as unknown as {mes: string; dias: number }[]).map(r => [r.mes, r.dias]));
    const meses = (delivMes as unknown as {mes: string; pecas: number }[])
      .map(r => ({ mes: r.mes, pecas: r.pecas, dias: diasPorMes.get(r.mes) || 0 }))
      .filter(m => m.dias >= 10);
    const ref = meses.length ? meses[meses.length - 1] : null;
    const R_mes = ref ? ref.pecas : null;
    const R_dia = ref && ref.dias > 0 ? ref.pecas / ref.dias : null;
    const R_semana = R_mes != null ? R_mes / SEMANAS_MES : null;

    const bt = (backlogTotal as unknown as {pecas: number; pedidos: number }[])[0] || { pecas: 0, pedidos: 0 };
    const meses_fila = R_mes && R_mes > 0 ? bt.pecas / R_mes : null;
    const dias_para_comecar = R_dia && R_dia > 0 ? bt.pecas / R_dia : null;
    // Folga do próximo mês: o que a fábrica entrega num mês menos o já comprometido.
    const folga_mes_pecas = R_mes != null ? Math.max(0, R_mes - bt.pecas) : null;
    const ps = (pedStats as unknown as {pedidos: number; pecas: number }[])[0];
    const pecas_por_pedido = ps && ps.pedidos > 0 ? ps.pecas / ps.pedidos : null;
    const folga_mes_pedidos = folga_mes_pecas != null && pecas_por_pedido && pecas_por_pedido > 0
      ? folga_mes_pecas / pecas_por_pedido : null;

    // Ritmo por tipo (último mês completo) × fila por tipo.
    const ritmoTipoRef = new Map<string, number>();
    if (ref) {
      for (const r of (delivTipoMes as unknown as {mes: string; tipo: string; pecas: number }[])) {
        if (r.mes === ref.mes) ritmoTipoRef.set(r.tipo, (ritmoTipoRef.get(r.tipo) || 0) + r.pecas);
      }
    }
    const tiposSet = new Set<string>();
    (backlogTipo as unknown as {tipo: string; pecas: number; pedidos: number }[]).forEach(r => tiposSet.add(r.tipo));
    ritmoTipoRef.forEach((_, t) => tiposSet.add(t));
    const backlogTipoMap = new Map((backlogTipo as unknown as {tipo: string; pecas: number; pedidos: number }[]).map(r => [r.tipo, r]));
    const por_tipo = Array.from(tiposSet).map(tipo => {
      const ritmo_mes = ritmoTipoRef.get(tipo) || 0;
      const b = backlogTipoMap.get(tipo);
      const backlog_pecas = b ? b.pecas : 0;
      const backlog_pedidos = b ? b.pedidos : 0;
      const meses_fila_tipo = ritmo_mes > 0 ? backlog_pecas / ritmo_mes : null;
      const folga_mes = ritmo_mes > 0 ? Math.max(0, ritmo_mes - backlog_pecas) : 0;
      return { tipo, ritmo_mes, backlog_pecas, backlog_pedidos, meses_fila: meses_fila_tipo, folga_mes };
    }).sort((a, b) => b.backlog_pecas - a.backlog_pecas);

    // Por máquina: capacidade 220 h/mês × horas usadas/mês (média desde que roda).
    const hojeIso = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
    const por_maquina = (maqHoras as unknown as {maquina: string; horas: number; desde: string | Date | null }[]).map(m => {
      const desdeIso = m.desde ? (typeof m.desde === 'string' ? m.desde.slice(0, 10) : new Date(m.desde).toISOString().slice(0, 10)) : null;
      const diasCorridos = desdeIso
        ? Math.max(1, Math.round((new Date(hojeIso + 'T12:00:00').getTime() - new Date(desdeIso + 'T12:00:00').getTime()) / 86400000) + 1)
        : null;
      const mesesAtivos = diasCorridos != null ? Math.max(0.2, diasCorridos / DIAS_MES) : null;
      const horas_mes = mesesAtivos != null ? m.horas / mesesAtivos : null;
      const horas_livres = horas_mes != null ? Math.max(0, HORAS_JORNADA_MES - horas_mes) : null;
      const utilizacao_pct = horas_mes != null ? (horas_mes / HORAS_JORNADA_MES) * 100 : null;
      return { maquina: m.maquina, cap_horas_mes: HORAS_JORNADA_MES, horas_mes, horas_livres, utilizacao_pct, desde: desdeIso };
    }).filter(m => m.horas_mes != null && m.horas_mes >= 1);

    return NextResponse.json({
      ritmo: { dia: R_dia, semana: R_semana, mes: R_mes, mes_ref: ref?.mes ?? null, dias_mes: ref?.dias ?? null },
      backlog: { pecas: bt.pecas, pedidos: bt.pedidos, meses_fila, dias_para_comecar },
      folga: { pecas_mes: folga_mes_pecas, pedidos_mes: folga_mes_pedidos, pecas_por_pedido },
      por_tipo,
      por_maquina,
    });
  } catch (e) {
    console.error('[analise/capacidade GET]', e);
    return NextResponse.json({ erro: 'Erro ao calcular capacidade' }, { status: 500 });
  }
}
