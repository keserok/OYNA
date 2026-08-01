// ─── MAÇ KUR (2a) ────────────────────────────────────────────────────────────
// "Tesis → Saha → Saat → Kaç kişi" tek ekranı. Tasarım: Maç Oluştur - 2a (Final).
// Her alanın arkasında gerçek tablo var; fiyat/kapora rakamları SUNUCUDAN gelir
// (get_court_day_quote), yayın TEK RPC ile atomiktir (create_match_atomic:
// maç + saha rezervasyonu + kapora blokajı — çakışmada SLOT_TAKEN, bakiye
// yetmezse INSUFFICIENT_BALANCE; form asla kaybolmaz, öksüz maç kalmaz).
import React, { useCallback, useEffect, useMemo, useRef, useState, Suspense, lazy } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ChevronLeft, ChevronRight, Search, Check, MapPin, Bell, Plus, X,
  ArrowRight, Copy, Share2, Lock, Sparkles, ShieldCheck, Users, Shield, Scale,
  Info, ChevronDown, Undo2, Star, Zap,
} from 'lucide-react';
import { AppView } from '../types';
import { useAppStore } from '../store';
import { PLAY_STYLE_META } from './onboarding/onboardingShared';
import { showToast } from '../components/common/GlobalToast';
import { Spinner } from '../components/ui/Spinner';
import {
  fetchCreateFacilities, getCourtDayQuote, createMatchAtomic, inviteFriendsToMatch,
  parseCreateMatchError, recordDemandSignal, listBookableProviders,
  type CreateFacility, type CreateCourt, type DayQuote, type AtomicCreateResult,
  type BookableProvider,
} from '../services/matchCreateService';
import { fetchPitchAvailability, buildBusyMap, isSlotBusy, toISODate, type BusyMap } from '../services/playerBookingService';
import { getWalletSummary, type WalletSummary } from '../services/walletService';
import { getFriends, type FriendRow } from '../services/socialService';
import { getMyTeams, getTeamSquad, type MyTeamRow } from '../services/teamSocialService';
import { getMatchDetails } from '../services/matchService';
import { fetchMyFavoritePitchIds } from '../services/pitchFavoritesService';
import { safeUuid } from '../shared/submitGuard';
import { trUpper } from '../utils/trUpper';
import { auth } from '../supabaseAuth';
import { formatTRYAmount } from '../utils/formatTRY';

// Cüzdan yükleme overlay'i — form kaybolmadan bakiye tamamlanır (gerçek akış).
const WalletScreen = lazy(() => import('./WalletScreen'));

interface MatchCreateProps {
  onBack: () => void;
  onNavigate: (view: AppView) => void;
}

// ─── Sabitler ────────────────────────────────────────────────────────────────
const WD = ['Paz', 'Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt'];
const MO = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara'];
const MO_LONG = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];
// Renk TEK KAYNAK: PLAY_STYLE_META (alt başlıklar bu ekrana özgü kalır).
const MENTALS = [
  { id: 'Ciddi', sub: 'Rekabetçi', color: PLAY_STYLE_META.ciddi.color },
  { id: 'Taktiksel', sub: 'Sistem', color: PLAY_STYLE_META.taktiksel.color },
  { id: 'Rahat', sub: 'Eğlence', color: PLAY_STYLE_META.rahat.color },
] as const;
const GENDERS = ['Karma', 'Erkek', 'Kadın'];
const AGES = ['18-22', '23-27', '28-35', '35+', 'Tümü'];
const DAY_MAX = 30;
const DAY_PREFETCH = 7;
const MAX_FACILITIES = 6;

const trLower = (s: string) => s.toLocaleLowerCase('tr-TR');

// IP-19: buradaki yerel biçimleyici tutarı YUVARLIYORDU. 299,60₺ bakiye "300₺"
// yazılıyor, eksik hesabı ise gerçek değerden yapıldığı için ekranda aynı anda
// "bakiyen 300₺" ve "1₺ eksik" görünüyordu. Artık gösterilen sayı ile hesaba
// giren sayı aynı: ikisi de ham `spendable`.
const money = formatTRYAmount;

type SheetKind = 'ADV' | 'FRIENDS' | 'PROVIDERS' | 'RULES' | 'TOPUP' | 'SUCCESS' | null;

/** Kadroya çağrılan kişi — arkadaş listesinden ya da takım kadrosundan gelir. */
interface InvitedPerson {
  id: string;
  name: string;
  meta: string;
  source: 'FRIEND' | 'TEAM';
}

