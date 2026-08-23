import { create } from 'zustand';
import { AppView, UserRole, MatchListing, Goalkeeper, Referee, Pitch, OpponentListing, Team, AdminUser, Player, AdminLog, WalletTab, Court, OynaLocation, PaymentContext, PaymentErrorInfo, CurrentUserProfile } from './types';
import type { SavedCard } from './services/walletService';
import * as FB from './supabaseMutations';
import * as TeamService from './services/teamService';
import { auth } from './supabaseAuth';

import { supabase } from './supabaseClient';
import { trackEvent, captureException } from './utils/observability';
import { APP_VERSION } from './utils/appVersion';
import { Capacitor } from '@capacitor/core';
import type { NotificationPreferences } from './notifications/pushService';
import { DEFAULT_NOTIFICATION_PREFERENCES } from './notifications/pushService';
import type { AdminSession } from './shared/adminKopru';
import { adminKoprusu, adminKoprusuHazirMi } from './shared/adminKopru';

// (Tek lobi P4) Store'daki Friend tipi ve friends dizisi KALDIRILDI: hiçbir
// yerde DB'den doldurulmuyordu ve lobi davet modalını boş/mock bırakıyordu.
// Gerçek arkadaş verisi tek kaynaktan gelir: services/socialService.getFriends().

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

