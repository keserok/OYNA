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

describe('İlk dokunuş boşa gitmiyor', () => {
  /**
   * KURUCU BİLDİRİMİ (23 Ağustos 2026): "Tek seferde giremiyorum."
   *
   * Sebep koddaydı ve %100 tekrarlanabilirdi: `handleGoogleLogin` ilk iş
   * olarak `requireAgreement()` çağırıyor, onay kutusu işaretli değilse
   * KIRMIZI hata basıp DÖNÜYORDU. Kutu ise düğmelerin çok aşağısında,
   * telefonda çoğu zaman görüş alanının dışındaydı. Yani her kullanıcının
   * ilk dokunuşu başarısızdı — "bir sürü bug" hissinin birinci kaynağı.
   *
   * Yeni davranış: dokunuş iptal edilmez, ONAYA dönüşür. Tek düğme hem onayı
   * verir hem girişi AYNI DOKUNUŞTA başlatır (araya bir adım daha girseydi
   * tarayıcı açılır pencereyi engellerdi).
   */
  const auth = oku('views/AuthScreen.tsx');

  it('sağlayıcıya dokunmak onay eksikken İPTAL ETMİYOR', () => {
    // Eski desen: `if (!requireAgreement()) return;` — geri dönüş = boşa dokunuş.
    expect(kodu(auth)).not.toContain('requireAgreement');
    const dokun = auth.slice(auth.indexOf('const saglayiciyaDokun'),
                             auth.indexOf('const handleGoogleLogin'));
    expect(dokun).toContain('setOnayIstenen(saglayici)');
    // Onay varsa doğrudan giriş: kutuyu işaretlemiş kullanıcı için TEK dokunuş.
    expect(dokun).toContain('void girisBaslat(saglayici)');
  });

  it('onay düğmesi girişi AYNI dokunuşta başlatıyor', () => {
    // Onay ile giriş arasına bir adım daha girerse (ör. setTimeout, await)
    // tarayıcı kullanıcı jestini tükenmiş sayar ve pencereyi engeller.
    const i = auth.indexOf('ONAYLIYORUM VE DEVAM ET');
    expect(i).toBeGreaterThan(-1);
    const blok = auth.slice(i - 700, i);
    expect(blok).toContain('setAgreed(true)');
    expect(blok).toContain('void girisBaslat(saglayici)');
    expect(blok).not.toContain('setTimeout');
    expect(blok).not.toContain('await ');
  });

  it('onay kutusu HÂLÂ opt-in (önceden işaretli gelmiyor)', () => {
    // "Devam ederek kabul etmiş sayılırsın" demiyoruz: kullanıcı ya kutuyu
    // işaretler ya da üstünde "Onaylıyorum" yazan düğmeye basar.
    expect(auth).toContain('useState(false)');
    expect(auth).toContain('id="agreement-checkbox"');
  });

  it('sessiz başarısızlık yok: pencere kapanınca ekran konuşuyor', () => {
    // `saglayiciHatasi`, `girisBaslat`tan SONRA tanımlı — dilim ileri alınır.
    const i = auth.indexOf('const saglayiciHatasi');
    const h = auth.slice(i, auth.indexOf('\n  };', i));
    expect(h).toContain('OAUTH_PENCERE_KAPANDI');
    expect(h).toContain('Giriş penceresi kapandı');
    // Vazgeçmek hata değil → kırmızı değil, sakin durum satırı.
    expect(h).toMatch(/kirmizi:\s*false/);
    expect(auth).toContain('role="status"');
  });
});

