import { NextResponse } from 'next/server';
import sql from '@/lib/db';
import { autenticar, logAcesso } from '@/lib/middleware';
import { podeVerAnalise } from '@/lib/auth';

export const dynamic = 'force-dynamic';

// ── Parâmetros de PCP: capacidade por máquina + meta de demanda ──────────────
// GET: lista as máquinas (as que têm apontamento + as já cadastradas) com a
// jornada salva (ou padrão 8h/5 dias) e a meta mensal. POST: regrava. Ver leitura
// só quem vê a Análise; EDITAR (POST) só staff (admin/PCP).

export async function GET(req: Request) {
  const user = await autenticar(req);
  if (user instanceof NextResponse) return user;
  if (!podeVerAnalise(user)) return NextResponse.json({ erro: 'Sem permissao' }, { status: 403 });
  try {
    const [maquinas, cfg] = await Promise.all([
      sql`
        WITH usadas AS (
          SELECT DISTINCT maquina FROM producao_itemparcial WHERE maquina IS NOT NULL AND maquina <> ''
        ),
        todas AS (
          SELECT maquina FROM usadas
          UNION SELECT maquina FROM producao_maquina_capacidade
        )
        SELECT t.maquina,
               COALESCE(c.horas_dia, 8)::float   AS horas_dia,
               COALESCE(c.dias_semana, 5)::int    AS dias_semana,
               (c.maquina IS NOT NULL)            AS cadastrada,
               EXISTS (SELECT 1 FROM usadas u WHERE u.maquina = t.maquina) AS usada
        FROM todas t
        LEFT JOIN producao_maquina_capacidade c ON c.maquina = t.maquina
        ORDER BY usada DESC, t.maquina
      `,
      sql`SELECT valor FROM producao_config WHERE chave = 'meta_mensal_un'`,
    ]);
    const meta = cfg[0]?.valor ? Number(cfg[0].valor) : null;
    return NextResponse.json({ maquinas, meta_mensal_un: Number.isFinite(meta as number) ? meta : null });
  } catch (e) {
    console.error('[analise/parametros GET]', e);
    return NextResponse.json({ maquinas: [], meta_mensal_un: null });
  }
}

export async function POST(req: Request) {
  const user = await autenticar(req);
  if (user instanceof NextResponse) return user;
  // Editar parâmetros de fábrica: só staff (admin/PCP).
  if (!user.is_staff) return NextResponse.json({ erro: 'Sem permissao' }, { status: 403 });
  logAcesso(user, req, 'salvar_parametros_pcp');

  try {
    const body = await req.json().catch(() => ({}));
    const maquinas = Array.isArray(body.maquinas) ? body.maquinas : [];
    const meta = body.meta_mensal_un;

    await sql.begin(async (tx) => {
      for (const m of maquinas.slice(0, 200)) {
        const nome = typeof m?.maquina === 'string' ? m.maquina.trim() : '';
        if (!nome) continue;
        // Jornada sanitizada: horas 0–24, dias 0–7.
        const horas = Math.max(0, Math.min(24, Number(m.horas_dia)));
        const dias = Math.max(0, Math.min(7, Math.round(Number(m.dias_semana))));
        if (!Number.isFinite(horas) || !Number.isFinite(dias)) continue;
        await tx`
          INSERT INTO producao_maquina_capacidade (maquina, horas_dia, dias_semana, atualizado_em, atualizado_por_id)
          VALUES (${nome}, ${horas}, ${dias}, NOW(), ${user.id})
          ON CONFLICT (maquina) DO UPDATE
            SET horas_dia = EXCLUDED.horas_dia, dias_semana = EXCLUDED.dias_semana,
                atualizado_em = NOW(), atualizado_por_id = ${user.id}
        `;
      }
      // Meta mensal (unidades). Vazio/null limpa.
      const metaNum = meta === '' || meta == null ? null : Number(meta);
      if (metaNum != null && Number.isFinite(metaNum) && metaNum >= 0) {
        await tx`
          INSERT INTO producao_config (chave, valor, atualizado_em, atualizado_por_id)
          VALUES ('meta_mensal_un', ${String(Math.round(metaNum))}, NOW(), ${user.id})
          ON CONFLICT (chave) DO UPDATE SET valor = EXCLUDED.valor, atualizado_em = NOW(), atualizado_por_id = ${user.id}
        `;
      } else if (meta === '' || meta === null) {
        await tx`DELETE FROM producao_config WHERE chave = 'meta_mensal_un'`;
      }
    });

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('[analise/parametros POST]', e);
    return NextResponse.json({ erro: 'Erro ao salvar os parâmetros' }, { status: 500 });
  }
}
