import { supabase } from './supabaseClient';
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
    auth.currentUser = await buildCurrentUser(session.user);
  }
});

supabase.auth.onAuthStateChange(async (_event, session) => {
  if (session?.user) {
    auth.currentUser = await buildCurrentUser(session.user);
  } else {
    auth.currentUser = null;
  }
});

// ─── Google OAuth ────────────────────────────────────────────────────────────
export const loginWithGoogle = async (): Promise<void> => {
  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: window.location.origin },
  });
  if (error) console.error('[Auth] Google OAuth hatası:', error.message);
};

// ─── Apple Sign-In ────────────────────────────────────────────────────────────
// iOS App Store zorunluluğu: native platformda @capacitor-community/apple-sign-in
// kullanılır; web'de standart Supabase OAuth redirect ile devam edilir.
export const loginWithApple = async (): Promise<void> => {
  if (Capacitor.isNativePlatform()) {
    try {
      // Native Apple Sign-In — dinamik import ile bağımlılık opsiyonel tutulur
      const { SignInWithApple } = await import('@capacitor-community/apple-sign-in');
      const nonce = crypto.randomUUID();
      const result = await SignInWithApple.authorize({
        clientId: 'com.oyna.app.kerem',
        redirectURI: window.location.origin,
        scopes: 'email name',
        state: crypto.randomUUID(),
        nonce,
      });

      const { error } = await supabase.auth.signInWithIdToken({
        provider: 'apple',
        token: result.response.identityToken,
        nonce,
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

// ─── Phone OTP — Adım 1: SMS gönder ─────────────────────────────────────────
// phone: E.164 formatı zorunlu (+90XXXXXXXXXX)
export const loginWithPhone = async (phone: string): Promise<void> => {
  if (!/^\+[1-9]\d{6,14}$/.test(phone)) {
    throw new Error('invalid_phone');
  }

  const { error } = await supabase.auth.signInWithOtp({ phone });

  if (error) {
    if (error.message.toLowerCase().includes('rate')) {
      throw new Error('rate_limit');
    }
    throw new Error('invalid_phone');
  }
};

// ─── Phone OTP — Adım 2: Kodu doğrula ───────────────────────────────────────
export const verifyOtp = async (phone: string, token: string): Promise<void> => {
  const { data, error } = await supabase.auth.verifyOtp({
    phone,
    token,
    type: 'sms',
  });

  if (error) {
    if (error.message.toLowerCase().includes('expired')) {
      throw new Error('expired_token');
    }
    throw new Error('invalid_token');
  }

  // currentUser'ı yeni oturum bilgisiyle güncelle
  if (data?.user) {
    auth.currentUser = await buildCurrentUser(data.user);
  }
};

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
  });

  const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
    if (session?.user) {
      const user = await buildCurrentUser(session.user);
      auth.currentUser = user;
      callback(user);
    } else {
      auth.currentUser = null;
      callback(null);
    }
  });

  return () => subscription.unsubscribe();
};

// ─── Demo / dev-mode e-posta girişi ──────────────────────────────────────────
// SADECE VITE_DEV_MODE='true' iken aktif. Manuel UI testi için: e-posta alanına
// demo hesabın e-postasını (veya "mirackerem" kısayolunu) yazınca OTP olmadan,
// sabit demo şifresiyle anında giriş yapar. Yalnız @oyna.app demo hesapları —
// gerçek kullanıcı hesaplarını ASLA etkilemez. Prod'da kapalıdır.
export const isDemoLoginEnabled = (): boolean =>
  import.meta.env.VITE_DEV_MODE === 'true';

const DEMO_DOMAIN = '@oyna.app';
const DEMO_PASSWORD = 'password123';

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
    throw new Error('Demo giriş yalnızca demo hesaplarında (@oyna-test.com) geçerlidir.');
  }
  const { data, error } = await supabase.auth.signInWithPassword({
    email: key,
    password: DEMO_PASSWORD,
  });
  if (error) throw error;
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
