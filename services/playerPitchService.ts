import { supabase } from '../supabaseClient';
import type { Pitch, Court } from '../types';

// ============================================================================
// OYUNCU TARAFI SAHA & DOLULUK GÖRÜNTÜLEME (Faz 2 — read-only)
// ----------------------------------------------------------------------------
// Faz 1'in TEK KAYNAĞINI okur: pitches (aktif tesisler) + courts (aktif sahalar)
// + court_availability view (dolu saatler, müşteri/ödeme GÖRÜNMEZ) + get_court_occupancy.
// Oyuncu yalnızca görüntüler; bu fazda rezervasyon yazmaz.
// ============================================================================

const gradeToScore = (g?: string | null): number | undefined => {
  if (g === 'A') return 92;
  if (g === 'B') return 78;
  if (g === 'C') return 62;
  return undefined;
};

const todayStr = () => new Date().toISOString().slice(0, 10);

// Bir zaman aralığının kapsadığı saatleri (gece yarısı dahil) döndürür: 20:00-22:00 -> [20,21]
const hoursInRange = (start: string, end: string): number[] => {
  let s = parseInt(start); let e = parseInt(end);
  if (e <= s) e += 24;
  const out: number[] = [];
  for (let h = s; h < e; h++) out.push(h % 24);
  return out;
};

const windowHours = (wh: any): number => {
  let openH = parseInt(wh?.open ?? '10:00');
  let closeH = parseInt(wh?.close ?? '02:00');
  if (closeH <= openH) closeH += 24;
  return Math.max(closeH - openH, 1);
};

/**
 * Keşif ekranı için aktif tesisleri (oyuncu Pitch tipinde) getirir.
 * Her tesisin aktif sahaları + bugünkü doluluk yüzdesi (türetilmiş) ile birlikte.
 */
export async function getDiscoveryPitches(): Promise<Pitch[]> {
  // 1) Aktif tesisler
  const { data: pitchRows, error: pErr } = await supabase
    .from('pitches')
    .select('*')
    .eq('is_active', true);
  if (pErr) { console.error('getDiscoveryPitches/pitches:', pErr); return []; }
  const pitches = pitchRows ?? [];
  if (pitches.length === 0) return [];

  const pitchIds = pitches.map(p => p.id);

  // 2) Aktif sahalar
  const { data: courtRows, error: cErr } = await supabase
    .from('courts')
    .select('*')
    .eq('is_active', true)
    .in('pitch_id', pitchIds)
    .order('sort_order');
  if (cErr) { console.error('getDiscoveryPitches/courts:', cErr); }
  const courts = courtRows ?? [];
  const courtIds = courts.map(c => c.id);

  // 3) Bugünkü dolu aralıklar (doluluk türetmek için) — court_availability güvenli view
  let availability: any[] = [];
  if (courtIds.length > 0) {
    const { data: avRows } = await supabase
      .from('court_availability')
      .select('court_id, start_time, end_time')
      .eq('booking_date', todayStr())
      .in('court_id', courtIds);
    availability = avRows ?? [];
  }

  // court_id -> bugün dolu saat sayısı
  const busyByCourt = new Map<string, number>();
  for (const r of availability) {
    const hrs = hoursInRange(r.start_time, r.end_time).length;
    busyByCourt.set(r.court_id, (busyByCourt.get(r.court_id) || 0) + hrs);
  }

  return pitches.map(p => {
    const wh = p.working_hours ?? { open: '10:00', close: '02:00', slot_duration: 60 };
    const win = windowHours(wh);
    const myCourts = courts.filter(c => c.pitch_id === p.id);

    const mappedCourts: Court[] = myCourts.map(c => ({
      id: c.id,
      name: c.name,
      type: (c.court_type === 'OPEN' ? 'OPEN' : 'CLOSED'),
      price: Number(c.price ?? 0),
      slots: [],
      description: c.description ?? undefined,
      images: Array.isArray(c.images) ? c.images : [],
      features: [],
      lighting: gradeToScore(c.lighting_grade),
      grassQuality: gradeToScore(c.grass_grade),
      lockerRoomQuality: gradeToScore(c.locker_grade),
    }));

    // Tesis doluluğu = sahaların bugünkü doluluk ortalaması (türetilmiş)
    let occupancy = 0;
    if (myCourts.length > 0) {
      const perCourt = myCourts.map(c => Math.min(Math.round(((busyByCourt.get(c.id) || 0) / win) * 100), 100));
      occupancy = Math.round(perCourt.reduce((a, b) => a + b, 0) / perCourt.length);
    }

    const images = Array.isArray(p.images) ? p.images : [];
    const courtPrices = mappedCourts.map(c => c.price).filter(n => n > 0);
    const minCourtPrice = courtPrices.length ? Math.min(...courtPrices) : Number(p.total_price ?? 0);

    const pitch: Pitch = {
      id: p.id,
      name: p.name,
      district: p.district ?? '',
      location: p.address ?? '',
      distance: '',
      rating: Number(p.rating ?? 0),
      googleRating: Number(p.rating ?? 0),
      googleReviews: 0,
      pricePerPerson: Number(p.price_per_person ?? 0),
      totalPrice: minCourtPrice,
      image: p.image ?? images[0] ?? '',
      images,
      description: p.description ?? undefined,
      amenities: Array.isArray(p.amenities) ? p.amenities : [],
      lighting: 0,
      grassQuality: 0,
      lockerRoomQuality: 0,
      goalQuality: 0,
      occupancy,
      coordinates: { lat: Number(p.latitude ?? 0), lng: Number(p.longitude ?? 0) },
      slots: [],
      courts: mappedCourts,
      isApproved: true,
    };
    return pitch;
  });
}

/**
 * Bir sahanın belirli gündeki DOLU saatlerini döndürür (oyuncu görüntüleme için).
 * court_availability view'ından okur (yalnız müsaitlik; müşteri/ödeme görünmez).
 */
export async function getBookedHours(courtId: string, date: string): Promise<number[]> {
  const { data, error } = await supabase
    .from('court_availability')
    .select('start_time, end_time')
    .eq('court_id', courtId)
    .eq('booking_date', date);
  if (error) { console.error('getBookedHours:', error); return []; }
  const set = new Set<number>();
  for (const r of data ?? []) hoursInRange(r.start_time, r.end_time).forEach(h => set.add(h));
  return [...set];
}

/** Bir sahanın belirli gündeki doluluk yüzdesi (DB'de türetilir). */
export async function getCourtOccupancy(courtId: string, date: string): Promise<number> {
  const { data, error } = await supabase.rpc('get_court_occupancy', { p_court_id: courtId, p_date: date });
  if (error) { console.error('getCourtOccupancy:', error); return 0; }
  return Number(data ?? 0);
}
