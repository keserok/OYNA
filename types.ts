
declare global {
  interface Window {
    recaptchaVerifier: any;
  }
}

export enum UserRole {
  SUPER_ADMIN = 'SUPER_ADMIN',
  PLAYER = 'PLAYER',
  GOALKEEPER = 'GOALKEEPER',
  REFEREE = 'REFEREE',
  OWNER = 'OWNER'
}

/** @deprecated Kaptanlık global rol değil; takım-içi yöneticilik. Kaldırılacak. */
export const CAPTAIN_ROLE_DEPRECATED = 'CAPTAIN' as const;

export interface AdminUser {
  id: string;
  name: string;
  email: string;
  phone?: string;
  avatar: string;
  role: UserRole;             
  roles?: UserRole[];        
  rating: number;            
  isVerified: boolean;       
  isBanned: boolean;         
  isShadowBanned?: boolean;
  isMuted?: boolean;
  joinDate: string;          
  matchCount: number;        
  wallet?: number;           
  reliabilityScore?: number; 
  banExpiresAt?: string | null; 
  playerCard?: PlayerCardData;
  oynaId?: string; // Benzersiz OYNA Kimliği Örn: #ARD932
  friends?: string[]; // Onaylanmış arkadaşların User ID'leri
  isLookingForTeam?: boolean; // Transfer Merkezi Görünürlüğü
  newMatchBadge?: boolean; // Yeni maç eklendi bildirim rozeti
  cardActive?: boolean; // Premium oyuncu kartı admin tarafından aktif mi (card_active)
  cardTier?: 'bronze' | 'silver' | 'gold' | null; // Aktif kartın tier'ı (card_tier)
}

export interface AdminLog {
  id: string;
  action: 'PRICE_CHANGE' | 'GHOST_MODE' | 'BAN_USER' | 'SETTINGS_CHANGE' | string;
  targetId: string;
  targetName: string;
  details: string;
  timestamp: string;
  adminId: string;
  adminName?: string;
}

export interface IUser {
  id: string;
  name: string;
  email: string;
  avatar?: string;
  roles: UserRole[];
  fairPlayScore: number;
}


/** Tamamlanmış bir maçın basit skor kaydı. */
export interface BasicMatchRecord {
  id: string;
  teamA: string;
  teamB: string;
  scoreA: number;
  scoreB: number;
  date: string;
  time: string;
  pitch: string;
}

/** Geriye dönük uyumluluk alias'ı: eski `Match` = basit maç skor kaydı.
 *  (Lobi/keşif için MatchListing kullanılır.) */
export type Match = BasicMatchRecord;


export type AppView = 'SPLASH' | 'ONBOARDING' | 'AUTH' | 'LOCATION_PROMPT' | 'ROLE_SELECTION' | 'PENDING_VERIFICATION' | 'DASHBOARD' | 'PITCH_DISCOVERY' | 'MY_BOOKINGS' | 'MARKETPLACE_REF' | 'MARKETPLACE_GK' | 'MY_LISTINGS' | 'LISTING_DETAILS' | 'PAYMENT' | 'MY_TEAM' | 'MY_TEAM_TACTICS' | 'PROFILE' | 'NOTIFICATIONS' | 'SETTINGS' | 'MATCH_DISCOVERY' | 'MATCH_JOIN' | 'MATCH_TICKET' | 'POST_MATCH' | 'MATCH_DIARY_DETAIL' | 'STUDIO' | 'WALLET' | 'OPPONENT_FINDER' | 'MATCH_CALENDAR' | 'ADMIN_PANEL' | 'TEAM_BUILDER' | 'SOCIAL' | 'TEAM_CREATOR' | 'POST_MATCH_EVAL' | 'MATCH_CREATE' | 'SERVICE_DASHBOARD' | 'OWNER_PANEL' | 'QR_SCANNER' | 'MATCHES' | 'PARTNER_ONBOARDING' | 'SERVICE_APPLICATION' | 'UPCOMING_MATCHES' | 'LEGAL' | 'MESSAGES';

export interface SavedPaymentCard {
  id: string;
  last4: string;
  brand: 'Visa' | 'Mastercard' | 'Troy';
  color: string;
  holder: string;
}

export type WalletTab = 'MAIN' | 'CARD_SETTINGS';

export interface PlayerStat {
  value: number;
  videoUrl: string | null;
}

