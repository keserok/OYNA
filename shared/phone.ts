// ═══════════════════════════════════════════════════════════════════════════
// TELEFON NUMARASI — TEK KAYNAK
//
// TELEFONLA GİRİŞ UYGULAMADAN KALDIRILDI (23 Ağustos 2026, kurucu kararı:
// "Bu ekranı tüm uygulamadan yok etmelisin ve yalnızca Apple ve Google
// girişinin kalmasını sağlamalısın.")
//
// Bu dosya eskiden giriş ekranının numara/kod adımlarını, kanal seçimini ve
// doğrulamasını besliyordu. O ekranlar SİLİNDİ; geriye yalnız numarayı
// GÖSTEREN yerler kaldı (Ayarlar → Profil Bilgileri, hizmet başvurusu) ve
// telefona bağlı özellikleri kapatan tek bayrak.
//
// NİYE BAYRAK YETMEDİ, NİYE SİLİNDİ: akış üç kez bayrakla karartıldı
// (SMS_OTP_ENABLED, VITE_DEV_MODE, VITE_DEMO_ACCOUNTS) ve üç kez geri geldi —
// bayrak yanlış ortama yazıldığında ekran yeniden çiziliyordu. Kurucu aynı
// numara ekranını üç kez bildirdi. Bayrak, silinmesi gereken bir şeyi gizler.
//
// ÖLÇÜLEN GERÇEK (22 Ağustos 2026, canlı yapılandırma denetimi): telefonla
// giriş HİÇ ÇALIŞMADI. Supabase Auth "Send SMS Hook" kapalı, sms_provider
// "twilio" ama hesap/anahtar yok, send-sms fonksiyonu HOOK_NOT_CONFIGURED
// dönüyor, auth.users'da telefonla girişi TAMAMLAMIŞ tek kullanıcı yok.
// Yani ekranda duran, hiçbir zaman kod göndermemiş ölü bir yoldu — ve Apple'ın
// 5.6 reddinin kökü buydu: "kod yalnız +90'a gidiyor" kısıtı herkes için
// çözülmek yerine incelemeciye özel bir kapıyla yamanmıştı.
//
// GERİ GELECEĞİ GÜN: önce SMS sağlayıcısı (Netgsm) yapılandırılır ve `send-sms`
// gerçekten kod gönderir; ekran ondan SONRA yazılır — tersi değil.
// Silinen kodun tarihi: git history @ 974402d
//   · views/AuthScreen.tsx    — numara + kod adımları
//   · views/PhoneLinkScreen.tsx — numara bağlama ekranı
//   · supabaseAuth.ts         — sendPhoneOtp / verifyPhoneOtp /
//                               requestPhoneLink / confirmPhoneLink
//   · shared/phone.ts         — checkPhone / formatPhoneInput / kanal seçimi
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Telefona bağlı özellikler açık mı? — KALICI OLARAK KAPALI.
 *
 * Ekranlar bunu okur ve numaraya dayanan bölümleri hiç çizmez:
 *   · Ayarlar → Profil Bilgileri: numarası olmayana "numara bağlı değil"
 *     kartı gösterilmez (çözümü olmayan bir engel göstermek App Store 2.1'de
 *     "uygulama bozuk" izlenimi bırakır),
 *   · Arkadaş ekle: rehber eşleştirme kartı çizilmez (numara yoksa eşleşme
 *     matematiksel olarak imkânsız; tüm rehberi isteyip karşılığında hiçbir
 *     şey vermemek 5.1.1 ihlalidir).
 *
 * Tek kaynak burası: her ekran kendi kararını verseydi biri açık biri kapalı
 * kalırdı. Yeniden açılacağı gün ÖNCE SMS sağlayıcısı yapılandırılır, SONRA
 * ekranlar yazılır ve bu sabit `true` olur.
 */
export const TELEFON_GIRISI_ACIK = false;

const stripNonDigits = (v: string): string => (v ?? '').replace(/\D/g, '');

/** Ekranda gösterim: +90 532 123 45 67 */
export const formatPhoneDisplay = (e164: string | null | undefined): string => {
  const d = stripNonDigits(e164 ?? '');
  if (!d) return '';
  if (d.startsWith('90') && d.length === 12) {
    const l = d.slice(2);
    return `+90 ${l.slice(0, 3)} ${l.slice(3, 6)} ${l.slice(6, 8)} ${l.slice(8, 10)}`;
  }
  return `+${d}`;
};

/** Numaranın son 4 hanesi — bildirim/özet metinlerinde tam numara yazmamak için. */
export const phoneLast4 = (e164: string | null | undefined): string =>
  stripNonDigits(e164 ?? '').slice(-4);
