
import React, { useState, useEffect, useMemo } from 'react';
import { UserRole, AppView, JobListing, GkStyle, DirectOffer, Equipment, ServiceRequest } from '../types';
import { MapPin, Navigation, Star, DollarSign, Calendar, Shield, Scale, Power, Bell, Wallet, List, User, Check, X, ChevronRight, Clock, Trophy, Search, MessageSquare, Send, ArrowRight, Hand, Briefcase, PlusCircle, Sparkles, Zap, Activity, Coins, Tag, Flame, RefreshCcw, Eye, Gauge, Flag, CreditCard, Banknote, Users, Settings, Award, AlertTriangle, CheckCircle2, BadgeCheck, Inbox } from 'lucide-react';
import { getWalletHistory, WalletHistoryItem } from '../services/userService';
import { formatTRYWithSymbol } from '../utils/formatTRY';
import { parseMatchDateTime } from '../utils/matchDateTime';
import {
  getIncomingRequests,
  respondServiceRequest,
  reportServiceAttendance,
  getProviderIdentityStatus,
  submitProviderIdentity,
  applyToMatchAsProvider,
  withdrawProviderApplication,
  providerConfirmService,
  providerDisputeNoShow,
} from '../services/serviceRequestService';
import { getMyMatchServiceOffers, respondMatchServiceOffer, MatchServiceOffer } from '../services/serviceOfferService';
import {
  getWalletSummary,
  getPayoutMethods,
  addPayoutMethod,
  deletePayoutMethod,
  setDefaultPayoutMethod,
  requestPayoutWithMethod,
  getPendingPayout,
  PayoutMethod,
  PayoutRequestRow,
} from '../services/walletService';
import { motion, AnimatePresence } from 'framer-motion';
import ServiceProfile from './ServiceProfile';
import ServiceSettings from './ServiceSettings';
import { auth } from '../supabaseAuth';
import { supabase } from '../supabaseClient';
import { useAppStore } from '../store';
import { subscribeToOpenMatches, getMatchDetails } from '../services/matchService';
import { submitRefereeMatchScore } from '../services/scoreService';
import { APP_VERSION } from '../utils/appVersion';
import { LoadingState, ErrorState } from '../components/common/StatusState';
import { Toast } from '../components/common/Toast';

interface ServiceDashboardProps {
  role: UserRole;
  onBack: () => void;
  onNavigate: (view: AppView) => void;
  /** Gerçek oturum kapatma (App merkezî handleLogout) → giriş ekranına düşer. */
  onLogout?: () => void;
}

type Tab = 'HOME' | 'JOBS' | 'PRICING' | 'WALLET' | 'MENU' | 'PROFILE_VIEW' | 'SETTINGS_VIEW';

// Removed equipment mock data

