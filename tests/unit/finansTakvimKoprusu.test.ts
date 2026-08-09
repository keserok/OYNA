// ════════════════════════════════════════════════════════════════════════════
// FİNANS → TAKVİM KÖPRÜSÜ + GEÇMİŞ GÜNLER TAKVİMDE
// ════════════════════════════════════════════════════════════════════════════
//
// Kurucu isteği (9 Ağu 2026): finanstaki tahsilat/ödeme satırından ilgili güne
// atlanabilsin VE geçmiş rezervasyonlar takvimden okunabilsin (veritabanından
// yüklenerek). İki parça birbirine bağlı: köprü geçmiş bir güne atlayabildiği
// için gün şeridi de geçmişi göstermek zorunda.
//
// Bu test üç şeyi korur:
//   1. buildDayStrip: 30 gün geçmiş + bugün + 30 gün gelecek (tek kaynak)
//   2. Takvim: köprü hedefini işleyip rezervasyon detayını açan mekanizma
//   3. Finans satırları: bekleyen tahsilat → rezervasyona, ödeme → güne atlar

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildDayStrip, localDateISO } from '../../views/owner/ownerCalendarHelpers';

const oku = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');

describe('buildDayStrip — geçmiş + bugün + gelecek', () => {
  const base = new Date(2026, 7, 12); // 12 Ağustos 2026

  it('varsayılan şerit 61 gün: 30 geçmiş + bugün + 30 gelecek', () => {
    const strip = buildDayStrip(base);
    expect(strip).toHaveLength(61);
    expect(localDateISO(strip[30])).toBe('2026-08-12'); // ortada bugün
    expect(localDateISO(strip[0])).toBe('2026-07-13');  // 30 gün geriye
    expect(localDateISO(strip[60])).toBe('2026-09-11'); // 30 gün ileriye
  });

  it('günler kesintisiz artar — atlanan/yinelenen gün yok', () => {
    const strip = buildDayStrip(base, 5, 5);
    for (let i = 1; i < strip.length; i++) {
      const onceki = new Date(strip[i - 1]);
      onceki.setDate(onceki.getDate() + 1);
      expect(localDateISO(strip[i])).toBe(localDateISO(onceki));
    }
  });

  it('geçmiş/gelecek uzunlukları ayarlanabilir', () => {
    expect(buildDayStrip(base, 5, 2)).toHaveLength(8);
    expect(localDateISO(buildDayStrip(base, 5, 2)[0])).toBe('2026-08-07');
  });

  it('saat bileşeni sıfırlanır — gün karşılaştırmaları güvenli', () => {
    const strip = buildDayStrip(new Date(2026, 7, 12, 23, 45));
    expect(strip[30].getHours()).toBe(0);
    expect(localDateISO(strip[30])).toBe('2026-08-12');
  });
});

describe('takvim — köprü hedefi ve geçmiş günler', () => {
  const takvim = oku('views/owner/calendar/FinancialCalendarView.tsx');

  it('gün şeridi TEK kaynaktan geliyor — yerel kopya kalmadı', () => {
    expect(takvim).toContain('buildDayStrip');
    expect(takvim).not.toContain('function buildDayStrip');
  });

  it('köprü hedefi: gün seçilir, rezervasyon yüklendikten SONRA açılır', () => {
    expect(takvim).toContain('onFocusConsumed');
    expect(takvim).toContain('pendingOpenRef');
    // Yanlış günün listesinde arama yapılmaması için tarih de bekletilir.
    expect(takvim).toContain("selectedDateISO !== pending.dateISO");
  });

  it('geçmiş gün çipleri soluk çizilir — bugünle karışmaz', () => {
    expect(takvim).toContain('isPast');
  });
});

describe('finans satırları — köprünün giriş uçları', () => {
  const tahsilat = oku('views/owner/finance/FinanceCollectTab.tsx');
  const panel = oku('views/OwnerPanel.tsx');

  it('bekleyen tahsilat satırında "Takvimde aç" düğmesi rezervasyona atlar', () => {
    expect(tahsilat).toContain('Takvimde aç');
    expect(tahsilat).toContain('bookingId: b.id');
  });

  it('son ödeme satırı ödemenin gününe atlar', () => {
    expect(tahsilat).toContain('dateISO: p.booking_date');
  });

  it('panel köprüyü iki uçtan bağlıyor: finans → state → takvim', () => {
    expect(panel).toContain('calendarFocus');
    expect(panel).toContain('focus={calendarFocus}');
    expect(panel).toContain('onOpenCalendarAt');
  });
});
