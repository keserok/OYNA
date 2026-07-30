// ─── Beyan edilen seviye → seviye bandı: TEK DÖNÜŞÜM KURALI ─────────────────
//
// profiles.self_skill (1–10) oyuncunun KENDİ beyanıdır. Kamusal yüzeylerde ham
// sayı GÖSTERİLMEZ; üç banda indirgenir. Ham değer yalnız iki yerde görünür:
// onboarding seviye adımı ve profil ayarları — yani kullanıcının kendi seçimi.
//
// Neden band: kadroda "ben 7 o 6" kıyası kurmasın, beyan şişirme baskısı
// doğmasın ve Plei'nin okunması kolay dilini (Beginner/Intermediate/Advanced)
// Türkçe karşılığıyla verelim.
//
// Beyan YOKSA null döner → çağıran çipi HİÇ çizmez (uydurma etiket basılmaz).
// Eski profiller (self_skill sütunu gelmeden önce tamamlananlar) bu durumdadır.

export const SELF_SKILL_MIN = 1;
export const SELF_SKILL_MAX = 10;

export type SkillBandKey = 'baslangic' | 'orta' | 'ileri';

export interface SkillBand {
  key: SkillBandKey;
  /** Kamusal etiket — uppercase basılacaksa kök öğede lang="tr" ŞART. */
  label: string;
  color: string;
  /** Onboarding/profil ekranındaki tek satır açıklama. */
  description: string;
}

const BANDS: Record<SkillBandKey, SkillBand> = {
  baslangic: {
    key: 'baslangic',
    label: 'BAŞLANGIÇ',
    color: '#60A5FA',
    description: 'Yeni başlıyorum, keyif için oynuyorum.',
  },
  orta: {
    key: 'orta',
    label: 'ORTA',
    color: '#FACC15',
    description: 'Düzenli oynuyorum, temel becerilerim var.',
  },
  ileri: {
    key: 'ileri',
    label: 'İLERİ',
    color: '#10b981',
    description: 'Deneyimliyim, tempolu maç oynayabilirim.',
  },
};

/**
 * 1–3 BAŞLANGIÇ · 4–7 ORTA · 8–10 İLERİ.
 * Beyan yok / geçersiz → null (çip çizilmez).
 */
export function skillBand(value?: number | null): SkillBand | null {
  if (value == null || !Number.isFinite(value)) return null;
  const v = Math.round(value);
  if (v < SELF_SKILL_MIN || v > SELF_SKILL_MAX) return null;
  if (v <= 3) return BANDS.baslangic;
  if (v <= 7) return BANDS.orta;
  return BANDS.ileri;
}

/** Beyanın geçerli aralıkta olup olmadığı (sunucu CHECK'inin istemci ikizi). */
export function isValidSelfSkill(value?: number | null): boolean {
  return value != null && Number.isInteger(value)
    && value >= SELF_SKILL_MIN && value <= SELF_SKILL_MAX;
}
