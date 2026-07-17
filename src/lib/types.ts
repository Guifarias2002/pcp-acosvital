export const SETOR_CHOICES: [string, string][] = [
  ['emissao', 'Emissao de Ordens'],
  ['usinagem', 'Usinagem'],
  ['maçarico', 'Corte Macarico'],
  ['plasma', 'Corte Plasma'],
  ['laser', 'Corte Laser'],
  ['estoque', 'Estoque'],
  ['furacao', 'Furação'],
  ['qualidade', 'Inspecao de Qualidade'],
  ['acabamento', 'Acabamento'],
  ['logistica', 'Logistica'],
  ['recebimento', 'Recebimento'],
  ['compras', 'Compras'],
  ['beneficiadores', 'Beneficiadores'],
  ['embalagem', 'Embalagem'],
];

export const NOMES: Record<string, string> = Object.fromEntries(SETOR_CHOICES);

// Ordem real do roteiro de produção — usada pra ordenar as colunas dos Kanbans
// (sistema e TV), em vez da ordem do SETOR_CHOICES. Setor fora desta lista
// (ex: emissão, recebimento, compras) vai pro fim, sem sumir. Fonte única:
// mudou o roteiro, muda aqui e reflete nos dois lugares.
export const ORDEM_SETORES = ['estoque', 'maçarico', 'plasma', 'laser', 'usinagem', 'furacao', 'qualidade', 'acabamento', 'embalagem', 'logistica'];
export const posSetorRoteiro = (cod: string) => {
  const i = ORDEM_SETORES.indexOf(cod);
  return i === -1 ? ORDEM_SETORES.length : i;
};

export const STATUS_LABELS: Record<string, string> = {
  emitido: 'Emitido',
  aguardando: 'Aguardando',
  recebido: 'Recebido',
  em_andamento: 'Em Andamento',
  em_producao: 'Em Produção',
  pausado: 'Pausado',
  finalizado_setor: 'Finalizado no Setor',
  em_transito: 'Em Trânsito',
  bloqueado: 'Bloqueado',
  reprovado: 'Reprovado',
  aprovado: 'Aprovado',
  entregue: 'Entregue',
};

// Etapas de negócio: derivadas de status + setor_atual
export type Etapa = 'a_produzir' | 'ag_recebimento' | 'produzindo' | 'mat_concluido' | 'entregue';

// Para uso em itens individuais
export function getEtapa(status: string, setorAtual?: string | null): Etapa {
  if (status === 'entregue') return 'entregue';
  if (setorAtual === 'logistica') return 'mat_concluido';
  if (status === 'emitido') return 'a_produzir';
  if (status === 'aguardando') return 'ag_recebimento';
  return 'produzindo';
}

// Para uso no pedido completo — verifica status real dos itens
export function getPedidoEtapa(pedido: { status: string; setor_atual: string; itens?: { status: string }[]; setores_parciais?: string[] }): Etapa {
  if (pedido.status === 'entregue') return 'entregue';
  // Entrega parcial: algum item já foi entregue mas pedido ainda está aberto
  if ((pedido.itens || []).some(i => i.status === 'entregue')) return 'entregue';
  if (pedido.setor_atual === 'logistica') {
    const itensAtivos = (pedido.itens || []).filter(i => i.status !== 'entregue');
    if (itensAtivos.length > 0 && itensAtivos.every(i => i.status === 'em_transito')) return 'mat_concluido';
    return 'mat_concluido';
  }
  if (pedido.status === 'emitido') return 'a_produzir';
  // Se há parciais ativas em setores, está em produção independente do status dos itens
  if (pedido.setores_parciais && pedido.setores_parciais.length > 0) return 'produzindo';
  const itensAtivos = (pedido.itens || []).filter(i => i.status !== 'entregue');
  if (itensAtivos.length > 0 && itensAtivos.every(i => ['aguardando', 'recebido'].includes(i.status))) {
    return 'ag_recebimento';
  }
  return 'produzindo';
}

export const ETAPA_LABELS: Record<Etapa, string> = {
  a_produzir:    'A Produzir',
  ag_recebimento:'Ag. Recebimento',
  produzindo:    'Produzindo',
  mat_concluido: 'Material Concluído',
  entregue:      'Entregue',
};

