import { supabase } from '../supabaseClient';
import { auth } from '../supabaseAuth';

// ─── FAZ 7.2 — In-app Bildirim Merkezi (gerçek DB + realtime) ────────────────

export interface AppNotification {
  id: string;
  userId: string;
  title: string;
  body: string | null;
  payload: any | null;
  isRead: boolean;
  createdAt: string;
  typeKey: string | null;
  matchId: string | null;
  teamId: string | null;
  senderId: string | null;
  deepLink: string | null;
  actionRequired: boolean;
}

const mapNotification = (r: any): AppNotification => ({
  id: r.id,
  userId: r.user_id,
  title: r.title ?? '',
  body: r.body ?? null,
  payload: r.payload ?? null,
  isRead: r.is_read ?? false,
  createdAt: r.created_at,
  typeKey: r.type_key ?? null,
  matchId: r.match_id ?? null,
  teamId: r.team_id ?? null,
  senderId: r.sender_id ?? null,
  deepLink: r.deep_link ?? null,
  actionRequired: r.action_required ?? false,
});

/** Kullanıcının son bildirimlerini getir (yeniden eskiye). */
export const fetchNotifications = async (limit = 50): Promise<AppNotification[]> => {
  const uid = auth.currentUser?.uid;
  if (!uid) return [];

  const { data, error } = await supabase
    .from('notifications')
    .select('*')
    .eq('user_id', uid)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    console.warn('[notification] bildirimler okunamadı:', error.message);
    throw new Error('Bildirimler yüklenemedi.');
  }
  return (data ?? []).map(mapNotification);
};

/** Tek bir bildirimi okundu işaretle. */
export const markNotificationRead = async (id: string): Promise<void> => {
  const { error } = await supabase
    .from('notifications')
    .update({ is_read: true })
    .eq('id', id);
  if (error) console.warn('[notification] okundu işaretlenemedi:', error.message);
};

/** Kullanıcının tüm bildirimlerini okundu işaretle. */
export const markAllNotificationsRead = async (): Promise<void> => {
  const uid = auth.currentUser?.uid;
  if (!uid) return;
  const { error } = await supabase
    .from('notifications')
    .update({ is_read: true })
    .eq('user_id', uid)
    .eq('is_read', false);
  if (error) console.warn('[notification] toplu okundu işaretlenemedi:', error.message);
};

/**
 * Kullanıcıya gelen yeni bildirimlere realtime abone ol.
 * @returns aboneliği iptal eden fonksiyon.
 */
export const subscribeToNotifications = (
  onInsert: (n: AppNotification) => void,
): (() => void) => {
  const uid = auth.currentUser?.uid;
  if (!uid) return () => {};

  const channel = supabase
    .channel(`notif:${uid}`)
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${uid}` },
      (payload) => onInsert(mapNotification(payload.new)),
    )
    .subscribe();

  return () => { void supabase.removeChannel(channel); };
};
