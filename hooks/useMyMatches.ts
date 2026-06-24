import { useMemo } from 'react';
import { useAppStore, IS_LOCAL_DEV } from '../store';
import { MATCH_LISTINGS } from '../constants';
import { auth } from '../supabaseAuth';
import type { MatchListing } from '../types';

const DEMO_UID = 'u1';

const parseMatchDate = (date: string, time: string): Date | null => {
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
  const currentUserUid = auth.currentUser?.uid || DEMO_UID;

  const all = useMemo(() => {
    // In dev mode: always show demo matches (u1 slots) + real matches for actual user
    if (IS_LOCAL_DEV) {
      const demoMatches = MATCH_LISTINGS.filter(m =>
        m.slots?.some(s => s.player?.id === DEMO_UID) ||
        m.awaySlots?.some(s => s.player?.id === DEMO_UID)
      );
      // Also include real DB matches for the actual user (if different from u1)
      if (currentUserUid !== DEMO_UID) {
        const demoIds = new Set(demoMatches.map(m => m.id));
        const realMatches = adminMatches.filter(m =>
          !demoIds.has(m.id) && (
            m.slots?.some(s => s.player?.id === currentUserUid) ||
            m.awaySlots?.some(s => s.player?.id === currentUserUid)
          )
        );
        return [...demoMatches, ...realMatches];
      }
      return demoMatches;
    }

    // Prod mode: only real DB matches where user is a player
    return adminMatches.filter(m => {
      if (m.status === 'DRAFT' || m.status === 'CANCELLED') return true;
      return (
        m.slots?.some(s => s.player?.id === currentUserUid) ||
        m.awaySlots?.some(s => s.player?.id === currentUserUid)
      );
    });
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
