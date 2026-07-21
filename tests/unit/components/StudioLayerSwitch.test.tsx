import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

// ─── Stüdyoyu jsdom'da mount etmek için dosya-düzeyi mock'lar ─────────────────
// (StudioAttackLibrary.test ile aynı desen: kimliği SABİT motion bileşenleri,
// kanallı supabase, boş dönen servisler.)

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

// ─── BİZ/RAKİP katman anahtarı — UI kablolaması ──────────────────────────────
//
// RAKİP moddayken bizim taraf arka plandadır: soluk, düşük z, dokunulmaz;
// tüm işlem ve seçimler rakibe aittir. BİZ'e dönünce durum tersine döner.

const renderStudio = () => render(<Studio onBack={vi.fn()} onNavigate={vi.fn()} />);

/** İlk boş mevki butonunun katman konteynerini (motion.div sarmalayıcı) döndürür. */
const firstSlotContainer = () =>
  screen.getAllByRole('button', { name: 'Mevkiye oyuncu ekle' })[0].parentElement as HTMLElement;

describe('Studio — BİZ/RAKİP katman anahtarı', () => {
  it('varsayılan (BİZ): bizim taraf önde — parlak, z=30', () => {
    renderStudio();
    const cont = firstSlotContainer();
    expect(cont.className).not.toContain('opacity-40');
    expect(cont.className).not.toContain('pointer-events-none');
    expect(cont.style.zIndex).toBe('30');
  });

  it('RAKİP moda geçince bizim taraf arkaya düşer: soluk, kilitli, z=10', () => {
    renderStudio();
    fireEvent.click(screen.getByTitle('Rakibi düzenle'));
    const cont = firstSlotContainer();
    expect(cont.className).toContain('opacity-40');
    expect(cont.className).toContain('pointer-events-none');
    expect(cont.style.zIndex).toBe('10');
  });

  it('RAKİP modda bizim boş mevki artısı Oyuncu Seç açmaz', () => {
    renderStudio();
    fireEvent.click(screen.getByTitle('Rakibi düzenle'));
    fireEvent.click(screen.getAllByRole('button', { name: 'Mevkiye oyuncu ekle' })[0]);
    expect(screen.queryByText('Oyuncu Seç')).not.toBeInTheDocument();
  });

  it('RAKİP butonu rakip takımı dizer; rakip markörleri önde ve etkileşimli olur', () => {
    renderStudio();
    // Toolbar'daki "RAKİP" (Swords) butonu — segmented BİZ/RAKİP'ten ayrı, aynalayıp moda geçer
    fireEvent.click(screen.getByTitle(/Rakip takımı sahaya diz/));

    // Aynalanan rakipler sahada (R1..R7) ve önde.
    // 'R1' hem saha markör etiketi (span) hem Oyuncular listesinde (h4) geçer — markörü al.
    const oppLabel = screen.getAllByText('R1').find(el => el.tagName === 'SPAN') as HTMLElement;
    let node: HTMLElement | null = oppLabel;
    while (node && node.style.zIndex === '') node = node.parentElement;
    expect(node?.style.zIndex).toBe('30');

    // Bizim taraf arkada
    expect(firstSlotContainer().style.zIndex).toBe('10');
  });

  it('BİZ moduna dönünce katman tersine döner', () => {
    renderStudio();
    fireEvent.click(screen.getByTitle('Rakibi düzenle'));
    expect(firstSlotContainer().style.zIndex).toBe('10');
    fireEvent.click(screen.getByTitle('Bizim takımı düzenle'));
    const cont = firstSlotContainer();
    expect(cont.style.zIndex).toBe('30');
    expect(cont.className).not.toContain('opacity-40');
  });
});
