/**
 * Saha sahibi bildirim tercihleri (Faz 8 · Karar #40-41).
 * Cihazlar arası senkron: profiles.notification_preferences (localStorage değil).
 * Olay bazlı anahtarlar — yeni rezervasyon / iptal / kapora / günlük özet.
 * Global push anahtarı (app_config.push_live_enabled) açılınca push olarak da gider;
 * kapalıyken tercihler yine kaydedilir (uygulama-içi bildirim geçerli).
 */
import React, { useEffect, useState } from 'react';
import { Bell, Loader2 } from 'lucide-react';
import { OwnerFullscreenModal } from './OwnerModalFrame';
import { useOwnerToast } from '../components/useOwnerToast';
import { supabase } from '../../../supabaseClient';
import {
  fetchNotificationPreferences,
  updateNotificationPreference,
} from '../../../notifications/notificationPreferences';
import type { NotificationPreferences, NotificationPreferenceKey } from '../../../notifications/pushService';

// F3i: 'owner_deposit_paid' ve 'owner_daily_summary' KALDIRILDI — bu type_key'lerle
// bildirim üreten hiçbir kod yok (yalnız şablon seed'i vardı); göndereni olmayan
// toggle kullanıcıyı yanıltıyordu. Gönderici yazılırsa buraya geri eklenir.
// 'owner_new_booking' operasyonel-kritik: tercih kapatılsa da uygulama-içi
// bildirim düşer (notify_booking_events bu olayda tercihe bakmaz).
const OWNER_EVENTS: { key: NotificationPreferenceKey; label: string; hint: string }[] = [
  { key: 'owner_new_booking', label: 'Yeni Rezervasyon', hint: 'Bir oyuncu sahanı rezerve ettiğinde (kritik — uygulama içi bildirim her zaman düşer)' },
  { key: 'owner_cancellation', label: 'İptal', hint: 'Bir rezervasyon iptal edildiğinde' },
];

export const OwnerNotificationsModal: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const notify = useOwnerToast();
  const [userId, setUserId] = useState<string | null>(null);
  const [prefs, setPrefs] = useState<NotificationPreferences | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    supabase.auth.getUser().then(async ({ data }) => {
      const uid = data.user?.id ?? null;
      if (!active) return;
      setUserId(uid);
      if (!uid) { setLoading(false); return; }
      try {
        setPrefs(await fetchNotificationPreferences(uid));
      } catch {
        notify('Bildirim tercihleri yüklenemedi.', 'error');
      } finally {
        if (active) setLoading(false);
      }
    });
    return () => { active = false; };
  }, [notify]);

  const toggle = async (key: NotificationPreferenceKey) => {
    if (!userId || !prefs) return;
    const next = !(prefs[key]?.enabled ?? true);
    setBusy(key);
    // İyimser güncelleme
    setPrefs({ ...prefs, [key]: { ...prefs[key], enabled: next } });
    try {
      const updated = await updateNotificationPreference(userId, key, next, prefs);
      if (updated) setPrefs(updated);
    } catch {
      setPrefs((p) => (p ? { ...p, [key]: { ...p[key], enabled: !next } } : p));
      notify('Kaydedilemedi. Tekrar dene.', 'error');
    } finally {
      setBusy(null);
    }
  };

  return (
    <OwnerFullscreenModal title="Bildirimler" onClose={onClose}>
      <div className="max-w-md mx-auto space-y-4">
        <div className="bg-blue-500/10 border border-blue-500/20 p-4 rounded-2xl flex items-start gap-3">
          <Bell size={18} className="text-blue-400 shrink-0 mt-0.5" />
          <p className="text-xs text-blue-200">
            Tercihlerin tüm cihazlarında geçerlidir. Yeni rezervasyon bildirimi kritik olduğu
            için uygulama içinde her zaman gösterilir. Telefon (push) bildirimi platform
            genelinde henüz aktif değil — açıldığında tercihlerin otomatik geçerli olur.
          </p>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-16 text-gray-500">
            <Loader2 size={22} className="animate-spin" />
          </div>
        ) : (
          <div className="bg-[#161B22] border border-white/5 rounded-3xl overflow-hidden">
            {OWNER_EVENTS.map((ev) => {
              const enabled = prefs?.[ev.key]?.enabled ?? true;
              return (
                <div key={ev.key} className="flex items-center justify-between p-4 border-b border-white/5 last:border-b-0">
                  <div className="min-w-0 pr-3">
                    <p className="text-sm font-bold text-white">{ev.label}</p>
                    <p className="text-[11px] text-gray-500 mt-0.5">{ev.hint}</p>
                  </div>
                  <button
                    type="button"
                    disabled={busy === ev.key}
                    onClick={() => toggle(ev.key)}
                    className="relative w-14 min-h-[44px] flex items-center justify-center shrink-0 disabled:opacity-50"
                  >
                    <span className={`relative block w-12 h-7 rounded-full transition-colors ${enabled ? 'bg-emerald-500' : 'bg-gray-600'}`}>
                      <span className={`absolute top-0.5 w-6 h-6 rounded-full bg-white transition-all ${enabled ? 'left-[22px]' : 'left-0.5'}`} />
                    </span>
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </OwnerFullscreenModal>
  );
};
