// ═══════════════════════════════════════════════════════════════
// OYNA APP — Push Notification Servis
// Capacitor tabanlı, Firebase bağımsız push sistemi.
// Supabase'e push_token kaydeder, tercih filtrelemesi yapar.
// ═══════════════════════════════════════════════════════════════

import { PushNotifications, Token, PushNotificationSchema, ActionPerformed } from '@capacitor/push-notifications';
import { Capacitor } from '@capacitor/core';
import { supabase } from '../supabaseClient';

// ─── Bildirim Tercih Tipleri ──────────────────────────────────────
export interface NotificationPreference {
  enabled: boolean;
  mandatory: boolean;
}

export type NotificationPreferenceKey =
  | 'match_joined'
  | 'match_cancelled'
  | 'match_invite'
  | 'team_invite'
  | 'gk_accepted'
  | 'gk_rejected'
  | 'ref_accepted'
  | 'ref_rejected'
  | 'match_reminder_1h'
  | 'match_reminder_24h'
  | 'nearby_match'
  | 'promo_offers'
  | 'weekly_summary';

export type NotificationPreferences = Record<NotificationPreferenceKey, NotificationPreference>;

export const DEFAULT_NOTIFICATION_PREFERENCES: NotificationPreferences = {
  match_joined:       { enabled: true,  mandatory: true  },
  match_cancelled:    { enabled: true,  mandatory: true  },
  match_invite:       { enabled: true,  mandatory: true  },
  team_invite:        { enabled: true,  mandatory: true  },
  gk_accepted:        { enabled: true,  mandatory: true  },
  gk_rejected:        { enabled: true,  mandatory: true  },
  ref_accepted:       { enabled: true,  mandatory: true  },
  ref_rejected:       { enabled: true,  mandatory: true  },
  match_reminder_1h:  { enabled: true,  mandatory: false },
  match_reminder_24h: { enabled: true,  mandatory: false },
  nearby_match:       { enabled: false, mandatory: false },
  promo_offers:       { enabled: false, mandatory: false },
  weekly_summary:     { enabled: true,  mandatory: false },
};

// ─── Push Token Kaydı ────────────────────────────────────────────
export const savePushTokenToSupabase = async (token: string, userId: string) => {
  const platform = Capacitor.getPlatform(); // 'ios' | 'android' | 'web'

  const { error } = await supabase
    .from('profiles')
    .update({
      push_token: token,
      push_token_platform: platform,
      push_token_updated_at: new Date().toISOString(),
    })
    .eq('id', userId);

  if (error) {
    console.error('[PushService] Token kayıt hatası:', error.message);
    return false;
  }

  console.log('[PushService] Token kaydedildi:', platform, token.slice(-8));
  return true;
};

// ─── Deep Link Yöneticisi ─────────────────────────────────────────
// Hedef yükleri store aksiyonlarıyla taşınır (Spec §2.3): team/{id}
// artık kimliği DÜŞÜRMEZ; tactic/{id} Stüdyo'yu studioContext ile,
// social/{tab}/{subTab} Sosyal'i socialTarget ile açar.
// (Store'u doğrudan import edemeyiz — store bu modülü import ediyor.)
export interface DeepLinkActions {
  setSelectedMatch?: (m: any) => void;
  setSelectedTeamId?: (id: string | null) => void;
  setStudioContext?: (c: { teamId?: string; tacticId?: string } | null) => void;
  setSocialTarget?: (t: { tab: 'FRIENDS' | 'TEAMS'; subTab?: string; entityId?: string } | null) => void;
}

