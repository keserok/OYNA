// ════════════════════════════════════════════════════════════════════════════
// SLOT IZGARASI — TEK KAYNAK (SSOT)
// ----------------------------------------------------------------------------
// Slot süresi TARİFE satırında tanımlıdır (pitch_tariffs.slot_minutes: 60/90/120).
// Sahip/müdür günlük tarifeden süreyi değiştirdiğinde, ızgara her yerde birden
// değişir: sahip takvimi, doluluk özeti, admin paneli ve tüketici ekranı.
//
// Bu modül sunucudaki `get_pitch_slots(pitch, date, court)` fonksiyonunun
// BİREBİR aynı kuralını uygular. İkisi ayrışırsa sahip bir şey görür, kullanıcı
// başka şey görür — o yüzden kural tek yerde tarif edilir ve iki tarafta da
// aynı testlerle korunur.
//
// KURALLAR
//   1. Her tarife KENDİ start_time'ından KENDİ ızgarasını kurar. Gündüz 60,
//      akşam 90 olabilir; ikisi ayrı ızgaradır.
//   2. Pencereye TAMAMI sığmayan artık süre BOŞ bırakılır. 18:00-23:00 aralığı
//      90 dakikayla 3 slot üretir (18:00-19:30, 19:30-21:00, 21:00-22:30);
//      kalan 30 dakika slot olmaz.
//   3. Aynı saati birden çok tarife kapsıyorsa öncelik: tarih-özel > saha-özel
//      > tarife tipi (HOLIDAY > WEEKEND > WEEKDAY > SPECIAL). Kazanan tarifenin
//      ürettiği slot, daha düşük öncelikli tarifenin slotunu ezer.
//   4. Tarife hiç yoksa çalışma saatlerinden 60 dakikalık ızgara kurulur
//      (eski davranış — tarifesiz tesis boş ekran görmesin).
// ════════════════════════════════════════════════════════════════════════════

export const ALLOWED_SLOT_MINUTES = [60, 90, 120] as const;
export type SlotMinutes = (typeof ALLOWED_SLOT_MINUTES)[number];
export const DEFAULT_SLOT_MINUTES: SlotMinutes = 60;

/** Sunucudaki pitch_tariffs satırının ızgara için gereken alanları. */
export interface SlotTariffInput {
  id?: string;
  tariff_type?: string | null;
  applies_to_days?: number[] | null;
  start_time: string;
  end_time: string;
  /** Slot başına fiyat (saatlik DEĞİL). */
  slot_price?: number | null;
  /** @deprecated K3 öncesi ad — slot_price yoksa buradan okunur. */
  price_per_hour?: number | null;
  slot_minutes?: number | null;
  deposit_amount?: number | null;
  is_active?: boolean | null;
  court_id?: string | null;
  valid_on?: string | null;
}

export interface GridSlot {
  /** 'HH:MM' */
  startTime: string;
  /** 'HH:MM' — gece yarısını aşarsa ertesi günün saati (ör. '00:30'). */
  endTime: string;
  minutes: number;
  price: number;
  deposit: number;
  tariffId?: string;
  /** Slot ertesi güne taşıyor mu (23:00 + 90dk gibi). */
  crossesMidnight: boolean;
}

const TARIFF_PRIORITY: Record<string, number> = {
  HOLIDAY: 1,
  WEEKEND: 2,
  WEEKDAY: 3,
  SPECIAL: 4,
};

export function normalizeHM(t: string | null | undefined): string {
  const raw = String(t ?? '').trim().replace('.', ':');
  const [h = '00', m = '00'] = raw.split(':');
  return `${h.padStart(2, '0')}:${m.slice(0, 2).padStart(2, '0')}`;
}

export function hmToMinutes(t: string): number {
  const [h, m] = normalizeHM(t).split(':').map(Number);
  return (Number.isFinite(h) ? h : 0) * 60 + (Number.isFinite(m) ? m : 0);
}

