// Requisição HRM (M57): o Alan registra a requisição de compra feita no Omie
// (setor 'cald_compras') e acompanha no Recebimento ('caldeiraria') se o
// material vai ser comprado/chegou. Tabela producao_cald_requisicao.
import type { JWTPayload } from './auth';

export type SituacaoReq = 'criada' | 'comprado' | 'nao_comprar' | 'chegou';
export const SITUACOES_REQ: { cod: SituacaoReq; nome: string; cor: string; bg: string; icon: string }[] = [
  { cod: 'criada',      nome: 'Requisição criada',  cor: '#92400e', bg: '#fef3c7', icon: 'bi-hourglass-split' },
  { cod: 'comprado',    nome: 'Comprado',           cor: '#1d4ed8', bg: '#dbeafe', icon: 'bi-cart-check' },
  { cod: 'nao_comprar', nome: 'Não será comprado',  cor: '#475569', bg: '#e2e8f0', icon: 'bi-slash-circle' },
  { cod: 'chegou',      nome: 'Material chegou',    cor: '#166534', bg: '#dcfce7', icon: 'bi-box-seam' },
];
export const SITUACAO_REQ = Object.fromEntries(SITUACOES_REQ.map(s => [s.cod, s])) as Record<SituacaoReq, typeof SITUACOES_REQ[number]>;

// Setores onde a requisição aparece na tela do setor.
export const SETORES_REQUISICAO = ['cald_compras', 'caldeiraria'];

export interface RequisicaoHrm {
  id: number; pedido_id: number; numero: string; data: string | null; itens: number[];
  situacao: SituacaoReq; pedido_compra: string | null; previsao_chegada: string | null; chegou_em: string | null;
  motivo: string | null; obs: string | null; criado_por_nome: string | null; criado_em: string;
  atualizado_por_nome: string | null; atualizado_em: string;
}

// Quem registra/atualiza: staff/administrador, quem confere a Caldeiraria HRM (Alan) ou quem
// tem o setor Requisição HRM / Recebimento no cadastro.
export function podeRegistrarRequisicao(u: JWTPayload | null | undefined): boolean {
  if (!u) return false;
  if (u.is_staff || u.perfil === 'administrador' || u.acesso_conferencia_hrm === true) return true;
  const setores = u.setores?.length ? u.setores : (u.setor ? [u.setor] : []);
  return setores.some(s => SETORES_REQUISICAO.includes(s));
}
