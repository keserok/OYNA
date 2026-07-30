import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import StepSkill from '../../../views/onboarding/StepSkill';

// ─── E7 · ONBOARDING SEVİYE ADIMI ───────────────────────────────────────────
//
// Bu adım ATLANAMAZ ve yıldızlar BAŞKASINI puanlamak için değil, kullanıcının
// kendi beyanı içindir. Testler tasarımın üç kuralını korur:
//   1) Şeride dokunma → ceil(oran × 10) puan
//   2) Band kartı canlı: 1–3 BAŞLANGIÇ · 4–7 ORTA · 8–10 İLERİ + ham değer
//   3) "Atla" bağlantısı bu adımın İÇİNDE YOK

/** jsdom'da PointerEvent yok: clientX'i taşıyan MouseEvent ile kurulur. */
const seritteSec = (slider: Element, oran: number) => {
  vi.spyOn(slider, 'getBoundingClientRect').mockReturnValue({
    left: 0, width: 100, top: 0, height: 44, right: 100, bottom: 44, x: 0, y: 0, toJSON: () => ({}),
  } as DOMRect);
  fireEvent(slider, new MouseEvent('pointerdown', { clientX: oran * 100, bubbles: true, cancelable: true }));
};

describe('StepSkill — seçim', () => {
  it('seride dokunmak ceil(oran x 10) puani verir', () => {
    const onChange = vi.fn();
    render(<StepSkill value={null} onChange={onChange} />);
    seritteSec(screen.getByRole('slider'), 0.7);
    expect(onChange).toHaveBeenCalledWith(7);
  });

  it('sol uc 1, sag uc 10 verir (tasma yok)', () => {
    const onChange = vi.fn();
    const { unmount } = render(<StepSkill value={null} onChange={onChange} />);
    seritteSec(screen.getByRole('slider'), 0.01);
    expect(onChange).toHaveBeenCalledWith(1);
    unmount();

    const onChange2 = vi.fn();
    render(<StepSkill value={null} onChange={onChange2} />);
    seritteSec(screen.getByRole('slider'), 1);
    expect(onChange2).toHaveBeenCalledWith(10);
  });

  it('ayni degere dokunmak gereksiz onChange TETIKLEMEZ', () => {
    const onChange = vi.fn();
    render(<StepSkill value={7} onChange={onChange} />);
    seritteSec(screen.getByRole('slider'), 0.7); // yine 7
    expect(onChange).not.toHaveBeenCalled();
  });
});

describe('StepSkill — band kartı', () => {
  it('secim yokken yonlendirme metni gosterir, band GOSTERMEZ', () => {
    render(<StepSkill value={null} onChange={vi.fn()} />);
    expect(screen.getByText('Yıldızlara dokunarak seviyeni seç')).toBeInTheDocument();
    expect(screen.queryByText('BAŞLANGIÇ')).not.toBeInTheDocument();
    expect(screen.queryByText('ORTA')).not.toBeInTheDocument();
    expect(screen.queryByText('İLERİ')).not.toBeInTheDocument();
  });

  it('2 -> BASLANGIC + ham deger 2/10', () => {
    render(<StepSkill value={2} onChange={vi.fn()} />);
    expect(screen.getByText('BAŞLANGIÇ')).toBeInTheDocument();
    expect(screen.getByText('2/10')).toBeInTheDocument();
    expect(screen.getByText('Yeni başlıyorum, keyif için oynuyorum.')).toBeInTheDocument();
  });

  it('5 -> ORTA', () => {
    render(<StepSkill value={5} onChange={vi.fn()} />);
    expect(screen.getByText('ORTA')).toBeInTheDocument();
    expect(screen.getByText('5/10')).toBeInTheDocument();
  });

  it('9 -> ILERI', () => {
    render(<StepSkill value={9} onChange={vi.fn()} />);
    expect(screen.getByText('İLERİ')).toBeInTheDocument();
    expect(screen.getByText('9/10')).toBeInTheDocument();
    expect(screen.getByText('Deneyimliyim, tempolu maç oynayabilirim.')).toBeInTheDocument();
  });

  it('aria degerleri secimi yansitir', () => {
    render(<StepSkill value={6} onChange={vi.fn()} />);
    const s = screen.getByRole('slider');
    expect(s).toHaveAttribute('aria-valuenow', '6');
    expect(s).toHaveAttribute('aria-valuemin', '1');
    expect(s).toHaveAttribute('aria-valuemax', '10');
  });
});

describe('StepSkill — adım atlanamaz', () => {
  it('adimin icinde "Atla" bagi YOK', () => {
    render(<StepSkill value={null} onChange={vi.fn()} />);
    expect(screen.queryByText(/^Atla$/i)).not.toBeInTheDocument();
  });

  it('durustluk notu gosterilir', () => {
    render(<StepSkill value={null} onChange={vi.fn()} />);
    expect(screen.getByText(/Dürüst ol/)).toBeInTheDocument();
  });

  it('uppercase basan kok ogede lang="tr" var (Turkce I sorunu)', () => {
    const { container } = render(<StepSkill value={9} onChange={vi.fn()} />);
    expect(container.querySelector('[lang="tr"]')).not.toBeNull();
  });
});
