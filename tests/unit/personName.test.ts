import { describe, it, expect } from 'vitest';
import {
  normalizeNameInput,
  validateNamePart,
  validateFirstLast,
  validateFullName,
  NAME_PART_MAX,
  FULL_NAME_MAX,
} from '../../shared/personName';

// S8 — "Kayıtta ad soyad zorunlu."
// Bu dosya shared/personName.ts kurallarını ve sunucudaki ikizi
// public.is_valid_person_name / apply_onboarding ile aynı örnekleri doğrular.

describe('normalizeNameInput', () => {
  it('baş/son ve aradaki fazla boşlukları temizler', () => {
    expect(normalizeNameInput('  Ahmet   Yılmaz  ')).toBe('Ahmet Yılmaz');
    expect(normalizeNameInput('\tMehmet\n')).toBe('Mehmet');
  });
  it('null/undefined için boş metin döner', () => {
    expect(normalizeNameInput(null)).toBe('');
    expect(normalizeNameInput(undefined)).toBe('');
  });
});

describe('validateNamePart', () => {
  it('Türkçe harfleri kabul eder', () => {
    for (const n of ['Çağrı', 'Şükrü', 'İpek', 'Gülşah', 'Ömer', 'Ünal', 'Işıl']) {
      expect(validateNamePart(n, 'Ad').valid, n).toBe(true);
    }
  });
  it('kesme ve tire içeren adları harfler arasında kabul eder', () => {
    expect(validateNamePart("D'Angelo", 'Ad').valid).toBe(true);
    expect(validateNamePart('Şeyh-ül', 'Soyad').valid).toBe(true);
  });
  it('kesme/tire ile başlayan ya da biten adı reddeder', () => {
    expect(validateNamePart("-Ahmet", 'Ad').valid).toBe(false);
    expect(validateNamePart("Ahmet-", 'Ad').valid).toBe(false);
  });
  it('rakam, noktalama ve emoji reddedilir', () => {
    for (const n of ['Ahmet1', 'A.', 'Ali_', 'Ahmet😀', '<script>']) {
      expect(validateNamePart(n, 'Ad').valid, n).toBe(false);
    }
  });
  it('tek harflik ad reddedilir', () => {
    expect(validateNamePart('A', 'Ad').valid).toBe(false);
  });
  it('boş ad reddedilir', () => {
    expect(validateNamePart('', 'Ad').valid).toBe(false);
    expect(validateNamePart('   ', 'Ad').valid).toBe(false);
  });
  it('üst sınırı aşan ad reddedilir', () => {
    expect(validateNamePart('A'.repeat(NAME_PART_MAX), 'Ad').valid).toBe(true);
    expect(validateNamePart('A'.repeat(NAME_PART_MAX + 1), 'Ad').valid).toBe(false);
  });
  it('birden çok kelime tek parçada reddedilir', () => {
    expect(validateNamePart('Ahmet Mehmet', 'Soyad').valid).toBe(false);
  });
});

describe('validateFirstLast', () => {
  it('normal ad soyadı kabul eder', () => {
    expect(validateFirstLast('Ahmet', 'Yılmaz').valid).toBe(true);
  });
  it('çok kelimeli adı kabul eder, soyad tek kelime kalır', () => {
    expect(validateFirstLast('Ahmet Mehmet', 'Yılmaz').valid).toBe(true);
    expect(validateFirstLast('Ahmet', 'Yılmaz Kaya').valid).toBe(false);
  });
  it('soyadsız kaydı reddeder', () => {
    const r = validateFirstLast('Ahmet', '');
    expect(r.valid).toBe(false);
    expect(r.reason).toContain('Soyad');
  });
  it('adsız kaydı reddeder', () => {
    const r = validateFirstLast('', 'Yılmaz');
    expect(r.valid).toBe(false);
    expect(r.reason).toContain('Ad');
  });
  it('toplam uzunluk sınırını uygular', () => {
    const long = 'Ahmet '.repeat(12).trim();
    expect(`${long} Yılmaz`.length).toBeGreaterThan(FULL_NAME_MAX);
    expect(validateFirstLast(long, 'Yılmaz').valid).toBe(false);
  });
});

describe('validateFullName', () => {
  it('tek alanda "Ad Soyad" kabul edilir', () => {
    expect(validateFullName('Ahmet Yılmaz').valid).toBe(true);
    expect(validateFullName('  Ahmet   Yılmaz ').valid).toBe(true);
  });
  it('tek kelime reddedilir — soyad şart', () => {
    const r = validateFullName('Ahmet');
    expect(r.valid).toBe(false);
    expect(r.reason).toContain('Soyad');
  });
  it('e-posta yerel kısmı gibi değerler reddedilir', () => {
    // handle_new_user, isim yoksa e-postanın @ öncesini yazıyordu; S8 bunu geçersiz sayar.
    expect(validateFullName('mirackeremcuruksulu').valid).toBe(false);
    expect(validateFullName('ahmet.yilmaz').valid).toBe(false);
    expect(validateFullName('user123').valid).toBe(false);
  });
  it('boş değer reddedilir', () => {
    expect(validateFullName('').valid).toBe(false);
    expect(validateFullName(null).valid).toBe(false);
  });
});
