import { supabase } from '../supabaseClient';

// ─── Müşteri (müdavim) defteri — veri katmanı ───────────────────────────────
// Tasarım: docs/master/MUSTERI_DEFTERI_TASARIMI.md (8 kurucu kararı, 9 Ağu 2026)
// Satır erişimini RLS belirler: tesisin sahibi/müdürü/personeli okur-yazar,
// başkası hiçbir satırı göremez. Oyuncu uygulaması bu servise hiç dokunmaz.

export interface PitchCustomer {
  id: string;
  name: string;
  phone: string | null;
  phone_missing: boolean;
  last_seen_on: string | null;
}

export interface CustomerCardBooking {
  booking_date: string;
  start_time: string;
  end_time: string;
  court_id: string | null;
  court: string | null;
  price: number;
  status: string;
  no_show: boolean;
}

export interface CustomerCard {
  id: string;
  name: string;
  phone: string | null;
  phone_missing: boolean;
  note: string | null;
  toplam: number;
  iptal: number;
  gelmedi: number;
  son_gelis: string | null;
  veresiye: number;
  son_rezervasyonlar: CustomerCardBooking[];
}

const num = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

const mapUniqueError = (msg: string): string =>
  msg.includes('ux_pitch_customers_phone') || msg.includes('duplicate key') || msg.includes('23505')
    ? 'Bu telefonla kayıtlı bir müşteri zaten var.'
    : 'İşlem tamamlanamadı. Lütfen tekrar dene.';

/** Öneri araması — ada ya da telefona göre, en son görülen önce (en fazla 8). */
export async function searchPitchCustomers(pitchId: string, q: string): Promise<PitchCustomer[]> {
  const { data, error } = await supabase.rpc('search_pitch_customers', { p_pitch_id: pitchId, p_q: q });
  if (error) throw error;
  return (data ?? []) as PitchCustomer[];
}

/** Defter listesi — aramalı; RLS tesis dışına hiçbir satır sızdırmaz. */
export async function listPitchCustomers(pitchId: string, q?: string): Promise<PitchCustomer[]> {
  let query = supabase
    .from('pitch_customers')
    .select('id, name, phone, phone_norm, last_seen_on')
    .eq('pitch_id', pitchId)
    .order('last_seen_on', { ascending: false, nullsFirst: false })
    .order('name', { ascending: true })
    .limit(200);
  const s = (q ?? '').trim();
  if (s.length >= 2) query = query.or(`name.ilike.%${s}%,phone.ilike.%${s}%`);
  const { data, error } = await query;
  if (error) throw new Error('Müşteri listesi yüklenemedi.');
  return (data ?? []).map((r: any) => ({
    id: String(r.id),
    name: String(r.name),
    phone: r.phone ?? null,
    phone_missing: !r.phone_norm,
    last_seen_on: r.last_seen_on ?? null,
  }));
}

/** Elle müşteri ekleme (karar 1). */
export async function createPitchCustomer(pitchId: string, name: string, phone?: string): Promise<void> {
  const { error } = await supabase
    .from('pitch_customers')
    .insert({ pitch_id: pitchId, name: name.trim(), phone: phone?.trim() || null });
  if (error) throw new Error(mapUniqueError(error.message));
}

/** Telefonu eksik kayda telefon ekleme (karar 8 — kimlik tamamlanır). */
export async function setCustomerPhone(customerId: string, phone: string): Promise<void> {
  const { error } = await supabase
    .from('pitch_customers')
    .update({ phone: phone.trim(), updated_at: new Date().toISOString() })
    .eq('id', customerId);
  if (error) throw new Error(mapUniqueError(error.message));
}

/** Müşteri kartı — istatistik + son rezervasyonlar + veresiye tek çağrıda. */
export async function getCustomerCard(customerId: string): Promise<CustomerCard> {
  const { data, error } = await supabase.rpc('musteri_karti', { p_customer_id: customerId });
  if (error) throw new Error('Müşteri kartı yüklenemedi.');
  const d = (data ?? {}) as any;
  return {
    id: String(d.id ?? customerId),
    name: String(d.name ?? ''),
    phone: d.phone ?? null,
    phone_missing: !!d.phone_missing,
    note: d.note ?? null,
    toplam: num(d.toplam),
    iptal: num(d.iptal),
    gelmedi: num(d.gelmedi),
    son_gelis: d.son_gelis ?? null,
    veresiye: num(d.veresiye),
    son_rezervasyonlar: Array.isArray(d.son_rezervasyonlar)
      ? d.son_rezervasyonlar.map((b: any) => ({
          booking_date: String(b.booking_date ?? ''),
          start_time: String(b.start_time ?? ''),
          end_time: String(b.end_time ?? ''),
          court_id: b.court_id ?? null,
          court: b.court ?? null,
          price: num(b.price),
          status: String(b.status ?? ''),
          no_show: !!b.no_show,
        }))
      : [],
  };
}

/** "Gelmedi" işareti — panelin Gelmedi düğmesi veresiye kaydının yanında bunu da basar. */
export async function markBookingNoShow(bookingId: string): Promise<void> {
  const { error } = await supabase.rpc('booking_gelmedi_isaretle', { p_booking_id: bookingId });
  if (error) throw error;
}

/** "Geçen haftanın aynısı" (karar 7): son rezervasyonun haftanın gününü koruyarak
 *  bugünden SONRAKİ ilk aynı günü verir. Bugün o günse bir sonraki haftaya atar. */
export function nextSameWeekdayISO(lastDateISO: string, todayISOArg?: string): string {
  const base = new Date(`${lastDateISO}T00:00:00`);
  if (Number.isNaN(base.getTime())) return lastDateISO;
  const today = todayISOArg ? new Date(`${todayISOArg}T00:00:00`) : new Date();
  today.setHours(0, 0, 0, 0);
  const diff = ((base.getDay() - today.getDay() + 7) % 7) || 7;
  const d = new Date(today);
  d.setDate(today.getDate() + diff);
  const pad = (x: number) => String(x).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
