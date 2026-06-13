// ─── DEPRECATED ─────────────────────────────────────────────────
// Bu dosya geriye uyumluluk için korunuyor.
// Yeni kod store/useAuthStore.ts kullanmalı.
// (E-posta/Telefon OTP yardımcıları hâlâ buradan kullanılıyor.)
// ─────────────────────────────────────────────────────────────────

import { useAuthStore, auth } from './store/useAuthStore';
import type { AuthUser } from './store/useAuthStore';
import { supabase } from './supabaseClient';

export { auth, useAuthStore };
export type { AuthUser };

/** @deprecated useAuthStore().loginWithGoogle() kullanın */
export const loginWithGoogle = () => useAuthStore.getState().loginWithGoogle();

/** @deprecated useAuthStore().logout() kullanın */
export const logout = () => useAuthStore.getState().logout();

/** @deprecated useAuthStore().initAuthListener() kullanın */
export const onAuthStateChanged = (_authObj: any, callback: (user: AuthUser | null) => void) => {
  // 1. Immediately fire with current state
  callback(useAuthStore.getState().currentUser);

  // 2. Subscribe to future changes (Zustand returns unsubscribe fn)
  const unsubscribe = useAuthStore.subscribe(
    (state, prevState) => {
      if (state.currentUser !== prevState.currentUser) {
        callback(state.currentUser);
      }
    }
  );

  return unsubscribe;
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
