import { NextResponse } from 'next/server';
import sql from '@/lib/db';
import { autenticar } from '@/lib/middleware';
import { podeAcessarHrm } from '@/lib/auth';

export const dynamic = 'force-dynamic';

// Lista as OPs do PCP HRM aguardando CONFERÊNCIA: pedidos "casca" criados pela
// tela Anexar OP — ainda na Emissão, sem itens de produção. Assim que a
// Conferência lança os itens, o pedido sai desta lista (passa a ter item).
export async function GET(req: Request) {
  const user = await autenticar(req);
  if (user instanceof NextResponse) return user;
  if (!podeAcessarHrm(user)) return NextResponse.json({ erro: 'Acesso negado' }, { status: 403 });

  const rows = await sql`
    SELECT p.id, p.numero_pedido_venda, p.numero_op, p.cliente,
           p.prazo_entrega, p.observacoes, p.criado_em,
           (p.ordem_producao_url IS NOT NULL) AS tem_op
    FROM producao_pedido p
    WHERE p.status = 'emitido'
      AND p.setor_atual = 'emissao'
      AND p.roteiro_base @> ARRAY['caldeiraria']::text[]
      AND NOT EXISTS (
        SELECT 1 FROM producao_itempedido i
        WHERE i.pedido_id = p.id AND i.inativo = false
      )
    ORDER BY p.criado_em ASC
  `;
  return NextResponse.json({ ok: true, pedidos: rows });
}
