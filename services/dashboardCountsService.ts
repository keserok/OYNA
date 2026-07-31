// ════════════════════════════════════════════════════════════════════════════
// ANA SAYFA SAYILARI — veri kaynağı
// ════════════════════════════════════════════════════════════════════════════
//
// Ana sayfadaki dört sayının ("bugün N maç", "çevrende N halı saha",
// "N müsait kaleci", "N müsait hakem") TEK kaynağı burasıdır.
//
// NEDEN AYRI DOSYA: bu sayılar SAYMAK için çekilir, LİSTELEMEK için değil.
// Sahaların/profillerin tamamını indirip uzunluğuna bakmak, ana sayfa açılışını
// keşif ekranı kadar pahalı yapardı. Aşağıdaki üç RPC yalnız kimlik döndürür
// (satır sayısı = cevap), ağır alanları taşımaz.
//
// FİLTRELER SUNUCUDA — İSTEMCİDE DEĞİL. Üç RPC de SECURITY DEFINER'dır ve
// doğruluk kurallarını kendi içinde uygular:
//
//   get_nearby_matches(lat, lon, km)
//     · status OPEN/ACTIVE, visibility OPEN (özel maçlar sayılmaz)
//     · starts_at > now()  → geçmiş maç sayıya girmez
//     · sahası koordinatlı ve yarıçap içinde
//
//   get_nearby_pitches(lat, lon, km)
//     · is_open = true, is_published ≠ false  → vitrinde görünmeyen saha sayılmaz
//     · demo kayıtlar hariç
//
//   get_nearby_providers(lat, lon, km, 'GK' | 'REF')
//     · sağlayıcı profili ONAYLI ('approved') olmalı → onaysız sayılmaz
//     · profiles.is_available ≠ false → "müsait" bilgisi buradan gelir
//     · demo kayıtlar hariç
//
// DİKKAT — `Goalkeeper.isAvailable` / `Referee.isAvailable` alanlarına BAKMA:
// `goalkeepers`/`referees` tablolarında böyle bir kolon YOKTUR (canlı şemadan
// doğrulandı; tipteki alan hiçbir zaman dolmuyor). Müsaitlik `profiles`
// tablosundadır ve ona yalnız bu RPC'ler üzerinden erişilir.
//
// Üçünün de EXECUTE yetkisi `authenticated` rolündedir; oturum açmış her
// oyuncu çağırabilir.
// ════════════════════════════════════════════════════════════════════════════

import { supabase } from '../supabaseClient';

export interface GeoCenter {
  lat: number;
  lng: number;
}

/** `get_nearby_matches` satırından sayım için gereken tek alan. */
interface NearbyMatchRow {
  id: string;
  starts_at: string | null;
}

/** `get_nearby_pitches` / `get_nearby_providers` (id, distance_km) döndürür. */
interface NearbyIdRow {
  id: string;
}

/**
 * Aynı kayıt birden fazla bölge merkezinden dönebilir (bölgeler örtüşür).
 * Sayarken id ile tekilleştirilir — yoksa iki bölge seçen kullanıcı sahaları
 * iki kez sayılmış görürdü.
 */
const uniqueIds = (rows: { id: string }[][]): Set<string> => {
  const seen = new Set<string>();
  rows.forEach((list) => list.forEach((r) => { if (r?.id) seen.add(r.id); }));
  return seen;
};

/** Verilen zaman damgası KULLANICININ bugünü içinde mi? */
const isToday = (iso: string | null): boolean => {
  if (!iso) return false;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return false;
  const now = new Date();
  return d.getFullYear() === now.getFullYear()
    && d.getMonth() === now.getMonth()
    && d.getDate() === now.getDate();
};

/**
 * BUGÜN başlayacak, yarıçap içindeki açık maç sayısı.
 *
 * "Bugün" filtresi istemcide uygulanır — bilerek: RPC gün sınırını sunucunun
 * saat diliminde çizerdi, oysa kullanıcı kendi telefonundaki günü kastediyor.
 */
export async function countTodayMatches(centers: GeoCenter[], radiusKm: number): Promise<number> {
  const perCenter = await Promise.all(
    centers.map(async (c) => {
      const { data, error } = await supabase.rpc('get_nearby_matches', {
        p_lat: c.lat, p_lon: c.lng, p_radius_km: radiusKm,
      });
      if (error) throw error;
      return ((data ?? []) as NearbyMatchRow[]).filter((m) => isToday(m.starts_at));
    }),
  );
  return uniqueIds(perCenter).size;
}

/** Yarıçap içindeki, vitrinde görünen açık saha sayısı. */
export async function countNearbyPitches(centers: GeoCenter[], radiusKm: number): Promise<number> {
  const perCenter = await Promise.all(
    centers.map(async (c) => {
      const { data, error } = await supabase.rpc('get_nearby_pitches', {
        p_lat: c.lat, p_lon: c.lng, p_radius_km: radiusKm,
      });
      if (error) throw error;
      return (data ?? []) as NearbyIdRow[];
    }),
  );
  return uniqueIds(perCenter).size;
}

/** Yarıçap içindeki onaylı ve müsait sağlayıcı (kaleci/hakem) sayısı. */
export async function countNearbyProviders(
  centers: GeoCenter[],
  radiusKm: number,
  type: 'GK' | 'REF',
): Promise<number> {
  const perCenter = await Promise.all(
    centers.map(async (c) => {
      const { data, error } = await supabase.rpc('get_nearby_providers', {
        p_lat: c.lat, p_lon: c.lng, p_radius_km: radiusKm, p_type: type,
      });
      if (error) throw error;
      return (data ?? []) as NearbyIdRow[];
    }),
  );
  return uniqueIds(perCenter).size;
}
