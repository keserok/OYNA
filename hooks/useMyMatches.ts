import { useMemo } from 'react';
import { useAppStore } from '../store';
import { auth } from '../supabaseAuth';
import type { MatchListing } from '../types';
import { parseMatchDateTime } from '../utils/matchDateTime';

const DEMO_UID = 'u1';

// Tek ayrıştırma kaynağı: ISO + gün.ay.yıl + TR gün adları + saat aralıkları,
// asla NaN (İP-14 SSOT). EXPORT: useCountdown ve useMyAgenda da buradan kullanır.
export const parseMatchDate = (date: string, time: string): Date | null =>
  parseMatchDateTime(date, time);

export interface MyMatchesResult {
  all: MatchListing[];
  upcoming: MatchListing[];
  cancelled: MatchListing[];
  closest: MatchListing | null;
  currentUserUid: string;
}

export function useMyMatches(): MyMatchesResult {
  const { adminMatches } = useAppStore();
  // Demo 'u1' fallback'i YOK: oturum yoksa (misafir) liste boştur — başka
  // kullanıcıların verisi asla "benim maçlarım" gibi görünmez.
  const currentUserUid = auth.currentUser?.uid ?? '';

  const all = useMemo(() => {
    if (!currentUserUid) return [];
    // Yalnızca KULLANICININ maçları: bir slotta oyuncu olduğu, kendi oluşturduğu
    // (kaptan yönetimi — taslak/iptal dahil) VEYA yedek listesinde olduğu (B14)
    // maçlar. Başkalarının taslak/iptal maçları listeye sızmaz (main düzeltmesi).
    return adminMatches.filter(m =>
      m.creatorId === currentUserUid ||
      m.slots?.some(s => s.player?.id === currentUserUid) ||
      m.awaySlots?.some(s => s.player?.id === currentUserUid) ||
      m.reservePlayers?.some(p => p?.id === currentUserUid)
    );
  }, [adminMatches, currentUserUid]);

  const upcoming = useMemo(() => {
    return all
      .filter(m => m.status !== 'CANCELLED')
      .sort((a, b) => {
        const da = parseMatchDate(a.date, a.time)?.getTime() ?? Infinity;
        const db = parseMatchDate(b.date, b.time)?.getTime() ?? Infinity;
        return da - db;
      });
  }, [all]);

  const cancelled = useMemo(() => all.filter(m => m.status === 'CANCELLED'), [all]);

  const closest = useMemo(() => {
    const now = Date.now();
    return upcoming.find(m => {
      const d = parseMatchDate(m.date, m.time);
      return d && d.getTime() > now;
    }) ?? upcoming[0] ?? null;
  }, [upcoming]);

  return { all, upcoming, cancelled, closest, currentUserUid };
}
