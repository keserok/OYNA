import type { FlashDeal, PitchAvailabilityException } from '../../types';

export interface TariffLike {
  startTime: string;
  endTime: string;
  price?: number;
  price_per_hour?: number;
  /** Tarifedeki kapora TUTARI (TL). OwnerPricingPolicyModal fiyatın %10–%50'sine sıkıştırır. */
  deposit_amount?: number | null;
  /** null/undefined = tesis geneli; dolu = yalnız o sahaya özel tarife. */
  court_id?: string | null;
  /** ISO gün listesi (1=Pzt … 7=Paz). Verilmezse gün filtresi uygulanmaz. */
  applies_to_days?: number[] | null;
  /** HOLIDAY | WEEKEND | WEEKDAY | SPECIAL — öncelik sıralaması için. */
  tariff_type?: string;
  /** Dolu ise tarife YALNIZ bu tarihte (YYYY-MM-DD) geçerlidir ve o tarihte
   *  her şeye üstün gelir (takvimden girilen özel fiyat). */
  valid_on?: string | null;
}

const TARIFF_TYPE_PRIORITY: Record<string, number> = {
  HOLIDAY: 1,
  WEEKEND: 2,
  WEEKDAY: 3,
  SPECIAL: 4,
};

/** ISO weekday: 1 = Pazartesi … 7 = Pazar */
function isoDow(dateISO: string): number {
  const [y, m, d] = dateISO.split('-').map(Number);
  return ((new Date(y, m - 1, d).getDay() + 6) % 7) + 1;
}

export function slotKeyToTime(key: string): string {
  return key.replace('.', ':');
}

export function normalizeTime(t: string): string {
  const parts = String(t ?? '').split(':');
  const h = parts[0]?.padStart(2, '0') ?? '00';
  const m = (parts[1] ?? '00').padStart(2, '0');
  return `${h}:${m}`;
}

/**
 * Saatin fiyatını GERÇEK tarifeden çözer. Eşleşen tarife yoksa null döner —
 * uydurma varsayılan fiyat (eski 3200/2000 fallback'i) bilinçli olarak yok:
 * tarifesiz saat arayüzde "Tarife yok" olarak gösterilmelidir.
 *
 * Sunucu get_current_tariff_price ile aynı öncelik:
 * 1) Tarih-özel tarife (valid_on = dateISO) her şeye üstün — yalnız o tarihte.
 * 2) Saha-özel (court_id = courtId) tesis-geneline üstün.
 * 3) Tarife tipi önceliği (HOLIDAY>WEEKEND>WEEKDAY>SPECIAL).
 * courtId verilmezse yalnız tesis-geneli satırlar kullanılır; tarih verilmezse
 * tarih-özel satırlar hesaba katılmaz (genel fiyatı bozmasınlar).
 */
export function resolveHourlyPrice(
  hour: number,
  pricingPolicy?: TariffLike[],
  courtId?: string | null,
  dateISO?: string | null,
): number | null {
  const matched = matchTariffForHour(hour, pricingPolicy, courtId, dateISO);
  if (!matched) return null;
  return matched.price ?? matched.price_per_hour ?? null;
}

/** Saatin GEÇERLİ tarifesindeki kapora tutarı (TL). Tarife yoksa veya kapora
 *  tanımlı değilse null — arayüz uydurma varsayılan doldurmaz. */
export function resolveHourlyDeposit(
  hour: number,
  pricingPolicy?: TariffLike[],
  courtId?: string | null,
  dateISO?: string | null,
): number | null {
  const matched = matchTariffForHour(hour, pricingPolicy, courtId, dateISO);
  const d = matched?.deposit_amount;
  return d != null && Number(d) > 0 ? Number(d) : null;
}

/** Fiyat ve kapora AYNI tarifeden okunsun diye eşleşme mantığı tek yerde.
 *  Öncelik zinciri yukarıdaki resolveHourlyPrice yorumunda anlatıldığı gibi. */
