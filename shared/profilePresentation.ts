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
/**
 * Maç geçmişinden Maç / Galibiyet / %Galibiyet.
 *
 * IP-18: `winRate` artık YALNIZ skoru girilmiş maçlar üzerinden hesaplanır.
 * Skoru hiç girilmemiş maçlar (auto_finalize_matches cron'u) eskiden paydaya
 * giriyor ve oranı sulandırıyordu — 30 skorsuz maçı olan oyuncu profilinde
 * kocaman yeşil "%0" görüyordu. Hiç skorlu maç yoksa `null` döner; ekran
 * "%0" değil "—" yazar, çünkü sıfır başarı ile veri yokluğu aynı şey değildir.
 */
export const winStats = (
    results: Array<{ result: 'WIN' | 'LOSS' | 'DRAW' | 'NO_SCORE' }>,
): { total: number; scoredTotal: number; wins: number; winRate: number | null } => {
    const total = results.length;
    const skorlu = results.filter(m => m.result !== 'NO_SCORE');
    const wins = skorlu.filter(m => m.result === 'WIN').length;
    return {
        total,
        scoredTotal: skorlu.length,
        wins,
        winRate: skorlu.length > 0 ? Math.round((wins / skorlu.length) * 100) : null,
    };
};