// IP-15 — misafirin yarım bıraktığı iş. OAuth yönlendirmesi sayfayı yeniden
// yüklediği için bellekte tutmak yetmez; 30 dakika sonra bayat sayılır.
const PENDING_INTENT_KEY = 'oyna.pendingIntent';
const PENDING_INTENT_MAX_AGE_MS = 30 * 60 * 1000;

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
  /**
   * "Maçlarım"ı sunucudan tazeler (get_my_matches).
   *
   * NEDEN AYRI EYLEM (17 Ağu 2026 — mağaza öncesi denetim): açılış yüklemesi
   * (`retryInitialLoad`) uygulama açılırken BİR KEZ, çoğu zaman kullanıcı
   * GİRİŞ YAPMADAN ÖNCE koşar. Girişten sonra bu sorgu yeniden atılmıyordu →
   * kullanıcı kendi kurduğu/katıldığı maçı ne ana sayfada ne Maçlarım'da
   * görüyordu (bölgeye daralan global liste de yedek olamıyordu, YUK-2).
   * Artık giriş anında ve ana sayfayı parmakla çekince bu eylem çağrılır.
   */
  refreshMyMatches: () => Promise<void>;
  view: AppView;
  navigationStack: AppView[];
  /** Açık overlay'ler (sheet, modal, tam ekran katman) — LIFO.
   *  Donanım geri tuşu ekranı değiştirmeden ÖNCE buradaki en üsttekini kapatır.
   *  Kayıt hooks/useBackDismiss.ts üzerinden yapılır, elle push/pop ÇAĞIRMA. */
  overlayStack: { id: string; priority: number; close: () => void }[];
  /** Banka doğrulaması (3DS) ekranı açıkken true. true iken donanım geri tuşu
   *  HİÇBİR ŞEY yapmaz — kart bankada çekilirken ekranın unmount olmasını engeller. */
  paymentLockActive: boolean;
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
  // A4: Ayarlar hangi alt sayfayla açılsın (derin bağlantı: oyna://support).
  // SettingsScreen bunu okuyup TÜKETİR (okur okumaz null'a çeker) — aksi hâlde
  // kullanıcı Ayarlar'a her girdiğinde Destek sayfası tekrar açılırdı.
  settingsSubPage: string | null;
  setSettingsSubPage: (p: string | null) => void;
  // D2: bildirim izni açıklama ekranı gösterilsin mi? Maça katılınca kalkar.
  pushIzniSorulsun: boolean;
  setPushIzniSorulsun: (v: boolean) => void;
  // Birleşik gelen kutusu: açılışta odaklanacak takım sohbeti (team/{id}/chat)
  selectedTeamChatId: string | null;
  setSelectedTeamChatId: (id: string | null) => void;
  // Stüdyo'ya takım/taktik bağlamı (activeStudioTeam'in halefi; M80):
  studioContext: { teamId?: string; tacticId?: string } | null;
  setStudioContext: (c: { teamId?: string; tacticId?: string } | null) => void;
  selectedGk: Goalkeeper | null;
  selectedRef: Referee | null;
  // FAZ 3: rezervasyon → maç çevirme tohumu (MatchCreate ön-doldurma)
  matchCreateSeed: { pitchId?: string; pitchName?: string; district?: string; date?: string; time?: string; price?: number; bookingId?: string; courtId?: string } | null;
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
  /** [P-5/M-P0-6] Kullanicinin KENDI maclari — sunucudan kapsamli olarak gelir.
   *  useMyMatches bunu adminMatches filtresiyle BIRLESTIRIR; boylece scoped
   *  sorgu bir sebeple bos donse bile hicbir mac kaybolmaz. */
  myMatches: MatchListing[];
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


  // ─── Squad Builder ────────────────────────────────────────────────
  selectedFriendsForTeam: string[];
  toggleSelectedFriendForTeam: (id: string) => void;
  clearSelectedFriendsForTeam: () => void;

  userTeams: Team[];
  addTeam: (team: Team) => void;

  myTeams: Team[];
  addMyTeam: (team: Team) => void;
  loadMyTeams: () => Promise<void>;

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
  /** Alt menü sekme geçişi. Yığını boşaltmaz: DASHBOARD dışı sekmelerde
   *  ['DASHBOARD'] kökü bırakır → geri tuşu sekmeden Ana Sayfa'ya döner. */
  switchTab: (view: AppView) => void;
  /** Yığını ['DASHBOARD'] köküne sabitleyip verilen ekranı açar.
   *  resetNavigation'ın aksine yığın BOŞ KALMAZ → geri tuşu minimizeApp'e düşmez. */
  resetUnderHome: (view: AppView) => void;
  pushOverlay: (id: string, close: () => void, priority?: number) => void;
  popOverlay: (id: string) => void;
  /** En üstteki overlay'i kapatır. Kapatacak overlay varsa true döner. */
  closeTopOverlay: () => boolean;
  setPaymentLockActive: (v: boolean) => void;
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
  // Bir görünüm alt sayfa/modal açtığında alt barın yol vermesi için bayrak
  // (ör. Maçlarım bilet alt sayfaları). Kapanınca/görünümden çıkınca sıfırlanır.
  navOverlayOpen: boolean;
  setNavOverlayOpen: (open: boolean) => void;
  // FAZ 7.5: Çoklu rol geçişi (rol değiştirici sheet)
  isRoleSwitcherOpen: boolean;
  // Misafir modu: oturum açmadan gezinme. Yazma aksiyonlarında kayıt kapısı açılır.
  isGuest: boolean;
  setIsGuest: (v: boolean) => void;
  // IP-15 — Kayıt kapısı niyeti. Misafir bir yazma aksiyonu denediğinde hangi
  // ekranda olduğu saklanır; kayıt/giriş + onboarding bitince kullanıcı oraya
  // geri bırakılır. Eskiden `resetNavigation('AUTH')` yığını siliyor, kullanıcı
  // kaydolduktan sonra Ana Sayfa'ya düşüyordu — başladığı iş kayboluyordu.
  // Google/Apple yönlendirmesinde sayfa yeniden yüklenebildiği için
  // localStorage'a da yazılır (30 dk ömür).
  pendingIntent: { view: AppView; matchId?: string; ts: number } | null;
  setPendingIntent: (view: AppView, matchId?: string) => void;
  consumePendingIntent: () => { view: AppView; matchId?: string } | null;
  // Kapıdan gelindiğinde AuthScreen'in hangi modda açılacağı.
  authStartMode: 'register' | 'login' | null;
  setAuthStartMode: (m: 'register' | 'login' | null) => void;
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

    // [YUK-2] AÇILIŞ ARTIK BÖLGEYE DARALTILIYOR.
    // activeRegion telefonda saklıdır (loadActiveRegion) — yani açılışın ilk
    // anında, hiçbir istek beklenmeden bilinir. Bölge yoksa saha/maç sorguları
    // BOŞ döner; prensip 4.5 gereği ülke geneline düşülmez.
    const acilisBolgesi = get().activeRegion;

    // [YUK-3] Açılış ölçümü — kaç istek atıldı, ne kadar sürdü.
    // Amaç: bu görevdeki iyileştirme rakamla görünsün VE ileride biri açılışa
    // yeni bir yük eklerse Sistem Sağlığı kartında fark edilsin (P-0).
    const acilisBaslangic = Date.now();

    try {
      // Liste ADLANDIRILDI: ölçümdeki "kaç istek atıldı" sayısı buradan TÜRETİLİR
      // (`.length`). Elle yazılan bir sayı zamanla koddan sapar ve sessizce yalan
      // söylerdi; böylece biri buraya yeni bir istek eklerse ölçüm kendiliğinden
      // artar.  NOT: loadServices tek satır görünür ama İÇİNDE 2 istek yapar
      // (kaleciler + hakemler) — bu yüzden ayrıca sayılır.
      const acilisIstekleri = [
        withTimeout(supabase.auth.getSession()),
        withTimeout(FB.fbGetPitches(acilisBolgesi)),
        withTimeout(FB.fbGetMatches(acilisBolgesi)),
        withTimeout(FB.fbGetMyMatches()),
        withTimeout(get().loadServices(), 4000),
        withTimeout<any>(Promise.resolve(supabase.from('texts').select('key, value'))),
      ];
      const LOADSERVICES_IC_ISTEK = 2; // kaleciler + hakemler
      const acilisIstekSayisi = acilisIstekleri.length - 1 + LOADSERVICES_IC_ISTEK;

      const [sessionRes, pitchesRes, matchesRes, myMatchesRes, servicesRes, textsRes] =
        await Promise.allSettled(acilisIstekleri);

      if (pitchesRes.status === 'fulfilled' && pitchesRes.value) {
        set({ adminPitches: pitchesRes.value as Pitch[] });
      }
      if (matchesRes.status === 'fulfilled' && matchesRes.value) {
        set({ adminMatches: matchesRes.value as MatchListing[] });
      }
      if (myMatchesRes.status === 'fulfilled' && myMatchesRes.value) {
        set({ myMatches: myMatchesRes.value as MatchListing[] });
      }
      // [YUK-2] TAKIMLAR AÇILIŞTAN ÇIKARILDI.
      // fbGetTeams() burada her açılışta çağrılıyordu ama `adminTeams` state'ini
      // uygulamada HİÇBİR ekran ve yönetim panelinin HİÇBİR sayfası okumuyor —
      // yani indirilen veri hiç kullanılmıyordu. Takım ekranları kendi scoped
      // sorgularını kullanıyor (TeamService.fetchMyTeams).
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

      // [YUK-3] AÇILIŞ ÖLÇÜMÜ.
      // "Peki bu koruma bozulursa kim söyleyecek?" (P-0) sorusunun cevabı bu
      // blok: açılışta kaç istek atıldığı ve ne kadar sürdüğü kaydedilir. Biri
      // ileride buraya yeni bir yük eklerse `istek_sayisi` artar, gece denetimi
      // (K-YUK-4) bunu görür ve Sistem Sağlığı kartı sarı/kırmızı yanar.
      const acilisSuresi = Date.now() - acilisBaslangic;
      const acilisOlcumu = {
        istek_sayisi: acilisIstekSayisi,
        sure_ms: acilisSuresi,
        bolge_biliniyor: !!acilisBolgesi?.city,
        // Bölge yoksa saha/maç listeleri BOŞ gelir; bu bir hata değil, kuraldır
        // (prensip 4.5). Ayırt edilebilsin diye ayrıca yazılır.
        saha_sayisi: (pitchesRes.status === 'fulfilled' && Array.isArray(pitchesRes.value)) ? pitchesRes.value.length : -1,
        mac_sayisi: (matchesRes.status === 'fulfilled' && Array.isArray(matchesRes.value)) ? matchesRes.value.length : -1,
      };
      trackEvent('acilis_yuku', acilisOlcumu);

      // Panelin Sistem Sağlığı kartını besleyen kayıt.
      //
      // ÖRNEKLEME: her açılışta yazılsaydı ölçüm sisteminin kendisi ölçtüğü
      // yüke katkı yapardı (100.000 açılış = 100.000 satır/gün). 20 açılışta 1
      // yazmak ortancayı bozmaz ama maliyeti 20'de bire indirir.
      //
      // ATEŞLE-UNUT: `void` ile beklenmez ve hatası yutulur — ölçüm hiçbir
      // koşulda açılışı yavaşlatamaz ya da bozamaz.
      if (Math.random() < 0.05) {
        void supabase.rpc('acilis_olcumu_yaz', {
          p_istek_sayisi: acilisIstekSayisi,
          p_sure_ms: acilisSuresi,
          p_bolge_biliniyor: !!acilisBolgesi?.city,
          p_platform: Capacitor.getPlatform(),
          p_surum: APP_VERSION,
        }).then(() => { /* sessiz */ }, () => { /* sessiz */ });
      }
    } catch (e) {
      console.error('Hydration error:', e);
      captureException(e, { where: 'retryInitialLoad' });
      set({ loadDegraded: true });
    } finally {
      set({ isHydrated: true, initialLoadComplete: true });
    }
  },
  refreshMyMatches: async () => {
    try {
      const mine = await FB.fbGetMyMatches();
      // Boş dizi de geçerli cevaptır (kullanıcının maçı yok) — set edilir ki
      // iptal edilen/geçmişe düşen maç ekranda asılı kalmasın.
      set({ myMatches: (mine ?? []) as MatchListing[] });
    } catch (e) {
      // Sessiz geç: bu tazeleme bir EK yoldur, açılışı/girişi bloke etmez.
      console.warn('[store] Maçlarım tazelenemedi:', e);
    }
  },
  initApp: async () => {
    await get().retryInitialLoad();

    // ════════════════════════════════════════════════════════════════════
    // [P-5 / M-P0-7 / K-12.1] KÜRESEL CANLI ABONELİK KAPATILDI
    // ────────────────────────────────────────────────────────────────────
    // Eskiden burada FİLTRESİZ bir kanal açılıyordu: matches tablosundaki
    // HER değişiklik, uygulaması açık olan HERKESE tam satır (~3,5 KB)
    // olarak gidiyordu. Ölçüm:
    //   • tek slot satışı = 500 abone × 3,5 KB = 1,73 MB
    //   • bir maçın 14 slotu dolarsa = 24 MB
    //   • aylık ~6.000.000 mesaj (ücretsiz plan sınırı 2.000.000)
    //   • send_match_reminders cron'u 100 maçı işaretleyince saniyeler
    //     içinde 50.000 mesaj → o anda kimse canlı güncelleme alamıyor
    //
    // Kurucu kararı K-12.1: "Top Oyna" kartlarındaki doluluk sayısının
    // ANLIK tazeliğinden vazgeçildi. Kazanç: aylık mesaj ~6M → ~200K.
    //
    // NE BOZULMUYOR (tek tek doğrulandı):
    //   • Maç lobisi: kendi `match_{id}` kanalı var (matchService.ts:427)
    //     → lobide slot dolması ANINDA görünmeye devam ediyor
    //   • Bildirimler, sosyal olaylar, saha takvimi: hepsi filtreli kendi
    //     kanallarında
    //   • "Maçlarım", Marketplace, Maç Kur: get_my_matches() kapsıyor
    //   • Kaleci/Hakem paneli: K-12.2 ile get_my_matches kapsamına alındı
    //
    // GERİ ALMA: bu blok geri açılırsa eski davranış döner (tek satırlık iş).
    // PRO-1: Pro plana geçilince 2M sınırı kalkar, yeniden açılabilir.
    // ════════════════════════════════════════════════════════════════════
    supabase.getChannels()
      .filter((c) => c.topic === 'realtime:matches-list-sync')
      .forEach((c) => { supabase.removeChannel(c); });
    const KURESEL_MAC_ABONELIGI_ACIK = false; // K-12.1 · PRO-1
    if (KURESEL_MAC_ABONELIGI_ACIK) {
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
    }
  },
  view: 'SPLASH',
  navigationStack: [],
  overlayStack: [],
  paymentLockActive: false,
  role: UserRole.PLAYER,
  serviceAppRole: null,
  isAuthReady: true,
  selectedMatch: null,
  lobbyMode: 'DISCOVER',
  selectedDiaryId: null,
  selectedConversationId: null,
  matchCreateSeed: null,
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
  myMatches: [],
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

  // createTeam SÖKÜLDÜ (20 Ağu 2026): takım kurmanın tek yolu create_team RPC'si.

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
    const stack = state.navigationStack;
    // Döngü kırıcı (BULGU-028): A → B → A gidildiğinde yığına ikinci bir A
    // eklenmez, yığındaki A tüketilir. Geri tuşu ASLA ileri götürmez.
    // Örn. [MATCH_JOIN, PAYMENT] + view=WALLET → navigateTo('PAYMENT')
    //      sonuç: [MATCH_JOIN], view=PAYMENT.
    if (stack.length > 0 && stack[stack.length - 1] === newView) {
      return { navigationStack: stack.slice(0, -1), view: newView };
    }
    return { navigationStack: [...stack, state.view], view: newView };
  }),
  goBack: (fallback) => set((state) => {
    const stack = [...state.navigationStack];
    const previous = stack.pop();
    return { navigationStack: stack, view: previous ?? fallback ?? state.view };
  }),
  // Kök sıfırlaması: yığın boşalır, geri tuşu minimizeApp'e düşer. Yalnız
  // gerçek kök geçişlerinde kullanılır (çıkış, rol değişimi, hayalet mod).
  // paymentLockActive burada da düşürülür — kilit hiçbir yolda asılı kalmasın.
  resetNavigation: (newView) => set({ navigationStack: [], view: newView, paymentLockActive: false }),
  switchTab: (newView) => set((state) => {
    // Aynı sekmeye basmak gezinme açısından no-op ama kilidi YİNE de düşürür:
    // emniyet ağının amacı 3DS kilidinin hiçbir yolda asılı kalmaması.
    if (state.view === newView) return { paymentLockActive: false };
    return {
      navigationStack: newView === 'DASHBOARD' ? [] : ['DASHBOARD'],
      view: newView,
      paymentLockActive: false,
    };
  }),
  resetUnderHome: (newView) => set({
    navigationStack: ['DASHBOARD'],
    view: newView,
    paymentLockActive: false,
  }),
  pushOverlay: (id, close, priority = 0) => set((state) => ({
    overlayStack: [...state.overlayStack.filter((o) => o.id !== id), { id, priority, close }],
  })),
  popOverlay: (id) => set((state) => ({
    overlayStack: state.overlayStack.filter((o) => o.id !== id),
  })),
  closeTopOverlay: () => {
    const stack = get().overlayStack;
    if (stack.length === 0) return false;
    // En yüksek priority; eşitlikte en son kaydedilen (LIFO).
    let top = stack[0];
    for (const o of stack) if (o.priority >= top.priority) top = o;
    // Kaydı ELLE SİLMİYORUZ. close() bazı katmanlarda korumalı bir no-op olabilir
    // (ör. kayıt sürerken kapanmayı reddeden sheet). Kaydı önden silseydik o katman
    // geri-yığınından kalıcı olarak düşer ve sonraki geri tuşu ALTINDAKİ ekranı
    // kapatırdı. Katman gerçekten kapanırsa useBackDismiss'in cleanup'ı popOverlay
    // çağırıp kaydı zaten siler.
    top.close();
    return true;
  },
  setPaymentLockActive: (v) => set({ paymentLockActive: v }),
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
  settingsSubPage: null,
  setSettingsSubPage: (p) => set({ settingsSubPage: p }),
  pushIzniSorulsun: false,
  setPushIzniSorulsun: (v) => set({ pushIzniSorulsun: v }),
  selectedTeamChatId: null,
  setSelectedTeamChatId: (id) => set({ selectedTeamChatId: id }),
  studioContext: null,
  setStudioContext: (c) => set({ studioContext: c }),
  setMatchCreateSeed: (seed) => set({ matchCreateSeed: seed }),
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
      const { createPitchAdmin, buildPitchPayloadFromUi } = adminKoprusu();
      try {
        const newId = await createPitchAdmin(buildPitchPayloadFromUi(pitch));
        set({ adminPitches: [{ ...pitch, id: newId }, ...prev] });
      } catch {
        await FB.fbAddPitch(pitch);
        if (get().adminSession) {
          const { persistAdminLog } = adminKoprusu();
          await persistAdminLog('PITCH_CREATE', 'pitch', pitch.id, pitch.name).catch(() => {});
        }
      }
    } catch (e) { set({ adminPitches: prev }); throw e; }
  },
  updatePitch: async (pitch) => {
    const prev = get().adminPitches;
    set({ adminPitches: prev.map(p => p.id === pitch.id ? pitch : p) });
    try {
      const { updatePitchAdmin, buildPitchPayloadFromUi } = adminKoprusu();
      try {
        await updatePitchAdmin(pitch.id, buildPitchPayloadFromUi(pitch));
      } catch {
        await FB.fbUpdatePitch(pitch);
        if (get().adminSession) {
          const { persistAdminLog } = adminKoprusu();
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
      const { deletePitchAdmin } = adminKoprusu();
      try {
        await deletePitchAdmin(id);
      } catch {
        await FB.fbDeletePitch(id);
        if (get().adminSession && pitch) {
          const { persistAdminLog } = adminKoprusu();
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
      const { updateGoalkeeperAdmin } = adminKoprusu();
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
      const { deleteGoalkeeperAdmin } = adminKoprusu();
      try {
        await deleteGoalkeeperAdmin(id);
      } catch {
        await FB.fbDeleteGoalkeeper(id);
        if (get().adminSession && gk) {
          const { persistAdminLog } = adminKoprusu();
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
      const { updateRefereeAdmin } = adminKoprusu();
      await updateRefereeAdmin(ref);
    } catch (e) { set({ adminReferees: prev }); throw e; }
  },
  deleteReferee: async (id) => {
    const prev = get().adminReferees;
    const ref = prev.find(r => r.id === id);
    set({ adminReferees: prev.filter(r => r.id !== id) });
    try {
      const { deleteRefereeAdmin } = adminKoprusu();
      try {
        await deleteRefereeAdmin(id);
      } catch {
        await FB.fbDeleteReferee(id);
        if (get().adminSession && ref) {
          const { persistAdminLog } = adminKoprusu();
          await persistAdminLog('REF_DELETE', 'referee', id, ref.name).catch(() => {});
        }
      }
    } catch (e) { set({ adminReferees: prev }); throw e; }
  },

  // Load Services from DB
  //
  // [YUK-1] YÖNETİM PANELİ AÇILIŞ YOLUNDAN ÇIKARILDI.
  // ────────────────────────────────────────────────────────────────────
  // Eskiden burada admin-panel/services/adminService dinamik olarak import
  // edilip fetchGoalkeepersAdmin/fetchRefereesAdmin çağrılıyordu. Bu fonksiyon
  // açılışta (retryInitialLoad) HER kullanıcı için çalıştığından maliyeti şuydu:
  //   • adminService yığını (57,3 kB) + matchMapper (4,0 kB) = ~61 kB panel kodu
  //     her oyuncunun telefonuna HER AÇILIŞTA iniyordu,
  //   • admin_fetch_goalkeepers/_referees RPC'leri `is_platform_admin()` değilse
  //     'UNAUTHORIZED' fırlatır — yani yönetici olmayan herkes için bu iki çağrı
  //     TASARIM GEREĞİ başarısız oluyor, sonra isRpcDenied yakalayıp zaten
  //     aşağıdaki doğrudan tablo okumasına düşüyordu.
  // Yani sonuç veri AYNIYDI; fark yalnız boşa inen kod ve boşa giden iki istekti.
  //
  // RPC `SETOF goalkeepers` döndürüyor, yani doğrudan okumayla kolon kolon aynı.
  // Yönetici de veri kaybetmez: goalkeepers_select_auth / referees_select_auth
  // politikaları `is_platform_admin()` dalıyla onaysız kayıtları da açar.
  loadServices: async () => {
    try {
      const [gks, refs] = await Promise.all([FB.fbGetGoalkeepers(), FB.fbGetReferees()]);
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
      const { listingToMatchPayload } = await import('./shared/matchMapper');
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
      const { listingToMatchPayload } = await import('./shared/matchMapper');
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
      const { deleteMatchAdmin } = adminKoprusu();
      await deleteMatchAdmin(id);
    } catch (e) { set({ adminMatches: prev }); throw e; }
  },

  // (Tek lobi P4) joinMatchPleiAction (plei donemi join_match_slot istemcisi) kaldirildi.

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
      const svc = adminKoprusu();
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
      const { banUserAdmin } = adminKoprusu();
      await banUserAdmin(id, true);
    } catch (e) { set({ adminUsers: prev }); throw e; }
  },
  unbanUser: async (id) => {
    const prev = get().adminUsers;
    set({ adminUsers: prev.map(u => u.id === id ? { ...u, isBanned: false } : u) });
    try {
      const { banUserAdmin } = adminKoprusu();
      await banUserAdmin(id, false);
    } catch (e) { set({ adminUsers: prev }); throw e; }
  },
  verifyUser: async (id) => {
    const prev = get().adminUsers;
    set({ adminUsers: prev.map(u => u.id === id ? { ...u, isVerified: true } : u) });
    try {
      const { verifyUserAdmin } = adminKoprusu();
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
      const { processAccountDeletion } = adminKoprusu();
      await processAccountDeletion(id, true);
    } catch (e) { set({ adminUsers: prev }); throw e; }
  },

  // Notifications
  addNotification: (n) => FB.fbAddNotification(n),
  deleteNotification: (id) => FB.fbDeleteNotification(id),
  // toggleNotification SÖKÜLDÜ (20 Ağu 2026): notifications.isActive kolonu
  // hiç var olmadı; hiçbir ekran da çağırmıyordu.

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
      const { updateSettingsAdmin, settingsToDbPayload } = adminKoprusu();
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
    // Yönetici denetim kaydı YALNIZ panelde kalıcılaştırılır. Panel kurulu
    // değilse (oyuncu uygulaması) sessizce atlanır: burada hata fırlatmak
    // çağıran akışı bozardı ve zaten yazacak bir yönetici oturumu yoktur.
    if (adminKoprusuHazirMi()) {
      adminKoprusu()
        .persistAdminLog(
          log.action,
          'system',
          log.targetId || null,
          log.targetName,
          undefined,
          { details: log.details },
        )
        .catch((err) => console.warn('Audit log persist failed:', err));
    }
  },

  // User Notifications
  userNotifications: [],
  isNotificationsOpen: false,
  setIsNotificationsOpen: (open) => set({ isNotificationsOpen: open }),
  navOverlayOpen: false,
  setNavOverlayOpen: (open) => set({ navOverlayOpen: open }),
  isRoleSwitcherOpen: false,
  setIsRoleSwitcherOpen: (open) => set({ isRoleSwitcherOpen: open }),
  isGuest: false,
  setIsGuest: (v) => set({ isGuest: v }),
  pendingIntent: null,
  setPendingIntent: (view, matchId) => {
    const rec = { view, matchId, ts: Date.now() };
    set({ pendingIntent: rec });
    try { localStorage.setItem(PENDING_INTENT_KEY, JSON.stringify(rec)); }
    catch { /* depolama yoksa bellek kopyası yeter */ }
  },
  consumePendingIntent: () => {
    let rec = get().pendingIntent;
    if (!rec) {
      // Bellek boş: OAuth yönlendirmesi sayfayı yeniden yüklemiş olabilir.
      try {
        const raw = localStorage.getItem(PENDING_INTENT_KEY);
        if (raw) rec = JSON.parse(raw);
      } catch { rec = null; }
    }
    try { localStorage.removeItem(PENDING_INTENT_KEY); } catch { /* yok sayılır */ }
    set({ pendingIntent: null });
    // Bayat niyet kullanıcıyı beklemediği bir ekrana atar; 30 dk sonra düşer.
    if (!rec || typeof rec.ts !== 'number' || Date.now() - rec.ts > PENDING_INTENT_MAX_AGE_MS) return null;
    return { view: rec.view, matchId: rec.matchId };
  },
  authStartMode: null,
  setAuthStartMode: (m) => set({ authStartMode: m }),
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
  // (Tek lobi P4) acceptMatchInvite/rejectMatchInvite olu zinciri kaldirildi —
  // davet-kabul artik DB bildirimi + player_assign_slot (aninda atama) ile yurur.
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
