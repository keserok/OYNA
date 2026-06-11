import { useCallback, useEffect, useState } from 'react';
import type { Pitch } from '../types';
import type { PitchBookingRow, TimeSlotAvailability } from '../services/availabilityService';
import {
  computeAvailability,
  fetchPitchBookings,
  subscribeToPitchBookings,
} from '../services/pitchBookingService';

export function usePitchAvailability(
  pitch: Pitch | null,
  bookingDateISO: string,
  courtId: string | null | undefined,
  enabled = true
) {
  const [bookings, setBookings] = useState<PitchBookingRow[]>([]);
  const [slots, setSlots] = useState<TimeSlotAvailability[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!pitch?.id || !enabled) return;
    setLoading(true);
    setError(null);
    try {
      const rows = await fetchPitchBookings(pitch.id, bookingDateISO);
      setBookings(rows);
      setSlots(computeAvailability(pitch, bookingDateISO, rows, courtId));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Yüklenemedi');
      setBookings([]);
      setSlots(computeAvailability(pitch, bookingDateISO, [], courtId));
    } finally {
      setLoading(false);
    }
  }, [pitch, bookingDateISO, courtId, enabled]);

  useEffect(() => {
    reload();
  }, [reload]);

  useEffect(() => {
    if (!pitch?.id || !enabled) return;
    return subscribeToPitchBookings(pitch.id, reload);
  }, [pitch?.id, enabled, reload]);

  return { slots, bookings, loading, error, reload };
}
