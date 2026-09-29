/**
 * /api/estoque — Estoque de FLANGES (aba "Estoque" do /planejamento).
 * Dois locais (Arujá / Mogi), cadastro único de flanges, saldo = soma das
 * movimentações não canceladas. Ver src/lib/estoque.ts e M61 em migrations.ts.
 *
 *   GET  → { itens, movs, no_setor, pendencias, pedidos_estoque, inventarios }
 *          (antes de responder, sincroniza as ENTRADAS DE PRODUÇÃO: item de
 *          "Pedido de Estoque" que passou do acabamento entra no saldo do local
 *          do pedido — uma vez só, índice único por item_pedido_id)
 *   GET ?inventario=ID → { inventario, linhas }
 *   POST { acao, ... } → ver o switch abaixo.
 *
 * Acesso: podeVerInventario (quem planeja + ESTOQUE_LOGINS + pessoal do setor Estoque).
 */
import { NextResponse } from 'next/server';
import sql from '@/lib/db';
import { autenticar } from '@/lib/middleware';
import { podeVerInventario } from '@/lib/auth';
import { FAB_SETORES_PRONTO, injetarQuarentena, SETOR_CHOICES } from '@/lib/types';
import { LOCAIS_COD, normCodigo } from '@/lib/estoque';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

type Tx = typeof sql;
const SETORES_VALIDOS: string[] = SETOR_CHOICES.map(([cod]) => cod);
const num = (v: unknown) => { const n = Number(v); return Number.isFinite(n) ? n : NaN; };
const erro = (msg: string, status = 400) => NextResponse.json({ erro: msg }, { status });

// Saldo de um flange num local (dentro da transação, depois do FOR UPDATE).
async function saldo(t: Tx, itemId: number, local: string): Promise<number> {
  const [r] = await t`
    SELECT COALESCE(SUM(quantidade), 0)::float AS s FROM producao_estoque_mov
    WHERE item_id = ${itemId} AND local = ${local} AND cancelado_em IS NULL`;
  return Number(r.s) || 0;
}
async function travarItens(t: Tx, ids: number[]) {
  const r = await t`SELECT id, codigo, ativo FROM producao_estoque_item WHERE id = ANY(${ids}) ORDER BY id FOR UPDATE`;
  return new Map(r.map(x => [Number(x.id), x]));
}

// Entradas de produção automáticas (ver cabeçalho). Devolve os itens que não
// acharam flange cadastrado pelo código (precisam de vínculo manual).
async function sincronizarProducao() {
  await sql`
    WITH prontos AS (
      SELECT i.id AS item_pedido_id, i.pedido_id, i.codigo, i.quantidade, p.estoque_destino AS local
      FROM producao_itempedido i
      JOIN producao_pedido p ON p.id = i.pedido_id
      WHERE p.estoque_destino IS NOT NULL AND i.inativo = false
        AND COALESCE(i.fabrica, 'flange') <> 'caldeiraria'
        AND EXISTS (SELECT 1 FROM producao_movimentacaoitem m
                    WHERE m.item_id = i.id AND (m.setor_destino = ANY(${FAB_SETORES_PRONTO}) OR m.status_novo = 'entregue'))
        AND NOT EXISTS (SELECT 1 FROM producao_estoque_mov e
                        WHERE e.item_pedido_id = i.id AND e.tipo = 'producao' AND e.cancelado_em IS NULL)
    )
    INSERT INTO producao_estoque_mov (item_id, local, tipo, quantidade, obs, pedido_id, item_pedido_id, criado_por_nome)
    SELECT DISTINCT ON (pr.item_pedido_id) e.id, pr.local, 'producao', pr.quantidade,
           'Automático: passou do acabamento', pr.pedido_id, pr.item_pedido_id, 'Sistema'
    FROM prontos pr
    JOIN producao_estoque_item e ON e.ativo
      AND (upper(trim(e.codigo_pedido)) = upper(trim(pr.codigo)) OR upper(trim(e.codigo)) = upper(trim(pr.codigo)))
    ORDER BY pr.item_pedido_id, (upper(trim(e.codigo_pedido)) = upper(trim(pr.codigo))) DESC, e.id
    ON CONFLICT DO NOTHING
  `;
}

