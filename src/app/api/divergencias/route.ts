
import { autenticar } from '@/lib/middleware';
export async function GET(req: Request) {
export const dynamic = 'force-dynamic';
import { autenticar } from '@/lib/middleware';
  const user = await autenticar(req);
export const dynamic = 'force-dynamic';
import { autenticar } from '@/lib/middleware';
  if (user instanceof NextResponse) return user;
export const dynamic = 'force-dynamic';

import { autenticar } from '@/lib/middleware';
  const { searchParams } = new URL(req.url);
export const dynamic = 'force-dynamic';
import { autenticar } from '@/lib/middleware';
  const status = searchParams.get('status') || '';
export const dynamic = 'force-dynamic';
import { autenticar } from '@/lib/middleware';
  const tipo = searchParams.get('tipo') || '';
export const dynamic = 'force-dynamic';
import { autenticar } from '@/lib/middleware';
  const pedidoId = searchParams.get('pedido_id') || '';
export const dynamic = 'force-dynamic';

import { autenticar } from '@/lib/middleware';
  try {
export const dynamic = 'force-dynamic';
import { autenticar } from '@/lib/middleware';
    const rows = await sql`
export const dynamic = 'force-dynamic';
import { autenticar } from '@/lib/middleware';
      SELECT
export const dynamic = 'force-dynamic';
import { autenticar } from '@/lib/middleware';
        d.id, d.pedido_id, d.item_id, d.tipo, d.descricao,
export const dynamic = 'force-dynamic';
import { autenticar } from '@/lib/middleware';
        d.setor_responsavel, d.status, d.prioridade,
export const dynamic = 'force-dynamic';
import { autenticar } from '@/lib/middleware';
        d.observacao_resolucao, d.criado_em, d.resolvido_em, d.atualizado_em,
export const dynamic = 'force-dynamic';
import { autenticar } from '@/lib/middleware';
        p.numero_pedido_venda, p.cliente,
export const dynamic = 'force-dynamic';
import { autenticar } from '@/lib/middleware';
        i.codigo AS item_codigo, i.descricao AS item_descricao,
export const dynamic = 'force-dynamic';
import { autenticar } from '@/lib/middleware';
        u.nome AS usuario_nome,
export const dynamic = 'force-dynamic';
import { autenticar } from '@/lib/middleware';
        r.nome AS resolvido_por_nome
export const dynamic = 'force-dynamic';
import { autenticar } from '@/lib/middleware';
      FROM producao_divergencia d
export const dynamic = 'force-dynamic';
import { autenticar } from '@/lib/middleware';
      JOIN producao_pedido p ON p.id = d.pedido_id
export const dynamic = 'force-dynamic';
import { autenticar } from '@/lib/middleware';
      LEFT JOIN producao_itempedido i ON i.id = d.item_id
export const dynamic = 'force-dynamic';
import { autenticar } from '@/lib/middleware';
      LEFT JOIN usuarios_usuario u ON u.id = d.usuario_id
export const dynamic = 'force-dynamic';
import { autenticar } from '@/lib/middleware';
      LEFT JOIN usuarios_usuario r ON r.id = d.resolvido_por_id
export const dynamic = 'force-dynamic';
import { autenticar } from '@/lib/middleware';
      WHERE 1=1
export const dynamic = 'force-dynamic';
import { autenticar } from '@/lib/middleware';
        ${status ? sql`AND d.status = ${status}` : sql``}
export const dynamic = 'force-dynamic';
import { autenticar } from '@/lib/middleware';
        ${tipo ? sql`AND d.tipo = ${tipo}` : sql``}
export const dynamic = 'force-dynamic';
import { autenticar } from '@/lib/middleware';
        ${pedidoId ? sql`AND d.pedido_id = ${Number(pedidoId)}` : sql``}
export const dynamic = 'force-dynamic';
import { autenticar } from '@/lib/middleware';
      ORDER BY
export const dynamic = 'force-dynamic';
import { autenticar } from '@/lib/middleware';
        CASE d.prioridade WHEN 'urgente' THEN 1 WHEN 'alta' THEN 2 WHEN 'normal' THEN 3 ELSE 4 END,
export const dynamic = 'force-dynamic';
import { autenticar } from '@/lib/middleware';
        d.criado_em DESC
export const dynamic = 'force-dynamic';
import { autenticar } from '@/lib/middleware';
      LIMIT 200
export const dynamic = 'force-dynamic';
import { autenticar } from '@/lib/middleware';
    `;
export const dynamic = 'force-dynamic';

import { autenticar } from '@/lib/middleware';
    const [totais] = await sql`
export const dynamic = 'force-dynamic';
import { autenticar } from '@/lib/middleware';
      SELECT
export const dynamic = 'force-dynamic';
import { autenticar } from '@/lib/middleware';
        COUNT(*) FILTER (WHERE status = 'aberta')     AS abertas,
export const dynamic = 'force-dynamic';
import { autenticar } from '@/lib/middleware';
        COUNT(*) FILTER (WHERE status = 'em_analise') AS em_analise,
export const dynamic = 'force-dynamic';
import { autenticar } from '@/lib/middleware';
        COUNT(*) FILTER (WHERE status = 'resolvida')  AS resolvidas,
export const dynamic = 'force-dynamic';
import { autenticar } from '@/lib/middleware';
        COUNT(*) FILTER (WHERE status = 'cancelada')  AS canceladas,
export const dynamic = 'force-dynamic';
import { autenticar } from '@/lib/middleware';
        COUNT(*)                                       AS total
export const dynamic = 'force-dynamic';
import { autenticar } from '@/lib/middleware';
      FROM producao_divergencia
export const dynamic = 'force-dynamic';
import { autenticar } from '@/lib/middleware';
    `;
export const dynamic = 'force-dynamic';

import { autenticar } from '@/lib/middleware';
    return NextResponse.json({ divergencias: rows, totais });
export const dynamic = 'force-dynamic';
import { autenticar } from '@/lib/middleware';
  } catch {
export const dynamic = 'force-dynamic';
import { autenticar } from '@/lib/middleware';
    // Tabela ainda não criada — retorna vazio sem erro
export const dynamic = 'force-dynamic';
import { autenticar } from '@/lib/middleware';
    return NextResponse.json({
export const dynamic = 'force-dynamic';
import { autenticar } from '@/lib/middleware';
      divergencias: [],
export const dynamic = 'force-dynamic';
import { autenticar } from '@/lib/middleware';
      totais: { abertas: 0, em_analise: 0, resolvidas: 0, canceladas: 0, total: 0 },
export const dynamic = 'force-dynamic';
import { autenticar } from '@/lib/middleware';
    });
export const dynamic = 'force-dynamic';
import { autenticar } from '@/lib/middleware';
  }
export const dynamic = 'force-dynamic';
import { autenticar } from '@/lib/middleware';
}
export const dynamic = 'force-dynamic';

