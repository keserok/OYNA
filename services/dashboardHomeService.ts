// ════════════════════════════════════════════════════════════════════════════
// ANA SAYFA · VERİ KAYNAĞI
// ════════════════════════════════════════════════════════════════════════════
//
// Onaylı ana sayfa tasarımının çektiği ÜÇ veri kümesi burada toplanır:
//
//   1. Profil kartı  — ad, fotoğraf, pozisyon, yaş, takım (arma + renkler)
//   2. Maç şeridi    — yakındaki 3 maç: saha fotoğrafı, saat, mesafe, boş yer
//   3. Bant görseli  — "Saha Kirala" kartının bölgeye göre değişen fotoğrafı
//
// BURADA OLMAYANLAR — ve neden:
//   • Sayaçlar (maç/saha/kaleci/hakem) → `dashboardCountsService.ts`. Zaten
//     vardı ve doğruydu; ikinci bir kopya çıkarmak drift üretir.
//   • Cüzdan bakiyesi → `walletService.getWalletSummary()`. Paranın tek
//     kaynağı orası; ana sayfa kendi hesabını YAPMAZ.
//   • Yaklaşan maç ("Bugün 21:00") → `useMyMatches().closest`. Maçlarım
//     ekranıyla aynı listeden okunur ki iki ekran farklı maç göstermesin.
//
// SAYI KURALI (brifing): canlı veri yoksa rakam BASILMAZ. Bu dosya asla
// "0" uydurmaz — bilinmeyen için `null` döner, metni ekran seçer.
// ════════════════════════════════════════════════════════════════════════════

import { supabase } from '../supabaseClient';
import type { GeoCenter } from './dashboardCountsService';
import type { StoredVariants } from '../utils/imageVariants';

// ── PROFİL KARTI ────────────────────────────────────────────────────────────

export interface HomeTeam {
  id: string;
  name: string;
  crestConfig: unknown;
  color1: string | null;
  color2: string | null;
}

export interface HomeProfile {
  id: string;
  name: string | null;
  avatarUrl: string | null;
  /** `profiles.position` — boşsa ekran "POZİSYON · Seç →" çizer. */
  position: string | null;
  /** Doğum tarihinden hesaplanır; `birthdate` boşsa null. */
  age: number | null;
  /** Kullanıcının AKTİF takımı. Birden çoksa en erken katıldığı. */
  team: HomeTeam | null;
}

/**
 * Doğum tarihinden yaş.
 *
 * Gün/ay geçmediyse bir yaş eksiktir — `getFullYear` farkı tek başına yanlış
 * cevap verir (31 Aralık doğumlu biri 1 Ocak'ta bir yaş büyük görünürdü).
 */
export function ageFromBirthdate(birthdate: string | null | undefined, now: Date = new Date()): number | null {
  if (!birthdate) return null;
  const d = new Date(birthdate);
  if (Number.isNaN(d.getTime())) return null;
  let age = now.getFullYear() - d.getFullYear();
  const beforeBirthday =
    now.getMonth() < d.getMonth() ||
    (now.getMonth() === d.getMonth() && now.getDate() < d.getDate());
  if (beforeBirthday) age -= 1;
  // Bozuk veri (gelecek tarih, 1900 öncesi) sayı olarak basılmasın.
  return age >= 0 && age < 130 ? age : null;
}

export async function fetchHomeProfile(userId: string): Promise<HomeProfile> {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, name, avatar_url, position, birthdate')
    .eq('id', userId)
    .maybeSingle();
  if (error) throw error;

  const team = await fetchHomeTeam(userId);

  return {
    id: userId,
    name: (data?.name as string) ?? null,
    avatarUrl: (data?.avatar_url as string) ?? null,
    position: (data?.position as string)?.trim() || null,
    age: ageFromBirthdate(data?.birthdate as string | null),
    team,
  };
}

/**
 * Kullanıcının aktif takımı.
 *
 * Birden fazla takımda olabilir; ana sayfada TEK arma yeri var. Kural:
 * EN ERKEN katıldığı aktif takım. "Rastgele biri" demek, kullanıcı her
 * açtığında farklı arma görmesi demekti.
 */
