/**
 * TEK GİRİŞ YOLU: APPLE · GOOGLE — SİLİNENLER GERİ GELMESİN
 *
 * KURUCU KARARI (23 Ağustos 2026, üçüncü bildirimden sonra):
 *   "Bu ekranın tüm uygulamadan yok etmelisin ve yalnızca Apple ve Google
 *    girişinin kalmasını sağlamalısın."
 *
 * TARİHÇE — niye bayrak yetmedi:
 *   · 17 Ağu · telefon ANA giriş yolu yapıldı (SMS altyapısı hiç kurulmadı).
 *   · 21 Ağu · Apple, 5.6 (Developer Code of Conduct) ile REDDETTİ: inceleme
 *     paketinde demo hesap seçici ve "APP REVIEW" afişi vardı; indirilen
 *     pakette yoktu.
 *   · 22 Ağu · telefon yolu `SMS_OTP_ENABLED=false` ile KARARTILDI, demo
 *     seçici `VITE_DEMO_ACCOUNTS`e bağlandı. Kod yerinde kaldı.
 *   · 22–23 Ağu · kurucu aynı ekranı ÜÇ KEZ bildirdi: bayraklardan biri
 *     (Vercel'de `VITE_DEV_MODE=true`) yanlış ortama yazılıydı ve ekran geri
 *     geliyordu.
 *   · 23 Ağu · KOD SİLİNDİ. Bayrak, silinmesi gereken bir şeyi gizler.
 *
 * SMS ALTYAPISI ZATEN YOKTU (22 Ağu canlı ölçüm): Send SMS Hook kapalı,
 * sms_provider "twilio" ama hesap yok, `send-sms` HOOK_NOT_CONFIGURED dönüyor,
 * telefonla girişi tamamlamış TEK kullanıcı yok. Yani "KOD GÖNDER" hiçbir
 * zaman çalışmadı.
 *
 * Bu dosya kaynağın BİÇİMİNE bakar, davranışına değil: korunan şey bir
 * çıktı değil, kodun VAR OLMAMASI. Silinen bir şeyi davranışla test edemezsin.
 */
import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const oku = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');
/** Yorumları ayıklar: iddialar KOD'a bakmalı, "bir daha yapma" notlarına değil. */
const kodu = (metin: string) =>
  metin
    .split('\n')
    .filter((satir) => !/^\s*(\/\/|\/\*|\*)/.test(satir))
    .join('\n');

describe('Giriş ekranı · yalnız Apple ve Google', () => {
  const ham = oku('views/AuthScreen.tsx');
  const kod = kodu(ham);

  it('ekranda Apple ve Google düğmeleri var', () => {
    expect(kod).toContain('onClick={handleGoogleLogin}');
    expect(kod).toContain('onClick={handleAppleLogin}');
    expect(kod).toContain('loginWithGoogle');
    expect(kod).toContain('loginWithApple');
  });

  it('APPLE ÜSTTE (App Store Kural 4.8)', () => {
    // iOS'ta üçüncü taraf girişi sunan uygulama, Apple ile Giriş'i en az o
    // kadar öne çıkarmak zorunda. Düğmeler DOM'da Google→Apple sırasında;
    // `column-reverse` görsel sırayı Apple→Google yapar. Biri değişip öteki
    // kalırsa Apple alta düşer ve kural ihlal edilir.
    expect(kod).toContain("flexDirection: 'column-reverse'");
    expect(kod.indexOf('handleGoogleLogin')).toBeLessThan(kod.indexOf('handleAppleLogin'));
  });

  it('TELEFON alanı, ülke kodu ve KOD ekranı ekranda YOK', () => {
    for (const iz of [
      'Numaranla gir', 'TELEFON NUMARAN', 'Telefon numaran', 'KOD GÖNDER',
      'Sana bir kod göndereceğiz', 'au-phone', 'au-dial', 'auth-otp-input',
      'DOĞRULA VE GİRİŞ YAP', 'NUMARAYI DEĞİŞTİR', 'Kodu tekrar gönder',
      'sendPhoneOtp', 'verifyPhoneOtp', 'checkPhone', 'formatPhoneInput',
      'DEFAULT_DIAL_CODE', 'canSendOtpTo', 'otpKapaliSebebi',
    ]) {
      expect(kod, `giriş ekranında "${iz}" izi kaldı`).not.toContain(iz);
    }
  });

  it('DEMO hesap seçici ve demo giriş kısayolu ekranda YOK', () => {
    for (const iz of [
      'DEMO HESABIYLA', 'DEMO MODU', 'demoLogin', 'loginDemoAccount',
      'isDemoLoginEnabled', 'isDemoLoginInput', 'isDemoAccountPickerEnabled',
      'DEMO_ACCOUNT_GROUPS', 'demoPickerOpen', 'mirackerem', 'VITE_DEMO_ACCOUNTS',
      'VITE_DEV_MODE',
    ]) {
      expect(kod, `giriş ekranında "${iz}" izi kaldı`).not.toContain(iz);
    }
  });

  it('ekranda hiçbir yazı alanı kalmadı (klavye hiç açılmaz)', () => {
    // Tek "girdi" yasal onay kutusudur ve o bir <button>. Yazı alanı geri
    // gelirse klavye örtüşmesi sorunu da geri gelir; o zaman ölçüm kancası da
    // geri gelmeli (bkz. girisKlavyesiVeSuzgecDelikleri).
    expect(kod).not.toMatch(/<input/);
    expect(kod).toContain('id="agreement-checkbox"');
  });
});

