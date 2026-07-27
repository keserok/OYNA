import { supabase } from '../supabaseClient';
import { MatchListing, PositionSlot } from '../types';

export interface Match {
  id?: string;
  pitchId: string;
  pitchName: string;
  captainId: string;
  captainName: string;
  date: string;
  time: string;
  status: 'OPEN' | 'CONFIRMED' | 'COMPLETED' | 'CANCELLED';
  gkId?: string;
  refId?: string;
  applicants?: Array<{
    uid: string;
    displayName: string;
    role: 'GOALKEEPER' | 'REFEREE';
    photoURL?: string;
    status: 'PENDING' | 'REJECTED';
  }>;
  createdAt?: string;
}

// ============================================================================
// 1. AÇIK MAÇ LİSTELERİ (Top Oyna / Servis paneli)
// ============================================================================
// Legacy createMatch/approveApplicant/applyToMatch kaldırıldı (P5): maç
// oluşturma tek yol player_create_match / admin_create_match RPC'leridir;
// kaleci-hakem akışı serviceRequestService üzerinden yürür.

export const subscribeToOpenMatches = (callback: (matches: Match[]) => void) => {
  // İlk veriyi çek
  const fetchMatches = async () => {
    const { data } = await supabase.from('matches').select('*').eq('status', 'OPEN');
    if (data) callback(data as Match[]);
  };

  fetchMatches();

  // Değişimleri dinle
  const channel = supabase.channel('public:matches')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'matches', filter: 'status=eq.OPEN' }, () => {
      fetchMatches();
    })
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
};

export const fetchNearbyMatches = async (lat: number, lon: number, radiusKm: number) => {
  try {
    const { data, error } = await supabase.rpc('get_nearby_matches', {
      p_lat: lat,
      p_lon: lon,
      p_radius_km: radiusKm
    });

    if (error) throw error;
    return data || [];
  } catch (error) {
    console.error("Yakındaki maçlar çekilirken hata:", error);
    return [];
  }
};

// ============================================================================
// 3. MAÇ LOBİSİ (MATCH JOIN) FONKSİYONLARI
// ============================================================================

export const getMatchDetails = async (matchId: string): Promise<MatchListing | null> => {
  try {
    const { data, error } = await supabase.from('matches').select('*').eq('id', matchId).single();
    if (error) throw error;
    if (!data) return null;
    // Maçın oynandığı saha adı (varsa) — "Tesis · Saha" etiketi için (Karar #28).
    let courtName: string | undefined;
    if (data.court_id) {
      const { data: court } = await supabase.from('courts').select('name').eq('id', data.court_id).maybeSingle();
      courtName = (court as { name?: string } | null)?.name ?? undefined;
    }
    return {
      ...data,
      awaySlots: data.away_slots || data.awaySlots || [],
      homeTeamId: data.home_team_id || data.homeTeamId,
      awayTeamId: data.away_team_id || data.awayTeamId,
      refereeId: data.ref_id || data.refereeId,
      gkId: data.gk_id ?? data.gkId ?? undefined,
      awayGkId: data.away_gk_id ?? data.awayGkId ?? undefined,
      creatorId: data.captain_id || data.creatorId,
      // FAZ 3: maç çekirdeği alanları camelCase'e map et
      visibility: data.visibility || 'OPEN',
      // privateCode artık satırda YOK (P1 güvenlik): kurucu getMyMatchPrivateCode ile çeker.
      pitchId: data.pitch_id || data.pitchId || undefined,
      courtId: data.court_id || undefined,
      courtName,
      isSuccessful: data.is_successful ?? data.isSuccessful ?? undefined,
      confirmedAt: data.confirmed_at || data.confirmedAt || undefined,
      startsAt: data.starts_at || data.startsAt || undefined,
    } as unknown as MatchListing;
  } catch (error) {
    console.error("Maç detayları çekilirken hata:", error);
    return null;
  }
};

