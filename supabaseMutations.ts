import { supabase } from './supabaseClient';
import { Pitch, Match, Goalkeeper, Referee, AdminUser, Team } from './types';

const mapPitchToDb = (pitch: Partial<Pitch>) => {
  if (!pitch) return pitch;
  const mapped: any = {};
  if (pitch.id !== undefined) mapped.id = pitch.id;
  if (pitch.name !== undefined) mapped.name = pitch.name;
  if (pitch.district !== undefined) mapped.district = pitch.district;
  
  if (pitch.googleRating !== undefined) mapped.google_rating = pitch.googleRating;
  if (pitch.googleReviews !== undefined) mapped.google_review_count = pitch.googleReviews;
  if (pitch.totalPrice !== undefined) mapped.price_per_match = pitch.totalPrice;
  if (pitch.isApproved !== undefined) mapped.verification_status = pitch.isApproved ? 'approved' : 'pending';
  
  if (pitch.coordinates !== undefined) {
    mapped.latitude = pitch.coordinates.lat;
    mapped.longitude = pitch.coordinates.lng;
  }
  return mapped;
};

const mapMatchToDb = (match: any) => {
  if (!match) return match;
  const mapped: any = {};
  if (match.id !== undefined) mapped.id = match.id;
  if (match.pitchId !== undefined) mapped.pitch_id = match.pitchId;
  if (match.pitchName !== undefined) mapped.pitch_name = match.pitchName;
  if (match.captainId !== undefined) mapped.captain_id = match.captainId;
  if (match.captainName !== undefined) mapped.captain_name = match.captainName;
  if (match.date !== undefined) mapped.date = match.date;
  if (match.time !== undefined) mapped.time = match.time;
  if (match.status !== undefined) mapped.status = match.status;
  if (match.gkId !== undefined) mapped.gk_id = match.gkId;
  if (match.refId !== undefined) mapped.ref_id = match.refId;
  if (match.applicants !== undefined) mapped.applicants = match.applicants;
  if (match.format !== undefined) mapped.format = match.format;
  if (match.budget !== undefined) mapped.budget = match.budget;
  if (match.slots !== undefined) mapped.slots = match.slots;
  if (match.awaySlots !== undefined) mapped.away_slots = match.awaySlots;
  if (match.homeTeamId !== undefined) mapped.home_team_id = match.homeTeamId;
  if (match.awayTeamId !== undefined) mapped.away_team_id = match.awayTeamId;
  if (match.badges !== undefined) mapped.badges = match.badges;
  if (match.difficulty !== undefined) mapped.difficulty = match.difficulty;
  return mapped;
};

export const fbAddPitch = async (pitch: Pitch) => {
  const mapped = mapPitchToDb(pitch);
  const { error } = await supabase.from('pitches').insert(mapped);
  if (error) console.error('Error adding pitch:', error);
};

export const fbUpdatePitch = async (pitch: Pitch) => {
  const mapped = mapPitchToDb(pitch);
  const { error } = await supabase.from('pitches').update(mapped).eq('id', pitch.id);
  if (error) console.error('Error updating pitch:', error);
};

export const fbDeletePitch = async (id: string) => {
  const { error } = await supabase.from('pitches').delete().eq('id', id);
  if (error) console.error('Error deleting pitch:', error);
};

export const fbAddMatch = async (match: Match) => {
  const mapped = mapMatchToDb(match);
  const { error } = await supabase.from('matches').insert(mapped);
  if (error) console.error('Error adding match:', error);
};

export const fbUpdateMatch = async (match: Match) => {
  const mapped = mapMatchToDb(match);
  const { error } = await supabase.from('matches').update(mapped).eq('id', match.id);
  if (error) console.error('Error updating match:', error);
};

export const fbDeleteMatch = async (id: string) => {
  const { error } = await supabase.from('matches').delete().eq('id', id);
  if (error) console.error('Error deleting match:', error);
};

const mapUserToDb = (user: Partial<AdminUser>) => {
  if (!user) return user;
  const mapped: any = {};
  if (user.id !== undefined) mapped.id = user.id;
  if (user.name !== undefined) mapped.full_name = user.name;
  if (user.email !== undefined) mapped.email = user.email;
  if (user.avatar !== undefined) mapped.avatar_url = user.avatar;
  if (user.role !== undefined) mapped.role = user.role;
  if (user.isVerified !== undefined) mapped.is_verified = user.isVerified;
  if (user.isBanned !== undefined) mapped.is_banned = user.isBanned;
  if (user.isPro !== undefined) mapped.is_pro = user.isPro;
  if (user.wallet !== undefined) mapped.wallet_balance = user.wallet;
  if (user.matchCount !== undefined || user.rating !== undefined) {
    mapped.stats = {
      matchesPlayed: user.matchCount || 0,
      rating: user.rating || 5.0
    };
  }
  return mapped;
};

