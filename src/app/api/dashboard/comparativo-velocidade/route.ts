import { NextResponse } from 'next/server';
import sql from '@/lib/db';
import { autenticar } from '@/lib/middleware';
import { nomeSector } from '@/lib/queries';
import { withTimeout } from '@/lib/queryTimeout';

export const dynamic = 'force-dynamic';

// Comparativo de velocidade da produção (últimos 90 dias) — usado na 4ª tela da
// TV de movimentação. Mede quem/qual é mais rápido ou mais devagar a partir do
// tempo entre a peça CHEGAR num setor e SAIR dele (mesma lógica do relatório
// "Tempo em Cada Área"): o auto-join casa cada entrada (m.setor_destino) com a
// saída seguinte daquele mesmo setor (m2.setor_origem = m.setor_destino).
//   • Setores  → tempo médio que a peça fica parada no setor.
//   • Usuários → tempo médio de resposta: quanto o usuário que ENCAMINHOU a peça
//                (m2.usuario_id) demorou desde a chegada dela.
// Só entram setores/usuários com pelo menos 2 amostras, pra não rankear ruído.
export async function GET(req: Request) {
  try {
    const user = await autenticar(req);
    if (user instanceof NextResponse) return user;

    const qSetores = sql`
      SELECT m.setor_destino AS setor,
             ROUND(AVG(EXTRACT(EPOCH FROM (m2.criado_em - m.criado_em)) / 60))::int AS tempo_medio_min,
             COUNT(*)::int AS amostras
      FROM producao_movimentacaoitem m
      JOIN producao_movimentacaoitem m2
        ON m2.item_id = m.item_id
        AND m2.setor_origem = m.setor_destino
        AND m2.criado_em > m.criado_em
      WHERE m.criado_em >= NOW() - INTERVAL '90 days'
        AND m.setor_destino != ''
      GROUP BY m.setor_destino
      HAVING COUNT(*) >= 2
      ORDER BY tempo_medio_min ASC
    `;

    const qUsuarios = sql`
      SELECT m2.usuario_id AS uid, u.nome AS nome,
             ROUND(AVG(EXTRACT(EPOCH FROM (m2.criado_em - m.criado_em)) / 60))::int AS tempo_medio_min,
             COUNT(*)::int AS amostras
      FROM producao_movimentacaoitem m
      JOIN producao_movimentacaoitem m2
        ON m2.item_id = m.item_id
        AND m2.setor_origem = m.setor_destino
        AND m2.criado_em > m.criado_em
      JOIN usuarios_usuario u ON u.id = m2.usuario_id
      WHERE m.criado_em >= NOW() - INTERVAL '90 days'
        AND m.setor_destino != ''
      GROUP BY m2.usuario_id, u.nome
      HAVING COUNT(*) >= 2
      ORDER BY tempo_medio_min ASC
    `;

    const [setores, usuarios] = await withTimeout(
      Promise.all([qSetores, qUsuarios]),
      27000, // 27s — Vercel mata em 30s (temporário, ver vercel.json)
      [qSetores, qUsuarios],
    );

    return NextResponse.json({
      setores: setores.map(r => ({
        setor: r.setor,
        setor_nome: nomeSector(r.setor),
        tempo_medio_min: Number(r.tempo_medio_min || 0),
        amostras: Number(r.amostras),
      })),
      usuarios: usuarios.map(r => ({
        id: r.uid,
        nome: r.nome || 'Sem nome',
        tempo_medio_min: Number(r.tempo_medio_min || 0),
        amostras: Number(r.amostras),
      })),
    });
  } catch (e) {
    console.error('[comparativo-velocidade]', e);
    return NextResponse.json({ erro: 'Erro ao carregar comparativo de velocidade' }, { status: 500 });
  }
}
