import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import RahatJoinSheet from '../../../components/match/RahatJoinSheet';
import type { MatchListing, PositionSlot } from '../../../types';
import type { RahatMatchConfig } from '../../../services/rahatMatchService';

// ─── E3 · KATILIM SAYFASI — TASARIM SÖZLEŞMESİ ──────────────────────────────
//
// Sabitlenenler:
//   • canlı sayaç formülü: countForRow(i, side) = base + öndeki seçimler
//   • dolu taraf DOLU + tıklanamaz; seçim yapılmadan CTA pasif
//   • ödeme anında seçimler tarafın İLK AÇIK slotlarına çözülür
//   • yarış: açık yer azalınca fazla seçimler temizlenir + kırmızı şerit
//   • iade kademesi CANLI konfigden yazılır (sabit 24/6/50 DEĞİL)

const slot = (id: string, status: 'OPEN' | 'TAKEN' = 'OPEN'): PositionSlot =>
  ({ id, role: 'OYUNCU', status } as PositionSlot);

const mac = (over: Partial<MatchListing> = {}): MatchListing => ({
  id: 'm1', title: 'Rahat Maç', location: 'Tesis', time: '20:00', date: 'Bugün',
  price: 200, difficulty: 'Rahat', image: '', badges: [], missingPositions: [],
  slots: [slot('w0', 'TAKEN'), slot('w1'), slot('w2')],
  awaySlots: [slot('r0'), slot('r1'), slot('r2')],
  ...over,
} as MatchListing);

const CFG: RahatMatchConfig = {
  captureWindowHours: 8, refundFullHours: 48, refundHalfHours: 12, refundHalfPct: 30,
};

const ciz = (m = mac(), onProceed = vi.fn(), extra: Partial<React.ComponentProps<typeof RahatJoinSheet>> = {}) => {
  const utils = render(
    <RahatJoinSheet open match={m} summary="Tesis · Bugün 20:00" config={CFG} busy={false}
      onClose={vi.fn()} onProceed={onProceed} {...extra} />,
  );
  return { ...utils, onProceed };
};

