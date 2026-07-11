import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BottomNav } from '../../components/BottomNav';
import React from 'react';

describe('BottomNav', () => {
  it('tüm nav butonlarını ve etiketlerini render eder', () => {
    render(<BottomNav currentView="DASHBOARD" onNavigate={vi.fn()} />);

    expect(screen.getByText('Ana Sayfa')).toBeInTheDocument();
    expect(screen.getByText('Top Oyna')).toBeInTheDocument();
    expect(screen.getByText('Sosyal')).toBeInTheDocument();
    expect(screen.getByText('Sahalar')).toBeInTheDocument();
    expect(screen.getByText('Profil')).toBeInTheDocument();
  });

  it('aktif sekmeye aria-current="page" ekler', () => {
    render(<BottomNav currentView="MATCH_DISCOVERY" onNavigate={vi.fn()} />);

    const activeBtn = screen.getByRole('button', { name: 'Top Oyna' });
    const inactiveBtn = screen.getByRole('button', { name: 'Ana Sayfa' });

    expect(activeBtn).toHaveAttribute('aria-current', 'page');
    expect(inactiveBtn).not.toHaveAttribute('aria-current');
  });

  it('sekme tıklandığında onNavigate callback çağırır', async () => {
    const user = userEvent.setup();
    const onNavigate = vi.fn();
    render(<BottomNav currentView="DASHBOARD" onNavigate={onNavigate} />);

    const matchBtn = screen.getByRole('button', { name: 'Top Oyna' });
    await user.click(matchBtn);

    expect(onNavigate).toHaveBeenCalledWith('MATCH_DISCOVERY');
  });
});
