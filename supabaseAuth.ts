import { supabase, setHasAccount, AUTH_DEPO_ANAHTARI, setBeniHatirla, setSonEposta } from './supabaseClient';
import { Capacitor } from '@capacitor/core';
import { clearPushToken } from './notifications/pushService';
import { OAUTH_PENCERE_ADI, donusAdresiniIsaretle } from './shared/oauthPencere';

// ─── Augmented currentUser — includes roles and verification state ────────────
export interface OynaCurrentUser {
  uid: string;
  email: string | null;
  phone?: string | null;
  /** Numara DOĞRULANMIŞ mı? Numara kapısının tek ölçüsü budur. */
  phoneVerified: boolean;
  /** Bu oturum hangi yolla açıldı: 'phone' | 'google' | 'apple' | 'email' | … */
  provider: string;
  displayName: string;
  photoURL: string;
  roles: string[];
  verificationStatus: string;
  isAdmin: boolean;
}

export const auth: { currentUser: OynaCurrentUser | null } = {
  currentUser: null,
};

// ─── Build currentUser from session + profiles row ────────────────────────────
async function buildCurrentUser(user: {
  id: string;
  email?: string | null;
  phone?: string | null;
  phone_confirmed_at?: string | null;
  confirmed_at?: string | null;
  app_metadata?: Record<string, any>;
  user_metadata?: Record<string, any>;
}): Promise<OynaCurrentUser> {
  const base: OynaCurrentUser = {
    uid: user.id,
    email: user.email ?? null,
    phone: user.phone ?? null,
    phoneVerified: !!user.phone && (user.phone_confirmed_at != null || user.confirmed_at != null),
    provider: String(user.app_metadata?.provider ?? 'unknown'),
    displayName: user.user_metadata?.full_name || user.user_metadata?.name || '',
    photoURL: user.user_metadata?.avatar_url || user.user_metadata?.picture || '',
    roles: ['PLAYER'],
    verificationStatus: 'approved',
    isAdmin: false,
  };

  try {
    const { data: profile } = await supabase
      .from('profiles')
      .select('roles, verification_status, is_admin')
      .eq('id', user.id)
      .single();

    if (profile) {
      base.roles = profile.roles ?? ['PLAYER'];
      base.verificationStatus = profile.verification_status ?? 'approved';
      base.isAdmin = profile.is_admin ?? false;
    }
  } catch {
    // Profile henüz oluşturulmamış olabilir; varsayılanlarla devam
  }

  return base;
}

// ─── Session init ────────────────────────────────────────────────────────────
supabase.auth.getSession().then(async ({ data: { session } }) => {
  if (session?.user) {
    setHasAccount();
    auth.currentUser = await buildCurrentUser(session.user);
  }
});

supabase.auth.onAuthStateChange((_event, session) => {
  // Cihaz-hesap bayrağı: her oturum olayı (kayıt, şifre/OTP girişi, OAuth dönüşü,
  // INITIAL_SESSION restorasyonu) tek noktadan işaretlenir. Senkron çağrı —
  // aşağıdaki kilit uyarısının kapsamı dışındadır.
  if (session?.user) setHasAccount();
  // ÖNEMLİ: bu callback çalışırken supabase-js auth KİLİDİNİ tutar.
  // İçeride başka bir supabase çağrısını await etmek (buildCurrentUser →
  // profiles sorgusu) kilitlenme yaratır: oturumlu açılışta INITIAL_SESSION
  // callback'i asla bitmez → uygulama AUTH'ta kalır, sonraki girişler de
  // sonsuz "YÜKLENİYOR"a düşer. İş, kilit bırakıldıktan sonra koşturulur.
  setTimeout(() => {
    void (async () => {
      if (session?.user) {
        auth.currentUser = await buildCurrentUser(session.user);
      } else {
        auth.currentUser = null;
      }
    })();
  }, 0);
});

// ─── Google OAuth ────────────────────────────────────────────────────────────
// Native (iOS/Android): Google, GÖMÜLÜ webview'da OAuth'u engeller
// (disallowed_useragent) ve capacitor://localhost dönüşü çalışmaz. Bu yüzden
// akış SİSTEM TARAYICISI + deep link üzerinden kurulur (PKCE):
//   1. signInWithOAuth(skipBrowserRedirect) → yalnız OAuth URL'sini üretir,
//   2. @capacitor/browser bu URL'yi Safari yaprağında açar,
//   3. Supabase, girişten sonra oyna://auth-callback?code=... adresine döner,
//   4. App.tsx'teki appUrlOpen → handleAuthCallbackUrl kodu oturuma bozdurur.
// GEREKLİ PANEL AYARI: Supabase → Auth → URL Configuration → Redirect URLs
// listesine "oyna://auth-callback" eklenmeli (yoksa Supabase dönüşü reddeder).
export const OAUTH_NATIVE_REDIRECT = 'oyna://auth-callback';

/**
 * WEB DÖNÜŞ ADRESİ — SONUNDA EĞİK ÇİZGİ ŞART (22 Ağustos 2026).
 *
 * `window.location.origin` sondaki eğik çizgiyi İÇERMEZ:
 *   "https://oyna-app-git-dal-takim.vercel.app"
 *
 * Supabase'in izinli liste (Redirect URLs) eşleşmesi glob'dur ve ayraç
 * karakterler '.' ile '/'. Önizlemeler için yazılan kalıp
 *   "https://oyna-app-*.vercel.app/**"
 * bir YOL bekler; çıplak kaynak adresi bu kalıba TAKILMAZ. Supabase o zaman
 * redirect_to'yu düşürür ve kullanıcıyı SITE_URL'e — yani BAŞKA bir dağıtıma —
 * atar. İki sonucu birden doğurur:
 *   1. kullanıcı bambaşka (çoğu zaman eski) bir paketin ekranında uyanır,
 *   2. oturum AÇILMAZ; çünkü PKCE doğrulayıcısı girişin başladığı kaynağın
 *      deposunda kaldı, varılan kaynakta yok — kod bozdurulamaz.
 * Kurucunun "Google'dan dönünce beni giriş ekranına atıyor" şikâyetinin
 * mekanizması tam olarak budur.
 *
 * Sondaki eğik çizgi hem ".../" hem ".../**" kalıplarını tutturur.
 */
export const webDonusAdresi = (): string => {
  if (typeof window === 'undefined') return '/';
  return `${window.location.origin}/`;
};

/**
 * WEB'DE SAĞLAYICI GİRİŞİ — AÇILIR PENCERE, UYGULAMA TERK EDİLMEZ
 *
 * KURUCU KARARI (22 Ağustos 2026): "Kişi Apple/Google hesabını onayladığında
 * uygulama TEKRAR AÇILMAMALI; kayıtlıysa ana sayfa, değilse onboarding."
 *
 * Varsayılan `signInWithOAuth` TAM SAYFA yönlendirmesi yapar — uygulama
 * kapanır, sağlayıcıya gidilir, dönüşte SIFIRDAN açılır. Kullanıcının
 * "beni attı, baştan başlattı" dediği şey tam olarak budur ve tek sayfalık
 * bir düzeltmeyle giderilemez: sayfayı terk etmek akışın kendisidir.
 *
 * Bu yol sayfayı HİÇ terk etmez:
 *   1. `skipBrowserRedirect` ile yalnız sağlayıcı adresi alınır,
 *   2. adres AÇILIR PENCEREDE açılır — ana sekme canlı kalır,
 *   3. pencere dönüşte bizim kaynağımıza gelir; orada uygulama çizilmez
 *      (index.tsx), yalnız kod oturuma bozdurulur ve pencere kapanır,
 *   4. oturum AYNI kaynağın deposuna yazıldığı için ana sekme onu görür;
 *      burada yoklanır ve görülünce `onAuthStateChanged` yönlendirmeyi
 *      devralır (kayıtlı → panel, yeni → onboarding).
 *
 * AÇILIR PENCERE ENGELLENİRSE eski davranışa düşülür (tam sayfa). Bu bir
 * gerileme değil emniyet valfi: engelli tarayıcıda giriş yine çalışır,
 * yalnız eski his geri gelir.
 */
