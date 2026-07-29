import { describe, it, expect } from 'vitest';
import {
  buildDayOccupancyGrid,
  buildHourlyIntensity,
  computeCourtDailyStats,
  computeOverallOccupancy,
  EMPTY_DAY_OCCUPANCY,
} from '../../services/pitchOwnerService';
import type { SlotTariffInput } from '../../shared/slotGrid';
import type { PitchBookingFull } from '../../types';

// B4: saat-bazlı doluluk — çok-saatlik rezervasyon kapladığı TÜM saatleri işaretler,
// doluluk yüzdesi rezervasyon SAYISI değil kapladığı SAAT toplamıdır.

function booking(partial: Partial<PitchBookingFull>): PitchBookingFull {
  return {
    id: 'b',
    court_id: 'c1',
    start_time: '20:00',
    end_time: '22:00',
    status: 'CONFIRMED',
    source: 'OWNER_MANUAL',
    price: 1000,
    paid_amount: 0,
    ...partial,
  } as PitchBookingFull;
}

// ─── SLOT-3 — doluluk şeridi tarifeden türer, dikdörtgen süreyle orantılıdır ──

const CARSAMBA = '2026-07-29'; // ISO gün 3
const KORTLAR = [{ id: 'c1', name: 'A' }];

function tarife(over: Partial<SlotTariffInput> = {}): SlotTariffInput {
  return {
    id: 't1',
    tariff_type: 'WEEKDAY',
    applies_to_days: [1, 2, 3, 4, 5],
    start_time: '18:00',
    end_time: '00:00',
    slot_price: 1000,
    slot_minutes: 60,
    is_active: true,
    court_id: null,
    valid_on: null,
    ...over,
  };
}

const satir = (
  bookings: PitchBookingFull[],
  tariffs: SlotTariffInput[],
  courts = KORTLAR,
) => buildDayOccupancyGrid(bookings, courts, tariffs, CARSAMBA);

describe('buildDayOccupancyGrid — dikdörtgen süresi tarifeden gelir (SLOT-3)', () => {
  it('90 dakikalik tarifede her dikdortgen 90 dakikadir (sabit 60 varsayimi yok)', () => {
    const g = satir([], [tarife({ slot_minutes: 90 })]);
    expect(g.rows[0].slots.map((s) => s.minutes)).toEqual([90, 90, 90, 90]);
    expect(g.rows[0].slots[0].startTime).toBe('18:00');
    expect(g.rows[0].slots[1].startTime).toBe('19:30');
  });

  it('90 dakikalik slot 60 dakikaligin tam 1,5 kati uzunluktadir', () => {
    const alt = satir([], [tarife({ slot_minutes: 60 })]).rows[0].slots[0].minutes;
    const ust = satir([], [tarife({ slot_minutes: 90 })]).rows[0].slots[0].minutes;
    expect(ust / alt).toBe(1.5);
  });

  it('ayni gunde sabah 60 / aksam 90: her pencere KENDI adimiyla ilerler (E12a)', () => {
    const g = satir([], [
      tarife({ id: 'sabah', start_time: '09:00', end_time: '12:00', slot_minutes: 60 }),
      tarife({ id: 'aksam', start_time: '18:00', end_time: '21:00', slot_minutes: 90 }),
    ]);
    const s = g.rows[0].slots;
    expect(s.filter((x) => x.startTime < '12:00').map((x) => x.minutes)).toEqual([60, 60, 60]);
    expect(s.filter((x) => x.startTime >= '18:00').map((x) => x.minutes)).toEqual([90, 90]);
  });

  it('kortlar farkli sure alabilir (E5a) — her satir kendi izgarasini kurar', () => {
    const g = buildDayOccupancyGrid(
      [],
      [{ id: 'c1', name: 'A' }, { id: 'c2', name: 'B' }],
      [
        tarife({ id: 'genel', slot_minutes: 60 }),
        tarife({ id: 'ozel', court_id: 'c2', slot_minutes: 90 }),
      ],
      CARSAMBA,
    );
    expect(g.rows[0].slots.every((s) => s.minutes === 60)).toBe(true);
    expect(g.rows[1].slots.every((s) => s.minutes === 90)).toBe(true);
  });

  it('pencereye sigmayan artik sure slot URETMEZ (E3a) — sonda bosluk kalir', () => {
    // 18:00-23:00 = 300 dk; 90 ile 3 slot (270 dk), kalan 30 dk slot olmaz.
    const g = satir([], [tarife({ end_time: '23:00', slot_minutes: 90 })]);
    expect(g.rows[0].slots).toHaveLength(3);
    expect(g.rows[0].sellableMinutes).toBe(270);
    expect(g.endMinutes).toBe(22 * 60 + 30);
  });

  it('offsetMinutes gece yarisini asan slotta 1440i gecer (cizim geri sarmaz)', () => {
    const g = satir([], [tarife({ start_time: '23:00', end_time: '02:00', slot_minutes: 90 })]);
    const s = g.rows[0].slots;
    expect(s.map((x) => x.startTime)).toEqual(['23:00', '00:30']);
    expect(s.map((x) => x.offsetMinutes)).toEqual([23 * 60, 24 * 60 + 30]);
    expect(g.endMinutes).toBe(26 * 60);
  });

  it('20:00-22:00 rezervasyon iki 60 dakikalik slotu da doldurur, 22:00 bos kalir', () => {
    const g = satir([booking({})], [tarife({ slot_minutes: 60 })]);
    const at = (t: string) => g.rows[0].slots.find((s) => s.startTime === t)?.cell ?? null;
    expect(at('19:00')).toBeNull();
    expect(at('20:00')?.type).toBe('DAILY');
    expect(at('21:00')?.type).toBe('DAILY');
    expect(at('22:00')).toBeNull();
  });

  it("gece yarisi bitisi (23:00-00:00) yalniz 23:00 slotunu doldurur", () => {
    const g = satir(
      [booking({ start_time: '23:00', end_time: '00:00' })],
      [tarife({ slot_minutes: 60 })],
    );
    const at = (t: string) => g.rows[0].slots.find((s) => s.startTime === t)?.cell ?? null;
    expect(at('23:00')?.type).toBe('DAILY');
    expect(at('22:00')).toBeNull();
  });

  it('iptal edilen rezervasyon doluluga sayilmaz', () => {
    const g = satir([booking({ status: 'CANCELLED' })], [tarife({ slot_minutes: 60 })]);
    expect(g.rows[0].slots.every((s) => s.cell === null)).toBe(true);
    expect(g.rows[0].occupancyPercent).toBe(0);
  });

  it('abonelik SUB olarak isaretlenir', () => {
    const g = satir([booking({ source: 'SUBSCRIPTION' })], [tarife({ slot_minutes: 60 })]);
    expect(g.rows[0].slots.find((s) => s.startTime === '20:00')?.cell?.type).toBe('SUB');
  });

  it('hucre rezerve edenin adini tasir (customer_name → title → kaynak etiketi)', () => {
    const ad = (b: Partial<PitchBookingFull>) =>
      satir([booking(b)], [tarife({ slot_minutes: 60 })])
        .rows[0].slots.find((s) => s.startTime === '20:00')?.cell?.name;
    expect(ad({ customer_name: 'Ahmet Yılmaz' })).toBe('Ahmet Yılmaz');
    expect(ad({ customer_name: null, title: 'Salı Maçı' })).toBe('Salı Maçı');
    expect(ad({ customer_name: null, title: null, source: 'APP_BOOKING' })).toBe('Uygulama rezervasyonu');
  });

  it('doluluk yuzdesi SATILABILIR dakikaya bolunur (acik saate degil)', () => {
    // 18:00-23:00 / 90 dk → 3 slot = 270 dk satilabilir. 18:00-19:30 dolu → %33.
    const g = satir(
      [booking({ start_time: '18:00', end_time: '19:30' })],
      [tarife({ end_time: '23:00', slot_minutes: 90 })],
    );
    expect(g.rows[0].bookedMinutes).toBe(90);
    expect(g.rows[0].sellableMinutes).toBe(270);
    expect(g.rows[0].occupancyPercent).toBe(33);
  });

  it('kort yoksa bos izgara doner (ekran cokmez)', () => {
    expect(buildDayOccupancyGrid([], [], [tarife()], CARSAMBA)).toBe(EMPTY_DAY_OCCUPANCY);
  });

  it('tarife hic yoksa calisma saati yedegi kullanilir (slotGrid Kural 4)', () => {
    const g = buildDayOccupancyGrid([], KORTLAR, [], CARSAMBA, { open: '09:00', close: '12:00' });
    expect(g.fromTariffs).toBe(false);
    expect(g.rows[0].slots.map((s) => s.minutes)).toEqual([60, 60, 60]);
  });
});

