// Estoque de FLANGES (aba "Estoque" do /planejamento). Constantes e tipos
// compartilhados entre a API (/api/estoque) e a tela (EstoqueFlanges).
//
// Dois locais: ARUJÁ (produção — onde fica a usinagem) e MOGI (estoque de
// flanges de lá). Saldo = soma de producao_estoque_mov não cancelados, por
// flange e local. Tipos de movimentação (quantidade com sinal):
//   entrada        (+) lançamento manual
//   producao       (+) automática: item de "Pedido de Estoque" passou do acabamento
//   saida          (−) lançamento manual
//   baixa_pedido   (−) pedido atendido pelo estoque (sai do setor Estoque)
//   transf_saida   (−) / transf_entrada (+) — transferência entre locais (mesmo `grupo`)
//   inventario     (±) ajuste ao fechar um inventário (contado − saldo)

export const LOCAIS_ESTOQUE = [
  { cod: 'aruja', nome: 'Estoque Arujá' },
  { cod: 'mogi', nome: 'Estoque Mogi' },
] as const;
export type LocalEstoque = typeof LOCAIS_ESTOQUE[number]['cod'];
export const LOCAIS_COD: string[] = LOCAIS_ESTOQUE.map(l => l.cod);
export const nomeLocal = (c: string | null | undefined) =>
  LOCAIS_ESTOQUE.find(l => l.cod === c)?.nome ?? (c || '—');

export const TIPOS_MOV: Record<string, { nome: string; cor: string; icon: string }> = {
  entrada:        { nome: 'Entrada',              cor: '#16a34a', icon: 'bi-box-arrow-in-down' },
  producao:       { nome: 'Entrada de produção',  cor: '#0d9488', icon: 'bi-gear-fill' },
  saida:          { nome: 'Saída',                cor: '#dc2626', icon: 'bi-box-arrow-up' },
  baixa_pedido:   { nome: 'Baixa por pedido',     cor: '#d97706', icon: 'bi-cart-check' },
  transf_saida:   { nome: 'Transferência (saiu)', cor: '#7c3aed', icon: 'bi-arrow-left-right' },
  transf_entrada: { nome: 'Transferência (entrou)', cor: '#7c3aed', icon: 'bi-arrow-left-right' },
  inventario:     { nome: 'Ajuste de inventário', cor: '#1d4ed8', icon: 'bi-clipboard-check' },
};

export interface ItemEstoque {
  id: number;
  codigo: string;
  codigo_pedido: string | null;
  descricao: string;
  unidade: string;
  estoque_minimo: number | null;
  ativo: boolean;
  saldo_aruja: number;
  saldo_mogi: number;
}

export interface MovEstoque {
  id: number;
  item_id: number;
  codigo: string;
  descricao: string;
  local: string;
  tipo: string;
  quantidade: number;
  obs: string | null;
  numero_pedido_venda: string | null;
  atendimento_id: number | null;
  inventario_id: number | null;
  grupo: string | null;
  criado_por_nome: string | null;
  criado_em: string;
  cancelado_em: string | null;
  cancelado_por_nome: string | null;
}

// Parcial de Flange parada no setor Estoque (a lista "Pedidos no Estoque").
export interface PecaNoEstoque {
  parcial_id: number;
  item_pedido_id: number;
  pedido_id: number;
  numero_pedido_venda: string;
  cliente: string;
  codigo: string;
  descricao: string;
  unidade: string;
  quantidade: number;
  status: string;
  roteiro: string[];
  proximo_setor: string | null;
  sugestao_item_id: number | null;
  pedido_estoque: string | null;
}

// Item de "Pedido de Estoque" que já passou do acabamento mas não achou flange
// cadastrado pelo código — precisa de vínculo manual pra entrar no saldo.
export interface PendenciaVinculo {
  item_pedido_id: number;
  pedido_id: number;
  numero_pedido_venda: string;
  codigo: string;
  descricao: string;
  quantidade: number;
  local: string;
  pronto_em: string;
}

export interface PedidoEstoque {
  pedido_id: number;
  numero_pedido_venda: string;
  cliente: string;
  local: string;
  itens: number;
  pecas: number;
  pecas_entradas: number;
}

export interface InventarioResumo {
  id: number;
  local: string;
  obs: string | null;
  status: 'aberto' | 'fechado';
  criado_por_nome: string | null;
  criado_em: string;
  fechado_em: string | null;
  fechado_por_nome: string | null;
  linhas: number;
  ajustes: number;
}

export const normCodigo = (c: string | null | undefined) => (c || '').trim().toUpperCase();
