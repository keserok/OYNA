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

// ════════════════════════════════════════════════════════════════════════════
// DEMO KİMLİKLERİ ÜRETİM PAKETİNE GİRMEZ
// ════════════════════════════════════════════════════════════════════════════
//
// En ağır bulgu: demo hesap kataloğu (`docs/OYNA_DEMO_HESAPLARI.md`) `?raw` ile
// statik içe aktarılıyordu ve ORTAK ŞİFRE ayrı bir sabitteydi. İkisi de mağaza
// paketinin JS'ine harfi harfine giriyordu; katalogda saha1..4 gibi GERÇEK
// SAHA SAHİBİ hesapları var. Paketi açan biri kimlikleri okuyup web/API
// üzerinden gerçek hesaplara girebilirdi — arayüzdeki native kapı bunu
// KAPATMAZ. Artık ikisi de yalnız VITE_DEMO_ACCOUNTS='true' ile derlenen
// geliştirici paketlerine girer.

describe('Mağaza kapıları · demo kimlikleri pakette değil', () => {
  it('katalog derleme bayrağına bağlı (statik ?raw içe aktarma YOK)', () => {
    const d = oku('data/demoAccounts.ts');
    expect(d).not.toMatch(/^import rosterMd from .*\?raw';/m);
    expect(d).toContain("import.meta.env.VITE_DEMO_ACCOUNTS === 'true'");
  });

  it('ortak şifre sabiti üretimde BOŞ (gömülü şifre yok)', () => {
    const s = oku('supabaseAuth.ts');
    expect(s).toContain("const DEMO_PASSWORD = import.meta.env.VITE_DEMO_ACCOUNTS === 'true'");
    // Ayrıştırıcıdaki yedek sabit de kaldırıldı.
    expect(oku('data/demoAccounts.ts')).not.toMatch(/\|\|\s*'password123'/);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// YAŞ KAPISI — VARSAYILAN YETİŞKİN YOK
// ════════════════════════════════════════════════════════════════════════════
//
// Onboarding'de yaş çarkı "24-30"da başlıyor ve DOKUNULMADAN seçili
// sayılıyordu. Sonuç: 15 yaşındaki kullanıcı hiçbir şeye dokunmadan yetişkin
// kaydediliyor, sunucudaki reşit-olmayan kuralı ('13-17') hiç tetiklenmiyor ve
// uygulamanın kendi veli onayı akışı ÖLÜ kalıyordu. Mağaza yaş derecelendirmesi
// ve çocuk koruması açısından engelleyici.

describe('Mağaza kapıları · yaş beyanı', () => {
  const ob = oku('views/Onboarding.tsx');

  it('yaş seçimi NÖTR başlar (varsayılan aralık yok)', () => {
    expect(ob).toContain('useState<number | null>(null)');
    expect(ob).toContain('const [ageTouched, setAgeTouched] = useState(false)');
  });

  it('yaş seçilmeden ilerlenemez', () => {
    expect(ob).toMatch(/case 1: return ageIndex !== null/);
  });

  it('seçilmemiş yaş profile YAZILMAZ', () => {
    expect(ob).toContain("ageRange: ageIndex === null ? '' : AGE_RANGES[ageIndex]");
  });

  it('çark seçim yokken hiçbir aralığı "seçili" göstermez', () => {
    const sa = oku('views/onboarding/StepAge.tsx');
    expect(sa).toContain('index: number | null');
    expect(sa).toContain('const secildi = index !== null');
    expect(sa).toContain('secildi && Math.round(cur) === i');
    // Ölü düğme bırakmayız: ekran neden pasif olduğunu söyler.
    expect(sa).toContain('Devam etmek için yaş aralığını seç');
  });
});

// ════════════════════════════════════════════════════════════════════════════
// KULLANICI İÇERİĞİ DENETİMİ (App Store Kural 1.2)
// ════════════════════════════════════════════════════════════════════════════
//
// Apple, kullanıcı içeriği barındıran uygulamalarda ÜÇ şeyi birden ister:
// (a) uygunsuz içeriği bildirme, (b) tacizciyi engelleme, (c) engellenenin
// içeriğinin bir daha görünmemesi. DM'de üçü de vardı; TAKIM SOHBETİ ve MAÇ
// LOBİSİ boştu — yabancı bir üyeyle aynı odadasın ama ne şikayet edebiliyor
// ne engelleyebiliyordun. "Engelle" düğmesi koyup mesajları süzmemek de aynı
// retle döner (engel yalan olur), o yüzden süzgeç ayrıca kilitleniyor.

describe('Mağaza kapıları · takım sohbetinde şikayet + engelleme', () => {
  const mv = oku('views/MessagesView.tsx');
  const svc = oku('services/teamChatService.ts');

  it('takım sohbeti gerçek engelleme/şikayet makinesine bağlı', () => {
    expect(mv).toContain("await blockUserFully(myUid, modTarget.id)");
    expect(mv).toContain("await reportUser(myUid, modTarget.id, 'HARASSMENT', undefined, 'CHAT')");
  });

  it('iki giriş noktası var: mesaja uzun basma + üst menü', () => {
    expect(mv).toContain('onPointerDown={() => uzunBasBasla(m)}');
    expect(mv).toContain('Üyeyi Şikayet Et / Engelle');
    // Keşfedilebilirlik: incelemeci uzun basmayı tahmin etmek zorunda kalmaz.
    expect(mv).toContain('Mesaja uzun bas');
  });

  it('geçmiş mesajlarda engel süzgeci var', () => {
    expect(svc).toContain('export const getBlockedSenderIds');
    expect(svc).toContain('.filter(r => !blocked.has(r.sender_id))');
  });

  it('canlı akışta da engel süzgeci var (geçmişin eşi)', () => {
    expect(svc).toContain('if (engelliMi?.(r.sender_id)) return;');
    expect(mv).toContain('(senderId) => blockedRef.current.has(senderId)');
  });

  it('engellenen kişinin ekrandaki mesajları anında düşer', () => {
    expect(mv).toContain('setMessages(prev => prev.filter(m => m.senderId !== modTarget.id))');
  });
});

describe('Mağaza kapıları · maç lobisinde şikayet + engelleme', () => {
  const mj = oku('views/MatchJoin.tsx');

  it('lobideki oyuncu kartında iki eylem de var', () => {
    expect(mj).toContain("await reportUser(currentUserUid, activePlayer.id, 'HARASSMENT', undefined, 'MATCH')");
    expect(mj).toContain('await blockUserFully(currentUserUid, activePlayer.id)');
  });

  it('eylemler yalnız BAŞKA oyuncular için görünür', () => {
    expect(mj).toContain('{!isMySlot && !isSelf && activePlayer.id && (');
  });
});

// ════════════════════════════════════════════════════════════════════════════
// PLATFORM UYUMU — iOS 18/26 + Android 15/16 (kenardan kenara)
// ════════════════════════════════════════════════════════════════════════════

describe('Mağaza kapıları · güvenli alan ve sistem çubukları', () => {
  const cfg = oku('capacitor.config.ts');
  const css = oku('index.css');

  it('Android 15+ sistem çubukları yapılandırılmış (SystemBars · Capacitor 8)', () => {
    // Hedef sürüm 35+ olduğunda StatusBar eklentisinin Android yolu ETKİSİZ:
    // stil cihazın temasına düşer, açık temalı telefonda simgeler görünmez.
    expect(cfg).toMatch(/SystemBars:\s*\{[^}]*style:\s*'DARK'/);
  });

  it('güvenli alan iki kaynaktan okunur (env + SystemBars değişkeni)', () => {
    expect(css).toContain('max(env(safe-area-inset-top, 0px),    var(--safe-area-inset-top, 0px))');
    expect(css).toContain('max(env(safe-area-inset-bottom, 0px), var(--safe-area-inset-bottom, 0px))');
  });

  it('pencere zemini koyu — açık temalı Android telefonda beyaz bant olmaz', () => {
    const st = oku('android/app/src/main/res/values/styles.xml');
    expect(st).toContain('<item name="android:windowBackground">@color/oyna_zemin</item>');
    expect(oku('android/app/src/main/res/values/colors.xml')).toContain('name="oyna_zemin"');
  });

  it('incelemecinin gördüğü ekranların başlığı çentiğin altında kalmaz', () => {
    // Gizlilik/sözleşme ekranı: incelemecinin uygulama içinde açtığı ilk yer.
    for (const dosya of ['views/LegalScreen.tsx', 'views/SettingsScreen.tsx',
                         'views/GuardianConsentChild.tsx', 'views/Notifications.tsx']) {
      expect(oku(dosya)).toContain('pt-[calc(var(--safe-top)+');
    }
  });

  it('3DS dönüş adresi uygulama içinde kalır (allowNavigation)', () => {
    expect(cfg).toContain("'*.supabase.co'");
    // Serbest bırakmak bir sorunu düzeltip üç yenisini açar.
    expect(cfg).not.toMatch(/allowNavigation:\s*\[\s*'\*'/);
  });
});

describe('Mağaza kapıları · klavye ve dokunma hedefleri', () => {
  it('klavye telafisi ÖLÇÜLÜR (çift boşluk yok)', () => {
    const km = oku('services/keyboardManager.ts');
    expect(km).toContain('export function ortulenYukseklik');
    // Eklentinin bildirdiği yükseklik doğrudan CSS'e YAZILMAZ.
    expect(km).not.toMatch(/setProperty\('--kb-height', `\$\{info\.keyboardHeight/);
  });

  it('onay kutularının dokunma alanı projenin kendi ölçüsünde (48px)', () => {
    // Görünen kutu 20px kalır; büyüyen yalnız dokunma alanıdır.
    // Ölçü Apple'ın 44pt'sinden değil, projenin kendi --oy-tap-min (48px)
    // belirteçinden gelir — Google'ın 48dp şartını da karşılar.
    const css = oku('index.css');
    expect(css).toContain('.dokunma-hedefi::before');
    expect(css).toMatch(/\.dokunma-hedefi::before[\s\S]{0,400}var\(--oy-tap-min/);
    expect(oku('views/AuthScreen.tsx')).toContain('className="dokunma-hedefi"');
    expect(oku('views/ServiceApplication.tsx')).toContain('dokunma-hedefi mt-0.5 w-5 h-5');
  });

  it('hareket azaltmada aşağı çekip yenileme ÖLMEZ', () => {
    const ss = oku('utils/scrollSystem.ts');
    // Eskiden tercih açıkken motor hiç kurulmuyordu → 9 ekranda yenileme gitti.
    expect(ss).not.toMatch(/const reduced = .*\n\s*if \(reduced\) return;/);
    expect(ss).toContain('hareketAzalt = !!window.matchMedia');
    expect(ss).toContain('if (!hareketAzalt) setOffset(el, g.offset, eksen);');
  });
});

describe('Mağaza kapıları · Android bildirimleri', () => {
  it('bildirim kanalı SUNUCUYLA aynı kimliği taşır', () => {
    const sunucu = oku('supabase/functions/send-push/index.ts');
    expect(sunucu).toContain("channel_id: 'oyna_main'");
    expect(oku('notifications/pushService.ts')).toContain("id: 'oyna_main'");
    expect(oku('android/app/src/main/AndroidManifest.xml')).toContain('android:value="oyna_main"');
  });

  it('küçük ikon beyaz kare olmasın diye beyan edilmiş', () => {
    const m = oku('android/app/src/main/AndroidManifest.xml');
    expect(m).toContain('com.google.firebase.messaging.default_notification_icon');
    expect(m).toContain('@drawable/ic_stat_oyna');
  });
});

describe('Mağaza kapıları · paket üretimi', () => {
  const pkg = JSON.parse(oku('package.json'));

  it('sync komutları uygulamayı YENİDEN DERLER (bayat paket gitmez)', () => {
    expect(pkg.scripts['sync:ios']).toContain('build:mobile');
    expect(pkg.scripts['sync:android']).toContain('build:mobile');
  });

  it('mobil pakette yönetim paneli YOKTUR', () => {
    expect(pkg.scripts['build:mobile']).toBe('node scripts/build-mobile.mjs');
    expect(oku('vite.config.ts')).toContain("process.env.OYNA_MOBILE === '1'");
    expect(oku('vite.config.ts')).toContain('MOBIL_PAKET\n        ? { main:');
  });

  it('yanlış .env ile mobil paket derlenemez', () => {
    const v = oku('vite.config.ts');
    expect(v).toContain('mobilPaketBekcisi');
    expect(v).toContain("env.VITE_DEMO_ACCOUNTS === 'true'");
    expect(v).toContain('MOBİL PAKET DERLEMESİ DURDURULDU');
  });
});

describe('Mağaza kapıları · beyan ile gerçek davranış uyumu', () => {
  it('kesin konum beyan edilmiş (uygulama GPS istiyor)', () => {
    expect(oku('services/locationService.ts')).toContain('highAccuracy: true');
    expect(oku('ios/App/App/PrivacyInfo.xcprivacy'))
      .toContain('NSPrivacyCollectedDataTypePreciseLocation');
  });

  it('kaleci/hakem kiralaması olmayan bir güvence VAAT ETMEZ', () => {
    const mp = oku('views/Marketplace.tsx');
    expect(mp).toContain('const KIRALAMA_ACIK = false');
    expect(mp).toContain('Kiralama Çok Yakında');
    // Şimdiki zamanda "bloke edilir / tahsil edilir" kalmamalı.
    expect(mp).not.toContain('Ücret önce kartında güvenle bloke edilir');
    expect(mp).not.toContain('Ödeme maç kesinleşince tahsil edilir; gelmezse ücretin iade edilir.');
  });

  it('yasal metinde olmayan cüzdana para gönderilmez', () => {
    const ld = oku('shared/legalDocs.ts');
    expect(ld).toContain('YÜRÜRLÜKTE DEĞİLDİR (17 Ağustos 2026)');
    expect(ld).not.toContain('ödediği bedelin tamamı derhal OYNA cüzdanına iade edilir');
    expect(ld).not.toContain('kesintisiz olarak OYNA cüzdanına iade edilir');
  });

  it('yaş kapısı HER yolda kapalı (Atla dahil)', () => {
    const ob = oku('views/Onboarding.tsx');
    expect(ob).toMatch(/case 1: return ageIndex !== null/);
    // "Atla" yolu da aynı kapıdan geçer.
    const atla = ob.slice(ob.indexOf('const handleSkip'), ob.indexOf('const aura'));
    expect(atla).toContain('if (ageIndex === null)');
  });
});
