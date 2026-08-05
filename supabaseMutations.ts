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
  
  if (pitch.coordinates !== undefined) {
    mapped.latitude = pitch.coordinates.lat;
    mapped.longitude = pitch.coordinates.lng;
  }
  return mapped;
};

const mapProviderToDb = (obj: Record<string, unknown>) => {
  if (!obj) return obj;
  const mapped: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value === undefined) continue;
    mapped[key] = value;
  }
  return mapped;
};

const mapMatchToDb = (match: any) => {
  if (!match) return match;
  const mapped: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(match)) {
    if (value === undefined) continue;
    mapped[key] = value;
  }
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
  // wallet_balance yazılmaz: bakiye düzeltmesi ledger'lı admin_adjust_wallet_balance
  // RPC'sinden geçer — bayat değerle eşzamanlı cüzdan hareketini ezme riski kapandı.
  // NOT: profiles tablosunda 'stats' kolonu yok. Gerçek kolonlara yaz (F4).
  if (user.matchCount !== undefined) mapped.match_count = user.matchCount;
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

// Ban/doğrulama: doğrudan profiles UPDATE yerine SECURITY DEFINER RPC —
// sunucu tarafı admin yetki kontrolü + admin_audit_log kaydı (bkz.
// supabase/migrations/20260815000000_admin_ban_verify_rpcs.sql).
export const fbBanUser = async (id: string, isBanned: boolean) => {
  const { error } = await supabase.rpc('admin_ban_user', {
    p_target_id: id,
    p_is_banned: isBanned,
    p_reason: isBanned ? 'Admin tarafından engellendi' : 'Ban kaldırıldı',
  });
  if (error) throw new Error(`Ban işlemi başarısız: ${error.message}`);
};

export const fbVerifyUser = async (id: string) => {
  const { error } = await supabase.rpc('admin_verify_user', {
    p_target_id: id,
    p_status: 'approved',
  });
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
  // F6: Raw INSERT yerine RPC — is_platform_admin() guard + denetim logu
  const mapped = mapProviderToDb(gk as unknown as Record<string, unknown>);
  const { error } = await supabase.rpc('admin_create_goalkeeper', { p_data: mapped });
  if (error) throw new Error(`Kaleci eklenemedi: ${error.message}`);
};

export const fbUpdateGoalkeeper = async (gk: Goalkeeper) => {
  const mapped = mapProviderToDb(gk as unknown as Record<string, unknown>);
  delete mapped.id;
  const { error } = await supabase.from('goalkeepers').update(mapped).eq('id', gk.id);
  if (error) throw new Error(`Kaleci güncellenemedi: ${error.message}`);
};

export const fbDeleteGoalkeeper = async (id: string) => {
  const { error } = await supabase.from('goalkeepers').delete().eq('id', id);
  if (error) throw new Error(`Kaleci silinemedi: ${error.message}`);
};

export const fbAddReferee = async (ref: Referee) => {
  // F6: Raw INSERT yerine RPC — is_platform_admin() guard + denetim logu
  const mapped = mapProviderToDb(ref as unknown as Record<string, unknown>);
  const { error } = await supabase.rpc('admin_create_referee', { p_data: mapped });
  if (error) throw new Error(`Hakem eklenemedi: ${error.message}`);
};

export const fbUpdateReferee = async (ref: Referee) => {
  const mapped = mapProviderToDb(ref as unknown as Record<string, unknown>);
  delete mapped.id;
  const { error } = await supabase.from('referees').update(mapped).eq('id', ref.id);
  if (error) throw new Error(`Hakem güncellenemedi: ${error.message}`);
};

export const fbDeleteReferee = async (id: string) => {
  const { error } = await supabase.from('referees').delete().eq('id', id);
  if (error) throw new Error(`Hakem silinemedi: ${error.message}`);
};

