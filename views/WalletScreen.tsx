import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle, ArrowLeft, ArrowUpRight, Check, CheckCircle2, Clock,
  CreditCard, Gift, History, Info, Landmark, List, Lock, Pencil, Plus,
  RefreshCw, RotateCcw, Shield, Trash2, TrendingUp, Users, Wallet, X, Zap,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useShallow } from 'zustand/react/shallow';
import { supabase } from '../supabaseClient';
import { useAppStore } from '../store';
import { useAsagiCekYenile } from '../hooks/useAsagiCekYenile';
import { YenileniyorSeridi } from '../components/common/YenileniyorSeridi';
import { UserRole } from '../types';
import { formatTRYAmount, formatTRYSigned } from '../utils/formatTRY';
import {
  getWalletSummary, listSavedCards, deleteSavedCard, setDefaultSavedCard,
  getOwnerEarningsSummary, EarningsSummary, WalletSummary, SavedCard,
  previewWalletCashout, requestWalletCashout, getPayoutMethods, addPayoutMethod,
  cancelWalletCashout,
} from '../services/walletService';
import { validateTrIban } from '../utils/iban';
import { showToast } from '../components/common/GlobalToast';
import { startInAppCardPayment, getCardFeePct, computeCardFee, stripServerErrorPrefix } from '../services/paymentService';
import AddCardScreen from '../components/payment/AddCardScreen';
import CardBrandMark, { brandGradient } from '../components/payment/CardBrandMark';
import ThreeDSSheet, { ThreeDSOutcome } from '../components/payment/ThreeDSSheet';
import { mapError, mapPayoutError } from '../utils/errorMap';

