import { describe, it, expect } from 'vitest';
import { parseMatchDateTime, parseTimeToken } from '../../utils/matchDateTime';

// Sabit referans: 2026-07-14 Salı
const NOW = new Date(2026, 6, 14, 12, 0, 0, 0);

describe('parseTimeToken', () => {
  it('saat aralığından başlangıç saatini alır (NaN üretmez)', () => {
    expect(parseTimeToken('22:00 - 23:00')).toEqual({ h: 22, m: 0 });
    expect(parseTimeToken('09:30')).toEqual({ h: 9, m: 30 });
    expect(parseTimeToken('22.00')).toEqual({ h: 22, m: 0 });
  });
  it('geçersiz → null', () => {
    expect(parseTimeToken('akşam')).toBeNull();
    expect(parseTimeToken('')).toBeNull();
    expect(parseTimeToken('25:00')).toBeNull();
  });
});

describe('parseMatchDateTime', () => {
  it('ISO tarih + saat', () => {
    const d = parseMatchDateTime('2026-05-18', '22:00', NOW)!;
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(4);
    expect(d.getDate()).toBe(18);
    expect(d.getHours()).toBe(22);
  });
  it('gün.ay.yıl (eski kodda bugüne çöküyordu)', () => {
    const d = parseMatchDateTime('18.05.2026', '22:00 - 23:00', NOW)!;
    expect(d.getMonth()).toBe(4);
    expect(d.getDate()).toBe(18);
    expect(d.getHours()).toBe(22);
    expect(d.getMinutes()).toBe(0); // "00 - 23" NaN DEĞİL
  });
  it('bileşik "Bugün • 02.11.2026" → açık tarih öncelikli', () => {
    const d = parseMatchDateTime('Bugün • 02.11.2026', '20:00', NOW)!;
    expect(d.getMonth()).toBe(10);
    expect(d.getDate()).toBe(2);
  });
  it('göreli: bugün / yarın', () => {
    expect(parseMatchDateTime('Bugün', '20:00', NOW)!.getDate()).toBe(14);
    expect(parseMatchDateTime('Yarın', '20:00', NOW)!.getDate()).toBe(15);
  });
  it('TR gün adı → o günün ilk gelişi (NOW=Salı)', () => {
    // Cuma = NOW + 3
    expect(parseMatchDateTime('Cuma', '20:00', NOW)!.getDate()).toBe(17);
    // Salı (bugün) → bugün
    expect(parseMatchDateTime('Salı', '20:00', NOW)!.getDate()).toBe(14);
    // Pazartesi → gelecek pazartesi (NOW+6)
    expect(parseMatchDateTime('Pazartesi', '20:00', NOW)!.getDate()).toBe(20);
  });
  it('belirsiz → null, asla NaN', () => {
    expect(parseMatchDateTime('', '20:00', NOW)).toBeNull();
    expect(parseMatchDateTime(null, '20:00', NOW)).toBeNull();
    expect(parseMatchDateTime('bilinmeyen', '20:00', NOW)).toBeNull();
  });
  it('saat yoksa gece yarısı (NaN değil)', () => {
    const d = parseMatchDateTime('2026-05-18', null, NOW)!;
    expect(d.getHours()).toBe(0);
    expect(Number.isNaN(d.getTime())).toBe(false);
  });
});