export const ETAPA_COR: Record<Etapa, { bg: string; text: string; icon: string }> = {
  a_produzir:    { bg: '#f3f4f6', text: '#374151', icon: 'bi-hourglass' },
  ag_recebimento:{ bg: '#fef3c7', text: '#92400e', icon: 'bi-arrow-down-circle' },
  produzindo:    { bg: '#dbeafe', text: '#1d4ed8', icon: 'bi-gear-fill' },
  mat_concluido: { bg: '#fef9c3', text: '#b45309', icon: 'bi-truck' },
  entregue:      { bg: '#dcfce7', text: '#166534', icon: 'bi-check-circle-fill' },
};

export const COR_STATUS: Record<string, string> = {
  secondary: 'bg-gray-100 text-gray-700',
  warning: 'bg-yellow-100 text-yellow-800',
  info: 'bg-blue-100 text-blue-800',
  primary: 'bg-blue-600 text-white',
  success: 'bg-green-100 text-green-800',
  danger: 'bg-red-100 text-red-800',
  dark: 'bg-gray-800 text-white',
};

export const PRIORIDADE_COR: Record<string, string> = {
  baixa: 'bg-gray-100 text-gray-600',
  normal: 'bg-blue-100 text-blue-700',
  alta: 'bg-orange-100 text-orange-700',
  urgente: 'bg-red-100 text-red-700',
};

// ── Interfaces ────────────────────────────────────────────────────────────────

export interface Usuario {
  id: number;
  username: string;
  nome: string;
  is_staff: boolean;
}

export interface MovimentacaoItem {
  id: number;
  setor_origem: string;
  setor_origem_nome: string;
  setor_destino: string;
  setor_destino_nome: string;
  status_anterior: string;
  status_anterior_display: string;
  status_novo: string;
  status_novo_display: string;
  observacao: string;
  usuario_nome: string;
  criado_em: string;
  // campos extras presentes no feed do dashboard
  numero_pedido_venda?: string;
  item_codigo?: string;
}

export interface LoteItem {
  id: number;
  quantidade: string;
  setor_origem: string;
  setor_origem_nome: string;
  setor_destino: string;
  setor_destino_nome: string;
  status: string;
  criado_em: string;
  recebido_em: string | null;
}

export interface ItemPedido {
  id: number;
  pedido_id: number;
  pedido_numero: string;
  pedido_cliente: string;
  pedido_prazo: string;
  pedido_prioridade: string;
  codigo: string;
  descricao: string;
  quantidade: string;
  unidade: string;
  roteiro_proprio: string[];
  roteiro_efetivo: string[];
  setor_atual: string;
  nome_setor_atual: string;
  status: string;
  cor_status: string;
  status_display: string;
  quantidade_pendente: string;
  quantidade_entregue: string;
  proximo_setor: string | null;
  proximo_setor_nome: string;
  valor_unitario: string | null;
  lotes?: LoteItem[];
  movimentacoes?: MovimentacaoItem[];
  parciais?: ItemParcial[];
  rastreio?: RastreioItem;
  observacoes?: ItemObservacao[];
  tem_pedido_venda?: boolean;
  tem_ordem_producao?: boolean;
  atrasado?: boolean;
}

export interface ItemObservacao {
  id: number;
  setor: string;
  setor_nome: string;
  usuario_nome: string;
  texto: string;
  criado_em: string;
}

export interface Pedido {
  id: number;
  numero_pedido_venda: string;
  numero_op: string;
  cliente: string;
  vendedor: string;
  prazo_entrega: string;
  prioridade: string;
  status: string;
  cor_status: string;
  setor_atual: string;
  nome_setor_atual: string;
  roteiro_base: string[];
  observacoes: string;
  atrasado: boolean;
  dias_prazo: number;
  cor_prazo: string;
  criado_por_nome: string;
  data_emissao: string;
  criado_em: string;
  valor_calculado: string | null;
  valor_total?: string | null;
  atualizado_em?: string;
  setores_parciais?: string[];
  nota_url?: string | null;
  canhoto_url?: string | null;
  anexo_pendente?: boolean;
  tem_desenho?: boolean;
  tem_pedido_venda?: boolean;
  tem_ordem_producao?: boolean;
  itens: ItemPedido[];
}

