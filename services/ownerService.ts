import { supabase } from '../supabaseClient';
import type {
  OwnerFacility,
  OwnerCourt,
  PitchBooking,
  PitchSubscription,
} from '../types';

// ============================================================================
// TESİS SAHİBİ SERVİSİ — Doluluk Tek Kaynak (pitch_bookings) ile çalışır
// ----------------------------------------------------------------------------
// Tüm okuma/yazma buradan geçer. camelCase (TS) <-> snake_case (DB) eşlemesi
// burada yapılır (eski supabaseMutations.fbUpdatePitch ham Pitch gönderip
// snake_case kolonlarda patlıyordu — bu katman onu doğru yapar).
// ============================================================================

const PG_EXCLUSION_VIOLATION = '23P01'; // çakışan rezervasyon (EXCLUDE kısıtı)

// ---- Mappers: Facility (pitches) -------------------------------------------
const facilityFromDb = (r: any): OwnerFacility => ({
  id: r.id,
  ownerId: r.owner_id ?? null,
  name: r.name,
  district: r.district ?? null,
  address: r.address ?? null,
  latitude: r.latitude ?? undefined,
  longitude: r.longitude ?? undefined,
  description: r.description ?? null,
  image: r.image ?? null,
  images: Array.isArray(r.images) ? r.images : [],
  amenities: Array.isArray(r.amenities) ? r.amenities : [],
  pricePerPerson: r.price_per_person ?? null,
  totalPrice: r.total_price ?? null,
  workingHours: r.working_hours ?? { open: '10:00', close: '02:00', slot_duration: 60 },
  settings: r.settings ?? {},
  rating: r.rating ?? undefined,
  isActive: r.is_active ?? true,
});

const facilityToDb = (f: Partial<OwnerFacility>): Record<string, any> => {
  const d: Record<string, any> = {};
  if (f.name !== undefined) d.name = f.name;
  if (f.district !== undefined) d.district = f.district;
  if (f.address !== undefined) d.address = f.address;
  if (f.latitude !== undefined) d.latitude = f.latitude;
  if (f.longitude !== undefined) d.longitude = f.longitude;
  if (f.description !== undefined) d.description = f.description;
  if (f.image !== undefined) d.image = f.image;
  if (f.images !== undefined) d.images = f.images;
  if (f.amenities !== undefined) d.amenities = f.amenities;
  if (f.pricePerPerson !== undefined) d.price_per_person = f.pricePerPerson;
  if (f.totalPrice !== undefined) d.total_price = f.totalPrice;
  if (f.workingHours !== undefined) d.working_hours = f.workingHours;
  if (f.settings !== undefined) d.settings = f.settings;
  if (f.isActive !== undefined) d.is_active = f.isActive;
  if (f.ownerId !== undefined) d.owner_id = f.ownerId;
  return d;
};

// ---- Mappers: Court (courts) ------------------------------------------------
const courtFromDb = (r: any): OwnerCourt => ({
  id: r.id,
  pitchId: r.pitch_id,
  name: r.name,
  courtType: r.court_type ?? 'CLOSED',
  size: r.size ?? null,
  price: r.price ?? null,
  images: Array.isArray(r.images) ? r.images : [],
  description: r.description ?? null,
  isActive: r.is_active ?? true,
  lightingGrade: r.lighting_grade ?? null,
  grassGrade: r.grass_grade ?? null,
  lockerGrade: r.locker_grade ?? null,
  sortOrder: r.sort_order ?? 0,
  createdAt: r.created_at ?? undefined,
});

const courtToDb = (c: Partial<OwnerCourt>): Record<string, any> => {
  const d: Record<string, any> = {};
  if (c.id !== undefined) d.id = c.id;
  if (c.pitchId !== undefined) d.pitch_id = c.pitchId;
  if (c.name !== undefined) d.name = c.name;
  if (c.courtType !== undefined) d.court_type = c.courtType;
  if (c.size !== undefined) d.size = c.size;
  if (c.price !== undefined) d.price = c.price;
  if (c.images !== undefined) d.images = c.images;
  if (c.description !== undefined) d.description = c.description;
  if (c.isActive !== undefined) d.is_active = c.isActive;
  if (c.lightingGrade !== undefined) d.lighting_grade = c.lightingGrade;
  if (c.grassGrade !== undefined) d.grass_grade = c.grassGrade;
  if (c.lockerGrade !== undefined) d.locker_grade = c.lockerGrade;
  if (c.sortOrder !== undefined) d.sort_order = c.sortOrder;
  return d;
};

// ---- Mappers: Booking (pitch_bookings) -------------------------------------
const bookingFromDb = (r: any): PitchBooking => ({
  id: r.id,
  pitchId: r.pitch_id,
  courtId: r.court_id,
  subscriptionId: r.subscription_id ?? null,
  matchId: r.match_id ?? null,
  userId: r.user_id ?? null,
  source: r.source ?? 'OWNER_MANUAL',
  title: r.title ?? null,
  bookingDate: r.booking_date,
  startTime: typeof r.start_time === 'string' ? r.start_time.slice(0, 5) : r.start_time,
  endTime: typeof r.end_time === 'string' ? r.end_time.slice(0, 5) : r.end_time,
  status: r.status ?? 'CONFIRMED',
  paymentStatus: r.payment_status ?? 'PENDING',
  price: Number(r.price ?? 0),
  paidAmount: Number(r.paid_amount ?? 0),
  customerName: r.customer_name ?? null,
  customerPhone: r.customer_phone ?? null,
  createdAt: r.created_at ?? undefined,
});

