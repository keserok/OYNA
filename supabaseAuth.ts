import { supabase } from './supabaseClient';

export const auth = {
  currentUser: null as any
};

// Supabase User nesnesini uygulama genelinde kullanılan yapıya dönüştürür.
// email ve phone her ikisi de null olabilir (e-posta veya telefon OTP'ye göre değişir).
const buildCurrentUser = (user: {
  id: string;
  email?: string | null;
  phone?: string | null;
  user_metadata?: Record<string, any>;
}) => ({
  uid: user.id,
  email: user.email ?? null,
  phone: user.phone ?? null,
  displayName: user.user_metadata?.full_name || user.user_metadata?.name || '',
  photoURL: user.user_metadata?.avatar_url || user.user_metadata?.picture || '',
});

supabase.auth.getSession().then(({ data: { session } }) => {
  if (session?.user) {
    auth.currentUser = buildCurrentUser(session.user);
  }
});

supabase.auth.onAuthStateChange((_event, session) => {
  if (session?.user) {
    auth.currentUser = buildCurrentUser(session.user);
  } else {
    auth.currentUser = null;
  }
});

export const loginWithGoogle = async () => {
  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: window.location.origin
    }
  });
  if (error) console.error("Error signing in with Google", error);
};

export const logout = async () => {
  try {
    await supabase.auth.signOut();
  } catch (error) {
    console.error("Error signing out", error);
  }
};

export const onAuthStateChanged = (authObj: any, callback: (user: any) => void) => {
  supabase.auth.getSession().then(({ data: { session } }) => {
    callback(session?.user ? auth.currentUser : null);
  });

  const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
    callback(session?.user ? auth.currentUser : null);
  });

  return () => subscription.unsubscribe();
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
