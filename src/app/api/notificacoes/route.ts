import { NextResponse } from 'next/server';
import sql from '@/lib/db';
import { autenticar } from '@/lib/middleware';

const ISO_RE = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})?)?$/;

export async function GET(req: Request) {
  const user = await autenticar(req);
  if (user instanceof NextResponse) return user;

  const { searchParams } = new URL(req.url);
  const desdeRaw = searchParams.get('desde');
  const desde = desdeRaw && ISO_RE.test(desdeRaw) ? desdeRaw : null;

  const rows = await sql`
    SELECT m.id, m.criado_em,
           m.setor_origem, m.setor_destino,
           m.status_anterior, m.status_novo,
           i.codigo AS item_codigo,
           p.numero_pedido_venda AS pedido_numero,
           u.nome AS usuario_nome
    FROM producao_movimentacaoitem m
    JOIN producao_itempedido i ON i.id = m.item_id
    JOIN producao_pedido p ON p.id = m.pedido_id
    LEFT JOIN usuarios_usuario u ON u.id = m.usuario_id
    WHERE (${desde}::timestamptz IS NULL OR m.criado_em > ${desde}::timestamptz)
      AND (${user.is_staff} OR m.setor_destino = ${user.setor || ''} OR m.setor_origem = ${user.setor || ''})
    ORDER BY m.criado_em DESC
    LIMIT 20
  `;

  return NextResponse.json({ movimentacoes: rows });
}
