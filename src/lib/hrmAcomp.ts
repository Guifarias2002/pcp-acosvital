// Acompanhamento HRM — a planilha "SPR SJP TAUBATE Base Dados Acompanhamento"
// do PCP HRM (Alan) dentro do sistema. 1 linha por item (OP HRM + item do PO do
// cliente, ou pedido + material quando não tem OP). O Alan CONTINUA com a planilha
// dele e SOBE quando quiser atualizar: o upload só mexe nos campos do Alan,
// célula vazia não apaga, linha nova/apagada não cria/apaga item em produção, e
// a linha original inteira fica guardada em `planilha_raw` (nada se perde).
// Tabelas: producao_hrm_acomp / producao_hrm_acomp_hist (migration M63).
// Compartilhado cliente/servidor — sem imports de servidor aqui.

export const ETAPAS_HRM: { codigo: string; nome: string; coluna: string }[] = [
  { codigo: 'compra',        nome: 'Compra',                coluna: 'Compra' },
  { codigo: 'desenho',       nome: 'Desenho',               coluna: 'Desenho' },
  { codigo: 'corte_serra',   nome: 'Corte Serra',           coluna: 'Corte Serra' },
  { codigo: 'corte_cnc',     nome: 'Corte CNC',             coluna: 'Corte CNC' },
  { codigo: 'preparacao',    nome: 'Preparação / Recortes', coluna: 'Preparaçaõ / Recortes' },
  { codigo: 'conformacao',   nome: 'Conformação Externa',   coluna: 'Conformação Externa' },
  { codigo: 'usinagem',      nome: 'Usinagem',              coluna: 'Usinagem' },
  { codigo: 'montagem',      nome: 'Montagem',              coluna: 'Montagem' },
  { codigo: 'solda',         nome: 'Solda',                 coluna: 'Solda' },
  { codigo: 'end',           nome: 'END (UT / LP / PM)',    coluna: 'End UT LP PM' },
  { codigo: 'insp_visual',   nome: 'Inspeção Visual',       coluna: 'Inspeçao Visual' },
  { codigo: 'retrabalho',    nome: 'Retrabalho',            coluna: 'Retrabalho' },
  { codigo: 'revestimento',  nome: 'Revestimento',          coluna: 'Revestimento' },
  { codigo: 'insp_final',    nome: 'Inspeção Final',        coluna: 'Inspeção Final' },
  { codigo: 'entrega',       nome: 'Entrega ou Coleta',     coluna: 'Entrega ou Coleta' },
];
export const CODIGOS_ETAPA_HRM = ETAPAS_HRM.map(e => e.codigo);

// Situações fixas (substituem os ~30 textos livres do "Priorizar"); o texto
// original fica em situacao_detalhe.
export const SITUACOES_HRM = [
  'Solicitar MP', 'Em compra de MP', 'Em corte', 'Em usinagem', 'Ag. montagem',
  'Em caldeiraria (montagem/solda)', 'Em serviço externo', 'Em pintura', 'Ag. inspeção',
  'Ag. aprovação do book', 'Ag. coleta / expedição', 'Entregue',
] as const;

export const COORDENADORES_HRM = ['Cleber', 'Hermes'];

// Área da OP HRM (producao_pedido.area_hrm) — só INFORMAÇÃO pra saber onde a
// peça está; não muda roteiro nem fábrica. 'outro' + area_hrm_outro = qual setor.
export const AREAS_HRM: { codigo: 'leve' | 'pesada' | 'outro'; nome: string; cor: string }[] = [
  { codigo: 'leve',   nome: 'Caldeiraria Leve',   cor: '#0891b2' },
  { codigo: 'pesada', nome: 'Caldeiraria Pesada', cor: '#b45309' },
  { codigo: 'outro',  nome: 'Outro setor',        cor: '#6d28d9' },
];
export function nomeAreaHrm(area: string | null | undefined, outro?: string | null): string {
  if (area === 'outro') return outro ? `Outro: ${outro}` : 'Outro setor';
  return AREAS_HRM.find(a => a.codigo === area)?.nome || '';
}

/** Texto livre do "Priorizar" → situação fixa ('' quando não reconhece). */
export function mapearSituacao(texto: string | null | undefined): string {
  const t = (texto || '').toLowerCase();
  if (!t.trim()) return '';
  if (t.includes('entregue')) return 'Entregue';
  if (t.includes('coleta') || t.includes('expedi')) return 'Ag. coleta / expedição';
  if (t.includes('book')) return 'Ag. aprovação do book';
  if (t.includes('inspe') && !t.includes('caldeiraria') && !t.includes('solda')) return 'Ag. inspeção';
  if (t.includes('pintura')) return 'Em pintura';
  if (t.includes('revestimento')) return 'Em serviço externo';
  if (t.includes('montagem') && t.trim().startsWith('ag')) return 'Ag. montagem';
  if (t.includes('cortado')) return 'Ag. montagem';
  if (t.includes('usinag') && !t.includes('caldeiraria')) return 'Em usinagem';
  if (t.includes('caldeiraria') || t.includes('solda') || t.includes('montagem')) return 'Em caldeiraria (montagem/solda)';
  if (t.includes('corte')) return 'Em corte';
  if (t.includes('solicitar')) return 'Solicitar MP';
  if (t.includes('compra') || t.includes('mp')) return 'Em compra de MP';
  return '';
}

