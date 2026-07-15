/**
 * Tesis içerik yaşam döngüsü (Karar #4, #21, #23, #28):
 * ad/konum değişikliği onay akışı, yayına al/gizle, öne çıkarma, kalite notu onayı.
 */
import { supabase } from '../supabaseClient';
import { auth } from '../supabaseAuth';
import { toTurkishError } from './pitchOwnerService';

export interface PitchIdentityChanges {
  name?: string;
  city?: string;
  district?: string;
  address?: string;
  latitude?: number;
  longitude?: number;
}

export interface PitchChangeRequest {
  id: string;
  pitch_id: string;
  requested_by: string | null;
  changes: PitchIdentityChanges;
  status: 'pending' | 'approved' | 'rejected';
  review_note: string | null;
  created_at: string;
  pitches?: { name: string | null } | null;
}

const logAudit = async (pitchId: string, action: string, detail: Record<string, unknown> = {}) => {
  try {
    await supabase.from('pitch_content_audit').insert({
      pitch_id: pitchId,
      actor_id: auth.currentUser?.uid ?? null,
      action,
      detail,
    });
  } catch (e) {
    console.warn('pitch_content_audit yazılamadı:', e);
  }
};

/** Owner: onaylı tesiste ad/konum değişikliği talebi açar (admin onaylayınca uygulanır). */
export async function submitPitchIdentityChange(
  pitchId: string,
  changes: PitchIdentityChanges,
): Promise<void> {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error('Giriş yapmalısınız.');
  const cleaned = Object.fromEntries(
    Object.entries(changes).filter(([, v]) => v !== undefined && v !== null && v !== ''),
  );
  if (Object.keys(cleaned).length === 0) return;
  const { error } = await supabase.from('pitch_change_requests').insert({
    pitch_id: pitchId,
    requested_by: uid,
    changes: cleaned,
  });
  if (error) throw new Error(toTurkishError(error));
  void logAudit(pitchId, 'change_request_submitted', { changes: cleaned });
}

export async function fetchPendingChangeRequests(pitchId?: string): Promise<PitchChangeRequest[]> {
  let q = supabase
    .from('pitch_change_requests')
    .select('*, pitches(name)')
    .eq('status', 'pending')
    .order('created_at', { ascending: true });
  if (pitchId) q = q.eq('pitch_id', pitchId);
  const { data, error } = await q;
  if (error) throw new Error(toTurkishError(error));
  return (data ?? []) as unknown as PitchChangeRequest[];
}

/** Admin: talebi karara bağlar; onayda değişiklikler tesise uygulanır (SECURITY DEFINER RPC). */
export async function reviewPitchChangeRequest(
  requestId: string,
  approve: boolean,
  note?: string,
): Promise<void> {
  const { error } = await supabase.rpc('review_pitch_change_request', {
    p_request_id: requestId,
    p_approve: approve,
    p_note: note ?? null,
  });
  if (error) throw new Error(toTurkishError(error));
}

/** Owner: vitrinde göster/gizle (doğrulama durumundan bağımsız, Karar #28). */
export async function setPitchPublished(pitchId: string, published: boolean): Promise<void> {
  const { error } = await supabase
    .from('pitches')
    .update({ is_published: published })
    .eq('id', pitchId);
  if (error) throw new Error(toTurkishError(error));
  void logAudit(pitchId, 'publish_toggle', { is_published: published });
}

/**
 * Admin: vitrin rozet bayrakları (Öne Çıkan / flash izni / müsaitlik rozeti).
 * DB'de protect_pitch_admin_flags trigger'ı bu üç kolonu admin dışı her yola
 * karşı kilitler; bu yüzden yazım admin_update_pitch RPC'sinden (is_platform_admin
 * guard + admin_audit_log) geçer — düz .update() trigger'a takılırdı.
 */
export type PitchShowcaseFlags = Partial<{
  is_featured: boolean;
  flash_deals_enabled: boolean;
  show_availability_badge: boolean;
}>;

export async function setPitchShowcaseFlags(pitchId: string, flags: PitchShowcaseFlags): Promise<void> {
  const { error } = await supabase.rpc('admin_update_pitch', {
    p_pitch_id: pitchId,
    p_payload: flags,
  });
  if (error) throw new Error(toTurkishError(error));
}

/** Admin: "Öne Çıkan" bayrağı (Karar #23). Geriye dönük uyum sarmalayıcısı. */
export async function setPitchFeatured(pitchId: string, featured: boolean): Promise<void> {
  await setPitchShowcaseFlags(pitchId, { is_featured: featured });
}

/** Admin: owner'ın beyan ettiği kalite notlarını onaylar (Karar #2). */
export async function approveCourtGrades(courtId: string): Promise<void> {
  const { error } = await supabase
    .from('courts')
    .update({ grades_status: 'approved' })
    .eq('id', courtId);
  if (error) throw new Error(toTurkishError(error));
}
