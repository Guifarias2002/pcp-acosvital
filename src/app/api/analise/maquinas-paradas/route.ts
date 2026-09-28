import { NextResponse } from 'next/server';
import sql from '@/lib/db';
import { autenticar } from '@/lib/middleware';
import { podeVerAnalise } from '@/lib/auth';

export const dynamic = 'force-dynamic';

// MÁQUINAS PARADAS na Análise PCP (M59 — producao_maquina_parada).
// ?de=AAAA-MM-DD&ate=AAAA-MM-DD → só o pedaço de cada parada que cai no período
// (parada ainda aberta conta até agora). Devolve:
//  • agora: paradas abertas (motivo, desde, previsão, horas até agora);
//  • por_maquina: nº de paradas, horas paradas (corridas) e HORAS DE JORNADA
//    perdidas (dias parados × horas/dia × dias/semana ÷ 7, da capacidade
//    cadastrada em Parâmetros; padrão 8h × 5d), último motivo;
//  • lista: cada parada do período (pra tabela detalhada);
//  • totais.
const iso = (v: string | null) => (v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null);

export async function GET(req: Request) {
  const user = await autenticar(req);
  if (user instanceof NextResponse) return user;
  if (!podeVerAnalise(user)) return NextResponse.json({ erro: 'Sem permissao' }, { status: 403 });
  const url = new URL(req.url);
  const hoje = new Date().toISOString().slice(0, 10);
  const de = iso(url.searchParams.get('de')) || `${hoje.slice(0, 8)}01`;
  const ate = iso(url.searchParams.get('ate')) || hoje;

  try {
    const lista = await sql`
      WITH p AS (
        SELECT pm.*,
               GREATEST(pm.desde, (${de}::date::timestamp AT TIME ZONE 'America/Sao_Paulo')) AS ini,
               LEAST(COALESCE(pm.liberada_em, NOW()), ((${ate}::date + 1)::timestamp AT TIME ZONE 'America/Sao_Paulo')) AS fim
        FROM producao_maquina_parada pm
        WHERE pm.desde < ((${ate}::date + 1)::timestamp AT TIME ZONE 'America/Sao_Paulo')
          AND COALESCE(pm.liberada_em, NOW()) > (${de}::date::timestamp AT TIME ZONE 'America/Sao_Paulo')
      )
      SELECT p.id, p.maquina, p.motivo, p.desde, p.liberada_em, p.criado_por_nome, p.liberada_por_nome,
             p.previsao_retorno::text AS previsao_retorno, (p.liberada_em IS NULL) AS aberta,
             ROUND((EXTRACT(EPOCH FROM (p.fim - p.ini)) / 3600)::numeric, 1)::float AS horas,
             ROUND((EXTRACT(EPOCH FROM (p.fim - p.ini)) / 86400 * COALESCE(c.horas_dia, 8) * COALESCE(c.dias_semana, 5) / 7)::numeric, 1)::float AS horas_jornada
      FROM p LEFT JOIN producao_maquina_capacidade c ON c.maquina = p.maquina
      WHERE p.fim > p.ini
      ORDER BY p.desde DESC
    `;
    const agora = await sql`
      SELECT id, maquina, motivo, desde, previsao_retorno::text AS previsao_retorno, criado_por_nome,
             ROUND((EXTRACT(EPOCH FROM (NOW() - desde)) / 3600)::numeric, 1)::float AS horas
      FROM producao_maquina_parada WHERE liberada_em IS NULL ORDER BY desde
    `;
    type L = { maquina: string; motivo: string; desde: string; horas: number; horas_jornada: number; aberta: boolean };
    const porMaq = new Map<string, { maquina: string; paradas: number; horas: number; horas_jornada: number; ultimo_motivo: string; ultima: string; parada_agora: boolean }>();
    for (const r of lista as unknown as L[]) {
      const m = porMaq.get(r.maquina) || { maquina: r.maquina, paradas: 0, horas: 0, horas_jornada: 0, ultimo_motivo: r.motivo, ultima: r.desde, parada_agora: false };
      m.paradas++; m.horas += r.horas; m.horas_jornada += r.horas_jornada;
      if (r.aberta) m.parada_agora = true;
      if (String(r.desde) > String(m.ultima)) { m.ultima = r.desde; m.ultimo_motivo = r.motivo; }
      porMaq.set(r.maquina, m);
    }
    const por_maquina = Array.from(porMaq.values())
      .map(m => ({ ...m, horas: Math.round(m.horas * 10) / 10, horas_jornada: Math.round(m.horas_jornada * 10) / 10 }))
      .sort((a, b) => b.horas - a.horas);
    const totais = {
      paradas: lista.length,
      maquinas: por_maquina.length,
      horas: Math.round(por_maquina.reduce((s, m) => s + m.horas, 0) * 10) / 10,
      horas_jornada: Math.round(por_maquina.reduce((s, m) => s + m.horas_jornada, 0) * 10) / 10,
      paradas_agora: agora.length,
    };
    return NextResponse.json({ de, ate, agora, por_maquina, lista, totais });
  } catch (e) {
    // Tabela ainda não criada (M59) → vazio, sem quebrar a Análise.
    console.error('[analise/maquinas-paradas]', e);
    return NextResponse.json({ de, ate, agora: [], por_maquina: [], lista: [], totais: { paradas: 0, maquinas: 0, horas: 0, horas_jornada: 0, paradas_agora: 0 } });
  }
}
