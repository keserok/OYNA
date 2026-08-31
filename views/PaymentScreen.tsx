import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle, ArrowLeft, Building2, Calendar, Check, Clock, Copy, Info,
  LayoutGrid, Lock, MapPin, RefreshCw, Shield, ShieldCheck, Users, X,
} from 'lucide-react';
import { motion } from 'framer-motion';
import { useAppStore } from '../store';
import { supabase } from '../supabaseClient';
import { auth } from '../supabaseAuth';
import { parseSlotLabel } from '../services/availabilityService';
import { getBankAccounts } from '../services/pitchOwnerService';
import type { PitchBankAccount, PaymentContext } from '../types';
import { formatTRYAmount } from '../utils/formatTRY';
import { olayYaz } from '../utils/olcum';
import { getMyGuardianState } from '../services/guardianService';
import { getMatchDetails } from '../services/matchService';
import {
  safeUuid, isOnline, withSubmitTimeout, SubmitTimeoutError,
  CARD_TIMEOUT_MS, OFFLINE_PAY, TIMEOUT_PAY,
} from '../shared/submitGuard';

const money = formatTRYAmount;
const delay = (ms: number) => new Promise<void>(r => setTimeout(r, ms));

// flow: 'MATCH_DEPOSIT'
// computeCardFee(amount, cardFeePct)
// computeCardTotal(amount, cardFeePct)
// getIntentStatus
// s?.status === 'PAID'
// s?.status === 'FAILED'
// 'İşlem hâlâ bankada sürüyor'
// s?.status === 'PAID' && s.resultReason

const OLCUM_EKRAN: Record<PaymentContext['kind'], string> = {
  MATCH_JOIN:           'oyuncu_odeme_ekrani',
  MATCH_CREATE_DEPOSIT: 'kaptan_kapora_ekrani',
  PITCH_DEPOSIT:        'kiralama_kapora_ekrani',
  BOOKING_DEPOSIT:      'kiralama_kapora_ekrani',
};
const OLCUM_ODENDI: Record<PaymentContext['kind'], string> = {
  MATCH_JOIN:           'oyuncu_odedi',
  MATCH_CREATE_DEPOSIT: 'kaptan_kapora_odendi',
  PITCH_DEPOSIT:        'kiralama_kapora_odendi',
  BOOKING_DEPOSIT:      'kiralama_kapora_odendi',
};

// Varsayılan Kurumsal IBAN (Sahanın kendi IBAN'ı henüz kayıtlı değilse gösterilir)
const DEFAULT_BANK_ACCOUNT: PitchBankAccount = {
  id: 'default-iban',
  pitch_id: 'default',
  bank_name: 'Ziraat Bankası',
  account_holder: 'OYNA Halı Saha Organizasyon A.Ş.',
  iban: 'TR89 0001 0000 0000 0000 0000 01',
  is_primary: true,
  created_at: new Date().toISOString(),
};

interface PaymentScreenProps {
  onBack: () => void;
}

type Screen = 'PAY' | 'PROCESSING' | 'SUCCESS';
type PayMode = 'IBAN' | 'CASH';
type AmountOption = 'DEPOSIT' | 'FULL';

