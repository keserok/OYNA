import { describe, it, expect } from 'vitest';
import { computeCardFee, cardFeeOf } from '../../services/paymentService';

// SÖZLEŞME: kart işlem bedeli YALNIZ karttan çekilen tabana uygulanır ve
// sunucudaki round(base * pct / 100, 2) ile BİREBİR aynı sonucu vermelidir —
// aksi halde ekranda yazan toplam ile karttan çekilen tutar ayrışır.
describe('computeCardFee — ekran/sunucu yuvarlaması aynı', () => {
  it('yuvarlak tutarlar', () => {
    expect(computeCardFee(1000, 2.5)).toBe(25);
    expect(computeCardFee(300, 2.5)).toBe(7.5);
    expect(computeCardFee(180, 2.5)).toBe(4.5);
  });

  it('kuruş yuvarlaması 2 haneye iner', () => {
    expect(computeCardFee(133, 2.5)).toBe(3.33);   // 3.325 → 3.33
    expect(computeCardFee(99.99, 2.5)).toBe(2.5);  // 2.49975 → 2.50
  });

  it('oran 0 → özellik kapalı, bedel yok', () => {
    expect(computeCardFee(1000, 0)).toBe(0);
  });

  it('geçersiz/sıfır taban bedel üretmez', () => {
    expect(computeCardFee(0, 2.5)).toBe(0);
    expect(computeCardFee(-100, 2.5)).toBe(0);
  });

  it('farklı oranlar', () => {
    expect(computeCardFee(1000, 1)).toBe(10);
    expect(computeCardFee(1000, 3.75)).toBe(37.5);
  });
});

// cardFeeOf TAHMİN değildir: sunucunun gerçekten çektiği toplamdan hizmet
// tabanını düşer. Başarı ekranındaki rakam budur.
describe('cardFeeOf — tahsil edilen gerçek bedel', () => {
  it('tamamı karttan', () => {
    // 1000₺ hizmet, bakiye yok, karttan 1025₺ çekilmiş → bedel 25₺
    expect(cardFeeOf(1000, 1025, 0)).toBe(25);
  });

  it('bakiye + kart karışık: bedel yalnız kart kısmına', () => {
    // 1000₺ hizmetin 400₺'si bakiyeden; kalan 600₺ + 15₺ bedel karttan
    expect(cardFeeOf(1000, 615, 400)).toBe(15);
  });

  it('tamamı bakiyeden → bedel yok', () => {
    expect(cardFeeOf(1000, 0, 1000)).toBe(0);
  });

  it('bedelsiz kart ödemesi (oran 0)', () => {
    expect(cardFeeOf(1000, 1000, 0)).toBe(0);
  });

  it('negatif sonuç üretmez (beklenmedik sunucu değeri)', () => {
    expect(cardFeeOf(1000, 900, 0)).toBe(0);
  });

  it('kuruşlu tutarlarda kayan nokta artığı bırakmaz', () => {
    expect(cardFeeOf(180, 184.5, 0)).toBe(4.5);
    expect(cardFeeOf(133, 136.33, 0)).toBe(3.33);
  });
});
