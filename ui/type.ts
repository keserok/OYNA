// ════════════════════════════════════════════════════════════════════════════
// IP-08 — TİPOGRAFİ ÖLÇEĞİ · TEK KAYNAK
// ════════════════════════════════════════════════════════════════════════════
//
// NEDEN VAR: Bu dosyadan önce uygulamada punto ölçeği YOKTU. 33 ayrı arbitrary
// punto (`text-[6px]`'ten `text-[46px]`'e) 1764 yerde serpiştirilmişti; aynı
// hiyerarşideki iki etiket bir ekranda 9px, diğerinde 11px çiziliyordu.
//
// NEDEN rem, px DEĞİL: `text-[10px]` sabit pikseldir — kullanıcı telefonunun
// yazı boyutunu büyüttüğünde (iOS Dynamic Type / Android font-scale / tarayıcı
// zoom) DEĞİŞMEZ. Gözü iyi görmeyen kullanıcı ayarı büyütür, uygulama aynı
// kalır. rem kök punto ile ölçeklenir → WCAG 1.4.4 (Resize Text) karşılanır.
// Aşağıdaki px karşılıkları 16px kök içindir; kullanıcı ayarını büyütürse
// hepsi orantılı büyür.
//
// TABAN KURALI (ürün kararı): En küçük OKUNUR metin 11px (`caption`).
// 10px (`microLabel`) YALNIZ büyük harf + harf aralıklı etiketler içindir —
// büyük harf x-yüksekliği olmadığı ve tracking harfleri ayırdığı için o
// bağlamda okunur kalır. Cümle içinde ASLA kullanılmaz.
//
// SATIR ARALIĞI: Punto büyüdükçe oransal satır aralığı KÜÇÜLÜR (28px başlıkta
// 1.07, 11px metinde 1.36). Büyük puntoda geniş aralık başlığı dağıtır, küçük
// puntoda dar aralık okumayı zorlaştırır.
//
// HARF ARALIĞI: Büyük puntolarda negatif (harfler zaten geniş görünür),
// büyük harf etiketlerde pozitif (bitişik büyük harfler ayrışmalı).
//
// KULLANIM:
//   import { type_ } from '../ui/type';
//   <p className={`${type_.body} text-ink-3`}>…</p>
//
// RENK: Bu dosya punto/aralık tanımlar, RENK TANIMLAMAZ. Metin renkleri
// `index.css` @theme içindeki mürekkep merdivenidir (`text-ink` … `text-ink-4`);
// dördü de kart zemininde AA geçer.
// ════════════════════════════════════════════════════════════════════════════

// ── ANA SAYFA BASAMAKLARI (2026-08 · onaylı tasarım) ────────────────────────
// Ölçek 10 basamaktan 18'e çıktı. Bu bir gevşeme DEĞİL, kayıt altına almadır:
// onaylı ana sayfa tasarımı bu sekiz puntoyu kullanıyor ve kural şu —
// "tabloda yoksa tabloya ekle", ekranda serbest `text-[Npx]` bırakma.
// Yeni basamaklar aşağıda `· ana sayfa` işaretiyle durur; ekleyen tasarımı
// belli olsun ki bir sonraki oturum "bunlar nereden çıktı" demesin.
//
// 11.5 ve 12.5 kasıtlıdır (yarım piksel). Tasarımda maç kartının alt satırı
// (mesafe, gün) ile maçlarım kutusunun geri sayımı komşu puntolardan bir tık
// ayrılsın diye böyle çizildi; 12'ye ya da 13'e yuvarlamak iki satırı eşitler
// ve hiyerarşi kaybolur.

