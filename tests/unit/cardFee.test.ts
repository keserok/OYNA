import { describe, it, expect } from 'vitest';
import { computeCardFee, cardFeeOf } from '../../services/paymentService';

// SÖZLEŞME (kurucu kararı, 20 Ağu 2026): ETİKETTE YAZAN ÖDENİR — kart işlem
// bedeli tahsilattan kalktı. computeCardFee hangi oran verilirse verilsin 0
// döner; sunucudaki prepare_card_payment de eklemez. Bu describe eskiden
// %2,5'lik bedel matematiğini kilitliyordu — o model kaldırıldı.
describe('computeCardFee — bedel diye bir şey yok', () => {
  it('hangi oran verilirse verilsin 0', () => {
    expect(computeCardFee(1000, 2.5)).toBe(0);
    expect(computeCardFee(300, 2.5)).toBe(0);
    expect(computeCardFee(1000, 1)).toBe(0);
    expect(computeCardFee(1000, 3.75)).toBe(0);
    expect(computeCardFee(1000, 0)).toBe(0);
  });

  it('geçersiz/sıfır taban da bedel üretmez', () => {
    expect(computeCardFee(0, 2.5)).toBe(0);
    expect(computeCardFee(-100, 2.5)).toBe(0);
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
