import { create } from 'zustand';
import { AppView, UserRole, MatchListing, Goalkeeper, Referee, Pitch, OpponentListing, Team, AdminUser, Player, PlayerSeekAnnouncement, AdminLog, SavedPaymentCard, WalletTab, Court } from './types';
import { GOALKEEPERS, REFEREES, PITCHES, MATCH_LISTINGS, OPPONENT_LISTINGS, USER_TEAMS } from './constants';
import { MOCK_USERS } from './__mocks__/mockUsers';
import { MOCK_TEAMS } from './__mocks__/mockTeams';
import * as FB from './supabaseMutations';
import * as TeamService from './services/teamService';
import { auth } from './supabaseAuth';

import { supabase } from './supabaseClient';
import type { NotificationPreferences } from './notifications/pushService';
import { DEFAULT_NOTIFICATION_PREFERENCES } from './notifications/pushService';
import type { AdminSession } from './admin-panel/services/adminService';

const MOCK_TACTICS = [
  {
    id: 'mock_tactic_1',
    teamId: 't1',
    name: 'Ataç / Plan A',
    formation: '2-3-1',
    size: '7v7',
    status: 'APPROVED',
    priority: 0,
    slots: JSON.stringify([
      { id: 's1', x: 50, y: 90, role: 'GK', player: { id: '1', name: 'Caner Kaya', avatar: 'https://i.pravatar.cc/150?u=caner', rating: 4.6 } },
      { id: 's2', x: 30, y: 75, role: 'DEF', player: { id: '6', name: 'Burak Şahin', avatar: 'https://i.pravatar.cc/150?u=burak', rating: 4.3 } },
      { id: 's3', x: 70, y: 75, role: 'DEF', player: { id: '11', name: 'Hakan Çelik', avatar: 'https://i.pravatar.cc/150?u=hakan', rating: 4.1 } },
      { id: 's4', x: 50, y: 45, role: 'MID' },
      { id: 's5', x: 25, y: 30, role: 'MID' },
      { id: 's6', x: 75, y: 30, role: 'MID' },
      { id: 's7', x: 50, y: 15, role: 'FWD' }
    ]),
    subs: '[]',
    opponents: '[]',
    drawings: '[]',
    notes: 'Hücum ağırlıklı pres planı.'
  },
  {
    id: 'mock_tactic_2',
    teamId: 't1',
    name: 'Plan B / Defans',
    formation: '3-2-1',
    size: '7v7',
    status: 'APPROVED',
    priority: 1,
    slots: JSON.stringify([
      { id: 's1', x: 50, y: 90, role: 'GK', player: { id: '1', name: 'Caner Kaya', avatar: 'https://i.pravatar.cc/150?u=caner', rating: 4.6 } },
      { id: 's2', x: 20, y: 75, role: 'DEF', player: { id: '11', name: 'Hakan Çelik', avatar: 'https://i.pravatar.cc/150?u=hakan', rating: 4.1 } },
      { id: 's3', x: 50, y: 80, role: 'DEF', player: { id: '6', name: 'Burak Şahin', avatar: 'https://i.pravatar.cc/150?u=burak', rating: 4.3 } },
      { id: 's4', x: 80, y: 75, role: 'DEF' },
      { id: 's5', x: 35, y: 50, role: 'MID' },
      { id: 's6', x: 65, y: 50, role: 'MID' },
      { id: 's7', x: 50, y: 20, role: 'FWD' }
    ]),
    subs: '[]',
    opponents: '[]',
    drawings: '[]',
    notes: 'Skoru korumak için savunma hattı.'
  },
  {
    id: 'mock_tactic_3',
    teamId: 't1',
    name: 'Ahmetin Önerisi',
    formation: '2-3-1',
    size: '7v7',
    status: 'PENDING_APPROVAL',
    proposedBy: 'u2',
    teamName: 'Ahmet K.',
    slots: JSON.stringify([
      { id: 's1', x: 50, y: 90, role: 'GK', player: { id: '1', name: 'Caner Kaya', avatar: 'https://i.pravatar.cc/150?u=caner', rating: 4.6 } },
      { id: 's2', x: 30, y: 75, role: 'DEF', player: { id: '6', name: 'Burak Şahin', avatar: 'https://i.pravatar.cc/150?u=burak', rating: 4.3 } },
      { id: 's3', x: 70, y: 75, role: 'DEF', player: { id: '11', name: 'Hakan Çelik', avatar: 'https://i.pravatar.cc/150?u=hakan', rating: 4.1 } },
      { id: 's4', x: 50, y: 35, role: 'MID' },
      { id: 's5', x: 20, y: 40, role: 'MID' },
      { id: 's6', x: 80, y: 40, role: 'MID' },
      { id: 's7', x: 50, y: 15, role: 'FWD' }
    ]),
    subs: '[]',
    opponents: '[]',
    drawings: '[]',
    notes: 'Orta sahada pas trafiği kurarak rakibi çözme planı.'
  }
];

export interface Friend {
  id: string;
  name: string;
  nickname: string;
  avatar: string;
  position: string;
  style: string;
  status: 'FRIEND' | 'PENDING_SENT' | 'PENDING_RECEIVED';
  tags?: string[];
  isFavorite?: boolean;
  group?: string;
  pos?: string;
  fp?: number;
  online?: boolean;
  wins?: number;
  losses?: number;
}

// ─── Admin-only types ────────────────────────────────────────────────

export interface AdminNotification {
  id: string;
  title: string;
  body: string;
  type: 'INFO' | 'WARNING' | 'PROMO' | 'SYSTEM';
  targetAudience: 'ALL' | 'PRO' | 'CAPTAIN' | 'GK' | 'REFEREE';
  sentAt: string;
  isActive: boolean;
}

export interface UserNotificationItem {
  id: number | string;
  type: string;
  title: string;
  desc: string;
  time: string;
  iconName: string;
  color: string;
  textColor: string;
  payload?: { matchId: string; slotId: string; };
  read?: boolean;
}

export interface AppSettings {
  appName: string;
  maintenanceMode: boolean;
  registrationOpen: boolean;
  proPrice: number;
  commissionRate: number;
  minRatingToPlay: number;
  maxMatchsPerDay: number;
  featuredPitchId: string;
  announcementBanner: string;
  showAnnouncementBanner: boolean;
  payoutMode?: string;
  tacticStudio?: boolean;
  motmReveal?: boolean;
  aiCoach?: boolean;
  scoutSystem?: boolean;
}
// ─────────────────────────────────────────────────────────────────────

const IS_LOCAL_DEV =
  import.meta.env.VITE_DEV_MODE === 'true' ||
  !import.meta.env.VITE_SUPABASE_URL;

const SAVED_CARDS_KEY = 'oyna_saved_cards';

