/**
 * iOS MAĞAZA BEYANLARI — GERÇEK DAVRANIŞLA BİREBİR (17 Ağustos 2026 denetimi)
 *
 * NEDEN BU DOSYA VAR: `Info.plist` ve `PrivacyInfo.xcprivacy` iki yönde de
 * bozulabilir ve İKİ BOZULMANIN SONUCU FARKLIDIR:
 *
 *   • FAZLA beyan  → Apple "bunu neden istiyorsunuz?" diye sorar, gizlilik
 *     formuyla çelişki çıkar, inceleme uzar. Can sıkıcı ama kurtarılabilir.
 *   • EKSİK beyan  → izin istendiği anda iOS uygulamayı ANINDA ÖLDÜRÜR.
 *     Kullanıcı biletini kaydetmek isterken uygulama çöker. Kurtarılamaz.
 *
 * Bu yüzden testler tek yönlü değil ÇİFT yönlü: hem gereksiz anahtarın
 * girmediğini, hem gerekli anahtarın silinmediğini kilitler. Her "gerekli"
 * iddiasının kaynak koddaki KANITI da burada kontrol edilir — kanıt kaybolursa
 * (ör. paylaşımdan görsel çıkarsa) test bunu söyler, körü körüne beklemez.
 *
 * Ayrıca gizlilik dosyasının GEÇERLİ bir plist olarak kaldığını doğrular:
 * bozuk plist, Xcode derlemesini değil MAĞAZA YÜKLEMESİNİ düşürür (ITMS-91053)
 * ve hata mesajı sebebi söylemez.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const oku = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');

// ════════════════════════════════════════════════════════════════════════════
// KÜÇÜK PLIST ÇÖZÜCÜ
// ════════════════════════════════════════════════════════════════════════════
//
// Neden düz metin araması (`toContain`) YETMEZ: bu iki dosyada uzun XML yorum
// blokları var ve yorumların içinde anahtar adları geçiyor. `toContain` yorumu
// da sayar; yani anahtar silinse bile test YEŞİL kalırdı — tam olarak yakalamak
// istediğimiz hatayı kaçırırdı. Bu yüzden dosya gerçekten ÇÖZÜLÜR.
//
// Çözücü ayrıca dosyanın biçimsel geçerliliğini de sınar: kapanmayan etiket ya
// da eşleşmeyen anahtar/değer çifti varsa `hata` fırlatır.

type PlistDeger = string | boolean | PlistDeger[] | { [k: string]: PlistDeger };

function bosluğuAtla(s: string, i: number): number {
  while (i < s.length && /\s/.test(s[i]!)) i += 1;
  return i;
}

function dugumOku(s: string, i: number): { deger: PlistDeger; son: number } {
  i = bosluğuAtla(s, i);
  if (s[i] !== '<') throw new Error(`Etiket bekleniyordu: ${s.slice(i, i + 40)}`);
  const kapanis = s.indexOf('>', i);
  if (kapanis < 0) throw new Error('Kapanmayan etiket');
  const etiket = s.slice(i + 1, kapanis).trim();

  // Kendi kendine kapanan etiketler: <true/>, <false/>, <array/>, <dict/>
  if (etiket.endsWith('/')) {
    const ad = etiket.slice(0, -1).trim();
    if (ad === 'true') return { deger: true, son: kapanis + 1 };
    if (ad === 'false') return { deger: false, son: kapanis + 1 };
    if (ad === 'array') return { deger: [], son: kapanis + 1 };
    if (ad === 'dict') return { deger: {}, son: kapanis + 1 };
    throw new Error(`Bilinmeyen boş etiket: ${ad}`);
  }

  if (etiket === 'dict') {
    const nesne: { [k: string]: PlistDeger } = {};
    let j = kapanis + 1;
    for (;;) {
      j = bosluğuAtla(s, j);
      if (s.startsWith('</dict>', j)) return { deger: nesne, son: j + 7 };
      if (!s.startsWith('<key>', j)) throw new Error('dict içinde <key> bekleniyordu');
      const keySon = s.indexOf('</key>', j);
      if (keySon < 0) throw new Error('Kapanmayan <key>');
      const anahtar = s.slice(j + 5, keySon);
      const d = dugumOku(s, keySon + 6);
      nesne[anahtar] = d.deger;
      j = d.son;
    }
  }

  if (etiket === 'array') {
    const dizi: PlistDeger[] = [];
    let j = kapanis + 1;
    for (;;) {
      j = bosluğuAtla(s, j);
      if (s.startsWith('</array>', j)) return { deger: dizi, son: j + 8 };
      const d = dugumOku(s, j);
      dizi.push(d.deger);
      j = d.son;
    }
  }

  if (etiket === 'string') {
    const son = s.indexOf('</string>', kapanis);
    if (son < 0) throw new Error('Kapanmayan <string>');
    return { deger: s.slice(kapanis + 1, son), son: son + 9 };
  }

  throw new Error(`Desteklenmeyen etiket: ${etiket}`);
}

/** XML'i çöz; yorumlar, XML başlığı ve DOCTYPE atılır. */
function plistCoz(xml: string): { [k: string]: PlistDeger } {
  const temiz = xml
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<\?xml[\s\S]*?\?>/g, '')
    .replace(/<!DOCTYPE[\s\S]*?>/g, '');
  const plistBas = temiz.indexOf('<plist');
  if (plistBas < 0) throw new Error('<plist> kökü yok');
  const icBas = temiz.indexOf('>', plistBas) + 1;
  const icSon = temiz.lastIndexOf('</plist>');
  if (icSon < 0) throw new Error('</plist> kapanışı yok');
  const { deger } = dugumOku(temiz.slice(icBas, icSon), 0);
  if (typeof deger !== 'object' || Array.isArray(deger)) throw new Error('Kök dict değil');
  return deger as { [k: string]: PlistDeger };
}