export interface EtapaHrm { ok: boolean; origem: 'planilha' | 'manual'; em?: string; por?: string; texto?: string }

export interface ItemHrm {
  id: number;
  chave: string;
  op_hrm: string | null;
  item: string | null;
  po_item: string | null;
  pedido_omie: string | null;
  ns: string | null;
  material: string | null;
  descricao: string | null;
  quantidade: string | null;
  destino: string | null;
  vendedor: string | null;
  coordenador: string | null;
  caldeireiros: string | null;
  mp_obs: string | null;
  necessidade: string | null;
  conf_delv: string | null;
  prev_faturamento: string | null;
  prev_final: string | null;
  finalizado_em: string | null;
  situacao: string | null;
  situacao_detalhe: string | null;
  expedite: string | null;
  ocorrencia: string | null;
  obs: string | null;
  prioridade: string | null;
  prioridade_skid: string | null;
  seq_cliente: string | null;
  seq_oss: string | null;
  tinta: string | null;
  tinta_qtd: string | null;
  tinta_estoque: string | null;
  etapas: Record<string, EtapaHrm>;
  planilha_raw: Record<string, unknown> | null;
  pedido_id: number | null;
  area_hrm?: string | null;       // da OP ligada (Anexar OP / Conferência)
  area_hrm_outro?: string | null;
  croqui_codigo?: string | null;  // tem croqui (producao_croqui) pro material
  croqui_versao?: string | null;
  ordem_planilha: number | null;
  atualizado_em: string;
  atualizado_por_nome: string | null;
  hist?: HistHrm[];
}

export interface HistHrm { id: number; tipo: string; campo: string | null; antes: string | null; depois: string | null; texto: string | null; origem: string; usuario_nome: string | null; criado_em: string }

// Campos que o Alan edita (tela e upload). Tipo 'd' = data ISO.
export const CAMPOS_EDITAVEIS_HRM: Record<string, 't' | 'd'> = {
  po_item: 't', destino: 't', vendedor: 't', coordenador: 't', caldeireiros: 't', mp_obs: 't',
  necessidade: 'd', conf_delv: 'd', prev_faturamento: 'd', prev_final: 'd', finalizado_em: 'd',
  situacao: 't', situacao_detalhe: 't', obs: 't',
  prioridade: 't', prioridade_skid: 't', seq_cliente: 't', seq_oss: 't',
  tinta: 't', tinta_qtd: 't', tinta_estoque: 't',
};
// Identificação: o upload só PREENCHE se estiver vazio (não sobrescreve).
export const CAMPOS_SO_SE_VAZIO_HRM = new Set(['po_item', 'vendedor', 'destino']);
// Viram REGISTRO no histórico (com data) em vez de sobrescrever calado.
export const CAMPOS_HISTORICO_HRM = new Set(['expedite', 'ocorrencia']);

export const NOME_CAMPO_HRM: Record<string, string> = {
  po_item: 'PO + item', destino: 'Destino', vendedor: 'Vendedor', coordenador: 'Coordenador', caldeireiros: 'Caldeireiros',
  mp_obs: 'Obs. da MP', necessidade: 'Necessidade do cliente', conf_delv: 'Conf Delv Date', prev_faturamento: 'Prev. faturamento',
  prev_final: 'Prev. final', finalizado_em: 'Finalizado', situacao: 'Situação', situacao_detalhe: 'Detalhe', obs: 'Observações',
  prioridade: 'Prioridade', prioridade_skid: 'Prioridade skid', seq_cliente: 'Seq. cliente', seq_oss: 'Seq OSS',
  tinta: 'Tinta', tinta_qtd: 'Qtd. de tinta', tinta_estoque: 'Tinta em estoque', expedite: 'Expedite', ocorrencia: 'Ocorrência',
  op_hrm: 'OP HRM', item: 'Item', pedido_omie: 'Pedido Omie', ns: 'NS', material: 'Material', descricao: 'Descrição', quantidade: 'Quantidade',
};

