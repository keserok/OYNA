import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

// ─── Stüdyoyu jsdom'da mount etmek için dosya-düzeyi mock'lar ─────────────────
// setup.ts'teki genel mock'ların üstüne: Studio, Reorder/MotionConfig ve
// supabase.channel gibi ek yüzeyler kullanır; servisler ağ yerine boş döner.

vi.mock('framer-motion', () => {
  const strip = ({
    children, whileHover, whileTap, transition, initial, animate, exit, layout, layoutId,
    variants, custom, drag, dragConstraints, dragElastic, dragMomentum, onDragStart, onDragEnd,
    ...props
  }: any) => ({ children, props });
  // Bileşen kimliği render'lar arasında SABİT kalmalı (tag başına memoize);
  // aksi hâlde her render remount üretir ve tutulan DOM referansları bayatlar.
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
import { ATTACK_PRESETS } from '../../../views/studio/attackPresets';

// ─── Atak Kütüphanesi UI kablolaması ─────────────────────────────────────────
//
// Akış: ATAKLAR butonu → sheet → şablon seç → çizimler sahaya uygulanır,
// animasyon modülü indirilir ve SIRALI oynatma başlar; GERİ AL eski sahneye döner.

const renderStudio = () => render(<Studio onBack={vi.fn()} onNavigate={vi.fn()} />);

describe('Studio — Atak Kütüphanesi', () => {
  it('ATAKLAR butonu sheet açar ve tüm şablonları listeler (7v7: hepsi açık)', async () => {
    renderStudio();
    fireEvent.click(screen.getByRole('button', { name: /ATAKLAR/ }));

    expect(await screen.findByText('Atak Kütüphanesi')).toBeInTheDocument();
    for (const preset of ATTACK_PRESETS) {
      const row = screen.getByText(preset.name).closest('button')!;
      expect(row).toBeInTheDocument();
      expect(row).not.toBeDisabled(); // 7v7 = 6 saha oyuncusu ≥ tüm eşikler
    }
  });

  it('şablon seçilince çizimler sahaya uygulanır ve sıralı oynatma başlar', async () => {
    const { container } = renderStudio();
    expect(container.querySelectorAll('svg path[marker-end]').length).toBe(0);

    fireEvent.click(screen.getByRole('button', { name: /ATAKLAR/ }));
    fireEvent.click((await screen.findByText('Sağ Kanat Atağı')).closest('button')!);

    // Toast + sheet kapanışı
    expect(await screen.findByText(/Sağ Kanat Atağı çizildi/)).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByText('Atak Kütüphanesi')).not.toBeInTheDocument());

    // Çizim katmanı: KANAT_SAG = 5 çizgi (pas + 2 koşu + orta + şut)
    await waitFor(() => expect(container.querySelectorAll('svg path[marker-end]').length).toBe(5));

    // Animasyon modülü otomatik indirildi ve oynatma başladı → SIFIRLA görünür
    expect(await screen.findByRole('button', { name: /SIFIRLA/ })).toBeInTheDocument();
  });

  it('GERİ AL şablonu geri alır (eski sahneye döner)', async () => {
    const { container } = renderStudio();
    fireEvent.click(screen.getByRole('button', { name: /ATAKLAR/ }));
    fireEvent.click((await screen.findByText('Verkaç (Duvar Pası)')).closest('button')!);
    await waitFor(() => expect(container.querySelectorAll('svg path[marker-end]').length).toBe(4));

    fireEvent.click(screen.getByRole('button', { name: /GERİ AL/ }));
    await waitFor(() => expect(container.querySelectorAll('svg path[marker-end]').length).toBe(0));
  });
});
