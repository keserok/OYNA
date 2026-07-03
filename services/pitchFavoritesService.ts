/**
 * Kalıcı saha favorileri (Karar #3): pitch_favorites tablosu, RLS ile kullanıcıya özel.
 */
import { supabase } from '../supabaseClient';
import { auth } from '../supabaseAuth';

export async function fetchMyFavoritePitchIds(): Promise<Set<string>> {
  const uid = auth.currentUser?.uid;
  if (!uid) return new Set();
  const { data, error } = await supabase
    .from('pitch_favorites')
    .select('pitch_id')
    .eq('user_id', uid);
  if (error) {
    console.error('fetchMyFavoritePitchIds:', error);
    return new Set();
  }
  return new Set((data ?? []).map((r) => r.pitch_id as string));
}

/** Favoriyi ekler/çıkarır; yeni durumu döner (true = favoride). */
export async function togglePitchFavorite(pitchId: string, currentlyFavorite: boolean): Promise<boolean> {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error('Favorilere eklemek için giriş yapmalısınız.');
  if (currentlyFavorite) {
    const { error } = await supabase
      .from('pitch_favorites')
      .delete()
      .eq('user_id', uid)
      .eq('pitch_id', pitchId);
    if (error) throw error;
    return false;
  }
  const { error } = await supabase
    .from('pitch_favorites')
    .upsert({ user_id: uid, pitch_id: pitchId }, { onConflict: 'user_id,pitch_id' });
  if (error) throw error;
  return true;
}
