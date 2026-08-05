// ════════════════════════════════════════════════════════════════════════════
// YÖNETİM PANELİ KÖPRÜSÜ — panel kodu oyuncu uygulamasına SIZMASIN diye
// ════════════════════════════════════════════════════════════════════════════
//
// ── SORUN ──────────────────────────────────────────────────────────────────
// `store.ts` iki yapı tarafından da kullanılır: oyuncu uygulaması (index.html)
// ve yönetim paneli (admin-panel/admin.html). Store içindeki yönetici eylemleri
// (saha sil, kullanıcı yasakla, ayar değiştir…) doğrudan
// `await import('./admin-panel/services/adminService')` yazıyordu.
//
// Bu satırlar hiçbir oyuncu için ÇALIŞMIYORDU ama derleyici açısından panel
// kodu OYUNCU YAPISININ parçasıydı: paket grafiğine giriyor, sunucuya
// yükleniyor ve isteyen indirebiliyordu. (Sunucu tarafı zaten kapalıydı —
// indiren biri veri alamaz — ama kod yine de oradaydı.)
//
// ── ÇÖZÜM ──────────────────────────────────────────────────────────────────
// Bağımlılık ters çevrildi. Store artık paneli ÇAĞIRMAZ; panel açılışta kendini
// buraya KAYDEDER. Oyuncu yapısında kayıt hiç yapılmadığı için:
//   • panel kodu oyuncu paketinin grafiğine HİÇ girmez,
//   • bir yönetici eylemi bir şekilde tetiklenirse net bir hata verir.
//
// ── NEDEN `import type` SERBEST ────────────────────────────────────────────
// Aşağıdaki tip alışverişi TypeScript tarafından derleme sırasında TAMAMEN
// silinir; üretilen JavaScript'te tek satır karşılığı yoktur. Yani tip bağı
// pakete hiçbir şey eklemez, buna karşılık panelin imzası değişirse burası
// derleme hatası verir — köprü sessizce eskimez.
// Denetim testi (tests/unit/panelSizintisi.test.ts) bu ayrımı uygular:
// `import type` serbest, DEĞER importu yasak.
import type * as AdminServis from '../admin-panel/services/adminService';

/** Panelin store'a verdiği yetenekler. Yalnız store'un ihtiyacı kadarı. */
export type AdminKoprusu = Pick<
  typeof AdminServis,
  | 'createPitchAdmin'
  | 'updatePitchAdmin'
  | 'deletePitchAdmin'
  | 'buildPitchPayloadFromUi'
  | 'updateGoalkeeperAdmin'
  | 'deleteGoalkeeperAdmin'
  | 'updateRefereeAdmin'
  | 'deleteRefereeAdmin'
  | 'deleteMatchAdmin'
  | 'banUserAdmin'
  | 'updateUserProfileAdmin'
  | 'verifyUserAdmin'
  | 'processAccountDeletion'
  | 'updateSettingsAdmin'
  | 'settingsToDbPayload'
  | 'persistAdminLog'
>;

/** Panel oturumu tipi — store bunu tuttuğu için burada yeniden yayınlanır. */
export type { AdminSession } from '../admin-panel/services/adminService';

let kayitli: AdminKoprusu | null = null;

/**
 * Panel açılışında BİR KEZ çağrılır (admin-panel/admin-main.tsx).
 * Oyuncu uygulaması bunu asla çağırmaz.
 */
export function adminKoprusunuKur(kopru: AdminKoprusu): void {
  kayitli = kopru;
}

/** Testler için: kaydı temizler. */
export function adminKoprusunuSifirla(): void {
  kayitli = null;
}

/** Panel kurulu mu? (ekranlar "bu eylem burada yok" diyebilsin diye) */
export function adminKoprusuHazirMi(): boolean {
  return kayitli !== null;
}

/**
 * Yönetici eylemini çözer.
 *
 * Oyuncu uygulamasında ASLA başarılı olmaz — ve olmaması doğrudur: bu eylemler
 * yalnız panelde vardır. Sunucu tarafı ayrıca kapalıdır (her admin_* fonksiyonu
 * `is_platform_admin()` / `require_super_admin()` kapısından geçer), yani bu
 * hata son savunma değil, ilk uyarıdır.
 */
export function adminKoprusu(): AdminKoprusu {
  if (!kayitli) {
    throw new Error(
      'Yönetici işlemi bu uygulamada kullanılamaz. Bu eylem yalnız yönetim panelinde çalışır.',
    );
  }
  return kayitli;
}
