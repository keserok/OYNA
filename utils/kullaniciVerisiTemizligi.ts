// ════════════════════════════════════════════════════════════════════════
// CİHAZDA KALAN KULLANICI ARTIKLARININ TEMİZLİĞİ (26 Ağu 2026, KVKK).
//
// Çıkış eskiden yalnız oturum anahtarını siliyordu. Geride kalanlar:
// bölge/GPS kayıtları, taktik taslakları, panel düzeni, bilet anlık
// görüntüleri (saha/tarih/ücret), ana sayfa önbelleği (ad + bakiye),
// admin e-postası, başvuru taslağı. Ortak cihazda (tesis tableti, aile
// telefonu) bunlar sonraki kullanıcıya sızar.
//
// İKİ MOD:
//   'cikis'       → kullanıcıya ait veriler silinir; cihaz tercihleri
//                   (oyna.auth.hasAccount, oyna.auth.beniHatirla) ve
//                   GÖNDERİLMEMİŞ tahsilat kuyruğu (para!) KALIR.
//   'hesap-silme' → her şey: son e-posta ve hesap bayrağı da dahil.
//
// ÇAĞRI YERİ: supabaseAuth.logout() içinde signOut'tan ÖNCE (uid henüz
// eldeyken — ana sayfa önbelleği uid'li anahtarda yaşar) ve
// DeleteAccountModal'ın "hesabım silinsin" akışında 'hesap-silme' moduyla.
// ════════════════════════════════════════════════════════════════════════
import { Preferences } from '@capacitor/preferences';

/** Kullanıcıya ait localStorage anahtarları (tam ad). */
const KULLANICI_ANAHTARLARI = [
  'oyna_active_region',      // ham GPS koordinatlı bölge kaydı
  'oyna_selected_regions',   // aynı içeriğin dizisi
  'oyna.pendingIntent',      // yarım kalan niyet (view + matchId)
  'oyna_studio_draft_v1',    // taktik taslakları
  'owner_activeWidgets',     // tesis paneli düzeni
  'oyna_admin_email',        // admin girişi e-posta ön-dolumu
  'oyna.basvuru.taslak.v1',  // kaleci/hakem başvuru taslağı
];

/** Önekle taranan anahtarlar (ör. bilet anlık görüntüleri: oyna.ticket.<id>). */
const KULLANICI_ONEKLERI = ['oyna.ticket.'];

/** Yalnız hesap SİLME talebinde gidenler — çıkışta bilinçli olarak kalırlar:
 *  hasAccount "bu cihazda hesap var" bayrağıdır (AuthScreen giriş modunda
 *  açılır), sonEposta alan ön-dolumudur; ikisi de çıkan kullanıcının işine
 *  yarar, hesabı silinen kullanıcının ise cihazda izi kalmamalıdır. */
const HESAP_SILME_ANAHTARLARI = [
  'oyna.auth.hasAccount',
  'oyna.auth.sonEposta',
];

const guvenliSil = (anahtar: string): void => {
  try { window.localStorage.removeItem(anahtar); } catch { /* depo yoksa geç */ }
};

/**
 * Kullanıcıya ait cihaz verilerini siler. Asenkron kısımlar (Capacitor
 * Preferences) beklenir; localStorage kısmı senkron çalışır. Hata yutulur —
 * temizlik çıkışı asla engellememeli.
 */
export const kullaniciVerisiniTemizle = async (
  uid: string | null | undefined,
  mod: 'cikis' | 'hesap-silme' = 'cikis',
): Promise<void> => {
  if (typeof window === 'undefined') return;

  for (const anahtar of KULLANICI_ANAHTARLARI) guvenliSil(anahtar);

  // Önek taraması — anahtar listesi silme sırasında değişeceği için önce toplanır.
  try {
    const silinecekler: string[] = [];
    for (let i = 0; i < window.localStorage.length; i++) {
      const anahtar = window.localStorage.key(i);
      if (anahtar && KULLANICI_ONEKLERI.some((on) => anahtar.startsWith(on))) {
        silinecekler.push(anahtar);
      }
    }
    silinecekler.forEach(guvenliSil);
  } catch { /* depo taranamadıysa tek tek silinenler yeter */ }

  // Ana sayfa önbelleği Capacitor Preferences'ta yaşar (web'de CapacitorStorage
  // önekiyle localStorage'a düşer) — Preferences API'siyle silmek iki platformu
  // da kapsar. Anahtar şekli: hooks/useDashboardHome.ts · cacheKey.
  if (uid) {
    try { await Preferences.remove({ key: `oyna.home.v2.${uid}` }); } catch { /* geç */ }
  }

  if (mod === 'hesap-silme') {
    for (const anahtar of HESAP_SILME_ANAHTARLARI) guvenliSil(anahtar);
    // Hesabı silinen kullanıcının gönderilmemiş tahsilat kuyruğu da anlamsız
    // kalır (hesap gidiyor) — uid'li kuyruk anahtarı: services/offline/outbox.ts.
    if (uid) guvenliSil(`oyna_owner_outbox_v1.${uid}`);
  }
};
