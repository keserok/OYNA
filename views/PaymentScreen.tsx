import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle, ArrowLeft, Check, CheckCircle2, CreditCard, Info,
  Lock, Plus, Shield, Users, Wallet, X,
} from 'lucide-react';
import { motion } from 'framer-motion';
import { useAppStore } from '../store';
import { supabase } from '../supabaseClient';
import { auth } from '../supabaseAuth';
import { parseSlotLabel } from '../services/availabilityService';
import {
  getWalletSummary, listSavedCards, WalletSummary, SavedCard,
} from '../services/walletService';
import { payBookingDeposit } from '../services/paymentService';
import { blockMatchDeposit } from '../services/matchLifecycleService';
import { getMatchDetails } from '../services/matchService';
import AddCardScreen, { EphemeralCard } from '../components/payment/AddCardScreen';
import type { PaymentContext } from '../types';

/**
 * TEK ÖDEME EKRANI — üç bağlam (tasarım 1b):
 *   maça katılım · saha kaporası · maç oluşturma kaporası (+ mevcut rezervasyon kaporası)
 * Bağlam yalnız başlık/rozet/tutar etiketini değiştirir; düzen sabittir.
 *
 * Ödeme yöntemi karuseli: [OYNA Bakiyesi toggle] [kayıtlı kartlar…] [Yeni kart ekle]
 * Kısmi ödeme: uygulanan bakiye = min(harcanabilir, tutar); kalan karttan.
 * Hata: hibrit — bu ekranda inline kırmızı şerit + cüzdanda banner (store.lastPaymentError).
 *
 * STORE UYUMU: yalnız fiziksel hizmet bedeli tahsil edilir (saha/maç/hizmet);
 * dijital ürün satışı yoktur — Apple 3.1.5(a) / Google Play muafiyeti korunur.
 */

interface PaymentScreenProps {
  onBack: () => void;
  onViewTicket: () => void;
}

type Screen = 'PAY' | 'ADD_CARD' | 'PROCESSING' | 'SUCCESS';

interface PayResult {
  balanceApplied: number;
  cardAmount: number;
  intentId: string | null;
}

const fmt = (n: number) => n.toLocaleString('tr-TR', { maximumFractionDigits: 2 });

const stripRpcPrefix = (msg: string) => msg.replace(/^[A-Z_]+:\s*/, '');

const delay = (ms: number) => new Promise<void>(r => setTimeout(r, ms));

