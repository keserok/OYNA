import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

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
  const query: any = { select: vi.fn(() => query), eq: vi.fn(async () => ({ data: [], error: null })) };
  const channel: any = { on: vi.fn(() => channel), subscribe: vi.fn(() => channel) };
  return { supabase: { from: vi.fn(() => query), channel: vi.fn(() => channel), removeChannel: vi.fn() } };
});
vi.mock('../../../services/teamSocialService', () => ({
  getMyTeams: vi.fn(async () => []), getTeamSquad: vi.fn(async () => []), formatLabel: (s: unknown) => String(s),
}));
vi.mock('../../../services/tacticSocialService', () => ({
  saveTeamTactic: vi.fn(), approveTacticRpc: vi.fn(), rejectTacticRpc: vi.fn(),
  getTacticById: vi.fn(async () => null), setTacticShareLink: vi.fn(), tacticShareUrl: vi.fn(() => ''),
  getTeamTacticsShowcase: vi.fn(async () => []), setActiveTactic: vi.fn(),
}));
vi.mock('../../../services/teamChatService', () => ({ sendTeamMessage: vi.fn(), tacticMessageBody: vi.fn(() => '') }));
vi.mock('../../../services/socialService', () => ({ getFriends: vi.fn(async () => []), getFriendLists: vi.fn(async () => []) }));

import Studio from '../../../views/Studio';

// ─── İlk kullanım turu + örnek taktik ─────────────────────────────────────────

const renderStudio = () => render(<Studio onBack={vi.fn()} onNavigate={vi.fn()} />);

describe('Studio — ilk kullanım turu', () => {
  beforeEach(() => {
    localStorage.clear(); // ilk açılışı simüle et (tur gösterilmeli)
  });

  it('ilk açılışta 3 adımlı tur gösterilir; Sonraki ile ilerler', async () => {
    renderStudio();
    expect(await screen.findByText('Oyuncularını yerleştir')).toBeInTheDocument();
    expect(screen.getByText('Adım 1/3')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Sonraki/ }));
    expect(screen.getByText('Hareketleri çiz')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Sonraki/ }));
    expect(screen.getByText('İzle ve paylaş')).toBeInTheDocument();
  });

  it('Atla turu kapatır ve bir daha açılmaz (localStorage)', async () => {
    const { unmount } = renderStudio();
    await screen.findByText('Oyuncularını yerleştir');
    fireEvent.click(screen.getByRole('button', { name: 'Atla' }));
    expect(screen.queryByText('Oyuncularını yerleştir')).not.toBeInTheDocument();
    expect(localStorage.getItem('oyna_studio_onboarded_v1')).toBe('1');

    // Yeniden mount: tur açılmaz
    unmount();
    renderStudio();
    await waitFor(() => expect(screen.queryByText('Adım 1/3')).not.toBeInTheDocument());
  });

  it('son adımda "Örnek yükle" örnek taktiği plana koyar', async () => {
    renderStudio();
    await screen.findByText('Oyuncularını yerleştir');
    fireEvent.click(screen.getByRole('button', { name: /Sonraki/ }));
    fireEvent.click(screen.getByRole('button', { name: /Sonraki/ }));
    fireEvent.click(screen.getByRole('button', { name: /Örnek yükle/ }));

    await waitFor(() => expect(screen.queryByText('İzle ve paylaş')).not.toBeInTheDocument());
    // Örnek taktik plan sekmesinde görünür
    expect(screen.getAllByText('Örnek Taktik').length).toBeGreaterThan(0);
  });

  it('yardım (?) butonu turu yeniden açar', async () => {
    localStorage.setItem('oyna_studio_onboarded_v1', '1'); // daha önce görülmüş
    renderStudio();
    // Tur otomatik açılmaz
    await waitFor(() => expect(screen.queryByText('Adım 1/3')).not.toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: 'Yardım' }));
    expect(await screen.findByText('Oyuncularını yerleştir')).toBeInTheDocument();
  });
});
