// Klavye konumlandırma bekçisi — "yazılan alan ASLA klavyenin altında kalmasın".
//
// NEDEN VAR (2026-07-30):
//   Odaklanan alan `scrollIntoView({ block: 'center' })` ile kaydırma kabının
//   ORTASINA taşınıyordu. Kap tüm ekran yüksekliğinde olduğu için "orta" =
//   ekranın %50'si. Klavye ekranın %45-55'ini kapladığında alan hâlâ klavyenin
//   ARKASINDA kalabiliyordu — kullanıcı ne yazdığını göremiyordu.
//
//   Artık kaydırma miktarı, klavyenin ÜSTÜNDE kalan görünür yüksekliğe göre
//   hesaplanıyor. Bu dosya o hesabı kilitler.
//
// Gerçek cihaz notu: bu test matematiği doğrular, native klavyeyi taklit etmez.
// Cihaz üstü doğrulama APK ile yapılır.

import { describe, it, expect } from 'vitest';
import { kaydirmaMiktari, KLAVYE_PAYI, ortulenYukseklik } from '../../services/keyboardManager';

// Tipik telefon: 800px ekran, 340px klavye → 460px görünür alan.
const GORUNUR = 460;

describe('yazılan alan klavyenin altında kalmıyor', () => {
  it('klavyenin altına düşen alan yukarı çekiliyor', () => {
    // Alan 600-658 arasında; görünür alan 460'ta bitiyor → tamamen klavyenin altında.
    const fark = kaydirmaMiktari(600, 658, GORUNUR);
    expect(fark).not.toBeNull();
    expect(fark!).toBeGreaterThan(0); // aşağı kaydır = içerik yukarı kayar
  });

  it('kaydırma sonrası alanın ALTI klavyenin üstünde kalıyor — asıl söz', () => {
    for (const [ust, alt] of [[600, 658], [455, 513], [700, 780], [459, 461]]) {
      const fark = kaydirmaMiktari(ust, alt, GORUNUR);
      const yeniAlt = alt - (fark ?? 0); // kap kayınca alan yukarı taşınır
      expect(yeniAlt, `alan (${ust}-${alt}) kaydıktan sonra hâlâ klavyenin altında`)
        .toBeLessThanOrEqual(GORUNUR - KLAVYE_PAYI + 0.001);
    }
  });

  it('zaten görünür alanda kaydırma yapılmıyor — ekran titremesin', () => {
    // 200-258: hem üst payın altında değil hem de klavyenin çok üstünde.
    expect(kaydirmaMiktari(200, 258, GORUNUR)).toBeNull();
  });

  it('sınırda duran alan (tam klavye üstü) rahatsız edilmiyor', () => {
    // Altı tam hedefte: 460 - 20 = 440.
    expect(kaydirmaMiktari(382, 440, GORUNUR)).toBeNull();
  });

  it('1px taşan alan bile düzeltiliyor — pay yutulmuyor', () => {
    const fark = kaydirmaMiktari(383, 441, GORUNUR);
    expect(fark).toBeCloseTo(1, 5);
  });

  it('ekranın üstüne taşan alan aşağı çekiliyor', () => {
    // Alan kısmen ekranın üstünde (top negatif) → yukarı değil AŞAĞI kaydırılmalı.
    const fark = kaydirmaMiktari(-30, 28, GORUNUR);
    expect(fark).not.toBeNull();
    expect(fark!).toBeLessThan(0);
    expect(-30 - fark!).toBeCloseTo(KLAVYE_PAYI, 5); // üst pay kadar içeri girer
  });

  it('klavye kapalıyken (görünür = tam ekran) alt alanlar rahat bırakılıyor', () => {
    // 800px ekran, klavye yok: 700-758 arası alan görünür sayılmalı.
    expect(kaydirmaMiktari(700, 758, 800)).toBeNull();
  });
});

// ─── ÇİFT TELAFİ BEKÇİSİ (2026-08-17, mağaza gönderimi öncesi) ───────────────
//
// Klavye açılınca kabuğu kim küçültüyor? iOS'ta eklenti (resize: body),
// Android'de sistem. Bu iki durumda kabuk ZATEN klavyenin üstünde bitiyor;
// buna rağmen `body.kb-open .pb-safe` kuralı bir klavye boyu daha alt boşluk
// ekliyordu. Sonuç: sohbet yazma alanı ve kart formu ekranın ortasına
// fırlıyor, mesaj listesine yer kalmıyordu. Artık örtülen miktar ÖLÇÜLÜYOR.
describe('Klavye · çift telafi olmasın', () => {
  const EKRAN = 844;   // iPhone 14/15 mantıksal yükseklik
  const KLAVYE = 336;

  it('kabuk küçüldüyse EK BOŞLUK YOK (iOS resize:body + Android adjustResize)', () => {
    // Kabuk da görsel alan da klavye kadar küçüldü.
    expect(ortulenYukseklik(EKRAN - KLAVYE, EKRAN - KLAVYE)).toBe(0);
  });

  it('kabuk küçülmediyse TAM telafi (resize:none / küçültme çalışmıyor)', () => {
    expect(ortulenYukseklik(EKRAN, EKRAN - KLAVYE)).toBe(KLAVYE);
  });

  it('yarı küçülme durumunda yalnız KALAN fark telafi edilir', () => {
    expect(ortulenYukseklik(EKRAN - 100, EKRAN - KLAVYE)).toBe(KLAVYE - 100);
  });

  it('piksel yuvarlaması "klavye açık" sanılmaz (4px tolerans)', () => {
    expect(ortulenYukseklik(844, 841.5)).toBe(0);
    expect(ortulenYukseklik(844.4, 844)).toBe(0);
  });

  it('klavye kapalıyken 0', () => {
    expect(ortulenYukseklik(EKRAN, EKRAN)).toBe(0);
  });

  it('görsel alanın üst kayması (yakınlaştırma) hesaba katılır', () => {
    // Görsel alan 100px aşağı kaymışsa alttan örtülen o kadar azdır.
    expect(ortulenYukseklik(EKRAN, EKRAN - KLAVYE, 100)).toBe(KLAVYE - 100);
  });
});
