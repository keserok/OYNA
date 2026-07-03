/**
 * Tesis/kort medya yönetimi (Karar #6-10, #24).
 * Tek doğruluk kaynağı pitch_media tablosudur; DB trigger'ı pitches.image/images
 * ve courts.images jsonb alanlarını geriye dönük uyumluluk için senkron tutar.
 * Storage yolu her zaman pitches/{pitchId}/... — path-bazlı RLS bu deseni şart koşar.
 */
import { supabase } from '../supabaseClient';
import { auth } from '../supabaseAuth';
import { compressImageForUpload } from '../utils/imageCompression';

export type PitchMediaLabel = 'saha_ici' | 'soyunma' | 'kafeterya' | 'gece' | 'dis_gorunum' | 'diger';

export interface PitchMediaItem {
  id: string;
  pitch_id: string;
  court_id: string | null;
  url: string;
  storage_path: string | null;
  label: PitchMediaLabel | null;
  sort_order: number;
  status: 'active' | 'flagged' | 'removed';
  created_at?: string;
}

export const MAX_FACILITY_PHOTOS = 12;
export const MAX_COURT_PHOTOS = 8;

export const MEDIA_LABELS: { value: PitchMediaLabel; label: string }[] = [
  { value: 'saha_ici', label: 'Saha İçi' },
  { value: 'soyunma', label: 'Soyunma' },
  { value: 'kafeterya', label: 'Kafeterya' },
  { value: 'gece', label: 'Gece Görünümü' },
  { value: 'dis_gorunum', label: 'Dış Görünüm' },
  { value: 'diger', label: 'Diğer' },
];

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

export async function fetchPitchMedia(pitchId: string, courtId?: string | null): Promise<PitchMediaItem[]> {
  let q = supabase
    .from('pitch_media')
    .select('*')
    .eq('pitch_id', pitchId)
    .eq('status', 'active')
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true });
  q = courtId === undefined ? q : courtId === null ? q.is('court_id', null) : q.eq('court_id', courtId);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as PitchMediaItem[];
}

/** Sıkıştırır, pitches/{pitchId}/ altına yükler, pitch_media satırı açar. */
export async function uploadPitchMedia(
  file: File,
  pitchId: string,
  opts: { courtId?: string | null; label?: PitchMediaLabel | null; sortOrder?: number } = {},
): Promise<PitchMediaItem> {
  const compressed = await compressImageForUpload(file);
  const ext = compressed.name.split('.').pop() || 'jpg';
  const folder = opts.courtId ? `pitches/${pitchId}/courts/${opts.courtId}` : `pitches/${pitchId}`;
  const path = `${folder}/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;

  const { error: upErr } = await supabase.storage
    .from('images')
    .upload(path, compressed, { cacheControl: '3600', upsert: false, contentType: compressed.type });
  if (upErr) throw upErr;

  const { data: urlData } = supabase.storage.from('images').getPublicUrl(path);

  const { data, error } = await supabase
    .from('pitch_media')
    .insert({
      pitch_id: pitchId,
      court_id: opts.courtId ?? null,
      url: urlData.publicUrl,
      storage_path: path,
      label: opts.label ?? null,
      sort_order: opts.sortOrder ?? 999,
      uploaded_by: auth.currentUser?.uid ?? null,
    })
    .select()
    .single();
  if (error) {
    // DB satırı açılamadıysa storage'da yetim dosya bırakma.
    await supabase.storage.from('images').remove([path]).catch(() => undefined);
    throw error;
  }
  void logAudit(pitchId, 'media_add', { media_id: data.id, court_id: opts.courtId ?? null });
  return data as PitchMediaItem;
}

/** Fotoğrafı hem tablodan hem storage'dan kaldırır (yetim dosya bırakmaz). */
export async function deletePitchMedia(item: PitchMediaItem): Promise<void> {
  const { error } = await supabase.from('pitch_media').delete().eq('id', item.id);
  if (error) throw error;
  if (item.storage_path) {
    await supabase.storage.from('images').remove([item.storage_path]).catch((e) =>
      console.warn('Storage objesi silinemedi:', e),
    );
  }
  void logAudit(item.pitch_id, 'media_remove', { media_id: item.id, url: item.url });
}

/** Verilen id sırasını kalıcılaştırır (index = sort_order). İlk foto = kapak. */
export async function reorderPitchMedia(pitchId: string, orderedIds: string[]): Promise<void> {
  for (let i = 0; i < orderedIds.length; i++) {
    const { error } = await supabase
      .from('pitch_media')
      .update({ sort_order: i })
      .eq('id', orderedIds[i]);
    if (error) throw error;
  }
  void logAudit(pitchId, 'media_reorder', { order: orderedIds });
}

export async function setPitchMediaLabel(item: PitchMediaItem, label: PitchMediaLabel | null): Promise<void> {
  const { error } = await supabase.from('pitch_media').update({ label }).eq('id', item.id);
  if (error) throw error;
}

/** Oyuncu tarafı: uygunsuz içerik bildirimi — mevcut user_reports kuyruğuna düşer (Karar #12). */
export async function reportPitchContent(
  pitchId: string,
  reason: string,
  pitchOwnerId?: string | null,
): Promise<void> {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error('Bildirim için giriş yapmalısınız.');
  const { error } = await supabase.from('user_reports').insert({
    reporter_id: uid,
    reported_id: pitchOwnerId ?? uid,
    context_type: 'PITCH_MEDIA',
    context_id: pitchId,
    reason: 'INAPPROPRIATE_CONTENT',
    note: reason,
    status: 'OPEN',
  });
  if (error) throw error;
}
