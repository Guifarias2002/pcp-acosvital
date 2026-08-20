import { NextResponse } from 'next/server';
import sql from '@/lib/db';
import { autenticar } from '@/lib/middleware';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

// Relatório imprimível: pedidos + os materiais (itens) que compõem cada um,
// filtrado pelo MÊS da DATA DE EMISSÃO (de–até) ou "todos". Só admin/PCP (staff).
// Nenhuma API existente entrega vários pedidos COM itens detalhados por
// data_emissao — daí a rota própria. Traz só quantidades (sem valores).
export async function GET(req: Request) {
  const user = await autenticar(req);
  if (user instanceof NextResponse) return user;
  if (!user.is_staff) return NextResponse.json({ erro: 'Sem permissao' }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const todos = searchParams.get('todos') === '1';

  const MES = /^\d{4}-\d{2}$/;
  let inicio: string | null = null;   // primeiro dia do mês "de"
  let fimExcl: string | null = null;  // primeiro dia do mês seguinte ao "até" (exclusivo)

  if (!todos) {
    let de = searchParams.get('de') || '';
    let ate = searchParams.get('ate') || '';
    // Se só um mês vier, usa o mesmo pros dois lados (relatório de 1 mês).
    if (de && !ate) ate = de;
    if (ate && !de) de = ate;
    if (!MES.test(de) || !MES.test(ate))
      return NextResponse.json({ erro: 'Informe o período (mês de/até no formato YYYY-MM) ou use todos=1.' }, { status: 400 });
    // Garante de <= ate (troca se vierem invertidos).
    if (de > ate) { const t = de; de = ate; ate = t; }
    inicio = `${de}-01`;
    const [ay, am] = ate.split('-').map(Number);
    const nY = am === 12 ? ay + 1 : ay;
    const nM = am === 12 ? 1 : am + 1;
    fimExcl = `${nY}-${String(nM).padStart(2, '0')}-01`;
  }

  try {
    const rows = await sql`
      SELECT p.id, p.numero_pedido_venda, p.numero_op, p.cliente, p.vendedor,
             p.data_emissao::text AS data_emissao, p.prazo_entrega::text AS prazo_entrega,
             p.status, p.prioridade,
             COALESCE(
               json_agg(
                 json_build_object(
                   'codigo', i.codigo, 'descricao', i.descricao,
                   'quantidade', i.quantidade::text, 'unidade', i.unidade,
                   'inativo', i.inativo
                 ) ORDER BY i.inativo, i.codigo
               ) FILTER (WHERE i.id IS NOT NULL),
               '[]'
             ) AS itens
      FROM producao_pedido p
      LEFT JOIN producao_itempedido i ON i.pedido_id = p.id
      WHERE (${todos} OR (p.data_emissao >= ${inicio}::date AND p.data_emissao < ${fimExcl}::date))
      GROUP BY p.id
      ORDER BY p.data_emissao ASC NULLS LAST, p.numero_pedido_venda ASC
    `;

    return NextResponse.json({
      pedidos: rows,
      total: rows.length,
      periodo: todos ? 'todos' : { de: inicio, ate_exclusivo: fimExcl },
    });
  } catch (e) {
    console.error('[relatorios/pedidos-itens]', e);
    return NextResponse.json({ erro: 'Erro ao gerar relatório' }, { status: 500 });
  }
}
