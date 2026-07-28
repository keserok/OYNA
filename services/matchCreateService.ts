// ─── Maç Kur (2a) Servisi ────────────────────────────────────────────────────
// Yeni tek-ekran maç kurma akışının veri katmanı. Yazma tarafı TEK RPC:
// create_match_atomic — maç + saha rezervasyonu + kapora blokajı aynı
// transaction'da; çakışmada SLOT_TAKEN, bakiye yetmezse INSUFFICIENT_BALANCE
// döner ve HİÇBİR kalıntı (öksüz maç) kalmaz. Fiyat/kapora rakamları daima
// sunucudan (get_court_day_quote) gelir; istemci tahmin uydurmaz.

import { supabase } from '../supabaseClient';

// ── Tesis + saha listesi ────────────────────────────────────────────────────

export interface CreateCourt {
  id: string;
  name: string;
  courtType: 'OPEN' | 'CLOSED';
  minCapacity: number; // takım başına (5 → 5v5)
  maxCapacity: number;
  sizeLabel: string | null;
  basePrice: number; // kaba saatlik fiyat (kart altbilgisi için; gerçek fiyat kotadan)
}

export interface CreateFacility {
  id: string;
  name: string;
  district: string | null;
  city: string | null;
  image: string | null;
  rating: number;
  hasTariff: boolean;
  courts: CreateCourt[];
}

interface DbCreatePitchRow {
  id: string;
  name: string;
  district: string | null;
  city: string | null;
  image: string | null;
  images: string[] | null;
  rating: number | null;
  rating_count: number | null;
  google_rating: number | null;
  courts: {
    id: string;
    name: string;
    court_type: string | null;
    min_capacity: number | null;
    max_capacity: number | null;
    size_label: string | null;
    price: number | null;
    is_active: boolean | null;
    sort_order: number | null;
  }[] | null;
  pitch_tariffs: { id: string; is_active: boolean | null }[] | null;
}

/**
 * Onaylı + yayında tesisler ve aktif sahaları. Sıralama istemcide yapılır:
 * favoriler → daha önce maç kurulan tesisler → puan (rating_count kapılı).
 */
export async function fetchCreateFacilities(): Promise<CreateFacility[]> {
  const { data, error } = await supabase
    .from('pitches')
    .select('id, name, district, city, image, images, rating, rating_count, google_rating, courts(id, name, court_type, min_capacity, max_capacity, size_label, price, is_active, sort_order), pitch_tariffs(id, is_active)')
    .eq('verification_status', 'approved')
    .eq('is_published', true)
    .eq('is_open', true);
  if (error) throw error;

  return ((data ?? []) as unknown as DbCreatePitchRow[])
    .map((row) => ({
      id: row.id,
      name: row.name,
      district: row.district,
      city: row.city,
      image: row.image ?? row.images?.[0] ?? null,
      // rating DEFAULT 5.0 tuzağı: oy yoksa Google puanı, o da yoksa 0
      rating: (row.rating_count ?? 0) > 0 ? Number(row.rating ?? 0) : Number(row.google_rating ?? 0),
      hasTariff: (row.pitch_tariffs ?? []).some(t => t.is_active !== false),
      courts: (row.courts ?? [])
        .filter(c => c.is_active !== false)
        .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
        .map(c => ({
          id: c.id,
          name: c.name,
          courtType: (c.court_type === 'CLOSED' ? 'CLOSED' : 'OPEN') as 'OPEN' | 'CLOSED',
          minCapacity: c.min_capacity ?? 5,
          maxCapacity: c.max_capacity ?? 7,
          sizeLabel: c.size_label,
          basePrice: Number(c.price ?? 0),
        })),
    }))
    .filter(f => f.courts.length > 0);
}

// ── Gün kotası: saat şeridi + fiyat/kapora/indirim ──────────────────────────

export interface DayQuoteHour {
  time: string; // 'HH:MM'
  night: boolean;
  tariffOk: boolean;
  total: number | null;
  basePrice: number | null;
  deal: boolean;
  deposit: number | null;
}

