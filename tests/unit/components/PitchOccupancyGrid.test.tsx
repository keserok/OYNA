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

// Şerit sabit piksel ölçeğinde çizilir (PX_SAAT = 72 → dakika başına 1,2px).
// Ekrana sıkıştırma yok; hem "Aktif saatler" hem "Tüm saatler" yatay kaydırılır.
const PX_DAKIKA = 72 / 60;

const genislikPx = (el: HTMLElement): number => {
  const m = el.style.width.match(/([\d.]+)px/);
  return m ? Number(m[1]) : NaN;
};
const solPx = (el: HTMLElement): number => {
  const m = el.style.left.match(/([\d.]+)px/);
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
    const bar60 = genislikPx(dikdortgenler()[0]);
    unmount();

    ciz([tarife({ slot_minutes: 90 })]);
    const bar90 = genislikPx(dikdortgenler()[0]);

    expect(bar60).toBeCloseTo(60 * PX_DAKIKA, 5);
    expect(bar90).toBeCloseTo(90 * PX_DAKIKA, 5);
    expect(bar90).toBeGreaterThan(bar60);
    // Oran TAM 1,5 olmalı — kullanıcı şartı: simetri. Genişlikten sabit boşluk
    // düşülürse (eski -2px) bu oran bozulur, o yüzden ayrım kenarlıkla yapılıyor.
    expect(bar90 / bar60).toBeCloseTo(1.5, 10);
  });

  it('ayni gunde 60 ve 90 birlikte: her dikdortgen KENDI suresini cizer', () => {
    ciz([
      tarife({ id: 'sabah', start_time: '09:00', end_time: '12:00', slot_minutes: 60 }),
      tarife({ id: 'aksam', start_time: '18:00', end_time: '21:00', slot_minutes: 90 }),
    ]);
    const bars = dikdortgenler();
    const dk = bars.map((b) => Number(b.dataset.slotMinutes));
    expect(dk).toEqual([60, 60, 60, 90, 90]);
    // Ölçek pencereden bağımsız: 60 dk her zaman 72px, 90 dk her zaman 108px.
    const gen = bars.map(genislikPx);
    expect(gen[0]).toBeCloseTo(60 * PX_DAKIKA, 5);
    expect(gen[4]).toBeCloseTo(90 * PX_DAKIKA, 5);
  });

  it('dikdortgenler gercek saatlerine gore konumlanir (sol ofset)', () => {
    ciz([tarife({ start_time: '18:00', end_time: '23:00', slot_minutes: 90 })]);
    const bars = dikdortgenler();
    // Pencere 18:00'de basliyor. Ikinci dilim 19:30 → baslangictan 90 dk sonra.
    expect(solPx(bars[1])).toBeCloseTo(90 * PX_DAKIKA, 5);
    expect(bars[1].getAttribute('aria-label')).toContain('19:30-21:00');
  });

  it('dikdortgen SAAT ETIKETIYLE ayni noktadan baslar ve tam ortasinda biter', () => {
    // Kullanici sarti: "13 yaziyorsa dikdortgen tam 13'ten baslayip (90 dakikaysa)
    // 14 ile 15'in tam ortasinda durmali." Etiketler ve dilimler AYNI dogrusal
    // olcekten gectigi icin bu matematiksel olarak garanti; burada kilitleniyor.
    ciz([tarife({ start_time: '13:00', end_time: '19:00', slot_minutes: 90 })]);
    const bars = dikdortgenler();
    const saatEtiketi = (saat: number): number => {
      const el = Array.from(document.querySelectorAll<HTMLElement>('span'))
        .find((s) => s.textContent === String(saat) && s.style.left.endsWith('px'));
      return el ? Number(el.style.left.replace('px', '')) : NaN;
    };

    // Ilk dilim 13:00'te baslar → "13" etiketiyle AYNI noktada.
    expect(solPx(bars[0])).toBeCloseTo(saatEtiketi(13), 5);
    // 13:00 + 90 dk = 14:30 → "14" ile "15" etiketlerinin TAM ORTASI.
    const bitis = solPx(bars[0]) + genislikPx(bars[0]);
    expect(bitis).toBeCloseTo((saatEtiketi(14) + saatEtiketi(15)) / 2, 5);
    expect(bars[0].getAttribute('aria-label')).toContain('13:00-14:30');
  });

  it('saat etiketleri ATLANMAZ — her tam saat yazilir', () => {
    // Eskiden 12 saatten uzun goruntude 2'de bir etiket basiliyordu ve serit
    // "ikiser ikiser" gorunuyordu. Sabit olcekte yer bol, hepsi yazilir.
    ciz([tarife({ start_time: '08:00', end_time: '23:00', slot_minutes: 60 })]);
    const etiketler = Array.from(document.querySelectorAll<HTMLElement>('span'))
      .filter((s) => s.style.left.endsWith('px') && /^\d+$/.test(s.textContent || ''))
      .map((s) => Number(s.textContent));
    // 08..23 → 16 etiket, ardisik, atlama yok.
    expect(etiketler).toEqual([8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23]);
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