// ---- Mappers: Subscription (pitch_subscriptions) ---------------------------
const subFromDb = (r: any): PitchSubscription => ({
  id: r.id,
  courtId: r.court_id,
  pitchId: r.pitch_id,
  customerName: r.customer_name ?? null,
  customerPhone: r.customer_phone ?? null,
  weekday: r.weekday,
  startTime: typeof r.start_time === 'string' ? r.start_time.slice(0, 5) : r.start_time,
  endTime: typeof r.end_time === 'string' ? r.end_time.slice(0, 5) : r.end_time,
  price: Number(r.price ?? 0),
  status: r.status ?? 'ACTIVE',
  startDate: r.start_date ?? undefined,
  endDate: r.end_date ?? null,
  materializedUntil: r.materialized_until ?? null,
  notes: r.notes ?? null,
  createdAt: r.created_at ?? undefined,
});

// ============================================================================
// TESİS (FACILITY)
// ============================================================================

/** Bir tesis sahibinin tesisini getirir (ilk tesis). */
export async function getOwnerFacility(ownerId: string): Promise<OwnerFacility | null> {
  const { data, error } = await supabase
    .from('pitches')
    .select('*')
    .eq('owner_id', ownerId)
    .order('name')
    .limit(1)
    .maybeSingle();
  if (error) { console.error('getOwnerFacility:', error); throw error; }
  return data ? facilityFromDb(data) : null;
}

/** Dev/fallback: DB'deki ilk tesisi getirir (giriş yapılmamışsa test için). */
export async function getFirstFacility(): Promise<OwnerFacility | null> {
  const { data, error } = await supabase.from('pitches').select('*').order('name').limit(1).maybeSingle();
  if (error) { console.error('getFirstFacility:', error); throw error; }
  return data ? facilityFromDb(data) : null;
}

/** Tesis bilgilerini günceller (mevcut tesis) veya yeni oluşturur. */
export async function upsertFacility(
  facility: Partial<OwnerFacility> & { id?: string; ownerId?: string | null },
): Promise<OwnerFacility> {
  const payload = facilityToDb(facility);
  if (facility.id) {
    const { data, error } = await supabase.from('pitches').update(payload).eq('id', facility.id).select().single();
    if (error) { console.error('upsertFacility(update):', error); throw error; }
    return facilityFromDb(data);
  }
  const { data, error } = await supabase.from('pitches').insert(payload).select().single();
  if (error) { console.error('upsertFacility(insert):', error); throw error; }
  return facilityFromDb(data);
}

// ============================================================================
// SAHALAR (COURTS)
// ============================================================================

export async function getCourts(pitchId: string): Promise<OwnerCourt[]> {
  const { data, error } = await supabase
    .from('courts')
    .select('*')
    .eq('pitch_id', pitchId)
    .order('sort_order');
  if (error) { console.error('getCourts:', error); throw error; }
  return (data ?? []).map(courtFromDb);
}

export async function upsertCourt(court: Partial<OwnerCourt> & { pitchId: string }): Promise<OwnerCourt> {
  const payload = courtToDb(court);
  if (court.id) {
    const { data, error } = await supabase.from('courts').update(payload).eq('id', court.id).select().single();
    if (error) { console.error('upsertCourt(update):', error); throw error; }
    return courtFromDb(data);
  }
  const { data, error } = await supabase.from('courts').insert(payload).select().single();
  if (error) { console.error('upsertCourt(insert):', error); throw error; }
  return courtFromDb(data);
}

export async function deleteCourt(id: string): Promise<void> {
  const { error } = await supabase.from('courts').delete().eq('id', id);
  if (error) { console.error('deleteCourt:', error); throw error; }
}

export async function setCourtActive(id: string, isActive: boolean): Promise<void> {
  const { error } = await supabase.from('courts').update({ is_active: isActive }).eq('id', id);
  if (error) { console.error('setCourtActive:', error); throw error; }
}

// ============================================================================
// REZERVASYONLAR / SLOTLAR (PITCH_BOOKINGS = TEK KAYNAK)
// ============================================================================

/** Bir tesisin verilen tarih aralığındaki tüm rezervasyonları (sahibi görür). */
export async function getBookings(pitchId: string, dateFrom: string, dateTo: string): Promise<PitchBooking[]> {
  const { data, error } = await supabase
    .from('pitch_bookings')
    .select('*')
    .eq('pitch_id', pitchId)
    .gte('booking_date', dateFrom)
    .lte('booking_date', dateTo)
    .neq('status', 'CANCELLED')
    .order('booking_date')
    .order('start_time');
  if (error) { console.error('getBookings:', error); throw error; }
  return (data ?? []).map(bookingFromDb);
}

