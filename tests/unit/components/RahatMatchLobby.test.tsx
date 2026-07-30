import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import type { MatchListing, PositionSlot } from '../../../types';
import { useAppStore } from '../../../store';

// ─── E2/E4/E5/E6 · RAHAT MAÇ LOBİSİ — VERİ SÖZLEŞMESİ ───────────────────────
//
// Sabitlenenler:
//   • bir "yer"in beş görsel durumu (tek tanım): BOŞ / REZERVE / LİNK / DOLU /
//     DAVETLİ+SEN rozetleri + seviye BANDI (ham sayı değil)
//   • CTA durum makinesi: KATIL / YEDEK LİSTESİNE GİR / YEDEK LİSTESİNDESİN /
//     SENİN YERLERİN + YERLERİ DOLDUR
//   • VERİ DÜRÜSTLÜĞÜ: footwear/koordinat/onay-saati verisi yoksa ilgili öğe
//     DOM'a HİÇ girmez; onay saati CANLI konfigden HESAPLANIR

const rpcCalls: { fn: string; args: unknown }[] = [];

vi.mock('framer-motion', () => ({
  motion: new Proxy({}, { get: () => (p: Record<string, unknown>) => React.createElement('div', p, p.children as React.ReactNode) }),
  AnimatePresence: (p: { children?: React.ReactNode }) => p.children,
}));

vi.mock('../../../supabaseAuth', () => ({ auth: { currentUser: { uid: 'me' } } }));

vi.mock('../../../supabaseClient', () => ({
  supabase: {
    rpc: (fn: string, args: unknown) => { rpcCalls.push({ fn, args }); return Promise.resolve({ data: null, error: null }); },
    channel: () => ({ on: function () { return this; }, subscribe: function () { return this; } }),
    removeChannel: () => {},
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: null }) }), limit: () => ({ maybeSingle: () => Promise.resolve({ data: null }) }) }) }),
  },
}));

vi.mock('../../../services/matchService', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../services/matchService')>();
  return {
    ...actual,
    getMatchDetails: vi.fn(async () => null),
    subscribeToMatchUpdates: vi.fn(() => () => {}),
    getMatchLobbyParticipants: vi.fn(async () => [
      { userId: 'ali', side: 'home', name: 'Ali Vural', avatarUrl: '', selfSkill: 9 },
      { userId: 'veli', side: 'away', name: 'Veli Kaya', avatarUrl: '', selfSkill: 2 },
      { userId: 'buyer1', side: 'home', name: 'Emre Alan', avatarUrl: '', selfSkill: null },
    ]),
    previewLeaveMatch: vi.fn(async () => ({
      refundable: 150, paid: 200, alreadyRefunded: false, inSquad: true, hoursToStart: 10,
      refundPct: 50, fullHours: 24, halfHours: 6, halfPct: 50, late: true, penalty: 5, forfeited: 50,
    })),
  };
});

vi.mock('../../../services/rahatMatchService', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../services/rahatMatchService')>();
  return {
    ...actual,
    fetchRahatPitchInfo: vi.fn(async () => null),
    fetchRahatMatchConfig: vi.fn(async () => ({
      captureWindowHours: 8, refundFullHours: 24, refundHalfHours: 6, refundHalfPct: 50,
    })),
  };
});

vi.mock('../../../services/matchLifecycleService', () => ({ checkMatchThreshold: vi.fn(async () => ({})) }));
vi.mock('../../../services/socialService', () => ({ getFriends: vi.fn(async () => [{ friend_id: 'ali' }]) }));
vi.mock('../../../components/social/MatchSquadPicker', () => ({ default: () => null }));

import RahatMatchLobby from '../../../views/match/RahatMatchLobby';

type SlotOver = Partial<PositionSlot> & { occupant?: string; purchasedBy?: string; assignmentStatus?: string };
const slot = (id: string, over: SlotOver = {}): PositionSlot =>
  ({ id, role: 'OYUNCU', status: 'OPEN', ...over } as PositionSlot);

