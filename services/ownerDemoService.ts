// Demo tesis yönetimi — tek DB kaydı, purge edilebilir.
// Satış demosu ve geliştirme deneyimi için.

import { supabase } from '../supabaseClient';
import { toTurkishError } from './pitchOwnerService';

export const DEMO_PITCH_ID = 'd1111111-1111-4111-8111-111111111111';

export async function seedOwnerDemo(): Promise<string> {
  const { data, error } = await supabase.rpc('seed_owner_demo');
  if (error) throw new Error(toTurkishError(error));
  return (data as string) ?? DEMO_PITCH_ID;
}

export async function purgeOwnerDemo(): Promise<void> {
  const { error } = await supabase.rpc('purge_owner_demo');
  if (error) throw new Error(toTurkishError(error));
}

export async function getOwnerDemoPitchId(): Promise<string | null> {
  try {
    const { data, error } = await supabase.rpc('get_owner_demo_pitch_id');
    if (!error && data) return data as string;
  } catch {
    /* RPC yoksa tablo sorgusuna düş */
  }
  try {
    const { data, error } = await supabase
      .from('pitches')
      .select('id')
      .eq('is_demo', true)
      .limit(1)
      .maybeSingle();
    if (error) {
      console.warn('Demo tesis sorgusu:', error.message);
      return null;
    }
    return (data as { id: string } | null)?.id ?? null;
  } catch (err) {
    console.warn('Demo tesis sorgusu:', err);
    return null;
  }
}

/** Demo verisi mevcut mu? */
export async function isOwnerDemoAvailable(): Promise<boolean> {
  const id = await getOwnerDemoPitchId();
  return !!id;
}
