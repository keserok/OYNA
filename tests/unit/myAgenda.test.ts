import { describe, it, expect } from 'vitest';
import { buildAgenda } from '../../hooks/useMyAgenda';
import type { MatchListing } from '../../types';
import type { MyBooking } from '../../services/playerBookingService';

// Sabit "şimdi": 2026-07-18 Cumartesi 20:00 yerel saat.
const NOW = new Date('2026-07-18T20:00:00');

const m = (over: Partial<MatchListing>): MatchListing => ({
  id: 'm1',
  title: 'Test Maçı',
  location: 'Ordu',
  time: '21:00',
  date: '2026-07-19',
  price: 200,
  difficulty: 'Rahat',
  minRating: 0,
  image: '',
  badges: [],
  missingPositions: [],
  slots: [],
  status: 'ACTIVE',
  ...over,
} as MatchListing);

const b = (over: Partial<MyBooking>): MyBooking => ({
  id: 'b1',
  pitch_id: 'p1',
  court_id: null,
  booking_date: '2026-07-19',
  start_time: '21:00:00',
  end_time: '22:00:00',
  status: 'CONFIRMED',
  source: 'APP',
  price: 900,
  deposit_amount: 200,
  paid_amount: 0,
  payment_status: 'UNPAID',
  cancellation_reason: null,
  created_at: '2026-07-01T00:00:00Z',
  pitches: { name: 'Saha', district: 'Altınordu', image: null },
  courts: null,
  ...over,
} as MyBooking);

describe('buildAgenda — birleşik kronolojik sıralama', () => {
  it('maç + rezervasyon karışık, en yakın en üstte (artan)', () => {
    const { upcoming } = buildAgenda(
      [m({ id: 'm-late', date: '2026-07-20', time: '21:00' })],
      [b({ id: 'b-soon', booking_date: '2026-07-19', start_time: '10:00:00', end_time: '11:00:00' })],
      NOW
    );
    expect(upcoming.map(i => i.id)).toEqual(['booking-b-soon', 'match-m-late']);
  });

  it('tarihi çözülemeyen öğe listenin sonuna gider', () => {
    // Not: SSOT ayrıştırıcı (İP-14 parseMatchDateTime) 'Cumartesi' gibi TR gün
    // adlarını GERÇEKTEN çözer — o artık "çözülemez" örneği değil. Gerçekten
    // çözülemez girdi kullanılır.
    const { upcoming } = buildAgenda(
      [m({ id: 'm-nodate', date: 'tarih yok', time: 'saat yok' }), m({ id: 'm-ok', date: '2026-07-19', time: '09:00' })],
      [],
      NOW
    );
    expect(upcoming[upcoming.length - 1].id).toBe('match-m-nodate');
    expect(upcoming[0].id).toBe('match-m-ok');
  });
});

describe('buildAgenda — geçmiş/yaklaşan bölümleme', () => {
  it('CANCELLED ve COMPLETED maçlar geçmişe düşer', () => {
    const { upcoming, past } = buildAgenda(
      [
        m({ id: 'm-cancel', status: 'CANCELLED', date: '2026-07-25' }),
        m({ id: 'm-done', status: 'COMPLETED', date: '2026-07-25' }),
        m({ id: 'm-live', status: 'ACTIVE', date: '2026-07-25' }),
      ],
      [],
      NOW
    );
    expect(upcoming.map(i => i.id)).toEqual(['match-m-live']);
    expect(past.map(i => i.id).sort()).toEqual(['match-m-cancel', 'match-m-done']);
  });

  it('maç başladıktan sonra 2 saat yaklaşanda kalır (tolerans), sonrasında geçmiş', () => {
    const inGrace = m({ id: 'm-grace', date: '2026-07-18', time: '19:00' });   // 1 saat önce başladı
    const beyond = m({ id: 'm-old', date: '2026-07-18', time: '17:00' });      // 3 saat önce başladı
    const { upcoming, past } = buildAgenda([inGrace, beyond], [], NOW);
    expect(upcoming.map(i => i.id)).toEqual(['match-m-grace']);
    expect(past.map(i => i.id)).toEqual(['match-m-old']);
  });

  it('rezervasyon end_time geçince geçmişe düşer; iptal edilen daima geçmiş', () => {
    const ended = b({ id: 'b-ended', booking_date: '2026-07-18', start_time: '17:00:00', end_time: '18:00:00' });
    const active = b({ id: 'b-next', booking_date: '2026-07-18', start_time: '21:00:00', end_time: '22:00:00' });
    const cancelled = b({ id: 'b-cancel', status: 'CANCELLED', booking_date: '2026-07-30' });
    const { upcoming, past } = buildAgenda([], [ended, active, cancelled], NOW);
    expect(upcoming.map(i => i.id)).toEqual(['booking-b-next']);
    expect(past.map(i => i.id).sort()).toEqual(['booking-b-cancel', 'booking-b-ended']);
  });

  it('gece yarısını aşan rezervasyon (23:00–01:00) erken geçmişe düşmez', () => {
    const overnight = b({ id: 'b-night', booking_date: '2026-07-17', start_time: '23:00:00', end_time: '01:00:00' });
    // Şimdi: 2026-07-18 00:30 — rezervasyon hâlâ sürüyor.
    const during = new Date('2026-07-18T00:30:00');
    const afterEnd = new Date('2026-07-18T01:30:00');
    expect(buildAgenda([], [overnight], during).upcoming.map(i => i.id)).toEqual(['booking-b-night']);
    expect(buildAgenda([], [overnight], afterEnd).past.map(i => i.id)).toEqual(['booking-b-night']);
  });

  it('geçmiş en yeni en üstte (azalan) sıralanır', () => {
    const { past } = buildAgenda(
      [m({ id: 'm-older', status: 'COMPLETED', date: '2026-07-10', time: '20:00' })],
      [b({ id: 'b-newer', status: 'CANCELLED', booking_date: '2026-07-15', start_time: '20:00:00' })],
      NOW
    );
    expect(past.map(i => i.id)).toEqual(['booking-b-newer', 'match-m-older']);
  });

  it('boş girdiler patlatmaz', () => {
    const r = buildAgenda([], [], NOW);
    expect(r.upcoming).toEqual([]);
    expect(r.past).toEqual([]);
  });
});
