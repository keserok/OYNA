import React, { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import {
  ArrowLeft, RefreshCw, Calendar, Clock, ChevronDown, ChevronRight, AlertTriangle,
  CheckCircle2, XCircle, Loader2, MapPin, Swords, Navigation, Repeat, LogOut, QrCode,
  AlertCircle, Info,
} from 'lucide-react';
import { AppView } from '../types';
import { useAppStore } from '../store';
import { supabase } from '../supabaseClient';
import { useMyAgenda, type MyAgendaItem } from '../hooks/useMyAgenda';
import { useCountdown } from '../hooks/useCountdown';
import {
  getMatchDetails, previewLeaveMatch, leaveMatchSlot, leaveQuoteMessage,
  type LeaveMatchQuote,
} from '../services/matchService';
import {
  cancelMyBooking, previewBookingCancel, shortTime, toPlayerErrorMessage,
  type MyBooking, type CancelResult, type CancelPreview,
} from '../services/playerBookingService';
import { formatTRY, formatTRYWithSymbol } from '../utils/formatTRY';
import { showToast } from '../components/common/GlobalToast';
import { formatCapacityRange } from '../shared/pitchShowcaseMapper';
import { formatMatchDuration } from '../shared/matchTiming';
import SegmentedTabs from '../components/ui/SegmentedTabs';
import SkeletonList from '../components/ui/SkeletonList';
import { MODAL_BACKDROP, MODAL_CARD } from '../components/common/motion';
import { writeTicketCache } from '../utils/ticketCache';

// ═════════════════════════════════════════════════════════════════════════════
// MAÇLARIM HUB — "bilet kartı" tasarımı (Tur 3 · 2b nihai)
// Tek ızgara: maçlar + saha kiralamaları AYNI kart dilinde, yapışkan gün
// başlıklarıyla kronolojik akar. Kart → alt sayfa (bottom sheet) → aksiyonlar.
// Veri: useMyAgenda (matches store realtime + pitch_bookings RLS) — mock yok;
// tüm aksiyonlar gerçek RPC'lere bağlı (iptal önizlemesi/ayrılma iadesi sunucudan).
// ═════════════════════════════════════════════════════════════════════════════

type Segment = 'ALL' | 'MATCHES' | 'BOOKINGS';

const AY = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];

const firstTimeToken = (t: string): string => (t || '').trim().split(' ')[0];

// Gün başlığı: Bugün/Yarın önde + tarih; diğer günlerde tarih önde + gün adı.
const dayHeading = (when: Date | null): { primary: string; secondary: string } => {
  if (!when || isNaN(when.getTime())) return { primary: 'Tarih Belirsiz', secondary: '' };
  const startOf = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const diff = Math.round((startOf(when) - startOf(new Date())) / 86400000);
  const tarih = `${when.getDate()} ${AY[when.getMonth()]}`;
  if (diff === 0) return { primary: 'Bugün', secondary: tarih };
  if (diff === 1) return { primary: 'Yarın', secondary: tarih };
  const gun = when.toLocaleDateString('tr-TR', { weekday: 'long' });
  return { primary: tarih, secondary: gun };
};

const dayKey = (when: Date | null): string =>
  !when || isNaN(when.getTime()) ? 'zz-belirsiz' : when.toISOString().slice(0, 10);

// ── Maç türetmeleri (iki taraf birden — tek sistem) ──────────────────────────
const matchStats = (m: MyAgendaItem & { kind: 'MATCH' }) => {
  const all = [...(m.match.slots || []), ...(m.match.awaySlots || [])];
  const total = all.length;
  const taken = all.filter(s => s?.status === 'TAKEN').length;
  return { total, taken, open: total - taken };
};

// ═════════════════ BİLET KARTI ═══════════════════════════════════════════════

const TicketCard: React.FC<{ item: MyAgendaItem; currentUserUid: string; onOpen: () => void; dim?: boolean }> = ({
  item, currentUserUid, onOpen, dim,
}) => {
  const isMatch = item.kind === 'MATCH';

  let rail = isMatch ? '#39FF14' : '#FACC15';
  let typeLabel: React.ReactNode;
  let statusNode: React.ReactNode;
  let time: string;
  let title: string;
  let venue: string;
  let footLeft: React.ReactNode = null;
  let footRight: React.ReactNode = null;
  let cancelNote: string | null = null;
  // Saatin yanındaki süre notu. Rezervasyonda gereksiz (başlangıç–bitiş zaten
  // süreyi gösterir); maçta GERÇEK veriden gelir (matches.duration_minutes).
  let timeNote: string | null = null;

  if (isMatch) {
    const m = item.match;
    const st = matchStats(item as MyAgendaItem & { kind: 'MATCH' });
    const isCaptain = m.creatorId === currentUserUid;
    typeLabel = <span className="text-[0.625rem] font-extrabold uppercase tracking-[0.18em] text-[#39FF14]">{isCaptain ? 'Maç · Kaptan' : 'Maç'}</span>;
    if (m.status === 'CANCELLED') {
      rail = '#F87171';
      statusNode = <span className="flex items-center gap-1 text-[0.625rem] font-extrabold uppercase tracking-[0.08em] text-[#F87171]"><XCircle size={11} />İptal Edildi</span>;
    } else if (m.status === 'COMPLETED') {
      statusNode = <span className="flex items-center gap-1 text-[0.625rem] font-extrabold uppercase tracking-[0.08em] text-ink-4"><CheckCircle2 size={11} />Oynandı</span>;
    } else {
      // Kaleci uyarısı BİLEREK yok: boş kaleci slotu bir sorun değildir —
      // profesyonel kaleci isteyen kaptan Kaleci Kiralama'dan teklif gönderir.
      // Bu köşe her maçta aynı bilgiyi verir: kadro doluluğu.
      statusNode = <span className="font-numeric text-[0.625rem] font-extrabold uppercase tracking-[0.08em] text-ink-4">{st.taken}/{st.total} oyuncu</span>;
    }
    time = m.time || '—';
    timeNote = formatMatchDuration(m);
    title = m.title || 'Maç';
    venue = [m.location, (m as { courtName?: string }).courtName].filter(Boolean).join(' · ') || '—';
    footLeft = st.open > 0 ? (
      <span className="flex items-center gap-[7px] text-[0.6875rem] font-bold text-ink-4">
        {st.open} kişi eksik
        <span className="inline-block w-[52px] h-[3px] rounded-full bg-white/10 overflow-hidden relative">
          <span className="absolute inset-0 rounded-full bg-[#39FF14]" style={{ width: `${st.total ? Math.round((st.taken / st.total) * 100) : 0}%` }} />
        </span>
      </span>
    ) : (
      <span className="flex items-center gap-[5px] text-[0.6875rem] font-bold text-ink-4"><CheckCircle2 size={11} className="text-[#39FF14]" />Kadro tamam</span>
    );
    footRight = <span className="font-numeric text-[0.75rem] font-bold text-[#FACC15]">{Number(m.price) > 0 ? `₺${Number(m.price).toLocaleString('tr-TR')}` : 'Ücretsiz'}</span>;
  } else {
    const b = item.booking;
    if (b.status === 'CANCELLED') {
      rail = '#F87171';
      statusNode = <span className="flex items-center gap-1 text-[0.625rem] font-extrabold uppercase tracking-[0.08em] text-[#F87171]"><XCircle size={11} />İptal Edildi</span>;
      cancelNote = b.cancellation_reason;
    } else if (b.status === 'CONFIRMED') {
      statusNode = <span className="flex items-center gap-[5px] text-[0.625rem] font-extrabold uppercase tracking-[0.08em] text-[#39FF14]"><span className="w-[5px] h-[5px] rounded-full bg-[#39FF14]" />Onaylandı</span>;
    } else {
      statusNode = <span className="flex items-center gap-1 text-[0.625rem] font-extrabold uppercase tracking-[0.08em] text-[#FACC15]"><Clock size={11} />Onay bekliyor</span>;
    }
    typeLabel = <span className="text-[0.625rem] font-extrabold uppercase tracking-[0.18em] text-[#FACC15]">Rezervasyon</span>;
    time = `${shortTime(b.start_time)}${b.end_time ? ` – ${shortTime(b.end_time)}` : ''}`;
    title = b.pitches?.name || 'Saha Rezervasyonu';
    venue = [b.pitches?.district, b.courts?.name].filter(Boolean).join(' · ') || '—';
    const remaining = Math.max((b.deposit_amount || 0) - (b.paid_amount || 0), 0);
    footLeft = b.status === 'CANCELLED' ? null : remaining <= 0 && (b.deposit_amount || 0) > 0 ? (
      <span className="flex items-center gap-[5px] text-[0.6875rem] font-bold text-ink-4"><CheckCircle2 size={11} className="text-[#39FF14]" />Kapora ödendi</span>
    ) : remaining > 0 ? (
      <span className="flex items-center gap-[5px] text-[0.6875rem] font-bold text-[#FACC15]"><AlertTriangle size={11} />Kapora bekliyor</span>
    ) : null;
    footRight = b.price ? <span className="font-numeric text-[0.75rem] font-bold text-[#FACC15]">₺{Number(b.price).toLocaleString('tr-TR')}</span> : null;
  }

  return (
    <button
      onClick={onOpen}
      className={`relative overflow-hidden block w-full text-left bg-[#161B22] border border-white/[0.06] rounded-[20px] pl-6 pr-10 pt-4 pb-3.5 text-white active:scale-[0.985] transition-transform ${dim ? 'opacity-60' : ''}`}
    >
      <div className="absolute left-0 top-0 bottom-0 w-[3px]" style={{ background: rail, opacity: 0.8 }} />
      <ChevronRight size={18} className="absolute right-3.5 top-1/2 -mt-[9px] text-ink-4" />
      <div className="flex items-center justify-between gap-2.5 h-[18px]">
        {typeLabel}
        {statusNode}
      </div>
      <p className="font-numeric mt-2.5 text-[1.25rem] font-bold tracking-[-0.02em] leading-none">
        {time}
        {timeNote && (
          <span className="ml-2 text-[0.6875rem] font-bold tracking-normal text-ink-4">{timeNote}</span>
        )}
      </p>
      <p className="mt-2.5 text-[0.9375rem] font-extrabold leading-tight truncate">{title}</p>
      <p className="mt-1 text-[0.75rem] text-gray-400 flex items-center gap-[5px] truncate"><MapPin size={12} className="shrink-0" />{venue}</p>
      {cancelNote && <p className="mt-3 text-[0.6875rem] italic text-red-300/80">{cancelNote}</p>}
      {(footLeft || footRight) && (
        <div className="mt-3.5 pt-[11px] border-t border-white/[0.06] flex items-center justify-between gap-2.5 min-h-[16px]">
          {footLeft ?? <span />}
          {footRight}
        </div>
      )}
    </button>
  );
};

