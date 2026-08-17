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
// Etkilenen yerler: maç bileti QR'ı, taktik görseli, tesis verisi dışa aktarma
// (KVKK), sahip finans CSV'leri. Kullanıcı düğmeye basıyor, hiçbir şey olmuyor
// ve neden olmadığını da anlamıyor.
//
// ÇÖZÜM: önce PLATFORMUN KENDİ paylaşım sayfasını dene (Web Share API — iOS ve
// Android WebView'larında destekli; kullanıcı oradan "Görseli Kaydet" /
// "Dosyalar'a Kaydet" diyebilir), olmazsa klasik indirmeye düş. Yeni bir native
// eklenti GEREKMEZ — ek bağımlılık, gönderim öncesi ekstra risktir.
// ════════════════════════════════════════════════════════════════════════════

export type KaydetSonucu = 'PAYLASILDI' | 'INDIRILDI' | 'IPTAL' | 'DESTEKLENMIYOR';

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
 * Dosyayı kullanıcıya ver: önce paylaşım sayfası, olmazsa indirme.
 *
 * `baslik` paylaşım sayfasında görünür (ör. "OYNA Bilet").
 * Kullanıcı paylaşım sayfasını kapatırsa 'IPTAL' döner — bu bir HATA DEĞİLDİR,
 * çağıran taraf hata mesajı göstermemelidir.
 */
export async function dosyaKaydetVeyaPaylas(
  blob: Blob,
  dosyaAdi: string,
  baslik?: string,
): Promise<KaydetSonucu> {
  try {
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
    klasikIndir(blob, dosyaAdi);
    return 'INDIRILDI';
  } catch {
    return 'DESTEKLENMIYOR';
  }
}
