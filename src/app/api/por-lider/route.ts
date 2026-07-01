
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
  if (!user.is_staff) return NextResponse.json({ erro: 'Sem permissao' }, { status: 403 });
export const dynamic = 'force-dynamic';

import { autenticar } from '@/lib/middleware';
  // Busca líderes (perfil lider) com seus setores
export const dynamic = 'force-dynamic';
import { autenticar } from '@/lib/middleware';
  const lideres = await sql`
export const dynamic = 'force-dynamic';
import { autenticar } from '@/lib/middleware';
    SELECT u.id, u.nome, u.setor
export const dynamic = 'force-dynamic';
import { autenticar } from '@/lib/middleware';
    FROM usuarios_usuario u
export const dynamic = 'force-dynamic';
import { autenticar } from '@/lib/middleware';
    WHERE u.is_active = true AND u.setor IS NOT NULL AND u.setor != ''
export const dynamic = 'force-dynamic';
import { autenticar } from '@/lib/middleware';
    ORDER BY u.nome
export const dynamic = 'force-dynamic';
import { autenticar } from '@/lib/middleware';
  `;
export const dynamic = 'force-dynamic';

import { autenticar } from '@/lib/middleware';
  // Busca itens ativos
export const dynamic = 'force-dynamic';
import { autenticar } from '@/lib/middleware';
  const itens = await sql`
export const dynamic = 'force-dynamic';
import { autenticar } from '@/lib/middleware';
    SELECT i.id, i.codigo, i.descricao, i.quantidade_pendente, i.unidade,
export const dynamic = 'force-dynamic';
import { autenticar } from '@/lib/middleware';
           i.setor_atual, i.status,
export const dynamic = 'force-dynamic';
import { autenticar } from '@/lib/middleware';
           p.numero_pedido_venda, p.cliente, p.prioridade, p.prazo_entrega
export const dynamic = 'force-dynamic';
import { autenticar } from '@/lib/middleware';
    FROM producao_itempedido i
export const dynamic = 'force-dynamic';
import { autenticar } from '@/lib/middleware';
    JOIN producao_pedido p ON p.id = i.pedido_id
export const dynamic = 'force-dynamic';
import { autenticar } from '@/lib/middleware';
    WHERE i.status NOT IN ('entregue', 'emitido')
export const dynamic = 'force-dynamic';
import { autenticar } from '@/lib/middleware';
    ORDER BY p.prazo_entrega ASC
export const dynamic = 'force-dynamic';
import { autenticar } from '@/lib/middleware';
  `;
export const dynamic = 'force-dynamic';

import { autenticar } from '@/lib/middleware';
  const SETOR_NOMES: Record<string, string> = {
export const dynamic = 'force-dynamic';
import { autenticar } from '@/lib/middleware';
    emissao: 'Emissao de Ordens', compras: 'Compras', recebimento: 'Recebimento',
export const dynamic = 'force-dynamic';
import { autenticar } from '@/lib/middleware';
    estoque: 'Estoque', plasma: 'Corte Plasma', macarico: 'Corte Macarico',
export const dynamic = 'force-dynamic';
import { autenticar } from '@/lib/middleware';
    usinagem: 'Usinagem', beneficiadores: 'Beneficiadores', inspecao: 'Inspecao de Qualidade',
export const dynamic = 'force-dynamic';
import { autenticar } from '@/lib/middleware';
    acabamento: 'Acabamento', embalagem: 'Embalagem', logistica: 'Logistica',
export const dynamic = 'force-dynamic';
import { autenticar } from '@/lib/middleware';
  };
export const dynamic = 'force-dynamic';

import { autenticar } from '@/lib/middleware';
  const result = lideres.map(l => {
export const dynamic = 'force-dynamic';
import { autenticar } from '@/lib/middleware';
    const nome = l.nome || 'Sem nome';
export const dynamic = 'force-dynamic';
import { autenticar } from '@/lib/middleware';
    const itensDoSetor = itens
export const dynamic = 'force-dynamic';
import { autenticar } from '@/lib/middleware';
      .filter(i => i.setor_atual === l.setor)
export const dynamic = 'force-dynamic';
import { autenticar } from '@/lib/middleware';
      .map(i => ({
export const dynamic = 'force-dynamic';
import { autenticar } from '@/lib/middleware';
        id: i.id,
export const dynamic = 'force-dynamic';
import { autenticar } from '@/lib/middleware';
        pedido_numero: i.numero_pedido_venda,
export const dynamic = 'force-dynamic';
import { autenticar } from '@/lib/middleware';
        pedido_cliente: i.cliente,
export const dynamic = 'force-dynamic';
import { autenticar } from '@/lib/middleware';
        pedido_prioridade: i.prioridade,
export const dynamic = 'force-dynamic';
import { autenticar } from '@/lib/middleware';
        pedido_prazo: i.prazo_entrega,
export const dynamic = 'force-dynamic';
import { autenticar } from '@/lib/middleware';
        codigo: i.codigo,
export const dynamic = 'force-dynamic';
import { autenticar } from '@/lib/middleware';
        descricao: i.descricao,
export const dynamic = 'force-dynamic';
import { autenticar } from '@/lib/middleware';
        quantidade_pendente: i.quantidade_pendente,
export const dynamic = 'force-dynamic';
import { autenticar } from '@/lib/middleware';
        unidade: i.unidade,
export const dynamic = 'force-dynamic';
import { autenticar } from '@/lib/middleware';
        status: i.status,
export const dynamic = 'force-dynamic';
import { autenticar } from '@/lib/middleware';
      }));
export const dynamic = 'force-dynamic';
import { autenticar } from '@/lib/middleware';
    return {
export const dynamic = 'force-dynamic';
import { autenticar } from '@/lib/middleware';
      id: l.id,
export const dynamic = 'force-dynamic';
import { autenticar } from '@/lib/middleware';
      nome,
export const dynamic = 'force-dynamic';
import { autenticar } from '@/lib/middleware';
      setor: l.setor,
export const dynamic = 'force-dynamic';
import { autenticar } from '@/lib/middleware';
      setor_nome: SETOR_NOMES[l.setor] || l.setor,
export const dynamic = 'force-dynamic';
import { autenticar } from '@/lib/middleware';
      total_itens: itensDoSetor.length,
export const dynamic = 'force-dynamic';
import { autenticar } from '@/lib/middleware';
      itens: itensDoSetor,
export const dynamic = 'force-dynamic';
import { autenticar } from '@/lib/middleware';
    };
export const dynamic = 'force-dynamic';
import { autenticar } from '@/lib/middleware';
  });
export const dynamic = 'force-dynamic';

import { autenticar } from '@/lib/middleware';
  return NextResponse.json(result);
export const dynamic = 'force-dynamic';
import { autenticar } from '@/lib/middleware';
}
export const dynamic = 'force-dynamic';
