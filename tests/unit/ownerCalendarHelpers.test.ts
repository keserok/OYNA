import { describe, it, expect } from 'vitest';
import {
  resolvePriceReason,
  resolveHourlyPrice,
  resolveSlotPriceBreakdown,
} from '../../views/owner/ownerCalendarHelpers';
import type { FlashDeal } from '../../types';

// ─── resolvePriceReason ─────────────────────────────────────────────────────
// "Bilge" arketipi: her fiyatın yanında insana okunur bir "neden" olmalı.

describe('resolvePriceReason — standart tarife gerekçeleri', () => {
  it('akşam yoğun saati (18–23) gerekçeli döner', () => {
    const r = resolvePriceReason(20);
    expect(r.price).toBe(3200);
    expect(r.reason).toMatch(/yoğun/i);
  });

  it('gündüz sakin saati (13–16) gerekçeli döner', () => {
    const r = resolvePriceReason(14);
    expect(r.price).toBe(2000);
    expect(r.reason).toMatch(/sakin/i);
  });

  it('diğer saatler standart tarife gerekçesi verir', () => {
    const r = resolvePriceReason(9);
    expect(r.price).toBe(2000);
    expect(r.reason).toMatch(/standart/i);
  });

  it('kendi tarifesi varsa onun fiyatını ve gerekçesini kullanır', () => {
    const policy = [{ startTime: '19:00', endTime: '23:00', price: 4000 }];
    const r = resolvePriceReason(20, policy);
    expect(r.price).toBe(4000);
    expect(r.reason).toMatch(/kendi tarifeniz/i);
    expect(r.reason).toContain('19:00');
  });
});

describe('resolveHourlyPrice — resolvePriceReason ile aynı fiyatı verir', () => {
  it('gerekçeli ve sade fiyat fonksiyonları uyumludur', () => {
    for (const hour of [0, 9, 14, 20, 23]) {
      expect(resolveHourlyPrice(hour)).toBe(resolvePriceReason(hour).price);
    }
  });
});

// ─── resolveSlotPriceBreakdown ──────────────────────────────────────────────

const makeDeal = (overrides: Partial<FlashDeal>): FlashDeal => ({
  id: 'd1',
  pitch_id: 'p1',
  court_id: null,
  booking_date: '2026-07-01',
  start_time: '20:00',
  discount_percent: 20,
  original_price: 3200,
  deal_price: 2560,
  expires_at: '2026-07-01T22:00:00Z',
  is_claimed: false,
  ...overrides,
});

describe('resolveSlotPriceBreakdown', () => {
  it('flash deal yokken standart fiyatı ve gerekçesini verir', () => {
    const b = resolveSlotPriceBreakdown('20.00', 'c1', undefined, []);
    expect(b.hasDeal).toBe(false);
    expect(b.price).toBe(3200);
    expect(b.standardPrice).toBe(3200);
    expect(b.dealReason).toBeUndefined();
    expect(b.reason).toMatch(/yoğun/i);
  });

  it('flash deal varken indirimli fiyatı ve indirim gerekçesini verir', () => {
    const deal = makeDeal({ start_time: '20:00', discount_percent: 20, deal_price: 2560 });
    const b = resolveSlotPriceBreakdown('20.00', 'c1', undefined, [deal]);
    expect(b.hasDeal).toBe(true);
    expect(b.price).toBe(2560);
    expect(b.standardPrice).toBe(3200);
    expect(b.dealReason).toMatch(/%20/);
    expect(b.reason).toMatch(/yoğun/i);
  });

  it('başka saate ait flash deal slotu etkilemez', () => {
    const deal = makeDeal({ start_time: '15:00' });
    const b = resolveSlotPriceBreakdown('20.00', 'c1', undefined, [deal]);
    expect(b.hasDeal).toBe(false);
    expect(b.price).toBe(3200);
  });
});