async function fetchHomeTeam(userId: string): Promise<HomeTeam | null> {
  const { data, error } = await supabase
    .from('team_members')
    .select('team_id, joined_at, teams!inner(id, name, crest_config, color1, color2, is_archived)')
    .eq('user_id', userId)
    .eq('is_active', true)
    .order('joined_at', { ascending: true })
    .limit(5);
  if (error) throw error;

  const row = (data ?? [])
    .map((r) => (r as unknown as { teams: Record<string, unknown> }).teams)
    .find((t) => t && !t.is_archived);
  if (!row) return null;

  return {
    id: String(row.id),
    name: String(row.name ?? ''),
    crestConfig: row.crest_config,
    color1: (row.color1 as string) ?? null,
    color2: (row.color2 as string) ?? null,
  };
}

// ── MAÇ ŞERİDİ ──────────────────────────────────────────────────────────────

export interface HomeStripMatch {
  id: string;
  startsAt: Date;
  /** Sahanın adı; yoksa maçın konum metni. */
  pitchName: string;
  pitchId: string | null;
  /** Sahanın fotoğrafı — YOKSA null, ekran amblemli yedeğe düşer. */
  photo: { url: string; variants: StoredVariants | null } | null;
  /** Km — kapsam merkezine uzaklık. Bilinmiyorsa null. */
  distanceKm: number | null;
  /** İki tarafın açık slot toplamı. Bilinmiyorsa null (rakam basılmaz). */
  openCount: number | null;
}

interface NearbyMatchRow {
  id: string;
  starts_at: string | null;
  status: string | null;
  visibility: string | null;
  slots: unknown;
  awaySlots: unknown;
  pitch_id: string | null;
  pitch_name: string | null;
  location: string | null;
  distance_km: number | null;
  isDemo?: boolean | null;
}

/** Açık slot sayısı — MatchDiscovery ile AYNI kural (tek dil). */
export function openSlotCount(slots: unknown, awaySlots: unknown): number | null {
  const count = (list: unknown): number | null =>
    Array.isArray(list) ? list.filter((s) => (s as { status?: string })?.status === 'OPEN').length : null;
  const home = count(slots);
  const away = count(awaySlots);
  if (home === null && away === null) return null;
  return (home ?? 0) + (away ?? 0);
}

/** Bugün ya da yarın mı başlıyor? (kullanıcının kendi takvim günü) */
export function isTodayOrTomorrow(d: Date, now: Date = new Date()): boolean {
  const dayKey = (x: Date) => `${x.getFullYear()}-${x.getMonth()}-${x.getDate()}`;
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  return dayKey(d) === dayKey(now) || dayKey(d) === dayKey(tomorrow);
}

/**
 * Şeritteki maçlar + toplam sayı.
 *
 * KAPSAM: "bugün ve yarın" — tasarımdaki hero metni ("6 maç · bugün ve yarın")
 * ve "TÜM MAÇLAR" kartındaki sayı bunu söylüyor. Sayaç servisindeki
 * `countTodayMatches` YALNIZ bugüne bakar; ikisi farklı sorulara cevap verdiği
 * için ayrı duruyorlar, ekranda karıştırılmamalıdır.
 *
 * SIRALAMA: en yakın saat. Kullanıcı ana sayfada "şimdi ne var" diye bakar;
 * mesafeye göre sıralamak, iki gün sonrasını üste taşırdı.
 */