const webOAuthAc = async (saglayici: OAuthSaglayici): Promise<void> => {
  oauthIsaretiBirak(saglayici);

  // ── 1) PENCERE, TIKLAMANIN AYNI İŞ ADIMINDA AÇILIR ────────────────────────
  // KRİTİK SIRALAMA (23 Ağustos 2026 — kurucunun "hesabımı seçince uygulama
  // yeniden başlıyor" bildirimi). Önceki sürüm önce `signInWithOAuth`u
  // BEKLİYOR, pencereyi ondan SONRA açıyordu. Tarayıcıların açılır pencere
  // kuralı şudur: `window.open` kullanıcı jestinin İŞ ADIMINDA (task)
  // çağrılmalıdır. Araya bir `await` girdiğinde Safari (iOS dâhil) jesti
  // tükenmiş sayar ve pencereyi ENGELLER. Engellenince kod aşağıdaki emniyet
  // valfine, yani TAM SAYFA yönlendirmesine düşüyordu — kullanıcının gördüğü
  // "uygulama kapandı, baştan açıldı" davranışının birinci mekanizması tam
  // olarak buydu ve açılır pencereye geçmek tek başına onu çözmemişti.
  //
  // Doğru desen: boş pencereyi HEMEN aç, adres hazır olunca içine yaz.
  const g = Math.min(480, window.screen.width);
  const y = Math.min(700, window.screen.height);
  const sol = Math.max(0, (window.screen.width - g) / 2);
  const ust = Math.max(0, (window.screen.height - y) / 2);
  let pencere: Window | null = null;
  try {
    pencere = window.open(
      'about:blank',
      OAUTH_PENCERE_ADI,
      `popup=yes,width=${g},height=${y},left=${sol},top=${ust}`,
    );
  } catch { pencere = null; }

  // Boş pencere bembeyaz durmasın; adres birkaç yüz milisaniye sonra gelir.
  if (pencere) {
    try {
      pencere.document.write(
        '<!doctype html><meta charset="utf-8">' +
        '<title>OYNA</title>' +
        '<body style="margin:0;display:grid;place-items:center;height:100vh;' +
        'font:600 15px system-ui,-apple-system,sans-serif;background:#0B1220;color:#E6EDF7">' +
        'Giriş açılıyor…</body>',
      );
      pencere.document.close();
    } catch { /* yazamadıysak boş kalır, akış etkilenmez */ }
  }

  // ── 2) ADRES ──────────────────────────────────────────────────────────────
  // Dönüş işareti YALNIZ pencere gerçekten açıldıysa eklenir: tam sayfa
  // yoluna düşersek dönen bağlam ANA SEKMEDİR ve uygulamayı çizmelidir
  // (bkz. shared/oauthPencere · oauthDonusPenceresiMi).
  const kokAdres = webDonusAdresi();
  let data: { url?: string | null } | null = null;
  try {
    const sonuc = await supabase.auth.signInWithOAuth({
      provider: saglayici,
      options: {
        redirectTo: pencere ? donusAdresiniIsaretle(kokAdres) : kokAdres,
        skipBrowserRedirect: true,
      },
    });
    if (sonuc.error) throw sonuc.error;
    data = sonuc.data;
  } catch (err) {
    try { pencere?.close(); } catch { /* yoksay */ }
    throw err;
  }
  const adres = data?.url;
  if (!adres) {
    try { pencere?.close(); } catch { /* yoksay */ }
    throw new Error('Giriş adresi alınamadı.');
  }

  if (!pencere) {
    // Engellendi → tam sayfa yolu. Bu satırdan sonrası çalışmaz.
    window.location.assign(adres);
    return;
  }

  // Kullanıcı boş pencereyi biz adresi yazamadan kapattıysa bu bir vazgeçmedir;
  // arkasından tam sayfa yönlendirmesi başlatmak onu şaşırtır.
  let erkenKapandi = false;
  try { erkenKapandi = pencere.closed; } catch { erkenKapandi = false; }
  if (erkenKapandi) throw new Error('OAUTH_PENCERE_KAPANDI');

  try {
    pencere.location.replace(adres);
  } catch {
    // Pencereye yazamadık (beklenmedik) — girişi öldürmektense tam sayfaya düş.
    try { pencere.close(); } catch { /* yoksay */ }
    window.location.assign(adres);
    return;
  }

  // ── 3) OTURUMU BEKLE ──────────────────────────────────────────────────────
  // Pencere dönüşte oturumu AYNI kaynağın localStorage'ına yazar; localStorage
  // sekmeler arasında ortaktır, `getSession()` her çağrıda oradan okur.
  // İki bitiş koşulu: oturum geldi ya da kullanıcı pencereyi kapattı.
  const BASLANGIC = Date.now();
  const ZAMAN_ASIMI_MS = 3 * 60 * 1000;
  for (;;) {
    await new Promise((coz) => setTimeout(coz, 400));
    const { data: oturum } = await supabase.auth.getSession();
    if (oturum.session) {
      try { pencere.close(); } catch { /* kendi kapanmış olabilir */ }
      oauthIsaretiniSil();
      // Yönlendirmeyi kütüphanenin sekmeler arası olayına BIRAKMA: oturumu
      // gören yer burası, duyuran da burası olsun (bkz. oturumuDuyur).
      await oturumuDuyur();
      return;
    }
    let kapali = false;
    try { kapali = pencere.closed; } catch { kapali = false; }
    if (kapali) {
      // Kullanıcı vazgeçti ya da dönüş tutmadı. Son bir kez bak: pencere
      // oturumu yazıp kapanmış olabilir, yarış durumunu kaybetmeyelim.
      await new Promise((coz) => setTimeout(coz, 600));
      const { data: son } = await supabase.auth.getSession();
      if (son.session) {
        oauthIsaretiniSil();
        await oturumuDuyur();
        return;
      }
      throw new Error('OAUTH_PENCERE_KAPANDI');
    }
    if (Date.now() - BASLANGIC > ZAMAN_ASIMI_MS) {
      try { pencere.close(); } catch { /* yoksay */ }
      throw new Error('OAUTH_ZAMAN_ASIMI');
    }
  }
};

// ─── WEB'DE SAĞLAYICI DÖNÜŞÜ: "sayfa yenilendi, hiçbir şey olmadı" sorunu ───
// Web'de Google/Apple girişi TAM SAYFA yönlendirmesidir: tarayıcı OYNA'dan
// çıkar, sağlayıcıya gider, sonra geri döner. Dönüş oturumsuzsa (kullanıcı
// vazgeçti, sağlayıcı panelde açık değil, dönüş adresi izinli listede yok)
// uygulama SIFIRDAN açılır ve kullanıcı kendini yeniden giriş ekranında bulur
// — ekranda tek kelime açıklama olmadan. Kurucunun bildirdiği hata tam budur.
//
// ÇÖZÜM İKİ PARÇA:
//   1) Yönlendirmeden ÖNCE bu oturuma bir işaret bırakılır (hangi sağlayıcı,
//      ne zaman). sessionStorage aynı sekmedeki yönlendirmeyi aşar.
//   2) Dönüşte `oauthDonusunuOku()` bu işareti ve adresteki hata alanlarını
//      okur, adresi temizler ve ekrana NE OLDUĞUNU söyleyecek bir kayıt döner.
// Böylece kullanıcı "yenilenmiş boş ekran" yerine sebebi yazan aynı telefon
// ekranıyla karşılaşır.
const OAUTH_ISARET = 'oyna.oauth.bekleyen';
// İşaret bayatlarsa (sekme günlerce açık kaldı) yeni bir girişi yanlışlıkla
// "başarısız dönüş" sanmayalım: 10 dakikadan eski işaret yok sayılır.
const OAUTH_ISARET_OMRU_MS = 10 * 60 * 1000;

export type OAuthSaglayici = 'google' | 'apple';

