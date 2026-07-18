import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle, ArrowLeft, Calendar, Check, CheckCircle2, Clock, Info,
  LayoutGrid, Lock, MapPin, Plus, RefreshCw, Shield, ShieldCheck, Users, Wallet, X,
} from 'lucide-react';
import CardBrandMark from '../components/payment/CardBrandMark';
import { motion } from 'framer-motion';
import { useAppStore } from '../store';
import { supabase } from '../supabaseClient';
import { auth } from '../supabaseAuth';
import { parseSlotLabel } from '../services/availabilityService';
import {
  getWalletSummary, listSavedCards, WalletSummary, SavedCard,
} from '../services/walletService';
import { startInAppCardPayment, InAppPayInput } from '../services/paymentService';
import { getMyGuardianState } from '../services/guardianService';
import { blockMatchDeposit } from '../services/matchLifecycleService';
import { getMatchDetails } from '../services/matchService';
import AddCardScreen, { CollectedCard } from '../components/payment/AddCardScreen';
import ThreeDSSheet, { ThreeDSOutcome } from '../components/payment/ThreeDSSheet';
import type { PaymentContext } from '../types';
import { formatTRY } from '../utils/formatTRY';

// C1 — idempotency anahtarı üretici. crypto.randomUUID modern webview'de var;
// eski WebView'ler için güvenli yedek (RFC4122 v4 benzeri).
const safeUuid = (): string => {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
  } catch { /* fallback below */ }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
};

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
  /** true ise banka doğrulaması (3DS) uygulama içinde açıldı — sonuç
   *  ThreeDSSheet'ten gelir; başarı ekranı henüz gösterilmez. */
  pendingThreeDS?: boolean;
}

// C10 — para biçimi tek kaynaktan ("1.500,00₺"). Ekranlar arası tutarlılık.
const fmt = formatTRY;

const stripRpcPrefix = (msg: string) => msg.replace(/^[A-Z_]+:\s*/, '');

const delay = (ms: number) => new Promise<void>(r => setTimeout(r, ms));

// Supabase RPC/edge hataları Error DEĞİL — PostgrestError/FunctionsError düz
// nesnedir. Her şekilden ham mesajı çıkar (aksi halde "Beklenmeyen hata"ya düşer).
const rawErrorMessage = (err: unknown): string => {
  if (!err) return '';
  if (typeof err === 'string') return err;
  const e = err as { message?: string; error?: string; details?: string; hint?: string };
  return e.message || e.error || e.details || e.hint || '';
};

