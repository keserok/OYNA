/**
 * Adres <-> koordinat çevrimi (Faz 2 · Karar #11, #14).
 * Saha sahibi "Adres" yazıp haritada tam konumu bulur; pini taşıyınca adres
 * önerisi alır. Sağlayıcı-soyutlamalı: varsayılan Nominatim (OpenStreetMap,
 * anahtarsız). İleride MapTiler/Google'a geçmek için yalnız bu dosya değişir.
 *
 * NOT: Nominatim istemci tarafından çağrılır (kullanıcı cihazından). Kullanım
 * politikası gereği düşük hacim + tanımlayıcı referer beklenir; owner ara sıra
 * adres araması yaptığı için lansman ölçeğinde uygundur.
 */

export interface GeocodeResult {
  lat: number;
  lng: number;
  /** Sağlayıcının döndürdüğü okunabilir tam adres (varsa). */
  displayName: string;
}

const NOMINATIM_BASE = 'https://nominatim.openstreetmap.org';
// Türkiye sınırlarına öncelik + Türkçe sonuç.
const COMMON_PARAMS = 'format=jsonv2&addressdetails=1&accept-language=tr&countrycodes=tr';

async function fetchJson(url: string, signal?: AbortSignal): Promise<any> {
  const res = await fetch(url, {
    signal,
    headers: { 'Accept': 'application/json' },
  });
  if (!res.ok) throw new Error(`GEOCODE_HTTP_${res.status}`);
  return res.json();
}

/**
 * Serbest metin adresi koordinata çevirir. Şehir/ilçe bağlamı verilirse
 * aramaya eklenir (isabet artar). Sonuç yoksa null döner.
 */
export async function geocodeAddress(
  query: string,
  ctx?: { city?: string | null; district?: string | null },
  signal?: AbortSignal,
): Promise<GeocodeResult | null> {
  const parts = [query, ctx?.district, ctx?.city, 'Türkiye'].filter((p) => p && String(p).trim());
  const q = encodeURIComponent(parts.join(', '));
  if (!q) return null;
  const url = `${NOMINATIM_BASE}/search?${COMMON_PARAMS}&limit=1&q=${q}`;
  const data = await fetchJson(url, signal);
  const hit = Array.isArray(data) ? data[0] : null;
  if (!hit || hit.lat == null || hit.lon == null) return null;
  return {
    lat: Number(Number(hit.lat).toFixed(6)),
    lng: Number(Number(hit.lon).toFixed(6)),
    displayName: String(hit.display_name ?? ''),
  };
}

export interface ReverseResult {
  address: string;
  city: string | null;
  district: string | null;
  displayName: string;
}

/** Koordinatı okunabilir adrese çevirir (pin taşınınca adres önerisi için). */
export async function reverseGeocode(
  lat: number,
  lng: number,
  signal?: AbortSignal,
): Promise<ReverseResult | null> {
  const url = `${NOMINATIM_BASE}/reverse?${COMMON_PARAMS}&lat=${lat}&lon=${lng}`;
  const data = await fetchJson(url, signal);
  if (!data || !data.address) return null;
  const a = data.address as Record<string, string>;
  // İl: province/state; İlçe: county/town/city_district/district.
  const city = a.province ?? a.state ?? a.city ?? null;
  const district = a.county ?? a.town ?? a.city_district ?? a.district ?? a.municipality ?? null;
  // Kısa adres: mahalle + sokak + no (varsa), yoksa display_name'in ilk kısmı.
  const street = [a.neighbourhood ?? a.suburb, a.road, a.house_number].filter(Boolean).join(' ');
  const address = street || String(data.display_name ?? '').split(',').slice(0, 2).join(',').trim();
  return {
    address,
    city,
    district,
    displayName: String(data.display_name ?? ''),
  };
}
