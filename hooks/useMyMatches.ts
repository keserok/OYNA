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
  const { adminMatches, myMatches } = useAppStore();
  // Demo 'u1' fallback'i YOK: oturum yoksa (misafir) liste boştur — başka
  // kullanıcıların verisi asla "benim maçlarım" gibi görünmez.
  const currentUserUid = auth.currentUser?.uid ?? '';

  const all = useMemo(() => {
    if (!currentUserUid) return [];
    // Yalnızca KULLANICININ maçları: kurucu olduğu, bir slotta OTURDUĞU
    // (occupant/player), slot SATIN ALDIĞI (purchasedBy — REZERVE dolduran
    // alıcı ajandadan asla düşmez; tek lobi P4) veya yedekte olduğu maçlar.
    const mine = (s: any) =>
      s?.player?.id === currentUserUid ||
      s?.occupant === currentUserUid ||
      s?.purchasedBy === currentUserUid;
    const yerelFiltre = adminMatches.filter(m =>
      m.creatorId === currentUserUid ||
      m.slots?.some(mine) ||
      m.awaySlots?.some(mine) ||
      m.reservePlayers?.some(p => p?.id === currentUserUid)
    );

    // [P-5 / M-P0-6] İKİ KAYNAĞIN BİRLEŞİMİ.
    // myMatches sunucudan KAPSAMLI gelir (get_my_matches); yerelFiltre ise
    // global listenin telefonda süzülmesidir. Birleşim alınıyor çünkü:
    //   • Global liste ileride daraltılacak → yerelFiltre eksik kalabilir
    //   • Scoped sorgu bir sebeple boş dönerse → yerelFiltre devreye girer
    // Böylece hiçbir maç KAYBOLAMAZ (Çakışma-1'in doğruluk şartı).
    // Aynı maç iki kaynakta da varsa, sunucudan gelen (daha taze) kazanır.
    const birlesim = new Map<string, MatchListing>();
    yerelFiltre.forEach(m => { if (m?.id) birlesim.set(m.id, m); });
    myMatches.forEach(m => { if (m?.id) birlesim.set(m.id, m); });
    return Array.from(birlesim.values());
  }, [adminMatches, myMatches, currentUserUid]);

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
