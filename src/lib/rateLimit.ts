// Rate limiting em memória — 60 requisições por IP a cada 60 segundos
const requests = new Map<string, { count: number; resetAt: number }>();

export function checkMutationRateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = requests.get(ip);
  if (!entry || entry.resetAt < now) {
    requests.set(ip, { count: 1, resetAt: now + 60_000 });
    return true;
  }
  if (entry.count >= 60) return false;
  entry.count++;
  return true;
}

export function getClientIp(req: Request): string {
  return req.headers.get('x-forwarded-for')?.split(',')[0].trim()
    || req.headers.get('x-real-ip')
    || 'desconhecido';
}