describe('Oturum devri kütüphane olayına bırakılmıyor', () => {
  const auth = oku('supabaseAuth.ts');

  it('oturumu GÖREN yer olayı KENDİSİ duyuruyor', () => {
    /**
     * Açılır pencere oturumu ortak localStorage'a yazar; ana sekme onu
     * yoklamayla görür. Ama yönlendirmeyi App'in dinleyicisi yapar ve o,
     * supabase-js'in sekmeler arası olayına bağlıdır: BroadcastChannel
     * (Safari 15.4 öncesinde YOK) ya da `visibilitychange` (masaüstünde
     * açılır pencere ayrı bir penceredir; ana sekme hiç gizlenmeyebilir).
     * İkisi de gelmezse kullanıcı oturumu AÇIK hâlde giriş ekranında kalır.
     */
    expect(auth).toContain('const oturumuDuyur');
    expect(auth).toContain('authDinleyiciler');
    // Yoklama oturumu gördüğü yerde duyurmalı.
    const govde = auth.slice(auth.indexOf('const webOAuthAc = async'),
                             auth.indexOf('// ─── WEB\'DE SAĞLAYICI DÖNÜŞÜ'));
    expect(govde).toContain('await oturumuDuyur()');
    // Native deep link dönüşü de aynı garantiyi almalı.
    const deep = auth.slice(auth.indexOf('export const handleAuthCallbackUrl'));
    expect(deep.slice(0, 1600)).toContain('await oturumuDuyur()');
  });

  it('dinleyici defteri abonelik bitince temizleniyor', () => {
    expect(auth).toContain('authDinleyiciler.add(callback)');
    expect(auth).toContain('authDinleyiciler.delete(callback)');
  });

  it('App aynı oturum için açılışı İKİ KEZ koşmuyor', () => {
    // SIGNED_IN artık iki kaynaktan gelebiliyor; ikisi birden gelirse profil
    // açılışı eş zamanlı iki kez koşar ve yarış biri ONBOARDING'e öteki ana
    // sayfaya götürebilir.
    const app = oku('App.tsx');
    expect(app).toContain('acilisKoşuyor');
    expect(app).toMatch(/if \(user && acilisKoşuyor === user\.uid\) return;/);
    expect(app).toMatch(/if \(user\) acilisKoşuyor = null;/);
  });

  it('başarılı girişte OAuth işareti siliniyor', () => {
    // İşaret yalnız BAŞARISIZ dönüşü açıklamak için bırakılır ve 10 dk yaşar.
    // Çıkış artık sayfayı yeniden yüklediği için, silinmeseydi giriş ekranı
    // taze işareti okuyup "giriş tamamlanamadı" hatası basardı — hiçbir şey
    // başarısız olmamışken.
    expect(auth).toContain('const oauthIsaretiniSil');
    expect(auth.match(/oauthIsaretiniSil\(\)/g)?.length).toBeGreaterThanOrEqual(4);
  });
});

describe('Çıkış sonsuz yeniden yükleme döngüsüne girmiyor', () => {
  const auth = oku('supabaseAuth.ts');

  it('signOut oturumu silmediyse anahtar ELLE siliniyor', () => {
    /**
     * `signOut()` sunucuya da haber verir; o çağrı 401/403/404 DIŞINDA bir
     * hatayla düşerse supabase-js erken döner ve YEREL OTURUMU SİLMEZ (hata
     * da fırlatmaz). Çıkış artık sayfayı yeniden yüklediği için sonuç şu
     * olurdu: yükle → jeton duruyor → 401 → logout → yükle → … kapanmayan
     * bir döngü ve kullanıcı uygulamayı hiç açamaz.
     */
    expect(auth).toContain('const oturumuZorlaSil');
    expect(auth).toContain('AUTH_DEPO_ANAHTARI');
    const g = auth.slice(auth.indexOf('const oturumuZorlaSil'), auth.indexOf('const YENIDEN_BASLATMA_ISARETI'));
    expect(g).toContain("signOut({ scope: 'local' })");
    expect(g).toContain('localStorage.removeItem(AUTH_DEPO_ANAHTARI)');
    // logout, yeniden yüklemeden ÖNCE temizliği beklemeli.
    const l = auth.slice(auth.indexOf('export const logout ='), auth.indexOf('const oturumuZorlaSil'));
    expect(l.indexOf('await oturumuZorlaSil()')).toBeLessThan(l.indexOf('yenidenBaslat()'));
  });

  it('ikinci kilit: kısa aralıkta ikinci yeniden yükleme yapılmıyor', () => {
    const y = auth.slice(auth.indexOf('const YENIDEN_BASLATMA_ISARETI'));
    expect(y).toContain('YENIDEN_BASLATMA_ARALIGI_MS');
    expect(y).toMatch(/Date\.now\(\) - son < YENIDEN_BASLATMA_ARALIGI_MS/);
  });

  it('depo anahtarı TEK yerde tanımlı', () => {
    const c = oku('supabaseClient.ts');
    expect(c).toContain("export const AUTH_DEPO_ANAHTARI = 'oyna.auth.token'");
    expect(c).toContain('storageKey: AUTH_DEPO_ANAHTARI');
    // supabaseAuth harfi harfine yazmamalı; sabiti içe aktarmalı.
    expect(auth).not.toContain("'oyna.auth.token'");
  });
});

