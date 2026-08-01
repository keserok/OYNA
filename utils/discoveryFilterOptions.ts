// Top Oyna filtre seçenekleri — YALNIZ listelenen açık maçlarda fiilen bulunan
// değerlerden türetilir; sunulan her seçenek en az bir maçla eşleşir.
// (Saf fonksiyonlar: birim testleri tests/unit/discoveryFilterOptions.test.ts)
//
// NEDEN TÜRETİLİR, SABİT LİSTE DEĞİL: sabit listeler veritabanının gerçek
// sözlüğünden sapıyordu. Örnek: yaş filtresi '10-14 … 35+' sunuyordu ama
// kayıtlardaki değer '18-35'ti — seçilen hiçbir yaş hiçbir maçla eşleşmiyordu.

import { realMatchMinutes } from '../shared/matchTiming';
import { normalizeRole } from '../shared/lobbyEnrichment';

export const FORMAT_VALUES = ['3v3', '4v4', '5v5', '6v6', '7v7', '8v8', '9v9', '10v10', '11v11'];
export const MENTALITY_VALUES = ['Ciddi', 'Taktiksel', 'Rahat'];
export const ROLE_IDS = ['KL', 'SAV', 'ORT', 'HÜC'];
export const ROLE_LABEL_MAP: Record<string, string> = {
  'HÜC': 'HÜCUM',
  'ORT': 'ORTA SAHA',
  'SAV': 'SAVUNMA',
  'KL': 'KALECİ',
};

/** slots[].role kodları ('GK'|'DEF'|'MID'|'FWD') → filtre rol kimlikleri. */
const SLOT_ROLE_TO_ID: Record<'GK' | 'DEF' | 'MID' | 'FWD', string> = {
  GK: 'KL', DEF: 'SAV', MID: 'ORT', FWD: 'HÜC',
};

/** Kişi başı ücret kovaları — sınırlar burada TEK yerde tanımlı. */
export interface BudgetBucket { id: string; label: string; min: number; max: number }
export const BUDGET_BUCKETS: BudgetBucket[] = [
  { id: 'free', label: 'Ücretsiz', min: 0, max: 0 },
  { id: 'u150', label: '150₺ ve Altı', min: 1, max: 150 },
  { id: '150-250', label: '150-250₺', min: 150, max: 250 },
  { id: '250-350', label: '250-350₺', min: 250, max: 350 },
  { id: 'o350', label: '350₺ ve Üzeri', min: 350, max: Infinity },
];

export function matchInBudget(match: any, bucketId: string): boolean {
  const b = BUDGET_BUCKETS.find((x) => x.id === bucketId);
  if (!b) return true;
  const price = Number(match?.price) || 0;
  if (b.id === 'free') return price === 0;
  if (b.id === 'u150') return price > 0 && price <= 150;
  return price >= b.min && (b.max === Infinity ? true : price <= b.max);
}

export interface DiscoveryFilterOptions {
  formats: string[];
  mentalities: string[];
  roles: string[];
  genders: string[];
  ageGroups: string[];
  durations: number[];
  budgets: BudgetBucket[];
}

/** Maçın iki tarafındaki tüm slotlar (ev + deplasman). */
function allSlots(match: any): any[] {
  const home = Array.isArray(match?.slots) ? match.slots : [];
  const away = Array.isArray(match?.awaySlots) ? match.awaySlots : [];
  return [...home, ...away];
}

/** Maçta AÇIK (dolmamış) slot var mı? — 'Boş kontenjan' filtresi bunu kullanır. */
export function hasOpenSlot(match: any): boolean {
  return allSlots(match).some((s: any) => s?.status === 'OPEN');
}

/**
 * Rolün AÇIK slotu var mı?
 *
 * ÖNCE gerçek slot verisi (`slots` + `awaySlots`) okunur: veritabanında roller
 * 'GK'|'DEF'|'MID'|'FWD' kodlarıyla, durum 'OPEN'|'TAKEN' olarak durur.
 * Eskiden yalnız `missingPositions` okunuyordu; o kolon kayıtlarda BOŞ ([]) ve
 * Top Oyna listesi onu her maç için boş diziyle eziyordu — POZİSYON filtresi
 * bu yüzden hiçbir zaman seçenek üretmiyor, sürekli pasif kalıyordu.
 *
 * `missingPositions` yedek olarak korunur (admin paneli onu doldurur):
 * jenerik 'OYUNCU' satırı her SAHA oyuncusunu karşılar, kaleciyi karşılamaz.
 */
export function roleHasOpenSlot(match: any, roleId: string): boolean {
  const slots = allSlots(match);
  if (slots.length > 0) {
    return slots.some((s: any) => {
      if (s?.status !== 'OPEN') return false;
      return SLOT_ROLE_TO_ID[normalizeRole(s?.role)] === roleId;
    });
  }

  const targetRole = ROLE_LABEL_MAP[roleId];
  const isOutfield = roleId !== 'KL';
  return !!match?.missingPositions?.some((p: any) => {
    if (Number(p.count) <= 0) return false;
    if (p.role === targetRole) return true;
    if (isOutfield && p.role === 'OYUNCU') return true;
    return false;
  });
}

/** Metin değerleri tekilleştirip görülme sırasını korur (boş/temizsizleri atar). */
function distinctText(list: any[], pick: (m: any) => unknown): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  list.forEach((m) => {
    const raw = pick(m);
    const v = typeof raw === 'string' ? raw.trim() : '';
    if (!v) return;
    const key = v.toLocaleLowerCase('tr-TR');
    if (seen.has(key)) return;
    seen.add(key);
    out.push(v);
  });
  return out;
}

export function deriveDiscoveryFilterOptions(matches: any[]): DiscoveryFilterOptions {
  const list = matches ?? [];
  const formats = FORMAT_VALUES.filter((f) =>
    list.some((m) => String(m?.format || '').toLowerCase() === f.toLowerCase())
  );
  // enhancedMatches, difficulty'yi tam olarak 'Ciddi' | 'Taktiksel' | 'Rahat'
  // uzayına normalize eder; birebir eşitlik yeterlidir.
  const mentalities = MENTALITY_VALUES.filter((v) => list.some((m) => m?.difficulty === v));
  const roles = ROLE_IDS.filter((r) => list.some((m) => roleHasOpenSlot(m, r)));

  // Cinsiyet ve yaş: kanonik liste YOK — veritabanında ne varsa o. 'Tümü'
  // bir kısıt değil "fark etmez" demektir; filtre seçeneği olarak sunulmaz.
  const genders = distinctText(list, (m) => m?.gender).sort((a, b) => a.localeCompare(b, 'tr-TR'));
  const ageGroups = distinctText(list, (m) => m?.ageGroup)
    .filter((a) => a.toLocaleLowerCase('tr-TR') !== 'tümü')
    .sort((a, b) => a.localeCompare(b, 'tr-TR', { numeric: true }));

  // Süre: serbest metin değil GERÇEK dakika (matches.duration_minutes).
  const durations = Array.from(
    new Set(list.map((m) => realMatchMinutes(m)).filter((n): n is number => n !== null))
  ).sort((a, b) => a - b);

  const budgets = BUDGET_BUCKETS.filter((b) => list.some((m) => matchInBudget(m, b.id)));

  return { formats, mentalities, roles, genders, ageGroups, durations, budgets };
}
