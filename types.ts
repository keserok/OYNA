
declare global {
  interface Window {
    recaptchaVerifier: any;
  }
}

export enum UserRole {
  SUPER_ADMIN = 'SUPER_ADMIN',
  COMMUNITY_ADMIN = 'COMMUNITY_ADMIN',
  CAPTAIN = 'CAPTAIN',
  PLAYER = 'PLAYER',
  GOALKEEPER = 'GOALKEEPER',
  REFEREE = 'REFEREE',
  OWNER = 'OWNER'
}

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
  isPro: boolean;            
  joinDate: string;          
  matchCount: number;        
  wallet?: number;           
  reliabilityScore?: number; 
  banExpiresAt?: string | null; 
  communities?: string[];    
  playerCard?: PlayerCardData;
  oynaId?: string; // Benzersiz OYNA Kimliği Örn: #ARD932
  friends?: string[]; // Onaylanmış arkadaşların User ID'leri
  isLookingForTeam?: boolean; // Transfer Merkezi Görünürlüğü
  newMatchBadge?: boolean; // Yeni maç eklendi bildirim rozeti
}

export interface AdminLog {
  id: string;
  action: 'PRICE_CHANGE' | 'GHOST_MODE' | 'BAN_USER' | 'SETTINGS_CHANGE';
  targetId: string;
  targetName: string;
  details: string;
  timestamp: string;
  adminId: string;
}

export interface IUser {
  id: string;
  name: string;
  email: string;
  avatar?: string;
  roles: UserRole[];
  communities: string[]; // Community IDs
  fairPlayScore: number;
}

export interface ICommunity {
  id: string;
  name: string;
  domain: string; // e.g. "@boun.edu.tr"
  logo?: string;
  memberCount: number;
  activeMatches: number;
  isVerified: boolean;
}

export interface ITeam {
  id: string;
  name: string;
  color: string; // Tailwind color class
  communityId?: string; // Optional, if independent
  captainId: string;
  formation: '5+1' | '6+1' | '7+1';
  stats: {
    wins: number;
    losses: number;
    fairPlayScore: number;
  };
  roster: {
    userId: string;
    position: string;
    fairPlayScore: number;
  }[];
}

export interface IMatch {
  id: string;
  homeTeamId: string;
  awayTeamId: string;
  homeScore?: number;
  awayScore?: number;
  homeFairPlay?: number;
  awayFairPlay?: number;
  homeCaptainApproved: boolean;
  awayCaptainApproved: boolean;
  status: 'PENDING' | 'PLAYING' | 'WAITING_APPROVAL' | 'COMPLETED';
}

export interface Match {
  id: string;
  teamA: string;
  teamB: string;
  scoreA: number;
  scoreB: number;
  date: string;
  time: string;
  pitch: string;
}


export type AppView = 'SPLASH' | 'AUTH' | 'LOCATION_PROMPT' | 'ROLE_SELECTION' | 'DASHBOARD' | 'PITCH_DISCOVERY' | 'MARKETPLACE_REF' | 'MARKETPLACE_GK' | 'MY_LISTINGS' | 'LISTING_DETAILS' | 'PAYMENT' | 'MY_TEAM' | 'PROFILE' | 'NOTIFICATIONS' | 'BOOKING_ADDONS' | 'LOYALTY_CARD' | 'SETTINGS' | 'VOTING' | 'MOTM_REVEAL' | 'OYNA_TV' | 'MATCH_DISCOVERY' | 'MATCH_JOIN' | 'PREMIUM' | 'CHAT' | 'MATCH_TICKET' | 'SCOUT_DASHBOARD' | 'POST_MATCH' | 'MATCH_DIARY_DETAIL' | 'STUDIO' | 'WALLET' | 'MATCH_LOBBY' | 'OPPONENT_FINDER' | 'MATCH_CALENDAR' | 'ADMIN_PANEL' | 'TEAM_BUILDER' | 'COMMUNITY_VIEW' | 'TEAM_CREATOR' | 'TRANSFER_CENTER' | 'LEADERBOARDS' | 'POST_MATCH_EVAL' | 'TOURNAMENT_BRACKET' | 'COMMUNITY_ADMIN_DASHBOARD' | 'MATCH_CREATE' | 'SERVICE_DASHBOARD' | 'OWNER_PANEL' | 'QR_SCANNER' | 'MATCHES' | 'PARTNER_ONBOARDING' | 'UPCOMING_MATCHES' | 'CARD_BUILDER';

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
}

export interface PlayerCard {
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
  players: PlayerCard[];
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
  karatScore?: number; // Macro Team Karat değeri
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
  time: string;
  date: string;
  price: number;
  difficulty: 'Ciddi' | 'Taktiksel' | 'Rahat';
  minRating: number;
  image: string;
  badges: string[];
  missingPositions: { role: string; count: number }[];
  slots: PositionSlot[];
  status?: 'DRAFT' | 'ACTIVE' | 'CANCELLED' | 'COMPLETED' | 'LIVE';
  creatorId?: string;
  communityId?: string;
  format?: string;
  duration?: string;
  gender?: string;
  ageGroup?: string;
  // Hakem ve Skor Otoritesi
  refereeId?: string; // Appointed referee
  refereeStatus?: 'PENDING' | 'ON_THE_WAY' | 'ARRIVED'; // Canlı hakem takibi
  gkStatus?: 'PENDING' | 'ON_THE_WAY' | 'ARRIVED'; // Canlı kaleci takibi
  ownerCheckIn?: boolean; // Tesisin ekibi onaylama durumu
  homeTeamId?: string;
  awayTeamId?: string;
  homeScore?: number;
  awayScore?: number;
  scoreEnteredAt?: string; // Timestamp when referee entered score
  chatMessages?: { id: string; senderId: string; senderName: string; senderAvatar: string; text: string; timestamp: string }[];
  awaySlots?: PositionSlot[];
  reservePlayers?: Player[];
  cancelReason?: string;
  refundStatus?: string;
}

export interface PositionSlot {
  id: string;
  role: string; // 'LB', 'CB', 'CM', etc.
  x: number;
  y: number;
  status: 'OPEN' | 'TAKEN' | 'LOCKED';
  player?: Player; // If taken
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

// SERVICE PROVIDER TYPES (Updated)
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

// ============================================================================
// OWNER SAAS & UI CONFIGURATION (PATRON PANELİ)
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
  role: 'PLAYER' | 'CAPTAIN' | 'GK' | 'REF';
  loyaltyScore: number; // Tesis bazlı sadakat skoru
  totalSpent: number; // Tesis bazlı harcama
  isVip: boolean;
  isBanned: boolean;
  customNote: string;
  lastVisit: string;
}