export async function GET(req: Request) {
  const user = await autenticar(req);
  if (user instanceof NextResponse) return user;
  if (!podeVerInventario(user)) return erro('Sem permissão', 403);

  try {
    const { searchParams } = new URL(req.url);
    const invId = Number(searchParams.get('inventario'));
    if (invId > 0) {
      const [inv] = await sql`SELECT *, criado_em::text, fechado_em::text FROM producao_estoque_inventario WHERE id = ${invId}`;
      if (!inv) return erro('Inventário não encontrado', 404);
      const linhas = await sql`
        SELECT item_id, contado::float, saldo_sistema::float FROM producao_estoque_inventario_linha WHERE inventario_id = ${invId}`;
      return NextResponse.json({ inventario: inv, linhas });
    }

    await sincronizarProducao().catch(e => console.error('[estoque] sync produção', e));

    const [itens, movs, noSetor, pendencias, pedidosEstoque, inventarios] = await Promise.all([
      sql`
        SELECT e.id, e.codigo, e.codigo_pedido, e.descricao, e.unidade, e.estoque_minimo::float, e.ativo,
               COALESCE(SUM(m.quantidade) FILTER (WHERE m.local = 'aruja'), 0)::float AS saldo_aruja,
               COALESCE(SUM(m.quantidade) FILTER (WHERE m.local = 'mogi'), 0)::float  AS saldo_mogi,
               bool_or(m.local = 'aruja') AS em_aruja, bool_or(m.local = 'mogi') AS em_mogi
        FROM producao_estoque_item e
        LEFT JOIN producao_estoque_mov m ON m.item_id = e.id AND m.cancelado_em IS NULL
        GROUP BY e.id ORDER BY e.ativo DESC, e.codigo`,
      sql`
        SELECT m.id, m.item_id, e.codigo, e.descricao, m.local, m.tipo, m.quantidade::float, m.obs,
               p.numero_pedido_venda, m.atendimento_id, m.inventario_id, m.grupo,
               m.criado_por_nome, m.criado_em::text, m.cancelado_em::text, m.cancelado_por_nome
        FROM producao_estoque_mov m
        JOIN producao_estoque_item e ON e.id = m.item_id
        LEFT JOIN producao_pedido p ON p.id = m.pedido_id
        ORDER BY m.criado_em DESC, m.id DESC LIMIT 400`,
      sql`
        SELECT pa.id AS parcial_id, i.id AS item_pedido_id, p.id AS pedido_id, p.numero_pedido_venda,
               COALESCE(p.cliente, '') AS cliente, i.codigo, i.descricao, i.unidade,
               pa.quantidade::float AS quantidade, pa.status,
               COALESCE(NULLIF(i.roteiro_proprio, '{}'), p.roteiro_base) AS roteiro,
               p.estoque_destino AS pedido_estoque,
               (SELECT e.id FROM producao_estoque_item e
                 WHERE e.ativo AND (upper(trim(e.codigo_pedido)) = upper(trim(i.codigo)) OR upper(trim(e.codigo)) = upper(trim(i.codigo)))
                 ORDER BY (upper(trim(e.codigo_pedido)) = upper(trim(i.codigo))) DESC, e.id LIMIT 1) AS sugestao_item_id
        FROM producao_itemparcial pa
        JOIN producao_itempedido i ON i.id = pa.item_pedido_id
        JOIN producao_pedido p ON p.id = i.pedido_id
        WHERE pa.setor_atual = 'estoque' AND pa.status NOT IN ('cancelada', 'concluida')
          AND i.inativo = false AND COALESCE(i.fabrica, 'flange') <> 'caldeiraria'
        ORDER BY p.numero_pedido_venda, i.id, pa.id`,
      sql`
        SELECT i.id AS item_pedido_id, p.id AS pedido_id, p.numero_pedido_venda, i.codigo, i.descricao,
               i.quantidade::float, p.estoque_destino AS local,
               (SELECT MIN(m.criado_em) FROM producao_movimentacaoitem m
                 WHERE m.item_id = i.id AND (m.setor_destino = ANY(${FAB_SETORES_PRONTO}) OR m.status_novo = 'entregue'))::text AS pronto_em
        FROM producao_itempedido i JOIN producao_pedido p ON p.id = i.pedido_id
        WHERE p.estoque_destino IS NOT NULL AND i.inativo = false
          AND COALESCE(i.fabrica, 'flange') <> 'caldeiraria'
          AND EXISTS (SELECT 1 FROM producao_movimentacaoitem m
                      WHERE m.item_id = i.id AND (m.setor_destino = ANY(${FAB_SETORES_PRONTO}) OR m.status_novo = 'entregue'))
          AND NOT EXISTS (SELECT 1 FROM producao_estoque_mov e
                          WHERE e.item_pedido_id = i.id AND e.tipo = 'producao' AND e.cancelado_em IS NULL)
        ORDER BY p.numero_pedido_venda, i.id`,
      sql`
        SELECT p.id AS pedido_id, p.numero_pedido_venda, COALESCE(p.cliente, '') AS cliente, p.estoque_destino AS local,
               count(i.id)::int AS itens, COALESCE(SUM(i.quantidade), 0)::float AS pecas,
               COALESCE((SELECT SUM(m.quantidade) FROM producao_estoque_mov m
                          WHERE m.pedido_id = p.id AND m.tipo = 'producao' AND m.cancelado_em IS NULL), 0)::float AS pecas_entradas
        FROM producao_pedido p
        LEFT JOIN producao_itempedido i ON i.pedido_id = p.id AND i.inativo = false
        WHERE p.estoque_destino IS NOT NULL
        GROUP BY p.id ORDER BY p.id DESC LIMIT 200`,
      sql`
        SELECT v.id, v.local, v.obs, v.status, v.criado_por_nome, v.criado_em::text, v.fechado_em::text, v.fechado_por_nome,
               (SELECT count(*)::int FROM producao_estoque_inventario_linha l WHERE l.inventario_id = v.id) AS linhas,
               (SELECT count(*)::int FROM producao_estoque_mov m WHERE m.inventario_id = v.id AND m.cancelado_em IS NULL) AS ajustes
        FROM producao_estoque_inventario v ORDER BY v.id DESC LIMIT 50`,
    ]);

    const no_setor = noSetor.map(r => {
      const rot = injetarQuarentena((r.roteiro as string[]) || []);
      const idx = rot.indexOf('estoque');
      return { ...r, roteiro: rot, proximo_setor: idx >= 0 && idx < rot.length - 1 ? rot[idx + 1] : null };
    });

    return NextResponse.json({ itens, movs, no_setor, pendencias, pedidos_estoque: pedidosEstoque, inventarios });
  } catch (e) {
    console.error('[GET /api/estoque]', e);
    return erro('Erro ao carregar o estoque', 500);
  }
}

