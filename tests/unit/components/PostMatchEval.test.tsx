import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { useAppStore } from '../../../store';
import type { MatchListing, PositionSlot } from '../../../types';

// ─── MAÇ SONU DEĞERLENDİRME — TASARIM 1a SÖZLEŞMESİ ─────────────────────────
//
// Bu testler ekranın GÖRÜNÜŞÜNÜ değil, sunucu sözleşmesini korur:
//   • skill_score DOĞRUDAN 1–10 gider (eski ekran 5 yıldızı ×2 çeviriyordu)
//   • fair_play_score GÖNDERİLMEZ → sunucu nötr 3 yazar (RPC COALESCE)
//   • yalnız KENDİ TAKIMIN puanlanır; karşı takım ve kullanıcının kendisi hariç
//   • puanlanmayan oyuncu gönderilmez
//   • tesis 1–5, görevli 1–10 ayrı RPC'lere gider
//   • not/yorum alanı ve skor onayı akışta YOKTUR

const RPC_CALLS: { fn: string; args: any }[] = [];
const SERVICE_RATINGS: any[] = [];

vi.mock('framer-motion', () => ({
  motion: { div: (p: any) => React.createElement('div', p, p.children) },
  AnimatePresence: (p: any) => p.children,
}));

vi.mock('../../../supabaseClient', () => ({
  supabase: {
    rpc: (fn: string, args: any) => {
      RPC_CALLS.push({ fn, args });
      return Promise.resolve({ data: null, error: null });
    },
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: null }) }) }),
    }),
  },
}));

vi.mock('../../../supabaseAuth', () => ({
  auth: { currentUser: { uid: 'me' } },
}));

vi.mock('../../../services/serviceRequestService', () => ({
  submitServiceRating: (...a: any[]) => { SERVICE_RATINGS.push(a); return Promise.resolve(); },
  getMatchServiceRequests: () => Promise.resolve([]),
  captainConfirmService: () => Promise.resolve(),
}));

import PostMatchEval from '../../../views/PostMatchEval';

const slot = (id: string, playerId: string | null, name = ''): PositionSlot => ({
  id,
  role: 'ORT',
  x: 50,
  y: 50,
  status: playerId ? 'TAKEN' : 'OPEN',
  ...(playerId ? { occupant: playerId, player: { id: playerId, name, avatar: '', rating: 0, position: 'ORT', x: 50, y: 50 } } : {}),
} as PositionSlot);

const MAC: MatchListing = {
  id: '11111111-2222-3333-4444-555555555555',
  title: 'Akşam Maçı',
  location: 'Yıldız Halı Saha',
  time: '20:00',
  date: '30 Temmuz',
  price: 150,
  difficulty: 'Rahat',
  minRating: 0,
  image: '',
  badges: [],
  missingPositions: [],
  creatorId: 'someone-else',
  // Kendi takım (ev): ben + iki arkadaş. Karşı takım (deplasman): bir kişi.
  slots: [slot('h1', 'me', 'Ben'), slot('h2', 'ali', 'Ali Vural'), slot('h3', 'veli', 'Veli Kaya')],
  awaySlots: [slot('a1', 'rakip', 'Rakip Oyuncu')],
} as MatchListing;

const ciz = () => render(<PostMatchEval onBack={vi.fn()} onComplete={vi.fn()} />);

/**
 * Şeridin `oran` konumuna dokunur → `ceil(oran * max)` puan verir.
 *
 * jsdom'da PointerEvent yok: `fireEvent.pointerDown` clientX'i TAŞIMAZ ve
 * setPointerCapture tanımsızdır. Bu yüzden olay, clientX'i gerçekten taşıyan
 * MouseEvent ile `pointerdown`/`pointerup` adları altında kurulur (React
 * dinleyiciyi ada göre bağlar). Üretimde gerçek PointerEvent akar.
 */
const seritteSec = (slider: Element, oran: number) => {
  vi.spyOn(slider, 'getBoundingClientRect').mockReturnValue({
    left: 0, width: 100, top: 0, height: 28, right: 100, bottom: 28, x: 0, y: 0, toJSON: () => ({}),
  } as DOMRect);
  const at = (tip: string) =>
    fireEvent(slider, new MouseEvent(tip, { clientX: oran * 100, bubbles: true, cancelable: true }));
  at('pointerdown');
  at('pointerup');
};