const mac = (over: Partial<MatchListing> = {}): MatchListing => ({
  id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
  title: 'Rahat Maç', location: 'Altınordu Halı Saha', pitchName: 'Altınordu Halı Saha',
  courtName: 'Kort 2', time: '20:00 – 21:00', date: 'Bugün',
  price: 200, difficulty: 'Rahat', image: '', badges: [], missingPositions: [],
  slots: [
    slot('w0', { status: 'TAKEN', occupant: 'ali', player: { id: 'ali', name: 'Ali Vural', avatar: '', position: 'OYUNCU' } }),
    slot('w1', { status: 'TAKEN', purchasedBy: 'buyer1', assignmentStatus: 'RESERVED' }),
    slot('w2', { status: 'TAKEN', purchasedBy: 'buyer1', assignmentStatus: 'LINK_PENDING' }),
    slot('w3'),
  ],
  awaySlots: [
    slot('r0', {
      status: 'TAKEN', occupant: 'veli', purchasedBy: 'baskasi', assignmentStatus: 'ASSIGNED',
      player: { id: 'veli', name: 'Veli Kaya', avatar: '', position: 'OYUNCU' },
    }),
    slot('r1'),
  ],
  ...over,
} as MatchListing);

const ciz = (m = mac()) => render(<RahatMatchLobby match={m} onBack={vi.fn()} />);

beforeEach(() => {
  rpcCalls.length = 0;
  useAppStore.setState({ selectedMatch: null } as never);
});

describe('RahatMatchLobby — kadro satırının beş görsel durumu', () => {
  it('BOS yer kesikli "+ Boş yer" olarak cizilir', async () => {
    ciz();
    await waitFor(() => expect(screen.getAllByText('+ Boş yer').length).toBe(2)); // w3 + r1
  });

  it('REZERVE yer kilit + alici adiyla cizilir ve DOLU sayilir', async () => {
    ciz();
    await waitFor(() => expect(screen.getByText('Rezerve — Emre Alan dolduracak')).toBeInTheDocument());
    // Doluluk: w0+w1+w2 (3) + r0 (1) = 4/6
    expect(screen.getByText('4/6')).toBeInTheDocument();
  });

  it('LINK_PENDING yer "Davet kodu paylaşıldı" olarak cizilir', async () => {
    ciz();
    await waitFor(() => expect(screen.getByText('Davet kodu paylaşıldı')).toBeInTheDocument());
  });

  it('DAVETLI rozeti: baskasinin aldigi yerde oturan arkadas', async () => {
    ciz();
    await waitFor(() => expect(screen.getByText('DAVETLİ')).toBeInTheDocument());
  });

  it('seviye BANDI cizilir (ham 9/10 sayisi DEGIL); beyani olmayanin cipi yok', async () => {
    ciz();
    await waitFor(() => expect(screen.getByText('İLERİ')).toBeInTheDocument());     // Ali 9
    expect(screen.getByText('BAŞLANGIÇ')).toBeInTheDocument();                       // Veli 2
    expect(screen.queryByText('9/10')).not.toBeInTheDocument();
  });

  it('ARKADAS rozeti yalniz arkadas listesindekilere cizilir', async () => {
    ciz();
    await waitFor(() => expect(screen.getByText('ARKADAŞ')).toBeInTheDocument()); // ali
  });
});

