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

// Kadroda YALNIZ 'u-active' var (#7). Taktikteki 'u-gone' artık kadroda değil.
vi.mock('../../../services/teamSocialService', () => ({
  getMyTeams: vi.fn(async () => [{
    team_id: 'team-1', name: 'Kartallar', short_name: 'KRT', color1: '#ef4444',
    my_role: 'ADMIN', member_count: 1, wins: 0, draws: 0, losses: 0, is_archived: false, city: null,
  }]),
  getTeamSquad: vi.fn(async () => [
    { user_id: 'u-active', full_name: 'Aktif Oyuncu', pos: 'GK', fp: 80, jersey_number: 7 },
  ]),
  formatLabel: (s: unknown) => String(s),
}));

const SLOTS = JSON.stringify([
  { id: 's1', x: 50, y: 90, role: 'GK', player: { id: 'u-active', name: 'Aktif Oyuncu', role: 'GK', jersey: 7 } },
  { id: 's2', x: 50, y: 25, role: 'FWD', player: { id: 'u-gone', name: 'Ayrilan Oyuncu', role: 'FWD' } },
]);
const TAC_ROW = {
  id: 'tac-x', name: 'Takım Planı', size: '7v7', formation: '2-3-1',
  slots: SLOTS, subs: '[]', opponents: '[]', drawings: '[]',
  captainId: null, notes: '', mentality: 'Balanced', tempo: '5', identity: 'BALANCED',
  status: 'APPROVED', teamId: 'team-1', teamName: 'Kartallar',
};

vi.mock('../../../services/tacticSocialService', () => ({
  logStudioEvent: vi.fn(),
  saveTeamTactic: vi.fn(), approveTacticRpc: vi.fn(), rejectTacticRpc: vi.fn(),
  getTacticById: vi.fn(async () => TAC_ROW), setTacticShareLink: vi.fn(), tacticShareUrl: vi.fn(() => ''),
  getTeamTacticsShowcase: vi.fn(async () => []), setActiveTactic: vi.fn(),
}));
vi.mock('../../../services/teamChatService', () => ({ sendTeamMessage: vi.fn(), tacticMessageBody: vi.fn(() => '') }));
vi.mock('../../../services/socialService', () => ({ getFriends: vi.fn(async () => []), getFriendLists: vi.fn(async () => []) }));

// Yerel store mock'u — studioContext ile takım taktiği yüklenecek
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

// ─── Forma numaraları + bayat kadro tespiti / eşitleme ────────────────────────

describe('Studio — forma numarası ve kadro eşitleme', () => {
  beforeEach(() => {
    useAppStore.setState({ studioContext: { tacticId: 'tac-x' }, selectedTeamId: null });
  });

  it('artık kadroda olmayan oyuncu için uyarı bandı ve forma numarası gösterilir', async () => {
    render(<Studio onBack={vi.fn()} onNavigate={vi.fn()} />);
    // Bayat oyuncu bandı
    expect(await screen.findByText('1 oyuncu artık kadroda değil')).toBeInTheDocument();
    // Kadrodaki oyuncunun forma numarası (#7) sahada rozet olarak görünür
    expect(screen.getByText('7')).toBeInTheDocument();
  });

  it('"Kadroyla eşitle" güncel kadroyla dizer ve uyarı kalkar', async () => {
    render(<Studio onBack={vi.fn()} onNavigate={vi.fn()} />);
    await screen.findByText('1 oyuncu artık kadroda değil');

    fireEvent.click(screen.getByRole('button', { name: 'Kadroyla eşitle' }));
    await waitFor(() =>
      expect(screen.queryByText('1 oyuncu artık kadroda değil')).not.toBeInTheDocument());
  });
});
