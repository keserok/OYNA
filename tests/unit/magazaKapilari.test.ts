/**
 * MAĞAZA KAPILARI (17 Ağustos 2026 — App Store + Play Store gönderimi öncesi)
 *
 * Bu dosya, PAKETLENMİŞ uygulamada açık kalırsa gönderimi ya da kullanıcıyı
 * riske atan kapıları kilitler. Hepsi gerçek bir denetimde bulundu.
 *
 * 1. DEMO GİRİŞİ — native'de HER DURUMDA kapalı.
 *    Eski kapı `window.location.hostname === 'localhost'` kontrolüne
 *    dayanıyordu. Capacitor uygulamayı Android'de `https://localhost`,
 *    iOS'ta `capacitor://localhost` üzerinden servis eder — yani MAĞAZADAN
 *    İNDİRİLEN uygulamada da hostname 'localhost'tur ve kapı AÇIK kalırdı.
 *    Sonuç: e-posta alanına "saha1" yazan herkes ŞİFRESİZ olarak gerçek bir
 *    SAHA SAHİBİ hesabına girebiliyordu (demoLogin sabit şifreyi kendi
 *    kullanır). Hesap ele geçirme sınıfı açık + mağaza reddi riski.
 *
 * 2. DEMO HESAP SEÇİCİ — native'de kod düzeyinde kapalı; derleme anında
 *    kill-switch yazmayı unutmak yeterli değildir.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const oku = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');

describe('Mağaza kapıları · demo girişi', () => {
  const s = oku('supabaseAuth.ts');

  /**
   * Fonksiyon gövdesi — YORUMLAR AYIKLANMIŞ.
   *
   * Sıra iddiaları KOD sırasına bakmalı: açıklama satırlarında geçen
   * "hostname" gibi kelimeler kod sanılırsa test yanlış yerden kırılır
   * (ilk yazımda tam bunu yaptı).
   */
  const govde = (ad: string) => {
    const bas = s.indexOf(`export const ${ad} = (): boolean =>`);
    expect(bas, `${ad} bulunamadı`).toBeGreaterThan(-1);
    return s
      .slice(bas, s.indexOf('\n};', bas))
      .split('\n')
      .filter((satir) => !/^\s*(\/\/|\/\*|\*)/.test(satir))
      .join('\n');
  };

  it('demo girişi native pakette KAPALI (hostname kapısından ÖNCE)', () => {
    const g = govde('isDemoLoginEnabled');
    expect(g).toContain('Capacitor.isNativePlatform()');
    // Native kontrolü, hostname/env kapılarından ÖNCE gelmeli: sonra gelirse
    // dev-mode bayrağı ya da localhost eşleşmesi native'de de açardı.
    expect(g.indexOf('isNativePlatform')).toBeLessThan(g.indexOf('hostname'));
    expect(g.indexOf('isNativePlatform')).toBeLessThan(g.indexOf('VITE_DEV_MODE'));
    expect(g).toMatch(/isNativePlatform\(\)\)\s*return false/);
  });

  it('demo hesap seçici native pakette KAPALI (kill-switch unutulsa bile)', () => {
    const g = govde('isDemoAccountPickerEnabled');
    expect(g).toContain('Capacitor.isNativePlatform()');
    expect(g).toMatch(/isNativePlatform\(\)\)\s*return false/);
  });

  it('demo girişi yalnız @oyna.app hesaplarını kabul eder (ikinci emniyet)', () => {
    expect(s).toContain("const DEMO_DOMAIN = '@oyna.app'");
    // demoLogin ve loginDemoAccount alan adı dışına çıkamaz.
    expect((s.match(/Demo giriş yalnızca demo hesaplarında/g) ?? []).length).toBeGreaterThanOrEqual(2);
  });
});

