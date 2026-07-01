
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
  const url = new URL(req.url);
export const dynamic = 'force-dynamic';
import { autenticar } from '@/lib/middleware';
  const de = url.searchParams.get('de');   // YYYY-MM-DD
export const dynamic = 'force-dynamic';
import { autenticar } from '@/lib/middleware';
  const ate = url.searchParams.get('ate'); // YYYY-MM-DD
export const dynamic = 'force-dynamic';

import { autenticar } from '@/lib/middleware';
  // Filtro de período — aplica nas movimentações e pedidos
export const dynamic = 'force-dynamic';
import { autenticar } from '@/lib/middleware';
  const deFiltro  = de  ? new Date(de + 'T00:00:00') : new Date(new Date().getFullYear(), new Date().getMonth(), 1);
export const dynamic = 'force-dynamic';
import { autenticar } from '@/lib/middleware';
  const ateFiltro = ate ? new Date(ate + 'T23:59:59') : new Date();
export const dynamic = 'force-dynamic';

import { autenticar } from '@/lib/middleware';
  const [
export const dynamic = 'force-dynamic';
import { autenticar } from '@/lib/middleware';
    pedidos,
export const dynamic = 'force-dynamic';
import { autenticar } from '@/lib/middleware';
    movimentacoes,
export const dynamic = 'force-dynamic';
import { autenticar } from '@/lib/middleware';
    temposPorSetor,
export const dynamic = 'force-dynamic';
import { autenticar } from '@/lib/middleware';
    colaboradores,
export const dynamic = 'force-dynamic';
import { autenticar } from '@/lib/middleware';
    divergencias,
export const dynamic = 'force-dynamic';
import { autenticar } from '@/lib/middleware';
  ] = await Promise.all([
export const dynamic = 'force-dynamic';
import { autenticar } from '@/lib/middleware';
    // Pedidos no período (criados ou entregues)
export const dynamic = 'force-dynamic';
import { autenticar } from '@/lib/middleware';
    sql`
export const dynamic = 'force-dynamic';
import { autenticar } from '@/lib/middleware';
      SELECT p.id, p.numero_pedido_venda, p.cliente, p.status, p.prioridade,
export const dynamic = 'force-dynamic';
import { autenticar } from '@/lib/middleware';
             p.criado_em, p.prazo_entrega, p.valor_total,
export const dynamic = 'force-dynamic';
import { autenticar } from '@/lib/middleware';
             COUNT(DISTINCT i.id) AS qtd_itens,
export const dynamic = 'force-dynamic';
import { autenticar } from '@/lib/middleware';
             SUM(i.quantidade_entregue) AS qtd_entregue,
export const dynamic = 'force-dynamic';
import { autenticar } from '@/lib/middleware';
             SUM(i.quantidade) AS qtd_total
export const dynamic = 'force-dynamic';
import { autenticar } from '@/lib/middleware';
      FROM producao_pedido p
export const dynamic = 'force-dynamic';
import { autenticar } from '@/lib/middleware';
      LEFT JOIN producao_itempedido i ON i.pedido_id = p.id
export const dynamic = 'force-dynamic';
import { autenticar } from '@/lib/middleware';
      WHERE p.criado_em BETWEEN ${deFiltro.toISOString()} AND ${ateFiltro.toISOString()}
export const dynamic = 'force-dynamic';
import { autenticar } from '@/lib/middleware';
      GROUP BY p.id ORDER BY p.criado_em DESC
export const dynamic = 'force-dynamic';
import { autenticar } from '@/lib/middleware';
    `,
export const dynamic = 'force-dynamic';

import { autenticar } from '@/lib/middleware';
    // Movimentações por setor no período
export const dynamic = 'force-dynamic';
import { autenticar } from '@/lib/middleware';
    sql`
export const dynamic = 'force-dynamic';
import { autenticar } from '@/lib/middleware';
      SELECT m.setor_destino AS setor,
export const dynamic = 'force-dynamic';
import { autenticar } from '@/lib/middleware';
             COUNT(*) AS total_movs,
export const dynamic = 'force-dynamic';
import { autenticar } from '@/lib/middleware';
             COUNT(DISTINCT m.item_id) AS total_itens,
export const dynamic = 'force-dynamic';
import { autenticar } from '@/lib/middleware';
             COUNT(DISTINCT m.usuario_id) AS total_usuarios
export const dynamic = 'force-dynamic';
import { autenticar } from '@/lib/middleware';
      FROM producao_movimentacaoitem m
export const dynamic = 'force-dynamic';
import { autenticar } from '@/lib/middleware';
      WHERE m.criado_em BETWEEN ${deFiltro.toISOString()} AND ${ateFiltro.toISOString()}
export const dynamic = 'force-dynamic';
import { autenticar } from '@/lib/middleware';
        AND m.setor_destino != ''
export const dynamic = 'force-dynamic';
import { autenticar } from '@/lib/middleware';
      GROUP BY m.setor_destino ORDER BY total_movs DESC
export const dynamic = 'force-dynamic';
import { autenticar } from '@/lib/middleware';
    `,
export const dynamic = 'force-dynamic';

import { autenticar } from '@/lib/middleware';
    // Tempo médio por setor (em minutos)
export const dynamic = 'force-dynamic';
import { autenticar } from '@/lib/middleware';
    sql`
export const dynamic = 'force-dynamic';
import { autenticar } from '@/lib/middleware';
      SELECT m.setor_destino AS setor,
export const dynamic = 'force-dynamic';
import { autenticar } from '@/lib/middleware';
             ROUND(AVG(
export const dynamic = 'force-dynamic';
import { autenticar } from '@/lib/middleware';
               EXTRACT(EPOCH FROM (m2.criado_em - m.criado_em)) / 60
export const dynamic = 'force-dynamic';
import { autenticar } from '@/lib/middleware';
             ))::int AS tempo_medio_min,
export const dynamic = 'force-dynamic';
import { autenticar } from '@/lib/middleware';
             ROUND(SUM(
export const dynamic = 'force-dynamic';
import { autenticar } from '@/lib/middleware';
               EXTRACT(EPOCH FROM (m2.criado_em - m.criado_em)) / 60
export const dynamic = 'force-dynamic';
import { autenticar } from '@/lib/middleware';
             ))::int AS tempo_total_min,
export const dynamic = 'force-dynamic';
import { autenticar } from '@/lib/middleware';
             COUNT(*) AS amostras
export const dynamic = 'force-dynamic';
import { autenticar } from '@/lib/middleware';
      FROM producao_movimentacaoitem m
export const dynamic = 'force-dynamic';
import { autenticar } from '@/lib/middleware';
      JOIN producao_movimentacaoitem m2
export const dynamic = 'force-dynamic';
import { autenticar } from '@/lib/middleware';
        ON m2.item_id = m.item_id
export const dynamic = 'force-dynamic';
import { autenticar } from '@/lib/middleware';
        AND m2.setor_origem = m.setor_destino
export const dynamic = 'force-dynamic';
import { autenticar } from '@/lib/middleware';
        AND m2.criado_em > m.criado_em
export const dynamic = 'force-dynamic';
import { autenticar } from '@/lib/middleware';
      WHERE m.criado_em BETWEEN ${deFiltro.toISOString()} AND ${ateFiltro.toISOString()}
export const dynamic = 'force-dynamic';
import { autenticar } from '@/lib/middleware';
        AND m.setor_destino != ''
export const dynamic = 'force-dynamic';
import { autenticar } from '@/lib/middleware';
      GROUP BY m.setor_destino ORDER BY tempo_total_min DESC
export const dynamic = 'force-dynamic';
import { autenticar } from '@/lib/middleware';
    `,
export const dynamic = 'force-dynamic';

import { autenticar } from '@/lib/middleware';
    // Colaboradores (movimentações por usuário)
export const dynamic = 'force-dynamic';
import { autenticar } from '@/lib/middleware';
    sql`
export const dynamic = 'force-dynamic';
import { autenticar } from '@/lib/middleware';
      SELECT u.id, u.first_name || ' ' || u.last_name AS nome,
export const dynamic = 'force-dynamic';
import { autenticar } from '@/lib/middleware';
             COUNT(m.id) AS total_acoes,
export const dynamic = 'force-dynamic';
import { autenticar } from '@/lib/middleware';
             COUNT(DISTINCT m.item_id) AS itens_movimentados,
export const dynamic = 'force-dynamic';
import { autenticar } from '@/lib/middleware';
             COUNT(DISTINCT m.setor_destino) AS setores_atendidos,
export const dynamic = 'force-dynamic';
import { autenticar } from '@/lib/middleware';
             MIN(m.criado_em) AS primeira_acao,
export const dynamic = 'force-dynamic';
import { autenticar } from '@/lib/middleware';
             MAX(m.criado_em) AS ultima_acao
export const dynamic = 'force-dynamic';
import { autenticar } from '@/lib/middleware';
      FROM auth_user u
export const dynamic = 'force-dynamic';
import { autenticar } from '@/lib/middleware';
      JOIN producao_movimentacaoitem m ON m.usuario_id = u.id
export const dynamic = 'force-dynamic';
import { autenticar } from '@/lib/middleware';
      WHERE m.criado_em BETWEEN ${deFiltro.toISOString()} AND ${ateFiltro.toISOString()}
export const dynamic = 'force-dynamic';
import { autenticar } from '@/lib/middleware';
      GROUP BY u.id, u.first_name, u.last_name
export const dynamic = 'force-dynamic';
import { autenticar } from '@/lib/middleware';
      ORDER BY total_acoes DESC
export const dynamic = 'force-dynamic';
import { autenticar } from '@/lib/middleware';
    `,
export const dynamic = 'force-dynamic';

import { autenticar } from '@/lib/middleware';
    // Divergências no período
export const dynamic = 'force-dynamic';
import { autenticar } from '@/lib/middleware';
    sql`
export const dynamic = 'force-dynamic';
import { autenticar } from '@/lib/middleware';
      SELECT tipo, status, COUNT(*) AS total
export const dynamic = 'force-dynamic';
import { autenticar } from '@/lib/middleware';
      FROM producao_divergencia
export const dynamic = 'force-dynamic';
import { autenticar } from '@/lib/middleware';
      WHERE criado_em BETWEEN ${deFiltro.toISOString()} AND ${ateFiltro.toISOString()}
export const dynamic = 'force-dynamic';
import { autenticar } from '@/lib/middleware';
      GROUP BY tipo, status
export const dynamic = 'force-dynamic';
import { autenticar } from '@/lib/middleware';
    `,
export const dynamic = 'force-dynamic';
import { autenticar } from '@/lib/middleware';
  ]);
