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

// ─── "BENİ HATIRLA" — kullanıcının oturum kalıcılığı tercihi ────────────────
//
// KURUCU KARARI (24 Ağustos 2026): şifreli giriş geri geldiği için "Beni
// Hatırla" da geri geldi ve giriş ekranında BÜYÜK bir anahtar olarak durur.
//
// TARİHÇE: 17 Ağustos'ta şifre kaldırılınca bu anahtar da kaldırılmıştı
// (§4.8 "oturum çıkış yapılana kadar açıktır"). Gerekçe doğruydu: tek giriş
// yolu Google/Apple iken kullanıcıya sorulacak bir şey yoktu — sağlayıcı
// zaten cihazda oturumu tutuyordu. Şifreyle giren kullanıcı içinse soru
// gerçektir: ortak bir bilgisayarda şifresini yazan kişi, oturumun kapanınca
// düşmesini isteyebilmelidir.
//
// ANLAMI (iki kat):
//   AÇIK  (varsayılan) → belirteç localStorage + native aynada durur; kullanıcı
//                        çıkış yapana kadar oturum açık kalır (§4.8 davranışı).
//   KAPALI            → belirteç YALNIZ sessionStorage'da durur; sekme/uygulama
//                        kapanınca oturum kendiliğinden düşer. Native ayna da
//                        yazılmaz, yoksa OS deposu tercihi delerdi.
//
// Tercihin KENDİSİ her zaman localStorage'da tutulur (oturum değil, ayar) ki
// giriş ekranı anahtarı kullanıcının bıraktığı konumda gösterebilsin.
const BENI_HATIRLA_KEY = 'oyna.auth.beniHatirla';

/** Tercih okunamıyorsa varsayılan AÇIK: eski davranış (§4.8) korunur. */
export const getBeniHatirla = (): boolean => {
  if (!hasWindow) return true;
  try {
    return window.localStorage.getItem(BENI_HATIRLA_KEY) !== 'false';
  } catch {
    return true;
  }
};

/**
 * Depo katmanının okuduğu canlı değer. Modül yüklenirken depodan başlatılır:
 * uygulama yeniden açıldığında kullanıcının bıraktığı tercih geçerli olmalı,
 * her açılışta sessizce "açık"a dönmemeli.
 */
let beniHatirla = getBeniHatirla();

/**
 * Tercihi yazar. Giriş DENEMESİNDEN ÖNCE çağrılmalıdır: supabase-js oturumu
 * signIn çağrısının içinde depoya yazar, yani depo katmanı tercihi o an
 * bilmek zorundadır. Sonradan çağrılırsa ilk yazım yanlış yere gider.
 */
export const setBeniHatirla = (deger: boolean): void => {
  beniHatirla = deger;
  if (!hasWindow) return;
  try {
    window.localStorage.setItem(BENI_HATIRLA_KEY, deger ? 'true' : 'false');
  } catch {
    /* depo yoksa bellekteki değer yine de bu oturum için geçerli */
  }
};

// ─── Kalıcı oturum deposu ────────────────────────────────────────────────────
// Oturum, "Beni Hatırla" AÇIKKEN kalıcıdır: kullanıcı çıkış yapana veya hesabını
// silene kadar bu cihazda açık kalır.
// - getItem: localStorage'da yoksa sessionStorage'a bakar. Bulursa localStorage'a
//   YALNIZ tercih açıkken taşır — kapalıyken taşımak, kullanıcının kapattığı şeyi
//   arkasından geri açmak olurdu. Native'de son çare: Preferences aynasından geri yükle.
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

/**
 * Oturum belirtecinin depo anahtarı — TEK KAYNAK.
 * `supabaseAuth · oturumuZorlaSil` çıkışta bu anahtarı elle silebilmek için
 * okur (signOut ağ hatasında yerel oturumu silmeden dönebiliyor). İki yerde
 * harfi harfine yazılsaydı biri değişince öteki yanlış anahtarı silerdi.
 */
export const AUTH_DEPO_ANAHTARI = 'oyna.auth.token';