export const fbAddUser = async (user: AdminUser) => {
  const mapped = mapUserToDb(user);
  const { error } = await supabase.from('profiles').insert(mapped);
  if (error) console.error('Error adding user:', error);
};

export const fbUpdateUser = async (user: AdminUser) => {
  const mapped = mapUserToDb(user);
  const { error } = await supabase.from('profiles').update(mapped).eq('id', user.id);
  if (error) console.error('Error updating user:', error);
};

export const fbBanUser = async (id: string, isBanned: boolean) => {
  const { error } = await supabase.from('profiles').update({ is_banned: isBanned }).eq('id', id);
  if (error) console.error('Error banning user:', error);
};

export const fbToggleUserPro = async (id: string, isPro: boolean) => {
  const { error } = await supabase.from('profiles').update({ is_pro: isPro }).eq('id', id);
  if (error) console.error('Error toggling PRO:', error);
};

export const fbVerifyUser = async (id: string) => {
  const { error } = await supabase.from('profiles').update({ is_verified: true }).eq('id', id);
  if (error) console.error('Error verifying user:', error);
};

export const fbAddTeam = async (team: Team) => {
  const { error } = await supabase.from('teams').insert(team);
  if (error) console.error('Error adding team:', error);
};

const mapToSnakeCase = (obj: any) => {
  if (!obj) return obj;
  const mapped: any = {};
  for (const key of Object.keys(obj)) {
    let newKey = key;
    if (key === 'workingHours') newKey = 'working_hours';
    else if (key === 'isAvailable') newKey = 'is_available';
    else if (key === 'matchCount') newKey = 'match_count';
    else if (key === 'recentAwards') newKey = 'recent_awards';
    else if (key === 'preferredZones') newKey = 'preferred_zones';
    else if (key === 'isElite') newKey = 'is_elite';
    else if (key === 'authUid') newKey = 'auth_uid';
    mapped[newKey] = obj[key];
  }
  return mapped;
};

export const fbAddGoalkeeper = async (gk: Goalkeeper) => {
  const mapped = mapToSnakeCase(gk);
  const { error } = await supabase.from('goalkeepers').insert(mapped);
  if (error) console.error('Error adding gk:', error);
};

export const fbUpdateGoalkeeper = async (gk: Goalkeeper) => {
  const mapped = mapToSnakeCase(gk);
  const { error } = await supabase.from('goalkeepers').update(mapped).eq('id', gk.id);
  if (error) console.error('Error updating gk:', error);
};

export const fbDeleteGoalkeeper = async (id: string) => {
  const { error } = await supabase.from('goalkeepers').delete().eq('id', id);
  if (error) console.error('Error deleting gk:', error);
};

export const fbAddReferee = async (ref: Referee) => {
  const mapped = mapToSnakeCase(ref);
  const { error } = await supabase.from('referees').insert(mapped);
  if (error) console.error('Error adding ref:', error);
};

export const fbUpdateReferee = async (ref: Referee) => {
  const mapped = mapToSnakeCase(ref);
  const { error } = await supabase.from('referees').update(mapped).eq('id', ref.id);
  if (error) console.error('Error updating ref:', error);
};

export const fbDeleteReferee = async (id: string) => {
  const { error } = await supabase.from('referees').delete().eq('id', id);
  if (error) console.error('Error deleting ref:', error);
};

export const fbUpdateAppSettings = async (settings: any) => {
  const { error } = await supabase.from('settings').update(settings).eq('id', 1);
  if (error) console.error('Error updating settings:', error);
};

export const fbAddNotification = async (notif: any) => {
  const { error } = await supabase.from('notifications').insert(notif);
  if (error) console.error('Error adding notification:', error);
};

export const fbDeleteNotification = async (id: string) => {
  const { error } = await supabase.from('notifications').delete().eq('id', id);
  if (error) console.error('Error deleting notification:', error);
};

export const fbToggleNotificationAlert = async (id: string, isActive: boolean) => {
  const { error } = await supabase.from('notifications').update({ isActive }).eq('id', id);
  if (error) console.error('Error toggling notification:', error);
};

export const fbProcessMatchPayment = async (userId: string, matchId: string, amount: number) => {
  if (amount <= 0) return { success: true };
  
  const { data, error } = await supabase.rpc('process_match_payment', {
    p_user_id: userId,
    p_match_id: matchId,
    p_amount: amount
  });

  if (error) {
    console.error('Wallet Payment Error:', error);
    return { success: false, error: error.message };
  }
  return { success: true };
};