export interface OAuthDonusu {
  saglayici: OAuthSaglayici;
  /** Sağlayıcı/Supabase'in verdiği ham hata kodu (`access_denied` gibi) — yoksa null. */
  kod: string | null;
  /** Ham açıklama; ekrana ÇIPLAK basılmaz, errorMap'ten geçer. */
  aciklama: string | null;
}

const oauthIsaretiBirak = (saglayici: OAuthSaglayici): void => {
  try {
    sessionStorage.setItem(OAUTH_ISARET, JSON.stringify({ saglayici, t: Date.now() }));
  } catch { /* özel sekme / kota — işaret olmadan da akış çalışır */ }
};

/**
 * İŞARET BAŞARIDA SİLİNİR (23 Ağustos 2026).
 *
 * İşaret yalnız BAŞARISIZ dönüşü açıklamak için bırakılır ve 10 dakika yaşar.
 * Başarıda silinmiyordu; o güne kadar zararsızdı çünkü giriş ekranı bir daha
 * açılmıyordu. Çıkış artık sayfayı KÖKTEN yeniden yüklediği için (bkz. logout)
 * giriş ekranı yeniden kuruluyor, taze işareti okuyor ve "giriş tamamlanamadı"
 * diye KIRMIZI bir hata basıyor — hiçbir şey başarısız olmamışken. Kullanıcı
 * çıkıştan sonra kendini bir hata mesajının karşısında buluyordu.
 */
const oauthIsaretiniSil = (): void => {
  try { sessionStorage.removeItem(OAUTH_ISARET); } catch { /* yok say */ }
};

/**
 * Bu açılış bir SAĞLAYICI DÖNÜŞÜ MÜ? — İŞARETİ TÜKETMEZ (22 Ağustos 2026).
 *
 * `oauthDonusunuOku()` işareti okurken SİLER; açılış ekranı onu çağıramaz,
 * yoksa giriş ekranı dönüş sebebini bir daha göremezdi. Bu yoklama yalnız
 * BAKAR.
 *
 * NİYE GEREKLİ: web'de Google/Apple girişi TAM SAYFA yönlendirmesidir —
 * uygulama kapanır, sağlayıcıya gidilir, geri dönülür ve uygulama SIFIRDAN
 * açılır. Dönüşte 2,6 saniyelik marka açılış jeneriği baştan oynuyordu;
 * kullanıcı "uygulama beni attı ve baştan başlattı" diye okuyordu (kurucunun
 * bildirdiği hata tam bu). Dönüş tanınırsa açılış ekranı jeneriği ATLAR ve
 * "Giriş tamamlanıyor…" der.
 *
 * İki işaretten biri yeterli:
 *   · adreste `code`/`error` alanı — sağlayıcı dönüşünün kendi izi,
 *   · sessionStorage işareti — yönlendirmeden önce biz bıraktık (10 dk ömür).
 * Adres alanı, işaret yazılamayan ortamlarda (gizli sekme) yedektir.
 */
