// ═══════════════════════════════════════════════════════════════════════════
// OYNA — Player Seek Service
// "Top Oyna / Takıma Katıl" akışı:
//   • Kaptan ilan açar (player_seek_ads)
//   • Oyuncular başvurur (player_seek_applications)
//   • Kaptan kabul/red verir
//   • Kabul edilince DB trigger sohbet açar + bildirim gönderir
// ═══════════════════════════════════════════════════════════════════════════

import { supabase } from '../supabaseClient';
import type { PlayerSeekAnnouncement } from '../types';

// ─── DB ↔ Frontend Map ─────────────────────────────────────────────────────

interface PlayerSeekAdRow {
  id: string;
  creator_id: string;
  creator_name: string;
  creator_avatar: string | null;
  pitch_id: string | null;
  pitch_name: string;
  match_date: string | null;
  match_time: string | null;
  positions_needed: string[];
  difficulty: 'Ciddi' | 'Taktiksel' | 'Rahat';
  format: string;
  duration: string;
  gender: string;
  age_group: string;
  status: 'ACTIVE' | 'CLOSED' | 'EXPIRED';
  created_at: string;
  expires_at: string;
}

const rowToAd = (row: PlayerSeekAdRow): PlayerSeekAnnouncement => ({
  id: row.id,
  creatorId: row.creator_id,
  creatorName: row.creator_name,
  creatorAvatar: row.creator_avatar ?? '',
  pitchName: row.pitch_name,
  date: row.match_date ?? '',
  time: row.match_time ?? '',
  positionsNeeded: row.positions_needed,
  difficulty: row.difficulty,
  format: row.format,
  duration: row.duration,
  gender: row.gender,
  ageGroup: row.age_group,
  status: row.status === 'EXPIRED' ? 'CLOSED' : row.status,
  joinedPlayers: [],
  acceptedPlayers: [],
  createdAt: row.created_at,
});

// ─── 1. Aktif İlanları Listele ─────────────────────────────────────────────

export interface ListAdsResult {
  ads: PlayerSeekAnnouncement[];
  myApplications: Map<string, 'PENDING' | 'ACCEPTED' | 'REJECTED' | 'WITHDRAWN'>;
}

export const listActiveAds = async (currentUserId: string | null): Promise<ListAdsResult> => {
  const { data: adsRows, error: adsErr } = await supabase
    .from('player_seek_ads')
    .select('*')
    .eq('status', 'ACTIVE')
    .gt('expires_at', new Date().toISOString())
    .order('created_at', { ascending: false });

  if (adsErr) {
    console.error('[playerSeekService] listActiveAds error:', adsErr);
    return { ads: [], myApplications: new Map() };
  }

  const ads = (adsRows ?? []).map(rowToAd);

  // Mevcut kullanıcının başvuru durumu
  const myApplications = new Map<string, 'PENDING' | 'ACCEPTED' | 'REJECTED' | 'WITHDRAWN'>();
  if (currentUserId && ads.length > 0) {
    const adIds = ads.map((a) => a.id);
    const { data: appsRows } = await supabase
      .from('player_seek_applications')
      .select('ad_id, status')
      .eq('applicant_id', currentUserId)
      .in('ad_id', adIds);
    (appsRows ?? []).forEach((r: any) => myApplications.set(r.ad_id, r.status));
  }

  return { ads, myApplications };
};

// ─── 2. İlan Oluştur ───────────────────────────────────────────────────────

export interface CreateAdInput {
  creator_id: string;
  creator_name: string;
  creator_avatar?: string;
  pitch_id?: string;
  pitch_name: string;
  match_date?: string;
  match_time?: string;
  positions_needed: string[];
  difficulty: 'Ciddi' | 'Taktiksel' | 'Rahat';
  format: string;
  duration: string;
  gender: string;
  age_group: string;
}

export const createAd = async (input: CreateAdInput): Promise<PlayerSeekAnnouncement | null> => {
  const { data, error } = await supabase
    .from('player_seek_ads')
    .insert({
      creator_id: input.creator_id,
      creator_name: input.creator_name,
      creator_avatar: input.creator_avatar ?? null,
      pitch_id: input.pitch_id ?? null,
      pitch_name: input.pitch_name,
      match_date: input.match_date ?? null,
      match_time: input.match_time ?? null,
      positions_needed: input.positions_needed,
      difficulty: input.difficulty,
      format: input.format,
      duration: input.duration,
      gender: input.gender,
      age_group: input.age_group,
    })
    .select()
    .single();

  if (error) {
    console.error('[playerSeekService] createAd error:', error);
    return null;
  }
  return rowToAd(data as PlayerSeekAdRow);
};

// ─── 3. Başvuru Gönder (Oyuncu → Kaptanın ilanına) ─────────────────────────

export interface ApplyResult {
  success: boolean;
  applicationId?: string;
  error?: string;
}

