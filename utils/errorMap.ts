/**
 * IP-12 — Ham sunucu hatasını Türkçeye çeviren TEK sözlük.
 *
 * Neden var: aynı işi yapan `parseRpcError` altı serviste kopyalanmıştı ve her
 * kopyanın kendi eksik sözlüğü vardı. Tanınmayan her kod `return message` ile
 * olduğu gibi ekrana çıkıyordu — kullanıcı toast'ta `INVALID_MATCH_STATE`,
 * `UNAUTHORIZED` ya da `Failed to fetch` görüyordu. Sunucuda 207 farklı
 * `RAISE EXCEPTION` kodu var; altı kopyanın en zengini yalnız 6 tanesini
 * tanıyordu.
 *
 * Kurallar:
 *   1. Hitap SEN'dir (kullanıcı kararı) — uygulamanın geri kalanıyla aynı.
 *   2. Her mesaj kullanıcıya NE YAPACAĞINI söyler; çıkmaz sokak yok.
 *   3. Tanınmayan kod ham haliyle ASLA ekrana çıkmaz; genel Türkçe mesaj
 *      gösterilir ve kod `codeOf()` ile ayrıca (küçük punto) sunulabilir.
 */

// ─── Sunucu kodu → Türkçe ────────────────────────────────────────────────
// Sıralama: migrations içindeki geçiş sayısına göre (en sık olan üstte).
export const BARE_CODE_TR: Record<string, string> = {
  // Yetki ve oturum
  UNAUTHORIZED: 'Bu işlem için yetkin yok. Oturumun düşmüş olabilir — çıkıp tekrar gir.',
  AUTH_REQUIRED: 'Bu işlem için giriş yapman gerekiyor.',
  FORBIDDEN: 'Bu işlemi yapma yetkin yok.',
  SECURITY: 'Güvenlik kontrolü bu işlemi durdurdu. Tekrar dene, sürerse bize yaz.',
  NOT_FOUND: 'Aradığın kayıt bulunamadı. Silinmiş ya da taşınmış olabilir.',
  NOT_PARTICIPANT: 'Bu maça katılmadığın için bu işlemi yapamazsın.',
  // Puanlama maç bitiminden 2 gün sonra kapanır (sunucu kapısı:
  // migration 20260801141608). Süre `evaluation_window_days` ile ayarlanabilir.
  EVAL_WINDOW_CLOSED: 'Bu maçın değerlendirme süresi doldu. Puanlama maç bitiminden 2 gün sonra kapanır.',
  NOT_MEMBER: 'Bu takımın üyesi değilsin.',
  NOT_OWNER: 'Bu kayıt sana ait değil.',
  NOT_FRIENDS: 'Bunu yapabilmek için önce arkadaş olmanız gerekiyor.',
  BLOCKED: 'Bu kullanıcıyla aranızda engel var.',
  NOT_CONNECTED: 'Bağlantı kurulmamış.',
  NOT_APPROVED: 'Başvurun henüz onaylanmadı.',
  SELF_RESET_FORBIDDEN: 'Kendi kaydını bu şekilde sıfırlayamazsın.',
  SETTINGS_RESTRICTED: 'Bu ayarı değiştirme yetkin yok.',

  // Durum
  INVALID_STATE: 'Bu işlem şu anki durumda yapılamıyor.',
  INVALID_STATUS: 'Kaydın durumu bu işleme uygun değil.',
  INVALID_MATCH_STATE: 'Maçın şu anki durumu bu işleme uygun değil.',
  INVALID_FLOW: 'Bu adım şu an sırada değil.',
  NOT_PENDING: 'Bu kayıt artık beklemede değil — biri daha önce işlem yapmış.',
  ALREADY_CANCELLED: 'Bu kayıt zaten iptal edilmiş.',
  ALREADY_STARTED: 'Maç başladı; bu işlem artık yapılamıyor.',
  ALREADY_PAID: 'Bu ödeme zaten alınmış.',
  ALREADY_MEMBER: 'Zaten bu takımdasın.',
  ALREADY_BLOCKED: 'Bu kullanıcıyı zaten engellemişsin.',
  TOO_EARLY: 'Bunun için henüz erken.',
  PAST_TIME: 'Geçmiş bir saat seçilemez.',

  // Slot / kadro
  SLOT_TAKEN: 'Bu yeri az önce başka biri aldı. Başka bir slot seç.',
  SLOT_FILLED: 'Bu slot dolmuş.',
  SLOT_OCCUPIED: 'Bu slotta zaten bir oyuncu var.',
  SLOT_NOT_FOUND: 'Slot bulunamadı.',
  SLOT_UNAVAILABLE: 'Bu slot şu an kullanılamıyor.',
  SLOT_EMPTY: 'Bu slot boş.',
  NO_SLOTS: 'Boş yer kalmamış.',
  ROSTER_FULL: 'Kadro dolu.',
  CANNOT_KICK_SELF: 'Kendini kadrodan çıkaramazsın.',
  FORMAT_OUT_OF_RANGE: 'Seçtiğin format bu sahanın kapasitesine uymuyor.',

  // Para
  INSUFFICIENT_BALANCE: 'Bakiyen yetersiz. Cüzdanına yükleme yapıp tekrar dene.',
  INVALID_AMOUNT: 'Girilen tutar geçersiz.',
  GECERSIZ_TUTAR: 'Girilen tutar geçersiz.',
  AMOUNT_EXCEEDS_PRICE: 'Girilen tutar, ödenmesi gereken tutardan fazla.',
  OVER_PAYMENT: 'Bu tutar kalan borçtan fazla.',
  VALUE_TOO_LOW: 'Girilen değer çok düşük.',
  MIN_TOPUP: 'Yükleme tutarı alt sınırın altında.',
  MAX_TOPUP: 'Yükleme tutarı üst sınırı aşıyor.',
  MIN_PAYOUT: 'Çekim tutarı alt sınırın altında.',
  MIN_CASHOUT: 'Çekim tutarı alt sınırın altında.',
  PENDING_PAYOUT: 'Bekleyen bir çekim talebin var. Önce o sonuçlansın.',
  CASHOUT_DISABLED: 'Para çekme şu an kapalı.',
  NO_CARD_AMOUNT: 'Karttan çekilecek bir tutar yok.',
  ZATEN_IADE: 'Bu tutar zaten iade edilmiş.',

  // Kart / IBAN / kimlik
  INVALID_IBAN: 'IBAN geçersiz. TR ile başlayan 26 haneli numarayı kontrol et.',
  IBAN_REQUIRED: 'IBAN girmen gerekiyor.',
  INVALID_CARD: 'Kart bilgileri geçersiz.',
  CARD_NOT_FOUND: 'Kart bulunamadı.',
  METHOD_NOT_FOUND: 'Ödeme yöntemi bulunamadı.',
  PAYOUT_REF_REQUIRED: 'Ödeme referansı gerekli.',
  IDENTITY_REQUIRED: 'Bu işlem için kimlik doğrulaman gerekiyor.',
  INVALID_TC: 'TC kimlik numarası geçersiz.',

  // Saha / rezervasyon / tarife
  NO_TARIFF: 'Bu saatin fiyatı tanımlı değil. Tesisle iletişime geç.',
  // Tarife VAR ama ücreti 0 ₺: ödeme adımı tutar bulamaz. Sunucu rezervasyonu
  // hiç yazmaz (create_pitch_booking · satılamaz saat kapısı) — yoksa saat dolu
  // görünür, karşılığında tahsilat olmazdı.
  SLOT_NOT_SELLABLE: 'Bu saat için fiyat henüz tanımlanmamış, rezervasyon alınamıyor. Başka bir saat seçebilirsin.',
  BOOKING_DISABLED: 'Bu saha şu an rezervasyona kapalı.',
  LISTING_CUTOFF: 'Bu saat uygulamadan rezervasyona kapalı — tesis daha erken saatleri listeliyor.',
  CASH_BOOKING_DISABLED: 'Uygulamadan rezervasyon kartla kapora ödenerek yapılır. Bu tesiste uygulama içi ödeme şu anda kapalı.',
  BOOKING_NOT_FOUND: 'Rezervasyon bulunamadı.',
  BOOKING_CANCELLED: 'Bu rezervasyon iptal edilmiş.',
  COURT_NOT_FOUND: 'Saha bulunamadı.',

  // Hizmet sağlayıcı (kaleci / hakem)
  PROVIDER_CONFLICT: 'Bu kişinin o saatte başka bir işi var.',
  PROVIDER_UNAVAILABLE: 'Bu kişi şu an müsait değil.',
  PROVIDER_FLOW_REQUIRED: 'Önce hizmet talebini oluşturman gerekiyor.',

  // Skor
  INVALID_SCORE: 'Girilen skor geçersiz.',
  INVALID_SIDE: 'Geçersiz taraf seçimi.',
  INVALID_NET: 'Geçersiz değer.',

  // Kod / token / mesaj
  INVALID_TOKEN: 'Kod geçersiz ya da süresi dolmuş.',
  INVALID_CODE: 'Kod geçersiz.',
  EMPTY_MESSAGE: 'Boş mesaj gönderemezsin.',
  NAME_REQUIRED: 'Ad soyad gerekli.',
  INVALID_NAME: 'Girilen ad geçersiz.',
  INVALID_TYPE: 'Geçersiz tür.',
  INVALID_ROLE: 'Geçersiz rol.',
  INVALID_SOURCE: 'Geçersiz kaynak.',
  INVALID_TARGET: 'Geçersiz hedef.',
  INVALID_RANGE: 'Bitiş tarihi başlangıçtan önce olamaz.',
  RANGE_TOO_LARGE: 'En fazla 366 günlük aralık seçebilirsin.',
  INVALID_MONTH: 'Geçersiz ay.',
  NOT_TEAM_TACTIC: 'Bu taktik bu takıma ait değil.',
  SEED_NOT_FOUND: 'Demo verisi bulunamadı.',
  SEED_NOT_READY: 'Demo verisi henüz hazır değil.',
  INVALID: 'Girdiğin bilgi geçersiz.',
};