export interface FriendPlayerCard {
  is_friend: boolean;
  is_self: boolean;
  name?: string;
  age?: number | null;
  fair_play?: number | null;
  matches_together?: number;
  total_matches?: number;
}

/**
 * Sade oyuncu bilgi kartı verisi (sahadaki oyuncuya basınca).
 * Arkadaş-kapılı + RLS-güvenli (get_friend_player_card RPC).
 * Arkadaş değilse yalnız {is_friend:false} döner.
 */
export const getFriendPlayerCard = async (userId: string): Promise<FriendPlayerCard | null> => {
  try {
    const { data, error } = await supabase.rpc('get_friend_player_card', { p_user_id: userId });
    if (error) throw error;
    return (data as FriendPlayerCard) ?? null;
  } catch (e) {
    console.warn('[matchService] oyuncu kartı çekilemedi:', e);
    return null;
  }
};

export interface LobbyParticipant {
  userId: string;
  side: 'home' | 'away';
  name: string;
  avatarUrl: string;
  rating: number;
}

/**
 * Lobi sahasındaki DOLU slotları GERÇEK oyuncularla doldurmak için taraf-bazlı roster.
 * RLS-güvenli kaynaklar (hepsi authenticated SELECT):
 *   1) `match_participants` — bireysel/pickup maçlarda kimin katıldığı (role=home/away).
 *   2) `team_members` — takım-vs-takım maçlarda kadro (homeTeamId/awayTeamId üyeleri).
 *   3) `public_profiles` view'ı — ad/avatar (profiles PII sertleştirmesi nedeniyle
 *      başka oyuncuların `profiles` satırı doğrudan okunamaz).
 * Öncelik: önce katılımcılar, sonra takım üyeleri; kimlik bazında global tekilleştirme.
 * Slot↔oyuncu doğrudan bağ olmadığından çağıran, roster'ı sırayla TAKEN slotlara eşler.
 */
export const getMatchLobbyParticipants = async (
  matchId: string,
  homeTeamId?: string | null,
  awayTeamId?: string | null,
): Promise<LobbyParticipant[]> => {
  try {
    const { data: parts } = await supabase
      .from('match_participants')
      .select('user_id, role, status, joined_at')
      .eq('match_id', matchId);
    const active = (parts || [])
      .filter((p: any) => {
        const s = String(p?.status || '').toLowerCase();
        return !!p?.user_id && s !== 'left' && s !== 'cancelled' && s !== 'removed' && s !== 'declined';
      })
      .sort((a: any, b: any) => String(a.joined_at || '').localeCompare(String(b.joined_at || '')));

    const fetchTeamMemberIds = async (tid?: string | null): Promise<string[]> => {
      if (!tid) return [];
      const { data } = await supabase.from('team_members').select('user_id').eq('team_id', tid);
      return (data || []).map((r: any) => r.user_id).filter(Boolean);
    };
    const [homeMembers, awayMembers] = await Promise.all([
      fetchTeamMemberIds(homeTeamId),
      fetchTeamMemberIds(awayTeamId),
    ]);

    // Taraf-bazlı sıralı roster: katılımcı(home) → katılımcı(away) → üye(home) → üye(away),
    // kimlik bazında global tekilleştirme (bir oyuncu iki tarafta görünmez).
    const seen = new Set<string>();
    const roster: { userId: string; side: 'home' | 'away' }[] = [];
    const push = (userId: string, side: 'home' | 'away') => {
      if (!userId || seen.has(userId)) return;
      seen.add(userId);
      roster.push({ userId, side });
    };
    active.filter((p: any) => String(p.role).toLowerCase() !== 'away').forEach((p: any) => push(p.user_id, 'home'));
    active.filter((p: any) => String(p.role).toLowerCase() === 'away').forEach((p: any) => push(p.user_id, 'away'));
    homeMembers.forEach(id => push(id, 'home'));
    awayMembers.forEach(id => push(id, 'away'));

    if (roster.length === 0) return [];

    const { data: profs } = await supabase
      .from('public_profiles')
      .select('id, name, avatar_url, rating')
      .in('id', roster.map(r => r.userId));
    const byId = new Map((profs || []).map((pr: any) => [pr.id, pr]));

    return roster.map(({ userId, side }) => {
      const pr: any = byId.get(userId);
      return {
        userId,
        side,
        name: (pr?.name as string) || 'Oyuncu',
        avatarUrl: (pr?.avatar_url as string) || '',
        rating: (typeof pr?.rating === 'number' ? pr.rating : 4.5),
      };
    });
  } catch (e) {
    console.warn('[matchService] lobi roster çekilemedi:', e);
    return [];
  }
};

