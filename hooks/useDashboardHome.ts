// ════════════════════════════════════════════════════════════════════════════
// ANA SAYFA · VERİ KANCASI (önbellekli)
// ════════════════════════════════════════════════════════════════════════════
//
// TASARIMIN YEDİ DURUMU tek bir yerden sürülür. Ekran hangi durumu çizeceğine
// buradan dönen alanlara bakarak karar verir; kendi başına "yükleniyor mu"
// tahmini yapmaz.
//
//   Normal      · veri var
//   Maçı yok    · `nextMatch === null`  (kutu çizilmez, cüzdan büyür)
//   Yeni kul.   · profil alanları boş   (fotoğraf/takım/pozisyon yok)
//   Yükleniyor  · `loading` — YALNIZ önbellek YOKKEN true olur
//   Hata        · `error`
//   Çevrimdışı  · `offline` — hata DEĞİL; önbellek olduğu gibi durur
//   Yenileniyor · `refreshing` — içerik yerinde kalır, üstte şerit açılır
//
// ── ÖNBELLEK: "ÖNCE ÇİZ, SONRA TAZELE" ──────────────────────────────────────
// Ana sayfa uygulamanın ilk ekranı. Veriyi bekleyip boş durmak, açılışı ağ
// hızına bağlar. Bunun yerine son bilinen hâl ANINDA çizilir, tazeleme arkada
// koşar. İskelet YALNIZ önbellek yokken (ilk kurulum) görünür.
//
// Depo: Capacitor Preferences — web'de localStorage, native'de UserDefaults /
// SharedPreferences. WebView depolama baskısında localStorage'ı tahliye
// edebilir; native ayna bu yüzden önemli.
//
// ── ÖNBELLEK ANAHTARI KULLANICIYA BAĞLI ─────────────────────────────────────
// Anahtarda kullanıcı kimliği var. Aynı telefonda hesap değiştiren birinin
// önceki hesabın bakiyesini/adını görmesi kabul edilemez.
// ════════════════════════════════════════════════════════════════════════════

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Preferences } from '@capacitor/preferences';
import { useAppStore } from '../store';
import { auth } from '../supabaseAuth';
import {
  fetchHomeBanner, fetchHomeProfile, fetchStripMatches,
  type HomeBanner, type HomeProfile, type HomeStripMatch,
} from '../services/dashboardHomeService';
import {
  countNearbyPitches, countNearbyProviders, type GeoCenter,
} from '../services/dashboardCountsService';
import { getWalletSummary } from '../services/walletService';

const CACHE_VERSION = 1;
const cacheKey = (uid: string) => `oyna.home.v${CACHE_VERSION}.${uid || 'guest'}`;

/** Bu süreden eski önbellek "bayat" sayılır ve çevrimdışı şeridinde söylenir. */
export const STALE_AFTER_MS = 10 * 60 * 1000;

export interface HomeData {
  profile: HomeProfile | null;
  /** Harcanabilir bakiye (₺). Bilinmiyorsa null → ekran "₺—" yazar. */
  balance: number | null;
  strip: HomeStripMatch[];
  /** Bugün+yarın yakındaki TOPLAM açık maç sayısı ("6 maç · bugün ve yarın"). */
  matchTotal: number | null;
  pitches: number | null;
  goalkeepers: number | null;
  referees: number | null;
  banner: HomeBanner | null;
}

const EMPTY: HomeData = {
  profile: null, balance: null, strip: [], matchTotal: null,
  pitches: null, goalkeepers: null, referees: null, banner: null,
};

export interface DashboardHome extends HomeData {
  loading: boolean;
  refreshing: boolean;
  error: boolean;
  offline: boolean;
  /** Önbellek zamanı (ms). Çevrimdışı şeridi "N dk önce" derken kullanır. */
  updatedAt: number | null;
  /** Kullanıcının bir konumu/bölgesi var mı? Yoksa yakınlık sorulmaz. */
  hasScope: boolean;
  refresh: () => void;
}

const isOnline = () => typeof navigator === 'undefined' || navigator.onLine !== false;

/** Önbelleğe yazarken Date nesneleri ISO'ya döner; okurken geri çevrilir. */
const reviveStrip = (raw: unknown): HomeStripMatch[] =>
  Array.isArray(raw)
    ? raw
        .map((m) => ({ ...(m as HomeStripMatch), startsAt: new Date((m as { startsAt: string }).startsAt) }))
        .filter((m) => !Number.isNaN(m.startsAt.getTime()))
    : [];

