// ════════════════════════════════════════════════════════════════════════════
// DOSYA KAYDETME / PAYLAŞMA — TEK KAYNAK
// ════════════════════════════════════════════════════════════════════════════
//
// SORUN (17 Ağu 2026 — mağaza öncesi denetimde bulundu):
// Uygulamadaki tüm "indir/kaydet" düğmeleri klasik web desenini kullanıyordu:
//
//     const a = document.createElement('a');
//     a.href = URL.createObjectURL(blob);
//     a.download = 'dosya.png';
//     a.click();
//
// Bu desen TARAYICIDA çalışır; PAKETLENMİŞ uygulamada ÇALIŞMAZ:
//   • iOS (WKWebView): `download` özniteliği desteklenmez — tıklama SESSİZCE
//     hiçbir şey yapmaz.
//   • Android (Capacitor WebView): WebView'a bir DownloadListener bağlı
//     olmadığı için blob/data indirmesi düşer — yine SESSİZ başarısızlık.
//
// İLK DÜZELTME YETMEDİ (denetim B1): "önce Web Share, olmazsa <a download>"
// yalnızca iOS'u kurtarıyordu. ANDROID WebView'da `navigator.share` HİÇ YOK;
// yani Android her seferinde çalışmayan `<a download>` yoluna düşüyor ve
// yardımcı 'INDIRILDI' döndürüyordu. Çağıran ekranlar da buna bakıp
// "Bilet kaydedildi" diyordu: dosya ortada yok, kullanıcıya YALAN söyleniyor.
// Yalan başarı mesajı, sessiz hatadan daha kötüdür.
//
// ÇÖZÜM: pakette (native) dosyayı RESMİ Capacitor eklentileriyle diske yaz ve
// sistemin paylaşım sayfasını aç (@capacitor/filesystem + @capacitor/share).
// Kullanıcı oradan "Dosyalara Kaydet" / "Galeriye Kaydet" diyebilir.
//
// ZARİF DÜŞÜŞ: bu eklentiler `npx cap sync` çalışana kadar native tarafta
// KAYITLI OLMAYABİLİR; o durumda Capacitor "plugin is not implemented" hatası
// atar. Bu yüzden eklentiler DİNAMİK import + try/catch içinde çağrılır —
// eksiklerse uygulama ÇÖKMEZ, eski yollara düşer. Hiçbiri olmazsa
// 'DESTEKLENMIYOR' döner ve çağıran ekran bunu KULLANICIYA SÖYLER.
//
// Pakette `<a download>` yolu artık DENENMEZ: bilerek çalışmadığını bildiğimiz
// bir yolu deneyip "indirildi" demek, düzeltmeye çalıştığımız yalanın ta kendisi
// olur. Tarayıcı (web) tarafında davranış AYNEN korunur.
// ════════════════════════════════════════════════════════════════════════════

import { Capacitor } from '@capacitor/core';

export type KaydetSonucu = 'PAYLASILDI' | 'INDIRILDI' | 'IPTAL' | 'DESTEKLENMIYOR';

/** Paketlenmiş uygulama içinde miyiz? Okuma bile patlarsa web varsay. */
function pakettePlatform(): boolean {
  try {
    return Capacitor.isNativePlatform();
  } catch {
    return false;
  }
}

/**
 * Kullanıcı paylaşım sayfasını kapattı mı?
 * Web Share 'AbortError' atar; Capacitor Share eklentisi hem iOS hem Android'de
 * "Share canceled" mesajıyla reddeder — ikisi de HATA DEĞİL, vazgeçmedir.
 */
function iptalMi(e: unknown): boolean {
  const hata = e as { name?: string; message?: string } | null;
  if (hata?.name === 'AbortError') return true;
  return /cancel/i.test(hata?.message ?? '');
}

/** Blob → base64 (Capacitor Filesystem ikili veriyi base64 bekler). */
function blobBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const okuyucu = new FileReader();
    okuyucu.onerror = () => reject(new Error('Dosya okunamadı.'));
    okuyucu.onload = () => {
      // readAsDataURL "data:<tip>;base64,XXXX" verir; eklentiye yalnız XXXX gider.
      const metin = String(okuyucu.result ?? '');
      const virgul = metin.indexOf(',');
      resolve(virgul >= 0 ? metin.slice(virgul + 1) : metin);
    };
    okuyucu.readAsDataURL(blob);
  });
}

