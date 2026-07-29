import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { useAppStore } from '../../../store';
import MatchDiscovery from '../../../views/MatchDiscovery';

// ─── "TOP OYNA" MAÇ KARTI — ALT KISIMDA GERÇEK SÜRE ─────────────────────────
//
// Kullanıcının isteği: "top oynadaki maç görsellerine maçın dakikası da
// eklenmeli ana kartlarda alta 60 90 120 hangisi geçerliyse GERÇEK VERİ olarak."
//
// REGRESYON: eski kod `m.duration || '90 Dakika'` yazıyordu — verisi olmayan
// (ve hatta 60 dakikalık) maçlar kartta "90 Dakika" görünüyordu. Bu dosya o
// uydurmanın geri gelmesini engeller.

vi.mock('../../../services/matchService', () => ({
  subscribeToOpenMatches: () => () => {},
  fetchNearbyMatches: vi.fn(() => Promise.resolve([])),
  resolvePrivateMatch: vi.fn(),
  toPrivateMatchErrorMessage: () => 'hata',
  getMatchDetails: vi.fn(),
}));

const mac = (over: Record<string, unknown> = {}) => ({
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
  slots: [{ id: 's1', role: 'MID', status: 'OPEN' }],
  awaySlots: [],
  status: 'ACTIVE',
  visibility: 'OPEN',
  format: '7v7',
  gender: 'Karma',
  ageGroup: 'Tümü',
  ...over,
});

const ciz = (matches: Record<string, unknown>[]) => {
  useAppStore.setState({
    adminMatches: matches,
    adminUsers: [{ id: 'u1', rating: 5 }],
    userLocation: null,
    selectedRegions: [],
    searchRadius: 25,
    setSearchRadius: vi.fn(),
  } as never);
  return render(<MatchDiscovery onBack={vi.fn()} onSelect={vi.fn()} />);
};

beforeEach(() => {
  useAppStore.setState({ adminMatches: [], selectedRegions: [], userLocation: null } as never);
});

describe('Top Oyna maç kartı — süre gerçek veriden', () => {
  it('90 dakikalik mac kartta "90 dakika" gosterir', () => {
    ciz([mac({ durationMinutes: 90 })]);
    expect(screen.getByText('90 dakika')).toBeInTheDocument();
  });

  it('60 dakikalik mac 60 gosterir — ESKI UYDURMA 90 GERI GELMEZ', () => {
    ciz([mac({ durationMinutes: 60 })]);
    expect(screen.getByText('60 dakika')).toBeInTheDocument();
    expect(screen.queryByText('90 dakika')).not.toBeInTheDocument();
  });

  it('120 dakikalik mac 120 gosterir', () => {
    ciz([mac({ durationMinutes: 120 })]);
    expect(screen.getByText('120 dakika')).toBeInTheDocument();
  });

  it('sure verisi yoksa rozet HIC cizilmez (eskiden "90 Dakika" uyduruyordu)', () => {
    ciz([mac({ duration: '90 Dakika' })]);
    expect(screen.queryByText(/dakika/i)).not.toBeInTheDocument();
    // Kart yine de cizilmis olmali (yalnizca sure rozeti yok).
    expect(screen.getByText('ARENA SPORT')).toBeInTheDocument();
  });

  it('ayni listede 60 ve 90 birlikte dogru gosterilir', () => {
    ciz([
      mac({ id: 'm1', location: 'Arena Sport', durationMinutes: 60 }),
      mac({ id: 'm2', location: 'Yıldız Halı Saha', durationMinutes: 90 }),
    ]);
    expect(screen.getByText('60 dakika')).toBeInTheDocument();
    expect(screen.getByText('90 dakika')).toBeInTheDocument();
  });
});

describe('Top Oyna süre filtresi — serbest metne değil gerçek veriye bakar', () => {
  const filtreyiAc = (secim: string) => {
    fireEvent.click(screen.getByRole('button', { name: /^filtre$/i }));
    fireEvent.click(screen.getByRole('button', { name: secim }));
    // Sihirbazı kapat → liste görünür ("N MAÇI GÖSTER" / "EŞLEŞEN MAÇ YOK").
    fireEvent.click(screen.getByRole('button', { name: /MAÇI GÖSTER|EŞLEŞEN MAÇ YOK/ }));
  };

  it('90 secilince 60 dakikalik mac "filtreye uygun" bolumune GIRMEZ', () => {
    ciz([
      mac({ id: 'm1', location: 'Altmislik', durationMinutes: 60 }),
      mac({ id: 'm2', location: 'Doksanlik', durationMinutes: 90 }),
    ]);
    filtreyiAc('90 Dakika');
    const uygunBaslik = screen.getByText('Filtreye Uygun Maçlar');
    const uygunBolum = uygunBaslik.parentElement as HTMLElement;
    expect(uygunBolum.textContent).toContain('DOKSANLIK');
    expect(uygunBolum.textContent).not.toContain('ALTMISLIK');
  });

  it('suresi bilinmeyen mac "filtreye uygun" sayilmaz (sessizce gecmez)', () => {
    ciz([mac({ id: 'm1', location: 'Bilinmeyen', duration: '90 Dakika' })]);
    filtreyiAc('90 Dakika');
    const uygunBolum = screen.getByText('Filtreye Uygun Maçlar').parentElement as HTMLElement;
    expect(uygunBolum.textContent).not.toContain('BILINMEYEN');
  });
});