export const oauthDonusuMu = (): boolean => {
  if (typeof window === 'undefined') return false;
  try {
    const sorgu = new URLSearchParams(window.location.search);
    const capa = new URLSearchParams(window.location.hash.replace(/^#/, ''));
    if (sorgu.get('code') || sorgu.get('error') || capa.get('code') || capa.get('error')) return true;
  } catch { /* adres okunamadıysa işarete bak */ }
  try {
    const ham = sessionStorage.getItem(OAUTH_ISARET);
    if (!ham) return false;
    const isaret = JSON.parse(ham) as { t?: number };
    return !!isaret?.t && Date.now() - isaret.t <= OAUTH_ISARET_OMRU_MS;
  } catch { return false; }
};

/**
 * Bu sayfa açılışı bir OAuth dönüşü mü? Öyleyse kaydı döner ve İZLERİ SİLER
 * (işaret + adresteki hata alanları). Değilse null.
 *
 * Yalnız AuthScreen çağırır: oturum açılmışsa o ekran zaten görünmez, dolayısıyla
 * BAŞARILI dönüşte bu fonksiyon hiç çalışmaz — işaret ömrüyle kendiliğinden düşer.
 */
export const oauthDonusunuOku = (): OAuthDonusu | null => {
  if (typeof window === 'undefined') return null;

  let isaret: { saglayici?: string; t?: number } | null = null;
  try {
    const ham = sessionStorage.getItem(OAUTH_ISARET);
    if (ham) {
      sessionStorage.removeItem(OAUTH_ISARET);
      isaret = JSON.parse(ham);
    }
  } catch { /* okunamadıysa adres alanlarına bakmaya devam */ }

  // Supabase hatayı akışa göre ya sorgu dizisinde ya da çapa (#) kısmında verir.
  const sorgu = new URLSearchParams(window.location.search);
  const capa = new URLSearchParams(window.location.hash.replace(/^#/, ''));
  const kod = sorgu.get('error') ?? capa.get('error');
  const aciklama = sorgu.get('error_description') ?? capa.get('error_description');

  const bayat = !isaret?.t || Date.now() - isaret.t > OAUTH_ISARET_OMRU_MS;
  if (!kod && (!isaret || bayat)) return null;

  // Adres temizlenir: kullanıcı sayfayı yenilerse aynı hata bir daha çıkmasın
  // ve hata metni adres çubuğunda asılı kalmasın.
  if (kod || aciklama) {
    try {
      window.history.replaceState({}, document.title, window.location.pathname);
    } catch { /* replaceState yoksa sorun değil */ }
  }

  const saglayici: OAuthSaglayici = isaret?.saglayici === 'apple' ? 'apple' : 'google';
  return { saglayici, kod, aciklama };
};


// ─── NATIVE GOOGLE (tercih edilen yol) ───────────────────────────────────────
// Tarayıcı yaprağı yerine telefonun KENDİ Google hesap seçicisi açılır:
//   • Kullanıcı adres çubuğunda Supabase adresini görmez; ekranda uygulamanın
//     Google Cloud'da tanımlı adı ("OYNA") ve logosu yazar.
//   • Uygulamadan hiç çıkılmaz — dönüşte deep link beklenmez.
// Akış: plugin idToken üretir → supabase.auth.signInWithIdToken ile oturuma
// çevrilir. Sunucu jetonun imzasını Google'a doğrulatır; istemciye güvenilmez.
//
// FAIL-SAFE: istemci kimlikleri (env) yoksa ya da plugin bir sebeple açılmazsa
// ESKİ tarayıcı yolu devreye girer. Yani yanlış/eksik ayar girişi ÖLDÜRMEZ,
// yalnız görünümü eski hâline düşürür.
const GOOGLE_WEB_CLIENT_ID = import.meta.env.VITE_GOOGLE_WEB_CLIENT_ID as string | undefined;
const GOOGLE_IOS_CLIENT_ID = import.meta.env.VITE_GOOGLE_IOS_CLIENT_ID as string | undefined;

let socialLoginInit: Promise<boolean> | null = null;

/** Plugin'i bir kez kurar. Dönüş: native Google kullanılabilir mi? */
const ensureNativeGoogle = (): Promise<boolean> => {
  if (socialLoginInit) return socialLoginInit;
  socialLoginInit = (async () => {
    if (!Capacitor.isNativePlatform()) return false;
    const platform = Capacitor.getPlatform();
    // Android web istemci kimliğini, iOS kendi kimliğini ister.
    if (platform === 'ios' ? !GOOGLE_IOS_CLIENT_ID : !GOOGLE_WEB_CLIENT_ID) return false;
    try {
      const { SocialLogin } = await import('@capgo/capacitor-social-login');
      await SocialLogin.initialize({
        google: {
          webClientId: GOOGLE_WEB_CLIENT_ID,
          iOSClientId: GOOGLE_IOS_CLIENT_ID,
          mode: 'online',
        },
      });
      return true;
    } catch (err) {
      console.warn('[Auth] Native Google kurulamadı, tarayıcı yoluna düşülüyor:', err);
      return false;
    }
  })();
  return socialLoginInit;
};

/**
 * NATIVE'DE SİSTEM TARAYICISI + DEEP LINK (PKCE) — her iki sağlayıcı için.
 *
 * Google bu yolu "native hesap seçici kurulamadı" yedeği olarak zaten
 * kullanıyordu. 22 Ağustos 2026 taramasında Apple'ın ANDROID'de bu yola
 * hiç sahip olmadığı bulundu: `@capacitor-community/apple-sign-in`
 * eklentisinin Android sınıfı yalnız `echo` tanımlar, `authorize` YOKTUR.
 * Buna rağmen `loginWithApple` `isNativePlatform()` ile açılıp Android'i de
 * o dala sokuyordu — yani Play'den indiren kullanıcı Apple düğmesine
 * bastığında hata alıp KALIYORDU, yedeksiz.
 *
 * Ortak yol buraya alındı: iOS'ta Apple native kalır (Apple'ın kendi kutusu
 * her zaman daha iyi bir deneyimdir), Android'de ve Google'ın yedeğinde bu
 * çalışır.
 */
const nativeTarayiciOAuth = async (saglayici: OAuthSaglayici): Promise<void> => {
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: saglayici,
    options: {
      redirectTo: OAUTH_NATIVE_REDIRECT,
      skipBrowserRedirect: true,
      ...(saglayici === 'google' ? { queryParams: { prompt: 'select_account' } } : {}),
    },
  });
  if (error) throw error;
  if (!data?.url) throw new Error('Giriş adresi alınamadı.');
  const { Browser } = await import('@capacitor/browser');
  await Browser.open({ url: data.url, presentationStyle: 'popover' });
  // Oturum, deep link dönüşünde açılır (handleAuthCallbackUrl).
};

/**
 * `hatirla` — giriş ekranındaki "Beni Hatırla" anahtarı. Sağlayıcı yolları da
 * bu tercihe uymak zorundadır: kullanıcı anahtarı kapatıp Google'a bastığında
 * oturumun kalıcı olması, kapattığı şeyin sessizce çalışmaması demek olurdu.
 * Tercih, sayfayı terk eden web akışında da geçerli kalır — `setBeniHatirla`
 * onu localStorage'a yazar, dönüşte modül oradan okur.
 */
export const loginWithGoogle = async (hatirla = true): Promise<void> => {
  setBeniHatirla(hatirla);
  if (Capacitor.isNativePlatform()) {
    // 1) Native hesap seçici
    if (await ensureNativeGoogle()) {
      try {
        const { SocialLogin } = await import('@capgo/capacitor-social-login');
        // NONCE: ham değeri Supabase'e veririz, Google'a SHA-256 özetini —
        // Apple akışındaki sözleşmenin aynısı (bkz. aşağıdaki not).
        const rawNonce = crypto.randomUUID();
        const res = await SocialLogin.login({
          provider: 'google',
          options: { scopes: ['profile', 'email'], nonce: await sha256Hex(rawNonce) },
        });
        const result = res?.result as { idToken?: string | null } | undefined;
        const idToken = result?.idToken ?? null;
        if (idToken) {
          const { error } = await supabase.auth.signInWithIdToken({
            provider: 'google',
            token: idToken,
            nonce: rawNonce,
          });
          if (error) throw error;
          oauthIsaretiniSil();
          return; // Navigasyonu onAuthStateChanged dinleyicisi yapar.
        }
        console.warn('[Auth] Native Google idToken döndürmedi; tarayıcı yoluna düşülüyor.');
      } catch (err) {
        // Kullanıcı seçiciyi kapattıysa sessizce çık — "hata" göstermek yanlış olur.
        const m = String((err as { message?: string })?.message ?? err).toLowerCase();
        if (m.includes('cancel') || m.includes('iptal') || m.includes('12501')) return;
        console.warn('[Auth] Native Google başarısız, tarayıcı yoluna düşülüyor:', err);
      }
    }
    // 2) Yedek: sistem tarayıcısı + deep link (PKCE)
    await nativeTarayiciOAuth('google');
    return;
  }
  // Web — açılır pencere; ana sekme terk edilmez (bkz. webOAuthAc).
  await webOAuthAc('google');
};

// ─── OAuth deep link dönüşü (native) ─────────────────────────────────────────
// appUrlOpen'a gelen oyna://auth-callback?code=... URL'sini işler.
// Dönüş: true → URL bir OAuth dönüşüydü (başka deep link işleyiciye gitmesin).
/**
 * Dönüşün sonucu. `false` = bu adres bir OAuth dönüşü değildi (başka deep link
 * işleyicisine gitsin). Diğerleri: bu adres bizimdi ve şu oldu.
 */
export type OAuthDonusSonucu = false | 'BASARILI' | 'IPTAL' | 'HATA';

export const handleAuthCallbackUrl = async (url: string): Promise<OAuthDonusSonucu> => {
  if (!url.startsWith(OAUTH_NATIVE_REDIRECT)) return false;
  // Sistem tarayıcısı yaprağını kapat (açık değilse sessizce geç).
  try {
    const { Browser } = await import('@capacitor/browser');
    await Browser.close();
  } catch { /* iOS dışında veya kapalıysa */ }
  // SESSİZ DÜŞÜŞ YOK (22 Ağu 2026): burası eskiden her hatayı konsola yazıp
  // `true` dönüyordu. Kod bozdurulamadığında kullanıcı hiçbir açıklama
  // görmeden giriş ekranına düşüyor ve bunu "uygulama beni attı" diye
  // okuyordu. Sonuç artık çağırana bildirilir; ekranı o gösterir.
  try {
    const parsed = new URL(url);
    const code = parsed.searchParams.get('code');
    const oauthError = parsed.searchParams.get('error_description') || parsed.searchParams.get('error');
    if (code) {
      const { error } = await supabase.auth.exchangeCodeForSession(code);
      if (error) throw error;
      oauthIsaretiniSil();
      // Yönlendirme dinleyicide (SIGNED_IN). Kütüphane olayı bir sebeple
      // gelmezse kullanıcı oturumu açık hâlde giriş ekranında kalırdı; olayı
      // burada da duyururuz (bkz. oturumuDuyur).
      await oturumuDuyur();
      return 'BASARILI';
    }
    if (oauthError) {
      console.warn('[Auth] OAuth dönüşü hata ile geldi:', oauthError);
      // Kullanıcının vazgeçmesi hata değildir; ekranda kırmızı uyarı çıkmasın.
      return /access_denied|user_cancel|cancell?ed/i.test(oauthError) ? 'IPTAL' : 'HATA';
    }
    // Ne kod ne hata: beklenmeyen bir dönüş, ama bu adres bizimdi.
    return 'HATA';
  } catch (err) {
    console.error('[Auth] OAuth dönüş kodu işlenemedi:', err);
    return 'HATA';
  }
};

// ─── Apple Sign-In ────────────────────────────────────────────────────────────
// iOS App Store zorunluluğu: native platformda @capacitor-community/apple-sign-in
// kullanılır; web'de standart Supabase OAuth redirect ile devam edilir.
// NONCE SÖZLEŞMESİ (kritik): Apple'a nonce'un SHA-256 ÖZETİ verilir (kimlik
// jetonuna o gömülür); Supabase'e HAM nonce verilir (kendisi hash'leyip jetonla
// karşılaştırır). İkisine de aynı ham değeri vermek "nonce mismatch" ile girişi
// sessizce reddettiriyordu — butona basınca "hiçbir şey olmuyor" şikâyetinin
// Apple ayağı buydu.
const sha256Hex = async (text: string): Promise<string> => {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('');
};

/** `hatirla` — bkz. `loginWithGoogle`; aynı sözleşme. */
export const loginWithApple = async (hatirla = true): Promise<void> => {
  setBeniHatirla(hatirla);
  // ANDROID'DE NATIVE APPLE YOK (22 Ağu 2026 taraması). Eklentinin Android
  // sınıfı yalnız `echo` tanımlar; `authorize` çağrısı orada hiç yoktur ve
  // hata fırlatır. Kapı `isNativePlatform()` idi, yani Android de bu dala
  // giriyor ve yedeksiz kalıyordu: Play'den indiren kullanıcı Apple düğmesine
  // bastığında ölü uca çarpıyordu. Apple'ın native kutusu YALNIZ Apple
  // platformlarında var; Android sistem tarayıcısı yolundan gider.
  if (Capacitor.isNativePlatform() && Capacitor.getPlatform() !== 'ios') {
    await nativeTarayiciOAuth('apple');
    return;
  }
  if (Capacitor.isNativePlatform()) {
    try {
      // Native Apple Sign-In — dinamik import ile bağımlılık opsiyonel tutulur
      const { SignInWithApple } = await import('@capacitor-community/apple-sign-in');
      const rawNonce = crypto.randomUUID();
      const result = await SignInWithApple.authorize({
        clientId: 'com.oyna.app',
        redirectURI: OAUTH_NATIVE_REDIRECT,
        scopes: 'email name',
        state: crypto.randomUUID(),
        nonce: await sha256Hex(rawNonce),
      });

      const { error } = await supabase.auth.signInWithIdToken({
        provider: 'apple',
        token: result.response.identityToken,
        nonce: rawNonce,
      });

      if (error) throw error;
      oauthIsaretiniSil();
    } catch (err) {
      console.error('[Auth] Native Apple Sign-In hatası:', err);
      throw err;
    }
  } else {
    // Web — Google ile aynı desen: açılır pencere, sayfa terk edilmez.
    await webOAuthAc('apple');
  }
};


// ─── Çıkış ───────────────────────────────────────────────────────────────────
/**
 * ÇIKIŞTA WEB SEKMESİ YENİDEN YÜKLENİR (23 Ağustos 2026).
 *
 * KURUCU BİLDİRİMİ: "Çıkış yaptığım zaman neden hâlâ demo hesaplı giriş ekranı
 * geliyor?"
 *
 * MEKANİZMA: web'de uygulama TEK SAYFADIR. Sekme bir kez açıldığında o
 * dağıtımın JavaScript'i bellekte kalır ve TAM SAYFA YENİLENENE KADAR
 * değişmez. Çıkış yalnız oturumu düşürüp görünümü 'AUTH'a çeviriyordu — yani
 * ekranı, sekme AÇILDIĞI GÜNKÜ paketten yeniden çiziyordu. Sekmesi eski bir
 * dağıtımla açılmış kullanıcı, biz kodu değiştirsek de yayına alsak da,
 * çıkışta ESKİ giriş ekranını görüyordu. Kurucunun bildirdiği şey buydu ve
 * kodda demo ekranı hiç kalmasa bile tekrarlardı.
 *
 * ÇÖZÜM: çıkış, oturumu düşürdükten sonra sayfayı KÖKTEN yeniden yükler.
 * Yeniden yükleme her zaman o anki yayındaki paketi getirir; giriş ekranı
 * artık "sekmenin yaşı"na bağlı olamaz. `replace` kullanılır ki geri tuşu
 * kullanıcıyı oturum sonrası ekranlara geri atmasın.
 *
 * NİYE YALNIZ WEB: native pakette JavaScript uygulamanın İÇİNDEDİR; bayatlama
 * diye bir şey yoktur. Orada yeniden yükleme yalnız beyaz ekran ve eklenti
 * yeniden kurulumu getirirdi — bedeli var, karşılığı yok.
 *
 * Bu fonksiyon web'de DÖNMEZ: çağıranın ardından yazdığı yönlendirme
 * çalışmaz, çalışmasına da gerek yoktur (sayfa sıfırdan açılıyor).
 */
export const logout = async (): Promise<void> => {
  try {
    const uid = auth.currentUser?.uid;
    if (uid) {
      await clearPushToken(uid);
    }
    await supabase.auth.signOut();
    auth.currentUser = null;
  } catch (error) {
    console.error('[Auth] Çıkış hatası:', error);
  }
  await oturumuZorlaSil();
  yenidenBaslat();
};

/**
 * OTURUM GERÇEKTEN GİTTİ Mİ? — SONSUZ YENİDEN YÜKLEME KİLİDİ (23 Ağustos 2026).
 *
 * `signOut()` sunucuya da haber verir. O çağrı 401/403/404 DIŞINDA bir hatayla
 * düşerse (ağ yok, 500, zaman aşımı) supabase-js erken döner ve YEREL OTURUMU
 * SİLMEZ — hata da fırlatmaz, `{ error }` döndürür. Çıkış artık sayfayı
 * yeniden yüklediği için sonucu şu olurdu:
 *   yükle → jeton hâlâ duruyor → profil 401 → App "jeton geçersiz" der →
 *   logout → yükle → …  yani KAPANMAYAN bir yeniden yükleme döngüsü.
 * Kullanıcı uygulamayı hiç açamaz hâle gelirdi.
 *
 * Bu yüzden çıkıştan sonra depo BİZZAT kontrol edilir ve gerekirse anahtar
 * elle silinir. Sunucudaki oturum kalmış olabilir; kullanıcıyı cihazında
 * kilitli tutmaktansa yerelde temizlemek doğrudur.
 */
const oturumuZorlaSil = async (): Promise<void> => {
  try {
    const { data } = await supabase.auth.getSession();
    if (!data.session) return;
    console.warn('[Auth] signOut oturumu silmedi; yerel anahtar elle temizleniyor.');
    await supabase.auth.signOut({ scope: 'local' }).catch(() => { /* yine olmazsa aşağısı */ });
  } catch { /* okunamadıysa yine de anahtarı sil */ }
  try {
    window.localStorage.removeItem(AUTH_DEPO_ANAHTARI);
    window.sessionStorage.removeItem(AUTH_DEPO_ANAHTARI);
  } catch { /* özel sekme — depo zaten yazılmamış olabilir */ }
};

/**
 * Web sekmesini kökten yeniden yükler. Native'de ve test ortamında no-op.
 *
 * İKİNCİ KİLİT: aynı sekmede kısa aralıkla ikinci bir yeniden yükleme
 * isteği gelirse YAPILMAZ. `oturumuZorlaSil` birinci savunmadır; bu, onun da
 * yetmediği bilinmeyen bir durumda kullanıcının uygulamayı açabilmesini
 * garanti eder — döngü yerine sıradan giriş ekranına düşülür.
 */
const YENIDEN_BASLATMA_ISARETI = 'oyna.cikis.yenidenBaslatildi';
const YENIDEN_BASLATMA_ARALIGI_MS = 10_000;
const yenidenBaslat = (): void => {
  if (typeof window === 'undefined') return;
  try {
    if (Capacitor.isNativePlatform()) return;
  } catch { /* Capacitor yoksa web say */ }
  try {
    const son = Number(sessionStorage.getItem(YENIDEN_BASLATMA_ISARETI) ?? 0);
    if (son && Date.now() - son < YENIDEN_BASLATMA_ARALIGI_MS) {
      console.warn('[Auth] Çıkış yeniden yüklemesi az önce yapıldı; döngüye girmemek için atlanıyor.');
      return;
    }
    sessionStorage.setItem(YENIDEN_BASLATMA_ISARETI, String(Date.now()));
  } catch { /* işaret yazılamadıysa yeniden yükle — döngü riski depoya bağlı */ }
  try {
    // jsdom `replace`i uygulamaz ve gürültü basar; testlerde atlanır.
    if (typeof window.location?.replace !== 'function') return;
    window.location.replace(`${window.location.origin}/`);
  } catch { /* yönlendirilemediyse akış zaten AUTH'a düşer */ }
};

// ─── Auth state listener (Firebase compat API) ───────────────────────────────
/**
 * Oturum olayının TÜRÜ de iletilir (22 Ağustos 2026).
 *
 * Eskiden yalnız kullanıcı iletiliyordu; App tarafı "kullanıcı yok" gören HER
 * olayda kullanıcıyı giriş ekranına atıyordu. Oysa oturumsuz olay üç ayrı
 * şeyden gelebilir: gerçek ÇIKIŞ, açılışta henüz oturum çözülmemiş olması ve
 * jeton yenileme denemesinin boş dönmesi. Yalnız ilki giriş ekranına düşmeyi
 * hak eder; ötekiler kullanıcıyı çalışan bir oturumdan atıyordu.
 *
 * 'ILK' = abonelikten önce yapılan getSession yanıtı (supabase'in kendi olay
 * adı değil, bizim işaretimiz).
 */
export type AuthOlayi = 'ILK' | 'SIGNED_IN' | 'SIGNED_OUT' | 'TOKEN_REFRESHED'
  | 'USER_UPDATED' | 'INITIAL_SESSION' | 'PASSWORD_RECOVERY' | 'DIGER';

/**
 * KENDİ DİNLEYİCİ DEFTERİMİZ — "oturum var ama uygulama içeri almıyor" kilidi
 * (23 Ağustos 2026, kurucunun "tek seferde giremiyorum" bildirimi).
 *
 * SORUN: açılır pencere oturumu ORTAK localStorage'a yazar; ana sekme onu
 * yoklamayla GÖRÜR (webOAuthAc). Ama yönlendirmeyi yapan şey `App.tsx`'in
 * `onAuthStateChanged` dinleyicisidir ve o dinleyici supabase-js'in kendi
 * olayına bağlıdır. supabase-js oturumu YAZAN sekmede olay yayar; ÖTEKİ
 * sekmeye ulaşması iki dolaylı yola bağlıdır:
 *   · BroadcastChannel (Safari 15.4 öncesinde YOK, bazı gömülü tarayıcılarda
 *     kapalı),
 *   · `visibilitychange` → `_recoverAndRefresh` (masaüstünde açılır pencere
 *     ayrı bir PENCEREdir; ana sekme hiç gizlenmeyebilir, olay hiç gelmez).
 * İkisi de gelmezse kullanıcı oturumu AÇIK hâlde giriş ekranında kalır. Ekranda
 * hata yok, hesap açık, ama içeri girilmiyor — "tekrar deneyeyim" dedirten
 * durum tam budur.
 *
 * ÇÖZÜM: oturumu GÖREN yer olayı kendisi duyurur. Kütüphanenin sekmeler arası
 * sihrine güvenmeyiz; zaten elimizde olan bilgiyi doğrudan iletiriz.
 */
type AuthDinleyici = (user: OynaCurrentUser | null, olay?: AuthOlayi) => void;
const authDinleyiciler = new Set<AuthDinleyici>();

/** Oturumu gören taraf çağırır: dinleyicilere SIGNED_IN olarak duyurulur. */
const oturumuDuyur = async (): Promise<void> => {
  try {
    const { data } = await supabase.auth.getSession();
    if (!data.session?.user) return;
    const user = await buildCurrentUser(data.session.user);
    auth.currentUser = user;
    authDinleyiciler.forEach((d) => {
      try { d(user, 'SIGNED_IN'); } catch { /* bir dinleyici ötekini düşürmesin */ }
    });
  } catch (err) {
    console.warn('[Auth] oturum duyurulamadı:', err);
  }
};

export const onAuthStateChanged = (
  _authObj: typeof auth,
  callback: (user: OynaCurrentUser | null, olay?: AuthOlayi) => void,
): (() => void) => {
  authDinleyiciler.add(callback);
  // Mevcut oturum için hemen tetikle
  supabase.auth.getSession().then(async ({ data: { session } }) => {
    if (session?.user) {
      const user = await buildCurrentUser(session.user);
      auth.currentUser = user;
      callback(user, 'ILK');
    } else {
      callback(null, 'ILK');
    }
  }).catch((err) => {
    // Oturum çözümlemesi hata verirse uygulama açılışı kilitlenmesin:
    // oturumsuz kabul et, dinleyici sonraki durum değişimini yine yakalar.
    console.warn('[supabaseAuth] getSession başarısız:', err);
    callback(null, 'ILK');
  });

  const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
    // Kilitlenme koruması (üstteki not): callback auth kilidini tutar —
    // supabase çağrıları kilit bırakıldıktan sonra yapılır.
    setTimeout(() => {
      void (async () => {
        const olay = (event as AuthOlayi) ?? 'DIGER';
        if (session?.user) {
          const user = await buildCurrentUser(session.user);
          auth.currentUser = user;
          callback(user, olay);
        } else {
          auth.currentUser = null;
          callback(null, olay);
        }
      })();
    }, 0);
  });

  return () => {
    authDinleyiciler.delete(callback);
    subscription.unsubscribe();
  };
};

