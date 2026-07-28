import { describe, it, expect } from 'vitest';
import {
  buildSlotGrid,
  slotCountForDate,
  bookingCoversSlot,
  slotLabel,
  slotMinutesFromLabel,
  slotPriceUnitLabel,
  normalizeSlotMinutes,
  isoDayOfWeek,
  type SlotTariffInput,
} from '../../shared/slotGrid';

// 2026-07-29 Çarşamba (ISO 3)
const CARSAMBA = '2026-07-29';
const HERGUN = [1, 2, 3, 4, 5, 6, 7];

const tarife = (o: Partial<SlotTariffInput>): SlotTariffInput => ({
  tariff_type: 'WEEKDAY',
  applies_to_days: HERGUN,
  start_time: '18:00',
  end_time: '23:00',
  slot_price: 900,
  slot_minutes: 60,
  deposit_amount: 200,
  ...o,
});

describe('isoDayOfWeek', () => {
  it('2026-07-29 Carsamba = 3', () => {
    expect(isoDayOfWeek(CARSAMBA)).toBe(3);
  });
});

describe('normalizeSlotMinutes', () => {
  it('gecerli degerleri korur', () => {
    expect(normalizeSlotMinutes(60)).toBe(60);
    expect(normalizeSlotMinutes(90)).toBe(90);
    expect(normalizeSlotMinutes(120)).toBe(120);
  });
  it('gecersiz degerleri 60a ceker (izgara kilitlenmesin)', () => {
    for (const bad of [null, undefined, 0, 45, 75, 1000, 'abc', NaN]) {
      expect(normalizeSlotMinutes(bad)).toBe(60);
    }
  });
});

describe('buildSlotGrid — sunucudaki get_pitch_slots ile ayni kural', () => {
  it('90 dakika: 18:00-23:00 -> 3 slot, artan 30 dk BOS', () => {
    const g = buildSlotGrid([tarife({ slot_minutes: 90 })], CARSAMBA);
    expect(g.map(slotLabel)).toEqual([
      '18:00 - 19:30',
      '19:30 - 21:00',
      '21:00 - 22:30',
    ]);
  });

  it('120 dakika: 18:00-23:00 -> 2 slot, artan 60 dk BOS', () => {
    const g = buildSlotGrid([tarife({ slot_minutes: 120 })], CARSAMBA);
    expect(g.map(slotLabel)).toEqual(['18:00 - 20:00', '20:00 - 22:00']);
  });

  it('60 dakika: 18:00-23:00 -> 5 slot, tam boluniyor', () => {
    const g = buildSlotGrid([tarife({ slot_minutes: 60 })], CARSAMBA);
    expect(g).toHaveLength(5);
    expect(slotLabel(g[4])).toBe('22:00 - 23:00');
  });

  it('her tarife KENDI izgarasini kurar: gunduz 60 + aksam 90', () => {
    const g = buildSlotGrid(
      [
        tarife({ start_time: '09:00', end_time: '12:00', slot_minutes: 60, slot_price: 500 }),
        tarife({ start_time: '18:00', end_time: '23:00', slot_minutes: 90, slot_price: 900 }),
      ],
      CARSAMBA,
    );
    expect(g.map(slotLabel)).toEqual([
      '09:00 - 10:00',
      '10:00 - 11:00',
      '11:00 - 12:00',
      '18:00 - 19:30',
      '19:30 - 21:00',
      '21:00 - 22:30',
    ]);
    expect(g[0].price).toBe(500);
    expect(g[3].price).toBe(900);
  });

  it('fiyat SLOT BASINA gelir, saatlik carpim yapilmaz', () => {
    const g = buildSlotGrid([tarife({ slot_minutes: 90, slot_price: 900 })], CARSAMBA);
    expect(g[0].price).toBe(900);
    expect(g[0].minutes).toBe(90);
  });

  it('eski price_per_hour alani hala okunur (geriye donuk uyum)', () => {
    const g = buildSlotGrid(
      [{ ...tarife({}), slot_price: undefined, price_per_hour: 750 } as SlotTariffInput],
      CARSAMBA,
    );
    expect(g[0].price).toBe(750);
  });

  it('kapora sureyle olceklenmez — sahip ne yazdiysa o', () => {
    const g = buildSlotGrid([tarife({ slot_minutes: 120, deposit_amount: 200 })], CARSAMBA);
    expect(g[0].deposit).toBe(200);
  });

  it("bitis '00:00' ise gun sonu (24:00) sayilir", () => {
    const g = buildSlotGrid(
      [tarife({ start_time: '22:00', end_time: '00:00', slot_minutes: 60 })],
      CARSAMBA,
    );
    expect(g.map(slotLabel)).toEqual(['22:00 - 23:00', '23:00 - 00:00']);
  });

  it('gece yarisini asan pencere calisir ve isaretlenir', () => {
    const g = buildSlotGrid(
      [tarife({ start_time: '23:00', end_time: '02:00', slot_minutes: 90 })],
      CARSAMBA,
    );
    expect(g.map(slotLabel)).toEqual(['23:00 - 00:30', '00:30 - 02:00']);
    expect(g[0].crossesMidnight).toBe(true);
  });

  it('gunune uymayan tarife izgaraya girmez', () => {
    // 2026-07-29 Carsamba(3); tarife yalniz hafta sonu
    const g = buildSlotGrid([tarife({ applies_to_days: [6, 7] })], CARSAMBA);
    expect(g).toHaveLength(0);
  });

  it('pasif tarife izgaraya girmez', () => {
    const g = buildSlotGrid([tarife({ is_active: false })], CARSAMBA);
    expect(g).toHaveLength(0);
  });

  it('tarih-ozel tarife ayni saatte digerini ezer', () => {
    const g = buildSlotGrid(
      [
        tarife({ slot_minutes: 60, slot_price: 900 }),
        tarife({ slot_minutes: 120, slot_price: 2500, valid_on: CARSAMBA, tariff_type: 'SPECIAL' }),
      ],
      CARSAMBA,
    );
    // Tarih-ozel once uretir: 18:00 ve 20:00 (120dk); 60lik tarife bosluklari doldurur
    expect(g[0].minutes).toBe(120);
    expect(g[0].price).toBe(2500);
  });

  it('saha-ozel tarife tesis-genelini ezer', () => {
    const KORT = 'court-1';
    const g = buildSlotGrid(
      [
        tarife({ slot_minutes: 60, slot_price: 900, court_id: null }),
        tarife({ slot_minutes: 90, slot_price: 1200, court_id: KORT }),
      ],
      CARSAMBA,
      KORT,
    );
    expect(g[0].minutes).toBe(90);
    expect(g[0].price).toBe(1200);
  });

  it('baska korta ait tarife bu korta uygulanmaz', () => {
    const g = buildSlotGrid(
      [tarife({ court_id: 'court-9', slot_minutes: 90 })],
      CARSAMBA,
      'court-1',
    );
    expect(g).toHaveLength(0);
  });

  it('tarife yoksa calisma saatinden 60lik izgara kurulur', () => {
    const g = buildSlotGrid([], CARSAMBA, null, { open: '09:00', close: '12:00' });
    expect(g.map(slotLabel)).toEqual(['09:00 - 10:00', '10:00 - 11:00', '11:00 - 12:00']);
  });

  it('tarife de calisma saati de yoksa bos doner', () => {
    expect(buildSlotGrid([], CARSAMBA)).toHaveLength(0);
  });
});

