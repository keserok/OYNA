/**
 * HATA METNİ SÜPRÜMÜ — geri sökülmesin (26 Ağustos 2026)
 *
 * Bu oturumda üç ayrı kullanıcı yarası kapatıldı:
 *
 *   1. `err?.message || 'yedek'` kalıbı ham İngilizce sunucu metnini ekrana
 *      sızdırıyordu (AuthError.message daima dolu → yedek ölü koddu). Artık
 *      her nokta utils/errorMap'teki `mapError`den geçer: Türkçe mesaj aynen
 *      kalır, tanınmayan ham metin ASLA ekrana çıkmaz.
 *   2. HATA mesajları 4 saniyede kendiliğinden kayboluyordu — kullanıcı
 *      okuyamadan gidiyordu. Hata artık KALICI: kullanıcı X ile kapatana
 *      kadar durur (bkz. PaymentScreen inlineError deseni). BAŞARI mesajları
 *      4 sn'de kaybolmaya devam edebilir; kalıcılık yalnız hata içindir.
 *   3. Salt-ikon düğmeler ekran okuyucuya adsızdı → Türkçe aria-label eklendi.
 *
 * Bekçiler kaynak-metin asertlidir (repo geleneği: bildirimDuzeltmeleri).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const oku = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');

// Bu süprümün kapsadığı 10 görünüm dosyası.
const DOSYALAR = [
  'views/ServiceDashboard.tsx',
  'views/ServiceProfile.tsx',
  'views/Studio.tsx',
  'views/PostMatchEval.tsx',
  'views/SocialView.tsx',
  'views/Notifications.tsx',
  'views/social/TeamSettingsSheet.tsx',
  'views/PitchDiscovery.tsx',
  'views/Marketplace.tsx',
  'views/GuardianConsentChild.tsx',
] as const;

describe('1 — ham hata metni ekrana sızmaz (`?.message ||` kalıbı yok)', () => {
  for (const dosya of DOSYALAR) {
    it(`${dosya}: '?.message ||' kalıbı 0 adet`, () => {
      const s = oku(dosya);
      // Ne `err?.message || 'yedek'` ne de `(e as Error)?.message || ...`
      // biçimi kalmadı — hepsi mapError'a (ya da salt-okuma için `??`ye) taşındı.
      expect(s).not.toMatch(/\?\.message\s*\|\|/);
    });
  }

  it('ServiceDashboard mapError kullanır (utils/errorMap import edilmiş)', () => {
    const s = oku('views/ServiceDashboard.tsx');
    expect(s).toContain("import { mapError } from '../utils/errorMap'");
    expect(s).toContain('showActionError(mapError(');
  });
});

describe('2 — HATA mesajı kalıcı: setTimeout ile silinmez, X ile kapanır', () => {
  it('ServiceDashboard: actionError zamanlayıcıyla temizlenmez', () => {
    const s = oku('views/ServiceDashboard.tsx');
    expect(s).not.toMatch(/setTimeout\([^)]*setActionError\(null\)/);
    // Kalıcı hata balonunda aria-label'li X kapatma var (Toast onClose yolu).
    expect(s).toMatch(/<Toast[^>]*variant="error"[^>]*onClose=\{\(\) => setActionError\(null\)\}/);
    // BAŞARI mesajı 4 sn'de kaybolmaya devam edebilir — kalıcılık yalnız hata için.
    expect(s).toMatch(/setTimeout\(\(\) => setActionSuccess\(null\), 4000\)/);
  });

  it('PitchDiscovery: actionError zamanlayıcıyla temizlenmez', () => {
    const s = oku('views/PitchDiscovery.tsx');
    expect(s).not.toMatch(/setTimeout\([^)]*setActionError\(null\)/);
    expect(s).toMatch(/<Toast[^>]*variant="error"[^>]*onClose=\{\(\) => setActionError\(null\)\}/);
  });

  it('Marketplace: paylaşım hatası zamanlayıcıyla temizlenmez, X ile kapanır', () => {
    const s = oku('views/Marketplace.tsx');
    expect(s).not.toMatch(/setTimeout\([^)]*setPaylasHatasi\(null\)/);
    expect(s).toContain('aria-label="Hata mesajını kapat"');
  });

  it('GuardianConsentChild: kopyalama hatası zamanlayıcıyla temizlenmez, X ile kapanır', () => {
    const s = oku('views/GuardianConsentChild.tsx');
    expect(s).not.toMatch(/setTimeout\([^)]*setKopyaHatasi\(false\)/);
    expect(s).toContain('aria-label="Hata mesajını kapat"');
  });

  it('Toast bileşeninin X kapatma yolu erişilebilir adlıdır', () => {
    const s = oku('components/common/Toast.tsx');
    expect(s).toContain('aria-label="Mesajı kapat"');
  });
});

describe('3 — salt-ikon düğmeler ekran okuyucuya adlı (örnekleme)', () => {
  it('ServiceDashboard: modal X kapatma düğmeleri etiketli', () => {
    const s = oku('views/ServiceDashboard.tsx');
    expect(s).toContain('aria-label="Kapat"');
    expect(s).toContain('aria-label="Ödeme yöntemini sil"');
  });

  it('Notifications: davet penceresinin X düğmesi etiketli', () => {
    const s = oku('views/Notifications.tsx');
    expect(s).toContain('aria-label="Kapat"');
  });

  it('Studio: plan araçları ve kapatma düğmeleri etiketli', () => {
    const s = oku('views/Studio.tsx');
    expect(s).toContain('aria-label="Planı sil"');
    expect(s).toContain('aria-label="Kapat"');
  });

  it('ServiceProfile: düzenleme kalemleri etiketli', () => {
    const s = oku('views/ServiceProfile.tsx');
    expect(s).toContain('aria-label="Adı düzenle"');
    expect(s).toContain('aria-label="Ücreti düzenle"');
  });
});