// Ham hata → kullanıcı dostu Türkçe + gerektiğinde banka/kart yönlendirmesi.
const humanizePaymentError = (err: unknown): string => {
  const raw = rawErrorMessage(err);
  const up = raw.toUpperCase();
  const has = (...keys: string[]) => keys.some(k => up.includes(k));

  if (has('SLOT_TAKEN', 'SLOT_UNAVAILABLE', 'ZATEN REZERVE', 'DOLU'))
    return 'Bu saat dilimi az önce dolmuş. Lütfen geri dönüp başka bir saat seç.';
  if (has('ALREADY_PAID', 'ZATEN'))
    return 'Bu rezervasyonun kaporası zaten ödenmiş.';
  if (has('AMOUNT_EXCEEDS_PRICE'))
    return 'Ödeme tutarı saha ücretini aşıyor. Lütfen tutarı kontrol et.';
  if (has('NO_TARIFF'))
    return 'Bu saha için fiyat tanımlı değil; şimdilik uygulamadan ödeme alınamıyor.';
  if (has('CARD_NOT_FOUND'))
    return 'Seçtiğin kart bulunamadı. Lütfen kartı yeniden seç veya yeni kart ekle.';
  if (has('CARD_NEEDS_REVALIDATION'))
    return 'Bu kart eski sistemden kalma; güvenlik için kart bilgilerini bir kez daha girmen gerekiyor. "Yeni kart ekle" ile aynı kartı girip kaydedebilirsin.';
  if (has('NO_CARD_AMOUNT'))
    return 'Bakiyen bu tutarın tamamını karşılıyor — kart gerekmiyor. OYNA Bakiyesi seçiliyken tekrar dene.';
  if (has('SLOT_TAKEN_REFUNDED'))
    return 'Sen doğrulama yaparken maçtaki yer doldu. Ödediğin tutar cüzdanına iade kredisi olarak eklendi — istediğin ödemede kullanabilirsin.';
  if (has('BOOKING_CLOSED_REFUNDED'))
    return 'Rezervasyon bu sırada kapandı. Ödediğin tutar cüzdanına iade kredisi olarak eklendi — istediğin ödemede kullanabilirsin.';
  if (has('INSUFFICIENT_BALANCE'))
    return stripRpcPrefix(raw) || 'Cüzdan bakiyen bu ödeme için yetersiz. Cüzdanına yükleme yapıp tekrar dene.';
  if (has('YETERSIZ BAKIYE', 'INSUFFICIENT'))
    return 'Cüzdan bakiyen yetersiz. Bakiye yükleyebilir veya kartla ödeyebilirsin.';
  if (has('UNAUTHORIZED', 'GIRIŞ'))
    return 'Bu işlem için giriş yapman gerekiyor.';
  // iyzico / banka kaynaklı kart hataları
  if (has('IYZICO', 'LIMIT', 'DECLINE', 'DO_NOT_HONOUR', 'INSUFFICIENT_FUNDS',
          'INVALID', 'FRAUD', '3D', 'CARD', 'KART', 'BANKA'))
    return `${stripRpcPrefix(raw) || 'Kart ödemesi tamamlanamadı.'} — Farklı bir kart deneyebilir veya kartının internetten ödemeye açık olup olmadığını bankandan öğrenebilirsin.`;
  if (has('PROVIDER_FLOW_REQUIRED', 'PROVIDER_NOT_CONFIGURED'))
    return 'Ödeme sağlayıcısına ulaşılamadı. Lütfen birazdan tekrar dene.';

  const clean = stripRpcPrefix(raw).trim();
  return clean || 'Ödeme tamamlanamadı. Lütfen tekrar dene; sorun sürerse farklı bir kart deneyebilir veya bankanla iletişime geçebilirsin.';
};

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
  const [tempCard, setTempCard] = useState<CollectedCard | null>(null);
  const [inlineError, setInlineError] = useState('');
  const [result, setResult] = useState<PayResult | null>(null);
  // C3 — cüzdan özeti çekilemezse bakiye 0 VARSAYILMAZ; kullanıcı yanlışlıkla
  // "yetersiz bakiye"ye/tam kart çekimine itilmesin. Hata + Yeniden Dene gösterilir,
  // çözülene dek ödeme kilitli. (Misafirde özet zaten yok — o durumda hata değil.)
  const [summaryError, setSummaryError] = useState(false);
  const [summaryLoading, setSummaryLoading] = useState(true);
  // S1.2/C6 — 3 dk oturum tazelendi bildirimi (ince, kendiliğinden kaybolur).
  const [sessionRefreshed, setSessionRefreshed] = useState(false);
  // S3 — tesis iptal/iade kademesi (SUNUCUDAN; tesis override veya global)
  const [refundPolicy, setRefundPolicy] = useState<{ full_hours: number; half_hours: number; half_pct: number } | null>(null);
  // Uygulama-içi 3DS (banka SMS) sayfası — açıkken tam ekran sheet gösterilir
  const [threeDS, setThreeDS] = useState<{
    html: string; intentId: string; balanceApplied: number; cardAmount: number;
  } | null>(null);
  // Saha vitrini kaporasında rezervasyon yalnız bir kez oluşturulur; tekrar
  // denemede aynı slot yeniden rezerve edilmesin (SLOT_TAKEN önlenir).
  const pitchBookingIdRef = useRef<string | null>(null);
  // H1 — Uçuş-halinde kilit: yavaş bağlantıda çift-tık = çift intent = çift çekim.
  const payBusyRef = useRef(false);
  // C1 — Aynı ödeme denemesinin retry'larında TEK idempotency anahtarı. Geç gelen
  // 3DS sonrası "tekrar dene" ikinci bir kart çekimi yaratmasın; sunucu aynı
  // anahtarlı niyeti yeniden kullanır. Başarıda sıfırlanır (yeni ödeme = yeni anahtar).
  const idemKeyRef = useRef<string | null>(null);

  // Cüzdan özeti + kayıtlı kartlar (C3: hata yutulmaz — yeniden yüklenebilir)
  const loadWallet = useRef<() => void>(() => {});
  useEffect(() => {
    let alive = true;
    const run = async () => {
      setSummaryLoading(true);
      try {
        const [sum, cards] = await Promise.all([getWalletSummary(), listSavedCards()]);
        if (!alive) return;
        setSummary(sum);
        setSavedCards(cards);
        setSummaryError(false);
        const def = cards.find(c => c.isDefault) ?? cards[0];
        setSelectedCardId(prev => prev ?? def?.id ?? null);
      } catch {
        if (!alive) return;
        // Oturum varsa gerçek hata (bakiye bilinmiyor) → 0 varsayma, kullanıcıyı uyar.
        // Misafirse özet zaten yoktur; ödeme anında signup kapısı devreye girer.
        if (auth.currentUser) setSummaryError(true);
      } finally {
        if (alive) setSummaryLoading(false);
      }
    };
    loadWallet.current = run;
    run();
    return () => { alive = false; };
  }, [setSavedCards]);

  // S3 — kapora akışında tesis iptal/iade kademesini SUNUCUDAN çek (göster).
  useEffect(() => {
    const pid = (bookingPitch as any)?.id as string | undefined;
    if (!ctx?.isDeposit || !pid) { setRefundPolicy(null); return; }
    let alive = true;
    (async () => {
      try {
        const { data } = await supabase.rpc('preview_pitch_refund_policy', { p_pitch_id: pid });
        if (alive && data) setRefundPolicy({
          full_hours: Number((data as any).full_hours) || 24,
          half_hours: Number((data as any).half_hours) || 6,
          half_pct: Number((data as any).half_pct) || 50,
        });
      } catch { if (alive) setRefundPolicy(null); }
    })();
    return () => { alive = false; };
  }, [ctx?.isDeposit, (bookingPitch as any)?.id]);

  // İptal kademesi kullanıcı-dostu metin (tesis politikasıyla birebir).
  const refundTierText = refundPolicy
    ? `İptalde iade: ${refundPolicy.full_hours} saat öncesi %100 · ${refundPolicy.half_hours}–${refundPolicy.full_hours} saat arası %${refundPolicy.half_pct} · sonrası iade yok.`
    : null;

  // ─── Türetilen tutarlar (canlı güncellenir) ────────────────────────────────
  const amount = ctx?.amount ?? 0;
  const spendable = summary?.spendableBalance ?? 0;
  const allowBalance = !!ctx?.allowBalance;
  // Cüzdan-öncelikli akış (ör. maç kaporası): ödeme YALNIZ bakiyeden — kart yok.
  const balanceOnly = !!ctx?.balanceOnly;
  const insufficientBalance = balanceOnly && spendable < amount;
  const balanceApplied = balanceOnly
    ? Math.min(spendable, amount)
    : allowBalance && useBalance ? Math.min(spendable, amount) : 0;
  const remaining = Math.max(amount - balanceApplied, 0);
  const needsCard = !balanceOnly && remaining > 0;
  const selectedCard = selectedCardId === 'temp'
    ? tempCard
    : savedCards.find(c => c.id === selectedCardId) ?? null;
  // C3 — bakiye bilinmiyorsa (özet hatası) bakiye-ilgili akışlarda ödeme kilitli.
  const balanceUnknown = summaryError && (allowBalance || balanceOnly);
  const canPay = amount > 0 && !balanceUnknown
    && (balanceOnly ? !insufficientBalance : (!needsCard || !!selectedCard));

  // Cüzdana yükleme kısayolu (cüzdan-öncelikli sistem: para platform içinde döner)
  const goToTopup = () => {
    const store = useAppStore.getState();
    store.setWalletInitialTab('TOPUP');
    store.navigateTo('WALLET');
  };

  const breakdown = balanceOnly
    ? (insufficientBalance ? `Bakiye ${fmt(spendable)}₺ · ${fmt(amount - spendable)}₺ eksik` : 'Tamamı OYNA bakiyenden')
    : balanceApplied > 0 && needsCard
      ? `${fmt(balanceApplied)}₺ bakiye + ${fmt(remaining)}₺ kart`
      : balanceApplied > 0
        ? 'Tamamı OYNA bakiyenden'
        : 'Tamamı karttan';

  const noteText = balanceOnly
    ? (insufficientBalance
        ? `Bu kapora cüzdan bakiyesinden ödenir. Bakiyen ${fmt(spendable)}₺ — ${fmt(amount - spendable)}₺ daha yüklemen gerekiyor.`
        : 'Kapora cüzdan bakiyenden güvenceye alınır. Maç dolmazsa veya iptal olursa tutar anında iade kredisi olarak cüzdanına döner.')
    : !allowBalance
    ? 'Bakiye bu ödemede kullanılamaz.'
    : balanceApplied > 0 && needsCard
      ? `Bakiyen tutarın bir kısmını karşılıyor; kalan ${fmt(remaining)}₺ seçtiğin karttan tahsil edilir.`
      : balanceApplied > 0
        ? 'Tamamı OYNA bakiyenden karşılanıyor — kart gerekmez.'
        : 'Bakiye kullanılmıyor; tutarın tamamı seçtiğin karttan tahsil edilir.';

  // Lobi state'ini tazele (lost-update önleme — sunucu SSOT)
  const refreshMatch = async (matchId?: string) => {
    if (!matchId) return;
    try {
      const fresh = await getMatchDetails(matchId);
      const current = useAppStore.getState().selectedMatch;
      if (fresh && current && current.id === matchId) {
        await updateMatch({ ...current, ...(fresh as any) });
      }
    } catch { /* kritik değil */ }
  };

  // S1.2/C6 — ÖDEME EKRANI 3 DK OTURUMU (üç zaman penceresinin ilki):
  //   ekran 3dk < 3DS banka penceresi 5dk < süpürücü ≥15dk.
  // Kullanıcı PAY ekranında boşta beklerse her 3 dk'da bir bakiye + (maç ise)
  // slot bilgisi tazelenir; böylece bayat fiyat/dolmuş slotla ödeme denemesi
  // (kafa karıştırıcı sunucu reddi) önlenir. 3DS AÇIKKEN veya işlem/başarı
  // ekranındayken sayaç DURUR — bankadayken asla kesilmez. NOT: bu yalnız UX
  // tazelemedir; para güvenliği sunucudadır (prepare_card_payment ödeme anında
  // slot/fiyatı yeniden doğrular ve bayatsa reddeder).
  useEffect(() => {
    if (screen !== 'PAY' || threeDS) return; // yalnız boşta-PAY'de say; 3DS'te dur
    const id = setInterval(() => {
      loadWallet.current();
      if (ctx?.kind === 'MATCH_JOIN') refreshMatch(ctx.matchId);
      setSessionRefreshed(true);
    }, 3 * 60 * 1000);
    return () => clearInterval(id);
    // ctx?.matchId yalnız MATCH_JOIN bağlamında vardır; kind+id ile sabit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screen, threeDS, ctx?.kind]);

  // Tazelendi bildirimi birkaç saniye sonra kendiliğinden kaybolsun.
  useEffect(() => {
    if (!sessionRefreshed) return;
    const t = setTimeout(() => setSessionRefreshed(false), 5000);
    return () => clearTimeout(t);
  }, [sessionRefreshed]);

  // Kart kısmı olan ödeme: uygulama-içi kart akışı (edge 'pay').
  // Yeni kart tüm bilgisiyle bellekten gider; kayıtlı kartta yalnız id gider.
  const payWithCard = async (input: Omit<InAppPayInput, 'card' | 'savedCardId'>): Promise<PayResult> => {
    const payInput: InAppPayInput = { ...input };
    // C1 — tüm kart tahsilatları bu tek noktadan geçer; idempotency anahtarını
    // buraya iliştirince her akış (maça katılım/kapora) çift-çekime karşı korunur.
    if (idemKeyRef.current) payInput.idempotencyKey = idemKeyRef.current;
    if (selectedCardId === 'temp' && tempCard) {
      payInput.card = {
        holderName: tempCard.holderName,
        number: tempCard.number,
        expireMonth: tempCard.expMonth,
        expireYear: tempCard.expYear,
        cvc: tempCard.cvc,
        save: tempCard.save,
      };
    } else if (selectedCardId) {
      payInput.savedCardId = selectedCardId;
    } else {
      throw new Error('CARD_REQUIRED: Kart seç veya yeni kart ekle.');
    }

    const res = await startInAppCardPayment(payInput);

    if (res.requiresThreeDS && res.threeDSHtml) {
      // Banka SMS doğrulaması — sheet açılır; sonuç handleThreeDSDone'a gelir
      setThreeDS({
        html: res.threeDSHtml,
        intentId: res.intentId,
        balanceApplied: res.balanceApplied,
        cardAmount: res.cardAmount,
      });
      return {
        balanceApplied: res.balanceApplied, cardAmount: res.cardAmount,
        intentId: res.intentId, pendingThreeDS: true,
      };
    }

    // SIMULATION: anında uygulandı — iade-krediye dönüş varsa hata gibi göster
    const reason = res.result && res.result.ok === false ? String(res.result.reason ?? '') : '';
    if (reason) throw new Error(reason);
    if (input.flow === 'MATCH_JOIN') await refreshMatch(input.matchId);
    return { balanceApplied: res.balanceApplied, cardAmount: res.cardAmount, intentId: res.intentId };
  };

  // ─── Ödeme yürütme ─────────────────────────────────────────────────────────
  const executePayment = async (): Promise<PayResult> => {
    if (!ctx) throw new Error('Ödeme bağlamı eksik. Lütfen geri dönüp tekrar deneyin.');

    switch (ctx.kind) {
      case 'MATCH_JOIN': {
        // Bakiye tamamını karşılıyorsa kartsız yol (mevcut RPC)
        if (!needsCard) {
          const { data, error } = await supabase.rpc('player_buy_slots_v2', {
            p_match_id: ctx.matchId,
            p_slot_ids: ctx.slotIds ?? [],
            p_use_balance: true,
            p_card_id: null,
          });
          if (error) throw error;
          const d = data as any;
          await refreshMatch(ctx.matchId);
          return {
            balanceApplied: Number(d?.balance_applied) || 0,
            cardAmount: Number(d?.card_amount) || 0,
            intentId: d?.intent_id ?? null,
          };
        }
        return await payWithCard({
          flow: 'MATCH_JOIN',
          matchId: ctx.matchId,
          slotIds: ctx.slotIds ?? [],
          useBalance: allowBalance && useBalance,
        });
      }
      case 'PITCH_DEPOSIT': {
        if (!bookingPitch || !bookingCourt || !bookingDate || !bookingSlot) {
          throw new Error('Rezervasyon bilgileri eksik. Lütfen geri dönüp tekrar deneyin.');
        }
        // Rezervasyonu YALNIZ bir kez oluştur — tekrar denemede aynı slotu yeniden
        // rezerve etmeye çalışıp SLOT_TAKEN almamak için booking id'yi sakla.
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
        if (!needsCard) {
          const { data, error } = await supabase.rpc('record_app_deposit_payment', {
            p_booking_id: bookingId,
            p_amount: amount,
            p_use_balance: true,
            p_card_id: null,
          });
          if (error) throw error;
          const d = data as any;
          return {
            balanceApplied: Number(d?.balance_applied) || 0,
            cardAmount: Number(d?.card_amount) || 0,
            intentId: d?.intent_id ?? null,
          };
        }
        return await payWithCard({
          flow: 'BOOKING_DEPOSIT',
          bookingId,
          amount,
          useBalance: allowBalance && useBalance,
        });
      }
      case 'BOOKING_DEPOSIT': {
        if (!needsCard) {
          const { data, error } = await supabase.rpc('record_app_deposit_payment', {
            p_booking_id: ctx.bookingId,
            p_amount: amount,
            p_use_balance: true,
            p_card_id: null,
          });
          if (error) throw error;
          const d = data as any;
          return {
            balanceApplied: Number(d?.balance_applied) || 0,
            cardAmount: Number(d?.card_amount) || 0,
            intentId: d?.intent_id ?? null,
          };
        }
        return await payWithCard({
          flow: 'BOOKING_DEPOSIT',
          bookingId: ctx.bookingId,
          amount,
          useBalance: allowBalance && useBalance,
        });
      }
      case 'MATCH_CREATE_DEPOSIT': {
        if (!ctx.matchId) throw new Error('Maç bilgisi eksik.');
        // Cüzdan-öncelikli: kapora bakiyeden güvenceye alınır (kart yok, PSP yok).
        try {
          const res = await blockMatchDeposit(ctx.matchId, amount, (ctx.deferredProviders ?? []) as any);
          return { balanceApplied: amount, cardAmount: 0, intentId: (res as any)?.intent_id ?? null };
        } catch (e) {
          // C2 — Yanıt kaybolup kullanıcı tekrar denerse kapora ZATEN işlenmiştir.
          // "ALREADY_BLOCKED" bir HATA DEĞİL; sunucudan intent id'sini teyit edip
          // BAŞARI göster (ikinci bir para hareketi yok — bloke tek kez oldu).
          if (rawErrorMessage(e).includes('ALREADY_BLOCKED')) {
            let intentId: string | null = null;
            try {
              const { data } = await supabase
                .from('payment_intents')
                .select('id')
                .eq('match_id', ctx.matchId)
                .eq('related_entity_type', 'MATCH_DEPOSIT')
                .in('status', ['BLOCKED', 'CAPTURED', 'PAID'])
                .order('created_at', { ascending: false })
                .limit(1).maybeSingle();
              intentId = data?.id ?? null;
            } catch { /* teyit okunamadı — yine de başarı say (bloke gerçekleşti) */ }
            return { balanceApplied: amount, cardAmount: 0, intentId };
          }
          throw e;
        }
      }
    }
  };

  // C4 — kapora akışında başarı sonrası gerçek rezervasyon id'sini bilete taşı.
  const recordTicketBooking = () => {
    const bid = ctx?.kind === 'PITCH_DEPOSIT' ? pitchBookingIdRef.current
      : ctx?.kind === 'BOOKING_DEPOSIT' ? (ctx.bookingId ?? null)
      : null;
    if (bid) useAppStore.getState().setTicketBookingId(bid);
  };

  const handlePay = async () => {
    if (!canPay) return;
    // H1 — çift-tık/çift-gönderim kilidi. Ekran PROCESSING'e geçse de React
    // commit'inden önceki senkron ikinci tık bu ref ile engellenir.
    if (payBusyRef.current) return;
    payBusyRef.current = true;
    if (!auth.currentUser) {
      useAppStore.getState().setIsSignupGateOpen(true);
      payBusyRef.current = false;
      return;
    }
    // Reşit olmayan ödeme kapısı (UX katmanı): sunucudaki trigger da bunu
    // engelliyor, ancak kullanıcıyı ham hata yerine veli onayı ekranına
    // yönlendirelim. Durum alınamazsa sunucu kapısına güveniriz.
    try {
      const gstate = await getMyGuardianState();
      if (gstate && gstate.isMinor && gstate.status !== 'ACTIVE') {
        payBusyRef.current = false;
        useAppStore.getState().navigateTo('GUARDIAN_CHILD');
        return;
      }
    } catch { /* durum alınamadı → sunucu kapısı devrede */ }
    // C1 — bu ödeme denemesi için stabil idempotency anahtarı (retry'da aynı kalır).
    if (!idemKeyRef.current) idemKeyRef.current = safeUuid();
    setInlineError('');
    setScreen('PROCESSING');
    try {
      const res = await executePayment();
      // Banka doğrulaması (3DS) açıldıysa BAŞARI EKRANI GÖSTERME — sonuç
      // ThreeDSSheet üzerinden handleThreeDSDone'a gelecek.
      if (res.pendingThreeDS) return;
      // Sahte gecikme yok — yalnız spinner'ın "flaş"lamasını önleyen küçük taban.
      await delay(needsCard ? 400 : 650);
      setResult(res);
      recordTicketBooking(); // C4 — dürüst bilet için gerçek rezervasyon id'si
      setLastPaymentError(null);
      idemKeyRef.current = null; // başarı → yeni ödeme yeni anahtar alsın
      setScreen('SUCCESS');
    } catch (err) {
      const msg = humanizePaymentError(err);
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
    } finally {
      // 3DS sheet'i açıkken de kilidi bırak: pay butonu o ekranda görünmüyor,
      // sonucu handleThreeDSDone yönetiyor. Böylece 3DS'ten dönüşte tekrar denenebilir.
      payBusyRef.current = false;
    }
  };

  // ─── 3DS sonucu (banka SMS onayı) ─────────────────────────────────────────
  const handleThreeDSDone = async (outcome: ThreeDSOutcome) => {
    const ds = threeDS;
    setThreeDS(null);
    if (!ds) return;

    if (outcome.ok && !outcome.reason) {
      // Tahsilat tamam — OYNA'nın kendi başarı ekranı
      if (ctx?.kind === 'MATCH_JOIN') await refreshMatch(ctx.matchId);
      setResult({ balanceApplied: ds.balanceApplied, cardAmount: ds.cardAmount, intentId: ds.intentId });
      recordTicketBooking(); // C4 — dürüst bilet için gerçek rezervasyon id'si
      setLastPaymentError(null);
      setScreen('SUCCESS');
      return;
    }

    // İade-krediye dönüş (yer doldu / rezervasyon kapandı) veya doğrulama hatası
    const msg = outcome.ok
      ? humanizePaymentError(outcome.reason ?? '')
      : outcome.reason === 'TIMEOUT'
        ? 'Banka doğrulaması zaman aşımına uğradı. Ödeme alınmadıysa tekrar deneyebilirsin; alındıysa bakiyen birazdan güncellenir.'
        : 'Banka doğrulaması tamamlanamadı. Onaylanmayan tutar kartına yansımaz — tekrar deneyebilir veya bankanla iletişime geçebilirsin.';
    setInlineError(msg);
    if (ctx) {
      setLastPaymentError({
        message: msg,
        contextKind: ctx.kind,
        title: ctx.isDeposit ? 'Kapora ödemesi başarısız' : 'Ödeme tamamlanamadı',
        at: Date.now(),
      });
    }
    setScreen('PAY');
  };

  const handleThreeDSCancel = () => {
    setThreeDS(null);
    setInlineError('Banka doğrulaması yarıda kaldı — ödeme alınmadı. Hazır olduğunda tekrar deneyebilirsin.');
    setScreen('PAY');
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
        // Maçlarım hub'ı Rezervasyonlar segmentiyle açılır (ödenen kapora görünür olsun).
        store.setMyMatchesInitialSegment('BOOKINGS');
        store.resetNavigation('MY_MATCHES');
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
        collectMode
        onBack={() => setScreen('PAY')}
        onCollect={(card) => {
          // Kart yalnız bellekte tutulur; ödeme anında edge'e gider.
          // save=true ise 3DS onayıyla birlikte iyzico deposuna kaydedilir.
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
              {selectedCard && needsCard
                ? <CardBrandMark brand={selectedCard.brand} size={18} />
                : <Wallet size={22} />}
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
          <Shield size={13} className="text-[#39FF14] animate-pulse" />
          {needsCard ? 'Banka doğrulaması hazırlanıyor…' : 'OYNA bakiyenden ödeme alınıyor…'}
        </p>
        {/* Banka SMS doğrulaması — uygulama içinde tam ekran (Uber standardı) */}
        {threeDS && (
          <ThreeDSSheet
            htmlBase64={threeDS.html}
            intentId={threeDS.intentId}
            onDone={handleThreeDSDone}
            onCancel={handleThreeDSCancel}
          />
        )}
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
          {/* S3 — onay sayfasında iptal/iade koşulu (tesis politikasıyla birebir) */}
          {ctx.isDeposit && refundTierText && (
            <motion.div initial={{ y: 14, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.28 }}
              className="w-full mt-3.5 bg-yellow-400/6 border border-yellow-400/20 rounded-2xl p-3.5 flex gap-2.5">
              <Shield size={15} className="text-[#FACC15] shrink-0 mt-0.5" />
              <p className="text-[11.5px] text-gray-400 leading-relaxed">{refundTierText}</p>
            </motion.div>
          )}
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
        {/* C3 — cüzdan bakiyesi okunamadı: 0 varsayma, kullanıcıyı uyar + yeniden dene */}
        {balanceUnknown && (
          <div className="mx-5 bg-yellow-500/10 border border-yellow-500/30 rounded-2xl p-3.5 flex gap-3">
            <div className="w-8 h-8 rounded-xl bg-yellow-500/15 flex items-center justify-center text-yellow-400 shrink-0">
              <AlertTriangle size={16} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[13px] font-extrabold text-yellow-400">Cüzdan bakiyesi okunamadı</p>
              <p className="text-[11.5px] text-gray-300 mt-0.5 leading-relaxed">
                Güvenlik için bakiyeni görmeden ödeme almıyoruz. Bağlantını kontrol edip tekrar dene.
              </p>
              <button
                onClick={() => loadWallet.current()}
                disabled={summaryLoading}
                className="mt-2.5 inline-flex items-center gap-1.5 text-[11px] font-extrabold text-[#0A0E14] bg-yellow-400 disabled:opacity-50 rounded-[9px] px-3 py-[7px] active:scale-95 transition-transform">
                <RefreshCw size={12} className={summaryLoading ? 'animate-spin' : ''} /> Yeniden Dene
              </button>
            </div>
          </div>
        )}

        {/* S1.2/C6 — 3 dk oturum tazelendi: güncel bakiye/slot ile devam bilgisi */}
        {sessionRefreshed && !balanceUnknown && (
          <div className="mx-5 bg-[#39FF14]/8 border border-[#39FF14]/25 rounded-2xl p-3 flex items-center gap-2.5">
            <RefreshCw size={14} className="text-[#39FF14] shrink-0" />
            <p className="text-[11.5px] text-gray-300 leading-relaxed">
              Güncel bilgilerle tazelendi — bakiye ve uygunluk şu an geçerli.
            </p>
          </div>
        )}

        {/* Inline hata şeridi + tek dokunuşla tekrar dene (hibrit hata UX'i) */}
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
              <button
                onClick={handlePay}
                disabled={!canPay}
                className="mt-2.5 inline-flex items-center gap-1.5 text-[11px] font-extrabold text-[#0A0E14] bg-red-400 disabled:opacity-50 rounded-[9px] px-3 py-[7px] active:scale-95 transition-transform">
                <RefreshCw size={12} /> Tekrar Dene
              </button>
            </div>
            <button onClick={() => setInlineError('')} className="text-gray-500 shrink-0 self-start"><X size={15} /></button>
          </div>
        )}

        {/* Bağlam özet kartı — dikey ve belirgin (saha kiralamada pin ikonu) */}
        <div className={`mx-5 rounded-[22px] p-5 border ${
          ctx.isDeposit
            ? 'bg-gradient-to-br from-yellow-400/10 to-[#161B22] border-yellow-400/20'
            : 'bg-gradient-to-br from-green-900/25 to-[#161B22] border-[#39FF14]/20'
        }`}>
          <div className="flex items-center gap-3 mb-3.5">
            <div className={`w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 border ${
              ctx.isDeposit ? 'bg-yellow-400/10 border-yellow-400/20 text-[#FACC15]' : 'bg-[#39FF14]/10 border-[#39FF14]/20 text-[#39FF14]'
            }`}>
              {ctx.kind === 'MATCH_JOIN' ? <Users size={24} /> : <MapPin size={24} />}
            </div>
            <span className={`inline-flex items-center text-[10px] font-black uppercase tracking-[0.12em] px-2.5 py-1 rounded-lg ${
              ctx.isDeposit ? 'text-[#FACC15] bg-yellow-400/12' : 'text-[#39FF14] bg-[#39FF14]/12'
            }`}>
              {ctx.badge}
            </span>
          </div>
          <p className="text-[21px] font-black text-white leading-tight">{ctx.title}</p>
          {ctx.details && ctx.details.length > 0 ? (
            <div className="mt-3.5 flex flex-col gap-2.5">
              {ctx.details.map((d, i) => (
                <div key={i} className="flex items-center gap-2.5">
                  <span className={`shrink-0 ${ctx.isDeposit ? 'text-[#FACC15]/80' : 'text-[#39FF14]/80'}`}>
                    {detailIcon(d.icon)}
                  </span>
                  <span className="text-[13.5px] text-gray-100 font-semibold">{d.text}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-[12px] text-gray-400 font-semibold mt-2">{ctx.subtitle}</p>
          )}
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
            {/* OYNA bakiyesi toggle (cüzdan-öncelikli akışta tek yöntem) */}
            <button
              disabled={!allowBalance || balanceOnly}
              onClick={() => allowBalance && !balanceOnly && setUseBalance(v => !v)}
              style={{ scrollSnapAlign: 'start' }}
              className={`shrink-0 rounded-[20px] p-4 text-left bg-gradient-to-br from-green-900/40 to-[#161B22] relative transition-all ${
                balanceOnly ? 'w-full' : 'w-[158px]'
              } ${
                !allowBalance ? 'opacity-45 border border-white/8'
                : balanceApplied > 0 || balanceOnly ? 'border-2 border-[#39FF14] shadow-[0_0_22px_rgba(57,255,20,0.18)]'
                : 'border border-white/8'
              }`}
            >
              {(balanceApplied > 0 || balanceOnly) && !insufficientBalance && (
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
                {!allowBalance ? 'Bu ödemede kullanılamaz'
                  : spendable >= amount ? 'Tamamını karşılar'
                  : spendable > 0 ? 'Kısmen karşılar' : 'Bakiye yok'}
              </p>
              {/* Cüzdan-öncelikli sistem: bakiye yetmiyorsa hızlı yükleme kısayolu */}
              {allowBalance && spendable < amount && (
                <span
                  onClick={(e) => { e.stopPropagation(); goToTopup(); }}
                  className="mt-2 inline-flex items-center gap-1 text-[10px] font-extrabold text-[#0A0E14] bg-[#39FF14] rounded-lg px-2.5 py-1.5 active:scale-95 transition-transform"
                >
                  <Plus size={11} strokeWidth={3} /> Yükle
                </span>
              )}
            </button>

            {/* Kayıtlı kartlar (cüzdan-öncelikli akışta gizli) */}
            {!balanceOnly && savedCards.map(card => {
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
                    <CardBrandMark brand={card.brand} size={13} />
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
            {!balanceOnly && tempCard && (
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
                  <CardBrandMark brand={tempCard.brand} size={13} />
                </span>
                <p className="text-xs font-extrabold text-white font-numeric">•••• {tempCard.last4}</p>
                <p className="text-[9.5px] text-gray-500 mt-1">
                  {tempCard.save ? 'Ödemeyle birlikte kaydedilecek' : 'Tek seferlik · kaydedilmez'}
                </p>
              </button>
            )}

            {/* Yeni kart ekle (cüzdan-öncelikli akışta gizli) */}
            {!balanceOnly && (
              <button onClick={() => setScreen('ADD_CARD')}
                style={{ scrollSnapAlign: 'start' }}
                className="shrink-0 w-[120px] rounded-[20px] p-4 border-[1.5px] border-dashed border-white/16 flex flex-col items-center justify-center gap-2.5 text-gray-400">
                <span className="w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center"><Plus size={20} /></span>
                <p className="text-[11px] font-bold text-center leading-tight">Yeni<br />kart ekle</p>
              </button>
            )}
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

        {/* S3 — iptal/iade kademesi (ödemeden ÖNCE, tesis politikasıyla birebir) */}
        {ctx.isDeposit && refundTierText && (
          <div className="mx-5 bg-[#161B22] border border-white/8 rounded-2xl p-3.5 flex gap-2.5 items-start">
            <Info size={15} className="text-blue-400 shrink-0 mt-0.5" />
            <p className="text-[11.5px] text-gray-300 leading-relaxed">{refundTierText}</p>
          </div>
        )}

        {/* 3D Secure + taksit güven notu (kart gerektiğinde) */}
        {needsCard && (
          <div className="mx-5 flex items-center gap-2 px-1">
            <ShieldCheck size={14} className="text-[#39FF14] shrink-0" />
            <p className="text-[11px] text-gray-400 leading-relaxed">
              <span className="text-gray-200 font-semibold">3D Secure</span> ile güvenli doğrulama · banka SMS onayı uygulama içinde açılır
            </p>
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
        {insufficientBalance ? (
          <button
            onClick={goToTopup}
            className="w-full py-4 font-black text-base rounded-2xl flex items-center justify-center gap-2 transition-all active:scale-[0.98] bg-[#39FF14] text-[#0A0E14] shadow-[0_0_30px_rgba(57,255,20,0.28)]"
          >
            <Wallet size={17} /> CÜZDANA YÜKLE
          </button>
        ) : (
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
        )}
        {insufficientBalance && (
          <p className="text-center text-[10px] text-gray-500 mt-2">
            Bu kapora cüzdandan ödenir — {fmt(amount - spendable)}₺ daha yüklemen yeterli.
          </p>
        )}
        {needsCard && !selectedCard && (
          <p className="text-center text-[10px] text-gray-500 mt-2">
            Devam etmek için bir kart seç, yeni kart ekle
            {allowBalance && (
              <> veya <button onClick={goToTopup} className="text-[#39FF14] font-bold underline">cüzdanına yükle</button></>
            )}.
          </p>
        )}
      </div>
    </div>
  );
};

// ─── Yardımcılar ──────────────────────────────────────────────────────────────

// Bağlam kartı dikey satır ikonu
const detailIcon = (kind: 'pin' | 'court' | 'calendar' | 'clock' | 'users') => {
  const p = { size: 15 };
  switch (kind) {
    case 'pin': return <MapPin {...p} />;
    case 'court': return <LayoutGrid {...p} />;
    case 'calendar': return <Calendar {...p} />;
    case 'clock': return <Clock {...p} />;
    case 'users': return <Users {...p} />;
  }
};

const SummaryRow = ({ label, value, dim, mono }: { label: string; value: string; dim?: boolean; mono?: boolean }) => (
  <div className="flex justify-between items-center gap-4 text-[13px]">
    <span className="text-gray-500 shrink-0">{label}</span>
    <span className={`font-bold text-right truncate ${dim ? 'text-gray-600' : 'text-white'} ${mono ? 'font-numeric text-[11px]' : ''}`}>
      {value}
    </span>
  </div>
);

export default PaymentScreen;
