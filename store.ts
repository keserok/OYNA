import { create } from 'zustand';
import { AppView, UserRole, MatchListing, Goalkeeper, Referee, Pitch, OpponentListing, Team, AdminUser, Player, PlayerSeekAnnouncement, AdminLog, SavedPaymentCard, WalletTab, Court } from './types';
import * as FB from './supabaseMutations';
import * as TeamService from './services/teamService';
import { auth } from './supabaseAuth';

import { supabase } from './supabaseClient';
import type { NotificationPreferences } from './notifications/pushService';
import { DEFAULT_NOTIFICATION_PREFERENCES } from './notifications/pushService';
import type { AdminSession } from './admin-panel/services/adminService';

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
  targetAudience: 'ALL' | 'PRO' | 'GK' | 'REFEREE';
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

export const IS_LOCAL_DEV =
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

// Kullanıcılar Supabase'den hydrate edilir; mock veri yok.
export const INITIAL_USERS: AdminUser[] = [];


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
  navigationStack: AppView[];
  role: UserRole | null;
  isAuthReady: boolean;
  hasMotmCoupon: boolean;
  selectedMatch: MatchListing | null;
  selectedDiaryId: string | null;
  selectedGk: Goalkeeper | null;
  selectedRef: Referee | null;
  // FAZ 3: rezervasyon → maç çevirme tohumu (MatchCreate ön-doldurma)
  matchCreateSeed: { pitchId?: string; pitchName?: string; district?: string; date?: string; time?: string; price?: number } | null;
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
  /** Geçerli ekranı geçmiş yığınına ekleyip yeni ekrana geçer. */
  navigateTo: (view: AppView) => void;
  /** Yığından bir önceki ekrana döner; yığın boşsa fallback (veya mevcut ekran) kullanılır. */
  goBack: (fallback?: AppView) => void;
  /** Geçmiş yığınını temizleyip verilen ekranı yeni kök olarak ayarlar. */
  resetNavigation: (view: AppView) => void;
  setRole: (role: UserRole | null) => void;
  setIsAuthReady: (isReady: boolean) => void;
  setHasMotmCoupon: (hasCoupon: boolean) => void;
  setSelectedMatch: (match: MatchListing | null) => void;
  setSelectedDiaryId: (id: string | null) => void;
  setMatchCreateSeed: (seed: AppState['matchCreateSeed']) => void;
  activeDraftId: string | null;
  setActiveDraftId: (id: string | null) => void;
  setSelectedGk: (gk: Goalkeeper | null) => void;
  setSelectedRef: (ref: Referee | null) => void;
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
  walletInitialTab: WalletTab;
  walletPendingDeposit: boolean;
  addSavedCard: (card: Omit<SavedPaymentCard, 'id'>) => void;
  removeSavedCard: (id: string) => void;
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
  addMatch: (match: MatchListing) => Promise<string | undefined>;
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

    // Maç listesini canlı tut: admin panelden veya başka bir oyuncudan gelen
    // ekleme/güncelleme/silme işlemleri sayfa yenilenmeden burada görünsün.
    supabase
      .channel('matches-list-sync')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'matches' }, (payload) => {
        if (payload.eventType === 'DELETE') {
          const oldId = (payload.old as any)?.id;
          if (!oldId) return;
          set((state) => ({ adminMatches: state.adminMatches.filter(m => m.id !== oldId) }));
          return;
        }
        const row = payload.new as unknown as MatchListing;
        if (!row?.id) return;
        set((state) => {
          const exists = state.adminMatches.some(m => m.id === row.id);
          return {
            adminMatches: exists
              ? state.adminMatches.map(m => m.id === row.id ? { ...m, ...row } : m)
              : [row, ...state.adminMatches]
          };
        });
      })
      .subscribe();
  },
  view: 'SPLASH',
  navigationStack: [],
  role: UserRole.PLAYER,
  isAuthReady: true,
  hasMotmCoupon: false,
  selectedMatch: null,
  selectedDiaryId: null,
  matchCreateSeed: null,
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
  walletInitialTab: 'MAIN',
  walletPendingDeposit: false,
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
  adminPitches: [],
  adminGoalkeepers: [],
  adminReferees: [],
  adminMatches: [],
  adminUsers: [],
  adminNotifications: [],
  adminLogs: [],
  adminDashboardStats: null,
  adminTeams: [],
  appSettings: INITIAL_SETTINGS,
  
  loadOwnerData: async (ownerUserId?: string) => {
    if (!ownerUserId) return;
    await import('./services/ownerAccountService').then(({ getOrCreateOwnerAccount }) =>
      getOrCreateOwnerAccount(ownerUserId),
    );
  },

  announcementBanner: INITIAL_SETTINGS.announcementBanner,
  showAnnouncementBanner: INITIAL_SETTINGS.showAnnouncementBanner,
  playerSeekAds: [],
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
  friends: [] as any[],
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

  // Takımlar Supabase'den hydrate edilir (loadMyTeams).
  userTeams: [],

  myTeams: [],
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
    set({ myTeams: teams, userTeams: teams });
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
  navigateTo: (newView) => set((state) => {
    if (state.view === newView) return {};
    return { navigationStack: [...state.navigationStack, state.view], view: newView };
  }),
  goBack: (fallback) => set((state) => {
    const stack = [...state.navigationStack];
    const previous = stack.pop();
    return { navigationStack: stack, view: previous ?? fallback ?? state.view };
  }),
  resetNavigation: (newView) => set({ navigationStack: [], view: newView }),
  setRole: (role) => set({ role }),
  setIsAuthReady: (isAuthReady) => set({ isAuthReady }),
  setHasMotmCoupon: (has) => set({ hasMotmCoupon: has }),
  setSelectedMatch: (match) => set({ selectedMatch: match }),
  setSelectedDiaryId: (id) => set({ selectedDiaryId: id }),
  setMatchCreateSeed: (seed) => set({ matchCreateSeed: seed }),
  setActiveDraftId: (id) => set({ activeDraftId: id }),
  setSelectedGk: (selectedGk) => set({ selectedGk }),
  setSelectedRef: (selectedRef) => set({ selectedRef }),
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
      const { listingToMatchPayload } = await import('./admin-panel/utils/matchMapper');
      const { data, error } = await supabase.rpc('player_create_match', { p_payload: listingToMatchPayload(match) });
      if (error) throw error;
      const newId = data as string;
      set({ adminMatches: [{ ...match, id: newId }, ...prev] });
      return newId;
    } catch (e) { set({ adminMatches: prev }); throw e; }
  },
  updateMatch: async (match) => {
    const prev = get().adminMatches;
    set({ adminMatches: prev.map(m => m.id === match.id ? match : m) });
    try {
      const { listingToMatchPayload } = await import('./admin-panel/utils/matchMapper');
      const { error } = await supabase.rpc('player_update_match', { p_match_id: match.id, p_payload: listingToMatchPayload(match) });
      if (error) throw error;
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
    // Unused realtime subscriptions to match_registrations and waitlist dropped
    // as slots are now managed directly in the matches table JSONB.
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

    // Bildirimi hemen kaldır (UI donmasın)
    set((s) => ({ userNotifications: s.userNotifications.filter((n) => n.id !== id) }));

    if (!notif?.payload) return;
    const { matchId, slotId } = notif.payload;
    const match = state.adminMatches.find((m) => m.id === matchId);
    if (!match) return;

    const isAway = (match.awaySlots || []).some(s => s?.id === slotId);
    const targetSlots = isAway ? (match.awaySlots || []) : (match.slots || []);
    const slot = targetSlots.find(s => s?.id === slotId);

    // Local önkontrol — gerçek kilit RPC'de (FOR UPDATE)
    if (slot?.status === 'TAKEN') {
      set((s) => ({
        userNotifications: [{
          id: `err_slot_${Date.now()}`,
          type: 'alert',
          title: 'Slot Doldu',
          desc: 'Davet edildiğiniz pozisyona maalesef başka bir oyuncu katılmış.',
          time: 'Az önce',
          iconName: 'AlertCircle',
          color: '#ef4444',
          textColor: '#fff',
          read: false,
        }, ...s.userNotifications],
      }));
      return;
    }

    const userId = auth.currentUser?.uid;
    if (!userId) return;

    // Atomik katılım — join_public_match_slot RPC (FOR UPDATE kilit içeriyor)
    supabase.rpc('join_public_match_slot', {
      p_match_id: matchId,
      p_slot_id: slotId,
      p_user_id: userId,
      p_is_away: isAway,
    }).then(({ error }) => {
      if (error) {
        set((s) => ({
          userNotifications: [{
            id: `err_join_${Date.now()}`,
            type: 'alert',
            title: 'Katılım Başarısız',
            desc: error.message?.includes('dolu') ? 'Slot başka bir oyuncu tarafından dolduruldu.' : 'Maça katılırken hata oluştu.',
            time: 'Az önce',
            iconName: 'AlertCircle',
            color: '#ef4444',
            textColor: '#fff',
            read: false,
          }, ...s.userNotifications],
        }));
      }
      // Başarı durumunda Realtime subscription store'u güncelleyecek
    });
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
