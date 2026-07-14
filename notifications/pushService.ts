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
  | 'weekly_summary'
  // Sosyal taksonomi (Spec §7 — tümü kapatılabilir; sessiz mağduriyet yok)
  | 'friend_request'
  | 'friend_accepted'
  | 'referral_joined'
  | 'team_member_invite'
  | 'team_invite_accepted'
  | 'team_join_request'
  | 'team_join_approved'
  | 'team_join_rejected'
  | 'team_member_removed'
  | 'team_captain_transferred'
  | 'match_invite_joined'
  | 'match_tactic_assigned'
  | 'tactic_proposed'
  | 'tactic_approved'
  | 'tactic_rejected'
  | 'NEW_MESSAGE'
  | 'team_chat_message';

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
  match_reminder_1h:  { enabled: true,  mandatory: true  },
  match_reminder_24h: { enabled: true,  mandatory: false },
  nearby_match:       { enabled: false, mandatory: false },
  promo_offers:       { enabled: false, mandatory: false },
  weekly_summary:     { enabled: true,  mandatory: false },
  // Sosyal — varsayılan açık, hepsi kapatılabilir
  friend_request:           { enabled: true, mandatory: false },
  friend_accepted:          { enabled: true, mandatory: false },
  referral_joined:          { enabled: true, mandatory: false },
  team_member_invite:       { enabled: true, mandatory: false },
  team_invite_accepted:     { enabled: true, mandatory: false },
  team_join_request:        { enabled: true, mandatory: false },
  team_join_approved:       { enabled: true, mandatory: false },
  team_join_rejected:       { enabled: true, mandatory: false },
  team_member_removed:      { enabled: true, mandatory: false },
  team_captain_transferred: { enabled: true, mandatory: false },
  match_invite_joined:      { enabled: true, mandatory: false },
  match_tactic_assigned:    { enabled: true, mandatory: false },
  tactic_proposed:          { enabled: true, mandatory: false },
  tactic_approved:          { enabled: true, mandatory: false },
  tactic_rejected:          { enabled: true, mandatory: false },
  NEW_MESSAGE:              { enabled: true, mandatory: false },
  team_chat_message:        { enabled: true, mandatory: false },
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
  setSelectedConversationId?: (id: string | null) => void;
  setSelectedTeamChatId?: (id: string | null) => void;
  setTeamInitialTab?: (t: 'GENEL' | 'KADRO' | 'TAKTIK' | 'MACLAR' | null) => void;
}

// ─── UUID v4 format doğrulayıcı ──────────────────────────────────────────────
// Derin bağlantılardan gelen ID'lerin geçerli UUID formatında olduğunu kontrol eder.
// Bu sayede injection ve path traversal saldırıları engellenir.
const UUID_V4_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function isValidUuid(value: string | undefined): boolean {
  return !!value && UUID_V4_REGEX.test(value);
}

// İzin verilen kaynak türleri (whitelist) — bilinmeyen kaynaklar DASHBOARD'a düşer.
const ALLOWED_RESOURCES = new Set(['match', 'profile', 'team', 'messages', 'tactic', 'social']);

