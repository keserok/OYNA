import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle, ArrowLeft, ArrowUpRight, Check, CheckCircle2, Clock,
  CreditCard, Gift, History, Info, Landmark, List, Pencil, Plus,
  RefreshCw, RotateCcw, Shield, Trash2, TrendingUp, Users, Wallet, X, Zap,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { supabase } from '../supabaseClient';
import { useAppStore } from '../store';
import { UserRole } from '../types';
import {
  getWalletSummary, listSavedCards, deleteSavedCard, setDefaultSavedCard,
  getOwnerEarningsSummary, EarningsSummary, WalletSummary, SavedCard,
} from '../services/walletService';
import { startInAppCardPayment } from '../services/paymentService';
import AddCardScreen from '../components/payment/AddCardScreen';
import CardBrandMark from '../components/payment/CardBrandMark';
import ThreeDSSheet, { ThreeDSOutcome } from '../components/payment/ThreeDSSheet';

/**
 * CÜZDAN — role göre iki yapı (tasarım 2a + kaleci/hakem):
 *   • Oyuncu: Yüklenen Bakiye (hero) + İade Kredisi chip'i, Para Yükle /
 *     Kart Yönet / Geçmiş, kayıtlı kart karuseli, son işlemler. Kazanç
 *     bakiyesi > 0 ise (ör. referral) koşullu küçük kazanç satırı görünür —
 *     para mahsur kalmaz.
 *   • Kaleci & Hakem & Tesis: Çekilebilir Kazanç (altın hero) + IBAN'a Çek.
 *     Para yükleme YOKTUR.
 * Hata: başarısız ödeme cüzdanda kırmızı banner + 'Tekrar dene' olarak görünür.
 *
 * STORE UYUMU: bakiye yalnız OYNA içindeki fiziksel hizmetlere harcanır;
 * dijital ürün satışı yoktur. Yüklemede bonus/teşvik yoktur.
 */

interface WalletScreenProps {
  onBack: () => void;
}

interface WalletTx {
  id: string;
  amount: number;
  type: string;
  balance_type: 'EARNINGS' | 'REFUND_CREDIT' | 'TOP_UP';
  status: string;
  description: string | null;
  created_at: string;
}

interface PayoutRequest {
  id: string;
  amount: number;
  iban: string;
  iban_holder_name: string;
  status: string;
  created_at: string;
}

type View = 'MAIN' | 'TOPUP' | 'CARDS' | 'ADD_CARD' | 'HISTORY' | 'PAYOUT_FORM';
type HistoryFilter = 'ALL' | 'TOPUP' | 'PAYMENT' | 'REFUND' | 'EARNING';

const fmt = (n: number) => n.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtInt = (n: number) => n.toLocaleString('tr-TR', { maximumFractionDigits: 0 });

const INCOME_TYPES = new Set(['TOP_UP', 'DEPOSIT', 'REFUND', 'MATCH_REFUND', 'MATCH_EARNING', 'BOOKING_EARNING', 'SERVICE_EARNING', 'REFERRAL_BONUS']);
const TOPUP_PRESETS = [300, 500, 750, 1000, 1500];
const TOPUP_MIN = 300;

const formatIBAN = (raw: string): string => {
  const clean = raw.replace(/[^A-Z0-9]/gi, '').toUpperCase().slice(0, 26);
  return clean.replace(/(.{4})/g, '$1 ').trim();
};
const validateIBAN = (raw: string): boolean => {
  const clean = raw.replace(/\s/g, '');
  return clean.length === 26 && clean.startsWith('TR');
};

const txMeta = (tx: WalletTx): { icon: React.ReactNode; bg: string; color: string; income: boolean } => {
  switch (tx.type) {
    case 'TOP_UP':
      return { icon: <Plus size={16} />, bg: 'bg-[#39FF14]/10', color: 'text-[#39FF14]', income: true };
    case 'DEPOSIT':
    case 'REFUND':
    case 'MATCH_REFUND':
      return { icon: <RotateCcw size={16} />, bg: 'bg-blue-400/12', color: 'text-blue-400', income: true };
    case 'MATCH_EARNING':
    case 'BOOKING_EARNING':
    case 'SERVICE_EARNING':
      return { icon: <Zap size={16} />, bg: 'bg-yellow-400/12', color: 'text-[#FACC15]', income: true };
    case 'REFERRAL_BONUS':
      return { icon: <Gift size={16} />, bg: 'bg-[#39FF14]/10', color: 'text-[#39FF14]', income: true };
    case 'WITHDRAWAL':
      return { icon: <ArrowUpRight size={16} />, bg: 'bg-red-500/10', color: 'text-red-400', income: false };
    default: // WALLET_PAYMENT, MATCH_FEE ve diğer harcamalar
      return { icon: <Users size={16} />, bg: 'bg-slate-400/12', color: 'text-slate-400', income: false };
  }
};