/**
 * Maça ATANMIŞ kaleci/hakem — lobide HERKESE gösterilir (salt-okunur).
 * Kaynak: `matches.gk_id`/`matches.refereeId` → `goalkeepers`/`referees` tabloları.
 * RLS: her iki tablonun SELECT politikası onaylı (verification_status='approved')
 * ve demo-değil (ya da demo_mode açık) sağlayıcıları herkese açar; okunamıyorsa
 * (ör. reddedilmiş sağlayıcı) null döner ve UI o kartı hiç göstermez.
 * jsonb `skills`/`stats` ham döner — çağıran defansif okur (anahtarlar TR/EN olabilir).
 */
export interface MatchProvider {
  id: string;
  name: string;
  avatar: string | null;
  rating: number | null;
  fee: number | null;
  matchCount: number | null;
  style: string | null;
  level: string | null;        // yalnız hakem
  height: string | null;       // yalnız kaleci
  age: number | null;          // yalnız kaleci
  isElite: boolean;
  skills: Record<string, number> | null;
  stats: Record<string, number | string> | null;
}

const toNum = (v: any): number | null => (v == null || v === '' || isNaN(Number(v)) ? null : Number(v));

const mapProvider = (row: any): MatchProvider => ({
  id: row.id,
  name: row.name || 'Sağlayıcı',
  avatar: row.avatar || null,
  rating: toNum(row.rating),
  fee: toNum(row.fee),
  matchCount: toNum(row.matchCount),
  style: row.style || null,
  level: row.level || null,
  height: row.height || null,
  age: toNum(row.age),
  isElite: !!row.isElite,
  skills: row.skills && typeof row.skills === 'object' ? row.skills : null,
  stats: row.stats && typeof row.stats === 'object' ? row.stats : null,
});

export const getMatchProviders = async (
  gkId?: string | null,
  refereeId?: string | null,
  awayGkId?: string | null,
): Promise<{ goalkeeper: MatchProvider | null; awayGoalkeeper: MatchProvider | null; referee: MatchProvider | null }> => {
  const result: { goalkeeper: MatchProvider | null; awayGoalkeeper: MatchProvider | null; referee: MatchProvider | null } =
    { goalkeeper: null, awayGoalkeeper: null, referee: null };
  const GK_COLS = 'id,name,avatar,rating,fee,"matchCount",style,height,age,"isElite",skills,stats';
  const gkQuery = (id?: string | null) =>
    id ? supabase.from('goalkeepers').select(GK_COLS).eq('id', id).maybeSingle() : Promise.resolve({ data: null });
  try {
    const [gkRes, awayGkRes, refRes] = await Promise.all([
      gkQuery(gkId),
      gkQuery(awayGkId),
      refereeId
        ? supabase.from('referees').select('id,name,avatar,rating,fee,"matchCount",style,level,"isElite",stats').eq('id', refereeId).maybeSingle()
        : Promise.resolve({ data: null }),
    ]);
    if ((gkRes as any).data) result.goalkeeper = mapProvider((gkRes as any).data);
    if ((awayGkRes as any).data) result.awayGoalkeeper = mapProvider((awayGkRes as any).data);
    if ((refRes as any).data) result.referee = mapProvider((refRes as any).data);
  } catch (e) {
    console.warn('[matchService] atanmış sağlayıcılar çekilemedi:', e);
  }
  return result;
};

