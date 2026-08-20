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

  /**
   * KARAR DEĞİŞTİ (19 Ağustos 2026 — kurucu kararı).
   *
   * Seçici artık native'de KOŞULSUZ kapalı değil: mağaza inceleme paketinde
   * AÇIK. Sebebi somut — incelemecinin Türk numarası yok, telefon kodu ona
   * ulaşmıyor ve uygulamayı hiç açamıyor; bu, gönderimin en olası ret sebebi.
   *
   * Kilit ARTIK ŞUNU KORUYOR: kapı yalnız AYRI ve AÇIKÇA yazılmış bir bayrakla
   * (`VITE_MAGAZA_INCELEME`) açılabilir. Geliştirme bayrağı `VITE_DEMO_ACCOUNTS`
   * tek başına native'de seçiciyi AÇAMAZ — yoksa bir .env unutması paketi
   * demo kimlikleriyle yayına gönderirdi.
   */
  it('demo hesap seçici native pakette YALNIZ inceleme bayrağıyla açılır', () => {
    const g = govde('isDemoAccountPickerEnabled');
    expect(g).toContain('Capacitor.isNativePlatform()');
    expect(g).toContain('INCELEME_PAKETI');

    // BİÇİM DEĞİL DAVRANIŞ (20 Ağu 2026): bu kilit eskiden tek bir satırın
    // yazılışını (`isNativePlatform() && !INCELEME_PAKETI`) ezberliyordu. O
    // yazılışta kapı, inceleme bayrağından SONRA bir de
    // `VITE_DEMO_ACCOUNTS !== 'false'` arıyordu; mağaza denetimi ise .env'de
    // `VITE_DEMO_ACCOUNTS=false` olmasını ZORUNLU tutuyor. Sonuç: inceleme
    // paketi derlense bile seçici KAPALI kalıyordu ve kimse bunu görmüyordu.
    // Kilit artık üç değişmezi koruyor, satırın şeklini değil:
    const incelemeIdx = g.indexOf('INCELEME_PAKETI');
    const nativeIdx = g.indexOf('isNativePlatform');

    // 1) İnceleme bayrağı TEK BAŞINA yeter — seçiciyi açar.
    expect(g).toMatch(/if\s*\(\s*INCELEME_PAKETI\s*\)\s*return true/);
    // 2) Karar sırası: inceleme kapısı native kapısından ÖNCE gelir.
    expect(incelemeIdx).toBeLessThan(nativeIdx);
    // 3) Bayrak yoksa native pakette seçici KOŞULSUZ kapalıdır — bir .env
    //    unutması paketi demo kimlikleriyle yayına gönderemez.
    expect(g).toMatch(/if\s*\(\s*Capacitor\.isNativePlatform\(\)\s*\)\s*return false/);
  });

  it('inceleme bayrağı ayrı — geliştirme bayrağı tek başına native\'de açamaz', () => {
    expect(s).toContain("import.meta.env.VITE_MAGAZA_INCELEME === 'true'");
    // Bayrak adı GELİŞTİRME bayrağından farklı olmalı; aynısı olsaydı mobil
    // paket bekçisinin engeli anlamsızlaşırdı.
    expect(s).not.toMatch(/INCELEME_PAKETI\s*=\s*import\.meta\.env\.VITE_DEMO_ACCOUNTS/);
  });

  it('mobil paket bekçisi inceleme paketini AYIRT EDİYOR', () => {
    const v = oku('vite.config.ts');
    // Normal derlemede demo kataloğu hâlâ ENGEL; yalnız beyan edilmiş inceleme
    // paketinde geçiyor ve o zaman da yüksek sesle uyarıyor.
    expect(v).toContain("env.VITE_DEMO_ACCOUNTS === 'true' && !incelemePaketi");
    expect(v).toContain('İNCELEME PAKETİ DERLENİYOR');
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

  it('ortak şifre sabiti NORMAL üretim paketinde BOŞ', () => {
    const s = oku('supabaseAuth.ts');
    // Şifre iki bayraktan BİRİ açıkken doluyor: geliştirme (VITE_DEMO_ACCOUNTS)
    // ya da mağaza inceleme paketi (VITE_MAGAZA_INCELEME). İkisi de yoksa BOŞ —
    // yani normal yayın paketinde gömülü şifre yok.
    expect(s).toMatch(
      /const DEMO_PASSWORD =\s*\n?\s*\(import\.meta\.env\.VITE_DEMO_ACCOUNTS === 'true' \|\| import\.meta\.env\.VITE_MAGAZA_INCELEME === 'true'\)/,
    );
    expect(s).toContain("? 'password123' : '';");
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

// ═══════════════════════════════════════════════════════════════════════════
// GÖNDERİM DENETİMİ BETİĞİ (19 Ağustos 2026)
//
// Mağaza reddi çoğu zaman büyük bir hatadan değil, unutulmuş küçük bir
// dosyadan gelir. `npm run magaza:denetim` bunları mekanik olarak sınar.
// Buradaki testler betiğin KENDİSİNİ korur: kapılardan biri sessizce
// silinirse gönderim öncesi kimse fark etmez.
// ═══════════════════════════════════════════════════════════════════════════
describe('Mağaza gönderim denetimi betiği', () => {
  const betik = () => oku('scripts/magaza-denetim.mjs');

  it('yedi denetim başlığının hepsi duruyor', () => {
    const s = betik();
    for (const ad of [
      'Sürüm numaraları', 'Uygulama simgeleri', 'iOS gizlilik ve izinler',
      'Android gönderim ayarları', 'Yasal sayfalar',
      'Pakete sızmaması gerekenler', 'Uygulama içi hesap silme',
    ]) {
      expect(s, ad).toContain(`denetle('${ad}'`);
    }
  });

  it('reddin en sık sebepleri tek tek sınanıyor', () => {
    const s = betik();
    // Her biri gerçek bir ret kodu / mağaza kuralıdır.
    expect(s).toContain('PrivacyInfo.xcprivacy');        // ITMS-91053
    expect(s).toContain('com.apple.developer.applesignin'); // Apple kuralı 4.8
    expect(s).toContain('NSCameraUsageDescription');      // izinsiz çökme
    expect(s).toContain('hesap-silme.html');             // Play hesap silme şartı
    expect(s).toContain('VITE_DEMO_ACCOUNTS');           // demo kimlik sızıntısı
    expect(s).toContain('targetSdkVersion');             // Play hedef sürüm şartı
  });

  it('derlenmiş pakette demo kimliği aranıyor (kill-switch unutulsa bile)', () => {
    const s = betik();
    expect(s).toContain('password123');
    expect(s).toContain('dist/assets');
  });

  it('engel varsa çıkış kodu 1 — CI takabilsin', () => {
    expect(betik()).toContain('process.exit(engeller.length > 0 ? 1 : 0)');
  });

  it('elle tutulan yasal sayfalar üreticiyle karşılaştırılmıyor', () => {
    // gizlilik.html / hesap-silme.html üreticiden çıkmaz; legalDocs.ts ile
    // kıyaslamak her yasal düzenlemeden sonra sahte alarm üretirdi.
    const s = betik();
    expect(s).toContain('sozlesmeler/oyuncu/01-kullanim-sartlari.md');
    expect(s).toContain('ELLE');
  });

  it('sürüm artırma betiği iki platformu BİRLİKTE yükseltiyor', () => {
    const s = oku('scripts/surum-artir.mjs');
    expect(s).toContain('CURRENT_PROJECT_VERSION');
    expect(s).toContain('oynaVersionCode');
    // Sürüm ADI otomatik artmamalı: kullanıcının gördüğü numaradır.
    expect(s).toContain('yalnız `--ad` verilirse');
  });

  it('iki betik de package.json üzerinden çağrılabiliyor', () => {
    const pkg = JSON.parse(oku('package.json'));
    expect(pkg.scripts['magaza:denetim']).toBe('node scripts/magaza-denetim.mjs');
    expect(pkg.scripts['surum:artir']).toBe('node scripts/surum-artir.mjs');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// İNCELEMECİYE YÖNERGE (19 Ağustos 2026)
//
// İncelemecinin Türk numarası yok; SMS kodu ona ulaşmıyor. Ekranda yalnız
// "numaranı gir" yazsaydı demo düğmesini fark etmeyip uygulamayı "çalışmıyor"
// diye reddedebilirdi — gönderimin en olası ret sebebi buydu.
// ═══════════════════════════════════════════════════════════════════════════
describe('Mağaza incelemecisine yönerge', () => {
  const ekran = () => oku('views/AuthScreen.tsx');

  it('yönerge YALNIZ inceleme paketinde render ediliyor', () => {
    const s = ekran();
    expect(s).toContain('isIncelemePaketi() && showDemoPicker');
  });

  it('İngilizce yazıyor — incelemecinin Türkçe okuduğu varsayılamaz', () => {
    const s = ekran();
    expect(s).toContain('SMS codes are sent to Turkish numbers only');
    expect(s).toContain('DEMO HESABIYLA GİR');
  });

  it('ne yapılacağını adım adım söylüyor', () => {
    const s = ekran();
    // Onay kutusu şart; söylenmezse incelemeci düğmeye basıp tepki alamaz.
    expect(s).toContain('tick the consent box');
    expect(s).toContain('onay kutusunu');
  });

  it('yönergenin kapısı normal pakette kapalı', () => {
    const a = oku('supabaseAuth.ts');
    expect(a).toContain('export const isIncelemePaketi = (): boolean => INCELEME_PAKETI');
  });

  /**
   * ÇIKMAZ UÇ KAPISI (20 Ağustos 2026 — canlıda ölçüldü).
   *
   * Telefon sağlayıcısı inceleme döneminde KAPALI. İncelemecinin ilk refleksi
   * numara yazıp KOD GÖNDER'e basmak; o an ekran yalnız Türkçe "Google/Apple
   * ile gir" diyordu — çalışması garantili tek yolu (demo seçici) göstermeden.
   * İnceleme paketinde bu çıkmaz, iki dilli yönlendirme + kendiliğinden açılan
   * seçiciyle kapatılır. Normal paket davranışı DEĞİŞMEZ.
   */
  it('kod gönderilemezse incelemeci demo yoluna yönlendirilir', () => {
    const s = ekran();
    // Kapı yalnız inceleme paketinde ve seçici gerçekten varken açılır.
    expect(s).toContain('if (!(isIncelemePaketi() && showDemoPicker)) return false');
    // Seçici kendiliğinden açılır — incelemeci listeyle burun buruna gelir.
    const govde = s.slice(s.indexOf('const incelemeOtpCikmaziniYonet'), s.indexOf('const handleSendOtp'));
    expect(govde).toContain('setDemoPickerOpen(true)');
    // İngilizce söylenir — incelemecinin Türkçe okuduğu varsayılamaz.
    expect(govde).toContain('use “DEMO HESABIYLA GİR” below');
    // İki çıkmaz da (yurt dışı ülke kodu + gönderim hatası) aynı kapıdan geçer.
    expect((s.match(/incelemeOtpCikmaziniYonet\(\)/g) ?? []).length).toBeGreaterThanOrEqual(2);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// ÖDEME SAĞLAYICISI ÇÖZÜMLEMESİ (19 Ağustos 2026)
//
// Sağlayıcı iki yerde tutuluyordu ve canlıda İKİSİ AYRI cevap veriyordu:
// panel (`app_config.payment_provider`) SIMULATION derken edge fonksiyonu
// PAYMENT_PROVIDER secret'ı yüzünden IYZICO'ydu. Yani uygulama "ödeyebilirsin"
// diyor, arkada GERÇEK kart çekimi deneniyordu — incelemecinin hayali kartı
// reddedilir, gerçek kart giren biri gerçekten öderdi.
//
// Kural: PANEL DARALTIR, ASLA GENİŞLETMEZ. Gerçek para için iki tarafın da
// aynı anda IYZICO demesi şart. Aşağısı bu sınırı kilitler.
// ═══════════════════════════════════════════════════════════════════════════
describe('Ödeme sağlayıcısı · panel daraltır, genişletmez', () => {
  const cozumleyici = () => oku('supabase/functions/_shared/paymentProvider.ts');

  it('IYZICO yalnız İKİSİ birden IYZICO iken seçilir', () => {
    expect(cozumleyici()).toContain(
      "if (config === 'IYZICO' && ENV_PROVIDER === 'IYZICO') {");
  });

  it('secret TEK BAŞINA gerçek para yolunu açamaz — config her zaman okunur', () => {
    const s = cozumleyici();
    const govde = s.slice(s.indexOf('export async function resolvePaymentProvider'));
    // Erken dönüş olmamalı: env'e bakıp config'i atlayan bir kısayol,
    // panelin daraltma yetkisini yok eder (canlıdaki hata tam buydu).
    expect(govde).not.toContain('if (ENV_PROVIDER) return ENV_PROVIDER');
    expect(govde).toContain("p_key: 'payment_provider'");
  });

  it('SIMULATION için adı konmuş demo anahtarı da şart', () => {
    expect(cozumleyici()).toContain(
      "} else if (config === 'SIMULATION' && simCanli.data === true) {");
    expect(cozumleyici()).toContain("p_key: 'simulation_counts_as_live'");
  });

  it('başka her hâl DISABLED', () => {
    expect(cozumleyici()).toContain("} else {\n      sonuc = 'DISABLED'\n    }");
  });

  it('config okunamazsa: bilinen değer sürer, hiç yoksa DISABLED', () => {
    const s = cozumleyici();
    expect(s).toContain('if (onbellek) return onbellek.value');
    expect(s).toMatch(/if \(onbellek\) return onbellek\.value\n\s*sonuc = 'DISABLED'/);
  });

  it('iki ödeme fonksiyonu da aynı kaynağı kullanıyor — kopya kural yok', () => {
    for (const f of ['supabase/functions/create-payment/index.ts',
                     'supabase/functions/refund-payment/index.ts']) {
      const s = oku(f);
      expect(s, `${f} paylaşılan çözümleyiciyi kullanmıyor`)
        .toContain("import { resolvePaymentProvider } from '../_shared/paymentProvider.ts'");
      expect(s, `${f} hâlâ kendi env okumasını yapıyor`)
        .not.toContain("Deno.env.get('PAYMENT_PROVIDER')");
      expect(s).toContain('await resolvePaymentProvider(admin)');
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// SAHTE İADE KAPISI (19 Ağustos 2026)
//
// Kuyruk işlemcisi "sağlayıcı SIMULATION" görünce satırı DONE yazıyordu.
// Sağlayıcı artık panelden de gelebildiği için, canlıya geçerken demo anahtarı
// kapatılmayı unutulursa GERÇEK ÇEKİLMİŞ bir tahsilat "iade edildi" diye
// işaretlenir, müşterinin parası bizde kalırdı.
// ═══════════════════════════════════════════════════════════════════════════
describe('İade kuyruğu · sahte iade yalnız sahte tahsilata', () => {
  const s = () => oku('supabase/functions/refund-payment/index.ts');

  it('DONE yazmak için tahsilatın kendisi de simülasyon olmalı', () => {
    expect(s()).toContain("const sahteTahsilat = intent?.raw?.simulated === true");
    expect(s()).toContain("if (PROVIDER === 'SIMULATION' && sahteTahsilat) {");
  });

  it('gerçek tahsilat + simülasyon modu = sessiz DONE değil, insana kalır', () => {
    expect(s()).toContain('GERCEK_TAHSILAT_SIM_MODDA');
  });
});
