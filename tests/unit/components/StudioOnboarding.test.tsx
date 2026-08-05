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
  const query: any = { select: vi.fn(() => query), update: vi.fn(() => query), eq: vi.fn(async () => ({ data: [], error: null })) };
  const channel: any = { on: vi.fn(() => channel), subscribe: vi.fn(() => channel) };
  return { supabase: { from: vi.fn(() => query), channel: vi.fn(() => channel), removeChannel: vi.fn() } };
});
vi.mock('../../../services/teamSocialService', () => ({
  getMyTeams: vi.fn(async () => []), getTeamSquad: vi.fn(async () => []), formatLabel: (s: unknown) => String(s),
}));
vi.mock('../../../services/tacticSocialService', () => ({
  logStudioEvent: vi.fn(),
  saveTeamTactic: vi.fn(), approveTacticRpc: vi.fn(), rejectTacticRpc: vi.fn(),
  getTacticById: vi.fn(async () => null), setTacticShareLink: vi.fn(), tacticShareUrl: vi.fn(() => ''),
  getTeamTacticsShowcase: vi.fn(async () => []), setActiveTactic: vi.fn(),
}));
vi.mock('../../../services/teamChatService', () => ({ sendTeamMessage: vi.fn(), tacticMessageBody: vi.fn(() => '') }));
vi.mock('../../../services/socialService', () => ({ getFriends: vi.fn(async () => []), getFriendLists: vi.fn(async () => []) }));

import Studio from '../../../views/Studio';

// ─── İlk kullanım tanıtımı (tek sayfa, kullanıcı-başına) + örnek taktik ──────
// 2026-07-23'te 3 adımlı tur, tek sayfalık kapsamlı araç tanıtımıyla
// değiştirildi (demosuz; "Başla" ile kapanır, Yardım ile yeniden açılır).

const renderStudio = () => render(<Studio onBack={vi.fn()} onNavigate={vi.fn()} />);

describe('Studio — ilk kullanım tanıtımı', () => {
  beforeEach(() => {
    localStorage.clear(); // ilk açılışı simüle et (tanıtım gösterilmeli)
  });

  it('ilk açılışta tek sayfa tanıtım gösterilir; tüm araç satırları listelenir', async () => {
    renderStudio();
    expect(await screen.findByText('Oyuncuları yerleştir')).toBeInTheDocument();
    expect(screen.getByText('KOŞU çiz')).toBeInTheDocument();
    expect(screen.getByText('PAS çiz — tek top, zincir')).toBeInTheDocument();
    expect(screen.getByText('OYNAT / DURDUR')).toBeInTheDocument();
    expect(screen.getByText('Tempo & taraf')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Başla' })).toBeInTheDocument();
  });

  it('Başla tanıtımı kapatır ve bir daha otomatik açılmaz (localStorage)', async () => {
    const { unmount } = renderStudio();
    await screen.findByText('Oyuncuları yerleştir');
    fireEvent.click(screen.getByRole('button', { name: 'Başla' }));
    expect(screen.queryByText('Oyuncuları yerleştir')).not.toBeInTheDocument();
    expect(localStorage.getItem('oyna_studio_onboarded_v1')).toBe('1');

    // Yeniden mount: tanıtım açılmaz
    unmount();
    renderStudio();
    await waitFor(() => expect(screen.queryByText('Oyuncuları yerleştir')).not.toBeInTheDocument());
  });

  // Örnek taktik 2026-08-04'te KALDIRILDI (kullanıcı kararı): tanıtım zaten
  // araçların tamamını anlatıyor, ayrıca hazır taktik önerilmiyor. Tanıtım
  // kapanınca boş tahtada davet/öneri ÇIKMAMALI.
  it('tanıtım kapanınca boş tahtada örnek taktik daveti çıkmaz', async () => {
    renderStudio();
    await screen.findByText('Oyuncuları yerleştir');
    fireEvent.click(screen.getByRole('button', { name: 'Başla' }));

    await waitFor(() => expect(screen.queryByText('Oyuncuları yerleştir')).not.toBeInTheDocument());
    expect(screen.queryByText('Örnek taktiği yükle')).not.toBeInTheDocument();
    expect(screen.queryByText('Örnek Taktik')).not.toBeInTheDocument();
  });

  it('Yardım butonu tanıtımı yeniden açar', async () => {
    localStorage.setItem('oyna_studio_onboarded_v1', '1'); // daha önce görülmüş
    renderStudio();
    // Tanıtım otomatik açılmaz
    await waitFor(() => expect(screen.queryByText('Oyuncuları yerleştir')).not.toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: 'Yardım' }));
    expect(await screen.findByText('Oyuncuları yerleştir')).toBeInTheDocument();
  });
});
