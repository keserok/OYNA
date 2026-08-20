// Bölge görünürlük kuralları (region_visibility_rules) — keşif süzgeci.
//
// Kurucu kararı (20 Ağu 2026): "Beşiktaş'taki kullanıcı Sarıyer'deki maçları
// görsün ama Beylikdüzü'ndekileri görmesin" sistemi panelden kurulur; uygulama
// burada okur ve keşif listelerini (maç + saha) süzer.
//
// GÜVENLİ VARSAYILAN — FAIL-OPEN: kural okunamazsa, kullanıcının bölgesi
// bilinmiyorsa (GPS/il-geneli seçim) ya da seçili bölgelerden herhangi biri
// KURALSIZSA kısıtlama uygulanmaz; mevcut yarıçap keşfi aynen çalışır. Kurallar
// ilçe başına isteğe bağlı devreye girer, yanlış yapılandırma vitrini boşaltamaz.
import { supabase } from '../supabaseClient';

export interface RegionRef {
  city: string;
  district?: string | null;
}

export interface RegionVisibilityRuleRow {
  city: string;
  district: string;
  visible_city: string;
  visible_district: string;
}

export interface VisibilityScope {
  /** false → hiçbir süzgeç uygulanmaz (kural yok / bölge bilinmiyor). */
  restricted: boolean;
  /** "il::ilçe" (normalize) izin anahtarları. */
  allowedFull: Set<string>;
  /** Yalnız ilçe (normalize) — il bilgisi taşımayan eski satırlar için yedek. */
  allowedDistrict: Set<string>;
}

export const UNRESTRICTED_SCOPE: VisibilityScope = {
  restricted: false,
  allowedFull: new Set(),
  allowedDistrict: new Set(),
};

/** Türkçe yerel küçük harfe indirger — 'Sarıyer' / 'SARIYER' aynı anahtara düşer. */
const norm = (s: string | null | undefined): string => (s ?? '').trim().toLocaleLowerCase('tr-TR');

// Kısa süreli modül önbelleği: keşif ekranı her bölge değişiminde ağa çıkmasın.
let cache: { at: number; rows: RegionVisibilityRuleRow[] } | null = null;
const CACHE_TTL_MS = 5 * 60_000;

export async function fetchVisibilityRules(force = false): Promise<RegionVisibilityRuleRow[]> {
  if (!force && cache && Date.now() - cache.at < CACHE_TTL_MS) return cache.rows;
  try {
    const { data, error } = await supabase
      .from('region_visibility_rules')
      .select('city, district, visible_city, visible_district')
      .eq('is_active', true);
    if (error) throw error;
    cache = { at: Date.now(), rows: (data ?? []) as RegionVisibilityRuleRow[] };
    return cache.rows;
  } catch {
    // Okuma düşerse eski önbellek (varsa) kullanılır; o da yoksa kural yok sayılır.
    return cache?.rows ?? [];
  }
}

/** Testler ve panel-sonrası tazeleme için önbelleği düşür. */
export function invalidateVisibilityCache(): void {
  cache = null;
}

/**
 * Kullanıcının seçili bölgelerinden görünürlük kapsamı üretir.
 * Kapsam ancak TÜM seçili bölgeler ilçeliyse ve HEPSİNDE kural varsa kısıtlar;
 * tek bir kuralsız/il-geneli seçim tüm kısıtı kaldırır (fail-open — kuralsız
 * bölgenin maçlarını gizlemek yanlış olurdu, hangi maçın hangi bölge
 * merkezinden geldiği istemcide bilinmez).
 */
export function buildVisibilityScope(
  regions: RegionRef[],
  rules: RegionVisibilityRuleRow[],
): VisibilityScope {
  const named = regions.filter((r) => norm(r.city) !== '');
  if (named.length === 0) return UNRESTRICTED_SCOPE;             // GPS keşfi
  if (named.some((r) => norm(r.district) === '')) return UNRESTRICTED_SCOPE; // il-geneli seçim

  const bySource = new Map<string, RegionVisibilityRuleRow[]>();
  for (const r of rules) {
    const k = `${norm(r.city)}::${norm(r.district)}`;
    const list = bySource.get(k);
    if (list) list.push(r);
    else bySource.set(k, [r]);
  }

  const allowedFull = new Set<string>();
  const allowedDistrict = new Set<string>();
  for (const reg of named) {
    const key = `${norm(reg.city)}::${norm(reg.district)}`;
    const list = bySource.get(key);
    if (!list || list.length === 0) return UNRESTRICTED_SCOPE;   // kuralsız bölge → kısıt yok
    // Kendi ilçesi HER ZAMAN görünür (sunucu bunu izin listesine yazmaz).
    allowedFull.add(key);
    allowedDistrict.add(norm(reg.district));
    for (const t of list) {
      allowedFull.add(`${norm(t.visible_city)}::${norm(t.visible_district)}`);
      allowedDistrict.add(norm(t.visible_district));
    }
  }
  return { restricted: true, allowedFull, allowedDistrict };
}

/**
 * Bir maç/saha görünür mü? İlçesi bilinmeyen kayıt GİZLENMEZ (fail-open):
 * kötü veri yüzünden vitrinden maç düşürmek, fazladan maç göstermekten kötüdür.
 */
export function isPlaceVisible(
  scope: VisibilityScope,
  city: string | null | undefined,
  district: string | null | undefined,
): boolean {
  if (!scope.restricted) return true;
  const d = norm(district);
  if (d === '') return true;
  const c = norm(city);
  if (c !== '') return scope.allowedFull.has(`${c}::${d}`);
  return scope.allowedDistrict.has(d);
}
