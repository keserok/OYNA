// ════════════════════════════════════════════════════════════════════════
// AD SOYAD DOĞRULAMA — TEK KAYNAK (SSOT)
//
// S8: "Kayıtta ad soyad zorunlu." Aynı kural üç yerde geçerli olmalı:
//   • views/AuthScreen.tsx        — e-posta + şifre ile kayıt formu
//   • views/Onboarding.tsx        — 2. adım (ad/soyad), atlanamaz
//   • public.apply_onboarding     — sunucu kapısı (migration 20260728174639)
//
// Sunucudaki `public.is_valid_person_name(text)` bu dosyanın SQL ikizidir;
// biri değişirse diğeri de değişmelidir. tests/unit/personName.test.ts hem
// kuralları hem de sunucu ikiziyle aynı örnekleri doğrular.
// ════════════════════════════════════════════════════════════════════════

/** Ad ya da soyad için tek kelimede izin verilen en az/en çok karakter. */
export const NAME_PART_MIN = 2;
export const NAME_PART_MAX = 24;
/** Ad + soyad birleşimi için üst sınır (profiles.full_name'e yazılan değer). */
export const FULL_NAME_MAX = 60;

/**
 * Türkçe harfler + kesme işareti + tire. Rakam, noktalama, emoji yasak.
 * Kesme/tire ancak harfler ARASINDA olabilir ("Şeyh-ül", "D'Angelo").
 */
const NAME_PART_RE = /^[A-Za-zÇĞİIÖŞÜçğıiöşüÂÎÛâîû]+(?:[''-][A-Za-zÇĞİIÖŞÜçğıiöşüÂÎÛâîû]+)*$/;

/** Baştaki/sondaki ve aradaki fazla boşlukları temizler. */
export const normalizeNameInput = (raw: string | null | undefined): string =>
  (raw ?? '').replace(/\s+/g, ' ').trim();

export type NameCheck = { valid: boolean; reason?: string };

/** Tek bir ad ya da soyad parçasını doğrular. */
export function validateNamePart(raw: string | null | undefined, label: string): NameCheck {
  const v = normalizeNameInput(raw);
  if (v.length === 0) return { valid: false, reason: `${label} zorunlu.` };
  if (v.includes(' ')) return { valid: false, reason: `${label} tek kelime olmalı.` };
  if (v.length < NAME_PART_MIN) return { valid: false, reason: `${label} en az ${NAME_PART_MIN} harf olmalı.` };
  if (v.length > NAME_PART_MAX) return { valid: false, reason: `${label} en fazla ${NAME_PART_MAX} harf olabilir.` };
  if (!NAME_PART_RE.test(v)) return { valid: false, reason: `${label} yalnız harflerden oluşmalı.` };
  return { valid: true };
}

/**
 * Ayrı ad ve soyad alanlarını doğrular (onboarding 2. adım).
 * Ad birden çok kelime olabilir ("Ahmet Mehmet"); soyad tek kelimedir.
 */
export function validateFirstLast(first: string, last: string): NameCheck {
  const f = normalizeNameInput(first);
  const l = normalizeNameInput(last);
  if (f.length === 0) return { valid: false, reason: 'Adın zorunlu.' };
  if (l.length === 0) return { valid: false, reason: 'Soyadın zorunlu.' };
  for (const part of f.split(' ')) {
    const r = validateNamePart(part, 'Ad');
    if (!r.valid) return r;
  }
  const lr = validateNamePart(l, 'Soyad');
  if (!lr.valid) return lr;
  if (`${f} ${l}`.length > FULL_NAME_MAX) {
    return { valid: false, reason: `Ad soyad en fazla ${FULL_NAME_MAX} karakter olabilir.` };
  }
  return { valid: true };
}

/**
 * Tek alanda girilen "Ad Soyad" metnini doğrular (kayıt formu).
 * En az iki kelime ister — soyadsız kayıt kabul edilmez.
 */
export function validateFullName(raw: string | null | undefined): NameCheck {
  const v = normalizeNameInput(raw);
  if (v.length === 0) return { valid: false, reason: 'Ad soyad zorunlu.' };
  const parts = v.split(' ');
  if (parts.length < 2) return { valid: false, reason: 'Soyadını da yaz (örn. "Ahmet Yılmaz").' };
  return validateFirstLast(parts.slice(0, -1).join(' '), parts[parts.length - 1]);
}
