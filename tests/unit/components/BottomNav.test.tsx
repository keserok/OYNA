import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { BottomNav, TAB_IDS } from '../../../components/BottomNav';

// IP-14 · Kullanıcı kararı: alt menünün beş yuvası yeniden dağıtıldı.
//
//   Ana Sayfa · Top Oyna · **Maçlarım (orta tuş)** · Saha Kirala · Profil
//
// Gerekçe: bilet, kapora ödemesi ve maç değerlendirmesi Maçlarım'dan geçiyor —
// en kolay erişilen yuvayı o hak ediyor. SOSYAL sekmeden çıktı; girişi Profil
// ekranında. Eskiden Maçlarım hiçbir sekmede yoktu ve o ekranda alt menü
// tamamen kayboluyordu.

describe('BottomNav — beş yuva', () => {
  it('beş sekmeyi de çiziyor', () => {
    render(<BottomNav currentView="DASHBOARD" onNavigate={vi.fn()} />);
    expect(screen.getByRole('navigation')).toBeInTheDocument();
    for (const etiket of ['Ana Sayfa', 'Top Oyna', 'Maçlarım', 'Saha Kirala', 'Profil']) {
      expect(screen.getByText(etiket)).toBeInTheDocument();
    }
  });

  it('Sosyal artık bir sekme DEĞİL', () => {
    render(<BottomNav currentView="DASHBOARD" onNavigate={vi.fn()} />);
    expect(screen.queryByText('Sosyal')).not.toBeInTheDocument();
    expect(TAB_IDS).not.toContain('SOCIAL');
  });

  it('TAB_IDS çizilen sekmelerle birebir aynı — tek kaynak', () => {
    // App.tsx `showBottomNav`'ı bu listeden türetir. İkisi ayrışırsa çubuk ya
    // olmaması gereken yerde çıkar ya da olması gereken yerde kaybolur.
    render(<BottomNav currentView="DASHBOARD" onNavigate={vi.fn()} />);
    expect(screen.getAllByRole('button')).toHaveLength(TAB_IDS.length);
    expect([...TAB_IDS]).toEqual(['DASHBOARD', 'MATCH_DISCOVERY', 'MY_MATCHES', 'PITCH_DISCOVERY', 'PROFILE']);
  });

  it('Taktik Stüdyo sekme listesinde YOK (tam ekran açılır)', () => {
    // Eskiden STUDIO App.tsx'in showBottomNav dizisindeydi ama sekmesi yoktu:
    // çubuk çiziliyor, hiçbir sekme yanmıyordu.
    expect(TAB_IDS).not.toContain('STUDIO');
  });
});

describe('BottomNav — aktif sekme işareti', () => {
  it('bulunduğun sekme aria-current="page" taşır', () => {
    const { rerender } = render(<BottomNav currentView="DASHBOARD" onNavigate={vi.fn()} />);
    expect(screen.getByRole('button', { name: /ana sayfa/i })).toHaveAttribute('aria-current', 'page');

    rerender(<BottomNav currentView="PROFILE" onNavigate={vi.fn()} />);
    expect(screen.getByRole('button', { name: /profil/i })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('button', { name: /ana sayfa/i })).not.toHaveAttribute('aria-current');
  });

  it('Maçlarım artık gerçek bir sekme — kendisi yanar, Ana Sayfa değil', () => {
    render(<BottomNav currentView={'MY_MATCHES' as never} onNavigate={vi.fn()} />);
    expect(screen.getByLabelText('Maçlarım')).toHaveAttribute('aria-current', 'page');
    expect(screen.getByLabelText('Ana Sayfa')).not.toHaveAttribute('aria-current');
  });

  it('her sekme için aktif işareti tek ve doğru', () => {
    for (const id of TAB_IDS) {
      const { unmount } = render(<BottomNav currentView={id as never} onNavigate={vi.fn()} />);
      const aktifler = screen.getAllByRole('button').filter((b) => b.getAttribute('aria-current') === 'page');
      expect(aktifler, `${id} için aktif sekme sayısı`).toHaveLength(1);
      unmount();
    }
  });
});

describe('BottomNav — dokunuş', () => {
  it('tıklanan sekmenin görünüm kimliğini iletir', () => {
    const git = vi.fn();
    render(<BottomNav currentView="DASHBOARD" onNavigate={git} />);

    fireEvent.click(screen.getByRole('button', { name: /top oyna/i }));
    expect(git).toHaveBeenCalledWith('MATCH_DISCOVERY');

    fireEvent.click(screen.getByRole('button', { name: /maçlarım/i }));
    expect(git).toHaveBeenCalledWith('MY_MATCHES');

    expect(git).toHaveBeenCalledTimes(2);
  });

  it('her sekme dokunma hedefi tabanını tutuyor (44px)', () => {
    render(<BottomNav currentView="DASHBOARD" onNavigate={vi.fn()} />);
    for (const btn of screen.getAllByRole('button')) {
      expect(btn.className, btn.getAttribute('aria-label') ?? '').toMatch(/min-h-\[(4[4-9]|[5-9]\d)px\]/);
    }
  });
});