/**
 * Saha koordinatı — tek otorite pitch_id (FK). Koordinat girilmemişse null
 * döner; asla varsayılan şehir merkezine düşülmez (MatchJoin haritayı gizler).
 * pitch_id olmayan eski maçlar için ada göre eşleşme ikincil yoldur.
 */
export const getPitchCoordinates = async (
  pitchId?: string | null,
  pitchName?: string | null,
): Promise<[number, number] | null> => {
  try {
    let row: { latitude: number | null; longitude: number | null } | null = null;
    if (pitchId) {
      const { data } = await supabase
        .from('pitches')
        .select('latitude, longitude')
        .eq('id', pitchId)
        .maybeSingle();
      row = data;
    }
    if (!row && pitchName?.trim()) {
      const { data } = await supabase
        .from('pitches')
        .select('latitude, longitude')
        .ilike('name', `%${pitchName.trim()}%`)
        .limit(1)
        .maybeSingle();
      row = data;
    }
    if (row && typeof row.latitude === 'number' && typeof row.longitude === 'number') {
      return [row.latitude, row.longitude];
    }
    return null;
  } catch {
    return null;
  }
};

/** Maç Raporu — oyuncunun bu maça özel kişisel notunu döndürür (yoksa boş string). */
export const getMatchNote = async (matchId: string): Promise<string> => {
  try {
    const { data: userData } = await supabase.auth.getUser();
    const uid = userData?.user?.id;
    if (!uid || !matchId) return '';
    const { data, error } = await supabase
      .from('match_notes')
      .select('note')
      .eq('match_id', matchId)
      .eq('user_id', uid)
      .maybeSingle();
    if (error) throw error;
    return (data?.note as string) ?? '';
  } catch (error) {
    console.error('Maç notu çekilirken hata:', error);
    return '';
  }
};

/** Maç Raporu — oyuncunun bu maça özel kişisel notunu kaydeder (upsert). */
export const saveMatchNote = async (matchId: string, note: string): Promise<void> => {
  const { data: userData } = await supabase.auth.getUser();
  const uid = userData?.user?.id;
  if (!uid) throw new Error('Oturum bulunamadı.');
  const { error } = await supabase
    .from('match_notes')
    .upsert(
      { match_id: matchId, user_id: uid, note, updated_at: new Date().toISOString() },
      { onConflict: 'match_id,user_id' },
    );
  if (error) throw error;
};

// ============================================================================
// 3b. SLOT YAŞAM DÖNGÜSÜ — dar RPC sarmalayıcıları (P2, tek yazım yolu)
// ============================================================================
// Doluluk değiştiren TEK yüzey bunlardır; matches tablosuna doğrudan update yok.

/** Alıcı kendini rezerve slota yerleştirir (RESERVED → SELF). */
export const selfAssignSlot = async (matchId: string, slotId: string): Promise<void> => {
  const { error } = await supabase.rpc('player_self_assign', { p_match_id: matchId, p_slot_id: slotId });
  if (error) throw error;
};

/** Arkadaş ANINDA slota atanır (RESERVED → ASSIGNED) + gerçek bildirim alır. */
export const assignSlotToFriend = async (matchId: string, slotId: string, friendId: string): Promise<void> => {
  const { error } = await supabase.rpc('player_assign_slot', {
    p_match_id: matchId, p_slot_id: slotId, p_friend_id: friendId,
  });
  if (error) throw error;
};

/** Slottaki oyuncu çıkar; slot alıcının rezervine döner (para alıcıda kalır). */
export const unassignSlot = async (matchId: string, slotId: string): Promise<void> => {
  const { error } = await supabase.rpc('player_unassign_slot', { p_match_id: matchId, p_slot_id: slotId });
  if (error) throw error;
};

