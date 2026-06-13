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
  if (error) throw new Error(`Saha eklenemedi: ${error.message}`);
};

export const fbUpdatePitch = async (pitch: Pitch) => {
  const mapped = mapPitchToDb(pitch);
  const { error } = await supabase.from('pitches').update(mapped).eq('id', pitch.id);
  if (error) throw new Error(`Saha güncellenemedi: ${error.message}`);
};

export const fbDeletePitch = async (id: string) => {
  const { error } = await supabase.from('pitches').delete().eq('id', id);
  if (error) throw new Error(`Saha silinemedi: ${error.message}`);
};

export const fbAddMatch = async (match: Match) => {
  const mapped = mapMatchToDb(match);
  const { error } = await supabase.from('matches').insert(mapped);
  if (error) throw new Error(`Maç oluşturulamadı: ${error.message}`);
};

export const fbUpdateMatch = async (match: Match) => {
  const mapped = mapMatchToDb(match);
  const { error } = await supabase.from('matches').update(mapped).eq('id', match.id);
  if (error) throw new Error(`Maç güncellenemedi: ${error.message}`);
};

export const fbDeleteMatch = async (id: string) => {
  const { error } = await supabase.from('matches').delete().eq('id', id);
  if (error) throw new Error(`Maç silinemedi: ${error.message}`);
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
  if (error) throw new Error(`Kullanıcı eklenemedi: ${error.message}`);
};

export const fbUpdateUser = async (user: AdminUser) => {
  const mapped = mapUserToDb(user);
  const { error } = await supabase.from('profiles').update(mapped).eq('id', user.id);
  if (error) throw new Error(`Kullanıcı güncellenemedi: ${error.message}`);
};

export const fbBanUser = async (id: string, isBanned: boolean) => {
  const { error } = await supabase.from('profiles').update({ is_banned: isBanned }).eq('id', id);
  if (error) throw new Error(`Ban işlemi başarısız: ${error.message}`);
};

export const fbToggleUserPro = async (id: string, isPro: boolean) => {
  const { error } = await supabase.from('profiles').update({ is_pro: isPro }).eq('id', id);
  if (error) throw new Error(`PRO durumu değiştirilemedi: ${error.message}`);
};

export const fbVerifyUser = async (id: string) => {
  const { error } = await supabase.from('profiles').update({ is_verified: true }).eq('id', id);
  if (error) throw new Error(`Doğrulama başarısız: ${error.message}`);
};

export const fbAddTeam = async (team: Team) => {
  const { error } = await supabase.from('teams').insert(team);
  if (error) throw new Error(`Takım eklenemedi: ${error.message}`);
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
    // Pitch & Match fields
    else if (key === 'pricePerPerson') newKey = 'price_per_person';
    else if (key === 'totalPrice') newKey = 'total_price';
    else if (key === 'googleRating') newKey = 'google_rating';
    else if (key === 'googleReviews') newKey = 'google_reviews';
    else if (key === 'grassQuality') newKey = 'grass_quality';
    else if (key === 'lockerRoomQuality') newKey = 'locker_room_quality';
    else if (key === 'goalQuality') newKey = 'goal_quality';
    else if (key === 'paramMerchantId') newKey = 'param_merchant_id';
    else if (key === 'paramApiKey') newKey = 'param_api_key';
    else if (key === 'paramClientId') newKey = 'param_client_id';
    else if (key === 'paymentOptions') newKey = 'payment_options';
    else if (key === 'isCluster') newKey = 'is_cluster';
    else if (key === 'clusterCount') newKey = 'cluster_count';
    else if (key === 'isApproved') newKey = 'is_approved';
    else if (key === 'lightingGrade') newKey = 'lighting_grade';
    else if (key === 'grassGrade') newKey = 'grass_grade';
    else if (key === 'lockerRoomGrade') newKey = 'locker_room_grade';
    else if (key === 'ownerId') newKey = 'owner_id';
    else if (key === 'pricingPolicy') newKey = 'pricing_policy';
    mapped[newKey] = obj[key];
  }
  return mapped;
};

export const fbAddGoalkeeper = async (gk: Goalkeeper) => {
  const mapped = mapToSnakeCase(gk);
  const { error } = await supabase.from('goalkeepers').insert(mapped);
  if (error) throw new Error(`Kaleci eklenemedi: ${error.message}`);
};

