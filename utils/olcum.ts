// ════════════════════════════════════════════════════════════════════════════
// ÖLÇÜM — uygulama tarafı
// ════════════════════════════════════════════════════════════════════════════
//
// KULLANIMI (tek satır, her yerden):
//     import { olayYaz } from '../utils/olcum';
//     olayYaz('kaptan_kapora_ekrani');
//
// ── ÜÇ SÖZ ─────────────────────────────────────────────────────────────────
// 1. ASLA HATA FIRLATMAZ, ASLA BEKLETMEZ. Ölçüm, ölçtüğü akışı bozamaz —
//    ödeme yaparken ölçüm patlarsa ödeme de patlardı. Çağrı `await` istemez;
//    arka planda gider, sonucu kimse beklemez.
// 2. AYNI OLAY AYNI OTURUMDA BİR KEZ. Bir ekran iki kez render olduğunda
//    (React geliştirme modunda bu OLAĞAN) olay iki kez yazılmaz; huni "aynı
//    kişi 2 kişi" gibi görünmez.
// 3. TANIMSIZ AD YAZILMAZ. Ad kataloğa (`shared/olayKatalogu.ts`) uymuyorsa
//    geliştirme modunda konsola uyarı düşer; sunucu da zaten reddeder.
//
// ── OTURUM KİMLİĞİ ─────────────────────────────────────────────────────────
// Uygulamanın bir açılışına verilen rastgele kimlik. Kişi bazlı sayının yanında
// "kaç ayrı deneme" sorusunu cevaplar. Cihazda saklanmaz, uygulama kapanınca
// kaybolur — bir kimlik değil, bir ziyaret numarasıdır.
//
// ── GİZLİLİK ───────────────────────────────────────────────────────────────
// Bu modül isim, e-posta, telefon, tutar GÖNDERMEZ. `ek` alanına yalnız sayı
// ve kısa etiket konur; sunucu tarafında ayrıca gizlilik eleğinden geçer
// (çökme kayıtlarıyla aynı elek).
// ════════════════════════════════════════════════════════════════════════════

import { supabase } from '../supabaseClient';
import { TUM_OLAYLAR } from '../shared/olayKatalogu';
import { APP_VERSION } from './appVersion';

/** Bu açılışa ait ziyaret numarası. */
const OTURUM_ID: string =
  (typeof crypto !== 'undefined' && 'randomUUID' in crypto)
    ? crypto.randomUUID().slice(0, 32)
    : `o${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`;

/** Bu oturumda zaten yazılmış olaylar — ikinci kez yazılmaz. */
const yazilanlar = new Set<string>();

const gecerliOlaylar = new Set(TUM_OLAYLAR);

/**
 * Hangi telefonda çalışıyoruz.
 *
 * Capacitor'ı İÇERİ ALMIYORUZ: bu modül ödeme/maç akışlarının ortasından
 * çağrılıyor ve ek bir yerel eklenti bağımlılığı taşımak istemiyoruz.
 * `navigator.userAgent` bu ayrım için yeterli.
 */
function platformBul(): string {
  try {
    if (typeof navigator === 'undefined') return 'bilinmiyor';
    const ua = navigator.userAgent || '';
    if (/android/i.test(ua)) return 'android';
    if (/iphone|ipad|ipod/i.test(ua)) return 'ios';
    return 'web';
  } catch {
    return 'bilinmiyor';
  }
}

/**
 * Kullanıcının hangi bölgeye baktığı.
 *
 * Store'u DOĞRUDAN import etmiyoruz: `store.ts` bu modülü zincirin başka bir
 * yerinden çekiyor ve döngüsel bağımlılık oluşuyordu. Bunun yerine bölgeyi
 * uygulama bir kez BURAYA bildirir (`bolgeyiBildir`), ölçüm de onu okur.
 */
let sonBolge: { sehir?: string | null; ilce?: string | null } = {};

/** Bölge değiştiğinde çağrılır — sonraki olaylar bu bölgeyle etiketlenir. */
export function bolgeyiBildir(sehir?: string | null, ilce?: string | null): void {
  sonBolge = { sehir, ilce };
}

export interface OlaySecenek {
  /**
   * Aynı olayın bu oturumda TEKRAR yazılmasına izin ver.
   * Varsayılan `false` (bir kez). Yalnız gerçekten tekrarlanabilir bir adım
   * için açılır — ör. tesis sahibi gün içinde birden çok rezervasyon girer.
   */
  tekrarlanabilir?: boolean;
  /** Sayı/kısa etiket düzeyinde ek bilgi. Kişisel veri KONMAZ. */
  ek?: Record<string, string | number | boolean | null>;
}

/**
 * Bir huni adımını kaydeder.
 *
 * Dönüş yoktur ve `await` edilmez — çağıran akış hiçbir şey beklemez.
 */
export function olayYaz(olay: string, secenek: OlaySecenek = {}): void {
  try {
    if (!gecerliOlaylar.has(olay)) {
      if (import.meta.env.DEV) {
        console.warn(`[ölçüm] Katalogda olmayan olay: "${olay}" — shared/olayKatalogu.ts'e ekle.`);
      }
      return;
    }

    if (!secenek.tekrarlanabilir) {
      if (yazilanlar.has(olay)) return;
      yazilanlar.add(olay);
    }

    // Beklenmez: `void` ile açıkça "sonucu umursamıyoruz" denir.
    void supabase
      .rpc('olay_yaz', {
        p_olay: olay,
        p_oturum_id: OTURUM_ID,
        p_sehir: sonBolge.sehir ?? null,
        p_ilce: sonBolge.ilce ?? null,
        p_platform: platformBul(),
        p_surum: APP_VERSION,
        p_ek: secenek.ek ?? null,
      })
      .then(
        () => { /* başarı sessizdir */ },
        () => { /* başarısızlık da sessizdir — ölçüm akışı bozamaz */ },
      );
  } catch {
    /* ölçüm hiçbir koşulda çağıranı etkilemez */
  }
}

/** Testler ve ekran geçişleri için: "bir kez yaz" hafızasını sıfırlar. */
export function olcumHafizasiniSifirla(): void {
  yazilanlar.clear();
}

/** Testler için görünürlük — üretimde kullanılmaz. */
export const OLCUM_OTURUM_ID = OTURUM_ID;
