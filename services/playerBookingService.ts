// ─── Oyuncu Rezervasyon Servisi ──────────────────────────────────────────────
// Oyuncunun saha müsaitliğini görmesi, rezervasyon oluşturması,
// kendi rezervasyonlarını listelemesi ve iptal etmesi (kademeli iade: ≥24s %100, 6–24s %50, <6s yok).
// Tüm yazma işlemleri SECURITY DEFINER RPC'ler üzerinden gider;
// doğrudan tablo yazma RLS ile kapalıdır.

import { supabase } from '../supabaseClient';
import { clearTicketCache } from '../utils/ticketCache';
// Çakışma kuralı tek kaynaktan: ızgara ile aynı modül.
import { bookingCoversSlot, hmToMinutes, minutesToHM } from '../shared/slotGrid';

export interface AvailabilityRow {
  court_id: string | null;
  booking_date: string; // YYYY-MM-DD
  start_time: string; // HH:MM:SS
  end_time: string; // HH:MM:SS
  status: 'PENDING' | 'CONFIRMED';
}

export interface MyBooking {
  id: string;
  pitch_id: string;
  court_id: string | null;
  booking_date: string;
  start_time: string;
  end_time: string;
  status: 'PENDING' | 'CONFIRMED' | 'CANCELLED';
  source: string;
  price: number;
  deposit_amount: number;
  paid_amount: number;
  payment_status: string;
  cancellation_reason: string | null;
  created_at: string;
  pitches: { name: string; district: string | null; image: string | null } | null;
  courts: { name: string; capacity?: number | null; min_capacity?: number | null; max_capacity?: number | null } | null;
}

export interface CancelResult {
  booking_id: string;
  refund_percent: number;
  refund_amount: number;
  paid_amount: number;
}

// C5/C7 — iptal ÖNİZLEMESİ (salt-okunur). Sunucunun KENDİ formülüyle (eşik +
// PSP + Istanbul saati) hesaplanan iade; FE artık kendi tahminini uydurmaz.
export interface CancelPreview {
  booking_id: string;
  cancellable: boolean;
  refund_percent: number;
  refund_amount: number;   // net (gross − PSP), gerçek iptalle birebir
  psp_fee: number;
  gross: number;
  paid_amount: number;
  hours_left: number;
}

// SQL exception mesajlarını kullanıcı dostu Türkçe'ye çevir
const ERROR_MAP: [string, string][] = [
  ['SLOT_TAKEN', 'Bu saat dilimi az önce dolmuş. Lütfen başka bir saat seç.'],
  ['BOOKING_DISABLED', 'Bu tesis için online rezervasyon geçici olarak kapalı.'],
  ['NO_TARIFF', 'Bu saha için fiyat tarifesi tanımlanmamış; şimdilik uygulamadan rezervasyon alınamıyor.'],
  ['SLOT_UNAVAILABLE', 'Bu saat dilimi tesis tarafından kapatılmış.'],
  ['CANCEL_WINDOW_CLOSED', 'Rezervasyon saatine 48 saatten az kaldığı için uygulamadan iptal edilemiyor. Lütfen tesisle iletişime geç.'],
  ['ALREADY_STARTED', 'Geçmiş veya başlamış bir rezervasyon iptal edilemez.'],
  ['ALREADY_CANCELLED', 'Bu rezervasyon zaten iptal edilmiş.'],
  ['UNAUTHORIZED', 'Bu işlem için giriş yapman gerekiyor.'],
  ['NOT_FOUND', 'Rezervasyon bulunamadı.'],
];

export function toPlayerErrorMessage(error: unknown): string {
  const msg = error instanceof Error ? error.message : String((error as any)?.message ?? error ?? '');
  for (const [code, tr] of ERROR_MAP) {
    if (msg.includes(code)) return tr;
  }
  return 'Bir şeyler ters gitti. Lütfen tekrar dene.';
}