export interface PlayerCardData {
  overall: number;
  tier: 'gold' | 'silver' | 'bronze';
  isStatsVerified: boolean;
  diamondValue: number;
  flatModifier?: number; // Opanel admin override katsayısı
  winCount: number;
  totalMatches: number;
  cardImage?: string;
  stats: {
    pace: PlayerStat;
    shooting: PlayerStat;
    passing: PlayerStat;
    dribbling: PlayerStat;
    defense: PlayerStat;
    physical: PlayerStat;
  };
}

export enum GkStyle {
  PANTHER = 'PANTER', // Refleks
  WALL = 'DUVAR',     // Pozisyon alma
  LIBERO = 'LİBERO'   // Ayak hakimiyeti
}

export interface Player {
  id: string;
  name: string;
  avatar: string;
  rating: number;
  position: string;
  x: number; // Percentage 0-100
  y: number; // Percentage 0-100
  paymentStatus?: 'PAID' | 'PENDING' | 'UNPAID'; // New for Match Lobby
  instruction?: string;
  style?: string;
}

export interface FieldPlayerCard {
  id: string;
  name: string;
  position: string;
  rating: number;
  isSpecial: boolean; // Red card if true
  avatar: string;
  x: number; // Position on field
  y: number; // Position on field
}

export interface TeamFormation {
  name: string; // e.g., "2-3-1"
  players: FieldPlayerCard[];
}

export interface MatchScore {
  id: string;
  opponent: string;
  score: string; // "3-2"
  result: 'WIN' | 'LOSS' | 'DRAW';
  date: string;
}

export interface Team {
  id: string;
  name: string;
  logo: string; // URL or Emoji
  colors: [string, string]; // Primary, Secondary hex
  wins: number;
  losses: number;
  playStyle: string;
  roster: Player[];
  formation?: TeamFormation;
  level?: 'EASY' | 'MEDIUM' | 'HARD';
  distance?: string;
  winRate?: string;
  fairPlay?: string;
  avgAge?: string;
  matches?: number;
  pitch?: string;
  time?: string;
  date?: string; // Detailed date
  weather?: {
    temp: number;
    condition: 'SUNNY' | 'CLOUDY' | 'RAINY';
  };
  matchHistory?: MatchScore[];
  coordinates?: { x: number; y: number; lat?: number; lng?: number };
  stats?: { attack: number; defense: number; midfield: number; physical: number; teamwork: number };
  shortName?: string;
  location?: string;
  color1?: string;
  color2?: string;
  crest?: string;
  players?: string[]; // List of player IDs
  captains?: string[]; // Array of Captain IDs (Multi-Captaincy)
  captain?: string; // Singular Captain ID
  teamValue?: string;
  rating?: number;
  teamWins?: number;
  teamTotalMatches?: number;
}

export interface OpponentListing {
  id: string;
  teamName: string;
  teamLogo: string;
  captainName: string;
  captainBadge: 'MAESTRO' | 'YARATICI' | 'KAYA';
  rating: number; // 5.0 scale
  avgAge: number;
  level: 'HOBİ' | 'ORTA' | 'PRO';
  stats: {
    aggression: number; // 0-100 (Sertlik)
    technique: number; // 0-100 (Teknik)
  };
  pitchStatus: 'HAS_PITCH' | 'NEEDS_PITCH' | 'SPLIT_PITCH';
  pitchDetails?: {
    name: string;
    image: string;
    location: string;
  };
  topPlayers: { avatar: string; role: string }[]; // New: Top 3 players
  description: string; // New: Friendly description
  location: string;
  date?: string; // Optional if flexible
  time?: string; // Optional if flexible
  distance: string;
}

