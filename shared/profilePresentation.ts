// ════════════════════════════════════════════════════════════════════════
// PROFİL SUNUM TÜRETMELERİ — TEK KAYNAK
// ProfileScreen (tüketici) ve admin panelin Kullanıcı Profili Aynası aynı
// görünümü üretmek için AYNI türetme mantığını kullanır (drift yok).
// Saf fonksiyonlar: store/servis/auth bağımlılığı yoktur.
// ════════════════════════════════════════════════════════════════════════
import type { PlayerCardData } from '../types';
import type { OynaUser } from '../services/userService';
import { ratingToOverall, tierForOverall } from '../utils/ratingScale';

const DEFAULT_CARD_STAT = { value: 50, videoUrl: null };

/**
 * Profilden kart verisi üretir. playerCard YALNIZCA tam (stats + overall
 * içeriyorsa) kullanılır; eksik/kısmi kart (ör. yalnız tier/position)
 * PlayerCard'ı çökertirdi (stats.shooting undefined).
 * Rookie ayrımı: hiç maç oynamamış oyuncu için sahte OVR gösterilmez —
 * güvenilir sinyal profiles.match_count (stats.matchesPlayed).
 */
export const buildCardData = (profile: OynaUser | null, wins: number, total: number): PlayerCardData => {
    const pc = profile?.playerCard as Partial<PlayerCardData> | undefined;
    if (pc && pc.stats && typeof pc.overall === 'number') {
        return pc as PlayerCardData;
    }
    const matchesForCard = profile?.stats?.matchesPlayed ?? total;
    const overallOrNull = ratingToOverall(profile?.stats?.rating, matchesForCard);
    const rookie = overallOrNull === null;
    const overall = overallOrNull ?? 0;
    return {
        overall,
        isRookie: rookie,
        tier: rookie ? 'bronze' : (tierForOverall(overallOrNull) as 'gold' | 'silver' | 'bronze'),
        isStatsVerified: false,
        diamondValue: 0,
        winCount: wins,
        totalMatches: matchesForCard,
        stats: {
            pace: { ...DEFAULT_CARD_STAT },
            shooting: { ...DEFAULT_CARD_STAT },
            passing: { ...DEFAULT_CARD_STAT },
            dribbling: { ...DEFAULT_CARD_STAT },
            defense: { ...DEFAULT_CARD_STAT },
            physical: { ...DEFAULT_CARD_STAT },
        }
    };
};

/** Tier admin-atamalı (Q24): kart aktifken admin'in seçtiği tier rookie'yi ezer. */
export const applyCardTierOverride = (card: PlayerCardData, profile: OynaUser | null): PlayerCardData =>
    profile?.cardTier ? { ...card, tier: profile.cardTier, isRookie: false } : card;

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
