import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle, ArrowLeft, Calendar, Check, CheckCircle2, Clock, Info,
  LayoutGrid, Lock, MapPin, Plus, RefreshCw, Shield, ShieldCheck, Users, Wallet, X,
} from 'lucide-react';
import CardBrandMark, { brandGradient } from '../components/payment/CardBrandMark';
import { motion } from 'framer-motion';
import { useShallow } from 'zustand/react/shallow';
import { useAppStore } from '../store';
import { supabase } from '../supabaseClient';
import { auth } from '../supabaseAuth';
import { parseSlotLabel } from '../services/availabilityService';
import {
  getWalletSummary, listSavedCards, WalletSummary, SavedCard,
} from '../services/walletService';
import {
  startInAppCardPayment, InAppPayInput, getCardFeePct, computeCardFee, cardFeeOf,
  getIntentStatus, rawErrorMessage, humanizePaymentError,
} from '../services/paymentService';
import { getMyGuardianState } from '../services/guardianService';
import { blockMatchDeposit } from '../services/matchLifecycleService';
import { getMatchDetails } from '../services/matchService';
import AddCardScreen, { CollectedCard } from '../components/payment/AddCardScreen';
import ThreeDSSheet, { ThreeDSOutcome } from '../components/payment/ThreeDSSheet';
import type { PaymentContext } from '../types';
import { formatTRYAmount } from '../utils/formatTRY';
import { olayYaz } from '../utils/olcum';

// ── ÖLÇÜM · bu ekran ÜÇ huninin de 4. ve 5. adımını taşır ───────────────────
// Ödeme ekranı tek ekrandır ama üç farklı akıştan gelinir. Hangi huninin adımı
// olduğu bağlamdan (`ctx.kind`) okunur; aşağıdaki iki tablo o eşlemenin tek
// kaynağıdır — üç ayrı yere `if` yazılırsa biri unutulur ve o huni sessizce
// eksik ölçülür.
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
import {
  safeUuid, isOnline, withSubmitTimeout, SubmitTimeoutError,
  CARD_TIMEOUT_MS, OFFLINE_PAY, TIMEOUT_PAY,
} from '../shared/submitGuard';

/**
 * TEK ÖDEME EKRANI — üç bağlam (tasarım 1b):
 *   maça katılım · saha kaporası · maç oluşturma kaporası (+ mevcut rezervasyon kaporası)
 * Bağlam yalnız başlık/rozet/tutar etiketini değiştirir; düzen sabittir.
 *
 * Ödeme yöntemi karuseli: [Cüzdan toggle] [kayıtlı kartlar…] [Yeni kart ekle]
 * Kısmi ödeme: uygulanan bakiye = min(harcanabilir, tutar); kalan karttan.
 * Hata: hibrit — bu ekranda inline kırmızı şerit + cüzdanda banner (store.lastPaymentError).
 *
 * STORE UYUMU: yalnız fiziksel hizmet bedeli tahsil edilir (saha/maç/hizmet);
 * dijital ürün satışı yoktur — Apple 3.1.5(a) / Google Play muafiyeti korunur.
 */

