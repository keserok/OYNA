import { create } from 'zustand';
import { AppView, UserRole, MatchListing, Goalkeeper, Referee, Pitch, OpponentListing, Team, AdminUser, Player, AdminLog, WalletTab, Court, OynaLocation, PaymentContext, PaymentErrorInfo, CurrentUserProfile } from './types';
import type { SavedCard } from './services/walletService';
import * as FB from './supabaseMutations';
import * as TeamService from './services/teamService';
import { auth } from './supabaseAuth';

import { supabase } from './supabaseClient';
import { trackEvent, captureException } from './utils/observability';
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
  commissionRate: number;
  minRatingToPlay: number;
  maxMatchsPerDay: number;
  featuredPitchId: string;
  announcementBanner: string;
  showAnnouncementBanner: boolean;
  payoutMode?: string;
}
// ─────────────────────────────────────────────────────────────────────

// Yalnızca açıkça VITE_DEV_MODE=true ise dev modu; env eksikliği dev moda DÜŞÜRMEZ
// (supabaseClient prod fallback'i ile gerçek backend'e bağlıyken mock moda geçmek tehlikeli).
export const IS_LOCAL_DEV = import.meta.env.VITE_DEV_MODE === 'true';

// Kayıtlı kartlar artık DB-backed (user_saved_cards, RLS) — localStorage mock
// kaldırıldı; ekranlar walletService.listSavedCards ile doldurur.

// ─── Aktif bölge (konum) kalıcılığı ──────────────────────────────
// Uygulama açılınca son bölgeyi hemen gösterir (kaynak 'restored' = tahmini),
// taze GPS gelince üstüne yazılır.
const ACTIVE_REGION_KEY = 'oyna_active_region';

function loadActiveRegion(): OynaLocation | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(ACTIVE_REGION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as OynaLocation;
    return parsed && parsed.city ? { ...parsed, source: 'restored' } : null;
  } catch {
    return null;
  }
}

function persistActiveRegion(region: OynaLocation | null) {
  if (typeof window === 'undefined') return;
  try {
    if (region) localStorage.setItem(ACTIVE_REGION_KEY, JSON.stringify(region));
    else localStorage.removeItem(ACTIVE_REGION_KEY);
  } catch {
    /* yoksay */
  }
}

// ─── Arama yarıçapı kalıcılığı ────────────────────────────────────
// activeRegion ile aynı desen: olmadan her açılışta sessizce 25km'ye dönüyordu.
const SEARCH_RADIUS_KEY = 'oyna_search_radius';

function loadSearchRadius(): number {
  if (typeof window === 'undefined') return 25;
  try {
    const raw = localStorage.getItem(SEARCH_RADIUS_KEY);
    const parsed = raw ? Number(raw) : NaN;
    return Number.isFinite(parsed) && parsed >= 5 && parsed <= 50 ? parsed : 25;
  } catch {
    return 25;
  }
}

function persistSearchRadius(radius: number) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(SEARCH_RADIUS_KEY, String(radius));
  } catch {
    /* yoksay */
  }
}

// ─── Çoklu bölge seçimi kalıcılığı ────────────────────────────────
// Kullanıcı birden fazla il/ilçe seçebilir; keşif (maç + saha) bu bölgelerin
// birleşimini gösterir. activeRegion "birincil" bölge olarak (etiket/GPS/harita
// merkezi) senkron tutulur.
const SELECTED_REGIONS_KEY = 'oyna_selected_regions';

/** İki bölge aynı mı? (il + ilçe; ilçe null = il geneli) */
export const sameRegion = (a: OynaLocation, b: OynaLocation): boolean =>
  a.city === b.city && (a.district ?? null) === (b.district ?? null);

function loadSelectedRegions(): OynaLocation[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(SELECTED_REGIONS_KEY);
    if (!raw) {
      // Geriye dönük: tek aktif bölge varsa onunla başla.
      const active = loadActiveRegion();
      return active ? [active] : [];
    }
    const parsed = JSON.parse(raw) as OynaLocation[];
    return Array.isArray(parsed) ? parsed.filter(r => r && r.city) : [];
  } catch {
    return [];
  }
}

