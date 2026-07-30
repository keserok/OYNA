import { describe, it, expect } from 'vitest';
import { skillBand, isValidSelfSkill, SELF_SKILL_MIN, SELF_SKILL_MAX } from '../../utils/skillBand';

// ─── BEYAN EDİLEN SEVİYE → BAND: TEK DÖNÜŞÜM KURALI ─────────────────────────
//
// Karar: kamusal beceri göstergesi akran ortalaması DEĞİL, oyuncunun kendi
// beyanı. Kadroda ham sayı gösterilmez, üç banda indirgenir:
//   1–3 BAŞLANGIÇ · 4–7 ORTA · 8–10 İLERİ
// Beyan yoksa null → çağıran çipi HİÇ çizmez (uydurma etiket basılmaz).

describe('skillBand — band sınırları', () => {
  it('1-3 BASLANGIC', () => {
    for (const v of [1, 2, 3]) {
      expect(skillBand(v)?.label, `deger ${v}`).toBe('BAŞLANGIÇ');
      expect(skillBand(v)?.color).toBe('#60A5FA');
    }
  });

  it('4-7 ORTA', () => {
    for (const v of [4, 5, 6, 7]) {
      expect(skillBand(v)?.label, `deger ${v}`).toBe('ORTA');
      expect(skillBand(v)?.color).toBe('#FACC15');
    }
  });

  it('8-10 ILERI', () => {
    for (const v of [8, 9, 10]) {
      expect(skillBand(v)?.label, `deger ${v}`).toBe('İLERİ');
      expect(skillBand(v)?.color).toBe('#10b981');
    }
  });

  it('band sinirlari tam noktada degisir (3->4 ve 7->8)', () => {
    expect(skillBand(3)?.key).toBe('baslangic');
    expect(skillBand(4)?.key).toBe('orta');
    expect(skillBand(7)?.key).toBe('orta');
    expect(skillBand(8)?.key).toBe('ileri');
  });
});

describe('skillBand — beyan yoksa çip çizilmez', () => {
  it('null / undefined -> null', () => {
    expect(skillBand(null)).toBeNull();
    expect(skillBand(undefined)).toBeNull();
  });

  it('aralik disi -> null (varsayilan banda DUSMEZ)', () => {
    expect(skillBand(0)).toBeNull();
    expect(skillBand(11)).toBeNull();
    expect(skillBand(-3)).toBeNull();
    expect(skillBand(100)).toBeNull();
  });

  it('sayi olmayan -> null', () => {
    expect(skillBand(NaN)).toBeNull();
    expect(skillBand(Infinity)).toBeNull();
  });

  it('ondalikli deger yuvarlanir', () => {
    expect(skillBand(3.4)?.key).toBe('baslangic'); // 3
    expect(skillBand(3.6)?.key).toBe('orta');      // 4
  });
});

describe('isValidSelfSkill — sunucu CHECK ikizi', () => {
  it('1..10 tamsayi gecerli', () => {
    for (let v = SELF_SKILL_MIN; v <= SELF_SKILL_MAX; v++) {
      expect(isValidSelfSkill(v), `deger ${v}`).toBe(true);
    }
  });

  it('aralik disi, ondalikli, null gecersiz', () => {
    expect(isValidSelfSkill(0)).toBe(false);
    expect(isValidSelfSkill(11)).toBe(false);
    expect(isValidSelfSkill(5.5)).toBe(false);
    expect(isValidSelfSkill(null)).toBe(false);
    expect(isValidSelfSkill(undefined)).toBe(false);
  });

  it('her gecerli deger MUTLAKA bir banda dusuyor (bosluk yok)', () => {
    for (let v = SELF_SKILL_MIN; v <= SELF_SKILL_MAX; v++) {
      expect(skillBand(v), `deger ${v} bandsiz kaldi`).not.toBeNull();
    }
  });
});
