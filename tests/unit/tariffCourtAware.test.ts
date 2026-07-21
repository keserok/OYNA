import { describe, it, expect } from 'vitest';
import { resolveTariffForSlot, type TariffLike } from '../../services/tariffService';
import { resolveHourlyPrice } from '../../views/owner/ownerCalendarHelpers';

// Saha-öncelikli fiyat çözümü (Faz 1). İstemci mantığı sunucudaki
// get_current_tariff_price ile birebir aynı önceliği vermeli:
// saha-özel (court_id = courtId) > tesis-geneli (court_id null).

const COURT_A = 'court-a';
const COURT_B = 'court-b';
// 2026-07-08 = Çarşamba (ISO gün 3 → hafta içi)
const WED = '2026-07-08';

const facilityEvening: TariffLike = {
  id: 't-facility',
  tariff_type: 'WEEKDAY',
  applies_to_days: [1, 2, 3, 4, 5],
  start_time: '17:00',
  end_time: '00:00',
  price_per_hour: 3200,
  deposit_amount: 960,
  court_id: null,
};

const courtAEvening: TariffLike = {
  id: 't-courtA',
  tariff_type: 'WEEKDAY',
  applies_to_days: [1, 2, 3, 4, 5],
  start_time: '17:00',
  end_time: '00:00',
  price_per_hour: 4000,
  deposit_amount: 1200,
  court_id: COURT_A,
};

describe('resolveTariffForSlot — saha-öncelikli', () => {
  const tariffs = [facilityEvening, courtAEvening];

  it('saha-özel tarife tesis-geneline üstün gelir (court A → 4000)', () => {
    const q = resolveTariffForSlot(tariffs, WED, '19:00', COURT_A);
    expect(q?.price).toBe(4000);
    expect(q?.tariffId).toBe('t-courtA');
  });

  it('saha-özel tarifesi olmayan saha tesis-geneline düşer (court B → 3200)', () => {
    const q = resolveTariffForSlot(tariffs, WED, '19:00', COURT_B);
    expect(q?.price).toBe(3200);
    expect(q?.tariffId).toBe('t-facility');
  });

  it('court verilmezse yalnız tesis-geneli dikkate alınır (→ 3200)', () => {
    const q = resolveTariffForSlot(tariffs, WED, '19:00');
    expect(q?.price).toBe(3200);
  });

  it('kapsam dışı saatte eşleşme yok (09:00 akşam tarifesine düşmez)', () => {
    expect(resolveTariffForSlot(tariffs, WED, '09:00', COURT_A)).toBeNull();
  });

  it('boş tarife listesi null döner', () => {
    expect(resolveTariffForSlot([], WED, '19:00', COURT_A)).toBeNull();
  });
});

describe('resolveHourlyPrice — saha-öncelikli (owner takvim)', () => {
  const policy = [
    { startTime: '17:00', endTime: '00:00', price: 3200, court_id: null },
    { startTime: '17:00', endTime: '00:00', price: 4000, court_id: COURT_A },
  ];

  it('saha-özel fiyat önce (court A 19:00 → 4000)', () => {
    expect(resolveHourlyPrice(19, policy, COURT_A)).toBe(4000);
  });

  it('saha-özeli olmayan saha tesis-geneline düşer (court B 19:00 → 3200)', () => {
    expect(resolveHourlyPrice(19, policy, COURT_B)).toBe(3200);
  });

  it('tarife yoksa null (uydurma fallback yok)', () => {
    expect(resolveHourlyPrice(5, policy, COURT_A)).toBeNull();
    expect(resolveHourlyPrice(19, [], COURT_A)).toBeNull();
  });
});