function persistSelectedRegions(regions: OynaLocation[]) {
  if (typeof window === 'undefined') return;
  try {
    if (regions.length) localStorage.setItem(SELECTED_REGIONS_KEY, JSON.stringify(regions));
    else localStorage.removeItem(SELECTED_REGIONS_KEY);
  } catch {
    /* yoksay */
  }
}

// Kullanıcılar Supabase'den hydrate edilir; mock veri yok.
export const INITIAL_USERS: AdminUser[] = [];


const INITIAL_SETTINGS: AppSettings = {
  appName: 'OYNA',
  maintenanceMode: false,
  registrationOpen: true,
  commissionRate: 10,
  minRatingToPlay: 2.5,
  maxMatchsPerDay: 3,
  featuredPitchId: '1',
  announcementBanner: '🎉 OYNA v2.0 yayında! Yeni özellikler geldi.',
  showAnnouncementBanner: true,
};

interface AppState {
  isHydrated: boolean;
  /** H4: initApp'te kritik yük (maçlar/sahalar) zaman aşımıyla boş döndüyse true.
   *  UI bunu görüp "bağlantı zayıf, yeniden dene" afişi gösterebilir. */
  loadDegraded: boolean;
  initApp: () => Promise<void>;
  /** Zayıf-bağlantı afişinden tetiklenir: kritik verileri yeniden yükler. */
  retryInitialLoad: () => Promise<void>;
  view: AppView;
  navigationStack: AppView[];
  role: UserRole | null;
  isAuthReady: boolean;
  selectedMatch: MatchListing | null;
  // Lobi bağlamı: DISCOVER = Top Oyna'dan katılım (yönetim aksiyonları gizli),
  // MANAGE = Maçlarım hub'ından (ödediğin slotlar + kaptanlık yetkileri).
  lobbyMode: 'DISCOVER' | 'MANAGE';
  selectedDiaryId: string | null;
  // FAZ 6: Mesajlaşma → başlangıç konuşması (SocialView'den doğrudan sohbet açma)
  selectedConversationId: string | null;
  // SOSYAL yeniden tasarım — açık navigasyon yükleri (Foundation Spec §2.2)
  // Bildirim/derin bağlantı Sosyal'in doğru alt-sekmesine insin diye:
  socialTarget: { tab: 'FRIENDS' | 'TEAMS'; subTab?: string; entityId?: string } | null;
  setSocialTarget: (t: { tab: 'FRIENDS' | 'TEAMS'; subTab?: string; entityId?: string } | null) => void;
  // Takım Detayı hangi takımı gösterecek ("listedeki ilk takım" varsayımı yasak):
  selectedTeamId: string | null;
  setSelectedTeamId: (id: string | null) => void;
  // Takım Detayı açılış sekmesi (derin bağlantı: team/{id}/members → KADRO)
  teamInitialTab: 'GENEL' | 'KADRO' | 'TAKTIK' | 'MACLAR' | null;
  setTeamInitialTab: (t: 'GENEL' | 'KADRO' | 'TAKTIK' | 'MACLAR' | null) => void;
  // Birleşik gelen kutusu: açılışta odaklanacak takım sohbeti (team/{id}/chat)
  selectedTeamChatId: string | null;
  setSelectedTeamChatId: (id: string | null) => void;
  // Stüdyo'ya takım/taktik bağlamı (activeStudioTeam'in halefi; M80):
  studioContext: { teamId?: string; tacticId?: string } | null;
  setStudioContext: (c: { teamId?: string; tacticId?: string } | null) => void;
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

  // Aktif bölge — birincil bölge (etiket/GPS/harita merkezi). Çoklu seçimde
  // selectedRegions[0] ile eş tutulur.
  activeRegion: OynaLocation | null;
  setActiveRegion: (region: OynaLocation | null) => void;