export async function POST(req: Request) {
  const user = await autenticar(req);
  if (user instanceof NextResponse) return user;
  if (!podeVerInventario(user)) return erro('Sem permissão', 403);
  const quem = user.nome || user.username;

  const b = await req.json().catch(() => ({})) as Record<string, unknown>;
  const acao = String(b.acao || '');
  const txt = (v: unknown, max = 500) => (typeof v === 'string' ? v.trim().slice(0, max) : '') || null;

  try {
    // ── Cadastro de flange (novo ou edição) ─────────────────────────────────
    if (acao === 'item_salvar') {
      const codigo = txt(b.codigo, 60);
      const descricao = txt(b.descricao, 300);
      if (!codigo || !descricao) return erro('Informe o código e a descrição.');
      const codPed = txt(b.codigo_pedido, 60);
      const unidade = txt(b.unidade, 10) || 'pç';
      const min = b.estoque_minimo === '' || b.estoque_minimo == null ? null : num(b.estoque_minimo);
      if (min !== null && (Number.isNaN(min) || min < 0)) return erro('Estoque mínimo inválido.');
      const ativo = b.ativo !== false;
      const id = Number(b.id) || 0;
      const dup = await sql`SELECT id FROM producao_estoque_item WHERE upper(trim(codigo)) = ${normCodigo(codigo)} AND id <> ${id}`;
      if (dup.length) return erro('Já existe um flange com esse código.');
      if (id) {
        const r = await sql`
          UPDATE producao_estoque_item SET codigo = ${codigo}, codigo_pedido = ${codPed}, descricao = ${descricao},
                 unidade = ${unidade}, estoque_minimo = ${min}, ativo = ${ativo}
          WHERE id = ${id}`;
        if (!r.count) return erro('Flange não encontrado.', 404);
      } else {
        await sql`
          INSERT INTO producao_estoque_item (codigo, codigo_pedido, descricao, unidade, estoque_minimo, criado_por_nome)
          VALUES (${codigo}, ${codPed}, ${descricao}, ${unidade}, ${min}, ${quem})`;
      }
      return NextResponse.json({ ok: true });
    }

    // ── Inventário simples: adicionar item com a QUANTIDADE ATUAL no local ──
    // Código já cadastrado → só passa a existir também neste local (ou ajusta).
    // Grava a quantidade atual de um código num local (cria o item se não existe).
    // somar=true (botão "Adicionar"): o mesmo produto cadastrado de novo SOMA ao que
    // já tem no local. Planilha: quantidade atual (linhas repetidas já vêm somadas).
    const inventariar = async (t: Tx, codigo: string, descricao: string | null, local: string, qtdInf: number, obsMov: string, somar = false) => {
      let [it] = await t`SELECT id, ativo FROM producao_estoque_item WHERE upper(trim(codigo)) = ${normCodigo(codigo)} FOR UPDATE`;
      let novo = false;
      if (!it) {
        if (!descricao) throw new Error(`USR:Informe a descrição do código ${codigo} (item novo).`);
        [it] = await t`INSERT INTO producao_estoque_item (codigo, descricao, unidade, criado_por_nome)
                       VALUES (${codigo}, ${descricao}, ${txt(b.unidade, 10) || 'pç'}, ${quem}) RETURNING id, ativo`;
        novo = true;
      } else if (!it.ativo) {
        await t`UPDATE producao_estoque_item SET ativo = true WHERE id = ${it.id}`;
      }
      const s = await saldo(t, Number(it.id), local);
      const [tem] = await t`SELECT 1 AS x FROM producao_estoque_mov WHERE item_id = ${it.id} AND local = ${local} AND cancelado_em IS NULL LIMIT 1`;
      const qtd = somar && tem ? s + qtdInf : qtdInf;
      if (tem && Math.abs(qtd - s) < 1e-9) return 'igual' as const;
      const obs = somar && tem ? `${obsMov}: +${qtdInf} (${s} → ${qtd})` : `${obsMov}: ${tem ? `${s} → ` : ''}${qtd}`;
      await t`INSERT INTO producao_estoque_mov (item_id, local, tipo, quantidade, obs, criado_por_nome)
              VALUES (${it.id}, ${local}, 'inventario', ${qtd - s}, ${obs}, ${quem})`;
      return novo ? 'novo' as const : 'ajustado' as const;
    };

    if (acao === 'item_adicionar') {
      const codigo = txt(b.codigo, 60);
      const descricao = txt(b.descricao, 300);
      const local = String(b.local || '');
      const qtd = num(b.quantidade ?? 0);
      if (!codigo) return erro('Informe o código.');
      if (!LOCAIS_COD.includes(local)) return erro('Local inválido.');
      if (Number.isNaN(qtd) || qtd < 0) return erro('Quantidade inválida.');
      await sql.begin(async (tx) => { await inventariar(tx as unknown as Tx, codigo, descricao, local, qtd, 'Adicionado', true); });
      return NextResponse.json({ ok: true });
    }

    // Importação da PLANILHA MODELO (Local | Código | Descrição | Quantidade atual).
    // Tudo ou nada: se uma linha tiver erro, nada é gravado.
    if (acao === 'importar') {
      const linhas = Array.isArray(b.linhas) ? (b.linhas as Record<string, unknown>[]) : [];
      if (!linhas.length) return erro('A planilha não tem linhas com quantidade.');
      if (linhas.length > 3000) return erro('Planilha grande demais (máx. 3000 linhas).');
      const cont = { novo: 0, ajustado: 0, igual: 0 };
      await sql.begin(async (tx) => {
        const t = tx as unknown as Tx;
        for (let i = 0; i < linhas.length; i++) {
          const l = linhas[i];
          const ref = `Linha ${Number(l.linha) || i + 2}`;
          const codigo = txt(l.codigo, 60);
          const local = String(l.local || '');
          const qtd = num(l.quantidade);
          if (!codigo) throw new Error(`USR:${ref}: sem código.`);
          if (!LOCAIS_COD.includes(local)) throw new Error(`USR:${ref}: local inválido (use Arujá ou Mogi).`);
          if (Number.isNaN(qtd) || qtd < 0) throw new Error(`USR:${ref}: quantidade inválida.`);
          try {
            cont[await inventariar(t, codigo, txt(l.descricao, 300), local, qtd, 'Planilha de inventário')]++;
          } catch (e) {
            const m = e instanceof Error ? e.message : '';
            throw new Error(m.startsWith('USR:') ? `USR:${ref}: ${m.slice(4)}` : m);
          }
        }
      });
      return NextResponse.json({ ok: true, ...cont });
    }
    // Corrige a quantidade atual de um item no local (diferença vira ajuste).
    if (acao === 'ajustar') {
      const itemId = Number(b.item_id);
      const local = String(b.local || '');
      const qtd = num(b.quantidade);
      if (!itemId || !LOCAIS_COD.includes(local)) return erro('Item/local inválido.');
      if (Number.isNaN(qtd) || qtd < 0) return erro('Quantidade inválida.');
      await sql.begin(async (tx) => {
        const t = tx as unknown as Tx;
        const itens = await travarItens(t, [itemId]);
        if (!itens.get(itemId)) throw new Error('USR:Item não encontrado.');
        const s = await saldo(t, itemId, local);
        if (Math.abs(qtd - s) < 1e-9) return;
        await t`INSERT INTO producao_estoque_mov (item_id, local, tipo, quantidade, obs, criado_por_nome)
                VALUES (${itemId}, ${local}, 'inventario', ${qtd - s}, ${`Quantidade corrigida: ${s} → ${qtd}${txt(b.obs) ? ` · ${txt(b.obs)}` : ''}`}, ${quem})`;
      });
      return NextResponse.json({ ok: true });
    }

    // ── Lançamento manual: entrada / saída / transferência ──────────────────
    if (acao === 'lancar') {
      const tipo = String(b.tipo || '');
      const itemId = Number(b.item_id);
      const local = String(b.local || '');
      const qtd = num(b.quantidade);
      const obs = txt(b.obs);
      if (!['entrada', 'saida', 'transferencia'].includes(tipo)) return erro('Tipo de lançamento inválido.');
      if (!itemId) return erro('Escolha o flange.');
      if (!LOCAIS_COD.includes(local)) return erro('Escolha o local.');
      if (!(qtd > 0)) return erro('Quantidade deve ser maior que zero.');
      const destino = String(b.local_destino || '');
      if (tipo === 'transferencia' && (!LOCAIS_COD.includes(destino) || destino === local))
        return erro('Escolha o local de destino (diferente da origem).');

      await sql.begin(async (tx) => {
        const t = tx as unknown as Tx;
        const itens = await travarItens(t, [itemId]);
        const it = itens.get(itemId);
        if (!it) throw new Error('USR:Flange não encontrado.');
        if (tipo !== 'entrada') {
          const s = await saldo(t, itemId, local);
          if (qtd > s + 1e-9) throw new Error(`USR:Saldo insuficiente em ${local === 'aruja' ? 'Arujá' : 'Mogi'}: tem ${s}.`);
        }
        if (tipo === 'transferencia') {
          const grupo = `T${Date.now()}-${itemId}`;
          await t`INSERT INTO producao_estoque_mov (item_id, local, tipo, quantidade, obs, grupo, criado_por_nome)
                  VALUES (${itemId}, ${local}, 'transf_saida', ${-qtd}, ${obs}, ${grupo}, ${quem}),
                         (${itemId}, ${destino}, 'transf_entrada', ${qtd}, ${obs}, ${grupo}, ${quem})`;
        } else {
          await t`INSERT INTO producao_estoque_mov (item_id, local, tipo, quantidade, obs, criado_por_nome)
                  VALUES (${itemId}, ${local}, ${tipo}, ${tipo === 'saida' ? -qtd : qtd}, ${obs}, ${quem})`;
        }
      });
      return NextResponse.json({ ok: true });
    }

    // ── Cancelar lançamento feito errado (não apaga: marca cancelado) ───────
    if (acao === 'cancelar_mov') {
      const id = Number(b.id);
      const [m] = await sql`SELECT * FROM producao_estoque_mov WHERE id = ${id}`;
      if (!m) return erro('Lançamento não encontrado.', 404);
      if (m.cancelado_em) return erro('Lançamento já cancelado.');
      if (m.atendimento_id) return erro('Essa baixa veio de um pedido — use "Desfazer baixa" na lista de baixas.');
      if (m.tipo === 'producao')
        await sql`UPDATE producao_estoque_mov SET cancelado_em = NOW(), cancelado_por_nome = ${quem} WHERE id = ${id}`;
      else if (m.grupo)
        await sql`UPDATE producao_estoque_mov SET cancelado_em = NOW(), cancelado_por_nome = ${quem} WHERE grupo = ${m.grupo} AND cancelado_em IS NULL`;
      else
        await sql`UPDATE producao_estoque_mov SET cancelado_em = NOW(), cancelado_por_nome = ${quem} WHERE id = ${id}`;
      return NextResponse.json({ ok: true });
    }

    // ── Atender peça do setor Estoque: registra a ORIGEM e baixa o saldo ────
    // origens = [{ item_id, local, quantidade }] (vindo do estoque armazenado);
    // qtd_fabricacao = parte fabricada aqui (não mexe no saldo). A soma é o que
    // vai ser movimentado — a tela chama o "mover" da parcial logo em seguida e,
    // se ele falhar, desfaz este atendimento (acao 'cancelar_atendimento').
    if (acao === 'atender') {
      const parcialId = Number(b.parcial_id);
      const qtdFab = num(b.qtd_fabricacao || 0);
      const origens = (Array.isArray(b.origens) ? b.origens : []) as Record<string, unknown>[];
      const linhas = origens.map(o => ({ item_id: Number(o.item_id), local: String(o.local || ''), qtd: num(o.quantidade) }))
        .filter(o => o.qtd > 0);
      if (Number.isNaN(qtdFab) || qtdFab < 0) return erro('Quantidade de fabricação inválida.');
      for (const o of linhas) {
        if (!o.item_id) return erro('Escolha o flange do estoque.');
        if (!LOCAIS_COD.includes(o.local)) return erro('Escolha o local (Arujá ou Mogi).');
      }
      const qtdEst = linhas.reduce((s, o) => s + o.qtd, 0);
      const total = qtdEst + qtdFab;
      if (!(total > 0)) return erro('Informe quanto veio do estoque e/ou da fabricação.');
      const setorDestino = String(b.setor_destino || '');
      if (!SETORES_VALIDOS.includes(setorDestino)) return erro('Escolha o setor de destino.');

      const [pa] = await sql`
        SELECT pa.id, pa.quantidade::float AS qtd, pa.setor_atual, pa.status, i.id AS item_pedido_id, i.pedido_id
        FROM producao_itemparcial pa JOIN producao_itempedido i ON i.id = pa.item_pedido_id WHERE pa.id = ${parcialId}`;
      if (!pa) return erro('Peça não encontrada.', 404);
      if (pa.setor_atual !== 'estoque' || ['cancelada', 'concluida'].includes(pa.status)) return erro('Essa peça não está mais no setor Estoque. Atualize a tela.', 409);
      if (total > Number(pa.qtd) + 1e-9) return erro(`A soma (${total}) passa do que está no Estoque (${pa.qtd}).`);

      const atendimentoId = await sql.begin(async (tx) => {
        const t = tx as unknown as Tx;
        await travarItens(t, Array.from(new Set(linhas.map(o => o.item_id))));
        // Saldo por (flange, local), somando linhas repetidas.
        const pedirPorChave = new Map<string, number>();
        for (const o of linhas) pedirPorChave.set(`${o.item_id}|${o.local}`, (pedirPorChave.get(`${o.item_id}|${o.local}`) || 0) + o.qtd);
        for (const [k, q] of Array.from(pedirPorChave.entries())) {
          const [iid, loc] = k.split('|');
          const s = await saldo(t, Number(iid), loc);
          if (q > s + 1e-9) {
            const [it] = await t`SELECT codigo FROM producao_estoque_item WHERE id = ${Number(iid)}`;
            throw new Error(`USR:Saldo insuficiente de ${it?.codigo ?? 'flange'} em ${loc === 'aruja' ? 'Arujá' : 'Mogi'}: tem ${s}, pediu ${q}.`);
          }
        }
        const [at] = await t`
          INSERT INTO producao_estoque_atendimento (parcial_id, item_pedido_id, pedido_id, qtd_estoque, qtd_fabricacao, setor_destino, obs, criado_por_nome)
          VALUES (${parcialId}, ${pa.item_pedido_id}, ${pa.pedido_id}, ${qtdEst}, ${qtdFab}, ${setorDestino}, ${txt(b.obs)}, ${quem})
          RETURNING id`;
        for (const o of linhas) {
          await t`INSERT INTO producao_estoque_mov (item_id, local, tipo, quantidade, obs, pedido_id, item_pedido_id, atendimento_id, criado_por_nome)
                  VALUES (${o.item_id}, ${o.local}, 'baixa_pedido', ${-o.qtd}, ${txt(b.obs)}, ${pa.pedido_id}, ${pa.item_pedido_id}, ${at.id}, ${quem})`;
        }
        return Number(at.id);
      });
      return NextResponse.json({ ok: true, atendimento_id: atendimentoId, quantidade: total });
    }

    if (acao === 'cancelar_atendimento') {
      const id = Number(b.id);
      await sql.begin(async (tx) => {
        const t = tx as unknown as Tx;
        const r = await t`UPDATE producao_estoque_atendimento SET cancelado_em = NOW() WHERE id = ${id} AND cancelado_em IS NULL`;
        if (!r.count) throw new Error('USR:Baixa não encontrada ou já desfeita.');
        await t`UPDATE producao_estoque_mov SET cancelado_em = NOW(), cancelado_por_nome = ${quem} WHERE atendimento_id = ${id} AND cancelado_em IS NULL`;
      });
      return NextResponse.json({ ok: true });
    }

    // ── Marcar/desmarcar pedido como "Pedido de Estoque" ────────────────────
    if (acao === 'pedido_estoque') {
      const numero = txt(b.numero_pedido_venda, 40);
      const local = b.local == null || b.local === '' ? null : String(b.local);
      if (!numero) return erro('Informe o número do pedido.');
      if (local !== null && !LOCAIS_COD.includes(local)) return erro('Local inválido.');
      const r = await sql`UPDATE producao_pedido SET estoque_destino = ${local} WHERE trim(numero_pedido_venda) = ${numero} RETURNING id`;
      if (!r.length) return erro('Pedido não encontrado.', 404);
      if (r.length > 1) return erro('Mais de um pedido com esse número — confira.');
      return NextResponse.json({ ok: true });
    }

    // ── Vincular item de Pedido de Estoque sem flange cadastrado ────────────
    if (acao === 'vincular') {
      const ipId = Number(b.item_pedido_id);
      const itemId = Number(b.item_id);
      const [ip] = await sql`
        SELECT i.id, i.pedido_id, i.codigo, i.quantidade::float AS quantidade, p.estoque_destino
        FROM producao_itempedido i JOIN producao_pedido p ON p.id = i.pedido_id WHERE i.id = ${ipId}`;
      if (!ip || !ip.estoque_destino) return erro('Item não é de um Pedido de Estoque.', 404);
      const [it] = await sql`SELECT id, codigo_pedido FROM producao_estoque_item WHERE id = ${itemId}`;
      if (!it) return erro('Flange não encontrado.', 404);
      await sql.begin(async (tx) => {
        const t = tx as unknown as Tx;
        await t`INSERT INTO producao_estoque_mov (item_id, local, tipo, quantidade, obs, pedido_id, item_pedido_id, criado_por_nome)
                VALUES (${itemId}, ${ip.estoque_destino}, 'producao', ${ip.quantidade}, 'Entrada de produção (vinculada à mão)', ${ip.pedido_id}, ${ipId}, ${quem})
                ON CONFLICT DO NOTHING`;
        // Guarda o código do pedido no flange, pra próxima vez entrar sozinho.
        if (!it.codigo_pedido && ip.codigo)
          await t`UPDATE producao_estoque_item SET codigo_pedido = ${String(ip.codigo).trim()} WHERE id = ${itemId}`;
      });
      return NextResponse.json({ ok: true });
    }

    // ── Inventário ──────────────────────────────────────────────────────────
    if (acao === 'inv_abrir') {
      const local = String(b.local || '');
      if (!LOCAIS_COD.includes(local)) return erro('Escolha o local.');
      const aberto = await sql`SELECT id FROM producao_estoque_inventario WHERE local = ${local} AND status = 'aberto'`;
      if (aberto.length) return erro('Já tem um inventário aberto nesse local — termine ou cancele ele primeiro.');
      const [v] = await sql`INSERT INTO producao_estoque_inventario (local, obs, criado_por_nome) VALUES (${local}, ${txt(b.obs)}, ${quem}) RETURNING id`;
      return NextResponse.json({ ok: true, id: v.id });
    }
    if (acao === 'inv_salvar' || acao === 'inv_fechar') {
      const id = Number(b.id);
      const [v] = await sql`SELECT * FROM producao_estoque_inventario WHERE id = ${id}`;
      if (!v) return erro('Inventário não encontrado.', 404);
      if (v.status !== 'aberto') return erro('Inventário já fechado.');
      const linhas = (Array.isArray(b.linhas) ? b.linhas : []) as Record<string, unknown>[];
      await sql.begin(async (tx) => {
        const t = tx as unknown as Tx;
        for (const l of linhas) {
          const itemId = Number(l.item_id);
          if (!itemId) continue;
          if (l.contado === null || l.contado === '' || l.contado === undefined) {
            await t`DELETE FROM producao_estoque_inventario_linha WHERE inventario_id = ${id} AND item_id = ${itemId}`;
            continue;
          }
          const c = num(l.contado);
          if (Number.isNaN(c) || c < 0) throw new Error('USR:Quantidade contada inválida.');
          await t`INSERT INTO producao_estoque_inventario_linha (inventario_id, item_id, contado) VALUES (${id}, ${itemId}, ${c})
                  ON CONFLICT (inventario_id, item_id) DO UPDATE SET contado = EXCLUDED.contado`;
        }
        if (acao === 'inv_fechar') {
          const ls = await t`SELECT item_id, contado::float FROM producao_estoque_inventario_linha WHERE inventario_id = ${id}`;
          if (!ls.length) throw new Error('USR:Nenhum flange contado — digite as quantidades antes de fechar.');
          await travarItens(t, ls.map(l => Number(l.item_id)));
          for (const l of ls) {
            const s = await saldo(t, Number(l.item_id), v.local);
            const dif = Number(l.contado) - s;
            await t`UPDATE producao_estoque_inventario_linha SET saldo_sistema = ${s} WHERE inventario_id = ${id} AND item_id = ${l.item_id}`;
            if (Math.abs(dif) > 1e-9)
              await t`INSERT INTO producao_estoque_mov (item_id, local, tipo, quantidade, obs, inventario_id, criado_por_nome)
                      VALUES (${l.item_id}, ${v.local}, 'inventario', ${dif}, ${`Inventário #${id}: contado ${l.contado}, sistema ${s}`}, ${id}, ${quem})`;
          }
          await t`UPDATE producao_estoque_inventario SET status = 'fechado', fechado_em = NOW(), fechado_por_nome = ${quem} WHERE id = ${id}`;
        }
      });
      return NextResponse.json({ ok: true });
    }
    if (acao === 'inv_cancelar') {
      const r = await sql`DELETE FROM producao_estoque_inventario WHERE id = ${Number(b.id)} AND status = 'aberto'`;
      if (!r.count) return erro('Só dá pra cancelar inventário aberto.');
      return NextResponse.json({ ok: true });
    }

    return erro('Ação inválida.');
  } catch (e) {
    const msg = e instanceof Error ? e.message : '';
    if (msg.startsWith('USR:')) return erro(msg.slice(4));
    console.error('[POST /api/estoque]', acao, e);
    return erro('Erro ao salvar no estoque', 500);
  }
}
