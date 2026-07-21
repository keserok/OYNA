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
  getMyTeams: vi.fn(async () => [{
    team_id: 'team-1', name: 'Kartallar', short_name: 'KRT', color1: '#ef4444',
    my_role: 'ADMIN', member_count: 7, wins: 0, draws: 0, losses: 0, is_archived: false, city: null,
  }]),
  getTeamSquad: vi.fn(async () => []),
  formatLabel: (s: unknown) => String(s),
}));
vi.mock('../../../services/tacticSocialService', () => ({
  saveTeamTactic: vi.fn(), approveTacticRpc: vi.fn(), rejectTacticRpc: vi.fn(),
  getTacticById: vi.fn(async () => null), setTacticShareLink: vi.fn(), tacticShareUrl: vi.fn(() => ''),
  getTeamTacticsShowcase: vi.fn(async () => []), setActiveTactic: vi.fn(),
}));
vi.mock('../../../services/teamChatService', () => ({ sendTeamMessage: vi.fn(), tacticMessageBody: vi.fn(() => '') }));
vi.mock('../../../services/socialService', () => ({ getFriends: vi.fn(async () => []), getFriendLists: vi.fn(async () => []) }));

// Yerel, kontrol edilebilir store mock'u (setup.ts genel mock'unu geçersiz kılar):
// Studio yalnız studioContext / setStudioContext / setSelectedTeamId okur.
const { store } = vi.hoisted(() => ({
  store: { state: { studioContext: null as any, selectedTeamId: null as string | null } },
}));
vi.mock('../../../store', () => {
  const s = store.state;
  s.setStudioContext = (c: any) => { s.studioContext = c; };
  s.setSelectedTeamId = (id: string | null) => { s.selectedTeamId = id; };
  const hook: any = (sel?: (st: any) => any) => (sel ? sel(s) : s);
  hook.getState = () => s;
  hook.setState = (patch: any) => Object.assign(s, patch);
  return { useAppStore: hook };
});

import Studio from '../../../views/Studio';
import { useAppStore } from '../../../store';

// ─── Akıllı geri dönüş ────────────────────────────────────────────────────────

const backBtn = () => document.getElementById('studio-back-button') as HTMLElement;

describe('Studio — akıllı geri dönüş', () => {
  beforeEach(() => {
    useAppStore.setState({ studioContext: null, selectedTeamId: null });
  });

  it('takımdan gelindiğinde geri tuşu takım detayına döner (onBack değil)', async () => {
    useAppStore.getState().setStudioContext({ teamId: 'team-1' });
    const onBack = vi.fn();
    const onNavigate = vi.fn();
    render(<Studio onBack={onBack} onNavigate={onNavigate} />);

    // Bağlam tüketilip takım onaylanınca çipte takım adı görünür
    await screen.findByText('Kartallar');

    fireEvent.click(backBtn());
    expect(onNavigate).toHaveBeenCalledWith('MY_TEAM');
    expect(onBack).not.toHaveBeenCalled();
    expect(useAppStore.getState().selectedTeamId).toBe('team-1');
  });

  it('takım bağlamı yokken geri tuşu normal onBack çağırır', async () => {
    const onBack = vi.fn();
    const onNavigate = vi.fn();
    render(<Studio onBack={onBack} onNavigate={onNavigate} />);
    await waitFor(() => expect(backBtn()).toBeTruthy());

    fireEvent.click(backBtn());
    expect(onBack).toHaveBeenCalledTimes(1);
    expect(onNavigate).not.toHaveBeenCalledWith('MY_TEAM');
  });
});
