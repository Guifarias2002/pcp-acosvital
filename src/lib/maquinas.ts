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
