// ─── Para biçimi — TEK KAYNAK (C10) ─────────────────────────────────────────
// Tüm para ekranları bunu kullanır; "1.500,00₺" vs "1.500₺" tutarsızlığı biter.
// Para değişmezi P3: tutar biçimi tek yerden gelir.

/** Tam biçim: her zaman 2 ondalık — "1.500,00". (₺ işaretini çağıran ekler.) */
export const formatTRY = (n: number): string =>
  (Number.isFinite(n) ? n : 0).toLocaleString('tr-TR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

/** Tam sayı biçim: ondalıksız — hızlı-seçim çipleri, tutar girişleri ("1.500"). */
export const formatTRYInt = (n: number): string =>
  (Number.isFinite(n) ? n : 0).toLocaleString('tr-TR', { maximumFractionDigits: 0 });

/** ₺ ekli kısayol: "1.500,00₺". */
export const formatTRYWithSymbol = (n: number): string => `${formatTRY(n)}₺`;