/**
 * CÜZDAN — role göre iki yapı (tasarım 2a + kaleci/hakem):
 *   • Oyuncu: Cüzdan Bakiyesi (hero = yüklenen + iade), Para Yükle /
 *     Kart Yönet / Geçmiş, "Paramı Hesabıma Çek", kayıtlı kart karuseli,
 *     son işlemler. Kazanç bakiyesi > 0 ise (ör. referral) koşullu küçük
 *     kazanç satırı görünür — para mahsur kalmaz.
 *     K1: "İade kredisi" ayrı bir para türü DEĞİLDİR; tek isim, tek sayı.
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
  // K1: cüzdan çekiminde brüt ≠ net. Kullanıcıya hesabına GEÇECEK tutarı
  // göstermek için net gerekir; iptal yalnız WALLET_CASHOUT'ta mümkün.
  fee_amount: number | null;
  net_amount: number | null;
  payout_type: string | null;
  reject_reason: string | null;
}

type View = 'MAIN' | 'TOPUP' | 'CARDS' | 'ADD_CARD' | 'HISTORY' | 'PAYOUT_FORM' | 'CASHOUT';
type HistoryFilter = 'ALL' | 'TOPUP' | 'PAYMENT' | 'REFUND' | 'EARNING';

// C10 + IP-19 — para biçimi tek kaynaktan: ₺ dahil, sembol sonda, kuruş varsa
// iki hane. Cüzdan muhasebe bağlamıdır: sıfır bakiye "Ücretsiz" değil "0₺".
const money = formatTRYAmount;

const INCOME_TYPES = new Set(['TOP_UP', 'DEPOSIT', 'REFUND', 'MATCH_REFUND', 'MATCH_EARNING', 'BOOKING_EARNING', 'SERVICE_EARNING', 'REFERRAL_BONUS']);
const TOPUP_PRESETS = [300, 500, 750, 1000, 1500];
const TOPUP_MIN = 300;
const TOPUP_MAX = 20000; // sunucu (prepare_card_payment) ile aynı üst sınır — C1: girişte doğrula

const formatIBAN = (raw: string): string => {
  const clean = raw.replace(/[^A-Z0-9]/gi, '').toUpperCase().slice(0, 26);
  return clean.replace(/(.{4})/g, '$1 ').trim();
};
// Eski hali yalnız "TR ile başlasın, 26 karakter olsun" bakıyordu; basamağı
// yanlış IBAN geçiyor, para gönderilemeyip talep FAILED'a düşüyordu. Artık
// tek kaynak utils/iban (ISO 7064 mod-97) — sunucudaki is_valid_tr_iban ile aynı kural.
const validateIBAN = (raw: string): boolean => validateTrIban(raw).valid;

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
  // ─── STORE ABONELİKLERİ — DAR SEÇİCİLER ────────────────────────────────────
  // FE-1: burada seçicisiz `useAppStore()` vardı; Zustand v5'te bu TÜM store'a
  // abone olmaktır. Cüzdan uzun listeler (100 hareket + kartlar + talepler)
  // çiziyor; store'daki ilgisiz her `set()` bu ekranı baştan render ediyordu.
  // Render'a giren alanlar tek `useShallow` grubunda, aksiyonlar (referansları
  // sabit) tek tek. Aksiyonların dar seçiciyle alınması aynı zamanda
  // `fetchData`nın `setSavedCards` bağımlılığını stabil tutar: `fetchData`
  // kimliği değişmediği için onu koşturan efekt yeniden tetiklenmez.
  const { role, savedCards, walletInitialTab, lastPaymentError, paymentContext } =
    useAppStore(useShallow((s) => ({
      role: s.role,
      savedCards: s.savedCards,
      walletInitialTab: s.walletInitialTab,
      lastPaymentError: s.lastPaymentError,
      paymentContext: s.paymentContext,
    })));

  const setSavedCards = useAppStore(s => s.setSavedCards);
  const setWalletInitialTab = useAppStore(s => s.setWalletInitialTab);
  const setLastPaymentError = useAppStore(s => s.setLastPaymentError);

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
  // Kart işlem bedeli oranı — okunamazsa 0 kalır ve ekranda hiç görünmez.
  const [cardFeePct, setCardFeePct] = useState(0);
  // Uygulama-içi 3DS (banka SMS) sayfası — para yüklemede
  const [topupThreeDS, setTopupThreeDS] = useState<{ html: string; intentId: string } | null>(null);
  // C1 — çift-tık kilidi (senkron) + idempotency anahtarı (retry'da aynı kalır).
  const topupBusyRef = useRef(false);
  const topupIdemRef = useRef<string | null>(null);
  const genIdem = () => {
    try { if (crypto?.randomUUID) return crypto.randomUUID(); } catch { /* eski webview */ }
    return `topup-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  };
  // Kart ekleme hangi ekrandan açıldı — bitince oraya dön
  const [addCardReturn, setAddCardReturn] = useState<'CARDS' | 'TOPUP'>('CARDS');

  // Çekim formu
  const [payoutAmount, setPayoutAmount] = useState('');
  const [payoutIban, setPayoutIban] = useState('');
  const [payoutHolder, setPayoutHolder] = useState('');
  const [payoutBusy, setPayoutBusy] = useState(false);
  const [payoutError, setPayoutError] = useState('');
  const [payoutDone, setPayoutDone] = useState(false);

  // S2.1 — Cüzdandan çekim (düşük görünürlük; kesinti/net SUNUCUDAN, şeffaf)
  const [cashoutAmount, setCashoutAmount] = useState('');
  const [cashoutIban, setCashoutIban] = useState('');
  const [cashoutHolder, setCashoutHolder] = useState('');
  const [cashoutBusy, setCashoutBusy] = useState(false);
  const [cashoutError, setCashoutError] = useState('');
  const [cashoutDone, setCashoutDone] = useState<{ net: number; iban_last4: string } | null>(null);
  const [cashoutPreview, setCashoutPreview] = useState<import('../services/walletService').CashoutPreview | null>(null);
  // K1 — bekleyen talebin kullanıcı tarafından iptali
  const [cancelConfirm, setCancelConfirm] = useState<string | null>(null);
  const [cancelBusy, setCancelBusy] = useState(false);
  const cashoutBusyRef = useRef(false);

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
          .select('id,amount,iban,iban_holder_name,status,created_at,fee_amount,net_amount,payout_type,reject_reason')
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

  // AŞAĞI ÇEKİP YENİLE — bakiye ve hareketler tazelenir.
  const cekerekYenileniyor = useAsagiCekYenile(fetchData);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Kart işlem bedeli oranını bir kez oku (SSOT: app_config.card_fee_pct).
  useEffect(() => {
    let alive = true;
    getCardFeePct().then(p => { if (alive) setCardFeePct(p); }).catch(() => {});
    return () => { alive = false; };
  }, []);

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
  // K1: "İade kredisi" ayrı bir para türü değil. Kullanıcıya tek isim, tek
  // sayı gösterilir: Cüzdan Bakiyesi = yüklenen + iade. Tamamı harcanabilir
  // ve tamamı %5 hizmet bedeliyle çekilebilir.
  //
  // IP-19: toplam artık burada YENİDEN hesaplanmıyor. Ödeme ekranı ve profil
  // kısayolu sunucunun `spendable_balance` alanını okuyor; cüzdanın kendi
  // toplamı tutmaya kalkması, aynı paranın üç ekranda ayrışması demekti.
  const walletBalance = summary?.spendableBalance ?? 0;
  // Bir maçta güvencede bekleyen kapora. walletBalance'a DÂHİL DEĞİL: para
  // zaten cüzdandan çıktı, burada yalnız "nerede?" sorusu cevaplanıyor.
  const blockedBalance = summary?.blockedBalance ?? 0;
  const blockedMatchCount = summary?.blockedMatchCount ?? 0;

  const effectiveTopup = isCustom ? Number(customAmount) || 0 : topupAmount;
  // Kart işlem bedeli (app_config.card_fee_pct; 0 = kapalı) — sunucudaki
  // yuvarlamanın aynısıyla hesaplanır, ekranda yazan toplam çekilenle örtüşür.
  const topupFee = computeCardFee(effectiveTopup, cardFeePct);

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
    // C1 — senkron kilit: React state async olduğundan çok hızlı çift-tık
    // topupBusy state'ini aşabilir; ref anında kapıyı kapatır.
    if (topupBusyRef.current || topupBusy) return;
    setTopupError('');
    if (effectiveTopup < TOPUP_MIN) {
      setTopupError(`Minimum yükleme tutarı ${money(TOPUP_MIN)}'dir.`);
      return;
    }
    if (effectiveTopup > TOPUP_MAX) {
      setTopupError(`Tek seferde en fazla ${money(TOPUP_MAX)} yüklenebilir.`);
      return;
    }
    if (!topupCardId) {
      setTopupError('Yükleme için bir kart seç veya yeni kart ekle.');
      return;
    }
    // C1 — bu yükleme denemesi için stabil idempotency anahtarı (retry'da aynı).
    if (!topupIdemRef.current) topupIdemRef.current = genIdem();
    topupBusyRef.current = true;
    setTopupBusy(true);
    try {
      const res = await startInAppCardPayment({
        flow: 'TOP_UP',
        amount: effectiveTopup,
        savedCardId: topupCardId,
        idempotencyKey: topupIdemRef.current,
      });
      if (res.requiresThreeDS && res.threeDSHtml) {
        // Banka SMS doğrulaması — sonuç handleTopupThreeDSDone'a gelir
        setTopupThreeDS({ html: res.threeDSHtml, intentId: res.intentId });
        return; // busy açık kalır; sheet kapanınca sıfırlanır
      }
      topupIdemRef.current = null; // başarı → yeni yükleme yeni anahtar
      setTopupDone(true);
      await fetchData();
      setTimeout(() => { setTopupDone(false); setView('MAIN'); }, 1800);
      topupBusyRef.current = false;
      setTopupBusy(false);
    } catch (e) {
      const raw = e instanceof Error ? e.message : 'Para yükleme başarısız.';
      // BULGU-092 — yerel regex yalnız BÜYÜK harfli önekleri kesiyordu, edge
      // `iyzico: …` döndürdüğü için sağlayıcı adı kullanıcıya basılıyordu.
      console.warn('[wallet] ham sunucu hatası:', raw);
      setTopupError(stripServerErrorPrefix(raw) || 'Para yükleme başarısız.');
      topupBusyRef.current = false;
      setTopupBusy(false);
    }
  };

  const handleTopupThreeDSDone = async (outcome: ThreeDSOutcome) => {
    setTopupThreeDS(null);
    topupBusyRef.current = false;
    setTopupBusy(false);
    if (outcome.ok) {
      topupIdemRef.current = null; // başarı → yeni yükleme yeni anahtar
      setTopupDone(true);
      await fetchData();
      setTimeout(() => { setTopupDone(false); setView('MAIN'); }, 1800);
    } else {
      // Başarısız → aynı anahtar korunur; "tekrar dene" ikinci çekim yaratmaz.
      setTopupError(outcome.reason === 'TIMEOUT'
        ? 'Banka doğrulaması zaman aşımına uğradı. Yükleme alınmadıysa tekrar deneyebilirsin.'
        : 'Banka doğrulaması tamamlanamadı. Onaylanmayan tutar kartına yansımaz — tekrar deneyebilirsin.');
    }
  };

  const handleTopupThreeDSCancel = () => {
    setTopupThreeDS(null);
    topupBusyRef.current = false;
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
      setPayoutError(mapPayoutError(error));
    } else {
      setPayoutDone(true);
      fetchData();
      setTimeout(() => { setPayoutDone(false); setView('MAIN'); }, 1800);
    }
  };

  const retryPayment = () => {
    setLastPaymentError(null);
    // BULGU-028 (geri tuşu İLERİ götürüyor) burada DEĞİL, store.navigateTo'daki
    // döngü kırıcıda çözülür: yığın tepesi zaten PAYMENT ise ikinci kopya
    // eklenmez, mevcut olan tüketilir.
    //
    // Plandaki `goBack('PAYMENT')` önerisi UYGULANMADI çünkü sessizce kırıyor:
    // Cüzdan'a Profil'den de girilebiliyor (ProfileScreen.tsx:154) ve
    // paymentContext donanım geri tuşuyla PAYMENT'ten çıkıldığında
    // temizlenmiyor. O durumda yığın [DASHBOARD, PROFILE] olur ve goBack
    // kullanıcıyı ödeme ekranına değil PROFİL'e atardı.
    if (paymentContext) useAppStore.getState().navigateTo('PAYMENT');
  };

  // S2.1 — cashout canlı önizleme: kesinti/net her zaman SUNUCUDAN (FE hesaplamaz)
  // BULGU-086 — TOPUP ekranında da çekilir: kullanıcı PARA YÜKLEMEDEN ÖNCE çıkış
  // maliyetini (kesinti yüzdesi, minimum, çekimin açık olup olmadığı) görmeli.
  // TOPUP'ta cashoutAmount boştur → g = 0; preview_wallet_cashout(0) güvenlidir
  // (_wallet_cashout_quote GREATEST(...,0) uygular) ve fee_pct/min/enabled döner.
  useEffect(() => {
    if (view !== 'CASHOUT' && view !== 'TOPUP') return;
    const g = parseFloat(cashoutAmount) || 0;
    let alive = true;
    const t = setTimeout(() => {
      previewWalletCashout(g).then(pv => { if (alive) setCashoutPreview(pv); }).catch(() => {});
    }, 250);
    return () => { alive = false; clearTimeout(t); };
  }, [cashoutAmount, view]);

  const handleRequestCashout = async () => {
    if (cashoutBusyRef.current) return;
    setCashoutError('');
    const g = parseFloat(cashoutAmount);
    const pv = cashoutPreview;
    if (!g || g <= 0) { setCashoutError('Geçerli bir tutar girin.'); return; }
    if (pv && g > pv.withdrawable_balance) { setCashoutError('Çekilebilir bakiyeni aşıyor.'); return; }
    // Bakiyenin tamamı çekiliyorsa minimum eşik aranmaz — yoksa eşik altındaki
    // bakiye kilitlenir (ne çekilebilir ne hesap silinebilir).
    if (pv && g < pv.min && !pv.min_waived) {
      setCashoutError(`En az ${money(pv.min)} çekebilirsin (ya da bakiyenin tamamını).`); return;
    }
    // mod-97 checksum'lı doğrulama: eski kontrol yalnız "TR + 26 karakter"
    // bakıyordu, basamağı yanlış IBAN geçiyor ve talep bankada FAILED'a düşüyordu.
    const ibanCheck = validateTrIban(cashoutIban);
    if (!ibanCheck.valid) { setCashoutError(ibanCheck.reason || 'Geçerli bir IBAN girin.'); return; }
    if (!cashoutHolder.trim()) { setCashoutError('IBAN sahibi adı zorunludur.'); return; }
    cashoutBusyRef.current = true;
    setCashoutBusy(true);
    try {
      // IBAN'ı kayıtlı yönteme çöz (varsa kullan; yoksa ekle) — request method_id ister.
      const cleanIban = cashoutIban.replace(/\s/g, '').toUpperCase();
      const norm = (s?: string | null) => (s ?? '').replace(/\s/g, '').toUpperCase();
      let methods = await getPayoutMethods();
      let m = methods.find(x => x.kind === 'IBAN' && norm(x.iban) === cleanIban);
      if (!m) {
        await addPayoutMethod({ kind: 'IBAN', holderName: cashoutHolder.trim(), iban: cleanIban });
        methods = await getPayoutMethods();
        m = methods.find(x => x.kind === 'IBAN' && norm(x.iban) === cleanIban);
      }
      if (!m) throw new Error('IBAN kaydedilemedi.');
      const res = await requestWalletCashout(g, m.id);
      setCashoutDone({ net: res.net, iban_last4: res.iban_last4 });
      setCashoutAmount('');
      fetchData();
    } catch (e) {
      setCashoutError(mapPayoutError(e, 'Çekim talebi oluşturulamadı.'));
    } finally {
      cashoutBusyRef.current = false;
      setCashoutBusy(false);
    }
  };

  /**
   * K1 — bekleyen çekim talebini iptal et. Brüt tutar kova bazında cüzdana
   * geri döner ve hizmet bedeli alınmaz. Admin aynı anda onaylamış olabilir;
   * o durumda sunucu ALREADY_PROCESSING verir ve dürüst hata gösterilir.
   */
  const handleCancelCashout = async (payoutId: string) => {
    if (cancelBusy) return;
    setCancelBusy(true);
    try {
      const res = await cancelWalletCashout(payoutId);
      setCancelConfirm(null);
      showToast(`Çekim talebin iptal edildi. ${money(res.restored)} cüzdanına geri yüklendi.`, 'success');
      fetchData();
    } catch (e) {
      setCancelConfirm(null);
      showToast(mapError(e, 'Talep iptal edilemedi.'));
      fetchData();
    } finally {
      setCancelBusy(false);
    }
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
      <div lang="tr" className="h-full bg-[#0A0E14] flex flex-col font-sans">
        <SubHeader title="Para Yükle" subtitle="Cüzdanına ekle" onBack={() => setView('MAIN')} />
        <main className="flex-1 overflow-y-auto p-5 space-y-5">
          <div className="text-center py-1">
            <p className="text-[0.6875rem] text-gray-400 font-bold uppercase tracking-[0.1em] mb-1.5">Yüklenecek Tutar</p>
            <p className="text-[2.875rem] font-extrabold leading-none text-white font-numeric">{money(effectiveTopup)}</p>
            {effectiveTopup >= TOPUP_MIN && (
              <p className="text-[0.6875rem] text-[#39FF14] mt-2 font-semibold">
                Yeni bakiye: {money(walletBalance + effectiveTopup)}
              </p>
            )}
            {/* Kart işlem bedeli: yükleme kartla yapıldığı için burada her
                zaman geçerlidir. Cüzdana YÜKLENEN tutar bedelden etkilenmez;
                bedel yalnız karttan çekilen toplamı büyütür. */}
            {effectiveTopup >= TOPUP_MIN && topupFee > 0 && (
              <div className="mt-3 mx-auto max-w-[300px] rounded-2xl border border-white/8 bg-white/[0.03] px-4 py-2.5 space-y-1">
                <div className="flex items-center justify-between text-[0.75rem]">
                  <span className="text-gray-400 font-semibold">Kart işlem bedeli (%{cardFeePct})</span>
                  <span className="text-[#FACC15] font-bold font-numeric">+{money(topupFee)}</span>
                </div>
                <div className="flex items-center justify-between text-[0.75rem]">
                  <span className="text-white font-extrabold">Karttan çekilecek</span>
                  <span className="text-white font-extrabold font-numeric">{money(effectiveTopup + topupFee)}</span>
                </div>
                <p className="text-[0.6875rem] text-ink-4 pt-0.5">
                  Bakiyene {money(effectiveTopup)} geçer; bedel ödeme altyapısı komisyonudur.
                  Bakiyeden yaptığın ödemelerde ek bedel alınmaz.
                </p>
              </div>
            )}
          </div>

          <div className="grid grid-cols-3 gap-2.5">
            {TOPUP_PRESETS.map(v => {
              const active = !isCustom && topupAmount === v;
              return (
                <button key={v} onClick={() => { setIsCustom(false); setTopupAmount(v); }}
                  className={`py-4 rounded-[14px] text-center font-extrabold text-[0.9375rem] font-numeric transition-all ${
                    active
                      ? 'bg-[#39FF14]/12 border-2 border-[#39FF14] text-[#39FF14] shadow-[0_0_18px_rgba(57,255,20,0.15)]'
                      : 'bg-[#161B22] border border-white/8 text-white'
                  }`}>
                  {money(v)}
                </button>
              );
            })}
            <button onClick={() => setIsCustom(true)}
              className={`py-4 rounded-[14px] text-center font-extrabold text-[0.8125rem] flex items-center justify-center gap-1 transition-all ${
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
              className="w-full bg-[#161B22] border border-[#39FF14]/30 rounded-[14px] px-4 py-4 text-white font-extrabold text-2xl font-numeric outline-none placeholder:text-ink-4 text-center"
            />
          )}

          <div className="flex gap-2 items-center px-0.5">
            <Info size={13} className="text-ink-4 shrink-0" />
            <p className="text-[0.6875rem] text-ink-4">Minimum yükleme tutarı {money(TOPUP_MIN)}'dir.</p>
          </div>

          <div>
            <p className="text-[0.6875rem] font-extrabold uppercase tracking-[0.14em] text-ink-4 mb-3">Ödeme Yöntemi</p>
            {savedCards.length === 0 ? (
              <button onClick={() => { setAddCardReturn('TOPUP'); setView('ADD_CARD'); }}
                className="w-full flex items-center gap-3 border-[1.5px] border-dashed border-white/16 rounded-2xl p-4 text-gray-300">
                <span className="w-11 h-[30px] rounded-md bg-white/5 flex items-center justify-center text-gray-400"><Plus size={18} /></span>
                <span className="text-[0.8125rem] font-bold">Yeni kart ekle</span>
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
                      <span className={`w-11 h-[30px] rounded-md bg-gradient-to-br ${brandGradient(card.brand)} flex items-center justify-center shrink-0 border border-white/10`}>
                        <CardBrandMark brand={card.brand} size={13} />
                      </span>
                      <span className="flex-1">
                        <span className="block text-sm font-extrabold text-white font-numeric">•••• {card.last4}</span>
                        <span className="block text-[0.6875rem] text-ink-4 mt-0.5">{card.isDefault ? 'Varsayılan kart' : ''}</span>
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

          {/* BULGU-086 — çıkış maliyeti ÖDEMEDEN ÖNCE yazılır. Rakamlar sunucudan
              (preview_wallet_cashout); hiçbiri sabit yazılmaz. Kontrast: bu bir
              para bilgilendirmesi, text-ink-4 (2.56:1) okunamazdı → gray-400. */}
          <p className="text-[0.6875rem] text-gray-400 leading-relaxed px-0.5">
            Bakiye yalnızca OYNA içindeki saha, maç ve kaleci/hakem hizmet ödemelerinde kullanılır;
            dijital ürün satın alımında kullanılamaz. Yüklemelerde bonus verilmez.
            {cashoutPreview && (cashoutPreview.enabled
              ? ` Bakiyeni en az ${money(cashoutPreview.min)} olmak üzere IBAN'ına geri çekebilirsin; çekimde %${cashoutPreview.fee_pct} hizmet bedeli kesilir.`
              : " Bakiyenin IBAN'a çekimi şu anda kapalı; bakiye yalnız uygulama içi ödemelerde kullanılır.")}
          </p>
        </main>
        <div className="p-5 pb-safe border-t border-white/5">
          <button
            disabled={topupBusy || effectiveTopup < TOPUP_MIN || savedCards.length === 0}
            onClick={handleTopup}
            className={`w-full py-4 font-extrabold text-base rounded-2xl flex items-center justify-center gap-2 transition-all active:scale-[0.98] ${
              !topupBusy && effectiveTopup >= TOPUP_MIN && savedCards.length > 0
                ? 'bg-[#39FF14] text-[#0A0E14]' : 'bg-gray-800 text-ink-4'
            }`}>
            {topupBusy ? <RefreshCw size={18} className="animate-spin" /> : <Plus size={18} />}
            {topupBusy
              ? 'YÜKLENİYOR…'
              : topupFee > 0
                ? `${money(effectiveTopup + topupFee)} ÖDE · ${money(effectiveTopup)} YÜKLE`
                : `${money(effectiveTopup)} YÜKLE`}
          </button>
          {savedCards.length === 0 && !selectedCard && (
            <p className="text-center text-[0.6875rem] text-ink-4 mt-2">Yükleme için önce bir kart ekle.</p>
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
      <div lang="tr" className="h-full bg-[#0A0E14] flex flex-col font-sans">
        <SubHeader title="Paramı Yönet" subtitle="Kayıtlı kartlar ve para çekme" onBack={() => setView('MAIN')} />
        <main className="flex-1 overflow-y-auto p-5 space-y-3.5">
          {/* ── PARAYI HESABA ÇEKME ───────────────────────────────────────────
              [2026-08-06] Bu blok ana cüzdan ekranından buraya taşındı.
              Kullanıcı kararı: para hareketinin iki yönü (kart eklemek ve
              parayı çekmek) tek ekranda toplansın. Çekilebilir bakiye yoksa
              ya da zaten bekleyen bir talep varsa buton görünmez — basınca
              hata veren buton göstermek, hiç göstermemekten kötüdür. */}
          {walletBalance > 0 && !pendingPayout && (
            <div className="rounded-2xl border border-white/8 bg-[#161B22] p-4">
              <p className="text-[0.6875rem] text-ink-4 uppercase tracking-[0.08em] font-bold">Çekilebilir bakiye</p>
              <p className="text-[1.75rem] font-extrabold leading-none mt-1.5 text-white font-numeric">{money(walletBalance)}</p>
              <button onClick={() => { setCashoutError(''); setCashoutDone(null); setCashoutAmount(''); setView('CASHOUT'); }}
                className="mt-3.5 w-full py-3.5 bg-[#0A0E14] text-white border border-white/12 rounded-xl font-extrabold text-[0.8125rem] flex items-center justify-center gap-2 active:scale-[0.98] transition-all hover:border-white/25">
                <ArrowUpRight size={18} /> Paramı Hesabıma Çek
              </button>
            </div>
          )}
          {pendingPayout && (
            <div className="rounded-2xl border border-[#FACC15]/30 bg-[#FACC15]/8 p-4">
              <p className="text-[0.8125rem] font-extrabold text-[#FACC15]">Çekim talebin işleniyor</p>
              <p className="text-[0.75rem] text-ink-3 mt-1">
                Talebin sonuçlanmadan yeni çekim başlatılamaz. Durumu cüzdan ekranından izleyebilirsin.
              </p>
            </div>
          )}

          {defaultCard && (
            <div className={`rounded-[20px] p-5 min-h-[172px] flex flex-col justify-between bg-gradient-to-br ${brandGradient(defaultCard.brand)} relative overflow-hidden shadow-[0_16px_36px_-12px_rgba(0,0,0,0.6)]`}>
              <div className="absolute -top-8 -right-6 w-40 h-40 bg-white/10 blur-[56px] rounded-full" />
              <div className="absolute -bottom-10 -left-8 w-40 h-40 bg-black/20 blur-[56px] rounded-full" />
              <div className="flex justify-between items-start relative">
                <span className="w-11 h-[30px] rounded-[6px] bg-gradient-to-br from-[#f7d774] via-[#e6b34d] to-[#a97b25] relative overflow-hidden shadow-inner">
                  <span className="absolute inset-x-1 top-1/2 -translate-y-1/2 h-[1px] bg-black/25" />
                  <span className="absolute inset-y-1 left-1/2 -translate-x-1/2 w-[1px] bg-black/25" />
                </span>
                <span className="text-[0.625rem] font-extrabold uppercase tracking-[0.08em] text-[#0A0E14] bg-[#39FF14] px-2 py-1 rounded-md">
                  Varsayılan
                </span>
              </div>
              <div className="relative">
                <p className="text-[1.1875rem] font-bold tracking-[0.14em] text-white font-numeric drop-shadow-[0_1px_2px_rgba(0,0,0,0.35)]">•••• •••• •••• {defaultCard.last4}</p>
                <div className="flex justify-between items-end mt-3.5 gap-3">
                  <span className="text-[0.6875rem] text-white/85 font-numeric truncate">
                    {(defaultCard.holderName ?? 'OYNA KULLANICI').toLocaleUpperCase('tr-TR')}
                    {defaultCard.expMonth && defaultCard.expYear ? ` · ${String(defaultCard.expMonth).padStart(2, '0')}/${String(defaultCard.expYear).slice(-2)}` : ''}
                  </span>
                  <CardBrandMark brand={defaultCard.brand} size={22} withWordmark variant="onCard" className="shrink-0" />
                </div>
              </div>
            </div>
          )}
          {others.map(card => (
            <div key={card.id} className="bg-[#161B22] border border-white/8 rounded-2xl p-3.5 flex items-center justify-between gap-2">
              <div className="flex items-center gap-3.5 min-w-0">
                <span className={`w-[46px] h-[31px] rounded-md bg-gradient-to-br ${brandGradient(card.brand)} flex items-center justify-center shrink-0 border border-white/10`}>
                  <CardBrandMark brand={card.brand} size={12} />
                </span>
                <div className="min-w-0">
                  <p className="font-extrabold text-sm text-white font-numeric">•••• {card.last4}</p>
                  <p className="text-ink-4 text-[0.6875rem] mt-0.5">
                    {card.expMonth && card.expYear ? `${String(card.expMonth).padStart(2, '0')}/${String(card.expYear).slice(-2)}` : ''}
                  </p>
                </div>
              </div>
              <div className="flex gap-1.5 shrink-0">
                <button
                  onClick={async () => { await setDefaultSavedCard(card.id).catch(() => {}); setSavedCards(await listSavedCards()); }}
                  className="px-2.5 py-2 bg-white/5 border border-white/8 rounded-[10px] text-gray-400 text-[0.6875rem] font-bold">
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
              <CreditCard size={32} className="text-ink-4 mx-auto mb-3" />
              <p className="text-ink-4 text-sm">Kayıtlı kartın yok.</p>
            </div>
          )}
          {savedCards.length > 0 && defaultCard && (
            <div className="flex gap-2 items-center px-1 pt-1">
              <Shield size={12} className="text-ink-4 shrink-0" />
              <p className="text-[0.6875rem] text-ink-4">Kart numarası ve CVV OYNA'da saklanmaz; yalnız maskeli bilgi tutulur.</p>
            </div>
          )}
        </main>
        <div className="p-5 pb-safe border-t border-white/5">
          <button onClick={() => { setAddCardReturn('CARDS'); setView('ADD_CARD'); }}
            className="w-full py-4 bg-[#39FF14] text-[#0A0E14] font-extrabold text-base rounded-2xl flex items-center justify-center gap-2 active:scale-[0.98] transition-all">
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
      <div lang="tr" className="h-full bg-[#0A0E14] flex flex-col font-sans">
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
              <History size={32} className="text-ink-4 mx-auto mb-3" />
              <p className="text-ink-4 text-sm">Bu filtrede işlem yok.</p>
            </div>
          )}
          {groups.map(g => (
            <div key={g.label} className="mb-5">
              <p className="text-[0.625rem] font-extrabold uppercase tracking-[0.14em] text-ink-4 mb-2.5">{g.label}</p>
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
      <div lang="tr" className="h-full bg-[#0A0E14] flex flex-col font-sans">
        <SubHeader title="IBAN'a Çek" subtitle="Kazancını hesabına aktar" onBack={() => { setView('MAIN'); setPayoutError(''); }} />
        <main className="flex-1 overflow-y-auto p-5 space-y-[18px]">
          <div className="text-center py-2">
            <p className="text-[0.6875rem] text-gray-400 font-bold uppercase tracking-[0.1em] mb-1.5">Çekilebilir Kazanç</p>
            <p className="text-[2.5rem] font-extrabold leading-none text-white font-numeric">{money(earningsBalance)}</p>
            {reservedBalance > 0 && (
              <p className="text-[0.6875rem] text-yellow-400 mt-2 flex items-center justify-center gap-1">
                <Clock size={11} /> {money(reservedBalance)} bekleyen çekimde rezerve
              </p>
            )}
          </div>
          <div>
            <label className="text-[0.625rem] text-ink-4 font-extrabold uppercase tracking-wider block mb-2">Çekilecek Tutar</label>
            <div className="bg-[#161B22] border border-[#39FF14]/30 rounded-[14px] px-4 py-4 flex items-center justify-between">
              <input value={payoutAmount} onChange={e => setPayoutAmount(e.target.value.replace(/[^\d.,]/g, ''))}
                inputMode="decimal" placeholder="0"
                className="bg-transparent text-white font-extrabold text-[1.625rem] font-numeric outline-none w-full placeholder:text-ink-4" />
              <span className="text-xl font-extrabold text-ink-4">₺</span>
            </div>
            <div className="flex gap-2 mt-2.5">
              {quick.map(q => (
                <button key={q} onClick={() => setPayoutAmount(String(Math.min(q, earningsBalance)))}
                  className="flex-1 py-2 bg-[#161B22] border border-white/8 rounded-[10px] text-gray-300 text-xs font-bold">
                  {money(q)}
                </button>
              ))}
              <button onClick={() => setPayoutAmount(String(earningsBalance))}
                className="flex-1 py-2 bg-[#39FF14]/12 border border-[#39FF14]/40 rounded-[10px] text-[#39FF14] text-xs font-extrabold">
                Tümü
              </button>
            </div>
          </div>
          <div>
            <label className="text-[0.625rem] text-ink-4 font-extrabold uppercase tracking-wider block mb-2">Hedef IBAN</label>
            <div className="bg-[#161B22] border border-white/8 rounded-[14px] p-3.5 flex items-center gap-3">
              <span className="w-[34px] h-[34px] rounded-[10px] bg-[#39FF14]/10 flex items-center justify-center text-[#39FF14] shrink-0">
                <Landmark size={16} />
              </span>
              <input
                value={payoutIban}
                onChange={e => setPayoutIban(formatIBAN(e.target.value))}
                placeholder="TR00 0000 0000 0000 0000 0000 00"
                autoCapitalize="characters"
                className="flex-1 bg-transparent text-white font-bold font-numeric text-[0.8125rem] tracking-wider outline-none placeholder:text-ink-4 min-w-0" />
              {validateIBAN(payoutIban) && <Check size={16} className="text-[#39FF14] shrink-0" />}
            </div>
            <input value={payoutHolder} onChange={e => setPayoutHolder(e.target.value.toLocaleUpperCase('tr-TR'))}
              placeholder="IBAN SAHİBİ AD SOYAD"
              className="mt-2.5 w-full bg-[#161B22] border border-white/8 rounded-[14px] px-4 py-3.5 text-white font-bold text-sm outline-none placeholder:text-ink-4" />
          </div>
          <div className="bg-[#0f1419] border border-blue-400/20 rounded-[14px] p-3.5 flex gap-2.5">
            <Info size={15} className="text-blue-400 shrink-0 mt-0.5" />
            <p className="text-[0.75rem] text-gray-400 leading-relaxed">
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
            className={`w-full py-4 font-extrabold text-base rounded-2xl flex items-center justify-center gap-2 transition-all active:scale-[0.98] ${
              !payoutBusy && validateIBAN(payoutIban) && parseFloat(payoutAmount) > 0
                ? 'bg-[#39FF14] text-[#0A0E14]' : 'bg-gray-800 text-ink-4'
            }`}>
            {payoutBusy ? <RefreshCw size={18} className="animate-spin" /> : <ArrowUpRight size={18} />}
            {payoutBusy ? 'GÖNDERİLİYOR…' : `${money(Number(payoutAmount) || 0)} ÇEKİM TALEP ET`}
          </button>
        </div>
      </div>
    );
  }

  // ─── ALT EKRAN: Cüzdandan çekim (S2.1 — düşük görünürlük, şeffaf kesinti) ──
  if (view === 'CASHOUT') {
    const pv = cashoutPreview;
    const g = parseFloat(cashoutAmount) || 0;
    const blockedByIdentity = !!pv && pv.identity_required && !pv.identity_ok;
    const disabled = !!pv && !pv.enabled;
    const canSubmit = !cashoutBusy && !blockedByIdentity && !disabled
      && g > 0 && (!pv || ((g >= pv.min || pv.min_waived) && g <= pv.withdrawable_balance))
      && validateIBAN(cashoutIban) && !!cashoutHolder.trim();
    return (
      <div lang="tr" className="h-full bg-[#0A0E14] flex flex-col font-sans">
        <SubHeader title="Paranı Çek" subtitle="Cüzdan bakiyeni banka hesabına aktar"
          onBack={() => { setView('MAIN'); setCashoutError(''); setCashoutDone(null); }} />
        <main className="flex-1 overflow-y-auto p-5 space-y-4">
          {cashoutDone ? (
            <div className="text-center py-10">
              <div className="w-16 h-16 mx-auto rounded-full bg-[#39FF14]/15 border-2 border-[#39FF14]/40 flex items-center justify-center mb-5">
                <CheckCircle2 size={30} className="text-[#39FF14]" />
              </div>
              <p className="text-white font-extrabold text-lg">Çekim talebin alındı</p>
              <p className="text-gray-400 text-sm mt-2 leading-relaxed">
                <span className="text-[#39FF14] font-bold">{money(cashoutDone.net)}</span> net tutar,
                onay sonrası <span className="font-numeric">•••• {cashoutDone.iban_last4}</span> IBAN'ına geçer.
                Genellikle 1–2 iş günü sürer.
              </p>
              <button onClick={() => { setCashoutDone(null); setView('MAIN'); }}
                className="mt-6 px-6 py-3 bg-[#161B22] border border-white/10 rounded-2xl text-white font-bold text-sm">
                Cüzdana Dön
              </button>
            </div>
          ) : disabled ? (
            <div className="bg-[#0f1419] border border-yellow-400/20 rounded-2xl p-4 flex gap-2.5">
              <Info size={16} className="text-yellow-400 shrink-0 mt-0.5" />
              <p className="text-[0.8125rem] text-gray-300 leading-relaxed">
                Bakiye çekme şu anda geçici olarak kapalı. Yüklediğin bakiyeyi uygulama içi ödemelerde kullanmaya devam edebilirsin.
              </p>
            </div>
          ) : (
            <>
              <div className="text-center py-2">
                <p className="text-[0.6875rem] text-gray-400 font-bold uppercase tracking-[0.1em] mb-1.5">Çekilebilir Bakiye</p>
                <p className="text-[2.375rem] font-extrabold leading-none text-white font-numeric">{money(pv?.withdrawable_balance ?? walletBalance)}</p>
                <p className="text-[0.6875rem] text-ink-4 mt-2">
                  Yüklediğin ve iade aldığın tutarların tamamı. Kazancın ayrı çekilir.
                </p>
              </div>

              {blockedByIdentity && (
                <div className="bg-[#0f1419] border border-blue-400/25 rounded-2xl p-3.5 flex gap-2.5">
                  <Shield size={15} className="text-blue-400 shrink-0 mt-0.5" />
                  {/* Bu ekran daha önce "Profil ayarlarından doğrulayabilirsin"
                      diyordu ama oyuncu için böyle bir ekran YOK — yanlış
                      yönlendirmektense dürüst ol. */}
                  <p className="text-[0.75rem] text-gray-300 leading-relaxed">
                    Güvenliğin için para çekmeden önce bir kez <span className="text-white font-semibold">TC kimlik doğrulaması</span> gerekiyor.
                    Bu adım henüz açılmadı; destek ekibiyle iletişime geçebilirsin.
                  </p>
                </div>
              )}

              <div>
                <label className="text-[0.625rem] text-ink-4 font-extrabold uppercase tracking-wider block mb-2">Çekilecek Tutar</label>
                <div className="bg-[#161B22] border border-white/12 rounded-[14px] px-4 py-4 flex items-center justify-between">
                  <input value={cashoutAmount} onChange={e => setCashoutAmount(e.target.value.replace(/[^\d.,]/g, '').replace(',', '.'))}
                    inputMode="decimal" placeholder="0" disabled={blockedByIdentity}
                    className="bg-transparent text-white font-extrabold text-[1.625rem] font-numeric outline-none w-full placeholder:text-ink-4 disabled:opacity-50" />
                  <span className="text-xl font-extrabold text-ink-4">₺</span>
                </div>
              </div>

              {/* ŞEFFAF kesinti/net — rakam SUNUCUDAN (preview_wallet_cashout) */}
              {g > 0 && pv && (
                <div className="bg-[#161B22] border border-white/8 rounded-[14px] p-4 space-y-2">
                  <div className="flex justify-between text-[0.8125rem]"><span className="text-ink-4">Çekilecek</span><span className="text-white font-bold font-numeric">{money(pv.gross)}</span></div>
                  <div className="flex justify-between text-[0.8125rem]"><span className="text-ink-4">Hizmet bedeli (%{pv.fee_pct})</span><span className="text-red-300 font-bold font-numeric">−{money(pv.fee)}</span></div>
                  <div className="h-px bg-white/8" />
                  <div className="flex justify-between text-[0.875rem]"><span className="text-gray-300 font-semibold">Hesabına geçecek</span><span className="text-[#39FF14] font-extrabold font-numeric">{money(pv.net)}</span></div>
                </div>
              )}

              <div>
                <label className="text-[0.625rem] text-ink-4 font-extrabold uppercase tracking-wider block mb-2">Hedef IBAN (kendi adına)</label>
                <div className="bg-[#161B22] border border-white/8 rounded-[14px] p-3.5 flex items-center gap-3">
                  <span className="w-[34px] h-[34px] rounded-[10px] bg-white/5 flex items-center justify-center text-gray-300 shrink-0"><Landmark size={16} /></span>
                  <input value={cashoutIban} onChange={e => setCashoutIban(formatIBAN(e.target.value))}
                    placeholder="TR00 0000 0000 0000 0000 0000 00" autoCapitalize="characters"
                    className="flex-1 bg-transparent text-white font-bold font-numeric text-[0.8125rem] tracking-wider outline-none placeholder:text-ink-4 min-w-0" />
                  {validateIBAN(cashoutIban) && <Check size={16} className="text-[#39FF14] shrink-0" />}
                </div>
                <input value={cashoutHolder} onChange={e => setCashoutHolder(e.target.value.toLocaleUpperCase('tr-TR'))}
                  placeholder="IBAN SAHİBİ AD SOYAD"
                  className="mt-2.5 w-full bg-[#161B22] border border-white/8 rounded-[14px] px-4 py-3.5 text-white font-bold text-sm outline-none placeholder:text-ink-4" />
              </div>

              {cashoutError && (
                <div className="bg-red-900/20 border border-red-500/30 rounded-2xl p-3 flex gap-2">
                  <AlertTriangle size={16} className="text-red-400 shrink-0 mt-0.5" />
                  <p className="text-red-300 text-sm">{cashoutError}</p>
                </div>
              )}
            </>
          )}
        </main>
        {!cashoutDone && !disabled && (
          <div className="p-5 pb-safe border-t border-white/5">
            <button disabled={!canSubmit} onClick={handleRequestCashout}
              className={`w-full py-4 font-extrabold text-base rounded-2xl flex items-center justify-center gap-2 transition-all active:scale-[0.98] ${
                canSubmit ? 'bg-[#39FF14] text-[#0A0E14]' : 'bg-gray-800 text-ink-4'
              }`}>
              {cashoutBusy ? <RefreshCw size={18} className="animate-spin" /> : <ArrowUpRight size={18} />}
              {cashoutBusy ? 'GÖNDERİLİYOR…' : (g > 0 && pv ? `${money(pv.net)} AL` : 'ÇEKİM TALEP ET')}
            </button>
          </div>
        )}
      </div>
    );
  }

  // ─── ANA EKRAN ────────────────────────────────────────────────────────────
  const recentTx = txList.slice(0, 6);

  return (
    <div lang="tr" className="h-full bg-[#0A0E14] flex flex-col font-sans relative overflow-hidden">
      <div className="fixed inset-0 pointer-events-none z-0">
        <div className={`absolute top-[-10%] left-[-10%] w-[50%] h-[30%] blur-[120px] rounded-full ${isEarningsRole ? 'bg-[#FACC15]/8' : 'bg-[#39FF14]/8'}`} />
      </div>

      <header className="px-5 pt-safe py-4 flex justify-between items-center sticky top-0 z-20 bg-[#0A0E14]/80 backdrop-blur-xl border-b border-white/5">
        <button onClick={onBack}
          className="w-[42px] h-[42px] flex items-center justify-center bg-[#161B22] rounded-full border border-white/5 text-white active:scale-95 transition-all">
          <ArrowLeft size={20} />
        </button>
        <div className="flex flex-col items-center">
          <h1 className="text-base font-extrabold text-white tracking-[0.16em] uppercase">Cüzdan</h1>
          {roleBadge && (
            <span className="text-[0.625rem] font-extrabold uppercase tracking-[0.1em] text-[#FACC15] bg-yellow-400/12 px-2 py-0.5 rounded-md mt-1">
              {roleBadge}
            </span>
          )}
        </div>
        <button onClick={() => fetchData()}
          className="w-[42px] h-[42px] flex items-center justify-center bg-[#161B22] rounded-full border border-white/5 text-white active:scale-95 transition-all">
          <RefreshCw size={17} className={refreshing ? 'animate-spin text-[#39FF14]' : ''} />
        </button>
      </header>

      <YenileniyorSeridi aktif={cekerekYenileniyor} />
      <main className="flex-1 overflow-y-auto custom-scrollbar z-10 px-5 pt-2 pb-safe-nav space-y-[18px]">
        {/* Hata banner'ı — başarısız ödeme buraya düşer (hibrit UX'in cüzdan yarısı) */}
        {lastPaymentError && (
          <div className="bg-red-500/10 border border-red-500/30 rounded-2xl p-3.5 flex gap-3">
            <div className="w-[34px] h-[34px] rounded-[10px] bg-red-500/15 flex items-center justify-center text-red-400 shrink-0">
              <AlertTriangle size={18} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[0.8125rem] font-extrabold text-red-400">{lastPaymentError.title}</p>
              <p className="text-[0.75rem] text-gray-300 mt-1 leading-relaxed">{lastPaymentError.message}</p>
              {paymentContext && (
                <button onClick={retryPayment}
                  className="mt-2.5 text-[0.6875rem] font-extrabold text-[#0A0E14] bg-red-400 rounded-[9px] px-3 py-[7px]">
                  Tekrar dene
                </button>
              )}
            </div>
            <button onClick={() => setLastPaymentError(null)} className="text-ink-4 shrink-0 self-start"><X size={15} /></button>
          </div>
        )}

        {/* Finansal veri yüklenemedi — ₺0 yerine dürüst hata + tekrar dene */}
        {loadError && !summary && (
          <div className="bg-amber-500/10 border border-amber-500/30 rounded-2xl p-3.5 flex gap-3">
            <div className="w-[34px] h-[34px] rounded-[10px] bg-amber-500/15 flex items-center justify-center text-amber-400 shrink-0">
              <AlertTriangle size={18} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[0.8125rem] font-extrabold text-amber-400">Bakiye yüklenemedi</p>
              <p className="text-[0.75rem] text-gray-300 mt-1 leading-relaxed">
                Bağlantı sorunu nedeniyle bakiyen alınamadı. Gösterilen tutar güncel olmayabilir.
              </p>
              <button onClick={() => fetchData()} disabled={refreshing}
                className="mt-2.5 text-[0.6875rem] font-extrabold text-[#0A0E14] bg-amber-400 rounded-[9px] px-3 py-[7px] disabled:opacity-60">
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
                <p className="text-[0.6875rem] font-extrabold uppercase tracking-[0.14em] text-yellow-200/80">Çekilebilir Kazanç</p>
                {loading ? (
                  <div className="h-10 w-40 bg-white/5 rounded-lg animate-pulse mt-3" />
                ) : (
                  <p className="text-[2.5rem] font-extrabold leading-none mt-3 text-white font-numeric">{money(earningsBalance)}</p>
                )}
                <div className="flex gap-2 mt-4">
                  <div className="bg-black/30 border border-white/6 rounded-xl px-3 py-2">
                    <p className="text-[0.625rem] text-gray-400 uppercase tracking-[0.08em]">Bu ay</p>
                    <p className="text-[0.8125rem] font-extrabold text-white mt-0.5">{monthStats.count} maç</p>
                  </div>
                  <div className="bg-black/30 border border-white/6 rounded-xl px-3 py-2">
                    <p className="text-[0.625rem] text-gray-400 uppercase tracking-[0.08em]">Kazanç</p>
                    <p className="text-[0.8125rem] font-extrabold text-[#FACC15] mt-0.5">+{money(monthStats.total)}</p>
                  </div>
                  {reservedBalance > 0 && (
                    <div className="bg-black/30 border border-yellow-400/20 rounded-xl px-3 py-2">
                      <p className="text-[0.625rem] text-yellow-400/80 uppercase tracking-[0.08em]">Bekleyen çekim</p>
                      <p className="text-[0.8125rem] font-extrabold text-yellow-300 mt-0.5">{money(reservedBalance)}</p>
                    </div>
                  )}
                </div>
                {/* Güvence beklemesindeki kazanç (2 hafta) — şeffaflık için görünür */}
                {(earnSummary?.pending ?? 0) > 0 && (
                  <div className="mt-3 inline-flex items-center gap-2 bg-blue-400/12 border border-blue-400/25 rounded-xl px-3 py-2">
                    <Clock size={13} className="text-blue-300" />
                    <span className="text-[0.6875rem] font-bold text-blue-200">
                      Güvence beklemesinde <span className="text-white">{money(earnSummary!.pending)}</span>
                      <span className="text-blue-300/70"> · 2 hafta sonra çekilebilir</span>
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* Eylemler: IBAN'a Çek (geniş) + Geçmiş — Para Yükle YOK */}
            <div className="flex gap-2.5">
              <button onClick={() => setView('PAYOUT_FORM')}
                className="flex-[2] py-[15px] bg-[#39FF14] text-[#0A0E14] font-extrabold text-sm rounded-2xl flex items-center justify-center gap-2 shadow-[0_0_24px_rgba(57,255,20,0.22)] active:scale-[0.98] transition-all">
                <ArrowUpRight size={19} /> IBAN'A ÇEK
              </button>
              <button onClick={() => setView('HISTORY')}
                className="flex-1 py-[15px] bg-[#161B22] text-white border border-white/8 rounded-2xl font-extrabold text-[0.8125rem] flex flex-col items-center gap-1 active:scale-[0.98] transition-all">
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
                  <p className="text-[0.6875rem] text-ink-4 font-numeric mt-0.5">
                    {pendingPayout.iban.slice(0, 4)}•• •••• {pendingPayout.iban.slice(-4)}
                  </p>
                </div>
                <span className="text-sm font-extrabold text-[#FACC15] font-numeric shrink-0">{money(pendingPayout.amount)}</span>
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
                  <p className="text-[0.6875rem] font-extrabold uppercase tracking-[0.14em] text-[#8fe87a]">Cüzdan Bakiyesi</p>
                  {loading ? (
                    <div className="h-10 w-40 bg-white/5 rounded-lg animate-pulse mt-3" />
                  ) : (
                    <p className="text-[2.5rem] font-extrabold leading-none mt-3 text-white font-numeric">{money(walletBalance)}</p>
                  )}
                </div>
                <span className="font-numeric font-bold text-[0.8125rem] tracking-[0.08em] text-[#39FF14] border border-[#39FF14]/40 rounded-lg px-2 py-1">
                  OYNA
                </span>
              </div>
              {/* İadeden gelen tutar için ayrı çip kaldırıldı: farklı bir para
                  türüymüş ve harcanamaz/çekilemezmiş izlenimi veriyordu.
                  Yalnız bilgi amaçlı tek satır mikro-not kalır. */}
              {refundBalance > 0 && (
                <p className="relative mt-4 text-[0.6875rem] font-semibold text-[#8fe87a]/70">
                  Bu tutarın {money(refundBalance)} kadarı iadelerden geldi.
                </p>
              )}
              {/* BLOKE — kapora ödendiğinde bakiye düşüyor ve sıradan bir
                  harcama gibi görünüyordu; parasının nerede olduğu hiçbir
                  ekranda yazmıyordu. Bu satır yalnız "nerede?" sorusunu
                  cevaplar; yukarıdaki bakiyeye DÂHİL DEĞİLDİR. */}
              {blockedBalance > 0 && (
                <div className="relative mt-4 pt-3.5 border-t border-white/10 flex items-start gap-2.5">
                  <Lock size={13} className="text-[#FACC15] shrink-0 mt-0.5" />
                  <div className="min-w-0">
                    <p className="text-[0.75rem] font-extrabold text-white">
                      {money(blockedBalance)} bir maçta güvencede
                    </p>
                    <p className="text-[0.6875rem] font-semibold text-[#8fe87a]/70 leading-snug mt-0.5">
                      {blockedMatchCount > 1
                        ? `${blockedMatchCount} maçın kaporası bekliyor. `
                        : 'Kurduğun maçın kaporası bekliyor. '}
                      Kadro dolunca payın düşülüp kalanı, dolmazsa tamamı cüzdanına döner.
                    </p>
                  </div>
                </div>
              )}
            </div>

            {/* Eylem hapları: Para Yükle · Kart Yönet · Geçmiş */}
            <div className="flex gap-2.5">
              <button onClick={() => setView('TOPUP')}
                className="flex-1 py-3.5 bg-[#39FF14] text-[#0A0E14] rounded-2xl font-extrabold text-[0.8125rem] flex flex-col items-center gap-1.5 shadow-[0_0_24px_rgba(57,255,20,0.22)] active:scale-[0.98] transition-all">
                <Plus size={20} /> Para Yükle
              </button>
              <button onClick={() => setView('CARDS')}
                className="flex-1 py-3.5 bg-[#161B22] text-white border border-white/8 rounded-2xl font-extrabold text-[0.8125rem] flex flex-col items-center gap-1.5 active:scale-[0.98] transition-all">
                <CreditCard size={20} /> Paramı Yönet
              </button>
              <button onClick={() => setView('HISTORY')}
                className="flex-1 py-3.5 bg-[#161B22] text-white border border-white/8 rounded-2xl font-extrabold text-[0.8125rem] flex flex-col items-center gap-1.5 active:scale-[0.98] transition-all">
                <List size={20} /> Geçmiş
              </button>
            </div>

            {/* [2026-08-06 kullanıcı kararı] Çekim butonu buradan KALDIRILDI ve
                "Paramı Yönet" ekranının içine taşındı. Gerekçe: ana cüzdan
                ekranında dört eylem yan yana duruyordu (yükle / yönet / geçmiş
                / çek) ve hiçbiri diğerinden ayrışmıyordu. Artık para hareketinin
                iki yönü tek yerde toplanıyor: kart eklemek de, parayı hesaba
                çekmek de "Paramı Yönet"in içinde.
                Bekleyen çekim TALEBİ kartı burada KALDI — o bir eylem değil,
                kullanıcının "param nerede" sorusunun cevabı. */}

            {/* K1 — bekleyen çekim talebi kartı. Oyuncu dalında hiç yoktu;
                para bakiyeden anında düştüğü için kullanıcı "param nerede"
                diye soruyordu. */}
            {pendingPayout && (
              <div className={`rounded-2xl p-4 border ${
                pendingPayout.status === 'PENDING'
                  ? 'bg-[#FACC15]/8 border-[#FACC15]/30'
                  : 'bg-blue-400/8 border-blue-400/30'
              }`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className={`text-[0.75rem] font-extrabold ${pendingPayout.status === 'PENDING' ? 'text-[#FACC15]' : 'text-blue-300'}`}>
                      {pendingPayout.status === 'PENDING' ? 'Çekim talebin onay bekliyor' : 'Çekim talebin onaylandı'}
                    </p>
                    <p className="text-[0.6875rem] font-bold text-white mt-1">
                      {money(pendingPayout.net_amount ?? pendingPayout.amount)} · •••• {pendingPayout.iban.slice(-4)} hesabına
                    </p>
                    <p className="text-[0.6875rem] text-gray-400 mt-1 leading-relaxed">
                      {pendingPayout.status === 'PENDING'
                        ? `${money(pendingPayout.amount)} cüzdanından düşüldü. Genellikle 1–2 iş günü sürer.`
                        : 'Hesabına geçmesi bankana göre birkaç saat sürebilir.'}
                    </p>
                  </div>
                  <Clock size={16} className={`shrink-0 mt-0.5 ${pendingPayout.status === 'PENDING' ? 'text-[#FACC15]' : 'text-blue-300'}`} />
                </div>
                {/* İptal yalnız cüzdan çekiminde ve yalnız PENDING'te. Admin
                    işleme aldıysa sunucu ALREADY_PROCESSING verir. */}
                {pendingPayout.status === 'PENDING' && pendingPayout.payout_type === 'WALLET_CASHOUT' && (
                  <button
                    disabled={cancelBusy}
                    onClick={() => setCancelConfirm(pendingPayout.id)}
                    className="mt-3 w-full py-2.5 rounded-xl bg-white/5 border border-white/10 text-[0.6875rem] font-bold text-gray-300 hover:text-white transition-colors disabled:opacity-50"
                  >
                    {cancelBusy ? 'İptal ediliyor…' : 'Talebi iptal et'}
                  </button>
                )}
              </div>
            )}

            {/* Koşullu kazanç satırı — tasarım geliştirmesi: referral vb. kazanç
                varsa gizlenmez, yoksa hiç görünmez (oyuncuda kazanç yok kuralı) */}
            {earningsBalance > 0 && (
              <div className="bg-[#161B22] border border-yellow-400/20 rounded-2xl p-3.5 flex items-center gap-3">
                <span className="w-[34px] h-[34px] rounded-[10px] bg-yellow-400/12 flex items-center justify-center text-[#FACC15] shrink-0">
                  <TrendingUp size={16} />
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-extrabold text-white">Kazanç bakiyen var</p>
                  <p className="text-[0.6875rem] text-ink-4 mt-0.5">IBAN'a çekilebilir</p>
                </div>
                <span className="text-sm font-extrabold text-[#FACC15] font-numeric">{money(earningsBalance)}</span>
                <button onClick={() => setView('PAYOUT_FORM')}
                  className="text-[0.6875rem] font-extrabold text-[#39FF14] shrink-0">Çek</button>
              </div>
            )}

            {/* Kayıtlı kartlar mini karuseli */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <p className="text-[0.6875rem] font-extrabold uppercase tracking-[0.14em] text-ink-4">Kayıtlı Kartlar</p>
                <button onClick={() => setView('CARDS')} className="text-[0.6875rem] text-[#39FF14] font-bold">Tümü</button>
              </div>
              <div className="oy-carousel flex gap-3 overflow-x-auto pb-1">
                {savedCards.map(card => (
                  <div key={card.id}
                    className={`shrink-0 w-[210px] h-[126px] rounded-[18px] p-4 bg-gradient-to-br ${brandGradient(card.brand)} flex flex-col justify-between relative overflow-hidden shadow-[0_12px_28px_-10px_rgba(0,0,0,0.55)]`}>
                    <div className="absolute -top-6 -right-4 w-24 h-24 bg-white/10 blur-[42px] rounded-full" />
                    <div className="flex justify-between items-start relative">
                      <span className="w-[36px] h-[26px] rounded-[5px] bg-gradient-to-br from-[#f7d774] via-[#e6b34d] to-[#a97b25] relative overflow-hidden shadow-inner">
                        <span className="absolute inset-x-1 top-1/2 -translate-y-1/2 h-[1px] bg-black/25" />
                      </span>
                      <CardBrandMark brand={card.brand} size={17} variant="onCard" />
                    </div>
                    <div className="relative">
                      <p className="text-[0.9375rem] font-bold tracking-[0.12em] text-white font-numeric drop-shadow-[0_1px_2px_rgba(0,0,0,0.3)]">•••• {card.last4}</p>
                      <p className="text-[0.625rem] text-white/70 uppercase mt-1 tracking-wide">
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
            <p className="text-[0.6875rem] font-extrabold uppercase tracking-[0.14em] text-ink-4">
              {isEarningsRole ? 'Kazanç Geçmişi' : 'Son İşlemler'}
            </p>
            <button onClick={() => setView('HISTORY')} className="text-[0.6875rem] text-[#39FF14] font-bold">Tümü</button>
          </div>
          <AnimatePresence mode="wait">
            <motion.div key={isEarningsRole ? 'earn' : 'player'}
              initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-2">
              {recentTx.length === 0 ? (
                <div className="py-12 text-center">
                  <Wallet size={32} className="text-ink-4 mx-auto mb-3" />
                  <p className="text-ink-4 text-sm">Henüz işlem geçmişin yok.</p>
                </div>
              ) : recentTx.map(tx => <TxRow key={tx.id} tx={tx} />)}
            </motion.div>
          </AnimatePresence>
        </div>

        {/* Store uyum mikro-notu */}
        <p className="text-[0.6875rem] text-ink-4 leading-relaxed px-0.5 pb-2">
          {isEarningsRole
            ? 'Kazançlar hizmet tamamlandıkça birikir ve IBAN talebiyle hesabına aktarılır.'
            : 'Cüzdan bakiyeni OYNA içindeki saha, maç ve hizmet ödemelerinde kullanabilir veya hizmet bedeliyle banka hesabına çekebilirsin; dijital ürün satın alımında kullanılamaz.'}
        </p>
      </main>

      {/* K1 — çekim talebi iptal onayı */}
      <AnimatePresence>
        {cancelConfirm && (
          <div className="fixed inset-0 z-[70] flex items-end justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => !cancelBusy && setCancelConfirm(null)}
              className="absolute inset-0 bg-black/80 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 24 }}
              className="relative z-10 bg-[#161B22] border border-white/10 rounded-[26px] p-6 w-full max-w-sm"
            >
              <h3 className="text-white font-extrabold text-lg">Çekim talebini iptal et?</h3>
              <p className="text-[0.8125rem] text-gray-400 mt-2 leading-relaxed">
                {money(pendingPayout?.amount ?? 0)} cüzdanına geri döner ve hizmet bedeli alınmaz.
                İstediğin zaman yeniden talep açabilirsin.
              </p>
              <div className="flex gap-2.5 mt-5">
                <button
                  disabled={cancelBusy}
                  onClick={() => setCancelConfirm(null)}
                  className="flex-1 py-3 rounded-xl bg-white/5 border border-white/10 text-white text-[0.75rem] font-bold disabled:opacity-50"
                >
                  Vazgeç
                </button>
                <button
                  disabled={cancelBusy}
                  onClick={() => handleCancelCashout(cancelConfirm)}
                  className="flex-1 py-3 rounded-xl bg-red-500 text-white text-[0.75rem] font-extrabold disabled:opacity-50"
                >
                  {cancelBusy ? 'İptal ediliyor…' : 'Talebi iptal et'}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
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
      <h1 className="text-[1.0625rem] font-extrabold text-white uppercase">{title}</h1>
      <p className="text-[0.6875rem] text-ink-4 font-semibold">{subtitle}</p>
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
          <p className="font-bold text-[0.8125rem] text-white truncate">{tx.description ?? tx.type}</p>
          <div className="flex items-center gap-1.5 mt-0.5">
            <p className="text-ink-4 text-[0.6875rem]">{dateStr}</p>
            {isPending && (
              <span className="text-[0.6875rem] text-[#FACC15] bg-yellow-400/12 px-1.5 py-px rounded-full font-bold">Beklemede</span>
            )}
            {isFailed && (
              <span className="text-[0.6875rem] text-red-400 bg-red-400/10 px-1.5 py-px rounded-full font-bold">
                {tx.status === 'FAILED' ? 'Başarısız' : 'İptal'}
              </span>
            )}
          </div>
        </div>
      </div>
      <p className={`font-extrabold text-sm shrink-0 font-numeric ${isFailed ? 'text-ink-4 line-through' : meta.income ? meta.color : 'text-white'}`}>
        {formatTRYSigned(tx.amount, meta.income)}
      </p>
    </div>
  );
};

export default WalletScreen;
