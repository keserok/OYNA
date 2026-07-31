import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

// ─── Kalıp mocklar (StudioOnboarding ile aynı desen) ─────────────────────────
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
  };
});

vi.mock('../../../supabaseClient', () => {
  const query: any = {
    select: vi.fn(() => query),
    eq: vi.fn(async () => ({ data: [], count: 2, error: null })),
  };
  return { supabase: { from: vi.fn(() => query) } };
});

vi.mock('../../../hooks/useImageUpload', () => ({
  useImageUpload: () => ({ uploadImage: vi.fn(async () => ''), uploading: false, progress: 0 }),
}));

const profileFixture = {
  id: 'u1',
  email: 'deneme@oyna.app',
  full_name: 'Deneme Oyuncu',
  avatar_url: '',
  role: 'PLAYER',
  roles: ['PLAYER'],
  verification_status: 'approved',
  is_admin: false,
  walletBalance: 150,
  stats: { matchesPlayed: 3 },
  selfSkill: 7,
  position: 'Stoper',
  bio: 'Merhaba dünya',
  birthdate: '2000-01-01',
  trustScore: 4,
  gender: 'erkek',
  playStyle: 'rahat',
  ageRange: null,
  hasCompletedOnboarding: true,
};

vi.mock('../../../services/userService', () => ({
  getFullUserProfile: vi.fn(async () => ({ ...profileFixture })),
  getMatchHistory: vi.fn(async () => [
    { id: 'm1', date: '2026-07-20', pitchName: 'Arena', score: '3 - 2', result: 'WIN' },
  ]),
}));

vi.mock('../../../services/friendService', () => ({
  fetchFriends: vi.fn(async () => [{ id: 'f1' }]),
}));

const updateUserAppProfileAdmin = vi.fn(async () => {});
const adjustWalletBalanceAdmin = vi.fn(async () => {});
// Anonim akran puanları — RPC çıktısında puanlayan kimliği YOK (sözleşme).
const fetchPlayerPeerScoresAdmin = vi.fn(async () => ({
  count: 3,
  average: 7.67,
  motmCount: 1,
  selfSkill: 7,
  recent: [
    { score: 9, fairPlay: null, at: '2026-07-21T20:00:00Z', matchId: 'm1', matchTitle: 'Salı Maçı' },
    { score: 7, fairPlay: 4, at: '2026-07-14T20:00:00Z', matchId: 'm2', matchTitle: null },
  ],
}));
vi.mock('../../../admin-panel/services/adminService', () => ({
  updateUserAppProfileAdmin: (...args: unknown[]) => updateUserAppProfileAdmin(...(args as [])),
  adjustWalletBalanceAdmin: (...args: unknown[]) => adjustWalletBalanceAdmin(...(args as [])),
  fetchPlayerPeerScoresAdmin: (...args: unknown[]) => fetchPlayerPeerScoresAdmin(...(args as [])),
  toTurkishAdminError: (e: unknown) => String(e),
}));

const toastSuccess = vi.fn();
const toastError = vi.fn();
vi.mock('../../../admin-panel/views/context/AdminToastContext', () => ({
  useAdminToast: () => ({ success: toastSuccess, error: toastError }),
}));

import { UserProfileMirror } from '../../../admin-panel/views/components/UserProfileMirror';