describe('Telefon ve demo giriş uçları · uygulamadan silindi', () => {
  const auth = kodu(oku('supabaseAuth.ts'));

  it('supabaseAuth telefon OTP uçlarını EXPORT ETMİYOR', () => {
    for (const ad of ['sendPhoneOtp', 'verifyPhoneOtp', 'requestPhoneLink', 'confirmPhoneLink']) {
      expect(auth, `${ad} hâlâ dışa açık`).not.toContain(`export const ${ad}`);
    }
  });

  it('supabaseAuth demo giriş uçlarını EXPORT ETMİYOR', () => {
    for (const ad of ['demoLogin', 'isDemoLoginInput', 'isDemoLoginEnabled',
                      'isDemoAccountPickerEnabled', 'loginDemoAccount']) {
      expect(auth, `${ad} hâlâ dışa açık`).not.toContain(`export const ${ad}`);
    }
    // Ortak demo şifresi paketin JS'ine harfi harfine giriyordu ve demo
    // hesapların bir kısmı GERÇEK saha sahibi hesaplarıydı.
    expect(auth).not.toContain('password123');
    expect(auth).not.toContain('DEMO_PASSWORD');
    expect(auth).not.toContain("'@oyna.app'");
  });

  it('demo hesap kataloğu ve numara ekranı dosyaları YOK', () => {
    for (const yol of ['data/demoAccounts.ts', 'views/PhoneLinkScreen.tsx',
                       'shared/numaraKapisi.ts']) {
      expect(existsSync(join(process.cwd(), yol)), `${yol} hâlâ duruyor`).toBe(false);
    }
  });

  it('PHONE_LINK görünümü yönlendirmede YOK', () => {
    expect(kodu(oku('types.ts'))).not.toContain('PHONE_LINK');
    expect(kodu(oku('App.tsx'))).not.toContain('PHONE_LINK');
    expect(kodu(oku('App.tsx'))).not.toContain('PhoneLinkScreen');
    // Ödeme, doğrulanamayan bir numarayı şart koşmuyor: SMS gönderilemediği
    // için o kapı açılsaydı ödeme HERKES için imkânsız olurdu.
    expect(kodu(oku('views/PaymentScreen.tsx'))).not.toContain('PHONE_LINK');
    expect(kodu(oku('store.ts'))).not.toContain('phoneGateReason');
  });
});

describe('Sunucu tarafı · incelemeciye özel giriş kapısı yok (Apple 5.6)', () => {
  it('sabit kodlu test OTP numarası yapılandırmadan silindi', () => {
    // [auth.sms.test_otp] · 905000000000 = "500000" — bu numara için Supabase
    // SMS ÜRETMEZ, yalnız yazılı kodu kabul ederdi. Dosyadaki gerekçesi
    // birebir şuydu: "mağaza incelemecisi ve kurucu, gerçek bir hattı olmadan
    // giriş yapabilir." Apple'ın 5.6 altında reddettiği desen tam budur.
    const cfg = oku('supabase/config.toml');
    expect(cfg).not.toMatch(/^\s*\[auth\.sms\.test_otp\]/m);
    expect(cfg).not.toMatch(/^\s*9050000000\d+\s*=/m);
    // Uygulamada telefonla giriş yolu olmadığına göre sunucuda da kayıt açık
    // kalmamalı: uygulamanın sunmadığı bir yolu sunucuda bırakmak, "paket ile
    // sunucunun cevabı aynı olacak" kuralını deler.
    expect(cfg).toMatch(/\[auth\.sms\][\s\S]*?enable_signup = false/);
  });
});

