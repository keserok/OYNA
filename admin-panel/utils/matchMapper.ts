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
  chatMessages: unknown;
  refereeId: string | null;
  creatorId: string | null;
  isDemo: boolean | null;
  cancel_reason: string | null;
  refund_status: string | null;
  created_at: string | null;
  visibility?: string | null;
  private_code?: string | null;
  pitch_id?: string | null;
  court_id?: string | null;
  is_successful?: boolean | null;
  confirmed_at?: string | null;
  starts_at?: string | null;
  deposit_status?: string | null;
  deposit_amount?: number | null;
  min_players?: number | null;
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
  if (s === 'OPEN') return 'ACTIVE';
  if (s === 'CONFIRMED') return 'CONFIRMED';   // DB onay durumunu KORU (lifecycle otoritesi)
  if (s === 'CANCELLED' || s === 'CANCELED') return 'CANCELLED';
  if (s === 'COMPLETED' || s === 'DONE') return 'COMPLETED';
  if (s === 'LIVE') return 'LIVE';
  if (s === 'DRAFT') return 'DRAFT';
  return 'ACTIVE';
}

function normalizeDifficulty(raw: string | null | undefined): MatchListing['difficulty'] {
  const d = (raw || 'Rahat').toLowerCase();
  // DB skalası Türkçe 'Zor'/'Orta'/'Kolay' olabilir; İngilizce karşılıkları da kapsa.
  if (d.includes('ciddi') || d.includes('zor') || d === 'hard') return 'Ciddi';
  if (d.includes('taktik') || d === 'medium' || d === 'orta') return 'Taktiksel';
  return 'Rahat'; // kolay / easy / rahat / bilinmeyen
}

