// ─── Ortak Türkçe tarih/saat biçimleri (kurucu kararı, 9 Ağu 2026) ──────────
// Denetim bulgusu 25: ekranlar ham ISO ("2026-08-12") ve "18:00:00" basıyordu.
// Standart: LİSTELERDE kısa ("12 Ağu Çar"), detay/onay ekranlarında uzun
// ("12 Ağustos Çarşamba"). Bozuk girişte çökmek yerine girdiyi aynen döndürür.

const parseISO = (iso: string | null | undefined): Date | null => {
  if (!iso) return null;
  const d = new Date(`${String(iso).slice(0, 10)}T00:00:00`);
  return Number.isNaN(d.getTime()) ? null : d;
};

/** "12 Ağu Çar" — liste satırları için kısa Türkçe tarih. */
export const tarihKisaTR = (iso: string | null | undefined): string => {
  const d = parseISO(iso);
  if (!d) return iso ?? '—';
  return d.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short', weekday: 'short' });
};

/** "12 Ağustos Çarşamba" — detay ve onay ekranları için uzun Türkçe tarih. */
export const tarihUzunTR = (iso: string | null | undefined): string => {
  const d = parseISO(iso);
  if (!d) return iso ?? '—';
  return d.toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', weekday: 'long' });
};

/** "18:00:00" / "18:00" → "18:00". */
export const saatTR = (t: string | null | undefined): string =>
  (t ? String(t).slice(0, 5) : '—');
