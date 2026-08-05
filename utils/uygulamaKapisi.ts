// ════════════════════════════════════════════════════════════════════════════
// UYGULAMA KAPISI — açılışta sorulan tek soru
// ════════════════════════════════════════════════════════════════════════════
//
// NE İŞE YARAR: Bozuk bir sürüm yayınlandığında onu durdurabilmek. Mobil geri
// alınamayan tek platformdur — bozuk sürüm, her kullanıcı tek tek güncelleyene
// kadar telefonunda durur. Bu kapı, panelden çevrilen bir anahtarla o sürümü
// aynı dakika durdurur.
//
// ── EN ÖNEMLİ KURAL: KAPI **AÇIK** ARIZALANIR ──────────────────────────────
// Sunucuya ulaşılamazsa, sorgu patlarsa, zaman aşarsa → uygulama NORMAL AÇILIR.
// Aksi hâlde tek bir sunucu kesintisi bütün kullanıcıları kilitlerdi; yani
// "kurtarma aracı" felaketin kendisi olurdu. Kilit YALNIZCA sunucu açıkça
// "kilitle" dediğinde kapanır.
//
// ── YÖNETİM PANELİ KİLİTLENMEZ ────────────────────────────────────────────
// Bu modül yalnız kullanıcı uygulamasında çağrılır. Panel ayrı bir giriştir:
// bakımı açan kişi onu kapatabilmelidir. Kendini de kilitleyen bir anahtar,
// anahtar değildir.
// ════════════════════════════════════════════════════════════════════════════

import { supabase } from '../supabaseClient';
import { APP_VERSION } from './appVersion';

/** Sunucu bu sürede cevap vermezse kapı AÇIK sayılır. */
const ZAMAN_ASIMI_MS = 4000;

export interface KapiDurumu {
  /** Tam kilit — hiçbir ekran açılmaz (kurucu kararı 1A). */
  bakim: boolean;
  bakimMesaj: string | null;
  bakimBitis: string | null;
  /** Kapatılamaz "Güncelle" ekranı. */
  zorunluGuncelleme: boolean;
  /** Kapatılabilir "yeni sürüm var" şeridi. */
  onerilenGuncelleme: boolean;
  guncellemeMesaj: string | null;
  kayitAcik: boolean;
  destek: string;
  /** Kapı sorulamadı (ağ/sunucu). Her şey AÇIK varsayılır. */
  sorulamadi: boolean;
}

/** Hiçbir şeyin kilitli olmadığı hâl — kapı sorulamadığında bu kullanılır. */
export const KAPI_ACIK: KapiDurumu = {
  bakim: false,
  bakimMesaj: null,
  bakimBitis: null,
  zorunluGuncelleme: false,
  onerilenGuncelleme: false,
  guncellemeMesaj: null,
  kayitAcik: true,
  destek: 'destek@oyna.app',
  sorulamadi: true,
};

interface SunucuYaniti {
  bakim?: boolean;
  bakim_mesaj?: string | null;
  bakim_bitis?: string | null;
  zorunlu_guncelleme?: boolean;
  onerilen_guncelleme?: boolean;
  guncelleme_mesaj?: string | null;
  kayit_acik?: boolean;
  destek?: string;
}

/**
 * Kapıyı sorar. ASLA hata fırlatmaz; cevap gelmezse `KAPI_ACIK` döner.
 */
export async function kapiyiSor(surum: string = APP_VERSION): Promise<KapiDurumu> {
  try {
    const istek = supabase.rpc('uygulama_kapisi', { p_surum: surum });
    // Zaman aşımı: yavaş şebekede kullanıcı açılış ekranında asılı kalmasın.
    const zamanAsimi = new Promise<null>((cozumle) =>
      setTimeout(() => cozumle(null), ZAMAN_ASIMI_MS),
    );
    const sonuc = await Promise.race([istek, zamanAsimi]);
    if (!sonuc || (sonuc as { error?: unknown }).error) return KAPI_ACIK;

    const d = (sonuc as { data?: SunucuYaniti }).data;
    if (!d || typeof d !== 'object') return KAPI_ACIK;

    return {
      bakim: d.bakim === true,
      bakimMesaj: d.bakim_mesaj ?? null,
      bakimBitis: d.bakim_bitis ?? null,
      zorunluGuncelleme: d.zorunlu_guncelleme === true,
      onerilenGuncelleme: d.onerilen_guncelleme === true,
      guncellemeMesaj: d.guncelleme_mesaj ?? null,
      kayitAcik: d.kayit_acik !== false,
      destek: d.destek || 'destek@oyna.app',
      sorulamadi: false,
    };
  } catch {
    // KAPI AÇIK ARIZALANIR.
    return KAPI_ACIK;
  }
}

/**
 * Mağaza adresi — telefonun türüne göre.
 * Kimlikler `capacitor.config.ts` ile aynı olmalı.
 */
export const MAGAZA_ANDROID = 'https://play.google.com/store/apps/details?id=com.oyna.app';
// iOS mağaza kimliği App Store Connect'te uygulama oluşturulunca netleşir.
// O güne kadar arama sayfasına gider — kullanıcı yine uygulamayı bulur,
// ama düğme "hiçbir yere gitmeyen düğme" olmaz.
export const MAGAZA_IOS = 'https://apps.apple.com/tr/search?term=oyna%20hal%C4%B1%20saha';

export function magazaAdresi(): string {
  try {
    const ua = typeof navigator !== 'undefined' ? navigator.userAgent || '' : '';
    if (/iphone|ipad|ipod/i.test(ua)) return MAGAZA_IOS;
    return MAGAZA_ANDROID;
  } catch {
    return MAGAZA_ANDROID;
  }
}