// ─── Demo e-posta girişi (yalnız yerel geliştirme) ───────────────────────────
// `npm run dev:demo` ile derlenmiş pakette ve YALNIZ yerel sunucuda aktif.
// Manuel UI testi için: e-posta alanına demo hesabın e-postasını (veya
// "mirackerem" kısayolunu) yazınca OTP olmadan, sabit demo şifresiyle anında
// giriş yapar. Yalnız @oyna.app demo hesapları — gerçek kullanıcı hesaplarını
// ASLA etkilemez. Yayın paketinde ve yayın adresinde YOKTUR.
// ═══════════════════════════════════════════════════════════════════════════
// DEMO GİRİŞ YOLLARININ TAMAMI SİLİNDİ (23 Ağustos 2026, kurucu kararı:
// "Bu ekranı tüm uygulamadan yok etmelisin ve yalnızca Apple ve Google
// girişinin kalmasını sağlamalısın.")
//
// Buradan silinenler: `isDemoLoginEnabled`, `demoLogin`, `isDemoLoginInput`,
// `isDemoAccountPickerEnabled`, `loginDemoAccount`, ortak demo şifresi ve
// `data/demoAccounts.ts` kataloğu.
//
// NEDEN BAYRAK YETMEDİ: yol üç ayrı bayrakla (`VITE_DEMO_ACCOUNTS`,
// `VITE_DEV_MODE`, `?demo=1`) kapatılmıştı; her seferinde bir tanesi yanlış
// ortama yazıldı ve ekran geri geldi. 23 Ağustos'ta kurucu aynı demo ekranını
// ÜÇÜNCÜ kez bildirdi. Bayrak, silinmesi gereken bir şeyi gizler.
//
// APPLE 5.6 KAYDI: reddin cümlesi "features that appear to have been
// intentionally hidden during the review process" idi. Ortak şifreyle gerçek
// hesaplara giren, yalnız bilenin ulaştığı bir düğme tam olarak budur. Artık
// pakette YOK — bayrakla değil, kod olmadığı için.
//
// Yerel geliştirmede hesap gerekiyorsa Supabase panelinden bir test kullanıcısı
// açılır; uygulamada ona giden bir yol BULUNMAZ.
// ═══════════════════════════════════════════════════════════════════════════
if (typeof window !== 'undefined') {
  // Eskiden `?demo=1` bu anahtarı yazıyordu. Anahtar artık okunmuyor; kalıntıyı
  // kullanıcının cihazından temizle.
  try { sessionStorage.removeItem('oyna_demo'); } catch { /* yok say */ }
}


