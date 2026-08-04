// ════════════════════════════════════════════════════════════════════════════
// DOĞUM TARİHİ SEÇİCİ — tarih matematiği
// ════════════════════════════════════════════════════════════════════════════
//
// Tekerlek seçicinin sözü: GEÇERSİZ TARİH ÜRETİLEMEZ. "31 Şubat" gibi bir
// tarih seçilemez, gelecekteki bir gün seçilemez, saat dilimi yüzünden tarih
// bir gün kaymaz. Bu üç söz saf fonksiyonlarda yaşıyor; burada kilitleniyor.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  AYLAR, MIN_YEAR, daysInMonth, toISODateLocal, parseISODate, yasHesapla,
} from '../../components/profile/BirthdatePicker';

describe('ay uzunluğu', () => {
  it('31 / 30 günlük ayları doğru sayar', () => {
    expect(daysInMonth(2025, 1)).toBe(31);  // Ocak
    expect(daysInMonth(2025, 4)).toBe(30);  // Nisan
    expect(daysInMonth(2025, 12)).toBe(31); // Aralık
  });

  it('artık yılı bilir', () => {
    expect(daysInMonth(2024, 2)).toBe(29);  // artık
    expect(daysInMonth(2025, 2)).toBe(28);
    expect(daysInMonth(2000, 2)).toBe(29);  // 400'e bölünen → artık
    expect(daysInMonth(1900, 2)).toBe(28);  // 100'e bölünen ama 400'e değil
  });
});

describe('ISO biçimi — saat dilimi kaymaz', () => {
  it('gün/ay tek haneliyken sıfırla doldurur', () => {
    expect(toISODateLocal(1998, 1, 5)).toBe('1998-01-05');
    expect(toISODateLocal(2000, 11, 15)).toBe('2000-11-15');
  });

  it('toISOString KULLANILMIYOR — doğu saat diliminde gün geri kaymaz', () => {
    // `new Date(1998,0,1).toISOString()` UTC+3'te "1997-12-31" verir.
    // Bizim fonksiyon parçaları doğrudan birleştirir, tarih hiç dönüşmez.
    expect(toISODateLocal(1998, 1, 1)).toBe('1998-01-01');
  });
});

describe('ISO ayrıştırma', () => {
  it('geçerli tarihi parçalar', () => {
    expect(parseISODate('1998-11-15')).toEqual({ y: 1998, m1: 11, d: 15 });
  });

  it('boş / bozuk / aralık dışı girdide null döner', () => {
    for (const kotu of ['', '1998', '1998-13-01', '1998-00-10', '1998-05-00', 'abc', '98-1-1']) {
      expect(parseISODate(kotu), kotu).toBeNull();
    }
  });
});

describe('yaş hesabı', () => {
  const now = new Date(2026, 7, 4); // 4 Ağustos 2026

  it('doğum günü geçtiyse tam yaş', () => {
    expect(yasHesapla(1998, 3, 1, now)).toBe(28);
  });

  it('doğum günü GELMEDİYSE bir eksik', () => {
    expect(yasHesapla(1998, 12, 1, now)).toBe(27);
  });

  it('tam doğum gününde yaş artmış sayılır', () => {
    expect(yasHesapla(1998, 8, 4, now)).toBe(28);
  });

  it('doğum gününden bir gün önce henüz artmamıştır', () => {
    expect(yasHesapla(1998, 8, 5, now)).toBe(27);
  });
});

// ─── Kaynak düzeyinde iki koruma ───────────────────────────────────────────
// İkisi de düşmanca incelemede yakalandı; ikisi de gözle görülmeyen ama
// kullanıcıyı doğrudan vuran türden.
describe('tekerlek — sessiz tuzaklar', () => {
  const kaynak = readFileSync(join(process.cwd(), 'components/profile/BirthdatePicker.tsx'), 'utf8');
  const sheet = readFileSync(join(process.cwd(), 'components/profile/ProfileEditSheet.tsx'), 'utf8');

  it('tekerlek uygulamanın kaydırma motorundan MUAF', () => {
    // Muaf olmazsa motor devralıp her karede scrollTop yazıyor, snap de her
    // yazımda en yakın öğeye kilitliyor → tekerlek parmağın altında zıplıyor.
    // Motor YATAY şeritlerde snap'i atlıyor ama dikeyde böyle bir muafiyet yok.
    expect(kaynak).toContain('data-oyna-no-bounce');
  });

  it('geri tuşu / Esc önce seçiciyi kapatıyor, ekrandan çıkmıyor', () => {
    // Kayıt olmazsa Android geri tuşu doğrudan goBack() çalıştırıp Ayarlar'dan
    // çıkıyor ve kaydedilmemiş düzenlemeler siliniyordu.
    expect(kaynak).toMatch(/useBackDismiss\(open, onCancel, 'birthdate-picker', 5\)/);
    expect(sheet).toMatch(/useBackDismiss\(open,[\s\S]{0,80}'profile-edit'\)/);
  });

  it('seçici, düzenleme katmanından DAHA ÜSTTE kapanır', () => {
    // Öncelik eşit olsaydı hangisinin kapanacağı yığın sırasına kalırdı.
    expect(kaynak).toContain("'birthdate-picker', 5");
  });
});

describe('sabitler', () => {
  it('12 ay, Türkçe ve sırayla', () => {
    expect(AYLAR).toHaveLength(12);
    expect(AYLAR[0]).toBe('Ocak');
    expect(AYLAR[10]).toBe('Kasım');
    expect(AYLAR[11]).toBe('Aralık');
  });

  it('en eski yıl kimseyi dışarıda bırakmayacak kadar geride', () => {
    expect(MIN_YEAR).toBeLessThanOrEqual(1940);
  });
});