export const fbUpdateGoalkeeper = async (gk: Goalkeeper) => {
  const mapped = mapToSnakeCase(gk);
  const { error } = await supabase.from('goalkeepers').update(mapped).eq('id', gk.id);
  if (error) throw new Error(`Kaleci güncellenemedi: ${error.message}`);
};

export const fbDeleteGoalkeeper = async (id: string) => {
  const { error } = await supabase.from('goalkeepers').delete().eq('id', id);
  if (error) throw new Error(`Kaleci silinemedi: ${error.message}`);
};

export const fbAddReferee = async (ref: Referee) => {
  const mapped = mapToSnakeCase(ref);
  const { error } = await supabase.from('referees').insert(mapped);
  if (error) throw new Error(`Hakem eklenemedi: ${error.message}`);
};

export const fbUpdateReferee = async (ref: Referee) => {
  const mapped = mapToSnakeCase(ref);
  const { error } = await supabase.from('referees').update(mapped).eq('id', ref.id);
  if (error) throw new Error(`Hakem güncellenemedi: ${error.message}`);
};

export const fbDeleteReferee = async (id: string) => {
  const { error } = await supabase.from('referees').delete().eq('id', id);
  if (error) throw new Error(`Hakem silinemedi: ${error.message}`);
};

export const fbUpdateAppSettings = async (settings: any) => {
  const { error } = await supabase.from('settings').update(settings).eq('id', 1);
  if (error) throw new Error(`Ayarlar güncellenemedi: ${error.message}`);
};

export const fbAddNotification = async (notif: any) => {
  const { error } = await supabase.from('notifications').insert(notif);
  if (error) throw new Error(`Bildirim eklenemedi: ${error.message}`);
};

export const fbDeleteNotification = async (id: string) => {
  const { error } = await supabase.from('notifications').delete().eq('id', id);
  if (error) throw new Error(`Bildirim silinemedi: ${error.message}`);
};

export const fbToggleNotificationAlert = async (id: string, isActive: boolean) => {
  const { error } = await supabase.from('notifications').update({ isActive }).eq('id', id);
  if (error) throw new Error(`Bildirim durumu değiştirilemedi: ${error.message}`);
};

export const fbProcessMatchPayment = async (userId: string, matchId: string, amount: number) => {
  if (amount <= 0) return { success: true };

  const { error } = await supabase.rpc('process_match_payment', {
    p_user_id: userId,
    p_match_id: matchId,
    p_amount: amount
  });

  if (error) {
    return { success: false, error: error.message };
  }
  return { success: true };
};

export const fbProcessMatchRefund = async (userId: string, matchId: string, amount: number) => {
  if (amount <= 0) return { success: true };

  const { error } = await supabase.rpc('process_match_refund', {
    p_user_id: userId,
    p_match_id: matchId,
    p_amount: amount
  });

  if (error) {
    return { success: false, error: error.message };
  }
  return { success: true };
};

export const fbUpdateUserLocation = async (userId: string, lat: number, lng: number) => {
  const pointStr = `POINT(${lng} ${lat})`;

  const { error } = await supabase.rpc('update_user_location', {
    p_user_id: userId,
    p_point_str: pointStr
  });

  if (error) {
    return { success: false, error: error.message };
  }
  return { success: true };
};

export const fbDeleteUser = async (id: string) => {
  const { error } = await supabase.from('users').delete().eq('id', id);
  if (error) throw new Error(`Kullanıcı silinemedi: ${error.message}`);
};

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
    else if (key === 'price_per_person') newKey = 'pricePerPerson';
    else if (key === 'total_price') newKey = 'totalPrice';
    else if (key === 'google_rating') newKey = 'googleRating';
    else if (key === 'google_reviews') newKey = 'googleReviews';
    else if (key === 'grass_quality') newKey = 'grassQuality';
    else if (key === 'locker_room_quality') newKey = 'lockerRoomQuality';
    else if (key === 'goal_quality') newKey = 'goalQuality';
    else if (key === 'param_merchant_id') newKey = 'paramMerchantId';
    else if (key === 'param_api_key') newKey = 'paramApiKey';
    else if (key === 'param_client_id') newKey = 'paramClientId';
    else if (key === 'payment_options') newKey = 'paymentOptions';
    else if (key === 'is_cluster') newKey = 'isCluster';
    else if (key === 'cluster_count') newKey = 'clusterCount';
    else if (key === 'is_approved') newKey = 'isApproved';
    else if (key === 'lighting_grade') newKey = 'lightingGrade';
    else if (key === 'grass_grade') newKey = 'grassGrade';
    else if (key === 'locker_room_grade') newKey = 'lockerRoomGrade';
    else if (key === 'owner_id') newKey = 'ownerId';
    else if (key === 'pricing_policy') newKey = 'pricingPolicy';
    mapped[newKey] = obj[key];
  }
  return mapped;
};

