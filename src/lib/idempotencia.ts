/**
 * Idempotência de mutações — proteção contra DUPLICAÇÃO por internet instável.
 *
 * Problema: o operador clica "Enviar"/"Apontar", o servidor PROCESSA, mas a
 * conexão cai antes da resposta chegar. O cliente acha que falhou e reenvia →
 * o servidor executa de novo → parcial/apontamento duplicado. O advisory lock
 * NÃO cobre isso porque as duas requisições são sequenciais no tempo.
 *
 * Solução: o cliente manda um header `Idempotency-Key` estável para a mesma
 * ação (ver src/lib/api.ts). A primeira vez, reservamos a chave e executamos.
 * Um reenvio com a mesma chave recebe o resultado guardado — sem reexecutar.
 *
 * Falha aberta de propósito: qualquer erro no mecanismo (tabela ausente, banco
 * fora) cai no caminho "executa normal", nunca bloqueia a operação real.
 */
import sql from './db';

// Se a chave foi reservada mas o resultado nunca foi gravado (ex.: a instância
// morreu no meio), depois disso a chave é considerada "presa" e liberada para
// nova tentativa. Fica acima do timeout do cliente (35s) com folga.
const PRESO_MS = 45_000;

/** Lê e valida a chave de idempotência do header da requisição. */
export function chaveIdempotencia(req: Request): string | null {
  const k = req.headers.get('Idempotency-Key') || req.headers.get('idempotency-key');
  if (!k) return null;
  // Aceita só tokens simples (uuid/base36) — evita lixo/injeção como chave.
  return /^[A-Za-z0-9_-]{8,120}$/.test(k) ? k : null;
}

/**
 * Executa `handler` no máximo uma vez por `chave`. Sem chave, executa normal
 * (compatível com clientes que não mandam o header).
 */
export async function comIdempotencia(
  chave: string | null,
  ctx: { usuarioId?: number | null; metodo?: string; caminho?: string },
  handler: () => Promise<Response>,
): Promise<Response> {
  if (!chave) return handler();

  // 1) Tenta reservar a chave. ON CONFLICT DO NOTHING → não insere se já existe.
  let reservou: readonly unknown[];
  try {
    reservou = await sql`
      INSERT INTO producao_idempotencia (chave, usuario_id, metodo, caminho)
      VALUES (${chave}, ${ctx.usuarioId ?? null}, ${ctx.metodo ?? null}, ${ctx.caminho ?? null})
      ON CONFLICT (chave) DO NOTHING
      RETURNING chave
    `;
  } catch {
    // Mecanismo indisponível → nunca bloqueia a operação real.
    return handler();
  }

  // 2) Já existia → é reenvio.
  if (reservou.length === 0) {
    let prev: { status_http: number | null; resultado: unknown; presa: boolean } | undefined;
    try {
      const rows = await sql`
        SELECT status_http, resultado,
               (status_http IS NULL AND criado_em < NOW() - ${`${PRESO_MS} milliseconds`}::interval) AS presa
        FROM producao_idempotencia WHERE chave = ${chave}
      `;
      prev = rows[0] as typeof prev;
    } catch {
      return handler();
    }

    if (prev && prev.status_http != null) {
      // Resultado pronto → devolve o mesmo, sem reexecutar.
      return jsonResponse(prev.status_http, prev.resultado, true);
    }
    if (prev && prev.presa) {
      // Reserva presa (instância morreu no meio) → reexecuta e regrava.
      await sql`UPDATE producao_idempotencia SET criado_em = NOW() WHERE chave = ${chave}`.catch(() => {});
      return executarEGravar(chave, handler);
    }
    // Original ainda em andamento → pede pra aguardar (não duplica).
    return jsonResponse(409, { erro: 'Esta ação ainda está sendo processada. Aguarde alguns segundos e recarregue a tela.' }, true);
  }

  // 3) Chave nova → executa de fato.
  return executarEGravar(chave, handler);
}

async function executarEGravar(chave: string, handler: () => Promise<Response>): Promise<Response> {
  let res: Response;
  try {
    res = await handler();
  } catch (e) {
    // Erro real (throw) → libera a chave para permitir nova tentativa.
    await sql`DELETE FROM producao_idempotencia WHERE chave = ${chave}`.catch(() => {});
    throw e;
  }

  try {
    if (res.status < 500) {
      // Resultado determinístico (sucesso ou erro de validação) → guarda p/ replay.
      const body = await res.clone().json().catch(() => null);
      await sql`
        UPDATE producao_idempotencia
        SET status_http = ${res.status}, resultado = ${sql.json(body as never)}
        WHERE chave = ${chave}
      `.catch(() => {});
    } else {
      // 5xx (erro transitório) → não guarda; libera para retry legítimo.
      await sql`DELETE FROM producao_idempotencia WHERE chave = ${chave}`.catch(() => {});
    }
  } catch { /* best-effort: nunca deixa a gravação do cache quebrar a resposta */ }

  return res;
}

function jsonResponse(status: number, body: unknown, replay: boolean): Response {
  return new Response(JSON.stringify(body ?? {}), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...(replay ? { 'X-Idempotent-Replay': 'true' } : {}),
    },
  });
}