beforeEach(() => {
  RPC_CALLS.length = 0;
  SERVICE_RATINGS.length = 0;
  useAppStore.setState({ selectedMatch: MAC } as never);
});

afterEach(() => {
  vi.restoreAllMocks();
  useAppStore.setState({ selectedMatch: null } as never);
});

describe('Maç sonu değerlendirme — kadro ekranı', () => {
  it('yalniz KENDI TAKIMIN gosterilir; kullanicinin kendisi ve rakip haric', () => {
    ciz();
    expect(screen.getByText('KENDİ TAKIMIN')).toBeInTheDocument();
    expect(screen.getByText('Ali Vural')).toBeInTheDocument();
    expect(screen.getByText('Veli Kaya')).toBeInTheDocument();
    // Kendini puanlayamazsın:
    expect(screen.queryByText('Ben')).not.toBeInTheDocument();
    // Karşı takım bu ekranda yok:
    expect(screen.queryByText('Rakip Oyuncu')).not.toBeInTheDocument();
  });

  it('sayac puanlanan oyuncu sayisini gosterir (2 kisilik takim arkadasi)', () => {
    ciz();
    expect(screen.getByText('0/2 oyuncu puanlandı')).toBeInTheDocument();
  });

  it('not/yorum alani ve skor onayi akista YOK', () => {
    ciz();
    expect(document.querySelector('textarea')).toBeNull();
    expect(screen.queryByText(/skoru onayla/i)).not.toBeInTheDocument();
  });

  it('serit uzerinde secim puani yazar ve satiri isaretler', () => {
    ciz();
    const sliders = screen.getAllByRole('slider');
    seritteSec(sliders[0], 0.8); // ceil(0.8*10) = 8
    expect(screen.getByText('8')).toBeInTheDocument();
    expect(screen.getByText('1/2 oyuncu puanlandı')).toBeInTheDocument();
  });

  it('ayni degere tekrar dokunmak puani sifirlar (toggle)', () => {
    ciz();
    const slider = screen.getAllByRole('slider')[0];
    seritteSec(slider, 0.8);
    expect(screen.getByText('1/2 oyuncu puanlandı')).toBeInTheDocument();
    seritteSec(slider, 0.8); // aynı yere ikinci dokunuş → temizle
    expect(screen.getByText('0/2 oyuncu puanlandı')).toBeInTheDocument();
  });
});

