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
  id: 'tac-1', name: 'Kayıtlı Plan', size: '7v7', formation: '2-3-1',
  slots: JSON.stringify([{ id: 's1', x: 50, y: 90, role: 'GK', player: { id: 'p1', name: 'Kaleci', role: 'GK', rating: 70 } }]),
  subs: '[]', opponents: '[]', drawings: '[]',
  captainId: null, notes: '', mentality: 'Balanced', tempo: '5', identity: 'BALANCED',
  status: 'APPROVED', teamId: null, teamName: null, updatedAt: '2026-07-21T09:00:00Z',
};

vi.mock('../../../supabaseClient', () => {
  const query: any = { select: vi.fn(() => query), eq: vi.fn(async () => ({ data: [ROW], error: null })) };
  const channel: any = { on: vi.fn(() => channel), subscribe: vi.fn(() => channel) };
  return { supabase: { from: vi.fn(() => query), channel: vi.fn(() => channel), removeChannel: vi.fn() } };
});
vi.mock('../../../services/teamSocialService', () => ({
  getMyTeams: vi.fn(async () => []), getTeamSquad: vi.fn(async () => []), formatLabel: (s: unknown) => String(s),
}));

// Kontrol edilebilir save mock'u + gerçek TacticConflictError sınıfı (hoisted)
const { saveMock, TacticConflictError } = vi.hoisted(() => {
  class TacticConflictError extends Error { code = 'CONFLICT' as const; constructor() { super('değişti'); this.name = 'TacticConflictError'; } }
  return { saveMock: vi.fn(), TacticConflictError };
});
vi.mock('../../../services/tacticSocialService', () => ({
  logStudioEvent: vi.fn(),
  saveTeamTactic: saveMock,
  approveTacticRpc: vi.fn(), rejectTacticRpc: vi.fn(),
  getTacticById: vi.fn(async () => ROW), setTacticShareLink: vi.fn(), tacticShareUrl: vi.fn(() => ''),
  getTeamTacticsShowcase: vi.fn(async () => []), setActiveTactic: vi.fn(),
  TacticConflictError,
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

// ─── İyimser kilit: kaydederken çakışma → "üzerine yaz / yenile" diyaloğu ─────

describe('Studio — kayıt çakışması', () => {
  beforeEach(() => {
    saveMock.mockReset();
    useAppStore.setState({ studioContext: { tacticId: 'tac-1' }, selectedTeamId: null });
  });

  it('CONFLICT → diyalog çıkar; "üzerine yaz" force ile yeniden kaydeder', async () => {
    saveMock
      .mockRejectedValueOnce(new TacticConflictError())         // ilk kayıt: çakışma
      .mockResolvedValueOnce({ tacticId: 'tac-1', status: 'APPROVED', updatedAt: '2026-07-21T11:00:00Z' }); // force

    render(<Studio onBack={vi.fn()} onNavigate={vi.fn()} />);
    await screen.findAllByText('Kayıtlı Plan'); // taktik yüklendi

    // Kaydet penceresini aç (alt bar birincil aksiyon)
    fireEvent.click(screen.getByRole('button', { name: /KÜTÜPHANEME KAYDET/ }));
    // Penceredeki KAYDET (tam ad)
    fireEvent.click(await screen.findByRole('button', { name: 'KAYDET' }));

    // Çakışma diyaloğu
    expect(await screen.findByText('Taktik bu arada değişti')).toBeInTheDocument();

    // İlk çağrı expectedUpdatedAt ile yapıldı (kilit devrede)
    expect(saveMock.mock.calls[0][2]).toEqual(expect.objectContaining({ expectedUpdatedAt: '2026-07-21T09:00:00Z' }));

    // Üzerine yaz → force (expectedUpdatedAt null)
    fireEvent.click(screen.getByRole('button', { name: /üzerine yaz/i }));
    await waitFor(() => expect(saveMock).toHaveBeenCalledTimes(2));
    expect(saveMock.mock.calls[1][2]).toEqual(expect.objectContaining({ expectedUpdatedAt: null }));
    await waitFor(() => expect(screen.queryByText('Taktik bu arada değişti')).not.toBeInTheDocument());
  });
});
