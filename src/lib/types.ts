export const SETOR_CHOICES: [string, string][] = [
  ['emissao', 'Emissao de Ordens'],
  ['usinagem', 'Usinagem'],
  ['maçarico', 'Corte Macarico'],
  ['plasma', 'Corte Plasma'],
  ['laser', 'Corte Laser'],
  ['serra', 'Corte Serra'],
  ['estoque', 'Estoque'],
  ['furacao', 'Furação'],
  ['qualidade', 'Inspecao de Qualidade'],
  ['sinete', 'Sinete'],
  ['acabamento', 'Acabamento'],
  ['logistica', 'Logistica'],
  ['recebimento', 'Recebimento'],
  ['compras', 'Compras'],
  ['beneficiadores', 'Beneficiadores'],
  ['caldeiraria', 'Caldeiraria'],
  ['embalagem', 'Embalagem'],
  ['quarentena', 'Quarentena'],
  ['desenho', 'Desenho'],
  ['calandra', 'Calandra'],
  ['chanfradeira', 'Chanfradeira'],
  ['solda', 'Solda'],
  ['montagem', 'Montagem'],
  ['liberado', 'Liberado'],
  ['pintura', 'Pintura'],
  // ── Caldeiraria — etapas novas do chão de fábrica (12/08) ──────────────────
  // Modelo detalhado da Caldeiraria (roteiro completo passado pela área). É
  // ADITIVO: os setores antigos (chanfradeira, calandra, montagem, solda,
  // pintura) continuam existindo pros pedidos que já estão em produção
  // terminarem em paz; estes novos valem pros pedidos novos. Ver
  // [[project_caldeiraria_modelo]].
  ['corte_chapas', 'Corte de Chapas'],
  ['corte_perfis', 'Corte de Perfis'],
  ['suporte', 'Suporte à Caldeiraria'],
  ['recortes', 'Recortes de Perfis'],
  ['tracagem', 'Traçagem'],
  ['chanfros', 'Prep. Chanfros e Juntas'],
  ['montagem_solda', 'Montagem / Solda Inicial'],
  ['usinagem_final', 'Usinagem Final'],
  ['acabamento_geral', 'Acabamento Geral / Tipar'],
  ['conjuntos', 'Montagem de Conjuntos'],
  ['jateamento', 'Jateamento'],
  ['pintura_cald', 'Pintura (Caldeiraria)'],
  // ── Caldeiraria — PROCESSO REAL (fábrica única, lista "Principais processos"
  // passada pela área em 28/08) ─────────────────────────────────────────────
  // Setores EXCLUSIVOS da Caldeiraria (não vazam pro Flange — ver
  // SETORES_EXCLUSIVOS_CALDEIRARIA). Na ABERTURA da OP o operador escolhe, por
  // item, por onde a peça passa (seleção livre) — a Inspeção CQ ('qualidade')
  // pode repetir em vários pontos do roteiro. Os passos que JÁ existiam acima
  // (compras, caldeiraria=Recebimento, corte_perfis, solda, jateamento,
  // conjuntos, qualidade=Inspeção CQ, logistica=Coleta/Entrega) são
  // reaproveitados no roteiro e NÃO recriados aqui. Só entram aqui os passos
  // novos. Ver PROCESSO_CALDEIRARIA (ordem do roteiro).
  ['cald_corte_oxi', 'Corte Oxicorte/Plasma/Laser'],
  ['cald_identificacao', 'Identificação dos Materiais'],
  ['cald_transp_externo', 'Transporte p/ Serviço Externo'],
  ['cald_conformacao_int', 'Conformação Interna'],
  ['cald_conformacao_ext', 'Conformação Externa'],
  ['cald_pre_usinagem', 'Pré-Usinagem'],
  ['cald_prep_chapas', 'Prep. Chapas e Perfis (Pré-Montagem)'],
  ['cald_revestimento', 'Serviço Externo — Revestimento'],
  ['cald_pint_primer', 'Pintura Primer'],
  ['cald_pint_interm', 'Pintura Intermediária'],
  ['cald_pint_acab', 'Pintura Acabamento'],
  ['cald_pint_antiderr', 'Pintura Antiderrapante'],
  ['cald_pint_retoques', 'Pintura de Retoques (Insp. Final)'],
  ['cald_book', 'Book (Preparação / Aprovação)'],
  ['cald_emissao_nf', 'Emissão de NF'],
  ['cald_outros', 'Outros (identificar manual)'],
];

