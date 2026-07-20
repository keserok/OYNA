import { describe, it, expect } from 'vitest';
import { ratingToOverall, isRookie, tierForOverall, tierForRating } from '../../utils/ratingScale';

describe('isRookie', () => {
  it('0 / null / undefined / negatif maç → rookie', () => {
    expect(isRookie(0)).toBe(true);
    expect(isRookie(null)).toBe(true);
    expect(isRookie(undefined)).toBe(true);
    expect(isRookie(-3)).toBe(true);
  });
  it('1+ maç → rookie değil', () => {
    expect(isRookie(1)).toBe(false);
    expect(isRookie(42)).toBe(false);
  });
});

describe('ratingToOverall', () => {
  it('rookie (0 maç) → null, varsayılan 5.0 asla OVR 100 üretmez', () => {
    expect(ratingToOverall(5, 0)).toBeNull();
    expect(ratingToOverall(5, null)).toBeNull();
    expect(ratingToOverall(undefined, 0)).toBeNull();
  });
  it('puan null/geçersiz → null (maç olsa bile)', () => {
    expect(ratingToOverall(null, 10)).toBeNull();
    expect(ratingToOverall(NaN, 10)).toBeNull();
  });
  it('geçerli puan × 20, maç varken', () => {
    expect(ratingToOverall(5, 10)).toBe(100);
    expect(ratingToOverall(4, 10)).toBe(80);
    expect(ratingToOverall(3.25, 10)).toBe(65);
    expect(ratingToOverall(0, 10)).toBe(0);
  });
  it('0–5 aralığına kırpar', () => {
    expect(ratingToOverall(9, 10)).toBe(100);
    expect(ratingToOverall(-2, 10)).toBe(0);
  });
});

describe('tierForOverall / tierForRating', () => {
  it('null OVR → rookie', () => {
    expect(tierForOverall(null)).toBe('rookie');
    expect(tierForRating(5, 0)).toBe('rookie');
  });
  it('eşikler', () => {
    expect(tierForOverall(80)).toBe('gold');
    expect(tierForOverall(79)).toBe('silver');
    expect(tierForOverall(65)).toBe('silver');
    expect(tierForOverall(64)).toBe('bronze');
    expect(tierForOverall(0)).toBe('bronze');
  });
  it('gerçek oyuncu: 4.0 puan + maç → gold', () => {
    expect(tierForRating(4, 20)).toBe('gold');
  });
});
