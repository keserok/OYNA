import { supabase } from '../supabaseClient';
import type { Pitch } from '../types';
import {
  buildAvailabilitySlots,
  dbTimeToOwnerHour,
  LOCAL_BOOKINGS_EVENT,
  toISODate,
  addDays,
  type PitchBookingRow,
  type TimeSlotAvailability,
} from './availabilityService';
import * as FB from '../supabaseMutations';

const IS_LOCAL_DEV =
  import.meta.env.VITE_DEV_MODE === 'true' ||
  !import.meta.env.VITE_SUPABASE_URL;

export async function fetchPitchBookings(
  pitchId: string,
  dateStr?: string
): Promise<PitchBookingRow[]> {
  const today = toISODate(new Date());
  const from = dateStr ?? today;
  const to = dateStr ?? addDays(new Date(), 14).toISOString().slice(0, 10);

  const { data, error } = await supabase.rpc('get_pitch_availability', {
    p_pitch_id: pitchId,
    p_date_from: from,
    p_date_to: dateStr ? dateStr : to,
  });

  if (error) {
    // RPC yoksa veya anon erişim kapalıysa doğrudan tabloya düş
    return FB.fbGetPitchBookings(pitchId, dateStr);
  }

  return ((data ?? []) as {
    court_id: string | null;
    booking_date: string;
    start_time: string;
    end_time: string;
    status: string;
  }[]).map((row) => ({
    id: `${row.booking_date}-${row.start_time}-${row.court_id ?? 'all'}`,
    pitch_id: pitchId,
    court_id: row.court_id,
    booking_date: row.booking_date,
    start_time: String(row.start_time).slice(0, 5),
    end_time: String(row.end_time).slice(0, 5),
    status: row.status,
  }));
}

export async function fetchOwnerBookingsForDate(
  pitchIds: string[],
  dateStr: string
): Promise<PitchBookingRow[]> {
  if (!pitchIds.length) return [];
  const results = await Promise.all(
    pitchIds.map(id => FB.fbGetPitchBookings(id, dateStr))
  );
  return results.flat();
}

export function computeAvailability(
  pitch: Pitch,
  bookingDate: string,
  bookings: PitchBookingRow[],
  courtId?: string | null
): TimeSlotAvailability[] {
  return buildAvailabilitySlots(pitch, bookingDate, bookings, courtId);
}

export function subscribeToPitchBookings(
  pitchId: string,
  onChange: () => void
): () => void {
  if (IS_LOCAL_DEV) {
    const handler = () => onChange();
    window.addEventListener(LOCAL_BOOKINGS_EVENT, handler);
    return () => window.removeEventListener(LOCAL_BOOKINGS_EVENT, handler);
  }

  const channel = supabase
    .channel(`pitch-bookings-${pitchId}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'pitch_bookings',
        filter: `pitch_id=eq.${pitchId}`,
      },
      () => onChange()
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}

export type OccupancyCell = 'DAILY' | 'SUB' | null;

export interface HourlyOccupancyRow {
  time: string;
  occupancy: number;
  pitches: OccupancyCell[];
}

export function buildOccupancyGrid(
  pitches: { id: string }[],
  bookings: PitchBookingRow[],
  dateISO: string
): HourlyOccupancyRow[] {
  return Array.from({ length: 24 }, (_, hour) => {
    const time = `${String(hour).padStart(2, '0')}:00`;
    const hourKey = `${String(hour).padStart(2, '0')}.00`;
    const row: OccupancyCell[] = pitches.map(p => {
      const hit = bookings.find(
        b =>
          b.pitch_id === p.id &&
          b.booking_date === dateISO &&
          b.status !== 'CANCELLED' &&
          (dbTimeToOwnerHour(String(b.start_time)) === hourKey ||
            dbTimeToOwnerHour(String(b.start_time)).replace('.00', '') ===
              String(hour).padStart(2, '0'))
      );
      if (!hit) return null;
      const meta = (hit.metadata || {}) as Record<string, unknown>;
      if (meta.bookingType === 'SUB') return 'SUB';
      return 'DAILY';
    });
    const occupancy = row.filter(c => c !== null).length;
    return { time, occupancy, pitches: row };
  });
}

export function todayISO(): string {
  return toISODate(new Date());
}