const WalletScreen: React.FC<WalletScreenProps> = ({ onBack }) => {
  const {
    role, savedCards, setSavedCards, walletInitialTab, setWalletInitialTab,
    lastPaymentError, setLastPaymentError, paymentContext,
  } = useAppStore();

  const isEarningsRole = role === UserRole.GOALKEEPER || role === UserRole.REFEREE || role === UserRole.OWNER;
  const roleBadge = role === UserRole.GOALKEEPER ? 'Kaleci' : role === UserRole.REFEREE ? 'Hakem' : role === UserRole.OWNER ? 'Tesis' : null;

  const [view, setView] = useState<View>('MAIN');
  const [summary, setSummary] = useState<WalletSummary | null>(null);
  const [earnSummary, setEarnSummary] = useState<EarningsSummary | null>(null);
  const [txList, setTxList] = useState<WalletTx[]>([]);
  const [payouts, setPayouts] = useState<PayoutRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState(false);

  // Para yükleme
  const [topupAmount, setTopupAmount] = useState<number>(500);
  const [customAmount, setCustomAmount] = useState('');
  const [isCustom, setIsCustom] = useState(false);
  const [topupCardId, setTopupCardId] = useState<string | null>(null);
  const [topupBusy, setTopupBusy] = useState(false);
  const [topupError, setTopupError] = useState('');
  const [topupDone, setTopupDone] = useState(false);
  // Uygulama-içi 3DS (banka SMS) sayfası — para yüklemede
  const [topupThreeDS, setTopupThreeDS] = useState<{ html: string; intentId: string } | null>(null);
  // Kart ekleme hangi ekrandan açıldı — bitince oraya dön
  const [addCardReturn, setAddCardReturn] = useState<'CARDS' | 'TOPUP'>('CARDS');

  // Çekim formu
  const [payoutAmount, setPayoutAmount] = useState('');
  const [payoutIban, setPayoutIban] = useState('');
  const [payoutHolder, setPayoutHolder] = useState('');
  const [payoutBusy, setPayoutBusy] = useState(false);
  const [payoutError, setPayoutError] = useState('');
  const [payoutDone, setPayoutDone] = useState(false);

  // Geçmiş filtresi
  const [historyFilter, setHistoryFilter] = useState<HistoryFilter>('ALL');

  const fetchData = useCallback(async () => {
    setRefreshing(true);
    setLoadError(false);
    try {
      const [sum, cards, txRes, payoutRes, earn] = await Promise.all([
        getWalletSummary().catch(() => null),
        listSavedCards(),
        supabase.from('wallet_transactions')
          .select('id,amount,type,balance_type,status,description,created_at')
          .order('created_at', { ascending: false }).limit(100),
        supabase.from('payout_requests')
          .select('id,amount,iban,iban_holder_name,status,created_at')
          .order('created_at', { ascending: false }).limit(20),
        isEarningsRole ? getOwnerEarningsSummary().catch(() => null) : Promise.resolve(null),
      ]);
      // Finansal veri çekilemezse ₺0'ı gerçek gibi gösterme — kesintiyi maskeleme.
      if (sum) setSummary(sum);
      else setLoadError(true);
      if (txRes.error) setLoadError(true);
      setEarnSummary(earn);
      setSavedCards(cards);
      setTopupCardId(prev => prev ?? (cards.find(c => c.isDefault) ?? cards[0])?.id ?? null);
      if (txRes.data) setTxList(txRes.data as WalletTx[]);
      if (payoutRes.data) setPayouts(payoutRes.data as PayoutRequest[]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [setSavedCards, isEarningsRole]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Deep-link: profil/diğer ekranlardan gelen başlangıç sekmesi
  useEffect(() => {
    if (walletInitialTab === 'CARD_SETTINGS') setView('CARDS');
    else if (walletInitialTab === 'TOPUP') setView('TOPUP');
    else if (walletInitialTab === 'HISTORY') setView('HISTORY');
    if (walletInitialTab !== 'MAIN') setWalletInitialTab('MAIN');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const topupBalance = summary?.topupBalance ?? 0;
  const refundBalance = summary?.refundCreditBalance ?? 0;
  const earningsBalance = summary?.earningsBalance ?? 0;
  const reservedBalance = summary?.reservedBalance ?? 0;

  const effectiveTopup = isCustom ? Number(customAmount) || 0 : topupAmount;

  const pendingPayout = payouts.find(p => p.status === 'PENDING' || p.status === 'PROCESSING') ?? null;

  // Bu ay kazanç istatistikleri (kaleci/hakem hero'su)
  const monthStats = useMemo(() => {
    const now = new Date();
    const rows = txList.filter(t =>
      ['SERVICE_EARNING', 'MATCH_EARNING', 'BOOKING_EARNING'].includes(t.type) &&
      new Date(t.created_at).getMonth() === now.getMonth() &&
      new Date(t.created_at).getFullYear() === now.getFullYear());
    return { count: rows.length, total: rows.reduce((s, r) => s + Math.abs(r.amount), 0) };
  }, [txList]);

  // Para yükleme — uygulama-içi kart akışı (edge 'pay', flow TOP_UP).
  // Canlıda banka SMS doğrulaması (3DS) uygulama içinde açılır; simülasyonda
  // anında uygulanır. Kart verisi FE'de tutulmaz — yalnız kayıtlı kart id gider.
  const handleTopup = async () => {
    if (topupBusy) return;
    setTopupError('');
    if (effectiveTopup < TOPUP_MIN) {
      setTopupError(`Minimum yükleme tutarı ${TOPUP_MIN}₺'dir.`);
      return;
    }
    if (!topupCardId) {
      setTopupError('Yükleme için bir kart seç veya yeni kart ekle.');
      return;
    }
    setTopupBusy(true);
    try {
      const res = await startInAppCardPayment({
        flow: 'TOP_UP',
        amount: effectiveTopup,
        savedCardId: topupCardId,
      });
      if (res.requiresThreeDS && res.threeDSHtml) {
        // Banka SMS doğrulaması — sonuç handleTopupThreeDSDone'a gelir
        setTopupThreeDS({ html: res.threeDSHtml, intentId: res.intentId });
        return; // busy açık kalır; sheet kapanınca sıfırlanır
      }
      setTopupDone(true);
      await fetchData();
      setTimeout(() => { setTopupDone(false); setView('MAIN'); }, 1800);
      setTopupBusy(false);
    } catch (e) {
      const raw = e instanceof Error ? e.message : 'Para yükleme başarısız.';
      setTopupError(raw.replace(/^[A-Z_]+:\s*/, '') || 'Para yükleme başarısız.');
      setTopupBusy(false);
    }
  };

  const handleTopupThreeDSDone = async (outcome: ThreeDSOutcome) => {
    setTopupThreeDS(null);
    setTopupBusy(false);
    if (outcome.ok) {
      setTopupDone(true);
      await fetchData();
      setTimeout(() => { setTopupDone(false); setView('MAIN'); }, 1800);
    } else {
      setTopupError(outcome.reason === 'TIMEOUT'
        ? 'Banka doğrulaması zaman aşımına uğradı. Yükleme alınmadıysa tekrar deneyebilirsin.'
        : 'Banka doğrulaması tamamlanamadı. Onaylanmayan tutar kartına yansımaz — tekrar deneyebilirsin.');
    }
  };

  const handleTopupThreeDSCancel = () => {
    setTopupThreeDS(null);
    setTopupBusy(false);
    setTopupError('Banka doğrulaması yarıda kaldı — yükleme alınmadı.');
  };

  const handleRequestPayout = async () => {
    setPayoutError('');
    const amount = parseFloat(payoutAmount);
    if (!amount || amount <= 0) { setPayoutError('Geçerli bir tutar girin.'); return; }
    if (!validateIBAN(payoutIban)) { setPayoutError('Geçerli bir IBAN girin (TR + 24 hane).'); return; }
    if (!payoutHolder.trim()) { setPayoutError('IBAN sahibi adı zorunludur.'); return; }
    setPayoutBusy(true);
    const { error } = await supabase.rpc('request_payout', {
      p_amount: amount,
      p_iban: payoutIban.replace(/\s/g, ''),
      p_iban_holder_name: payoutHolder,
      p_payout_type: 'MANUAL',
    });
    setPayoutBusy(false);
    if (error) {
      setPayoutError(error.message.replace(/^[A-Z_]+: /, ''));
    } else {
      setPayoutDone(true);
      fetchData();
      setTimeout(() => { setPayoutDone(false); setView('MAIN'); }, 1800);
    }
  };

  const retryPayment = () => {
    setLastPaymentError(null);
    if (paymentContext) useAppStore.getState().navigateTo('PAYMENT');
  };

  // ─── ALT EKRAN: Kart ekle (paylaşılan bileşen — edge üzerinden kayıt) ─────
  if (view === 'ADD_CARD') {
    return (
      <AddCardScreen
        onBack={() => setView(addCardReturn)}
        onSaved={async (card) => {
          const cards = await listSavedCards();
          setSavedCards(cards);
          if (card && addCardReturn === 'TOPUP') setTopupCardId(card.id);
          setView(addCardReturn);
        }}
      />
    );
  }

  // ─── ALT EKRAN: Para Yükle ────────────────────────────────────────────────
  if (view === 'TOPUP') {
    const selectedCard = savedCards.find(c => c.id === topupCardId) ?? null;
    return (
      <div lang="tr" className="min-h-screen bg-[#0A0E14] flex flex-col font-sans">
        <SubHeader title="Para Yükle" subtitle="OYNA bakiyene ekle" onBack={() => setView('MAIN')} />
        <main className="flex-1 overflow-y-auto p-5 space-y-5">
          <div className="text-center py-1">
            <p className="text-[11px] text-gray-400 font-bold uppercase tracking-[0.1em] mb-1.5">Yüklenecek Tutar</p>
            <p className="text-[46px] font-black leading-none text-white font-numeric">{fmtInt(effectiveTopup)}₺</p>
            {effectiveTopup >= TOPUP_MIN && (
              <p className="text-[11px] text-[#39FF14] mt-2 font-semibold">
                Yeni bakiye: {fmt(topupBalance + refundBalance + effectiveTopup)}₺
              </p>
            )}
          </div>

          <div className="grid grid-cols-3 gap-2.5">
            {TOPUP_PRESETS.map(v => {
              const active = !isCustom && topupAmount === v;
              return (
                <button key={v} onClick={() => { setIsCustom(false); setTopupAmount(v); }}
                  className={`py-4 rounded-[14px] text-center font-extrabold text-[15px] font-numeric transition-all ${
                    active
                      ? 'bg-[#39FF14]/12 border-2 border-[#39FF14] text-[#39FF14] shadow-[0_0_18px_rgba(57,255,20,0.15)]'
                      : 'bg-[#161B22] border border-white/8 text-white'
                  }`}>
                  {fmtInt(v)}₺
                </button>
              );
            })}
            <button onClick={() => setIsCustom(true)}
              className={`py-4 rounded-[14px] text-center font-extrabold text-[13px] flex items-center justify-center gap-1 transition-all ${
                isCustom ? 'bg-[#39FF14]/12 border-2 border-[#39FF14] text-[#39FF14]' : 'bg-[#161B22] border border-dashed border-white/16 text-gray-400'
              }`}>
              <Pencil size={13} /> Özel
            </button>
          </div>

          {isCustom && (
            <input
              value={customAmount}
              onChange={e => setCustomAmount(e.target.value.replace(/\D/g, '').slice(0, 5))}
              placeholder={`En az ${TOPUP_MIN}`}
              inputMode="numeric"
              autoFocus
              className="w-full bg-[#161B22] border border-[#39FF14]/30 rounded-[14px] px-4 py-4 text-white font-black text-2xl font-numeric outline-none placeholder:text-gray-600 text-center"
            />
          )}

          <div className="flex gap-2 items-center px-0.5">
            <Info size={13} className="text-gray-500 shrink-0" />
            <p className="text-[11px] text-gray-500">Minimum yükleme tutarı {TOPUP_MIN}₺'dir.</p>
          </div>

          <div>
            <p className="text-[11px] font-black uppercase tracking-[0.14em] text-gray-500 mb-3">Ödeme Yöntemi</p>
            {savedCards.length === 0 ? (
              <button onClick={() => { setAddCardReturn('TOPUP'); setView('ADD_CARD'); }}
                className="w-full flex items-center gap-3 border-[1.5px] border-dashed border-white/16 rounded-2xl p-4 text-gray-300">
                <span className="w-11 h-[30px] rounded-md bg-white/5 flex items-center justify-center text-gray-400"><Plus size={18} /></span>
                <span className="text-[13px] font-bold">Yeni kart ekle</span>
              </button>
            ) : (
              <div className="space-y-2.5">
                {savedCards.map(card => {
                  const active = topupCardId === card.id;
                  return (
                    <button key={card.id} onClick={() => setTopupCardId(card.id)}
                      className={`w-full flex items-center gap-3 rounded-2xl p-3.5 text-left transition-all ${
                        active ? 'bg-[#161B22] border-2 border-[#39FF14] shadow-[0_0_18px_rgba(57,255,20,0.12)]' : 'bg-[#161B22] border border-white/8'
                      }`}>
                      <span className={`w-11 h-[30px] rounded-md bg-gradient-to-br ${card.gradient ?? 'from-purple-700 to-blue-600'} flex items-center justify-center shrink-0`}>
                        <CardBrandMark brand={card.brand} size={13} />
                      </span>
                      <span className="flex-1">
                        <span className="block text-sm font-extrabold text-white font-numeric">•••• {card.last4}</span>
                        <span className="block text-[10px] text-gray-500 mt-0.5">{card.isDefault ? 'Varsayılan kart' : ''}</span>
                      </span>
                      {active && (
                        <span className="w-[22px] h-[22px] rounded-full bg-[#39FF14] flex items-center justify-center shrink-0">
                          <Check size={14} strokeWidth={3} className="text-[#0A0E14]" />
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {topupError && (
            <div className="bg-red-900/20 border border-red-500/30 rounded-2xl p-3 flex gap-2">
              <AlertTriangle size={16} className="text-red-400 shrink-0 mt-0.5" />
              <p className="text-red-300 text-sm">{topupError}</p>
            </div>
          )}
          {topupDone && (
            <div className="bg-green-900/20 border border-green-500/30 rounded-2xl p-3 flex gap-2">
              <CheckCircle2 size={16} className="text-[#39FF14] shrink-0" />
              <p className="text-green-300 text-sm">Yükleme tamamlandı!</p>
            </div>
          )}

          <p className="text-[10px] text-gray-600 leading-relaxed px-0.5">
            Bakiye yalnızca OYNA içindeki saha, maç ve kaleci/hakem hizmet ödemelerinde kullanılır;
            dijital ürün satın alımında kullanılamaz. Yüklemelerde bonus verilmez.
          </p>
        </main>
        <div className="p-5 pb-safe border-t border-white/5">
          <button
            disabled={topupBusy || effectiveTopup < TOPUP_MIN || savedCards.length === 0}
            onClick={handleTopup}
            className={`w-full py-4 font-black text-base rounded-2xl flex items-center justify-center gap-2 transition-all active:scale-[0.98] ${
              !topupBusy && effectiveTopup >= TOPUP_MIN && savedCards.length > 0
                ? 'bg-[#39FF14] text-[#0A0E14]' : 'bg-gray-800 text-gray-500'
            }`}>
            {topupBusy ? <RefreshCw size={18} className="animate-spin" /> : <Plus size={18} />}
            {topupBusy ? 'YÜKLENİYOR...' : `${fmtInt(effectiveTopup)}₺ YÜKLE`}
          </button>
          {savedCards.length === 0 && !selectedCard && (
            <p className="text-center text-[10px] text-gray-500 mt-2">Yükleme için önce bir kart ekle.</p>
          )}
        </div>
        {/* Banka SMS doğrulaması — uygulama içinde tam ekran */}
        {topupThreeDS && (
          <ThreeDSSheet
            htmlBase64={topupThreeDS.html}
            intentId={topupThreeDS.intentId}
            onDone={handleTopupThreeDSDone}
            onCancel={handleTopupThreeDSCancel}
          />
        )}
      </div>
    );
  }

  // ─── ALT EKRAN: Kart yönetimi ─────────────────────────────────────────────
  if (view === 'CARDS') {
    const defaultCard = savedCards.find(c => c.isDefault) ?? savedCards[0] ?? null;
    const others = savedCards.filter(c => c.id !== defaultCard?.id);
    return (
      <div lang="tr" className="min-h-screen bg-[#0A0E14] flex flex-col font-sans">
        <SubHeader title="Kartlarım" subtitle="Kayıtlı ödeme yöntemleri" onBack={() => setView('MAIN')} />
        <main className="flex-1 overflow-y-auto p-5 space-y-3.5">
          {defaultCard && (
            <div className={`rounded-[18px] p-5 bg-gradient-to-br ${defaultCard.gradient ?? 'from-purple-800 to-blue-600'} relative`}>
              <span className="absolute top-3.5 right-3.5 text-[9px] font-extrabold uppercase tracking-[0.08em] text-[#0A0E14] bg-[#39FF14] px-2 py-1 rounded-md">
                Varsayılan
              </span>
              <div className="w-9 h-[26px] rounded bg-gradient-to-br from-yellow-400 to-yellow-700 mb-5" />
              <p className="text-[17px] font-bold tracking-[0.1em] text-white font-numeric">•••• •••• •••• {defaultCard.last4}</p>
              <div className="flex justify-between items-end mt-3">
                <span className="text-[11px] text-white/85 font-numeric">
                  {(defaultCard.holderName ?? 'OYNA KULLANICI').toLocaleUpperCase('tr-TR')}
                  {defaultCard.expMonth && defaultCard.expYear ? ` · ${String(defaultCard.expMonth).padStart(2, '0')}/${String(defaultCard.expYear).slice(-2)}` : ''}
                </span>
                <CardBrandMark brand={defaultCard.brand} size={16} />
              </div>
            </div>
          )}
          {others.map(card => (
            <div key={card.id} className="bg-[#161B22] border border-white/8 rounded-2xl p-3.5 flex items-center justify-between gap-2">
              <div className="flex items-center gap-3.5 min-w-0">
                <span className={`w-[46px] h-[31px] rounded-md bg-gradient-to-br ${card.gradient ?? 'from-emerald-600 to-teal-700'} flex items-center justify-center shrink-0`}>
                  <CardBrandMark brand={card.brand} size={11} />
                </span>
                <div className="min-w-0">
                  <p className="font-extrabold text-sm text-white font-numeric">•••• {card.last4}</p>
                  <p className="text-gray-500 text-[10px] mt-0.5">
                    {card.expMonth && card.expYear ? `${String(card.expMonth).padStart(2, '0')}/${String(card.expYear).slice(-2)}` : ''}
                  </p>
                </div>
              </div>
              <div className="flex gap-1.5 shrink-0">
                <button
                  onClick={async () => { await setDefaultSavedCard(card.id).catch(() => {}); setSavedCards(await listSavedCards()); }}
                  className="px-2.5 py-2 bg-white/5 border border-white/8 rounded-[10px] text-gray-400 text-[10px] font-bold">
                  Varsayılan yap
                </button>
                <button
                  onClick={async () => { await deleteSavedCard(card.id).catch(() => {}); setSavedCards(await listSavedCards()); }}
                  className="w-[34px] h-[34px] flex items-center justify-center bg-red-500/10 border border-red-500/20 rounded-[10px] text-red-400">
                  <Trash2 size={15} />
                </button>
              </div>
            </div>
          ))}
          {savedCards.length === 0 && (
            <div className="py-16 text-center">
              <CreditCard size={32} className="text-gray-700 mx-auto mb-3" />
              <p className="text-gray-600 text-sm">Kayıtlı kartın yok.</p>
            </div>
          )}
          {savedCards.length > 0 && defaultCard && (
            <div className="flex gap-2 items-center px-1 pt-1">
              <Shield size={12} className="text-gray-600 shrink-0" />
              <p className="text-[10px] text-gray-600">Kart numarası ve CVV OYNA'da saklanmaz; yalnız maskeli bilgi tutulur.</p>
            </div>
          )}
        </main>
        <div className="p-5 pb-safe border-t border-white/5">
          <button onClick={() => { setAddCardReturn('CARDS'); setView('ADD_CARD'); }}
            className="w-full py-4 bg-[#39FF14] text-[#0A0E14] font-black text-base rounded-2xl flex items-center justify-center gap-2 active:scale-[0.98] transition-all">
            <Plus size={18} /> YENİ KART EKLE
          </button>
        </div>
      </div>
    );
  }

  // ─── ALT EKRAN: İşlem geçmişi ─────────────────────────────────────────────
  if (view === 'HISTORY') {
    const matchesFilter = (tx: WalletTx): boolean => {
      switch (historyFilter) {
        case 'TOPUP': return tx.type === 'TOP_UP';
        case 'PAYMENT': return tx.type === 'WALLET_PAYMENT' || tx.type === 'MATCH_FEE' || tx.type === 'WITHDRAWAL';
        case 'REFUND': return ['DEPOSIT', 'REFUND', 'MATCH_REFUND'].includes(tx.type);
        case 'EARNING': return ['MATCH_EARNING', 'BOOKING_EARNING', 'SERVICE_EARNING', 'REFERRAL_BONUS'].includes(tx.type);
        default: return true;
      }
    };
    const filtered = txList.filter(matchesFilter);
    const groups: { label: string; rows: WalletTx[] }[] = [];
    for (const tx of filtered) {
      const d = new Date(tx.created_at);
      const label = d.toLocaleDateString('tr-TR', { day: 'numeric', month: 'long' });
      const last = groups[groups.length - 1];
      if (last && last.label === label) last.rows.push(tx);
      else groups.push({ label, rows: [tx] });
    }
    const chips: [HistoryFilter, string][] = [
      ['ALL', 'Tümü'], ['TOPUP', 'Yükleme'], ['PAYMENT', 'Ödeme'], ['REFUND', 'İade'], ['EARNING', 'Kazanç'],
    ];
    return (
      <div lang="tr" className="min-h-screen bg-[#0A0E14] flex flex-col font-sans">
        <SubHeader title="İşlem Geçmişi" subtitle="Tüm hareketler" onBack={() => setView('MAIN')} />
        <div className="shrink-0 px-5 pt-3.5">
          <div className="oy-carousel flex gap-2 overflow-x-auto">
            {chips.map(([key, label]) => (
              <button key={key} onClick={() => setHistoryFilter(key)}
                className={`shrink-0 text-xs font-extrabold px-3.5 py-[7px] rounded-full transition-all ${
                  historyFilter === key
                    ? 'bg-[#39FF14] text-[#0A0E14]'
                    : 'bg-[#161B22] border border-white/8 text-gray-400'
                }`}>
                {label}
              </button>
            ))}
          </div>
        </div>
        <main className="flex-1 overflow-y-auto px-5 py-4 pb-safe">
          {groups.length === 0 && (
            <div className="py-16 text-center">
              <History size={32} className="text-gray-700 mx-auto mb-3" />
              <p className="text-gray-600 text-sm">Bu filtrede işlem yok.</p>
            </div>
          )}
          {groups.map(g => (
            <div key={g.label} className="mb-5">
              <p className="text-[10px] font-black uppercase tracking-[0.14em] text-gray-600 mb-2.5">{g.label}</p>
              <div className="space-y-2">
                {g.rows.map(tx => <TxRow key={tx.id} tx={tx} />)}
              </div>
            </div>
          ))}
        </main>
      </div>
    );
  }

  // ─── ALT EKRAN: IBAN'a çek ────────────────────────────────────────────────
  if (view === 'PAYOUT_FORM') {
    const quick = [500, 1000];
    return (
      <div lang="tr" className="min-h-screen bg-[#0A0E14] flex flex-col font-sans">
        <SubHeader title="IBAN'a Çek" subtitle="Kazancını hesabına aktar" onBack={() => { setView('MAIN'); setPayoutError(''); }} />
        <main className="flex-1 overflow-y-auto p-5 space-y-[18px]">
          <div className="text-center py-2">
            <p className="text-[11px] text-gray-400 font-bold uppercase tracking-[0.1em] mb-1.5">Çekilebilir Kazanç</p>
            <p className="text-[40px] font-black leading-none text-white font-numeric">{fmt(earningsBalance)}₺</p>
            {reservedBalance > 0 && (
              <p className="text-[11px] text-yellow-400 mt-2 flex items-center justify-center gap-1">
                <Clock size={11} /> {fmt(reservedBalance)}₺ bekleyen çekimde rezerve
              </p>
            )}
          </div>
          <div>
            <label className="text-[10px] text-gray-500 font-extrabold uppercase tracking-wider block mb-2">Çekilecek Tutar</label>
            <div className="bg-[#161B22] border border-[#39FF14]/30 rounded-[14px] px-4 py-4 flex items-center justify-between">
              <input value={payoutAmount} onChange={e => setPayoutAmount(e.target.value.replace(/[^\d.,]/g, ''))}
                inputMode="decimal" placeholder="0"
                className="bg-transparent text-white font-black text-[26px] font-numeric outline-none w-full placeholder:text-gray-600" />
              <span className="text-xl font-extrabold text-gray-500">₺</span>
            </div>
            <div className="flex gap-2 mt-2.5">
              {quick.map(q => (
                <button key={q} onClick={() => setPayoutAmount(String(Math.min(q, earningsBalance)))}
                  className="flex-1 py-2 bg-[#161B22] border border-white/8 rounded-[10px] text-gray-300 text-xs font-bold">
                  {fmtInt(q)}₺
                </button>
              ))}
              <button onClick={() => setPayoutAmount(String(earningsBalance))}
                className="flex-1 py-2 bg-[#39FF14]/12 border border-[#39FF14]/40 rounded-[10px] text-[#39FF14] text-xs font-extrabold">
                Tümü
              </button>
            </div>
          </div>
          <div>
            <label className="text-[10px] text-gray-500 font-extrabold uppercase tracking-wider block mb-2">Hedef IBAN</label>
            <div className="bg-[#161B22] border border-white/8 rounded-[14px] p-3.5 flex items-center gap-3">
              <span className="w-[34px] h-[34px] rounded-[10px] bg-[#39FF14]/10 flex items-center justify-center text-[#39FF14] shrink-0">
                <Landmark size={16} />
              </span>
              <input
                value={payoutIban}
                onChange={e => setPayoutIban(formatIBAN(e.target.value))}
                placeholder="TR00 0000 0000 0000 0000 0000 00"
                autoCapitalize="characters"
                className="flex-1 bg-transparent text-white font-bold font-numeric text-[13px] tracking-wider outline-none placeholder:text-gray-600 min-w-0" />
              {validateIBAN(payoutIban) && <Check size={16} className="text-[#39FF14] shrink-0" />}
            </div>
            <input value={payoutHolder} onChange={e => setPayoutHolder(e.target.value.toLocaleUpperCase('tr-TR'))}
              placeholder="IBAN SAHİBİ AD SOYAD"
              className="mt-2.5 w-full bg-[#161B22] border border-white/8 rounded-[14px] px-4 py-3.5 text-white font-bold text-sm outline-none placeholder:text-gray-600" />
          </div>
          <div className="bg-[#0f1419] border border-blue-400/20 rounded-[14px] p-3.5 flex gap-2.5">
            <Info size={15} className="text-blue-400 shrink-0 mt-0.5" />
            <p className="text-[11.5px] text-gray-400 leading-relaxed">
              Talepler <span className="text-white font-semibold">1–2 iş günü</span> içinde işleme alınır. İşlem ücreti yoktur.
            </p>
          </div>
          {payoutError && (
            <div className="bg-red-900/20 border border-red-500/30 rounded-2xl p-3 flex gap-2">
              <AlertTriangle size={16} className="text-red-400 shrink-0 mt-0.5" />
              <p className="text-red-300 text-sm">{payoutError}</p>
            </div>
          )}
          {payoutDone && (
            <div className="bg-green-900/20 border border-green-500/30 rounded-2xl p-3 flex gap-2">
              <CheckCircle2 size={16} className="text-[#39FF14] shrink-0" />
              <p className="text-green-300 text-sm">Çekim talebi oluşturuldu! Onay sonrası hesabına geçer.</p>
            </div>
          )}
        </main>
        <div className="p-5 pb-safe border-t border-white/5">
          <button
            disabled={payoutBusy || !validateIBAN(payoutIban) || !parseFloat(payoutAmount)}
            onClick={handleRequestPayout}
            className={`w-full py-4 font-black text-base rounded-2xl flex items-center justify-center gap-2 transition-all active:scale-[0.98] ${
              !payoutBusy && validateIBAN(payoutIban) && parseFloat(payoutAmount) > 0
                ? 'bg-[#39FF14] text-[#0A0E14]' : 'bg-gray-800 text-gray-500'
            }`}>
            {payoutBusy ? <RefreshCw size={18} className="animate-spin" /> : <ArrowUpRight size={18} />}
            {payoutBusy ? 'GÖNDERİLİYOR...' : `${payoutAmount ? fmtInt(Number(payoutAmount)) : '0'}₺ ÇEKİM TALEP ET`}
          </button>
        </div>
      </div>
    );
  }

  // ─── ANA EKRAN ────────────────────────────────────────────────────────────
  const recentTx = txList.slice(0, 6);

  return (
    <div lang="tr" className="min-h-screen bg-[#0A0E14] flex flex-col font-sans relative overflow-hidden">
      <div className="fixed inset-0 pointer-events-none z-0">
        <div className={`absolute top-[-10%] left-[-10%] w-[50%] h-[30%] blur-[120px] rounded-full ${isEarningsRole ? 'bg-[#FACC15]/8' : 'bg-[#39FF14]/8'}`} />
      </div>

      <header className="px-5 pt-safe py-4 flex justify-between items-center sticky top-0 z-20 bg-[#0A0E14]/80 backdrop-blur-xl border-b border-white/5">
        <button onClick={onBack}
          className="w-[42px] h-[42px] flex items-center justify-center bg-[#161B22] rounded-full border border-white/5 text-white active:scale-95 transition-all">
          <ArrowLeft size={20} />
        </button>
        <div className="flex flex-col items-center">
          <h1 className="text-base font-black text-white tracking-[0.16em] uppercase">Cüzdan</h1>
          {roleBadge && (
            <span className="text-[9px] font-extrabold uppercase tracking-[0.1em] text-[#FACC15] bg-yellow-400/12 px-2 py-0.5 rounded-md mt-1">
              {roleBadge}
            </span>
          )}
        </div>
        <button onClick={() => fetchData()}
          className="w-[42px] h-[42px] flex items-center justify-center bg-[#161B22] rounded-full border border-white/5 text-white active:scale-95 transition-all">
          <RefreshCw size={17} className={refreshing ? 'animate-spin text-[#39FF14]' : ''} />
        </button>
      </header>

      <main className="flex-1 overflow-y-auto custom-scrollbar z-10 px-5 pt-2 pb-safe-nav space-y-[18px]">
        {/* Hata banner'ı — başarısız ödeme buraya düşer (hibrit UX'in cüzdan yarısı) */}
        {lastPaymentError && (
          <div className="bg-red-500/10 border border-red-500/30 rounded-2xl p-3.5 flex gap-3">
            <div className="w-[34px] h-[34px] rounded-[10px] bg-red-500/15 flex items-center justify-center text-red-400 shrink-0">
              <AlertTriangle size={18} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[13px] font-extrabold text-red-400">{lastPaymentError.title}</p>
              <p className="text-[11.5px] text-gray-300 mt-1 leading-relaxed">{lastPaymentError.message}</p>
              {paymentContext && (
                <button onClick={retryPayment}
                  className="mt-2.5 text-[11px] font-extrabold text-[#0A0E14] bg-red-400 rounded-[9px] px-3 py-[7px]">
                  Tekrar dene
                </button>
              )}
            </div>
            <button onClick={() => setLastPaymentError(null)} className="text-gray-500 shrink-0 self-start"><X size={15} /></button>
          </div>
        )}

        {/* Finansal veri yüklenemedi — ₺0 yerine dürüst hata + tekrar dene */}
        {loadError && !summary && (
          <div className="bg-amber-500/10 border border-amber-500/30 rounded-2xl p-3.5 flex gap-3">
            <div className="w-[34px] h-[34px] rounded-[10px] bg-amber-500/15 flex items-center justify-center text-amber-400 shrink-0">
              <AlertTriangle size={18} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[13px] font-extrabold text-amber-400">Bakiye yüklenemedi</p>
              <p className="text-[11.5px] text-gray-300 mt-1 leading-relaxed">
                Bağlantı sorunu nedeniyle bakiyen alınamadı. Gösterilen tutar güncel olmayabilir.
              </p>
              <button onClick={() => fetchData()} disabled={refreshing}
                className="mt-2.5 text-[11px] font-extrabold text-[#0A0E14] bg-amber-400 rounded-[9px] px-3 py-[7px] disabled:opacity-60">
                Tekrar dene
              </button>
            </div>
          </div>
        )}

        {isEarningsRole ? (
          <>
            {/* ── Kaleci / Hakem / Tesis: kazanç hero (altın) ── */}
            <div className="rounded-[26px] p-6 relative overflow-hidden border border-yellow-400/25 shadow-[0_20px_50px_rgba(0,0,0,0.5)]"
              style={{ background: 'linear-gradient(140deg,#3d3400,#0a1712 75%)' }}>
              <div className="absolute -top-10 -right-8 w-44 h-44 bg-yellow-400/14 blur-[60px] rounded-full" />
              <div className="relative">
                <p className="text-[11px] font-extrabold uppercase tracking-[0.14em] text-yellow-200/80">Çekilebilir Kazanç</p>
                {loading ? (
                  <div className="h-10 w-40 bg-white/5 rounded-lg animate-pulse mt-3" />
                ) : (
                  <p className="text-[40px] font-black leading-none mt-3 text-white font-numeric">{fmt(earningsBalance)}₺</p>
                )}
                <div className="flex gap-2 mt-4">
                  <div className="bg-black/30 border border-white/6 rounded-xl px-3 py-2">
                    <p className="text-[9px] text-gray-400 uppercase tracking-[0.08em]">Bu ay</p>
                    <p className="text-[13px] font-extrabold text-white mt-0.5">{monthStats.count} maç</p>
                  </div>
                  <div className="bg-black/30 border border-white/6 rounded-xl px-3 py-2">
                    <p className="text-[9px] text-gray-400 uppercase tracking-[0.08em]">Kazanç</p>
                    <p className="text-[13px] font-extrabold text-[#FACC15] mt-0.5">+{fmtInt(monthStats.total)}₺</p>
                  </div>
                  {reservedBalance > 0 && (
                    <div className="bg-black/30 border border-yellow-400/20 rounded-xl px-3 py-2">
                      <p className="text-[9px] text-yellow-400/80 uppercase tracking-[0.08em]">Bekleyen çekim</p>
                      <p className="text-[13px] font-extrabold text-yellow-300 mt-0.5">{fmtInt(reservedBalance)}₺</p>
                    </div>
                  )}
                </div>
                {/* Güvence beklemesindeki kazanç (2 hafta) — şeffaflık için görünür */}
                {(earnSummary?.pending ?? 0) > 0 && (
                  <div className="mt-3 inline-flex items-center gap-2 bg-blue-400/12 border border-blue-400/25 rounded-xl px-3 py-2">
                    <Clock size={13} className="text-blue-300" />
                    <span className="text-[11px] font-bold text-blue-200">
                      Güvence beklemesinde <span className="text-white">{fmt(earnSummary!.pending)}₺</span>
                      <span className="text-blue-300/70"> · 2 hafta sonra çekilebilir</span>
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* Eylemler: IBAN'a Çek (geniş) + Geçmiş — Para Yükle YOK */}
            <div className="flex gap-2.5">
              <button onClick={() => setView('PAYOUT_FORM')}
                className="flex-[2] py-[15px] bg-[#39FF14] text-[#0A0E14] font-black text-sm rounded-2xl flex items-center justify-center gap-2 shadow-[0_0_24px_rgba(57,255,20,0.22)] active:scale-[0.98] transition-all">
                <ArrowUpRight size={19} /> IBAN'A ÇEK
              </button>
              <button onClick={() => setView('HISTORY')}
                className="flex-1 py-[15px] bg-[#161B22] text-white border border-white/8 rounded-2xl font-extrabold text-[13px] flex flex-col items-center gap-1 active:scale-[0.98] transition-all">
                <List size={18} /> Geçmiş
              </button>
            </div>

            {/* Bekleyen çekim satırı */}
            {pendingPayout && (
              <div className="bg-[#161B22] border border-yellow-400/20 rounded-2xl p-3.5 flex items-center gap-3">
                <span className="w-[34px] h-[34px] rounded-[10px] bg-yellow-400/12 flex items-center justify-center text-[#FACC15] shrink-0">
                  <Clock size={16} />
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-extrabold text-white">Bekleyen çekim talebi</p>
                  <p className="text-[10px] text-gray-500 font-numeric mt-0.5">
                    {pendingPayout.iban.slice(0, 4)}•• •••• {pendingPayout.iban.slice(-4)}
                  </p>
                </div>
                <span className="text-sm font-black text-[#FACC15] font-numeric shrink-0">{fmt(pendingPayout.amount)}₺</span>
              </div>
            )}
          </>
        ) : (
          <>
            {/* ── Oyuncu: yüklenen bakiye hero (yeşil, tasarım 2a) ── */}
            <div className="rounded-[26px] p-6 relative overflow-hidden border border-[#39FF14]/25 shadow-[0_20px_50px_rgba(0,0,0,0.5)]"
              style={{ background: 'linear-gradient(140deg,#0f3d24,#0a1712 75%)' }}>
              <div className="absolute -top-10 -right-8 w-44 h-44 bg-[#39FF14]/14 blur-[60px] rounded-full" />
              <div className="relative flex justify-between items-start">
                <div>
                  <p className="text-[11px] font-extrabold uppercase tracking-[0.14em] text-[#8fe87a]">Yüklenen Bakiye</p>
                  {loading ? (
                    <div className="h-10 w-40 bg-white/5 rounded-lg animate-pulse mt-3" />
                  ) : (
                    <p className="text-[40px] font-black leading-none mt-3 text-white font-numeric">{fmt(topupBalance)}₺</p>
                  )}
                </div>
                <span className="font-numeric font-bold text-[13px] tracking-[0.08em] text-[#39FF14] border border-[#39FF14]/40 rounded-lg px-2 py-1">
                  OYNA
                </span>
              </div>
              <div className="relative mt-5 inline-flex items-center gap-2 bg-blue-400/12 border border-blue-400/25 rounded-xl px-3 py-2">
                <Gift size={14} className="text-blue-400" />
                <span className="text-xs font-bold text-blue-300">
                  İade Kredisi <span className="text-white">{fmt(refundBalance)}₺</span>
                </span>
              </div>
            </div>

            {/* Eylem hapları: Para Yükle · Kart Yönet · Geçmiş */}
            <div className="flex gap-2.5">
              <button onClick={() => setView('TOPUP')}
                className="flex-1 py-3.5 bg-[#39FF14] text-[#0A0E14] rounded-2xl font-black text-[13px] flex flex-col items-center gap-1.5 shadow-[0_0_24px_rgba(57,255,20,0.22)] active:scale-[0.98] transition-all">
                <Plus size={20} /> Para Yükle
              </button>
              <button onClick={() => setView('CARDS')}
                className="flex-1 py-3.5 bg-[#161B22] text-white border border-white/8 rounded-2xl font-extrabold text-[13px] flex flex-col items-center gap-1.5 active:scale-[0.98] transition-all">
                <CreditCard size={20} /> Kart Yönet
              </button>
              <button onClick={() => setView('HISTORY')}
                className="flex-1 py-3.5 bg-[#161B22] text-white border border-white/8 rounded-2xl font-extrabold text-[13px] flex flex-col items-center gap-1.5 active:scale-[0.98] transition-all">
                <List size={20} /> Geçmiş
              </button>
            </div>

            {/* Koşullu kazanç satırı — tasarım geliştirmesi: referral vb. kazanç
                varsa gizlenmez, yoksa hiç görünmez (oyuncuda kazanç yok kuralı) */}
            {earningsBalance > 0 && (
              <div className="bg-[#161B22] border border-yellow-400/20 rounded-2xl p-3.5 flex items-center gap-3">
                <span className="w-[34px] h-[34px] rounded-[10px] bg-yellow-400/12 flex items-center justify-center text-[#FACC15] shrink-0">
                  <TrendingUp size={16} />
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-extrabold text-white">Kazanç bakiyen var</p>
                  <p className="text-[10px] text-gray-500 mt-0.5">IBAN'a çekilebilir</p>
                </div>
                <span className="text-sm font-black text-[#FACC15] font-numeric">{fmt(earningsBalance)}₺</span>
                <button onClick={() => setView('PAYOUT_FORM')}
                  className="text-[11px] font-extrabold text-[#39FF14] shrink-0">Çek</button>
              </div>
            )}

            {/* Kayıtlı kartlar mini karuseli */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <p className="text-[11px] font-black uppercase tracking-[0.14em] text-gray-500">Kayıtlı Kartlar</p>
                <button onClick={() => setView('CARDS')} className="text-[11px] text-[#39FF14] font-bold">Tümü</button>
              </div>
              <div className="oy-carousel flex gap-3 overflow-x-auto pb-1">
                {savedCards.map(card => (
                  <div key={card.id}
                    className={`shrink-0 w-[200px] h-[120px] rounded-[18px] p-4 bg-gradient-to-br ${card.gradient ?? 'from-purple-800 to-blue-600'} flex flex-col justify-between`}>
                    <div className="flex justify-between items-center">
                      <span className="w-[34px] h-6 rounded bg-gradient-to-br from-yellow-400 to-yellow-700" />
                      <CardBrandMark brand={card.brand} size={15} />
                    </div>
                    <div>
                      <p className="text-sm font-bold tracking-[0.1em] text-white font-numeric">•••• {card.last4}</p>
                      <p className="text-[9px] text-white/70 uppercase mt-1">
                        {card.isDefault ? 'Varsayılan' : ''}
                        {card.expMonth && card.expYear ? `${card.isDefault ? ' · ' : ''}${String(card.expMonth).padStart(2, '0')}/${String(card.expYear).slice(-2)}` : ''}
                      </p>
                    </div>
                  </div>
                ))}
                <button onClick={() => { setAddCardReturn('CARDS'); setView('ADD_CARD'); }}
                  className="shrink-0 w-20 h-[120px] rounded-[18px] border-[1.5px] border-dashed border-white/16 flex items-center justify-center text-gray-400">
                  <Plus size={22} />
                </button>
              </div>
            </div>
          </>
        )}

        {/* Son işlemler / Kazanç geçmişi */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <p className="text-[11px] font-black uppercase tracking-[0.14em] text-gray-500">
              {isEarningsRole ? 'Kazanç Geçmişi' : 'Son İşlemler'}
            </p>
            <button onClick={() => setView('HISTORY')} className="text-[11px] text-[#39FF14] font-bold">Tümü</button>
          </div>
          <AnimatePresence mode="wait">
            <motion.div key={isEarningsRole ? 'earn' : 'player'}
              initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-2">
              {recentTx.length === 0 ? (
                <div className="py-12 text-center">
                  <Wallet size={32} className="text-gray-700 mx-auto mb-3" />
                  <p className="text-gray-600 text-sm">Henüz işlem geçmişin yok.</p>
                </div>
              ) : recentTx.map(tx => <TxRow key={tx.id} tx={tx} />)}
            </motion.div>
          </AnimatePresence>
        </div>

        {/* Store uyum mikro-notu */}
        <p className="text-[10px] text-gray-600 leading-relaxed px-0.5 pb-2">
          {isEarningsRole
            ? 'Kazançlar hizmet tamamlandıkça birikir ve IBAN talebiyle hesabına aktarılır.'
            : 'Bakiye yalnızca OYNA içindeki saha, maç ve hizmet ödemelerinde kullanılır; dijital ürün satın alımında kullanılamaz.'}
        </p>
      </main>
    </div>
  );
};

// ─── Yardımcı bileşenler ─────────────────────────────────────────────────────

const SubHeader = ({ title, subtitle, onBack }: { title: string; subtitle: string; onBack: () => void }) => (
  <header className="px-5 pt-safe py-4 flex items-center gap-4 border-b border-white/5 sticky top-0 bg-[#0A0E14]/90 backdrop-blur-xl z-20">
    <button onClick={onBack}
      className="w-[42px] h-[42px] flex items-center justify-center bg-[#161B22] rounded-full border border-white/5 text-white active:scale-95 transition-all shrink-0">
      <ArrowLeft size={20} />
    </button>
    <div>
      <h1 className="text-[17px] font-black text-white uppercase">{title}</h1>
      <p className="text-[11px] text-gray-500 font-semibold">{subtitle}</p>
    </div>
  </header>
);

const TxRow = ({ tx }: { tx: { id: string; amount: number; type: string; status: string; description: string | null; created_at: string; balance_type?: string } }) => {
  const meta = txMeta(tx as WalletTx);
  const isPending = tx.status === 'PENDING';
  const isFailed = tx.status === 'FAILED' || tx.status === 'CANCELLED';
  const d = new Date(tx.created_at);
  const dateStr = `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')} · ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  return (
    <div className={`bg-[#161B22] border rounded-[14px] p-3.5 flex items-center justify-between gap-3 ${isFailed ? 'border-red-500/25' : 'border-white/5'}`}>
      <div className="flex items-center gap-3 min-w-0">
        <span className={`w-[34px] h-[34px] rounded-[11px] flex items-center justify-center shrink-0 ${meta.bg} ${meta.color}`}>
          {meta.icon}
        </span>
        <div className="min-w-0">
          <p className="font-bold text-[13px] text-white truncate">{tx.description ?? tx.type}</p>
          <div className="flex items-center gap-1.5 mt-0.5">
            <p className="text-gray-600 text-[10px]">{dateStr}</p>
            {isPending && (
              <span className="text-[8.5px] text-[#FACC15] bg-yellow-400/12 px-1.5 py-px rounded-full font-bold">Beklemede</span>
            )}
            {isFailed && (
              <span className="text-[8.5px] text-red-400 bg-red-400/10 px-1.5 py-px rounded-full font-bold">
                {tx.status === 'FAILED' ? 'Başarısız' : 'İptal'}
              </span>
            )}
          </div>
        </div>
      </div>
      <p className={`font-black text-sm shrink-0 font-numeric ${isFailed ? 'text-gray-600 line-through' : meta.income ? meta.color : 'text-white'}`}>
        {meta.income ? '+' : '−'}{Math.abs(tx.amount).toLocaleString('tr-TR', { maximumFractionDigits: 2 })}₺
      </p>
    </div>
  );
};

export default WalletScreen;