export function formatDateLabel(dateVal: string | null): string {
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
  const rRaw = row as Record<string, unknown>;
  const slots = parseJsonArray<PositionSlot>(r.slots);
  // Liste RPC'si snake 'away_slots', tekil admin_get_match camel 'awaySlots' döndürür →
  // her iki anahtarı da oku ki tekil çekimde deplasman kadrosu kaybolmasın.
  const awaySlots = parseJsonArray<PositionSlot>(r.away_slots ?? rRaw.awaySlots);
  const missing = parseJsonArray<{ role: string; count: number }>(r.missingPositions);
  const chatMessages = parseJsonArray<NonNullable<MatchListing['chatMessages']>[number]>(r.chatMessages);
  const reservePlayers = parseJsonArray<NonNullable<MatchListing['reservePlayers']>[number]>(rRaw.reservePlayers);
  const difficulty = normalizeDifficulty(r.difficulty);
  const homeScore = (rRaw.homeScore ?? rRaw.home_score) as number | null | undefined;
  const awayScore = (rRaw.awayScore ?? rRaw.away_score) as number | null | undefined;

  return {
    id: String(r.id),
    title: r.title || 'İsimsiz Maç',
    location: r.location || '',
    time: r.time || '20:00',
    date: formatDateLabel(r.date),
    // Düzenleme akışları için HAM ISO tarih korunur — etikete ("Bugün") çevrilen
    // date alanı yüzünden MatchFormModal her düzenlemede tarihi bugüne çekiyordu.
    rawDate: r.date ? String(r.date).slice(0, 10) : undefined,
    price: Number(r.price ?? 0),
    difficulty,
    minRating: Number(r.minRating ?? 3),
    // Görsel yoksa boş bırak: düzenlemede formu boş açar, kaydetince tetikleyici
    // sahanın fotoğrafını otomatik yazar (stok görsel geri sızmasın).
    image: r.image || '',
    badges: parseJsonArray<string>(r.badges, [difficulty]),
    missingPositions: missing.length ? missing : computeMissingFromSlots(slots),
    slots,
    awaySlots: awaySlots.length ? awaySlots : undefined,
    chatMessages: chatMessages.length ? chatMessages : undefined,
    status: normalizeStatus(r.status),
    refereeId: r.refereeId || undefined,
    creatorId: r.creatorId || undefined,
    cancelReason: r.cancel_reason || undefined,
    refundStatus: r.refund_status || undefined,
    // Tekil admin_get_match (to_jsonb) çekiminde gelen zengin alanlar — liste
    // RPC'si döndürmez; kokpit açılışta tekil hidrasyonla tamamlar.
    reservePlayers: reservePlayers.length ? reservePlayers : undefined,
    homeScore: homeScore != null ? Number(homeScore) : undefined,
    awayScore: awayScore != null ? Number(awayScore) : undefined,
    gkId: (rRaw.gk_id as string) || undefined,
    awayGkId: (rRaw.away_gk_id as string) || undefined,
    format: r.format || '7v7',
    visibility: (r.visibility === 'PRIVATE' ? 'PRIVATE' : 'OPEN'),
    privateCode: r.private_code || undefined,
    pitchId: r.pitch_id || undefined,
    courtId: r.court_id || undefined,
    isSuccessful: r.is_successful || undefined,
    confirmedAt: r.confirmed_at || undefined,
    startsAt: r.starts_at || undefined,
    depositStatus: (r.deposit_status as MatchListing['depositStatus']) || 'NONE',
    depositAmount: r.deposit_amount != null ? Number(r.deposit_amount) : undefined,
    minPlayers: r.min_players != null ? Number(r.min_players) : undefined,
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

/** Form → payload kaynağı: MatchListing alanları + formun eklediği ekstra anahtarlar. */
export type MatchPayloadSource = Partial<MatchListing> & {
  rawDate?: string;
  /** Maçın oynanacağı kort (courts.id) — payload'da 'court_id' olarak gider. */
  courtId?: string;
  /** OYNA platform maçı işareti — payload'da 'is_platform' olarak gider. */
  isPlatform?: boolean;
};

export function listingToMatchPayload(match: MatchPayloadSource): Record<string, unknown> {
  let dateIso = match.rawDate;
  if (!dateIso && match.date) {
    const labels: Record<string, number> = { Bugün: 0, Yarın: 1 };
    const ddmmyyyy = match.date.match(/^(\d{1,2})[.\/](\d{1,2})[.\/](\d{4})$/); // 27.06.2026
    const isoMatch = match.date.match(/^\d{4}-\d{2}-\d{2}$/);                    // 2026-06-27
    if (labels[match.date] !== undefined) {
      const d = new Date();
      d.setDate(d.getDate() + labels[match.date]);
      dateIso = d.toISOString().slice(0, 10);
    } else if (isoMatch) {
      dateIso = match.date;
    } else if (ddmmyyyy) {
      const [, dd, mm, yyyy] = ddmmyyyy;
      dateIso = `${yyyy}-${mm.padStart(2, '0')}-${dd.padStart(2, '0')}`;
    } else {
      dateIso = new Date().toISOString().slice(0, 10);
    }
  }
  return {
    title: match.title,
    location: match.location,
    date: dateIso,
    // Savunma: saat her zaman tek SS:DD olarak gider — slot etiketi ("20:00 -
    // 21:00") sızarsa ilk kalıp çıkarılır (sunucu ::time cast güvenliği).
    time: (String(match.time ?? '').replace('.', ':').match(/\d{1,2}:\d{2}/)?.[0]) || match.time,
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
    // FAZ 3 — partial update güvenliği: bu anahtarlar YALNIZ kaynakta tanımlıysa
    // gider (undefined → anahtar hiç yok; sunucu COALESCE ile mevcut değeri korur).
    // Eski davranış visibility'yi her kayıtta 'OPEN'a eziyordu.
    ...(match.visibility !== undefined ? { visibility: match.visibility } : {}),
    ...(match.privateCode !== undefined ? { private_code: match.privateCode } : {}),
    ...(match.courtId !== undefined ? { court_id: match.courtId } : {}),
    ...(match.isDemo !== undefined ? { isDemo: match.isDemo } : {}),
    ...(match.isPlatform !== undefined ? { is_platform: match.isPlatform } : {}),
    pitch_id: match.pitchId || null,
    court_id: match.courtId || null,
    // Maçın süresi slottan gelir; sunucu metin ayrıştırmasına güvenmek yerine
    // sayıyı doğrudan alsın (skor zaman kapısı bu süreye bağlı).
    duration_minutes: match.durationMinutes ?? null,
    // IP-02: player_create_match idempotency anahtarı (owner_client_ops claim'i).
    // listingToMatchPayload AÇIK BEYAZ LİSTE — buraya eklenmezse anahtar
    // sunucuya HİÇ ulaşmaz ve istemci kilidi tek başına kalır.
    idempotencyKey: (match as { idempotencyKey?: string }).idempotencyKey || null,
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
