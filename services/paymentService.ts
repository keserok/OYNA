// ─── Ödeme Servisi (kapora tahsilatı) ────────────────────────────────────────
// Sağlayıcı-bağımsız. create-payment edge function'ı üzerinden çalışır.
// SIMULATION modunda uçtan uca test edilebilir (gerçek para yok).
// Gerçek sağlayıcı bağlandığında checkoutUrl'e yönlendirme devreye girer.

import { supabase } from '../supabaseClient';
import { mapError, isNetworkError, AG_HATASI } from '../utils/errorMap';
// Yuvarlama ve bedel hesabının TEK kaynağı — sunucudaki `_odeme_yuvarla`nın ikizi.
import { odemeKirilimi } from '../shared/odemeYuvarlama';

export interface CreatePaymentResponse {
  intentId: string;
  amount: number;
  currency: string;
  commission: number;
  provider: string;
  checkoutUrl: string | null;
  requiresClientConfirm: boolean;
}

export interface PaymentResult {
  intent_id: string;
  status: string;
  amount?: number;
  commission?: number;
  owner_amount?: number;
  booking_payment_status?: string;
  idempotent?: boolean;
}

const ERROR_MAP: [string, string][] = [
  ['ALREADY_PAID', 'Bu rezervasyonun kaporası zaten ödenmiş.'],
  ['NO_DEPOSIT', 'Bu rezervasyon için online kapora gerekmiyor.'],
  ['CANCELLED', 'İptal edilmiş bir rezervasyon ödenemez.'],
  ['UNAUTHORIZED', 'Bu işlem için giriş yapman gerekiyor.'],
  ['NOT_FOUND', 'Rezervasyon bulunamadı.'],
  ['PROVIDER_NOT_CONFIGURED', 'Ödeme sağlayıcısı henüz yapılandırılmadı. Lütfen daha sonra tekrar dene.'],
  ['CONFIRM_DISABLED_IN_LIVE', 'Test onayı canlı modda kapalıdır.'],
  ['RATE_LIMIT', 'Çok fazla başarısız ödeme denemesi. Güvenliğin için birkaç dakika bekleyip tekrar dene.'],
];

export function toPaymentErrorMessage(error: unknown): string {
  const msg = error instanceof Error ? error.message : String((error as any)?.message ?? error ?? '');
  for (const [code, tr] of ERROR_MAP) if (msg.includes(code)) return tr;
  return 'Ödeme sırasında bir sorun oluştu. Lütfen tekrar dene.';
}

// Edge function non-2xx döndürünce supabase-js jenerik "non-2xx" hatası verir;
// asıl gövde error.context (Response) içindedir. Gerçek mesajı oradan çıkar.
async function invokeEdge(action: string, body: Record<string, unknown>): Promise<any> {
  const { data, error } = await supabase.functions.invoke('create-payment', {
    body: { action, ...body },
  });
  if (error) {
    let detail = '';
    try {
      const ctx = (error as { context?: Response }).context;
      if (ctx && typeof ctx.json === 'function') {
        const parsed = await ctx.json();
        detail = parsed?.error || '';
      }
    } catch { /* gövde okunamadı — jenerik mesaja düş */ }
    throw new Error(detail || error.message || 'Ödeme başlatılamadı.');
  }
  if (data?.error) throw new Error(data.error);
  return data;
}

// B9 — `payBookingDeposit` BURADAN SİLİNDİ (kaldırma tarihi: 2026-08-17).
//
// NEDEN: Fonksiyon `window.location.href = checkoutUrl` yapıyordu. Telefonda bu,
// kullanıcıyı OYNA'nın webview'ından koparıp harici bir ödeme sayfasına atar:
// geri dönüş yolu yoktur, uygulama durumu kaybolur ve mağaza incelemesi bunu
// "uygulama dışına yönlendiren ödeme" sayar. Bugün kimse çağırmıyordu (tüm
// depoda tek geçen yer kendi tanımıydı) — yani bağlandığı gün patlayacak,
// uyuyan bir tuzaktı.
//
// YERİNE NE VAR: Uygulama-içi kart ödemesi (aşağıdaki `startInAppCardPayment`
// → 3DS iframe). Kullanıcı OYNA'dan hiç çıkmaz. Kapora akışı da bunu kullanır
// (flow: 'BOOKING_DEPOSIT'). Yeniden bir "checkoutUrl'e git" yolu açılacaksa
// tarayıcıya atmak yerine uygulama içi görünümde açılmalıdır.