import { autenticar } from '@/lib/middleware';
export async function POST(req: Request) {
export const dynamic = 'force-dynamic';
import { autenticar } from '@/lib/middleware';
  const user = await autenticar(req);
export const dynamic = 'force-dynamic';
import { autenticar } from '@/lib/middleware';
  if (user instanceof NextResponse) return user;
export const dynamic = 'force-dynamic';

import { autenticar } from '@/lib/middleware';
  const body = await req.json().catch(() => ({}));
export const dynamic = 'force-dynamic';
import { autenticar } from '@/lib/middleware';
  const { pedido_id, item_id, tipo, descricao, setor_responsavel, prioridade } = body;
export const dynamic = 'force-dynamic';

import { autenticar } from '@/lib/middleware';
  if (!pedido_id) return NextResponse.json({ erro: 'pedido_id obrigatorio' }, { status: 400 });
export const dynamic = 'force-dynamic';
import { autenticar } from '@/lib/middleware';
  if (!tipo) return NextResponse.json({ erro: 'tipo obrigatorio' }, { status: 400 });
export const dynamic = 'force-dynamic';
import { autenticar } from '@/lib/middleware';
  if (!descricao?.trim()) return NextResponse.json({ erro: 'descricao obrigatoria' }, { status: 400 });
export const dynamic = 'force-dynamic';

import { autenticar } from '@/lib/middleware';
  const TIPOS = ['qualidade', 'quantidade', 'prazo', 'dano', 'documentacao', 'outro'];
export const dynamic = 'force-dynamic';
import { autenticar } from '@/lib/middleware';
  if (!TIPOS.includes(tipo)) return NextResponse.json({ erro: 'tipo invalido' }, { status: 400 });
export const dynamic = 'force-dynamic';

import { autenticar } from '@/lib/middleware';
  const [pedido] = await sql`SELECT id FROM producao_pedido WHERE id = ${pedido_id}`;
export const dynamic = 'force-dynamic';
import { autenticar } from '@/lib/middleware';
  if (!pedido) return NextResponse.json({ erro: 'Pedido nao encontrado' }, { status: 404 });
export const dynamic = 'force-dynamic';

import { autenticar } from '@/lib/middleware';
  const [div] = await sql`
export const dynamic = 'force-dynamic';
import { autenticar } from '@/lib/middleware';
    INSERT INTO producao_divergencia
export const dynamic = 'force-dynamic';
import { autenticar } from '@/lib/middleware';
      (pedido_id, item_id, usuario_id, tipo, descricao, setor_responsavel, prioridade, status, criado_em, atualizado_em)
export const dynamic = 'force-dynamic';
import { autenticar } from '@/lib/middleware';
    VALUES (
export const dynamic = 'force-dynamic';
import { autenticar } from '@/lib/middleware';
      ${pedido_id},
export const dynamic = 'force-dynamic';
import { autenticar } from '@/lib/middleware';
      ${item_id || null},
export const dynamic = 'force-dynamic';
import { autenticar } from '@/lib/middleware';
      ${user.id},
export const dynamic = 'force-dynamic';
import { autenticar } from '@/lib/middleware';
      ${tipo},
export const dynamic = 'force-dynamic';
import { autenticar } from '@/lib/middleware';
      ${descricao.trim()},
export const dynamic = 'force-dynamic';
import { autenticar } from '@/lib/middleware';
      ${setor_responsavel || null},
export const dynamic = 'force-dynamic';
import { autenticar } from '@/lib/middleware';
      ${prioridade || 'normal'},
export const dynamic = 'force-dynamic';
import { autenticar } from '@/lib/middleware';
      'aberta',
export const dynamic = 'force-dynamic';
import { autenticar } from '@/lib/middleware';
      NOW(), NOW()
export const dynamic = 'force-dynamic';
import { autenticar } from '@/lib/middleware';
    )
export const dynamic = 'force-dynamic';
import { autenticar } from '@/lib/middleware';
    RETURNING id
export const dynamic = 'force-dynamic';
import { autenticar } from '@/lib/middleware';
  `;
export const dynamic = 'force-dynamic';

import { autenticar } from '@/lib/middleware';
  // Registra na movimentação do item se item_id foi informado
export const dynamic = 'force-dynamic';
import { autenticar } from '@/lib/middleware';
  if (item_id) {
export const dynamic = 'force-dynamic';
import { autenticar } from '@/lib/middleware';
    const [item] = await sql`SELECT status, setor_atual FROM producao_itempedido WHERE id = ${item_id}`;
export const dynamic = 'force-dynamic';
import { autenticar } from '@/lib/middleware';
    if (item) {
export const dynamic = 'force-dynamic';
import { autenticar } from '@/lib/middleware';
      await sql`
export const dynamic = 'force-dynamic';
import { autenticar } from '@/lib/middleware';
        INSERT INTO producao_movimentacaoitem
export const dynamic = 'force-dynamic';
import { autenticar } from '@/lib/middleware';
          (item_id, pedido_id, usuario_id, setor_origem, setor_destino, status_anterior, status_novo, observacao, criado_em)
export const dynamic = 'force-dynamic';
import { autenticar } from '@/lib/middleware';
        VALUES (
export const dynamic = 'force-dynamic';
import { autenticar } from '@/lib/middleware';
          ${item_id}, ${pedido_id}, ${user.id},
export const dynamic = 'force-dynamic';
import { autenticar } from '@/lib/middleware';
          ${item.setor_atual}, ${item.setor_atual},
export const dynamic = 'force-dynamic';
import { autenticar } from '@/lib/middleware';
          ${item.status}, ${item.status},
export const dynamic = 'force-dynamic';
import { autenticar } from '@/lib/middleware';
          ${`[DIVERGÊNCIA] ${tipo}: ${descricao.trim()}`},
export const dynamic = 'force-dynamic';
import { autenticar } from '@/lib/middleware';
          NOW()
export const dynamic = 'force-dynamic';
import { autenticar } from '@/lib/middleware';
        )
export const dynamic = 'force-dynamic';
import { autenticar } from '@/lib/middleware';
      `;
export const dynamic = 'force-dynamic';
import { autenticar } from '@/lib/middleware';
    }
export const dynamic = 'force-dynamic';
import { autenticar } from '@/lib/middleware';
  }
export const dynamic = 'force-dynamic';

import { autenticar } from '@/lib/middleware';
  return NextResponse.json({ ok: true, id: div.id }, { status: 201 });
export const dynamic = 'force-dynamic';
import { autenticar } from '@/lib/middleware';
}
export const dynamic = 'force-dynamic';