describe('Mağaza kapıları · platform yapılandırması', () => {
  it('Android hedef sürümü Play şartını karşılar (targetSdk ≥ 35)', () => {
    const g = oku('android/variables.gradle');
    const hedef = Number(g.match(/targetSdkVersion\s*=\s*(\d+)/)?.[1] ?? 0);
    expect(hedef).toBeGreaterThanOrEqual(35);
  });

  it('iOS gizlilik manifestosu (PrivacyInfo.xcprivacy) pakette VAR', () => {
    // Apple, Mayıs 2024'ten beri "required reason API" kullanan uygulamalarda
    // manifesto ister; eksikse yükleme ITMS uyarısıyla reddedilir.
    const m = oku('ios/App/App/PrivacyInfo.xcprivacy');
    expect(m).toContain('NSPrivacyAccessedAPITypes');
    // Capacitor Preferences → UserDefaults (CA92.1) beyanı zorunlu.
    expect(m).toContain('NSPrivacyAccessedAPICategoryUserDefaults');
    expect(m).toContain('CA92.1');
    // İzleme yapılmıyor: açıkça false beyan edilir.
    expect(m).toContain('NSPrivacyTracking');
  });

  it('manifesto Xcode projesine KAYITLI (yoksa pakete kopyalanmaz)', () => {
    // Dosyayı klasöre koymak YETMEZ: Xcode yalnız projeye eklenmiş ve
    // "Copy Bundle Resources" aşamasına giren dosyaları pakete koyar.
    // Kayıtsız manifesto = Apple'ın görmediği manifesto = aynı ret.
    const pbx = oku('ios/App/App.xcodeproj/project.pbxproj');
    expect(pbx).toContain('PrivacyInfo.xcprivacy */ = {isa = PBXFileReference');
    expect(pbx).toContain('PrivacyInfo.xcprivacy in Resources */ = {isa = PBXBuildFile');
    // Resources aşamasının içinde de anılmalı.
    const res = pbx.slice(pbx.indexOf('isa = PBXResourcesBuildPhase'));
    expect(res.slice(0, res.indexOf('runOnlyForDeploymentPostprocessing')))
      .toContain('PrivacyInfo.xcprivacy in Resources');
  });

  it('uygulama dikey kilitli (iki platformda da)', () => {
    expect(oku('ios/App/App/Info.plist')).toContain('UIInterfaceOrientationPortrait');
    expect(oku('android/app/src/main/AndroidManifest.xml')).toContain('android:screenOrientation="portrait"');
  });

  it('istenen her iznin gerekçe metni var (iOS)', () => {
    const plist = oku('ios/App/App/Info.plist');
    for (const anahtar of [
      'NSCameraUsageDescription',
      'NSLocationWhenInUseUsageDescription',
      'NSPhotoLibraryUsageDescription',
      'NSContactsUsageDescription',
    ]) {
      expect(plist).toContain(anahtar);
    }
  });
});

// ════════════════════════════════════════════════════════════════════════════
// DOSYA KAYDETME — PAKETTE ÇALIŞIR OLMALI
// ════════════════════════════════════════════════════════════════════════════
//
// `<a download>` deseni TARAYICIDA çalışır, PAKETLENMİŞ uygulamada çalışmaz:
// iOS WKWebView `download` özniteliğini desteklemez; Android Capacitor
// WebView'ına DownloadListener bağlı değildir. İkisinde de tıklama SESSİZCE
// hiçbir şey yapmaz — kullanıcı düğmeye basar, dosya ortada yoktur.
// Etkilenen yüzeyler: bilet QR'ı, taktik görseli, KVKK veri dışa aktarımı,
// sahip finans CSV'leri.

describe('Mağaza kapıları · dosya kaydetme', () => {
  it('ortak yardımcı önce paylaşım sayfasını dener, sonra indirmeye düşer', () => {
    const y = oku('utils/dosyaKaydet.ts');
    expect(y).toContain('navigator');
    expect(y).toContain('canShare');
    expect(y).toContain('AbortError');   // kullanıcı vazgeçince indirmeye DÜŞME
    expect(y).toContain('klasikIndir');  // yedek yol duruyor
  });

  it('kullanıcıya dosya veren HER yüzey ortak yardımcıdan geçer', () => {
    for (const yol of [
      'views/MatchTicket.tsx',                     // bilet QR
      'views/studio/shareImage.ts',                // taktik görseli
      'views/SettingsScreen.tsx',                  // KVKK veri dışa aktarımı
      'views/owner/OwnerFinanceView.tsx',          // aylık finans CSV
      'views/owner/finance/FinanceRangeReport.tsx',// tarih aralıklı rapor CSV
    ]) {
      expect(oku(yol), `${yol} ortak yardımcıyı kullanmıyor`).toContain('dosyaKaydetVeyaPaylas');
    }
  });

  it('ham `<a download>` deseni tüketici yüzeylerinde KALMADI', () => {
    for (const yol of [
      'views/MatchTicket.tsx',
      'views/studio/shareImage.ts',
      'views/SettingsScreen.tsx',
      'views/owner/OwnerFinanceView.tsx',
      'views/owner/finance/FinanceRangeReport.tsx',
    ]) {
      // Yorumlarda geçebilir; KOD satırında olmamalı.
      const kod = oku(yol)
        .split('\n')
        .filter((s) => !/^\s*(\/\/|\*|\/\*)/.test(s))
        .join('\n');
      expect(kod, `${yol} hâlâ ham indirme kullanıyor`).not.toMatch(/\.download\s*=/);
    }
  });

  it('3DS banka sayfası uygulama İÇİNDE kalır (allowNavigation tanımlı)', () => {
    // Tanımsızsa Capacitor bankanın adresini sistem tarayıcısına atabilir;
    // kullanıcı ödemenin ortasında uygulamadan düşer ve 3DS sonucu okunamaz.
    const c = oku('capacitor.config.ts');
    expect(c).toContain('allowNavigation');
    expect(c).toContain('iyzipay.com');
  });
});
