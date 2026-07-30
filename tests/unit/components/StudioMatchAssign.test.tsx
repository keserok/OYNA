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
    motion: motionProxy, AnimatePresence: ({ children }: any) => children,
    MotionConfig: ({ children }: any) => children, useReducedMotion: () => false,
    Reorder: { Group: ({ children }: any) => React.createElement('div', null, children), Item: ({ children }: any) => React.createElement('div', null, children) },
  };
});

const ROW = {
  id: 'tac-1', name: 'Takım Planı', size: '7v7', formation: '2-3-1',
  slots: JSON.stringify([{ id: 's1', x: 50, y: 90, role: 'GK', player: { id: 'p1', name: 'Kaleci', role: 'GK' } }]),
  subs: '[]', opponents: '[]', drawings: '[]',
  captainId: null, notes: '', mentality: 'Balanced', tempo: '5', identity: 'BALANCED',
  status: 'APPROVED', teamId: 'team-1', teamName: 'Kartallar', updatedAt: '2026-07-21T09:00:00Z',
};

vi.mock('../../../supabaseClient', () => {
  const query: any = { select: vi.fn(() => query), eq: vi.fn(async () => ({ data: [ROW], error: null })) };
  const channel: any = { on: vi.fn(() => channel), subscribe: vi.fn(() => channel) };
  return { supabase: { from: vi.fn(() => query), channel: vi.fn(() => channel), removeChannel: vi.fn() } };
});
vi.mock('../../../services/teamSocialService', () => ({
  getMyTeams: vi.fn(async () => [{
    team_id: 'team-1', name: 'Kartallar', short_name: 'KRT', color1: '#ef4444',
    my_role: 'ADMIN', member_count: 7, wins: 0, draws: 0, losses: 0, is_archived: false, city: null,
  }]),
  getTeamSquad: vi.fn(async () => []), formatLabel: (s: unknown) => String(s),
}));

// Yaklaşan maç + atama spy'ı
const { assignMock } = vi.hoisted(() => ({ assignMock: vi.fn(async () => undefined) }));
vi.mock('../../../services/teamService', () => ({
  fetchTeamNextMatch: vi.fn(async () => ({
    id: 'match-1', date: '2026-08-01', time: '20:00', opponentName: 'Rakip FK', opponentShort: 'RFK',
  })),
}));
vi.mock('../../../services/tacticSocialService', () => ({
  logStudioEvent: vi.fn(),
  saveTeamTactic: vi.fn(async () => ({ tacticId: 'tac-1', status: 'APPROVED', updatedAt: '2026-07-21T11:00:00Z' })),
  assignMatchTactic: assignMock,
  approveTacticRpc: vi.fn(), rejectTacticRpc: vi.fn(),
  getTacticById: vi.fn(async () => ROW), setTacticShareLink: vi.fn(), tacticShareUrl: vi.fn(() => ''),
  getTeamTacticsShowcase: vi.fn(async () => []), setActiveTactic: vi.fn(),
}));
vi.mock('../../../services/teamChatService', () => ({ sendTeamMessage: vi.fn(), tacticMessageBody: vi.fn(() => '') }));
vi.mock('../../../services/socialService', () => ({ getFriends: vi.fn(async () => []), getFriendLists: vi.fn(async () => []) }));

const { store } = vi.hoisted(() => ({ store: { state: { studioContext: null as any, selectedTeamId: null as string | null } } }));
vi.mock('../../../store', () => {
  const s = store.state;
  s.setStudioContext = (c: any) => { s.studioContext = c; };
  s.setSelectedTeamId = (id: string | null) => { s.selectedTeamId = id; };
  const hook: any = (sel?: (st: any) => any) => (sel ? sel(s) : s);
  hook.getState = () => s; hook.setState = (patch: any) => Object.assign(s, patch);
  return { useAppStore: hook };
});

import Studio from '../../../views/Studio';
import { useAppStore } from '../../../store';

// ─── Kaydederken maça ata ─────────────────────────────────────────────────────

const openSaveModal = async () => {
  fireEvent.click(await screen.findByRole('button', { name: /TAKIMA KAYDET/ }));
};

describe('Studio — kaydederken maça ata', () => {
  beforeEach(() => {
    assignMock.mockClear();
    useAppStore.setState({ studioContext: { tacticId: 'tac-1' }, selectedTeamId: null });
  });

  it('yönetici + takım + yaklaşan maçta atama anahtarı çıkar; açıkça atama yapılır', async () => {
    render(<Studio onBack={vi.fn()} onNavigate={vi.fn()} />);
    await screen.findAllByText('Takım Planı');
    await openSaveModal();

    // Atama anahtarı (yaklaşan maç bilgisiyle)
    const toggle = await screen.findByText('Yaklaşan maça ata');
    expect(screen.getByText(/Rakip FK/)).toBeInTheDocument();
    fireEvent.click(toggle);

    fireEvent.click(screen.getByRole('button', { name: 'KAYDET' }));
    await waitFor(() => expect(assignMock).toHaveBeenCalledWith('match-1', 'tac-1'));
  });

  it('anahtar kapalıyken atama yapılmaz', async () => {
    render(<Studio onBack={vi.fn()} onNavigate={vi.fn()} />);
    await screen.findAllByText('Takım Planı');
    await openSaveModal();
    await screen.findByText('Yaklaşan maça ata'); // görünür ama dokunulmadı

    fireEvent.click(screen.getByRole('button', { name: 'KAYDET' }));
    await waitFor(() => expect(screen.queryByText('TAKTİĞİ KAYDET')).not.toBeInTheDocument());
    expect(assignMock).not.toHaveBeenCalled();
  });
});
