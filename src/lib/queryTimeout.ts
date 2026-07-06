// Timeout server-side: garante resposta antes do Vercel matar a função.
// Cancela as queries ainda pendentes quando o timeout vence a corrida — sem isso, elas
// continuam rodando no banco e prendem conexões do pool sob lentidão do banco.
export function withTimeout<T>(promise: Promise<T>, ms: number, cancelables: { cancel: () => void }[] = []): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      for (const q of cancelables) { try { q.cancel(); } catch { /* já finalizada */ } }
      reject(new Error('timeout'));
    }, ms);
    promise.then(
      (v) => { clearTimeout(timer); resolve(v); },
      (e) => { clearTimeout(timer); reject(e); },
    );
  });
}