export const NOMES: Record<string, string> = Object.fromEntries(SETOR_CHOICES);

// ── Fábricas (linhas de produção) ───────────────────────────────────────────
// Fonte única de "quais setores pertencem a cada fábrica", usada na tela de
// Abrir OP pra filtrar o roteiro conforme a fábrica escolhida.
//  • 'emissao' é sempre o 1º passo (fixo) — não entra na lista selecionável.
//  • Compartilhados (beneficiadores/recebimento) não fazem parte do roteiro
//    pré-planejado, igual já acontece na tela de Flange.
//  • Caldeiraria hoje só tem 'caldeiraria'; conforme as etapas forem definidas,
//    é só acrescentar os setores aqui (nada mais muda).
// Etapas novas do chão de fábrica da Caldeiraria (12/08), na ordem do roteiro.
// Aditivas — fonte única reaproveitada nas listas de menu/kanban/roteiro abaixo.
export const SETORES_CALDEIRARIA_NOVOS = ['corte_chapas', 'corte_perfis', 'suporte', 'recortes', 'tracagem', 'chanfros', 'montagem_solda', 'usinagem_final', 'acabamento_geral', 'conjuntos', 'jateamento', 'pintura_cald'];

// ── Caldeiraria — PROCESSO REAL (fábrica única, 28/08) ──────────────────────
// Roteiro-modelo na ordem da lista "Principais processos" passada pela área. É
// a SUGESTÃO padrão; na abertura da OP o operador escolhe (seleção livre) por
// onde cada item passa. Reaproveita passos que já existem (Recebimento=
// 'caldeiraria', Compras, Corte de Perfis, Inspeção CQ='qualidade', Solda,
// Jateamento, Montagem de Conjuntos, Coleta/Entrega='logistica') e usa os
// passos novos ('cald_*'). Inspeção CQ aparece em vários pontos de propósito.
export const PROCESSO_CALDEIRARIA = [
  'caldeiraria',          // Recebimento
  'cald_corte_oxi',       // Corte Oxicorte/Plasma/Laser
  'corte_perfis',         // Corte de Perfis
  'cald_identificacao',   // Identificação dos Materiais
  'cald_transp_externo',  // Solicitação transporte p/ Serviço Externo
  'cald_conformacao_int', // Conformação Interna
  'cald_conformacao_ext', // Conformação Externa
  'cald_pre_usinagem',    // Pré-Usinagem
  'cald_prep_chapas',     // Prep. Chapas e Perfis (Pré-Montagem)
  'qualidade',            // Inspeção CQ
  'solda',                // Solda
  'qualidade',            // Inspeção CQ
  'cald_revestimento',    // Serviço Externo — Revestimento
  'qualidade',            // Inspeção CQ
  'jateamento',           // Jateamento
  'cald_pint_primer',     // Pintura Primer
  'cald_pint_interm',     // Pintura Intermediária
  'cald_pint_acab',       // Pintura Acabamento
  'qualidade',            // Inspeção CQ
  'conjuntos',            // Montagem de Conjuntos
  'cald_pint_antiderr',   // Pintura Antiderrapante
  'cald_pint_retoques',   // Pintura de Retoques (Inspeção Final)
  'qualidade',            // Inspeção CQ
  'cald_book',            // Book (Preparação / Aprovação)
  'cald_emissao_nf',      // Emissão de NF
  'logistica',            // Solicitação de Coleta / Entrega
  'cald_outros',          // Outros (identificar manual)
];

