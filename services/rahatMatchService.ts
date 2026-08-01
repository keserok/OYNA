import { supabase } from '../supabaseClient';

// ════════════════════════════════════════════════════════════════════════
// RAHAT MAÇ SERVİSİ — pozisyonsuz katılım akışının veri katmanı
//
// Rahat maç bir ekran değil bir MAÇ ÇEŞİDİ: slot makinesi, ödeme ve iade
// zinciri Ciddi/Taktiksel ile aynı (player_buy_slots_v2, leave_public_match_slot).
// Buradaki fonksiyonlar yalnız Rahat yüzeyinin İHTİYAÇ DUYDUĞU ekleri taşır:
//   • takım taşıma (player_move_slot_team — 20260730140253)
//   • devralma kodu (player_make_slot_code)
//   • tesis vitrini bilgisi (fotoğraf/olanak/açıklama/koordinat)
//   • onay saati + iade kademesi için CANLI konfig (uydurma sabit YOK)
// ════════════════════════════════════════════════════════════════════════

/** Satın alınan yeri karşı takıma taşır (para hareketi yok). */
export const moveSlotTeam = async (
  matchId: string,
  slotId: string,
  targetSide: 'home' | 'away',
): Promise<{ ok: boolean; moved: boolean; toSlot?: string }> => {
  const { data, error } = await supabase.rpc('player_move_slot_team', {
    p_match_id: matchId,
    p_slot_id: slotId,
    p_target_side: targetSide,
  });
  if (error) throw error;
  return (data ?? { ok: false, moved: false }) as { ok: boolean; moved: boolean; toSlot?: string };
};

/** Rezerve yer için paylaşılabilir devralma kodu üretir. */
export const makeSlotCode = async (matchId: string, slotId: string): Promise<string> => {
  const { data, error } = await supabase.rpc('player_make_slot_code', {
    p_match_id: matchId,
    p_slot_id: slotId,
  });
  if (error) throw error;
  return String(data ?? '');
};

/** Yedek listesine katıl (ödemesiz — yer açılınca satın alma yoluyla girilir). */
export const joinMatchReserve = async (matchId: string, userId: string): Promise<void> => {
  const { error } = await supabase.rpc('join_public_match_reserve', {
    p_match_id: matchId,
    p_user_id: userId,
  });
  if (error) throw error;
};

// ─── Tesis vitrini ──────────────────────────────────────────────────────────

export interface RahatPitchInfo {
  name: string | null;
  /** Tam adres. */
  location: string | null;
  district: string | null;
  description: string | null;
  amenities: string[];
  images: string[];
  /** Koordinat yoksa null — harita kartı HİÇ çizilmez (sahte pin basılmaz). */
  coordinates: { lat: number; lng: number } | null;
  /** Tesis bazlı iade kademesi override'ları (null = global varsayılan). */
  refundFullHours: number | null;
  refundHalfHours: number | null;
  refundHalfPct: number | null;
}

export const fetchRahatPitchInfo = async (pitchId: string): Promise<RahatPitchInfo | null> => {
  try {
    const { data, error } = await supabase
      .from('pitches')
      // DİKKAT: tesisin adres kolonu 'address'tir; 'location' DİYE BİR KOLON YOK.
      // PostgREST olmayan bir kolon istendiğinde TÜM sorguyu reddeder — bu yüzden
      // yanlış ad, tek alanı değil tesis kartının tamamını sessizce yok ediyordu.
      // Kanonik eşleme shared/pitchShowcaseMapper.ts:223 ile aynı: address → location.
      .select('name, address, district, city, description, amenities, images, latitude, longitude, refund_full_hours, refund_half_hours, refund_half_pct')
      .eq('id', pitchId)
      .maybeSingle();
    if (error) throw error;
    if (!data) return null;
    const row = data as Record<string, unknown>;
    const lat = typeof row.latitude === 'number' ? row.latitude : null;
    const lng = typeof row.longitude === 'number' ? row.longitude : null;
    const arr = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && !!x) : []);
    return {
      name: (row.name as string) || null,
      // Adres yoksa ilçe/il birleşimine düş (pitchShowcaseMapper ile aynı desen).
      location: (row.address as string)
        || [row.district, row.city].filter(Boolean).join(', ')
        || null,
      district: (row.district as string) || null,
      description: (row.description as string) || null,
      amenities: arr(row.amenities),
      images: arr(row.images),
      coordinates: lat != null && lng != null ? { lat, lng } : null,
      refundFullHours: typeof row.refund_full_hours === 'number' ? row.refund_full_hours : null,
      refundHalfHours: typeof row.refund_half_hours === 'number' ? row.refund_half_hours : null,
      refundHalfPct: typeof row.refund_half_pct === 'number' ? row.refund_half_pct : null,
    };
  } catch (e) {
    console.warn('[rahatMatch] tesis bilgisi çekilemedi:', e);
    return null;
  }
};

