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