// ═════════════════ SIRADAKİ ETKİNLİK HERO ════════════════════════════════════

const NextEventHero: React.FC<{ item: MyAgendaItem; currentUserUid: string; onOpen: () => void }> = ({ item, currentUserUid, onOpen }) => {
  const isMatch = item.kind === 'MATCH';
  const date = isMatch ? item.match.date : item.booking.booking_date;
  const time = isMatch ? firstTimeToken(item.match.time) : shortTime(item.booking.start_time);
  const countdown = useCountdown(date, time);
  const title = isMatch ? (item.match.title || 'Maç') : (item.booking.pitches?.name || 'Saha Rezervasyonu');
  const venue = isMatch
    ? [item.match.location, (item.match as { courtName?: string }).courtName].filter(Boolean).join(' · ')
    : [item.booking.pitches?.district, item.booking.courts?.name].filter(Boolean).join(' · ');
  const heading = dayHeading(item.when);
  // Maçta saatin yanına GERÇEK süre (duration_minutes) eklenir; rezervasyonda
  // başlangıç–bitiş aralığı zaten süreyi anlatır.
  const timeRange = isMatch
    ? [item.match.time, formatMatchDuration(item.match)].filter(Boolean).join(' · ')
    : `${shortTime(item.booking.start_time)} – ${shortTime(item.booking.end_time)}`;

  let chip: React.ReactNode;
  if (isMatch) {
    const st = matchStats(item as MyAgendaItem & { kind: 'MATCH' });
    chip = st.open === 0 ? (
      <span className="flex items-center gap-[5px] px-2.5 py-1 rounded-full border border-[#39FF14]/30 bg-[#39FF14]/10 text-[#39FF14] text-[0.625rem] font-extrabold uppercase tracking-[0.08em]"><CheckCircle2 size={11} />Kadro Tamam</span>
    ) : (
      <span className="font-numeric px-2.5 py-1 rounded-full border border-white/12 bg-white/[0.06] text-white/70 text-[0.625rem] font-extrabold uppercase tracking-[0.08em]">{st.taken}/{st.total} oyuncu</span>
    );
  } else {
    chip = item.booking.status === 'CONFIRMED' ? (
      <span className="flex items-center gap-[5px] px-2.5 py-1 rounded-full border border-[#39FF14]/30 bg-[#39FF14]/10 text-[#39FF14] text-[0.625rem] font-extrabold uppercase tracking-[0.08em]"><CheckCircle2 size={11} />Onaylandı</span>
    ) : (
      <span className="flex items-center gap-[5px] px-2.5 py-1 rounded-full border border-[#FACC15]/30 bg-[#FACC15]/10 text-[#FACC15] text-[0.625rem] font-extrabold uppercase tracking-[0.08em]"><Clock size={11} />Onay bekliyor</span>
    );
  }

  return (
    <motion.button
      type="button"
      onClick={onOpen}
      whileTap={{ scale: 0.985 }}
      className="relative overflow-hidden w-full text-left rounded-[22px] bg-[#12161D] border border-white/[0.07] pl-6 pr-5 pt-5 pb-[18px] text-white"
    >
      <div className="absolute left-0 top-0 bottom-0 w-1 bg-[#FACC15]" />
      <div className="absolute -top-14 -right-11 w-[200px] h-[200px] rounded-full bg-[#FACC15] opacity-[0.11] blur-[54px] pointer-events-none" />
      <div className="relative flex items-center justify-between gap-3 h-[22px]">
        <span className="text-[0.625rem] font-extrabold uppercase tracking-[0.22em] text-[#FACC15]">Sıradaki Etkinlik</span>
        {chip}
      </div>
      <p className="relative mt-3.5 text-[1.375rem] font-extrabold italic uppercase tracking-[-0.03em] leading-[1.05] truncate">{title}</p>
      <p className="relative mt-1.5 text-[0.75rem] text-white/50 font-semibold flex items-center gap-[5px] truncate"><MapPin size={12} className="shrink-0" />{venue || '—'}</p>
      <div className="relative mt-[18px] pt-4 border-t border-dashed border-white/12 flex items-end justify-between gap-3">
        <div>
          <p className="font-numeric m-0 text-[0.9375rem] font-bold leading-[1.25]">{heading.primary === 'Bugün' || heading.primary === 'Yarın' ? `${heading.secondary} · ${heading.primary}` : heading.primary}</p>
          <p className="font-numeric m-0 text-[0.9375rem] font-bold leading-[1.25] text-white/55">{timeRange}</p>
        </div>
        <div className="text-right">
          <p className="m-0 text-[0.625rem] font-extrabold uppercase tracking-[0.2em] text-ink-4">Kalan süre</p>
          <p className="font-numeric mt-[5px] mb-0 text-[1.875rem] font-bold leading-[0.85] tracking-[-0.02em]">{countdown || '—'}</p>
        </div>
      </div>
    </motion.button>
  );
};