describe('RahatMatchLobby — CTA durum makinesi', () => {
  it('bos yer varken KATIL · fiyat', async () => {
    ciz();
    await waitFor(() => expect(screen.getByText(/KATIL · 200₺/)).toBeInTheDocument());
  });

  it('kadro doluyken YEDEK LISTESINE GIR', async () => {
    ciz(mac({
      slots: [slot('w0', { status: 'TAKEN', occupant: 'ali' })],
      awaySlots: [slot('r0', { status: 'TAKEN', occupant: 'veli' })],
    }));
    await waitFor(() => expect(screen.getByText('YEDEK LİSTESİNE GİR')).toBeInTheDocument());
  });

  it('yedek listesindeyken sira numarasiyla pasif serit', async () => {
    ciz(mac({
      slots: [slot('w0', { status: 'TAKEN', occupant: 'ali' })],
      awaySlots: [slot('r0', { status: 'TAKEN', occupant: 'veli' })],
      reservePlayers: [{ id: 'baska' }, { id: 'me', name: 'Ben' }] as never,
    }));
    await waitFor(() => expect(screen.getByText(/YEDEK LİSTESİNDESİN · 2\. SIRA/)).toBeInTheDocument());
  });

  it('yerim varsa SENIN YERLERIN karti + YERLERI DOLDUR sayaci', async () => {
    ciz(mac({
      slots: [
        slot('w0', { status: 'TAKEN', purchasedBy: 'me', assignmentStatus: 'RESERVED' }),
        slot('w1', { status: 'TAKEN', purchasedBy: 'me', assignmentStatus: 'RESERVED' }),
      ],
      awaySlots: [slot('r0')],
    }));
    await waitFor(() => expect(screen.getByText('SENİN YERLERİN')).toBeInTheDocument());
    expect(screen.getByText('YERLERİ DOLDUR (2)')).toBeInTheDocument();
    expect(screen.getAllByText('Kendini ekle').length).toBe(2);
    expect(screen.getAllByText('Kod paylaş').length).toBe(2);
  });

  it('iptal maçta kirmizi serit cizilir, CTA cizilmez', async () => {
    ciz(mac({ status: 'CANCELLED' }));
    await waitFor(() => expect(screen.getByText(/Maç iptal edildi/)).toBeInTheDocument());
    expect(screen.queryByText(/KATIL · /)).not.toBeInTheDocument();
  });

  it('onaylanmis macta MAC ONAYLANDI seridi + kilitli CTA', async () => {
    ciz(mac({ status: 'CONFIRMED' }));
    await waitFor(() => expect(screen.getByText('MAÇ ONAYLANDI — KADRO KİLİTLİ')).toBeInTheDocument());
  });
});

describe('RahatMatchLobby — veri dürüstlüğü (yoksa çizme)', () => {
  it('footwear_rule yoksa AYAKKABI karti DOM-a girmez; varsa dogru etiket', async () => {
    // HAKKINDA sekmesine geç
    const { unmount } = ciz();
    await waitFor(() => screen.getByText('HAKKINDA'));
    screen.getByText('HAKKINDA').click();
    await waitFor(() => expect(screen.getByText('MAÇ SEVİYESİ')).toBeInTheDocument());
    expect(screen.queryByText('AYAKKABI')).not.toBeInTheDocument();
    unmount();

    ciz(mac({ footwearRule: 'CLEATS_OK' }));
    await waitFor(() => screen.getByText('HAKKINDA'));
    screen.getByText('HAKKINDA').click();
    await waitFor(() => expect(screen.getByText('KRAMPON SERBEST')).toBeInTheDocument());
  });

  it('koordinat yoksa harita/yol tarifi DOM-a girmez', async () => {
    ciz();
    await waitFor(() => screen.getByText('HAKKINDA'));
    screen.getByText('HAKKINDA').click();
    await waitFor(() => expect(screen.getByText('MAÇ SEVİYESİ')).toBeInTheDocument());
    expect(screen.queryByText('Yol Tarifi Al')).not.toBeInTheDocument();
  });

  it('onay saati HESAPLANIR: starts_at − onay penceresi (8 saat)', async () => {
    const startsAt = '2026-03-01T20:00:00+03:00';
    // Beklenen etiket bileşenle AYNI mantıktan (yerel saat dilimi farkı test
    // ortamına göre değişebilir — sabit '12:00' yazmak UTC koşumda kırılırdı).
    const expected = new Date(new Date(startsAt).getTime() - 8 * 3600_000)
      .toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
    ciz(mac({ startsAt }));
    await waitFor(() => expect(screen.getByText(/bildireceğiz/)).toBeInTheDocument());
    expect(screen.getByText(expected)).toBeInTheDocument();
  });

  it('starts_at yoksa onay cumlesi HIC cizilmez (uydurma saat yok)', async () => {
    ciz(mac({ startsAt: undefined }));
    await waitFor(() => expect(screen.getByText('KADRO')).toBeInTheDocument());
    expect(screen.queryByText(/bildireceğiz/)).not.toBeInTheDocument();
  });

  it('kademe cubugu: kismi dolulukta ONAYLANDI aktif + oyuncu balonu', async () => {
    ciz();
    await waitFor(() => expect(screen.getByText('YAYINDA')).toBeInTheDocument());
    expect(screen.getByText('ONAYLANDI')).toBeInTheDocument();
    expect(screen.getByText('KADRO TAM')).toBeInTheDocument();
    expect(screen.getByText('4 oyuncu')).toBeInTheDocument();
  });
});
