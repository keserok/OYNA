import { describe, it, expect } from 'vitest';
import { buildBusyMap, isSlotBusy, type AvailabilityRow } from '../../services/playerBookingService';

// Izgara tarifeden geldigi icin dilimler 19:30 gibi yarim saatli baslayabilir.
// Rezervasyonu SAAT BASI isaretleyen eski kurgu, 19:00-20:00'lik bir kaydin
// 19:30-21:00 dilimini kapattigini goremiyordu: dilim bos gorunup gonderimde
// veritabaninin pitch_bookings_no_overlap (GiST EXCLUDE) kisitina takiliyordu.
const KORT = 'court-1';
const GUN = '2026-07-29';

const satir = (o: Partial<AvailabilityRow>): AvailabilityRow => ({
  court_id: KORT,
  booking_date: GUN,
  start_time: '19:00:00',
  end_time: '20:00:00',
  status: 'CONFIRMED',
  ...o,
});

describe('buildBusyMap / isSlotBusy — aralik kesisimi', () => {
  it('60dk rezervasyon, yarim saatli 90dk dilimi KAPATIR', () => {
    const map = buildBusyMap([satir({})]); // 19:00-20:00
    expect(isSlotBusy(map, KORT, GUN, '19:30', '21:00')).toBe('CONFIRMED');
  });

  it('bitisik rezervasyon dilimi kapatmaz', () => {
    const map = buildBusyMap([satir({ start_time: '18:00:00', end_time: '19:30:00' })]);
    expect(isSlotBusy(map, KORT, GUN, '19:30', '21:00')).toBeNull();
  });

  it('dilimin tamamini kapsayan rezervasyon', () => {
    const map = buildBusyMap([satir({ start_time: '18:00:00', end_time: '22:00:00' })]);
    expect(isSlotBusy(map, KORT, GUN, '19:30', '21:00')).toBe('CONFIRMED');
  });

  it('CONFIRMED, PENDING i ezer', () => {
    const map = buildBusyMap([
      satir({ status: 'PENDING' }),
      satir({ status: 'CONFIRMED' }),
    ]);
    expect(isSlotBusy(map, KORT, GUN, '19:00', '20:00')).toBe('CONFIRMED');
  });

  it('yalniz PENDING varsa PENDING doner', () => {
    const map = buildBusyMap([satir({ status: 'PENDING' })]);
    expect(isSlotBusy(map, KORT, GUN, '19:00', '20:00')).toBe('PENDING');
  });

  it('baska kortun rezervasyonu bu korta yansimaz', () => {
    const map = buildBusyMap([satir({ court_id: 'court-9' })]);
    expect(isSlotBusy(map, KORT, GUN, '19:00', '20:00')).toBeNull();
  });

  it('court_id NULL = tesis geneli kapanis, her korta uygulanir', () => {
    const map = buildBusyMap([satir({ court_id: null })]);
    expect(isSlotBusy(map, KORT, GUN, '19:00', '20:00')).toBe('CONFIRMED');
  });

  it('baska gunun rezervasyonu bu gune yansimaz', () => {
    const map = buildBusyMap([satir({ booking_date: '2026-07-30' })]);
    expect(isSlotBusy(map, KORT, GUN, '19:00', '20:00')).toBeNull();
  });

  it('gece yarisini asan rezervasyon ertesi gunun ilk dilimini kapatir', () => {
    const map = buildBusyMap([satir({ start_time: '23:00:00', end_time: '00:30:00' })]);
    expect(isSlotBusy(map, KORT, GUN, '23:00', '00:30')).toBe('CONFIRMED');
  });

  it('bitis verilmezse 60 dakika varsayilir (eski cagri bicimi)', () => {
    const map = buildBusyMap([satir({})]); // 19:00-20:00
    expect(isSlotBusy(map, KORT, GUN, '19:00')).toBe('CONFIRMED');
    expect(isSlotBusy(map, KORT, GUN, '20:00')).toBeNull();
  });
});
