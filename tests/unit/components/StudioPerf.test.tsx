import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';

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

// ─── Performans katmanı — cihaz sınıfına göre süs efektleri ───────────────────

const setCores = (n: number) =>
  Object.defineProperty(navigator, 'hardwareConcurrency', { value: n, configurable: true });

const renderStudio = () => render(<Studio onBack={vi.fn()} onNavigate={vi.fn()} />);

describe('Studio — performans sınıfı süs efektlerini geçitler', () => {
  const original = navigator.hardwareConcurrency;
  afterEach(() => {
    Object.defineProperty(navigator, 'hardwareConcurrency', { value: original, configurable: true });
  });

  it('güçlü cihazda (8 çekirdek) saha iç gölgesi korunur', () => {
    setCores(8);
    renderStudio();
    expect(screen.getByTestId('studio-pitch').className).toContain('shadow-[inset_0_0_60px');
  });

  it('zayıf cihazda (2 çekirdek) saha iç gölgesi kısılır', () => {
    setCores(2);
    renderStudio();
    expect(screen.getByTestId('studio-pitch').className).not.toContain('shadow-[inset_0_0_60px');
  });
});
