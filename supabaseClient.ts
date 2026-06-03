import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  throw new Error('SUPABASE bağlantı bilgileri eksik! .env dosyasını kontrol edin.');
}

const REMEMBER_ME_KEY = 'oyna.auth.rememberMe';
const hasWindow = typeof window !== 'undefined';

// "Beni hatırla" tercihini okur. Varsayılan: true (yalnızca açıkça kapatılırsa false).
export const getRememberMe = (): boolean => {
  if (!hasWindow) return true;
  try {
    return window.localStorage.getItem(REMEMBER_ME_KEY) !== 'false';
  } catch {
    return true;
  }
};

// "Beni hatırla" tercihini kaydeder. Giriş yapmadan önce ayarlanmalıdır.
export const setRememberMe = (remember: boolean): void => {
  if (!hasWindow) return;
  try {
    window.localStorage.setItem(REMEMBER_ME_KEY, remember ? 'true' : 'false');
  } catch {
    /* sessizce yoksay */
  }
};

// Hibrit oturum deposu:
// - "Beni hatırla" AÇIK  → localStorage (tarayıcı kapansa da oturum korunur)
// - "Beni hatırla" KAPALI → sessionStorage (sekme/tarayıcı kapanınca oturum silinir)
// Böylece kullanıcı çıkış yapana kadar aynı kimlikle işlem yapabilir.
const hybridAuthStorage = {
  getItem: (key: string): string | null => {
    if (!hasWindow) return null;
    try {
      return window.localStorage.getItem(key) ?? window.sessionStorage.getItem(key);
    } catch {
      return null;
    }
  },
  setItem: (key: string, value: string): void => {
    if (!hasWindow) return;
    try {
      if (getRememberMe()) {
        window.localStorage.setItem(key, value);
        window.sessionStorage.removeItem(key);
      } else {
        window.sessionStorage.setItem(key, value);
        window.localStorage.removeItem(key);
      }
    } catch {
      /* sessizce yoksay */
    }
  },
  removeItem: (key: string): void => {
    if (!hasWindow) return;
    try {
      window.localStorage.removeItem(key);
      window.sessionStorage.removeItem(key);
    } catch {
      /* sessizce yoksay */
    }
  },
};

export const supabase = createClient(
  SUPABASE_URL,
  SUPABASE_ANON_KEY,
  {
    auth: {
      detectSessionInUrl: true,
      persistSession: true,
      autoRefreshToken: true,
      storage: hybridAuthStorage,
      storageKey: 'oyna.auth.token',
    },
  }
);
