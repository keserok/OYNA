// ═══════════════════════════════════════════════════════════════
// OYNA APP — Bildirim Tercihleri Yönetimi
// Kullanıcının notification_preferences ayarlarını
// Supabase'den çeker, günceller ve yerel state ile senkronize eder.
// ═══════════════════════════════════════════════════════════════

import { supabase } from '../supabaseClient';
import {
  DEFAULT_NOTIFICATION_PREFERENCES,
  NotificationPreferences,
  NotificationPreferenceKey,
} from './pushService';

// ─── Bildirim Kategorileri (UI Gruplandırması) ────────────────────
export interface NotificationCategory {
  key: string;
  label: string;
  description: string;
  preferences: NotificationPreferenceKey[];
}

export const NOTIFICATION_CATEGORIES: NotificationCategory[] = [
  {
    key: 'MATCH',
    label: 'Maç Bildirimleri',
    description: 'Katıldığın maçlarla ilgili anlık güncellemeler',
    preferences: ['match_joined', 'match_cancelled', 'match_invite', 'team_invite'],
  },
  {
    key: 'STAFF',
    label: 'Kadro Bildirimleri',
    // F3i: aynı anahtarlar sağlayıcı (kaleci/hakem) tarafını da kapsar —
    // ServiceSettings artık bu ekranı kullanıyor.
    description: 'Kaleci/hakem başvuruları ve talep sonuçları',
    preferences: ['gk_accepted', 'gk_rejected', 'ref_accepted', 'ref_rejected'],
  },
  {
    key: 'REMINDER',
    label: 'Hatırlatıcılar',
    description: 'Yaklaşan maçlar için zamanında bildirim',
    preferences: ['match_reminder_1h', 'match_reminder_24h'],
  },
  {
    key: 'DISCOVERY',
    label: 'Keşif Bildirimleri',
    description: 'Konumuna yakın yeni maçlar',
    preferences: ['nearby_match'],
  },
  {
    key: 'GENERAL',
    label: 'Genel & Kampanyalar',
    description: 'Haftalık özet ve özel teklifler',
    preferences: ['weekly_summary', 'promo_offers'],
  },
];

// ─── Kullanıcının Tercihlerini Supabase'den Çek ───────────────────
export const fetchNotificationPreferences = async (
  userId: string,
): Promise<NotificationPreferences> => {
  const { data, error } = await supabase
    .from('profiles')
    .select('notification_preferences')
    .eq('id', userId)
    .single();

  if (error || !data?.notification_preferences) {
    return DEFAULT_NOTIFICATION_PREFERENCES;
  }

  // Veritabanındaki değerleri varsayılanlarla birleştir (yeni tipler eklendiyse)
  return {
    ...DEFAULT_NOTIFICATION_PREFERENCES,
    ...data.notification_preferences,
  };
};

// ─── Tek Bir Tercihi Güncelle ─────────────────────────────────────
export const updateNotificationPreference = async (
  userId: string,
  key: NotificationPreferenceKey,
  enabled: boolean,
  currentPreferences: NotificationPreferences,
): Promise<NotificationPreferences | null> => {
  // Zorunlu bildirimleri kapat
  if (currentPreferences[key]?.mandatory) {
    console.warn(`[NotifPrefs] "${key}" zorunlu bir bildirim tipidir, kapatılamaz.`);
    return null;
  }

  const updated: NotificationPreferences = {
    ...currentPreferences,
    [key]: { ...currentPreferences[key], enabled },
  };

  const { error } = await supabase
    .from('profiles')
    .update({ notification_preferences: updated })
    .eq('id', userId);

  if (error) {
    console.error('[NotifPrefs] Güncelleme hatası:', error.message);
    return null;
  }

  return updated;
};

// ─── Tüm Tercihleri Toplu Güncelle ───────────────────────────────
export const updateAllNotificationPreferences = async (
  userId: string,
  preferences: NotificationPreferences,
): Promise<boolean> => {
  // Zorunlu olanları her zaman true yap
  const safePreferences = Object.fromEntries(
    Object.entries(preferences).map(([key, pref]) => [
      key,
      pref.mandatory ? { ...pref, enabled: true } : pref,
    ]),
  ) as NotificationPreferences;

  const { error } = await supabase
    .from('profiles')
    .update({ notification_preferences: safePreferences })
    .eq('id', userId);

  if (error) {
    console.error('[NotifPrefs] Toplu güncelleme hatası:', error.message);
    return false;
  }

  return true;
};

// ─── Şablon Etiketlerini Çek (Ayarlar Ekranı İçin) ───────────────
export interface NotificationTemplateInfo {
  type_key: string;
  label_tr: string;
  is_mandatory: boolean;
  can_user_disable: boolean;
  category: string;
  sort_order: number;
}

export const fetchNotificationTemplates = async (): Promise<NotificationTemplateInfo[]> => {
  const { data, error } = await supabase
    .from('notification_templates')
    .select('type_key, label_tr, is_mandatory, can_user_disable, category, sort_order')
    .order('sort_order', { ascending: true });

  if (error || !data) return [];
  return data as NotificationTemplateInfo[];
};