export const type_ = {
  /**
   * 10px — YALNIZ `uppercase` + tracking ile. Rozet, birim etiketi (GÜN/SAAT),
   * bölüm üst başlığı. Cümle metni için KULLANILMAZ; onun tabanı `caption`.
   */
  microLabel: 'text-[0.625rem] leading-[0.75rem] tracking-[0.08em] uppercase',

  /** 11px — okunur metnin ALT SINIRI. Yardım satırı, ikincil rozet metni. */
  caption: 'text-[0.6875rem] leading-[0.9375rem]',

  /** 11.5px · ana sayfa — maçlarım kutusundaki "3 saat kaldı" geri sayımı. */
  captionLg: 'text-[0.71875rem] leading-[0.9375rem]',

  /** 12px — dipnot, meta bilgi, liste alt satırı. */
  footnote: 'text-[0.75rem] leading-[1rem]',

  /** 12.5px · ana sayfa — maç kartı alt satırı (gün, mesafe), takım adı. */
  footnoteLg: 'text-[0.78125rem] leading-[1rem]',

  /** 13px — yoğun listelerde gövde metni. */
  body: 'text-[0.8125rem] leading-[1.125rem]',

  /** 14px — birincil gövde metni. Uzun açıklamaların varsayılanı. */
  bodyLg: 'text-[0.875rem] leading-[1.25rem]',

  /** 15px · ana sayfa — profil yaşı, yaklaşan maç saati, stüdyo şeridi. */
  bodyXl: 'text-[0.9375rem] leading-[1.078125rem]',

  /** 16px — kart başlığı, satır başlığı. */
  title: 'text-[1rem] leading-[1.375rem] tracking-[-0.01em]',

  /** 18px — bölüm başlığı. */
  titleLg: 'text-[1.125rem] leading-[1.5rem] tracking-[-0.01em]',

  /** 21px · ana sayfa — profil kartındaki kullanıcı adı. */
  titleXl: 'text-[1.3125rem] leading-[1.375rem] tracking-[-0.04em]',

  /** 22px — ekran başlığı. */
  headline: 'text-[1.375rem] leading-[1.625rem] tracking-[-0.02em]',

  /** 25px · ana sayfa — "SAHA KİRALA" kart başlığı. */
  headlineLg: 'text-[1.5625rem] leading-[1.53125rem] tracking-[-0.04em]',

  /** 26px · ana sayfa — cüzdan bakiyesi (maçı olan kullanıcı). */
  amount: 'text-[1.625rem] leading-[1.625rem] tracking-[-0.02em]',

  /** 27px · ana sayfa — "TOP OYNA" hero başlığı. */
  headlineXl: 'text-[1.6875rem] leading-[1.59375rem] tracking-[-0.045em]',

  /** 28px — vurgulanan tutar/rakam, boş durum başlığı. */
  display: 'text-[1.75rem] leading-[1.875rem] tracking-[-0.03em]',

  /** 34px · ana sayfa — cüzdan bakiyesi (maçı olmayan kullanıcı; kutu büyür). */
  amountLg: 'text-[2.125rem] leading-[2.125rem] tracking-[-0.02em]',

  /** 40px — geri sayım rakamı, skor. Ekranda tek başına durur. */
  displayLg: 'text-[2.5rem] leading-[2.5rem] tracking-[-0.04em]',
} as const;

export type TypeStep = keyof typeof type_;

/**
 * Bölüm üst başlığı — tasarımda tekrar eden bileşik desen.
 * (Punto + aralık + ağırlık + renk bir arada; her ekranda elle kurulmasın.)
 */
export const sectionLabel = `${type_.microLabel} font-extrabold text-ink-4`;

/**
 * Ölçeğin px karşılıkları — testler ve denetim içindir, className DEĞİLDİR.
 * Bir basamağı değiştirirsen burayı da güncelle; birim testi ikisini eşler.
 */
export const TYPE_PX: Record<TypeStep, number> = {
  microLabel: 10,
  caption: 11,
  captionLg: 11.5,
  footnote: 12,
  footnoteLg: 12.5,
  body: 13,
  bodyLg: 14,
  bodyXl: 15,
  title: 16,
  titleLg: 18,
  titleXl: 21,
  headline: 22,
  headlineLg: 25,
  amount: 26,
  headlineXl: 27,
  display: 28,
  amountLg: 34,
  displayLg: 40,
};

/** Okunur metnin alt sınırı (px). `microLabel` bunun altındadır ve YALNIZ
 *  büyük harf + tracking bağlamında meşrudur. */
export const READABLE_MIN_PX = 11;
