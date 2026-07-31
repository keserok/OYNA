import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';

import { ProfileHero } from '../../../components/profile/ProfileHero';

// ─── PROFİL KİMLİK KARTI — SÖZLEŞME (tasarım 3a "İnce Neon", kullanıcı kararı) ─
//
// 1. Koleksiyon kartı (🎴) geçişi KALDIRILDI: tasarımda yok, düğmesi hiç çizilmez.
// 2. Kimlik künyesi TEK SATIR: mevki · yaş · cinsiyet · oyun stili. Olmayan
//    bilgi sessizce düşer, ayraç artığı bırakmaz.
// 3. Galibiyet oranı veri yokken "%0" değil "—" yazar (IP-18).
//
// Ölçüt TEK YERDE (ProfileHero) hesaplanır — tüketici profili ile admin aynası
// aynı bileşeni kullandığı için ikisi asla ayrışamaz.

const ciz = (over: Partial<React.ComponentProps<typeof ProfileHero>> = {}) =>
  render(
    <ProfileHero
      name="Deneme Oyuncu"
      verified={false}
      position={null}
      age={null}
      matches={0}
      winRate={null}
      {...over}
    />,
  );

describe('ProfileHero — kimlik kartı', () => {
  it('koleksiyon kartı gecis dugmesi ARTIK CIZILMEZ', () => {
    ciz({ position: 'Orta Saha', matches: 12 });
    expect(screen.queryByLabelText('Kart görünümü')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Sade görünüm')).not.toBeInTheDocument();
    expect(screen.getByText('Deneme Oyuncu')).toBeInTheDocument();
  });

  it('kunye satiri: mevki · yas · cinsiyet · oyun stili', () => {
    ciz({ position: 'Orta Saha', age: 27, gender: 'erkek', playStyle: 'rahat' });
    expect(screen.getByText('Orta Saha · 27 yaş · Erkek · Rahat')).toBeInTheDocument();
  });

  it('eksik bilgiler kunyeden sessizce duser (bos ayrac kalmaz)', () => {
    ciz({ position: 'Kaleci', age: null, gender: null, playStyle: null });
    const kunye = screen.getByText('Kaleci');
    expect(kunye.textContent).toBe('Kaleci');
  });

  it('dogum tarihi yoksa onboarding yas araligi kullanilir', () => {
    ciz({ position: null, age: null, ageRange: '24-30' });
    expect(screen.getByText('24–30 yaş')).toBeInTheDocument();
  });

  it('hic skorlu mac yokken galibiyet orani — yazar, %0 degil', () => {
    ciz({ matches: 3, winRate: null });
    expect(screen.getByText('—')).toBeInTheDocument();
    expect(screen.queryByText('%0')).not.toBeInTheDocument();
  });

  it('MVP verisi yokken EN IYI hucresi cizilmez', () => {
    const { rerender } = ciz({ matches: 5, winRate: 60, mvp: null });
    expect(screen.queryByText('EN İYİ')).not.toBeInTheDocument();
    rerender(
      <ProfileHero name="Deneme Oyuncu" position={null} age={null} matches={5} winRate={60} mvp={3} />,
    );
    expect(screen.getByText('EN İYİ')).toBeInTheDocument();
  });
});