export const dynamic = 'force-dynamic';

import { autenticar } from '@/lib/middleware';
  // Resumo de pedidos
export const dynamic = 'force-dynamic';
import { autenticar } from '@/lib/middleware';
  const totalPedidos = pedidos.length;
export const dynamic = 'force-dynamic';
import { autenticar } from '@/lib/middleware';
  const pedidosEntregues = pedidos.filter((p: Record<string, string>) => p.status === 'entregue').length;
export const dynamic = 'force-dynamic';
import { autenticar } from '@/lib/middleware';
  const valorTotal = pedidos.reduce((acc: number, p: Record<string, string>) => acc + Number(p.valor_total || 0), 0);
export const dynamic = 'force-dynamic';

import { autenticar } from '@/lib/middleware';
  return NextResponse.json({
export const dynamic = 'force-dynamic';
import { autenticar } from '@/lib/middleware';
    periodo: { de: deFiltro.toISOString().split('T')[0], ate: ateFiltro.toISOString().split('T')[0] },
export const dynamic = 'force-dynamic';
import { autenticar } from '@/lib/middleware';
    resumo: { total_pedidos: totalPedidos, pedidos_entregues: pedidosEntregues, valor_total: valorTotal.toString() },
export const dynamic = 'force-dynamic';
import { autenticar } from '@/lib/middleware';
    pedidos: pedidos.map((p: Record<string, string>) => ({
export const dynamic = 'force-dynamic';
import { autenticar } from '@/lib/middleware';
      id: p.id, numero: p.numero_pedido_venda, cliente: p.cliente,
export const dynamic = 'force-dynamic';
import { autenticar } from '@/lib/middleware';
      status: p.status, prioridade: p.prioridade,
export const dynamic = 'force-dynamic';
import { autenticar } from '@/lib/middleware';
      criado_em: p.criado_em, prazo_entrega: p.prazo_entrega,
export const dynamic = 'force-dynamic';
import { autenticar } from '@/lib/middleware';
      valor_total: p.valor_total,
export const dynamic = 'force-dynamic';
import { autenticar } from '@/lib/middleware';
      qtd_itens: Number(p.qtd_itens), qtd_entregue: Number(p.qtd_entregue || 0), qtd_total: Number(p.qtd_total || 0),
export const dynamic = 'force-dynamic';
import { autenticar } from '@/lib/middleware';
    })),
export const dynamic = 'force-dynamic';
import { autenticar } from '@/lib/middleware';
    por_setor: movimentacoes.map((m: Record<string, string>) => ({
export const dynamic = 'force-dynamic';
import { autenticar } from '@/lib/middleware';
      setor: m.setor, total_movs: Number(m.total_movs),
export const dynamic = 'force-dynamic';
import { autenticar } from '@/lib/middleware';
      total_itens: Number(m.total_itens), total_usuarios: Number(m.total_usuarios),
export const dynamic = 'force-dynamic';
import { autenticar } from '@/lib/middleware';
    })),
export const dynamic = 'force-dynamic';
import { autenticar } from '@/lib/middleware';
    tempos_por_setor: temposPorSetor.map((t: Record<string, string>) => ({
export const dynamic = 'force-dynamic';
import { autenticar } from '@/lib/middleware';
      setor: t.setor, tempo_medio_min: Number(t.tempo_medio_min || 0),
export const dynamic = 'force-dynamic';
import { autenticar } from '@/lib/middleware';
      tempo_total_min: Number(t.tempo_total_min || 0), amostras: Number(t.amostras),
export const dynamic = 'force-dynamic';
import { autenticar } from '@/lib/middleware';
    })),
export const dynamic = 'force-dynamic';
import { autenticar } from '@/lib/middleware';
    colaboradores: colaboradores.map((c: Record<string, string>) => ({
export const dynamic = 'force-dynamic';
import { autenticar } from '@/lib/middleware';
      id: c.id, nome: c.nome || 'Sem nome',
export const dynamic = 'force-dynamic';
import { autenticar } from '@/lib/middleware';
      total_acoes: Number(c.total_acoes), itens_movimentados: Number(c.itens_movimentados),
export const dynamic = 'force-dynamic';
import { autenticar } from '@/lib/middleware';
      setores_atendidos: Number(c.setores_atendidos),
export const dynamic = 'force-dynamic';
import { autenticar } from '@/lib/middleware';
      primeira_acao: c.primeira_acao, ultima_acao: c.ultima_acao,
export const dynamic = 'force-dynamic';
import { autenticar } from '@/lib/middleware';
    })),
export const dynamic = 'force-dynamic';
import { autenticar } from '@/lib/middleware';
    divergencias: divergencias.map((d: Record<string, string>) => ({
export const dynamic = 'force-dynamic';
import { autenticar } from '@/lib/middleware';
      tipo: d.tipo, status: d.status, total: Number(d.total),
export const dynamic = 'force-dynamic';
import { autenticar } from '@/lib/middleware';
    })),
export const dynamic = 'force-dynamic';
import { autenticar } from '@/lib/middleware';
  });
export const dynamic = 'force-dynamic';
import { autenticar } from '@/lib/middleware';
}
export const dynamic = 'force-dynamic';