// ═══════════════════════════════════════════════════════════════════════════
// E-POSTA + ŞİFRE — GİRİŞ VE KAYIT (kurucu kararı, 24 Ağustos 2026)
// ═══════════════════════════════════════════════════════════════════════════
//
// NEDEN GERİ GELDİ: Apple App Review, incelemesini tamamlayabilmek için
// "Sign-In Information → User name / Password" istiyor. Google ve Apple ile
// Giriş bu talebi karşılamaz: incelemeci kendi Apple kimliğiyle girdiğinde
// bizim tarafımızda hazırlanmış bir hesaba değil, bomboş yeni bir hesaba
// düşer — kaleci, hakem ve tesis panellerini hiç göremez.
//
// BU BİR "İNCELEMECİ KAPISI" DEĞİLDİR (Apple 5.6 dersi). 21 Ağustos'taki ret
// tam olarak şundan geldi: inceleme paketinde olup indirilen pakette olmayan
// gizli bir demo yolu vardı. Buradaki yol HERKESE AÇIKTIR: her kullanıcı aynı
// ekranda e-postasıyla kaydolur ve girer. İncelemeciye verilen şey ayrıcalıklı
// bir kapı değil, sıradan bir hesabın kullanıcı adı ve şifresidir.
//
// §4.7 ("şifre kavramı YOKTUR", 17 Ağu 2026) BU KARARLA DEĞİŞTİ. O karar,
// telefon+SMS'in ana yol olduğu bir dünyada alınmıştı; SMS altyapısı hiç
// kurulmadı ve telefon yolu 23 Ağustos'ta silindi. Geriye yalnız sağlayıcı
// girişi kalınca "iki paralel kimlik yolu" gerekçesi de düştü.
//
// KAYITTA ROL SEÇİMİ YOKTUR (kurucu kararı, 24 Ağu 2026): kaydolan HERKES
// oyuncudur. Kaleci ve hakem, Ayarlar → Sahada Rolün üzerinden BAŞVURUR;
// tesis sahibi, müdür ve personel YALNIZ yönetici panelinden atanır. Bu yüzden
// aşağıdaki fonksiyonlar sunucuya rol GÖNDERMEZ — `handle_new_user` tetikleyicisi
// profili PLAYER olarak açar ve `protect_profile_columns` kullanıcının kendi
// rolünü değiştirmesini zaten engeller.

