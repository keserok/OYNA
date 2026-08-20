import { describe, it, expect } from 'vitest';
import { odemeKirilimi } from '../../shared/odemeYuvarlama';

// ═══════════════════════════════════════════════════════════════════════════
// ETİKETTE YAZAN = ÇEKİLEN — karar kilidi (kurucu kararı, 20 Ağustos 2026)
//
//   "Kullanıcı herhangi bir maçta slotta kaç lira yazıyorsa onu ödemeli,
//    ödeme ekranında artmış ücretle asla karşılaşmamalı. Bu kararı her
//    yere uygula."
//
// Bu dosya 19 Ağustos modelini (%3,5 bedel + 10'a yukarı yuvarlama)
// kilitliyordu; o model 90 ₺'lik slotu ödeme ekranında 100 ₺ yapıyordu ve
// 20 Ağustos kararıyla KALDIRILDI. Buradaki testler yeni kuralı kilitler:
// hangi taban ve hangi oran verilirse verilsin, toplam = taban.
// ═══════════════════════════════════════════════════════════════════════════

describe('kurucunun şikayet ettiği örnek', () => {
  it('90 ₺ yazan slot → karttan 90 ₺ çekilir (100 DEĞİL)', () => {
    const k = odemeKirilimi(90, 3.5);
    expect(k.toplam).toBe(90);
    expect(k.bedel).toBe(0);
    expect(k.yuvarlama).toBe(0);
  });
});

describe('etikette yazan = çekilen — her taban, her oran', () => {
  const tabanlar = [1, 7, 49, 70, 90, 100, 120, 150, 233.33, 300, 400, 555.55, 1000, 1234.56];
  for (const oran of [0, 2.5, 3.5, 4.2, 15]) {
    it(`oran %${oran} verilse bile toplam tabanın kendisi`, () => {
      for (const t of tabanlar) {
        const k = odemeKirilimi(t, oran);
        expect(k.toplam, `taban ${t}`).toBe(Math.round(t * 100) / 100);
        expect(k.bedel).toBe(0);
        expect(k.yuvarlama).toBe(0);
        expect(k.oran).toBe(0); // ekrana "%X bedel" cümlesi kuracak oran kalmadı
      }
    });
  }

  it('buçuklu etiket buçuklu çekilir — yuvarlama diye bir şey yok', () => {
    // Yuvarlak rakam isteyen FİYATI yuvarlak koyar; tahsilat anında rakam
    // değiştirmek 19 Ağu modeliydi ve kullanıcı bunu "zam" olarak gördü.
    expect(odemeKirilimi(93.15, 3.5).toplam).toBe(93.15);
  });
});

describe('sınır durumları', () => {
  it('sıfır ve negatif taban → her alan 0', () => {
    for (const t of [0, -5, NaN as unknown as number]) {
      const k = odemeKirilimi(t, 3.5);
      expect(k.taban).toBe(0);
      expect(k.toplam).toBe(0);
    }
  });

  it('kuruş temizliği: kayan nokta artığı ekrana sızmaz', () => {
    expect(odemeKirilimi(0.1 + 0.2, 0).toplam).toBe(0.3);
  });
});