const persistentAuthStorage = {
  getItem: async (key: string): Promise<string | null> => {
    if (!hasWindow) return null;
    try {
      const stored = window.localStorage.getItem(key);
      if (stored !== null) return stored;
      const legacy = window.sessionStorage.getItem(key);
      if (legacy !== null) {
        // Tercih KAPALIYKEN taşıma yapılmaz: kullanıcının "bu cihazda kalma"
        // dediği oturumu kalıcı depoya terfi ettirmek, kapattığı şeyi arkasından
        // geri açmak olurdu. Açıkken taşıma eski davranıştır ve korunur.
        if (beniHatirla) {
          try {
            window.localStorage.setItem(key, legacy);
            window.sessionStorage.removeItem(key);
          } catch {
            /* taşıyamazsak sessionStorage kopyasıyla devam */
          }
        }
        return legacy;
      }
      // Native ayna da yalnız tercih açıkken okunur: kapalıyken OS deposunda
      // kalmış eski bir belirteç, kullanıcıyı istemediği hâlde içeri alırdı.
      if (isNativePlatform && beniHatirla) {
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
  setItem: async (key: string, value: string): Promise<void> => {
    if (!hasWindow) return;
    // ── Tercih KAPALI: oturum yalnız sekme/uygulama ömrü kadar yaşar ──
    // sessionStorage'a yazılır, kalıcı depolardan TEMİZLENİR. Temizlik şart:
    // kullanıcı önce "hatırla" ile girip sonra çıkıp anahtarı kapatarak
    // yeniden girerse, eski kalıcı belirteç orada kalır ve sekme kapansa bile
    // bir sonraki açılışta getItem onu bulup kullanıcıyı içeri alırdı.
    if (!beniHatirla) {
      try {
        window.sessionStorage.setItem(key, value);
      } catch {
        /* sessizce yoksay */
      }
      try {
        window.localStorage.removeItem(key);
      } catch {
        /* sessizce yoksay */
      }
      if (isNativePlatform) {
        // await: atele-unut kalsaydı "hatırlama" tercihiyle girişte OS
        // aynasındaki eski belirteç yarışı kazanıp yaşamaya devam edebilirdi.
        try {
          await Preferences.remove({ key });
        } catch {
          /* sessizce yoksay */
        }
      }
      return;
    }
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
  // ÇIKIŞ GÜVENLİĞİ (26 Ağu 2026): removeItem artık ASENKRON ve telefon
  // kopyasını (Preferences) BEKLEYEREK siler. Eskiden ateşle-unut çağrılıyordu:
  // signOut "sildim" derken OS aynası duruyor, bir sonraki açılışta getItem
  // (yukarıda, beniHatirla açıkken) silinmiş sanılan oturumu diriltiyordu.
  // Ortak cihazda (tesis tableti) bu, önceki kullanıcının hesabı demek.
  removeItem: async (key: string): Promise<void> => {
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
      try {
        await Preferences.remove({ key });
      } catch {
        /* sessizce yoksay */
      }
    }
  },
};

// 17 Ağustos öncesi sürümün İngilizce anahtarı. Yeni tercih `oyna.auth.beniHatirla`
// altında yaşıyor; eskisi okunmuyor, kalıntı bırakmamak için siliniyor.
if (hasWindow) {
  try {
    window.localStorage.removeItem('oyna.auth.rememberMe');
  } catch {
    /* sessizce yoksay */
  }
}

// ─── Hatırlanan e-posta (yalnız ALAN ön-dolumu) ──────────────────────────────
// "Beni Hatırla" açıkken kullanıcının girdiği e-posta saklanır ve giriş ekranı
// alanı bununla dolu gelir. ŞİFRE ASLA SAKLANMAZ — ne burada ne başka yerde.
// Kullanıcının hatırlaması gereken tek şey şifresidir; e-postayı biz hatırlarız.
const SON_EPOSTA_KEY = 'oyna.auth.sonEposta';

export const getSonEposta = (): string => {
  if (!hasWindow) return '';
  try {
    return window.localStorage.getItem(SON_EPOSTA_KEY) ?? '';
  } catch {
    return '';
  }
};

/** Tercih kapalıysa e-posta da saklanmaz ve varsa silinir. */
export const setSonEposta = (eposta: string, hatirla: boolean): void => {
  if (!hasWindow) return;
  try {
    if (hatirla && eposta.trim()) window.localStorage.setItem(SON_EPOSTA_KEY, eposta.trim());
    else window.localStorage.removeItem(SON_EPOSTA_KEY);
  } catch {
    /* sessizce yoksay */
  }
};

export const supabase = createClient(
  SUPABASE_URL,
  SUPABASE_ANON_KEY,
  {
    auth: {
      detectSessionInUrl: true,
      persistSession: true,
      autoRefreshToken: true,
      storage: persistentAuthStorage,
      storageKey: AUTH_DEPO_ANAHTARI,
      // PKCE: OAuth (Google/Apple web) artık ?code= ile döner. Native'de kod,
      // oyna://auth-callback deep link'inden exchangeCodeForSession ile bozdurulur
      // (supabaseAuth.handleAuthCallbackUrl); web'de detectSessionInUrl halleder.
      // E-posta OTP (6 haneli kod) ve şifreli giriş bu ayardan etkilenmez.
      flowType: 'pkce',
    },
  }
);

// ─── KALDIRILDI (2026-08-06) ────────────────────────────────────────────────
// getTeamRolesAndInstructions / updateTeamRolesAndInstructions / sbRemovePlayerFromTeam
//
// Üçü de HİÇBİR YERDEN çağrılmıyordu ve üçü de artık VAR OLMAYAN şemaya
// bakıyordu — yani biri bağlasa sessizce çalışmazdı:
//   • teams.team_roles kolonu yok (rol/talimat modeli tactics'e taşındı)
//   • team_members.player_id kolonu yok (doğrusu user_id)
//   • sbremoveplayerfromteam RPC'si veritabanında yok; çağrı her seferinde
//     hata verip "yedek" silmeye düşüyordu, o yedek de yanlış kolona bakıyordu.
// Takımdan üye çıkarma bugün TeamService.removeTeamMember → remove_team_member
// RPC'si ile yapılıyor.

