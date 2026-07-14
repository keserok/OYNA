// Tüm oyuncu-tarafı para gösterimi için tek biçim kaynağı.
// Ekranlar arası tutarsızlığı önler ("1.500₺" vs "1.500,00₺").
// Kanonik biçim: binlik ayraç + iki ondalık + ₺ soneki → "1.500,00₺".

export interface FormatTRYOptions {
  /** Kuruşu her zaman göster (varsayılan true). false → tam sayıda ondalık gizler. */
  decimals?: boolean;
  /** ₺ sonekini ekle (varsayılan true). */
  symbol?: boolean;
}

/**
 * TL tutarını Türkçe yerelinde biçimler. `null`/`undefined`/`NaN` → "—".
 * amount kuruş değil, TL cinsindendir (ör. 1500 → "1.500,00₺").
 */
export function formatTRY(
  amount: number | null | undefined,
  opts: FormatTRYOptions = {},
): string {
  const { decimals = true, symbol = true } = opts;
  if (amount == null || !Number.isFinite(amount)) return '—';
  const body = amount.toLocaleString('tr-TR', {
    minimumFractionDigits: decimals ? 2 : 0,
    maximumFractionDigits: decimals ? 2 : 0,
  });
  return symbol ? `${body}₺` : body;
}
