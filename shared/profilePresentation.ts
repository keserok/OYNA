// ════════════════════════════════════════════════════════════════════════
// PROFİL SUNUM TÜRETMELERİ — TEK KAYNAK
// ProfileScreen (tüketici) ve admin panelin Kullanıcı Profili Aynası aynı
// görünümü üretmek için AYNI türetme mantığını kullanır (drift yok).
// Saf fonksiyonlar: store/servis/auth bağımlılığı yoktur.
// ════════════════════════════════════════════════════════════════════════

/** Doğum tarihinden yaş; 5–120 aralığı dışı null (bozuk/seed veri koruması). */
export const ageFromBirthdate = (birthdate?: string | null): number | null => {
    if (!birthdate) return null;
    const d = new Date(birthdate);
    if (isNaN(d.getTime())) return null;
    const now = new Date();
    let age = now.getFullYear() - d.getFullYear();
    const m = now.getMonth() - d.getMonth();
    if (m < 0 || (m === 0 && now.getDate() < d.getDate())) age--;
    return age >= 5 && age < 120 ? age : null;
};

// Eski/seed verideki enum-biçimli mevkileri okunur hale getirir ("SAG_KANAT" → "Sağ Kanat").
const POSITION_WORDS: Record<string, string> = {
    SAG: 'Sağ', SOL: 'Sol', KANAT: 'Kanat', ORTA: 'Orta', SAHA: 'Saha',
    KALECI: 'Kaleci', STOPER: 'Stoper', BEK: 'Bek', FORVET: 'Forvet', SANTRFOR: 'Santrfor',
};
export const formatPosition = (pos?: string | null): string | null => {
    if (!pos) return null;
    if (!/^[A-Z_ÇĞİÖŞÜ]+$/.test(pos)) return pos; // serbest metin — dokunma
    return pos.split('_').map(w => POSITION_WORDS[w] || (w.charAt(0) + w.slice(1).toLocaleLowerCase('tr-TR'))).join(' ');
};

/** Güven puanı: DB'de 0–5, ekranda 0–100. */
export const trustScoreTo100 = (trustScore?: number | null): number =>
    Math.round((trustScore ?? 5) * 20);

/** Maç geçmişinden Maç/Galibiyet/%Galibiyet üçlüsü. */
export const winStats = (results: Array<{ result: 'WIN' | 'LOSS' | 'DRAW' }>): { total: number; wins: number; winRate: number } => {
    const total = results.length;
    const wins = results.filter(m => m.result === 'WIN').length;
    return { total, wins, winRate: total > 0 ? Math.round((wins / total) * 100) : 0 };
};