const ServiceDashboard: React.FC<ServiceDashboardProps> = ({ role, onBack, onNavigate, onLogout }) => {
  const isRef = role === UserRole.REFEREE;
  const {
    unreadNotificationsCount,
    setIsNotificationsOpen,
    updateOwnProvider,
    adminMatches,
    applyMatchLocal
  } = useAppStore();
  const [activeTab, setActiveTab] = useState<Tab>('HOME');
  const [isAvailable, setIsAvailable] = useState(true);
  const [openMatches, setOpenMatches] = useState<any[]>([]);
  const [userProfile, setUserProfile] = useState<any>(null);
  const [selectedJob, setSelectedJob] = useState<any | null>(null);
  const [selectedOffer, setSelectedOffer] = useState<DirectOffer | null>(null);
  const [selectedUpcomingJob, setSelectedUpcomingJob] = useState<JobListing | null>(null);
  const [bidAmount, setBidAmount] = useState<number>(0);
  const [showBidSuccess, setShowBidSuccess] = useState(false);
  
  // New States
  const [showPriceModal, setShowPriceModal] = useState(false);
  const [baseFee, setBaseFee] = useState(isRef ? 350 : 250);
  const [showOnlineSetupModal, setShowOnlineSetupModal] = useState(false);
  const DAYS = ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz'];
  const ALL_HOURS = Array.from({ length: 24 }, (_, i) => `${String(i).padStart(2,'0')}:00`);
  const [setupDays, setSetupDays] = useState<string[]>(['Pzt', 'Sal', 'Çar']);
  const [setupHours, setSetupHours] = useState<string[]>(['19:00', '20:00', '21:00']);
  const [activeDays, setActiveDays] = useState<string[]>(['Bugün']);
  const [activeHours, setActiveHours] = useState<string>('18:00 - 23:00');
  // FAZ 8A — Cüzdan: kayıtlı ödeme yöntemleri (payout_methods) + çekim talebi
  const [showCardOptions, setShowCardOptions] = useState(false);
  const [showAddCard, setShowAddCard] = useState(false);
  const [newCardNo, setNewCardNo] = useState('');
  const [newMethodKind, setNewMethodKind] = useState<'IBAN' | 'CARD'>('IBAN');
  const [newIban, setNewIban] = useState('');
  const [addingMethod, setAddingMethod] = useState(false);
  const [payoutMethods, setPayoutMethods] = useState<PayoutMethod[]>([]);
  const [pendingPayout, setPendingPayout] = useState<PayoutRequestRow | null>(null);
  const [reservedBalance, setReservedBalance] = useState(0);
  
  // UX Enhancements States
  const [matchLiveStatus, setMatchLiveStatus] = useState<Record<string, 'ON_THE_WAY' | 'ARRIVED' | 'FINISHED'>>({});
  const [showPostMatchReport, setShowPostMatchReport] = useState(false);
  const [postMatchRating, setPostMatchRating] = useState(5);
  // HR-A: hakem resmi skor girişi — kontrollü alanlar + gönderim durumu.
  const [refScore, setRefScore] = useState<{ home: string; away: string }>({ home: '', away: '' });
  const [submittingScore, setSubmittingScore] = useState(false);
  const [newCardHolder, setNewCardHolder] = useState('');
  
  const [flipCard, setFlipCard] = useState(false);
  const [isTransferring, setIsTransferring] = useState(false);
  const [transferSuccess, setTransferSuccess] = useState(false);
  const [myOffers, setMyOffers] = useState<any[]>([]);
  const [walletHistory, setWalletHistory] = useState<WalletHistoryItem[]>([]);
  const [walletHistoryLoading, setWalletHistoryLoading] = useState(false);
  const [walletHistoryError, setWalletHistoryError] = useState<string | null>(null);
  const [offersLoading, setOffersLoading] = useState(true);
  const [offersError, setOffersError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  // FAZ 5 — Gelen talepler (kaleci/hakem hizmet talepleri)
  const [incomingRequests, setIncomingRequests] = useState<ServiceRequest[]>([]);
  const [requestsLoading, setRequestsLoading] = useState(true);
  const [requestsError, setRequestsError] = useState<string | null>(null);
  const [respondingId, setRespondingId] = useState<string | null>(null);
  const [reportingId, setReportingId] = useState<string | null>(null);
  // FAZ 4: kaleci kabul sözleşme onayı modalı
  const [contractModalReq, setContractModalReq] = useState<ServiceRequest | null>(null);
  const [contractChecked, setContractChecked] = useState(false);

  // Kaptan çok-sağlayıcı TEKLİFLERİ (match_service_offers) — kabul/red (FCFS)
  const [matchOffers, setMatchOffers] = useState<MatchServiceOffer[]>([]);
  const [respondingOfferId, setRespondingOfferId] = useState<string | null>(null);

  // FAZ 5 — TC kimlik doğrulama
  const [identityStatus, setIdentityStatus] = useState<'PENDING' | 'VERIFIED' | 'REJECTED' | null>(null);
  const [showIdentityModal, setShowIdentityModal] = useState(false);
  const [identityTc, setIdentityTc] = useState('');
  const [identityName, setIdentityName] = useState('');
  const [identityBirthYear, setIdentityBirthYear] = useState('');
  const [identitySubmitting, setIdentitySubmitting] = useState(false);
  const [identityFormError, setIdentityFormError] = useState<string | null>(null);

  // FAZ 5 — Kazanç bakiyesi (get_wallet_summary → earnings_balance)
  const [earningsBalance, setEarningsBalance] = useState(0);

  const showActionError = (msg: string) => {
      setActionError(msg);
      setTimeout(() => setActionError(null), 4000);
  };

  const showActionSuccess = (msg: string) => {
      setActionSuccess(msg);
      setTimeout(() => setActionSuccess(null), 4000);
  };

  const [timeLeft, setTimeLeft] = useState('--:--:--');

  const myUpcomingMatches = useMemo(() => {
      if (!userProfile) return [];
      const upcoming = adminMatches.filter((m: any) => {
          const isMyMatch = isRef 
              ? m.refereeId === userProfile.id 
              : (m.gkId === userProfile.id || m.gk_id === userProfile.id);
          return isMyMatch && (m.status === 'CONFIRMED' || m.status === 'LIVE' || m.status === 'ACTIVE' || !m.status);
      // KB-7: TR tarih/saat stringlerini (ör. "Bugün 21:00", "dd.mm.yyyy") güvenle
      // ayrıştır — ham new Date(`${date} ${time}`) bunlarda Invalid Date veriyordu.
      }).sort((a: any, b: any) =>
          (parseMatchDateTime(a.date, a.time)?.getTime() ?? Infinity) -
          (parseMatchDateTime(b.date, b.time)?.getTime() ?? Infinity));

      return upcoming.filter((m: any) => {
          const mt = parseMatchDateTime(m.date, m.time)?.getTime();
          return mt == null ? true : mt > Date.now(); // ayrıştırılamıyorsa şimdilik tut
      });
  }, [adminMatches, userProfile, isRef]);

  useEffect(() => {
      const timer = setInterval(() => {
          if (myUpcomingMatches.length > 0) {
              const match = myUpcomingMatches[0];
              const matchDate = parseMatchDateTime(match.date, match.time);
              const now = new Date();
              const diff = matchDate ? matchDate.getTime() - now.getTime() : NaN;
              
              if (isNaN(diff) || diff <= 0) {
                  setTimeLeft("00:00:00");
              } else {
                  const hours = Math.floor(diff / (1000 * 60 * 60));
                  const mins = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
                  const secs = Math.floor((diff % (1000 * 60)) / 1000);
                  setTimeLeft(`${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`);
              }
          } else {
              setTimeLeft('--:--:--');
          }
      }, 1000);
      return () => clearInterval(timer);
  }, [myUpcomingMatches]);

  // Sağlayıcının bekleyen başvuruları (APPLIED = kaptan onayı bekliyor) —
  // gerçek service_requests'ten; görüntü alanları için maçla zenginleştirilir.
  const pendingApplications = useMemo(() => {
      return incomingRequests
          .filter(r => r.status === 'APPLIED')
          .map(r => {
              const m: any = adminMatches.find((am: any) => am.id === r.matchId) || {};
              return {
                  requestId: r.id,
                  id: r.matchId,
                  pitchName: m.title || m.pitchName || m.location || 'Saha',
                  location: m.location || m.district || '',
                  date: m.date || '',
                  time: m.time || '',
                  fee: r.fee,
              };
          });
  }, [incomingRequests, adminMatches]);

  // Sağlayıcının zaten başvurduğu/atandığı maçlar → "BAŞVUR" butonu "Başvuruldu"ya döner
  const appliedMatchIds = useMemo(
      () => new Set(incomingRequests.filter(r => ['APPLIED','ACCEPTED','CAPTURED'].includes(r.status)).map(r => r.matchId)),
      [incomingRequests]
  );
  const [withdrawingId, setWithdrawingId] = useState<string | null>(null);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);

  // Misafir/demo modu: finansal aksiyonlar (çekim, kart, kimlik, başvuru/teklif)
  // kilitli. RLS zaten oturum ister; kullanıcı kriptik RPC hatası yerine net bir
  // "Giriş yap" yönlendirmesi görür. Demo cüzdan verisi salt-okunur kalır.
  const isGuest = !auth.currentUser?.uid;
  const [showGuestGate, setShowGuestGate] = useState(false);
  const guardGuest = (): boolean => {
      if (!isGuest) return true;
      setShowGuestGate(true);
      return false;
  };

  // FAZ 5 — Gelen taleplerin durum bazlı gruplanması
  const newRequests = useMemo(
      () => incomingRequests.filter(r => r.status === 'PENDING'),
      [incomingRequests]
  );
  const activeRequests = useMemo(
      () => incomingRequests.filter(r => r.status === 'ACCEPTED' || (r.status === 'CAPTURED' && !r.payoutReleased)),
      [incomingRequests]
  );
  // Bug D: Ödeme serbest bırakılınca talep COMPLETED'a geçer; sağlayıcı
  // tamamlanan işini görebilmeli (ayrıca payout serbest bırakılmış CAPTURED da).
  // FAZ 4: hakkında no-show bildirilen talepler → sağlayıcı 48s içinde itiraz edebilir.
  // KB-3: NOSHOW_REPORTED + DISPUTED birlikte gösterilir — GK itiraz ettikten
  // sonra (status DISPUTED) satır hiçbir bucket'a düşmeyip EKRANDAN KAYBOLUYORDU;
  // sağlayıcı kendi aktif itirazını göremiyordu. Artık burada kalır (durum-duyarlı UI).
  const noShowRequests = useMemo(
      () => incomingRequests.filter(r => {
        const s = r.status as string;
        return s === 'NOSHOW_REPORTED' || s === 'DISPUTED';
      }),
      [incomingRequests]
  );
  const completedRequests = useMemo(
      () => incomingRequests.filter(r => {
        const s = r.status as string;
        // KB-3: NOSHOW_FINALIZED (itiraz reddedildi / kesinleşti) da geçmişte görünür.
        return s === 'COMPLETED' || (r.status === 'CAPTURED' && r.payoutReleased) || s === 'NOSHOW_FINALIZED';
      }),
      [incomingRequests]
  );

  useEffect(() => {
    let active = true;
    
    const loadProfile = async () => {
        // Fetch from global store for now
        const { adminGoalkeepers, adminReferees } = useAppStore.getState();
        // Bug A: Kimlik HER ZAMAN gerçek oturum uid'i olmalı. Gerçek kullanıcı
        // store'da bulunamazsa demo profili SADECE görsel alanlar için kullan,
        // fakat id/uid'yi auth.currentUser.uid'e sabitle ki cüzdan/transfer/teklif
        // işlemleri yanlış (demo) kullanıcıya gitmesin.
        const authUid = auth.currentUser?.uid;
        const own = (isRef ? adminReferees : adminGoalkeepers).find(x => x.id === authUid);
        // HR-F: Giriş yapmış kullanıcının KENDİ sağlayıcı satırı store'da yoksa,
        // katalogun ilk sağlayıcısına (adminReferees[0] = Yusuf gibi) düşüp onun
        // adını/puanını/statlarını "kendisiymiş" gibi göstermek KİMLİK SIZINTISIDIR
        // (kimlik kartı de-fake çalışmasını çürütür). Bu durumda gerçek oturum
        // kimliğini BOŞ istatistiklerle göster → kart "—" gösterir, başkasının
        // verisi değil. Misafirde (authUid yok) demo profil yalnız görsel amaçlı
        // korunur — ortada sızdırılacak gerçek kimlik yoktur.
        const me = own || (authUid ? null : (isRef ? adminReferees[0] : adminGoalkeepers[0]));

        if (active && me) {
            setUserProfile({
                id: authUid || me.id,
                uid: authUid || me.id,
                fullName: me.name,
                role: role,
                email: auth.currentUser?.email || 'test@example.com',
                isAvailable: me.isAvailable ?? true,
                rating: me.rating,
                matchesPlayed: me.matchCount || 0,
                createdAt: new Date(),
                stats: me.stats,
                style: me.style, // KB-M2: kimlik kartı gerçek stili göstersin (sabit "PANTER" yerine)
                level: (me as any).level, // HR-B: hakem kartı gerçek seviyeyi göstersin (sabit "FIFA" yerine)
                workingHours: me.workingHours || { activeDays: ['Bugün'], activeHours: '18:00 - 23:00' }
            });
            setIsAvailable(me.isAvailable ?? true);
            setBaseFee(me.fee);
            if (me.workingHours) {
              setActiveDays(me.workingHours.activeDays || ['Bugün']);
              setActiveHours(me.workingHours.activeHours || '18:00 - 23:00');
            }
        } else if (active && authUid) {
            // Kendi satırı henüz store'da yok — gerçek oturum kimliği + boş stat.
            setUserProfile({
                id: authUid,
                uid: authUid,
                fullName: auth.currentUser?.displayName || auth.currentUser?.email?.split('@')[0] || '',
                role: role,
                email: auth.currentUser?.email || '',
                isAvailable: true,
                rating: undefined,      // idRated=false → "—"
                matchesPlayed: 0,
                createdAt: new Date(),
                stats: {},
                style: undefined,
                level: undefined,
                workingHours: { activeDays: ['Bugün'], activeHours: '18:00 - 23:00' }
            });
        }
    };

    loadProfile();



    const unsubscribe = subscribeToOpenMatches((matches) => {
      // matches tablosunun GERÇEK sütunlarına eşle (pitch_name/captain_name/budget
      // YOK → eskiden kartlar undefined/UUID gösteriyordu). Ayrıca yalnız bu
      // sağlayıcı rolünü henüz doldurmamış maçları göster (kaleci/hakem aranıyor).
      const jobs = matches
        .filter((m: any) => (role === UserRole.GOALKEEPER ? !m.gk_id : !m.refereeId && !m.ref_id))
        .map((m: any) => {
          const slots = Array.isArray(m.slots) ? m.slots : [];
          const filled = slots.filter((s: any) => s?.player || s?.userId).length;
          // KB-M3: uydurma alan yok. matches tablosunda captain_name/format/difficulty
          // YOK → sahte "Kaptan"/"7v7"/"Ciddi" yerine null (kart bunları gizler).
          // Fiyat gerçek değilse null → kartta "Standart ücret" (250/350 uydurması değil).
          return {
            id: m.id,
            roleNeeded: role === UserRole.GOALKEEPER ? 'GK' : 'REF',
            date: m.date || null,
            time: m.time || null,
            pitchName: m.title || m.location || 'Saha',
            location: m.location || '—',
            captainName: m.captain_name || null,
            players: filled || slots.length,
            missing: role === UserRole.GOALKEEPER ? 'Kaleci' : 'Hakem',
            duration: m.duration ? `${m.duration} Dk` : null,
            fee: Number(m.price) > 0 ? Number(m.price) : null,
            status: m.status || 'OPEN',
          };
        });
      setOpenMatches(jobs);
    });

    return () => {
        active = false;
        unsubscribe();
    };
  }, [role, isRef]);

  const fetchOffers = async () => {
    // Bug A: cüzdan/teklif işlemlerinde kimlik daima gerçek oturum uid'i olmalı.
    const uid = auth.currentUser?.uid;
    if (!uid) return;
    setOffersLoading(true);
    setOffersError(null);
    try {
      const { data, error } = await supabase
        .from('service_offers')
        .select('*')
        .eq('provider_id', uid)
        .eq('status', 'PENDING');
      if (!error && data) {
        const mappedOffers = data.map((o: any) => {
          const match: any = adminMatches.find((m: any) => m.id === o.match_id);
          return {
            id: o.id,
            matchId: o.match_id,
            pitchName: match?.pitch_name || match?.location || 'Özel Maç Teklifi',
            teamName: match?.captain_name ? `${match.captain_name} Takımı` : 'Özel Grup',
            captainName: match?.captain_name || 'Kaptan',
            offerAmount: o.amount,
            time: match?.time || 'Belirsiz',
            date: match?.date || 'Belirsiz',
            message: o.message || 'Seni maçımızda görmek istiyoruz!',
            expiresIn: '24s'
          };
        });
        setMyOffers(mappedOffers);
      } else if (error) {
        console.error("Error fetching offers", error);
        setOffersError('Teklifler yüklenemedi. Lütfen tekrar dene.');
      }
    } catch (err) {
      console.error("Error fetching offers", err);
      setOffersError('Teklifler yüklenemedi. Lütfen tekrar dene.');
    } finally {
      setOffersLoading(false);
    }
  };

  // FAZ 8A — kayıtlı ödeme yöntemleri + bekleyen çekim talebi
  const fetchPayoutData = async () => {
      try {
          const [methods, pending] = await Promise.all([getPayoutMethods(), getPendingPayout()]);
          setPayoutMethods(methods);
          setPendingPayout(pending);
      } catch (err) {
          console.error('fetchPayoutData:', err);
      }
  };

  const fetchWalletHistory = async () => {
    // Bug A: işlem geçmişi daima gerçek oturum uid'i ile okunmalı.
    const uid = auth.currentUser?.uid;
    if (!uid) return;
    setWalletHistoryLoading(true);
    setWalletHistoryError(null);
    try {
      const history = await getWalletHistory(uid);
      setWalletHistory(history);
    } catch (err) {
      console.error('fetchWalletHistory:', err);
      setWalletHistoryError('İşlem geçmişi yüklenemedi.');
    } finally {
      setWalletHistoryLoading(false);
    }
  };

  // FAZ 5 — Gelen hizmet talepleri (PENDING/ACCEPTED/CAPTURED...)
  const fetchIncomingRequests = async () => {
    setRequestsLoading(true);
    setRequestsError(null);
    try {
      const requests = await getIncomingRequests();
      setIncomingRequests(requests);
    } catch (err) {
      console.error('fetchIncomingRequests:', err);
      setRequestsError('Talepler yüklenemedi. Lütfen tekrar dene.');
    } finally {
      setRequestsLoading(false);
    }
  };

  // Kaptan çok-sağlayıcı TEKLİFLERİ (match_service_offers) — bekleyenler
  const fetchMatchOffers = async () => {
    try {
      setMatchOffers(await getMyMatchServiceOffers());
    } catch (err) {
      console.error('fetchMatchOffers:', err);
    }
  };

  // Teklife yanıt (kabul → ücret bloke edilir; ilk kabul eden işi alır)
  const handleRespondMatchOffer = async (offerId: string, accept: boolean) => {
    setRespondingOfferId(offerId);
    try {
      const res = await respondMatchServiceOffer(offerId, accept);
      if (accept && res?.reason === 'ROLE_ALREADY_FILLED') {
        showActionError('Bu rol başka bir sağlayıcı tarafından üstlenildi.');
      } else {
        showActionSuccess(accept ? 'Teklifi kabul ettin — kadrodasın! ⚽' : 'Teklifi reddettin.');
      }
      await Promise.all([fetchMatchOffers(), fetchIncomingRequests(), fetchEarnings()]);
    } catch (err: any) {
      console.error('handleRespondMatchOffer:', err);
      showActionError(err?.message || 'İşlem tamamlanamadı. Lütfen tekrar dene.');
    } finally {
      setRespondingOfferId(null);
    }
  };

  // FAZ 5/8A — Kazanç bakiyesi (TEK kaynak: get_wallet_summary)
  const fetchEarnings = async () => {
    try {
      const summary = await getWalletSummary();
      setEarningsBalance(summary.earningsBalance);
      setReservedBalance(summary.reservedBalance);
    } catch (err) {
      console.error('fetchEarnings:', err);
    }
  };

  // FAZ 5 — TC kimlik doğrulama durumu
  const fetchIdentityStatus = async () => {
    try {
      const status = await getProviderIdentityStatus();
      setIdentityStatus(status);
    } catch (err) {
      console.error('fetchIdentityStatus:', err);
    }
  };

  // FAZ 5/4 — Talebe yanıt ver (kabul/red). Kaleci kabulünde sözleşme onayı geçilir.
  const handleRespondRequest = async (requestId: string, accept: boolean, contractAccepted = false) => {
    setRespondingId(requestId);
    try {
      await respondServiceRequest(requestId, accept, contractAccepted);
      showActionSuccess(accept ? 'Talebi kabul ettin.' : 'Talebi reddettin.');
      setContractModalReq(null);
      await fetchIncomingRequests();
    } catch (err: any) {
      console.error('handleRespondRequest:', err);
      showActionError(err?.message || 'İşlem tamamlanamadı. Lütfen tekrar dene.');
    } finally {
      setRespondingId(null);
    }
  };

  // FAZ 4 — Kaleci kabulü sözleşme + 500₺ teminat onayı gerektirir → önce modal aç.
  const handleAcceptClick = (req: ServiceRequest) => {
    if (req.providerType === 'GK') {
      setContractChecked(false);
      setContractModalReq(req);
    } else {
      handleRespondRequest(req.id, true);
    }
  };

  // FAZ 4 — No-show cezasına itiraz (48s içinde) → admin incelemesine
  const handleDisputeNoShow = async (requestId: string) => {
    setRespondingId(requestId);
    try {
      await providerDisputeNoShow(requestId);
      showActionSuccess('İtirazın alındı — durum OYNA yönetimi tarafından incelenecek.');
      await fetchIncomingRequests();
    } catch (err: any) {
      showActionError(err?.message || 'İtiraz gönderilemedi.');
    } finally {
      setRespondingId(null);
    }
  };

  // FAZ 5 — Sorun Bildir (katılım bildirimi)
  const handleReportAttendance = async (requestId: string) => {
    setReportingId(requestId);
    try {
      await reportServiceAttendance(requestId);
      showActionSuccess('Bildirimin yöneticilere iletildi.');
      await fetchIncomingRequests();
    } catch (err: any) {
      console.error('handleReportAttendance:', err);
      showActionError(err?.message || 'Bildirim gönderilemedi. Lütfen tekrar dene.');
    } finally {
      setReportingId(null);
    }
  };

  // FAZ 5 — TC kimlik doğrulama gönder
  const handleSubmitIdentity = async () => {
    if (!guardGuest()) return;
    setIdentityFormError(null);
    const tc = identityTc.trim();
    if (!/^\d{11}$/.test(tc)) {
      setIdentityFormError('TC kimlik numarası 11 haneli olmalıdır.');
      return;
    }
    if (!identityName.trim()) {
      setIdentityFormError('Ad soyad zorunludur.');
      return;
    }
    const birthYear = identityBirthYear.trim() ? parseInt(identityBirthYear.trim(), 10) : undefined;
    setIdentitySubmitting(true);
    try {
      await submitProviderIdentity(tc, identityName.trim(), birthYear);
      showActionSuccess('Kimlik doğrulama talebin gönderildi.');
      setShowIdentityModal(false);
      setIdentityTc('');
      setIdentityName('');
      setIdentityBirthYear('');
      await fetchIdentityStatus();
    } catch (err: any) {
      console.error('handleSubmitIdentity:', err);
      setIdentityFormError(err?.message || 'Kimlik doğrulama gönderilemedi. Lütfen tekrar dene.');
    } finally {
      setIdentitySubmitting(false);
    }
  };

  useEffect(() => {
    if (!userProfile?.id) return;
    // KB-M1: legacy `service_offers` yükleme kaldırıldı — o tablo "KULLANILMAZ"
    // (20260716000002); gerçek teklif sistemi FCFS `match_service_offers`
    // (fetchMatchOffers). Böylece dürüst-olmayan legacy kabul yolu hiç tetiklenmez.
    fetchPayoutData();
    fetchWalletHistory();
    fetchIncomingRequests();
    fetchMatchOffers();
    fetchEarnings();
    fetchIdentityStatus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userProfile]);

  // FAZ 8A — Gerçek zamanlı talep bildirimi: create/respond/expire RPC'leri
  // notifications tablosuna INSERT atar; sağlayıcı ekranı bunu dinleyip yeniler.
  useEffect(() => {
    const uid = auth.currentUser?.uid;
    if (!uid) return;
    const channel = supabase
      .channel(`svc-req:${uid}`)
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${uid}` },
        (payload: any) => {
          const key = String(payload?.new?.type_key || '');
          if (key.startsWith('service_offer')) {
            fetchMatchOffers();
          } else if (key.startsWith('service_request')) {
            fetchIncomingRequests();
            fetchEarnings();
          } else if (key.startsWith('payout_')) {
            fetchEarnings();
            fetchPayoutData();
            fetchWalletHistory();
          }
        })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userProfile?.id]);

  const handleToggleClick = () => {
      if (isAvailable) {
          setOnlineStatus(false);
      } else {
          setShowOnlineSetupModal(true);
      }
  };

  // FAZ 8A — kayıtlar artık provider_update_own_profile RPC'si ile DB'ye gerçekten
  // yazılır (eski yol admin yetkisi istiyor ve bu alanları yok sayıyordu).
  const providerKind = isRef ? 'REF' as const : 'GK' as const;

  const setOnlineStatus = async (status: boolean) => {
      setIsAvailable(status);
      if (userProfile && userProfile.uid) {
          try {
              await updateOwnProvider(providerKind, { id: userProfile.uid, isAvailable: status });
          } catch (err: any) {
              setIsAvailable(!status);
              showActionError(err?.message || 'Müsaitlik durumu kaydedilemedi.');
          }
      }
  };

  const handleUpdateFee = async (newFee: number) => {
      const prevFee = baseFee;
      setBaseFee(newFee);
      if (userProfile && userProfile.id) {
          try {
              await updateOwnProvider(providerKind, { id: userProfile.id, fee: newFee });
              showActionSuccess('Ücretin güncellendi.');
          } catch (err: any) {
              setBaseFee(prevFee);
              showActionError(err?.message || 'Ücret kaydedilemedi.');
          }
      }
  };

  const handleSaveOnlineSetup = async () => {
      setActiveDays(setupDays);
      const activeHoursStr = setupHours.length > 0 ? `${setupHours[0]} - ${setupHours[setupHours.length-1]}` : 'Belirsiz';
      setActiveHours(activeHoursStr);

      if (userProfile && userProfile.id) {
          const workingHours = { activeDays: setupDays, activeHours: activeHoursStr };
          try {
              await updateOwnProvider(providerKind, { id: userProfile.id, workingHours, isAvailable: true });
              showActionSuccess('Aktiflik ayarların kaydedildi.');
          } catch (err: any) {
              showActionError(err?.message || 'Aktiflik ayarları kaydedilemedi.');
              return;
          }
      }
      setIsAvailable(true);
      setShowOnlineSetupModal(false);
  };

  // Bug B: Mock geri sayım interval'i kaldırıldı. timeLeft'in tek kaynağı
  // myUpcomingMatches'e dayalı gerçek hesaplamadır (yukarıdaki useEffect).

  // FAZ 8A — çekim artık request_payout_with_method RPC'siyle: TC kimlik kapısı,
  // bakiye kontrolü ve tek-bekleyen-talep kuralı backend'de zorlanır; admin
  // FİNANS kuyruğu (admin_process_payout) talebi sonuçlandırınca bildirim düşer.
  const handleTransfer = async () => {
      if (!guardGuest()) return;
      const method = payoutMethods.find(m => m.isDefault) ?? payoutMethods[0];
      if (!method) { setShowCardOptions(true); return; }
      if (earningsBalance <= 0) { showActionError('Çekilebilir bakiyen bulunmuyor.'); return; }
      if (identityStatus !== 'VERIFIED') { setShowIdentityModal(true); return; }
      setIsTransferring(true);
      try {
          await requestPayoutWithMethod(earningsBalance, method.id);
          setTransferSuccess(true);
          setTimeout(() => setTransferSuccess(false), 3000);
          await Promise.all([fetchEarnings(), fetchPayoutData(), fetchWalletHistory()]);
      } catch (err: any) {
          console.error('Transfer error:', err);
          if (String(err?.message || '').includes('kimlik')) setShowIdentityModal(true);
          showActionError(err?.message || 'Çekim talebi oluşturulamadı. Lütfen tekrar dene.');
      } finally {
          setIsTransferring(false);
      }
  };

  // Theme configuration based on role
  const theme = isRef 
    ? { primary: 'text-red-500', bg: 'bg-red-500', border: 'border-red-500', gradient: 'from-red-900', shadow: 'shadow-red-900/20', secondaryBg: 'bg-red-900/20' }
    : { primary: 'text-green-500', bg: 'bg-green-500', border: 'border-green-500', gradient: 'from-[#064E3B]', shadow: 'shadow-green-900/20', secondaryBg: 'bg-green-900/20' };

  const handleOpenBid = (job: any) => {
      setSelectedJob(job);
      setBidAmount(0); // In real app, we might bid a custom amount
  };

  const handleOpenOffer = (offer: DirectOffer) => {
      setSelectedOffer(offer);
      setBidAmount(offer.offerAmount);
  };

  const acceptOffer = async () => {
      if (!selectedOffer) return;

      // Local double-booking/conflict check
      const match = adminMatches.find(m => m.id === selectedOffer.matchId);
      if (match) {
          const hasConflict = myUpcomingMatches.some(um => um.date === match.date && um.time === match.time);
          if (hasConflict) {
              showActionError('Bu tarih ve saatte zaten onaylanmış bir maçınız var. Lütfen teklifi reddedin.');
              return;
          }
      }

      setIsTransferring(true);
      try {
          const { error } = await supabase
            .from('service_offers')
            .update({ status: 'ACCEPTED' })
            .eq('id', selectedOffer.id);

          if (!error) {
              setMyOffers(prev => prev.filter(o => o.id !== selectedOffer.id));
              console.log(`Accepted offer ${selectedOffer.id} for match ${selectedOffer.matchId}`);
              setShowBidSuccess(true);
              setTimeout(() => {
                  setShowBidSuccess(false);
                  setSelectedOffer(null);
              }, 2000);
          } else {
              console.error("Error from supabase:", error);
              if (error.message && error.message.includes('CONFLICT_DETECTED')) {
                  showActionError('Bu tarih ve saatte zaten onaylanmış bir maçınız var. Lütfen teklifi reddedin.');
              } else {
                  showActionError('Bir hata oluştu. Lütfen tekrar dene.');
              }
          }
      } catch (error: any) {
          console.error("Error accepting offer:", error);
          if (error.message && error.message.includes('CONFLICT_DETECTED')) {
              showActionError('Bu tarih ve saatte zaten onaylanmış bir maçınız var. Lütfen teklifi reddedin.');
          } else {
              showActionError('Teklif kabul edilemedi. Lütfen tekrar dene.');
          }
      } finally {
          setIsTransferring(false);
      }
  };

  const submitBid = async () => {
      if (!guardGuest()) return;
      const uid = auth.currentUser?.uid;

      if (selectedOffer) {
          return acceptOffer();
      }

      if (!uid) { showActionError('Oturumun bulunamadı. Lütfen tekrar giriş yap.'); return; }
      if (!selectedJob?.id) return;

      // Yerel çifte-rezervasyon uyarısı (sunucu tarafı da _provider_has_conflict ile korur)
      const hasConflict = myUpcomingMatches.some(um => um.date === selectedJob.date && um.time === selectedJob.time);
      if (hasConflict) {
          showActionError('Bu tarih ve saatte zaten onaylanmış bir maçınız var.');
          return;
      }

      setIsTransferring(true);
      try {
          // Gerçek başvuru: service_requests motoru (status=APPLIED). Kaptan kabul edince
          // ücret bloke edilir; maç sonunda iki-taraflı onayla payout serbest kalır.
          await applyToMatchAsProvider(selectedJob.id, providerKind);
          setShowBidSuccess(true);
          // Başvuru listesini tazele → kart "Başvuruldu" durumuna geçer
          await fetchIncomingRequests();
          setTimeout(() => {
              setShowBidSuccess(false);
              setSelectedJob(null);
          }, 1800);
      } catch (error: any) {
          console.error("Error submitting application:", error);
          showActionError(error?.message || 'Başvuru yapılırken bir hata oluştu. Lütfen tekrar dene.');
      } finally {
          setIsTransferring(false);
      }
  };

  // Bekleyen başvuruyu geri çek (APPLIED iken)
  const handleWithdrawApplication = async (requestId: string) => {
      setWithdrawingId(requestId);
      try {
          await withdrawProviderApplication(requestId);
          showActionSuccess('Başvuru geri çekildi.');
          await fetchIncomingRequests();
      } catch (err: any) {
          showActionError(err?.message || 'Başvuru geri çekilemedi.');
      } finally {
          setWithdrawingId(null);
      }
  };

  // Maç sonu: sağlayıcı "maçı oynadım" onayı (iki-taraflı payout kapısı)
  const handleProviderConfirm = async (requestId: string) => {
      setConfirmingId(requestId);
      try {
          await providerConfirmService(requestId);
          showActionSuccess('Maçı onayladın. Kaptan da onaylayınca ücret cüzdanına geçer.');
          await Promise.all([fetchIncomingRequests(), fetchEarnings()]);
      } catch (err: any) {
          showActionError(err?.message || 'Onay kaydedilemedi.');
      } finally {
          setConfirmingId(null);
      }
  };

  // KB-M2: kimlik kartı DÜRÜST türetmeleri — sabit "42/90/4.8/88/82" fallback'leri
  // ve "LVL 8 / PANTER / Altınordu / A-CLASS / VOLKAN" placeholder'ları yerine gerçek
  // veri; yoksa "—". Puan 0-10 ölçeğinde, yalnız >0 ise gösterilir.
  const gkCardStats = (userProfile?.stats ?? {}) as Record<string, unknown>;
  const idNum = (v: unknown): string => (typeof v === 'number' && Number.isFinite(v) ? String(v) : '—');
  const idRated = typeof userProfile?.rating === 'number' && userProfile.rating > 0;
  const idRatingText = idRated ? Number(userProfile.rating).toFixed(1) : '—';
  const idFilledBars = idRated ? Math.round(Number(userProfile.rating) / 2) : 0; // 0-10 → 0-5
  const idFirstName = userProfile?.fullName?.split(' ')[0]?.toUpperCase() || '';
  const idStyle: string | null = (typeof userProfile?.style === 'string' && userProfile.style.trim()) ? userProfile.style : null;
  // Sabit "A-CLASS" yerine puandan türetilen sınıf (rookie → YENİ).
  const idClass = !idRated ? 'YENİ' : Number(userProfile.rating) >= 8 ? 'A SINIF' : Number(userProfile.rating) >= 6 ? 'B SINIF' : 'C SINIF';
  // HR-B: hakem kartı için gerçek seviye + VAR (varCallAccuracy string).
  const idLevel: string | null = (typeof userProfile?.level === 'string' && userProfile.level.trim()) ? userProfile.level : null;
  const idVar: string = (typeof gkCardStats.varCallAccuracy === 'string' && (gkCardStats.varCallAccuracy as string).trim())
    ? `%${(gkCardStats.varCallAccuracy as string).replace('%', '')}` : '—';

  // --- GOALKEEPER IDENTITY CARD (FLIPPING) ---
  const renderGoalkeeperIdentityCard = () => (
      <div 
        className="mx-6 mt-6 mb-6 h-56 relative perspective-1000 cursor-pointer group"
        onClick={() => setFlipCard(!flipCard)}
      >
          <div className={`relative w-full h-full transition-transform duration-700 transform-style-3d ${flipCard ? 'rotate-y-180' : ''}`}>
              
              {/* FRONT SIDE */}
              <div className="absolute inset-0 backface-hidden rounded-[32px] bg-[#161B22]/90 backdrop-blur-xl border border-green-500/30 shadow-2xl p-5 overflow-hidden">
                  {/* Background FX */}
                  <div className="absolute -right-10 -top-10 w-40 h-40 bg-green-500/20 blur-[50px] rounded-full pointer-events-none"></div>
                  <div className="absolute top-4 right-4 bg-black/40 px-2 py-1 rounded-lg border border-white/10 text-[10px] text-gray-400 flex items-center gap-1">
                      <RefreshCcw size={10} /> Çevir
                  </div>

                  <div className="flex gap-4 items-center h-full">
                      <div className="relative shrink-0">
                          <div className="w-24 h-32 bg-black/40 rounded-2xl overflow-hidden border-2 border-green-500/50 shadow-[0_0_20px_rgba(34,197,94,0.3)] flex items-center justify-center">
                              {auth.currentUser?.photoURL
                                ? <img src={auth.currentUser.photoURL} className="w-full h-full object-cover object-center" alt="Kaleci" referrerPolicy="no-referrer" />
                                : <Shield size={40} className="text-green-500/40" />}
                          </div>
                      </div>
                      <div className="flex-1">
                          <h2 className="text-3xl font-black text-white leading-none mb-1 truncate max-w-[150px]">{idFirstName}</h2>
                          {/* Sabit "PANTER / Altınordu" yerine gerçek stil (varsa). */}
                          {idStyle && (
                            <div className="flex items-center gap-2 mb-3">
                              <span className="bg-green-500 text-black text-[10px] font-black px-2 py-0.5 rounded flex items-center gap-1">
                                  <Shield size={10} fill="black" /> {idStyle.toLocaleUpperCase('tr-TR')}
                              </span>
                            </div>
                          )}

                          {/* Stats Grid */}
                          <div className="grid grid-cols-3 gap-2 mt-2">
                              <div className="bg-[#0A0E14] rounded-xl p-2 text-center border border-white/5">
                                  <p className="text-[9px] text-gray-500 font-bold">MAÇ</p>
                                  <p className="text-sm font-black text-white">{idNum(userProfile?.matchesPlayed)}</p>
                              </div>
                              <div className="bg-[#0A0E14] rounded-xl p-2 text-center border border-white/5">
                                  <p className="text-[9px] text-gray-500 font-bold">REAKSİYON</p>
                                  <p className="text-sm font-black text-white">{idNum(gkCardStats.reflexes)}</p>
                              </div>
                              <div className="bg-[#0A0E14] rounded-xl p-2 text-center border border-white/5">
                                  <p className="text-[9px] text-gray-500 font-bold">PUAN</p>
                                  <p className="text-sm font-black text-green-400">{idRatingText}</p>
                              </div>
                          </div>
                      </div>
                  </div>
              </div>

              {/* ── BACK SIDE ── SPECTACULAR */}
              <div className="absolute inset-0 backface-hidden rotate-y-180 rounded-[32px] overflow-hidden border-2 border-green-400/60 shadow-[0_0_40px_rgba(34,197,94,0.35)]"
                style={{ background: 'linear-gradient(135deg, #022c16 0%, #061a10 50%, #0A0E14 100%)' }}>

                {/* Animated hex grid background */}
                <svg className="absolute inset-0 w-full h-full opacity-[0.07]" xmlns="http://www.w3.org/2000/svg">
                  <defs>
                    <pattern id="hex" width="28" height="24" patternUnits="userSpaceOnUse">
                      <polygon points="14,2 24,8 24,16 14,22 4,16 4,8" fill="none" stroke="#22c55e" strokeWidth="0.8"/>
                    </pattern>
                  </defs>
                  <rect width="100%" height="100%" fill="url(#hex)"/>
                </svg>

                {/* Top neon bar */}
                <div className="absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r from-transparent via-green-400 to-transparent" />

                {/* Glow orbs */}
                <div className="absolute -top-6 -right-6 w-32 h-32 rounded-full blur-[50px]" style={{ background: 'rgba(34,197,94,0.4)' }} />
                <div className="absolute -bottom-6 -left-6 w-28 h-28 rounded-full blur-[40px]" style={{ background: 'rgba(250,204,21,0.15)' }} />

                <div className="relative z-10 h-full flex flex-col p-4">
                  {/* Header */}
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 rounded-lg bg-green-500 flex items-center justify-center text-black">
                        <Shield size={12} fill="black" />
                      </div>
                      <span className="text-[10px] font-black text-green-400 uppercase tracking-widest">Kariyer Kartı</span>
                    </div>
                    <div className="flex items-center gap-1.5 bg-green-500/20 border border-green-400/40 px-2.5 py-1 rounded-lg">
                      <div className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
                      <span className="text-[10px] font-black text-green-300">{idClass}</span>
                    </div>
                  </div>

                  {/* Main rating */}
                  <div className="flex-1 flex items-center justify-center">
                    <div className="text-center relative">
                      <div className="absolute inset-0 blur-2xl rounded-full" style={{ background: 'rgba(34,197,94,0.3)' }} />
                      <div className="text-[10px] text-gray-400 font-black uppercase tracking-[0.3em] mb-0.5">Genel Reyting</div>
                      <div className="text-6xl font-black leading-none relative"
                        style={{ color: '#22c55e', textShadow: '0 0 30px rgba(34,197,94,0.8), 0 0 60px rgba(34,197,94,0.4)' }}>
                        {idRatingText}
                      </div>
                      <div className="flex items-center justify-center gap-0.5 mt-1">
                        {[1,2,3,4,5].map(i => (
                          <div key={i} className="w-5 h-1 rounded-full" style={{ background: i <= idFilledBars ? '#22c55e' : 'rgba(255,255,255,0.1)' }} />
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Stats row */}
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { label: 'Uçuş', value: idNum(gkCardStats.diving), glow: '#22c55e' },
                      { label: 'Konum', value: idNum(gkCardStats.positioning), glow: '#facc15' },
                      { label: 'Bire Bir', value: idNum(gkCardStats.oneOnOne), glow: '#22c55e' },
                    ].map(s => (
                      <div key={s.label} className="rounded-xl py-2 px-1 text-center border border-white/8"
                        style={{ background: 'rgba(0,0,0,0.5)' }}>
                        <div className="text-lg font-black" style={{ color: s.glow, textShadow: `0 0 12px ${s.glow}80` }}>{s.value}</div>
                        <div className="text-[8px] text-gray-500 font-bold uppercase">{s.label}</div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

          </div>
      </div>
  );

  // --- REFEREE IDENTITY CARD (FLIPPING) ---
  const renderRefereeIdentityCard = () => (
      <div 
        className="mx-6 mt-6 mb-6 h-56 relative perspective-1000 cursor-pointer group"
        onClick={() => setFlipCard(!flipCard)}
      >
          <div className={`relative w-full h-full transition-transform duration-700 transform-style-3d ${flipCard ? 'rotate-y-180' : ''}`}>
              
              {/* FRONT SIDE */}
              <div className="absolute inset-0 backface-hidden rounded-[32px] bg-[#161B22]/90 backdrop-blur-xl border border-red-500/30 shadow-2xl p-5 overflow-hidden">
                  {/* Background FX */}
                  <div className="absolute -right-10 -top-10 w-40 h-40 bg-red-500/20 blur-[50px] rounded-full pointer-events-none"></div>
                  <div className="absolute top-4 right-4 bg-black/40 px-2 py-1 rounded-lg border border-white/10 text-[10px] text-gray-400 flex items-center gap-1">
                      <RefreshCcw size={10} /> Çevir
                  </div>

                  <div className="flex gap-4 items-center h-full">
                      <div className="relative shrink-0">
                          {/* HR-B: yabancının stok fotosu yerine hakem ikonu placeholder. */}
                          <div className="w-24 h-32 bg-black/40 rounded-2xl overflow-hidden border-2 border-red-500/50 shadow-[0_0_20px_rgba(239,68,68,0.3)] flex items-center justify-center">
                              {auth.currentUser?.photoURL
                                ? <img src={auth.currentUser.photoURL} className="w-full h-full object-cover object-top" alt="Hakem" referrerPolicy="no-referrer" />
                                : <Scale size={40} className="text-red-500/40" />}
                          </div>
                          {/* Sabit "FIFA" yerine gerçek seviye (varsa). */}
                          {idLevel && (
                            <div className="absolute -bottom-3 left-1/2 -translate-x-1/2 bg-[#FACC15] text-black text-[10px] font-black px-3 py-1 rounded-full shadow-lg whitespace-nowrap border-2 border-[#161B22]">
                                {idLevel.toLocaleUpperCase('tr-TR')}
                            </div>
                          )}
                      </div>
                      <div className="flex-1">
                          <h2 className="text-3xl font-black text-white leading-none mb-1 truncate max-w-[150px]">{idFirstName}</h2>
                          {/* Sabit "OTORİTER / Ordu" yerine gerçek stil (varsa). */}
                          {idStyle && (
                            <div className="flex items-center gap-2 mb-3">
                              <span className="bg-red-600 text-white text-[10px] font-black px-2 py-0.5 rounded flex items-center gap-1">
                                  <Scale size={10} /> {idStyle.toLocaleUpperCase('tr-TR')}
                              </span>
                            </div>
                          )}

                          {/* Stats Grid — gerçek veri / "—" (sabit 150/%98/4.9 değil) */}
                          <div className="grid grid-cols-3 gap-2 mt-2">
                              <div className="bg-[#0A0E14] rounded-xl p-2 text-center border border-white/5">
                                  <p className="text-[9px] text-gray-500 font-bold">YÖNETİM</p>
                                  <p className="text-sm font-black text-white">{idNum(gkCardStats.authority)}</p>
                              </div>
                              <div className="bg-[#0A0E14] rounded-xl p-2 text-center border border-white/5">
                                  <p className="text-[9px] text-gray-500 font-bold">VAR</p>
                                  <p className="text-sm font-black text-white">{idVar}</p>
                              </div>
                              <div className="bg-[#0A0E14] rounded-xl p-2 text-center border border-white/5">
                                  <p className="text-[9px] text-gray-500 font-bold">PUAN</p>
                                  <p className="text-sm font-black text-red-400">{idRatingText}</p>
                              </div>
                          </div>
                      </div>
                  </div>
              </div>

              {/* BACK SIDE */}
              <div className="absolute inset-0 backface-hidden rotate-y-180 rounded-[32px] bg-gradient-to-br from-[#7F1D1D] to-[#161B22] border-[3px] border-red-500/50 shadow-[0_0_30px_rgba(239,68,68,0.2)] p-5 flex flex-col justify-between overflow-hidden">
                  {/* Glowing Effects */}
                  <div className="absolute -right-20 -top-20 w-64 h-64 bg-red-500/20 blur-[60px] rounded-full pointer-events-none animate-pulse-slow"></div>
                  <div className="absolute -left-20 -bottom-20 w-64 h-64 bg-orange-500/10 blur-[60px] rounded-full pointer-events-none animate-float-y"></div>
                  
                  <div className="relative z-10 flex items-center justify-between border-b border-red-500/30 pb-3">
                      <h3 className="font-black text-orange-400 uppercase tracking-widest text-xs flex items-center gap-2">
                          <Activity size={14} /> KARİYER PERFORMANSI
                      </h3>
                      <div className="bg-red-500 text-white text-[10px] font-black px-2 py-1 rounded shadow-[0_0_10px_rgba(239,68,68,0.6)] animate-pulse">
                          {idClass}
                      </div>
                  </div>

                  <div className="relative z-10 flex-1 flex flex-col justify-center items-center py-4">
                      <div className="text-center relative">
                          <div className="absolute inset-0 bg-red-500 blur-2xl opacity-20 rounded-full animate-breathe"></div>
                          <span className="text-[10px] text-gray-400 font-bold uppercase tracking-widest absolute -top-5 w-full text-center">Genel Reyting</span>
                          <span className="text-6xl font-black text-transparent bg-clip-text bg-gradient-to-b from-white to-gray-400 drop-shadow-[0_0_15px_rgba(255,255,255,0.4)]">
                              {idRatingText}
                          </span>
                      </div>
                  </div>

                  <div className="relative z-10 grid grid-cols-2 gap-3">
                      <div className="bg-black/40 backdrop-blur lg:hover:-translate-y-1 transition-transform border border-white/10 rounded-xl p-3 flex flex-col items-center justify-center relative overflow-hidden group">
                          <div className="absolute w-full h-1 top-0 left-0 bg-gradient-to-r from-transparent via-red-400 to-transparent translate-x-[-100%] group-hover:animate-shimmer"></div>
                          <span className="text-[9px] text-gray-400 font-bold uppercase tracking-wider mb-1 text-center">Maç Puanı Ort.</span>
                          <span className="text-2xl font-black text-red-400 drop-shadow-[0_0_5px_rgba(239,68,68,0.6)] z-10 relative">{idRatingText}</span>
                      </div>
                      <div className="bg-black/40 backdrop-blur lg:hover:-translate-y-1 transition-transform border border-white/10 rounded-xl p-3 flex flex-col items-center justify-center relative overflow-hidden group">
                          <div className="absolute w-full h-1 top-0 left-0 bg-gradient-to-r from-transparent via-orange-400 to-transparent translate-x-[-100%] group-hover:animate-shimmer"></div>
                          <span className="text-[9px] text-gray-400 font-bold uppercase tracking-wider mb-1 text-center text-balance leading-tight">Yönetim Değeri</span>
                          <span className="text-2xl font-black text-orange-400 drop-shadow-[0_0_5px_rgba(249,115,22,0.6)] z-10 relative">{idClass}</span>
                      </div>
                  </div>
              </div>

          </div>
      </div>
  );

  // FAZ 5 — TC kimlik doğrulama CTA / rozet
  const renderIdentitySection = () => (
      <div className="px-6">
          {identityStatus === 'VERIFIED' ? (
              <div className="flex items-center gap-3 bg-green-500/10 border border-green-500/30 rounded-2xl px-4 py-3">
                  <div className="w-9 h-9 rounded-full bg-green-500/20 flex items-center justify-center text-green-400 shrink-0">
                      <BadgeCheck size={18} />
                  </div>
                  <div>
                      <p className="text-sm font-black text-green-400">Kimlik doğrulandı</p>
                      <p className="text-[10px] text-gray-400 font-bold">Ödemelerini alabilirsin.</p>
                  </div>
              </div>
          ) : (
              <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-2xl p-4">
                  <div className="flex items-start gap-3">
                      <div className="w-9 h-9 rounded-full bg-yellow-500/20 flex items-center justify-center text-yellow-400 shrink-0">
                          <AlertTriangle size={18} />
                      </div>
                      <div className="flex-1">
                          <p className="text-sm font-black text-white">
                              {identityStatus === 'PENDING' ? 'Kimlik doğrulaması inceleniyor' : identityStatus === 'REJECTED' ? 'Kimlik doğrulaması reddedildi' : 'Kimlik doğrulaması gerekli'}
                          </p>
                          <p className="text-[11px] text-gray-300 font-bold mt-0.5">
                              Ödemelerini alabilmek için TC kimlik doğrulaması gerekli.
                          </p>
                      </div>
                  </div>
                  {identityStatus !== 'PENDING' && (
                      <button
                          onClick={() => { if (!guardGuest()) return; setIdentityName(userProfile?.fullName || ''); setIdentityFormError(null); setShowIdentityModal(true); }}
                          className="w-full mt-3 py-2.5 rounded-xl bg-yellow-500 hover:bg-yellow-400 text-black text-xs font-black uppercase tracking-wider transition-colors"
                      >
                          Kimlik Doğrula
                      </button>
                  )}
              </div>
          )}
      </div>
  );

  // FAZ 5 — Gelen talepler bölümü
  const renderIncomingRequestsSection = () => (
      <div className="px-6">
          <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                  <Inbox size={16} className={theme.primary} />
                  <h3 className="font-black text-white text-sm tracking-wide uppercase">GELEN TALEPLER</h3>
                  {newRequests.length > 0 && (
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${isRef ? 'bg-red-500/15 border-red-500/30 text-red-400' : 'bg-green-500/15 border-green-500/30 text-green-400'}`}>{newRequests.length}</span>
                  )}
              </div>
              <button onClick={fetchIncomingRequests} className="text-gray-500 hover:text-white transition-colors">
                  <RefreshCcw size={14} />
              </button>
          </div>

          {requestsLoading ? (
              <LoadingState message="Talepler yükleniyor..." size="sm" />
          ) : requestsError ? (
              <ErrorState message={requestsError} onRetry={fetchIncomingRequests} />
          ) : (newRequests.length === 0 && activeRequests.length === 0) ? (
              <div className="bg-[#161B22] border border-dashed border-white/10 rounded-[24px] p-8 text-center">
                  <div className="w-12 h-12 bg-white/5 rounded-full flex items-center justify-center mx-auto mb-3">
                      <Inbox size={24} className="text-gray-600" />
                  </div>
                  <p className="text-gray-400 text-sm font-bold">Henüz gelen talebin yok.</p>
              </div>
          ) : (
              <div className="space-y-4">
                  {/* Yeni Talepler */}
                  {newRequests.length > 0 && (
                      <div className="space-y-3">
                          <p className="text-[10px] font-black text-gray-500 uppercase tracking-widest">Yeni Talepler</p>
                          {newRequests.map(req => (
                              <div key={req.id} className={`bg-gradient-to-r to-[#161B22] border rounded-[24px] p-4 ${isRef ? 'from-red-900/30 border-red-500/30' : 'from-green-900/30 border-green-500/30'}`}>
                                  <div className="flex items-start justify-between">
                                      <div>
                                          <h4 className="font-black text-white text-sm">{req.providerType === 'REF' ? 'Hakemlik Talebi' : 'Kalecilik Talebi'}</h4>
                                          <p className="text-[10px] text-gray-400 font-bold mt-0.5">Maç: {req.matchId.slice(0, 8)}</p>
                                      </div>
                                      <div className="text-right">
                                          <p className="text-[9px] text-gray-500 font-bold uppercase">Eline geçecek</p>
                                          <p className="text-lg font-black text-green-400">{req.providerAmount}₺</p>
                                          <p className="text-[9px] text-gray-500 font-bold">Brüt {req.fee}₺</p>
                                      </div>
                                  </div>
                                  <div className="mt-4 flex gap-2">
                                      <button
                                          onClick={() => handleRespondRequest(req.id, false)}
                                          disabled={respondingId === req.id}
                                          className="flex-1 py-2.5 rounded-xl bg-white/5 border border-white/10 text-gray-300 text-xs font-black uppercase hover:bg-white/10 transition-colors disabled:opacity-50 flex items-center justify-center gap-1.5"
                                      >
                                          <X size={14} /> Reddet
                                      </button>
                                      <button
                                          onClick={() => handleAcceptClick(req)}
                                          disabled={respondingId === req.id}
                                          className={`flex-1 py-2.5 rounded-xl text-white text-xs font-black uppercase transition-colors disabled:opacity-50 flex items-center justify-center gap-1.5 ${isRef ? 'bg-red-500 hover:bg-red-400 shadow-[0_0_12px_rgba(239,68,68,0.3)]' : 'bg-green-500 hover:bg-green-400 shadow-[0_0_12px_rgba(34,197,94,0.3)]'}`}
                                      >
                                          {respondingId === req.id ? <RefreshCcw size={14} className="animate-spin" /> : <Check size={14} />}
                                          Kabul Et
                                      </button>
                                  </div>
                              </div>
                          ))}
                      </div>
                  )}

                  {/* FAZ 4: No-show bildirilen talepler → 48s içinde itiraz */}
                  {noShowRequests.length > 0 && (
                      <div className="space-y-3">
                          <p className="text-[10px] font-black text-red-400 uppercase tracking-widest">No-show Bildirimi</p>
                          {noShowRequests.map(req => (
                              <div key={req.id} className="bg-red-950/20 border border-red-500/25 rounded-[24px] p-4">
                                  <div className="flex items-start justify-between">
                                      <div>
                                          <h4 className="font-black text-white text-sm">{req.providerType === 'REF' ? 'Hakemlik' : 'Kalecilik'} — Katılmadın</h4>
                                          <p className="text-[10px] text-gray-400 font-bold mt-0.5">Maç: {req.matchId.slice(0, 8)}</p>
                                      </div>
                                      <div className="text-right">
                                          <p className="text-[9px] text-gray-500 font-bold uppercase">Ceza</p>
                                          <p className="text-lg font-black text-red-400">{req.penaltyAmount ?? '—'}₺</p>
                                      </div>
                                  </div>
                                  {(req.status as string) === 'DISPUTED' ? (
                                      // KB-3: İtiraz zaten yapıldı — tekrar itiraz butonu değil, durum bilgisi.
                                      <div className="mt-2 flex items-center gap-2 rounded-xl bg-amber-500/8 border border-amber-500/25 px-3 py-2.5">
                                          <AlertTriangle size={14} className="text-amber-300 shrink-0" />
                                          <p className="text-[10px] text-amber-200/90 font-bold leading-relaxed">
                                              İtirazın alındı — durum yönetim tarafından inceleniyor. Sonuç bu ekrana düşecek.
                                          </p>
                                      </div>
                                  ) : (
                                      <>
                                          <p className="text-[10px] text-white/45 mt-2 leading-relaxed">
                                              Kaptan maça gelmediğini bildirdi; ceza teminatından tahsil edildi. Haksız olduğunu düşünüyorsan itiraz et — durum yönetim tarafından incelenir.
                                          </p>
                                          <button
                                              onClick={() => handleDisputeNoShow(req.id)}
                                              disabled={respondingId === req.id}
                                              className="w-full mt-3 py-2.5 rounded-xl bg-white/5 border border-red-500/25 text-red-300 text-xs font-black uppercase hover:bg-red-500/10 transition-colors disabled:opacity-50 flex items-center justify-center gap-1.5">
                                              {respondingId === req.id ? <RefreshCcw size={14} className="animate-spin" /> : <AlertTriangle size={14} />} İtiraz Et
                                          </button>
                                      </>
                                  )}
                              </div>
                          ))}
                      </div>
                  )}

                  {/* Yaklaşan (ACCEPTED / payout serbest olmayan CAPTURED) */}
                  {activeRequests.length > 0 && (
                      <div className="space-y-3">
                          <p className="text-[10px] font-black text-gray-500 uppercase tracking-widest">Yaklaşan</p>
                          {activeRequests.map(req => (
                              <div key={req.id} className="bg-[#161B22] border border-white/6 rounded-[24px] p-4">
                                  <div className="flex items-start justify-between">
                                      <div>
                                          <h4 className="font-black text-white text-sm">{req.providerType === 'REF' ? 'Hakemlik' : 'Kalecilik'}</h4>
                                          <p className="text-[10px] text-gray-400 font-bold mt-0.5">Maç: {req.matchId.slice(0, 8)}</p>
                                      </div>
                                      <div className="text-right">
                                          <span className={`text-[9px] font-black px-2 py-1 rounded-md uppercase tracking-wider ${req.status === 'CAPTURED' ? 'bg-blue-500/20 text-blue-400' : 'bg-green-500/20 text-green-400'}`}>
                                              {req.status === 'CAPTURED' ? 'Ödeme Bekliyor' : 'Onaylandı'}
                                          </span>
                                          <p className="text-sm font-black text-green-400 mt-1">{req.providerAmount}₺</p>
                                      </div>
                                  </div>
                                  {/* KB-1: İki-taraflı onay TÜM CAPTURED taleplerde gösterilir.
                                      Eskiden yalnız initiatedBy==='PROVIDER' iken görünüyordu; ama
                                      _release_service_payout her talepte provider_confirmed AND
                                      captain_confirmed istiyor → kaptan-başlatan/FCFS-kabul edilen
                                      rezervasyonlarda GK'nin onay butonu HİÇ çıkmadığından payout
                                      sonsuza dek PENDING kalıyordu. Artık initiator'dan bağımsız. */}
                                  {req.status === 'CAPTURED' && !req.payoutReleased && (
                                    req.providerConfirmed ? (
                                      <div className="w-full mt-3 py-2 rounded-xl bg-green-500/10 border border-green-500/25 text-green-400 text-[11px] font-black uppercase tracking-wider flex items-center justify-center gap-1.5">
                                          <Check size={13} /> Onayladın · Kaptan onayı bekleniyor
                                      </div>
                                    ) : (
                                      <button
                                          onClick={() => handleProviderConfirm(req.id)}
                                          disabled={confirmingId === req.id}
                                          className="w-full mt-3 py-2 rounded-xl bg-green-500 hover:bg-green-400 text-white text-[11px] font-black uppercase tracking-wider transition-colors disabled:opacity-50 flex items-center justify-center gap-1.5 shadow-[0_0_12px_rgba(34,197,94,0.3)]"
                                      >
                                          {confirmingId === req.id ? <RefreshCcw size={13} className="animate-spin" /> : <Check size={13} />}
                                          Maçı Oynadım · Onayla
                                      </button>
                                    )
                                  )}
                                  {/* Sorun Bildir: CAPTURED ama henüz tamamlanmamış (payout serbest değil) */}
                                  {req.status === 'CAPTURED' && !req.payoutReleased && (
                                      <button
                                          onClick={() => handleReportAttendance(req.id)}
                                          disabled={reportingId === req.id}
                                          className="w-full mt-2 py-2 rounded-xl bg-yellow-500/10 border border-yellow-500/30 text-yellow-400 text-[11px] font-black uppercase tracking-wider hover:bg-yellow-500/20 transition-colors disabled:opacity-50 flex items-center justify-center gap-1.5"
                                      >
                                          {reportingId === req.id ? <RefreshCcw size={13} className="animate-spin" /> : <Flag size={13} />}
                                          Sorun Bildir
                                      </button>
                                  )}
                              </div>
                          ))}
                      </div>
                  )}

                  {/* Bug D: Tamamlanan talepler (COMPLETED / payout serbest) — sağlayıcı tamamlanan işini görsün */}
                  {completedRequests.length > 0 && (
                      <div className="space-y-3">
                          <p className="text-[10px] font-black text-gray-500 uppercase tracking-widest">Tamamlanan</p>
                          {completedRequests.map(req => (
                              <div key={req.id} className="bg-[#161B22] border border-white/6 rounded-[24px] p-4">
                                  <div className="flex items-start justify-between">
                                      <div>
                                          <h4 className="font-black text-white text-sm">{req.providerType === 'REF' ? 'Hakemlik' : 'Kalecilik'}</h4>
                                          <p className="text-[10px] text-gray-400 font-bold mt-0.5">Maç: {req.matchId.slice(0, 8)}</p>
                                      </div>
                                      <div className="text-right">
                                          <span className="text-[9px] font-black px-2 py-1 rounded-md uppercase tracking-wider bg-green-500/20 text-green-400 inline-flex items-center gap-1">
                                              <CheckCircle2 size={11} /> Ödendi
                                          </span>
                                          <p className="text-sm font-black text-green-400 mt-1">{req.providerAmount}₺</p>
                                      </div>
                                  </div>
                              </div>
                          ))}
                      </div>
                  )}
              </div>
          )}
      </div>
  );

  // --- SUB-VIEWS ---

  const renderHomeView = () => (
      <motion.div
        initial={{ opacity: 0, y: 28 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ type: 'spring', stiffness: 260, damping: 28 }}
        className="space-y-6 pb-40"
      >
          {/* Online/Offline Toggle — Premium Neon Design */}
      <div className="px-6 pt-2">
          <motion.button
            onClick={handleToggleClick}
            whileTap={{ scale: 0.97 }}
            className="w-full relative overflow-hidden rounded-[24px] border transition-all duration-500"
            style={{
              background: isAvailable
                ? isRef
                  ? 'linear-gradient(135deg, rgba(239,68,68,0.15) 0%, rgba(10,14,20,0.95) 100%)'
                  : 'linear-gradient(135deg, rgba(34,197,94,0.15) 0%, rgba(10,14,20,0.95) 100%)'
                : 'rgba(22,27,34,0.9)',
              borderColor: isAvailable
                ? isRef ? 'rgba(239,68,68,0.5)' : 'rgba(34,197,94,0.5)'
                : 'rgba(255,255,255,0.06)',
              boxShadow: isAvailable
                ? isRef ? '0 0 30px rgba(239,68,68,0.15)' : '0 0 30px rgba(34,197,94,0.15)'
                : 'none'
            }}
          >
            {/* Animated background pulse */}
            {isAvailable && (
              <motion.div
                className="absolute inset-0 rounded-[24px] opacity-30"
                animate={{ opacity: [0.1, 0.25, 0.1] }}
                transition={{ duration: 2.5, repeat: Infinity, ease: 'easeInOut' }}
                style={{
                  background: isRef
                    ? 'radial-gradient(ellipse at 20% 50%, rgba(239,68,68,0.4), transparent 70%)'
                    : 'radial-gradient(ellipse at 20% 50%, rgba(34,197,94,0.4), transparent 70%)'
                }}
              />
            )}

            <div className="relative flex items-center justify-between px-5 py-4 z-10">
              <div className="flex items-center gap-4">
                {/* Live dot */}
                <div className="relative flex items-center justify-center w-10 h-10">
                  {isAvailable && (
                    <motion.div
                      className="absolute inset-0 rounded-full"
                      animate={{ scale: [1, 1.8, 1], opacity: [0.6, 0, 0.6] }}
                      transition={{ duration: 2, repeat: Infinity, ease: 'easeOut' }}
                      style={{ background: isRef ? '#ef4444' : '#22c55e' }}
                    />
                  )}
                  <div
                    className="w-4 h-4 rounded-full relative z-10"
                    style={{ background: isAvailable ? (isRef ? '#ef4444' : '#22c55e') : '#4b5563' }}
                  />
                </div>

                <div className="text-left">
                  <p
                    className="font-black text-base tracking-wide"
                    style={{ color: isAvailable ? (isRef ? '#ef4444' : '#22c55e') : '#6b7280' }}
                  >
                    {isAvailable ? 'SİSTEMDE AKTİF' : 'ŞU AN MEŞGUL'}
                  </p>
                  <p className="text-[10px] font-bold mt-0.5" style={{ color: isAvailable ? 'rgba(255,255,255,0.4)' : 'rgba(255,255,255,0.2)' }}>
                    {isAvailable ? 'Kaptanlar seni görüyor ve teklif gönderebilir' : 'Yeni tekliflere kapalısın'}
                  </p>
                </div>
              </div>

              {/* Premium Toggle Switch */}
              <div
                className="w-14 h-7 rounded-full p-1 flex items-center transition-all duration-400"
                style={{ background: isAvailable ? (isRef ? '#ef4444' : '#22c55e') : '#1f2937' }}
              >
                <motion.div
                  animate={{ x: isAvailable ? 28 : 0 }}
                  transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                  className="w-5 h-5 rounded-full bg-white shadow-md"
                />
              </div>
            </div>
          </motion.button>
      </div>

          {/* FAZ 5 — TC Kimlik Doğrulama CTA / rozet */}
          {renderIdentitySection()}

          {/* Identity Card */}
          <div>
            {isRef ? renderRefereeIdentityCard() : renderGoalkeeperIdentityCard()}
          </div>

          {/* Kaptan çok-sağlayıcı TEKLİFLERİ (FCFS — ilk kabul eden işi alır) */}
          {matchOffers.length > 0 && (
            <div className="mb-6">
              <div className="flex items-center gap-2 mb-3 px-1">
                <Inbox size={16} className={isRef ? 'text-red-400' : 'text-[#39FF14]'} />
                <h3 className="text-sm font-black text-white uppercase tracking-wide">Gelen Teklifler</h3>
                <span className={`text-[10px] font-black rounded-full px-2 py-0.5 ${isRef ? 'text-white bg-red-500' : 'text-[#0A0E14] bg-[#39FF14]'}`}>{matchOffers.length}</span>
              </div>
              <div className="space-y-3">
                {matchOffers.map(o => {
                  const busy = respondingOfferId === o.id;
                  return (
                    <div key={o.id} className={`rounded-[24px] p-4 bg-gradient-to-br to-[#161B22] border ${isRef ? 'from-red-900/30 border-red-500/30' : 'from-green-900/30 border-green-500/30'}`}>
                      <div className="flex items-start justify-between mb-3">
                        <div className="min-w-0">
                          <p className="text-sm font-black text-white uppercase italic">{o.provider_type === 'GK' ? 'Kalecilik' : 'Hakemlik'} Teklifi</p>
                          <p className="text-[11px] text-white/50 truncate mt-0.5">{o.location || o.match_title || 'Maç'}{o.date ? ` · ${o.date}` : ''}{o.time ? ` ${o.time}` : ''}</p>
                          <p className={`text-[10px] font-bold mt-1 ${isRef ? 'text-red-400' : 'text-[#39FF14]'}`}>İlk kabul eden işi alır</p>
                        </div>
                        <div className="text-right shrink-0 pl-3">
                          <p className="text-[8px] font-black uppercase text-white/40 tracking-widest">Bedel</p>
                          <p className={`text-lg font-black ${isRef ? 'text-red-400' : 'text-[#39FF14]'}`}>{o.fee}₺</p>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <button disabled={busy} onClick={() => handleRespondMatchOffer(o.id, false)}
                          className="flex-1 h-11 rounded-xl bg-white/5 border border-white/10 text-white/60 text-xs font-bold flex items-center justify-center gap-1.5 active:scale-95 disabled:opacity-40">
                          <X size={14} /> Reddet
                        </button>
                        <button disabled={busy} onClick={() => handleRespondMatchOffer(o.id, true)}
                          className={`flex-[1.5] h-11 rounded-xl text-xs font-black flex items-center justify-center gap-1.5 active:scale-95 disabled:opacity-40 ${isRef ? 'bg-red-500 text-white' : 'bg-[#39FF14] text-[#0A0E14]'}`}>
                          {busy ? <Activity size={14} className="animate-spin" /> : <Check size={14} />} Kabul Et
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* FAZ 5 — Gelen Talepler */}
          {renderIncomingRequestsSection()}

          <div className="px-6">
              <div className="bg-[#161B22] border border-white/5 rounded-[32px] p-6 relative overflow-hidden group">
                  <motion.div 
                    className="absolute -right-4 -bottom-4 w-24 h-24 bg-blue-500/10 blur-3xl rounded-full group-hover:bg-blue-500/20 transition-colors"
                  />
                  <div className="flex items-center justify-between mb-4">
                      <h3 className="text-xs font-bold text-gray-500 uppercase tracking-widest">GÜNLÜK ÖZET</h3>
                      <Activity size={16} className="text-blue-400" />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                      <div>
                          <p className="text-[10px] text-gray-500 font-bold uppercase">Kazanç</p>
                          <p className="text-2xl font-black text-white">{earningsBalance}₺</p>
                      </div>
                      <div className="text-right">
                          <p className="text-[10px] text-gray-500 font-bold uppercase">Sıradaki Maç</p>
                          <p className="text-lg font-black text-[#FACC15]">{myUpcomingMatches[0]?.time || '--:--'}</p>
                      </div>
                  </div>
              </div>
          </div>

          {/* Sıradaki Maçlarım Section */}
          <div className="px-6">
              <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                      <Calendar size={16} className={theme.primary} />
                      <h3 className="font-black text-white text-sm tracking-wide uppercase">SIRADAKİ MAÇLARIM</h3>
                  </div>
              </div>
              
              {myUpcomingMatches.length > 0 ? (
                  <div className={`bg-gradient-to-r to-[#161B22] border rounded-[24px] p-5 relative overflow-hidden ${isRef ? 'from-red-900/40 border-red-500/30' : 'from-green-900/40 border-green-500/30'}`}>
                      <div className="flex justify-between items-start">
                          <div>
                              <h4 className="font-black text-white text-lg">{myUpcomingMatches[0].pitchName || myUpcomingMatches[0].location || 'Saha Bilinmiyor'}</h4>
                              <p className="text-xs text-gray-400 font-bold">{myUpcomingMatches[0].title || 'Rakip Aranıyor'} • {myUpcomingMatches[0].time}</p>
                          </div>
                          <div className="text-right">
                              <p className="text-[10px] text-gray-500 font-bold uppercase">KALAN SÜRE</p>
                              <p className="text-xl font-black text-[#FACC15] font-mono">{timeLeft}</p>
                          </div>
                      </div>
                      <div className="mt-4 pt-4 border-t border-white/5 flex flex-col gap-3">
                          <div className="flex justify-between items-center w-full">
                            <div className="flex items-center gap-2">
                                <MapPin size={12} className="text-gray-500" />
                                <span className="text-[10px] text-gray-400 font-bold">{myUpcomingMatches[0].location}</span>
                            </div>
                            <button 
                              onClick={() => setSelectedUpcomingJob(myUpcomingMatches[0] as any)}
                              className={`text-[10px] font-black hover:text-white transition-colors ${isRef ? 'text-red-400' : 'text-green-400'}`}
                            >
                                DETAYLAR
                            </button>
                          </div>
                          
                          {/* Live Location / Arrived Logic */}
                          <div className="flex flex-col gap-2">
                            {matchLiveStatus[myUpcomingMatches[0].id] === 'ARRIVED' ? (
                                <div className="flex gap-2">
                                  <button disabled className="flex-1 py-2 rounded-xl bg-white/10 text-white/50 text-[10px] font-black uppercase flex items-center justify-center gap-1">
                                    <CheckCircle2 size={12} /> KAPTANA BİLDİRİLDİ
                                  </button>
                                  <button 
                                    onClick={() => setShowPostMatchReport(true)}
                                    className="flex-1 py-2 rounded-xl bg-blue-500 text-white text-[10px] font-black uppercase shadow-[0_0_15px_rgba(59,130,246,0.4)]"
                                  >
                                    MAÇI BİTİR
                                  </button>
                                </div>
                            ) : matchLiveStatus[myUpcomingMatches[0].id] === 'ON_THE_WAY' ? (
                                <button 
                                  onClick={() => setMatchLiveStatus(prev => ({ ...prev, [myUpcomingMatches[0].id]: 'ARRIVED' }))}
                                  className={`w-full py-2.5 rounded-xl text-white text-xs font-black uppercase flex items-center justify-center gap-2 transition-colors ${isRef ? 'bg-red-500 hover:bg-red-400 shadow-[0_0_15px_rgba(239,68,68,0.3)]' : 'bg-green-500 hover:bg-green-400 shadow-[0_0_15px_rgba(34,197,94,0.3)]'}`}
                                >
                                  <MapPin size={14} /> TESİSE VARDIM
                                </button>
                            ) : (
                                <button 
                                  onClick={() => setMatchLiveStatus(prev => ({ ...prev, [myUpcomingMatches[0].id]: 'ON_THE_WAY' }))}
                                  className="w-full py-2.5 rounded-xl bg-blue-500 text-white text-xs font-black uppercase shadow-[0_0_15px_rgba(59,130,246,0.3)] flex items-center justify-center gap-2 hover:bg-blue-400 transition-colors"
                                >
                                  <Navigation size={14} /> YOLA ÇIKTIM
                                </button>
                            )}
                          </div>
                      </div>
                  </div>
              ) : (
                  <div className="bg-[#161B22] border border-dashed border-white/10 rounded-[24px] p-8 text-center">
                      <div className="w-12 h-12 bg-white/5 rounded-full flex items-center justify-center mx-auto mb-3">
                          <Calendar size={24} className="text-gray-600" />
                      </div>
                      <p className="text-gray-400 text-sm font-bold mb-4">Henüz onaylanmış bir maçın yok.</p>
                      <motion.button 
                        whileTap={{ scale: 0.95 }}
                        onClick={() => setActiveTab('JOBS')}
                        className={`text-white px-6 py-2 rounded-xl text-xs font-black shadow-lg transition-all ${isRef ? 'bg-red-600 hover:bg-red-500 shadow-red-900/20' : 'bg-green-600 hover:bg-green-500 shadow-green-900/20'}`}
                      >
                          MAÇ BUL
                      </motion.button>
                  </div>
              )}
          </div>

          {/* KB-M1: legacy "ÖZEL TEKLİFLER" (myOffers / service_offers) tamamen gizli —
              o tablo kullanılmıyor, gerçek teklifler FCFS matchOffers'ta. myOffers hiç
              dolmadığından bu blok asla render olmaz (dürüst-olmayan sahte teklif/kabul yok). */}
          {myOffers.length > 0 && (
          <div className="px-6">
              <div className="flex items-center gap-2 mb-3">
                  <Sparkles size={16} className="text-[#FACC15]" />
                  <h3 className="font-black text-white text-sm tracking-wide uppercase">ÖZEL TEKLİFLER</h3>
              </div>
              <div className="flex gap-3 overflow-x-auto pb-4 custom-scrollbar snap-x">
                  {offersLoading ? (
                    <LoadingState message="Teklifler yükleniyor..." size="sm" />
                  ) : offersError ? (
                    <ErrorState message={offersError} onRetry={fetchOffers} />
                  ) : myOffers.length > 0 ? myOffers.map(offer => (
                      <motion.div 
                        key={offer.id} 
                        whileHover={{ y: -5 }}
                        className="snap-center shrink-0 w-72 bg-gradient-to-br from-yellow-900/40 to-[#161B22] border border-[#FACC15]/30 rounded-[24px] p-4 relative overflow-hidden"
                      >
                          <div className="absolute top-0 right-0 px-2 py-1 bg-[#FACC15] text-black text-[9px] font-black rounded-bl-xl">
                              {offer.expiresIn} KALDI
                          </div>
                          
                          <div className="flex gap-3 mb-3">
                              <div className="w-10 h-10 bg-[#FACC15]/10 rounded-full flex items-center justify-center text-[#FACC15] font-black border border-[#FACC15]/20">
                                  {offer.captainName.charAt(0)}
                              </div>
                              <div>
                                  <h4 className="font-bold text-white text-sm">{offer.pitchName}</h4>
                                  <p className="text-[10px] text-gray-400">{offer.teamName} • {offer.time}</p>
                                  
                                  {/* Team Reliability / Toxic Warning */}
                                  {offer.captainName === 'Ali Y.' ? (
                                      <div className="flex items-center gap-1 mt-1 text-[8px] font-black bg-red-500/10 text-red-400 px-1.5 py-0.5 rounded border border-red-500/20 w-fit uppercase">
                                          <AlertTriangle size={8} /> Düşük Centilmenlik (2.1/5.0)
                                      </div>
                                  ) : (
                                      <div className="flex items-center gap-1 mt-1 text-[8px] font-black bg-blue-500/10 text-blue-400 px-1.5 py-0.5 rounded border border-blue-500/20 w-fit uppercase">
                                          <Shield size={8} /> Güvenilir Takım (4.9/5.0)
                                      </div>
                                  )}
                              </div>
                          </div>
                          
                          <p className="text-xs text-gray-300 italic mb-4 bg-black/20 p-2 rounded-lg border border-white/5">
                              "{offer.message}"
                          </p>

                          <div className="flex items-center justify-between">
                              <div className="flex flex-col">
                                  <span className="text-[10px] text-gray-500 uppercase font-bold">Teklif</span>
                                  <span className="text-xl font-black text-[#FACC15]">{offer.offerAmount}₺</span>
                              </div>
                              <button 
                                onClick={() => handleOpenOffer(offer)}
                                className="bg-[#FACC15] text-black px-4 py-2 rounded-xl text-xs font-black hover:scale-105 transition-transform"
                              >
                                  İNCELE
                              </button>
                          </div>
                      </motion.div>
                  )) : (
                    <div className="text-gray-500 text-[10px] uppercase font-bold italic w-full text-center py-4">Bekleyen özel teklifiniz yok</div>
                  )}
              </div>
          </div>
          )}
      </motion.div>
  );

  const renderJobFeedView = () => (
      <div className="space-y-6 pb-40 pt-4">

         {/* Header */}
         <div className="px-6 mb-2 mt-4">
            <div>
              <h3 className="font-black text-white text-sm flex items-center gap-2">
                {isRef ? '⚖️ HAKEM' : '🧤 KALECİ'} ARAYAN MAÇLAR
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${isRef ? 'bg-red-500/15 border-red-500/30 text-red-400' : 'bg-green-500/15 border-green-500/30 text-green-400'}`}>{openMatches.length}</span>
              </h3>
              <p className="text-[10px] text-gray-500 mt-0.5">Bölgendeki maçlar — başvur, oyna, kazan</p>
            </div>
         </div>

         {/* Pending Applications Section */}
         {pendingApplications.length > 0 && (
             <div className="px-6 space-y-3 mb-6">
                 <h3 className="font-black text-gray-400 text-xs flex items-center gap-2 uppercase tracking-widest">
                     <Activity size={12} className="text-yellow-500" /> BEKLEYEN BAŞVURULARIM
                 </h3>
                 {pendingApplications.map(job => (
                     <motion.div
                         key={job.id}
                         className="bg-[#161B22]/60 border border-yellow-500/30 rounded-[24px] overflow-hidden"
                     >
                         <div className="p-4 flex items-center justify-between">
                             <div>
                                 <h4 className="font-black text-white text-sm">{job.pitchName || job.location || 'Saha'}</h4>
                                 <p className="text-[10px] text-gray-400">{[job.date, job.time].filter(Boolean).join(' • ') || 'Maç'}{job.fee != null ? ` · ${formatTRYWithSymbol(job.fee)}` : ''}</p>
                             </div>
                             <div className="flex items-center gap-2">
                                 <span className="bg-yellow-500/20 text-yellow-500 text-[9px] font-black px-2 py-1 rounded-md uppercase tracking-wider">
                                     Kaptan Onayı Bekleniyor
                                 </span>
                                 <button
                                     onClick={() => handleWithdrawApplication(job.requestId)}
                                     disabled={withdrawingId === job.requestId}
                                     className="text-[9px] font-black uppercase tracking-wider text-gray-400 border border-white/10 rounded-md px-2 py-1 hover:bg-white/5 disabled:opacity-50"
                                 >
                                     {withdrawingId === job.requestId ? '...' : 'Geri Çek'}
                                 </button>
                             </div>
                         </div>
                     </motion.div>
                 ))}
             </div>
         )}

         {/* GK Match Cards */}
         <div className="px-6 space-y-3">
            
            {/* Açık maç yoksa net boş durum (eskiden hep bir sahte "SOS" kartı
                gösteriliyordu — gerçek veri değildi, kaldırıldı). */}
            {openMatches.length === 0 && (
              <div className="bg-[#161B22] border border-dashed border-white/10 rounded-[24px] p-8 text-center">
                <div className="w-12 h-12 bg-white/5 rounded-full flex items-center justify-center mx-auto mb-3">
                  <Search size={22} className="text-gray-600" />
                </div>
                <p className="text-gray-400 text-sm font-bold">Şu an {isRef ? 'hakem' : 'kaleci'} arayan açık maç yok.</p>
                <p className="text-gray-600 text-[11px] mt-1">Yeni maçlar açıldığında burada listelenecek.</p>
              </div>
            )}
            {openMatches.map(job => (
                <motion.div
                    key={job.id}
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    className={`bg-[#161B22] border border-white/6 rounded-[24px] overflow-hidden transition-all ${isRef ? 'hover:border-red-500/30' : 'hover:border-green-500/30'}`}
                >
                    <div className="p-4">
                      <div className="flex items-start justify-between">
                        <div className="flex items-center gap-3">
                          {/* Date box */}
                          <div className="w-12 shrink-0 bg-[#0A0E14] rounded-xl py-2 text-center border border-white/5">
                            <p className="text-[8px] text-gray-500 font-bold uppercase">{job.date ? (job.date.includes('-') ? job.date.slice(5).replace('-', '/') : job.date) : '—'}</p>
                            <p className="text-xs font-black text-white">{job.time || '—'}</p>
                          </div>
                          <div>
                            <h4 className="font-black text-white text-sm">{job.pitchName}</h4>
                            <p className="text-[10px] text-gray-400 mt-0.5">{job.captainName ? `Kpt: ${job.captainName} • ` : ''}<span className={isRef ? 'text-red-400' : 'text-green-400'}>{job.players} oyuncu</span></p>
                          </div>
                        </div>
                        <div className="text-right shrink-0">
                          {/* Gerçek fiyat yoksa uydurma 250/350 değil "Standart ücret". */}
                          <p className="text-lg font-black text-white">{job.fee != null ? formatTRYWithSymbol(job.fee) : 'Standart'}</p>
                          <p className="text-[9px] text-gray-500">maç başı</p>
                        </div>
                      </div>

                      <div className="flex items-center justify-between mt-3">
                        <div className="flex items-center gap-2">
                          <div className={`flex items-center gap-1 px-2 py-1 rounded-lg border ${isRef ? 'bg-red-500/10 border-red-500/20' : 'bg-green-500/10 border-green-500/20'}`}>
                            <div className={`w-1.5 h-1.5 rounded-full animate-pulse ${isRef ? 'bg-red-400' : 'bg-green-400'}`} />
                            <span className={`text-[9px] font-black ${isRef ? 'text-red-400' : 'text-green-400'}`}>{job.missing} Aranıyor</span>
                          </div>
                          <div className="flex items-center gap-1 text-[9px] text-gray-500">
                            <MapPin size={9} /> {job.location}
                          </div>
                        </div>
                        {appliedMatchIds.has(job.id) ? (
                          <span className={`px-4 py-1.5 rounded-xl text-[10px] font-black flex items-center gap-1 border ${isRef ? 'text-red-400 bg-red-500/10 border-red-500/30' : 'text-green-400 bg-green-500/10 border-green-500/30'}`}>
                            <Check size={11} /> Başvuruldu
                          </span>
                        ) : (
                          <motion.button
                            whileTap={{ scale: 0.94 }}
                            onClick={() => handleOpenBid(job as any)}
                            className={`px-4 py-1.5 rounded-xl text-[10px] font-black transition-colors ${isRef ? 'text-white bg-red-500 hover:bg-red-400 shadow-[0_0_12px_rgba(239,68,68,0.4)]' : 'text-black bg-green-400 hover:bg-green-300 shadow-[0_0_12px_rgba(34,197,94,0.4)]'}`}
                          >
                            BAŞVUR
                          </motion.button>
                        )}
                      </div>
                    </div>
                </motion.div>
            ))}
         </div>
         


      </div>
  );

   const renderWalletView = () => (
      <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="space-y-6 px-6 pt-6 pb-40"
      >
          <div className="bg-gradient-to-br from-gray-800 to-[#161B22] p-6 rounded-[32px] border border-white/10 relative overflow-hidden">
              <div className="absolute top-0 right-0 p-6 opacity-5"><Wallet size={120} /></div>
              <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">Toplam Kazanç</p>
              <h2 className="text-4xl font-black text-white mt-2">{earningsBalance + reservedBalance}₺</h2>

              <div className="mt-6 flex gap-4">
                  <div className="flex-1">
                      <p className="text-[10px] text-gray-500 uppercase font-bold">Çekilebilir</p>
                      <p className="text-xl font-bold text-green-400">{earningsBalance}₺</p>
                  </div>
                  <div className="flex-1 border-l border-white/10 pl-4">
                      <p className="text-[10px] text-gray-500 uppercase font-bold">Çekim Bekleyen</p>
                      <p className="text-xl font-bold text-gray-300">{reservedBalance}₺</p>
                  </div>
              </div>

              {pendingPayout && (
                  <div className="mt-4 p-3 bg-yellow-500/10 border border-yellow-500/30 rounded-xl">
                      <p className="text-[10px] text-yellow-400 font-bold">
                          {pendingPayout.amount}₺ tutarındaki çekim talebin işleniyor ({pendingPayout.iban}).
                          Sonuçlanınca bildirim alacaksın.
                      </p>
                  </div>
              )}

              <div className="mt-6 flex flex-col gap-3">
                  {(() => {
                      const defaultMethod = payoutMethods.find(m => m.isDefault) ?? payoutMethods[0];
                      const methodLabel = defaultMethod
                          ? (defaultMethod.kind === 'IBAN'
                              ? `IBAN •• ${defaultMethod.iban?.slice(-4)}`
                              : `${defaultMethod.cardBrand ?? 'KART'} **** ${defaultMethod.cardLast4}`)
                          : 'ÖDEME YÖNTEMİ EKLE';
                      return (
                          <div className="flex gap-2">
                              <button
                                  onClick={() => { if (!guardGuest()) return; setShowCardOptions(true); }}
                                  className="flex-1 py-3 bg-[#161B22] border border-white/10 text-white rounded-2xl font-black text-sm shadow-lg hover:bg-white/5 transition-all active:scale-95 flex items-center justify-center gap-2"
                              >
                                  <CreditCard size={18} /> {methodLabel}
                              </button>
                              <button
                                onClick={handleTransfer}
                                disabled={isTransferring || !!pendingPayout || earningsBalance <= 0}
                                className={`flex-1 py-3 ${isTransferring || !!pendingPayout || earningsBalance <= 0 ? 'bg-gray-600 opacity-50 cursor-not-allowed' : 'bg-[#34C759] hover:bg-[#2dbb4f]'} text-white rounded-2xl font-black text-sm shadow-lg shadow-green-900/20 transition-all active:scale-95 flex items-center justify-center gap-2`}
                              >
                                  {isTransferring ? (
                                      <RefreshCcw size={18} className="animate-spin" />
                                  ) : transferSuccess ? (
                                      <Check size={18} />
                                  ) : (
                                      <Banknote size={18} />
                                  )}
                                  {isTransferring ? 'GÖNDERİLİYOR...' : transferSuccess ? 'TALEP ALINDI' : 'PARAYI ÇEK'}
                              </button>
                          </div>
                      );
                  })()}
                  {identityStatus !== 'VERIFIED' && (
                      <p className="text-center text-[9px] font-bold text-yellow-500/80 uppercase tracking-widest">
                          İlk çekim öncesi TC kimlik doğrulaması gerekir
                      </p>
                  )}
              </div>

              <AnimatePresence>
                  {transferSuccess && (
                      <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                        className="mt-4 p-3 bg-green-500/10 border border-green-500/30 rounded-xl text-center"
                      >
                          <p className="text-[10px] text-green-400 font-bold">Çekim talebin alındı — finans onayından sonra hesabına geçecek.</p>
                      </motion.div>
                  )}
              </AnimatePresence>
          </div>

          <section>
              <h3 className="font-bold text-white text-sm px-2 mb-3 uppercase tracking-wide">İŞLEM GEÇMİŞİ</h3>
              {walletHistoryLoading ? (
                  <LoadingState message="İşlemler yükleniyor..." />
              ) : walletHistoryError ? (
                  <ErrorState message={walletHistoryError} onRetry={fetchWalletHistory} />
              ) : walletHistory.length === 0 ? (
                  <div className="text-center py-6 text-gray-500 text-xs font-bold uppercase tracking-widest">Henüz işlem yok</div>
              ) : (
              <div className="space-y-3">
                  {walletHistory.map((tx) => (
                      <div key={tx.id} className="bg-[#161B22] border border-white/5 p-4 rounded-2xl flex items-center justify-between">
                          <div>
                              <p className="font-bold text-sm text-white">{tx.description}</p>
                              <p className="text-[10px] text-gray-500">{tx.date}</p>
                          </div>
                          <div className={`text-right ${tx.amount > 0 ? 'text-white' : 'text-red-400'}`}>
                              <p className="font-black text-sm">{tx.amount > 0 ? '+' : ''}{tx.amount}₺</p>
                              <p className={`text-[9px] font-bold ${tx.status === 'CLEARED' ? 'text-green-500' : 'text-yellow-500'}`}>
                                  {tx.status === 'CLEARED' ? 'Onaylandı' : 'Bekliyor'}
                              </p>
                          </div>
                      </div>
                  ))}
              </div>
              )}
          </section>
      </motion.div>
  );

   const renderPricingView = () => (
      <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="space-y-6 px-6 pt-6 pb-40"
      >
          <motion.div 
            whileHover={{ scale: 1.02 }}
            className="bg-gradient-to-br from-[#FACC15]/20 to-transparent p-8 rounded-[32px] border border-[#FACC15]/20 text-center relative overflow-hidden group"
          >
              <motion.div 
                animate={{ 
                    rotate: [0, 10, -10, 0],
                    scale: [1, 1.1, 1, 1.1, 1]
                }}
                transition={{ duration: 5, repeat: Infinity }}
                className="absolute -top-10 -left-10 w-32 h-32 bg-[#FACC15]/10 blur-3xl rounded-full"
              />
              <Tag size={48} className="text-[#FACC15] mx-auto mb-4 group-hover:scale-110 transition-transform" />
              <h2 className="text-2xl font-black text-white mb-2 uppercase tracking-wide">STANDART FİYATIN</h2>
              <div className="flex items-center justify-center gap-2">
                  <motion.span 
                    key={baseFee}
                    initial={{ scale: 0.5, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    className="text-5xl font-black text-[#FACC15]"
                  >
                    {baseFee}₺
                  </motion.span>
                  <button onClick={() => setShowPriceModal(true)} className="p-2 bg-white/5 rounded-full text-gray-400 hover:text-white transition-colors">
                      <PlusCircle size={20} />
                  </button>
              </div>
              <p className="text-gray-400 text-xs mt-4">Kaptanlar seni bu fiyattan kiralamak için teklif gönderecek.</p>
          </motion.div>

          <div className="bg-[#161B22] border border-white/5 rounded-[32px] p-8 text-center">
              <div className="w-16 h-16 bg-blue-500/10 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Sparkles size={32} className="text-blue-400" />
              </div>
              <h3 className="text-xl font-black text-white mb-2">DAHA FAZLA KAZAN</h3>
              <p className="text-gray-400 text-sm mb-6">%0 komisyon avantajıyla kazancını katla.</p>
              <button 
                className="w-full py-4 bg-blue-600 hover:bg-blue-500 text-white font-black rounded-2xl transition-all shadow-lg shadow-blue-900/20"
              >
                  DETAYLARI GÖR
              </button>
          </div>
      </motion.div>
  );

  const renderMenuView = () => (
      <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="space-y-3 px-6 pt-6 pb-40"
      >
          <button onClick={() => setActiveTab('PROFILE_VIEW')} className="w-full bg-[#161B22] border border-white/5 p-4 rounded-2xl flex items-center justify-between group hover:border-[#FACC15]/30 transition-all">
              <div className="flex items-center gap-4">
                  <div className="w-10 h-10 bg-white/5 rounded-full flex items-center justify-center text-gray-400 group-hover:text-[#FACC15] transition-colors"><User size={20} /></div>
                  <div className="text-left">
                    <span className="font-bold text-white block">Profilim</span>
                    <span className="text-[10px] text-gray-500">Fotoğraf, açıklama ve tercihler</span>
                  </div>
              </div>
              <ChevronRight size={20} className="text-gray-600 group-hover:translate-x-1 transition-transform" />
          </button>
          <button onClick={() => setActiveTab('SETTINGS_VIEW')} className="w-full bg-[#161B22] border border-white/5 p-4 rounded-2xl flex items-center justify-between group hover:border-[#FACC15]/30 transition-all">
              <div className="flex items-center gap-4">
                  <div className="w-10 h-10 bg-white/5 rounded-full flex items-center justify-center text-gray-400 group-hover:text-[#FACC15] transition-colors"><Settings size={20} /></div>
                  <div className="text-left">
                    <span className="font-bold text-white block">Ayarlar</span>
                    <span className="text-[10px] text-gray-500">Bildirim, gizlilik ve hesap</span>
                  </div>
              </div>
              <ChevronRight size={20} className="text-gray-600 group-hover:translate-x-1 transition-transform" />
          </button>
          <button onClick={() => alert('Destek ekibine bağlanılıyor...')} className="w-full bg-[#161B22] border border-white/5 p-4 rounded-2xl flex items-center justify-between group hover:border-[#FACC15]/30 transition-all">
              <div className="flex items-center gap-4">
                  <div className="w-10 h-10 bg-white/5 rounded-full flex items-center justify-center text-gray-400 group-hover:text-[#FACC15] transition-colors"><MessageSquare size={20} /></div>
                  <span className="font-bold text-white">Destek</span>
              </div>
              <ChevronRight size={20} className="text-gray-600 group-hover:translate-x-1 transition-transform" />
          </button>
          <button onClick={() => (onLogout ?? onBack)()} className="w-full bg-red-500/10 border border-red-500/20 p-4 rounded-2xl flex items-center justify-between group hover:bg-red-500/20 transition-all mt-8">
              <div className="flex items-center gap-4">
                  <div className="w-10 h-10 bg-red-500/10 rounded-full flex items-center justify-center text-red-500"><X size={20} /></div>
                  <span className="font-bold text-red-500">Çıkış Yap</span>
              </div>
              <ChevronRight size={20} className="text-red-500 group-hover:translate-x-1 transition-transform" />
          </button>
          <div className="pt-8 text-center">
              <p className="text-[10px] text-gray-600 font-bold uppercase tracking-widest">OYNA v{APP_VERSION}</p>
          </div>
      </motion.div>
  );

  return (
    <div className="min-h-screen flex flex-col bg-[#0A0E14] relative overflow-hidden">
      
      {/* Profile sub-view */}
      {activeTab === 'PROFILE_VIEW' && (
        <ServiceProfile role={role} onBack={() => setActiveTab('MENU')} />
      )}

      {/* Settings sub-view */}
      {activeTab === 'SETTINGS_VIEW' && (
        <ServiceSettings role={role} onBack={() => setActiveTab('MENU')} onLogout={onLogout ?? onBack} />
      )}

      {activeTab !== 'PROFILE_VIEW' && activeTab !== 'SETTINGS_VIEW' && (<>
      {/* Animated Background - Color shifts based on role */}
      <div className="fixed inset-0 pointer-events-none z-0">
          <div className={`absolute top-[-20%] left-[-20%] w-[80%] h-[80%] rounded-full blur-[120px] animate-pulse-slow ${isRef ? 'bg-red-900/20' : 'bg-green-900/20'}`}></div>
          <div className={`absolute bottom-[-20%] right-[-20%] w-[80%] h-[80%] rounded-full blur-[120px] animate-pulse-slow delay-700 ${isRef ? 'bg-orange-900/10' : 'bg-blue-900/10'}`}></div>
      </div>

      <header className="p-6 flex justify-between items-center bg-transparent sticky top-0 z-20">
         {/* Kök panel: sekmeler alt navigasyonla değişir → geri butonu YOK
             (oyuncu Dashboard'ıyla tutarlı). Geri butonu yalnız alt-sayfalarda
             (Profil/Ayarlar) bulunur; onlar kendi başlıklarında taşır. */}
         <div className="flex items-center gap-3">
             <div>
                 <h1 className="font-black text-white text-lg leading-none">{isRef ? 'HAKEM' : 'KALECİ'}</h1>
                 <p className="text-[10px] text-gray-400 font-bold tracking-widest uppercase mt-1">
                    {activeTab === 'HOME' && 'Ana Sayfa'}
                    {activeTab === 'JOBS' && 'Maç Bul'}
                    {activeTab === 'WALLET' && 'Cüzdan'}
                    {activeTab === 'MENU' && 'Menü'}
                 </p>
             </div>
         </div>
         <button 
            onClick={() => setIsNotificationsOpen(true)}
            className="p-2 bg-[#161B22] rounded-full text-gray-400 border border-white/5 relative hover:text-white transition-colors"
         >
             <Bell size={20} />
             <span className="absolute top-0 right-0 w-2.5 h-2.5 bg-red-500 rounded-full border-2 border-[#0A0E14]"></span>
         </button>
      </header>

      <main className="flex-1 overflow-y-auto custom-scrollbar relative z-10">
         {activeTab === 'HOME' && renderHomeView()}
         {activeTab === 'JOBS' && renderJobFeedView()}
         {activeTab === 'WALLET' && renderWalletView()}
         {activeTab === 'MENU' && renderMenuView()}
      </main>

      {/* Service Navigation */}
      <nav className="fixed bottom-0 left-0 w-full bg-[#0A0E14]/95 backdrop-blur-2xl border-t border-white/5 pb-8 pt-4 px-4 flex justify-between items-center z-30">
         <button 
            onClick={() => setActiveTab('HOME')}
            className={`flex flex-col items-center gap-1.5 transition-all ${activeTab === 'HOME' ? 'text-[#FACC15] scale-110' : 'text-gray-500 hover:text-gray-300'}`}
         >
            <div className={`p-1 rounded-lg ${activeTab === 'HOME' ? 'bg-[#FACC15]/10' : ''}`}>
                <List size={20} />
            </div>
            <span className="text-[9px] font-black uppercase tracking-tighter">Ana Sayfa</span>
         </button>

         <button
            onClick={() => setActiveTab('JOBS')}
            className={`flex flex-col items-center gap-1.5 transition-all ${activeTab === 'JOBS' ? 'text-[#FACC15] scale-110' : 'text-gray-500 hover:text-gray-300'}`}
         >
            <div className={`p-1 rounded-lg ${activeTab === 'JOBS' ? 'bg-[#FACC15]/10' : ''}`}>
                <Search size={20} />
            </div>
            <span className="text-[9px] font-black uppercase tracking-tighter">Maç Bul</span>
         </button>

         <button
            onClick={() => setActiveTab('WALLET')}
            className={`flex flex-col items-center gap-1.5 transition-all ${activeTab === 'WALLET' ? 'text-[#FACC15] scale-110' : 'text-gray-500 hover:text-gray-300'}`}
         >
            <div className={`p-1 rounded-lg ${activeTab === 'WALLET' ? 'bg-[#FACC15]/10' : ''}`}>
                <Wallet size={20} />
            </div>
            <span className="text-[9px] font-black uppercase tracking-tighter">Cüzdan</span>
         </button>

         <button
            onClick={() => setActiveTab('MENU')}
            className={`flex flex-col items-center gap-1.5 transition-all ${activeTab === 'MENU' ? 'text-[#FACC15] scale-110' : 'text-gray-500 hover:text-gray-300'}`}
         >
            <div className={`p-1 rounded-lg ${activeTab === 'MENU' ? 'bg-[#FACC15]/10' : ''}`}>
                <PlusCircle size={20} />
            </div>
            <span className="text-[9px] font-black uppercase tracking-tighter">Menü</span>
         </button>
      </nav>

      {/* BID / OFFER MODAL */}
      {(selectedJob || selectedOffer) && (
          <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-end sm:items-center justify-center animate-in fade-in duration-200">
              <div className="bg-[#161B22] w-full max-w-md rounded-t-[32px] sm:rounded-[32px] border-t sm:border border-white/10 p-6 shadow-2xl relative animate-in slide-in-from-bottom duration-300">
                   {showBidSuccess ? (
                       <div className="py-12 flex flex-col items-center text-center">
                           <div className="w-20 h-20 bg-green-500 rounded-full flex items-center justify-center mb-6 shadow-[0_0_40px_rgba(34,197,94,0.4)]">
                               <Check size={40} className="text-white" />
                           </div>
                           <h3 className="text-2xl font-black text-white">TEKLİF GÖNDERİLDİ!</h3>
                           <p className="text-gray-400 mt-2">Kaptan onayladığında bildirim alacaksın.</p>
                       </div>
                   ) : (
                       <>
                           <button 
                            onClick={() => { setSelectedJob(null); setSelectedOffer(null); }}
                            className="absolute top-4 right-4 text-gray-500 hover:text-white"
                           >
                               <X size={20} />
                           </button>

                           <div className="text-center mb-6">
                               <p className="text-xs font-bold text-blue-400 uppercase tracking-widest mb-1">{selectedOffer ? 'ÖZEL DAVET' : (isRef ? 'HAKEMLİK FIRSATI' : 'KALECİLİK FIRSATI')}</p>
                               <h3 className="text-xl font-black text-white">{selectedOffer ? selectedOffer.pitchName : selectedJob?.pitchName}</h3>
                               <p className="text-gray-400 text-sm mt-1">{selectedOffer ? selectedOffer.time : selectedJob?.time}</p>
                           </div>

                           <div className="bg-[#0A0E14] border border-white/5 rounded-2xl p-4 mb-4">
                               <h4 className="text-xs font-bold text-gray-500 uppercase mb-2">Kaptana Gidecek Kartın</h4>
                               {/* HR-E: kaptana gidecek kart artık GERÇEK kimlik — sabit
                                   "Cüneyt (FIFA) 4.9/150" / "Volkan (Panter)" ve yabancı
                                   stok foto değil. Veri yoksa "—". */}
                               <div className="flex items-center gap-3">
                                   {auth.currentUser?.photoURL
                                     ? <img src={auth.currentUser.photoURL} referrerPolicy="no-referrer" className={`w-10 h-10 rounded-full border object-cover object-top ${isRef ? 'border-red-500' : 'border-green-500'}`} alt="profil" />
                                     : <div className={`w-10 h-10 rounded-full border flex items-center justify-center bg-black/40 ${isRef ? 'border-red-500' : 'border-green-500'}`}>
                                         {isRef ? <Scale size={16} className="text-red-400" /> : <Hand size={16} className="text-green-400" />}
                                       </div>}
                                   <div>
                                       <p className="text-sm font-bold text-white">
                                         {idFirstName || '—'}{(isRef ? idLevel : idStyle) ? ` (${(isRef ? idLevel : idStyle)!.toLocaleUpperCase('tr-TR')})` : ''}
                                       </p>
                                       <p className={`text-[10px] ${isRef ? 'text-red-400' : 'text-green-400'}`}>
                                         Puan: {idRatingText} • Maç: {typeof userProfile?.matchesPlayed === 'number' ? userProfile.matchesPlayed : '—'}
                                       </p>
                                   </div>
                               </div>
                           </div>

                           <div className="space-y-4">
                               <div className="bg-[#0A0E14] p-4 rounded-2xl border border-white/5">
                                   <label className="text-xs text-gray-500 font-bold uppercase block mb-2">Karşı Teklifin (Opsiyonel)</label>
                                   <div className="flex items-center gap-2">
                                       <span className="text-2xl font-black text-[#FACC15]">₺</span>
                                       <input 
                                        type="number" 
                                        value={bidAmount} 
                                        onChange={(e) => setBidAmount(parseInt(e.target.value) || 0)}
                                        className="bg-transparent text-3xl font-black text-white outline-none w-full" 
                                       />
                                   </div>
                               </div>

                               <button 
                                onClick={submitBid}
                                className="w-full py-4 bg-[#FACC15] text-black font-black text-lg rounded-2xl hover:bg-yellow-300 transition-colors shadow-lg shadow-yellow-900/20"
                               >
                                   {selectedOffer ? 'DAVETİ KABUL ET' : 'TEKLİFİ GÖNDER'}
                               </button>
                           </div>
                       </>
                   )}
              </div>
          </div>
      )}

      {/* PRICE SETTING MODAL */}
      {showPriceModal && (
          <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-end sm:items-center justify-center animate-in fade-in duration-200">
              <div className="bg-[#161B22] w-full max-w-md rounded-t-[32px] sm:rounded-[32px] border-t sm:border border-white/10 p-6 shadow-2xl relative animate-in slide-in-from-bottom duration-300">
                  <div className="flex justify-between items-center mb-6">
                      <h3 className="text-xl font-black text-white uppercase tracking-wide">STANDART FİYAT</h3>
                      <button onClick={() => setShowPriceModal(false)} className="p-2 bg-white/5 rounded-full text-gray-400"><X size={20} /></button>
                  </div>

                  <div className="text-center py-8">
                      <p className="text-gray-400 text-xs font-bold uppercase mb-2">Ortalama Saatlik Ücretin</p>
                      <div className="flex items-center justify-center gap-1">
                          <span className="text-4xl font-black text-[#FACC15]">₺</span>
                          <input 
                            type="number" 
                            value={baseFee}
                            onChange={(e) => setBaseFee(parseInt(e.target.value))}
                            className="bg-transparent text-6xl font-black text-white w-40 text-center outline-none border-b-2 border-white/10 focus:border-[#FACC15] transition-colors"
                          />
                      </div>
                      <p className="text-gray-500 text-xs mt-4 max-w-xs mx-auto">
                          Bu fiyat, profilinde ve "Hemen Kirala" seçeneklerinde varsayılan olarak görünecektir.
                      </p>
                  </div>

                  <div className="grid grid-cols-3 gap-3 mb-6">
                      <button onClick={() => handleUpdateFee(200)} className="py-2 rounded-xl bg-white/5 hover:bg-white/10 text-white font-bold text-xs border border-white/5">200₺</button>
                      <button onClick={() => handleUpdateFee(300)} className="py-2 rounded-xl bg-white/5 hover:bg-white/10 text-white font-bold text-xs border border-white/5">300₺</button>
                      <button onClick={() => handleUpdateFee(400)} className="py-2 rounded-xl bg-white/5 hover:bg-white/10 text-white font-bold text-xs border border-white/5">400₺</button>
                  </div>

                  <button 
                    onClick={() => {
                        handleUpdateFee(baseFee);
                        setShowPriceModal(false);
                    }}
                    className={`w-full py-4 text-white font-black text-lg rounded-2xl transition-colors shadow-lg ${isRef ? 'bg-red-600 hover:bg-red-500 shadow-red-900/20' : 'bg-green-600 hover:bg-green-500 shadow-green-900/20'}`}
                  >
                      GÜNCELLE
                  </button>
              </div>
          </div>
      )}

      {/* UPCOMING MATCH DETAIL MODAL */}
      {selectedUpcomingJob && (
          <div className="fixed inset-0 z-50 bg-black/90 backdrop-blur-sm flex items-end sm:items-center justify-center animate-in fade-in duration-200">
              <div className="bg-[#161B22] w-full max-w-md h-[85vh] sm:h-auto rounded-t-[32px] sm:rounded-[32px] border-t sm:border border-white/10 p-0 shadow-2xl relative flex flex-col overflow-hidden animate-in slide-in-from-bottom duration-300">
                  {/* Header */}
                  <div className="p-6 border-b border-white/5 flex justify-between items-center bg-[#0A0E14]">
                      <h3 className="text-lg font-black text-white uppercase tracking-wide">Maç Detayı</h3>
                      <button onClick={() => setSelectedUpcomingJob(null)} className="p-2 bg-white/5 rounded-full text-gray-400 hover:text-white">
                          <X size={20} />
                      </button>
                  </div>
                  
                  <div className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar pb-10">
                      {/* Match Info */}
                      <div className="text-center">
                          <h2 className="text-2xl font-black text-white mb-1">{selectedUpcomingJob.pitchName}</h2>
                          <p className="text-gray-400 text-sm">{selectedUpcomingJob.date} • {selectedUpcomingJob.time}</p>
                          <p className="text-[#FACC15] font-bold mt-2">{selectedUpcomingJob.teamName}</p>
                      </div>

                      {/* Location & Directions */}
                      <div className="bg-[#0A0E14] border border-white/5 rounded-2xl p-4">
                          <div className="flex items-center gap-3 mb-4">
                              <div className="w-10 h-10 bg-blue-500/10 rounded-full flex items-center justify-center text-blue-400">
                                  <MapPin size={20} />
                              </div>
                              <div>
                                  <p className="text-sm font-bold text-white">{selectedUpcomingJob.location}</p>
                                  <p className="text-[10px] text-gray-500">Mesafe: {selectedUpcomingJob.distance}</p>
                              </div>
                          </div>
                          <button onClick={() => alert('Harita uygulamasına yönlendiriliyor...')} className="w-full py-3 bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-black text-xs flex items-center justify-center gap-2 transition-colors">
                              <Navigation size={16} /> YOL TARİFİ AL
                          </button>
                      </div>

                      {/* Amenities */}
                      <div>
                          <h4 className="text-xs font-bold text-gray-500 uppercase mb-3 flex items-center gap-2">
                              <Star size={14} className="text-[#FACC15]" /> Tesis Özellikleri
                          </h4>
                          <div className="flex flex-wrap gap-2">
                              {['Ücretsiz Otopark', 'Sıcak Duş', 'Kafeterya', 'Kamera Kaydı', 'Yeni Zemin'].map(amenity => (
                                  <span key={amenity} className="bg-white/5 border border-white/10 px-3 py-1.5 rounded-lg text-xs text-gray-300">
                                      {amenity}
                                  </span>
                              ))}
                          </div>
                      </div>

                      {/* Formation */}
                      <div>
                          <h4 className="text-xs font-bold text-gray-500 uppercase mb-3 flex items-center gap-2">
                              <Users size={14} className="text-green-400" /> Takım Dizilişi (2-3-1)
                          </h4>
                          <div className="w-full aspect-[4/3] bg-[#1B4332] rounded-2xl border-2 border-white/10 relative overflow-hidden flex flex-col justify-between p-4">
                              {/* Pitch Lines */}
                              <div className="absolute top-1/2 left-0 w-full h-px bg-white/20"></div>
                              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-16 h-16 border-2 border-white/20 rounded-full"></div>
                              <div className="absolute top-0 left-1/2 -translate-x-1/2 w-32 h-12 border-b-2 border-l-2 border-r-2 border-white/20"></div>
                              <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-32 h-12 border-t-2 border-l-2 border-r-2 border-white/20"></div>

                              {/* Players */}
                              {/* FW */}
                              <div className="flex justify-center relative z-10"><div className="w-8 h-8 bg-white rounded-full border-2 border-[#161B22] flex items-center justify-center text-xs font-bold text-black">FV</div></div>
                              {/* MID */}
                              <div className="flex justify-around px-8 relative z-10">
                                  <div className="w-8 h-8 bg-white rounded-full border-2 border-[#161B22] flex items-center justify-center text-xs font-bold text-black">OS</div>
                                  <div className="w-8 h-8 bg-white rounded-full border-2 border-[#161B22] flex items-center justify-center text-xs font-bold text-black">OS</div>
                                  <div className="w-8 h-8 bg-white rounded-full border-2 border-[#161B22] flex items-center justify-center text-xs font-bold text-black">OS</div>
                              </div>
                              {/* DEF */}
                              <div className="flex justify-around px-16 relative z-10">
                                  <div className="w-8 h-8 bg-white rounded-full border-2 border-[#161B22] flex items-center justify-center text-xs font-bold text-black">DF</div>
                                  <div className="w-8 h-8 bg-white rounded-full border-2 border-[#161B22] flex items-center justify-center text-xs font-bold text-black">DF</div>
                              </div>
                              {/* GK */}
                              <div className="flex justify-center relative z-10">
                                  <div className="w-10 h-10 bg-[#FACC15] rounded-full border-2 border-[#161B22] flex items-center justify-center text-xs font-black text-black shadow-[0_0_15px_rgba(250,204,21,0.5)]">SEN</div>
                              </div>
                          </div>
                      </div>
                  </div>
              </div>
          </div>
      )}

      {/* HOURS SETTING MODAL */}
      {showOnlineSetupModal && (
          <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-end sm:items-center justify-center animate-in fade-in duration-200">
              <div className="bg-[#161B22] w-full max-w-md rounded-t-[32px] sm:rounded-[32px] border-t sm:border border-white/10 p-6 shadow-2xl relative animate-in slide-in-from-bottom duration-300 max-h-[90vh] overflow-y-auto custom-scrollbar">
                  <div className="flex justify-between items-center mb-6">
                      <h3 className="text-xl font-black text-white uppercase tracking-wide">AKTİFLİK AYARLARI</h3>
                      <button onClick={() => setShowOnlineSetupModal(false)} className="p-2 bg-white/5 rounded-full text-gray-400 hover:text-white"><X size={20} /></button>
                  </div>
                  
                  <div className="space-y-6 mb-8">
                      <div>
                          <p className="text-[10px] text-gray-400 font-bold uppercase mb-3">Hangi Günler Aktifsin?</p>
                          <div className="flex flex-wrap gap-2">
                              {DAYS.map(day => (
                                  <button 
                                      key={day}
                                      onClick={() => {
                                          if(setupDays.includes(day)) {
                                              setSetupDays(setupDays.filter(d => d !== day));
                                          } else {
                                              setSetupDays([...setupDays, day]);
                                          }
                                      }}
                                      className={`px-4 py-2 rounded-xl text-xs font-bold border transition-colors ${setupDays.includes(day) ? (isRef ? 'bg-red-500/20 text-red-400 border-red-500/50' : 'bg-green-500/20 text-green-400 border-green-500/50') : 'bg-white/5 text-gray-400 border-white/10 hover:bg-white/10'}`}
                                  >
                                      {day}
                                  </button>
                              ))}
                          </div>
                      </div>
                      <div>
                          <div className="flex items-center justify-between mb-3">
                              <p className="text-[10px] text-gray-400 font-bold uppercase">Hangi Saat Aralığı?</p>
                              <button
                                onClick={() => setSetupHours(setupHours.length === 24 ? [] : ALL_HOURS)}
                                className="text-[10px] font-black px-2 py-1 rounded-lg border transition-all bg-white/5 text-gray-400 border-white/10"
                              >
                                {setupHours.length === 24 ? 'Temizle' : 'Tümü'}
                              </button>
                          </div>
                          <div className="grid grid-cols-4 gap-2 max-h-48 overflow-y-auto custom-scrollbar pr-1">
                              {ALL_HOURS.map(t => {
                                  const active = setupHours.includes(t);
                                  return (
                                      <button
                                          key={t}
                                          onClick={() => {
                                              if(setupHours.includes(t)) {
                                                  setSetupHours(setupHours.filter(h => h !== t));
                                              } else {
                                                  setSetupHours([...setupHours, t]);
                                              }
                                          }}
                                          className={`py-2 rounded-lg text-center text-xs font-bold border transition-colors ${active ? (isRef ? 'bg-red-500/20 text-red-400 border-red-500/50' : 'bg-green-500/20 text-green-400 border-green-500/50') : 'bg-white/5 text-gray-400 border-white/10 hover:bg-white/10'}`}
                                      >
                                          {t}
                                      </button>
                                  );
                              })}
                          </div>
                      </div>
                  </div>

                  <button 
                    onClick={handleSaveOnlineSetup}
                    className="w-full py-4 text-black font-black text-sm rounded-2xl transition-colors shadow-lg uppercase tracking-wider flex items-center justify-center gap-2"
                    style={{ background: isRef ? '#ef4444' : '#22c55e' }}
                  >
                      Sistemde Aktif Ol
                  </button>
              </div>
          </div>
      )}

      {/* FAZ 8A — Kayıtlı ödeme yöntemleri (payout_methods) */}
      {showCardOptions && (
          <div className="fixed inset-0 z-[60] bg-black/80 backdrop-blur-sm flex items-end">
              <motion.div
                initial={{ y: 80, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                className="w-full bg-[#161B22] rounded-t-[32px] border-t border-white/10 p-6"
              >
                  <div className="w-10 h-1 bg-white/20 rounded-full mx-auto mb-5" />
                  <div className="flex justify-between items-center mb-5">
                      <div>
                          <h3 className="text-xl font-black text-white">Ödeme Yöntemlerim</h3>
                          <p className="text-[10px] text-gray-500 mt-0.5">Kazancın varsayılan yönteme aktarılır</p>
                      </div>
                      <button onClick={() => setShowCardOptions(false)} className="p-2 bg-white/5 rounded-xl text-gray-400"><X size={18} /></button>
                  </div>
                  <div className="space-y-3 mb-4 max-h-[40vh] overflow-y-auto">
                      {payoutMethods.length === 0 ? (
                          <p className="text-center py-6 text-gray-500 text-xs font-bold uppercase tracking-widest">
                              Henüz kayıtlı yöntem yok
                          </p>
                      ) : payoutMethods.map(m => (
                          <div key={m.id} className={`p-4 bg-[#0A0E14] border rounded-2xl flex items-center gap-3 ${m.isDefault ? 'border-green-500/40' : 'border-white/5'}`}>
                              {m.kind === 'IBAN' ? <Banknote size={20} className="text-green-400" /> : <CreditCard size={20} className="text-blue-400" />}
                              <button
                                  onClick={async () => {
                                      try { await setDefaultPayoutMethod(m.id); await fetchPayoutData(); }
                                      catch (err: any) { showActionError(err?.message || 'İşlem başarısız.'); }
                                  }}
                                  className="flex-1 text-left"
                              >
                                  <p className="font-mono text-sm text-white">
                                      {m.kind === 'IBAN' ? `${m.iban?.slice(0, 4)} •••• ${m.iban?.slice(-4)}` : `${m.cardBrand ?? 'KART'} **** ${m.cardLast4}`}
                                  </p>
                                  <p className="text-[10px] text-gray-500">{m.holderName}{m.isDefault ? ' · Varsayılan' : ' · Varsayılan yap'}</p>
                              </button>
                              <button
                                  onClick={async () => {
                                      try { await deletePayoutMethod(m.id); await fetchPayoutData(); }
                                      catch (err: any) { showActionError(err?.message || 'Yöntem silinemedi.'); }
                                  }}
                                  className="p-2 bg-white/5 rounded-xl text-gray-500 hover:text-red-400 transition-colors"
                              >
                                  <X size={14} />
                              </button>
                          </div>
                      ))}
                  </div>
                  <button
                      onClick={() => { setShowCardOptions(false); setShowAddCard(true); }}
                      className="w-full py-4 rounded-2xl border border-green-500/30 bg-green-500/10 text-green-400 font-black text-sm flex items-center justify-center gap-2 hover:bg-green-500/15 transition-all"
                  >
                      <PlusCircle size={20} />
                      YENİ YÖNTEM EKLE (IBAN / KART)
                  </button>
              </motion.div>
          </div>
      )}

      {/* FAZ 8A — Yeni ödeme yöntemi ekle (IBAN veya kart; kart no yalnız son 4 hane saklanır) */}
      {showAddCard && (
          <div className="fixed inset-0 z-[60] bg-black/80 backdrop-blur-sm flex items-end">
              <motion.div
                initial={{ y: 80, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                className="w-full bg-[#161B22] rounded-t-[32px] border-t border-white/10 p-6 space-y-4"
              >
                  <div className="w-10 h-1 bg-white/20 rounded-full mx-auto" />
                  <div className="flex justify-between items-center">
                      <h3 className="text-xl font-black text-white">Yeni Ödeme Yöntemi</h3>
                      <button onClick={() => setShowAddCard(false)} className="p-2 bg-white/5 rounded-xl text-gray-400"><X size={18} /></button>
                  </div>
                  <div className="bg-[#0A0E14] p-1.5 rounded-2xl flex border border-white/5">
                      <button
                          onClick={() => setNewMethodKind('IBAN')}
                          className={`flex-1 py-3 text-[11px] font-black rounded-xl transition-all ${newMethodKind === 'IBAN' ? 'bg-green-500 text-black' : 'text-gray-500'}`}
                      >
                          IBAN
                      </button>
                      <button
                          onClick={() => setNewMethodKind('CARD')}
                          className={`flex-1 py-3 text-[11px] font-black rounded-xl transition-all ${newMethodKind === 'CARD' ? 'bg-blue-500 text-white' : 'text-gray-500'}`}
                      >
                          BANKA KARTI
                      </button>
                  </div>
                  {newMethodKind === 'IBAN' ? (
                      <div>
                          <p className="text-[10px] font-black uppercase tracking-widest text-green-400 mb-1.5">IBAN</p>
                          <input
                              value={newIban}
                              onChange={e => setNewIban(e.target.value)}
                              placeholder="TR00 0000 0000 0000 0000 0000 00"
                              className="w-full bg-white/5 border border-white/10 rounded-2xl px-4 py-3 text-white font-mono text-sm outline-none focus:border-green-500/50 transition-colors"
                          />
                      </div>
                  ) : (
                      <div>
                          <p className="text-[10px] font-black uppercase tracking-widest text-blue-400 mb-1.5">Kart Numarası</p>
                          <input
                              value={newCardNo}
                              onChange={e => setNewCardNo(e.target.value)}
                              placeholder="0000 0000 0000 0000"
                              inputMode="numeric"
                              className="w-full bg-white/5 border border-white/10 rounded-2xl px-4 py-3 text-white font-mono text-sm outline-none focus:border-blue-500/50 transition-colors"
                          />
                          <p className="text-[9px] text-gray-500 mt-1">Güvenlik: yalnız son 4 hane saklanır.</p>
                      </div>
                  )}
                  <div>
                      <p className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-1.5">Hesap / Kart Sahibi</p>
                      <input
                          value={newCardHolder}
                          onChange={e => setNewCardHolder(e.target.value)}
                          placeholder="AD SOYAD"
                          className="w-full bg-white/5 border border-white/10 rounded-2xl px-4 py-3 text-white font-bold text-sm outline-none focus:border-white/30 transition-colors"
                      />
                  </div>
                  <button
                      disabled={addingMethod || !newCardHolder || (newMethodKind === 'IBAN' ? !newIban : !newCardNo)}
                      onClick={async () => {
                          setAddingMethod(true);
                          try {
                              await addPayoutMethod({
                                  kind: newMethodKind,
                                  holderName: newCardHolder,
                                  iban: newMethodKind === 'IBAN' ? newIban : undefined,
                                  cardNumber: newMethodKind === 'CARD' ? newCardNo : undefined,
                              });
                              setNewCardNo(''); setNewIban(''); setNewCardHolder('');
                              setShowAddCard(false);
                              await fetchPayoutData();
                              showActionSuccess('Ödeme yöntemi kaydedildi.');
                          } catch (err: any) {
                              showActionError(err?.message || 'Ödeme yöntemi eklenemedi.');
                          } finally {
                              setAddingMethod(false);
                          }
                      }}
                      className="w-full py-4 rounded-2xl font-black text-white text-sm disabled:opacity-40 bg-blue-600 hover:bg-blue-500 transition-colors"
                  >
                      {addingMethod ? 'KAYDEDİLİYOR...' : 'YÖNTEMİ KAYDET'}
                  </button>
              </motion.div>
          </div>
      )}

      {/* Post Match Report Modal (Two-way Rating) */}
      <AnimatePresence>
        {showPostMatchReport && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/80 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-[#161B22] border border-white/10 rounded-3xl p-6 w-full max-w-sm relative z-10 overflow-hidden"
            >
              <div className={`absolute top-0 left-0 w-full h-1 ${theme.bg}`} />
              
              <div className="text-center mb-6">
                <div className={`w-16 h-16 rounded-full mx-auto flex items-center justify-center mb-3 ${theme.secondaryBg} ${theme.primary}`}>
                  <Award size={32} />
                </div>
                <h3 className="text-xl font-black text-white uppercase italic">MAÇ SONU RAPORU</h3>
                <p className="text-[10px] text-gray-400 uppercase tracking-widest mt-1">
                  {isRef ? 'Resmi Maç Skorunu Gir' : 'Takımı ve Ortamı Değerlendir'}
                </p>
              </div>

              <div className="space-y-4 mb-6">
                {isRef && (
                  /* HR-A: kontrollü skor alanları — girilen değer gerçekten finalize_match'e yazılır. */
                  <div className="bg-[#0A0E14] p-4 rounded-2xl border border-white/5">
                    <label className="text-xs text-gray-400 font-bold uppercase block mb-3 text-center">Maç Skoru</label>
                    <div className="flex items-center justify-center gap-4">
                      <input
                        type="number" inputMode="numeric" min={0} max={99} placeholder="0"
                        value={refScore.home}
                        onChange={(e) => {
                          const v = e.target.value.replace(/[^0-9]/g, '').slice(0, 2);
                          setRefScore(p => ({ ...p, home: v }));
                        }}
                        aria-label="Ev sahibi skoru"
                        className="w-16 h-16 bg-[#161B22] border border-white/10 rounded-xl text-center text-3xl font-black text-white outline-none focus:border-red-500/50 transition-colors"
                      />
                      <span className="text-xl font-black text-gray-600">-</span>
                      <input
                        type="number" inputMode="numeric" min={0} max={99} placeholder="0"
                        value={refScore.away}
                        onChange={(e) => {
                          const v = e.target.value.replace(/[^0-9]/g, '').slice(0, 2);
                          setRefScore(p => ({ ...p, away: v }));
                        }}
                        aria-label="Deplasman skoru"
                        className="w-16 h-16 bg-[#161B22] border border-white/10 rounded-xl text-center text-3xl font-black text-white outline-none focus:border-red-500/50 transition-colors"
                      />
                    </div>
                    <p className="text-[9px] text-gray-500 font-bold uppercase text-center mt-3">Resmi hakem skoru — maç bu skorla tamamlanır</p>
                  </div>
                )}
                {!isRef && (
                  <div className="bg-[#0A0E14] p-4 rounded-2xl border border-white/5">
                    <label className="text-xs text-gray-400 font-bold uppercase block mb-3 text-center">Centilmenlik ve Misafirperverlik</label>
                    <div className="flex justify-between items-center px-2">
                      {[1, 2, 3, 4, 5].map((star) => (
                        <button
                          key={star}
                          onClick={() => setPostMatchRating(star)}
                          className="transition-transform hover:scale-110 active:scale-95"
                        >
                          <Star size={32} className={star <= postMatchRating ? 'text-[#FACC15] fill-[#FACC15]' : 'text-gray-700'} />
                        </button>
                      ))}
                    </div>
                    <p className="text-center text-[10px] text-[#FACC15] font-black mt-3 uppercase tracking-widest">
                      {postMatchRating === 5 ? "Mükemmel Takım" : postMatchRating >= 3 ? "İyi Takım" : "Toksik Takım"}
                    </p>
                  </div>
                )}
              </div>

              <button
                disabled={submittingScore}
                onClick={async () => {
                  const matchId = myUpcomingMatches[0]?.id;
                  if (isRef) {
                      // HR-A: hakem skoru GERÇEKTEN yazılır (finalize_match). Başarısızsa
                      // modal açık kalır ve dürüst hata gösterilir — sahte başarı YOK.
                      if (!matchId) { showActionError('Atanmış bir maç bulunamadı.'); return; }
                      const home = refScore.home === '' ? 0 : parseInt(refScore.home, 10);
                      const away = refScore.away === '' ? 0 : parseInt(refScore.away, 10);
                      if (!Number.isFinite(home) || !Number.isFinite(away)) {
                        showActionError('Geçerli bir skor gir.'); return;
                      }
                      setSubmittingScore(true);
                      try {
                        await submitRefereeMatchScore(matchId, home, away);
                        // Store'u sunucudaki taze maçla eşitle (COMPLETED + skor).
                        try {
                          const fresh = await getMatchDetails(matchId);
                          if (fresh) applyMatchLocal(fresh);
                        } catch { /* görsel tazeleme başarısızsa akış bozulmaz */ }
                        setMatchLiveStatus(prev => ({ ...prev, [matchId]: 'FINISHED' }));
                        setShowPostMatchReport(false);
                        setRefScore({ home: '', away: '' });
                        showActionSuccess(`Maç skoru resmi olarak kaydedildi: ${home}–${away}.`);
                      } catch (e: any) {
                        showActionError(e?.message || 'Skor kaydedilemedi. Tekrar dene.');
                      } finally {
                        setSubmittingScore(false);
                      }
                  } else {
                      // Kaleci: bu ekran ödeme değil operasyon; ödeme escrow onayıyla otomatik akar.
                      if (matchId) setMatchLiveStatus(prev => ({ ...prev, [matchId]: 'FINISHED' }));
                      setShowPostMatchReport(false);
                      showActionSuccess('Maç tamamlandı olarak işaretlendi. Kazancın, maç onayı sonrası cüzdanına otomatik aktarılır.');
                  }
                }}
                className={`w-full py-3.5 rounded-xl font-black text-white text-sm ${theme.bg} hover:brightness-110 transition-all uppercase shadow-lg disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2`}
              >
                {submittingScore && <RefreshCcw size={14} className="animate-spin" />}
                {submittingScore ? 'KAYDEDİLİYOR...' : (isRef ? 'SKORU KAYDET VE BİTİR' : 'RAPORU GÖNDER VE BİTİR')}
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* FAZ 5 — TC KİMLİK DOĞRULAMA MODAL */}
      {showIdentityModal && (
          <div className="fixed inset-0 z-[60] bg-black/80 backdrop-blur-sm flex items-end sm:items-center justify-center animate-in fade-in duration-200">
              <div className="bg-[#161B22] w-full max-w-md rounded-t-[32px] sm:rounded-[32px] border-t sm:border border-white/10 p-6 shadow-2xl relative animate-in slide-in-from-bottom duration-300">
                  <div className="flex justify-between items-center mb-2">
                      <h3 className="text-xl font-black text-white uppercase tracking-wide">KİMLİK DOĞRULA</h3>
                      <button onClick={() => setShowIdentityModal(false)} className="p-2 bg-white/5 rounded-full text-gray-400 hover:text-white"><X size={20} /></button>
                  </div>
                  <p className="text-[11px] text-gray-400 font-bold mb-6">Ödemelerini alabilmek için TC kimlik doğrulaması gerekli.</p>

                  <div className="space-y-4">
                      <div>
                          <p className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-1.5">TC Kimlik No</p>
                          <input
                              value={identityTc}
                              onChange={e => setIdentityTc(e.target.value.replace(/\D/g, '').slice(0, 11))}
                              inputMode="numeric"
                              placeholder="11 haneli TC kimlik no"
                              className="w-full bg-white/5 border border-white/10 rounded-2xl px-4 py-3 text-white font-mono text-sm outline-none focus:border-yellow-500/50 transition-colors"
                          />
                      </div>
                      <div>
                          <p className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-1.5">Ad Soyad</p>
                          <input
                              value={identityName}
                              onChange={e => setIdentityName(e.target.value)}
                              placeholder="AD SOYAD"
                              className="w-full bg-white/5 border border-white/10 rounded-2xl px-4 py-3 text-white font-bold text-sm outline-none focus:border-yellow-500/50 transition-colors"
                          />
                      </div>
                      <div>
                          <p className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-1.5">Doğum Yılı (opsiyonel)</p>
                          <input
                              value={identityBirthYear}
                              onChange={e => setIdentityBirthYear(e.target.value.replace(/\D/g, '').slice(0, 4))}
                              inputMode="numeric"
                              placeholder="örn. 1995"
                              className="w-full bg-white/5 border border-white/10 rounded-2xl px-4 py-3 text-white font-mono text-sm outline-none focus:border-yellow-500/50 transition-colors"
                          />
                      </div>

                      {identityFormError && (
                          <p className="text-[11px] text-red-400 font-bold">{identityFormError}</p>
                      )}

                      <button
                          onClick={handleSubmitIdentity}
                          disabled={identitySubmitting}
                          className="w-full py-4 bg-yellow-500 hover:bg-yellow-400 text-black font-black text-sm rounded-2xl transition-colors shadow-lg disabled:opacity-50 flex items-center justify-center gap-2 uppercase tracking-wider"
                      >
                          {identitySubmitting ? <RefreshCcw size={16} className="animate-spin" /> : <BadgeCheck size={16} />}
                          {identitySubmitting ? 'Gönderiliyor...' : 'Doğrulamayı Gönder'}
                      </button>
                  </div>
              </div>
          </div>
      )}

      {/* Custom Styles for 3D Flip */}
      <style>{`
        .perspective-1000 { perspective: 1000px; }
        .transform-style-3d { transform-style: preserve-3d; }
        .backface-hidden { backface-visibility: hidden; }
        .rotate-y-180 { transform: rotateY(180deg); }
      `}</style>
      </>)}

      {/* ── Misafir Kapısı: finansal aksiyon kilidi + giriş CTA ── */}
      <AnimatePresence>
        {showGuestGate && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[110] flex items-center justify-center bg-black/80 backdrop-blur-sm p-6"
            onClick={() => setShowGuestGate(false)}
          >
            <motion.div
              initial={{ scale: 0.92, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.92, opacity: 0 }}
              className="w-full max-w-sm bg-[#0A0E14] border border-[#FACC15]/30 rounded-3xl p-6 shadow-2xl relative overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="absolute -top-10 -right-10 w-32 h-32 bg-[#FACC15]/10 blur-[40px] rounded-full pointer-events-none" />
              <div className="relative z-10 flex flex-col gap-3">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-[#FACC15] animate-pulse" />
                  <p className="text-[11px] font-black uppercase tracking-widest text-[#FACC15]">Misafir Modundasın</p>
                </div>
                <p className="text-[11px] text-gray-400 leading-relaxed">
                  Para çekme, ödeme yöntemi ekleme, kimlik doğrulama ve maç başvuruları için
                  hesabınla giriş yapmalısın. Demo veriler yalnızca görüntüleme amaçlıdır.
                </p>
                <div className="flex gap-2.5 mt-1">
                  <button
                    onClick={() => onNavigate('AUTH')}
                    className="flex-1 h-11 rounded-2xl bg-[#FACC15] text-black font-black text-[11px] uppercase tracking-widest active:scale-95 transition-all shadow-[0_0_15px_rgba(250,204,21,0.3)] hover:bg-yellow-300"
                  >
                    Giriş Yap
                  </button>
                  <button
                    onClick={() => setShowGuestGate(false)}
                    className="flex-1 h-11 rounded-2xl bg-white/5 border border-white/15 text-white font-black text-[11px] uppercase tracking-widest active:scale-95 transition-all hover:bg-white/10"
                  >
                    Vazgeç
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── FAZ 4: Kaleci Hizmet Sözleşmesi Onayı ───────────────────────────── */}
      <AnimatePresence>
        {contractModalReq && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-[70] bg-black/85 backdrop-blur-xl flex items-center justify-center p-6"
            onClick={() => { if (!respondingId) setContractModalReq(null); }}>
            <motion.div
              initial={{ scale: 0.88, y: 20, opacity: 0 }} animate={{ scale: 1, y: 0, opacity: 1 }} exit={{ scale: 0.88, y: 20, opacity: 0 }}
              transition={{ type: 'spring', damping: 24, stiffness: 300 }}
              onClick={e => e.stopPropagation()}
              className="w-full max-w-sm rounded-[28px] bg-gradient-to-b from-[#161B22] to-[#0d1117] border border-green-500/25 shadow-[0_30px_70px_rgba(0,0,0,0.85)] p-6">
              <div className="flex items-center gap-2.5 mb-3">
                <div className="p-2 rounded-xl bg-green-500/12 border border-green-500/25 text-green-400"><Shield size={18} /></div>
                <h3 className="text-base font-black text-white tracking-tight">Kaleci Hizmet Sözleşmesi</h3>
              </div>
              <div className="rounded-2xl bg-black/30 border border-white/8 p-3.5 text-[11px] text-white/60 leading-relaxed max-h-52 overflow-y-auto custom-scrollbar space-y-2">
                <p>Kabul ettiğin maça ilan edilen saatte katılmayı taahhüt edersin.</p>
                <p><span className="text-red-400 font-black">No-show (mazeretsiz katılmama)</span> durumunda, maçın kaleci slot ücreti hesabından otomatik tahsil edilip maç kaptanına tazminat olarak aktarılır.</p>
                <p>Bu tahsilata karşı <span className="text-white font-bold">48 saat</span> içinde itiraz edebilirsin; itiraz halinde durum OYNA yönetimi tarafından incelenir.</p>
                <p>Hizmet verebilmek için hesabında en az <span className="text-green-400 font-black">500₺ teminat</span> bulundurmalısın — bu bakiye ceza tahsilatının güvencesidir.</p>
                <p className="text-white/80 font-bold pt-1">Eline geçecek: {contractModalReq.providerAmount}₺ (brüt {contractModalReq.fee}₺)</p>
              </div>
              <label className="flex items-start gap-2.5 mt-4 cursor-pointer select-none">
                <button onClick={() => setContractChecked(v => !v)}
                  className={`mt-0.5 w-5 h-5 rounded-md border-2 flex items-center justify-center shrink-0 transition-colors ${contractChecked ? 'bg-green-500 border-green-500' : 'border-white/25 bg-white/5'}`}>
                  {contractChecked && <Check size={13} className="text-black" strokeWidth={3} />}
                </button>
                <span className="text-[11px] text-white/70 leading-relaxed">Sözleşmeyi okudum, no-show cezasını ve 500₺ teminat şartını kabul ediyorum.</span>
              </label>
              <div className="flex gap-2 mt-5">
                <button disabled={!!respondingId} onClick={() => setContractModalReq(null)}
                  className="flex-1 py-3 rounded-2xl font-black text-[11px] uppercase tracking-widest text-white/70 bg-white/5 border border-white/10 disabled:opacity-50">Vazgeç</button>
                <button disabled={!contractChecked || !!respondingId}
                  onClick={() => handleRespondRequest(contractModalReq.id, true, true)}
                  className="flex-1 py-3 rounded-2xl font-black text-[11px] uppercase tracking-widest text-black bg-green-500 active:scale-95 transition-all flex items-center justify-center gap-1.5 disabled:opacity-40">
                  {respondingId ? <RefreshCcw size={14} className="animate-spin" /> : <><Check size={14} /> Onayla & Kabul Et</>}
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

export default ServiceDashboard;
