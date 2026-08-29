'use client';
import { useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabase-client';
import { invalidateCache } from '@/lib/api';

const FALLBACK_INTERVAL_MS = 15_000; // 15s de fallback caso o WS caia

export function useRealtime(
  tables: string[],
  onRefresh: () => void,
  cachePrefixes?: string[],
) {
  const cbRef = useRef(onRefresh);
  cbRef.current = onRefresh;

  const tablesKey = tables.join(',');

  useEffect(() => {
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    let fallbackTimer: ReturnType<typeof setInterval> | null = null;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    let channel: ReturnType<NonNullable<typeof supabase>['channel']> | null = null;
    let mounted = true;

    function scheduleRefresh() {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        if (cachePrefixes?.length) invalidateCache(...cachePrefixes);
        cbRef.current();
      }, 400);
    }

    // Remove qualquer canal pendurado antes de abrir outro. Sem isso, em wifi
    // instavel (chao de fabrica) a reconexao via retry E via visibilitychange
    // podiam criar canais sobrepostos ao longo de horas — cada um segurando um
    // WebSocket e listeners — ate o tablet travar. Garante 1 canal por vez.
    function teardownChannel() {
      if (channel) { supabase?.removeChannel(channel); channel = null; }
    }

    function subscribe() {
      if (!supabase || !mounted) return;
      teardownChannel(); // nunca deixa um canal antigo pendurado

      const channelName = `rt-${tablesKey}-${Math.random().toString(36).slice(2, 8)}`;
      channel = supabase.channel(channelName);

      for (const table of tables) {
        channel.on(
          'postgres_changes' as Parameters<typeof channel.on>[0],
          { event: '*', schema: 'public', table },
          scheduleRefresh,
        );
      }

      channel.subscribe((status: string) => {
        if (!mounted) return;
        // Nao desliga o polling de seguranca so por causa do status "SUBSCRIBED": o
        // handshake do canal pode ter sucesso mesmo que o RLS bloqueie a entrega real
        // dos eventos de mudanca, o que deixaria a tela sem nenhuma atualizacao
        // automatica. O polling de 15s fica sempre ativo como garantia; o WebSocket,
        // quando entrega eventos de verdade, so faz a atualizacao chegar mais rapido.
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          teardownChannel();
          if (retryTimer) clearTimeout(retryTimer); // um retry por vez
          retryTimer = setTimeout(() => { if (mounted) subscribe(); }, 3_000);
        }
      });
    }

    // Polling de seguranca — sempre ativo, garante atualizacao em ate 15s
    // independente do WebSocket conseguir entregar eventos ou nao.
    fallbackTimer = setInterval(scheduleRefresh, FALLBACK_INTERVAL_MS);

    subscribe();

    // Tablets/celulares suspendem timers (o polling de 15s e a conexao do
    // WebSocket) quando a tela trava ou o app vai pra segundo plano. Sem isso,
    // uma tela deixada aberta e "esquecida" so atualiza quando o usuario
    // recarrega manualmente. Ao voltar a ficar visivel, forca atualizacao
    // imediata e reconecta o canal se ele tiver caido.
    function onVisibilityChange() {
      if (document.visibilityState !== 'visible' || !mounted) return;
      if (cachePrefixes?.length) invalidateCache(...cachePrefixes);
      cbRef.current();
      if (!channel) subscribe();
    }
    document.addEventListener('visibilitychange', onVisibilityChange);
    window.addEventListener('focus', onVisibilityChange);

    return () => {
      mounted = false;
      if (debounceTimer) clearTimeout(debounceTimer);
      if (fallbackTimer) clearInterval(fallbackTimer);
      if (retryTimer) clearTimeout(retryTimer);
      teardownChannel();
      document.removeEventListener('visibilitychange', onVisibilityChange);
      window.removeEventListener('focus', onVisibilityChange);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tablesKey]);
}
