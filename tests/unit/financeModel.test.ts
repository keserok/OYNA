import { describe, it, expect } from 'vitest';
import {
  growthPercent, shiftMonth, monthLabel, isMonthAfter,
  buildMonthSeries, sharePercent, methodLabel, sourceLabel, parseTRYAmount,
} from '../../shared/financeModel';

describe('growthPercent', () => {
  it('artış → up + doğru %', () => {
    expect(growthPercent(120, 100)).toEqual({ pct: 20, direction: 'up' });
  });
  it('azalış → down', () => {
    expect(growthPercent(80, 100)).toEqual({ pct: -20, direction: 'down' });
  });
  it('eşit → flat', () => {
    expect(growthPercent(100, 100)).toEqual({ pct: 0, direction: 'flat' });
  });
  it('prev 0 + current>0 → yeni (pct null, up)', () => {
    expect(growthPercent(500, 0)).toEqual({ pct: null, direction: 'up' });
  });
  it('prev 0 + current 0 → flat', () => {
    expect(growthPercent(0, 0)).toEqual({ pct: 0, direction: 'flat' });
  });
  it('prev 0 + current<0 → yeni (down)', () => {
    expect(growthPercent(-100, 0)).toEqual({ pct: null, direction: 'down' });
  });
  it('prev NEGATİF: zarardan kâra → up (yön ters dönmez)', () => {
    // prev -2000 → current 4000: delta 6000, |prev| 2000 → %300 up
    expect(growthPercent(4000, -2000)).toEqual({ pct: 300, direction: 'up' });
  });
  it('prev NEGATİF: küçülen zarar → up (iyileşme)', () => {
    // prev -2000 → current -500: delta 1500 → %75 up
    expect(growthPercent(-500, -2000)).toEqual({ pct: 75, direction: 'up' });
  });
  it('prev NEGATİF: büyüyen zarar → down', () => {
    // prev -1000 → current -3000: delta -2000 → %200 down
    expect(growthPercent(-3000, -1000)).toEqual({ pct: -200, direction: 'down' });
  });
});

describe('parseTRYAmount', () => {
  it('binlik nokta', () => {
    expect(parseTRYAmount('2.700')).toBe(2700);
    expect(parseTRYAmount('2.700.000')).toBe(2700000);
    expect(parseTRYAmount('1.500')).toBe(1500);
  });
  it('ondalık virgül', () => {
    expect(parseTRYAmount('150,50')).toBe(150.5);
    expect(parseTRYAmount('1.500,50')).toBe(1500.5);
    expect(parseTRYAmount('2,5')).toBe(2.5);
  });
  it('tek nokta ondalık (3 hane değil)', () => {
    expect(parseTRYAmount('2.5')).toBe(2.5);
    expect(parseTRYAmount('10.25')).toBe(10.25);
  });
  it('sade sayı + ₺/boşluk temizliği', () => {
    expect(parseTRYAmount('150')).toBe(150);
    expect(parseTRYAmount(' 1.500 ₺ ')).toBe(1500);
  });
  it('geçersiz → NaN', () => {
    expect(parseTRYAmount('')).toBeNaN();
    expect(parseTRYAmount('abc')).toBeNaN();
  });
});

describe('shiftMonth', () => {
  it('ay içi ileri/geri', () => {
    expect(shiftMonth('2026-07', 1)).toBe('2026-08');
    expect(shiftMonth('2026-07', -1)).toBe('2026-06');
  });
  it('yıl sınırını aşar', () => {
    expect(shiftMonth('2026-12', 1)).toBe('2027-01');
    expect(shiftMonth('2026-01', -1)).toBe('2025-12');
  });
  it('çok aylık atlama', () => {
    expect(shiftMonth('2026-07', -7)).toBe('2025-12');
  });
});

describe('monthLabel / isMonthAfter', () => {
  it('Türkçe ay + yıl', () => {
    expect(monthLabel('2026-07')).toBe('Temmuz 2026');
    expect(monthLabel('2026-01')).toBe('Ocak 2026');
  });
  it('kronolojik kıyas', () => {
    expect(isMonthAfter('2026-08', '2026-07')).toBe(true);
    expect(isMonthAfter('2026-07', '2026-07')).toBe(false);
    expect(isMonthAfter('2025-12', '2026-01')).toBe(false);
  });
});

describe('buildMonthSeries', () => {
  it('ayın tüm günlerini üretir, eksikleri 0 doldurur', () => {
    const s = buildMonthSeries([{ date: '2026-07-10', collected: 1000 }, { date: '2026-07-12', collected: 800 }], '2026-07');
    expect(s).toHaveLength(31); // Temmuz 31 gün
    expect(s[0]).toEqual({ date: '2026-07-01', day: 1, collected: 0 });
    expect(s.find((d) => d.day === 10)!.collected).toBe(1000);
    expect(s.find((d) => d.day === 12)!.collected).toBe(800);
    expect(s.find((d) => d.day === 11)!.collected).toBe(0);
  });
  it('Şubat 2028 (artık yıl) 29 gün', () => {
    expect(buildMonthSeries([], '2028-02')).toHaveLength(29);
  });
  it('Şubat 2026 (normal) 28 gün', () => {
    expect(buildMonthSeries([], '2026-02')).toHaveLength(28);
  });
});

describe('sharePercent', () => {
  it('oran hesabı', () => {
    expect(sharePercent(25, 100)).toBe(25);
    expect(sharePercent(1, 3)).toBe(33);
  });
  it('total 0 → 0', () => {
    expect(sharePercent(5, 0)).toBe(0);
  });
  it('100 üstü kırpılır', () => {
    expect(sharePercent(150, 100)).toBe(100);
  });
});

describe('etiketler', () => {
  it('yöntem', () => {
    expect(methodLabel('CASH')).toBe('Nakit');
    expect(methodLabel('UNSPECIFIED')).toBe('Yöntemi belirtilmemiş');
    expect(methodLabel('BILINMEYEN')).toBe('BILINMEYEN');
  });
  it('kaynak', () => {
    expect(sourceLabel('SUBSCRIPTION')).toBe('Abonman');
    expect(sourceLabel('APP_BOOKING')).toBe('Uygulama');
  });
});