  // Çoklu bölge — kullanıcı birden fazla il/ilçe seçebilir; keşif bunların
  // birleşimini gösterir. Boşsa uygulama tek activeRegion/GPS davranışına döner.
  selectedRegions: OynaLocation[];
  setSelectedRegions: (regions: OynaLocation[]) => void;
  addSelectedRegion: (region: OynaLocation) => void;
  removeSelectedRegion: (region: OynaLocation) => void;

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
  /** Profil'den sağlayıcı başvurusu için hedef rol (SERVICE_APPLICATION'a taşınır). */
  serviceAppRole: UserRole | null;
  setServiceAppRole: (r: UserRole | null) => void;
  setIsAuthReady: (isReady: boolean) => void;
  setSelectedMatch: (match: MatchListing | null) => void;
  setLobbyMode: (mode: 'DISCOVER' | 'MANAGE') => void;
  setSelectedDiaryId: (id: string | null) => void;
  setSelectedConversationId: (id: string | null) => void;
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
  // C4 — dürüst bilet: başarılı kapora sonrası GERÇEK rezervasyon id'si. Bilet
  // ekranı bunu okuyup sunucudan gerçek durumu/QR'ı türetir (sahte "ONAYLANDI" yok).
  ticketBookingId: string | null;
  setTicketBookingId: (id: string | null) => void;
  setBookingPitch: (pitch: Pitch | null) => void;
  setBookingCourt: (court: Court | null) => void;
  setBookingDate: (date: string | null) => void;
  setBookingSlot: (slot: string | null) => void;
  setBookingPrice: (price: number | null) => void;
  setBookingDeposit: (deposit: number | null) => void;

  savedCards: SavedCard[];
  walletInitialTab: WalletTab;
  walletPendingDeposit: boolean;
  setSavedCards: (cards: SavedCard[]) => void;
  setWalletInitialTab: (tab: WalletTab) => void;
  setWalletPendingDeposit: (pending: boolean) => void;

  // Maçlarım hub'ının açılış segmenti (ör. kapora ödemesi sonrası 'BOOKINGS').
  // Hub okuduğu anda temizler — yapışkan kalmaz.
  myMatchesInitialSegment: 'ALL' | 'MATCHES' | 'BOOKINGS' | null;
  setMyMatchesInitialSegment: (segment: 'ALL' | 'MATCHES' | 'BOOKINGS' | null) => void;

  // ─── Birleşik ödeme ekranı bağlamı + son ödeme hatası (cüzdan banner'ı) ──
  paymentContext: PaymentContext | null;
  setPaymentContext: (ctx: PaymentContext | null) => void;
  lastPaymentError: PaymentErrorInfo | null;
  setLastPaymentError: (err: PaymentErrorInfo | null) => void;

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
  /** FAZ 8A — sağlayıcının KENDİ profil/müsaitlik güncellemesi (admin RPC değil,
   *  provider_update_own_profile). Kısmi payload; store'da merge edilir. */
  updateOwnProvider: (kind: 'GK' | 'REF', partial: { id: string } & Record<string, any>) => Promise<void>;
  deleteGoalkeeper: (id: string) => Promise<void>;

  // ─── Referee CRUD ──────────────────────────────────────────────
  addReferee: (ref: Referee) => Promise<void>;
  updateReferee: (ref: Referee) => Promise<void>;
  deleteReferee: (id: string) => Promise<void>;
  loadServices: () => Promise<void>;
  /** KC-7: son loadServices başarısız oldu mu? Marketplace boş-durumu yükleme
   * hatasından ayırt edip retry sunar (sessiz "profil yok" yerine). */
  servicesError: boolean;

  // ─── Owner (SaaS) Data Load ─────────────────────────────────────
  loadOwnerData: (facilityId?: string) => Promise<void>;

  // ─── Supabase Plei Architecture ───────────────────────────────
  joinMatchPleiAction: (matchId: string, slotId: string, role: string) => Promise<void>;
  initSupabaseRealtime: () => void;

