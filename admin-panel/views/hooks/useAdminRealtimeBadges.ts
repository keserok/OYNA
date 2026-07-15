/**
 * Kritik kuyruk rozetlerini canlı tutar (Kararlar Soru 68, 91-92).
 * payout/doğrulama/ihtilaf/silme kaynak tablolarındaki değişiklikte panel
 * istatistiklerini (sidebar rozetleri) debounce'lu yeniler. Realtime kopunca
 * 60 sn'lik poll fallback devreye girer. Tek yerden — her sayfa kendi
 * aboneliğini kurmaz.
 */
import { useEffect } from 'react';
import { supabase } from '../../../supabaseClient';
import { useDebouncedCallback } from './useDebouncedCallback';

const WATCHED_TABLES = [
  'payout_requests',
  'profiles',
  'pitches',
  'match_disputes',
  'provider_applications',
  'provider_identities',
  'user_reports',
] as const;

export function useAdminRealtimeBadges(
  active: boolean,
  onRefresh?: () => Promise<void> | void,
): void {
  const debouncedRefresh = useDebouncedCallback(() => { void onRefresh?.(); }, 2500);

  useEffect(() => {
    if (!active || !onRefresh) return;

    const poll = setInterval(() => { void onRefresh(); }, 60_000);

    let channel: ReturnType<typeof supabase.channel> | null = null;
    try {
      const ch = supabase.channel('admin-badge-stream');
      for (const table of WATCHED_TABLES) {
        ch.on('postgres_changes', { event: '*', schema: 'public', table }, debouncedRefresh);
      }
      ch.subscribe();
      channel = ch;
    } catch {
      // Realtime kurulamazsa poll fallback yeterli
    }

    return () => {
      clearInterval(poll);
      if (channel) void supabase.removeChannel(channel);
    };
  }, [active, onRefresh, debouncedRefresh]);
}
