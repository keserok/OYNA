// ════════════════════════════════════════════════════════════════════════════
// ANA SAYFA SAYILARI — React tarafı
// ════════════════════════════════════════════════════════════════════════════
//
// Ana sayfadaki dört kart altı yazısını (maç / saha / kaleci / hakem) besler.
//
// KAPSAM (yarıçap) TEK KAYNAKTAN: keşif ekranlarıyla AYNI kural — kullanıcı
// bölge seçmişse seçtiği bölgelerin merkezleri, seçmemişse GPS konumu; yarıçap
// store'daki `searchRadius`. Böylece ana sayfada "6 maç" yazıp Top Oyna'ya
// girince 11 maç görmek gibi bir tutarsızlık olmaz.
//
// KONUM YOKSA sayı GÖSTERİLMEZ (`hasScope: false`). Uydurulmuş bir "çevrende"
// yazmaktansa hiç yazmamak doğrudur: kullanıcı henüz nerede olduğunu
// söylemediyse "çevre" diye bir şey yoktur.
//
// React Query KULLANILMIYOR — projede yok. Desen, PitchDiscovery'deki yerleşik
// üçlüdür: veri + `loading` + `error`, artı elle `retry`.
// ════════════════════════════════════════════════════════════════════════════

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAppStore } from '../store';
import {
  countNearbyPitches,
  countNearbyProviders,
  countTodayMatches,
  type GeoCenter,
} from '../services/dashboardCountsService';

export interface DashboardCounts {
  /** Bugün başlayacak, yarıçaptaki açık maç sayısı. Veri yokken null. */
  todayMatches: number | null;
  /** Yarıçaptaki vitrinde görünen saha sayısı. */
  pitches: number | null;
  /** Yarıçaptaki onaylı + müsait kaleci sayısı. */
  goalkeepers: number | null;
  /** Yarıçaptaki onaylı + müsait hakem sayısı. */
  referees: number | null;
  /** İlk yükleme ya da yeniden deneme sürüyor. */
  loading: boolean;
  /** Sayılardan en az biri çekilemedi — ana sayfa HATA durumunu çizer. */
  error: boolean;
  /** Kullanıcının bir konumu/bölgesi var mı? Yoksa sayı hiç sorulmaz. */
  hasScope: boolean;
  /** Hata şeridindeki "Tekrar Dene" bunu çağırır. */
  retry: () => void;
}

const EMPTY: Pick<DashboardCounts, 'todayMatches' | 'pitches' | 'goalkeepers' | 'referees'> = {
  todayMatches: null,
  pitches: null,
  goalkeepers: null,
  referees: null,
};

export function useDashboardCounts(): DashboardCounts {
  const userLocation = useAppStore((s) => s.userLocation);
  const selectedRegions = useAppStore((s) => s.selectedRegions);
  const searchRadius = useAppStore((s) => s.searchRadius);

  // MatchDiscovery ile AYNI kapsam kuralı: seçili bölgeler varsa onların
  // merkezleri, yoksa GPS. İkisi de yoksa kapsam yok.
  const centers = useMemo<GeoCenter[]>(() => {
    const fromRegions = selectedRegions
      .map((r) => r.coordinates)
      .filter((c): c is GeoCenter => !!c && Number.isFinite(c.lat) && Number.isFinite(c.lng));
    if (fromRegions.length > 0) return fromRegions;
    return userLocation ? [userLocation] : [];
  }, [selectedRegions, userLocation]);

  const hasScope = centers.length > 0;

  const [counts, setCounts] = useState(EMPTY);
  const [loading, setLoading] = useState(hasScope);
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);

  // Kapsam değişince eski istek geç dönüp yeni sonucun üstüne yazmasın.
  const runId = useRef(0);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);

  // centers bir dizi; her render'da yeni referans olmasın diye içeriğinden
  // türetilmiş sabit bir anahtarla effect'i tetikliyoruz.
  const centersKey = useMemo(
    () => centers.map((c) => `${c.lat.toFixed(4)},${c.lng.toFixed(4)}`).join('|'),
    [centers],
  );

  useEffect(() => {
    if (!hasScope) {
      setCounts(EMPTY);
      setLoading(false);
      setError(false);
      return;
    }

    const id = ++runId.current;
    setLoading(true);
    setError(false);

    // Dördü de bağımsız; biri patlarsa diğerleri yine de gelsin diye
    // allSettled. Tek bir tanesi bile başarısızsa ekran HATA durumuna geçer —
    // yarısı dolu yarısı boş bir ana sayfa kullanıcıyı yanıltır.
    Promise.allSettled([
      countTodayMatches(centers, searchRadius),
      countNearbyPitches(centers, searchRadius),
      countNearbyProviders(centers, searchRadius, 'GK'),
      countNearbyProviders(centers, searchRadius, 'REF'),
    ]).then((results) => {
      if (id !== runId.current) return; // eskimiş istek — yoksay
      const failed = results.some((r) => r.status === 'rejected');
      results.forEach((r) => {
        if (r.status === 'rejected') console.error('[useDashboardCounts]', r.reason);
      });
      const value = (i: number) =>
        results[i].status === 'fulfilled' ? (results[i] as PromiseFulfilledResult<number>).value : null;
      setCounts({
        todayMatches: value(0),
        pitches: value(1),
        goalkeepers: value(2),
        referees: value(3),
      });
      setError(failed);
      setLoading(false);
    });
    // `centers` yerine `centersKey`: dizi referansı her render'da değişir,
    // içeriği değişmediği sürece yeniden sorgu atmamalıyız.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [centersKey, hasScope, searchRadius, attempt]);

  return { ...counts, loading, error, hasScope, retry };
}