// Só os passos NOVOS do processo (os 'cald_*' criados agora). Usado pra marcar
// exclusividade (não vazam pro Flange) e alimentar menu/kanban da Caldeiraria.
export const SETORES_CALDEIRARIA_PROCESSO_NOVOS = ['cald_corte_oxi', 'cald_identificacao', 'cald_transp_externo', 'cald_conformacao_int', 'cald_conformacao_ext', 'cald_pre_usinagem', 'cald_prep_chapas', 'cald_revestimento', 'cald_pint_primer', 'cald_pint_interm', 'cald_pint_acab', 'cald_pint_antiderr', 'cald_pint_retoques', 'cald_book', 'cald_emissao_nf', 'cald_outros'];

// Setores ANTIGOS da Caldeiraria — já esvaziados (12/08, confirmado com o
// usuário) e REMOVIDOS do menu/kanban. Continuam em SETOR_CHOICES e em
// SETORES_EXCLUSIVOS_CALDEIRARIA só pra resolver o nome em dados históricos
// (movimentações antigas) e não vazarem pro Flange.
export const SETORES_CALDEIRARIA_LEGADO = ['chanfradeira', 'calandra', 'montagem', 'solda', 'pintura'];

// Setores exclusivos da Caldeiraria — não aparecem no roteiro nem no menu do
// Flange, mesmo estando na lista geral SETOR_CHOICES. Inclui os ANTIGOS
// (legado) de propósito: eles saíram do menu da Caldeiraria mas continuam
// sendo exclusivos dela, então NÃO podem vazar pro grupo Flanges no Sidebar.
export const SETORES_EXCLUSIVOS_CALDEIRARIA = ['desenho', 'liberado', ...SETORES_CALDEIRARIA_LEGADO, ...SETORES_CALDEIRARIA_NOVOS, ...SETORES_CALDEIRARIA_PROCESSO_NOVOS];

export const FABRICAS: { cod: string; nome: string; icon: string; setores: string[] }[] = [
  {
    cod: 'flange',
    nome: 'Flanges',
    icon: 'bi-nut',
    setores: SETOR_CHOICES
      .map(([c]) => c)
      .filter(c => !['emissao', 'caldeiraria', 'beneficiadores', 'recebimento', ...SETORES_EXCLUSIVOS_CALDEIRARIA].includes(c)),
  },
  {
    cod: 'caldeiraria',
    nome: 'Caldeiraria',
    icon: 'bi-hammer',
    // Roteiro NOVO (28/08) — fábrica ÚNICA, lista "Principais processos" passada
    // pela área. É a lista que a ABERTURA da OP oferece pro operador escolher
    // (seleção livre por item) por onde a peça passa. Fonte única:
    // PROCESSO_CALDEIRARIA (ordem do roteiro); aqui vai deduplicado (a Inspeção
    // CQ aparece uma vez no picker mas pode ser adicionada em vários pontos do
    // roteiro do item). Só afeta PEDIDO NOVO — pedido já criado guarda o próprio
    // roteiro_efetivo, então os que estão em produção não mudam.
    setores: PROCESSO_CALDEIRARIA.filter((s, i) => PROCESSO_CALDEIRARIA.indexOf(s) === i),
  },
];

// ── LIMPEZA 18/08/2026 — reconstrução em Caldeiraria Leve/Pesada ────────────
// A área migrou pra uma empresa nova que roda o PCP no Protheus (TOTVS). O
// modelo antigo (fábrica única "caldeiraria" com o roteiro de 12/08) vai ser
// substituído por DUAS fábricas: Caldeiraria Leve e Caldeiraria Pesada, com os
// setores que a área ainda vai passar. Passo 1 (aqui): limpar o menu/kanban,
// deixando só os setores que HOJE têm peça — Recebimento ("caldeiraria", 2
// itens) e Usinagem Final (1 item) — pra não orfanar nada. Os demais setores
// (SETORES_CALDEIRARIA_NOVOS/LEGADO) continuam em SETOR_CHOICES e em
// SETORES_EXCLUSIVOS_CALDEIRARIA só pra resolver nome em dados históricos e não
// vazarem pro grupo Flanges. Passo 2 (aguardando lista de setores): criar
// Leve/Pesada em FABRICAS e redefinir estas listas.
// Recebimento ('caldeiraria') + os passos NOVOS exclusivos do processo (28/08) +
// 'usinagem_final' (legado com item ainda em produção). Passos compartilhados do
// roteiro (Inspeção CQ='qualidade', Solda, Jateamento, Montagem de Conjuntos,
// Compras, Coleta/Entrega='logistica') NÃO entram aqui de propósito: têm tela
// própria e não devem misturar itens do Flange no menu/kanban da Caldeiraria.
export const SETORES_CALDEIRARIA_MENU = ['caldeiraria', ...SETORES_CALDEIRARIA_PROCESSO_NOVOS, 'usinagem_final'];

