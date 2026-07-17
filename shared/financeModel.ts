// ─── FI-1 — Saf finans modeli (UI'dan bağımsız, unit-testli) ─────────────────
// Dönem matematiği, kıyas %, günlük seri doldurma, etiketler. Para biçimlemesi
// utils/formatTRY'de; burada yalnız sayısal/etiket dönüşümleri.

export interface GrowthResult {
  /** Yüzde değişim (yuvarlanmış). prev=0 iken null (kıyas anlamsız). */
  pct: number | null;
  direction: 'up' | 'down' | 'flat';
}

/**
 * current vs prev yüzde değişimi. Yön DAİMA delta = (current − prev) işaretinden
 * türetilir; büyüklük |delta| / |prev|. Böylece prev NEGATİF (geçen ay zarar) iken
 * yön ters dönmez: zarardan kâra veya küçülen zarar → up (iyileşme).
 * prev 0 → yüzde tanımsız (pct null); yön current işaretinden.
 */
export function growthPercent(current: number, prev: number): GrowthResult {
  const delta = current - prev;
  if (prev === 0) {
    if (current === 0) return { pct: 0, direction: 'flat' };
    return { pct: null, direction: current > 0 ? 'up' : 'down' };
  }
  const pct = Math.round((delta / Math.abs(prev)) * 100);
  return { pct, direction: delta > 0 ? 'up' : delta < 0 ? 'down' : 'flat' };
}

/**
 * Türkçe biçimli tutar metnini sayıya çevirir. ',' ondalık, '.' binlik:
 * "2.700"→2700, "150,50"→150.5, "1.500,50"→1500.5, "2,5"→2.5. Geçersiz → NaN.
 * Locale-duyarsız parseFloat "2.700"→2.7 hatasını kapatır (veresiye/gider girişi).
 */
export function parseTRYAmount(raw: string): number {
  if (raw == null) return NaN;
  let s = String(raw).trim().replace(/[₺\s]/g, '');
  if (s === '') return NaN;
  if (s.includes(',')) {
    // ',' ondalık → '.' binlikleri at, ',' → '.'
    s = s.replace(/\./g, '').replace(',', '.');
  } else {
    const parts = s.split('.');
    if (parts.length > 2) {
      s = parts.join(''); // çok nokta → binlik gruplaması
    } else if (parts.length === 2) {
      // tek nokta: 3 hane sonrası → binlik (2.700=2700); değilse ondalık (2.5=2.5)
      s = parts[1].length === 3 ? parts.join('') : s;
    }
  }
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : NaN;
}

/** 'YYYY-MM' → sonraki/önceki ay ('YYYY-MM'). delta gün değil AY. */
export function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split('-').map(Number);
  const base = (y * 12 + (m - 1)) + delta;
  const ny = Math.floor(base / 12);
  const nm = (base % 12) + 1;
  return `${ny}-${String(nm).padStart(2, '0')}`;
}

const TR_MONTHS = [
  'Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran',
  'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık',
];

/** '2026-07' → 'Temmuz 2026'. */
export function monthLabel(month: string): string {
  const [y, m] = month.split('-').map(Number);
  return `${TR_MONTHS[m - 1] ?? '?'} ${y}`;
}

/** ay a, ay b'den ileride mi? (sonraki-ay okunu kilitlemek için) */
export function isMonthAfter(a: string, b: string): boolean {
  return a > b; // 'YYYY-MM' leksikografik = kronolojik
}

export interface DayBar {
  date: string;   // YYYY-MM-DD
  day: number;    // ayın günü 1-31
  collected: number;
}

/**
 * Ayın HER gününü içeren seri (eksik günler 0). Grafik ekseni tutarlı olsun diye.
 * daily: RPC'nin seyrek [{date,collected}] çıktısı. month: 'YYYY-MM'.
 */
export function buildMonthSeries(daily: { date: string; collected: number }[], month: string): DayBar[] {
  const map = new Map(daily.map((d) => [d.date, Number(d.collected) || 0]));
  const [y, m] = month.split('-').map(Number);
  const days = new Date(y, m, 0).getDate(); // ayın gün sayısı
  const out: DayBar[] = [];
  for (let d = 1; d <= days; d++) {
    const iso = `${month}-${String(d).padStart(2, '0')}`;
    out.push({ date: iso, day: d, collected: map.get(iso) ?? 0 });
  }
  return out;
}

/** value / total → yüzde (0-100, yuvarlanmış). total 0 → 0. */
export function sharePercent(value: number, total: number): number {
  if (total <= 0) return 0;
  return Math.min(100, Math.round((value / total) * 100));
}

const METHOD_LABELS: Record<string, string> = {
  CASH: 'Nakit',
  CARD: 'Kredi Kartı',
  BANK_TRANSFER: 'Havale/EFT',
  OYNA_WALLET: 'OYNA Cüzdan',
  UNSPECIFIED: 'Yöntemi belirtilmemiş',
};
export function methodLabel(method: string): string {
  return METHOD_LABELS[method] ?? method;
}

const SOURCE_LABELS: Record<string, string> = {
  APP_BOOKING: 'Uygulama',
  OWNER_MANUAL: 'Elle',
  SUBSCRIPTION: 'Abonman',
  APP_MATCH: 'Maç',
};
export function sourceLabel(source: string): string {
  return SOURCE_LABELS[source] ?? source;
}

// ─── FI-4 — CSV dışa aktarım (Excel-TR uyumlu) ───────────────────────────────

export interface CsvRow {
  type: string;        // ÖDEME | GİDER | VERESİYE | BEKLEYEN
  date: string;
  description: string;
  detail: string;      // yöntem/kategori
  amount: number;      // gelir + , gider/borç − işaretiyle çağıran verir
}

/** Excel-TR hücre kaçışı: ; ayraç, " içinde " → "". */
function csvCell(v: string | number): string {
  const s = String(v ?? '');
  return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Tutarı TR-ondalık (virgül), binliksiz: 1500.5 → "1500,5". */
function csvAmount(n: number): string {
  return (Number.isFinite(n) ? n : 0).toString().replace('.', ',');
}

/**
 * Finans hareketlerini UTF-8 BOM'lu, ';' ayraçlı CSV'ye çevirir (Excel-TR).
 * Satır tipleri çağıran tarafından hazır verilir; bu fonksiyon yalnız biçimler.
 */
export function buildFinanceCsv(month: string, rows: CsvRow[]): string {
  const header = ['Tür', 'Tarih', 'Açıklama', 'Kategori/Yöntem', 'Tutar (₺)'];
  const lines = [header.map(csvCell).join(';')];
  for (const r of rows) {
    lines.push([
      csvCell(r.type), csvCell(r.date), csvCell(r.description), csvCell(r.detail), csvAmount(r.amount),
    ].join(';'));
  }
  // BOM → Excel UTF-8 Türkçe karakterleri doğru okur.
  return '﻿' + lines.join('\r\n') + '\r\n';
}
