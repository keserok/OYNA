import React, { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import {
  ArrowLeft, RefreshCw, Calendar, Clock, ChevronDown, AlertTriangle,
  CheckCircle2, Loader2, Zap,
} from 'lucide-react';
import { AppView } from '../types';
import { useAppStore } from '../store';
import { useMyAgenda, type MyAgendaItem } from '../hooks/useMyAgenda';
import { useCountdown } from '../hooks/useCountdown';
import { MatchJoinCard } from '../components/MatchJoinCard';
import { BookingCard, formatBookingDate } from '../components/BookingCard';
import {
  cancelMyBooking, previewBookingCancel, shortTime, toPlayerErrorMessage,
  type MyBooking, type CancelResult, type CancelPreview,
} from '../services/playerBookingService';
import { formatTRY } from '../utils/formatTRY';
import { EmptyState } from '../components/common/StatusState';
import SkeletonList from '../components/ui/SkeletonList';
import SegmentedTabs from '../components/ui/SegmentedTabs';
import { MODAL_BACKDROP, MODAL_CARD } from '../components/common/motion';

// ─── MAÇLARIM HUB ─────────────────────────────────────────────────────────────
// Slot alınmış maçlar + saha rezervasyonları GERÇEK verilerle tek kronolojik
// ajandada: en yakın etkinlik en üstte, her kartın üstünde tip rozeti
// (MAÇ / REZERVASYON), üstte Tümü/Maçlar/Rezervasyonlar segmenti.
// Eski "Rezervasyonlarım" ekranının TÜM aksiyonları buraya taşındı:
// kapora öde · iptal (sunucu önizlemeli) · maça çevir · yol tarifi · tekrar rezerve.

type Segment = 'ALL' | 'MATCHES' | 'BOOKINGS';

// '22:00 - 23:00' gibi aralık metinlerinden başlangıç saatini çeker.
const firstTimeToken = (t: string): string => (t || '').trim().split(' ')[0];

// Göreli gün etiketi: Bugün / Yarın / 23 Tem
const dayLabel = (when: Date | null): string => {
  if (!when || isNaN(when.getTime())) return '';
  const startOf = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const diffDays = Math.round((startOf(when) - startOf(new Date())) / 86400000);
  if (diffDays === 0) return 'Bugün';
  if (diffDays === 1) return 'Yarın';
  return when.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' });
};

// Kart üstü ince meta satırı: tip rozeti + göreli tarih/saat.
const ItemMetaRow: React.FC<{ item: MyAgendaItem }> = ({ item }) => {
  const isMatch = item.kind === 'MATCH';
  const time = isMatch
    ? firstTimeToken(item.match.time)
    : shortTime(item.booking.start_time);
  const day = dayLabel(item.when);
  return (
    <div className="flex items-center justify-between px-1 mb-2">
      <span
        className={`px-2.5 py-1 rounded-full border text-[9px] font-black uppercase tracking-[0.15em] ${
          isMatch
            ? 'border-[#39FF14]/40 text-[#39FF14] bg-[#39FF14]/[0.06]'
            : 'border-white/20 text-white/60 bg-white/[0.03]'
        }`}
      >
        {isMatch ? 'MAÇ' : 'REZERVASYON'}
      </span>
      {(day || time) && (
        <span className="text-[10px] font-black uppercase tracking-widest text-white/40 font-numeric">
          {day}{day && time ? ' · ' : ''}{time}
        </span>
      )}
    </div>
  );
};

// Sıradaki etkinlik hero'su — canlı geri sayım (Space Grotesk).
const NextEventHero: React.FC<{ item: MyAgendaItem; onOpen: () => void }> = ({ item, onOpen }) => {
  const isMatch = item.kind === 'MATCH';
  const date = isMatch ? item.match.date : item.booking.booking_date;
  const time = isMatch ? firstTimeToken(item.match.time) : shortTime(item.booking.start_time);
  const countdown = useCountdown(date, time);
  const title = isMatch
    ? (item.match.title || 'Maç')
    : (item.booking.pitches?.name || 'Saha Rezervasyonu');
  const venue = isMatch
    ? item.match.location
    : [item.booking.pitches?.district, item.booking.courts?.name].filter(Boolean).join(' · ');

  return (
    <motion.button
      type="button"
      onClick={onOpen}
      whileTap={{ scale: 0.98 }}
      className="w-full text-left bg-[#161B22]/80 backdrop-blur-xl rounded-2xl border border-white/5 p-4 flex items-center gap-4 relative overflow-hidden"
    >
      <div
        className="absolute top-0 right-0 w-28 h-28 opacity-[0.07] blur-2xl pointer-events-none rounded-full"
        style={{ backgroundColor: isMatch ? '#39FF14' : '#FACC15' }}
      />
      <div className="min-w-0 flex-1 relative">
        <p className="text-[9px] font-black uppercase tracking-[0.2em] text-white/40 mb-1.5 flex items-center gap-1.5">
          <Zap size={10} className={isMatch ? 'text-[#39FF14]' : 'text-[#FACC15]'} />
          Sıradaki Etkinlik
        </p>
        <h3 className="text-sm font-black text-white uppercase italic tracking-tight truncate">{title}</h3>
        {venue && <p className="text-[10px] text-white/45 font-bold uppercase tracking-wider truncate mt-0.5">{venue}</p>}
      </div>
      <div className="shrink-0 text-right relative">
        <p className="text-lg font-black text-white font-numeric leading-none">{countdown || '—'}</p>
        <p className="text-[8px] font-black uppercase tracking-[0.2em] text-white/35 mt-1">{dayLabel(item.when)} · {time}</p>
      </div>
    </motion.button>
  );
};

interface MyMatchesHubProps {
  onBack: () => void;
  onNavigate: (view: AppView) => void;
}

const MyMatchesHub: React.FC<MyMatchesHubProps> = ({ onBack, onNavigate }) => {
  const reduceMotion = useReducedMotion();
  const { setSelectedMatch, setMatchCreateSeed, navigateTo } = useAppStore();
  const { items, past, counts, nextItem, bookingsLoading, bookingsError, refetchBookings, currentUserUid } = useMyAgenda();

  // Açılış segmenti tohumu (ör. kapora ödemesi sonrası 'BOOKINGS') tek kullanımlık.
  const [segment, setSegment] = useState<Segment>(
    () => useAppStore.getState().myMatchesInitialSegment ?? 'ALL'
  );
  useEffect(() => {
    const st = useAppStore.getState();
    if (st.myMatchesInitialSegment) st.setMyMatchesInitialSegment(null);
  }, []);

  const [showPast, setShowPast] = useState(false);

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

  // ── Kapora ödemesi → birleşik ödeme ekranı (BOOKING_DEPOSIT bağlamı) ─────────
  const handlePayDeposit = (b: MyBooking) => {
    const remaining = Math.max((b.deposit_amount || 0) - (b.paid_amount || 0), 0);
    if (remaining <= 0) return;
    const store = useAppStore.getState();
    const prettyDate = (() => {
      try { return new Date(`${b.booking_date}T12:00:00`).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' }); }
      catch { return b.booking_date; }
    })();
    const timeText = `${b.start_time?.slice(0, 5) ?? ''}${b.end_time ? ` - ${b.end_time.slice(0, 5)}` : ''}`.trim();
    store.setPaymentContext({
      kind: 'BOOKING_DEPOSIT',
      badge: 'SAHA KİRALAMA',
      title: b.pitches?.name || 'Saha Rezervasyonu',
      subtitle: `${b.courts?.name ? `${b.courts.name} · ` : ''}${b.booking_date} · ${b.start_time?.slice(0, 5) ?? ''}`,
      details: [
        ...(b.courts?.name ? [{ icon: 'court' as const, text: b.courts.name }] : []),
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

  // ── İkincil rezervasyon aksiyonları ──────────────────────────────────────────
  const handleConvertToMatch = (b: MyBooking) => {
    setMatchCreateSeed({
      pitchId: b.pitch_id,
      pitchName: b.pitches?.name || 'Saha',
      district: b.pitches?.district || '',
      date: b.booking_date,
      time: shortTime(b.start_time),
      price: b.price || 0,
    });
    navigateTo('MATCH_CREATE');
  };

  const handleDirections = (b: MyBooking) => {
    const q = [b.pitches?.name, b.pitches?.district, 'Ordu'].filter(Boolean).join(' ');
    const url = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`;
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  const handleRebook = () => navigateTo('PITCH_DISCOVERY');

  const openMatchLobby = (item: MyAgendaItem) => {
    if (item.kind !== 'MATCH') return;
    useAppStore.getState().setLobbyMode('MANAGE');
    setSelectedMatch(item.match);
    onNavigate('MATCH_JOIN');
  };

  // ── Segment filtresi ─────────────────────────────────────────────────────────
  const bySegment = (list: MyAgendaItem[]) =>
    segment === 'ALL' ? list : list.filter(i => (segment === 'MATCHES' ? i.kind === 'MATCH' : i.kind === 'BOOKING'));
  const visible = useMemo(() => bySegment(items), [items, segment]);
  const visiblePast = useMemo(() => bySegment(past), [past, segment]);

  const isInitialLoading = bookingsLoading && items.length === 0 && past.length === 0 && !bookingsError;
  const isFullyEmpty = !isInitialLoading && items.length === 0 && past.length === 0 && !bookingsError;

  const renderItemCard = (item: MyAgendaItem) => {
    if (item.kind === 'MATCH') {
      return (
        <MatchJoinCard
          match={item.match}
          currentUserUid={currentUserUid}
          onOpenLobby={() => openMatchLobby(item)}
        />
      );
    }
    return (
      <BookingCard
        booking={item.booking}
        onPayDeposit={handlePayDeposit}
        onCancel={(b) => { setCancelTarget(b); setCancelError(null); }}
        onConvertToMatch={handleConvertToMatch}
        onDirections={handleDirections}
        onRebook={handleRebook}
      />
    );
  };

  return (
    <div className="min-h-screen bg-[#0A0E14] text-white flex flex-col relative font-sans selection:bg-[#FACC15] selection:text-black">
      <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/carbon-fibre.png')] opacity-15 mix-blend-overlay pointer-events-none" />

      {/* ── Başlık ── */}
      <header className="sticky top-0 z-30 bg-[#0A0E14]/90 backdrop-blur-xl border-b border-white/5 pt-safe">
        <div className="px-4 py-3 flex items-center justify-between gap-3">
          <button
            onClick={onBack}
            aria-label="Geri"
            className="w-11 h-11 flex items-center justify-center bg-[#161B22] rounded-full text-white border border-white/5 hover:bg-white/10 active:scale-95 transition-all shrink-0"
          >
            <ArrowLeft size={20} />
          </button>
          <div className="text-center flex-1 min-w-0">
            <h1 className="text-lg font-black text-white italic uppercase tracking-tighter leading-none drop-shadow-lg truncate">
              Maçlarım
            </h1>
            <p className="text-[9px] text-gray-500 uppercase tracking-widest mt-1 truncate font-numeric">
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
        {/* Segment: Tümü / Maçlar / Rezervasyonlar */}
        <div className="px-4 pb-3">
          <SegmentedTabs
            layoutId="myMatchesSegment"
            items={[
              { id: 'ALL', label: 'Tümü' },
              { id: 'MATCHES', label: 'Maçlar' },
              { id: 'BOOKINGS', label: 'Rezervasyonlar' },
            ]}
            activeId={segment}
            onChange={(id) => setSegment(id as Segment)}
          />
        </div>
      </header>

      {/* ── İçerik ── */}
      <main className="flex-1 p-4 overflow-y-auto space-y-4 custom-scrollbar pb-24 relative z-10">
        {/* Sıradaki etkinlik hero'su */}
        {nextItem && !isInitialLoading && (
          <NextEventHero
            item={nextItem}
            onOpen={() => (nextItem.kind === 'MATCH' ? openMatchLobby(nextItem) : setSegment('BOOKINGS'))}
          />
        )}

        {/* Rezervasyon hatası: kısmi bozulma — maçlar çizilmeye devam eder */}
        {bookingsError && (
          <div className="flex items-center justify-between gap-3 px-4 py-3 rounded-2xl bg-red-950/30 border border-red-500/20">
            <p className="text-[11px] text-red-300 font-bold leading-snug">
              Rezervasyonlar yüklenemedi — maçların yine de listeleniyor.
            </p>
            <button
              onClick={() => { void refetchBookings(); }}
              className="shrink-0 px-3 py-2 min-h-[36px] rounded-xl bg-red-500/15 border border-red-500/30 text-red-200 text-[10px] font-black uppercase tracking-widest active:scale-95 transition-all"
            >
              Tekrar Dene
            </button>
          </div>
        )}

        {isInitialLoading ? (
          <SkeletonList rows={4} variant="card" />
        ) : isFullyEmpty ? (
          <div className="pt-6">
            <EmptyState
              title="Henüz Etkinliğin Yok"
              message="Bir maça katıl ya da saha kirala — ajandan burada canlanır."
              icon={<Calendar size={32} />}
            />
            <div className="max-w-xs mx-auto space-y-3 mt-2">
              <button
                onClick={() => onNavigate('MATCH_DISCOVERY')}
                className="w-full h-12 rounded-2xl bg-[#39FF14] text-black text-xs font-black uppercase tracking-widest active:scale-95 transition-transform shadow-[0_0_20px_rgba(57,255,20,0.25)]"
              >
                Top Oyna
              </button>
              <button
                onClick={() => onNavigate('PITCH_DISCOVERY')}
                className="w-full h-12 rounded-2xl border border-white/10 text-white/70 text-xs font-black uppercase tracking-widest hover:bg-white/5 active:scale-95 transition-all"
              >
                Saha Kirala
              </button>
            </div>
          </div>
        ) : (
          <>
            {/* Kronolojik birleşik liste */}
            <AnimatePresence mode="popLayout">
              {visible.length > 0 ? (
                <motion.div key={`list-${segment}`} className="space-y-4">
                  {visible.map((item, index) => (
                    <motion.div
                      key={item.id}
                      initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 16 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.3, delay: Math.min(index * 0.06, 0.4) }}
                    >
                      <ItemMetaRow item={item} />
                      {renderItemCard(item)}
                    </motion.div>
                  ))}
                </motion.div>
              ) : (
                <motion.div
                  key={`empty-${segment}`}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ duration: 0.2 }}
                >
                  <EmptyState
                    title={segment === 'BOOKINGS' ? 'Yaklaşan Rezervasyon Yok' : 'Yaklaşan Maç Yok'}
                    message={
                      segment === 'BOOKINGS'
                        ? "Saha Vitrini'nden yeni bir rezervasyon oluşturabilirsin."
                        : 'Top Oyna ekranından açık maçlara katılabilirsin.'
                    }
                    icon={segment === 'BOOKINGS' ? <Calendar size={32} /> : <Clock size={32} />}
                  />
                </motion.div>
              )}
            </AnimatePresence>

            {/* Geçmiş & iptaller — katlanır bölüm */}
            {visiblePast.length > 0 && (
              <div className="pt-2">
                <button
                  onClick={() => setShowPast(v => !v)}
                  className="w-full min-h-[44px] flex items-center justify-center gap-2 rounded-2xl border border-white/5 bg-white/[0.02] text-white/50 text-[10px] font-black uppercase tracking-[0.2em] hover:bg-white/5 active:scale-[0.99] transition-all"
                >
                  Geçmiş & İptaller ({visiblePast.length})
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
                      <div className="space-y-4 pt-4 opacity-60">
                        {visiblePast.map((item) => (
                          <div key={item.id}>
                            <ItemMetaRow item={item} />
                            {renderItemCard(item)}
                          </div>
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

      {/* ── İptal Onay Modalı (iade önizlemesi SUNUCUDAN) ── */}
      <AnimatePresence>
        {cancelTarget && (
          <motion.div
            {...MODAL_BACKDROP}
            className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center p-6"
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
              <h2 className="text-xl font-black text-white mb-2">Rezervasyonu İptal Et</h2>
              <p className="text-sm text-gray-400 leading-relaxed mb-1">
                {cancelTarget.pitches?.name} — {formatBookingDate(cancelTarget.booking_date)} {shortTime(cancelTarget.start_time)}
              </p>
              <p className="text-xs text-gray-500 mb-6">
                {previewLoading ? (
                  <span className="inline-flex items-center gap-1.5"><Loader2 size={12} className="animate-spin" /> İade koşulları hesaplanıyor…</span>
                ) : previewError || !cancelPreview ? (
                  <>İade tutarı iptal anında sunucu tarafından kesinleştirilecek.</>
                ) : cancelPreview.paid_amount <= 0 ? (
                  <>Bu rezervasyon için ödeme bulunmuyor; iade söz konusu değil.</>
                ) : cancelPreview.refund_amount > 0 ? (
                  <>Ödediğin tutarın <span className="text-[#39FF14] font-bold">%{cancelPreview.refund_percent}</span>'i
                    {' '}(<span className="text-[#39FF14] font-bold font-numeric">{formatTRY(cancelPreview.refund_amount)}₺</span>){' '}
                    iade kredisi olarak cüzdanına döner
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
                  className={`w-full py-3.5 bg-red-500 text-white font-black rounded-2xl text-sm uppercase tracking-wide transition-transform flex items-center justify-center gap-2 ${cancelling ? 'opacity-60 cursor-wait' : 'active:scale-95 hover:bg-red-600'}`}
                >
                  {cancelling ? <><Loader2 size={16} className="animate-spin" /> İptal ediliyor...</> : 'Evet, İptal Et'}
                </button>
                <button onClick={() => setCancelTarget(null)} className="w-full py-3 text-gray-400 font-bold text-sm hover:text-white transition-colors">
                  Vazgeç
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── İptal Başarı Bilgisi ── */}
      <AnimatePresence>
        {cancelResult && (
          <motion.div
            {...MODAL_BACKDROP}
            className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center p-6"
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
              <h2 className="text-xl font-black text-white mb-2">İptal Edildi</h2>
              <p className="text-sm text-gray-400 leading-relaxed mb-6">
                Rezervasyonun iptal edildi.
                {cancelResult.refund_amount > 0
                  ? <> <span className="text-[#39FF14] font-bold font-numeric">{formatTRY(cancelResult.refund_amount)}₺</span> (%{cancelResult.refund_percent}) iade kredisi olarak cüzdanına eklendi.</>
                  : ' İade edilecek ödeme bulunmuyor.'}
              </p>
              <button onClick={() => setCancelResult(null)} className="w-full py-3.5 bg-[#FACC15] text-black font-black rounded-2xl text-sm uppercase tracking-wide active:scale-95 transition-transform">
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