export const handleDeepLink = (
  deepLink: string,
  setView: (v: string) => void,
  actions: DeepLinkActions = {},
) => {
  if (!deepLink) return;

  // Format: oyna://match/UUID | oyna://team/UUID[/chat|members] |
  //         oyna://tactic/UUID | oyna://social/{tab}/{subTab} | oyna://profile/UUID
  const url = new URL(deepLink.replace('oyna://', 'https://oyna.app/'));
  const [resource, id, sub] = url.pathname.split('/').filter(Boolean);

  switch (resource) {
    case 'match':
      if (actions.setSelectedMatch && id) {
        // Maç verisini Supabase'den çek ve MATCH_JOIN'e git
        supabase.from('matches').select('*').eq('id', id).single().then(({ data }) => {
          if (data) {
            actions.setSelectedMatch!(data);
            setView('MATCH_JOIN');
          }
        });
      }
      break;
    case 'profile':
      setView('PROFILE');
      break;
    case 'team':
      if (id && actions.setSelectedTeamId) {
        actions.setSelectedTeamId(id); // kimlik açıkça taşınır (A4/G42)
        setView('MY_TEAM'); // /chat ve /members alt-hedefleri Küme 4'te
      } else {
        setView('SOCIAL');
      }
      break;
    case 'tactic':
      if (id && actions.setStudioContext) {
        actions.setStudioContext({ tacticId: id }); // Stüdyo tam hidre açılır
      }
      setView('STUDIO');
      break;
    case 'social':
      if (actions.setSocialTarget) {
        actions.setSocialTarget({
          tab: (id || '').toUpperCase() === 'TEAMS' ? 'TEAMS' : 'FRIENDS',
          subTab: sub ? sub.toUpperCase() : undefined,
        });
      }
      setView('SOCIAL');
      break;
    default:
      setView('DASHBOARD');
  }
};

// ─── Ana Başlatma Fonksiyonu ─────────────────────────────────────
export const initPushNotifications = async (
  userId: string,
  onInAppNotification?: (notification: PushNotificationSchema) => void,
  onDeepLink?: (link: string) => void,
): Promise<boolean> => {
  // Web platformunda Capacitor push çalışmaz, sessizce çık
  if (!Capacitor.isNativePlatform()) {
    console.log('[PushService] Web platformu tespit edildi — native push devre dışı.');
    return false;
  }

  try {
    // 1. Mevcut izin durumunu kontrol et
    let permission = await PushNotifications.checkPermissions();

    // 2. İzin henüz verilmemişse iste
    if (permission.receive === 'prompt' || permission.receive === 'prompt-with-rationale') {
      permission = await PushNotifications.requestPermissions();
    }

    if (permission.receive !== 'granted') {
      console.warn('[PushService] Bildirim izni reddedildi.');
      return false;
    }

    // 3. Cihazı push servisine kaydet
    await PushNotifications.register();

    // 4. Token Dinleyici
    PushNotifications.addListener('registration', async (token: Token) => {
      await savePushTokenToSupabase(token.value, userId);
    });

    // 5. Token Hata Dinleyici
    PushNotifications.addListener('registrationError', (error) => {
      console.error('[PushService] Kayıt hatası:', error.error);
    });

    // 6. Uygulama ÖN PLANDA iken gelen bildirim
    PushNotifications.addListener('pushNotificationReceived', (notification: PushNotificationSchema) => {
      console.log('[PushService] Ön plan bildirimi:', notification.title);
      if (onInAppNotification) {
        onInAppNotification(notification);
      }
    });

    // 7. Bildirime tıklandığında (uygulama arka planda veya kapalıyken)
    PushNotifications.addListener('pushNotificationActionPerformed', (action: ActionPerformed) => {
      const deepLink = action.notification.data?.deep_link;
      if (deepLink && onDeepLink) {
        onDeepLink(deepLink);
      }
    });

    console.log('[PushService] ✅ Başlatma tamamlandı.');
    return true;

  } catch (error) {
    console.error('[PushService] Başlatma hatası:', error);
    return false;
  }
};

// ─── Push Token Temizleme (Çıkış Yapınca) ───────────────────────
export const clearPushToken = async (userId: string) => {
  const { error } = await supabase
    .from('profiles')
    .update({
      push_token: null,
      push_token_platform: null,
    })
    .eq('id', userId);

  if (!error) {
    try {
      await PushNotifications.removeAllListeners();
    } catch (_) { /* Ignore */ }
  }
};

// ─── Supabase Realtime: In-App Bildirimleri Dinle ───────────────
export const subscribeToInAppNotifications = (
  userId: string,
  onNotification: (notification: any) => void,
) => {
  const channel = supabase
    .channel(`notifications:${userId}`)
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'notifications',
        filter: `user_id=eq.${userId}`,
      },
      (payload) => {
        onNotification(payload.new);
      },
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
};