/** Kullanıcıya gösterilecek son çare. Ham kod ASLA buraya sızmaz. */
export const GENEL_HATA = 'Bir şeyler ters gitti. Tekrar dene.';
export const AG_HATASI = 'İnternet bağlantın yok gibi görünüyor. Bağlantını kontrol edip tekrar dene.';

/**
 * Metin Türkçe mi? Ayırt edici işaret Türkçeye özgü harflerdir (çğıöşü).
 * Latin harf varlığına bakmak YETMEZ — "already booked by someone" da yalnız
 * a-z içerir ve o metnin ekrana çıkması tam olarak kaçındığımız şey.
 * Kararsız kalırsak sözlüğe düşeriz; sözlük her hâlükârda Türkçedir.
 */
const turkceMi = (metin: string): boolean => /[çğıöşüÇĞİÖŞÜ]/.test(metin);

const ham = (err: unknown): string => {
  if (!err) return '';
  if (typeof err === 'string') return err;
  if (typeof err === 'object' && err !== null && 'message' in err) {
    return String((err as { message: unknown }).message ?? '');
  }
  return String(err);
};

/**
 * Ağ hatası mı? Bunu ayırmak şart: kullanıcıya "bir şeyler ters gitti" demek
 * yerine "internetin yok, tekrar dene" demek gerekiyor — çözüm yolu farklı.
 */
