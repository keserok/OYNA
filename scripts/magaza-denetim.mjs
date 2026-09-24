#!/usr/bin/env node
/**
 * MAĞAZA GÖNDERİM DENETİMİ — `npm run magaza:denetim`
 *
 * NİYE VAR: mağaza reddi çoğu zaman büyük bir hatadan değil, unutulmuş küçük
 * bir dosyadan gelir — eksik bir izin açıklaması, güncellenmemiş bir sürüm
 * numarası, yeniden üretilmemiş bir yasal sayfa. Bunların hepsi mekanik olarak
 * denetlenebilir; insan hafızasına bırakmanın anlamı yok.
 *
 * NE YAPMAZ: bu betik mağazanın kendi incelemesinin yerine geçmez. Yalnız
 * "gönderim dosyaları eksiksiz mi" sorusunu yanıtlar. İçerik kararları
 * (ekran görüntüleri, açıklama metni, yaş sınırı formu) insana kalır.
 *
 * ÇIKIŞ KODU: bir tane bile ENGEL varsa 1, yoksa 0. CI'a takılabilir.
 */
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const KOK = join(dirname(fileURLToPath(import.meta.url)), '..');
const oku = (p) => readFileSync(join(KOK, p), 'utf8');
const varMi = (p) => existsSync(join(KOK, p));

/** Bulgular: engel gönderimi durdurur, uyarı durdurmaz ama bakılmalı. */
const engeller = [];
const uyarilar = [];
const tamamlar = [];

// İstemciye gömülü olanla AYNI açık anahtar (anon/publishable). Herkese
// açıktır ve RLS ile korunur; buradaki tek işi resolve_payment_mode'u okumak.
const GOMULU_ANON = readFileSync(join(KOK, 'supabaseClient.ts'), 'utf8')
  .match(/PROD_SUPABASE_ANON_KEY\s*=\s*\n?\s*'([^']+)'/)?.[1] ?? '';

const engel = (baslik, aciklama) => engeller.push({ baslik, aciklama });
const uyari = (baslik, aciklama) => uyarilar.push({ baslik, aciklama });
const tamam = (baslik) => tamamlar.push(baslik);

/** Bir denetimi çalıştırır; içeride patlarsa denetim ENGEL sayılır. */
function denetle(ad, fn) {
  try { fn(); } catch (e) {
    engel(ad, `Denetim çalıştırılamadı: ${e.message}`);
  }
}

/** Ağ gerektiren denetim. Ağ yoksa ENGEL değil UYARI üretir — çevrimdışı
 *  bir makinede gönderim hazırlığını durdurmak doğru olmaz. */
async function denetleAg(ad, fn) {
  try { await fn(); } catch (e) {
    uyari(`${ad} — doğrulanamadı`, `Canlıya ulaşılamadı (${e.message}). Ağ varken tekrar çalıştır.`);
  }
}

