// IP-23 bekçisi — formasyon verisi.
//
// KANONİK KURAL (uygulamanın kendi üreticisiyle sabitlenmiş —
// Studio.generateFormationFromPattern):
//   • Ad = DEF-MID-FWD
//   • Kaleci ada DÂHİL DEĞİL
//   • Slot sayısı = N (kaleci dâhil)
//   • Formasyon başına TAM 1 kaleci
//
// Bu kural yazılıydı ama hiçbir test onu doğrulamıyordu; 22 formasyonun 3'ü
// kuralı ihlal ediyordu. En kötüsü `3v3 · 2-0-1`: adı forvet vaat ediyordu ama
// forvet slotu HİÇ yoktu, dolayısıyla kadrodaki forvet oyuncu sahaya giremiyordu
// (populateSlotsWithSquad hat eşleşmesiyle dolduruyor).

import { describe, it, expect } from 'vitest';
import {
  FORMATIONS, SQUAD_SIZES, squadSizeToCount, defaultFormation, cloneSlots, resolveFormation,
  type SquadSize,
} from '../../utils/formations';

/** Her (boyut, formasyon) çifti — it.each için düz liste. */
const TUM_FORMASYONLAR: Array<[SquadSize, string]> = SQUAD_SIZES.flatMap(
  (size) => Object.keys(FORMATIONS[size]).map((ad) => [size, ad] as [SquadSize, string]),
);

describe('formasyon adı içeriğiyle uyuşuyor', () => {
  it('22 formasyon tanımlı — kapsam daralmadı', () => {
    expect(TUM_FORMASYONLAR.length).toBe(22);
  });

  it.each(TUM_FORMASYONLAR)('%s · %s', (size, ad) => {
    const slots = FORMATIONS[size][ad];
    const say = (r: string) => slots.filter((s) => s.role === r).length;

    // 1) Slot sayısı = kadro sayısı (kaleci dâhil)
    expect(slots.length, 'slot sayısı').toBe(squadSizeToCount(size));

    // 2) Tam bir kaleci
    expect(say('GK'), 'kaleci sayısı').toBe(1);

    // 3) Ad, saha oyuncularının hat dağılımını BİREBİR söylüyor
    const adDagilimi = ad.split('-').map(Number);
    expect(adDagilimi.length, `"${ad}" üç haneli olmalı`).toBe(3);
    expect([say('DEF'), say('MID'), say('FWD')], `"${ad}" adı içerikle çelişiyor`).toEqual(adDagilimi);

    // 4) Adın toplamı = saha oyuncusu sayısı (N − 1)
    expect(adDagilimi.reduce((a, b) => a + b, 0)).toBe(squadSizeToCount(size) - 1);
  });

  it.each(TUM_FORMASYONLAR)('%s · %s — slot kimlikleri benzersiz', (size, ad) => {
    const ids = FORMATIONS[size][ad].map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it.each(TUM_FORMASYONLAR)('%s · %s — koordinatlar sahanın içinde', (size, ad) => {
    for (const s of FORMATIONS[size][ad]) {
      expect(s.x, `${s.id}.x`).toBeGreaterThanOrEqual(0);
      expect(s.x, `${s.id}.x`).toBeLessThanOrEqual(100);
      expect(s.y, `${s.id}.y`).toBeGreaterThanOrEqual(0);
      expect(s.y, `${s.id}.y`).toBeLessThanOrEqual(100);
    }
  });
});

describe('düzeltilen üç formasyon', () => {
  it('2v2 — defans vaat eden ad kalmadı', () => {
    expect(FORMATIONS['2v2']['1-0-1']).toBeUndefined();
    expect(FORMATIONS['2v2']['0-0-1']).toBeDefined();
  });

  it('3v3 — defanssız dizilişin adı da defanssız', () => {
    expect(FORMATIONS['3v3']['1-1-1']).toBeUndefined();
    expect(FORMATIONS['3v3']['0-1-1'].map((s) => s.role)).toEqual(['GK', 'MID', 'FWD']);
  });

  it('3v3 — forvet vaat eden dizilişte artık forvet VAR', () => {
    // Eski '2-0-1': GK + DEF + DEF. Forvet oyuncu sahaya hiç giremiyordu.
    expect(FORMATIONS['3v3']['2-0-1']).toBeUndefined();
    expect(FORMATIONS['3v3']['1-0-1'].map((s) => s.role)).toEqual(['GK', 'DEF', 'FWD']);
  });
});

describe('eski adla kaydedilmiş taktikler kaybolmuyor', () => {
  it.each([
    ['2v2', '1-0-1', '0-0-1'],
    ['3v3', '1-1-1', '0-1-1'],
    ['3v3', '2-0-1', '1-0-1'],
  ] as Array<[SquadSize, string, string]>)('%s · %s → %s', (size, eski, yeni) => {
    expect(resolveFormation(size, eski)).toBe(yeni);
  });

  it('geçerli ad aynen döner', () => {
    expect(resolveFormation('7v7', '2-3-1')).toBe('2-3-1');
  });

  it('tanınmayan ad varsayılana düşer — boş ekran olmaz', () => {
    expect(resolveFormation('7v7', 'uyduruk')).toBe(defaultFormation('7v7'));
    expect(resolveFormation('7v7', null)).toBe(defaultFormation('7v7'));
    expect(resolveFormation('7v7', undefined)).toBe(defaultFormation('7v7'));
  });

  it('dönen ad HER ZAMAN çizilebilir', () => {
    for (const size of SQUAD_SIZES) {
      for (const giren of [null, undefined, '', 'yok-boyle-bir-sey', '1-0-1', '2-0-1', '1-1-1']) {
        const ad = resolveFormation(size, giren);
        expect(FORMATIONS[size][ad], `${size} · "${giren}" → "${ad}"`).toBeDefined();
      }
    }
  });
});

describe('yardımcılar', () => {
  it('squadSizeToCount kaleciyi de sayar', () => {
    expect(squadSizeToCount('7v7')).toBe(7);
    expect(squadSizeToCount('11v11')).toBe(11);
  });

  it('cloneSlots derin kopya döner — kaynağı kirletmez', () => {
    const a = cloneSlots('7v7', '2-3-1');
    a[0].x = -999;
    expect(FORMATIONS['7v7']['2-3-1'][0].x).not.toBe(-999);
  });

  it('her boyutun bir varsayılanı var', () => {
    for (const size of SQUAD_SIZES) {
      expect(FORMATIONS[size][defaultFormation(size)], size).toBeDefined();
    }
  });
});
