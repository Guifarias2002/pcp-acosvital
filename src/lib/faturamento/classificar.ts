/**
 * Classificação do faturamento (export Omie) com os MESMOS critérios do
 * "CONTROLE GERAL DE FATURAMENTO AÇOS VITAL.xlsx" (Família / Local de produção /
 * Empresa de fabricação). Porte 1:1 de scripts/faturamento/classif.py:
 *   1) código já classificado no relatório de agosto (referencia.json);
 *   2) regras por palavra (derivadas do relatório de agosto);
 *   3) sobra = DIVERSOS/REVENDA, marcada "SEM REGRA — conferir".
 * Ver [[project_faturamento_mensal]].
 */
import REFERENCIA from './referencia.json';

export type Classe = [familia: string, local: string, empresa: string];

const MAPA = REFERENCIA as unknown as Record<string, Classe>;

const semAcento = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
export const codDe = (desc: string) => String(desc).split(' - ')[0].trim().toUpperCase();
/** "Pedido de Venda nº 27657" → "Pedido de Venda" */
export const tipoDoc = (ped: unknown) => String(ped ?? '').replace(/\s*n\S*\s*\d+.*/, '').trim();
/** só os dígitos, sem zeros à esquerda (p/ casar nº de pedido) */
export const numPedido = (s: unknown) => String(s ?? '').replace(/\D/g, '').replace(/^0+/, '');

const C = (fam: string, local = 'REVENDA', emp = 'AÇOS VITAL'): Classe => [fam, local, emp];
const PLASTICOS = ['PVC', 'CPVC', 'PVDF', 'PTFE', 'NYLON', 'POLIPROPILENO', 'PP', 'POLIACETAL', 'POLIETILENO', 'TEFLON', 'UHMW[0-9]*', 'ACRILICO'];

