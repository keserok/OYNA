/**
 * IP-13 — Türkçe büyük harf dönüşümünün TEK kaynağı.
 *
 * Neden var: JavaScript'in `toUpperCase()` metodu İngilizce kurallarını
 * uygular ve Türkçenin noktalı/noktasız `i` ayrımını bozar:
 *
 *     'Gizlilik Politikası'.toUpperCase()              → 'GIZLILIK POLITIKASI'   ✗
 *     'Gizlilik Politikası'.toLocaleUpperCase('tr-TR') → 'GİZLİLİK POLİTİKASI'   ✓
 *     'Nisan'  → 'NISAN'  ✗   |  'NİSAN'  ✓
 *     'Çiğli'  → 'ÇIĞLI'  ✗   |  'ÇİĞLİ'  ✓
 *     'irem'   → 'IR'     ✗   |  'İR'     ✓   (baş harf rozetleri)
 *
 * Ölçüm: 8 hukuki belge başlığının 6'sı, ilçe adları, ay adları ve tüm isim
 * baş harfleri yanlış yazılıyordu.
 *
 * ⚠️ TEKNİK VERİDE KULLANMA. IBAN, davet kodu, işlem numarası, enum değeri ve
 * kart markası gibi ASCII alanlarda Türkçe locale ZARARLIDIR: `i` harfini
 * ASCII olmayan `İ`'ye çevirir ve doğrulama/karşılaştırma bozulur. Oralarda
 * düz `.toUpperCase()` DOĞRU olandır — bu yüzden repoda bilerek duruyorlar.
 */

/** Türkçe metni büyütür. Kullanıcıya GÖRÜNEN her metin bunu kullanır. */
export const trUpper = (s: string | null | undefined): string =>
  (s ?? '').toLocaleUpperCase('tr-TR');

/** Türkçe metni küçültür (`I` → `ı`, `İ` → `i`). */
export const trLower = (s: string | null | undefined): string =>
  (s ?? '').toLocaleLowerCase('tr-TR');

/** İlk harfi büyük, gerisi olduğu gibi: `ciddi` → `Ciddi`, `ısrarlı` → `Israrlı`. */
export const trCapitalize = (s: string | null | undefined): string => {
  const v = s ?? '';
  return v ? trUpper(v.charAt(0)) + v.slice(1) : '';
};

/**
 * Ad soyaddan baş harf rozeti: `irem yılmaz` → `İY` (en fazla 2 harf).
 *
 * `bos`: ad hiç yoksa basılacak karakter. Varsayılan `?`; avatar yuvarlağı
 * gibi kimlik göstermeyen yerlerde `•` geçilir — orada soru işareti kullanıcıya
 * "bir şey ters gitti" dedirtiyor, oysa yalnızca ad henüz girilmemiştir.
 *
 * Baş harf üretimi TEK yerde: eskiden altı dosyada altı ayrı kopyası vardı ve
 * ikisi `toUpperCase()` kullandığı için `irem` → `IR` yazıyordu.
 */
export const trInitials = (
  name: string | null | undefined,
  max = 2,
  bos = '?',
): string => {
  const parts = (name ?? '').trim().split(/\s+/).filter(Boolean).slice(0, max);
  const out = parts.map((w) => trUpper(w.charAt(0))).join('');
  return out || bos;
};