export interface MatchListing {
  id: string;
  title: string;
  location: string;
  pitchName?: string; // Saha adı etiketi (servis panelleri için)
  time: string;
  date: string;
  price: number;
  difficulty: 'Ciddi' | 'Taktiksel' | 'Rahat';
  minRating: number;
  image: string;
  badges: string[];
  missingPositions: { role: string; count: number }[];
  slots: PositionSlot[];
  status?: 'DRAFT' | 'ACTIVE' | 'CONFIRMED' | 'CANCELLED' | 'COMPLETED' | 'LIVE';
  creatorId?: string;
  format?: string;
  duration?: string;
  gender?: string;
  ageGroup?: string;
  // Hakem ve Skor Otoritesi
  refereeId?: string; // Appointed referee (FAZ 5: capture sonrası atanır)
  gkId?: string;      // Appointed goalkeeper (FAZ 5: capture sonrası atanır)
  refereeStatus?: 'PENDING' | 'ON_THE_WAY' | 'ARRIVED'; // Canlı hakem takibi
  gkStatus?: 'PENDING' | 'ON_THE_WAY' | 'ARRIVED'; // Canlı kaleci takibi
  ownerCheckIn?: boolean; // Tesisin ekibi onaylama durumu
  homeTeamId?: string;
  awayTeamId?: string;
  homeTeamName?: string;
  awayTeamName?: string;
  homeScore?: number;
  awayScore?: number;
  scoreEnteredAt?: string; // Timestamp when referee entered score
  chatMessages?: { id: string; senderId: string; senderName: string; senderAvatar: string; text: string; timestamp: string }[];
  awaySlots?: PositionSlot[];
  reservePlayers?: Player[];
  cancelReason?: string;
  refundStatus?: string;
  // FAZ 3: maç çekirdeği
  visibility?: 'OPEN' | 'PRIVATE';
  privateCode?: string;       // özel maç katılım kodu
  pitchId?: string;           // rezerve edilen saha (owner kredisi + iade için)
  isSuccessful?: boolean;     // "başarılı maç" sinyali (ödendi+oynandı+iptal yok)
  confirmedAt?: string;       // T-8s quorum onay zamanı
  startsAt?: string;          // maç başlangıç timestamp'i (lifecycle için)
  isDemo?: boolean;           // demo/seed maçı (panelde rozetle ayrıştırılır)
}

export interface PositionSlot {
  id: string;
  role: string; // 'LB', 'CB', 'CM', etc.
  x: number;
  y: number;
  status: 'OPEN' | 'TAKEN' | 'LOCKED';
  player?: Player; // If taken
  // Çoklu-slot satın alma + arkadaşa/koda atama (FAZ8)
  purchasedBy?: string;            // slotu satın alan (ödeyen) kullanıcı id
  occupant?: string;               // slotta görünen kullanıcı id (başta satın alan)
  assignmentStatus?: 'SELF' | 'INVITED' | 'LINK_PENDING' | 'ACCEPTED';
  inviteeId?: string;              // davet edilen arkadaş id
  claimCode?: string;              // paylaşılabilir devralma kodu
  side?: 'HOME' | 'AWAY';          // Takım maçında ev sahibi / deplasman tarafı (FAZ8 S38)
}

export interface Court {
  id: string;
  name: string;
  type: 'OPEN' | 'CLOSED';
  price: number;
  slots: { time: string; status: 'available' | 'booked' | 'selected' }[];
  description?: string;
  images?: string[];
  features?: string[];
  lighting?: number;
  grassQuality?: number;
  lockerRoomQuality?: number;
}

export interface Pitch {
  id: string;
  name: string;
  district: string; // New: District name
  location: string; // Full address
  distance: string;
  rating: number;
  googleRating: number;
  googleReviews: number;
  pricePerPerson: number;
  totalPrice: number;
  image: string; // Cover image
  images: string[]; // New: Gallery images
  description?: string; // New: Facility description
  amenities: string[]; // New: Shower, Wifi etc.
  lighting: number;
  grassQuality: number;
  lockerRoomQuality: number;
  goalQuality: number;
  occupancy: number; // 0-100 percentage
  // A/B/C grade ratings (from owner panel)
  lightingGrade?: 'A' | 'B' | 'C';
  grassGrade?: 'A' | 'B' | 'C';
  lockerRoomGrade?: 'A' | 'B' | 'C';
  coordinates: { lat: number; lng: number };
  slots: { time: string; status: 'available' | 'booked' | 'selected' }[];
  courts?: Court[]; // Multiple courts in one facility
  isCluster?: boolean;
  clusterCount?: number;
  isApproved?: boolean; // Admin approval flag
  paymentOptions?: { online: boolean; deposit: boolean; cash: boolean }; // Payment options configured by owner
  paramMerchantId?: string;
  paramApiKey?: string;
  paramClientId?: string;
  ownerId?: string;
  workingHours?: { open: string; close: string; slotDuration: number; activeDays?: string[] };
  pricingPolicy?: any[];
  surfaceType?: 'SUNİ ÇİM' | 'DOĞAL ÇİM' | 'PARKE' | 'TARTAN';
  dimensions?: string; // e.g. "30x50"
  facilityId?: string; // Link to the main facility
  // Owner module — aktif flash indirim (PitchDiscovery'de rozet için)
  flashDiscount?: number;
  flashDealId?: string;
  /** İndirim öncesi orijinal fiyat; flashDiscount varsa totalPrice indirimli gösterilir */
  originalPrice?: number;
  /** Owner panel tarifeleri — saat bazlı fiyat/kapora hesabı için */
  tariffs?: PitchTariff[];
}

