import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import path from 'path';
import {
  DEFAULT_DIAL_CODE, checkPhone, formatPhoneInput, formatPhoneDisplay,
  canSendOtpTo, otpChannelFor, WHATSAPP_OTP_ENABLED, phoneLast4,
} from '../../shared/phone';

// ═══════════════════════════════════════════════════════════════════════════
// TELEFON BİRİNCİL GİRİŞ — karar kilitleri (kurucu kararı, 17 Ağustos 2026)
//
// Bu dosya bir özellik testi değil, bir KARAR KİLİDİDİR: telefonun ana giriş
// yöntemi olduğu, şifre kavramının kaldırıldığı ve misafir modunun kapandığı
// kararları koda geri sızmaya karşı korur.
// ═══════════════════════════════════════════════════════════════════════════

const KOK = path.resolve(__dirname, '../..');
const oku = (rel: string) => readFileSync(path.join(KOK, rel), 'utf-8');

describe('numara kuralı — tek kaynak', () => {
  it('varsayılan ülke Türkiye', () => {
    expect(DEFAULT_DIAL_CODE).toBe('90');
  });

  it('geçerli TR cep numarası E.164 döner', () => {
    expect(checkPhone('532 123 45 67').e164).toBe('+905321234567');
  });

  it('kullanıcının başa koyduğu 0 sessizce düzeltilir', () => {
    // "0532…" Türkiye'de en yaygın yazım. Reddetmek yerine anlamak gerekir.
    expect(checkPhone('0532 123 45 67').e164).toBe('+905321234567');
  });

  it('numaranın içine tekrar yazılan ülke kodu yutulur', () => {
    expect(checkPhone('905321234567').e164).toBe('+905321234567');
  });

  it('5 ile başlamayan TR numarası reddedilir ve sebebi söylenir', () => {
    const r = checkPhone('212 123 45 67');
    expect(r.valid).toBe(false);
    expect(r.reason).toContain('5 ile başlar');
  });

  it('eksik haneli numara reddedilir', () => {
    expect(checkPhone('532 123').valid).toBe(false);
  });

  it('boş numara sessizce geçmez', () => {
    expect(checkPhone('').valid).toBe(false);
    expect(checkPhone('').reason).toBeTruthy();
  });

  it('yurt dışı numara biçim olarak geçerli olabilir', () => {
    expect(checkPhone('7911123456', '44').e164).toBe('+447911123456');
  });
});

describe('kanal kuralı — yurt dışına SMS YOK', () => {
  it('Türkiye SMS kanalındadır', () => {
    expect(otpChannelFor('90')).toBe('SMS');
    expect(canSendOtpTo('90')).toBe(true);
  });

  it('yurt dışı WhatsApp kanalındadır ve bugün KAPALIDIR', () => {
    expect(otpChannelFor('44')).toBe('WHATSAPP');
    expect(WHATSAPP_OTP_ENABLED).toBe(false);
    expect(canSendOtpTo('44')).toBe(false);
  });

  it('sunucu tarafı da yurt dışını kapatıyor (arayüze güvenilmez)', () => {
    const f = oku('supabase/functions/send-sms/index.ts');
    expect(f).toContain("Deno.env.get('WHATSAPP_ENABLED') === 'true'");
    expect(f).toContain('CHANNEL_UNAVAILABLE');
  });
});

describe('biçimlendirme', () => {
  it('yazarken gruplanır', () => {
    expect(formatPhoneInput('5321234567')).toBe('532 123 45 67');
  });

  it('gösterimde ülke kodu ile yazılır', () => {
    expect(formatPhoneDisplay('+905321234567')).toBe('+90 532 123 45 67');
  });

  it('son dört hane maskeleme için ayrı çıkar', () => {
    expect(phoneLast4('+905321234567')).toBe('4567');
  });
});

describe('şifre kavramı kaldırıldı', () => {
  const authService = oku('supabaseAuth.ts');

  it('e-posta + şifre giriş/kayıt yolları SİLİNDİ', () => {
    for (const fn of [
      'signInWithEmailPassword', 'signUpWithPassword',
      'requestPasswordReset', 'confirmPasswordReset', 'updateUserPassword',
      'sendEmailOtp', 'verifyEmailOtp',
    ]) {
      expect(authService, `${fn} hâlâ dışa veriliyor`).not.toContain(`export const ${fn}`);
    }
  });

  it('giriş ekranında şifre alanı yok', () => {
    const auth = oku('views/AuthScreen.tsx');
    expect(auth).not.toContain("type=\"password\"");
    expect(auth).not.toContain('Şifremi unuttum');
  });

  it('ayarlarda şifre değiştirme kartı yok', () => {
    const p = oku('components/settings/ProfileInfoPage.tsx');
    expect(p).not.toContain('ŞİFRE DEĞİŞTİR');
    expect(p).not.toContain('handleSavePassword');
  });
});

describe('telefon ana yol, Google/Apple ikincil', () => {
  it('giriş ekranı telefon OTP fonksiyonlarını kullanıyor', () => {
    const auth = oku('views/AuthScreen.tsx');
    expect(auth).toContain('sendPhoneOtp');
    expect(auth).toContain('verifyPhoneOtp');
  });

  it('Google ve Apple butonları duruyor', () => {
    const auth = oku('views/AuthScreen.tsx');
    expect(auth).toContain('handleGoogleLogin');
    expect(auth).toContain('handleAppleLogin');
  });

  it('Google native yola öncelik veriyor, tarayıcı yolu YEDEK kalıyor', () => {
    // Yedeğin silinmesi, istemci kimliği eksik bir derlemede girişi tamamen
    // öldürürdü. İkisi birlikte durmalı.
    expect(authService()).toContain('ensureNativeGoogle');
    expect(authService()).toContain('signInWithIdToken');
    expect(authService()).toContain('skipBrowserRedirect: true');
  });

  it('Google/Apple ile girenden numara isteniyor, eski e-posta hesapları muaf', () => {
    const app = oku('App.tsx');
    expect(app).toContain("user.provider === 'google'");
    expect(app).toContain("user.provider === 'apple'");
    expect(app).toContain('!user.phoneVerified');
    expect(app).toContain("resetNavigation('PHONE_LINK')");
    // 'email' sağlayıcısı kapıda ANILMAMALI — anıldığı an eski hesaplar kilitlenir.
    const kapi = app.slice(app.indexOf('const numaraGerekli'), app.indexOf('const numaraGerekli') + 220);
    expect(kapi).not.toContain("'email'");
  });

  function authService() { return oku('supabaseAuth.ts'); }
});

describe('SMS ucu güvenliği', () => {
  const f = oku('supabase/functions/send-sms/index.ts');

  it('imza doğrulaması olmadan çalışmıyor (fail-closed)', () => {
    expect(f).toContain('HOOK_NOT_CONFIGURED');
    expect(f).toContain('INVALID_SIGNATURE');
    expect(f).toContain('verifySignature');
  });

  it('tekrar saldırısına karşı zaman penceresi var', () => {
    expect(f).toContain('age > 300');
  });

  it('imza karşılaştırması sabit süreli', () => {
    expect(f).toContain('timingSafeEqual');
  });

  it('KOD hiçbir dalda loglanmıyor', () => {
    // Loga düşen kod, log okuyabilen herkes için hesap anahtarıdır.
    for (const satir of f.split('\n')) {
      if (!satir.includes('console.')) continue;
      expect(satir, `kod loglanıyor: ${satir.trim()}`).not.toMatch(/\botp\b/);
    }
  });

  it('numara loglarda maskeleniyor', () => {
    expect(f).toContain('maskPhone');
  });
});
