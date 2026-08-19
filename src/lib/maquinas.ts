/**
 * Lista fixa de máquinas por setor — Usinagem e Furação. Usada no modal de
 * "Iniciar produção" pra registrar em qual máquina o item vai ser trabalhado.
 */

export interface GrupoMaquinas {
  categoria: string;
  maquinas: string[];
}

export const MAQUINAS_POR_SETOR: Record<string, GrupoMaquinas[]> = {
  usinagem: [
    { categoria: 'Tornos Manuais', maquinas: ['Torno Manual 01', 'Torno Manual 02', 'Torno Manual 03', 'Torno Manual 04', 'Torno Manual 05'] },
    { categoria: 'Tornos CNC', maquinas: ['ECN-40 II', 'ICN40-ROMI', 'GU600-INDEX', 'COSMOS30U', 'TRAUB-TN300', 'GU800-INDEX', 'CNC-GFG250', 'GFG450-INDEX'] },
    { categoria: 'Tornos Verticais', maquinas: ['Torno Vertical TOS', 'Torno Vertical Fagor', 'Torno Vertical Stanko'] },
  ],
  furacao: [
    { categoria: 'Furação', maquinas: ['DIS560-ROMI', 'FAMUP-MCX700', 'RHOTAN-001', 'Travis'] },
  ],
};

export function temMaquinas(setor: string): boolean {
  return setor === 'usinagem' || setor === 'furacao';
}

/**
 * Foto de cada máquina (arquivos estáticos em /public/maquinas). A chave é o
 * nome exato usado em MAQUINAS_POR_SETOR / gravado no apontamento. Máquina sem
 * foto aqui simplesmente não exibe imagem.
 */
export const FOTOS_MAQUINA: Record<string, string> = {
  'Torno Manual 01': '/maquinas/torno-manual-01.jpg',
  'Torno Manual 02': '/maquinas/torno-manual-02.jpg',
  'ECN-40 II': '/maquinas/ecn-40-ii.jpg',
  'ICN40-ROMI': '/maquinas/icn40-romi.jpg',
  'GU600-INDEX': '/maquinas/gu600-index.jpg',
  'COSMOS30U': '/maquinas/cosmos30u.jpg',
  'TRAUB-TN300': '/maquinas/traub-tn300.jpg',
  'GU800-INDEX': '/maquinas/gu800-index.jpg',
  'CNC-GFG250': '/maquinas/cnc-gfg250.jpg',
  'GFG450-INDEX': '/maquinas/gfg450-index.jpg',
  'DIS560-ROMI': '/maquinas/dis560-romi.jpg',
  'FAMUP-MCX700': '/maquinas/famup-mcx700.jpg',
  'RHOTAN-001': '/maquinas/rhotan-001.jpg',
  'Travis': '/maquinas/travis.jpg',
};

export function fotoMaquina(nome?: string | null): string | undefined {
  if (!nome) return undefined;
  return FOTOS_MAQUINA[nome.trim()];
}
