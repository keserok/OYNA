import { supabase, setHasAccount } from './supabaseClient';
import { Capacitor } from '@capacitor/core';
import { clearPushToken } from './notifications/pushService';

// ─── Augmented currentUser — includes roles and verification state ────────────
export interface OynaCurrentUser {
  uid: string;
  email: string | null;
  phone?: string | null;
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
  user_metadata?: Record<string, any>;
}): Promise<OynaCurrentUser> {
  const base: OynaCurrentUser = {
    uid: user.id,
    email: user.email ?? null,
    phone: user.phone ?? null,
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

export const loginWithGoogle = async (): Promise<void> => {
  if (Capacitor.isNativePlatform()) {
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
    // Web — OAuth redirect
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

// ─── E-posta OTP ─────────────────────────────────────────────────────────────
// shouldCreateUser: true → hesap yoksa otomatik oluşturur (kayıt + giriş tek akış)
export const sendEmailOtp = async (email: string) => {
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { shouldCreateUser: true },
  });
  if (error) throw error;
};

export const verifyEmailOtp = async (email: string, token: string) => {
  const { data, error } = await supabase.auth.verifyOtp({
    email,
    token,
    type: 'email',
  });
  if (error) throw error;
  return data;
};

// ─── E-posta + Şifre ile giriş ───────────────────────────────────────────────
export const signInWithEmailPassword = async (email: string, password: string) => {
  const { data, error } = await supabase.auth.signInWithPassword({
    email: email.trim().toLowerCase(),
    password,
  });
  if (error) throw error;
  if (data?.user) auth.currentUser = await buildCurrentUser(data.user);
  return data;
};

// ─── E-posta + Şifre ile kayıt ───────────────────────────────────────────────
// config.toml: enable_confirmations=false → signUp anında oturum döndürür;
// App.tsx'teki onAuthStateChanged yeni kullanıcı için profil satırını otomatik
// oluşturur (rol PLAYER). E-posta onayı ileride açılırsa signUp oturum yerine
// doğrulama bekletir; UI bu durumu (session yoksa) "e-postanı doğrula" olarak
// ele almalıdır.
export const signUpWithPassword = async (email: string, password: string, fullName: string) => {
  const temizEposta = email.trim().toLowerCase();
  const { data, error } = await supabase.auth.signUp({
    email: temizEposta,
    password,
    options: { data: { full_name: fullName } },
  });
  if (error) throw error;

  // ÖLÜ UÇ KORUMASI: kayıt başarılı ama oturum gelmediyse kullanıcı, gelmesi
  // belirsiz bir doğrulama e-postasını beklemek zorunda kalır. Bu durumda
  // ŞİFREYLE GİRİŞİ hemen deneriz: proje ayarında onay kapalıysa (bugünkü
  // üretim ayarı) giriş açılır ve kullanıcı doğrudan uygulamaya girer; onay
  // gerçekten zorunluysa bu deneme sessizce başarısız olur ve ekran "e-postanı
  // doğrula" mesajını gösterir. Hiçbir güvenlik kuralı gevşetilmez — parolayı
  // zaten kullanıcının kendisi bu ekranda belirledi.
  if (data?.user && !data.session) {
    const { data: giris } = await supabase.auth.signInWithPassword({
      email: temizEposta,
      password,
    });
    if (giris?.session && giris.user) {
      auth.currentUser = await buildCurrentUser(giris.user);
      return giris;
    }
  }

  if (data?.user && data.session) auth.currentUser = await buildCurrentUser(data.user);
  return data;
};

// ─── Şifremi unuttum — Adım 1: sıfırlama kodu iste ───────────────────────────
// Güvenlik: e-posta kayıtlı olsun olmasın her zaman başarı döner (enumeration
// yok). Kod, password-reset-request edge fonksiyonu ile e-postaya yollanır.
export const requestPasswordReset = async (email: string): Promise<void> => {
  const { error } = await supabase.functions.invoke('password-reset-request', {
    body: { email: email.trim().toLowerCase() },
  });
  if (error) {
    // Ağ/altyapı hatası — akışı kesmiyoruz; kullanıcı kod ekranına geçebilir.
    console.error('[Auth] password-reset-request hatası:', error);
  }
};

// ─── Şifremi unuttum — Adım 2: kodu doğrula + yeni şifreyi yaz ────────────────
export const confirmPasswordReset = async (
  email: string,
  code: string,
  newPassword: string,
): Promise<void> => {
  const { data, error } = await supabase.functions.invoke('password-reset-confirm', {
    body: { email: email.trim().toLowerCase(), code: code.trim(), newPassword },
  });
  if (error) {
    // functions.invoke non-2xx'te error verir; gövdedeki sebep koduna ulaş.
    let msg = 'reset_failed';
    try {
      const ctx: any = (error as any).context;
      if (ctx && typeof ctx.json === 'function') {
        const body = await ctx.json();
        msg = body?.error || msg;
      }
    } catch { /* gövde okunamadı — genel hata */ }
    throw new Error(msg);
  }
  if (!(data as any)?.ok) throw new Error((data as any)?.error || 'reset_failed');
};

// ─── Telefon OTP (SMS) ───────────────────────────────────────────────────────
// Numara E.164 formatında olmalı: +905551112233
// Supabase panelinde SMS sağlayıcısı (Twilio vb.) tanımlanmalıdır.
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
  return data;
};

// ─── Hesap kimliği: kayıt/giriş yöntemi + şifre var mı ───────────────────────
// Ayarlar → Profil Bilgileri için: kullanıcı Google/Apple/e-posta ile mi
// kayıtlı, e-posta+şifre kimliği (yani parolası) var mı?
export interface AuthIdentityInfo {
  email: string | null;
  /** Bağlı tüm sağlayıcılar (ör. ['email'], ['google'], ['apple','email']). */
  providers: string[];
  /** Birincil/görünen kayıt yöntemi. */
  primaryProvider: 'email' | 'google' | 'apple' | 'phone' | 'unknown';
  /** E-posta+şifre kimliği var mı? (yoksa şifre "oluştur" akışı gerekir) */
  hasPassword: boolean;
}

export const getAuthIdentity = async (): Promise<AuthIdentityInfo> => {
  const { data } = await supabase.auth.getUser();
  const user = data.user;
  const identities = (user?.identities ?? []) as { provider: string }[];
  const providers = identities.map((i) => i.provider);
  const metaProvider = (user?.app_metadata?.provider as string | undefined) ?? providers[0] ?? 'unknown';
  const primaryProvider = (['email', 'google', 'apple', 'phone'] as const).includes(metaProvider as any)
    ? (metaProvider as AuthIdentityInfo['primaryProvider'])
    : 'unknown';
  return {
    email: user?.email ?? null,
    providers,
    primaryProvider,
    // 'email' kimliği = e-posta+şifre ile oluşturulmuş → parolası var.
    hasPassword: providers.includes('email'),
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

// ─── Şifre güncelle / oluştur ────────────────────────────────────────────────
// Oturum geçerliyse yeter. OAuth-only kullanıcıda parola OLUŞTURUR (böylece
// e-posta+şifre girişi de kazanır).
export const updateUserPassword = async (password: string): Promise<void> => {
  const { error } = await supabase.auth.updateUser({ password });
  if (error) throw error;
};
