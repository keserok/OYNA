import { supabase } from '../supabaseClient';

// ─── OW-E (P4) — Çok-kort tesis takvimi veri katmanı ─────────────────────────
// get_facility_schedule RPC'sinin ham çıktısı. Saat-ızgara birleştirmesi saf
// facilityScheduleModel'de yapılır (test edilebilir, UI'dan bağımsız).

export interface ScheduleBooking {
  id: string;
  court_id: string | null;
  booking_date: string; // YYYY-MM-DD
  start_time: string;   // HH:MM
  end_time: string;     // HH:MM
  status: string;       // CONFIRMED | COMPLETED | CANCELLED
  source: string;       // OWNER_MANUAL | APP_BOOKING | SUBSCRIPTION | APP_MATCH
  price: number | null;
  paid_amount: number | null;
  payment_status: string | null;
  customer_name: string | null;
  customer_phone: string | null;
  title: string | null;
}

export interface ScheduleClosure {
  id: string;
  court_id: string | null;     // null = tesis geneli
  is_recurring: boolean;
  exception_date: string | null;
  day_of_week: number | null;  // ISODOW 1-7 (recurring'de)
  start_time: string | null;   // null = tüm gün
  end_time: string | null;
  reason: string | null;
}

export interface ScheduleHold {
  court_id: string | null;
  booking_date: string;
  start_time: string; // HH:MM
  is_mine: boolean;
}

export interface ScheduleCourt {
  id: string;
  name: string;
  court_type: string | null;
}

export interface FacilitySchedule {
  pitch: {
    id: string;
    name: string;
    working_hours: unknown;
  };
  courts: ScheduleCourt[];
  bookings: ScheduleBooking[];
  closures: ScheduleClosure[];
  holds: ScheduleHold[];
}

/**
 * Tesisin [from,to] penceresindeki ham takvim verisini getirir (≤31 gün).
 * Yetki sunucuda (owner/admin). Müşteri adı/telefon yalnız yetkiliye döner.
 */
export async function getFacilitySchedule(
  pitchId: string,
  fromISO: string,
  toISO: string,
): Promise<FacilitySchedule> {
  const { data, error } = await supabase.rpc('get_facility_schedule', {
    p_pitch_id: pitchId,
    p_from: fromISO,
    p_to: toISO,
  });
  if (error) {
    const msg = error.message || '';
    if (msg.includes('RANGE_TOO_WIDE')) throw new Error('En fazla 31 günlük takvim penceresi görüntülenebilir.');
    if (msg.includes('UNAUTHORIZED')) throw new Error('Bu tesisin takvimine erişim yetkin yok.');
    throw new Error('Takvim yüklenemedi. Lütfen tekrar dene.');
  }
  const d = (data ?? {}) as Partial<FacilitySchedule>;
  return {
    pitch: d.pitch as FacilitySchedule['pitch'],
    courts: d.courts ?? [],
    bookings: d.bookings ?? [],
    closures: d.closures ?? [],
    holds: d.holds ?? [],
  };
}
