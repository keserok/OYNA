import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { BottomNav } from '../../../components/BottomNav';

describe('BottomNav Component', () => {
  it('renders all nav items correctly', () => {
    render(<BottomNav currentView="DASHBOARD" onNavigate={vi.fn()} />);

    expect(screen.getByRole('navigation')).toBeInTheDocument();
    expect(screen.getByText('Ana Sayfa')).toBeInTheDocument();
    expect(screen.getByText('Top Oyna')).toBeInTheDocument();
    expect(screen.getByText('Sosyal')).toBeInTheDocument();
    expect(screen.getByText('Sahalar')).toBeInTheDocument();
    expect(screen.getByText('Profil')).toBeInTheDocument();
  });

  it('marks currentView nav item as active with aria-current="page"', () => {
    const { rerender } = render(<BottomNav currentView="DASHBOARD" onNavigate={vi.fn()} />);
    
    // Check Dashboard is active
    let activeBtn = screen.getByRole('button', { name: /ana sayfa/i });
    expect(activeBtn).toHaveAttribute('aria-current', 'page');
    
    // Rerender with PROFILE active
    rerender(<BottomNav currentView="PROFILE" onNavigate={vi.fn()} />);
    activeBtn = screen.getByRole('button', { name: /profil/i });
    expect(activeBtn).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('button', { name: /ana sayfa/i })).not.toHaveAttribute('aria-current');
  });

  it('calls onNavigate with appropriate view ID when clicked', () => {
    const handleNavigate = vi.fn();
    render(<BottomNav currentView="DASHBOARD" onNavigate={handleNavigate} />);

    // Click on 'Top Oyna' (MATCH_DISCOVERY)
    const topOynaBtn = screen.getByRole('button', { name: /top oyna/i });
    fireEvent.click(topOynaBtn);

    expect(handleNavigate).toHaveBeenCalledTimes(1);
    expect(handleNavigate).toHaveBeenCalledWith('MATCH_DISCOVERY');

    // Click on 'Sosyal' (SOCIAL)
    const socialBtn = screen.getByRole('button', { name: /sosyal/i });
    fireEvent.click(socialBtn);

    expect(handleNavigate).toHaveBeenCalledTimes(2);
    expect(handleNavigate).toHaveBeenCalledWith('SOCIAL');
  });
});

// IP-01 · BULGU-019: MY_MATCHES ve STUDIO sekme DEĞİL ama alt menü çiziliyor.
// Hiçbir sekme aktif görünmezse kullanıcı "neredeyim" sorusunu cevaplayamıyor.
describe('BottomNav — sekme olmayan görünümlerde aktif işaret', () => {
  it('MY_MATCHES görünümünde Ana Sayfa aktif görünür', () => {
    render(<BottomNav currentView={'MY_MATCHES' as never} onNavigate={vi.fn()} />);
    expect(screen.getByLabelText('Ana Sayfa')).toHaveAttribute('aria-current', 'page');
  });

  it('STUDIO görünümünde Ana Sayfa aktif görünür', () => {
    render(<BottomNav currentView={'STUDIO' as never} onNavigate={vi.fn()} />);
    expect(screen.getByLabelText('Ana Sayfa')).toHaveAttribute('aria-current', 'page');
  });

  it('gerçek bir sekmedeyken Ana Sayfa aktif DEĞİL', () => {
    render(<BottomNav currentView={'PROFILE' as never} onNavigate={vi.fn()} />);
    expect(screen.getByLabelText('Ana Sayfa')).not.toHaveAttribute('aria-current');
    expect(screen.getByLabelText('Profil')).toHaveAttribute('aria-current', 'page');
  });
});