export const fbProcessMatchRefund = async (userId: string, matchId: string, amount: number) => {
  if (amount <= 0) return { success: true };
  
  const { data, error } = await supabase.rpc('process_match_refund', {
    p_user_id: userId,
    p_match_id: matchId,
    p_amount: amount
  });

  if (error) {
    console.error('Wallet Refund Error:', error);
    return { success: false, error: error.message };
  }
  return { success: true };
};

export const fbUpdateUserLocation = async (userId: string, lat: number, lng: number) => {
  // PostGIS geography(POINT) verisini güncellemek için text formatında gönderiyoruz: POINT(lon lat)
  const pointStr = `POINT(${lng} ${lat})`;
  
  const { error } = await supabase.rpc('update_user_location', {
    p_user_id: userId,
    p_point_str: pointStr
  });

  if (error) {
    console.error('Error updating user location:', error);
    return { success: false, error: error.message };
  }
  return { success: true };
};
export const fbDeleteUser = async (id: string) => { console.log('Mock delete user', id); };

// Service Fetching
const mapFromSnakeCase = (obj: any) => {
  if (!obj) return obj;
  const mapped: any = {};
  for (const key of Object.keys(obj)) {
    let newKey = key;
    if (key === 'working_hours') newKey = 'workingHours';
    else if (key === 'is_available') newKey = 'isAvailable';
    else if (key === 'match_count') newKey = 'matchCount';
    else if (key === 'recent_awards') newKey = 'recentAwards';
    else if (key === 'preferred_zones') newKey = 'preferredZones';
    else if (key === 'is_elite') newKey = 'isElite';
    else if (key === 'auth_uid') newKey = 'authUid';
    mapped[newKey] = obj[key];
  }
  return mapped;
};

export const fbGetGoalkeepers = async () => {
  const { data, error } = await supabase.from('goalkeepers').select('*');
  if (error) {
    console.error('Error fetching goalkeepers:', error);
    return [];
  }
  return (data || []).map(mapFromSnakeCase);
};

export const fbGetReferees = async () => {
  const { data, error } = await supabase.from('referees').select('*');
  if (error) {
    console.error('Error fetching referees:', error);
    return [];
  }
  return (data || []).map(mapFromSnakeCase);
};

// Service Offers (Bid System)
export const fbCreateOffer = async (offer: any) => {
  const { data, error } = await supabase.from('service_offers').insert(offer).select().single();
  if (error) {
    console.error('Error creating offer:', error);
    return { success: false, error: error.message };
  }
  return { success: true, data };
};

export const fbUpdateOfferStatus = async (offerId: string, status: 'ACCEPTED' | 'REJECTED') => {
  const { error } = await supabase.from('service_offers').update({ status }).eq('id', offerId);
  if (error) {
    console.error('Error updating offer status:', error);
    return { success: false, error: error.message };
  }
  return { success: true };
};

export const fbGetProviderOffers = async (providerId: string) => {
  const { data, error } = await supabase.from('service_offers').select('*').eq('provider_id', providerId).eq('status', 'PENDING');
  if (error) {
    console.error('Error fetching provider offers:', error);
    return [];
  }
  return data;
};

// --- Owner Pitch Management ---
export const fbGetOwnerPitches = async (ownerId: string) => {
  const { data, error } = await supabase.from('pitches').select('*').eq('owner_id', ownerId);
  if (error) {
    console.error('Error fetching owner pitches:', error);
    return [];
  }
  return data;
};

export const fbGetPitchBookings = async (pitchId: string, dateStr?: string) => {
  let query = supabase.from('pitch_bookings').select('*').eq('pitch_id', pitchId);
  if (dateStr) {
      query = query.eq('booking_date', dateStr);
  }
  const { data, error } = await query;
  if (error) {
    console.error('Error fetching pitch bookings:', error);
    return [];
  }
  return data;
};

export const fbCreatePitchBooking = async (booking: { pitch_id: string, user_id?: string, title?: string, booking_date: string, start_time: string, end_time: string, status?: string }) => {
  const { data, error } = await supabase.from('pitch_bookings').insert([booking]).select();
  if (error) {
    console.error('Error creating pitch booking:', error);
    throw error;
  }
  return data;
};

export const fbDeletePitchBooking = async (bookingId: string) => {
  const { error } = await supabase.from('pitch_bookings').delete().eq('id', bookingId);
  if (error) {
    console.error('Error deleting pitch booking:', error);
    throw error;
  }
};