// ═════════════════ ANA BİLEŞEN ═══════════════════════════════════════════════

interface MyMatchesHubProps {
  onNavigate: (view: AppView) => void;
}

const MyMatchesHub: React.FC<MyMatchesHubProps> = ({ onNavigate }) => {
  const reduceMotion = useReducedMotion();
  const { setSelectedMatch, setMatchCreateSeed, navigateTo, applyMatchLocal, setNavOverlayOpen } = useAppStore();
  const { items, past, counts, nextItem, bookingsLoading, bookingsError, refetchBookings, currentUserUid } = useMyAgenda();

  const [segment, setSegment] = useState<Segment>(
    () => useAppStore.getState().myMatchesInitialSegment ?? 'ALL'
  );
  useEffect(() => {
    const st = useAppStore.getState();
    if (st.myMatchesInitialSegment) st.setMyMatchesInitialSegment(null);
  }, []);

  const [showPast, setShowPast] = useState(false);
  // Alt sayfa: dokunulan bilet (maç veya rezervasyon)
  const [sheet, setSheet] = useState<MyAgendaItem | null>(null);

  // F2.1: "Maçı Değerlendir" CTA'sı — kullanıcının zaten puanladığı maçlarda
  // gizlenir (player_ratings kendi satırları RLS ile okunabilir).
  const [evaluatedMatchIds, setEvaluatedMatchIds] = useState<Set<string>>(new Set());
  useEffect(() => {
    let cancelled = false;
    if (!currentUserUid) { setEvaluatedMatchIds(new Set()); return; }
    supabase.from('player_ratings').select('match_id').eq('rater_id', currentUserUid)
      .then(({ data }) => {
        if (!cancelled) setEvaluatedMatchIds(new Set((data ?? []).map((r: { match_id: string }) => r.match_id)));
      });
    return () => { cancelled = true; };
  }, [currentUserUid]);

  // ── Rezervasyon iptali — iade önizlemesi SUNUCUDAN gelir, FE formül uydurmaz ──
  const [cancelTarget, setCancelTarget] = useState<MyBooking | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [cancelResult, setCancelResult] = useState<CancelResult | null>(null);
  const [cancelError, setCancelError] = useState<string | null>(null);
  const [cancelPreview, setCancelPreview] = useState<CancelPreview | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState(false);

  useEffect(() => {
    if (!cancelTarget) { setCancelPreview(null); setPreviewError(false); return; }
    let alive = true;
    setPreviewLoading(true);
    setPreviewError(false);
    previewBookingCancel(cancelTarget.id)
      .then((p) => { if (alive) setCancelPreview(p); })
      .catch(() => { if (alive) setPreviewError(true); })
      .finally(() => { if (alive) setPreviewLoading(false); });
    return () => { alive = false; };
  }, [cancelTarget]);

  const handleCancel = async () => {
    if (!cancelTarget) return;
    setCancelling(true);
    setCancelError(null);
    try {
      const result = await cancelMyBooking(cancelTarget.id);
      setCancelResult(result);
      setCancelTarget(null);
      await refetchBookings();
    } catch (err) {
      setCancelError(toPlayerErrorMessage(err));
    } finally {
      setCancelling(false);
    }
  };

  // ── Maçtan ayrılma — IP-04 sözleşmesi (MatchJoin lobisiyle AYNI kaynak) ───
  const [leaveTarget, setLeaveTarget] = useState<MyAgendaItem | null>(null);
  const [leaveQuote, setLeaveQuote] = useState<LeaveMatchQuote | null>(null);
  const [leaveQuoteLoading, setLeaveQuoteLoading] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [leaveError, setLeaveError] = useState<string | null>(null);

  useEffect(() => {
    if (!leaveTarget || leaveTarget.kind !== 'MATCH') {
      setLeaveQuote(null); setLeaveQuoteLoading(false); return;
    }
    let alive = true;
    setLeaveQuoteLoading(true);
    previewLeaveMatch(leaveTarget.match.id)
      .then(q => { if (alive) setLeaveQuote(q); })
      .catch(e => { console.error('[MyMatchesHub] ayrılma önizlemesi alınamadı:', e); if (alive) setLeaveQuote(null); })
      .finally(() => { if (alive) setLeaveQuoteLoading(false); });
    return () => { alive = false; };
  }, [leaveTarget]);

  const handleLeaveMatch = async () => {
    if (!leaveTarget || leaveTarget.kind !== 'MATCH' || !currentUserUid) return;
    setLeaving(true);
    setLeaveError(null);
    try {
      await leaveMatchSlot(leaveTarget.match.id, currentUserUid);
      const fresh = await getMatchDetails(leaveTarget.match.id);
      if (fresh) applyMatchLocal(fresh);
      // IP-04 — sonuç sessiz kalmaz: ne yandı, ne döndü, kullanıcı görsün.
      if (leaveQuote?.late) {
        const geri = leaveQuote.refundable > 0
          ? `${formatTRYWithSymbol(leaveQuote.refundable)} cüzdanına döndü, ` : '';
        const yanan = leaveQuote.forfeited > 0
          ? `${formatTRYWithSymbol(leaveQuote.forfeited)} iade edilmedi, ` : '';
        showToast(`Maçtan ayrıldın. ${geri}${yanan}güvenilirlik puanın ${leaveQuote.penalty} düştü.`, 'error');
      } else if ((leaveQuote?.refundable ?? 0) > 0) {
        showToast(`Maçtan ayrıldın. ${formatTRYWithSymbol(leaveQuote!.refundable)} cüzdanına geri döndü.`, 'success');
      } else {
        showToast('Maçtan ayrıldın.', 'success');
      }
      setLeaveTarget(null);
    } catch (e) {
      setLeaveError(e instanceof Error && e.message.includes('kayıtlı değil')
        ? 'Bu maçta ayrılabileceğin bir kaydın yok.'
        : 'Maçtan ayrılamadın. İnternetin zayıf olabilir, tekrar dene.');
    } finally {
      setLeaving(false);
    }
  };

  // ── Alt sayfa/onay açıkken alt bar yol verir; kapanınca ve görünümden
  // çıkınca geri gelir (unmount temizliği güvence).
  const overlayOpen = !!(sheet || cancelTarget || cancelResult || leaveTarget);
  useEffect(() => {
    setNavOverlayOpen(overlayOpen);
    return () => setNavOverlayOpen(false);
  }, [overlayOpen, setNavOverlayOpen]);

  // ── Rezervasyon aksiyonları (mevcut sözleşmeler) ──────────────────────────
  const handlePayDeposit = (b: MyBooking) => {
    const remaining = Math.max((b.deposit_amount || 0) - (b.paid_amount || 0), 0);
    if (remaining <= 0) return;
    const store = useAppStore.getState();
    const prettyDate = (() => {
      try { return new Date(`${b.booking_date}T12:00:00`).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' }); }
      catch { return b.booking_date; }
    })();
    const timeText = `${shortTime(b.start_time)}${b.end_time ? ` - ${shortTime(b.end_time)}` : ''}`.trim();
    // Kort format aralığı rozeti ("6v6–8v8") — null ise kort adı yalın kalır.
    const courtRange = formatCapacityRange(b.courts?.min_capacity, b.courts?.max_capacity, b.courts?.capacity);
    store.setPaymentContext({
      kind: 'BOOKING_DEPOSIT',
      badge: 'SAHA KİRALAMA',
      // BULGU-088 — kademe bu rezervasyonun KENDİ tesisinden gelir; store'daki
      // bookingPitch bu akışta ya boş ya da Sahalar'da bakılan BAŞKA tesisti.
      pitchId: b.pitch_id,
      title: b.pitches?.name || 'Saha Rezervasyonu',
      subtitle: `${b.courts?.name ? `${b.courts.name} · ` : ''}${b.booking_date} · ${shortTime(b.start_time)}`,
      details: [
        ...(b.courts?.name ? [{ icon: 'court' as const, text: `${b.courts.name}${courtRange ? ` · ${courtRange}` : ''}` }] : []),
        { icon: 'calendar' as const, text: prettyDate },
        ...(timeText ? [{ icon: 'clock' as const, text: timeText }] : []),
      ],
      amount: remaining,
      amountLabel: 'Ödenecek Kapora',
      amountHint: b.price ? `Saha ücreti ₺${b.price.toLocaleString('tr-TR')} · kalan tesiste ödenir` : undefined,
      isDeposit: true,
      allowBalance: true,
      successTitle: 'Kapora Onaylandı!',
      successSubtitle: 'Rezervasyon güvende',
      infoNote: 'Kapora rezervasyonunu güvenceye alır. İptal koşulları tesis politikasına göre uygulanır.',
      bookingId: b.id,
    });
    navigateTo('PAYMENT');
  };

  const handleConvertToMatch = (b: MyBooking) => {
    setMatchCreateSeed({
      pitchId: b.pitch_id,
      pitchName: b.pitches?.name || 'Saha',
      district: b.pitches?.district || '',
      date: b.booking_date,
      time: shortTime(b.start_time),
      price: b.price || 0,
      // Atomik çevirme: saha/saat rezervasyondan kilitlenir, ikinci kapora alınmaz
      bookingId: b.id,
      courtId: b.court_id || undefined,
    });
    navigateTo('MATCH_CREATE');
  };

  const handleDirections = (query: string) => {
    const url = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  const openMatchLobby = (item: MyAgendaItem) => {
    if (item.kind !== 'MATCH') return;
    useAppStore.getState().setLobbyMode('MANAGE');
    setSelectedMatch(item.match);
    setSheet(null);
    onNavigate('MATCH_JOIN');
  };

  // ── Segment + gün gruplama ────────────────────────────────────────────────
  const bySegment = (list: MyAgendaItem[]) =>
    segment === 'ALL' ? list : list.filter(i => (segment === 'MATCHES' ? i.kind === 'MATCH' : i.kind === 'BOOKING'));
  const visible = useMemo(() => bySegment(items), [items, segment]);
  const visiblePast = useMemo(() => bySegment(past), [past, segment]);

  const dayGroups = useMemo(() => {
    const map = new Map<string, { heading: { primary: string; secondary: string }; items: MyAgendaItem[] }>();
    for (const it of visible) {
      const k = dayKey(it.when);
      if (!map.has(k)) map.set(k, { heading: dayHeading(it.when), items: [] });
      map.get(k)!.items.push(it);
    }
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b)).map(([, v]) => v);
  }, [visible]);

  const isInitialLoading = bookingsLoading && items.length === 0 && past.length === 0 && !bookingsError;
  const isFullyEmpty = !isInitialLoading && items.length === 0 && past.length === 0 && !bookingsError;

  const sheetBooking = sheet?.kind === 'BOOKING' ? sheet.booking : null;
  const sheetMatch = sheet?.kind === 'MATCH' ? sheet.match : null;
  const sheetMatchStats = sheet?.kind === 'MATCH' ? matchStats(sheet as MyAgendaItem & { kind: 'MATCH' }) : null;
  const sheetHeading = sheet ? dayHeading(sheet.when) : null;
  const bookingRemaining = sheetBooking ? Math.max((sheetBooking.deposit_amount || 0) - (sheetBooking.paid_amount || 0), 0) : 0;
  // F2.1: tamamlanmış ve henüz puanlanmamış maçta değerlendirme girişi açılır.
  const evaluable = (m: { status?: string; id: string } | null | undefined): boolean =>
    !!m && m.status === 'COMPLETED' && !evaluatedMatchIds.has(m.id);
  const sheetMatchEvaluable = evaluable(sheetMatch);

  // IP-14 · BULGU-105: değerlendirme kapısı VARSAYILAN KAPALI "Geçmiş & İptaller"
  // akordeonunun içinde, iptal edilmiş maçlarla aynı listede duruyordu — yani maç
  // sonu puanlama akışı pratikte hiç bulunamıyordu. Artık sayfanın EN ÜSTÜNDE.
  const awaitingEval = useMemo(
    () => past.filter((i): i is MyAgendaItem & { kind: 'MATCH' } => i.kind === 'MATCH' && evaluable(i.match)),
    [past, evaluatedMatchIds],
  );
  // Ayrılma yalnız gerçekten kaydı olan için: sahada oturuyor, slot satın almış veya yedekte.
  const sheetMatchLeaveable = !!sheetMatch && !!currentUserUid
    && !['CANCELLED', 'COMPLETED'].includes(sheetMatch.status as string)
    && (
      [...(sheetMatch.slots || []), ...(sheetMatch.awaySlots || [])].some(s =>
        (s as { occupant?: string })?.occupant === currentUserUid ||
        s?.player?.id === currentUserUid ||
        (s as { purchasedBy?: string })?.purchasedBy === currentUserUid)
      || (sheetMatch.reservePlayers || []).some(p => p?.id === currentUserUid)
    );

  return (
    <div className="h-full bg-[#0A0E14] text-white flex flex-col relative overflow-hidden font-sans selection:bg-[#FACC15] selection:text-black">
      <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/carbon-fibre.png')] opacity-15 mix-blend-overlay pointer-events-none" />

      {/* ── Başlık ── */}
      <header className="sticky top-0 z-30 bg-[#0A0E14]/[0.92] backdrop-blur-xl border-b border-white/5 pt-safe">
        <div className="px-4 py-3 flex items-center justify-between gap-3">
          {/* IP-14: Maçlarım artık alt menünün orta tuşu — sekme kökünde
              geri oku olmaz. */}
          <div className="text-center flex-1 min-w-0">
            <h1 className="text-lg font-extrabold text-white italic uppercase tracking-tighter leading-[1.2] truncate">Maçlarım</h1>
            <p className="font-numeric text-[0.625rem] text-ink-4 uppercase tracking-widest mt-1 truncate">
              {counts.matches} maç · {counts.bookings} rezervasyon
            </p>
          </div>
          <button
            onClick={() => { void refetchBookings(); }}
            aria-label="Yenile"
            className="w-11 h-11 flex items-center justify-center bg-[#161B22] rounded-full text-white/70 border border-white/5 hover:bg-white/10 active:scale-95 transition-all shrink-0"
          >
            <RefreshCw size={17} className={bookingsLoading ? 'animate-spin text-[#39FF14]' : ''} />
          </button>
        </div>
        <div className="px-4 pb-3">
          <SegmentedTabs
            layoutId="myMatchesSegment"
            items={[
              { id: 'ALL', label: 'Tümü' },
              { id: 'MATCHES', label: 'Maçlar' },
              { id: 'BOOKINGS', label: 'Saha Kiralamalarım' },
            ]}
            activeId={segment}
            onChange={(id) => setSegment(id as Segment)}
          />
        </div>
      </header>

      {/* ── İçerik ── */}
      {/* Kaydırma bu konteynerde: gün başlıkları header'ın hemen altına yapışır,
          kartlar yarı saydam alt barın altından akar (pb-36 bar payı). */}
      <main className="flex-1 min-h-0 px-4 pt-4 overflow-y-auto overscroll-contain custom-scrollbar pb-36 relative z-10">
        {bookingsError && (
          <div className="mb-4 flex items-center justify-between gap-3 px-4 py-3 rounded-2xl bg-red-950/30 border border-red-500/20">
            <p className="text-[0.6875rem] text-red-300 font-bold leading-snug">
              Rezervasyonlar yüklenemedi — maçların yine de listeleniyor.
            </p>
            <button
              onClick={() => { void refetchBookings(); }}
              className="shrink-0 px-3 py-2 min-h-[36px] rounded-xl bg-red-500/15 border border-red-500/30 text-red-200 text-[0.625rem] font-extrabold uppercase tracking-widest active:scale-95 transition-all"
            >
              Tekrar Dene
            </button>
          </div>
        )}

        {isInitialLoading ? (
          <SkeletonList rows={4} variant="card" />
        ) : isFullyEmpty ? (
          /* ── BOŞ HÂL — aynı kart dili ── */
          <>
            <div className="relative overflow-hidden rounded-[22px] bg-[#12161D]/70 border border-dashed border-white/[0.14] px-5 pt-[26px] pb-[22px] text-center">
              <div className="absolute left-0 top-0 bottom-0 w-1 bg-white/12" />
              <div className="absolute -top-[70px] left-1/2 -translate-x-1/2 w-[220px] h-[220px] rounded-full bg-[#39FF14] opacity-[0.08] blur-[58px] pointer-events-none" />
              <div className="relative w-[52px] h-[52px] mx-auto mb-4 rounded-2xl bg-[#39FF14]/[0.08] border border-[#39FF14]/25 flex items-center justify-center">
                <Calendar size={22} className="text-[#39FF14]" />
              </div>
              <h3 className="relative m-0 text-[1.1875rem] font-extrabold italic uppercase tracking-[-0.025em]">Henüz Etkinliğin Yok</h3>
              <p className="relative mt-2 mx-auto mb-0 text-[0.8125rem] text-white/50 leading-relaxed max-w-[252px]">
                Bir maça katıl ya da saha kirala — ajandan burada canlanır.
              </p>
              <div className="relative mt-5 pt-[18px] border-t border-dashed border-white/12 flex flex-col gap-2.5">
                <button
                  onClick={() => onNavigate('MATCH_DISCOVERY')}
                  className="w-full h-12 rounded-2xl bg-[#39FF14] text-[#0A0E14] text-xs font-extrabold uppercase tracking-[0.12em] shadow-[0_0_22px_rgba(57,255,20,0.22)] active:scale-95 transition-transform"
                >
                  Açık Maçlara Göz At
                </button>
                <button
                  onClick={() => onNavigate('PITCH_DISCOVERY')}
                  className="w-full h-12 rounded-2xl border border-white/10 text-white/70 text-xs font-extrabold uppercase tracking-[0.12em] hover:bg-white/5 active:scale-95 transition-all"
                >
                  Saha Kirala
                </button>
              </div>
            </div>

            {/* Önizleme iskeletleri — maçların böyle görünecek */}
            <div className="pt-[26px] pb-3 flex items-center gap-2.5">
              <span className="text-[0.625rem] font-extrabold uppercase tracking-[0.22em] text-white/[0.28]">Maçların böyle görünecek</span>
              <span className="flex-1 h-px bg-white/5" />
            </div>
            <div className="flex flex-col gap-3">
              {[{ c: 'rgba(250,204,21,.3)', o: 'opacity-50' }, { c: 'rgba(57,255,20,.3)', o: 'opacity-[0.28]' }].map((sk, i) => (
                <div key={i} className={`relative overflow-hidden border border-dashed border-white/[0.08] rounded-[20px] pl-6 pr-10 pt-4 pb-3.5 ${sk.o}`}>
                  <div className="absolute left-0 top-0 bottom-0 w-[3px]" style={{ background: sk.c }} />
                  <div className="flex items-center justify-between h-[18px]">
                    <span className="w-[70px] h-[7px] rounded-full" style={{ background: sk.c }} />
                    <span className="w-[52px] h-[7px] rounded-full bg-white/[0.07]" />
                  </div>
                  <div className="mt-3 w-[118px] h-3.5 rounded-md bg-white/[0.09]" />
                  <div className="mt-3 w-[96px] h-2.5 rounded bg-white/[0.07]" />
                  <div className="mt-2 w-[132px] h-2 rounded bg-white/5" />
                </div>
              ))}
            </div>
          </>
        ) : (
          <>
            {/* ═══ DEĞERLENDİRMENİ BEKLİYOR ═══
                Oynanmış ama henüz puanlanmamış maçlar. Puanlama penceresi
                sınırlı olduğu için bu bölüm listenin en üstünde durur. */}
            {awaitingEval.length > 0 && (
              <div className="mb-5">
                <div className="flex items-center gap-2.5 mb-3">
                  <span className="text-[0.625rem] font-extrabold uppercase tracking-[0.22em] text-warning">
                    Değerlendirmeni Bekliyor ({awaitingEval.length})
                  </span>
                  <span className="flex-1 h-px bg-warning-line" />
                </div>
                <div className="flex flex-col gap-2.5">
                  {awaitingEval.map((item) => (
                    <button
                      key={`eval-${item.id}`}
                      onClick={() => { setSelectedMatch(item.match); navigateTo('POST_MATCH_EVAL'); }}
                      className="w-full min-h-[64px] rounded-2xl bg-warning-bg border border-warning-line flex items-center justify-between px-4 py-3 text-left active:scale-[0.99] transition-transform"
                    >
                      <span className="min-w-0">
                        <span className="block text-sm font-extrabold text-ink truncate">
                          {item.match.title || item.match.location || 'Maç'}
                        </span>
                        <span className="block text-[0.6875rem] text-ink-3 font-bold mt-0.5">
                          Takım arkadaşlarını ve kaleci/hakemi puanla
                        </span>
                      </span>
                      <span className="text-warning font-extrabold shrink-0 ml-3">→</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Sıradaki etkinlik hero'su */}
            {nextItem && (
              <NextEventHero item={nextItem} currentUserUid={currentUserUid} onOpen={() => setSheet(nextItem)} />
            )}

            {/* Yapışkan gün başlıklı tek ızgara */}
            <AnimatePresence mode="popLayout">
              {dayGroups.length > 0 ? (
                <motion.div key={`list-${segment}`}>
                  {dayGroups.map((g, gi) => (
                    <div key={`${segment}-g${gi}`}>
                      <div className="sticky top-0 z-[5] bg-[#0A0E14] pt-[22px] pb-2.5 flex items-center gap-2.5">
                        <span className="text-[0.625rem] font-extrabold uppercase tracking-[0.22em] text-white/90">{g.heading.primary}</span>
                        <span className="font-numeric text-[0.6875rem] font-bold tracking-[0.06em] text-ink-4">{g.heading.secondary}</span>
                        <span className="flex-1 h-px bg-white/[0.07]" />
                      </div>
                      <div className="flex flex-col gap-3">
                        {g.items.map((item, index) => (
                          <motion.div
                            key={item.id}
                            initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 14 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.28, delay: Math.min(index * 0.05, 0.3) }}
                          >
                            <TicketCard item={item} currentUserUid={currentUserUid} onOpen={() => setSheet(item)} />
                          </motion.div>
                        ))}
                      </div>
                    </div>
                  ))}
                </motion.div>
              ) : (
                <motion.div key={`empty-${segment}`} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.2 }} className="pt-6">
                  <div className="rounded-[20px] border border-dashed border-white/10 bg-white/[0.02] px-5 py-8 text-center">
                    {segment === 'BOOKINGS' ? <Calendar size={28} className="mx-auto mb-3 text-ink-4" /> : <Clock size={28} className="mx-auto mb-3 text-ink-4" />}
                    <p className="text-sm font-extrabold uppercase tracking-wide text-white/70">
                      {segment === 'BOOKINGS' ? 'Yaklaşan Rezervasyon Yok' : 'Yaklaşan Maç Yok'}
                    </p>
                    <p className="mt-1.5 text-xs text-ink-4">
                      {segment === 'BOOKINGS' ? "Sahalar'dan yeni bir rezervasyon oluşturabilirsin." : 'Top Oyna ekranından açık maçlara katılabilirsin.'}
                    </p>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Geçmiş & iptaller */}
            {visiblePast.length > 0 && (
              <div className="pt-[22px]">
                <button
                  onClick={() => setShowPast(v => !v)}
                  className="w-full min-h-[44px] flex items-center justify-center gap-2 rounded-2xl border border-white/5 bg-white/[0.02] text-white/50 text-[0.625rem] font-extrabold uppercase tracking-[0.2em] hover:bg-white/5 active:scale-[0.99] transition-all"
                >
                  Geçmiş &amp; İptaller ({visiblePast.length})
                  <ChevronDown size={14} className={`transition-transform duration-200 ${showPast ? 'rotate-180' : ''}`} />
                </button>
                <AnimatePresence initial={false}>
                  {showPast && (
                    <motion.div
                      key="past"
                      initial={reduceMotion ? { opacity: 0 } : { opacity: 0, height: 0 }}
                      animate={reduceMotion ? { opacity: 1 } : { opacity: 1, height: 'auto' }}
                      exit={reduceMotion ? { opacity: 0 } : { opacity: 0, height: 0 }}
                      transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
                      className="overflow-hidden"
                    >
                      <div className="flex flex-col gap-3 pt-3.5">
                        {visiblePast.map((item) => (
                          <TicketCard key={item.id} item={item} currentUserUid={currentUserUid} onOpen={() => setSheet(item)} dim />
                        ))}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            )}
          </>
        )}
      </main>

      {/* ═══ ALT SAYFA — REZERVASYON ═══ */}
      <AnimatePresence>
        {sheetBooking && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-[55] bg-black/70 backdrop-blur-[3px] flex items-end"
            onClick={() => setSheet(null)}
          >
            <motion.div
              initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 28, stiffness: 300 }}
              onClick={e => e.stopPropagation()}
              className="w-full bg-[#12161D] border-t border-white/[0.08] rounded-t-[28px] px-5 pt-3 pb-6 pb-safe"
            >
              <div className="w-10 h-1 rounded-full bg-white/15 mx-auto mb-[18px]" />
              <div className="flex items-center justify-between gap-2.5 h-5">
                <span className="text-[0.625rem] font-extrabold uppercase tracking-[0.18em] text-[#FACC15]">Rezervasyon</span>
                {sheetBooking.status === 'CANCELLED' ? (
                  <span className="flex items-center gap-[5px] px-2.5 py-1 rounded-full border border-red-400/30 bg-red-400/10 text-red-300 text-[0.625rem] font-extrabold uppercase tracking-[0.08em]"><XCircle size={11} />İptal Edildi</span>
                ) : sheetBooking.status === 'CONFIRMED' ? (
                  <span className="flex items-center gap-[5px] px-2.5 py-1 rounded-full border border-[#39FF14]/30 bg-[#39FF14]/10 text-[#39FF14] text-[0.625rem] font-extrabold uppercase tracking-[0.08em]"><CheckCircle2 size={11} />Onaylandı</span>
                ) : (
                  <span className="flex items-center gap-[5px] px-2.5 py-1 rounded-full border border-[#FACC15]/30 bg-[#FACC15]/10 text-[#FACC15] text-[0.625rem] font-extrabold uppercase tracking-[0.08em]"><Clock size={11} />Onay bekliyor</span>
                )}
              </div>
              <p className="mt-3.5 mb-0 text-xl font-extrabold italic uppercase tracking-[-0.03em] truncate">{sheetBooking.pitches?.name || 'Saha Rezervasyonu'}</p>
              <p className="mt-[5px] mb-0 text-[0.75rem] text-white/50 font-semibold flex items-center gap-[5px] truncate">
                <MapPin size={12} className="shrink-0" />
                {[sheetBooking.pitches?.district, sheetBooking.courts?.name].filter(Boolean).join(' · ') || '—'}
              </p>
              <div className="flex items-center gap-4 mt-4 bg-black/30 border border-white/5 rounded-2xl px-4 py-3">
                <span className="font-numeric flex items-center gap-1.5 text-[0.8125rem] font-bold text-gray-300"><Calendar size={14} className="text-[#39FF14]" />{sheetHeading?.primary === 'Bugün' || sheetHeading?.primary === 'Yarın' ? `${sheetHeading?.secondary} · ${sheetHeading?.primary}` : sheetHeading?.primary}</span>
                <span className="font-numeric flex items-center gap-1.5 text-[0.8125rem] font-bold text-gray-300"><Clock size={14} className="text-[#39FF14]" />{shortTime(sheetBooking.start_time)}–{shortTime(sheetBooking.end_time)}</span>
              </div>
              <div className="flex items-center justify-between mt-3.5 text-[0.75rem]">
                <span className="text-ink-4 font-bold uppercase tracking-[0.03em]">Tutar</span>
                <span className="font-numeric text-[#FACC15] font-extrabold">
                  ₺{Number(sheetBooking.price || 0).toLocaleString('tr-TR')}
                  {sheetBooking.deposit_amount > 0 && <span className="text-ink-4 font-bold"> · Kapora ₺{Number(sheetBooking.deposit_amount).toLocaleString('tr-TR')}</span>}
                </span>
              </div>
              <div className="flex items-center justify-between mt-2 text-[0.75rem]">
                <span className="text-ink-4 font-bold uppercase tracking-[0.03em]">Kapora durumu</span>
                {bookingRemaining <= 0 && (sheetBooking.deposit_amount || 0) > 0 ? (
                  <span className="text-[#39FF14] font-bold flex items-center gap-1"><CheckCircle2 size={12} />Ödendi</span>
                ) : bookingRemaining > 0 ? (
                  <span className="font-numeric text-[#FACC15] font-bold">₺{bookingRemaining.toLocaleString('tr-TR')} bekliyor</span>
                ) : (
                  <span className="text-ink-4 font-bold">—</span>
                )}
              </div>

              {bookingRemaining > 0 && sheetBooking.status !== 'CANCELLED' && (
                <button
                  onClick={() => { const b = sheetBooking; setSheet(null); handlePayDeposit(b); }}
                  className="w-full h-[52px] mt-5 rounded-2xl bg-[#39FF14] text-[#0A0E14] text-xs font-extrabold uppercase tracking-[0.12em] shadow-[0_0_22px_rgba(57,255,20,0.22)] active:scale-[0.98] transition-transform"
                >
                  Kapora Öde · ₺{bookingRemaining.toLocaleString('tr-TR')}
                </button>
              )}

              {/* F4.1: QR maç bileti — tesise girişte okutulan bilet ekranı */}
              {sheetBooking.status !== 'CANCELLED' && (
                <button
                  onClick={() => {
                    const id = sheetBooking.id;
                    // Çevrimdışı ilk açılış için anlık görüntüyü şimdi yaz:
                    // kullanıcı sahada bağlantısız kalsa da bilet çizilebilsin
                    // (IP-20 · BULGU-109).
                    writeTicketCache(sheetBooking);
                    setSheet(null);
                    useAppStore.getState().setTicketBookingId(id);
                    navigateTo('MATCH_TICKET');
                  }}
                  className={`w-full h-[52px] rounded-2xl border border-[#FACC15]/30 bg-[#FACC15]/10 text-[#FACC15] text-xs font-extrabold uppercase tracking-[0.12em] active:scale-[0.98] transition-transform flex items-center justify-center gap-2 ${bookingRemaining > 0 ? 'mt-2.5' : 'mt-5'}`}
                >
                  <QrCode size={16} /> Bileti Göster
                </button>
              )}

              <div className="grid grid-cols-3 gap-2 mt-2.5">
                <button
                  onClick={() => { const b = sheetBooking; setSheet(null); handleConvertToMatch(b); }}
                  className="flex flex-col items-center justify-center gap-[5px] min-h-[56px] rounded-[14px] bg-[#39FF14]/[0.06] border border-[#39FF14]/20 text-[#39FF14] active:scale-[0.97] transition-transform"
                >
                  <Swords size={16} /><span className="text-[0.625rem] font-extrabold uppercase tracking-[0.06em]">Maça Çevir</span>
                </button>
                <button
                  onClick={() => handleDirections([sheetBooking.pitches?.name, sheetBooking.pitches?.district, 'Ordu'].filter(Boolean).join(' '))}
                  className="flex flex-col items-center justify-center gap-[5px] min-h-[56px] rounded-[14px] bg-white/[0.03] border border-white/10 text-white/80 active:scale-[0.97] transition-transform"
                >
                  <Navigation size={16} /><span className="text-[0.625rem] font-extrabold uppercase tracking-[0.06em]">Yol Tarifi</span>
                </button>
                <button
                  onClick={() => { setSheet(null); navigateTo('PITCH_DISCOVERY'); }}
                  className="flex flex-col items-center justify-center gap-[5px] min-h-[56px] rounded-[14px] bg-white/[0.03] border border-white/10 text-white/80 active:scale-[0.97] transition-transform"
                >
                  <Repeat size={16} /><span className="text-[0.625rem] font-extrabold uppercase tracking-[0.06em]">Tekrar Rezerve</span>
                </button>
              </div>
              {sheetBooking.status !== 'CANCELLED' && (
                <button
                  onClick={() => { const b = sheetBooking; setSheet(null); setCancelTarget(b); setCancelError(null); }}
                  className="w-full min-h-[48px] mt-2.5 rounded-[14px] border border-red-300/20 bg-red-300/[0.06] text-red-300 text-[0.6875rem] font-extrabold uppercase tracking-[0.14em] active:scale-[0.98] transition-transform"
                >
                  İptal Et
                </button>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ═══ ALT SAYFA — MAÇ ═══ */}
      <AnimatePresence>
        {sheetMatch && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-[55] bg-black/70 backdrop-blur-[3px] flex items-end"
            onClick={() => setSheet(null)}
          >
            <motion.div
              initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 28, stiffness: 300 }}
              onClick={e => e.stopPropagation()}
              className="w-full bg-[#12161D] border-t border-white/[0.08] rounded-t-[28px] px-5 pt-3 pb-6 pb-safe"
            >
              <div className="w-10 h-1 rounded-full bg-white/15 mx-auto mb-[18px]" />
              <div className="flex items-center justify-between gap-2.5 h-5">
                <span className="text-[0.625rem] font-extrabold uppercase tracking-[0.18em] text-[#39FF14]">
                  {sheetMatch.creatorId === currentUserUid ? 'Maç · Kaptan' : 'Maç'}
                </span>
                <span className="font-numeric text-[0.625rem] font-extrabold uppercase tracking-[0.08em] text-ink-4">
                  {sheetMatchStats ? `${sheetMatchStats.taken}/${sheetMatchStats.total} oyuncu` : ''}
                </span>
              </div>
              <p className="mt-3.5 mb-0 text-xl font-extrabold italic uppercase tracking-[-0.03em] truncate">{sheetMatch.title || 'Maç'}</p>
              <p className="mt-[5px] mb-0 text-[0.75rem] text-white/50 font-semibold flex items-center gap-[5px] truncate">
                <MapPin size={12} className="shrink-0" />
                {[sheetMatch.location, (sheetMatch as { courtName?: string }).courtName].filter(Boolean).join(' · ') || '—'}
              </p>
              <div className="flex items-center gap-4 mt-4 bg-black/30 border border-white/5 rounded-2xl px-4 py-3">
                <span className="font-numeric flex items-center gap-1.5 text-[0.8125rem] font-bold text-gray-300"><Calendar size={14} className="text-[#39FF14]" />{sheetHeading?.primary === 'Bugün' || sheetHeading?.primary === 'Yarın' ? `${sheetHeading?.secondary} · ${sheetHeading?.primary}` : sheetHeading?.primary}</span>
                <span className="font-numeric flex items-center gap-1.5 text-[0.8125rem] font-bold text-gray-300"><Clock size={14} className="text-[#39FF14]" />{sheetMatch.time || '—'}</span>
              </div>
              <div className="flex items-center justify-between mt-3.5 text-[0.75rem]">
                <span className="text-ink-4 font-bold uppercase tracking-[0.03em]">Kişi başı</span>
                <span className="font-numeric text-[#FACC15] font-extrabold">
                  {Number(sheetMatch.price) > 0 ? `₺${Number(sheetMatch.price).toLocaleString('tr-TR')}` : 'Ücretsiz'}
                </span>
              </div>
              <button
                onClick={() => sheet && openMatchLobby(sheet)}
                className="w-full h-[52px] mt-5 rounded-2xl bg-[#39FF14] text-[#0A0E14] text-xs font-extrabold uppercase tracking-[0.12em] shadow-[0_0_22px_rgba(57,255,20,0.22)] active:scale-[0.98] transition-transform"
              >
                Lobiyi Aç
              </button>
              {/* F2.1: oynanmış ve henüz puanlanmamış maç → değerlendirme akışı */}
              {sheetMatchEvaluable && (
                <button
                  onClick={() => { const m = sheetMatch; setSheet(null); setSelectedMatch(m); navigateTo('POST_MATCH_EVAL'); }}
                  className="w-full min-h-[52px] mt-2.5 rounded-2xl bg-[#FACC15]/10 border border-[#FACC15]/30 flex items-center justify-between px-4 text-left active:scale-[0.98] transition-transform"
                >
                  <span>
                    <span className="block text-[0.6875rem] font-extrabold text-[#FACC15] uppercase tracking-wider">Maçı Değerlendir</span>
                    <span className="block text-[0.6875rem] text-ink-4 font-bold">Takım arkadaşlarını ve kaleci/hakemi puanla</span>
                  </span>
                  <span className="text-[#FACC15] font-extrabold">→</span>
                </button>
              )}
              <div className="grid grid-cols-2 gap-2 mt-2.5">
                <button
                  onClick={() => handleDirections([sheetMatch.location, 'Ordu'].filter(Boolean).join(' '))}
                  className="flex items-center justify-center gap-[7px] min-h-[48px] rounded-[14px] bg-white/[0.03] border border-white/10 text-white/80 text-[0.625rem] font-extrabold uppercase tracking-[0.08em] active:scale-[0.97] transition-transform"
                >
                  <Navigation size={15} />Yol Tarifi
                </button>
                <button
                  disabled={!sheetMatchLeaveable}
                  onClick={() => { if (sheet) { setLeaveError(null); setLeaveTarget(sheet); setSheet(null); } }}
                  className="flex items-center justify-center gap-[7px] min-h-[48px] rounded-[14px] bg-red-300/[0.06] border border-red-300/20 text-red-300 text-[0.625rem] font-extrabold uppercase tracking-[0.08em] active:scale-[0.97] transition-transform disabled:opacity-35"
                >
                  <LogOut size={15} />Maçtan Ayrıl
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ═══ MAÇTAN AYRILMA ONAYI (iade önizlemesi SUNUCUDAN) ═══ */}
      <AnimatePresence>
        {leaveTarget && leaveTarget.kind === 'MATCH' && (
          <motion.div
            {...MODAL_BACKDROP}
            className="fixed inset-0 z-[60] bg-black/85 backdrop-blur-sm flex items-center justify-center p-6"
            onClick={() => { if (!leaving) setLeaveTarget(null); }}
          >
            <motion.div
              {...MODAL_CARD}
              onClick={(e) => e.stopPropagation()}
              className="bg-[#161B22] w-full max-w-sm rounded-[32px] border border-white/10 p-7 text-center"
            >
              <div className="w-16 h-16 mx-auto rounded-full bg-red-500/15 border-2 border-red-500/40 flex items-center justify-center mb-5">
                <LogOut size={26} className="text-red-400" />
              </div>
              <h2 className="text-xl font-extrabold text-white mb-2">Maçtan Ayrıl</h2>
              <p className="text-sm text-gray-400 leading-relaxed mb-1">
                {leaveTarget.match.title} — {leaveTarget.match.time}
              </p>
              <p className="text-xs text-ink-4 mb-3">
                Kadrodaki yerin ve doldurulmamış rezerve slotların serbest bırakılır. Arkadaşlarına atadığın slotlar korunur.
              </p>

              {/* IP-04 — ayrılmanın para/puan sonucu; lobi modalıyla AYNI metin
                  kaynağı (leaveQuoteMessage). Hiçbir dal sessiz değil. */}
              {(() => {
                const msg = leaveQuoteMessage(leaveQuote, leaveQuoteLoading, false);
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
              {leaveError && (
                <p className="text-xs text-red-400 bg-red-950/40 border border-red-500/20 rounded-xl px-3 py-2 mb-4">{leaveError}</p>
              )}
              <div className="flex flex-col gap-3">
                {/* IP-04 — para sonucu bilinmeden yıkıcı aksiyon yapılamaz. */}
                <button
                  onClick={handleLeaveMatch}
                  disabled={leaving || leaveQuoteLoading || leaveQuote == null}
                  className={`w-full py-3.5 bg-red-500 text-white font-extrabold rounded-2xl text-sm uppercase tracking-wide transition-transform flex items-center justify-center gap-2 disabled:opacity-40 disabled:pointer-events-none ${leaving ? 'opacity-60 cursor-wait' : 'active:scale-95 hover:bg-red-600'}`}
                >
                  {leaving ? <><Loader2 size={16} className="animate-spin" /> Ayrılıyor…</> : 'Maçtan Ayrıl'}
                </button>
                <button onClick={() => { if (!leaving) setLeaveTarget(null); }} className="w-full py-3 text-gray-400 font-bold text-sm hover:text-white transition-colors">
                  Vazgeç
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ═══ REZERVASYON İPTAL ONAYI (iade önizlemesi SUNUCUDAN) ═══ */}
      <AnimatePresence>
        {cancelTarget && (
          <motion.div
            {...MODAL_BACKDROP}
            className="fixed inset-0 z-[60] bg-black/85 backdrop-blur-sm flex items-center justify-center p-6"
            onClick={() => setCancelTarget(null)}
          >
            <motion.div
              {...MODAL_CARD}
              onClick={(e) => e.stopPropagation()}
              className="bg-[#161B22] w-full max-w-sm rounded-[32px] border border-white/10 p-7 text-center"
            >
              <div className="w-16 h-16 mx-auto rounded-full bg-red-500/15 border-2 border-red-500/40 flex items-center justify-center mb-5">
                <AlertTriangle size={28} className="text-red-400" />
              </div>
              <h2 className="text-xl font-extrabold text-white mb-2">Rezervasyonu İptal Et</h2>
              <p className="text-sm text-gray-400 leading-relaxed mb-1">
                {cancelTarget.pitches?.name} — {cancelTarget.booking_date} {shortTime(cancelTarget.start_time)}
              </p>
              <p className="text-xs text-ink-4 mb-6">
                {previewLoading ? (
                  <span className="inline-flex items-center gap-1.5"><Loader2 size={12} className="animate-spin" /> İade koşulları hesaplanıyor…</span>
                ) : previewError || !cancelPreview ? (
                  <>İade tutarı iptal anında sunucu tarafından kesinleştirilecek.</>
                ) : cancelPreview.paid_amount <= 0 ? (
                  <>Bu rezervasyon için ödeme bulunmuyor; iade söz konusu değil.</>
                ) : cancelPreview.refund_amount > 0 ? (
                  <>Ödediğin tutarın <span className="text-[#39FF14] font-bold">%{cancelPreview.refund_percent}</span>'i
                    {' '}(<span className="font-numeric text-[#39FF14] font-bold">₺{formatTRY(cancelPreview.refund_amount)}</span>){' '}
                    cüzdanına döner
                    {cancelPreview.psp_fee > 0 && <> (ödeme altyapısı kesintisi −<span className="font-numeric">{formatTRY(cancelPreview.psp_fee)}</span>₺)</>}.</>
                ) : (
                  <>Rezervasyon saatine az kaldığı için <span className="text-red-400 font-bold">iade yapılmayacak</span>.</>
                )}
                {' '}Bu işlem geri alınamaz.
              </p>

              {cancelError && (
                <p className="text-xs text-red-400 bg-red-950/40 border border-red-500/20 rounded-xl px-3 py-2 mb-4">{cancelError}</p>
              )}

              <div className="flex flex-col gap-3">
                <button
                  onClick={handleCancel}
                  disabled={cancelling}
                  className={`w-full py-3.5 bg-red-500 text-white font-extrabold rounded-2xl text-sm uppercase tracking-wide transition-transform flex items-center justify-center gap-2 ${cancelling ? 'opacity-60 cursor-wait' : 'active:scale-95 hover:bg-red-600'}`}
                >
                  {cancelling ? <><Loader2 size={16} className="animate-spin" /> İptal ediliyor…</> : 'Rezervasyonu İptal Et'}
                </button>
                <button onClick={() => setCancelTarget(null)} className="w-full py-3 text-gray-400 font-bold text-sm hover:text-white transition-colors">
                  Vazgeç
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ═══ İPTAL BAŞARI ═══ */}
      <AnimatePresence>
        {cancelResult && (
          <motion.div
            {...MODAL_BACKDROP}
            className="fixed inset-0 z-[60] bg-black/85 backdrop-blur-sm flex items-center justify-center p-6"
            onClick={() => setCancelResult(null)}
          >
            <motion.div
              {...MODAL_CARD}
              onClick={(e) => e.stopPropagation()}
              className="bg-[#161B22] w-full max-w-sm rounded-[32px] border border-white/10 p-7 text-center"
            >
              <div className="w-16 h-16 mx-auto rounded-full bg-[#39FF14]/15 border-2 border-[#39FF14]/40 flex items-center justify-center mb-5">
                <CheckCircle2 size={28} className="text-[#39FF14]" />
              </div>
              <h2 className="text-xl font-extrabold text-white mb-2">İptal Edildi</h2>
              <p className="text-sm text-gray-400 leading-relaxed mb-6">
                Rezervasyonun iptal edildi.
                {cancelResult.refund_amount > 0
                  ? <> <span className="font-numeric text-[#39FF14] font-bold">₺{formatTRY(cancelResult.refund_amount)}</span> (%{cancelResult.refund_percent}) cüzdanına eklendi.</>
                  : ' İade edilecek ödeme bulunmuyor.'}
              </p>
              <button onClick={() => setCancelResult(null)} className="w-full py-3.5 bg-[#FACC15] text-black font-extrabold rounded-2xl text-sm uppercase tracking-wide active:scale-95 transition-transform">
                Tamam
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

    </div>
  );
};

export default MyMatchesHub;
