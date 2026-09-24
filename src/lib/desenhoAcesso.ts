import sql from './db';
import { podeAcessarHrm, type JWTPayload } from './auth';

// Mesma regra da OP (ordem-producao): o perfil HRM (acesso_hrm, sem ser staff)
// pode anexar/remover desenho enquanto o pedido ainda é "casca" (sem item ativo)
// — ou seja, na tela Anexar OP, antes da Conferência. Depois que ganha item,
// volta a exigir is_staff, o que protege os anexos do Flange (sempre têm item).
export async function podeMexerNoDesenho(user: JWTPayload, pedidoId: number): Promise<boolean> {
  if (user.is_staff) return true;
  if (!podeAcessarHrm(user)) return false;
  const [{ tem_item }] = await sql`
    SELECT EXISTS(SELECT 1 FROM producao_itempedido WHERE pedido_id = ${pedidoId} AND inativo = false) AS tem_item
  `;
  return !tem_item;
}

// Nome do arquivo no Backblaze pro desenho: único, plano (sem barras), com o
// nome ORIGINAL no fim (depois de "__") pra mostrar na tela.
export function nomeArquivoDesenho(pedidoId: number, nomeOriginal: string, tipo: string): string {
  const ext = (nomeOriginal.split('.').pop() || tipo.split('/')[1] || 'bin').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 8) || 'bin';
  const base = nomeOriginal.replace(/\.[^.]*$/, '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Za-z0-9._-]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 80) || 'desenho';
  const rnd = Math.random().toString(36).slice(2, 8);
  return `pedido_${pedidoId}_desenho_${Date.now()}_${rnd}__${base}.${ext}`;
}
