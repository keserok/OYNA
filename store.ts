import { create } from 'zustand';
import { AppView, UserRole, MatchListing, Goalkeeper, Referee, Pitch, OpponentListing, Team, AdminUser, Player } from './types';
import { GOALKEEPERS, REFEREES, PITCHES, MATCH_LISTINGS, OPPONENT_LISTINGS, USER_TEAMS } from './constants';
import * as FB from './firebaseMutations';
import { auth, db } from './firebase';
import { doc, updateDoc } from 'firebase/firestore';
import { supabase } from './supabaseClient';

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

export const INITIAL_USERS: AdminUser[] = [
  // ── 5 OYUNCULAR ─────────────────────────────────────
  {
    id: 'u1', name: 'Kerem Yılmaz', email: 'kerem@oyna.app', phone: '+90 532 111 22 33',
    avatar: 'https://i.pravatar.cc/150?u=kerem2024',
    role: UserRole.CAPTAIN, rating: 4.9, isVerified: true, isBanned: false, isPro: true,
    joinDate: '15 Oca 2024', matchCount: 52, reliabilityScore: 100, banExpiresAt: null
  },
  {
    id: 'u2', name: 'Burak Demir', email: 'burak@oyna.app', phone: '+90 555 222 33 44',
    avatar: 'https://i.pravatar.cc/150?u=burak2024',
    role: UserRole.PLAYER, rating: 4.5, isVerified: true, isBanned: false, isPro: true,
    joinDate: '20 Oca 2024', matchCount: 34, reliabilityScore: 100, banExpiresAt: null
  },
  {
    id: 'u3', name: 'Mert Arslan', email: 'mert@oyna.app', phone: '+90 555 333 44 55',
    avatar: 'https://i.pravatar.cc/150?u=mert2024',
    role: UserRole.PLAYER, rating: 4.1, isVerified: true, isBanned: false, isPro: false,
    joinDate: '03 Şub 2024', matchCount: 18, reliabilityScore: 100, banExpiresAt: null
  },
  {
    id: 'u4', name: 'Arda Kaya', email: 'arda@oyna.app', phone: '+90 533 444 55 66',
    avatar: 'https://i.pravatar.cc/150?u=arda2024',
    role: UserRole.PLAYER, rating: 3.8, isVerified: false, isBanned: false, isPro: false,
    joinDate: '10 Şub 2024', matchCount: 9, reliabilityScore: 100, banExpiresAt: null
  },
  {
    id: 'u5', name: 'Emre Çelik', email: 'emre@oyna.app', phone: '+90 544 555 66 77',
    avatar: 'https://i.pravatar.cc/150?u=emre2024',
    role: UserRole.PLAYER, rating: 4.3, isVerified: true, isBanned: false, isPro: false,
    joinDate: '18 Şub 2024', matchCount: 25, reliabilityScore: 100, banExpiresAt: null
  },
  // ── 5 KALECİLER ─────────────────────────────────────
  {
    id: 'ugk1', name: 'Fernando Muslera', email: 'muslera@oyna.app', phone: '+90 532 999 88 77',
    avatar: 'https://img.a.transfermarkt.technology/portrait/header/44062-1701163458.jpg?lm=1',
    role: UserRole.GOALKEEPER, rating: 4.9, isVerified: true, isBanned: false, isPro: true,
    joinDate: '10 Oca 2024', matchCount: 31, reliabilityScore: 100, banExpiresAt: null
  },
  {
    id: 'ugk2', name: 'Dominik Livakovic', email: 'livakovic@oyna.app', phone: '+90 532 888 77 66',
    avatar: 'https://img.a.transfermarkt.technology/portrait/header/206386-1669112448.jpg?lm=1',
    role: UserRole.GOALKEEPER, rating: 4.8, isVerified: true, isBanned: false, isPro: true,
    joinDate: '12 Oca 2024', matchCount: 27, reliabilityScore: 100, banExpiresAt: null
  },
  {
    id: 'ugk3', name: 'Uğurcan Çakır', email: 'ugurcan@oyna.app', phone: '+90 532 777 66 55',
    avatar: 'https://img.a.transfermarkt.technology/portrait/header/293279-1669112520.jpg?lm=1',
    role: UserRole.GOALKEEPER, rating: 4.7, isVerified: true, isBanned: false, isPro: true,
    joinDate: '15 Oca 2024', matchCount: 22, reliabilityScore: 100, banExpiresAt: null
  },
  {
    id: 'ugk4', name: 'Mert Günok', email: 'gunok@oyna.app', phone: '+90 533 666 55 44',
    avatar: 'https://img.a.transfermarkt.technology/portrait/header/50582-1669112502.jpg?lm=1',
    role: UserRole.GOALKEEPER, rating: 4.7, isVerified: true, isBanned: false, isPro: false,
    joinDate: '20 Oca 2024', matchCount: 19, reliabilityScore: 100, banExpiresAt: null
  },
  {
    id: 'ugk5', name: 'Altay Bayındır', email: 'altay@oyna.app', phone: '+90 533 555 44 33',
    avatar: 'https://img.a.transfermarkt.technology/portrait/header/335820-1669112484.jpg?lm=1',
    role: UserRole.GOALKEEPER, rating: 4.5, isVerified: true, isBanned: false, isPro: false,
    joinDate: '25 Oca 2024', matchCount: 15, reliabilityScore: 100, banExpiresAt: null
  },
  // ── 5 HAKEMLER ──────────────────────────────────────
  {
    id: 'uref1', name: 'Cüneyt Çakır', email: 'cakir@oyna.app', phone: '+90 533 777 66 55',
    avatar: 'https://img.a.transfermarkt.technology/portrait/header/115821-1669112628.jpg?lm=1',
    role: UserRole.REFEREE, rating: 4.9, isVerified: true, isBanned: false, isPro: true,
    joinDate: '05 Oca 2024', matchCount: 58, reliabilityScore: 100, banExpiresAt: null
  },
  {
    id: 'uref2', name: 'Fırat Aydınus', email: 'aydin@oyna.app', phone: '+90 533 666 77 88',
    avatar: 'https://img.a.transfermarkt.technology/portrait/header/115822-1669112646.jpg?lm=1',
    role: UserRole.REFEREE, rating: 4.7, isVerified: true, isBanned: false, isPro: true,
    joinDate: '08 Oca 2024', matchCount: 44,
  },
  {
    id: 'uref3', name: 'Halil Umut Meler', email: 'meler@oyna.app', phone: '+90 534 555 66 77',
    avatar: 'https://img.a.transfermarkt.technology/portrait/header/115823-1669112664.jpg?lm=1',
    role: UserRole.REFEREE, rating: 4.8, isVerified: true, isBanned: false, isPro: true,
    joinDate: '11 Oca 2024', matchCount: 38,
  },
  {
    id: 'uref4', name: 'Ali Palabıyık', email: 'palabiyik@oyna.app', phone: '+90 534 444 55 66',
    avatar: 'https://img.a.transfermarkt.technology/portrait/header/115824-1669112682.jpg?lm=1',
    role: UserRole.REFEREE, rating: 4.4, isVerified: true, isBanned: false, isPro: false,
    joinDate: '18 Oca 2024', matchCount: 29,
  },
  {
    id: 'uref5', name: 'Abdulkadir Bitigen', email: 'bitigen@oyna.app', phone: '+90 534 333 44 55',
    avatar: 'https://img.a.transfermarkt.technology/portrait/header/115825-1669112700.jpg?lm=1',
    role: UserRole.REFEREE, rating: 4.5, isVerified: false, isBanned: false, isPro: false,
    joinDate: '22 Oca 2024', matchCount: 21,
  },
];

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

  // Admin CRUD Data (live, reflected across whole app)
  adminPitches: Pitch[];
  adminGoalkeepers: Goalkeeper[];
  adminReferees: Referee[];
  adminMatches: MatchListing[];
  adminUsers: AdminUser[];
  adminNotifications: AdminNotification[];
  adminTeams: Team[];
  appSettings: AppSettings;

  // App-wide toggles
  announcementBanner: string;
  showAnnouncementBanner: boolean;

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
  setGlobalText: (key: string, value: string) => void;

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
  addPitch: (pitch: Pitch) => void;
  updatePitch: (pitch: Pitch) => void;
  deletePitch: (id: string) => void;

  // ─── Goalkeeper CRUD ───────────────────────────────────────────
  addGoalkeeper: (gk: Goalkeeper) => void;
  updateGoalkeeper: (gk: Goalkeeper) => void;
  deleteGoalkeeper: (id: string) => void;

  // ─── Referee CRUD ──────────────────────────────────────────────
  addReferee: (ref: Referee) => void;
  updateReferee: (ref: Referee) => void;
  deleteReferee: (id: string) => void;

  // ─── Supabase Plei Architecture ───────────────────────────────
  joinMatchPleiAction: (matchId: string, slotId: string, role: string) => Promise<void>;
  initSupabaseRealtime: () => void;

  // ─── Match CRUD ────────────────────────────────────────────────
  addMatch: (match: MatchListing) => void;
  updateMatch: (match: MatchListing) => void;
  deleteMatch: (id: string) => void;

  // ─── User CRUD ─────────────────────────────────────────────────
  updateUser: (user: AdminUser) => void;
  banUser: (id: string) => void;
  unbanUser: (id: string) => void;
  toggleUserPro: (id: string) => void;
  verifyUser: (id: string) => void;
  addUser: (user: AdminUser) => void;

  // ─── Notifications ─────────────────────────────────────────────
  addNotification: (n: AdminNotification) => void;
  deleteNotification: (id: string) => void;
  toggleNotification: (id: string) => void;

  // ─── App Settings ──────────────────────────────────────────────
  updateAppSettings: (settings: Partial<AppSettings>) => void;

  // ─── User Notifications ──────────────────────────────────────────
  userNotifications: UserNotificationItem[];
  addUserNotification: (notif: UserNotificationItem) => void;
  removeUserNotification: (id: string) => void;
  acceptMatchInvite: (notificationId: string) => void;
  rejectMatchInvite: (notificationId: string) => void;
  unreadNotificationsCount: number;
  incrementUnreadNotifications: () => void;
  clearUnreadNotifications: () => void;
}

