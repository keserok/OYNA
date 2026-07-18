import { createClient } from '@supabase/supabase-js';
import { Capacitor } from '@capacitor/core';
import { Preferences } from '@capacitor/preferences';

// ─── Üretim yedeği (env enjeksiyonu kaçarsa "Failed to fetch"i kökten önler) ───
// Sorun: env değişkeni herhangi bir build yolunda (ör. Vercel'de admin derlemesinde)
// gömülmezse, eski kod sessizce `http://localhost:54321`'e düşüyordu → telefondaki
// panel localhost'a istek atıp "Failed to fetch" veriyordu (mixed-content + bağlantı
// reddi). Çözüm: yedek artık localhost değil, GERÇEK üretim backend'i.
// Bu anon (publishable) anahtar herkese açıktır ve RLS ile korunur → bundle'a gömmek
// güvenlidir (zaten son kullanıcının tarayıcısına iniyor). SERVICE_ROLE anahtarı ASLA
// burada olmamalıdır. Env değişkenleri hâlâ önceliklidir (yerel geliştirme/staging için).
const PROD_SUPABASE_URL = 'https://iikvzgyccvgcybzdfwlv.supabase.co';
const PROD_SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imlpa3Z6Z3ljY3ZnY3liemRmd2x2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk0NjM0NDAsImV4cCI6MjA5NTAzOTQ0MH0.T7P_7lYp07zcXrioKkMqZENoYoi-D9aPmjhNAfihMvM';

// ─── Taban URL sağlamlaştırma ────────────────────────────────────────────────
// Sorun: VITE_SUPABASE_URL yanlışlıkla bir yol ekiyle (ör. ".../rest/v1" veya
// sondaki "/") tanımlanırsa, supabase-js kendi "/auth/v1", "/rest/v1",
// "/functions/v1" eklerini bu tabana koyduğu için istekler ".../rest/v1/auth/v1/token"
// gibi İKİLENİR ve 404'e düşer → GİRİŞ DAHİL her şey kırılır.
// Çözüm: env ne verirse versin tabanı yalnız origin'e (scheme+host) sadeleştir.
const sanitizeSupabaseUrl = (raw: string): string => {
  try {
    return new URL(raw).origin; // https://<proje>.supabase.co — yol/query/hash temizlenir
  } catch {
    return raw.replace(/\/+$/, '');
  }
};

export const SUPABASE_URL = sanitizeSupabaseUrl(import.meta.env.VITE_SUPABASE_URL || PROD_SUPABASE_URL);
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || PROD_SUPABASE_ANON_KEY;

if (!import.meta.env.VITE_SUPABASE_URL || !import.meta.env.VITE_SUPABASE_ANON_KEY) {
  // Env eksik ama üretim yedeği devrede — panel yine de gerçek backend'e bağlanır.
  console.warn('[Supabase] VITE_SUPABASE_* env yok — gömülü üretim yedeği kullanılıyor.');
}

const hasWindow = typeof window !== 'undefined';

// ─── Cihaz-hesap bayrağı ─────────────────────────────────────────────────────
// Bu cihazda daha önce en az bir kez oturum açıldı mı? AuthScreen'in ilk modunu
// belirler: bayrak yoksa KAYIT, varsa GİRİŞ. Çıkışta TEMİZLENMEZ (çıkan kullanıcı
// hesabı olan kullanıcıdır); yalnızca hesap silme talebinde temizlenir.
const HAS_ACCOUNT_KEY = 'oyna.auth.hasAccount';

export const getHasAccount = (): boolean => {
  if (!hasWindow) return false;
  try {
    return window.localStorage.getItem(HAS_ACCOUNT_KEY) === 'true';
  } catch {
    return false; // depo erişilemiyorsa güvenli varsayılan: kayıt modu
  }
};

export const setHasAccount = (): void => {
  if (!hasWindow) return;
  try {
    window.localStorage.setItem(HAS_ACCOUNT_KEY, 'true');
  } catch {
    /* sessizce yoksay */
  }
};

export const clearHasAccount = (): void => {
  if (!hasWindow) return;
  try {
    window.localStorage.removeItem(HAS_ACCOUNT_KEY);
  } catch {
    /* sessizce yoksay */
  }
};

