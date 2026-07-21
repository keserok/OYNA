import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

// ─── Stüdyoyu jsdom'da mount etmek için dosya-düzeyi mock'lar ─────────────────

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

// Kişisel taktikler: supabase.from('tactics').select('*').eq('userId', ...) → data
const MINE_ROW = {
  id: 'mine-1', name: 'Kişisel Plan', size: '11v11', formation: '4-4-2',
  slots: '[]', subs: '[]', opponents: '[]', drawings: '[]',
  captainId: null, notes: '', mentality: 'Balanced', tempo: '5', identity: 'BALANCED',
  status: 'APPROVED', teamId: null, teamName: null,
};

vi.mock('../../../supabaseClient', () => {
  const query: any = {
    select: vi.fn(() => query),
    eq: vi.fn(async () => ({ data: [MINE_ROW], error: null })),
  };
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

const { getShowcase } = vi.hoisted(() => ({
  getShowcase: vi.fn(async () => [
    { id: 'team-tac-1', name: 'Takım Aktif Planı', formation: '2-3-1', size: '7v7', status: 'APPROVED', is_active: true },
    { id: 'team-tac-2', name: 'Bekleyen Öneri', formation: '3-2-1', size: '7v7', status: 'PENDING_APPROVAL', is_active: false },
  ]),
}));

vi.mock('../../../services/tacticSocialService', () => ({
  logStudioEvent: vi.fn(),
  saveTeamTactic: vi.fn(),
  approveTacticRpc: vi.fn(),
  rejectTacticRpc: vi.fn(),
  getTacticById: vi.fn(async () => ({ ...MINE_ROW, id: 'team-tac-1', name: 'Takım Aktif Planı', size: '7v7', formation: '2-3-1', teamId: 'team-1' })),
  setTacticShareLink: vi.fn(),
  tacticShareUrl: vi.fn(() => ''),
  getTeamTacticsShowcase: getShowcase,
  setActiveTactic: vi.fn(),
}));
vi.mock('../../../services/teamChatService', () => ({ sendTeamMessage: vi.fn(), tacticMessageBody: vi.fn(() => '') }));
vi.mock('../../../services/socialService', () => ({ getFriends: vi.fn(async () => []), getFriendLists: vi.fn(async () => []) }));

import Studio from '../../../views/Studio';

// ─── Birleşik Taktik Kütüphanesi ─────────────────────────────────────────────

const renderStudio = () => render(<Studio onBack={vi.fn()} onNavigate={vi.fn()} />);
const openLibrary = () => fireEvent.click(screen.getByRole('button', { name: /TAKTİKLER/ }));

describe('Studio — Taktik Kütüphanesi', () => {
  it('Kütüphanem sekmesi kişisel taktikleri listeler; takım sekmesi çıkar', async () => {
    renderStudio();
    openLibrary();
    expect(await screen.findByText('TAKTİK KÜTÜPHANESİ')).toBeInTheDocument();
    expect(await screen.findByText('Kişisel Plan')).toBeInTheDocument();
    // Takım kütüphane sekmesi görünür
    expect(screen.getByTitle('Takım kütüphanesi: Kartallar')).toBeInTheDocument();
  });

  it('takım sekmesine geçince oyun defteri yüklenir; aktif plan yıldızlı, durum rozetli', async () => {
    renderStudio();
    openLibrary();
    await screen.findByText('Kişisel Plan');

    fireEvent.click(screen.getByTitle('Takım kütüphanesi: Kartallar'));
    expect(await screen.findByText('Takım Aktif Planı')).toBeInTheDocument();
    expect(screen.getByText('Bekleyen Öneri')).toBeInTheDocument();
    // Durum rozetleri
    expect(screen.getByText('Onaylı')).toBeInTheDocument();
    expect(screen.getByText('Onay bekliyor')).toBeInTheDocument();
    expect(getShowcase).toHaveBeenCalledWith('team-1');
  });

  it('arama kütüphaneyi süzer', async () => {
    renderStudio();
    openLibrary();
    fireEvent.click(await screen.findByTitle('Takım kütüphanesi: Kartallar'));
    await screen.findByText('Takım Aktif Planı');

    fireEvent.change(screen.getByLabelText('Taktik ara'), { target: { value: 'bekleyen' } });
    expect(screen.queryByText('Takım Aktif Planı')).not.toBeInTheDocument();
    expect(screen.getByText('Bekleyen Öneri')).toBeInTheDocument();
  });

  it('kişisel taktiğe dokununca plan olarak yüklenir (pencere kapanır)', async () => {
    renderStudio();
    openLibrary();
    fireEvent.click(await screen.findByText('Kişisel Plan'));
    await waitFor(() => expect(screen.queryByText('TAKTİK KÜTÜPHANESİ')).not.toBeInTheDocument());
    // Plan sekmelerinde yeni plan adı görünür
    expect(screen.getAllByText('Kişisel Plan').length).toBeGreaterThan(0);
  });
});