  // ─── Match CRUD ────────────────────────────────────────────────
  addMatch: (match: MatchListing) => Promise<string | undefined>;
  updateMatch: (match: MatchListing) => Promise<void>;
  // KN-3: YEREL-only maç güncellemesi — RPC ÇAĞIRMAZ. Realtime'dan gelen veri
  // ve RPC-sonrası re-fetch sonuçları bununla uygulanır; updateMatch (DB yazan)
  // realtime handler'dan ASLA çağrılmamalı (yankı döngüsü + lost-update).
  applyMatchLocal: (match: MatchListing) => void;
  deleteMatch: (id: string) => Promise<void>;

  // ─── User CRUD ─────────────────────────────────────────────────
  updateUser: (user: AdminUser) => Promise<void>;
  setNewMatchBadge: (val: boolean) => Promise<void>;
  banUser: (id: string) => Promise<void>;
  unbanUser: (id: string) => Promise<void>;
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
  // FAZ 7.5: Çoklu rol geçişi (rol değiştirici sheet)
  isRoleSwitcherOpen: boolean;
  // Misafir modu: oturum açmadan gezinme. Yazma aksiyonlarında kayıt kapısı açılır.
  isGuest: boolean;
  setIsGuest: (v: boolean) => void;
  // Giriş yapmış oyuncunun gerçek profili (ad/avatar/puan) — admin-only
  // adminUsers yerine maç akışlarında kullanılır (KN-2 'Oyuncu' fallback'i).
  currentUserProfile: CurrentUserProfile | null;
  setCurrentUserProfile: (p: CurrentUserProfile | null) => void;
  // STAFF-3: personel/müdür bir tesis paneline girdiğinde bağlam. null → sahip
  // kendi panelini açar (varsayılan). Ayarlar→Tesis Paneli bunu doldurur.
  staffPanelContext: { pitchId: string; pitchName: string; accessLevel: 'MANAGER' | 'STAFF' } | null;
  setStaffPanelContext: (c: { pitchId: string; pitchName: string; accessLevel: 'MANAGER' | 'STAFF' } | null) => void;
  // Owner panelinde o an yönetilen tesis (çoklu tesis/personel/admin-önizleme dahil).
  // Skor Gir gibi panel dışı rotalar maç listesini bu tesise göre çeker.
  ownerActivePitchId: string | null;
  setOwnerActivePitchId: (id: string | null) => void;
  isSignupGateOpen: boolean;
  setIsSignupGateOpen: (open: boolean) => void;
  setIsRoleSwitcherOpen: (open: boolean) => void;
  myRoles: string[];
  setMyRoles: (roles: string[]) => void;
  markAllNotificationsAsRead: () => void;
  acceptMatchInvite: (notificationId: string) => void;
  rejectMatchInvite: (notificationId: string) => void;
  unreadNotificationsCount: number;
  incrementUnreadNotifications: () => void;
  clearUnreadNotifications: () => void;
  setUnreadNotificationsCount: (n: number) => void;

  // ─── Push Notification State ───────────────────────────────────
  pushToken: string | null;
  setPushToken: (token: string | null) => void;
  notificationPreferences: NotificationPreferences;
  setNotificationPreferences: (prefs: NotificationPreferences) => void;
  updateSingleNotificationPref: (key: keyof NotificationPreferences, enabled: boolean) => void;
}