// ════════════════════════════════════════════════════════════════════════════

const INFO_YOL = 'ios/App/App/Info.plist';
const GIZLILIK_YOL = 'ios/App/App/PrivacyInfo.xcprivacy';

/** Kaynakta gerçekten kullanıldığı KANITLANAN izinler. */
const KULLANILAN_IZINLER = [
  // `<input type="file" accept="image/*">` → WKWebView "Fotoğraf Çek" seçeneği.
  'NSCameraUsageDescription',
  // services/locationService.ts · Geolocation.getCurrentPosition
  'NSLocationWhenInUseUsageDescription',
  // Aynı dosya girdisinde "Fotoğraf Kitaplığı" ile görsel seçme (OKUMA).
  'NSPhotoLibraryUsageDescription',
  // utils/dosyaKaydet.ts → Share.share(files) → iOS "Görseli Kaydet" (YAZMA).
  'NSPhotoLibraryAddUsageDescription',
  // services/contactsService.ts · Contacts.requestPermissions
  'NSContactsUsageDescription',
] as const;

/**
 * Kodda hiçbir çağrısı OLMAYAN izinler. Buraya bir anahtar eklenirse Apple
 * "neden istiyorsunuz?" diye sorar ve gizlilik formuyla çelişki doğar.
 */
const KULLANILMAYAN_IZINLER = [
  'NSMicrophoneUsageDescription',
  'NSCalendarsUsageDescription',
  'NSCalendarsFullAccessUsageDescription',
  'NSRemindersUsageDescription',
  'NSFaceIDUsageDescription',
  'NSMotionUsageDescription',
  'NSSpeechRecognitionUsageDescription',
  'NSAppleMusicUsageDescription',
  'NSBluetoothAlwaysUsageDescription',
  'NSBluetoothPeripheralUsageDescription',
  'NSHealthShareUsageDescription',
  'NSHealthUpdateUsageDescription',
  'NSLocalNetworkUsageDescription',
  // Arka planda konum ALINMIYOR; "Always" istemek incelemede ağır sorulur.
  'NSLocationAlwaysUsageDescription',
  'NSLocationAlwaysAndWhenInUseUsageDescription',
] as const;

describe('Info.plist · izin beyanları gerçek kullanımla eşleşir', () => {
  const info = plistCoz(oku(INFO_YOL));
  const anahtarlar = Object.keys(info);
  const izinler = anahtarlar.filter((k) => k.endsWith('UsageDescription'));

  it('dosya geçerli bir plist olarak çözülüyor', () => {
    // Bozuk plist derlemeyi değil MAĞAZA YÜKLEMESİNİ düşürür.
    expect(info.CFBundleIdentifier).toBeTruthy();
  });

  it.each(KULLANILAN_IZINLER)('%s BEYAN EDİLMİŞ (silinirse uygulama çöker)', (anahtar) => {
    expect(anahtarlar).toContain(anahtar);
    // Boş/eksik metin de reddedilir: Apple gerekçe metnini kullanıcıya gösterir.
    expect(String(info[anahtar]).trim().length).toBeGreaterThan(20);
  });

  it.each(KULLANILMAYAN_IZINLER)('%s BEYAN EDİLMEMİŞ (kodda karşılığı yok)', (anahtar) => {
    expect(anahtarlar).not.toContain(anahtar);
  });

  it('beyan edilen izin listesi tam olarak kanıtlanan listedir — fazlası yok', () => {
    // Yeni bir izin eklenirse bu test kırılır ve ekleyeni KANIT yazmaya zorlar.
    expect([...izinler].sort()).toEqual([...KULLANILAN_IZINLER].sort());
  });
});