export function minutesToHM(total: number): string {
  const wrapped = ((total % 1440) + 1440) % 1440;
  const h = Math.floor(wrapped / 60);
  const m = wrapped % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/** ISO hafta günü: 1 = Pazartesi … 7 = Pazar */
export function isoDayOfWeek(dateISO: string): number {
  const [y, mo, d] = String(dateISO).split('-').map(Number);
  const date = new Date(y, (mo ?? 1) - 1, d ?? 1);
  return ((date.getDay() + 6) % 7) + 1;
}

/** Aralık dışı/okunamayan süreleri varsayılana çeker — ızgara asla kilitlenmez. */
export function normalizeSlotMinutes(v: unknown): SlotMinutes {
  const n = typeof v === 'number' ? v : parseInt(String(v ?? ''), 10);
  return (ALLOWED_SLOT_MINUTES as readonly number[]).includes(n)
    ? (n as SlotMinutes)
    : DEFAULT_SLOT_MINUTES;
}

function tariffPrice(t: SlotTariffInput): number {
  const v = t.slot_price ?? t.price_per_hour ?? 0;
  return Number(v) || 0;
}

/** Sunucudaki ORDER BY ile aynı sıra: tarih-özel > saha-özel > tip > başlangıç. */
function sortTariffs(list: SlotTariffInput[], courtId?: string | null): SlotTariffInput[] {
  return [...list].sort((a, b) => {
    const va = a.valid_on ? 0 : 1;
    const vb = b.valid_on ? 0 : 1;
    if (va !== vb) return va - vb;
    const ca = a.court_id && a.court_id === courtId ? 0 : 1;
    const cb = b.court_id && b.court_id === courtId ? 0 : 1;
    if (ca !== cb) return ca - cb;
    const ta = TARIFF_PRIORITY[String(a.tariff_type ?? 'SPECIAL')] ?? 9;
    const tb = TARIFF_PRIORITY[String(b.tariff_type ?? 'SPECIAL')] ?? 9;
    if (ta !== tb) return ta - tb;
    return hmToMinutes(a.start_time) - hmToMinutes(b.start_time);
  });
}

/** Verilen tarih ve kort için geçerli tarifeler. */
export function activeTariffsFor(
  tariffs: SlotTariffInput[] | null | undefined,
  dateISO: string,
  courtId?: string | null,
): SlotTariffInput[] {
  const dow = isoDayOfWeek(dateISO);
  return (tariffs ?? []).filter((t) => {
    if (t.is_active === false) return false;
    const days = t.applies_to_days ?? [1, 2, 3, 4, 5];
    if (!days.includes(dow)) return false;
    if (t.court_id && courtId && t.court_id !== courtId) return false;
    if (t.valid_on && t.valid_on !== dateISO) return false;
    return true;
  });
}

/**
 * Tarifelerden slot ızgarasını üretir.
 *
 * `fallbackWorkingHours` yalnız HİÇ tarife yoksa kullanılır: tarifesiz tesiste
 * kullanıcı boş ekran görmesin diye çalışma saatlerinden 60 dakikalık ızgara
 * kurulur.
 */
export function buildSlotGrid(
  tariffs: SlotTariffInput[] | null | undefined,
  dateISO: string,
  courtId?: string | null,
  fallbackWorkingHours?: { open?: string; close?: string; slotDuration?: number } | null,
): GridSlot[] {
  const active = activeTariffsFor(tariffs, dateISO, courtId);

  if (active.length === 0) {
    if (!fallbackWorkingHours) return [];
    const openM = hmToMinutes(fallbackWorkingHours.open ?? '08:00');
    let closeM = hmToMinutes(fallbackWorkingHours.close ?? '02:00');
    if (closeM <= openM) closeM += 1440;
    const step = normalizeSlotMinutes(fallbackWorkingHours.slotDuration ?? DEFAULT_SLOT_MINUTES);
    const out: GridSlot[] = [];
    for (let m = openM; m + step <= closeM; m += step) {
      out.push({
        startTime: minutesToHM(m),
        endTime: minutesToHM(m + step),
        minutes: step,
        price: 0,
        deposit: 0,
        crossesMidnight: m + step >= 1440,
      });
    }
    return out;
  }

  // Öncelik sırasına göre üret; daha önce doldurulmuş başlangıç saatini ezme.
  const byStart = new Map<number, GridSlot>();
  for (const t of sortTariffs(active, courtId)) {
    const startM = hmToMinutes(t.start_time);
    const endRaw = normalizeHM(t.end_time);
    // '00:00' bitiş = gün sonu (24:00). Gece yarısını aşan pencere desteklenir.
    let endM = endRaw === '00:00' ? 1440 : hmToMinutes(endRaw);
    if (endM <= startM) endM += 1440;

    const step = normalizeSlotMinutes(t.slot_minutes);
    const price = tariffPrice(t);
    const deposit = Number(t.deposit_amount ?? 0) || 0;

    // Kural 2: yalnız TAMAMI pencereye sığan slot üretilir.
    for (let m = startM; m + step <= endM; m += step) {
      if (byStart.has(m)) continue; // yüksek öncelikli tarife burayı zaten aldı
      byStart.set(m, {
        startTime: minutesToHM(m),
        endTime: minutesToHM(m + step),
        minutes: step,
        price,
        deposit,
        tariffId: t.id,
        crossesMidnight: m + step >= 1440,
      });
    }
  }

  return [...byStart.entries()].sort((a, b) => a[0] - b[0]).map(([, s]) => s);
}

/** Bir günün toplam slot sayısı — doluluk oranının PAYDASI. */
export function slotCountForDate(
  tariffs: SlotTariffInput[] | null | undefined,
  dateISO: string,
  courtId?: string | null,
  fallbackWorkingHours?: { open?: string; close?: string; slotDuration?: number } | null,
): number {
  return buildSlotGrid(tariffs, dateISO, courtId, fallbackWorkingHours).length;
}

/**
 * Bir günün SATILABİLİR toplam dakikası — doluluk oranının dürüst PAYDASI.
 *
 * Açık saat sayısı DEĞİL: 18:00-23:00 penceresi 5 saat açıktır ama 90 dakikalık
 * slotlarla yalnız 4.5 saati satılabilir (kalan 30 dakika slot olmaz). Payda
 * açık saat kalırsa tesis her slotu doldursa bile doluluk %90'da takılır.
 */
export function sellableMinutesForDate(
  tariffs: SlotTariffInput[] | null | undefined,
  dateISO: string,
  courtId?: string | null,
  fallbackWorkingHours?: { open?: string; close?: string; slotDuration?: number } | null,
): number {
  return buildSlotGrid(tariffs, dateISO, courtId, fallbackWorkingHours)
    .reduce((acc, s) => acc + s.minutes, 0);
}

/** Rezervasyon bir slotu kapatıyor mu (kısmi çakışma da sayılır). */
export function bookingCoversSlot(
  bookingStart: string,
  bookingEnd: string,
  slot: Pick<GridSlot, 'startTime' | 'endTime'>,
): boolean {
  const bs = hmToMinutes(bookingStart);
  let be = hmToMinutes(bookingEnd);
  if (be <= bs) be += 1440;
  const ss = hmToMinutes(slot.startTime);
  let se = hmToMinutes(slot.endTime);
  if (se <= ss) se += 1440;
  return ss < be && se > bs;
}

/** Ekranda gösterilecek etiket: '20:00 - 21:30' */
export function slotLabel(slot: Pick<GridSlot, 'startTime' | 'endTime'>): string {
  return `${normalizeHM(slot.startTime)} - ${normalizeHM(slot.endTime)}`;
}

/**
 * Slot etiketinden ('20:00 - 21:30') süreyi dakika olarak çıkarır.
 *
 * Saha vitrini saati etiket olarak taşıyor; maçın süresi de bu slottan gelmeli
 * (sahayı 90 dakika kiraladıysan maç 90 dakikadır). Etiket tek saat taşıyorsa
 * ya da okunamazsa varsayılan 60 döner — ızgara asla kilitlenmez.
 */
export function slotMinutesFromLabel(label: string): SlotMinutes {
  const parts = String(label ?? '').replace(/\./g, ':').match(/\d{1,2}:\d{2}/g);
  if (!parts || parts.length < 2) return DEFAULT_SLOT_MINUTES;
  const start = hmToMinutes(parts[0]);
  let end = hmToMinutes(parts[1]);
  if (end <= start) end += 1440; // gece yarısını aşan slot
  return normalizeSlotMinutes(end - start);
}

/**
 * Fiyatın hangi süre için olduğunu söyleyen etiket: '/ saat', '/ 1,5 saat',
 * '/ 2 saat'. Slot süresi 60 dakikadan farklıyken "/ saat" yazmak yalan olurdu
 * (sahibi 90 dakikalık tarife kurduysa fiyat 90 dakikanındır).
 */
export function slotPriceUnitLabel(minutes: number | null | undefined): string {
  const m = normalizeSlotMinutes(minutes);
  if (m === 60) return '/ saat';
  if (m === 90) return '/ 1,5 saat';
  return `/ ${m / 60} saat`;
}
