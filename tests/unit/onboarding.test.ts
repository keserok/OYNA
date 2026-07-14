import { describe, it, expect, beforeEach } from 'vitest';
import {
  isMinorAgeRange, POSITION_LABEL, trUpper, AGE_RANGES,
  saveOnboardingDraft, loadOnboardingDraft, clearOnboardingDraft,
  markOnboardingSeen, hasSeenOnboarding, isOnboardingEnabled,
  OnboardingDraft, AgeRange,
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

// ─── Pozisyon etiketleri ───
describe('POSITION_LABEL', () => {
  it('onboarding kodlarını Türkçe etikete çevirir', () => {
    expect(POSITION_LABEL.kaleci).toBe('Kaleci');
    expect(POSITION_LABEL.defans).toBe('Savunma');
    expect(POSITION_LABEL.orta).toBe('Orta Saha');
    expect(POSITION_LABEL.forvet).toBe('Hücum');
  });
});

// ─── Taslak kalıcılık (localStorage) ───
describe('onboarding taslağı', () => {
  beforeEach(() => clearOnboardingDraft());

  it('kaydet → yükle round-trip aynı veriyi verir', () => {
    const draft: OnboardingDraft = {
      ageRange: '13-17', firstName: 'Efe', lastName: 'Yılmaz',
      gender: 'erkek', position: 'orta', playStyle: 'rahat',
      locationGranted: true, completedAt: 123456,
    };
    saveOnboardingDraft(draft);
    expect(loadOnboardingDraft()).toEqual(draft);
  });

  it('temizle sonrası null döner', () => {
    saveOnboardingDraft({
      ageRange: '24-30', firstName: 'A', lastName: 'B', gender: '',
      position: '', playStyle: 'ciddi', locationGranted: false, completedAt: 1,
    });
    clearOnboardingDraft();
    expect(loadOnboardingDraft()).toBeNull();
  });
});

// ─── "Görüldü" bayrağı ve kill-switch ───
describe('onboarding görüldü bayrağı & kill-switch', () => {
  beforeEach(() => { try { localStorage.clear(); } catch { /* yoksay */ } });

  it('başlangıçta görülmemiş, işaretleyince görülmüş', () => {
    expect(hasSeenOnboarding()).toBe(false);
    markOnboardingSeen();
    expect(hasSeenOnboarding()).toBe(true);
  });

  it('kill-switch bayrağı varsayılan açık, disabled=1 ile kapanır', () => {
    expect(isOnboardingEnabled()).toBe(true);
    localStorage.setItem('oyna.onboarding.disabled', '1');
    expect(isOnboardingEnabled()).toBe(false);
  });
});
