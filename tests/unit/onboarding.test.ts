import { describe, it, expect, beforeEach } from 'vitest';
import {
  isMinorAgeRange, POSITION_LABEL, POSITION_CODE, POSITION_ABBR,
  PLAY_STYLE_META, GENDER_LABEL, trUpper, AGE_RANGES,
  splitFullName, isOnboardingEnabled, OnboardingPosition, AgeRange,
} from '../../views/onboarding/onboardingShared';

// ─── Yaş aralığı → reşit değil (sunucu compute_is_minor ile aynı kural) ───
describe('isMinorAgeRange', () => {
  it('yalnızca 13-17 aralığı reşit değildir', () => {
    expect(isMinorAgeRange('13-17')).toBe(true);
  });
  it('18 ve üzeri aralıklar reşittir', () => {
    const adults: AgeRange[] = ['18-23', '24-30', '31-40', '41-50', '51+'];
    for (const r of adults) expect(isMinorAgeRange(r)).toBe(false);
  });
  it('boş aralık reşit sayılır (varsayılan güvenli — kapı sunucuda)', () => {
    expect(isMinorAgeRange('')).toBe(false);
  });
});

describe('AGE_RANGES', () => {
  it('altı aralık içerir ve ilk aralık 13-17', () => {
    expect(AGE_RANGES).toHaveLength(6);
    expect(AGE_RANGES[0]).toBe('13-17');
    expect(AGE_RANGES[AGE_RANGES.length - 1]).toBe('51+');
  });
});

// ─── Türkçe büyük harf (İ/ı) ───
describe('trUpper', () => {
  it('i → İ ve ı korunur', () => {
    expect(trUpper('istanbul')).toBe('İSTANBUL');
    expect(trUpper('yılmaz')).toBe('YILMAZ');
  });
});

// ─── Pozisyon etiket ↔ kod dönüşümleri ───
describe('POSITION_LABEL / POSITION_CODE', () => {
  it('onboarding kodlarını Türkçe etikete çevirir', () => {
    expect(POSITION_LABEL.kaleci).toBe('Kaleci');
    expect(POSITION_LABEL.defans).toBe('Savunma');
    expect(POSITION_LABEL.orta).toBe('Orta Saha');
    expect(POSITION_LABEL.forvet).toBe('Hücum');
  });

  it('etiket → kod → etiket round-trip aynı kalır (ön-dolum için)', () => {
    const codes: Exclude<OnboardingPosition, ''>[] = ['kaleci', 'defans', 'orta', 'forvet'];
    for (const code of codes) {
      expect(POSITION_CODE[POSITION_LABEL[code]]).toBe(code);
    }
  });

  it('kısaltmalar KL/SAV/ORT/HÜC (orta = ORT, OS değil)', () => {
    expect(POSITION_ABBR.kaleci).toBe('KL');
    expect(POSITION_ABBR.defans).toBe('SAV');
    expect(POSITION_ABBR.orta).toBe('ORT');
    expect(POSITION_ABBR.forvet).toBe('HÜC');
  });
});

// ─── Oyun stili + cinsiyet etiketleri (profil rozetleri tek kaynak) ───
describe('PLAY_STYLE_META / GENDER_LABEL', () => {
  it('üç oyun stili etiket + renk içerir', () => {
    expect(PLAY_STYLE_META.ciddi.label).toBe('Ciddi');
    expect(PLAY_STYLE_META.taktiksel.label).toBe('Taktiksel');
    expect(PLAY_STYLE_META.rahat.label).toBe('Rahat');
    for (const k of ['ciddi', 'taktiksel', 'rahat'] as const) {
      expect(PLAY_STYLE_META[k].color).toMatch(/^#[0-9A-Fa-f]{6}$/);
    }
  });
  it('cinsiyet etiketleri', () => {
    expect(GENDER_LABEL.kadin).toBe('Kadın');
    expect(GENDER_LABEL.erkek).toBe('Erkek');
  });
});

// ─── Ad soyad bölme (kayıttaki tek full_name → ad/soyad ön-dolum) ───
describe('splitFullName', () => {
  it('son kelimeyi soyad, kalanı ad alır', () => {
    expect(splitFullName('Ahmet Yılmaz')).toEqual({ firstName: 'Ahmet', lastName: 'Yılmaz' });
    expect(splitFullName('Ahmet Mehmet Yılmaz')).toEqual({ firstName: 'Ahmet Mehmet', lastName: 'Yılmaz' });
  });
  it('tek kelime yalnız ad olur, soyad boş', () => {
    expect(splitFullName('Efe')).toEqual({ firstName: 'Efe', lastName: '' });
  });
  it('boş / null / fazladan boşluk güvenli', () => {
    expect(splitFullName('')).toEqual({ firstName: '', lastName: '' });
    expect(splitFullName(null)).toEqual({ firstName: '', lastName: '' });
    expect(splitFullName('  Ada   Lovelace  ')).toEqual({ firstName: 'Ada', lastName: 'Lovelace' });
  });
});

// ─── Kill-switch ───
describe('onboarding kill-switch', () => {
  beforeEach(() => { try { localStorage.clear(); } catch { /* yoksay */ } });

  it('varsayılan açık, disabled=1 ile kapanır', () => {
    expect(isOnboardingEnabled()).toBe(true);
    localStorage.setItem('oyna.onboarding.disabled', '1');
    expect(isOnboardingEnabled()).toBe(false);
  });
});