describe('buildHourlyIntensity (finans isi haritasi)', () => {
  it('cok saatlik rezervasyon kapsadigi her saati isitir', () => {
    const h = buildHourlyIntensity([booking({})], KORTLAR);
    expect(h[19].intensity).toBe(0);
    expect(h[20].intensity).toBe(100);
    expect(h[21].intensity).toBe(100);
    expect(h[22].intensity).toBe(0);
  });

  it('iptal edilen rezervasyon isi uretmez', () => {
    const h = buildHourlyIntensity([booking({ status: 'CANCELLED' })], KORTLAR);
    expect(h.every((x) => x.intensity === 0)).toBe(true);
  });
});

describe('computeOverallOccupancy (B4)', () => {
  it('2 saatlik tek rezervasyon 2 saat sayılır (16 saat pencere → %13)', () => {
    expect(computeOverallOccupancy([booking({})], 1, 16)).toBe(13);
  });

  it('rezervasyon SAYISI değil SAAT toplamı — iki 1 saatlik = iki 2 saatlik değil', () => {
    const oneHourA = booking({ id: 'a', start_time: '20:00', end_time: '21:00' });
    const oneHourB = booking({ id: 'b', start_time: '21:00', end_time: '22:00' });
    // 2 saat / 16 = %13 (eski kod 2 rezervasyon/16 ile aynı çıkardı ama 2 saatlik
    // tek rezervasyonda ESKİ kod %6, YENİ kod %13 verir — asıl düzeltme orada)
    expect(computeOverallOccupancy([oneHourA, oneHourB], 1, 16)).toBe(13);
  });

  it('iptal sayılmaz', () => {
    expect(computeOverallOccupancy([booking({ status: 'CANCELLED' })], 1, 16)).toBe(0);
  });
});

describe('computeCourtDailyStats (B4)', () => {
  it('bookedHours kapladığı saat toplamıdır (rezervasyon sayısı değil)', () => {
    const stats = computeCourtDailyStats([booking({})], [{ id: 'c1', name: 'A' }], 16);
    expect(stats[0].bookedHours).toBe(2);
    expect(stats[0].occupancyPercent).toBe(13);
  });
});
