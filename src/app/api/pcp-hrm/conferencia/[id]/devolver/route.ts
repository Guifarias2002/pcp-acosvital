import { NextResponse } from 'next/server';
import sql from '@/lib/db';
import { autenticar, logAcesso } from '@/lib/middleware';
import { checkMutationRateLimit, getClientIp } from '@/lib/rateLimit';

export const dynamic = 'force-dynamic';

// POST { motivo } — DEVOLVE uma OP da Caldeiraria HRM já lançada pra
// CONFERÊNCIA (pedido inteiro — decisão 25/09). Desfaz o lançamento sem apagar
// nada: todos os itens ativos do pedido são INATIVADOS (reversível, somem das
// telas de operador junto com as parciais) e o pedido volta ao estado "casca"
// que a lista da Conferência procura (emitido, na Emissão, roteiro_base mínimo
// emissao→caldeiraria, conferência não iniciada). O motivo vai pras observações.
// Barra se: não for staff; tiver item de Flange (OP mista); algo já entregue.
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const user = await autenticar(req);
  if (user instanceof NextResponse) return user;
  if (!user.is_staff && user.perfil !== 'administrador') return NextResponse.json({ erro: 'Só administrador/PCP pode devolver pra Conferência' }, { status: 403 });
  if (!checkMutationRateLimit(getClientIp(req))) return NextResponse.json({ erro: 'Muitas requisicoes' }, { status: 429 });

  const id = Number(params.id);
  if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ erro: 'ID inválido' }, { status: 400 });
  const body = await req.json().catch(() => ({}));
  const motivo = typeof body.motivo === 'string' ? body.motivo.trim().slice(0, 500) : '';
  if (!motivo) return NextResponse.json({ erro: 'Informe o motivo da devolução' }, { status: 400 });
  const quem = user.nome || user.username;

  try {
    const r = await sql.begin(async (tx) => {
      const [ped] = await tx`SELECT id, numero_pedido_venda, observacoes FROM producao_pedido WHERE id = ${id} FOR UPDATE`;
      if (!ped) return { status: 404, erro: 'Pedido não encontrado' };
      const itens = await tx`
        SELECT id, COALESCE(fabrica, 'flange') AS fabrica, COALESCE(quantidade_entregue, 0)::float AS entregue,
               item_pai_id, codigo, descricao, quantidade::float AS quantidade, unidade, roteiro_proprio
        FROM producao_itempedido WHERE pedido_id = ${id} AND inativo = false
        ORDER BY id
      `;
      if (!itens.length) return { status: 400, erro: 'Este pedido não tem itens lançados — ele já está na Conferência' };
      if (itens.some(i => i.fabrica !== 'caldeiraria')) return { status: 409, erro: 'Pedido tem item de Flanges — só OP da Caldeiraria volta pra Conferência' };
      if (itens.some(i => Number(i.entregue) > 0)) return { status: 409, erro: 'Já tem peça entregue neste pedido — não dá pra devolver pra Conferência' };

      // Guarda o que foi LANÇADO (produto + componentes, com o roteiro de cada
      // um) num bloco "[[ROTEIRO_LANCADO]]<json>" — a Conferência reabre já com
      // os setores que tinham sido escolhidos (pedido do usuário 25/09).
      const semEmissao = (r: unknown) => (Array.isArray(r) ? (r as string[]).filter(x => x !== 'emissao') : []);
      const pai = itens.find(i => !i.item_pai_id);
      const vistos = new Set<string>();
      const componentes = itens
        .filter(i => i.item_pai_id && i.item_pai_id === pai?.id)
        .filter(i => { const k = `${i.codigo}|${i.descricao}`; if (vistos.has(k)) return false; vistos.add(k); return true; })
        .map(i => ({ codigo: i.codigo || '', descricao: i.descricao || '', quantidade: String(i.quantidade ?? 1), unidade: i.unidade || 'pc', roteiro: semEmissao(i.roteiro_proprio) }));
      const bloco = pai ? `[[ROTEIRO_LANCADO]]${JSON.stringify({
        produto: {
          codigo: pai.codigo || '',
          descricao: String(pai.descricao || '').replace(/ — Projeto \d+\/\d+$/, ''),
          quantidade: String(pai.quantidade ?? 1), unidade: pai.unidade || 'pc', roteiro: semEmissao(pai.roteiro_proprio),
        },
        componentes,
      })}` : '';

      const motivoItem = `Devolvido pra Conferência: ${motivo}`;
      await tx`
        UPDATE producao_itempedido SET
          inativo = TRUE, inativado_em = NOW(), inativado_por = ${quem},
          motivo_inativacao = ${motivoItem}, atualizado_em = NOW()
        WHERE pedido_id = ${id} AND inativo = false
      `;
      const data = new Date().toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
      const linha = `↩ Devolvido pra Conferência em ${data} por ${quem}: ${motivo}`;
      const obsAnt = String(ped.observacoes || '').split('\n').filter(l => !l.trim().startsWith('[[ROTEIRO_LANCADO]]')).join('\n').trim();
      const obs = [obsAnt, linha, bloco].filter(Boolean).join('\n');
      await tx`
        UPDATE producao_pedido SET
          status = 'emitido', setor_atual = 'emissao',
          roteiro_base = ARRAY['emissao', 'caldeiraria']::text[],
          conferencia_iniciada_em = NULL, conferencia_iniciada_por = NULL,
          observacoes = ${obs}, atualizado_em = NOW()
        WHERE id = ${id}
      `;
      return { status: 200, n: itens.length, numero: ped.numero_pedido_venda as string };
    });
    if (r.status !== 200) return NextResponse.json({ erro: r.erro }, { status: r.status });
    logAcesso(user, req, 'devolver_conferencia_hrm');
    return NextResponse.json({ ok: true, itens_inativados: r.n, mensagem: `Pedido ${r.numero} devolvido pra Conferência (${r.n} item(ns) inativados).` });
  } catch (e) {
    console.error('[POST /api/pcp-hrm/conferencia/:id/devolver]', e);
    return NextResponse.json({ erro: 'Erro ao devolver pra Conferência' }, { status: 500 });
  }
}