/** Alıcı slotu vitrine iade eder — kurallı iade purchasedBy cüzdanına döner. */
export const releaseSlot = async (matchId: string, slotId: string): Promise<number> => {
  const { data, error } = await supabase.rpc('player_release_slot', { p_match_id: matchId, p_slot_id: slotId });
  if (error) throw error;
  return Number((data as { refunded?: number } | null)?.refunded) || 0;
};

/** Kurucu oyuncuyu çıkarır — iade otomatik, yedek bildirimi sunucuda. */
export const kickSlot = async (matchId: string, slotId: string): Promise<number> => {
  const { data, error } = await supabase.rpc('player_kick_slot', { p_match_id: matchId, p_slot_id: slotId });
  if (error) throw error;
  return Number((data as { refunded?: number } | null)?.refunded) || 0;
};

/** Diziliş güncelleme — YALNIZ koordinat/rol yazar, doluluk anahtarlarına dokunamaz. */
export const updateFormationRpc = async (
  matchId: string,
  side: 'home' | 'away',
  coords: { id: string; x: number; y: number; role: string }[],
): Promise<void> => {
  const { error } = await supabase.rpc('player_update_formation', {
    p_match_id: matchId, p_side: side, p_coords: coords,
  });
  if (error) throw error;
};

/** Özel maç kodu — YALNIZ kurucuya döner (match_private_codes SECURITY DEFINER). */
export const getMyMatchPrivateCode = async (matchId: string): Promise<string | null> => {
  try {
    const { data, error } = await supabase.rpc('get_my_match_private_code', { p_match_id: matchId });
    if (error) throw error;
    return (data as string | null) || null;
  } catch {
    return null;
  }
};

export const subscribeToMatchUpdates = (matchId: string, callback: (match: MatchListing) => void) => {
  const channel = supabase.channel(`match_${matchId}`)
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'matches', filter: `id=eq.${matchId}` }, (payload) => {
      callback(payload.new as unknown as MatchListing);
    })
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
};

// ============================================================================
// 4. ÖZEL MAÇ (PRIVATE MATCH) — kod ile katılım (FAZ 3)
// ============================================================================

export interface PrivateMatchResolution {
  matchId: string;
  title: string;
  status: string;
}

/**
 * Özel maç katılım kodunu çözer (resolve_private_match RPC).
 * Sadece visibility='PRIVATE' maçları eşler. Bulunamazsa hata fırlatır.
 */
export const resolvePrivateMatch = async (code: string): Promise<PrivateMatchResolution> => {
  const { data, error } = await supabase.rpc('resolve_private_match', {
    p_code: (code || '').trim().toUpperCase(),
  });
  if (error) throw error;
  const d = (data ?? {}) as { match_id?: string; title?: string; status?: string };
  if (!d.match_id) throw new Error('NOT_FOUND');
  return { matchId: d.match_id, title: d.title ?? 'Özel Maç', status: d.status ?? 'ACTIVE' };
};

/** Özel maç kodu hata kodlarını kullanıcı dostu Türkçe'ye çevirir. */
export const toPrivateMatchErrorMessage = (err: unknown): string => {
  const raw = err instanceof Error ? err.message : String(err ?? '');
  const code = raw.toUpperCase();
  if (code.includes('INVALID_CODE')) return 'Kod en az 4 karakter olmalı. Lütfen kodu kontrol et.';
  if (code.includes('NOT_FOUND')) return 'Bu koda ait özel maç bulunamadı. Kodu doğru girdiğinden emin ol.';
  if (code.includes('UNAUTHORIZED') || code.includes('JWT')) return 'Bu işlem için giriş yapman gerekiyor.';
  return 'Maç bulunamadı. Lütfen kodu kontrol edip tekrar dene.';
};