/** Şifre en az bu kadar uzun olmalı. Sunucu 6 diyor; biz 8 diyoruz (daha katı taraf kazanır). */
export const MIN_SIFRE_UZUNLUGU = 8;

export type SifreGucu = 'zayif' | 'orta' | 'guclu';

/**
 * Şifre gücü — ekranda çubuk göstermek için. Sunucuya gönderilmez, KAPI DEĞİLDİR:
 * tek zorunluluk uzunluktur. Amaç kullanıcıyı reddetmek değil, yönlendirmek.
 */
export const sifreGucu = (sifre: string): SifreGucu => {
  if (sifre.length < MIN_SIFRE_UZUNLUGU) return 'zayif';
  let puan = 0;
  if (/[a-z]/.test(sifre)) puan++;
  if (/[A-Z]/.test(sifre)) puan++;
  if (/\d/.test(sifre)) puan++;
  if (/[^A-Za-z0-9]/.test(sifre)) puan++;
  if (sifre.length >= 12) puan++;
  if (puan >= 4) return 'guclu';
  if (puan >= 2) return 'orta';
  return 'zayif';
};

/** Sunucuya gitmeden önceki yerel kontrol. Geçerse `null`, değilse Türkçe sebep. */
export const sifreSebebi = (sifre: string): string | null => {
  if (!sifre) return 'Şifre gerekli.';
  if (sifre.length < MIN_SIFRE_UZUNLUGU) return `Şifre en az ${MIN_SIFRE_UZUNLUGU} karakter olmalı.`;
  return null;
};

/** Yaygın yazım hatalarını yakalayan sade e-posta kontrolü (RFC değil, kullanıcı dostu). */
export const epostaGecerliMi = (eposta: string): boolean =>
  /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(eposta.trim());

/**
 * Kayıt/giriş sonucunun ekrana söyleyeceği şey.
 * `ONAY_BEKLIYOR`, sunucuda e-posta doğrulaması AÇIK olduğunda döner: hesap
 * açıldı ama oturum yok. Bu durumu SESSİZ geçmek, kullanıcıyı "kaydoldum ama
 * hiçbir şey olmadı" ekranında bırakır — SMS yolunun düştüğü tuzağın aynısı.
 */
export type SifreSonucu = 'GIRILDI' | 'ONAY_BEKLIYOR';

/**
 * E-POSTA + ŞİFRE İLE KAYIT.
 *
 * SUNUCU AYARINDAN BAĞIMSIZ ÇALIŞIR (bilerek): projede e-posta doğrulaması
 * açık da olabilir kapalı da, ve bu ayar uygulama paketinden görülemez.
 *   • Kapalıysa → signUp oturumu döndürür, kullanıcı anında içeridedir.
 *   • Açıksa   → signUp oturum döndürmez. O zaman signInWithPassword denenir
 *     (bazı projelerde doğrulanmamış hesap yine de girebilir); o da olmazsa
 *     'ONAY_BEKLIYOR' döner ve ekran kullanıcıya gelen kutusuna bakmasını söyler.
 * Bu ikinci deneme, 17 Ağustos'ta silinen sürümde de vardı ve aynı sebeple
 * yazılmıştı; onsuz kayıt olan kullanıcı hiçbir geri bildirim almadan asılı kalır.
 */
export const signUpWithPassword = async (
  eposta: string,
  sifre: string,
  adSoyad: string,
  hatirla: boolean,
): Promise<SifreSonucu> => {
  const temizEposta = eposta.trim().toLowerCase();
  // Tercih, signUp'tan ÖNCE yazılır: supabase-js oturumu çağrının içinde
  // depoya yazar, depo katmanı tercihi o an bilmek zorundadır.
  setBeniHatirla(hatirla);
  const { data, error } = await supabase.auth.signUp({
    email: temizEposta,
    password: sifre,
    // `full_name` handle_new_user tetikleyicisinin okuduğu alandır; profil adı
    // buradan gelir. ROL GÖNDERİLMEZ — kaydolan herkes oyuncudur.
    options: { data: { full_name: adSoyad.trim() } },
  });
  if (error) throw error;
  setSonEposta(temizEposta, hatirla);
  if (data.session) return 'GIRILDI';

  const { error: girisHatasi } = await supabase.auth.signInWithPassword({
    email: temizEposta,
    password: sifre,
  });
  if (!girisHatasi) return 'GIRILDI';
  return 'ONAY_BEKLIYOR';
};

/** E-POSTA + ŞİFRE İLE GİRİŞ. Hata Türkçeleştirmesi çağırana bırakılır (errorMap). */
export const loginWithPassword = async (
  eposta: string,
  sifre: string,
  hatirla: boolean,
): Promise<void> => {
  const temizEposta = eposta.trim().toLowerCase();
  setBeniHatirla(hatirla);
  const { error } = await supabase.auth.signInWithPassword({
    email: temizEposta,
    password: sifre,
  });
  if (error) throw error;
  setSonEposta(temizEposta, hatirla);
};

// ─── ŞİFREMİ UNUTTUM ─────────────────────────────────────────────────────────
// İki uç fonksiyon üzerinden yürür (Supabase'in kendi sıfırlama e-postası
// DEĞİL): `password-reset-request` 6 haneli kod üretip Resend ile yollar,
// `password-reset-confirm` kodu doğrulayıp yeni şifreyi yazar. Kodun yalnız
// SHA-256 özeti veritabanında durur.
//
// SIRALAMA SIZDIRMAZ: e-posta kayıtlı olsun olmasın sunucu HER ZAMAN başarı
// döner. Ekran da bu yüzden "kayıtlıysa kod gönderildi" der — "böyle bir hesap
// yok" demek, saldırgana hangi adreslerin kayıtlı olduğunu tek tek öğretirdi.

/** Uç fonksiyonun `{ ok:false, error:'kod' }` gövdesindeki kodun Türkçe karşılığı. */
const SIFIRLAMA_HATALARI: Record<string, string> = {
  invalid_or_expired: 'Kod hatalı ya da süresi dolmuş. Yeni kod iste.',
  too_many_attempts: 'Çok fazla yanlış deneme yaptın. Yeni bir kod iste.',
  weak_password: `Şifre en az ${MIN_SIFRE_UZUNLUGU} karakter olmalı.`,
  invalid_request: 'Kod 6 haneli olmalı.',
  internal: 'Şifre değiştirilemedi. Birazdan tekrar dene.',
};

