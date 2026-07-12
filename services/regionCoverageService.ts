// Bölge kapsama + idari sınırlar (region_coverage tablosu).
// Harita sarı sınır çizimi ve "hizmet kapsamındaki bölgeler" bu servisten gelir.
import { supabase } from '../supabaseClient';

export interface RegionCoverage {
  city: string;
  district: string | null;
  /** GeoJSON geometry (Polygon | MultiPolygon) — null ise sınır henüz yok. */
  boundary: GeoJsonGeometry | null;
  centerLat: number | null;
  centerLng: number | null;
}

export type GeoJsonGeometry =
  | { type: 'Polygon'; coordinates: number[][][] }
  | { type: 'MultiPolygon'; coordinates: number[][][][] };

/** Aktif (hizmet kapsamındaki) tüm bölgeleri sınırlarıyla döndürür. */
export async function fetchActiveCoverage(): Promise<RegionCoverage[]> {
  const { data, error } = await supabase
    .from('region_coverage')
    .select('city, district, boundary, center_lat, center_lng')
    .eq('is_active', true);
  if (error) throw error;
  return ((data ?? []) as Array<Record<string, unknown>>).map((r) => ({
    city: r.city as string,
    district: (r.district as string | null) ?? null,
    boundary: (r.boundary as GeoJsonGeometry | null) ?? null,
    centerLat: (r.center_lat as number | null) ?? null,
    centerLng: (r.center_lng as number | null) ?? null,
  }));
}
