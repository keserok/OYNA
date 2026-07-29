import { Capacitor } from '@capacitor/core';
// NotificationType bir runtime enum'udur — `import type` ile alınamaz
// (tsconfig `isolatedModules: true`).
import { Haptics, NotificationType } from '@capacitor/haptics';

/**
 * IP-10 — Dokunsal geri bildirimin TEK kaynağı.
 *
 * İki sorunu birden çözer:
 *
 * 1. **iOS'ta titreşim ölüydü.** Kod tabanındaki 33 çağrının tamamı web
 *    `navigator.vibrate` kullanıyordu; iOS WKWebView bunu DESTEKLEMEZ. Yani
 *    iPhone'da tek bir dokunsal geri bildirim bile çalışmıyordu. Artık native
 *    platformda `@capacitor/haptics` motoru kullanılır (pod zaten bağlıydı,
 *    JS tarafı hiç çağırmıyordu).
 *
 * 2. **Titreşim her tuşta çalışıyordu.** Kullanıcı kararı: titreşim yalnız
 *    ANLAMLI anlarda olur. Bu yüzden bu modül bilerek YALNIZ ÜÇ şey dışa verir:
 *
 *      success()  — iş bitti (maç kuruldu, ödeme alındı, başvuru gönderildi)
 *      error()    — iş başarısız (doğrulama hatası, ret)
 *      select()   — kullanıcı bir SEÇİM yaptı (yıldız, saat kutusu, çip, diziliş)
 *
 *    `tap()` YOK ve bilerek yok: sıradan buton dokunuşu titreşmez. Basma
 *    geri bildirimi görseldir (index.css `:active` parlaklık düşüşü).
 *    Yeni bir seviye eklemeden önce kullanıcıya sor.
 *
 * Ham `navigator.vibrate(...)` çağrısı views/ ve components/ altında YASAKTIR
 * (tests/unit/haptics.test.ts bunu bekçiler).
 */

/** Cihaz tercihi — Ayarlar'daki anahtar. Varsayılan AÇIK (kullanıcı kararı). */
const HAPTICS_KEY = 'oyna_haptics_enabled';

export function isHapticsEnabled(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    // Yalnız açıkça 'false' yazılmışsa kapalı; anahtar hiç yoksa AÇIK.
    return localStorage.getItem(HAPTICS_KEY) !== 'false';
  } catch {
    return true;
  }
}

export function setHapticsEnabled(enabled: boolean): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(HAPTICS_KEY, enabled ? 'true' : 'false');
  } catch {
    /* yoksay — özel modda yazılamayabilir */
  }
}

const isNative = (): boolean => {
  try {
    return Capacitor.isNativePlatform();
  } catch {
    return false;
  }
};

/**
 * Web yedeği. DİKKAT: `navigator.vibrate` masaüstü Safari'de ve iOS'ta yoktur;
 * ayrıca kullanıcı reddetmişse fırlatabilir. Sessizce yutulur — titreşim hiçbir
 * zaman bir akışı bozmamalı.
 */
const webVibrate = (pattern: number | number[]): void => {
  if (typeof navigator === 'undefined' || typeof navigator.vibrate !== 'function') return;
  try {
    navigator.vibrate(pattern);
  } catch {
    /* yoksay */
  }
};

/**
 * Native çağrıları sarmalar. @capacitor/haptics'in web katmanı, tarayıcıda
 * `navigator.vibrate` yoksa promise'i REJECT eder (dist/esm/web.js →
 * `throw this.unavailable(...)`). Yakalanmazsa konsola işlenmemiş promise
 * reddi düşer. Bu yüzden HER çağrı .catch() ile susturulur.
 */
const native = (fn: () => Promise<void>): void => {
  try {
    fn().catch(() => {});
  } catch {
    /* senkron fırlatma ihtimaline karşı */
  }
};

/** Kullanıcı bir SEÇİM yaptı: yıldız, saat kutusu, çip, diziliş, bölge. */
export const select = (): void => {
  if (!isHapticsEnabled()) return;
  if (isNative()) {
    // NOT: `selectionChanged()` web'de selectionStart() çağrılmadan sessiz
    // no-op'tur; native'de böyle bir ön koşul yok, o yüzden yalnız burada.
    native(() => Haptics.selectionChanged());
    return;
  }
  webVibrate(8);
};

/** İşlem BAŞARIYLA tamamlandı: maç kuruldu, ödeme alındı, başvuru gönderildi. */
export const success = (): void => {
  if (!isHapticsEnabled()) return;
  if (isNative()) {
    native(() => Haptics.notification({ type: NotificationType.Success }));
    return;
  }
  webVibrate([30, 40, 30]);
};

/** İşlem BAŞARISIZ: doğrulama hatası, ödeme reddedildi, kadro dolu. */
export const error = (): void => {
  if (!isHapticsEnabled()) return;
  if (isNative()) {
    native(() => Haptics.notification({ type: NotificationType.Error }));
    return;
  }
  webVibrate([50, 60, 50]);
};

export const haptics = { select, success, error };