export const isNetworkError = (err: unknown): boolean => {
  const m = ham(err).toLowerCase();
  if (!m) return false;
  return (
    m.includes('failed to fetch') ||
    m.includes('networkerror') ||
    m.includes('network request failed') ||
    m.includes('load failed') ||
    m.includes('fetch failed') ||
    m.includes('err_internet') ||
    m.includes('timeout') ||
    m.includes('zaman aşımı') ||
    (typeof navigator !== 'undefined' && navigator.onLine === false)
  );
};

/**
 * Hatanın içindeki ÇIPLAK sunucu kodunu döndürür (varsa).
 * Kullanıcıya küçük puntoda "Hata kodu: X" olarak gösterilir — destek
 * konuşmasını kısaltır, ama mesajın kendisi Türkçe kalır (kullanıcı kararı).
 */
export const codeOf = (err: unknown): string | null => {
  const m = ham(err);
  if (!m) return null;
  const onEk = m.match(/\b([A-Z][A-Z_]{3,})\s*:/);
  if (onEk) return onEk[1];
  const ciplak = m.match(/\b([A-Z][A-Z_]{3,})\b/);
  return ciplak ? ciplak[1] : null;
};

/**
 * Ana çevirici.
 *
 * Sıra: ağ hatası → `KOD: açıklama` biçimindeki sunucu açıklaması → sözlük →
 * çağıranın verdiği yedek → genel mesaj. Hiçbir dalda ham İngilizce metin
 * dışarı sızmaz.
 */
