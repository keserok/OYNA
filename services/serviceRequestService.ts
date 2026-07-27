import { supabase } from '../supabaseClient';
import { auth } from '../supabaseAuth';
import {
  ProviderType,
  ProviderSuggestion,
  ServiceRequest,
  ProviderApplication,
} from '../types';

// ─── Yardımcı: DB satırı (snake_case) → ServiceRequest (camelCase) ───────────
const mapServiceRequest = (r: any): ServiceRequest => ({
  id: r.id,
  matchId: r.match_id,
  providerId: r.provider_id,
  providerType: r.provider_type,
  teamSide: r.team_side ?? undefined,
  requestedBy: r.requested_by,
  fee: Number(r.fee),
  commissionAmount: Number(r.commission_amount),
  providerAmount: Number(r.provider_amount),
  requestKind: r.request_kind,
  status: r.status,
  initiatedBy: r.initiated_by ?? undefined,
  providerConfirmed: !!r.provider_confirmed,
  captainConfirmed: !!r.captain_confirmed,
  appliedAt: r.applied_at ?? undefined,
  paymentIntentId: r.payment_intent_id ?? undefined,
  payoutReleased: !!r.payout_released,
  liveStatus: r.live_status ?? 'PENDING',
  acceptedAt: r.accepted_at ?? undefined,
  capturedAt: r.captured_at ?? undefined,
  completedAt: r.completed_at ?? undefined,
  cancelledAt: r.cancelled_at ?? undefined,
  expiresAt: r.expires_at ?? undefined,
  createdAt: r.created_at,
  fundingSource: r.funding_source ?? null,
  contractAccepted: !!r.contract_accepted,
  penaltyAmount: r.penalty_amount != null ? Number(r.penalty_amount) : null,
  disputeDeadline: r.dispute_deadline ?? null,
});

// ════════════════════════════════════════════════════════════════════════════
// 5.1 — ONBOARDING: kimlik fotoğrafı yükleme + başvuru gönderme
// ════════════════════════════════════════════════════════════════════════════

/**
 * Kimlik fotoğrafını private `provider-docs` bucket'ına yükler.
 * Yol = `{uid}/id-{timestamp}.{ext}` (RLS: yalnız kullanıcı kendi klasörüne yazar).
 * @returns Yüklenen dosyanın bucket içindeki yolu (DB'ye bu yol kaydedilir).
 */
export const uploadProviderIdPhoto = async (file: File): Promise<string> => {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error('Oturum bulunamadı. Lütfen tekrar giriş yap.');

  const ext = (file.name.split('.').pop() || 'jpg').toLowerCase();
  const path = `${uid}/id-${Date.now()}.${ext}`;

  const { error } = await supabase.storage
    .from('provider-docs')
    .upload(path, file, { upsert: true, contentType: file.type || 'image/jpeg' });

  if (error) {
    console.error('[ServiceRequest] kimlik foto yükleme hatası:', error);
    throw new Error('Kimlik fotoğrafı yüklenemedi. Lütfen tekrar dene.');
  }
  return path;
};

/**
 * Kaleci/Hakem onboarding başvurusunu gönderir (admin OPERASYON onayına düşer).
 * Önkoşul: `submitServiceApplication` (serviceProviderService) ile rol+profil kurulmuş olmalı.
 */
/**
 * KC-4: Şu an BOOKINGLENEBİLİR (approved + is_available) sağlayıcı id'leri.
 * Marketplace bunları kullanıp uygun-olmayan sağlayıcıları listeden çıkarır.
 * is_available profiles'ta; goalkeepers/referees'te olmadığından RPC ile gelir.
 */
export const getAvailableProviderIds = async (type: 'GK' | 'REF'): Promise<string[]> => {
  const { data, error } = await supabase.rpc('get_available_provider_ids', { p_type: type });
  if (error) throw new Error(error.message);
  return (data as string[] | null) ?? [];
};