export const handleDeepLink = (
  deepLink: string,
  setView: (v: string) => void,
  actions: DeepLinkActions = {},
) => {
  if (!deepLink) return;

  // ─── Scheme Doğrulaması ─────────────────────────────────────────────────────
  // Yalnızca 'oyna://' scheme'ine izin ver. 'javascript:', 'file://' vb.
  // kötü niyetli scheme'ler işlenmez. Saldırganlar custom URL ile uygulama
  // içinde keyfi navigasyon tetiklemeye çalışabilir.
  const ALLOWED_SCHEME = 'oyna://';
  if (!deepLink.startsWith(ALLOWED_SCHEME)) {
    console.warn('[DeepLink] Bilinmeyen/izinsiz scheme engellendi:', deepLink.split('://')[0]);
    return;
  }

  let url: URL;
  try {
    url = new URL(deepLink.replace(ALLOWED_SCHEME, 'https://oyna.app/'));
  } catch {
    console.warn('[DeepLink] Geçersiz URL formatı engellendi:', deepLink);
    return;
  }

  const [resource, id, sub] = url.pathname.split('/').filter(Boolean);

  // ─── Kaynak Tipi Whitelist Kontrolü ────────────────────────────────────────
  if (resource && !ALLOWED_RESOURCES.has(resource)) {
    console.warn('[DeepLink] İzin verilmeyen kaynak tipi engellendi:', resource);
    setView('DASHBOARD');
    return;
  }

  switch (resource) {
    case 'match':
      // UUID doğrulaması: geçersiz formatlı ID'ler Supabase sorgusuna gönderilmez.
      if (actions.setSelectedMatch && isValidUuid(id)) {
        // Maç verisini Supabase'den çek ve MATCH_JOIN'e git
        supabase.from('matches').select('*').eq('id', id).maybeSingle().then(
          ({ data, error }) => {
            if (error || !data) {
              console.warn('[DeepLink] Maç bulunamadı veya çekilemedi:', error?.message ?? id);
              return;
            }
            actions.setSelectedMatch!(data);
            setView('MATCH_JOIN');
          },
          (e: unknown) => {
            console.warn('[DeepLink] Maç sorgusu başarısız:', e);
          },
        );
      }
      break;
    case 'profile':
      setView('PROFILE');
      break;
    case 'team':
      if (isValidUuid(id) && sub === 'chat' && actions.setSelectedTeamChatId) {
        actions.setSelectedTeamChatId(id!); // birleşik kutu → takım sohbeti
        setView('MESSAGES');
      } else if (isValidUuid(id) && actions.setSelectedTeamId) {
        actions.setSelectedTeamId(id!); // kimlik açıkça taşınır (A4/G42)
        if (sub === 'members' && actions.setTeamInitialTab) {
          actions.setTeamInitialTab('KADRO'); // Kadro → Bekleyenler
        }
        setView('MY_TEAM');
      } else {
        setView('SOCIAL');
      }
      break;
    case 'messages':
      if (isValidUuid(id) && actions.setSelectedConversationId) {
        actions.setSelectedConversationId(id!); // DM push'u → doğrudan sohbet
      }
      setView('MESSAGES');
      break;
    case 'tactic':
      if (isValidUuid(id) && actions.setStudioContext) {
        actions.setStudioContext({ tacticId: id! }); // Stüdyo tam hidre açılır
      }
      setView('STUDIO');
      break;
    case 'social':
      if (actions.setSocialTarget) {
        // Tab değerini whitelist ile sınırla — XSS / injection'a karşı
        const allowedTabs = ['TEAMS', 'FRIENDS'] as const;
        const tabRaw = (id || '').toUpperCase();
        const tab = allowedTabs.includes(tabRaw as any) ? (tabRaw as 'TEAMS' | 'FRIENDS') : 'FRIENDS';
        actions.setSocialTarget({
          tab,
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
  // Çift abonelik koruması: aynı topic'li eski kanal (StrictMode remount,
  // yeniden giriş, hızlı navigasyon) varsa önce kaldır. Yoksa zaten
  // .subscribe() olmuş kanala .on() eklemek "cannot add postgres_changes
  // callbacks ... after subscribe()" hatası fırlatır.
  const topic = `notifications:${userId}`;
  supabase.getChannels()
    .filter((c) => c.topic === `realtime:${topic}`)
    .forEach((c) => { supabase.removeChannel(c); });
  const channel = supabase
    .channel(topic)
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'notifications',
        filter: `user_id=eq.${userId}`,
      },
      (payload) => {
        // Sohbet push taşıyıcıları (inbox=false) uygulama-içi zile düşmez —
        // rozet kaynağı konuşma okunmamış sayaçlarıdır (N93).
        if ((payload.new as any)?.inbox === false) return;
        onNotification(payload.new);
      },
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
};
