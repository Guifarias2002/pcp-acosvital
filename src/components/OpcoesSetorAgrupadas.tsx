// Opções de <select> de setor separadas em "Setores Flanges" × "Setores
// Caldeiraria" (pedido do usuário 25/09 — telas de Devolver/Retrabalho). Os
// setores comuns às duas fábricas (Emissão, Inspeção de Qualidade, Logística…)
// ficam em Flanges, onde nasceram. Mantém a ordem recebida dentro de cada grupo.
import { SETORES_CALDEIRARIA_MENU, SETORES_CALDEIRARIA_NOVOS, SETORES_CALDEIRARIA_LEGADO } from '@/lib/types';

const COMUNS = new Set(['emissao', 'qualidade', 'logistica']);
const CALDEIRARIA = new Set([...SETORES_CALDEIRARIA_MENU, ...SETORES_CALDEIRARIA_NOVOS, ...SETORES_CALDEIRARIA_LEGADO].filter(s => !COMUNS.has(s)));

export const ehSetorCaldeiraria = (cod: string) => CALDEIRARIA.has(cod);

export default function OpcoesSetorAgrupadas({ opcoes }: { opcoes: readonly (readonly [string, string])[] | [string, string][] }) {
  const flange = opcoes.filter(([c]) => !CALDEIRARIA.has(c));
  const cald = opcoes.filter(([c]) => CALDEIRARIA.has(c));
  return (
    <>
      {flange.length > 0 && (
        <optgroup label="⚙️ Setores Flanges">
          {flange.map(([cod, nome]) => <option key={cod} value={cod}>{nome}</option>)}
        </optgroup>
      )}
      {cald.length > 0 && (
        <optgroup label="🔥 Setores Caldeiraria">
          {cald.map(([cod, nome]) => <option key={cod} value={cod}>{nome}</option>)}
        </optgroup>
      )}
    </>
  );
}
