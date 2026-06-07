import { create } from 'zustand';
import { AppView, UserRole, MatchListing, Goalkeeper, Referee, Pitch, OpponentListing, Team, AdminUser, Player, PlayerSeekAnnouncement, AdminLog } from './types';
import { GOALKEEPERS, REFEREES, PITCHES, MATCH_LISTINGS, OPPONENT_LISTINGS, USER_TEAMS } from './constants';
import { MOCK_USERS } from './__mocks__/mockUsers';
import * as FB from './supabaseMutations';
import { auth } from './supabaseAuth';

import { supabase } from './supabaseClient';
import type { NotificationPreferences } from './notifications/pushService';
import { DEFAULT_NOTIFICATION_PREFERENCES } from './notifications/pushService';

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
  adminTeams: Team[];
  appSettings: AppSettings;

  // ─── SaaS OwnerPanel (Patron Paneli) States ──────────────────────
  facilityUIConfigs: import('./types').FacilityUIConfig[];
  setFacilityUIConfigs: (configs: import('./types').FacilityUIConfig[]) => Promise<void>;
  roleAppearanceRules: import('./types').RoleAppearanceRule[];
  setRoleAppearanceRules: (rules: import('./types').RoleAppearanceRule[]) => Promise<void>;
  crmUsers: import('./types').CRMUser[];
  setCrmUsers: (users: import('./types').CRMUser[]) => void;
  addCrmUser: (user: import('./types').CRMUser) => Promise<void>;
  updateCrmUser: (user: import('./types').CRMUser) => Promise<void>;
  deleteCrmUser: (id: string) => Promise<void>;
  // ───────────────────────────────────────────────────────────────


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

  // ─── Studio Transfer ─────────────────────────────────────────────
  activeStudioTeam: Team | null;
  setActiveStudioTeam: (team: Team | null) => void;

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

  // ─── App Settings ──────────────────────────────────────────────
  updateAppSettings: (settings: Partial<AppSettings>) => void;

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
      const [sessionRes, pitchesRes, matchesRes, teamsRes, servicesRes] = await Promise.allSettled([
        withTimeout(supabase.auth.getSession()),
        withTimeout(FB.fbGetPitches()),
        withTimeout(FB.fbGetMatches()),
        withTimeout(FB.fbGetTeams()),
        withTimeout(get().loadServices(), 4000),
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
  marketplaceReturnView: 'DASHBOARD',
  matchJoinReturnView: 'MATCH_DISCOVERY',
  reliabilityScore: 100,
  banExpiresAt: null,
  setReliabilityScore: (score) => set({ reliabilityScore: score }),
  setBanExpiresAt: (banExpiresAt) => set({ banExpiresAt }),
  impersonatedUser: null,
  setImpersonatedUser: (impersonatedUser) => set({ impersonatedUser }),
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
  adminPitches: PITCHES,
  adminGoalkeepers: GOALKEEPERS,
  adminReferees: REFEREES,
  adminMatches: MATCH_LISTINGS,
  adminUsers: INITIAL_USERS,
  adminNotifications: INITIAL_NOTIFICATIONS,
  adminLogs: [],
  adminTeams: USER_TEAMS,
  appSettings: INITIAL_SETTINGS,
  
  facilityUIConfigs: [],
  setFacilityUIConfigs: async (configs) => {
    set({ facilityUIConfigs: configs });
    for (const config of configs) {
      await FB.fbSaveFacilityUIConfig(config).catch(e => console.error(e));
    }
  },
  roleAppearanceRules: [],
  setRoleAppearanceRules: async (rules) => {
    set({ roleAppearanceRules: rules });
    for (const rule of rules) {
      await FB.fbSaveRoleAppearanceRule(rule).catch(e => console.error(e));
    }
  },
  crmUsers: [],
  setCrmUsers: (users) => set({ crmUsers: users }),
  addCrmUser: async (user) => {
    const prev = get().crmUsers;
    set({ crmUsers: [user, ...prev] });
    try { await FB.fbAddCRMUser(user); }
    catch (e) { set({ crmUsers: prev }); throw e; }
  },
  updateCrmUser: async (user) => {
    const prev = get().crmUsers;
    set({ crmUsers: prev.map(u => u.id === user.id ? user : u) });
    try { await FB.fbUpdateCRMUser(user); }
    catch (e) { set({ crmUsers: prev }); throw e; }
  },
  deleteCrmUser: async (id) => {
    const prev = get().crmUsers;
    set({ crmUsers: prev.filter(u => u.id !== id) });
    try { await FB.fbDeleteCRMUser(id); }
    catch (e) { set({ crmUsers: prev }); throw e; }
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

  userTeams: [
    {
        id: 't1', name: 'Boğaziçi Kaplanları', shortName: 'BĞZ', location: 'Hisarüstü, İstanbul', 
        color1: '#10B981', color2: '#064E3B', crest: 'shield', players: ['1', '6', '11'], 
        roster: [{ id: '1', name: 'Caner Kaya', avatar: 'https://i.pravatar.cc/150?u=caner' }, { id: '6', name: 'Burak Şahin', avatar: 'https://i.pravatar.cc/150?u=burak' }, { id: '11', name: 'Hakan Çelik', avatar: 'https://i.pravatar.cc/150?u=hakan' }],
        logo: 'https://api.dicebear.com/7.x/shapes/svg?seed=bgz&backgroundColor=10B981',
        captain: '1', teamValue: '75000', wins: 14, losses: 3
    },
    {
        id: 't2', name: 'Karaköy Athletics', shortName: 'KRK', location: 'Karaköy, İstanbul', 
        color1: '#FF5722', color2: '#000000', crest: 'sword', players: ['4', '8', '15'], 
        roster: [{ id: '4', name: 'Ahmet Yılmaz', avatar: 'https://i.pravatar.cc/150?u=ahmet' }, { id: '8', name: 'Ozan Tekin', avatar: 'https://i.pravatar.cc/150?u=ozan' }, { id: '15', name: 'Deniz Sarp', avatar: 'https://i.pravatar.cc/150?u=deniz' }],
        logo: 'https://api.dicebear.com/7.x/shapes/svg?seed=krk&backgroundColor=FF5722',
        captain: '4', teamValue: '85000', wins: 22, losses: 8
    },
    {
        id: 't3', name: 'Moda United', shortName: 'MOD', location: 'Kadıköy, İstanbul', 
        color1: '#800000', color2: '#FFD700', crest: 'crown', players: ['2', '7', '14'], 
        roster: [{ id: '2', name: 'Emre Demir', avatar: 'https://i.pravatar.cc/150?u=emre' }, { id: '7', name: 'Kaan Gök', avatar: 'https://i.pravatar.cc/150?u=kaan' }, { id: '14', name: 'Yusuf Can', avatar: 'https://i.pravatar.cc/150?u=yusuf' }],
        logo: 'https://api.dicebear.com/7.x/shapes/svg?seed=mod&backgroundColor=800000',
        captain: '2', teamValue: '62000', wins: 15, losses: 10
    },
    {
        id: 't4', name: 'Maslak City FC', shortName: 'MSL', location: 'Sarıyer, İstanbul', 
        color1: '#00BCD4', color2: '#0A0E14', crest: 'lightning', players: ['3', '9', '10'], 
        roster: [{ id: '3', name: 'Mert Arslan', avatar: 'https://i.pravatar.cc/150?u=mert' }, { id: '9', name: 'Efe Korkmaz', avatar: 'https://i.pravatar.cc/150?u=efe' }, { id: '10', name: 'Sinan Gül', avatar: 'https://i.pravatar.cc/150?u=sinan' }],
        logo: 'https://api.dicebear.com/7.x/shapes/svg?seed=msl&backgroundColor=00BCD4',
        captain: '3', teamValue: '95000', wins: 30, losses: 5
    }
  ] as any[],
  // addTeam is synced directly to Firestore 'teams' collection below

  myTeams: [
    {
        id: 't1', name: 'Boğaziçi Kaplanları', shortName: 'BĞZ', location: 'Hisarüstü, İstanbul', 
        color1: '#10B981', color2: '#064E3B', crest: 'shield', players: ['1', '6', '11'], 
        roster: [{ id: '1', name: 'Caner Kaya', avatar: 'https://i.pravatar.cc/150?u=caner' }, { id: '6', name: 'Burak Şahin', avatar: 'https://i.pravatar.cc/150?u=burak' }, { id: '11', name: 'Hakan Çelik', avatar: 'https://i.pravatar.cc/150?u=hakan' }],
        logo: 'https://api.dicebear.com/7.x/shapes/svg?seed=bgz&backgroundColor=10B981',
        captain: '1', teamValue: '75000', wins: 14, losses: 3
    },
    {
        id: 't2', name: 'Karaköy Athletics', shortName: 'KRK', location: 'Karaköy, İstanbul', 
        color1: '#FF5722', color2: '#000000', crest: 'sword', players: ['4', '8', '15'], 
        roster: [{ id: '4', name: 'Ahmet Yılmaz', avatar: 'https://i.pravatar.cc/150?u=ahmet' }, { id: '8', name: 'Ozan Tekin', avatar: 'https://i.pravatar.cc/150?u=ozan' }, { id: '15', name: 'Deniz Sarp', avatar: 'https://i.pravatar.cc/150?u=deniz' }],
        logo: 'https://api.dicebear.com/7.x/shapes/svg?seed=krk&backgroundColor=FF5722',
        captain: '4', teamValue: '85000', wins: 22, losses: 8
    },
    {
        id: 't3', name: 'Moda United', shortName: 'MOD', location: 'Kadıköy, İstanbul', 
        color1: '#800000', color2: '#FFD700', crest: 'crown', players: ['2', '7', '14'], 
        roster: [{ id: '2', name: 'Emre Demir', avatar: 'https://i.pravatar.cc/150?u=emre' }, { id: '7', name: 'Kaan Gök', avatar: 'https://i.pravatar.cc/150?u=kaan' }, { id: '14', name: 'Yusuf Can', avatar: 'https://i.pravatar.cc/150?u=yusuf' }],
        logo: 'https://api.dicebear.com/7.x/shapes/svg?seed=mod&backgroundColor=800000',
        captain: '2', teamValue: '62000', wins: 15, losses: 10
    },
    {
        id: 't4', name: 'Maslak City FC', shortName: 'MSL', location: 'Sarıyer, İstanbul', 
        color1: '#00BCD4', color2: '#0A0E14', crest: 'lightning', players: ['3', '9', '10'], 
        roster: [{ id: '3', name: 'Mert Arslan', avatar: 'https://i.pravatar.cc/150?u=mert' }, { id: '9', name: 'Efe Korkmaz', avatar: 'https://i.pravatar.cc/150?u=efe' }, { id: '10', name: 'Sinan Gül', avatar: 'https://i.pravatar.cc/150?u=sinan' }],
        logo: 'https://api.dicebear.com/7.x/shapes/svg?seed=msl&backgroundColor=00BCD4',
        captain: '3', teamValue: '95000', wins: 30, losses: 5
    }
  ] as any[],
  addMyTeam: async (team) => {
      const prev = get().myTeams;
      set({ myTeams: [team, ...prev] });
      try { await FB.fbAddTeam(team); }
      catch (e) { set({ myTeams: prev }); throw e; }
  },
  addTeam: (team) => FB.fbAddTeam(team),

  // Studio Transfer
  activeStudioTeam: null,
  setActiveStudioTeam: (team) => set({ activeStudioTeam: team }),

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
    try { await FB.fbAddPitch(pitch); }
    catch (e) { set({ adminPitches: prev }); throw e; }
  },
  updatePitch: async (pitch) => {
    const prev = get().adminPitches;
    set({ adminPitches: prev.map(p => p.id === pitch.id ? pitch : p) });
    try { await FB.fbUpdatePitch(pitch); }
    catch (e) { set({ adminPitches: prev }); throw e; }
  },
  deletePitch: async (id) => {
    const prev = get().adminPitches;
    set({ adminPitches: prev.filter(p => p.id !== id) });
    try { await FB.fbDeletePitch(id); }
    catch (e) { set({ adminPitches: prev }); throw e; }
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
    try { await FB.fbUpdateGoalkeeper(gk); }
    catch (e) { set({ adminGoalkeepers: prev }); throw e; }
  },
  deleteGoalkeeper: async (id) => {
    const prev = get().adminGoalkeepers;
    set({ adminGoalkeepers: prev.filter(g => g.id !== id) });
    try { await FB.fbDeleteGoalkeeper(id); }
    catch (e) { set({ adminGoalkeepers: prev }); throw e; }
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
    try { await FB.fbUpdateReferee(ref); }
    catch (e) { set({ adminReferees: prev }); throw e; }
  },
  deleteReferee: async (id) => {
    const prev = get().adminReferees;
    set({ adminReferees: prev.filter(r => r.id !== id) });
    try { await FB.fbDeleteReferee(id); }
    catch (e) { set({ adminReferees: prev }); throw e; }
  },

  // Load Services from DB
  loadServices: async () => {
    try {
      const gks = await FB.fbGetGoalkeepers();
      if (gks && gks.length > 0) set({ adminGoalkeepers: gks });
      const refs = await FB.fbGetReferees();
      if (refs && refs.length > 0) set({ adminReferees: refs });
    } catch (err) {
      console.error('Error loading services', err);
    }
  },

  // Load Owner Data (SaaS)
  loadOwnerData: async (facilityId?: string) => {
    try {
      const [uiConfigs, roleRules, crmUsers] = await Promise.all([
        FB.fbGetFacilityUIConfigs(facilityId),
        FB.fbGetRoleAppearanceRules(facilityId),
        FB.fbGetCRMUsers(facilityId)
      ]);
      set({ 
        facilityUIConfigs: uiConfigs,
        roleAppearanceRules: roleRules,
        crmUsers: crmUsers
      });
    } catch (err) {
      console.error('Error loading owner data', err);
    }
  },

  // Match
  addMatch: async (match) => {
    const prev = get().adminMatches;
    set({ adminMatches: [match, ...prev] });
    try { await FB.fbAddMatch(match as any); }
    catch (e) { set({ adminMatches: prev }); throw e; }
  },
  updateMatch: async (match) => {
    const prev = get().adminMatches;
    set({ adminMatches: prev.map(m => m.id === match.id ? match : m) });
    try { await FB.fbUpdateMatch(match as any); }
    catch (e) { set({ adminMatches: prev }); throw e; }
  },
  deleteMatch: async (id) => {
    const prev = get().adminMatches;
    set({ adminMatches: prev.filter(m => m.id !== id) });
    try { await FB.fbDeleteMatch(id); }
    catch (e) { set({ adminMatches: prev }); throw e; }
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
    set({ adminUsers: prev.map(u => u.id === user.id ? user : u) });
    try { await FB.fbUpdateUser(user); }
    catch (e) { set({ adminUsers: prev }); throw e; }
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
    try { await FB.fbBanUser(id, true); }
    catch (e) { set({ adminUsers: prev }); throw e; }
  },
  unbanUser: async (id) => {
    const prev = get().adminUsers;
    set({ adminUsers: prev.map(u => u.id === id ? { ...u, isBanned: false } : u) });
    try { await FB.fbBanUser(id, false); }
    catch (e) { set({ adminUsers: prev }); throw e; }
  },
  toggleUserPro: async (id) => {
    const user = get().adminUsers.find(u => u.id === id);
    if (user) {
      const prev = get().adminUsers;
      set({ adminUsers: prev.map(u => u.id === id ? { ...u, isPro: !u.isPro } : u) });
      try { await FB.fbToggleUserPro(id, !user.isPro); }
      catch (e) { set({ adminUsers: prev }); throw e; }
    }
  },
  verifyUser: async (id) => {
    const prev = get().adminUsers;
    set({ adminUsers: prev.map(u => u.id === id ? { ...u, isVerified: true } : u) });
    try { await FB.fbVerifyUser(id); }
    catch (e) { set({ adminUsers: prev }); throw e; }
  },
  addUser: async (user) => {
    const prev = get().adminUsers;
    set({ adminUsers: [user, ...prev] });
    try { await FB.fbAddUser(user); }
    catch (e) { set({ adminUsers: prev }); throw e; }
  },
  deleteUser: async (id) => {
    const prev = get().adminUsers;
    set({ adminUsers: prev.filter(u => u.id !== id) });
    try { await FB.fbDeleteUser(id); }
    catch (e) { set({ adminUsers: prev }); throw e; }
  },

  // Notifications
  addNotification: (n) => FB.fbAddNotification(n),
  deleteNotification: (id) => FB.fbDeleteNotification(id),
  toggleNotification: (id) => {
    const notif = get().adminNotifications.find(n => n.id === id);
    if (notif) FB.fbToggleNotificationAlert(id, !notif.isActive);
  },

  // App Settings
  updateAppSettings: (settings) => FB.fbUpdateAppSettings(settings),
  addAdminLog: (log) => set((state) => ({
    adminLogs: [
      { ...log, id: Math.random().toString(36).substr(2, 9), timestamp: new Date().toISOString() },
      ...state.adminLogs
    ]
  })),

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