export function toISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** "HH:MM:SS" → "HH:MM" */
export function shortTime(t: string): string {
  return (t || '').slice(0, 5);
}

/**
 * Tesisin dolu saatlerini getirir (kişisel veri içermez).
 * Dönen satırlar PENDING + CONFIRMED rezervasyonlardır.
 */
export async function fetchPitchAvailability(
  pitchId: string,
  fromDate: Date,
  toDate: Date
): Promise<AvailabilityRow[]> {
  const { data, error } = await supabase.rpc('get_pitch_availability', {
    p_pitch_id: pitchId,
    p_date_from: toISODate(fromDate),
    p_date_to: toISODate(toDate),
  });
  if (error) throw error;
  return (data ?? []) as AvailabilityRow[];
}

/**
 * Gün + kort bazında rezervasyon ARALIKLARI.
 *
 * Anahtar: `${courtId}|${dateISO}` — court_id NULL ise tesis geneli sayılır ve
 * `*|${dateISO}` anahtarına yazılır.
 */
export type BusyMap = Record<
  string,
  { start: string; end: string; status: 'PENDING' | 'CONFIRMED' }[]
>;

/**
 * Müsaitlik satırlarını aralık listesine çevirir.
 *
 * ÖNCESİ: rezervasyon SAAT BAŞI işaretleniyordu (`for h = startH; h < endH`).
 * Izgara artık tarifeden geldiği için dilimler 19:30 gibi yarım saatli
 * başlayabiliyor; saat başı işaretleme, 19:00-20:00'lik bir rezervasyonun
 * 19:30-21:00 dilimini kapattığını GÖREMİYORDU. Dilim boş görünüp gönderimde
 * veritabanının `pitch_bookings_no_overlap` (GiST EXCLUDE) kısıtına takılıyordu.
 * Artık aralık kesişimine bakılır; kural tek yerde: bookingCoversSlot.
 */
export function buildBusyMap(rows: AvailabilityRow[]): BusyMap {
  const map: BusyMap = {};
  for (const r of rows) {
    const key = `${r.court_id ?? '*'}|${r.booking_date}`;
    (map[key] ??= []).push({
      start: r.start_time.slice(0, 5),
      end: r.end_time.slice(0, 5),
      status: r.status,
    });
  }
  return map;
}

/**
 * Dilim dolu mu? Kısmi çakışma da doludur.
 *
 * `endHHMM` verilmezse 60 dakika varsayılır (eski çağrı biçimiyle uyum);
 * doğrusu dilimin gerçek bitişini geçmektir: `hours[].endTime`.
 */
export function isSlotBusy(
  busyMap: BusyMap,
  courtId: string,
  dateISO: string,
  startHHMM: string,
  endHHMM?: string
): 'PENDING' | 'CONFIRMED' | null {
  const slot = {
    startTime: startHHMM,
    endTime: endHHMM || minutesToHM(hmToMinutes(startHHMM) + 60),
  };
  let sonuc: 'PENDING' | 'CONFIRMED' | null = null;
  for (const key of [`${courtId}|${dateISO}`, `*|${dateISO}`]) {
    for (const b of busyMap[key] ?? []) {
      if (!bookingCoversSlot(b.start, b.end, slot)) continue;
      // CONFIRMED, PENDING'i ezer (daha kesin durum)
      if (b.status === 'CONFIRMED') return 'CONFIRMED';
      sonuc = 'PENDING';
    }
  }
  return sonuc;
}

export interface CreateBookingParams {
  pitchId: string;
  courtId: string;
  dateISO: string; // YYYY-MM-DD
  startTime: string; // HH:MM
  endTime: string; // HH:MM (gece yarısını aşarsa RPC +1 gün ekler)
  title?: string;
  note?: string;
}

export interface CreateBookingResult {
  bookingId: string;
  status: 'PENDING' | 'CONFIRMED';
  price: number;
  depositAmount: number;
}

