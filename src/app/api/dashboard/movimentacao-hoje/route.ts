import { NextResponse } from 'next/server';
import sql from '@/lib/db';
import { autenticar } from '@/lib/middleware';
import { nomeSector } from '@/lib/queries';

export const dynamic = 'force-dynamic';

// % de movimentações (todo o historico) por líder e por setor — usado na TV de movimentação.
export async function GET(req: Request) {
  const user = await autenticar(req);
  if (user instanceof NextResponse) return user;

  const porLider = await sql`
    SELECT u.id AS usuario_id, u.nome AS usuario_nome, COUNT(*)::int AS qtd
    FROM producao_movimentacaoitem m
    JOIN usuarios_usuario u ON u.id = m.usuario_id
    GROUP BY u.id, u.nome
    ORDER BY qtd DESC
  `;

  const porSetor = await sql`
    SELECT COALESCE(m.setor_origem, '') AS setor, COUNT(*)::int AS qtd
    FROM producao_movimentacaoitem m
    WHERE m.setor_origem IS NOT NULL AND m.setor_origem != ''
    GROUP BY m.setor_origem
    ORDER BY qtd DESC
  `;

  const totalLideres = porLider.reduce((s, r) => s + Number(r.qtd), 0);
  const totalSetores = porSetor.reduce((s, r) => s + Number(r.qtd), 0);

  return NextResponse.json({
    lideres: porLider.map(r => ({
      usuario_id: r.usuario_id,
      usuario_nome: r.usuario_nome,
      qtd: Number(r.qtd),
      pct: totalLideres > 0 ? Math.round((Number(r.qtd) / totalLideres) * 1000) / 10 : 0,
    })),
    setores: porSetor.map(r => ({
      setor: r.setor,
      setor_nome: nomeSector(r.setor),
      qtd: Number(r.qtd),
      pct: totalSetores > 0 ? Math.round((Number(r.qtd) / totalSetores) * 1000) / 10 : 0,
    })),
    total_movimentacoes: totalLideres,
    gerado_em: new Date().toISOString(),
  });
}