export const fbUpdateAppSettings = async (settings: any) => {
  const { error } = await supabase.from('settings').update(settings).eq('id', 'main');
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

export const fbUpdateUserLocation = async (_userId: string, lat: number, lng: number) => {
  // Faz 0: earthdistance/JSONB tabanlı set_user_location — konumu YALNIZ giriş yapan
  // kullanıcı için (auth.uid()) yazar. Eski update_user_location (PostGIS ST_GeomFromText)
  // canlıda kurulu olmadığı için her çağrıda hata veriyordu; artık düzeltildi.
  const { error } = await supabase.rpc('set_user_location', {
    p_lat: lat,
    p_lng: lng,
  });

  if (error) {
    return { success: false, error: error.message };
  }
  return { success: true };
};

export const fbDeleteUser = async (id: string) => {
  const { error } = await supabase.from('profiles').delete().eq('id', id);
  if (error) throw new Error(`Kullanıcı silinemedi: ${error.message}`);
};

export const fbGetAppSettings = async () => {
  const { data, error } = await supabase.from('settings').select('*').eq('id', 'main').maybeSingle();
  if (error) throw new Error(`Ayarlar yüklenemedi: ${error.message}`);
  return data;
};

export const fbGetAdminProfiles = async () => {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, full_name, email, phone, avatar_url, role, roles, match_count, is_verified, is_banned, wallet_balance, ban_expires_at, created_at')
    .order('created_at', { ascending: false })
    .limit(500);
  if (error) throw new Error(`Kullanıcılar yüklenemedi: ${error.message}`);
  return data || [];
};

export const mapFromSnakeCase = (obj: any) => {
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
    else if (key === 'lighting_grade') newKey = 'lightingGrade';
    else if (key === 'grass_grade') newKey = 'grassGrade';
    else if (key === 'locker_room_grade') newKey = 'lockerRoomGrade';
    else if (key === 'owner_id') newKey = 'ownerId';
    else if (key === 'pricing_policy') newKey = 'pricingPolicy';
    // Maç süresi (E6): kartlar ve maç kuralları GERÇEK veriden beslenir.
    // Eşlenmezse `durationMinutes` undefined kalır ve kart süreyi hiç gösteremez
    // (ya da daha kötüsü serbest metin `duration`a düşerdi).
    else if (key === 'duration_minutes') newKey = 'durationMinutes';
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

// NOT (C3 — ölçek koruması): Bu fonksiyonlar uygulama açılışında (store.initApp)
// her kullanıcı için çağrılıyor. Sınırsız `select('*')` tabloyu büyüdükçe komple
// indirir. Sahalar ve takımlar için güvenli üst sınır konur — çünkü kullanıcının
// KENDİ sahaları/takımları AYRI scoped sorgulardan gelir (fbGetOwnerPitches /
// TeamService.fetchMyTeams), dolayısıyla limit kullanıcı verisini gizlemez.
const PITCHES_MAX = 2000;
const TEAMS_MAX = 2000;

/**
 * [YUK-2] VERİ TUTARSIZLIĞINA DAYANIKLILIK — kabul edilebilir "il" değerleri.
 *
 * SORUN (canlıda ölçüldü, 2026-08-05): `pitches` tablosunda ilin İLÇE ADIYLA
 * yazıldığı kayıtlar var. Bugün 6 sahanın 1'i böyle:
 *     "Ahmet Kuru Tesisleri" → city='Altınordu', district='Altınordu'
 * Doğrusu region_coverage'daki gibi city='Ordu', district='Altınordu' olmalıydı.
 *
 * NEDEN ÖNEMLİ: bölge daraltması düz `city='Ordu'` yazılsaydı bu saha ve ona
 * bağlı 4 maç, Ordu/Altınordu'daki kullanıcının ekranından KAYBOLURDU — yani
 * yükü azaltayım derken çalışan bir yeri bozmuş olurduk.
 *
 * ÇÖZÜM: ilçe zaten kesin eşleşiyor (tüm kayıtlarda 'Altınordu' doğru yazılmış).
 * O yüzden ilçeye TAM eşleşme aranır, il ise "gerçek il VEYA ilçe adı" olarak
 * esnetilir. İlçe eşleşmesi zorunlu kaldığı için bu esneklik başka bir ilin
 * sahasını sızdıramaz.
 *
 * BU GEÇİCİDİR: veri düzeltilirse (tek satırlık güncelleme) bu yardımcı silinip
 * düz `city` eşitliğine dönülebilir. Kurucu onayı beklediği için veriye
 * DOKUNULMADI (CLAUDE.md §3 — canlıya yazmak onaya bağlı).
 */
const ilAdaylari = (bolge: { city?: string | null; district?: string | null }): string[] =>
  [...new Set([bolge.city, bolge.district].filter((x): x is string => !!x))];

/**
 * [YUK-2] Açılışta çekilen saha listesi ARTIK BÖLGEYE DARALTILIR.
 *
 * Gerekçe (OYNA_PRENSIPLER 4.5): "Bölge de konum da yoksa ülke geneli
 * gösterilmez." Eski hâli `select('*')` ile ülke genelini indiriyordu; tavan
 * PITCHES_MAX=2000 satır ≈ 2,6 MB idi ve tek ilçedeyken bu görünmüyordu.
 *
 * Kapsam kuralı — çağıran (store.retryInitialLoad) kullanıcının birincil
 * bölgesini geçirir:
 *   • bölge + ilçe var → yalnız o ilçe
 *   • yalnız il var    → o ilin tamamı
 *   • bölge YOK        → HİÇBİR ŞEY çekilmez (boş döner). Kullanıcı önce konum
 *                        izni ya da ilçe seçimine yönlendirilir; ülke geneline
 *                        DÜŞÜLMEZ.
 *
 * Kullanıcının KENDİ sahaları bundan etkilenmez: onlar fbGetOwnerPitches ile
 * ayrı ve bölgeden bağımsız çekilir.
 */
export const fbGetPitches = async (bolge?: { city?: string | null; district?: string | null } | null) => {
  if (!bolge?.city) return [];
  let sorgu = supabase.from('pitches').select('*');
  sorgu = bolge.district
    ? sorgu.eq('district', bolge.district).in('city', ilAdaylari(bolge))
    : sorgu.eq('city', bolge.city);
  const { data, error } = await sorgu.limit(PITCHES_MAX);
  if (error) throw new Error(`Sahalar yüklenemedi: ${error.message}`);
  return (data || []).map(mapFromSnakeCase);
};

// [P-5 / M-P0-6] SINIR KONULDU — yukarıdaki eski yorumun koşulu ORTADAN KALKTI.
//
// Eski gerekçe: "matches'e GLOBAL limit KONULMAZ, çünkü useMyMatches bu listenin
// telefonda filtrelenmesinden türetiliyor; limit koyulursa kullanıcının maçı
// kaybolur (ölçek < doğruluk)."  O gerekçe O GÜN DOĞRUYDU.
//
// Artık geçerli değil, çünkü kalıcı çözüm kuruldu (Çakışma-1, kurucu onayı K-10.11):
//   • "Maçlarım"      → get_my_matches() RPC (kurucu|kaptan|kaleci|hakem|
//                        slotta oturan|satın alan|yedek) — hooks/useMyMatches
//                        İKİ KAYNAĞIN BİRLEŞİMİNİ kullanıyor, hiçbir maç kaybolmaz
//   • Keşif           → get_nearby_matches() RPC
//   • Kaleci/Hakem    → K-12.2 ile get_my_matches kapsamına alındı
//
// Bu liste artık YALNIZ admin gösterge panelindeki iki widget'ı besliyor
// (DashboardPage: eksik mevki sayısı + son 5 maç). Admin'in ASIL maç sayfası
// kendi sunucu-taraflı sayfalı sorgusunu kullanıyor (fetchMatchesAdmin).
//
// Sınır: yaklaşan/yeni maçlar önce gelsin diye starts_at'e göre azalan sırada.
//
// [YUK-2] BÖLGE DARALTMASI EKLENDİ. matches tablosunda il/ilçe kolonu YOK;
// bölge bilgisi sahadan gelir (matches.pitch_id → pitches.city/district).
// Bu yüzden daraltma gömülü `pitches!inner(...)` ile sunucu tarafında yapılır —
// iki ayrı istek yapılmaz, sahalar sorgusuyla paralel kalır.
//
// KAPSAM UYARISI: `!inner` sahasız maçı (pitch_id IS NULL) listeden düşürür.
// Bugün canlıda böyle maç yok (22/22 maçın sahası var) ve sahasız bir maç zaten
// konuma göre keşfedilemez. Kullanıcının KENDİ maçları bundan etkilenmez:
// onlar get_my_matches() ile ayrı ve bölgeden bağımsız gelir.
//
// Bölge yoksa boş döner — prensip 4.5 gereği ülke geneline düşülmez.
const MATCHES_MAX = 300;
export const fbGetMatches = async (bolge?: { city?: string | null; district?: string | null } | null) => {
  if (!bolge?.city) return [];
  let sorgu = supabase
    .from('matches')
    .select('*, pitches!inner(city, district)');
  // Aynı dayanıklılık kuralı (bkz. ilAdaylari): ilçe tam eşleşir, il esnetilir.
  sorgu = bolge.district
    ? sorgu.eq('pitches.district', bolge.district).in('pitches.city', ilAdaylari(bolge))
    : sorgu.eq('pitches.city', bolge.city);
  const { data, error } = await sorgu
    .order('starts_at', { ascending: false, nullsFirst: false })
    .limit(MATCHES_MAX);
  if (error) throw new Error(`Maçlar yüklenemedi: ${error.message}`);
  // Gömülü `pitches` alanı yalnız süzmek içindi; MatchListing şeklini bozmasın.
  return (data || []).map((satir) => {
    const { pitches: _bolgeSuzgeci, ...mac } = satir as Record<string, unknown>;
    return mapFromSnakeCase(mac);
  });
};

// [P-5 / M-P0-6] "Maçlarım" için KAPSAMLI sunucu sorgusu.
// Açılışta tüm matches tablosunu indirmeyi gereksiz kılar: kullanıcı yalnız
// kendi maçlarını çeker (kurucu | slotta oturan | slotu satın alan | yedek).
// Ölçüt get_my_matches() içinde, hooks/useMyMatches.ts ile BİREBİR aynı.
// Hata durumunda BOŞ döner (throw etmez): eski global liste yedek olarak durur,
// yani bu ekleme hiçbir maçı kaybettiremez.
export const fbGetMyMatches = async () => {
  const { data, error } = await supabase.rpc('get_my_matches');
  if (error) { console.warn('[fbGetMyMatches] scoped sorgu basarisiz:', error.message); return []; }
  return (data || []).map(mapFromSnakeCase);
};

export const fbGetTeams = async () => {
  const { data, error } = await supabase.from('teams').select('*').limit(TEAMS_MAX);
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

