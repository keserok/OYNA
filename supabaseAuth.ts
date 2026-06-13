import { supabase } from './supabaseClient';
import { Capacitor } from '@capacitor/core';
import { clearPushToken } from './notifications/pushService';

// ─── Augmented currentUser — includes roles and verification state ────────────
export interface OynaCurrentUser {
  uid: string;
  email: string | null;
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
async function buildCurrentUser(userId: string, email: string | null, meta: Record<string, any>): Promise<OynaCurrentUser> {
  const base: OynaCurrentUser = {
    uid: userId,
    email,
    displayName: meta?.full_name || meta?.name || '',
    photoURL: meta?.avatar_url || meta?.picture || '',
    roles: ['PLAYER'],
    verificationStatus: 'approved',
    isAdmin: false,
  };

  try {
    const { data: profile } = await supabase
      .from('profiles')
      .select('roles, verification_status, is_admin')
      .eq('id', userId)
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
    auth.currentUser = await buildCurrentUser(
      session.user.id,
      session.user.email ?? null,
      session.user.user_metadata ?? {},
    );
  }
});

supabase.auth.onAuthStateChange(async (event, session) => {
  if (session?.user) {
    auth.currentUser = await buildCurrentUser(
      session.user.id,
      session.user.email ?? null,
      session.user.user_metadata ?? {},
    );
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
    auth.currentUser = await buildCurrentUser(
      data.user.id,
      data.user.email ?? null,
      data.user.user_metadata ?? {},
    );
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
      const user = await buildCurrentUser(
        session.user.id,
        session.user.email ?? null,
        session.user.user_metadata ?? {},
      );
      auth.currentUser = user;
      callback(user);
    } else {
      callback(null);
    }
  });

  const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
    if (session?.user) {
      const user = await buildCurrentUser(
        session.user.id,
        session.user.email ?? null,
        session.user.user_metadata ?? {},
      );
      auth.currentUser = user;
      callback(user);
    } else {
      auth.currentUser = null;
      callback(null);
    }
  });

  return () => subscription.unsubscribe();
};