export interface DayQuote {
  courtId: string;
  date: string;
  slotDuration: number;
  hours: DayQuoteHour[];
}

export async function getCourtDayQuote(courtId: string, dateISO: string): Promise<DayQuote> {
  const { data, error } = await supabase.rpc('get_court_day_quote', {
    p_court_id: courtId,
    p_date: dateISO,
  });
  if (error) throw error;
  const raw = data as { courtId: string; date: string; slotDuration: number; hours: Record<string, unknown>[] };
  return {
    courtId: raw.courtId,
    date: raw.date,
    slotDuration: Number(raw.slotDuration ?? 60),
    hours: (raw.hours ?? []).map(h => ({
      time: String(h.time),
      night: !!h.night,
      tariffOk: !!h.tariffOk,
      total: h.total == null ? null : Number(h.total),
      basePrice: h.basePrice == null ? null : Number(h.basePrice),
      deal: !!h.deal,
      deposit: h.deposit == null ? null : Number(h.deposit),
    })),
  };
}

// ── Atomik yayın ────────────────────────────────────────────────────────────

export interface AtomicCreateParams {
  courtId: string | null;
  dateISO: string | null; // 'YYYY-MM-DD'
  time: string | null; // 'HH:MM'
  format: string; // '7v7'
  visibility: 'OPEN' | 'PRIVATE';
  title?: string;
  gender?: string;
  ageGroup?: string;
  difficulty?: string;
  /** [{ type: 'GOALKEEPER'|'REFEREE', providerIds?: string[] }] — boş liste = otomatik öneri */
  deferredProviders?: { type: string; providerIds?: string[] }[];
  seedBookingId?: string | null; // rezervasyondan çevirme: saha/saat rezervasyondan alınır
  /**
   * İdempotency anahtarı (shared/submitGuard safeUuid). AYNI yayın denemesi
   * boyunca sabit kalır; timeout sonrası tekrar deneme AYNI anahtarla gider ve
   * sunucu ikinci maç/rezervasyon/kapora üretmez, ilk sonucu döner.
   * Verilmezse sunucu bugünkü davranışı aynen sürdürür (geriye dönük uyum).
   */
  clientRequestId?: string | null;
}

export interface AtomicCreateResult {
  matchId: string;
  bookingId: string | null;
  deposit: number;
  perPerson: number;
  totalPrice: number;
  privateCode: string | null;
  minPlayers: number;
  depositStatus: string;
  /** Sunucunun tarifeden (pitch_tariffs.slot_minutes) türettiği maç süresi. */
  durationMinutes: number;
}

/** Sunucunun isimli hatalarını akışın anlayacağı koda çevirir. */
export type CreateMatchErrorCode =
  | 'SLOT_TAKEN' | 'INSUFFICIENT_BALANCE' | 'FORMAT_OUT_OF_RANGE' | 'NO_TARIFF'
  | 'PAST_TIME' | 'COURT_NOT_FOUND' | 'SEED_NOT_FOUND' | 'SEED_NOT_READY'
  | 'BOOKING_DISABLED' | 'SLOT_UNAVAILABLE' | 'DUPLICATE_IN_FLIGHT' | 'UNKNOWN';

export function parseCreateMatchError(err: unknown): { code: CreateMatchErrorCode; message: string } {
  const msg = err instanceof Error ? err.message : String((err as { message?: string })?.message ?? err ?? '');
  const codes: CreateMatchErrorCode[] = [
    'SLOT_TAKEN', 'INSUFFICIENT_BALANCE', 'FORMAT_OUT_OF_RANGE', 'NO_TARIFF',
    'PAST_TIME', 'COURT_NOT_FOUND', 'SEED_NOT_READY', 'SEED_NOT_FOUND',
    'BOOKING_DISABLED', 'SLOT_UNAVAILABLE', 'DUPLICATE_IN_FLIGHT',
  ];
  for (const c of codes) {
    if (msg.includes(c)) return { code: c, message: msg };
  }
  return { code: 'UNKNOWN', message: msg };
}

