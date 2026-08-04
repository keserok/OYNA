// ═══════════════════════════════════════════════════════════════════════════
// OYNA — Gözlemlenebilirlik Cephesi (FAZ 7.4 · Altyapı)
// Sentry (hata izleme) + PostHog (ürün analitiği) için sağlayıcı-bağımsız bir
// cephe (façade). Tüm uygulama yalnızca bu modülü çağırır; sağlayıcı değişse
// bile çağrı noktaları değişmez.
//
// ── SRE-3 (4 Ağu 2026) · KENDİ ÇÖKME KAYDIMIZ ──────────────────────────────
// Kurucu kararı: hata kayıtları ÜÇÜNCÜ TARAFA GÖNDERİLMEZ. Sentry/PostHog
// anahtarı yoksa (bugünkü durum) hatalar kendi veritabanımızdaki
// `hata_bildir` kapısına yazılır. Dışarı hiçbir veri çıkmaz.
//
// Ayrıca artık YALNIZCA elle çağrılan yerler değil, yakalanmamış tüm hatalar
// da kaydedilir (window.onerror + unhandledrejection). Eskiden uygulama bir
// kullanıcının telefonunda çöktüğünde bunu hiç kimse bilmiyordu.
//
// AKTİVASYON: tamamen env-var ile. Anahtar yoksa her fonksiyon SESSİZ no-op'tur
// (dev'de console.debug). Böylece build her zaman yeşil kalır ve canlıya
// geçişte yalnızca aşağıdaki ortam değişkenlerini doldurmak yeterlidir:
//
//   VITE_SENTRY_DSN      = https://<key>@o<org>.ingest.sentry.io/<project>
//   VITE_POSTHOG_KEY     = phc_xxx
//   VITE_POSTHOG_HOST    = https://eu.i.posthog.com   (varsayılan: us)
//   VITE_APP_VERSION     = oyna@1.0.0                 (release etiketi)
//   VITE_SENTRY_SAMPLE   = 0.1                         (trace örnekleme oranı)
//
// SDK'lar npm yerine CDN'den (Sentry Loader Script / PostHog snippet) dinamik
// yüklenir → ek paket bağımlılığı yok, ilk yük hafif kalır.
// ═══════════════════════════════════════════════════════════════════════════

const SENTRY_DSN    = import.meta.env.VITE_SENTRY_DSN as string | undefined;
const POSTHOG_KEY   = import.meta.env.VITE_POSTHOG_KEY as string | undefined;
const POSTHOG_HOST  = (import.meta.env.VITE_POSTHOG_HOST as string | undefined) ?? 'https://us.i.posthog.com';
const RELEASE       = (import.meta.env.VITE_APP_VERSION as string | undefined) ?? 'oyna@dev';
const ENVIRONMENT   = (import.meta.env.MODE as string | undefined) ?? 'production';
const TRACE_SAMPLE  = Number(import.meta.env.VITE_SENTRY_SAMPLE ?? '0.1');
const IS_DEV        = !!import.meta.env.DEV;

declare global {
  interface Window {
    Sentry?: any;
    posthog?: any;
  }
}

let initialized = false;
const hasWindow = typeof window !== 'undefined';

function debug(...args: unknown[]) {
  if (IS_DEV) console.debug('[obs]', ...args);
}

function injectScript(src: string, attrs: Record<string, string> = {}): void {
  if (!hasWindow) return;
  const s = document.createElement('script');
  s.src = src;
  s.async = true;
  s.crossOrigin = 'anonymous';
  for (const [k, v] of Object.entries(attrs)) s.setAttribute(k, v);
  document.head.appendChild(s);
}

