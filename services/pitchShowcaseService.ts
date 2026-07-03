/**
 * Vitrin analitiği ve Vitrin Skoru (Karar #17, #29).
 * recordPitchView: oyuncu detayı açınca 1 olay (oturum başına tesis başına 1 kez).
 * getPitchEngagement: owner paneli 3 metrik kartı (RLS'i SECURITY DEFINER fonksiyon aşar).
 * computeShowcaseScore: 0-100 profil tamamlanma skoru + eksik görev listesi.
 */
import { supabase } from '../supabaseClient';
import { auth } from '../supabaseAuth';
import type { OwnerPitch } from '../types';

const viewedThisSession = new Set<string>();

export async function recordPitchView(pitchId: string): Promise<void> {
  if (viewedThisSession.has(pitchId)) return;
  viewedThisSession.add(pitchId);
  if (!auth.currentUser?.uid) return; // misafir görüntülemeleri kayıt dışı (RLS gereği)
  const { error } = await supabase.from('pitch_views').insert({
    pitch_id: pitchId,
    viewer_id: auth.currentUser.uid,
  });
  if (error) console.warn('pitch_views kaydedilemedi:', error.message);
}

export interface PitchEngagement {
  views30d: number;
  favorites: number;
  appBookings30d: number;
}

export async function getPitchEngagement(pitchId: string): Promise<PitchEngagement | null> {
  const { data, error } = await supabase.rpc('get_pitch_engagement', { p_pitch_id: pitchId });
  if (error) {
    console.error('get_pitch_engagement:', error);
    return null;
  }
  const j = (data ?? {}) as Record<string, number>;
  return {
    views30d: j.views_30d ?? 0,
    favorites: j.favorites ?? 0,
    appBookings30d: j.app_bookings_30d ?? 0,
  };
}

// ── Vitrin Skoru ─────────────────────────────────────────────────────────────

export interface ShowcaseTask {
  key: string;
  label: string;
  done: boolean;
  points: number;
}

export interface ShowcaseScore {
  score: number; // 0-100
  tasks: ShowcaseTask[];
}

/**
 * Owner panelindeki skor kartı ve admin onay kontrol listesi (Karar #20) aynı
 * hesabı kullanır — iki taraf asla farklı "hazır" tanımıyla çalışmaz.
 */
export function computeShowcaseScore(pitch: Partial<OwnerPitch> & {
  images?: string[] | null;
  courts?: { is_active?: boolean | null }[] | null;
  pitch_tariffs?: { is_active?: boolean | null }[] | null;
}): ShowcaseScore {
  const imageCount = (pitch.images ?? []).length;
  const description = (pitch.description ?? '').trim();
  const amenityCount = (pitch.amenities ?? []).length;
  const activeCourts = (pitch.courts ?? []).filter((c) => c.is_active !== false);
  const activeTariffs = (pitch.pitch_tariffs ?? []).filter((t) => t.is_active !== false);
  const hasPin = pitch.latitude != null && pitch.longitude != null;

  const tasks: ShowcaseTask[] = [
    { key: 'photos', label: 'En az 3 fotoğraf yükle', done: imageCount >= 3, points: 25 },
    { key: 'description', label: 'En az 40 karakterlik açıklama yaz', done: description.length >= 40, points: 15 },
    { key: 'amenities', label: 'En az 3 tesis olanağı işaretle', done: amenityCount >= 3, points: 10 },
    { key: 'pin', label: 'Haritada konum pinini doğrula', done: hasPin, points: 20 },
    { key: 'court', label: 'En az 1 aktif kort tanımla', done: activeCourts.length > 0, points: 15 },
    { key: 'tariff', label: 'En az 1 aktif tarife tanımla', done: activeTariffs.length > 0, points: 15 },
  ];

  const score = tasks.reduce((acc, t) => acc + (t.done ? t.points : 0), 0);
  return { score, tasks };
}

/** Admin onayı için asgari vitrin şartları (Karar #20). */
export function showcaseReadyBlockers(score: ShowcaseScore): ShowcaseTask[] {
  const required = new Set(['photos', 'description', 'pin', 'court', 'tariff']);
  return score.tasks.filter((t) => required.has(t.key) && !t.done);
}
