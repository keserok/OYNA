import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

// ─── Stüdyoyu jsdom'da mount etmek için dosya-düzeyi mock'lar ─────────────────
// (diğer stüdyo bileşen testleriyle aynı desen)

vi.mock('framer-motion', () => {
  const strip = ({
    children, whileHover, whileTap, transition, initial, animate, exit, layout, layoutId,
    variants, custom, drag, dragConstraints, dragElastic, dragMomentum, onDragStart, onDragEnd,
    ...props
  }: any) => ({ children, props });
  const cache = new Map<string, unknown>();
  const motionProxy = new Proxy({}, {
    get: (_t, tag: string) => {
      if (!cache.has(tag)) {
        cache.set(tag, React.forwardRef((allProps: any, ref: any) => {
          const { children, props } = strip(allProps);
          return React.createElement(tag, { ...props, ref }, children);
        }));
      }
      return cache.get(tag);
    },
  });
  return {
    motion: motionProxy,
    AnimatePresence: ({ children }: any) => children,
    MotionConfig: ({ children }: any) => children,
    useReducedMotion: () => false,
    Reorder: {
      Group: ({ children }: any) => React.createElement('div', null, children),
      Item: ({ children }: any) => React.createElement('div', null, children),
    },
  };
});

vi.mock('../../../supabaseClient', () => {
  const query: any = {
    select: vi.fn(() => query),
    eq: vi.fn(async () => ({ data: [], error: null })),
  };
  const channel: any = { on: vi.fn(() => channel), subscribe: vi.fn(() => channel) };
  return { supabase: { from: vi.fn(() => query), channel: vi.fn(() => channel), removeChannel: vi.fn() } };
});

vi.mock('../../../services/teamSocialService', () => ({
  getMyTeams: vi.fn(async () => []),
  getTeamSquad: vi.fn(async () => []),
  formatLabel: (s: unknown) => String(s),
}));
vi.mock('../../../services/tacticSocialService', () => ({
  logStudioEvent: vi.fn(),
  saveTeamTactic: vi.fn(),
  approveTacticRpc: vi.fn(),
  rejectTacticRpc: vi.fn(),
  getTacticById: vi.fn(async () => null),
  setTacticShareLink: vi.fn(),
  tacticShareUrl: vi.fn(() => ''),
}));
vi.mock('../../../services/teamChatService', () => ({
  sendTeamMessage: vi.fn(),
  tacticMessageBody: vi.fn(() => ''),
}));
vi.mock('../../../services/socialService', () => ({
  getFriends: vi.fn(async () => []),
  getFriendLists: vi.fn(async () => []),
}));

import Studio from '../../../views/Studio';

// ─── Tempo — araç çubuğu çipi + ayar sayfası (plana özel) ────────────────────

const renderStudio = () => render(<Studio onBack={vi.fn()} onNavigate={vi.fn()} />);
const tempoChip = () => screen.getByTitle('Oynatma temposu (plana özel, 1-10)');
const openSheet = () => fireEvent.click(tempoChip());
const slider = () => screen.getByLabelText('Tempo (1-10)') as HTMLInputElement;

describe('Studio — Tempo çipi ve ayar sayfası', () => {
  it('çip araç çubuğunda her zaman görünür ve varsayılan 5 gösterir; indirme kapısı yok', () => {
    renderStudio();
    expect(tempoChip().textContent).toContain('TEMPO 5');
    expect(screen.queryByText('GELİŞMİŞ ANİMASYON')).not.toBeInTheDocument();
  });

  it('çipe dokununca sayfa açılır; slider değeri değiştirir ve çip günceller', () => {
    renderStudio();
    openSheet();
    expect(slider().value).toBe('5');
    fireEvent.change(slider(), { target: { value: '9' } });
    expect(slider().value).toBe('9');
    fireEvent.click(screen.getByRole('button', { name: 'Tamam' }));
    expect(tempoChip().textContent).toContain('TEMPO 9');
  });

  it('− / + kademeli ayarlar ve uçlarda kilitlenir', () => {
    renderStudio();
    openSheet();
    const dec = screen.getByLabelText('Tempoyu azalt');
    const inc = screen.getByLabelText('Tempoyu artır');

    fireEvent.click(inc);
    expect(slider().value).toBe('6');

    fireEvent.change(slider(), { target: { value: '10' } });
    expect(inc).toBeDisabled();

    fireEvent.change(slider(), { target: { value: '1' } });
    expect(dec).toBeDisabled();
  });

  it('tempo plana özeldir: her plan kendi değerini taşır', () => {
    renderStudio();
    // Plan A: 9 yap
    openSheet();
    fireEvent.change(slider(), { target: { value: '9' } });
    fireEvent.click(screen.getByRole('button', { name: 'Tamam' }));
    expect(tempoChip().textContent).toContain('TEMPO 9');

    // Yeni plan (B): aktif planın temposunu kopyalar, sonra 3'e çekilir
    fireEvent.click(screen.getByTitle('Yeni plan (kadro & diziliş korunur)'));
    expect(tempoChip().textContent).toContain('TEMPO 9');
    openSheet();
    fireEvent.change(slider(), { target: { value: '3' } });
    fireEvent.click(screen.getByRole('button', { name: 'Tamam' }));
    expect(tempoChip().textContent).toContain('TEMPO 3');

    // Plan A'ya dön: kendi değeri (9) korunur
    fireEvent.click(screen.getByText('Plan A'));
    expect(tempoChip().textContent).toContain('TEMPO 9');
    fireEvent.click(screen.getByText('Plan B'));
    expect(tempoChip().textContent).toContain('TEMPO 3');
  });
});