export const fbGetGoalkeepers = async () => {
  const { data, error } = await supabase.from('goalkeepers').select('*');
  if (error) throw new Error(`Kaleciler yüklenemedi: ${error.message}`);
  return (data || []).map(mapFromSnakeCase);
};

export const fbGetReferees = async () => {
  const { data, error } = await supabase.from('referees').select('*');
  if (error) throw new Error(`Hakemler yüklenemedi: ${error.message}`);
  return (data || []).map(mapFromSnakeCase);
};

export const fbGetPitches = async () => {
  const { data, error } = await supabase.from('pitches').select('*');
  if (error) throw new Error(`Sahalar yüklenemedi: ${error.message}`);
  return (data || []).map(mapFromSnakeCase);
};

export const fbGetMatches = async () => {
  const { data, error } = await supabase.from('matches').select('*');
  if (error) throw new Error(`Maçlar yüklenemedi: ${error.message}`);
  return (data || []).map(mapFromSnakeCase);
};

export const fbGetTeams = async () => {
  const { data, error } = await supabase.from('teams').select('*');
  if (error) throw new Error(`Takımlar yüklenemedi: ${error.message}`);
  return (data || []).map(mapFromSnakeCase);
};

export const fbCreateOffer = async (offer: any) => {
  const { data, error } = await supabase.from('service_offers').insert(offer).select().single();
  if (error) {
    return { success: false, error: error.message };
  }
  return { success: true, data };
};

export const fbUpdateOfferStatus = async (offerId: string, status: 'ACCEPTED' | 'REJECTED') => {
  const { error } = await supabase.from('service_offers').update({ status }).eq('id', offerId);
  if (error) {
    return { success: false, error: error.message };
  }
  return { success: true };
};

export const fbGetProviderOffers = async (providerId: string) => {
  const { data, error } = await supabase.from('service_offers').select('*').eq('provider_id', providerId).eq('status', 'PENDING');
  if (error) throw new Error(`Teklifler yüklenemedi: ${error.message}`);
  return data;
};

export const fbGetOwnerPitches = async (ownerId: string) => {
  const { data, error } = await supabase.from('pitches').select('*').eq('owner_id', ownerId);
  if (error) throw new Error(`Sahalar yüklenemedi: ${error.message}`);
  return data;
};

export const fbGetPitchBookings = async (pitchId: string, dateStr?: string) => {
  let query = supabase.from('pitch_bookings').select('*').eq('pitch_id', pitchId);
  if (dateStr) {
      query = query.eq('booking_date', dateStr);
  }
  const { data, error } = await query;
  if (error) throw new Error(`Rezervasyonlar yüklenemedi: ${error.message}`);
  return data;
};

export const fbCreatePitchBooking = async (booking: { pitch_id: string, user_id?: string, title?: string, booking_date: string, start_time: string, end_time: string, status?: string }) => {
  const { data, error } = await supabase.from('pitch_bookings').insert([booking]).select();
  if (error) throw new Error(`Rezervasyon oluşturulamadı: ${error.message}`);
  return data;
};

export const fbDeletePitchBooking = async (bookingId: string) => {
  const { error } = await supabase.from('pitch_bookings').delete().eq('id', bookingId);
  if (error) throw new Error(`Rezervasyon silinemedi: ${error.message}`);
};

// ============================================================================
// OWNER SAAS & UI CONFIGURATION CRUD (PATRON PANELİ)
// ============================================================================