function loadSavedCards(): SavedPaymentCard[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(SAVED_CARDS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as SavedPaymentCard[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function persistSavedCards(cards: SavedPaymentCard[]) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(SAVED_CARDS_KEY, JSON.stringify(cards));
}

// INITIAL_USERS artık __mocks__/mockUsers.ts'de (MOCK_USERS olarak).
// Prod'da boş dizi, dev'de mock veriler yüklenir.
export const INITIAL_USERS: AdminUser[] = IS_LOCAL_DEV ? MOCK_USERS : [];

const INITIAL_NOTIFICATIONS: AdminNotification[] = [
  { id: 'n1', title: '🎉 Haftalık İndirim!', body: 'Bu hafta saha kiralarında %15 indirim var. Hemen rezerve et!', type: 'PROMO', targetAudience: 'ALL', sentAt: '2026-03-15 09:00', isActive: true },
  { id: 'n2', title: '⚡ Yeni Kaleciler Eklendi', body: 'Bölgene 5 yeni profesyonel kaleci katıldı.', type: 'INFO', targetAudience: 'CAPTAIN', sentAt: '2026-03-14 14:30', isActive: true },
  { id: 'n3', title: '🔧 Bakım Bildirimi', body: 'Bu gece 02:00-04:00 arası planlı bakım yapılacak.', type: 'SYSTEM', targetAudience: 'ALL', sentAt: '2026-03-13 18:00', isActive: false },
];

const INITIAL_SETTINGS: AppSettings = {
  appName: 'OYNA',
  maintenanceMode: false,
  registrationOpen: true,
  proPrice: 199,
  commissionRate: 10,
  minRatingToPlay: 2.5,
  maxMatchsPerDay: 3,
  featuredPitchId: '1',
  announcementBanner: '🎉 OYNA v2.0 yayında! Yeni özellikler geldi.',
  showAnnouncementBanner: true,
};

interface AppState {
  isHydrated: boolean;
  initApp: () => Promise<void>;
  view: AppView;
  role: UserRole | null;
  isAuthReady: boolean;
  addOnTotal: number;
  hasMotmCoupon: boolean;
  selectedMatch: MatchListing | null;
  isUserPro: boolean;
  selectedDiaryId: string | null;
  selectedGk: Goalkeeper | null;
  selectedRef: Referee | null;
  marketplaceReturnView: AppView;
  matchJoinReturnView: AppView;
  reliabilityScore: number;
  banExpiresAt: string | null;
  setReliabilityScore: (score: number) => void;
  setBanExpiresAt: (dateStr: string | null) => void;
  impersonatedUser: AdminUser | null;
  setImpersonatedUser: (user: AdminUser | null) => void;
  adminSession: AdminSession | null;
  setAdminSession: (session: AdminSession | null) => void;
  originalRole: UserRole | null;
  setOriginalRole: (role: UserRole | null) => void;

  // Global text overrides
  globalTexts: Record<string, string>;
  setGlobalText: (key: string, value: string) => void;

  // ─── Location & Matching ─────────────────────────────────────────
  userLocation: { lat: number; lng: number } | null;
  setUserLocation: (location: { lat: number; lng: number } | null) => void;
  locationPermissionStatus: 'GRANTED' | 'DENIED' | 'NOT_REQUESTED';
  setLocationPermissionStatus: (status: 'GRANTED' | 'DENIED' | 'NOT_REQUESTED') => void;
  searchRadius: number;
  setSearchRadius: (radius: number) => void;

  // Admin CRUD Data (live, reflected across whole app)
  adminPitches: Pitch[];
  adminGoalkeepers: Goalkeeper[];
  adminReferees: Referee[];
  adminMatches: MatchListing[];
  adminUsers: AdminUser[];
  adminNotifications: AdminNotification[];
  adminLogs: AdminLog[];
  adminDashboardStats: Record<string, number | string> | null;
  adminTeams: Team[];
  appSettings: AppSettings;


  // App-wide toggles
  announcementBanner: string;
  showAnnouncementBanner: boolean;

  // Player Seek Announcements
  playerSeekAds: PlayerSeekAnnouncement[];
  addPlayerSeekAd: (ad: PlayerSeekAnnouncement) => void;
  toggleJoinPlayerSeekAd: (adId: string, userId: string) => void;
  acceptPlayerSeekAdRequest: (adId: string, userId: string) => void;

  // Active Chat Configuration
  chatTarget: { name: string; role: string; avatar: string } | null;
  setChatTarget: (target: { name: string; role: string; avatar: string } | null) => void;

  // ─── Friend System ─────────────────────────────────────────────────
  friends: Friend[];
  addFriend: (friend: Friend) => void;
  removeFriend: (id: string) => void;
  acceptFriend: (id: string) => void;
  addPendingFriend: (friend: Friend) => void;

  // ─── Squad Builder ────────────────────────────────────────────────
  selectedFriendsForTeam: string[];
  toggleSelectedFriendForTeam: (id: string) => void;
  clearSelectedFriendsForTeam: () => void;

  userTeams: Team[];
  addTeam: (team: Team) => void;

  myTeams: Team[];
  addMyTeam: (team: Team) => void;
  loadMyTeams: () => Promise<void>;
  createTeam: (input: TeamService.NewTeamInput) => Promise<Team>;

  // ─── Studio Transfer ─────────────────────────────────────────────
  activeStudioTeam: Team | null;
  setActiveStudioTeam: (team: Team | null) => void;
  teamTactics: any[];
  fetchTeamTactics: (teamId: string) => Promise<void>;
  proposeTactic: (tacticData: any) => Promise<any>;
  approveTactic: (tacticId: string) => Promise<any>;
  rejectTactic: (tacticId: string) => Promise<void>;
  updateTacticPriorities: (teamId: string, orderedTacticIds: string[]) => Promise<void>;
  updateTacticSlots: (tacticId: string, slots: any) => void;

  // ─── Opponent Finder Ads ─────────────────────────────────────────
  opponentAds: Team[];
  addOpponentAd: (ad: Team) => void;

  // ─── Basic actions ───────────────────────────────────────────────
  setView: (view: AppView) => void;
  setRole: (role: UserRole | null) => void;
  setIsAuthReady: (isReady: boolean) => void;
  setAddOnTotal: (total: number) => void;
  setHasMotmCoupon: (hasCoupon: boolean) => void;
  setSelectedMatch: (match: MatchListing | null) => void;
  setIsUserPro: (isPro: boolean) => void;
  setSelectedDiaryId: (id: string | null) => void;
  activeDraftId: string | null;
  setActiveDraftId: (id: string | null) => void;
  setSelectedGk: (gk: Goalkeeper | null) => void;
  setSelectedRef: (ref: Referee | null) => void;
  setMarketplaceReturnView: (view: AppView) => void;
  setMatchJoinReturnView: (view: AppView) => void;
  bookingPitch: Pitch | null;
  bookingCourt: Court | null;
  bookingDate: string | null;
  bookingSlot: string | null;
  bookingPrice: number | null;
  bookingDeposit: number | null;
  setBookingPitch: (pitch: Pitch | null) => void;
  setBookingCourt: (court: Court | null) => void;
  setBookingDate: (date: string | null) => void;
  setBookingSlot: (slot: string | null) => void;
  setBookingPrice: (price: number | null) => void;
  setBookingDeposit: (deposit: number | null) => void;

  savedCards: SavedPaymentCard[];
  walletReturnView: AppView | null;
  walletInitialTab: WalletTab;
  walletPendingDeposit: boolean;
  addSavedCard: (card: Omit<SavedPaymentCard, 'id'>) => void;
  removeSavedCard: (id: string) => void;
  setWalletReturnView: (view: AppView | null) => void;
  setWalletInitialTab: (tab: WalletTab) => void;
  setWalletPendingDeposit: (pending: boolean) => void;

  // ─── Direct Setters for Firebase Listeners ─────────────────────
  setAdminPitches: (pitches: Pitch[]) => void;
  setAdminMatches: (matches: MatchListing[]) => void;
  setAdminUsers: (users: AdminUser[]) => void;
  setAdminGoalkeepers: (gks: Goalkeeper[]) => void;
  setAdminReferees: (refs: Referee[]) => void;
  setAdminNotifications: (notifs: AdminNotification[]) => void;
  setAdminTeams: (teams: Team[]) => void;
  setInitialLoadComplete: (isComplete: boolean) => void;
  initialLoadComplete: boolean;

  // ─── Pitch CRUD ────────────────────────────────────────────────
  addPitch: (pitch: Pitch) => Promise<void>;
  updatePitch: (pitch: Pitch) => Promise<void>;
  deletePitch: (id: string) => Promise<void>;

  // ─── Goalkeeper CRUD ───────────────────────────────────────────
  addGoalkeeper: (gk: Goalkeeper) => Promise<void>;
  updateGoalkeeper: (gk: Goalkeeper) => Promise<void>;
  deleteGoalkeeper: (id: string) => Promise<void>;

  // ─── Referee CRUD ──────────────────────────────────────────────
  addReferee: (ref: Referee) => Promise<void>;
  updateReferee: (ref: Referee) => Promise<void>;
  deleteReferee: (id: string) => Promise<void>;
  loadServices: () => Promise<void>;
  
  // ─── Owner (SaaS) Data Load ─────────────────────────────────────
  loadOwnerData: (facilityId?: string) => Promise<void>;

  // ─── Supabase Plei Architecture ───────────────────────────────
  joinMatchPleiAction: (matchId: string, slotId: string, role: string) => Promise<void>;
  initSupabaseRealtime: () => void;

  // ─── Match CRUD ────────────────────────────────────────────────
  addMatch: (match: MatchListing) => Promise<void>;
  updateMatch: (match: MatchListing) => Promise<void>;
  deleteMatch: (id: string) => Promise<void>;

  // ─── User CRUD ─────────────────────────────────────────────────
  updateUser: (user: AdminUser) => Promise<void>;
  setNewMatchBadge: (val: boolean) => Promise<void>;
  banUser: (id: string) => Promise<void>;
  unbanUser: (id: string) => Promise<void>;
  toggleUserPro: (id: string) => Promise<void>;
  verifyUser: (id: string) => Promise<void>;
  addUser: (user: AdminUser) => Promise<void>;
  deleteUser: (id: string) => Promise<void>;

  // ─── Notifications ─────────────────────────────────────────────
  addNotification: (n: AdminNotification) => void;
  deleteNotification: (id: string) => void;
  toggleNotification: (id: string) => void;

  // ─── Logs ──────────────────────────────────────────────────────
  addAdminLog: (log: Omit<AdminLog, 'id' | 'timestamp'>) => void;
  loadAdminData: (data: {
    users: AdminUser[];
    settings: Partial<AppSettings> | null;
    auditLogs: AdminLog[];
    stats: Record<string, number | string> | null;
    texts?: Record<string, string>;
  }) => void;
  clearAdminMockState: () => void;
  setAdminInventoryData: (data: {
    pitches: Pitch[];
    matches: MatchListing[];
    teams: Team[];
    goalkeepers: Goalkeeper[];
    referees: Referee[];
    texts?: Record<string, string>;
  }) => void;

  // ─── App Settings ──────────────────────────────────────────────
  updateAppSettings: (settings: Partial<AppSettings>) => Promise<void>;

  // ─── User Notifications ──────────────────────────────────────────
  userNotifications: UserNotificationItem[];
  addUserNotification: (notif: UserNotificationItem) => void;
  removeUserNotification: (id: string) => void;
  isNotificationsOpen: boolean;
  setIsNotificationsOpen: (open: boolean) => void;
  markAllNotificationsAsRead: () => void;
  acceptMatchInvite: (notificationId: string) => void;
  rejectMatchInvite: (notificationId: string) => void;
  unreadNotificationsCount: number;
  incrementUnreadNotifications: () => void;
  clearUnreadNotifications: () => void;

  // ─── Push Notification State ───────────────────────────────────
  pushToken: string | null;
  setPushToken: (token: string | null) => void;
  notificationPreferences: NotificationPreferences;
  setNotificationPreferences: (prefs: NotificationPreferences) => void;
  updateSingleNotificationPref: (key: keyof NotificationPreferences, enabled: boolean) => void;
}

export const useAppStore = create<AppState>((set, get) => ({
  isHydrated: true,
  initApp: async () => {
    const withTimeout = <T,>(promise: Promise<T>, ms = 3000): Promise<T | null> =>
      Promise.race([
        promise,
        new Promise<null>((resolve) => setTimeout(() => resolve(null), ms)),
      ]);

    try {
      const [sessionRes, pitchesRes, matchesRes, teamsRes, servicesRes, textsRes] = await Promise.allSettled([
        withTimeout(supabase.auth.getSession()),
        withTimeout(FB.fbGetPitches()),
        withTimeout(FB.fbGetMatches()),
        withTimeout(FB.fbGetTeams()),
        withTimeout(get().loadServices(), 4000),
        withTimeout<any>(Promise.resolve(supabase.from('texts').select('key, value'))),
      ]);

      if (pitchesRes.status === 'fulfilled' && pitchesRes.value) {
        set({ adminPitches: pitchesRes.value as Pitch[] });
      }
      if (matchesRes.status === 'fulfilled' && matchesRes.value) {
        set({ adminMatches: matchesRes.value as MatchListing[] });
      }
      if (teamsRes.status === 'fulfilled' && teamsRes.value) {
        set({ adminTeams: teamsRes.value as Team[] });
      }
      if (textsRes.status === 'fulfilled' && textsRes.value && !(textsRes.value as any).error) {
        const rows = (textsRes.value as any).data as Array<{ key: string; value: string }> | null;
        if (rows?.length) {
          const map: Record<string, string> = {};
          rows.forEach((row) => { map[row.key] = row.value; });
          set((state) => ({ globalTexts: { ...state.globalTexts, ...map } }));
        }
      }
    } catch (e) {
      console.error('Hydration error:', e);
    } finally {
      set({ isHydrated: true, initialLoadComplete: true });
    }
  },
  view: IS_LOCAL_DEV ? 'DASHBOARD' : 'SPLASH',
  role: IS_LOCAL_DEV ? UserRole.CAPTAIN : UserRole.PLAYER,
  isAuthReady: true,
  addOnTotal: 0,
  hasMotmCoupon: false,
  selectedMatch: null,
  isUserPro: false,
  selectedDiaryId: null,
  activeDraftId: null,
  selectedGk: null,
  selectedRef: null,
  bookingPitch: null,
  bookingCourt: null,
  bookingDate: null,
  bookingSlot: null,
  bookingPrice: null,
  bookingDeposit: null,
  savedCards: loadSavedCards(),
  walletReturnView: null,
  walletInitialTab: 'MAIN',
  walletPendingDeposit: false,
  marketplaceReturnView: 'DASHBOARD',
  matchJoinReturnView: 'MATCH_DISCOVERY',
  reliabilityScore: 100,
  banExpiresAt: null,
  setReliabilityScore: (score) => set({ reliabilityScore: score }),
  setBanExpiresAt: (banExpiresAt) => set({ banExpiresAt }),
  impersonatedUser: null,
  setImpersonatedUser: (impersonatedUser) => set({ impersonatedUser }),
  adminSession: null,
  setAdminSession: (adminSession) => set({ adminSession }),
  originalRole: null,
  setOriginalRole: (originalRole) => set({ originalRole }),
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
  setGlobalText: (key, value) => set((state) => ({ globalTexts: { ...state.globalTexts, [key]: value } })),
  
  // Location defaults
  userLocation: null,
  setUserLocation: (userLocation) => set({ userLocation }),
  locationPermissionStatus: 'NOT_REQUESTED',
  setLocationPermissionStatus: (locationPermissionStatus) => set({ locationPermissionStatus }),
  searchRadius: 50,
  setSearchRadius: (searchRadius) => set({ searchRadius }),
  adminPitches: IS_LOCAL_DEV ? PITCHES : [],
  adminGoalkeepers: IS_LOCAL_DEV ? GOALKEEPERS : [],
  adminReferees: IS_LOCAL_DEV ? REFEREES : [],
  adminMatches: IS_LOCAL_DEV ? MATCH_LISTINGS : [],
  adminUsers: INITIAL_USERS,
  adminNotifications: IS_LOCAL_DEV ? INITIAL_NOTIFICATIONS : [],
  adminLogs: [],
  adminDashboardStats: null,
  adminTeams: IS_LOCAL_DEV ? USER_TEAMS : [],
  appSettings: INITIAL_SETTINGS,
  
  loadOwnerData: async (ownerUserId?: string) => {
    if (!ownerUserId) return;
    await import('./services/ownerAccountService').then(({ getOrCreateOwnerAccount }) =>
      getOrCreateOwnerAccount(ownerUserId),
    );
  },

  announcementBanner: INITIAL_SETTINGS.announcementBanner,
  showAnnouncementBanner: INITIAL_SETTINGS.showAnnouncementBanner,
  playerSeekAds: [
    {
      id: "psa1",
      creatorId: "u2",
      creatorName: "Burak Demir",
      creatorAvatar: "https://i.pravatar.cc/150?u=burak2024",
      pitchName: "Arena Sport Center",
      date: "Bugün",
      time: "21:00",
      positionsNeeded: ["SAVUNMA", "ORTA"],
      difficulty: "Ciddi",
      format: "7v7",
      duration: "90 Dakika",
      gender: "Erkek",
      ageGroup: "23-27",
      status: "ACTIVE",
      createdAt: new Date().toISOString(),
      joinedPlayers: []
    },
    {
      id: "psa2",
      creatorId: "u3",
      creatorName: "Mert Arslan",
      creatorAvatar: "https://i.pravatar.cc/150?u=mert2024",
      pitchName: "BJK RAMADA Futbol Sahası",
      date: "Yarın",
      time: "22:00",
      positionsNeeded: ["KALECİ"],
      difficulty: "Taktiksel",
      format: "6v6",
      duration: "60 Dakika",
      gender: "Karma",
      ageGroup: "28-35",
      status: "ACTIVE",
      createdAt: new Date().toISOString(),
      joinedPlayers: []
    }
  ],
  addPlayerSeekAd: (ad) => set((state) => ({ playerSeekAds: [ad, ...state.playerSeekAds] })),
  toggleJoinPlayerSeekAd: (adId, userId) => set((state) => ({
    playerSeekAds: state.playerSeekAds.map(ad => {
      if (ad.id === adId) {
        const isJoined = ad.joinedPlayers?.includes(userId);
        const joinedPlayers = isJoined 
          ? (ad.joinedPlayers || []).filter(id => id !== userId)
          : [...(ad.joinedPlayers || []), userId];
        const acceptedPlayers = isJoined 
          ? (ad.acceptedPlayers || []).filter(id => id !== userId)
          : (ad.acceptedPlayers || []);
        return { ...ad, joinedPlayers, acceptedPlayers };
      }
      return ad;
    })
  })),
  acceptPlayerSeekAdRequest: (adId, userId) => set((state) => ({
    playerSeekAds: state.playerSeekAds.map(ad => {
      if (ad.id === adId) {
        const isAccepted = ad.acceptedPlayers?.includes(userId);
        const acceptedPlayers = isAccepted 
          ? (ad.acceptedPlayers || [])
          : [...(ad.acceptedPlayers || []), userId];
        return { ...ad, acceptedPlayers };
      }
      return ad;
    })
  })),
  chatTarget: null,
  setChatTarget: (chatTarget) => set({ chatTarget }),

  friends: [
    { id: '1', name: 'Caner Kaya', avatar: 'https://i.pravatar.cc/150?u=caner', nickname: 'CKaya', style: 'Bitirici', group: 'Lise Tayfası', online: true, isFavorite: true, wins: 24, losses: 5, position: 'FV', pos: 'FV', fp: 91, status: 'FRIEND' },
    { id: '2', name: 'Emre Demir', avatar: 'https://i.pravatar.cc/150?u=emre', nickname: 'EDemir', style: 'Duvar', group: 'Üniversite', online: false, isFavorite: false, wins: 12, losses: 14, position: 'STP', pos: 'STP', fp: 87, status: 'FRIEND' },
    { id: '3', name: 'Mert Arslan', avatar: 'https://i.pravatar.cc/150?u=mert', nickname: 'MArslan', style: 'Refleks', group: 'İş Arkadaşları', online: true, isFavorite: false, wins: 8, losses: 2, position: 'KL', pos: 'KL', fp: 80, status: 'FRIEND' },
    { id: '4', name: 'Ahmet Yılmaz', avatar: 'https://i.pravatar.cc/150?u=ahmet', nickname: 'AYilmaz', style: 'Fuleli', group: 'Lise Tayfası', online: true, isFavorite: true, wins: 30, losses: 10, position: 'SNT', pos: 'SNT', fp: 95, status: 'FRIEND' },
    { id: '5', name: 'Cem Yıldız', avatar: 'https://i.pravatar.cc/150?u=cem', nickname: 'CYildiz', style: 'Maestro', group: 'Lise Tayfası', online: false, isFavorite: false, wins: 15, losses: 12, position: 'OS', pos: 'OS', fp: 88, status: 'FRIEND' },
    { id: '6', name: 'Burak Şahin', avatar: 'https://i.pravatar.cc/150?u=burak', nickname: 'BSahin', style: 'Hızlı', group: 'Üniversite', online: true, isFavorite: true, wins: 40, losses: 8, position: 'SĞA', pos: 'SĞA', fp: 98, status: 'FRIEND' },
    { id: '7', name: 'Kaan Gök', avatar: 'https://i.pravatar.cc/150?u=kaan', nickname: 'KGok', style: 'Dengeli', group: 'Üniversite', online: false, isFavorite: false, wins: 5, losses: 5, position: 'BEK', pos: 'BEK', fp: 85, status: 'FRIEND' },
    { id: '8', name: 'Ozan Tekin', avatar: 'https://i.pravatar.cc/150?u=ozan', nickname: 'OTekin', style: 'Keser', group: 'İş Arkadaşları', online: true, isFavorite: false, wins: 20, losses: 20, position: 'MDO', pos: 'MDO', fp: 90, status: 'FRIEND' },
    { id: '9', name: 'Efe Korkmaz', avatar: 'https://i.pravatar.cc/150?u=efe', nickname: 'EKorkmaz', style: 'Çevik', group: 'İş Arkadaşları', online: false, isFavorite: true, wins: 18, losses: 6, position: 'SĞA', pos: 'SĞA', fp: 92, status: 'FRIEND' },
    { id: '10', name: 'Sinan Gül', avatar: 'https://i.pravatar.cc/150?u=sinan', nickname: 'SGul', style: 'Kaya', group: 'Lise Tayfası', online: true, isFavorite: false, wins: 25, losses: 15, position: 'STP', pos: 'STP', fp: 89, status: 'FRIEND' },
    { id: '11', name: 'Hakan Çelik', avatar: 'https://i.pravatar.cc/150?u=hakan', nickname: 'HCelik', style: 'Avcı', group: 'Üniversite', online: true, isFavorite: true, wins: 50, losses: 12, position: 'FV', pos: 'FV', fp: 99, status: 'FRIEND' },
    { id: '12', name: 'Oğuzhan Koç', avatar: 'https://i.pravatar.cc/150?u=oguzhan', nickname: 'OKoc', style: 'Uçan', group: 'Mahalle', online: false, isFavorite: false, wins: 2, losses: 8, position: 'KL', pos: 'KL', fp: 70, status: 'FRIEND' },
    { id: '13', name: 'Alperen Bal', avatar: 'https://i.pravatar.cc/150?u=alperen', nickname: 'ABal', style: 'Dinamik', group: 'Mahalle', online: true, isFavorite: false, wins: 10, losses: 5, position: 'OS', pos: 'OS', fp: 82, status: 'FRIEND' },
    { id: '14', name: 'Yusuf Can', avatar: 'https://i.pravatar.cc/150?u=yusuf', nickname: 'YCan', style: 'Motor', group: 'Üniversite', online: false, isFavorite: false, wins: 14, losses: 16, position: 'BEK', pos: 'BEK', fp: 84, status: 'FRIEND' },
    { id: '15', name: 'Deniz Sarp', avatar: 'https://i.pravatar.cc/150?u=deniz', nickname: 'DSarp', style: 'Yaratıcı', group: 'İş Arkadaşları', online: true, isFavorite: true, wins: 33, losses: 11, position: 'OS', pos: 'OS', fp: 94, status: 'FRIEND' }
  ] as any[],
  addFriend: (friend) => set((state) => {
    const next = [...state.friends, friend];
    const uid = auth.currentUser?.uid;
    if (uid) {
      // Firebase sync removed for now
    }
    return { friends: next };
  }),
  removeFriend: (id) => set((state) => {
    const next = state.friends.filter(f => f.id !== id);
    const uid = auth.currentUser?.uid;
    if (uid) {
      // Firebase sync removed for now
    }
    return { friends: next };
  }),
  acceptFriend: (id) => set((state) => {
    const next = state.friends.map(f => f.id === id ? { ...f, status: 'FRIEND' as const } : f);
    const uid = auth.currentUser?.uid;
    if (uid) {
      // Firebase sync removed for now
    }
    return { friends: next };
  }),
  addPendingFriend: (friend) => set((state) => {
    const next = [...state.friends, { ...friend, status: 'PENDING_SENT' as const }];
    const uid = auth.currentUser?.uid;
    if (uid) {
      // Firebase sync removed for now
    }
    return { friends: next };
  }),

  // Squad Builder
  selectedFriendsForTeam: [],
  toggleSelectedFriendForTeam: (id) => set((state) => ({
    selectedFriendsForTeam: state.selectedFriendsForTeam.includes(id) 
      ? state.selectedFriendsForTeam.filter(fid => fid !== id) 
      : [...state.selectedFriendsForTeam, id]
  })),
  clearSelectedFriendsForTeam: () => set({ selectedFriendsForTeam: [] }),

  // Mock takımlar yalnızca dev modda; prod'da Supabase'den hydrate edilir (loadMyTeams).
  userTeams: IS_LOCAL_DEV ? MOCK_TEAMS : [],

  myTeams: IS_LOCAL_DEV ? MOCK_TEAMS : [],
  addMyTeam: async (team) => {
      const prev = get().myTeams;
      set({ myTeams: [team, ...prev] });
      try { await FB.fbAddTeam(team); }
      catch (e) { set({ myTeams: prev }); throw e; }
  },
  addTeam: (team) => FB.fbAddTeam(team),

  // Takımlarımı DB'den yükle (login sonrası App.tsx çağırır).
  // userTeams da aynı kaynaktan beslenir — MatchCreate/MatchJoin bunu okuyor.
  loadMyTeams: async () => {
    const uid = auth.currentUser?.uid;
    if (!uid) return;
    const teams = await TeamService.fetchMyTeams(uid);
    if (teams.length > 0 || !IS_LOCAL_DEV) {
      set({ myTeams: teams, userTeams: teams });
    }
  },

  createTeam: async (input) => {
    const team = await TeamService.createTeam(input);
    set((state) => ({
      myTeams: [team, ...state.myTeams],
      userTeams: [team, ...state.userTeams],
    }));
    return team;
  },

  // Studio Transfer
  activeStudioTeam: null,
  setActiveStudioTeam: (team) => set({ activeStudioTeam: team }),
  teamTactics: [],
  fetchTeamTactics: async (teamId) => {
    if (!import.meta.env.VITE_SUPABASE_URL) {
      const mocks = MOCK_TACTICS.filter(t => t.teamId === teamId);
      const current = get().teamTactics;
      if (current.length === 0 || !current.some(c => c.teamId === teamId)) {
        set({ teamTactics: mocks });
      }
      return;
    }
    try {
      const { data, error } = await supabase
        .from('tactics')
        .select('*')
        .eq('teamId', teamId)
        .order('priority', { ascending: true });
      if (error) throw error;
      set({ teamTactics: data || [] });
    } catch (err) {
      console.error('fetchTeamTactics failed:', err);
    }
  },
  proposeTactic: async (tacticData) => {
    if (!import.meta.env.VITE_SUPABASE_URL) {
      const newMock = {
        ...tacticData,
        id: `mock_${Date.now()}`,
        status: 'PENDING_APPROVAL',
        priority: get().teamTactics.filter(t => t.status === 'APPROVED').length,
        createdAt: new Date().toISOString()
      };
      set(state => ({ teamTactics: [...state.teamTactics, newMock] }));
      return newMock;
    }
    try {
      const { data, error } = await supabase
        .from('tactics')
        .insert({
          ...tacticData,
          status: 'PENDING_APPROVAL',
          createdAt: new Date().toISOString()
        })
        .select()
        .single();
      if (error) throw error;
      set(state => ({ teamTactics: [...state.teamTactics, data] }));
      return data;
    } catch (err) {
      console.error('proposeTactic failed:', err);
      throw err;
    }
  },
  approveTactic: async (tacticId) => {
    if (!import.meta.env.VITE_SUPABASE_URL) {
      set(state => ({
        teamTactics: state.teamTactics.map(t => t.id === tacticId ? { ...t, status: 'APPROVED' } : t)
      }));
      return get().teamTactics.find(t => t.id === tacticId);
    }
    try {
      const { data, error } = await supabase
        .from('tactics')
        .update({ status: 'APPROVED' })
        .eq('id', tacticId)
        .select()
        .single();
      if (error) throw error;
      set(state => ({
        teamTactics: state.teamTactics.map(t => t.id === tacticId ? data : t)
      }));
      return data;
    } catch (err) {
      console.error('approveTactic failed:', err);
      throw err;
    }
  },
  rejectTactic: async (tacticId) => {
    if (!import.meta.env.VITE_SUPABASE_URL) {
      set(state => ({
        teamTactics: state.teamTactics.filter(t => t.id !== tacticId)
      }));
      return;
    }
    try {
      const { error } = await supabase
        .from('tactics')
        .delete()
        .eq('id', tacticId);
      if (error) throw error;
      set(state => ({
        teamTactics: state.teamTactics.filter(t => t.id !== tacticId)
      }));
    } catch (err) {
      console.error('rejectTactic failed:', err);
      throw err;
    }
  },
  updateTacticPriorities: async (teamId, orderedTacticIds) => {
    if (!import.meta.env.VITE_SUPABASE_URL) {
      set(state => {
        const reordered = state.teamTactics.map(t => {
          const idx = orderedTacticIds.indexOf(t.id);
          if (idx !== -1) {
            return { ...t, priority: idx };
          }
          return t;
        });
        reordered.sort((a, b) => (a.priority ?? 9999) - (b.priority ?? 9999));
        return { teamTactics: reordered };
      });
      return;
    }
    try {
      const updates = orderedTacticIds.map((id, index) => 
        supabase.from('tactics').update({ priority: index }).eq('id', id)
      );
      await Promise.all(updates);
      set(state => {
        const reordered = [...state.teamTactics];
        reordered.sort((a, b) => {
          const idxA = orderedTacticIds.indexOf(a.id);
          const idxB = orderedTacticIds.indexOf(b.id);
          return (idxA !== -1 ? idxA : 9999) - (idxB !== -1 ? idxB : 9999);
        });
        return { teamTactics: reordered };
      });
    } catch (err) {
      console.error('updateTacticPriorities failed:', err);
    }
  },
  updateTacticSlots: (tacticId, slots) => {
    const slotsStr = typeof slots === 'string' ? slots : JSON.stringify(slots);
    set(state => ({
      teamTactics: state.teamTactics.map(t => t.id === tacticId ? { ...t, slots: slotsStr } : t)
    }));
    if (import.meta.env.VITE_SUPABASE_URL) {
      Promise.resolve(supabase.from('tactics').update({ slots: slotsStr }).eq('id', tacticId)).catch(err => {
        console.error('Failed to sync tactic slots to DB:', err);
      });
    }
  },

  // Opponent Ads
  opponentAds: [],
  addOpponentAd: (ad) => set((state) => ({ opponentAds: [...state.opponentAds, ad] })),

  // Basic
  setView: (view) => set({ view }),
  setRole: (role) => set({ role }),
  setIsAuthReady: (isAuthReady) => set({ isAuthReady }),
  setAddOnTotal: (addOnTotal) => set({ addOnTotal }),
  setHasMotmCoupon: (has) => set({ hasMotmCoupon: has }),
  setSelectedMatch: (match) => set({ selectedMatch: match }),
  setIsUserPro: (isPro) => set({ isUserPro: isPro }),
  setSelectedDiaryId: (id) => set({ selectedDiaryId: id }),
  setActiveDraftId: (id) => set({ activeDraftId: id }),
  setSelectedGk: (selectedGk) => set({ selectedGk }),
  setSelectedRef: (selectedRef) => set({ selectedRef }),
  setMarketplaceReturnView: (marketplaceReturnView) => set({ marketplaceReturnView }),
  setMatchJoinReturnView: (matchJoinReturnView) => set({ matchJoinReturnView }),
  setBookingPitch: (bookingPitch) => set({ bookingPitch }),
  setBookingCourt: (bookingCourt) => set({ bookingCourt }),
  setBookingDate: (bookingDate) => set({ bookingDate }),
  setBookingSlot: (bookingSlot) => set({ bookingSlot }),
  setBookingPrice: (bookingPrice) => set({ bookingPrice }),
  setBookingDeposit: (bookingDeposit) => set({ bookingDeposit }),
  addSavedCard: (card) => {
    const next: SavedPaymentCard = { ...card, id: `card-${Date.now()}` };
    set((s) => {
      const savedCards = [...s.savedCards, next];
      persistSavedCards(savedCards);
      return { savedCards };
    });
  },
  removeSavedCard: (id) => {
    set((s) => {
      const savedCards = s.savedCards.filter((c) => c.id !== id);
      persistSavedCards(savedCards);
      return { savedCards };
    });
  },
  setWalletReturnView: (walletReturnView) => set({ walletReturnView }),
  setWalletInitialTab: (walletInitialTab) => set({ walletInitialTab }),
  setWalletPendingDeposit: (walletPendingDeposit) => set({ walletPendingDeposit }),

  // Direct Firebase Listener Setters
  initialLoadComplete: false,
  setInitialLoadComplete: (isComplete) => set({ initialLoadComplete: isComplete }),
  setAdminPitches: (adminPitches) => set({ adminPitches }),
  setAdminMatches: (adminMatches) => set({ adminMatches }),
  setAdminUsers: (adminUsers) => set({ adminUsers }),
  setAdminGoalkeepers: (adminGoalkeepers) => set({ adminGoalkeepers }),
  setAdminReferees: (adminReferees) => set({ adminReferees }),
  setAdminNotifications: (adminNotifications) => set({ adminNotifications }),
  setAdminTeams: (adminTeams) => set({ adminTeams }),

  // Pitch
  addPitch: async (pitch) => {
    const prev = get().adminPitches;
    set({ adminPitches: [pitch, ...prev] });
    try {
      const { createPitchAdmin, buildPitchPayloadFromUi } = await import('./admin-panel/services/adminService');
      try {
        const newId = await createPitchAdmin(buildPitchPayloadFromUi(pitch));
        set({ adminPitches: [{ ...pitch, id: newId }, ...prev] });
      } catch {
        await FB.fbAddPitch(pitch);
        if (get().adminSession) {
          const { persistAdminLog } = await import('./admin-panel/services/adminService');
          await persistAdminLog('PITCH_CREATE', 'pitch', pitch.id, pitch.name).catch(() => {});
        }
      }
    } catch (e) { set({ adminPitches: prev }); throw e; }
  },
  updatePitch: async (pitch) => {
    const prev = get().adminPitches;
    set({ adminPitches: prev.map(p => p.id === pitch.id ? pitch : p) });
    try {
      const { updatePitchAdmin, buildPitchPayloadFromUi } = await import('./admin-panel/services/adminService');
      try {
        await updatePitchAdmin(pitch.id, buildPitchPayloadFromUi(pitch));
      } catch {
        await FB.fbUpdatePitch(pitch);
        if (get().adminSession) {
          const { persistAdminLog } = await import('./admin-panel/services/adminService');
          await persistAdminLog('PITCH_UPDATE', 'pitch', pitch.id, pitch.name).catch(() => {});
        }
      }
    } catch (e) { set({ adminPitches: prev }); throw e; }
  },
  deletePitch: async (id) => {
    const prev = get().adminPitches;
    const pitch = prev.find(p => p.id === id);
    set({ adminPitches: prev.filter(p => p.id !== id) });
    try {
      const { deletePitchAdmin } = await import('./admin-panel/services/adminService');
      try {
        await deletePitchAdmin(id);
      } catch {
        await FB.fbDeletePitch(id);
        if (get().adminSession && pitch) {
          const { persistAdminLog } = await import('./admin-panel/services/adminService');
          await persistAdminLog('PITCH_DELETE', 'pitch', id, pitch.name).catch(() => {});
        }
      }
    } catch (e) { set({ adminPitches: prev }); throw e; }
  },

  // Goalkeeper
  addGoalkeeper: async (gk) => {
    const prev = get().adminGoalkeepers;
    set({ adminGoalkeepers: [gk, ...prev] });
    try { await FB.fbAddGoalkeeper(gk); }
    catch (e) { set({ adminGoalkeepers: prev }); throw e; }
  },
  updateGoalkeeper: async (gk) => {
    const prev = get().adminGoalkeepers;
    set({ adminGoalkeepers: prev.map(g => g.id === gk.id ? gk : g) });
    try {
      const { updateGoalkeeperAdmin } = await import('./admin-panel/services/adminService');
      await updateGoalkeeperAdmin(gk);
    } catch (e) { set({ adminGoalkeepers: prev }); throw e; }
  },
  deleteGoalkeeper: async (id) => {
    const prev = get().adminGoalkeepers;
    const gk = prev.find(g => g.id === id);
    set({ adminGoalkeepers: prev.filter(g => g.id !== id) });
    try {
      const { deleteGoalkeeperAdmin } = await import('./admin-panel/services/adminService');
      try {
        await deleteGoalkeeperAdmin(id);
      } catch {
        await FB.fbDeleteGoalkeeper(id);
        if (get().adminSession && gk) {
          const { persistAdminLog } = await import('./admin-panel/services/adminService');
          await persistAdminLog('GK_DELETE', 'goalkeeper', id, gk.name).catch(() => {});
        }
      }
    } catch (e) { set({ adminGoalkeepers: prev }); throw e; }
  },

  // Referee
  addReferee: async (ref) => {
    const prev = get().adminReferees;
    set({ adminReferees: [ref, ...prev] });
    try { await FB.fbAddReferee(ref); }
    catch (e) { set({ adminReferees: prev }); throw e; }
  },
  updateReferee: async (ref) => {
    const prev = get().adminReferees;
    set({ adminReferees: prev.map(r => r.id === ref.id ? ref : r) });
    try {
      const { updateRefereeAdmin } = await import('./admin-panel/services/adminService');
      await updateRefereeAdmin(ref);
    } catch (e) { set({ adminReferees: prev }); throw e; }
  },
  deleteReferee: async (id) => {
    const prev = get().adminReferees;
    const ref = prev.find(r => r.id === id);
    set({ adminReferees: prev.filter(r => r.id !== id) });
    try {
      const { deleteRefereeAdmin } = await import('./admin-panel/services/adminService');
      try {
        await deleteRefereeAdmin(id);
      } catch {
        await FB.fbDeleteReferee(id);
        if (get().adminSession && ref) {
          const { persistAdminLog } = await import('./admin-panel/services/adminService');
          await persistAdminLog('REF_DELETE', 'referee', id, ref.name).catch(() => {});
        }
      }
    } catch (e) { set({ adminReferees: prev }); throw e; }
  },

  // Load Services from DB
  loadServices: async () => {
    try {
      const { fetchGoalkeepersAdmin, fetchRefereesAdmin } = await import('./admin-panel/services/adminService');
      const [gks, refs] = await Promise.all([fetchGoalkeepersAdmin(), fetchRefereesAdmin()]);
      set({ adminGoalkeepers: gks || [], adminReferees: refs || [] });
    } catch (err) {
      console.error('Error loading services', err);
    }
  },

  // Match
  addMatch: async (match) => {
    const prev = get().adminMatches;
    set({ adminMatches: [match, ...prev] });
    try {
      const { createMatchAdmin } = await import('./admin-panel/services/adminService');
      const { listingToMatchPayload } = await import('./admin-panel/utils/matchMapper');
      const newId = await createMatchAdmin(listingToMatchPayload(match));
      set({ adminMatches: [{ ...match, id: newId }, ...prev] });
    } catch (e) { set({ adminMatches: prev }); throw e; }
  },
  updateMatch: async (match) => {
    const prev = get().adminMatches;
    set({ adminMatches: prev.map(m => m.id === match.id ? match : m) });
    try {
      const { updateMatchAdmin } = await import('./admin-panel/services/adminService');
      const { listingToMatchPayload } = await import('./admin-panel/utils/matchMapper');
      await updateMatchAdmin(match.id, listingToMatchPayload(match));
    } catch (e) { set({ adminMatches: prev }); throw e; }
  },
  deleteMatch: async (id) => {
    const prev = get().adminMatches;
    set({ adminMatches: prev.filter(m => m.id !== id) });
    try {
      const { deleteMatchAdmin } = await import('./admin-panel/services/adminService');
      await deleteMatchAdmin(id);
    } catch (e) { set({ adminMatches: prev }); throw e; }
  },

  // Supabase Plei/Fubles Hybrid
  joinMatchPleiAction: async (matchId, slotId, role) => {
    const state = get();
    const match = state.adminMatches.find(m => m.id === matchId);
    if (!match) return;
    
    // 1. Optimistic Update
    const previousSlots = match.slots ? [...match.slots] : [];
    
    const currentUserUid = auth.currentUser?.uid || 'u1';
    const currentUserProfile = state.adminUsers.find(u => u.id === currentUserUid) || state.adminUsers[0] || { id: 'u1', name: 'Oyuncu', avatar: 'https://i.pravatar.cc/150' };

    const joinedPlayer: Player = {
      id: currentUserProfile.id || 'u1',
      name: currentUserProfile.name || 'Oyuncu',
      avatar: currentUserProfile.avatar || `https://i.pravatar.cc/150?u=${currentUserProfile.id}`,
      rating: (currentUserProfile as any).rating || 4.5,
      position: role,
      x: 50,
      y: 50,
    };
    
    const updatedSlots = previousSlots.map(s => 
      s?.id === slotId ? { ...s, status: 'TAKEN' as const, player: joinedPlayer } : s
    );
    
    set({ adminMatches: state.adminMatches.map(m => m.id === matchId ? { ...m, slots: updatedSlots } : m) });

    try {
      // 2. Gerçek RPC çağrısı
      const { error } = await supabase.rpc('join_match_slot', {
        p_match_id: matchId,
        p_user_id: currentUserUid,
        p_slot_id: slotId,
        p_slot_role: role
      });
      if (error) throw error;
    } catch (error) {
      console.error('Supabase join failed:', error);
      // 3. Rollback
      set({ adminMatches: get().adminMatches.map(m => m.id === matchId ? { ...m, slots: previousSlots } : m) });
      throw error; 
    }
  },

  initSupabaseRealtime: () => {
    supabase
      .channel('public:match_registrations')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'match_registrations' }, (payload) => {
        console.log('Realtime Match Registration Update:', payload);
      })
      .subscribe();
      
    supabase
      .channel('public:waitlist')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'waitlist' }, (payload) => {
        console.log('Realtime Waitlist Update:', payload);
      })
      .subscribe();
  },

  // User
  updateUser: async (user) => {
    const prev = get().adminUsers;
    const existing = prev.find(u => u.id === user.id);
    set({ adminUsers: prev.map(u => u.id === user.id ? user : u) });
    try {
      const svc = await import('./admin-panel/services/adminService');
      if (existing && existing.isBanned !== user.isBanned) {
        await svc.banUserAdmin(user.id, user.isBanned, user.banExpiresAt ?? null);
      }
      await svc.updateUserProfileAdmin(user);
    } catch (e) { set({ adminUsers: prev }); throw e; }
  },
  setNewMatchBadge: async (val) => {
    const uid = auth.currentUser?.uid || 'u1';
    const user = get().adminUsers.find(u => u.id === uid);
    if (user) {
      const prev = get().adminUsers;
      set({ adminUsers: prev.map(u => u.id === uid ? { ...u, newMatchBadge: val } : u) });
      try { await FB.fbUpdateUser({ ...user, newMatchBadge: val }); }
      catch { set({ adminUsers: prev }); }
    }
  },
  banUser: async (id) => {
    const prev = get().adminUsers;
    set({ adminUsers: prev.map(u => u.id === id ? { ...u, isBanned: true } : u) });
    try {
      const { banUserAdmin } = await import('./admin-panel/services/adminService');
      await banUserAdmin(id, true);
    } catch (e) { set({ adminUsers: prev }); throw e; }
  },
  unbanUser: async (id) => {
    const prev = get().adminUsers;
    set({ adminUsers: prev.map(u => u.id === id ? { ...u, isBanned: false } : u) });
    try {
      const { banUserAdmin } = await import('./admin-panel/services/adminService');
      await banUserAdmin(id, false);
    } catch (e) { set({ adminUsers: prev }); throw e; }
  },
  toggleUserPro: async (id) => {
    const user = get().adminUsers.find(u => u.id === id);
    if (user) {
      const prev = get().adminUsers;
      const nextPro = !user.isPro;
      set({ adminUsers: prev.map(u => u.id === id ? { ...u, isPro: nextPro } : u) });
      try {
        const { toggleUserProAdmin } = await import('./admin-panel/services/adminService');
        await toggleUserProAdmin(id, nextPro);
      } catch (e) { set({ adminUsers: prev }); throw e; }
    }
  },
  verifyUser: async (id) => {
    const prev = get().adminUsers;
    set({ adminUsers: prev.map(u => u.id === id ? { ...u, isVerified: true } : u) });
    try {
      const { verifyUserAdmin } = await import('./admin-panel/services/adminService');
      await verifyUserAdmin(id);
    } catch (e) { set({ adminUsers: prev }); throw e; }
  },
  addUser: async (user) => {
    // Kullanıcı zaten createUserAdmin (admin-create-user edge function) ile
    // Auth + profiles'a kalıcı yazılmış oluyor. Burada tekrar ham insert yapmak
    // PK çakışması/şema hatasına yol açıp optimistic kaydı geri alıyordu (F4).
    // Sadece yerel listeye ekle.
    set((state) => ({ adminUsers: [user, ...state.adminUsers] }));
  },
  deleteUser: async (id) => {
    const prev = get().adminUsers;
    set({ adminUsers: prev.filter(u => u.id !== id) });
    try {
      const { processAccountDeletion } = await import('./admin-panel/services/adminService');
      await processAccountDeletion(id, true);
    } catch (e) { set({ adminUsers: prev }); throw e; }
  },

  // Notifications
  addNotification: (n) => FB.fbAddNotification(n),
  deleteNotification: (id) => FB.fbDeleteNotification(id),
  toggleNotification: (id) => {
    const notif = get().adminNotifications.find(n => n.id === id);
    if (notif) FB.fbToggleNotificationAlert(id, !notif.isActive);
  },

  loadAdminData: ({ users, settings, auditLogs, stats, texts }) => set((state) => ({
    adminUsers: users,
    appSettings: settings ? { ...state.appSettings, ...settings } : state.appSettings,
    adminLogs: auditLogs,
    adminDashboardStats: stats,
    globalTexts: texts ? { ...state.globalTexts, ...texts } : state.globalTexts,
    announcementBanner: settings?.announcementBanner ?? state.announcementBanner,
    showAnnouncementBanner: settings?.showAnnouncementBanner ?? state.showAnnouncementBanner,
  })),

  clearAdminMockState: () => set({
    adminPitches: [],
    adminMatches: [],
    adminTeams: [],
    adminGoalkeepers: [],
    adminReferees: [],
    adminUsers: [],
    adminNotifications: [],
    adminDashboardStats: null,
    adminLogs: [],
  }),

  setAdminInventoryData: ({ pitches, matches, teams, goalkeepers, referees, texts }) =>
    set((state) => ({
      adminPitches: pitches,
      adminMatches: matches,
      adminTeams: teams,
      adminGoalkeepers: goalkeepers,
      adminReferees: referees,
      globalTexts: texts ? { ...state.globalTexts, ...texts } : state.globalTexts,
    })),

  // App Settings
  updateAppSettings: async (settings) => {
    const prev = get().appSettings;
    const next = { ...prev, ...settings };
    set({ appSettings: next });
    try {
      const { updateSettingsAdmin, settingsToDbPayload } = await import('./admin-panel/services/adminService');
      await updateSettingsAdmin(settingsToDbPayload({
        ...settings,
        payoutMode: settings.payoutMode as 'cash' | 'online' | 'deposit' | undefined,
      }));
    } catch (e) {
      set({ appSettings: prev });
      throw e;
    }
  },
  addAdminLog: (log) => {
    const adminId = log.adminId || get().adminSession?.userId || 'system';
    const entry: AdminLog = {
      ...log,
      adminId,
      id: Math.random().toString(36).substr(2, 9),
      timestamp: new Date().toISOString(),
    };
    set((state) => ({ adminLogs: [entry, ...state.adminLogs] }));
    import('./admin-panel/services/adminService').then(({ persistAdminLog }) => {
      persistAdminLog(
        log.action,
        'system',
        log.targetId || null,
        log.targetName,
        undefined,
        { details: log.details },
      ).catch((err) => console.warn('Audit log persist failed:', err));
    });
  },

  // User Notifications
  userNotifications: [],
  isNotificationsOpen: false,
  setIsNotificationsOpen: (open) => set({ isNotificationsOpen: open }),
  addUserNotification: (notif) => set((state) => {
    const updatedList = [
      { id: Date.now().toString(), read: false, ...notif } as any,
      ...state.userNotifications
    ];
    return { userNotifications: updatedList };
  }),
  removeUserNotification: (id) => set((state) => ({ userNotifications: state.userNotifications.filter((n) => n.id !== id) })),
  markAllNotificationsAsRead: () => set((state) => ({
    userNotifications: state.userNotifications.map(n => ({ ...n, read: true }))
  })),
  acceptMatchInvite: (id) => {
    const state = get();
    const notif = state.userNotifications.find((n) => n.id === id);
    if (notif && notif.payload) {
      const { matchId, slotId } = notif.payload;
      const match = state.adminMatches.find((m) => m.id === matchId);
      if (match) {
        const slot = (match.slots || []).find(s => s?.id === slotId);
        
        // Race condition: Eğer slot başkası tarafından doldurulmuşsa
        if (slot && slot.status === 'TAKEN') {
          // Kabul edemez, hata bildirimi atalım
          const errorNotif = {
            id: `err_slot_${Date.now()}`,
            type: 'alert',
            title: 'Slot Doldu',
            desc: 'Davet edildiğiniz pozisyona maalesef başka bir oyuncu katılmış.',
            time: 'Az önce',
            iconName: 'AlertCircle',
            color: '#ef4444', // Red
            textColor: '#fff',
            read: false,
          };
          set((state) => ({ 
            userNotifications: [errorNotif, ...state.userNotifications.filter((n) => n.id !== id)] 
          }));
          return; // İşlemi iptal et
        }

        const currentUserUid = auth.currentUser?.uid || 'u1';
        const currentUserProfile = state.adminUsers.find(u => u.id === currentUserUid) || state.adminUsers[0] || { id: 'u1', name: 'Kerem Y.', avatar: 'https://i.pravatar.cc/150?u=u1' };

        const joinedPlayer: Player = {
          id: currentUserProfile.id || 'u1',
          name: currentUserProfile.name || 'Oyuncu',
          avatar: currentUserProfile.avatar || `https://i.pravatar.cc/150?u=${currentUserProfile.id}`,
          rating: 4.5,
          position: 'OYUNCU',
          x: 50,
          y: 50,
        };
        const updatedSlots = (match.slots || []).map((s) =>
          s?.id === slotId ? { ...s, status: 'TAKEN' as const, player: joinedPlayer } : s
        );
        state.updateMatch({ ...match, slots: updatedSlots });
      }
    }
    set((state) => ({ userNotifications: state.userNotifications.filter((n) => n.id !== id) }));
  },
  rejectMatchInvite: (id) => {
    set((state) => ({ userNotifications: state.userNotifications.filter((n) => n.id !== id) }));
  },
  unreadNotificationsCount: 0,
  incrementUnreadNotifications: () => set((state) => ({ unreadNotificationsCount: state.unreadNotificationsCount + 1 })),
  clearUnreadNotifications: () => set({ unreadNotificationsCount: 0 }),

  // ─── Push Notification State ───────────────────────────────────
  pushToken: null,
  setPushToken: (token) => set({ pushToken: token }),
  notificationPreferences: DEFAULT_NOTIFICATION_PREFERENCES,
  setNotificationPreferences: (prefs) => set({ notificationPreferences: prefs }),
  updateSingleNotificationPref: (key, enabled) => set((state) => {
    const current = state.notificationPreferences[key];
    // Zorunlu bildirimleri kapatamayız
    if (current?.mandatory) return state;
    return {
      notificationPreferences: {
        ...state.notificationPreferences,
        [key]: { ...current, enabled },
      },
    };
  }),
}));
