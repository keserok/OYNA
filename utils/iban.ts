/**
 * TR IBAN doğrulama (Faz 9 · Karar #31).
 * Format (TR + 24 rakam = 26 karakter) + ISO 7064 mod-97 checksum.
 * Boşlukları temizler; büyük/küçük harf duyarsız.
 */

export function normalizeIban(raw: string): string {
  return String(raw ?? '').replace(/\s+/g, '').toUpperCase();
}

/** Görüntü için 4'erli gruplama: TR12 3456 7890 ... */
export function formatIban(raw: string): string {
  return normalizeIban(raw).replace(/(.{4})/g, '$1 ').trim();
}

/** ISO 7064 mod-97: IBAN geçerliyse 1 döner. */
function mod97(iban: string): number {
  // İlk 4 karakteri sona taşı, harfleri sayıya çevir (A=10..Z=35), mod 97.
  const rearranged = iban.slice(4) + iban.slice(0, 4);
  let remainder = 0;
  for (const ch of rearranged) {
    const code = ch.charCodeAt(0);
    const val = code >= 65 && code <= 90 ? (code - 55).toString() : ch; // A-Z → 10-35
    for (const d of val) {
      remainder = (remainder * 10 + (d.charCodeAt(0) - 48)) % 97;
    }
  }
  return remainder;
}

export interface IbanValidation {
  valid: boolean;
  reason?: string;
}

/** TR IBAN tam doğrulama (format + checksum). */
export function validateTrIban(raw: string): IbanValidation {
  const iban = normalizeIban(raw);
  if (!iban) return { valid: false, reason: 'IBAN boş olamaz.' };
  if (!iban.startsWith('TR')) return { valid: false, reason: 'IBAN "TR" ile başlamalı.' };
  if (iban.length !== 26) return { valid: false, reason: 'TR IBAN 26 karakter olmalı (TR + 24 rakam).' };
  if (!/^TR\d{24}$/.test(iban)) return { valid: false, reason: 'IBAN yalnız TR ve rakamlardan oluşmalı.' };
  if (mod97(iban) !== 1) return { valid: false, reason: 'IBAN doğrulama basamağı geçersiz — kontrol edin.' };
  return { valid: true };
}
