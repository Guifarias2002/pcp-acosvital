import { NextResponse } from 'next/server';
import sql from '@/lib/db';
import { autenticar } from '@/lib/middleware';
import { podeAcessarHrm, podeConferirHrm } from '@/lib/auth';
import { checkMutationRateLimit, getClientIp } from '@/lib/rateLimit';
import { runMigrations } from '@/lib/migrations';

export const dynamic = 'force-dynamic';

// POST { area: 'leve'|'pesada'|'outro'|'', area_outro } → grava a ÁREA da OP HRM
// (só informação — não mexe em roteiro). Quem confere (Alan/staff) pode sempre;
// quem só anexa, enquanto a OP ainda aguarda a Conferência.
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const user = await autenticar(req);
  if (user instanceof NextResponse) return user;
  if (!podeAcessarHrm(user)) return NextResponse.json({ erro: 'Sem permissao' }, { status: 403 });
  const id = Number(params.id);
  if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ erro: 'ID invalido' }, { status: 400 });
  const body = await req.json().catch(() => ({})) as { area?: string; area_outro?: string };
  const area = ['leve', 'pesada', 'outro'].includes(String(body.area)) ? String(body.area) : null;
  const outro = area === 'outro' ? (String(body.area_outro || '').trim().slice(0, 80) || null) : null;
  await runMigrations();
  try {
    const [p] = await sql`
      SELECT (status = 'emitido' AND setor_atual = 'emissao'
              AND NOT EXISTS (SELECT 1 FROM producao_itempedido i WHERE i.pedido_id = producao_pedido.id)) AS casca
        FROM producao_pedido WHERE id = ${id}`;
    if (!p) return NextResponse.json({ erro: 'OP não encontrada' }, { status: 404 });
    if (!p.casca && !podeConferirHrm(user)) return NextResponse.json({ erro: 'OP já conferida — quem altera a área é o PCP' }, { status: 403 });
    await sql`UPDATE producao_pedido SET area_hrm = ${area}, area_hrm_outro = ${outro} WHERE id = ${id}`;
    return NextResponse.json({ ok: true, area_hrm: area, area_hrm_outro: outro });
  } catch (e) {
    console.error('[POST /api/pcp-hrm/pedidos/:id]', e);
    return NextResponse.json({ erro: 'Erro ao salvar a área' }, { status: 500 });
  }
}

// DELETE → exclui uma OP anexada pela tela "Anexar OP" que AINDA NÃO foi
// conferida/lançada: pedido "casca" do HRM na Emissão, sem nenhum item de
// produção (mesmo critério da lista da Conferência). Libera quem anexa OP
// (perfil HRM, não só staff) — pra desfazer anexo errado. Depois de lançada pra
// produção, só o admin pelo caminho normal (/api/pedidos/[id]).
// O trigger fn_log_pedido_excluido registra em "Pedidos Excluídos" (recuperável).
export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  const user = await autenticar(req);
  if (user instanceof NextResponse) return user;
  if (!podeAcessarHrm(user)) return NextResponse.json({ erro: 'Sem permissao' }, { status: 403 });
  if (!checkMutationRateLimit(getClientIp(req))) return NextResponse.json({ erro: 'Muitas requisicoes' }, { status: 429 });

  const id = Number(params.id);
  if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ erro: 'ID invalido' }, { status: 400 });

  try {
    const [p] = await sql`
      SELECT p.id, p.numero_pedido_venda,
             (p.status = 'emitido' AND p.setor_atual = 'emissao'
              AND p.roteiro_base @> ARRAY['caldeiraria']::text[]
              AND NOT EXISTS (SELECT 1 FROM producao_itempedido i WHERE i.pedido_id = p.id)) AS casca
        FROM producao_pedido p WHERE p.id = ${id}
    `;
    if (!p) return NextResponse.json({ erro: 'OP não encontrada (talvez já excluída)' }, { status: 404 });
    if (!p.casca) return NextResponse.json({ erro: 'Esta OP já foi conferida/lançada pra produção — peça ao PCP para excluir.' }, { status: 409 });

    await sql.begin(async (tx) => {
      await tx`SELECT set_config('app.usuario_excluindo', ${user.nome || user.username}, true)`;
      await tx`DELETE FROM producao_pedido WHERE id = ${id}`;
    });
    return NextResponse.json({ ok: true, mensagem: `OP ${p.numero_pedido_venda} excluída.` });
  } catch (e) {
    console.error('[DELETE /api/pcp-hrm/pedidos/:id]', e);
    return NextResponse.json({ erro: 'Erro ao excluir a OP' }, { status: 500 });
  }
}