interface PaymentScreenProps {
  onBack: () => void;
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

// C10 + IP-19 — para biçimi tek kaynaktan: "1.500₺", kuruş varsa "299,90₺".
// Ödeme muhasebe bağlamıdır: sıfır tutar "Ücretsiz" değil "0₺".
const money = formatTRYAmount;

const delay = (ms: number) => new Promise<void>(r => setTimeout(r, ms));

const PaymentScreen: React.FC<PaymentScreenProps> = ({ onBack }) => {
  // ─── STORE ABONELİKLERİ — DAR SEÇİCİLER ────────────────────────────────────
  // FE-1: burada seçicisiz `useAppStore()` vardı; Zustand v5'te bu TÜM store'a
  // abone olmaktır. Ödeme ekranı 3DS beklerken veya 3 dk'lık tazeleme sayacı
  // koşarken gelen HER bildirim/maç güncellemesi tüm formu (kart karuseli dâhil)
  // yeniden çizdiriyordu — para ekranında en istenmeyen şey.
  // `updateMatch` listeden ÇIKARILDI: bu dosyada hiç çağrılmıyor (taze veri
  // yerele `applyMatchLocal` ile uygulanıyor, bkz. refreshMatch) — okunmayan bir
  // alana abone olmak yalnız gereksiz render üretiyordu.
  const { paymentContext, savedCards } = useAppStore(useShallow((s) => ({
    paymentContext: s.paymentContext,
    savedCards: s.savedCards,
  })));

  // Yedek (legacy) saha-kaporası akışının rezervasyon alanları — yalnız
  // `paymentContext` boşken okunur. Altısı da aynı akışın parçası olduğu için
  // ayrı ayrı değil tek grupta alınır (okunaklılık; abonelik maliyeti aynı).
  const { bookingPitch, bookingCourt, bookingDate, bookingSlot, bookingPrice, bookingDeposit } =
    useAppStore(useShallow((s) => ({
      bookingPitch: s.bookingPitch,
      bookingCourt: s.bookingCourt,
      bookingDate: s.bookingDate,
      bookingSlot: s.bookingSlot,
      bookingPrice: s.bookingPrice,
      bookingDeposit: s.bookingDeposit,
    })));

  const setPaymentContext = useAppStore(s => s.setPaymentContext);
  const setLastPaymentError = useAppStore(s => s.setLastPaymentError);
  const setSavedCards = useAppStore(s => s.setSavedCards);

  // Bağlam: store'dan; yoksa legacy saha-kaporası akışı (booking* alanları)
  const ctx: PaymentContext | null = useMemo(() => {
    if (paymentContext) return paymentContext;
    if (bookingPitch && bookingCourt && bookingDate && bookingSlot) {
      const deposit = bookingDeposit ?? Math.min(1000, bookingPrice ?? bookingCourt.price ?? 0);
      return {
        kind: 'PITCH_DEPOSIT',
        badge: 'SAHA KİRALAMA',
        // Yedek akış da tesisini AÇIKÇA taşır; iade kademesi bookingPitch'e
        // gizli bağımlılıkla değil, bağlamdan okunur (BULGU-088).
        pitchId: bookingPitch.id,
        title: bookingPitch.name,
        subtitle: `${bookingCourt.name} · ${bookingDate} · ${bookingSlot}`,
        amount: deposit,
        amountLabel: 'Ödenecek Kapora',
        amountHint: bookingPrice ? `Saha ücreti ${money(bookingPrice)} · kalan tesiste ödenir` : undefined,
        isDeposit: true,
        allowBalance: true,
        successTitle: 'Kapora Onaylandı!',
        successSubtitle: 'Rezervasyon güvende',
        infoNote: 'Kapora rezervasyonunu güvenceye alır. İptal koşulları tesis politikasına göre uygulanır.',
      } satisfies PaymentContext;
    }
    return null;
  }, [paymentContext, bookingPitch, bookingCourt, bookingDate, bookingSlot, bookingPrice, bookingDeposit]);

  // ÖLÇÜM — "ödeme ekranına geldi". `ctx.kind` belli olduktan SONRA yazılır;
  // yoksa hangi huninin adımı olduğu bilinemez. Yalnız tür değişince tekrar
  // yazılır (aynı ekranın yeniden çizilmesi olayı çoğaltmaz).
  const olcumOdemeTuru = ctx?.kind;
  useEffect(() => {
    if (olcumOdemeTuru) olayYaz(OLCUM_EKRAN[olcumOdemeTuru], { tekrarlanabilir: true });
  }, [olcumOdemeTuru]);

  const [screen, setScreen] = useState<Screen>('PAY');
  const [summary, setSummary] = useState<WalletSummary | null>(null);
  const [useBalance, setUseBalance] = useState(true);
  const [selectedCardId, setSelectedCardId] = useState<string | null>(null);
  const [tempCard, setTempCard] = useState<CollectedCard | null>(null);
  const [inlineError, setInlineError] = useState('');
  // Hata şeridinin BAŞLIĞI duruma göre değişir: gönderilmemiş bir isteği
  // "Ödeme başarısız" diye etiketlemek yalan olur.
  // PENDING = sonuç GERÇEKTEN bilinmiyor (3DS yarıda kaldı, niyet sunucuda
  // hâlâ askıda). Bu durumu "başarısız" diye etiketlemek yalan olurdu.
  const [inlineErrorKind, setInlineErrorKind] = useState<'FAIL' | 'OFFLINE' | 'TIMEOUT' | 'PENDING'>('FAIL');
  const [result, setResult] = useState<PayResult | null>(null);
  // C3 — cüzdan özeti çekilemezse bakiye 0 VARSAYILMAZ; kullanıcı yanlışlıkla
  // "yetersiz bakiye"ye/tam kart çekimine itilmesin. Hata + Yeniden Dene gösterilir,
  // çözülene dek ödeme kilitli. (Misafirde özet zaten yok — o durumda hata değil.)
  const [summaryError, setSummaryError] = useState(false);
  const [summaryLoading, setSummaryLoading] = useState(true);
  // Kart işlem bedeli oranı (app_config.card_fee_pct). 0 = özellik kapalı →
  // ekranda hiçbir ek satır çıkmaz. Cüzdandan ödemede HİÇ uygulanmaz.
  const [cardFeePct, setCardFeePct] = useState(0);
  // S1.2/C6 — 3 dk oturum tazelendi bildirimi (ince, kendiliğinden kaybolur).
  const [sessionRefreshed, setSessionRefreshed] = useState(false);
  // S3 — tesis iptal/iade kademesi (SUNUCUDAN; tesis override veya global)
  const [refundPolicy, setRefundPolicy] = useState<{ full_hours: number; half_hours: number; half_pct: number } | null>(null);
  // Uygulama-içi 3DS (banka SMS) sayfası — açıkken tam ekran sheet gösterilir
  const [threeDS, setThreeDS] = useState<{
    html: string; intentId: string; balanceApplied: number; cardAmount: number;
  } | null>(null);
  // BULGU-093 — 3DS zaman aşımı/kesintisinde ASKIDA KALAN niyet. Dolu olduğu
  // sürece hata şeridinde "Durumu Kontrol Et" çıkar; buton payment_intents
  // durumunu SUNUCUDAN sorgular. Uydurma durum gösterilmez: PAID/FAILED/PENDING
  // üç ayrı sonuç verir. (Bayat niyeti kapatacak süpürücü app_config'te KAPALI.)
  const [pendingPay, setPendingPay] = useState<{
    intentId: string; balanceApplied: number; cardAmount: number;
  } | null>(null);
  const [statusChecking, setStatusChecking] = useState(false);
  // Saha vitrini kaporasında rezervasyon yalnız bir kez oluşturulur; tekrar
  // denemede aynı slot yeniden rezerve edilmesin (SLOT_TAKEN önlenir).
  const pitchBookingIdRef = useRef<string | null>(null);
  // H1 — Uçuş-halinde kilit: yavaş bağlantıda çift-tık = çift intent = çift çekim.
  const payBusyRef = useRef(false);
  // C1 — Aynı ödeme denemesinin retry'larında TEK idempotency anahtarı. Geç gelen
  // 3DS sonrası "tekrar dene" ikinci bir kart çekimi yaratmasın; sunucu aynı
  // anahtarlı niyeti yeniden kullanır. Başarıda sıfırlanır (yeni ödeme = yeni anahtar).
  const idemKeyRef = useRef<string | null>(null);

  // Emniyet: ekran hangi yoldan giderse gitsin 3DS kilidi asılı kalmasın.
  // Kilit true kalırsa geri tuşu tamamen ölür ve kullanıcı uygulamada sıkışır.
  const mountedRef = useRef(true);
  useEffect(() => () => {
    mountedRef.current = false;
    useAppStore.getState().setPaymentLockActive(false);
  }, []);
  /** Kilidi YALNIZ ekran hâlâ ayaktayken açar. Ödeme yanıtı ekran kapandıktan
   *  SONRA dönerse (yavaş şebeke + kullanıcı çıktı) unmount temizleyicisi zaten
   *  çalışmış olur; koruma olmadan kilit sonsuza kadar true kalırdı. */
  const lockPaymentIfMounted = () => {
    if (mountedRef.current) useAppStore.getState().setPaymentLockActive(true);
  };

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

  // Kart işlem bedeli oranı (SSOT: app_config.card_fee_pct). Cüzdan özetiyle
  // AYNI ritimde tazelenir: kullanıcı üyelik kapısından geçtiğinde veya 3 dk'lık
  // oturum tazelemesinde oran da yenilenir — misafirken okunamamış bir oran
  // ekranda 0 kalıp sunucunun eklediği bedeli gizlemesin.
  useEffect(() => {
    let alive = true;
    getCardFeePct().then(pct => { if (alive) setCardFeePct(pct); }).catch(() => {});
    return () => { alive = false; };
  }, [summary]);

  // S3 — kapora akışında tesis iptal/iade kademesini SUNUCUDAN çek (göster).
  useEffect(() => {
    // Tesis kimliği ödeme BAĞLAMINDAN gelir; store.bookingPitch yalnız yedek.
    // Maçlarım'dan gelen kapora akışında bookingPitch ya boş ya da önceki
    // gezinmeden kalan BAŞKA tesisin verisiydi (BULGU-088).
    const pid = ctx?.pitchId || ((bookingPitch as any)?.id as string | undefined);
    // Tesis kademesi YALNIZ kapora bağlamlarında geçerlidir (maça katılımda
    // sunucu zaman kademesi uygulamaz). Tesis bilinmiyorsa kademe GÖSTERİLMEZ —
    // yanlış tesisin kademesini göstermektense hiç gösterme.
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
  }, [ctx?.isDeposit, ctx?.pitchId, (bookingPitch as any)?.id]);

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
  // Bakiye BİLİNİYOR mu? (özet yüklendi ve hatasız). Bilinmiyorken "yetersiz"
  // VARSAYMA — aksi halde özet gelene/başarısız olana dek kapora ödenemiyordu
  // ("param var ama yayınlayamıyorum"un ödeme ayağı). Bilinmiyorsa denemeye
  // izin ver; sunucu (match_block_deposit) bakiyeyi zaten otoriter kontrol eder.
  const balanceKnown = !!summary && !summaryError;
  const insufficientBalance = balanceOnly && balanceKnown && spendable < amount;
  const balanceApplied = balanceOnly
    ? Math.min(spendable, amount)
    : allowBalance && useBalance ? Math.min(spendable, amount) : 0;
  const remaining = Math.max(amount - balanceApplied, 0);
  const needsCard = !balanceOnly && remaining > 0;
  // Kart işlem bedeli YALNIZ karttan çekilecek kısma uygulanır; bakiyeden
  // karşılanan tutar bedelsizdir. Sunucudaki yuvarlamanın aynısı kullanılır,
  // böylece burada yazan toplam ile karttan çekilen tutar birebir örtüşür.
  const cardFee = needsCard ? computeCardFee(remaining, cardFeePct) : 0;
  const cardCharge = remaining + cardFee;
  const grandTotal = amount + cardFee;
  const selectedCard = selectedCardId === 'temp'
    ? tempCard
    : savedCards.find(c => c.id === selectedCardId) ?? null;
  // C3 — bakiye bilinmiyorsa YALNIZ kart+bakiye KARIŞIK akışta kilitle (istemci
  // matematiği kritik). Cüzdan-öncelikli (balanceOnly) kaporada kilitleme:
  // özet okunamasa da kullanıcı deneyebilmeli, karar sunucuda.
  const balanceUnknown = summaryError && allowBalance && !balanceOnly;
  // Cüzdan-öncelikli ödeme özet YÜKLENİRKEN beklet (yanlış "yetersiz" gösterme);
  // yükleme bitince (bilinir veya hata) buton canlanır.
  const canPay = amount > 0 && !balanceUnknown
    && !(balanceOnly && summaryLoading)
    && (balanceOnly ? !insufficientBalance : (!needsCard || !!selectedCard));

  // Cüzdana yükleme kısayolu (cüzdan-öncelikli sistem: para platform içinde döner)
  const goToTopup = () => {
    const store = useAppStore.getState();
    store.setWalletInitialTab('TOPUP');
    store.navigateTo('WALLET');
  };

  const breakdown = balanceOnly
    ? (insufficientBalance ? `Bakiye ${money(spendable)} · ${money(amount - spendable)} eksik` : 'Tamamı cüzdanından')
    : balanceApplied > 0 && needsCard
      ? `${money(balanceApplied)} bakiye + ${money(cardCharge)} kart`
      : balanceApplied > 0
        ? 'Tamamı cüzdanından'
        : 'Tamamı karttan';

  const noteText = balanceOnly
    ? (insufficientBalance
        ? `Bu kapora cüzdan bakiyesinden ödenir. Bakiyen ${money(spendable)} — ${money(amount - spendable)} daha yüklemen gerekiyor.`
        : 'Kapora cüzdan bakiyenden güvenceye alınır. Maç dolmazsa veya iptal olursa tutar anında cüzdanına döner.')
    : !allowBalance
    ? 'Bakiye bu ödemede kullanılamaz.'
    : balanceApplied > 0 && needsCard
      ? `Bakiyen tutarın bir kısmını karşılıyor; kalan ${money(remaining)}${cardFee > 0 ? ` + ${money(cardFee)} işlem bedeli` : ''} seçtiğin karttan tahsil edilir.`
      : balanceApplied > 0
        ? 'Tamamı cüzdanından karşılanıyor — kart gerekmez.'
        : cardFee > 0
          ? `Kartla ödemede ödeme altyapısı komisyonu için %${cardFeePct} işlem bedeli eklenir. Cüzdanından ödersen bu bedel alınmaz.`
          : 'Bakiye kullanılmıyor; tutarın tamamı seçtiğin karttan tahsil edilir.';

  // Lobi state'ini tazele (lost-update önleme — sunucu SSOT).
  // KN-3: taze veri YERELE uygulanır, DB'ye GERİ YAZILMAZ (eski updateMatch
  // yolu gereksiz tam yazımdı; player_update_match artık slot da yazmaz).
  const refreshMatch = async (matchId?: string) => {
    if (!matchId) return;
    try {
      const fresh = await getMatchDetails(matchId);
      if (fresh) useAppStore.getState().applyMatchLocal(fresh as any);
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
      // Geri tuşu bu ekranı unmount ederse 3DS sonucu bir daha okunamaz:
      // dinleyici, 3 sn'lik yoklama ve 5 dk'lık timeout ölür, kart bankada
      // çekilmiş olabilir (BULGU-084). Kilit açıkken geri tuşu hiçbir şey yapmaz.
      lockPaymentIfMounted();
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
    // ÖLÇÜM — huninin son adımı. Bu işlev ÜÇ başarı noktasının da (düz ödeme,
    // 3DS sonrası, askıda kalan niyetin sorgulanması) çağırdığı TEK yerdir;
    // ölçüm burada durursa üç yolun hiçbiri unutulmaz.
    // Bağlam yoksa HİÇBİR ŞEY yazılmaz: yanlış huniye yazılmış bir ödeme,
    // hiç yazılmamış olmaktan daha kötüdür (sayı yanlış olur, eksik değil).
    if (ctx) olayYaz(OLCUM_ODENDI[ctx.kind], { tekrarlanabilir: true });
  };

  const handlePay = async () => {
    if (!canPay) return;
    // H1 — çift-tık/çift-gönderim kilidi. Ekran PROCESSING'e geçse de React
    // commit'inden önceki senkron ikinci tık bu ref ile engellenir.
    if (payBusyRef.current) return;
    payBusyRef.current = true;
    // IP-02 — gönderim öncesi bağlantı kapısı: çevrimdışıyken istek HİÇ gitmez.
    // Eskiden istek yola çıkıyor, ekran PROCESSING'e geçiyor ve süresiz asılı
    // kalıyordu; kullanıcı dönüşü olmayan bir spinner'da bekliyordu.
    if (!isOnline()) {
      setInlineErrorKind('OFFLINE');
      setInlineError(OFFLINE_PAY);
      payBusyRef.current = false;
      return;
    }
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
      const res = await withSubmitTimeout(executePayment(), CARD_TIMEOUT_MS);
      // Banka doğrulaması (3DS) açıldıysa BAŞARI EKRANI GÖSTERME — sonuç
      // ThreeDSSheet üzerinden handleThreeDSDone'a gelecek.
      if (res.pendingThreeDS) return;
      // Sahte gecikme yok — yalnız spinner'ın "flaş"lamasını önleyen küçük taban.
      await delay(needsCard ? 400 : 650);
      setResult(res);
      recordTicketBooking(); // C4 — dürüst bilet için gerçek rezervasyon id'si
      setLastPaymentError(null);
      idemKeyRef.current = null; // başarı → yeni ödeme yeni anahtar alsın
      setPendingPay(null); // askıda kalan 3DS niyeti kapandı
      setScreen('SUCCESS');
    } catch (err) {
      // Zaman aşımı ≠ başarısızlık: istek İPTAL EDİLMEDİ, sunucuda tamamlanmış
      // olabilir. Bu yüzden idemKeyRef SIFIRLANMAZ — tekrar deneme aynı
      // anahtarla gider ve çift çekim olmaz.
      if (err instanceof SubmitTimeoutError) {
        setInlineErrorKind('TIMEOUT');
        setInlineError(TIMEOUT_PAY);
        setScreen('PAY');
        return;
      }
      // Kullanıcıya sabit Türkçe metin gösteriliyor; ham sağlayıcı metni
      // destek için console'da (ve payment_intents.raw'da) kalır.
      console.warn('[payment] ham sunucu hatası:', rawErrorMessage(err));
      const msg = humanizePaymentError(err);
      setInlineErrorKind('FAIL');
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
    useAppStore.getState().setPaymentLockActive(false);
    if (!ds) return;

    if (outcome.ok && !outcome.reason) {
      // Tahsilat tamam — OYNA'nın kendi başarı ekranı
      if (ctx?.kind === 'MATCH_JOIN') await refreshMatch(ctx.matchId);
      setResult({ balanceApplied: ds.balanceApplied, cardAmount: ds.cardAmount, intentId: ds.intentId });
      recordTicketBooking(); // C4 — dürüst bilet için gerçek rezervasyon id'si
      setLastPaymentError(null);
      setPendingPay(null); // askıda niyet kalmadı
      idemKeyRef.current = null;
      setScreen('SUCCESS');
      return;
    }

    // TIMEOUT = 5 dk boyunca niyet PAID görülmedi, yani hâlâ PENDING olabilir.
    // Bayat niyeti kapatacak süpürücü app_config'te KAPALI; bu yüzden kullanıcıya
    // "birazdan güncellenir" DENMEZ, sorgulama düğmesi verilir (BULGU-093).
    if (!outcome.ok && outcome.reason === 'TIMEOUT') {
      setPendingPay({ intentId: ds.intentId, balanceApplied: ds.balanceApplied, cardAmount: ds.cardAmount });
      setInlineErrorKind('PENDING');
    } else {
      setInlineErrorKind('FAIL');
    }

    // İade-krediye dönüş (yer doldu / rezervasyon kapandı) veya doğrulama hatası
    const msg = outcome.ok
      ? humanizePaymentError(outcome.reason ?? '')
      : outcome.reason === 'TIMEOUT'
        ? 'Banka doğrulaması 5 dakikada tamamlanmadı. Kartından tahsilat yapıldı mı, şimdi kontrol edelim.'
        : 'Banka doğrulaması tamamlanamadı. Onaylanmayan tutar kartına yansımaz — tekrar deneyebilir veya bankanla iletişime geçebilirsin.';
    setInlineError(msg);
    if (ctx) {
      setLastPaymentError({
        message: msg,
        contextKind: ctx.kind,
        // Zaman aşımında sonuç BİLİNMİYOR; cüzdan afişinde "başarısız" demek
        // uydurma durum göstermek olur.
        title: !outcome.ok && outcome.reason === 'TIMEOUT'
          ? 'Ödemenin durumu belirsiz'
          : ctx.isDeposit ? 'Kapora ödemesi başarısız' : 'Ödeme tamamlanamadı',
        at: Date.now(),
      });
    }
    setScreen('PAY');
  };

  const handleThreeDSCancel = () => {
    const ds = threeDS;
    setThreeDS(null);
    useAppStore.getState().setPaymentLockActive(false);
    // Kullanıcı bankadan KOPTU. SMS'i girdikten sonra çıkmış olabilir; niyet
    // sunucuda hâlâ PENDING veya PAID olabilir. "Ödeme alınmadı" demek uydurma
    // durum göstermek olur — sorgulama düğmesi verilir (BULGU-093).
    if (ds) setPendingPay({ intentId: ds.intentId, balanceApplied: ds.balanceApplied, cardAmount: ds.cardAmount });
    setInlineError(ds
      ? 'Banka doğrulamasından çıktın. Kartından tahsilat yapıldı mı, şimdi kontrol edelim.'
      : 'Banka doğrulaması yarıda kaldı — ödeme alınmadı. Hazır olduğunda tekrar deneyebilirsin.');
    setInlineErrorKind(ds ? 'PENDING' : 'FAIL');
    setScreen('PAY');
  };

  /**
   * BULGU-093 — 3DS kesintisinden sonra paranın akıbetini SUNUCUDAN öğren.
   * Tek otorite `payment_intents.status`; ekran hiçbir durumu tahmin etmez.
   *   PAID (+resultReason yok) → gerçek başarı ekranı (bilet/lobi güncellenir)
   *   PAID (+resultReason var) → tahsil edildi ama cüzdana geri yazıldı
   *   FAILED                   → tahsilat yok, tekrar denenebilir
   *   PENDING                  → hâlâ bankada; işlem numarasıyla destek yolu
   */
  const handleCheckIntentStatus = async () => {
    if (!pendingPay || statusChecking) return;
    setStatusChecking(true);
    try {
      const s = await getIntentStatus(pendingPay.intentId);
      // PAID + resultReason = tahsilat oldu AMA sunucu tutarı cüzdana geri yazdı
      // (yer doldu / rezervasyon kapandı). Bunu "başarı" saymak uydurma durum
      // göstermek olurdu — ThreeDSSheet yolundaki dalın aynısı uygulanır.
      if (s?.status === 'PAID' && s.resultReason) {
        setPendingPay(null);
        setInlineErrorKind('FAIL');
        setInlineError(humanizePaymentError(s.resultReason));
        if (ctx?.kind === 'MATCH_JOIN') await refreshMatch(ctx.matchId);
      } else if (s?.status === 'PAID') {
        if (ctx?.kind === 'MATCH_JOIN') await refreshMatch(ctx.matchId);
        setResult({
          balanceApplied: pendingPay.balanceApplied,
          cardAmount: pendingPay.cardAmount,
          intentId: pendingPay.intentId,
        });
        recordTicketBooking();
        setLastPaymentError(null);
        idemKeyRef.current = null; // başarı → yeni ödeme yeni anahtar alsın
        setPendingPay(null);
        setInlineError('');
        setScreen('SUCCESS');
      } else if (s?.status === 'FAILED') {
        setPendingPay(null);
        setInlineErrorKind('FAIL');
        setInlineError('Kartından tahsilat yapılmamış. Ödeme alınmadı — tekrar deneyebilirsin.');
      } else {
        // PENDING veya okunamayan durum: sonucu UYDURMA, dürüst bekleme metni ver.
        setInlineErrorKind('PENDING');
        setInlineError(`İşlem hâlâ bankada sürüyor. 10 dakika sonra "Durumu Kontrol Et" ile tekrar bak. Kartından para çekildiği hâlde cüzdanına geçmediyse ${pendingPay.intentId.slice(0, 8).toUpperCase()} işlem numarasıyla destek@oyna.app adresine yaz.`);
      }
    } catch {
      setInlineErrorKind('PENDING');
      setInlineError('Durum sorgulanamadı. Bağlantını kontrol edip tekrar dene.');
    } finally {
      setStatusChecking(false);
    }
  };

  const handleSuccessPrimary = () => {
    const store = useAppStore.getState();
    setPaymentContext(null);
    switch (ctx?.kind) {
      case 'MATCH_JOIN': {
        // Tek tuşla Maçlarım lobisine: satın alınan REZERVE slotlar orada
        // doldurulur (kendim / arkadaş / kod). Geri tuşu Maçlarım'a döner.
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
        // Maçlarım hub'ı Rezervasyonlar segmentiyle açılır (ödenen kapora görünür olsun).
        store.setMyMatchesInitialSegment('BOOKINGS');
        store.resetUnderHome('MY_MATCHES');
        break;
      default:
        // F4.1: bu dal ULAŞILAMAZDI (PaymentContextKind'in 4 üyesi de yukarıda) —
        // bilete giden tek navigate burada saklıydı; bilet artık Maçlarım'daki
        // rezervasyon kartından açılır. Güvenli varsayılan: Maçlarım.
        store.resetUnderHome('MY_MATCHES');
    }
  };

  const handleSuccessSecondary = () => {
    setPaymentContext(null);
    useAppStore.getState().resetNavigation('DASHBOARD');
  };

  // ─── Bağlam yoksa güvenli çıkış ────────────────────────────────────────────
  if (!ctx) {
    return (
      <div className="h-full bg-[#0A0E14] flex flex-col items-center justify-center gap-4 p-6">
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
      <div lang="tr" className="h-full bg-[#0A0E14] flex flex-col items-center justify-center p-8">
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
            <p className="text-[0.6875rem] font-numeric text-gray-400">
              {selectedCard && needsCard ? `•••• ${selectedCard.last4}` : 'Cüzdan'}
            </p>
          </div>
        </div>
        <p className="text-lg font-extrabold uppercase tracking-[0.16em] text-white">
          {ctx.isDeposit ? 'Kapora İşleniyor' : 'Ödeme İşleniyor'}
        </p>
        <p className="text-[0.8125rem] text-ink-4 mt-2.5 flex items-center gap-1.5">
          <Shield size={13} className="text-[#39FF14] animate-pulse" />
          {needsCard ? 'Banka doğrulaması hazırlanıyor…' : 'Cüzdanından ödeme alınıyor…'}
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
      <div lang="tr" className="h-full bg-[#0A0E14] flex flex-col relative overflow-hidden">
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
            className="text-[1.6875rem] font-extrabold text-white text-center">
            {ctx.successTitle}
          </motion.h2>
          <motion.p initial={{ y: 14, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.18 }}
            className="text-[0.8125rem] text-[#39FF14] font-bold mt-2 uppercase tracking-[0.14em]">
            {money(amount)} · {ctx.successSubtitle}
          </motion.p>
          <motion.div initial={{ y: 14, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.24 }}
            className="w-full bg-[#161B22] border border-white/8 rounded-3xl p-5 mt-8 space-y-3">
            <SummaryRow label={ctx.kind === 'MATCH_JOIN' ? 'Maç' : 'Saha'} value={ctx.title} />
            <SummaryRow label="Yer & Saat" value={ctx.subtitle} />
            <SummaryRow label="Ödeme" value={
              result && result.balanceApplied > 0 && result.cardAmount > 0
                ? `${money(result.balanceApplied)} bakiye + ${money(result.cardAmount)} kart`
                : result && result.balanceApplied > 0 ? 'Cüzdan' : 'Kart'
            } />
            {/* TAHSİL EDİLEN gerçek bedel (tahmin değil): sunucunun çektiği
                toplamdan hizmet tabanı düşülerek bulunur. */}
            {result && cardFeeOf(amount, result.cardAmount, result.balanceApplied) > 0 && (
              <SummaryRow
                label="Kart işlem bedeli"
                value={money(cardFeeOf(amount, result.cardAmount, result.balanceApplied))}
              />
            )}
            <div className="h-px bg-white/8" />
            <SummaryRow label="İşlem No" value={(result?.intentId ?? '').slice(0, 8).toUpperCase() || '—'} dim mono />
          </motion.div>
          {/* S3 — onay sayfasında iptal/iade koşulu (tesis politikasıyla birebir) */}
          {ctx.isDeposit && refundTierText && (
            <motion.div initial={{ y: 14, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.28 }}
              className="w-full mt-3.5 bg-yellow-400/6 border border-yellow-400/20 rounded-2xl p-3.5 flex gap-2.5">
              <Shield size={15} className="text-[#FACC15] shrink-0 mt-0.5" />
              <p className="text-[0.75rem] text-gray-400 leading-relaxed">{refundTierText}</p>
            </motion.div>
          )}
          {ctx.infoNote && (
            <motion.div initial={{ y: 14, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.3 }}
              className="w-full mt-3.5 bg-blue-500/8 border border-blue-400/20 rounded-2xl p-3.5 flex gap-2.5">
              <Info size={15} className="text-blue-400 shrink-0 mt-0.5" />
              <p className="text-[0.75rem] text-gray-400 leading-relaxed">{ctx.infoNote}</p>
            </motion.div>
          )}
        </main>
        <div className="shrink-0 px-5 pb-safe pt-3 flex flex-col gap-2.5">
          <button onClick={handleSuccessPrimary}
            className="w-full py-4 bg-[#39FF14] text-[#0A0E14] font-extrabold text-[0.9375rem] rounded-2xl active:scale-[0.98] transition-all">
            {ctx.kind === 'MATCH_JOIN' ? 'SLOTLARINI DOLDUR → MAÇLARIM'
              : ctx.kind === 'MATCH_CREATE_DEPOSIT' ? 'MAÇ LOBİSİNE GİT'
              : 'REZERVASYONLARIMA GİT'}
          </button>
          <button onClick={handleSuccessSecondary}
            className="w-full py-3 text-ink-4 font-bold text-sm">
            Ana sayfaya dön
          </button>
        </div>
      </div>
    );
  }

  // ─── Ana ödeme ekranı (1b) ─────────────────────────────────────────────────
  return (
    <div lang="tr" className="h-full bg-[#0A0E14] flex flex-col font-sans">
      <header className="px-5 pt-safe py-4 flex items-center gap-4 border-b border-white/5 sticky top-0 bg-[#0A0E14]/90 backdrop-blur-xl z-20">
        <button onClick={() => { setPaymentContext(null); onBack(); }}
          className="w-11 h-11 flex items-center justify-center bg-[#161B22] rounded-full border border-white/5 text-white active:scale-95 transition-all shrink-0">
          <ArrowLeft size={20} />
        </button>
        <div>
          <h1 className="text-[1.0625rem] font-extrabold text-white uppercase tracking-[0.01em]">
            {ctx.isDeposit ? 'Kapora Ödemesi' : 'Ödeme'}
          </h1>
          <p className="text-[0.6875rem] text-ink-4 font-semibold">
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
              <p className="text-[0.8125rem] font-extrabold text-yellow-400">Cüzdan bakiyesi okunamadı</p>
              <p className="text-[0.75rem] text-gray-300 mt-0.5 leading-relaxed">
                Güvenlik için bakiyeni görmeden ödeme almıyoruz. Bağlantını kontrol edip tekrar dene.
              </p>
              <button
                onClick={() => loadWallet.current()}
                disabled={summaryLoading}
                className="mt-2.5 inline-flex items-center gap-1.5 text-[0.6875rem] font-extrabold text-[#0A0E14] bg-yellow-400 disabled:opacity-50 rounded-[9px] px-3 py-[7px] active:scale-95 transition-transform">
                <RefreshCw size={12} className={summaryLoading ? 'animate-spin' : ''} /> Yeniden Dene
              </button>
            </div>
          </div>
        )}

        {/* S1.2/C6 — 3 dk oturum tazelendi: güncel bakiye/slot ile devam bilgisi */}
        {sessionRefreshed && !balanceUnknown && (
          <div className="mx-5 bg-[#39FF14]/8 border border-[#39FF14]/25 rounded-2xl p-3 flex items-center gap-2.5">
            <RefreshCw size={14} className="text-[#39FF14] shrink-0" />
            <p className="text-[0.75rem] text-gray-300 leading-relaxed">
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
              <p className="text-[0.8125rem] font-extrabold text-red-400">
                {inlineErrorKind === 'OFFLINE'
                  ? 'Gönderilmedi — bağlantı yok'
                  : inlineErrorKind === 'PENDING'
                    ? 'Ödemenin durumu belirsiz'
                    : inlineErrorKind === 'TIMEOUT'
                      ? 'Yanıt gelmedi'
                      : ctx.isDeposit ? 'Kapora ödemesi başarısız' : 'Ödeme başarısız'}
              </p>
              <p className="text-[0.75rem] text-gray-300 mt-0.5 leading-relaxed">{inlineError}</p>
              {/* İkisi de PARA aksiyonu → IP10-2(b) gereği en az 44px dokunma hedefi. */}
              <div className="mt-2.5 flex flex-wrap gap-2">
                <button
                  onClick={handlePay}
                  disabled={!canPay}
                  className="min-h-[44px] inline-flex items-center gap-1.5 text-[0.6875rem] font-extrabold text-[#0A0E14] bg-red-400 disabled:opacity-50 rounded-[11px] px-4 active:scale-95 transition-transform">
                  <RefreshCw size={12} /> Tekrar Dene
                </button>
                {/* BULGU-093 — 3DS kesildiyse paranın akıbeti SUNUCUDAN sorulur. */}
                {pendingPay && (
                  <button
                    onClick={handleCheckIntentStatus}
                    disabled={statusChecking}
                    className="min-h-[44px] inline-flex items-center gap-1.5 text-[0.6875rem] font-extrabold text-[#0A0E14] bg-[#39FF14] disabled:opacity-50 rounded-[11px] px-4 active:scale-95 transition-transform">
                    <RefreshCw size={12} className={statusChecking ? 'animate-spin' : ''} /> Durumu Kontrol Et
                  </button>
                )}
              </div>
            </div>
            <button onClick={() => setInlineError('')} className="text-ink-4 shrink-0 self-start"><X size={15} /></button>
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
            <span className={`inline-flex items-center text-[0.625rem] font-extrabold uppercase tracking-[0.12em] px-2.5 py-1 rounded-lg ${
              ctx.isDeposit ? 'text-[#FACC15] bg-yellow-400/12' : 'text-[#39FF14] bg-[#39FF14]/12'
            }`}>
              {ctx.badge}
            </span>
          </div>
          <p className="text-[1.3125rem] font-extrabold text-white leading-tight">{ctx.title}</p>
          {ctx.details && ctx.details.length > 0 ? (
            <div className="mt-3.5 flex flex-col gap-2.5">
              {ctx.details.map((d, i) => (
                <div key={i} className="flex items-center gap-2.5">
                  <span className={`shrink-0 ${ctx.isDeposit ? 'text-[#FACC15]/80' : 'text-[#39FF14]/80'}`}>
                    {detailIcon(d.icon)}
                  </span>
                  <span className="text-[0.875rem] text-gray-100 font-semibold">{d.text}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-[0.75rem] text-gray-400 font-semibold mt-2">{ctx.subtitle}</p>
          )}
        </div>

        {/* Tutar */}
        <div className="text-center px-5 py-0.5">
          <p className="text-[0.6875rem] text-gray-400 font-bold uppercase tracking-[0.1em] mb-1.5">{ctx.amountLabel}</p>
          <p className={`text-[2.75rem] font-extrabold leading-none font-numeric ${ctx.isDeposit ? 'text-[#FACC15]' : 'text-white'}`}>
            {money(amount)}
          </p>
          {ctx.amountHint && <p className="text-[0.6875rem] text-ink-4 mt-2">{ctx.amountHint}</p>}
          {/* Kart işlem bedeli — yalnız kart kısmı varsa ve oran > 0 iken çıkar.
              Cüzdana geçildiği anda bu blok kaybolur; fark böyle görünür olur. */}
          {cardFee > 0 && (
            <div className="mt-3 mx-auto max-w-[320px] rounded-2xl border border-white/8 bg-white/[0.03] px-4 py-3 space-y-1.5">
              <div className="flex items-center justify-between text-[0.75rem]">
                <span className="text-gray-400 font-semibold">Hizmet tutarı</span>
                <span className="text-white font-bold font-numeric">{money(amount)}</span>
              </div>
              <div className="flex items-center justify-between text-[0.75rem]">
                <span className="text-gray-400 font-semibold">Kart işlem bedeli (%{cardFeePct})</span>
                <span className="text-[#FACC15] font-bold font-numeric">+{money(cardFee)}</span>
              </div>
              <div className="h-px bg-white/8" />
              <div className="flex items-center justify-between text-[0.8125rem]">
                <span className="text-white font-extrabold">Karttan çekilecek</span>
                <span className="text-white font-extrabold font-numeric">{money(grandTotal)}</span>
              </div>
              {allowBalance && !balanceOnly && (
                <p className="text-[0.6875rem] text-[#39FF14]/80 font-semibold pt-0.5">
                  Cüzdanından ödersen bu bedel alınmaz.
                </p>
              )}
            </div>
          )}
        </div>

        {/* Ödeme yöntemi karuseli */}
        <div>
          <p className="text-[0.6875rem] font-extrabold uppercase tracking-[0.14em] text-ink-4 mb-3 px-5">Ödeme Yöntemi</p>
          <div className="oy-carousel flex gap-3 overflow-x-auto px-5 pb-1.5" style={{ scrollSnapType: 'x mandatory' }}>
            {/* Cüzdan toggle (cüzdan-öncelikli akışta tek yöntem) */}
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
                <span className="absolute top-3 right-3 text-ink-4"><Lock size={14} /></span>
              )}
              <span className="w-10 h-10 rounded-xl bg-[#39FF14]/14 flex items-center justify-center text-[#39FF14] mb-8 block">
                <Wallet size={20} />
              </span>
              <p className="text-xs font-extrabold text-white">Cüzdan</p>
              <p className="text-xl font-extrabold text-[#39FF14] mt-1 font-numeric">{money(spendable)}</p>
              <p className="text-[0.6875rem] text-ink-4 mt-0.5">
                {!allowBalance ? 'Bu ödemede kullanılamaz'
                  : spendable >= amount ? 'Tamamını karşılar'
                  : spendable > 0 ? 'Kısmen karşılar' : 'Bakiye yok'}
              </p>
              {/* Cüzdan-öncelikli sistem: bakiye yetmiyorsa hızlı yükleme kısayolu */}
              {allowBalance && spendable < amount && (
                <span
                  onClick={(e) => { e.stopPropagation(); goToTopup(); }}
                  className="mt-2 inline-flex items-center gap-1 text-[0.6875rem] font-extrabold text-[#0A0E14] bg-[#39FF14] rounded-lg px-2.5 py-1.5 active:scale-95 transition-transform"
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
                  <span className={`w-11 h-[30px] rounded-md bg-gradient-to-br ${brandGradient(card.brand)} flex items-center justify-center mb-10 border border-white/10`}>
                    <CardBrandMark brand={card.brand} size={13} />
                  </span>
                  <p className="text-xs font-extrabold text-white font-numeric">•••• {card.last4}</p>
                  <p className="text-[0.6875rem] text-ink-4 mt-1">
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
                <span className={`w-11 h-[30px] rounded-md bg-gradient-to-br ${brandGradient(tempCard.brand)} flex items-center justify-center mb-10 border border-white/10`}>
                  <CardBrandMark brand={tempCard.brand} size={13} />
                </span>
                <p className="text-xs font-extrabold text-white font-numeric">•••• {tempCard.last4}</p>
                <p className="text-[0.6875rem] text-ink-4 mt-1">
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
                <p className="text-[0.6875rem] font-bold text-center leading-tight">Yeni<br />kart ekle</p>
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
          <p className="text-[0.75rem] text-gray-300 leading-relaxed">{noteText}</p>
        </div>

        {/* Kapora güven notu */}
        {/* İade/iptal koşulu HER bağlamda görünür: maça katılımda da para
            hareketi var, koşulu yalnız kapora akışında göstermek eksikti (BULGU-083). */}
        {ctx.infoNote && (
          <div className="mx-5 bg-[#161B22] border border-white/8 rounded-2xl p-3.5 flex gap-2.5 items-start">
            <Shield size={15} className="text-[#FACC15] shrink-0 mt-0.5" />
            <p className="text-[0.75rem] text-gray-300 leading-relaxed">{ctx.infoNote}</p>
          </div>
        )}

        {/* S3 — iptal/iade kademesi (ödemeden ÖNCE, tesis politikasıyla birebir) */}
        {ctx.isDeposit && refundTierText && (
          <div className="mx-5 bg-[#161B22] border border-white/8 rounded-2xl p-3.5 flex gap-2.5 items-start">
            <Info size={15} className="text-blue-400 shrink-0 mt-0.5" />
            <p className="text-[0.75rem] text-gray-300 leading-relaxed">{refundTierText}</p>
          </div>
        )}

        {/* 3D Secure + taksit güven notu (kart gerektiğinde) */}
        {needsCard && (
          <div className="mx-5 flex items-center gap-2 px-1">
            <ShieldCheck size={14} className="text-[#39FF14] shrink-0" />
            <p className="text-[0.6875rem] text-gray-400 leading-relaxed">
              <span className="text-gray-200 font-semibold">3D Secure</span> ile güvenli doğrulama · banka SMS onayı uygulama içinde açılır
            </p>
          </div>
        )}

        {/* Uyum notu: fiziksel hizmet + iptal/iade koşulları */}
        <button onClick={() => useAppStore.getState().navigateTo('LEGAL')}
          className="mx-5 text-left flex gap-2 items-center px-1">
          <Info size={12} className="text-ink-4 shrink-0" />
          <p className="text-[0.6875rem] text-ink-4 leading-relaxed">
            Ödemeler saha/maç/hizmet bedeli içindir. <span className="underline">Mesafeli satış ve iptal/iade koşulları</span>
          </p>
        </button>
      </main>

      {/* Sabit footer */}
      <div className="fixed bottom-0 inset-x-0 max-w-lg mx-auto px-5 pb-safe pt-4 bg-gradient-to-t from-[#0A0E14] via-[#0A0E14]/95 to-transparent border-t border-white/5 z-20">
        <div className="flex items-center justify-between mb-3 px-0.5">
          <span className="text-[0.6875rem] text-ink-4 font-semibold">{breakdown}</span>
          <span className="text-[0.8125rem] font-extrabold text-white">
            Toplam <span className={ctx.isDeposit ? 'text-[#FACC15]' : 'text-[#39FF14]'}>{money(grandTotal)}</span>
          </span>
        </div>
        {insufficientBalance ? (
          <button
            onClick={goToTopup}
            className="w-full py-4 font-extrabold text-base rounded-2xl flex items-center justify-center gap-2 transition-all active:scale-[0.98] bg-[#39FF14] text-[#0A0E14] shadow-[0_0_30px_rgba(57,255,20,0.28)]"
          >
            <Wallet size={17} /> CÜZDANA YÜKLE
          </button>
        ) : (
          <button
            disabled={!canPay}
            onClick={handlePay}
            className={`w-full py-4 font-extrabold text-base rounded-2xl flex items-center justify-center gap-2 transition-all active:scale-[0.98] ${
              canPay
                ? 'bg-[#39FF14] text-[#0A0E14] shadow-[0_0_30px_rgba(57,255,20,0.28)]'
                : 'bg-gray-800 text-ink-4'
            }`}
          >
            <Lock size={17} /> {money(grandTotal)} {ctx.isDeposit ? 'KAPORA ÖDE' : 'ÖDE'}
          </button>
        )}
        {insufficientBalance && (
          <p className="text-center text-[0.6875rem] text-ink-4 mt-2">
            Bu kapora cüzdandan ödenir — {money(amount - spendable)} daha yüklemen yeterli.
          </p>
        )}
        {needsCard && !selectedCard && (
          <p className="text-center text-[0.6875rem] text-ink-4 mt-2">
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
  <div className="flex justify-between items-center gap-4 text-[0.8125rem]">
    <span className="text-ink-4 shrink-0">{label}</span>
    <span className={`font-bold text-right truncate ${dim ? 'text-ink-4' : 'text-white'} ${mono ? 'font-numeric text-[0.6875rem]' : ''}`}>
      {value}
    </span>
  </div>
);

export default PaymentScreen;
