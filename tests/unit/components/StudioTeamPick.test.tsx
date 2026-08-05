import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

// ─── Stüdyoyu jsdom'da mount etmek için dosya-düzeyi mock'lar ─────────────────
// (StudioLibrary.test ile aynı desen.)

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

// Takım listesi testten teste değişebilsin diye hoisted mock.
const { getMyTeams, getTeamSquad } = vi.hoisted(() => ({
  getMyTeams: vi.fn(async () => [] as any[]),
  getTeamSquad: vi.fn(async () => [] as any[]),
}));

vi.mock('../../../services/teamSocialService', () => ({
  getMyTeams,
  getTeamSquad,
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
  getTeamTacticsShowcase: vi.fn(async () => []),
  setActiveTactic: vi.fn(),
  assignMatchTactic: vi.fn(),
  deleteMyTactic: vi.fn(),
  TacticConflictError: class TacticConflictError extends Error {},
}));
vi.mock('../../../services/teamService', () => ({ fetchTeamNextMatch: vi.fn(async () => null) }));
vi.mock('../../../services/teamChatService', () => ({ sendTeamMessage: vi.fn(), tacticMessageBody: vi.fn(() => '') }));
vi.mock('../../../services/socialService', () => ({ getFriends: vi.fn(async () => []), getFriendLists: vi.fn(async () => []) }));

import Studio from '../../../views/Studio';

const TEAM = {
  team_id: 'team-1', name: 'Kartallar', short_name: 'KRT', color1: '#ef4444',
  my_role: 'ADMIN', member_count: 7, wins: 3, draws: 1, losses: 2,
  is_archived: false, city: null,
};

const onNavigate = vi.fn();
const renderStudio = () => render(<Studio onBack={vi.fn()} onNavigate={onNavigate} />);

beforeEach(() => {
  onNavigate.mockClear();
  getMyTeams.mockResolvedValue([TEAM] as any);
});

// ─── Takım seçimi akışı (2026-08-04, kullanıcı kararı) ───────────────────────
// Tek onay düğmesi + "Kişisel" (takımsız) kartı + takımsız kullanıcı için
// yol gösteren boş durum. Karttaki G/B/M satırı kaldırıldı.

describe('Studio — takım seçimi', () => {
  it('şeridin başında "Kişisel" kartı vardır ve varsayılan seçilidir', async () => {
    renderStudio();
    expect(await screen.findByText('Kişisel')).toBeInTheDocument();
    expect(screen.getByText('Takımsız çalış')).toBeInTheDocument();
    // Takımsızken düğme kişisel akışı anlatır
    expect(screen.getByRole('button', { name: /KİŞİSEL OLARAK DEVAM ET/ })).toBeInTheDocument();
  });

  it('takım seçilince tek onay düğmesi "KADROYU DİZ VE ONAYLA" olur', async () => {
    renderStudio();
    fireEvent.click(await screen.findByText('Kartallar'));
    expect(await screen.findByRole('button', { name: /KADROYU DİZ VE ONAYLA/ })).toBeInTheDocument();
    // Eski iki ayrı düğme kalmadı
    expect(screen.queryByRole('button', { name: /SEÇİLİ TAKIMI ONAYLA/ })).not.toBeInTheDocument();
  });

  it('kart üzerinde galibiyet/beraberlik/mağlubiyet satırı yoktur', async () => {
    renderStudio();
    await screen.findByText('Kartallar');
    expect(screen.queryByText(/3G\s*1B\s*2M/)).not.toBeInTheDocument();
    // "hazır" sayacı kalmalı — karar verdiren bilgi bu
    expect(screen.getByText('hazır', { exact: false })).toBeInTheDocument();
  });

  it('"Kişisel" ile onaylayınca çip Kişisel gösterir ve geri dönülebilir', async () => {
    renderStudio();
    await screen.findByText('Kartallar');
    fireEvent.click(screen.getByRole('button', { name: /KİŞİSEL OLARAK DEVAM ET/ }));

    // Onaylı çip "Kişisel" der; "Değiştir" ile seçime dönülür
    await waitFor(() => expect(screen.getByRole('button', { name: 'Değiştir' })).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: 'Değiştir' }));
    expect(await screen.findByText('Takımsız çalış')).toBeInTheDocument();
  });

  it('takım seçip onaylayınca kadro dizilir ve takım çipi görünür', async () => {
    getTeamSquad.mockResolvedValue([
      { user_id: 'u1', full_name: 'Ali Veli', pos: 'GK', jersey: 1 },
    ] as any);
    renderStudio();
    fireEvent.click(await screen.findByText('Kartallar'));
    fireEvent.click(await screen.findByRole('button', { name: /KADROYU DİZ VE ONAYLA/ }));

    await waitFor(() => expect(screen.getByRole('button', { name: 'Değiştir' })).toBeInTheDocument());
    expect(screen.getAllByText('Kartallar').length).toBeGreaterThan(0);
  });

  it('takımı olmayan kullanıcıya yol gösterilir (Sosyal\'e git)', async () => {
    getMyTeams.mockResolvedValue([] as any);
    renderStudio();
    expect(await screen.findByText('Henüz bir takımın yok')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Sosyal'e git/ }));
    expect(onNavigate).toHaveBeenCalledWith('SOCIAL');
  });
});

// ─── Kaydet penceresi: hedef seçici (2026-08-04, kullanıcı kararı) ───────────
// Eskiden hedef yalnız GÖSTERİLİYORDU; artık son anda değiştirilebiliyor.

describe('Studio — kaydet hedefi', () => {
  /** Kaydet düğmesi kaleci ister → takımı kadrosuyla onaylayıp pencereyi aç. */
  const confirmTeamAndOpenSave = async () => {
    getTeamSquad.mockResolvedValue([
      { user_id: 'u1', full_name: 'Ali Veli', pos: 'GK', jersey: 1 },
    ] as any);
    renderStudio();
    fireEvent.click(await screen.findByText('Kartallar'));
    fireEvent.click(await screen.findByRole('button', { name: /KADROYU DİZ VE ONAYLA/ }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Değiştir' })).toBeInTheDocument());

    fireEvent.click(await screen.findByRole('button', { name: /KAYDET/ }));
    return screen.findByRole('heading', { name: /TAKTİĞİ KAYDET/ });
  };

  it('hedef çipleri vardır: Kütüphanem + üyesi olunan takımlar', async () => {
    await confirmTeamAndOpenSave();

    expect(screen.getByText('Nereye kaydedilsin?')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Kütüphanem/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /KRT/ })).toBeInTheDocument();
  });

  it('hedef son anda değiştirilebilir: takım ⇄ kişisel', async () => {
    await confirmTeamAndOpenSave();

    // Takım seçiliyken önizleme oyun defterini gösterir
    expect(screen.getByText('oyun defterine', { exact: false })).toBeInTheDocument();

    // Kişiseline dönüş — eskiden bu yol YOKTU
    fireEvent.click(screen.getByRole('button', { name: /Kütüphanem/ }));
    await waitFor(() => expect(screen.getByText('Kişisel kütüphanene')).toBeInTheDocument());

    // Ve geri takıma
    fireEvent.click(screen.getByRole('button', { name: /KRT/ }));
    await waitFor(() => expect(screen.getByText('oyun defterine', { exact: false })).toBeInTheDocument());
  });
});