// ── Sentry (Loader Script) ─────────────────────────────────────────────────
// DSN'in public key kısmı loader script URL'sini belirler. Loader, window.Sentry
// stub'unu hemen kurar; onLoad ile gerçek SDK gelince init ederiz.
function initSentry(): void {
  if (!SENTRY_DSN || !hasWindow) return;
  try {
    const publicKey = SENTRY_DSN.split('//')[1]?.split('@')[0];
    if (!publicKey) { debug('Sentry DSN biçimi tanınmadı'); return; }
    injectScript(`https://js.sentry-cdn.com/${publicKey}.min.js`, { 'data-lazy': 'no' });
    // Loader, window.Sentry.onLoad kuyruğunu sağlar (SDK gelmeden önce de güvenli).
    const boot = () => window.Sentry?.init?.({
      dsn: SENTRY_DSN,
      environment: ENVIRONMENT,
      release: RELEASE,
      tracesSampleRate: Number.isFinite(TRACE_SAMPLE) ? TRACE_SAMPLE : 0.1,
      sendDefaultPii: false,
      beforeSend: (event: any) => {
        try {
          if (event.request?.headers) {
            const sensitiveHeaders = ['authorization', 'apikey', 'x-client-info'];
            for (const key of Object.keys(event.request.headers)) {
              if (sensitiveHeaders.includes(key.toLowerCase())) {
                event.request.headers[key] = '[SCRUBBED]';
              }
            }
          }
          const keysToScrub = ['email', 'phone', 'password', 'token', 'jwt', 'auth', 'wallet_balance'];
          const scrubObj = (obj: any): any => {
            if (!obj || typeof obj !== 'object') return obj;
            if (Array.isArray(obj)) return obj.map(item => scrubObj(item));
            const copy = { ...obj };
            for (const key of Object.keys(copy)) {
              if (keysToScrub.some(k => key.toLowerCase().includes(k))) {
                copy[key] = '[SCRUBBED]';
              } else if (typeof copy[key] === 'object') {
                copy[key] = scrubObj(copy[key]);
              }
            }
            return copy;
          };
          if (event.extra) event.extra = scrubObj(event.extra);
          if (event.breadcrumbs) {
            event.breadcrumbs = event.breadcrumbs.map((breadcrumb: any) => {
              if (breadcrumb.data) breadcrumb.data = scrubObj(breadcrumb.data);
              return breadcrumb;
            });
          }
        } catch (e) {
          // Dev modundaysa uyar
          debug('Sentry scrubbing error:', e);
        }
        return event;
      },
    });
    const tryBoot = () => {
      if (window.Sentry?.onLoad) { window.Sentry.onLoad(boot); }
      else if (window.Sentry?.init) { boot(); }
      else { setTimeout(tryBoot, 300); }
    };
    tryBoot();
    debug('Sentry başlatılıyor');
  } catch (e) {
    debug('Sentry init hatası', e);
  }
}

// ── PostHog (resmi snippet stub'u) ─────────────────────────────────────────
function initPostHog(): void {
  if (!POSTHOG_KEY || !hasWindow) return;
  try {
    // Resmi PostHog stub: array.js gelene kadar çağrıları kuyruğa alır.
    const w = window as any;
    if (!w.posthog) {
      const ph: any = (w.posthog = []);
      ph._i = [];
      ph.init = function (key: string, cfg: any, name?: string) {
        function stub(target: any, method: string) {
          target[method] = function () {
            target.push([method].concat(Array.prototype.slice.call(arguments, 0)));
          };
        }
        const inst = name ? (ph[name] = []) : ph;
        const methods = (
          'init capture identify alias people set set_once reset register register_once ' +
          'unregister opt_in_capturing opt_out_capturing has_opted_in_capturing ' +
          'has_opted_out_capturing get_distinct_id group startSessionRecording ' +
          'stopSessionRecording isFeatureEnabled onFeatureFlags getFeatureFlag reloadFeatureFlags'
        ).split(' ');
        for (const m of methods) stub(inst, m);
        ph._i.push([key, cfg, name]);
      };
      ph.__SV = 1;
      injectScript(`${POSTHOG_HOST.replace(/\/$/, '')}/static/array.js`);
    }
    w.posthog.init(POSTHOG_KEY, {
      api_host: POSTHOG_HOST,
      capture_pageview: true,
      autocapture: true,
      persistence: 'localStorage+cookie',
    });
    debug('PostHog başlatılıyor');
  } catch (e) {
    debug('PostHog init hatası', e);
  }
}

// ── SRE-3 · Kendi veritabanımıza çökme kaydı ───────────────────────────────
// Üçüncü tarafa gitmez. Sunucu tarafında ikinci bir gizlilik eleği daha var
// (`hata_temizle_metin` / `hata_temizle_json`), bu yüzden burada kaçan bir
// e-posta/telefon olsa bile kayda geçmez.

/** Hata kaydederken hata olursa sonsuz döngü olmasın diye bayrak. */
let kayitSuruyor = false;
/** Aynı hatanın saniyede yüzlerce kez gitmesini engelleyen basit kova. */
const sonGonderim = new Map<string, number>();
const AYNI_HATA_BEKLEME_MS = 60_000;

function platformAdi(): string {
  try {
    const c = (window as any)?.Capacitor;
    if (c?.getPlatform) return String(c.getPlatform());
  } catch { /* yut */ }
  return 'web';
}