export async function fetchStripMatches(
  centers: GeoCenter[],
  radiusKm: number,
  limit = 3,
  now: Date = new Date(),
): Promise<{ matches: HomeStripMatch[]; total: number }> {
  if (centers.length === 0) return { matches: [], total: 0 };

  const perCenter = await Promise.all(
    centers.map(async (c) => {
      const { data, error } = await supabase.rpc('get_nearby_matches', {
        p_lat: c.lat, p_lon: c.lng, p_radius_km: radiusKm,
      });
      if (error) throw error;
      return (data ?? []) as NearbyMatchRow[];
    }),
  );

  // Bölgeler örtüşebilir; aynı maç iki merkezden dönebilir. Tekilleştirirken
  // EN KISA mesafeyi koru — kullanıcıya en yakın bölgeden bakmak doğrudur.
  const byId = new Map<string, NearbyMatchRow>();
  for (const list of perCenter) {
    for (const row of list) {
      if (!row?.id) continue;
      const prev = byId.get(row.id);
      if (!prev || (row.distance_km ?? Infinity) < (prev.distance_km ?? Infinity)) {
        byId.set(row.id, row);
      }
    }
  }

  const upcoming = Array.from(byId.values())
    .map((row) => ({ row, when: row.starts_at ? new Date(row.starts_at) : null }))
    .filter(({ when }) => !!when && !Number.isNaN(when.getTime()) && when.getTime() > now.getTime())
    .filter(({ when }) => isTodayOrTomorrow(when as Date, now))
    .sort((a, b) => (a.when as Date).getTime() - (b.when as Date).getTime());

  const top = upcoming.slice(0, limit);
  const photos = await fetchPitchPhotos(top.map(({ row }) => row.pitch_id));

  return {
    total: upcoming.length,
    matches: top.map(({ row, when }) => ({
      id: row.id,
      startsAt: when as Date,
      pitchName: (row.pitch_name || row.location || '').trim() || 'Saha',
      pitchId: row.pitch_id,
      photo: (row.pitch_id && photos.get(row.pitch_id)) || null,
      distanceKm: typeof row.distance_km === 'number' ? row.distance_km : null,
      openCount: openSlotCount(row.slots, row.awaySlots),
    })),
  };
}

// ── SAHA FOTOĞRAFLARI ───────────────────────────────────────────────────────

/**
 * Maç kartının fotoğrafı = O MAÇIN OYNANACAĞI SAHANIN KAPAĞI.
 * Statik/uydurma görsel YOK: saha fotoğrafı yoksa `null` döner ve ekran
 * amblemli yedeğe düşer (brifing · madde 2).
 *
 * KAPAK KURALI = sunucudaki `_pitch_image` ile birebir: önce `image`, o boşsa
 * galerinin ilk karesi (`images[0]`). Eskiden burada yalnız `image` okunuyordu;
 * keşif kartı (matches.image ← tetikleyici ← _pitch_image) ve rahat lobi
 * galerisi (`images`) başka kaynaktan beslenince AYNI maç üç ekranda üç farklı
 * fotoğrafla çıkıyordu — kurucu bunu "fotoğraf bir görünüp bir değişiyor" diye
 * raporladı (20 Ağu 2026). Tek kural, tek kapak.
 *
 * `get_nearby_matches` sahanın fotoğrafını döndürmüyor; o RPC'nin dönüş
 * tipini değiştirmek (DROP + CREATE) onu kullanan diğer ekranları riske
 * atardı. Bunun yerine yalnız gereken 3 saha için TEK ek sorgu atılıyor.
 */
export async function fetchPitchPhotos(
  pitchIds: (string | null)[],
): Promise<Map<string, { url: string; variants: StoredVariants | null }>> {
  const ids = Array.from(new Set(pitchIds.filter((x): x is string => !!x)));
  const out = new Map<string, { url: string; variants: StoredVariants | null }>();
  if (ids.length === 0) return out;

  const { data, error } = await supabase
    .from('pitches')
    .select('id, image, images')
    .in('id', ids);
  if (error) throw error;

  const rows = ((data ?? []) as { id: string; image: string | null; images: unknown }[])
    .map((r) => ({ id: r.id, cover: pitchCoverUrl(r.image, r.images) }))
    .filter((r): r is { id: string; cover: string } => !!r.cover);

  const variants = await fetchVariantsByUrl(rows.map((r) => r.cover));
  for (const r of rows) {
    out.set(r.id, { url: r.cover, variants: variants.get(r.cover) ?? null });
  }
  return out;
}

