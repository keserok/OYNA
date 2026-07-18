// Top Oyna filtre seçenekleri — YALNIZ listelenen açık maçlarda fiilen bulunan
// değerlerden türetilir; sunulan her seçenek en az bir maçla eşleşir.
// (Saf fonksiyonlar: birim testleri tests/unit/discoveryFilterOptions.test.ts)

export const FORMAT_VALUES = ['3v3', '4v4', '5v5', '6v6', '7v7', '8v8', '9v9', '10v10', '11v11'];
export const MENTALITY_VALUES = ['Ciddi', 'Taktiksel', 'Rahat'];
export const ROLE_IDS = ['KL', 'SAV', 'ORT', 'HÜC'];
export const ROLE_LABEL_MAP: Record<string, string> = {
  'HÜC': 'HÜCUM',
  'ORT': 'ORTA SAHA',
  'SAV': 'SAVUNMA',
  'KL': 'KALECİ',
};

export interface DiscoveryFilterOptions {
  formats: string[];
  mentalities: string[];
  roles: string[];
}

// checkMatchFilters'ın pozisyon semantiğiyle birebir: rolün açık slotu var mı?
// Jenerik 'OYUNCU' (PLAYER) slotu her SAHA oyuncusu pozisyonunu karşılar, kaleciyi karşılamaz.
export function roleHasOpenSlot(match: any, roleId: string): boolean {
  const targetRole = ROLE_LABEL_MAP[roleId];
  const isOutfield = roleId !== 'KL';
  return !!match?.missingPositions?.some((p: any) => {
    if (Number(p.count) <= 0) return false;
    if (p.role === targetRole) return true;
    if (isOutfield && p.role === 'OYUNCU') return true;
    return false;
  });
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
  return { formats, mentalities, roles };
}
