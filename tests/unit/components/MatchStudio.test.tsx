import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

// ─── MAÇ STÜDYOSU (20 Ağu 2026) ─────────────────────────────────────────────
//
// Kurucu isteği: "yeni maç ekranı daha büyük ve düzenli olsun; maçın nasıl
// göründüğü kapsamlı yer alsın." Stüdyonun iki sözleşmesi test edilir:
//   1) Canlı önizleme UYGULAMANIN KENDİ KARTIDIR (MatchJoinCard) — ayrı bir
//      kopya çizilmez; format değişince kadro sayısı önizlemede değişir.
//   2) Kaydet, zorunlu alanlar dolmadan kapalıdır ve payload eski modalla
//      aynı sözleşmeyi taşır (admin_create_match kırılmaz).

vi.mock('../../../supabaseClient', () => ({
  supabase: {
    from: () => ({
      select: () => ({
        eq: () => ({
          eq: () => ({
            then: (fn: (r: { data: unknown[] }) => void) => fn({ data: [] }),
          }),
        }),
      }),
    }),
  },
}));

vi.mock('../../../hooks/useImageUpload', () => ({
  useImageUpload: () => ({ uploadImage: vi.fn(async () => null), uploading: false, progress: 0 }),
}));

// Store: stüdyo adminPitches okur; MatchJoinCard (önizleme) userTeams okur.
const storeState = { adminPitches: [] as unknown[], userTeams: [] as unknown[] };
vi.mock('../../../store', () => ({
  useAppStore: (selector?: (s: typeof storeState) => unknown) =>
    selector ? selector(storeState) : storeState,
}));

import { MatchStudio } from '../../../admin-panel/views/components/MatchStudio';

const ciz = (onSave = vi.fn(async () => {})) => {
  render(
    <MatchStudio open mode="create" match={null} onClose={vi.fn()} onSave={onSave} />,
  );
  return onSave;
};

describe('Maç Stüdyosu — tam ekran oluşturma + canlı uygulama önizlemesi', () => {
  beforeEach(() => vi.clearAllMocks());

  it('stüdyo açılır ve önizleme UYGULAMANIN kartıyla çizilir (LOBİYE GİT CTA)', () => {
    ciz();
    expect(screen.getByText('Maç Stüdyosu')).toBeInTheDocument();
    expect(screen.getByText('Yeni Maç Oluştur')).toBeInTheDocument();
    // MatchJoinCard'ın kendi CTA'sı — önizlemenin ayrı bir kopya olmadığının kanıtı.
    expect(screen.getByText('LOBİYE GİT')).toBeInTheDocument();
    expect(screen.getByText('Canlı Önizleme')).toBeInTheDocument();
  });

  it('varsayılan 7v7 kadrosu: takım başına 7, toplam 14 yer', () => {
    ciz();
    expect(screen.getByText(/7v7 · 14 yer \(0 dolu\)/)).toBeInTheDocument();
  });

  it('format 5v5 seçilince önizleme kadrosu 10 yere düşer', () => {
    ciz();
    fireEvent.click(screen.getByRole('button', { name: '5v5' }));
    expect(screen.getByText(/5v5 · 10 yer \(0 dolu\)/)).toBeInTheDocument();
  });

  it('başlık ve konum boşken kaydet kapalı; dolunca açılır', () => {
    ciz();
    expect(screen.getAllByRole('button', { name: /Maçı Yayınla/i })[0]).toBeDisabled();
    fireEvent.change(screen.getByPlaceholderText('örn. Perşembe Akşam Klasiği'), { target: { value: 'Test Maçı' } });
    fireEvent.change(screen.getByPlaceholderText('Altınordu Arena'), { target: { value: 'Arena' } });
    // "Eksik" uyarısı kaybolunca React üst bar düğümünü yeniden kurar —
    // düğme YENİDEN sorgulanır (eski referans kopuk düğümde kalır).
    expect(screen.getAllByRole('button', { name: /Maçı Yayınla/i })[0]).not.toBeDisabled();
  });

  it('kişi başı ücret × toplam yer = "kadro dolarsa toplam" (7v7 · 150₺ → 2.100₺)', () => {
    ciz();
    const fiyat = screen.getByRole('spinbutton');
    fireEvent.change(fiyat, { target: { value: '150' } });
    // 14 yer × 150₺ — hem sol bölümde hem yayın özetinde görünür.
    expect(screen.getAllByText(/2\.100₺/).length).toBeGreaterThan(0);
  });

  it('kaydet payload eski modal sözleşmesini taşır (admin_create_match kırılmaz)', async () => {
    const onSave = vi.fn(async () => {});
    ciz(onSave);
    fireEvent.change(screen.getByPlaceholderText('örn. Perşembe Akşam Klasiği'), { target: { value: 'Perşembe Klasiği' } });
    fireEvent.change(screen.getByPlaceholderText('Altınordu Arena'), { target: { value: 'Altınordu Arena' } });
    fireEvent.click(screen.getByRole('button', { name: '5v5' }));
    fireEvent.click(screen.getAllByRole('button', { name: /Maçı Yayınla/i })[0]);
    await vi.waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    const payload = onSave.mock.calls[0][0] as Record<string, unknown>;
    expect(payload.title).toBe('Perşembe Klasiği');
    expect(payload.location).toBe('Altınordu Arena');
    expect(payload.format).toBe('5v5');
    expect(payload.visibility).toBe('OPEN');
    expect(payload.isPlatform).toBe(true);
    expect(payload.badges).toEqual(['Rahat']);
    expect(String(payload.rawDate)).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    // Süre metni gider; duration_minutes'ı sunucu trigger'ı türetir.
    expect(payload.duration).toBe('60 Dakika');
  });
});