export const mapError = (err: unknown, yedek?: string, ozel?: Record<string, string>): string => {
  if (isNetworkError(err)) return AG_HATASI;
  const m = ham(err);
  if (!m) return yedek || GENEL_HATA;

  // Bağlama özel ezme: "NOT_FRIENDS" genel sözlükte "arkadaş olmanız gerekiyor"
  // der; mesajlaşma ekranında "Yalnızca arkadaşlarınla mesajlaşabilirsin" daha
  // isabetlidir. Çağıran taraf kendi sözlüğünü verebilir.
  if (ozel) {
    const k = codeOf(err);
    if (k && ozel[k]) return ozel[k];
  }

  // Sunucu 'KOD: Türkçe açıklama' biçiminde yazdıysa açıklamayı kullan —
  // en özel mesaj odur. Açıklamanın kendisi Türkçe değilse sözlüğe düşeriz.
  const aciklamali = m.match(/\b[A-Z][A-Z_]{3,}\s*:\s*(.+)$/);
  if (aciklamali) {
    const aciklama = aciklamali[1].trim();
    if (aciklama && turkceMi(aciklama)) return aciklama;
  }

  const kod = codeOf(err);
  if (kod && BARE_CODE_TR[kod]) return BARE_CODE_TR[kod];

  // Sunucu kod ÖNEKİ OLMADAN düz Türkçe yazdıysa o cümle geçer. Bazı RPC'ler
  // (hesap silme engelleri gibi) kullanıcıya doğrudan hitap eden, duruma özel
  // bir cümle döndürür — "Cüzdanında çekilebilir 1.250,00₺ var. Silmeden önce
  // IBAN'ına çek." gibi. Bunu genel bir yedekle değiştirmek, kullanıcıdan tam
  // olarak İHTİYACI OLAN bilgiyi saklamak olurdu.
  if (turkceMi(m)) return m;

  return yedek || GENEL_HATA;
};

/** `mapError` ile aynı, ama tanınmayan hatada `null` döner (çağıran karar versin). */
export const mapErrorOrNull = (err: unknown): string | null => {
  if (isNetworkError(err)) return AG_HATASI;
  const kod = codeOf(err);
  if (kod && BARE_CODE_TR[kod]) return BARE_CODE_TR[kod];
  const m = ham(err);
  const aciklamali = m.match(/\b[A-Z][A-Z_]{3,}\s*:\s*(.+)$/);
  if (aciklamali && turkceMi(aciklamali[1])) return aciklamali[1].trim();
  return null;
};