export function useDashboardHome(): DashboardHome {
  const userLocation = useAppStore((s) => s.userLocation);
  const selectedRegions = useAppStore((s) => s.selectedRegions);
  const activeRegion = useAppStore((s) => s.activeRegion);
  const searchRadius = useAppStore((s) => s.searchRadius);

  const uid = auth.currentUser?.uid ?? '';

  // MatchDiscovery / dashboardCounts ile AYNI kapsam kuralı: seçili bölgeler
  // varsa onların merkezleri, yoksa GPS. İkisi de yoksa kapsam yok.
  const centers = useMemo<GeoCenter[]>(() => {
    const fromRegions = selectedRegions
      .map((r) => r.coordinates)
      .filter((c): c is GeoCenter => !!c && Number.isFinite(c.lat) && Number.isFinite(c.lng));
    if (fromRegions.length > 0) return fromRegions;
    return userLocation ? [userLocation] : [];
  }, [selectedRegions, userLocation]);

  const hasScope = centers.length > 0;
  const city = activeRegion?.city ?? selectedRegions[0]?.city ?? null;
  const district = activeRegion?.district ?? selectedRegions[0]?.district ?? null;

  const [data, setData] = useState<HomeData>(EMPTY);
  const [updatedAt, setUpdatedAt] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(false);
  const [offline, setOffline] = useState(!isOnline());
  const [attempt, setAttempt] = useState(0);

  // Kapsam değişince eski istek geç dönüp yeni sonucun üstüne yazmasın.
  const runId = useRef(0);
  const mounted = useRef(true);
  useEffect(() => () => { mounted.current = false; }, []);

  const centersKey = useMemo(
    () => centers.map((c) => `${c.lat.toFixed(4)},${c.lng.toFixed(4)}`).join('|'),
    [centers],
  );

  const refresh = useCallback(() => setAttempt((n) => n + 1), []);

  // ── Bağlantı durumu ───────────────────────────────────────────────────────
  useEffect(() => {
    const on = () => { setOffline(false); setAttempt((n) => n + 1); };
    const off = () => setOffline(true);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);

  // ── 1) Önbellekten ANINDA çiz ─────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { value } = await Preferences.get({ key: cacheKey(uid) });
        if (cancelled || !value) return;
        const parsed = JSON.parse(value) as { at: number; data: HomeData };
        if (!parsed?.data) return;
        setData({ ...parsed.data, strip: reviveStrip(parsed.data.strip) });
        setUpdatedAt(parsed.at);
        // Önbellek var → iskelet GÖSTERİLMEZ. Tazeleme arkada koşar.
        setLoading(false);
      } catch {
        // Bozuk/okunamayan önbellek sessizce yok sayılır: ekran normal
        // yükleme yoluna düşer, kullanıcı hiçbir şey fark etmez.
      }
    })();
    return () => { cancelled = true; };
  }, [uid]);

  // ── 2) Arkada tazele ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!isOnline()) { setOffline(true); setLoading(false); return; }

    const id = ++runId.current;
    setRefreshing(true);
    setError(false);

    // Beşi de bağımsız. Biri patlarsa diğerleri yine de gelsin diye
    // allSettled: yarısı dolu bir ekran, hiç dolmayandan iyidir. Ama en az
    // biri düştüyse HATA durumu açılır — sessiz eksik veri yanıltıcıdır.
    Promise.allSettled([
      uid ? fetchHomeProfile(uid) : Promise.resolve(null),
      uid ? getWalletSummary() : Promise.resolve(null),
      hasScope ? fetchStripMatches(centers, searchRadius, 3) : Promise.resolve({ matches: [], total: null }),
      hasScope ? countNearbyPitches(centers, searchRadius) : Promise.resolve(null),
      hasScope ? countNearbyProviders(centers, searchRadius, 'GK') : Promise.resolve(null),
      hasScope ? countNearbyProviders(centers, searchRadius, 'REF') : Promise.resolve(null),
      fetchHomeBanner(city, district),
    ]).then((r) => {
      if (id !== runId.current || !mounted.current) return;

      const failed = r.some((x) => x.status === 'rejected');
      r.forEach((x) => { if (x.status === 'rejected') console.error('[useDashboardHome]', x.reason); });
      const val = <T,>(i: number, fallback: T): T =>
        r[i].status === 'fulfilled' ? ((r[i] as PromiseFulfilledResult<T>).value ?? fallback) : fallback;

      const stripResult = val<{ matches: HomeStripMatch[]; total: number | null }>(2, { matches: [], total: null });

      const next: HomeData = {
        profile: val<HomeProfile | null>(0, null),
        balance: val<{ spendableBalance: number } | null>(1, null)?.spendableBalance ?? null,
        strip: stripResult.matches,
        matchTotal: stripResult.total,
        pitches: val<number | null>(3, null),
        goalkeepers: val<number | null>(4, null),
        referees: val<number | null>(5, null),
        banner: val<HomeBanner | null>(6, null),
      };

      setData(next);
      setError(failed);
      setLoading(false);
      setRefreshing(false);

      // Yarım veriyi önbelleğe YAZMA: bir sonraki açılışta eksik hâli "son
      // bilinen doğru" sanıp çizerdik.
      if (!failed) {
        const at = Date.now();
        setUpdatedAt(at);
        Preferences.set({ key: cacheKey(uid), value: JSON.stringify({ at, data: next }) })
          .catch(() => { /* depo dolu/kapalı — önbellek bir kolaylık, zorunluluk değil */ });
      }
    });
    // `centers` her render'da yeni referans; içerik anahtarına bağlanıyoruz.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uid, centersKey, hasScope, searchRadius, city, district, attempt]);

  return {
    ...data,
    loading, refreshing, error, offline, updatedAt, hasScope, refresh,
  };
}