export const applyToAd = async (
  adId: string,
  applicant: { id: string; name: string; avatar?: string }
): Promise<ApplyResult> => {
  const { data, error } = await supabase
    .from('player_seek_applications')
    .insert({
      ad_id: adId,
      applicant_id: applicant.id,
      applicant_name: applicant.name,
      applicant_avatar: applicant.avatar ?? null,
      status: 'PENDING',
    })
    .select()
    .single();

  if (error) {
    if (error.code === '23505') {
      return { success: false, error: 'Bu ilana zaten başvurdunuz.' };
    }
    console.error('[playerSeekService] applyToAd error:', error);
    return { success: false, error: error.message };
  }

  // Kaptana bildirim gönder (oyuncu başvurusu var)
  const { data: adData } = await supabase
    .from('player_seek_ads')
    .select('creator_id, creator_name')
    .eq('id', adId)
    .single();

  if (adData) {
    await supabase.from('notifications').insert({
      user_id: adData.creator_id,
      title: 'Yeni Oyuncu Başvurusu ⚽',
      body: `${applicant.name} maçına katılmak istiyor.`,
      type_key: 'player_seek_application',
      action_required: true,
      payload: { ad_id: adId, application_id: data.id, applicant_id: applicant.id },
    });
  }

  return { success: true, applicationId: data.id as string };
};

// ─── 4. Başvuruları Listele (Kaptan kendi ilanı için) ──────────────────────

export interface ApplicationRow {
  id: string;
  ad_id: string;
  applicant_id: string;
  applicant_name: string | null;
  applicant_avatar: string | null;
  status: 'PENDING' | 'ACCEPTED' | 'REJECTED' | 'WITHDRAWN';
  applied_at: string;
  decided_at: string | null;
}

export const listApplicationsForAd = async (adId: string): Promise<ApplicationRow[]> => {
  const { data, error } = await supabase
    .from('player_seek_applications')
    .select('*')
    .eq('ad_id', adId)
    .order('applied_at', { ascending: false });

  if (error) {
    console.error('[playerSeekService] listApplicationsForAd error:', error);
    return [];
  }
  return (data ?? []) as ApplicationRow[];
};

// ─── 5. Başvuru Karar (Kabul / Red) ────────────────────────────────────────
// Trigger conversations satırı oluşturur ve bildirim atar — burada sadece status değişir.

export interface DecisionResult {
  success: boolean;
  conversationId?: string;
  error?: string;
}

export const acceptApplication = async (applicationId: string): Promise<DecisionResult> => {
  const { data, error } = await supabase
    .from('player_seek_applications')
    .update({ status: 'ACCEPTED', decided_at: new Date().toISOString() })
    .eq('id', applicationId)
    .select('id, ad_id')
    .single();

  if (error) {
    console.error('[playerSeekService] acceptApplication error:', error);
    return { success: false, error: error.message };
  }

  // Trigger conversation oluşturdu — id'yi çekelim
  const { data: conv } = await supabase
    .from('conversations')
    .select('id')
    .eq('type', 'PLAYER_SEEK')
    .eq('context_id', applicationId)
    .maybeSingle();

  return { success: true, conversationId: conv?.id };
};

export const rejectApplication = async (applicationId: string): Promise<boolean> => {
  const { error } = await supabase
    .from('player_seek_applications')
    .update({ status: 'REJECTED', decided_at: new Date().toISOString() })
    .eq('id', applicationId);

  if (error) {
    console.error('[playerSeekService] rejectApplication error:', error);
    return false;
  }
  return true;
};

export const withdrawApplication = async (applicationId: string): Promise<boolean> => {
  const { error } = await supabase
    .from('player_seek_applications')
    .update({ status: 'WITHDRAWN', decided_at: new Date().toISOString() })
    .eq('id', applicationId);
  if (error) {
    console.error('[playerSeekService] withdrawApplication error:', error);
    return false;
  }
  return true;
};

// ─── 6. İlanı kapat (Kaptan) ───────────────────────────────────────────────

export const closeAd = async (adId: string): Promise<boolean> => {
  const { error } = await supabase
    .from('player_seek_ads')
    .update({ status: 'CLOSED' })
    .eq('id', adId);
  if (error) {
    console.error('[playerSeekService] closeAd error:', error);
    return false;
  }
  return true;
};

// ─── 7. Realtime: Yeni ilanları ve başvuruları dinle ───────────────────────

export const subscribeToActiveAds = (onChange: () => void): (() => void) => {
  const channel = supabase
    .channel('public:player_seek_ads')
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'player_seek_ads' },
      () => onChange()
    )
    .subscribe();
  return () => {
    supabase.removeChannel(channel);
  };
};

export const subscribeToMyApplications = (userId: string, onChange: () => void): (() => void) => {
  const channel = supabase
    .channel(`applications:${userId}`)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'player_seek_applications', filter: `applicant_id=eq.${userId}` },
      () => onChange()
    )
    .subscribe();
  return () => {
    supabase.removeChannel(channel);
  };
};
