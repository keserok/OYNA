/**
 * ⚡ OYNA — Ortak Konum Servisi (Location Service)
 * ------------------------------------------------------------------
 * Tek giriş noktası: cihazdan GPS konumu al. Web ve native (iOS/Android)
 * platformlarını @capacitor/geolocation üzerinden BİRLEŞTİRİR; böylece
 * uygulamanın hiçbir yeri artık doğrudan navigator.geolocation kullanmaz.
 *
 * - Native (Capacitor): izin durumunu kontrol eder, gerekirse ister,
 *   sonra yüksek hassasiyetle konumu alır.
 * - Web: tarayıcı izin diyaloğunu getCurrentPosition tetikler.
 *
 * pushService.ts ile aynı native/web dallanma desenini izler.
 */

import { Capacitor } from '@capacitor/core';
import { Geolocation } from '@capacitor/geolocation';
import type { OynaLocation } from '../types';
import { resolveFromCoords } from '../utils/regionResolver';

/** Normalize edilmiş izin durumu. */
export type LocationPermission = 'granted' | 'denied' | 'prompt' | 'blocked';

/** Cihazdan dönen konum. */
export interface LocationCoords {
  lat: number;
  lng: number;
  /** Metre cinsinden yatay doğruluk (varsa). */
  accuracy?: number;
}

/** Konum hatası sınıfları — arayüz buna göre farklı mesaj gösterebilir. */
export type LocationErrorCode = 'denied' | 'unavailable' | 'timeout' | 'unsupported';

export class LocationError extends Error {
  code: LocationErrorCode;
  constructor(code: LocationErrorCode, message: string) {
    super(message);
    this.name = 'LocationError';
    this.code = code;
  }
}

const IS_NATIVE = Capacitor.isNativePlatform();

export interface DetectOptions {
  /** true: yüksek hassasiyet (GPS). false: hızlı/kaba (batarya dostu, arka plan tazeleme için). */
  highAccuracy?: boolean;
  /** ms — bu süreden yeni bir önbellek fix'i kabul et (art arda taramayı önler). */
  maximumAgeMs?: number;
  /** ms — bekleme sınırı. */
  timeoutMs?: number;
}

/** Kullanıcı bizzat istediğinde (radar/yenile): hassas, kısa önbellekli. */
const DEFAULT_DETECT: Required<DetectOptions> = {
  highAccuracy: true,
  maximumAgeMs: 60000,
  timeoutMs: 10000,
};

/** Sessiz/arka plan tazeleme: kaba, uzun önbellekli, hızlı — sadece "şehir değişti mi?". */
export const SILENT_DETECT: DetectOptions = {
  highAccuracy: false,
  maximumAgeMs: 600000,
  timeoutMs: 5000,
};

/**
 * Ham cihaz hatasını OYNA hata koduna çevirir.
 * Web tarafında GeolocationPositionError.code: 1=izin yok, 2=konum yok, 3=zaman aşımı.
 */
function toLocationError(err: unknown): LocationError {
  const anyErr = err as { code?: number; message?: string } | undefined;
  const code = anyErr?.code;
  const msg = (anyErr?.message || '').toLowerCase();

  if (code === 1 || msg.includes('denied') || msg.includes('permission')) {
    return new LocationError('denied', 'Konum izni verilmedi.');
  }
  if (code === 3 || msg.includes('timeout')) {
    return new LocationError('timeout', 'Konum alınırken zaman aşımına uğradı.');
  }
  if (msg.includes('not supported') || msg.includes('unsupported') || msg.includes('not implemented')) {
    return new LocationError('unsupported', 'Bu cihaz konum servisini desteklemiyor.');
  }
  return new LocationError('unavailable', 'Konum şu an alınamıyor.');
}

/**
 * Mevcut konum iznini normalize edip döndürür (istemez, sadece bakar).
 * Web'de Permissions API her yerde geolocation'ı desteklemeyebilir → 'prompt' varsayılır.
 */
export async function getLocationPermission(): Promise<LocationPermission> {
  try {
    const status = await Geolocation.checkPermissions();
    const loc = status.location;
    if (loc === 'granted') return 'granted';
    if (loc === 'denied') return IS_NATIVE ? 'blocked' : 'denied';
    return 'prompt';
  } catch {
    // checkPermissions web'de desteklenmiyorsa: kullanıcıya sormamız gerekir
    return 'prompt';
  }
}

/**
 * ANA FONKSİYON — Cihazdan konumu ister ve döndürür.
 * Native'de önce izni kontrol/talep eder; web'de doğrudan konum ister
 * (tarayıcı izin diyaloğunu getCurrentPosition açar).
 *
 * @throws {LocationError} denied | timeout | unavailable | unsupported
 */
export async function requestDeviceLocation(opts: DetectOptions = {}): Promise<LocationCoords> {
  const o = { ...DEFAULT_DETECT, ...opts };
  // 1) Native: izin akışı
  if (IS_NATIVE) {
    try {
      let perm = await Geolocation.checkPermissions();
      if (perm.location === 'prompt' || perm.location === 'prompt-with-rationale') {
        perm = await Geolocation.requestPermissions({ permissions: ['location'] });
      }
      if (perm.location !== 'granted') {
        throw new LocationError('denied', 'Konum izni verilmedi.');
      }
    } catch (err) {
      if (err instanceof LocationError) throw err;
      throw toLocationError(err);
    }
  }

  // 2) Konumu al (web + native ortak)
  try {
    const pos = await Geolocation.getCurrentPosition({
      enableHighAccuracy: o.highAccuracy,
      timeout: o.timeoutMs,
      maximumAge: o.maximumAgeMs,
    });
    return {
      lat: pos.coords.latitude,
      lng: pos.coords.longitude,
      accuracy: pos.coords.accuracy,
    };
  } catch (err) {
    if (err instanceof LocationError) throw err;
    throw toLocationError(err);
  }
}

/** Uygulamanın native platformda çalışıp çalışmadığını dışa açar (arayüz metni için). */
export const isNativePlatform = (): boolean => IS_NATIVE;

/**
 * ÜST DÜZEY — Cihazdan konumu alıp doğrudan OynaLocation'a çözer.
 * ("Ordu · Altınordu" etiketi, il/ilçe, kapsama bilgisi ile birlikte.)
 * Radar ekranı ve Ayarlar bunu kullanır; sonucu store.setActiveRegion'a verir.
 */
export async function detectRegion(opts: DetectOptions = {}): Promise<OynaLocation> {
  const coords = await requestDeviceLocation(opts);
  return resolveFromCoords(coords.lat, coords.lng, Date.now());
}
