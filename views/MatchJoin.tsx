import React, { useState, useEffect, useMemo } from 'react';
import { Spinner } from '../components/ui/Spinner';
import {
  ArrowLeft, MapPin, Clock, Calendar, Zap, Hand, Scale,
  X, Loader2, ChevronRight, Diamond, Search, UserPlus,
  Plus, CheckCircle2, Users, Star, Wifi, WifiOff,
  Send, AlertCircle, Shield, Layers, Droplets, Award,
  DollarSign, Info, KeyRound, Copy, Ruler, Activity, Wallet, CreditCard
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { MatchListing, PositionSlot, UserRole, Player, Team, ProviderType, ProviderSuggestion, ServiceRequest } from '../types';
import { useAppStore } from '../store';
import { auth } from '../supabaseAuth';
import { supabase } from '../supabaseClient';
import { subscribeToMatchUpdates, getMatchDetails, getPitchCoordinates, getMatchLobbyParticipants, getFriendPlayerCard, getMatchProviders, type LobbyParticipant, type FriendPlayerCard, type MatchProvider } from '../services/matchService';
import { sendFriendRequest } from '../services/friendService';
import { findProvidersForMatch, createServiceRequest, getMatchServiceRequests, acceptProviderApplication, declineProviderApplication, captainConfirmService, fundServiceRequest, captainReportNoShow } from '../services/serviceRequestService';
import { checkMatchThreshold, cancelMatchByCaptain } from '../services/matchLifecycleService';
import { formatTRY } from '../utils/formatTRY';
import { FORMATIONS as FORMATIONS_SSOT, type SquadSize } from '../utils/formations';
import TeamPlanBanner from '../components/social/TeamPlanBanner';
// Tek kaynak lobi mantığı — admin paneli (MatchLobbyPitch) ile AYNI fonksiyonlar (drift yok).
import { normalizeRole, inferSquadSize, applyCanonicalCoords } from '../shared/lobbyEnrichment';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { OYNA_TILE_URL, oynaTileProps, oynaMapProps, OYNA_MAP_CSS } from '../components/map/mapBase';
import { Toast } from '../components/common/Toast';

// Fix leaflet default icon path issues
if (typeof window !== 'undefined') {
  delete (L.Icon.Default.prototype as any)._getIconUrl;
  L.Icon.Default.mergeOptions({
    iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
    iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
    shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
  });
}

// Ortak harita temeli: atıf GÖRÜNÜR + zoom'da pin dondurma + kalite ayarları.
const AIRBNB_MAP_CSS = OYNA_MAP_CSS;

const ChangeView = ({ center }: { center: [number, number] | null }) => {
  const map = useMap();
  useEffect(() => {
    if (center) {
      map.setView(center, map.getZoom());
    }
  }, [center, map]);
  return null;
};

// ─── Types ────────────────────────────────────────────────────────────────────

interface MatchJoinProps {
  match: MatchListing | null;
  onBack: () => void;
  onJoin: () => void;
}

type SlotInviteStatus = 'NONE' | 'INVITED' | 'ACCEPTED';

// ─── Formasyonlar: tek kanonik kaynak (utils/formations.ts) ────────────────
const FORMATIONS = FORMATIONS_SSOT as Record<string, Record<string, { x: number; y: number; role: string }[]>>;

const checkAndGetStatus = (slots: PositionSlot[], awaySlots?: PositionSlot[]): 'ACTIVE' | 'LIVE' => {
  const allHomeFilled = slots.filter(s => s.status === 'TAKEN').length === slots.length;
  const allHomePaid = slots.every(s => s.status !== 'TAKEN' || s.player?.paymentStatus === 'PAID');
  
  if (awaySlots && awaySlots.length > 0) {
    const allAwayFilled = awaySlots.filter(s => s.status === 'TAKEN').length === awaySlots.length;
    const allAwayPaid = awaySlots.every(s => s.status !== 'TAKEN' || s.player?.paymentStatus === 'PAID');
    return (allHomeFilled && allHomePaid && allAwayFilled && allAwayPaid) ? 'LIVE' : 'ACTIVE';
  }
  
  return (allHomeFilled && allHomePaid) ? 'LIVE' : 'ACTIVE';
};

// Kanonik koordinat atayıcı artık shared/lobbyEnrichment'tan gelir (admin ile tek kaynak).

// ─── Difficulty Badge Renk Sistemi ─────────────────────────────────────────

const difficultyConfig: Record<string, { color: string; glow: string; label: string }> = {
  'Ciddi':     { color: '#FF3B3B', glow: 'rgba(255,59,59,0.4)',   label: 'CİDDİ'      },
  'Taktiksel': { color: '#FACC15', glow: 'rgba(250,204,21,0.4)',   label: 'TAKTİKSEL'  },
  'Rahat':     { color: '#39FF14', glow: 'rgba(57,255,20,0.4)',   label: 'RAHAT'      },
};

const getQualityGrade = (score: number): string => {
  if (score >= 95) return 'A+';
  if (score >= 90) return 'A';
  if (score >= 85) return 'A-';
  if (score >= 80) return 'B+';
  if (score >= 75) return 'B';
  if (score >= 70) return 'B-';
  return 'C';
};

const getGradeColorClass = (grade: string): string => {
  if (grade.startsWith('A')) return 'text-[#39FF14] drop-shadow-[0_0_8px_rgba(57,255,20,0.4)]';
  if (grade.startsWith('B')) return 'text-[#FACC15] drop-shadow-[0_0_8px_rgba(250,204,21,0.4)]';
  return 'text-orange-400';
};

// İsim baş harfleri: "Ahmet Yılmaz" → "AY", tek kelime → ilk iki harf. Türkçe-doğru büyütme.
const getInitials = (name?: string): string => {
  const clean = (name || '').trim();
  if (!clean) return '?';
  const parts = clean.split(/\s+/).filter(Boolean);
  const raw = parts.length >= 2
    ? parts[0][0] + parts[parts.length - 1][0]
    : clean.slice(0, 2);
  return raw.toLocaleUpperCase('tr-TR');
};

// "Gerçek foto" mu? ui-avatars.com / pravatar dış üreteçleri gerçek foto sayılmaz →
// sahada dış fetch yerine yerel baş harf gösterilir (kullanıcının niyeti).
const isRealPhoto = (url?: string): boolean =>
  !!url && !/ui-avatars\.com|pravatar\.cc/i.test(url);

// Kaleci/hakem REYTİNGLERİ — admin panelindeki yetenek sliderlarının TAM listesi
// (DeepEditModals: KALECİ/HAKEM YETENEK KONTROLLERİ). Değerler 10–99 ölçeğinde.
const GK_RATING_KEYS: [string, string][] = [
  ['reflexes', 'REFLEKSLER'], ['diving', 'DALIŞ'], ['positioning', 'POZİSYON'],
  ['distribution', 'DAĞITIM'], ['oneOnOne', 'BİRE BİR'], ['aerialReach', 'HAVA HÂKİMİYETİ'],
];
const REF_RATING_KEYS: [string, string][] = [
  ['authority', 'OTORİTE'], ['fitness', 'KONDİSYON'], ['communication', 'İLETİŞİM'],
];
// Sağlayıcının skills/stats jsonb'undan admin reyting anahtarlarını sırayla çıkarır.
// (Kaleci panelde hem stats hem skills'e yazar; hakemde yalnız stats.)
const extractProviderRatings = (
  skills?: Record<string, any> | null,
  stats?: Record<string, any> | null,
  isRef?: boolean,
): { label: string; value: number }[] => {
  const src: Record<string, any> = { ...(stats || {}), ...(skills || {}) };
  const keys = isRef ? REF_RATING_KEYS : GK_RATING_KEYS;
  return keys
    .map(([k, label]) => ({ label, value: Number(src[k]) }))
    .filter(r => Number.isFinite(r.value));
};

// DOLU (TAKEN) slotları tarafın GERÇEK katılımcılarıyla (public_profiles) doldurur.
// Slot'ta zaten kimlikli oyuncu varsa korunur (ad/avatar public_profiles'tan tazelenir);
// oyuncusuz (seed) TAKEN slotlar, sahada olmayan katılımcılarla sırayla eşlenir.
const enrichSideSlots = (
  slots: PositionSlot[],
  sideParticipants: LobbyParticipant[],
  defaultPay: 'PAID' | 'UNPAID',
): PositionSlot[] => {
  const canonical = applyCanonicalCoords(slots || []);
  const byId = new Map(sideParticipants.map(p => [p.userId, p]));
  const onField = new Set(
    canonical.filter(s => s && s.status === 'TAKEN' && s.player?.id).map(s => s.player!.id)
  );
  const queue = sideParticipants.filter(p => !onField.has(p.userId));
  let qi = 0;
  return canonical.map(slot => {
    if (!slot || slot.status !== 'TAKEN') return slot;
    let src: { id: string; name: string; avatar: string; rating: number } | null = null;
    const orig: any = slot.player;
    if (orig?.id) {
      const prof = byId.get(orig.id);
      src = {
        id: orig.id,
        name: prof?.name || orig.name || 'Oyuncu',
        avatar: (prof ? prof.avatarUrl : orig.avatar) || '',
        rating: prof?.rating || orig.rating || 4.5,
      };
    } else if (orig?.name) {
      src = { id: orig.id || '', name: orig.name, avatar: orig.avatar || '', rating: orig.rating || 4.5 };
    } else {
      const part = queue[qi++];
      if (part) src = { id: part.userId, name: part.name, avatar: part.avatarUrl || '', rating: part.rating };
    }
    if (!src) return slot; // katılımcı yoksa olduğu gibi bırak
    return {
      ...slot,
      player: {
        id: src.id,
        name: src.name || 'Oyuncu',
        avatar: src.avatar || '',
        rating: src.rating || 4.5,
        position: slot.role || 'OYUNCU',
        x: slot.x,
        y: slot.y,
        paymentStatus: orig?.paymentStatus || defaultPay,
      } as Player,
    };
  });
};


const generateDefaultSlots = (size: string, prefixId: string): PositionSlot[] => {
  const formationsForSize = FORMATIONS[size];
  if (!formationsForSize) return [];
  const firstFormation = Object.values(formationsForSize)[0];
  if (!firstFormation) return [];
  
  return firstFormation.map((coord, idx) => ({
    id: `${prefixId}_slot_${idx}`,
    role: coord.role,
    x: coord.x,
    y: coord.y,
    status: 'OPEN'
  }));
};

// ─── Ana Bileşen ─────────────────────────────────────────────────────────────

const MatchJoin: React.FC<MatchJoinProps> = ({ match: originalMatch, onBack, onJoin }) => {
  const match = useMemo(() => {
    if (!originalMatch) return null as any;
    const badgeFormat = originalMatch.badges?.find(b => /^\d+v\d+$/i.test(b.trim()))?.toLowerCase();
    const slotCountFormat = originalMatch.slots?.length > 0 ? inferSquadSize(originalMatch.slots.length) : null;
    const fmt = originalMatch.format || badgeFormat || slotCountFormat || '7v7';
    const homeSlots = originalMatch.slots?.length > 0
      ? originalMatch.slots
      : generateDefaultSlots(fmt, (originalMatch.id || 'match') + '_home');
    const awaySlots = originalMatch.awaySlots?.length > 0
      ? originalMatch.awaySlots
      : generateDefaultSlots(inferSquadSize(homeSlots.length), (originalMatch.id || 'match') + '_away');
    return { ...originalMatch, slots: homeSlots, awaySlots };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [originalMatch?.id, originalMatch?.slots, originalMatch?.awaySlots, originalMatch?.format]);

  // ── State ────────────────────────────────────────────────────────────────
  const [selectedSlotId, setSelectedSlotId] = useState<string | null>(null);
  // Oyuncu çoklu-slot satın alma seçimi (kontenjana kadar). Ödeme = adet × ücret.
  const [selectedSlotIds, setSelectedSlotIds] = useState<string[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [showInfoModal, setShowInfoModal] = useState(false);

  // Aksiyon hatası/başarı toast'ı
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const showActionError = (msg: string) => {
    setActionError(msg);
    setTimeout(() => setActionError(null), 4000);
  };
  const showActionSuccess = (msg: string) => {
    setActionSuccess(msg);
    setTimeout(() => setActionSuccess(null), 4000);
  };

  // Taktik Kenarı — saha tarafı + ilk açılışta otomatik taraf seçimi (bir kez)
  const [scoreEntry, setScoreEntry] = useState({ home: 0, away: 0 });
  const [pitchSide, setPitchSide] = useState<'home' | 'away'>('home');
  const [hasAutoSelectedSide, setHasAutoSelectedSide] = useState(false);
  // Sahadaki dolu slotları gerçek oyuncularla doldurmak için (RLS-güvenli public_profiles).
  const [lobbyParticipants, setLobbyParticipants] = useState<LobbyParticipant[]>([]);

  // Dolu slota basınca açılan sade oyuncu bilgi kartı
  const [activePlayerSlotId, setActivePlayerSlotId] = useState<string | null>(null);
  // Sade oyuncu kartı verisi (arkadaş-kapılı; tıklamada get_friend_player_card ile çekilir)
  const [playerCard, setPlayerCard] = useState<FriendPlayerCard | null>(null);
  const [playerCardLoading, setPlayerCardLoading] = useState(false);
  const [friendRequestSent, setFriendRequestSent] = useState(false);

  const [inviteModalSlotId, setInviteModalSlotId] = useState<string | null>(null);
  const [friendSearch, setFriendSearch] = useState('');
  const [invitesSent, setInvitesSent] = useState<Record<string, SlotInviteStatus>>({}); // slot
  const [invitedFriendNames, setInvitedFriendNames] = useState<Record<string, string>>({});
  const [resolvedHomeTeam, setResolvedHomeTeam] = useState<Team | null>(null);
  const [resolvedAwayTeam, setResolvedAwayTeam] = useState<Team | null>(null);
  const [removeConfirmSlot, setRemoveConfirmSlot] = useState<PositionSlot | null>(null);
  const [openSlotActionSlot, setOpenSlotActionSlot] = useState<PositionSlot | null>(null);

  // Arkadaş daveti kategorisi
  const [inviteCategory, setInviteCategory] = useState('Tümü');

  // Maçtan Ayrıl
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false);
  // B4: Kaptanın maçı iptali (yalnız MANAGE lobisinde görünür)
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);

  // (Rakip davet/katıl modalları kaldırıldı — lobi sadeleştirmesi)

  // ── FAZ 5: Kaleci / Hakem Talep Akışı ────────────────────────────────────
  const [providerModalType, setProviderModalType] = useState<ProviderType | null>(null);
  const [providerSuggestions, setProviderSuggestions] = useState<ProviderSuggestion[]>([]);
  const [providersLoading, setProvidersLoading] = useState(false);
  const [providerSubmittingId, setProviderSubmittingId] = useState<string | null>(null);
  const [serviceRequests, setServiceRequests] = useState<ServiceRequest[]>([]);
  // FAZ 3: pazarda seçilen sağlayıcının dikey detaylı kartı (yetenek barları + istatistik)
  const [marketDetailProvider, setMarketDetailProvider] = useState<ProviderSuggestion | null>(null);

  // FAZ 2: maça ATANMIŞ kaleci/hakem — lobide HERKESE (salt-okunur) gösterilir.
  const [assignedGoalkeeper, setAssignedGoalkeeper] = useState<MatchProvider | null>(null);
  const [assignedReferee, setAssignedReferee] = useState<MatchProvider | null>(null);
  // Atanmış kaleci/hakem dikey detay kartı (herkese) — hangi sağlayıcı + tür.
  const [providerDetail, setProviderDetail] = useState<{ p: MatchProvider; isRef: boolean } | null>(null);
  const [showNoShowConfirm, setShowNoShowConfirm] = useState(false);

  const [showMapModal, setShowMapModal] = useState(false);
  const [pitchCoordinates, setPitchCoordinates] = useState<[number, number] | null>(null);

  // ── Store ─────────────────────────────────────────────────────────────────
  const {
    adminUsers, friends, updateMatch, applyMatchLocal, addUserNotification, adminPitches,
    userTeams, myTeams, setSelectedMatch,
    setNewMatchBadge, lobbyMode, currentUserProfile: storeCurrentUserProfile
  } = useAppStore();
  // MANAGE = Sıradaki Maçlarım'dan; yönetim aksiyonları yalnız burada görünür.
  const isManageMode = lobbyMode === 'MANAGE';

  // Saha konumu: pitch_id (FK) tek otorite; store'daki isim eşleşmesi varsayılan
  // koordinat bastığı için kullanılmaz. Çözülemezse null kalır → harita gizlenir.
  useEffect(() => {
    let alive = true;
    const pid = (match as { pitchId?: string } | undefined)?.pitchId;
    if (!pid && !match?.location) { setPitchCoordinates(null); return; }
    getPitchCoordinates(pid, match?.location).then((coords) => {
      if (alive) setPitchCoordinates(coords);
    });
    return () => { alive = false; };
  }, [(match as { pitchId?: string } | undefined)?.pitchId, match?.location]);

  // ── İlk hidrasyon: DB'deki yetkili satırı çek (private_code dahil) ──────
  useEffect(() => {
    if (!originalMatch?.id) return;
    let alive = true;
    getMatchDetails(originalMatch.id).then((full) => {
      // KN-3: hidrasyon SALT-OKUR — DB'den okunan veri DB'ye GERİ yazılmaz
      // (eski updateMatch her lobi açılışında gereksiz tam yazım yapıyordu).
      if (alive && full) applyMatchLocal({ ...originalMatch, ...full } as MatchListing);
    }).catch(() => { /* sessiz: prop verisiyle devam */ });
    return () => { alive = false; };
  }, [originalMatch?.id]);

  // ── Supabase Realtime: Lobideki değişiklikleri canlı dinle ──────────────
  useEffect(() => {
    if (!originalMatch?.id) return;
    const unsubscribe = subscribeToMatchUpdates(originalMatch.id, (updatedMatch) => {
      // Supabase'den gelen snake_case verileri MatchListing formatına dönüştür
      const mapped: Partial<MatchListing> = {
        ...updatedMatch,
        slots: (updatedMatch as any).slots || [],
        awaySlots: (updatedMatch as any).away_slots || (updatedMatch as any).awaySlots || [],
        homeTeamId: (updatedMatch as any).home_team_id || (updatedMatch as any).homeTeamId,
        awayTeamId: (updatedMatch as any).away_team_id || (updatedMatch as any).awayTeamId,
        creatorId: (updatedMatch as any).creator_id || (updatedMatch as any).creatorId,
        reservePlayers: (updatedMatch as any).reserve_players || (updatedMatch as any).reservePlayers || [],
        minRating: (updatedMatch as any).min_rating || (updatedMatch as any).minRating,
        homeScore: (updatedMatch as any).home_score || (updatedMatch as any).homeScore,
        awayScore: (updatedMatch as any).away_score || (updatedMatch as any).awayScore,
        scoreEnteredAt: (updatedMatch as any).score_entered_at || (updatedMatch as any).scoreEnteredAt,
        // FAZ 3 çekirdeği — realtime'da da koru
        visibility: (updatedMatch as any).visibility || (originalMatch as any).visibility || 'OPEN',
        privateCode: (updatedMatch as any).private_code || (updatedMatch as any).privateCode || (originalMatch as any).privateCode,
        pitchId: (updatedMatch as any).pitch_id || (updatedMatch as any).pitchId || (originalMatch as any).pitchId,
      };
      // KN-3a: realtime SALT-OKUR — gelen veri DB'ye GERİ YAZILMAZ.
      // (Eski updateMatch çağrısı her tick'te player_update_match tetikleyip
      // yankı döngüsü + eşzamanlı katılımcıları ezme üretiyordu.)
      applyMatchLocal({ ...originalMatch, ...mapped } as MatchListing);
    });
    return () => { unsubscribe(); };
  }, [originalMatch?.id]);

  // ── FAZ 5: Maçın kaleci/hakem hizmet taleplerini yükle ──────────────────
  const refreshServiceRequests = async (matchId: string) => {
    try {
      const reqs = await getMatchServiceRequests(matchId);
      setServiceRequests(reqs);
    } catch (err) {
      console.warn('[MatchJoin] hizmet talepleri yüklenemedi:', err);
    }
  };

  useEffect(() => {
    if (!originalMatch?.id) return;
    refreshServiceRequests(originalMatch.id);
  }, [originalMatch?.id]);

  // ── FAZ 2: Maça atanmış kaleci/hakem (HERKESE görünür, salt-okunur) ────────
  const assignedGkId = (match as any)?.gkId || (match as any)?.gk_id || null;
  const assignedRefId = (match as any)?.refereeId || (match as any)?.ref_id || null;
  useEffect(() => {
    if (!assignedGkId && !assignedRefId) {
      setAssignedGoalkeeper(null);
      setAssignedReferee(null);
      return;
    }
    let alive = true;
    getMatchProviders(assignedGkId, assignedRefId)
      .then(({ goalkeeper, referee }) => {
        if (!alive) return;
        setAssignedGoalkeeper(goalkeeper);
        setAssignedReferee(referee);
      })
      .catch(() => {});
    return () => { alive = false; };
  }, [assignedGkId, assignedRefId]);

  // ── Sahadaki dolu slotları gerçek oyuncularla doldur (public_profiles) ────
  // TAKEN sayısı değişince (katılım/ayrılma, realtime dahil) yeniden çekilir.
  const takenSignature =
    ((match?.slots as PositionSlot[] | undefined) || []).filter(s => s?.status === 'TAKEN').length + ':' +
    ((match?.awaySlots as PositionSlot[] | undefined) || []).filter(s => s?.status === 'TAKEN').length;
  useEffect(() => {
    if (!originalMatch?.id) return;
    let alive = true;
    getMatchLobbyParticipants(originalMatch.id, match?.homeTeamId, match?.awayTeamId)
      .then(list => { if (alive) setLobbyParticipants(list); })
      .catch(() => {});
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [originalMatch?.id, takenSignature, match?.homeTeamId, match?.awayTeamId]);

  // ── İlk açılışta oyuncu sayısı az olan tarafı otomatik göster ─────────────
  // Eşitlik/0 → ev sahibi. hasAutoSelectedSide ile yalnız bir kez tetiklenir;
  // kullanıcı üst butonlarla değiştirince kilitlenir (manuel seçim korunur).
  useEffect(() => {
    if (hasAutoSelectedSide || !match) return;
    const takenHome = (match.slots || []).filter(s => s?.status === 'TAKEN').length;
    const takenAway = (match.awaySlots || []).filter(s => s?.status === 'TAKEN').length;
    if (takenHome === 0 && takenAway === 0) return; // veri gelene kadar bekle
    setPitchSide(takenAway < takenHome ? 'away' : 'home');
    setHasAutoSelectedSide(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [match?.slots, match?.awaySlots, hasAutoSelectedSide]);

  if (!match) return null;

  // Saha ve Detaylı Filtre Bilgilerini Çekme
  const matchPitch = (adminPitches || []).find(p =>
    p?.name && match.location &&
    (match.location.toLowerCase().includes(p.name.toLowerCase()) ||
     p.name.toLowerCase().includes(match.location.toLowerCase()))
  );

  const fallbackPitch = {
    name: match.location || 'Oyna Arena',
    rating: 4.5,
    googleRating: 4.4,
    googleReviews: 120,
    grassGrade: 'A' as const,
    lightingGrade: 'A' as const,
    lockerRoomGrade: 'B' as const,
    amenities: ['Duş', 'Otopark', 'Soyunma Odası', 'Su'],
    image: 'https://images.unsplash.com/photo-1529900748604-07564a03e7a6?auto=format&fit=crop&q=80&w=1000'
  };

  const activePitch = matchPitch || fallbackPitch;

  // Dinamik kurallar ve filtreler
  const ageLimit = match.badges?.find(b => b.includes('Yaş') || b.includes('Yaş Grubu'))
    || (match.difficulty === 'Ciddi' ? '20-35 Yaş' : 'Limit Yok (18+)');

  const genderRule = match.badges?.find(b => b === 'Erkek' || b === 'Kadın' || b === 'Karma')
    || 'Karma Katılım';

  // Home & Away Teams derived from store
  const homeTeam = match.homeTeamId ? (userTeams || []).find(t => t.id === match.homeTeamId) : null;
  const awayTeam = match.awayTeamId ? (userTeams || []).find(t => t.id === match.awayTeamId) : null;

  // ── Kullanıcı ─────────────────────────────────────────────────────────────
  // Misafirde gerçek kimlik yok: görüntüleme 'Misafir' etiketiyle yapılır;
  // katılma aksiyonu store.joinMatch içindeki kayıt kapısına takılır.
  const currentUserUid = auth.currentUser?.uid ?? 'guest';
  // Gerçek profil (store) önce; admin-only adminUsers yalnız admin oturumunda dolu.
  const currentUserProfile = storeCurrentUserProfile
    || (adminUsers || []).find(u => u?.id === currentUserUid)
    || { id: currentUserUid, name: auth.currentUser ? (auth.currentUser.displayName || 'Oyuncu') : 'Misafir', avatar: auth.currentUser?.photoURL || '/player_card_photo.png', role: UserRole.PLAYER, rating: 0 };

  // Kaptanlık global rol değil; maçı kuran kişi o maçın yöneticisidir.
  const isCaptain = match.creatorId === currentUserProfile?.id;

  const isHomeCaptain = match.creatorId === currentUserProfile.id || homeTeam?.captain === currentUserProfile.id || homeTeam?.captains?.includes(currentUserProfile.id);
  const isAwayCaptain = !!awayTeam && (awayTeam.captain === currentUserProfile.id || awayTeam.captains?.includes(currentUserProfile.id));

  // ── Sahadaki dolu slotları GERÇEK katılımcılarla zenginleştir ─────────────
  // Kaynak: match_participants ⋈ public_profiles (RLS-güvenli). Eski `adminUsers`
  // (hiç yüklenmeyen) index-hack'inin yerine gerçek oyuncu ad/avatarı gelir.
  const homeParticipants = lobbyParticipants.filter(p => p.side === 'home');
  const awayParticipants = lobbyParticipants.filter(p => p.side === 'away');
  const enrichedSlots = enrichSideSlots(match.slots || [], homeParticipants, 'UNPAID');
  const enrichedAwaySlots = enrichSideSlots(match.awaySlots || [], awayParticipants, 'PAID');

  // ── Derived State ─────────────────────────────────────────────────────────
  const isAlreadyJoinedHome = (match.slots || []).some(
    s => s?.player?.id === currentUserProfile?.id
  );
  const isAlreadyJoinedAway = (match.awaySlots || []).some(
    s => s?.player?.id === currentUserProfile?.id
  );
  const isAlreadyJoined = isAlreadyJoinedHome || isAlreadyJoinedAway;

  const isAlreadyJoinedReserve = (match.reservePlayers || []).some(
    p => p?.id === currentUserProfile?.id
  );

  const mySlot = isAlreadyJoined
    ? [...enrichedSlots, ...enrichedAwaySlots].find(s => s?.player?.id === currentUserProfile?.id)
    : null;

  const assignedIds = (match.slots || []).filter(s => s?.player).map(s => s.player!.id);
  const filteredFriends = (friends || []).filter(f => {
    if (!f || !f.id || !f.name) return false;
    if (assignedIds.includes(f.id)) return false;
    if (friendSearch && !f.name.toLowerCase().includes(friendSearch.toLowerCase())) return false;
    if (inviteCategory !== 'Tümü') {
      if (inviteCategory === 'Favorilerim') {
        if (!(f as any).isFavorite) return false;
      } else {
        if (f.group !== inviteCategory) return false;
      }
    }
    return true;
  });
  const onlineFriends = filteredFriends.filter(f => (f as any).online);
  const offlineFriends = filteredFriends.filter(f => !(f as any).online);

  const diffConf = difficultyConfig[match.difficulty] || difficultyConfig['Rahat'];
  const squadSize = inferSquadSize((match.slots || []).length);
  const totalSlots = (match.slots || []).length;
  const takenSlots = (match.slots || []).filter(s => s?.status === 'TAKEN').length;

  // ── Handlers ──────────────────────────────────────────────────────────────

  const handleSlotClick = (slot: any) => {
    if (!slot) return;

    if (slot.status === 'TAKEN') {
      setActivePlayerSlotId(slot.id);
      setFriendRequestSent(false);
      setPlayerCard(null);
      const pid = slot.player?.id;
      if (pid) {
        setPlayerCardLoading(true);
        getFriendPlayerCard(pid)
          .then((c) => setPlayerCard(c))
          .finally(() => setPlayerCardLoading(false));
      }
      return;
    }

    if (slot.status === 'OPEN') {
      if (isCaptain) {
        // Kaptan akışı korunur (tekli seçim + mevcut davet/modal).
        if (isAlreadyJoined) {
          setInviteModalSlotId(slot.id);
          setFriendSearch('');
          return;
        }
        setSelectedSlotId(slot.id);
        setOpenSlotActionSlot(slot);
        return;
      }
      // Oyuncu: çoklu slot seçimi (kontenjana kadar). Ödeme butonunda toplam görünür.
      setSelectedSlotIds((prev) =>
        prev.includes(slot.id) ? prev.filter((id) => id !== slot.id) : [...prev, slot.id]
      );
    }
  };

  const handleJoin = async () => {
    if (!selectedSlotId || isAlreadyJoined) return;
    setIsProcessing(true);
    
    const isAway = (match.awaySlots || []).some(s => s?.id === selectedSlotId);
    const slotsSource = isAway ? (match.awaySlots || []) : (match.slots || []);
    const targetSlot = slotsSource.find(s => s?.id === selectedSlotId);
    if (!targetSlot) { setIsProcessing(false); return; }

    try {
      // Call Supabase RPC for safe concurrency-locked join
      const { error } = await supabase.rpc('join_public_match_slot', {
        p_match_id: match.id,
        p_slot_id: selectedSlotId,
        p_user_id: currentUserProfile.id,
        p_is_away: isAway
      });

      if (error) throw error;

      // Escrow: eşik (toplam−2) dolduysa maçı LIVE yap + kaporayı capture et (best-effort).
      try { await checkMatchThreshold(match.id); } catch { /* eşik kontrolü kritik değil */ }

      // KN-3b: bayat tam-dizi yazımı YOK. Sunucu (RPC) tek otorite; taze durumu
      // çekip YEREL uygula — eşzamanlı katılımcılar birbirini ezemez, LIVE
      // geçişi de (threshold sonrası) anında yansır.
      const fresh = await getMatchDetails(match.id);
      if (fresh) applyMatchLocal(fresh);

      setSelectedSlotId(null);
      setNewMatchBadge(true);
    } catch (e: any) {
      console.error('Join error:', e);
      showActionError((e?.message || '').includes('MIN_RATING')
        ? `Bu maç minimum ${match.minRating} puan istiyor — puanın henüz yetmiyor.`
        : 'Maça katılırken bir hata oluştu. Lütfen tekrar dene.');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleBuySlots = async () => {
    if (selectedSlotIds.length === 0 || isProcessing) return;
    const total = (match.price || 0) * selectedSlotIds.length;

    // Ücretli slot → birleşik ödeme ekranı (bakiye + kart bölüşümü, tasarım 1b).
    if (total > 0) {
      const store = useAppStore.getState();
      store.setPaymentContext({
        kind: 'MATCH_JOIN',
        badge: `MAÇA KATILIM · ${selectedSlotIds.length} SLOT`,
        title: match.title || 'Maç',
        subtitle: `${match.location || ''}${match.time ? ` · ${match.time}` : ''}`,
        details: [
          ...(match.location ? [{ icon: 'pin' as const, text: match.location }] : []),
          ...(match.date ? [{ icon: 'calendar' as const, text: match.date }] : []),
          ...(match.time ? [{ icon: 'clock' as const, text: match.time }] : []),
        ],
        amount: total,
        amountLabel: 'Ödenecek Tutar',
        amountHint: `${selectedSlotIds.length} slot × ${(match.price || 0).toLocaleString('tr-TR')}₺ · rezerve ettiğin yerler`,
        isDeposit: false,
        allowBalance: true,
        successTitle: 'Katılımın Onaylandı!',
        successSubtitle: 'Yerin garanti',
        matchId: match.id,
        slotIds: [...selectedSlotIds],
      });
      setSelectedSlotIds([]);
      setSelectedSlotId(null);
      store.navigateTo('PAYMENT');
      return;
    }

    // Ücretsiz maç: eski hızlı yol (ödeme ekranı gerekmez).
    setIsProcessing(true);
    try {
      const { error } = await supabase.rpc('player_buy_slots', {
        p_match_id: match.id,
        p_slot_ids: selectedSlotIds,
      });
      if (error) throw error;

      // Escrow: eşik (toplam−2) dolduysa maçı LIVE yap + kaporayı capture et (best-effort).
      try { await checkMatchThreshold(match.id); } catch { /* eşik kontrolü kritik değil */ }

      // KN-3b: taze durumu çek, YEREL uygula (DB'ye geri yazma — eski kod
      // fresh'i updateMatch ile geri yazıyordu: gereksiz yazım + yarış).
      const fresh = await getMatchDetails(match.id);
      if (fresh) applyMatchLocal(fresh);

      setSelectedSlotIds([]);
      setSelectedSlotId(null);
      setNewMatchBadge(true);
    } catch (e: any) {
      console.error('Buy slots error:', e);
      const msg = e?.message || '';
      showActionError(msg.includes('MIN_RATING')
        ? `Bu maç minimum ${match.minRating} puan istiyor — puanın henüz yetmiyor.`
        : msg.includes('Yetersiz') ? 'Cüzdan bakiyen yetersiz.' : 'Slot satın alınamadı. Lütfen tekrar dene.');
    } finally {
      setIsProcessing(false);
    }
  };

  const fillVacatedSlot = (
    slots: PositionSlot[],
    reserves: Player[],
    vacatedSlotId: string
  ): { updatedSlots: PositionSlot[]; remainingReserves: Player[]; promotedPlayer?: Player } => {
    let promotedPlayer: Player | undefined = undefined;
    let remainingReserves = [...reserves];

    const updatedSlots = slots.map(s => {
      if (s.id === vacatedSlotId) {
        if (remainingReserves.length > 0) {
          const rawPlayer = remainingReserves.shift()!;
          promotedPlayer = {
            ...rawPlayer,
            position: s.role || 'OYUNCU',
            x: s.x,
            y: s.y,
            paymentStatus: 'UNPAID',
          };
          return {
            ...s,
            status: 'TAKEN' as const,
            player: promotedPlayer,
          };
        } else {
          const newSlot = { ...s, status: 'OPEN' as const };
          delete newSlot.player;
          return newSlot;
        }
      }
      return s;
    });

    return { updatedSlots, remainingReserves, promotedPlayer };
  };

  const handleJoinAsReserve = async () => {
    if (isAlreadyJoined || isAlreadyJoinedReserve) return;
    setIsProcessing(true);

    try {
      const { error } = await supabase.rpc('join_public_match_reserve', {
        p_match_id: match.id,
        p_user_id: currentUserProfile.id
      });

      if (error) throw error;

      // KN-3b: yedek listesi sunucuda güncellendi; taze çek, yerel uygula.
      const fresh = await getMatchDetails(match.id);
      if (fresh) applyMatchLocal(fresh);
    } catch (e: any) {
      console.error('Join reserve error:', e);
      showActionError((e?.message || '').includes('MIN_RATING')
        ? `Bu maç minimum ${match.minRating} puan istiyor — puanın henüz yetmiyor.`
        : 'Yedek olarak katılırken bir hata oluştu.');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleLeaveReserves = async () => {
    if (!isAlreadyJoinedReserve) return;
    setIsProcessing(true);

    try {
      const { error } = await supabase.rpc('leave_public_match_slot', {
        p_match_id: match.id,
        p_user_id: currentUserProfile.id
      });

      if (error) throw error;

      // KN-3b: sunucu çıkardı; taze çek, yerel uygula.
      const fresh = await getMatchDetails(match.id);
      if (fresh) applyMatchLocal(fresh);
      setShowLeaveConfirm(false);
    } catch (e: any) {
      console.error('Leave reserves error:', e);
      showActionError('Yedek listesinden çıkarken bir hata oluştu.');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleInviteFriend = async (friend: any) => {
    if (!inviteModalSlotId || !friend) return;
    const slotId = inviteModalSlotId;
    setInvitesSent(prev => ({ ...prev, [slotId]: 'INVITED' }));
    setInvitedFriendNames(prev => ({ ...prev, [slotId]: friend.name || 'Arkadaş' }));

    // Satın aldığım slotu arkadaşa atıyorsam → gerçek RPC (davet + slot INVITED).
    const ownedSlot = (match.slots || []).find(s => s?.id === slotId && (s as any).purchasedBy === currentUserProfile.id);
    if (ownedSlot) {
      try {
        const { error } = await supabase.rpc('player_assign_slot', {
          p_match_id: match.id, p_slot_id: slotId, p_friend_id: friend.id,
        });
        if (error) throw error;
        const fresh = await getMatchDetails(match.id);
        if (fresh) applyMatchLocal(fresh); // KN-3b
        showActionSuccess(`${friend.name || 'Arkadaşın'} bu slota davet edildi.`);
      } catch (e: any) {
        console.error('assign slot error', e);
        showActionError('Atama yapılamadı. Lütfen tekrar dene.');
      }
      setInviteModalSlotId(null);
      setFriendSearch('');
      return;
    }

    // (Kaptan/diğer akış) yerel davet bildirimi
    const isAway = (match.awaySlots || []).some(s => s?.id === slotId);
    addUserNotification({
      id: `inv_${slotId}_${Date.now()}`,
      type: 'invite',
      title: isAway ? '⚔️ Rakip Daveti' : '⚽ Maç Daveti',
      desc: isAway
        ? `${currentUserProfile.name} sizi "${match.title || 'bir maça'}" karşı takımda oynamaya (rakip olarak) davet etti!`
        : `${currentUserProfile.name} sizi "${match.title || 'bir maça'}" davet etti!`,
      time: 'Az önce',
      iconName: 'Trophy',
      color: '#FACC15',
      textColor: '#FACC15',
      payload: { matchId: match.id, slotId },
      read: false,
    });
    setInviteModalSlotId(null);
    setFriendSearch('');
  };

  // Satın alınan slot için paylaşılabilir devralma kodu üret
  const handleMakeSlotCode = async (slotId: string) => {
    try {
      const { data, error } = await supabase.rpc('player_make_slot_code', { p_match_id: match.id, p_slot_id: slotId });
      if (error) throw error;
      const fresh = await getMatchDetails(match.id);
      if (fresh) applyMatchLocal(fresh); // KN-3b: taze veri DB'ye GERİ yazılmaz
      showActionSuccess(`Devralma kodu: ${data} — arkadaşına gönder.`);
    } catch (e: any) {
      console.error('make slot code error', e);
      showActionError('Kod oluşturulamadı.');
    }
  };

  // Davet edilen arkadaş slotu kabul eder → slotta arkadaş görünür
  const handleAcceptSlot = async (slotId: string) => {
    if (isProcessing) return;
    setIsProcessing(true);
    try {
      const { error } = await supabase.rpc('player_accept_slot', { p_match_id: match.id, p_slot_id: slotId });
      if (error) throw error;
      const fresh = await getMatchDetails(match.id);
      if (fresh) applyMatchLocal(fresh); // KN-3b: taze veri DB'ye GERİ yazılmaz
      setActivePlayerSlotId(null);
      showActionSuccess('Slotu kabul ettin — kadrodasın! ⚽');
    } catch (e: any) {
      console.error('accept slot error', e);
      showActionError('Kabul edilemedi. Lütfen tekrar dene.');
    } finally {
      setIsProcessing(false);
    }
  };



  // Kaptan bir oyuncuyu kadrodan çıkarır. Özel bir kick RPC'si YOK; bu nedenle
  // KN-3b asgari güvenliği uygulanır: önce SUNUCUDAN taze durum çekilir,
  // değişiklik taze veri üstüne uygulanır, öyle yazılır (bayat-dizi penceresi
  // daralır). Kalıcı çözüm (dar player_kick_slot RPC'si) S3 backlog'da.
  const handleRemovePlayer = async (slotId: string) => {
    try {
      const base = (await getMatchDetails(match.id)) ?? match;
      const isHomeSlot = (base.slots || []).some(s => s?.id === slotId);
      const reserves = base.reservePlayers || [];

      const src = isHomeSlot ? (base.slots || []) : (base.awaySlots || []);
      const { updatedSlots, remainingReserves } = fillVacatedSlot(src, reserves, slotId);
      const nextStatus = isHomeSlot
        ? checkAndGetStatus(updatedSlots, base.awaySlots)
        : checkAndGetStatus(base.slots || [], updatedSlots);

      await updateMatch({
        ...base,
        ...(isHomeSlot ? { slots: updatedSlots } : { awaySlots: updatedSlots }),
        reservePlayers: remainingReserves,
        status: nextStatus,
      });
      setActivePlayerSlotId(null);
    } catch (e) {
      console.error(e);
      showActionError('Oyuncu kadrodan çıkarılamadı. Lütfen tekrar dene.');
    }
  };

  const handleLeaveMatch = async () => {
    if (!isAlreadyJoined || !currentUserProfile?.id) return;
    setIsProcessing(true);

    try {
      const { error } = await supabase.rpc('leave_public_match_slot', {
        p_match_id: match.id,
        p_user_id: currentUserProfile.id
      });

      if (error) throw error;

      // KN-3b (kritik silme): leave_public_match_slot SUNUCUDA zaten her şeyi
      // yapıyor — slotu boşaltma, ilk yedeği terfi ettirme, kaptan ayrılıyorsa
      // yeni kaptan atama (migration 20260717000003). Buradaki eski client
      // kopyası (fillVacatedSlot + reliabilityScore halef hesabı, hiç
      // yüklenmeyen adminUsers ile herkes=100) sunucunun DOĞRU sonucunu bayat
      // tam-dizi yazımıyla eziyordu. Taze çek, yerel uygula, çık.
      const fresh = await getMatchDetails(match.id);
      if (fresh) applyMatchLocal(fresh);

      setShowLeaveConfirm(false);
      onBack();
    } catch (e: any) {
      console.error('Leave match error:', e);
      showActionError('Maçtan ayrılırken bir hata oluştu.');
    } finally {
      setIsProcessing(false);
    }
  };

  // B4: Kurucu maçı iptal eder — sunucu 24s kuralını uygular
  // (≥24s: katılımcı ödemeleri iade / <24s: no-show politikası).
  const handleCancelMatch = async () => {
    if (isProcessing) return;
    setIsProcessing(true);
    try {
      const res = await cancelMatchByCaptain(match.id);
      const fresh = await getMatchDetails(match.id);
      if (fresh) applyMatchLocal(fresh);
      showActionSuccess(
        res?.outcome && String(res.outcome).toUpperCase().includes('REFUND')
          ? 'Maç iptal edildi — katılımcı ödemeleri iade edildi.'
          : 'Maç iptal edildi.'
      );
      setShowCancelConfirm(false);
      setTimeout(() => onBack(), 900);
    } catch (e: any) {
      console.error('Cancel match error:', e);
      showActionError((e?.message || '').includes('UNAUTHORIZED')
        ? 'Bu maçı yalnız kurucusu iptal edebilir.'
        : 'Maç iptal edilemedi. Lütfen tekrar dene.');
    } finally {
      setIsProcessing(false);
    }
  };

  // ── FAZ 5: Kaleci / Hakem Talep Handler'ları ────────────────────────────
  const ACTIVE_REQUEST_STATUSES: ServiceRequest['status'][] = ['PENDING', 'ACCEPTED', 'CAPTURED'];

  // Belirli tipte aktif (bekleyen/atanmış) talep var mı?
  const getActiveRequestForType = (type: ProviderType): ServiceRequest | undefined =>
    serviceRequests.find(r => r.providerType === type && ACTIVE_REQUEST_STATUSES.includes(r.status));

  // ── Sağlayıcı-başlatan başvurular (kaleci/hakem maça başvurdu → kaptan yönetir) ──
  const [reqActionId, setReqActionId] = useState<string | null>(null);
  const providerApplications = serviceRequests.filter(r => r.status === 'APPLIED' && r.initiatedBy === 'PROVIDER');
  const captainConfirmPending = serviceRequests.filter(
    r => r.status === 'CAPTURED' && r.initiatedBy === 'PROVIDER' && !r.captainConfirmed && !r.payoutReleased
  );

  const handleAcceptApplication = async (requestId: string) => {
    setReqActionId(requestId);
    try {
      await acceptProviderApplication(requestId);
      await refreshServiceRequests(match.id);
      showActionSuccess('Başvuru kabul edildi. Ücret bloke edildi.');
    } catch (err: any) {
      showActionError(err?.message || 'Başvuru kabul edilemedi.');
    } finally { setReqActionId(null); }
  };
  const handleDeclineApplication = async (requestId: string) => {
    setReqActionId(requestId);
    try {
      await declineProviderApplication(requestId);
      await refreshServiceRequests(match.id);
      showActionSuccess('Başvuru reddedildi.');
    } catch (err: any) {
      showActionError(err?.message || 'Başvuru reddedilemedi.');
    } finally { setReqActionId(null); }
  };
  const handleCaptainConfirm = async (requestId: string) => {
    setReqActionId(requestId);
    try {
      await captainConfirmService(requestId);
      await refreshServiceRequests(match.id);
      showActionSuccess('Onayladın. Sağlayıcı da onaylayınca ücret ödenir.');
    } catch (err: any) {
      showActionError(err?.message || 'Onay kaydedilemedi.');
    } finally { setReqActionId(null); }
  };

  const handleOpenProviderModal = async (type: ProviderType) => {
    // Aynı tipte aktif talep varsa ikinci talebe izin verme
    if (getActiveRequestForType(type)) {
      showActionError(
        type === 'GK'
          ? 'Bu maç için zaten bir kaleci talebi mevcut.'
          : 'Bu maç için zaten bir hakem talebi mevcut.'
      );
      return;
    }
    setProviderModalType(type);
    setProviderSuggestions([]);
    setProvidersLoading(true);
    try {
      const list = await findProvidersForMatch(match.id, type);
      setProviderSuggestions(list);
    } catch (err: any) {
      console.error('[MatchJoin] sağlayıcı önerileri:', err);
      showActionError(err?.message || 'Uygun sağlayıcılar getirilemedi.');
    } finally {
      setProvidersLoading(false);
    }
  };

  // FAZ 4: talep oluştur + hemen fonla (emanet). Kaleci ancak fonlanınca kabul edebilir.
  const handleSelectProvider = async (provider: ProviderSuggestion, source: 'WALLET' | 'CARD' = 'WALLET') => {
    if (!providerModalType) return;
    setProviderSubmittingId(provider.id);
    try {
      const { requestId } = await createServiceRequest(match.id, provider.id, providerModalType);
      await fundServiceRequest(requestId, source);
      await refreshServiceRequests(match.id);
      setMarketDetailProvider(null);
      setProviderModalType(null);
      showActionSuccess(`Ödeme alındı — ${provider.name} onayı bekleniyor`);
    } catch (err: any) {
      console.error('[MatchJoin] talep/ödeme:', err);
      showActionError(err?.message || 'Hizmet talebi oluşturulamadı.');
    } finally {
      setProviderSubmittingId(null);
    }
  };

  // FAZ 4: aktif (tahsil edilmiş) kaleci hizmeti → kaptan no-show bildirebilir.
  const capturedGkRequest = serviceRequests.find(r => r.providerType === 'GK' && r.status === 'CAPTURED');
  const handleReportNoShow = async () => {
    if (!capturedGkRequest) return;
    try {
      setIsProcessing(true);
      const r = await captainReportNoShow(capturedGkRequest.id);
      await refreshServiceRequests(match.id);
      setShowNoShowConfirm(false);
      showActionSuccess(
        r.penaltyCharged
          ? `No-show bildirildi. ${r.penalty}₺ ceza kalecinin teminatından tahsil edilip sana aktarıldı.`
          : `No-show bildirildi. Ceza (${r.penalty}₺) teminattan tahsil edilemedi — durum incelemeye alındı.`
      );
    } catch (e: any) {
      showActionError(e?.message || 'No-show bildirilemedi.');
    } finally {
      setIsProcessing(false);
    }
  };

  const activePlayerSlot = activePlayerSlotId ? (pitchSide === 'home' ? enrichedSlots : enrichedAwaySlots).find(s => s?.id === activePlayerSlotId) : null;
  const activePlayer = activePlayerSlot?.player || null;

  // ─── RENDER ─────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-[#0A0E14] flex flex-col relative overflow-hidden font-sans">

      {/* Ambiyans arka plan */}
      <div className="absolute top-0 left-[-15%] w-[500px] h-[500px] bg-[#39FF14]/4 blur-[140px] rounded-full pointer-events-none" />
      <div className="absolute bottom-0 right-[-10%] w-[400px] h-[400px] bg-[#00f2fe]/4 blur-[120px] rounded-full pointer-events-none" />
      <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/carbon-fibre.png')] opacity-[0.08] mix-blend-overlay pointer-events-none" />



      {/* ── Sade Oyuncu Bilgi Kartı (arkadaş-kapılı) ────────────────────────── */}
      <AnimatePresence>
        {activePlayer && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/85 backdrop-blur-2xl flex items-center justify-center p-6"
            onClick={() => setActivePlayerSlotId(null)}>
            <motion.div
              initial={{ scale: 0.8, y: 30, opacity: 0 }}
              animate={{ scale: 1, y: 0, opacity: 1 }}
              exit={{ scale: 0.8, y: 30, opacity: 0 }}
              transition={{ type: 'spring', damping: 24, stiffness: 300 }}
              onClick={e => e.stopPropagation()}
              className="relative w-[19rem] rounded-[28px] overflow-hidden bg-gradient-to-b from-[#161B22] to-[#0d1117] border border-white/10 shadow-[0_30px_70px_rgba(0,0,0,0.85)]">
              {(() => {
                const isHome = pitchSide === 'home';
                const accent = isHome ? '#39FF14' : '#f87171';
                const initialsCls = isHome
                  ? 'bg-emerald-950/60 text-emerald-300 border border-emerald-500/25'
                  : 'bg-red-950/60 text-red-300 border border-red-500/25';
                const isMySlot = activePlayer.id === currentUserProfile?.id;
                const posLabel = { 'GK': 'KALECİ', 'DEF': 'DEFANS', 'MID': 'ORTA SAHA', 'FWD': 'FORVET' }[normalizeRole((activePlayer as any).position || activePlayerSlot?.role || '')] || 'OYUNCU';
                const c = playerCard;
                const isSelf = !!c?.is_self;
                const footTr = (f?: string | null) => f === 'SAG' ? 'SAĞ' : f === 'SOL' ? 'SOL' : '—';
                // Bilgiler herkese açık; yalnız "birlikte maç" arkadaşlara özel.
                const canShowTogether = !!c && !isSelf && c.matches_together != null;
                const showHero = isSelf || canShowTogether;
                const heroNum = isSelf ? (c?.total_matches ?? 0) : (c?.matches_together ?? 0);
                const heroLabel = isSelf ? 'TOPLAM MAÇ' : 'BİRLİKTE MAÇ';
                const showFriendCta = !!c && !isSelf && !c.is_friend;

                return (
                  <div className="p-6 pt-8 flex flex-col items-center">
                    <div className="w-24 h-24 rounded-full overflow-hidden border-2 shadow-lg mb-3" style={{ borderColor: accent + '66' }}>
                      {isRealPhoto((activePlayer as any).avatar) ? (
                        <img src={(activePlayer as any).avatar} alt={(activePlayer as any).name} className="w-full h-full object-cover bg-[#0A0E14]" />
                      ) : (
                        <div className={`w-full h-full flex items-center justify-center text-3xl font-black tracking-tight ${initialsCls}`}>
                          {getInitials((activePlayer as any).name)}
                        </div>
                      )}
                    </div>
                    <h3 className="text-xl font-black text-white tracking-tight text-center leading-tight px-2">
                      {isMySlot ? 'SEN' : (c?.name || (activePlayer as any).name || 'Oyuncu')}
                    </h3>
                    <span className="mt-1 text-[9px] font-black uppercase tracking-[0.25em]" style={{ color: accent }}>{posLabel}</span>

                    {playerCardLoading ? (
                      <div className="w-full flex items-center justify-center py-12">
                        <Loader2 size={22} className="animate-spin text-white/40" />
                      </div>
                    ) : (
                      <>
                        {showHero && (
                          <div className="w-full mt-5 rounded-2xl border py-4 flex flex-col items-center gap-1" style={{ borderColor: accent + '33', background: accent + '10' }}>
                            <span className="text-[9px] font-black uppercase tracking-[0.3em]" style={{ color: accent + 'cc' }}>{heroLabel}</span>
                            <div className="flex items-baseline gap-1.5">
                              <span className="text-5xl font-black tabular-nums leading-none" style={{ color: accent }}>{heroNum}</span>
                              <span className="text-sm font-black text-white/70">MAÇ</span>
                            </div>
                          </div>
                        )}
                        <div className={`w-full grid grid-cols-3 gap-2 ${showHero ? 'mt-3' : 'mt-5'}`}>
                          {[
                            { l: 'YAŞ', v: c?.age != null ? String(c.age) : '—' },
                            { l: 'FAIR PLAY', v: c?.fair_play != null ? '%' + c.fair_play : '—' },
                            { l: 'AYAK', v: footTr(c?.preferred_foot) },
                          ].map(s => (
                            <div key={s.l} className="bg-white/[0.04] border border-white/8 rounded-xl py-3 flex flex-col items-center gap-1">
                              <span className="text-[7px] font-black text-white/35 uppercase tracking-[0.15em]">{s.l}</span>
                              <span className="text-base font-black text-white">{s.v}</span>
                            </div>
                          ))}
                        </div>
                        {showFriendCta && (
                          <button
                            disabled={friendRequestSent}
                            onClick={async () => {
                              try {
                                await sendFriendRequest(currentUserUid, activePlayer.id);
                                setFriendRequestSent(true);
                                showActionSuccess('Arkadaşlık isteği gönderildi.');
                              } catch (e: any) {
                                showActionError(e?.message || 'İstek gönderilemedi.');
                              }
                            }}
                            className="w-full mt-3 py-3 rounded-2xl font-black text-[11px] uppercase tracking-widest text-[#39FF14] bg-[#39FF14]/10 border border-[#39FF14]/25 active:scale-95 transition-all flex items-center justify-center gap-2 disabled:opacity-60">
                            {friendRequestSent ? <><CheckCircle2 size={14} /> İSTEK GÖNDERİLDİ</> : <><UserPlus size={14} /> ARKADAŞ OL</>}
                          </button>
                        )}
                      </>
                    )}

                    {/* Yönetim aksiyonları — YALNIZ MANAGE (Sıradaki Maçlarım) */}
                    {isManageMode && (
                      <div className="w-full mt-4 space-y-2">
                        {activePlayerSlot && (activePlayerSlot as any).purchasedBy === currentUserProfile.id && (activePlayerSlot as any).assignmentStatus !== 'ACCEPTED' && (
                          <div className="flex gap-2">
                            <button onClick={() => { setInviteModalSlotId(activePlayerSlot.id); setFriendSearch(''); setActivePlayerSlotId(null); }}
                              className="flex-1 py-3 rounded-2xl font-black text-[11px] uppercase tracking-wider text-black bg-[#39FF14] active:scale-95 transition-all flex items-center justify-center gap-1.5">
                              <UserPlus size={13} /> Arkadaşa Ata
                            </button>
                            <button onClick={() => handleMakeSlotCode(activePlayerSlot.id)}
                              className="flex-1 py-3 rounded-2xl font-black text-[11px] uppercase tracking-wider text-white bg-white/5 border border-white/15 active:scale-95 transition-all flex items-center justify-center gap-1.5">
                              <KeyRound size={13} /> Kod Oluştur
                            </button>
                          </div>
                        )}
                        {activePlayerSlot && (activePlayerSlot as any).inviteeId === currentUserProfile.id && (activePlayerSlot as any).assignmentStatus === 'INVITED' && (
                          <button onClick={() => handleAcceptSlot(activePlayerSlot.id)} disabled={isProcessing}
                            className="w-full py-3.5 rounded-2xl font-black text-xs uppercase tracking-widest text-black bg-[#39FF14] active:scale-95 transition-all shadow-[0_0_20px_rgba(57,255,20,0.35)] flex items-center justify-center gap-2">
                            <CheckCircle2 size={15} /> Slotu Kabul Et
                          </button>
                        )}
                        {isCaptain && !isMySlot && (
                          <button onClick={() => { setRemoveConfirmSlot(activePlayerSlot); setActivePlayerSlotId(null); }}
                            className="w-full py-3.5 rounded-2xl font-black text-xs uppercase tracking-widest text-red-400 bg-red-950/30 border border-red-500/15 active:scale-95 transition-all">
                            KADRODAN ÇIKAR
                          </button>
                        )}
                        {isMySlot && (
                          <button onClick={() => { setActivePlayerSlotId(null); setShowLeaveConfirm(true); }}
                            className="w-full py-3.5 rounded-2xl font-black text-xs uppercase tracking-widest text-red-500 bg-red-500/10 border border-red-500/20 active:scale-95 transition-all">
                            SLOTTAN AYRIL
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                );
              })()}

              <button onClick={() => setActivePlayerSlotId(null)}
                className="absolute top-4 right-4 w-8 h-8 rounded-full bg-white/10 flex items-center justify-center text-white/70 hover:bg-white/20 transition-colors backdrop-blur-md z-10">
                <X size={16} />
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Maçtan Ayrıl Onay Modalı ────────────────────────────────────────── */}
      <AnimatePresence>
        {showLeaveConfirm && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-[60] bg-black/85 backdrop-blur-md flex items-center justify-center p-6">
            <motion.div
              initial={{ scale: 0.9, y: 20, opacity: 0 }}
              animate={{ scale: 1, y: 0, opacity: 1 }}
              exit={{ scale: 0.9, y: 20, opacity: 0 }}
              className="bg-[#161B22] border border-red-500/30 w-full max-w-sm rounded-[32px] p-6 shadow-[0_0_50px_rgba(239,68,68,0.2)] text-center">
              
              <div className="w-16 h-16 rounded-full bg-red-500/10 border border-red-500/20 flex items-center justify-center mx-auto mb-4">
                <AlertCircle size={32} className="text-red-500" />
              </div>
              
              <h3 className="text-xl font-black text-white italic uppercase tracking-tighter mb-2">
                {isAlreadyJoinedReserve ? 'Yedeklikten Ayrıl' : 'Maçtan Ayrıl'}
              </h3>
              
              <p className="text-sm text-gray-400 mb-3">
                {isAlreadyJoinedReserve
                  ? 'Yedek listesinden çıkmak istediğinize emin misiniz?'
                  : 'Maçtan ayrılmak istediğinize emin misiniz? Kadrodaki yeriniz boşaltılacaktır.'}
              </p>
              {/* B5: para ayrılmadan önce KONUŞULUR — sunucu iade kredisini zaten
                  işliyor (leave RPC); kullanıcı sonucu burada net görür. */}
              {!isAlreadyJoinedReserve && (match.price || 0) > 0 && (
                <p className="text-[11px] font-bold text-[#39FF14]/90 bg-[#39FF14]/[0.07] border border-[#39FF14]/20 rounded-xl px-3 py-2 mb-6">
                  {[...(match.slots || []), ...(match.awaySlots || [])].some(
                    (s: any) => s?.player?.id === currentUserProfile?.id && s?.player?.paymentStatus === 'PAID'
                  )
                    ? `Ödediğin ${formatTRY(match.price)} iade kredisi olarak cüzdanına dönecek.`
                    : 'Ödeme yaptıysan tutar iade kredisi olarak cüzdanına döner.'}
                </p>
              )}
              
              <div className="flex gap-3">
                <button 
                  onClick={() => setShowLeaveConfirm(false)}
                  disabled={isProcessing}
                  className="flex-1 py-3 rounded-2xl font-black text-sm uppercase tracking-widest text-white bg-white/5 border border-white/10 hover:bg-white/10 transition-colors">
                  İPTAL
                </button>
                <button 
                  onClick={isAlreadyJoinedReserve ? handleLeaveReserves : handleLeaveMatch}
                  disabled={isProcessing}
                  className="flex-1 py-3 rounded-2xl font-black text-sm uppercase tracking-widest text-white bg-red-600 shadow-[0_0_20px_rgba(239,68,68,0.4)] hover:bg-red-500 transition-colors flex items-center justify-center">
                  {isProcessing ? <Loader2 size={18} className="animate-spin" /> : 'AYRIL'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── B4: Maçı İptal Onay Modalı (kurucu) ─────────────────────────────── */}
      <AnimatePresence>
        {showCancelConfirm && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-[60] bg-black/85 backdrop-blur-md flex items-center justify-center p-6">
            <motion.div
              initial={{ scale: 0.9, y: 20, opacity: 0 }}
              animate={{ scale: 1, y: 0, opacity: 1 }}
              exit={{ scale: 0.9, y: 20, opacity: 0 }}
              className="bg-[#161B22] border border-red-500/30 w-full max-w-sm rounded-[32px] p-6 shadow-[0_0_50px_rgba(239,68,68,0.2)] text-center">
              <div className="w-16 h-16 rounded-full bg-red-500/10 border border-red-500/20 flex items-center justify-center mx-auto mb-4">
                <AlertCircle size={32} className="text-red-500" />
              </div>
              <h3 className="text-xl font-black text-white italic uppercase tracking-tighter mb-2">Maçı İptal Et</h3>
              <p className="text-sm text-gray-400 mb-3">
                Bu maçı iptal etmek istediğine emin misin? Tüm kadro bilgilendirilir ve maç vitrinden kaldırılır.
              </p>
              {/* Kademeli iade özeti — sunucu 24s kuralıyla birebir */}
              <p className="text-[11px] font-bold text-amber-300/90 bg-amber-400/[0.07] border border-amber-400/20 rounded-xl px-3 py-2 mb-6 text-left">
                • Maça <b>24 saatten fazla</b> varsa: katılımcı ödemeleri iade edilir.<br />
                • <b>24 saatten az</b> kaldıysa: geç iptal — iade yapılmaz ve fair-play puanın etkilenebilir.
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => setShowCancelConfirm(false)}
                  disabled={isProcessing}
                  className="flex-1 py-3 rounded-2xl font-black text-sm uppercase tracking-widest text-white bg-white/5 border border-white/10 hover:bg-white/10 transition-colors">
                  VAZGEÇ
                </button>
                <button
                  onClick={handleCancelMatch}
                  disabled={isProcessing}
                  className="flex-1 py-3 rounded-2xl font-black text-sm uppercase tracking-widest text-white bg-red-600 shadow-[0_0_20px_rgba(239,68,68,0.4)] hover:bg-red-500 transition-colors flex items-center justify-center">
                  {isProcessing ? <Loader2 size={18} className="animate-spin" /> : 'MAÇI İPTAL ET'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Kaptanın Oyuncuyu Çıkarma Onay Modalı ────────────────────────────────── */}
      <AnimatePresence>
        {removeConfirmSlot && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-[60] bg-black/85 backdrop-blur-md flex items-center justify-center p-6">
            <motion.div
              initial={{ scale: 0.9, y: 20, opacity: 0 }}
              animate={{ scale: 1, y: 0, opacity: 1 }}
              exit={{ scale: 0.9, y: 20, opacity: 0 }}
              className="bg-[#161B22] border border-red-500/30 w-full max-w-sm rounded-[32px] p-6 shadow-[0_0_50px_rgba(239,68,68,0.2)] text-center">
              
              <div className="w-16 h-16 rounded-full bg-red-500/10 border border-red-500/20 flex items-center justify-center mx-auto mb-4">
                <AlertCircle size={32} className="text-red-500" />
              </div>
              
              <h3 className="text-xl font-black text-white italic uppercase tracking-tighter mb-2">
                Kadrodan Çıkar
              </h3>
              
              <p className="text-sm text-gray-400 mb-6 font-semibold">
                <strong>{removeConfirmSlot.player?.name}</strong> isimli oyuncuyu kadrodan çıkarmak istediğinize emin misiniz?
              </p>
              
              <div className="flex gap-3">
                <button 
                  onClick={() => setRemoveConfirmSlot(null)}
                  className="flex-1 py-3 rounded-2xl font-black text-sm uppercase tracking-widest text-white bg-white/5 border border-white/10 hover:bg-white/10 transition-colors">
                  İPTAL
                </button>
                <button 
                  onClick={async () => {
                    if (!removeConfirmSlot) return;
                    setIsProcessing(true);
                    await handleRemovePlayer(removeConfirmSlot.id);
                    setRemoveConfirmSlot(null);
                    setIsProcessing(false);
                  }}
                  disabled={isProcessing}
                  className="flex-1 py-3 rounded-2xl font-black text-sm uppercase tracking-widest text-white bg-red-600 shadow-[0_0_20px_rgba(239,68,68,0.4)] hover:bg-red-500 transition-colors flex items-center justify-center">
                  {isProcessing ? <Loader2 size={18} className="animate-spin" /> : 'ÇIKAR'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Boş Slota Tıklama Karar Modalı (Kendim Katıl / Arkadaş Davet Et) ─────────────────────── */}
      <AnimatePresence>
        {openSlotActionSlot && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-6">
            <motion.div
              initial={{ scale: 0.9, y: 20, opacity: 0 }}
              animate={{ scale: 1, y: 0, opacity: 1 }}
              exit={{ scale: 0.9, y: 20, opacity: 0 }}
              className="bg-[#161B22] border border-[#39FF14]/30 w-full max-w-sm rounded-[32px] p-6 shadow-[0_0_50px_rgba(57,255,20,0.15)] text-center">
              
              <div className="w-16 h-16 rounded-full bg-[#39FF14]/10 border border-[#39FF14]/20 flex items-center justify-center mx-auto mb-4">
                <UserPlus size={32} className="text-[#39FF14]" />
              </div>
              
              <h3 className="text-xl font-black text-white italic uppercase tracking-tighter mb-2">
                Pozisyon Seçimi
              </h3>
              
              <p className="text-sm text-gray-400 mb-6">
                <strong>{ { 'GK': 'Kaleci (KL)', 'DEF': 'Savunma (SAV)', 'MID': 'Orta Saha (ORT)', 'FWD': 'Hücum (HÜC)' }[normalizeRole(openSlotActionSlot.role)] || 'Orta Saha (ORT)' }</strong> pozisyonu için bir işlem seçin:
              </p>
              
              <div className="space-y-3">
                <button 
                  onClick={() => {
                    setSelectedSlotId(openSlotActionSlot.id);
                    setOpenSlotActionSlot(null);
                  }}
                  className="w-full py-3.5 rounded-2xl font-black text-sm uppercase tracking-widest text-black bg-[#39FF14] hover:bg-[#32dd10] transition-colors shadow-[0_0_20px_rgba(57,255,20,0.3)]">
                  KENDİM KATILACAĞIM
                </button>
                <button 
                  onClick={() => {
                    setInviteModalSlotId(openSlotActionSlot.id);
                    setFriendSearch('');
                    setOpenSlotActionSlot(null);
                  }}
                  className="w-full py-3.5 rounded-2xl font-black text-sm uppercase tracking-widest text-white bg-white/5 border border-white/10 hover:bg-white/10 transition-colors">
                  ARKADAŞIMI DAVET ET
                </button>
                <button 
                  onClick={() => setOpenSlotActionSlot(null)}
                  className="w-full py-3.5 rounded-2xl font-black text-sm uppercase tracking-widest text-white/50 hover:text-white transition-colors pt-2">
                  İPTAL
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Arkadaş Davet Modalı ──────────────────────────────────────────── */}
      <AnimatePresence>
        {inviteModalSlotId && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/90 backdrop-blur-2xl flex flex-col">
            <div className="flex-1 overflow-y-auto">
              {/* Modal Header */}
              <div className="sticky top-0 bg-[#0A0E14]/95 backdrop-blur-xl border-b border-white/5 px-6 pt-14 pb-5 z-10">
                <div className="flex justify-between items-start mb-5">
                  {(() => {
                    const isAway = (match.awaySlots || []).some(s => s?.id === inviteModalSlotId);
                    return (
                      <div>
                        <h2 className="text-xl font-black text-white uppercase italic tracking-tight">
                          {isAway ? 'RAKİP OLMAYA DAVET ET' : 'ARKADAŞINI DAVET ET'}
                        </h2>
                        <p className="text-[10px] text-[#39FF14] font-bold uppercase tracking-widest mt-1">
                          {isAway ? 'Deplasman Kadrosuna Çağır' : 'Boş Pozisyona Çağır'}
                        </p>
                      </div>
                    );
                  })()}
                  <button onClick={() => { setInviteModalSlotId(null); setFriendSearch(''); setInviteCategory('Tümü'); }}
                    className="w-9 h-9 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-white/60 hover:bg-white/10">
                    <X size={18} />
                  </button>
                </div>
                {/* Arama */}
                <div className="relative">
                  <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-white/40" size={16} />
                  <input type="text" value={friendSearch} onChange={e => setFriendSearch(e.target.value)}
                    placeholder="Arkadaş ara..."
                    className="w-full bg-[#161B22] border border-white/10 rounded-2xl pl-11 pr-4 py-3.5 text-sm text-white placeholder-white/30 focus:outline-none focus:border-[#39FF14]/50 transition-colors" />
                </div>
              </div>

              <div className="px-6 py-4 max-w-lg mx-auto w-full">

                {/* Kategori Sekmeleri */}
                <div className="flex gap-2 mb-4 overflow-x-auto custom-scrollbar pb-2">
                  {['Tümü', 'Favorilerim', 'Lise Tayfası', 'Üniversite', 'İş Arkadaşları'].map(cat => (
                    <button 
                      key={cat}
                      onClick={() => setInviteCategory(cat)}
                      className={`px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-widest whitespace-nowrap transition-colors flex items-center gap-1.5 ${
                        inviteCategory === cat 
                          ? (cat === 'Favorilerim' ? 'bg-[#FACC15] text-black shadow-[0_0_15px_rgba(250,204,21,0.3)]' : 'bg-[#39FF14] text-black shadow-[0_0_15px_rgba(57,255,20,0.3)]')
                          : 'bg-white/5 text-white/50 border border-white/10 hover:bg-white/10'
                      }`}
                    >
                      {cat === 'Favorilerim' && <Star size={10} fill={inviteCategory === cat ? "black" : "currentColor"} />}
                      {cat}
                    </button>
                  ))}
                </div>

                {/* Çevrimiçi Arkadaşlar */}
                {onlineFriends.length > 0 && (
                  <div className="mb-5">
                    <div className="flex items-center gap-2 mb-3">
                      <Wifi size={12} className="text-[#39FF14]" />
                      <span className="text-[9px] font-black text-[#39FF14] uppercase tracking-[0.2em]">ÇEVRİMİÇİ — {onlineFriends.length}</span>
                    </div>
                    <div className="space-y-2">
                      {onlineFriends.map(friend => (
                        <FriendInviteRow key={(friend as any).id} friend={friend} onInvite={() => handleInviteFriend(friend)} />
                      ))}
                    </div>
                  </div>
                )}

                {/* Çevrimdışı Arkadaşlar */}
                {offlineFriends.length > 0 && (
                  <div className="mb-5">
                    <div className="flex items-center gap-2 mb-3">
                      <WifiOff size={12} className="text-white/30" />
                      <span className="text-[9px] font-black text-white/30 uppercase tracking-[0.2em]">ÇEVRİMDIŞI — {offlineFriends.length}</span>
                    </div>
                    <div className="space-y-2">
                      {offlineFriends.map(friend => (
                        <FriendInviteRow key={(friend as any).id} friend={friend} onInvite={() => handleInviteFriend(friend)} />
                      ))}
                    </div>
                  </div>
                )}

                {filteredFriends.length === 0 && (
                  <div className="text-center py-12">
                    <Users size={28} className="text-white/20 mx-auto mb-3" />
                    <p className="text-xs text-white/30 font-bold uppercase tracking-widest">Arkadaş Bulunamadı</p>
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Kaleci / Hakem Seçim Modalı (Sıralı Öneri) ───────────────────── */}
      <AnimatePresence>
        {providerModalType && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-end justify-center"
            onClick={() => { if (!providerSubmittingId) setProviderModalType(null); }}
          >
            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 250 }}
              onClick={e => e.stopPropagation()}
              className="bg-[#161B22] border-t border-white/10 w-full max-w-md rounded-t-[36px] p-6 pb-10 shadow-[0_-20px_50px_rgba(0,0,0,0.8)]"
            >
              <div className="w-12 h-1 bg-white/20 rounded-full mx-auto mb-6" />

              {(() => {
                const isGK = providerModalType === 'GK';
                const accent = isGK ? '#FF9F43' : '#A78BFA';
                const Icon = isGK ? Hand : Scale;
                const title = isGK ? 'Kaleci Ekle' : 'Hakem Ekle';
                return (
                  <>
                    <div className="flex justify-between items-center mb-5">
                      <div className="flex items-center gap-3">
                        <div className="p-2.5 rounded-xl border" style={{ background: accent + '1a', color: accent, borderColor: accent + '33' }}>
                          <Icon size={18} />
                        </div>
                        <div>
                          <h3 className="text-xl font-black text-white italic uppercase tracking-tighter">{title}</h3>
                          <p className="text-[9px] font-black uppercase tracking-widest mt-0.5" style={{ color: accent }}>
                            Sıralı Öneri • Tek Kişi Tüm Ücreti Öder
                          </p>
                        </div>
                      </div>
                      <button
                        onClick={() => { if (!providerSubmittingId) setProviderModalType(null); }}
                        className="w-8 h-8 rounded-full bg-white/5 flex items-center justify-center text-white/50 hover:bg-white/10"
                      >
                        <X size={18} />
                      </button>
                    </div>

                    {providersLoading ? (
                      <div className="flex flex-col items-center justify-center py-14 gap-3">
                        <Spinner size={28} color={accent} />
                        <p className="text-[10px] font-black text-white/40 uppercase tracking-widest">Uygun {isGK ? 'kaleci' : 'hakem'}ler aranıyor…</p>
                      </div>
                    ) : providerSuggestions.length === 0 ? (
                      <div className="text-center py-12 space-y-3">
                        <Icon size={34} className="text-white/20 mx-auto" />
                        <p className="text-xs font-bold text-gray-500 uppercase tracking-widest">
                          Şu an uygun {isGK ? 'kaleci' : 'hakem'} yok
                        </p>
                      </div>
                    ) : (
                      <div className="space-y-3 max-h-[420px] overflow-y-auto pr-1 custom-scrollbar">
                        {providerSuggestions.map((p) => {
                          const submitting = providerSubmittingId === p.id;
                          const disabled = !!providerSubmittingId;
                          return (
                            <div
                              key={p.id}
                              onClick={() => { if (!disabled) setMarketDetailProvider(p); }}
                              className="bg-black/30 border border-white/5 p-4 rounded-2xl flex flex-col gap-3 transition-all hover:border-white/10 cursor-pointer active:scale-[0.99]"
                            >
                              <div className="flex items-center gap-3">
                                <div className="relative shrink-0">
                                  {isRealPhoto(p.avatar) ? (
                                    <img src={p.avatar!} alt={p.name} className="w-12 h-12 rounded-xl object-cover border" style={{ borderColor: accent + '50' }} />
                                  ) : (
                                    <div className="w-12 h-12 rounded-xl flex items-center justify-center font-black border" style={{ background: accent + '1a', color: accent, borderColor: accent + '50' }}>
                                      {getInitials(p.name)}
                                    </div>
                                  )}
                                  {p.is_elite && (
                                    <div className="absolute -bottom-1 -right-1 p-0.5 rounded-md bg-[#FACC15] border-2 border-[#161B22]">
                                      <Award size={10} className="text-black" />
                                    </div>
                                  )}
                                </div>
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center justify-between gap-2">
                                    <h4 className="text-sm font-black text-white uppercase tracking-tight italic truncate">{p.name}</h4>
                                    <div className="flex items-center gap-1 bg-white/5 px-2 py-0.5 rounded text-[10px] font-black text-yellow-400 shrink-0">
                                      <Star size={10} fill="currentColor" /> {Number(p.rating).toFixed(1)}
                                    </div>
                                  </div>
                                  <p className="text-[9px] text-white/40 font-bold uppercase tracking-wide mt-0.5 truncate">
                                    {[p.level, `${p.match_count} Maç`].filter(Boolean).join(' • ')}
                                  </p>
                                </div>
                              </div>

                              <div className="flex items-center justify-between pt-1">
                                <div>
                                  <p className="text-[8px] font-black text-white/40 uppercase tracking-widest">Ücret</p>
                                  <p className="text-xl font-black text-white tracking-tighter">{p.fee}₺</p>
                                </div>
                                <div className="flex items-center gap-2">
                                  <span className="flex items-center gap-0.5 text-[8px] font-black uppercase tracking-widest text-white/35">Detay <ChevronRight size={12} /></span>
                                  <motion.button
                                    whileHover={disabled ? undefined : { scale: 1.04 }}
                                    whileTap={disabled ? undefined : { scale: 0.96 }}
                                    disabled={disabled}
                                    onClick={(e) => { e.stopPropagation(); handleSelectProvider(p); }}
                                    className="px-4 py-2.5 rounded-xl font-black text-[10px] uppercase tracking-widest text-black transition-all flex items-center justify-center gap-1.5 disabled:opacity-50"
                                    style={{ background: accent, boxShadow: `0 0 15px ${accent}55` }}
                                  >
                                    {submitting ? <Loader2 size={13} className="animate-spin" /> : 'TALEP GÖNDER'}
                                  </motion.button>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </>
                );
              })()}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Pazar: Sağlayıcı Dikey Detaylı Kart + Talep (kaptan) ─────────────── */}
      <AnimatePresence>
        {marketDetailProvider && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-[60] bg-black/85 backdrop-blur-2xl flex items-center justify-center p-6"
            onClick={() => { if (!providerSubmittingId) setMarketDetailProvider(null); }}>
            <motion.div
              initial={{ scale: 0.8, y: 30, opacity: 0 }}
              animate={{ scale: 1, y: 0, opacity: 1 }}
              exit={{ scale: 0.8, y: 30, opacity: 0 }}
              transition={{ type: 'spring', damping: 24, stiffness: 300 }}
              onClick={e => e.stopPropagation()}
              className="relative w-[20rem] max-h-[85vh] overflow-y-auto custom-scrollbar rounded-[28px] bg-gradient-to-b from-[#161B22] to-[#0d1117] border shadow-[0_30px_70px_rgba(0,0,0,0.85)]"
              style={{ borderColor: (providerModalType === 'REF' ? '#A78BFA' : '#FF9F43') + '33' }}>
              {(() => {
                const p = marketDetailProvider;
                const isRef = providerModalType === 'REF';
                const accent = isRef ? '#A78BFA' : '#FF9F43';
                const submitting = providerSubmittingId === p.id;
                const ratings = extractProviderRatings(p.skills as any, p.stats as any, isRef);
                const st = (p.stats || {}) as Record<string, any>;
                const infoRow = isRef
                  ? [
                      { Icon: Activity, l: 'MAÇ', v: p.match_count != null ? String(p.match_count) : '—' },
                      { Icon: Scale, l: 'ORT. KART', v: st.avgCards != null ? String(st.avgCards) : '—' },
                      { Icon: MapPin, l: 'KOŞU', v: st.avgDistance || '—' },
                    ]
                  : [
                      { Icon: Calendar, l: 'YAŞ', v: p.age != null ? String(p.age) : '—' },
                      { Icon: Ruler, l: 'BOY', v: p.height || '—' },
                      { Icon: Activity, l: 'MAÇ', v: p.match_count != null ? String(p.match_count) : '—' },
                    ];
                return (
                  <div className="p-6 pt-8 flex flex-col items-center">
                    <div className="w-24 h-24 rounded-full overflow-hidden border-2 shadow-lg mb-3" style={{ borderColor: accent + '80' }}>
                      {isRealPhoto(p.avatar) ? (
                        <img src={p.avatar!} alt={p.name} className="w-full h-full object-cover bg-[#0A0E14]" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-3xl font-black" style={{ background: accent + '22', color: accent }}>
                          {getInitials(p.name)}
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-xl font-black text-white tracking-tight text-center leading-tight">{p.name}</h3>
                      {p.is_elite && <Award size={16} className="text-[#FACC15] shrink-0" />}
                    </div>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-[9px] font-black uppercase tracking-[0.25em]" style={{ color: accent }}>{isRef ? 'HAKEM' : 'KİRALIK KALECİ'}</span>
                      {isRef && p.level && <span className="text-[9px] font-bold text-white/40 uppercase tracking-wide">· {p.level}</span>}
                    </div>

                    <div className="w-full grid grid-cols-2 gap-2 mt-5">
                      <div className="rounded-2xl border py-4 flex flex-col items-center gap-1" style={{ borderColor: accent + '33', background: accent + '10' }}>
                        <span className="text-[8px] font-black uppercase tracking-[0.2em] text-white/40">REYTİNG</span>
                        <div className="flex items-baseline gap-1">
                          <Star size={16} className="text-yellow-400" fill="currentColor" />
                          <span className="text-3xl font-black tabular-nums leading-none" style={{ color: accent }}>{Number(p.rating).toFixed(1)}</span>
                        </div>
                      </div>
                      <div className="rounded-2xl border border-white/8 bg-white/[0.04] py-4 flex flex-col items-center gap-1">
                        <span className="text-[8px] font-black uppercase tracking-[0.2em] text-white/40">ÜCRET</span>
                        <span className="text-3xl font-black tabular-nums leading-none text-white">{p.fee}₺</span>
                      </div>
                    </div>

                    <div className="w-full grid grid-cols-3 gap-2 mt-2">
                      {infoRow.map(s => (
                        <div key={s.l} className="bg-white/[0.03] border border-white/8 rounded-xl py-2.5 flex flex-col items-center gap-0.5">
                          <s.Icon size={12} className="text-white/30" />
                          <span className="text-[7px] font-black text-white/35 uppercase tracking-[0.1em]">{s.l}</span>
                          <span className="text-xs font-black text-white">{s.v}</span>
                        </div>
                      ))}
                    </div>

                    {ratings.length > 0 && (
                      <div className="w-full mt-5">
                        <span className="text-[8px] font-black uppercase tracking-[0.2em] text-white/40 ml-1">{isRef ? 'Hakemlik Reytingleri' : 'Kalecilik Reytingleri'}</span>
                        <div className="mt-2 space-y-2">
                          {ratings.map(r => (
                            <div key={r.label} className="flex items-center gap-2">
                              <span className="text-[8px] font-black text-white/50 uppercase tracking-wide w-28 shrink-0 truncate">{r.label}</span>
                              <div className="flex-1 h-2 rounded-full bg-white/8 overflow-hidden">
                                <div className="h-full rounded-full" style={{ width: `${Math.max(0, Math.min(100, r.value))}%`, background: `linear-gradient(90deg, ${accent}99, ${accent})` }} />
                              </div>
                              <span className="text-[10px] font-black tabular-nums w-7 text-right" style={{ color: accent }}>{r.value}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Ödeme — kaptan cüzdan veya kart ile emanete öder (FAZ 4) */}
                    <div className="w-full mt-6 flex gap-2">
                      <motion.button
                        whileTap={submitting ? undefined : { scale: 0.97 }}
                        disabled={!!providerSubmittingId}
                        onClick={() => handleSelectProvider(p, 'WALLET')}
                        className="flex-1 py-3.5 rounded-2xl font-black text-[11px] uppercase tracking-widest text-black transition-all flex items-center justify-center gap-1.5 disabled:opacity-60"
                        style={{ background: accent, boxShadow: `0 0 20px ${accent}55` }}>
                        {submitting ? <Loader2 size={15} className="animate-spin" /> : <><Wallet size={14} /> Cüzdanla</>}
                      </motion.button>
                      <motion.button
                        whileTap={submitting ? undefined : { scale: 0.97 }}
                        disabled={!!providerSubmittingId}
                        onClick={() => handleSelectProvider(p, 'CARD')}
                        className="flex-1 py-3.5 rounded-2xl font-black text-[11px] uppercase tracking-widest text-white bg-white/8 border border-white/15 transition-all flex items-center justify-center gap-1.5 disabled:opacity-60">
                        <CreditCard size={14} /> Kartla
                      </motion.button>
                    </div>
                    <p className="text-center mt-2 text-sm font-black" style={{ color: accent }}>{p.fee}₺</p>
                    <p className="text-[9px] text-white/30 text-center mt-1 leading-relaxed px-2">
                      Ücret emanete alınır; {isRef ? 'hakem' : 'kaleci'} onaylayınca aktarılır. Reddedilir/no-show olursa iade edilir.
                    </p>
                  </div>
                );
              })()}
              <button onClick={() => { if (!providerSubmittingId) setMarketDetailProvider(null); }}
                className="absolute top-4 right-4 w-8 h-8 rounded-full bg-white/10 flex items-center justify-center text-white/70 hover:bg-white/20 transition-colors backdrop-blur-md z-10">
                <X size={16} />
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Atanmış Kaleci/Hakem — Dikey Detaylı Kart (HERKESE) ──────────────── */}
      <AnimatePresence>
        {providerDetail && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/85 backdrop-blur-2xl flex items-center justify-center p-6"
            onClick={() => setProviderDetail(null)}>
            {(() => {
              const p = providerDetail.p;
              const isRef = providerDetail.isRef;
              const accent = isRef ? '#A78BFA' : '#FF9F43';
              const cardBg = isRef ? 'from-[#15111f] to-[#0d1117]' : 'from-[#1c1207] to-[#0d1117]';
              const initialsBg = isRef ? 'bg-violet-950/60 text-violet-300' : 'bg-orange-950/60 text-orange-300';
              const ratings = extractProviderRatings(p.skills as any, p.stats as any, isRef);
              const st = (p.stats || {}) as Record<string, any>;
              const infoRow = isRef
                ? [
                    { Icon: Activity, l: 'MAÇ', v: p.matchCount != null ? String(p.matchCount) : '—' },
                    { Icon: Scale, l: 'ORT. KART', v: st.avgCards != null ? String(st.avgCards) : '—' },
                    { Icon: MapPin, l: 'KOŞU', v: st.avgDistance || '—' },
                  ]
                : [
                    { Icon: Calendar, l: 'YAŞ', v: p.age != null ? String(p.age) : '—' },
                    { Icon: Ruler, l: 'BOY', v: p.height || '—' },
                    { Icon: Activity, l: 'MAÇ', v: p.matchCount != null ? String(p.matchCount) : '—' },
                  ];
              return (
            <motion.div
              initial={{ scale: 0.8, y: 30, opacity: 0 }}
              animate={{ scale: 1, y: 0, opacity: 1 }}
              exit={{ scale: 0.8, y: 30, opacity: 0 }}
              transition={{ type: 'spring', damping: 24, stiffness: 300 }}
              onClick={e => e.stopPropagation()}
              className={`relative w-[20rem] max-h-[85vh] overflow-y-auto custom-scrollbar rounded-[28px] bg-gradient-to-b ${cardBg} border shadow-[0_30px_70px_rgba(0,0,0,0.85)]`}
              style={{ borderColor: accent + '40' }}>
                  <div className="p-6 pt-8 flex flex-col items-center">
                    <div className="w-24 h-24 rounded-full overflow-hidden border-2 shadow-lg mb-3" style={{ borderColor: accent + '80' }}>
                      {isRealPhoto(p.avatar) ? (
                        <img src={p.avatar!} alt={p.name} className="w-full h-full object-cover bg-[#0A0E14]" />
                      ) : (
                        <div className={`w-full h-full flex items-center justify-center text-3xl font-black ${initialsBg}`}>
                          {getInitials(p.name)}
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-xl font-black text-white tracking-tight text-center leading-tight">{p.name}</h3>
                      {p.isElite && <Award size={16} className="text-[#FACC15] shrink-0" />}
                    </div>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-[9px] font-black uppercase tracking-[0.25em]" style={{ color: accent }}>{isRef ? 'ATANAN HAKEM' : 'KİRALIK KALECİ'}</span>
                      {isRef && p.level && <span className="text-[9px] font-bold text-white/40 uppercase tracking-wide">· {p.level}</span>}
                    </div>

                    {/* Reyting + Ücret */}
                    <div className="w-full grid grid-cols-2 gap-2 mt-5">
                      <div className="rounded-2xl border py-4 flex flex-col items-center gap-1" style={{ borderColor: accent + '33', background: accent + '10' }}>
                        <span className="text-[8px] font-black uppercase tracking-[0.2em] text-white/40">REYTİNG</span>
                        <div className="flex items-baseline gap-1">
                          <Star size={16} className="text-yellow-400" fill="currentColor" />
                          <span className="text-3xl font-black tabular-nums leading-none" style={{ color: accent }}>{p.rating != null ? p.rating.toFixed(1) : '—'}</span>
                        </div>
                      </div>
                      <div className="rounded-2xl border border-white/8 bg-white/[0.04] py-4 flex flex-col items-center gap-1">
                        <span className="text-[8px] font-black uppercase tracking-[0.2em] text-white/40">ÜCRET</span>
                        <span className="text-3xl font-black tabular-nums leading-none text-white">{p.fee != null ? p.fee + '₺' : '—'}</span>
                      </div>
                    </div>

                    {/* Bilgi satırı */}
                    <div className="w-full grid grid-cols-3 gap-2 mt-2">
                      {infoRow.map(s => (
                        <div key={s.l} className="bg-white/[0.03] border border-white/8 rounded-xl py-2.5 flex flex-col items-center gap-0.5">
                          <s.Icon size={12} className="text-white/30" />
                          <span className="text-[7px] font-black text-white/35 uppercase tracking-[0.1em]">{s.l}</span>
                          <span className="text-xs font-black text-white">{s.v}</span>
                        </div>
                      ))}
                    </div>

                    {/* Reytingler — admin panelindeki tüm yetenekler */}
                    {ratings.length > 0 && (
                      <div className="w-full mt-5">
                        <span className="text-[8px] font-black uppercase tracking-[0.2em] text-white/40 ml-1">{isRef ? 'Hakemlik Reytingleri' : 'Kalecilik Reytingleri'}</span>
                        <div className="mt-2 space-y-2">
                          {ratings.map(r => (
                            <div key={r.label} className="flex items-center gap-2">
                              <span className="text-[8px] font-black text-white/50 uppercase tracking-wide w-28 shrink-0 truncate">{r.label}</span>
                              <div className="flex-1 h-2 rounded-full bg-white/8 overflow-hidden">
                                <div className="h-full rounded-full" style={{ width: `${Math.max(0, Math.min(100, r.value))}%`, background: `linear-gradient(90deg, ${accent}99, ${accent})` }} />
                              </div>
                              <span className="text-[10px] font-black tabular-nums w-7 text-right" style={{ color: accent }}>{r.value}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
              <button onClick={() => setProviderDetail(null)}
                className="absolute top-4 right-4 w-8 h-8 rounded-full bg-white/10 flex items-center justify-center text-white/70 hover:bg-white/20 transition-colors backdrop-blur-md z-10">
                <X size={16} />
              </button>
            </motion.div>
              );
            })()}
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── No-show Onay Modalı (kaptan) ────────────────────────────────────── */}
      <AnimatePresence>
        {showNoShowConfirm && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-[60] bg-black/85 backdrop-blur-xl flex items-center justify-center p-6"
            onClick={() => { if (!isProcessing) setShowNoShowConfirm(false); }}>
            <motion.div
              initial={{ scale: 0.85, y: 20, opacity: 0 }} animate={{ scale: 1, y: 0, opacity: 1 }} exit={{ scale: 0.85, y: 20, opacity: 0 }}
              transition={{ type: 'spring', damping: 24, stiffness: 300 }}
              onClick={e => e.stopPropagation()}
              className="w-[19rem] rounded-[28px] bg-gradient-to-b from-[#1a1012] to-[#0d1117] border border-red-500/25 shadow-[0_30px_70px_rgba(0,0,0,0.85)] p-6 flex flex-col items-center text-center">
              <div className="w-14 h-14 rounded-2xl bg-red-500/12 border border-red-500/25 flex items-center justify-center mb-3">
                <AlertCircle size={26} className="text-red-400" />
              </div>
              <h3 className="text-lg font-black text-white tracking-tight">Kaleci gelmedi mi?</h3>
              <p className="text-[11px] text-white/50 leading-relaxed mt-2 px-1">
                No-show bildirdiğinde ödediğin ücret iade edilir ve maçın slot ücreti
                ({match.price ?? 0}₺) ceza olarak kalecinin teminatından sana aktarılır.
                Kaleci 48 saat içinde itiraz edebilir.
              </p>
              <div className="w-full flex gap-2 mt-5">
                <button disabled={isProcessing} onClick={() => setShowNoShowConfirm(false)}
                  className="flex-1 py-3 rounded-2xl font-black text-[11px] uppercase tracking-widest text-white/70 bg-white/5 border border-white/10 disabled:opacity-50">
                  Vazgeç
                </button>
                <button disabled={isProcessing} onClick={handleReportNoShow}
                  className="flex-1 py-3 rounded-2xl font-black text-[11px] uppercase tracking-widest text-white bg-red-500 active:scale-95 transition-all flex items-center justify-center gap-1.5 disabled:opacity-60">
                  {isProcessing ? <Loader2 size={14} className="animate-spin" /> : 'Bildir'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── HEADER ─────────────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-20 bg-[#0A0E14]/90 backdrop-blur-2xl border-b border-white/5 shadow-[0_4px_30px_rgba(0,0,0,0.4)]">
        {/* Navigasyon Satırı */}
        <div className="flex items-center gap-3 px-5 pt-safe pt-2 pb-3">
          <button onClick={onBack}
            className="w-9 h-9 flex items-center justify-center bg-white/5 rounded-full border border-white/10 text-white hover:bg-white/10 active:scale-90 transition-all">
            <ArrowLeft size={17} />
          </button>
          <div className="flex-1 min-w-0">
            <h1 className="text-[15px] font-black text-white italic uppercase tracking-tighter leading-tight truncate">
              Maç Lobisi
            </h1>
            <p className="text-[9px] text-white/40 font-bold uppercase tracking-[0.2em] mt-0.5 truncate">
              {match.title || 'Maç Detayı'}
            </p>
          </div>
          {/* Sağ Aksiyon: MANAGE'de Maçtan Ayrıl; DISCOVER'da yalnız doluluk göstergesi */}
          {(isManageMode && (isAlreadyJoined || isAlreadyJoinedReserve)) ? (
            <button
              onClick={() => setShowLeaveConfirm(true)}
              className="px-3 py-1.5 rounded-full bg-red-500/10 border border-red-500/20 text-red-500 text-[10px] font-black uppercase tracking-widest hover:bg-red-500 hover:text-white transition-colors">
              {isAlreadyJoinedReserve ? 'Yedeklikten Ayrıl' : 'Maçtan Ayrıl'}
            </button>
          ) : (
            <div className="flex items-center gap-1.5 bg-white/5 border border-white/10 px-3 py-1.5 rounded-full">
              <Users size={11} className="text-white/50" />
              <span className="text-[10px] font-black text-white/80">{takenSlots}/{totalSlots}</span>
            </div>
          )}
        </div>

        {/* ── B4: Maçı İptal Et (yalnız kurucu, yönetim lobisi) ── */}
        {isManageMode && isCaptain && match.status !== 'CANCELLED' && match.status !== 'COMPLETED' && (
          <div className="px-4 pb-3">
            <button
              onClick={() => setShowCancelConfirm(true)}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-2xl bg-red-500/[0.06] border border-red-500/25 text-red-400 text-[10px] font-black uppercase tracking-widest hover:bg-red-500/15 active:scale-[0.98] transition-all"
            >
              <AlertCircle size={13} /> Maçı İptal Et
            </button>
          </div>
        )}

        {/* ── Özel Maç Kodu (yalnız kaptana) ── */}
        {match.visibility === 'PRIVATE' && match.privateCode && isCaptain && (
          <div className="px-4 pb-3">
            <button
              onClick={() => {
                const code = match.privateCode!;
                if (navigator.clipboard?.writeText) {
                  navigator.clipboard.writeText(code).then(
                    () => showActionSuccess(`Kod kopyalandı: ${code}`),
                    () => showActionSuccess(`Kod: ${code}`),
                  );
                } else {
                  showActionSuccess(`Kod: ${code}`);
                }
              }}
              className="w-full flex items-center justify-between gap-3 px-4 py-3 rounded-2xl bg-[#FACC15]/[0.06] border border-[#FACC15]/25 hover:bg-[#FACC15]/10 active:scale-[0.98] transition-all"
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-8 h-8 rounded-full bg-[#FACC15]/10 border border-[#FACC15]/30 flex items-center justify-center shrink-0">
                  <KeyRound size={14} className="text-[#FACC15]" />
                </div>
                <div className="text-left min-w-0">
                  <p className="text-[8px] font-black uppercase tracking-[0.2em] text-[#FACC15]/70">Özel Maç Kodu</p>
                  <p className="text-lg font-black tracking-[0.3em] text-white truncate">{match.privateCode}</p>
                </div>
              </div>
              <span className="flex items-center gap-1 text-[9px] font-black uppercase tracking-widest text-[#FACC15] shrink-0">
                <Copy size={12} /> Paylaş
              </span>
            </button>
          </div>
        )}

        {/* ── Minimalist Maç Başlığı ── */}
        <div className="px-4 pb-3">
          {/* VS Şeridi */}
          <div className="flex items-stretch gap-1.5 mb-2">
            {/* Ev Sahibi */}
            <button
              onClick={() => { setPitchSide('home'); setHasAutoSelectedSide(true); }}
              className={`flex-1 flex items-center gap-2 px-4 py-3.5 rounded-xl border transition-all active:scale-[0.97] ${
                pitchSide === 'home'
                  ? 'bg-white/8 border-white/25'
                  : 'bg-transparent border-white/5 opacity-55'
              }`}
            >
              <div className={`w-2.5 h-2.5 rounded-full shrink-0 ${homeTeam ? 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)]' : 'bg-white shadow-[0_0_6px_rgba(255,255,255,0.6)]'}`} />
              <p className="text-[13px] font-black text-white uppercase italic tracking-tight truncate leading-tight flex-1 min-w-0 text-left">
                {match.homeTeamName || homeTeam?.name || 'TAKIM'}
              </p>
              {homeTeam?.logo && (
                <div className="w-7 h-7 rounded-lg shrink-0 overflow-hidden">
                  {homeTeam.logo.startsWith('http')
                    ? <img src={homeTeam.logo} alt={homeTeam.name} className="w-full h-full object-cover" />
                    : <span className="text-sm">{homeTeam.logo}</span>}
                </div>
              )}
            </button>

            {/* Divider */}
            <div className="flex items-center justify-center w-6 shrink-0">
              <div className="w-px h-7 bg-white/10" />
            </div>

            {/* Deplasman */}
            <button
              onClick={() => { setPitchSide('away'); setHasAutoSelectedSide(true); }}
              className={`flex-1 flex items-center gap-2 px-4 py-3.5 rounded-xl border transition-all active:scale-[0.97] ${
                pitchSide === 'away'
                  ? 'bg-red-500/8 border-red-500/25'
                  : 'bg-transparent border-white/5 opacity-55'
              }`}
            >
              {awayTeam?.logo && (
                <div className="w-7 h-7 rounded-lg shrink-0 overflow-hidden">
                  {awayTeam.logo.startsWith('http')
                    ? <img src={awayTeam.logo} alt={awayTeam.name} className="w-full h-full object-cover" />
                    : <span className="text-sm">{awayTeam.logo}</span>}
                </div>
              )}
              <p className={`text-[13px] font-black uppercase italic tracking-tight truncate leading-tight flex-1 min-w-0 text-right ${
                (match.awayTeamName || awayTeam?.name) ? 'text-white' : 'text-red-400'
              }`}>
                {match.awayTeamName || awayTeam?.name || 'TAKIM'}
              </p>
              <div className="w-2.5 h-2.5 rounded-full shrink-0 bg-red-400 shadow-[0_0_8px_rgba(248,113,113,0.8)]" />
            </button>
          </div>

          {/* Bilgi + Badge Şeridi */}
          <div className="flex items-center gap-2 mb-2">
            <button onClick={() => setShowMapModal(true)}
              className="flex items-center gap-1 text-[10px] font-bold text-white/50 hover:text-[#39FF14] transition-colors min-w-0 flex-1">
              <MapPin size={9} className="text-[#39FF14] shrink-0" />
              <span className="truncate">{match.location || 'Konum'}</span>
            </button>
            <div className="flex items-center gap-1 text-[10px] font-bold text-white/40 shrink-0">
              <Calendar size={9} />
              <span>{match.date || '—'}</span>
              <span className="text-white/20">•</span>
              <Clock size={9} />
              <span>{match.time || '—'}</span>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <span className="px-1.5 py-0.5 rounded-md text-[9px] font-black uppercase border"
                style={{ color: diffConf.color, borderColor: diffConf.color + '40', background: diffConf.color + '12' }}>
                {diffConf.label}
              </span>
              <span className="px-1.5 py-0.5 rounded-md text-[9px] font-black uppercase text-white/70 bg-white/8 border border-white/10">
                {squadSize.toUpperCase()}
              </span>
            </div>
          </div>

          {/* Kurallar Butonu */}
          <button
            onClick={() => setShowInfoModal(true)}
            className="w-full flex items-center justify-between gap-2 py-2 px-3 rounded-xl bg-white/4 border border-white/8 hover:border-white/20 transition-all active:scale-[0.98] cursor-pointer"
          >
            <div className="flex items-center gap-2">
              <Info size={11} className="text-white/40" />
              <span className="text-[10px] font-black uppercase tracking-widest text-white/50">Maç Kuralları & Finans</span>
            </div>
            <ChevronRight size={11} className="text-white/30" />
          </button>
        </div>
      </header>

      {/* ── MAIN CONTENT ───────────────────────────────────────────────────── */}
      <main className="flex-1 px-4 overflow-y-auto custom-scrollbar pb-36 pt-4">

        {/* Lobi Sekme Seçici */}
        {/* ── CANLI MAÇ — Skor Girişi Paneli ─────────────────────────────── */}
        {match.status === 'LIVE' && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-gradient-to-br from-red-950/60 to-orange-950/40 border border-red-500/25 rounded-2xl p-4 mb-4"
          >
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                <span className="text-[10px] font-black text-red-400 uppercase tracking-widest">Canlı Maç</span>
              </div>
              {isCaptain && !match.scoreEnteredAt && (
                <span className="text-[9px] text-gray-500">Kaptan olarak skor girebilirsin</span>
              )}
              {match.scoreEnteredAt && (
                <span className="text-[9px] text-emerald-500">✓ Skor kaydedildi</span>
              )}
            </div>

            {/* Skor satırı */}
            <div className="flex items-center justify-center gap-6">
              {/* Ev takımı */}
              <div className="flex-1 text-center">
                <p className="text-[9px] text-gray-500 uppercase mb-1 truncate">
                  {(homeTeam as any)?.name || 'EV'}
                </p>
                {isCaptain && !match.scoreEnteredAt ? (
                  <div className="flex items-center justify-center gap-2">
                    <button
                      onClick={() => setScoreEntry(p => ({ ...p, home: Math.max(0, p.home - 1) }))}
                      className="w-7 h-7 rounded-full bg-white/10 text-white font-black text-lg flex items-center justify-center active:scale-95"
                    >−</button>
                    <span className="text-3xl font-black tabular-nums w-10 text-center text-white">{scoreEntry.home}</span>
                    <button
                      onClick={() => setScoreEntry(p => ({ ...p, home: p.home + 1 }))}
                      className="w-7 h-7 rounded-full bg-white/10 text-white font-black text-lg flex items-center justify-center active:scale-95"
                    >+</button>
                  </div>
                ) : (
                  <p className="text-3xl font-black text-white">{match.homeScore ?? 0}</p>
                )}
              </div>

              <span className="text-gray-600 font-black text-2xl">–</span>

              {/* Deplasman takımı */}
              <div className="flex-1 text-center">
                <p className="text-[9px] text-gray-500 uppercase mb-1 truncate">
                  {(awayTeam as any)?.name || 'DEP'}
                </p>
                {isCaptain && !match.scoreEnteredAt ? (
                  <div className="flex items-center justify-center gap-2">
                    <button
                      onClick={() => setScoreEntry(p => ({ ...p, away: Math.max(0, p.away - 1) }))}
                      className="w-7 h-7 rounded-full bg-white/10 text-white font-black text-lg flex items-center justify-center active:scale-95"
                    >−</button>
                    <span className="text-3xl font-black tabular-nums w-10 text-center text-white">{scoreEntry.away}</span>
                    <button
                      onClick={() => setScoreEntry(p => ({ ...p, away: p.away + 1 }))}
                      className="w-7 h-7 rounded-full bg-white/10 text-white font-black text-lg flex items-center justify-center active:scale-95"
                    >+</button>
                  </div>
                ) : (
                  <p className="text-3xl font-black text-white">{match.awayScore ?? 0}</p>
                )}
              </div>
            </div>

            {/* Tamamla butonu — sadece kaptan, skor girilmemişse */}
            {isCaptain && !match.scoreEnteredAt && (
              <motion.button
                whileTap={{ scale: 0.98 }}
                disabled={isProcessing}
                onClick={async () => {
                  try {
                    setIsProcessing(true);
                    // KN-3b taze-önce: kaptan skoru yazarken kadronun son hâli
                    // ezilmesin (bayat match yerine sunucudan taze taban).
                    const base = (await getMatchDetails(match.id)) ?? match;
                    await updateMatch({
                      ...base,
                      homeScore: scoreEntry.home,
                      awayScore: scoreEntry.away,
                      scoreEnteredAt: new Date().toISOString(),
                      status: 'COMPLETED',
                    });
                    showActionSuccess(`Maç tamamlandı! ${scoreEntry.home}–${scoreEntry.away} ⚽`);
                  } catch {
                    showActionError('Skor kaydedilemedi. Tekrar dene.');
                  } finally {
                    setIsProcessing(false);
                  }
                }}
                className="mt-3 w-full py-2.5 rounded-xl bg-red-500/15 border border-red-500/30 text-red-400 font-black text-[10px] uppercase tracking-widest flex items-center justify-center gap-2 hover:bg-red-500/25 transition-colors"
              >
                {isProcessing && <Loader2 size={12} className="animate-spin" />}
                MAÇI TAMAMLA ({scoreEntry.home}–{scoreEntry.away})
              </motion.button>
            )}
          </motion.div>
        )}

        <>
            {/* Kadro Durumu Mesajı */}
            {isAlreadyJoined && (
              <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}
                className="mb-4 flex items-center gap-3 bg-[#39FF14]/10 border border-[#39FF14]/20 rounded-2xl px-4 py-3">
                <CheckCircle2 size={16} className="text-[#39FF14] shrink-0" />
                <p className="text-xs font-bold text-[#39FF14]">
                  Kadroya alındın! Boş pozisyonlara <span className="font-black">+</span> basarak arkadaşlarını davet edebilirsin.
                </p>
              </motion.div>
            )}


        {/* ── Takım planı önizlemesi — yalnız atanan takımın üyeleri (L76) ── */}
        <TeamPlanBanner matchId={match.id} />

        {/* ── TAKTİK SAHA ─────────────────────────────────────────────────── */}
        <AnimatePresence mode="wait">
        <motion.div
          key={pitchSide}
          initial={{ opacity: 0, x: pitchSide === 'home' ? -18 : 18 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2, ease: 'easeOut' }}
          className="mb-6"
        >
          <div className="flex items-center justify-between mb-3 px-1">
            <div className="flex items-center gap-2">
              <div className={`w-1.5 h-1.5 rounded-full animate-pulse ${
                pitchSide === 'home'
                  ? 'bg-[#39FF14] shadow-[0_0_8px_rgba(57,255,20,0.9)]'
                  : 'bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.9)]'
              }`} />
              <p className="text-[10px] font-black text-white/50 uppercase tracking-[0.2em]">
                {pitchSide === 'home'
                  ? `${match.homeTeamName || homeTeam?.name || 'TAKIM'} Kadrosu`
                  : `${match.awayTeamName || awayTeam?.name || 'TAKIM'} Kadrosu`}
              </p>
            </div>
            {selectedSlotId && (
              <motion.span initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }}
                className={`text-[9px] font-black uppercase tracking-widest px-2.5 py-1 rounded-full border animate-pulse ${
                  pitchSide === 'home'
                    ? 'text-[#39FF14] bg-[#39FF14]/10 border-[#39FF14]/30'
                    : 'text-red-500 bg-red-500/10 border-red-500/30'
                }`}>
                Pozisyon Seçildi ✓
              </motion.span>
            )}
          </div>

          {/* Saha Kapsayıcısı */}
          <div className="relative w-full max-w-[380px] mx-auto rounded-[28px] overflow-hidden aspect-[3/4] border-4 border-[#161B22] shadow-[0_0_60px_rgba(0,0,0,0.8),inset_0_0_80px_rgba(0,0,0,0.6)]"
            style={{ background: '#0B2815' }}>

            {/* Çim desen (Studio.tsx stili dikey koyu çizgiler) */}
            <div className="absolute inset-0 opacity-15 pointer-events-none"
              style={{ backgroundImage: 'repeating-linear-gradient(90deg, transparent, transparent 8%, rgba(0,0,0,0.25) 8%, rgba(0,0,0,0.25) 16%)' }} />
            {/* Radyal ışık */}
            <div className="absolute inset-0 pointer-events-none"
              style={{ background: 'radial-gradient(ellipse at 50% 50%, rgba(57,255,20,0.08) 0%, transparent 75%)' }} />

            {/* Studio ile Aynı SVG Saha Çizgileri (viewBox="0 0 600 1000") */}
            <div className="absolute inset-0 pointer-events-none opacity-30">
              <svg viewBox="0 0 600 1000" preserveAspectRatio="none" className="w-full h-full" xmlns="http://www.w3.org/2000/svg">
                <g stroke="rgba(255,255,255,0.8)" strokeWidth="5" fill="none" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="10" y="10" width="580" height="980" />
                  <line x1="10" y1="500" x2="590" y2="500" />
                  <circle cx="300" cy="500" r="80" />
                  <circle cx="300" cy="500" r="5" fill="rgba(255,255,255,0.8)" />
                  {/* Üst Ceza Sahası */}
                  <rect x="150" y="10" width="300" height="160" />
                  <circle cx="300" cy="130" r="5" fill="rgba(255,255,255,0.8)" />
                  <path d="M 220 170 A 80 80 0 0 0 380 170" />
                  {/* Alt Ceza Sahası */}
                  <rect x="150" y="830" width="300" height="160" />
                  <circle cx="300" cy="870" r="5" fill="rgba(255,255,255,0.8)" />
                  <path d="M 220 830 A 80 80 0 0 1 380 830" />
                  {/* Köşe Yayları */}
                  <path d="M 10 40 A 30 30 0 0 0 40 10" />
                  <path d="M 560 10 A 30 30 0 0 0 590 40" />
                  <path d="M 10 960 A 30 30 0 0 1 40 990" />
                  <path d="M 590 960 A 30 30 0 0 0 560 990" />
                </g>
              </svg>
            </div>

            {/* SLOTLAR — Kanonik Koordinatlarla */}
            {(pitchSide === 'home' ? enrichedSlots : enrichedAwaySlots).map((slot) => {
              if (!slot) return null;
              const isSelected = selectedSlotIds.includes(slot.id) || selectedSlotId === slot.id;
              const isTaken = slot.status === 'TAKEN';
              const isOpen = slot.status === 'OPEN';
              const player = slot.player;
              const isMyOwnSlot = player?.id === currentUserProfile?.id;
              const inviteStatus = invitesSent[slot.id] || 'NONE';
              const invitedName = invitedFriendNames[slot.id];

              return (
                <div
                  key={slot.id}
                  className="absolute w-12 h-12 flex items-center justify-center z-10"
                  style={{ left: `${slot.x}%`, top: `${slot.y}%`, transform: 'translate(-50%, -50%)' }}
                >
                  {isTaken && player ? (
                    /* ── Dolu Slot ──────────────────────────────── */
                    <button
                      onClick={() => handleSlotClick(slot)}
                      className="w-full h-full rounded-full focus:outline-none cursor-pointer"
                    >
                      <motion.div whileHover={{ scale: 1.12 }} whileTap={{ scale: 0.93 }}
                        className="relative w-full h-full flex flex-col items-center justify-center">
                        <div className={`relative w-12 h-12 rounded-full overflow-hidden border-2 shadow-lg transition-all ${
                          isMyOwnSlot
                            ? 'border-[#39FF14] shadow-[0_0_16px_rgba(57,255,20,0.7)]'
                            : normalizeRole(slot.role) === 'GK'
                              ? 'border-orange-400 hover:shadow-[0_0_14px_rgba(249,115,22,0.6)]'
                              : 'border-white/25 hover:border-[#00f2fe] hover:shadow-[0_0_14px_rgba(0,242,254,0.5)]'
                        }`}>
                          {isRealPhoto(player.avatar) ? (
                            <img
                              src={player.avatar}
                              alt={player.name || 'Oyuncu'}
                              className="w-full h-full object-cover bg-[#0A0E14]"
                            />
                          ) : (
                            <div className={`w-full h-full flex items-center justify-center font-black text-[15px] tracking-tight ${
                              pitchSide === 'home'
                                ? 'bg-emerald-950/60 text-emerald-300 border border-emerald-500/20'
                                : 'bg-red-950/60 text-red-300 border border-red-500/20'
                            }`}>
                              {getInitials(player.name)}
                            </div>
                          )}
                          {isMyOwnSlot && (
                            <div className="absolute inset-0 bg-[#39FF14]/10" />
                          )}
                        </div>
                        <div className="absolute top-full left-1/2 transform -translate-x-1/2 mt-1.5 bg-black/90 backdrop-blur-sm px-2 py-0.5 rounded-full border border-white/10 shadow-md max-w-[64px] z-20 pointer-events-none">
                          <span className="text-[8px] font-black text-white whitespace-nowrap uppercase truncate block">
                            {isMyOwnSlot ? 'SEN' : (player.name || 'Oyuncu').split(' ')[0]}
                          </span>
                        </div>
                      </motion.div>
                    </button>
                  ) : isOpen ? (
                    inviteStatus === 'INVITED' ? (
                      /* ── Davet Gönderildi Slotu ────────────────── */
                      <button
                        onClick={() => handleSlotClick(slot)}
                        className="w-full h-full rounded-full focus:outline-none cursor-pointer"
                      >
                        <motion.div initial={{ scale: 0.8 }} animate={{ scale: 1 }}
                          className="relative w-full h-full flex flex-col items-center justify-center">
                          <div className="w-12 h-12 rounded-full border-2 border-orange-400/60 bg-orange-950/40 flex items-center justify-center shadow-[0_0_10px_rgba(251,146,60,0.3)]">
                            <Send size={14} className="text-orange-400" />
                          </div>
                          <div className="absolute top-full left-1/2 transform -translate-x-1/2 mt-1.5 bg-black/90 px-1.5 py-0.5 rounded-full border border-orange-400/30 max-w-[64px] z-20 pointer-events-none">
                            <span className="text-[7px] font-black text-orange-400 whitespace-nowrap truncate block">
                              {(invitedName || 'Davet').split(' ')[0]}
                            </span>
                          </div>
                        </motion.div>
                      </button>
                    ) : (
                      /* ── Açık Slot ──────────────────────────────── */
                      <button
                        onClick={() => handleSlotClick(slot)}
                        className="w-full h-full rounded-full focus:outline-none cursor-pointer"
                      >
                        <motion.div
                          whileHover={{ scale: 1.18 }}
                          whileTap={{ scale: 0.88 }}
                          className="relative w-full h-full flex flex-col items-center justify-center"
                        >
                          <div className={`w-12 h-12 rounded-full flex items-center justify-center border-2 shadow-lg transition-all duration-200 relative ${
                            isSelected
                              ? 'bg-[#39FF14] border-white text-black shadow-[0_0_28px_rgba(57,255,20,0.9)] scale-110'
                              : isAlreadyJoined
                                ? 'bg-black/50 border-white/20 text-white/40 hover:border-[#39FF14]/60 hover:bg-[#39FF14]/10 hover:text-[#39FF14] backdrop-blur-md'
                                : 'bg-black/50 border-white/25 text-white/60 hover:border-[#39FF14]/50 backdrop-blur-md'
                          }`}>
                            {isSelected ? (
                              <CheckCircle2 size={20} className="drop-shadow-md" />
                            ) : (
                              <>
                                <span className="text-[10px] font-black uppercase tracking-wider leading-none">
                                  { { 'GK': 'KL', 'DEF': 'SAV', 'MID': 'ORT', 'FWD': 'HÜC' }[normalizeRole(slot.role)] || 'ORT' }
                                </span>
                                <div className={`absolute -top-1 -right-1 w-4.5 h-4.5 rounded-full text-black flex items-center justify-center border border-black shadow-md z-20 ${
                                  isSelected ? 'bg-white' : 'bg-[#39FF14]'
                                }`}>
                                  <Plus size={10} strokeWidth={3} />
                                </div>
                              </>
                            )}
                          </div>
                          <div className="absolute top-full left-1/2 transform -translate-x-1/2 mt-1.5 bg-black/70 px-1.5 py-0.5 rounded-full border border-white/10 max-w-[64px] z-20 pointer-events-none">
                            <span className={`text-[7px] font-black uppercase truncate block whitespace-nowrap ${
                              isSelected ? 'text-[#39FF14]' : 'text-white/40'
                            }`}>
                              {isSelected ? 'SEÇİLDİ' : (isAlreadyJoined ? 'DAVET' : (
                                { GOALKEEPER: 'KAL', MIDFIELDER: 'ORT', DEFENDER: 'DEF', FORWARD: 'FOR' }[slot.role] ?? slot.role?.slice(0,3) ?? 'BOŞ'
                              ))}
                            </span>
                          </div>
                        </motion.div>
                      </button>
                    )
                  ) : (
                    /* ── Kilitli Slot ───────────────────────────── */
                    <div className="w-12 h-12 rounded-full bg-black/40 border border-white/10 flex items-center justify-center">
                      <X size={14} className="text-white/20" />
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <p className="text-center text-[9px] text-white/25 font-bold mt-3 uppercase tracking-[0.2em]">
            {isAlreadyJoined
              ? '+ butonuna basarak arkadaşlarını davet et'
              : 'Pozisyona dokun — ardından aşağıdan "Sahaya Çık"'}
          </p>

          {/* Yedek Kulübesi (Reserve List) */}
          <div className="mt-4 bg-[#161B22]/60 border border-white/5 rounded-3xl p-4 max-w-[380px] mx-auto shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]">
            <div className="flex items-center justify-between mb-3 px-1">
              <span className="text-[8px] font-black text-white/40 uppercase tracking-[0.25em]">
                Yedek Kulübesi ({match.reservePlayers?.length || 0})
              </span>
              {isAlreadyJoinedReserve && (
                <span className="text-[8px] font-black text-[#FACC15] uppercase tracking-widest animate-pulse">
                  Sıranız: {(match.reservePlayers || []).findIndex(p => p.id === currentUserProfile.id) + 1}
                </span>
              )}
            </div>
            {(!match.reservePlayers || match.reservePlayers.length === 0) ? (
              <p className="text-[9px] text-white/25 italic px-1">Yedek listesinde kimse yok. Sıra boş.</p>
            ) : (
              <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
                {match.reservePlayers.map((player, idx) => (
                  <div key={player.id} className="flex flex-col items-center gap-1 shrink-0 bg-black/40 border border-white/5 rounded-2xl p-2.5 min-w-[75px] relative overflow-hidden group">
                    <div className="relative">
                      <img src={player.avatar} alt={player.name} className="w-9 h-9 rounded-full object-cover border border-white/10" />
                      <div className="absolute -bottom-1 -right-1 w-4.5 h-4.5 rounded-full bg-amber-500 border border-black flex items-center justify-center text-[8px] font-black text-black">
                        {idx + 1}
                      </div>
                    </div>
                    <span className="text-[8px] font-bold text-white/70 truncate max-w-[65px]">{player.name.split(' ')[0]}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Taktik / Diziliş Seçimi (Yalnızca Kaptanlara Özel) */}
          {isManageMode && ((pitchSide === 'home' && isHomeCaptain) || (pitchSide === 'away' && isAwayCaptain)) && (
            <div className="mt-4 bg-[#161B22]/60 border border-white/5 rounded-3xl p-4 max-w-[380px] mx-auto">
              <span className="block text-[8px] font-black text-white/40 uppercase tracking-[0.25em] mb-2 px-1">
                TAKIM DİZİLİŞİNİ GÜNCELLE
              </span>
              <div className="flex gap-2 overflow-x-auto pb-1 custom-scrollbar">
                {Object.keys(FORMATIONS[pitchSide === 'home' ? squadSize : inferSquadSize(match.awaySlots?.length || match.slots.length)] || {}).map(fName => (
                  <button
                    key={fName}
                    onClick={async () => {
                      try {
                        setIsProcessing(true);
                        const sizeVal = pitchSide === 'home' ? squadSize : inferSquadSize(match.awaySlots?.length || match.slots.length);
                        const coords = FORMATIONS[sizeVal]?.[fName];
                        if (coords) {
                          // KN-3b taze-önce: diziliş koordinatları sunucudan
                          // çekilen TAZE kadro üstüne uygulanır (bayat match
                          // yazımı eşzamanlı katılanı ezmesin).
                          const base = (await getMatchDetails(match.id)) ?? match;
                          const mapCoords = (s: PositionSlot, index: number) => {
                            const coord = coords[index] || { x: 50, y: 50, role: 'MID' };
                            return {
                              ...s,
                              x: coord.x,
                              y: coord.y,
                              role: coord.role,
                              player: s.player ? { ...s.player, position: coord.role, x: coord.x, y: coord.y } : undefined
                            };
                          };
                          if (pitchSide === 'home') {
                            await updateMatch({ ...base, slots: (base.slots || []).map(mapCoords) });
                          } else {
                            await updateMatch({ ...base, awaySlots: (base.awaySlots || []).map(mapCoords) });
                          }
                          if (navigator.vibrate) navigator.vibrate(30);
                        }
                      } catch (err) {
                        console.error(err);
                        showActionError('Diziliş güncellenemedi. Lütfen tekrar dene.');
                      } finally {
                        setIsProcessing(false);
                      }
                    }}
                    className="px-3 py-1.5 rounded-xl bg-black/40 border border-white/10 hover:border-[#39FF14]/40 text-white hover:text-[#39FF14] text-[10px] font-black uppercase tracking-wider shrink-0 transition-all active:scale-95 cursor-pointer"
                  >
                    {fName}
                  </button>
                ))}
              </div>
            </div>
          )}
        </motion.div>
        </AnimatePresence>

        {/* ── KALECİ & HAKEM (Yalnız MANAGE + Maç Sahibi/Kaptan) ──────────────── */}
        {isManageMode && isCaptain && (
          <div className="space-y-3 mt-6">
            <p className="text-[9px] font-black text-white/40 uppercase tracking-[0.2em] ml-1">Kaleci & Hakem</p>

            <div className="grid grid-cols-2 gap-3">
              {(['GK', 'REF'] as ProviderType[]).map((type) => {
                const isGK = type === 'GK';
                const assignedId = isGK ? match.gkId : match.refereeId;
                const activeReq = getActiveRequestForType(type);
                const accent = isGK ? '#FF9F43' : '#A78BFA';
                const Icon = isGK ? Hand : Scale;
                const label = isGK ? 'Kaleci' : 'Hakem';
                // FAZ 2: atanmış sağlayıcı adı/avatarı gerçek goalkeepers/referees verisinden
                // (adminUsers güvenilmez); okunamıyorsa genel etikete düşer.
                const assignedProvider = isGK ? assignedGoalkeeper : assignedReferee;
                const providerName = assignedProvider?.name
                  || (assignedId ? (adminUsers || []).find(u => u?.id === assignedId)?.name : null)
                  || label;

                // 1) Atanmış sağlayıcı varsa onun bilgisini göster
                if (assignedId) {
                  return (
                    <div
                      key={type}
                      className="p-4 rounded-2xl bg-[#161B22]/80 border transition-all flex flex-col items-start gap-2.5 text-left relative group overflow-hidden"
                      style={{ borderColor: accent + '40' }}
                    >
                      <div className="absolute top-0 right-0 w-12 h-12 pointer-events-none"
                        style={{ background: `linear-gradient(to bottom left, ${accent}1a, transparent)` }} />
                      <div className="flex items-center gap-2">
                        {isRealPhoto(assignedProvider?.avatar) ? (
                          <img
                            src={assignedProvider!.avatar!}
                            alt={providerName}
                            className="w-9 h-9 rounded-xl object-cover border"
                            style={{ borderColor: accent + '60' }}
                          />
                        ) : (
                          <div className="w-9 h-9 rounded-xl flex items-center justify-center text-[11px] font-black border"
                            style={{ background: accent + '1a', color: accent, borderColor: accent + '40' }}>
                            {getInitials(providerName)}
                          </div>
                        )}
                        <div className="p-1.5 rounded-lg border" style={{ background: accent + '1a', color: accent, borderColor: accent + '33' }}>
                          <CheckCircle2 size={13} />
                        </div>
                      </div>
                      <div>
                        <h4 className="font-black text-xs text-white uppercase tracking-wider truncate max-w-[120px]">
                          {providerName}
                        </h4>
                        <p className="text-[8px] font-bold mt-0.5 uppercase tracking-wide" style={{ color: accent }}>
                          {label} Atandı
                        </p>
                      </div>
                    </div>
                  );
                }

                // 2) Bekleyen (PENDING/ACCEPTED/CAPTURED) talep varsa durum kartı
                if (activeReq) {
                  const statusLabel =
                    activeReq.status === 'PENDING' ? `${label} Talebi Bekliyor`
                    : activeReq.status === 'ACCEPTED' ? `${label} Onayladı`
                    : `${label} Atandı`;
                  return (
                    <div
                      key={type}
                      className="p-4 rounded-2xl bg-[#161B22]/80 border border-amber-500/30 flex flex-col items-start gap-2.5 text-left relative overflow-hidden"
                    >
                      <div className="absolute top-0 right-0 w-12 h-12 bg-gradient-to-bl from-amber-500/10 to-transparent pointer-events-none" />
                      <div className="p-2.5 rounded-xl bg-amber-500/10 text-amber-400 border border-amber-500/20">
                        <Clock size={16} className={activeReq.status === 'PENDING' ? 'animate-pulse' : ''} />
                      </div>
                      <div>
                        <h4 className="font-black text-xs text-white uppercase tracking-wider">{statusLabel}</h4>
                        <p className="text-[8px] text-white/40 font-bold mt-0.5 uppercase tracking-wide">
                          Ücret: {activeReq.fee}₺
                        </p>
                      </div>
                    </div>
                  );
                }

                // 3) Aksiyon butonu — Kaleci/Hakem Ekle
                return (
                  <motion.button
                    key={type}
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.97 }}
                    onClick={() => handleOpenProviderModal(type)}
                    className="p-4 rounded-2xl bg-[#161B22]/80 border border-white/5 transition-all flex flex-col items-start gap-2.5 text-left relative group overflow-hidden"
                    style={{ ['--accent' as any]: accent }}
                  >
                    <div className="absolute top-0 right-0 w-12 h-12 pointer-events-none"
                      style={{ background: `linear-gradient(to bottom left, ${accent}1a, transparent)` }} />
                    <div className="p-2.5 rounded-xl border transition-all"
                      style={{ background: accent + '1a', color: accent, borderColor: accent + '33' }}>
                      <Icon size={16} />
                    </div>
                    <div>
                      <h4 className="font-black text-xs text-white uppercase tracking-wider">{label} Ekle</h4>
                      <p className="text-[8px] text-white/40 font-bold mt-0.5 uppercase tracking-wide">
                        {isGK ? 'Sıralı Öneriden Seç' : 'Maça Hakem Ata'}
                      </p>
                    </div>
                  </motion.button>
                );
              })}
            </div>

            {/* Gelen sağlayıcı başvuruları — kaptan kabul/reddeder (kabulde ücret bloke) */}
            {providerApplications.length > 0 && (
              <div className="space-y-2 mt-1">
                <p className="text-[9px] font-black text-white/40 uppercase tracking-[0.2em] ml-1">Gelen Başvurular</p>
                {providerApplications.map((req) => {
                  const applicant = (adminUsers || []).find(u => u?.id === req.providerId);
                  const label = req.providerType === 'GK' ? 'Kaleci' : 'Hakem';
                  return (
                    <div key={req.id} className="p-3 rounded-2xl bg-[#161B22]/80 border border-white/8 flex items-center gap-3">
                      <img src={applicant?.avatar || `https://i.pravatar.cc/150?u=${req.providerId}`} alt="" className="w-9 h-9 rounded-xl object-cover border border-white/10" />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-black text-white truncate">{applicant?.name || label}</p>
                        <p className="text-[9px] text-white/40 font-bold uppercase tracking-wide">{label} · {req.fee}₺ blokaj</p>
                      </div>
                      <button onClick={() => handleDeclineApplication(req.id)} disabled={reqActionId === req.id}
                        className="px-2.5 py-1.5 rounded-lg text-[9px] font-black uppercase text-gray-400 border border-white/10 disabled:opacity-50">Reddet</button>
                      <button onClick={() => handleAcceptApplication(req.id)} disabled={reqActionId === req.id}
                        className="px-2.5 py-1.5 rounded-lg text-[9px] font-black uppercase text-black bg-green-400 disabled:opacity-50">Kabul</button>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Maç sonu: sağlayıcı geldi mi? kaptan onayı (iki-taraflı payout) */}
            {captainConfirmPending.length > 0 && (
              <div className="space-y-2 mt-1">
                <p className="text-[9px] font-black text-white/40 uppercase tracking-[0.2em] ml-1">Maç Sonu Onayı</p>
                {captainConfirmPending.map((req) => {
                  const applicant = (adminUsers || []).find(u => u?.id === req.providerId);
                  const label = req.providerType === 'GK' ? 'Kaleci' : 'Hakem';
                  return (
                    <div key={req.id} className="p-3 rounded-2xl bg-[#161B22]/80 border border-green-500/20 flex items-center gap-3">
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-black text-white truncate">{applicant?.name || label} geldi mi?</p>
                        <p className="text-[9px] text-white/40 font-bold uppercase tracking-wide">Onayınca ücret sağlayıcıya ödenir</p>
                      </div>
                      <button onClick={() => handleCaptainConfirm(req.id)} disabled={reqActionId === req.id}
                        className="px-3 py-1.5 rounded-lg text-[9px] font-black uppercase text-black bg-green-400 disabled:opacity-50">Onayla</button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ── MAÇ GÖREVLİLERİ (HERKESE görünür, salt-okunur) ──────────────────── */}
        {/* Atanmış kaleci/hakem gerçek verilerle; kaleci basınca dikey detay kartı. */}
        {(assignedGoalkeeper || assignedReferee) && (
          <div className="space-y-3 mt-6">
            <p className="text-[9px] font-black text-white/40 uppercase tracking-[0.2em] ml-1">Maç Görevlileri</p>

            {assignedGoalkeeper && (
              <button
                onClick={() => setProviderDetail({ p: assignedGoalkeeper, isRef: false })}
                className="w-full p-4 rounded-2xl bg-[#161B22]/80 border border-[#FF9F43]/30 flex items-center gap-3 text-left relative overflow-hidden active:scale-[0.99] transition-transform">
                <div className="absolute top-0 right-0 w-16 h-16 pointer-events-none" style={{ background: 'linear-gradient(to bottom left, rgba(255,159,67,0.14), transparent)' }} />
                <div className="relative shrink-0">
                  {isRealPhoto(assignedGoalkeeper.avatar) ? (
                    <img src={assignedGoalkeeper.avatar!} alt={assignedGoalkeeper.name} className="w-12 h-12 rounded-2xl object-cover border border-[#FF9F43]/50" />
                  ) : (
                    <div className="w-12 h-12 rounded-2xl flex items-center justify-center bg-orange-950/50 text-orange-300 border border-[#FF9F43]/40 font-black">
                      {getInitials(assignedGoalkeeper.name)}
                    </div>
                  )}
                  <div className="absolute -bottom-1 -right-1 p-1 rounded-lg bg-[#FF9F43] border-2 border-[#161B22]">
                    <Hand size={10} className="text-black" />
                  </div>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h4 className="text-sm font-black text-white uppercase tracking-tight truncate">{assignedGoalkeeper.name}</h4>
                    {assignedGoalkeeper.isElite && <Award size={12} className="text-[#FACC15] shrink-0" />}
                  </div>
                  <p className="text-[9px] font-black uppercase tracking-widest mt-0.5 text-[#FF9F43]">Kiralık Kaleci</p>
                  <div className="flex items-center gap-3 mt-1.5">
                    {assignedGoalkeeper.rating != null && (
                      <span className="flex items-center gap-1 text-[10px] font-black text-yellow-400"><Star size={10} fill="currentColor" />{assignedGoalkeeper.rating.toFixed(1)}</span>
                    )}
                    {assignedGoalkeeper.fee != null && (
                      <span className="text-[10px] font-black text-white/70">{assignedGoalkeeper.fee}₺</span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-1 text-[8px] font-black uppercase tracking-widest text-white/40 shrink-0">
                  Detay <ChevronRight size={13} />
                </div>
              </button>
            )}

            {/* Kaptan: kaleci maça gelmediyse no-show bildir (ceza → teminattan) */}
            {assignedGoalkeeper && isManageMode && isCaptain && capturedGkRequest && (
              <button
                onClick={() => setShowNoShowConfirm(true)}
                className="w-full py-2.5 rounded-2xl font-black text-[10px] uppercase tracking-widest text-red-400 bg-red-950/25 border border-red-500/20 active:scale-[0.99] transition-all flex items-center justify-center gap-1.5">
                <AlertCircle size={13} /> Kaleci Gelmedi (No-show)
              </button>
            )}

            {assignedReferee && (
              <button
                onClick={() => setProviderDetail({ p: assignedReferee, isRef: true })}
                className="w-full p-4 rounded-2xl bg-[#161B22]/80 border border-[#A78BFA]/30 flex items-center gap-3 text-left relative overflow-hidden active:scale-[0.99] transition-transform">
                <div className="absolute top-0 right-0 w-16 h-16 pointer-events-none" style={{ background: 'linear-gradient(to bottom left, rgba(167,139,250,0.14), transparent)' }} />
                <div className="relative shrink-0">
                  {isRealPhoto(assignedReferee.avatar) ? (
                    <img src={assignedReferee.avatar!} alt={assignedReferee.name} className="w-12 h-12 rounded-2xl object-cover border border-[#A78BFA]/50" />
                  ) : (
                    <div className="w-12 h-12 rounded-2xl flex items-center justify-center bg-violet-950/50 text-violet-300 border border-[#A78BFA]/40 font-black">
                      {getInitials(assignedReferee.name)}
                    </div>
                  )}
                  <div className="absolute -bottom-1 -right-1 p-1 rounded-lg bg-[#A78BFA] border-2 border-[#161B22]">
                    <Scale size={10} className="text-black" />
                  </div>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h4 className="text-sm font-black text-white uppercase tracking-tight truncate">{assignedReferee.name}</h4>
                    {assignedReferee.isElite && <Award size={12} className="text-[#FACC15] shrink-0" />}
                  </div>
                  <p className="text-[9px] font-black uppercase tracking-widest mt-0.5 text-[#A78BFA]">Atanan Hakem</p>
                  <div className="flex items-center gap-3 mt-1.5">
                    {assignedReferee.rating != null && (
                      <span className="flex items-center gap-1 text-[10px] font-black text-yellow-400"><Star size={10} fill="currentColor" />{assignedReferee.rating.toFixed(1)}</span>
                    )}
                    {assignedReferee.fee != null && (
                      <span className="text-[10px] font-black text-white/70">{assignedReferee.fee}₺</span>
                    )}
                    {assignedReferee.level && (
                      <span className="text-[9px] font-bold text-white/40 uppercase tracking-wide truncate">{assignedReferee.level}</span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-1 text-[8px] font-black uppercase tracking-widest text-white/40 shrink-0">
                  Detay <ChevronRight size={13} />
                </div>
              </button>
            )}
          </div>
        )}
      </>
  </main>

      {/* ── DİNAMİK NEON AKSİYON BARI ─────────────────────────────────── */}
      <div className="fixed bottom-0 left-0 w-full z-30 pointer-events-none">
        <div className="pointer-events-auto bg-gradient-to-t from-[#000] via-[#000]/96 to-transparent pt-14 pb-safe pb-4 px-5 border-t border-white/5">
          <div className="max-w-md mx-auto w-full">

            {isAlreadyJoined ? (
              /* ── Zaten Kadroya Girdim: Tamamlandı Görünümü ──────────── */
              <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                className="flex items-center justify-center gap-3 h-16 rounded-[24px] border border-[#39FF14]/20 bg-[#39FF14]/5">
                <CheckCircle2 size={20} className="text-[#39FF14]" />
                <span className="font-black text-sm text-[#39FF14] uppercase tracking-widest">KADRODASIN</span>
              </motion.div>
            ) : isAlreadyJoinedReserve ? (
              /* ── Zaten Yedek Kulübesindeyim ─────────────────────────── */
              (() => {
                const reserveIndex = (match.reservePlayers || []).findIndex(p => p.id === currentUserProfile.id);
                return (
                  <div className="flex gap-3 w-full">
                    <div className="flex-1 flex items-center justify-center gap-2 h-16 rounded-[24px] border border-amber-500/20 bg-amber-500/5">
                      <Clock size={16} className="text-amber-500 animate-pulse" />
                      <span className="font-black text-xs text-amber-500 uppercase tracking-widest">
                        YEDEK LİSTESİNDESİN (SIRA: {reserveIndex + 1})
                      </span>
                    </div>
                    <motion.button
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                      onClick={() => setShowLeaveConfirm(true)}
                      className="px-6 h-16 rounded-[24px] bg-red-500/10 border border-red-500/20 text-red-500 font-black text-xs uppercase tracking-widest hover:bg-red-500 hover:text-white transition-all cursor-pointer"
                    >
                      AYRIL
                    </motion.button>
                  </div>
                );
              })()
            ) : (() => {
              const activeSlots = pitchSide === 'home' ? (match.slots || []) : (match.awaySlots || []);
              const isActiveSideFull = activeSlots.length > 0 && activeSlots.every(s => s.status === 'TAKEN');
              
              if (isActiveSideFull) {
                return (
                  <motion.button
                    onClick={handleJoinAsReserve}
                    disabled={isProcessing}
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    className="w-full h-16 rounded-[24px] bg-amber-500 text-black font-black text-sm uppercase tracking-[0.2em] flex items-center justify-center gap-2 shadow-[0_0_25px_rgba(245,158,11,0.4)] cursor-pointer"
                  >
                    {isProcessing ? (
                      <Loader2 size={20} className="animate-spin" />
                    ) : (
                      <>
                        <Clock size={18} />
                        <span>YEDEK OLARAK GİR</span>
                      </>
                    )}
                  </motion.button>
                );
              }

              if (!isCaptain && selectedSlotIds.length > 0) {
                const unitPrice = Number((match as any).price) || 0;
                const total = selectedSlotIds.length * unitPrice;
                return (
                  <motion.button
                    disabled={isProcessing}
                    onClick={handleBuySlots}
                    whileTap={{ scale: 0.96 }}
                    className="w-full h-16 rounded-[24px] font-black text-sm uppercase tracking-[0.12em] flex items-center justify-center gap-2 transition-all cursor-pointer text-black"
                    style={{ background: 'linear-gradient(135deg, #FACC15 0%, #39FF14 100%)', boxShadow: '0 0 35px rgba(57,255,20,0.6), 0 0 70px rgba(250,204,21,0.4), inset 0 1px 0 rgba(255,255,255,0.4)' }}
                  >
                    {isProcessing ? (
                      <><Loader2 size={20} className="animate-spin" /><span>ÖDENİYOR...</span></>
                    ) : (
                      <><span>{selectedSlotIds.length} SLOT · ₺{total.toLocaleString('tr-TR')}</span><span className="opacity-60">·</span><span>ÖDE VE KATIL</span><ChevronRight size={18} /></>
                    )}
                  </motion.button>
                );
              }

              if (selectedSlotId) {
                if (isCaptain) {
                  return (
                    <div className="flex gap-3">
                      {/* Sahaya Çık */}
                      <motion.button
                        onClick={handleJoin}
                        disabled={isProcessing}
                        animate={{ scale: [1, 1.015, 1] }}
                        transition={{ repeat: Infinity, duration: 2.2, ease: 'easeInOut' }}
                        whileTap={{ scale: 0.95 }}
                        className="w-[60%] h-16 rounded-[22px] font-black text-sm uppercase tracking-[0.15em] flex items-center justify-center gap-2 transition-all text-black cursor-pointer"
                        style={{
                          background: 'linear-gradient(135deg, #FACC15 0%, #39FF14 100%)',
                          boxShadow: '0 0 35px rgba(57,255,20,0.6), 0 0 70px rgba(250,204,21,0.4), inset 0 1px 0 rgba(255,255,255,0.4)',
                        }}>
                        {isProcessing ? <Loader2 size={18} className="animate-spin" /> : <><span>SAHAYA ÇIK</span><ChevronRight size={17} /></>}
                      </motion.button>
                      {/* Oyuncu Ekle */}
                      <motion.button
                        onClick={() => {
                          setInviteModalSlotId(selectedSlotId);
                        }}
                        whileHover={{ scale: 1.03 }}
                        whileTap={{ scale: 0.95 }}
                        className="w-[40%] h-16 rounded-[22px] font-black text-xs uppercase tracking-[0.1em] flex items-center justify-center gap-1.5 text-white transition-all cursor-pointer"
                        style={{
                          background: 'linear-gradient(135deg, rgba(0,242,254,0.15) 0%, rgba(79,172,254,0.10) 100%)',
                          border: '1px solid rgba(0,242,254,0.3)',
                          boxShadow: '0 0 20px rgba(0,242,254,0.25)',
                        }}>
                        <UserPlus size={15} />
                        <span>OYUNCU</span>
                      </motion.button>
                    </div>
                  );
                }

                return (
                  <motion.button
                    disabled={isProcessing}
                    onClick={handleJoin}
                    animate={{ scale: [1, 1.018, 1] }}
                    transition={{ repeat: Infinity, duration: 2, ease: 'easeInOut' }}
                    whileTap={{ scale: 0.95 }}
                    className="w-full h-16 rounded-[24px] font-black text-sm uppercase tracking-[0.2em] flex items-center justify-center gap-3 transition-all duration-400 cursor-pointer"
                    style={{
                      background: 'linear-gradient(135deg, #FACC15 0%, #39FF14 100%)',
                      boxShadow: '0 0 35px rgba(57,255,20,0.6), 0 0 70px rgba(250,204,21,0.4), inset 0 1px 0 rgba(255,255,255,0.4)',
                      color: '#000',
                      border: 'none',
                    }}>
                    {isProcessing ? (
                      <><Loader2 size={20} className="animate-spin" /><span>KAYIT EDİLİYOR...</span></>
                    ) : (
                      <><span>SAHAYA ÇIK</span><ChevronRight size={20} /></>
                    )}
                  </motion.button>
                );
              }

              // Pozisyon seçilmedi ve saha dolu değil → tam genişlikte "pozisyon seç" ipucu.
              // (Boş yer varken yedek girişi yok; yedek yalnız saha tamamen dolunca açılır.)
              return (
                <div className="w-full h-16 rounded-[24px] bg-white/[0.02] border border-dashed border-white/20 text-white/40 font-black text-xs uppercase tracking-widest flex items-center justify-center gap-2">
                  <Zap size={13} className="text-white/20" />
                  <span>POZİSYON SEÇ</span>
                </div>
              );
            })()}
          </div>
        </div>
      </div>

      {/* ── MAP MODAL (SAHA KONUMU) ── */}
      <AnimatePresence>
        {showMapModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="w-full max-w-md bg-[#0A0E14] border border-white/10 rounded-3xl overflow-hidden shadow-2xl relative"
            >
              <div className="px-5 py-4 border-b border-white/5 flex items-center justify-between bg-black/20">
                <h3 className="text-sm font-black text-white italic uppercase flex items-center gap-2">
                  <MapPin size={16} className="text-[#39FF14]" />
                  {match?.location} KONUMU
                </h3>
                <button onClick={() => setShowMapModal(false)} className="w-8 h-8 rounded-full bg-white/5 flex items-center justify-center text-white/50 hover:bg-white/10 transition-colors">
                  <X size={16} />
                </button>
              </div>
              <div className="h-64 relative">
                <style>{AIRBNB_MAP_CSS}</style>
                {pitchCoordinates ? (
                  <MapContainer center={pitchCoordinates} zoom={15} className="w-full h-full" {...oynaMapProps}>
                      <TileLayer url={OYNA_TILE_URL} {...oynaTileProps} />
                      <ChangeView center={pitchCoordinates} />
                      <Marker position={pitchCoordinates}>
                          <Popup closeButton={false}>
                              <div className="bg-[#161B22]/90 backdrop-blur-md p-3 rounded-2xl border border-white/10 shadow-xl text-center min-w-[120px]">
                                  <h4 className="text-white font-black text-[10px] uppercase tracking-widest mb-1">{match?.location}</h4>
                                  <a href={`https://www.google.com/maps/dir/?api=1&destination=${pitchCoordinates[0]},${pitchCoordinates[1]}`} target="_blank" rel="noreferrer" className="inline-block mt-2 px-3 py-1.5 bg-[#39FF14]/20 border border-[#39FF14]/50 text-[#39FF14] text-[9px] font-black uppercase rounded-lg">Yol Tarifi Al</a>
                              </div>
                          </Popup>
                      </Marker>
                  </MapContainer>
                ) : (
                  <div className="w-full h-full flex flex-col items-center justify-center gap-2 px-6 text-center bg-black/20">
                    <MapPin size={28} className="text-white/20" />
                    <p className="text-white/70 text-xs font-black uppercase tracking-wide">Konum bilgisi henüz eklenmemiş</p>
                    <p className="text-white/40 text-[10px] leading-relaxed">Saha sahibi konum bilgisini ekleyince harita ve yol tarifi burada görünecek.</p>
                  </div>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Detaylı Maç Bilgileri Modalı ─────────────────────────────────── */}
      <AnimatePresence>
        {showInfoModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/85 backdrop-blur-xl flex items-end justify-center"
            onClick={() => setShowInfoModal(false)}
          >
            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 28, stiffness: 280 }}
              onClick={e => e.stopPropagation()}
              className="bg-[#0A0E14] border-t border-white/10 w-full max-w-lg rounded-t-[40px] shadow-[0_-20px_50px_rgba(0,0,0,0.8)]"
            >
              {/* Başlık */}
              <div className="flex items-center justify-between px-6 pt-7 pb-5">
                <div>
                  <p className="text-[9px] font-black text-white/30 uppercase tracking-[0.3em] mb-0.5">{activePitch.name}</p>
                  <h2 className="text-base font-black text-white uppercase italic tracking-tight">MAÇ ÖZELLİKLERİ</h2>
                </div>
                <button
                  onClick={() => setShowInfoModal(false)}
                  className="w-9 h-9 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-white/50 hover:text-white transition-colors"
                >
                  <X size={16} />
                </button>
              </div>

              {/* Özellikler Listesi */}
              <div className="px-6 pb-2">
                <div className="bg-black/30 border border-white/5 rounded-2xl overflow-hidden divide-y divide-white/5">
                  <div className="flex items-center justify-between px-4 py-4">
                    <span className="text-[11px] font-black text-white/40 uppercase tracking-wider">FORMAT</span>
                    <span className="text-sm font-black text-white uppercase italic">{match.format || '7v7'}</span>
                  </div>
                  <div className="flex items-center justify-between px-4 py-4">
                    <span className="text-[11px] font-black text-white/40 uppercase tracking-wider">YAŞ GRUBU</span>
                    <span className="text-sm font-black text-white uppercase italic">{match.ageGroup || ageLimit}</span>
                  </div>
                  <div className="flex items-center justify-between px-4 py-4">
                    <span className="text-[11px] font-black text-white/40 uppercase tracking-wider">CİNSİYET</span>
                    <span className="text-sm font-black text-white uppercase italic">{match.gender || genderRule}</span>
                  </div>
                  <div className="flex items-center justify-between px-4 py-4">
                    <span className="text-[11px] font-black text-white/40 uppercase tracking-wider">OYUN SERTLİĞİ</span>
                    <span className={`text-sm font-black uppercase italic ${
                      match.difficulty === 'Ciddi' ? 'text-red-400' :
                      match.difficulty === 'Taktiksel' ? 'text-[#FACC15]' : 'text-[#39FF14]'
                    }`}>{match.difficulty}</span>
                  </div>
                  <div className="flex items-center justify-between px-4 py-4">
                    <span className="text-[11px] font-black text-white/40 uppercase tracking-wider">KATILIM ÜCRETİ</span>
                    <span className={`text-sm font-black uppercase italic ${match.price > 0 ? 'text-[#39FF14]' : 'text-white/50'}`}>
                      {match.price > 0 ? `${match.price} ₺` : 'ÜCRETSİZ'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Kapat */}
              <div className="px-6 pt-4 pb-10">
                <button
                  onClick={() => setShowInfoModal(false)}
                  className="w-full py-3.5 rounded-2xl bg-white/5 border border-white/8 font-black text-xs uppercase tracking-widest text-white/50 hover:text-white hover:bg-white/10 transition-all active:scale-95"
                >
                  Kapat
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {actionError && <Toast message={actionError} variant="error" />}
        {actionSuccess && <Toast message={actionSuccess} variant="success" />}
      </AnimatePresence>

    </div>
  );
};

// ─── Arkadaş Satır Bileşeni ───────────────────────────────────────────────────

const FriendInviteRow: React.FC<{ friend: any; onInvite: () => void }> = ({ friend, onInvite }) => (
  <motion.button
    whileHover={{ scale: 1.01, x: 2 }}
    whileTap={{ scale: 0.98 }}
    onClick={onInvite}
    className="w-full bg-[#161B22] border border-white/5 rounded-2xl p-3.5 flex items-center justify-between transition-all hover:border-[#39FF14]/20 hover:bg-white/[0.02] group"
  >
    <div className="flex items-center gap-3">
      <div className="relative">
        <img src={friend.avatar || `https://i.pravatar.cc/150?u=${friend.id}`}
          alt={friend.name} className="w-11 h-11 rounded-full object-cover bg-[#0A0E14] border border-white/10" />
        <div className={`absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full border-2 border-[#161B22] ${friend.online ? 'bg-[#39FF14]' : 'bg-white/20'}`} />
      </div>
      <div className="text-left">
        <p className="text-sm font-bold text-white leading-tight">{friend.name}</p>
        <div className="flex items-center gap-2 mt-0.5">
          <span className="text-[9px] font-black px-1.5 py-0.5 rounded bg-white/5 text-white/40 uppercase tracking-widest">
            {friend.pos || friend.position || 'OYUNCU'}
          </span>
          {friend.fp && (
            <span className="text-[9px] font-bold text-yellow-400 flex items-center gap-0.5">
              <Star size={8} className="fill-current" /> {friend.fp}
            </span>
          )}
        </div>
      </div>
    </div>
    <div className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl font-black text-xs uppercase tracking-widest transition-all bg-[#39FF14]/5 border border-[#39FF14]/15 text-[#39FF14] group-hover:bg-[#39FF14]/15 group-hover:border-[#39FF14]/40 group-hover:shadow-[0_0_12px_rgba(57,255,20,0.25)]">
      <Send size={11} />
      <span>Davet</span>
    </div>
  </motion.button>
);

export default MatchJoin;
