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
      ...matchData,
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
    if (role === 'GOALKEEPER') updateData.gkId = applicantUid;
    else if (role === 'REFEREE') updateData.refId = applicantUid;
    
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
    return data as unknown as MatchListing;
  } catch (error) {
    console.error("Maç detayları çekilirken hata:", error);
    return null;
  }
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
