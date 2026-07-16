// ─── Para biçimi — TEK KAYNAK (C10) ─────────────────────────────────────────
// Tüm para ekranları bunu kullanır; "1.500,00₺" vs "1.500₺" tutarsızlığı biter.
// Kanonik: formatTRY ham gövde döner (₺ YOK); ₺ soneki *WithSymbol ile eklenir.

/** Tam biçim: her zaman 2 ondalık — "1.500,00". (₺ işaretini çağıran ekler.) */
export const formatTRY = (n: number): string =>
  (Number.isFinite(n) ? n : 0).toLocaleString('tr-TR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

/** Tam sayı biçim: ondalıksız — hızlı-seçim çipleri, tutar girişleri ("1.500"). */
export const formatTRYInt = (n: number): string =>
  (Number.isFinite(n) ? n : 0).toLocaleString('tr-TR', { maximumFractionDigits: 0 });

/**
 * ₺ ekli kısayol: "1.500,00₺". `null`/`undefined`/`NaN` → "—" (dürüst boşluk;
 * "—₺" değil). Ücret/tutar gösterimlerinde değer olmayabiliyorsa bunu kullan.
 */
export const formatTRYWithSymbol = (n: number | null | undefined): string =>
  (typeof n === 'number' && Number.isFinite(n)) ? `${formatTRY(n)}₺` : '—';
