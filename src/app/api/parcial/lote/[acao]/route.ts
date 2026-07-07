/**
 * POST /api/parcial/lote/[acao]
 *
 * Aplica a mesma acao a varias parciais em UMA unica requisicao HTTP,
 * reduzindo idas e vindas entre navegador e servidor quando o operador
 * usa botoes de lote ("Receber Tudo", "Iniciar", "Pausar", "Retomar" em
 * grupo). Nao reimplementa a logica de negocio: chama diretamente o
 * handler de POST /api/parcial/[id]/acao/[acao] para cada id, em
 * sequencia (mesma carga no banco de hoje, so sem o round-trip extra
 * por item) - qualquer correcao feita naquela rota vale aqui tambem,
 * sem risco de as duas divergirem.
 *
 * Body: { ids: number[], ...demais campos identicos aos da rota individual }
 * Resposta: { ok, total, sucesso, falhas, resultados: [{ id, ok, ... }] }
 */
import { NextResponse } from 'next/server';
import { POST as acaoParcialHandler } from '../../[id]/acao/[acao]/route';
import { checkMutationRateLimit, getClientIp } from '@/lib/rateLimit';

export const dynamic = 'force-dynamic';

const ACOES_LOTE_PERMITIDAS = ['iniciar', 'finalizar', 'pausar', 'retomar', 'receber', 'devolver', 'mover'] as const;
// Abaixo do teto de 60/60s do rate limiter: cada chamada interna por item
// também passa por ele (com uma chave nova por requisição, ver abaixo), e
// um lote maior que o teto seria truncado no meio mesmo sendo legítimo.
const MAX_ITENS_LOTE = 50;

export async function POST(req: Request, { params }: { params: { acao: string } }) {
  const acao = params.acao;
  if (!ACOES_LOTE_PERMITIDAS.includes(acao as typeof ACOES_LOTE_PERMITIDAS[number]))
    return NextResponse.json({ erro: `Acao nao suportada em lote: ${acao}` }, { status: 400 });

  // Um lote conta como UMA mutacao para o IP do usuario, nao uma por item -
  // senao um lote grande (ex: "Receber Tudo" com 60+ parciais) consumiria
  // sozinho todo o orcamento de 60/60s do IP e derrubaria outras acoes dele.
  if (!checkMutationRateLimit(getClientIp(req)))
    return NextResponse.json({ erro: 'Muitas requisicoes' }, { status: 429 });

  const body = await req.json().catch(() => ({}));
  const idsBrutos: number[] = Array.isArray(body.ids)
    ? body.ids.map((v: unknown) => Number(v)).filter((n: number) => Number.isInteger(n) && n > 0)
    : [];
  const ids: number[] = Array.from(new Set(idsBrutos));
  if (ids.length === 0)
    return NextResponse.json({ erro: 'ids obrigatorio (array de IDs de parcial)' }, { status: 400 });
  if (ids.length > MAX_ITENS_LOTE)
    return NextResponse.json({ erro: `Maximo de ${MAX_ITENS_LOTE} itens por lote` }, { status: 400 });

  const { ids: _omit, ...bodyComum } = body;

  // Repassa cookie/authorization (autenticacao) mas NAO o IP real: as chamadas
  // internas por item nao devem consumir o orcamento de rate-limit do usuario
  // (ja cobrado uma vez acima, para a requisicao de lote como um todo). Usa
  // uma chave nova a cada requisicao de lote para nao competir com outra
  // requisicao de lote concorrente nem com o orcamento normal do usuario -
  // essa chave nunca e exposta nem aceita de fora, entao nao da pra falsificar.
  const chaveInterna = `lote-interno:${Math.random().toString(36).slice(2)}`;
  const headersComuns = new Headers({ 'content-type': 'application/json', 'x-forwarded-for': chaveInterna });
  for (const nome of ['cookie', 'authorization']) {
    const valor = req.headers.get(nome);
    if (valor) headersComuns.set(nome, valor);
  }

  const origem = new URL(req.url).origin;
  const resultados: Array<{ id: number; ok: boolean; erro?: string; [k: string]: unknown }> = [];

  // Sequencial (nao Promise.all): mantem o mesmo perfil de carga no banco
  // que o loop anterior no front-end tinha, so sem o round-trip por item.
  for (const id of ids) {
    try {
      const fakeReq = new Request(`${origem}/api/parcial/${id}/acao/${acao}`, {
        method: 'POST',
        headers: headersComuns,
        body: JSON.stringify(bodyComum),
      });
      const res = await acaoParcialHandler(fakeReq, { params: { id: String(id), acao } });
      const data = await res.json().catch(() => ({}));
      if (res.status >= 400) resultados.push({ id, ok: false, erro: data?.erro || `Erro ${res.status}` });
      else resultados.push({ id, ok: true, ...data });
    } catch (e: unknown) {
      resultados.push({ id, ok: false, erro: e instanceof Error ? e.message : String(e) });
    }
  }

  const falhas = resultados.filter(r => !r.ok).length;
  return NextResponse.json({
    ok: falhas === 0,
    total: ids.length,
    sucesso: ids.length - falhas,
    falhas,
    resultados,
  });
}