export const useAppStore = create<AppState>((set, get) => ({
  isHydrated: true,
  loadDegraded: false,
  // H4: Kritik veri yüklemesini tek yerde topla; hem initApp hem "yeniden dene"
  // afişi bunu çağırır. Zaman aşımıyla boş dönen kritik yükleri degraded işaretler.
  retryInitialLoad: async () => {
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

      // H4: maçlar VEYA sahalar zaman aşımıyla null döndüyse "boş ama yüklendi"
      // gösterme — degraded işaretle; UI yeniden-dene afişi çıkarabilir.
      const matchesEmpty = !(matchesRes.status === 'fulfilled' && matchesRes.value);
      const pitchesEmpty = !(pitchesRes.status === 'fulfilled' && pitchesRes.value);
      const degraded = matchesEmpty || pitchesEmpty;
      set({ loadDegraded: degraded });
      if (degraded) trackEvent('initial_load_degraded', { matchesEmpty, pitchesEmpty });
    } catch (e) {
      console.error('Hydration error:', e);
      captureException(e, { where: 'retryInitialLoad' });
      set({ loadDegraded: true });
    } finally {
      set({ isHydrated: true, initialLoadComplete: true });
    }
  },
  initApp: async () => {
    await get().retryInitialLoad();

    // Maç listesini canlı tut: admin panelden veya başka bir oyuncudan gelen
    // ekleme/güncelleme/silme işlemleri sayfa yenilenmeden burada görünsün.
    // initApp birden çok kez çağrılabilir (StrictMode / auth değişimi). Aynı isimli
    // kanal yeniden .on()+.subscribe() edilirse "after subscribe()" hatası oluşur;
    // önce varsa eski aboneliği temizle (sağlamlık).
    supabase.getChannels()
      .filter((c) => c.topic === 'realtime:matches-list-sync')
      .forEach((c) => { supabase.removeChannel(c); });
    supabase
      .channel('matches-list-sync')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'matches' }, (payload) => {
        if (payload.eventType === 'DELETE') {
          const oldId = (payload.old as any)?.id;
          if (!oldId) return;
          set((state) => ({ adminMatches: state.adminMatches.filter(m => m.id !== oldId) }));
          return;
        }
        // H3: İlk yükleme mapFromSnakeCase'ten geçiyor; realtime satırı da AYNI
        // dönüşümden geçmeli. Aksi halde ham snake_case (away_slots, home_team_id…)
        // camelCase store'a karışır ve awaySlots/homeTeamId gibi alanlar undefined'a
        // düşer → kart/lobi canlı güncellemeden sonra boş görünür.
        const row = FB.mapFromSnakeCase(payload.new) as unknown as MatchListing;
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
  serviceAppRole: null,
  isAuthReady: true,
  selectedMatch: null,
  lobbyMode: 'DISCOVER',
  selectedDiaryId: null,
  selectedConversationId: null,
  matchCreateSeed: null,
  activeDraftId: null,
  selectedGk: null,
  selectedRef: null,
  bookingPitch: null,
  bookingCourt: null,
  ticketBookingId: null,
  bookingDate: null,
  bookingSlot: null,
  bookingPrice: null,
  bookingDeposit: null,
  savedCards: [],
  walletInitialTab: 'MAIN',
  walletPendingDeposit: false,
  myMatchesInitialSegment: null,
  paymentContext: null,
  lastPaymentError: null,
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
  searchRadius: loadSearchRadius(),
  setSearchRadius: (searchRadius) => {
    set({ searchRadius });
    persistSearchRadius(searchRadius);
  },
  activeRegion: loadActiveRegion(),
  setActiveRegion: (activeRegion) => {
    set((state) => {
      // GPS/tekil seçim: birincil bölgeyi güncelle ve seçili listede yoksa ekle
      // (böylece "otomatik bul" konumu da keşif kapsamına girer).
      let selectedRegions = state.selectedRegions;
      if (activeRegion) {
        const exists = selectedRegions.some((r) => sameRegion(r, activeRegion));
        selectedRegions = exists
          ? selectedRegions.map((r) => (sameRegion(r, activeRegion) ? activeRegion : r))
          : [activeRegion, ...selectedRegions];
        persistSelectedRegions(selectedRegions);
      }
      persistActiveRegion(activeRegion);
      return { activeRegion, selectedRegions };
    });
  },

  selectedRegions: loadSelectedRegions(),
  setSelectedRegions: (regions) => {
    persistSelectedRegions(regions);
    const primary = regions[0] ?? null;
    persistActiveRegion(primary);
    set({ selectedRegions: regions, activeRegion: primary });
  },
  addSelectedRegion: (region) => {
    set((state) => {
      if (state.selectedRegions.some((r) => sameRegion(r, region))) return state;
      const selectedRegions = [...state.selectedRegions, region];
      persistSelectedRegions(selectedRegions);
      persistActiveRegion(region); // en son eklenen birincil olur
      return { selectedRegions, activeRegion: region };
    });
  },
  removeSelectedRegion: (region) => {
    set((state) => {
      const selectedRegions = state.selectedRegions.filter((r) => !sameRegion(r, region));
      persistSelectedRegions(selectedRegions);
      // Birincil bölge çıkarıldıysa ilk kalana geç.
      let activeRegion = state.activeRegion;
      if (activeRegion && sameRegion(activeRegion, region)) {
        activeRegion = selectedRegions[0] ?? null;
        persistActiveRegion(activeRegion);
      }
      return { selectedRegions, activeRegion };
    });
  },
  adminPitches: [],
  adminGoalkeepers: [],
  adminReferees: [],
  servicesError: false,
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

  // Studio Transfer ÖLDÜ (Küme 3): activeStudioTeam → studioContext;
  // teamTactics makinesi → save_team_tactic/approve_tactic/reject_tactic
  // RPC'leri + tacticSocialService (tek makine, sunucu otoritesi).

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
  setServiceAppRole: (serviceAppRole) => set({ serviceAppRole }),
  setIsAuthReady: (isAuthReady) => set({ isAuthReady }),
  setSelectedMatch: (match) => set({ selectedMatch: match }),
  setLobbyMode: (lobbyMode) => set({ lobbyMode }),
  setSelectedDiaryId: (id) => set({ selectedDiaryId: id }),
  setSelectedConversationId: (id) => set({ selectedConversationId: id }),
  // SOSYAL yeniden tasarım — navigasyon yükleri (Spec §2.2)
  socialTarget: null,
  setSocialTarget: (t) => set({ socialTarget: t }),
  selectedTeamId: null,
  setSelectedTeamId: (id) => set({ selectedTeamId: id }),
  teamInitialTab: null,
  setTeamInitialTab: (t) => set({ teamInitialTab: t }),
  selectedTeamChatId: null,
  setSelectedTeamChatId: (id) => set({ selectedTeamChatId: id }),
  studioContext: null,
  setStudioContext: (c) => set({ studioContext: c }),
  setMatchCreateSeed: (seed) => set({ matchCreateSeed: seed }),
  setActiveDraftId: (id) => set({ activeDraftId: id }),
  setSelectedGk: (selectedGk) => set({ selectedGk }),
  setSelectedRef: (selectedRef) => set({ selectedRef }),
  setTicketBookingId: (ticketBookingId) => set({ ticketBookingId }),
  setBookingPitch: (bookingPitch) => set({ bookingPitch }),
  setBookingCourt: (bookingCourt) => set({ bookingCourt }),
  setBookingDate: (bookingDate) => set({ bookingDate }),
  setBookingSlot: (bookingSlot) => set({ bookingSlot }),
  setBookingPrice: (bookingPrice) => set({ bookingPrice }),
  setBookingDeposit: (bookingDeposit) => set({ bookingDeposit }),
  setSavedCards: (savedCards) => set({ savedCards }),
  setWalletInitialTab: (walletInitialTab) => set({ walletInitialTab }),
  setWalletPendingDeposit: (walletPendingDeposit) => set({ walletPendingDeposit }),
  setMyMatchesInitialSegment: (myMatchesInitialSegment) => set({ myMatchesInitialSegment }),
  setPaymentContext: (paymentContext) => set({ paymentContext }),
  setLastPaymentError: (lastPaymentError) => set({ lastPaymentError }),

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
    // Kısmi payload tüm kaydı ezmesin: mevcut kayıtla merge et
    set({ adminGoalkeepers: prev.map(g => g.id === gk.id ? { ...g, ...gk } : g) });
    try {
      const { updateGoalkeeperAdmin } = await import('./admin-panel/services/adminService');
      await updateGoalkeeperAdmin(gk);
    } catch (e) { set({ adminGoalkeepers: prev }); throw e; }
  },
  updateOwnProvider: async (kind, partial) => {
    const isGk = kind === 'GK';
    const prevGk = get().adminGoalkeepers;
    const prevRef = get().adminReferees;
    if (isGk) set({ adminGoalkeepers: prevGk.map(g => g.id === partial.id ? { ...g, ...partial } : g) });
    else set({ adminReferees: prevRef.map(r => r.id === partial.id ? { ...r, ...partial } : r) });
    try {
      const { updateOwnProviderProfile } = await import('./services/serviceProviderService');
      const { id: _id, ...fields } = partial;
      await updateOwnProviderProfile(fields);
    } catch (e) {
      if (isGk) set({ adminGoalkeepers: prevGk }); else set({ adminReferees: prevRef });
      throw e;
    }
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
    // Kısmi payload tüm kaydı ezmesin: mevcut kayıtla merge et
    set({ adminReferees: prev.map(r => r.id === ref.id ? { ...r, ...ref } : r) });
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
      set({ adminGoalkeepers: gks || [], adminReferees: refs || [], servicesError: false });
    } catch (err) {
      console.error('Error loading services', err);
      set({ servicesError: true }); // KC-7: boş-durumu hatadan ayırt et
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
  // KN-3: RPC'siz yerel uygulama. adminMatches + (açık lobi varsa) selectedMatch
  // birlikte senkronlanır — MatchJoin selectedMatch'ten beslendiği için şart.
  applyMatchLocal: (match) => set((s) => ({
    adminMatches: s.adminMatches.map(m => m.id === match.id ? match : m),
    selectedMatch: s.selectedMatch?.id === match.id ? match : s.selectedMatch,
  })),
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
    
    // Misafir/oturumsuz kullanıcı maça KATILAMAZ: kayıt kapısını aç ve çık.
    if (!auth.currentUser?.uid) {
      set({ isSignupGateOpen: true });
      return;
    }
    const currentUserUid = auth.currentUser.uid;
    // Gerçek profil (bootstrap'ta profiles'tan yazılır) önce; admin-only
    // adminUsers yalnız admin oturumunda dolu olduğundan oyuncuda son çare.
    const currentUserProfile = state.currentUserProfile
      || state.adminUsers.find(u => u.id === currentUserUid)
      || { id: currentUserUid, name: auth.currentUser.displayName || 'Oyuncu', avatar: auth.currentUser.photoURL || `https://i.pravatar.cc/150?u=${currentUserUid}` };

    const joinedPlayer: Player = {
      id: currentUserProfile.id || currentUserUid,
      name: currentUserProfile.name || auth.currentUser.displayName || 'Oyuncu',
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
    const uid = auth.currentUser?.uid;
    if (!uid) return;
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
  isRoleSwitcherOpen: false,
  setIsRoleSwitcherOpen: (open) => set({ isRoleSwitcherOpen: open }),
  isGuest: false,
  setIsGuest: (v) => set({ isGuest: v }),
  currentUserProfile: null,
  setCurrentUserProfile: (p) => set({ currentUserProfile: p }),
  staffPanelContext: null,
  setStaffPanelContext: (c) => set({ staffPanelContext: c }),
  ownerActivePitchId: null,
  setOwnerActivePitchId: (id) => set({ ownerActivePitchId: id }),
  isSignupGateOpen: false,
  setIsSignupGateOpen: (open) => set({ isSignupGateOpen: open }),
  myRoles: [],
  setMyRoles: (roles) => set({ myRoles: roles }),
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
  // F3f: DB'den gelen gerçek okunmamış sayısıyla tohumlama (App açılışı)
  setUnreadNotificationsCount: (n) => set({ unreadNotificationsCount: Math.max(0, n) }),

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