/** Sahanın kapak görseli — sunucudaki `_pitch_image` kuralının istemci ikizi. */
export function pitchCoverUrl(image: string | null | undefined, images: unknown): string | null {
  const tekil = (image ?? '').trim();
  if (tekil) return tekil;
  const ilk = Array.isArray(images) ? images[0] : null;
  const galeri = (typeof ilk === 'string' ? ilk : '').trim();
  return galeri || null;
}

/** Genel adresten bucket içi yola: `.../object/public/images/<yol>` → `<yol>`. */
export function storagePathFromPublicUrl(url: string): string | null {
  const marker = '/storage/v1/object/public/images/';
  const i = url.indexOf(marker);
  if (i < 0) return null;
  const path = url.slice(i + marker.length).split('?')[0];
  return path ? decodeURIComponent(path) : null;
}

/**
 * Verilen adreslerin türetilmiş boyları (varsa).
 * Varyantı olmayan görseller haritada YER ALMAZ; çağıran orijinali tek boy
 * kullanır — eski görseller kırılmaz, sadece optimizasyondan yararlanmaz.
 */
export async function fetchVariantsByUrl(urls: string[]): Promise<Map<string, StoredVariants>> {
  const out = new Map<string, StoredVariants>();
  const byPath = new Map<string, string>();
  for (const u of urls) {
    const p = storagePathFromPublicUrl(u);
    if (p) byPath.set(p, u);
  }
  if (byPath.size === 0) return out;

  const { data, error } = await supabase
    .from('image_variants')
    .select('storage_path, url_1x, url_2x, url_3x, lqip')
    .in('storage_path', Array.from(byPath.keys()));
  if (error) throw error;

  for (const row of (data ?? []) as ({ storage_path: string } & StoredVariants)[]) {
    const url = byPath.get(row.storage_path);
    if (url) out.set(url, { url_1x: row.url_1x, url_2x: row.url_2x, url_3x: row.url_3x, lqip: row.lqip });
  }
  return out;
}

// ── BÖLGE BANT GÖRSELİ ──────────────────────────────────────────────────────

export interface HomeBanner {
  sourceUrl: string;
  variants: StoredVariants | null;
  altText: string | null;
  /** Hangi kademe eşleşti: ilçe · il · varsayılan. Panelde teşhis için. */
  scope: 'DISTRICT' | 'CITY' | 'DEFAULT';
}

/** Ana sayfa bant yuvaları: Saha Kirala + Maç Kur (kurucu kararı, 20 Ağu 2026). */
export type HomeBannerSlot = 'PITCH_RENT' | 'MATCH_CREATE';

/**
 * Ana sayfa kartlarının sağındaki fotoğraf bandı (yuvaya göre).
 * Kademe çözümlemesi SUNUCUDA (ilçe → il → varsayılan); istemci hangi kademede
 * olduğunu bilmek zorunda değil. Görsel, yönetici panelindeki "Ana Sayfa
 * Görselleri" sayfasından yuva + bölge seçilerek atanır.
 */
export async function fetchHomeBanner(
  city: string | null,
  district: string | null,
  slot: HomeBannerSlot = 'PITCH_RENT',
): Promise<HomeBanner | null> {
  const { data, error } = await supabase.rpc('home_banner_for_region', {
    p_city: city,
    p_district: district,
    p_slot: slot,
  });
  if (error) throw error;

  const row = (Array.isArray(data) ? data[0] : data) as {
    source_url?: string; url_1x?: string; url_2x?: string; url_3x?: string;
    lqip?: string; alt_text?: string; scope?: HomeBanner['scope'];
  } | null | undefined;
  if (!row?.source_url) return null;

  return {
    sourceUrl: row.source_url,
    variants: row.url_1x
      ? { url_1x: row.url_1x, url_2x: row.url_2x ?? null, url_3x: row.url_3x ?? null, lqip: row.lqip ?? null }
      : null,
    altText: row.alt_text ?? null,
    scope: row.scope ?? 'DEFAULT',
  };
}
