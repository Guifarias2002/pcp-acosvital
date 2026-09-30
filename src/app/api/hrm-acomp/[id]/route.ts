import { NextResponse } from 'next/server';
import sql from '@/lib/db';
import { autenticar } from '@/lib/middleware';
import { podeEditarAcompHrm, podeVerAcompHrm } from '@/lib/auth';
import { comIdempotencia, chaveIdempotencia } from '@/lib/idempotencia';
import { isoValida } from '@/lib/caldPlano';
import { CAMPOS_EDITAVEIS_HRM, CODIGOS_ETAPA_HRM, NOME_CAMPO_HRM, SITUACOES_HRM, txtHrm, type EtapaHrm } from '@/lib/hrmAcomp';
import { carregarHistHrm, carregarItensHrm, registrarHistHrm } from '@/lib/hrmAcompServer';

export const dynamic = 'force-dynamic';

// Uma linha do Acompanhamento HRM.
// GET  → linha + histórico.
// POST → { acao: 'campo', campo, valor }          edita um campo do Alan
//        { acao: 'registrar', tipo, texto }       expedite/ocorrência/obs → histórico datado
//        { acao: 'etapa', codigo, ok }            marca/desmarca etapa à mão

type Ctx = { params: { id: string } };
const idDe = (ctx: Ctx) => { const n = Number(ctx.params.id); return Number.isInteger(n) && n > 0 ? n : null; };

export async function GET(req: Request, ctx: Ctx) {
  const user = await autenticar(req);
  if (user instanceof NextResponse) return user;
  if (!podeVerAcompHrm(user)) return NextResponse.json({ erro: 'Sem permissao' }, { status: 403 });
  const id = idDe(ctx);
  if (!id) return NextResponse.json({ erro: 'ID inválido' }, { status: 400 });
  const [item] = await carregarItensHrm(sql, [id]);
  if (!item) return NextResponse.json({ erro: 'Item não encontrado' }, { status: 404 });
  item.hist = await carregarHistHrm(sql, id);
  return NextResponse.json({ item });
}

export async function POST(req: Request, ctx: Ctx) {
  const user = await autenticar(req);
  if (user instanceof NextResponse) return user;
  if (!podeEditarAcompHrm(user)) return NextResponse.json({ erro: 'Somente visualização — quem lança é o PCP HRM' }, { status: 403 });
  const id = idDe(ctx);
  if (!id) return NextResponse.json({ erro: 'ID inválido' }, { status: 400 });
  const quem = user.nome || user.username;

  return comIdempotencia(chaveIdempotencia(req), { usuarioId: user.id, metodo: 'POST', caminho: `/api/hrm-acomp/${id}` }, async () => {
    let body: Record<string, unknown>;
    try { body = await req.json(); } catch { return NextResponse.json({ erro: 'JSON inválido' }, { status: 400 }); }
    const acao = String(body.acao || '');

    try {
      await sql.begin(async (tx) => {
        const [atual] = await tx`SELECT * FROM producao_hrm_acomp WHERE id = ${id} FOR UPDATE`;
        if (!atual) throw Object.assign(new Error('Item não encontrado'), { status: 404 });

        if (acao === 'campo') {
          const campo = String(body.campo || '');
          const tipo = CAMPOS_EDITAVEIS_HRM[campo];
          if (!tipo) throw Object.assign(new Error('Campo não editável'), { status: 400 });
          let valor: string | null = tipo === 'd' ? isoValida(body.valor) : txtHrm(body.valor);
          if (campo === 'situacao' && valor && !(SITUACOES_HRM as readonly string[]).includes(valor)) valor = null;
          const antes = atual[campo] instanceof Date ? (atual[campo] as Date).toISOString().slice(0, 10) : (atual[campo] ?? null);
          if (String(antes ?? '') === String(valor ?? '')) return;
          await tx.unsafe(`UPDATE producao_hrm_acomp SET ${campo} = $1, atualizado_em = NOW(), atualizado_por_nome = $2 WHERE id = $3`, [valor, quem, id]);
          await registrarHistHrm(tx, id, { tipo: 'alteracao', campo, antes: antes == null ? null : String(antes), depois: valor, origem: 'tela', usuario: quem,
            texto: `${NOME_CAMPO_HRM[campo] || campo}: ${antes ?? '—'} → ${valor ?? '—'}` });
        } else if (acao === 'registrar') {
          const tipo = String(body.tipo || '');
          if (!['expedite', 'ocorrencia', 'obs'].includes(tipo)) throw Object.assign(new Error('Tipo inválido'), { status: 400 });
          const texto = txtHrm(body.texto);
          if (!texto) throw Object.assign(new Error('Escreva o texto'), { status: 400 });
          if (tipo !== 'obs') await tx.unsafe(`UPDATE producao_hrm_acomp SET ${tipo} = $1, atualizado_em = NOW(), atualizado_por_nome = $2 WHERE id = $3`, [texto, quem, id]);
          await registrarHistHrm(tx, id, { tipo, texto, origem: 'tela', usuario: quem });
        } else if (acao === 'etapa') {
          const codigo = String(body.codigo || '');
          if (!CODIGOS_ETAPA_HRM.includes(codigo)) throw Object.assign(new Error('Etapa inválida'), { status: 400 });
          const etapas = { ...(atual.etapas || {}) } as Record<string, EtapaHrm>;
          const ok = body.ok === true;
          if (ok) etapas[codigo] = { ok: true, origem: 'manual', em: new Date().toISOString(), por: quem };
          else delete etapas[codigo];
          await tx`UPDATE producao_hrm_acomp SET etapas = ${tx.json(etapas as never)}, atualizado_em = NOW(), atualizado_por_nome = ${quem} WHERE id = ${id}`;
          await registrarHistHrm(tx, id, { tipo: 'etapa', campo: codigo, depois: ok ? 'ok' : null, origem: 'tela', usuario: quem,
            texto: `Etapa ${codigo} ${ok ? 'marcada' : 'desmarcada'} à mão` });
        } else {
          throw Object.assign(new Error('Ação inválida'), { status: 400 });
        }
      });
      const [item] = await carregarItensHrm(sql, [id]);
      item.hist = await carregarHistHrm(sql, id);
      return NextResponse.json({ ok: true, item });
    } catch (e) {
      const st = (e as { status?: number }).status;
      if (st) return NextResponse.json({ erro: (e as Error).message }, { status: st });
      console.error('[hrm-acomp POST]', e);
      return NextResponse.json({ erro: 'Erro ao salvar' }, { status: 500 });
    }
  });
}
