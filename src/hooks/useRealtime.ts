'use client';
import { useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabase-client';
import { invalidateCache } from '@/lib/api';

/**
 * Assina mudanças em `tables` via Supabase WebSocket e chama `onRefresh`
 * (com debounce de 400ms) quando qualquer linha é inserida/atualizada/deletada.
 *
 * `cachePrefixes` lista as chaves de cache client-side a invalidar antes do refresh,
 * garantindo que o próximo fetch busque dados frescos mesmo que o TTL ainda não tenha expirado.
 */
export function useRealtime(
  tables: string[],
  onRefresh: () => void,
  cachePrefixes?: string[],
) {
  const cbRef = useRef(onRefresh);
  cbRef.current = onRefresh;

  const tablesKey = tables.join(',');

  useEffect(() => {
    if (!supabase) return; // env vars não configuradas

    let timer: ReturnType<typeof setTimeout> | null = null;

    function scheduleRefresh() {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        if (cachePrefixes?.length) invalidateCache(...cachePrefixes);
        cbRef.current();
      }, 400);
    }

    const channelName = `rt-${tablesKey}-${Math.random().toString(36).slice(2, 8)}`;
    const channel = supabase.channel(channelName);

    for (const table of tables) {
      channel.on(
        'postgres_changes' as Parameters<typeof channel.on>[0],
        { event: '*', schema: 'public', table },
        scheduleRefresh,
      );
    }

    channel.subscribe();

    return () => {
      if (timer) clearTimeout(timer);
      supabase?.removeChannel(channel);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tablesKey]);
}
