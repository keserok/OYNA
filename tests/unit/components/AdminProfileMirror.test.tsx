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

// Gerçek istemcide `.eq()` hem beklenebilir (liste/sayım) hem de `.single()`
// ile zincirlenebilir (tek satır). Mock ikisini birden karşılar: aynanın
// yönetici alanları okuması `.single()` yolundan gelir.
const yoneticiSatiri = {
  phone: '+90 555 111 22 33',
  role: 'PLAYER',
  is_verified: true,
  is_pro: false,
  is_banned: false,
  match_count: 3,
  self_skill: 7,
  age_range: '',
  has_completed_onboarding: true,
  is_searchable: true,
  discoverable_by_phone: true,
  show_online_status: true,
  notification_preferences: { promo_offers: { enabled: false, mandatory: false } },
};

vi.mock('../../../supabaseClient', () => {
  const query: any = {
    select: vi.fn(() => query),
    single: vi.fn(async () => ({ data: yoneticiSatiri, error: null })),
  };
  // `eq` beklenebilir bir "thenable" döndürür ama zincir de kalır.
  query.eq = vi.fn(() => {
    const p: any = Promise.resolve({ data: [], count: 2, error: null });
    p.single = query.single;
    return p;
  });
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
const banUserAdmin = vi.fn(async () => undefined);
vi.mock('../../../admin-panel/services/adminService', () => ({
  updateUserAppProfileAdmin: (...args: unknown[]) => updateUserAppProfileAdmin(...(args as [])),
  adjustWalletBalanceAdmin: (...args: unknown[]) => adjustWalletBalanceAdmin(...(args as [])),
  fetchPlayerPeerScoresAdmin: (...args: unknown[]) => fetchPlayerPeerScoresAdmin(...(args as [])),
  banUserAdmin: (...args: unknown[]) => banUserAdmin(...(args as [])),
  toTurkishAdminError: (e: unknown) => String(e),
}));

// Bildirim adları uygulamanın şablon tablosundan gelir; testte iki anahtarla
// yeter (biri zorunlu, biri değil).
vi.mock('../../../notifications/notificationPreferences', async (orijinal) => {
  const gercek = await orijinal<typeof import('../../../notifications/notificationPreferences')>();
  return {
    ...gercek,
    fetchNotificationTemplates: vi.fn(async () => [
      { type_key: 'match_joined', label_tr: 'Maça alındın', is_mandatory: true, can_user_disable: false, category: 'MATCH', sort_order: 1 },
      { type_key: 'promo_offers', label_tr: 'Kampanya teklifleri', is_mandatory: false, can_user_disable: true, category: 'GENERAL', sort_order: 2 },
    ]),
  };
});

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
    // Uygulamadaki düzenleme ekranının alanları (tek kaynak bileşen).
    // Tasarım 4c: numaralı bölümler + "Doğum tarihi" satırı.
    expect(await screen.findByText('Doğum tarihi')).toBeInTheDocument();
    expect(screen.getByText('01 — Kimlik')).toBeInTheDocument();
    expect(screen.getByText('02 — Oyun')).toBeInTheDocument();
    expect(screen.getByText('03 — Tanıtım')).toBeInTheDocument();
    // Seviye, oyuncunun kendi beyanı — admin aynasında salt-okunur.
    expect(screen.getByText(/değiştirilemez/)).toBeInTheDocument();

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
    // Puan sistemi sökümü (20260730135953): "Beceri Puanı" girişi artık YOK —
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

// ═══════════════════════════════════════════════════════════════════════════
// v4 — AYNADA DÜZENLENEBİLİR YÖNETİCİ ALANLARI (kullanıcı kararı)
// "Üç düzenleme yeri tek yerde birleşsin": Kullanıcılar sayfasındaki derin
// düzenleme penceresi kalktı, alanları buraya taşındı. Kapsam dışı (bilerek):
// cüzdanı doğrudan yazma, admin yetkisi verme, doğrulama durumunu elle değiştirme.
// ═══════════════════════════════════════════════════════════════════════════
describe('Kullanıcı Profili Aynası — yönetici alanları (v4)', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  const paneliAc = async () => {
    render(<UserProfileMirror userId="u1" />);
    await screen.findByText('Deneme Oyuncu');
    fireEvent.click(screen.getByRole('button', { name: /Yönetici Alanları/ }));
    return screen.findByPlaceholderText('+90 5...');
  };

  it('tasinan ve yeni alanlar panelde gorunur', async () => {
    const telefon = await paneliAc();
    expect(telefon).toHaveValue('+90 555 111 22 33');
    // Taşınan alanlar (eski derin düzenleme penceresinden)
    expect(screen.getByDisplayValue('PLAYER')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Doğrulanmış Hesap/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Hesabı Yasakla/ })).toBeInTheDocument();
    // Yeni alanlar
    expect(screen.getByDisplayValue('7')).toBeInTheDocument();          // seviye beyanı
    expect(screen.getByRole('button', { name: /Aramada Görünsün/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Kurulumu Tamamladı/ })).toBeInTheDocument();
    // Bildirim adı ham anahtar değil, Türkçe şablon etiketi
    expect(await screen.findByRole('button', { name: /Kampanya teklifleri/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^promo_offers/ })).not.toBeInTheDocument();
  });

  it('yalniz DEGISEN alan gonderilir', async () => {
    const telefon = await paneliAc();
    fireEvent.change(telefon, { target: { value: '+90 555 000 11 22' } });
    fireEvent.click(screen.getByRole('button', { name: 'Yönetici Alanlarını Kaydet' }));

    await waitFor(() => expect(updateUserAppProfileAdmin).toHaveBeenCalledTimes(1));
    const [, alanlar] = updateUserAppProfileAdmin.mock.calls[0] as [string, Record<string, unknown>];
    expect(alanlar).toEqual({ phone: '+90 555 000 11 22' });
  });

  it('hicbir sey degismediyse RPC hic cagrilmaz', async () => {
    await paneliAc();
    fireEvent.click(screen.getByRole('button', { name: 'Yönetici Alanlarını Kaydet' }));
    await waitFor(() => expect(toastSuccess).toHaveBeenCalledWith('Değişiklik yok'));
    expect(updateUserAppProfileAdmin).not.toHaveBeenCalled();
    expect(banUserAdmin).not.toHaveBeenCalled();
  });

  it('seviye beyani SILINEMEZ (bos secim gonderilmez)', async () => {
    await paneliAc();
    const seviye = screen.getByDisplayValue('7');
    fireEvent.change(seviye, { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: 'Yönetici Alanlarını Kaydet' }));

    await waitFor(() => expect(toastSuccess).toHaveBeenCalledWith('Değişiklik yok'));
    expect(updateUserAppProfileAdmin).not.toHaveBeenCalled();
  });

  it('seviye beyani DUZELTILEBILIR', async () => {
    await paneliAc();
    fireEvent.change(screen.getByDisplayValue('7'), { target: { value: '9' } });
    fireEvent.click(screen.getByRole('button', { name: 'Yönetici Alanlarını Kaydet' }));

    await waitFor(() => expect(updateUserAppProfileAdmin).toHaveBeenCalledTimes(1));
    const [, alanlar] = updateUserAppProfileAdmin.mock.calls[0] as [string, Record<string, unknown>];
    expect(alanlar).toEqual({ self_skill: 9 });
  });

  it('zorunlu bildirim kapatilamaz, kapatilabilir olan gonderilir', async () => {
    await paneliAc();
    const zorunlu = await screen.findByRole('button', { name: /Maça alındın/ });
    expect(zorunlu).toBeDisabled();
    fireEvent.click(zorunlu);

    fireEvent.click(screen.getByRole('button', { name: /Kampanya teklifleri/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Yönetici Alanlarını Kaydet' }));

    await waitFor(() => expect(updateUserAppProfileAdmin).toHaveBeenCalledTimes(1));
    const [, alanlar] = updateUserAppProfileAdmin.mock.calls[0] as [string, Record<string, unknown>];
    // Kayıtlı hâli kapalıydı → açılır; zorunlu anahtar payload'a HİÇ girmez.
    expect(alanlar).toEqual({
      notification_preferences: { promo_offers: { enabled: true, mandatory: false } },
    });
  });

  it('gizlilik tercihi degisikligi gonderilir', async () => {
    await paneliAc();
    fireEvent.click(screen.getByRole('button', { name: /Telefonla Bulunabilsin/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Yönetici Alanlarını Kaydet' }));

    await waitFor(() => expect(updateUserAppProfileAdmin).toHaveBeenCalledTimes(1));
    const [, alanlar] = updateUserAppProfileAdmin.mock.calls[0] as [string, Record<string, unknown>];
    expect(alanlar).toEqual({ discoverable_by_phone: false });
  });

  it('yasaklama AYRI yoldan gider (profil RPC ile karistirilmaz)', async () => {
    await paneliAc();
    fireEvent.click(screen.getByRole('button', { name: /Hesabı Yasakla/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Yönetici Alanlarını Kaydet' }));

    await waitFor(() => expect(banUserAdmin).toHaveBeenCalledWith('u1', true, null));
    expect(updateUserAppProfileAdmin).not.toHaveBeenCalled();
  });
});