describe('Info.plist · gerekçe metinleri var olmayan özellik vaat etmiyor', () => {
  const info = plistCoz(oku(INFO_YOL));

  it('kamera gerekçesi QR TARAMA vaat etmiyor — o özellik koddan kaldırıldı', () => {
    // Kanıt: QRScannerView yalnız elle kod girişi + maç listesi; kamera yok.
    const ekran = oku('views/QRScannerView.tsx');
    expect(ekran).not.toMatch(/getUserMedia|mediaDevices|@capacitor\/camera/);

    // Metin hâlâ "QR kod taramak" deseydi, incelemeci var olmayan bir özelliğin
    // izniyle karşılaşırdı. Beyan ile davranış birebir olmalı.
    expect(String(info.NSCameraUsageDescription)).not.toMatch(/QR/i);
  });

  it('fotoğraf KİTAPLIĞINA YAZMA beyanının kanıtı hâlâ ayakta', () => {
    // Bu beyan "kullanılmıyor" sanılıp silinirse, kullanıcı biletini kaydetmeye
    // çalıştığı anda iOS uygulamayı öldürür. Kanıt zinciri:
    //   dosyaKaydet → Share.share({ files }) → iOS paylaşım sayfası
    //   → MatchTicket .png gönderiyor → sayfada "Görseli Kaydet" çıkar.
    const kaydet = oku('utils/dosyaKaydet.ts');
    expect(kaydet).toContain('Share.share');
    expect(kaydet).toContain('files:');

    const bilet = oku('views/MatchTicket.tsx');
    expect(bilet).toContain('dosyaKaydetVeyaPaylas');
    expect(bilet).toMatch(/\.png/);

    const info2 = plistCoz(oku(INFO_YOL));
    expect(Object.keys(info2)).toContain('NSPhotoLibraryAddUsageDescription');
  });

  it('okuma ve yazma beyanları AYRI anahtarlardır, biri diğerinin yerine geçmez', () => {
    // NSPhotoLibraryUsageDescription = seçme/okuma,
    // NSPhotoLibraryAddUsageDescription = kitaplığa yazma. Karıştırılırsa
    // eksik kalan tarafta çökme olur.
    expect(info.NSPhotoLibraryUsageDescription).not.toEqual(info.NSPhotoLibraryAddUsageDescription);
  });
});

describe('PrivacyInfo.xcprivacy · toplanan veri beyanı', () => {
  const gizlilik = plistCoz(oku(GIZLILIK_YOL));
  const turler = gizlilik.NSPrivacyCollectedDataTypes as Array<{ [k: string]: PlistDeger }>;

  it('dosya geçerli bir plist olarak çözülüyor', () => {
    // Bozuk gizlilik manifestosu → ITMS-91053 ile yükleme reddi.
    expect(Array.isArray(turler)).toBe(true);
    expect(turler.length).toBeGreaterThan(0);
    expect(Array.isArray(gizlilik.NSPrivacyAccessedAPITypes)).toBe(true);
  });

  it('CİHAZ KİMLİĞİ (push jetonu) beyan edilmiş', () => {
    // Kanıt: pushService cihaz jetonunu kullanıcı satırına yazıyor. Mağaza
    // formunda bu "Cihaz veya diğer kimlikler" kategorisidir; beyan edilmezse
    // form gerçek davranışla çelişir.
    const push = oku('notifications/pushService.ts');
    expect(push).toContain('push_token');

    const cihaz = turler.find(
      (t) => t.NSPrivacyCollectedDataType === 'NSPrivacyCollectedDataTypeDeviceID',
    );
    expect(cihaz, 'NSPrivacyCollectedDataTypeDeviceID beyanı yok').toBeTruthy();
    expect(cihaz!.NSPrivacyCollectedDataTypeLinked).toBe(true);
    expect(cihaz!.NSPrivacyCollectedDataTypeTracking).toBe(false);
    expect(cihaz!.NSPrivacyCollectedDataTypePurposes).toEqual([
      'NSPrivacyCollectedDataTypePurposeAppFunctionality',
    ]);
  });

  it('hiçbir tür İZLEME için toplanmıyor — üst beyanla tutarlı', () => {
    expect(gizlilik.NSPrivacyTracking).toBe(false);
    expect(gizlilik.NSPrivacyTrackingDomains).toEqual([]);
    for (const t of turler) {
      expect(t.NSPrivacyCollectedDataTypeTracking, String(t.NSPrivacyCollectedDataType)).toBe(false);
    }
  });

  it('her türün amaç listesi dolu — boş amaç mağaza formunda karşılıksız kalır', () => {
    for (const t of turler) {
      const amaclar = t.NSPrivacyCollectedDataTypePurposes;
      expect(Array.isArray(amaclar), String(t.NSPrivacyCollectedDataType)).toBe(true);
      expect((amaclar as PlistDeger[]).length).toBeGreaterThan(0);
    }
  });
});

