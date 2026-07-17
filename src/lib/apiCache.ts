// Cache em memória por instância serverless — reduz carga no banco (que hoje vive
// saturado no Supabase Nano) servindo o último resultado por alguns segundos, e
// devolvendo o último resultado bom se a query nova falhar/estourar o tempo, em
// vez de quebrar a tela. Mesma ideia já usada inline em /api/dashboard e
// /api/kanban, centralizada aqui para os endpoints de agregado da TV.
//
// Importante: é por instância (cada função serverless tem o seu), então não é um
// cache compartilhado global — mas já corta a maioria das idas ao banco quando a
// mesma instância atende vários polls/abas em sequência, e principalmente evita
// segurar conexões do pool com queries pesadas repetidas.

type Entry = { data: unknown; ts: number };
const store = new Map<string, Entry>();

// Retorna o dado se ainda está "fresco" (dentro de freshMs); senão undefined.
export function getFresh(key: string, freshMs: number): unknown | undefined {
  const e = store.get(key);
  return e && Date.now() - e.ts < freshMs ? e.data : undefined;
}

export function setCache(key: string, data: unknown): void {
  store.set(key, { data, ts: Date.now() });
}

// Fallback de erro: serve o último resultado se ainda estiver dentro de maxStaleMs
// (evita mostrar dado de horas atrás como se fosse bom se o banco cair por muito
// tempo — o "fresco" curto é só para o caminho feliz).
export function getStale(key: string, maxStaleMs: number): unknown | undefined {
  const e = store.get(key);
  return e && Date.now() - e.ts < maxStaleMs ? e.data : undefined;
}