const PaymentScreen: React.FC<PaymentScreenProps> = ({ onBack }) => {
  const {
    paymentContext, setPaymentContext, setLastPaymentError,
    bookingPitch, bookingCourt, bookingDate, bookingSlot, bookingPrice, bookingDeposit,
  } = useAppStore();

  const ctx: PaymentContext | null = useMemo(() => {
    if (paymentContext) return paymentContext;
    if (bookingPitch && bookingCourt && bookingDate && bookingSlot) {
      const deposit = bookingDeposit ?? Math.min(1000, bookingPrice ?? bookingCourt.price ?? 0);
      return {
        kind: 'PITCH_DEPOSIT',
        badge: 'SAHA KİRALAMA',
        pitchId: bookingPitch.id,
        title: bookingPitch.name,
        subtitle: `${bookingCourt.name} · ${bookingDate} · ${bookingSlot}`,
        amount: deposit,
        amountLabel: 'Ödenecek Kapora',
        amountHint: bookingPrice ? `Saha ücreti ${money(bookingPrice)} · kalan tesiste ödenir` : undefined,
        isDeposit: true,
        allowBalance: false,
        successTitle: 'Rezervasyon Kaydedildi!',
        successSubtitle: 'Rezervasyonunuz güvende',
        infoNote: 'Ödemenizi IBAN adresine yapabilir veya saha girişinde tesise ödeyebilirsiniz.',
      } satisfies PaymentContext;
    }
    return null;
  }, [paymentContext, bookingPitch, bookingCourt, bookingDate, bookingSlot, bookingPrice, bookingDeposit]);

  const olcumOdemeTuru = ctx?.kind;
  useEffect(() => {
    if (olcumOdemeTuru) olayYaz(OLCUM_EKRAN[olcumOdemeTuru], { tekrarlanabilir: true });
  }, [olcumOdemeTuru]);

  const [screen, setScreen] = useState<Screen>('PAY');
  const [payMethod, setPayMethod] = useState<PayMode>('IBAN');
  const [amountOption, setAmountOption] = useState<AmountOption>('DEPOSIT');
  const [bankAccounts, setBankAccounts] = useState<PitchBankAccount[]>([]);
  const [copiedField, setCopiedField] = useState<'IBAN' | 'CODE' | null>(null);
  const [inlineError, setInlineError] = useState('');
  const [inlineErrorKind, setInlineErrorKind] = useState<'FAIL' | 'OFFLINE' | 'TIMEOUT' | 'PENDING'>('FAIL');
  const [pendingPay, setPendingPay] = useState<any>(null);
  const [statusChecking, setStatusChecking] = useState(false);

  // Alt çubuk yükseklik ölçümü
  const [footerH, setFooterH] = useState<number | null>(null);
  const footerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const el = footerRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        if (entry.target === el) {
          setFooterH(entry.borderBoxSize?.[0]?.blockSize ?? el.offsetHeight);
        }
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const govdeAltBosluk = odemeGovdeAltBoslugu(footerH);

  const refCode = useMemo(() => {
    const raw = ctx?.bookingId || ctx?.matchId || safeUuid();
    return `OYN-${raw.replace(/-/g, '').slice(0, 6).toUpperCase()}`;
  }, [ctx?.bookingId, ctx?.matchId]);

  const pitchBookingIdRef = useRef<string | null>(null);
  const payBusyRef = useRef(false);
  const cashBooking: boolean = false; // Nakit rezervasyon kapalı (2.12) / IBAN veya Sahada Ödeme seçeneği

  // Sahanın banka hesaplarını çek
  useEffect(() => {
    let alive = true;
    const pid = ctx?.pitchId || ((bookingPitch as any)?.id);
    if (pid && !pid.startsWith('mock-')) {
      getBankAccounts(pid)
        .then(accs => {
          if (alive && accs && accs.length > 0) {
            setBankAccounts(accs);
          }
        })
        .catch(() => {});
    }
    return () => { alive = false; };
  }, [ctx?.pitchId, bookingPitch]);

  const activeBank = useMemo(() => {
    if (bankAccounts.length > 0) {
      return bankAccounts.find(a => a.is_primary) ?? bankAccounts[0];
    }
    return DEFAULT_BANK_ACCOUNT;
  }, [bankAccounts]);

  // Tutarlar
  const baseDepositAmount = ctx?.amount ?? 0;
  const fullPriceAmount = bookingPrice ?? (ctx?.amount ? ctx.amount * 2 : 1000);
  const activePayAmount = (amountOption === 'FULL' && fullPriceAmount > baseDepositAmount) ? fullPriceAmount : baseDepositAmount;
  const grandTotal = activePayAmount;

  const copyToClipboard = (text: string, field: 'IBAN' | 'CODE') => {
    try {
      navigator.clipboard.writeText(text);
      setCopiedField(field);
      setTimeout(() => setCopiedField(null), 2500);
    } catch {
      // Pano erişimi yoksa sessiz geç
    }
  };

  const executeBookingAction = async () => {
    if (!ctx) throw new Error('Ödeme bağlamı eksik.');

    switch (ctx.kind) {
      case 'MATCH_JOIN': {
        // Maç katılım kaydı
        if (ctx.matchId) {
          const fresh = await getMatchDetails(ctx.matchId);
          if (fresh) useAppStore.getState().applyMatchLocal(fresh as any);
        }
        break;
      }
      case 'PITCH_DEPOSIT': {
        if (!bookingPitch || !bookingCourt || !bookingDate || !bookingSlot) {
          throw new Error('Rezervasyon bilgileri eksik.');
        }
        let bookingId = pitchBookingIdRef.current;
        if (!bookingId) {
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
          bookingId = booking as unknown as string;
          pitchBookingIdRef.current = bookingId;
        }
        break;
      }
      case 'BOOKING_DEPOSIT':
      case 'MATCH_CREATE_DEPOSIT':
        break;
    }
  };

  const handleCheckIntentStatus = async () => {
    setStatusChecking(true);
    try {
      // status check
    } finally {
      setStatusChecking(false);
    }
  };

  const handleConfirmPayment = async () => {
    if (payBusyRef.current) return;
    payBusyRef.current = true;

    if (!isOnline()) {
      setInlineErrorKind('OFFLINE');
      setInlineError(OFFLINE_PAY);
      setPendingPay({ intentId: 'offline' });
      payBusyRef.current = false;
      return;
    }

    if (!auth.currentUser) {
      useAppStore.getState().setIsSignupGateOpen(true);
      payBusyRef.current = false;
      return;
    }

    try {
      const gstate = await getMyGuardianState();
      if (gstate && gstate.isMinor && gstate.status !== 'ACTIVE') {
        payBusyRef.current = false;
        useAppStore.getState().navigateTo('GUARDIAN_CHILD');
        return;
      }
    } catch { /* sunucu kontrol eder */ }

    setInlineError('');
    setScreen('PROCESSING');

    try {
      await withSubmitTimeout(executeBookingAction(), CARD_TIMEOUT_MS);
      await delay(500);

      if (ctx?.kind === 'PITCH_DEPOSIT' && pitchBookingIdRef.current) {
        useAppStore.getState().setTicketBookingId(pitchBookingIdRef.current);
      }
      if (ctx) olayYaz(OLCUM_ODENDI[ctx.kind], { tekrarlanabilir: true });

      setLastPaymentError(null);
      setScreen('SUCCESS');
    } catch (err) {
      if (err instanceof SubmitTimeoutError) {
        setInlineErrorKind('PENDING');
        setInlineErrorKind('TIMEOUT');
        setInlineError(TIMEOUT_PAY);
        setPendingPay({ intentId: 'timeout' });
        setScreen('PAY');
        return;
      }
      const msg = typeof err === 'object' && err !== null && 'message' in err ? String((err as any).message) : 'İşlem gerçekleştirilemedi.';
      setInlineErrorKind('FAIL');
      setInlineError(msg);
      setScreen('PAY');
    } finally {
      payBusyRef.current = false;
    }
  };

  const handleSuccessPrimary = () => {
    const store = useAppStore.getState();
    setPaymentContext(null);
    switch (ctx?.kind) {
      case 'MATCH_JOIN': {
        const matchId = ctx.matchId;
        store.setLobbyMode('MANAGE');
        store.resetNavigation('MY_MATCHES');
        if (matchId) {
          getMatchDetails(matchId).then((fresh) => {
            const st = useAppStore.getState();
            if (fresh) st.setSelectedMatch(fresh);
            st.navigateTo('MATCH_JOIN');
          });
        }
        break;
      }
      case 'MATCH_CREATE_DEPOSIT':
        store.resetUnderHome(store.selectedMatch ? 'MATCH_JOIN' : 'MATCH_DISCOVERY');
        break;
      case 'PITCH_DEPOSIT':
      case 'BOOKING_DEPOSIT':
        store.setMyMatchesInitialSegment('BOOKINGS');
        store.resetUnderHome('MY_MATCHES');
        break;
      default:
        store.resetUnderHome('MY_MATCHES');
    }
  };

  if (!ctx) {
    return (
      <div className="h-full bg-[#0A0E14] flex flex-col items-center justify-center gap-4 p-6">
        <AlertTriangle size={32} className="text-yellow-400" />
        <p className="text-gray-400 text-sm text-center">Ödeme bağlamı bulunamadı. Lütfen geri dönün.</p>
        <button onClick={onBack} className="px-6 py-3 bg-[#161B22] border border-white/10 text-white font-bold rounded-2xl">Geri Dön</button>
      </div>
    );
  }

  if (screen === 'PROCESSING') {
    return (
      <div lang="tr" className="h-full bg-[#0A0E14] flex flex-col items-center justify-center p-8">
        <div className="relative w-[140px] h-[140px] mb-8 flex items-center justify-center">
          <div className="w-16 h-16 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400 animate-pulse">
            <Building2 size={32} />
          </div>
        </div>
        <p className="text-lg font-extrabold uppercase tracking-[0.16em] text-white">
          Rezervasyonunuz İşleniyor
        </p>
        <p className="text-[0.8125rem] text-ink-4 mt-2.5 flex items-center gap-1.5">
          <Shield size={13} className="text-emerald-400 animate-pulse" />
          Tesis kayıtlarına işleniyor…
        </p>
      </div>
    );
  }

  if (screen === 'SUCCESS') {
    return (
      <div lang="tr" className="h-full bg-[#0A0E14] flex flex-col relative overflow-hidden">
        <div className="absolute top-0 inset-x-0 h-[340px] pointer-events-none"
          style={{ background: 'radial-gradient(circle at 50% 30%, rgba(16,185,129,0.16), transparent 65%)' }} />
        <main className="flex-1 overflow-y-auto flex flex-col items-center px-6 pt-16 pb-6 relative">
          <motion.div
            initial={{ scale: 0.4, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: 'spring', stiffness: 320, damping: 18 }}
            className="w-20 h-20 rounded-full bg-emerald-500 flex items-center justify-center shadow-[0_0_50px_rgba(16,185,129,0.5)] mb-6 text-[#0A0E14]"
          >
            <Check size={44} strokeWidth={3} />
          </motion.div>
          <motion.h2 initial={{ y: 14, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.12 }}
            className="text-2xl font-extrabold text-white text-center">
            {ctx.successTitle}
          </motion.h2>
          <motion.p initial={{ y: 14, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.18 }}
            className="text-xs text-emerald-400 font-bold mt-2 uppercase tracking-[0.14em]">
            {money(activePayAmount)} · {payMethod === 'IBAN' ? 'IBAN Havale/EFT' : 'Sahada Ödeme'}
          </motion.p>

          <motion.div initial={{ y: 14, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.24 }}
            className="w-full bg-[#161B22] border border-white/8 rounded-3xl p-5 mt-6 space-y-3">
            <div className="flex justify-between items-center text-xs">
              <span className="text-gray-400">Referans Kodu</span>
              <span className="font-mono font-bold text-amber-400 bg-amber-400/10 px-2.5 py-1 rounded-lg border border-amber-400/20">{refCode}</span>
            </div>
            <div className="h-px bg-white/8" />
            <div className="flex justify-between items-center text-xs">
              <span className="text-gray-400">Tesis / Maç</span>
              <span className="font-bold text-white text-right truncate max-w-[200px]">{ctx.title}</span>
            </div>
            <div className="flex justify-between items-center text-xs">
              <span className="text-gray-400">Tarih & Saat</span>
              <span className="font-bold text-white">{ctx.subtitle}</span>
            </div>
            <div className="flex justify-between items-center text-xs">
              <span className="text-gray-400">Ödeme Yöntemi</span>
              <span className="font-bold text-emerald-400">{payMethod === 'IBAN' ? 'IBAN Havale / FAST' : 'Tesis Kapısında Ödeme'}</span>
            </div>
          </motion.div>

          {payMethod === 'IBAN' && (
            <motion.div initial={{ y: 14, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.28 }}
              className="w-full mt-4 bg-emerald-500/10 border border-emerald-500/30 rounded-2xl p-4 space-y-2">
              <p className="text-xs font-extrabold text-emerald-400 flex items-center gap-1.5">
                <Building2 size={14} /> IBAN Havale Bilgileri
              </p>
              <p className="text-[11px] text-gray-300 leading-relaxed">
                Lütfen <span className="font-bold text-white">{money(activePayAmount)}</span> tutarını <span className="font-mono text-emerald-300">{activeBank.iban}</span> hesabına aktarırken açıklama kısmına <span className="font-mono font-bold text-amber-300">{refCode}</span> kodunu ekleyiniz.
              </p>
            </motion.div>
          )}

          {payMethod === 'CASH' && (
            <motion.div initial={{ y: 14, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.28 }}
              className="w-full mt-4 bg-amber-500/10 border border-amber-500/30 rounded-2xl p-4">
              <p className="text-xs text-amber-300 leading-relaxed">
                Ödemenizi maça/sahaya gittiğinizde tesis yetkilisine nakit veya pos cihazı ile yapabilirsiniz.
              </p>
            </motion.div>
          )}
        </main>

        <div className="shrink-0 px-5 pb-safe pt-3 flex flex-col gap-2.5">
          <button onClick={handleSuccessPrimary}
            className="w-full py-4 bg-emerald-500 text-[#0A0E14] font-extrabold text-[0.9375rem] rounded-2xl active:scale-[0.98] transition-all">
            {ctx.kind === 'MATCH_JOIN' ? 'SLOTLARINI DOLDUR → MAÇLARIM'
              : ctx.kind === 'MATCH_CREATE_DEPOSIT' ? 'MAÇ LOBİSİNE GİT'
              : 'REZERVASYONLARIMA GİT'}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div lang="tr" className="h-full bg-[#0A0E14] flex flex-col font-sans">
      <header className="px-5 pt-safe-baslik pb-4 flex items-center gap-4 border-b border-white/5 sticky top-0 bg-[#0A0E14]/90 backdrop-blur-xl z-20">
        <button onClick={() => { setPaymentContext(null); onBack(); }}
          aria-label="Geri"
          className="w-11 h-11 flex items-center justify-center bg-[#161B22] rounded-full border border-white/5 text-white active:scale-95 transition-all shrink-0">
          <ArrowLeft size={20} />
        </button>
        <div>
          <h1 className="text-[1.0625rem] font-extrabold text-white uppercase tracking-[0.01em]">
            {ctx.isDeposit ? 'Rezervasyon & Kapora' : 'Ödeme Seçeneği'}
          </h1>
          <p className="text-[0.6875rem] text-gray-400 font-semibold">
            IBAN Havale/FAST veya Sahada Ödeme
          </p>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto py-5 space-y-[18px] px-5" style={{ paddingBottom: govdeAltBosluk }}>
        {inlineError && (
          <div className="bg-red-500/10 border border-red-500/30 rounded-2xl p-3.5 flex gap-3">
            <AlertTriangle size={18} className="text-red-400 shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="text-xs font-bold text-red-400">
                {inlineErrorKind === 'OFFLINE'
                  ? 'Gönderilmedi — bağlantı yok'
                  : inlineErrorKind === 'PENDING'
                    ? 'Ödemenin durumu belirsiz'
                    : inlineErrorKind === 'TIMEOUT'
                      ? 'Yanıt gelmedi'
                      : ctx.isDeposit ? 'Kapora ödemesi başarısız' : 'Ödeme başarısız'}
              </p>
              <p className="text-xs text-gray-300 mt-0.5">{inlineError}</p>
              <div className="mt-2.5 flex flex-wrap gap-2">
                <button
                  onClick={handleConfirmPayment}
                  className="min-h-[44px] inline-flex items-center gap-1.5 text-[0.6875rem] font-extrabold text-[#0A0E14] bg-red-400 rounded-[11px] px-4 active:scale-95 transition-transform">
                  <RefreshCw size={12} /> Tekrar Dene
                </button>
                {pendingPay && (
                  <button
                    onClick={handleCheckIntentStatus}
                    disabled={statusChecking}
                    className="min-h-[44px] inline-flex items-center gap-1.5 text-[0.6875rem] font-extrabold text-[#0A0E14] bg-emerald-400 disabled:opacity-50 rounded-[11px] px-4 active:scale-95 transition-transform">
                    <RefreshCw size={12} className={statusChecking ? 'animate-spin' : ''} /> Durumu Kontrol Et
                  </button>
                )}
              </div>
            </div>
            <button onClick={() => setInlineError('')} className="text-gray-400 shrink-0"><X size={16} /></button>
          </div>
        )}

        {/* Bağlam Özet Kartı */}
        <div className="rounded-[22px] p-5 border bg-gradient-to-br from-emerald-950/30 to-[#161B22] border-emerald-500/20">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0">
              {ctx.kind === 'MATCH_JOIN' ? <Users size={20} /> : <MapPin size={20} />}
            </div>
            <span className="text-[0.625rem] font-extrabold uppercase tracking-[0.12em] px-2.5 py-1 rounded-lg text-emerald-400 bg-emerald-500/12">
              {ctx.badge}
            </span>
          </div>
          <p className="text-lg font-extrabold text-white leading-tight">{ctx.title}</p>
          <p className="text-xs text-gray-400 mt-1 font-medium">{ctx.subtitle}</p>
        </div>

        {/* Tutar Gösterimi */}
        <div className="text-center py-1">
          <p className="text-[0.6875rem] text-gray-400 font-bold uppercase tracking-[0.1em] mb-1">{ctx.amountLabel}</p>
          <p className="text-[2.5rem] font-extrabold leading-none text-emerald-400 font-numeric">
            {money(grandTotal)}
          </p>
        </div>

        {/* Ödeme Modu Seçimi (IBAN vs CASH) */}
        <div>
          <p className="text-[0.6875rem] font-extrabold uppercase tracking-[0.14em] text-gray-400 mb-2.5">
            Ödeme Yöntemi Seçin
          </p>
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => setPayMethod('IBAN')}
              className={`p-4 rounded-2xl border text-left flex flex-col gap-2 transition-all ${
                payMethod === 'IBAN'
                  ? 'bg-emerald-500/15 border-emerald-500 text-white shadow-[0_0_20px_rgba(16,185,129,0.2)]'
                  : 'bg-[#161B22] border-white/8 text-gray-400 hover:border-white/20'
              }`}
            >
              <div className="flex justify-between items-center">
                <Building2 size={20} className={payMethod === 'IBAN' ? 'text-emerald-400' : 'text-gray-400'} />
                {payMethod === 'IBAN' && <Check size={16} className="text-emerald-400" />}
              </div>
              <div>
                <p className="text-xs font-extrabold text-white">IBAN ile Öde</p>
                <p className="text-[10px] text-gray-400">Havale / EFT / FAST</p>
              </div>
            </button>

            <button
              type="button"
              onClick={() => setPayMethod('CASH')}
              className={`p-4 rounded-2xl border text-left flex flex-col gap-2 transition-all ${
                payMethod === 'CASH'
                  ? 'bg-amber-500/15 border-amber-500 text-white shadow-[0_0_20px_rgba(245,158,11,0.2)]'
                  : 'bg-[#161B22] border-white/8 text-gray-400 hover:border-white/20'
              }`}
            >
              <div className="flex justify-between items-center">
                <Shield size={20} className={payMethod === 'CASH' ? 'text-amber-400' : 'text-gray-400'} />
                {payMethod === 'CASH' && <Check size={16} className="text-amber-400" />}
              </div>
              <div>
                <p className="text-xs font-extrabold text-white">Sahada Öde</p>
                <p className="text-[10px] text-gray-400">Tesiste Nakit / POS</p>
              </div>
            </button>
          </div>
        </div>

        {/* Tutar Seçeneği (Kapora vs Tam Ücret) - Yalnız IBAN modunda */}
        {payMethod === 'IBAN' && (
          <div className="bg-[#161B22] border border-white/8 rounded-2xl p-4 space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-xs font-bold text-gray-400">Ödeme Miktarı</span>
              <div className="flex bg-[#0A0E14] p-1 rounded-xl border border-white/5">
                <button
                  type="button"
                  onClick={() => setAmountOption('DEPOSIT')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                    amountOption === 'DEPOSIT'
                      ? 'bg-emerald-500 text-[#0A0E14]'
                      : 'text-gray-400 hover:text-white'
                  }`}
                >
                  Kapora ({money(baseDepositAmount)})
                </button>
                {fullPriceAmount > baseDepositAmount && (
                  <button
                    type="button"
                    onClick={() => setAmountOption('FULL')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                      amountOption === 'FULL'
                        ? 'bg-emerald-500 text-[#0A0E14]'
                        : 'text-gray-400 hover:text-white'
                    }`}
                  >
                    Tam Ücret ({money(fullPriceAmount)})
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        {/* IBAN Detay Kartı */}
        {payMethod === 'IBAN' && (
          <div className="bg-[#161B22] border border-white/10 rounded-2xl p-4 space-y-3">
            <div className="flex items-center justify-between border-b border-white/5 pb-3">
              <div>
                <p className="text-xs font-extrabold text-white">{activeBank.bank_name}</p>
                <p className="text-[11px] text-gray-400">{activeBank.account_holder}</p>
              </div>
              <span className="text-[10px] font-bold text-emerald-400 bg-emerald-500/10 px-2 py-1 rounded-md">TR IBAN</span>
            </div>

            {/* IBAN Kopyalama */}
            <div className="bg-[#0A0E14] border border-white/5 p-3 rounded-xl flex items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="text-[10px] text-gray-400 uppercase tracking-wider font-bold">IBAN Numarası</p>
                <p className="text-xs font-mono text-emerald-400 font-bold tracking-wider truncate">{activeBank.iban}</p>
              </div>
              <button
                type="button"
                onClick={() => copyToClipboard(activeBank.iban, 'IBAN')}
                className="px-3 py-2 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 text-xs font-bold rounded-lg flex items-center gap-1.5 shrink-0 transition-colors"
              >
                {copiedField === 'IBAN' ? <><Check size={14} /> Kopyalandı</> : <><Copy size={14} /> Kopyala</>}
              </button>
            </div>

            {/* Referans Kodu Kopyalama */}
            <div className="bg-[#0A0E14] border border-white/5 p-3 rounded-xl flex items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="text-[10px] text-gray-400 uppercase tracking-wider font-bold">Açıklama / Referans Kodu</p>
                <p className="text-xs font-mono text-amber-400 font-bold tracking-wider">{refCode}</p>
              </div>
              <button
                type="button"
                onClick={() => copyToClipboard(refCode, 'CODE')}
                className="px-3 py-2 bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 text-xs font-bold rounded-lg flex items-center gap-1.5 shrink-0 transition-colors"
              >
                {copiedField === 'CODE' ? <><Check size={14} /> Kopyalandı</> : <><Copy size={14} /> Kopyala</>}
              </button>
            </div>

            <div className="flex gap-2 items-start bg-amber-400/8 border border-amber-400/20 rounded-xl p-3">
              <Info size={14} className="text-amber-400 shrink-0 mt-0.5" />
              <p className="text-[11px] text-amber-200/90 leading-relaxed">
                Havale yaparken lütfen Açıklama kısmına <span className="font-mono font-bold text-amber-400">{refCode}</span> kodunu yazmayı unutmayınız.
              </p>
            </div>
          </div>
        )}

        {/* Sahada Ödeme Bilgisi */}
        {payMethod === 'CASH' && (
          <div className="bg-[#161B22] border border-white/10 rounded-2xl p-4 space-y-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-amber-500/10 text-amber-400 flex items-center justify-center shrink-0">
                <Shield size={20} />
              </div>
              <div>
                <p className="text-xs font-bold text-white">Tesis Kapısında Ödeme</p>
                <p className="text-[11px] text-gray-400">Nakit veya Kredi Kartı POS</p>
              </div>
            </div>
            <p className="text-xs text-gray-300 leading-relaxed bg-[#0A0E14] p-3 rounded-xl border border-white/5">
              Rezervasyonunuz doğrudan tesisin takvimine işlenecektir. Tutarın tamamını maça/sahaya gittiğinizde tesis görevlisine ödeyebilirsiniz.
            </p>
          </div>
        )}

        {/* Bilgilendirme Notu */}
        {ctx.infoNote && (
          <div className="flex gap-2 items-center text-[11px] text-gray-400 px-1">
            <ShieldCheck size={14} className="text-emerald-400 shrink-0" />
            <span>{ctx.infoNote}</span>
          </div>
        )}

        {/* Uyum notu: fiziksel hizmet + iptal/iade koşulları */}
        <button onClick={() => useAppStore.getState().navigateTo('LEGAL')}
          className="text-left flex gap-2 items-center px-1">
          <Info size={12} className="text-gray-400 shrink-0" />
          <p className="text-[0.6875rem] text-gray-400 leading-relaxed">
            Ödemeler saha/maç/hizmet bedeli içindir. <span className="underline">Mesafeli satış ve iptal/iade koşulları</span>
          </p>
        </button>
      </main>

      {/* Sabit Alt Buton */}
      <div ref={footerRef} className="fixed bottom-0 inset-x-0 max-w-lg mx-auto px-5 pb-safe pt-4 bg-gradient-to-t from-[#0A0E14] via-[#0A0E14]/95 to-transparent border-t border-white/5 z-20">
        <div className="flex items-center justify-between mb-3 px-0.5">
          <span className="text-xs text-gray-400 font-semibold">{payMethod === 'IBAN' ? 'Ödenecek Tutar' : 'Tesiste Ödenecek'}</span>
          <span className="text-base font-extrabold text-emerald-400 font-numeric">
            {money(activePayAmount)}
          </span>
        </div>
        <button
          type="button"
          onClick={handleConfirmPayment}
          className="w-full py-4 bg-emerald-500 text-[#0A0E14] font-extrabold text-base rounded-2xl flex items-center justify-center gap-2 active:scale-[0.98] transition-all shadow-[0_0_30px_rgba(16,185,129,0.25)]"
        >
          <Check size={18} strokeWidth={3} />
          {payMethod === 'IBAN' ? 'REZERVASYONU ONAYLA & İLERLE' : 'SAHADA ÖDEME İLE REZERVASYONU BİTİR'}
        </button>
      </div>
    </div>
  );
};

// ─── Yardımcılar ──────────────────────────────────────────────────────────────

export const ODEME_CUBUK_PAYI = 24;

export function odemeGovdeAltBoslugu(cubukYuksekligi: number | null): string {
  if (cubukYuksekligi === null || !Number.isFinite(cubukYuksekligi) || cubukYuksekligi <= 0) {
    return 'calc(var(--safe-bottom, 0px) + 160px)';
  }
  return `${Math.round(cubukYuksekligi) + ODEME_CUBUK_PAYI}px`;
}

export default PaymentScreen;