export const useAppStore = create<AppState>((set, get) => ({
  view: 'DASHBOARD',
  role: UserRole.PLAYER,
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
  adminPitches: PITCHES,
  adminGoalkeepers: GOALKEEPERS,
  adminReferees: REFEREES,
  adminMatches: MATCH_LISTINGS,
  adminUsers: INITIAL_USERS,
  adminNotifications: INITIAL_NOTIFICATIONS,
  adminTeams: USER_TEAMS,
  appSettings: INITIAL_SETTINGS,
  announcementBanner: INITIAL_SETTINGS.announcementBanner,
  showAnnouncementBanner: INITIAL_SETTINGS.showAnnouncementBanner,

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
      updateDoc(doc(db, 'users', uid), { friends: next }).catch(err => console.warn("Failed to sync friend:", err));
    }
    return { friends: next };
  }),
  removeFriend: (id) => set((state) => {
    const next = state.friends.filter(f => f.id !== id);
    const uid = auth.currentUser?.uid;
    if (uid) {
      updateDoc(doc(db, 'users', uid), { friends: next }).catch(err => console.warn("Failed to sync remove friend:", err));
    }
    return { friends: next };
  }),
  acceptFriend: (id) => set((state) => {
    const next = state.friends.map(f => f.id === id ? { ...f, status: 'FRIEND' as const } : f);
    const uid = auth.currentUser?.uid;
    if (uid) {
      updateDoc(doc(db, 'users', uid), { friends: next }).catch(err => console.warn("Failed to sync accept friend:", err));
    }
    return { friends: next };
  }),
  addPendingFriend: (friend) => set((state) => {
    const next = [...state.friends, { ...friend, status: 'PENDING_SENT' as const }];
    const uid = auth.currentUser?.uid;
    if (uid) {
      updateDoc(doc(db, 'users', uid), { friends: next }).catch(err => console.warn("Failed to sync pending friend:", err));
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
  addMyTeam: (team) => {
      FB.fbAddTeam(team);
      set((state) => ({ myTeams: [team, ...state.myTeams] }));
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
  setGlobalText: (key, value) => set((state) => ({ globalTexts: { ...state.globalTexts, [key]: value } })),

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
  addPitch: (pitch) => FB.fbAddPitch(pitch),
  updatePitch: (pitch) => FB.fbUpdatePitch(pitch),
  deletePitch: (id) => FB.fbDeletePitch(id),

  // Goalkeeper
  addGoalkeeper: (gk) => FB.fbAddGoalkeeper(gk),
  updateGoalkeeper: (gk) => FB.fbUpdateGoalkeeper(gk),
  deleteGoalkeeper: (id) => FB.fbDeleteGoalkeeper(id),

  // Referee
  addReferee: (ref) => FB.fbAddReferee(ref),
  updateReferee: (ref) => FB.fbUpdateReferee(ref),
  deleteReferee: (id) => FB.fbDeleteReferee(id),

  // Match
  addMatch: (match) => FB.fbAddMatch(match),
  updateMatch: (match) => FB.fbUpdateMatch(match),
  deleteMatch: (id) => FB.fbDeleteMatch(id),

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
  updateUser: (user) => FB.fbUpdateUser(user),
  banUser: (id) => FB.fbBanUser(id, true),
  unbanUser: (id) => FB.fbBanUser(id, false),
  toggleUserPro: (id) => {
    const user = get().adminUsers.find(u => u.id === id);
    if (user) FB.fbToggleUserPro(id, !user.isPro);
  },
  verifyUser: (id) => FB.fbVerifyUser(id),
  addUser: (user) => FB.fbAddUser(user),

  // Notifications
  addNotification: (n) => FB.fbAddNotification(n),
  deleteNotification: (id) => FB.fbDeleteNotification(id),
  toggleNotification: (id) => {
    const notif = get().adminNotifications.find(n => n.id === id);
    if (notif) FB.fbToggleNotificationAlert(id, !notif.isActive);
  },

  // App Settings
  updateAppSettings: (settings) => FB.fbUpdateAppSettings(settings),

  // User Notifications
  userNotifications: [],
  addUserNotification: (notif) => set((state) => ({ userNotifications: [notif, ...state.userNotifications] })),
  removeUserNotification: (id) => set((state) => ({ userNotifications: state.userNotifications.filter((n) => n.id !== id) })),
  acceptMatchInvite: (id) => {
    const state = get();
    const notif = state.userNotifications.find((n) => n.id === id);
    if (notif && notif.payload) {
      const { matchId, slotId } = notif.payload;
      const match = state.adminMatches.find((m) => m.id === matchId);
      if (match) {
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
}));