/** Uygulamadan rezervasyon oluşturur (source=APP_BOOKING). */
export async function createAppBooking(params: CreateBookingParams): Promise<CreateBookingResult> {
  const { data, error } = await supabase.rpc('create_pitch_booking', {
    p_pitch_id: params.pitchId,
    p_court_id: params.courtId,
    p_booking_date: params.dateISO,
    p_start_time: params.startTime,
    p_end_time: params.endTime,
    p_source: 'APP_BOOKING',
    p_customer_name: null,
    p_customer_phone: null,
    p_note: params.note ?? null,
    p_title: params.title ?? null,
  });
  if (error) throw error;

  const bookingId = data as string;
  // Durumu öğren (PENDING = onay bekliyor, CONFIRMED = anında onay)
  const { data: row, error: selErr } = await supabase
    .from('pitch_bookings')
    .select('status, price, deposit_amount')
    .eq('id', bookingId)
    .single();
  if (selErr) {
    // Kayıt oluştu ama okunamadı — kritik değil, varsayılan PENDING göster
    return { bookingId, status: 'PENDING', price: 0, depositAmount: 0 };
  }
  return {
    bookingId,
    status: (row.status as 'PENDING' | 'CONFIRMED') ?? 'PENDING',
    price: Number(row.price ?? 0),
    depositAmount: Number(row.deposit_amount ?? 0),
  };
}

/** Oyuncunun kendi rezervasyonları (RLS: user_id = auth.uid()). */
export async function fetchMyBookings(): Promise<MyBooking[]> {
  const { data, error } = await supabase
    .from('pitch_bookings')
    .select('id, pitch_id, court_id, booking_date, start_time, end_time, status, source, price, deposit_amount, paid_amount, payment_status, cancellation_reason, created_at, pitches(name, district, image), courts(name, capacity, min_capacity, max_capacity)')
    .order('booking_date', { ascending: false })
    .order('start_time', { ascending: false })
    .limit(50);
  if (error) throw error;
  return (data ?? []) as unknown as MyBooking[];
}

/** Kademeli iade ile iptal; iade yüzdesi/tutarı (refund_percent/refund_amount) döner. */
export async function cancelMyBooking(bookingId: string, reason?: string): Promise<CancelResult> {
  const { data, error } = await supabase.rpc('cancel_app_booking', {
    p_booking_id: bookingId,
    p_reason: reason ?? null,
  });
  if (error) throw error;
  // İptal edilen biletin çevrimdışı kopyası cihazda yaşamaya devam etmesin:
  // kapıda "çalışan QR" yanılsaması üretiyordu (26 Ağu 2026). Servis katmanında
  // duruyor ki bileti hangi ekran iptal ederse etsin kopya silinsin.
  // (ticketCache window yokken sessiz no-op — test/SSR güvenli.)
  clearTicketCache(bookingId);
  return data as CancelResult;
}

/**
 * C5/C7 — İptal önizlemesi: SUNUCUNUN kendi hesabıyla (aynı `_booking_cancel_quote`
 * helper'ı; cancel_app_booking ile birebir) iade yüzdesi + net tutarı döndürür.
 * FE bu rakamı gösterir → tahmin gerçek iptalle asla ayrışmaz (PSP/eşik/timezone).
 */
export async function previewBookingCancel(bookingId: string): Promise<CancelPreview> {
  const { data, error } = await supabase.rpc('preview_booking_cancel', {
    p_booking_id: bookingId,
  });
  if (error) throw error;
  return data as CancelPreview;
}

/**
 * Rezervasyon henüz başlamadıysa iptal edilebilir (FAZ 7 kademeli iade: başlamadan
 * önce her an iptal; iade oranı saate göre — ≥24s %100, 6–24s %50, <6s yok).
 */
export function canCancel(booking: Pick<MyBooking, 'booking_date' | 'start_time' | 'status'>): boolean {
  if (booking.status === 'CANCELLED') return false;
  const start = new Date(`${booking.booking_date}T${booking.start_time}`);
  return start.getTime() - Date.now() > 0;
}