export interface DashboardData {
  total: number;
  a_produzir: number;
  ag_recebimento: number;
  produzindo: number;
  mat_concluido: number;
  entregues: number;
  atrasados: number;
  urgentes: number;
  bloqueados: number;
  valor_a_produzir: string | null;
  valor_em_producao: string | null;
  valor_concluido: string | null;
  por_setor: { cod: string; nome: string; qtd: number; qtd_chegando: number; valor: string | null; itens: ItemPedido[] }[];
  pedidos_atrasados: Pedido[];
  ultimas_movimentacoes: MovimentacaoItem[];
  pendencias: Pedido[];
}

export interface SetorPainelData {
  setor: string;
  nome: string;
  lotes_chegando: LoteItem[];
  lotes_trabalho: LoteItem[];
  itens: ItemPedido[];
  parciais: ItemParcial[];
  resumo_por_item: ResumoItemParcial[];
}

// ── Parcial (fragmento de quantidade circulando pelo processo) ─────────────

export interface ItemParcial {
  id: number;
  item_pedido_id: number;
  pedido_id: number;
  parcial_origem_id: number | null;
  quantidade: string;
  unidade?: string;
  setor_atual: string;
  setor_atual_nome: string;
  status: 'em_aberto' | 'recebido' | 'em_andamento' | 'em_transito' | 'concluida' | 'cancelada' | 'pausado' | 'finalizado_setor';
  observacao: string | null;
  numero_op?: string;
  item_codigo?: string;
  item_descricao?: string;
  numero_pedido_venda?: string;
  cliente?: string;
  prioridade?: string;
  pedido_prazo?: string;
  quantidade_total_item?: string;
  proximo_setor?: string | null;
  iniciado_em?: string | null;
  concluido_em?: string | null;
  criado_em: string;
  atualizado_em: string;
  retrabalho?: boolean;
  motivo_retrabalho?: string | null;
  devolvido_de?: string | null;
  origem_retrabalho?: boolean;
  origem_motivo_retrabalho?: string | null;
  origem_devolvido_de?: string | null;
  outras_parciais?: { setor: string; setor_nome: string; quantidade: string; unidade: string; status: string; retrabalho: boolean }[];
  observacoes?: ItemObservacao[];
}

export interface ResumoItemParcial {
  item_pedido_id: number;
  pedido_id: number;
  item_codigo: string;
  item_descricao: string;
  numero_pedido_venda: string;
  cliente: string;
  quantidade_total: string;
  unidade: string;
  quantidade_no_setor: string;
  quantidade_em_outros_setores: string;
  quantidade_concluida: string;
  quantidade_cancelada: string;
  total_rastreado: string;
}

export interface RastreioItem {
  quantidade_total: string;
  por_setor: { setor: string; setor_nome: string; quantidade: string; status: string }[];
  quantidade_em_aberto: string;
  quantidade_em_andamento: string;
  quantidade_concluida: string;
  quantidade_cancelada: string;
  total_rastreado: string;
  integro: boolean;
}

// ── Apontamento de Produção ────────────────────────────────────────────────

export interface ApontamentoProducao {
  id: number;
  parcial_id: number;
  item_pedido_id: number;
  pedido_id: number;
  setor: string;
  setor_nome: string;
  quantidade_apontada: string;
  quantidade_aprovada: string;
  quantidade_reprovada: string;
  quantidade_finalizada: string;
  status: 'aberto' | 'em_andamento' | 'finalizado' | 'aprovado' | 'reprovado';
  usuario_nome: string;
  observacao: string | null;
  criado_em: string;
}

export const PARCIAL_STATUS_LABELS: Record<string, string> = {
  em_aberto: 'Em Aberto',
  recebido: 'Recebido',
  em_andamento: 'Em Andamento',
  em_transito: 'Em Rota',
  concluida: 'Concluída',
  cancelada: 'Cancelada',
  pausado: 'Pausado',
  finalizado_setor: 'Finalizado no Setor',
};

export const PARCIAL_STATUS_COR: Record<string, string> = {
  em_aberto: 'bg-gray-100 text-gray-700',
  recebido: 'bg-amber-100 text-amber-800',
  em_andamento: 'bg-blue-100 text-blue-800',
  em_transito: 'bg-cyan-100 text-cyan-800',
  concluida: 'bg-green-100 text-green-800',
  cancelada: 'bg-red-100 text-red-700',
  pausado: 'bg-yellow-100 text-yellow-800',
  finalizado_setor: 'bg-green-100 text-green-800',
};
