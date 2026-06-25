import type { MatchListing, PositionSlot } from '../../types';

export interface AdminMatchRow {
  id: string;
  title: string | null;
  location: string | null;
  date: string | null;
  time: string | null;
  price: number | null;
  difficulty: string | null;
  status: string | null;
  format: string | null;
  image: string | null;
  minRating: number | null;
  badges: unknown;
  missingPositions: unknown;
  slots: unknown;
  away_slots: unknown;
  refereeId: string | null;
  creatorId: string | null;
  isDemo: boolean | null;
  cancel_reason: string | null;
  refund_status: string | null;
  created_at: string | null;
  total_count?: number;
}

function parseJsonArray<T>(val: unknown, fallback: T[] = []): T[] {
  if (Array.isArray(val)) return val as T[];
  if (typeof val === 'string') {
    try { return JSON.parse(val) as T[]; } catch { return fallback; }
  }
  return fallback;
}

function normalizeStatus(raw: string | null | undefined): MatchListing['status'] {
  const s = (raw || 'ACTIVE').toUpperCase();
  if (s === 'OPEN' || s === 'CONFIRMED') return 'ACTIVE';
  if (s === 'CANCELLED' || s === 'CANCELED') return 'CANCELLED';
  if (s === 'COMPLETED' || s === 'DONE') return 'COMPLETED';
  if (s === 'LIVE') return 'LIVE';
  if (s === 'DRAFT') return 'DRAFT';
  return 'ACTIVE';
}

function normalizeDifficulty(raw: string | null | undefined): MatchListing['difficulty'] {
  const d = (raw || 'Rahat').toLowerCase();
  if (d.includes('ciddi') || d === 'hard') return 'Ciddi';
  if (d.includes('taktik') || d === 'medium' || d === 'orta') return 'Taktiksel';
  return 'Rahat';
}

function formatDateLabel(dateVal: string | null): string {
  if (!dateVal) return 'Bugün';
  try {
    const d = new Date(dateVal);
    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    if (d.toDateString() === today.toDateString()) return 'Bugün';
    if (d.toDateString() === tomorrow.toDateString()) return 'Yarın';
    return d.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' });
  } catch {
    return dateVal;
  }
}

export function mapAdminMatchRowToListing(row: AdminMatchRow | Record<string, unknown>): MatchListing {
  const r = row as AdminMatchRow;
  const slots = parseJsonArray<PositionSlot>(r.slots);
  const awaySlots = parseJsonArray<PositionSlot>(r.away_slots);
  const missing = parseJsonArray<{ role: string; count: number }>(r.missingPositions);
  const difficulty = normalizeDifficulty(r.difficulty);

  return {
    id: String(r.id),
    title: r.title || 'İsimsiz Maç',
    location: r.location || '',
    time: r.time || '20:00',
    date: formatDateLabel(r.date),
    price: Number(r.price ?? 0),
    difficulty,
    minRating: Number(r.minRating ?? 3),
    image: r.image || 'https://images.unsplash.com/photo-1517466787929-bc90951d0974?auto=format&fit=crop&q=80&w=600',
    badges: parseJsonArray<string>(r.badges, [difficulty]),
    missingPositions: missing.length ? missing : computeMissingFromSlots(slots),
    slots,
    awaySlots: awaySlots.length ? awaySlots : undefined,
    status: normalizeStatus(r.status),
    refereeId: r.refereeId || undefined,
    creatorId: r.creatorId || undefined,
    cancelReason: r.cancel_reason || undefined,
    refundStatus: r.refund_status || undefined,
    format: r.format || '7v7',
    ...(r.isDemo ? { isDemo: true } : {}),
  } as MatchListing & { isDemo?: boolean };
}

function computeMissingFromSlots(slots: PositionSlot[]): { role: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const s of slots) {
    if (s.status === 'OPEN') counts.set(s.role, (counts.get(s.role) || 0) + 1);
  }
  return Array.from(counts.entries()).map(([role, count]) => ({ role, count }));
}

export function listingToMatchPayload(match: Partial<MatchListing> & { rawDate?: string }): Record<string, unknown> {
  let dateIso = match.rawDate;
  if (!dateIso && match.date) {
    const labels: Record<string, number> = { Bugün: 0, Yarın: 1 };
    if (labels[match.date] !== undefined) {
      const d = new Date();
      d.setDate(d.getDate() + labels[match.date]);
      dateIso = d.toISOString().slice(0, 10);
    } else {
      dateIso = new Date().toISOString().slice(0, 10);
    }
  }
  return {
    title: match.title,
    location: match.location,
    date: dateIso,
    time: match.time,
    price: match.price,
    difficulty: match.difficulty,
    status: match.status || 'ACTIVE',
    format: match.format || '7v7',
    duration: match.duration,
    gender: match.gender,
    ageGroup: match.ageGroup,
    minRating: match.minRating,
    image: match.image,
    badges: match.badges,
    missingPositions: match.missingPositions,
    slots: match.slots,
    awaySlots: match.awaySlots,
    reservePlayers: match.reservePlayers,
    chatMessages: match.chatMessages,
    refereeId: match.refereeId || null,
    creatorId: match.creatorId || null,
    homeTeamId: match.homeTeamId || null,
    awayTeamId: match.awayTeamId || null,
    homeScore: match.homeScore,
    awayScore: match.awayScore,
    scoreEnteredAt: match.scoreEnteredAt,
  };
}

export const MATCH_STATUS_FILTERS = [
  { id: 'ALL', label: 'Tümü' },
  { id: 'ACTIVE', label: 'Aktif' },
  { id: 'DRAFT', label: 'Taslak' },
  { id: 'LIVE', label: 'Canlı' },
  { id: 'COMPLETED', label: 'Tamamlandı' },
  { id: 'CANCELLED', label: 'İptal' },
] as const;

export type MatchStatusFilter = typeof MATCH_STATUS_FILTERS[number]['id'];
