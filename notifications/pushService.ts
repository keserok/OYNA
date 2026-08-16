// ═══════════════════════════════════════════════════════════════
// OYNA APP — Push Notification Servis
// Capacitor tabanlı, Firebase bağımsız push sistemi.
// Supabase'e push_token kaydeder, tercih filtrelemesi yapar.
// ═══════════════════════════════════════════════════════════════

import { PushNotifications, Token, PushNotificationSchema, ActionPerformed } from '@capacitor/push-notifications';
import { Capacitor } from '@capacitor/core';
import { supabase } from '../supabaseClient';
// Derin bağlantı maçı HAM satır değil, map'lenmiş MatchListing olarak taşır
// (BULGU-100). matchService yalnız supabaseClient + types import ettiği için
// döngü riski yok.
import { getMatchDetails } from '../services/matchService';

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
  | 'match_invite_declined'
  | 'match_tactic_assigned'
  | 'tactic_proposed'
  | 'tactic_approved'
  | 'tactic_rejected'
  | 'NEW_MESSAGE'
  | 'team_chat_message'
  // Saha sahibi (owner) olayları — hepsi kapatılabilir
  | 'owner_new_booking'
  | 'owner_cancellation'
  | 'owner_deposit_paid'
  | 'owner_daily_summary';

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
  // IP-06/BULGU-078: yakındaki maç ilanı artık gerçek bir üreticiye sahip
  // (broadcast_open_slot) — varsayılan açık; sınırlar sunucuda.
  nearby_match:       { enabled: true,  mandatory: false },
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
  match_invite_declined:    { enabled: true, mandatory: false },
  match_tactic_assigned:    { enabled: true, mandatory: false },
  tactic_proposed:          { enabled: true, mandatory: false },
  tactic_approved:          { enabled: true, mandatory: false },
  tactic_rejected:          { enabled: true, mandatory: false },
  NEW_MESSAGE:              { enabled: true, mandatory: false },
  team_chat_message:        { enabled: true, mandatory: false },
  // Saha sahibi olayları — varsayılan açık, tümü kapatılabilir
  owner_new_booking:        { enabled: true, mandatory: false },
  owner_cancellation:       { enabled: true, mandatory: false },
  owner_deposit_paid:       { enabled: true, mandatory: false },
  owner_daily_summary:      { enabled: true, mandatory: false },
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
  /** A4: destek cevabı bildirimi Ayarlar'ın Destek alt sayfasını doğrudan açar. */
  setSettingsSubPage?: (p: string | null) => void;
  /** Sessiz hata yerine kullanıcıya geri bildirim. GlobalToast'ı buraya import
   *  etmek yerine enjekte ediyoruz — store/supabaseAuth bu modülü import ettiği
   *  için yeni React bağımlılığı sokulmaz. */
  showToast?: (message: string, variant?: 'error' | 'success') => void;
}

// ─── UUID v4 format doğrulayıcı ──────────────────────────────────────────────
// Derin bağlantılardan gelen ID'lerin geçerli UUID formatında olduğunu kontrol eder.
// Bu sayede injection ve path traversal saldırıları engellenir.
const UUID_V4_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function isValidUuid(value: string | undefined): boolean {
  return !!value && UUID_V4_REGEX.test(value);
}

// İzin verilen kaynak türleri (whitelist) — bilinmeyen kaynaklar DASHBOARD'a düşer.
// A3/A4 (4 Ağustos 2026): 'wallet', 'owner', 'support', 'bookings' eklendi.
// Önce yoklardı; iade bildirimi 'oyna://wallet' taşıyor ama whitelist'te
// olmadığı için 10 iade bildirimi cüzdan yerine DASHBOARD'a düşüyordu.
const ALLOWED_RESOURCES = new Set([
  'match', 'profile', 'team', 'messages', 'tactic', 'social',
  'wallet', 'owner', 'support', 'bookings',
]);

/** Dönüş `true` = görünüm GERÇEKTEN değişti. Çağıran (bildirim sheet'i) buna
 *  bakarak kendini kapatır; başarısızlıkta açık kalır (BULGU-016). */
