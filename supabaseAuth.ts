import { supabase } from './supabaseClient';

export const auth = {
  currentUser: null as any
};

// Initialize currentUser synchronously if possible, but mostly rely on listener
supabase.auth.getSession().then(({ data: { session } }) => {
  if (session?.user) {
    auth.currentUser = {
      uid: session.user.id,
      email: session.user.email,
      displayName: session.user.user_metadata?.full_name || session.user.user_metadata?.name || '',
      photoURL: session.user.user_metadata?.avatar_url || session.user.user_metadata?.picture || '',
    };
  }
});

supabase.auth.onAuthStateChange((event, session) => {
  if (session?.user) {
    auth.currentUser = {
      uid: session.user.id,
      email: session.user.email,
      displayName: session.user.user_metadata?.full_name || session.user.user_metadata?.name || '',
      photoURL: session.user.user_metadata?.avatar_url || session.user.user_metadata?.picture || '',
    };
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

// ─── E-posta OTP (Doğrulama Kodu) ────────────────────────────────────────────
// Kullanıcının e-postasına 6 haneli doğrulama kodu gönderir.
// Hesap yoksa otomatik oluşturulur (kayıt akışı).
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

// ─── Telefon OTP (SMS Doğrulama Kodu) ─────────────────────────────────────────
// Telefon numarası E.164 formatında olmalıdır (örn: +905551112233).
// SMS sağlayıcısı Supabase panelinden yapılandırılmalıdır.
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
  
  const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
    callback(session?.user ? auth.currentUser : null);
  });

  return () => subscription.unsubscribe();
};
