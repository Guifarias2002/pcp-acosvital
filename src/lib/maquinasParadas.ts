// Máquinas PARADAS (quebradas / em manutenção) — server-only. Registradas pelo
// Planejamento (/planejamento); enquanto ativas, bloqueiam iniciar/retomar
// naquela máquina. Tabela producao_maquina_parada (M59). Leitura tolerante: se
// a tabela ainda não existir, ninguém fica bloqueado.
import sql from './db';

export interface MaquinaParada {
  id: number; maquina: string; motivo: string; previsao_retorno: string | null;
  desde: string; criado_por_nome: string | null;
}

export async function listarMaquinasParadas(): Promise<MaquinaParada[]> {
  try {
    const rows = await sql`
      SELECT id, maquina, motivo, previsao_retorno::text AS previsao_retorno, desde, criado_por_nome
      FROM producao_maquina_parada WHERE liberada_em IS NULL ORDER BY desde
    `;
    return rows as unknown as MaquinaParada[];
  } catch { return []; }
}

export async function paradaDaMaquina(maquina: string | null | undefined): Promise<MaquinaParada | null> {
  if (!maquina) return null;
  try {
    const [row] = await sql`
      SELECT id, maquina, motivo, previsao_retorno::text AS previsao_retorno, desde, criado_por_nome
      FROM producao_maquina_parada WHERE liberada_em IS NULL AND lower(maquina) = lower(${maquina.trim()})
    `;
    return (row as unknown as MaquinaParada) || null;
  } catch { return null; }
}

// Mensagem padrão de bloqueio (servidor → operador).
export function msgMaquinaParada(p: MaquinaParada): string {
  return `A máquina ${p.maquina} está PARADA: ${p.motivo}. Escolha outra máquina ou fale com o Planejamento.`;
}