/**
 * Uç fonksiyonu çağırır ve HATA GÖVDESİNİ OKUR.
 *
 * `functions.invoke` 4xx/5xx'te FunctionsHttpError döndürür ve o hatanın
 * `message` alanı yalnız "Edge Function returned a non-2xx status code"
 * yazar — yani sebebi SÖYLEMEZ. Gövdedeki kod okunmazsa kullanıcı "kod yanlış"
 * ile "çok denedin" arasındaki farkı göremez ve ne yapacağını bilemez.
 */
const uctanCagir = async (ad: string, govde: unknown): Promise<void> => {
  const { error } = await supabase.functions.invoke(ad, { body: govde });
  if (!error) return;
  const yanit = (error as { context?: Response }).context;
  if (yanit && typeof yanit.json === 'function') {
    try {
      const g = await yanit.json();
      const kod = String(g?.error ?? '');
      if (kod && SIFIRLAMA_HATALARI[kod]) throw new Error(SIFIRLAMA_HATALARI[kod]);
    } catch (e) {
      // Gövdemizden gelen Türkçe mesajı yukarı taşı; JSON okunamadıysa
      // aşağıdaki genel hataya düş.
      if (e instanceof Error && Object.values(SIFIRLAMA_HATALARI).includes(e.message)) throw e;
    }
  }
  throw error;
};

/**
 * 1. adım: sıfırlama kodunu iste.
 *
 * BAŞARI, KODUN GİTTİĞİ ANLAMINA GELMEZ — iki ayrı sebeple:
 *   • Sıralama sızdırmamak için sunucu, adres kayıtlı olmasa da başarı döner.
 *   • Sunucuda RESEND_API_KEY tanımlı değilse fonksiyon SİMÜLASYON çalışır:
 *     kodu üretir, veritabanına yazar, ama e-posta göndermez ve yine başarı döner.
 * Bu yüzden ekran "gönderildi" değil, "kayıtlıysa kod gönderildi" demelidir.
 */
export const requestPasswordReset = async (eposta: string): Promise<void> => {
  await uctanCagir('password-reset-request', { email: eposta.trim().toLowerCase() });
};

/**
 * 2. adım: kod + yeni şifre. Sunucu kodu doğrular ve şifreyi değiştirir.
 * Alan adı `newPassword`'dür (uç fonksiyonun sözleşmesi) — `password` gönderilirse
 * sunucu şifreyi boş sayıp `weak_password` döner.
 */
export const confirmPasswordReset = async (
  eposta: string,
  kod: string,
  yeniSifre: string,
): Promise<void> => {
  await uctanCagir('password-reset-confirm', {
    email: eposta.trim().toLowerCase(),
    code: kod.replace(/\D/g, '').slice(0, 6),
    newPassword: yeniSifre,
  });
};

// ═══════════════════════════════════════════════════════════════════════════
// TELEFONLA GİRİŞ VE NUMARA BAĞLAMA UÇLARI SİLİNDİ (23 Ağustos 2026).
//
// Silinenler: `sendPhoneOtp`, `verifyPhoneOtp`, `requestPhoneLink`,
// `confirmPhoneLink` — ve onları çizen iki ekran (AuthScreen'in numara/kod
// adımları, views/PhoneLinkScreen).
//
// SEBEP TEK CÜMLE: bu yol HİÇ ÇALIŞMADI. Supabase projesinde SMS gönderme
// kancası kapalı (`hook_send_sms_enabled=false`), sağlayıcı yapılandırılmamış;
// "KOD GÖNDER" düğmesine basan hiç kimse kod almadı. Ekranda duran ölü bir
// yoldu ve Apple'ın 5.6 reddinin kökü buydu: kod yalnız +90'a gidiyor
// varsayıldığı için incelemeciye özel bir kapı açılmıştı.
//
// KURAL (Apple 5.6 talimatı §2): incelemecinin karşılaştığı engel neyse, o
// engel HERKES için çözülür; çözülemiyorsa özellik HERKES için kapatılır.
// Burada çözülemedi (Netgsm aboneliği yok) → kapatıldı, hem de silinerek.
//
// GERİ GELECEĞİ GÜN: önce SMS sağlayıcısı yapılandırılır ve `send-sms` uç
// fonksiyonu gerçekten kod gönderir; ekran ondan SONRA yazılır. Tarih:
// git history · supabaseAuth.ts + views/PhoneLinkScreen.tsx @ 974402d.
//
// ESKİ KULLANICILAR ETKİLENMEZ: telefon kimlikleri auth tarafında duruyor,
// oturumları açık; yalnız yeni giriş/bağlama yolu sunulmuyor.
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Oturum sahibinin DOĞRULANMIŞ numarası var mı?
 * App açılışında "numara iste" kapısının tek ölçüsü budur; profiles.phone
 * kullanıcı tarafından yazılabilen bir alandır ve doğrulama kanıtı sayılmaz.
 */
export const hasVerifiedPhone = async (): Promise<boolean> => {
  const { data } = await supabase.auth.getUser();
  const u = data.user;
  if (!u) return false;
  return !!u.phone && (u.phone_confirmed_at != null || u.confirmed_at != null);
};

// ─── Hesap kimliği: hangi yolla girildi ──────────────────────────────────────
// Ayarlar → Profil Bilgileri için: kullanıcı telefon/Google/Apple ile mi
// kayıtlı, doğrulanmış numarası var mı?
//
// `hasPassword` alanı KALDIRILDI: şifre kavramı yok (17 Ağu 2026 kararı).
// Eski e-posta kimliği olan hesaplar `providers` içinde 'email' görür — bu
// tarihsel bir kayıttır, giriş ekranında o yol artık sunulmaz.
export interface AuthIdentityInfo {
  email: string | null;
  /** Doğrulanmış telefon (E.164) — yoksa null. */
  phone: string | null;
  /** Bağlı tüm sağlayıcılar (ör. ['phone'], ['google'], ['apple','phone']). */
  providers: string[];
  /** Birincil/görünen kayıt yöntemi. */
  primaryProvider: 'phone' | 'google' | 'apple' | 'email' | 'unknown';
  /** Numarası doğrulanmış mı? Ödeme ve tesis iletişimi buna bakar. */
  phoneVerified: boolean;
}

export const getAuthIdentity = async (): Promise<AuthIdentityInfo> => {
  const { data } = await supabase.auth.getUser();
  const user = data.user;
  const identities = (user?.identities ?? []) as { provider: string }[];
  const providers = identities.map((i) => i.provider);
  const metaProvider = (user?.app_metadata?.provider as string | undefined) ?? providers[0] ?? 'unknown';
  const primaryProvider = (['phone', 'google', 'apple', 'email'] as const).includes(metaProvider as any)
    ? (metaProvider as AuthIdentityInfo['primaryProvider'])
    : 'unknown';
  return {
    email: user?.email ?? null,
    phone: user?.phone ? `+${String(user.phone).replace(/\D/g, '')}` : null,
    providers,
    primaryProvider,
    phoneVerified: !!user?.phone && (user.phone_confirmed_at != null || user.confirmed_at != null),
  };
};

// ─── E-posta güncelle ────────────────────────────────────────────────────────
// Proje ayarına göre iki davranış olabilir:
//  • enable_confirmations=false → e-posta ANINDA değişir (link gitmez).
//  • onay açık → yeni adrese doğrulama linki gider, onaylanınca değişir.
// Yanıttan hangisinin olduğunu tespit edip çağırana bildiririz (config-agnostik).
export const updateUserEmail = async (email: string): Promise<{ applied: boolean; email: string }> => {
  const clean = email.trim().toLowerCase();
  const { data, error } = await supabase.auth.updateUser({ email: clean });
  if (error) throw error;
  const current = data.user?.email ?? null;
  const applied = (current ?? '').toLowerCase() === clean; // anında değiştiyse eşittir
  if (applied && auth.currentUser) auth.currentUser.email = current; // bellek-içi senkron
  return { applied, email: current ?? clean };
};
