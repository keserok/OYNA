import { useMemo } from 'react';
import { useAppStore } from '../store';
import { auth } from '../supabaseAuth';
import type { MatchListing } from '../types';

// 'Bugün'/'Yarın' gibi eski serbest tarih metinlerini de ISO tarihleri de anlar.
// useCountdown ve useMyAgenda tarafından da paylaşılır.
export const parseMatchDate = (date: string, time: string): Date | null => {
  try {
    if (date.includes('-')) return new Date(`${date}T${time}:00`);
    const d = new Date();
    const [h, m] = time.split(':').map(Number);
    d.setHours(h, m, 0, 0);
    if (date === 'Yarın') d.setDate(d.getDate() + 1);
    return d;
  } catch {
    return null;
  }
};

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
    // Yalnızca KULLANICININ maçları: bir slotta oyuncu olduğu VEYA kendi
    // oluşturduğu (kaptan yönetimi) maçlar. Taslak/iptaller de bu kurala tabi —
    // başkalarının taslak/iptal maçları listeye sızmaz.
    return adminMatches.filter(m =>
      m.creatorId === currentUserUid ||
      m.slots?.some(s => s.player?.id === currentUserUid) ||
      m.awaySlots?.some(s => s.player?.id === currentUserUid)
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