describe('MAGAZA_GONDERIM.md · kurucuya söylenen sayı dosyayla aynı', () => {
  const belge = oku('docs/master/MAGAZA_GONDERIM.md');
  const gizlilik = plistCoz(oku(GIZLILIK_YOL));
  const turSayisi = (gizlilik.NSPrivacyCollectedDataTypes as PlistDeger[]).length;

  it('belgedeki "N veri türü" sayısı PrivacyInfo ile eşleşiyor', () => {
    // Kurucu mağaza formunu bu sayıya bakarak dolduruyor. Dosyaya yeni bir tür
    // eklenip belge güncellenmezse form EKSİK doldurulur — sessiz bir yalan.
    //
    // YALNIZ YAPILACAKLAR BÖLÜMÜ (§4) taranır: belgenin üstündeki tablo bir
    // GEÇMİŞ KAYDIDIR ("o gün 10 türe çıkmıştı"). Geçmişi bugünkü sayıya
    // uydurmak kaydı bozar; kurucunun uyacağı sayı ise §4'tekidir.
    const yapilacaklar = belge.slice(belge.indexOf('## 4 · KURUCU İŞİ'));
    expect(yapilacaklar.length, '§4 bölümü bulunamadı').toBeGreaterThan(0);
    const gecenler = [...yapilacaklar.matchAll(/(\d+)\s*veri türü/g)].map((m) => Number(m[1]));
    expect(gecenler.length, '§4 içinde veri türü sayısı geçmiyor').toBeGreaterThan(0);
    for (const n of gecenler) expect(n).toBe(turSayisi);
  });

  it('"Her iOS yüklemesinde" başlığı VAR ve TEK — çoğaltılmamış', () => {
    const basliklar = [...belge.matchAll(/^###\s*Her iOS yüklemesinde\s*$/gm)];
    expect(basliklar.length).toBe(1);
  });

  it('build numarası adımı Xcode alanını ADIYLA tarif ediyor', () => {
    // "Build numarasını artır" tek başına yetmez; kurucu kod okumuyor ve
    // alanın Xcode'da NEREDE olduğunu bilmiyor.
    const bolum = belge.slice(belge.indexOf('### Her iOS yüklemesinde'));
    expect(bolum).toContain('TARGETS');
    expect(bolum).toContain('General');
    expect(bolum).toContain('Build');
  });

  it('pod kurulumu uyarısı yazılmış — Podfile.lock eski', () => {
    // ios/App/Podfile.lock yalnız 4 eklenti içeriyor, Podfile'da 15 var; üstelik
    // yollar başka bir bilgisayarı gösteriyor. `cap sync` + `pod install`
    // çalışmadan derlenen paketten eklentiler DÜŞER.
    const bolum = belge.slice(belge.indexOf('### Her iOS yüklemesinde'));
    expect(bolum).toContain('pod install');
    expect(bolum).toContain('npm run sync:ios');
  });
});

describe('Podfile ↔ Podfile.lock · kilit dosyası gerçekten eski mi', () => {
  const podfile = oku('ios/App/Podfile');
  const kilit = oku('ios/App/Podfile.lock');

  it('kilit dosyası Podfile ile UYUŞMUYOR — kurucu pod install çalıştırmalı', () => {
    // Bu test bir KUSURU değil, bilinen bir DURUMU kilitliyor: kilit dosyası
    // elle düzeltilmez (`pod install` üretir). Uyuşma sağlandığında test
    // beklentisi tersine çevrilmeli — o zaman gerçekten senkron demektir.
    const podlar = [...podfile.matchAll(/^\s*pod '([^']+)'/gm)].map((m) => m[1]!);
    expect(podlar.length).toBeGreaterThan(4);
    const eksikler = podlar.filter((p) => !kilit.includes(`${p} (`));
    expect(eksikler.length, `kilitte eksik pod: ${eksikler.join(', ')}`).toBeGreaterThan(0);
  });

  it('kilit dosyasındaki yollar bu depoya ait DEĞİL (yabancı makine izi)', () => {
    // Podfile `../../node_modules/...` diyor; kilit başka bir klasörü gösteriyor.
    expect(podfile).toContain('../../node_modules/@capacitor/ios');
    expect(kilit).not.toContain(':path: "../../node_modules/@capacitor/ios"');
  });
});