describe('Apple 5.6 · sunucu ve içerik dürüstlüğü', () => {
  /**
   * 23 Ağustos 2026 · canlı veritabanı denetiminde bulunan iki ağır bulgu
   * kapatıldı. İkisi de SUNUCUDAYDI; yeni bir paket göndermek düzeltmiyordu.
   * Bu kilit, düzeltmelerin depoda da yaşamasını sağlar — canlı ile depo
   * arasındaki ayrışma zaten bu projenin baş belasıydı.
   */
  const gocDizini = join(process.cwd(), 'supabase/migrations');
  const goc = (ad: string) => readFileSync(join(gocDizini, ad), 'utf8');

  it('incelemeci kapısını söken göç depoda duruyor', () => {
    const g = goc('20260916000000_odeme_kapatildi_ve_incelemeci_kapisi_sokuldu.sql');
    // Fonksiyon yeniden yazılıyor ve kapı düşürülüyor.
    expect(g).toContain('CREATE OR REPLACE FUNCTION public.get_nearby_providers');
    expect(g).toContain('DROP FUNCTION IF EXISTS public._cagiran_demo_mu()');
    // Yeni gövde çağırana BAKMAMALI.
    const govde = g.slice(g.indexOf('CREATE OR REPLACE FUNCTION public.get_nearby_providers'),
                          g.indexOf('DROP FUNCTION IF EXISTS'));
    expect(govde).not.toContain('_cagiran_demo_mu');
    // Göç kendini doğrulamalı: iddia ettiği şeyi kanıtlamadan bitmemeli.
    expect(g).toContain('DOGRULAMA: get_nearby_providers');
  });

  it('ödeme anahtarları göçte kapatılıyor', () => {
    const g = goc('20260916000000_odeme_kapatildi_ve_incelemeci_kapisi_sokuldu.sql');
    for (const anahtar of ['simulation_counts_as_live', 'match_deposit_enabled', 'payment_mode_global']) {
      expect(g, `${anahtar} göçte yok`).toContain(anahtar);
    }
    // Etkin modun gerçekten CASH_ONLY'ye düştüğü doğrulanmalı.
    expect(g).toContain("resolve_payment_mode(NULL) ->> 'effective_mode'");
  });

  it('tesis adı göçü korumayı geri AÇIYOR', () => {
    // trg_protect_pitch_identity bakım için kapatılıyor; kapalı bırakmak
    // sessiz bir güvenlik açığı olurdu.
    const g = goc('20260916000001_ornek_tesis_adlari_uydurma_adlara_cevrildi.sql');
    expect(g).toContain('DISABLE TRIGGER trg_protect_pitch_identity');
    expect(g).toContain('ENABLE TRIGGER trg_protect_pitch_identity');
    expect(g).toContain('geri acilmadi');
    // Kulüp adı ve gerçek işletme adları çıkarılmış olmalı.
    for (const ad of ['Orduspor', 'Capo Arena', 'Ahmet Kuru Tesisleri']) {
      expect(g, `${ad} göçte ele alınmamış`).toContain(ad);
    }
  });

  it('örnek içerik uyarısı KODA GÖMÜLÜ değil, sunucudan geliyor', () => {
    // Demo ekosistem silindiği gün anahtar boşaltılır ve uyarı yeni bir paket
    // gerekmeden kaybolur. Koda gömülseydi, gerçeği anlatmadığı hâlde mağaza
    // incelemesi boyunca ekranda kalırdı.
    const svc = oku('services/dashboardHomeService.ts');
    expect(svc).toContain('fetchOrnekIcerikUyarisi');
    expect(svc).toContain("p_key: 'ornek_icerik_uyarisi'");
    const dash = oku('views/Dashboard.tsx');
    expect(dash).toContain('fetchOrnekIcerikUyarisi');
    expect(dash).toContain('{ornekUyarisi && (');
    // Metnin kendisi kodda GEÇMEMELİ.
    expect(kodu(dash)).not.toContain('örnek içeriktir');
  });

  it('inceleme notu "incelemeci için" demiyor', () => {
    // O cümle 5.6'nın tanımıdır: içeriğin incelemeci için var olduğunu itiraf
    // eder. Doğru çerçeve: örnek içerik HERKES için var ve uygulama içinde
    // etiketli.
    const not = oku('docs/master/APP_REVIEW_NOTLARI.md');
    const ing = not.slice(not.indexOf('ABOUT THIS SUBMISSION'));
    expect(ing).not.toMatch(/for the reviewer|so you can test|reviewer-only disclosure is/i);
    expect(ing).toContain('It is not a reviewer-only disclosure');
    expect(ing).toContain('SAMPLE CONTENT');
    expect(ing).toContain('no test phone number');
  });
});
