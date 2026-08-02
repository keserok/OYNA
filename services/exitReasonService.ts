// ════════════════════════════════════════════════════════════════════════════
// UYGULAMA EN SON NEDEN KAPANDI?
// ----------------------------------------------------------------------------
// "Uygulama kendi kendine kapanıyor" şikâyetinin tek bir sebebi yoktur; dışarıdan
// bakınca hepsi aynı görünür (ekran birden ana ekrana döner) ama sebepler ve
// çözümleri bambaşkadır:
//   • telefonun belleği doldu → Android uygulamayı kapattı
//   • uygulama arka plandayken sistem yerini geri aldı
//   • kodda hata oluştu
//   • WebView'da derin çökme
//   • uygulama donduğu için sistem kapattı
//   • üretici firmanın "pil koruma" yazılımı kapattı
//
// Android 11'den beri sistem bu sebebi KENDİSİ tutuyor. `MainActivity.java`
// açılışta o kaydı okuyup sade Türkçeye çevirerek Capacitor'ın tercih deposuna
// yazar; bu dosya da onu okur. Böylece tahmin etmek yerine telefona soruyoruz.
//
// GİZLİLİK: Bilgi telefonda kalır, hiçbir yere gönderilmez. Kişisel veri
// içermez — yalnızca kapanma sebebi, zamanı ve o andaki bellek kullanımı.
// ════════════════════════════════════════════════════════════════════════════

import { Capacitor } from '@capacitor/core';
import { Preferences } from '@capacitor/preferences';

/** MainActivity.java ile AYNI anahtar olmalı — orada da sabit olarak yazılı. */
const ANAHTAR = 'oyna.sonKapanmaSebebi';

export interface KapanmaKaydi {
  /** Sade Türkçe sebep — ör. "Telefonun belleği doldu — Android uygulamayı kapattı". */
  sebep: string;
  /** Android'in ham sebep kodu (destek yazışmasında işe yarar). */
  sebepKodu: number;
  /**
   * Bu kapanış beklenen mi? (kullanıcının kendi kapatması, güncelleme, izin
   * değişikliği). Kararı Android tarafı verir — sebep kodlarının isimlendirilmiş
   * sabitleri yalnız orada var ve ham sayıları burada yeniden eşlemek hataya
   * açık (7 = başlatılamadı, 10 = kullanıcı kapattı gibi sezgisel olmayan
   * numaralar).
   */
  zararsiz: boolean;
  /** Sistemin eklediği serbest açıklama; çoğu zaman boştur. */
  aciklama: string;
  /** Kapanma anında kullanıcı uygulamaya bakıyor muydu? */
  onPlandaMiydi: string;
  /** Kapanma anındaki bellek kullanımı (MB). Bilinmiyorsa -1. */
  bellekMB: number;
  /** "02.08.2026 14:35" */
  zaman: string;
}

export interface KapanmaRaporu {
  /** Android 11 altındaki cihazlarda sistem bu bilgiyi vermez. */
  destekleniyor: boolean;
  /** Desteklenmiyorsa sebebini anlatan cümle. */
  not?: string;
  /** En yeni kapanış başta olmak üzere son 5 kayıt. */
  kayitlar: KapanmaKaydi[];
}

/**
 * Son kapanma kaydını okur.
 *
 * `null` döner ise: bilgi yok demektir (tarayıcıda çalışıyoruz, iOS'tayız ya da
 * uygulama bu telefonda henüz hiç anormal kapanmamış).
 */
export async function sonKapanmaRaporu(): Promise<KapanmaRaporu | null> {
  // Bu kayıt yalnız Android'de üretilir; başka yerde boşuna okuma yapma.
  if (Capacitor.getPlatform() !== 'android') return null;
  try {
    const { value } = await Preferences.get({ key: ANAHTAR });
    if (!value) return null;
    const ham = JSON.parse(value) as Partial<KapanmaRaporu>;
    return {
      destekleniyor: ham.destekleniyor === true,
      not: ham.not,
      kayitlar: Array.isArray(ham.kayitlar) ? ham.kayitlar : [],
    };
  } catch {
    // Bozuk/eksik kayıt teşhis ekranını çökertmesin — bilgi yok say.
    return null;
  }
}

/**
 * Bu kayıt dikkat çekilmesi gereken bir arıza mı?
 * Kullanıcının kendi kapattığı, güncelleme ya da izin değişikliği kaynaklı
 * kapanışlar arıza değildir; kararı Android tarafı verir (bkz. `zararsiz`).
 */
export function ariza(k: KapanmaKaydi): boolean {
  return k.zararsiz !== true;
}