// ─── Canlı konfig: onay penceresi + iade kademesi ───────────────────────────
// settings satırı herkese açık SELECT'tir (settings_select_public).
// İade kademesi sunucudaki _pitch_refund_tiers ile AYNI çözünürlük sırasını
// izler: tesis override'ı → global settings → (24/6/50 sunucu varsayılanları).

export interface RahatMatchConfig {
  /** Maç başlamadan kaç saat önce onay/iptal kararı verilir (T-Ns). */
  captureWindowHours: number;
  refundFullHours: number;
  refundHalfHours: number;
  refundHalfPct: number;
}

const CONFIG_DEFAULTS: RahatMatchConfig = {
  captureWindowHours: 8,
  refundFullHours: 24,
  refundHalfHours: 6,
  refundHalfPct: 50,
};

export const fetchRahatMatchConfig = async (
  pitch?: Pick<RahatPitchInfo, 'refundFullHours' | 'refundHalfHours' | 'refundHalfPct'> | null,
): Promise<RahatMatchConfig> => {
  let global: Partial<RahatMatchConfig> = {};
  try {
    const { data } = await supabase
      .from('settings')
      .select('capture_window_hours, booking_refund_full_hours, booking_refund_half_hours, booking_refund_half_pct')
      .limit(1)
      .maybeSingle();
    const row = (data ?? {}) as Record<string, unknown>;
    global = {
      captureWindowHours: typeof row.capture_window_hours === 'number' ? row.capture_window_hours : undefined,
      refundFullHours: typeof row.booking_refund_full_hours === 'number' ? row.booking_refund_full_hours : undefined,
      refundHalfHours: typeof row.booking_refund_half_hours === 'number' ? row.booking_refund_half_hours : undefined,
      refundHalfPct: typeof row.booking_refund_half_pct === 'number' ? row.booking_refund_half_pct : undefined,
    };
  } catch {
    /* settings okunamazsa sunucu varsayılanlarına düşülür (aynı sabitler) */
  }
  return {
    captureWindowHours: global.captureWindowHours ?? CONFIG_DEFAULTS.captureWindowHours,
    refundFullHours: pitch?.refundFullHours ?? global.refundFullHours ?? CONFIG_DEFAULTS.refundFullHours,
    refundHalfHours: pitch?.refundHalfHours ?? global.refundHalfHours ?? CONFIG_DEFAULTS.refundHalfHours,
    refundHalfPct: pitch?.refundHalfPct ?? global.refundHalfPct ?? CONFIG_DEFAULTS.refundHalfPct,
  };
};

/** Onay karar saati: starts_at − captureWindowHours. starts_at yoksa null. */
export const quorumDecisionTime = (
  startsAt: string | null | undefined,
  cfg: RahatMatchConfig,
): Date | null => {
  if (!startsAt) return null;
  const t = new Date(startsAt);
  if (isNaN(t.getTime())) return null;
  return new Date(t.getTime() - cfg.captureWindowHours * 3600_000);
};