export const fbGetFacilityUIConfigs = async (facilityId?: string) => {
  let query = supabase.from('facility_ui_configs').select('*');
  if (facilityId) query = query.eq('facility_id', facilityId);
  
  const { data, error } = await query;
  if (error) throw new Error(`Tesis UI ayarları yüklenemedi: ${error.message}`);
  
  return (data || []).map(row => ({
    id: row.id,
    facilityId: row.facility_id,
    primaryColor: row.primary_color,
    secondaryColor: row.secondary_color,
    cardStyle: row.card_style,
    badgeIcon: row.badge_icon,
    customGreetingText: row.custom_greeting_text,
    allowReferees: row.allow_referees,
    allowGoalkeepers: row.allow_goalkeepers
  }));
};

export const fbSaveFacilityUIConfig = async (config: any) => {
  const mapped = {
    id: config.id,
    facility_id: config.facilityId,
    primary_color: config.primaryColor,
    secondary_color: config.secondaryColor,
    card_style: config.cardStyle,
    badge_icon: config.badgeIcon,
    custom_greeting_text: config.customGreetingText,
    allow_referees: config.allowReferees,
    allow_goalkeepers: config.allowGoalkeepers
  };
  const { error } = await supabase.from('facility_ui_configs').upsert(mapped);
  if (error) throw new Error(`Tesis UI ayarları kaydedilemedi: ${error.message}`);
};

export const fbGetRoleAppearanceRules = async (facilityId?: string) => {
  let query = supabase.from('role_appearance_rules').select('*');
  if (facilityId) query = query.eq('facility_id', facilityId);
  
  const { data, error } = await query;
  if (error) throw new Error(`Rol görünüm kuralları yüklenemedi: ${error.message}`);
  
  return (data || []).map(row => ({
    id: row.id,
    facilityId: row.facility_id,
    roleType: row.role_type,
    tierOverride: row.tier_override,
    customBadge: row.custom_badge,
    highlightColor: row.highlight_color
  }));
};

export const fbSaveRoleAppearanceRule = async (rule: any) => {
  const mapped = {
    id: rule.id,
    facility_id: rule.facilityId,
    role_type: rule.roleType,
    tier_override: rule.tierOverride,
    custom_badge: rule.customBadge,
    highlight_color: rule.highlightColor
  };
  const { error } = await supabase.from('role_appearance_rules').upsert(mapped);
  if (error) throw new Error(`Rol görünüm kuralları kaydedilemedi: ${error.message}`);
};

export const fbGetCRMUsers = async (facilityId?: string) => {
  let query = supabase.from('crm_users').select('*');
  if (facilityId) query = query.eq('facility_id', facilityId);
  
  const { data, error } = await query;
  if (error) throw new Error(`CRM kullanıcıları yüklenemedi: ${error.message}`);
  
  return (data || []).map(row => ({
    id: row.id,
    facilityId: row.facility_id,
    userId: row.user_id,
    name: row.name,
    avatar: row.avatar,
    role: row.role,
    loyaltyScore: row.loyalty_score,
    totalSpent: row.total_spent,
    isVip: row.is_vip,
    isBanned: row.is_banned,
    customNote: row.custom_note,
    lastVisit: row.last_visit
  }));
};

export const fbAddCRMUser = async (user: any) => {
  const mapped = {
    id: user.id,
    facility_id: user.facilityId,
    user_id: user.userId,
    name: user.name,
    avatar: user.avatar,
    role: user.role,
    loyalty_score: user.loyaltyScore,
    total_spent: user.totalSpent,
    is_vip: user.isVip,
    is_banned: user.isBanned,
    custom_note: user.customNote,
    last_visit: user.lastVisit
  };
  const { error } = await supabase.from('crm_users').insert(mapped);
  if (error) throw new Error(`CRM kullanıcısı eklenemedi: ${error.message}`);
};

export const fbUpdateCRMUser = async (user: any) => {
  const mapped = {
    facility_id: user.facilityId,
    user_id: user.userId,
    name: user.name,
    avatar: user.avatar,
    role: user.role,
    loyalty_score: user.loyaltyScore,
    total_spent: user.totalSpent,
    is_vip: user.isVip,
    is_banned: user.isBanned,
    custom_note: user.customNote,
    last_visit: user.lastVisit
  };
  const { error } = await supabase.from('crm_users').update(mapped).eq('id', user.id);
  if (error) throw new Error(`CRM kullanıcısı güncellenemedi: ${error.message}`);
};

export const fbDeleteCRMUser = async (id: string) => {
  const { error } = await supabase.from('crm_users').delete().eq('id', id);
  if (error) throw new Error(`CRM kullanıcısı silinemedi: ${error.message}`);
};