// ─── Supabase Auth ───────────────────────────────────────────────────────
// AuthError.message İNGİLİZCEDİR ve daima doludur; bu yüzden `err.message ||
// 'Türkçe yedek'` kalıbı fiilen ölü koddu — yedek hiç devreye girmiyordu.
const AUTH_TR: [RegExp, string][] = [
  [/invalid login credentials/i, 'E-posta ya da şifre hatalı.'],
  [/email not confirmed/i, 'E-postanı henüz doğrulamadın. Gelen kutunu kontrol et.'],
  [/user already registered|already registered/i, 'Bu e-posta zaten kayıtlı. Giriş yapmayı dene.'],
  [/password should be at least/i, 'Şifre en az 6 karakter olmalı.'],
  [/invalid email|unable to validate email/i, 'E-posta adresi geçersiz.'],
  [/token has expired|otp.*expired|expired/i, 'Kodun süresi doldu. Yeni kod iste.'],
  [/invalid.*(otp|token|code)/i, 'Kod hatalı. Tekrar dene.'],
  [/rate limit|too many requests/i, 'Çok fazla deneme yaptın. Biraz bekleyip tekrar dene.'],
  [/user not found/i, 'Bu e-postayla kayıtlı bir hesap bulunamadı.'],
  [/signups? not allowed|signup is disabled/i, 'Kayıt şu an kapalı.'],
  [/popup closed|cancell?ed|aborted/i, 'İşlem yarıda kaldı.'],
  // ── Sağlayıcı (Google/Apple) tarafı ────────────────────────────────────────
  // Bu satırlar OLMADAN kullanıcı ekranda ya İngilizce ham metin ya da hiçbir
  // şey görüyordu; sayfa yenilenip giriş ekranına döndüğü için de "uygulama
  // beni attı" hissi doğuyordu. Her satır SEBEBİ ve ÇIKIŞI birlikte söyler.
  [/provider is not enabled|unsupported provider|provider.*disabled/i,
    'Bu giriş yöntemi şu anda kullanılamıyor. Telefon numaranla saniyeler içinde girebilirsin.'],
  [/redirect.*not allowed|invalid.*redirect|requested path is invalid/i,
    'Giriş dönüşü tamamlanamadı. Telefon numaranla devam edebilirsin.'],
  [/access.?denied|user denied|consent.*denied/i,
    'Giriş iznini vermedin, o yüzden devam edilemedi. İstersen tekrar dene ya da numaranla gir.'],
  [/bad_oauth_state|flow.?state|state.*(expired|not found)/i,
    'Giriş çok uzun sürdüğü için bağlantı düştü. Tekrar dener misin?'],
  [/server_error|temporarily unavailable|upstream/i,
    'Sağlayıcı şu an cevap vermiyor. Birazdan tekrar dene ya da numaranla gir.'],
];

// ── Web'de sağlayıcı dönüşü: ekranda görünecek TEK cümle ────────────────────
// Kural: kullanıcı ne olduğunu ve şimdi ne yapabileceğini aynı cümlede okusun.
// Hata kodu hiç yoksa (kullanıcı sağlayıcı ekranını kapatıp geri geldi) da
// sessiz kalmayız — sessizlik, "uygulama kendini yeniledi" hissinin kaynağı.
export const mapOAuthDonusu = (
  saglayici: 'google' | 'apple',
  kod: string | null,
  aciklama: string | null,
): string => {
  const ad = saglayici === 'apple' ? 'Apple' : 'Google';
  const ham = `${kod ?? ''} ${aciklama ?? ''}`.trim();
  if (ham) {
    for (const [desen, tr] of AUTH_TR) if (desen.test(ham)) return `${ad} ile giriş tamamlanamadı. ${tr}`;
    return `${ad} ile giriş tamamlanamadı. Telefon numaranla saniyeler içinde girebilirsin.`;
  }
  return `${ad} ile giriş tamamlanmadı — hesabına geçilmedi. Tekrar deneyebilir ya da telefon numaranla girebilirsin.`;
};

export const mapAuthError = (err: unknown, yedek?: string): string => {
  if (isNetworkError(err)) return AG_HATASI;
  const m = ham(err);
  for (const [desen, tr] of AUTH_TR) if (desen.test(m)) return tr;
  return mapErrorOrNull(err) || yedek || 'Giriş yapılamadı. Tekrar dene.';
};

/** Para çekme akışı — çıplak `UNAUTHORIZED` tek kelime olarak ekrana çıkıyordu. */
export const mapPayoutError = (err: unknown, yedek?: string): string =>
  mapError(err, yedek || 'Çekim talebi oluşturulamadı. Tekrar dene.');
