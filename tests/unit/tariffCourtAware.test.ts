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

// Review düzeltmesi: owner takvimi hafta içi/sonu + tarife tipi önceliğini
// UYGULAMALI (yoksa sunucu/oyuncu ile ayrışır). dateISO verildiğinde gün filtresi çalışır.
describe('resolveHourlyPrice — gün-farkında (hafta içi/sonu ayrımı)', () => {
  const policy = [
    { startTime: '09:00', endTime: '00:00', price: 2000, court_id: null, applies_to_days: [1, 2, 3, 4, 5], tariff_type: 'WEEKDAY' },
    { startTime: '09:00', endTime: '00:00', price: 3000, court_id: null, applies_to_days: [6, 7], tariff_type: 'WEEKEND' },
  ];
  // 2026-07-08 = Çarşamba (hafta içi), 2026-07-11 = Cumartesi (hafta sonu)
  it('hafta içi günde WEEKDAY fiyatı (→ 2000)', () => {
    expect(resolveHourlyPrice(19, policy, null, '2026-07-08')).toBe(2000);
  });
  it('hafta sonu günde WEEKEND fiyatı (→ 3000)', () => {
    expect(resolveHourlyPrice(19, policy, null, '2026-07-11')).toBe(3000);
  });
  it('tarih verilmezse gün filtresi uygulanmaz (ilk uygun → tip önceliği WEEKDAY)', () => {
    // WEEKDAY (öncelik 3) < WEEKEND (öncelik 2)? Öncelik sayısı küçük olan önce:
    // WEEKEND=2 önce gelir → 3000. Gün bilinmediğinde tip önceliği belirler.
    expect(resolveHourlyPrice(19, policy)).toBe(3000);
  });
});

// Takvimden girilen ÖZEL FİYAT (valid_on): yalnız kendi tarihinde geçerli ve o
// tarihte her şeye üstün. Sunucu get_current_tariff_price ile birebir aynı kural —
// oyuncunun gördüğü fiyat = rezervasyona yazılan fiyat = ödeme tutarı.
describe('tarih-özel tarife (valid_on) — özel fiyat önceliği', () => {
  // 2026-07-24 = Cuma (ISO 5); 2026-07-31 sonraki Cuma.
  const FRI = '2026-07-24';
  const NEXT_FRI = '2026-07-31';
  const weekday: TariffLike = {
    id: 't-std',
    tariff_type: 'WEEKDAY',
    applies_to_days: [1, 2, 3, 4, 5],
    start_time: '08:00',
    end_time: '00:00',
    price_per_hour: 1000,
    deposit_amount: 300,
    court_id: null,
  };
  const specialFriday: TariffLike = {
    id: 't-ozel',
    tariff_type: 'SPECIAL',
    applies_to_days: [5],
    start_time: '20:00',
    end_time: '21:00',
    price_per_hour: 1500,
    deposit_amount: 300,
    court_id: null,
    valid_on: FRI,
  };
  const tariffs = [weekday, specialFriday];

  it('oyuncu tarafı: özel fiyat kendi tarihinde standardı yener (→ 1500)', () => {
    const q = resolveTariffForSlot(tariffs, FRI, '20:00');
    expect(q?.price).toBe(1500);
    expect(q?.tariffId).toBe('t-ozel');
    expect(q?.deposit).toBe(300); // kapora standarttan miras — ödeme akışı değişmez
  });

  it('sonraki hafta aynı gün/saat standart fiyata döner (→ 1000)', () => {
    expect(resolveTariffForSlot(tariffs, NEXT_FRI, '20:00')?.price).toBe(1000);
  });

  it('aynı gün farklı saat standart fiyat (→ 1000)', () => {
    expect(resolveTariffForSlot(tariffs, FRI, '19:00')?.price).toBe(1000);
  });

  it('owner takvimi aynı önceliği uygular (20:00 → 1500, 19:00 → 1000)', () => {
    const policy = [
      { startTime: '08:00', endTime: '00:00', price: 1000, court_id: null, applies_to_days: [1, 2, 3, 4, 5], tariff_type: 'WEEKDAY' },
      { startTime: '20:00', endTime: '21:00', price: 1500, court_id: null, applies_to_days: [5], tariff_type: 'SPECIAL', valid_on: FRI },
    ];
    expect(resolveHourlyPrice(20, policy, null, FRI)).toBe(1500);
    expect(resolveHourlyPrice(19, policy, null, FRI)).toBe(1000);
    expect(resolveHourlyPrice(20, policy, null, NEXT_FRI)).toBe(1000);
  });

  it('tarih verilmeden çözümde tarih-özel satır hesaba katılmaz (→ 1000)', () => {
    const policy = [
      { startTime: '08:00', endTime: '00:00', price: 1000, court_id: null, tariff_type: 'WEEKDAY' },
      { startTime: '20:00', endTime: '21:00', price: 1500, court_id: null, tariff_type: 'SPECIAL', valid_on: FRI },
    ];
    expect(resolveHourlyPrice(20, policy)).toBe(1000);
  });
});
