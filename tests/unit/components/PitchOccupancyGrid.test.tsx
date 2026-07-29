import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { PitchOccupancyGrid } from '../../../views/owner/home/OwnerHomeWidgets';
import { buildDayOccupancyGrid } from '../../../services/pitchOwnerService';
import type { SlotTariffInput } from '../../../shared/slotGrid';
import type { PitchBookingFull } from '../../../types';

// ─── SLOT-3 — Doluluk şeridindeki dikdörtgenler süreyle ORANTILI çizilir ─────
//
// Kullanıcının isteği: "sahaların dakika politikaları değiştirildiğinde
// dikdörtgen slotların boyutları da buna uygun olarak değişmeli."
// Zaman ekseni yatay olduğu için dikdörtgenin "boyu" = GENİŞLİĞİdir.

const CARSAMBA = '2026-07-29'; // ISO gün 3
const KORTLAR = [{ id: 'c1', name: 'A Sahası' }];

const tarife = (over: Partial<SlotTariffInput> = {}): SlotTariffInput => ({
  id: 't1',
  tariff_type: 'WEEKDAY',
  applies_to_days: [1, 2, 3, 4, 5],
  start_time: '18:00',
  end_time: '00:00',
  slot_price: 1000,
  slot_minutes: 60,
  is_active: true,
  court_id: null,
  valid_on: null,
  ...over,
});

const ciz = (tariffs: SlotTariffInput[], bookings: PitchBookingFull[] = []) =>
  render(
    <PitchOccupancyGrid grid={buildDayOccupancyGrid(bookings, KORTLAR, tariffs, CARSAMBA)} />,
  );

/** Slot dikdörtgenlerini (buton) DOM sırasıyla döndürür. */
const dikdortgenler = () =>
  Array.from(document.querySelectorAll<HTMLElement>('button[data-slot-minutes]'));

const genislikYuzdesi = (el: HTMLElement): number => {
  // style="width: calc(X% - 2px)"
  const m = el.style.width.match(/([\d.]+)%/);
  return m ? Number(m[1]) : NaN;
};

describe('PitchOccupancyGrid — dikdörtgen boyu süreyle orantılı', () => {
  it('90 dakikalik tarifede her dikdortgen 90 dakika tasir', () => {
    ciz([tarife({ slot_minutes: 90 })]);
    const bars = dikdortgenler();
    expect(bars).toHaveLength(4); // 18:00-00:00 → 4 × 90 dk (kalan 30 dk slot degil)
    expect(bars.every((b) => b.dataset.slotMinutes === '90')).toBe(true);
  });

  it('90 dakikalik dikdortgen 60 dakikaliktan GORUNUR bicimde uzundur', () => {
    // Ayni pencere (18:00-00:00) iki farkli sure ile cizilir; oran 1,5 olmali.
    const { unmount } = ciz([tarife({ slot_minutes: 60 })]);
    const bar60 = genislikYuzdesi(dikdortgenler()[0]);
    unmount();

    ciz([tarife({ slot_minutes: 90 })]);
    const bar90 = genislikYuzdesi(dikdortgenler()[0]);

    expect(bar90).toBeGreaterThan(bar60);
    expect(bar90 / bar60).toBeCloseTo(1.5, 5);
  });

  it('ayni gunde 60 ve 90 birlikte: her dikdortgen KENDI suresini cizer', () => {
    ciz([
      tarife({ id: 'sabah', start_time: '09:00', end_time: '12:00', slot_minutes: 60 }),
      tarife({ id: 'aksam', start_time: '18:00', end_time: '21:00', slot_minutes: 90 }),
    ]);
    const bars = dikdortgenler();
    const dk = bars.map((b) => Number(b.dataset.slotMinutes));
    expect(dk).toEqual([60, 60, 60, 90, 90]);
    // Pencere 09:00-21:00 = 720 dk → 60 dk %8.33, 90 dk %12.5.
    const gen = bars.map(genislikYuzdesi);
    expect(gen[0]).toBeCloseTo((60 / 720) * 100, 5);
    expect(gen[4]).toBeCloseTo((90 / 720) * 100, 5);
  });

  it('dikdortgenler gercek saatlerine gore konumlanir (sol ofset)', () => {
    ciz([tarife({ start_time: '18:00', end_time: '23:00', slot_minutes: 90 })]);
    const bars = dikdortgenler();
    // Pencere 18:00-22:30 = 270 dk. Ikinci dilim 19:30 → 90/270 = %33.33.
    expect(Number(bars[1].style.left.replace('%', ''))).toBeCloseTo((90 / 270) * 100, 5);
    expect(bars[1].getAttribute('aria-label')).toContain('19:30-21:00');
  });

  it('erisilebilirlik etiketi sureyi ve dolulugu soyler', () => {
    ciz([tarife({ slot_minutes: 90 })]);
    const ilk = dikdortgenler()[0];
    expect(ilk.getAttribute('aria-label')).toBe('A Sahası · 18:00-19:30 · 90 dakika · BOŞ');
  });

  it('slota dokununca ust seritte GERCEK sure gorunur', () => {
    ciz([tarife({ slot_minutes: 90 })]);
    fireEvent.click(dikdortgenler()[0]);
    expect(screen.getByText('90 dakika')).toBeInTheDocument();
  });

  it('kort yoksa dogru bos hal cizilir (cokme yok)', () => {
    render(<PitchOccupancyGrid grid={buildDayOccupancyGrid([], [], [tarife()], CARSAMBA)} />);
    expect(screen.getByText('Henüz saha eklenmedi')).toBeInTheDocument();
  });

  it('tarife yoksa sahibe ne yapmasi gerektigi soylenir', () => {
    render(<PitchOccupancyGrid grid={buildDayOccupancyGrid([], KORTLAR, [], CARSAMBA)} />);
    expect(screen.getByText(/Bugün için tanımlı slot yok/)).toBeInTheDocument();
  });
});