export interface CreateBookingInput {
  pitchId: string;
  courtId: string;
  bookingDate: string;   // YYYY-MM-DD
  startTime: string;     // HH:MM
  endTime: string;       // HH:MM
  title?: string;
  customerName?: string;
  customerPhone?: string;
  price?: number;
  paidAmount?: number;
  paymentStatus?: 'PAID' | 'PARTIAL' | 'PENDING';
  source?: 'OWNER_MANUAL' | 'APP_BOOKING' | 'APP_MATCH';
}

/** Tek seferlik rezervasyon ekler. Çakışma olursa anlaşılır bir hata fırlatır. */
export async function createBooking(input: CreateBookingInput): Promise<PitchBooking> {
  const payload = {
    pitch_id: input.pitchId,
    court_id: input.courtId,
    booking_date: input.bookingDate,
    start_time: input.startTime,
    end_time: input.endTime,
    status: 'CONFIRMED',
    source: input.source ?? 'OWNER_MANUAL',
    title: input.title ?? input.customerName ?? null,
    customer_name: input.customerName ?? null,
    customer_phone: input.customerPhone ?? null,
    price: input.price ?? 0,
    paid_amount: input.paidAmount ?? 0,
    payment_status: input.paymentStatus ?? 'PENDING',
  };
  const { data, error } = await supabase.from('pitch_bookings').insert(payload).select().single();
  if (error) {
    if ((error as any).code === PG_EXCLUSION_VIOLATION) {
      throw new Error('Bu saha ve saatte zaten bir rezervasyon var.');
    }
    console.error('createBooking:', error);
    throw error;
  }
  return bookingFromDb(data);
}

export async function deleteBooking(id: string): Promise<void> {
  const { error } = await supabase.from('pitch_bookings').delete().eq('id', id);
  if (error) { console.error('deleteBooking:', error); throw error; }
}

export async function updateBookingPayment(
  id: string,
  paymentStatus: 'PAID' | 'PARTIAL' | 'PENDING',
  paidAmount: number,
): Promise<void> {
  const { error } = await supabase
    .from('pitch_bookings')
    .update({ payment_status: paymentStatus, paid_amount: paidAmount })
    .eq('id', id);
  if (error) { console.error('updateBookingPayment:', error); throw error; }
}

// ============================================================================
// ABONMANLAR (PITCH_SUBSCRIPTIONS)
// ============================================================================

export async function getSubscriptions(pitchId: string): Promise<PitchSubscription[]> {
  const { data, error } = await supabase
    .from('pitch_subscriptions')
    .select('*')
    .eq('pitch_id', pitchId)
    .neq('status', 'CANCELLED')
    .order('weekday');
  if (error) { console.error('getSubscriptions:', error); throw error; }
  return (data ?? []).map(subFromDb);
}

export interface CreateSubscriptionInput {
  pitchId: string;
  courtId: string;
  weekday: number;       // 0=Pzt ... 6=Paz
  startTime: string;     // HH:MM
  endTime: string;       // HH:MM
  customerName?: string;
  customerPhone?: string;
  price?: number;
  startDate?: string;
  endDate?: string | null;
  notes?: string;
}

/** Abonman oluşturur ve hemen ufuk kadar (12 hafta) slotlara materialize eder. */
export async function createSubscription(input: CreateSubscriptionInput): Promise<PitchSubscription> {
  const payload = {
    pitch_id: input.pitchId,
    court_id: input.courtId,
    weekday: input.weekday,
    start_time: input.startTime,
    end_time: input.endTime,
    customer_name: input.customerName ?? null,
    customer_phone: input.customerPhone ?? null,
    price: input.price ?? 0,
    status: 'ACTIVE',
    start_date: input.startDate ?? new Date().toISOString().slice(0, 10),
    end_date: input.endDate ?? null,
    notes: input.notes ?? null,
  };
  const { data, error } = await supabase.from('pitch_subscriptions').insert(payload).select().single();
  if (error) { console.error('createSubscription:', error); throw error; }

  // Slotlara aç (sahiplik kontrollü RPC)
  const { error: rpcError } = await supabase.rpc('materialize_subscriptions', {
    p_horizon_weeks: 12,
    p_sub_id: data.id,
  });
  if (rpcError) console.error('materialize_subscriptions:', rpcError);

  return subFromDb(data);
}

/** Abonmanı iptal eder ve gelecek slotlarını siler (RPC). */
export async function cancelSubscription(id: string): Promise<void> {
  const { error } = await supabase.rpc('cancel_subscription', { p_id: id });
  if (error) { console.error('cancelSubscription:', error); throw error; }
}

// ============================================================================
// DOLULUK (TÜRETİLMİŞ)
// ============================================================================

/** Bir sahanın verilen gündeki doluluk yüzdesi (0-100), DB'de türetilir. */
export async function getCourtOccupancy(courtId: string, date: string): Promise<number> {
  const { data, error } = await supabase.rpc('get_court_occupancy', { p_court_id: courtId, p_date: date });
  if (error) { console.error('getCourtOccupancy:', error); return 0; }
  return Number(data ?? 0);
}
