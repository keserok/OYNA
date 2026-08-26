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
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';

const oku = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');

/**
 * DEMO GİRİŞ YOLLARI SİLİNDİ (23 Ağustos 2026) — kapı testi artık YOKLUK testi.
 *
 * Bu blok eskiden "demo seçici hangi bayrakla açılır" sorusunu koruyordu:
 * native'de kapalı, yalnız `VITE_DEMO_ACCOUNTS=true` derlemesinde, yalnız
 * yerel sunucuda… Üç bayrak, üç kapı — ve üç kez kurucunun karşısına çıktı.
 * Kapı kalmadı: kod silindi. Ayrıntılı kilit `tekGirisYolu.test.ts` içinde;
 * burada yalnız mağaza denetimi açısından kritik olan iki şey korunuyor.
 */
describe('Mağaza kapıları · demo girişi diye bir şey yok', () => {
  const s = oku('supabaseAuth.ts');

  it('ortak demo şifresi kaynakta HİÇ geçmiyor', () => {
    // Şifre paketin JS'ine harfi harfine giriyordu ve demo hesapların bir
    // kısmı GERÇEK saha sahibi hesaplarıydı: paketi açan biri kimlikleri
    // okuyup web üzerinden o hesaplara girebiliyordu.
    expect(s).not.toContain('password123');
    expect(s).not.toContain('DEMO_PASSWORD');
  });

  it('demo giriş fonksiyonları dışa açılmıyor', () => {
    for (const ad of ['demoLogin', 'loginDemoAccount', 'isDemoLoginEnabled',
                      'isDemoAccountPickerEnabled', 'isDemoLoginInput']) {
      expect(s, `${ad} hâlâ dışa açık`).not.toContain(`export const ${ad}`);
    }
  });

  it('inceleme paketi bayrağı hiçbir yerde OKUNMUYOR (5.6)', () => {
    // Bayrak adı YORUMDA geçebilir — "bir daha yapma" kaydı değerli; kilidin
    // koruduğu şey bayrağın OKUNMASI. `import.meta.env.X` / `env.X` biçimleri
    // derlemede değere dönüşen tek biçimler.
    for (const yol of ['supabaseAuth.ts', 'views/AuthScreen.tsx', 'vite.config.ts',
                       'package.json', 'vercel.json']) {
      expect(oku(yol), `${yol} inceleme bayrağını okuyor`)
        .not.toMatch(/(import\.meta\.)?env\.VITE_MAGAZA_INCELEME/);
    }
    expect(s).not.toContain('isIncelemePaketi');
  });

  it('mobil paket bekçisi ölü demo bayrağını REDDEDİYOR', () => {
    // `VITE_DEMO_ACCOUNTS` artık hiçbir şey açmıyor; ama yapılandırmada duran
    // ölü bir bayrak, ileride birinin "demo modunu açayım" diye kod yazmasına
    // davetiye çıkarır. Bayrak varsa mobil derleme DURUR.
    const v = oku('vite.config.ts');
    expect(v).toMatch(/if\s*\(env\.VITE_DEMO_ACCOUNTS\)\s*\{\s*\n\s*hatalar\.push/);
    expect(v).not.toContain('incelemePaketi');
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
  it('demo hesap kataloğu dosyası SİLİNDİ', () => {
    // Katalog `VITE_DEMO_ACCOUNTS=true` ile derlenen pakete giriyordu; bayrak
    // yanlış ortama yazıldığında (Vercel) kimlikler herkese açık bir adreste
    // yayınlanıyordu. Dosya artık yok.
    expect(existsSync(join(process.cwd(), 'data/demoAccounts.ts'))).toBe(false);
  });

  it('ortak şifre uygulama kaynağının HİÇBİR yerinde yok', () => {
    for (const yol of ['supabaseAuth.ts', 'views/AuthScreen.tsx', 'App.tsx']) {
      expect(oku(yol), `${yol} ortak demo şifresini taşıyor`).not.toContain('password123');
    }
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
    expect(oku('views/ServiceApplication.tsx')).toContain('dokunma-hedefi mt-0.5 w-5 h-5');
    // ── 24 Ağustos 2026 · MEKANİZMA DEĞİŞTİ, GARANTİ DEĞİŞMEDİ ──
    // Giriş ekranındaki onay kutusu artık 20px'lik bir kare + görünmez 48px
    // katman DEĞİL: tam satır kaplayan bir kart (`.au-onay`) ve kartın kendisi
    // düğme. Aynı şey "Beni hatırla" anahtarı için de geçerli (`.au-hatirla`).
    // Ölçü yine ELLE YAZILMIYOR, aynı `--oy-tap-min` belirtecinden okunuyor —
    // korunan şey buydu: tek kaynak + 48px alt sınır.
    // `dokunma-hedefi` sınıfı ServiceApplication'da AYNEN duruyor ve orada
    // hâlâ küçük kutu deseni kullanıldığı için kuralı da yerinde kalmalı.
    const alan = oku('views/authFieldStyles.ts');
    for (const sinif of ['.au-onay', '.au-hatirla']) {
      const kural = alan.match(new RegExp(`\\${sinif} \\{([^}]*)\\}`));
      expect(kural, `${sinif} kuralı bulunamadı`).not.toBeNull();
      expect(kural![1], `${sinif} dokunma ölçüsünü belirteçten okumuyor`)
        .toContain('min-height: var(--oy-tap-min');
    }
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
    expect(v).toContain('env.VITE_DEMO_ACCOUNTS');
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
    // Ekran hâlâ kilitli — ama artık kilidi PAYLAŞILAN bayrak tutuyor.
    expect(mp).toContain('const KIRALAMA_ACIK = KALECI_HAKEM_KIRALAMA_ACIK');
    expect(oku('shared/featureFlags.ts')).toContain('export const KALECI_HAKEM_KIRALAMA_ACIK = false');
    // Şimdiki zamanda "bloke edilir / tahsil edilir" kalmamalı.
    expect(mp).not.toContain('Ücret önce kartında güvenle bloke edilir');
    expect(mp).not.toContain('Ödeme maç kesinleşince tahsil edilir; gelmezse ücretin iade edilir.');
  });

  it('"YAKINDA" yüzeyine giden HİÇBİR kapı açık kalmadı', () => {
    // 24 Ağu 2026 denetimi: ekran kilitliydi ama ona giden İKİ kapı açıktı ve
    // kullanıcı sonuna kadar gezip "Kiralama Çok Yakında" duvarına tosluyordu.
    // Apple 2.1, yayınlanmış uygulamada "yakında" yüzeylerini reddediyor.
    //
    // 26 Ağu 2026'da değişmez EVRİLDİ, gevşemedi: kurucu vitrini geri istedi
    // ve sorunlu olan DUVARIN KENDİSİ silindi — kiralama kapalıyken tuş hiç
    // çizilmiyor. Kapı artık vaatsiz bir vitrine açılıyor; yasak olan kapı
    // değil, kapının ardındaki "yakında" vaadi. Bu test o vaadin üç parçasını
    // birden kilitler: duvar metni yok, kiralama tuşu bayrağa sarılı, lobi
    // kiralama bölümü işlem bayrağına bağlı.
    const mp = oku('views/Marketplace.tsx');
    expect(mp).not.toContain('Kiralama Çok Yakında');
    expect(mp).toContain('{KIRALAMA_ACIK && (');

    // Ana ekran kartları VİTRİN bayrağına bağlı — işlem bayrağına değil.
    const dash = oku('views/Dashboard.tsx');
    expect(dash).toContain('{KALECI_HAKEM_VITRIN_ACIK && (');
    expect(dash).toContain("KALECI_HAKEM_VITRIN_ACIK } from '../shared/featureFlags'");

    // Lobideki kiralama bölümü İŞLEMDİR, vitrin değil: kapalı kalır.
    const lobi = oku('views/MatchJoin.tsx');
    expect(lobi).toContain('{KALECI_HAKEM_KIRALAMA_ACIK && isManageMode && myCaptainSide && (');
  });

  it('tesis menüsünde "Çekim Yakında Açılacak" yüzeyine kapı yok', () => {
    // Çekim 19 Ağu 2026'da kalıcı kapatıldı ama menü satırı duruyordu:
    // dokunulunca tutar + IBAN alanları dolu, tam işlevli görünen bir form
    // açılıyor, sonundaki tuş kilitli kalıyordu. Üstelik bu ekran Apple'a
    // verilen tesis hesabında üç dokunuş uzaktaydı.
    const menu = oku('views/owner/menu/OwnerMenuView.tsx');
    expect(menu).toContain('{isOwnerLvl && CEKIM_UYGULAMADAN_ACIK && (');
    // Gerekçesiz gri satır da kalmamalı.
    expect(menu).not.toContain('label="Dil"');
  });

  it('yasal metinde olmayan cüzdana para gönderilmez', () => {
    const ld = oku('shared/legalDocs.ts');
    expect(ld).toContain('YÜRÜRLÜKTE DEĞİLDİR (17 Ağustos 2026)');
    expect(ld).not.toContain('ödediği bedelin tamamı derhal OYNA cüzdanına iade edilir');
    expect(ld).not.toContain('kesintisiz olarak OYNA cüzdanına iade edilir');
  });

  it('yaş kapısı HER yolda kapalı — ikinci bir yol AÇILMAMIŞ', () => {
    // Mağazaların yaş derecelendirmesi beyanı tek bir girdiye dayanıyor:
    // kullanıcının seçtiği yaş aralığı. 15 yaşındaki biri hiçbir şeye
    // dokunmadan yetişkin olarak kaydedilirse `is_minor` ve veli onayı akışı
    // HİÇ tetiklenmez.
    //
    // Eskiden kapı İKİ yerdeydi: `ctaEnabled` ve `handleSkip`. Atlama yolu
    // 24 Ağu 2026'da kaldırıldı, kapı tek yere indi. Bu testin işi, ileride
    // birinin ikinci bir yol açıp bu kapıyı atlamamasını sağlamak.
    const ob = oku('views/Onboarding.tsx');
    expect(ob).toMatch(/case 1: return ageIndex !== null/);

    // Kurulumu bitiren tek düğme `handleCta`; yaş adımından ilerlemesi
    // `ctaEnabled`e bağlı.
    expect(ob).toContain('if (!ctaEnabled) return;');

    // Yaşı sormadan kurulumu bitiren hiçbir yol olmamalı.
    expect(ob).not.toContain('const handleSkip');
    expect(ob).not.toContain('setSkipConfirm');

    // Sunucudaki ikizi: istemci kandırılsa bile kapı orada da durur.
    expect(oku('services/onboardingService.ts')).toContain('ageRange');
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
// İNCELEMECİYE ÖZEL YOL YOK (22 Ağustos 2026 — Apple 5.6 reddi)
//
// 19 Ağustos'ta giriş ekranına yalnız inceleme paketinde görünen iki dilli bir
// "APP REVIEW" afişi ve OTP çıkmazını demo seçiciye çeviren bir kapı konmuştu.
// Apple bunu 5.6 altında reddetti: "features that appear to have been
// intentionally hidden during the review process". Mağazaya giden paket ile
// kullanıcının indirdiği paket AYNI olmak zorunda.
//
// Bu blok o makinenin geri gelmesini engeller. Gerçek çözüm ürün tarafında:
// telefon adımı herkes için atlanabilir (App.tsx · numaraGerekli), böylece
// Türk numarası olmayan incelemeci de Apple ile girip uygulamayı gezebilir.
// ═══════════════════════════════════════════════════════════════════════════
describe('İncelemeciye özel yol YOK (Apple 5.6)', () => {
  const ekran = () => oku('views/AuthScreen.tsx');

  it('giriş ekranında incelemeciye özel afiş yok', () => {
    const s = ekran();
    expect(s).not.toContain('APP REVIEW');
    expect(s).not.toContain('SMS codes are sent to Turkish numbers only');
    expect(s).not.toContain('isIncelemePaketi');
  });

  it('giriş hatası incelemeciyi başka bir yola çeviren gizli kapı açmıyor', () => {
    const s = ekran();
    expect(s).not.toContain('incelemeOtpCikmaziniYonet');
    // 23 Ağu 2026: telefonla giriş ve demo yolu SİLİNDİ; geriye tek hata yolu
    // kaldı ve HERKES için aynı. Kapının koruduğu şey değişmedi: hata anında
    // "şu kullanıcıya şunu göster" diye dallanan bir kod olamaz.
    // 23 Ağu 2026 · ikinci tur: iki sağlayıcı TEK yolda birleşti (girisBaslat).
    // Kapının koruduğu şey değişmedi: hata anında "şu kullanıcıya şunu göster"
    // diye dallanan bir kod olamaz — dal yalnız HATA TÜRÜNE bakar.
    expect(s).toContain('const sonuc = saglayiciHatasi(err,');
    expect(s.match(/saglayiciHatasi\(err,/g)?.length).toBe(1); // tek yol
    // "demo" kelimesi YORUMLARDA geçebilir — silinen şeyin kaydı değerli.
    // Kilit KODA bakar.
    const kod = s.split('\n').filter((l) => !/^\s*(\/\/|\/\*|\*)/.test(l)).join('\n');
    expect(kod).not.toMatch(/demo/i);
  });

  it('inceleme derleme betikleri package.json\'dan silindi', () => {
    const p = oku('package.json');
    for (const betik of ['build:inceleme', 'sync:ios:inceleme', 'sync:android:inceleme']) {
      expect(p, `${betik} hâlâ duruyor`).not.toContain(betik);
    }
  });

  it('web dağıtımı da normal paketi derliyor', () => {
    // Vercel eskiden `build:inceleme` derliyordu: demo kimlikleri herkese
    // açık bir adreste yayınlanıyordu. Artık mobille aynı paket.
    expect(JSON.parse(oku('vercel.json')).buildCommand).toBe('npm run build');
  });

  it('mağaza denetimi pakette demo kimliği görürse ENGEL veriyor', () => {
    const d = oku('scripts/magaza-denetim.mjs');
    // İstisna kalktı: "inceleme paketi" diye uyarıya indirilen yol yok.
    expect(d).not.toContain('İnceleme paketi derlenmiş');
    expect(d).toContain("g.includes('DEMO HESABIYLA GİR')");
    const blok = d.slice(d.indexOf('const dist = join(KOK'), d.indexOf('7 · UYGULAMA İÇİ HESAP SİLME'));
    // Sızıntı bulunduğunda tek çıkış var: engel. Dallanma yok, uyarıya
    // indirilen bir "ama bu inceleme paketi" yolu yok.
    expect(blok).toMatch(/if \(sizinti\.length\) \{\s*\n\s*engel\('Demo kimlikleri pakette'/);
    expect(blok).not.toMatch(/sizinti\.length &&/);
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

/**
 * VİTRİN GÖRSELLERİ KAPISI (25 Ağustos 2026)
 *
 * App Store ekran görüntüsü çekilirken vitrindeki fotoğraflara ilk kez tek
 * tek bakıldı. "Saha Kirala" listesinin ilk kartı bir FIFA Dünya Kupası
 * renderıydı — kaidesinde "FIFA WORLD CUP" okunuyordu; bir kortun iki
 * fotoğrafı ise tanınabilir kişilerin ve çocukların özel fotoğraflarıydı.
 * Aylardır canlıdaydılar ve yeşil geçen yirmi denetimin hiçbiri bakmıyordu,
 * çünkü hepsi DOSYALARA bakıyordu; bunlar VERİDEYDİ.
 *
 * Bu blok, 11. kapının kendini yanlış yerde yeşil göstermesini engelleyen üç
 * özelliğini kilitler. Üçü de kapıyı yazarken bizzat yaşandı.
 */
describe('Vitrin görselleri kapısı · yanlış yeşil vermiyor', () => {
  const kod = oku('scripts/magaza-denetim.mjs');
  const kapi = kod.slice(kod.indexOf('11 · VİTRİN GÖRSELLERİ'));

  it('kapı gerçekten var ve canlı veriyi okuyor', () => {
    expect(kapi).toContain('rest/v1/');
    expect(kapi).toContain('pitches?select=');
    expect(kapi).toContain('courts?select=');
  });

  it('adres karşılaştırması ağa BAĞLI DEĞİL — indirme öncesinde yapılıyor', () => {
    // İçerik karşılaştırması görsel indirilemezse sessizce devre dışı kalır.
    // Adres karşılaştırması her koşulda çalışmalı; bu yüzden fetch'ten ÖNCE
    // gelmek zorunda. Canlıdaki gerçek çakışmayı (aynı stok fotoğrafın iki
    // sahada olması) yakalayan kural buydu.
    const adresKurali  = kapi.indexOf('adresSahalari');
    const indirme      = kapi.indexOf('await Promise.all(benzersiz.map');
    expect(adresKurali).toBeGreaterThan(-1);
    expect(indirme).toBeGreaterThan(-1);
    expect(adresKurali).toBeLessThan(indirme);
  });

  it('hiçbir görsel indirilemediyse TAMAM demiyor', () => {
    // İlk sürüm "çakışan içerik yok" diye yeşil yandı; oysa dokuz görselin
    // dokuzu da indirilememişti ve hiçbir karşılaştırma yapılmamıştı.
    expect(kapi).toContain('dogrulanan === 0');
    const yesilSatir = kapi.match(/tamam\(`Vitrin görselleri:[^`]*`\)/)?.[0] ?? '';
    expect(yesilSatir).toContain('dogrulanan');       // kaç tanesi bakıldı, söylüyor
    expect(yesilSatir).toContain('benzersiz.length'); // kaç tanesi vardı, söylüyor
  });

  it('maç görselleri kopya kurallarının DIŞINDA', () => {
    // Maç görseli sahadan türetilir; aynı sahanın onlarca maçında aynı
    // fotoğrafın görünmesi DOĞRUDUR. İlk sürüm maçları da kapsayınca kapı
    // üç yanlış engel üretti. Ayrım kalıcı olmalı.
    expect(kapi).toContain('macGorselleri');
    const ekleTanimi = kapi.slice(kapi.indexOf('const ekle ='), kapi.indexOf('const ekle =') + 200);
    expect(ekleTanimi).toContain('gorseller.push');
    // `gorseller` (tesis kimliği) maç görseli ASLA almamalı:
    expect(kapi).not.toMatch(/for \(const m of maclar\) ekle\(/);
  });

  it('üçüncü taraf barındırıcı ENGEL değil UYARI — ağ politikası da 403 döndürebilir', () => {
    const disBolum = kapi.slice(kapi.indexOf('const disAdres'));
    expect(disBolum).toContain('uyari(');
    expect(disBolum.slice(0, disBolum.indexOf('dogrulanan'))).not.toContain('engel(');
  });
});

/**
 * `vitrin:gorseller` — makinenin göremediğini insana gösteren komut.
 *
 * Bir fotoğrafın kupa mı, çocuk mu, halı saha mı olduğunu hiçbir denetim
 * bilemez. 11. kapı ancak kopyayı ve kırık adresi yakalar. Geri kalanı
 * bakmakla anlaşılır — ve aylarca bakılmamasının sebebi bakmanın zahmetli
 * olmasıydı: altı saha, kortları, altmış beş maç, hepsi ayrı ekranlarda.
 */
describe('vitrin:gorseller · bakmayı tek komuta indiriyor', () => {
  it('betik depoda (scripts/* kalıbına yutulmamış)', () => {
    expect(existsSync(join(process.cwd(), 'scripts/vitrin-gorselleri.mjs'))).toBe(true);
    expect(oku('.gitignore')).toContain('!scripts/vitrin-gorselleri.mjs');
  });

  it('package.json üzerinden çağrılabiliyor', () => {
    const p = JSON.parse(oku('package.json'));
    expect(p.scripts['vitrin:gorseller']).toContain('vitrin-gorselleri.mjs');
  });

  it('saha, kort ve maç görsellerinin ÜÇÜNÜ de basıyor', () => {
    const s = oku('scripts/vitrin-gorselleri.mjs');
    expect(s).toContain('pitches?select=');
    expect(s).toContain('courts?select=');
    expect(s).toContain('public_matches?select=');
  });

  it('11. kapı, bakılacak yeri adıyla gösteriyor', () => {
    expect(oku('scripts/magaza-denetim.mjs')).toContain('npm run vitrin:gorseller');
  });
});

/**
 * DEPO TEMİZLİĞİ (25 Ağustos 2026)
 *
 * Açık kovadaki dosyaların veritabanı bağları koparıldı ama dosyaların
 * KENDİLERİ duruyor: adresini bilen hâlâ açabilir. Kalıcı silme SQL ile
 * yapılamıyor — Supabase `storage.protect_delete()` ile doğrudan DELETE'i
 * engelliyor, çünkü satırı silmek S3'teki nesneyi silmez ve erişilemeyen bir
 * artık bırakır. Silme depolama API'siyle, tam yetkili anahtarla yapılır.
 *
 * Silme GERİ ALINAMAZ ve listede kurucunun kendi aile fotoğrafları var.
 * Bu blok, o dosyaların yanlışlıkla silinmesini önleyen kapıları kilitler.
 */
describe('Depo temizliği · yanlışlıkla silmiyor', () => {
  const liste = JSON.parse(oku('docs/master/depo-silinecekler.json'));
  const betik = oku('scripts/depo-temizle.mjs');

  it('kişisel fotoğrafların HİÇBİRİ onaylı değil', () => {
    // Kurucu "önce telifli olanları sil, kişisel olanlara dokunma" dedi:
    // asıllarının elinde olduğundan emin olmadan silinmemeli.
    const kisisel = liste.dosyalar.filter((d: any) => d.sinif === 'KISISEL');
    expect(kisisel.length).toBeGreaterThan(0);
    expect(kisisel.every((d: any) => d.onaylandi === false)).toBe(true);
  });

  it('onaylı olanların hepsi TELİF sınıfı', () => {
    const onayli = liste.dosyalar.filter((d: any) => d.onaylandi);
    expect(onayli.length).toBeGreaterThan(0);
    expect([...new Set(onayli.map((d: any) => d.sinif))]).toEqual(['TELIF']);
  });

  it('her satırda ne olduğu yazılı — yol tek başına hiçbir şey anlatmıyor', () => {
    for (const d of liste.dosyalar) {
      expect(typeof d.ne).toBe('string');
      expect(d.ne.length).toBeGreaterThan(10);
    }
  });

  it('varsayılan KURU ÇALIŞMA — --uygula olmadan silmiyor', () => {
    expect(betik).toContain("process.argv.includes('--uygula')");
    const kuru = betik.indexOf('if (!UYGULA)');
    const silme = betik.indexOf("method: 'DELETE'");
    expect(kuru).toBeGreaterThan(-1);
    expect(kuru).toBeLessThan(silme);   // çıkış, silmeden ÖNCE
  });

  it('onaylanmamış dosya silme listesine hiç girmiyor', () => {
    expect(betik).toContain('hepsi.filter((d) => d.onaylandi)');
    expect(betik).toContain('const silinir = onayli.filter');
  });

  it('hâlâ bağlı dosyayı silmiyor', () => {
    // Bağlı bir dosyayı silmek uygulamada kırık görsel bırakır (Apple 2.1).
    expect(betik).toContain('bagliMi');
    expect(betik).toContain('HÂLÂ BAĞLI');
  });

  it('sildikten sonra adresin GERÇEKTEN kapandığını doğruluyor', () => {
    // "204 döndü" yetmez; herkese açık adres hâlâ 200 veriyorsa iş bitmemiştir.
    expect(betik).toContain('object/public/');
    expect(betik).toContain('kontrol.status === 200');
  });

  it('servis anahtarı yalnız ortamdan okunuyor, diske yazılmıyor', () => {
    expect(betik).toContain('process.env.SUPABASE_SERVICE_ROLE_KEY');
    expect(betik).not.toMatch(/writeFileSync[\s\S]{0,120}ANAHTAR/);
    expect(betik).not.toMatch(/console\.log\([^)]*ANAHTAR[^)]*\)/);
  });

  it('betik ve liste depoda', () => {
    expect(existsSync(join(process.cwd(), 'scripts/depo-temizle.mjs'))).toBe(true);
    expect(oku('.gitignore')).toContain('!scripts/depo-temizle.mjs');
    expect(JSON.parse(oku('package.json')).scripts['depo:sil']).toContain('depo-temizle.mjs');
  });
});

/**
 * Servis anahtarı komut satırına yazdırılmaz (25 Ağustos 2026)
 *
 * İlk sürüm anahtarı ortam değişkeninden istiyordu:
 *     SUPABASE_SERVICE_ROLE_KEY=… npm run depo:sil -- --uygula
 * Bu, kod tarafı olmayan biri için hem zor hem risklidir: komut satırına
 * yazılan her şey kabuk geçmişine düşer ve orada KALIR. Tam yetkili bir
 * anahtarın düz metin olarak diskte durması, silmeye çalıştığımız sorunun
 * aynısıdır.
 */
describe('Depo temizliği · anahtar kabuk geçmişine düşmüyor', () => {
  const betik = oku('scripts/depo-temizle.mjs');

  it('anahtar ortamda yoksa soruluyor, hata verilmiyor', () => {
    expect(betik).toContain('sorGizli');
    expect(betik).toContain('await sorGizli(');
  });

  it('girilen anahtar ekrana basılmıyor', () => {
    // readline'ın çıktı yazıcısı susturulmazsa anahtar terminalde görünür ve
    // omuz üstünden okunabilir; ayrıca terminal kaydı tutan araçlara düşer.
    expect(betik).toContain('_writeToOutput');
  });

  it('anahtar biçimi ağa çıkmadan önce denetleniyor', () => {
    const denetim = betik.indexOf('sb_secret_');
    const silme   = betik.indexOf("method: 'DELETE'");
    expect(denetim).toBeGreaterThan(-1);
    expect(denetim).toBeLessThan(silme);
  });

  it('kuru çalışma metni artık ortam değişkeni istemiyor', () => {
    const kuru = betik.slice(betik.indexOf('KURU ÇALIŞMA'), betik.indexOf('KURU ÇALIŞMA') + 400);
    expect(kuru).not.toContain('SUPABASE_SERVICE_ROLE_KEY=');
    expect(kuru).toContain('npm run depo:sil -- --uygula');
  });
});

/**
 * TESTİN OKUDUĞU HER BETİK DEPODA OLMALI
 *
 * `.gitignore` içinde `scripts/*` kalıbı var ve depoda durması gereken her
 * betik tek tek beyaz listeye ekleniyor. Eklemeyi unutmak sessiz bir
 * hatadır: dosya kendi diskinde durduğu için testler YEREL'de geçer, CI'da
 * ise ENOENT verir. Bu oturumda iki kez oldu:
 *
 *   · `build-legal-roles.mjs` — temiz kopyada `npm run build:legal` çalışmadı
 *   · `kasa.mjs` — PR #173'te üç test birden ENOENT ile düştü
 *
 * Bu test o boşluğu kapatıyor: bir birim testi hangi betiği okuyorsa, o
 * betik git tarafından TAKİP EDİLİYOR olmalı. Diskte durması yetmez.
 */
describe('Testlerin okuduğu betikler depoda', () => {
  it('hiçbir test, takip edilmeyen bir betiğe dayanmıyor', () => {
    const testKlasoru = join(process.cwd(), 'tests/unit');
    const dosyalar = readdirSync(testKlasoru).filter((f) => f.endsWith('.test.ts'));

    const eksik: string[] = [];
    for (const dosya of dosyalar) {
      const icerik = readFileSync(join(testKlasoru, dosya), 'utf8');
      const yollar = new Set(icerik.match(/scripts\/[A-Za-z0-9_./-]+\.(mjs|js|sh|cjs)/g) ?? []);
      for (const yol of yollar) {
        const takipli = spawnSync('git', ['ls-files', '--error-unmatch', yol],
          { cwd: process.cwd(), stdio: 'ignore' }).status === 0;
        if (!takipli) eksik.push(`${dosya} → ${yol}`);
      }
    }

    expect(eksik, `Bu betikler testlerde okunuyor ama git takip etmiyor — ` +
      `CI'da ENOENT verirler. .gitignore'a "!<yol>" satırı ekle:\n  ${eksik.join('\n  ')}`)
      .toEqual([]);
  });
});
