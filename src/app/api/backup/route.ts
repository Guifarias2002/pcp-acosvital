import { NextResponse } from 'next/server';
import sql from '@/lib/db';
import { autenticar } from '@/lib/middleware';
import * as XLSX from 'xlsx';
import * as fs from 'fs';
import * as path from 'path';

// Backup pode demorar (exporta o banco). Timeout nativo do Next (antes vinha do
// vercel.json, cujo glob "functions" passou a quebrar o build).
export const maxDuration = 30;

const PASTA_BACKUP = 'Z:\\Ordens de Serviço - IAPP\\NOSSO SISTEMA';

export async function POST(req: Request) {
  const user = await autenticar(req);
  if (user instanceof NextResponse) return user;
  if (!user.is_staff) return NextResponse.json({ erro: 'Sem permissao' }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const data = body.data || new Date().toISOString().slice(0, 10); // YYYY-MM-DD

  try {
    // ── 1. Pedidos criados no dia ──────────────────────────────────────────
    const pedidosCriados = await sql`
      SELECT
        p.numero_pedido_venda AS "Pedido",
        p.numero_op           AS "OP",
        p.cliente             AS "Cliente",
        p.vendedor            AS "Vendedor",
        p.prioridade          AS "Prioridade",
        p.status              AS "Status",
        p.setor_atual         AS "Setor Atual",
        p.prazo_entrega::text AS "Prazo",
        p.valor_total::text   AS "Valor (R$)",
        p.criado_em::text     AS "Criado em"
      FROM producao_pedido p
      WHERE p.criado_em::date = ${data}
      ORDER BY p.criado_em
    `;

    // ── 2. Pedidos entregues no dia ────────────────────────────────────────
    const pedidosEntregues = await sql`
      SELECT
        p.numero_pedido_venda AS "Pedido",
        p.cliente             AS "Cliente",
        p.prioridade          AS "Prioridade",
        p.valor_total::text   AS "Valor (R$)",
        e.numero_nf           AS "NF",
        e.observacao          AS "Observação",
        u.nome                AS "Entregue por",
        e.criado_em::text     AS "Entregue em"
      FROM producao_entrega e
      JOIN producao_pedido p ON p.id = e.pedido_id
      LEFT JOIN usuarios_usuario u ON u.id = e.usuario_id
      WHERE e.criado_em::date = ${data}
      ORDER BY e.criado_em
    `;

    // ── 3. Movimentações do dia ────────────────────────────────────────────
    const movimentacoes = await sql`
      SELECT
        p.numero_pedido_venda  AS "Pedido",
        p.cliente              AS "Cliente",
        i.codigo               AS "Item",
        m.setor_origem         AS "De",
        m.setor_destino        AS "Para",
        m.status_anterior      AS "Status Anterior",
        m.status_novo          AS "Status Novo",
        m.observacao           AS "Observação",
        u.nome                 AS "Usuário",
        m.criado_em::text      AS "Data/Hora"
      FROM producao_movimentacaoitem m
      JOIN producao_itempedido i ON i.id = m.item_id
      JOIN producao_pedido p ON p.id = m.pedido_id
      LEFT JOIN usuarios_usuario u ON u.id = m.usuario_id
      WHERE m.criado_em::date = ${data}
      ORDER BY m.criado_em
    `;

    // ── 4. Snapshot de todos os pedidos em aberto ──────────────────────────
    const emAberto = await sql`
      SELECT
        p.numero_pedido_venda AS "Pedido",
        p.numero_op           AS "OP",
        p.cliente             AS "Cliente",
        p.prioridade          AS "Prioridade",
        p.status              AS "Status",
        p.setor_atual         AS "Setor Atual",
        p.prazo_entrega::text AS "Prazo",
        p.valor_total::text   AS "Valor (R$)",
        COUNT(i.id)           AS "Total Itens",
        COUNT(i.id) FILTER (WHERE i.status = 'entregue') AS "Itens Entregues"
      FROM producao_pedido p
      LEFT JOIN producao_itempedido i ON i.pedido_id = p.id
      WHERE p.status != 'entregue'
      GROUP BY p.id
      ORDER BY p.prazo_entrega, p.prioridade
    `;

    // ── 5. Divergências abertas ────────────────────────────────────────────
    let divergencias: object[] = [];
    try {
      divergencias = (await sql`
        SELECT
          p.numero_pedido_venda AS "Pedido",
          p.cliente             AS "Cliente",
          d.tipo                AS "Tipo",
          d.prioridade          AS "Prioridade",
          d.status              AS "Status",
          d.descricao           AS "Descrição",
          u.nome                AS "Reportado por",
          d.criado_em::text     AS "Data"
        FROM producao_divergencia d
        JOIN producao_pedido p ON p.id = d.pedido_id
        LEFT JOIN usuarios_usuario u ON u.id = d.usuario_id
        WHERE d.status IN ('aberta', 'em_analise')
        ORDER BY d.prioridade, d.criado_em
      `) as object[];
    } catch { /* tabela pode não existir */ }

    // ── Monta o Excel com abas ─────────────────────────────────────────────
    const wb = XLSX.utils.book_new();

    const addSheet = (nome: string, rows: object[]) => {
      if (rows.length === 0) {
        const ws = XLSX.utils.aoa_to_sheet([['Nenhum registro para esta data.']]);
        XLSX.utils.book_append_sheet(wb, ws, nome);
      } else {
        const ws = XLSX.utils.json_to_sheet(rows);
        // Largura automática das colunas
        const cols = Object.keys(rows[0] as object).map(k => ({ wch: Math.max(k.length, 14) }));
        ws['!cols'] = cols;
        XLSX.utils.book_append_sheet(wb, ws, nome);
      }
    };

    addSheet('Pedidos Criados', pedidosCriados);
    addSheet('Pedidos Entregues', pedidosEntregues);
    addSheet('Movimentações', movimentacoes);
    addSheet('Em Aberto', emAberto);
    if (divergencias.length > 0) addSheet('Divergências', divergencias);

    // ── Salva na pasta da rede ─────────────────────────────────────────────
    let salvoNaRede = false;
    let caminhoArquivo = '';
    try {
      if (!fs.existsSync(PASTA_BACKUP)) {
        fs.mkdirSync(PASTA_BACKUP, { recursive: true });
      }
      const nomeArquivo = `backup_diario.xlsx`;
      caminhoArquivo = path.join(PASTA_BACKUP, nomeArquivo);
      const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
      fs.writeFileSync(caminhoArquivo, buffer);
      salvoNaRede = true;
    } catch (e) {
      console.error('[backup] Erro ao salvar na rede:', e);
    }

    // ── Retorna o arquivo para download também ─────────────────────────────
    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

    return new Response(buffer, {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="backup_${data}.xlsx"`,
        'X-Salvo-Na-Rede': salvoNaRede ? 'true' : 'false',
        'X-Caminho': caminhoArquivo,
        'X-Resumo': JSON.stringify({
          pedidos_criados: pedidosCriados.length,
          pedidos_entregues: pedidosEntregues.length,
          movimentacoes: movimentacoes.length,
          em_aberto: emAberto.length,
          divergencias: divergencias.length,
        }),
      },
    });
  } catch (e) {
    console.error('[backup]', e);
    return NextResponse.json({ erro: String(e) }, { status: 500 });
  }
}
