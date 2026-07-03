/**
 * Admin oturum güvenliği (Karar #24):
 *  - Hareketsizlik: varsayılan 15 dk (app_config.admin_idle_timeout_minutes)
 *  - Mutlak oturum yaşı: varsayılan 8 saat (app_config.admin_session_max_hours)
 * Süre dolunca onExpire tetiklenir; çağıran taraf oturumu kapatır.
 * Config okunamazsa güvenli varsayılanlarla çalışır (fail-safe).
 */
import { useEffect, useRef } from 'react';
import { supabase } from '../../../supabaseClient';

const DEFAULT_IDLE_MS = 15 * 60_000;
const DEFAULT_MAX_AGE_MS = 8 * 3_600_000;
const CHECK_INTERVAL_MS = 30_000;
const ACTIVITY_THROTTLE_MS = 10_000;
const SESSION_START_KEY = 'oyna_admin_session_started_at';

export type AdminSessionExpireReason = 'idle' | 'absolute';

export function markAdminSessionStart(): void {
  try { sessionStorage.setItem(SESSION_START_KEY, String(Date.now())); } catch { /* storage opsiyonel */ }
}

export function clearAdminSessionStart(): void {
  try { sessionStorage.removeItem(SESSION_START_KEY); } catch { /* storage opsiyonel */ }
}

export function useAdminSessionGuard(
  active: boolean,
  onExpire: (reason: AdminSessionExpireReason) => void,
): void {
  const onExpireRef = useRef(onExpire);
  onExpireRef.current = onExpire;

  useEffect(() => {
    if (!active) return;

    let idleMs = DEFAULT_IDLE_MS;
    let maxAgeMs = DEFAULT_MAX_AGE_MS;
    let lastActivity = Date.now();
    let lastBump = 0;
    let expired = false;

    // Oturum başlangıcı: sekme yenilense de korunur (sessionStorage)
    let startedAt = Date.now();
    try {
      const stored = sessionStorage.getItem(SESSION_START_KEY);
      if (stored && Number(stored) > 0) startedAt = Number(stored);
      else sessionStorage.setItem(SESSION_START_KEY, String(startedAt));
    } catch { /* storage opsiyonel */ }

    // Panelden ayarlanabilir süreler (best-effort; hata → varsayılan)
    void supabase
      .rpc('admin_fetch_config')
      .then(({ data }) => {
        if (!Array.isArray(data)) return;
        for (const row of data as Array<{ key: string; value: unknown }>) {
          const num = Number(row.value);
          if (row.key === 'admin_idle_timeout_minutes' && num >= 5) idleMs = num * 60_000;
          if (row.key === 'admin_session_max_hours' && num >= 1) maxAgeMs = num * 3_600_000;
        }
      });

    const bump = () => {
      const now = Date.now();
      if (now - lastBump < ACTIVITY_THROTTLE_MS) return;
      lastBump = now;
      lastActivity = now;
    };

    const events: Array<keyof WindowEventMap> = ['mousemove', 'mousedown', 'keydown', 'scroll', 'touchstart'];
    events.forEach((e) => window.addEventListener(e, bump, { passive: true }));

    const timer = setInterval(() => {
      if (expired) return;
      const now = Date.now();
      if (now - startedAt > maxAgeMs) {
        expired = true;
        onExpireRef.current('absolute');
      } else if (now - lastActivity > idleMs) {
        expired = true;
        onExpireRef.current('idle');
      }
    }, CHECK_INTERVAL_MS);

    return () => {
      clearInterval(timer);
      events.forEach((e) => window.removeEventListener(e, bump));
    };
  }, [active]);
}