describe('Çıkışta bayat paket kalmaz', () => {
  /**
   * KURUCU BİLDİRİMİ (23 Ağustos 2026): "Çıkış yaptığım zaman neden hâlâ demo
   * hesaplı giriş ekranı geliyor?"
   *
   * İKİ SEBEP VARDI, ikisi de bu blokta kilitli:
   *
   *  1. ÜRETİM ESKİ KODU SERVİS EDİYORDU. `oyna-app.vercel.app`, `main`
   *     dalından derleniyor; `main` bu düzeltmelerin hiçbirini almamıştı ve
   *     kendi `views/AuthScreen.tsx` dosyasında "APP REVIEW · İNCELEME" kutusu
   *     ile "DEMO HESABIYLA GİR" düğmesi harfi harfine duruyordu. Kurucunun
   *     ekran görüntüsü o paketin çıktısıydı. Çözümü kod değil, birleştirmedir.
   *
   *  2. AÇIK SEKME BAYATLIYORDU. Web'de uygulama tek sayfadır: sekme bir kez
   *     açıldıktan sonra o dağıtımın JavaScript'i bellekte kalır. Çıkış yalnız
   *     oturumu düşürüp görünümü 'AUTH'a çeviriyordu, yani giriş ekranını
   *     SEKMENİN AÇILDIĞI GÜNKÜ paketten çiziyordu. Bu, kodda demo ekranı hiç
   *     kalmasa bile tekrarlardı — düzeltme yayına alınsa dahi.
   */
  it('çıkış web sekmesini KÖKTEN yeniden yükler', () => {
    const auth = oku('supabaseAuth.ts');
    const govde = auth.slice(auth.indexOf('export const logout ='),
                             auth.indexOf('const yenidenBaslat'));
    expect(govde).toContain('signOut()');
    // Yeniden yükleme çıkışın PARÇASI olmalı; çağıranlara bırakılırsa biri
    // unutur ve o yol bayat kalır (dört ayrı çağrı yeri var).
    expect(govde).toContain('yenidenBaslat()');
    expect(auth).toContain('window.location.replace(`${window.location.origin}/`)');
    // Native'de bayatlama yok, yeniden yükleme yalnız beyaz ekran getirir.
    const yeniden = auth.slice(auth.indexOf('const yenidenBaslat'));
    expect(yeniden.slice(0, 400)).toContain('Capacitor.isNativePlatform()');
  });

  it('SPA girişi (/) tarayıcıda önbelleğe alınmıyor', () => {
    // `vercel.json` yalnız "/index.html" için no-cache yazıyordu. Ama
    // `cleanUrls` + `"/(.*)" -> "/index.html"` yeniden yazımı yüzünden
    // kullanıcının İSTEDİĞİ yol "/"dur ve başlık kuralları yeniden yazımdan
    // ÖNCEKİ yola bakar: kural hiç uygulanmıyordu. Yeniden yükleme bile eski
    // index.html'i diskten alabilirdi — yani 1. sebep kapansa bile 2. sebep
    // sessizce sürerdi.
    const v = JSON.parse(oku('vercel.json'));
    const kural = (yol: string) => v.headers.find((h: any) => h.source === yol);
    for (const yol of ['/', '/index.html']) {
      const h = kural(yol);
      expect(h, `${yol} için önbellek kuralı yok`).toBeTruthy();
      expect(JSON.stringify(h.headers)).toContain('no-cache');
    }
    // Parmak izli varlıklar ise sonsuza kadar önbelleklenebilir: adları
    // içeriğe göre değiştiği için bayatlayamazlar.
    expect(JSON.stringify(kural('/assets/(.*)').headers)).toContain('immutable');
  });
});