const PaymentScreen: React.FC<PaymentScreenProps> = ({ onBack, onViewTicket }) => {
  const {
    paymentContext, setPaymentContext, setLastPaymentError,
    bookingPitch, bookingCourt, bookingDate, bookingSlot, bookingPrice, bookingDeposit,
    savedCards, setSavedCards, updateMatch,
  } = useAppStore();

  // Bağlam: store'dan; yoksa legacy saha-kaporası akışı (booking* alanları)
  const ctx: PaymentContext | null = useMemo(() => {
    if (paymentContext) return paymentContext;
    if (bookingPitch && bookingCourt && bookingDate && bookingSlot) {
      const deposit = bookingDeposit ?? Math.min(1000, bookingPrice ?? bookingCourt.price ?? 0);
      return {
        kind: 'PITCH_DEPOSIT',
        badge: 'SAHA KİRALAMA',
        title: bookingPitch.name,
        subtitle: `${bookingCourt.name} · ${bookingDate} · ${bookingSlot}`,
        amount: deposit,
        amountLabel: 'Ödenecek Kapora',
        amountHint: bookingPrice ? `Saha ücreti ${fmt(bookingPrice)}₺ · kalan tesiste ödenir` : undefined,
        isDeposit: true,
        allowBalance: true,
        successTitle: 'Kapora Onaylandı!',
        successSubtitle: 'Rezervasyon güvende',
        infoNote: 'Kapora rezervasyonunu güvenceye alır. İptal koşulları tesis politikasına göre uygulanır.',
      } satisfies PaymentContext;
    }
    return null;
  }, [paymentContext, bookingPitch, bookingCourt, bookingDate, bookingSlot, bookingPrice, bookingDeposit]);

  const [screen, setScreen] = useState<Screen>('PAY');
  const [summary, setSummary] = useState<WalletSummary | null>(null);
  const [useBalance, setUseBalance] = useState(true);
  const [selectedCardId, setSelectedCardId] = useState<string | null>(null);
  const [tempCard, setTempCard] = useState<EphemeralCard | null>(null);
  const [inlineError, setInlineError] = useState('');
  const [result, setResult] = useState<PayResult | null>(null);

  // Cüzdan özeti + kayıtlı kartlar
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const [sum, cards] = await Promise.all([getWalletSummary(), listSavedCards()]);
        if (!alive) return;
        setSummary(sum);
        setSavedCards(cards);
        const def = cards.find(c => c.isDefault) ?? cards[0];
        setSelectedCardId(prev => prev ?? def?.id ?? null);
      } catch { /* misafir olabilir — ödeme anında kapı var */ }
    })();
    return () => { alive = false; };
  }, [setSavedCards]);

  // ─── Türetilen tutarlar (canlı güncellenir) ────────────────────────────────
  const amount = ctx?.amount ?? 0;
  const spendable = summary?.spendableBalance ?? 0;
  const allowBalance = !!ctx?.allowBalance;
  const balanceApplied = allowBalance && useBalance ? Math.min(spendable, amount) : 0;
  const remaining = Math.max(amount - balanceApplied, 0);
  const needsCard = remaining > 0;
  const selectedCard = selectedCardId === 'temp'
    ? tempCard
    : savedCards.find(c => c.id === selectedCardId) ?? null;
  const canPay = amount > 0 && (!needsCard || !!selectedCard);

  const breakdown = balanceApplied > 0 && needsCard
    ? `${fmt(balanceApplied)}₺ bakiye + ${fmt(remaining)}₺ kart`
    : balanceApplied > 0
      ? 'Tamamı OYNA bakiyenden'
      : 'Tamamı karttan';

  const noteText = !allowBalance
    ? 'Kapora kartına bloke edilir, hemen çekilmez — bu yüzden bakiye bu ödemede kullanılamaz. Maç dolmazsa blokaj otomatik kalkar.'
    : balanceApplied > 0 && needsCard
      ? `Bakiyen tutarın bir kısmını karşılıyor; kalan ${fmt(remaining)}₺ seçtiğin karttan tahsil edilir.`
      : balanceApplied > 0
        ? 'Tamamı OYNA bakiyenden karşılanıyor — kart gerekmez.'
        : 'Bakiye kullanılmıyor; tutarın tamamı seçtiğin karttan tahsil edilir.';

  // ─── Ödeme yürütme ─────────────────────────────────────────────────────────
  const executePayment = async (): Promise<PayResult> => {
    if (!ctx) throw new Error('Ödeme bağlamı eksik. Lütfen geri dönüp tekrar deneyin.');
    const cardId = selectedCardId === 'temp' ? null : selectedCardId;

    switch (ctx.kind) {
      case 'MATCH_JOIN': {
        const { data, error } = await supabase.rpc('player_buy_slots_v2', {
          p_match_id: ctx.matchId,
          p_slot_ids: ctx.slotIds ?? [],
          p_use_balance: allowBalance && useBalance,
          p_card_id: needsCard ? cardId : null,
        });
        if (error) throw error;
        const d = data as any;
        // Lobi state'ini tazele (lost-update önleme — sunucu SSOT)
        if (ctx.matchId) {
          try {
            const fresh = await getMatchDetails(ctx.matchId);
            const current = useAppStore.getState().selectedMatch;
            if (fresh && current && current.id === ctx.matchId) {
              await updateMatch({ ...current, ...(fresh as any) });
            }
          } catch { /* kritik değil */ }
        }
        return {
          balanceApplied: Number(d?.balance_applied) || 0,
          cardAmount: Number(d?.card_amount) || 0,
          intentId: d?.intent_id ?? null,
        };
      }
      case 'PITCH_DEPOSIT': {
        if (!bookingPitch || !bookingCourt || !bookingDate || !bookingSlot) {
          throw new Error('Rezervasyon bilgileri eksik. Lütfen geri dönüp tekrar deneyin.');
        }
        const { startTime, endTime } = parseSlotLabel(bookingSlot);
        const { data: booking, error: bookingErr } = await supabase.rpc('create_pitch_booking', {
          p_pitch_id: bookingPitch.id,
          p_court_id: bookingCourt.id,
          p_booking_date: bookingDate,
          p_start_time: `${startTime}:00`,
          p_end_time: `${endTime}:00`,
          p_source: 'APP_BOOKING',
          p_title: 'Kullanıcı',
        });
        if (bookingErr) throw bookingErr;
        const bookingId = booking as unknown as string;
        try {
          const { data, error } = await supabase.rpc('record_app_deposit_payment', {
            p_booking_id: bookingId,
            p_amount: amount,
            p_use_balance: allowBalance && useBalance,
            p_card_id: needsCard ? cardId : null,
          });
          if (error) throw error;
          const d = data as any;
          return {
            balanceApplied: Number(d?.balance_applied) || 0,
            cardAmount: Number(d?.card_amount) || 0,
            intentId: d?.intent_id ?? null,
          };
        } catch (e) {
          // Canlı (IYZICO) modda kart tahsilatı hosted checkout'a yönlenir;
          // rezervasyon oluştu, tahsilat iyzico sayfasında tamamlanır.
          if (e instanceof Error && e.message.includes('PROVIDER_FLOW_REQUIRED')) {
            await payBookingDeposit(bookingId);
            return { balanceApplied: 0, cardAmount: amount, intentId: null };
          }
          throw e;
        }
      }
      case 'BOOKING_DEPOSIT': {
        try {
          const { data, error } = await supabase.rpc('record_app_deposit_payment', {
            p_booking_id: ctx.bookingId,
            p_amount: amount,
            p_use_balance: allowBalance && useBalance,
            p_card_id: needsCard ? cardId : null,
          });
          if (error) throw error;
          const d = data as any;
          return {
            balanceApplied: Number(d?.balance_applied) || 0,
            cardAmount: Number(d?.card_amount) || 0,
            intentId: d?.intent_id ?? null,
          };
        } catch (e) {
          // Canlı (IYZICO) modda kart tahsilatı hosted checkout'a yönlenir
          if (e instanceof Error && e.message.includes('PROVIDER_FLOW_REQUIRED') && ctx.bookingId) {
            await payBookingDeposit(ctx.bookingId);
            return { balanceApplied: 0, cardAmount: amount, intentId: null };
          }
          throw e;
        }
      }
      case 'MATCH_CREATE_DEPOSIT': {
        if (!ctx.matchId) throw new Error('Maç bilgisi eksik.');
        const res = await blockMatchDeposit(ctx.matchId, amount, (ctx.deferredProviders ?? []) as any);
        return { balanceApplied: 0, cardAmount: amount, intentId: (res as any)?.intent_id ?? null };
      }
    }
  };

  const handlePay = async () => {
    if (!canPay) return;
    if (!auth.currentUser) {
      useAppStore.getState().setIsSignupGateOpen(true);
      return;
    }
    setInlineError('');
    setScreen('PROCESSING');
    try {
      const [res] = await Promise.all([executePayment(), delay(1800)]);
      setResult(res);
      setLastPaymentError(null);
      setScreen('SUCCESS');
    } catch (err) {
      const raw = err instanceof Error ? err.message : 'Beklenmeyen bir hata oluştu.';
      const msg = stripRpcPrefix(raw);
      setInlineError(msg);
      if (ctx) {
        setLastPaymentError({
          message: msg,
          contextKind: ctx.kind,
          title: ctx.isDeposit ? 'Kapora ödemesi başarısız' : 'Ödeme başarısız',
          at: Date.now(),
        });
      }
      setScreen('PAY');
    }
  };

  const handleSuccessPrimary = () => {
    const store = useAppStore.getState();
    setPaymentContext(null);
    switch (ctx?.kind) {
      case 'MATCH_JOIN':
        onBack();
        break;
      case 'MATCH_CREATE_DEPOSIT':
        store.resetNavigation(store.selectedMatch ? 'MATCH_JOIN' : 'MATCH_DISCOVERY');
        break;
      case 'PITCH_DEPOSIT':
      case 'BOOKING_DEPOSIT':
        store.resetNavigation('MY_BOOKINGS');
        break;
      default:
        onViewTicket();
    }
  };

  const handleSuccessSecondary = () => {
    setPaymentContext(null);
    useAppStore.getState().resetNavigation('DASHBOARD');
  };

  // ─── Bağlam yoksa güvenli çıkış ────────────────────────────────────────────
  if (!ctx) {
    return (
      <div className="min-h-screen bg-[#0A0E14] flex flex-col items-center justify-center gap-4 p-6">
        <AlertTriangle size={32} className="text-yellow-400" />
        <p className="text-gray-400 text-sm text-center">Ödeme bağlamı bulunamadı. Lütfen geri dönüp tekrar deneyin.</p>
        <button onClick={onBack} className="px-6 py-3 bg-[#161B22] border border-white/10 text-white font-bold rounded-2xl">Geri Dön</button>
      </div>
    );
  }

  // ─── Alt ekranlar ──────────────────────────────────────────────────────────
  if (screen === 'ADD_CARD') {
    return (
      <AddCardScreen
        allowEphemeral
        onBack={() => setScreen('PAY')}
        onSaved={async (card) => {
          setSavedCards(await listSavedCards());
          setSelectedCardId(card.id);
          setTempCard(null);
          setScreen('PAY');
        }}
        onEphemeral={(card) => {
          setTempCard(card);
          setSelectedCardId('temp');
          setScreen('PAY');
        }}
      />
    );
  }

  if (screen === 'PROCESSING') {
    return (
      <div lang="tr" className="min-h-screen bg-[#0A0E14] flex flex-col items-center justify-center p-8">
        <div className="relative w-[170px] h-[170px] mb-10">
          <svg width="170" height="170" viewBox="0 0 100 100" className="-rotate-90">
            <circle cx="50" cy="50" r="44" fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="5" />
            <circle cx="50" cy="50" r="44" fill="none" stroke="#39FF14" strokeWidth="5" strokeLinecap="round"
              strokeDasharray="276.5" strokeDashoffset="90"
              style={{ filter: 'drop-shadow(0 0 6px rgba(57,255,20,0.5))', animation: 'oy-spin 1.1s linear infinite', transformOrigin: '50% 50%' }} />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <div className="w-[54px] h-[38px] rounded-lg bg-gradient-to-br from-purple-700 to-blue-600 flex items-center justify-center mb-2 shadow-lg text-white">
              <CreditCard size={22} />
            </div>
            <p className="text-[10px] font-numeric text-gray-400">
              {selectedCard && needsCard ? `•••• ${selectedCard.last4}` : 'OYNA Bakiyesi'}
            </p>
          </div>
        </div>
        <p className="text-lg font-black uppercase tracking-[0.16em] text-white">
          {ctx.isDeposit ? 'Kapora İşleniyor' : 'Ödeme İşleniyor'}
        </p>
        <p className="text-[13px] text-gray-500 mt-2.5 flex items-center gap-1.5">
          <Shield size={13} className="text-[#39FF14] animate-pulse" /> iyzico ile güvenli bağlantı
        </p>
      </div>
    );
  }

  if (screen === 'SUCCESS') {
    return (
      <div lang="tr" className="min-h-screen bg-[#0A0E14] flex flex-col relative overflow-hidden">
        <div className="absolute top-0 inset-x-0 h-[340px] pointer-events-none"
          style={{ background: 'radial-gradient(circle at 50% 30%, rgba(57,255,20,0.16), transparent 65%)' }} />
        <main className="flex-1 overflow-y-auto flex flex-col items-center px-6 pt-20 pb-6 relative">
          <motion.div
            initial={{ scale: 0.4, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: 'spring', stiffness: 320, damping: 18 }}
            className="w-[104px] h-[104px] rounded-full bg-[#39FF14] flex items-center justify-center shadow-[0_0_60px_rgba(57,255,20,0.5)] mb-7 text-[#0A0E14]"
          >
            <Check size={52} strokeWidth={3} />
          </motion.div>
          <motion.h2 initial={{ y: 14, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.12 }}
            className="text-[27px] font-black text-white text-center">
            {ctx.successTitle}
          </motion.h2>
          <motion.p initial={{ y: 14, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.18 }}
            className="text-[13px] text-[#39FF14] font-bold mt-2 uppercase tracking-[0.14em]">
            {fmt(amount)}₺ · {ctx.successSubtitle}
          </motion.p>
          <motion.div initial={{ y: 14, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.24 }}
            className="w-full bg-[#161B22] border border-white/8 rounded-3xl p-5 mt-8 space-y-3">
            <SummaryRow label={ctx.kind === 'MATCH_JOIN' ? 'Maç' : 'Saha'} value={ctx.title} />
            <SummaryRow label="Yer & Saat" value={ctx.subtitle} />
            <SummaryRow label="Ödeme" value={
              result && result.balanceApplied > 0 && result.cardAmount > 0
                ? `${fmt(result.balanceApplied)}₺ bakiye + ${fmt(result.cardAmount)}₺ kart`
                : result && result.balanceApplied > 0 ? 'OYNA bakiyesi' : 'Kart'
            } />
            <div className="h-px bg-white/8" />
            <SummaryRow label="İşlem No" value={(result?.intentId ?? '').slice(0, 8).toUpperCase() || '—'} dim mono />
          </motion.div>
          {ctx.infoNote && (
            <motion.div initial={{ y: 14, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.3 }}
              className="w-full mt-3.5 bg-blue-500/8 border border-blue-400/20 rounded-2xl p-3.5 flex gap-2.5">
              <Info size={15} className="text-blue-400 shrink-0 mt-0.5" />
              <p className="text-[11.5px] text-gray-400 leading-relaxed">{ctx.infoNote}</p>
            </motion.div>
          )}
        </main>
        <div className="shrink-0 px-5 pb-safe pt-3 flex flex-col gap-2.5">
          <button onClick={handleSuccessPrimary}
            className="w-full py-4 bg-[#39FF14] text-[#0A0E14] font-black text-[15px] rounded-2xl active:scale-[0.98] transition-all">
            {ctx.kind === 'MATCH_JOIN' ? 'LOBİYE DÖN'
              : ctx.kind === 'MATCH_CREATE_DEPOSIT' ? 'MAÇ LOBİSİNE GİT'
              : 'REZERVASYONLARIMA GİT'}
          </button>
          <button onClick={handleSuccessSecondary}
            className="w-full py-3 text-gray-500 font-bold text-sm">
            Ana sayfaya dön
          </button>
        </div>
      </div>
    );
  }

  // ─── Ana ödeme ekranı (1b) ─────────────────────────────────────────────────
  return (
    <div lang="tr" className="min-h-screen bg-[#0A0E14] flex flex-col font-sans">
      <header className="px-5 pt-safe py-4 flex items-center gap-4 border-b border-white/5 sticky top-0 bg-[#0A0E14]/90 backdrop-blur-xl z-20">
        <button onClick={() => { setPaymentContext(null); onBack(); }}
          className="w-11 h-11 flex items-center justify-center bg-[#161B22] rounded-full border border-white/5 text-white active:scale-95 transition-all shrink-0">
          <ArrowLeft size={20} />
        </button>
        <div>
          <h1 className="text-[17px] font-black text-white uppercase tracking-[0.01em]">
            {ctx.isDeposit ? 'Kapora Ödemesi' : 'Ödeme'}
          </h1>
          <p className="text-[11px] text-gray-500 font-semibold">
            {ctx.isDeposit ? 'Rezervasyonu güvenceye al' : 'Maça katılımını tamamla'}
          </p>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto py-5 space-y-[18px] pb-40">
        {/* Inline hata şeridi (hibrit hata UX'inin ekran-içi yarısı) */}
        {inlineError && (
          <div className="mx-5 bg-red-500/10 border border-red-500/30 rounded-2xl p-3.5 flex gap-3">
            <div className="w-8 h-8 rounded-xl bg-red-500/15 flex items-center justify-center text-red-400 shrink-0">
              <AlertTriangle size={16} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[13px] font-extrabold text-red-400">
                {ctx.isDeposit ? 'Kapora ödemesi başarısız' : 'Ödeme başarısız'}
              </p>
              <p className="text-[11.5px] text-gray-300 mt-0.5 leading-relaxed">{inlineError}</p>
            </div>
            <button onClick={() => setInlineError('')} className="text-gray-500 shrink-0 self-start"><X size={15} /></button>
          </div>
        )}

        {/* Bağlam özet kartı */}
        <div className={`mx-5 rounded-[20px] p-4 flex items-center gap-3.5 border ${
          ctx.isDeposit
            ? 'bg-gradient-to-br from-yellow-400/10 to-[#161B22] border-yellow-400/20'
            : 'bg-gradient-to-br from-green-900/25 to-[#161B22] border-[#39FF14]/20'
        }`}>
          <div className={`w-[50px] h-[50px] rounded-[14px] flex items-center justify-center shrink-0 border ${
            ctx.isDeposit ? 'bg-yellow-400/10 border-yellow-400/15 text-[#FACC15]' : 'bg-[#39FF14]/10 border-[#39FF14]/15 text-[#39FF14]'
          }`}>
            <Users size={22} />
          </div>
          <div className="flex-1 min-w-0">
            <span className={`inline-flex items-center gap-1 text-[9px] font-black uppercase tracking-[0.1em] px-1.5 py-0.5 rounded-md mb-1 ${
              ctx.isDeposit ? 'text-[#FACC15] bg-yellow-400/12' : 'text-[#39FF14] bg-[#39FF14]/12'
            }`}>
              {ctx.badge}
            </span>
            <p className="text-[15px] font-extrabold text-white truncate">{ctx.title}</p>
            <p className="text-[11px] text-gray-400 font-semibold mt-0.5 truncate">{ctx.subtitle}</p>
          </div>
        </div>

        {/* Tutar */}
        <div className="text-center px-5 py-0.5">
          <p className="text-[11px] text-gray-400 font-bold uppercase tracking-[0.1em] mb-1.5">{ctx.amountLabel}</p>
          <p className={`text-[44px] font-black leading-none font-numeric ${ctx.isDeposit ? 'text-[#FACC15]' : 'text-white'}`}>
            {fmt(amount)}₺
          </p>
          {ctx.amountHint && <p className="text-[11px] text-gray-500 mt-2">{ctx.amountHint}</p>}
        </div>

        {/* Ödeme yöntemi karuseli */}
        <div>
          <p className="text-[11px] font-black uppercase tracking-[0.14em] text-gray-500 mb-3 px-5">Ödeme Yöntemi</p>
          <div className="oy-carousel flex gap-3 overflow-x-auto px-5 pb-1.5" style={{ scrollSnapType: 'x mandatory' }}>
            {/* OYNA bakiyesi toggle */}
            <button
              disabled={!allowBalance}
              onClick={() => allowBalance && setUseBalance(v => !v)}
              style={{ scrollSnapAlign: 'start' }}
              className={`shrink-0 w-[158px] rounded-[20px] p-4 text-left bg-gradient-to-br from-green-900/40 to-[#161B22] relative transition-all ${
                !allowBalance ? 'opacity-45 border border-white/8'
                : balanceApplied > 0 ? 'border-2 border-[#39FF14] shadow-[0_0_22px_rgba(57,255,20,0.18)]'
                : 'border border-white/8'
              }`}
            >
              {balanceApplied > 0 && (
                <span className="absolute top-3 right-3 w-[22px] h-[22px] rounded-full bg-[#39FF14] flex items-center justify-center">
                  <Check size={14} strokeWidth={3} className="text-[#0A0E14]" />
                </span>
              )}
              {!allowBalance && (
                <span className="absolute top-3 right-3 text-gray-500"><Lock size={14} /></span>
              )}
              <span className="w-10 h-10 rounded-xl bg-[#39FF14]/14 flex items-center justify-center text-[#39FF14] mb-8 block">
                <Wallet size={20} />
              </span>
              <p className="text-xs font-extrabold text-white">OYNA Bakiyesi</p>
              <p className="text-xl font-black text-[#39FF14] mt-1 font-numeric">{fmt(spendable)}₺</p>
              <p className="text-[9.5px] text-gray-500 mt-0.5">
                {!allowBalance ? 'Kaporada kullanılamaz'
                  : spendable >= amount ? 'Tamamını karşılar'
                  : spendable > 0 ? 'Kısmen karşılar' : 'Bakiye yok'}
              </p>
            </button>

            {/* Kayıtlı kartlar */}
            {savedCards.map(card => {
              const selected = needsCard && selectedCardId === card.id;
              return (
                <button key={card.id} onClick={() => setSelectedCardId(card.id)}
                  style={{ scrollSnapAlign: 'start' }}
                  className={`shrink-0 w-[158px] rounded-[20px] p-4 text-left bg-[#161B22] relative transition-all ${
                    selected ? 'border-2 border-[#39FF14] shadow-[0_0_22px_rgba(57,255,20,0.18)]' : 'border border-white/8'
                  } ${!needsCard ? 'opacity-45' : ''}`}
                >
                  {selected && (
                    <span className="absolute top-3 right-3 w-[22px] h-[22px] rounded-full bg-[#39FF14] flex items-center justify-center">
                      <Check size={14} strokeWidth={3} className="text-[#0A0E14]" />
                    </span>
                  )}
                  <span className={`w-11 h-[30px] rounded-md bg-gradient-to-br ${card.gradient ?? 'from-purple-700 to-blue-600'} flex items-center justify-center mb-10`}>
                    <span className="text-[8px] font-black text-white italic">{card.brand}</span>
                  </span>
                  <p className="text-xs font-extrabold text-white font-numeric">•••• {card.last4}</p>
                  <p className="text-[9.5px] text-gray-500 mt-1">
                    {card.expMonth && card.expYear
                      ? `Son kullanma ${String(card.expMonth).padStart(2, '0')}/${String(card.expYear).slice(-2)}`
                      : card.isDefault ? 'Varsayılan kart' : ''}
                  </p>
                </button>
              );
            })}

            {/* Tek seferlik kart */}
            {tempCard && (
              <button onClick={() => setSelectedCardId('temp')}
                style={{ scrollSnapAlign: 'start' }}
                className={`shrink-0 w-[158px] rounded-[20px] p-4 text-left bg-[#161B22] relative transition-all ${
                  needsCard && selectedCardId === 'temp' ? 'border-2 border-[#39FF14] shadow-[0_0_22px_rgba(57,255,20,0.18)]' : 'border border-white/8'
                } ${!needsCard ? 'opacity-45' : ''}`}
              >
                {needsCard && selectedCardId === 'temp' && (
                  <span className="absolute top-3 right-3 w-[22px] h-[22px] rounded-full bg-[#39FF14] flex items-center justify-center">
                    <Check size={14} strokeWidth={3} className="text-[#0A0E14]" />
                  </span>
                )}
                <span className={`w-11 h-[30px] rounded-md bg-gradient-to-br ${tempCard.gradient} flex items-center justify-center mb-10`}>
                  <span className="text-[8px] font-black text-white italic">{tempCard.brand}</span>
                </span>
                <p className="text-xs font-extrabold text-white font-numeric">•••• {tempCard.last4}</p>
                <p className="text-[9.5px] text-gray-500 mt-1">Tek seferlik · kaydedilmedi</p>
              </button>
            )}

            {/* Yeni kart ekle */}
            <button onClick={() => setScreen('ADD_CARD')}
              style={{ scrollSnapAlign: 'start' }}
              className="shrink-0 w-[120px] rounded-[20px] p-4 border-[1.5px] border-dashed border-white/16 flex flex-col items-center justify-center gap-2.5 text-gray-400">
              <span className="w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center"><Plus size={20} /></span>
              <p className="text-[11px] font-bold text-center leading-tight">Yeni<br />kart ekle</p>
            </button>
          </div>
        </div>

        {/* Bilgi notu — canlı bakiye/kart dağılımı */}
        <div className={`mx-5 flex gap-2.5 items-start rounded-2xl p-3.5 border ${
          !allowBalance ? 'bg-yellow-400/6 border-yellow-400/16' : 'bg-[#39FF14]/6 border-[#39FF14]/16'
        }`}>
          <span className={`shrink-0 mt-0.5 ${!allowBalance ? 'text-[#FACC15]' : 'text-[#39FF14]'}`}>
            {!allowBalance ? <Shield size={15} /> : <Info size={15} />}
          </span>
          <p className="text-[11.5px] text-gray-300 leading-relaxed">{noteText}</p>
        </div>

        {/* Kapora güven notu */}
        {ctx.isDeposit && ctx.infoNote && (
          <div className="mx-5 flex gap-2.5 items-start px-1">
            <Shield size={15} className="text-[#FACC15] shrink-0 mt-0.5" />
            <p className="text-[11.5px] text-gray-400 leading-relaxed">{ctx.infoNote}</p>
          </div>
        )}

        {/* Uyum notu: fiziksel hizmet + iptal/iade koşulları */}
        <button onClick={() => useAppStore.getState().navigateTo('LEGAL')}
          className="mx-5 text-left flex gap-2 items-center px-1">
          <Info size={12} className="text-gray-600 shrink-0" />
          <p className="text-[10px] text-gray-600 leading-relaxed">
            Ödemeler saha/maç/hizmet bedeli içindir. <span className="underline">Mesafeli satış ve iptal/iade koşulları</span>
          </p>
        </button>
      </main>

      {/* Sabit footer */}
      <div className="fixed bottom-0 inset-x-0 max-w-lg md:max-w-2xl mx-auto px-5 pb-safe pt-4 bg-gradient-to-t from-[#0A0E14] via-[#0A0E14]/95 to-transparent border-t border-white/5 z-20">
        <div className="flex items-center justify-between mb-3 px-0.5">
          <span className="text-[11px] text-gray-500 font-semibold">{breakdown}</span>
          <span className="text-[13px] font-extrabold text-white">
            Toplam <span className={ctx.isDeposit ? 'text-[#FACC15]' : 'text-[#39FF14]'}>{fmt(amount)}₺</span>
          </span>
        </div>
        <button
          disabled={!canPay}
          onClick={handlePay}
          className={`w-full py-4 font-black text-base rounded-2xl flex items-center justify-center gap-2 transition-all active:scale-[0.98] ${
            canPay
              ? 'bg-[#39FF14] text-[#0A0E14] shadow-[0_0_30px_rgba(57,255,20,0.28)]'
              : 'bg-gray-800 text-gray-500'
          }`}
        >
          <Lock size={17} /> {fmt(amount)}₺ {ctx.isDeposit ? 'KAPORA ÖDE' : 'ÖDE'}
        </button>
        {needsCard && !selectedCard && (
          <p className="text-center text-[10px] text-gray-500 mt-2">Devam etmek için bir kart seç veya yeni kart ekle.</p>
        )}
      </div>
    </div>
  );
};

// ─── Yardımcılar ──────────────────────────────────────────────────────────────

const SummaryRow = ({ label, value, dim, mono }: { label: string; value: string; dim?: boolean; mono?: boolean }) => (
  <div className="flex justify-between items-center gap-4 text-[13px]">
    <span className="text-gray-500 shrink-0">{label}</span>
    <span className={`font-bold text-right truncate ${dim ? 'text-gray-600' : 'text-white'} ${mono ? 'font-numeric text-[11px]' : ''}`}>
      {value}
    </span>
  </div>
);

export default PaymentScreen;