function regra(desc: string): [Classe, string | null] {
  const d = semAcento(String(desc).split(' - ').slice(1).join(' - ') || String(desc)).toUpperCase();
  const w = d.match(/[A-Z0-9]+/g) || [];
  const first = w[0] || '';
  const has = (...k: string[]) => k.some((x) => new RegExp('\\b' + x + '\\b').test(d));
  const em = (...k: string[]) => k.includes(first);
  const plastico = has(...PLASTICOS);
  // Flange (inclusive "p/ tubo PEAD" e PRFV) = Fábrica Flanges — só flange de plástico vai p/ Plásticos
  if (em('FLANGE', 'FLANGES', 'DISCO', 'CONTRA', 'RAQUETE') && !plastico) return [C('FLANGES', 'FABRICA FLANGES', 'HRM'), 'flange'];
  if (first === 'TUBO' && has('FLANGEADO') && has('PRFV')) return [C('FLANGES', 'FABRICA FLANGES', 'HRM'), 'tubo flangeado PRFV'];
  if (em('GRADE', 'DEGRAU')) return [C('GRADE DE PISO', 'FABRICA DE GRADE DE PISO', 'AÇOS VITAL'), 'grade/degrau'];
  if (em('VALVULA', 'REGISTRO', 'PURGADOR', 'VENTOSA'))
    return has('PVC', 'CPVC', 'PVDF') ? [C('PLASTICOS'), 'válvula plástica'] : [C('VALVULA'), 'válvula'];
  // placa de desgaste 190/390 (Hardox/desgaste) = Fábrica Usinagem; chapa Hardox/Usiar inteira = revenda
  if (em('CHAPA', 'PLACA') && has('DESGASTE', 'ANTIDESGASTE', 'HARDOX') && /(190|390)\s*MM/.test(d))
    return [C('HARDOX', 'FABRICA USINAGEM', 'HRM'), 'placa de desgaste 190/390'];
  if (em('CHAPA', 'PLACA') && has('DESENHO', 'CONF', 'PROJETO') && !has('EXPANDIDA', 'PERFURADA')) return [C('CHAPAS'), 'chapa conforme desenho (CONFERIR)'];
  if (first === 'KIT' && has('CHAPA')) return [C('CHAPAS'), 'kit chapa'];
  if (first === 'KIT' && has('TUBULACAO', 'TUBO')) return [C('TUBOS'), 'kit tubulação'];
  // materiais que mandam na família
  if (has('PRFV', 'FIBRA DE VIDRO')) return [C('FIBRA DE VIDRO'), 'PRFV'];
  if (has('PEAD', 'PE100', 'PE 100', 'PE80') || first === 'COLARINHO') return [C('PEAD'), 'PEAD'];
  if (plastico) return [C('PLASTICOS'), 'plástico'];
  // caldeiraria leve (sob projeto/desenho)
  if (em('SPOOL', 'SUPORTE', 'ESTRUTURA', 'BLANK', 'POCO', 'CAMISA', 'CAMISAS', 'BANCADA', 'SKID', 'TANQUE', 'CARRETEL', 'COIFA', 'DUTO', 'PLATAFORMA', 'GUARDA', 'ESCADA', 'PASSARELA', 'CORRIMAO')
    || (has('CONFORME PROJETO', 'CONF PROJETO', 'CONFORME DESENHO', 'CONF DESENHO', 'CONF. PROJETO', 'CONF. DESENHO') && !em('FLANGE', 'ANEL', 'CALHA')))
    return [C('CALDEIRARIA', 'CALDEIRARIA LEVE', 'HRM'), 'caldeiraria (projeto/desenho)'];
  if (em('FABRICACAO', 'TRELICA') || (first === 'CONJUNTO' && has('DESENHO'))) return [C('CALDEIRARIA', 'CALDEIRARIA LEVE', 'HRM'), 'caldeiraria (fabricação/desenho)'];
  if (em('RED', 'NIPOLET', 'COLAR')) return [C('CONEXÕES'), 'conexão'];
  if (em('PC', 'PC/PA')) return [C('FIXAÇÃO'), 'fixação (estojo)'];
  if (first === 'SUCATA') return [C('DIVERSOS'), 'sucata'];
  if (first === 'TUBO' && has('CALANDRADO')) return [C('TUBOS', 'CALDEIRARIA LEVE', 'HRM'), 'tubo calandrado'];
  if (em('FLANGE', 'FLANGES', 'DISCO', 'CONTRA')) return [C('FLANGES', 'FABRICA FLANGES', 'HRM'), 'flange'];
  if (em('CHAPA', 'PLACA') && has('EXPANDIDA')) return [C('CHAPA EXPANDIDA', 'FABRICA CHAPA EXPANDIDA', 'TERCEIROS'), 'chapa expandida'];
  if (has('PERFURADA', 'PERFURADO')) return [C('PERFURADA'), 'perfurada'];
  if (em('CHAPA', 'PLACA') && has('DESGASTE', 'ANTIDESGASTE', 'ANTI DESGASTE')) return [C('HARDOX', 'FABRICA USINAGEM', 'HRM'), 'chapa desgaste'];
  if (has('HARDOX', 'USIAR', 'USI AR')) return [C('HARDOX'), 'hardox/usiar'];
  // antigo: sanduíche/trapezoidal/TR40 de aço (galv/galvalume/zincado) = Fábrica de Telha; alumínio = revenda
  if (first === 'TELHA')
    return !has('ALUMINIO') && (has('SANDUICHE', 'TRAPEZOIDAL', 'TR40', 'TR', 'GALVALUME', 'ZINCADO') || /\bGALV/.test(d))
      ? [C('TELHAS', 'FABRICA DE TELHA', 'UBERABA'), 'telha (fábrica)'] : [C('TELHAS'), 'telha'];
  if (em('TUBO', 'TUBOS')) return [C('TUBOS'), 'tubo'];
  if (em('CHAPA', 'CHAPAS', 'BOBINA', 'BLOCO', 'PRANCHAO', 'FITA')) return [C('CHAPAS'), 'chapa'];
  if (em('PARAFUSO', 'PORCA', 'ARRUELA', 'GRAMPO', 'CHUMBADOR', 'ABRACADEIRA', 'PRISIONEIRO', 'ESTOJO', 'REBITE', 'PINO', 'CONTRAPINO', 'TIRANTE')
    || (first === 'BARRA' && has('ROSCADA')))
    return [C('FIXAÇÃO'), 'fixação'];
  if (em('PERFIL', 'CANTONEIRA', 'BARRA', 'TARUGO', 'TRILHO', 'VIGA', 'ARMADURA', 'VERGALHAO', 'FERRO', 'METALON', 'U', 'W')) return [C('LAMINADOS'), 'laminado'];
  if (em('VALVULA', 'REGISTRO', 'PURGADOR', 'FILTRO')) return [C('VALVULA'), 'válvula'];
  if (em('JUNTA', 'JUNTAS', 'GAXETA', 'ANEL') && has('JUNTA', 'ESPIRALADA', 'VEDACAO', 'GAXETA', 'O RING', 'ORING')) return [C('JUNTAS'), 'junta'];
  if (em('JUNTA', 'JUNTAS')) return [C('JUNTAS'), 'junta'];
  if (em('CURVA', 'COTOVELO', 'TE', 'TEE', 'REDUCAO', 'NIPLE', 'LUVA', 'PESTANA', 'UNIAO', 'MEIA', 'BUCHA', 'BUJAO', 'TAMPAO', 'CAP', 'CRUZETA', 'JOELHO', 'ANILHA', 'CONECTOR', 'ADAPTADOR', 'NIPEL', 'WELDOLET', 'SOCKOLET', 'THREADOLET', 'SWAGE', 'ESPIGAO', 'CONEXAO', 'Y'))
    return [C('CONEXÕES'), 'conexão'];
  if (em('TELA', 'TELAS')) return [C('TELAS'), 'tela'];
  if (em('TINTA', 'PRIMER', 'THINNER', 'VERNIZ')) return [C('TINTAS'), 'tinta'];
  return [C('DIVERSOS'), null]; // sem regra → revisar
}

export function classificar(desc: string): { classe: Classe; como: string } {
  const ref = MAPA[codDe(desc)];
  if (ref) {
    let [f] = ref;
    const [, l, e] = ref;
    if (!f) { // antigo deixou a família em branco → família pela regra (ou Caldeiraria)
      const [r] = regra(desc);
      f = r[1] === l ? r[0] : l.includes('CALDEIRARIA') ? 'CALDEIRARIA' : 'DIVERSOS';
    }
    return { classe: [f, l, e], como: 'código já classificado no relatório anterior' };
  }
  const [classe, motivo] = regra(desc);
  return { classe, como: motivo ? `regra: ${motivo}` : 'SEM REGRA — conferir' };
}
