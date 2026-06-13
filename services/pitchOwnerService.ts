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
  PitchExpense,
  PitchDebtor,
  PitchSubscription,
  PitchTariff,
  FlashDeal,
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
    const uid = await getCurrentUserId();

    const { data: booking, error: fetchErr } = await supabase
      .from('pitch_bookings')
      .select('user_id, match_id, paid_amount, price, payment_status')
      .eq('id', bookingId)
      .single();
    if (fetchErr) throw fetchErr;

    const b = booking as {
      user_id: string | null;
      match_id: string | null;
      paid_amount: number | null;
      price: number | null;
      payment_status: string | null;
    };

    const { error } = await supabase
      .from('pitch_bookings')
      .update({
        status: 'CANCELLED',
        cancellation_reason: reason,
        cancelled_at: new Date().toISOString(),
        cancelled_by: uid,
        payment_status: (b.paid_amount ?? 0) > 0 ? 'REFUNDED' : b.payment_status,
      })
      .eq('id', bookingId);
    if (error) throw error;

    // Cüzdandan ödeme yapan oyuncuya iade
    const refundAmount = b.paid_amount ?? 0;
    if (b.user_id && refundAmount > 0) {
      const { error: refundErr } = await supabase.rpc('process_match_refund', {
        p_user_id: b.user_id,
        p_match_id: b.match_id,
        p_amount: refundAmount,
      });
      if (refundErr) console.warn('İade işlenemedi:', refundErr);
    }

    if (b.user_id) {
      await supabase.from('notifications').insert({
        user_id: b.user_id,
        title: 'Rezervasyonunuz İptal Edildi',
        body:
          refundAmount > 0
            ? `Rezervasyonunuz iptal edildi. ${refundAmount}₺ cüzdanınıza iade edildi.`
            : 'Rezervasyonunuz tesis tarafından iptal edildi.',
        type_key: 'BOOKING_CANCELLED',
      });
    }
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

export async function getActiveFlashDeals(pitchId: string): Promise<FlashDeal[]> {
  try {
    const { data, error } = await supabase
      .from('pitch_flash_deals')
      .select('*')
      .eq('pitch_id', pitchId)
      .eq('is_claimed', false)
      .gt('expires_at', new Date().toISOString())
      .order('expires_at', { ascending: true });
    if (error) throw error;
    return (data ?? []) as unknown as FlashDeal[];
  } catch (error) {
    console.error('getActiveFlashDeals:', error);
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
