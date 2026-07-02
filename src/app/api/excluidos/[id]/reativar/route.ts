import { NextResponse } from 'next/server';
import sql from '@/lib/db';
import { autenticar } from '@/lib/middleware';

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const user = await autenticar(req);
  if (user instanceof NextResponse) return user;
  if (!user.is_staff) return NextResponse.json({ erro: 'Sem permissao' }, { status: 403 });

  const id = parseInt(params.id);
  if (isNaN(id)) return NextResponse.json({ erro: 'ID inválido' }, { status: 400 });

  const { modo } = await req.json().catch(() => ({ modo: 'zero' }));
  if (modo !== 'original' && modo !== 'zero') {
    return NextResponse.json({ erro: 'modo deve ser "original" ou "zero"' }, { status: 400 });
  }

  const [registro] = await sql`SELECT * FROM producao_pedido_excluido WHERE id = ${id}`;
  if (!registro) return NextResponse.json({ erro: 'Registro não encontrado' }, { status: 404 });

  const dados = registro.dados_json as Record<string, unknown>;

  // Campos comuns a ambos os modos
  const pv = registro.numero_pedido_venda;
  const op = registro.numero_op;
  const cliente = registro.cliente;
  const prioridade = registro.prioridade || 'normal';
  const prazo = registro.prazo_entrega;
  const valor = registro.valor_total;

  // Campos opcionais do dados_json
  const vendedor = (dados.vendedor as string) || null;
  const observacoes = (dados.observacoes as string) || null;
  const roteiro_base = (dados.roteiro_base as string[]) || ['emissao'];
  const criado_por = user.id;

  let novoPedidoId = 0;

  await sql.begin(async (tx) => {
    if (modo === 'original') {
      const statusOriginal = (dados.status as string) || 'emitido';
      const setorOriginal = (dados.setor_atual as string) || 'emissao';

      const [novo] = await tx`
        INSERT INTO producao_pedido
          (numero_pedido_venda, numero_op, cliente, vendedor, prioridade, status,
           setor_atual, roteiro_base, valor_total, prazo_entrega, observacoes, criado_por_id, criado_em, atualizado_em)
        VALUES (
          ${pv}, ${op}, ${cliente}, ${vendedor}, ${prioridade}, ${statusOriginal},
          ${setorOriginal}, ${JSON.stringify(roteiro_base)}, ${valor || null}, ${prazo || null},
          ${observacoes}, ${criado_por}, NOW(), NOW()
        )
        RETURNING id
      `;
      novoPedidoId = novo.id;
    } else {
      const [novo] = await tx`
        INSERT INTO producao_pedido
          (numero_pedido_venda, numero_op, cliente, vendedor, prioridade, status,
           setor_atual, roteiro_base, valor_total, prazo_entrega, observacoes, criado_por_id, criado_em, atualizado_em)
        VALUES (
          ${pv}, ${op}, ${cliente}, ${vendedor}, ${prioridade}, 'emitido',
          'emissao', ${JSON.stringify(roteiro_base)}, ${valor || null}, ${prazo || null},
          ${observacoes}, ${criado_por}, NOW(), NOW()
        )
        RETURNING id
      `;
      novoPedidoId = novo.id;
    }

    await tx`DELETE FROM producao_pedido_excluido WHERE id = ${id}`;
  });

  return NextResponse.json({
    ok: true,
    pedido_id: novoPedidoId,
    mensagem: modo === 'original'
      ? 'Pedido restaurado ao estado original. Adicione os itens manualmente.'
      : 'Pedido reativado do zero em Emissão. Adicione os itens manualmente.',
  });
}
