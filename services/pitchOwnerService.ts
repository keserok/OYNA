// ============================================================================
// OYNA — Saha Sahibi (Owner) Modülü Servis Katmanı
// ----------------------------------------------------------------------------
// OwnerPanel ve ilgili ekranlardaki TÜM Supabase operasyonları burada toplanır.
// Alan adları CANLI veritabanı şemasıyla birebir uyumludur:
//   * `courts` (pitch_courts DEĞİL)
//   * pitch_bookings.source / price (booking_source / total_price DEĞİL)
//   * pitch_subscriptions.weekday / customer_name / price (day_of_week / ... DEĞİL)
//   * notifications.type_key / payload (type / target_audience DEĞİL)
//   * matches."homeScore"/"awayScore"/"scoreEnteredAt"
// Tüm fonksiyonlar try/catch ile sarılır ve kullanıcıya Türkçe hata fırlatır.
// ============================================================================

import { supabase } from '../supabaseClient';
import type {
  OwnerPitch,
  OwnerDailySummary,
  PitchBookingFull,
  PitchCourt,
  PitchExpense,
  PitchDebtor,
  PitchSubscription,
  PitchTariff,
  FlashDeal,
  PitchAvailabilityException,
  PitchPaymentSettings,
  PitchBankAccount,
  PitchStaffMember,
  PitchStaffTask,
} from '../types';

// ----------------------------------------------------------------------------
// Girdi (Input) tipleri
// ----------------------------------------------------------------------------
export interface ManualBookingParams {
  pitchId: string;
  courtId: string;
  bookingDate: string; // YYYY-MM-DD
  startTime: string; // HH:MM
  endTime: string; // HH:MM
  customerName?: string;
  customerPhone?: string;
  note?: string;
  title?: string;
  source?: 'OWNER_MANUAL' | 'APP_BOOKING' | 'APP_MATCH';
}

export interface TariffInput {
  name: string;
  tariff_type: 'WEEKDAY' | 'WEEKEND' | 'HOLIDAY' | 'SPECIAL';
  applies_to_days: number[];
  start_time: string;
  end_time: string;
  price_per_hour: number;
  deposit_amount?: number;
  sort_order?: number;
  is_active?: boolean;
  court_id?: string | null;
}

export interface ExpenseInput {
  category: string;
  title: string;
  amount: number;
  expense_date?: string;
  note?: string;
}

export interface DebtorInput {
  name: string;
  phone?: string;
  amount_owed: number;
  last_match_date?: string;
  notes?: string;
  oyna_user_id?: string | null;
}

export interface SubscriptionInput {
  customer_name: string;
  customer_phone?: string;
  weekday: number; // 1=Pazartesi .. 7=Pazar (ISO)
  start_time: string;
  end_time?: string;
  price: number;
  court_id?: string | null;
  start_date?: string;
  end_date?: string | null;
  notes?: string;
}

export interface FlashDealInput {
  pitch_id: string;
  court_id?: string | null;
  booking_date: string;
  start_time: string;
  discount_percent: number;
  original_price: number;
  expires_at: string;
}

export type PaymentMethod = 'CASH' | 'CARD' | 'BANK_TRANSFER' | 'OYNA_WALLET';

export type WorkingDay = Record<string, unknown>;

export interface WeeklyRevenuePoint {
  date: string;
  label: string;
  revenue: number;
  collected: number;
}

// ----------------------------------------------------------------------------
// Yardımcılar
// ----------------------------------------------------------------------------

/** Oturum açmış kullanıcının id'sini döndürür, yoksa hata fırlatır. */
async function getCurrentUserId(): Promise<string> {
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) {
    throw new Error('Oturumunuz bulunamadı. Lütfen tekrar giriş yapın.');
  }
  return data.user.id;
}

/** Supabase/Postgres hatalarını kullanıcı dostu Türkçe mesaja çevirir. */
export function toTurkishError(error: unknown): string {
  const raw =
    (typeof error === 'object' && error !== null && 'message' in error
      ? String((error as { message: unknown }).message)
      : String(error)) || '';

  if (raw.includes('SLOT_TAKEN')) return 'Bu saat dilimi zaten rezerve edilmiş.';
  if (raw.includes('SLOT_UNAVAILABLE')) return 'Bu saat dilimi kapalı.';
  if (raw.includes('INVALID_TOKEN')) return 'QR kodu geçersiz veya süresi dolmuş.';
  if (raw.includes('INVALID_SCORE')) return 'Girilen skor geçersiz.';
  if (raw.includes('INVALID_SOURCE')) return 'Geçersiz rezervasyon kaynağı.';
  if (raw.includes('UNAUTHORIZED')) return 'Bu işlem için yetkiniz yok.';
  if (raw.includes('exclusion') || raw.includes('overlap'))
    return 'Bu saat dilimi başka bir rezervasyonla çakışıyor.';
  if (raw.includes('duplicate key') || raw.includes('unique'))
    return 'Bu kayıt zaten mevcut.';
  if (raw.includes('row-level security') || raw.includes('violates row-level'))
    return 'Bu işlem için yetkiniz yok (RLS).';
  if (raw.includes('Failed to fetch') || raw.includes('NetworkError'))
    return 'Bağlantı hatası. İnternetinizi kontrol edin.';
  if (raw.includes('Oturum')) return raw;
  return raw || 'Beklenmeyen bir hata oluştu.';
}

/** 'YYYY-MM' formatındaki ayın bir sonraki ayının ilk gününü döndürür. */
function nextMonthFirstDay(month: string): string {
  const [yStr, mStr] = month.split('-');
  const year = Number(yStr);
  const m = Number(mStr); // 1-12
  const nextYear = m === 12 ? year + 1 : year;
  const nextMonth = m === 12 ? 1 : m + 1;
  return `${nextYear}-${String(nextMonth).padStart(2, '0')}-01`;
}

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