/**
 * PAKET YOLU — dosyayı önbelleğe yaz, sistemin paylaşım sayfasını aç.
 *
 * `null` dönerse "bu yol kullanılamadı" demektir (eklenti yok, yazma başarısız,
 * paylaşım açılamadı) ve üst kat diğer yollara düşer. Bilerek `null`/sonuç
 * ayrımı var: hiçbir durumda sahte başarı üretilmemeli.
 */
async function paketKaydetVePaylas(
  blob: Blob,
  dosyaAdi: string,
  baslik?: string,
): Promise<KaydetSonucu | null> {
  try {
    // DİNAMİK import: eklentiler `npx cap sync` yapılmadan native tarafta
    // bulunmayabilir. Statik import olsaydı modül yüklenirken patlardı.
    const [fs, sh] = await Promise.all([
      import('@capacitor/filesystem'),
      import('@capacitor/share'),
    ]);

    const veri = await blobBase64(blob);
    // Cache dizini: android/app/src/main/res/xml/file_paths.xml içindeki
    // <cache-path> ile eşleşir; Share eklentisi dosyayı FileProvider üzerinden
    // ancak orada paylaşabilir. Başka dizin seçilirse Android'de patlar.
    const yazilan = await fs.Filesystem.writeFile({
      path: dosyaAdi,
      data: veri,
      directory: fs.Directory.Cache,
      recursive: true,
    });

    const uri = yazilan?.uri;
    if (!uri) return null;

    await sh.Share.share({
      title: baslik ?? dosyaAdi,
      dialogTitle: baslik ?? dosyaAdi,
      files: [uri],
    });
    return 'PAYLASILDI';
  } catch (e) {
    if (iptalMi(e)) return 'IPTAL';
    return null;
  }
}

/** Paylaşım sayfası bu dosyayı kabul ediyor mu? */
function paylasilabilir(file: File): boolean {
  try {
    const n = navigator as Navigator & { canShare?: (d?: ShareData) => boolean };
    return typeof n.share === 'function' && typeof n.canShare === 'function'
      && n.canShare({ files: [file] });
  } catch {
    return false;
  }
}

/** Klasik tarayıcı indirmesi (masaüstü/mobil web). */
function klasikIndir(blob: Blob, dosyaAdi: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = dosyaAdi;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

/**
 * Dosyayı kullanıcıya ver.
 *
 * Sıra: paket ise native yaz+paylaş → Web Share (dosyalı) → klasik indirme
 * (YALNIZ tarayıcıda) → 'DESTEKLENMIYOR'.
 *
 * `baslik` paylaşım sayfasında görünür (ör. "OYNA Bilet").
 * Kullanıcı paylaşım sayfasını kapatırsa 'IPTAL' döner — bu bir HATA DEĞİLDİR,
 * çağıran taraf hata mesajı göstermemelidir. 'IPTAL' ve 'DESTEKLENMIYOR'
 * hiçbir çağrı sitesinde BAŞARI mesajı doğurmamalıdır.
 */
export async function dosyaKaydetVeyaPaylas(
  blob: Blob,
  dosyaAdi: string,
  baslik?: string,
): Promise<KaydetSonucu> {
  const pakette = pakettePlatform();
  try {
    if (pakette) {
      const paketSonucu = await paketKaydetVePaylas(blob, dosyaAdi, baslik);
      if (paketSonucu) return paketSonucu;
    }

    const file = new File([blob], dosyaAdi, { type: blob.type || 'application/octet-stream' });
    if (paylasilabilir(file)) {
      try {
        await (navigator as Navigator & { share: (d: ShareData) => Promise<void> })
          .share({ files: [file], title: baslik ?? dosyaAdi });
        return 'PAYLASILDI';
      } catch (e) {
        // Kullanıcı vazgeçti (AbortError) → sessizce çık; indirmeye DÜŞME,
        // yoksa "vazgeçtim ama yine de indi" hissi olur.
        if ((e as Error)?.name === 'AbortError') return 'IPTAL';
        // Diğer hatalarda klasik yola düş.
      }
    }

    // Pakette klasik indirme SESSİZCE başarısız olur; denemek yerine dürüstçe
    // "olmadı" de ki çağıran ekran kullanıcıyı uyarabilsin.
    if (pakette) return 'DESTEKLENMIYOR';

    klasikIndir(blob, dosyaAdi);
    return 'INDIRILDI';
  } catch {
    return 'DESTEKLENMIYOR';
  }
}