describe('slotCountForDate — doluluk paydasi', () => {
  it('90 dakikaya gecince payda degisir', () => {
    expect(slotCountForDate([tarife({ slot_minutes: 60 })], CARSAMBA)).toBe(5);
    expect(slotCountForDate([tarife({ slot_minutes: 90 })], CARSAMBA)).toBe(3);
    expect(slotCountForDate([tarife({ slot_minutes: 120 })], CARSAMBA)).toBe(2);
  });
});

describe('bookingCoversSlot', () => {
  const slot = { startTime: '20:00', endTime: '21:30' };

  it('tam ortusme', () => {
    expect(bookingCoversSlot('20:00', '21:30', slot)).toBe(true);
  });
  it('kismi ortusme de slotu kapatir', () => {
    expect(bookingCoversSlot('20:00', '21:00', slot)).toBe(true);
    expect(bookingCoversSlot('21:00', '22:00', slot)).toBe(true);
  });
  it('bitisik rezervasyon slotu kapatmaz', () => {
    expect(bookingCoversSlot('18:30', '20:00', slot)).toBe(false);
    expect(bookingCoversSlot('21:30', '23:00', slot)).toBe(false);
  });
  it('gece yarisini asan rezervasyon', () => {
    expect(bookingCoversSlot('23:00', '00:30', { startTime: '23:00', endTime: '00:30' })).toBe(true);
  });
});

// S17 yan bulgusu: fiyat birimi slotun gerçek süresinden gelmeli.
// 90 dakikalık tarifede "/ saat" yazmak yanlış görüntüdür.
describe('slotPriceUnitLabel', () => {
  it('60 dakika → "/ saat"', () => {
    expect(slotPriceUnitLabel(60)).toBe('/ saat');
  });
  it('90 dakika → "/ 1,5 saat"', () => {
    expect(slotPriceUnitLabel(90)).toBe('/ 1,5 saat');
  });
  it('120 dakika → "/ 2 saat"', () => {
    expect(slotPriceUnitLabel(120)).toBe('/ 2 saat');
  });
  it('gecersiz deger varsayilana duser', () => {
    expect(slotPriceUnitLabel(null)).toBe('/ saat');
    expect(slotPriceUnitLabel(45)).toBe('/ saat');
  });
  it('slot etiketiyle uctan uca: 20:00 - 21:30 → "/ 1,5 saat"', () => {
    expect(slotPriceUnitLabel(slotMinutesFromLabel('20:00 - 21:30'))).toBe('/ 1,5 saat');
    expect(slotPriceUnitLabel(slotMinutesFromLabel('23:00 - 00:30'))).toBe('/ 1,5 saat');
    expect(slotPriceUnitLabel(slotMinutesFromLabel('20:00 - 21:00'))).toBe('/ saat');
  });
});