export interface Facility {
  id: string;
  ownerId: string;
  name: string;
  district: string;
  location: string;
  coverImage: string;
  images: string[];
  description: string;
  amenities: string[];
  coordinates: { lat: number; lng: number };
  workingHours: { open: string; close: string; slotDuration: number; activeDays?: string[] };
  pitches: Pitch[]; // Embedded or referenced pitches
}

export interface Customer {
  id: string;
  ownerId: string; // The facility owner who added this customer
  name: string;
  phone: string;
  avatar?: string;
  reliabilityScore: number;
  balance: number; // Positive means debt (veresiye), negative means credit
  totalMatches: number;
  lastMatchDate?: string;
  notes?: string;
}

export interface ServiceReview {
  id: string;
  author: string;
  rating: number;
  comment: string;
  date: string;
}

export interface Referee {
  id: string;
  authUid?: string; // Link to users table for actual login
  name: string;
  distance?: string; // Kullanıcı konumuna göre hesaplanan mesafe etiketi
  level: string;
  matchCount: number;
  fee: number;
  avatar: string;
  rating: number;
  style: string;
  bio: string;
  preferredZones: string[];
  isElite?: boolean;
  coordinates: { lat: number; lng: number };
  stats: {
    avgCards: number;
    varCallAccuracy?: string;
    avgDistance: string;
    authority: number; // 0-100
    fitness: number; // 0-100
    communication: number; // 0-100
  };
  reviews: ServiceReview[];
  isAvailable?: boolean;
  workingHours?: { activeDays: string[]; activeHours: string };
  settings?: any;
}

export interface Equipment {
  id: string;
  name: string;
  image: string;
  tier: 'PRO' | 'ELITE' | 'BASIC';
  bonus: string;
}

export interface Goalkeeper {
  id: string;
  name: string;
  distance?: string; // Kullanıcı konumuna göre hesaplanan mesafe etiketi
  height: string;
  age: number;
  rating: number;
  fee: number;
  matchCount?: number;
  avatar: string;
  recentAwards: string;
  style: GkStyle | string;
  bio: string;
  preferredZones: string[];
  isElite?: boolean;
  coordinates: { lat: number; lng: number };
  stats: {
    savePercentage: string;
    cleanSheets: number;
    penaltySaveRate: string;
    reflexes: number;
    diving: number;
    positioning: number;
    distribution: number;
    oneOnOne: number;
    aerialReach: number;
  };
  skills: {
    reflexes: number;
    diving: number;
    handling: number;
    positioning: number;
    kicking: number;
    speed: number;
  };
  equipment: {
    gloves: string;
    boots: string;
    jersey: string;
  };
  reviews: ServiceReview[];
  isAvailable?: boolean;
  workingHours?: { activeDays: string[]; activeHours: string };
  settings?: any;
}

export interface ChatMessage {
  id: string;
  sender: 'AI' | 'USER' | 'OWNER';
  text: string;
  timestamp: string;
}

export interface ServiceJob {
  id: string;
  date: string;
  time: string;
  location: string;
  pitchName: string;
  fee: number;
  status: 'CONFIRMED' | 'PENDING';
}

// OWNER PANEL TYPES
export interface Transaction {
  id: string;
  user: string;
  date: string;
  amount: number;
  type: 'BOOKING' | 'ADDON';
  status: 'COMPLETED' | 'PENDING';
}

export interface Review {
  id: string;
  user: string;
  rating: number;
  comment: string;
  date: string;
  metrics: { lighting: number; grass: number; goal: number };
  reply?: string;
}