/** Rezervasyon kaporası için ödeme başlatır (edge 'create' niyeti). */
export async function startBookingPayment(bookingId: string): Promise<CreatePaymentResponse> {
  return await invokeEdge('create', { bookingId }) as CreatePaymentResponse;
}

/** SIMULATION modunda ödemeyi onaylar (gerçek sağlayıcıda webhook yapar). */
export async function confirmSimPayment(intentId: string): Promise<PaymentResult> {
  return await invokeEdge('confirm-sim', { intentId }) as PaymentResult;
}

// ═══ UYGULAMA-İÇİ KART ÖDEMESİ (Uber standardı — iyzico görünmez) ═══════════
// OYNA'nın kendi kart formu → edge 'pay' → 3DS (banka SMS) uygulama içinde.
// Kart verisi YALNIZ bellekte yaşar ve doğrudan edge'e gider; ne DB'ye ne
// log'a yazılır. Kayıtlı kartla ödemede yalnız kart id gönderilir (token
// eşlemesi sunucuda yapılır).

/** Yeni kart bilgisi — yalnız ödeme anında bellekte taşınır. */
export interface NewCardInput {
  holderName: string;
  number: string;
  expireMonth: number;
  expireYear: number;
  cvc: string;
  /** true → ödeme onaylanınca kart iyzico deposuna kaydedilir (tek dokunuş). */
  save?: boolean;
}

export interface InAppPayInput {
  flow: 'BOOKING_DEPOSIT' | 'TOP_UP' | 'MATCH_JOIN' | 'MATCH_DEPOSIT';
  amount?: number;
  bookingId?: string;
  matchId?: string;
  slotIds?: string[];
  useBalance?: boolean;
  card?: NewCardInput;
  savedCardId?: string;
  /** C1 — idempotency anahtarı. Aynı ödeme denemesinin retry'ları aynı anahtarı
   *  taşır; sunucu var olan niyeti yeniden kullanır → geç-3DS + retry çift çekimi
   *  önlenir. FE her yeni ödeme için taze bir UUID üretir. */
  idempotencyKey?: string;
}

// ═══ KART İŞLEM BEDELİ ══════════════════════════════════════════════════════
// Kartla ödemede ödeme altyapısına ödenen komisyon kullanıcıya ayrı satır
// olarak yansır; cüzdandan ödemede uygulanmaz. Oran app_config.card_fee_pct'tir
// (panelden yönetilir, 0 = kapalı). Ekranlar oranı BİR KEZ okur ve sunucuyla
// birebir aynı yuvarlamayla hesaplar; tahsil edilen otoriter tutar yine
// sunucudan (startInAppCardPayment → cardAmount) döner.

/**
 * Yüzdeyi tek çağrıda öğren (100₺ üzerinden sorar).
 *
 * Sunucu cevap veremezse 0 DEĞİL, sunucunun kendi varsayılanı döner. 0 dönmek
 * "bedel yok" demektir ve ekranda sunucunun çekeceğinden DÜŞÜK bir toplam
 * yazdırırdı — kullanıcı 420 ₺ beklerken 410 ₺ görürdü. Panelde oran gerçekten
 * 0'a çekildiyse RPC başarıyla 0 döner ve bu yol hiç çalışmaz.
 */
const VARSAYILAN_ORAN = 3.5; // sunucudaki get_card_fee_quote ile aynı

export async function getCardFeePct(): Promise<number> {
  const { data, error } = await supabase.rpc('get_card_fee_quote', { p_amount: 100 });
  if (error || !data) return VARSAYILAN_ORAN;
  const pct = Number((data as { pct?: unknown }).pct);
  return Number.isFinite(pct) && pct >= 0 ? pct : VARSAYILAN_ORAN;
}

// Oran oturum boyunca değişmez (panel ayarı); her ödeme-öncesi ekranın ayrı
// RPC atması gereksiz. İlk çağrı sunucudan okur, sonrakiler bellekten döner.
// Kurucu kararı (20 Ağu 2026): "Çekilen neyse ekrana onu yaz" — ödeme ÖNCESİ
// tüm yüzeyler (saha kapora barı, maç kur, maça katıl, kapora öde) bu oranla
// computeCardTotal kullanır; ekrandaki rakam sunucunun çekeceği rakamdır.
let _cardFeePctCache: number | null = null;
export async function getCardFeePctCached(): Promise<number> {
  if (_cardFeePctCache != null) return _cardFeePctCache;
  _cardFeePctCache = await getCardFeePct();
  return _cardFeePctCache;
}

/** Yalnız altyapı bedeli. Toplam için computeCardTotal kullanılır. */
export function computeCardFee(base: number, pct: number): number {
  return odemeKirilimi(base, pct).bedel;
}

