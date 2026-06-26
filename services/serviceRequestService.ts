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
  requestedBy: r.requested_by,
  fee: Number(r.fee),
  commissionAmount: Number(r.commission_amount),
  providerAmount: Number(r.provider_amount),
  requestKind: r.request_kind,
  status: r.status,
  paymentIntentId: r.payment_intent_id ?? undefined,
  payoutReleased: !!r.payout_released,
  acceptedAt: r.accepted_at ?? undefined,
  capturedAt: r.captured_at ?? undefined,
  completedAt: r.completed_at ?? undefined,
  cancelledAt: r.cancelled_at ?? undefined,
  expiresAt: r.expires_at ?? undefined,
  createdAt: r.created_at,
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

/** Kaptan/maç sahibi bir sağlayıcı için talep oluşturur (blokaj + komisyon hesaplanır). */
export const createServiceRequest = async (
  matchId: string,
  providerId: string,
  providerType: ProviderType,
): Promise<{ requestId: string; intentId: string; fee: number; commission: number; providerAmount: number }> => {
  const { data, error } = await supabase.rpc('create_service_request', {
    p_match_id: matchId,
    p_provider_id: providerId,
    p_provider_type: providerType,
  });
  if (error) throw new Error(parseRpcError(error.message) || 'Hizmet talebi oluşturulamadı.');
  return {
    requestId: data.request_id,
    intentId: data.intent_id,
    fee: Number(data.fee),
    commission: Number(data.commission),
    providerAmount: Number(data.provider_amount),
  };
};

/** Sağlayıcı gelen talebi kabul/red eder. */
export const respondServiceRequest = async (
  requestId: string,
  accept: boolean,
): Promise<void> => {
  const { error } = await supabase.rpc('respond_service_request', {
    p_request_id: requestId,
    p_accept: accept,
  });
  if (error) throw new Error(parseRpcError(error.message) || 'İşlem tamamlanamadı.');
};

/** Talep eden/kaptan veya admin talebi iptal eder (tahsil edilmemişse). */
export const cancelServiceRequest = async (requestId: string): Promise<void> => {
  const { error } = await supabase.rpc('cancel_service_request', { p_request_id: requestId });
  if (error) throw new Error(parseRpcError(error.message) || 'Talep iptal edilemedi.');
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
// Postgres RAISE EXCEPTION 'KOD: açıklama' formatından açıklamayı çıkarır.
function parseRpcError(message?: string): string | null {
  if (!message) return null;
  const m = message.match(/[A-Z_]+:\s*(.+)$/);
  return m ? m[1] : message;
}
