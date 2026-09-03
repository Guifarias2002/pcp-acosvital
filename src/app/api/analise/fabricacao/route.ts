import { NextResponse } from 'next/server';
import sql from '@/lib/db';
import { autenticar } from '@/lib/middleware';
import { podeVerAnalise } from '@/lib/auth';
import { withTimeout } from '@/lib/queryTimeout';
import { FAB_SETORES_EM_FABRICACAO, FAB_SETORES_PRONTO, FAB_SETORES_FILA } from '@/lib/types';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// ── Acompanhamento de FABRICAÇÃO — Flanges ───────────────────────────────────
// Relatório que anda AO VIVO com os pedidos. A produção é a FABRICAÇÃO (emissão
// → acabamento); depois é só verificação do PCP + despacho pela logística. Ver
// FAB_SETORES_* em types.ts e [[project_analise_pcp]].
//   1) Funil: onde estão TODAS as peças de Flange agora (fila / em fabricação /
//      pronto / entregue) — em unidades e itens.
//   2) Fabricado por mês: peça "fabricada" no mês em que PASSOU do acabamento
//      (1ª movimentação pra um setor PRONTO, ou entrega). Compara com a meta.
export async function GET(req: Request) {
  const user = await autenticar(req);
  if (user instanceof NextResponse) return user;
  if (!podeVerAnalise(user)) return NextResponse.json({ erro: 'Sem permissao' }, { status: 403 });

  try {
    const [funilRaw, fabMesRaw, metaCfg] = await withTimeout(Promise.all([
      // Funil: classifica cada item ativo de Flange num estágio pelo setor_atual.
      sql`
        SELECT
          CASE
            WHEN status = 'entregue'                         THEN 'entregue'
            WHEN setor_atual = ANY(${FAB_SETORES_PRONTO})    THEN 'pronto'
            WHEN setor_atual = ANY(${FAB_SETORES_EM_FABRICACAO}) THEN 'em_fabricacao'
            WHEN setor_atual = ANY(${FAB_SETORES_FILA}) OR status IN ('aguardando', 'emitido') THEN 'fila'
            ELSE 'em_fabricacao'
          END AS bucket,
          count(*)::int              AS itens,
          COALESCE(SUM(quantidade), 0)::float AS un
        FROM producao_itempedido
        WHERE inativo = false AND fabrica = 'flange'
        GROUP BY 1`,
      // Fabricado por mês: 1ª movimentação de cada item de Flange pra um setor
      // PRONTO (ou entrega) = quando a fabricação terminou. Soma a quantidade do
      // item nesse mês.
      sql`
        WITH fab AS (
          SELECT m.item_id, MIN(m.criado_em) AS fab_em
          FROM producao_movimentacaoitem m
          JOIN producao_itempedido i ON i.id = m.item_id AND i.fabrica = 'flange' AND i.inativo = false
          WHERE m.setor_destino = ANY(${FAB_SETORES_PRONTO}) OR m.status_novo = 'entregue'
          GROUP BY m.item_id)
        SELECT to_char(fab.fab_em, 'YYYY-MM') AS mes,
               count(*)::int AS itens,
               COALESCE(SUM(i.quantidade), 0)::float AS un
        FROM fab JOIN producao_itempedido i ON i.id = fab.item_id
        GROUP BY 1 ORDER BY 1`,
      sql`SELECT valor FROM producao_config WHERE chave = 'meta_mensal_un'`.catch(() => []),
    ]), 55000);

    // ── Funil ────────────────────────────────────────────────────────────────
    const fb = new Map((funilRaw as unknown as { bucket: string; itens: number; un: number }[])
      .map(r => [r.bucket, { itens: r.itens, un: r.un }]));
    const get = (k: string) => fb.get(k) || { itens: 0, un: 0 };
    const funil = {
      fila: get('fila'),
      em_fabricacao: get('em_fabricacao'),
      pronto: get('pronto'),
      entregue: get('entregue'),
    };
    const total_un = funil.fila.un + funil.em_fabricacao.un + funil.pronto.un + funil.entregue.un;
    // Fabricadas acumuladas = tudo que já passou do acabamento (pronto + entregue).
    const fabricadas_un = funil.pronto.un + funil.entregue.un;

    // ── Fabricado por mês + meta do mês corrente ──────────────────────────────
    const fabMes = (fabMesRaw as unknown as { mes: string; itens: number; un: number }[]);
    const hoje = new Date();
    const spNow = new Date(hoje.toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }));
    const mesAtual = `${spNow.getFullYear()}-${String(spNow.getMonth() + 1).padStart(2, '0')}`;
    const fabricado_mes_atual_un = fabMes.find(m => m.mes === mesAtual)?.un ?? 0;

    const metaRaw = (metaCfg as unknown as { valor: string }[])[0]?.valor;
    const meta_mensal_un = metaRaw != null && metaRaw !== '' && Number.isFinite(Number(metaRaw)) ? Number(metaRaw) : null;

    // Dias úteis do mês: 22 (padrão 5×~4,345). Decorridos: proporção de dias
    // corridos já passados no mês → ritmo real projetado.
    const dias_uteis_mes = 22;
    const diaDoMes = spNow.getDate();
    const diasNoMes = new Date(spNow.getFullYear(), spNow.getMonth() + 1, 0).getDate();
    const dias_uteis_decorridos = Math.max(1, Math.round(dias_uteis_mes * (diaDoMes / diasNoMes)));

    const ritmo_necessario_dia = meta_mensal_un != null ? meta_mensal_un / dias_uteis_mes : null;
    const ritmo_real_dia = fabricado_mes_atual_un / dias_uteis_decorridos;
    const projetado_fim_mes = ritmo_real_dia * dias_uteis_mes;
    const faltam_un = meta_mensal_un != null ? Math.max(0, meta_mensal_un - fabricado_mes_atual_un) : null;
    const risco = meta_mensal_un != null ? projetado_fim_mes < meta_mensal_un : null;

    return NextResponse.json({
      funil, total_un, fabricadas_un,
      fabricado_mes: fabMes,
      meta: {
        meta_mensal_un, mes_atual: mesAtual,
        fabricado_mes_atual_un,
        dias_uteis_mes, dias_uteis_decorridos,
        ritmo_necessario_dia, ritmo_real_dia, projetado_fim_mes, faltam_un, risco,
      },
    });
  } catch (e) {
    console.error('[analise/fabricacao GET]', e);
    return NextResponse.json({ erro: 'Erro ao gerar o acompanhamento de fabricação' }, { status: 500 });
  }
}