function hataMetni(error: unknown): { mesaj: string; yigin?: string } {
  if (error instanceof Error) {
    return { mesaj: `${error.name}: ${error.message}`, yigin: error.stack };
  }
  if (typeof error === 'string') return { mesaj: error };
  try { return { mesaj: JSON.stringify(error).slice(0, 500) }; }
  catch { return { mesaj: String(error) }; }
}

function kendiKaydimizaGonder(
  error: unknown,
  nerede?: string,
  context?: Record<string, unknown>,
): void {
  if (!hasWindow || kayitSuruyor) return;
  const { mesaj, yigin } = hataMetni(error);
  if (!mesaj || !mesaj.trim()) return;

  // Aynı hata bir dakika içinde tekrar tekrar gelmesin.
  const anahtar = `${nerede ?? ''}|${mesaj.split('\n')[0]}`;
  const simdi = Date.now();
  const oncekiZaman = sonGonderim.get(anahtar);
  if (oncekiZaman && simdi - oncekiZaman < AYNI_HATA_BEKLEME_MS) return;
  sonGonderim.set(anahtar, simdi);

  kayitSuruyor = true;
  // Dinamik import: gözlemlenebilirlik modülü açılışta veritabanı istemcisini
  // çekmesin, ilk yük hafif kalsın.
  import('../supabaseClient')
    .then(({ supabase }) => supabase.rpc('hata_bildir', {
      p_mesaj: mesaj,
      p_nerede: nerede ?? null,
      p_yigin: yigin ?? null,
      p_ekran: window.location?.pathname ?? null,
      p_surum: RELEASE,
      p_platform: platformAdi(),
      p_ek: context ? (context as Record<string, unknown>) : null,
    }))
    .catch(() => { /* kayıt gidemezse uygulama etkilenmez */ })
    .finally(() => { kayitSuruyor = false; });
}

// ── Genel API ──────────────────────────────────────────────────────────────

/** Uygulama açılışında bir kez çağrılır (index.tsx). */
export function initObservability(): void {
  if (initialized || !hasWindow) return;
  initialized = true;

  // Yakalanmamış hatalar: kullanıcı bize söylemek zorunda kalmasın.
  window.addEventListener('error', (olay: ErrorEvent) => {
    captureException(olay.error ?? olay.message, { tur: 'window.onerror' });
  });
  window.addEventListener('unhandledrejection', (olay: PromiseRejectionEvent) => {
    captureException(olay.reason, { tur: 'unhandledrejection' });
  });

  if (!SENTRY_DSN && !POSTHOG_KEY) {
    debug('dış sağlayıcı kapalı — hatalar kendi veritabanımıza yazılıyor');
    return;
  }
  initSentry();
  initPostHog();
}

/**
 * Hatayı kaydeder. Sentry açıksa oraya da gider; her hâlükârda KENDİ
 * veritabanımıza yazılır (SRE-3). Asla hata fırlatmaz.
 */
export function captureException(error: unknown, context?: Record<string, unknown>): void {
  try {
    if (hasWindow && window.Sentry?.captureException) {
      window.Sentry.captureException(error, context ? { extra: context } : undefined);
    }
    kendiKaydimizaGonder(error, (context?.where as string) ?? (context?.tur as string), context);
    debug('captureException', error, context);
  } catch { /* yut */ }
}

/** Ürün analitiği olayı (PostHog). Anahtar yoksa no-op. */
export function trackEvent(event: string, properties?: Record<string, unknown>): void {
  try {
    if (hasWindow && window.posthog?.capture) {
      window.posthog.capture(event, properties);
    } else {
      debug('track', event, properties);
    }
  } catch { /* yut */ }
}

/** Oturum açan kullanıcıyı analitik + hata bağlamına bağlar. */
export function identifyUser(userId: string, traits?: Record<string, unknown>): void {
  try {
    if (hasWindow && window.posthog?.identify) window.posthog.identify(userId, traits);
    if (hasWindow && window.Sentry?.setUser) window.Sentry.setUser({ id: userId });
    debug('identify', userId);
  } catch { /* yut */ }
}

/** Çıkışta kullanıcı bağlamını temizler. */
export function resetUser(): void {
  try {
    if (hasWindow && window.posthog?.reset) window.posthog.reset();
    if (hasWindow && window.Sentry?.setUser) window.Sentry.setUser(null);
  } catch { /* yut */ }
}