export const submitProviderApplication = async (params: {
  role: 'GOALKEEPER' | 'REFEREE';
  idPhotoPath: string;
  phone: string;
  intentLetter: string;
  level?: string;
}): Promise<ProviderApplication> => {
  const { data, error } = await supabase.rpc('submit_provider_application', {
    p_role: params.role,
    p_id_photo_path: params.idPhotoPath,
    p_phone: params.phone,
    p_intent_letter: params.intentLetter,
    p_level: params.level ?? null,
  });
  if (error) {
    console.error('[ServiceRequest] başvuru hatası:', error);
    throw new Error(parseRpcError(error.message) || 'Başvuru gönderilemedi.');
  }
  return data as ProviderApplication;
};

// ════════════════════════════════════════════════════════════════════════════
// 5.1 — TC KİMLİK DOĞRULAMA (anlık payout kapısı, karar 4B)
// ════════════════════════════════════════════════════════════════════════════

export const submitProviderIdentity = async (
  tcNo: string,
  fullName: string,
  birthYear?: number,
): Promise<void> => {
  const { error } = await supabase.rpc('submit_provider_identity', {
    p_tc_no: tcNo,
    p_full_name: fullName,
    p_birth_year: birthYear ?? null,
  });
  if (error) throw new Error(parseRpcError(error.message) || 'Kimlik doğrulama gönderilemedi.');
};

export const getProviderIdentityStatus = async (): Promise<
  'PENDING' | 'VERIFIED' | 'REJECTED' | null
> => {
  const uid = auth.currentUser?.uid;
  if (!uid) return null;
  const { data, error } = await supabase
    .from('provider_identities')
    .select('status')
    .eq('user_id', uid)
    .maybeSingle();
  if (error) {
    console.warn('[ServiceRequest] kimlik durumu okunamadı:', error.message);
    return null;
  }
  return (data?.status as any) ?? null;
};

// ════════════════════════════════════════════════════════════════════════════
// 5.2 — EŞLEŞTİRME + TALEP YAŞAM DÖNGÜSÜ
// ════════════════════════════════════════════════════════════════════════════

/** Maça uygun kaleci/hakemleri SIRALI öneri olarak getirir (müsait+çakışmasız+yüksek puan). */
export const findProvidersForMatch = async (
  matchId: string,
  providerType: ProviderType,
): Promise<ProviderSuggestion[]> => {
  const { data, error } = await supabase.rpc('find_providers_for_match', {
    p_match_id: matchId,
    p_provider_type: providerType,
  });
  if (error) {
    console.error('[ServiceRequest] öneri getirme hatası:', error);
    throw new Error('Uygun sağlayıcılar getirilemedi.');
  }
  return (data as ProviderSuggestion[]) ?? [];
};

/**
 * Kaptan/maç sahibi bir sağlayıcı için talep oluşturur (blokaj + komisyon hesaplanır).
 * teamSide verilmezse backend kiralayanın yetkisinden çıkarır (ev sahibi/deplasman
 * kaptanı). Lobide kaptan kendi tarafını açıkça geçirir; Marketplace geçmez (auto).
 */
export const createServiceRequest = async (
  matchId: string,
  providerId: string,
  providerType: ProviderType,
  teamSide?: 'HOME' | 'AWAY',
): Promise<{ requestId: string; intentId: string; fee: number; commission: number; providerAmount: number }> => {
  const { data, error } = await supabase.rpc('create_service_request', {
    p_match_id: matchId,
    p_provider_id: providerId,
    p_provider_type: providerType,
    p_team_side: teamSide ?? null,
  });
  if (error) throw new Error(parseRpcError(error.message) || 'Hizmet talebi oluşturulamadı.');
  if (!data) throw new Error('Hizmet talebi oluşturulamadı (beklenmeyen yanıt).');
  return {
    requestId: data.request_id,
    intentId: data.intent_id,
    fee: Number(data.fee),
    commission: Number(data.commission),
    providerAmount: Number(data.provider_amount),
  };
};

// ════════════════════════════════════════════════════════════════════════════
// 5.3 — SAĞLAYICI-BAŞLATAN BAŞVURU (kaleci/hakem maça başvurur → kaptan kabul)
//        Aynı service_requests motorunu ters yönde kullanır (escrow: blokaj →
//        capture → cüzdan → iki-taraflı onay → payout).
// ════════════════════════════════════════════════════════════════════════════