export const SETORES_CALDEIRARIA_KANBAN = ['caldeiraria', ...SETORES_CALDEIRARIA_PROCESSO_NOVOS, 'usinagem_final'];

// Setores de CORTE — depois de cortada, a peça é direcionada pela mão do
// operador do corte pra linha do Flange (segue o próximo do roteiro) ou pra
// Caldeiraria (entra no Recebimento). São compartilhados: um corte pode
// alimentar qualquer uma das duas fábricas. Ver os botões na tela de setor.
export const SETORES_CORTE = ['maçarico', 'plasma', 'laser', 'serra'];

// ── Checklist de processo por etapa da Caldeiraria (29/07) ──────────────────
// Baseado no processo real da Acosvital (site institucional: fornecedor
// certificado ISO 9001 / CRC Petrobrás e YPFB — cliente óleo e gás exige
// rastreabilidade forte). Cada item que entra na Caldeiraria pode receber um
// "tipo de produto"; isso decide qual checklist aparece em cada etapa. Item
// sem tipo definido (null) nunca ativa o gate — comportamento de hoje intacto.
export const TIPOS_PRODUTO_CALDEIRARIA: { cod: string; label: string }[] = [
  { cod: 'tubo_calandrado', label: 'Tubo/Conexão Calandrado' },
  { cod: 'peca_personalizada', label: 'Peça Personalizada' },
  { cod: 'skid', label: 'Skid' },
  { cod: 'vaso_pressao', label: 'Vaso de Pressão' },
  { cod: 'tanque_processo', label: 'Tanque de Processo' },
];

// Etapas da Caldeiraria que exigem checklist de processo. Separada de
// SETORES_CALDEIRARIA_INTERNOS de propósito — aquela constante já é usada em
// outros lugares (menu, kanban) e não deve ganhar efeito colateral novo.
export const SETORES_CHECKLIST_PROCESSO = ['chanfros', 'montagem_solda', 'usinagem_final', 'acabamento_geral', 'conjuntos', 'jateamento', 'pintura_cald', 'liberado', 'qualidade', ...SETORES_CALDEIRARIA_LEGADO, 'acabamento'];

export interface ChecklistItemDef { id: string; label: string; }