const MatchCreate: React.FC<MatchCreateProps> = ({ onBack, onNavigate }) => {
  const {
    setMatchCreateSeed, setSelectedMatch, applyMatchLocal,
    setLobbyMode, currentUserProfile, adminMatches,
  } = useAppStore();
  const uid = currentUserProfile?.id;

  // Seed TEK SEFERLİK tüketilir: mount'ta yerele kopyalanır ve store hemen
  // temizlenir — vazgeçip çıkınca sonraki "Maç Oluştur" girişi temiz açılır.
  const [seed, setSeed] = useState(() => useAppStore.getState().matchCreateSeed);
  useEffect(() => {
    if (useAppStore.getState().matchCreateSeed) setMatchCreateSeed(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Veri durumu ───────────────────────────────────────────────────────────
  const [loading, setLoading] = useState(true);
  const [facilities, setFacilities] = useState<CreateFacility[]>([]);
  const [wallet, setWallet] = useState<WalletSummary | null>(null);
  const [busyMaps, setBusyMaps] = useState<Record<string, BusyMap>>({});
  const [quotes, setQuotes] = useState<Record<string, DayQuote>>({});
  const [localBusy, setLocalBusy] = useState<Set<string>>(new Set()); // SLOT_TAKEN sonrası anlık işaret

  // ── Seçimler ──────────────────────────────────────────────────────────────
  const [q, setQ] = useState('');
  const [selFacId, setSelFacId] = useState<string | null>(null);
  const [selCourtId, setSelCourtId] = useState<string | null>(null);
  const [daysLoaded, setDaysLoaded] = useState(DAY_PREFETCH);
  const [selDay, setSelDay] = useState(0);
  const [selTime, setSelTime] = useState<string | null>(null);
  const [format, setFormat] = useState('7v7');
  const [visibility, setVisibility] = useState<'OPEN' | 'PRIVATE'>('OPEN');
  const [mental, setMental] = useState<string>('Rahat');
  const [gender, setGender] = useState('Karma');
  const [age, setAge] = useState('Tümü');
  const [title, setTitle] = useState('');
  const [teamInvite, setTeamInvite] = useState(false); // rakip tarafı ben davet edeceğim → kodla kapalı
  const [invited, setInvited] = useState<InvitedPerson[]>([]);
  const [friends, setFriends] = useState<FriendRow[] | null>(null);
  const [teams, setTeams] = useState<MyTeamRow[] | null>(null);
  const [squadTab, setSquadTab] = useState<'FRIENDS' | 'TEAMS'>('FRIENDS');
  const [openTeamId, setOpenTeamId] = useState<string | null>(null);
  const [teamSquads, setTeamSquads] = useState<Record<string, InvitedPerson[]>>({});
  const [squadLoading, setSquadLoading] = useState(false);
  const [friendQ, setFriendQ] = useState('');

  // Kaleci / hakem: GERÇEK sağlayıcı seçimi (onaylı + müsait olanlar).
  // providerIds boş + all=true → sunucu otomatik en uygun sağlayıcıyı seçer.
  const [offers, setOffers] = useState<{ type: 'GK' | 'REF'; providerIds: string[]; all: boolean }[]>([]);
  const [providers, setProviders] = useState<Record<'GK' | 'REF', BookableProvider[] | null>>({ GK: null, REF: null });
  const [providerTab, setProviderTab] = useState<'GK' | 'REF'>('GK');
  const [priceOpen, setPriceOpen] = useState(false);
  const [sheet, setSheet] = useState<SheetKind>(null);

  // ── Yayın durumu ──────────────────────────────────────────────────────────
  const [publishing, setPublishing] = useState(false);
  const [pubStep, setPubStep] = useState(0);
  const [slide, setSlide] = useState(0);
  const dragRef = useRef<{ left: number; max: number } | null>(null);
  const trackRef = useRef<HTMLDivElement | null>(null);
  const publishRef = useRef<() => void>(() => {});
  const publishBusyRef = useRef(false);
  // İdempotency anahtarı: AYNI yayın denemesi boyunca sabit kalır. Sunucudan
  // yanıt gelmeden kesilen (timeout/kopma) bir istekten sonra tekrar deneme
  // AYNI anahtarla gider → çift maç/rezervasyon/kapora imkânsız. Yalnız YAYIN
  // BAŞARIYLA tamamlanınca sıfırlanır; hata dalında sıfırlanmaz (sunucuda
  // işlem gerçekten düştüyse claim satırı da geri alınmıştır, anahtar temizdir).
  const publishIdemRef = useRef<string | null>(null);
  const slideValRef = useRef(0);
  const [result, setResult] = useState<AtomicCreateResult | null>(null);
  const [conflict, setConflict] = useState<{ time: string; next: string | null } | null>(null);
  const [missingTL, setMissingTL] = useState(0);
  const [copied, setCopied] = useState(false);
  const [notified, setNotified] = useState(false);
  const [suggestOpen, setSuggestOpen] = useState(false);
  const [suggestName, setSuggestName] = useState('');
  const [suggestContact, setSuggestContact] = useState('');
  const searchRef = useRef<HTMLInputElement | null>(null);

  const seeded = !!seed?.bookingId;

  // ── Türetilenler ──────────────────────────────────────────────────────────
  // Maçlar İstanbul saatiyle yaşar (sunucu PAST_TIME'ı Europe/Istanbul ile
  // ölçer) → gün/saat filtreleri cihaz saatine değil İstanbul'a bağlanır.
  // Dakikalık tik: ekran açık kalırsa saat/gece yarısı sınırı donup kalmasın.
  const [clockTick, setClockTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setClockTick(t => t + 1), 60_000);
    return () => clearInterval(id);
  }, []);
  const istNow = useMemo(() => {
    try { return new Date(new Date().toLocaleString('en-US', { timeZone: 'Europe/Istanbul' })); }
    catch { return new Date(); }
  }, [clockTick]);
  const today = useMemo(() => { const d = new Date(istNow); d.setHours(0, 0, 0, 0); return d; }, [istNow]);
  const dateAt = useCallback((i: number) => { const d = new Date(today); d.setDate(d.getDate() + i); return d; }, [today]);
  const dayDate = dateAt(selDay);
  const dateISO = toISODate(dayDate);

  const filtered = useMemo(() => {
    const term = trLower(q.trim());
    if (!term) return facilities;
    return facilities.filter(f =>
      trLower(f.name).includes(term)
      || trLower(f.district ?? '').includes(term)
      || f.courts.some(c => trLower(c.name).includes(term)));
  }, [facilities, q]);
  const shown = filtered.slice(0, MAX_FACILITIES);

  const fac: CreateFacility | null = useMemo(
    () => facilities.find(f => f.id === selFacId) ?? null, [facilities, selFacId]);
  const court: CreateCourt | null = useMemo(
    () => fac?.courts.find(c => c.id === selCourtId) ?? null, [fac, selCourtId]);
  const per = parseInt(format.split('v')[0], 10) || 7;

  const quoteKey = selCourtId ? `${selCourtId}|${dateISO}` : null;
  const dayQuote = quoteKey ? quotes[quoteKey] : undefined;

  const nowHour = istNow.getHours();
  // Dilimin GERÇEK bitişi geçilir: 90 dakikalık bir dilimi kapatan rezervasyon
  // saat başı işaretlemeyle görünmüyordu (bkz. playerBookingService.isSlotBusy).
  const hourBlocked = useCallback((time: string, endTime?: string) => {
    if (!selCourtId || !fac) return true;
    if (localBusy.has(`${selCourtId}|${dateISO}|${time}`)) return true;
    const map = busyMaps[fac.id];
    return !!map && isSlotBusy(map, selCourtId, dateISO, time, endTime) !== null;
  }, [selCourtId, fac, busyMaps, dateISO, localBusy]);

  const visibleHours = useMemo(() => {
    if (!dayQuote) return [];
    return dayQuote.hours.filter(h => {
      if (selDay === 0 && !h.night) {
        // Bugünün geçmiş gündüz saatleri listelenmez; gece saatleri (şeridin
        // sonundaki 00/01) fiziksel olarak yarın sabahtır — hep görünür.
        return parseInt(h.time, 10) > nowHour;
      }
      return true;
    });
  }, [dayQuote, selDay, nowHour]);

  const selHour = visibleHours.find(h => h.time === selTime) ?? null;
  const total = seeded ? (seed?.price ?? 0) : (selHour?.total ?? null);
  const deposit = seeded ? 0 : (selHour?.deposit ?? null);
  const perPerson = total != null ? Math.ceil((total / (per * 2)) * 1.05) : null;
  const spendable = wallet?.spendableBalance ?? 0;
  const missing = deposit != null ? Math.max(0, Math.ceil(deposit - spendable)) : 0;
  const threshold = per * 2 - 2;

  const canPublish = !loading && !publishing && !!format
    && (seeded || (!!selCourtId && !!selTime && !!selHour?.tariffOk && !hourBlocked(selTime ?? '', selHour?.endTime)));

  // ── Yükleme: tesisler + cüzdan + sıralama ─────────────────────────────────
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const [facs, favIds, summary] = await Promise.all([
          fetchCreateFacilities(),
          fetchMyFavoritePitchIds().catch(() => new Set<string>()),
          getWalletSummary().catch(() => null),
        ]);
        if (!alive) return;
        // Sıra: favoriler → daha önce maç kurduğun tesisler → puan
        const history = new Set(
          (adminMatches ?? [])
            .filter(m => m.creatorId === uid)
            .map(m => String((m as unknown as { pitchId?: string; pitch_id?: string }).pitchId
              ?? (m as unknown as { pitch_id?: string }).pitch_id ?? ''))
            .filter(Boolean));
        const rank = (f: CreateFacility) => (favIds.has(f.id) ? 0 : history.has(f.id) ? 1 : 2);
        facs.sort((a, b) => rank(a) - rank(b) || b.rating - a.rating || a.name.localeCompare(b.name, 'tr'));
        setFacilities(facs);
        if (summary) setWallet(summary);

        // Rezervasyondan çevirme: saha + saat kilitli gel
        if (seed?.bookingId) {
          if (seed.pitchId) setSelFacId(seed.pitchId);
          if (seed.courtId) setSelCourtId(seed.courtId);
          if (seed.date) {
            const d = new Date(`${seed.date}T12:00:00`);
            d.setHours(0, 0, 0, 0);
            const idx = Math.round((d.getTime() - today.getTime()) / 86400000);
            if (idx >= 0 && idx < DAY_MAX) { setSelDay(idx); if (idx >= DAY_PREFETCH) setDaysLoaded(DAY_MAX); }
          }
          if (seed.time) setSelTime(seed.time);
          const seedFac = facs.find(f => f.id === seed.pitchId);
          const seedCourt = seedFac?.courts.find(c => c.id === seed.courtId);
          if (seedCourt) setFormat(`${seedCourt.minCapacity}v${seedCourt.minCapacity}`);
        } else if (facs.length > 0) {
          const first = facs[0];
          setSelFacId(first.id);
          const c0 = first.courts[0];
          setSelCourtId(c0.id);
          setFormat(`${c0.minCapacity}v${c0.minCapacity}`);
        }
      } catch (e) {
        console.error('Maç Kur verisi yüklenemedi:', e);
        showToast('Sahalar yüklenemedi. Bağlantını kontrol et.', 'error');
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Profilden ön-doldurma: sertlik + cinsiyet (varsa)
  useEffect(() => {
    const p = currentUserProfile as { playStyle?: string; gender?: string } | null;
    if (p?.playStyle) {
      const map: Record<string, string> = { ciddi: 'Ciddi', taktiksel: 'Taktiksel', rahat: 'Rahat' };
      if (map[p.playStyle]) setMental(map[p.playStyle]);
    }
    if (p?.gender && GENDERS.includes(p.gender)) setGender(p.gender);
  }, [currentUserProfile]);

  // ── Müsaitlik: seçili tesisin yüklü gün penceresi TEK çağrıda ─────────────
  useEffect(() => {
    if (!fac) return;
    let alive = true;
    const from = new Date(today);
    const to = dateAt(Math.min(daysLoaded, DAY_MAX) - 1);
    fetchPitchAvailability(fac.id, from, to)
      .then(rows => { if (alive) setBusyMaps(prev => ({ ...prev, [fac.id]: buildBusyMap(rows) })); })
      .catch(() => { /* müsaitlik gelmezse saatler açık varsayılır; son söz sunucuda */ });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fac?.id, daysLoaded]);

  // ── Gün kotası (fiyat/kapora/indirim) — önbellekli + sınırlı tekrar ──────
  const [quoteTick, setQuoteTick] = useState(0);
  const quoteFailsRef = useRef<Record<string, number>>({});
  useEffect(() => {
    if (!selCourtId || !quoteKey || quotes[quoteKey]) return;
    if ((quoteFailsRef.current[quoteKey] ?? 0) >= 4) return; // sonsuz döngü emniyeti
    let alive = true;
    getCourtDayQuote(selCourtId, dateISO)
      .then(qt => {
        if (!alive) return;
        quoteFailsRef.current[quoteKey] = 0;
        setQuotes(prev => ({ ...prev, [`${qt.courtId}|${qt.date}`]: qt }));
      })
      .catch(() => {
        // Zayıf ağda saat şeridi iskelette kalmasın: kısa aralıkla tekrar dene
        if (!alive) return;
        quoteFailsRef.current[quoteKey] = (quoteFailsRef.current[quoteKey] ?? 0) + 1;
        setTimeout(() => { if (alive) setQuoteTick(t => t + 1); }, 2500);
      });
    return () => { alive = false; };
  }, [selCourtId, dateISO, quoteKey, quotes, quoteTick]);

  // ── Onarım: saha/gün değişince dolu saate düşme ───────────────────────────
  const firstFree = useCallback((after?: string): string | null => {
    const list = visibleHours.filter(h => h.tariffOk && !hourBlocked(h.time, h.endTime));
    if (list.length === 0) return null;
    if (after) {
      const later = list.find(h => h.time > after);
      if (later) return later.time;
    }
    return list[0].time;
  }, [visibleHours, hourBlocked]);

  useEffect(() => {
    if (seeded || !dayQuote) return;
    // Çakışma banner'ı açıkken otomatik seçim YAPILMAZ: kullanıcı "X'e geç"
    // önerisini görür; sessizce günün ilk saatine kaydırılmaz.
    if (conflict) return;
    if (!selTime || !visibleHours.some(h => h.time === selTime && h.tariffOk && !hourBlocked(h.time, h.endTime))) {
      setSelTime(firstFree() ?? null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dayQuote, selDay, selCourtId, busyMaps, localBusy, conflict]);

  // Format aralık dışına düşmesin
  useEffect(() => {
    if (!court) return;
    if (per < court.minCapacity || per > court.maxCapacity) {
      setFormat(`${court.minCapacity}v${court.minCapacity}`);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [court?.id]);

  // ── Seçim eylemleri ───────────────────────────────────────────────────────
  const pickFacility = (f: CreateFacility) => {
    if (f.id === selFacId) return;
    setSelFacId(f.id);
    const c0 = f.courts[0];
    setSelCourtId(c0?.id ?? null);
    if (c0) setFormat(`${c0.minCapacity}v${c0.minCapacity}`);
    setConflict(null);
  };
  const pickCourt = (c: CreateCourt) => {
    setSelCourtId(c.id);
    setFormat(`${c.minCapacity}v${c.minCapacity}`);
    setConflict(null);
  };
  const pickDay = (i: number) => { setSelDay(i); setConflict(null); };
  const pickTime = (t: string) => { setSelTime(t); setConflict(null); };

  // ── YAYINLA — atomik ─────────────────────────────────────────────────────
  const publish = useCallback(async () => {
    // IP-15 — misafir kapısı SON anda: form doldurulabilsin, kaydolunca
    // kaldığı yerden devam etsin (karar 12a). Eskiden misafirde sunucu
    // PostgREST'in İngilizce mesajını "Maç yayınlanamadı: …" diye basıyordu.
    if (!auth.currentUser) {
      const s = useAppStore.getState();
      s.setPendingIntent('MATCH_CREATE');
      s.setIsSignupGateOpen(true);
      return;
    }
    // StrictMode/eşzamanlı render'da çift tetiklenmeye karşı kilit
    if (publishBusyRef.current) return;
    publishBusyRef.current = true;
    setPublishing(true);
    setPubStep(0);
    setConflict(null);
    const t1 = setTimeout(() => setPubStep(1), 500);
    const t2 = setTimeout(() => setPubStep(2), 1100);
    try {
      const effVisibility = teamInvite ? 'PRIVATE' : visibility;
      if (!publishIdemRef.current) publishIdemRef.current = safeUuid();
      const res = await createMatchAtomic({
        courtId: seeded ? null : selCourtId,
        dateISO: seeded ? null : dateISO,
        time: seeded ? null : selTime,
        format,
        visibility: effVisibility,
        title: title.trim() || undefined,
        gender,
        ageGroup: age,
        difficulty: mental,
        // Seçili sağlayıcılara teklif; 'Tümüne gönder'de providerIds boş kalır
        // ve sunucu en uygun sağlayıcıyı kendisi seçer.
        deferredProviders: offers.map(o => ({ type: o.type, providerIds: o.all ? [] : o.providerIds })),
        seedBookingId: seeded ? seed?.bookingId : null,
        clientRequestId: publishIdemRef.current,
      });
      // Yayın tamam: anahtar tüketildi, bir sonraki maç yeni anahtarla kurulur.
      publishIdemRef.current = null;
      setPubStep(3);

      // Davetler (arkadaş VEYA takım arkadaşı; başarısızlık yayını bozmaz)
      if (invited.length > 0) {
        inviteFriendsToMatch(res.matchId, invited.map(p => p.id))
          .then(({ skipped }) => {
            if (skipped > 0) showToast(`${skipped} kişiye davet gönderilemedi (tanışıklık gerekli).`, 'error');
          })
          .catch(() => showToast('Bazı davetler gönderilemedi.', 'error'));
      }
      // Maçı yerel akışa işle + seed'i temizle + cüzdanı tazele
      const fresh = await getMatchDetails(res.matchId).catch(() => null);
      if (fresh) { applyMatchLocal(fresh); setSelectedMatch(fresh); }
      if (seeded) setSeed(null);
      getWalletSummary().then(setWallet).catch(() => {});
      setResult(res);
      setCopied(false);
      setSheet('SUCCESS');
    } catch (err) {
      const { code, message } = parseCreateMatchError(err);
      if (code === 'SLOT_TAKEN' && selCourtId && selTime) {
        // Saat "Dolu"ya döner, banner en yakın saati önerir — form korunur.
        setLocalBusy(prev => new Set(prev).add(`${selCourtId}|${dateISO}|${selTime}`));
        setConflict({ time: selTime, next: firstFree(selTime) });
      } else if (code === 'INSUFFICIENT_BALANCE') {
        setMissingTL(deposit != null ? Math.max(1, Math.ceil(deposit - spendable)) : 1);
        showToast('Kapora için bakiyen yetersiz — formun korundu.', 'error');
      } else if (code === 'NO_TARIFF' || code === 'BOOKING_DISABLED' || code === 'SLOT_UNAVAILABLE') {
        showToast(message.split(':').slice(1).join(':').trim() || 'Bu saat şu an kullanılamıyor.', 'error');
      } else if (code === 'FORMAT_OUT_OF_RANGE' || code === 'COURT_NOT_FOUND') {
        showToast('Saha bilgisi güncellendi, liste tazeleniyor.', 'error');
        fetchCreateFacilities().then(setFacilities).catch(() => {});
      } else if (code === 'PAST_TIME') {
        if (seeded) {
          // Süresi geçmiş rezervasyon çevrilemez — kilidi çöz, normal akışa dön.
          setSeed(null);
          showToast('Rezervasyonun saati geçmiş — normal kurulum akışına dönüldü.', 'error');
        } else {
          setSelTime(firstFree() ?? null);
          showToast('Seçtiğin saat geçmişte kaldı — en yakın saate alındı.', 'error');
        }
      } else if (code === 'SEED_NOT_FOUND' || code === 'SEED_NOT_READY') {
        setSeed(null);
        showToast(code === 'SEED_NOT_READY'
          ? 'Rezervasyon onaylanmadan/kaporası ödenmeden maça çevrilemiyor.'
          : 'Rezervasyon bulunamadı; normal kurulum akışına dönüldü.', 'error');
      } else if (code === 'DUPLICATE_IN_FLIGHT') {
        // Önceki gönderim hâlâ sunucuda işleniyor — İKİNCİ maç açılmadı.
        showToast('Önceki yayın isteğin hâlâ işleniyor — birkaç saniye sonra Maçlarım’a bak.', 'error');
      } else {
        showToast('Maç yayınlanamadı. Lütfen tekrar dene.', 'error');
        console.error('create_match_atomic:', message);
      }
      setSlide(0);
    } finally {
      clearTimeout(t1); clearTimeout(t2);
      publishBusyRef.current = false;
      setPublishing(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [teamInvite, visibility, seeded, selCourtId, dateISO, selTime, format, title, gender, age,
      mental, offers, seed?.bookingId, invited, deposit, spendable, firstFree]);
  publishRef.current = publish;

  // ── Kaydır → yayınla (pointer takibi pencerede) ───────────────────────────
  // Yayın tetikleme YAN ETKİSİ state updater'ın dışında tutulur (StrictMode
  // updater'ları iki kez çalıştırır); güncel değer ref'te izlenir.
  useEffect(() => {
    const move = (e: PointerEvent) => {
      const d = dragRef.current;
      if (!d) return;
      const x = Math.max(0, Math.min(d.max, e.clientX - d.left - 27));
      slideValRef.current = x / d.max;
      setSlide(slideValRef.current);
    };
    const up = () => {
      if (!dragRef.current) return;
      dragRef.current = null;
      if (slideValRef.current >= 0.88) {
        setSlide(1);
        void publishRef.current();
      } else {
        setSlide(0);
      }
      slideValRef.current = 0;
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
    };
  }, []);

  const onThumbDown = () => {
    if (!canPublish) return;
    const rect = trackRef.current?.getBoundingClientRect();
    if (!rect) return;
    dragRef.current = { left: rect.left + 5, max: rect.width - 59 };
  };

  // ── Kadro: arkadaşlar + takımlar (sheet açılınca, gerçek servislerden) ───
  useEffect(() => {
    if (sheet !== 'FRIENDS') return;
    if (friends === null) getFriends().then(setFriends).catch(() => setFriends([]));
    if (teams === null) getMyTeams().then(setTeams).catch(() => setTeams([]));
  }, [sheet, friends, teams]);

  // Takım kadrosu ilk açılışta çekilir, sonra önbellekten
  const toggleTeam = useCallback(async (teamId: string) => {
    if (openTeamId === teamId) { setOpenTeamId(null); return; }
    setOpenTeamId(teamId);
    if (teamSquads[teamId]) return;
    setSquadLoading(true);
    try {
      const rows = await getTeamSquad(teamId);
      setTeamSquads(prev => ({
        ...prev,
        [teamId]: rows
          .filter(r => r.user_id !== uid)
          .map(r => ({
            id: r.user_id,
            name: r.full_name || 'Oyuncu',
            meta: [r.pos, r.jersey_number ? `#${r.jersey_number}` : null].filter(Boolean).join(' · ') || 'Takım arkadaşı',
            source: 'TEAM' as const,
          })),
      }));
    } catch {
      showToast('Takım kadrosu yüklenemedi.', 'error');
      setTeamSquads(prev => ({ ...prev, [teamId]: [] }));
    } finally {
      setSquadLoading(false);
    }
  }, [openTeamId, teamSquads, uid]);

  // ── Sağlayıcılar (kaleci/hakem sheet'i açılınca) ─────────────────────────
  useEffect(() => {
    if (sheet !== 'PROVIDERS') return;
    (['GK', 'REF'] as const).forEach(t => {
      if (providers[t] !== null) return;
      listBookableProviders(t)
        .then(list => setProviders(prev => ({ ...prev, [t]: list })))
        .catch(() => setProviders(prev => ({ ...prev, [t]: [] })));
    });
  }, [sheet, providers]);

  const toggleInvite = (p: InvitedPerson) => {
    setInvited(prev => prev.some(x => x.id === p.id) ? prev.filter(x => x.id !== p.id) : [...prev, p]);
  };

  const offerOf = (t: 'GK' | 'REF') => offers.find(o => o.type === t);
  const offerCount = (t: 'GK' | 'REF') => {
    const o = offerOf(t);
    return o ? (o.all ? 1 : o.providerIds.length) : 0;
  };
  const toggleProvider = (t: 'GK' | 'REF', id: string) => {
    setOffers(prev => {
      const cur = prev.find(o => o.type === t);
      if (!cur) return [...prev, { type: t, providerIds: [id], all: false }];
      if (cur.all) return prev.map(o => o.type === t ? { ...o, all: false, providerIds: [id] } : o);
      const has = cur.providerIds.includes(id);
      const next = has ? cur.providerIds.filter(x => x !== id) : [...cur.providerIds, id];
      return next.length === 0 ? prev.filter(o => o.type !== t) : prev.map(o => o.type === t ? { ...o, providerIds: next } : o);
    });
  };
  const toggleProviderAll = (t: 'GK' | 'REF') => {
    setOffers(prev => {
      const cur = prev.find(o => o.type === t);
      if (cur?.all) return prev.filter(o => o.type !== t);
      const others = prev.filter(o => o.type !== t);
      return [...others, { type: t, providerIds: [], all: true }];
    });
  };
  // Seçilen sağlayıcıların toplam ücreti (bilgi amaçlı; tahsil onaydan sonra)
  const offerFeeText = useMemo(() => {
    let sum = 0; let unknown = false;
    for (const o of offers) {
      const list = providers[o.type];
      if (o.all || !list) { unknown = true; continue; }
      for (const id of o.providerIds) sum += list.find(p => p.id === id)?.fee ?? 0;
    }
    if (sum === 0 && unknown) return 'Ücret sağlayıcı onayında netleşir';
    return `Toplam ${money(sum)}${unknown ? '+' : ''} · onaylanınca tahsil edilir`;
  }, [offers, providers]);

  // Cüzdan overlay'i doğrudan YÜKLEME sekmesinde açılsın
  useEffect(() => {
    if (sheet === 'TOPUP') useAppStore.getState().setWalletInitialTab('TOPUP');
  }, [sheet]);

  const goLobby = async () => {
    if (!result) return;
    const fresh = await getMatchDetails(result.matchId).catch(() => null);
    if (fresh) { setLobbyMode('MANAGE'); setSelectedMatch(fresh); onNavigate('MATCH_JOIN'); }
    else onNavigate('MATCH_DISCOVERY');
  };

  const shareInvite = async () => {
    if (!result) return;
    const text = result.privateCode
      ? `OYNA'da maç kurdum! Katılım kodu: ${result.privateCode} — oyna://match/${result.matchId}`
      : `OYNA'da maç kurdum! Kadroda yerini al: oyna://match/${result.matchId}`;
    try {
      if (navigator.share) await navigator.share({ text });
      else { await navigator.clipboard.writeText(text); showToast('Davet metni kopyalandı', 'success'); }
    } catch { /* kullanıcı vazgeçti */ }
  };

  const copyCode = async () => {
    if (!result?.privateCode) return;
    try { await navigator.clipboard.writeText(result.privateCode); setCopied(true); } catch { /* pano yok */ }
  };

  // ── Görsel yardımcılar ────────────────────────────────────────────────────
  const whenTxt = `${selDay === 0 ? 'Bugün' : selDay === 1 ? 'Yarın' : WD[dayDate.getDay()]} ${dayDate.getDate()} ${MO[dayDate.getMonth()]}${selTime ? ` · ${selTime}` : ''}`;
  const venueTxt = fac && court ? `${fac.name} · ${court.name}` : seeded ? (seed?.pitchName ?? 'Saha') : 'Saha seç';
  const empty = !loading && facilities.length === 0;

  const banner = conflict
    ? { tone: '#F87171', box: 'bg-red-400/10 border-red-400/25', title: `${conflict.time} az önce doldu`, sub: conflict.next ? `Bu sahada en yakın müsait saat ${conflict.next}` : 'Bugün için başka müsait saat kalmadı', btn: conflict.next ? `${conflict.next}'e geç` : null, act: () => { if (conflict.next) { pickTime(conflict.next); } } }
    : missingTL > 0 && missing > 0
    ? { tone: '#FCA5A5', box: 'bg-red-400/10 border-red-400/25', title: `Kapora için ${money(missing)} eksik`, sub: 'Formun kaybolmaz — yükleyip kaldığın yerden devam et', btn: 'Yükle', act: () => setSheet('TOPUP') }
    : seeded
    ? { tone: '#39FF14', box: 'bg-[#39FF14]/[0.07] border-[#39FF14]/25', title: 'Rezervasyonun maça çevriliyor', sub: 'Saha ve saat kilitli — sadece kadroyu kur', btn: 'Detay', act: () => setSheet('RULES') }
    : null;

  const chip = (on: boolean) => on
    ? 'bg-[#39FF14]/10 border-[#39FF14]/50 text-[#39FF14]'
    : 'bg-white/[0.03] border-white/10 text-white/65';

  // ═══════════════════════════ RENDER ═══════════════════════════════════════
  return (
    <div className="h-full bg-[#0A0E14] text-white flex flex-col relative overflow-hidden font-sans">
      {/* ── Header (sabit) ── */}
      <header className="shrink-0 pt-safe border-b border-white/5 bg-[#0A0E14]/80 backdrop-blur-xl relative z-10">
        <div className="h-[60px] px-4 flex items-center relative">
          <button onClick={onBack} aria-label="Geri"
            className="w-11 h-11 rounded-full bg-white/5 border border-white/5 flex items-center justify-center active:scale-95 transition-transform">
            <ChevronLeft size={20} />
          </button>
          <h1 className="absolute left-1/2 -translate-x-1/2 text-base font-extrabold uppercase tracking-[0.16em]">Maç Kur</h1>
        </div>
      </header>

      {/* ── Koşullu banner ── */}
      <AnimatePresence>
        {banner && (
          <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            className={`shrink-0 flex items-center gap-3 px-3.5 py-2.5 border-b ${banner.box}`}>
            <div className="w-[30px] h-[30px] rounded-[10px] shrink-0 flex items-center justify-center bg-white/5" style={{ color: banner.tone }}>
              <Info size={15} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[0.75rem] font-extrabold leading-tight">{banner.title}</p>
              <p className="text-[0.6875rem] font-bold mt-0.5" style={{ color: banner.tone }}>{banner.sub}</p>
            </div>
            {banner.btn && (
              <button onClick={banner.act}
                className="shrink-0 min-h-[36px] px-3.5 rounded-[10px] bg-[#39FF14] text-[#0A0E14] text-[0.6875rem] font-extrabold active:scale-95 transition-transform">
                {banner.btn}
              </button>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Gövde (kaydırma) ── */}
      <main className="flex-1 min-h-0 overflow-y-auto overscroll-contain custom-scrollbar">
        {loading ? (
          /* ── İskelet: header/alt bar yerinde, zıplama yok ── */
          <div className="flex flex-col gap-5 p-4 pb-7">
            <div className="h-[104px] rounded-3xl bg-white/5 animate-pulse" />
            <div className="flex flex-col gap-3">
              <div className="w-16 h-3 rounded-md bg-white/[0.06] animate-pulse" />
              <div className="h-12 rounded-2xl bg-white/[0.04] animate-pulse" />
              <div className="flex gap-2.5">
                <div className="w-[152px] h-[152px] rounded-[20px] bg-white/5 animate-pulse" />
                <div className="w-[152px] h-[152px] rounded-[20px] bg-white/[0.035] animate-pulse" />
                <div className="w-[60px] h-[152px] rounded-[20px] bg-white/[0.025] animate-pulse" />
              </div>
            </div>
            <div className="flex flex-col gap-3">
              <div className="w-20 h-3 rounded-md bg-white/[0.06] animate-pulse" />
              <div className="flex gap-2">
                {[0, 1, 2, 3, 4].map(i => <div key={i} className="w-[54px] h-[60px] rounded-2xl bg-white/5 animate-pulse" />)}
              </div>
              <div className="h-[46px] rounded-[14px] bg-white/[0.035] animate-pulse" />
            </div>
            <p className="text-center text-[0.6875rem] font-bold text-ink-4">Sahalar ve ilk {DAY_PREFETCH} günün müsaitliği yükleniyor…</p>
          </div>
        ) : empty ? (
          /* ── Bölgede saha yok: NOTIFY / SUGGEST — ikisi de gerçek sinyal yazar ── */
          <div className="flex flex-col gap-4 p-4 pt-6">
            <div className="flex flex-col items-center gap-3.5 text-center px-4 py-7 rounded-3xl border border-dashed border-white/[0.14] bg-white/[0.02]">
              <div className="w-14 h-14 rounded-[18px] bg-white/5 text-ink-4 flex items-center justify-center"><MapPin size={26} /></div>
              <div>
                <h2 className="text-[1.1875rem] font-extrabold tracking-tight">Bölgende henüz onaylı saha yok</h2>
                <p className="mt-2 text-[0.8125rem] font-semibold leading-relaxed text-ink-4">Burada onaylı saha olduğunda ilk sen bil. İstersen bildiğin bir sahayı öner — ekip iletişime geçsin.</p>
              </div>
            </div>
            <button
              onClick={async () => {
                if (notified) return;
                try { await recordDemandSignal('NOTIFY', 'Ordu', 'Altınordu'); setNotified(true); }
                catch { showToast('Kaydedilemedi, tekrar dene.', 'error'); }
              }}
              className={`flex items-center gap-3 rounded-[20px] border p-4 text-left min-h-[56px] active:scale-[0.99] transition-all ${notified ? 'border-[#39FF14]/40 bg-[#39FF14]/[0.07]' : 'border-white/10 bg-white/[0.025]'}`}>
              <div className={`w-[38px] h-[38px] rounded-[13px] shrink-0 flex items-center justify-center ${notified ? 'bg-[#39FF14]/15 text-[#39FF14]' : 'bg-white/5 text-ink-4'}`}><Bell size={17} /></div>
              <div className="flex-1 min-w-0">
                <p className="text-[0.8125rem] font-extrabold">{notified ? 'Haber listesindesin' : 'Saha açılınca haber ver'}</p>
                <p className={`mt-0.5 text-[0.6875rem] font-bold ${notified ? 'text-[#39FF14]' : 'text-ink-4'}`}>{notified ? 'Kaydedildi — ilk onaylı sahada bildirim gelir' : 'Tek dokunuş · istediğinde çıkarsın'}</p>
              </div>
            </button>
            <button onClick={() => setSuggestOpen(v => !v)}
              className="flex items-center gap-3 rounded-[20px] border border-white/10 bg-white/[0.025] p-4 text-left min-h-[56px] active:scale-[0.99] transition-transform">
              <div className="w-[38px] h-[38px] rounded-[13px] shrink-0 flex items-center justify-center bg-white/5 text-white/50"><Plus size={17} /></div>
              <div className="flex-1 min-w-0">
                <p className="text-[0.8125rem] font-extrabold">Bildiğin bir sahayı öner</p>
                <p className="mt-0.5 text-[0.6875rem] font-bold text-ink-4">Saha adı + iletişim yeter · ekip arar</p>
              </div>
            </button>
            {suggestOpen && (
              <div className="flex flex-col gap-2.5 rounded-[20px] border border-white/10 bg-white/[0.02] p-4">
                <input value={suggestName} onChange={e => setSuggestName(e.target.value)} placeholder="Saha adı"
                  className="w-full h-12 rounded-xl bg-white/[0.04] border border-white/10 px-4 text-sm font-semibold outline-none" />
                <input value={suggestContact} onChange={e => setSuggestContact(e.target.value)} placeholder="İletişim (telefon / kişi)"
                  className="w-full h-12 rounded-xl bg-white/[0.04] border border-white/10 px-4 text-sm font-semibold outline-none" />
                <button
                  onClick={async () => {
                    if (!suggestName.trim()) { showToast('Saha adı gerekli', 'error'); return; }
                    try {
                      await recordDemandSignal('SUGGEST', 'Ordu', 'Altınordu', suggestName.trim(), suggestContact.trim() || undefined);
                      setSuggestOpen(false); setSuggestName(''); setSuggestContact('');
                      showToast('Önerin alındı — teşekkürler! ⚽', 'success');
                    } catch { showToast('Gönderilemedi, tekrar dene.', 'error'); }
                  }}
                  className="h-12 rounded-xl bg-[#39FF14] text-[#0A0E14] text-xs font-extrabold uppercase tracking-widest active:scale-95 transition-transform">
                  Gönder
                </button>
              </div>
            )}
          </div>
        ) : (
          /* ── FORM ── */
          <div className="flex flex-col gap-5 p-4 pb-7">

            {/* Özet kartı */}
            <div className="rounded-3xl border border-[#FACC15]/[0.22] p-4 px-[18px]"
              style={{ background: 'linear-gradient(150deg, rgba(250,204,21,0.085), rgba(255,255,255,0.015) 58%, transparent)' }}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline gap-2">
                    <span className="text-[1.4375rem] font-extrabold italic tracking-tight">{format}</span>
                    <span className="text-[0.6875rem] font-extrabold text-[#FACC15]">{per * 2} oyuncu</span>
                  </div>
                  <p className="mt-1 text-[0.8125rem] font-extrabold truncate">{venueTxt}</p>
                  <p className="mt-0.5 text-[0.75rem] font-semibold text-ink-4">{whenTxt}</p>
                </div>
                <button onClick={() => { setPriceOpen(v => !v); }} className="shrink-0 text-right flex flex-col items-end gap-1">
                  <span className="font-numeric text-[1.625rem] font-extrabold leading-none text-[#39FF14]">
                    {money(perPerson)}
                  </span>
                  <span className="flex items-center gap-1 text-[0.625rem] font-extrabold uppercase tracking-[0.12em] text-white/[0.38]">
                    Kişi başı <ChevronDown size={11} className={`transition-transform ${priceOpen ? 'rotate-180' : ''}`} />
                  </span>
                </button>
              </div>
              <AnimatePresence>
                {priceOpen && total != null && (
                  <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                    <div className="mt-3.5 pt-3 border-t border-white/[0.07] flex flex-col gap-1.5 text-[0.6875rem] font-bold">
                      {/* Süre SEÇİLEN dilimden okunur: gündüz 60, akşam 90 olabilir. */}
                      <div className="flex justify-between text-white/50"><span>{court?.name ?? 'Saha'} · {selHour?.minutes ?? dayQuote?.slotDuration ?? 60} dk</span><span className="font-numeric text-white">{money(selHour?.basePrice ?? total)}</span></div>
                      {selHour?.deal && selHour.basePrice != null && selHour.total != null && (
                        <div className="flex justify-between text-[#FACC15]"><span>Son dakika indirimi</span><span className="font-numeric">−{money(selHour.basePrice - selHour.total)}</span></div>
                      )}
                      <div className="flex justify-between text-white/50"><span>Toplam oyuncu ({per} + {per})</span><span className="font-numeric text-white">÷ {per * 2}</span></div>
                      <div className="flex justify-between text-white/50"><span>OYNA hizmet payı</span><span className="font-numeric text-white">+%5</span></div>
                      <div className="flex justify-between text-[#39FF14]"><span>Senin payın</span><span className="font-numeric">{money(perPerson)}</span></div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* 1 · Saha */}
            <section className="flex flex-col gap-3">
              <div className="flex items-center gap-2.5">
                <span className="w-5 h-5 rounded-full bg-[#39FF14]/[0.12] border border-[#39FF14]/30 text-[#39FF14] text-[0.6875rem] font-bold font-numeric flex items-center justify-center">1</span>
                <span className="text-[0.6875rem] font-extrabold uppercase tracking-[0.14em] text-ink-4">Saha</span>
                <span className="ml-auto text-[0.6875rem] font-bold text-ink-4">
                  {q.trim() ? `${filtered.length} sonuç` : `${Math.min(facilities.length, MAX_FACILITIES)} tesis${facilities.length > MAX_FACILITIES ? ' · gerisi aramada' : ''}`}
                </span>
              </div>

              {seeded ? (
                /* Rezervasyondan kilitli kart */
                <div className="flex items-center gap-3 rounded-[20px] border border-[#39FF14]/30 bg-[#39FF14]/5 p-3">
                  <div className="w-[52px] h-[52px] rounded-[14px] shrink-0 overflow-hidden bg-[#12171f] flex items-center justify-center">
                    {fac?.image ? <img src={fac.image} alt="" className="w-full h-full object-cover" /> : <Lock size={18} className="text-[#39FF14]/60" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[0.8125rem] font-extrabold truncate">{venueTxt}</p>
                    <p className="mt-0.5 text-[0.6875rem] font-bold text-[#39FF14]">Rezervasyonundan kilitlendi · {whenTxt}</p>
                  </div>
                  <button onClick={() => { setSeed(null); setSelTime(null); }}
                    className="shrink-0 min-h-[36px] px-3 rounded-[10px] border border-white/[0.14] text-white/60 text-[0.6875rem] font-extrabold active:scale-95 transition-transform">
                    Değiştir
                  </button>
                </div>
              ) : (
                <>
                  {/* Arama */}
                  <div className="relative flex items-center">
                    <Search size={16} className="absolute left-3.5 text-ink-4 pointer-events-none" />
                    <input ref={searchRef} value={q} onChange={e => setQ(e.target.value)}
                      placeholder="Tesis, saha veya semt ara…"
                      className="w-full h-12 rounded-2xl bg-white/[0.035] border border-white/10 pl-10 pr-3.5 text-sm font-semibold outline-none placeholder:text-white/[0.28]" />
                  </div>

                  {/* Tesis şeridi */}
                  <div className="flex gap-2.5 overflow-x-auto -mx-4 px-4 pb-1" style={{ scrollbarWidth: 'none' }}>
                    {shown.map(f => {
                      const on = f.id === selFacId;
                      return (
                        <button key={f.id} onClick={() => pickFacility(f)}
                          className={`shrink-0 w-[152px] rounded-[20px] overflow-hidden text-left border transition-colors ${on ? 'bg-[#39FF14]/[0.06] border-[#39FF14]/[0.45]' : 'bg-white/[0.025] border-white/10'}`}>
                          <div className="relative w-[152px] h-[86px] bg-[#12171f]">
                            {f.image && <img src={f.image} alt="" className="w-full h-full object-cover" loading="lazy" />}
                            {on && (
                              <span className="absolute top-1.5 right-1.5 w-5 h-5 rounded-full bg-[#39FF14] text-[#0A0E14] flex items-center justify-center">
                                <Check size={12} strokeWidth={4} />
                              </span>
                            )}
                            {!f.hasTariff && (
                              <span className="absolute bottom-1.5 left-1.5 text-[0.625rem] font-extrabold uppercase tracking-wider bg-black/70 text-[#FACC15] rounded-md px-1.5 py-0.5">Tarife yok</span>
                            )}
                          </div>
                          <div className="px-2.5 pt-2.5 pb-3">
                            <p className="text-[0.8125rem] font-extrabold truncate">{f.name}</p>
                            <p className="mt-0.5 text-[0.6875rem] font-bold text-white/[0.42] truncate">{[f.city, f.district].filter(Boolean).join(' · ') || '—'}</p>
                            <p className={`mt-1.5 text-[0.6875rem] font-extrabold ${on ? 'text-[#39FF14]' : 'text-white/[0.32]'}`}>
                              {f.courts.length} saha{f.courts.some(c => c.basePrice > 0) ? ` · ${money(Math.min(...f.courts.filter(c => c.basePrice > 0).map(c => c.basePrice)))}'den` : ''}
                            </p>
                          </div>
                        </button>
                      );
                    })}
                    <button onClick={() => searchRef.current?.focus()}
                      className="shrink-0 w-[72px] rounded-[20px] border border-dashed border-white/[0.14] text-ink-4 flex flex-col items-center justify-center gap-2 px-2 active:scale-95 transition-transform">
                      <Search size={17} />
                      <span className="text-[0.6875rem] font-extrabold leading-tight text-center">Tümünü<br />ara</span>
                    </button>
                  </div>

                  {filtered.length === 0 && (
                    <p className="text-center text-xs font-semibold text-ink-4 py-4">Aramanla eşleşen tesis yok.</p>
                  )}

                  {/* Saha listesi */}
                  {fac && (
                    <div className="flex flex-col gap-2">
                      {fac.courts.map(c => {
                        const on = c.id === selCourtId;
                        return (
                          <button key={c.id} onClick={() => pickCourt(c)}
                            className={`flex items-center gap-3 rounded-2xl border p-3 min-h-[56px] text-left transition-colors ${on ? 'bg-[#39FF14]/[0.09] border-[#39FF14]/50' : 'bg-white/[0.025] border-white/[0.07]'}`}>
                            <span className={`w-5 h-5 rounded-full shrink-0 flex items-center justify-center border-2 ${on ? 'bg-[#39FF14] border-[#39FF14]' : 'border-white/20'}`}>
                              {on && <Check size={10} strokeWidth={4} className="text-[#0A0E14]" />}
                            </span>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <span className={`text-[0.8125rem] font-extrabold truncate ${on ? 'text-[#39FF14]' : ''}`}>{c.name}</span>
                                <span className={`shrink-0 text-[0.625rem] font-extrabold uppercase tracking-wider rounded-md px-1.5 py-0.5 ${c.courtType === 'CLOSED' ? 'bg-blue-400/[0.14] text-blue-400' : 'bg-[#39FF14]/[0.12] text-[#39FF14]'}`}>
                                  {c.courtType === 'CLOSED' ? 'Kapalı' : 'Açık'}
                                </span>
                                {c.sizeLabel && <span className="shrink-0 text-[0.625rem] font-extrabold uppercase tracking-wider rounded-md px-1.5 py-0.5 bg-white/[0.06] text-white/50">{c.sizeLabel.slice(0, 8)}</span>}
                              </div>
                              <p className="mt-1 text-[0.6875rem] font-bold text-ink-4">
                                {c.minCapacity === c.maxCapacity
                                  ? `${c.minCapacity}v${c.minCapacity}`
                                  : `${c.minCapacity}v${c.minCapacity} – ${c.maxCapacity}v${c.maxCapacity}`}
                              </p>
                            </div>
                            {c.basePrice > 0 && (
                              <span className={`font-numeric shrink-0 text-xs font-extrabold ${on ? 'text-[#39FF14]' : 'text-white/50'}`}>{money(c.basePrice)}</span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </>
              )}
            </section>

            {/* 2 · Ne zaman */}
            {!seeded && (
              <section className="flex flex-col gap-3">
                <div className="flex items-center gap-2.5">
                  <span className="w-5 h-5 rounded-full bg-[#39FF14]/[0.12] border border-[#39FF14]/30 text-[#39FF14] text-[0.6875rem] font-bold font-numeric flex items-center justify-center">2</span>
                  <span className="text-[0.6875rem] font-extrabold uppercase tracking-[0.14em] text-ink-4">Ne zaman</span>
                  <span className="ml-auto text-[0.6875rem] font-bold text-ink-4 font-numeric">{MO_LONG[dayDate.getMonth()]} {dayDate.getFullYear()}</span>
                </div>

                {/* Gün şeridi */}
                <div className="flex gap-2 overflow-x-auto -mx-4 px-4 pb-0.5" style={{ scrollbarWidth: 'none' }}>
                  {Array.from({ length: Math.min(daysLoaded, DAY_MAX) }, (_, i) => {
                    const d = dateAt(i);
                    const on = selDay === i;
                    return (
                      <button key={i} onClick={() => pickDay(i)}
                        className={`shrink-0 w-[54px] h-[60px] rounded-2xl border flex flex-col items-center justify-center gap-0.5 transition-colors ${on ? 'bg-[#39FF14] border-[#39FF14]' : 'bg-white/[0.03] border-white/[0.09]'}`}>
                        <span className={`text-[0.625rem] font-extrabold uppercase tracking-wide ${on ? 'text-[#0A0E14]/70' : 'text-white/50'}`}>
                          {i === 0 ? 'Bugün' : i === 1 ? 'Yarın' : WD[d.getDay()]}
                        </span>
                        <span className={`font-numeric text-base font-bold leading-tight ${on ? 'text-[#0A0E14]' : 'text-white'}`}>{d.getDate()}</span>
                        <span className={`text-[0.6875rem] font-bold ${on ? 'text-[#0A0E14]/60' : 'text-ink-4'}`}>{MO[d.getMonth()]}</span>
                      </button>
                    );
                  })}
                  {daysLoaded < DAY_MAX && (
                    <button onClick={() => { setDaysLoaded(DAY_MAX); }}
                      className="shrink-0 w-16 h-[60px] rounded-2xl border border-dashed border-white/[0.14] text-ink-4 flex flex-col items-center justify-center gap-0.5 active:scale-95 transition-transform">
                      <span className="font-numeric text-xs font-extrabold">+{DAY_MAX - daysLoaded}</span>
                      <span className="text-[0.6875rem] font-extrabold">gün daha</span>
                    </button>
                  )}
                </div>

                {/* Saat şeridi — dolu saatler görünür ama seçilemez */}
                <div className="flex gap-2 overflow-x-auto -mx-4 px-4 pt-2 pb-1" style={{ scrollbarWidth: 'none' }}>
                  {!dayQuote ? (
                    [0, 1, 2, 3, 4].map(i => <div key={i} className="shrink-0 min-w-[70px] h-[46px] rounded-[14px] bg-white/[0.04] animate-pulse" />)
                  ) : visibleHours.length === 0 ? (
                    <p className="text-xs font-semibold text-ink-4 py-3">Bu gün için müsait saat yok.</p>
                  ) : visibleHours.map(h => {
                    const blocked = hourBlocked(h.time, h.endTime) || !h.tariffOk;
                    const on = selTime === h.time && !blocked;
                    return (
                      <button key={h.time} disabled={blocked} onClick={() => pickTime(h.time)}
                        className={`relative shrink-0 min-w-[70px] h-[46px] rounded-[14px] border font-numeric text-[0.875rem] font-extrabold transition-colors ${
                          blocked ? 'bg-white/[0.02] border-white/[0.06] text-white/[0.22] line-through cursor-not-allowed'
                          : on ? 'bg-[#39FF14] border-[#39FF14] text-[#0A0E14]'
                          : h.deal ? 'bg-[#FACC15]/[0.09] border-[#FACC15]/40 text-[#FACC15]'
                          : 'bg-white/[0.03] border-white/[0.09] text-white/[0.78]'}`}>
                        {blocked && h.tariffOk ? 'Dolu' : h.time}
                        {h.deal && !on && !blocked && h.basePrice != null && h.total != null && h.basePrice > 0 && (
                          <span className="absolute -top-[7px] -right-1 text-[0.6875rem] font-extrabold text-[#0A0E14] bg-[#FACC15] rounded-md px-1 py-px">
                            −%{Math.round((1 - h.total / h.basePrice) * 100)}
                          </span>
                        )}
                        {h.night && !blocked && (
                          <span className="absolute -top-[7px] -left-[3px] text-[0.625rem] font-extrabold uppercase tracking-wide text-[#0A0E14] bg-blue-400 rounded-md px-1 py-px">gece</span>
                        )}
                      </button>
                    );
                  })}
                </div>
                {dayQuote && (
                  <p className="text-[0.6875rem] font-bold leading-normal text-ink-4">
                    {court?.name} · {dayDate.getDate()} {MO[dayDate.getMonth()]} için {visibleHours.filter(h => h.tariffOk && !hourBlocked(h.time, h.endTime)).length} saat müsait.
                    {visibleHours.some(h => h.night) ? ' 00:00 ve 01:00 bu günün gecesidir.' : ''}
                    {selHour?.deal ? ' Seçili saat indirimli.' : ''}
                  </p>
                )}
              </section>
            )}

            {/* 3 · Kaç kişi */}
            <section className="flex flex-col gap-3">
              <div className="flex items-center gap-2.5">
                <span className="w-5 h-5 rounded-full bg-[#39FF14]/[0.12] border border-[#39FF14]/30 text-[#39FF14] text-[0.6875rem] font-bold font-numeric flex items-center justify-center">3</span>
                <span className="text-[0.6875rem] font-extrabold uppercase tracking-[0.14em] text-ink-4">Kaç kişi</span>
              </div>
              <div className="flex gap-2.5 overflow-x-auto -mx-4 px-4 pt-2 pb-1" style={{ scrollbarWidth: 'none' }}>
                {court && Array.from({ length: Math.max(0, court.maxCapacity - court.minCapacity + 1) }, (_, i) => court.minCapacity + i).map(n => {
                  const val = `${n}v${n}`;
                  const on = format === val;
                  const p = total != null ? Math.ceil((total / (n * 2)) * 1.05) : null;
                  return (
                    <button key={val} onClick={() => { setFormat(val); }}
                      className={`relative shrink-0 w-[84px] h-[72px] rounded-[18px] border flex flex-col items-center justify-center gap-0.5 transition-colors ${on ? 'bg-[#39FF14]/[0.09] border-[#39FF14]/50' : 'bg-white/[0.03] border-white/[0.09]'}`}>
                      <span className={`text-base font-extrabold italic ${on ? 'text-[#39FF14]' : 'text-white'}`}>{val}</span>
                      <span className="text-[0.6875rem] font-bold text-white/[0.38]">{n * 2} oyuncu</span>
                      <span className={`font-numeric text-[0.6875rem] font-extrabold ${on ? 'text-[#39FF14]' : 'text-ink-4'}`}>{money(p)}</span>
                      {n === court.minCapacity && (
                        <span className="absolute -top-2 left-1/2 -translate-x-1/2 text-[0.625rem] font-extrabold uppercase tracking-wide text-[#0A0E14] bg-[#FACC15] rounded-md px-1.5 py-0.5 whitespace-nowrap">Önerilen</span>
                      )}
                    </button>
                  );
                })}
              </div>
              {court && (
                <p className="text-[0.6875rem] font-bold text-ink-4">
                  {court.name} {court.minCapacity}v{court.minCapacity} – {court.maxCapacity}v{court.maxCapacity} arası oynanabiliyor (tesis ayarı).
                </p>
              )}
            </section>

            {/* Kimler katılabilir */}
            <section className="flex flex-col gap-3">
              <span className="text-[0.6875rem] font-extrabold uppercase tracking-[0.14em] text-ink-4">Kimler katılabilir</span>
              <div className="grid grid-cols-2 gap-2.5">
                {([['OPEN', 'Herkese açık', 'Vitrinde görünür, boş kontenjan dolar'], ['PRIVATE', 'Kod ile', 'Sadece kodu paylaştığın kişiler']] as const).map(([id, label, sub]) => {
                  const on = (teamInvite ? 'PRIVATE' : visibility) === id;
                  return (
                    <button key={id} onClick={() => { setVisibility(id); if (id === 'OPEN') setTeamInvite(false); }}
                      className={`flex flex-col items-start gap-1.5 p-3.5 rounded-2xl border text-left min-h-[64px] transition-colors ${on ? 'bg-[#39FF14]/[0.08] border-[#39FF14]/[0.45]' : 'bg-white/[0.025] border-white/10'}`}>
                      <span className={`text-xs font-extrabold uppercase ${on ? 'text-[#39FF14]' : ''}`}>{label}</span>
                      <span className="text-[0.6875rem] font-bold leading-snug text-ink-4">{sub}</span>
                    </button>
                  );
                })}
              </div>
              {(visibility === 'PRIVATE' || teamInvite) && (
                <p className="text-[0.6875rem] font-bold text-blue-400">Maç kurulunca 6 haneli katılım kodu üretilir — sadece kodu paylaştığın kişiler girer.</p>
              )}
            </section>

            {/* Kadro (opsiyonel) */}
            <section className="flex flex-col gap-3">
              <div className="flex items-center gap-2.5">
                <span className="text-[0.6875rem] font-extrabold uppercase tracking-[0.14em] text-ink-4">Kadro</span>
                <span className="text-[0.6875rem] font-bold text-white/[0.28]">opsiyonel</span>
              </div>
              <button onClick={() => setSheet('FRIENDS')}
                className="flex items-center gap-3 rounded-[20px] border border-white/10 bg-white/[0.025] p-3.5 text-left min-h-[60px] active:scale-[0.99] transition-transform">
                <div className="flex items-center">
                  <div className="w-[34px] h-[34px] rounded-full bg-gradient-to-br from-[#1e2532] to-[#11151c] border-2 border-[#39FF14] flex items-center justify-center text-xs font-extrabold">
                    {trUpper((currentUserProfile?.name ?? 'S').charAt(0))}
                  </div>
                  {invited.slice(0, 3).map(p => (
                    <div key={p.id} className="w-[34px] h-[34px] -ml-2.5 rounded-full bg-gradient-to-br from-[#1e2532] to-[#11151c] border-2 border-[#0A0E14] flex items-center justify-center text-xs font-extrabold text-white/80">
                      {trUpper(p.name.charAt(0))}
                    </div>
                  ))}
                  <div className="w-[34px] h-[34px] -ml-2.5 rounded-full bg-white/[0.04] border-2 border-white/[0.16] flex items-center justify-center text-white/50">
                    <Plus size={14} />
                  </div>
                </div>
                <div className="flex-1 min-w-0 ml-1">
                  <p className="text-xs font-extrabold">{invited.length > 0 ? `Sen + ${invited.length} kişi çağrıldı` : 'Kadroya kimseyi çağırmadın'}</p>
                  <p className="mt-0.5 text-[0.6875rem] font-bold text-white/[0.42]">
                    {(teamInvite || visibility === 'PRIVATE')
                      ? `Kalan ${Math.max(0, per * 2 - 1 - invited.length)} kişi sadece kodla katılabilir`
                      : `Kalan ${Math.max(0, per * 2 - 1 - invited.length)} kişi vitrinden gelir`}
                  </p>
                </div>
                <ChevronRight size={15} className="text-ink-4 shrink-0" />
              </button>
            </section>

            {/* Kaleci / hakem — gerçek sağlayıcı seçimi */}
            <section className="flex flex-col gap-2.5">
              <button onClick={() => { setSheet('PROVIDERS'); }}
                className="flex items-center gap-3 rounded-[20px] border border-white/10 bg-white/[0.025] p-3.5 text-left min-h-[56px] active:scale-[0.99] transition-transform">
                <div className="w-9 h-9 rounded-xl shrink-0 flex items-center justify-center bg-white/5 text-white/55"><ShieldCheck size={16} /></div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-extrabold">
                    {offers.length > 0
                      ? [offerCount('GK') ? `${offerOf('GK')?.all ? 'Tüm kaleciler' : `${offerCount('GK')} kaleci`}` : null,
                         offerCount('REF') ? `${offerOf('REF')?.all ? 'Tüm hakemler' : `${offerCount('REF')} hakem`}` : null]
                        .filter(Boolean).join(' + ') + ' seçildi'
                      : 'Kaleci veya hakem lazım mı?'}
                  </p>
                  <p className={`mt-0.5 text-[0.6875rem] font-bold ${offers.length > 0 ? 'text-[#39FF14]' : 'text-white/[0.42]'}`}>
                    {offers.length > 0 ? offerFeeText : "Opsiyonel · teklif maç kurulunca gider, ilk kabul eden alır"}
                  </p>
                </div>
                <ChevronRight size={15} className="text-ink-4 shrink-0" />
              </button>
            </section>

            {/* Gerisi profilinden */}
            <button onClick={() => setSheet('ADV')}
              className="flex items-center gap-3 rounded-[20px] border border-[#39FF14]/[0.18] bg-[#39FF14]/[0.04] p-3.5 text-left min-h-[56px] active:scale-[0.99] transition-transform">
              <Sparkles size={17} className="text-[#39FF14] shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-xs font-extrabold">Gerisi profilinden ayarlandı</p>
                <p className="mt-1 text-[0.6875rem] font-bold text-white/[0.42] truncate">{age} · {gender} · {mental} · {selHour?.minutes ?? dayQuote?.slotDuration ?? 60} dk{title ? ` · "${title}"` : ''}</p>
              </div>
              <span className="text-[0.6875rem] font-extrabold text-[#39FF14] shrink-0">Değiştir</span>
            </button>

            {/* Kapora kuralı */}
            <button onClick={() => setSheet('RULES')}
              className={`flex items-center gap-3 rounded-[20px] border p-4 text-left min-h-[60px] active:scale-[0.99] transition-transform ${
                missing > 0 && deposit != null && !seeded
                  ? 'border-red-400/30 bg-red-400/[0.07]'
                  : 'border-[#FACC15]/25 bg-[#FACC15]/5'}`}>
              <div className={`w-[38px] h-[38px] rounded-[13px] shrink-0 flex items-center justify-center ${missing > 0 && deposit != null && !seeded ? 'bg-red-400/[0.14] text-red-300' : 'bg-[#FACC15]/[0.12] text-[#FACC15]'}`}>
                <Lock size={17} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[0.8125rem] font-extrabold">
                  {seeded ? 'Kapora yok — rezervasyon güvencesi zaten ödendi'
                    : deposit != null
                      ? missing > 0
                        ? `Kapora ${money(deposit)} · bakiyen ${money(spendable)}`
                        : `Kapora ${money(deposit)} · cüzdanından bloke`
                      : 'Kapora saat seçince hesaplanır'}
                </p>
                <p className={`mt-0.5 text-[0.6875rem] font-bold leading-snug ${missing > 0 && deposit != null && !seeded ? 'text-red-300' : 'text-[#FACC15]/85'}`}>
                  {seeded ? 'Maç dolunca oyuncu payları cüzdanına gelir'
                    : deposit != null
                      ? missing > 0
                        ? `${money(missing)} yükle, kapora anında bloke edilsin`
                        : `Maç dolunca ${money(Math.max(0, deposit - (perPerson ?? 0)))} iade · dolmazsa tamamı`
                      : 'Kapora ve iade kuralları için dokun'}
                </p>
              </div>
              <ChevronRight size={15} className="text-ink-4 shrink-0" />
            </button>
          </div>
        )}
      </main>

      {/* ── Alt bar (sabit): kaydır → yayınla ── */}
      {!loading && !empty && (
        <div className="shrink-0 px-4 pt-3.5 pb-safe bg-gradient-to-t from-[#0A0E14] via-[#0A0E14]/95 to-transparent flex flex-col gap-2.5 relative z-10">
          {publishing ? (
            <div className="rounded-[20px] border border-[#39FF14]/25 bg-[#39FF14]/[0.06] p-3.5 flex flex-col gap-2.5">
              <div className="flex items-center gap-2.5">
                <span className="w-4 h-4 rounded-full border-2 border-[#39FF14]/25 border-t-[#39FF14] animate-spin shrink-0" />
                <span className="text-xs font-extrabold uppercase tracking-widest text-[#39FF14]">Yayınlanıyor</span>
              </div>
              {[['Maç oluşturuldu', 'matches'], ['Saha kilitlendi', 'pitch_bookings'], ['Kapora bloke ediliyor', 'payment_intents']].map(([t, src], i) => (
                <div key={src} className="flex items-center gap-2.5">
                  <span className={`w-3 text-[0.6875rem] font-extrabold shrink-0 ${pubStep > i ? 'text-[#39FF14]' : 'text-ink-4'}`}>{pubStep > i ? '✓' : '⟳'}</span>
                  <span className={`flex-1 text-[0.6875rem] font-bold ${pubStep > i ? 'text-[#39FF14]' : 'text-white/55'}`}>{t}</span>
                  <span className="font-numeric text-[0.6875rem] font-bold text-white/[0.28]">{src}</span>
                </div>
              ))}
            </div>
          ) : canPublish ? (
            /* Kaydır → yayınla: dolum ilerledikçe parlayan ray, ışıltı taraması,
               yaklaştıkça beliren "BIRAK" ipucu ve eşiğe varınca doygunlaşan tutamak. */
            <div ref={trackRef}
              className="relative h-[68px] rounded-[22px] overflow-hidden border transition-colors duration-200"
              style={{
                background: 'linear-gradient(180deg, rgba(57,255,20,0.10), rgba(57,255,20,0.05))',
                borderColor: slide >= 0.88 ? 'rgba(57,255,20,0.85)' : 'rgba(57,255,20,0.28)',
                boxShadow: slide >= 0.88 ? '0 0 34px rgba(57,255,20,0.30)' : 'none',
              }}>
              {/* Dolum */}
              <div className="absolute left-0 top-0 bottom-0 transition-[background] duration-200"
                style={{
                  width: `${Math.round(slide * ((trackRef.current?.clientWidth ?? 340) - 63)) + 63}px`,
                  background: slide >= 0.88
                    ? 'linear-gradient(90deg, rgba(57,255,20,0.30), rgba(57,255,20,0.42))'
                    : 'linear-gradient(90deg, rgba(57,255,20,0.10), rgba(57,255,20,0.22))',
                }} />
              {/* Işıltı taraması — boştayken hafifçe akar, sürüklerken durur */}
              {slide < 0.02 && (
                <motion.div aria-hidden
                  className="absolute inset-y-0 w-24 pointer-events-none"
                  style={{ background: 'linear-gradient(90deg, transparent, rgba(57,255,20,0.16), transparent)' }}
                  animate={{ x: ['-20%', '460%'] }}
                  transition={{ duration: 2.6, repeat: Infinity, ease: 'easeInOut', repeatDelay: 0.7 }} />
              )}
              {/* Yön okları — tutamağın gideceği yolu gösterir */}
              <div className="absolute inset-y-0 right-6 flex items-center gap-1 pointer-events-none"
                style={{ opacity: Math.max(0, 0.5 - slide * 1.4) }}>
                {[0, 1, 2].map(i => (
                  <motion.span key={i} className="text-[#39FF14]"
                    animate={{ opacity: [0.25, 1, 0.25] }}
                    transition={{ duration: 1.4, repeat: Infinity, delay: i * 0.18 }}>
                    <ChevronRight size={14} strokeWidth={3} />
                  </motion.span>
                ))}
              </div>
              {/* Metin */}
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none px-16">
                <span className="text-[0.8125rem] font-extrabold uppercase tracking-[0.11em] text-[#39FF14] text-center"
                  style={{ opacity: Math.max(0, 1 - slide * 2.4) }}>
                  Kaydır → yayınla{deposit ? ' & kapora' : ''}
                </span>
                <span className="absolute text-[0.8125rem] font-extrabold uppercase tracking-[0.14em] text-[#39FF14]"
                  style={{ opacity: slide >= 0.88 ? 1 : 0, transition: 'opacity .15s' }}>
                  Bırak ve yayınla
                </span>
              </div>
              {/* Tutamak */}
              <motion.div onPointerDown={onThumbDown}
                className="absolute top-[6px] left-[6px] w-[56px] h-[56px] rounded-[18px] flex items-center justify-center cursor-grab active:cursor-grabbing"
                style={{
                  transform: `translateX(${Math.round(slide * ((trackRef.current?.clientWidth ?? 340) - 63))}px)`,
                  // 'pan-y': tutamağı YANA sürüklemek yayınlar, YUKARI sürüklemek
                  // sayfayı kaydırır. Eski 'none' değeri bu 56px'lik kareyi
                  // kaydırılamaz bir ada yapıyordu.
                  touchAction: 'pan-y',
                  background: slide >= 0.88
                    ? 'linear-gradient(135deg, #7CFF5C, #39FF14)'
                    : 'linear-gradient(135deg, #39FF14, #2BD10F)',
                  color: '#0A0E14',
                  boxShadow: slide >= 0.88
                    ? '0 0 30px rgba(57,255,20,0.65), inset 0 1px 0 rgba(255,255,255,0.45)'
                    : '0 6px 18px rgba(0,0,0,0.35), 0 0 20px rgba(57,255,20,0.30), inset 0 1px 0 rgba(255,255,255,0.35)',
                }}
                animate={slide < 0.02 ? { scale: [1, 1.04, 1] } : { scale: 1 }}
                transition={slide < 0.02 ? { duration: 1.8, repeat: Infinity, ease: 'easeInOut' } : { duration: 0.15 }}>
                <ArrowRight size={23} strokeWidth={2.8} />
              </motion.div>
            </div>
          ) : (
            <div className="h-16 rounded-[20px] border border-white/[0.07] bg-white/[0.02] flex items-center justify-center">
              <span className="text-xs font-extrabold uppercase tracking-[0.11em] text-ink-4">
                {!selCourtId ? 'Önce saha seç' : !selTime ? 'Saat seç' : 'Bu saat kullanılamıyor'}
              </span>
            </div>
          )}
          <p className="text-center text-[0.6875rem] font-bold text-white/[0.32] pb-1">
            {publishing ? 'Kapatma — işlem birkaç saniye sürebilir'
              : seeded ? 'Rezervasyonun maça çevrilecek · ek ödeme yok'
              : deposit != null ? `${money(deposit)} kapora cüzdanından bloke edilir · maç dolmazsa tam iade` : 'Saha ve saat seçince kapora hesaplanır'}
          </p>
        </div>
      )}

      {/* ═══ SHEET'LER ═══ */}
      <AnimatePresence>
        {sheet === 'ADV' && (
          <motion.div key="adv" initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 28, stiffness: 300 }}
            className="absolute inset-0 z-[60] bg-[#0A0E14] flex flex-col">
            <header className="shrink-0 pt-safe border-b border-white/5">
              <div className="px-5 py-4 flex items-center justify-between">
                <h2 className="text-[1.0625rem] font-extrabold italic uppercase tracking-tight">Tercihe Bağlı Detaylar</h2>
                <button onClick={() => setSheet(null)} aria-label="Kapat" className="w-[42px] h-[42px] rounded-full bg-white/5 border border-white/5 flex items-center justify-center"><X size={18} /></button>
              </div>
            </header>
            <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar">
              <div className="p-5 pb-10 flex flex-col gap-6">
                <div className="flex items-start gap-3 rounded-[18px] border border-[#39FF14]/[0.22] bg-[#39FF14]/5 p-3.5">
                  <Sparkles size={16} className="text-[#39FF14] shrink-0 mt-0.5" />
                  <p className="text-[0.75rem] leading-relaxed text-white/[0.62]">Aşağıdakiler profilinden ve seçtiğin sahadan otomatik ayarlandı. Hiçbirine dokunmadan maçı kurabilirsin.</p>
                </div>

                <div className="flex flex-col gap-3">
                  <p className="text-[0.625rem] font-extrabold uppercase tracking-[0.16em] text-ink-4">Görünürlük</p>
                  <div className="grid grid-cols-2 gap-2.5">
                    <button onClick={() => { setVisibility('OPEN'); setTeamInvite(false); }}
                      className={`flex flex-col items-start gap-1.5 p-3.5 rounded-2xl border text-left ${(teamInvite ? 'PRIVATE' : visibility) === 'OPEN' ? 'bg-[#39FF14]/[0.09] border-[#39FF14]/50 text-[#39FF14]' : 'bg-white/[0.02] border-white/10'}`}>
                      <span className="text-xs font-extrabold uppercase">Herkese açık</span>
                      <span className="text-[0.6875rem] font-bold text-ink-4">Vitrinde herkes görür ve katılabilir</span>
                    </button>
                    <button onClick={() => setVisibility('PRIVATE')}
                      className={`flex flex-col items-start gap-1.5 p-3.5 rounded-2xl border text-left ${(teamInvite ? 'PRIVATE' : visibility) === 'PRIVATE' ? 'bg-[#FACC15]/[0.09] border-[#FACC15]/50 text-[#FACC15]' : 'bg-white/[0.02] border-white/10'}`}>
                      <span className="text-xs font-extrabold uppercase">Kod ile</span>
                      <span className="text-[0.6875rem] font-bold text-ink-4">Sadece paylaştığın kodla katılım</span>
                    </button>
                  </div>
                </div>

                <div className="flex flex-col gap-3">
                  <div className="flex items-center justify-between">
                    <p className="text-[0.625rem] font-extrabold uppercase tracking-[0.16em] text-ink-4">Oyun sertliği</p>
                    <span className="text-[0.625rem] font-extrabold uppercase tracking-widest text-[#39FF14] bg-[#39FF14]/10 border border-[#39FF14]/25 rounded-full px-2 py-1">Profilinden</span>
                  </div>
                  <div className="flex gap-2.5">
                    {MENTALS.map(m => {
                      const on = mental === m.id;
                      return (
                        <button key={m.id} onClick={() => setMental(m.id)}
                          className="flex-1 h-[60px] rounded-2xl border flex flex-col items-center justify-center gap-1"
                          style={{
                            background: on ? `${m.color}26` : `${m.color}0D`,
                            borderColor: on ? `${m.color}AA` : `${m.color}33`,
                          }}>
                          <span className="text-xs font-extrabold italic uppercase" style={{ color: on ? '#fff' : m.color }}>{m.id}</span>
                          <span className="text-[0.6875rem] font-bold text-ink-4">{m.sub}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="flex flex-col gap-3">
                  <div className="flex items-center justify-between">
                    <p className="text-[0.625rem] font-extrabold uppercase tracking-[0.16em] text-ink-4">Kimler katılabilir</p>
                    <span className="text-[0.625rem] font-extrabold uppercase tracking-widest text-[#39FF14] bg-[#39FF14]/10 border border-[#39FF14]/25 rounded-full px-2 py-1">Otomatik</span>
                  </div>
                  <div className="flex gap-2">
                    {GENDERS.map(g => (
                      <button key={g} onClick={() => setGender(g)} className={`flex-1 h-11 rounded-[14px] border text-[0.6875rem] font-extrabold ${chip(gender === g)}`}>{g}</button>
                    ))}
                  </div>
                  <div className="flex gap-2 overflow-x-auto pb-0.5" style={{ scrollbarWidth: 'none' }}>
                    {AGES.map(a => (
                      <button key={a} onClick={() => setAge(a)} className={`shrink-0 px-4 py-2.5 rounded-[14px] border text-[0.6875rem] font-extrabold whitespace-nowrap font-numeric ${chip(age === a)}`}>{a}</button>
                    ))}
                  </div>
                </div>

                <div className="flex flex-col gap-3">
                  <p className="text-[0.625rem] font-extrabold uppercase tracking-[0.16em] text-ink-4">Rakip taraf</p>
                  <button onClick={() => setTeamInvite(v => !v)}
                    className={`flex items-center justify-between gap-3 p-3.5 rounded-[18px] border text-left ${teamInvite ? 'bg-[#FF4D4D]/10 border-[#FF4D4D]/50' : 'bg-white/[0.03] border-white/10'}`}>
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-10 h-10 rounded-[13px] bg-[#FF4D4D]/[0.12] text-[#FF4D4D] flex items-center justify-center shrink-0"><Users size={19} /></div>
                      <div className="min-w-0">
                        <p className="text-[0.8125rem] font-extrabold">Rakip takımı ben davet edeceğim</p>
                        <p className="mt-0.5 text-[0.6875rem] font-bold text-ink-4">Maç kod ile kapalı hale gelir</p>
                      </div>
                    </div>
                    <div className={`w-[50px] h-7 rounded-full p-[3px] flex items-center shrink-0 transition-colors ${teamInvite ? 'justify-end bg-[#FF4D4D]' : 'justify-start bg-white/[0.08]'}`}>
                      <div className={`w-[22px] h-[22px] rounded-full ${teamInvite ? 'bg-white' : 'bg-white/35'}`} />
                    </div>
                  </button>
                </div>

                <div className="flex flex-col gap-3">
                  <p className="text-[0.625rem] font-extrabold uppercase tracking-[0.16em] text-ink-4">
                    Maç adı <span className="normal-case tracking-normal font-medium text-ink-4">(opsiyonel)</span>
                  </p>
                  <input value={title} onChange={e => setTitle(e.target.value.slice(0, 40))} placeholder="Perşembe Derbisi…"
                    className="w-full rounded-[14px] bg-white/[0.03] border border-white/10 px-4 py-3.5 text-sm font-semibold outline-none placeholder:text-white/[0.28]" />
                </div>

                <button onClick={() => setSheet(null)}
                  className="w-full h-14 rounded-[18px] bg-[#FACC15] text-[#0A0E14] text-[0.9375rem] font-extrabold italic uppercase shadow-[0_0_26px_rgba(250,204,21,0.28)] active:scale-[0.98] transition-transform">
                  Onayla
                </button>
              </div>
            </div>
          </motion.div>
        )}

        {sheet === 'FRIENDS' && (
          <motion.div key="friends" initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 28, stiffness: 300 }}
            className="absolute inset-0 z-[60] bg-[#0A0E14] flex flex-col">
            <header className="shrink-0 pt-safe border-b border-white/5">
              <div className="px-5 py-4 flex items-center justify-between">
                <h2 className="text-[1.0625rem] font-extrabold italic uppercase tracking-tight">Kadronu Çağır</h2>
                <button onClick={() => setSheet(null)} aria-label="Kapat" className="w-[42px] h-[42px] rounded-full bg-white/5 border border-white/5 flex items-center justify-center"><X size={18} /></button>
              </div>
            </header>
            {friends === null || teams === null ? (
              <div className="flex-1 flex items-center justify-center"><Spinner /></div>
            ) : friends.length === 0 && teams.length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center gap-4 px-8 text-center">
                <div className="w-[78px] h-[78px] rounded-full border border-dashed border-white/[0.16] flex items-center justify-center text-ink-4"><Users size={30} /></div>
                <div>
                  <p className="text-[1.0625rem] font-extrabold">Henüz arkadaşın ya da takımın yok</p>
                  <p className="mt-2 text-[0.8125rem] leading-relaxed text-ink-4">Sorun değil — maçı şimdi kur, boş kontenjanlar Top Oyna vitrininde yayınlansın. Yayın sonrası bağlantıyı paylaşarak da çağırabilirsin.</p>
                </div>
                <button onClick={() => setSheet(null)}
                  className="w-full h-[52px] rounded-2xl bg-[#39FF14] text-[#0A0E14] text-[0.8125rem] font-extrabold uppercase tracking-wide shadow-[0_0_24px_rgba(57,255,20,0.24)] active:scale-95 transition-transform">
                  Vitrinde yayınla, sonra çağır
                </button>
              </div>
            ) : (
              <>
                {/* Sekmeler: gerçek arkadaş listesi ve gerçek takım kadroları */}
                <div className="shrink-0 px-5 pt-4 pb-3 flex flex-col gap-3">
                  <div className="flex gap-2">
                    {([['FRIENDS', `Arkadaşlar${friends.length ? ` · ${friends.length}` : ''}`],
                       ['TEAMS', `Takımlarım${teams.length ? ` · ${teams.length}` : ''}`]] as const).map(([id, label]) => (
                      <button key={id} onClick={() => { setSquadTab(id); }}
                        className={`flex-1 h-[38px] rounded-xl text-[0.6875rem] font-extrabold uppercase tracking-[0.06em] border transition-colors ${
                          squadTab === id ? 'bg-[#39FF14] border-[#39FF14] text-[#0A0E14]' : 'bg-white/[0.03] border-white/10 text-white/60'}`}>
                        {label}
                      </button>
                    ))}
                  </div>
                  {squadTab === 'FRIENDS' && friends.length > 0 && (
                    <input value={friendQ} onChange={e => setFriendQ(e.target.value)} placeholder="Arkadaş ara…"
                      className="w-full rounded-[14px] bg-white/[0.03] border border-white/10 px-4 py-3 text-sm font-semibold outline-none placeholder:text-white/[0.28]" />
                  )}
                </div>

                <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar px-5 pb-4 flex flex-col gap-2">
                  {squadTab === 'FRIENDS' ? (
                    friends.length === 0 ? (
                      <p className="text-center text-[0.8125rem] text-ink-4 py-10 leading-relaxed">
                        Arkadaş listen boş. Takımlarım sekmesinden takım arkadaşlarını çağırabilirsin.
                      </p>
                    ) : friends
                      .filter(f => !friendQ.trim() || trLower(f.full_name ?? '').includes(trLower(friendQ.trim())))
                      .map(f => {
                        const on = invited.some(x => x.id === f.friend_id);
                        return (
                          <button key={f.friend_id}
                            onClick={() => toggleInvite({
                              id: f.friend_id,
                              name: f.full_name || 'Oyuncu',
                              meta: [f.pos, f.matches_together ? `${f.matches_together} ortak maç` : null].filter(Boolean).join(' · ') || 'Arkadaş',
                              source: 'FRIEND',
                            })}
                            className={`flex items-center gap-3 p-3 rounded-2xl border text-left ${on ? 'bg-[#39FF14]/[0.07] border-[#39FF14]/40' : 'bg-white/[0.025] border-white/[0.07]'}`}>
                            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[#1e2532] to-[#11151c] border border-white/10 flex items-center justify-center text-sm font-extrabold shrink-0 overflow-hidden">
                              {f.avatar_url ? <img src={f.avatar_url} alt="" className="w-full h-full object-cover" /> : trUpper((f.full_name ?? '?').charAt(0))}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-[0.875rem] font-extrabold truncate">{f.full_name}</p>
                              <p className="mt-0.5 text-[0.6875rem] font-bold text-ink-4">
                                {[f.pos, f.matches_together ? `${f.matches_together} ortak maç` : null].filter(Boolean).join(' · ') || 'Arkadaş'}
                              </p>
                            </div>
                            <span className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 border-2 ${on ? 'bg-[#39FF14] border-[#39FF14]' : 'border-white/20'}`}>
                              {on && <Check size={12} strokeWidth={3.5} className="text-[#0A0E14]" />}
                            </span>
                          </button>
                        );
                      })
                  ) : (
                    teams.length === 0 ? (
                      <p className="text-center text-[0.8125rem] text-ink-4 py-10 leading-relaxed">
                        Henüz bir takımda değilsin. Sosyal sekmesinden takım kurabilir ya da katılabilirsin.
                      </p>
                    ) : teams.map(t => {
                      const open = openTeamId === t.team_id;
                      const squad = teamSquads[t.team_id];
                      const picked = (squad ?? []).filter(m => invited.some(x => x.id === m.id)).length;
                      return (
                        <div key={t.team_id} className="rounded-2xl border border-white/[0.07] bg-white/[0.02] overflow-hidden">
                          <button onClick={() => void toggleTeam(t.team_id)}
                            className="w-full flex items-center gap-3 p-3 text-left">
                            <div className="w-10 h-10 rounded-xl flex items-center justify-center text-sm font-extrabold shrink-0 border border-white/10"
                              style={{ background: `linear-gradient(135deg, ${t.color1 || '#1e2532'}, ${t.color2 || '#11151c'})` }}>
                              {trUpper((t.short_name || t.name || '?').charAt(0))}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-[0.875rem] font-extrabold truncate">{t.name}</p>
                              <p className="mt-0.5 text-[0.6875rem] font-bold text-ink-4">
                                {t.member_count} üye{t.format ? ` · ${t.format}` : ''}{picked > 0 ? ` · ${picked} seçili` : ''}
                              </p>
                            </div>
                            <ChevronDown size={16} className={`text-ink-4 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
                          </button>
                          {open && (
                            <div className="px-3 pb-3 flex flex-col gap-2">
                              {squad === undefined ? (
                                <div className="py-4 flex justify-center">{squadLoading ? <Spinner size={20} /> : null}</div>
                              ) : squad.length === 0 ? (
                                <p className="text-[0.75rem] text-ink-4 py-3 text-center">Bu takımda çağırabileceğin başka üye yok.</p>
                              ) : squad.map(m => {
                                const on = invited.some(x => x.id === m.id);
                                return (
                                  <button key={m.id} onClick={() => toggleInvite(m)}
                                    className={`flex items-center gap-3 p-2.5 rounded-xl border text-left ${on ? 'bg-[#39FF14]/[0.07] border-[#39FF14]/40' : 'bg-white/[0.03] border-white/[0.06]'}`}>
                                    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[#1e2532] to-[#11151c] border border-white/10 flex items-center justify-center text-xs font-extrabold shrink-0">
                                      {trUpper(m.name.charAt(0))}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                      <p className="text-[0.8125rem] font-bold truncate">{m.name}</p>
                                      <p className="text-[0.6875rem] font-bold text-ink-4">{m.meta}</p>
                                    </div>
                                    <span className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 border-2 ${on ? 'bg-[#39FF14] border-[#39FF14]' : 'border-white/20'}`}>
                                      {on && <Check size={10} strokeWidth={3.5} className="text-[#0A0E14]" />}
                                    </span>
                                  </button>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>

                <div className="shrink-0 px-5 pt-3.5 pb-safe border-t border-white/5 bg-[#0A0E14]">
                  <button onClick={() => setSheet(null)}
                    className="w-full h-14 rounded-[18px] bg-[#39FF14] text-[#0A0E14] text-sm font-extrabold uppercase tracking-wide shadow-[0_0_26px_rgba(57,255,20,0.26)] active:scale-[0.98] transition-transform">
                    {invited.length > 0 ? `${invited.length} kişiyi çağır` : 'Kimseyi çağırma'}
                  </button>
                  <p className="mt-2 mb-1 text-center text-[0.6875rem] font-bold text-ink-4">Davetler maç yayınlanınca bildirim olarak gider · slotlar satın almayla dolar</p>
                </div>
              </>
            )}
          </motion.div>
        )}

        {/* ── Kaleci & Hakem: gerçek sağlayıcılar (onaylı + müsait) ── */}
        {sheet === 'PROVIDERS' && (
          <motion.div key="providers" initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 28, stiffness: 300 }}
            className="absolute inset-0 z-[60] bg-[#0A0E14] flex flex-col">
            <header className="shrink-0 pt-safe border-b border-white/5">
              <div className="px-5 py-4 flex items-center justify-between">
                <div>
                  <h2 className="text-[1.0625rem] font-extrabold italic uppercase tracking-tight">Kaleci &amp; Hakem</h2>
                  <p className="mt-0.5 text-[0.625rem] font-bold uppercase tracking-widest" style={{ color: providerTab === 'GK' ? '#39FF14' : '#FACC15' }}>
                    Çoklu teklif · ilk kabul eden alır
                  </p>
                </div>
                <button onClick={() => setSheet(null)} aria-label="Kapat" className="w-[42px] h-[42px] rounded-full bg-white/5 border border-white/5 flex items-center justify-center"><X size={18} /></button>
              </div>
              <div className="px-5 pb-4">
                <div className="bg-[#161B22] p-1.5 rounded-2xl flex border border-white/5">
                  {([['GK', 'Kaleci', Shield, '#39FF14'], ['REF', 'Hakem', Scale, '#FACC15']] as const).map(([id, label, Icon, color]) => {
                    const on = providerTab === id;
                    const n = offerCount(id);
                    return (
                      <button key={id} onClick={() => { setProviderTab(id); }}
                        className={`flex-1 py-2.5 text-[0.6875rem] font-extrabold rounded-xl transition-all flex items-center justify-center gap-2 ${on ? 'text-[#0A0E14]' : 'text-ink-4'}`}
                        style={on ? { background: color } : {}}>
                        <Icon size={14} /> {trUpper(label)}{n > 0 ? ` · ${offerOf(id)?.all ? 'Tümü' : n}` : ''}
                      </button>
                    );
                  })}
                </div>
              </div>
            </header>

            <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar px-5 pt-4 pb-4 flex flex-col gap-2.5">
              {(() => {
                const accent = providerTab === 'GK' ? '#39FF14' : '#FACC15';
                const list = providers[providerTab];
                const cur = offerOf(providerTab);
                const all = !!cur?.all;
                return (
                  <>
                    <button onClick={() => toggleProviderAll(providerTab)}
                      className="w-full flex items-center justify-between gap-3 px-4 py-3.5 rounded-2xl border transition-all"
                      style={all ? { background: `${accent}14`, borderColor: `${accent}80` } : { background: 'rgba(255,255,255,0.03)', borderColor: 'rgba(255,255,255,0.1)' }}>
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: `${accent}1f`, color: accent }}>
                          <Users size={18} />
                        </div>
                        <div className="text-left">
                          <p className="text-sm font-extrabold uppercase italic">Tümüne Gönder</p>
                          <p className="text-[0.6875rem] text-ink-4">Uygun tüm {providerTab === 'GK' ? 'kalecilere' : 'hakemlere'} teklif</p>
                        </div>
                      </div>
                      <span className="w-6 h-6 rounded-full border-2 flex items-center justify-center"
                        style={all ? { background: accent, borderColor: accent, color: '#0A0E14' } : { borderColor: 'rgba(255,255,255,0.25)' }}>
                        {all && <Check size={14} strokeWidth={3} />}
                      </span>
                    </button>

                    {list === null ? (
                      <div className="py-10 flex justify-center"><Spinner /></div>
                    ) : list.length === 0 ? (
                      <p className="text-center text-[0.8125rem] text-ink-4 py-10 leading-relaxed">
                        Şu an müsait {providerTab === 'GK' ? 'kaleci' : 'hakem'} yok. "Tümüne Gönder" seçersen uygun biri çıktığında teklif iletilir.
                      </p>
                    ) : (
                      <div className={`flex flex-col gap-2.5 transition-opacity ${all ? 'opacity-40 pointer-events-none' : ''}`}>
                        {list.map(p => {
                          const on = !all && !!cur?.providerIds.includes(p.id);
                          return (
                            <button key={p.id} onClick={() => toggleProvider(providerTab, p.id)}
                              className="w-full flex items-center gap-3 rounded-2xl border p-3 text-left transition-all active:scale-[0.99]"
                              style={on ? { background: `${accent}12`, borderColor: `${accent}80` } : { background: 'rgba(255,255,255,0.04)', borderColor: 'rgba(255,255,255,0.06)' }}>
                              <div className="w-12 h-12 rounded-2xl bg-white/5 border border-white/10 shrink-0 overflow-hidden flex items-center justify-center text-base font-extrabold">
                                {p.avatar ? <img src={p.avatar} alt="" referrerPolicy="no-referrer" className="w-full h-full object-cover" /> : trUpper(p.name.charAt(0))}
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-1.5">
                                  <span className="text-sm font-bold truncate">{p.name}</span>
                                  {p.isElite && <Zap size={12} className="text-[#FACC15] shrink-0" />}
                                </div>
                                <div className="flex items-center gap-2 mt-0.5 text-[0.6875rem] text-ink-4">
                                  <span className="flex items-center gap-1"><Star size={11} className="fill-white/60 text-white/60" />{p.rating.toFixed(1)}</span>
                                  {p.zone && <><span className="text-ink-4">·</span><span className="truncate capitalize">{p.zone}</span></>}
                                </div>
                              </div>
                              <div className="text-right shrink-0">
                                <div className="font-numeric text-sm font-extrabold" style={{ color: accent }}>{money(p.fee)}</div>
                                <div className="text-[0.625rem] font-bold uppercase text-ink-4 tracking-widest">bedel</div>
                              </div>
                              <span className="w-6 h-6 shrink-0 rounded-full border-2 flex items-center justify-center"
                                style={on ? { background: accent, borderColor: accent, color: '#0A0E14' } : { borderColor: 'rgba(255,255,255,0.2)' }}>
                                {on && <Check size={14} strokeWidth={3} />}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </>
                );
              })()}
            </div>

            <div className="shrink-0 px-5 pt-3.5 pb-safe border-t border-white/5 bg-[#0A0E14]">
              {offers.length > 0 && (
                <p className="mb-2 text-center text-[0.6875rem] font-bold text-ink-4">
                  Teklifler maçı yayınlayıp kaporayı bloke ettiğinde gönderilir.
                </p>
              )}
              <button onClick={() => setSheet(null)}
                className="w-full h-14 rounded-[18px] bg-[#39FF14] text-[#0A0E14] text-sm font-extrabold uppercase tracking-wide shadow-[0_0_26px_rgba(57,255,20,0.26)] active:scale-[0.98] transition-transform flex items-center justify-center gap-2">
                <Zap size={16} />{offers.length > 0 ? 'Seçimi Onayla' : 'Hizmet Ekleme'}
              </button>
              <p className="mt-2 mb-1 text-center text-[0.6875rem] font-bold text-ink-4">{offerFeeText}</p>
            </div>
          </motion.div>
        )}

        {sheet === 'RULES' && (
          <motion.div key="rules" initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 28, stiffness: 300 }}
            className="absolute inset-0 z-[60] bg-[#0A0E14] flex flex-col">
            <header className="shrink-0 pt-safe border-b border-white/5">
              <div className="px-5 py-4 flex items-center justify-between">
                <h2 className="text-[1.0625rem] font-extrabold italic uppercase tracking-tight">Kapora &amp; İade</h2>
                <button onClick={() => setSheet(null)} aria-label="Kapat" className="w-[42px] h-[42px] rounded-full bg-white/5 border border-white/5 flex items-center justify-center"><X size={18} /></button>
              </div>
            </header>
            <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar p-5 pb-10 flex flex-col gap-3">
              <div className="rounded-[20px] border border-[#FACC15]/25 bg-[#FACC15]/5 p-[18px] flex items-center justify-between gap-3.5">
                <div>
                  <p className="text-[0.625rem] font-extrabold uppercase tracking-[0.16em] text-[#FACC15]/70">Bu maçın kaporası</p>
                  <p className="font-numeric mt-1 text-3xl font-extrabold text-[#FACC15]">{seeded ? money(0) : money(deposit)}</p>
                </div>
                <div className="text-right">
                  <p className="text-[0.625rem] font-extrabold uppercase tracking-[0.16em] text-ink-4">Cüzdan bakiyen</p>
                  <p className={`font-numeric mt-1 text-[1.1875rem] font-extrabold ${missing > 0 && !seeded ? 'text-red-400' : 'text-[#39FF14]'}`}>{money(spendable)}</p>
                  <p className={`mt-0.5 text-[0.6875rem] font-extrabold ${missing > 0 && !seeded ? 'text-red-400' : 'text-[#39FF14]'}`}>
                    {seeded ? 'Gerekmiyor' : missing > 0 ? `${money(missing)} eksik` : 'Yeterli ✓'}
                  </p>
                </div>
              </div>
              {[
                { n: '1', t: 'Kapora cüzdanından bloke edilir', b: 'Yayınladığın anda tutar güvenceye alınır — para çekilmez, saha sana kilitlenir.' },
                { n: '2', t: `Maç ${threshold} oyuncuda kesinleşir`, b: 'Toplam kadronun 2 eksiği kadar oyuncu katıldığında maç aktifleşir ve kapora tahsil edilir.' },
                { n: '3', t: 'Maç dolunca payın dışındaki tutar döner', b: deposit != null && perPerson != null ? `${money(deposit)} − ${money(perPerson)} = ${money(Math.max(0, deposit - perPerson))} cüzdanına iade edilir; sen de herkes gibi yalnız kendi payını ödersin.` : 'Sen de herkes gibi yalnız kendi payını ödersin; kalanı iade edilir.' },
                { n: '4', t: 'Maç dolmazsa tam iade', b: 'Kadro eşiğe ulaşmazsa maç iptal olur ve blokaj kesintisiz çözülür. 24 saatten az kala kaptan iptalinde iade yapılmaz.' },
                // IP-04 — sunucu karşılığı: app_config.match_leave_free_hours (24).
                // Kaptan iptali kuralıyla bilerek aynı sayı.
                { n: '5', t: 'Oyuncu ayrılması — iade kademesi', b: 'Kadrodaki bir oyuncu maça 24 saatten fazla varken ayrılırsa ödediği tutar cüzdanına döner. 6–24 saat kala %50 iade edilir, 6 saatten az kala iade yapılmaz. Tam iade penceresi kapandıktan sonra ayrılanın güvenilirlik puanı düşer; sana bildirim gider, boşalan yer vitrine açılır.' },
              ].map(r => (
                <div key={r.n} className="flex gap-3 rounded-[18px] border border-white/[0.08] bg-white/[0.03] p-4">
                  <div className="font-numeric w-9 h-9 rounded-xl bg-[#39FF14]/10 border border-[#39FF14]/25 text-[#39FF14] text-sm font-extrabold flex items-center justify-center shrink-0">{r.n}</div>
                  <div className="min-w-0">
                    <p className="text-[0.8125rem] font-extrabold leading-tight">{r.t}</p>
                    <p className="mt-1.5 text-[0.6875rem] leading-relaxed text-white/55">{r.b}</p>
                  </div>
                </div>
              ))}
              <button onClick={() => setSheet(null)}
                className="mt-1 w-full h-[52px] rounded-2xl bg-[#FACC15] text-[#0A0E14] text-sm font-extrabold italic uppercase active:scale-[0.98] transition-transform">
                Anladım
              </button>
            </div>
          </motion.div>
        )}

        {sheet === 'SUCCESS' && result && (
          <motion.div key="success" initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 28, stiffness: 300 }}
            className="absolute inset-0 z-[60] bg-[#0A0E14] flex flex-col px-5 pt-safe pb-safe">
            <div className="flex-1 flex flex-col items-center justify-center gap-5 min-h-0 overflow-y-auto custom-scrollbar">
              <motion.div initial={{ scale: 0.4, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
                transition={{ type: 'spring', damping: 14 }}
                className="w-[92px] h-[92px] rounded-full bg-[#39FF14]/[0.12] border-2 border-[#39FF14]/45 flex items-center justify-center text-[#39FF14] shadow-[0_0_44px_rgba(57,255,20,0.22)] shrink-0">
                <Check size={42} strokeWidth={2.4} />
              </motion.div>
              <div className="text-center">
                <h2 className="text-[1.625rem] font-extrabold italic uppercase tracking-tight">Maç yayında!</h2>
                <p className="mt-2 text-[0.8125rem] font-semibold text-white/50">{venueTxt} · {whenTxt}</p>
                {invited.length > 0 && <p className="mt-1 text-[0.6875rem] font-bold text-[#39FF14]">{invited.length} arkadaşına davet gönderildi</p>}
              </div>
              <div className="w-full rounded-[22px] border border-white/[0.08] bg-white/[0.03] p-[18px] flex flex-col gap-3.5">
                <div className="flex items-center justify-between">
                  <span className="text-[0.625rem] font-extrabold uppercase tracking-[0.14em] text-ink-4">Kapora</span>
                  <span className="font-numeric text-[0.9375rem] font-extrabold text-[#FACC15]">
                    {result.deposit > 0 ? `${money(result.deposit)} bloke` : 'Gerekmedi'}
                  </span>
                </div>
                <div className="h-px bg-white/[0.06]" />
                <div className="flex items-start gap-2.5">
                  <Undo2 size={14} className="text-[#39FF14] shrink-0 mt-0.5" />
                  <p className="text-[0.6875rem] leading-relaxed text-white/55">
                    {result.deposit > 0
                      ? `Maç dolduğunda ${money(Math.max(0, result.deposit - result.perPerson))} cüzdanına döner — sen de yalnız ${money(result.perPerson)} kendi payını ödemiş olursun. Maç dolmazsa tamamı iade.`
                      : `Kişi başı ücret ${money(result.perPerson)} — oyuncular katıldıkça ödemeler güvenceye alınır.`}
                  </p>
                </div>
              </div>
              {result.privateCode && (
                <div className="w-full">
                  <div className="w-full rounded-[22px] border border-dashed border-[#FACC15]/40 bg-[#FACC15]/5 px-[18px] py-4 flex items-center justify-between gap-3">
                    <div>
                      <p className="text-[0.625rem] font-extrabold uppercase tracking-[0.16em] text-[#FACC15]/70">Davet kodu</p>
                      <p className="font-numeric mt-1 text-[1.4375rem] font-bold tracking-[0.16em] text-[#FACC15]">{result.privateCode}</p>
                    </div>
                    <button onClick={copyCode} aria-label="Kodu kopyala"
                      className="w-11 h-11 rounded-[14px] border border-[#FACC15]/30 bg-[#FACC15]/10 text-[#FACC15] flex items-center justify-center shrink-0 active:scale-95 transition-transform">
                      <Copy size={17} />
                    </button>
                  </div>
                  <p className={`mt-2 text-center text-[0.6875rem] font-bold h-3.5 ${copied ? 'text-[#39FF14]' : 'text-ink-4'}`}>
                    {copied ? 'Kod kopyalandı ✓' : 'Kodu paylaş, rakip tarafı kendisi katılsın'}
                  </p>
                </div>
              )}
            </div>
            <div className="shrink-0 flex flex-col gap-2.5 py-4">
              <button onClick={shareInvite}
                className="w-full h-14 rounded-[18px] bg-[#39FF14] text-[#0A0E14] text-sm font-extrabold uppercase tracking-wide shadow-[0_0_28px_rgba(57,255,20,0.28)] flex items-center justify-center gap-2 active:scale-[0.98] transition-transform">
                <Share2 size={16} strokeWidth={2.2} /> Davet bağlantısını paylaş
              </button>
              <button onClick={goLobby}
                className="w-full h-[52px] rounded-2xl border border-white/[0.12] bg-white/[0.04] text-[0.8125rem] font-extrabold uppercase tracking-wide active:scale-[0.98] transition-transform">
                Maç lobisine git
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Cüzdan yükleme overlay'i — form kaybolmadan */}
      {sheet === 'TOPUP' && createPortal(
        <motion.div initial={{ y: '100%' }} animate={{ y: 0 }} transition={{ type: 'spring', damping: 25, stiffness: 300 }}
          className="fixed inset-0 z-[70] bg-[#0A0E14] overflow-y-auto overscroll-contain custom-scrollbar">
          <Suspense fallback={<div className="h-full min-h-screen flex items-center justify-center"><Spinner /></div>}>
            <WalletScreen onBack={() => {
              setSheet(null);
              getWalletSummary().then(s => { setWallet(s); if ((s?.spendableBalance ?? 0) >= (deposit ?? 0)) setMissingTL(0); }).catch(() => {});
            }} />
          </Suspense>
        </motion.div>,
        document.body,
      )}
    </div>
  );
};

export default MatchCreate;