export const handleDeepLink = async (
  deepLink: string,
  setView: (v: string) => void,
  actions: DeepLinkActions = {},
): Promise<boolean> => {
  if (!deepLink) return false;

  // ─── Scheme Doğrulaması ─────────────────────────────────────────────────────
  // Yalnızca 'oyna://' scheme'ine izin ver. 'javascript:', 'file://' vb.
  // kötü niyetli scheme'ler işlenmez. Saldırganlar custom URL ile uygulama
  // içinde keyfi navigasyon tetiklemeye çalışabilir.
  const ALLOWED_SCHEME = 'oyna://';
  if (!deepLink.startsWith(ALLOWED_SCHEME)) {
    console.warn('[DeepLink] Bilinmeyen/izinsiz scheme engellendi:', deepLink.split('://')[0]);
    return false;
  }

  let url: URL;
  try {
    url = new URL(deepLink.replace(ALLOWED_SCHEME, 'https://oyna.app/'));
  } catch {
    console.warn('[DeepLink] Geçersiz URL formatı engellendi:', deepLink);
    return false;
  }

  const [resource, id, sub] = url.pathname.split('/').filter(Boolean);

  // ─── Kaynak Tipi Whitelist Kontrolü ────────────────────────────────────────
  if (resource && !ALLOWED_RESOURCES.has(resource)) {
    console.warn('[DeepLink] İzin verilmeyen kaynak tipi engellendi:', resource);
    setView('DASHBOARD');
    return true;
  }

  switch (resource) {
    case 'match': {
      // UUID doğrulaması: geçersiz formatlı ID'ler Supabase sorgusuna gönderilmez.
      if (!isValidUuid(id)) return false;
      // BULGU-100: ham satır DEĞİL, map'lenmiş maç. getMatchDetails
      // gk_id→gkId, away_gk_id→awayGkId, ref_id→refereeId dönüşümünü yapar;
      // ham satırla gidilirse PostMatchEval kaleci kartlarını hiç çizmez.
      const m = await getMatchDetails(id!);
      if (!m) {
        actions.showToast?.('Maç açılamadı. Bağlantını kontrol edip tekrar dene.', 'error');
        return false;
      }
      actions.setSelectedMatch?.(m);
      // Alt yol 'eval' ise değerlendirme ekranı (F2.1), yoksa lobi.
      setView(sub === 'eval' ? 'POST_MATCH_EVAL' : 'MATCH_JOIN');
      return true;
    }
    case 'profile':
      setView('PROFILE');
      return true;
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
      return true;
    case 'messages':
      if (isValidUuid(id) && actions.setSelectedConversationId) {
        actions.setSelectedConversationId(id!); // DM push'u → doğrudan sohbet
      }
      setView('MESSAGES');
      return true;
    case 'tactic':
      if (isValidUuid(id) && actions.setStudioContext) {
        actions.setStudioContext({ tacticId: id! }); // Stüdyo tam hidre açılır
      }
      setView('STUDIO');
      return true;
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
      return true;
    // ─── A3/A4 (4 Ağustos 2026) — daha önce hiçbiri tanınmıyordu ───────────
    case 'wallet':
      // Cüzdan lansmanda kapalı (shared/featureFlags.ts). Eski bir iade/ödeme
      // bildirimi bu adresi taşıyorsa kullanıcıyı parasının bağlamına götür:
      // maç/rezervasyon listesi. Adres tanınmaya devam eder — bildirim ölmez.
      setView('MY_MATCHES');
      return true;
    case 'owner':
      // Saha sahibine giden bildirimler (yeni rezervasyon · iptal · talep sonucu).
      setView('OWNER_PANEL');
      return true;
    case 'support':
      // Destek cevabı → Ayarlar içindeki Destek alt sayfası doğrudan açılır.
      actions.setSettingsSubPage?.('support');
      setView('SETTINGS');
      return true;
    case 'bookings':
      // Tesis rezervasyonu iptal etti → oyuncunun maç/rezervasyon listesi.
      setView('MY_MATCHES');
      return true;
    default:
      setView('DASHBOARD');
      return true;
  }
};

// ─── Ana Başlatma Fonksiyonu ─────────────────────────────────────
export const initPushNotifications = async (
  userId: string,
  onInAppNotification?: (notification: PushNotificationSchema) => void,
  onDeepLink?: (link: string) => void,
  /** D2 (4 Ağustos 2026) — izin SORULSUN mu?
   *
   *  Eskiden bu fonksiyon çağrıldığı anda izin isterdi ve girişte çağrılırdı:
   *  kullanıcı henüz uygulamada hiçbir şey yapmamışken telefon "bildirim
   *  göndersin mi?" diye soruyordu. Sonuç canlıda ölçüldü: 35 profil, izin
   *  veren SIFIR kişi. Telefon bu izni bir kez sorar; "hayır" diyen kullanıcı
   *  ayarlardan elle açmadıkça bir daha bildirim alamaz.
   *
   *  Artık varsayılan `false`: giriş anında YALNIZCA zaten izin verilmişse
   *  kayıt yapılır, kimseye soru sorulmaz. `true` yalnız doğru anda —
   *  kullanıcı bir maça katıldıktan ve değerini gördükten sonra — geçilir. */
  izinIste: boolean = false,
): Promise<boolean> => {
  // Web platformunda Capacitor push çalışmaz, sessizce çık
  if (!Capacitor.isNativePlatform()) {
    console.log('[PushService] Web platformu tespit edildi — native push devre dışı.');
    return false;
  }

  try {
    // 1. Mevcut izin durumunu kontrol et
    let permission = await PushNotifications.checkPermissions();

    // 2. İzin henüz verilmemişse — YALNIZ doğru anda iste (D2)
    if (permission.receive === 'prompt' || permission.receive === 'prompt-with-rationale') {
      if (!izinIste) {
        console.log('[PushService] İzin henüz sorulmadı — doğru ana bırakıldı (D2).');
        return false;
      }
      permission = await PushNotifications.requestPermissions();
    }

    if (permission.receive !== 'granted') {
      console.warn('[PushService] Bildirim izni reddedildi.');
      return false;
    }

    // 3. Token dinleyicileri register()'dan ÖNCE bağlanır — kayıt tamamlanıp
    // token geldiğinde dinleyici hazır olmazsa olay kaçar (iOS'ta APNs token'ı
    // hızlı dönebilir; sıralama bu yarışı ortadan kaldırır).
    PushNotifications.addListener('registration', async (token: Token) => {
      await savePushTokenToSupabase(token.value, userId);
    });

    PushNotifications.addListener('registrationError', (error) => {
      console.error('[PushService] Kayıt hatası:', error.error);
    });

    // 4. Cihazı push servisine kaydet
    await PushNotifications.register();

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
