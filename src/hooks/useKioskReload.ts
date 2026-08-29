'use client';
import { useEffect } from 'react';

// Higiene de quiosque para telas ligadas 24/7 no chao de fabrica (tablets do
// setor). Depois de muitas horas aberta, uma SPA acumula memoria/estado e o
// tablet acaba travando. Este hook recarrega a pagina sozinho para "zerar" esse
// acumulo — mas SO quando e seguro: a pagina precisa estar velha (aberta ha mais
// que `maxAbertoMs`) E fora de uso (tela apagada/app em segundo plano OU sem
// nenhum toque ha mais que `ociosoMs`). Nunca recarrega no meio do trabalho do
// operador.
export function useKioskReload(opts?: { maxAbertoMs?: number; ociosoMs?: number }) {
  const maxAbertoMs = opts?.maxAbertoMs ?? 6 * 60 * 60 * 1000; // 6h aberta
  const ociosoMs = opts?.ociosoMs ?? 3 * 60 * 1000;           // 3min sem toque

  useEffect(() => {
    const abertoDesde = Date.now();
    let ultimaInteracao = Date.now();
    let recarregando = false;

    const marcar = () => { ultimaInteracao = Date.now(); };
    const eventos: (keyof WindowEventMap)[] = ['pointerdown', 'keydown', 'touchstart', 'wheel'];
    eventos.forEach(e => window.addEventListener(e, marcar, { passive: true }));

    function talvezRecarregar() {
      if (recarregando) return;
      const agora = Date.now();
      const velha = agora - abertoDesde > maxAbertoMs;
      if (!velha) return;
      const oculta = document.visibilityState === 'hidden';
      const ociosa = agora - ultimaInteracao > ociosoMs;
      if (oculta || ociosa) {
        recarregando = true;
        window.location.reload();
      }
    }

    const id = setInterval(talvezRecarregar, 60 * 1000);
    document.addEventListener('visibilitychange', talvezRecarregar);

    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', talvezRecarregar);
      eventos.forEach(e => window.removeEventListener(e, marcar));
    };
  }, [maxAbertoMs, ociosoMs]);
}