function matchTariffForHour(
  hour: number,
  pricingPolicy?: TariffLike[],
  courtId?: string | null,
  dateISO?: string | null,
): TariffLike | null {
  if (!pricingPolicy?.length) return null;
  const dow = dateISO ? isoDow(dateISO) : null;
  const inWindow = (p: TariffLike) => {
    if (!p || typeof p.startTime !== 'string' || typeof p.endTime !== 'string') return false;
    const startH = parseInt(p.startTime.split(':')[0], 10);
    let endH = parseInt(p.endTime.split(':')[0], 10);
    if (Number.isNaN(startH) || Number.isNaN(endH)) return false;
    if (endH === 0) endH = 24;
    if (startH <= endH) return hour >= startH && hour < endH;
    return hour >= startH || hour < endH;
  };
  const isCourt = (p: TariffLike) => p.court_id != null && p.court_id === courtId;
  const isDated = (p: TariffLike) => p.valid_on != null && p.valid_on !== '';
  const candidates = pricingPolicy
    .filter((p) => p.court_id == null || (courtId != null && p.court_id === courtId))
    // Tarih-özel tarife yalnız kendi tarihinde geçerli; tarih verilmemişse elenir.
    .filter((p) => !isDated(p) || (dateISO != null && p.valid_on === dateISO))
    // Gün filtresi: tarih verildiyse VE tarife gün listesi taşıyorsa uygula
    // (sunucu get_current_tariff_price ile aynı — hafta içi/sonu ayrımı).
    .filter((p) => dow == null || !p.applies_to_days || p.applies_to_days.includes(dow))
    .filter(inWindow)
    .sort((a, b) => {
      // 1) tarih-özel önce, 2) saha-özel, 3) tarife tipi (HOLIDAY>WEEKEND>WEEKDAY>SPECIAL)
      const dateRank = (isDated(a) ? 0 : 1) - (isDated(b) ? 0 : 1);
      if (dateRank !== 0) return dateRank;
      const courtRank = (isCourt(a) ? 0 : 1) - (isCourt(b) ? 0 : 1);
      if (courtRank !== 0) return courtRank;
      return (TARIFF_TYPE_PRIORITY[a.tariff_type ?? ''] ?? 9) - (TARIFF_TYPE_PRIORITY[b.tariff_type ?? ''] ?? 9);
    });
  return candidates[0] ?? null;
}

export function findFlashDealForSlot(
  timeKey: string,
  courtId: string,
  flashDeals: FlashDeal[],
): FlashDeal | undefined {
  const slotTime = normalizeTime(slotKeyToTime(timeKey));
  return flashDeals.find(
    (d) =>
      (!d.court_id || d.court_id === courtId) &&
      normalizeTime(d.start_time) === slotTime,
  );
}

/**
 * Slot kapalı mı. Slot süresi artık tarife bazlı (60/90/120) olduğu için
 * `minutes` parametresi zorunlu hâle geldi — sabit 60 varsayımı 90 dakikalık
 * slotta kapanışın son yarım saatini görmezden geliyordu.
 */
export function isSlotClosed(
  timeKey: string,
  courtId: string,
  exceptions: PitchAvailabilityException[],
  minutes: number = 60,
): boolean {
  const t = normalizeTime(slotKeyToTime(timeKey));
  const [h, m] = t.split(':').map(Number);
  const slotStart = (Number.isFinite(h) ? h : 0) * 60 + (Number.isFinite(m) ? m : 0);
  const slotEnd = slotStart + (minutes > 0 ? minutes : 60);

  return exceptions.some((ex) => {
    if (ex.court_id && ex.court_id !== courtId) return false;
    if (!ex.start_time && !ex.end_time) return true;

    const startParts = (ex.start_time ?? '00:00').split(':');
    const endParts = (ex.end_time ?? '23:59').split(':');
    const exStart = parseInt(startParts[0], 10) * 60 + parseInt(startParts[1] ?? '0', 10);
    const exEnd = parseInt(endParts[0], 10) * 60 + parseInt(endParts[1] ?? '0', 10);

    return slotStart < exEnd && slotEnd > exStart;
  });
}

export function addMonthsISO(isoDate: string, months: number): string {
  const d = new Date(`${isoDate}T12:00:00`);
  d.setMonth(d.getMonth() + months);
  return d.toISOString().slice(0, 10);
}

/**
 * Bir Date'i YEREL takvim gününe göre YYYY-MM-DD verir.
 * `toISOString()` UTC'ye çevirdiği için TR'de (UTC+3) gece yarısı–03:00 arası
 * bir önceki günü döndürüyordu; bu helper yerel bileşenleri kullanarak o kaymayı önler.
 */
/** Gün şeridi: geçmiş `pastDays` gün + bugün + gelecek `futureDays` gün.
 *  Kurucu isteği (9 Ağu 2026): geçmiş rezervasyonlar da takvimden okunabilsin —
 *  geçmiş günler şeritte durur, kayıtları seçilince veritabanından yüklenir.
 *  Şerit açılışta "bugün"e kaydırılır (görünüm tarafı halleder). */
export function buildDayStrip(base: Date = new Date(), pastDays = 30, futureDays = 30): Date[] {
  const start = new Date(base);
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - pastDays);
  return Array.from({ length: pastDays + futureDays + 1 }, (_, i) => {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    return d;
  });
}

export function localDateISO(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