/** Kaleci/Hakem açık bir maça BAŞVURUR (status=APPLIED, para yok). */
export const applyToMatchAsProvider = async (
  matchId: string,
  providerType: ProviderType,
): Promise<{ requestId: string; fee: number; providerAmount: number }> => {
  const { data, error } = await supabase.rpc('apply_to_match_as_provider', {
    p_match_id: matchId,
    p_provider_type: providerType,
  });
  if (error) throw new Error(parseRpcError(error.message) || 'Başvuru gönderilemedi.');
  return {
    requestId: data?.request_id,
    fee: Number(data?.fee ?? 0),
    providerAmount: Number(data?.provider_amount ?? 0),
  };
};

/** Kaptan bir sağlayıcı başvurusunu KABUL eder → ücret bloke edilir (ACCEPTED). */
export const acceptProviderApplication = async (requestId: string): Promise<void> => {
  const { error } = await supabase.rpc('accept_provider_application', { p_request_id: requestId });
  if (error) throw new Error(parseRpcError(error.message) || 'Başvuru kabul edilemedi.');
};

/** Kaptan bir sağlayıcı başvurusunu reddeder. */
export const declineProviderApplication = async (requestId: string): Promise<void> => {
  const { error } = await supabase.rpc('decline_provider_application', { p_request_id: requestId });
  if (error) throw new Error(parseRpcError(error.message) || 'Başvuru reddedilemedi.');
};

/** Sağlayıcı kendi bekleyen başvurusunu geri çeker (APPLIED iken). */
export const withdrawProviderApplication = async (requestId: string): Promise<void> => {
  const { error } = await supabase.rpc('withdraw_provider_application', { p_request_id: requestId });
  if (error) throw new Error(parseRpcError(error.message) || 'Başvuru geri çekilemedi.');
};

/** Maç sonu — SAĞLAYICI "maçı oynadım" onayı (iki-taraflı payout kapısı). */
export const providerConfirmService = async (requestId: string): Promise<void> => {
  const { error } = await supabase.rpc('provider_confirm_service', { p_request_id: requestId });
  if (error) throw new Error(parseRpcError(error.message) || 'Onay kaydedilemedi.');
};

/** Maç sonu — KAPTAN "sağlayıcı geldi" onayı (iki-taraflı payout kapısı). */
export const captainConfirmService = async (requestId: string): Promise<void> => {
  const { error } = await supabase.rpc('captain_confirm_service', { p_request_id: requestId });
  if (error) throw new Error(parseRpcError(error.message) || 'Onay kaydedilemedi.');
};

/** Sağlayıcının KENDİ başvuru/talep akışı (APPLIED dahil) — ServiceDashboard "Maç Bul" durumları. */
export const getMyProviderApplications = async (): Promise<ServiceRequest[]> => {
  // getIncomingRequests ile aynı kaynak; okunabilirlik için ayrı isim.
  return getIncomingRequests();
};

/**
 * Sağlayıcı gelen talebi kabul/red eder.
 * FAZ 4: kaleci kabulünde sözleşme onayı (contractAccepted) zorunlu; ayrıca
 * kaptan ödemeyi tamamlamış (fonlanmış) + kalecinin ≥500₺ teminatı olmalı.
 */
export const respondServiceRequest = async (
  requestId: string,
  accept: boolean,
  contractAccepted = false,
): Promise<void> => {
  const { error } = await supabase.rpc('respond_service_request', {
    p_request_id: requestId,
    p_accept: accept,
    p_contract_accepted: contractAccepted,
  });
  if (error) throw new Error(parseRpcError(error.message) || 'İşlem tamamlanamadı.');
};

/**
 * FAZ 4 (M3) — Kaptan hizmet talebini fonlar (emanete alınır).
 * source='WALLET' → cüzdandan tam ödeme (bakiyeden düşülür); 'CARD' → kart pre-auth.
 * Talep ancak fonlandıktan sonra kaleci/hakem tarafından kabul edilebilir.
 */
