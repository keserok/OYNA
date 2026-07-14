// Maç tarih+saat metinlerini güvenle Date'e çeviren tek ayrıştırma kaynağı.
//
// Eski kod (hooks/useMyMatches.ts) yalnız ISO ("2026-05-18") ve "Yarın"ı
// tanıyordu; "18.05.2026" veya TR gün adları bugüne çöküyor, "22:00 - 23:00"
// gibi saat aralıkları `Number("00 - 23")` = NaN üretiyordu. Bu util:
//  - ISO (yyyy-mm-dd), gün.ay.yıl (dd.mm.yyyy), bileşik ("Bugün • 02.11.2026")
//  - göreli sözcükler (bugün/yarın + TR gün adları)
//  - saat aralıklarından başlangıç saatini
//  destekler ve ASLA NaN'lı Date döndürmez (belirsizse null).

const TR_WEEKDAYS = [
  'pazar', 'pazartesi', 'salı', 'çarşamba', 'perşembe', 'cuma', 'cumartesi',
]; // Date.getDay() index sırası

const lower = (s: string) => s.toLocaleLowerCase('tr-TR');

/** "22:00 - 23:00" / "22.00" / "22:00" → {h,m} (ilk geçerli saat). Yoksa null. */
export function parseTimeToken(time: string | null | undefined): { h: number; m: number } | null {
  if (!time) return null;
  const match = String(time).match(/(\d{1,2})[:.](\d{2})/);
  if (!match) return null;
  const h = Number(match[1]);
  const m = Number(match[2]);
  if (!Number.isFinite(h) || !Number.isFinite(m) || h > 23 || m > 59) return null;
  return { h, m };
}

/**
 * date + time metnini Date'e çevirir. `now` test edilebilirlik için enjekte
 * edilebilir (varsayılan: şimdi). Belirsiz/geçersizse null.
 */
export function parseMatchDateTime(
  date: string | null | undefined,
  time: string | null | undefined,
  now: Date = new Date(),
): Date | null {
  if (!date) return null;
  const t = parseTimeToken(time) ?? { h: 0, m: 0 };
  const raw = String(date);

  // 1) Açık gün.ay.yıl (bileşik metinde bile: "Bugün • 02.11.2026")
  const dmy = raw.match(/(\d{1,2})\.(\d{1,2})\.(\d{4})/);
  if (dmy) {
    const [, d, mo, y] = dmy;
    const dt = new Date(Number(y), Number(mo) - 1, Number(d), t.h, t.m, 0, 0);
    return Number.isNaN(dt.getTime()) ? null : dt;
  }

  // 2) ISO yyyy-mm-dd
  const iso = raw.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (iso) {
    const [, y, mo, d] = iso;
    const dt = new Date(Number(y), Number(mo) - 1, Number(d), t.h, t.m, 0, 0);
    return Number.isNaN(dt.getTime()) ? null : dt;
  }

  // 3) Göreli sözcükler
  const l = lower(raw);
  const base = new Date(now.getFullYear(), now.getMonth(), now.getDate(), t.h, t.m, 0, 0);
  if (l.includes('bugün')) return base;
  if (l.includes('yarın')) {
    base.setDate(base.getDate() + 1);
    return base;
  }
  // TR gün adı → bugünden itibaren o günün ilk gelişi (bugün dahil).
  // En UZUN eşleşen ad seçilir: "pazartesi" içinde "pazar", "cumartesi"
  // içinde "cuma" geçtiği için kısa ad yanlışlıkla önce eşleşmemeli.
  let wdIndex = -1;
  let bestLen = 0;
  TR_WEEKDAYS.forEach((w, i) => {
    if (l.includes(w) && w.length > bestLen) {
      wdIndex = i;
      bestLen = w.length;
    }
  });
  if (wdIndex >= 0) {
    const diff = (wdIndex - base.getDay() + 7) % 7;
    base.setDate(base.getDate() + diff);
    return base;
  }

  return null;
}