export interface BusinessInsight {
  id: string;
  type: 'PRICING' | 'INVESTMENT' | 'INVENTORY';
  title: string;
  description: string;
  impact: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// FAZ 5 — KANONİK HİZMET MODELİ (Kaleci & Hakem)
// JobListing / DirectOffer / IncomingBid → tek `ServiceRequest` ile birleşti.
// Eski üç model (aşağıda) @deprecated; yeni akışlar ServiceRequest kullanır.
// ═══════════════════════════════════════════════════════════════════════════
export type ProviderType = 'GK' | 'REF';
export type ServiceRequestStatus =
  | 'PENDING' | 'ACCEPTED' | 'REJECTED' | 'CAPTURED' | 'COMPLETED' | 'CANCELLED' | 'EXPIRED';

/** Tek talep modeli — kadro/kaptan bir kaleci/hakem talep eder. */
export interface ServiceRequest {
  id: string;
  matchId: string;
  providerId: string;
  providerType: ProviderType;
  requestedBy: string;
  fee: number;
  commissionAmount: number;
  providerAmount: number;           // ücret − %10 komisyon (sağlayıcının eline geçen)
  requestKind: 'INDIVIDUAL' | 'SQUAD_VOTE';
  status: ServiceRequestStatus;
  paymentIntentId?: string;
  payoutReleased: boolean;
  acceptedAt?: string;
  capturedAt?: string;
  completedAt?: string;
  cancelledAt?: string;
  expiresAt?: string;
  createdAt: string;
}

/** find_providers_for_match çıktısı — sıralı öneri kartı. */
export interface ProviderSuggestion {
  id: string;
  name: string;
  avatar?: string;
  rating: number;
  fee: number;
  match_count: number;
  style?: string;
  level?: string;                   // yalnız hakem
  preferred_zones?: string[];
  coordinates?: { lat: number; lng: number };
  is_elite?: boolean;
}

/** Maç sonu kaleci/hakem 1-10 puanlaması. */
export interface ServiceRating {
  id: string;
  matchId: string;
  providerId: string;
  providerType: ProviderType;
  raterId: string;
  score: number;                    // 1-10
  comment?: string;
  createdAt: string;
}

/** Onboarding başvurusu (kimlik foto + telefon + niyet mektubu). */
export interface ProviderApplication {
  id: string;
  userId: string;
  role: 'GOALKEEPER' | 'REFEREE';
  idPhotoPath: string;
  phone: string;
  intentLetter: string;
  level?: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  adminNotes?: string;
  reviewedBy?: string;
  reviewedAt?: string;
  createdAt: string;
}

/** Anlık payout öncesi TC kimlik doğrulama durumu. */
export interface ProviderIdentity {
  userId: string;
  fullName: string;
  status: 'PENDING' | 'VERIFIED' | 'REJECTED';
  verifiedAt?: string;
}

// SERVICE PROVIDER TYPES (Updated)
/** @deprecated FAZ 5: ServiceRequest ile birleşti. Geriye dönük uyumluluk için tutuluyor. */
export interface JobListing {
  id: string;
  type: 'REF' | 'GK';
  pitchName: string;
  location: string;
  distance: string;
  date: string;
  time: string;
  offeredFee: number;
  captainName: string;
  teamName: string;
  minRating: number; // New: Constraint
  viewers: number; // New: FOMO
}

export interface DirectOffer {
  id: string;
  matchId?: string; // Teklifin bağlı olduğu maç (varsa)
  pitchName: string;
  teamName: string;
  captainName: string;
  offerAmount: number;
  time: string;
  date: string;
  message: string;
  expiresIn: string; // "30dk"
}

export interface IncomingBid {
  id: string;
  providerName: string;
  role: 'REFEREE' | 'GOALKEEPER';
  rating: number;
  matchCount?: number; // For Ref
  style?: string; // For GK
  bidAmount: number;
  note: string;
  avatar: string;
}

export interface WalletTransaction {
  id: string;
  date: string;
  description: string;
  amount: number;
  commission: number;
  status: 'CLEARED' | 'PENDING';
}

// FAZ 2: iyzico pre-auth state machine
export type PaymentIntentStatus = 'PENDING' | 'BLOCKED' | 'CAPTURED' | 'PAID' | 'FAILED' | 'REFUNDED' | 'VOIDED';
export type CommissionModel = 'MODEL_A' | 'MODEL_B';
export type PaymentBalanceType = 'EARNINGS' | 'REFUND_CREDIT';
export type PayoutType = 'OWNER_BIWEEKLY' | 'PROVIDER_INSTANT' | 'MANUAL';
export type PayoutStatus = 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED' | 'CANCELLED';

export interface CommissionConfig {
  id: string;
  scope: 'GLOBAL' | 'PITCH' | 'SERVICE_GK' | 'SERVICE_REF' | 'MATCH';
  scope_id: string | null;
  model: CommissionModel;
  rate_pct: number;
  markup_pct: number;
  is_active: boolean;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface PayoutRequest {
  id: string;
  user_id: string;
  amount: number;
  iban: string;
  iban_holder_name: string;
  status: PayoutStatus;
  payout_type: PayoutType;
  scheduled_for: string | null;
  processed_at: string | null;
  admin_notes: string | null;
  created_at: string;
}

// FINANCIAL TYPES
export interface PaymentPool {
  totalAmount: number;
  paidAmount: number;
  deposit: number;
  contributors: { name: string; amount: number; time: string }[];
  status: 'COLLECTING' | 'COMPLETED' | 'FAILED';
}

// MATCH HISTORY / DIARY TYPE
export interface MatchHistoryItem {
  id: string;
  date: string;
  pitchName: string;
  score: string;
  result: 'WIN' | 'LOSS' | 'DRAW';
  formation: '2-3-1' | '3-2-1' | '3-1-2'; // Simple string representation
  rosterSnapshot: { name: string; avatar: string; x: number; y: number }[]; // Added coords for visual replay
  personalNote?: string;
}

// OPANEL AUDIT LOGS
export interface AuditLog {
  id: string;
  adminId: string;
  adminName: string;
  action: 'WALLET_UPDATE' | 'BAN_APPLIED' | 'ROLE_CHANGED' | 'STATS_UPDATED' | 'MATCH_CANCELLED' | 'SHADOW_BAN_APPLIED' | 'MUTE_APPLIED';
  targetId: string;
  details: string;
  timestamp: string;
}

// OPANEL MATCH VERIFICATION
export interface MatchResultVerification {
  id: string;
  matchId: string;
  screenshotUrl: string;
  submittedBy: string; // userId of captain
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  homeScore: number;
  awayScore: number;
  reviewedBy?: string; // adminId
  timestamp: string;
}

// ============================================================================
// OYNA SOCIAL GRAPH (ARKADAŞLIK AĞI)
// ============================================================================
export interface FriendRequest {
  id: string;
  senderId: string;
  senderName: string;
  senderAvatar: string;
  receiverId: string;
  status: 'PENDING' | 'ACCEPTED' | 'REJECTED';
  timestamp: string;
}

export interface PlayerSeekAnnouncement {
  id: string;
  creatorId: string;
  creatorName: string;
  creatorAvatar: string;
  pitchName: string;
  date: string;
  time: string;
  positionsNeeded: string[];
  difficulty: 'Ciddi' | 'Taktiksel' | 'Rahat';
  format: string;
  duration: string;
  gender: string;
  ageGroup: string;
  status: 'ACTIVE' | 'CLOSED';
  joinedPlayers?: string[]; // IDs of users who clicked to join/requested
  acceptedPlayers?: string[]; // IDs of users whose requests were accepted by captain
  createdAt?: string;
}

// ==============================================// OWNER SAAS & UI CONFIGURATION (PATRON PANELİ)
// ============================================================================

export interface FacilityUIConfig {
  id: string;
  facilityId: string;
  primaryColor: string; // Hex color for the facility's theme
  secondaryColor: string;
  cardStyle: 'GLASS' | 'SOLID' | 'MINIMAL';
  badgeIcon: string; // Emoji or icon name
  customGreetingText: string;
  allowReferees: boolean;
  allowGoalkeepers: boolean;
}

export interface RoleAppearanceRule {
  id: string;
  facilityId: string;
  roleType: 'REF' | 'GK' | 'PLAYER';
  tierOverride?: 'gold' | 'silver' | 'bronze' | 'custom';
  customBadge?: string;
  highlightColor?: string;
}

export interface CRMUser {
  id: string;
  facilityId: string;
  userId: string;
  name: string;
  avatar: string;
  role: 'PLAYER' | 'GK' | 'REF';
  loyaltyScore: number; // Tesis bazlı sadakat skoru
  totalSpent: number; // Tesis bazlı harcama
  isVip: boolean;
  isBanned: boolean;
  customNote: string;
  lastVisit: string;
}

// OWNER MODULE TYPES (Saha Sahibi) — canlı Supabase şemasıyla uyumlu satır tipleri
// NOT: alan adları canlı DB kolonlarıyla birebir eşleşir
//   (örn. pitch_bookings.source / price — booking_source / total_price DEĞİL).
// ============================================================================

// `courts` tablosu (spec: "pitch_courts")
export interface PitchCourt {
  id: string;
  pitch_id: string;
  name: string;
  court_type: string; // 'GRASS' | 'TURF' | 'INDOOR' | 'CLAY' | 'OPEN' | 'CLOSED' ...
  size?: string | null;
  price?: number | null;
  capacity?: number | null;
  images?: string[] | null;
  description?: string | null;
  is_active: boolean;
  lighting_grade?: string | null;
  grass_grade?: string | null;
  locker_grade?: string | null;
  sort_order: number;
  created_at?: string;
}

export interface PitchTariff {
  id: string;
  pitch_id: string;
  court_id?: string | null;
  name: string;
  tariff_type: 'WEEKDAY' | 'WEEKEND' | 'HOLIDAY' | 'SPECIAL';
  applies_to_days: number[];
  start_time: string;
  end_time: string;
  price_per_hour: number;
  deposit_amount: number;
  is_active: boolean;
  sort_order: number;
}

export interface BookingPayment {
  id: string;
  booking_id: string;
  amount: number;
  payment_method: 'CASH' | 'CARD' | 'BANK_TRANSFER' | 'OYNA_WALLET';
  note: string | null;
  recorded_by?: string | null;
  created_at: string;
}

// `pitch_bookings` tablosu (zenginleştirilmiş)
export interface PitchBookingFull {
  id: string;
  pitch_id: string;
  court_id: string | null;
  user_id: string | null;
  match_id: string | null;
  subscription_id?: string | null;
  title: string | null;
  customer_name: string | null;
  customer_phone: string | null;
  booking_date: string;
  start_time: string;
  end_time: string;
  status: 'PENDING' | 'CONFIRMED' | 'CANCELLED';
  source: 'OWNER_MANUAL' | 'APP_BOOKING' | 'SUBSCRIPTION' | 'APP_MATCH';
  tariff_id: string | null;
  price: number;
  deposit_amount: number;
  paid_amount: number;
  payment_status: 'PENDING' | 'PARTIAL' | 'PAID' | 'REFUNDED' | 'WAIVED';
  note: string | null;
  cancelled_at?: string | null;
  cancellation_reason?: string | null;
  created_at?: string;
  // join'ler
  courts?: { name: string | null } | null;
  booking_payments?: BookingPayment[];
}

export interface PitchExpense {
  id: string;
  pitch_id: string;
  category: string;
  title: string;
  amount: number;
  expense_date: string;
  note: string | null;
  created_by?: string | null;
  created_at?: string;
}

export interface PitchDebtor {
  id: string;
  pitch_id: string;
  oyna_user_id: string | null;
  name: string;
  phone: string | null;
  amount_owed: number;
  last_match_date: string | null;
  notes: string | null;
  is_resolved: boolean;
  last_reminded_at?: string | null;
  created_at?: string;
}

export interface PitchStaffMember {
  id: string;
  pitch_id: string;
  name: string;
  role_title: string;
  status: 'ON_DUTY' | 'OFF_DUTY' | 'LEAVE';
  avatar_url: string | null;
  phone: string | null;
  sort_order: number;
  created_at?: string;
}

export interface PitchStaffTask {
  id: string;
  pitch_id: string;
  title: string;
  assigned_to: string | null;
  assigned_name: string | null;
  priority: 'LOW' | 'MEDIUM' | 'HIGH';
  status: 'PENDING' | 'COMPLETED' | 'CANCELLED';
  due_time: string | null;
  due_date: string | null;
  created_at?: string;
}

export interface PitchBankAccount {
  id: string;
  pitch_id: string;
  bank_name: string;
  account_holder: string;
  iban: string;
  is_primary: boolean;
  created_at?: string;
}

export interface PitchPaymentSettings {
  paymentOptions: { online: boolean; deposit: boolean; cash: boolean };
  paramMerchantId: string;
  paramClientId: string;
  paramApiKey: string;
}

export interface OwnerEntitlements {
  max_facilities: number;
  max_courts: number;
  max_staff: number;
  flash_deals: boolean;
  finance: boolean;
  team: boolean;
  withdrawals: boolean;
}

export interface OwnerAccount {
  id: string;
  owner_user_id: string;
  plan_tier: 'starter' | 'pro' | 'enterprise';
  status: 'trialing' | 'active' | 'past_due' | 'suspended' | 'cancelled';
  trial_ends_at: string | null;
  entitlements: OwnerEntitlements;
  billing_email: string | null;
  created_at?: string;
}

// `pitch_subscriptions` tablosu (canlı: weekday / price / customer_name)
export interface PitchSubscription {
  id: string;
  pitch_id: string;
  court_id: string | null;
  user_id: string | null;
  customer_name: string;
  customer_phone: string | null;
  weekday: number; // 1=Pazartesi .. 7=Pazar (ISO)
  start_time: string;
  end_time: string | null;
  price: number;
  status: 'ACTIVE' | 'PAUSED' | 'CANCELLED' | 'EXPIRED';
  start_date: string;
  end_date: string | null;
  materialized_until?: string | null;
  auto_renew?: boolean;
  notes: string | null;
  created_at?: string;
}

export interface FlashDeal {
  id: string;
  pitch_id: string;
  court_id: string | null;
  booking_date: string;
  start_time: string;
  discount_percent: number;
  original_price: number;
  deal_price: number;
  expires_at: string;
  is_claimed: boolean;
  claimed_by?: string | null;
  claimed_at?: string | null;
  created_at?: string;
}

export interface WithdrawalRequest {
  id: string;
  pitch_id: string;
  owner_id: string;
  amount: number;
  iban: string;
  iban_photo_url: string | null;
  status: 'PENDING' | 'APPROVED' | 'PROCESSING' | 'COMPLETED' | 'REJECTED';
  admin_notes?: string | null;
  processed_at?: string | null;
  created_at: string;
}

export interface MatchScoreToken {
  id: string;
  match_id: string;
  token: string;
  expires_at: string;
  used_at: string | null;
  used_by: string | null;
  created_at?: string;
}

export interface MatchDispute {
  id: string;
  match_id: string;
  raised_by: string;
  home_claimed_score: string | null;
  away_claimed_score: string | null;
  evidence_urls: string[];
  status: 'OPEN' | 'UNDER_REVIEW' | 'RESOLVED' | 'DISMISSED';
  resolution_notes: string | null;
  resolved_at: string | null;
  created_at: string;
}

export interface PitchAvailabilityException {
  id: string;
  pitch_id: string;
  court_id: string | null;
  exception_date: string | null;
  day_of_week: number | null;
  start_time: string | null;
  end_time: string | null;
  reason: string | null;
  exception_type: 'MAINTENANCE' | 'PRIVATE_EVENT' | 'HOLIDAY' | 'EMERGENCY' | 'OTHER';
  is_recurring: boolean;
  created_at?: string;
}

export interface OwnerDailySummary {
  pitch_id: string;
  pitch_name: string;
  owner_id: string;
  summary_date: string;
  total_bookings_today: number;
  confirmed_today: number;
  pending_today: number;
  expected_revenue_today: number;
  collected_today: number;
  total_courts: number;
  active_courts: number;
}

// pitches satırının owner modülünde kullanılan alanları (DB ile uyumlu)
export interface OwnerPitch {
  id: string;
  owner_id: string | null;
  name: string;
  city: string | null;
  district: string | null;
  address?: string | null;
  price_per_match: number | null;
  total_price: number | null;
  price_per_person: number | null;
  iban: string | null;
  verification_status: 'pending' | 'approved' | 'rejected';
  verification_notes?: string | null;
  pricing_mode: 'FULL' | 'PER_PERSON';
  is_open: boolean;
  is_demo?: boolean;
  auto_approve_minutes: number;
  description?: string | null;
  amenities?: string[] | null;
  platform_commission_rate?: number | null;
  cancellation_policy?: {
    before_24h_refund_percent: number;
    before_12h_refund_percent: number;
    before_0h_refund_percent: number;
  } | null;
  working_hours?: Record<string, unknown> | null;
  latitude?: number | null;
  longitude?: number | null;
  google_rating?: number | null;
  google_review_count?: number | null;
  rating?: number | null;
  image?: string | null;
  images?: string[] | null;
  created_at?: string;
  payment_options?: { online?: boolean; deposit?: boolean; cash?: boolean } | null;
  param_merchant_id?: string | null;
  param_client_id?: string | null;
  param_api_key?: string | null;
  // join'ler
  courts?: PitchCourt[];
  pitch_tariffs?: PitchTariff[];
}
