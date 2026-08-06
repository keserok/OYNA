// ════════════════════════════════════════════════════════════════════════════
// KALECİ VE HAKEM TARZLARI — UYGULAMA GENELİNDE TEK KAYNAK
// ════════════════════════════════════════════════════════════════════════════
//
// KURUCU KARARI (2026-08-06):
//   "Kalecilerin arayüzünde sweeper keeper gibi hiçbir yerden ayarlanamayan
//    verilerin olduğu kısmı sil ve kalecilere verilen isimlendirme ve seçim
//    ekranını kalecilerin bilgilerim ekranından ayarlanmasını ve aynı zamanda
//    admin panelinden düzenlenmesini sağla. ... Bu değerlerden istenirse biri
//    veya ikisi seçilebilir olsun, veritabanı bağlantısını sağlam kur.
//    Aynısını hakemler için de yap."
//
// NEYİN YERİNE GELDİ: Kaleciler için `stats`/`skills` JSON'unda altı sayı
// duruyordu (diving, reflexes, positioning, distribution, oneOnOne,
// aerialReach) ve ekranda çubuk çubuk çiziliyordu. Bu sayıları KİMSE
// giremiyordu: kalecinin kendi ekranında alan yoktu, oyuncu oyu onları
// beslemiyordu, tek kaynak yönetim panelinde elle yazılan tohum veriydi.
// Yani ekranda "veri" gibi duran ama arkasında ölçüm olmayan bir yüzeydi.
// Yerine kalecinin KENDİ BEYAN ETTİĞİ, sonlu ve anlaşılır bir tarz listesi
// geldi.
//
// KURAL: en az 0, en fazla 2 tarz. Sıfır da geçerlidir (henüz seçmemiş
// kaleci "tarz belirtilmedi" görünür — uydurma bir varsayılan atanmaz).
//
// VERİTABANI BAĞI: `goalkeepers.styles` ve `referees.styles` (text[]).
// Aşağıdaki listeler veritabanındaki CHECK kısıtıyla BİREBİR aynı olmak
// zorunda; tests/unit/saglayiciTarzlari.test.ts bunu kilitler. Liste burada
// değişirse migration da değişmeli, yoksa kullanıcı seçtiği tarzı
// kaydedemez ("violates check constraint").
// ════════════════════════════════════════════════════════════════════════════

/** Kaleci tarzları — kurucunun verdiği sıra korunur. */
export const GK_STYLES = [
  'Çizgi Kalecisi',
  'Gezici Kaleci',
  'Oyun Kurucu Kaleci',
  'Hava Hakimiyeti Yüksek Kaleci',
  'Birebir Uzmanı',
  'Savunma Komutanı',
  'Soğukkanlı Kaleci',
] as const;

/** Hakem tarzları — kurucunun verdiği sıra korunur. */
export const REF_STYLES = [
  'Disiplinci',
  'Oyunu Akıtan',
  'VAR Uzmanı',
  'Kuralcı',
  'İletişimci',
  'Soğukkanlı',
] as const;

export type GkStyle = (typeof GK_STYLES)[number];
export type RefStyle = (typeof REF_STYLES)[number];
export type ProviderStyle = GkStyle | RefStyle;

/** Bir sağlayıcının seçebileceği en fazla tarz sayısı (kurucu: "biri veya ikisi"). */
export const MAX_PROVIDER_STYLES = 2;

/** Hangi tarafın listesi? 'GK' = kaleci, 'REF' = hakem. */
export type ProviderKind = 'GK' | 'REF';

/** İlgili tarafın tarz listesi. */
export const stylesFor = (kind: ProviderKind): readonly string[] =>
  kind === 'GK' ? GK_STYLES : REF_STYLES;

/**
 * Gelen ham değeri kanonik listeye indirger.
 *
 * NEDEN GEREKLİ: veritabanında bu alan yıllardır serbest metin `style`
 * kolonuydu ve içinde 'Panter', 'Klasik Kaleci' gibi eski değerler var. Bu
 * fonksiyon listede OLMAYAN her şeyi atar — ekranda tanınmayan bir etiket
 * çizmektense hiç çizmemek doğrudur. Tekrarları da eler ve en fazla ikiye
 * kırpar; sunucu zaten reddederdi ama kullanıcı hatayı butona basınca değil
 * seçerken görmeli.
 */
export function normalizeStyles(kind: ProviderKind, raw: unknown): string[] {
  const izinli = stylesFor(kind);
  const liste = Array.isArray(raw) ? raw : (typeof raw === 'string' ? [raw] : []);
  const out: string[] = [];
  for (const v of liste) {
    if (typeof v !== 'string') continue;
    const eslesen = izinli.find((s) => s === v.trim());
    if (!eslesen || out.includes(eslesen)) continue;
    out.push(eslesen);
    if (out.length >= MAX_PROVIDER_STYLES) break;
  }
  return out;
}

/**
 * Sağlayıcı kaydından ekranda gösterilecek tarzları çıkarır.
 *
 * `styles` (yeni, çoklu) önce okunur. Boşsa ESKİ `style` metnine düşülür —
 * ama yalnız kanonik listeye uyuyorsa. 'Panter' gibi eski serbest metinler
 * sessizce düşer; ekranda artık desteklenmeyen bir etiket görünmez.
 */
export function providerStyles(kind: ProviderKind, provider: unknown): string[] {
  const p = (provider ?? {}) as { styles?: unknown; style?: unknown };
  const yeni = normalizeStyles(kind, p.styles);
  if (yeni.length > 0) return yeni;
  return normalizeStyles(kind, p.style);
}