export const fundServiceRequest = async (
  requestId: string,
  source: 'WALLET' | 'CARD' = 'WALLET',
): Promise<{ status: string; source?: string; amount?: number }> => {
  const { data, error } = await supabase.rpc('fund_service_request', {
    p_request_id: requestId,
    p_source: source,
  });
  if (error) throw new Error(parseRpcError(error.message) || 'Ödeme tamamlanamadı.');
  return { status: data?.status, source: data?.source, amount: data?.amount != null ? Number(data.amount) : undefined };
};

/**
 * FAZ 4 (M5) — Kaptan kalecinin/hakemin maça gelmediğini bildirir.
 * Kalecinin kazancı iptal + kaptana ücret iadesi + ceza (maçın slot ücreti)
 * kalecinin teminatından kaptana. 48 saat içinde kaleci itiraz edebilir.
 */
export const captainReportNoShow = async (
  requestId: string,
  note?: string,
): Promise<{ status: string; penalty: number; penaltyCharged: boolean }> => {
  const { data, error } = await supabase.rpc('captain_report_no_show', { p_request_id: requestId, p_note: note ?? null });
  if (error) throw new Error(parseRpcError(error.message) || 'No-show bildirilemedi.');
  return { status: data?.status, penalty: Number(data?.penalty ?? 0), penaltyCharged: !!data?.penalty_charged };
};

/** FAZ 4 (M5) — Sağlayıcı no-show cezasına itiraz eder (48s içinde) → admin incelemesi. */
export const providerDisputeNoShow = async (
  requestId: string,
  note?: string,
): Promise<{ status: string }> => {
  const { data, error } = await supabase.rpc('provider_dispute_no_show', { p_request_id: requestId, p_note: note ?? null });
  if (error) throw new Error(parseRpcError(error.message) || 'İtiraz gönderilemedi.');
  return { status: data?.status };
};

/** Talep eden/kaptan veya admin talebi iptal eder (tahsil edilmemişse). */
export const cancelServiceRequest = async (requestId: string): Promise<void> => {
  const { error } = await supabase.rpc('cancel_service_request', { p_request_id: requestId });
  if (error) throw new Error(parseRpcError(error.message) || 'Talep iptal edilemedi.');
};

/**
 * F3c — Sağlayıcı canlı durum bildirimi (yola çıktım / tesise vardım).
 * Sunucu kaydeder + kaptana gerçek bildirim atar; eski sürüm yalnız cihaz-yerel
 * state değiştirip "KAPTANA BİLDİRİLDİ" diyordu.
 */
export const setProviderLiveStatus = async (
  requestId: string,
  status: 'ON_THE_WAY' | 'ARRIVED' | 'FINISHED',
): Promise<void> => {
  const { error } = await supabase.rpc('provider_set_live_status', {
    p_request_id: requestId, p_status: status,
  });
  if (error) throw new Error(parseRpcError(error.message) || 'Durum bildirilemedi.');
};

/**
 * F1.7 — Sağlayıcı iş bırakma ÖNİZLEMESİ (SSOT: ceza hesabı sunucuda).
 * allowed=false → maç başlamış, bırakılamaz.
 */
export const previewProviderCancel = async (
  requestId: string,
): Promise<{ allowed: boolean; penalty: number; hoursLeft: number | null; feeTL: number; message?: string }> => {
  const { data, error } = await supabase.rpc('preview_provider_cancel', { p_request_id: requestId });
  if (error) throw new Error(parseRpcError(error.message) || 'İptal önizlemesi alınamadı.');
  return {
    allowed: !!data?.allowed,
    penalty: Number(data?.penalty ?? 0),
    hoursLeft: data?.hours_left == null ? null : Number(data.hours_left),
    feeTL: Number(data?.fee ?? 0),
    message: data?.message,
  };
};

/**
 * F1.7 — Sağlayıcı kabul edilmiş (ACCEPTED/CAPTURED) işi bırakır.
 * >24s: cezasız; sonrası ücretin %'si kadar best-effort ceza. Kaptana iade +
 * bildirim, maç kartındaki gk/hakem ataması temizliği sunucuda yapılır.
 */
