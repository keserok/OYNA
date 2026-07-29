// ════════════════════════════════════════════════════════════════════════════
// SAHA (KORT) YAYIN KAPISI — TEK KAYNAK (SSOT)
// ----------------------------------------------------------------------------
// Kural: bir saha, KENDİ fiyat politikası (tarife satırı) olmadan yayına
// alınamaz ve uygulamadan rezervasyon kabul etmez.
//
// Bu modül sunucudaki iki kapının BİREBİR aynı kuralını uygular:
//   • trg_enforce_court_tariff_before_activate  (courts.is_active geçişi)
//   • trg_enforce_active_court_for_app_booking  (APP_BOOKING / APP_MATCH)
// (migration 20260828000008_saha_bazli_tarife_zorunlulugu)
//
// GERİYE DÖNÜK UYUM: kapı YALNIZ GEÇİŞTE çalışır. Zaten yayında olan eski
// sahalar, kendi tarifeleri olmasa da kapanmaz — sunucu tarafı da aynı şekilde
// davranır. Yeni yayın/rezervasyon ise tarife ister.
//
// Sahip paneli (views/OwnerPanel.tsx) ve admin paneli (admin-panel/views/
// PitchManager.tsx) aynı fonksiyonları çağırır; iki panelin kuralı ayrışamaz.
// ════════════════════════════════════════════════════════════════════════════

/** Kapı için yeterli tarife alanları — pitch_tariffs satırının alt kümesi. */
export interface CourtTariffLike {
  court_id?: string | null;
  is_active?: boolean | null;
}

/** Kapı için yeterli kort alanları. */
export interface CourtLike {
  id: string;
  is_active?: boolean | null;
}

/**
 * Bu sahanın KENDİ tarifesi var mı?
 *
 * Tesis geneli (court_id = null) satırlar SAYILMAZ: ürün kararı gereği her saha
 * kendi politikasını girer. Eski tesis-geneli satırlar fiyat çözümlemesinde
 * yedek olarak durmaya devam eder (veri bozulmasın), ama yayın kapısını açmaz.
 */
export function courtHasOwnTariff(
  tariffs: readonly CourtTariffLike[] | null | undefined,
  courtId: string | null | undefined,
): boolean {
  if (!courtId) return false;
  return (tariffs ?? []).some((t) => t.court_id === courtId && t.is_active !== false);
}

/** Kendi tarifesi olmayan AKTİF sahalar — menüdeki/panellerdeki dürüst uyarı. */
export function courtsMissingTariff(
  courts: readonly CourtLike[] | null | undefined,
  tariffs: readonly CourtTariffLike[] | null | undefined,
): string[] {
  return (courts ?? [])
    .filter((c) => c.is_active !== false)
    .filter((c) => !courtHasOwnTariff(tariffs, c.id))
    .map((c) => c.id);
}

/** Sahibe gösterilecek NET çağrı — sessiz hata yok. */
export const COURT_TARIFF_REQUIRED_MESSAGE =
  'Bu saha için önce fiyat politikası gir — tarifesi olmayan saha yayına alınamaz.';

export interface PublishAttempt {
  /** Düzenlemeye girerkenki yayın durumu (geçiş tespiti için). */
  wasActive: boolean;
  /** Kaydedilmek istenen yayın durumu. */
  nextActive: boolean;
  /** Sahanın kendi tarifesi var mı? */
  hasOwnTariff: boolean;
}

export interface PublishDecision {
  allowed: boolean;
  /** Engellendiyse kullanıcıya gösterilecek Türkçe cümle. */
  reason?: string;
}

/**
 * Saha yayına alınabilir mi?
 *
 * - Yayından çıkarma her zaman serbest (müşteriyi korumaz ama sahibi kilitlemez).
 * - Zaten yayındaki sahayı düzenlemek serbesttir (geçiş yok → kapı çalışmaz).
 * - Kapalı → yayında geçişi YALNIZ kendi tarifesi olan sahada mümkündür.
 */
export function canPublishCourt(attempt: PublishAttempt): PublishDecision {
  if (!attempt.nextActive) return { allowed: true };
  if (attempt.wasActive) return { allowed: true }; // geçiş yok — eski saha kapanmaz
  if (attempt.hasOwnTariff) return { allowed: true };
  return { allowed: false, reason: COURT_TARIFF_REQUIRED_MESSAGE };
}
