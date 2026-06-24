import { NextResponse } from 'next/server';
import sql from '@/lib/db';
import { autenticar } from '@/lib/middleware';

export async function GET(req: Request) {
  const user = await autenticar(req);
  if (user instanceof NextResponse) return user;

  const { searchParams } = new URL(req.url);
  const status = searchParams.get('status') || '';
  const tipo = searchParams.get('tipo') || '';
  const pedidoId = searchParams.get('pedido_id') || '';

  try {
    const rows = await sql`
      SELECT
        d.id, d.pedido_id, d.item_id, d.tipo, d.descricao,
        d.setor_responsavel, d.status, d.prioridade,
        d.observacao_resolucao, d.criado_em, d.resolvido_em, d.atualizado_em,
        p.numero_pedido_venda, p.cliente,
        i.codigo AS item_codigo, i.descricao AS item_descricao,
        u.nome AS usuario_nome,
        r.nome AS resolvido_por_nome
      FROM producao_divergencia d
      JOIN producao_pedido p ON p.id = d.pedido_id
      LEFT JOIN producao_itempedido i ON i.id = d.item_id
      LEFT JOIN usuarios_usuario u ON u.id = d.usuario_id
      LEFT JOIN usuarios_usuario r ON r.id = d.resolvido_por_id
      WHERE 1=1
        ${status ? sql`AND d.status = ${status}` : sql``}
        ${tipo ? sql`AND d.tipo = ${tipo}` : sql``}
        ${pedidoId ? sql`AND d.pedido_id = ${Number(pedidoId)}` : sql``}
      ORDER BY
        CASE d.prioridade WHEN 'urgente' THEN 1 WHEN 'alta' THEN 2 WHEN 'normal' THEN 3 ELSE 4 END,
        d.criado_em DESC
      LIMIT 200
    `;

    const [totais] = await sql`
      SELECT
        COUNT(*) FILTER (WHERE status = 'aberta')     AS abertas,
        COUNT(*) FILTER (WHERE status = 'em_analise') AS em_analise,
        COUNT(*) FILTER (WHERE status = 'resolvida')  AS resolvidas,
        COUNT(*) FILTER (WHERE status = 'cancelada')  AS canceladas,
        COUNT(*)                                       AS total
      FROM producao_divergencia
    `;

    return NextResponse.json({ divergencias: rows, totais });
  } catch {
    // Tabela ainda não criada — retorna vazio sem erro
    return NextResponse.json({
      divergencias: [],
      totais: { abertas: 0, em_analise: 0, resolvidas: 0, canceladas: 0, total: 0 },
    });
  }
}

export async function POST(req: Request) {
  const user = await autenticar(req);
  if (user instanceof NextResponse) return user;

  const body = await req.json().catch(() => ({}));
  const { pedido_id, item_id, tipo, descricao, setor_responsavel, prioridade } = body;

  if (!pedido_id) return NextResponse.json({ erro: 'pedido_id obrigatorio' }, { status: 400 });
  if (!tipo) return NextResponse.json({ erro: 'tipo obrigatorio' }, { status: 400 });
  if (!descricao?.trim()) return NextResponse.json({ erro: 'descricao obrigatoria' }, { status: 400 });

  const TIPOS = ['qualidade', 'quantidade', 'prazo', 'dano', 'documentacao', 'outro'];
  if (!TIPOS.includes(tipo)) return NextResponse.json({ erro: 'tipo invalido' }, { status: 400 });

  const [pedido] = await sql`SELECT id FROM producao_pedido WHERE id = ${pedido_id}`;
  if (!pedido) return NextResponse.json({ erro: 'Pedido nao encontrado' }, { status: 404 });

  const [div] = await sql`
    INSERT INTO producao_divergencia
      (pedido_id, item_id, usuario_id, tipo, descricao, setor_responsavel, prioridade, status, criado_em, atualizado_em)
    VALUES (
      ${pedido_id},
      ${item_id || null},
      ${user.id},
      ${tipo},
      ${descricao.trim()},
      ${setor_responsavel || null},
      ${prioridade || 'normal'},
      'aberta',
      NOW(), NOW()
    )
    RETURNING id
  `;

  // Registra na movimentação do item se item_id foi informado
  if (item_id) {
    const [item] = await sql`SELECT status, setor_atual FROM producao_itempedido WHERE id = ${item_id}`;
    if (item) {
      await sql`
        INSERT INTO producao_movimentacaoitem
          (item_id, pedido_id, usuario_id, setor_origem, setor_destino, status_anterior, status_novo, observacao, criado_em)
        VALUES (
          ${item_id}, ${pedido_id}, ${user.id},
          ${item.setor_atual}, ${item.setor_atual},
          ${item.status}, ${item.status},
          ${`[DIVERGÊNCIA] ${tipo}: ${descricao.trim()}`},
          NOW()
        )
      `;
    }
  }

  return NextResponse.json({ ok: true, id: div.id }, { status: 201 });
}
