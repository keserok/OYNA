import { useCallback, useEffect, useMemo, useState } from 'react';
import type { MatchListing } from '../types';
import { fetchMyBookings, type MyBooking } from '../services/playerBookingService';
import { useMyMatches, parseMatchDate } from './useMyMatches';

// Maçlarım hub'ının birleşik veri modeli: slot alınmış maçlar (matches tablosu,
// store realtime'ı üzerinden canlı) + saha rezervasyonları (pitch_bookings,
// RLS kullanıcı-kapsamlı) tek kronolojik ajandada birleşir.

export type MyAgendaItem =
  | { kind: 'MATCH'; id: string; when: Date | null; match: MatchListing }
  | { kind: 'BOOKING'; id: string; when: Date | null; booking: MyBooking };

const bookingStart = (b: MyBooking): Date | null => {
  try {
    const d = new Date(`${b.booking_date}T${b.start_time}`);
    return isNaN(d.getTime()) ? null : d;
  } catch {
    return null;
  }
};

const bookingEnd = (b: MyBooking): Date | null => {
  const start = bookingStart(b);
  try {
    const d = new Date(`${b.booking_date}T${b.end_time}`);
    if (isNaN(d.getTime())) return start;
    // Gece yarısını aşan rezervasyon (23:00–01:00): bitiş ertesi güne taşar,
    // öğe erken "geçmiş"e düşmez.
    if (start && d.getTime() < start.getTime()) d.setDate(d.getDate() + 1);
    return d;
  } catch {
    return start;
  }
};

// Maç başladıktan sonra bu süre boyunca "yaklaşan"da kalır (devam eden maç görünür olsun).
const MATCH_GRACE_MS = 2 * 60 * 60 * 1000;

export interface AgendaBuckets {
  upcoming: MyAgendaItem[];
  past: MyAgendaItem[];
}

// Saf ve test edilebilir: sıralama + geçmiş/yaklaşan bölümleme kuralları burada.
export function buildAgenda(matches: MatchListing[], bookings: MyBooking[], now: Date): AgendaBuckets {
  const tagged: { item: MyAgendaItem; isPast: boolean }[] = [];

  for (const m of matches ?? []) {
    // parseMatchDate bozuk girdide Invalid Date dönebilir → null'a normalize et
    // (NaN, sıralamayı ve geçmiş/yaklaşan kararını bozar).
    const parsed = parseMatchDate(m.date, m.time);
    const when = parsed && !isNaN(parsed.getTime()) ? parsed : null;
    const isPast =
      m.status === 'CANCELLED' ||
      m.status === 'COMPLETED' ||
      (!!when && when.getTime() + MATCH_GRACE_MS < now.getTime());
    tagged.push({ item: { kind: 'MATCH', id: `match-${m.id}`, when, match: m }, isPast });
  }

  for (const b of bookings ?? []) {
    const when = bookingStart(b);
    const end = bookingEnd(b);
    const isPast = b.status === 'CANCELLED' || (!!end && end.getTime() < now.getTime());
    tagged.push({ item: { kind: 'BOOKING', id: `booking-${b.id}`, when, booking: b }, isPast });
  }

  // Yaklaşanlar: en yakın en üstte, tarihi çözülemeyenler en sona.
  const upcoming = tagged
    .filter(t => !t.isPast)
    .map(t => t.item)
    .sort((a, b) => (a.when?.getTime() ?? Infinity) - (b.when?.getTime() ?? Infinity));

  // Geçmiş: en yeni en üstte.
  const past = tagged
    .filter(t => t.isPast)
    .map(t => t.item)
    .sort((a, b) => (b.when?.getTime() ?? -Infinity) - (a.when?.getTime() ?? -Infinity));

  return { upcoming, past };
}

export interface MyAgendaResult {
  items: MyAgendaItem[]; // yaklaşanlar, kronolojik
  past: MyAgendaItem[];
  counts: { matches: number; bookings: number };
  nextItem: MyAgendaItem | null;
  bookingsLoading: boolean;
  bookingsError: boolean;
  refetchBookings: () => Promise<void>;
  currentUserUid: string;
}

export function useMyAgenda(): MyAgendaResult {
  const { all: myMatches, currentUserUid } = useMyMatches();
  const [bookings, setBookings] = useState<MyBooking[]>([]);
  const [bookingsLoading, setBookingsLoading] = useState<boolean>(!!currentUserUid);
  const [bookingsError, setBookingsError] = useState(false);

  const refetchBookings = useCallback(async () => {
    // Misafir/oturumsuz: RLS'e boşuna istek atma, sessizce boş liste.
    if (!currentUserUid) {
      setBookings([]);
      setBookingsLoading(false);
      setBookingsError(false);
      return;
    }
    setBookingsLoading(true);
    setBookingsError(false);
    try {
      setBookings(await fetchMyBookings());
    } catch (err) {
      console.error('Rezervasyonlar yüklenemedi:', err);
      setBookingsError(true);
    } finally {
      setBookingsLoading(false);
    }
  }, [currentUserUid]);

  useEffect(() => { void refetchBookings(); }, [refetchBookings]);

  const { upcoming, past } = useMemo(
    () => buildAgenda(myMatches, bookings, new Date()),
    [myMatches, bookings]
  );

  const counts = useMemo(() => ({
    matches: upcoming.filter(i => i.kind === 'MATCH').length,
    bookings: upcoming.filter(i => i.kind === 'BOOKING').length,
  }), [upcoming]);

  const nextItem = useMemo(() => {
    const now = Date.now();
    return upcoming.find(i => i.when && i.when.getTime() > now) ?? upcoming[0] ?? null;
  }, [upcoming]);

  return { items: upcoming, past, counts, nextItem, bookingsLoading, bookingsError, refetchBookings, currentUserUid };
}
