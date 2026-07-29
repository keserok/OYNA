import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MatchJoinCard } from '../../../components/MatchJoinCard';
import type { MatchListing } from '../../../types';

// ─── MAÇ KARTINDA SÜRE — GERÇEK VERİ ────────────────────────────────────────
//
// Kullanıcının isteği: "maçın dakikası da eklenmeli ana kartlarda alta 60 90 120
// hangisi geçerliyse GERÇEK VERİ olarak."
// Kaynak: matches.duration_minutes (tarifeden türetilir — E6/E1a).
// Veri yoksa alan HİÇ gösterilmez; uydurma 60/90 basılmaz.

const mac = (over: Partial<MatchListing> = {}): MatchListing => ({
  id: 'm1',
  title: 'Akşam Maçı',
  location: 'Arena Sport',
  time: '20:00',
  date: '30 Temmuz',
  price: 150,
  difficulty: 'Rahat',
  minRating: 0,
  image: '',
  badges: [],
  missingPositions: [],
  slots: [],
  format: '7v7',
  ...over,
} as MatchListing);

const ciz = (m: MatchListing) =>
  render(<MatchJoinCard match={m} currentUserUid="u1" onOpenLobby={vi.fn()} />);

describe('Maç kartı — süre gerçek veriden gelir', () => {
  it('90 dakikalik mac kartta "90 dakika" gosterir', () => {
    ciz(mac({ durationMinutes: 90 }));
    expect(screen.getByText('90 dakika')).toBeInTheDocument();
  });

  it('60 dakikalik mac kartta "60 dakika" gosterir (90 DEGIL)', () => {
    ciz(mac({ durationMinutes: 60 }));
    expect(screen.getByText('60 dakika')).toBeInTheDocument();
    expect(screen.queryByText('90 dakika')).not.toBeInTheDocument();
  });

  it('120 dakikalik mac kartta "120 dakika" gosterir', () => {
    ciz(mac({ durationMinutes: 120 }));
    expect(screen.getByText('120 dakika')).toBeInTheDocument();
  });

  it('sure verisi yoksa alan HIC cizilmez (uydurma sayi basilmaz)', () => {
    ciz(mac({}));
    expect(screen.queryByText(/dakika$/)).not.toBeInTheDocument();
  });

  it('serbest metin `duration` sureyi DOLDURMAZ (sunucu SSOT degil)', () => {
    ciz(mac({ duration: '90 Dakika' }));
    expect(screen.queryByText('90 dakika')).not.toBeInTheDocument();
  });

  it('sure etiketi italik DEGILDIR (karar S17: italik yalniz skorda)', () => {
    ciz(mac({ durationMinutes: 90 }));
    const el = screen.getByText('90 dakika');
    expect(el.className).not.toMatch(/\bitalic\b/);
  });
});