// Pontos de controle base por etapa — mesmos pra qualquer tipo de produto.
const CHECKLISTS_ETAPA_BASE: Record<string, ChecklistItemDef[]> = {
  chanfradeira: [
    { id: 'angulo_chanfro', label: 'Ângulo/abertura de raiz do bisel conforme espessura' },
  ],
  calandra: [
    { id: 'raio_curvatura', label: 'Raio de curvatura dentro da tolerância (gabarito)' },
  ],
  montagem: [
    { id: 'esquadro', label: 'Esquadro/alinhamento de eixo' },
    { id: 'gap_pecas', label: 'Gap entre peças / ponteamento' },
  ],
  solda: [
    { id: 'cordao', label: 'Cordão sem mordedura/trinca visível' },
    { id: 'escoria', label: 'Escória removida' },
    { id: 'consumivel', label: 'Consumível rastreável registrado' },
  ],
  acabamento: [
    { id: 'esmerilhamento', label: 'Esmerilhamento / acerto dimensional final' },
  ],
  pintura: [
    { id: 'preparacao_superficie', label: 'Preparação de superfície' },
    { id: 'espessura_pelicula', label: 'Espessura de película conforme especificação' },
  ],
  liberado: [
    { id: 'conferencia_final', label: 'Todos os itens anteriores conferidos' },
  ],
  qualidade: [
    { id: 'dimensional', label: 'Inspeção dimensional/visual' },
  ],
  // ── Etapas novas do chão de fábrica da Caldeiraria (12/08) ─────────────────
  chanfros: [
    { id: 'angulo_chanfro', label: 'Ângulo/abertura de raiz do bisel conforme espessura' },
  ],
  tracagem: [
    { id: 'marcacao', label: 'Marcação conforme desenho / plano de corte' },
  ],
  montagem_solda: [
    { id: 'esquadro', label: 'Esquadro/alinhamento de eixo' },
    { id: 'gap_pecas', label: 'Gap entre peças / ponteamento' },
    { id: 'cordao', label: 'Cordão sem mordedura/trinca visível' },
    { id: 'escoria', label: 'Escória removida' },
    { id: 'consumivel', label: 'Consumível rastreável registrado' },
    { id: 'ut_interm', label: 'UT intermediária (ultrassom) conferida' },
    { id: 'dim_interm', label: 'Dimensional intermediária conferido' },
  ],
  usinagem_final: [
    { id: 'acerto_dimensional', label: 'Acerto dimensional final' },
  ],
  acabamento_geral: [
    { id: 'esmerilhamento', label: 'Esmerilhamento / acerto final e tipagem da peça' },
    { id: 'teste_carga', label: 'Inspeção — teste de carga' },
    { id: 'dimensional', label: 'Inspeção dimensional' },
    { id: 'visual', label: 'Inspeção visual' },
    { id: 'pm_lp', label: 'Inspeção PM / LP (partícula magnética / líquido penetrante)' },
  ],
  conjuntos: [
    { id: 'dimensional_cliente', label: 'Inspeção dimensional (cliente)' },
    { id: 'visual_cliente', label: 'Inspeção visual (cliente)' },
  ],
  jateamento: [
    { id: 'grau_jateamento', label: 'Grau de preparação de superfície (jato) conforme especificação' },
  ],
  pintura_cald: [
    { id: 'primer', label: 'Demão — primer' },
    { id: 'intermediaria', label: 'Demão — intermediária' },
    { id: 'acabamento_pint', label: 'Demão — acabamento' },
    { id: 'antiderrapante', label: 'Demão — antiderrapante' },
    { id: 'detalhes', label: 'Pintura de detalhes' },
    { id: 'retoques', label: 'Retoques' },
    { id: 'espessura_pelicula', label: 'Espessura de película conforme especificação' },
  ],
};

// Pontos extras só pra produtos críticos (Vaso de Pressão / Tanque de
// Processo) — reflete o que a empresa já divulga como processo real: normas
// AWS/ASME, Ensaios Não Destrutivos (Líquido Penetrante, Ultrassom, Radiografia).
const CHECKLISTS_CRITICOS_EXTRA: Record<string, ChecklistItemDef[]> = {
  solda: [
    { id: 'soldador_qualificado', label: 'Soldador qualificado (AWS/ASME)' },
    { id: 'end_previsto', label: 'Ensaio Não Destrutivo previsto pro projeto' },
  ],
  montagem_solda: [
    { id: 'soldador_qualificado', label: 'Soldador qualificado (AWS/ASME)' },
    { id: 'end_previsto', label: 'Ensaio Não Destrutivo previsto pro projeto' },
  ],
  acabamento_geral: [
    { id: 'end_executado', label: 'Ensaio Não Destrutivo executado (LP/UT/RX)' },
  ],
  qualidade: [
    { id: 'end_executado', label: 'Ensaio Não Destrutivo executado (LP/UT/RX)' },
  ],
};

const TIPOS_CRITICOS = ['vaso_pressao', 'tanque_processo'];