// ─── Kalıcı oturum deposu ────────────────────────────────────────────────────
// Oturum HER ZAMAN kalıcıdır: kullanıcı çıkış yapana veya hesabını silene kadar
// bu cihazda açık kalır ("Beni Hatırla" anahtarı kaldırıldı).
// - getItem: localStorage'da yoksa sessionStorage'a bakar ve bulursa localStorage'a
//   TAŞIR — eski sürümde "Beni Hatırla"yı kapatmış kullanıcılar bu geçişte tek bir
//   oturum kaybı bile yaşamaz. Native'de son çare: Preferences aynasından geri yükle.
// - setItem: localStorage yazılamıyorsa (ör. Safari gizli sekme) sessionStorage'a
//   düşer; oturum en azından uygulama ömrü boyunca sürer, hiçbir yol hata fırlatmaz.
// - Native ayna (iOS UserDefaults / Android SharedPreferences): WebView,
//   localStorage'ı depolama baskısında tahliye edebilir; belirteç native depoda da
//   tutulur ki "çıkış yapmadıkça asla giriş ekranı görme" garantisi OS tahliyesine
//   de dayansın. supabase-js async storage'ı destekler (getItem Promise dönebilir).
const isNativePlatform = (() => {
  try {
    return Capacitor.isNativePlatform();
  } catch {
    return false;
  }
})();

const persistentAuthStorage = {
  getItem: async (key: string): Promise<string | null> => {
    if (!hasWindow) return null;
    try {
      const stored = window.localStorage.getItem(key);
      if (stored !== null) return stored;
      const legacy = window.sessionStorage.getItem(key);
      if (legacy !== null) {
        try {
          window.localStorage.setItem(key, legacy);
          window.sessionStorage.removeItem(key);
        } catch {
          /* taşıyamazsak sessionStorage kopyasıyla devam */
        }
        return legacy;
      }
      if (isNativePlatform) {
        try {
          const { value } = await Preferences.get({ key });
          if (value != null) {
            try {
              window.localStorage.setItem(key, value);
            } catch {
              /* localStorage yazılamasa da native kopya yeter */
            }
            return value;
          }
        } catch {
          /* native depo erişilemedi — localStorage yoluyla devam */
        }
      }
      return null;
    } catch {
      return null;
    }
  },
  setItem: (key: string, value: string): void => {
    if (!hasWindow) return;
    try {
      window.localStorage.setItem(key, value);
      window.sessionStorage.removeItem(key);
    } catch {
      try {
        window.sessionStorage.setItem(key, value);
      } catch {
        /* sessizce yoksay */
      }
    }
    if (isNativePlatform) {
      void Preferences.set({ key, value }).catch(() => {
        /* native ayna yazılamadı — localStorage kopyası yeterli */
      });
    }
  },
  removeItem: (key: string): void => {
    if (!hasWindow) return;
    try {
      window.localStorage.removeItem(key);
    } catch {
      /* sessizce yoksay */
    }
    try {
      window.sessionStorage.removeItem(key);
    } catch {
      /* sessizce yoksay */
    }
    if (isNativePlatform) {
      void Preferences.remove({ key }).catch(() => {
        /* sessizce yoksay */
      });
    }
  },
};

// Eski "Beni Hatırla" tercihi artık okunmuyor; kalan anahtarı temizle.
if (hasWindow) {
  try {
    window.localStorage.removeItem('oyna.auth.rememberMe');
  } catch {
    /* sessizce yoksay */
  }
}

export const supabase = createClient(
  SUPABASE_URL,
  SUPABASE_ANON_KEY,
  {
    auth: {
      detectSessionInUrl: true,
      persistSession: true,
      autoRefreshToken: true,
      storage: persistentAuthStorage,
      storageKey: 'oyna.auth.token',
    },
  }
);

export const getTeamRolesAndInstructions = async (teamId: string) => {
  try {
    const { data, error } = await supabase
      .from('teams')
      .select('team_roles')
      .eq('id', teamId)
      .maybeSingle();

    if (error) {
      console.warn('Error fetching team roles from Supabase:', error.message);
      return null;
    }
    return data?.team_roles;
  } catch (err) {
    console.error('Unexpected error fetching team roles:', err);
    return null;
  }
};

export const updateTeamRolesAndInstructions = async (teamId: string, teamRoles: any) => {
  try {
    const { error } = await supabase
      .from('teams')
      .update({ team_roles: teamRoles })
      .eq('id', teamId);

    if (error) {
      console.warn('Error updating team roles in Supabase:', error.message);
      return false;
    }
    return true;
  } catch (err) {
    console.error('Unexpected error updating team roles:', err);
    return false;
  }
};

export const sbRemovePlayerFromTeam = async (teamId: string, playerId: string) => {
  try {
    const { error } = await supabase
      .rpc('sbremoveplayerfromteam', { p_team_id: teamId, p_player_id: playerId });

    if (error) {
      console.warn('RPC sbremoveplayerfromteam failed, falling back to direct delete:', error.message);
      
      const { error: deleteError } = await supabase
        .from('team_members')
        .delete()
        .eq('team_id', teamId)
        .eq('player_id', playerId);

      if (deleteError) {
        console.error('Direct delete fallback failed in Supabase:', deleteError.message);
        return false;
      }
      return true;
    }
    return true;
  } catch (err) {
    console.error('Unexpected error removing player from team:', err);
    return false;
  }
};