describe('Maç sonu değerlendirme — sunucu sözleşmesi', () => {
  it('skill_score DOGRUDAN 1-10 gider ve fair_play_score GONDERILMEZ', async () => {
    ciz();
    const sliders = screen.getAllByRole('slider');
    seritteSec(sliders[0], 0.7); // 7
    fireEvent.click(screen.getByText('Devam'));
    fireEvent.click(screen.getByText('Değerlendirmeyi gönder'));

    await waitFor(() => {
      expect(RPC_CALLS.some(c => c.fn === 'submit_match_evaluation')).toBe(true);
    });
    const cagri = RPC_CALLS.find(c => c.fn === 'submit_match_evaluation')!;
    expect(cagri.args.p_ratings).toHaveLength(1);
    // 7 yıldız → 7 (×2 YAPILMAZ; eski davranış 14'e taşardı ve 10'a kırpılırdı)
    expect(cagri.args.p_ratings[0].skill_score).toBe(7);
    expect(cagri.args.p_ratings[0]).not.toHaveProperty('fair_play_score');
  });

  it('puanlanmayan oyuncu gonderilmez', async () => {
    ciz();
    const sliders = screen.getAllByRole('slider');
    seritteSec(sliders[1], 0.5); // yalnız ikinci oyuncu (5)
    fireEvent.click(screen.getByText('Devam'));
    fireEvent.click(screen.getByText('Değerlendirmeyi gönder'));

    await waitFor(() => {
      expect(RPC_CALLS.some(c => c.fn === 'submit_match_evaluation')).toBe(true);
    });
    const cagri = RPC_CALLS.find(c => c.fn === 'submit_match_evaluation')!;
    expect(cagri.args.p_ratings).toHaveLength(1);
    expect(cagri.args.p_ratings[0].ratee_id).toBe('veli');
  });

  it('tesis puani 1-5 olcekte submit_pitch_rating ile gider, not null', async () => {
    ciz();
    fireEvent.click(screen.getByText('Devam'));
    const tesisSerit = screen.getAllByRole('slider')[0];
    seritteSec(tesisSerit, 0.8); // ceil(0.8*5) = 4
    fireEvent.click(screen.getByText('Değerlendirmeyi gönder'));

    await waitFor(() => {
      expect(RPC_CALLS.some(c => c.fn === 'submit_pitch_rating')).toBe(true);
    });
    const cagri = RPC_CALLS.find(c => c.fn === 'submit_pitch_rating')!;
    expect(cagri.args.p_score).toBe(4);
    expect(cagri.args.p_comment).toBeNull();
  });

  it('hic puan verilmezse hicbir puanlama RPC-si cagrilmaz', async () => {
    ciz();
    fireEvent.click(screen.getByText('Devam'));
    fireEvent.click(screen.getByText('Değerlendirmeyi gönder'));

    await waitFor(() => {
      expect(screen.getByText('DEĞERLENDİRMEN KAYDEDİLDİ')).toBeInTheDocument();
    });
    expect(RPC_CALLS.some(c => c.fn === 'submit_match_evaluation')).toBe(false);
    expect(RPC_CALLS.some(c => c.fn === 'submit_pitch_rating')).toBe(false);
    expect(SERVICE_RATINGS).toHaveLength(0);
  });

  it('kurucu olmayan kullanici icin finalize_match cagrilmaz', async () => {
    ciz();
    fireEvent.click(screen.getByText('Devam'));
    fireEvent.click(screen.getByText('Değerlendirmeyi gönder'));
    await waitFor(() => {
      expect(screen.getByText('DEĞERLENDİRMEN KAYDEDİLDİ')).toBeInTheDocument();
    });
    expect(RPC_CALLS.some(c => c.fn === 'finalize_match')).toBe(false);
  });
});

describe('Maç sonu değerlendirme — kenar durumlar', () => {
  it('taraf cozulemezse baslik KADRO olur ve tum kadro listelenir', () => {
    // Kullanıcı hiçbir slotta yok (ör. kadroya girmemiş kurucu).
    useAppStore.setState({
      selectedMatch: {
        ...MAC,
        slots: [slot('h2', 'ali', 'Ali Vural')],
        awaySlots: [slot('a1', 'rakip', 'Rakip Oyuncu')],
      },
    } as never);
    ciz();
    expect(screen.getByText('KADRO')).toBeInTheDocument();
    expect(screen.getByText('Ali Vural')).toBeInTheDocument();
    expect(screen.getByText('Rakip Oyuncu')).toBeInTheDocument();
  });

  it('puanlanacak takim arkadasi yoksa bos durum gosterilir ve tesis adimina gecilebilir', () => {
    useAppStore.setState({
      selectedMatch: { ...MAC, slots: [slot('h1', 'me', 'Ben')], awaySlots: [] },
    } as never);
    ciz();
    expect(screen.getByText('Puanlanacak takım arkadaşın yok')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Devam'));
    expect(screen.getByText('TESİS VE GÖREVLİLER')).toBeInTheDocument();
  });

  it('demo (UUID olmayan) macta sunucuya hicbir sey gonderilmez', async () => {
    useAppStore.setState({ selectedMatch: { ...MAC, id: 'demo-1' } } as never);
    ciz();
    fireEvent.click(screen.getByText('Devam'));
    fireEvent.click(screen.getByText('Değerlendirmeyi gönder'));
    await waitFor(() => {
      expect(screen.getByText('DEĞERLENDİRMEN KAYDEDİLDİ')).toBeInTheDocument();
    });
    expect(RPC_CALLS).toHaveLength(0);
  });
});