describe('Kullanıcı Profili Aynası (admin)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('uygulama profil ekranını kullanıcı verisiyle birebir çizer', async () => {
    render(<UserProfileMirror userId="u1" />);
    // Hero: isim + bio + ayna şeridi
    expect(await screen.findByText('Deneme Oyuncu')).toBeInTheDocument();
    expect(screen.getByText('Merhaba dünya')).toBeInTheDocument();
    expect(screen.getByText('CANLI AYNA')).toBeInTheDocument();
    // Kısayollar: cüzdan bakiyesi + en-iyi-çaba sayaçlar.
    // Tasarım 3a: değerler çıplak sayı — etiket ("Takımları") zaten ne olduğunu söylüyor.
    expect(screen.getByText('150 ₺')).toBeInTheDocument();
    expect(screen.getByText('Takımları').closest('div')?.textContent).toContain('2');
    expect(screen.getByText('Arkadaşları').closest('div')?.textContent).toContain('1');
    // Maç geçmişi kartı (uygulamadaki bileşen)
    expect(screen.getByText('Arena')).toBeInTheDocument();
  });

  it('Düzenle → uygulamanın ProfileEditSheet\'i açılır, Kaydet audit\'li admin RPC\'sine gider', async () => {
    render(<UserProfileMirror userId="u1" />);
    await screen.findByText('Deneme Oyuncu');

    fireEvent.click(screen.getByRole('button', { name: /Düzenle/ }));
    // Uygulamadaki alt sayfanın alanları (tek kaynak bileşen)
    expect(await screen.findByText('Doğum Tarihi')).toBeInTheDocument();
    expect(screen.getByText('Oyun Stili')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Kaydet' }));
    await waitFor(() => expect(updateUserAppProfileAdmin).toHaveBeenCalledTimes(1));
    const [userId, fields] = updateUserAppProfileAdmin.mock.calls[0] as [string, Record<string, unknown>];
    expect(userId).toBe('u1');
    expect(fields).toMatchObject({
      position: 'Stoper',
      bio: 'Merhaba dünya',
      birthdate: '2000-01-01',
      gender: 'erkek',
      play_style: 'rahat',
    });
  });

  it('Cüzdan kısayolu ledger\'lı bakiye düzeltme akışını açar ve RPC\'yi çağırır', async () => {
    render(<UserProfileMirror userId="u1" />);
    await screen.findByText('Deneme Oyuncu');

    fireEvent.click(screen.getByRole('button', { name: /Cüzdan/ }));
    expect(await screen.findByText('Bakiye Düzeltme')).toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText(/Tutar/), { target: { value: '250' } });
    fireEvent.change(screen.getByPlaceholderText(/Sebep/), { target: { value: 'test iadesi' } });
    fireEvent.click(screen.getByRole('button', { name: /Düzeltmeyi İşle/ }));

    await waitFor(() => expect(adjustWalletBalanceAdmin).toHaveBeenCalledWith('u1', 250, 'test iadesi'));
  });

  it('Yönetici Alanları: güven puanı /20 ölçeğiyle gönderilir (beceri alanı SÖKÜLDÜ)', async () => {
    render(<UserProfileMirror userId="u1" />);
    await screen.findByText('Deneme Oyuncu');

    fireEvent.click(screen.getByRole('button', { name: /Yönetici Alanları/ }));
    // Puan sistemi sökümü (20260831000000): "Beceri Puanı" girişi artık YOK —
    // admin bir oyuncunun beceri puanını yazamaz; akran puanları ayrı panelde
    // salt-okunur görünür. Alanın geri sızmadığını da sabitle.
    expect(screen.queryByPlaceholderText('örn. 3.8')).not.toBeInTheDocument();
    const slider = await screen.findByRole('slider');
    fireEvent.change(slider, { target: { value: '60' } });

    fireEvent.click(screen.getByRole('button', { name: 'Yönetici Alanlarını Kaydet' }));
    await waitFor(() => expect(updateUserAppProfileAdmin).toHaveBeenCalledTimes(1));
    const [, fields] = updateUserAppProfileAdmin.mock.calls[0] as [string, Record<string, unknown>];
    expect(fields).toMatchObject({ trust_score: 3 }); // 60/20 = 3
    expect(fields).not.toHaveProperty('skill_rating');
  });

  it('Alınan Akran Puanları paneli: aç → RPC çağrılır, özet + son puanlar anonim listelenir', async () => {
    render(<UserProfileMirror userId="u1" />);
    await screen.findByText('Deneme Oyuncu');

    // Panel kapalıyken RPC ÇAĞRILMAZ (her ayna açılışında bedava sorgu yok)
    expect(fetchPlayerPeerScoresAdmin).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: /Alınan Akran Puanları/ }));
    await waitFor(() => expect(fetchPlayerPeerScoresAdmin).toHaveBeenCalledWith('u1'));

    // Özet: ortalama TEK ondalıkla basılır (7.67 → 7.7)
    expect(await screen.findByText('7.7')).toBeInTheDocument();
    expect(screen.getByText('MVP')).toBeInTheDocument();
    // Öz beyan BANDI (ham 7 değil, ORTA) — hero'daki band çipiyle çakışabilir,
    // en az bir tane olması yeterli
    expect(screen.getAllByText('ORTA').length).toBeGreaterThan(0);
    // Son puanlar: maç adı + skor; puanlayan kimliği HİÇBİR yerde yok
    expect(screen.getByText(/Salı Maçı/)).toBeInTheDocument();
    expect(screen.getByText('9/10')).toBeInTheDocument();
    expect(screen.getByText(/Puanlayan kimliği gösterilmez/)).toBeInTheDocument();
  });
});
