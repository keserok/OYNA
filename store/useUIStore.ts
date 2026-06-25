import { create } from 'zustand';
import type { AppView, MatchListing, Goalkeeper, Referee, AdminUser } from '../types';

interface UIState {
  view: AppView;
  selectedMatch: MatchListing | null;
  selectedGk: Goalkeeper | null;
  selectedRef: Referee | null;
  selectedDiaryId: string | null;
  activeDraftId: string | null;
  marketplaceReturnView: AppView;
  matchJoinReturnView: AppView;
  addOnTotal: number;
  hasMotmCoupon: boolean;
  chatTarget: { name: string; role: string; avatar: string } | null;
  impersonatedUser: AdminUser | null;
  originalRole: import('../types').UserRole | null;
  globalTexts: Record<string, string>;

  // Actions
  setView: (view: AppView) => void;
  setSelectedMatch: (match: MatchListing | null) => void;
  setSelectedGk: (gk: Goalkeeper | null) => void;
  setSelectedRef: (ref: Referee | null) => void;
  setSelectedDiaryId: (id: string | null) => void;
  setActiveDraftId: (id: string | null) => void;
  setMarketplaceReturnView: (view: AppView) => void;
  setMatchJoinReturnView: (view: AppView) => void;
  setAddOnTotal: (total: number) => void;
  setHasMotmCoupon: (hasCoupon: boolean) => void;
  setChatTarget: (target: { name: string; role: string; avatar: string } | null) => void;
  setImpersonatedUser: (user: AdminUser | null) => void;
  setOriginalRole: (role: import('../types').UserRole | null) => void;
  setGlobalText: (key: string, value: string) => void;
}

const IS_LOCAL_DEV =
  import.meta.env.VITE_DEV_MODE === 'true' ||
  !import.meta.env.VITE_SUPABASE_URL;

export const useUIStore = create<UIState>((set) => ({
  view: IS_LOCAL_DEV ? 'DASHBOARD' : 'SPLASH',
  selectedMatch: null,
  selectedGk: null,
  selectedRef: null,
  selectedDiaryId: null,
  activeDraftId: null,
  marketplaceReturnView: 'DASHBOARD',
  matchJoinReturnView: 'MATCH_DISCOVERY',
  addOnTotal: 0,
  hasMotmCoupon: false,
  chatTarget: null,
  impersonatedUser: null,
  originalRole: null,
  globalTexts: {
    dashboardTitle: 'ANA SAYFA',
    dashboardSubtitle: "OYNA'YA HOŞ GELDİN",
    communityViewTitle: 'TOPLULUKLAR',
    profileTitle: 'OYUNCU PROFİLİ',
    matchDiscoveryTitle: 'MAÇ BUL',
    marketplaceGkTitle: 'KALECİ KİRALA',
    marketplaceRefTitle: 'HAKEM KİRALA',
    pitchDiscoveryTitle: 'SAHA KİRALA',
    opponentFinderTitle: 'RAKİP BUL',
    studioTitle: 'TAKTİK ZEKA',
  },

  setView: (view) => set({ view }),
  setSelectedMatch: (selectedMatch) => set({ selectedMatch }),
  setSelectedGk: (selectedGk) => set({ selectedGk }),
  setSelectedRef: (selectedRef) => set({ selectedRef }),
  setSelectedDiaryId: (id) => set({ selectedDiaryId: id }),
  setActiveDraftId: (id) => set({ activeDraftId: id }),
  setMarketplaceReturnView: (view) => set({ marketplaceReturnView: view }),
  setMatchJoinReturnView: (view) => set({ matchJoinReturnView: view }),
  setAddOnTotal: (total) => set({ addOnTotal: total }),
  setHasMotmCoupon: (has) => set({ hasMotmCoupon: has }),
  setChatTarget: (chatTarget) => set({ chatTarget }),
  setImpersonatedUser: (user) => set({ impersonatedUser: user }),
  setOriginalRole: (role) => set({ originalRole: role }),
  setGlobalText: (key, value) => set((state) => ({
    globalTexts: { ...state.globalTexts, [key]: value },
  })),
}));
