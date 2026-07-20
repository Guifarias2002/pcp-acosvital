import { NextResponse } from 'next/server';
import sql from '@/lib/db';
import { autenticar } from '@/lib/middleware';
import { withTimeout } from '@/lib/queryTimeout';
import { NOMES } from '@/lib/types';

export const dynamic = 'force-dynamic';
export async function GET(req: Request) {
  try {
  const user = await autenticar(req);
  if (user instanceof NextResponse) return user;
  if (!user.is_staff) return NextResponse.json({ erro: 'Sem permissao' }, { status: 403 });

  // Busca líderes (perfil lider) com seus setores
  const qLideres = sql`
    SELECT u.id, u.nome, u.setor
    FROM usuarios_usuario u
    WHERE u.is_active = true AND u.setor IS NOT NULL AND u.setor != ''
    ORDER BY u.nome
  `;

  // Busca itens ativos
  const qItens = sql`
    SELECT i.id, i.codigo, i.descricao, i.quantidade_pendente, i.unidade,
           i.setor_atual, i.status,
           p.numero_pedido_venda, p.cliente, p.prioridade, p.prazo_entrega
    FROM producao_itempedido i
    JOIN producao_pedido p ON p.id = i.pedido_id
    WHERE i.status NOT IN ('entregue', 'emitido') AND i.inativo = false
    ORDER BY p.prazo_entrega ASC
  `;

  const [lideres, itens] = await withTimeout(
    Promise.all([qLideres, qItens]),
    27000, // 27s — Vercel mata em 30s (temporario, ver vercel.json)
    [qLideres, qItens],
  );

  const result = lideres.map(l => {
    const nome = l.nome || 'Sem nome';
    const itensDoSetor = itens
      .filter(i => i.setor_atual === l.setor)
      .map(i => ({
        id: i.id,
        pedido_numero: i.numero_pedido_venda,
        pedido_cliente: i.cliente,
        pedido_prioridade: i.prioridade,
        pedido_prazo: i.prazo_entrega,
        codigo: i.codigo,
        descricao: i.descricao,
        quantidade_pendente: i.quantidade_pendente,
        unidade: i.unidade,
        status: i.status,
      }));
    return {
      id: l.id,
      nome,
      setor: l.setor,
      setor_nome: NOMES[l.setor] || l.setor,
      total_itens: itensDoSetor.length,
      itens: itensDoSetor,
    };
  });

  return NextResponse.json(result);
  } catch (e) {
    console.error('[por-lider]', e);
    return NextResponse.json({ erro: 'Erro interno' }, { status: 500 });
  }
}