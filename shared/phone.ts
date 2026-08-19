// ═══════════════════════════════════════════════════════════════════════════
// TELEFON NUMARASI — TEK KAYNAK
//
// Telefon, OYNA'nın ANA giriş yöntemidir (kurucu kararı, 17 Ağustos 2026):
// kullanıcı numarasını yazar, SMS ile gelen 6 haneli kodu girer, girer.
// Google ve Apple ikincil yollardır ve onlarla girenden de numara istenir
// (tesis sahibi oyuncuya ulaşabilmeli).
//
// NEDEN BURADA: numara üç ayrı yerde işlenir — giriş ekranı, profil, sunucu.
// Üçü ayrı kural yazarsa "0532…" bir yerde geçer, ötekinde geçmez ve kullanıcı
// neden reddedildiğini anlamaz. Kural TEK yerde; ekran da sunucu da bunu okur.
//
// KANAL KURALI (kurucu kararı): Türkiye numaralarına SMS gider. Yurt dışı
// numaralara SMS GÖNDERİLMEZ; onlar için WhatsApp kanalı tasarlandı ama
// WhatsApp Business hesabı açılana dek KAPALIDIR — bu dosya kapalı olduğunu
// bilir ve ekran dürüst bir cümleyle Google/Apple'a yönlendirir.
// ═══════════════════════════════════════════════════════════════════════════

/** Varsayılan ülke: Türkiye. Ekran bunu seçili açar. */
export const DEFAULT_DIAL_CODE = '90';

/** SMS gönderebildiğimiz ülke kodları. Bugün yalnız Türkiye. */
export const SMS_DIAL_CODES = ['90'] as const;

/**
 * WhatsApp kanalı açık mı? Meta WhatsApp Business hesabı + onaylı şablon
 * gerektirir; hesap açılınca burası `true` yapılır ve sunucudaki
 * `WHATSAPP_ENABLED` gizli anahtarı da açılır. İkisi birlikte — yarım açılış yok.
 */
export const WHATSAPP_OTP_ENABLED = false;

export type OtpChannel = 'SMS' | 'WHATSAPP';

/** Bu ülke koduna hangi kanaldan kod gider? */
export const otpChannelFor = (dialCode: string): OtpChannel =>
  (SMS_DIAL_CODES as readonly string[]).includes(stripNonDigits(dialCode)) ? 'SMS' : 'WHATSAPP';

/** Bu numaraya bugün kod gönderebiliyor muyuz? */
export const canSendOtpTo = (dialCode: string): boolean =>
  otpChannelFor(dialCode) === 'SMS' || WHATSAPP_OTP_ENABLED;

const stripNonDigits = (v: string): string => (v ?? '').replace(/\D/g, '');

export interface PhoneCheck {
  valid: boolean;
  /** E.164 biçimi: +905321234567 — yalnız geçerliyse dolu. */
  e164: string | null;
  /** Kullanıcıya gösterilecek tek cümlelik sebep. */
  reason?: string;
}

/**
 * Ülke kodu + yerel numarayı doğrular ve E.164'e çevirir.
 *
 * Türkiye kuralı: 10 hane, 5 ile başlar (5XX XXX XX XX). Kullanıcı başa 0
 * koyarsa ya da +90'ı numaranın içine tekrar yazarsa SESSİZCE düzeltilir —
 * "yanlış yazdın" demek yerine anlamak, giriş ekranında en çok işe yarayan şey.
 */
export const checkPhone = (rawLocal: string, rawDial: string = DEFAULT_DIAL_CODE): PhoneCheck => {
  const dial = stripNonDigits(rawDial);
  let local = stripNonDigits(rawLocal);

  if (!dial) return { valid: false, e164: null, reason: 'Ülke kodunu gir.' };
  if (!local) return { valid: false, e164: null, reason: 'Telefon numaranı gir.' };

  // Kullanıcı ülke kodunu numaranın içine de yazmış olabilir: "905321234567".
  if (local.startsWith(dial) && local.length > dial.length) local = local.slice(dial.length);
  // Türkiye'de alışkanlık başa 0 koymaktır: "0532…" → "532…".
  while (local.startsWith('0')) local = local.slice(1);

  if (dial === '90') {
    if (!local.startsWith('5')) {
      return { valid: false, e164: null, reason: 'Türkiye cep numarası 5 ile başlar (örnek: 532 123 45 67).' };
    }
    if (local.length !== 10) {
      return { valid: false, e164: null, reason: 'Numara 10 haneli olmalı (örnek: 532 123 45 67).' };
    }
  } else if (local.length < 6 || local.length > 15) {
    return { valid: false, e164: null, reason: 'Numara geçerli görünmüyor.' };
  }

  return { valid: true, e164: `+${dial}${local}` };
};

/**
 * Yazarken okunur hâle getirir: "5321234567" → "532 123 45 67".
 * Yalnız Türkiye biçimi gruplanır; diğer ülkelerde numara olduğu gibi kalır
 * (her ülkenin kendi gruplaması var, yanlış gruplamak okunurluğu bozar).
 */
export const formatPhoneInput = (raw: string, dialCode: string = DEFAULT_DIAL_CODE): string => {
  const dial = stripNonDigits(dialCode);
  let d = stripNonDigits(raw);
  if (dial === '90') {
    while (d.startsWith('0')) d = d.slice(1);
    d = d.slice(0, 10);
    const p = [d.slice(0, 3), d.slice(3, 6), d.slice(6, 8), d.slice(8, 10)].filter(Boolean);
    return p.join(' ');
  }
  return d.slice(0, 15);
};

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
