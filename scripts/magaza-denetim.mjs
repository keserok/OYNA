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
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const KOK = join(dirname(fileURLToPath(import.meta.url)), '..');
const oku = (p) => readFileSync(join(KOK, p), 'utf8');
const varMi = (p) => existsSync(join(KOK, p));

/** Bulgular: engel gönderimi durdurur, uyarı durdurmaz ama bakılmalı. */
const engeller = [];
const uyarilar = [];
const tamamlar = [];

const engel = (baslik, aciklama) => engeller.push({ baslik, aciklama });
const uyari = (baslik, aciklama) => uyarilar.push({ baslik, aciklama });
const tamam = (baslik) => tamamlar.push(baslik);

/** Bir denetimi çalıştırır; içeride patlarsa denetim ENGEL sayılır. */
function denetle(ad, fn) {
  try { fn(); } catch (e) {
    engel(ad, `Denetim çalıştırılamadı: ${e.message}`);
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

  // Her izin açıklaması, o izni GERÇEKTEN kullanan koda karşılık gelmeli.
  // Eksikse uygulama izin isterken ÇÖKER; fazlaysa inceleme "niye istiyorsun?"
  // diye sorar.
  const izinler = [
    ['NSCameraUsageDescription', 'kamera'],
    ['NSLocationWhenInUseUsageDescription', 'konum'],
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
    tamam('Beş izin açıklaması da tanımlı');
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
  const bayat = uretilenler
    .filter(([md, html]) => varMi(md) && varMi(html)
      && statSync(join(KOK, md)).mtimeMs > statSync(join(KOK, html)).mtimeMs)
    .map(([, html]) => html);
  if (bayat.length) {
    engel('Yasal sayfalar bayat',
      `Kaynak metni değişmiş ama sayfa yeniden üretilmemiş: ${bayat.join(', ')}. ` +
      '`node scripts/build-legal-pages.mjs` ile üret.');
  } else {
    tamam('Üretilen yasal sayfalar kaynaklarıyla güncel');
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
    if (/^\s*VITE_DEMO_ACCOUNTS\s*=\s*true/m.test(env)) {
      engel('Demo hesap kataloğu açık',
        '.env içinde VITE_DEMO_ACCOUNTS=true — katalog ve ortak şifre mağaza paketine girer.');
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
  // İNCELEME PAKETİ İSTİSNASI (21 Ağu 2026): `npm run build:inceleme` ile
  // derlenen pakette demo seçici ve ortak şifre BİLEREK bulunur — mağaza
  // incelemecisinin Türk numarası yok, telefon kodu ona ulaşmıyor (aynı
  // istisna derleme bekçisinde de var: vite.config.ts · mobilPaketBekcisi).
  // Denetim bunu "engel" saymaz ama YÜKSEK SESLE söyler: bu paket yalnız
  // incelemeye gider, genel yayına bayraksız yeniden derlenir. Ayrım şart:
  // aksi hâlde her inceleme derlemesinde çıkan kırmızı satır alışkanlık olur
  // ve GERÇEK bir sızıntı aynı satırın içinde gözden kaçar.
  const dist = join(KOK, 'dist/assets');
  if (existsSync(dist)) {
    const js = readdirSync(dist).filter((f) => f.endsWith('.js'));
    let incelemePaketi = false;
    const sizinti = js.filter((f) => {
      const g = readFileSync(join(dist, f), 'utf8');
      if (g.includes('DEMO HESABIYLA GİR')) incelemePaketi = true;
      return g.includes('password123') || /oyuncu\d\d@oyna\.app/.test(g);
    });
    if (sizinti.length && incelemePaketi) {
      uyari('İnceleme paketi derlenmiş — demo kimlikleri BİLEREK içeride',
        'Bu paket YALNIZ mağaza incelemesi içindir. Genel yayına çıkarken '
        + '`npm run build` (bayraksız) ile yeniden derlenmeli.');
    } else if (sizinti.length) {
      engel('Demo kimlikleri pakette',
        `Derlenmiş dosyalarda demo e-posta/şifre bulundu: ${sizinti.slice(0, 3).join(', ')}`);
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