function addDaysISO(base: string, days: number): string {
  const d = new Date(base + 'T00:00:00');
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

// ----------------------------------------------------------------------------
// PITCHES / SUMMARY
// ----------------------------------------------------------------------------

export async function getOwnerPitches(ownerId: string): Promise<OwnerPitch[]> {
  try {
    const { data, error } = await supabase
      .from('pitches')
      .select('*, courts(*), pitch_tariffs(*)')
      .eq('owner_id', ownerId)
      .order('created_at', { ascending: true });
    if (error) throw error;
    return (data ?? []) as unknown as OwnerPitch[];
  } catch (error) {
    console.error('getOwnerPitches:', error);
    throw new Error(toTurkishError(error));
  }
}

export async function getOwnerDailySummary(
  pitchId: string,
): Promise<OwnerDailySummary | null> {
  try {
    const { data, error } = await supabase
      .from('owner_daily_summary')
      .select('*')
      .eq('pitch_id', pitchId)
      .maybeSingle();
    if (error) throw error;
    return (data as unknown as OwnerDailySummary) ?? null;
  } catch (error) {
    console.error('getOwnerDailySummary:', error);
    throw new Error(toTurkishError(error));
  }
}

// ----------------------------------------------------------------------------
// BOOKINGS
// ----------------------------------------------------------------------------

export async function getPitchBookings(
  pitchId: string,
  date: string,
  courtId?: string | null,
): Promise<PitchBookingFull[]> {
  try {
    let query = supabase
      .from('pitch_bookings')
      .select('*, courts(name), booking_payments(*)')
      .eq('pitch_id', pitchId)
      .eq('booking_date', date)
      .neq('status', 'CANCELLED')
      .order('start_time', { ascending: true });
    if (courtId) query = query.eq('court_id', courtId);

    const { data, error } = await query;
    if (error) throw error;
    return (data ?? []) as unknown as PitchBookingFull[];
  } catch (error) {
    console.error('getPitchBookings:', error);
    throw new Error(toTurkishError(error));
  }
}

export async function approveBooking(bookingId: string): Promise<void> {
  try {
    const { error } = await supabase
      .from('pitch_bookings')
      .update({ status: 'CONFIRMED', auto_approved_at: new Date().toISOString() })
      .eq('id', bookingId);
    if (error) throw error;
  } catch (error) {
    console.error('approveBooking:', error);
    throw new Error(toTurkishError(error));
  }
}

export async function rejectBooking(bookingId: string, reason: string): Promise<void> {
  try {
    const uid = await getCurrentUserId();

    const { data: booking, error: fetchErr } = await supabase
      .from('pitch_bookings')
      .select('user_id, pitch_id')
      .eq('id', bookingId)
      .single();
    if (fetchErr) throw fetchErr;

    const { error } = await supabase
      .from('pitch_bookings')
      .update({
        status: 'CANCELLED',
        cancellation_reason: reason,
        cancelled_at: new Date().toISOString(),
        cancelled_by: uid,
      })
      .eq('id', bookingId);
    if (error) throw error;

    const targetUser = (booking as { user_id: string | null } | null)?.user_id;
    if (targetUser) {
      await supabase.from('notifications').insert({
        user_id: targetUser,
        title: 'Rezervasyonunuz Onaylanmadı',
        body: reason || 'Tesis sahibi rezervasyonunuzu onaylamadı.',
        type_key: 'BOOKING_REJECTED',
      });
    }
  } catch (error) {
    console.error('rejectBooking:', error);
    throw new Error(toTurkishError(error));
  }
}

/**
 * Onaylanmış (CONFIRMED) bir rezervasyonu iptal eder (acil iptal).
 * OYNA_WALLET ile ödeme yapılmışsa cüzdana iade başlatır + oyuncuya bildirim.
 */
export async function cancelConfirmedBooking(
  bookingId: string,
  reason: string,
): Promise<void> {
  try {
    const { error } = await supabase.rpc('owner_cancel_confirmed_booking', {
      p_booking_id: bookingId,
      p_reason: reason,
    });
    if (error) throw error;
  } catch (error) {
    console.error('cancelConfirmedBooking:', error);
    throw new Error(toTurkishError(error));
  }
}

export async function recordBookingPayment(
  bookingId: string,
  amount: number,
  method: PaymentMethod,
  note?: string,
): Promise<void> {
  try {
    const uid = await getCurrentUserId();
    const { error } = await supabase.from('booking_payments').insert({
      booking_id: bookingId,
      amount,
      payment_method: method,
      note: note ?? null,
      recorded_by: uid,
    });
    if (error) throw error;
    // pitch_bookings.paid_amount + payment_status DB trigger ile güncellenir.
  } catch (error) {
    console.error('recordBookingPayment:', error);
    throw new Error(toTurkishError(error));
  }
}

export async function createManualBooking(params: ManualBookingParams): Promise<string> {
  try {
    const { data, error } = await supabase.rpc('create_pitch_booking', {
      p_pitch_id: params.pitchId,
      p_court_id: params.courtId,
      p_booking_date: params.bookingDate,
      p_start_time: params.startTime,
      p_end_time: params.endTime,
      p_source: params.source ?? 'OWNER_MANUAL',
      p_customer_name: params.customerName ?? null,
      p_customer_phone: params.customerPhone ?? null,
      p_note: params.note ?? null,
      p_title: params.title ?? null,
    });
    if (error) throw error;
    return data as string;
  } catch (error) {
    console.error('createManualBooking:', error);
    throw new Error(toTurkishError(error));
  }
}

/** Bir slotu kapatır (bakım/özel etkinlik vb.) — pitch_availability_exceptions. */
export async function closeSlot(params: {
  pitchId: string;
  courtId?: string | null;
  date: string;
  startTime?: string;
  endTime?: string;
  reason?: string;
  exceptionType?: 'MAINTENANCE' | 'PRIVATE_EVENT' | 'HOLIDAY' | 'EMERGENCY' | 'OTHER';
}): Promise<void> {
  try {
    const { error } = await supabase.from('pitch_availability_exceptions').insert({
      pitch_id: params.pitchId,
      court_id: params.courtId ?? null,
      exception_date: params.date,
      start_time: params.startTime ?? null,
      end_time: params.endTime ?? null,
      reason: params.reason ?? null,
      exception_type: params.exceptionType ?? 'MAINTENANCE',
      is_recurring: false,
    });
    if (error) throw error;
  } catch (error) {
    console.error('closeSlot:', error);
    throw new Error(toTurkishError(error));
  }
}

export async function getAvailabilityExceptions(
  pitchId: string,
  date: string,
  courtId?: string | null,
): Promise<PitchAvailabilityException[]> {
  try {
    let query = supabase
      .from('pitch_availability_exceptions')
      .select('*')
      .eq('pitch_id', pitchId)
      .eq('exception_date', date);
    if (courtId) {
      query = query.or(`court_id.is.null,court_id.eq.${courtId}`);
    }
    const { data, error } = await query;
    if (error) throw error;
    return (data ?? []) as unknown as PitchAvailabilityException[];
  } catch (error) {
    console.error('getAvailabilityExceptions:', error);
    throw new Error(toTurkishError(error));
  }
}

// ----------------------------------------------------------------------------
// TARIFFS / WORKING HOURS / OPEN
// ----------------------------------------------------------------------------

export async function saveTariffs(pitchId: string, tariffs: TariffInput[]): Promise<void> {
  try {
    const { error: delError } = await supabase
      .from('pitch_tariffs')
      .delete()
      .eq('pitch_id', pitchId);
    if (delError) throw delError;

    if (tariffs.length === 0) return;

    const rows = tariffs.map((t, idx) => ({
      pitch_id: pitchId,
      name: t.name,
      tariff_type: t.tariff_type,
      applies_to_days: t.applies_to_days,
      start_time: t.start_time,
      end_time: t.end_time,
      price_per_hour: t.price_per_hour,
      deposit_amount: t.deposit_amount ?? 0,
      sort_order: t.sort_order ?? idx,
      is_active: t.is_active ?? true,
      court_id: t.court_id ?? null,
    }));

    const { error: insError } = await supabase.from('pitch_tariffs').insert(rows);
    if (insError) throw insError;
  } catch (error) {
    console.error('saveTariffs:', error);
    throw new Error(toTurkishError(error));
  }
}

export async function getTariffs(pitchId: string): Promise<PitchTariff[]> {
  try {
    const { data, error } = await supabase
      .from('pitch_tariffs')
      .select('*')
      .eq('pitch_id', pitchId)
      .order('sort_order', { ascending: true });
    if (error) throw error;
    return (data ?? []) as unknown as PitchTariff[];
  } catch (error) {
    console.error('getTariffs:', error);
    throw new Error(toTurkishError(error));
  }
}

/** Belirli gün/saat için prime-time (SPECIAL) tarife ekler veya günceller. */
export async function upsertSpecialSlotTariff(
  pitchId: string,
  params: {
    courtId?: string | null;
    bookingDate: string;
    startTime: string;
    endTime: string;
    pricePerHour: number;
    name?: string;
  },
): Promise<void> {
  try {
    const date = new Date(`${params.bookingDate}T12:00:00`);
    const jsDay = date.getDay();
    const weekday = jsDay === 0 ? 7 : jsDay;

    const existing = await getTariffs(pitchId);
    const filtered = existing.filter((t) => {
      if (t.tariff_type !== 'SPECIAL') return true;
      const sameDay = Array.isArray(t.applies_to_days) && t.applies_to_days.includes(weekday);
      const sameCourt = (t.court_id ?? null) === (params.courtId ?? null);
      const sameSlot =
        (t.start_time ?? '').slice(0, 5) === params.startTime.slice(0, 5) &&
        (t.end_time ?? '').slice(0, 5) === params.endTime.slice(0, 5);
      return !(sameDay && sameCourt && sameSlot);
    });

    const rows: TariffInput[] = filtered.map((t, idx) => ({
      name: t.name,
      tariff_type: t.tariff_type as TariffInput['tariff_type'],
      applies_to_days: t.applies_to_days ?? [1, 2, 3, 4, 5],
      start_time: (t.start_time ?? '08:00').slice(0, 5),
      end_time: (t.end_time ?? '23:00').slice(0, 5),
      price_per_hour: t.price_per_hour,
      deposit_amount: t.deposit_amount ?? 0,
      sort_order: t.sort_order ?? idx,
      is_active: t.is_active !== false,
      court_id: t.court_id ?? null,
    }));

    rows.push({
      name: params.name ?? `Özel ${params.bookingDate}`,
      tariff_type: 'SPECIAL',
      applies_to_days: [weekday],
      start_time: params.startTime.slice(0, 5),
      end_time: params.endTime.slice(0, 5),
      price_per_hour: params.pricePerHour,
      sort_order: rows.length,
      court_id: params.courtId ?? null,
    });

    await saveTariffs(pitchId, rows);
  } catch (error) {
    console.error('upsertSpecialSlotTariff:', error);
    throw new Error(toTurkishError(error));
  }
}

export async function saveWorkingHours(pitchId: string, days: WorkingDay[]): Promise<void> {
  try {
    const { error } = await supabase
      .from('pitches')
      .update({ working_hours: days })
      .eq('id', pitchId);
    if (error) throw error;
  } catch (error) {
    console.error('saveWorkingHours:', error);
    throw new Error(toTurkishError(error));
  }
}

export async function togglePitchOpen(pitchId: string, isOpen: boolean): Promise<void> {
  try {
    const { error } = await supabase
      .from('pitches')
      .update({ is_open: isOpen })
      .eq('id', pitchId);
    if (error) throw error;
  } catch (error) {
    console.error('togglePitchOpen:', error);
    throw new Error(toTurkishError(error));
  }
}

export interface PitchOperationsSettings {
  is_open: boolean;
  auto_approve_enabled: boolean;
  auto_approve_minutes: number;
}

export async function getPitchOperationsSettings(pitchId: string): Promise<PitchOperationsSettings> {
  try {
    const { data, error } = await supabase
      .from('pitches')
      .select('is_open, auto_approve_enabled, auto_approve_minutes')
      .eq('id', pitchId)
      .single();
    if (error) throw error;
    const row = data as {
      is_open?: boolean;
      auto_approve_enabled?: boolean;
      auto_approve_minutes?: number;
    };
    return {
      is_open: row.is_open ?? true,
      auto_approve_enabled: row.auto_approve_enabled ?? true,
      auto_approve_minutes: row.auto_approve_minutes ?? 35,
    };
  } catch (error) {
    console.error('getPitchOperationsSettings:', error);
    throw new Error(toTurkishError(error));
  }
}

export async function updatePitchOperationsSettings(
  pitchId: string,
  settings: Partial<Pick<PitchOperationsSettings, 'auto_approve_enabled' | 'auto_approve_minutes'>>,
): Promise<void> {
  try {
    const payload: Record<string, unknown> = {};
    if (settings.auto_approve_enabled !== undefined) {
      payload.auto_approve_enabled = settings.auto_approve_enabled;
    }
    if (settings.auto_approve_minutes !== undefined) {
      payload.auto_approve_minutes = settings.auto_approve_minutes;
    }
    if (Object.keys(payload).length === 0) return;
    const { error } = await supabase.from('pitches').update(payload).eq('id', pitchId);
    if (error) throw error;
  } catch (error) {
    console.error('updatePitchOperationsSettings:', error);
    throw new Error(toTurkishError(error));
  }
}

// ----------------------------------------------------------------------------
// EXPENSES
// ----------------------------------------------------------------------------

export async function getOwnerExpenses(
  pitchId: string,
  month: string, // 'YYYY-MM'
): Promise<PitchExpense[]> {
  try {
    const { data, error } = await supabase
      .from('pitch_expenses')
      .select('*')
      .eq('pitch_id', pitchId)
      .gte('expense_date', `${month}-01`)
      .lt('expense_date', nextMonthFirstDay(month))
      .order('expense_date', { ascending: false });
    if (error) throw error;
    return (data ?? []) as unknown as PitchExpense[];
  } catch (error) {
    console.error('getOwnerExpenses:', error);
    throw new Error(toTurkishError(error));
  }
}

export async function addExpense(pitchId: string, expense: ExpenseInput): Promise<void> {
  try {
    const uid = await getCurrentUserId();
    const { error } = await supabase.from('pitch_expenses').insert({
      pitch_id: pitchId,
      category: expense.category,
      title: expense.title,
      amount: expense.amount,
      expense_date: expense.expense_date ?? todayISO(),
      note: expense.note ?? null,
      created_by: uid,
    });
    if (error) throw error;
  } catch (error) {
    console.error('addExpense:', error);
    throw new Error(toTurkishError(error));
  }
}

// ----------------------------------------------------------------------------
// DEBTORS (Veresiye)
// ----------------------------------------------------------------------------

export async function getDebtors(pitchId: string): Promise<PitchDebtor[]> {
  try {
    const { data, error } = await supabase
      .from('pitch_debtors')
      .select('*')
      .eq('pitch_id', pitchId)
      .eq('is_resolved', false)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return (data ?? []) as unknown as PitchDebtor[];
  } catch (error) {
    console.error('getDebtors:', error);
    throw new Error(toTurkishError(error));
  }
}

export async function addDebtor(pitchId: string, debtor: DebtorInput): Promise<void> {
  try {
    const { error } = await supabase.from('pitch_debtors').insert({
      pitch_id: pitchId,
      name: debtor.name,
      phone: debtor.phone ?? null,
      amount_owed: debtor.amount_owed,
      last_match_date: debtor.last_match_date ?? null,
      notes: debtor.notes ?? null,
      oyna_user_id: debtor.oyna_user_id ?? null,
    });
    if (error) throw error;
  } catch (error) {
    console.error('addDebtor:', error);
    throw new Error(toTurkishError(error));
  }
}

export async function resolveDebtor(debtorId: string): Promise<void> {
  try {
    const { error } = await supabase
      .from('pitch_debtors')
      .update({ is_resolved: true })
      .eq('id', debtorId);
    if (error) throw error;
  } catch (error) {
    console.error('resolveDebtor:', error);
    throw new Error(toTurkishError(error));
  }
}

// ----------------------------------------------------------------------------
// FLASH DEALS
// ----------------------------------------------------------------------------

export async function createFlashDeal(deal: FlashDealInput): Promise<void> {
  try {
    const { error } = await supabase.from('pitch_flash_deals').insert({
      pitch_id: deal.pitch_id,
      court_id: deal.court_id ?? null,
      booking_date: deal.booking_date,
      start_time: deal.start_time,
      discount_percent: deal.discount_percent,
      original_price: deal.original_price,
      expires_at: deal.expires_at,
    });
    if (error) throw error;
    // Aktif flash deal'ler PitchDiscovery'de public SELECT ile gösterilir.
    // Yakın kullanıcılara push bildirimi push servisi tarafından ele alınır.
  } catch (error) {
    console.error('createFlashDeal:', error);
    throw new Error(toTurkishError(error));
  }
}

export async function getActiveFlashDeals(
  pitchId: string,
  date?: string,
  courtId?: string | null,
): Promise<FlashDeal[]> {
  try {
    let query = supabase
      .from('pitch_flash_deals')
      .select('*')
      .eq('pitch_id', pitchId)
      .eq('is_claimed', false)
      .gt('expires_at', new Date().toISOString());
    if (date) query = query.eq('booking_date', date);
    if (courtId) query = query.or(`court_id.is.null,court_id.eq.${courtId}`);
    const { data, error } = await query.order('expires_at', { ascending: true });
    if (error) throw error;
    return (data ?? []) as unknown as FlashDeal[];
  } catch (error) {
    console.error('getActiveFlashDeals:', error);
    throw new Error(toTurkishError(error));
  }
}

export async function deleteFlashDeal(dealId: string): Promise<void> {
  try {
    const { error } = await supabase.from('pitch_flash_deals').delete().eq('id', dealId);
    if (error) throw error;
  } catch (error) {
    console.error('deleteFlashDeal:', error);
    throw new Error(toTurkishError(error));
  }
}

export interface PitchAppMatchRow {
  id: string;
  bookingId: string;
  title: string;
  pitchName: string;
  time: string;
  price: number;
  maxPlayers: number;
  joinedPlayers: number;
  status: string;
}

export async function getPitchAppMatches(pitchId: string): Promise<PitchAppMatchRow[]> {
  try {
    const { data, error } = await supabase
      .from('pitch_bookings')
      .select('id, booking_date, start_time, price, status, match_id, courts(name), matches(id, title, status, slots, away_slots, date, time, location)')
      .eq('pitch_id', pitchId)
      .eq('source', 'APP_MATCH')
      .neq('status', 'CANCELLED')
      .not('match_id', 'is', null)
      .order('booking_date', { ascending: false })
      .limit(50);
    if (error) throw error;

    return (data ?? []).map((row: Record<string, unknown>) => {
      const match = row.matches as Record<string, unknown> | null;
      const slots = (match?.slots as unknown[]) ?? [];
      const awaySlots = (match?.away_slots as unknown[]) ?? [];
      const allSlots = [...slots, ...awaySlots];
      const taken = allSlots.filter((s) => {
        const slot = s as { status?: string };
        return slot.status === 'TAKEN';
      }).length;
      const courtName = (row.courts as { name?: string } | null)?.name ?? 'Saha';
      const bookingDate = String(row.booking_date ?? '');
      const startTime = String(row.start_time ?? '').slice(0, 5);
      const matchDate = String(match?.date ?? bookingDate);
      const matchTime = String(match?.time ?? startTime);
      return {
        id: String(match?.id ?? row.match_id),
        bookingId: String(row.id),
        title: String(match?.title ?? 'Oyuncu Maçı'),
        pitchName: courtName,
        time: `${matchDate} ${matchTime}`.trim(),
        price: Number(row.price ?? 0),
        maxPlayers: allSlots.length || 14,
        joinedPlayers: taken,
        status: String(match?.status ?? row.status ?? 'ACTIVE'),
      };
    });
  } catch (error) {
    console.error('getPitchAppMatches:', error);
    throw new Error(toTurkishError(error));
  }
}

// ----------------------------------------------------------------------------
// WITHDRAWALS / BALANCE
// ----------------------------------------------------------------------------

async function uploadIbanPhoto(file: File, ownerId: string): Promise<string> {
  const ext = file.name.split('.').pop() || 'jpg';
  const path = `withdrawals/${ownerId}/${Date.now()}_${Math.random()
    .toString(36)
    .slice(2)}.${ext}`;
  const { error } = await supabase.storage
    .from('images')
    .upload(path, file, { cacheControl: '3600', upsert: false });
  if (error) throw error;
  const { data } = supabase.storage.from('images').getPublicUrl(path);
  return data.publicUrl;
}

export async function requestWithdrawal(
  pitchId: string,
  amount: number,
  iban: string,
  ibanPhotoFile?: File,
): Promise<void> {
  try {
    const uid = await getCurrentUserId();
    let photoUrl: string | null = null;
    if (ibanPhotoFile) {
      photoUrl = await uploadIbanPhoto(ibanPhotoFile, uid);
    }
    const { error } = await supabase.from('owner_withdrawal_requests').insert({
      pitch_id: pitchId,
      owner_id: uid,
      amount,
      iban,
      iban_photo_url: photoUrl,
    });
    if (error) throw error;
  } catch (error) {
    console.error('requestWithdrawal:', error);
    throw new Error(toTurkishError(error));
  }
}

/**
 * Tesisin çekilebilir bakiyesini hesaplar:
 *   toplanan (paid_amount toplamı) - platform komisyonu - bekleyen/işlenen çekim talepleri.
 */
export async function getOwnerBalance(pitchId: string): Promise<{
  collected: number;
  pendingWithdrawals: number;
  commissionRate: number;
  available: number;
}> {
  try {
    const [{ data: bookings, error: bErr }, { data: pitch, error: pErr }, { data: wds, error: wErr }] =
      await Promise.all([
        supabase
          .from('pitch_bookings')
          .select('paid_amount')
          .eq('pitch_id', pitchId)
          .neq('status', 'CANCELLED'),
        supabase.from('pitches').select('platform_commission_rate').eq('id', pitchId).single(),
        supabase
          .from('owner_withdrawal_requests')
          .select('amount, status')
          .eq('pitch_id', pitchId)
          .in('status', ['PENDING', 'APPROVED', 'PROCESSING', 'COMPLETED']),
      ]);
    if (bErr) throw bErr;
    if (pErr) throw pErr;
    if (wErr) throw wErr;

    const collected = ((bookings ?? []) as { paid_amount: number | null }[]).reduce(
      (sum, r) => sum + (r.paid_amount ?? 0),
      0,
    );
    const commissionRate =
      (pitch as { platform_commission_rate: number | null } | null)?.platform_commission_rate ?? 10;
    const withdrawn = ((wds ?? []) as { amount: number | null }[]).reduce(
      (sum, r) => sum + (r.amount ?? 0),
      0,
    );

    const netAfterCommission = collected * (1 - commissionRate / 100);
    const available = Math.max(0, Math.round((netAfterCommission - withdrawn) * 100) / 100);

    return { collected, pendingWithdrawals: withdrawn, commissionRate, available };
  } catch (error) {
    console.error('getOwnerBalance:', error);
    throw new Error(toTurkishError(error));
  }
}

// ----------------------------------------------------------------------------
// SUBSCRIPTIONS (Abonelikler)
// ----------------------------------------------------------------------------

export async function getSubscriptions(pitchId: string): Promise<PitchSubscription[]> {
  try {
    const { data, error } = await supabase
      .from('pitch_subscriptions')
      .select('*')
      .eq('pitch_id', pitchId)
      .eq('status', 'ACTIVE')
      .order('weekday', { ascending: true });
    if (error) throw error;
    return (data ?? []) as unknown as PitchSubscription[];
  } catch (error) {
    console.error('getSubscriptions:', error);
    throw new Error(toTurkishError(error));
  }
}

export async function addSubscription(
  pitchId: string,
  sub: SubscriptionInput,
): Promise<void> {
  try {
    const { error } = await supabase.from('pitch_subscriptions').insert({
      pitch_id: pitchId,
      court_id: sub.court_id ?? null,
      customer_name: sub.customer_name,
      customer_phone: sub.customer_phone ?? null,
      weekday: sub.weekday,
      start_time: sub.start_time,
      end_time: sub.end_time ?? null,
      price: sub.price,
      start_date: sub.start_date ?? todayISO(),
      end_date: sub.end_date ?? null,
      notes: sub.notes ?? null,
      status: 'ACTIVE',
    });
    if (error) throw error;
  } catch (error) {
    console.error('addSubscription:', error);
    throw new Error(toTurkishError(error));
  }
}

// ----------------------------------------------------------------------------
// FINANCE — haftalık gelir
// ----------------------------------------------------------------------------

export async function getWeeklyRevenue(pitchId: string): Promise<WeeklyRevenuePoint[]> {
  try {
    const start = addDaysISO(todayISO(), -6);
    const { data, error } = await supabase
      .from('pitch_bookings')
      .select('booking_date, price, paid_amount, status')
      .eq('pitch_id', pitchId)
      .gte('booking_date', start)
      .neq('status', 'CANCELLED');
    if (error) throw error;

    const rows = (data ?? []) as {
      booking_date: string;
      price: number | null;
      paid_amount: number | null;
    }[];

    const dayLabels = ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz'];
    const points: WeeklyRevenuePoint[] = [];
    for (let i = 6; i >= 0; i--) {
      const date = addDaysISO(todayISO(), -i);
      const dayRows = rows.filter((r) => r.booking_date === date);
      const revenue = dayRows.reduce((s, r) => s + (r.price ?? 0), 0);
      const collected = dayRows.reduce((s, r) => s + (r.paid_amount ?? 0), 0);
      const dow = (new Date(date + 'T00:00:00').getDay() + 6) % 7; // 0=Pzt
      points.push({ date, label: dayLabels[dow], revenue, collected });
    }
    return points;
  } catch (error) {
    console.error('getWeeklyRevenue:', error);
    throw new Error(toTurkishError(error));
  }
}

// ----------------------------------------------------------------------------
// SAHACI İSTATİSTİKLERİ & SAHA (COURT) YÖNETİMİ
// ----------------------------------------------------------------------------

export interface CourtDailyStats {
  courtId: string;
  courtName: string;
  revenue: number;
  collected: number;
  bookedHours: number;
  totalHours: number;
  occupancyPercent: number;
}

export interface HourlyOccupancyCell {
  time: string;
  occupancy: number;
  pitches: (null | 'DAILY' | 'SUB')[];
}

const DEFAULT_OPERATING_HOURS = 16; // 08:00–00:00

export function buildEmptyHourlyGrid(courtCount = 0): HourlyOccupancyCell[] {
  return Array.from({ length: 24 }, (_, h) => ({
    time: `${h.toString().padStart(2, '0')}:00`,
    occupancy: 0,
    pitches: Array.from({ length: Math.max(courtCount, 1) }, () => null),
  }));
}

/** Bugünkü rezervasyonlardan saatlik doluluk ızgarası üretir (takvim ile aynı kaynak). */
export function buildHourlyOccupancyGrid(
  bookings: PitchBookingFull[],
  courts: { id: string; name?: string }[],
): HourlyOccupancyCell[] {
  const activeCourts = courts.length > 0 ? courts : [{ id: '_default', name: 'Saha' }];
  return Array.from({ length: 24 }, (_, h) => {
    const time = `${h.toString().padStart(2, '0')}:00`;
    const hourPrefix = time.slice(0, 2);
    const pitches: (null | 'DAILY' | 'SUB')[] = activeCourts.map((court) => {
      const match = bookings.find((b) => {
        if (b.court_id !== court.id) return false;
        const startH = (b.start_time ?? '').slice(0, 2);
        return startH === hourPrefix;
      });
      if (!match) return null;
      return match.source === 'SUBSCRIPTION' ? 'SUB' : 'DAILY';
    });
    const occupancy = pitches.filter(Boolean).length;
    return { time, occupancy, pitches };
  });
}

/** Saha bazlı günlük ciro ve doluluk hesaplar. */
export function computeCourtDailyStats(
  bookings: PitchBookingFull[],
  courts: { id: string; name: string }[],
  operatingHours = DEFAULT_OPERATING_HOURS,
): CourtDailyStats[] {
  if (courts.length === 0) return [];
  return courts.map((court) => {
    const courtBookings = bookings.filter((b) => b.court_id === court.id);
    const confirmed = courtBookings.filter((b) => b.status === 'CONFIRMED');
    const revenue = confirmed.reduce((s, b) => s + (b.price ?? 0), 0);
    const collected = courtBookings.reduce((s, b) => s + (b.paid_amount ?? 0), 0);
    const bookedHours = courtBookings.length;
    const totalHours = operatingHours;
    const occupancyPercent =
      totalHours > 0 ? Math.round((bookedHours / totalHours) * 100) : 0;
    return {
      courtId: court.id,
      courtName: court.name,
      revenue,
      collected,
      bookedHours,
      totalHours,
      occupancyPercent: Math.min(100, occupancyPercent),
    };
  });
}

export function computeOverallOccupancy(
  bookings: PitchBookingFull[],
  courtCount: number,
  operatingHours = DEFAULT_OPERATING_HOURS,
): number {
  if (courtCount <= 0) return 0;
  const totalSlots = courtCount * operatingHours;
  const booked = bookings.filter((b) => b.status !== 'CANCELLED').length;
  return Math.min(100, Math.round((booked / totalSlots) * 100));
}

export async function getPendingBookings(pitchId: string): Promise<PitchBookingFull[]> {
  try {
    const { data, error } = await supabase
      .from('pitch_bookings')
      .select('*, courts(name)')
      .eq('pitch_id', pitchId)
      .eq('status', 'PENDING')
      .gte('booking_date', todayISO())
      .order('created_at', { ascending: true });
    if (error) throw error;
    return (data ?? []) as unknown as PitchBookingFull[];
  } catch (error) {
    console.error('getPendingBookings:', error);
    throw new Error(toTurkishError(error));
  }
}

export interface CourtInput {
  id?: string;
  name: string;
  court_type?: string;
  size?: string | null;
  is_active?: boolean;
  sort_order?: number;
  price?: number | null;
  capacity?: number | null;
  images?: string[] | null;
  description?: string | null;
  lighting_grade?: string | null;
  grass_grade?: string | null;
  locker_grade?: string | null;
}

export async function upsertCourt(pitchId: string, court: CourtInput): Promise<PitchCourt> {
  try {
    const payload = {
      pitch_id: pitchId,
      name: court.name.trim(),
      court_type: court.court_type ?? 'OPEN',
      size: court.size ?? null,
      is_active: court.is_active ?? true,
      sort_order: court.sort_order ?? 0,
      price: court.price ?? null,
      capacity: court.capacity ?? 14,
      images: court.images ?? [],
      description: court.description ?? null,
      lighting_grade: court.lighting_grade ?? null,
      grass_grade: court.grass_grade ?? null,
      locker_grade: court.locker_grade ?? null,
    };
    if (court.id) {
      const { data, error } = await supabase
        .from('courts')
        .update(payload)
        .eq('id', court.id)
        .select()
        .single();
      if (error) throw error;
      return data as unknown as PitchCourt;
    }
    const { data, error } = await supabase.from('courts').insert(payload).select().single();
    if (error) throw error;
    return data as unknown as PitchCourt;
  } catch (error) {
    console.error('upsertCourt:', error);
    throw new Error(toTurkishError(error));
  }
}

export async function uploadPitchImage(file: File, pitchId: string): Promise<string> {
  const ext = file.name.split('.').pop() || 'jpg';
  const path = `pitches/${pitchId}/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;
  const { error } = await supabase.storage
    .from('images')
    .upload(path, file, { cacheControl: '3600', upsert: false });
  if (error) throw error;
  const { data } = supabase.storage.from('images').getPublicUrl(path);
  return data.publicUrl;
}

export async function updatePitchProfile(
  pitchId: string,
  profile: {
    name?: string;
    description?: string;
    amenities?: string[];
    images?: string[];
    image?: string;
    district?: string;
    city?: string;
    address?: string;
  },
): Promise<void> {
  try {
    const { error } = await supabase
      .from('pitches')
      .update({
        ...(profile.name !== undefined && { name: profile.name }),
        ...(profile.description !== undefined && { description: profile.description }),
        ...(profile.amenities !== undefined && { amenities: profile.amenities }),
        ...(profile.images !== undefined && { images: profile.images }),
        ...(profile.image !== undefined && { image: profile.image }),
        ...(profile.district !== undefined && { district: profile.district }),
        ...(profile.city !== undefined && { city: profile.city }),
        ...(profile.address !== undefined && { address: profile.address }),
      })
      .eq('id', pitchId);
    if (error) throw error;
  } catch (error) {
    console.error('updatePitchProfile:', error);
    throw new Error(toTurkishError(error));
  }
}

export interface FinanceDashboardData {
  monthCollected: number;
  monthRevenue: number;
  weeklyRevenue: WeeklyRevenuePoint[];
  paymentMethods: { method: string; label: string; amount: number; count: number }[];
  recentTransactions: { id: string; customerName: string; amount: number; dateLabel: string }[];
  subscriptionRatio: { subscription: number; regular: number };
  hourlyIntensity: { hour: string; intensity: number }[];
}

const PAYMENT_LABELS: Record<string, string> = {
  CASH: 'Nakit',
  CARD: 'Kredi Kartı',
  BANK_TRANSFER: 'Havale/EFT',
  OYNA_WALLET: 'OYNA Cüzdan',
};

export async function getFinanceDashboard(pitchId: string): Promise<FinanceDashboardData> {
  const empty: FinanceDashboardData = {
    monthCollected: 0,
    monthRevenue: 0,
    weeklyRevenue: [],
    paymentMethods: [],
    recentTransactions: [],
    subscriptionRatio: { subscription: 0, regular: 0 },
    hourlyIntensity: [],
  };
  try {
  const month = todayISO().slice(0, 7);
  const monthStart = `${month}-01`;
  const week = await getWeeklyRevenue(pitchId);

  const { data: monthBookings, error: bErr } = await supabase
    .from('pitch_bookings')
    .select('paid_amount, price, source')
    .eq('pitch_id', pitchId)
    .gte('booking_date', monthStart)
    .lt('booking_date', nextMonthFirstDay(month))
    .neq('status', 'CANCELLED');
  if (bErr) throw bErr;

  const rows = (monthBookings ?? []) as { paid_amount: number | null; price: number | null; source: string }[];
  const monthCollected = rows.reduce((s, r) => s + (r.paid_amount ?? 0), 0);
  const monthRevenue = rows.reduce((s, r) => s + (r.price ?? 0), 0);

  const subCount = rows.filter((r) => r.source === 'SUBSCRIPTION').length;
  const totalCount = rows.length || 1;
  const subscriptionRatio = {
    subscription: Math.round((subCount / totalCount) * 100),
    regular: Math.round(((totalCount - subCount) / totalCount) * 100),
  };

  const { data: pitchBookings } = await supabase
    .from('pitch_bookings')
    .select('id, customer_name, booking_date')
    .eq('pitch_id', pitchId)
    .order('booking_date', { ascending: false })
    .limit(100);

  const bookingMap = new Map(
    ((pitchBookings ?? []) as { id: string; customer_name: string | null; booking_date: string }[]).map((b) => [b.id, b]),
  );
  const bookingIds = [...bookingMap.keys()];

  let payRows: { amount: number; payment_method: string; created_at: string; booking_id: string }[] = [];
  if (bookingIds.length > 0) {
    const { data: payments, error: pErr } = await supabase
      .from('booking_payments')
      .select('amount, payment_method, created_at, booking_id')
      .in('booking_id', bookingIds)
      .order('created_at', { ascending: false })
      .limit(50);
    if (pErr) throw pErr;
    payRows = (payments ?? []) as typeof payRows;
  }

  const methodMap = new Map<string, { amount: number; count: number }>();
  payRows.forEach((p) => {
    const m = p.payment_method || 'CASH';
    const prev = methodMap.get(m) ?? { amount: 0, count: 0 };
    methodMap.set(m, { amount: prev.amount + (p.amount ?? 0), count: prev.count + 1 });
  });

  const paymentMethods = Array.from(methodMap.entries()).map(([method, v]) => ({
    method,
    label: PAYMENT_LABELS[method] ?? method,
    amount: v.amount,
    count: v.count,
  }));

  const recentTransactions = payRows.slice(0, 10).map((p, i) => {
    const b = bookingMap.get(p.booking_id);
    return {
      id: `tx-${i}`,
      customerName: b?.customer_name ?? 'Müşteri',
      amount: p.amount ?? 0,
      dateLabel: b?.booking_date ?? p.created_at?.slice(0, 10) ?? '',
    };
  });

  const todayRows = await getPitchBookings(pitchId, todayISO());
  const grid = buildHourlyOccupancyGrid(todayRows, [{ id: 'x', name: 'all' }]);
  const maxOcc = Math.max(...grid.map((g) => g.occupancy), 1);
  const hourlyIntensity = grid.map((g) => ({
    hour: g.time,
    intensity: Math.round((g.occupancy / maxOcc) * 100),
  }));

  return {
    monthCollected,
    monthRevenue,
    weeklyRevenue: week,
    paymentMethods,
    recentTransactions,
    subscriptionRatio,
    hourlyIntensity,
  };
  } catch (error) {
    console.error('getFinanceDashboard:', error);
    return empty;
  }
}

export async function deleteCourt(courtId: string): Promise<void> {
  try {
    const { error } = await supabase
      .from('courts')
      .update({ is_active: false })
      .eq('id', courtId);
    if (error) throw error;
  } catch (error) {
    console.error('deleteCourt:', error);
    throw new Error(toTurkishError(error));
  }
}

// ----------------------------------------------------------------------------
// ÖDEME AYARLARI
// ----------------------------------------------------------------------------

export async function getPaymentSettings(pitchId: string): Promise<PitchPaymentSettings> {
  const defaults: PitchPaymentSettings = {
    paymentOptions: { online: true, deposit: false, cash: true },
    paramMerchantId: '',
    paramClientId: '',
    paramApiKey: '',
  };
  try {
    const { data, error } = await supabase
      .from('pitches')
      .select('payment_options, param_merchant_id, param_client_id, param_api_key')
      .eq('id', pitchId)
      .single();
    if (error) throw error;
    const row = data as {
      payment_options?: { online?: boolean; deposit?: boolean; cash?: boolean } | null;
      param_merchant_id?: string | null;
      param_client_id?: string | null;
      param_api_key?: string | null;
    };
    const opts = row.payment_options ?? {};
    return {
      paymentOptions: {
        online: opts.online ?? true,
        deposit: opts.deposit ?? false,
        cash: opts.cash ?? true,
      },
      paramMerchantId: row.param_merchant_id ?? '',
      paramClientId: row.param_client_id ?? '',
      paramApiKey: row.param_api_key ?? '',
    };
  } catch (error) {
    console.error('getPaymentSettings:', error);
    return defaults;
  }
}

export async function savePaymentSettings(
  pitchId: string,
  settings: PitchPaymentSettings,
): Promise<void> {
  try {
    const { error } = await supabase
      .from('pitches')
      .update({
        payment_options: settings.paymentOptions,
        param_merchant_id: settings.paramMerchantId || null,
        param_client_id: settings.paramClientId || null,
        param_api_key: settings.paramApiKey || null,
      })
      .eq('id', pitchId);
    if (error) throw error;
  } catch (error) {
    console.error('savePaymentSettings:', error);
    throw new Error(toTurkishError(error));
  }
}

// ----------------------------------------------------------------------------
// BANKA HESAPLARI
// ----------------------------------------------------------------------------

export async function getBankAccounts(pitchId: string): Promise<PitchBankAccount[]> {
  try {
    const { data, error } = await supabase
      .from('pitch_bank_accounts')
      .select('*')
      .eq('pitch_id', pitchId)
      .order('is_primary', { ascending: false })
      .order('created_at', { ascending: true });
    if (error) throw error;
    return (data ?? []) as unknown as PitchBankAccount[];
  } catch (error) {
    console.error('getBankAccounts:', error);
    throw new Error(toTurkishError(error));
  }
}

export async function upsertBankAccount(
  pitchId: string,
  account: { id?: string; bank_name: string; account_holder: string; iban: string; is_primary?: boolean },
): Promise<PitchBankAccount> {
  try {
    const payload = {
      pitch_id: pitchId,
      bank_name: account.bank_name.trim(),
      account_holder: account.account_holder.trim(),
      iban: account.iban.replace(/\s/g, '').toUpperCase(),
      is_primary: account.is_primary ?? false,
    };
    if (account.is_primary) {
      await supabase
        .from('pitch_bank_accounts')
        .update({ is_primary: false })
        .eq('pitch_id', pitchId);
    }
    if (account.id) {
      const { data, error } = await supabase
        .from('pitch_bank_accounts')
        .update(payload)
        .eq('id', account.id)
        .select()
        .single();
      if (error) throw error;
      return data as unknown as PitchBankAccount;
    }
    const { data, error } = await supabase
      .from('pitch_bank_accounts')
      .insert(payload)
      .select()
      .single();
    if (error) throw error;
    return data as unknown as PitchBankAccount;
  } catch (error) {
    console.error('upsertBankAccount:', error);
    throw new Error(toTurkishError(error));
  }
}

export async function deleteBankAccount(accountId: string): Promise<void> {
  try {
    const { error } = await supabase.from('pitch_bank_accounts').delete().eq('id', accountId);
    if (error) throw error;
  } catch (error) {
    console.error('deleteBankAccount:', error);
    throw new Error(toTurkishError(error));
  }
}

// ----------------------------------------------------------------------------
// PERSONEL & GÖREVLER
// ----------------------------------------------------------------------------

export async function getStaffMembers(pitchId: string): Promise<PitchStaffMember[]> {
  try {
    const { data, error } = await supabase
      .from('pitch_staff_members')
      .select('*')
      .eq('pitch_id', pitchId)
      .order('sort_order', { ascending: true });
    if (error) throw error;
    return (data ?? []) as unknown as PitchStaffMember[];
  } catch (error) {
    console.error('getStaffMembers:', error);
    throw new Error(toTurkishError(error));
  }
}

export async function upsertStaffMember(
  pitchId: string,
  member: {
    id?: string;
    name: string;
    role_title?: string;
    status?: PitchStaffMember['status'];
    avatar_url?: string | null;
    phone?: string | null;
    sort_order?: number;
  },
): Promise<PitchStaffMember> {
  try {
    const payload = {
      pitch_id: pitchId,
      name: member.name.trim(),
      role_title: member.role_title?.trim() || 'Personel',
      status: member.status ?? 'OFF_DUTY',
      avatar_url: member.avatar_url ?? null,
      phone: member.phone ?? null,
      sort_order: member.sort_order ?? 0,
    };
    if (member.id) {
      const { data, error } = await supabase
        .from('pitch_staff_members')
        .update(payload)
        .eq('id', member.id)
        .select()
        .single();
      if (error) throw error;
      return data as unknown as PitchStaffMember;
    }
    const { data, error } = await supabase
      .from('pitch_staff_members')
      .insert(payload)
      .select()
      .single();
    if (error) throw error;
    return data as unknown as PitchStaffMember;
  } catch (error) {
    console.error('upsertStaffMember:', error);
    throw new Error(toTurkishError(error));
  }
}

export async function deleteStaffMember(memberId: string): Promise<void> {
  try {
    const { error } = await supabase.from('pitch_staff_members').delete().eq('id', memberId);
    if (error) throw error;
  } catch (error) {
    console.error('deleteStaffMember:', error);
    throw new Error(toTurkishError(error));
  }
}

export async function getStaffTasks(pitchId: string): Promise<PitchStaffTask[]> {
  try {
    const { data, error } = await supabase
      .from('pitch_staff_tasks')
      .select('*')
      .eq('pitch_id', pitchId)
      .neq('status', 'CANCELLED')
      .order('created_at', { ascending: false });
    if (error) throw error;
    return (data ?? []) as unknown as PitchStaffTask[];
  } catch (error) {
    console.error('getStaffTasks:', error);
    throw new Error(toTurkishError(error));
  }
}

export async function upsertStaffTask(
  pitchId: string,
  task: {
    id?: string;
    title: string;
    assigned_to?: string | null;
    assigned_name?: string | null;
    priority?: PitchStaffTask['priority'];
    status?: PitchStaffTask['status'];
    due_time?: string | null;
    due_date?: string | null;
  },
): Promise<PitchStaffTask> {
  try {
    const payload = {
      pitch_id: pitchId,
      title: task.title.trim(),
      assigned_to: task.assigned_to ?? null,
      assigned_name: task.assigned_name ?? null,
      priority: task.priority ?? 'MEDIUM',
      status: task.status ?? 'PENDING',
      due_time: task.due_time ?? null,
      due_date: task.due_date ?? null,
    };
    if (task.id) {
      const { data, error } = await supabase
        .from('pitch_staff_tasks')
        .update(payload)
        .eq('id', task.id)
        .select()
        .single();
      if (error) throw error;
      return data as unknown as PitchStaffTask;
    }
    const { data, error } = await supabase
      .from('pitch_staff_tasks')
      .insert(payload)
      .select()
      .single();
    if (error) throw error;
    return data as unknown as PitchStaffTask;
  } catch (error) {
    console.error('upsertStaffTask:', error);
    throw new Error(toTurkishError(error));
  }
}

export async function toggleStaffTaskStatus(taskId: string, completed: boolean): Promise<void> {
  try {
    const { error } = await supabase
      .from('pitch_staff_tasks')
      .update({ status: completed ? 'COMPLETED' : 'PENDING' })
      .eq('id', taskId);
    if (error) throw error;
  } catch (error) {
    console.error('toggleStaffTaskStatus:', error);
    throw new Error(toTurkishError(error));
  }
}

export async function deleteStaffTask(taskId: string): Promise<void> {
  try {
    const { error } = await supabase
      .from('pitch_staff_tasks')
      .update({ status: 'CANCELLED' })
      .eq('id', taskId);
    if (error) throw error;
  } catch (error) {
    console.error('deleteStaffTask:', error);
    throw new Error(toTurkishError(error));
  }
}

// ----------------------------------------------------------------------------
// SKOR QR
// ----------------------------------------------------------------------------

/** Maç için skor QR token'ı oluşturur/getirir (SECURITY DEFINER RPC). */
export async function getOrCreateScoreToken(matchId: string): Promise<string> {
  try {
    const { data, error } = await supabase.rpc('get_or_create_match_score_token', {
      p_match_id: matchId,
    });
    if (error) throw error;
    return data as string;
  } catch (error) {
    console.error('getOrCreateScoreToken:', error);
    throw new Error(toTurkishError(error));
  }
}

// ----------------------------------------------------------------------------
// REALTIME
// ----------------------------------------------------------------------------

/**
 * Bir tesisin rezervasyonlarındaki değişiklikleri canlı dinler.
 * Geri dönen fonksiyon aboneliği iptal eder.
 */
export function subscribeToOwnerBookings(
  pitchId: string,
  onChange: () => void,
): () => void {
  const channel = supabase
    .channel(`owner-bookings-${pitchId}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'pitch_bookings',
        filter: `pitch_id=eq.${pitchId}`,
      },
      () => onChange(),
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}
