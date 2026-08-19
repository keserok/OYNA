import { supabase, setHasAccount } from './supabaseClient';
import { Capacitor } from '@capacitor/core';
import { clearPushToken } from './notifications/pushService';

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

export const loginWithGoogle = async (): Promise<void> => {
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
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: OAUTH_NATIVE_REDIRECT,
        skipBrowserRedirect: true,
        queryParams: { prompt: 'select_account' },
      },
    });
    if (error) throw error;
    if (!data?.url) throw new Error('Google giriş adresi alınamadı.');
    const { Browser } = await import('@capacitor/browser');
    await Browser.open({ url: data.url, presentationStyle: 'popover' });
    return; // Oturum, deep link dönüşünde açılır (handleAuthCallbackUrl).
  }
  // Web — TAM SAYFA yönlendirmesi. İşaret önce bırakılır: yönlendirme
  // başladıktan sonra bu satırlara dönüş yoktur.
  oauthIsaretiBirak('google');
  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: window.location.origin },
  });
  if (error) throw error;
};

// ─── OAuth deep link dönüşü (native) ─────────────────────────────────────────
// appUrlOpen'a gelen oyna://auth-callback?code=... URL'sini işler.
// Dönüş: true → URL bir OAuth dönüşüydü (başka deep link işleyiciye gitmesin).
export const handleAuthCallbackUrl = async (url: string): Promise<boolean> => {
  if (!url.startsWith(OAUTH_NATIVE_REDIRECT)) return false;
  // Sistem tarayıcısı yaprağını kapat (açık değilse sessizce geç).
  try {
    const { Browser } = await import('@capacitor/browser');
    await Browser.close();
  } catch { /* iOS dışında veya kapalıysa */ }
  try {
    const parsed = new URL(url);
    const code = parsed.searchParams.get('code');
    const oauthError = parsed.searchParams.get('error_description') || parsed.searchParams.get('error');
    if (code) {
      const { error } = await supabase.auth.exchangeCodeForSession(code);
      if (error) throw error;
      // Navigasyon App.tsx'teki onAuthStateChanged dinleyicisinde (SIGNED_IN).
    } else if (oauthError) {
      console.warn('[Auth] OAuth dönüşü hata ile geldi:', oauthError);
    }
  } catch (err) {
    console.error('[Auth] OAuth dönüş kodu işlenemedi:', err);
  }
  return true;
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

export const loginWithApple = async (): Promise<void> => {
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
    } catch (err) {
      console.error('[Auth] Native Apple Sign-In hatası:', err);
      throw err;
    }
  } else {
    // Web — OAuth redirect (Google ile aynı işaret deseni)
    oauthIsaretiBirak('apple');
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'apple',
      options: { redirectTo: window.location.origin },
    });
    if (error) {
      console.error('[Auth] Apple OAuth hatası:', error.message);
      throw error;
    }
  }
};

// IP-15 — ölü `loginWithPhone` / `verifyOtp` çifti SİLİNDİ. Hiçbir ekrandan
// çağrılmıyorlardı ve aşağıdaki `sendPhoneOtp` / `verifyPhoneOtp` ile İKİ
// paralel telefon yolu oluşturuyorlardı: bakım borcu.
//
// Telefonla giriş EKRANI bu pakette YAPILMADI (kullanıcı kararı 10a): Supabase
// projesinde Phone sağlayıcısının açık olup olmadığı repodan doğrulanamıyor,
// yani yazılacak ekran test edilemez. Sağlayıcı açıldığında `sendPhoneOtp` /
// `verifyPhoneOtp` hazır bekliyor; e-posta OTP'siyle aynı yönlendirme yolunu
// kullanırlar, ek navigasyon kodu gerekmez.

// ─── Logout ───────────────────────────────────────────────────────────────────
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
};

// ─── Auth state listener (Firebase compat API) ───────────────────────────────
export const onAuthStateChanged = (
  _authObj: typeof auth,
  callback: (user: OynaCurrentUser | null) => void,
): (() => void) => {
  // Mevcut oturum için hemen tetikle
  supabase.auth.getSession().then(async ({ data: { session } }) => {
    if (session?.user) {
      const user = await buildCurrentUser(session.user);
      auth.currentUser = user;
      callback(user);
    } else {
      callback(null);
    }
  }).catch((err) => {
    // Oturum çözümlemesi hata verirse uygulama açılışı kilitlenmesin:
    // oturumsuz kabul et, dinleyici sonraki durum değişimini yine yakalar.
    console.warn('[supabaseAuth] getSession başarısız:', err);
    callback(null);
  });

  const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
    // Kilitlenme koruması (üstteki not): callback auth kilidini tutar —
    // supabase çağrıları kilit bırakıldıktan sonra yapılır.
    setTimeout(() => {
      void (async () => {
        if (session?.user) {
          const user = await buildCurrentUser(session.user);
          auth.currentUser = user;
          callback(user);
        } else {
          auth.currentUser = null;
          callback(null);
        }
      })();
    }, 0);
  });

  return () => subscription.unsubscribe();
};

