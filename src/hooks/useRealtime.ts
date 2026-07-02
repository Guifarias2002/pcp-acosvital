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
    let channel: ReturnType<NonNullable<typeof supabase>['channel']> | null = null;
    let mounted = true;

    function scheduleRefresh() {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        if (cachePrefixes?.length) invalidateCache(...cachePrefixes);
        cbRef.current();
      }, 400);
    }

    function subscribe() {
      if (!supabase) return;

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
        if (status === 'SUBSCRIBED') {
          if (fallbackTimer) clearInterval(fallbackTimer);
          fallbackTimer = setInterval(scheduleRefresh, FALLBACK_INTERVAL_MS);
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          if (channel) { supabase?.removeChannel(channel); channel = null; }
          setTimeout(() => { if (mounted) subscribe(); }, 3_000);
        }
      });
    }

    // Fallback imediato enquanto o WS ainda não conectou
    fallbackTimer = setInterval(scheduleRefresh, FALLBACK_INTERVAL_MS);

    subscribe();

    return () => {
      mounted = false;
      if (debounceTimer) clearTimeout(debounceTimer);
      if (fallbackTimer) clearInterval(fallbackTimer);
      if (channel) supabase?.removeChannel(channel);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tablesKey]);
}