export async function createMatchAtomic(params: AtomicCreateParams): Promise<AtomicCreateResult> {
  const payload: Record<string, unknown> = {};
  if (params.title) payload.title = params.title;
  if (params.gender) payload.gender = params.gender;
  if (params.ageGroup) payload.ageGroup = params.ageGroup;
  if (params.difficulty) payload.difficulty = params.difficulty;
  if (params.deferredProviders?.length) payload.deferredProviders = params.deferredProviders;

  const { data, error } = await supabase.rpc('create_match_atomic', {
    p_court_id: params.courtId,
    p_date: params.dateISO,
    p_start_time: params.time,
    p_format: params.format,
    p_visibility: params.visibility,
    p_payload: payload,
    p_seed_booking_id: params.seedBookingId ?? null,
    p_client_request_id: params.clientRequestId ?? null,
  });
  if (error) throw error;
  const r = data as Record<string, unknown>;
  return {
    matchId: String(r.match_id),
    bookingId: r.booking_id ? String(r.booking_id) : null,
    deposit: Number(r.deposit ?? 0),
    perPerson: Number(r.per_person ?? 0),
    totalPrice: Number(r.total_price ?? 0),
    privateCode: r.private_code ? String(r.private_code) : null,
    minPlayers: Number(r.min_players ?? 0),
    depositStatus: String(r.deposit_status ?? 'NONE'),
    durationMinutes: Number(r.duration_minutes ?? 60),
  };
}

// ── Kadro daveti (bildirim; slotlar satın almayla dolar) ────────────────────
// Davet gerekçesi sunucuda: arkadaşlık VEYA ortak takım üyeliği. Tanışıklığı
// olmayan kişiler sessizce atlanır ve 'skipped' ile bildirilir.

export async function inviteFriendsToMatch(
  matchId: string,
  friendIds: string[],
): Promise<{ sent: number; skipped: number }> {
  if (friendIds.length === 0) return { sent: 0, skipped: 0 };
  const { data, error } = await supabase.rpc('invite_friends_to_match', {
    p_match_id: matchId,
    p_friend_ids: friendIds,
  });
  if (error) throw error;
  const r = (data ?? {}) as { sent?: number; skipped?: number };
  return { sent: Number(r.sent ?? 0), skipped: Number(r.skipped ?? 0) };
}

// ── Kaleci / hakem: rezerve edilebilir GERÇEK sağlayıcılar ──────────────────
// Kapı get_available_provider_ids ile aynı (onaylı + müsait). Seçim yayın
// anında create_match_atomic'e taşınır; teklifler kapora bloke edilince gider.

export interface BookableProvider {
  id: string;
  name: string;
  avatar: string | null;
  rating: number;
  fee: number;
  isElite: boolean;
  zone: string | null;
}

export async function listBookableProviders(type: 'GK' | 'REF'): Promise<BookableProvider[]> {
  const { data, error } = await supabase.rpc('list_bookable_providers', { p_type: type });
  if (error) throw error;
  return ((data ?? []) as Record<string, unknown>[]).map(r => ({
    id: String(r.id),
    name: String(r.name ?? 'Sağlayıcı'),
    avatar: r.avatar ? String(r.avatar) : null,
    rating: Number(r.rating ?? 0),
    fee: Number(r.fee ?? 0),
    isElite: !!r.is_elite,
    zone: r.zone ? String(r.zone) : null,
  }));
}

// ── Bölgede saha yok: talep sinyali ─────────────────────────────────────────

export async function recordDemandSignal(
  type: 'NOTIFY' | 'SUGGEST',
  city: string,
  district: string,
  pitchName?: string,
  contact?: string,
  note?: string,
): Promise<void> {
  const { error } = await supabase.rpc('record_demand_signal', {
    p_type: type,
    p_city: city,
    p_district: district,
    p_pitch_name: pitchName ?? null,
    p_contact: contact ?? null,
    p_note: note ?? null,
  });
  if (error) throw error;
}