// ── Leitura da planilha (cabeçalho → campo). Casa pelo NOME da coluna, não pela
// posição, pra aguentar coluna inserida/movida. Normaliza acento/espaço/quebra.
export function normCab(s: unknown): string {
  return String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim().toLowerCase();
}
const CAB: Record<string, string> = {
  'n do pedido (omie)': 'pedido_omie', 'no do pedido (omie)': 'pedido_omie', 'nº do pedido (omie)': 'pedido_omie',
  'quantidade de estruturas / projetos': 'quantidade', 'item': 'item', 'po + item': 'po_item', 'op hrm': 'op_hrm', 'ns': 'ns',
  'cliente': 'destino', 'mp': 'mp_obs', 'material': 'material', 'material description': 'descricao',
  'necessidade do cliente': 'necessidade', 'previsao de faturamento (omie)': 'prev_faturamento',
  'ocorrencias': 'ocorrencia', 'priorizar': 'situacao_detalhe', 'conf delv date at the plant': 'conf_delv',
  'caldeireiros': 'caldeireiros', 'prioridade skid': 'prioridade_skid', 'prioridade': 'prioridade', 'tintas': 'tinta',
  'quantidad e de tintas': 'tinta_qtd', 'quantidade de tintas': 'tinta_qtd', 'tinta em estoque?': 'tinta_estoque',
  'prev final': 'prev_final', 'finalizado': 'finalizado_em', 'obs': 'obs', 'seq oss': 'seq_oss', 'setor': 'coordenador',
  'seq cliente': 'seq_cliente', 'observacoes': 'obs2', 'vendedor': 'vendedor',
};
/** Nome da coluna → campo do sistema (ou etapa:codigo / expedite). null = só vai pro planilha_raw. */
export function campoDaColuna(cab: unknown): string | null {
  const n = normCab(cab);
  if (!n) return null;
  if (n.startsWith('expedite')) return 'expedite';
  const et = ETAPAS_HRM.find(e => normCab(e.coluna) === n);
  if (et) return `etapa:${et.codigo}`;
  return CAB[n] ?? null;
}

export function txtHrm(v: unknown, max = 2000): string | null {
  if (v === null || v === undefined) return null;
  const s = String(v).replace(/\r/g, '').trim();
  return s ? s.slice(0, max) : null;
}

/** Chave estável da linha: OP+item; sem OP → pedido+material. */
export function chaveBase(op: string | null, item: string | null, pedido: string | null, material: string | null, po: string | null): string {
  const n = (s: string | null) => (s || '').trim().toUpperCase();
  if (n(op) && n(item)) return `op:${n(op)}|${n(item)}`;
  if (n(op)) return `op:${n(op)}|${n(material)}`;
  if (n(po)) return `po:${n(po)}`;
  return `ped:${n(pedido)}|${n(material)}`;
}

/** Célula da coluna de etapa marcada? ("ok", "OK", "atual…"). Número ("0", "191") não conta. */
export function etapaMarcada(v: unknown): boolean {
  const s = String(v ?? '').trim().toLowerCase();
  return s === 'ok' || s.startsWith('atual') || s === 'sim' || s === 'x';
}

// ── Contas da planilha (mesmas fórmulas)
export function somarDiasISO(iso: string, n: number): string {
  const d = new Date(iso + 'T12:00:00');
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}
export function diasEntre(a: string, b: string): number {
  return Math.round((new Date(a + 'T12:00:00').getTime() - new Date(b + 'T12:00:00').getTime()) / 864e5);
}
/** EXW = Conf Delv − 12 dias (regra da maioria das linhas da planilha). */
export const EXW_DIAS = 12;
export const exwDe = (it: Pick<ItemHrm, 'conf_delv'>) => (it.conf_delv ? somarDiasISO(it.conf_delv, -EXW_DIAS) : null);
/** Folga = (Necessidade − 10) − Prev. faturamento. Negativo = atrasado (coluna BA). */
export function folgaDe(it: Pick<ItemHrm, 'necessidade' | 'prev_faturamento'>): number | null {
  if (!it.necessidade || !it.prev_faturamento) return null;
  return diasEntre(somarDiasISO(it.necessidade, -10), it.prev_faturamento);
}
/** Atraso = Prev. faturamento − Conf Delv (coluna AZ). */
export function atrasoDe(it: Pick<ItemHrm, 'prev_faturamento' | 'conf_delv'>): number | null {
  if (!it.prev_faturamento || !it.conf_delv) return null;
  return diasEntre(it.prev_faturamento, it.conf_delv);
}
/** NS / OP no padrão da planilha: item 20 → "02" (dígitos invertidos). */
export function nsDe(op: string | null, item: string | null): string | null {
  if (!op || !item || !/^\d+$/.test(item)) return null;
  const inv = item.slice(-1) + item.slice(0, 1);
  return `NS HRM-${op}-${inv}-01`;
}

export const fmtDataHrm = (s: string | null | undefined) => (s ? `${s.slice(8, 10)}/${s.slice(5, 7)}/${s.slice(0, 4)}` : '—');