// ══════════════════════════════════════════════════════════════════════════
// 1 · SÜRÜM NUMARALARI
// ══════════════════════════════════════════════════════════════════════════
denetle('Sürüm numaraları', () => {
  const gradle = oku('android/app/build.gradle');
  const pbx = oku('ios/App/App.xcodeproj/project.pbxproj');

  const aVarsayilanKod = gradle.match(/oynaVersionCode'\)\s*\?:\s*'(\d+)'/)?.[1];
  const aVarsayilanAd = gradle.match(/oynaVersionName'\)\s*\?:\s*'([^']+)'/)?.[1];
  const iKod = [...pbx.matchAll(/CURRENT_PROJECT_VERSION = (\d+);/g)].map((m) => m[1]);
  const iAd = [...pbx.matchAll(/MARKETING_VERSION = ([\d.]+);/g)].map((m) => m[1]);

  if (!aVarsayilanKod || !aVarsayilanAd) {
    engel('Android sürümü okunamadı', 'android/app/build.gradle içindeki oynaVersionCode/Name kalıbı değişmiş.');
    return;
  }
  if (iKod.length === 0 || iAd.length === 0) {
    engel('iOS sürümü okunamadı', 'project.pbxproj içinde CURRENT_PROJECT_VERSION / MARKETING_VERSION bulunamadı.');
    return;
  }

  // İki platformun GÖRÜNEN sürümü aynı olmalı: farklıysa destek konuşmaları
  // ("hangi sürümdesin?") çözümsüz hâle gelir.
  const iAdBenzersiz = [...new Set(iAd)];
  if (iAdBenzersiz.length > 1) {
    engel('iOS sürüm adı tutarsız', `project.pbxproj içinde farklı MARKETING_VERSION değerleri var: ${iAdBenzersiz.join(', ')}`);
  } else if (iAdBenzersiz[0] !== aVarsayilanAd) {
    engel('Sürüm adları ayrışmış',
      `Android ${aVarsayilanAd}, iOS ${iAdBenzersiz[0]}. İkisi aynı olmalı.`);
  } else {
    tamam(`Sürüm adı iki platformda da ${aVarsayilanAd}`);
  }

  // package.json sürümü de AYNI olmalı: vite onu `VITE_APP_VERSION` olarak
  // gömüyor ve BEŞ kullanıcı ekranı bu rozeti gösteriyor (Ayarlar, Hizmet
  // paneli, Hizmet ayarları, İşletme menüsü, Uygulama kapısı). Ayrışırsa
  // mağazada "1.0.0" yazan uygulama, kendi Ayarlar ekranında "v3.0.0" der —
  // Apple 2.3 "Accurate Metadata" için gereksiz bir soru işareti. Gerçekte
  // ayrışmıştı: package.json 3.0.0, yerel sürümler 1.0.0.
  const pkgAd = JSON.parse(readFileSync(join(KOK, 'package.json'), 'utf8')).version;
  if (pkgAd !== aVarsayilanAd) {
    engel('package.json sürümü yerel sürümle ayrışmış',
      `package.json ${pkgAd}, paket ${aVarsayilanAd}. Uygulama içi sürüm rozeti ` +
      `package.json'dan okunuyor; kullanıcı mağazadakinden farklı bir numara görür.`);
  } else {
    tamam(`Uygulama içi sürüm rozeti de ${pkgAd}`);
  }

  // ── SUNUCUDAKİ EŞİK (bu betik göremez — elle doğrulanmalı) ───────────────
  // 20 Ağustos 2026'da tam olarak bu yüzden uygulama kendi kendini kilitledi:
  // sürüm mağaza listelemesiyle hizalanıp 1.0.0'a çekildi, ama `settings`
  // tablosundaki `minSupportedVersion` eski numaralandırmada (3.0.0) kaldı.
  // `uygulama_kapisi` 1.0.0 < 3.0.0 görüp KAPATILAMAZ "Güncelle" ekranı açtı;
  // uygulama açılır açılmaz kullanılamaz hâle geldi.
  //
  // Bu betik çevrimdışı çalışır, veritabanına bakamaz. Yapabileceği tek doğru
  // şey, gönderim hazırlığının tam ortasında bunu HATIRLATMAK.
  uyari(`Sunucu eşiğini doğrula — paket sürümü ${aVarsayilanAd}`,
    `settings.minSupportedVersion <= ${aVarsayilanAd} olmalı, yoksa uygulama ` +
    `açılışta kendini kilitler. SQL: select public.uygulama_kapisi('${aVarsayilanAd}');`);

  const iKodBenzersiz = [...new Set(iKod)];
  if (iKodBenzersiz.length > 1) {
    engel('iOS derleme numarası tutarsız', `Farklı CURRENT_PROJECT_VERSION değerleri: ${iKodBenzersiz.join(', ')}`);
  }

  // Play aynı versionCode'u iki kez kabul etmez; App Store aynı build number'ı
  // aynı sürüm için kabul etmez. 1 hâlâ duruyorsa büyük ihtimalle unutulmuş.
  if (aVarsayilanKod === '1' && iKodBenzersiz[0] === '1') {
    uyari('Derleme numarası hâlâ 1',
      'Her yüklemede artırılmalı. `npm run surum:artir` ile ikisini birden yükselt.');
  } else {
    tamam(`Derleme numarası — Android ${aVarsayilanKod} · iOS ${iKodBenzersiz[0]}`);
  }
});

// ══════════════════════════════════════════════════════════════════════════
// 2 · UYGULAMA SİMGELERİ
// ══════════════════════════════════════════════════════════════════════════
denetle('Uygulama simgeleri', () => {
  const yogunluklar = ['mdpi', 'hdpi', 'xhdpi', 'xxhdpi', 'xxxhdpi'];
  const eksik = yogunluklar.filter((y) => !varMi(`android/app/src/main/res/mipmap-${y}/ic_launcher.png`));
  if (eksik.length) {
    engel('Android simgesi eksik', `Şu yoğunluklarda ic_launcher.png yok: ${eksik.join(', ')}`);
  } else {
    tamam('Android simgesi tüm yoğunluklarda var');
  }

  if (!varMi('android/app/src/main/res/mipmap-anydpi-v26/ic_launcher.xml')) {
    engel('Uyarlanır simge yok', 'Android 8+ için mipmap-anydpi-v26/ic_launcher.xml gerekli.');
  } else {
    tamam('Uyarlanır (adaptive) simge tanımlı');
  }

  // App Store 1024×1024 saydamsız bir simge ister; alfa kanalı varsa yükleme reddedilir.
  const ios = 'ios/App/App/Assets.xcassets/AppIcon.appiconset';
  if (!varMi(`${ios}/Contents.json`)) {
    engel('iOS simge kataloğu yok', `${ios}/Contents.json bulunamadı.`);
  } else {
    const png = readdirSync(join(KOK, ios)).filter((f) => f.endsWith('.png'));
    if (png.length === 0) {
      engel('iOS simgesi yok', `${ios} içinde hiç PNG yok — yükleme ITMS-90704 ile reddedilir.`);
    } else {
      tamam(`iOS simgesi var (${png.join(', ')})`);
    }
  }
});

// ══════════════════════════════════════════════════════════════════════════
// 3 · iOS GİZLİLİK VE İZİNLER
// ══════════════════════════════════════════════════════════════════════════
denetle('iOS gizlilik ve izinler', () => {
  const plist = oku('ios/App/App/Info.plist');

  // Bu liste 26 Ağustos 2026'da bir ders sonucu genişledi.
  //
  // Kapı eskiden "KODUMUZ neyi çağırıyor" diye soruyordu ve beş anahtar
  // arıyordu. Beşi de yerindeydi, kapı yeşil yandı, Xcode arşivi aldı — ve
  // yükleme Apple'ın doğrulamasında ITMS-90683 ile döndü:
  //
  //   "Missing purpose string … NSLocationAlwaysAndWhenInUseUsageDescription
  //    … If you're using external libraries or SDKs, they may reference APIs
  //    that require a purpose string. While your app might not use these
  //    APIs, a purpose string is still required."
  //
  // Apple'ın sorusu farklıydı: "İKİLİ neyi REFERANS ediyor." Uygulama
  // arka planda konum almıyor (UIBackgroundModes yok, kod yalnız
  // getCurrentPosition çağırıyor) ama @capacitor/geolocation eklentisi
  // always-authorization API'sini referans ettiği için metin şart.
  //
  // Ders: bu listeye giren anahtar "kullanıyor muyuz" ile değil, "paketteki
  // herhangi bir şey referans ediyor mu" ile belirlenir. Eklenti eklendiğinde
  // buraya da bakılmalı — yoksa hata Xcode'da değil, yükleme ekranında çıkar.
  const izinler = [
    ['NSCameraUsageDescription', 'kamera'],
    ['NSLocationWhenInUseUsageDescription', 'konum'],
    // Kullanılmıyor; eklenti referansı yüzünden Apple zorunlu tutuyor.
    ['NSLocationAlwaysAndWhenInUseUsageDescription', 'konum (always — SDK referansı)'],
    ['NSPhotoLibraryUsageDescription', 'fotoğraf okuma'],
    ['NSPhotoLibraryAddUsageDescription', 'fotoğrafa yazma'],
    ['NSContactsUsageDescription', 'rehber'],
  ];
  for (const [anahtar, ad] of izinler) {
    if (!plist.includes(`<key>${anahtar}</key>`)) {
      engel(`${ad} izin açıklaması yok`, `Info.plist içinde ${anahtar} tanımlı değil — izin istenirken uygulama çöker.`);
    }
  }
  if (izinler.every(([a]) => plist.includes(`<key>${a}</key>`))) {
    tamam(`${izinler.length} izin açıklamasının hepsi tanımlı`);
  }

  // Açıklamalar boş olmamalı ve Türkçe olmalı.
  for (const [anahtar, ad] of izinler) {
    const m = plist.match(new RegExp(`<key>${anahtar}</key>\\s*<string>([^<]*)</string>`));
    if (m && m[1].trim().length < 20) {
      engel(`${ad} açıklaması yetersiz`, `"${m[1]}" — inceleme, ne için kullanıldığını anlatan bir cümle bekler.`);
    }
  }

  if (!plist.includes('<key>ITSAppUsesNonExemptEncryption</key>')) {
    uyari('Şifreleme beyanı yok',
      'ITSAppUsesNonExemptEncryption tanımlı değilse her yüklemede ihracat uyum sorusu elle yanıtlanır.');
  } else {
    tamam('İhracat şifreleme beyanı önceden yanıtlı');
  }

  if (!plist.includes('<string>oyna</string>')) {
    engel('Derin bağlantı şeması yok', 'Info.plist içinde `oyna` URL şeması yok — Google/Apple dönüşü uygulamaya ulaşamaz.');
  } else {
    tamam('Derin bağlantı şeması (oyna://) tanımlı');
  }

  // Gizlilik manifestosu — Mayıs 2024'ten beri zorunlu, eksikse ITMS-91053.
  if (!varMi('ios/App/App/PrivacyInfo.xcprivacy')) {
    engel('Gizlilik manifestosu yok', 'ios/App/App/PrivacyInfo.xcprivacy eksik — yükleme ITMS-91053 ile reddedilir.');
  } else {
    const gizlilik = oku('ios/App/App/PrivacyInfo.xcprivacy');
    if (!gizlilik.includes('NSPrivacyAccessedAPITypes')) {
      engel('Gizlilik manifestosu eksik', 'NSPrivacyAccessedAPITypes bölümü yok.');
    } else if (!gizlilik.includes('NSPrivacyTracking')) {
      engel('İzleme beyanı yok', 'PrivacyInfo.xcprivacy içinde NSPrivacyTracking alanı yok.');
    } else {
      tamam('Gizlilik manifestosu eksiksiz');
    }
  }

  // Apple: Google ile giriş sunuluyorsa Apple ile giriş ZORUNLU.
  const yetki = varMi('ios/App/App/App.entitlements') ? oku('ios/App/App/App.entitlements') : '';
  if (!yetki.includes('com.apple.developer.applesignin')) {
    engel('Apple ile giriş yetkisi yok',
      'Uygulama Google ile girişi sunuyor; Apple bunu sunan uygulamalarda Apple ile girişi ZORUNLU tutar (kural 4.8).');
  } else {
    tamam('Apple ile giriş yetkisi tanımlı');
  }
});

// ══════════════════════════════════════════════════════════════════════════
// 4 · ANDROID GÖNDERİM AYARLARI
// ══════════════════════════════════════════════════════════════════════════
denetle('Android gönderim ayarları', () => {
  const degiskenler = oku('android/variables.gradle');
  const hedef = Number(degiskenler.match(/targetSdkVersion\s*=\s*(\d+)/)?.[1] ?? 0);
  // Play, yeni uygulamalar için o yılın hedef sürümünü şart koşar.
  if (hedef < 35) {
    engel('Hedef Android sürümü düşük', `targetSdkVersion ${hedef} — Play en az 35 istiyor.`);
  } else {
    tamam(`Hedef Android sürümü ${hedef}`);
  }

  const manifest = oku('android/app/src/main/AndroidManifest.xml');
  if (!manifest.includes('android.permission.POST_NOTIFICATIONS')) {
    uyari('Bildirim izni yok', 'Android 13+ bildirim göndermek için POST_NOTIFICATIONS ister.');
  }
  if (manifest.includes('android:debuggable="true"')) {
    engel('Hata ayıklama açık', 'AndroidManifest içinde android:debuggable="true" var — yayın paketinde olamaz.');
  }
  if (manifest.includes('android:usesCleartextTraffic="true"')) {
    engel('Şifresiz trafik açık', 'usesCleartextTraffic="true" — Play güvenlik incelemesinde takılır.');
  }
  if (!manifest.includes('android:allowBackup="false"')) {
    uyari('Yedekleme açık', 'allowBackup="false" değil: cihaz yedeğine oturum verisi kopyalanabilir.');
  }

  const gradle = oku('android/app/build.gradle');
  if (!gradle.includes('signingConfigs')) {
    engel('İmza yapılandırması yok', 'android/app/build.gradle içinde signingConfigs tanımlı değil.');
  } else {
    tamam('İmza yapılandırması tanımlı (anahtar dosyası sende)');
  }
});

// ══════════════════════════════════════════════════════════════════════════
// 5 · YASAL SAYFALAR
// ══════════════════════════════════════════════════════════════════════════
denetle('Yasal sayfalar', () => {
  // Play, hesap silme için UYGULAMA İÇİ yol ve AYRICA bir WEB ADRESİ ister.
  const gerekli = [
    ['public/gizlilik.html', 'Gizlilik politikası — iki mağaza da adresini ister'],
    ['public/hesap-silme.html', 'Hesap silme sayfası — Play Store bunun web adresini ister'],
    ['public/kullanim-sartlari.html', 'Kullanım şartları'],
    ['public/mesafeli-satis.html', 'Mesafeli satış — para alan uygulamada zorunlu'],
    ['public/kvkk-aydinlatma.html', 'KVKK aydınlatma'],
  ];
  for (const [yol, ne] of gerekli) {
    if (!varMi(yol)) engel(`${ne} yok`, `${yol} bulunamadı.`);
  }
  if (gerekli.every(([y]) => varMi(y))) tamam('Beş yasal sayfa da yayında');

  // ÜRETİLEN sayfalar kendi markdown kaynağından tazedir mi?
  //
  // DİKKAT: `gizlilik.html`, `hesap-silme.html` ve `cerez-politikasi.html` ELLE
  // tutulur — üreticiden çıkmazlar. Onları `legalDocs.ts` ile karşılaştırmak
  // her yasal düzenlemeden sonra sahte alarm üretir. Bu yüzden her sayfa
  // YALNIZ kendi kaynağıyla kıyaslanır.
  const uretilenler = [
    ['sozlesmeler/oyuncu/01-kullanim-sartlari.md', 'public/kullanim-sartlari.html'],
    ['sozlesmeler/oyuncu/03-kvkk-aydinlatma-metni.md', 'public/kvkk-aydinlatma.html'],
    ['sozlesmeler/oyuncu/04-kvkk-acik-riza-metni.md', 'public/kvkk-acik-riza.html'],
    ['sozlesmeler/oyuncu/05-mesafeli-satis-iptal-iade.md', 'public/mesafeli-satis.html'],
    ['sozlesmeler/oyuncu/08-veli-muvafakatnamesi.md', 'public/veli-muvafakatnamesi.html'],
    ['sozlesmeler/oyuncu/09-topluluk-kurallari.md', 'public/topluluk-kurallari.html'],
  ];
  // TAZELİK ÖLÇÜSÜ ZAMAN DEĞİL İÇERİKTİR (23 Ağustos 2026, gönderim gecesi).
  //
  // Burada eskiden `md.mtime > html.mtime` vardı. Git ZAMAN DAMGASI KORUMAZ:
  // taze bir klonda ya da `git pull` sonrasında dosyalar rastgele sırayla
  // yazılır; md html'den sonra yazıldığı anda denetim "bayat" diye bağırıp
  // GÖNDERİMİ DURDURUYORDU. Kurucunun Mac'inde tam olarak bu oldu — oysa altı
  // sayfa da baytı baytına güncel, yeniden üretim tek bir baytı bile
  // değiştirmiyordu. Sahte alarmın bedeli, gerçek alarmın inandırıcılığıdır:
  // her klonda öten bir alarm bir süre sonra hiç dinlenmez.
  //
  // Artık üretici her sayfaya kaynağının sha256 özetini damgalıyor
  // (`<meta name="oyna-kaynak-ozeti">`), biz de kaynağı yeniden özetleyip
  // karşılaştırıyoruz. Klonlama, kopyalama, `touch`, saat farkı — hiçbiri
  // bunu bozamaz; yalnız METİN değişirse bayatlar.
  const ozetle = (metin) => createHash('sha256').update(metin, 'utf8').digest('hex').slice(0, 16);
  const bayat = [];
  const damgasiz = [];
  for (const [md, html] of uretilenler) {
    if (!varMi(md) || !varMi(html)) continue;
    const damga = (oku(html).match(/name="oyna-kaynak-ozeti"\s+content="([0-9a-f]{16})"/) || [])[1];
    if (!damga) { damgasiz.push(html); continue; }
    if (damga !== ozetle(oku(md))) bayat.push(html);
  }
  if (bayat.length) {
    engel('Yasal sayfalar bayat',
      `Kaynak metni değişmiş ama sayfa yeniden üretilmemiş: ${bayat.join(', ')}. ` +
      '`node scripts/build-legal-pages.mjs` ile üret.');
  } else if (damgasiz.length) {
    engel('Yasal sayfalarda kaynak damgası yok',
      `Şu sayfalar damgasız üretilmiş: ${damgasiz.join(', ')}. ` +
      '`node scripts/build-legal-pages.mjs` ile bir kez yeniden üret.');
  } else {
    tamam('Üretilen yasal sayfalar kaynaklarıyla güncel (içerik özeti)');
  }

  // Elle tutulan sayfalar boş kalmasın — mağaza adresini açıp bakıyor.
  for (const el of ['public/gizlilik.html', 'public/hesap-silme.html']) {
    if (varMi(el) && oku(el).length < 800) {
      engel(`${el} neredeyse boş`, 'Mağaza bu adresi açıp içeriğe bakıyor; taslak sayfa reddedilir.');
    }
  }
});

// ══════════════════════════════════════════════════════════════════════════
// 6 · PAKETE SIZMAMASI GEREKENLER
// ══════════════════════════════════════════════════════════════════════════
denetle('Pakete sızmaması gerekenler', () => {
  // Demo hesap kataloğu ORTAK ŞİFRE taşıyor ve içinde gerçek saha sahibi
  // hesapları var. Üretim paketine girerse paketi açan herkes o hesaplara girer.
  if (varMi('.env')) {
    const env = oku('.env');
    if (/^\s*VITE_DEMO_ACCOUNTS\s*=/m.test(env)) {
      engel('Demo hesap kataloğu açık',
        '.env içinde VITE_DEMO_ACCOUNTS tanımlı — demo giriş yolları 23 Ağu 2026\'da koddan SİLİNDİ; ölü bayrağı kaldır.');
    } else {
      tamam('Demo hesap kataloğu pakete girmiyor');
    }
    if (/^\s*VITE_DEV_MODE\s*=\s*true/m.test(env)) {
      uyari('Geliştirici modu açık', '.env içinde VITE_DEV_MODE=true — yayın derlemesinden önce kapat.');
    }
  } else {
    tamam('.env yok — gömülü üretim ayarları kullanılacak');
  }

  // Derlenmiş paket varsa içinde ortak şifre aranır: kill-switch unutulsa bile
  // yakalanır.
  //
  // İSTİSNA YOK (22 Ağu 2026 — Apple 5.6): eskiden `build:inceleme` diye bir
  // inceleme paketi vardı ve demo kimlikleri onda BİLEREK bulunduğu için
  // denetim bunu uyarıya indiriyordu. O paket söküldü; artık tek paket var.
  // Demo kimliği ya da demo seçici düğmesi derlenmiş pakette görünürse bu
  // ENGELDİR — mağazaya giden paket kullanıcının indirdiğiyle aynı olmalı.
  const dist = join(KOK, 'dist/assets');
  if (existsSync(dist)) {
    const js = readdirSync(dist).filter((f) => f.endsWith('.js'));
    const sizinti = js.filter((f) => {
      const g = readFileSync(join(dist, f), 'utf8');
      return g.includes('password123')
        || /oyuncu\d\d@oyna\.app/.test(g)
        || g.includes('DEMO HESABIYLA GİR')
        // Kullanıcıya GÖRÜNEN geliştirici metinleri de sızıntıdır. 22 Ağu
        // denetiminde "DEMO MODU" ipucu gözden kaçmıştı: aranan desenler
        // yalnız kimlik bilgileriydi, ekrana basılan yazılar değil.
        // Desen DAR tutulur: tesis panelindeki "DEMO MODU — Finans verileri
        // demo tesise ait" uyarısı MEŞRU bir ürün özelliğidir (sahibe demo
        // veriye baktığını söyler) ve yakalanmamalı. Aranan, giriş ekranındaki
        // geliştirici ipucudur. ('mirackerem' gibi ölü koddaki kısayol adları
        //  da aranmaz — ekrana çıkmazlar, her derlemede sahte alarm olurdu.)
        || g.includes('DEMO MODU: numara yerine');
    });
    if (sizinti.length) {
      engel('Demo kimlikleri pakette',
        `Derlenmiş dosyalarda demo e-posta/şifre/seçici bulundu: ${sizinti.slice(0, 3).join(', ')}`);
    } else {
      tamam('Derlenmiş pakette demo kimliği yok');
    }
  } else {
    uyari('Paket derlenmemiş', 'Bu denetimden önce `npm run build` çalıştırılırsa paket içi sızıntı da denetlenir.');
  }
});

// ══════════════════════════════════════════════════════════════════════════
// 7 · UYGULAMA İÇİ HESAP SİLME (iki mağazanın da şartı)
// ══════════════════════════════════════════════════════════════════════════
denetle('Uygulama içi hesap silme', () => {
  if (!varMi('components/common/DeleteAccountModal.tsx')) {
    engel('Hesap silme ekranı yok',
      'Apple 5.1.1(v) ve Play, hesap açtıran uygulamada UYGULAMA İÇİ silme yolu şart koşar.');
    return;
  }
  const s = oku('components/common/DeleteAccountModal.tsx');
  if (!s.includes('request_account_deletion')) {
    engel('Hesap silme sunucuya bağlı değil', 'DeleteAccountModal içinde request_account_deletion çağrısı yok.');
  } else {
    tamam('Uygulama içi hesap silme çalışıyor');
  }
});

// ══════════════════════════════════════════════════════════════════════════
// RAPOR
// ══════════════════════════════════════════════════════════════════════════
const yesil = (t) => `\x1b[32m${t}\x1b[0m`;
const kirmizi = (t) => `\x1b[31m${t}\x1b[0m`;
const sari = (t) => `\x1b[33m${t}\x1b[0m`;
const soluk = (t) => `\x1b[90m${t}\x1b[0m`;


// ══════════════════════════════════════════════════════════════════════════
// 8 · İNCELEME NOTU CANLI ÖDEME AYARIYLA UYUŞUYOR MU
//
// 24 Ağustos 2026'da tam olarak bu ayrıştı: demo ödeme açıldı ama
// APP_REVIEW_NOTLARI.md bir gün boyunca "kart bilgisi hiç istenmiyor, ödeme
// yolu yok" demeye devam etti. Apple'a giden metin canlı sistemin tersini
// söylüyordu — üstelik uygulama bir kez zaten Guideline 5.6 (dürüstlük) ile
// reddedilmişti.
//
// Bu denetim o ayrışmayı mekanik olarak yakalar: canlı `resolve_payment_mode`
// yanıtını okur ve inceleme notunun ödeme bölümüyle karşılaştırır.
// ══════════════════════════════════════════════════════════════════════════
await denetleAg('İnceleme notu canlı ödeme ayarıyla uyuşuyor', async () => {
  const url  = process.env.VITE_SUPABASE_URL || 'https://iikvzgyccvgcybzdfwlv.supabase.co';
  const anon = process.env.VITE_SUPABASE_ANON_KEY || GOMULU_ANON;

  const yanit = await fetch(`${url}/rest/v1/rpc/resolve_payment_mode`, {
    method: 'POST',
    headers: { apikey: anon, 'Content-Type': 'application/json' },
    body: JSON.stringify({ p_pitch_id: null }),
  });
  if (!yanit.ok) throw new Error(`HTTP ${yanit.status}`);
  const mod = await yanit.json();

  const not = oku('docs/master/APP_REVIEW_NOTLARI.md');
  
  if (not.includes('direct bank transfer (IBAN)')) {
    engel('İnceleme notunda eski IBAN ifadesi kalmış',
      'Uygulama kartla ödeme alırken notta IBAN yazması Apple 5.6 (Bait-and-Switch) riskidir.');
    return;
  }

  if (!not.includes('3.1.3(e)')) {
    engel('İnceleme notunda Guideline 3.1.3(e) beyanı eksik',
      'Fiziksel halı saha rezervasyonunun IAP muafiyeti 3.1.3(e) ile gerekçelendirilmelidir.');
    return;
  }

  if (!not.includes('iyzico') && !not.includes('credit card')) {
    engel('İnceleme notunda kart/sağlayıcı beyanı eksik',
      'Ödeme altyapısı kart ile çalışırken notun bunu gizlemesi 5.6 riskidir.');
    return;
  }

  tamam(`İnceleme notu fiziksel hizmet (3.1.3(e)) ve lisanslı kart ödeme altyapısıyla uyumlu`);
});



// ══════════════════════════════════════════════════════════════════════════
// 9 · İKİLİYE SIZAN ÜÇÜNCÜ TARAF SDK'LARI
//
// @capgo/capacitor-social-login podspec'i varsayılan olarak DÖRT sağlayıcının
// bağımlılığını da ekler. OYNA yalnız Google ve Apple sunuyor, ama Facebook
// SDK'sı (FBSDKCoreKit + FBSDKLoginKit) iOS ikilisine giriyordu.
//
// Apple yüklemede paketteki tüm gizlilik manifestolarını birleştirip Gizlilik
// Raporu üretir: bizim manifestomuz "izleme yok" derken Facebook SDK'sı kendi
// manifestosunda izleme beyan ediyor — uygulama kendi beyanını yalanlıyor
// (Guideline 5.1.1(i)).
//
// Çözüm capacitor.config.ts'teki SocialLogin.providers ayarı; bu denetim onun
// GERÇEKTEN uygulanıp uygulanmadığını Podfile.lock'tan okur. Ayarı yazıp
// `cap sync` + `pod install` çalıştırmayı unutmak, ayarı hiç yazmamakla aynı.
// ══════════════════════════════════════════════════════════════════════════
denetle('Kullanılmayan SDK ikiliye sızmıyor', () => {
  const cfg = oku('capacitor.config.ts');
  if (!/facebook:\s*'compileOnly'/.test(cfg)) {
    engel('Facebook sağlayıcısı kapatılmamış',
      "capacitor.config.ts → plugins.SocialLogin.providers.facebook 'compileOnly' olmalı. " +
      'Aksi hâlde FBSDK iOS paketine girer ve gizlilik manifestosuyla çelişir.');
    return;
  }

  const kilitYolu = join(KOK, 'ios/App/Podfile.lock');
  if (!existsSync(kilitYolu)) {
    uyari('Podfile.lock yok — SDK sızıntısı doğrulanamadı',
      'Mac üzerinde `npm run sync:ios` ve `pod install` çalıştırdıktan sonra tekrar denetle.');
    return;
  }
  const kilit = readFileSync(kilitYolu, 'utf8');
  const sizanlar = ['FBSDKCoreKit', 'FBSDKLoginKit', 'FBAEMKit']
    .filter((ad) => new RegExp(`^\\s*[-]?\\s*${ad}\\b`, 'm').test(kilit));

  if (sizanlar.length) {
    engel('Facebook SDK hâlâ iOS paketinde',
      `Podfile.lock içinde ${sizanlar.join(', ')} duruyor. Uygulama Facebook girişi ` +
      'SUNMUYOR; bu SDK yalnız gizlilik raporunda çelişki üretir (5.1.1(i)). ' +
      'Mac üzerinde `npm run sync:ios` ve ardından `cd ios/App && pod install` çalıştır.');
  } else {
    tamam('Kullanılmayan sosyal SDK yok (Facebook paketten çıkarıldı)');
  }
});


// ══════════════════════════════════════════════════════════════════════════
// 10 · YÖNETİCİ PANELİ MAĞAZA PAKETİNE GİRMESİN
//
// `npm run build` (mobil bayrağı OLMADAN) yönetici panelini dist'e koyar —
// admin.html + assets/admin-*.js. Bu doğru davranıştır: panel web'de yayınlanır.
//
// TEHLİKE, `npx cap sync ios` komutunun dist'in TAMAMINI native projeye
// kopyalamasıdır. `npm run sync:ios` önce build:mobile çalıştırıp paneli
// dışlar; ama düz `cap sync` çalıştıran biri, arayüzden erişilemeyen AMA
// dosya olarak pakette duran tam bir yönetim konsolunu kullanıcının
// telefonuna gönderir — içinde ödeme modu anahtarını çeviren ekranlarla.
//
// Uygulama zaten bir kez Guideline 5.6 ile "incelemede gizlenmiş özellik"
// gerekçesiyle reddedildi. Bu, o tartışmayı yeniden açacak tek dosyadır.
// ══════════════════════════════════════════════════════════════════════════
denetle('Yönetici paneli mağaza paketinde değil', () => {
  const yerler = [
    ['ios/App/App/public',                    'iOS'],
    ['android/app/src/main/assets/public',    'Android'],
  ];
  let bakilan = 0;

  for (const [yol, platform] of yerler) {
    const tam = join(KOK, yol);
    if (!existsSync(tam)) continue;
    bakilan++;

    const izler = [];
    if (existsSync(join(tam, 'admin-panel'))) izler.push('admin-panel/');
    if (existsSync(join(tam, 'admin.html')))  izler.push('admin.html');
    const varliklar = join(tam, 'assets');
    if (existsSync(varliklar)) {
      const admin = readdirSync(varliklar).filter((f) => /^admin-.*\.js$/.test(f));
      if (admin.length) izler.push(...admin);
    }

    if (izler.length) {
      engel(`${platform} paketinde yönetici paneli var`,
        `${yol} içinde: ${izler.join(', ')} — düz \`npx cap sync\` ile kopyalanmış. ` +
        `Sil ve \`npm run sync:${platform === 'iOS' ? 'ios' : 'android'}\` ile yeniden üret ` +
        `(build:mobile paneli dışlar).`);
      return;
    }
  }

  if (bakilan === 0) {
    uyari('Native paket henüz üretilmemiş',
      'Gönderim öncesi `npm run sync:ios` çalıştır; bu denetim o zaman anlamlı olur.');
  } else {
    tamam('Yönetici paneli native pakete girmemiş');
  }
});

// ══════════════════════════════════════════════════════════════════════════
// 11 · VİTRİN GÖRSELLERİ — AYNI FOTOĞRAF İKİ FARKLI SAHADA OLAMAZ
//
// 25 Ağustos 2026'da App Store ekran görüntüsü çekilirken vitrindeki
// fotoğraflara ilk kez tek tek BAKILDI. Çıkan tablo:
//
//   · İki sahanın vitrin fotoğrafı FIFA Dünya Kupası kupasının renderıydı —
//     kaidesinde "FIFA WORLD CUP" yazısı okunuyordu. Tescilli marka
//     (Apple 5.2) ve "Saha Kirala" listesinin İLK kartıydı.
//   · Bir kortun iki fotoğrafı, tanınabilir kişilerin ve ÇOCUKLARIN özel
//     fotoğraflarıydı. KVKK açısından ihlal, Apple 5.1.1 açısından ret.
//   · Bir sahanın ve üç profilin fotoğrafı uygulamanın kendi logosuydu.
//
// Hiçbiri kodda değildi; hepsi CANLI VERİDEYDİ. Yeşil geçen 20 denetimin
// hiçbiri buna bakmıyordu, çünkü hepsi dosyalara bakıyordu.
//
// ─── BU KAPI NEYİ YAKALAR ───────────────────────────────────────────────────
// Kupa fotoğrafı depoya ÜÇ AYRI ADLA kopyalanmıştı. URL'leri farklı,
// içerikleri aynı. Bu yüzden kapı adrese değil İÇERİĞE bakar: her görseli
// indirir, sha256'sını alır ve aynı içeriğin iki FARKLI sahada görünmesini
// engel sayar. Aynı fotoğrafın iki tesise birden ait olması gerçekte
// mümkün değildir; olduysa örnek veri kopyalanmış demektir.
//
// ─── BU KAPI NEYİ YAKALAYAMAZ (dürüst sınır) ────────────────────────────────
// Bir fotoğrafın kupa mı, çocuk mu, halı saha mı olduğunu makine bilemez.
// Tek kullanılan bir özel fotoğraf bu kapıdan sessizce geçer. O yüzden
// gönderim öncesi `npm run vitrin:gorseller` çalıştırılır: canlıdaki bütün
// vitrin görsellerini tek sayfada yan yana basar. Bakmak on saniye sürer;
// bakılmadığı için buraya bir kupa fotoğrafı bir ay boyunca asılı kaldı.
//
// Avatarlar RLS arkasında olduğu için anonim okunamaz; bu kapı sahaları,
// kortları ve maçları kapsar — özel fotoğrafların bulunduğu yer de tam
// olarak kortlardı.
// ══════════════════════════════════════════════════════════════════════════
await denetleAg('Vitrin görselleri: aynı fotoğraf iki sahada değil', async () => {
  const url  = process.env.VITE_SUPABASE_URL || 'https://iikvzgyccvgcybzdfwlv.supabase.co';
  const anon = process.env.VITE_SUPABASE_ANON_KEY || GOMULU_ANON;
  const bizimDepo = `${url}/storage/v1/object/public/`;

  const cek = async (yol) => {
    const y = await fetch(`${url}/rest/v1/${yol}`, { headers: { apikey: anon } });
    if (!y.ok) throw new Error(`${yol} → HTTP ${y.status}`);
    return y.json();
  };

  const [sahalar, kortlar, maclar] = await Promise.all([
    cek('pitches?select=id,name,image,images'),
    cek('courts?select=id,name,images,pitch_id'),
    cek('public_matches?select=id,image,pitch_id'),
  ]);

  const sahaAdi = new Map(sahalar.map((s) => [s.id, s.name]));

  // Her görsel, AİT OLDUĞU SAHA ile eşleştirilir. Maçın görseli sahasından
  // türetildiği için maç–saha eşleşmesi meşrudur; yakalanması gereken,
  // aynı içeriğin İKİ AYRI sahada görünmesidir.
  //
  // TESİS GÖRSELİ ile MAÇ GÖRSELİ arasındaki fark, aşağıdaki kuralların
  // dayandığı ayrımdır ve deneyerek öğrenildi:
  //
  //   · Saha ve kort fotoğrafı bir TESİS KİMLİK İDDİASIDIR. "Bu, o tesisin
  //     fotoğrafıdır." Aynı fotoğrafın iki tesise ait olması mümkün değildir.
  //   · Maç görseli ise bir OLAY görselidir. Varsayılanı sahadan türetilir
  //     (bu yüzden aynı sahanın onlarca maçında aynı fotoğraf görünür ve bu
  //     doğrudur); elle verilenler de genel futbol görselleridir.
  //
  // Kural ilk yazıldığında maçlar da kapsanmıştı ve kapı, sahadan türetilmiş
  // görselleri "çakışma" sanıp üç yanlış engel üretti. Maçlar kopya
  // kurallarının DIŞINDA; erişilebilirlik denetimine ise dahil.
  const gorseller = [];      // tesis kimliği: saha + kort
  const macGorselleri = [];  // yalnız erişilebilirlik için
  const ekle = (adres, sahaId, nerede) => {
    if (typeof adres === 'string' && adres.trim()) gorseller.push({ adres: adres.trim(), sahaId, nerede });
  };

  for (const s of sahalar) {
    ekle(s.image, s.id, `saha "${s.name}"`);
    for (const g of Array.isArray(s.images) ? s.images : []) ekle(g, s.id, `saha "${s.name}"`);
  }
  for (const k of kortlar) {
    for (const g of Array.isArray(k.images) ? k.images : []) {
      ekle(g, k.pitch_id, `kort "${k.name}" (${sahaAdi.get(k.pitch_id) ?? 'saha?'})`);
    }
  }
  for (const m of maclar) {
    if (typeof m.image === 'string' && m.image.trim()) macGorselleri.push(m.image.trim());
  }

  if (gorseller.length === 0 && macGorselleri.length === 0) {
    tamam('Vitrin görselleri: canlıda hiç saha/kort fotoğrafı yok');
    return;
  }

  // ── Kural 0: AYNI ADRES iki farklı sahada → ENGEL ──────────────────────
  //
  // Bu kural ağ gerektirmez ve bu yüzden en güvenilir olanıdır. İçerik
  // karşılaştırması (Kural 1) görsel indirilemezse sessizce devre dışı
  // kalır; adres karşılaştırması her koşulda çalışır. Nitekim canlıda tam
  // olarak böyle bir çift vardı: "Ruzgar Arena" ile "Yildiz Vadi Hali Saha"
  // galerilerinde aynı stok fotoğrafın aynı adresini paylaşıyordu.
  const adresSahalari = new Map();   // adres → Map(sahaId → nerede)
  for (const g of gorseller) {
    if (!adresSahalari.has(g.adres)) adresSahalari.set(g.adres, new Map());
    adresSahalari.get(g.adres).set(g.sahaId, g.nerede);
  }
  const adresCakisan = [...adresSahalari.entries()].filter(([, m]) => m.size > 1);
  if (adresCakisan.length) {
    engel(`${adresCakisan.length} fotoğraf adresi birden fazla sahada kullanılmış`,
      `Birebir aynı adres farklı tesislerde geçiyor — örnek veri kopyalanmış demektir.\n` +
      adresCakisan.map(([, m]) => `      · ${[...m.values()].join('  ⟷  ')}`).join('\n') + '\n' +
      `      \`npm run vitrin:gorseller\` ile bak, birinden kaldır.`);
    return;
  }

  // Benzersiz adresleri indir; içerik parmak izini çıkar.
  const benzersiz = [...new Set([...gorseller.map((g) => g.adres), ...macGorselleri])];
  const parmak = new Map();     // adres → sha256 | null
  const kirik  = [];            // { adres, sebep, bizim }

  await Promise.all(benzersiz.map(async (adres) => {
    const bizim = adres.startsWith(bizimDepo);
    try {
      const y = await fetch(adres);
      if (!y.ok) { kirik.push({ adres, sebep: `HTTP ${y.status}`, bizim }); return; }
      const bayt = Buffer.from(await y.arrayBuffer());
      parmak.set(adres, createHash('sha256').update(bayt).digest('hex'));
    } catch (e) {
      kirik.push({ adres, sebep: e.message, bizim });
    }
  }));

  // ── Kural 1: aynı içerik, iki farklı saha → ENGEL ──────────────────────
  const icerikSahalari = new Map();   // sha → Map(sahaId → nerede)
  for (const g of gorseller) {
    const sha = parmak.get(g.adres);
    if (!sha) continue;
    if (!icerikSahalari.has(sha)) icerikSahalari.set(sha, new Map());
    icerikSahalari.get(sha).set(g.sahaId, g.nerede);
  }

  const cakisan = [...icerikSahalari.values()].filter((m) => m.size > 1);
  if (cakisan.length) {
    const dokum = cakisan
      .map((m) => `      · ${[...m.values()].join('  ⟷  ')}`)
      .join('\n');
    engel(`${cakisan.length} fotoğraf birden fazla sahaya ait görünüyor`,
      `Aynı görsel içeriği farklı tesislerde kullanılmış. Gerçek bir tesis ` +
      `fotoğrafı iki tesise birden ait olamaz; bu, örnek verinin kopyalandığını ` +
      `gösterir. 25 Ağustos'ta tam olarak böyle bir kopya — bir FIFA Dünya Kupası ` +
      `renderı — iki sahanın vitrin fotoğrafıydı.\n${dokum}\n` +
      `      \`npm run vitrin:gorseller\` ile hepsine bak, sonra ilgilisini temizle.`);
    return;
  }

  // ── Kural 2: KENDİ deponuzdaki bir görsel açılmıyorsa → ENGEL ──────────
  const bizimKirik = kirik.filter((k) => k.bizim);
  if (bizimKirik.length) {
    engel(`${bizimKirik.length} vitrin görseli kendi depomuzda açılmıyor`,
      `İncelemeci bu kartları kırık görselle görür (Apple 2.1).\n` +
      bizimKirik.map((k) => `      · ${k.sebep} — ${k.adres.slice(bizimDepo.length)}`).join('\n'));
    return;
  }

  // ── Kural 3: üçüncü taraf barındırıcı → UYARI ──────────────────────────
  // Engel değil: bu makinenin ağ politikası da 403 döndürebilir, ki bu
  // denetimi yazarken tam olarak öyle oldu. Karar kurucunun.
  const disAdres = benzersiz.filter((a) => !a.startsWith(bizimDepo));
  const disHost = [...new Set(disAdres.map((a) => {
    try { return new URL(a).host; } catch { return a; } }))];
  if (disAdres.length) {
    const disKirik = kirik.filter((k) => !k.bizim).length;
    uyari(`${disAdres.length} vitrin görseli üçüncü taraf sunucuda (${disHost.join(', ')})`,
      `Bu adresler bizim denetimimizde değil; sağlayıcı erişimi kesse veya ` +
      `fotoğrafı kaldırsa incelemeci kırık kart görür.` +
      (disKirik ? ` Şu an ${disKirik} tanesine bu makineden ulaşılamadı — ağ ` +
        `politikası da olabilir, gerçek arıza da; gönderim öncesi bir telefondan doğrula.` : ''));
  }

  // ── Kaç görsel GERÇEKTEN karşılaştırıldı? ──────────────────────────────
  //
  // Parmak izi çıkarılamayan görsel karşılaştırmaya hiç girmez. Hepsi
  // indirilemediyse "çakışma yok" demek doğru ama ANLAMSIZDIR: kapı hiçbir
  // şeye bakmamıştır. Bu betiği yazarken tam olarak öyle oldu — vitrindeki
  // dokuz görselin dokuzu da bu makineden erişilemeyen bir CDN'deydi ve kapı
  // yeşil yandı. Sayıyı söylemek, o yanlış yeşili imkânsız kılar.
  const dogrulanan = parmak.size;
  if (dogrulanan === 0) {
    uyari('Vitrin görselleri karşılaştırılamadı',
      `Canlıda ${benzersiz.length} vitrin görseli var ama hiçbiri bu makineden ` +
      `indirilemedi, dolayısıyla içerik karşılaştırması YAPILMADI. Bu kapı şu an ` +
      `hiçbir şey garanti etmiyor. Ağa erişebilen bir makinede tekrar çalıştır.`);
    return;
  }
  tamam(`Vitrin görselleri: ${dogrulanan}/${benzersiz.length} görsel karşılaştırıldı, çakışan içerik yok`);
});

console.log('\n  MAĞAZA GÖNDERİM DENETİMİ\n');

for (const t of tamamlar) console.log(`  ${yesil('✓')} ${soluk(t)}`);

if (uyarilar.length) {
  console.log('');
  for (const u of uyarilar) {
    console.log(`  ${sari('!')} ${u.baslik}`);
    console.log(`    ${soluk(u.aciklama)}`);
  }
}

if (engeller.length) {
  console.log('');
  for (const e of engeller) {
    console.log(`  ${kirmizi('✗')} ${kirmizi(e.baslik)}`);
    console.log(`    ${e.aciklama}`);
  }
}

console.log('');
if (engeller.length === 0) {
  console.log(`  ${yesil('Kod tarafı gönderime hazır.')} ${soluk(`${tamamlar.length} denetim geçti, ${uyarilar.length} uyarı.`)}`);
  console.log(soluk('  Kalan işler mağaza panellerinde: ekran görüntüleri, açıklama, veri güvenliği formu, yaş sınırı.\n'));
} else {
  console.log(`  ${kirmizi(`${engeller.length} engel var — gönderim öncesi çözülmeli.`)}\n`);
}

process.exit(engeller.length > 0 ? 1 : 0);
