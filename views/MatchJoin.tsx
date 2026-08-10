import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { Spinner } from '../components/ui/Spinner';
import { useMacParaBilgisi } from '../hooks/useMacParaBilgisi';
import { useMacSaglayicilari } from '../hooks/useMacSaglayicilari';
import { useMacKadrosu } from '../hooks/useMacKadrosu';
import {
  ArrowLeft, MapPin, Clock, Calendar, Zap, Hand, Scale,
  X, Loader2, ChevronRight, UserPlus,
  Plus, CheckCircle2, Users, Star,
  AlertCircle, Shield, Layers, Award,
  DollarSign, Info, KeyRound, Copy, Ruler, Activity, Wallet, CreditCard, Lock,
  Megaphone
} from 'lucide-react';
import { broadcastOpenSlot } from '../services/socialService';
import {
  isOnline, OFFLINE_JOIN, OFFLINE_FORMATION, TIMEOUT_JOIN,
  withSubmitTimeout, SubmitTimeoutError, RPC_TIMEOUT_MS,
} from '../shared/submitGuard';
import { motion, AnimatePresence } from 'framer-motion';
import { MatchListing, PositionSlot, UserRole, Player, Team, ProviderType, ProviderSuggestion, ServiceRequest } from '../types';
import { useAppStore } from '../store';
import { pushIzniZamaniGeldi } from '../notifications/pushIzniKapisi';
import { auth } from '../supabaseAuth';
import { supabase } from '../supabaseClient';
import { subscribeToMatchUpdates, getMatchDetails, getPitchCoordinates, getMatchLobbyParticipants, getFriendPlayerCard, getMatchProviders, getMyMatchPrivateCode, selfAssignSlot, assignSlotToFriend, unassignSlot, releaseSlot, kickSlot, updateFormationRpc, leaveMatchSlot, leaveQuoteMessage, iadeKademesiCumlesi, type LobbyParticipant, type FriendPlayerCard, type MatchProvider } from '../services/matchService';
import { sendFriendRequest } from '../services/friendService';
import MatchSquadPicker, { type PickedPlayer } from '../components/social/MatchSquadPicker';
import { getMatchTacticProposals, proposeMatchTactic, listMyTacticsLite, type MatchTacticProposal, type MyTacticLite } from '../services/tacticSocialService';
import { findProvidersForMatch, createServiceRequest, getMatchServiceRequests, acceptProviderApplication, declineProviderApplication, captainConfirmService, fundServiceRequest, captainReportNoShow } from '../services/serviceRequestService';
import { checkMatchThreshold, cancelMatchByCaptain } from '../services/matchLifecycleService';
import { formatTRYAmount, formatTRYShort } from '../utils/formatTRY';

// IP-19 — para tek biçimde: "2.000₺", kuruş varsa "299,90₺", değer yoksa "—".
// `money` muhasebe bağlamı (sıfır = "0₺"); saha fiyatı gibi FİYAT alanlarında
// `formatTRYShort` kullanılır, orada sıfır "Ücretsiz" demektir.
const money = formatTRYAmount;
import { showToast } from '../components/common/GlobalToast';
import { FORMATIONS as FORMATIONS_SSOT, type SquadSize } from '../utils/formations';
import { providerStyles } from '../shared/providerStyles';
import { playStyleMetaForDifficulty } from './onboarding/onboardingShared';
import TeamPlanBanner from '../components/social/TeamPlanBanner';
// Tek kaynak lobi mantığı — admin paneli (MatchLobbyPitch) ile AYNI fonksiyonlar (drift yok).
import { normalizeRole, inferSquadSize, applyCanonicalCoords, resolveGkVisibility, findHiredGkSlotId } from '../shared/lobbyEnrichment';
import { formatMatchDuration } from '../shared/matchTiming';
import { PLAY_STYLE_META } from './onboarding/onboardingShared';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { OYNA_TILE_URL, oynaTileProps, oynaMapProps, OYNA_MAP_CSS } from '../components/map/mapBase';
import { Toast } from '../components/common/Toast';
import { mapError } from '../utils/errorMap';
import { trUpper } from '../utils/trUpper';
import { olayYaz } from '../utils/olcum';

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

// ─── Formasyonlar: tek kanonik kaynak (utils/formations.ts) ────────────────
const FORMATIONS = FORMATIONS_SSOT as Record<string, Record<string, { x: number; y: number; role: string }[]>>;

// (Geri bildirim turu) Skor girişi ve LIVE panel KALDIRILDI — maçlar saati
// geçince zaman bazlı olarak otomatik 'Geçmiş'e düşer; skor kavramı yok.

// Kanonik koordinat atayıcı artık shared/lobbyEnrichment'tan gelir (admin ile tek kaynak).
// (checkAndGetStatus + fillVacatedSlot kaldırıldı — F1.8: kick artık sunucuda,
// player_kick_slot RPC'si; statü/terfi hesabının client kopyası kalmadı.)

// ─── Difficulty Badge Renk Sistemi — TEK KAYNAK: PLAY_STYLE_META ────────────
// Glow, kanonik renkten %40 alfa ile türetilir (yeni renk kopyası üretmez).
const difficultyConfig: Record<string, { color: string; glow: string; label: string }> = Object.fromEntries(
  (['Ciddi', 'Taktiksel', 'Rahat'] as const).map((d) => {
    const meta = playStyleMetaForDifficulty(d)!;
    return [d, { color: meta.color, glow: `${meta.color}66`, label: meta.label.toLocaleUpperCase('tr-TR') }];
  }),
);

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
  // IP-09: kalite notu bir KATEGORİdir, durum değil — harf zaten "A/B/C" yazıyor.
  // Ayrım renkte değil, parlaklık merdiveninde: A > B > C.
  if (grade.startsWith('A')) return 'text-ink';
  if (grade.startsWith('B')) return 'text-ink-3';
  return 'text-ink-4';
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

// Sağlayıcının TARZLARI — "REFLEKSLER 87 / DALIŞ 84" reyting çubuklarının yerine.
//
// Kurucu kararı (2026-08-06): o çubukların arkasında ölçüm yoktu. Kaleci kendi
// ekranından giremiyor, oyuncu oyu beslemiyordu; tek kaynak yönetim panelinde
// elle yazılmış tohum veriydi. Kaptan, kiralayacağı kaleciye bakarken ölçmediğimiz
// bir sayıya güveniyordu. Artık sağlayıcının KENDİ seçtiği, kapalı listeden gelen
// en fazla iki tarz gösteriliyor (shared/providerStyles.ts + veritabanı kısıtı).
const extractProviderStyles = (
  provider: unknown,
  isRef?: boolean,
): string[] => providerStyles(isRef ? 'REF' : 'GK', provider);

