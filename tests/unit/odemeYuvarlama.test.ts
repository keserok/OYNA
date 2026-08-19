import { describe, it, expect } from 'vitest';
import { odemeKirilimi, onaYuvarla, YUVARLAMA_ADIMI } from '../../shared/odemeYuvarlama';

// ═══════════════════════════════════════════════════════════════════════════
// YUVARLAMA — karar kilidi (kurucu kararı, 19 Ağustos 2026)
//
//   "Kullanıcı asla buçuklu rakamlar ödemeyecek ve her seferinde onlar
//    basamağı yuvarlanmış rakamı ödeyecek, her seferinde yukarıya."
//   "Yuvarlama farkı OYNA'da kalsın."
// ═══════════════════════════════════════════════════════════════════════════

describe('kurucunun kendi örneği', () => {
  it('1.000 ₺ saha · %40 kapora · %3,5 bedel → 420 ₺', () => {
    const k = odemeKirilimi(400, 3.5);
    expect(k.taban).toBe(400);
    expect(k.bedel).toBe(14);      // gerçek altyapı bedeli
    expect(k.yuvarlama).toBe(6);   // 414 → 420
    expect(k.toplam).toBe(420);
  });
});

describe('kullanıcı her zaman 10\'un katını öder', () => {
  const tabanlar = [1, 7, 49, 100, 150, 233.33, 300, 400, 555.55, 1000, 1234.56];
  for (const oran of [0, 2.5, 3.5, 4.2, 15]) {
    it(`oran %${oran} — hiçbir tabanda küsurat çıkmıyor`, () => {
      for (const t of tabanlar) {
        const { toplam } = odemeKirilimi(t, oran);
        expect(toplam % YUVARLAMA_ADIMI, `taban ${t} → ${toplam}`).toBe(0);
      }
    });
  }

  it('oran 0 olsa bile yuvarlama uygulanır', () => {
    // Bedel kapansa da kullanıcı yuvarlak rakam görmeye devam etmeli.
    const k = odemeKirilimi(233.33, 0);
    expect(k.bedel).toBe(0);
    expect(k.toplam).toBe(240);
    expect(k.yuvarlama).toBe(6.67);
  });
});

describe('yuvarlama YUKARI, asla aşağı', () => {
  it('toplam ham tutardan küçük olamaz', () => {
    for (let t = 1; t <= 2000; t += 7) {
      const k = odemeKirilimi(t, 3.5);
      expect(k.toplam, `taban ${t}`).toBeGreaterThanOrEqual(k.taban + k.bedel);
    }
  });

  it('zaten 10\'un katı olan tutar bir üst basamağa taşınmaz', () => {
    expect(onaYuvarla(400)).toBe(400);
    expect(onaYuvarla(420)).toBe(420);
    expect(onaYuvarla(401)).toBe(410);
  });

  it('yuvarlama farkı asla bir adımdan büyük olmaz', () => {
    for (let t = 1; t <= 2000; t += 3) {
      const k = odemeKirilimi(t, 3.5);
      expect(k.yuvarlama, `taban ${t}`).toBeLessThan(YUVARLAMA_ADIMI);
      expect(k.yuvarlama).toBeGreaterThanOrEqual(0);
    }
  });
});

describe('taban yuvarlamadan ETKİLENMEZ (tesise giden tutar sabit)', () => {
  it('taban ne verildiyse o döner', () => {
    // Kurucu kararı: fark OYNA'da kalır, tesisin kaporasına eklenmez.
    for (const t of [400, 333.33, 1000]) {
      expect(odemeKirilimi(t, 3.5).taban).toBe(Math.round(t * 100) / 100);
    }
  });

  it('bedel gerçek orandan hesaplanır — yuvarlama ona karışmaz', () => {
    // Bedel iyzico'nun bizden kestiğiyle karşılaştırılabilir kalmalı.
    const k = odemeKirilimi(400, 3.5);
    expect(k.bedel).toBe(14);
    expect(k.bedel).not.toBe(20); // yuvarlama bedele yazılsaydı 20 olurdu
  });

  it('üç parça toplamı çekilen tutarı verir', () => {
    for (let t = 5; t <= 1500; t += 11) {
      const k = odemeKirilimi(t, 3.5);
      expect(Math.round((k.taban + k.bedel + k.yuvarlama) * 100) / 100).toBe(k.toplam);
    }
  });
});

describe('sınır durumları', () => {
  it('sıfır ve negatif taban sıfır döndürür', () => {
    expect(odemeKirilimi(0, 3.5).toplam).toBe(0);
    expect(odemeKirilimi(-50, 3.5).toplam).toBe(0);
  });

  it('negatif oran sıfır sayılır', () => {
    expect(odemeKirilimi(400, -5).bedel).toBe(0);
  });
});
