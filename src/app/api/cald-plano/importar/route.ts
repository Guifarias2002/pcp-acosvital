import { NextResponse } from 'next/server';
import sql from '@/lib/db';
import { autenticar } from '@/lib/middleware';
import { podePlanejarCaldeiraria } from '@/lib/auth';
import { comIdempotencia, chaveIdempotencia } from '@/lib/idempotencia';
import { limpar, casar, diferencas, type Linha, type ResultadoLinha } from '@/lib/caldPlanoImport';
import { carregarItensCald, registrarHistCald } from '@/lib/caldPlanoServer';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

// Importa / REIMPORTA a planilha do PCP da Caldeiraria. A leitura do .xlsx é no
// navegador (interpretarPlanilha); aqui chegam as linhas já interpretadas.
//
// Reimportar NÃO duplica: cada linha é casada com um item que já existe e só o
// que MUDOU é atualizado (data de entrada, área, material, qtd, datas…).
//   • Casamento: mesmo pedido + mesmo material (normalizado); com 2+ iguais no
//     pedido, desempata pela quantidade. Sobrou 1 linha e 1 item sem par no mesmo
//     pedido → é o mesmo item com o material renomeado.
//   • Campo vazio na planilha NUNCA apaga o que está no sistema (valor, previsões
//     e o que o coordenador lançou por lá ficam).
//   • Item CANCELADO no sistema não volta.
// body.simular = true → só calcula e devolve o que faria (pré-visualização).

export async function POST(req: Request) {
  const user = await autenticar(req);
  if (user instanceof NextResponse) return user;
  if (!podePlanejarCaldeiraria(user)) return NextResponse.json({ erro: 'Sem permissao' }, { status: 403 });

  return comIdempotencia(chaveIdempotencia(req), { usuarioId: user.id, metodo: 'POST', caminho: '/api/cald-plano/importar' }, async () => {
    let b: Record<string, unknown>;
    try { b = await req.json(); } catch { return NextResponse.json({ erro: 'JSON inválido' }, { status: 400 }); }
    const brutas = Array.isArray(b.linhas) ? (b.linhas as Record<string, unknown>[]).slice(0, 2000) : [];
    if (!brutas.length) return NextResponse.json({ erro: 'Nada para importar' }, { status: 400 });
    const simular = b.simular === true;
    const empresaPadrao = typeof b.empresa_padrao === 'string' && ['acosvital', 'uberaba', 'hrm'].includes(b.empresa_padrao) ? b.empresa_padrao : null;
    const quem = user.nome || user.username;

    try {
      const out = await sql.begin(async (tx) => {
        const resultado: ResultadoLinha[] = [];
        const validas: Linha[] = [];
        brutas.forEach((raw, i) => {
          const l = limpar(raw, i);
          if (l) validas.push(l);
          else resultado.push({ linha: Number(raw.linha) || i + 1, pedido: String(raw.pedido || ''), material: String(raw.material || ''), tipo: 'invalida' });
        });
        const pedidos = Array.from(new Set(validas.map(l => l.pedido.toLowerCase())));
        const [{ ids }] = await tx`
          SELECT COALESCE(array_agg(id), '{}') AS ids FROM producao_cald_plano_item WHERE lower(pedido) = ANY(${pedidos}::text[])
        `;
        const existentes = (ids as number[]).length ? await carregarItensCald(tx, ids as number[]) : [];
        const par = casar(validas, existentes);

        let novos = 0, atualizados = 0;
        for (let i = 0; i < validas.length; i++) {
          const l = validas[i];
          const it = par.get(i);
          if (it && it.status === 'cancelado') { resultado.push({ linha: l.linha, pedido: l.pedido, material: l.material, tipo: 'cancelado', item_id: it.id }); continue; }
          if (it) {
            const { set, etapas, mud } = diferencas(l, it, empresaPadrao);
            if (!mud.length) { resultado.push({ linha: l.linha, pedido: l.pedido, material: l.material, tipo: 'igual', item_id: it.id }); continue; }
            resultado.push({ linha: l.linha, pedido: l.pedido, material: l.material, tipo: 'atualizar', item_id: it.id, mudancas: mud });
            atualizados++;
            if (simular) continue;
            if (Object.keys(set).length) await tx`UPDATE producao_cald_plano_item SET ${tx(set)}, atualizado_em = NOW() WHERE id = ${it.id}`;
            for (const e of etapas) {
              await tx`
                INSERT INTO producao_cald_plano_etapa (item_id, area, entrada, fornecedor)
                VALUES (${it.id}, ${e.area}, ${e.entrada}, ${e.fornecedor})
                ON CONFLICT (item_id, area) DO UPDATE SET entrada = EXCLUDED.entrada, fornecedor = EXCLUDED.fornecedor
              `;
            }
            await registrarHistCald(tx, it.id, 'reimportado', `Atualizado pela planilha: ${mud.join(' · ')}`, quem);
            continue;
          }
          // Novo item.
          resultado.push({ linha: l.linha, pedido: l.pedido, material: l.material, tipo: 'novo' });
          novos++;
          if (simular) continue;
          let areaAtual: string | null = null, maior = '';
          for (const a of l.areas) { const e = l.etapas.find(x => x.area === a); if (e?.entrada && e.entrada >= maior) { maior = e.entrada; areaAtual = a; } }
          const status = l.finalizado_em ? 'finalizado' : areaAtual ? 'andamento' : 'novo';
          const [row] = await tx`
            INSERT INTO producao_cald_plano_item
              (pedido, vendedor, cliente, material, quantidade, unidade, valor, empresa, areas, area_atual, status,
               prev_faturamento, faturado_em, prev_finalizacao, finalizado_em, parcial, obs,
               criado_por_id, criado_por_nome)
            VALUES
              (${l.pedido}, ${l.vendedor}, ${l.cliente}, ${l.material}, ${l.quantidade}, ${l.unidade}, ${l.valor}, ${l.empresa ?? empresaPadrao},
               ${l.areas}::text[], ${areaAtual}, ${status},
               ${l.prev_faturamento}, ${l.faturado_em}, ${l.prev_finalizacao}, ${l.finalizado_em},
               ${l.parcial}, ${l.obs}, ${user.id}, ${quem})
            RETURNING id
          `;
          for (const e of l.etapas) {
            await tx`
              INSERT INTO producao_cald_plano_etapa (item_id, area, entrada, fornecedor)
              VALUES (${row.id}, ${e.area}, ${e.entrada}, ${e.fornecedor})
              ON CONFLICT (item_id, area) DO NOTHING
            `;
          }
          await registrarHistCald(tx, row.id as number, 'importado', 'Importado da planilha', quem);
        }
        resultado.sort((a, b2) => a.linha - b2.linha);
        return {
          resultado, novos, atualizados,
          iguais: resultado.filter(r => r.tipo === 'igual').length,
          cancelados: resultado.filter(r => r.tipo === 'cancelado').length,
          invalidas: resultado.filter(r => r.tipo === 'invalida').length,
        };
      });
      return NextResponse.json({ ok: true, simulado: simular, ...out });
    } catch (e) {
      console.error('[cald-plano/importar POST]', e);
      return NextResponse.json({ erro: 'Erro ao importar' }, { status: 500 });
    }
  });
}