// ─── Demo / dev-mode e-posta girişi ──────────────────────────────────────────
// SADECE VITE_DEV_MODE='true' iken aktif. Manuel UI testi için: e-posta alanına
// demo hesabın e-postasını (veya "mirackerem" kısayolunu) yazınca OTP olmadan,
// sabit demo şifresiyle anında giriş yapar. Yalnız @oyna.app demo hesapları —
// gerçek kullanıcı hesaplarını ASLA etkilemez. Prod'da kapalıdır.
// ?demo=1 anahtarını, App.tsx URL'yi temizlemeden ÖNCE (modül yüklenirken) yakala
// ve oturum boyunca sakla. Böylece herhangi bir domain'de (Vercel dâhil) env
// değişkeni gerekmeden demo modu açılır:  <url>/?demo=1
if (typeof window !== 'undefined') {
  try {
    if (new URLSearchParams(window.location.search).get('demo') === '1') {
      sessionStorage.setItem('oyna_demo', '1');
    }
  } catch { /* sessionStorage yoksa yok say */ }
}

export const isDemoLoginEnabled = (): boolean => {
  // ── MAĞAZA KAPISI (17 Ağu 2026 — gönderim öncesi denetimde yakalandı) ──────
  // NATIVE derlemede (App Store / Play Store) demo girişi HER DURUMDA kapalıdır.
  //
  // NEDEN ŞART: aşağıdaki 3. kapı `window.location.hostname`e bakıyor. Capacitor
  // uygulamayı Android'de `https://localhost`, iOS'ta `capacitor://localhost`
  // üzerinden servis eder — yani MAĞAZADAN İNDİRİLEN uygulamada da hostname
  // 'localhost' görünür ve kapı AÇIK kalırdı. Sonuç: e-posta alanına "saha1"
  // yazan herkes ŞİFRESİZ olarak gerçek bir SAHA SAHİBİ hesabına girebilirdi
  // (demoLogin sabit şifreyi kendisi kullanıyor). Hesap ele geçirme sınıfı bir
  // açık ve mağaza incelemesinde ret sebebi.
  //
  // Kural: yalnız TARAYICIDA geliştirme/test için açılır; pakette asla.
  if (Capacitor.isNativePlatform()) return false;

  // 1) Açık bayrak (Vercel'de env ile de açılabilir)
  if (import.meta.env.VITE_DEV_MODE === 'true') return true;
  if (typeof window !== 'undefined') {
    // 2) URL anahtarı ?demo=1 → bu oturum boyunca (herhangi bir domain'de test)
    try { if (sessionStorage.getItem('oyna_demo') === '1') return true; } catch { /* yok say */ }
    // 3) Yerel geliştirme (localhost) → `npm run dev` için sıfır ayar
    const h = window.location.hostname;
    if (h === 'localhost' || h === '127.0.0.1' || h === '0.0.0.0' || h.endsWith('.local')) {
      return true;
    }
  }
  // Prod domain'de anahtarsız KAPALI; ayrıca demoLogin yalnız @oyna.app kabul eder.
  return false;
};

const DEMO_DOMAIN = '@oyna.app';
// ÜRETİM PAKETİNE GİRMEZ (17 Ağu 2026 — mağaza öncesi denetim).
// Ortak demo şifresi paketin JS'ine harfi harfine gömülüyordu; demo hesap
// e-postalarıyla birlikte gerçek hesaplara (saha1..4 = SAHA SAHİBİ) giriş
// anahtarı oluyordu. Sabit, derleme zamanında çözülür: `VITE_DEMO_ACCOUNTS`
// açıkça 'true' değilse boş kalır ve demo yolları zaten çalışmaz.
const DEMO_PASSWORD = import.meta.env.VITE_DEMO_ACCOUNTS === 'true' ? 'password123' : '';

/** Girilen değer demo giriş için uygun mu? (tam e-posta ya da bare kullanıcı adı) */
export const isDemoLoginInput = (raw: string): boolean => {
  if (!isDemoLoginEnabled()) return false;
  const key = raw.trim().toLowerCase();
  if (!key) return false;
  if (key === 'mirackerem' || key === 'olimpiyat') return true;
  if (key.endsWith(DEMO_DOMAIN)) return true;
  // "mehmet.yilmaz" gibi @ içermeyen kısa ad
  if (!key.includes('@') && /^[a-z0-9._-]+$/.test(key)) return true;
  return false;
};

export const demoLogin = async (raw: string) => {
  if (!isDemoLoginEnabled()) throw new Error('Demo giriş kapalı.');
  let key = raw.trim().toLowerCase();
  if (key === 'mirackerem' || key === 'olimpiyat') key = 'mirackerem' + DEMO_DOMAIN;
  if (!key.includes('@')) key = key + DEMO_DOMAIN; // "mehmet.yilmaz" → tam e-posta
  if (!key.endsWith(DEMO_DOMAIN)) {
    throw new Error('Demo giriş yalnızca demo hesaplarında (@oyna.app) geçerlidir.');
  }
  const { data, error } = await supabase.auth.signInWithPassword({
    email: key,
    password: DEMO_PASSWORD,
  });
  if (error) throw error;
  return data;
};

