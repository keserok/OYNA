import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

// ─── Stüdyoyu jsdom'da mount etmek için dosya-düzeyi mock'lar ─────────────────
// (diğer stüdyo bileşen testleriyle aynı desen; arkadaş servisi gerçek veri döner)

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
  getFriends: vi.fn(async () => [
    {
      friend_id: 'f-ayse', full_name: 'Ayşe Kaya', pos: 'ST', fp: 82,
      is_favorite: true, list_ids: [], matches_together: 4, avatar_url: null,
    },
    {
      friend_id: 'f-deniz', full_name: 'Deniz Ak', pos: 'CB', fp: 74,
      is_favorite: false, list_ids: [], matches_together: 1, avatar_url: null,
    },
  ]),
  getFriendLists: vi.fn(async () => []),
}));

import Studio from '../../../views/Studio';

// ─── Oyuncu Seç — tek akışlı liste + aramaya entegre manuel ekle ─────────────

const renderStudio = () => render(<Studio onBack={vi.fn()} onNavigate={vi.fn()} />);

const openFirstSlotModal = () =>
  fireEvent.click(screen.getAllByRole('button', { name: 'Mevkiye oyuncu ekle' })[0]);

const searchBox = () => screen.getByPlaceholderText('Ara ya da isim yazıp manuel ekle…');

describe('Studio — Oyuncu Seç (yenilenen)', () => {
  it('mevki artısı bağlam başlığıyla açılır ve arkadaşları listeler', async () => {
    renderStudio();
    openFirstSlotModal(); // slot sırası s1 = kaleci
    expect(await screen.findByText('KALECİ mevkisi için seç')).toBeInTheDocument();
    expect(await screen.findByText('Ayşe Kaya')).toBeInTheDocument();
    expect(screen.getByText('Deniz Ak')).toBeInTheDocument();
    // Eski sekmeler öldü
    expect(screen.queryByText('Hayali')).not.toBeInTheDocument();
    expect(screen.queryByText(/Hayali Oyuncu Yarat/)).not.toBeInTheDocument();
  });

  it('yedek Ekle butonu "Yedeklere ekle" bağlamıyla açılır', async () => {
    renderStudio();
    // "Ekle" adını hem yedek tepsisi hem yeni-plan butonu taşır; yedek olan title'sızdır
    const benchAdd = screen.getAllByRole('button', { name: 'Ekle' }).find(b => !b.title)!;
    fireEvent.click(benchAdd);
    expect(await screen.findByText('Yedeklere ekle')).toBeInTheDocument();
  });

  it('arama süzer; eşleşme varken manuel ekle satırı altta belirir', async () => {
    renderStudio();
    openFirstSlotModal();
    await screen.findByText('Ayşe Kaya');

    fireEvent.change(searchBox(), { target: { value: 'Ayş' } });
    expect(screen.queryByText('Deniz Ak')).not.toBeInTheDocument();
    expect(screen.getByText('Ayşe Kaya')).toBeInTheDocument();
    expect(screen.getByText(/adıyla manuel ekle/)).toBeInTheDocument();
  });

  it('eşleşmeyen isim tek dokunuşla manuel eklenir (mevki sorulmaz)', async () => {
    renderStudio();
    openFirstSlotModal();
    await screen.findByText('Ayşe Kaya');

    fireEvent.change(searchBox(), { target: { value: 'Miraç Kerem' } });
    fireEvent.click(screen.getByText(/adıyla manuel ekle/).closest('button')!);

    // Modal kapanır, oyuncu sahaya iner
    await waitFor(() => expect(screen.queryByText(/mevkisi için seç/)).not.toBeInTheDocument());
    expect(screen.getAllByText('Miraç Kerem').length).toBeGreaterThan(0);
    // Manuel rozeti (Oyuncular listesi) — mor HAYALİ öldü
    expect(screen.getByText('MANUEL')).toBeInTheDocument();
    expect(screen.queryByText('HAYALİ')).not.toBeInTheDocument();
  });

  it('kadrodaki oyuncu listede sönük + Kadroda rozetiyle kilitlenir', async () => {
    renderStudio();
    openFirstSlotModal();
    fireEvent.click((await screen.findByText('Ayşe Kaya')).closest('button')!);
    await waitFor(() => expect(screen.queryByText(/mevkisi için seç/)).not.toBeInTheDocument());

    openFirstSlotModal(); // sıradaki boş mevki
    await screen.findByText('Deniz Ak');
    const ayseRow = screen.getAllByText('Ayşe Kaya').map(el => el.closest('button')).find(b => b && b.disabled);
    expect(ayseRow).toBeTruthy();
    expect(screen.getByText('Kadroda')).toBeInTheDocument();
  });
});
