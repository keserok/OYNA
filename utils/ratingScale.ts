// Oyuncu puanı (0–5) ↔ FIFA OVR (0–100) tek dönüşüm kaynağı.
//
// Kritik ayrım: "puanı yok" ≠ "5.0 puanı var". Hiç maç oynamamış ya da puanı
// olmayan oyuncu ROOKIE'dir; kartında OVR yerine "—" gösterilir. Aksi hâlde
// varsayılan 5.0 × 20 = 100 → yeni oyuncu her yerde "OVR 100 gold" görünürdü.
//
// Not: Fair-play/güven puanı BU ölçekte değildir — o, Master 3.4 gereği 100'den
// başlar ve yalnız düşer (yeni oyuncuda 100 doğrudur). Bu dosya SADECE beceri
// OVR'ı içindir.

export const RATING_MAX = 5;
export const OVERALL_MAX = 100;

export type CardTier = 'rookie' | 'bronze' | 'silver' | 'gold';

/** Oyuncu hiç maç oynamadıysa (veya sayı bilinmiyorsa) rookie'dir. */
export function isRookie(matchesPlayed: number | null | undefined): boolean {
  return matchesPlayed == null || !Number.isFinite(matchesPlayed) || matchesPlayed <= 0;
}

/**
 * 0–5 puanı 0–100 OVR'a çevirir. Rookie ya da geçersiz puanda `null` döner
 * (kart "—" göstermeli). Değer 0–5 aralığına kırpılır.
 */
export function ratingToOverall(
  rating: number | null | undefined,
  matchesPlayed: number | null | undefined,
): number | null {
  if (isRookie(matchesPlayed)) return null;
  if (rating == null || !Number.isFinite(rating)) return null;
  const clamped = Math.max(0, Math.min(RATING_MAX, rating));
  return Math.round(clamped * (OVERALL_MAX / RATING_MAX));
}

/** OVR'dan kart seviyesi. `null` OVR → rookie. */
export function tierForOverall(overall: number | null): CardTier {
  if (overall == null) return 'rookie';
  if (overall >= 80) return 'gold';
  if (overall >= 65) return 'silver';
  return 'bronze';
}

/** Kısayol: puan + maç sayısından doğrudan seviye. */
export function tierForRating(
  rating: number | null | undefined,
  matchesPlayed: number | null | undefined,
): CardTier {
  return tierForOverall(ratingToOverall(rating, matchesPlayed));
}
