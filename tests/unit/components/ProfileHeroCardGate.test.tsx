import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

// Kart yüzü 3B eğim için motion değeri API'sini kullanır; genel setup mock'u
// yalnız motion/AnimatePresence veriyor. Eksik dördünü burada tamamla.
vi.mock('framer-motion', () => {
  const motionProxy = new Proxy({}, {
    get: (_t, tag: string) => React.forwardRef((props: any, ref: any) => {
      const { children, initial, animate, exit, transition, whileHover, whileTap,
        style, layout, layoutId, variants, custom, ...rest } = props;
      return React.createElement(tag, { ...rest, ref, style }, children);
    }),
  });
  const val = (v: unknown) => ({ get: () => v, set: () => {}, on: () => () => {} });
  return {
    motion: motionProxy,
    AnimatePresence: ({ children }: any) => children,
    useReducedMotion: () => true,
    useMotionValue: (v: unknown) => val(v),
    useTransform: () => val(0),
    useSpring: (v: unknown) => (typeof v === 'object' ? v : val(v)),
  };
});

import { ProfileHero } from '../../../components/profile/ProfileHero';

// ─── KART HAZIRLIK KAPISI — SÖZLEŞME (kullanıcı kararı) ─────────────────────
//
// Eski premium kapısı (profiles.card_active) puan sistemi sökümüyle gitti.
// Yerine içeriğe bakan ölçüt: kart yalnız SÖYLEYECEK BİR ŞEYİ varken sunulur.
// Kartın gösterdiği her şey mevki + seviye beyanı + maç sayısıdır; üçü de
// yoksa düğme HİÇ çizilmez (isimden ibaret boş kabuk kullanıcıya sunulmaz).
//
// Ölçüt TEK YERDE (ProfileHero) hesaplanır — tüketici profili ile admin
// aynası aynı bileşeni kullandığı için ikisi asla ayrışamaz.

const ciz = (over: Partial<React.ComponentProps<typeof ProfileHero>> = {}) =>
  render(
    <ProfileHero
      name="Deneme Oyuncu"
      verified={false}
      position={null}
      age={null}
      matches={0}
      winRate={null}
      selfSkill={null}
      {...over}
    />,
  );

describe('ProfileHero — kart düğmesi hazırlık kapısı', () => {
  it('bos profilde (mevki yok, beyan yok, mac yok) kart dugmesi CIZILMEZ', () => {
    ciz();
    expect(screen.queryByLabelText('Kart görünümü')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Sade görünüm')).not.toBeInTheDocument();
    // Sade görünüm yine tam çalışır — isim ve şerit yerinde
    expect(screen.getByText('Deneme Oyuncu')).toBeInTheDocument();
  });

  it('yalniz mevki varsa kart HAZIR (kurulumu biten herkes)', () => {
    ciz({ position: 'Orta Saha' });
    expect(screen.getByLabelText('Kart görünümü')).toBeInTheDocument();
  });

  it('yalniz seviye beyani varsa kart HAZIR', () => {
    ciz({ selfSkill: 7 });
    expect(screen.getByLabelText('Kart görünümü')).toBeInTheDocument();
  });

  it('yalniz oynanmis mac varsa kart HAZIR (eski profiller)', () => {
    ciz({ matches: 3 });
    expect(screen.getByLabelText('Kart görünümü')).toBeInTheDocument();
  });

  it('hazir olunca dugme gercekten kart gorunumune gecirir', () => {
    ciz({ position: 'Kaleci', matches: 5, winCount: 3, winRate: 60 });
    fireEvent.click(screen.getByLabelText('Kart görünümü'));
    // Kart yüzünde maç/galibiyet paneli görünür
    expect(screen.getAllByText(/MAÇ/i).length).toBeGreaterThan(0);
  });
});
