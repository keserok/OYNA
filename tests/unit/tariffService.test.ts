import { describe, it, expect } from 'vitest';
import {
  isoDayOfWeek,
  getAverageTariffPrice,
  resolveTariffForSlot,
  mapDbTariffsToPitchTariffs,
  type TariffLike,
} from '../../services/tariffService';

describe('isoDayOfWeek', () => {
  it('tarih değerini ISO haftanın gününe (1-7) çevirir', () => {
    // 2026-07-13 Pazartesi olmalı (1)
    expect(isoDayOfWeek('2026-07-13')).toBe(1);
    // 2026-07-19 Pazar olmalı (7)
    expect(isoDayOfWeek('2026-07-19')).toBe(7);
  });
});

describe('getAverageTariffPrice', () => {
  it('boş listede null döner', () => {
    expect(getAverageTariffPrice(null)).toBeNull();
    expect(getAverageTariffPrice([])).toBeNull();
  });

  it('aktif tarifelerin fiyatlarının ortalamasını yuvarlayarak döndürür', () => {
    const tariffs: TariffLike[] = [
      { tariff_type: 'WEEKDAY', applies_to_days: [1], start_time: '18:00', end_time: '19:00', price_per_hour: 1000, is_active: true },
      { tariff_type: 'WEEKDAY', applies_to_days: [1], start_time: '19:00', end_time: '20:00', price_per_hour: 1200, is_active: true },
      { tariff_type: 'WEEKDAY', applies_to_days: [1], start_time: '20:00', end_time: '21:00', price_per_hour: 1350, is_active: true },
    ];
    // (1000 + 1200 + 1350) / 3 = 3550 / 3 = 1183.333 -> Yuvarlanmış: 1183
    expect(getAverageTariffPrice(tariffs)).toBe(1183);
  });

  it('pasif tarifeleri hesaba katmaz', () => {
    const tariffs: TariffLike[] = [
      { tariff_type: 'WEEKDAY', applies_to_days: [1], start_time: '18:00', end_time: '19:00', price_per_hour: 1000, is_active: true },
      { tariff_type: 'WEEKDAY', applies_to_days: [1], start_time: '19:00', end_time: '20:00', price_per_hour: 2000, is_active: false },
    ];
    expect(getAverageTariffPrice(tariffs)).toBe(1000);
  });
});

describe('resolveTariffForSlot', () => {
  const tariffs: TariffLike[] = [
    {
      id: 't-weekday-regular',
      tariff_type: 'WEEKDAY',
      applies_to_days: [1, 2, 3, 4, 5],
      start_time: '08:00',
      end_time: '18:00',
      price_per_hour: 800,
      deposit_amount: 200,
      is_active: true,
    },
    {
      id: 't-weekday-peak',
      tariff_type: 'WEEKDAY',
      applies_to_days: [1, 2, 3, 4, 5],
      start_time: '18:00',
      end_time: '23:00',
      price_per_hour: 1200,
      deposit_amount: 300,
      is_active: true,
    },
    {
      id: 't-weekend',
      tariff_type: 'WEEKEND',
      applies_to_days: [6, 7],
      start_time: '08:00',
      end_time: '23:00',
      price_per_hour: 1500,
      deposit_amount: 500,
      is_active: true,
    },
  ];

  it('gün ve saat aralığı eşleşen tarifeyi çözer', () => {
    // 2026-07-13 Pazartesi (1), Saat: 10:00
    const quote = resolveTariffForSlot(tariffs, '2026-07-13', '10:00');
    expect(quote).not.toBeNull();
    expect(quote?.price).toBe(800);
    expect(quote?.deposit).toBe(200);
    expect(quote?.tariffId).toBe('t-weekday-regular');
  });

  it('peak saat tarifesini çözer', () => {
    // 2026-07-13 Pazartesi (1), Saat: 19:30
    const quote = resolveTariffForSlot(tariffs, '2026-07-13', '19:30');
    expect(quote?.price).toBe(1200);
    expect(quote?.deposit).toBe(300);
    expect(quote?.tariffId).toBe('t-weekday-peak');
  });

  it('hafta sonu tarifesini çözer', () => {
    // 2026-07-18 Cumartesi (6), Saat: 12:00
    const quote = resolveTariffForSlot(tariffs, '2026-07-18', '12:00');
    expect(quote?.price).toBe(1500);
    expect(quote?.deposit).toBe(500);
    expect(quote?.tariffId).toBe('t-weekend');
  });

  it('hiçbir tarife eşleşmezse null döner', () => {
    // Hafta içi gece yarısı (00:00) tarifesi yok
    const quote = resolveTariffForSlot(tariffs, '2026-07-13', '01:00');
    expect(quote).toBeNull();
  });
});

describe('mapDbTariffsToPitchTariffs', () => {
  it('veritabanı tarifelerini PitchTariff formatına dönüştürür', () => {
    const raw: TariffLike[] = [
      {
        id: '1',
        name: 'Akşam Tarifesi',
        tariff_type: 'WEEKDAY',
        applies_to_days: [1, 2],
        start_time: '18:00:00',
        end_time: '23:00:00',
        price_per_hour: 1200,
        deposit_amount: 300,
        is_active: true,
      },
    ];

    const mapped = mapDbTariffsToPitchTariffs(raw);
    expect(mapped).toHaveLength(1);
    expect(mapped[0]).toEqual({
      id: '1',
      pitch_id: '',
      name: 'Akşam Tarifesi',
      tariff_type: 'WEEKDAY',
      applies_to_days: [1, 2],
      start_time: '18:00:00',
      end_time: '23:00:00',
      price_per_hour: 1200,
      deposit_amount: 300,
      is_active: true,
      sort_order: 0,
    });
  });
});
