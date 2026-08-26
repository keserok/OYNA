import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';

// ─── Stüdyoyu jsdom'da mount etmek için dosya-düzeyi mock'lar ─────────────────
// (StudioLayerSwitch.test ile aynı desen.)

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

const renderStudio = () => render(<Studio onBack={vi.fn()} onNavigate={vi.fn()} />);

/** Rakipleri sahaya diz (aynala) → R1..R7 oluşur. */
const placeOpponents = () => fireEvent.click(screen.getByTitle(/Rakip takımı sahaya diz/));
/** Araç çubuğundaki çöp kutusu → temizle sayfası. */
const openClearSheet = () => fireEvent.click(screen.getByTitle('Temizle'));
/** Seçim listesindeki satırlar (yalnız sheet içi — sahadaki markörler karışmasın). */
const pickList = () => within(screen.getByTestId('clear-pick-list'));

// ─── Üst başlık (2026-08-04, kullanıcı kararı) ───────────────────────────────
// Başlıkta artık plan adı ve "diziliş · boyut" satırı yok; sabit "Stüdyo" yazar.
describe('Studio — üst başlık', () => {
  it('sabit "Stüdyo" yazar; plan adı ve diziliş·boyut satırı başlıkta yoktur', () => {
    renderStudio();
    expect(screen.getByRole('heading', { name: 'Stüdyo' })).toBeInTheDocument();
    // Eski alt satır ("2-3-1 · 7v7") kalkmış olmalı
    expect(screen.queryByText('2-3-1 · 7v7')).not.toBeInTheDocument();
  });
});

// ─── Temizle: tek tek seçip silme (2026-08-04, kullanıcı kararı) ──────────────
// "Sadece çizimler" / "Sadece rakipler" artık doğrudan silmez: listeler, kullanıcı
// işaretler, alttaki "Seçilenleri sil" kaldırır. "Hepsini sil" de aynı listededir.
describe('Studio — temizle sayfası seçerek silme', () => {
  it('"Sadece rakipler" doğrudan silmez; listeyi açar', () => {
    renderStudio();
    placeOpponents();
    openClearSheet();

    fireEvent.click(screen.getByRole('button', { name: /Sadece rakipler/ }));

    // Liste açıldı: 7 rakip satırı
    expect(screen.getByTestId('clear-pick-list')).toBeInTheDocument();
    expect(pickList().getByRole('button', { name: 'R1' })).toBeInTheDocument();
    expect(pickList().getAllByRole('button').length).toBe(7);
    // Hiçbiri silinmedi
    expect(screen.getByRole('button', { name: /Hepsini sil \(7\)/ })).toBeInTheDocument();
  });

  it('seçim yokken "Seçilenleri sil" pasiftir', () => {
    renderStudio();
    placeOpponents();
    openClearSheet();
    fireEvent.click(screen.getByRole('button', { name: /Sadece rakipler/ }));

    expect(screen.getByRole('button', { name: /Seçilenleri sil/ })).toBeDisabled();
  });

  it('işaretlenen rakipler silinir, diğerleri kalır', () => {
    renderStudio();
    placeOpponents();
    openClearSheet();
    fireEvent.click(screen.getByRole('button', { name: /Sadece rakipler/ }));

    fireEvent.click(pickList().getByRole('button', { name: 'R1' }));
    fireEvent.click(pickList().getByRole('button', { name: 'R3' }));

    const del = screen.getByRole('button', { name: /Seçilenleri sil \(2\)/ });
    expect(del).toBeEnabled();
    fireEvent.click(del);

    // Sayfa kapandı; yeniden açınca 7 değil 5 rakip görünür
    openClearSheet();
    fireEvent.click(screen.getByRole('button', { name: /Sadece rakipler/ }));
    expect(pickList().getAllByRole('button').length).toBe(5);
    expect(pickList().queryByRole('button', { name: 'R1' })).not.toBeInTheDocument();
    expect(pickList().queryByRole('button', { name: 'R3' })).not.toBeInTheDocument();
    expect(pickList().getByRole('button', { name: 'R2' })).toBeInTheDocument();
  });

  it('"Tümünü işaretle" hepsini seçer, tekrar basınca işaretleri kaldırır', () => {
    renderStudio();
    placeOpponents();
    openClearSheet();
    fireEvent.click(screen.getByRole('button', { name: /Sadece rakipler/ }));

    fireEvent.click(screen.getByRole('button', { name: 'Tümünü işaretle' }));
    expect(screen.getByRole('button', { name: /Seçilenleri sil \(7\)/ })).toBeEnabled();

    fireEvent.click(screen.getByRole('button', { name: 'İşaretleri kaldır' }));
    expect(screen.getByRole('button', { name: /Seçilenleri sil/ })).toBeDisabled();
  });

  it('"Hepsini sil" listedeki her şeyi kaldırır', () => {
    renderStudio();
    placeOpponents();
    openClearSheet();
    fireEvent.click(screen.getByRole('button', { name: /Sadece rakipler/ }));
    fireEvent.click(screen.getByRole('button', { name: /Hepsini sil \(7\)/ }));

    // Rakip kalmadı → ana menüde "Sadece rakipler" pasif
    openClearSheet();
    expect(screen.getByRole('button', { name: /Sadece rakipler/ })).toBeDisabled();
  });

  it('geri düğmesi seçim listesinden ana menüye döner', () => {
    renderStudio();
    placeOpponents();
    openClearSheet();
    fireEvent.click(screen.getByRole('button', { name: /Sadece rakipler/ }));
    expect(screen.getByTestId('clear-pick-list')).toBeInTheDocument();

    // Studio'nun ekran-geneli geri butonu da artık erişilebilir adla ("Geri",
    // 26 Ağu erişilebilirlik süprümü) — seçim listesinin KENDİ geri düğmesini
    // stüdyo başlığındakinden ayırarak tıkla.
    const geriDugmeleri = screen.getAllByRole('button', { name: 'Geri' });
    const listeGeri = geriDugmeleri.find((b) => b.id !== 'studio-back-button');
    expect(listeGeri).toBeTruthy();
    fireEvent.click(listeGeri!);
    expect(screen.queryByTestId('clear-pick-list')).not.toBeInTheDocument();
    expect(screen.getByText('Neyi temizleyelim?')).toBeInTheDocument();
  });
});