export function getChecklistEtapa(setor: string, tipoProduto: string | null | undefined): ChecklistItemDef[] {
  const base = CHECKLISTS_ETAPA_BASE[setor] || [];
  const extra = (tipoProduto && TIPOS_CRITICOS.includes(tipoProduto)) ? (CHECKLISTS_CRITICOS_EXTRA[setor] || []) : [];
  return [...base, ...extra];
}

// Ordem real do roteiro de produção — usada pra ordenar as colunas dos Kanbans
// (sistema e TV), em vez da ordem do SETOR_CHOICES. Setor fora desta lista
// (ex: emissão, recebimento, compras) vai pro fim, sem sumir. Fonte única:
// mudou o roteiro, muda aqui e reflete nos dois lugares.
export const ORDEM_SETORES = ['estoque', 'maçarico', 'plasma', 'laser', 'serra', 'usinagem', 'furacao', 'qualidade', 'sinete', 'acabamento', 'embalagem', 'quarentena', 'logistica',
  // Caldeiraria — processo real (28/08), na ordem do roteiro. Só os setores
  // EXCLUSIVOS da Caldeiraria; os compartilhados (qualidade/logistica) já estão
  // acima e valem pros dois kanbans. Fonte: PROCESSO_CALDEIRARIA.
  'caldeiraria', 'cald_corte_oxi', 'corte_perfis', 'cald_identificacao', 'cald_transp_externo', 'cald_conformacao_int', 'cald_conformacao_ext', 'cald_pre_usinagem', 'cald_prep_chapas', 'solda', 'cald_revestimento', 'jateamento', 'cald_pint_primer', 'cald_pint_interm', 'cald_pint_acab', 'conjuntos', 'cald_pint_antiderr', 'cald_pint_retoques', 'cald_book', 'cald_emissao_nf', 'usinagem_final', 'cald_outros'];

// Regra de negócio: TODA peça passa pela Quarentena (análise/verificação) antes
// de ir à Logística (despacho). Injeta 'quarentena' imediatamente antes de
// 'logistica' no roteiro efetivo, se ainda não estiver — vale para pedidos
// antigos e novos, sem precisar migrar os roteiros salvos.
export function injetarQuarentena(roteiro: string[]): string[] {
  if (!Array.isArray(roteiro)) return roteiro;
  // Quarentena é regra do FLANGE — a Caldeiraria NÃO tem Quarentena. Se o
  // roteiro passa pela Caldeiraria (setor 'caldeiraria' = Recebimento, ou
  // qualquer setor exclusivo dela), não injeta nada.
  if (roteiro.includes('caldeiraria') || roteiro.some(s => SETORES_EXCLUSIVOS_CALDEIRARIA.includes(s))) return roteiro;
  const idxLog = roteiro.indexOf('logistica');
  if (idxLog === -1 || roteiro.includes('quarentena')) return roteiro;
  const novo = [...roteiro];
  novo.splice(idxLog, 0, 'quarentena');
  return novo;
}
export const posSetorRoteiro = (cod: string) => {
  const i = ORDEM_SETORES.indexOf(cod);
  return i === -1 ? ORDEM_SETORES.length : i;
};