/**
 * Karttan ÇEKİLECEK toplam — daima 10'un katı (kurucu kararı, 19 Ağu 2026).
 * Ekranda yazan büyük rakam budur; `computeCardFee` yalnız altyapı bedelini
 * verir ve tek başına toplamı OLUŞTURMAZ (aradaki yuvarlama farkı eksik kalır).
 */
export function computeCardTotal(base: number, pct: number): number {
  return odemeKirilimi(base, pct).toplam;
}

/**
 * Ödeme SONUCUNDAKİ gerçek bedel: sunucunun çektiği toplamdan hizmet tabanını
 * düşerek bulunur. Tahmin değil, tahsil edilen tutardır — başarı ekranında
 * gösterilen rakam bu olmalıdır.
 */
export function cardFeeOf(totalAmount: number, cardAmount: number, balanceApplied: number): number {
  const base = Math.max(totalAmount - balanceApplied, 0);
  return Math.max(Math.round((cardAmount - base) * 100) / 100, 0);
}

export interface InAppPayStart {
  provider: 'IYZICO' | 'SIMULATION';
  requiresThreeDS: boolean;
  intentId: string;
  /**
   * Karttan ÇEKİLEN toplam — hizmet tabanı + işlem bedeli.
   * Kırılım ayrı alan olarak GELMEZ; taban = (tutar − balanceApplied),
   * bedel = cardAmount − taban ile türetilir (bkz. cardFeeOf).
   */
  cardAmount: number;
  balanceApplied: number;
  /** base64 — banka 3DS sayfası; decodeBase64Utf8 ile çözülüp iframe'e basılır. */
  threeDSHtml?: string;
  /** SIMULATION modunda ödeme anında uygulanır; sonuç burada döner. */
  result?: { ok: boolean; reason?: string; [k: string]: unknown };
}

/** Uygulama-içi kart ödemesi başlat (3 akış: kapora / cüzdan / maça katılım). */
export async function startInAppCardPayment(input: InAppPayInput): Promise<InAppPayStart> {
  return await invokeEdge('pay', input as unknown as Record<string, unknown>) as InAppPayStart;
}

/** Cüzdandan bağımsız kart kaydet (iyzico kart deposu üzerinden). */
export async function registerCardInApp(card: NewCardInput): Promise<{ ok: boolean; card?: unknown }> {
  return await invokeEdge('register-card', { card }) as { ok: boolean; card?: unknown };
}

export interface IntentStatus {
  status: 'PENDING' | 'PAID' | 'FAILED' | string;
  /** İade-krediye dönüş nedeni (SLOT_TAKEN_REFUNDED vb.) — raw.result_reason */
  resultReason: string | null;
  failReason: string | null;
}

/** 3DS yoklama yedeği: postMessage kaçarsa niyet durumundan sonucu oku (RLS: sahibi). */
export async function getIntentStatus(intentId: string): Promise<IntentStatus | null> {
  const { data, error } = await supabase
    .from('payment_intents')
    .select('status, raw')
    .eq('id', intentId)
    .maybeSingle();
  if (error || !data) return null;
  const raw = (data.raw ?? {}) as Record<string, unknown>;
  return {
    status: data.status as string,
    resultReason: (raw.result_reason as string) ?? null,
    failReason: (raw.fail_reason as string) ?? null,
  };
}

