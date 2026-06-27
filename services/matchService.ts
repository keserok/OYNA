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
// 1. OYUNCU (KAPTAN) UYGULAMASI FONKSİYONLARI
// ============================================================================

export const createMatch = async (matchData: Omit<Match, 'id' | 'createdAt' | 'status' | 'applicants'>) => {
  try {
    const { data, error } = await supabase.from('matches').insert([{
      pitch_id: matchData.pitchId,
      pitch_name: matchData.pitchName,
      captain_id: matchData.captainId,
      captain_name: matchData.captainName,
      date: matchData.date,
      time: matchData.time,
      status: 'OPEN',
      applicants: []
    }]).select().single();

    if (error) throw error;
    return data.id;
  } catch (error) {
    console.error("Maç oluşturulurken hata oluştu: ", error);
    throw error;
  }
};

export const approveApplicant = async (matchId: string, applicantUid: string, role: 'GOALKEEPER' | 'REFEREE') => {
  try {
    const updateData: any = {};
    if (role === 'GOALKEEPER') updateData.gk_id = applicantUid;
    else if (role === 'REFEREE') updateData.ref_id = applicantUid;
    
    updateData.status = 'CONFIRMED';

    const { error } = await supabase.from('matches').update(updateData).eq('id', matchId);
    if (error) throw error;

    console.log(`${role} onaylandı: `, applicantUid);
  } catch (error) {
    console.error("Başvuru onaylanırken hata oluştu: ", error);
    throw error;
  }
};

// ============================================================================
// 2. KALECİ / HAKEM UYGULAMASI FONKSİYONLARI
// ============================================================================

export const applyToMatch = async (matchId: string, user: { uid: string, displayName: string, role: 'GOALKEEPER' | 'REFEREE', photoURL?: string }) => {
  try {
    // 1. Mevcut başvuruları çek
    const { data: match, error: fetchError } = await supabase
      .from('matches')
      .select('applicants')
      .eq('id', matchId)
      .single();

    if (fetchError) throw fetchError;

    const applicants = match.applicants || [];
    applicants.push({
      ...user,
      status: 'PENDING'
    });

    // 2. Yeni listeyi güncelle
    const { error: updateError } = await supabase
      .from('matches')
      .update({ applicants })
      .eq('id', matchId);

    if (updateError) throw updateError;

    console.log("Maça başvuru yapıldı: ", matchId);
  } catch (error) {
    console.error("Maça başvururken hata oluştu: ", error);
    throw error;
  }
};

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
    return {
      ...data,
      awaySlots: data.away_slots || data.awaySlots || [],
      homeTeamId: data.home_team_id || data.homeTeamId,
      awayTeamId: data.away_team_id || data.awayTeamId,
      refereeId: data.ref_id || data.refereeId,
      creatorId: data.captain_id || data.creatorId,
      // FAZ 3: maç çekirdeği alanları camelCase'e map et
      visibility: data.visibility || 'OPEN',
      privateCode: data.private_code || data.privateCode || undefined,
      pitchId: data.pitch_id || data.pitchId || undefined,
      isSuccessful: data.is_successful ?? data.isSuccessful ?? undefined,
      confirmedAt: data.confirmed_at || data.confirmedAt || undefined,
      startsAt: data.starts_at || data.startsAt || undefined,
    } as unknown as MatchListing;
  } catch (error) {
    console.error("Maç detayları çekilirken hata:", error);
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

export const joinMatchSlot = async (
  matchId: string,
  updatedSlots: PositionSlot[],
  isAway: boolean
): Promise<void> => {
  try {
    const updateData = isAway ? { away_slots: updatedSlots } : { slots: updatedSlots };
    const { error } = await supabase.from('matches').update(updateData).eq('id', matchId);
    if (error) throw error;
  } catch (error) {
    console.error("Slota katılırken hata:", error);
    throw error;
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