// Dolu slotların KİMLİĞİNİ tazeler (public_profiles) — occupant/player.id birebir.
// Eski sıralı-kuyruk tahmini KALDIRILDI: occupant'sız TAKEN slot artık REZERVE'dir
// ("DOLU" çizilir) ve asla alakasız bir katılımcıyla doldurulmaz.
const enrichSideSlots = (
  slots: PositionSlot[],
  sideParticipants: LobbyParticipant[],
  defaultPay: 'PAID' | 'UNPAID',
): PositionSlot[] => {
  const canonical = applyCanonicalCoords(slots || []);
  const byId = new Map(sideParticipants.map(p => [p.userId, p]));
  return canonical.map(slot => {
    if (!slot || slot.status !== 'TAKEN') return slot;
    const pid = (slot as any).occupant || slot.player?.id;
    if (!pid) return slot; // REZERVE — kimliksiz, sahada "DOLU" kapsülü çizilir
    const prof = byId.get(pid);
    const orig: any = slot.player || {};
    return {
      ...slot,
      player: {
        id: pid,
        name: prof?.name || orig.name || 'Oyuncu',
        avatar: (prof ? prof.avatarUrl : orig.avatar) || '',
        selfSkill: prof?.selfSkill ?? orig.selfSkill ?? null,
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
  // ÖLÇÜM · oyuncu hunisi 2/5 — "bir maçın detayına girdi". `tekrarlanabilir`:
  // kullanıcı listeye dönüp başka bir maç açarsa bu gerçek bir adımdır.
  useEffect(() => { olayYaz('oyuncu_mac_acildi', { tekrarlanabilir: true }); }, []);
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
  // Çoklu slot satın alma seçimi — HERKES için tek akış (kurucu dahil). Ödeme = adet × ücret.
  const [selectedSlotIds, setSelectedSlotIds] = useState<string[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  // SENKRON kilit. isProcessing bir React STATE'i: ikinci dokunuş commit'ten
  // önce gelirse hâlâ eski (false) değeri okur ve handler ikinci kez çalışır
  // (BULGU-050). writeBusyRef commit beklemez.
  const writeBusyRef = useRef(false);
  // IP-06: "Eksik oyuncu ilanı ver" gönderimi sürerken buton kilitli.
  const [broadcasting, setBroadcasting] = useState(false);
  const broadcastBusyRef = useRef(false);
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

  /** Yazma handler'ları için tek giriş kapısı: senkron kilit + çevrimiçi kontrolü.
   *  `cevrimdisiMesaji` akışa göre değişir (katılım / diziliş). */
  const beginWrite = (cevrimdisiMesaji: string = OFFLINE_JOIN): boolean => {
    if (writeBusyRef.current) return false;
    if (!isOnline()) { showActionError(cevrimdisiMesaji); return false; }
    writeBusyRef.current = true;
    return true;
  };
  const endWrite = () => { writeBusyRef.current = false; };

  /**
   * Yanıt penceresi: yarı-kopuk ağda (istek gidiyor, yanıt gelmiyor) lobi
   * "işleniyor" hâlinde SÜRESİZ kilitli kalıyordu. withSubmitTimeout isteği
   * İPTAL ETMEZ — sunucuda tamamlanmış olabilir; bu yüzden zaman aşımında
   * kullanıcıya "yerin ayrılmış olabilir, ekranı yenile" denir ve lobi tazelenir.
   */
  // NOT: supabase sorgu nesneleri gerçek Promise DEĞİL, "thenable"dır; bu yüzden
  // PromiseLike alıp Promise.resolve ile gerçek Promise'e çeviriyoruz (bu aynı
  // zamanda tembel duran sorguyu çalıştırır).
  const rpcPencere = <T,>(p: PromiseLike<T>): Promise<T> =>
    withSubmitTimeout(Promise.resolve(p), RPC_TIMEOUT_MS);

  /** Zaman aşımını handler'ların genel hata mesajından ayırır (o mesajlar
   *  "işlem yapılmadı" ima eder — burada yapılmış OLABİLİR). */
  const zamanAsimiIsePaylas = (e: unknown): boolean => {
    if (!(e instanceof SubmitTimeoutError)) return false;
    showActionError(TIMEOUT_JOIN);
    void macTazele();
    return true;
  };

  // Taktik Kenarı — saha tarafı + ilk açılışta otomatik taraf seçimi (bir kez)
  const [pitchSide, setPitchSide] = useState<'home' | 'away'>('home');
  const [hasAutoSelectedSide, setHasAutoSelectedSide] = useState(false);
  // Sahadaki dolu slotları gerçek oyuncularla doldurmak için (RLS-güvenli public_profiles).

  // Dolu slota basınca açılan sade oyuncu bilgi kartı
  const [activePlayerSlotId, setActivePlayerSlotId] = useState<string | null>(null);
  // Sade oyuncu kartı verisi (arkadaş-kapılı; tıklamada get_friend_player_card ile çekilir)
  const [playerCard, setPlayerCard] = useState<FriendPlayerCard | null>(null);
  const [playerCardLoading, setPlayerCardLoading] = useState(false);
  const [friendRequestSent, setFriendRequestSent] = useState(false);

  // Rezerve slot doldurma sayfası (MANAGE): Kendimi Ekle / Arkadaş / Kod / İade
  const [fillSlot, setFillSlot] = useState<PositionSlot | null>(null);
  // Arkadaş atama seçicisi hangi slottan açıldı (GERÇEK friendships verisi)
  const [assignPickerSlotId, setAssignPickerSlotId] = useState<string | null>(null);
  const [removeConfirmSlot, setRemoveConfirmSlot] = useState<PositionSlot | null>(null);
  // Özel maç kodu — satırda değil; kurucuya SECURITY DEFINER RPC ile gelir (P1)
  const [privateCode, setPrivateCode] = useState<string | null>(null);
  // Taktik önerileri (kişi başı 1 — YALNIZ Maçlarım lobisinde)
  const [tacticProposals, setTacticProposals] = useState<MatchTacticProposal[]>([]);
  const [showTacticPicker, setShowTacticPicker] = useState(false);
  const [myTactics, setMyTactics] = useState<MyTacticLite[]>([]);

  // Maçtan Ayrıl
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false);
  // B4: Kaptanın maçı iptali (yalnız MANAGE lobisinde görünür)
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  // IP-04 — ayrılma sözleşmesi (SUNUCUDAN; gerçek iadeyle birebir aynı kaynak).
  // Tek sayı değil nesne: "0 iade" ile "hesaplanamadı" ayrı sonuçlar, ikisi de
  // sessiz kalmamalı (BULGU-087).
  // Sahanın kendi iptal/iade saatleri. Panelden değiştirilebildiği için ekranda
  // sabit sayı yazılamaz; sunucudan gelene kadar sunucu varsayılanı gösterilir.

  // (Rakip davet/katıl modalları kaldırıldı — lobi sadeleştirmesi)

  // ── FAZ 5: Kaleci / Hakem Talep Akışı ────────────────────────────────────
  const [providerModalType, setProviderModalType] = useState<ProviderType | null>(null);
  const [providerSuggestions, setProviderSuggestions] = useState<ProviderSuggestion[]>([]);
  const [providersLoading, setProvidersLoading] = useState(false);
  const [providerSubmittingId, setProviderSubmittingId] = useState<string | null>(null);
  // FAZ 3: pazarda seçilen sağlayıcının dikey detaylı kartı (yetenek barları + istatistik)
  const [marketDetailProvider, setMarketDetailProvider] = useState<ProviderSuggestion | null>(null);

  // FAZ 2: maça ATANMIŞ kaleci/hakem. Hakem lobide HERKESE gösterilir; kaleci
  // ise YALNIZ kiralayan tarafın üyelerine. İki taraflı: ev sahibi + deplasman
  // kalecisi ayrı ayrı tutulur (her takım kendi kalecisini kiralar).
  // Atanmış kaleci/hakem dikey detay kartı (herkese) — hangi sağlayıcı + tür.
  const [providerDetail, setProviderDetail] = useState<{ p: MatchProvider; isRef: boolean } | null>(null);
  const [showNoShowConfirm, setShowNoShowConfirm] = useState(false);

  const [showMapModal, setShowMapModal] = useState(false);
  const [pitchCoordinates, setPitchCoordinates] = useState<[number, number] | null>(null);

  // ── Store ─────────────────────────────────────────────────────────────────
  const {
    adminUsers, applyMatchLocal,
    userTeams, setStudioContext, navigateTo,
    setNewMatchBadge, lobbyMode, currentUserProfile: storeCurrentUserProfile
  } = useAppStore();
  // MANAGE = Maçlarım hub'ından; yönetim aksiyonları yalnız burada görünür.
  const isManageMode = lobbyMode === 'MANAGE';

  // ── [K-15.1] TEK TAZELEME NOKTASI ─────────────────────────────────────────
  // Bir aksiyon sunucuda maçı değiştirdikten sonra taze hâli çekilip YEREL
  // uygulanır (DB'ye geri YAZILMAZ — KN-3b). Bu iki satır dosyada 14 AYRI
  // yerde birebir tekrar ediyordu; Kıdemli Yazılım Mühendisi turunun bulgusu
  // buydu (PE-1). Tek yere indirildi: davranış aynı, tekrar bitti.
  const macTazele = useCallback(async () => {
    if (!match?.id) return null;
    const fresh = await macTazele();
    return fresh;
  }, [match?.id, applyMatchLocal]);

  // ── [K-15.1] PARA ALANI ayri dosyada: hooks/useMacParaBilgisi.ts ─────────
  // Iptal politikasi + ayrilma iade onizlemesi. K-3.3 ve K-1.1 kararlari
  // buraya dokunacak; o yuzden kendi dosyasinda.
  const { iptalPolitikasi, leaveQuote, leaveQuoteLoading } =
    useMacParaBilgisi(match?.id, showLeaveConfirm);

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

  // Sahanın iptal/iade saatleri — saha sahibi ya da admin panelden değiştirince
  // lobideki her cümle (kaptan iptali, ödeme notu) o an geçerli sayıyı gösterir.

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
        homeScore: (updatedMatch as any).home_score || (updatedMatch as any).homeScore,
        awayScore: (updatedMatch as any).away_score || (updatedMatch as any).awayScore,
        scoreEnteredAt: (updatedMatch as any).score_entered_at || (updatedMatch as any).scoreEnteredAt,
        // FAZ 3 çekirdeği — realtime'da da koru
        visibility: (updatedMatch as any).visibility || (originalMatch as any).visibility || 'OPEN',
        privateCode: (updatedMatch as any).private_code || (updatedMatch as any).privateCode || (originalMatch as any).privateCode,
        pitchId: (updatedMatch as any).pitch_id || (updatedMatch as any).pitchId || (originalMatch as any).pitchId,
        // İki taraflı kaleci — realtime'da da taraf kolonlarını taşı
        gkId: (updatedMatch as any).gk_id ?? (updatedMatch as any).gkId ?? (originalMatch as any).gkId,
        awayGkId: (updatedMatch as any).away_gk_id ?? (updatedMatch as any).awayGkId ?? (originalMatch as any).awayGkId,
        refereeId: (updatedMatch as any).refereeId ?? (updatedMatch as any).ref_id ?? (originalMatch as any).refereeId,
      };
      // KN-3a: realtime SALT-OKUR — gelen veri DB'ye GERİ YAZILMAZ.
      // (Eski updateMatch çağrısı her tick'te player_update_match tetikleyip
      // yankı döngüsü + eşzamanlı katılımcıları ezme üretiyordu.)
      applyMatchLocal({ ...originalMatch, ...mapped } as MatchListing);
    }, () => {
      // Kopukluk telafisi: soket düşerken gelen slot değişimleri bir daha
      // yayınlanmaz — lobide dolu bir mevki BOŞ görünür ve oyuncu var olmayan
      // yere katılmaya kalkar. Yeniden bağlanınca yetkili satırı baştan çekeriz
      // (hidrasyonla aynı SALT-OKUR yol).
      getMatchDetails(originalMatch.id).then((full) => {
        if (full) applyMatchLocal({ ...originalMatch, ...full } as MatchListing);
      }).catch(() => { /* telafi en-iyi-çaba */ });
    });
    return () => { unsubscribe(); };
  }, [originalMatch?.id]);

  // ── FAZ 5: Maçın kaleci/hakem hizmet taleplerini yükle ──────────────────

  // ── FAZ 2: Maça atanmış kaleci/hakem ───────────────────────────────────────
  // gk_id = ev sahibi kalecisi, away_gk_id = deplasman kalecisi (iki taraflı).
  const assignedGkId = (match as any)?.gkId || (match as any)?.gk_id || null;
  const assignedAwayGkId = (match as any)?.awayGkId || (match as any)?.away_gk_id || null;
  const assignedRefId = (match as any)?.refereeId || (match as any)?.ref_id || null;

  // ── [K-15.1] KALECİ-HAKEM ALANI ayrı dosyada: hooks/useMacSaglayicilari.ts
  // Atanmış sağlayıcılar + hizmet talepleri. K-5.1 (kaleci teminatı) buraya
  // dokunacak; o yüzden kendi dosyasında.
  const {
    assignedGoalkeeper, assignedAwayGoalkeeper, assignedReferee,
    serviceRequests, refreshServiceRequests,
  } = useMacSaglayicilari(match?.id, assignedGkId, assignedAwayGkId, assignedRefId);

  // ── Özel maç kodu — yalnız kurucuya, istemciye kapalı tablodan RPC ile (P1) ──
  useEffect(() => {
    const uid = auth.currentUser?.uid;
    const isPrivateCreator = !!uid && (match as any)?.visibility === 'PRIVATE' && (match as any)?.creatorId === uid;
    if (!originalMatch?.id || !isPrivateCreator) { setPrivateCode(null); return; }
    let alive = true;
    getMyMatchPrivateCode(originalMatch.id).then(c => { if (alive) setPrivateCode(c); });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [originalMatch?.id, (match as any)?.visibility, (match as any)?.creatorId]);

  // ── Taktik önerileri — YALNIZ Maçlarım (MANAGE) lobisinde yüklenir ──
  const refreshTacticProposals = async () => {
    if (!originalMatch?.id) return;
    try { setTacticProposals(await getMatchTacticProposals(originalMatch.id)); } catch { /* sessiz */ }
  };
  useEffect(() => {
    if (!isManageMode) { setTacticProposals([]); return; }
    refreshTacticProposals();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [originalMatch?.id, isManageMode]);

  // ── Sahadaki dolu slotları gerçek oyuncularla doldur (public_profiles) ────
  // TAKEN sayısı değişince (katılım/ayrılma, realtime dahil) yeniden çekilir.
  const takenSignature =
    ((match?.slots as PositionSlot[] | undefined) || []).filter(s => s?.status === 'TAKEN').length + ':' +
    ((match?.awaySlots as PositionSlot[] | undefined) || []).filter(s => s?.status === 'TAKEN').length;

  // ── [K-15.1] KADRO ALANI ayrı dosyada: hooks/useMacKadrosu.ts ────────────
  // K-3.4 (aylık bırakma hakkı) ve K-3.5 (slot devri) buraya dokunacak.
  const { lobbyParticipants, homeParticipants, awayParticipants } =
    useMacKadrosu(originalMatch?.id, match?.homeTeamId, match?.awayTeamId, takenSignature);

  // ── İlk açılışta oyuncu sayısı az olan tarafı otomatik göster ─────────────
  // Eşitlik/0 → ev sahibi. hasAutoSelectedSide ile yalnız bir kez tetiklenir;
  // kullanıcı üst butonlarla değiştirince kilitlenir (manuel seçim korunur).
  useEffect(() => {
    if (hasAutoSelectedSide || !match) return;
    const takenHome = (match.slots || []).filter(s => s?.status === 'TAKEN').length;
    const takenAway = (match.awaySlots || []).filter(s => s?.status === 'TAKEN').length;
    if (takenHome === 0 && takenAway === 0) return; // veri gelene kadar bekle
    // MANAGE inişinde kullanıcı KENDİ slotlarını görmeli (satın alım sonrası
    // "SLOTLARINI DOLDUR" akışı); keşifte ise az dolu taraf gösterilir.
    const uid = auth.currentUser?.uid;
    const mine = (s: unknown) => {
      const x = s as { purchasedBy?: string; occupant?: string; player?: { id?: string } } | null;
      return !!uid && !!x && (x.purchasedBy === uid || x.occupant === uid || x.player?.id === uid);
    };
    const mineHome = (match.slots || []).some(mine);
    const mineAway = (match.awaySlots || []).some(mine);
    if (isManageMode && (mineHome || mineAway)) {
      setPitchSide(mineHome ? 'home' : 'away');
    } else {
      setPitchSide(takenAway < takenHome ? 'away' : 'home');
    }
    setHasAutoSelectedSide(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [match?.slots, match?.awaySlots, hasAutoSelectedSide]);

  // BULGU-016: eskiden `return null` idi — başlıksız/geri oksuz siyah ekran
  // kalıyordu (MATCH_JOIN alt menüde de yok). İkinci kat emniyet: çıkışı olan
  // hata ekranı.
  if (!match) {
    return (
      <div className="h-full w-full bg-bg flex flex-col items-center justify-center px-8 text-center">
        <div className="w-20 h-20 rounded-3xl bg-error/10 border border-error/30 flex items-center justify-center mb-5">
          <AlertCircle size={32} className="text-error" />
        </div>
        <h2 className="text-[1.25rem] font-bold text-white mb-2">Maç açılamadı</h2>
        <p className="text-[0.9375rem] text-ink-3 leading-relaxed mb-6">
          Bu maç artık mevcut değil ya da yüklenemedi.
        </p>
        <button
          onClick={onBack}
          className="min-h-[44px] px-6 rounded-2xl bg-primary text-on-primary text-[0.9375rem] font-bold active:scale-[0.98] transition-transform"
        >
          Geri Dön
        </button>
      </div>
    );
  }

  // ── IP-06 / BULGU-078: eksik oyuncu ilanı ────────────────────────────────
  const openSlotCount =
    (match.slots || []).filter((s: any) => (s?.status ?? 'OPEN') === 'OPEN').length +
    (match.awaySlots || []).filter((s: any) => (s?.status ?? 'OPEN') === 'OPEN').length;

  const handleBroadcastOpenSlot = async () => {
    if (broadcastBusyRef.current) return;
    if (!isOnline()) { showActionError(OFFLINE_JOIN); return; }
    broadcastBusyRef.current = true;
    setBroadcasting(true);
    try {
      const sent = await broadcastOpenSlot(match.id);
      showActionSuccess(sent > 0 ? `${sent} kişiye ilan gitti.` : 'Şu an yakında bildirime açık oyuncu yok.');
    } catch (e: any) {
      const msg = String(e?.message || '');
      showActionError(
        msg.includes('TOO_SOON')     ? 'Bu maç için ilanı 2 saatte bir verebilirsin.' :
        msg.includes('NO_OPEN_SLOT') ? 'Kadroda boş yer yok.' :
        msg.includes('TOO_EARLY')    ? 'İlan yalnız maça 24 saatten az kala verilebilir.' :
        msg.includes('NO_LOCATION')  ? 'Sahanın konumu kayıtlı değil, ilan verilemiyor.' :
        msg.includes('NOT_PUBLIC')   ? 'Özel maça ilan verilemez — kodu paylaş.' :
                                       'İlan gönderilemedi. Bağlantını kontrol edip tekrar dene.',
      );
    } finally {
      broadcastBusyRef.current = false;
      setBroadcasting(false);
    }
  };

  // (Tek lobi P4) fallbackPitch + isim-eşleşmesi + rozet-türetmeli kural tahminleri
  // KALDIRILDI: kurallar yalnız gerçek kolonlardan gelir, yoksa 'Belirtilmedi'.
  // Saha adı yalnız gerçek kayıttan: pitch_id eşleşmesi, yoksa maçın konumu.
  const activePitchName = match.location || 'Saha';

  // Home & Away Teams derived from store
  const homeTeam = match.homeTeamId ? (userTeams || []).find(t => t.id === match.homeTeamId) : null;
  const awayTeam = match.awayTeamId ? (userTeams || []).find(t => t.id === match.awayTeamId) : null;

  // ── Kullanıcı ─────────────────────────────────────────────────────────────
  // Misafirde gerçek kimlik yok: görüntüleme 'Misafir' etiketiyle yapılır.
  // Yazma aksiyonları (handleBuySlots / handleJoinAsReserve) kendi
  // başlarındaki requireAccount() kapısında durur.
  // (Eski yorum "store.joinMatch içindeki kapı" diyordu — öyle bir eylem yok.)
  const currentUserUid = auth.currentUser?.uid ?? 'guest';
  // Gerçek profil (store) önce; admin-only adminUsers yalnız admin oturumunda dolu.
  const currentUserProfile = storeCurrentUserProfile
    || (adminUsers || []).find(u => u?.id === currentUserUid)
    || { id: currentUserUid, name: auth.currentUser ? (auth.currentUser.displayName || 'Oyuncu') : 'Misafir', avatar: auth.currentUser?.photoURL || '/player_card_photo.png', role: UserRole.PLAYER };

  // Kaptanlık global rol değil; maçı kuran kişi o maçın yöneticisidir.
  const isCaptain = match.creatorId === currentUserProfile?.id;

  // ── Kaporanın DURUMU (kaptan için) ────────────────────────────────────────
  // Bu bilgi eskiden yalnız yönetim panelinde vardı: kaportayı ödeyen oyuncu
  // parasının nerede olduğunu ve iptal ederse ne olacağını hiçbir ekranda
  // göremiyordu. Alanlar `matches` satırından ham gelir (getMatchDetails
  // select('*') yapar), o yüzden okurken tip daraltılır.
  const kaporaDurumu = (match as { deposit_status?: string }).deposit_status ?? 'NONE';
  const kaporaTutari = Number((match as { deposit_amount?: number }).deposit_amount ?? 0);
  const kaporaBloke = kaporaDurumu === 'BLOCKED';
  const kaporaTahsil = kaporaDurumu === 'CAPTURED';
  const kendiPayi = Number(match.price ?? 0);
  const kaporaIadesi = Math.max(0, kaporaTutari - kendiPayi);
  // Maça kalan saat — iptal sonucunu ekranda SOMUT söyleyebilmek için.
  // Hesaplanamıyorsa (starts_at yok) hiç sayı uydurmayız.
  const macaKalanSaat = (() => {
    const ham = (match as { startsAt?: string; starts_at?: string }).startsAt
      ?? (match as { starts_at?: string }).starts_at;
    if (!ham) return null;
    const t = new Date(ham).getTime();
    if (Number.isNaN(t)) return null;
    return (t - Date.now()) / 3_600_000;
  })();
  // Serbest iptal eşiği SAHADAN gelir (koda gömülü 24 kaldırıldı).
  const serbestIptalSaati = iptalPolitikasi.fullHours;
  const gecIptal = kaporaTahsil && macaKalanSaat !== null && macaKalanSaat < serbestIptalSaati;

  const isHomeCaptain = match.creatorId === currentUserProfile.id || homeTeam?.captain === currentUserProfile.id || homeTeam?.captains?.includes(currentUserProfile.id);
  const isAwayCaptain = !!awayTeam && (awayTeam.captain === currentUserProfile.id || awayTeam.captains?.includes(currentUserProfile.id));

  // ── Sahadaki dolu slotları GERÇEK katılımcılarla zenginleştir ─────────────
  // Kaynak: match_participants ⋈ public_profiles (RLS-güvenli). Eski `adminUsers`
  // (hiç yüklenmeyen) index-hack'inin yerine gerçek oyuncu ad/avatarı gelir.
  const enrichedSlots = enrichSideSlots(match.slots || [], homeParticipants, 'UNPAID');
  const enrichedAwaySlots = enrichSideSlots(match.awaySlots || [], awayParticipants, 'PAID');

  // ── Derived State ─────────────────────────────────────────────────────────
  const occupiesSlot = (s: PositionSlot | undefined | null) =>
    !!s && ((s as any).occupant === currentUserProfile?.id || s.player?.id === currentUserProfile?.id);
  const isAlreadyJoinedHome = (match.slots || []).some(occupiesSlot);
  const isAlreadyJoinedAway = (match.awaySlots || []).some(occupiesSlot);
  const isAlreadyJoined = isAlreadyJoinedHome || isAlreadyJoinedAway;

  const isAlreadyJoinedReserve = (match.reservePlayers || []).some(
    p => p?.id === currentUserProfile?.id
  );

  const mySlot = isAlreadyJoined
    ? [...enrichedSlots, ...enrichedAwaySlots].find(occupiesSlot)
    : null;

  // Satın aldığım ve henüz kimseyi atamadığım slotlar (REZERVE — "DOLU")
  const myReservedSlots = [...(match.slots || []), ...(match.awaySlots || [])].filter(
    s => s && (s as any).purchasedBy === currentUserProfile?.id
      && s.status === 'TAKEN' && !s.player && !(s as any).occupant
  );

  // ── İki taraflı kiralık kaleci: taraf = HANGİ kolon dolu (SSOT). ────────────
  // Kiralayan tarafın üyesi miyim? (kaptan / sahaya katılmış / takım rosterımda —
  // userTeams yalnız KENDİ takımlarımı içerir, çözülmesi üyelik kanıtıdır.)
  const isHomeSideMember = isHomeCaptain || isAlreadyJoinedHome || !!homeTeam;
  const isAwaySideMember = isAwayCaptain || isAlreadyJoinedAway || !!awayTeam;
  const { canSeeHome: canSeeHomeGk, canSeeAway: canSeeAwayGk } = resolveGkVisibility({
    homeGkId: assignedGkId,
    awayGkId: assignedAwayGkId,
    viewerIsHomeMember: isHomeSideMember,
    viewerIsAwayMember: isAwaySideMember,
  });
  // Şu an görüntülenen sahada gösterilecek kaleci (o tarafın üyesiysem).
  const viewGoalkeeper = pitchSide === 'home'
    ? (canSeeHomeGk ? assignedGoalkeeper : null)
    : (canSeeAwayGk ? assignedAwayGoalkeeper : null);
  // Kaptan hangi tarafı yönetiyor? (kendi tarafının kalecisini kiralar/yönetir)
  const myCaptainSide: 'home' | 'away' | null = isHomeCaptain ? 'home' : (isAwayCaptain ? 'away' : null);
  const myCaptainSideUpper: 'HOME' | 'AWAY' = myCaptainSide === 'away' ? 'AWAY' : 'HOME';
  // Sahada kalede gösterim: o tarafın İLK boş GK slotu (gerçek bir oyuncunun
  // aldığı GK slotu asla ezilmez — kaleci o durumda yalnız altta kalır).
  const hiredGkSlotId = viewGoalkeeper
    ? findHiredGkSlotId(pitchSide === 'home' ? enrichedSlots : enrichedAwaySlots)
    : null;

  // IP-04 — ayrılma modalı açılınca sözleşmeyi SUNUCUDAN çek. Hata ile "iade
  // yok" artık ayrı sonuçlar: hata durumunda quote null kalır ve AYRIL pasifleşir.

  // Sahada oturanlar — arkadaş atama seçicisinde "eklendi" işaretlemek için
  const assignedIds = [...(match.slots || []), ...(match.awaySlots || [])]
    .map(s => ((s as any)?.occupant || s?.player?.id) as string | undefined)
    .filter(Boolean) as string[];

  const diffConf = difficultyConfig[match.difficulty] || difficultyConfig['Rahat'];
  // "Maç Kuralları" bölümündeki süre — sunucudaki matches.duration_minutes.
  // Sabit yazı/varsayılan YOK: veri yoksa satır hiç görünmez.
  const matchDurationLabel = formatMatchDuration(match);
  const squadSize = inferSquadSize((match.slots || []).length);
  const totalSlots = (match.slots || []).length;
  const takenSlots = (match.slots || []).filter(s => s?.status === 'TAKEN').length;
  const totalAway = (match.awaySlots || []).length;
  const takenAway = (match.awaySlots || []).filter(s => s?.status === 'TAKEN').length;

  // ── Handlers ──────────────────────────────────────────────────────────────

  const handleSlotClick = (slot: any) => {
    if (!slot) return;

    // Oyunculu dolu slot → oyuncu bilgi kartı
    if (slot.status === 'TAKEN' && slot.player) {
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

    // REZERVE / kilitli: sahibi Maçlarım'dan doldurur, diğer herkese seçilemez
    if (slot.status !== 'OPEN') {
      if (isManageMode && slot.purchasedBy === currentUserProfile?.id) {
        setFillSlot(slot);
      } else {
        showActionError('Bu slot rezerve edildi — satın alan kişi dolduracak.');
      }
      return;
    }

    // AÇIK slot → tek akış (kurucu dahil): çoklu seçim + "Öde ve Katıl"
    setSelectedSlotIds((prev) =>
      prev.includes(slot.id) ? prev.filter((id) => id !== slot.id) : [...prev, slot.id]
    );
  };

  // (Tek lobi) Eski ücretsiz tekli katılım (join_public_match_slot) KALDIRILDI —
  // kurucu dahil herkes slot satın alır; ücretsiz maçta aynı RPC 0₺ ile çalışır.

  /**
   * IP-15 — misafir bir YAZMA aksiyonu denerse genel hata toast'ı yerine kayıt
   * kapısı açılır. Eskiden ücretsiz maçta `player_buy_slots_v2` misafirle
   * çağrılıyor, RPC hata döndürüyor ve ekranda "Slot satın alınamadı" yazıyordu
   * — kullanıcı neyin eksik olduğunu anlamıyordu.
   *
   * Niyet saklanır: kayıt + onboarding bitince kullanıcı BU maça geri döner.
   */
  const requireAccount = (): boolean => {
    if (auth.currentUser) return true;
    const s = useAppStore.getState();
    s.setPendingIntent('MATCH_JOIN', match.id);
    s.setIsSignupGateOpen(true);
    return false;
  };

  /**
   * IP-11 — seçili slotları sunucuyu beklemeden dolu göster; geri alma
   * fonksiyonu döndürür (başarısızlıkta çağrılır).
   *
   * Kaynak `match` DEĞİL `originalMatch`: yukarıdaki `useMemo`, slot listesi
   * boş gelen maçlar için VARSAYILAN slot üretiyor. `match`'i store'a yazmak
   * o uydurma slotları kalıcı hale getirirdi. Gerçek slot yoksa iyimser yazım
   * hiç yapılmaz — ekran eskisi gibi sunucuyu bekler, yanlış şey göstermez.
   *
   * Yazılan alanlar sunucudaki kalıbın aynısı (player_buy_slots_v2):
   * status/player/purchasedBy/occupant/assignmentStatus.
   */
  const optimistikDoldur = (): (() => void) | null => {
    const evSlots = originalMatch?.slots;
    const depSlots = (originalMatch as { awaySlots?: PositionSlot[] } | null)?.awaySlots;
    if (!evSlots?.length) return null;
    const secili = new Set(selectedSlotIds);
    const doldur = (arr?: PositionSlot[]) => arr?.map((s) =>
      s && secili.has(s.id)
        ? { ...s, status: 'TAKEN', player: currentUserProfile,
            purchasedBy: currentUserProfile.id, occupant: currentUserProfile.id,
            assignmentStatus: 'SELF' }
        : s);
    applyMatchLocal({ ...originalMatch, slots: doldur(evSlots), awaySlots: doldur(depSlots) } as MatchListing);
    return () => applyMatchLocal({ ...originalMatch, slots: evSlots, awaySlots: depSlots } as MatchListing);
  };

  const handleBuySlots = async () => {
    if (selectedSlotIds.length === 0) return;
    if (!requireAccount()) return;
    if (!beginWrite()) return;
    // ÖLÇÜM · oyuncu hunisi 3/5 — "katıl dedi, yerini seçti". Kapıların
    // (misafir/yazma kilidi) ARDINDAN yazılır: gerçekten devam eden sayılır.
    olayYaz('oyuncu_katil_secildi', { tekrarlanabilir: true });
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
        amountHint: `${selectedSlotIds.length} slot × ${money(match.price || 0)} · rezerve ettiğin yerler`,
        isDeposit: false,
        allowBalance: true,
        successTitle: 'Katılımın Onaylandı!',
        successSubtitle: 'Yerin garanti',
        matchId: match.id,
        slotIds: [...selectedSlotIds],
        // Ödemenin ait olduğu tesis — iade kademesi YALNIZ bu id ile sorgulanır
        // (store.bookingPitch önceki gezinmeden kalmış BAŞKA tesis olabilir).
        pitchId: (match as { pitchId?: string }).pitchId,
        // BULGU-083 — maça katılımda ekranda tek bir iade cümlesi bile yoktu.
        // Metin sunucunun gerçek davranışıyla birebir: leave_public_match_slot /
        // process_match_at_deadline zaman kademesi UYGULAMADAN kalanı iade eder.
        // Cüzdanda tek bakiye var — "iade kredisi" DENMEZ (karar defteri S6/K-0.3).
        // Kademe sayıları SAHADAN gelir (match_cancel_policy) — metne gömülmez.
        infoNote: `Kadro dolmazsa veya maç iptal olursa ödediğin tutarın tamamı cüzdanına döner. Maçtan kendin ayrılırsan iade kademeye tabidir: ${iadeKademesiCumlesi(iptalPolitikasi)}. Tam iade penceresi kapandıktan sonra ayrılırsan güvenilirlik puanın da düşer. Cüzdanındaki tutar OYNA içindeki saha, maç ve hizmet ödemelerinde kullanılır.`,
      });
      setSelectedSlotIds([]);
      // Bu dal try/finally'ye GİRMEDEN dönüyor: kilidi elle bırakmazsak
      // kullanıcı ödemeden vazgeçip geri geldiğinde buton sonsuza kadar
      // kilitli kalır (BULGU-050 telafisi).
      endWrite();
      store.navigateTo('PAYMENT');
      return;
    }

    // Ücretsiz maç: eski hızlı yol (ödeme ekranı gerekmez).
    setIsProcessing(true);
    // IP-11 · İyimser yazım. Eskiden slot ancak RPC + eşik kontrolü +
    // getMatchDetails turlarından SONRA doluyordu; yavaş bağlantıda dokunulan
    // yer saniyelerce boş görünüyordu. Sunucu tek otorite kalır: hata dalında
    // geri alınır, realtime (subscribeToMatchUpdates) zaten yakınsar.
    const geriAl = optimistikDoldur();
    try {
      const { error } = await rpcPencere(supabase.rpc('player_buy_slots_v2', {
        p_match_id: match.id,
        p_slot_ids: selectedSlotIds,
        p_use_balance: true,
      }));
      if (error) throw error;

      // Escrow: eşik (toplam−2) dolduysa maçı LIVE yap + kaporayı capture et (best-effort).
      try { await checkMatchThreshold(match.id); } catch { /* eşik kontrolü kritik değil */ }

      // KN-3b: taze durumu çek, YEREL uygula (DB'ye geri yazma — eski kod
      // fresh'i updateMatch ile geri yazıyordu: gereksiz yazım + yarış).
      const fresh = await macTazele();

      setSelectedSlotIds([]);
      setNewMatchBadge(true);
      // Satın alınan slotlar REZERVE — kullanıcıyı doldurma moduna al.
      useAppStore.getState().setLobbyMode('MANAGE');
      showActionSuccess('Slotların rezerve edildi — kendini veya arkadaşlarını ekle.');
    } catch (e: any) {
      // Zaman aşımında iyimser doldurmayı GERİ ALMA: sunucu slotu almış
      // olabilir. macTazele (zamanAsimiIsePaylas içinde) doğruyu getirir.
      if (e instanceof SubmitTimeoutError) { zamanAsimiIsePaylas(e); return; }
      geriAl?.();
      console.error('Buy slots error:', e);
      const msg = e?.message || '';
      showActionError(msg.includes('Yetersiz') ? 'Cüzdan bakiyen yetersiz.' : 'Slot satın alınamadı. Lütfen tekrar dene.');
    } finally {
      setIsProcessing(false); endWrite();
    }
  };

  const handleJoinAsReserve = async () => {
    if (!requireAccount()) return;
    if (isAlreadyJoined || isAlreadyJoinedReserve) return;
    // Kilidi ALMADAN endWrite() çağıran eski hâl, çevrimdışı kapısını da
    // atlıyordu: bağlantı yokken istek kurulup ekran "işleniyor"da kalıyordu.
    if (!beginWrite()) return;
    setIsProcessing(true);

    try {
      const { error } = await rpcPencere(supabase.rpc('join_public_match_reserve', {
        p_match_id: match.id,
        p_user_id: currentUserProfile.id
      }));

      if (error) throw error;

      // KN-3b: yedek listesi sunucuda güncellendi; taze çek, yerel uygula.
      const fresh = await macTazele();
      // D2: kullanıcı maça girdi — bildirimin değerini şimdi görüyor.
      void pushIzniZamaniGeldi();
    } catch (e: any) {
      if (zamanAsimiIsePaylas(e)) return;
      console.error('Join reserve error:', e);
      showActionError('Yedek olarak katılırken bir hata oluştu.');
    } finally {
      setIsProcessing(false); endWrite();
    }
  };

  const handleLeaveReserves = async () => {
    if (!isAlreadyJoinedReserve) return;
    // handleJoinAsReserve ile aynı kusur: kilit alınmadan endWrite() çağrılıyordu.
    if (!beginWrite()) return;
    setIsProcessing(true);

    try {
      await rpcPencere(leaveMatchSlot(match.id, currentUserProfile.id));

      // KN-3b: sunucu çıkardı; taze çek, yerel uygula.
      const fresh = await macTazele();
      setShowLeaveConfirm(false);
      showActionSuccess('Yedek listesinden çıktın.');
    } catch (e: any) {
      if (zamanAsimiIsePaylas(e)) return;
      console.error('Leave reserves error:', e);
      showActionError('Yedek listesinden çıkamadın. İnternetin zayıf olabilir, tekrar dene.');
    } finally {
      setIsProcessing(false); endWrite();
    }
  };

  // ── Rezerve slot doldurma aksiyonları (MANAGE — yalnız satın alan) ─────────
  const handleSelfAssign = async (slotId: string) => {
    if (!beginWrite()) return;
    setIsProcessing(true);
    try {
      await rpcPencere(selfAssignSlot(match.id, slotId));
      const fresh = await macTazele(); // KN-3b
      setFillSlot(null);
      showActionSuccess('Sahadasın! ⚽');
    } catch (e: any) {
      if (zamanAsimiIsePaylas(e)) return;
      showActionError((e?.message || '').includes('ALREADY_ON_FIELD')
        ? 'Zaten sahada bir slotun var.' : 'Slota eklenemedin. Lütfen tekrar dene.');
    } finally { setIsProcessing(false); endWrite(); }
  };

  // Seçilen arkadaşlar, tıklanan slottan başlayarak REZERVE slotlarıma sırayla
  // atanır — her atama ANINDA görünür ve arkadaşa gerçek bildirim gider.
  const handleAssignFriends = async (picked: PickedPlayer[]) => {
    const startId = assignPickerSlotId;
    setAssignPickerSlotId(null);
    if (!picked.length) return;
    const targets = [
      ...myReservedSlots.filter(s => s!.id === startId),
      ...myReservedSlots.filter(s => s!.id !== startId),
    ];
    let ok = 0;
    for (let i = 0; i < picked.length && i < targets.length; i++) {
      try {
        await assignSlotToFriend(match.id, targets[i]!.id, picked[i].id);
        ok++;
      } catch (e: any) {
        showActionError((e?.message || '').includes('NOT_FRIENDS')
          ? 'Yalnız arkadaş listenden atama yapabilirsin.'
          : `${picked[i].name} atanamadı.`);
      }
    }
    const fresh = await macTazele();
    setFillSlot(null);
    if (ok > 0) showActionSuccess(`${ok} arkadaşın slota eklendi — bildirim gitti ⚽`);
  };

  const handleUnassign = async (slotId: string) => {
    if (!beginWrite()) return;
    setIsProcessing(true);
    try {
      await rpcPencere(unassignSlot(match.id, slotId));
      const fresh = await macTazele();
      setActivePlayerSlotId(null);
      showActionSuccess('Slot yeniden rezervine döndü.');
    } catch (e) {
      if (zamanAsimiIsePaylas(e)) return;
      showActionError('İşlem tamamlanamadı. Lütfen tekrar dene.');
    }
    finally { setIsProcessing(false); endWrite(); }
  };

  const handleRelease = async (slotId: string) => {
    if (!beginWrite()) return;
    setIsProcessing(true);
    try {
      const refunded = await rpcPencere(releaseSlot(match.id, slotId));
      const fresh = await macTazele();
      setFillSlot(null);
      showActionSuccess(refunded > 0
        ? `Slot iade edildi — ${money(refunded)} cüzdanına iade edildi.`
        : 'Slot vitrine iade edildi.');
    } catch (e) {
      if (zamanAsimiIsePaylas(e)) return;
      showActionError('Slot iade edilemedi.');
    }
    finally { setIsProcessing(false); endWrite(); }
  };

  const handleProposeTactic = async (tacticId: string) => {
    try {
      await proposeMatchTactic(match.id, tacticId);
      setShowTacticPicker(false);
      await refreshTacticProposals();
      showActionSuccess('Taktiğin maça önerildi. 📋');
    } catch (e: any) { showActionError(mapError(e, 'Taktik önerilemedi.')); }
  };

  // Satın alınan slot için paylaşılabilir devralma kodu üret
  const handleMakeSlotCode = async (slotId: string) => {
    try {
      const { data, error } = await supabase.rpc('player_make_slot_code', { p_match_id: match.id, p_slot_id: slotId });
      if (error) throw error;
      const fresh = await macTazele(); // KN-3b: taze veri DB'ye GERİ yazılmaz
      setFillSlot(null);
      showActionSuccess(`Devralma kodu: ${data} — arkadaşına gönder.`);
    } catch (e: any) {
      console.error('make slot code error', e);
      showActionError('Kod oluşturulamadı.');
    }
  };

  // Davet edilen arkadaş slotu kabul eder → slotta arkadaş görünür
  const handleAcceptSlot = async (slotId: string) => {
    if (!beginWrite()) return;
    setIsProcessing(true);
    try {
      const { error } = await rpcPencere(
        supabase.rpc('player_accept_slot', { p_match_id: match.id, p_slot_id: slotId })
      );
      if (error) throw error;
      const fresh = await macTazele(); // KN-3b: taze veri DB'ye GERİ yazılmaz
      setActivePlayerSlotId(null);
      showActionSuccess('Slotu kabul ettin — kadrodasın! ⚽');
      // D2: kadroya girdi — izni sormak için doğru an.
      void pushIzniZamaniGeldi();
    } catch (e: any) {
      if (zamanAsimiIsePaylas(e)) return;
      console.error('accept slot error', e);
      showActionError('Kabul edilemedi. Lütfen tekrar dene.');
    } finally {
      setIsProcessing(false); endWrite();
    }
  };



  // F1.8: kick atomik sunucu RPC'si (player_kick_slot) — kaptan kapısı, idempotent
  // iade (_match_refund_partial) ve boşalan yer için yedek bildirimi sunucuda.
  // Servis sarmalayıcısı (kickSlot) iade tutarını döndürür; tam-dizi yazımı YOK.
  const handleRemovePlayer = async (slotId: string) => {
    try {
      const refunded = await kickSlot(match.id, slotId);
      const fresh = await macTazele(); // KN-3b: taze veri DB'ye GERİ yazılmaz
      setActivePlayerSlotId(null);
      showActionSuccess(refunded > 0 ? `Oyuncu çıkarıldı — ${money(refunded)} cüzdanına iade edildi.` : 'Oyuncu kadrodan çıkarıldı.');
    } catch (e: any) {
      console.error(e);
      const msg = String(e?.message || '');
      showActionError(
        msg.includes('CANNOT_KICK_SELF') ? 'Kendini çıkaramazsın — maçtan ayrılma akışını kullan.'
        : msg.includes('FORBIDDEN') ? 'Yalnız maç kaptanı oyuncu çıkarabilir.'
        : msg.includes('SLOT_EMPTY') ? 'Bu slotta çıkarılacak oyuncu yok.'
        : 'Oyuncu kadrodan çıkarılamadı. Lütfen tekrar dene.');
    }
  };

  const handleLeaveMatch = async () => {
    if (!isAlreadyJoined || !currentUserProfile?.id) return;
    setIsProcessing(true);

    try {
      await leaveMatchSlot(match.id, currentUserProfile.id);

      // KN-3b (kritik silme): leave_public_match_slot SUNUCUDA zaten her şeyi
      // yapıyor — slotu boşaltma, iadeyi yazma, geç ayrılmada güvenilirlik
      // cezası, kaptana bildirim, kaptan ayrılıyorsa yeni kaptan atama
      // (20260829000000). Buradaki eski client kopyası (fillVacatedSlot +
      // reliabilityScore halef hesabı, hiç yüklenmeyen adminUsers ile
      // herkes=100) sunucunun DOĞRU sonucunu bayat tam-dizi yazımıyla
      // eziyordu. Taze çek, yerel uygula, çık.
      const fresh = await macTazele();

      setShowLeaveConfirm(false);
      // IP-04 — ayrılmanın parasal sonucu sessiz kalmaz. onBack() bu ekranı
      // söktüğü için YEREL toast görünmez; sonucu GLOBAL kanaldan söylüyoruz.
      if (leaveQuote?.late) {
        const geri = leaveQuote.refundable > 0
          ? `${formatTRYAmount(leaveQuote.refundable)} cüzdanına döndü, ` : '';
        const yanan = leaveQuote.forfeited > 0
          ? `${formatTRYAmount(leaveQuote.forfeited)} iade edilmedi, ` : '';
        showToast(`Maçtan ayrıldın. ${geri}${yanan}güvenilirlik puanın ${leaveQuote.penalty} düştü.`, 'error');
      } else if ((leaveQuote?.refundable ?? 0) > 0) {
        showToast(`Maçtan ayrıldın. ${formatTRYAmount(leaveQuote!.refundable)} cüzdanına geri döndü.`, 'success');
      } else {
        showToast('Maçtan ayrıldın.', 'success');
      }
      onBack();
    } catch (e: any) {
      console.error('Leave match error:', e);
      showActionError('Maçtan ayrılamadın. İnternetin zayıf olabilir, tekrar dene.');
    } finally {
      setIsProcessing(false); endWrite();
    }
  };

  // B4: Kurucu maçı iptal eder — eşiği SUNUCU sahanın ayarından okur
  // (≥serbest saat: katılımcı ödemeleri iade / altında: no-show politikası).
  const handleCancelMatch = async () => {
    if (!beginWrite()) return;
    setIsProcessing(true);
    try {
      const res = await rpcPencere(cancelMatchByCaptain(match.id));
      const fresh = await macTazele();
      showActionSuccess(
        res?.outcome && String(res.outcome).toUpperCase().includes('REFUND')
          ? 'Maç iptal edildi — katılımcı ödemeleri iade edildi.'
          : 'Maç iptal edildi.'
      );
      setShowCancelConfirm(false);
      setTimeout(() => onBack(), 900);
    } catch (e: any) {
      if (zamanAsimiIsePaylas(e)) return;
      console.error('Cancel match error:', e);
      showActionError((e?.message || '').includes('UNAUTHORIZED')
        ? 'Bu maçı yalnız kurucusu iptal edebilir.'
        : 'Maç iptal edilemedi. Lütfen tekrar dene.');
    } finally {
      setIsProcessing(false); endWrite();
    }
  };

  // ── FAZ 5: Kaleci / Hakem Talep Handler'ları ────────────────────────────
  const ACTIVE_REQUEST_STATUSES: ServiceRequest['status'][] = ['PENDING', 'ACCEPTED', 'CAPTURED'];

  // Belirli tipte aktif (bekleyen/atanmış) talep var mı? GK için kaptanın KENDİ
  // tarafıyla eşleş (iki taraflı: her kaptan yalnız kendi tarafını yönetir).
  const getActiveRequestForType = (type: ProviderType): ServiceRequest | undefined =>
    serviceRequests.find(r =>
      r.providerType === type && ACTIVE_REQUEST_STATUSES.includes(r.status) &&
      (type !== 'GK' || (r.teamSide ?? 'HOME') === myCaptainSideUpper));

  // ── Sağlayıcı-başlatan başvurular (kaleci/hakem maça başvurdu → kaptan yönetir) ──
  const [reqActionId, setReqActionId] = useState<string | null>(null);
  // Sağlayıcı başvuruları İKİ kaptana da görünür (RLS); ancak her kaptana yalnız
  // KENDİ tarafı için kabul edilebilir olanları göster (dolu tarafta SLOT_FILLED
  // hatası çıkmasın). GK: benim tarafımın kalecisi boşsa; REF: hakem boşsa.
  const mySideGkAssigned = myCaptainSide === 'away' ? !!match.awayGkId : !!match.gkId;
  const providerApplications = serviceRequests.filter(r => {
    if (r.status !== 'APPLIED' || r.initiatedBy !== 'PROVIDER') return false;
    if (r.providerType === 'REF') return !match.refereeId && !getActiveRequestForType('REF');
    return !mySideGkAssigned && !getActiveRequestForType('GK');
  });
  // F1.1: initiatedBy==='PROVIDER' filtresi kaldırıldı — kaptan-başlatan
  // (çoğunluk) taleplerde de onay kartı çıkar; iki-taraflı payout kapısının
  // kaptan ayağı HER talepte gerekli. captainConfirmed olanlar da listede
  // kalır (rozet olarak render edilir). GK'de taraf koruması: sunucu
  // (_hire_side_for) iki kaptana da izin verdiği için deplasman kaptanının
  // ev sahibi kalecisini onaylamasını burada engelliyoruz.
  const captainConfirmPending = serviceRequests.filter(
    r => r.status === 'CAPTURED' && !r.payoutReleased &&
      (r.providerType !== 'GK' || (r.teamSide ?? 'HOME') === myCaptainSideUpper)
  );

  const handleAcceptApplication = async (requestId: string) => {
    setReqActionId(requestId);
    try {
      await acceptProviderApplication(requestId);
      await refreshServiceRequests();
      showActionSuccess('Başvuru kabul edildi. Ücret bloke edildi.');
    } catch (err: any) {
      showActionError(mapError(err, 'Başvuru kabul edilemedi.'));
    } finally { setReqActionId(null); }
  };
  const handleDeclineApplication = async (requestId: string) => {
    setReqActionId(requestId);
    try {
      await declineProviderApplication(requestId);
      await refreshServiceRequests();
      showActionSuccess('Başvuru reddedildi.');
    } catch (err: any) {
      showActionError(mapError(err, 'Başvuru reddedilemedi.'));
    } finally { setReqActionId(null); }
  };
  const handleCaptainConfirm = async (requestId: string) => {
    setReqActionId(requestId);
    try {
      await captainConfirmService(requestId);
      await refreshServiceRequests();
      showActionSuccess('Onayladın. Sağlayıcı da onaylayınca ücret ödenir.');
    } catch (err: any) {
      showActionError(mapError(err, 'Onay kaydedilemedi.'));
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
      showActionError(mapError(err, 'Uygun sağlayıcılar getirilemedi.'));
    } finally {
      setProvidersLoading(false);
    }
  };

  // FAZ 4: talep oluştur + hemen fonla (emanet). Kaleci ancak fonlanınca kabul edebilir.
  const handleSelectProvider = async (provider: ProviderSuggestion, source: 'WALLET' | 'CARD' = 'WALLET') => {
    if (!providerModalType) return;
    setProviderSubmittingId(provider.id);
    try {
      // GK kaptanın KENDİ tarafına kiralanır; REF maç-tekil (taraf gönderilmez).
      const { requestId } = await createServiceRequest(
        match.id, provider.id, providerModalType,
        providerModalType === 'GK' ? myCaptainSideUpper : undefined,
      );
      await fundServiceRequest(requestId, source);
      await refreshServiceRequests();
      setMarketDetailProvider(null);
      setProviderModalType(null);
      showActionSuccess(`Ödeme alındı — ${provider.name} onayı bekleniyor`);
    } catch (err: any) {
      console.error('[MatchJoin] talep/ödeme:', err);
      showActionError(mapError(err, 'Hizmet talebi oluşturulamadı.'));
    } finally {
      setProviderSubmittingId(null);
    }
  };

  // FAZ 4: aktif (tahsil edilmiş) kaleci hizmeti → kaptan no-show bildirebilir.
  // Kaptanın KENDİ tarafının kalecisi (iki taraflı).
  const capturedGkRequest = serviceRequests.find(r =>
    r.providerType === 'GK' && r.status === 'CAPTURED' && (r.teamSide ?? 'HOME') === myCaptainSideUpper);
  const handleReportNoShow = async () => {
    if (!capturedGkRequest) return;
    try {
      setIsProcessing(true);
      const r = await captainReportNoShow(capturedGkRequest.id);
      await refreshServiceRequests();
      setShowNoShowConfirm(false);
      showActionSuccess(
        r.penaltyCharged
          ? `No-show bildirildi. ${money(r.penalty)} ceza kalecinin teminatından tahsil edilip sana aktarıldı.`
          : `No-show bildirildi. Ceza (${money(r.penalty)}) teminattan tahsil edilemedi — durum incelemeye alındı.`
      );
    } catch (e: any) {
      showActionError(mapError(e, 'No-show bildirilemedi.'));
    } finally {
      setIsProcessing(false); endWrite();
    }
  };

  const activePlayerSlot = activePlayerSlotId ? (pitchSide === 'home' ? enrichedSlots : enrichedAwaySlots).find(s => s?.id === activePlayerSlotId) : null;
  const activePlayer = activePlayerSlot?.player || null;

  // ─── RENDER ─────────────────────────────────────────────────────────────────

  return (
    <div className="h-full bg-bg flex flex-col relative overflow-hidden font-sans">

      {/* Ambiyans arka plan */}



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
              className="relative w-[19rem] rounded-[28px] overflow-hidden bg-gradient-to-b from-surface-1 to-[#0d1117] border border-white/10 shadow-[0_30px_70px_rgba(0,0,0,0.85)]">
              {(() => {
                const isHome = pitchSide === 'home';
                const accent = isHome ? '#FFFFFF' : '#F87171';
                const initialsCls = isHome
                  ? 'bg-white/10 text-white border border-white/20'
                  : 'bg-error-bg text-error border border-error-line';
                const isMySlot = activePlayer.id === currentUserProfile?.id;
                const posLabel = { 'GK': 'KALECİ', 'DEF': 'DEFANS', 'MID': 'ORTA SAHA', 'FWD': 'FORVET' }[normalizeRole((activePlayer as any).position || activePlayerSlot?.role || '')] || 'OYUNCU';
                const c = playerCard;
                const isSelf = !!c?.is_self;
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
                        <img src={(activePlayer as any).avatar} alt={(activePlayer as any).name} className="w-full h-full object-cover bg-bg" />
                      ) : (
                        <div className={`w-full h-full flex items-center justify-center text-3xl font-extrabold tracking-tight ${initialsCls}`}>
                          {getInitials((activePlayer as any).name)}
                        </div>
                      )}
                    </div>
                    <h3 className="text-xl font-extrabold text-white tracking-tight text-center leading-tight px-2">
                      {isMySlot ? 'SEN' : (c?.name || (activePlayer as any).name || 'Oyuncu')}
                    </h3>
                    <span className="mt-1 text-[0.625rem] font-extrabold uppercase tracking-[0.25em]" style={{ color: accent }}>{posLabel}</span>

                    {playerCardLoading ? (
                      <div className="w-full flex items-center justify-center py-12">
                        <Loader2 size={22} className="animate-spin text-ink-4" />
                      </div>
                    ) : (
                      <>
                        {showHero && (
                          <div className="w-full mt-5 rounded-2xl border py-4 flex flex-col items-center gap-1" style={{ borderColor: accent + '33', background: accent + '10' }}>
                            <span className="text-[0.625rem] font-extrabold uppercase tracking-[0.3em]" style={{ color: accent + 'cc' }}>{heroLabel}</span>
                            <div className="flex items-baseline gap-1.5">
                              <span className="text-5xl font-extrabold tabular-nums leading-none" style={{ color: accent }}>{heroNum}</span>
                              <span className="text-sm font-extrabold text-white/70">MAÇ</span>
                            </div>
                          </div>
                        )}
                        <div className={`w-full grid grid-cols-2 gap-2 ${showHero ? 'mt-3' : 'mt-5'}`}>
                          {[
                            { l: 'YAŞ', v: c?.age != null ? String(c.age) : '—' },
                            { l: 'FAIR PLAY', v: c?.fair_play != null ? '%' + c.fair_play : '—' },
                          ].map(s => (
                            <div key={s.l} className="bg-white/[0.04] border border-white/8 rounded-xl py-3 flex flex-col items-center gap-1">
                              <span className="text-[0.625rem] font-extrabold text-ink-4 uppercase tracking-[0.15em]">{s.l}</span>
                              <span className="text-base font-extrabold text-white">{s.v}</span>
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
                                showActionError(mapError(e, 'İstek gönderilemedi.'));
                              }
                            }}
                            className="w-full mt-3 py-3 rounded-2xl font-extrabold text-[0.6875rem] uppercase tracking-widest text-ink bg-white/[0.06] border border-line-strong active:scale-95 transition-all flex items-center justify-center gap-2 disabled:opacity-60">
                            {friendRequestSent ? <><CheckCircle2 size={14} /> İSTEK GÖNDERİLDİ</> : <><UserPlus size={14} /> ARKADAŞ OL</>}
                          </button>
                        )}
                      </>
                    )}

                    {/* Yönetim aksiyonları — YALNIZ MANAGE (Maçlarım hub'ı) */}
                    {isManageMode && (
                      <div className="w-full mt-4 space-y-2">
                        {/* Alıcı: slottaki arkadaşı çıkar — slot rezervine döner */}
                        {activePlayerSlot && (activePlayerSlot as any).purchasedBy === currentUserProfile.id && !isMySlot && (
                          <button onClick={() => handleUnassign(activePlayerSlot.id)} disabled={isProcessing}
                            className="w-full py-3.5 rounded-2xl font-extrabold text-xs uppercase tracking-widest text-amber-300 bg-amber-950/30 border border-amber-500/20 active:scale-95 transition-all">
                            ARKADAŞI SLOTTAN ÇIKAR
                          </button>
                        )}
                        {/* Legacy INVITED davetini davetli kabul eder */}
                        {activePlayerSlot && (activePlayerSlot as any).inviteeId === currentUserProfile.id && (activePlayerSlot as any).assignmentStatus === 'INVITED' && (
                          <button onClick={() => handleAcceptSlot(activePlayerSlot.id)} disabled={isProcessing}
                            className="w-full py-3.5 rounded-2xl font-extrabold text-xs uppercase tracking-widest text-on-primary bg-primary active:scale-95 transition-all shadow-[0_0_20px_rgba(57,255,20,0.35)] flex items-center justify-center gap-2">
                            <CheckCircle2 size={15} /> Slotu Kabul Et
                          </button>
                        )}
                        {isCaptain && !isMySlot && (
                          <button onClick={() => { setRemoveConfirmSlot(activePlayerSlot); setActivePlayerSlotId(null); }}
                            className="w-full py-3.5 rounded-2xl font-extrabold text-xs uppercase tracking-widest text-red-400 bg-red-950/30 border border-red-500/15 active:scale-95 transition-all">
                            KADRODAN ÇIKAR
                          </button>
                        )}
                        {/* Kendi satın aldığım slottan sahadan çekil (slot bende kalır) */}
                        {isMySlot && (activePlayerSlot as any)?.purchasedBy === currentUserProfile.id && (
                          <button onClick={() => { if (activePlayerSlot) handleUnassign(activePlayerSlot.id); }} disabled={isProcessing}
                            className="w-full py-3.5 rounded-2xl font-extrabold text-xs uppercase tracking-widest text-amber-300 bg-amber-950/30 border border-amber-500/20 active:scale-95 transition-all">
                            SAHADAN ÇEKİL (SLOT SENDE KALIR)
                          </button>
                        )}
                        {isMySlot && (
                          <button onClick={() => { setActivePlayerSlotId(null); setShowLeaveConfirm(true); }}
                            className="w-full py-3.5 rounded-2xl font-extrabold text-xs uppercase tracking-widest text-red-500 bg-red-500/10 border border-red-500/20 active:scale-95 transition-all">
                            MAÇTAN AYRIL
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                );
              })()}

              <button onClick={() => setActivePlayerSlotId(null)}
                aria-label="Kapat" className="absolute top-4 right-4 w-11 h-11 rounded-full bg-white/10 flex items-center justify-center text-white/70 hover:bg-white/20 transition-colors backdrop-blur-md z-10">
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
              className="bg-surface-1 border border-red-500/30 w-full max-w-sm rounded-[32px] p-6 shadow-[0_0_50px_rgba(239,68,68,0.2)] text-center">
              
              <div className="w-16 h-16 rounded-full bg-red-500/10 border border-red-500/20 flex items-center justify-center mx-auto mb-4">
                <AlertCircle size={32} className="text-red-500" />
              </div>
              
              <h3 className="text-xl font-extrabold text-white italic uppercase tracking-tighter mb-2">
                {isAlreadyJoinedReserve ? 'Yedeklikten Ayrıl' : 'Maçtan Ayrıl'}
              </h3>
              
              <p className="text-sm mb-4" style={{ color: '#A9B4C0' }}>
                {isAlreadyJoinedReserve
                  ? 'Yedek listesinden çıkarsan bu maç için sıran silinir.'
                  : 'Maçtan ayrılırsan kadrodaki yerin boşalır ve yerin vitrine açılır.'}
              </p>

              {/* IP-04 — ayrılmanın para/puan sonucu. Altı durumun HİÇBİRİ sessiz
                  değil; renk tek başına anlam taşımasın diye her dal ikon +
                  Türkçe kelime taşır. */}
              {(() => {
                const msg = leaveQuoteMessage(leaveQuote, leaveQuoteLoading, isAlreadyJoinedReserve);
                const skin = msg.tone === 'late'
                  ? { bg: 'rgba(248,113,113,0.12)', line: 'rgba(248,113,113,0.35)', ink: '#F87171', Icon: AlertCircle }
                  : msg.tone === 'refund'
                  ? { bg: 'rgba(57,255,20,0.12)', line: 'rgba(57,255,20,0.35)', ink: '#A9B4C0', Icon: CheckCircle2 }
                  : { bg: 'rgba(255,255,255,0.04)', line: 'rgba(255,255,255,0.16)', ink: '#A9B4C0', Icon: msg.tone === 'loading' ? Loader2 : Info };
                return (
                  <div className="mb-6 rounded-2xl px-4 py-3 border flex items-start gap-2 text-left"
                       style={{ background: skin.bg, borderColor: skin.line }}>
                    <skin.Icon size={15}
                      className={`shrink-0 mt-0.5 ${msg.tone === 'loading' ? 'animate-spin' : ''}`}
                      style={{ color: msg.tone === 'refund' ? '#39FF14' : skin.ink }} />
                    <p className="text-[0.8125rem] font-semibold leading-[18px]" style={{ color: skin.ink }}>
                      {msg.text}
                    </p>
                  </div>
                );
              })()}
              
              <div className="flex gap-3">
                <button 
                  onClick={() => setShowLeaveConfirm(false)}
                  disabled={isProcessing}
                  className="flex-1 py-3 rounded-2xl font-extrabold text-sm uppercase tracking-widest text-white bg-white/5 border border-white/10 hover:bg-white/10 transition-colors">
                  VAZGEÇ
                </button>
                {/* IP-04 — para sonucu bilinmeden yıkıcı aksiyon yapılamaz:
                    önizleme yüklenirken veya alınamadığında AYRIL pasiftir. */}
                <button
                  onClick={isAlreadyJoinedReserve ? handleLeaveReserves : handleLeaveMatch}
                  disabled={isProcessing || (!isAlreadyJoinedReserve && (leaveQuoteLoading || leaveQuote == null))}
                  className="flex-1 py-3 rounded-2xl font-extrabold text-sm uppercase tracking-widest text-white bg-red-600 shadow-[0_0_20px_rgba(239,68,68,0.4)] hover:bg-red-500 transition-colors flex items-center justify-center disabled:opacity-40 disabled:pointer-events-none">
                  {isProcessing ? <Loader2 size={18} className="animate-spin" /> : 'MAÇTAN AYRIL'}
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
              className="bg-surface-1 border border-red-500/30 w-full max-w-sm rounded-[32px] p-6 shadow-[0_0_50px_rgba(239,68,68,0.2)] text-center">
              <div className="w-16 h-16 rounded-full bg-red-500/10 border border-red-500/20 flex items-center justify-center mx-auto mb-4">
                <AlertCircle size={32} className="text-red-500" />
              </div>
              <h3 className="text-xl font-extrabold text-white italic uppercase tracking-tighter mb-2">Maçı İptal Et</h3>
              <p className="text-sm text-gray-400 mb-3">
                Bu maçı iptal etmek istediğine emin misin? Tüm kadro bilgilendirilir ve maç vitrinden kaldırılır.
              </p>
              {/* 8a — SOMUT sonuç. Eskiden yalnız genel kural yazıyordu;
                  kaptan kendi kaporasına ne olacağını GÖRMEDEN iptal ediyordu.
                  Artık şu anki duruma göre tek cümlelik kesin sonuç yazılır. */}
              {kaporaTutari > 0 && (
                <p className={`text-[0.6875rem] font-bold rounded-xl px-3 py-2 mb-3 text-left ${
                  gecIptal
                    ? 'text-red-300 bg-red-500/[0.09] border border-red-500/25'
                    : 'text-[#8fe87a] bg-primary/[0.07] border border-primary/20'
                }`}>
                  {kaporaBloke && <>Kaporan <b>{money(kaporaTutari)}</b> henüz tahsil edilmedi — <b>tamamı</b> cüzdanına geri döner.</>}
                  {kaporaTahsil && !gecIptal && <>Kaporan tahsil edilmişti; maça {serbestIptalSaati} saatten fazla olduğu için <b>{money(kaporaTutari)} iade edilir</b>.</>}
                  {gecIptal && (
                    <>Maça <b>{Math.max(0, Math.floor(macaKalanSaat ?? 0))} saat</b> kaldı. Kaporan tahsil edilmişti:
                      {' '}<b>{money(kaporaTutari)} iade EDİLMEZ</b> ve güven puanın düşer.</>
                  )}
                </p>
              )}
              {/* Katılımcı tarafı — eşik SAHANIN ayarından (match_cancel_policy) */}
              <p className="text-[0.6875rem] font-bold text-amber-300/90 bg-amber-400/[0.07] border border-amber-400/20 rounded-xl px-3 py-2 mb-6 text-left">
                • Maça <b>{serbestIptalSaati} saatten fazla</b> varsa: katılımcı ödemeleri iade edilir.<br />
                • <b>{serbestIptalSaati} saatten az</b> kaldıysa: geç iptal — iade yapılmaz ve fair-play puanın etkilenebilir.
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => setShowCancelConfirm(false)}
                  disabled={isProcessing}
                  className="flex-1 py-3 rounded-2xl font-extrabold text-sm uppercase tracking-widest text-white bg-white/5 border border-white/10 hover:bg-white/10 transition-colors">
                  VAZGEÇ
                </button>
                <button
                  onClick={handleCancelMatch}
                  disabled={isProcessing}
                  className="flex-1 py-3 rounded-2xl font-extrabold text-sm uppercase tracking-widest text-white bg-red-600 shadow-[0_0_20px_rgba(239,68,68,0.4)] hover:bg-red-500 transition-colors flex items-center justify-center">
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
              className="bg-surface-1 border border-red-500/30 w-full max-w-sm rounded-[32px] p-6 shadow-[0_0_50px_rgba(239,68,68,0.2)] text-center">
              
              <div className="w-16 h-16 rounded-full bg-red-500/10 border border-red-500/20 flex items-center justify-center mx-auto mb-4">
                <AlertCircle size={32} className="text-red-500" />
              </div>
              
              <h3 className="text-xl font-extrabold text-white italic uppercase tracking-tighter mb-2">
                Kadrodan Çıkar
              </h3>
              
              <p className="text-sm text-gray-400 mb-6 font-semibold">
                <strong>{removeConfirmSlot.player?.name}</strong> isimli oyuncuyu kadrodan çıkarmak istediğine emin misin?
              </p>
              
              <div className="flex gap-3">
                <button 
                  onClick={() => setRemoveConfirmSlot(null)}
                  className="flex-1 py-3 rounded-2xl font-extrabold text-sm uppercase tracking-widest text-white bg-white/5 border border-white/10 hover:bg-white/10 transition-colors">
                  İPTAL
                </button>
                <button 
                  onClick={async () => {
                    if (!removeConfirmSlot) return;
                    setIsProcessing(true);
                    await handleRemovePlayer(removeConfirmSlot.id);
                    setRemoveConfirmSlot(null);
                    setIsProcessing(false); endWrite();
                  }}
                  disabled={isProcessing}
                  className="flex-1 py-3 rounded-2xl font-extrabold text-sm uppercase tracking-widest text-white bg-red-600 shadow-[0_0_20px_rgba(239,68,68,0.4)] hover:bg-red-500 transition-colors flex items-center justify-center">
                  {isProcessing ? <Loader2 size={18} className="animate-spin" /> : 'ÇIKAR'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Rezerve Slot Doldurma Sayfası (MANAGE — yalnız satın alan) ─────── */}
      <AnimatePresence>
        {fillSlot && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-end justify-center"
            onClick={() => setFillSlot(null)}>
            <motion.div
              initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 26, stiffness: 280 }}
              onClick={e => e.stopPropagation()}
              className="bg-surface-1 border-t border-line-strong w-full max-w-md rounded-t-[36px] p-6 pb-10 shadow-[0_-20px_50px_rgba(0,0,0,0.8)]">
              <div className="w-12 h-1 bg-white/20 rounded-full mx-auto mb-5" />
              <h3 className="text-lg font-extrabold text-white italic uppercase tracking-tighter text-center">Slotu Doldur</h3>
              <p className="text-[0.625rem] text-ink-4 font-bold uppercase tracking-widest text-center mt-1 mb-5">
                { { 'GK': 'Kaleci', 'DEF': 'Defans', 'MID': 'Orta Saha', 'FWD': 'Forvet' }[normalizeRole(fillSlot.role)] || 'Pozisyon' } · Rezerve senin
              </p>
              <div className="space-y-3">
                <button onClick={() => handleSelfAssign(fillSlot.id)} disabled={isProcessing}
                  className="w-full py-3.5 rounded-2xl font-extrabold text-sm uppercase tracking-widest text-on-primary bg-primary active:scale-95 transition-all shadow-[0_0_20px_rgba(57,255,20,0.3)] flex items-center justify-center gap-2 disabled:opacity-60">
                  {isProcessing ? <Loader2 size={16} className="animate-spin" /> : <><UserPlus size={15} /> KENDİMİ EKLE</>}
                </button>
                <button onClick={() => { setAssignPickerSlotId(fillSlot.id); setFillSlot(null); }}
                  className="w-full py-3.5 rounded-2xl font-extrabold text-sm uppercase tracking-widest text-white bg-white/5 border border-white/12 active:scale-95 transition-all flex items-center justify-center gap-2">
                  <Users size={15} /> ARKADAŞ EKLE
                </button>
                <button onClick={() => handleMakeSlotCode(fillSlot.id)}
                  className="w-full py-3.5 rounded-2xl font-extrabold text-sm uppercase tracking-widest text-warning bg-warning/8 border border-warning/25 active:scale-95 transition-all flex items-center justify-center gap-2">
                  <KeyRound size={15} /> DEVRALMA KODU ÜRET
                </button>
                <button onClick={() => handleRelease(fillSlot.id)} disabled={isProcessing}
                  className="w-full py-3 rounded-2xl font-extrabold text-[0.6875rem] uppercase tracking-widest text-red-400/80 hover:text-red-400 transition-colors">
                  Slotu İade Et (ücret cüzdanına döner)
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Arkadaş Atama — GERÇEK arkadaş listesi (friendships/get_friends) ── */}
      {assignPickerSlotId && (
        <MatchSquadPicker
          onClose={() => setAssignPickerSlotId(null)}
          onAddFriends={handleAssignFriends}
          onPickTeam={() => { setAssignPickerSlotId(null); showActionError('Takım kadrosu ataması Maç Oluştur akışından yapılır.'); }}
          onToast={(m) => showActionSuccess(m)}
          assignedIds={assignedIds}
          openSlotCount={myReservedSlots.length}
        />
      )}

      {/* ── Taktik Öner — kendi Stüdyo taktiklerinden seç (kişi başı 1) ────── */}
      <AnimatePresence>
        {showTacticPicker && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-end justify-center"
            onClick={() => setShowTacticPicker(false)}>
            <motion.div
              initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 26, stiffness: 280 }}
              onClick={e => e.stopPropagation()}
              className="bg-surface-1 border-t border-white/10 w-full max-w-md rounded-t-[36px] p-6 pb-10 shadow-[0_-20px_50px_rgba(0,0,0,0.8)]">
              <div className="w-12 h-1 bg-white/20 rounded-full mx-auto mb-5" />
              <h3 className="text-lg font-extrabold text-white italic uppercase tracking-tighter text-center">Taktik Öner</h3>
              <p className="text-[0.625rem] text-ink-4 font-bold uppercase tracking-widest text-center mt-1 mb-4">
                Stüdyo taktiklerinden birini seç — kişi başı 1 öneri
              </p>
              {myTactics.length === 0 ? (
                <div className="text-center py-8">
                  <Layers size={26} className="text-ink-4 mx-auto mb-2" />
                  <p className="text-xs text-ink-4 font-bold">Henüz kayıtlı taktiğin yok.</p>
                  <button onClick={() => { setShowTacticPicker(false); navigateTo('STUDIO'); }}
                    className="mt-3 px-4 py-2.5 rounded-xl bg-white/[0.06] border border-line-strong text-ink text-[0.625rem] font-extrabold uppercase tracking-widest active:scale-95 transition-all">
                    Stüdyo'da Taktik Çiz
                  </button>
                </div>
              ) : (
                <div className="space-y-2 max-h-[46vh] overflow-y-auto custom-scrollbar pr-1">
                  {myTactics.map(t => (
                    <button key={t.id} onClick={() => handleProposeTactic(t.id)}
                      className="w-full flex items-center justify-between gap-3 bg-black/30 border border-white/8 rounded-2xl p-3.5 text-left hover:border-line-strong active:scale-[0.99] transition-all">
                      <div className="min-w-0">
                        <p className="text-sm font-extrabold text-white truncate">{t.name || 'Taktik'}</p>
                        <p className="text-[0.625rem] text-ink-4 font-bold uppercase tracking-wide mt-0.5">
                          {[t.formation, t.size].filter(Boolean).join(' · ') || '—'}
                        </p>
                      </div>
                      <ChevronRight size={15} className="text-ink-4 shrink-0" />
                    </button>
                  ))}
                </div>
              )}
            </motion.div>
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
              className="bg-surface-1 border-t border-white/10 w-full max-w-md rounded-t-[36px] p-6 pb-10 shadow-[0_-20px_50px_rgba(0,0,0,0.8)]"
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
                          <h3 className="text-xl font-extrabold text-white italic uppercase tracking-tighter">{title}</h3>
                          <p className="text-[0.625rem] font-extrabold uppercase tracking-widest mt-0.5" style={{ color: accent }}>
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
                        <p className="text-[0.625rem] font-extrabold text-ink-4 uppercase tracking-widest">Uygun {isGK ? 'kaleci' : 'hakem'}ler aranıyor…</p>
                      </div>
                    ) : providerSuggestions.length === 0 ? (
                      <div className="text-center py-12 space-y-3">
                        <Icon size={34} className="text-ink-4 mx-auto" />
                        <p className="text-xs font-bold text-ink-4 uppercase tracking-widest">
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
                                    <div className="w-12 h-12 rounded-xl flex items-center justify-center font-extrabold border" style={{ background: accent + '1a', color: accent, borderColor: accent + '50' }}>
                                      {getInitials(p.name)}
                                    </div>
                                  )}
                                  {p.is_elite && (
                                    <div className="absolute -bottom-1 -right-1 p-0.5 rounded-md bg-warning-bg border-2 border-surface-1">
                                      <Award size={10} className="text-warning" />
                                    </div>
                                  )}
                                </div>
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center justify-between gap-2">
                                    <h4 className="text-sm font-extrabold text-white uppercase tracking-tight italic truncate">{p.name}</h4>
                                    <div className="flex items-center gap-1 bg-white/5 px-2 py-0.5 rounded text-[0.6875rem] font-extrabold text-yellow-400 shrink-0">
                                      <Star size={10} fill="currentColor" /> {Number(p.rating).toFixed(1)}
                                    </div>
                                  </div>
                                  <p className="text-[0.625rem] text-ink-4 font-bold uppercase tracking-wide mt-0.5 truncate">
                                    {[p.level, `${p.match_count} Maç`].filter(Boolean).join(' • ')}
                                  </p>
                                </div>
                              </div>

                              <div className="flex items-center justify-between pt-1">
                                <div>
                                  <p className="text-[0.625rem] font-extrabold text-ink-4 uppercase tracking-widest">Ücret</p>
                                  <p className="text-xl font-extrabold text-white tracking-tighter">{money(p.fee)}</p>
                                </div>
                                <div className="flex items-center gap-2">
                                  <span className="flex items-center gap-0.5 text-[0.625rem] font-extrabold uppercase tracking-widest text-ink-4">Detay <ChevronRight size={12} /></span>
                                  <motion.button
                                    whileHover={disabled ? undefined : { scale: 1.04 }}
                                    whileTap={disabled ? undefined : { scale: 0.96 }}
                                    disabled={disabled}
                                    onClick={(e) => { e.stopPropagation(); handleSelectProvider(p); }}
                                    className="px-4 py-2.5 rounded-xl font-extrabold text-[0.625rem] uppercase tracking-widest text-on-primary transition-all flex items-center justify-center gap-1.5 disabled:opacity-50"
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
              className="relative w-[20rem] max-h-[85vh] overflow-y-auto custom-scrollbar rounded-[28px] bg-gradient-to-b from-surface-1 to-[#0d1117] border shadow-[0_30px_70px_rgba(0,0,0,0.85)]"
              style={{ borderColor: (providerModalType === 'REF' ? '#A78BFA' : '#FF9F43') + '33' }}>
              {(() => {
                const p = marketDetailProvider;
                const isRef = providerModalType === 'REF';
                const accent = isRef ? '#A78BFA' : '#FF9F43';
                const submitting = providerSubmittingId === p.id;
                const tarzlar = extractProviderStyles(p, isRef);
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
                        <img src={p.avatar!} alt={p.name} className="w-full h-full object-cover bg-bg" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-3xl font-extrabold" style={{ background: accent + '22', color: accent }}>
                          {getInitials(p.name)}
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-xl font-extrabold text-white tracking-tight text-center leading-tight">{p.name}</h3>
                      {p.is_elite && <Award size={16} className="text-warning shrink-0" />}
                    </div>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-[0.625rem] font-extrabold uppercase tracking-[0.25em]" style={{ color: accent }}>{isRef ? 'HAKEM' : 'KİRALIK KALECİ'}</span>
                      {isRef && p.level && <span className="text-[0.625rem] font-bold text-ink-4 uppercase tracking-wide">· {p.level}</span>}
                    </div>

                    <div className="w-full grid grid-cols-2 gap-2 mt-5">
                      <div className="rounded-2xl border py-4 flex flex-col items-center gap-1" style={{ borderColor: accent + '33', background: accent + '10' }}>
                        <span className="text-[0.625rem] font-extrabold uppercase tracking-[0.2em] text-ink-4">REYTİNG</span>
                        <div className="flex items-baseline gap-1">
                          <Star size={16} className="text-yellow-400" fill="currentColor" />
                          <span className="text-3xl font-extrabold tabular-nums leading-none" style={{ color: accent }}>{Number(p.rating).toFixed(1)}</span>
                        </div>
                      </div>
                      <div className="rounded-2xl border border-white/8 bg-white/[0.04] py-4 flex flex-col items-center gap-1">
                        <span className="text-[0.625rem] font-extrabold uppercase tracking-[0.2em] text-ink-4">ÜCRET</span>
                        <span className="text-3xl font-extrabold tabular-nums leading-none text-white">{money(p.fee)}</span>
                      </div>
                    </div>

                    <div className="w-full grid grid-cols-3 gap-2 mt-2">
                      {infoRow.map(s => (
                        <div key={s.l} className="bg-white/[0.03] border border-white/8 rounded-xl py-2.5 flex flex-col items-center gap-0.5">
                          <s.Icon size={12} className="text-ink-4" />
                          <span className="text-[0.625rem] font-extrabold text-ink-4 uppercase tracking-[0.1em]">{s.l}</span>
                          <span className="text-xs font-extrabold text-white">{s.v}</span>
                        </div>
                      ))}
                    </div>

                    {tarzlar.length > 0 && (
                      <div className="w-full mt-5">
                        <span className="text-[0.625rem] font-extrabold uppercase tracking-[0.2em] text-ink-4 ml-1">{isRef ? 'Yönetim Tarzı' : 'Kaleci Tarzı'}</span>
                        <div className="mt-2 flex flex-wrap gap-2">
                          {tarzlar.map(t => (
                            <span
                              key={t}
                              className="px-3 py-1.5 rounded-xl text-[0.6875rem] font-extrabold border"
                              style={{ background: accent + '1a', borderColor: accent + '55', color: accent }}
                            >
                              {t}
                            </span>
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
                        className="flex-1 py-3.5 rounded-2xl font-extrabold text-[0.6875rem] uppercase tracking-widest text-on-primary transition-all flex items-center justify-center gap-1.5 disabled:opacity-60"
                        style={{ background: accent, boxShadow: `0 0 20px ${accent}55` }}>
                        {submitting ? <Loader2 size={15} className="animate-spin" /> : <><Wallet size={14} /> Cüzdanla</>}
                      </motion.button>
                      <motion.button
                        whileTap={submitting ? undefined : { scale: 0.97 }}
                        disabled={!!providerSubmittingId}
                        onClick={() => handleSelectProvider(p, 'CARD')}
                        className="flex-1 py-3.5 rounded-2xl font-extrabold text-[0.6875rem] uppercase tracking-widest text-white bg-white/8 border border-white/15 transition-all flex items-center justify-center gap-1.5 disabled:opacity-60">
                        <CreditCard size={14} /> Kartla
                      </motion.button>
                    </div>
                    <p className="text-center mt-2 text-sm font-extrabold" style={{ color: accent }}>{money(p.fee)}</p>
                    <p className="text-[0.6875rem] text-ink-4 text-center mt-1 leading-relaxed px-2">
                      Ücret emanete alınır; {isRef ? 'hakem' : 'kaleci'} onaylayınca aktarılır. Reddedilir/no-show olursa iade edilir.
                    </p>
                  </div>
                );
              })()}
              <button onClick={() => { if (!providerSubmittingId) setMarketDetailProvider(null); }}
                aria-label="Kapat" className="absolute top-4 right-4 w-11 h-11 rounded-full bg-white/10 flex items-center justify-center text-white/70 hover:bg-white/20 transition-colors backdrop-blur-md z-10">
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
              const tarzlar = extractProviderStyles(p, isRef);
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
                        <img src={p.avatar!} alt={p.name} className="w-full h-full object-cover bg-bg" />
                      ) : (
                        <div className={`w-full h-full flex items-center justify-center text-3xl font-extrabold ${initialsBg}`}>
                          {getInitials(p.name)}
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-xl font-extrabold text-white tracking-tight text-center leading-tight">{p.name}</h3>
                      {p.isElite && <Award size={16} className="text-warning shrink-0" />}
                    </div>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-[0.625rem] font-extrabold uppercase tracking-[0.25em]" style={{ color: accent }}>{isRef ? 'ATANAN HAKEM' : 'KİRALIK KALECİ'}</span>
                      {isRef && p.level && <span className="text-[0.625rem] font-bold text-ink-4 uppercase tracking-wide">· {p.level}</span>}
                    </div>

                    {/* Reyting + Ücret */}
                    <div className="w-full grid grid-cols-2 gap-2 mt-5">
                      <div className="rounded-2xl border py-4 flex flex-col items-center gap-1" style={{ borderColor: accent + '33', background: accent + '10' }}>
                        <span className="text-[0.625rem] font-extrabold uppercase tracking-[0.2em] text-ink-4">REYTİNG</span>
                        <div className="flex items-baseline gap-1">
                          <Star size={16} className="text-yellow-400" fill="currentColor" />
                          <span className="text-3xl font-extrabold tabular-nums leading-none" style={{ color: accent }}>{p.rating != null ? p.rating.toFixed(1) : '—'}</span>
                        </div>
                      </div>
                      <div className="rounded-2xl border border-white/8 bg-white/[0.04] py-4 flex flex-col items-center gap-1">
                        <span className="text-[0.625rem] font-extrabold uppercase tracking-[0.2em] text-ink-4">ÜCRET</span>
                        <span className="text-3xl font-extrabold tabular-nums leading-none text-white">{money(p.fee)}</span>
                      </div>
                    </div>

                    {/* Bilgi satırı */}
                    <div className="w-full grid grid-cols-3 gap-2 mt-2">
                      {infoRow.map(s => (
                        <div key={s.l} className="bg-white/[0.03] border border-white/8 rounded-xl py-2.5 flex flex-col items-center gap-0.5">
                          <s.Icon size={12} className="text-ink-4" />
                          <span className="text-[0.625rem] font-extrabold text-ink-4 uppercase tracking-[0.1em]">{s.l}</span>
                          <span className="text-xs font-extrabold text-white">{s.v}</span>
                        </div>
                      ))}
                    </div>

                    {/* Reytingler — admin panelindeki tüm yetenekler */}
                    {tarzlar.length > 0 && (
                      <div className="w-full mt-5">
                        <span className="text-[0.625rem] font-extrabold uppercase tracking-[0.2em] text-ink-4 ml-1">{isRef ? 'Yönetim Tarzı' : 'Kaleci Tarzı'}</span>
                        <div className="mt-2 flex flex-wrap gap-2">
                          {tarzlar.map(t => (
                            <span
                              key={t}
                              className="px-3 py-1.5 rounded-xl text-[0.6875rem] font-extrabold border"
                              style={{ background: accent + '1a', borderColor: accent + '55', color: accent }}
                            >
                              {t}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
              <button onClick={() => setProviderDetail(null)}
                aria-label="Kapat" className="absolute top-4 right-4 w-11 h-11 rounded-full bg-white/10 flex items-center justify-center text-white/70 hover:bg-white/20 transition-colors backdrop-blur-md z-10">
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
              <h3 className="text-lg font-extrabold text-white tracking-tight">Kaleci gelmedi mi?</h3>
              <p className="text-[0.6875rem] text-white/50 leading-relaxed mt-2 px-1">
                No-show bildirdiğinde ödediğin ücret iade edilir ve maçın slot ücreti
                ({money(match.price ?? 0)}) ceza olarak kalecinin teminatından sana aktarılır.
                Kaleci 48 saat içinde itiraz edebilir.
              </p>
              <div className="w-full flex gap-2 mt-5">
                <button disabled={isProcessing} onClick={() => setShowNoShowConfirm(false)}
                  className="flex-1 py-3 rounded-2xl font-extrabold text-[0.6875rem] uppercase tracking-widest text-white/70 bg-white/5 border border-white/10 disabled:opacity-50">
                  Vazgeç
                </button>
                <button disabled={isProcessing} onClick={handleReportNoShow}
                  className="flex-1 py-3 rounded-2xl font-extrabold text-[0.6875rem] uppercase tracking-widest text-white bg-red-500 active:scale-95 transition-all flex items-center justify-center gap-1.5 disabled:opacity-60">
                  {isProcessing ? <Loader2 size={14} className="animate-spin" /> : 'Bildir'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── HEADER ─────────────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-20 bg-bg/90 backdrop-blur-2xl border-b border-white/5 shadow-[0_4px_30px_rgba(0,0,0,0.4)]">
        {/* Navigasyon Satırı */}
        <div className="flex items-center gap-3 px-5 pt-safe pt-2 pb-3">
          <button onClick={onBack}
            aria-label="Geri"
            className="w-11 h-11 flex items-center justify-center bg-white/5 rounded-full border border-white/10 text-white hover:bg-white/10 active:scale-95 transition-all">
            <ArrowLeft size={20} />
          </button>
          <div className="flex-1 min-w-0">
            <h1 className="text-[0.9375rem] font-extrabold text-white italic uppercase tracking-tighter leading-tight truncate">
              Maç Lobisi
            </h1>
            <p className="text-[0.625rem] text-ink-4 font-bold uppercase tracking-[0.2em] mt-0.5 truncate">
              {match.title || 'Maç Detayı'}
            </p>
          </div>
          {/* Sağ Aksiyon: MANAGE'de Maçtan Ayrıl; DISCOVER'da yalnız doluluk göstergesi */}
          {(isManageMode && (isAlreadyJoined || isAlreadyJoinedReserve)) ? (
            <button
              onClick={() => setShowLeaveConfirm(true)}
              className="px-3 py-1.5 rounded-full bg-red-500/10 border border-red-500/20 text-red-500 text-[0.625rem] font-extrabold uppercase tracking-widest hover:bg-red-500 hover:text-white transition-colors">
              {isAlreadyJoinedReserve ? 'Yedeklikten Ayrıl' : 'Maçtan Ayrıl'}
            </button>
          ) : (
            <div className="flex items-center gap-1.5 bg-white/5 border border-white/10 px-3 py-1.5 rounded-full">
              <Users size={11} className="text-white/50" />
              <span className="text-[0.6875rem] font-extrabold text-white/80">{takenSlots}/{totalSlots}</span>
            </div>
          )}
        </div>

        {/* ── 7c: KAPORA DURUMU (yalnız kaptan) ────────────────────────────────
            Kapora ödendiğinde para cüzdandan çıkıyor ama nereye gittiği ve ne
            zaman döneceği hiçbir oyuncu ekranında yazmıyordu; bilgi yalnız
            yönetim panelindeydi. Kaptan artık kendi parasını burada görür. */}
        {isManageMode && isCaptain && kaporaTutari > 0 && (kaporaBloke || kaporaTahsil) && (
          <div className="px-4 pb-3">
            <div className={`flex items-start gap-2.5 px-3.5 py-3 rounded-2xl border ${
              kaporaBloke
                ? 'bg-warning/[0.07] border-warning/25'
                : 'bg-primary/[0.06] border-primary/22'
            }`}>
              {kaporaBloke
                ? <Lock size={14} className="text-warning shrink-0 mt-0.5" />
                : <CheckCircle2 size={14} className="text-primary shrink-0 mt-0.5" />}
              <div className="min-w-0">
                <p className="text-[0.75rem] font-extrabold text-white leading-tight">
                  {kaporaBloke
                    ? `Kaporan ${money(kaporaTutari)} güvencede`
                    : `Kapora tahsil edildi · payın ${money(kendiPayi)}`}
                </p>
                <p className="text-[0.6875rem] font-semibold text-ink-4 leading-snug mt-0.5">
                  {kaporaBloke
                    ? (kaporaIadesi > 0
                        ? `Kadro dolarsa ${money(kaporaIadesi)} cüzdanına döner; dolmazsa tamamı iade edilir.`
                        : 'Kadro dolmazsa tamamı cüzdanına iade edilir.')
                    : (kaporaIadesi > 0
                        ? `${money(kaporaIadesi)} cüzdanına iade edildi.`
                        : 'Kaporanın tamamı katılım payına sayıldı.')}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* ── IP-06 / BULGU-078: eksik oyuncu ilanı — yakındaki oyunculara tek
            dokunuş çağrı. Olumlu aksiyon, yıkıcı aksiyonun ÜSTÜNDE durur. ── */}
        {isManageMode && isCaptain && (match.status === 'OPEN' || match.status === 'ACTIVE') && openSlotCount > 0 && (
          <div className="px-4 pb-3">
            <button
              onClick={handleBroadcastOpenSlot}
              disabled={broadcasting}
              className="w-full min-h-[44px] flex items-center justify-center gap-2 px-4 rounded-2xl bg-white/[0.06] border border-line-strong text-ink text-[0.8125rem] font-bold active:scale-[0.98] transition-transform disabled:opacity-60"
            >
              <Megaphone size={16} /> {broadcasting ? 'İlan gönderiliyor…' : 'Eksik oyuncu ilanı ver'}
            </button>
          </div>
        )}

        {/* ── B4: Maçı İptal Et (yalnız kurucu, yönetim lobisi) ── */}
        {isManageMode && isCaptain && match.status !== 'CANCELLED' && match.status !== 'COMPLETED' && (
          <div className="px-4 pb-3">
            <button
              onClick={() => setShowCancelConfirm(true)}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-2xl bg-red-500/[0.06] border border-red-500/25 text-red-400 text-[0.625rem] font-extrabold uppercase tracking-widest hover:bg-red-500/15 active:scale-[0.98] transition-all"
            >
              <AlertCircle size={13} /> Maçı İptal Et
            </button>
          </div>
        )}

        {/* ── Özel Maç Kodu (yalnız kaptana) ── */}
        {match.visibility === 'PRIVATE' && privateCode && isCaptain && (
          <div className="px-4 pb-3">
            <button
              onClick={() => {
                const code = privateCode!;
                if (navigator.clipboard?.writeText) {
                  navigator.clipboard.writeText(code).then(
                    () => showActionSuccess(`Kod kopyalandı: ${code}`),
                    () => showActionSuccess(`Kod: ${code}`),
                  );
                } else {
                  showActionSuccess(`Kod: ${code}`);
                }
              }}
              className="w-full flex items-center justify-between gap-3 px-4 py-3 rounded-2xl bg-warning/[0.06] border border-warning/25 hover:bg-warning/10 active:scale-[0.98] transition-all"
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-8 h-8 rounded-full bg-warning/10 border border-warning/30 flex items-center justify-center shrink-0">
                  <KeyRound size={14} className="text-warning" />
                </div>
                <div className="text-left min-w-0">
                  <p className="text-[0.625rem] font-extrabold uppercase tracking-[0.2em] text-warning/70">Özel Maç Kodu</p>
                  <p className="text-lg font-extrabold tracking-[0.3em] text-white truncate">{privateCode}</p>
                </div>
              </div>
              <span className="flex items-center gap-1 text-[0.625rem] font-extrabold uppercase tracking-widest text-warning shrink-0">
                <Copy size={12} /> Paylaş
              </span>
            </button>
          </div>
        )}

        {/* ── Minimalist Maç Başlığı ── */}
        <div className="px-4 pb-3">
          {/* VS Şeridi */}
          <div className="flex items-stretch gap-1.5 mb-2">
            {/* Ev Sahibi — aktifken yavaş nabız (index.css team-pulse-active; reduce-motion'da durur) */}
            <button
              onClick={() => { setPitchSide('home'); setHasAutoSelectedSide(true); }}
              style={{ '--pulse-color': 'rgba(255,255,255,0.2)' } as React.CSSProperties}
              className={`flex-1 flex items-center gap-2 px-4 py-3.5 rounded-xl border transition-all active:scale-[0.97] ${
                pitchSide === 'home'
                  ? 'bg-white/8 border-white/25 team-pulse-active'
                  : 'bg-transparent border-white/5 opacity-55'
              }`}
            >
              <div className={`w-2.5 h-2.5 rounded-full shrink-0 ${homeTeam ? 'bg-white shadow-[0_0_6px_rgba(255,255,255,0.6)]' : 'bg-white/40'}`} />
              <p className="text-[0.8125rem] font-extrabold text-white uppercase italic tracking-tight truncate leading-tight flex-1 min-w-0 text-left pr-1.5">
                {match.homeTeamName || homeTeam?.name || 'BEYAZ'}
              </p>
              <span className="text-[0.6875rem] font-extrabold text-white/55 tabular-nums shrink-0">{takenSlots}/{totalSlots}</span>
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

            {/* Deplasman — aktifken yavaş nabız (kırmızı ışıma) */}
            <button
              onClick={() => { setPitchSide('away'); setHasAutoSelectedSide(true); }}
              style={{ '--pulse-color': 'rgba(248,113,113,0.28)' } as React.CSSProperties}
              className={`flex-1 flex items-center gap-2 px-4 py-3.5 rounded-xl border transition-all active:scale-[0.97] ${
                pitchSide === 'away'
                  ? 'bg-red-500/8 border-red-500/25 team-pulse-active'
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
              <span className="text-[0.6875rem] font-extrabold text-white/55 tabular-nums shrink-0">{takenAway}/{totalAway}</span>
              <p className={`text-[0.8125rem] font-extrabold uppercase italic tracking-tight truncate leading-tight flex-1 min-w-0 text-right pr-1.5 ${
                (match.awayTeamName || awayTeam?.name) ? 'text-white' : 'text-red-300'
              }`}>
                {match.awayTeamName || awayTeam?.name || 'KIRMIZI'}
              </p>
              <div className="w-2.5 h-2.5 rounded-full shrink-0 bg-red-400 shadow-[0_0_8px_rgba(248,113,113,0.8)]" />
            </button>
          </div>

          {/* Bilgi + Badge Şeridi */}
          <div className="flex items-center gap-2 mb-2">
            <button onClick={() => setShowMapModal(true)}
              className="flex items-center gap-1 text-[0.6875rem] font-bold text-white/50 transition-colors min-w-0 flex-1">
              <MapPin size={9} className="text-ink-4 shrink-0" />
              <span className="truncate">
                {match.location || 'Konum'}
                {(() => {
                  // Konum zaten kort adıyla bitiyorsa tekrar ekleme ("1. Saha · 1. Saha")
                  const cn = (match as { courtName?: string }).courtName;
                  return cn && !(match.location || '').includes(cn) ? ` · ${cn}` : '';
                })()}
              </span>
            </button>
            <div className="flex items-center gap-1 text-[0.6875rem] font-bold text-ink-4 shrink-0">
              <Calendar size={9} />
              <span>{match.date || '—'}</span>
              <span className="text-ink-4">•</span>
              <Clock size={9} />
              <span>{match.time || '—'}</span>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              {(match as any).is_platform && (
                <span className="px-1.5 py-0.5 rounded-md text-[0.6875rem] font-extrabold uppercase text-warning bg-warning-bg border border-warning-line"
                  title="OYNA Organizasyonu — platform maçı">
                  OYNA
                </span>
              )}
              <span className="px-1.5 py-0.5 rounded-md text-[0.6875rem] font-extrabold uppercase border"
                style={{ color: diffConf.color, borderColor: diffConf.color + '40', background: diffConf.color + '12' }}>
                {diffConf.label}
              </span>
              <span className="px-1.5 py-0.5 rounded-md text-[0.6875rem] font-extrabold uppercase text-white/70 bg-white/8 border border-white/10">
                {trUpper(squadSize)}
              </span>
            </div>
          </div>

          {/* Kurallar Butonu */}
          <button
            onClick={() => setShowInfoModal(true)}
            className="w-full flex items-center justify-between gap-2 py-2 px-3 rounded-xl bg-white/4 border border-white/8 hover:border-white/20 transition-all active:scale-[0.98] cursor-pointer"
          >
            <div className="flex items-center gap-2">
              <Info size={11} className="text-ink-4" />
              <span className="text-[0.625rem] font-extrabold uppercase tracking-widest text-white/50">Maç Kuralları & Finans</span>
            </div>
            <ChevronRight size={11} className="text-ink-4" />
          </button>
        </div>
      </header>

      {/* ── MAIN CONTENT ───────────────────────────────────────────────────── */}
      <main className="flex-1 px-4 overflow-y-auto custom-scrollbar pb-36 pt-4">

        <>
            {/* Kadro Durumu Mesajı */}
            {isAlreadyJoined && (
              <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}
                className="mb-4 flex items-center gap-3 bg-primary/10 border border-primary/20 rounded-2xl px-4 py-3">
                <CheckCircle2 size={16} className="text-primary shrink-0" />
                <p className="text-xs font-bold text-primary">
                  Kadrodasın! Satın aldığın rezerve slotları Maçlarım lobisinden doldurabilirsin.
                </p>
              </motion.div>
            )}


        {/* ── Takım planı önizlemesi — yalnız atanan takımın üyeleri (L76) ── */}
        <TeamPlanBanner matchId={match.id} />

        {/* ── Taktik Önerileri — kişi başı 1 (YALNIZ Maçlarım lobisi) ────── */}
        {isManageMode && (
          <div className="mb-6">
            <div className="flex items-center justify-between mb-2 px-1">
              <p className="text-[0.625rem] font-extrabold text-ink-4 uppercase tracking-[0.2em]">Taktik Önerileri</p>
              <button
                onClick={async () => { setMyTactics(await listMyTacticsLite()); setShowTacticPicker(true); }}
                className="text-[0.625rem] font-extrabold uppercase tracking-widest text-ink bg-white/[0.06] border border-line-strong px-2.5 py-1.5 rounded-xl active:scale-95 transition-all">
                + Taktik Öner
              </button>
            </div>
            {tacticProposals.length === 0 ? (
              <p className="text-[0.6875rem] text-ink-4 italic px-1">Henüz öneri yok — Stüdyo taktiğini ilk öneren sen ol.</p>
            ) : (
              <div className="flex gap-2 overflow-x-auto pb-1 custom-scrollbar">
                {tacticProposals.map(p => (
                  <button key={p.proposer_id}
                    onClick={() => { setStudioContext({ tacticId: p.tactic_id }); navigateTo('STUDIO'); }}
                    className="shrink-0 min-w-[150px] text-left bg-surface-1/80 border border-white/8 rounded-2xl p-3 hover:border-line-strong active:scale-[0.98] transition-all">
                    <p className="text-[0.6875rem] font-extrabold text-white truncate">{p.tactic_name || 'Taktik'}</p>
                    <p className="text-[0.625rem] text-ink-4 font-bold uppercase tracking-wide truncate mt-0.5">
                      {[p.formation, p.size].filter(Boolean).join(' · ') || '—'}
                    </p>
                    <p className="text-[0.6875rem] text-ink-3 font-bold truncate mt-1.5">{p.proposer_name}</p>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

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
                  ? 'bg-white'
                  : 'bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.9)]'
              }`} />
              <p className="text-[0.625rem] font-extrabold text-white/50 uppercase tracking-[0.2em]">
                {pitchSide === 'home'
                  ? `${match.homeTeamName || homeTeam?.name || 'BEYAZ'} Kadrosu`
                  : `${match.awayTeamName || awayTeam?.name || 'KIRMIZI'} Kadrosu`}
              </p>
            </div>
            {selectedSlotIds.length > 0 && (
              <motion.span initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }}
                className="text-[0.625rem] font-extrabold uppercase tracking-widest px-2.5 py-1 rounded-full border text-ink bg-white/10 border-white/25">
                {selectedSlotIds.length} Slot Seçildi
              </motion.span>
            )}
          </div>

          {/* Saha Kapsayıcısı */}
          <div className="relative w-full max-w-[380px] mx-auto rounded-[28px] overflow-hidden aspect-[3/4] border-4 border-surface-1 shadow-[0_0_60px_rgba(0,0,0,0.8),inset_0_0_80px_rgba(0,0,0,0.6)]"
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
              const isSelected = selectedSlotIds.includes(slot.id);
              const isTaken = slot.status === 'TAKEN';
              const isOpen = slot.status === 'OPEN';
              const player = slot.player;
              const isMyOwnSlot = player?.id === currentUserProfile?.id;
              // REZERVE: satın alınmış ama oyuncu atanmamış — "DOLU" çizilir.
              const isReserved = !isOpen && !player;
              const isMineReserved = isReserved && (slot as any).purchasedBy === currentUserProfile?.id;
              const isHiredGkHere = slot.id === hiredGkSlotId;

              return (
                <div
                  key={slot.id}
                  className="absolute w-12 h-12 flex items-center justify-center z-10"
                  style={{ left: `${slot.x}%`, top: `${slot.y}%`, transform: 'translate(-50%, -50%)' }}
                >
                  {isHiredGkHere && viewGoalkeeper ? (
                    /* ── Kiralık Kaleci (kalede — yalnız kiralayan tarafın üyeleri görür) ── */
                    <button
                      onClick={() => setProviderDetail({ p: viewGoalkeeper, isRef: false })}
                      className="w-full h-full rounded-full focus:outline-none cursor-pointer"
                    >
                      <motion.div whileHover={{ scale: 1.12 }} whileTap={{ scale: 0.93 }}
                        className="relative w-full h-full flex flex-col items-center justify-center">
                        <div className="relative w-12 h-12 rounded-full overflow-hidden border-2 border-[#FF9F43] shadow-[0_0_16px_rgba(255,159,67,0.6)]">
                          {isRealPhoto(viewGoalkeeper.avatar) ? (
                            <img
                              src={viewGoalkeeper.avatar!}
                              alt={viewGoalkeeper.name}
                              className="w-full h-full object-cover bg-bg"
                            />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center font-extrabold text-[0.9375rem] tracking-tight bg-orange-950/60 text-orange-300">
                              {getInitials(viewGoalkeeper.name)}
                            </div>
                          )}
                        </div>
                        <div className="absolute -top-1 -right-1 p-0.5 rounded-md bg-[#FF9F43] border border-black z-20 pointer-events-none">
                          <Hand size={9} className="text-on-primary" />
                        </div>
                        <div className="absolute top-full left-1/2 transform -translate-x-1/2 mt-1.5 bg-black/90 backdrop-blur-sm px-2 py-0.5 rounded-full border border-[#FF9F43]/40 shadow-md max-w-[64px] z-20 pointer-events-none">
                          <span className="text-[0.6875rem] font-extrabold text-[#FF9F43] whitespace-nowrap uppercase truncate block">
                            {(viewGoalkeeper.name || 'Kaleci').split(' ')[0]}
                          </span>
                        </div>
                      </motion.div>
                    </button>
                  ) : isTaken && player ? (
                    /* ── Dolu Slot ──────────────────────────────── */
                    <button
                      onClick={() => handleSlotClick(slot)}
                      className="w-full h-full rounded-full focus:outline-none cursor-pointer"
                    >
                      <motion.div whileHover={{ scale: 1.12 }} whileTap={{ scale: 0.93 }}
                        className="relative w-full h-full flex flex-col items-center justify-center">
                        <div className={`relative w-12 h-12 rounded-full overflow-hidden border-2 shadow-lg transition-all ${
                          isMyOwnSlot
                            ? 'border-primary shadow-[0_0_16px_rgba(57,255,20,0.7)]'
                            : normalizeRole(slot.role) === 'GK'
                              ? 'border-orange-400 hover:shadow-[0_0_14px_rgba(249,115,22,0.6)]'
                              : 'border-white/25 hover:border-[#00f2fe] hover:shadow-[0_0_14px_rgba(0,242,254,0.5)]'
                        }`}>
                          {isRealPhoto(player.avatar) ? (
                            <img
                              src={player.avatar}
                              alt={player.name || 'Oyuncu'}
                              className="w-full h-full object-cover bg-bg"
                            />
                          ) : (
                            <div className={`w-full h-full flex items-center justify-center font-extrabold text-[0.9375rem] tracking-tight ${
                              pitchSide === 'home'
                                ? 'bg-white/[0.08] text-white border border-white/20'
                                : 'bg-error-bg text-error border border-error-line'
                            }`}>
                              {getInitials(player.name)}
                            </div>
                          )}
                          {isMyOwnSlot && (
                            <div className="absolute inset-0 bg-primary/10" />
                          )}
                        </div>
                        {/* C9 — split ödeme görünürlüğü: bu slotu SEN ödedin (oyuncu başkası) */}
                        {!isMyOwnSlot && (slot as any).purchasedBy === currentUserProfile?.id && (
                          <div className="absolute -top-1 -right-1 w-[15px] h-[15px] rounded-full bg-primary border border-bg flex items-center justify-center z-30 pointer-events-none shadow-[0_0_8px_rgba(57,255,20,0.6)]"
                               title="Bu slotu sen ödedin">
                            <span className="text-[0.6875rem] font-extrabold text-on-primary leading-none">₺</span>
                          </div>
                        )}
                        <div className="absolute top-full left-1/2 transform -translate-x-1/2 mt-1.5 bg-black/90 backdrop-blur-sm px-2 py-0.5 rounded-full border border-white/10 shadow-md max-w-[64px] z-20 pointer-events-none">
                          <span className="text-[0.6875rem] font-extrabold text-white whitespace-nowrap uppercase truncate block">
                            {isMyOwnSlot ? 'SEN' : (player.name || 'Oyuncu').split(' ')[0]}
                          </span>
                        </div>
                      </motion.div>
                    </button>
                  ) : isOpen ? (
                    (
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
                              ? 'bg-primary border-white text-on-primary shadow-[0_0_28px_rgba(57,255,20,0.9)] scale-110'
                              : 'bg-black/50 border-white/25 text-white/60 hover:border-primary/50 backdrop-blur-md'
                          }`}>
                            {isSelected ? (
                              <CheckCircle2 size={20} className="drop-shadow-md" />
                            ) : (
                              <>
                                <span className="text-[0.625rem] font-extrabold uppercase tracking-wider leading-none">
                                  { { 'GK': 'KL', 'DEF': 'SAV', 'MID': 'ORT', 'FWD': 'HÜC' }[normalizeRole(slot.role)] || 'ORT' }
                                </span>
                                <div className={`absolute -top-1 -right-1 w-4.5 h-4.5 rounded-full text-on-primary flex items-center justify-center border border-black shadow-md z-20 ${
                                  isSelected ? 'bg-white' : 'bg-primary'
                                }`}>
                                  <Plus size={10} strokeWidth={3} />
                                </div>
                              </>
                            )}
                          </div>
                          <div className="absolute top-full left-1/2 transform -translate-x-1/2 mt-1.5 bg-black/70 px-1.5 py-0.5 rounded-full border border-white/10 max-w-[64px] z-20 pointer-events-none">
                            <span className={`text-[0.6875rem] font-extrabold uppercase truncate block whitespace-nowrap ${
                              isSelected ? 'text-primary' : 'text-ink-4'
                            }`}>
                              {isSelected ? 'SEÇİLDİ' : (
                                { GOALKEEPER: 'KAL', MIDFIELDER: 'ORT', DEFENDER: 'DEF', FORWARD: 'FOR' }[slot.role] ?? slot.role?.slice(0,3) ?? 'BOŞ'
                              )}
                            </span>
                          </div>
                        </motion.div>
                      </button>
                    )
                  ) : isMineReserved && isManageMode ? (
                    /* ── SENİN REZERVEN — doldurmak için dokun ─────── */
                    <button onClick={() => handleSlotClick(slot)} className="w-full h-full rounded-full focus:outline-none cursor-pointer">
                      <motion.div whileHover={{ scale: 1.15 }} whileTap={{ scale: 0.9 }}
                        className="relative w-full h-full flex flex-col items-center justify-center">
                        <div className="w-12 h-12 rounded-full flex items-center justify-center border-2 border-primary bg-primary/15 text-primary shadow-[0_0_18px_rgba(57,255,20,0.45)] animate-pulse">
                          <Plus size={18} strokeWidth={3} />
                        </div>
                        <div className="absolute top-full left-1/2 -translate-x-1/2 mt-1.5 bg-black/85 px-2.5 py-0.5 rounded-full border border-primary/40 z-20 pointer-events-none">
                          <span className="text-[0.625rem] font-extrabold text-primary uppercase tracking-widest whitespace-nowrap">EKLE</span>
                        </div>
                      </motion.div>
                    </button>
                  ) : (
                    /* ── DOLU — rezerve edildi, seçilemez (şeffaf çarpı emekli) ── */
                    <button onClick={() => handleSlotClick(slot)} className="w-full h-full rounded-full focus:outline-none cursor-default">
                      <div className="relative w-full h-full flex flex-col items-center justify-center">
                        <div className={`w-12 h-12 rounded-full flex items-center justify-center border-2 shadow-[inset_0_2px_10px_rgba(0,0,0,0.6)] ${
                          pitchSide === 'home'
                            ? 'bg-white/[0.06] border-white/20 text-white/70'
                            : 'bg-error-bg border-error-line text-error'
                        }`}>
                          <Lock size={15} />
                        </div>
                        <div className={`absolute top-full left-1/2 -translate-x-1/2 mt-1.5 px-2.5 py-0.5 rounded-full border z-20 pointer-events-none ${
                          pitchSide === 'home'
                            ? 'bg-white/[0.08] border-white/25'
                            : 'bg-error-bg border-error-line'
                        }`}>
                          <span className={`text-[0.625rem] font-extrabold uppercase tracking-widest whitespace-nowrap ${
                            pitchSide === 'home' ? 'text-emerald-300' : 'text-red-300'
                          }`}>{isMineReserved ? 'SENİN' : 'DOLU'}</span>
                        </div>
                      </div>
                    </button>
                  )}
                </div>
              );
            })}
          </div>

          <p className="text-center text-[0.625rem] text-ink-4 font-bold mt-3 uppercase tracking-[0.2em]">
            {isAlreadyJoined
              ? 'Kadrodasın — oyunculara dokunup kartlarını görebilirsin'
              : 'Slot seç — ardından aşağıdan "Öde ve Katıl"'}
          </p>

          {/* Yedek Kulübesi (Reserve List) */}
          <div className="mt-4 bg-surface-1/60 border border-white/5 rounded-3xl p-4 max-w-[380px] mx-auto shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]">
            <div className="flex items-center justify-between mb-3 px-1">
              <span className="text-[0.625rem] font-extrabold text-ink-4 uppercase tracking-[0.25em]">
                Yedek Kulübesi ({match.reservePlayers?.length || 0})
              </span>
              {isAlreadyJoinedReserve && (
                <span className="text-[0.625rem] font-extrabold text-warning uppercase tracking-widest animate-pulse">
                  Sıranız: {(match.reservePlayers || []).findIndex(p => p.id === currentUserProfile.id) + 1}
                </span>
              )}
            </div>
            {(!match.reservePlayers || match.reservePlayers.length === 0) ? (
              <p className="text-[0.6875rem] text-ink-4 italic px-1">Yedek listesinde kimse yok. Sıra boş.</p>
            ) : (
              <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
                {match.reservePlayers.map((player, idx) => (
                  <div key={player.id} className="flex flex-col items-center gap-1 shrink-0 bg-black/40 border border-white/5 rounded-2xl p-2.5 min-w-[75px] relative overflow-hidden group">
                    <div className="relative">
                      <img src={player.avatar} alt={player.name} className="w-9 h-9 rounded-full object-cover border border-white/10" />
                      <div className="absolute -bottom-1 -right-1 w-4.5 h-4.5 rounded-full bg-amber-500 border border-black flex items-center justify-center text-[0.6875rem] font-extrabold text-on-primary">
                        {idx + 1}
                      </div>
                    </div>
                    <span className="text-[0.6875rem] font-bold text-white/70 truncate max-w-[65px]">{player.name.split(' ')[0]}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Taktik / Diziliş Seçimi (Yalnızca Kaptanlara Özel) */}
          {isManageMode && isCaptain && (
            <div className="mt-4 bg-surface-1/60 border border-white/5 rounded-3xl p-4 max-w-[380px] mx-auto">
              <span className="block text-[0.625rem] font-extrabold text-ink-4 uppercase tracking-[0.25em] mb-2 px-1">
                TAKIM DİZİLİŞİNİ GÜNCELLE
              </span>
              <div className="flex gap-2 overflow-x-auto pb-1 custom-scrollbar">
                {Object.keys(FORMATIONS[pitchSide === 'home' ? squadSize : inferSquadSize(match.awaySlots?.length || match.slots.length)] || {}).map(fName => (
                  <button
                    key={fName}
                    onClick={async () => {
                      // Kilit ALINMADAN endWrite() çağrılıyordu: çevrimdışı
                      // kapısı yoktu ve çift tık iki yazım gönderebiliyordu.
                      if (!beginWrite(OFFLINE_FORMATION)) return;
                      try {
                        setIsProcessing(true);
                        const sizeVal = pitchSide === 'home' ? squadSize : inferSquadSize(match.awaySlots?.length || match.slots.length);
                        const coords = FORMATIONS[sizeVal]?.[fName];
                        if (coords) {
                          // DAR RPC: yalnız koordinat/rol yazar — doluluk anahtarlarına
                          // dokunamaz (tam-dizi yazımı emekli, KN-3 tamam).
                          const srcSlots = pitchSide === 'home' ? (match.slots || []) : (match.awaySlots || []);
                          const payload = srcSlots.map((s, index) => {
                            const coord = coords[index] || { x: 50, y: 50, role: 'MID' };
                            return { id: s.id, x: coord.x, y: coord.y, role: coord.role };
                          });
                          await rpcPencere(updateFormationRpc(match.id, pitchSide, payload));
                          const fresh = await macTazele();
                        }
                      } catch (err) {
                        if (zamanAsimiIsePaylas(err)) return;
                        console.error(err);
                        showActionError('Diziliş güncellenemedi. Lütfen tekrar dene.');
                      } finally {
                        setIsProcessing(false); endWrite();
                      }
                    }}
                    className="px-3 py-1.5 rounded-xl bg-black/40 border border-white/10 hover:border-line-strong text-white text-[0.625rem] font-extrabold uppercase tracking-wider shrink-0 transition-all active:scale-95 cursor-pointer"
                  >
                    {fName}
                  </button>
                ))}
              </div>
            </div>
          )}
        </motion.div>
        </AnimatePresence>

        {/* ── KALECİ & HAKEM (MANAGE + kaptan). İki taraflı: her kaptan KENDİ ─── */}
        {/* tarafının kalecisini yönetir; hakem maç-tekil (her iki kaptan görür). */}
        {isManageMode && myCaptainSide && (
          <div className="space-y-3 mt-6">
            <p className="text-[0.625rem] font-extrabold text-ink-4 uppercase tracking-[0.2em] ml-1">Kaleci & Hakem</p>

            <div className="grid grid-cols-2 gap-3">
              {(['GK', 'REF'] as ProviderType[]).map((type) => {
                const isGK = type === 'GK';
                // GK kaptanın KENDİ tarafından; REF maç-tekil.
                const assignedId = isGK ? (myCaptainSide === 'away' ? match.awayGkId : match.gkId) : match.refereeId;
                const activeReq = getActiveRequestForType(type);
                const accent = isGK ? '#FF9F43' : '#A78BFA';
                const Icon = isGK ? Hand : Scale;
                const label = isGK ? 'Kaleci' : 'Hakem';
                // FAZ 2: atanmış sağlayıcı adı/avatarı gerçek goalkeepers/referees verisinden
                // (adminUsers güvenilmez); okunamıyorsa genel etikete düşer.
                const assignedProvider = isGK ? (myCaptainSide === 'away' ? assignedAwayGoalkeeper : assignedGoalkeeper) : assignedReferee;
                const providerName = assignedProvider?.name
                  || (assignedId ? (adminUsers || []).find(u => u?.id === assignedId)?.name : null)
                  || label;

                // 1) Atanmış sağlayıcı varsa onun bilgisini göster
                if (assignedId) {
                  return (
                    <div
                      key={type}
                      className="p-4 rounded-2xl bg-surface-1/80 border transition-all flex flex-col items-start gap-2.5 text-left relative group overflow-hidden"
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
                          <div className="w-9 h-9 rounded-xl flex items-center justify-center text-[0.6875rem] font-extrabold border"
                            style={{ background: accent + '1a', color: accent, borderColor: accent + '40' }}>
                            {getInitials(providerName)}
                          </div>
                        )}
                        <div className="p-1.5 rounded-lg border" style={{ background: accent + '1a', color: accent, borderColor: accent + '33' }}>
                          <CheckCircle2 size={13} />
                        </div>
                      </div>
                      <div>
                        <h4 className="font-extrabold text-xs text-white uppercase tracking-wider truncate max-w-[120px]">
                          {providerName}
                        </h4>
                        <p className="text-[0.625rem] font-bold mt-0.5 uppercase tracking-wide" style={{ color: accent }}>
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
                      className="p-4 rounded-2xl bg-surface-1/80 border border-amber-500/30 flex flex-col items-start gap-2.5 text-left relative overflow-hidden"
                    >
                      <div className="absolute top-0 right-0 w-12 h-12 bg-gradient-to-bl from-amber-500/10 to-transparent pointer-events-none" />
                      <div className="p-2.5 rounded-xl bg-amber-500/10 text-amber-400 border border-amber-500/20">
                        <Clock size={16} className={activeReq.status === 'PENDING' ? 'animate-pulse' : ''} />
                      </div>
                      <div>
                        <h4 className="font-extrabold text-xs text-white uppercase tracking-wider">{statusLabel}</h4>
                        <p className="text-[0.625rem] text-ink-4 font-bold mt-0.5 uppercase tracking-wide">
                          Ücret: {money(activeReq.fee)}
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
                    className="p-4 rounded-2xl bg-surface-1/80 border border-white/5 transition-all flex flex-col items-start gap-2.5 text-left relative group overflow-hidden"
                    style={{ ['--accent' as any]: accent }}
                  >
                    <div className="absolute top-0 right-0 w-12 h-12 pointer-events-none"
                      style={{ background: `linear-gradient(to bottom left, ${accent}1a, transparent)` }} />
                    <div className="p-2.5 rounded-xl border transition-all"
                      style={{ background: accent + '1a', color: accent, borderColor: accent + '33' }}>
                      <Icon size={16} />
                    </div>
                    <div>
                      <h4 className="font-extrabold text-xs text-white uppercase tracking-wider">{label} Ekle</h4>
                      <p className="text-[0.625rem] text-ink-4 font-bold mt-0.5 uppercase tracking-wide">
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
                <p className="text-[0.625rem] font-extrabold text-ink-4 uppercase tracking-[0.2em] ml-1">Gelen Başvurular</p>
                {providerApplications.map((req) => {
                  const applicant = (adminUsers || []).find(u => u?.id === req.providerId);
                  const label = req.providerType === 'GK' ? 'Kaleci' : 'Hakem';
                  return (
                    <div key={req.id} className="p-3 rounded-2xl bg-surface-1/80 border border-white/8 flex items-center gap-3">
                      <img src={applicant?.avatar || `https://i.pravatar.cc/150?u=${req.providerId}`} alt="" className="w-9 h-9 rounded-xl object-cover border border-white/10" />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-extrabold text-white truncate">{applicant?.name || label}</p>
                        <p className="text-[0.625rem] text-ink-4 font-bold uppercase tracking-wide">{label} · {money(req.fee)} blokaj</p>
                      </div>
                      <button onClick={() => handleDeclineApplication(req.id)} disabled={reqActionId === req.id}
                        className="px-2.5 py-1.5 rounded-lg text-[0.6875rem] font-extrabold uppercase text-gray-400 border border-white/10 disabled:opacity-50">Reddet</button>
                      <button onClick={() => handleAcceptApplication(req.id)} disabled={reqActionId === req.id}
                        className="px-2.5 py-1.5 rounded-lg text-[0.6875rem] font-extrabold uppercase text-on-primary bg-primary disabled:opacity-50">Kabul</button>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Maç sonu: sağlayıcı geldi mi? kaptan onayı (iki-taraflı payout) */}
            {captainConfirmPending.length > 0 && (
              <div className="space-y-2 mt-1">
                <p className="text-[0.625rem] font-extrabold text-ink-4 uppercase tracking-[0.2em] ml-1">Maç Sonu Onayı</p>
                {captainConfirmPending.map((req) => {
                  const applicant = (adminUsers || []).find(u => u?.id === req.providerId);
                  const label = req.providerType === 'GK' ? 'Kaleci' : 'Hakem';
                  return (
                    <div key={req.id} className="p-3 rounded-2xl bg-surface-1/80 border border-green-500/20 flex items-center gap-3">
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-extrabold text-white truncate">{applicant?.name || label} geldi mi?</p>
                        <p className="text-[0.625rem] text-ink-4 font-bold uppercase tracking-wide">
                          {req.captainConfirmed
                            ? (req.providerConfirmed ? 'Ödeme serbest bırakılıyor…' : 'Sağlayıcının onayı bekleniyor')
                            : 'Onayınca ücret ödenir · Sorun bildirmezsen maç bitiminden 48 saat sonra otomatik onaylanır'}
                        </p>
                      </div>
                      {req.captainConfirmed ? (
                        <span className="px-3 py-1.5 rounded-lg text-[0.6875rem] font-extrabold uppercase text-success border border-success-line">Onayladın ✓</span>
                      ) : (
                        <button onClick={() => handleCaptainConfirm(req.id)} disabled={reqActionId === req.id}
                          className="px-3 py-1.5 rounded-lg text-[0.6875rem] font-extrabold uppercase text-on-primary bg-primary disabled:opacity-50">Onayla</button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ── MAÇ GÖREVLİLERİ (salt-okunur) ───────────────────────────────────── */}
        {/* Hakem HERKESE görünür; kiralık kaleci YALNIZ kendi takımının üyelerine. */}
        {/* İki taraflı: ev sahibi + deplasman kalecisi ayrı kartlar (yetki başına). */}
        {(() => {
          const visibleGks: { gk: MatchProvider; side: 'home' | 'away'; teamName: string }[] = [];
          if (assignedGoalkeeper && canSeeHomeGk)
            visibleGks.push({ gk: assignedGoalkeeper, side: 'home', teamName: match.homeTeamName || homeTeam?.name || 'Ev Sahibi' });
          if (assignedAwayGoalkeeper && canSeeAwayGk)
            visibleGks.push({ gk: assignedAwayGoalkeeper, side: 'away', teamName: match.awayTeamName || awayTeam?.name || 'Deplasman' });
          if (visibleGks.length === 0 && !assignedReferee) return null;
          // F3c: sağlayıcının sunucuya bildirdiği canlı durum (yolda/tesiste) rozeti
          const liveBadge = (providerId: string) => {
            const r = serviceRequests.find(x => x.providerId === providerId
              && (x.status === 'ACCEPTED' || x.status === 'CAPTURED'));
            if (!r?.liveStatus || r.liveStatus === 'PENDING' || r.liveStatus === 'FINISHED') return null;
            const arrived = r.liveStatus === 'ARRIVED';
            return (
              <span className={`shrink-0 px-1.5 py-0.5 rounded text-[0.625rem] font-extrabold uppercase tracking-wider border ${arrived ? 'bg-green-500/15 text-green-400 border-green-500/30' : 'bg-blue-500/15 text-blue-400 border-blue-500/30'}`}>
                {arrived ? 'Tesiste' : 'Yolda'}
              </span>
            );
          };
          return (
          <div className="space-y-3 mt-6">
            <p className="text-[0.625rem] font-extrabold text-ink-4 uppercase tracking-[0.2em] ml-1">Maç Görevlileri</p>

            {visibleGks.map(({ gk, side, teamName }) => (
              <React.Fragment key={side}>
              <button
                onClick={() => setProviderDetail({ p: gk, isRef: false })}
                className="w-full p-4 rounded-2xl bg-surface-1/80 border border-[#FF9F43]/30 flex items-center gap-3 text-left relative overflow-hidden active:scale-[0.99] transition-transform">
                <div className="absolute top-0 right-0 w-16 h-16 pointer-events-none" style={{ background: 'linear-gradient(to bottom left, rgba(255,159,67,0.14), transparent)' }} />
                <div className="relative shrink-0">
                  {isRealPhoto(gk.avatar) ? (
                    <img src={gk.avatar!} alt={gk.name} className="w-12 h-12 rounded-2xl object-cover border border-[#FF9F43]/50" />
                  ) : (
                    <div className="w-12 h-12 rounded-2xl flex items-center justify-center bg-orange-950/50 text-orange-300 border border-[#FF9F43]/40 font-extrabold">
                      {getInitials(gk.name)}
                    </div>
                  )}
                  <div className="absolute -bottom-1 -right-1 p-1 rounded-lg bg-[#FF9F43] border-2 border-surface-1">
                    <Hand size={10} className="text-on-primary" />
                  </div>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h4 className="text-sm font-extrabold text-white uppercase tracking-tight truncate">{gk.name}</h4>
                    {gk.isElite && <Award size={12} className="text-warning shrink-0" />}
                    {liveBadge(gk.id)}
                  </div>
                  <p className="text-[0.625rem] font-extrabold uppercase tracking-widest mt-0.5 text-[#FF9F43]">Kiralık Kaleci · {teamName}</p>
                  <div className="flex items-center gap-3 mt-1.5">
                    {gk.rating != null && (
                      <span className="flex items-center gap-1 text-[0.6875rem] font-extrabold text-yellow-400"><Star size={10} fill="currentColor" />{gk.rating.toFixed(1)}</span>
                    )}
                    {gk.fee != null && (
                      <span className="text-[0.6875rem] font-extrabold text-white/70">{money(gk.fee)}</span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-1 text-[0.625rem] font-extrabold uppercase tracking-widest text-ink-4 shrink-0">
                  Detay <ChevronRight size={13} />
                </div>
              </button>

              {/* Kaptan: KENDİ tarafının kalecisi gelmediyse no-show bildir (ceza → teminattan) */}
              {isManageMode && myCaptainSide === side && capturedGkRequest && (
                <button
                  onClick={() => setShowNoShowConfirm(true)}
                  className="w-full py-2.5 rounded-2xl font-extrabold text-[0.625rem] uppercase tracking-widest text-red-400 bg-red-950/25 border border-red-500/20 active:scale-[0.99] transition-all flex items-center justify-center gap-1.5">
                  <AlertCircle size={13} /> Kaleci Gelmedi (No-show)
                </button>
              )}
              </React.Fragment>
            ))}

            {assignedReferee && (
              <button
                onClick={() => setProviderDetail({ p: assignedReferee, isRef: true })}
                className="w-full p-4 rounded-2xl bg-surface-1/80 border border-[#A78BFA]/30 flex items-center gap-3 text-left relative overflow-hidden active:scale-[0.99] transition-transform">
                <div className="absolute top-0 right-0 w-16 h-16 pointer-events-none" style={{ background: 'linear-gradient(to bottom left, rgba(167,139,250,0.14), transparent)' }} />
                <div className="relative shrink-0">
                  {isRealPhoto(assignedReferee.avatar) ? (
                    <img src={assignedReferee.avatar!} alt={assignedReferee.name} className="w-12 h-12 rounded-2xl object-cover border border-[#A78BFA]/50" />
                  ) : (
                    <div className="w-12 h-12 rounded-2xl flex items-center justify-center bg-violet-950/50 text-violet-300 border border-[#A78BFA]/40 font-extrabold">
                      {getInitials(assignedReferee.name)}
                    </div>
                  )}
                  <div className="absolute -bottom-1 -right-1 p-1 rounded-lg bg-[#A78BFA] border-2 border-surface-1">
                    <Scale size={10} className="text-on-primary" />
                  </div>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h4 className="text-sm font-extrabold text-white uppercase tracking-tight truncate">{assignedReferee.name}</h4>
                    {assignedReferee.isElite && <Award size={12} className="text-warning shrink-0" />}
                    {liveBadge(assignedReferee.id)}
                  </div>
                  <p className="text-[0.625rem] font-extrabold uppercase tracking-widest mt-0.5 text-[#A78BFA]">Atanan Hakem</p>
                  <div className="flex items-center gap-3 mt-1.5">
                    {assignedReferee.rating != null && (
                      <span className="flex items-center gap-1 text-[0.6875rem] font-extrabold text-yellow-400"><Star size={10} fill="currentColor" />{assignedReferee.rating.toFixed(1)}</span>
                    )}
                    {assignedReferee.fee != null && (
                      <span className="text-[0.6875rem] font-extrabold text-white/70">{money(assignedReferee.fee)}</span>
                    )}
                    {assignedReferee.level && (
                      <span className="text-[0.625rem] font-bold text-ink-4 uppercase tracking-wide truncate">{assignedReferee.level}</span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-1 text-[0.625rem] font-extrabold uppercase tracking-widest text-ink-4 shrink-0">
                  Detay <ChevronRight size={13} />
                </div>
              </button>
            )}
          </div>
          );
        })()}
      </>
  </main>

      {/* ── DİNAMİK NEON AKSİYON BARI ─────────────────────────────────── */}
      <div className="fixed bottom-0 left-0 w-full z-30 pointer-events-none">
        <div className="pointer-events-auto bg-gradient-to-t from-[#000] via-[#000]/96 to-transparent pt-14 pb-safe pb-4 px-5 border-t border-white/5">
          <div className="max-w-md mx-auto w-full">

            {(() => {
              // ÖNCELİK 1: seçim varsa — kadroda olsan bile — satın alma HER ZAMAN açık.
              if (selectedSlotIds.length > 0) {
                const unitPrice = Number((match as any).price) || 0;
                const total = selectedSlotIds.length * unitPrice;
                return (
                  <motion.button
                    disabled={isProcessing}
                    onClick={handleBuySlots}
                    whileTap={{ scale: 0.96 }}
                    className="w-full h-16 rounded-[24px] font-extrabold flex items-center justify-center gap-2 transition-all cursor-pointer text-on-primary"
                    style={{ background: '#39FF14', boxShadow: '0 0 28px rgba(57,255,20,0.30)' }}
                  >
                    {isProcessing ? (
                      <><Loader2 size={20} className="animate-spin" /><span className="text-sm uppercase tracking-[0.12em]">ÖDENİYOR…</span></>
                    ) : total > 0 ? (
                      // IP-19 · iki katman: ödenecek tutar tek başına ve büyük;
                      // slot sayısı ile eylem altta küçük. Eskiden üçü de aynı
                      // puntoda tek satırdaydı, göz tutarı bulamıyordu.
                      <>
                        <span className="flex flex-col items-center leading-none">
                          <span className="font-numeric text-[1.375rem] font-extrabold">{money(total)}</span>
                          <span className="mt-1 text-[0.6875rem] font-bold uppercase tracking-[0.1em] opacity-70">
                            {selectedSlotIds.length} slot · Öde ve katıl
                          </span>
                        </span>
                        <ChevronRight size={18} />
                      </>
                    ) : (
                      <span className="flex items-center gap-2 text-sm uppercase tracking-[0.12em]">
                        <span>{selectedSlotIds.length} SLOT</span><span className="opacity-60">·</span><span>YERİNİ AYIRT</span><ChevronRight size={18} />
                      </span>
                    )}
                  </motion.button>
                );
              }
              // ÖNCELİK 2: doldurulmamış rezervelerin varsa tek tuşla doldurmaya
              if (myReservedSlots.length > 0) {
                return (
                  <motion.button
                    whileTap={{ scale: 0.97 }}
                    onClick={() => {
                      if (!isManageMode) useAppStore.getState().setLobbyMode('MANAGE');
                      const first = myReservedSlots[0];
                      if (first) setFillSlot(first as PositionSlot);
                    }}
                    className="w-full h-16 rounded-[24px] font-extrabold text-sm uppercase tracking-[0.15em] flex items-center justify-center gap-2 text-on-primary cursor-pointer"
                    style={{ background: '#39FF14', boxShadow: '0 0 28px rgba(57,255,20,0.30)' }}
                  >
                    <UserPlus size={18} />
                    <span>SLOTLARINI DOLDUR ({myReservedSlots.length})</span>
                    <ChevronRight size={18} />
                  </motion.button>
                );
              }
              if (isAlreadyJoined) {
                return (
                  <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                    className="flex items-center justify-center gap-3 h-16 rounded-[24px] border border-primary/20 bg-primary/5 px-4">
                    <CheckCircle2 size={18} className="text-primary shrink-0" />
                    <span className="font-extrabold text-[0.6875rem] text-primary uppercase tracking-widest text-center leading-tight">
                      KADRODASIN — arkadaşların için slot almaya devam edebilirsin
                    </span>
                  </motion.div>
                );
              }
              return null;
            })() || (isAlreadyJoinedReserve ? (
              /* ── Zaten Yedek Kulübesindeyim ─────────────────────────── */
              (() => {
                const reserveIndex = (match.reservePlayers || []).findIndex(p => p.id === currentUserProfile.id);
                return (
                  <div className="flex gap-3 w-full">
                    <div className="flex-1 flex items-center justify-center gap-2 h-16 rounded-[24px] border border-amber-500/20 bg-amber-500/5">
                      <Clock size={16} className="text-amber-500 animate-pulse" />
                      <span className="font-extrabold text-xs text-amber-500 uppercase tracking-widest">
                        YEDEK LİSTESİNDESİN (SIRA: {reserveIndex + 1})
                      </span>
                    </div>
                    <motion.button
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                      onClick={() => setShowLeaveConfirm(true)}
                      className="px-6 h-16 rounded-[24px] bg-red-500/10 border border-red-500/20 text-red-500 font-extrabold text-xs uppercase tracking-widest hover:bg-red-500 hover:text-white transition-all cursor-pointer"
                    >
                      AYRIL
                    </motion.button>
                  </div>
                );
              })()
            ) : (() => {
              const activeSlots = pitchSide === 'home' ? (match.slots || []) : (match.awaySlots || []);
              const isActiveSideFull = activeSlots.length > 0 && activeSlots.every(s => s.status === 'TAKEN');

              // IP-19: buradaki iki `if (false)` bloğu, yukarıdaki ÖNCELİK 1 ve
              // ÖNCELİK 2 dallarının ölü kopyalarıydı. Aynı butonun üç ayrı
              // sürümü duruyordu; para biçimi düzeltilirken hangisinin canlı
              // olduğu okunmuyordu. Ölü kopyalar silindi.
              if (isActiveSideFull) {
                return (
                  <motion.button
                    onClick={handleJoinAsReserve}
                    disabled={isProcessing}
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    className="w-full h-16 rounded-[24px] bg-warning-bg text-warning border border-warning-line font-extrabold text-sm uppercase tracking-[0.2em] flex items-center justify-center gap-2 cursor-pointer"
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

              return (
                <div className="w-full h-16 rounded-[24px] bg-white/[0.02] border border-dashed border-white/20 text-ink-4 font-extrabold text-xs uppercase tracking-widest flex items-center justify-center gap-2">
                  <Zap size={13} className="text-ink-4" />
                  <span>SLOT SEÇ</span>
                </div>
              );
            })())}
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
              className="w-full max-w-md bg-bg border border-white/10 rounded-3xl overflow-hidden shadow-2xl relative"
            >
              <div className="px-5 py-4 border-b border-white/5 flex items-center justify-between bg-black/20">
                <h3 className="text-sm font-extrabold text-white italic uppercase flex items-center gap-2">
                  <MapPin size={16} className="text-ink-4" />
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
                              <div className="bg-surface-1/90 backdrop-blur-md p-3 rounded-2xl border border-white/10 shadow-xl text-center min-w-[120px]">
                                  <h4 className="text-white font-extrabold text-[0.625rem] uppercase tracking-widest mb-1">{match?.location}</h4>
                                  <a href={`https://www.google.com/maps/dir/?api=1&destination=${pitchCoordinates[0]},${pitchCoordinates[1]}`} target="_blank" rel="noreferrer" className="inline-block mt-2 px-3 py-1.5 bg-white/[0.06] border border-line-strong text-ink text-[0.6875rem] font-extrabold uppercase rounded-lg">Yol Tarifi Al</a>
                              </div>
                          </Popup>
                      </Marker>
                  </MapContainer>
                ) : (
                  <div className="w-full h-full flex flex-col items-center justify-center gap-2 px-6 text-center bg-black/20">
                    <MapPin size={28} className="text-ink-4" />
                    <p className="text-white/70 text-xs font-extrabold uppercase tracking-wide">Konum bilgisi henüz eklenmemiş</p>
                    <p className="text-ink-4 text-[0.6875rem] leading-relaxed">Saha sahibi konum bilgisini ekleyince harita ve yol tarifi burada görünecek.</p>
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
              className="bg-bg border-t border-white/10 w-full max-w-lg rounded-t-[40px] shadow-[0_-20px_50px_rgba(0,0,0,0.8)]"
            >
              {/* Başlık */}
              <div className="flex items-center justify-between px-6 pt-7 pb-5">
                <div>
                  <p className="text-[0.625rem] font-extrabold text-ink-4 uppercase tracking-[0.3em] mb-0.5">{activePitchName}</p>
                  <h2 className="text-base font-extrabold text-white uppercase italic tracking-tight">MAÇ ÖZELLİKLERİ</h2>
                </div>
                <button
                  aria-label="Kapat"
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
                    <span className="text-[0.6875rem] font-extrabold text-ink-4 uppercase tracking-wider">FORMAT</span>
                    <span className="text-sm font-extrabold text-white uppercase italic">{match.format || '7v7'}</span>
                  </div>
                  {/* MAÇ SÜRESİ — GERÇEK VERİ (matches.duration_minutes; sahayı 90
                      dakika kiraladıysan maç 90 dakikadır — E6). Sabit/yazılı süre
                      YOK; veri gelmiyorsa satır hiç çizilmez. İtalik kullanılmaz
                      (karar S17: italik yalnız skorda). */}
                  {matchDurationLabel && (
                    <div className="flex items-center justify-between px-4 py-4">
                      <span className="text-[0.6875rem] font-extrabold text-ink-4 uppercase tracking-wider">SÜRE</span>
                      <span className="text-sm font-extrabold text-white">{matchDurationLabel}</span>
                    </div>
                  )}
                  <div className="flex items-center justify-between px-4 py-4">
                    <span className="text-[0.6875rem] font-extrabold text-ink-4 uppercase tracking-wider">YAŞ GRUBU</span>
                    <span className="text-sm font-extrabold text-white uppercase italic">{match.ageGroup || 'Belirtilmedi'}</span>
                  </div>
                  <div className="flex items-center justify-between px-4 py-4">
                    <span className="text-[0.6875rem] font-extrabold text-ink-4 uppercase tracking-wider">CİNSİYET</span>
                    <span className="text-sm font-extrabold text-white uppercase italic">{match.gender || 'Belirtilmedi'}</span>
                  </div>
                  <div className="flex items-center justify-between px-4 py-4">
                    <span className="text-[0.6875rem] font-extrabold text-ink-4 uppercase tracking-wider">OYUN SERTLİĞİ</span>
                    <span className={`text-sm font-extrabold uppercase italic ${
                      match.difficulty === 'Ciddi' ? 'text-red-400' :
                      match.difficulty === 'Taktiksel' ? 'text-info' : 'text-ink-3'
                    }`}>{match.difficulty}</span>
                  </div>
                  <div className="flex items-center justify-between px-4 py-4">
                    <span className="text-[0.6875rem] font-extrabold text-ink-4 uppercase tracking-wider">KATILIM ÜCRETİ</span>
                    <span className={`text-sm font-extrabold uppercase ${match.price > 0 ? 'text-ink' : 'text-white/50'}`}>
                      {formatTRYShort(match.price)}
                    </span>
                  </div>
                </div>
              </div>

              {/* Kapat */}
              <div className="px-6 pt-4 pb-10">
                <button
                  onClick={() => setShowInfoModal(false)}
                  className="w-full py-3.5 rounded-2xl bg-white/5 border border-white/8 font-extrabold text-xs uppercase tracking-widest text-white/50 hover:text-white hover:bg-white/10 transition-all active:scale-95"
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

export default MatchJoin;