/** base64 → UTF-8 metin (iyzico threeDSHtmlContent çözümü). */
export function decodeBase64Utf8(b64: string): string {
  const bytes = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

/**
 * Sunucu/sağlayıcı hata öneklerini kırpar.
 * Eski regex yalnız BÜYÜK harfli önekleri (`INSUFFICIENT_FUNDS:`) yakalıyordu;
 * edge fonksiyonu hatayı `iyzico: …` diye döndürdüğü için SAĞLAYICI ADI ve ham
 * sağlayıcı metni kullanıcıya olduğu gibi basılıyordu (BULGU-092).
 * Artık büyük/küçük fark etmeksizin bilinen önekler kırpılıyor.
 */
export const stripServerErrorPrefix = (msg: string): string => {
  let out = String(msg ?? '').trim();
  // Zincirlenmiş önekleri soldan soyar: "iyzico: PAYMENT_FAILED: ..." gibi.
  for (let i = 0; i < 4; i += 1) {
    const next = out
      // NOT: 'param' listeye ALINMAZ — Türkçe'de "param" (= benim param) sık bir
      // cümle başıdır; "Param: …" gibi bir mesajın ilk kelimesini yutardı.
      .replace(/^(iyzico|iyzipay|stripe|paytr|provider|edge|supabase|postgrest)\s*[:\-]\s*/i, '')
      .replace(/^[A-Z][A-Z0-9_]{2,}\s*:\s*/, '')
      .trim();
    if (next === out) break;
    out = next;
  }
  return out;
};

/**
 * Supabase RPC/edge hataları Error DEĞİL — PostgrestError/FunctionsError düz
 * nesnedir. Her şekilden ham mesajı çıkarır (aksi halde "Beklenmeyen hata"ya düşer).
 */
export const rawErrorMessage = (err: unknown): string => {
  if (!err) return '';
  if (typeof err === 'string') return err;
  const e = err as { message?: string; error?: string; details?: string; hint?: string };
  return e.message || e.error || e.details || e.hint || '';
};

/**
 * Ham ödeme hatası → kullanıcıya gösterilecek Türkçe cümle.
 *
 * BULGU-092 — banka/kart reddi dalı SABİT metin döndürür: sağlayıcının adı da,
 * ham İngilizce metni de kullanıcıya ASLA basılmaz. Ham metin `console` ve
 * `payment_intents.raw` içinde kalır.
 *
 * SIRALAMA KRİTİK: `CARD_NOT_FOUND` ve `CARD_NEEDS_REVALIDATION` genel kart
 * reddi dalından ÖNCE gelmeli — ikisi de 'CARD' içerir.
 */
export const humanizePaymentError = (err: unknown): string => {
  // IP-12 · BULGU-056: hiçbir dal ağ hatasını tanımıyordu; zayıf şebekede
  // ekranda "Failed to fetch" yazıyordu. Ağ ayrı bir çözüm yolu ister.
  if (isNetworkError(err)) return AG_HATASI;
  const raw = rawErrorMessage(err);
  const up = raw.toUpperCase();
  const has = (...keys: string[]) => keys.some(k => up.includes(k));

  // PARA HAREKETİ OLAN dallar EN ÜSTTE: 'SLOT_TAKEN_REFUNDED' metni
  // 'SLOT_TAKEN' içerdiği için aşağıdaki genel dal onu gölgeliyordu ve
  // kullanıcıya parasının iade edildiği HİÇ söylenmiyordu (BULGU-093 komşusu).
  if (has('SLOT_TAKEN_REFUNDED'))
    return 'Sen doğrulama yaparken maçtaki yer doldu. Ödediğin tutar cüzdanına eklendi — istediğin ödemede kullanabilirsin.';
  if (has('BOOKING_CLOSED_REFUNDED'))
    return 'Rezervasyon bu sırada kapandı. Ödediğin tutar cüzdanına eklendi — istediğin ödemede kullanabilirsin.';
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
  if (has('INSUFFICIENT_BALANCE'))
    return stripServerErrorPrefix(raw) || 'Cüzdan bakiyen bu ödeme için yetersiz. Cüzdanına yükleme yapıp tekrar dene.';
  if (has('YETERSIZ BAKIYE', 'INSUFFICIENT'))
    return 'Cüzdan bakiyen yetersiz. Bakiye yükleyebilir veya kartla ödeyebilirsin.';
  if (has('UNAUTHORIZED', 'GIRIŞ'))
    return 'Bu işlem için giriş yapman gerekiyor.';
  // Banka/kart kaynaklı reddler — metin SABİT, sağlayıcı adı sızmaz.
  if (has('IYZICO', 'LIMIT', 'DECLINE', 'DO_NOT_HONOUR', 'INSUFFICIENT_FUNDS',
          'INVALID', 'FRAUD', '3D', 'CARD', 'KART', 'BANKA'))
    return 'Kartından ödeme alınamadı. Farklı bir kart deneyebilir veya kartının internete açık olup olmadığını bankandan sorabilirsin.';
  if (has('PROVIDER_ERROR', 'PROVIDER_FLOW_REQUIRED', 'PROVIDER_NOT_CONFIGURED'))
    return 'Ödeme sağlayıcısına ulaşılamadı. Lütfen birazdan tekrar dene.';

  // IP-12: burada eskiden `return clean` vardı — tanınmayan HER şey ham haliyle
  // ekrana çıkıyordu (İngilizce sağlayıcı metinleri dahil). Artık ortak sözlükten
  // geçiyor; sözlük de tanımazsa Türkçe genel mesaj döner, ham metin ASLA.
  return mapError(err, 'Ödeme tamamlanamadı. Lütfen tekrar dene; sorun sürerse farklı bir kart deneyebilir veya bankanla iletişime geçebilirsin.');
};