// ─── Demo hesap seçici (main'de aktif) ───────────────────────────────────────
// Giriş ekranındaki tek-dokunuşla "Demo hesapla gir" listesi. Kaynak liste
// `OYNA_DEMO_HESAPLARI.md` → `data/demoAccounts.ts`. Yukarıdaki dev-mode kapılı
// `demoLogin`'in aksine bu, standart e-posta+şifre girişini kullanır; demo
// hesapları üretim Supabase'inde gerçek hesap olarak var olduğundan `main`
// domain'inde de çalışır. Yalnız @oyna.app demo hesaplarını kabul eder.
// KILL-SWITCH: build ortamında `VITE_DEMO_ACCOUNTS='false'` → seçici tümüyle
// kapanır (kod değişikliği gerekmeden lansman öncesi kapatma).
export const isDemoAccountPickerEnabled = (): boolean => {
  // MAĞAZA KAPISI (17 Ağu 2026): pakette demo hesap seçici YOKTUR.
  // Kill-switch'in (VITE_DEMO_ACCOUNTS=false) derleme anında yazılmayı
  // unutulması ihtimaline karşı native'de kod düzeyinde kapatılır — seçici
  // gerçek saha sahibi hesaplarına tek dokunuşla giriş sunuyordu.
  if (Capacitor.isNativePlatform()) return false;
  return import.meta.env.VITE_DEMO_ACCOUNTS !== 'false';
};

export const loginDemoAccount = async (email: string, password: string = DEMO_PASSWORD) => {
  const key = email.trim().toLowerCase();
  if (!key.endsWith(DEMO_DOMAIN)) {
    throw new Error('Demo giriş yalnızca demo hesaplarında (@oyna.app) geçerlidir.');
  }
  const { data, error } = await supabase.auth.signInWithPassword({ email: key, password });
  if (error) throw error;
  if (data?.user) auth.currentUser = await buildCurrentUser(data.user);
  return data;
};

// ═══════════════════════════════════════════════════════════════════════════
// TELEFON OTP — ANA GİRİŞ YOLU (kurucu kararı, 17 Ağustos 2026)
// ═══════════════════════════════════════════════════════════════════════════
// Kullanıcı numarasını yazar → SMS ile 6 haneli kod gelir → girer. Şifre YOKTUR.
//
// E-POSTA + ŞİFRE YOLU KALDIRILDI. Silinenler: sendEmailOtp / verifyEmailOtp /
// signInWithEmailPassword / signUpWithPassword / requestPasswordReset /
// confirmPasswordReset / updateUserPassword. Gerekçe: iki paralel kimlik yolu
// iki kat saldırı yüzeyi ve iki kat bakım demekti; kurucu kararıyla tek yol
// kaldı. ESKİ KULLANICILAR ETKİLENMEZ: e-posta kimlikleri auth tarafında
// duruyor, oturumları açık; yalnız GİRİŞ EKRANINDA o yol artık sunulmuyor.
//
// `shouldCreateUser: true` → numarası olmayan biri ilk kez kod isteyince hesabı
// açılır. Yani "kayıt" ile "giriş" tek akıştır; kullanıcıya iki ayrı sekme
// göstermeye gerek kalmaz.
//
// SMS'i Supabase kendi sağlayıcısıyla değil, bizim `send-sms` uç fonksiyonumuzla
// gönderir (Auth → Hooks → Send SMS). Kanal seçimi orada: Türkiye → SMS,
// yurt dışı → WhatsApp (bugün kapalı, bkz. shared/phone.ts).

/** E.164 zorunlu: +905321234567. Doğrulaması `shared/phone.ts` içinde. */
export const sendPhoneOtp = async (phone: string) => {
  const { error } = await supabase.auth.signInWithOtp({
    phone,
    options: { shouldCreateUser: true },
  });
  if (error) throw error;
};

export const verifyPhoneOtp = async (phone: string, token: string) => {
  const { data, error } = await supabase.auth.verifyOtp({
    phone,
    token,
    type: 'sms',
  });
  if (error) throw error;
  if (data?.user) auth.currentUser = await buildCurrentUser(data.user);
  return data;
};

// ─── Google/Apple ile girene numara bağlama ──────────────────────────────────
// Kurucu kararı: sosyal yolla girenden de numara istenir — tesis sahibinin
// oyuncuya ulaşabilmesi buna bağlı. Akış oturum AÇIKKEN işler:
//   updateUser({phone}) → numaraya kod gider → verifyOtp(type:'phone_change')
// Numara başkasında kayıtlıysa Supabase hata verir; ekran bunu dürüstçe söyler.
export const requestPhoneLink = async (phone: string): Promise<void> => {
  const { error } = await supabase.auth.updateUser({ phone });
  if (error) throw error;
};

export const confirmPhoneLink = async (phone: string, token: string) => {
  const { data, error } = await supabase.auth.verifyOtp({
    phone,
    token,
    type: 'phone_change',
  });
  if (error) throw error;
  if (data?.user) auth.currentUser = await buildCurrentUser(data.user);
  return data;
};

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
