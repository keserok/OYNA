// ─── Para biçimi — TEK KAYNAK ───────────────────────────────────────────────
//
// IP-19 · Kullanıcı kararları. Aynı tutar üç ayrı yazımda çıkıyordu ve kullanıcı
// TEK bir akışta üçünü birden görüyordu:
//
//     Sahalar   →  ₺2000        (sembol başta, ayraçsız)
//     Ödeme     →  2.000,00₺    (hep iki ondalık)
//     Profil    →  2.000 ₺      (boşluklu)
//
// KANONİK BİÇİM:  `2.000₺`  ·  kuruş varsa  `299,90₺`  ·  değer yoksa  `—`
//
//   1. Sembol SONDA, BOŞLUKSUZ. (Kod tabanındaki 218 kullanımın 157'si zaten böyleydi.)
//   2. Tam sayıda ondalık YOK; kuruş varsa 2 hane. "2.000,00₺" gereksiz gürültü,
//      "299,9₺" ise eksik okunuyor.
//   3. Sıfır fiyat rakamla değil kelimeyle: `Ücretsiz`. "0₺" bedavayı anlatmıyor.
//   4. Değer yoksa `—`. "0₺" göstermek yalan olur: bilinmiyor ile sıfır aynı şey değil.
//
// Rakamlar `font-numeric` sınıfıyla çizilir (index.css) — o sınıf `tabular-nums`
// taşır, böylece alt alta gelen tutarlar hizalanır.

/** Sayı geçerli mi? `null`/`undefined`/`NaN`/`Infinity` hepsi geçersizdir. */
const gecerli = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n);

/** Kuruş taşıyor mu? (0,004 gibi kayan nokta artıkları kuruş sayılmaz.) */
const kurusVar = (n: number): boolean => Math.round(n * 100) % 100 !== 0;

/** Tam biçim: her zaman 2 ondalık — "1.500,00". (₺ işaretini çağıran ekler.) */
export const formatTRY = (n: number): string =>
  (gecerli(n) ? n : 0).toLocaleString('tr-TR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

/** Tam sayı biçim: ondalıksız — hızlı-seçim çipleri, tutar girişleri ("1.500"). */
export const formatTRYInt = (n: number): string =>
  (gecerli(n) ? n : 0).toLocaleString('tr-TR', { maximumFractionDigits: 0 });

// `formatTRYWithSymbol` (daima "1.500,00₺") SİLİNDİ. İkinci bir GÖRÜNÜR biçim
// üretiyordu ve bu paketin tek amacı buydu: kullanıcı aynı akışta "2.000₺" ile
// "2.000,00₺" arasında gidip geliyordu. Tam sayıda ondalık istenen bir yer
// çıkmadı; çıkarsa `formatTRY` gövdesi zaten burada duruyor.

/**
 * ⭐ KANONİK GÖSTERİM — uygulamanın varsayılanı budur.
 *
 *     2000    → "2.000₺"
 *     299.9   → "299,90₺"
 *     0       → "Ücretsiz"
 *     null    → "—"
 *
 * `sifirEtiketi` ile sıfırın karşılığı değiştirilebilir (ör. muhasebe
 * satırında "Ücretsiz" değil "0₺" istenebilir).
 */
export const formatTRYShort = (
  n: number | null | undefined,
  opts?: { sifirEtiketi?: string },
): string => {
  if (!gecerli(n)) return '—';
  if (n === 0) return opts?.sifirEtiketi ?? 'Ücretsiz';
  return kurusVar(n) ? `${formatTRY(n)}₺` : `${formatTRYInt(n)}₺`;
};

/**
 * ⭐ TUTAR/BAKİYE — muhasebe bağlamı. Tek farkı sıfırın karşılığı:
 *
 *     0  → "0₺"      (bakiyen sıfır — "Ücretsiz" burada anlamsız)
 *
 * Fiyat gösteriyorsan `formatTRYShort`, bakiye/kesinti/kazanç gösteriyorsan
 * bunu kullan. Ayrım kelimenin doğruluğu içindir: bir saha "ücretsiz"
 * olabilir, bir cüzdan olamaz.
 */
export const formatTRYAmount = (n: number | null | undefined): string =>
  formatTRYShort(n, { sifirEtiketi: '0₺' });

/**
 * İşaretli tutar — cüzdan hareketleri. Giren para `+`, çıkan para `−`
 * (U+2212 matematiksel eksi; kısa çizgi değil). İşaret TEK BAŞINA yeterli
 * değildir, renk ile birlikte kullanılır.
 */
export const formatTRYSigned = (n: number | null | undefined, income: boolean): string => {
  if (!gecerli(n)) return '—';
  return `${income ? '+' : '−'}${formatTRYAmount(Math.abs(n))}`;
};