// ── Funil de FABRICAÇÃO dos Flanges (relatório de Acompanhamento em /analise) ─
// Corte definido pela produção (email/decisão 03/09): a FABRICAÇÃO vai da
// emissão até o ACABAMENTO. Depois do acabamento é só verificação do PCP
// (quarentena) e despacho (logística) — não é mais "produzir". Fonte única
// usada pelo endpoint /api/analise/fabricacao. Ver [[project_analise_pcp]].
//  • EM FABRICAÇÃO: setores de chão até o acabamento (inclui 'estoque', peça
//    aguardando material/etapa dentro do processo).
//  • PRONTO: passou do acabamento — fabricada, esperando verificação/despacho.
//  • FILA: ainda não entrou na fabricação (emissão/compras/recebimento) ou
//    status aguardando/emitido.
export const FAB_SETORES_EM_FABRICACAO = ['estoque', 'maçarico', 'plasma', 'laser', 'serra', 'usinagem', 'furacao', 'qualidade', 'sinete', 'acabamento'];
export const FAB_SETORES_PRONTO = ['embalagem', 'quarentena', 'logistica', 'liberado'];
export const FAB_SETORES_FILA = ['emissao', 'recebimento', 'compras', 'beneficiadores'];

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
  // Previsão de conclusão (Gilmar/PCP). `previsao_conclusao` = a da própria peça
  // (ISO ou null); `previsao_efetiva` = a que vale (peça ou herdada do pedido).
  previsao_conclusao?: string | null;
  pedido_previsao?: string | null;
  previsao_efetiva?: string | null;
  previsao_efetiva_fmt?: string;
  codigo: string;
  descricao: string;
  quantidade: string;
  unidade: string;
  roteiro_proprio: string[];
  roteiro_efetivo: string[];
  fabrica?: string;
  item_pai_id?: number | null;
  tipo_produto?: string | null;
  checklists_processo?: { id: number; setor: string; setor_nome: string; tipo_produto: string | null; respostas: { id: string; label: string; resposta: string; observacao: string }[]; usuario_nome: string; criado_em: string }[];
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
  anexos?: { id: number; tipo: string; nome_arquivo: string; criado_em: string }[];
  tem_pedido_venda?: boolean;
  tem_ordem_producao?: boolean;
  atrasado?: boolean;
  inativo?: boolean;
  inativado_em?: string | null;
  inativado_por?: string | null;
  motivo_inativacao?: string | null;
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
  envolve_caldeiraria?: boolean;
  observacoes: string;
  atrasado: boolean;
  dias_prazo: number;
  cor_prazo: string;
  // Previsão de conclusão do pedido: `previsao_conclusao` = a própria (ou null);
  // `previsao_conclusao_efetiva` = a própria ou a maior das peças; `_fmt` exibível.
  previsao_conclusao?: string | null;
  previsao_conclusao_efetiva?: string | null;
  previsao_conclusao_fmt?: string;
  // Nº do pedido do CLIENTE (OC/PO dele) — rastreio pelo cliente, distinto do PV.
  numero_pedido_cliente?: string | null;
  // Entrega CONTRATUAL (prazo fixo do contrato). Não é base de atraso.
  entrega_contratual?: string | null;
  entrega_contratual_fmt?: string;
  // Início REAL da produção: 1º apontamento (iniciado_em) das parciais do pedido.
  // null = ainda não começou a produzir. Derivado, nunca digitado.
  producao_iniciada_em?: string | null;
  producao_iniciada_em_fmt?: string;
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
  // Rastreio somente-leitura do que está na Caldeiraria — só vem preenchido
  // quando setor === 'logistica' (ver GET /api/setor/[setor]).
  em_caldeiraria?: { itens: ItemPedido[]; parciais: ItemParcial[] };
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
  maquina?: string | null;
  operador?: string | null;
  /** Código do motivo da pausa (ver MOTIVOS_PAUSA em src/lib/maquinas.ts). Só preenchido quando status = 'pausado'. */
  motivo_pausa?: string | null;
  /** Status do item (não da parcial) — usado pra detectar reprovado/divergência. */
  item_status?: string;
  numero_op?: string;
  item_codigo?: string;
  item_descricao?: string;
  numero_pedido_venda?: string;
  cliente?: string;
  prioridade?: string;
  pedido_prazo?: string;
  pedido_prazo_fmt?: string;
  previsao_efetiva?: string | null;
  previsao_efetiva_fmt?: string | null;
  atrasado?: boolean;
  quantidade_total_item?: string;
  proximo_setor?: string | null;
  roteiro_efetivo?: string[];
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
  item_pai_id?: number | null;
  item_pai_codigo?: string | null;
  componentes?: { id: number; codigo: string; setor_atual: string; setor_nome: string; status: string }[];
  item_tipo_produto?: string | null;
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