describe('RahatJoinSheet — sayaç ve seçim', () => {
  it('acilista taraf sayaclari taban doluluktan gelir (1/3 ve 0/3)', () => {
    ciz();
    expect(screen.getByText('1/3')).toBeInTheDocument();  // Beyaz: 1 TAKEN
    expect(screen.getByText('0/3')).toBeInTheDocument();  // Kırmızı
  });

  it('adet 2 + ilk yer Beyaz secilince 2. satirin Beyaz sayaci +1 artar', () => {
    ciz();
    fireEvent.click(screen.getByLabelText('Artır'));
    // 1. satır Beyaz'ı seç
    fireEvent.click(screen.getAllByText('BEYAZ TAKIM')[0]);
    // 2. satırın Beyaz sayacı: base 1 + önceki 1 seçim = 2/3
    expect(screen.getByText('2/3')).toBeInTheDocument();
  });

  it('dolu taraf DOLU yazar ve secilemez', () => {
    // Beyaz tamamen dolu
    const m = mac({ slots: [slot('w0', 'TAKEN'), slot('w1', 'TAKEN'), slot('w2', 'TAKEN')] });
    const { onProceed } = ciz(m);
    expect(screen.getByText('DOLU')).toBeInTheDocument();
    // DOLU kutusu buton değil — tıklama seçim üretmez, CTA pasif kalır
    fireEvent.click(screen.getByText('DOLU'));
    fireEvent.click(screen.getByText(/ÖDEMEYE GEÇ/));
    expect(onProceed).not.toHaveBeenCalled();
  });

  it('secim tamamlanmadan CTA pasif; tamamlaninca ilk ACIK slot idleri cozulur', () => {
    const { onProceed } = ciz();
    fireEvent.click(screen.getByLabelText('Artır')); // qty 2
    fireEvent.click(screen.getByText(/ÖDEMEYE GEÇ/));
    expect(onProceed).not.toHaveBeenCalled();

    fireEvent.click(screen.getAllByText('BEYAZ TAKIM')[0]);
    fireEvent.click(screen.getAllByText('KIRMIZI TAKIM')[1]);
    fireEvent.click(screen.getByText(/ÖDEMEYE GEÇ/));
    // Beyaz'ın ilk AÇIK slotu w1 (w0 TAKEN), Kırmızı'nın r0; toplam 2×200
    expect(onProceed).toHaveBeenCalledWith(['w1', 'r0'], 400);
  });

  it('YARIS: acik yer dususe secim temizlenir ve kirmizi serit cikar', () => {
    const m = mac();
    const { rerender } = render(
      <RahatJoinSheet open match={m} summary="s" config={CFG} busy={false} onClose={vi.fn()} onProceed={vi.fn()} />,
    );
    fireEvent.click(screen.getAllByText('BEYAZ TAKIM')[0]);
    // Realtime: Beyaz'ın kalan 2 açık yeri de doldu
    const dolu = mac({ slots: [slot('w0', 'TAKEN'), slot('w1', 'TAKEN'), slot('w2', 'TAKEN')] });
    rerender(
      <RahatJoinSheet open match={dolu} summary="s" config={CFG} busy={false} onClose={vi.fn()} onProceed={vi.fn()} />,
    );
    expect(screen.getByText('Seçtiğin yer az önce doldu — takımını güncelle.')).toBeInTheDocument();
  });

  it('YARIS: adet dusur → taraf dolar → adet artir: bayat secim canlanmaz, temizlenir', () => {
    const m = mac();
    const { rerender } = render(
      <RahatJoinSheet open match={m} summary="s" config={CFG} busy={false} onClose={vi.fn()} onProceed={vi.fn()} />,
    );
    // qty 2, 2. satırda KIRMIZI seç
    fireEvent.click(screen.getByLabelText('Artır'));
    fireEvent.click(screen.getAllByText('KIRMIZI TAKIM')[1]);
    // qty 1'e düşür — gizlenen seçim korunur (o an doğru)
    fireEvent.click(screen.getByLabelText('Azalt'));
    // Realtime: Kırmızı tamamen doldu
    const dolu = mac({ awaySlots: [slot('r0', 'TAKEN'), slot('r1', 'TAKEN'), slot('r2', 'TAKEN')] });
    rerender(
      <RahatJoinSheet open match={dolu} summary="s" config={CFG} busy={false} onClose={vi.fn()} onProceed={vi.fn()} />,
    );
    // qty tekrar 2 — bayat KIRMIZI seçimi "seçili" diye CANLANAMAZ:
    // temizlenir, şerit çıkar ve satır DOLU olarak çizilir
    fireEvent.click(screen.getByLabelText('Artır'));
    expect(screen.getByText('Seçtiğin yer az önce doldu — takımını güncelle.')).toBeInTheDocument();
    expect(screen.getAllByText('DOLU').length).toBeGreaterThan(0);
  });

  it('ucretsiz macta CTA "YERI AL" olur ve iade notu cizilmez', () => {
    ciz(mac({ price: 0 }));
    expect(screen.getByText(/YERİ AL · ÜCRETSİZ/)).toBeInTheDocument();
    expect(screen.queryByText(/iade kademeye tabidir/)).not.toBeInTheDocument();
  });

  it('iade notu CANLI konfig degerlerini yazar (sabit 24/6/50 DEGIL)', () => {
    ciz();
    const not = screen.getByText(/iade kademeye tabidir/);
    expect(not.textContent).toContain('48');
    expect(not.textContent).toContain('12–48');
    expect(not.textContent).toContain('%30');
    expect(not.textContent).not.toContain('24 saat');
  });

  it('ust sinir min(4, acik yer): 5 acik yerde 4, 2 acik yerde 2', () => {
    ciz(); // 5 açık yer (2W + 3R)
    expect(screen.getByText(/Üst sınır: 4 yer/)).toBeInTheDocument();
    ciz(mac({
      slots: [slot('w0', 'TAKEN'), slot('w1', 'TAKEN'), slot('w2')],
      awaySlots: [slot('r0'), slot('r1', 'TAKEN'), slot('r2', 'TAKEN')],
    }));
    expect(screen.getByText(/Üst sınır: 2 yer/)).toBeInTheDocument();
  });
});