export const providerCancelAssignment = async (
  requestId: string,
  reason?: string,
): Promise<{ status: string; penalty: number; penaltyCharged: boolean }> => {
  const { data, error } = await supabase.rpc('provider_cancel_assignment', {
    p_request_id: requestId, p_reason: reason ?? null,
  });
  if (error) throw new Error(parseRpcError(error.message) || 'İş bırakılamadı.');
  return { status: data?.status, penalty: Number(data?.penalty ?? 0), penaltyCharged: !!data?.penalty_charged };
};

/** Sağlayıcının gelen taleplerini getirir (ServiceDashboard). */
export const getIncomingRequests = async (): Promise<ServiceRequest[]> => {
  const uid = auth.currentUser?.uid;
  if (!uid) return [];
  const { data, error } = await supabase
    .from('service_requests')
    .select('*')
    .eq('provider_id', uid)
    .order('created_at', { ascending: false });
  if (error) {
    console.warn('[ServiceRequest] gelen talepler okunamadı:', error.message);
    return [];
  }
  return (data ?? []).map(mapServiceRequest);
};

/** Bir maçın hizmet taleplerini getirir (Maçlarım — kaleci/hakem durumu). */
export const getMatchServiceRequests = async (matchId: string): Promise<ServiceRequest[]> => {
  const { data, error } = await supabase
    .from('service_requests')
    .select('*')
    .eq('match_id', matchId)
    .order('created_at', { ascending: false });
  if (error) {
    console.warn('[ServiceRequest] maç talepleri okunamadı:', error.message);
    return [];
  }
  return (data ?? []).map(mapServiceRequest);
};

/** Sağlayıcı "Sorun Bildir" — değerlendirme yapılmadıysa admin'e ulaşır. */
export const reportServiceAttendance = async (
  requestId: string,
  note?: string,
): Promise<void> => {
  const { error } = await supabase.rpc('report_service_attendance', {
    p_request_id: requestId,
    p_note: note ?? null,
  });
  if (error) throw new Error(parseRpcError(error.message) || 'Bildirim gönderilemedi.');
};

// ════════════════════════════════════════════════════════════════════════════
// 5.2 — MAÇ SONU PUANLAMA (1-10) → katılım kanıtı + payout serbest
// ════════════════════════════════════════════════════════════════════════════

export const submitServiceRating = async (
  matchId: string,
  providerId: string,
  providerType: ProviderType,
  score: number,
  comment?: string,
): Promise<void> => {
  const { error } = await supabase.rpc('submit_service_rating', {
    p_match_id: matchId,
    p_provider_id: providerId,
    p_provider_type: providerType,
    p_score: score,
    p_comment: comment ?? null,
  });
  if (error) throw new Error(parseRpcError(error.message) || 'Puanlama kaydedilemedi.');
};

// ─── Yardımcı: RPC hata mesajını kullanıcıya gösterilecek hâle getir ─────────
// Postgres RAISE EXCEPTION iki biçimde gelir:
//   1) 'KOD: açıklama'  → açıklamayı göster
//   2) çıplak 'KOD'     → Türkçe sözlükten karşılığını göster (yoksa ham mesaj)
const BARE_ERROR_TR: Record<string, string> = {
  UNAUTHORIZED: 'Oturumun bulunamadı. Lütfen tekrar giriş yap.',
  FORBIDDEN: 'Bu işlem için yetkin yok.',
  NOT_FOUND: 'Kayıt bulunamadı.',
  INVALID_TYPE: 'Geçersiz hizmet türü.',
  INVALID_ROLE: 'Geçersiz rol.',
  NAME_REQUIRED: 'Ad soyad gerekli.',
};
function parseRpcError(message?: string): string | null {
  if (!message) return null;
  const withDesc = message.match(/[A-Z_]+:\s*(.+)$/);
  if (withDesc) return withDesc[1];
  const bare = message.match(/\b([A-Z][A-Z_]{3,})\b/);
  if (bare && BARE_ERROR_TR[bare[1]]) return BARE_ERROR_TR[bare[1]];
  return message;
}
